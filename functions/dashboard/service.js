"use strict";

const crypto = require("crypto");
const { cert, getApp, getApps, initializeApp } = require("firebase-admin/app");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { buildDashboardSnapshot, addDays, dateKeyAt } = require("./aggregate");
const { DEFAULT_DASHBOARD_WEIGHTS, normalizeDashboardWeights } = require("./contract");
const {
  canonicalTomatoOwnerId,
  isSharedTomatoOwner,
  mergeTomatoDocuments,
  tomatoOwnerAliases,
} = require("./owner");

const BUDGET_APP_NAME = "budget-dashboard";
const LOCK_TTL_MS = 2 * 60 * 1000;

function parseServiceAccount(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : { ...(value || {}) };
  if (typeof parsed.private_key === "string") parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("BUDGET_FIREBASE_SERVICE_ACCOUNT is incomplete");
  }
  return parsed;
}

function budgetApp(serviceAccountValue) {
  const existing = getApps().find((app) => app.name === BUDGET_APP_NAME);
  if (existing) return existing;
  const serviceAccount = parseServiceAccount(serviceAccountValue);
  return initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id }, BUDGET_APP_NAME);
}

function budgetServices(serviceAccountValue) {
  const app = budgetApp(serviceAccountValue);
  return { app, db: getFirestore(app), messaging: getMessaging(app) };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyInternalRequest(req, secret, nowEpochMs = Date.now()) {
  const timestamp = String(req.get("x-dashboard-timestamp") || "");
  const signature = String(req.get("x-dashboard-signature") || "");
  const epoch = Number(timestamp);
  if (!Number.isFinite(epoch) || Math.abs(nowEpochMs - epoch) > 5 * 60 * 1000) return false;
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString("utf8")
    : JSON.stringify(req.body || {});
  const expected = crypto.createHmac("sha256", String(secret || "")).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(signature, expected);
}

async function loadTomatoSource(tomatoDb, ownerId, nowEpochMs) {
  const canonicalOwnerId = canonicalTomatoOwnerId(ownerId);
  const todayKey = dateKeyAt(nowEpochMs);
  const startKey = addDays(todayKey, -365);
  const accountSources = await Promise.all(tomatoOwnerAliases(canonicalOwnerId).map((sourceOwnerId) => Promise.all([
    tomatoDb.collection(`users/${sourceOwnerId}/workouts`).where(FieldPath.documentId(), ">=", startKey).get(),
    tomatoDb.collection(`users/${sourceOwnerId}/settings`).get(),
    tomatoDb.collection(`users/${sourceOwnerId}/exercises`).get(),
  ])));
  const legacyRoot = isSharedTomatoOwner(canonicalOwnerId)
    ? await Promise.all([
      tomatoDb.collection("workouts").where(FieldPath.documentId(), ">=", startKey).get(),
      tomatoDb.collection("settings").get(),
      tomatoDb.collection("exercises").get(),
    ])
    : null;
  const sourceGroups = legacyRoot ? [...accountSources, legacyRoot] : accountSources;
  return {
    workouts: mergeTomatoDocuments(sourceGroups.map((group) => group[0]), (document) => ({
      id: document.id, dateKey: document.id, ...document.data(),
    })),
    settings: Object.fromEntries(mergeTomatoDocuments(sourceGroups.map((group) => group[1]), (document) => [
      document.id, document.data()?.value ?? document.data(),
    ])),
    exercises: mergeTomatoDocuments(sourceGroups.map((group) => group[2]), (document) => ({
      id: document.id, ...document.data(),
    })),
  };
}

async function loadBudgetSource(budgetDb, budgetUid, nowEpochMs) {
  const fromEpochMs = nowEpochMs - 365 * 24 * 60 * 60 * 1000;
  const from = new Date(fromEpochMs);
  const monthStartKey = `${dateKeyAt(nowEpochMs).slice(0, 7)}-01`;
  const monthStart = new Date(`${monthStartKey}T00:00:00+09:00`);
  const base = budgetDb.doc(`users/${budgetUid}`);
  const [transactionsSnap, categoriesSnap, tastingsSnap, bottlesSnap, settingsSnap, appSettingsSnap, rewardPointEntriesSnap] = await Promise.all([
    base.collection("transactions").where("occurredAt", ">=", from).get(),
    base.collection("categories").get(),
    base.collection("wine_tastings").orderBy("tastedAt", "desc").limit(100).get(),
    base.collection("wine_bottles").get(),
    base.collection("dashboard_settings").doc("config").get(),
    base.collection("settings").doc("app").get(),
    base.collection("reward_point_entries").where("usedAt", ">=", monthStart).get(),
  ]);
  return {
    transactions: transactionsSnap.docs.map((document) => ({ id: document.id, ...document.data() })),
    categories: categoriesSnap.docs.map((document) => ({ id: document.id, ...document.data() })),
    tastings: tastingsSnap.docs.map((document) => ({ id: document.id, ...document.data() })),
    bottles: bottlesSnap.docs.map((document) => ({ id: document.id, ...document.data() })),
    dashboardSettings: settingsSnap.exists ? settingsSnap.data() : { weights: DEFAULT_DASHBOARD_WEIGHTS },
    appSettings: appSettingsSnap.exists ? appSettingsSnap.data() : {},
    rewardPointEntries: rewardPointEntriesSnap.docs.map((document) => ({ id: document.id, ...document.data() })),
  };
}

async function ensureDashboardLink(budgetDb, ownerId, budgetUid) {
  if (!budgetUid) return null;
  ownerId = canonicalTomatoOwnerId(ownerId);
  const batch = budgetDb.batch();
  batch.set(budgetDb.doc(`dashboardLinks/${ownerId}`), {
    ownerId,
    budgetUid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(budgetDb.doc(`dashboardBudgetLinks/${budgetUid}`), {
    ownerId,
    budgetUid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return { ownerId, budgetUid };
}

async function queueDashboardRefresh({ tomatoDb, serviceAccountValue, ownerId, budgetUid = null, reason = "source-change", nowEpochMs = Date.now() }) {
  ownerId = canonicalTomatoOwnerId(ownerId);
  if (!ownerId) throw new Error("dashboard ownerId is required");
  const { db: budgetDb, messaging } = budgetServices(serviceAccountValue);
  if (budgetUid) await ensureDashboardLink(budgetDb, ownerId, budgetUid);
  let linkedBudgetUid = budgetUid;
  let linkedOwnerId = ownerId;
  if (!linkedBudgetUid) {
    for (const candidateOwnerId of tomatoOwnerAliases(ownerId)) {
      const linkSnap = await budgetDb.doc(`dashboardLinks/${candidateOwnerId}`).get();
      if (!linkSnap.exists || !linkSnap.data()?.budgetUid) continue;
      linkedBudgetUid = linkSnap.data().budgetUid;
      linkedOwnerId = candidateOwnerId;
      break;
    }
  }
  // Move a historical guest link forward as soon as it is used.  The old link
  // remains readable for recovery, while every new job/snapshot uses canonical.
  if (linkedBudgetUid && linkedOwnerId !== ownerId) {
    await ensureDashboardLink(budgetDb, ownerId, linkedBudgetUid);
  }
  if (!linkedBudgetUid) return { state: "unlinked", ownerId };
  const jobRef = budgetDb.doc(`dashboardJobs/${ownerId}`);
  await budgetDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    const current = snapshot.exists ? snapshot.data() : {};
    transaction.set(jobRef, {
      ownerId,
      budgetUid: linkedBudgetUid,
      requestedRevision: Number(current.requestedRevision || 0) + 1,
      reason,
      requestedAtEpochMs: nowEpochMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return processDashboardJob({ tomatoDb, budgetDb, messaging, ownerId, nowEpochMs });
}

async function claimJob(budgetDb, ownerId, lockId, nowEpochMs) {
  const jobRef = budgetDb.doc(`dashboardJobs/${ownerId}`);
  return budgetDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists) return null;
    const job = snapshot.data();
    const lockedAt = Number(job.lockedAtEpochMs || 0);
    if (job.lockId && nowEpochMs - lockedAt < LOCK_TTL_MS) return null;
    transaction.set(jobRef, { lockId, lockedAtEpochMs: nowEpochMs }, { merge: true });
    return job;
  });
}

async function releaseJob(budgetDb, ownerId, lockId, patch = {}) {
  const ref = budgetDb.doc(`dashboardJobs/${ownerId}`);
  await budgetDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.lockId !== lockId) return;
    transaction.set(ref, {
      ...patch,
      lockId: FieldValue.delete(),
      lockedAtEpochMs: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function writeSnapshot(budgetDb, budgetUid, ownerId, snapshot, sources) {
  const latestRef = budgetDb.doc(`users/${budgetUid}/dashboard/latest`);
  const revision = await budgetDb.runTransaction(async (transaction) => {
    const current = await transaction.get(latestRef);
    const nextRevision = Number(current.data()?.revision || 0) + 1;
    const next = { ...snapshot, revision: nextRevision, ownerId, budgetUid };
    transaction.set(latestRef, next);
    for (const [source, data] of Object.entries(sources)) {
      transaction.set(budgetDb.doc(`users/${budgetUid}/dashboard_sources/${source}`), {
        ...data,
        revision: nextRevision,
        generatedAtEpochMs: snapshot.generatedAtEpochMs,
      }, { merge: true });
    }
    return nextRevision;
  });
  return revision;
}

async function notifyDevices(budgetDb, messaging, budgetUid, revision) {
  const snapshot = await budgetDb.collection(`users/${budgetUid}/daybird_devices`).where("active", "==", true).get();
  const devices = snapshot.docs.map((document) => ({ document, token: document.data()?.fcmToken })).filter((row) => row.token);
  if (!devices.length) return { sent: 0, removed: 0 };
  const response = await messaging.sendEachForMulticast({
    tokens: devices.map((row) => row.token),
    data: { ownerUid: budgetUid, revision: String(revision), type: "dashboard_snapshot" },
    android: { priority: "high" },
  });
  const invalidCodes = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
  ]);
  const invalid = response.responses.map((result, index) => (
    !result.success && invalidCodes.has(result.error?.code) ? devices[index] : null
  )).filter(Boolean);
  if (invalid.length) {
    const batch = budgetDb.batch();
    invalid.forEach(({ document }) => batch.set(document.ref, { active: false, fcmToken: FieldValue.delete() }, { merge: true }));
    await batch.commit();
  }
  return { sent: response.successCount, removed: invalid.length };
}

async function processDashboardJob({ tomatoDb, budgetDb, messaging, ownerId, nowEpochMs = Date.now() }) {
  const lockId = crypto.randomUUID();
  const initial = await claimJob(budgetDb, ownerId, lockId, nowEpochMs);
  if (!initial) return { state: "queued", ownerId };
  let processedRevision = Number(initial.processedRevision || 0);
  let latestSnapshotRevision = null;
  try {
    for (let pass = 0; pass < 4; pass += 1) {
      const jobSnap = await budgetDb.doc(`dashboardJobs/${ownerId}`).get();
      const job = jobSnap.data() || initial;
      const requestedRevision = Number(job.requestedRevision || 0);
      const budgetUid = job.budgetUid;
      if (!budgetUid) throw new Error("dashboard job is missing budgetUid");
      const [tomato, budget] = await Promise.all([
        loadTomatoSource(tomatoDb, ownerId, nowEpochMs),
        loadBudgetSource(budgetDb, budgetUid, nowEpochMs),
      ]);
      const weights = normalizeDashboardWeights(budget.dashboardSettings?.weights || DEFAULT_DASHBOARD_WEIGHTS);
      const built = buildDashboardSnapshot({ tomato, budget, weights, revision: 1, nowEpochMs });
      latestSnapshotRevision = await writeSnapshot(budgetDb, budgetUid, ownerId, built, {
        tomato: { ownerId, status: "ready" },
        budget: { budgetUid, status: "ready" },
        wine: { budgetUid, status: "ready" },
      });
      processedRevision = requestedRevision;
      await budgetDb.doc(`dashboardJobs/${ownerId}`).set({
        processedRevision,
        processedAtEpochMs: nowEpochMs,
        lastSnapshotRevision: latestSnapshotRevision,
        lastError: FieldValue.delete(),
      }, { merge: true });
      await notifyDevices(budgetDb, messaging, budgetUid, latestSnapshotRevision);
      const latestJob = (await budgetDb.doc(`dashboardJobs/${ownerId}`).get()).data() || {};
      if (Number(latestJob.requestedRevision || 0) <= processedRevision) break;
    }
    await releaseJob(budgetDb, ownerId, lockId, { state: "ready" });
    const pending = (await budgetDb.doc(`dashboardJobs/${ownerId}`).get()).data() || {};
    if (Number(pending.requestedRevision || 0) > processedRevision) {
      return processDashboardJob({ tomatoDb, budgetDb, messaging, ownerId, nowEpochMs: Date.now() });
    }
    return { state: "ready", ownerId, processedRevision, snapshotRevision: latestSnapshotRevision };
  } catch (error) {
    await releaseJob(budgetDb, ownerId, lockId, {
      state: "error",
      lastError: String(error?.message || error).slice(0, 500),
      failedAtEpochMs: nowEpochMs,
    });
    throw error;
  }
}

async function refreshAllLinkedDashboards({ tomatoDb, serviceAccountValue, nowEpochMs = Date.now() }) {
  const { db: budgetDb } = budgetServices(serviceAccountValue);
  const links = await budgetDb.collection("dashboardLinks").get();
  const linkedOwners = new Map();
  for (const document of links.docs) {
    const link = document.data() || {};
    const ownerId = canonicalTomatoOwnerId(link.ownerId || document.id);
    if (!ownerId) continue;
    const candidate = {
      ownerId,
      budgetUid: link.budgetUid,
      sourceId: document.id,
      canonical: document.id === ownerId,
    };
    const current = linkedOwners.get(ownerId);
    if (!current || (candidate.canonical && !current.canonical)) linkedOwners.set(ownerId, candidate);
  }
  const results = [];
  for (const link of linkedOwners.values()) {
    results.push(await queueDashboardRefresh({
      tomatoDb,
      serviceAccountValue,
      ownerId: link.ownerId,
      budgetUid: link.budgetUid,
      reason: "daily-refresh",
      nowEpochMs,
    }).catch((error) => ({ state: "error", ownerId: link.ownerId, error: error.message })));
  }
  return results;
}

module.exports = {
  budgetServices,
  ensureDashboardLink,
  loadBudgetSource,
  loadTomatoSource,
  parseServiceAccount,
  processDashboardJob,
  queueDashboardRefresh,
  refreshAllLinkedDashboards,
  verifyInternalRequest,
};
