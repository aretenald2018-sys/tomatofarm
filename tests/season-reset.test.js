import test from 'node:test';
import assert from 'node:assert/strict';
import { applySettle, buildBoardFromOnboarding, activeBenchmarks, buildSettleRows, projectFutureCells } from '../workout/test-v2/board-core.js';
import {
  buildSeasonExerciseSetup,
  buildSeasonExerciseHistory,
  buildSeasonWorkoutBoard,
  buildSeasonWorkoutPlan,
  calculateSeasonWendlerFromTenRm,
  seasonResetPreview,
} from '../workout/season-reset.js';
import { W863_ORIGINAL_VERSION } from '../workout/w863-original.js';

function previousBoard() {
  const board = buildBoardFromOnboarding({
    startDate: '2026-05-04',
    selections: [
      {
        exerciseId: 'squat', movementId: 'back_squat', groupId: 'lower', label: '스쿼트',
        tracks: { volume: { kg: 80, reps: 8 } },
        wendler: { scheme: 'w531', tmKg: 90, oneRmKg: 100, cycleNo: 4, startWeek: 5 },
      },
      {
        exerciseId: 'row', movementId: 'barbell_row', groupId: 'back', label: '바벨로우',
        tracks: { volume: { kg: 50, reps: 10 }, intensity: { kg: 60, reps: 6 } },
      },
    ],
  });
  board.history.push({ settledAt: 1 });
  board.lineups['2026-06-01'] = [{ benchmarkId: board.benchmarks[0].id }];
  board.benchmarks[0].wendlerLog['2026-05-04'] = { paintedAt: 1 };
  board.steps.find(step => step.benchmarkId === board.benchmarks[1].id).weekLog['2026-05-04'] = { paintedAt: 1 };
  return board;
}

test('새 시즌 보드는 과거 로그를 분리하고 웬들러를 8/6/3 원본 W1로 재생성한다', () => {
  const previous = previousBoard();
  const next = buildSeasonWorkoutBoard({
    previousBoard: previous,
    seasonId: 'summer-2026',
    startDate: '2026-07-15',
    selectedExerciseIds: ['squat', 'row'],
    overrides: {
      squat: { wendler: { oneRmKg: 115, profileId: 'squat', incrementKg: 5, roundKg: 5 } },
      row: { tracks: { volume: { kg: 55, reps: 10 }, intensity: { kg: 65, reps: 6 } } },
    },
    createdAt: 123,
  });

  assert.equal(next.seasonId, 'summer-2026');
  assert.equal(next.createdAt, 123);
  assert.deepEqual(next.history, []);
  assert.deepEqual(next.lineups, {});
  const [squat, row] = activeBenchmarks(next);
  assert.equal(squat.program, 'wendler');
  assert.equal(squat.wendler.templateVersion, W863_ORIGINAL_VERSION);
  assert.equal(squat.wendler.scheme, 'w863');
  assert.equal(squat.wendler.cycleNo, 1);
  assert.equal(squat.wendler.startWeek, 1);
  assert.equal(squat.wendler.oneRmKg, 115);
  assert.deepEqual(squat.wendlerLog, {});
  assert.equal(next.cycles.find(cycle => cycle.groupId === 'lower').weeks, 7);
  assert.deepEqual(row.seed.volume, { kg: 55, reps: 10 });
  assert.deepEqual(row.seed.intensity, { kg: 65, reps: 6 });
  assert.ok(next.steps.every(step => Object.keys(step.weekLog).length === 0));
  assert.equal(previous.history.length, 1);
});

test('선택 종목과 시즌 운동 계획은 등록 목록 및 시작 1RM을 별도로 보존한다', () => {
  const previous = previousBoard();
  assert.deepEqual(seasonResetPreview(previous, ['squat']), {
    registeredPlanCount: 1,
    wendlerCount: 1,
    trackCount: 0,
    preservedExerciseIds: ['squat'],
  });
  const board = buildSeasonWorkoutBoard({
    previousBoard: previous,
    seasonId: 'summer-2026',
    startDate: '2026-07-15',
    selectedExerciseIds: ['squat'],
  });
  const plan = buildSeasonWorkoutPlan({
    season: { id: 'summer-2026' },
    board,
    registeredExerciseIds: ['squat', 'row', 'squat'],
    weeklySessionTarget: 4,
    clientRequestId: 'req-1',
    createdAt: 123,
  });
  assert.deepEqual(plan.registeredExerciseIds, ['squat', 'row']);
  assert.equal(plan.weeklySessionTarget, 4);
  assert.equal(plan.startingOneRmByExercise.squat, 100);
  assert.equal(plan.programVersion, W863_ORIGINAL_VERSION);
});

