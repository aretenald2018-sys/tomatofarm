import { calcDietMetrics, getDayTargetKcal, isExerciseDaySuccess } from '../calc.js';
import {
  countRecordedNutrientMeals,
  sumDayNutrient,
} from '../diet/day-nutrition.js';
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

// 위젯은 근력 목표를 5칸(widget_strength_check_1..5)까지만 그린다. 종목이 여러 개면
// (온보딩은 종목마다 volume+intensity 두 트랙을 만든다) 항목이 5개를 넘겨, 벤치마크
// 나열 순서대로 자르던 기존 방식에서는 달성(✓)한 종목이 6번째 이후로 밀릴 때 위젯에서
// 통째로 사라졌다 — "달성한 근력목표가 위젯에서 렌더링되지 않음"의 표시-선택 원인.
// 잘라내기 전에 상태 우선순위(달성>시도>미달>예정)로 정렬해 달성한 목표가 항상 보이는
// 칸 안으로 들어오게 한다. 정렬은 노출 순서만 바꾸며, achievedCount/totalCount(전체
// 항목으로 buildSeasonOverview에서 이미 계산)에는 영향을 주지 않는다.
const _ITEM_VISIBILITY_RANK = { achieved: 3, attempted: 2, 'not-achieved': 1, planned: 0 };
function _itemVisibilityRank(state) {
  const rank = _ITEM_VISIBILITY_RANK[state];
  return Number.isFinite(rank) ? rank : 0;
}

function _foodSnapshot(cache, todayKey, dietPlan) {
  const day = cache?.[todayKey] || {};
  const actualKcal = Math.round(sumDayNutrient(day, 'kcal'));
  const targetKcal = dietPlan && (dietPlan._userSet || dietPlan.weight || dietPlan.height)
    ? Math.max(0, Math.round(getDayTargetKcal(
      dietPlan,
      Number(todayKey?.slice(0, 4)),
      Number(todayKey?.slice(5, 7)) - 1,
      Number(todayKey?.slice(8, 10)),
      day,
    )))
    : 0;
  const recordedMeals = countRecordedNutrientMeals(day, 'kcal');
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
    proteinG: Math.round(sumDayNutrient(day, 'protein')),
    carbsG: Math.round(sumDayNutrient(day, 'carbs')),
    fatG: Math.round(sumDayNutrient(day, 'fat')),
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
  // 달성한 목표를 위젯의 보이는 칸(최대 5개) 안으로 끌어올린다. Array.sort는 안정
  // 정렬이라 같은 상태끼리는 기존 벤치마크 순서를 유지한다.
  const orderedItems = week.items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      _itemVisibilityRank(right.item.state) - _itemVisibilityRank(left.item.state)
      || left.index - right.index
    ))
    .map(({ item }) => item);
  return {
    state: week.state,
    index: week.index,
    startDate: week.startDate,
    endDate: week.endDate,
    achievedCount: week.achievedCount,
    totalCount: week.totalCount,
    items: orderedItems.slice(0, 8).map(item => ({
      kind: item.kind,
      label: item.label,
      detail: item.detail,
      state: item.state,
      ...(item.achievementSource ? { achievementSource: item.achievementSource } : {}),
      ...(item.achievementDate ? { achievementDate: item.achievementDate } : {}),
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
