// ================================================================
// calc.muscle-comparison.test.js
// 인사이트 "해당 부위 직전/직직전 비교" 로직 회귀 방지.
//   - getSessionMajorMuscles
//   - summarizeMuscleSession
//   - findRecentSameMuscleSessions
//   - buildMuscleComparison
// 실행: node --test tests/calc.muscle-comparison.test.js
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSessionMajorMuscles,
  summarizeMuscleSession,
  findRecentSameMuscleSessions,
  buildMuscleComparison,
  SUBPATTERN_TO_MAJOR,
} from '../calc.js';

// ── 고정 픽스처 ──────────────────────────────────────────────────
const EX_LIST = [
  // 가슴
  { id: 'bp',   name: '바벨 벤치',         movementId: 'barbell_bench',          muscleIds: ['chest_mid']   },
  { id: 'inc',  name: '인클라인 바벨 벤치', movementId: 'incline_barbell_bench',  muscleIds: ['chest_upper'] },
  { id: 'dec',  name: '디클라인 프레스',    movementId: 'decline_machine_press',  muscleIds: ['chest_lower'] },
  // 등
  { id: 'ltp',  name: '랫풀다운',           movementId: 'lat_pulldown',           muscleIds: ['back_width']     },
  { id: 'row',  name: '바벨 로우',          movementId: 'barbell_row',            muscleIds: ['back_thickness'] },
  // 이두
  { id: 'bc',   name: '바벨 컬',            movementId: 'barbell_curl',           muscleIds: ['bicep'] },
  // 커스텀(muscleIds/movementId 없음) — 대분류 결정 불가 → 제외되어야 정상.
  { id: 'cust', name: '커스텀 운동',        movementId: null,                     muscleIds: [] },
];

const MOVEMENTS = [
  { id: 'barbell_bench',         primary: 'chest',  subPattern: 'chest_mid' },
  { id: 'incline_barbell_bench', primary: 'chest',  subPattern: 'chest_upper' },
  { id: 'decline_machine_press', primary: 'chest',  subPattern: 'chest_lower' },
  { id: 'lat_pulldown',          primary: 'back',   subPattern: 'back_width' },
  { id: 'barbell_row',           primary: 'back',   subPattern: 'back_thickness' },
  { id: 'barbell_curl',          primary: 'bicep',  subPattern: 'bicep' },
];

function workSet(kg, reps, extra = {}) { return { kg, reps, done: true, ...extra }; }
function warmup(kg, reps) { return { kg, reps, setType: 'warmup', done: true }; }

// ── SUBPATTERN_TO_MAJOR 기본 무결성 ─────────────────────────────
test('SUBPATTERN_TO_MAJOR · chest_* → chest', () => {
  assert.equal(SUBPATTERN_TO_MAJOR.chest_upper, 'chest');
  assert.equal(SUBPATTERN_TO_MAJOR.chest_mid,   'chest');
  assert.equal(SUBPATTERN_TO_MAJOR.chest_lower, 'chest');
});
test('SUBPATTERN_TO_MAJOR · glute 는 lower와 분리 독립', () => {
  assert.equal(SUBPATTERN_TO_MAJOR.glute, 'glute');
  assert.equal(SUBPATTERN_TO_MAJOR.quad,  'lower');
});

// ── getSessionMajorMuscles ─────────────────────────────────────
test('getSessionMajorMuscles · 가슴 종목만 있으면 {chest}', () => {
  const day = {
    exercises: [
      { exerciseId: 'bp',  sets: [workSet(80, 8), workSet(80, 8)] },
      { exerciseId: 'inc', sets: [workSet(60, 10)] },
    ],
  };
  const got = getSessionMajorMuscles(day, EX_LIST, MOVEMENTS);
  assert.deepEqual([...got].sort(), ['chest']);
});

test('getSessionMajorMuscles · 복수 부위(등+이두) 감지', () => {
  const day = {
    exercises: [
      { exerciseId: 'ltp', sets: [workSet(60, 10)] },
      { exerciseId: 'bc',  sets: [workSet(20, 12)] },
    ],
  };
  const got = getSessionMajorMuscles(day, EX_LIST, MOVEMENTS);
  assert.deepEqual([...got].sort(), ['back', 'bicep']);
});