test('웬들러는 일반 동작명이 아니라 실제 등록 종목 ID와 이름에 연결된다', () => {
  const legacy = buildBoardFromOnboarding({
    startDate: '2026-05-04',
    selections: [{
      movementId: 'back_squat', groupId: 'lower', label: '스쿼트',
      tracks: { volume: { kg: 90, reps: 5 } },
      wendler: { scheme: 'w531', oneRmKg: 120 },
    }],
  });
  const registeredExercises = [{
    id: 'custom_squat_wide', name: '스쿼트(와이드)', movementId: 'back_squat', muscleId: 'lower',
  }];
  const setup = buildSeasonExerciseSetup({ registeredExercises, previousBoard: legacy });
  assert.equal(setup.configurations[0].program, 'wendler');
  assert.equal(setup.configurations[0].mappingSource, 'movement-id');
  assert.equal(setup.unresolvedWendler.length, 0);

  const next = buildSeasonWorkoutBoard({
    previousBoard: legacy,
    registeredExercises,
    selectedExerciseIds: ['custom_squat_wide'],
    seasonId: 'wide-squat-season',
    startDate: '2026-07-15',
  });
  const [benchmark] = activeBenchmarks(next);
  assert.equal(benchmark.exerciseId, 'custom_squat_wide');
  assert.equal(benchmark.label, '스쿼트(와이드)');
  assert.equal(benchmark.program, 'wendler');
});

test('동일 movementId 변형이 여러 개면 임의 매핑하지 않고 사용자의 명시적 선택을 요구한다', () => {
  const legacy = buildBoardFromOnboarding({
    startDate: '2026-05-04',
    selections: [{
      movementId: 'back_squat', groupId: 'lower', label: '스쿼트',
      tracks: { volume: { kg: 80, reps: 5 } },
      wendler: { scheme: 'w531', oneRmKg: 110 },
    }],
  });
  const benchmarkId = legacy.benchmarks[0].id;
  const registeredExercises = [
    { id: 'wide', name: '스쿼트(와이드)', movementId: 'back_squat', muscleId: 'lower' },
    { id: 'narrow', name: '스쿼트(내로우)', movementId: 'back_squat', muscleId: 'lower' },
  ];
  const unresolved = buildSeasonExerciseSetup({ registeredExercises, previousBoard: legacy });
  assert.equal(unresolved.unresolvedWendler.length, 1);
  assert.deepEqual(unresolved.unresolvedWendler[0].candidates.map(item => item.exerciseId), ['wide', 'narrow']);
  assert.ok(unresolved.configurations.every(item => item.program === 'stair'));

  const resolved = buildSeasonExerciseSetup({
    registeredExercises,
    previousBoard: legacy,
    benchmarkMappings: { [benchmarkId]: 'wide' },
  });
  assert.equal(resolved.unresolvedWendler.length, 0);
  assert.equal(resolved.configurations.find(item => item.exerciseId === 'wide').program, 'wendler');
  assert.equal(resolved.configurations.find(item => item.exerciseId === 'narrow').program, 'stair');
});

test('10RM 수행중량은 추정 1RM과 90% TM으로 자동 환산된다', () => {
  assert.deepEqual(calculateSeasonWendlerFromTenRm(50, 2.5), {
    tenRmKg: 50,
    estimatedOneRmKg: 66.7,
    tmKg: 60,
  });
  assert.deepEqual(calculateSeasonWendlerFromTenRm(0), {
    tenRmKg: 0,
    estimatedOneRmKg: 0,
    tmKg: 0,
  });
});

