// ================================================================
// workout/save.js — 저장 로직 (saveWorkoutDay + _autoSaveDiet)
// ================================================================
// 2026-04-21 리팩토링:
//   (1) S 상태가 S.workout / S.diet / S.shared 네임스페이스로 분할됨.
//   (2) 도메인 파생 함수(_computeDietSuccess/_autoDeriveActivityFlags) 는
//       cross-domain.js 로 이전 — 명시적 입력/출력으로 경계 가시화.
//   (3) setDoc({merge:true}) + save-schema.js 의 파티션 상수로 운동/식단 저장 경로가
//       절대 반대편 도메인 필드를 덮지 못하게 차단.
// ================================================================

import { S }                        from './state.js';
import { showCenterToast }          from '../home/utils.js';
import { saveDay, dateKey, isFuture, trackEvent, getExList } from '../data.js';
import { WORKOUT_PAYLOAD_KEYS, DIET_PAYLOAD_KEYS } from './save-schema.js';
import { deriveActivityFlagsFromDetails, deriveDietSuccessFromWorkout } from './cross-domain.js';

// 미래 날짜 저장 가드 — 어떤 경로로든 미래 날짜 쓰기 금지 (B-3).
function _blockIfFutureDate() {
  const date = S.shared.date;
  if (!date) return false;
  if (!isFuture(date.y, date.m, date.d)) return false;
  try { window.showToast?.('미래 날짜는 저장할 수 없어요', 1800, 'warning'); } catch {}
  return true;
}

// 저장 대상 날짜가 현재 활성 스톱워치의 귀속 날짜인지 판정.
function _isSavingTimerDate() {
  if (!S.workout.workoutStartTime) return false;
  const td = S.workout.workoutTimerDate, cd = S.shared.date;
  if (!td || !cd) return false;
  return td.y === cd.y && td.m === cd.m && td.d === cd.d;
}

// ── per-meal 기록 유무 판정 헬퍼 ────────────────────────────────
function _hasMealRecord(textVal, foodsArr, kcalVal, skipFlag) {
  if (skipFlag) return true;
  if (textVal && String(textVal).trim()) return true;
  if (Array.isArray(foodsArr) && foodsArr.length > 0) return true;
  if ((kcalVal || 0) > 0) return true;
  return false;
}

// ── 공통 per-meal 성공 계산 ─────────────────────────────────────
// bOk/lOk/dOk/sOk 은 dayTarget 이 운동(cardio/CF/swim)에 의존하므로 양 저장 경로에서
// 동일하게 재계산. 양 payload 에 모두 포함 — 값 동일하므로 merge last-write-wins 무관.
function _computeMealOk(isDietSuccess) {
  const diet = S.diet;
  return {
    bOk: _hasMealRecord(diet.breakfast, diet.bFoods, diet.bKcal, diet.breakfastSkipped)
           ? (diet.breakfastSkipped ? true : isDietSuccess) : null,
    lOk: _hasMealRecord(diet.lunch,     diet.lFoods, diet.lKcal, diet.lunchSkipped)
           ? (diet.lunchSkipped     ? true : isDietSuccess) : null,
    dOk: _hasMealRecord(diet.dinner,    diet.dFoods, diet.dKcal, diet.dinnerSkipped)
           ? (diet.dinnerSkipped    ? true : isDietSuccess) : null,
    sOk: _hasMealRecord(diet.snack,     diet.sFoods, diet.sKcal, false)
           ? isDietSuccess : null,
  };
}

// 2026-04-20: 빌더 산출 키와 schema 상수 간 드리프트 감지 (dev-only).
let _schemaDriftChecked = false;
function _assertSchemaParity(name, payload, expectedKeys) {
  if (_schemaDriftChecked) return;
  const actual = new Set(Object.keys(payload));
  const expected = new Set(expectedKeys);
  const missing = [...expected].filter(k => !actual.has(k));
  const extra   = [...actual].filter(k => !expected.has(k));
  if (missing.length || extra.length) {
    console.warn(`[save-schema] ${name} 드리프트`, { missing, extra });
  }
}

