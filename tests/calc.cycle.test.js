// ================================================================
// calc.cycle.test.js — evaluateCycleResult × dietDayOk × resolveDietTolerance 조합 테스트
// 실행: `node --test tests/calc.cycle.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateCycleResult,
  resolveDietTolerance,
  isDietDaySuccess,
  isExerciseDaySuccess,
} from '../calc.js';

// ── resolveDietTolerance ─────────────────────────────────────────
test('resolveDietTolerance · plan 없으면 50', () => {
  assert.strictEqual(resolveDietTolerance(null), 50);
  assert.strictEqual(resolveDietTolerance(undefined), 50);
});
test('resolveDietTolerance · advancedMode 꺼져 있으면 50', () => {
  assert.strictEqual(resolveDietTolerance({ advancedMode: false, dietTolerance: 30 }), 50);
});
test('resolveDietTolerance · advancedMode=true이면 dietTolerance 반환', () => {
  assert.strictEqual(resolveDietTolerance({ advancedMode: true, dietTolerance: 30 }), 30);
});
test('resolveDietTolerance · advancedMode=true이고 dietTolerance 없으면 50', () => {
  assert.strictEqual(resolveDietTolerance({ advancedMode: true }), 50);
});

// ── evaluateCycleResult 기본 케이스 ─────────────────────────────
test('evaluateCycleResult · 식단/운동 모두 성공', () => {
  const dayResults = [
    { date: '2026-01-01', intake: 1500, target: 1800, dayData: { bKcal: 600, lKcal: 600, dKcal: 300, breakfast: '닭가슴살', exercises: [{ sets: [{ done: true, kg: 60, reps: 10 }] }] } },
    { date: '2026-01-02', intake: 1500, target: 1800, dayData: { bKcal: 600, lKcal: 600, dKcal: 300, breakfast: '오트밀', cf: true } },
    { date: '2026-01-03', intake: 1500, target: 1800, dayData: { bKcal: 600, lKcal: 600, dKcal: 300, breakfast: '현미밥', running: true } },
  ];
  const result = evaluateCycleResult(dayResults, null);
  assert.strictEqual(result.dietAllSuccess, true);
  assert.strictEqual(result.exerciseAllSuccess, true);
  assert.strictEqual(result.tomatoesAwarded, 2);
});

test('evaluateCycleResult · 식단 기록 없으면 실패(false)', () => {
  const dayResults = [
    { date: '2026-01-01', intake: 0, target: 1800, dayData: {} },
    { date: '2026-01-02', intake: 0, target: 1800, dayData: {} },
    { date: '2026-01-03', intake: 0, target: 1800, dayData: {} },
  ];
  const result = evaluateCycleResult(dayResults, null);
  assert.strictEqual(result.dietAllSuccess, false);
  assert.ok(result.dietSuccesses.every(s => s === false));
});

test('evaluateCycleResult · 운동 실패 시 exerciseAllSuccess=false, 토마토 1개만', () => {
  const dayResults = [
    { date: '2026-01-01', intake: 1500, target: 1800, dayData: { bKcal: 1500, breakfast: '현미밥' } },
    { date: '2026-01-02', intake: 1500, target: 1800, dayData: { bKcal: 1500, breakfast: '닭' } },
    { date: '2026-01-03', intake: 1500, target: 1800, dayData: { bKcal: 1500, breakfast: '두부' } },
  ];
  const result = evaluateCycleResult(dayResults, null);
  assert.strictEqual(result.dietAllSuccess, true);
  assert.strictEqual(result.exerciseAllSuccess, false);
  assert.strictEqual(result.tomatoesAwarded, 1); // 식단만
});

