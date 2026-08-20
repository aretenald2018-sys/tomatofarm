import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeWorkoutTrack,
  buildWorkoutTrackTrend,
  formatWorkoutTrackValue,
  isWendlerTrackRow,
  workoutFallbackSparkValues,
  workoutTrackLabel,
} from '../workout/track-metrics.js';

test('workout track metrics classify tracks and format mass values', () => {
  assert.equal(activeWorkoutTrack({}, { reps: 10 }), 'M');
  assert.equal(activeWorkoutTrack({}, { reps: 5 }), 'H');
  assert.equal(activeWorkoutTrack({ maxTrackPreference: 'M' }, { reps: 5 }), 'M');
  assert.equal(workoutTrackLabel('M'), '볼륨');
  assert.equal(workoutTrackLabel('H'), '강도');
  assert.equal(formatWorkoutTrackValue('M', 200), '200kg');
  assert.equal(formatWorkoutTrackValue('M', 1000), '1t');
  assert.equal(formatWorkoutTrackValue('H', 85.7), '86kg');
});

test('wendler rows collapse to the single W track (calendar rows and raw entries alike)', () => {
  // 캘린더 read-model row(setDetails)와 원본 엔트리(sets) 양쪽 shape 지원.
  const calendarRow = { setDetails: [{ kg: 97.5, reps: 4, wendlerRole: 'main' }], recommendationMeta: null };
  const rawEntry = { sets: [{ kg: 86.3, reps: 8, wendlerRole: 'backoff' }] };
  const metaEntry = { recommendationMeta: { program: 'wendler' }, setDetails: [] };
  assert.equal(isWendlerTrackRow(calendarRow), true);
  assert.equal(isWendlerTrackRow(rawEntry), true);
  assert.equal(isWendlerTrackRow(metaEntry), true);
  assert.equal(isWendlerTrackRow({ setDetails: [{ kg: 60, reps: 10, wendlerRole: '' }] }), false);

  // 웬들러면 볼륨/강도 이분화 대신 W 단일 트랙이 활성이다.
  assert.equal(activeWorkoutTrack(calendarRow, { kg: 97.5, reps: 4 }), 'W');
  assert.equal(workoutTrackLabel('W'), '웬들러');
  assert.equal(formatWorkoutTrackValue('W', 139.4), '139kg');
  assert.equal(formatWorkoutTrackValue('W', 0), 'e1RM');

  // W 트렌드 fallback은 메인 세트 e1RM만 본다(백오프 섞이면 히스토리와 어긋남).
  const row = {
    exerciseId: null,
    setCount: 2,
    setDetails: [
      { kg: 97.5, reps: 4, wendlerRole: 'main' },
      { kg: 75, reps: 8, wendlerRole: 'backoff' },
    ],
  };
  const trend = buildWorkoutTrackTrend(row, { kg: 97.5, reps: 4 }, { cache: {}, exList: [] }, 'W');
  assert.equal(trend.track, 'W');
  assert.equal(trend.trackLabel, '웬들러');
  assert.match(trend.valueLabel, /^\d+kg$/);
  const sparkValues = workoutFallbackSparkValues(row, 'W');
  assert.equal(sparkValues.length, 3, '메인 세트 1개면 평평한 3점으로 채운다');
  assert.ok(sparkValues.every(v => v === sparkValues[0] && v > 97.5), '메인 세트 e1RM 기반이어야 한다');
});

test('workout track metrics fall back to recorded sets without DOM state', () => {
  const row = {
    volume: 200,
    setCount: 1,
    setDetails: [{ kg: 20, reps: 10 }],
  };
  assert.deepEqual(workoutFallbackSparkValues(row, 'M'), [200, 200, 200]);
  const trend = buildWorkoutTrackTrend(row, { kg: 20, reps: 10 }, { cache: {}, exList: [] }, 'M');
  assert.equal(trend.track, 'M');
  assert.equal(trend.valueLabel, '200kg');
  assert.equal(trend.bottomLabel, '20kg');
});
