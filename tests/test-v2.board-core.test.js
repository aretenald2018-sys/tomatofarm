// ================================================================
// test-v2.board-core.test.js — 테스트모드 v2 성장 보드 순수 로직 테스트
// 실행: `node --test tests/test-v2.board-core.test.js`
// Contract target: workout/test-v2/ public behavior.
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TM2_DEFAULTS, TM2_GROUPS,
  mondayOf, addWeeks, weeksBetween, weekIndexOf, isCycleFinished, shortDate,
  groupForMajor, defaultIncrementForGroup, exerciseGroupId, buildRecentMap,
  resolveSessionEntryGroupId,
  mergeSessionExercises, sessionRecentMap, sortCandidatesByRecent,
  buildOnboardingCandidates, buildBoardFromOnboarding,
  activeBenchmarks, activeCycleOf, benchmarkById, currentKgOf,
  expandColumnCells, projectFutureCells, paintWeek, recordMiss, previewAdjust,
  workoutRecordsForBenchmarkWeek,
  getLineup, toggleLineup,
  isSettleDue, buildSettleRows, applySettle,
  archiveBenchmark, addBenchmark,
  findExerciseProgramBenchmark, getExerciseProgramSettings, upsertExerciseProgramBenchmark,
  buildExerciseProgramWorkoutPrescription, orderWendlerPrescriptionSets,
  buildMinimapData, recentPaintLogs, cloneBoard, mergeBoardCompletionLogs,
} from '../workout/test-v2/board-core.js';
import { wendlerWeekPrescription, WENDLER_SCHEMES, defaultWendlerIncrement } from '../workout/test-v2/wendler.js';

// 공통 픽스처 — 2026-06-08(월) 시작, 오늘 2026-06-12(금)
const TODAY = '2026-06-12';
const START = '2026-06-08';

function fixtureBoard() {
  const selections = [
    { movementId: 'barbell_bench', label: '벤치프레스', groupId: 'chest',
      tracks: { volume: { kg: 80, reps: 12 }, intensity: { kg: 90, reps: 8 } } },
    { movementId: 'chest_fly', label: '플라이', groupId: 'chest',
      tracks: { volume: { kg: 27.5, reps: 15 }, intensity: null } },
    { movementId: 'back_squat', label: '백스쿼트', groupId: 'lower',
      tracks: { volume: { kg: 100, reps: 12 }, intensity: null },
      wendler: { tmKg: 150, scheme: 'w863', roundKg: 2.5, incrementKg: 10,
                 supplemental: { kind: 'bbb', pct: 50, sets: 5, reps: 10 } } },
    { movementId: 'leg_press', label: '레그프레스', groupId: 'lower',
      tracks: { volume: { kg: 140, reps: 12 }, intensity: null } },
  ];
  return buildBoardFromOnboarding({ selections, startDate: START, source: 'test' });
}

// ----------------------------------------------------------------
// 날짜/기본값
// ----------------------------------------------------------------

test('날짜: mondayOf는 주의 월요일을 돌려준다 (일요일 포함)', () => {
  assert.equal(mondayOf('2026-06-12'), '2026-06-08'); // 금
  assert.equal(mondayOf('2026-06-08'), '2026-06-08'); // 월
  assert.equal(mondayOf('2026-06-14'), '2026-06-08'); // 일
  assert.equal(mondayOf('2026-06-15'), '2026-06-15'); // 다음 월
});

test('날짜: weeksBetween/weekIndexOf/사이클 종료 판정', () => {
  assert.equal(weeksBetween(START, '2026-07-13'), 5);
  const cycle = { startDate: START, weeks: 6 };
  assert.equal(weekIndexOf(cycle, TODAY), 1);
  assert.equal(weekIndexOf(cycle, '2026-07-13'), 6);
  assert.equal(isCycleFinished(cycle, '2026-07-19'), false); // 6주차 일요일
  assert.equal(isCycleFinished(cycle, '2026-07-20'), true);  // 7주차 월요일
  assert.equal(shortDate(START), '6/8');
});

test('기본값: 6주 증량 — 상체 +2.5 / 하체 +10 (계약 11)', () => {
  assert.equal(TM2_DEFAULTS.incrementUpperKg, 2.5);
  assert.equal(TM2_DEFAULTS.incrementLowerKg, 10);
  assert.equal(defaultIncrementForGroup('chest'), 2.5);
  assert.equal(defaultIncrementForGroup('lower'), 10);
  assert.equal(groupForMajor('glute').id, 'lower');
  assert.equal(groupForMajor('tricep').id, 'arm');
  assert.equal(groupForMajor('abs').id, 'abs');
  assert.equal(defaultWendlerIncrement('lower'), 10);
  assert.equal(defaultWendlerIncrement('chest'), 2.5);
});

// ----------------------------------------------------------------
// 보드 생성 / 온보딩
// ----------------------------------------------------------------

test('보드 생성: 그룹별 사이클 + 사이클당 1스텝(6주 유지) 기본 계획', () => {
  const b = fixtureBoard();
  assert.equal(b.version, 2);
  assert.equal(b.cycles.length, 2); // chest, lower
  const chest = activeCycleOf(b, 'chest');
  assert.equal(chest.startDate, START);
  assert.equal(chest.weeks, 6);
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  assert.deepEqual(bench.tracks, ['volume', 'intensity']);
  assert.equal(bench.incrementKg, 2.5); // 상체 기본
  const benchSteps = b.steps.filter(s => s.benchmarkId === bench.id);
  assert.equal(benchSteps.length, 2); // 트랙당 1스텝
  assert.equal(benchSteps[0].span, 6);
  // 웬들러 종목은 스텝 없음 (파생)
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  assert.equal(squat.program, 'wendler');
  assert.equal(squat.programStartDate, START);
  assert.equal(squat.wendler.incrementKg, 10); // 하체 기본
  assert.equal(squat.wendler.templateVersion, 'w863-original-v1');
  assert.equal(squat.wendler.profileId, 'squat');
  assert.equal(activeCycleOf(b, 'lower').weeks, 7);
  assert.deepEqual(squat.wendler.tmAnchors.map(a => ({ weekStart: a.weekStart, tmKg: a.tmKg })), [
    { weekStart: START, tmKg: 150 },
  ]);
  assert.equal(b.steps.filter(s => s.benchmarkId === squat.id).length, 0);
});

