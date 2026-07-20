"use strict";

const crypto = require("crypto");

const SYNC_FIELD = "__tomatoSync";
const TOMBSTONE_COLLECTION = "__tomato_sync_tombstones";
const PEER_APP_PREFIX = "tomato-peer-sync:";

// Content documents that are shared by the two applications. Operational
// records (push tokens, notifications, quotas, analytics, and sync control
// records) intentionally stay in their originating project.
const SHARED_TOP_LEVEL_COLLECTIONS = new Set([
  "_accounts", "_chat_messages", "_cheers_custom", "_comments",
  "_friend_requests", "_guestbook", "_guild_requests", "_guilds",
  "_hero_messages", "_letters", "_likes", "_patchnotes",
  "_settings", "_tomato_gifts", "_weekly_guild_ranking", "_weekly_ranking",
]);

function parseServiceAccount(value, secretName = "TOMATO_SYNC_PEER_SERVICE_ACCOUNT") {
  const account = typeof value === "string" ? JSON.parse(value) : { ...(value || {}) };
  if (typeof account.private_key === "string") account.private_key = account.private_key.replace(/\\n/g, "\n");
  if (!account.project_id || !account.client_email || !account.private_key) {
    throw new Error(`${secretName} is incomplete`);
  }
  return account;
}

