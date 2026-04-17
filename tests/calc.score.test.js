// ================================================================
// calc.score.test.js — calcBurnedKcal / calcDayScore 회귀 테스트
// 실행: `node --test tests/calc.score.test.js` (Node 18+ 내장 test runner)
// ================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcBurnedKcal, calcDayScore } from '../calc.js';

// ══════════════════════════════════════════════════════════════
// calcBurnedKcal
// ══════════════════════════════════════════════════════════════

describe('calcBurnedKcal', () => {

  test('빈 day → total 0, 모든 항목 0', () => {
    const r = calcBurnedKcal({}, 70);
    assert.equal(r.total, 0);
    assert.equal(r.gym, 0);
    assert.equal(r.running, 0);
    assert.equal(r.swimming, 0);
    assert.equal(r.cf, 0);
  });

  test('day=null → total 0 (방어적 처리)', () => {
    const r = calcBurnedKcal(null, 70);
    assert.equal(r.total, 0);
  });

  test('weightKg 미지정(undefined) → 70kg 기본 적용', () => {
    // chest 1세트 완료: MET 6 × 70 × (2/60) = 14
    const day = {
      exercises: [
        { muscleId: 'chest', sets: [{ done: true }] },
      ],
    };
    const withDefault = calcBurnedKcal(day, undefined);
    const withExplicit = calcBurnedKcal(day, 70);
    assert.equal(withDefault.gym, withExplicit.gym);
  });

  test('weightKg=0 → 70kg 기본 적용', () => {
    const day = {
      exercises: [{ muscleId: 'chest', sets: [{ done: true }] }],
    };
    const r = calcBurnedKcal(day, 0);
    // MET 6 × 70 × (2/60) ≈ 14
    assert.equal(r.gym, 14);
  });

  test('70kg, chest 1세트 완료 → gym ≈ 14 kcal (MET 6 × 70 × 2/60)', () => {
    const day = {
      exercises: [
        { muscleId: 'chest', sets: [{ done: true }] },
      ],
    };
    const r = calcBurnedKcal(day, 70);
    // 6.0 × 70 × (2/60) = 14.0
    assert.equal(r.gym, 14);
    assert.equal(r.total, 14);
  });

  test('70kg, lower 5세트 완료 → gym ≈ 82 kcal (MET 7 × 70 × 2/60 × 5)', () => {
    const day = {
      exercises: [
        { muscleId: 'lower', sets: [
          { done: true }, { done: true }, { done: true }, { done: true }, { done: true },
        ]},
      ],
    };
    const r = calcBurnedKcal(day, 70);
    // 7.0 × 70 × (2/60) × 5 = 81.666... → Math.round = 82
    assert.equal(r.gym, 82);
  });

  test('미완료 세트(done:false)는 근력 칼로리에서 제외', () => {
    const dayAllDone = {
      exercises: [{ muscleId: 'chest', sets: [{ done: true }, { done: true }] }],
    };
    const dayPartial = {
      exercises: [{ muscleId: 'chest', sets: [{ done: true }, { done: false }] }],
    };
    const dayNone = {
      exercises: [{ muscleId: 'chest', sets: [{ done: false }, { done: false }] }],
    };
    const all = calcBurnedKcal(dayAllDone, 70).gym;   // 28
    const half = calcBurnedKcal(dayPartial, 70).gym;  // 14
    const none = calcBurnedKcal(dayNone, 70).gym;     // 0
    assert.equal(all, 28);
    assert.equal(half, 14);
    assert.equal(none, 0);
  });

  test('gym_skip:true이면 근력 칼로리 0', () => {
    const day = {
      gym_skip: true,
      exercises: [{ muscleId: 'chest', sets: [{ done: true }, { done: true }] }],
    };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.gym, 0);
  });

  test('운동 종목에 muscleId 없으면 근력 집계 제외', () => {
    const day = {
      exercises: [
        { muscleId: undefined, sets: [{ done: true }] },
        { muscleId: 'unknown_muscle', sets: [{ done: true }] },
      ],
    };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.gym, 0);
  });

  test('running: 5km/30분 → 속도 10km/h → MET 9.8 → ≈ 343 kcal', () => {
    // speed = 5 / (30/60) = 10.0 km/h
    // _runMET: speedKmh <= 10.5 → 9.8 (Ainsworth 2011: 10km/h 근처는 9.8 MET)
    // kcal = 9.8 × 70 × (30/60) = 343.0
    const day = {
      running: true,
      runDistance: 5,
      runDurationMin: 30,
      runDurationSec: 0,
    };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 343);
  });

  test('running: 4.9km/30분 → 속도 9.8km/h → MET 9.8 → ≈ 343 kcal', () => {
    // speed = 4.9 / (30/60) = 9.8 km/h → _runMET: 8 <= speed <= 10.5 → 9.8
    // kcal = 9.8 × 70 × 0.5 = 343.0
    const day = {
      running: true,
      runDistance: 4.9,
      runDurationMin: 30,
      runDurationSec: 0,
    };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 343);
  });

  test('running: 5.25km/30분 → 속도 10.5km/h 경계 → MET 9.8 → 343 kcal', () => {
    // speed = 5.25 / 0.5 = 10.5 → _runMET: <= 10.5 → 9.8
    const day = { running: true, runDistance: 5.25, runDurationMin: 30, runDurationSec: 0 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 343);
  });

  test('running: 6km/30분 → 속도 12km/h → MET 11.0 → 385 kcal', () => {
    // speed = 6 / 0.5 = 12 → _runMET: > 10.5 → 11.0
    // kcal = 11.0 × 70 × 0.5 = 385
    const day = { running: true, runDistance: 6, runDurationMin: 30, runDurationSec: 0 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 385);
  });

  test('running: 시간 미기록 → 기본 MET 8, 30분 → 8 × 70 × 0.5 = 280', () => {
    const day = { running: true };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 280);
  });

  test('running: 거리 있지만 시간 0 → 기본 30분 처리', () => {
    // runDurationMin=0, runDurationSec=0 → min=0 → 시간 미기록 분기
    const day = { running: true, runDistance: 5, runDurationMin: 0, runDurationSec: 0 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 280);
  });

  test('running_skip:true이면 running 칼로리 0', () => {
    const day = { running: true, running_skip: true, runDurationMin: 30, runDistance: 5 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.running, 0);
  });

  test('cf=true, workoutDuration=1800(30분) → MET 8 × 70 × 0.5 = 280', () => {
    const day = { cf: true, workoutDuration: 1800 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.cf, 280);
  });

  test('cf=true, workoutDuration 없음 → 기본 30분 → 280', () => {
    const day = { cf: true };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.cf, 280);
  });

  test('cf_skip:true이면 cf 칼로리 0', () => {
    const day = { cf: true, cf_skip: true, workoutDuration: 1800 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.cf, 0);
  });

  test('수영 30분 기본 → MET 6 × 70 × 0.5 = 210', () => {
    const day = { swimming: true };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.swimming, 210);
  });

  test('수영 workoutDuration=3600(1시간) → MET 6 × 70 × 1 = 420', () => {
    const day = { swimming: true, workoutDuration: 3600 };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.swimming, 420);
  });

  test('복합 운동: 근력 + 런닝 → total = gym + running', () => {
    const day = {
      exercises: [{ muscleId: 'chest', sets: [{ done: true }] }],
      running: true,
      runDurationMin: 30,
      runDistance: 5,
    };
    const r = calcBurnedKcal(day, 70);
    // gym: 6 × 70 × (2/60) = 14
    // running: 속도 10km/h → MET 9.8 → 9.8 × 70 × 0.5 = 343
    assert.equal(r.gym, 14);
    assert.equal(r.running, 343);
    assert.equal(r.total, 357);
  });

  test('반환값은 항상 정수 (Math.round 적용)', () => {
    // back 3세트: 6.5 × 70 × (2/60) × 3 = 45.5 → round → 46
    const day = {
      exercises: [{ muscleId: 'back', sets: [{ done: true }, { done: true }, { done: true }] }],
    };
    const r = calcBurnedKcal(day, 70);
    assert.equal(r.gym % 1, 0);   // 정수
    assert.equal(r.total % 1, 0); // 정수
  });

  test('80kg 체중 → chest 1세트: MET 6 × 80 × (2/60) = 16', () => {
    const day = { exercises: [{ muscleId: 'chest', sets: [{ done: true }] }] };
    const r = calcBurnedKcal(day, 80);
    assert.equal(r.gym, 16);
  });

});