test('exerciseGroupId: muscleId/subPattern/movementId로 그룹 판정, abs는 복부 그룹', () => {
  assert.equal(exerciseGroupId({ muscleId: 'lower' }), 'lower');
  assert.equal(exerciseGroupId({ muscleId: 'glute' }), 'lower');     // 둔부 → 하체 그룹
  assert.equal(exerciseGroupId({ muscleId: 'tricep' }), 'arm');
  assert.equal(exerciseGroupId({ muscleId: 'quad' }), 'lower');      // subPattern
  assert.equal(exerciseGroupId({ muscleId: 'chest_upper' }), 'chest');
  assert.equal(exerciseGroupId({ muscleId: 'abs' }), 'abs');
  assert.equal(exerciseGroupId({ muscleId: 'muscle_custom123', movementId: 'back_squat' }, [{ id: 'back_squat', primary: 'lower' }]), 'lower');
});

test('exerciseGroupId: posterior 계열 등 운동은 성장 보드 등 그룹으로 분류된다', () => {
  const movements = [
    { id: 'rdl', primary: 'back', subPattern: 'posterior' },
    { id: 'lat_pulldown', primary: 'back', subPattern: 'back_width' },
  ];
  assert.equal(exerciseGroupId({ muscleIds: ['posterior'], movementId: 'rdl' }, movements), 'back');

  const cands = buildOnboardingCandidates({
    exList: [{ id: 'ex_rdl', name: '루마니안 데드리프트', movementId: 'rdl', muscleIds: ['posterior'] }],
    movements,
    recentMap: {},
  });
  assert.equal(cands.find(c => c.exerciseId === 'ex_rdl')?.groupId, 'back');
});

test('resolveSessionEntryGroupId: 오늘 세션 entry가 exerciseId만 가져도 등록 운동 부위로 복원한다', () => {
  const exList = [
    { id: 'custom_bench_today', name: '오늘 벤치', muscleId: 'chest', movementId: 'barbell_bench' },
    { id: 'custom_curl_today', name: '오늘 컬', muscleId: 'bicep', movementId: 'barbell_curl' },
  ];
  assert.equal(
    resolveSessionEntryGroupId({ exerciseId: 'custom_bench_today', sets: [{ kg: 60, reps: 10 }] }, { exList, movements: [] }),
    'chest'
  );
  assert.equal(
    resolveSessionEntryGroupId({ exerciseId: 'custom_curl_today', sets: [{ kg: 20, reps: 12 }] }, { exList, movements: [] }),
    'arm'
  );
});

test('buildRecentMap: 캐시에서 종목별 최근 본세트 최대 무게', () => {
  const cache = {
    '2026-05-01': { exercises: [{ exerciseId: 'ex1', name: '스쿼트', sets: [{ kg: 90, reps: 5, done: true, setType: 'main' }] }] },
    '2026-06-01': { exercises: [{ exerciseId: 'ex1', name: '스쿼트', sets: [{ kg: 40, reps: 10, setType: 'warmup', done: true }, { kg: 100, reps: 5, done: true }, { kg: 110, reps: 3, done: true }] }] },
  };
  const map = buildRecentMap(cache);
  assert.equal(map['id:ex1'].kg, 110);   // 최근 날짜 + 최대 본세트
  assert.equal(map['id:ex1'].reps, 3);
  assert.equal(map['nm:스쿼트'].kg, 110);
});

test('온보딩 후보: 실제 등록 종목(exList) 1순위 + v1 시작무게/최근 기록 상속 + abs 포함', () => {
  const exList = [
    { id: 'custom_bench', name: '바벨 벤치프레스', muscleId: 'chest', movementId: 'barbell_bench' },
    { id: 'custom_squat_wide', name: '스쿼트(와이드)', muscleId: 'lower', movementId: 'back_squat' },
    { id: 'custom_fly', name: '플라이', muscleId: 'chest', movementId: 'chest_fly' },
    { id: 'custom_crunch', name: '케이블 크런치', muscleId: 'abs', movementId: 'cable_crunch' },
  ];
  const v1Cycle = { benchmarks: [
    { id: 'bm_chest', movementId: 'barbell_bench', primaryMajor: 'chest',
      tracks: { M: { enabled: true, startKg: 77.5, startReps: 12 }, H: { enabled: true, startKg: 87.5, startReps: 8 } } },
  ] };
  const recentMap = buildRecentMap({
    '2026-06-01': { exercises: [{ exerciseId: 'custom_squat_wide', name: '스쿼트(와이드)', sets: [{ kg: 100, reps: 5, done: true }, { kg: 110, reps: 3, done: true }] }] },
  });
  const cands = buildOnboardingCandidates({ exList, v1Cycle, movements: [], recentMap });
  const bench = cands.find(c => c.exerciseId === 'custom_bench');
  assert.equal(bench.source, 'registry');
  assert.equal(bench.groupId, 'chest');
  assert.equal(bench.tracks.volume.kg, 77.5);      // 최근 기록 없음 → v1 상속
  assert.equal(bench.tracks.intensity.kg, 87.5);   // v1 강도 트랙 상속
  assert.equal(bench.defaultOn, true);
  const squat = cands.find(c => c.exerciseId === 'custom_squat_wide');
  assert.equal(squat.groupId, 'lower');
  assert.equal(squat.tracks.volume.kg, 110);       // 최근 기록(최대 본세트) 우선
  assert.equal(squat.tracks.volume.from, '최근 기록');
  const fly = cands.find(c => c.exerciseId === 'custom_fly');
  assert.equal(fly.tracks.volume.manual, true);    // 기록·v1 없음 → 직접 입력
  assert.equal(fly.defaultOn, true);               // 기본 동작(movementId) 매칭
  const crunch = cands.find(c => c.exerciseId === 'custom_crunch');
  assert.equal(crunch.groupId, 'abs');
  assert.equal(crunch.defaultOn, true);
});

