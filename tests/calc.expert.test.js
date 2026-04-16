// ================================================================
// calc.expert.test.js — 전문가 모드 순수함수 회귀 테스트
// 실행: `node --test tests/calc.expert.test.js` (Node 18+ 내장 test runner)
//       향후 Vitest 도입 시 동일 파일 그대로 재사용 (import 구문 호환)
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimate1RM,
  rpeRepsToPct,
  targetWeightKg,
  roundToIncrement,
  weightRange,
  kgToLb,
  lbToKg,
  getVolumeHistoryByMovement,
  getVolumeHistoryMulti,
  calcBalanceByPattern,
  detectPRs,
  isExerciseDaySuccess,
} from '../calc.js';

// ── estimate1RM ───────────────────────────────────────────────
test('estimate1RM · Epley 공식 기본 케이스', () => {
  // 50kg × 10 reps → 50 × (1 + 10/30) = 66.666...
  assert.ok(Math.abs(estimate1RM(50, 10) - 66.666666) < 0.01);
});
test('estimate1RM · 1rep은 그대로', () => {
  assert.equal(estimate1RM(100, 1), 100);
});
test('estimate1RM · 0 또는 음수 입력은 0', () => {
  assert.equal(estimate1RM(0, 10), 0);
  assert.equal(estimate1RM(50, 0), 0);
  assert.equal(estimate1RM(null, null), 0);
});

// ── rpeRepsToPct / targetWeightKg ─────────────────────────────
test('rpeRepsToPct · RPE8 10reps는 0.68', () => {
  assert.equal(rpeRepsToPct(8, 10), 0.68);   // 룩업표: RPE8 row, 10th column
});
test('rpeRepsToPct · RPE10 1rep는 1.0', () => {
  assert.equal(rpeRepsToPct(10, 1), 1.0);
});
test('rpeRepsToPct · RPE 범위 밖은 클램프', () => {
  // rpe 5 → 6으로 클램프, rpe 11 → 10으로 클램프
  assert.equal(rpeRepsToPct(5, 5), rpeRepsToPct(6, 5));
  assert.equal(rpeRepsToPct(11, 5), rpeRepsToPct(10, 5));
});
test('targetWeightKg · e1RM 66.67 @ RPE8 10reps ≈ 45.3', () => {
  // e1RM 66.67 × 0.68 ≈ 45.34
  const t = targetWeightKg(66.67, 8, 10);
  assert.ok(Math.abs(t - 45.34) < 0.1);
});

// ── roundToIncrement ──────────────────────────────────────────
test('roundToIncrement · 2.5kg 단위', () => {
  assert.equal(roundToIncrement(52.3, 2.5), 52.5);
  assert.equal(roundToIncrement(53.8, 2.5), 55);
  assert.equal(roundToIncrement(50, 2.5), 50);
});
test('roundToIncrement · step 0 이하는 그대로', () => {
  assert.equal(roundToIncrement(52.3, 0), 52.3);
  assert.equal(roundToIncrement(52.3, -1), 52.3);
});

// ── weightRange ───────────────────────────────────────────────
test('weightRange · large class ±2step', () => {
  // target 52.5, step 2.5, large → ±5kg
  const r = weightRange(52.5, 'large', 2.5);
  assert.equal(r.recommended, 52.5);
  assert.equal(r.conservative, 47.5);
  assert.equal(r.aggressive,   57.5);
});
test('weightRange · small class ±1step', () => {
  const r = weightRange(30, 'small', 2.5);
  assert.equal(r.recommended, 30);
  assert.equal(r.conservative, 27.5);
  assert.equal(r.aggressive,   32.5);
});
test('weightRange · conservative 음수 방지', () => {
  const r = weightRange(2, 'large', 2.5);
  assert.ok(r.conservative >= 0);
});

// ── kgToLb / lbToKg 왕복 ───────────────────────────────────────
test('kgToLb · 100kg ≈ 220.46lb', () => {
  assert.ok(Math.abs(kgToLb(100) - 220.462) < 0.01);
});
test('kgToLb/lbToKg 왕복 정확도', () => {
  const kg = 52.5;
  assert.ok(Math.abs(lbToKg(kgToLb(kg)) - kg) < 1e-6);
});

// ── getVolumeHistoryMulti / ByMovement ────────────────────────
const _sampleCache = {
  '2026-04-01': {
    exercises: [
      { exerciseId: 'ex1', sets: [{kg:50, reps:10, done:true}] }, // 500
    ],
  },
  '2026-04-02': {
    exercises: [
      { exerciseId: 'ex1', sets: [{kg:52.5, reps:10, done:true}] }, // 525
      { exerciseId: 'ex2', sets: [{kg:30, reps:12, done:true}] },   // 360
    ],
  },
  '_non_date_key': { exercises: [] },  // 필터링 확인
};
const _sampleExList = [
  { id: 'ex1', name: '랫풀다운',  movementId: 'lat_pulldown' },
  { id: 'ex2', name: '암풀다운',  movementId: 'arm_pulldown' },
];

