// ================================================================
// calc.max.test.js — 맥스 모드 보강 추천 (suggestMaxBoosts) 회귀 테스트
// 실행: `node --test tests/calc.max.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  suggestMaxBoosts,
  buildMaxPrescription,
  detectMaxFixedMovements,
  buildMaxCycleSnapshot,
  buildMaxCycleSchedule,
  detectPlateau,
} from '../calc.js';
import {
  createDefaultMaxCycle,
  buildRenderedMaxCycleSnapshot,
  renderMaxPlanEditor,
  renderMaxCycleBoard,
} from '../workout/expert/max-cycle.js';

// 테스트용 MOVEMENTS 미니 카탈로그 — config.js 실제 데이터의 부분집합
const MOVEMENTS_FIXTURE = [
  // chest_upper
  { id:'incline_barbell_bench',  nameKo:'인클라인 바벨 벤치프레스',     primary:'chest', subPattern:'chest_upper', sizeClass:'large', equipment_category:'barbell' },
  { id:'incline_dumbbell_bench', nameKo:'인클라인 덤벨 벤치프레스',     primary:'chest', subPattern:'chest_upper', sizeClass:'small', equipment_category:'dumbbell' },
  { id:'incline_smith_bench',    nameKo:'인클라인 스미스 벤치프레스',   primary:'chest', subPattern:'chest_upper', sizeClass:'large', equipment_category:'smith' },
  { id:'chest_press_machine',    nameKo:'체스트프레스 머신',            primary:'chest', subPattern:'chest_mid',   sizeClass:'large', equipment_category:'machine' },
  // chest_mid
  { id:'barbell_bench',          nameKo:'바벨 벤치프레스',              primary:'chest', subPattern:'chest_mid',   sizeClass:'large', equipment_category:'barbell' },
  { id:'dumbbell_bench',         nameKo:'덤벨 벤치프레스',              primary:'chest', subPattern:'chest_mid',   sizeClass:'small', equipment_category:'dumbbell' },
  // shoulder_side
  { id:'lateral_raise',          nameKo:'사이드 레터럴 레이즈',         primary:'shoulder', subPattern:'shoulder_side', sizeClass:'small', equipment_category:'dumbbell' },
  { id:'cable_lateral_raise',    nameKo:'케이블 사레레',                primary:'shoulder', subPattern:'shoulder_side', sizeClass:'small', equipment_category:'cable' },
];

function makeComparison(weakSubPatterns) {
  return {
    majors: ['chest'],
    today: { dateKey: '2026-04-25', workSets: 8, totalVolume: 1200, topKg: 80, subBalance: { chest_mid: 8 }, exercises: [] },
    previous: [
      { dateKey: '2026-04-22', workSets: 6, totalVolume: 900, topKg: 75, subBalance: { chest_mid: 6 } },
    ],
    deltas: [],
    imbalance: weakSubPatterns ? { weakSubPatterns, strongest: 'chest_mid', note: 'weak' } : null,
  };
}

// ── 케이스 1: weakSubPatterns ['chest_upper'] → 인클라인 후보들 검출 + 바벨/덤벨 우선 ──
test('suggestMaxBoosts · chest_upper 약점 → 바벨/덤벨 우선 정렬', () => {
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_upper']),
    exList: [],
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: ['barbell', 'dumbbell'],
    takenExerciseIds: [],
    limit: 3,
  });
  assert.equal(res.length, 1, 'chest_upper 그룹 1개 반환');
  assert.equal(res[0].subPattern, 'chest_upper');
  assert.equal(res[0].subPatternLabel, '가슴 상부');
  // 상위 2개 — 바벨/덤벨이 스미스보다 먼저
  const ids = res[0].exercises.map(e => e.movementId);
  assert.ok(ids.includes('incline_barbell_bench'), '바벨 후보 포함');
  // smith는 +5 가산 없음 → 바벨/덤벨 뒤로 밀림 (최상위 2개에는 없을 가능성 높음)
  const top2 = res[0].exercises.slice(0, 2);
  const top2Cats = top2.map(e => e.equipment_category).sort();
  assert.deepEqual(top2Cats, ['barbell', 'dumbbell'], '상위 2개는 barbell/dumbbell');
  // isPreferred 표기
  assert.ok(top2.every(e => e.isPreferred === true), '상위는 isPreferred=true');
});

