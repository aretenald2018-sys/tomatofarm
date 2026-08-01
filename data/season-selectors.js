import { toFiniteNumber as _num } from '../utils/number.js';
// Pure season-scoped workout, running, and strength selectors.

import {
  calcVolume,
  estimateSet1RM,
  isExerciseDaySuccess,
} from '../calc.js';
import { getWorkoutSessions } from '../workout/sessions.js';
import {
  listRunningActivities,
  summarizeRunningActivities,
} from '../workout/running-analytics.js';
import {
  addSeasonDays,
  filterCacheToSeason,
  filterCacheToSeasonExercise,
  findSeasonById,
  findSeasonForDate,
  isSeasonDateKey,
  seasonExerciseRange,
  startOfSeasonWeek,
} from './season-model.js';

function _round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(_num(value) * factor) / factor;
}

function _clampProgress(actual, target) {
  const safeActual = Math.max(0, _num(actual));
  const safeTarget = Math.max(0, _num(target));
  return {
    actual: safeActual,
    target: safeTarget,
    ratio: safeTarget > 0 ? safeActual / safeTarget : null,
    percent: safeTarget > 0 ? Math.round((safeActual / safeTarget) * 100) : null,
  };
}

function _entriesInRange(cache, startDate, endDate) {
  return Object.entries(cache || {})
    .filter(([dateKey]) => isSeasonDateKey(dateKey) && startDate <= dateKey && dateKey <= endDate)
    .sort(([left], [right]) => left.localeCompare(right));
}

function _completedWeekRanges(season, todayKey, count) {
  const ranges = [];
  let weekStart = addSeasonDays(startOfSeasonWeek(todayKey), -7);
  while (ranges.length < count && weekStart >= season.startDate) {
    const weekEnd = addSeasonDays(weekStart, 6);
    if (weekEnd <= season.endDate) ranges.unshift({ startDate: weekStart, endDate: weekEnd });
    weekStart = addSeasonDays(weekStart, -7);
  }
  return ranges;
}

function _currentWeekRange(season, todayKey) {
  const weekStart = startOfSeasonWeek(todayKey);
  return {
    startDate: weekStart < season.startDate ? season.startDate : weekStart,
    endDate: todayKey > season.endDate ? season.endDate : todayKey,
  };
}

function _strengthEntries(day = {}) {
  return getWorkoutSessions(day).flatMap(session => Array.isArray(session?.exercises) ? session.exercises : []);
}

function _completedStrengthSets(entry = {}) {
  return (Array.isArray(entry?.sets) ? entry.sets : []).filter(set => {
    if (!set || set.setType === 'warmup') return false;
    if (set.done === true) return true;
    if (set.done === false) return false;
    return _num(set.kg) > 0 && _num(set.reps) > 0;
  });
}

function _strengthSummary(entries = []) {
  let totalVolumeKg = 0;
  const activeDays = new Set();
  const bestOneRmByExercise = {};

  for (const [dateKey, day] of entries) {
    let dayHasStrength = false;
    for (const entry of _strengthEntries(day)) {
      const sets = _completedStrengthSets(entry);
      if (!sets.length) continue;
      dayHasStrength = true;
      totalVolumeKg += calcVolume(sets);
      const exerciseId = String(entry?.exerciseId || entry?.movementId || entry?.name || '').trim();
      if (!exerciseId) continue;
      const best = Math.max(0, ...sets.map(set => estimateSet1RM(set)));
      bestOneRmByExercise[exerciseId] = Math.max(bestOneRmByExercise[exerciseId] || 0, best);
    }
    if (dayHasStrength) activeDays.add(dateKey);
  }

  return {
    sessions: activeDays.size,
    totalVolumeKg: Math.round(totalVolumeKg),
    bestOneRmByExercise,
  };
}

function _windowSummary(ranges, cache, summarizer) {
  const entries = ranges.flatMap(range => _entriesInRange(cache, range.startDate, range.endDate));
  return summarizer(entries);
}

export function selectSeasonContext(cache = {}, registry = {}, selector = {}) {
  const dateKey = String(selector?.dateKey || '');
  const season = selector?.seasonId
    ? findSeasonById(registry, selector.seasonId)
    : findSeasonForDate(registry, dateKey);
  const scopedCache = season ? filterCacheToSeason(cache, season) : {};
  return {
    season,
    cache: scopedCache,
    entries: Object.entries(scopedCache).sort(([left], [right]) => left.localeCompare(right)),
  };
}

