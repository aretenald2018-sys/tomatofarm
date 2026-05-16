// ================================================================
// calc.max.test.js — 맥스 모드 보강 추천 (suggestMaxBoosts) 회귀 테스트
// 실행: `node --test tests/calc.max.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  suggestMaxBoosts,
  buildMuscleComparison,
  buildMaxPrescription,
  detectMaxFixedMovements,
  buildMaxCycleSnapshot,
  buildMaxCycleSchedule,
  detectPlateau,
  getLastTrackSession,
} from '../calc.js';
import {
  createDefaultMaxCycle,
  buildRenderedMaxCycleSnapshot,
  buildMaxPlanMovementOptionSeeds,
  selectPersistedMaxCycle,
  renderMaxPlanEditor,
  renderMaxCycleDashboard,
  renderMaxCycleBoard,
} from '../workout/expert/max-cycle.js';
import {
  buildMaxBenchmarkPickerEntry,
  buildMaxPickerExerciseEntry,
  resolveMaxBenchmarkPickerItems,
} from '../workout/expert/max-benchmark-picker.js';
import { renderMaxGrowthPreview, renderNextSameMuscleDayAdvice } from '../workout/expert/max-same-day-advice.js';

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
  { id:'lat_pulldown',           nameKo:'랫풀다운',                     primary:'back',  subPattern:'back_width',  sizeClass:'large', equipment_category:'machine' },
  { id:'high_row',               nameKo:'하이로우',                     primary:'back',  subPattern:'back_thickness', sizeClass:'large', equipment_category:'machine' },
  { id:'rdl',                    nameKo:'루마니안 데드리프트',          primary:'back',  subPattern:'posterior',   sizeClass:'large', equipment_category:'barbell' },
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

test('buildMuscleComparison · 오늘 종목 추가 전에도 선택 부위 기준 직전 세션을 찾는다', () => {
  const res = buildMuscleComparison({
    '2026-04-25': { exercises: [] },
    '2026-04-22': {
      exercises: [{
        exerciseId: 'ex_bench',
        sets: [{ kg: 70, reps: 10, done: true, setType: 'main' }],
      }],
    },
  }, [
    { id: 'ex_bench', movementId: 'barbell_bench' },
  ], MOVEMENTS_FIXTURE, '2026-04-25', ['chest'], 2);

  assert.deepEqual(res.majors, ['chest']);
  assert.equal(res.previous.length, 1);
  assert.equal(res.previous[0].dateKey, '2026-04-22');
  assert.ok(res.imbalance?.weakSubPatterns.includes('chest_upper'));
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

test('getLastTrackSession · 직전은 종목 최신일이 아니라 현재 트랙의 최신 세션을 쓴다', () => {
  const exList = [{ id: 'ex_bench', movementId: 'barbell_bench', name: '바벨 벤치프레스' }];
  const cache = {
    '2026-05-13': {
      exercises: [{
        exerciseId: 'ex_bench',
        recommendationMeta: { track: 'M' },
        sets: [{ kg: 80, reps: 12, done: true, setType: 'main' }],
      }],
    },
    '2026-05-12': {
      exercises: [{
        exerciseId: 'ex_bench',
        recommendationMeta: { track: 'H' },
        sets: [{ kg: 100, reps: 8, done: true, setType: 'main' }],
      }],
    },
    '2026-05-10': {
      exercises: [{
        exerciseId: 'ex_bench',
        maxPrescription: { benchmarkTrack: 'H' },
        sets: [{ kg: 97.5, reps: 6, done: true, setType: 'main' }],
      }],
    },
  };

  const heavy = getLastTrackSession(cache, exList, 'ex_bench', 'H', '2026-05-14');
  const volume = getLastTrackSession(cache, exList, 'ex_bench', 'M', '2026-05-14');
  const priorHeavy = getLastTrackSession(cache, exList, 'ex_bench', 'H', '2026-05-12');

  assert.equal(heavy.date, '2026-05-12');
  assert.equal(volume.date, '2026-05-13');
  assert.equal(priorHeavy.date, '2026-05-10');
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

test('createDefaultMaxCycle · 복근/삼두/이두는 볼륨 트랙 단일 운영', () => {
  const cycle = createDefaultMaxCycle({
    todayKey: '2026-05-04',
    majors: ['bicep', 'tricep', 'abs'],
    movements: [
      { id: 'barbell_curl', nameKo: '바벨 컬', primary: 'bicep', subPattern: 'bicep', equipment_category: 'barbell', stepKg: 2.5 },
      { id: 'cable_tricep_pushdown', nameKo: '케이블 푸쉬다운', primary: 'tricep', subPattern: 'tricep', equipment_category: 'cable', stepKg: 2.5 },
      { id: 'cable_crunch', nameKo: '케이블 크런치', primary: 'abs', subPattern: 'core', equipment_category: 'cable', stepKg: 2.5 },
    ],
    allowFallback: false,
  });

  assert.equal(cycle.benchmarks.length, 3);
  assert.ok(cycle.benchmarks.every(b => b.defaultTrack === 'M'));
  assert.ok(cycle.benchmarks.every(b => b.tracks.M.enabled === true));
  assert.ok(cycle.benchmarks.every(b => b.tracks.H.enabled === false));

  const snap = buildRenderedMaxCycleSnapshot({
    cycle: { ...cycle, todayTrack: 'H' },
    cache: {},
    exList: [],
    todayKey: '2026-05-11',
  });
  assert.equal(snap.track, 'M');
  assert.ok(snap.benchmarks.every(b => b.activeTrack === 'M'));
  assert.ok(snap.benchmarks.every(b => b.availableTracks.join(',') === 'M'));

  const html = renderMaxPlanEditor({
    cycle,
    todayKey: '2026-05-11',
  });
  assert.match(html, /볼륨 단일/);
  assert.doesNotMatch(html, /data-track="H"/);
  assert.doesNotMatch(html, /data-bench-track="H"/);
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
    focusBenchmarkId: 'bm_chest_legacy',
  });
  assert.match(html, /data-bench-field="exerciseId"/);
  assert.match(html, /value="ex_moon_bench" selected/);
  assert.match(html, /wt-v4-bench-edit is-focused/);
  assert.match(html, /wt-v4-plan-stair-hitgrid/);
  assert.doesNotMatch(html, /wt-v4-plan-stair-current/);
  assert.match(html, /data-action="select-max-plan-step"/);
  assert.match(html, /data-bench-field="incrementKg"/);
  assert.match(html, /id="max-plan-weeks-value" value="6"/);
  assert.doesNotMatch(html, /<h4>사이클<\/h4>/);
  assert.doesNotMatch(html, /<h4>헬스장<\/h4>/);
  assert.doesNotMatch(html, /고급 설정/);
  assert.doesNotMatch(html, /data-bench-field="movementId"/);
  assert.doesNotMatch(html, /onclick=/, '계획 조정 버튼은 lazy module 전역 onclick에 의존하지 않는다');
});

test('renderMaxPlanEditor · 저장된 벤치마크가 없는 부위도 성장판 탭에 표시한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      weeks: 6,
      benchmarks: [
        { id: 'bm_lower_squat', movementId: 'back_squat', label: '백 스쿼트', primaryMajor: 'lower', startKg: 100, targetKg: 105, incrementKg: 5 },
        { id: 'bm_shoulder_press', movementId: 'dumbbell_shoulder_press', label: '덤벨 숄더프레스', primaryMajor: 'shoulder', startKg: 25, targetKg: 27.5, incrementKg: 2.5 },
        { id: 'bm_tricep_pushdown', movementId: 'cable_tricep_pushdown', label: '푸쉬다운', primaryMajor: 'tricep', startKg: 35, targetKg: 37.5, incrementKg: 2.5 },
        { id: 'bm_abs_crunch', movementId: 'cable_crunch', label: '케이블 크런치', primaryMajor: 'abs', startKg: 40, targetKg: 42.5, incrementKg: 2.5 },
        { id: 'bm_chest_bench', movementId: 'barbell_bench', label: '바벨 벤치프레스', primaryMajor: 'chest', startKg: 75, targetKg: 80, incrementKg: 2.5 },
      ],
    },
  });
  assert.equal((html.match(/data-action="select-max-plan-major"/g) || []).length, 8);
  for (const major of ['chest', 'back', 'lower', 'shoulder', 'glute', 'bicep', 'tricep', 'abs']) {
    assert.match(html, new RegExp(`data-major="${major}"`));
  }
  assert.match(html, /등 벤치마크가 아직 없습니다/);
  assert.match(html, /이두 벤치마크가 아직 없습니다/);
  assert.match(html, /둔부 벤치마크가 아직 없습니다/);
});

