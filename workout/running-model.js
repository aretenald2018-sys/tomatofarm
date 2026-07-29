import { toFiniteNumber as _num } from '../utils/number.js';
import {
  RUNNING_SESSION_ID,
  WORKOUT_RUNNING_SESSION_INDEX,
  normalizeWorkoutSessionIndex,
  runningWorkoutSessionId,
} from './session-policy.js';

function _clone(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return fallback; }
}

export function hasRunningSessionRecord(session = {}) {
  const summary = session?.runRouteSummary && typeof session.runRouteSummary === 'object'
    ? session.runRouteSummary
    : {};
  return !!(
    session?.running
    || _num(session?.runDistance) > 0
    || _num(session?.runDurationMin) > 0
    || _num(session?.runDurationSec) > 0
    || (Array.isArray(session?.runRoute) && session.runRoute.length > 0)
    || session?.runRouteRef
    || _num(summary.pointCount) > 0
  );
}

export function clearRunningSessionFields(session = {}) {
  return {
    ...session,
    running: false,
    runDistance: 0,
    runDurationMin: 0,
    runDurationSec: 0,
    runMemo: '',
    runSource: 'manual',
    runStartedAt: null,
    runEndedAt: null,
    runRoute: [],
    runRouteRef: null,
    runRouteSummary: null,
    runPlaceSummary: null,
    runAvgPaceSecPerKm: 0,
    runGpsAccuracySummary: null,
  };
}

export function runningOnlySessionFields(session = {}) {
  const source = session || {};
  return {
    exercises: [],
    cf: false,
    stretching: false,
    swimming: false,
    running: !!source.running,
    runDistance: source.runDistance || 0,
    runDurationMin: source.runDurationMin || 0,
    runDurationSec: source.runDurationSec || 0,
    runMemo: source.runMemo || '',
    runSource: source.runSource || 'gps',
    runStartedAt: source.runStartedAt || null,
    runEndedAt: source.runEndedAt || null,
    runRoute: Array.isArray(source.runRoute) ? _clone(source.runRoute, []) : [],
    runRouteRef: _clone(source.runRouteRef, null),
    runRouteSummary: _clone(source.runRouteSummary, null),
    runPlaceSummary: _clone(source.runPlaceSummary, null),
    runAvgPaceSecPerKm: _num(source.runAvgPaceSecPerKm),
    runGpsAccuracySummary: _clone(source.runGpsAccuracySummary, null),
    workoutDuration: 0,
    workoutTimeline: null,
    wine_free: false,
    memo: '',
    workoutPhoto: null,
    gymId: null,
    pickerGymFilter: null,
    routineMeta: null,
    maxMeta: null,
  };
}

export function findRunningSessionIndex(sessions = [], matcher = null) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (typeof matcher === 'function') {
    const exactIndex = list.findIndex((session, index) => (
      index >= WORKOUT_RUNNING_SESSION_INDEX && matcher(session, index)
    ));
    if (exactIndex >= WORKOUT_RUNNING_SESSION_INDEX) return exactIndex;
  }

  let lastRunningIndex = WORKOUT_RUNNING_SESSION_INDEX - 1;
  list.forEach((session, index) => {
    if (index >= WORKOUT_RUNNING_SESSION_INDEX && hasRunningSessionRecord(session)) {
      lastRunningIndex = Math.max(lastRunningIndex, index);
    }
  });
  return Math.max(WORKOUT_RUNNING_SESSION_INDEX, lastRunningIndex + 1);
}

export function applyRunningDataToWorkout(workout, runData = {}, options = {}) {
  if (!workout || typeof workout !== 'object') return workout;
  const sessionIndex = normalizeWorkoutSessionIndex(
    options.sessionIndex,
    WORKOUT_RUNNING_SESSION_INDEX,
  );
  const durationMin = Math.max(0, Math.floor(_num(runData.durationMin)));
  const durationSec = Math.max(0, Math.floor(_num(runData.durationSec)));
  const distance = Math.max(0, _num(runData.distance));
  const route = Array.isArray(runData.route) ? runData.route : [];
  const summaryPointCount = Math.max(0, Math.floor(_num(runData.routeSummary?.pointCount)));

  workout.sessionIndex = sessionIndex;
  workout.sessionId = options.sessionId
    || (sessionIndex === WORKOUT_RUNNING_SESSION_INDEX ? RUNNING_SESSION_ID : runningWorkoutSessionId(sessionIndex));
  workout.exercises = [];
  workout.cf = false;
  workout.stretching = false;
  workout.swimming = false;
  workout.cfData = { wod: '', durationMin: 0, durationSec: 0, memo: '' };
  workout.stretchData = { duration: 0, memo: '' };
  workout.swimData = { distance: 0, durationMin: 0, durationSec: 0, stroke: '', memo: '' };
  workout.workoutDuration = 0;
  workout.workoutTimeline = null;
  workout.wineFree = false;
  workout.currentGymId = null;
  workout.pickerGymFilter = null;
  workout.routineMeta = null;
  workout.maxMeta = null;
  workout.running = distance > 0 || durationMin > 0 || durationSec > 0 || route.length > 0 || summaryPointCount > 0;
  workout.runData = {
    distance,
    durationMin,
    durationSec,
    memo: runData.memo || '',
    source: runData.source || (route.length ? 'gps' : 'manual'),
    startedAt: runData.startedAt || null,
    endedAt: runData.endedAt || null,
    route,
    routeRef: runData.routeRef || null,
    routeSummary: runData.routeSummary || null,
    placeSummary: runData.placeSummary || null,
    avgPaceSecPerKm: _num(runData.avgPaceSecPerKm),
    gpsAccuracySummary: runData.gpsAccuracySummary || null,
  };
  return workout;
}