test('suggestMaxBoosts keeps later weak parts when limit is shared', () => {
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_upper', 'chest_mid', 'shoulder_side']),
    exList: [],
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: ['barbell', 'dumbbell'],
    takenExerciseIds: [],
    limit: 3,
  });
  assert.deepEqual(res.map(g => g.subPattern), ['chest_upper', 'chest_mid', 'shoulder_side']);
  assert.ok(res.every(g => g.exercises.length === 1));
});

test('buildMaxPrescription creates sets, reps, and load guidance', () => {
  const exList = [{ id: 'ex_bench', movementId: 'barbell_bench', name: 'bench' }];
  const movement = { ...MOVEMENTS_FIXTURE.find(m => m.id === 'barbell_bench'), stepKg: 2.5 };
  const cache = {
    '2026-04-20': {
      exercises: [{
        exerciseId: 'ex_bench',
        sets: [{ kg: 80, reps: 12, rpe: 8, done: true, setType: 'main' }],
      }],
    },
  };
  const prescription = buildMaxPrescription({
    cache,
    exList,
    movement,
    exerciseId: 'ex_bench',
    todayKey: '2026-04-26',
    sessionType: 'heavy_volume',
  });
  assert.equal(prescription.targetSets, 4);
  assert.equal(prescription.repsLow, 6);
  assert.equal(prescription.repsHigh, 10);
  assert.equal(prescription.sets.length, 4);
  assert.ok(prescription.sets.every(s => s.reps === 6));
  assert.ok(prescription.startKg > 0);
  assert.equal(prescription.action, 'load');
});

test('detectMaxFixedMovements finds repeated movements in recent same-muscle sessions', () => {
  const exList = [
    { id: 'ex_bench', movementId: 'barbell_bench', name: 'bench' },
    { id: 'ex_db', movementId: 'dumbbell_bench', name: 'db bench' },
  ];
  const movements = MOVEMENTS_FIXTURE.map(m => ({ ...m, stepKg: 2.5 }));
  const cache = {
    '2026-04-25': { exercises: [{ exerciseId: 'ex_db', sets: [{ kg: 30, reps: 10, done: true }] }] },
    '2026-04-22': { exercises: [{ exerciseId: 'ex_bench', sets: [{ kg: 80, reps: 10, done: true }] }] },
    '2026-04-19': { exercises: [{ exerciseId: 'ex_bench', sets: [{ kg: 77.5, reps: 10, done: true }] }] },
    '2026-04-16': { exercises: [{ exerciseId: 'ex_bench', sets: [{ kg: 75, reps: 10, done: true }] }] },
  };
  const fixed = detectMaxFixedMovements({
    cache,
    exList,
    movements,
    todayKey: '2026-04-26',
    majors: ['chest'],
    lookbackSessions: 4,
    minHits: 2,
  });
  assert.equal(fixed[0].movementId, 'barbell_bench');
  assert.equal(fixed[0].count, 3);
});

// ── 케이스 2: imbalance 없음 → 빈 배열 ──
test('suggestMaxBoosts · imbalance null → 빈 배열', () => {
  const res = suggestMaxBoosts({
    comparison: { imbalance: null, majors: [], today: null, previous: [], deltas: [] },
    movements: MOVEMENTS_FIXTURE,
  });
  assert.deepEqual(res, []);
});

test('suggestMaxBoosts · weakSubPatterns 빈 배열 → 빈 배열', () => {
  const res = suggestMaxBoosts({
    comparison: makeComparison([]),
    movements: MOVEMENTS_FIXTURE,
  });
  assert.deepEqual(res, []);
});

// ── 케이스 3: takenExerciseIds 들어있는 동작 제외 ──
test('suggestMaxBoosts · taken 동작은 제외되고 다음 후보 등장', () => {
  const exList = [
    { id:'ex_inc_bb',  movementId:'incline_barbell_bench',  name:'인클라인 바벨' },
    { id:'ex_inc_db',  movementId:'incline_dumbbell_bench', name:'인클라인 덤벨' },
  ];
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_upper']),
    exList,
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: ['barbell', 'dumbbell'],
    takenExerciseIds: ['ex_inc_bb'],   // 인클라인 바벨 이미 추가됨
    limit: 3,
  });
  const ids = res[0].exercises.map(e => e.movementId);
  assert.ok(!ids.includes('incline_barbell_bench'), '이미 추가된 동작 제외');
  // 다음 후보 (덤벨 또는 스미스/머신) 등장
  assert.ok(res[0].exercises.length >= 1, '대체 후보 1개 이상 반환');
});

