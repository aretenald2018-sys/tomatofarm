import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcSeasonWorkoutStreak,
  selectSeasonContext,
  selectSeasonRunningStats,
  selectSeasonStrengthStats,
} from '../data/season-selectors.js';

const REGISTRY = {
  schemaVersion: 2,
  seasons: [
    { id: 'old', name: '이전 시즌', startDate: '2026-05-01', endDate: '2026-06-30' },
    { id: 'current', name: '현재 시즌', startDate: '2026-07-01', endDate: '2026-08-31' },
  ],
};

const liftDay = (kg, reps = 1, exerciseId = 'squat') => ({
  exercises: [{ exerciseId, sets: [{ kg, reps, done: true }] }],
});

const runDay = (distanceKm, durationMin) => ({
  running: true,
  runDistance: distanceKm,
  runDurationMin: durationMin,
  runDurationSec: 0,
});

test('현재 시즌 context는 이전 시즌과 metadata를 의사결정 cache에서 제외한다', () => {
  const cache = {
    '2026-06-30': liftDay(300),
    '2026-07-01': liftDay(100),
    metadata: { shouldNotLeak: true },
  };
  const context = selectSeasonContext(cache, REGISTRY, { dateKey: '2026-07-15' });
  assert.equal(context.season.id, 'current');
  assert.deepEqual(Object.keys(context.cache), ['2026-07-01']);
});

test('시즌 운동 스트릭은 오늘 미완료를 0으로 만들지 않고 시즌 시작에서 멈춘다', () => {
  const cache = {
    '2026-06-30': liftDay(90),
    '2026-07-01': liftDay(100),
    '2026-07-02': {},
  };
  const result = calcSeasonWorkoutStreak(cache, REGISTRY, '2026-07-02');
  assert.deepEqual(result, { current: 1, best: 1, todayDone: false, seasonId: 'current' });
});

test('러닝 selector는 현재 주 목표와 완료된 4주 성장만 현재 시즌 기록으로 계산한다', () => {
  const cache = {
    '2026-05-31': runDay(100, 100),
    '2026-06-15': runDay(5, 30),
    '2026-06-22': runDay(5, 30),
    '2026-06-29': runDay(5, 30),
    '2026-07-06': runDay(6, 33),
    '2026-07-13': runDay(4, 22),
    '2026-07-14': runDay(8, 44),
  };
  const registry = {
    seasons: [{ id: 'long', name: '장기 시즌', startDate: '2026-06-01', endDate: '2026-08-31' }],
  };
  const stats = selectSeasonRunningStats(cache, registry, '2026-07-15', {
    weeklyDistanceKm: 20,
    weeklySessions: 3,
  });
  assert.equal(stats.currentWeek.distance.actual, 12);
  assert.equal(stats.currentWeek.distance.percent, 60);
  assert.equal(stats.currentWeek.sessions.actual, 2);
  assert.equal(stats.trend.status, 'ready');
  assert.equal(stats.trend.distanceDeltaPct, 10);
  assert.equal(stats.trend.paceImprovementSecPerKm, 16);
});

test('헬스 selector는 현재 주 볼륨, 완료 주 성장, 시즌 시작 1RM 차이를 분리한다', () => {
  const cache = {
    '2026-05-31': liftDay(300, 10),
    '2026-06-30': liftDay(100, 10, 'row'),
    '2026-07-06': liftDay(120, 10, 'row'),
    '2026-07-13': liftDay(105, 1),
    '2026-07-14': liftDay(50, 10, 'row'),
  };
  const registry = {
    seasons: [{ id: 'long', name: '장기 시즌', startDate: '2026-06-01', endDate: '2026-08-31' }],
  };
  const stats = selectSeasonStrengthStats(cache, registry, '2026-07-15', {
    weeklySessionTarget: 4,
    startingOneRmByExercise: { squat: 100 },
    exerciseLabels: { squat: '스쿼트' },
  });
  assert.equal(stats.currentWeek.sessions.actual, 2);
  assert.equal(stats.currentWeek.sessions.percent, 50);
  assert.equal(stats.currentWeek.totalVolumeKg, 605);
  assert.equal(stats.volumeTrend.status, 'ready');
  assert.equal(stats.volumeTrend.volumeDeltaPct, 20);
  assert.equal(stats.liftDeltas[0].label, '스쿼트');
  assert.equal(stats.liftDeltas[0].deltaKg, 5);
});

test('표본이 부족하면 성장률을 만들지 않고 collecting 상태를 반환한다', () => {
  const cache = { '2026-07-13': runDay(3, 20) };
  const running = selectSeasonRunningStats(cache, REGISTRY, '2026-07-15', {});
  const strength = selectSeasonStrengthStats(cache, REGISTRY, '2026-07-15', {});
  assert.equal(running.trend.status, 'collecting');
  assert.equal(strength.volumeTrend.status, 'collecting');
});

test('종목별 기간이 있으면 향상도는 그 종목 구간의 기록으로만 잰다', () => {
  const cache = {
    '2026-07-10': liftDay(120, 1, 'squat'), // 스쿼트 구간(7월) 안
    '2026-08-10': liftDay(200, 1, 'squat'), // 스쿼트 구간 밖 → 무시돼야 한다
    '2026-07-10b': undefined,
    '2026-08-12': liftDay(140, 1, 'row'), // 로우 구간(8월) 안
    '2026-07-12': liftDay(300, 1, 'row'), // 로우 구간 밖 → 무시돼야 한다
  };
  delete cache['2026-07-10b'];
  const registry = {
    seasons: [{
      id: 'windowed',
      name: '구간 시즌',
      startDate: '2026-07-01',
      endDate: '2026-08-31',
      exerciseIds: ['squat', 'row'],
      exerciseWindows: {
        squat: { startDate: '2026-07-01', endDate: '2026-07-31' },
        row: { startDate: '2026-08-01', endDate: '2026-08-31' },
      },
    }],
  };
  const stats = selectSeasonStrengthStats(cache, registry, '2026-08-15', {
    weeklySessionTarget: 4,
    startingOneRmByExercise: { squat: 100, row: 100 },
    exerciseLabels: { squat: '스쿼트', row: '바벨로우' },
  });
  const bySquat = stats.liftDeltas.find(row => row.exerciseId === 'squat');
  const byRow = stats.liftDeltas.find(row => row.exerciseId === 'row');
  // 8월 스쿼트 200kg은 스쿼트 구간 밖이므로 반영되지 않는다.
  assert.equal(bySquat.currentOneRmKg, 120);
  // 7월 로우 300kg은 로우 구간 밖이므로 반영되지 않는다.
  assert.equal(byRow.currentOneRmKg, 140);
});

test('종목별 기간이 없으면 향상도는 기존대로 시즌 전체에서 잰다', () => {
  const cache = {
    '2026-07-10': liftDay(120, 1, 'squat'),
    '2026-08-10': liftDay(200, 1, 'squat'),
  };
  const registry = {
    seasons: [{ id: 'plain', name: '일반 시즌', startDate: '2026-07-01', endDate: '2026-08-31' }],
  };
  const stats = selectSeasonStrengthStats(cache, registry, '2026-08-15', {
    startingOneRmByExercise: { squat: 100 },
    exerciseLabels: { squat: '스쿼트' },
  });
  assert.equal(stats.liftDeltas[0].currentOneRmKg, 200);
});
