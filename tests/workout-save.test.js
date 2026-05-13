// ================================================================
// workout-save.test.js — 날짜별 테스트모드 초안 저장 가드
// 실행: `node --test tests/workout-save.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldKeepMaxDraftExercisesForSavePure } from '../workout/save-pure.js';

test('테스트모드가 켜져 있어도 날짜 액션이 없으면 빈 초안 운동은 저장 보존 대상이 아니다', () => {
  const workout = {
    maxMeta: { mode: 'max', dateKey: '2026-05-12', selectedMajors: [] },
    exercises: [{ exerciseId: 'bench', sets: [{ kg: 80, reps: 8, done: false }] }],
  };
  assert.equal(shouldKeepMaxDraftExercisesForSavePure(workout, '2026-05-12'), false);
});

test('현재 날짜에 선택한 큰 부위가 있으면 해당 날짜 초안은 보존한다', () => {
  const workout = {
    maxMeta: { mode: 'max', dateKey: '2026-05-12', selectedMajors: ['chest', 'tricep'] },
    exercises: [{ exerciseId: 'bench', sets: [{ kg: 80, reps: 8, done: false }] }],
  };
  assert.equal(shouldKeepMaxDraftExercisesForSavePure(workout, '2026-05-12'), true);
});

test('현재 날짜 maxPrescription 초안은 선택 부위가 비어도 보존한다', () => {
  const workout = {
    maxMeta: { mode: 'max', dateKey: '2026-05-12', selectedMajors: [] },
    exercises: [{ exerciseId: 'bench', maxPrescription: { targetSets: 4 }, sets: [{ kg: 80, reps: 8, done: false }] }],
  };
  assert.equal(shouldKeepMaxDraftExercisesForSavePure(workout, '2026-05-12'), true);
});

test('다른 날짜 maxMeta는 현재 날짜 저장의 초안 보존 트리거가 아니다', () => {
  const workout = {
    maxMeta: { mode: 'max', dateKey: '2026-05-06', selectedMajors: ['chest'] },
    exercises: [{ exerciseId: 'bench', sets: [{ kg: 80, reps: 8, done: false }] }],
  };
  assert.equal(shouldKeepMaxDraftExercisesForSavePure(workout, '2026-05-12'), false);
});
