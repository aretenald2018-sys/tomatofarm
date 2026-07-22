import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonDashboardSnapshot } from '../data/season-widget-snapshot.js';
import { buildBoardFromOnboarding, paintWeek } from '../workout/test-v2/board-core.js';

const registry = {
  schemaVersion: 2,
  seasons: [{ id: 'summer', name: '여름 시즌', startDate: '2026-07-01', endDate: '2026-08-31' }],
};

function workoutDay(distanceKm = 0) {
  return {
    exercises: [{ exerciseId: 'squat', sets: [{ kg: 100, reps: 5, done: true }] }],
    ...(distanceKm ? { running: true, runDistance: distanceKm, runDurationMin: distanceKm * 6, runDurationSec: 0 } : {}),
  };
}

test('위젯 snapshot은 시즌 스트릭·러닝·헬스·주차를 한 계약으로 만든다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-01',
    selections: [{
      exerciseId: 'squat', movementId: 'back_squat', groupId: 'lower', label: '스쿼트',
      tracks: { volume: { kg: 80, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 110 },
    }],
  });
  const cache = {
    '2026-07-13': workoutDay(4),
    '2026-07-14': workoutDay(6),
    '2026-07-15': workoutDay(2),
  };
  const snapshot = buildSeasonDashboardSnapshot({
    cache, registry, todayKey: '2026-07-15', board,
    workoutPlan: { weeklySessionTarget: 4, startingOneRmByExercise: { squat: 100 } },
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    dietPlan: { _userSet: true, weight: 80, height: 180, age: 35, bodyFatPct: 20, targetWeight: 75, targetBodyFatPct: 15 },
    generatedAt: 123,
  });
  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.season.name, '여름 시즌');
  assert.equal(snapshot.season.week, 3);
  assert.equal(snapshot.streak.current, 3);
  assert.equal(snapshot.streak.todayDone, true);
  assert.equal(snapshot.running.distance.actual, 12);
  assert.equal(snapshot.running.distance.percent, 60);
  assert.equal(snapshot.food.actualKcal, 0);
  assert.equal(snapshot.food.targetKcal > 0, true);
  assert.equal(snapshot.weeklyGoal.items.length > 0, true);
  assert.equal(snapshot.recentRunning.length, 3);
  assert.equal(snapshot.strength.sessions.actual, 3);
  assert.equal(snapshot.strength.liftDeltaKg > 0, true);
  assert.match(snapshot.nextPlan.health, /스쿼트/);
});

test('웬들러 종목을 이번 주 달성하면 위젯 주간 목표가 달성으로 집계된다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-01',
    selections: [{
      exerciseId: 'squat_wide', movementId: 'back_squat', groupId: 'lower', label: '스쿼트(와이드)',
      tracks: { volume: { kg: 90, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 120 },
    }],
  });
  const benchmark = board.benchmarks[0];
  assert.equal(benchmark.program, 'wendler');
  // 웬들러는 스텝을 만들지 않는다 — 달성 로그는 benchmark.wendlerLog에만 쌓인다
  assert.equal((board.steps || []).some(step => step.benchmarkId === benchmark.id), false);
  assert.equal(paintWeek(board, { benchmarkId: benchmark.id, weekStart: '2026-07-13', log: { at: 123, amrapReps: 7 } }), true);

  const snapshot = buildSeasonDashboardSnapshot({
    cache: {}, registry, todayKey: '2026-07-15', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const strength = snapshot.weeklyGoal.items.filter(item => item.kind === 'strength');
  assert.equal(strength.length, 1);
  assert.equal(strength[0].label, '스쿼트(와이드)');
  assert.equal(strength[0].state, 'achieved');
  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
});

test('월요일이 아닌 요일(일요일)에 시작한 시즌도 이번 주 달성이 위젯에 잡힌다', () => {
  // 리그레션: paintWeek는 달성을 항상 월요일(mondayOf) 키로 저장한다.
  // 과거 season-overview는 주를 '시즌 시작 요일' 기준 7일씩 끊어, 시즌이 일요일에
  // 시작하면 이번 주 달성 주(월요일)와 어긋나 체크(✓)가 사라졌다.
  const sundayRegistry = {
    schemaVersion: 2,
    seasons: [{ id: 'sun', name: '일요일 시즌', startDate: '2026-07-05', endDate: '2026-08-31' }],
  };
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-05', // 일요일
    selections: [{
      exerciseId: 'squat_wide', movementId: 'back_squat', groupId: 'lower', label: '스쿼트(와이드)',
      tracks: { volume: { kg: 90, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 120 },
    }],
  });
  const benchmark = board.benchmarks[0];
  // 사용자가 오늘(목, 2026-07-23)이 속한 주에 달성 → mondayOf = 2026-07-20에 저장
  assert.equal(paintWeek(board, { benchmarkId: benchmark.id, weekStart: '2026-07-23', log: { at: 123, amrapReps: 7 } }), true);
  assert.deepEqual(Object.keys(benchmark.wendlerLog), ['2026-07-20']);

  const snapshot = buildSeasonDashboardSnapshot({
    cache: {}, registry: sundayRegistry, todayKey: '2026-07-23', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const strength = snapshot.weeklyGoal.items.filter(item => item.kind === 'strength');
  assert.equal(strength[0].label, '스쿼트(와이드)');
  assert.equal(strength[0].state, 'achieved');
  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
  // 위젯이 고른 주 경계도 월요일 정렬(오늘이 속한 ISO 주)이어야 한다
  assert.equal(snapshot.weeklyGoal.startDate, '2026-07-20');
  assert.equal(snapshot.weeklyGoal.endDate, '2026-07-26');
});

test('현재 시즌이 없으면 위젯은 과거 수치를 섞지 않고 설정 안내 상태를 만든다', () => {
  const snapshot = buildSeasonDashboardSnapshot({
    cache: { '2026-06-30': workoutDay(100) },
    registry,
    todayKey: '2026-09-01',
    generatedAt: 123,
  });
  const { food: _food, weeklyGoal: _weeklyGoal, recentRunning: _recentRunning, ...legacySnapshot } = snapshot;
  assert.deepEqual(legacySnapshot, {
    schemaVersion: 1,
    generatedAt: 123,
    state: 'no-season',
    message: '새 시즌을 설정해 주세요',
  });
});