test('온보딩 후보: 오늘 세션의 커스텀 하체 종목도 후보와 시작무게로 병합된다', () => {
  const sessionEntries = [{
    exerciseId: 'custom_1778990759855',
    name: '스모데드',
    muscleId: 'lower',
    sets: [
      { kg: 60, reps: 20, setType: 'warmup', done: true },
      { kg: 80, reps: 17, setType: 'main', done: true },
      { kg: 85, reps: 8, setType: 'main', done: true },
    ],
  }];
  const exList = mergeSessionExercises([], sessionEntries);
  const recentMap = sessionRecentMap(sessionEntries);
  const cands = buildOnboardingCandidates({ exList, movements: [], recentMap });
  const sumo = cands.find(c => c.exerciseId === 'custom_1778990759855');
  assert.ok(sumo);
  assert.equal(sumo.label, '스모데드');
  assert.equal(sumo.groupId, 'lower');
  assert.equal(sumo.tracks.volume.kg, 85);
  assert.equal(sumo.tracks.volume.reps, 8);
  assert.equal(sumo.defaultOn, true);
});

test('온보딩 후보: v2 보드의 웬들러 설정을 다음 기본값으로 상속하고, 기본 계단 변경은 우선한다', () => {
  const exList = [{ id: 'custom_1778990759855', name: '스모데드', muscleId: 'lower' }];
  const wendlerBoard = {
    benchmarks: [{
      id: 'bm_sumo',
      exerciseId: 'custom_1778990759855',
      groupId: 'lower',
      program: 'wendler',
      seed: { volume: { kg: 90, reps: 8 } },
      tracks: ['volume'],
      wendler: { tmKg: 102.5, scheme: 'w863', roundKg: 2.5, incrementKg: 10 },
    }],
  };
  const cands = buildOnboardingCandidates({ exList, v2Board: wendlerBoard, movements: [], recentMap: {} });
  assert.equal(cands[0].wendler.tmKg, 102.5);
  assert.equal(cands[0].tracks.volume.kg, 90);

  const stairBoard = {
    benchmarks: [{ ...wendlerBoard.benchmarks[0], program: 'stair', wendler: null }],
  };
  const legacyV1 = {
    benchmarks: [{
      exerciseId: 'custom_1778990759855',
      program: 'wendler',
      wendler: { tmKg: 120, scheme: 'w531' },
    }],
  };
  const stairCands = buildOnboardingCandidates({ exList, v1Cycle: legacyV1, v2Board: stairBoard, movements: [], recentMap: {} });
  assert.equal(stairCands[0].wendler, null);

  const libraryCands = buildOnboardingCandidates({
    exList: [],
    v2Board: {
      benchmarks: [{
        movementId: 'back_squat',
        groupId: 'lower',
        program: 'wendler',
        seed: { volume: { kg: 100, reps: 8 } },
        tracks: ['volume'],
        wendler: { tmKg: 150, scheme: 'w863' },
      }],
    },
    movements: [{ id: 'back_squat', primary: 'lower', nameKo: '백스쿼트' }],
    recentMap: {},
  });
  assert.equal(libraryCands[0].wendler.tmKg, 150);
});

test('종목 추가 후보: 같은 부위 안에서 최근 수행일이 최신인 운동이 먼저 온다', () => {
  const exList = [
    { id: 'leg_press', name: '레그 프레스 머신', muscleId: 'lower', movementId: 'leg_press' },
    { id: 'squat', name: '스쿼트', muscleId: 'lower', movementId: 'back_squat' },
    { id: 'lunge', name: '런지', muscleId: 'lower', movementId: 'lunge' },
  ];
  const recentMap = buildRecentMap({
    '2026-06-01': { exercises: [{ exerciseId: 'squat', name: '스쿼트', sets: [{ kg: 100, reps: 5, done: true }] }] },
    '2026-06-15': { exercises: [{ exerciseId: 'leg_press', name: '레그 프레스 머신', sets: [{ kg: 120, reps: 12, done: true }] }] },
  });
  const candidates = buildOnboardingCandidates({ exList, movements: [], recentMap }).filter(c => c.groupId === 'lower');
  const sorted = sortCandidatesByRecent(candidates);
  assert.deepEqual(sorted.map(c => c.exerciseId), ['leg_press', 'squat', 'lunge']);
});

// ----------------------------------------------------------------
// 셀 전개
// ----------------------------------------------------------------

test('셀 전개(stair): 1스텝=span6 + 이번 주 포함이면 now', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const cy = activeCycleOf(b, 'chest');
  const cells = expandColumnCells(b, bench.id, 'volume', cy.id, TODAY);
  assert.equal(cells.length, 1);
  assert.equal(cells[0].kind, 'stair');
  assert.equal(cells[0].span, 6);
  assert.equal(cells[0].kg, 80);
  assert.equal(cells[0].state, 'now');
  assert.equal(cells[0].dots.length, 6);
  assert.equal(cells[0].dots[0].on, false);
});

test('셀 전개(wendler): 8/6/3 원본은 W7 회복까지 주당 1칸이다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  const cy = activeCycleOf(b, 'lower');
  const cells = expandColumnCells(b, squat.id, 'volume', cy.id, TODAY);
  assert.equal(cells.length, 7);
  assert.deepEqual(cells.map(c => c.kg), [120, 130, 137.5, 120, 130, 137.5, 97.5]);
  assert.equal(cells[0].repsLabel, '×8+');
  assert.match(cells[0].subLabel, /72.7%/);
  assert.doesNotMatch(cells[0].subLabel, /BBB/);
  assert.equal(cells[0].state, 'now');
  assert.equal(cells[1].state, 'plan');
});

test('웬들러 처방: 시작 주차와 준비운동을 반영한다', () => {
  const rx = wendlerWeekPrescription({
    tmKg: 120,
    scheme: 'w863',
    startWeek: 2,
    roundKg: 2.5,
    supplemental: { kind: 'bbb', pct: 50, sets: 5, reps: 10 },
  }, 1);
  assert.equal(rx.week, 2);
  assert.equal(rx.topSet.kg, 102.5);
  assert.equal(rx.topSet.reps, 6);
  assert.deepEqual(rx.warmup.sets.map(s => s.kg), [47.5, 60, 72.5]);
  assert.equal(rx.supplemental, null);
});