test('renderMaxPlanEditor · 트랙별 증량폭을 UI에 그대로 노출한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      startDate: '2026-05-04',
      weeks: 6,
      benchmarks: [{
        id: 'bm_lower_squat',
        exerciseId: 'ex_squat',
        movementId: 'back_squat',
        label: '백 스쿼트',
        primaryMajor: 'lower',
        tracks: {
          M: { startKg: 100, targetKg: 125, incrementKg: 5, startReps: 10, targetReps: 10, enabled: true },
          H: { startKg: 120, targetKg: 170, incrementKg: 10, startReps: 5, targetReps: 5, enabled: true },
        },
      }],
    },
    movements: [{
      id: 'ex_squat',
      exerciseId: 'ex_squat',
      movementId: 'back_squat',
      nameKo: '백 스쿼트',
      primary: 'lower',
      equipment_category: 'barbell',
      optionLabel: '하체 · 백 스쿼트 · 공통',
    }],
    todayKey: '2026-05-11',
  });
  assert.match(html, /W3 이후 \+10kg/);
  assert.match(html, /data-bench-track="H" data-bench-field="incrementKg"[^>]+value="10"/);
  assert.match(html, /style="--weeks:6; --active-week:2;"/);
  assert.match(html, /선택 계단 · W2 강도/);
});

test('renderMaxPlanEditor · W1 시작일을 직접 입력하고 active week를 다시 계산한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      startDate: '2026-05-11',
      weeks: 6,
      benchmarks: [{
        id: 'bm_chest_bench_start',
        exerciseId: 'ex_bench_start',
        movementId: 'barbell_bench',
        label: '바벨 벤치프레스',
        primaryMajor: 'chest',
        tracks: {
          M: { startKg: 80, targetKg: 90, incrementKg: 2.5, startReps: 12, targetReps: 12, enabled: true },
          H: { startKg: 90, targetKg: 100, incrementKg: 2.5, startReps: 8, targetReps: 6, enabled: true },
        },
      }],
    },
    movements: [{
      id: 'ex_bench_start',
      exerciseId: 'ex_bench_start',
      movementId: 'barbell_bench',
      nameKo: '바벨 벤치프레스',
      primary: 'chest',
      equipment_category: 'barbell',
      optionLabel: '가슴 · 바벨 벤치프레스 · 공통',
    }],
    todayKey: '2026-05-18',
  });

  assert.match(html, /id="max-plan-start-date" type="date" value="2026-05-11"/);
  assert.match(html, /style="--weeks:6; --active-week:2;"/);
  assert.match(html, /선택 계단 · W2 강도/);
});

test('renderMaxPlanEditor · 실제 기록은 목표선과 별도 파란 수행선으로 표시한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      startDate: '2026-05-04',
      weeks: 6,
      benchmarks: [{
        id: 'bm_lower_squat_clear',
        exerciseId: 'ex_squat_clear',
        movementId: 'back_squat',
        label: '백 스쿼트',
        primaryMajor: 'lower',
        tracks: {
          M: { startKg: 100, targetKg: 125, incrementKg: 5, startReps: 10, targetReps: 10, enabled: true },
          H: { startKg: 120, targetKg: 170, incrementKg: 10, startReps: 5, targetReps: 5, enabled: true },
        },
      }],
    },
    movements: [{
      id: 'ex_squat_clear',
      exerciseId: 'ex_squat_clear',
      movementId: 'back_squat',
      nameKo: '백 스쿼트',
      primary: 'lower',
      equipment_category: 'barbell',
      optionLabel: '하체 · 백 스쿼트 · 공통',
    }],
    exList: [{ id: 'ex_squat_clear', movementId: 'back_squat', name: '백 스쿼트' }],
    cache: {
      '2026-05-11': {
        exercises: [{
          exerciseId: 'ex_squat_clear',
          movementId: 'back_squat',
          sets: [{ kg: 130, reps: 5, done: true }],
        }],
      },
    },
    todayKey: '2026-05-14',
  });
  assert.equal((html.match(/wt-v4-plan-actual-line/g) || []).length, 1);
  assert.match(html, /wt-v4-plan-actual-point is-cleared/);
  assert.match(html, /5\/11 130kg×5 돌파/);
});

