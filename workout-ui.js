// ================================================================
// workout-ui.js — 운동 탭 UX 상태 머신 + 식단 사진/아코디언
// ================================================================

import {
  wtSetGymStatus, wtSetCFStatus, wtToggleStretching, wtToggleSwimming, wtToggleRunning,
  wtToggleWineFree, wtToggleMealSkipped,
  wtOpenExercisePicker, wtCloseExercisePicker,
  wtOpenExerciseEditor, wtCloseExerciseEditor,
  wtSaveExerciseFromEditor, wtDeleteExerciseFromEditor,
  wtAddFoodItem, wtRemoveFoodItem,
  openNutritionPhotoUpload,
  wtStartWorkoutTimer, wtRestTimerShowIdle, wtRestTimerHideIdle,
} from './render-workout.js';

// ── 운동 상태 머신 ──────────────────────────────────────────────
let _wtSelectedTypes = new Set();

const _WT_TYPE_SECTIONS = {
  gym: 'wt-gym-section',
  cf: 'wt-cf-section',
  stretch: 'wt-stretch-section',
  swimming: 'wt-swimming-section',
  running: 'wt-running-section',
};

window.wtSelectStatus = function(status) {
  const flow = document.getElementById('wt-flow');
  const badge = document.getElementById('wt-badge-text');

  flow.classList.add('wt-chosen');

  if (status === 'skip') {
    wtSetGymStatus('skip'); wtSetCFStatus('skip');
    badge.className = 'wt-status-badge wt-skip';
    badge.textContent = '오늘은 쉬었어요';
    flow.classList.remove('wt-show-type');
    document.getElementById('wt-memo-section').classList.add('wt-open');
    document.getElementById('wt-save-section').classList.add('wt-open');
    return;
  }
  if (status === 'health') {
    wtSetGymStatus('health'); wtSetCFStatus('health');
    badge.className = 'wt-status-badge wt-health';
    badge.textContent = '건강 이슈가 있어요';
    flow.classList.remove('wt-show-type');
    document.getElementById('wt-memo-section').classList.add('wt-open');
    document.getElementById('wt-save-section').classList.add('wt-open');
    return;
  }
  // 운동했어요
  badge.className = 'wt-status-badge wt-active';
  badge.textContent = '운동했어요 💪';
  flow.classList.add('wt-show-type');
  document.getElementById('wt-memo-section').classList.add('wt-open');
  document.getElementById('wt-save-section').classList.add('wt-open');
  _wtSelectedTypes.clear();
};

window.wtToggleType = function(type) {
  const tab = document.getElementById('wt-chip-' + type);
  const wasSelected = _wtSelectedTypes.has(type);
  if (_wtSelectedTypes.has(type)) {
    _wtSelectedTypes.delete(type);
    if (tab) tab.classList.remove('active');
  } else {
    _wtSelectedTypes.add(type);
    if (tab) tab.classList.add('active');
  }
  wtSetGymStatus(_wtSelectedTypes.has('gym') ? 'done' : 'none');
  wtSetCFStatus(_wtSelectedTypes.has('cf') ? 'done' : 'none');
  if (type === 'stretch') wtToggleStretching();
  if (type === 'swimming') wtToggleSwimming();
  if (type === 'running') wtToggleRunning();

  Object.entries(_WT_TYPE_SECTIONS).forEach(([t, id]) => {
    const sec = document.getElementById(id);
    if (!sec) return;
    if (_wtSelectedTypes.has(t)) sec.classList.add('wt-open');
    else sec.classList.remove('wt-open');
  });

  if (type === 'gym') {
    const timerBar = document.getElementById('wt-workout-timer-bar');
    if (!wasSelected) {
      if (timerBar) timerBar.classList.add('wt-open');
      wtStartWorkoutTimer();
      wtRestTimerShowIdle();
    } else {
      wtRestTimerHideIdle();
    }
  }
};

window.wtResetStatus = function() {
  _wtSelectedTypes.clear();
  const flow = document.getElementById('wt-flow');
  flow.classList.remove('wt-chosen', 'wt-show-type');
  Object.values(_WT_TYPE_SECTIONS).forEach(id =>
    document.getElementById(id)?.classList.remove('wt-open'));
  ['wt-memo-section','wt-save-section'].forEach(id =>
    document.getElementById(id)?.classList.remove('wt-open'));
  document.getElementById('wt-workout-timer-bar')?.classList.remove('wt-open');
  ['wt-chip-gym','wt-chip-cf','wt-chip-stretch','wt-chip-swimming','wt-chip-running'].forEach(id =>
    document.getElementById(id)?.classList.remove('active'));
  wtSetGymStatus('none'); wtSetCFStatus('none');
};

