import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWearStrengthContext, makeWearProgramResolver } from '../workout/wear-strength-context.js';
import {
  buildBoardFromOnboarding,
  buildExerciseProgramWorkoutPrescription,
  findExerciseProgramBenchmark,
  orderWendlerPrescriptionSets,
} from '../workout/test-v2/board-core.js';

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
  assert.equal(context.catalog[0].exercises[0].program, null);
  assert.deepEqual(context.recentExerciseIds, []);
});

// ----------------------------------------------------------------
// muscleId — 워치가 완료 페이로드로 되돌려 보내는 값
// ----------------------------------------------------------------

test('every catalog exercise carries its own muscleId, not just its group', () => {
  const context = buildDefaultContext();
  const chestGroup = context.catalog.find(group => group.muscleId === 'chest');
  assert.deepEqual(chestGroup.exercises.map(exercise => exercise.muscleId), ['chest', 'chest']);
});

// ----------------------------------------------------------------
// program — 이번 주 처방
// ----------------------------------------------------------------

test('program rows are normalized, and unusable rows are dropped rather than failing the entry', () => {
  const context = buildDefaultContext({
    programFor(exercise) {
      if (exercise.id !== 'chest_1') return null;
      return {
        kind: 'wendler',
        label: '웬들러 5/3/1 · 100kg x 5+',
        weekLabel: '3주차',
        sets: [
          { kg: 40, reps: 5, romPct: 100, setType: 'warmup', wendlerRole: 'warmup' },
          { kg: 100.04, reps: 5.4, setType: 'main', wendlerRole: 'main', amrap: true },
          { kg: 60, reps: 10, setType: 'main', wendlerRole: 'supplemental', supplementalKind: 'bbb' },
          { kg: 70, reps: 0 },          // reps <= 0 -> dropped
          { kg: Number.NaN, reps: 5 },  // non-finite kg -> dropped
          { kg: 80, reps: 3, setType: 'bogus', wendlerRole: 'bogus' },
        ],
      };
    },
  });
  const bench = context.catalog.find(g => g.muscleId === 'chest').exercises.find(e => e.exerciseId === 'chest_1');

  assert.equal(bench.program.kind, 'wendler');
  assert.equal(bench.program.weekLabel, '3주차');
  assert.deepEqual(bench.program.sets, [
    { kg: 40, reps: 5, romPct: 100, setType: 'warmup', role: 'warmup', amrap: false },
    { kg: 100, reps: 5, romPct: 100, setType: 'main', role: 'main', amrap: true },
    { kg: 60, reps: 10, romPct: 100, setType: 'main', role: 'supplemental', amrap: false, supplementalKind: 'bbb' },
    { kg: 80, reps: 3, romPct: 100, setType: 'main', role: null, amrap: false },
  ]);

  const other = context.catalog.find(g => g.muscleId === 'back').exercises[0];
  assert.equal(other.program, null, 'exercises without a program stay null');
});

test('a program whose rows are all unusable normalizes to null, not an empty prescription', () => {
  const context = buildDefaultContext({
    programFor: () => ({ kind: 'wendler', sets: [{ kg: 10, reps: 0 }] }),
  });
  const bench = context.catalog.flatMap(g => g.exercises).find(e => e.exerciseId === 'chest_1');
  assert.equal(bench.program, null);
});

test('program sets are capped at 24 rows', () => {
  const context = buildDefaultContext({
    programFor: () => ({
      kind: 'wendler',
      sets: Array.from({ length: 40 }, () => ({ kg: 50, reps: 5 })),
    }),
  });
  const bench = context.catalog.flatMap(g => g.exercises).find(e => e.exerciseId === 'chest_1');
  assert.equal(bench.program.sets.length, 24);
});

// ----------------------------------------------------------------
// makeWearProgramResolver — 실제 성장보드 처방을 그대로 통과시킨다
// ----------------------------------------------------------------

const BOARD_START = '2026-06-08';
const BOARD_TODAY = '2026-06-12';

function wendlerBoard() {
  return buildBoardFromOnboarding({
    selections: [
      {
        movementId: 'back_squat',
        label: '백스쿼트',
        groupId: 'lower',
        tracks: { volume: { kg: 100, reps: 12 }, intensity: null },
        wendler: {
          tmKg: 150,
          scheme: 'w531',
          roundKg: 2.5,
          incrementKg: 10,
          supplemental: { kind: 'bbb', pct: 50, sets: 5, reps: 10 },
        },
      },
      {
        movementId: 'leg_press',
        label: '레그프레스',
        groupId: 'lower',
        tracks: { volume: { kg: 140, reps: 12 }, intensity: null },
      },
    ],
    startDate: BOARD_START,
    source: 'test',
  });
}

function resolverFor(board, todayKey = BOARD_TODAY) {
  return makeWearProgramResolver({
    board,
    findExerciseProgramBenchmark,
    buildExerciseProgramWorkoutPrescription,
    orderWendlerPrescriptionSets,
    todayKey,
  });
}