test('투영 셀(계약: 18주): 활성 이후 미래 사이클 = 현재 + 증량폭×offset', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const proj = projectFutureCells(b, bench.id, 'volume', 12); // 활성 6주 + 앞으로 12주 = 18주
  assert.ok(proj.length >= 2);                 // 최소 2개 미래 사이클(stair 1칸씩)
  assert.equal(proj[0].kg, 82.5);              // 80 + 2.5×1
  assert.equal(proj[0].state, 'future');
  assert.equal(proj[0].projected, true);
  assert.equal(proj[0].weekStart, addWeeks(START, 6)); // 활성 사이클 직후
  assert.equal(proj[1].kg, 85);                // 80 + 2.5×2
  // 하체 웬들러 투영: TM + 10×offset → 주당 1칸
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  const wProj = projectFutureCells(b, squat.id, 'volume', 12);
  assert.equal(wProj.length >= 12, true);      // 미래 사이클당 7칸
  assert.equal(wProj[0].kg, 127.5);            // 1RM 166.7+10의 원본 W1 톱세트 비례
});

// ----------------------------------------------------------------
// 색칠 / 못 채움 / 조정
// ----------------------------------------------------------------

test('색칠(계약 4): paintWeek → weekLog 기록, 전 주 색칠 시 스텝 done', () => {
  const b = fixtureBoard();
  const fly = b.benchmarks.find(x => x.movementId === 'chest_fly');
  const cy = activeCycleOf(b, 'chest');
  for (let w = 0; w < 6; w++) {
    const ok = paintWeek(b, { benchmarkId: fly.id, track: 'volume', weekStart: addWeeks(START, w), log: { at: 1, actualReps: '15', rir: 2 } });
    assert.equal(ok, true);
  }
  const cells = expandColumnCells(b, fly.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].state, 'done');
  assert.equal(cells[0].dots.every(d => d.on), true);
  const recents = recentPaintLogs(b, fly.id, 'volume', addWeeks(START, 6));
  assert.equal(recents.length, 2);
  assert.equal(recents[0].weekStart, addWeeks(START, 5)); // 최신 우선
});

test('색칠(wendler): wendlerLog에 한계 세트 횟수 기록', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  paintWeek(b, { benchmarkId: squat.id, weekStart: TODAY, log: { at: 1, amrapReps: 11, suppDone: true } });
  assert.equal(squat.wendlerLog[START].amrapReps, 11);
  const cy = activeCycleOf(b, 'lower');
  const cells = expandColumnCells(b, squat.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].state, 'done');
});

test('저장 병합: 오래된 보드 저장이 이미 찍힌 완료 도장을 지우지 않는다', () => {
  const latest = fixtureBoard();
  const stale = cloneBoard(latest);
  const fly = latest.benchmarks.find(x => x.movementId === 'chest_fly');
  const cy = activeCycleOf(latest, 'chest');
  paintWeek(latest, { benchmarkId: fly.id, track: 'volume', weekStart: START, log: { at: 123, actualReps: '15' } });

  const merged = mergeBoardCompletionLogs(latest, stale);
  const cells = expandColumnCells(merged, fly.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].dots[0].on, true);
  const step = merged.steps.find(s => s.benchmarkId === fly.id && s.track === 'volume');
  assert.equal(step.weekLog[START].paintedAt, 123);
});

test('저장 병합(wendler): 오래된 보드 저장이 웬들러 완료 도장을 지우지 않는다', () => {
  const latest = fixtureBoard();
  const stale = cloneBoard(latest);
  const squat = latest.benchmarks.find(x => x.movementId === 'back_squat');
  const cy = activeCycleOf(latest, 'lower');
  paintWeek(latest, { benchmarkId: squat.id, weekStart: START, log: { at: 456, amrapReps: 11, suppDone: true } });

  const merged = mergeBoardCompletionLogs(latest, stale);
  const mergedSquat = merged.benchmarks.find(x => x.movementId === 'back_squat');
  const cells = expandColumnCells(merged, mergedSquat.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].state, 'done');
  assert.equal(mergedSquat.wendlerLog[START].paintedAt, 456);
});

test('못 채움 + 한 주 더 도전(계약 5): 다중 스텝에서 뒤 칸이 밀리고 사이클 끝에서 클립', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const cy = activeCycleOf(b, 'chest');
  // 수동으로 2스텝 구성: 80×12 (3주) + 82.5×12 (3주)
  const step = b.steps.find(s => s.benchmarkId === bench.id && s.track === 'volume');
  step.span = 3;
  b.steps.push({ ...step, id: 'st_manual2', weekStart: addWeeks(START, 3), span: 3, kg: 82.5, weekLog: {} });

  recordMiss(b, { benchmarkId: bench.id, track: 'volume', weekStart: addWeeks(START, 2), choice: 'extend', log: { actualReps: '9' } });
  const cells = expandColumnCells(b, bench.id, 'volume', cy.id, TODAY);
  const stair = cells.filter(c => c.kind === 'stair');
  assert.equal(stair[0].span, 4);                 // 80×12 한 주 연장
  assert.equal(stair[0].state, 'attempted');
  assert.equal(stair[0].weekStates[2], 'attempted');
  assert.equal(stair[0].dots[2].attempted, true);
  assert.equal(stair[1].weekStart, addWeeks(START, 4)); // 뒤 칸 1주 밀림
  assert.equal(stair[1].span, 2);                 // 사이클 끝 클립 (6주 안)
  assert.equal(stair[0].span + stair[1].span, 6);
});

test('목표 미달 수행 칸은 attempted 상태지만 정산 missed count는 유지한다', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const cy = activeCycleOf(b, 'chest');
  recordMiss(b, {
    benchmarkId: bench.id,
    track: 'intensity',
    weekStart: START,
    choice: 'none',
    log: { at: 1, actualKg: 102.5, actualReps: '5' },
  });

  const cells = expandColumnCells(b, bench.id, 'intensity', cy.id, TODAY);
  assert.equal(cells[0].state, 'attempted');
  assert.equal(cells[0].weekStates[0], 'attempted');
  assert.equal(cells[0].dots[0].attempted, true);

  const row = buildSettleRows(b, 'chest').find(r => r.benchmarkId === bench.id && r.track === 'intensity');
  assert.equal(row.missedCount, 1);
  assert.equal(row.defaultDecision, 'hold');
});

test('수행 값 없이 못 채운 칸은 기존 miss 상태를 유지한다', () => {
  const b = fixtureBoard();
  const fly = b.benchmarks.find(x => x.movementId === 'chest_fly');
  const cy = activeCycleOf(b, 'chest');
  recordMiss(b, { benchmarkId: fly.id, track: 'volume', weekStart: START, choice: 'none' });

  const cells = expandColumnCells(b, fly.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].state, 'miss');
  assert.equal(cells[0].weekStates[0], 'miss');
});

