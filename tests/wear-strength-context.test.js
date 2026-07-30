import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWearStrengthContext } from '../workout/wear-strength-context.js';

const MUSCLES = [
  { id: 'back', name: '등' },
  { id: 'shoulder', name: '어깨' },
  { id: 'chest', name: '가슴' },
  { id: 'lower', name: '하체' },
];

// Deliberately out of muscle-group order to prove catalog grouping follows
// the injected `muscles` order, not the exercise array's insertion order.
const EXERCISES = [
  { id: 'chest_1', muscleId: 'chest', name: '바벨 벤치프레스', movementId: 'barbell_bench' },
  { id: 'chest_2', muscleId: 'chest', name: '덤벨 벤치프레스', movementId: 'dumbbell_bench' },
  { id: 'shoulder_1', muscleId: 'shoulder', name: '사이드 레터럴 레이즈', movementId: 'lateral_raise' },
  { id: 'lower_1', muscleId: 'lower', name: '레그프레스', movementId: 'leg_press', incrementKg: 5 },
  { id: 'back_1', muscleId: 'back', name: '랫풀다운', movementId: 'unmapped_movement' },
];

const MOVEMENTS = {
  barbell_bench: { stepKg: 2.5 },
  lateral_raise: { stepKg: 1 },
  // leg_press intentionally absent -> exercise.incrementKg fallback.
  // unmapped_movement intentionally absent -> default 2.5.
};

function manySets(count, kgStart = 40) {
  return Array.from({ length: count }, (_, index) => ({
    kg: kgStart + index,
    reps: 8,
    romPct: 100,
    setType: 'main',
    done: true,
  }));
}

const LAST_SESSIONS = {
  chest_1: { dateKey: '2026-07-20', sets: manySets(13) },
  back_1: { dateKey: '2026-07-25', sets: [{ kg: 60, reps: 10, romPct: 100, setType: 'main', done: true }] },
  lower_1: { dateKey: '2026-07-10', sets: [{ kg: 100, reps: 5, romPct: 100, setType: 'main', done: true }] },
  // chest_2 has no last session.
};

function lastSessionFor(exerciseId) {
  return LAST_SESSIONS[exerciseId] || null;
}

function buildDefaultContext(overrides = {}) {
  return buildWearStrengthContext({
    exercises: EXERCISES,
    muscles: MUSCLES,
    movements: MOVEMENTS,
    lastSessionFor,
    now: 1_800_000_000_000,
    ...overrides,
  });
}

test('envelope fields and catalog grouping follow the injected muscle order', () => {
  const context = buildDefaultContext();
  assert.equal(context.payloadVersion, 1);
  assert.equal(context.type, 'strength-context');
  assert.equal(context.generatedAt, 1_800_000_000_000);
  assert.deepEqual(context.catalog.map(group => group.muscleId), ['back', 'shoulder', 'chest', 'lower']);
  assert.equal(context.catalog.find(g => g.muscleId === 'chest').exercises.length, 2);
});

test('each catalog exercise inlines lastSession (or null) with a 12-set cap', () => {
  const context = buildDefaultContext();
  const chestGroup = context.catalog.find(g => g.muscleId === 'chest');
  const bench = chestGroup.exercises.find(e => e.exerciseId === 'chest_1');
  const dumbbellBench = chestGroup.exercises.find(e => e.exerciseId === 'chest_2');

  assert.equal(bench.lastSession.dateKey, '2026-07-20');
  assert.equal(bench.lastSession.sets.length, 12, 'lastSession sets are capped at 12');
  assert.equal(bench.lastSession.sets[0].kg, 40);

  assert.equal(dumbbellBench.lastSession, null, 'no session on record yields null');
});

test('lastSession sets carry rir when the record has one, null otherwise', () => {
  const context = buildDefaultContext({
    lastSessionFor(exerciseId) {
      if (exerciseId !== 'back_1') return null;
      return {
        dateKey: '2026-07-25',
        sets: [
          { kg: 60, reps: 10, romPct: 100, rir: 2.4, setType: 'main', done: true },
          { kg: 65, reps: 8, romPct: 100, setType: 'main', done: true },
        ],
      };
    },
  });
  const row = context.catalog.find(g => g.muscleId === 'back').exercises.find(e => e.exerciseId === 'back_1');

  assert.equal(row.lastSession.sets[0].rir, 2, 'rir rounds to an integer');
  assert.equal(row.lastSession.sets[1].rir, null, 'missing rir normalizes to null');
});

test('recentExerciseIds are ordered by lastSession dateKey descending and exclude sessionless exercises', () => {
  const context = buildDefaultContext();
  assert.deepEqual(context.recentExerciseIds, ['back_1', 'chest_1', 'lower_1']);
});

test('recentExerciseIds respects recentLimit', () => {
  const context = buildDefaultContext({ recentLimit: 1 });
  assert.deepEqual(context.recentExerciseIds, ['back_1']);
});

test('stepKg: movement override wins, then exercise.incrementKg, then 2.5 default', () => {
  const context = buildDefaultContext();
  const findExercise = (exerciseId) => context.catalog
    .flatMap(group => group.exercises)
    .find(exercise => exercise.exerciseId === exerciseId);

  assert.equal(findExercise('shoulder_1').stepKg, 1, 'movement.stepKg override');
  assert.equal(findExercise('lower_1').stepKg, 5, 'exercise.incrementKg fallback when movement has no stepKg');
  assert.equal(findExercise('back_1').stepKg, 2.5, 'default 2.5 when neither is available');
  assert.equal(findExercise('chest_1').stepKg, 2.5, 'explicit movement.stepKg of 2.5');
});

test('exerciseLimit caps the total number of catalog exercises across all muscle groups', () => {
  const context = buildDefaultContext({ exerciseLimit: 2 });
  const totalExercises = context.catalog.reduce((sum, group) => sum + group.exercises.length, 0);
  assert.equal(totalExercises, 2);
  // "back" sorts first in the injected muscle order, so it fills the cap first.
  assert.deepEqual(context.catalog.map(group => group.muscleId), ['back', 'shoulder']);
});

test('muscle groups with no matching exercises are omitted from the catalog', () => {
  const context = buildWearStrengthContext({
    exercises: [{ id: 'chest_1', muscleId: 'chest', name: '벤치', movementId: 'barbell_bench' }],
    muscles: MUSCLES,
    movements: MOVEMENTS,
    lastSessionFor: () => null,
  });
  assert.deepEqual(context.catalog.map(group => group.muscleId), ['chest']);
});

test('pure builder tolerates missing dependency-injected callbacks with sane defaults', () => {
  const context = buildWearStrengthContext({
    exercises: [{ id: 'chest_1', muscleId: 'chest', name: '벤치', movementId: 'barbell_bench' }],
    muscles: [{ id: 'chest', name: '가슴' }],
  });
  assert.equal(context.catalog[0].exercises[0].stepKg, 2.5);
  assert.equal(context.catalog[0].exercises[0].lastSession, null);
  assert.deepEqual(context.recentExerciseIds, []);
});
