// ================================================================
// workout/save.js — 저장 로직 (saveWorkoutDay + _autoSaveDiet)
// ================================================================

import { S }                        from './state.js';
import { showCenterToast }          from '../home/utils.js';
import { saveDay, dateKey, isFuture,
         getDietPlan, getDayTargetKcal,
         isDietDaySuccess, trackEvent } from '../data.js';

// 미래 날짜 저장 가드 — 어떤 경로로든 미래 날짜 쓰기 금지 (B-3).
// - UI disable을 우회하는 onclick/자동저장/스크립트 호출을 한 번 더 차단.
// - 저장 함수에서 S.date가 미래면 true 반환 → 호출자는 조기 리턴.
function _blockIfFutureDate() {
  if (!S.date) return false;
  if (!isFuture(S.date.y, S.date.m, S.date.d)) return false;
  // 사용자에게 사유 알림 (토스트 1회면 충분)
  try { window.showToast?.('미래 날짜는 저장할 수 없어요', 1800, 'warning'); } catch {}
  return true;
}

// ── per-meal 기록 유무 판정 헬퍼 ────────────────────────────────
// 텍스트/food-chip/kcal 중 하나라도 있으면 기록 있음으로 판정
function _hasMealRecord(textVal, foodsArr, kcalVal, skipFlag) {
  if (skipFlag) return true;
  if (textVal && String(textVal).trim()) return true;
  if (Array.isArray(foodsArr) && foodsArr.length > 0) return true;
  if ((kcalVal || 0) > 0) return true;
  return false;
}

// ── 공통 저장 페이로드 빌더 ──────────────────────────────────────
// saveWorkoutDay()와 _autoSaveDiet() 양쪽에서 호출하여 필드 누락 방지
function _buildSavePayload(cleanEx, isDietSuccess) {
  return {
    exercises:  cleanEx,
    cf:         S.cf,
    stretching: S.stretching,
    swimming:   S.swimming,
    running:    S.running,
    runDistance:    S.runData.distance,
    runDurationMin: S.runData.durationMin,
    runDurationSec: S.runData.durationSec,
    runMemo:       S.runData.memo,
    cfWod:         S.cfData.wod,
    cfDurationMin: S.cfData.durationMin,
    cfDurationSec: S.cfData.durationSec,
    cfMemo:        S.cfData.memo,
    stretchDuration: S.stretchData.duration,
    stretchMemo:   S.stretchData.memo,
    swimDistance:   S.swimData.distance,
    swimDurationMin: S.swimData.durationMin,
    swimDurationSec: S.swimData.durationSec,
    swimStroke:    S.swimData.stroke,
    swimMemo:      S.swimData.memo,
    workoutDuration: S.workoutStartTime
      ? S.workoutDuration + Math.floor((Date.now() - S.workoutStartTime) / 1000)
      : S.workoutDuration,
    wine_free:  S.wineFree,
    breakfast_skipped: S.breakfastSkipped,
    lunch_skipped: S.lunchSkipped,
    dinner_skipped: S.dinnerSkipped,
    memo:       document.getElementById('wt-workout-memo')?.value.trim() || '',
    breakfast:  S.diet.breakfast,
    lunch:      S.diet.lunch,
    dinner:     S.diet.dinner,
    snack:      S.diet.snack,
    // per-meal 성공 판정: 기록 있으면 day-level 성공 여부, skip이면 true, 기록 없으면 null
    bOk: _hasMealRecord(S.diet.breakfast, S.diet.bFoods, S.diet.bKcal, S.breakfastSkipped)
           ? (S.breakfastSkipped ? true : isDietSuccess) : null,
    lOk: _hasMealRecord(S.diet.lunch,     S.diet.lFoods, S.diet.lKcal, S.lunchSkipped)
           ? (S.lunchSkipped     ? true : isDietSuccess) : null,
    dOk: _hasMealRecord(S.diet.dinner,    S.diet.dFoods, S.diet.dKcal, S.dinnerSkipped)
           ? (S.dinnerSkipped    ? true : isDietSuccess) : null,
    sOk: _hasMealRecord(S.diet.snack,     S.diet.sFoods, S.diet.sKcal, false)
           ? isDietSuccess : null,
    bKcal:S.diet.bKcal, lKcal:S.diet.lKcal, dKcal:S.diet.dKcal, sKcal:S.diet.sKcal,
    bReason:S.diet.bReason, lReason:S.diet.lReason, dReason:S.diet.dReason, sReason:S.diet.sReason,
    bProtein:S.diet.bProtein, bCarbs:S.diet.bCarbs, bFat:S.diet.bFat,
    lProtein:S.diet.lProtein, lCarbs:S.diet.lCarbs, lFat:S.diet.lFat,
    dProtein:S.diet.dProtein, dCarbs:S.diet.dCarbs, dFat:S.diet.dFat,
    sProtein:S.diet.sProtein, sCarbs:S.diet.sCarbs, sFat:S.diet.sFat,
    bFoods:S.diet.bFoods||[], lFoods:S.diet.lFoods||[], dFoods:S.diet.dFoods||[], sFoods:S.diet.sFoods||[],
    // 사진 데이터 보존 (누락 시 setDoc 전체 덮어쓰기로 사진 삭제됨)
    bPhoto: window._mealPhotos?.breakfast || null,
    lPhoto: window._mealPhotos?.lunch || null,
    dPhoto: window._mealPhotos?.dinner || null,
    sPhoto: window._mealPhotos?.snack || null,
    workoutPhoto: window._mealPhotos?.workout || null,
    // AI 추정 메타 (plateType/confidence/priorApplied/portionApplied/createdAt)
    // 누락 시 전체 덮어쓰기로 메타 사라짐 → 반드시 포함.
    bEstimateMeta: S.diet.bEstimateMeta || null,
    lEstimateMeta: S.diet.lEstimateMeta || null,
    dEstimateMeta: S.diet.dEstimateMeta || null,
    sEstimateMeta: S.diet.sEstimateMeta || null,
    // 전문가 모드
    gymId: S.currentGymId || null,
    routineMeta: S.routineMeta || null,
  };
}

