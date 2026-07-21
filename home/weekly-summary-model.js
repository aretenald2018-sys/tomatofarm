// 홈 주간 요약 집계 모델.
// Firebase/DOM을 모르도록 분리해, 저장된 day cache를 같은 규칙으로 화면과 테스트에서 사용한다.

import { calcVolume } from '../calc.js';
import { getWorkoutSessions, hasWorkoutSessionData } from '../workout/sessions.js';
import { listRunningActivities, summarizeRunningActivities } from '../workout/running-analytics.js';
import { activeBenchmarks, activeCycleOf, expandColumnCells } from '../workout/test-v2/board-core.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 근력 목표는 스텝(볼륨/강도) 트랙 단위로 처방된다. 웬들러는 볼륨 트랙만 파생한다.
const STRENGTH_TRACKS = ['volume', 'intensity'];

// GPS 오작동으로 저장된 초단거리/비현실 페이스 기록을 걸러, 실제 러닝만 집계 대상으로 삼는다.
const MIN_RUN_KM = 0.4;
const MIN_PACE_SEC = 120;   // 2'00"/km (엘리트 하한)
const MAX_PACE_SEC = 1200;  // 20'00"/km (그 이상은 러닝으로 보지 않음)

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

function parseGoalReps(cell = {}) {
  const numeric = number(cell?.reps);
  if (numeric > 0) return { reps: Math.round(numeric), amrap: false };
  const match = String(cell?.repsLabel || '').match(/(\d+)\s*(\+?)/);
  return match ? { reps: Number(match[1]), amrap: match[2] === '+' } : { reps: 0, amrap: false };
}

// 활성 시즌 보드에서 "이번 주에 해야 하는" 벤치마크 목표 세트를 트랙 단위로 뽑는다.
// (예: 바벨 벤치프레스 90kg 12회[볼륨], 105kg 8회[강도]) — 처방/완료 상태는 보드 로직을 그대로 재사용.
export function buildWeeklyStrengthGoals({ board = null, todayKey } = {}) {
  if (!board) return { configured: false, total: 0, doneCount: 0, goals: [] };
  let benches = [];
  try {
    benches = activeBenchmarks(board) || [];
  } catch (error) {
    console.warn('[weekly-summary] strength goals unavailable:', error?.message || error);
    return { configured: false, total: 0, doneCount: 0, goals: [] };
  }
  const goals = [];
  for (const bench of benches) {
    const cycle = activeCycleOf(board, bench.groupId);
    if (!cycle) continue;
    const tracks = bench.program === 'wendler' ? ['volume'] : STRENGTH_TRACKS;
    for (const track of tracks) {
      let cell = null;
      try {
        const cells = expandColumnCells(board, bench.id, track, cycle.id, todayKey);
        cell = (cells || []).find((item) => item.isCurrent) || null;
      } catch (error) {
        cell = null;
      }
      const kg = number(cell?.kg);
      const { reps, amrap } = parseGoalReps(cell);
      if (!cell || kg <= 0 || reps <= 0) continue;
      goals.push({
        exerciseId: String(bench.id || ''),
        label: String(bench.label || bench.id || ''),
        track,
        kg,
        reps,
        amrap,
        state: String(cell.state || 'plan'),
        done: cell.state === 'done',
      });
    }
  }
  return {
    configured: goals.length > 0,
    total: goals.length,
    doneCount: goals.filter((goal) => goal.done).length,
    goals,
  };
}

function isMeaningfulRun(activity) {
  const distance = number(activity.distanceKm);
  const paceSec = number(activity.avgPaceSecPerKm);
  return distance >= MIN_RUN_KM && paceSec >= MIN_PACE_SEC && paceSec <= MAX_PACE_SEC;
}

// 러닝은 주(week) 경계와 무관하게 "최근 N회" 실제 기록으로 집계한다.
// 사진의 러닝 카드가 최근 러닝(최고 페이스) 기준이므로, 최근 구간의 최고 페이스와
// 그 직전 기록(없으면 최근 구간 전반부)을 비교해 개선치를 만든다.
export function buildRecentRunning({ cache = {}, limit = 5 } = {}) {
  const entries = Object.entries(cache || {})
    .filter(([key]) => DATE_RE.test(key))
    .sort(([left], [right]) => left.localeCompare(right));
  const activities = listRunningActivities(entries)
    .filter(isMeaningfulRun)
    .sort((left, right) => String(left.dateKey || '').localeCompare(String(right.dateKey || '')));
  if (!activities.length) {
    return {
      hasData: false, count: 0, runs: [],
      bestPaceSecPerKm: 0, bestPriorPaceSecPerKm: 0, avgPaceSecPerKm: 0,
      paceDeltaSec: null, paceImprovePct: null, totalDistanceKm: 0,
    };
  }
  const bestPaceOf = (list) => (list.length ? Math.min(...list.map((activity) => number(activity.avgPaceSecPerKm))) : 0);
  const recent = activities.slice(-limit);
  const priorAll = activities.slice(0, Math.max(0, activities.length - limit));

  // 직전에 별도 러닝 기록이 충분하면 그것을, 없으면 최근 구간을 전/후반으로 나눠 비교한다.
  let baseline;
  let focus;
  if (priorAll.length >= 2) {
    baseline = priorAll.slice(-limit);
    focus = recent;
  } else {
    const splitAt = Math.floor(recent.length / 2);
    baseline = recent.slice(0, splitAt);
    focus = recent.slice(splitAt);
  }
  const bestRecent = bestPaceOf(recent);
  const bestFocus = bestPaceOf(focus);
  const bestBaseline = bestPaceOf(baseline);
  const comparable = bestBaseline > 0 && bestFocus > 0;
  const avgRecent = recent.reduce((total, activity) => total + number(activity.avgPaceSecPerKm), 0) / recent.length;
  return {
    hasData: true,
    count: recent.length,
    runs: recent.map((activity) => ({
      dateKey: String(activity.dateKey || ''),
      distanceKm: number(activity.distanceKm),
      paceSecPerKm: Math.round(number(activity.avgPaceSecPerKm)),
    })),
    bestPaceSecPerKm: Math.round(bestRecent),
    bestPriorPaceSecPerKm: comparable ? Math.round(bestBaseline) : 0,
    avgPaceSecPerKm: Math.round(avgRecent),
    paceDeltaSec: comparable ? Math.round(bestFocus - bestBaseline) : null,
    paceImprovePct: comparable ? Math.round(((bestBaseline - bestFocus) / bestBaseline) * 1000) / 10 : null,
    totalDistanceKm: Math.round(recent.reduce((total, activity) => total + number(activity.distanceKm), 0) * 10) / 10,
  };
}

export function buildWeeklySummaryModel({ cache = {}, today = new Date(), dietTarget = null, workoutTargetDays = null, board = null } = {}) {
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
    strengthGoals: buildWeeklyStrengthGoals({ board, todayKey: ranges.todayKey }),
    recentRunning: buildRecentRunning({ cache }),
    workoutTargetDays: Number(workoutTargetDays) > 0 ? Math.round(Number(workoutTargetDays)) : null,
  };
}

export function isDateKey(value) {
  return DATE_RE.test(String(value || ''));
}
