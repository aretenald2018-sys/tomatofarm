import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  aggregateWorkoutSessions,
  deleteWorkoutSession,
  getWorkoutSessions,
  hasWorkoutGymCardData,
  hasWorkoutSessionData,
  upsertWorkoutSession,
} from '../workout/sessions.js';

test('legacy top-level workout reads as first session', () => {
  const sessions = getWorkoutSessions({
    exercises: [{ name: '벤치', sets: [{ kg: 80, reps: 8, done: true }] }],
    workoutDuration: 1200,
  }, { minCount: 3 });

  assert.equal(sessions.length, 3);
  assert.equal(sessions[0].label, '1회차');
  assert.equal(sessions[0].exercises[0].name, '벤치');
  assert.equal(hasWorkoutSessionData(sessions[0]), true);
  assert.equal(hasWorkoutSessionData(sessions[1]), false);
});

test('root running data remains visible beside a non-running session array', () => {
  const sessions = getWorkoutSessions({
    workoutSessions: [{
      id: 'strength-1',
      exercises: [{ id: 'bench', sets: [{ kg: 80, reps: 8, done: true }] }],
    }],
    running: true,
    runDistance: 5.2,
    runDurationMin: 31,
    runDurationSec: 12,
    runRouteRef: { path: 'routes/run-1' },
  });

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, 'strength-1');
  assert.equal(sessions[1].running, true);
  assert.equal(sessions[1].runDistance, 5.2);
  assert.deepEqual(sessions[1].runRouteRef, { path: 'routes/run-1' });
});

test('upsertWorkoutSession stores selected session and aggregates top-level fields', () => {
  const day = {
    exercises: [{ name: '벤치', sets: [{ kg: 80, reps: 8, done: true }] }],
    workoutDuration: 1200,
  };
  const out = upsertWorkoutSession(day, {
    exercises: [{ name: '스쿼트', sets: [{ kg: 100, reps: 5, done: true }] }],
    workoutDuration: 900,
    workoutTimeline: { mode: 'set-completion', source: 'set-completion', checkedSetCount: 3, durationSec: 900, firstSetCompletedAt: 2000, lastSetCompletedAt: 902000 },
    memo: '저녁 운동',
  }, 1, { now: 1 });

  assert.equal(out.workoutSessions.length, 2);
  assert.equal(out.workoutSessions[1].label, '2회차');
  assert.equal(out.workoutSessions[1].workoutTimeline.durationSec, 900);
  assert.equal(out.aggregate.exercises.length, 2);
  assert.equal(out.aggregate.workoutDuration, 2100);
  assert.equal(out.aggregate.workoutTimeline.durationSec, 2100);
  assert.equal(out.aggregate.workoutTimeline.checkedSetCount, 3);
  assert.match(out.aggregate.memo, /2회차: 저녁 운동/);
});

test('upsertWorkoutSession preserves running GPS route metadata', () => {
  const route = [
    { lat: 37.5209, lng: 126.977, ts: 1000, accuracy: 8 },
    { lat: 37.5215, lng: 126.979, ts: 61000, accuracy: 10 },
  ];
  const out = upsertWorkoutSession({}, {
    running: true,
    runDistance: 0.2,
    runDurationMin: 1,
    runSource: 'gps',
    runRoute: route,
    runRouteRef: {
      version: 1,
      routeId: 'v1-1000-' + 'a'.repeat(64),
      revision: 'a'.repeat(64),
      pointCount: 620,
      chunkCount: 3,
      firstTimestampMs: 1000,
      lastTimestampMs: 620000,
    },
    runRouteSummary: { source: 'gps', pointCount: 620, distanceKm: 0.2 },
    runPlaceSummary: { status: 'pending_provider', label: '장소 확인 대기' },
    runGpsAccuracySummary: { avgAccuracyM: 9 },
  }, 0, { now: 1 });

  assert.equal(hasWorkoutSessionData(out.workoutSessions[0]), true);
  assert.equal(out.aggregate.runSource, 'gps');
  assert.deepEqual(out.aggregate.runRoute, route);
  assert.equal(out.aggregate.runRouteRef.pointCount, 620);
  assert.equal(out.workoutSessions[0].runRouteRef.pointCount, 620);
  assert.equal(out.aggregate.runRouteSummary.pointCount, 620);
  assert.equal(out.aggregate.runPlaceSummary.label, '장소 확인 대기');
  assert.equal(out.aggregate.runGpsAccuracySummary.avgAccuracyM, 9);
});

test('legacy inline route without ref remains active and ref-only preview records count as data', () => {
  const legacy = getWorkoutSessions({
    runRoute: [{ lat: 37.5, lng: 127, ts: 1000 }],
    runRouteSummary: { pointCount: 1 },
  });
  assert.equal(legacy[0].runRouteRef, null);
  assert.equal(hasWorkoutSessionData(legacy[0]), true);

  assert.equal(hasWorkoutSessionData({
    runRoute: [],
    runRouteRef: { routeId: 'route-1', pointCount: 620 },
  }), true);
});

test('gym tab card indicator ignores stale metadata after the last exercise card is deleted', () => {
  const metadataOnly = {
    exercises: [],
    workoutDuration: 900,
    workoutTimeline: { durationSec: 900, checkedSetCount: 2 },
    memo: '완료한 운동 메모',
    workoutPhoto: 'data:image/jpeg;base64,photo',
  };

  assert.equal(hasWorkoutSessionData(metadataOnly), true);
  assert.equal(hasWorkoutGymCardData(metadataOnly), false);
});

test('gym tab card indicator tracks visible gym cards but excludes running-only records', () => {
  assert.equal(hasWorkoutGymCardData({ exercises: [{ exerciseId: 'bench', sets: [] }] }), true);
  assert.equal(hasWorkoutGymCardData({ cfDurationMin: 12 }), true);
  assert.equal(hasWorkoutGymCardData({ stretchMemo: '마무리 스트레칭' }), true);
  assert.equal(hasWorkoutGymCardData({ swimDistance: 500 }), true);
  assert.equal(hasWorkoutGymCardData({ exercises: [{}], workoutDuration: 600 }), false);
  assert.equal(hasWorkoutGymCardData({ running: true, runDistance: 5, runDurationMin: 30 }), false);
});

test('deleteWorkoutSession removes selected session and rebuilds aggregate', () => {
  const day = {
    workoutSessions: [
      { label: '1회차', exercises: [{ name: '벤치', sets: [{ kg: 80, reps: 8, done: true }] }], workoutDuration: 1200 },
      { label: '2회차', exercises: [{ name: '스쿼트', sets: [{ kg: 100, reps: 5, done: true }] }], workoutDuration: 900 },
    ],
  };
  const out = deleteWorkoutSession(day, 0);

  assert.equal(out.workoutSessions.length, 1);
  assert.equal(out.workoutSessions[0].label, '1회차');
  assert.equal(out.aggregate.exercises.length, 1);
  assert.equal(out.aggregate.exercises[0].name, '스쿼트');
  assert.equal(out.aggregate.workoutDuration, 900);
});

test('aggregateWorkoutSessions returns empty top-level fields when all sessions empty', () => {
  const out = aggregateWorkoutSessions([{ label: '1회차', exercises: [], workoutDuration: 0 }]);

  assert.deepEqual(out.exercises, []);
  assert.equal(out.cf, false);
  assert.equal(out.workoutDuration, 0);
  assert.equal(out.memo, '');
});