test('못 채움 + 무게 내리기/횟수 낮추기', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  recordMiss(b, { benchmarkId: bench.id, track: 'volume', weekStart: TODAY, choice: 'lowerKg', params: { deltaKg: 2.5 } });
  let step = b.steps.find(s => s.benchmarkId === bench.id && s.track === 'volume');
  assert.equal(step.kg, 77.5);
  assert.equal(step.state, 'planned'); // 재도전 상태
  recordMiss(b, { benchmarkId: bench.id, track: 'volume', weekStart: TODAY, choice: 'lowerReps', params: { reps: 10 } });
  step = b.steps.find(s => s.benchmarkId === bench.id && s.track === 'volume');
  assert.equal(step.reps, 10);
});

test('previewAdjust: 원본 보드는 변형하지 않는다', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const { before, after } = previewAdjust(b, {
    benchmarkId: bench.id, track: 'volume', weekStart: TODAY, choice: 'lowerKg', params: { deltaKg: 2.5 },
  }, TODAY);
  assert.equal(before[0].kg, 80);
  assert.equal(after[0].kg, 77.5);
  assert.equal(b.steps.find(s => s.benchmarkId === bench.id && s.track === 'volume').kg, 80); // 원본 보존
});

// ----------------------------------------------------------------
// 오늘의 배열 (계약 13)
// ----------------------------------------------------------------

test('오늘의 배열: 담기/빼기 토글 + 순서 유지', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const fly = b.benchmarks.find(x => x.movementId === 'chest_fly');
  toggleLineup(b, TODAY, bench.id, 'volume');
  toggleLineup(b, TODAY, fly.id, 'volume');
  toggleLineup(b, TODAY, bench.id, 'intensity');
  let lineup = getLineup(b, TODAY);
  assert.equal(lineup.length, 3);
  assert.deepEqual(lineup.map(x => x.order), [0, 1, 2]);
  // 가운데 빼기 → 순서 재계산
  toggleLineup(b, TODAY, fly.id, 'volume');
  lineup = getLineup(b, TODAY);
  assert.equal(lineup.length, 2);
  assert.deepEqual(lineup.map(x => `${x.benchmarkId}:${x.track}`), [`${bench.id}:volume`, `${bench.id}:intensity`]);
  assert.deepEqual(lineup.map(x => x.order), [0, 1]);
});

// ----------------------------------------------------------------
// 정산 (계약 6·7·8)
// ----------------------------------------------------------------

test('정산: 성장폭=종목 설정값(상체 2.5/하체 10), 못 채운 종목은 유지 기본', () => {
  const b = fixtureBoard();
  const afterCycle = '2026-07-20'; // 6주 종료 후
  assert.equal(isSettleDue(b, 'chest', TODAY), false);
  assert.equal(isSettleDue(b, 'chest', afterCycle), true);

  const fly = b.benchmarks.find(x => x.movementId === 'chest_fly');
  recordMiss(b, { benchmarkId: fly.id, track: 'volume', weekStart: addWeeks(START, 4), choice: 'none' });

  const rows = buildSettleRows(b, 'chest');
  const benchVol = rows.find(r => r.trackLabel === '볼륨' && r.label === '벤치프레스');
  assert.equal(benchVol.nextKg, 82.5);          // 80 + 2.5
  assert.equal(benchVol.defaultDecision, 'grow');
  const flyRow = rows.find(r => r.label === '플라이');
  assert.equal(flyRow.defaultDecision, 'hold'); // 못 채움 → 유지 기본
  assert.equal(flyRow.missedCount > 0, true);

  const res = applySettle(b, 'chest', { [benchVol.key]: 'grow', [flyRow.key]: 'hold' }, afterCycle, 123);
  assert.ok(res.entry);
  assert.equal(b.history.length, 1);
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  assert.equal(currentKgOf(b, bench, 'volume').kg, 82.5); // 성장 반영
  assert.equal(currentKgOf(b, fly, 'volume').kg, 27.5);   // 유지
  // 다음 사이클 + 새 스텝 생성
  const next = activeCycleOf(b, 'chest');
  assert.notEqual(next.id, res.entry.cycleId);
  assert.equal(next.startDate, '2026-07-20');
  const newCells = expandColumnCells(b, bench.id, 'volume', next.id, afterCycle);
  assert.equal(newCells[0].kg, 82.5);
  assert.equal(newCells[0].span, 6);
});

test('정산(wendler): 8/6/3 원본은 W7 뒤 1RM + 증량폭(하체 +10)', () => {
  const b = fixtureBoard();
  const afterCycle = '2026-07-27';
  const rows = buildSettleRows(b, 'lower');
  const squatRow = rows.find(r => r.program === 'wendler');
  assert.equal(squatRow.currentKg, 166.7);
  assert.equal(squatRow.nextKg, 176.7); // +10
  applySettle(b, 'lower', { [squatRow.key]: 'grow' }, afterCycle, 1);
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  assert.equal(squat.wendler.oneRmKg, 176.7);
  assert.equal(squat.wendler.tmKg, 159);
  assert.deepEqual(squat.wendler.tmAnchors.map(a => ({ weekStart: a.weekStart, tmKg: a.tmKg, source: a.source })), [
    { weekStart: START, tmKg: 150, source: 'legacy' },
    { weekStart: afterCycle, tmKg: 159, source: 'settle' },
  ]);
  // 다음 사이클 W1 처방도 새 TM 기준
  const next = activeCycleOf(b, 'lower');
  const cells = expandColumnCells(b, squat.id, 'volume', next.id, afterCycle);
  assert.equal(cells[0].kg, 127.5);
});

// ----------------------------------------------------------------
// 종목 추가/삭제 (계약 12)
// ----------------------------------------------------------------

