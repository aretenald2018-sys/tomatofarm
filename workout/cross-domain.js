// ================================================================
// workout/cross-domain.js
//   도메인 경계를 넘나드는 파생 함수 — 양 도메인 상태를 **명시적으로 입력** 받아 계산.
//
// 배경:
//   과거엔 save.js 에 _autoDeriveActivityFlags / _computeDietSuccess 가 숨어 있어
//   "운동 저장이 식단 ok 를 바꾼다" 같은 암묵적 교차 의존이 발생. 이제 네임스페이스
//   분할(S.workout / S.diet / S.shared)과 함께 이 파생들을 독립 모듈에 모아
//   "워크아웃 → 식단 파생", "세부입력 → 활동 flag 파생" 경로를 명시화한다.
//
// 순수 함수 원칙:
//   - 전역 S 에 의존하지 않음. 호출부가 workout/diet/date 를 명시적으로 전달.
//   - cleanEx 처럼 호출부에서 준비해 건네는 값도 인자.
//   - 반환값만 사용. 부수 효과로 state 를 변이시키지 않음.
// ================================================================

import { getDietPlan, getDayTargetKcal, isDietDaySuccess } from '../data.js';

/**
 * 세부 입력(cfData/runData/swimData/stretchData) 존재 여부로 활동 boolean flag 파생.
 * "30분 조깅" 만 메모에 남긴 케이스도 기록 있음으로 판정되도록 메모 trim 도 신호에 포함.
 * 반환: { cf, running, swimming, stretching } — 호출부가 S.workout 에 대입.
 */
export function deriveActivityFlagsFromDetails(workout) {
  const _m = (v) => !!(v && String(v).trim());
  const cfData      = workout?.cfData      || {};
  const runData     = workout?.runData     || {};
  const swimData    = workout?.swimData    || {};
  const stretchData = workout?.stretchData || {};
  return {
    cf:         !!(cfData.wod || cfData.durationMin || cfData.durationSec || _m(cfData.memo)),
    running:    !!(runData.distance || runData.durationMin || runData.durationSec || _m(runData.memo)),
    swimming:   !!(swimData.distance || swimData.durationMin || swimData.durationSec || _m(swimData.memo)),
    stretching: !!(stretchData.duration || _m(stretchData.memo)),
  };
}

/**
 * 운동/식단 상태 + 해당일 기반으로 "식단 성공 여부(boolean)" 파생.
 * 운동(cardio/CF/swim)이 dayTarget 을 끌어올리므로 운동 저장 경로에서도 식단 ok 재계산.
 * 반환: true/false/null (diet plan 미설정 등 판단 불가).
 *
 * @param {object} workout  - S.workout 스냅샷
 * @param {object} diet     - S.diet 스냅샷
 * @param {{y:number,m:number,d:number}} date - 해당일
 * @param {Array}  cleanEx  - _cleanExercises() 결과
 */
export function deriveDietSuccessFromWorkout(workout, diet, date, cleanEx) {
  if (!date) return null;
  const plan = getDietPlan();
  const { y, m, d } = date;
  const dayData = {
    exercises: cleanEx,
    cf: !!workout?.cf,
    swimming: !!workout?.swimming,
    running: !!workout?.running,
  };
  const dayTarget = getDayTargetKcal(plan, y, m, d, dayData);
  const totalKcal = (diet?.bKcal||0) + (diet?.lKcal||0) + (diet?.dKcal||0) + (diet?.sKcal||0);
  const tol = plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;
  return isDietDaySuccess(totalKcal, dayTarget, tol);
}
