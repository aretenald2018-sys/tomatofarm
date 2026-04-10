// ================================================================
// workout/load.js — 날짜 로드, 상태 복원
// ================================================================

import { S, emptyDiet }              from './state.js';
import { saveWorkoutDay }            from './save.js';
import { _renderDateLabel, _renderGymStatusBtns, _renderCFStatusBtns,
         _renderStretchingToggle, _renderWineFreeToggle,
         _renderMealSkippedToggles, _renderDietResults,
         _renderMealFoodItems, _renderMealPhotos }
                                     from './render.js';
import { _renderWorkoutTimer, _renderTimerControls,
         _fmtDuration, wtRestTimerSkip }
                                     from './timers.js';
import { _renderRunningForm, _renderCfForm,
         _renderStretchForm, _renderSwimForm }
                                     from './activity-forms.js';
import { _initButtonEventListeners } from './status.js';
import { _renderExerciseList }       from './exercises.js';
import { getDay, isFuture, TODAY }   from '../data.js';

// ── 날짜 로드 ────────────────────────────────────────────────────
export function loadWorkoutDate(y, m, d) {
  const _timerRunningForSameDate = S.workoutStartTime && S.date && S.date.y === y && S.date.m === m && S.date.d === d;

  if (window._wtResetFlowUI) window._wtResetFlowUI();

  S.date      = { y, m, d };
  const day  = getDay(y, m, d);
  S.exercises = JSON.parse(JSON.stringify(day.exercises || []));

  if (day.gym_health)                      S.gymStatus = 'health';
  else if (day.gym_skip)                   S.gymStatus = 'skip';
  else if ((day.exercises||[]).length > 0) S.gymStatus = 'done';
  else                                     S.gymStatus = 'none';

  if (day.cf_health)    S.cfStatus = 'health';
  else if (day.cf_skip) S.cfStatus = 'skip';
  else if (day.cf)      S.cfStatus = 'done';
  else                  S.cfStatus = 'none';

  S.stretching = !!day.stretching;
  S.swimming   = !!day.swimming;
  S.running    = !!day.running;
  S.runData    = {
    distance:    day.runDistance || 0,
    durationMin: day.runDurationMin || 0,
    durationSec: day.runDurationSec || 0,
    memo:        day.runMemo || '',
  };
  S.cfData = {
    wod:         day.cfWod || '',
    durationMin: day.cfDurationMin || 0,
    durationSec: day.cfDurationSec || 0,
    memo:        day.cfMemo || '',
  };
  S.stretchData = {
    duration:    day.stretchDuration || 0,
    memo:        day.stretchMemo || '',
  };
  S.swimData = {
    distance:    day.swimDistance || 0,
    durationMin: day.swimDurationMin || 0,
    durationSec: day.swimDurationSec || 0,
    stroke:      day.swimStroke || '',
    memo:        day.swimMemo || '',
  };
  S.wineFree   = !!day.wine_free;
  if (_timerRunningForSameDate) {
    // running 중인 타이머 유지
  } else {
    S.workoutDuration = day.workoutDuration || 0;
    S.workoutStartTime = null;
    if (S.workoutTimerInterval) { clearInterval(S.workoutTimerInterval); S.workoutTimerInterval = null; }
  }
  wtRestTimerSkip();
  const timerControls = document.querySelector('.wt-timer-controls');
  if (timerControls) timerControls.style.display = '';
  const timerText = document.getElementById('wt-workout-timer');
  if (timerText) timerText.style.display = '';
  const resultEl = document.getElementById('wt-workout-duration-result');
  if (resultEl) resultEl.style.display = 'none';
  S.breakfastSkipped = !!day.breakfast_skipped;
  S.lunchSkipped = !!day.lunch_skipped;
  S.dinnerSkipped = !!day.dinner_skipped;
  S.diet = {
    breakfast: day.breakfast||'', lunch: day.lunch||'', dinner: day.dinner||'', snack: day.snack||'',
    bOk:    day.bOk    ?? null, lOk:    day.lOk    ?? null, dOk:    day.dOk    ?? null, sOk: day.sOk ?? null,
    bKcal:  day.bKcal  || 0,   lKcal:  day.lKcal  || 0,   dKcal:  day.dKcal  || 0,   sKcal: day.sKcal || 0,
    bReason:day.bReason|| '',  lReason:day.lReason|| '',  dReason:day.dReason|| '',  sReason: day.sReason || '',
    bProtein:day.bProtein||0, bCarbs:day.bCarbs||0, bFat:day.bFat||0,
    lProtein:day.lProtein||0, lCarbs:day.lCarbs||0, lFat:day.lFat||0,
    dProtein:day.dProtein||0, dCarbs:day.dCarbs||0, dFat:day.dFat||0,
    sProtein:day.sProtein||0, sCarbs:day.sCarbs||0, sFat:day.sFat||0,
    bFoods:day.bFoods||[], lFoods:day.lFoods||[], dFoods:day.dFoods||[], sFoods:day.sFoods||[],
  };

  window._mealPhotos = {};
  if (day.bPhoto) window._mealPhotos.breakfast = day.bPhoto;
  if (day.lPhoto) window._mealPhotos.lunch = day.lPhoto;
  if (day.dPhoto) window._mealPhotos.dinner = day.dPhoto;
  if (day.sPhoto) window._mealPhotos.snack = day.sPhoto;
  if (day.workoutPhoto) window._mealPhotos.workout = day.workoutPhoto;

  _renderDateLabel();
  _renderGymStatusBtns();
  _renderCFStatusBtns();
  _renderStretchingToggle();
  document.getElementById('wt-chip-swimming')?.classList.toggle('active', S.swimming);
  document.getElementById('wt-chip-running')?.classList.toggle('active', S.running);
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
  const flow       = document.getElementById('wt-flow');
  const badge      = document.getElementById('wt-badge-text');
  const timerBar   = document.getElementById('wt-workout-timer-bar');
  if (!flow) return;

  const hasExercises  = (day.exercises || []).length > 0;
  const hasCf         = !!day.cf;
  const hasStretching = !!day.stretching;
  const hasSwimming   = !!day.swimming;
  const hasRunning    = !!day.running;
  const isSkip        = !!day.gym_skip;
  const isHealth      = !!day.gym_health;
  const hasWorkout    = hasExercises || hasCf || hasStretching || hasSwimming || hasRunning;

  if (!hasWorkout && !isSkip && !isHealth) return;

  flow.classList.add('wt-chosen');

  if (isSkip && !hasWorkout) {
    if (badge) { badge.className = 'wt-status-badge wt-skip'; badge.textContent = '오늘은 쉬었어요'; }
    flow.classList.remove('wt-show-type');
  } else if (isHealth && !hasWorkout) {
    if (badge) { badge.className = 'wt-status-badge wt-health'; badge.textContent = '건강 이슈가 있어요'; }
    flow.classList.remove('wt-show-type');
  } else {
    if (badge) { badge.className = 'wt-status-badge wt-active'; badge.textContent = '운동했어요 💪'; }
    flow.classList.add('wt-show-type');
    const typesToRestore = [];
    if (hasExercises) typesToRestore.push('gym');
    if (hasCf) typesToRestore.push('cf');
    if (hasStretching) typesToRestore.push('stretch');
    if (hasSwimming) typesToRestore.push('swimming');
    if (hasRunning) typesToRestore.push('running');
    typesToRestore.forEach(t => {
      document.getElementById('wt-chip-' + t)?.classList.add('active');
    });
    if (window._wtRestoreTypes) window._wtRestoreTypes(typesToRestore);
    if (timerBar) timerBar.classList.add('wt-open');
  }
  document.getElementById('wt-memo-section')?.classList.add('wt-open');

  const isToday = S.date && S.date.y === TODAY.getFullYear() && S.date.m === TODAY.getMonth() && S.date.d === TODAY.getDate();
  if (!isToday && timerBar) {
    const controls = timerBar.querySelector('.wt-timer-controls');
    if (controls) controls.style.display = 'none';
    if (S.workoutDuration > 0) {
      const resultEl = document.getElementById('wt-workout-duration-result');
      if (resultEl) { resultEl.textContent = `총 ${_fmtDuration(S.workoutDuration)}`; resultEl.style.display = ''; }
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
  panel.querySelectorAll('input, textarea, select, button.act-btn, button.ex-add-btn, button.ex-add-set-btn, button.wt-save-btn').forEach(el => {
    if (el.classList.contains('wt-date-nav-btn')) return;
    el.disabled = disabled;
  });
  const notice = document.getElementById('wt-future-notice');
  if (notice) notice.style.display = disabled ? 'block' : 'none';
}

export function changeWorkoutDate(delta) {
  if (!S.date) return;
  const d = new Date(S.date.y, S.date.m, S.date.d + delta);
  loadWorkoutDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function goToTodayWorkout() {
  loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}