test('getVolumeHistoryMulti · 복수 ID 합산', () => {
  const h = getVolumeHistoryMulti(_sampleCache, ['ex1', 'ex2']);
  assert.equal(h.length, 2);
  assert.equal(h[0].date, '2026-04-01');
  assert.equal(h[0].volume, 500);
  assert.equal(h[1].date, '2026-04-02');
  assert.equal(h[1].volume, 525 + 360);
});
test('getVolumeHistoryByMovement · movementId로 집계', () => {
  const h = getVolumeHistoryByMovement(_sampleCache, _sampleExList, 'lat_pulldown');
  assert.equal(h.length, 2);
  assert.equal(h[1].volume, 525);  // ex1만 집계, ex2 제외
});
test('getVolumeHistoryByMovement · 알 수 없는 movementId는 빈 배열', () => {
  const h = getVolumeHistoryByMovement(_sampleCache, _sampleExList, 'unknown_move');
  assert.deepEqual(h, []);
});

// ── calcBalanceByPattern ─────────────────────────────────────
const _sampleMovements = [
  { id: 'lat_pulldown', subPattern: 'back_width' },
  { id: 'arm_pulldown', subPattern: 'back_width' },
  { id: 'barbell_row',  subPattern: 'back_thickness' },
];
test('calcBalanceByPattern · subPattern별 작업세트 합산', () => {
  const cache = {
    '2026-04-01': {
      exercises: [
        { exerciseId: 'ex1', sets: [
          { setType:'warmup', kg:30, reps:12, done:true },  // 제외 (warmup)
          { kg:50, reps:10, done:true },
          { kg:52.5, reps:10, done:true },
        ]},
        { exerciseId: 'ex3', sets: [
          { kg:60, reps:8, done:true },
        ]},
      ],
    },
  };
  const exList = [
    { id:'ex1', movementId:'lat_pulldown' },
    { id:'ex3', movementId:'barbell_row' },
  ];
  const bal = calcBalanceByPattern(cache, exList, _sampleMovements);
  assert.equal(bal.back_width, 2);      // lat_pulldown 2세트 (warmup 제외)
  assert.equal(bal.back_thickness, 1);
});

// ── detectPRs ─────────────────────────────────────────────────
test('detectPRs · PR 무게/날짜 탐지 + progressKg', () => {
  const cache = {
    '2026-04-01': { exercises: [{ exerciseId:'ex1', sets:[{kg:50, reps:10, done:true}] }] },
    '2026-04-08': { exercises: [{ exerciseId:'ex1', sets:[{kg:52.5, reps:10, done:true}] }] },
    '2026-04-15': { exercises: [{ exerciseId:'ex1', sets:[{kg:55, reps:8, done:true}] }] },
  };
  const pr = detectPRs(cache, 'ex1');
  assert.equal(pr.prKg, 55);
  assert.equal(pr.prReps, 8);
  assert.equal(pr.prDate, '2026-04-15');
  assert.equal(pr.lastKg, 55);
  assert.equal(pr.lastDate, '2026-04-15');
  assert.equal(pr.progressKg, 2.5);
});
test('detectPRs · 빈 캐시', () => {
  const pr = detectPRs({}, 'ex1');
  assert.equal(pr.prKg, 0);
  assert.equal(pr.lastDate, null);
});
test('detectPRs · 워밍업만 있으면 무시', () => {
  const cache = {
    '2026-04-01': { exercises: [{ exerciseId:'ex1', sets:[{setType:'warmup', kg:30, reps:12, done:true}] }] },
  };
  const pr = detectPRs(cache, 'ex1');
  assert.equal(pr.prKg, 0);
});

// ── isExerciseDaySuccess (P0-1a) ──────────────────────────────
test('isExerciseDaySuccess · AI 루틴만 로드(kg:0,reps:10,done:false)는 실패', () => {
  const day = {
    exercises: [
      { exerciseId: 'ex1', sets: [
        { kg: 0, reps: 10, done: false },
        { kg: 0, reps: 10, done: false },
      ]},
    ],
  };
  assert.equal(isExerciseDaySuccess(day), false);
});
test('isExerciseDaySuccess · done:true 세트 1개 있으면 성공', () => {
  const day = {
    exercises: [
      { exerciseId: 'ex1', sets: [
        { kg: 0, reps: 10, done: false },
        { kg: 50, reps: 10, done: true },
      ]},
    ],
  };
  assert.equal(isExerciseDaySuccess(day), true);
});
test('isExerciseDaySuccess · 레거시 데이터(done 없고 kg/reps만)는 성공', () => {
  const day = {
    exercises: [
      { exerciseId: 'ex1', sets: [{ kg: 50, reps: 10 }] },
    ],
  };
  assert.equal(isExerciseDaySuccess(day), true);
});
test('isExerciseDaySuccess · 빈 exercises는 실패', () => {
  assert.equal(isExerciseDaySuccess({ exercises: [] }), false);
  assert.equal(isExerciseDaySuccess({}), false);
});
test('isExerciseDaySuccess · cf/swimming/running/stretching은 boolean이면 성공', () => {
  assert.equal(isExerciseDaySuccess({ cf: true }), true);
  assert.equal(isExerciseDaySuccess({ swimming: true }), true);
  assert.equal(isExerciseDaySuccess({ running: true }), true);
  assert.equal(isExerciseDaySuccess({ stretching: true }), true);
});
test('isExerciseDaySuccess · reps만 있고 kg:0이면 실패 (AI 루틴 차단)', () => {
  const day = {
    exercises: [
      { exerciseId: 'ex1', sets: [{ kg: 0, reps: 10, done: false }] },
    ],
  };
  assert.equal(isExerciseDaySuccess(day), false);
});
