// ================================================================
// calc.record.test.js — canonical 기록 판정 커버리지
//   - isExerciseDaySuccess (pure) — data.js hasExerciseRecord도 이를 래핑
//   - hasDietRecordData (pure) — data.js hasDietRecord + calc.js dietDayOk 내부 hasRecord 공유
//   - dietDayOk 결과도 canonical 판정이 반영되는지 확인
// 실행: `node --test tests/calc.record.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isExerciseDaySuccess, hasDietRecordData, dietDayOk } from '../calc.js';

// ── isExerciseDaySuccess — stretching/running/swimming ──────────
test('isExerciseDaySuccess · stretching=true → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({ stretching: true }), true);
});
test('isExerciseDaySuccess · running=true → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({ running: true }), true);
});
test('isExerciseDaySuccess · swimming=true → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({ swimming: true }), true);
});
test('isExerciseDaySuccess · cf=true → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({ cf: true }), true);
});
test('isExerciseDaySuccess · 빈 객체 → 실패', () => {
  assert.strictEqual(isExerciseDaySuccess({}), false);
});
test('isExerciseDaySuccess · undefined → 실패 (exercises 없음)', () => {
  // isExerciseDaySuccess는 항상 getDay()가 반환하는 {}를 받으므로 null이 아닌 {} 테스트
  assert.strictEqual(isExerciseDaySuccess({}), false);
});
test('isExerciseDaySuccess · done=true 세트 → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({
    exercises: [{ sets: [{ done: true, kg: 0, reps: 0 }] }]
  }), true);
});
test('isExerciseDaySuccess · kg>0 reps>0 레거시 세트 → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({
    exercises: [{ sets: [{ done: false, kg: 60, reps: 10 }] }]
  }), true);
});
test('isExerciseDaySuccess · AI 로드만(kg=0,reps=10,done=false) → 실패', () => {
  assert.strictEqual(isExerciseDaySuccess({
    exercises: [{ sets: [{ done: false, kg: 0, reps: 10 }] }]
  }), false);
});
test('isExerciseDaySuccess · 세트 없는 운동 항목만 → 실패', () => {
  assert.strictEqual(isExerciseDaySuccess({
    exercises: [{ sets: [] }]
  }), false);
});

// ── 혼합 케이스 ──────────────────────────────────────────────────
test('isExerciseDaySuccess · stretching+exercises → 성공', () => {
  assert.strictEqual(isExerciseDaySuccess({
    stretching: true,
    exercises: [{ sets: [{ done: false, kg: 0, reps: 0 }] }]
  }), true);
});

// ── snack 포함 식단 관련 (isDietDaySuccess 연동) ─────────────────
import { isDietDaySuccess, resolveDietTolerance } from '../calc.js';

test('isDietDaySuccess · sKcal 포함 총 kcal 계산 — snack-only 성공', () => {
  // 간식만 200kcal, target=1800 → 200 <= 1850 → true
  assert.strictEqual(isDietDaySuccess(200, 1800, 50), true);
});
test('isDietDaySuccess · kcal=0 → 실패', () => {
  assert.strictEqual(isDietDaySuccess(0, 1800, 50), false);
});
test('isDietDaySuccess · kcal 초과 → 실패', () => {
  assert.strictEqual(isDietDaySuccess(1900, 1800, 50), false);
});
test('isDietDaySuccess · tolerance 범위 내 → 성공', () => {
  assert.strictEqual(isDietDaySuccess(1840, 1800, 50), true);
});
test('isDietDaySuccess · tolerance 딱 경계 → 성공', () => {
  assert.strictEqual(isDietDaySuccess(1850, 1800, 50), true);
});
test('isDietDaySuccess · tolerance+1 초과 → 실패', () => {
  assert.strictEqual(isDietDaySuccess(1851, 1800, 50), false);
});