test('renderMaxPlanEditor · 같은 주에 수행한 볼륨/강도 actual 점을 모두 표시한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      startDate: '2026-05-04',
      weeks: 6,
      benchmarks: [{
        id: 'bm_lower_squat_multi_actual',
        exerciseId: 'ex_squat_multi_actual',
        movementId: 'back_squat',
        label: '백 스쿼트',
        primaryMajor: 'lower',
        tracks: {
          M: { startKg: 100, targetKg: 125, incrementKg: 5, startReps: 10, targetReps: 10, enabled: true },
          H: { startKg: 120, targetKg: 170, incrementKg: 10, startReps: 5, targetReps: 5, enabled: true },
        },
      }],
    },
    movements: [{
      id: 'ex_squat_multi_actual',
      exerciseId: 'ex_squat_multi_actual',
      movementId: 'back_squat',
      nameKo: '백 스쿼트',
      primary: 'lower',
      equipment_category: 'barbell',
      optionLabel: '하체 · 백 스쿼트 · 공통',
    }],
    exList: [{ id: 'ex_squat_multi_actual', movementId: 'back_squat', name: '백 스쿼트' }],
    cache: {
      '2026-05-06': {
        exercises: [{
          exerciseId: 'ex_squat_multi_actual',
          movementId: 'back_squat',
          recommendationMeta: { track: 'M' },
          sets: [{ kg: 105, reps: 10, done: true }],
        }],
      },
      '2026-05-07': {
        exercises: [{
          exerciseId: 'ex_squat_multi_actual',
          movementId: 'back_squat',
          recommendationMeta: { track: 'H' },
          sets: [{ kg: 120, reps: 5, done: true }],
        }],
      },
      '2026-05-09': {
        exercises: [{
          exerciseId: 'ex_squat_multi_actual',
          movementId: 'back_squat',
          recommendationMeta: { track: 'M' },
          sets: [{ kg: 110, reps: 10, done: true }],
        }],
      },
      '2026-05-10': {
        exercises: [{
          exerciseId: 'ex_squat_multi_actual',
          movementId: 'back_squat',
          recommendationMeta: { track: 'H' },
          sets: [{ kg: 125, reps: 5, done: true }],
        }],
      },
    },
    todayKey: '2026-05-11',
  });

  assert.equal((html.match(/wt-v4-plan-actual-point/g) || []).length, 4);
  assert.equal((html.match(/wt-v4-plan-actual-line/g) || []).length, 2);
  assert.match(html, /5\/6 · 105kg x 10회/);
  assert.match(html, /5\/9 · 110kg x 10회/);
  assert.match(html, /5\/7 · 120kg x 5회/);
  assert.match(html, /5\/10 · 125kg x 5회/);
});

test('renderMaxPlanEditor · 지난 주 목표를 못 넘기면 미달 상태를 표시하되 계획선은 유지한다', () => {
  const html = renderMaxPlanEditor({
    cycle: {
      startDate: '2026-05-04',
      weeks: 6,
      benchmarks: [{
        id: 'bm_lower_squat_behind',
        exerciseId: 'ex_squat_behind',
        movementId: 'back_squat',
        label: '백 스쿼트',
        primaryMajor: 'lower',
        tracks: {
          M: { startKg: 100, targetKg: 125, incrementKg: 5, startReps: 10, targetReps: 10, enabled: true },
          H: { startKg: 120, targetKg: 170, incrementKg: 10, startReps: 5, targetReps: 5, enabled: true },
        },
      }],
    },
    movements: [{
      id: 'ex_squat_behind',
      exerciseId: 'ex_squat_behind',
      movementId: 'back_squat',
      nameKo: '백 스쿼트',
      primary: 'lower',
      equipment_category: 'barbell',
      optionLabel: '하체 · 백 스쿼트 · 공통',
    }],
    exList: [{ id: 'ex_squat_behind', movementId: 'back_squat', name: '백 스쿼트' }],
    cache: {
      '2026-05-11': {
        exercises: [{
          exerciseId: 'ex_squat_behind',
          movementId: 'back_squat',
          sets: [{ kg: 110, reps: 4, done: true }],
        }],
      },
    },
    todayKey: '2026-05-18',
  });
  assert.match(html, /wt-v4-plan-actual-line/);
  assert.match(html, /wt-v4-plan-actual-point is-issue/);
  assert.match(html, /5\/11 110kg×4 미달/);
  assert.match(html, /105kg/);
});

test('renderMaxPlanEditor · 없는 벤치마크 진입은 추가 버튼을 강조한다', () => {
  const html = renderMaxPlanEditor({
    cycle: { weeks: 6, benchmarks: [] },
    movements: [],
    focusAddBenchmark: true,
  });
  assert.match(html, /wt-v4-plan-section is-add-focused/);
  assert.match(html, /wt-v4-bench-add is-focused/);
});

test('buildMaxPlanMovementOptionSeeds · 벤치마크 후보는 현재 헬스장/공용 등록 종목 전체를 노출한다', () => {
  const exList = [
    { id: 'ex_default_bench', name: '기본 벤치', movementId: 'barbell_bench' },
    { id: 'ex_default_rdl', name: '루마니안 데드리프트', movementId: 'rdl' },
    { id: 'ex_default_lat', name: '기본 랫풀다운', movementId: 'lat_pulldown' },
    { id: 'ex_moon_press', name: '문정 체스트프레스', movementId: 'chest_press_machine', gymId: 'gym_moon', primaryGymId: 'gym_moon', gymTags: ['gym_moon'] },
    { id: 'ex_other_press', name: '다른 체스트프레스', movementId: 'chest_press_machine', gymId: 'gym_other', primaryGymId: 'gym_other', gymTags: ['gym_other'] },
    { id: 'ex_unknown', name: '알 수 없는 운동', movementId: 'unknown_move', gymId: 'gym_moon', primaryGymId: 'gym_moon', gymTags: ['gym_moon'] },
  ];
  const inactiveLat = buildMaxPlanMovementOptionSeeds({
    exList,
    movements: MOVEMENTS_FIXTURE,
    currentGymId: 'gym_moon',
    activeEquipment: [
      { id: 'pool_barbell', scope: 'global', category: 'barbell', movementIds: ['barbell_bench'] },
    ],
  });
  assert.deepEqual(
    inactiveLat.map(seed => seed.exercise?.id || seed.movement?.id).sort(),
    ['ex_default_bench', 'ex_default_lat', 'ex_default_rdl', 'ex_moon_press', 'high_row'].sort(),
  );

  const activeLat = buildMaxPlanMovementOptionSeeds({
    exList,
    movements: MOVEMENTS_FIXTURE,
    currentGymId: 'gym_moon',
    activeEquipment: [
      { id: 'pool_barbell', scope: 'global', category: 'barbell', movementIds: ['barbell_bench'] },
      { id: 'pool_lat', scope: 'gym', ownerGymId: 'gym_moon', category: 'machine', movementIds: ['lat_pulldown'] },
    ],
  });
  assert.ok(activeLat.some(seed => seed.exercise?.id === 'ex_default_lat'));
  assert.ok(activeLat.every(seed => seed.exercise?.id !== 'ex_other_press'));
});