test('getSessionMajorMuscles · 워밍업만 있는 entry는 제외', () => {
  const day = {
    exercises: [
      { exerciseId: 'bp',  sets: [warmup(40, 10), warmup(50, 10)] },
      { exerciseId: 'ltp', sets: [workSet(60, 10)] },
    ],
  };
  const got = getSessionMajorMuscles(day, EX_LIST, MOVEMENTS);
  assert.deepEqual([...got].sort(), ['back']);
});

test('getSessionMajorMuscles · 빈 세션은 빈 Set', () => {
  assert.equal(getSessionMajorMuscles({}, EX_LIST, MOVEMENTS).size, 0);
  assert.equal(getSessionMajorMuscles({ exercises: [] }, EX_LIST, MOVEMENTS).size, 0);
});

// ── summarizeMuscleSession ─────────────────────────────────────
test('summarizeMuscleSession · 가슴 필터 — 상/중/하 subBalance', () => {
  const day = {
    exercises: [
      { exerciseId: 'bp',  sets: [workSet(80, 8), workSet(80, 8), workSet(80, 7)] }, // chest_mid x3
      { exerciseId: 'inc', sets: [workSet(60, 10), workSet(60, 9)] },                // chest_upper x2
      { exerciseId: 'dec', sets: [workSet(70, 10)] },                                // chest_lower x1
      { exerciseId: 'bc',  sets: [workSet(20, 12)] },                                // bicep (필터됨)
    ],
  };
  const out = summarizeMuscleSession(day, EX_LIST, MOVEMENTS, ['chest']);
  assert.equal(out.workSets, 6);
  assert.equal(out.topKg, 80);
  assert.equal(out.subBalance.chest_upper, 2);
  assert.equal(out.subBalance.chest_mid,   3);
  assert.equal(out.subBalance.chest_lower, 1);
  assert.equal(out.exercises.length, 3);                    // bicep 제외
  // 볼륨: 80*8+80*8+80*7 + 60*10+60*9 + 70*10 = 640+640+560+600+540+700 = 3680
  assert.equal(out.totalVolume, 3680);
});

test('summarizeMuscleSession · majors=null 이면 전체 부위', () => {
  const day = {
    exercises: [
      { exerciseId: 'bp', sets: [workSet(80, 8)] },
      { exerciseId: 'bc', sets: [workSet(20, 12)] },
    ],
  };
  const out = summarizeMuscleSession(day, EX_LIST, MOVEMENTS, null);
  assert.equal(out.workSets, 2);
  assert.equal(out.exercises.length, 2);
});

test('summarizeMuscleSession · 워밍업 제외 + done=false 제외', () => {
  const day = {
    exercises: [
      { exerciseId: 'bp', sets: [
        warmup(40, 10),
        workSet(80, 8),
        { kg: 80, reps: 8, done: false },        // 스킵된 세트
        workSet(80, 6),
      ] },
    ],
  };
  const out = summarizeMuscleSession(day, EX_LIST, MOVEMENTS, ['chest']);
  assert.equal(out.workSets, 2);
  assert.equal(out.totalVolume, 80 * 8 + 80 * 6);
});

// ── findRecentSameMuscleSessions ───────────────────────────────
test('findRecentSameMuscleSessions · 오늘 가슴 → 직전/직직전 가슴 dateKey', () => {
  const cache = {
    '2026-04-20': { exercises: [{ exerciseId: 'bp',  sets: [workSet(80, 8)] }] },  // 오늘 (chest)
    '2026-04-18': { exercises: [{ exerciseId: 'inc', sets: [workSet(60, 10)] }] }, // chest
    '2026-04-16': { exercises: [{ exerciseId: 'ltp', sets: [workSet(60, 10)] }] }, // back (제외)
    '2026-04-14': { exercises: [{ exerciseId: 'dec', sets: [workSet(70, 10)] }] }, // chest
    '2026-04-10': { exercises: [{ exerciseId: 'bp',  sets: [workSet(75, 8)] }] },  // chest (3번째)
  };
  const keys = findRecentSameMuscleSessions(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['chest'], 2);
  assert.deepEqual(keys, ['2026-04-18', '2026-04-14']);
});

test('findRecentSameMuscleSessions · 오늘 당일 제외', () => {
  const cache = {
    '2026-04-20': { exercises: [{ exerciseId: 'bp', sets: [workSet(80, 8)] }] },
  };
  const keys = findRecentSameMuscleSessions(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['chest'], 2);
  assert.deepEqual(keys, []);
});