// 각 활동 탭의 입력 데이터 유무로 boolean 플래그 자동 판정.
// (랜딩 '쉬었어요/건강이슈' 제거 후 — 기록이 있으면 했다는 의미.)
// 메모도 의도적 기록 신호로 포함 — "30분 조깅"만 메모에 남긴 케이스가 기록 없음으로
// 처리되던 회귀를 막음. 공백만 있는 경우는 제외.
function _autoDeriveActivityFlags() {
  const _m = (v) => !!(v && String(v).trim());
  S.cf         = !!(S.cfData?.wod || S.cfData?.durationMin || S.cfData?.durationSec || _m(S.cfData?.memo));
  S.running    = !!(S.runData?.distance || S.runData?.durationMin || S.runData?.durationSec || _m(S.runData?.memo));
  S.swimming   = !!(S.swimData?.distance || S.swimData?.durationMin || S.swimData?.durationSec || _m(S.swimData?.memo));
  S.stretching = !!(S.stretchData?.duration || _m(S.stretchData?.memo));
}

// 탭 칩의 기록 힌트(has-record) 즉시 동기화 — 저장/상태 변경 후 호출.
function _refreshTabDots() {
  const flags = {
    gym: (S.exercises || []).length > 0,
    cf: !!S.cf,
    stretch: !!S.stretching,
    swimming: !!S.swimming,
    running: !!S.running,
  };
  Object.entries(flags).forEach(([t, on]) => {
    document.getElementById('wt-chip-' + t)?.classList.toggle('has-record', !!on);
  });
}

function _cleanExercises(includeNotes) {
  return S.exercises
    .map(e => ({
      ...e,
      // done=true 체크된 세트는 kg/reps가 0이어도 보존.
      // 체중 맨몸/무중량 운동 또는 기록 누락 케이스에서 streak 손실 방지.
      sets: e.sets.filter(s => s && (s.done === true || (s.kg || 0) > 0 || (s.reps || 0) > 0)),
    }))
    .filter(e => e.sets.length > 0 || (includeNotes && e.note));
}

function _computeDietSuccess(cleanEx) {
  const plan = getDietPlan();
  const { y, m, d } = S.date;
  const dayData = {
    exercises: cleanEx,
    cf: S.cf,
    swimming: S.swimming,
    running: S.running,
  };
  const dayTarget = getDayTargetKcal(plan, y, m, d, dayData);
  const totalKcal = (S.diet.bKcal||0) + (S.diet.lKcal||0) + (S.diet.dKcal||0) + (S.diet.sKcal||0);
  const tol = plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;
  return isDietDaySuccess(totalKcal, dayTarget, tol);
}