export function calcSeasonWorkoutStreak(cache = {}, registry = {}, todayKey) {
  const { season, cache: scopedCache } = selectSeasonContext(cache, registry, { dateKey: todayKey });
  if (!season) return { current: 0, best: 0, todayDone: false, seasonId: null };

  const todayDone = isExerciseDaySuccess(scopedCache[todayKey]);
  let cursor = todayDone ? todayKey : addSeasonDays(todayKey, -1);
  let current = 0;
  while (cursor >= season.startDate) {
    if (!isExerciseDaySuccess(scopedCache[cursor])) break;
    current += 1;
    cursor = addSeasonDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  cursor = season.startDate;
  const lastDate = todayKey < season.endDate ? todayKey : season.endDate;
  while (cursor <= lastDate) {
    if (isExerciseDaySuccess(scopedCache[cursor])) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    cursor = addSeasonDays(cursor, 1);
  }

  return { current, best, todayDone, seasonId: season.id };
}

export function selectSeasonRunningStats(cache = {}, registry = {}, todayKey, plan = {}) {
  const { season, cache: scopedCache } = selectSeasonContext(cache, registry, { dateKey: todayKey });
  const emptyProgress = _clampProgress(0, plan?.weeklyDistanceKm);
  if (!season) {
    return {
      seasonId: null,
      currentWeek: { distance: emptyProgress, sessions: _clampProgress(0, plan?.weeklySessions) },
      trend: { status: 'collecting', sampleWeeks: 0 },
    };
  }

  const currentRange = _currentWeekRange(season, todayKey);
  const currentActivities = listRunningActivities(_entriesInRange(scopedCache, currentRange.startDate, currentRange.endDate));
  const current = summarizeRunningActivities(currentActivities);
  const completedRanges = _completedWeekRanges(season, todayKey, 4);
  let trend = { status: 'collecting', sampleWeeks: completedRanges.length };

  if (completedRanges.length === 4) {
    const previous = _windowSummary(completedRanges.slice(0, 2), scopedCache, entries => (
      summarizeRunningActivities(listRunningActivities(entries))
    ));
    const recent = _windowSummary(completedRanges.slice(2), scopedCache, entries => (
      summarizeRunningActivities(listRunningActivities(entries))
    ));
    if (previous.distanceKm > 0 && recent.distanceKm > 0) {
      trend = {
        status: 'ready',
        sampleWeeks: 4,
        distanceDeltaPct: _round(((recent.distanceKm - previous.distanceKm) / previous.distanceKm) * 100, 1),
        paceImprovementSecPerKm: previous.avgPaceSecPerKm > 0 && recent.avgPaceSecPerKm > 0
          ? previous.avgPaceSecPerKm - recent.avgPaceSecPerKm
          : null,
        previous,
        recent,
      };
    }
  }

  return {
    seasonId: season.id,
    currentWeek: {
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
      distance: _clampProgress(current.distanceKm, plan?.weeklyDistanceKm),
      sessions: _clampProgress(current.activityCount, plan?.weeklySessions),
      summary: current,
    },
    trend,
  };
}

export function selectSeasonStrengthStats(cache = {}, registry = {}, todayKey, plan = {}) {
  const { season, cache: scopedCache } = selectSeasonContext(cache, registry, { dateKey: todayKey });
  if (!season) {
    return {
      seasonId: null,
      currentWeek: { sessions: _clampProgress(0, plan?.weeklySessionTarget), totalVolumeKg: 0 },
      volumeTrend: { status: 'collecting', sampleWeeks: 0 },
      liftDeltas: [],
    };
  }

  const currentRange = _currentWeekRange(season, todayKey);
  const current = _strengthSummary(_entriesInRange(scopedCache, currentRange.startDate, currentRange.endDate));
  const completedRanges = _completedWeekRanges(season, todayKey, 2);
  let volumeTrend = { status: 'collecting', sampleWeeks: completedRanges.length };
  if (completedRanges.length === 2) {
    const previous = _strengthSummary(_entriesInRange(scopedCache, completedRanges[0].startDate, completedRanges[0].endDate));
    const recent = _strengthSummary(_entriesInRange(scopedCache, completedRanges[1].startDate, completedRanges[1].endDate));
    if (previous.totalVolumeKg > 0 && recent.totalVolumeKg > 0) {
      volumeTrend = {
        status: 'ready',
        sampleWeeks: 2,
        volumeDeltaPct: _round(((recent.totalVolumeKg - previous.totalVolumeKg) / previous.totalVolumeKg) * 100, 1),
        previous,
        recent,
      };
    }
  }

  const seasonSummary = _strengthSummary(Object.entries(scopedCache));
  const baselines = plan?.startingOneRmByExercise && typeof plan.startingOneRmByExercise === 'object'
    ? plan.startingOneRmByExercise
    : {};
  const labels = plan?.exerciseLabels && typeof plan.exerciseLabels === 'object' ? plan.exerciseLabels : {};
  // 종목별 기간이 지정된 종목은 자기 구간 안의 기록으로만 향상도를 잰다.
  const _bestOneRmFor = (exerciseId) => {
    const range = seasonExerciseRange(season, exerciseId);
    if (!range || (range.startDate === season.startDate && range.endDate === season.endDate)) {
      return seasonSummary.bestOneRmByExercise[exerciseId];
    }
    const windowed = _strengthSummary(Object.entries(filterCacheToSeasonExercise(cache, season, exerciseId)));
    return windowed.bestOneRmByExercise[exerciseId];
  };
  const liftDeltas = Object.entries(baselines).map(([exerciseId, baselineValue]) => {
    const baselineOneRmKg = _num(baselineValue);
    const currentOneRmKg = _num(_bestOneRmFor(exerciseId));
    return {
      exerciseId,
      label: String(labels[exerciseId] || exerciseId),
      baselineOneRmKg,
      currentOneRmKg,
      deltaKg: baselineOneRmKg > 0 && currentOneRmKg > 0
        ? _round(currentOneRmKg - baselineOneRmKg, 1)
        : null,
    };
  }).filter(row => row.baselineOneRmKg > 0);

  return {
    seasonId: season.id,
    currentWeek: {
      startDate: currentRange.startDate,
      endDate: currentRange.endDate,
      sessions: _clampProgress(current.sessions, plan?.weeklySessionTarget),
      totalVolumeKg: current.totalVolumeKg,
      bestOneRmByExercise: current.bestOneRmByExercise,
    },
    volumeTrend,
    liftDeltas,
  };
}