// ── 케이스 4: preferredCategories=[] → 가산 없이 sizeClass/exList만으로 정렬 ──
test('suggestMaxBoosts · preferredCategories 빈 값 → sizeClass/exList 기반 정렬', () => {
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_upper']),
    exList: [],
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: [],
    takenExerciseIds: [],
    limit: 4,
  });
  // isPreferred 모두 false
  assert.ok(res[0].exercises.every(e => e.isPreferred === false));
  // sizeClass 'large' 가산 +1로 large가 small보다 약간 위
  const top = res[0].exercises[0];
  assert.equal(top.sizeClass, 'large', 'preferred 없을 땐 large 가 위');
});

// ── 케이스 5: 카테고리 다양성 — 같은 카테고리 중복 시 패널티 ──
test('suggestMaxBoosts · 카테고리 다양성 — barbell 2개보다 dumbbell 1개가 위로', () => {
  // chest_mid: barbell 1, dumbbell 1, machine 1
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_mid']),
    exList: [],
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: ['barbell', 'dumbbell'],
    takenExerciseIds: [],
    limit: 3,
  });
  // 상위 2개 카테고리 — 첫 번째는 barbell(또는 dumbbell), 두 번째는 다른 종류
  const top2 = res[0].exercises.slice(0, 2);
  const cats = top2.map(e => e.equipment_category);
  assert.notEqual(cats[0], cats[1], '동일 카테고리 연속 회피');
});

// ── 케이스 6: exList에 등록된 movementId 매칭 시 +3 가산 + exerciseId 부여 ──
test('suggestMaxBoosts · exList 매칭 movement는 exerciseId 부여 + 점수 가산', () => {
  const exList = [
    { id:'ex_smith_inc', movementId:'incline_smith_bench', name:'인클라인 스미스' },
  ];
  // preferredCategories=[]로 두어 가산 차이를 명확히. 점수:
  //   barbell:  large(+1) = 1
  //   dumbbell: small     = 0
  //   smith:    large(+1) + exList(+3) = 4  ← 최상위
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_upper']),
    exList,
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: [],
    takenExerciseIds: [],
    limit: 4,
  });
  const top = res[0].exercises[0];
  assert.equal(top.movementId, 'incline_smith_bench', 'exList 매칭 smith가 1위');
  assert.equal(top.exerciseId, 'ex_smith_inc', 'exerciseId 매핑됨');
  assert.equal(top.isPreferred, false, 'preferredCategories=[]면 isPreferred=false');
});

// ── 케이스 7: limit 적용 — 다중 weakSubPatterns에서 합산 limit 준수 ──
test('suggestMaxBoosts · limit=2 다중 weak에서 총 2개로 자름', () => {
  const res = suggestMaxBoosts({
    comparison: makeComparison(['chest_upper', 'shoulder_side']),
    exList: [],
    movements: MOVEMENTS_FIXTURE,
    preferredCategories: ['barbell', 'dumbbell'],
    takenExerciseIds: [],
    limit: 2,
  });
  const totalEx = res.reduce((a, g) => a + g.exercises.length, 0);
  assert.equal(totalEx, 2, '총 운동 개수 == limit');
});

test('buildMaxCycleSnapshot · 6주 성장판의 계획/실측 비교', () => {
  const cycle = {
    id: 'cycle_test',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [{
      id: 'bm_chest_barbell_bench',
      movementId: 'barbell_bench',
      label: '바벨 벤치프레스',
      primaryMajor: 'chest',
      tracks: ['M', 'H'],
      startKg: 75,
      targetKg: 80,
      incrementKg: 2.5,
    }],
  };
  const exList = [{ id: 'ex_bench', movementId: 'barbell_bench' }];
  const cache = {
    '2026-05-11': {
      exercises: [{
        exerciseId: 'ex_bench',
        sets: [{ kg: 77.5, reps: 12, done: true }],
      }],
    },
  };
  const snap = buildMaxCycleSnapshot({ cycle, cache, exList, todayKey: '2026-05-18' });
  assert.equal(snap.weekIndex, 3);
  assert.equal(snap.track, 'M');
  assert.equal(snap.benchmarks[0].planned.plannedKg, 77.5);
  assert.equal(snap.benchmarks[0].latest.kg, 77.5);
  assert.equal(snap.benchmarks[0].onPlan, true);
});

