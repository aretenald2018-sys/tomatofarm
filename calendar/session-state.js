import { toFiniteNumber as _num } from '../utils/number.js';
import { parseDateKey as _parseDateKey } from '../utils/date-key.js';
import { getCache } from '../data.js';
import { deriveDietSuccessFromWorkout } from '../workout/cross-domain.js';
import { getWorkoutSessions } from '../workout/sessions.js';
import { S } from '../workout/state.js';
import { wtReplaceActiveWorkoutDraftSession } from '../workout/timers.js';

export function _clonePlain(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

export function _workoutHomeDay(key) {
  return (getCache() || {})[key] || {};
}

export function _workoutHomeSessionAt(key, sessionIndex, minCount = 1) {
  const day = _workoutHomeDay(key);
  const index = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  const sessions = getWorkoutSessions(day, { minCount: Math.max(minCount, index + 1) });
  return {
    day,
    sessions,
    index,
    session: sessions[index] || sessions[0] || {},
  };
}

export function _workoutSessionSavePayload(result) {
  return {
    ...result.aggregate,
    workoutSessions: result.workoutSessions,
  };
}

export function _isSameWorkoutStateDate(key) {
  const p = _parseDateKey(key);
  const current = S.shared?.date;
  return !!p && !!current && current.y === p.y && current.m === p.m && current.d === p.d;
}

export function _applyWorkoutHomeSessionToActiveState(session = {}, sessionIndex = 0) {
  const w = S.workout;
  const index = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  w.sessionIndex = index;
  w.sessionId = session.id || `session-${index + 1}`;
  w.exercises = _clonePlain(session.exercises || []);
  w.cf = !!session.cf;
  w.stretching = !!session.stretching;
  w.swimming = !!session.swimming;
  w.running = !!session.running;
  w.runData = {
    distance: session.runDistance || 0,
    durationMin: session.runDurationMin || 0,
    durationSec: session.runDurationSec || 0,
    memo: session.runMemo || '',
    source: session.runSource || 'manual',
    startedAt: session.runStartedAt || null,
    endedAt: session.runEndedAt || null,
    route: Array.isArray(session.runRoute) ? _clonePlain(session.runRoute) : [],
    routeRef: _clonePlain(session.runRouteRef || null),
    routeSummary: _clonePlain(session.runRouteSummary || null),
    placeSummary: _clonePlain(session.runPlaceSummary || null),
    avgPaceSecPerKm: Number(session.runAvgPaceSecPerKm) || 0,
    gpsAccuracySummary: _clonePlain(session.runGpsAccuracySummary || null),
  };
  w.cfData = {
    wod: session.cfWod || '',
    durationMin: session.cfDurationMin || 0,
    durationSec: session.cfDurationSec || 0,
    memo: session.cfMemo || '',
  };
  w.stretchData = {
    duration: session.stretchDuration || 0,
    memo: session.stretchMemo || '',
  };
  w.swimData = {
    distance: session.swimDistance || 0,
    durationMin: session.swimDurationMin || 0,
    durationSec: session.swimDurationSec || 0,
    stroke: session.swimStroke || '',
    memo: session.swimMemo || '',
  };
  w.wineFree = !!session.wine_free;
  w.workoutDuration = Math.max(0, Math.floor(Number(session.workoutDuration) || 0));
  w.workoutTimeline = _clonePlain(session.workoutTimeline || null);
  w.currentGymId = session.gymId || null;
  w.pickerGymFilter = session.pickerGymFilter || null;
  w.routineMeta = _clonePlain(session.routineMeta || null);
  w.maxMeta = _clonePlain(session.maxMeta || null);
}

export function _syncWorkoutHomeSavedSessionState(key, result, sessionIndex = null) {
  const p = _parseDateKey(key);
  const sessions = Array.isArray(result?.workoutSessions) ? result.workoutSessions : [];
  if (!p || !sessions.length) return;
  const targetIndexRaw = Number(sessionIndex);
  if (!Number.isFinite(targetIndexRaw)) return;
  const targetIndex = Math.max(0, Math.floor(targetIndexRaw));
  const targetSession = sessions[targetIndex];
  if (!targetSession) return;
  const date = { y: p.y, m: p.m, d: p.d };
  try {
    wtReplaceActiveWorkoutDraftSession(date, targetIndex, targetSession, 'sheet session save');
  } catch (e) {
    console.warn('[workout-calendar] active draft sync skipped:', e);
  }
  if (!_isSameWorkoutStateDate(key)) return;
  const activeIndex = Math.max(0, Math.floor(Number(S.workout?.sessionIndex) || 0));
  if (activeIndex !== targetIndex) return;
  _applyWorkoutHomeSessionToActiveState(targetSession, targetIndex);
}

export function _hasWorkoutHomeMealRecord(day, mealKey) {
  const textKey = mealKey;
  const foodsKey = `${mealKey[0]}Foods`;
  const kcalKey = `${mealKey[0]}Kcal`;
  const skipKey = `${mealKey}_skipped`;
  if (day?.[skipKey]) return true;
  if (String(day?.[textKey] || '').trim()) return true;
  if (Array.isArray(day?.[foodsKey]) && day[foodsKey].length > 0) return true;
  return _num(day?.[kcalKey]) > 0;
}

export function _mealOkPatchForWorkoutHomeDay(key, existingDay, aggregate) {
  const p = _parseDateKey(key);
  if (!p) return {};
  try {
    const diet = {
      bKcal: existingDay.bKcal || 0,
      lKcal: existingDay.lKcal || 0,
      dKcal: existingDay.dKcal || 0,
      sKcal: existingDay.sKcal || 0,
    };
    const isDietSuccess = deriveDietSuccessFromWorkout(aggregate, diet, { y: p.y, m: p.m, d: p.d }, aggregate.exercises || []);
    return {
      bOk: _hasWorkoutHomeMealRecord(existingDay, 'breakfast')
        ? (existingDay.breakfast_skipped ? true : isDietSuccess) : null,
      lOk: _hasWorkoutHomeMealRecord(existingDay, 'lunch')
        ? (existingDay.lunch_skipped ? true : isDietSuccess) : null,
      dOk: _hasWorkoutHomeMealRecord(existingDay, 'dinner')
        ? (existingDay.dinner_skipped ? true : isDietSuccess) : null,
      sOk: _hasWorkoutHomeMealRecord(existingDay, 'snack') ? isDietSuccess : null,
    };
  } catch (e) {
    console.warn('[workout-calendar] meal ok recompute skipped:', e);
    return {};
  }
}