// ══════════════════════════════════════════════════════════════
// calcDayScore (재설계: 최저 70점 하한, 감점 max 30)
// 배점: 칼로리 12 · 탄단지 5 · 운동 8 · 체중 3 · 완결 2
// ══════════════════════════════════════════════════════════════

describe('calcDayScore', () => {

  test('ctx=null → hasData:false, score:null, band:none', () => {
    const r = calcDayScore(null);
    assert.equal(r.hasData, false);
    assert.equal(r.score, null);
    assert.equal(r.band, 'none');
    assert.equal(r.breakdown, null);
  });

  test('빈 day → hasData:false', () => {
    const r = calcDayScore({ day: {} });
    assert.equal(r.hasData, false);
  });

  test('모든 조건 완벽 → 100점 great', () => {
    const day = {
      bKcal: 500, lKcal: 700, dKcal: 600, sKcal: 200,
      bProtein: 40, lProtein: 50, dProtein: 50, sProtein: 10,
      bCarbs: 60, lCarbs: 80, dCarbs: 70, sCarbs: 20,
      bFat: 15, lFat: 20, dFat: 15, sFat: 5,
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDeltaKg: -0.5, weightDirSign: -1,
    });
    assert.equal(r.score, 100);
    assert.equal(r.band, 'great');
  });

  // 칼로리 4단계
  test('칼로리 ±10% 이내 → 감점 0', () => {
    const day = { bKcal: 1100, lKcal: 800, dKcal: 200 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.kcal.penalty, 0);
  });

  test('칼로리 10~20% 이탈 → 감점 3', () => {
    const day = { bKcal: 800, lKcal: 900, dKcal: 700 }; // 2400 (20%)
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.kcal.penalty, 3);
  });

  test('칼로리 20~40% 이탈 → 감점 7', () => {
    const day = { bKcal: 1000, lKcal: 900, dKcal: 700 }; // 2600 (30%)
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.kcal.penalty, 7);
  });

  test('칼로리 40% 초과 → 감점 12', () => {
    const day = { bKcal: 1500, lKcal: 1500, dKcal: 500 }; // 3500 (75%)
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.kcal.penalty, 12);
  });

  // 탄단지 — 상한 초과만 감점 (목표 이하 = 만점)
  test('모든 매크로 목표 100% → 감점 0', () => {
    const day = {
      bKcal: 700, lKcal: 700, dKcal: 600,
      bProtein: 150, bCarbs: 230, bFat: 55,
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 0);
  });

  test('매크로 전부 부족 (목표 이하) → 감점 0', () => {
    const day = {
      bKcal: 400, lKcal: 400, dKcal: 400,
      bProtein: 30, bCarbs: 60, bFat: 15,
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 0);
  });

  test('단백질 140% (약한 초과) → 감점 2 (1+가중1)', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, bProtein: 210, bCarbs: 230, bFat: 55 };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 2);
  });

  test('단백질 200% (극단 초과) → 감점 3', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, bProtein: 300, bCarbs: 230, bFat: 55 };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 3);
  });

  test('탄수 150% (약한 초과) → 감점 1', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, bProtein: 150, bCarbs: 345, bFat: 55 };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 1);
  });

  test('지방 200% (극단 초과) → 감점 2', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, bProtein: 150, bCarbs: 230, bFat: 110 };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 2);
  });

  test('매크로 전부 극단 초과 → 감점 clamp 5', () => {
    const day = {
      bKcal: 700, lKcal: 700, dKcal: 600,
      bProtein: 400, bCarbs: 700, bFat: 150, // 단백 267%, 탄수 304%, 지방 273%
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDirSign: -1,
    });
    assert.equal(r.breakdown.macro.penalty, 5); // 3+2+2=7 → clamp 5
  });

  // 운동
  test('운동 전무 → 감점 8', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 0, weightDirSign: -1 });
    assert.equal(r.breakdown.workout.penalty, 8);
  });

  test('의도적 휴식(gym_skip) → 감점 2', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, gym_skip: true };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 0, weightDirSign: -1 });
    assert.equal(r.breakdown.workout.penalty, 2);
  });

  test('운동 50 미만(기록有) → 감점 6', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, exercises: [{ sets: [] }] };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 30, weightDirSign: -1 });
    assert.equal(r.breakdown.workout.penalty, 6);
  });

  test('운동 50~150 → 감점 5', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, exercises: [{ sets: [] }] };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 100, weightDirSign: -1 });
    assert.equal(r.breakdown.workout.penalty, 5);
  });

  test('운동 150~300 → 감점 2', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, exercises: [{ sets: [] }] };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 200, weightDirSign: -1 });
    assert.equal(r.breakdown.workout.penalty, 2);
  });

  test('운동 300+ → 감점 0', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600, exercises: [{ sets: [] }] };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 350, weightDirSign: -1 });
    assert.equal(r.breakdown.workout.penalty, 0);
  });

  // 체중
  test('체중 미기록 → 감점 1', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDeltaKg: null, weightDirSign: -1 });
    assert.equal(r.breakdown.weight.penalty, 1);
  });

  test('체중 역주행 → 감점 3', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDeltaKg: 1.0, weightDirSign: -1 });
    assert.equal(r.breakdown.weight.penalty, 3);
  });

  test('체중 유지(±0.3) → 감점 0', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDeltaKg: 0.2, weightDirSign: -1 });
    assert.equal(r.breakdown.weight.penalty, 0);
  });

  test('유지 목표 dirSign=0, ±0.5 초과 → 감점 2', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDeltaKg: 1.0, weightDirSign: 0 });
    assert.equal(r.breakdown.weight.penalty, 2);
  });

  // 완결성
  test('3끼 모두 기록 → 감점 0', () => {
    const day = { bKcal: 500, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 1800, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.complete.penalty, 0);
  });

  test('1끼 누락 → 감점 1', () => {
    const day = { bKcal: 500, lKcal: 700 };
    const r = calcDayScore({ day, targetKcal: 1200, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.complete.penalty, 1);
  });

  test('2끼 이상 누락 → 감점 2 clamp', () => {
    const day = { bKcal: 500 };
    const r = calcDayScore({ day, targetKcal: 500, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.complete.penalty, 2);
  });

  test('skipped 플래그는 기록으로 간주', () => {
    const day = { bKcal: 500, lKcal: 700, dinner_skipped: true };
    const r = calcDayScore({ day, targetKcal: 1200, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.complete.penalty, 0);
  });

  // 하한 70 clamp
  test('최악 시나리오 → 최저 70점 clamp', () => {
    const day = {
      bKcal: 5000,
      bProtein: 400, bCarbs: 800, bFat: 200, // 단백/탄수/지방 모두 극단 초과
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 0,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDeltaKg: 1.0, weightDirSign: -1,
    });
    assert.equal(r.score, 70);
    assert.equal(r.band, 'bad');
  });

  test('score 항상 70~100 범위', () => {
    const cases = [
      { day: { bKcal: 100000 }, targetKcal: 2000, burnedKcal: 0 },
      { day: { bKcal: 2000 }, targetKcal: 2000, burnedKcal: 500 },
    ];
    for (const c of cases) {
      const r = calcDayScore({ ...c, weightDirSign: -1 });
      if (r.score != null) {
        assert.ok(r.score >= 70, `score ${r.score} < 70`);
        assert.ok(r.score <= 100, `score ${r.score} > 100`);
      }
    }
  });

  // band 경계
  test('band 경계 — score=95 → great', () => {
    // 감점 5 = 매크로 2 (단백 140% 약한 초과) + 체중 3 (역주행)
    const day = {
      bKcal: 700, lKcal: 700, dKcal: 600,
      bProtein: 210, bCarbs: 230, bFat: 55, // 단백 140%, 탄/지 100%
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDeltaKg: 1.0, weightDirSign: -1,
    });
    assert.equal(r.score, 95);
    assert.equal(r.band, 'great');
  });

  test('band 경계 — score=90 → good', () => {
    // 감점 10 = 칼로리 7 (30%↑) + 매크로 2 (탄수 150%+지방 140% 각 1) + 체중 1 (미기록)
    const day = {
      bKcal: 1000, lKcal: 900, dKcal: 700,
      bProtein: 150, bCarbs: 345, bFat: 77, // 탄수 150%, 지방 140%
    };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 300,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDeltaKg: null, weightDirSign: -1,
    });
    assert.equal(r.score, 90);
    assert.equal(r.band, 'good');
  });

  test('band 경계 — score<80 → bad (최저 70)', () => {
    const day = { bKcal: 5000, bProtein: 0 };
    const r = calcDayScore({
      day, targetKcal: 2000, burnedKcal: 0,
      macroTarget: { proteinG: 150, carbG: 230, fatG: 55 },
      weightDeltaKg: 1.0, weightDirSign: -1,
    });
    assert.ok(r.score < 80);
    assert.equal(r.band, 'bad');
  });

  // breakdown 구조
  test('breakdown.max 값 (12/5/8/3/2)', () => {
    const day = { bKcal: 700, lKcal: 700, dKcal: 600 };
    const r = calcDayScore({ day, targetKcal: 2000, burnedKcal: 300, weightDirSign: -1 });
    assert.equal(r.breakdown.kcal.max, 12);
    assert.equal(r.breakdown.macro.max, 5);
    assert.equal(r.breakdown.workout.max, 8);
    assert.equal(r.breakdown.weight.max, 3);
    assert.equal(r.breakdown.complete.max, 2);
  });

  // hasData 판정
  test('cf만 있어도 hasData:true', () => {
    const r = calcDayScore({ day: { cf: true }, burnedKcal: 280 });
    assert.equal(r.hasData, true);
  });

  test('running만 있어도 hasData:true', () => {
    const r = calcDayScore({ day: { running: true }, burnedKcal: 280 });
    assert.equal(r.hasData, true);
  });

  test('exercises만 있어도 hasData:true', () => {
    const r = calcDayScore({ day: { exercises: [{ sets: [] }] }, burnedKcal: 50 });
    assert.equal(r.hasData, true);
  });

});