// ── 운동 도메인 페이로드 ─────────────────────────────────────────
// 식단 필드(breakfast/bFoods/bKcal/bPhoto/EstimateMeta 등)는 전부 제외 → merge 저장이
// Firestore 의 식단 필드를 건드릴 수 없다.
function _buildWorkoutPayload(cleanEx, isDietSuccess) {
  const w = S.workout;
  return {
    exercises:  cleanEx,
    cf:         w.cf,
    stretching: w.stretching,
    swimming:   w.swimming,
    running:    w.running,
    runDistance:    w.runData.distance,
    runDurationMin: w.runData.durationMin,
    runDurationSec: w.runData.durationSec,
    runMemo:       w.runData.memo,
    cfWod:         w.cfData.wod,
    cfDurationMin: w.cfData.durationMin,
    cfDurationSec: w.cfData.durationSec,
    cfMemo:        w.cfData.memo,
    stretchDuration: w.stretchData.duration,
    stretchMemo:   w.stretchData.memo,
    swimDistance:   w.swimData.distance,
    swimDurationMin: w.swimData.durationMin,
    swimDurationSec: w.swimData.durationSec,
    swimStroke:    w.swimData.stroke,
    swimMemo:      w.swimData.memo,
    workoutDuration: _isSavingTimerDate()
      ? w.workoutDuration + Math.floor((Date.now() - w.workoutStartTime) / 1000)
      : w.workoutDuration,
    wine_free:  w.wineFree,
    memo:       document.getElementById('wt-workout-memo')?.value.trim() || '',
    workoutPhoto: window._mealPhotos?.workout || null,
    gymId: w.currentGymId || null,
    routineMeta: w.routineMeta || null,
    ..._computeMealOk(isDietSuccess),
  };
}

// ── 식단 도메인 페이로드 ─────────────────────────────────────────
// 운동 필드 전부 제외 → 식단 자동저장이 운동 데이터를 건드릴 수 없다.
function _buildDietPayload(isDietSuccess) {
  const d = S.diet;
  return {
    breakfast_skipped: d.breakfastSkipped,
    lunch_skipped:     d.lunchSkipped,
    dinner_skipped:    d.dinnerSkipped,
    breakfast:  d.breakfast,
    lunch:      d.lunch,
    dinner:     d.dinner,
    snack:      d.snack,
    bKcal:d.bKcal, lKcal:d.lKcal, dKcal:d.dKcal, sKcal:d.sKcal,
    bReason:d.bReason, lReason:d.lReason, dReason:d.dReason, sReason:d.sReason,
    bProtein:d.bProtein, bCarbs:d.bCarbs, bFat:d.bFat,
    lProtein:d.lProtein, lCarbs:d.lCarbs, lFat:d.lFat,
    dProtein:d.dProtein, dCarbs:d.dCarbs, dFat:d.dFat,
    sProtein:d.sProtein, sCarbs:d.sCarbs, sFat:d.sFat,
    bFoods:d.bFoods||[], lFoods:d.lFoods||[], dFoods:d.dFoods||[], sFoods:d.sFoods||[],
    bPhoto: window._mealPhotos?.breakfast || null,
    lPhoto: window._mealPhotos?.lunch     || null,
    dPhoto: window._mealPhotos?.dinner    || null,
    sPhoto: window._mealPhotos?.snack     || null,
    bEstimateMeta: d.bEstimateMeta || null,
    lEstimateMeta: d.lEstimateMeta || null,
    dEstimateMeta: d.dEstimateMeta || null,
    sEstimateMeta: d.sEstimateMeta || null,
    ..._computeMealOk(isDietSuccess),
  };
}

// 탭 칩의 기록 힌트(has-record) 즉시 동기화 — 저장/상태 변경 후 호출.
function _refreshTabDots() {
  const w = S.workout;
  const flags = {
    gym: (w.exercises || []).length > 0,
    cf: !!w.cf,
    stretch: !!w.stretching,
    swimming: !!w.swimming,
    running: !!w.running,
  };
  Object.entries(flags).forEach(([t, on]) => {
    document.getElementById('wt-chip-' + t)?.classList.toggle('has-record', !!on);
  });
}

function _cleanExercises(includeNotes) {
  // 저장 시점에 exList에서 movementId/muscleIds 스냅샷 (삭제된 종목·커스텀 종목 대응).
  const exById = new Map((getExList() || []).map(e => [e.id, e]));
  return S.workout.exercises
    .map(e => {
      const lib = exById.get(e.exerciseId);
      const movementId = e.movementId || lib?.movementId || null;
      const muscleIds  = Array.isArray(e.muscleIds) && e.muscleIds.length
        ? e.muscleIds
        : (Array.isArray(lib?.muscleIds) ? lib.muscleIds : []);
      // 2026-04-21: 저장 시 name 도 스냅샷. 다른 유저(친구) 가 이 workout 문서를 읽어
      //   cheers-card / insights 등에 표시할 때 exerciseId 원본이 노출되던 회귀 방지
      //   (예: "줍스님이 mo3t9kmdbvia7rssnh4을(를) 오늘부터 루틴에 다시 추가했어요").
      //   커스텀 종목 이름은 작성자 본인의 exList 에만 있으므로 스냅샷이 필수.
      const name = e.name || lib?.name || null;
      return {
        ...e,
        name,
        movementId,
        muscleIds,
        sets: e.sets.filter(s => s && (s.done === true || (s.kg || 0) > 0 || (s.reps || 0) > 0)),
      };
    })
    .filter(e => e.sets.length > 0 || (includeNotes && e.note));
}

