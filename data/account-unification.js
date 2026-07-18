// Account ownership helpers deliberately contain no Firebase dependency so the
// same precedence rules can be exercised in tests and reused by every view.

export const ADMIN_ACCOUNT_ID = '김_태우';
export const ADMIN_GUEST_ACCOUNT_ID = '김_태우(guest)';
export const ACCOUNT_UNIFICATION_MARKER_ID = 'account_data_unification_v1';
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

// A canonical day can legitimately contain diet, photos, or a memo while its
// workout fields are still empty. Keep this correction deliberately narrow so
// guest workout data fills only absent workout values.
export const WORKOUT_UNIFICATION_FIELDS = Object.freeze([
  'workoutSessions',
  'exercises', 'cf', 'swimming', 'running', 'stretching',
  'runDistance', 'runDurationMin', 'runDurationSec', 'runMemo',
  'runSource', 'runStartedAt', 'runEndedAt', 'runRoute', 'runRouteRef', 'runRouteSummary',
  'runPlaceSummary', 'runAvgPaceSecPerKm', 'runGpsAccuracySummary',
  'swimDistance', 'swimDurationMin', 'swimDurationSec', 'swimStroke', 'swimMemo',
  'cfWod', 'cfDurationMin', 'cfDurationSec', 'cfMemo',
  'stretchDuration', 'stretchMemo',
  'workoutDuration', 'workoutTimeline', 'workoutPhoto',
  'gymId', 'routineMeta',
]);

export function isWorkoutUnificationFieldEmpty(value) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value === '';
  if (typeof value === 'number') return value === 0;
  if (typeof value === 'boolean') return value === false;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function buildMissingWorkoutFieldPatch(canonical = {}, guest = {}) {
  const patch = {};
  for (const field of WORKOUT_UNIFICATION_FIELDS) {
    if (isWorkoutUnificationFieldEmpty(canonical?.[field])
      && !isWorkoutUnificationFieldEmpty(guest?.[field])) {
      patch[field] = guest[field];
    }
  }
  return patch;
}

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

// Canonical documents are authoritative.  This is intentionally document-level
// rather than field-level for workouts: a diet saved in the canonical day must
// not be turned into an old guest running record by filling in stale fields.
export function buildAccountUnificationPlan({
  canonicalDocuments = [],
  guestDocuments = [],
  legacyDocuments = [],
} = {}) {
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
