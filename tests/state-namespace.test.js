// ================================================================
// state-namespace.test.js
//   2026-04-21 S 네임스페이스 분할 불변식 회귀 방지.
//   실행: node --test tests/state-namespace.test.js
//
// 검증:
//   (1) S.workout / S.diet / S.shared 세 네임스페이스가 존재.
//   (2) 운동 필드는 S.workout 아래, 식단 필드는 S.diet 아래, date는 S.shared 아래.
//   (3) S 루트에는 flat 접근이 더 이상 없음 (shim 제거 완료 — 네임스페이스 필수).
//   (4) S.diet = newObj 재할당 시 내부 참조는 유지되고 프로퍼티만 교체 (in-place mutate).
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { S, emptyDiet } from '../workout/state.js';

// ── 1) 네임스페이스 존재 ──────────────────────────────────────
test('S 루트에 workout / diet / shared 3 네임스페이스 존재', () => {
  assert.ok(S.workout && typeof S.workout === 'object');
  assert.ok(S.diet && typeof S.diet === 'object');
  assert.ok(S.shared && typeof S.shared === 'object');
});

// ── 2) 운동 필드 배치 ─────────────────────────────────────────
test('운동 필드는 S.workout 아래 존재', () => {
  const expected = [
    'exercises', 'hiddenExercises',
    'cf', 'stretching', 'swimming', 'running',
    'runData', 'cfData', 'stretchData', 'swimData',
    'wineFree',
    'workoutStartTime', 'workoutDuration', 'workoutTimerInterval', 'workoutTimerDate',
    'restTimer',
    'currentGymId', 'routineMeta', 'maxMeta',
  ];
  for (const k of expected) {
    assert.ok(k in S.workout, `S.workout.${k} 누락 — 네임스페이스 회귀`);
  }
});

test('식단 필드는 S.diet 아래 존재 (skipped 플래그 포함)', () => {
  const expected = [
    'breakfast', 'lunch', 'dinner', 'snack',
    'breakfastSkipped', 'lunchSkipped', 'dinnerSkipped',
    'bOk', 'lOk', 'dOk', 'sOk',
    'bKcal', 'lKcal', 'dKcal', 'sKcal',
    'bReason', 'lReason', 'dReason', 'sReason',
    'bFoods', 'lFoods', 'dFoods', 'sFoods',
    'bEstimateMeta', 'lEstimateMeta', 'dEstimateMeta', 'sEstimateMeta',
  ];
  for (const k of expected) {
    assert.ok(k in S.diet, `S.diet.${k} 누락`);
  }
});

test('date 는 S.shared 아래 (루트 아님)', () => {
  assert.ok('date' in S.shared, 'S.shared.date 누락');
});

// ── 3) 루트 flat 접근 **금지** — shim 이 남아있으면 실패 ──────
test('S 루트에 flat shim 존재 금지 (S.exercises, S.cf 등 — 네임스페이스 필수)', () => {
  const forbidden = [
    'exercises', 'hiddenExercises', 'cf', 'stretching', 'swimming', 'running',
    'runData', 'cfData', 'stretchData', 'swimData', 'wineFree',
    'workoutStartTime', 'workoutDuration', 'workoutTimerInterval', 'workoutTimerDate',
    'restTimer', 'currentGymId', 'routineMeta', 'maxMeta',
    'breakfastSkipped', 'lunchSkipped', 'dinnerSkipped', 'date',
  ];
  // `in` 연산자는 own + 상속 프로퍼티 포함. Object.hasOwn 만 주장.
  for (const k of forbidden) {
    assert.equal(Object.hasOwn(S, k), false,
      `S.${k} 가 루트에 있으면 도메인 경계 회귀 — 네임스페이스 접근 (S.workout.${k} 또는 S.diet.${k}) 으로 교체`);
  }
});

// ── 4) S.diet 재할당 in-place 의미론 ─────────────────────────
test('S.diet = newObj 재할당 시 참조는 유지, 프로퍼티만 교체', () => {
  const before = S.diet;
  S.diet = { ...emptyDiet(), breakfast: '갈비탕' };
  const after = S.diet;
  assert.equal(before, after, 'S.diet 참조가 바뀌면 외부 포인터가 stale 될 수 있음');
  assert.equal(after.breakfast, '갈비탕');
  // 원복
  S.diet = emptyDiet();
});

test('S.diet 에 없는 키가 새 객체에 없으면 삭제됨 (cleanup)', () => {
  S.diet = { ...emptyDiet(), extraKey: 'foo' };
  assert.equal(S.diet.extraKey, 'foo');
  S.diet = emptyDiet();
  assert.equal('extraKey' in S.diet, false, 'in-place mutate 가 기존 키를 정리해야 함');
});

// ── emptyDiet 기본값 ──────────────────────────────────────────
test('emptyDiet() 는 식단 기본값 생성 — skipped 플래그 포함', () => {
  const d = emptyDiet();
  assert.equal(d.breakfast, '');
  assert.equal(d.breakfastSkipped, false);
  assert.equal(d.lunchSkipped, false);
  assert.equal(d.dinnerSkipped, false);
  assert.equal(d.bKcal, 0);
  assert.deepEqual(d.bFoods, []);
});