test('buildMaxPlanMovementOptionSeeds · movementIds 없는 실제 기구는 이름으로 벤치마크 후보에 포함한다', () => {
  const seeds = buildMaxPlanMovementOptionSeeds({
    exList: [],
    movements: MOVEMENTS_FIXTURE,
    currentGymId: 'gym_moon',
    activeEquipment: [
      { id: 'pool_moon_lat', scope: 'gym', ownerGymId: 'gym_moon', name: '파나타 랫풀다운 머신', category: 'machine', movementIds: [] },
    ],
  });

  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].kind, 'movement');
  assert.equal(seeds[0].movement.id, 'lat_pulldown');
  assert.equal(seeds[0].equipment.id, 'pool_moon_lat');
});

test('buildMaxPlanMovementOptionSeeds · movementId 없는 등록 종목도 이름으로 벤치마크 후보에 포함한다', () => {
  const seeds = buildMaxPlanMovementOptionSeeds({
    exList: [
      { id: 'ex_lat_legacy', name: '랫풀다운', movementId: 'unknown', gymId: 'gym_moon' },
      { id: 'ex_rdl_legacy', name: '루마니안 데드리프트', gymTags: ['*'] },
    ],
    movements: MOVEMENTS_FIXTURE,
    currentGymId: 'gym_moon',
    activeEquipment: [],
  });

  assert.deepEqual(
    seeds.map(seed => [seed.exercise?.id || null, seed.movement.id]).sort(),
    [
      [null, 'high_row'],
      ['ex_lat_legacy', 'lat_pulldown'],
      ['ex_rdl_legacy', 'rdl'],
    ],
  );
});

test('buildMaxPlanMovementOptionSeeds · 같은 부위 머신 등록 종목이 있으면 랫풀다운 같은 머신 후보도 노출한다', () => {
  const seeds = buildMaxPlanMovementOptionSeeds({
    exList: [
      { id: 'ex_panatta_high_row', name: '파나타 플레이트 하이로우', movementId: 'high_row', category: 'machine' },
    ],
    movements: MOVEMENTS_FIXTURE,
    currentGymId: 'gym_moon',
    activeEquipment: [],
  });

  const pairs = seeds.map(seed => [seed.exercise?.id || null, seed.movement.id]).sort();
  assert.ok(pairs.some(([, movementId]) => movementId === 'lat_pulldown'));
  assert.ok(pairs.some(([exerciseId, movementId]) => exerciseId === 'ex_panatta_high_row' && movementId === 'high_row'));
});

test('selectPersistedMaxCycle · 별도 max_cycle의 최신 트랙 값을 보존한다', () => {
  const presetCycle = {
    id: 'cycle_tracks',
    updatedAt: 100,
    benchmarks: [{
      id: 'bm_rdl',
      movementId: 'rdl',
      label: '루마니안 데드리프트',
      primaryMajor: 'back',
      tracks: {
        M: { startKg: 60, targetKg: 70, incrementKg: 2.5, targetReps: 12 },
        H: { startKg: 70, targetKg: 80, incrementKg: 2.5, targetReps: 6 },
      },
    }],
  };
  const settingCycle = {
    id: 'cycle_tracks',
    updatedAt: 200,
    benchmarks: [{
      id: 'bm_rdl',
      movementId: 'rdl',
      label: '루마니안 데드리프트',
      primaryMajor: 'back',
      tracks: {
        M: { startKg: 82.5, targetKg: 92.5, incrementKg: 2.5, targetReps: 10 },
        H: { startKg: 95, targetKg: 105, incrementKg: 5, targetReps: 5 },
      },
    }],
  };

  const selected = selectPersistedMaxCycle(presetCycle, settingCycle);
  assert.equal(selected.benchmarks[0].tracks.M.startKg, 82.5);
  assert.equal(selected.benchmarks[0].tracks.H.targetKg, 105);

  const newerPreset = {
    ...presetCycle,
    updatedAt: 300,
    benchmarks: [{
      ...presetCycle.benchmarks[0],
      tracks: {
        M: { startKg: 90, targetKg: 100, incrementKg: 2.5, targetReps: 12 },
        H: { startKg: 102.5, targetKg: 112.5, incrementKg: 2.5, targetReps: 5 },
      },
    }],
  };
  const selectedPreset = selectPersistedMaxCycle(newerPreset, settingCycle);
  assert.equal(selectedPreset.benchmarks[0].tracks.M.startKg, 90);
  assert.equal(selectedPreset.benchmarks[0].tracks.H.targetKg, 112.5);
});

test('resolveMaxBenchmarkPickerItems · 종목추가 피커는 벤치마크 우선 + 같은 부위 등록 종목을 함께 보여준다', () => {
  const cycle = {
    id: 'cycle_picker_scope',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [
      {
        id: 'bm_chest_moon_bench',
        exerciseId: 'ex_moon_bench',
        movementId: 'barbell_bench',
        label: '문정 바벨 벤치프레스',
        primaryMajor: 'chest',
        startKg: 80,
        targetKg: 85,
        incrementKg: 2.5,
      },
      {
        id: 'bm_back_row',
        exerciseId: 'ex_row',
        movementId: 'barbell_row',
        label: '바벨 로우',
        primaryMajor: 'back',
        startKg: 60,
        targetKg: 70,
        incrementKg: 2.5,
      },
    ],
  };
  const exList = [
    { id: 'ex_moon_bench', name: '문정 바벨 벤치프레스', movementId: 'barbell_bench', muscleId: 'chest', gymTags: ['gym_moon'] },
    { id: 'ex_global_dumbbell', name: 'Global Dumbbell Bench', movementId: 'dumbbell_bench', muscleId: 'chest', gymTags: ['*'] },
    { id: 'ex_moon_chest_press', name: 'Moon Chest Press', movementId: 'chest_press_machine', muscleId: 'chest', gymTags: ['gym_moon'] },
    { id: 'ex_other_bench', name: '다른 벤치', movementId: 'barbell_bench', muscleId: 'chest', gymTags: ['gym_other'] },
    { id: 'ex_row', name: '바벨 로우', movementId: 'barbell_row', muscleId: 'back', gymTags: ['*'] },
  ];

  const items = resolveMaxBenchmarkPickerItems({
    cycle,
    exList,
    selectedMajors: ['chest'],
    currentGymId: 'gym_moon',
    todayKey: '2026-05-11',
    cache: {},
    fallbackMovements: MOVEMENTS_FIXTURE,
  });

  assert.deepEqual(items.map(item => item.exercise.id), ['ex_moon_bench', 'ex_global_dumbbell', 'ex_moon_chest_press']);
  assert.deepEqual(items.map(item => item.benchmark?.id || null), ['bm_chest_moon_bench', null, null]);
  assert.deepEqual(items.map(item => item.kind), ['benchmark', 'exercise', 'exercise']);
});

