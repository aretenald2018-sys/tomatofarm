// ================================================================
// workout/load.js — 날짜 로드, 상태 복원
// 2026-04-21: S.workout / S.diet / S.shared 네임스페이스 마이그레이션 완료.
// ================================================================

import { S }                          from './state.js';
import { _renderDateLabel,
         _renderStretchingToggle, _renderWineFreeToggle,
         _renderMealSkippedToggles, _renderDietResults,
         _renderMealFoodItems, _renderMealPhotos,
         renderCalorieTracker }
                                     from './render.js';
import { _renderWorkoutTimer, _renderTimerControls,
         _fmtDuration, wtRestTimerSkip, _isViewingTimerDate }
                                     from './timers.js';
import { _renderRunningForm, _renderCfForm,
         _renderStretchForm, _renderSwimForm }
                                     from './activity-forms.js';
import { _initButtonEventListeners } from './status.js';
import { _renderExerciseList }       from './exercises.js';
import { getDay, isFuture, TODAY, isExpertModeEnabled, getExpertPreset } from '../data.js';

// ── 날짜 로드 ────────────────────────────────────────────────────
export function loadWorkoutDate(y, m, d) {
  const cur = S.shared.date;
  const isSameDate = cur && cur.y === y && cur.m === m && cur.d === d;

  if (isSameDate) {
    _renderDateLabel();
    _renderExerciseList();
    _renderWorkoutTimer();
    _renderTimerControls();
    _renderDietResults();
    renderCalorieTracker();
    _renderMealPhotos();
    return;
  }

  if (window._wtResetFlowUI) window._wtResetFlowUI();

  // 날짜가 실제로 바뀔 때 진행 중인 AI 추정 배너/상태를 모두 정리.
  if (window.aiEstimateClearAll) {
    try { window.aiEstimateClearAll(); } catch (e) { console.warn('[aiEstimateClearAll]', e); }
  }

  S.shared.date = { y, m, d };
  const day  = getDay(y, m, d);

  // 운동 도메인 복원
  const w = S.workout;
  w.exercises   = JSON.parse(JSON.stringify(day.exercises || []));
  w.cf          = !!day.cf;
  w.stretching  = !!day.stretching;
  w.swimming    = !!day.swimming;
  w.running     = !!day.running;
  w.runData     = {
    distance:    day.runDistance || 0,
    durationMin: day.runDurationMin || 0,
    durationSec: day.runDurationSec || 0,
    memo:        day.runMemo || '',
  };
  w.cfData = {
    wod:         day.cfWod || '',
    durationMin: day.cfDurationMin || 0,
    durationSec: day.cfDurationSec || 0,
    memo:        day.cfMemo || '',
  };
  w.stretchData = {
    duration:    day.stretchDuration || 0,
    memo:        day.stretchMemo || '',
  };
  w.swimData = {
    distance:    day.swimDistance || 0,
    durationMin: day.swimDurationMin || 0,
    durationSec: day.swimDurationSec || 0,
    stroke:      day.swimStroke || '',
    memo:        day.swimMemo || '',
  };
  w.wineFree        = !!day.wine_free;
  w.workoutDuration = day.workoutDuration || 0;
  // 전문가 모드 메타데이터 복원 (day에 저장된 값 > preset 기본값)
  w.routineMeta  = day.routineMeta || null;
  w.currentGymId = day.gymId || (isExpertModeEnabled() ? (getExpertPreset().currentGymId || null) : null);

  // ⚠️ 스톱워치(S.workout.workoutStartTime/workoutTimerInterval/workoutTimerDate)는
  // 끝내기/리셋 전에는 절대 멈추면 안 됨. 여기서는 건드리지 않는다.
  //
  // 2026-04-20: rest 타이머는 위 `isSameDate` early-return 경로에선 건드리지 않는다.
  //   여기(=실제 날짜 변경) 만 skip — 이전 날짜의 세트 간 휴식이 새 날짜로 이어지면
  //   쉬는시간 개념이 깨지므로. 같은 날짜 autoSave/재렌더에서는 rest 유지.
  wtRestTimerSkip();
  const timerControls = document.querySelector('.wt-timer-controls');
  if (timerControls) timerControls.style.display = '';
  const timerText = document.getElementById('wt-workout-timer');
  if (timerText) timerText.style.display = '';
  const resultEl = document.getElementById('wt-workout-duration-result');
  if (resultEl) resultEl.style.display = 'none';

  // 식단 도메인 복원 — skip 플래그까지 diet 내부로 일원화.
  S.diet = {
    breakfast: day.breakfast||'', lunch: day.lunch||'', dinner: day.dinner||'', snack: day.snack||'',
    breakfastSkipped: !!day.breakfast_skipped,
    lunchSkipped:     !!day.lunch_skipped,
    dinnerSkipped:    !!day.dinner_skipped,
    bOk:    day.bOk    ?? null, lOk:    day.lOk    ?? null, dOk:    day.dOk    ?? null, sOk: day.sOk ?? null,
    bKcal:  day.bKcal  || 0,   lKcal:  day.lKcal  || 0,   dKcal:  day.dKcal  || 0,   sKcal: day.sKcal || 0,
    bReason:day.bReason|| '',  lReason:day.lReason|| '',  dReason:day.dReason|| '',  sReason: day.sReason || '',
    bProtein:day.bProtein||0, bCarbs:day.bCarbs||0, bFat:day.bFat||0,
    lProtein:day.lProtein||0, lCarbs:day.lCarbs||0, lFat:day.lFat||0,
    dProtein:day.dProtein||0, dCarbs:day.dCarbs||0, dFat:day.dFat||0,
    sProtein:day.sProtein||0, sCarbs:day.sCarbs||0, sFat:day.sFat||0,
    bFoods:day.bFoods||[], lFoods:day.lFoods||[], dFoods:day.dFoods||[], sFoods:day.sFoods||[],
    bEstimateMeta: day.bEstimateMeta || null,
    lEstimateMeta: day.lEstimateMeta || null,
    dEstimateMeta: day.dEstimateMeta || null,
    sEstimateMeta: day.sEstimateMeta || null,
  };

  window._mealPhotos = {};
  if (day.bPhoto) window._mealPhotos.breakfast = day.bPhoto;
  if (day.lPhoto) window._mealPhotos.lunch = day.lPhoto;
  if (day.dPhoto) window._mealPhotos.dinner = day.dPhoto;
  if (day.sPhoto) window._mealPhotos.snack = day.sPhoto;
  if (day.workoutPhoto) window._mealPhotos.workout = day.workoutPhoto;

  _renderDateLabel();
  _renderStretchingToggle();
  document.getElementById('wt-chip-swimming')?.classList.toggle('active', w.swimming);
  document.getElementById('wt-chip-running')?.classList.toggle('active', w.running);
  _renderRunningForm();
  _renderCfForm();
  _renderStretchForm();
  _renderSwimForm();
  _renderWorkoutTimer();
  _renderTimerControls();
  _renderWineFreeToggle();
  _renderMealSkippedToggles();
  _initButtonEventListeners();
  _renderExerciseList();
  _renderMealFoodItems('breakfast');
  _renderMealFoodItems('lunch');
  _renderMealFoodItems('dinner');
  _renderMealFoodItems('snack');
  _renderDietResults();
  _renderMealPhotos();

  const memoEl = document.getElementById('wt-workout-memo');
  if (memoEl) memoEl.value = day.memo || '';
  const bEl = document.getElementById('wt-meal-breakfast');
  const lEl = document.getElementById('wt-meal-lunch');
  const dEl = document.getElementById('wt-meal-dinner');
  const sEl = document.getElementById('wt-meal-snack');
  if (bEl) bEl.value = S.diet.breakfast;
  if (lEl) lEl.value = S.diet.lunch;
  if (dEl) dEl.value = S.diet.dinner;
  if (sEl) sEl.value = S.diet.snack;

  const isFutureDay = isFuture(y, m, d);
  _setInputsDisabled(isFutureDay);

  _restoreFlowState(day);
}

