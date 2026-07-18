"use strict";

// Tomato's historical guest record is an alias of the same person, not a
// separate Daybird/Dashboard identity. Keep this mapping intentionally narrow
// so no unrelated user's "(guest)" account can be merged accidentally.
const TOMATO_ADMIN_OWNER_ID = "김_태우";
const TOMATO_ADMIN_GUEST_OWNER_ID = "김_태우(guest)";

function canonicalTomatoOwnerId(ownerId) {
  const normalized = String(ownerId || "").trim();
  return normalized === TOMATO_ADMIN_GUEST_OWNER_ID ? TOMATO_ADMIN_OWNER_ID : normalized;
}

function isSharedTomatoOwner(ownerId) {
  return canonicalTomatoOwnerId(ownerId) === TOMATO_ADMIN_OWNER_ID;
}

function tomatoOwnerAliases(ownerId) {
  const canonical = canonicalTomatoOwnerId(ownerId);
  if (!canonical) return [];
  return canonical === TOMATO_ADMIN_OWNER_ID
    ? [TOMATO_ADMIN_OWNER_ID, TOMATO_ADMIN_GUEST_OWNER_ID]
    : [canonical];
}

function mergeTomatoDocuments(snapshotGroups = [], mapDocument) {
  const documents = new Map();
  for (const group of snapshotGroups) {
    for (const document of group?.docs || []) {
      // Groups are ordered canonical -> guest -> legacy root.  Do not allow an
      // old same-date document to overwrite the current canonical document.
      if (!documents.has(document.id)) documents.set(document.id, mapDocument(document));
    }
  }
  return [...documents.values()];
}

const TOMATO_MEAL_FIELDS = Object.freeze([
  [
    "breakfast_skipped", "breakfast", "bKcal", "bReason", "bProtein", "bCarbs", "bFat",
    "bFoods", "bPhoto", "bEstimateMeta",
  ],
  [
    "lunch_skipped", "lunch", "lKcal", "lReason", "lProtein", "lCarbs", "lFat",
    "lFoods", "lPhoto", "lEstimateMeta",
  ],
  [
    "dinner_skipped", "dinner", "dKcal", "dReason", "dProtein", "dCarbs", "dFat",
    "dFoods", "dPhoto", "dEstimateMeta",
  ],
  [
    "snack", "sKcal", "sReason", "sProtein", "sCarbs", "sFat",
    "sFoods", "sPhoto", "sEstimateMeta",
  ],
]);

const TOMATO_WORKOUT_GROUPS = Object.freeze({
  strength: [
    "exercises", "workoutDuration", "workoutTimeline", "restBetweenSets", "memo", "workoutPhoto",
    "gymId", "pickerGymFilter", "routineMeta", "maxMeta",
  ],
  crossfit: ["cf", "cfWod", "cfDurationMin", "cfDurationSec", "cfMemo"],
  stretching: ["stretching", "stretchDuration", "stretchMemo"],
  swimming: ["swimming", "swimDistance", "swimDurationMin", "swimDurationSec", "swimStroke", "swimMemo"],
  running: [
    "running", "runDistance", "runDurationMin", "runDurationSec", "runMemo",
    "runSource", "runStartedAt", "runEndedAt", "runRoute", "runRouteRef", "runRouteSummary",
    "runPlaceSummary", "runAvgPaceSecPerKm", "runGpsAccuracySummary",
  ],
  abstinence: ["wine_free"],
});

const TOMATO_SHARED_STATUS_FIELDS = Object.freeze([
  "bOk", "lOk", "dOk", "sOk",
  "lifeZoneDietActivity", "lifeZoneWorkoutActivity", "lifeZoneLastActivity",
]);