test('evaluateCycleResult · advanced tolerance 30 — 50kcal 초과는 실패, 30kcal 이내면 성공', () => {
  const plan = { advancedMode: true, dietTolerance: 30 };
  // intake=1840, target=1800 → 40 초과 → tolerance 30이면 fail
  const dayResults1 = [
    { date: '2026-01-01', intake: 1840, target: 1800, dayData: { bKcal: 1840, breakfast: '닭' } },
    { date: '2026-01-02', intake: 1840, target: 1800, dayData: { bKcal: 1840, breakfast: '닭' } },
    { date: '2026-01-03', intake: 1840, target: 1800, dayData: { bKcal: 1840, breakfast: '닭' } },
  ];
  assert.strictEqual(evaluateCycleResult(dayResults1, plan).dietAllSuccess, false);

  // intake=1820, target=1800 → 20 초과 → tolerance 30이면 success
  const dayResults2 = [
    { date: '2026-01-01', intake: 1820, target: 1800, dayData: { bKcal: 1820, breakfast: '닭' } },
    { date: '2026-01-02', intake: 1820, target: 1800, dayData: { bKcal: 1820, breakfast: '닭' } },
    { date: '2026-01-03', intake: 1820, target: 1800, dayData: { bKcal: 1820, breakfast: '닭' } },
  ];
  assert.strictEqual(evaluateCycleResult(dayResults2, plan).dietAllSuccess, true);
});

test('evaluateCycleResult · food-chip만 있어도 식단 판정에 포함', () => {
  const dayResults = [
    { date: '2026-01-01', intake: 1500, target: 1800, dayData: { bKcal: 1500, bFoods: [{ name: '닭가슴살', kcal: 150 }] } },
    { date: '2026-01-02', intake: 1500, target: 1800, dayData: { bKcal: 1500, lFoods: [{ name: '현미밥', kcal: 200 }] } },
    { date: '2026-01-03', intake: 1500, target: 1800, dayData: { bKcal: 1500, sFoods: [{ name: '고구마', kcal: 100 }] } },
  ];
  const result = evaluateCycleResult(dayResults, null);
  assert.strictEqual(result.dietAllSuccess, true);
});

test('evaluateCycleResult · skip 플래그만 있으면 식단 기록 있는 것으로 처리', () => {
  const dayResults = [
    { date: '2026-01-01', intake: 0, target: 1800, dayData: { breakfast_skipped: true } },
    { date: '2026-01-02', intake: 0, target: 1800, dayData: { lunch_skipped: true } },
    { date: '2026-01-03', intake: 0, target: 1800, dayData: { dinner_skipped: true } },
  ];
  const result = evaluateCycleResult(dayResults, null);
  // hasRecord=true이나 kcal=0이므로 isDietDaySuccess(0, 1800, 50) = false
  assert.strictEqual(result.dietAllSuccess, false);
});

test('evaluateCycleResult · stretching-only도 운동 성공', () => {
  const dayResults = [
    { date: '2026-01-01', intake: 1500, target: 1800, dayData: { breakfast: '오트밀', bKcal: 1500, stretching: true } },
    { date: '2026-01-02', intake: 1500, target: 1800, dayData: { breakfast: '오트밀', bKcal: 1500, stretching: true } },
    { date: '2026-01-03', intake: 1500, target: 1800, dayData: { breakfast: '오트밀', bKcal: 1500, stretching: true } },
  ];
  const result = evaluateCycleResult(dayResults, null);
  assert.strictEqual(result.exerciseAllSuccess, true);
});

test('evaluateCycleResult · sKcal 포함 계산', () => {
  // bKcal+lKcal+dKcal=1700 → 초과, sKcal=0이면 fail. sKcal=-200하면... 실제로는 sKcal 포함 total 체크.
  const dayResults = [
    { date: '2026-01-01', intake: 1700, target: 1800, dayData: { bKcal: 700, lKcal: 600, dKcal: 400, sKcal: 0, breakfast: '닭' } },
  ];
  const result = evaluateCycleResult(dayResults, null);
  // 1700 <= 1800+50 → success
  assert.strictEqual(result.dietSuccesses[0], true);
});
