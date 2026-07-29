import { calcBurnedKcal, calcVolume } from '../calc.js';
import {
  dietDayOk,
  getCache,
  getDiet,
  getDietPlan,
  getRawBodyCheckins,
  hasDietRecord,
  hasExerciseRecord,
} from '../data.js';
import { WORKOUT_PAYLOAD_KEYS, DIET_PAYLOAD_KEYS, SHARED_PAYLOAD_KEYS } from '../workout/save-schema.js';
import { getWorkoutSessions } from '../workout/sessions.js';
import { dateFromKey as _dateFromKey } from '../utils/date-key.js';
import { keyOffset as _keyOffset } from './analysis-range.js';
import {
  dayCarbs as _dayCarbs,
  dayFat as _dayFat,
  dayKcal as _dayKcal,
  dayProtein as _dayProtein,
  daySodium as _daySodium,
  daySugar as _daySugar,
  foodItems as _foodItems,
  weightOnOrBefore as _weightOnOrBefore,
} from './day-aggregates.js';
import { maybeNumber as _maybeNum } from './format.js';

const _RAW_SHARED_KEYS = new Set(SHARED_PAYLOAD_KEYS);
const _RAW_WORKOUT_KEYS = WORKOUT_PAYLOAD_KEYS.filter(key => !_RAW_SHARED_KEYS.has(key));
const _RAW_DIET_KEYS = DIET_PAYLOAD_KEYS.filter(key => !_RAW_SHARED_KEYS.has(key));

function _jsonSafeClone(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function _pickRawFields(day, keys) {
  const out = {};
  keys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(day || {}, key)) return;
    const value = _jsonSafeClone(day[key]);
    if (value !== undefined) out[key] = value;
  });
  return out;
}

function _bodyCheckinsByDate(checkins) {
  const byDate = new Map();
  checkins.forEach(checkin => {
    const key = checkin?.date || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const list = byDate.get(key) || [];
    list.push(_jsonSafeClone(checkin));
    byDate.set(key, list);
  });
  return byDate;
}

function _rawWorkoutSummary(day) {
  const sessions = getWorkoutSessions(day, { minCount: 1 });
  const entries = sessions.flatMap(session => Array.isArray(session?.exercises) ? session.exercises : []);
  const sets = entries.flatMap(entry => Array.isArray(entry?.sets) ? entry.sets : []);
  return {
    sessions: sessions.length,
    exercises: entries.length,
    sets: sets.length,
    completedSets: sets.filter(set => set?.done === true).length,
    volume: Math.round(entries.reduce((sum, entry) => sum + calcVolume(entry?.sets || []), 0)),
  };
}

function _rawDietSummary(day) {
  return {
    intakeKcal: _dayKcal(day),
    proteinG: _dayProtein(day),
    carbsG: _dayCarbs(day),
    fatG: _dayFat(day),
    sugarG: _daySugar(day),
    sodiumMg: _daySodium(day),
    foods: _foodItems(day).length,
  };
}

function _rawDailyRow(key, day, checkinsByDate, checkinsToDate, plan) {
  const date = _dateFromKey(key);
  const y = date?.getFullYear();
  const m = date?.getMonth();
  const d = date?.getDate();
  const dietDay = date ? getDiet(y, m, d) : day;
  const bodyCheckins = checkinsByDate.get(key) || [];
  const weightForBurn = _weightOnOrBefore(checkinsToDate, key) ?? _maybeNum(plan?.weight) ?? 70;
  const exerciseKcal = Math.round(calcBurnedKcal(day, weightForBurn).total || 0);
  return {
    date: key,
    hasWorkout: date ? hasExerciseRecord(y, m, d) : false,
    hasDiet: date ? hasDietRecord(y, m, d) : false,
    dietOk: date ? dietDayOk(y, m, d) : null,
    derived: {
      workout: _rawWorkoutSummary(day),
      diet: _rawDietSummary(dietDay),
      exerciseKcal,
      bodyCheckinCount: bodyCheckins.length,
    },
    raw: {
      workout: _pickRawFields(day, _RAW_WORKOUT_KEYS),
      diet: _pickRawFields(day, _RAW_DIET_KEYS),
      shared: _pickRawFields(day, SHARED_PAYLOAD_KEYS),
      day: _jsonSafeClone(day || {}),
      bodyCheckins,
    },
  };
}

export function buildStatsRawExport() {
  const cache = getCache();
  const todayKey = _keyOffset(0);
  const checkins = getRawBodyCheckins()
    .filter(checkin => (checkin?.date || '') <= todayKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const checkinsByDate = _bodyCheckinsByDate(checkins);
  const plan = getDietPlan();
  const dateKeys = new Set(
    Object.keys(cache)
      .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= todayKey)
  );
  checkins.forEach(checkin => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(checkin?.date || '')) dateKeys.add(checkin.date);
  });
  const daily = [...dateKeys]
    .sort((a, b) => a.localeCompare(b))
    .map(key => _rawDailyRow(key, cache[key] || {}, checkinsByDate, checkins, plan));
  const workoutDays = daily.filter(row => row.hasWorkout).length;
  const dietDays = daily.filter(row => row.hasDiet).length;
  return {
    schema: 'tomatofarm.rawDailyStats.v1',
    exportedAt: new Date().toISOString(),
    today: todayKey,
    source: 'data.js getCache users/{uid}/workouts daily documents',
    counts: {
      totalDays: daily.length,
      workoutDays,
      dietDays,
      bodyCheckins: checkins.length,
      workoutPayloadKeys: _RAW_WORKOUT_KEYS.length,
      dietPayloadKeys: _RAW_DIET_KEYS.length,
      sharedPayloadKeys: SHARED_PAYLOAD_KEYS.length,
    },
    daily,
    bodyCheckins: checkins.map(_jsonSafeClone),
  };
}
