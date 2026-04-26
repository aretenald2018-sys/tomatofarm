// ================================================================
// calc.max.test.js — 맥스 모드 보강 추천 (suggestMaxBoosts) 회귀 테스트
// 실행: `node --test tests/calc.max.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestMaxBoosts, buildMaxPrescription, detectMaxFixedMovements } from '../calc.js';

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
