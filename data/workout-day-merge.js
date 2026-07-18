// Pure helpers for recovering a single workout-day document from the
// canonical account and its historical aliases.  Precedence is intentionally
// domain based: an existing meal/run is authoritative, while a different
// missing domain can still be recovered from an older store.

const MEAL_GROUPS = Object.freeze([
  ['breakfast_skipped', 'breakfast', 'bKcal', 'bReason', 'bProtein', 'bCarbs', 'bFat', 'bFoods', 'bPhoto', 'bEstimateMeta'],
  ['lunch_skipped', 'lunch', 'lKcal', 'lReason', 'lProtein', 'lCarbs', 'lFat', 'lFoods', 'lPhoto', 'lEstimateMeta'],
  ['dinner_skipped', 'dinner', 'dKcal', 'dReason', 'dProtein', 'dCarbs', 'dFat', 'dFoods', 'dPhoto', 'dEstimateMeta'],
  ['snack', 'sKcal', 'sReason', 'sProtein', 'sCarbs', 'sFat', 'sFoods', 'sPhoto', 'sEstimateMeta'],
]);

const WORKOUT_GROUPS = Object.freeze({
  strength: [
    'exercises', 'workoutDuration', 'workoutTimeline', 'restBetweenSets', 'memo', 'workoutPhoto',
    'gymId', 'pickerGymFilter', 'routineMeta', 'maxMeta',
  ],
  crossfit: ['cf', 'cfWod', 'cfDurationMin', 'cfDurationSec', 'cfMemo'],
  stretching: ['stretching', 'stretchDuration', 'stretchMemo'],
  swimming: ['swimming', 'swimDistance', 'swimDurationMin', 'swimDurationSec', 'swimStroke', 'swimMemo'],
  running: [
    'running', 'runDistance', 'runDurationMin', 'runDurationSec', 'runMemo',
    'runSource', 'runStartedAt', 'runEndedAt', 'runRoute', 'runRouteRef',
    'runRouteSummary', 'runPlaceSummary', 'runAvgPaceSecPerKm', 'runGpsAccuracySummary',
  ],
  abstinence: ['wine_free'],
});

const SHARED_STATUS_KEYS = Object.freeze([
  'bOk', 'lOk', 'dOk', 'sOk',
  'lifeZoneDietActivity', 'lifeZoneWorkoutActivity', 'lifeZoneLastActivity',
]);

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function isMeaningful(value) {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(isMeaningful);
  return false;
}

function hasGroupRecord(source = {}, keys = []) {
  return keys.some(key => isMeaningful(source?.[key]));
}

function hasDomainRecord(source = {}, domain, keys = []) {
  if (domain === 'strength') {
    const timeline = source?.workoutTimeline && typeof source.workoutTimeline === 'object'
      ? source.workoutTimeline
      : null;
    return !!(
      (Array.isArray(source?.exercises) && source.exercises.length > 0)
      || Number(source?.workoutDuration) > 0
      || Number(timeline?.durationSec) > 0
      || Number(timeline?.checkedSetCount) > 0
      || isMeaningful(source?.memo)
      || isMeaningful(source?.workoutPhoto)
    );
  }
  if (domain !== 'running') return hasGroupRecord(source, keys);
  const summary = source?.runRouteSummary && typeof source.runRouteSummary === 'object'
    ? source.runRouteSummary
    : null;
  return !!(
    source?.running === true
    || Number(source?.runDistance) > 0
    || Number(source?.runDurationMin) > 0
    || Number(source?.runDurationSec) > 0
    || (Array.isArray(source?.runRoute) && source.runRoute.length > 0)
    || isMeaningful(source?.runRouteRef)
    || isMeaningful(summary)
  );
}

function copyDefinedGroup(target, source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) target[key] = clone(source[key]);
  }
}

function sessionsOf(day = {}) {
  return Array.isArray(day?.workoutSessions) ? day.workoutSessions : [];
}