test('createDefaultMaxCycle · 벤치마크는 운동추가의 실제 exerciseId를 상속한다', () => {
  const cycle = createDefaultMaxCycle({
    todayKey: '2026-05-04',
    majors: ['chest'],
    movements: [{
      id: 'ex_moon_bench',
      exerciseId: 'ex_moon_bench',
      movementId: 'barbell_bench',
      nameKo: '문정 바벨 벤치프레스',
      primary: 'chest',
      equipment_category: 'barbell',
      stepKg: 2.5,
      benchmarkDefaults: {
        startKg: 82.5,
        targetKg: 85,
        incrementKg: 2.5,
        source: 'exact',
        sourceLabel: '최근 3회 기록 기반',
        tracks: {
          M: { startKg: 82.5, targetKg: 85, incrementKg: 2.5, startReps: 12, targetReps: 12, enabled: true },
          H: { startKg: 92.5, targetKg: 95, incrementKg: 2.5, startReps: 8, targetReps: 6, enabled: true },
        },
      },
    }],
    allowFallback: false,
  });
  assert.equal(cycle.benchmarks[0].exerciseId, 'ex_moon_bench');
  assert.equal(cycle.benchmarks[0].movementId, 'barbell_bench');
  assert.equal(cycle.benchmarks[0].label, '문정 바벨 벤치프레스');
  assert.equal(cycle.benchmarks[0].tracks.M.startKg, 82.5);
  assert.equal(cycle.benchmarks[0].tracks.H.startKg, 92.5);
  assert.equal(cycle.benchmarks[0].benchmarkSource, 'exact');
});

test('buildRenderedMaxCycleSnapshot · exerciseId가 있으면 같은 movement의 다른 기구 기록을 섞지 않는다', () => {
  const cycle = {
    id: 'cycle_exact',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [{
      id: 'bm_chest_ex_moon_bench',
      exerciseId: 'ex_moon_bench',
      movementId: 'barbell_bench',
      label: '문정 바벨 벤치프레스',
      primaryMajor: 'chest',
      startKg: 75,
      targetKg: 80,
      incrementKg: 2.5,
    }],
  };
  const exList = [
    { id: 'ex_moon_bench', movementId: 'barbell_bench', name: '문정 바벨 벤치프레스' },
    { id: 'ex_other_bench', movementId: 'barbell_bench', name: '타 헬스장 벤치프레스' },
  ];
  const cache = {
    '2026-05-10': { exercises: [{ exerciseId: 'ex_other_bench', sets: [{ kg: 120, reps: 5, done: true }] }] },
    '2026-05-11': { exercises: [{ exerciseId: 'ex_moon_bench', sets: [{ kg: 77.5, reps: 12, done: true }] }] },
  };
  const snap = buildRenderedMaxCycleSnapshot({ cycle, cache, exList, todayKey: '2026-05-18' });
  assert.equal(snap.benchmarks[0].latest.kg, 77.5);
  assert.equal(snap.benchmarks[0].hasRegisteredExercise, true);
});

test('renderMaxPlanEditor · legacy movementId 벤치마크도 실제 운동추가 exerciseId 선택으로 보여준다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      weeks: 6,
      benchmarks: [{
        id: 'bm_chest_legacy',
        movementId: 'barbell_bench',
        label: '바벨 벤치프레스',
        primaryMajor: 'chest',
        startKg: 75,
        targetKg: 80,
        incrementKg: 2.5,
      }],
    },
    movements: [{
      id: 'ex_moon_bench',
      exerciseId: 'ex_moon_bench',
      movementId: 'barbell_bench',
      nameKo: '문정 바벨 벤치프레스',
      primary: 'chest',
      equipment_category: 'barbell',
      optionLabel: '가슴 · 문정 바벨 벤치프레스 · 공통',
    }],
  });
  assert.match(html, /data-bench-field="exerciseId"/);
  assert.match(html, /value="ex_moon_bench" selected/);
  assert.doesNotMatch(html, /data-bench-field="movementId"/);
  assert.doesNotMatch(html, /onclick=/, '계획 조정 버튼은 lazy module 전역 onclick에 의존하지 않는다');
});

