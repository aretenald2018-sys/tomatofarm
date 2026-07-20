// 홈 주간 요약 집계 모델.
// Firebase/DOM을 모르도록 분리해, 저장된 day cache를 같은 규칙으로 화면과 테스트에서 사용한다.

import { calcVolume } from '../calc.js';
import { getWorkoutSessions, hasWorkoutSessionData } from '../workout/sessions.js';
import { listRunningActivities, summarizeRunningActivities } from '../workout/running-analytics.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function dateKey(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function addDays(date, amount) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

export function buildDateRanges(today = new Date()) {
  const value = new Date(today);
  value.setHours(12, 0, 0, 0);
  const mondayOffset = (value.getDay() + 6) % 7;
  const monday = addDays(value, -mondayOffset);
  const current = [];
  const previous = [];
  for (let index = 0; index <= mondayOffset; index += 1) {
    const currentDate = addDays(monday, index);
    current.push(dateKey(currentDate));
    previous.push(dateKey(addDays(currentDate, -7)));
  }
  return {
    current,
    previous,
    todayKey: dateKey(value),
    currentWeekStart: current[0],
    currentWeekEnd: current[current.length - 1],
    previousWeekStart: previous[0],
    previousWeekEnd: previous[previous.length - 1],
  };
}

function hasMealRecord(day, textKey, foodsKey, kcalKey, skippedKey, photoKey, okKey) {
  return Boolean(
    String(day?.[textKey] || '').trim()
    || (Array.isArray(day?.[foodsKey]) && day[foodsKey].length)
    || number(day?.[kcalKey]) > 0
    || day?.[skippedKey]
    || day?.[photoKey]
    || day?.[okKey] === true,
  );
}

export function summarizeDietDay(day = {}) {
  const meals = [
    ['breakfast', 'bFoods', 'bKcal', 'breakfast_skipped', 'bPhoto', 'bOk'],
    ['lunch', 'lFoods', 'lKcal', 'lunch_skipped', 'lPhoto', 'lOk'],
    ['dinner', 'dFoods', 'dKcal', 'dinner_skipped', 'dPhoto', 'dOk'],
    ['snack', 'sFoods', 'sKcal', '', 'sPhoto', ''],
  ];
  const mealCount = meals.filter(([text, foods, kcal, skipped, photo, ok]) =>
    hasMealRecord(day, text, foods, kcal, skipped, photo, ok),
  ).length;
  const actual = {
    kcal: meals.reduce((sum, [, , key]) => sum + number(day?.[key]), 0),
    proteinG: number(day?.bProtein) + number(day?.lProtein) + number(day?.dProtein) + number(day?.sProtein),
  };
  actual.carbG = number(day?.bCarbs) + number(day?.lCarbs) + number(day?.dCarbs) + number(day?.sCarbs);
  actual.fatG = number(day?.bFat) + number(day?.lFat) + number(day?.dFat) + number(day?.sFat);
  return {
    recorded: mealCount > 0,
    mealCount,
    ...actual,
  };
}

function completedSets(entry = {}) {
  return (Array.isArray(entry?.sets) ? entry.sets : []).filter((set) => {
    if (!set || set.setType === 'warmup' || set.done === false) return false;
    if (set.done === true) return true;
    return number(set.kg) > 0 && number(set.reps) > 0;
  });
}

export function summarizeWorkoutDay(day = {}) {
  const sessions = getWorkoutSessions(day);
  const activeSessions = sessions.filter((session) => hasWorkoutSessionData(session));
  const strengthEntries = activeSessions.flatMap((session) => (
    Array.isArray(session?.exercises) ? session.exercises : []
  ));
  const strengthSets = strengthEntries.reduce((sum, entry) => sum + completedSets(entry).length, 0);
  const volumeKg = strengthEntries.reduce((sum, entry) => sum + calcVolume(completedSets(entry)), 0);
  const activities = new Set();
  activeSessions.forEach((session) => {
    if (strengthEntries.length && session.exercises?.length) activities.add('strength');
    if (session.running || number(session.runDistance) > 0 || number(session.runDurationMin) > 0 || number(session.runDurationSec) > 0) activities.add('running');
    if (session.swimming || number(session.swimDistance) > 0) activities.add('swimming');
    if (session.cf || number(session.cfDurationMin) > 0 || number(session.cfDurationSec) > 0) activities.add('crossfit');
    if (session.stretching || number(session.stretchDuration) > 0) activities.add('stretching');
  });
  return {
    recorded: activeSessions.length > 0,
    sessionCount: activeSessions.length,
    strengthSets,
    volumeKg: Math.round(volumeKg),
    activities: [...activities],
  };
}

function aggregateDays(cache, keys) {
  const days = keys.map((key) => ({ key, day: cache?.[key] || {} }));
  const diet = days.reduce((total, item) => {
    const summary = summarizeDietDay(item.day);
    total.kcal += summary.kcal;
    total.proteinG += summary.proteinG;
    total.carbG += summary.carbG;
    total.fatG += summary.fatG;
    total.mealCount += summary.mealCount;
    total.recordedDays += summary.recorded ? 1 : 0;
    return total;
  }, { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, mealCount: 0, recordedDays: 0 });
  const workoutDays = [];
  const workout = days.reduce((total, item) => {
    const summary = summarizeWorkoutDay(item.day);
    if (summary.recorded) workoutDays.push({ key: item.key, ...summary });
    total.workoutDays += summary.recorded ? 1 : 0;
    total.sessionCount += summary.sessionCount;
    total.strengthSets += summary.strengthSets;
    total.volumeKg += summary.volumeKg;
    return total;
  }, { workoutDays: 0, sessionCount: 0, strengthSets: 0, volumeKg: 0 });
  const runningRecords = listRunningActivities(days.map(({ key, day }) => [key, day]));
  return {
    keys,
    diet,
    workout: { ...workout, volumeKg: Math.round(workout.volumeKg), days: workoutDays },
    running: summarizeRunningActivities(runningRecords),
  };
}

export function buildWeeklySummaryModel({ cache = {}, today = new Date(), dietTarget = null, workoutTargetDays = null } = {}) {
  const ranges = buildDateRanges(today);
  const current = aggregateDays(cache, ranges.current);
  const previous = aggregateDays(cache, ranges.previous);
  const todayDay = cache?.[ranges.todayKey] || {};
  return {
    ranges,
    today: {
      diet: { ...summarizeDietDay(todayDay), target: dietTarget },
      workout: summarizeWorkoutDay(todayDay),
    },
    current,
    previous,
    workoutTargetDays: Number(workoutTargetDays) > 0 ? Math.round(Number(workoutTargetDays)) : null,
  };
}

export function isDateKey(value) {
  return DATE_RE.test(String(value || ''));
}