function _restoreFlowState(day) {
  const timerBar = document.getElementById('wt-workout-timer-bar');

  const hasExercises  = (day.exercises || []).length > 0;
  const hasCf         = !!day.cf;
  const hasStretching = !!day.stretching;
  const hasSwimming   = !!day.swimming;
  const hasRunning    = !!day.running;

  const flags = {
    gym: hasExercises, cf: hasCf, stretch: hasStretching,
    swimming: hasSwimming, running: hasRunning,
  };
  Object.entries(flags).forEach(([t, on]) => {
    const chip = document.getElementById('wt-chip-' + t);
    if (!chip) return;
    chip.classList.toggle('has-record', on);
  });
  let active = 'gym';
  if (!hasExercises) {
    const firstWithRecord = Object.entries(flags).find(([, on]) => on);
    if (firstWithRecord) active = firstWithRecord[0];
  }
  if (window._wtSetActiveType) window._wtSetActiveType(active);

  // 2026-04-20: 타이머 바는 운동 탭에 있는 동안 **항상** 노출.
  const hasAnyRecord = hasExercises || hasCf || hasStretching || hasSwimming || hasRunning;
  if (timerBar) timerBar.classList.add('wt-open');
  if (hasAnyRecord) {
    document.getElementById('wt-memo-section')?.classList.add('wt-open');
    document.getElementById('wt-save-section')?.classList.add('wt-open');
  } else {
    document.getElementById('wt-memo-section')?.classList.remove('wt-open');
    document.getElementById('wt-save-section')?.classList.remove('wt-open');
  }

  // 2026-04-19: 타이머 컨트롤 노출 규칙 — 오늘 or 타이머 날짜.
  const date = S.shared.date;
  const isToday = date && date.y === TODAY.getFullYear() && date.m === TODAY.getMonth() && date.d === TODAY.getDate();
  const showControls = isToday || _isViewingTimerDate();
  if (!showControls && timerBar) {
    const controls = timerBar.querySelector('.wt-timer-controls');
    if (controls) controls.style.display = 'none';
    if (S.workout.workoutDuration > 0) {
      const resultEl = document.getElementById('wt-workout-duration-result');
      if (resultEl) { resultEl.textContent = `총 ${_fmtDuration(S.workout.workoutDuration)}`; resultEl.style.display = ''; }
      const timerText = document.getElementById('wt-workout-timer');
      if (timerText) timerText.style.display = 'none';
    }
  } else {
    _renderTimerControls();
  }
}

function _setInputsDisabled(disabled) {
  const panel = document.getElementById('tab-workout');
  if (!panel) return;
  panel.querySelectorAll('input, textarea, select, button').forEach(el => {
    if (el.classList.contains('wt-date-nav-btn')) return;
    if (el.classList.contains('wt-today-btn')) return;
    el.disabled = disabled;
  });
  panel.classList.toggle('wt-readonly', !!disabled);
  const notice = document.getElementById('wt-future-notice');
  if (notice) notice.style.display = disabled ? 'block' : 'none';
}

export function changeWorkoutDate(delta) {
  const date = S.shared.date;
  if (!date) return;
  const d = new Date(date.y, date.m, date.d + delta);
  loadWorkoutDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function goToTodayWorkout() {
  loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}