test('일반 등록 종목도 시즌 목표에서 웬들러를 선택하면 같은 ID와 이름으로 W1을 시작한다', () => {
  const registeredExercises = [{
    id: 'custom_bench', name: '벤치프레스(중간그립)', movementId: 'bench_press', muscleId: 'chest',
  }];
  const overrides = {
    custom_bench: {
      program: 'wendler',
      wendler: {
        profileId: 'bench', tenRmKg: 50, oneRmKg: 66.7, tmKg: 60, incrementKg: 2.5, roundKg: 2.5,
      },
    },
  };
  assert.deepEqual(seasonResetPreview(null, ['custom_bench'], { registeredExercises, overrides }), {
    registeredPlanCount: 1,
    wendlerCount: 1,
    trackCount: 0,
    preservedExerciseIds: ['custom_bench'],
  });
  const board = buildSeasonWorkoutBoard({
    registeredExercises,
    selectedExerciseIds: ['custom_bench'],
    seasonId: 'new-wendler-season',
    startDate: '2026-07-15',
    overrides,
  });
  const [benchmark] = activeBenchmarks(board);
  assert.equal(benchmark.exerciseId, 'custom_bench');
  assert.equal(benchmark.label, '벤치프레스(중간그립)');
  assert.equal(benchmark.program, 'wendler');
  assert.equal(benchmark.wendler.profileId, 'bench');
  assert.equal(benchmark.wendler.oneRmKg, 66.7);
  assert.equal(benchmark.wendler.tmKg, 60);
  assert.equal(benchmark.wendler.startWeek, 1);
  assert.equal(benchmark.wendler.templateVersion, W863_ORIGINAL_VERSION);
});

test('기존 웬들러 종목도 명시적으로 일반 3주 증량으로 전환할 수 있다', () => {
  const board = buildSeasonWorkoutBoard({
    previousBoard: previousBoard(),
    selectedExerciseIds: ['squat'],
    seasonId: 'stair-season',
    startDate: '2026-07-15',
    overrides: { squat: { program: 'stair', baselineKg: 90, incrementKg: 2.5 } },
  });
  const [benchmark] = activeBenchmarks(board);
  assert.equal(benchmark.exerciseId, 'squat');
  assert.equal(benchmark.program, 'stair');
  assert.equal(benchmark.progressionWeeks, 3);
  assert.equal(benchmark.incrementKg, 2.5);
});

test('일반 등록 종목은 기준중량에서 선택한 무게만큼 정확히 3주마다 증량한다', () => {
  const board = buildSeasonWorkoutBoard({
    previousBoard: null,
    registeredExercises: [{ id: 'fly', name: '플라이', movementId: 'chest_fly', muscleId: 'chest' }],
    selectedExerciseIds: ['fly'],
    seasonId: 'normal-season',
    startDate: '2026-07-15',
    overrides: { fly: { baselineKg: 40, incrementKg: 1.25 } },
  });
  const [benchmark] = activeBenchmarks(board);
  assert.equal(benchmark.exerciseId, 'fly');
  assert.equal(benchmark.label, '플라이');
  assert.equal(benchmark.progressionWeeks, 3);
  assert.equal(benchmark.incrementKg, 1.25);
  const steps = board.steps.filter(step => step.benchmarkId === benchmark.id);
  assert.deepEqual(steps.map(step => ({ kg: step.kg, span: step.span })), [
    { kg: 40, span: 3 },
    { kg: 41.25, span: 3 },
  ]);
  assert.deepEqual(projectFutureCells(board, benchmark.id, 'volume', 6).slice(0, 2).map(cell => cell.kg), [42.5, 43.75]);
});