function hasMeaningfulValue(value) {
  if (value == null || value === false) return false;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function hasGroupRecord(source, fields) {
  return fields.some((field) => hasMeaningfulValue(source?.[field]));
}

function hasDomainRecord(source, domain, fields) {
  if (domain === "strength") {
    const timeline = source?.workoutTimeline && typeof source.workoutTimeline === "object"
      ? source.workoutTimeline
      : null;
    return !!(
      (Array.isArray(source?.exercises) && source.exercises.length > 0)
      || Number(source?.workoutDuration) > 0
      || Number(timeline?.durationSec) > 0
      || Number(timeline?.checkedSetCount) > 0
      || hasMeaningfulValue(source?.memo)
      || hasMeaningfulValue(source?.workoutPhoto)
    );
  }
  if (domain !== "running") return hasGroupRecord(source, fields);
  const summary = source?.runRouteSummary && typeof source.runRouteSummary === "object"
    ? source.runRouteSummary
    : null;
  return !!(
    source?.running === true
    || Number(source?.runDistance) > 0
    || Number(source?.runDurationMin) > 0
    || Number(source?.runDurationSec) > 0
    || (Array.isArray(source?.runRoute) && source.runRoute.length > 0)
    || hasMeaningfulValue(source?.runRouteRef)
    || hasMeaningfulValue(summary)
  );
}

function copyPresentFields(target, source, fields) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) target[field] = source[field];
  }
}

function sessionsOf(day = {}) {
  return Array.isArray(day?.workoutSessions) ? day.workoutSessions : [];
}

function hasWorkoutDomain(day, domain, fields) {
  return hasDomainRecord(day, domain, fields)
    || sessionsOf(day).some((session) => hasDomainRecord(session, domain, fields));
}

function recoveredSessionId(existingSessions, sourceId, domain, index) {
  const used = new Set(existingSessions.map((session) => String(session?.id || "")).filter(Boolean));
  const preferred = String(sourceId || "").trim();
  if (preferred && !used.has(preferred)) return preferred;
  let suffix = Math.max(1, Number(index) + 1);
  let candidate = `recovered-${domain}-${suffix}`;
  while (used.has(candidate)) candidate = `recovered-${domain}-${++suffix}`;
  return candidate;
}

function appendMissingSessionDomain(target, fallback, domain, fields) {
  const sourceSessions = sessionsOf(fallback).filter((session) => hasDomainRecord(session, domain, fields));
  if (!sourceSessions.length) return;
  const targetSessions = sessionsOf(target).map((session) => ({ ...session }));
  for (const [index, sourceSession] of sourceSessions.entries()) {
    const recovered = {
      id: recoveredSessionId(targetSessions, sourceSession?.id, domain, index),
      label: sourceSession?.label || `${targetSessions.length + 1} session`,
    };
    copyPresentFields(recovered, sourceSession, fields);
    targetSessions.push(recovered);
  }
  target.workoutSessions = targetSessions;
}

// Same-date documents may have been split between the canonical account,
// its historical guest alias, and the legacy root collection. Preserve the
// first (canonical) record independently for each user-facing domain while
// recovering only domains that record does not contain.
function mergeTomatoWorkoutDays(canonical = {}, fallback = {}) {
  const merged = { ...canonical };

  for (const fields of TOMATO_MEAL_FIELDS) {
    if (!hasGroupRecord(merged, fields) && hasGroupRecord(fallback, fields)) {
      copyPresentFields(merged, fallback, fields);
    }
  }

  for (const [domain, fields] of Object.entries(TOMATO_WORKOUT_GROUPS)) {
    if (hasWorkoutDomain(merged, domain, fields) || !hasWorkoutDomain(fallback, domain, fields)) continue;
    copyPresentFields(merged, fallback, fields);
    appendMissingSessionDomain(merged, fallback, domain, fields);
  }

  for (const field of TOMATO_SHARED_STATUS_FIELDS) {
    if (merged[field] === undefined && fallback[field] !== undefined) merged[field] = fallback[field];
  }
  return merged;
}

function mergeTomatoWorkoutDocuments(snapshotGroups = [], mapDocument) {
  const documents = new Map();
  for (const group of snapshotGroups) {
    for (const document of group?.docs || []) {
      const mapped = mapDocument(document);
      const current = documents.get(document.id);
      documents.set(document.id, current ? mergeTomatoWorkoutDays(current, mapped) : mapped);
    }
  }
  return [...documents.values()];
}

module.exports = {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  canonicalTomatoOwnerId,
  isSharedTomatoOwner,
  mergeTomatoDocuments,
  mergeTomatoWorkoutDays,
  mergeTomatoWorkoutDocuments,
  tomatoOwnerAliases,
};
