import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestWorkoutSet,
  formatWorkoutKg,
  formatWorkoutReps,
  formatWorkoutRir,
  formatWorkoutVolumeTon,
  normalizeWorkoutSetType,
  workoutSetSummary,
  workoutSetTypeClass,
  workoutSetTypeLabel,
} from '../workout/set-presentation.js';

test('workout set presentation formats editable set values', () => {
  assert.equal(formatWorkoutKg(20.25), '20.3');
  assert.equal(formatWorkoutKg(0), '-');
  assert.equal(formatWorkoutReps(10.8), '11');
  assert.equal(formatWorkoutReps(''), '-');
  assert.equal(formatWorkoutRir({ rir: 1.25 }), '1.3');
  assert.equal(formatWorkoutRir({ rpe: 8 }), '2');
  assert.equal(formatWorkoutRir({}), '-');
  assert.equal(formatWorkoutVolumeTon(200), '0.2t');
  assert.equal(formatWorkoutVolumeTon(0), '0t');
});

test('workout set presentation keeps set type and history semantics', () => {
  assert.equal(normalizeWorkoutSetType('warmup'), 'warmup');
  assert.equal(normalizeWorkoutSetType('deload'), 'main');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'supplemental', supplementalKind: 'bbb' }), 'BBB');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'supplemental', supplementalKind: 'fsl' }), 'FSL');
  // 야들러 용어: PR세트(AMRAP)·조커 싱글·FSL/SSL 백오프
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'main', amrap: true }), 'PR');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'main' }), '메인');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'heavy_single' }), '조커');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'pr_attempt' }), '1RM');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'backoff', supplementalKind: 'fsl' }), 'FSL');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'backoff', supplementalKind: 'ssl' }), 'SSL');
  assert.equal(workoutSetTypeLabel({ wendlerRole: 'backoff' }), '백오프');
  assert.equal(workoutSetTypeLabel('failure'), '실패');
  assert.equal(workoutSetTypeLabel('deload'), '디로드');
  assert.equal(workoutSetTypeClass({ wendlerRole: 'warmup' }), 'is-warmup');
  assert.equal(workoutSetTypeClass('drop'), 'is-drop');
  assert.equal(workoutSetTypeClass('failure'), 'is-failure');
  assert.equal(workoutSetTypeClass('main'), '');

  const row = {
    setDetails: [
      { kg: 20, reps: 10 },
      { kg: 20, reps: 10 },
      { kg: 15, reps: 12 },
    ],
  };
  assert.deepEqual(bestWorkoutSet(row), { kg: 20, reps: 10 });
  assert.equal(workoutSetSummary(row), '20kg×10 2세트 / 15kg×12 1세트');
  assert.equal(workoutSetSummary({ topSetText: '30kg×8' }), '30kg×8');
});