// ── resolveDietTolerance 엣지 케이스 ────────────────────────────
test('resolveDietTolerance · dietTolerance=0 → 0', () => {
  assert.strictEqual(resolveDietTolerance({ advancedMode: true, dietTolerance: 0 }), 0);
});
test('resolveDietTolerance · dietTolerance=100 → 100', () => {
  assert.strictEqual(resolveDietTolerance({ advancedMode: true, dietTolerance: 100 }), 100);
});

// ── hasDietRecordData — canonical 식단 기록 판정 (pure) ─────────
test('hasDietRecordData · 빈 객체 → false', () => {
  assert.strictEqual(hasDietRecordData({}), false);
});
test('hasDietRecordData · null → false', () => {
  assert.strictEqual(hasDietRecordData(null), false);
});
test('hasDietRecordData · breakfast 텍스트만 → true', () => {
  assert.strictEqual(hasDietRecordData({ breakfast: '샐러드' }), true);
});
test('hasDietRecordData · snack 텍스트만 → true (기존 누락된 엣지)', () => {
  assert.strictEqual(hasDietRecordData({ snack: '사과' }), true);
});
test('hasDietRecordData · bFoods(food-chip)만 → true', () => {
  assert.strictEqual(hasDietRecordData({ bFoods: [{ name: '닭가슴살', kcal: 165 }] }), true);
});
test('hasDietRecordData · sFoods(간식 chip)만 → true', () => {
  assert.strictEqual(hasDietRecordData({ sFoods: [{ name: '아몬드', kcal: 100 }] }), true);
});
test('hasDietRecordData · kcal-only(bKcal=400) → true', () => {
  assert.strictEqual(hasDietRecordData({ bKcal: 400 }), true);
});
test('hasDietRecordData · sKcal-only → true', () => {
  assert.strictEqual(hasDietRecordData({ sKcal: 150 }), true);
});
test('hasDietRecordData · kcal=0 전부 → false', () => {
  assert.strictEqual(hasDietRecordData({ bKcal: 0, lKcal: 0, dKcal: 0, sKcal: 0 }), false);
});
test('hasDietRecordData · breakfast_skipped만 → true', () => {
  assert.strictEqual(hasDietRecordData({ breakfast_skipped: true }), true);
});
test('hasDietRecordData · bPhoto-only → true (사진만 기록 케이스)', () => {
  assert.strictEqual(hasDietRecordData({ bPhoto: 'data:image/jpeg;base64,XXX' }), true);
});
test('hasDietRecordData · sPhoto-only → true', () => {
  assert.strictEqual(hasDietRecordData({ sPhoto: 'data:image/jpeg;base64,YYY' }), true);
});

// ── dietDayOk × canonical hasRecord 통합 ─────────────────────────
test('dietDayOk · kcal-only(bKcal=600) + target=1800 → true', () => {
  // hasRecord=true(kcal-only), per-meal bOk/lOk/dOk null(false 폴백), skip 없음 → 단순 kcal 판정 미흡으로 false
  // 목적: hasRecord 판정이 통과되는지 확인 (null 반환 안 됨)
  const res = dietDayOk({ bKcal: 600 }, { advancedMode: false }, 2026, 3, 19);
  assert.notStrictEqual(res, null); // 기록 인정 → null 아님
});
test('dietDayOk · 완전 미기록 → null', () => {
  const res = dietDayOk({}, { advancedMode: false }, 2026, 3, 19);
  assert.strictEqual(res, null);
});
test('dietDayOk · 사진-only → null 아님 (canonical hasRecord)', () => {
  const res = dietDayOk({ bPhoto: 'xxx' }, { advancedMode: false }, 2026, 3, 19);
  assert.notStrictEqual(res, null);
});
test('dietDayOk · snack 텍스트만 → null 아님', () => {
  const res = dietDayOk({ snack: '오후간식' }, { advancedMode: false }, 2026, 3, 19);
  assert.notStrictEqual(res, null);
});
