// ================================================================
// workout/status.js — 상태 토글 (헬스/CF/스트레칭/수영/런닝/와인/굶음)
// ================================================================

import { S }              from './state.js';
import { saveWorkoutDay } from './save.js';
import { _renderGymStatusBtns, _renderCFStatusBtns,
         _renderStretchingToggle, _renderWineFreeToggle,
         _renderMealSkippedToggles, _renderDietResults, _renderMealFoodItems,
         renderCalorieTracker as _renderCalorieTracker }
                          from './render.js';

function _persist(skipSave) {
  if (!skipSave) saveWorkoutDay().catch(e => console.error('Save error:', e));
}

function _clearMealState(meal) {
  const prefix = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
  const textKey = meal;
  const foodsKey = `${prefix}Foods`;

  S.diet[textKey] = '';
  S.diet[foodsKey] = [];
  S.diet[`${prefix}Kcal`] = 0;
  S.diet[`${prefix}Ok`] = null;
  S.diet[`${prefix}Reason`] = '';
  S.diet[`${prefix}Protein`] = 0;
  S.diet[`${prefix}Carbs`] = 0;
  S.diet[`${prefix}Fat`] = 0;

  const input = document.getElementById(`wt-meal-${meal}`);
  if (input) input.value = '';
  _renderMealFoodItems(meal);
}

export function wtSetGymStatus(status, skipSave = false) {
  S.gymStatus = status;
  _renderGymStatusBtns();
  const list = document.getElementById('wt-exercise-list');
  if (list) list.style.opacity = (status === 'done' || status === 'none') ? '1' : '0.4';
  _persist(skipSave);
}

export function wtSetCFStatus(status, skipSave = false) {
  S.cfStatus = status;
  _renderCFStatusBtns();
  _persist(skipSave);
}

export function wtToggleStretching(skipSave = false) {
  S.stretching = !S.stretching;
  _renderStretchingToggle();
  _persist(skipSave);
}

export function wtToggleSwimming(skipSave = false) {
  S.swimming = !S.swimming;
  _persist(skipSave);
}

export function wtToggleRunning(skipSave = false) {
  S.running = !S.running;
  _persist(skipSave);
}

export function wtToggleWineFree(skipSave = false) {
  S.wineFree = !S.wineFree;
  _renderWineFreeToggle();
  _persist(skipSave);
}

export function wtToggleMealSkipped(meal, skipSave = false) {
  if (meal === 'breakfast') {
    S.breakfastSkipped = !S.breakfastSkipped;
    if (S.breakfastSkipped) _clearMealState(meal);
  } else if (meal === 'lunch') {
    S.lunchSkipped = !S.lunchSkipped;
    if (S.lunchSkipped) _clearMealState(meal);
  } else if (meal === 'dinner') {
    S.dinnerSkipped = !S.dinnerSkipped;
    if (S.dinnerSkipped) _clearMealState(meal);
  }
  _renderMealSkippedToggles();
  _renderDietResults();
  _renderCalorieTracker();
  _persist(skipSave);
}

// ── 이벤트 위임: 상태 버튼 클릭 ─────────────────────────────────
let _eventsBound = false;
export function _initButtonEventListeners() {
  if (_eventsBound) return;
  _eventsBound = true;

  document.addEventListener('click', (e) => {
    const target = e.target;

    if (target.closest('#wt-gym-btn-done')) { e.stopPropagation(); wtSetGymStatus('done'); }
    else if (target.closest('#wt-gym-btn-skip')) { e.stopPropagation(); wtSetGymStatus('skip'); }
    else if (target.closest('#wt-gym-btn-health')) { e.stopPropagation(); wtSetGymStatus('health'); }

    else if (target.closest('#wt-cf-btn-done')) { e.stopPropagation(); wtSetCFStatus('done'); }
    else if (target.closest('#wt-cf-btn-skip')) { e.stopPropagation(); wtSetCFStatus('skip'); }
    else if (target.closest('#wt-cf-btn-health')) { e.stopPropagation(); wtSetCFStatus('health'); }
  });
}