test('findRecentSameMuscleSessions · majors 비어있으면 []', () => {
  const cache = {
    '2026-04-18': { exercises: [{ exerciseId: 'bp', sets: [workSet(80, 8)] }] },
  };
  assert.deepEqual(findRecentSameMuscleSessions(cache, EX_LIST, MOVEMENTS, '2026-04-20', [], 2), []);
  assert.deepEqual(findRecentSameMuscleSessions(cache, EX_LIST, MOVEMENTS, '2026-04-20', new Set(), 2), []);
});

// ── buildMuscleComparison ──────────────────────────────────────
test('buildMuscleComparison · 오늘 가슴 세션 + 직전/직직전 비교 + 델타', () => {
  const cache = {
    // 오늘: chest 총 6세트, topKg=85, volume=3720
    '2026-04-20': { exercises: [
      { exerciseId: 'bp',  sets: [workSet(85, 8), workSet(85, 8), workSet(80, 7)] },
      { exerciseId: 'inc', sets: [workSet(60, 10), workSet(60, 9)] },
      { exerciseId: 'dec', sets: [workSet(70, 10)] },
    ] },
    // 직전(prev): 5세트, topKg=82.5, volume=2870
    '2026-04-18': { exercises: [
      { exerciseId: 'bp',  sets: [workSet(82.5, 8), workSet(82.5, 6)] },
      { exerciseId: 'inc', sets: [workSet(55, 10), workSet(55, 9)] },
      { exerciseId: 'dec', sets: [workSet(65, 10)] },
    ] },
    // 직직전(prevPrev): 4세트, topKg=80
    '2026-04-14': { exercises: [
      { exerciseId: 'bp',  sets: [workSet(80, 8), workSet(80, 8)] },
      { exerciseId: 'inc', sets: [workSet(50, 10), workSet(50, 10)] },
    ] },
    // 가슴 아닌 세션 (비교 대상 제외)
    '2026-04-16': { exercises: [
      { exerciseId: 'ltp', sets: [workSet(60, 10)] },
    ] },
  };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20');
  assert.deepEqual(cmp.majors, ['chest']);
  assert.equal(cmp.today.workSets, 6);
  assert.equal(cmp.today.topKg, 85);
  assert.equal(cmp.previous.length, 2);
  assert.equal(cmp.previous[0].dateKey, '2026-04-18');
  assert.equal(cmp.previous[1].dateKey, '2026-04-14');
  assert.equal(cmp.deltas.length, 2);
  assert.equal(cmp.deltas[0].vs, 'prev');
  assert.equal(cmp.deltas[0].workSetsDelta, 6 - 5);
  assert.equal(cmp.deltas[0].topKgDelta, +(85 - 82.5).toFixed(2));
  assert.equal(cmp.deltas[1].vs, 'prevPrev');
  assert.equal(cmp.deltas[1].workSetsDelta, 6 - 4);
});

test('buildMuscleComparison · 직전 세션이 없으면 previous=[], deltas=[]', () => {
  const cache = {
    '2026-04-20': { exercises: [{ exerciseId: 'bp', sets: [workSet(80, 8)] }] },
  };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20');
  assert.deepEqual(cmp.majors, ['chest']);
  assert.equal(cmp.previous.length, 0);
  assert.equal(cmp.deltas.length, 0);
});

test('buildMuscleComparison · 오늘 세션 자체가 비어있으면 majors=[]', () => {
  const cache = { '2026-04-20': { exercises: [] } };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20');
  assert.deepEqual(cmp.majors, []);
  assert.equal(cmp.today, null);
});

test('buildMuscleComparison · 불균형 감지 — chest_upper 만 빠진 경우', () => {
  // today+prev 합쳐 chest_mid/lower는 있지만 chest_upper 0세트.
  const cache = {
    '2026-04-20': { exercises: [
      { exerciseId: 'bp',  sets: [workSet(80, 8), workSet(80, 8)] },   // chest_mid x2
      { exerciseId: 'dec', sets: [workSet(70, 10), workSet(70, 10)] }, // chest_lower x2
    ] },
    '2026-04-18': { exercises: [
      { exerciseId: 'bp',  sets: [workSet(75, 8), workSet(75, 8)] },   // chest_mid x2
    ] },
  };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20');
  assert.ok(cmp.imbalance, 'imbalance 객체가 있어야 함');
  assert.ok(
    cmp.imbalance.weakSubPatterns.includes('chest_upper'),
    `weakSubPatterns 에 chest_upper 포함 기대 (got ${JSON.stringify(cmp.imbalance.weakSubPatterns)})`
  );
});