const SQUAT = { id: 'lower_squat', muscleId: 'lower', name: '백스쿼트', movementId: 'back_squat' };
const LEG_PRESS = { id: 'lower_press', muscleId: 'lower', name: '레그프레스', movementId: 'leg_press' };

test('resolver passes the real wendler week prescription through set-for-set, in phone order', () => {
  const board = wendlerBoard();
  const benchmark = findExerciseProgramBenchmark(board, SQUAT);
  const expected = orderWendlerPrescriptionSets(
    buildExerciseProgramWorkoutPrescription(board, benchmark, {
      track: 'volume',
      todayKey: BOARD_TODAY,
      includeAlternatives: false,
    }).prescription.sets,
  );

  const program = resolverFor(board)(SQUAT);
  assert.equal(program.kind, 'wendler');
  assert.equal(program.sets.length, expected.length);
  assert.deepEqual(
    program.sets.map(set => [set.kg, set.reps]),
    expected.map(set => [set.kg, set.reps]),
  );
  assert.deepEqual(
    program.sets.map(set => set.wendlerRole),
    expected.map(set => set.wendlerRole),
  );
});

test('the resolved wendler prescription is a full 웜업/메인/보조 checklist, not a single row', () => {
  const program = resolverFor(wendlerBoard())(SQUAT);
  const normalized = buildWearStrengthContext({
    exercises: [SQUAT],
    muscles: [{ id: 'lower', name: '하체' }],
    programFor: () => program,
  }).catalog[0].exercises[0].program;

  const roles = normalized.sets.map(set => set.role);
  assert.ok(roles.includes('warmup'), '워밍업 세트가 있어야 한다');
  assert.ok(roles.includes('main'), '메인 세트가 있어야 한다');
  assert.ok(roles.includes('supplemental'), 'BBB 보조 세트가 있어야 한다');
  assert.ok(normalized.sets.some(set => set.amrap === true), 'AMRAP 톱세트가 있어야 한다');
  assert.ok(normalized.sets.length > 1, '한 줄짜리 빈 세트가 아니어야 한다');
  assert.match(normalized.weekLabel, /^\d+주차$/);
  assert.ok(normalized.label.includes('웬들러'));
  // 워치 헤더는 한 줄이라 긴 라벨이 잘린다 — 스킴 이름만 따로 내려보낸다.
  assert.match(normalized.shortLabel, /^웬들러 \S+$/);
  assert.ok(normalized.shortLabel.length < normalized.label.length);

  // 워밍업은 setType 으로, 보조/회복은 role 로 구분된다 — 워치가 둘 다 봐야 하는 이유.
  const warmups = normalized.sets.filter(set => set.role === 'warmup');
  assert.ok(warmups.every(set => set.setType === 'warmup'));
  const bbb = normalized.sets.filter(set => set.role === 'supplemental');
  assert.ok(bbb.every(set => set.setType === 'main' && set.supplementalKind === 'bbb'));
});

test('a non-wendler (track) benchmark resolves to exactly one row, matching the phone picker', () => {
  const program = resolverFor(wendlerBoard())(LEG_PRESS);
  assert.equal(program.kind, 'stair');
  assert.equal(program.sets.length, 1);
});

test('resolver returns null for an exercise with no benchmark, and when no board is available', () => {
  const board = wendlerBoard();
  assert.equal(resolverFor(board)({ id: 'x', muscleId: 'chest', name: '벤치', movementId: 'barbell_bench' }), null);
  assert.equal(resolverFor(board)({ muscleId: 'lower', name: '이름만' }), null);
  assert.equal(makeWearProgramResolver({})(SQUAT), null);
  assert.equal(makeWearProgramResolver({ board })(SQUAT), null, 'missing collaborators degrade to no program');
});

test('resolver returns null for an archived benchmark instead of prescribing a dead program', () => {
  const board = wendlerBoard();
  findExerciseProgramBenchmark(board, SQUAT).status = 'archived';
  assert.equal(resolverFor(board)(SQUAT), null);
});

test('resolver survives a throwing board without taking the whole context push down', () => {
  const program = makeWearProgramResolver({
    board: wendlerBoard(),
    findExerciseProgramBenchmark() { throw new Error('boom'); },
    buildExerciseProgramWorkoutPrescription,
  })(SQUAT);
  assert.equal(program, null);
});

test('a later week resolves a different prescription than week 1', () => {
  const board = wendlerBoard();
  const week1 = resolverFor(board, '2026-06-15')(SQUAT);
  const week2 = resolverFor(board, '2026-06-22')(SQUAT);
  assert.notDeepEqual(
    week1.sets.map(set => [set.kg, set.reps]),
    week2.sets.map(set => [set.kg, set.reps]),
  );
  assert.notEqual(week1.weekLabel, week2.weekLabel);
});