// ── 명시적 저장 ──────────────────────────────────────────────────
export async function saveWorkoutDay() {
  if (!S.date) return;
  if (_blockIfFutureDate()) return;
  const { y, m, d } = S.date;

  S.diet.breakfast = document.getElementById('wt-meal-breakfast')?.value.trim() || '';
  S.diet.lunch     = document.getElementById('wt-meal-lunch')?.value.trim() || '';
  S.diet.dinner    = document.getElementById('wt-meal-dinner')?.value.trim() || '';
  S.diet.snack     = document.getElementById('wt-meal-snack')?.value.trim() || '';

  // 런닝 폼에서 최신값 읽기
  S.runData.distance    = parseFloat(document.getElementById('wt-run-distance')?.value) || 0;
  S.runData.durationMin = parseInt(document.getElementById('wt-run-duration-min')?.value) || 0;
  S.runData.durationSec = parseInt(document.getElementById('wt-run-duration-sec')?.value) || 0;
  S.runData.memo        = document.getElementById('wt-run-memo')?.value.trim() || '';

  _autoDeriveActivityFlags();

  const cleanEx = _cleanExercises(false);
  const isDietSuccess = _computeDietSuccess(cleanEx);

  const btn = document.getElementById('wt-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  const payload = _buildSavePayload(cleanEx, isDietSuccess);
  await saveDay(dateKey(y, m, d), payload);

  // analytics 계측
  if (cleanEx.length > 0 || S.cf || S.swimming || S.running) {
    trackEvent('core', 'exercise_logged');
  }

  if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  _refreshTabDots();
  document.dispatchEvent(new CustomEvent('sheet:saved'));

  // 사용자 피드백: TDS Toast (CLAUDE.md 규칙 — CRUD 완료 시 필수)
  window.showToast?.('저장 완료', 2000, 'success');
}

// ── 식단 자동 저장 ──────────────────────────────────────────────
export async function _autoSaveDiet() {
  if (!S.date) {
    console.warn('[render-workout] 날짜 정보가 없어 저장할 수 없습니다');
    return;
  }
  if (_blockIfFutureDate()) return;
  const { y, m, d } = S.date;

  const bEl = document.getElementById('wt-meal-breakfast');
  const lEl = document.getElementById('wt-meal-lunch');
  const dEl = document.getElementById('wt-meal-dinner');
  const sEl = document.getElementById('wt-meal-snack');
  if (bEl) S.diet.breakfast = bEl.value.trim();
  if (lEl) S.diet.lunch     = lEl.value.trim();
  if (dEl) S.diet.dinner    = dEl.value.trim();
  if (sEl) S.diet.snack     = sEl.value.trim();

  _autoDeriveActivityFlags();
  const cleanEx = _cleanExercises(true);
  const isDietSuccess = _computeDietSuccess(cleanEx);

  console.log('[render-workout] 식단 자동 저장 시작:', { dateKey: dateKey(y, m, d), foods: { b: S.diet.bFoods?.length || 0, l: S.diet.lFoods?.length || 0, d: S.diet.dFoods?.length || 0 } });

  try {
    const payload = _buildSavePayload(cleanEx, isDietSuccess);
    await saveDay(dateKey(y, m, d), payload);

    // analytics 계측
    const totalFoods = (S.diet.bFoods?.length || 0) + (S.diet.lFoods?.length || 0)
      + (S.diet.dFoods?.length || 0) + (S.diet.sFoods?.length || 0);
    if (totalFoods > 0) {
      const meals = [S.diet.bFoods, S.diet.lFoods, S.diet.dFoods, S.diet.sFoods]
        .filter(f => f?.length > 0).length;
      const kcal = (payload.bKcal || 0) + (payload.lKcal || 0) + (payload.dKcal || 0) + (payload.sKcal || 0);
      trackEvent('core', 'diet_logged', { meals, kcal });
    }

    console.log('[render-workout] 식단 자동 저장 완료');
    _refreshTabDots();
    showCenterToast('저장되었습니다');
  } catch(e) {
    console.error('[render-workout] 자동 저장 실패:', e);
  }
}