test('종목 빼기=보관(기록 보존) → 재추가 시 마지막 무게에서 이어서', () => {
  const b = fixtureBoard();
  const fly = b.benchmarks.find(x => x.movementId === 'chest_fly');
  paintWeek(b, { benchmarkId: fly.id, track: 'volume', weekStart: START, log: { at: 1 } });
  archiveBenchmark(b, fly.id);
  assert.equal(fly.status, 'archived');
  assert.equal(activeBenchmarks(b, 'chest').some(x => x.id === fly.id), false);
  assert.ok(b.steps.some(s => s.benchmarkId === fly.id)); // 기록/스텝 보존

  const restored = addBenchmark(b, { movementId: 'chest_fly', label: '플라이', groupId: 'chest', tracks: { volume: { kg: 27.5, reps: 15 } } }, TODAY);
  assert.equal(restored.id, fly.id); // 같은 종목 복원
  assert.equal(restored.status, 'active');
  assert.equal(currentKgOf(b, restored, 'volume').kg, 27.5); // 이어서
});

test('새 종목 추가: 다음 주 월요일부터 남은 주만큼 스텝 생성', () => {
  const b = fixtureBoard();
  const added = addBenchmark(b, {
    movementId: 'dips', label: '딥스', groupId: 'chest', tracks: { volume: { kg: 5, reps: 12 } },
  }, TODAY); // 오늘 = W1 금요일 → 다음 주 월 = W2
  const cy = activeCycleOf(b, 'chest');
  const cells = expandColumnCells(b, added.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].kind, 'rest');  // W1은 쉼
  assert.equal(cells[0].span, 1);
  assert.equal(cells[1].kind, 'stair');
  assert.equal(cells[1].weekStart, addWeeks(START, 1));
  assert.equal(cells[1].span, 5);
  assert.equal(added.incrementKg, 2.5); // 상체 기본 시드
});

test('종목 프로그램 계약: exerciseId 기준으로 기존 stair 벤치마크를 갱신한다', () => {
  const b = buildBoardFromOnboarding({
    selections: [{
      exerciseId: 'ex_bench',
      movementId: 'barbell_bench',
      label: '벤치프레스',
      groupId: 'chest',
      tracks: { volume: { kg: 80, reps: 12 } },
    }],
    startDate: START,
    source: 'test',
  });
  const before = b.benchmarks[0];
  const res = upsertExerciseProgramBenchmark(b, {
    id: 'ex_bench',
    name: '벤치프레스',
    muscleId: 'chest',
    movementId: 'barbell_bench',
  }, {
    program: 'stair',
    tracks: ['volume', 'intensity'],
    seed: {
      volume: { kg: 82.5, reps: 10 },
      intensity: { kg: 92.5, reps: 5 },
    },
    setsDefault: 5,
  }, { todayKey: TODAY });
  assert.equal(res.action, 'updated');
  assert.equal(res.benchmark.id, before.id);
  assert.equal(b.benchmarks.length, 1);
  assert.deepEqual(res.benchmark.tracks, ['volume', 'intensity']);
  assert.equal(res.benchmark.seed.volume.kg, 82.5);
  assert.equal(res.benchmark.seed.intensity.reps, 5);
  assert.equal(res.benchmark.setsDefault, 5);
  const cy = activeCycleOf(b, 'chest');
  assert.equal(b.steps.filter(s => s.benchmarkId === before.id && s.cycleId === cy.id).length, 2);
});

test('종목 프로그램 계약: 웬들러 전환은 설정을 정규화하고 활성 stair 스텝을 제거한다', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const res = upsertExerciseProgramBenchmark(b, {
    movementId: 'barbell_bench',
    name: '벤치프레스',
    muscleId: 'chest',
  }, {
    program: 'wendler',
    tracks: ['volume'],
    seed: { volume: { kg: 100, reps: 5 } },
    wendler: {
      tmKg: 120,
      scheme: 'w531',
      startWeek: 2,
      supplemental: { kind: 'fsl', sets: 3, reps: 5 },
    },
  }, { todayKey: TODAY });
  assert.equal(res.action, 'updated');
  assert.equal(res.benchmark.id, bench.id);
  assert.equal(res.benchmark.program, 'wendler');
  assert.equal(res.benchmark.wendler.scheme, 'w531');
  assert.equal(res.benchmark.wendler.startWeek, 2);
  assert.equal(res.benchmark.wendler.supplemental.kind, 'fsl');
  const cy = activeCycleOf(b, 'chest');
  assert.equal(b.steps.some(s => s.benchmarkId === bench.id && s.cycleId === cy.id), false);
});

test('종목 프로그램 계약: programStartDate는 benchmark에 저장하고 원본 w863 group cycle은 7주가 된다', () => {
  const b = fixtureBoard();
  const res = upsertExerciseProgramBenchmark(b, {
    movementId: 'barbell_bench',
    name: '벤치프레스',
    muscleId: 'chest',
  }, {
    program: 'wendler',
    programStartDate: '2026-06-18',
    tracks: ['volume'],
    seed: { volume: { kg: 100, reps: 5 } },
    // 편집 UI에서는 숨겨진 이전 TM과 새 1RM이 함께 들어올 수 있다.
    wendler: { tmKg: 120, oneRmKg: 140, scheme: 'w863', roundKg: 2.5 },
  }, { todayKey: TODAY });

  const cy = activeCycleOf(b, 'chest');
  assert.equal(cy.startDate, START);
  assert.equal(cy.weeks, 7);
  assert.equal(res.benchmark.programStartDate, '2026-06-15');
  assert.equal(res.benchmark.wendler.oneRmKg, 140);
  assert.equal(res.benchmark.wendler.tmKg, 126);
  assert.deepEqual(res.benchmark.wendler.tmAnchors.map(a => ({ weekStart: a.weekStart, tmKg: a.tmKg })), [
    { weekStart: '2026-06-15', tmKg: 126 },
  ]);
  const cells = expandColumnCells(b, res.benchmark.id, 'volume', cy.id, TODAY);
  assert.equal(cells[0].kind, 'rest');
  assert.equal(cells[1].week, 1);
  const week1 = buildExerciseProgramWorkoutPrescription(b, res.benchmark, { todayKey: '2026-06-15' });
  const week2 = buildExerciseProgramWorkoutPrescription(b, res.benchmark, { todayKey: '2026-06-22' });
  assert.equal(week1.recommendationMeta.cycleWeek, 1);
  assert.equal(week1.recommendationMeta.programWeek, 1);
  assert.equal(week1.recommendationMeta.programStartDate, '2026-06-15');
  assert.equal(week1.recommendationMeta.groupCycleWeek, 2);
  assert.equal(week1.recommendationMeta.tmAnchorWeekStart, '2026-06-15');
  assert.equal(week2.recommendationMeta.cycleWeek, 2);
  assert.equal(week2.recommendationMeta.programWeek, 2);
  assert.equal(getExerciseProgramSettings(b, { movementId: 'barbell_bench' }).programStartDate, '2026-06-15');
});

