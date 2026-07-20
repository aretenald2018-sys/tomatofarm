"use strict";

const admin = require("firebase-admin");
const {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  TOMATO_DATA_OWNER_REGISTRY_COLLECTION,
  TOMATO_DATA_OWNER_REGISTRY_ID,
  adminTomatoNamespaceHasData,
  initializeTomatoDataOwnerId,
  readTomatoDataOwnerRegistry,
} = require("../dashboard/owner");

const args = new Set(process.argv.slice(2));
const commit = args.has("--commit");
const rulesFenced = args.has("--rules-fenced-v2");

async function main() {
  if (commit && !rulesFenced) {
    throw new Error(
      "refusing to commit: deploy the v2 rules fence first, then pass --rules-fenced-v2",
    );
  }

  admin.initializeApp();
  const db = admin.firestore();
  const registryRef = db.doc(
    `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`,
  );
  const registry = await registryRef.get();
  const existingOwnerId = readTomatoDataOwnerRegistry(registry.data());
  if (existingOwnerId) {
    console.log(`[shared-owner] already decided owner=${existingOwnerId}`);
    return;
  }
  if (registry.data()) {
    throw new Error("refusing to replace an invalid or partial shared-owner registry");
  }

  if (!commit) {
    const adminHasData = await adminTomatoNamespaceHasData(db);
    const candidate = adminHasData ? TOMATO_ADMIN_OWNER_ID : TOMATO_ADMIN_GUEST_OWNER_ID;
    console.log(`[shared-owner] dry-run candidate=${candidate}`);
    console.log("[shared-owner] no write performed; deploy the v2 rules fence before --commit");
    return;
  }

  const ownerId = await initializeTomatoDataOwnerId(db);
  console.log(`[shared-owner] committed decided v2 owner=${ownerId}`);
}

main()
  .catch((error) => {
    console.error(`[shared-owner] ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