function peerFirestore(serviceAccountValue) {
  const { cert, getApps, initializeApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const account = parseServiceAccount(serviceAccountValue);
  const appName = `${PEER_APP_PREFIX}${account.project_id}`;
  const app = getApps().find(candidate => candidate.name === appName)
    || initializeApp({ credential: cert(account), projectId: account.project_id }, appName);
  return { db: getFirestore(app), projectId: account.project_id };
}

function pathHash(path) {
  return crypto.createHash("sha256").update(String(path)).digest("hex");
}

function asEpoch(value) {
  const epoch = Date.parse(String(value || ""));
  return Number.isFinite(epoch) ? epoch : 0;
}

function isVersion(value) {
  return value && typeof value === "object"
    && typeof value.sourceProject === "string"
    && typeof value.eventId === "string"
    && asEpoch(value.eventTime) > 0;
}

function compareVersion(left, right) {
  if (!isVersion(left)) return !isVersion(right) ? 0 : -1;
  if (!isVersion(right)) return 1;
  const timeDifference = asEpoch(left.eventTime) - asEpoch(right.eventTime);
  if (timeDifference) return timeDifference;
  const projectDifference = left.sourceProject.localeCompare(right.sourceProject);
  if (projectDifference) return projectDifference;
  return left.eventId.localeCompare(right.eventId);
}

function documentVersion(data) {
  return isVersion(data?.[SYNC_FIELD]) ? data[SYNC_FIELD] : null;
}

function shouldMirrorPath(path) {
  const segments = String(path || "").split("/").filter(Boolean);
  if (segments[0] === "users") return segments.length === 4 || segments.length === 6;
  return segments.length === 2 && SHARED_TOP_LEVEL_COLLECTIONS.has(segments[0]);
}

function isInternalMirrorMutation(beforeData, afterData, localProjectId, peerProjectId) {
  const beforeVersion = documentVersion(beforeData);
  const afterVersion = documentVersion(afterData);
  if (!isVersion(afterVersion) || compareVersion(beforeVersion, afterVersion) === 0) return false;
  return afterVersion.sourceProject === localProjectId || afterVersion.sourceProject === peerProjectId;
}

function eventVersion(event, sourceProjectId) {
  const eventTime = String(event?.time || "");
  if (!event?.id || !sourceProjectId || !asEpoch(eventTime)) {
    throw new Error("Firestore mirror event is missing an id, time, or source project");
  }
  return {
    sourceProject: sourceProjectId,
    eventId: String(event.id),
    eventTime,
  };
}

async function latestTargetVersion(peerDb, path) {
  const [targetSnapshot, tombstoneSnapshot] = await Promise.all([
    peerDb.doc(path).get(),
    peerDb.collection(TOMBSTONE_COLLECTION).doc(pathHash(path)).get(),
  ]);
  const document = targetSnapshot.exists ? documentVersion(targetSnapshot.data()) : null;
  const tombstone = tombstoneSnapshot.exists ? tombstoneSnapshot.data()?.version : null;
  return compareVersion(document, tombstone) >= 0 ? document : tombstone;
}

async function mirrorWrite({ sourceDb, peerDb, sourceProjectId, peerProjectId, event, path, beforeData, afterData }) {
  if (isInternalMirrorMutation(beforeData, afterData, sourceProjectId, peerProjectId)) {
    return { state: "ignored-internal" };
  }
  const version = eventVersion(event, sourceProjectId);
  const targetVersion = await latestTargetVersion(peerDb, path);
  if (compareVersion(targetVersion, version) >= 0) return { state: "ignored-stale", version: targetVersion };

  const payload = { ...(afterData || {}), [SYNC_FIELD]: version };
  const sourceRef = sourceDb.doc(path);
  const peerRef = peerDb.doc(path);
  const peerTombstoneRef = peerDb.collection(TOMBSTONE_COLLECTION).doc(pathHash(path));
  await Promise.all([
    sourceRef.set({ [SYNC_FIELD]: version }, { merge: true }),
    (async () => {
      const batch = peerDb.batch();
      batch.set(peerRef, payload);
      batch.delete(peerTombstoneRef);
      await batch.commit();
    })(),
  ]);
  return { state: "mirrored", version };
}

async function mirrorDelete({ sourceDb, peerDb, sourceProjectId, peerProjectId, event, path }) {
  const version = eventVersion(event, sourceProjectId);
  const sourceTombstoneRef = sourceDb.collection(TOMBSTONE_COLLECTION).doc(pathHash(path));
  const targetVersion = await latestTargetVersion(peerDb, path);
  if (compareVersion(targetVersion, version) >= 0) return { state: "ignored-stale", version: targetVersion };

  const tombstone = { path, version, remoteDelete: true, peerProjectId, deletedAt: Date.now() };
  await sourceTombstoneRef.set({ ...tombstone, remoteDelete: false }, { merge: true });
  const batch = peerDb.batch();
  batch.set(peerDb.collection(TOMBSTONE_COLLECTION).doc(pathHash(path)), tombstone);
  batch.delete(peerDb.doc(path));
  await batch.commit();
  return { state: "mirrored-delete", version };
}

async function isRemoteDeleteEcho(sourceDb, path, peerProjectId) {
  const snapshot = await sourceDb.collection(TOMBSTONE_COLLECTION).doc(pathHash(path)).get();
  const data = snapshot.exists ? snapshot.data() : null;
  return data?.path === path
    && data?.remoteDelete === true
    && data?.version?.sourceProject === peerProjectId;
}

function createMirrorHandler({ sourceDb, sourceProjectId, peerServiceAccountValue }) {
  if (!sourceDb || !sourceProjectId) throw new Error("sourceDb and sourceProjectId are required");
  return async (event) => {
    const before = event?.data?.before;
    const after = event?.data?.after;
    const snapshot = after?.exists ? after : before;
    const path = snapshot?.ref?.path;
    if (!path || !shouldMirrorPath(path)) return { state: "ignored-path" };

    const { db: peerDb, projectId: peerProjectId } = peerFirestore(peerServiceAccountValue());
    if (peerProjectId === sourceProjectId) throw new Error("Tomato peer sync cannot target its own Firebase project");
    if (!after?.exists) {
      if (await isRemoteDeleteEcho(sourceDb, path, peerProjectId)) return { state: "ignored-remote-delete" };
      return mirrorDelete({ sourceDb, peerDb, sourceProjectId, peerProjectId, event, path });
    }
    return mirrorWrite({
      sourceDb,
      peerDb,
      sourceProjectId,
      peerProjectId,
      event,
      path,
      beforeData: before?.exists ? before.data() : null,
      afterData: after.data(),
    });
  };
}

module.exports = {
  SHARED_TOP_LEVEL_COLLECTIONS,
  SYNC_FIELD,
  TOMBSTONE_COLLECTION,
  compareVersion,
  createMirrorHandler,
  eventVersion,
  isInternalMirrorMutation,
  pathHash,
  shouldMirrorPath,
};
