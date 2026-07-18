"use strict";

// Tomato's historical guest record is an alias of the same person, not a
// separate Daybird/Dashboard identity. Keep this mapping intentionally narrow
// so no unrelated user's "(guest)" account can be merged accidentally.
const TOMATO_ADMIN_OWNER_ID = "김_태우";
const TOMATO_ADMIN_GUEST_OWNER_ID = "김_태우(guest)";
const TOMATO_DATA_OWNER_REGISTRY_COLLECTION = "_account_data_owners";
const TOMATO_DATA_OWNER_REGISTRY_ID = "tomato_admin";
const TOMATO_DATA_OWNER_REGISTRY_VERSION = 2;
const TOMATO_DATA_OWNER_REGISTRY_STATUS = "decided";
const TOMATO_ACCOUNT_DATA_COLLECTIONS = Object.freeze([
  "workouts", "exercises", "goals", "quests", "wines", "movies", "cal_events", "cooking",
  "body_checkins", "nutrition_db", "tomato_cycles", "custom_muscles",
  "gyms", "routine_templates", "equipment_pool", "running_routes",
  "finance_benchmarks", "finance_actuals", "finance_loans", "finance_positions",
  "finance_plans", "finance_budgets", "settings",
]);

function canonicalTomatoOwnerId(ownerId) {
  const normalized = String(ownerId || "").trim();
  return normalized === TOMATO_ADMIN_GUEST_OWNER_ID ? TOMATO_ADMIN_OWNER_ID : normalized;
}

function isSharedTomatoOwner(ownerId) {
  return canonicalTomatoOwnerId(ownerId) === TOMATO_ADMIN_OWNER_ID;
}

function normalizeTomatoDataOwnerId(ownerId) {
  const normalized = String(ownerId || "").trim();
  return normalized === TOMATO_ADMIN_OWNER_ID || normalized === TOMATO_ADMIN_GUEST_OWNER_ID
    ? normalized
    : "";
}

function readTomatoDataOwnerRegistry(registry) {
  if (!registry || typeof registry !== "object") return "";
  if (Number(registry.version || 0) < TOMATO_DATA_OWNER_REGISTRY_VERSION) return "";
  if (registry.status !== TOMATO_DATA_OWNER_REGISTRY_STATUS) return "";
  return normalizeTomatoDataOwnerId(registry.ownerId);
}

async function adminTomatoNamespaceHasData(db) {
  const snapshots = await Promise.all(TOMATO_ACCOUNT_DATA_COLLECTIONS.map((collectionName) => (
    db.collection(`users/${TOMATO_ADMIN_OWNER_ID}/${collectionName}`).limit(1).get()
  )));
  // QuerySnapshot.empty is false for every real document, including documents
  // whose meaningful values are false, 0, [] or deletion tombstones.
  return snapshots.some((snapshot) => !snapshot.empty);
}

async function resolveTomatoDataOwnerId(db, ownerId) {
  const canonical = canonicalTomatoOwnerId(ownerId);
  if (!canonical || !isSharedTomatoOwner(canonical)) return canonical;

  const registryRef = db.doc(
    `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`,
  );
  const registry = await registryRef.get();
  const registeredOwnerId = readTomatoDataOwnerRegistry(registry.data());
  if (registeredOwnerId) return registeredOwnerId;

  const error = new Error("shared Tomato data owner has not been initialized by the server");
  error.code = "TOMATO_DATA_OWNER_NOT_INITIALIZED";
  throw error;
}

async function initializeTomatoDataOwnerId(db, { now = Date.now } = {}) {
  const registryRef = db.doc(
    `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`,
  );
  const registry = await registryRef.get();
  const registeredOwnerId = readTomatoDataOwnerRegistry(registry.data());
  if (registeredOwnerId) return registeredOwnerId;
  if (registry.data()) {
    throw new Error("shared Tomato data owner registry exists but is not a valid decided v2 record");
  }

  const adminHasData = await adminTomatoNamespaceHasData(db);
  const proposedOwnerId = adminHasData ? TOMATO_ADMIN_OWNER_ID : TOMATO_ADMIN_GUEST_OWNER_ID;

  return db.runTransaction(async (transaction) => {
    const latestRegistry = await transaction.get(registryRef);
    const concurrentOwnerId = readTomatoDataOwnerRegistry(latestRegistry.data());
    if (concurrentOwnerId) return concurrentOwnerId;
    if (latestRegistry.data()) {
      throw new Error("shared Tomato data owner registry changed to an invalid record");
    }

    transaction.set(registryRef, {
      ownerId: proposedOwnerId,
      version: TOMATO_DATA_OWNER_REGISTRY_VERSION,
      status: TOMATO_DATA_OWNER_REGISTRY_STATUS,
      decidedAt: now(),
      reason: adminHasData ? "admin-has-private-data" : "admin-private-namespace-empty",
    });
    return proposedOwnerId;
  });
}

function tomatoOwnerAliases(ownerId) {
  const canonical = canonicalTomatoOwnerId(ownerId);
  if (!canonical) return [];
  // Aliases are only for logical/social link recovery. Private Tomato data
  // must always go through resolveTomatoDataOwnerId() and use one owner.
  return canonical === TOMATO_ADMIN_OWNER_ID
    ? [TOMATO_ADMIN_OWNER_ID, TOMATO_ADMIN_GUEST_OWNER_ID]
    : [canonical];
}

module.exports = {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  TOMATO_ACCOUNT_DATA_COLLECTIONS,
  TOMATO_DATA_OWNER_REGISTRY_COLLECTION,
  TOMATO_DATA_OWNER_REGISTRY_ID,
  TOMATO_DATA_OWNER_REGISTRY_VERSION,
  TOMATO_DATA_OWNER_REGISTRY_STATUS,
  adminTomatoNamespaceHasData,
  canonicalTomatoOwnerId,
  isSharedTomatoOwner,
  initializeTomatoDataOwnerId,
  normalizeTomatoDataOwnerId,
  readTomatoDataOwnerRegistry,
  resolveTomatoDataOwnerId,
  tomatoOwnerAliases,
};