test('같은 부위의 7주 웬들러 사이클과 섞여도 일반 종목의 3주 증량 간격은 이어진다', () => {
  const previous = buildBoardFromOnboarding({
    startDate: '2026-05-04',
    selections: [{
      exerciseId: 'wide', movementId: 'back_squat', groupId: 'lower', label: '스쿼트(와이드)',
      tracks: { volume: { kg: 90, reps: 5 } }, wendler: { scheme: 'w531', oneRmKg: 120 },
    }],
  });
  const board = buildSeasonWorkoutBoard({
    previousBoard: previous,
    registeredExercises: [
      { id: 'wide', name: '스쿼트(와이드)', movementId: 'back_squat', muscleId: 'lower' },
      { id: 'legpress', name: '레그프레스', movementId: 'leg_press', muscleId: 'lower' },
    ],
    selectedExerciseIds: ['wide', 'legpress'],
    seasonId: 'mixed-lower',
    startDate: '2026-07-15',
    overrides: { legpress: { baselineKg: 100, incrementKg: 5 } },
  });
  const legpress = activeBenchmarks(board).find(item => item.exerciseId === 'legpress');
  const firstCycleSteps = board.steps.filter(step => step.benchmarkId === legpress.id);
  assert.deepEqual(firstCycleSteps.map(step => ({ kg: step.kg, span: step.span })), [
    { kg: 100, span: 3 },
    { kg: 105, span: 3 },
    { kg: 110, span: 1 },
  ]);
  const future = projectFutureCells(board, legpress.id, 'volume', 6);
  assert.deepEqual(future.slice(0, 2).map(cell => ({ kg: cell.kg, span: cell.span })), [
    { kg: 110, span: 2 },
    { kg: 115, span: 3 },
  ]);

  applySettle(board, 'lower', {}, '2026-08-31', 123);
  const nextCycle = board.cycles.find(cycle => cycle.groupId === 'lower' && cycle.status === 'active');
  const nextSteps = board.steps.filter(step => step.benchmarkId === legpress.id && step.cycleId === nextCycle.id);
  assert.deepEqual(nextSteps.slice(0, 2).map(step => ({ kg: step.kg, span: step.span })), [
    { kg: 110, span: 2 },
    { kg: 115, span: 3 },
  ]);
});

test('최근 수행 참고자료는 운동 회차를 포함해 종목별 최신 본세트만 보존한다', () => {
  const history = buildSeasonExerciseHistory({
    '2026-07-13': {
      workoutSessions: [{ exercises: [{
        exerciseId: 'bench', name: '벤치프레스', sets: [
          { kg: 20, reps: 10, setType: 'warmup', done: true },
          { kg: 80, reps: 10, done: true },
          { kg: 80, reps: 10, done: true },
          { kg: 85, reps: 8, done: true },
        ],
      }] }],
    },
    '2026-07-10': { exercises: [{ exerciseId: 'bench', sets: [{ kg: 75, reps: 10, done: true }] }] },
    '2026-07-14': { exercises: [{ exerciseId: 'row', name: '바벨로우', sets: [{ kg: 60, reps: 8, done: true }] }] },
  }, [
    { id: 'bench', name: '벤치프레스', movementId: 'bench_press' },
    { id: 'row', name: '바벨로우', movementId: 'barbell_row' },
  ]);
  assert.deepEqual(history.bench, {
    exerciseId: 'bench', dateKey: '2026-07-13', setCount: 3,
    sets: [{ kg: 80, reps: 10 }, { kg: 80, reps: 10 }, { kg: 85, reps: 8 }],
  });
  assert.equal(history.row.dateKey, '2026-07-14');
});

test('일반 목표는 입력 완료한 볼륨·강도 트랙의 기준중량·기준세트·3주 증량을 따로 저장한다', () => {
  const board = buildSeasonWorkoutBoard({
    registeredExercises: [{ id: 'bench', name: '벤치프레스', movementId: 'bench_press', muscleId: 'chest' }],
    selectedExerciseIds: ['bench'],
    seasonId: 'dual-track-season',
    startDate: '2026-07-15',
    overrides: {
      bench: {
        program: 'stair',
        tracks: {
          volume: { kg: 80, sets: 4, incrementKg: 1.25 },
          intensity: { kg: 90, sets: 2, incrementKg: 5 },
        },
      },
    },
  });
  const [benchmark] = activeBenchmarks(board);
  assert.deepEqual(benchmark.tracks, ['volume', 'intensity']);
  assert.deepEqual(benchmark.setsByTrack, { volume: 4, intensity: 2 });
  assert.deepEqual(benchmark.incrementKgByTrack, { volume: 1.25, intensity: 5 });
  const volumeSteps = board.steps.filter(step => step.track === 'volume');
  const intensitySteps = board.steps.filter(step => step.track === 'intensity');
  assert.deepEqual(volumeSteps.map(step => [step.kg, step.sets]), [[80, 4], [81.25, 4]]);
  assert.deepEqual(intensitySteps.map(step => [step.kg, step.sets]), [[90, 2], [95, 2]]);
  assert.deepEqual(buildSettleRows(board, 'chest').map(row => [row.track, row.incrementKg, row.nextKg]), [
    ['volume', 1.25, 82.5],
    ['intensity', 5, 100],
  ]);
});

