import { inferWorkoutTrack, isExerciseDaySuccess } from '../calc.js';
import {
  activeBenchmarks,
  buildExerciseProgramWorkoutPrescription,
  isWendlerBenchmark,
  mondayOf,
  normalizeLegacyPrograms,
  resolveTopSetHit,
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

// 시즌 주는 '월요일 정렬' ISO 주(월~일)로 끊는다. 달성 로그(paintWeek)는 언제나
// mondayOf 기준으로 저장되므로, 주 경계도 같은 월요일에 맞춰야 이번 주 달성이 위젯에
// 정확히 잡힌다. 시즌 시작 요일 기준으로 7일씩 끊으면(과거 방식) 시즌이 월요일이
// 아닌 요일에 시작할 때 goalWeekStart가 실제 달성 주와 어긋나 체크(✓)가 사라진다.
// (season-selectors의 startOfSeasonWeek 규약과 동일)
function _weekRanges(season) {
  const ranges = [];
  let cursor = season.startDate;
  let index = 1;
  while (cursor <= season.endDate) {
    const goalWeekStart = mondayOf(cursor);
    const weekEnd = addSeasonDays(goalWeekStart, 6);
    const endDate = weekEnd > season.endDate ? season.endDate : weekEnd;
    ranges.push({ index, startDate: cursor, endDate, goalWeekStart });
    cursor = addSeasonDays(weekEnd, 1);
    index += 1;
  }
  return ranges;
}

function _entryBenchmarkId(entry = {}) {
  return entry.recommendationMeta?.boardV2BenchmarkId
    || entry.maxPrescription?.benchmarkId
    || null;
}

function _matchesBenchmark(entry = {}, benchmark = {}) {
  const recordedBenchmarkId = _entryBenchmarkId(entry);
  if (recordedBenchmarkId) return recordedBenchmarkId === benchmark.id;
  if (entry.exerciseId && benchmark.exerciseId) return entry.exerciseId === benchmark.exerciseId;
  if (entry.movementId && benchmark.movementId) return entry.movementId === benchmark.movementId;
  const entryName = String(entry.name || '').trim();
  const benchmarkName = String(benchmark.label || '').trim();
  return !!entryName && !!benchmarkName && entryName === benchmarkName;
}

function _matchesTrack(entry = {}, track = 'volume', wendler = false) {
  if (wendler) return true;
  const actual = inferWorkoutTrack(entry).track;
  if (!actual) return true;
  return actual === (track === 'intensity' ? 'H' : 'M');
}

function _recordedWorkSets(cache = {}, benchmark = {}, track, week, wendler) {
  const rows = [];
  for (const [dateKey, day] of Object.entries(cache || {})) {
    if (dateKey < week.startDate || dateKey > week.endDate) continue;
    for (const entry of day?.exercises || []) {
      if (!_matchesBenchmark(entry, benchmark) || !_matchesTrack(entry, track, wendler)) continue;
      for (const set of entry.sets || []) {
        if (set?.setType === 'warmup' || set?.done === false) continue;
        if (_number(set?.kg) <= 0 || _number(set?.reps) <= 0) continue;
        rows.push({ ...set, dateKey });
      }
    }
  }
  return rows;
}

function _strengthItems(cache = {}, board = {}, week, todayKey) {
  return activeBenchmarks(board).flatMap(benchmark => {
    const wendler = isWendlerBenchmark(benchmark);
    const tracks = wendler ? ['volume'] : (Array.isArray(benchmark.tracks) && benchmark.tracks.length ? benchmark.tracks : ['volume']);
    return tracks.map(track => {
      const step = wendler ? null : (board.steps || [])
        .filter(candidate => candidate.benchmarkId === benchmark.id && candidate.track === track)
        .find(candidate => {
          const start = candidate.weekStart || '';
          const end = start ? addSeasonDays(start, Math.max(1, Number(candidate.span) || 1) * 7 - 1) : '';
          return start <= week.goalWeekStart && week.goalWeekStart <= end;
        });
      // 웬들러 종목은 스텝을 만들지 않고 paintWeek이 benchmark.wendlerLog에 달성을 남긴다 (board-core 계약)
      const log = (wendler ? benchmark.wendlerLog?.[week.goalWeekStart] : step?.weekLog?.[week.goalWeekStart]) || {};
      const future = week.goalWeekStart > todayKey;
      const program = wendler
        ? buildExerciseProgramWorkoutPrescription(board, benchmark, {
          track,
          weekStart: week.goalWeekStart,
          todayKey,
          includeAlternatives: false,
        })
        : null;
      // 실제 운동 기록이 정본이다. 성장 보드에서 별도 완료 도장을 찍지 않았더라도
      // 이번 주 저장된 동일 종목·트랙의 본세트가 처방 무게와 횟수를 함께 충족하면
      // 목표 달성으로 본다. 기존 도장 로그는 과거 데이터 호환과 수동 완료를 위해 유지한다.
      const workSets = future ? [] : _recordedWorkSets(cache, benchmark, track, week, wendler);
      const plan = wendler ? program?.plan : step;
      const actualHit = _number(plan?.kg) > 0 && _number(plan?.reps) > 0
        ? resolveTopSetHit(workSets, plan)
        : null;
      const boardHit = !!(log.paintedAt || log.done);
      const state = future
        ? 'planned'
        : boardHit || actualHit
          ? 'achieved'
          : log.attempted || workSets.length
            ? 'attempted'
            : 'not-achieved';
      const target = wendler
        ? (program?.prescription?.label || '웬들러 처방 확인')
        : (step ? `${step.kg || 0}kg × ${step.reps || '-'}회` : '이번 주 처방 없음');
      return {
        kind: 'strength',
        label: benchmark.label || benchmark.exerciseId || '헬스',
        detail: wendler ? target : `${track === 'intensity' ? '강도' : '볼륨'} · ${target}`,
        state,
        achievementSource: state === 'achieved' ? (boardHit ? 'board-log' : 'workout-record') : null,
        achievementDate: actualHit?.dateKey || null,
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
      ..._strengthItems(cache, board, week, safeToday),
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