function hasWorkoutDomain(day = {}, domain, keys = []) {
  return hasDomainRecord(day, domain, keys)
    || sessionsOf(day).some(session => hasDomainRecord(session, domain, keys));
}

function uniqueRecoveredSessionId(existingSessions, sourceId, domain, index) {
  const used = new Set(existingSessions.map(session => String(session?.id || '')).filter(Boolean));
  const preferred = String(sourceId || '').trim();
  if (preferred && !used.has(preferred)) return preferred;
  let suffix = Math.max(1, Number(index) + 1);
  let candidate = `recovered-${domain}-${suffix}`;
  while (used.has(candidate)) candidate = `recovered-${domain}-${++suffix}`;
  return candidate;
}

function appendMissingSessionDomain(target, incoming, domain, keys) {
  const incomingSessions = sessionsOf(incoming).filter(session => hasDomainRecord(session, domain, keys));
  if (!incomingSessions.length) return;
  const targetSessions = Array.isArray(target.workoutSessions)
    ? target.workoutSessions.map(clone)
    : [];
  for (const [index, sourceSession] of incomingSessions.entries()) {
    const recovered = {
      id: uniqueRecoveredSessionId(targetSessions, sourceSession?.id, domain, index),
      label: sourceSession?.label || `${targetSessions.length + 1}회차`,
    };
    copyDefinedGroup(recovered, sourceSession, keys);
    targetSessions.push(recovered);
  }
  target.workoutSessions = targetSessions;
}

export function mergeWorkoutDayRecords(existing = {}, incoming = {}) {
  const merged = clone(existing && typeof existing === 'object' ? existing : {}) || {};
  const source = incoming && typeof incoming === 'object' ? incoming : {};

  for (const keys of MEAL_GROUPS) {
    if (!hasGroupRecord(merged, keys) && hasGroupRecord(source, keys)) {
      copyDefinedGroup(merged, source, keys);
    }
  }

  for (const [domain, keys] of Object.entries(WORKOUT_GROUPS)) {
    if (hasWorkoutDomain(merged, domain, keys) || !hasWorkoutDomain(source, domain, keys)) continue;
    copyDefinedGroup(merged, source, keys);
    appendMissingSessionDomain(merged, source, domain, keys);
  }

  // These are status/recency hints rather than source records. Fill only truly
  // absent values; never let an alias replace the canonical state.
  for (const key of SHARED_STATUS_KEYS) {
    if (merged[key] === undefined && source[key] !== undefined) merged[key] = clone(source[key]);
  }
  return merged;
}

export function workoutDayRecordsEqual(left, right) {
  try { return JSON.stringify(left || {}) === JSON.stringify(right || {}); }
  catch { return left === right; }
}

export function buildWorkoutDayUnificationPlan({
  canonicalDocuments = [],
  guestDocuments = [],
  legacyDocuments = [],
} = {}) {
  const effective = new Map();
  const canonical = new Map();
  for (const document of canonicalDocuments || []) {
    if (!document?.id) continue;
    const normalized = { id: document.id, data: clone(document.data || {}) };
    canonical.set(document.id, normalized);
    effective.set(document.id, normalized);
  }

  const changedOrder = [];
  const changed = new Set();
  for (const source of [guestDocuments, legacyDocuments]) {
    for (const document of source || []) {
      if (!document?.id) continue;
      const current = effective.get(document.id);
      const nextData = current
        ? mergeWorkoutDayRecords(current.data, document.data)
        : clone(document.data || {});
      if (current && workoutDayRecordsEqual(current.data, nextData)) continue;
      effective.set(document.id, { id: document.id, data: nextData });
      if (!changed.has(document.id)) {
        changed.add(document.id);
        changedOrder.push(document.id);
      }
    }
  }

  return changedOrder.map(id => effective.get(id));
}

export const WORKOUT_DAY_DOMAIN_GROUPS = Object.freeze({
  meals: MEAL_GROUPS,
  workouts: WORKOUT_GROUPS,
});