window._wtResetFlowUI = function() {
  _wtSelectedTypes.clear();
  const flow = document.getElementById('wt-flow');
  if (flow) flow.classList.remove('wt-chosen', 'wt-show-type');
  Object.values(_WT_TYPE_SECTIONS).forEach(id =>
    document.getElementById(id)?.classList.remove('wt-open'));
  ['wt-memo-section','wt-save-section'].forEach(id =>
    document.getElementById(id)?.classList.remove('wt-open'));
  document.getElementById('wt-workout-timer-bar')?.classList.remove('wt-open');
  wtRestTimerHideIdle();
  ['wt-chip-gym','wt-chip-cf','wt-chip-stretch','wt-chip-swimming','wt-chip-running'].forEach(id =>
    document.getElementById(id)?.classList.remove('active'));
};

window._wtRestoreTypes = function(types) {
  _wtSelectedTypes.clear();
  types.forEach(t => _wtSelectedTypes.add(t));
  types.forEach(t => {
    document.getElementById('wt-chip-' + t)?.classList.add('active');
    const secId = _WT_TYPE_SECTIONS[t];
    if (secId) document.getElementById(secId)?.classList.add('wt-open');
  });
};

window.wtToggleWineFree         = wtToggleWineFree;

// ── 식단/운동 사진 업로드 ─────────────────────────────────────────
window._mealPhotos = {};
window.uploadMealPhoto = async function(meal, input) {
  const file = input.files?.[0];
  if (!file) return;
  const { imageToBase64 } = await import('./data.js');
  const cnt = Object.values(window._mealPhotos).filter(Boolean).length;
  const maxDim = cnt <= 1 ? 800 : cnt <= 2 ? 720 : 640;
  const quality = cnt <= 1 ? 0.75 : cnt <= 2 ? 0.7 : 0.65;
  try {
    const b64 = await imageToBase64(file, maxDim, quality);
    window._mealPhotos[meal] = 'data:image/jpeg;base64,' + b64;
    const { _renderMealPhotos } = await import('./render-workout.js');
    _renderMealPhotos();
    const { saveWorkoutDay } = await import('./render-workout.js');
    saveWorkoutDay().catch(e => console.error('Auto-save after photo:', e));
  } catch(e) { console.error('Photo upload error:', e); }
  input.value = '';
};
window.removeMealPhoto = async function(meal) {
  delete window._mealPhotos[meal];
  const { _renderMealPhotos } = await import('./render-workout.js');
  _renderMealPhotos();
  const { saveWorkoutDay } = await import('./render-workout.js');
  saveWorkoutDay().catch(e => console.error('Auto-save after photo remove:', e));
};
window.openMealPhotoLightbox = function(src) {
  const lb = document.createElement('div');
  lb.className = 'meal-photo-lightbox';
  lb.innerHTML = `<img src="${src}">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
};

// ── 식단 아코디언/스킵 ──────────────────────────────────────────
window.wtToggleMealSkipped      = wtToggleMealSkipped;
window.toggleDietMealRow = function(headerEl) {
  const row = headerEl.closest('.diet-toss-row');
  if (!row) return;
  const body = row.querySelector('.diet-toss-body');
  if (!body) return;
  if (row.classList.contains('diet-toss-open')) {
    row.classList.remove('diet-toss-open');
  } else {
    row.classList.add('diet-toss-open');
  }
};

window.wtSkipMeal = function(meal) {
  const btn = document.getElementById(`wt-${meal}-skipped`);
  const wasActive = btn?.classList.contains('active');
  wtToggleMealSkipped(meal);
  if (btn) btn.classList.toggle('active', !wasActive);
  if (!wasActive) {
    const foodList = document.getElementById(`wt-foods-${meal}`);
    if (foodList) foodList.innerHTML = '';
    const mealInput = document.getElementById(`wt-meal-${meal}`);
    if (mealInput) mealInput.value = '';
  }
};

// ── 운동 종목 편집 ──────────────────────────────────────────────
Object.assign(window, {
  wtOpenExercisePicker,
  wtCloseExercisePicker,
  wtOpenExerciseEditor,
  wtCloseExerciseEditor,
  wtSaveExerciseFromEditor,
  wtDeleteExerciseFromEditor,
  wtAddFoodItem,
  wtRemoveFoodItem,
  openNutritionPhotoUpload,
});
