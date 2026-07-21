import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonDashboardSnapshot } from '../data/season-widget-snapshot.js';
import { buildBoardFromOnboarding } from '../workout/test-v2/board-core.js';

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
