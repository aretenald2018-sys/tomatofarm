// Account ownership helpers deliberately contain no Firebase dependency so the
// same precedence rules can be exercised in tests and reused by every view.

export const ADMIN_ACCOUNT_ID = '김_태우';
export const ADMIN_GUEST_ACCOUNT_ID = '김_태우(guest)';
export const SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION = '_account_data_owners';
export const SHARED_ACCOUNT_OWNER_REGISTRY_ID = 'tomato_admin';
export const SHARED_ACCOUNT_OWNER_REGISTRY_VERSION = 2;
export const SHARED_ACCOUNT_OWNER_REGISTRY_STATUS = 'decided';
export const SHARED_ACCOUNT_OWNER_CACHE_KEY = 'tomatofarm:shared-account-data-owner:v2';
export const LEGACY_ROOT_MIGRATION_COLLECTION = '_account_data_migrations';
export const LEGACY_ROOT_MIGRATION_ID = 'tomato_legacy_root_to_shared_owner';
export const LEGACY_ROOT_MIGRATION_VERSION = 1;

// Every user-scoped collection currently written by Tomato Farm, plus the
// legacy collections that were already copied by migrateDataToUser.
export const ACCOUNT_DATA_COLLECTIONS = Object.freeze([
  'workouts', 'exercises', 'goals', 'quests', 'wines', 'movies', 'cal_events', 'cooking',
  'body_checkins', 'nutrition_db', 'tomato_cycles', 'custom_muscles',
  'gyms', 'routine_templates', 'equipment_pool', 'running_routes',
  'finance_benchmarks', 'finance_actuals', 'finance_loans', 'finance_positions',
  'finance_plans', 'finance_budgets', 'settings',
]);

export function canonicalAccountOwnerId(ownerId) {
  const normalized = String(ownerId || '').trim();
  return normalized === ADMIN_GUEST_ACCOUNT_ID ? ADMIN_ACCOUNT_ID : normalized;
}

export function isSharedAdminAccount(ownerId) {
  return canonicalAccountOwnerId(ownerId) === ADMIN_ACCOUNT_ID;
}

export function normalizeSharedAccountDataOwnerId(ownerId) {
  const normalized = String(ownerId || '').trim();
  return normalized === ADMIN_ACCOUNT_ID || normalized === ADMIN_GUEST_ACCOUNT_ID
    ? normalized
    : null;
}

export function readSharedAccountDataOwnerRegistry(registry = null) {
  if (!registry || typeof registry !== 'object') return null;
  if (Number(registry.version || 0) < SHARED_ACCOUNT_OWNER_REGISTRY_VERSION) return null;
  if (registry.status !== SHARED_ACCOUNT_OWNER_REGISTRY_STATUS) return null;
  return normalizeSharedAccountDataOwnerId(registry.ownerId);
}

// A remote registry decision is authoritative. Before that one-time decision,
// any document in users/{admin}/** counts as data, even false/0/[] tombstones.
// Only a literally empty admin namespace may select the historical guest store.
export function selectSharedAccountDataOwner({ registeredOwnerId = null, adminHasData = false } = {}) {
  return normalizeSharedAccountDataOwnerId(registeredOwnerId)
    || (adminHasData ? ADMIN_ACCOUNT_ID : ADMIN_GUEST_ACCOUNT_ID);
}

// Logical/social identity remains ADMIN_ACCOUNT_ID. Private data paths use the
// separately resolved physical owner, preventing two writable SSOTs.
export function resolveAccountDataOwnerId(ownerId, sharedAccountDataOwnerId = null) {
  const canonical = canonicalAccountOwnerId(ownerId);
  if (!canonical) return null;
  if (canonical !== ADMIN_ACCOUNT_ID) return canonical;
  return normalizeSharedAccountDataOwnerId(sharedAccountDataOwnerId);
}

export function getAccountOwnerAliases(ownerId) {
  const canonical = canonicalAccountOwnerId(ownerId);
  if (!canonical) return [];
  return canonical === ADMIN_ACCOUNT_ID
    ? [ADMIN_ACCOUNT_ID, ADMIN_GUEST_ACCOUNT_ID]
    : [canonical];
}

function documentMap(documents = []) {
  return new Map((documents || []).filter((item) => item?.id).map((item) => [item.id, item]));
}

// Legacy root migration is copy-only. The other admin alias is never a source:
// once a physical owner is selected, runtime data must come from that SSOT.
export function buildAccountUnificationPlan({
  canonicalDocuments = [],
  legacyDocuments = [],
} = {}) {
  const canonical = documentMap(canonicalDocuments);
  const planned = new Map();
  for (const document of legacyDocuments || []) {
    if (!document?.id || canonical.has(document.id) || planned.has(document.id)) continue;
    planned.set(document.id, document);
  }
  return [...planned.values()];
}