test('종목 프로그램 계약: 과거 TM anchor 수정은 더 늦은 anchor 이후 처방을 바꾸지 않는다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  squat.wendler = {
    ...squat.wendler,
    scheme: 'w531',
    templateVersion: undefined,
    oneRmKg: undefined,
    weekMap: WENDLER_SCHEMES.w531.weekMap,
  };
  squat.programStartDate = '2026-06-15';
  squat.wendler = {
    ...squat.wendler,
    programStartDate: '2026-06-15',
    tmKg: 107.5,
    tmAnchors: [
      { weekStart: '2026-06-15', tmKg: 102.5, source: 'manual' },
      { weekStart: '2026-06-22', tmKg: 107.5, source: 'manual' },
    ],
  };

  const beforePast = buildExerciseProgramWorkoutPrescription(b, squat, { todayKey: '2026-06-15' });
  const beforeFuture = buildExerciseProgramWorkoutPrescription(b, squat, { todayKey: '2026-06-22' });
  assert.match(beforePast.recommendationMeta.wendlerSignature, /tm:102\.5/);
  assert.match(beforeFuture.recommendationMeta.wendlerSignature, /tm:107\.5/);

  upsertExerciseProgramBenchmark(b, {
    movementId: 'back_squat',
    name: '스쿼트',
    muscleId: 'lower',
  }, {
    program: 'wendler',
    programStartDate: '2026-06-15',
    tracks: ['volume'],
    seed: { volume: { kg: 100, reps: 5 } },
    wendler: { ...squat.wendler, tmKg: 100 },
  }, { todayKey: '2026-06-27' });

  assert.deepEqual(squat.wendler.tmAnchors.map(a => ({ weekStart: a.weekStart, tmKg: a.tmKg })), [
    { weekStart: '2026-06-15', tmKg: 100 },
    { weekStart: '2026-06-22', tmKg: 107.5 },
  ]);
  assert.equal(squat.wendler.tmKg, 107.5);
  const afterPast = buildExerciseProgramWorkoutPrescription(b, squat, { todayKey: '2026-06-15' });
  const afterFuture = buildExerciseProgramWorkoutPrescription(b, squat, { todayKey: '2026-06-22' });
  assert.match(afterPast.recommendationMeta.wendlerSignature, /tm:100/);
  assert.match(afterFuture.recommendationMeta.wendlerSignature, /tm:107\.5/);
  assert.equal(afterFuture.recommendationMeta.tmAnchorWeekStart, '2026-06-22');
});

test('종목 프로그램 계약: 웬들러에서 stair로 복귀해도 wendlerLog는 보존한다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  paintWeek(b, { benchmarkId: squat.id, weekStart: START, log: { at: 1, amrapReps: 11, suppDone: true } });
  const res = upsertExerciseProgramBenchmark(b, {
    movementId: 'back_squat',
    name: '스쿼트',
    muscleId: 'lower',
  }, {
    program: 'stair',
    tracks: ['volume', 'intensity'],
    seed: {
      volume: { kg: 110, reps: 8 },
      intensity: { kg: 130, reps: 3 },
    },
  }, { todayKey: TODAY });
  assert.equal(res.benchmark.id, squat.id);
  assert.equal(res.benchmark.program, 'stair');
  assert.equal(res.benchmark.wendlerLog[START].amrapReps, 11);
  const cy = activeCycleOf(b, 'lower');
  assert.equal(b.steps.filter(s => s.benchmarkId === squat.id && s.cycleId === cy.id).length, 2);
  const settings = getExerciseProgramSettings(b, { movementId: 'back_squat' });
  assert.equal(settings.program, 'stair');
  assert.deepEqual(settings.tracks, ['volume', 'intensity']);
  assert.equal(settings.wendler, null);
});

test('종목 프로그램 계약: 기본 모드는 연결 벤치마크를 보관 상태로 전환한다', () => {
  const b = fixtureBoard();
  const fly = b.benchmarks.find(x => x.movementId === 'chest_fly');
  const res = upsertExerciseProgramBenchmark(b, { movementId: 'chest_fly', name: '플라이', muscleId: 'chest' }, {
    program: 'none',
  }, { todayKey: TODAY });
  assert.equal(res.action, 'archived');
  assert.equal(fly.status, 'archived');
  assert.equal(findExerciseProgramBenchmark(b, { movementId: 'chest_fly' }), null);
  assert.equal(getExerciseProgramSettings(b, { movementId: 'chest_fly' }).program, 'none');
});

test('종목 프로그램 처방: stair 트랙은 오늘 운동 세트와 대체 트랙을 만든다', () => {
  const b = fixtureBoard();
  const bench = b.benchmarks.find(x => x.movementId === 'barbell_bench');
  const result = buildExerciseProgramWorkoutPrescription(b, bench, { track: 'intensity', todayKey: TODAY });
  assert.equal(result.plan.kind, 'stair');
  assert.equal(result.recommendationMeta.source, 'test_board_v2');
  assert.equal(result.recommendationMeta.track, 'H');
  assert.equal(result.prescription.applySets, true);
  assert.equal(result.prescription.targetSets, 4);
  assert.equal(result.prescription.sets.length, 4);
  assert.equal(result.prescription.sets[0].kg, 90);
  assert.equal(result.prescription.sets[0].reps, 8);
  assert.ok(result.prescription.trackAlternatives.M);
  assert.ok(result.prescription.trackAlternatives.H);
});

test('종목 프로그램 처방: 8/6/3 원본은 준비운동/메인/싱글/백오프와 선택 PR을 만든다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  const result = buildExerciseProgramWorkoutPrescription(b, squat, { todayKey: TODAY });
  assert.equal(result.plan.kind, 'wendler');
  assert.equal(result.recommendationMeta.program, 'wendler');
  assert.equal(result.recommendationMeta.wendlerManualOverride, false);
  assert.match(result.recommendationMeta.wendlerSignature, /tm:150/);
  assert.equal(result.prescription.action, 'wendler');
  assert.equal(result.prescription.applySets, true);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'warmup').length, 3);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'main').length, 3);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'heavy_single').length, 3);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'backoff').length, 5);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'supplemental').length, 0);
  assert.equal(result.prescription.optionalSets?.length || 0, 0);
  assert.equal(result.prescription.sets.some(s => s.amrap), true);
});