// ── 명시적 저장 ──────────────────────────────────────────────────
export async function saveWorkoutDay() {
  if (!S.shared.date) return;
  if (_blockIfFutureDate()) return;
  const { y, m, d } = S.shared.date;

  // diet text 동기화 (운동 탭의 식단 입력이 열려 있으면 그 값 반영)
  const diet = S.diet;
  diet.breakfast = document.getElementById('wt-meal-breakfast')?.value.trim() || '';
  diet.lunch     = document.getElementById('wt-meal-lunch')?.value.trim() || '';
  diet.dinner    = document.getElementById('wt-meal-dinner')?.value.trim() || '';
  diet.snack     = document.getElementById('wt-meal-snack')?.value.trim() || '';

  // 런닝 폼 최신값 동기화
  const run = S.workout.runData;
  run.distance    = parseFloat(document.getElementById('wt-run-distance')?.value) || 0;
  run.durationMin = parseInt(document.getElementById('wt-run-duration-min')?.value) || 0;
  run.durationSec = parseInt(document.getElementById('wt-run-duration-sec')?.value) || 0;
  run.memo        = document.getElementById('wt-run-memo')?.value.trim() || '';

  // 운동 flag 자동 파생 (세부 입력 → boolean flag)
  const derived = deriveActivityFlagsFromDetails(S.workout);
  S.workout.cf = derived.cf;
  S.workout.running = derived.running;
  S.workout.swimming = derived.swimming;
  S.workout.stretching = derived.stretching;

  const cleanEx = _cleanExercises(false);
  const isDietSuccess = deriveDietSuccessFromWorkout(S.workout, S.diet, S.shared.date, cleanEx);

  const btn = document.getElementById('wt-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  const payload = _buildWorkoutPayload(cleanEx, isDietSuccess);
  _assertSchemaParity('workout', payload, WORKOUT_PAYLOAD_KEYS);
  try {
    await saveDay(dateKey(y, m, d), payload, { rethrow: true, mode: 'merge' });
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    console.error('[workout/save] saveWorkoutDay 실패:', e);
    window.showToast?.('저장 실패 — 네트워크를 확인해주세요', 2800, 'error');
    throw e;
  }

  // analytics
  if (cleanEx.length > 0 || S.workout.cf || S.workout.swimming || S.workout.running) {
    trackEvent('core', 'exercise_logged');
  }

  if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  _refreshTabDots();
  document.dispatchEvent(new CustomEvent('sheet:saved'));

  window.showToast?.('저장 완료', 2000, 'success');
}

// ── 식단 자동 저장 ──────────────────────────────────────────────
// 식단 도메인만 merge 저장. 운동 필드 전부 제외 → 식단 자동저장이 운동을 건드리지 못함.
// deriveActivityFlagsFromDetails 호출 제거 — 식단 CRUD 는 운동 flag 변경에 관여 금지.
export async function _autoSaveDiet() {
  if (!S.shared.date) {
    console.warn('[render-workout] 날짜 정보가 없어 저장할 수 없습니다');
    return;
  }
  if (_blockIfFutureDate()) return;
  const { y, m, d } = S.shared.date;

  const bEl = document.getElementById('wt-meal-breakfast');
  const lEl = document.getElementById('wt-meal-lunch');
  const dEl = document.getElementById('wt-meal-dinner');
  const sEl = document.getElementById('wt-meal-snack');
  const diet = S.diet;
  if (bEl) diet.breakfast = bEl.value.trim();
  if (lEl) diet.lunch     = lEl.value.trim();
  if (dEl) diet.dinner    = dEl.value.trim();
  if (sEl) diet.snack     = sEl.value.trim();

  const cleanEx = _cleanExercises(true);
  const isDietSuccess = deriveDietSuccessFromWorkout(S.workout, S.diet, S.shared.date, cleanEx);

  console.log('[render-workout] 식단 자동 저장 시작:', {
    dateKey: dateKey(y, m, d),
    foods: { b: diet.bFoods?.length || 0, l: diet.lFoods?.length || 0, d: diet.dFoods?.length || 0 },
  });

  try {
    const payload = _buildDietPayload(isDietSuccess);
    _assertSchemaParity('diet', payload, DIET_PAYLOAD_KEYS);
    await saveDay(dateKey(y, m, d), payload, { rethrow: true, mode: 'merge' });

    const totalFoods = (diet.bFoods?.length || 0) + (diet.lFoods?.length || 0)
      + (diet.dFoods?.length || 0) + (diet.sFoods?.length || 0);
    if (totalFoods > 0) {
      const meals = [diet.bFoods, diet.lFoods, diet.dFoods, diet.sFoods]
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
