import { buildWorkoutDayUnificationPlan } from './workout-day-merge.js';

// Account ownership helpers deliberately contain no Firebase dependency so the
// same precedence rules can be exercised in tests and reused by every view.

// 관리 권한은 별도 계정이 가진다. 한 계정 안에서 모드를 토글하던 구조는
// 토글 하나가 곧 권한 상승이라 방어 장치를 계속 덧대야 했다. 권한은 이제
// "어느 계정으로 로그인했는가" 하나로만 결정된다.
export const ADMIN_CONSOLE_ACCOUNT_ID = '관_리자';

// 김태우 개인 계정. 과거 admin/guest 두 모드를 겸하던 계정이며, 개인 데이터의
// 물리 네임스페이스는 아래 legacy alias 와 함께 owner registry 가 결정한다.
export const PERSONAL_ACCOUNT_ID = '김_태우';
export const PERSONAL_LEGACY_ALIAS_ID = '김_태우(guest)';
export const ACCOUNT_UNIFICATION_MARKER_ID = 'account_data_unification_v2';
export const ACCOUNT_UNIFICATION_VERSION = 2;
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
  return normalized === PERSONAL_LEGACY_ALIAS_ID ? PERSONAL_ACCOUNT_ID : normalized;
}

export function isPersonalSharedAccount(ownerId) {
  return canonicalAccountOwnerId(ownerId) === PERSONAL_ACCOUNT_ID;
}

export function isAdminConsoleAccount(ownerId) {
  return String(ownerId || '').trim() === ADMIN_CONSOLE_ACCOUNT_ID;
}

export function normalizeSharedAccountDataOwnerId(ownerId) {
  const normalized = String(ownerId || '').trim();
  return normalized === PERSONAL_ACCOUNT_ID || normalized === PERSONAL_LEGACY_ALIAS_ID
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
// any document in users/{personal}/** counts as data, even false/0/[] tombstones.
// Only a literally empty personal namespace may select the historical alias store.
export function selectSharedAccountDataOwner({ registeredOwnerId = null, adminHasData = false } = {}) {
  return normalizeSharedAccountDataOwnerId(registeredOwnerId)
    || (adminHasData ? PERSONAL_ACCOUNT_ID : PERSONAL_LEGACY_ALIAS_ID);
}

// Logical/social identity remains PERSONAL_ACCOUNT_ID. Private data paths use the
// separately resolved physical owner, preventing two writable SSOTs.
export function resolveAccountDataOwnerId(ownerId, sharedAccountDataOwnerId = null) {
  const canonical = canonicalAccountOwnerId(ownerId);
  if (!canonical) return null;
  if (canonical !== PERSONAL_ACCOUNT_ID) return canonical;
  return normalizeSharedAccountDataOwnerId(sharedAccountDataOwnerId);
}

export function getAccountOwnerAliases(ownerId) {
  const canonical = canonicalAccountOwnerId(ownerId);
  if (!canonical) return [];
  return canonical === PERSONAL_ACCOUNT_ID
    ? [PERSONAL_ACCOUNT_ID, PERSONAL_LEGACY_ALIAS_ID]
    : [canonical];
}

function documentMap(documents = []) {
  return new Map((documents || []).filter((item) => item?.id).map((item) => [item.id, item]));
}

// Canonical documents are authoritative. Workout days are the one exception at
// document level: their independent meal and activity domains are recovered
// without allowing an alias to replace an existing canonical domain.
// Legacy root migration is copy-only. The other admin alias is never a source:
// once a physical owner is selected, runtime data must come from that SSOT.
export function buildAccountUnificationPlan({
  canonicalDocuments = [],
  guestDocuments = [],
  legacyDocuments = [],
  collectionName = '',
} = {}) {
  if (collectionName === 'workouts') {
    return buildWorkoutDayUnificationPlan({
      canonicalDocuments,
      guestDocuments,
      legacyDocuments,
    });
  }
  const canonical = documentMap(canonicalDocuments);
  const planned = new Map();
  for (const document of legacyDocuments || []) {
    if (!document?.id || canonical.has(document.id) || planned.has(document.id)) continue;
    planned.set(document.id, document);
  }
  return [...planned.values()];
}
