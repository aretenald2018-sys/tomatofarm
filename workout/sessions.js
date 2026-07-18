// ================================================================
// workout/sessions.js — 날짜별 운동 회차 호환 레이어
// ================================================================

import { hasRunningSessionRecord, runningOnlySessionFields } from './running-model.js';

export const WORKOUT_SESSION_KEYS = Object.freeze([
  'exercises', 'cf', 'stretching', 'swimming', 'running',
  'runDistance', 'runDurationMin', 'runDurationSec', 'runMemo',
  'runSource', 'runStartedAt', 'runEndedAt', 'runRoute', 'runRouteRef', 'runRouteSummary',
  'runPlaceSummary', 'runAvgPaceSecPerKm', 'runGpsAccuracySummary',
  'cfWod', 'cfDurationMin', 'cfDurationSec', 'cfMemo',
  'stretchDuration', 'stretchMemo',
  'swimDistance', 'swimDurationMin', 'swimDurationSec', 'swimStroke', 'swimMemo',
  'workoutDuration', 'workoutTimeline', 'wine_free', 'memo', 'workoutPhoto',
  'gymId', 'pickerGymFilter', 'routineMeta', 'maxMeta',
]);

function _clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function _num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function _str(value) {
  return String(value || '').trim();
}

function _isActualWorkoutSet(set) {
  if (!set || set.setType === 'warmup') return false;
  if (set.done === true) return true;
  if (set.done === false) return false;
  return _num(set.kg) > 0 && _num(set.reps) > 0;
}

function _hasManualCardioEntry(entry) {
  const cardio = entry?.cardio;
  if (!cardio || typeof cardio !== 'object') return false;
  if (cardio.source === 'manual-cardio' || cardio.source === 'wear-running') return true;
  return ['kcal', 'distanceKm', 'speedKmh', 'laps'].some(key => _num(cardio[key]) > 0);
}

function _hasActualWorkoutEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (_hasManualCardioEntry(entry)) return true;
  if (_str(entry.note)) return true;
  return (Array.isArray(entry.sets) ? entry.sets : []).some(_isActualWorkoutSet);
}

function _hasWorkoutExerciseCard(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !!(
    _str(entry.exerciseId)
    || _str(entry.name)
    || _str(entry.exerciseName)
    || _str(entry.note)
    || _hasManualCardioEntry(entry)
  );
}

