import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklySummaryModel, summarizeDietDay, summarizeWorkoutDay } from '../home/weekly-summary-model.js';

test('주간 요약은 저장된 식단 필드를 실제 합계로 집계한다', () => {
  const summary = summarizeDietDay({
    breakfast: '오트밀', bKcal: 420, bProtein: 28, bCarbs: 50, bFat: 12,
    lFoods: [{ name: '닭가슴살' }], lKcal: 530, lProtein: 45, lCarbs: 30, lFat: 18,
  });
  assert.deepEqual(summary, {
    recorded: true, mealCount: 2, kcal: 950, proteinG: 73, carbG: 80, fatG: 30,
  });
});

test('주간 요약은 운동 세션과 러닝을 실제 day cache에서 읽는다', () => {
  const summary = summarizeWorkoutDay({
    exercises: [{ exerciseId: 'squat', sets: [{ kg: 60, reps: 5, done: true }] }],
    running: true, runDistance: 5, runDurationMin: 30,
  });
  assert.equal(summary.recorded, true);
  assert.equal(summary.strengthSets, 1);
  assert.equal(summary.volumeKg, 300);
  assert.ok(summary.activities.includes('strength'));
  assert.ok(summary.activities.includes('running'));
});

test('주간 집계는 현재 기간과 이전 같은 기간을 분리한다', () => {
  const model = buildWeeklySummaryModel({
    today: new Date(2026, 6, 20),
    cache: {
      '2026-07-20': { bKcal: 500, bProtein: 30, breakfast: '기록', exercises: [{ exerciseId: 'row', sets: [{ kg: 40, reps: 5, done: true }] }] },
      '2026-07-13': { bKcal: 400, bProtein: 20, breakfast: '기록' },
    },
  });
  assert.deepEqual(model.ranges.current, ['2026-07-20']);
  assert.equal(model.current.diet.kcal, 500);
  assert.equal(model.previous.diet.kcal, 400);
  assert.equal(model.current.workout.workoutDays, 1);
  assert.equal(model.current.workout.volumeKg, 200);
});
