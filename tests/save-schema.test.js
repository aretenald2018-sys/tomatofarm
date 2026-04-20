// ================================================================
// save-schema.test.js
//   운동/식단 저장 페이로드 파티션 불변식 — 회귀 방지용.
//   실행: node --test tests/save-schema.test.js
//
// 핵심 주장:
//   (1) WORKOUT_PAYLOAD_KEYS 는 운동 도메인 필드 + 공유 bOk/lOk/dOk/sOk 만 포함.
//   (2) DIET_PAYLOAD_KEYS 는 식단 도메인 필드 + 공유 bOk/lOk/dOk/sOk 만 포함.
//   (3) 교집합 = SHARED_PAYLOAD_KEYS (즉 {bOk,lOk,dOk,sOk}).
//   (4) 운동 필드는 식단 키셋에 없음 (식단 저장이 운동 데이터 파괴 못함).
//   (5) 식단 필드는 운동 키셋에 없음 (운동 저장이 식단 데이터 파괴 못함).
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKOUT_PAYLOAD_KEYS,
  DIET_PAYLOAD_KEYS,
  SHARED_PAYLOAD_KEYS,
} from '../workout/save-schema.js';

const workoutSet = new Set(WORKOUT_PAYLOAD_KEYS);
const dietSet    = new Set(DIET_PAYLOAD_KEYS);
const sharedSet  = new Set(SHARED_PAYLOAD_KEYS);

// ── 기본 무결성 ─────────────────────────────────────────────────
test('WORKOUT_PAYLOAD_KEYS 중복 없음', () => {
  assert.equal(workoutSet.size, WORKOUT_PAYLOAD_KEYS.length);
});
test('DIET_PAYLOAD_KEYS 중복 없음', () => {
  assert.equal(dietSet.size, DIET_PAYLOAD_KEYS.length);
});
test('SHARED_PAYLOAD_KEYS = {bOk,lOk,dOk,sOk}', () => {
  assert.deepEqual([...sharedSet].sort(), ['bOk', 'dOk', 'lOk', 'sOk']);
});

// ── 교집합 = shared ─────────────────────────────────────────────
test('workout ∩ diet = SHARED_PAYLOAD_KEYS (정확히 공유 필드만 겹침)', () => {
  const intersection = [...workoutSet].filter(k => dietSet.has(k)).sort();
  const sharedSorted  = [...sharedSet].sort();
  assert.deepEqual(intersection, sharedSorted,
    '공유 외 키가 양 도메인에 걸치면 cross-domain 데이터 오염 위험');
});

// ── 핵심 회귀 방지: 운동 필드는 식단 저장이 건드리지 않아야 함 ──
const WORKOUT_ONLY_SAMPLES = [
  'exercises', 'cf', 'swimming', 'running', 'stretching',
  'runDistance', 'cfWod', 'swimStroke', 'stretchDuration',
  'workoutDuration', 'wine_free', 'memo',
  'workoutPhoto', 'gymId', 'routineMeta',
];
for (const key of WORKOUT_ONLY_SAMPLES) {
  test(`운동 필드 [${key}] 는 DIET_PAYLOAD_KEYS 에 **없음** (식단 저장이 파괴 금지)`, () => {
    assert.ok(workoutSet.has(key), `설정 오류: ${key} 가 워크아웃 키셋에 없음`);
    assert.equal(dietSet.has(key), false,
      `${key} 가 식단 payload 에 있으면 식단 자동저장이 운동 데이터를 덮어쓸 수 있음`);
  });
}

// ── 핵심 회귀 방지: 식단 필드는 운동 저장이 건드리지 않아야 함 ──
const DIET_ONLY_SAMPLES = [
  'breakfast', 'lunch', 'dinner', 'snack',
  'bKcal', 'lKcal', 'dKcal', 'sKcal',
  'bFoods', 'lFoods', 'dFoods', 'sFoods',
  'bPhoto', 'lPhoto', 'dPhoto', 'sPhoto',
  'bEstimateMeta', 'lEstimateMeta', 'dEstimateMeta', 'sEstimateMeta',
  'bProtein', 'lCarbs', 'dFat',
  'breakfast_skipped', 'lunch_skipped', 'dinner_skipped',
];
for (const key of DIET_ONLY_SAMPLES) {
  test(`식단 필드 [${key}] 는 WORKOUT_PAYLOAD_KEYS 에 **없음** (운동 저장이 파괴 금지)`, () => {
    assert.ok(dietSet.has(key), `설정 오류: ${key} 가 식단 키셋에 없음`);
    assert.equal(workoutSet.has(key), false,
      `${key} 가 운동 payload 에 있으면 운동 저장이 식단 데이터를 덮어쓸 수 있음`);
  });
}

// ── 사진 필드 중요성 — CLAUDE.md 의 과거 회귀 대응 ──────────────
test('사진 필드 5종 도메인 분리 — workoutPhoto 는 운동, 나머지 4종은 식단', () => {
  assert.ok(workoutSet.has('workoutPhoto'));
  assert.equal(dietSet.has('workoutPhoto'), false);
  for (const p of ['bPhoto', 'lPhoto', 'dPhoto', 'sPhoto']) {
    assert.ok(dietSet.has(p), `${p} 누락 → 식단 저장이 사진 삭제`);
    assert.equal(workoutSet.has(p), false,
      `${p} 가 운동 payload 에 있으면 운동 저장이 식사 사진 덮어씀`);
  }
});

// ── AI 추정 메타 4종 — CLAUDE.md 주석 "누락 시 덮어쓰기로 메타 사라짐" ──
test('EstimateMeta 4종은 식단 전용 (운동 경로가 건드리면 안됨)', () => {
  for (const k of ['bEstimateMeta', 'lEstimateMeta', 'dEstimateMeta', 'sEstimateMeta']) {
    assert.ok(dietSet.has(k));
    assert.equal(workoutSet.has(k), false);
  }
});
