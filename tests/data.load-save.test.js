// ================================================================
// tests/data.load-save.test.js — R4 split 회귀 방지
// ================================================================
// 대상: data/data-load.js 의 pure 함수 — _sanitizeTabList, isActiveWorkoutDayData.
// 이유: loadAll/_mergeWorkoutTwinCache 는 Firebase 모킹이 필요해 본 파일에서 제외.
//       사이드이펙트 없는 두 함수만 빠르게 검증해 "탭 정리 / 활성일 판정" 회귀를 잡는다.
// ================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { _sanitizeTabList, isActiveWorkoutDayData } from '../data/data-pure.js';

// ── _sanitizeTabList ──────────────────────────────────────────────
test('_sanitizeTabList: 배열 아닌 입력은 DEFAULT_TAB_ORDER 반환', () => {
  const out = _sanitizeTabList(null);
  assert.deepEqual(out, ['home','diet','workout','calendar','cooking','stats']);
});

test('_sanitizeTabList: 레거시 탭(finance/wine/movie/monthly/dev) 필터링', () => {
  const out = _sanitizeTabList(['home','diet','workout','calendar','finance','wine','movie','monthly','dev']);
  assert.deepEqual(out, ['home','diet','workout','calendar']);
});

test('_sanitizeTabList: live 탭만 통과 (home/diet/workout/cooking/stats/calendar/admin)', () => {
  const out = _sanitizeTabList(['home','diet','workout','calendar','cooking','stats','admin']);
  assert.deepEqual(out, ['home','diet','workout','calendar','cooking','stats','admin']);
});

test('_sanitizeTabList: required prefix [home,diet,workout,calendar] 순서 깨지면 DEFAULT 복원', () => {
  // home 이 첫번째 아니면 → 복원
  const out1 = _sanitizeTabList(['diet','home','workout','calendar']);
  assert.deepEqual(out1, ['home','diet','workout','calendar','cooking','stats']);
  // calendar 가 4번째 아니면 → 복원
  const out2 = _sanitizeTabList(['home','diet','workout','stats']);
  assert.deepEqual(out2, ['home','diet','workout','calendar','cooking','stats']);
});

test('_sanitizeTabList: 모든 탭이 레거시면 DEFAULT 복원 (cleaned 빈 배열)', () => {
  const out = _sanitizeTabList(['monthly','finance','wine','movie']);
  assert.deepEqual(out, ['home','diet','workout','calendar','cooking','stats']);
});

// ── isActiveWorkoutDayData ───────────────────────────────────────
test('isActiveWorkoutDayData: null/undefined → false', () => {
  assert.equal(isActiveWorkoutDayData(null), false);
  assert.equal(isActiveWorkoutDayData(undefined), false);
});

test('isActiveWorkoutDayData: 빈 객체 → false', () => {
  assert.equal(isActiveWorkoutDayData({}), false);
});

test('isActiveWorkoutDayData: exercises 1개 이상 → true', () => {
  assert.equal(isActiveWorkoutDayData({ exercises: [{ muscleId:'chest' }] }), true);
});

test('isActiveWorkoutDayData: cf/swimming/running/stretching boolean → true', () => {
  assert.equal(isActiveWorkoutDayData({ cf: true }), true);
  assert.equal(isActiveWorkoutDayData({ swimming: true }), true);
  assert.equal(isActiveWorkoutDayData({ running: true }), true);
  assert.equal(isActiveWorkoutDayData({ stretching: true }), true);
});

test('isActiveWorkoutDayData: runDistance/workoutDuration 양수 → true', () => {
  assert.equal(isActiveWorkoutDayData({ runDistance: 3 }), true);
  assert.equal(isActiveWorkoutDayData({ workoutDuration: 600 }), true);
});

test('isActiveWorkoutDayData: 식단 기록 (bKcal/bFoods/breakfast) → true', () => {
  assert.equal(isActiveWorkoutDayData({ bKcal: 300 }), true);
  assert.equal(isActiveWorkoutDayData({ bFoods: [{ name:'사과' }] }), true);
  assert.equal(isActiveWorkoutDayData({ breakfast: '김밥' }), true);
});

test('isActiveWorkoutDayData: 간식 기록 (sKcal/sFoods/snack) → true', () => {
  assert.equal(isActiveWorkoutDayData({ sKcal: 150 }), true);
  assert.equal(isActiveWorkoutDayData({ sFoods: [{ name:'바나나' }] }), true);
  assert.equal(isActiveWorkoutDayData({ snack: '초콜릿' }), true);
});

test('isActiveWorkoutDayData: 사진 필드(bPhoto/lPhoto/dPhoto/sPhoto/workoutPhoto) 하나라도 → true', () => {
  assert.equal(isActiveWorkoutDayData({ bPhoto: 'data:image/...' }), true);
  assert.equal(isActiveWorkoutDayData({ lPhoto: 'data:image/...' }), true);
  assert.equal(isActiveWorkoutDayData({ dPhoto: 'data:image/...' }), true);
  assert.equal(isActiveWorkoutDayData({ sPhoto: 'data:image/...' }), true);
  assert.equal(isActiveWorkoutDayData({ workoutPhoto: 'data:image/...' }), true);
});

test('isActiveWorkoutDayData: swimStroke/cfWod 문자열 trim 후 비어있으면 false', () => {
  assert.equal(isActiveWorkoutDayData({ swimStroke: '' }), false);
  assert.equal(isActiveWorkoutDayData({ swimStroke: '   ' }), false);
  assert.equal(isActiveWorkoutDayData({ swimStroke: 'freestyle' }), true);
  assert.equal(isActiveWorkoutDayData({ cfWod: 'Fran' }), true);
});

test('isActiveWorkoutDayData: 0 값 필드는 활성 아님 (boolean short-circuit)', () => {
  assert.equal(isActiveWorkoutDayData({ bKcal: 0, lKcal: 0, dKcal: 0 }), false);
  assert.equal(isActiveWorkoutDayData({ runDistance: 0, workoutDuration: 0 }), false);
});