test('buildMuscleComparison · majors 명시 override 동작', () => {
  // 오늘 세션은 등+이두지만, majors=['back'] 로 override 시 back 만 집계.
  const cache = {
    '2026-04-20': { exercises: [
      { exerciseId: 'ltp', sets: [workSet(60, 10), workSet(60, 10)] },
      { exerciseId: 'bc',  sets: [workSet(20, 12), workSet(20, 12)] },
    ] },
    '2026-04-17': { exercises: [
      { exerciseId: 'ltp', sets: [workSet(55, 10)] },
    ] },
  };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['back']);
  assert.deepEqual(cmp.majors, ['back']);
  assert.equal(cmp.today.workSets, 2);                 // bicep 세트 제외
  assert.equal(cmp.previous[0].workSets, 1);
});

// ── 회귀 테스트 · 2026-04-20 코드 리뷰 Fix #2/#3 ──────────────────

test('Fix #2 regression · 오늘 복수 부위 합집합 호출 시 이전 이두-only 세션이 가슴 topKg 와 섞여 잘못된 델타 발생', () => {
  // 오늘 = 가슴(80kg) + 이두(18kg).
  // 이전 직전세션은 이두만(18kg). majors=null(합집합) 으로 호출하면 "같은 부위 세션" 으로 매칭되어
  // topKgDelta = 80 - 18 = 62 (잘못된 비교). 이 회귀는 "부위별 독립 호출" 호출부 수정으로 막는다.
  const cache = {
    '2026-04-20': { exercises: [
      { exerciseId: 'bp', sets: [workSet(80, 8), workSet(80, 8)] },   // chest
      { exerciseId: 'bc', sets: [workSet(18, 10)] },                  // bicep
    ] },
    '2026-04-18': { exercises: [
      { exerciseId: 'bc', sets: [workSet(18, 12), workSet(18, 12)] }, // bicep only
    ] },
  };
  const mixed = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20', null);
  // 현재 구현(합집합) 의 "혼합 버그" 를 명시적으로 기록: topKgDelta=62 — 절대 UI에 노출 금지.
  assert.equal(mixed.deltas[0].topKgDelta, 62);
  // 부위별 독립 호출이 올바른 비교: 가슴은 직전 가슴 없어 previous=[], 이두는 18→18 델타 0.
  const chestCmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['chest']);
  assert.equal(chestCmp.previous.length, 0, '가슴은 직전 가슴 세션 없어 previous 비어야 함');
  const bicepCmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['bicep']);
  assert.equal(bicepCmp.previous.length, 1);
  assert.equal(bicepCmp.deltas[0].topKgDelta, 0);
});

test('Fix #3 regression · chest_mid 만 3세션 연속이어도 chest_upper/lower 를 weak 로 감지', () => {
  // 최근 3세션 모두 바벨 벤치(chest_mid) 만. chest_upper, chest_lower 는 0세트.
  // 이전 구현은 combinedEntries.length(=1) >= 2 실패로 imbalance=null 이었다.
  const cache = {
    '2026-04-20': { exercises: [{ exerciseId: 'bp', sets: [workSet(80, 8), workSet(80, 8), workSet(80, 8)] }] },
    '2026-04-17': { exercises: [{ exerciseId: 'bp', sets: [workSet(77.5, 8), workSet(77.5, 8)] }] },
    '2026-04-14': { exercises: [{ exerciseId: 'bp', sets: [workSet(75, 8), workSet(75, 8)] }] },
  };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['chest'], 2);
  assert.ok(cmp.imbalance, 'chest_mid 만 있을 때도 imbalance 가 null 이면 안됨');
  assert.ok(cmp.imbalance.weakSubPatterns.includes('chest_upper'),
    `chest_upper 를 weak 로 감지해야 함 (got ${JSON.stringify(cmp.imbalance.weakSubPatterns)})`);
  assert.ok(cmp.imbalance.weakSubPatterns.includes('chest_lower'),
    'chest_lower 도 weak 로 감지');
  assert.ok(!cmp.imbalance.weakSubPatterns.includes('chest_mid'),
    'chest_mid 는 지배적 subPattern 이므로 weak 에서 제외');
});