test('resolveMaxBenchmarkPickerItems · 등 선택 시 랫풀다운은 벤치마크가 아니어도 추가 후보로 보인다', () => {
  const cycle = {
    id: 'cycle_picker_back_scope',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [{
      id: 'bm_back_rdl',
      exerciseId: 'ex_rdl',
      movementId: 'rdl',
      label: '루마니안 데드리프트',
      primaryMajor: 'back',
      startKg: 80,
      targetKg: 90,
      incrementKg: 2.5,
    }],
  };
  const exList = [
    { id: 'ex_rdl', name: '루마니안 데드리프트', movementId: 'rdl', muscleId: 'back', gymTags: ['gym_moon'] },
    { id: 'ex_lat', name: '랫풀다운', movementId: 'lat_pulldown', muscleId: 'back', gymTags: ['gym_moon'] },
    { id: 'ex_high_row', name: '하이로우', movementId: 'high_row', muscleId: 'back', gymTags: ['*'] },
    { id: 'ex_other_lat', name: '다른 헬스장 랫풀다운', movementId: 'lat_pulldown', muscleId: 'back', gymTags: ['gym_other'] },
  ];

  const items = resolveMaxBenchmarkPickerItems({
    cycle,
    exList,
    selectedMajors: ['back'],
    currentGymId: 'gym_moon',
    todayKey: '2026-05-11',
    cache: {},
    fallbackMovements: MOVEMENTS_FIXTURE,
  });
  const ids = items.map(item => item.exercise.id);

  assert.equal(ids[0], 'ex_rdl');
  assert.ok(ids.includes('ex_lat'));
  assert.ok(ids.includes('ex_high_row'));
  assert.ok(!ids.includes('ex_other_lat'));
  assert.deepEqual(items.find(item => item.exercise.id === 'ex_lat')?.kind, 'exercise');
});

test('resolveMaxBenchmarkPickerItems · movementId가 비어도 이름으로 같은 부위 종목을 복원한다', () => {
  const cycle = {
    id: 'cycle_picker_inferred_movement',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [{
      id: 'bm_back_rdl',
      exerciseId: 'ex_rdl',
      movementId: 'rdl',
      label: '루마니안 데드리프트',
      primaryMajor: 'back',
      startKg: 80,
      targetKg: 90,
      incrementKg: 2.5,
    }],
  };
  const exList = [
    { id: 'ex_rdl', name: '루마니안 데드리프트', movementId: 'rdl', muscleId: 'back', gymTags: ['gym_moon'] },
    { id: 'ex_panatta_high_row', name: '파나타 플레이트 하이로우', movementId: 'unknown', gymTags: ['gym_moon'] },
  ];

  const items = resolveMaxBenchmarkPickerItems({
    cycle,
    exList,
    selectedMajors: ['back'],
    currentGymId: 'gym_moon',
    todayKey: '2026-05-11',
    cache: {},
    fallbackMovements: MOVEMENTS_FIXTURE,
  });
  const inferred = items.find(item => item.exercise.id === 'ex_panatta_high_row');

  assert.equal(inferred?.kind, 'exercise');
  assert.equal(inferred?.exercise.muscleId, 'back');
  assert.equal(inferred?.exercise.movementId, 'high_row');
});

test('buildMaxPickerExerciseEntry · 벤치마크가 아닌 피커 종목은 일반 수동 종목으로 추가한다', () => {
  const entry = buildMaxPickerExerciseEntry({
    exercise: { id: 'ex_panatta_high_row', name: '파나타 플레이트 하이로우', muscleId: 'back', movementId: 'high_row' },
    benchmark: null,
    cycle: { id: 'cycle_picker_manual_extra', benchmarks: [] },
    todayKey: '2026-05-11',
    currentGymId: 'gym_moon',
    now: 1,
  });

  assert.equal(entry.exerciseId, 'ex_panatta_high_row');
  assert.equal(entry.muscleId, 'back');
  assert.equal(entry.movementId, 'high_row');
  assert.deepEqual(entry.sets, [{ kg: 0, reps: 0, setType: 'main', done: false }]);
  assert.equal(entry.maxPrescription, undefined);
  assert.equal(entry.recommendationMeta, undefined);
});

test('buildMaxBenchmarkPickerEntry · 벤치마크 카드의 계획 kg/reps를 추가 세트에 그대로 넣는다', () => {
  const cycle = {
    id: 'cycle_picker_sets',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    todayTracks: { '2026-05-18': { bm_chest_moon_bench: 'H' } },
    benchmarks: [{
      id: 'bm_chest_moon_bench',
      exerciseId: 'ex_moon_bench',
      movementId: 'barbell_bench',
      label: '문정 바벨 벤치프레스',
      primaryMajor: 'chest',
      tracks: {
        M: { startKg: 80, targetKg: 85, incrementKg: 2.5, startReps: 12, targetReps: 12, enabled: true },
        H: { startKg: 90, targetKg: 95, incrementKg: 2.5, startReps: 8, targetReps: 6, enabled: true },
      },
    }],
  };
  const exList = [{ id: 'ex_moon_bench', name: '문정 바벨 벤치프레스', movementId: 'barbell_bench', muscleId: 'chest' }];
  const [item] = resolveMaxBenchmarkPickerItems({
    cycle,
    exList,
    selectedMajors: ['chest'],
    todayKey: '2026-05-18',
    cache: {},
  });
  const entry = buildMaxBenchmarkPickerEntry({
    exercise: item.exercise,
    benchmark: item.benchmark,
    cycle: item.cycle,
    todayKey: '2026-05-18',
    currentGymId: 'gym_moon',
    now: 1,
  });

  assert.equal(entry.exerciseId, 'ex_moon_bench');
  assert.equal(entry.recommendationMeta.kind, 'benchmark');
  assert.equal(entry.recommendationMeta.track, 'H');
  assert.equal(entry.maxPrescription.startKg, 92.5);
  assert.equal(entry.maxPrescription.repsHigh, 6);
  assert.equal(entry.sets.length, 3);
  assert.ok(entry.sets.every(set => set.kg === 92.5 && set.reps === 6));
});

