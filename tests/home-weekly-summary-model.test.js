import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklySummaryModel, buildWeeklyStrengthGoals, buildRecentRunning, summarizeDietDay, summarizeWorkoutDay } from '../home/weekly-summary-model.js';
import { buildBoardFromOnboarding } from '../workout/test-v2/board-core.js';

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

test('최근 러닝은 주 경계와 무관하게 최근 5회를 최고 페이스로 집계한다', () => {
  const cache = {};
  // 오래된→최근 순, 점점 빨라지는 7회 (runDurationMin 감소 = 페이스 단축)
  for (const [key, dist, min] of [
    ['2026-06-01', 5, 50], ['2026-06-02', 5, 48], ['2026-06-03', 5, 46],
    ['2026-06-04', 5, 44], ['2026-06-05', 5, 42], ['2026-06-06', 5, 40], ['2026-06-07', 5, 38],
  ]) {
    cache[key] = { running: true, runDistance: dist, runDurationMin: min };
  }
  const recent = buildRecentRunning({ cache });
  assert.equal(recent.hasData, true);
  assert.equal(recent.count, 5);
  assert.equal(recent.runs.length, 5);
  assert.equal(recent.runs[0].dateKey, '2026-06-03');
  assert.equal(recent.runs[4].dateKey, '2026-06-07');
  assert.ok(recent.bestPaceSecPerKm > 0);
  assert.ok(recent.bestPriorPaceSecPerKm > recent.bestPaceSecPerKm, '최근 최고가 직전 최고보다 빠르다');
  assert.ok(recent.paceDeltaSec < 0, '개선 = 음수 초');
  assert.ok(recent.paceImprovePct > 0);
});

test('GPS 오작동(초단거리) 러닝은 최근 러닝 집계에서 제외한다', () => {
  const recent = buildRecentRunning({ cache: {
    '2026-06-01': { running: true, runDistance: 0.02, runDurationSec: 4800 }, // 비현실 페이스
    '2026-06-02': { running: true, runDistance: 3, runDurationMin: 18 },
  } });
  assert.equal(recent.hasData, true);
  assert.equal(recent.count, 1);
  assert.equal(recent.runs[0].dateKey, '2026-06-02');
});

test('러닝 기록이 없으면 최근 러닝은 빈 상태다', () => {
  const recent = buildRecentRunning({ cache: { '2026-06-01': { bKcal: 300 } } });
  assert.equal(recent.hasData, false);
  assert.equal(recent.count, 0);
  assert.deepEqual(recent.runs, []);
});

test('보드가 없으면 이번 주 근력 목표는 빈 상태다', () => {
  assert.deepEqual(buildWeeklyStrengthGoals({ board: null, todayKey: '2026-07-08' }), {
    configured: false, total: 0, doneCount: 0, goals: [],
  });
});

test('이번 주 근력 목표는 시즌 보드의 트랙별 처방을 실제로 뽑는다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-06', // 월요일
    selections: [
      {
        exerciseId: 'bench', movementId: 'barbell_bench', groupId: 'chest', label: '바벨 벤치프레스',
        tracks: { volume: { kg: 90, reps: 12 }, intensity: { kg: 105, reps: 8 } },
      },
      {
        exerciseId: 'squat', movementId: 'back_squat', groupId: 'lower', label: '스쿼트',
        tracks: { volume: { kg: 100, reps: 6 } },
        wendler: { scheme: 'w863', oneRmKg: 120 },
      },
    ],
  });
  const goals = buildWeeklyStrengthGoals({ board, todayKey: '2026-07-08' });
  assert.equal(goals.configured, true);
  assert.equal(goals.total, goals.goals.length);
  assert.equal(goals.doneCount, 0);

  const benchGoals = goals.goals.filter((goal) => goal.label === '바벨 벤치프레스');
  assert.deepEqual(benchGoals.map((goal) => goal.track).sort(), ['intensity', 'volume']);
  for (const goal of benchGoals) {
    assert.ok(goal.kg > 0 && goal.reps > 0, '목표 세트는 실제 kg·reps를 가진다');
  }

  const squatGoals = goals.goals.filter((goal) => goal.label === '스쿼트');
  assert.equal(squatGoals.length, 1);
  assert.equal(squatGoals[0].track, 'volume');
});