test('Fix #3 · 이두 등 단일 subPattern majors 는 imbalance=null (possibleSubs 1개)', () => {
  // 이두는 SUBPATTERN_TO_MAJOR 에서 subPattern 이 'bicep' 하나뿐 → 불균형 개념 자체가 없음.
  const cache = {
    '2026-04-20': { exercises: [{ exerciseId: 'bc', sets: [workSet(20, 12), workSet(20, 12)] }] },
    '2026-04-17': { exercises: [{ exerciseId: 'bc', sets: [workSet(18, 12)] }] },
  };
  const cmp = buildMuscleComparison(cache, EX_LIST, MOVEMENTS, '2026-04-20', ['bicep'], 2);
  assert.equal(cmp.imbalance, null, '단일 subPattern 부위는 imbalance null 이어야 함');
});

// ── 회귀 테스트 · 2026-04-20 리뷰 #2/#3 — 주동근 기준 통일 ──────

// 픽스처에 "보조근까지 muscleIds 에 담긴" 종목 추가 — 벤치/arm_pulldown 모사.
const EX_LIST_WITH_AUX = [
  ...EX_LIST,
  // 벤치프레스: 주동근 chest_mid + 보조근 shoulder_front/tricep
  { id: 'bp_aux',  name: '바벨 벤치 (보조근 포함)',
    movementId: 'barbell_bench',
    muscleIds: ['chest_mid', 'chest_upper', 'chest_lower', 'shoulder_front', 'tricep'] },
  // 암풀다운: 주동근 back_width + 보조근 tricep
  { id: 'arm_pd',  name: '암풀다운',
    movementId: 'arm_pulldown',
    muscleIds: ['back_width', 'tricep'] },
];

test('Fix #2 · 벤치만 한 날 sessionMajor = chest 단독 (shoulder/tricep 제외)', () => {
  // MOVEMENT_MUSCLES_MAP 주석대로 muscleIds[0]=chest_mid 가 주동근. shoulder_front/tricep 은
  // 보조근이므로 "오늘 어깨/삼두 세션" 으로 판정되면 안 됨.
  const day = {
    exercises: [
      { exerciseId: 'bp_aux', sets: [workSet(80, 8), workSet(80, 8), workSet(80, 6)] },
    ],
  };
  const majors = getSessionMajorMuscles(day, EX_LIST_WITH_AUX, MOVEMENTS);
  assert.deepEqual([...majors].sort(), ['chest'],
    `벤치 = chest 단독이어야 함 (got ${JSON.stringify([...majors])})`);
});

test('Fix #2 · 암풀다운만 한 날 sessionMajor = back 단독 (tricep 제외)', () => {
  // arm_pulldown 은 MOVEMENT_MUSCLES_MAP 에 ['back_width','tricep'] 로 매핑되지만
  // 주동근은 back_width 뿐 — 삼두 세션 이력에 오염되면 안 됨.
  const day = {
    exercises: [{ exerciseId: 'arm_pd', sets: [workSet(50, 12), workSet(50, 12)] }],
  };
  const majors = getSessionMajorMuscles(day, EX_LIST_WITH_AUX, MOVEMENTS);
  assert.deepEqual([...majors].sort(), ['back']);
});

test('Fix #2 · 벤치-only 세션은 majors=["tricep"] 검색에 매칭되지 않음', () => {
  // 보조근 매칭 버그가 돌아오면 tricep 검색에 벤치 세션이 잡힌다.
  const cache = {
    '2026-04-18': { exercises: [{ exerciseId: 'bp_aux', sets: [workSet(80, 8)] }] },
  };
  const hits = findRecentSameMuscleSessions(cache, EX_LIST_WITH_AUX, MOVEMENTS,
    '2026-04-20', ['tricep'], 2);
  assert.deepEqual(hits, [],
    '벤치만 한 세션이 tricep 검색에 매칭되면 리뷰 #3 회귀');
});

test('Fix #2 · summarizeMuscleSession(majors=[tricep]) 은 벤치 세트 제외', () => {
  // 오늘 벤치만 했으면 "오늘 tricep 세션" 은 workSets=0 이어야 한다.
  const day = {
    exercises: [{ exerciseId: 'bp_aux', sets: [workSet(80, 8), workSet(80, 8)] }],
  };
  const tri = summarizeMuscleSession(day, EX_LIST_WITH_AUX, MOVEMENTS, ['tricep']);
  assert.equal(tri.workSets, 0);
  assert.equal(tri.exercises.length, 0);
  const chest = summarizeMuscleSession(day, EX_LIST_WITH_AUX, MOVEMENTS, ['chest']);
  assert.equal(chest.workSets, 2);
});