test('buildMaxBenchmarkPickerEntry · 볼륨 단일 벤치마크는 H 대안을 만들지 않는다', () => {
  const cycle = {
    id: 'cycle_picker_volume_only',
    status: 'active',
    framework: 'dual_track_progression_v2',
    startDate: '2026-05-04',
    weeks: 6,
    todayTrack: 'H',
    todayTracks: { '2026-05-11': { bm_bicep_curl: 'H' } },
    benchmarks: [{
      id: 'bm_bicep_curl',
      exerciseId: 'ex_curl',
      movementId: 'barbell_curl',
      label: '바벨 컬',
      primaryMajor: 'bicep',
      tracks: {
        M: { startKg: 30, targetKg: 35, incrementKg: 2.5, startReps: 15, targetReps: 15, enabled: true },
        H: { startKg: 40, targetKg: 45, incrementKg: 2.5, startReps: 8, targetReps: 6, enabled: true },
      },
    }],
  };
  const snapshot = buildRenderedMaxCycleSnapshot({
    cycle,
    cache: {},
    exList: [{ id: 'ex_curl', name: '바벨 컬', movementId: 'barbell_curl', muscleId: 'bicep' }],
    todayKey: '2026-05-11',
  });
  const benchmark = snapshot.benchmarks[0];
  const entry = buildMaxBenchmarkPickerEntry({
    exercise: { id: 'ex_curl', name: '바벨 컬', movementId: 'barbell_curl', muscleId: 'bicep' },
    benchmark,
    cycle: snapshot,
    todayKey: '2026-05-11',
    now: 1,
  });

  assert.equal(benchmark.activeTrack, 'M');
  assert.equal(entry.recommendationMeta.track, 'M');
  assert.equal(entry.maxPrescription.targetSets, 4);
  assert.equal(entry.sets.length, 4);
  assert.ok(entry.maxPrescription.trackAlternatives.M);
  assert.equal(entry.maxPrescription.trackAlternatives.H, undefined);
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

test('renderMaxCycleDashboard · 성장판 미리보기가 기존 벤치마크/제안 카드를 대체한다', () => {
  const cycle = {
    version: 1,
    startDate: '2026-05-04',
    weeks: 6,
    benchmarks: [{
      id: 'bm_chest_barbell_bench',
      exerciseId: 'ex_bench',
      movementId: 'barbell_bench',
      label: '바벨 벤치프레스',
      primaryMajor: 'chest',
      startKg: 75,
      targetKg: 77.5,
      incrementKg: 2.5,
    }],
  };
  const html = renderMaxCycleDashboard({
    cycle,
    exList: [{ id: 'ex_bench', movementId: 'barbell_bench' }],
    todayKey: '2026-05-11',
    cache: {},
    growthPreviewHtml: '<section class="wt-v4-growth-preview">성장판 미리보기</section>',
  });
  assert.match(html, /wt-v4-growth-preview/);
  assert.ok(html.indexOf('wt-v4-growth-preview') < html.indexOf('wt-v4-track-card'));
  assert.doesNotMatch(html, /wt-v4-benchmark-card/);
  assert.doesNotMatch(html, /오늘 열릴 벤치마크/);
  assert.doesNotMatch(html, /다음 동일 부위 Day 제안/);
});

test('renderMaxGrowthPreview · 벤치마크 계획과 기준 대비 수행지수를 통합한다', () => {
  const movements = [
    { id:'barbell_bench', nameKo:'바벨 벤치프레스', primary:'chest', subPattern:'chest_mid', equipment_category:'barbell' },
    { id:'decline_machine_press', nameKo:'디클라인 머신 프레스', primary:'chest', subPattern:'chest_lower', equipment_category:'machine' },
  ];
  const exList = [
    { id:'ex_bench', name:'바벨 벤치프레스', movementId:'barbell_bench', muscleIds:['chest_mid'] },
  ];
  const cache = {
    '2026-05-06': {
      exercises: [{ exerciseId:'ex_bench', sets:[
        { kg:75, reps:10, done:true, setType:'main' },
        { kg:75, reps:10, done:true, setType:'main' },
        { kg:75, reps:10, done:true, setType:'main' },
        { kg:75, reps:10, done:true, setType:'main' },
      ] }],
    },
    '2026-05-11': {
      exercises: [{ exerciseId:'ex_bench', sets:[
        { kg:82.5, reps:6, done:true, setType:'main' },
        { kg:82.5, reps:6, done:true, setType:'main' },
        { kg:82.5, reps:6, done:true, setType:'main' },
      ] }],
    },
  };
  const comparison = {
    majors: ['chest'],
    today: null,
    previous: [{ dateKey:'2026-05-11' }, { dateKey:'2026-05-06' }],
    deltas: [],
    imbalance: null,
  };
  const snapshot = {
    weekIndex: 2,
    weeks: 6,
    track: 'M',
    benchmarks: [{
      id: 'bm_chest_barbell_bench',
      exerciseId: 'ex_bench',
      movementId: 'barbell_bench',
      label: '바벨 벤치프레스',
      primaryMajor: 'chest',
      activeTrack: 'M',
      planned: { plannedKg: 77.5, targetReps: 12 },
      plannedByTrack: {
        M: { plannedKg: 77.5, targetReps: 12 },
        H: { plannedKg: 85, targetReps: 6 },
      },
    }],
  };
  const html = renderMaxGrowthPreview({
    comparison,
    cache,
    exList,
    majors: ['chest'],
    movements,
    snapshot,
    recommendationHtml: '<div class="wt-v4-growth-rec-panel">오늘 보강 종목</div>',
  });
  assert.match(html, /성장판 미리보기/);
  assert.match(html, /기준 벤치마크 · 바벨 벤치프레스/);
  assert.match(html, /data-action="open-max-benchmark-editor"/);
  assert.match(html, /data-benchmark-id="bm_chest_barbell_bench"/);
  assert.match(html, /wt-v4-plan-stair-line/);
  assert.match(html, /검정 목표 · 파랑 실제/);
  assert.match(html, /77\.5kg/);
  assert.match(html, /12회/);
  assert.match(html, /가슴 하부/);
  assert.match(html, /보완 코멘트/);
  assert.match(html, /wt-v4-growth-coach-head/);
  assert.match(html, /최근 2회가 가슴 중부 위주라 가슴 상부\/가슴 하부가 부족합니다/);
  assert.doesNotMatch(html, /wt-v4-growth-coach-copy"[^>]*><b>/);
  assert.doesNotMatch(html, /기준 대비/);
  assert.doesNotMatch(html, /오늘 보강 종목/);
  assert.doesNotMatch(html, /오늘 열릴 벤치마크/);
  assert.doesNotMatch(html, /오늘 시작 전 코치/);
  assert.doesNotMatch(html, /부위별 직직전/);
  assert.doesNotMatch(html, /100 = 최근 같은 부위/);
  assert.doesNotMatch(html, /우상향 보정 없음/);

  const missingHtml = renderMaxGrowthPreview({
    comparison,
    cache,
    exList,
    majors: ['chest'],
    movements,
    snapshot: { track: 'M', benchmarks: [] },
  });
  assert.match(missingHtml, /기준 벤치마크 · 등록하기/);
  assert.match(missingHtml, /data-benchmark-missing="1"/);
  assert.match(missingHtml, /data-major-part="chest"/);
});

test('renderMaxGrowthPreview · 최근 등 기록이 힌지 위주면 넓이/두께 보완 코멘트를 보여준다', () => {
  const movements = [
    { id:'lat_pulldown', nameKo:'랫풀다운', primary:'back', subPattern:'back_width', equipment_category:'machine' },
    { id:'high_row', nameKo:'하이로우', primary:'back', subPattern:'back_thickness', equipment_category:'machine' },
    { id:'rdl', nameKo:'루마니안 데드리프트', primary:'back', subPattern:'posterior', equipment_category:'barbell' },
  ];
  const exList = [
    { id:'ex_rdl', name:'루마니안 데드리프트', movementId:'rdl', muscleIds:['posterior'] },
  ];
  const cache = {
    '2026-05-05': {
      exercises: [{ exerciseId:'ex_rdl', sets:[
        { kg:80, reps:15, done:true, setType:'main' },
        { kg:80, reps:15, done:true, setType:'main' },
        { kg:80, reps:15, done:true, setType:'main' },
        { kg:80, reps:15, done:true, setType:'main' },
      ] }],
    },
    '2026-05-12': {
      exercises: [{ exerciseId:'ex_rdl', sets:[
        { kg:90, reps:12, done:true, setType:'main' },
        { kg:90, reps:12, done:true, setType:'main' },
        { kg:90, reps:12, done:true, setType:'main' },
      ] }],
    },
  };
  const html = renderMaxGrowthPreview({
    comparison: {
      majors: ['back'],
      today: { dateKey:'2026-05-15' },
      previous: [{ dateKey:'2026-05-12' }, { dateKey:'2026-05-05' }],
      deltas: [],
      imbalance: null,
    },
    cache,
    exList,
    majors: ['back'],
    movements,
    snapshot: {
      track: 'M',
      benchmarks: [{
        id: 'bm_back_rdl',
        exerciseId: 'ex_rdl',
        movementId: 'rdl',
        label: '루마니안 데드리프트',
        primaryMajor: 'back',
        activeTrack: 'M',
        planned: { plannedKg: 90, targetReps: 15 },
      }],
    },
  });

  assert.match(html, /보완 코멘트/);
  assert.match(html, /wt-v4-growth-coach-head/);
  assert.match(html, /등 넓이\/등 두께 보강/);
  assert.doesNotMatch(html, /등 등 넓이/);
  assert.match(html, /최근 2회가 후면사슬 위주라 등 넓이\/등 두께가 부족합니다/);
  assert.match(html, /랫풀다운 \/ 하이로우 중 1개/);
  assert.doesNotMatch(html, /wt-v4-growth-coach-copy"[^>]*><b>/);
});

test('renderMaxGrowthPreview · 직전/직직전은 선택 조합 날짜가 아니라 해당 벤치마크 수행일을 쓴다', () => {
  const movements = [
    { id:'barbell_bench', nameKo:'바벨 벤치프레스', primary:'chest', subPattern:'chest_mid', equipment_category:'barbell' },
    { id:'cable_fly', nameKo:'케이블 플라이', primary:'chest', subPattern:'chest_mid', equipment_category:'cable' },
  ];
  const exList = [
    { id:'ex_bench', name:'바벨 벤치프레스', movementId:'barbell_bench', muscleIds:['chest_mid'] },
    { id:'ex_fly', name:'케이블 플라이', movementId:'cable_fly', muscleIds:['chest_mid'] },
  ];
  const cache = {
    '2026-05-13': {
      exercises: [{ exerciseId:'ex_fly', sets:[
        { kg:25, reps:15, done:true, setType:'main' },
        { kg:25, reps:15, done:true, setType:'main' },
      ] }],
    },
    '2026-05-11': {
      exercises: [{ exerciseId:'ex_bench', sets:[
        { kg:82.5, reps:6, done:true, setType:'main' },
        { kg:82.5, reps:6, done:true, setType:'main' },
        { kg:82.5, reps:6, done:true, setType:'main' },
      ] }],
    },
    '2026-05-01': {
      exercises: [{ exerciseId:'ex_bench', sets:[
        { kg:75, reps:10, done:true, setType:'main' },
        { kg:75, reps:10, done:true, setType:'main' },
        { kg:75, reps:10, done:true, setType:'main' },
        { kg:75, reps:10, done:true, setType:'main' },
      ] }],
    },
  };
  const html = renderMaxGrowthPreview({
    comparison: {
      majors: ['chest'],
      today: { dateKey:'2026-05-14' },
      previous: [{ dateKey:'2026-05-13' }, { dateKey:'2026-05-11' }],
      deltas: [],
      imbalance: null,
    },
    cache,
    exList,
    majors: ['chest'],
    movements,
    snapshot: {
      track: 'M',
      benchmarks: [{
        id: 'bm_chest_barbell_bench',
        exerciseId: 'ex_bench',
        movementId: 'barbell_bench',
        label: '바벨 벤치프레스',
        primaryMajor: 'chest',
        activeTrack: 'M',
        planned: { plannedKg: 77.5, targetReps: 12 },
      }],
    },
  });
  assert.match(html, /5\/11 · 강도 · 바벨 벤치프레스 · 3set x 82\.5kg x 6reps/);
  assert.match(html, /5\/1 · 볼륨 · 바벨 벤치프레스 · 4set x 75kg x 10reps/);
  assert.doesNotMatch(html, /직전 · 강도/);
  assert.doesNotMatch(html, /직직전 · 기록 없음/);
  assert.doesNotMatch(html, /기준 대비 82 · 기록 없음/);
});

test('renderMaxGrowthPreview · 벤치마크가 없을 때도 부위별 최신 수행일 2개를 따로 찾는다', () => {
  const movements = [
    { id:'barbell_bench', nameKo:'바벨 벤치프레스', primary:'chest', subPattern:'chest_mid', equipment_category:'barbell' },
    { id:'barbell_curl', nameKo:'바벨 컬', primary:'bicep', subPattern:'bicep', equipment_category:'barbell' },
  ];
  const exList = [
    { id:'ex_bench', name:'바벨 벤치프레스', movementId:'barbell_bench', muscleIds:['chest_mid'] },
    { id:'ex_curl', name:'바벨 컬', movementId:'barbell_curl', muscleIds:['bicep'] },
  ];
  const cache = {
    '2026-05-13': {
      exercises: [{ exerciseId:'ex_bench', sets:[
        { kg:80, reps:10, done:true, setType:'main' },
      ] }],
    },
    '2026-05-11': {
      exercises: [{ exerciseId:'ex_curl', sets:[
        { kg:30, reps:15, done:true, setType:'main' },
        { kg:30, reps:15, done:true, setType:'main' },
        { kg:30, reps:15, done:true, setType:'main' },
      ] }],
    },
    '2026-05-04': {
      exercises: [{ exerciseId:'ex_curl', sets:[
        { kg:27.5, reps:15, done:true, setType:'main' },
        { kg:27.5, reps:15, done:true, setType:'main' },
        { kg:27.5, reps:15, done:true, setType:'main' },
      ] }],
    },
  };
  const html = renderMaxGrowthPreview({
    comparison: {
      majors: ['bicep'],
      today: { dateKey:'2026-05-14' },
      previous: [{ dateKey:'2026-05-13' }, { dateKey:'2026-05-11' }],
      deltas: [],
      imbalance: null,
    },
    cache,
    exList,
    majors: ['bicep'],
    movements,
    snapshot: { track: 'M', benchmarks: [] },
  });
  assert.match(html, /5\/11 · 볼륨 · 바벨 컬 · 3set x 30kg x 15reps/);
  assert.match(html, /5\/4 · 볼륨 · 바벨 컬 · 3set x 27\.5kg x 15reps/);
  assert.doesNotMatch(html, /직전 · 볼륨/);
  assert.doesNotMatch(html, /직직전 · 기록 없음/);
});

test('renderNextSameMuscleDayAdvice · 부위별 처방을 숫자 근거보다 먼저 보여준다', () => {
  const movements = [
    { id:'incline_bench', nameKo:'인클라인 벤치프레스', primary:'chest', subPattern:'chest_upper', equipment_category:'barbell' },
    { id:'machine_chest_press', nameKo:'체스트프레스 머신', primary:'chest', subPattern:'chest_mid', equipment_category:'machine' },
    { id:'decline_machine_press', nameKo:'디클라인 머신 프레스', primary:'chest', subPattern:'chest_lower', equipment_category:'machine' },
    { id:'cable_pushdown', nameKo:'케이블 푸쉬다운', primary:'tricep', subPattern:'tricep', equipment_category:'cable' },
    { id:'weighted_crunch', nameKo:'중량 크런치', primary:'abs', subPattern:'core', equipment_category:'machine' },
  ];
  const exList = [
    { id:'ex_incline', name:'인클라인 벤치프레스', movementId:'incline_bench', muscleIds:['chest_upper'] },
    { id:'ex_mid', name:'체스트프레스 머신', movementId:'machine_chest_press', muscleIds:['chest_mid'] },
    { id:'ex_tri', name:'케이블 푸쉬다운', movementId:'cable_pushdown', muscleIds:['tricep'] },
  ];
  const cache = {
    '2026-05-11': {
      exercises: [
        { exerciseId:'ex_incline', sets:[
          { kg:30, reps:15, done:true, setType:'main' },
          { kg:30, reps:15, done:true, setType:'main' },
          { kg:30, reps:15, done:true, setType:'main' },
        ] },
      ],
    },
    '2026-05-06': {
      exercises: [
        { exerciseId:'ex_incline', sets:[
          { kg:60, reps:8, done:true, setType:'main' },
          { kg:60, reps:8, done:true, setType:'main' },
          { kg:60, reps:8, done:true, setType:'main' },
        ] },
        { exerciseId:'ex_mid', sets:[
          { kg:80, reps:8, done:true, setType:'main' },
          { kg:80, reps:8, done:true, setType:'main' },
          { kg:80, reps:8, done:true, setType:'main' },
        ] },
        { exerciseId:'ex_tri', sets:[
          { kg:35, reps:12, done:true, setType:'main' },
          { kg:35, reps:12, done:true, setType:'main' },
          { kg:35, reps:12, done:true, setType:'main' },
          { kg:35, reps:12, done:true, setType:'main' },
        ] },
      ],
    },
  };
  const comparison = {
    majors: ['chest', 'tricep', 'abs'],
    today: null,
    previous: [
      { dateKey:'2026-05-11' },
      { dateKey:'2026-05-06' },
    ],
    deltas: [],
    imbalance: null,
  };

  const html = renderNextSameMuscleDayAdvice({
    comparison,
    cache,
    exList,
    majors: ['chest', 'tricep', 'abs'],
    movements,
  });

  assert.match(html, /가슴/);
  assert.match(html, /가슴 하부 보강|하부 보강/);
  assert.match(html, /최근 2회가 .*위주라 .*가슴 하부가 부족/);
  assert.match(html, /삼두/);
  assert.match(html, /유지/);
  assert.match(html, /복근/);
  assert.match(html, /기준 기록 만들기/);
  assert.ok(html.indexOf('wt-v4-next-day-plan-list') < html.indexOf('직전 기록 근거'));
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
