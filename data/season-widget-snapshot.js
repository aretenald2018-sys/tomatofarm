import { calcDietMetrics, getDayTargetKcal, isExerciseDaySuccess } from '../calc.js';
import {
  activeBenchmarks,
  activeCycleOf,
  mondayOf,
  weekIndexOf,
} from '../workout/test-v2/board-core.js';
import {
  addSeasonDays,
  findSeasonForDate,
  seasonContainsDate,
} from './season-model.js';
import {
  calcSeasonWorkoutStreak,
  selectSeasonRunningStats,
  selectSeasonStrengthStats,
} from './season-selectors.js';
import { buildSeasonOverview } from './season-overview.js';
import { listRunningActivities } from '../workout/running-analytics.js';

function _round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function _daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 86400000)) : 0;
}

function _weekStatuses(cache, season, todayKey) {
  const start = mondayOf(todayKey);
  return Array.from({ length: 7 }, (_, index) => {
    const dateKey = addSeasonDays(start, index);
    return {
      dateKey,
      inSeason: seasonContainsDate(season, dateKey),
      done: dateKey <= todayKey && seasonContainsDate(season, dateKey) && isExerciseDaySuccess(cache?.[dateKey]),
      today: dateKey === todayKey,
      future: dateKey > todayKey,
    };
  });
}

function _boardWeek(board, todayKey) {
  const benchmarks = activeBenchmarks(board || {});
  const cycle = benchmarks.length ? activeCycleOf(board, benchmarks[0].groupId) : null;
  return cycle ? Math.max(1, weekIndexOf(cycle, todayKey)) : null;
}

function _nextPlan(board, runningStats) {
  const benchmark = activeBenchmarks(board || {})[0] || null;
  const health = benchmark
    ? `${benchmark.label || '헬스'}${benchmark.program === 'wendler' ? ' 웬들러' : ''}`
    : '헬스 계획 확인';
  const remainingDistance = Math.max(
    0,
    Number(runningStats?.currentWeek?.distance?.target || 0) - Number(runningStats?.currentWeek?.distance?.actual || 0),
  );
  return {
    health,
    running: remainingDistance > 0 ? `러닝 ${_round(remainingDistance, 1)}km 남음` : '러닝 주간 목표 완료',
  };
}

function _number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function _foodSnapshot(cache, todayKey, dietPlan) {
  const day = cache?.[todayKey] || {};
  const actualKcal = Math.round(['bKcal', 'lKcal', 'dKcal', 'sKcal']
    .reduce((sum, key) => sum + _number(day[key]), 0));
  const targetKcal = dietPlan && (dietPlan._userSet || dietPlan.weight || dietPlan.height)
    ? Math.max(0, Math.round(getDayTargetKcal(
      dietPlan,
      Number(todayKey?.slice(0, 4)),
      Number(todayKey?.slice(5, 7)) - 1,
      Number(todayKey?.slice(8, 10)),
      day,
    )))
    : 0;
  const recordedMeals = ['bKcal', 'lKcal', 'dKcal', 'sKcal'].filter(key => _number(day[key]) > 0).length;
  const progress = targetKcal > 0 ? Math.round((actualKcal / targetKcal) * 100) : 0;
  let carbsTargetG = 0;
  let proteinTargetG = 0;
  let fatTargetG = 0;
  if (dietPlan && dietPlan._userSet) {
    try {
      const metrics = calcDietMetrics(dietPlan);
      const weekday = new Date(Number(todayKey?.slice(0, 4)), Number(todayKey?.slice(5, 7)) - 1, Number(todayKey?.slice(8, 10))).getDay();
      const target = (dietPlan.refeedDays || []).includes(weekday) ? metrics.refeed : metrics.deficit;
      carbsTargetG = Math.round(_number(target?.carbG));
      proteinTargetG = Math.round(_number(target?.proteinG));
      fatTargetG = Math.round(_number(target?.fatG));
    } catch (error) {
      carbsTargetG = 0;
      proteinTargetG = 0;
      fatTargetG = 0;
    }
  }
  return {
    dateKey: todayKey,
    actualKcal,
    targetKcal,
    progress: Math.max(0, Math.min(100, progress)),
    proteinG: Math.round(['bProtein', 'lProtein', 'dProtein', 'sProtein'].reduce((sum, key) => sum + _number(day[key]), 0)),
    carbsG: Math.round(['bCarbs', 'lCarbs', 'dCarbs', 'sCarbs'].reduce((sum, key) => sum + _number(day[key]), 0)),
    fatG: Math.round(['bFat', 'lFat', 'dFat', 'sFat'].reduce((sum, key) => sum + _number(day[key]), 0)),
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
    recordedMeals,
    state: actualKcal > 0 || targetKcal > 0 ? 'ready' : 'waiting',
  };
}

