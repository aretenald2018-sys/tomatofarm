"use strict";

// Promote a legacy v1 shared-owner registry record to the v2 shape the client
// requires.
//
// scripts/initialize-tomato-data-owner.js cannot do this: it refuses to touch a
// document that already exists, so a v1 record leaves the registry permanently
// stuck — present, but rejected by readSharedAccountDataOwnerRegistry() because
// it carries version 1 and no status field. The client then throws
// SHARED_DATA_OWNER_NOT_INITIALIZED and the shared account cannot boot.
//
// This script only ever *adds* the two missing fields to an existing decided
// record. It never picks an owner: if ownerId is absent or unrecognized it
// refuses, because choosing a namespace is the data-splitting bug the registry
// exists to prevent.
//
//   node scripts/promote-tomato-data-owner-v2.js            # dry run
//   node scripts/promote-tomato-data-owner-v2.js --commit   # write

const admin = require("firebase-admin");
const {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  TOMATO_DATA_OWNER_REGISTRY_COLLECTION,
  TOMATO_DATA_OWNER_REGISTRY_ID,
  readTomatoDataOwnerRegistry,
} = require("../dashboard/owner");

const TARGET_VERSION = 2;
const TARGET_STATUS = "decided";

const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");

function knownOwnerId(value) {
  const normalized = String(value || "").trim();
  return normalized === TOMATO_ADMIN_OWNER_ID || normalized === TOMATO_ADMIN_GUEST_OWNER_ID
    ? normalized
    : null;
}

async function main() {
  admin.initializeApp();
  const db = admin.firestore();
  const registryRef = db.doc(
    `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`,
  );

  const snapshot = await registryRef.get();
  const current = snapshot.data();
  if (!current) {
    throw new Error(
      "no registry document to promote; run initialize:tomato-owner first",
    );
  }

  if (readTomatoDataOwnerRegistry(current)) {
    console.log(`[promote-owner] already v${TARGET_VERSION} owner=${current.ownerId}; nothing to do`);
    return;
  }

  const ownerId = knownOwnerId(current.ownerId);
  if (!ownerId) {
    throw new Error(
      `refusing to promote: ownerId=${JSON.stringify(current.ownerId)} is not one of the two known namespaces. ` +
      "A human must decide which namespace holds the private data.",
    );
  }

  const currentVersion = Number(current.version || 0);
  if (currentVersion > TARGET_VERSION) {
    throw new Error(
      `refusing to downgrade: registry is version ${currentVersion}, target is ${TARGET_VERSION}`,
    );
  }

  console.log(`[promote-owner] found owner=${ownerId} version=${currentVersion} status=${JSON.stringify(current.status)}`);
  console.log(`[promote-owner] will set version=${TARGET_VERSION} status=${TARGET_STATUS} (ownerId unchanged)`);

  if (!commit) {
    console.log("[promote-owner] dry run; no write performed. Re-run with --commit to apply.");
    return;
  }

  // The transaction re-reads inside the write so a concurrent initializer or a
  // second run of this script cannot clobber a decision made in between.
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(registryRef);
    const data = fresh.data();
    if (!data) throw new Error("registry disappeared mid-promotion");
    if (readTomatoDataOwnerRegistry(data)) return;
    if (knownOwnerId(data.ownerId) !== ownerId) {
      throw new Error("registry ownerId changed mid-promotion; re-run the dry run");
    }
    transaction.update(registryRef, {
      version: TARGET_VERSION,
      status: TARGET_STATUS,
      promotedAt: Date.now(),
    });
  });

  const verified = readTomatoDataOwnerRegistry((await registryRef.get()).data());
  if (!verified) throw new Error("promotion wrote but the record still fails client validation");
  console.log(`[promote-owner] promoted; client now resolves owner=${verified}`);
}

main()
  .catch((error) => {
    console.error(`[promote-owner] ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
