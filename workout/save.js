// ================================================================
// workout/save.js — 저장 로직 (saveWorkoutDay + _autoSaveDiet)
// ================================================================

import { S }                        from './state.js';
import { showCenterToast }          from '../home/utils.js';
import { saveDay, dateKey,
         getDietPlan, getDayTargetKcal,
         isDietDaySuccess, trackEvent } from '../data.js';

// ── 공통 저장 페이로드 빌더 ──────────────────────────────────────
// saveWorkoutDay()와 _autoSaveDiet() 양쪽에서 호출하여 필드 누락 방지
function _buildSavePayload(cleanEx, isDietSuccess) {
  return {
    exercises:  cleanEx,
    cf:         S.cfStatus === 'done',
    cf_skip:    S.cfStatus === 'skip',
    cf_health:  S.cfStatus === 'health',
    gym_skip:   S.gymStatus === 'skip',
    gym_health: S.gymStatus === 'health',
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
    bOk:isDietSuccess,   lOk:isDietSuccess,   dOk:isDietSuccess,   sOk:isDietSuccess,
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

function _cleanExercises(includeNotes) {
  return S.exercises
    .map(e => ({ ...e, sets: e.sets.filter(s => s.kg > 0 || s.reps > 0) }))
    .filter(e => e.sets.length > 0 || (includeNotes && e.note));
}

function _computeDietSuccess(cleanEx) {
  const plan = getDietPlan();
  const { y, m, d } = S.date;
  const dayData = {
    exercises: cleanEx,
    cf: S.cfStatus === 'done',
    swimming: S.swimming,
    running: S.running,
    gym_skip: S.gymStatus === 'skip',
  };
  const dayTarget = getDayTargetKcal(plan, y, m, d, dayData);
  const totalKcal = (S.diet.bKcal||0) + (S.diet.lKcal||0) + (S.diet.dKcal||0) + (S.diet.sKcal||0);
  const tol = plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;
  return isDietDaySuccess(totalKcal, dayTarget, tol);
}

// ── 명시적 저장 ──────────────────────────────────────────────────
export async function saveWorkoutDay() {
  if (!S.date) return;
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
  document.dispatchEvent(new CustomEvent('sheet:saved'));
}

// ── 식단 자동 저장 ──────────────────────────────────────────────
export async function _autoSaveDiet() {
  if (!S.date) {
    console.warn('[render-workout] 날짜 정보가 없어 저장할 수 없습니다');
    return;
  }
  const { y, m, d } = S.date;

  S.diet.breakfast = document.getElementById('wt-meal-breakfast')?.value.trim() || S.diet.breakfast;
  S.diet.lunch     = document.getElementById('wt-meal-lunch')?.value.trim() || S.diet.lunch;
  S.diet.dinner    = document.getElementById('wt-meal-dinner')?.value.trim() || S.diet.dinner;
  S.diet.snack     = document.getElementById('wt-meal-snack')?.value.trim() || S.diet.snack;

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
    showCenterToast('저장되었습니다');
  } catch(e) {
    console.error('[render-workout] 자동 저장 실패:', e);
  }
}