test('종목 프로그램 처방: W4의 기준 1RM 초과 싱글은 확인 전 optionalSets에만 있다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  const result = buildExerciseProgramWorkoutPrescription(b, squat, { todayKey: addWeeks(START, 3) });
  assert.equal(result.recommendationMeta.cycleWeek, 4);
  assert.equal(result.prescription.optionalSets.length, 1);
  assert.equal(result.prescription.optionalSets[0].wendlerRole, 'pr_attempt');
  assert.equal(result.prescription.optionalSets[0].requiresConfirmation, true);
  assert.equal(result.prescription.sets.some(set => set.wendlerRole === 'pr_attempt'), false);
});

test('8/6/3 원본 W7 회복 실패는 성장 정산 missedCount에 포함하지 않는다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  recordMiss(b, {
    benchmarkId: squat.id,
    track: 'volume',
    weekStart: addWeeks(START, 6),
    choice: 'none',
    log: { attempted: true, actualKg: 60, actualReps: 5 },
  });
  const row = buildSettleRows(b, 'lower').find(item => item.benchmarkId === squat.id);
  assert.equal(row.missedCount, 0);
  assert.equal(row.defaultDecision, 'grow');
});

test('웬들러 세트 순서는 원본 8/6/3 역할도 웜업 → 메인 → 싱글 → 백오프로 복원한다', () => {
  const ordered = orderWendlerPrescriptionSets([
    { wendlerRole: 'backoff', wendlerOrder: 0 },
    { wendlerRole: 'heavy_single', wendlerOrder: 1 },
    { wendlerRole: 'main', wendlerOrder: 1 },
    { wendlerRole: 'warmup', wendlerOrder: 1 },
    { wendlerRole: 'backoff', wendlerOrder: 1 },
    { wendlerRole: 'heavy_single', wendlerOrder: 0 },
    { wendlerRole: 'main', wendlerOrder: 0 },
    { wendlerRole: 'warmup', wendlerOrder: 0 },
  ]);
  assert.deepEqual(ordered.map(set => `${set.wendlerRole}:${set.wendlerOrder}`), [
    'warmup:0', 'warmup:1', 'main:0', 'main:1',
    'heavy_single:0', 'heavy_single:1', 'backoff:0', 'backoff:1',
  ]);
});

test('종목 프로그램 처방: 같은 movementId의 다른 exerciseId도 웬들러 세트를 적용한다', () => {
  const b = fixtureBoard();
  const squat = b.benchmarks.find(x => x.movementId === 'back_squat');
  squat.exerciseId = 'stored_sumo_deadlift';

  const matched = findExerciseProgramBenchmark(b, {
    id: 'picker_sumo_deadlift',
    movementId: 'back_squat',
    muscleId: 'lower',
  });
  assert.equal(matched?.id, squat.id);

  const result = buildExerciseProgramWorkoutPrescription(b, matched, { todayKey: TODAY });
  assert.equal(result.prescription.applySets, true);
  assert.equal(result.prescription.sets.length, 14);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'warmup').length, 3);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'main').length, 3);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'heavy_single').length, 3);
  assert.equal(result.prescription.sets.filter(s => s.wendlerRole === 'backoff').length, 5);
  assert.equal(result.prescription.sets.every(s => Number(s.reps) > 0), true);
  assert.equal(result.prescription.sets.every(s => Number(s.kg) > 0), true);
});

test('과거 셀 실제 운동기록 fallback: 같은 주 스모데드 기록을 exerciseId로 찾는다', () => {
  const bm = {
    id: 'bm_sumo',
    exerciseId: 'custom_1778990759855',
    movementId: null,
    label: '스모데드',
  };
  const cache = {
    '2026-06-07': {
      exercises: [{ exerciseId: 'custom_1778990759855', name: '스모데드', sets: [{ kg: 100, reps: 1, done: true }] }],
    },
    '2026-06-10': {
      exercises: [{
        exerciseId: 'legacy_without_matching_id',
        name: '스모 데드리프트',
        sets: [
          { kg: 60, reps: 10, setType: 'warmup', done: true },
          { kg: 85, reps: 8, setType: 'main', done: true },
          { kg: 90, reps: 6, setType: 'main', done: true },
          { kg: 95, reps: 5, setType: 'main', done: false },
        ],
      }],
    },
  };
  const records = workoutRecordsForBenchmarkWeek(cache, bm, '2026-06-08');
  assert.equal(records.length, 1);
  assert.equal(records[0].dateKey, '2026-06-10');
  assert.equal(records[0].best.kg, 90);
  assert.equal(records[0].best.reps, 6);
  assert.equal(records[0].sets.length, 2);
});

// ----------------------------------------------------------------
// 미니맵
// ----------------------------------------------------------------

test('미니맵: 그룹×열 세그먼트 + 오늘 오프셋', () => {
  const b = fixtureBoard();
  const mm = buildMinimapData(b, TODAY);
  assert.equal(mm.fromKey, START);
  assert.equal(mm.totalWeeks, 7);
  assert.equal(mm.todayOffset, 0);
  const chest = mm.groups.find(g => g.id === 'chest');
  assert.equal(chest.cols.length, 3); // 벤치 볼륨/강도 + 플라이 볼륨
  assert.equal(chest.cols[0].segs[0].span, 6);
  const lower = mm.groups.find(g => g.id === 'lower');
  const squatCol = lower.cols.find(c => c.label.includes('백스') || c.label.includes('스쿼') || true);
  assert.equal(squatCol.segs.length >= 6, true); // 웬들러 주당 1칸
});

// ----------------------------------------------------------------
// 직렬화 안전성
// ----------------------------------------------------------------

test('보드는 JSON 직렬화 가능(Firestore 저장 안전) + cloneBoard 독립', () => {
  const b = fixtureBoard();
  const json = JSON.stringify(b);
  assert.ok(json.length > 100);
  const c = cloneBoard(b);
  c.benchmarks[0].seed.volume.kg = 999;
  assert.notEqual(b.benchmarks[0].seed.volume.kg, 999);
});