function _recentRunningRecords(cache, todayKey) {
  const entries = Object.entries(cache || {})
    .filter(([key]) => !todayKey || key <= todayKey);
  return listRunningActivities(entries)
    .sort((left, right) => (
      right.dateKey.localeCompare(left.dateKey)
      || Number(right.startedAt || 0) - Number(left.startedAt || 0)
      || right.sessionIndex - left.sessionIndex
    ))
    .slice(0, 5)
    .map(record => ({
      dateKey: record.dateKey,
      distanceKm: _round(record.distanceKm, 2),
      durationSec: Math.max(0, Math.round(Number(record.durationSec) || 0)),
      avgPaceSecPerKm: Math.max(0, Math.round(Number(record.avgPaceSecPerKm) || 0)),
      source: record.source || 'manual',
    }));
}

function _weeklyGoal(cache, season, board, runningPlan, todayKey) {
  if (!season) return { state: 'missing', items: [] };
  const overview = buildSeasonOverview({
    cache,
    season,
    board: JSON.parse(JSON.stringify(board || {})),
    runningPlan,
    todayKey,
  });
  const week = overview.weeks.find(item => item.startDate <= todayKey && todayKey <= item.endDate)
    || overview.weeks.find(item => item.startDate >= todayKey)
    || overview.weeks.at(-1);
  if (!week) return { state: 'missing', items: [] };
  return {
    state: week.state,
    index: week.index,
    startDate: week.startDate,
    endDate: week.endDate,
    achievedCount: week.achievedCount,
    totalCount: week.totalCount,
    items: week.items.slice(0, 8).map(item => ({
      kind: item.kind,
      label: item.label,
      detail: item.detail,
      state: item.state,
    })),
  };
}

export function buildSeasonDashboardSnapshot({
  cache = {},
  registry = {},
  todayKey,
  workoutPlan = {},
  runningPlan = {},
  board = null,
  dietPlan = {},
  generatedAt = Date.now(),
} = {}) {
  const food = _foodSnapshot(cache, todayKey, dietPlan);
  const recentRunning = _recentRunningRecords(cache, todayKey);
  const season = findSeasonForDate(registry, todayKey);
  if (!season) {
    return {
      schemaVersion: 1,
      generatedAt,
      state: 'no-season',
      food,
      weeklyGoal: _weeklyGoal(cache, null, board, runningPlan, todayKey),
      recentRunning,
      message: '새 시즌을 설정해 주세요',
    };
  }
  const streak = calcSeasonWorkoutStreak(cache, registry, todayKey);
  const running = selectSeasonRunningStats(cache, registry, todayKey, runningPlan);
  const strength = selectSeasonStrengthStats(cache, registry, todayKey, workoutPlan);
  const readyLiftDeltas = strength.liftDeltas.filter(row => Number.isFinite(row.deltaKg));
  const liftDeltaKg = readyLiftDeltas.length
    ? readyLiftDeltas.sort((left, right) => Math.abs(right.deltaKg) - Math.abs(left.deltaKg))[0].deltaKg
    : null;
  const paceGoalMode = runningPlan?.paceGoalMode === 'adaptive' ? 'adaptive' : 'fixed';
  const actualPaceSecPerKm = Number(running.currentWeek?.summary?.avgPaceSecPerKm) || null;
  const baselinePaceSecPerKm = Number(running.trend?.recent?.avgPaceSecPerKm)
    || Number(running.trend?.previous?.avgPaceSecPerKm)
    || null;
  const targetPaceSecPerKm = paceGoalMode === 'adaptive'
    ? (baselinePaceSecPerKm && Number(runningPlan?.adaptiveRatePct) > 0
      ? Math.round(baselinePaceSecPerKm * (1 - Math.min(10, Number(runningPlan.adaptiveRatePct)) / 100))
      : null)
    : (Number(runningPlan?.targetPaceSecPerKm) > 0 ? Number(runningPlan.targetPaceSecPerKm) : null);
  const week = _boardWeek(board, todayKey);
  return {
    schemaVersion: 1,
    generatedAt,
    state: 'ready',
    food,
    weeklyGoal: _weeklyGoal(cache, season, board, runningPlan, todayKey),
    recentRunning,
    season: {
      id: season.id,
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      daysRemaining: _daysBetween(todayKey, season.endDate),
      week,
    },
    streak: {
      current: streak.current,
      best: streak.best,
      todayDone: streak.todayDone,
      week: _weekStatuses(cache, season, todayKey),
    },
    running: {
      distance: running.currentWeek.distance,
      sessions: running.currentWeek.sessions,
      trend: running.trend,
      goal: {
        mode: paceGoalMode,
        targetPaceSecPerKm,
        baselinePaceSecPerKm,
        actualPaceSecPerKm,
        adaptiveRatePct: paceGoalMode === 'adaptive' ? Number(runningPlan?.adaptiveRatePct) || 2 : null,
      },
    },
    strength: {
      sessions: strength.currentWeek.sessions,
      totalVolumeKg: strength.currentWeek.totalVolumeKg,
      volumeTrend: strength.volumeTrend,
      liftDeltaKg,
      liftDeltas: strength.liftDeltas,
    },
    nextPlan: _nextPlan(board, running),
  };
}