test('renderMaxPlanEditor · 공통 모듈 중복 후보는 하나로 접고 기록이 더 있는 종목을 선택한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      weeks: 6,
      benchmarks: [{
        id: 'bm_chest_stale_db',
        exerciseId: 'ex_old_db_bench',
        movementId: 'dumbbell_bench',
        label: '덤벨 벤치프레스',
        primaryMajor: 'chest',
        startKg: 30,
        targetKg: 32.5,
        incrementKg: 2.5,
      }],
    },
    movements: [
      {
        id: 'ex_old_db_bench',
        exerciseId: 'ex_old_db_bench',
        movementId: 'dumbbell_bench',
        nameKo: '덤벨 벤치프레스',
        primary: 'chest',
        equipment_category: 'dumbbell',
        gymTags: ['*'],
        benchmarkDefaults: { source: 'exact', sessions: 1 },
        optionLabel: '가슴 · 덤벨 벤치프레스 · 공통',
      },
      {
        id: 'ex_good_db_bench',
        exerciseId: 'ex_good_db_bench',
        movementId: 'dumbbell_bench',
        nameKo: '덤벨 벤치프레스',
        primary: 'chest',
        equipment_category: 'dumbbell',
        gymTags: ['*'],
        benchmarkDefaults: { source: 'exact', sessions: 4 },
        optionLabel: '가슴 · 덤벨 벤치프레스 · 공통',
      },
    ],
  });
  assert.doesNotMatch(html, /value="ex_old_db_bench"/);
  assert.match(html, /value="ex_good_db_bench" selected/);
});

test('renderMaxCycleBoard · 주차표에 달성/미달/도전 상태를 표시한다', () => {
  const cycle = {
    id: 'cycle_week_state',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 2,
    benchmarks: [{
      id: 'bm_chest_barbell_bench',
      exerciseId: 'ex_bench',
      movementId: 'barbell_bench',
      label: '바벨 벤치프레스',
      primaryMajor: 'chest',
      startKg: 75,
      targetKg: 77.5,
      incrementKg: 2.5,
      tracks: {
        M: { startKg: 75, targetKg: 77.5, incrementKg: 2.5, startReps: 12, targetReps: 12, enabled: true },
        H: { startKg: 80, targetKg: 82.5, incrementKg: 2.5, startReps: 8, targetReps: 6, enabled: true },
      },
    }],
  };
  const html = renderMaxCycleBoard({
    cycle,
    exList: [{ id: 'ex_bench', movementId: 'barbell_bench' }],
    todayKey: '2026-05-11',
    cache: {
      '2026-05-04': {
        exercises: [{ exerciseId: 'ex_bench', sets: [{ kg: 77.5, reps: 12, done: true, setType: 'main' }] }],
      },
    },
  });
  assert.match(html, /is-over|is-done/);
  assert.match(html, /달성|초과/);
  assert.match(html, /도전 전/);
});

test('buildMaxCycleSchedule · 6주 동안 볼륨/강도 트랙 교차', () => {
  const schedule = buildMaxCycleSchedule({
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [{
      id: 'bm',
      movementId: 'barbell_bench',
      label: '벤치',
      primaryMajor: 'chest',
      startKg: 75,
      targetKg: 80,
      incrementKg: 2.5,
    }],
  });
  assert.equal(schedule.length, 6);
  assert.deepEqual(schedule.map(r => r.track), ['M', 'H', 'M', 'H', 'M', 'H']);
  assert.equal(schedule[5].cells[0].planned.targetKg, 80);
});

test('detectPlateau · e1RM 정체 감지', () => {
  const result = detectPlateau([
    { dateKey: '2026-05-04', e1rm: 100 },
    { dateKey: '2026-05-11', e1rm: 100.2 },
  ], { weeks: 2 });
  assert.equal(result.plateau, true);
});
