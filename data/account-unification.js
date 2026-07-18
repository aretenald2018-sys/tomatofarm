import { buildWorkoutDayUnificationPlan } from './workout-day-merge.js';

// Account ownership helpers deliberately contain no Firebase dependency so the
// same precedence rules can be exercised in tests and reused by every view.

export const ADMIN_ACCOUNT_ID = '김_태우';
export const ADMIN_GUEST_ACCOUNT_ID = '김_태우(guest)';
export const ACCOUNT_UNIFICATION_MARKER_ID = 'account_data_unification_v2';
export const ACCOUNT_UNIFICATION_VERSION = 2;

// Every user-scoped collection currently written by Tomato Farm, plus the
// legacy collections that were already copied by migrateDataToUser.
export const ACCOUNT_DATA_COLLECTIONS = Object.freeze([
  'workouts', 'exercises', 'goals', 'quests', 'wines', 'cal_events', 'cooking',
  'body_checkins', 'nutrition_db', 'tomato_cycles', 'custom_muscles',
  'gyms', 'routine_templates', 'equipment_pool',
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

// Canonical documents are authoritative. Workout days are the one exception at
// document level: their independent meal and activity domains are recovered
// without allowing an alias to replace an existing canonical domain.
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
  for (const source of [guestDocuments, legacyDocuments]) {
    for (const document of source || []) {
      if (!document?.id || canonical.has(document.id) || planned.has(document.id)) continue;
      planned.set(document.id, document);
    }
  }
  return [...planned.values()];
}
