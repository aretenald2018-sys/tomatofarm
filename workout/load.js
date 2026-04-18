// ================================================================
// workout/load.js — 날짜 로드, 상태 복원
// ================================================================

import { S, emptyDiet }              from './state.js';
import { saveWorkoutDay }            from './save.js';
import { _renderDateLabel,
         _renderStretchingToggle, _renderWineFreeToggle,
         _renderMealSkippedToggles, _renderDietResults,
         _renderMealFoodItems, _renderMealPhotos,
         renderCalorieTracker }
                                     from './render.js';
import { _renderWorkoutTimer, _renderTimerControls,
         _fmtDuration, wtRestTimerSkip }
                                     from './timers.js';
import { _renderRunningForm, _renderCfForm,
         _renderStretchForm, _renderSwimForm }
                                     from './activity-forms.js';
import { _initButtonEventListeners } from './status.js';
import { _renderExerciseList }       from './exercises.js';
import { getDay, isFuture, TODAY, isExpertModeEnabled, getExpertPreset } from '../data.js';

// ── 날짜 로드 ────────────────────────────────────────────────────
export function loadWorkoutDate(y, m, d) {
  const isSameDate = S.date && S.date.y === y && S.date.m === m && S.date.d === d;

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
  // 이전 날짜에서 pending 상태인 결과가 새 날짜의 식단 카드에 붙는 race 방지.
  if (window.aiEstimateClearAll) {
    try { window.aiEstimateClearAll(); } catch (e) { console.warn('[aiEstimateClearAll]', e); }
  }

  S.date      = { y, m, d };
  const day  = getDay(y, m, d);
  S.exercises = JSON.parse(JSON.stringify(day.exercises || []));
  S.cf         = !!day.cf;
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
  S.workoutDuration = day.workoutDuration || 0;
  S.workoutStartTime = null;
  if (S.workoutTimerInterval) { clearInterval(S.workoutTimerInterval); S.workoutTimerInterval = null; }
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
  // 전문가 모드 메타데이터 복원 (day에 저장된 값 > preset 기본값)
  S.routineMeta  = day.routineMeta || null;
  S.currentGymId = day.gymId || (isExpertModeEnabled() ? (getExpertPreset().currentGymId || null) : null);
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
  const timerBar = document.getElementById('wt-workout-timer-bar');

  const hasExercises  = (day.exercises || []).length > 0;
  const hasCf         = !!day.cf;
  const hasStretching = !!day.stretching;
  const hasSwimming   = !!day.swimming;
  const hasRunning    = !!day.running;

  // 기록이 있는 탭에 점 힌트 + 기본 활성 탭 결정
  // 우선순위: 헬스 기록 있으면 헬스, 아니면 기록 있는 첫 탭, 모두 없으면 헬스
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

  // B-2: 기록이 하나라도 있는 날에만 타이머바/메모/저장 섹션을 자동 오픈.
  // (빈 날에 섹션을 다 열어두면 "이미 뭘 했나?" 오해. 칩 클릭/기록 추가 시에만 열리게.)
  const hasAnyRecord = hasExercises || hasCf || hasStretching || hasSwimming || hasRunning;
  if (timerBar && hasAnyRecord) timerBar.classList.add('wt-open');
  if (hasAnyRecord) {
    document.getElementById('wt-memo-section')?.classList.add('wt-open');
    document.getElementById('wt-save-section')?.classList.add('wt-open');
  } else {
    document.getElementById('wt-memo-section')?.classList.remove('wt-open');
    document.getElementById('wt-save-section')?.classList.remove('wt-open');
    timerBar?.classList.remove('wt-open');
  }

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
  // 날짜 네비/투데이 점프만 살리고, 탭 내부의 모든 input/textarea/select/button을 일괄 비활성.
  // (과거: act-btn/ex-add-btn 등 특정 클래스 화이트리스트 → 새 버튼 추가 시 가드 누락)
  panel.querySelectorAll('input, textarea, select, button').forEach(el => {
    if (el.classList.contains('wt-date-nav-btn')) return;
    if (el.classList.contains('wt-today-btn')) return;
    el.disabled = disabled;
  });
  // CSS 단계 가드 — 커스텀 요소(<div onclick>, 칩 등)를 disabled 없이도 차단.
  panel.classList.toggle('wt-readonly', !!disabled);
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