export function emptyWorkoutSession(index = 0) {
  return {
    id: `session-${index + 1}`,
    label: `${index + 1}회차`,
    exercises: [],
    cf: false,
    stretching: false,
    swimming: false,
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
    cfWod: '',
    cfDurationMin: 0,
    cfDurationSec: 0,
    cfMemo: '',
    stretchDuration: 0,
    stretchMemo: '',
    swimDistance: 0,
    swimDurationMin: 0,
    swimDurationSec: 0,
    swimStroke: '',
    swimMemo: '',
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

export function normalizeWorkoutSession(source = {}, index = 0) {
  const base = emptyWorkoutSession(index);
  const out = {
    ...base,
    id: _str(source.id) || base.id,
    label: _str(source.label) || base.label,
  };
  for (const key of WORKOUT_SESSION_KEYS) {
    if (source[key] !== undefined) out[key] = _clone(source[key]);
  }
  out.exercises = Array.isArray(out.exercises) ? out.exercises : [];
  out.cf = !!out.cf;
  out.stretching = !!out.stretching;
  out.swimming = !!out.swimming;
  out.running = !!out.running;
  out.wine_free = !!out.wine_free;
  return out;
}

export function buildLegacyWorkoutSession(day = {}, index = 0) {
  return normalizeWorkoutSession(day, index);
}

export function hasWorkoutSessionData(session = {}) {
  const s = normalizeWorkoutSession(session, 0);
  if (s.exercises.some(_hasActualWorkoutEntry)) return true;
  if (s.cf || s.stretching || s.swimming || hasRunningSessionRecord(s)) return true;
  if (_num(s.runDistance) > 0 || _num(s.runDurationMin) > 0 || _num(s.runDurationSec) > 0) return true;
  if (Array.isArray(s.runRoute) && s.runRoute.length > 0) return true;
  if (s.runRouteRef) return true;
  if (_num(s.cfDurationMin) > 0 || _num(s.cfDurationSec) > 0 || _str(s.cfWod)) return true;
  if (_num(s.stretchDuration) > 0 || _str(s.stretchMemo)) return true;
  if (_num(s.swimDistance) > 0 || _num(s.swimDurationMin) > 0 || _num(s.swimDurationSec) > 0) return true;
  if (_num(s.workoutDuration) > 0) return true;
  if (_num(s.workoutTimeline?.durationSec) > 0 || _num(s.workoutTimeline?.checkedSetCount) > 0) return true;
  if (_str(s.memo) || _str(s.runMemo) || _str(s.cfMemo) || _str(s.swimMemo)) return true;
  if (s.workoutPhoto) return true;
  return false;
}

// The bottom-sheet gym tab dot represents visible cards, not background
// metadata such as elapsed time, completion timelines, photos, or memos.
export function hasWorkoutGymCardData(session = {}) {
  const s = normalizeWorkoutSession(session, 0);
  if (s.exercises.some(_hasWorkoutExerciseCard)) return true;
  if (s.cf || _num(s.cfDurationMin) > 0 || _num(s.cfDurationSec) > 0 || _str(s.cfWod) || _str(s.cfMemo)) return true;
  if (s.stretching || _num(s.stretchDuration) > 0 || _str(s.stretchMemo)) return true;
  if (s.swimming || _num(s.swimDistance) > 0 || _num(s.swimDurationMin) > 0 || _num(s.swimDurationSec) > 0 || _str(s.swimStroke) || _str(s.swimMemo)) return true;
  return false;
}

export function getWorkoutSessions(day = {}, options = {}) {
  const minCount = Math.max(0, Number(options.minCount) || 0);
  const raw = Array.isArray(day?.workoutSessions) && day.workoutSessions.length
    ? day.workoutSessions
    : [buildLegacyWorkoutSession(day, 0)];
  const sessions = raw.map((session, index) => normalizeWorkoutSession(session, index));
  // Some older/mobile saves kept the aggregate run on the day root even when
  // workoutSessions already contained a strength entry. Preserve that run as
  // its own session instead of letting the array hide it.
  if (hasRunningSessionRecord(day) && !sessions.some(hasRunningSessionRecord)) {
    sessions.push(normalizeWorkoutSession({
      ...runningOnlySessionFields(day),
      id: `recovered-running-${sessions.length + 1}`,
      label: `${sessions.length + 1}회차`,
    }, sessions.length));
  }
  while (sessions.length < minCount) sessions.push(emptyWorkoutSession(sessions.length));
  return sessions;
}

export function workoutSessionToDayFields(session = {}) {
  const s = normalizeWorkoutSession(session, 0);
  const out = {};
  for (const key of WORKOUT_SESSION_KEYS) out[key] = _clone(s[key]);
  return out;
}

function _sumDurationMinSec(sessions, minKey, secKey) {
  const totalSec = sessions.reduce((sum, session) => {
    return sum + (_num(session[minKey]) * 60) + _num(session[secKey]);
  }, 0);
  return {
    min: Math.floor(totalSec / 60),
    sec: totalSec % 60,
  };
}

function _joinMemos(sessions, key) {
  return sessions
    .map((session, index) => {
      const memo = _str(session[key]);
      return memo ? `${index + 1}회차: ${memo}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function _aggregateWorkoutTimeline(sessions) {
  const timelines = sessions
    .map(session => session?.workoutTimeline)
    .filter(timeline => timeline && typeof timeline === 'object');
  const durationSec = sessions.reduce((sum, session) => sum + _num(session.workoutDuration), 0);
  const checkedSetCount = timelines.reduce((sum, timeline) => sum + _num(timeline.checkedSetCount), 0);
  const firsts = timelines.map(t => _num(t.firstSetCompletedAt)).filter(n => n > 0);
  const lasts = timelines.map(t => _num(t.lastSetCompletedAt)).filter(n => n > 0);
  if (durationSec <= 0 && checkedSetCount <= 0 && !firsts.length && !lasts.length) return null;
  return {
    mode: 'set-completion',
    source: 'session-aggregate',
    firstSetCompletedAt: firsts.length ? Math.min(...firsts) : null,
    lastSetCompletedAt: lasts.length ? Math.max(...lasts) : null,
    checkedSetCount,
    durationSec,
  };
}

function _aggregateRunningSessions(sessions) {
  const runs = sessions.filter(hasRunningSessionRecord);
  if (!runs.length) {
    return {
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

  const duration = _sumDurationMinSec(runs, 'runDurationMin', 'runDurationSec');
  const durationSec = duration.min * 60 + duration.sec;
  const distanceKm = runs.reduce((sum, session) => sum + _num(session.runDistance), 0);
  const startedValues = runs.map(session => _num(session.runStartedAt)).filter(value => value > 0);
  const endedValues = runs.map(session => _num(session.runEndedAt)).filter(value => value > 0);
  const pointCount = runs.reduce((sum, session) => (
    sum + Math.max(
      _num(session.runRouteSummary?.pointCount),
      Array.isArray(session.runRoute) ? session.runRoute.length : 0,
    )
  ), 0);
  const avgPaceSecPerKm = distanceKm > 0 && durationSec > 0
    ? Math.round(durationSec / distanceKm)
    : 0;

  if (runs.length === 1) {
    const run = runs[0];
    return {
      running: true,
      runDistance: distanceKm,
      runDurationMin: duration.min,
      runDurationSec: duration.sec,
      runMemo: _str(run.runMemo),
      runSource: run.runSource || 'manual',
      runStartedAt: run.runStartedAt || null,
      runEndedAt: run.runEndedAt || null,
      runRoute: _clone(run.runRoute || []),
      runRouteRef: _clone(run.runRouteRef || null),
      runRouteSummary: _clone(run.runRouteSummary || null),
      runPlaceSummary: _clone(run.runPlaceSummary || null),
      runAvgPaceSecPerKm: _num(run.runAvgPaceSecPerKm) || avgPaceSecPerKm,
      runGpsAccuracySummary: _clone(run.runGpsAccuracySummary || null),
    };
  }

  return {
    running: true,
    runDistance: distanceKm,
    runDurationMin: duration.min,
    runDurationSec: duration.sec,
    runMemo: _joinMemos(runs, 'runMemo'),
    runSource: 'session-aggregate',
    runStartedAt: startedValues.length ? Math.min(...startedValues) : null,
    runEndedAt: endedValues.length ? Math.max(...endedValues) : null,
    runRoute: [],
    runRouteRef: null,
    runRouteSummary: {
      source: 'session-aggregate',
      multiSession: true,
      activityCount: runs.length,
      pointCount,
      distanceKm,
      durationSec,
      avgPaceSecPerKm,
    },
    runPlaceSummary: null,
    runAvgPaceSecPerKm: avgPaceSecPerKm,
    runGpsAccuracySummary: null,
  };
}

export function aggregateWorkoutSessions(sessions = []) {
  const active = (Array.isArray(sessions) ? sessions : [])
    .map((session, index) => normalizeWorkoutSession(session, index))
    .filter(hasWorkoutSessionData);
  const cfDur = _sumDurationMinSec(active, 'cfDurationMin', 'cfDurationSec');
  const swimDur = _sumDurationMinSec(active, 'swimDurationMin', 'swimDurationSec');
  const firstWith = (key) => active.find(session => session[key])?.[key] ?? null;
  const running = _aggregateRunningSessions(active);
  return {
    exercises: active.flatMap(session => _clone(session.exercises || [])),
    cf: active.some(session => !!session.cf),
    stretching: active.some(session => !!session.stretching),
    swimming: active.some(session => !!session.swimming),
    ...running,
    cfWod: active.map(session => _str(session.cfWod)).filter(Boolean).join('\n'),
    cfDurationMin: cfDur.min,
    cfDurationSec: cfDur.sec,
    cfMemo: _joinMemos(active, 'cfMemo'),
    stretchDuration: active.reduce((sum, session) => sum + _num(session.stretchDuration), 0),
    stretchMemo: _joinMemos(active, 'stretchMemo'),
    swimDistance: active.reduce((sum, session) => sum + _num(session.swimDistance), 0),
    swimDurationMin: swimDur.min,
    swimDurationSec: swimDur.sec,
    swimStroke: active.map(session => _str(session.swimStroke)).filter(Boolean)[0] || '',
    swimMemo: _joinMemos(active, 'swimMemo'),
    workoutDuration: active.reduce((sum, session) => sum + _num(session.workoutDuration), 0),
    workoutTimeline: _aggregateWorkoutTimeline(active),
    wine_free: active.some(session => !!session.wine_free),
    memo: _joinMemos(active, 'memo'),
    workoutPhoto: firstWith('workoutPhoto'),
    gymId: firstWith('gymId'),
    pickerGymFilter: firstWith('pickerGymFilter'),
    routineMeta: firstWith('routineMeta'),
    maxMeta: firstWith('maxMeta'),
  };
}

export function upsertWorkoutSession(day = {}, payload = {}, sessionIndex = 0, options = {}) {
  const index = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  const minCount = Math.max(index + 1, Array.isArray(day?.workoutSessions) ? day.workoutSessions.length : 1);
  const sessions = getWorkoutSessions(day, { minCount });
  const prev = sessions[index] || emptyWorkoutSession(index);
  sessions[index] = normalizeWorkoutSession({
    ...prev,
    ...workoutSessionToDayFields(payload),
    id: prev.id || `session-${index + 1}`,
    label: prev.label || `${index + 1}회차`,
    updatedAt: options.now || Date.now(),
  }, index);
  return {
    workoutSessions: sessions,
    aggregate: aggregateWorkoutSessions(sessions),
  };
}

export function deleteWorkoutSession(day = {}, sessionIndex = 0) {
  const index = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  const sessions = getWorkoutSessions(day, { minCount: Math.max(index + 1, 1) });
  const next = sessions.filter((_, i) => i !== index)
    .map((session, i) => normalizeWorkoutSession({ ...session, label: `${i + 1}회차` }, i));
  const normalized = next.length ? next : [emptyWorkoutSession(0)];
  return {
    workoutSessions: normalized,
    aggregate: aggregateWorkoutSessions(normalized),
  };
}
