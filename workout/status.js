// ================================================================
// workout/status.js — 상태 토글 (헬스/CF/스트레칭/수영/런닝/와인/굶음)
// ================================================================

import { S }              from './state.js';
import { saveWorkoutDay } from './save.js';
import { _renderGymStatusBtns, _renderCFStatusBtns,
         _renderStretchingToggle, _renderWineFreeToggle,
         _renderMealSkippedToggles, _renderDietResults,
         renderCalorieTracker as _renderCalorieTracker }
                          from './render.js';

export function wtSetGymStatus(status) {
  S.gymStatus = status;
  _renderGymStatusBtns();
  const list = document.getElementById('wt-exercise-list');
  if (list) list.style.opacity = (status === 'done' || status === 'none') ? '1' : '0.4';
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtSetCFStatus(status) {
  S.cfStatus = status;
  _renderCFStatusBtns();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleStretching() {
  S.stretching = !S.stretching;
  _renderStretchingToggle();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleSwimming() {
  S.swimming = !S.swimming;
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleRunning() {
  S.running = !S.running;
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleWineFree() {
  S.wineFree = !S.wineFree;
  _renderWineFreeToggle();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleMealSkipped(meal) {
  if (meal === 'breakfast') {
    S.breakfastSkipped = !S.breakfastSkipped;
    if (S.breakfastSkipped) { S.diet.bKcal = 0; S.diet.bOk = null; }
  } else if (meal === 'lunch') {
    S.lunchSkipped = !S.lunchSkipped;
    if (S.lunchSkipped) { S.diet.lKcal = 0; S.diet.lOk = null; }
  } else if (meal === 'dinner') {
    S.dinnerSkipped = !S.dinnerSkipped;
    if (S.dinnerSkipped) { S.diet.dKcal = 0; S.diet.dOk = null; }
  }
  _renderMealSkippedToggles();
  _renderDietResults();
  _renderCalorieTracker();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
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
