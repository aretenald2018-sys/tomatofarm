import { isExerciseDaySuccess } from '../calc.js';
import {
  activeBenchmarks,
  buildExerciseProgramWorkoutPrescription,
  isWendlerBenchmark,
  mondayOf,
  normalizeLegacyPrograms,
} from '../workout/test-v2/board-core.js';
import {
  addSeasonDays,
  seasonContainsDate,
} from './season-model.js';
import {
  listRunningActivities,
  summarizeRunningActivities,
} from '../workout/running-analytics.js';

function _number(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function _weekCount(season) {
  return Math.max(1, Math.ceil((_number(Date.parse(`${season.endDate}T00:00:00Z`)) - _number(Date.parse(`${season.startDate}T00:00:00Z`)) + 86400000) / (7 * 86400000)));
}

function _weekRanges(season) {
  return Array.from({ length: _weekCount(season) }, (_, index) => {
    const startDate = addSeasonDays(season.startDate, index * 7);
    const endDate = startDate > season.endDate ? season.endDate : addSeasonDays(startDate, 6) > season.endDate ? season.endDate : addSeasonDays(startDate, 6);
    return { index: index + 1, startDate, endDate, goalWeekStart: mondayOf(startDate) };
  }).filter(range => range.startDate <= season.endDate);
}

function _strengthItems(board = {}, week, todayKey) {
  return activeBenchmarks(board).flatMap(benchmark => {
    const wendler = isWendlerBenchmark(benchmark);
    const tracks = wendler ? ['volume'] : (Array.isArray(benchmark.tracks) && benchmark.tracks.length ? benchmark.tracks : ['volume']);
    return tracks.map(track => {
      const step = (board.steps || [])
        .filter(candidate => candidate.benchmarkId === benchmark.id && candidate.track === track)
        .find(candidate => {
          const start = candidate.weekStart || '';
          const end = start ? addSeasonDays(start, Math.max(1, Number(candidate.span) || 1) * 7 - 1) : '';
          return start <= week.goalWeekStart && week.goalWeekStart <= end;
        });
      const log = step?.weekLog?.[week.goalWeekStart] || {};
      const future = week.goalWeekStart > todayKey;
      const state = future ? 'planned' : log.paintedAt || log.done ? 'achieved' : log.attempted ? 'attempted' : 'not-achieved';
      const program = wendler
        ? buildExerciseProgramWorkoutPrescription(board, benchmark, {
          track,
          weekStart: week.goalWeekStart,
          todayKey,
          includeAlternatives: false,
        })
        : null;
      const target = wendler
        ? (program?.prescription?.label || '웬들러 처방 확인')
        : (step ? `${step.kg || 0}kg × ${step.reps || '-'}회` : '이번 주 처방 없음');
      return {
        kind: 'strength',
        label: benchmark.label || benchmark.exerciseId || '헬스',
        detail: wendler ? target : `${track === 'intensity' ? '강도' : '볼륨'} · ${target}`,
        state,
      };
    });
  });
}

function _runningItem(cache, season, week, runningPlan, todayKey) {
  const entries = Object.entries(cache || {}).filter(([dateKey]) => (
    week.startDate <= dateKey && dateKey <= week.endDate && seasonContainsDate(season, dateKey)
  ));
  const summary = summarizeRunningActivities(listRunningActivities(entries));
  const targetDistance = _number(runningPlan?.weeklyDistanceKm);
  const targetSessions = _number(runningPlan?.weeklySessions);
  const future = week.startDate > todayKey;
  const achieved = !future && summary.distanceKm >= targetDistance && summary.activityCount >= targetSessions;
  return {
    kind: 'running',
    label: '러닝',
    detail: `${summary.distanceKm.toFixed(1)} / ${targetDistance || 0}km · ${summary.activityCount} / ${targetSessions || 0}회`,
    state: future ? 'planned' : achieved ? 'achieved' : 'not-achieved',
  };
}

export function buildSeasonOverview({ cache = {}, season, board = {}, runningPlan = {}, todayKey } = {}) {
  if (!season) return { state: 'missing', weeks: [] };
  normalizeLegacyPrograms(board, { fallbackStartDate: season.startDate });
  const safeToday = String(todayKey || season.startDate);
  const weeks = _weekRanges(season).map(week => {
    const items = [
      ..._strengthItems(board, week, safeToday),
      _runningItem(cache, season, week, runningPlan, safeToday),
    ];
    const due = items.filter(item => item.state !== 'planned');
    const achievedCount = due.filter(item => item.state === 'achieved').length;
    const state = due.length === 0 ? 'planned' : achievedCount === due.length ? 'achieved' : achievedCount > 0 ? 'partial' : 'not-achieved';
    return {
      ...week,
      state,
      achievedCount,
      totalCount: due.length,
      items,
    };
  });
  return {
    state: 'ready',
    season: { ...season, weeks: weeks.length },
    weeks,
    dayCount: weeks.reduce((count, week) => count + (week.endDate >= week.startDate ? 1 : 0), 0),
    workoutDays: Object.entries(cache || {}).filter(([dateKey, day]) => seasonContainsDate(season, dateKey) && isExerciseDaySuccess(day)).length,
  };
}