test('일반 목표의 일부 값이 비어 있으면 해당 트랙은 목표로 생성하지 않는다', () => {
  const board = buildSeasonWorkoutBoard({
    registeredExercises: [{ id: 'fly', name: '플라이', movementId: 'chest_fly', muscleId: 'chest' }],
    selectedExerciseIds: ['fly'],
    seasonId: 'partial-goal-season',
    startDate: '2026-07-15',
    overrides: {
      fly: {
        program: 'stair',
        tracks: {
          volume: { kg: 40, sets: 3, incrementKg: 2.5 },
          intensity: { kg: 50, sets: '', incrementKg: 2.5 },
        },
      },
    },
  });
  const [benchmark] = activeBenchmarks(board);
  assert.deepEqual(benchmark.tracks, ['volume']);
  assert.equal(benchmark.seed.volume.kg, 40);
});

test('종목별 기간은 진행 시계와 처방 주차를 그 종목 구간으로 옮긴다', () => {
  const board = buildSeasonWorkoutBoard({
    previousBoard: previousBoard(),
    seasonId: 'summer-2026',
    startDate: '2026-07-06', // 월요일
    selectedExerciseIds: ['squat', 'row'],
    overrides: {
      // 웬들러 종목도 자기 구간에서 시작해야 한다.
      squat: { wendler: { oneRmKg: 115, profileId: 'squat', incrementKg: 5, roundKg: 5 } },
      row: { program: 'stair', tracks: { volume: { kg: 55, reps: 10 } } },
    },
    // 로우만 8월부터 3주간 진행한다.
    exerciseWindows: { row: { startDate: '2026-08-03', endDate: '2026-08-23' } },
    createdAt: 1,
  });

  const squat = board.benchmarks.find(benchmark => benchmark.exerciseId === 'squat');
  const row = board.benchmarks.find(benchmark => benchmark.exerciseId === 'row');

  // 구간이 없는 웬들러 종목은 시즌 시작을 그대로 쓴다.
  assert.equal(squat.wendler.programStartDate, '2026-07-06');
  // 구간이 있는 종목은 자기 구간 시작에서 진행을 센다.
  assert.equal(row.progressionStartDate, '2026-08-03');

  const rowWeeks = board.steps.filter(step => step.benchmarkId === row.id).map(step => step.weekStart).sort();
  assert.ok(rowWeeks.length > 0);
  // 구간 시작 전 주차에는 처방을 만들지 않는다.
  assert.equal(rowWeeks[0], '2026-08-03');
  // 구간 종료 뒤 주차에도 만들지 않는다.
  assert.ok(rowWeeks[rowWeeks.length - 1] <= '2026-08-17', `last row week ${rowWeeks[rowWeeks.length - 1]}`);
});

test('종목별 기간이 없으면 보드는 기존과 동일하게 시즌 시작에서 계획된다', () => {
  const base = {
    previousBoard: previousBoard(),
    seasonId: 'summer-2026',
    startDate: '2026-07-06',
    selectedExerciseIds: ['row'],
    overrides: { row: { tracks: { volume: { kg: 55, reps: 10 } } } },
    createdAt: 1,
  };
  const withoutWindows = buildSeasonWorkoutBoard(base);
  const withEmptyWindows = buildSeasonWorkoutBoard({ ...base, exerciseWindows: {} });
  const stepWeeks = board => board.steps.map(step => step.weekStart).sort().join(',');
  assert.equal(stepWeeks(withEmptyWindows), stepWeeks(withoutWindows));
});
