// ================================================================
// workout-ui.js — 운동 탭 UX 상태 머신 + 식단 사진/아코디언
// ================================================================

import {
  wtToggleWineFree, wtToggleMealSkipped,
  wtOpenExercisePicker, wtCloseExercisePicker,
  wtOpenExerciseEditor, wtCloseExerciseEditor,
  wtSaveExerciseFromEditor, wtDeleteExerciseFromEditor,
  wtAddFoodItem, wtRemoveFoodItem,
  openNutritionPhotoUpload,
  wtStartWorkoutTimer, wtRestTimerShowIdle, wtRestTimerHideIdle,
} from './render-workout.js';

// ── 운동 유형 단일 탭 ────────────────────────────────────────────
// 이전: 복수 선택(Set). 현재: 한 번에 한 탭만 노출. 기록은 각 탭 독립 저장.
let _wtActiveType = 'gym';

const _WT_TYPE_SECTIONS = {
  gym: 'wt-gym-section',
  cf: 'wt-cf-section',
  stretch: 'wt-stretch-section',
  swimming: 'wt-swimming-section',
  running: 'wt-running-section',
};

function _applyActive(type) {
  Object.keys(_WT_TYPE_SECTIONS).forEach(t => {
    const tab = document.getElementById('wt-chip-' + t);
    if (tab) tab.classList.toggle('active', t === type);
    const sec = document.getElementById(_WT_TYPE_SECTIONS[t]);
    if (sec) sec.classList.toggle('wt-open', t === type);
  });
  // B-2: 탭(유형 칩) 클릭은 "지금부터 이 종류 기록하겠다"는 의사 표시.
  // → 이때만 타이머 바/메모/저장 섹션 오픈.
  //   (로드 시점 자동 오픈은 load.js _restoreFlowState가 기록 유무로만 판단)
  const timerBar = document.getElementById('wt-workout-timer-bar');
  if (timerBar) timerBar.classList.add('wt-open');
  document.getElementById('wt-memo-section')?.classList.add('wt-open');
  document.getElementById('wt-save-section')?.classList.add('wt-open');
}

window.wtSwitchType = function(type) {
  if (!_WT_TYPE_SECTIONS[type]) return;
  const isReclick = _wtActiveType === type;
  _wtActiveType = type;
  _applyActive(type);

  // 헬스 탭 최초 진입 시 타이머 시작 (사용자 명시 액션으로 간주)
  if (type === 'gym' && !isReclick) {
    wtStartWorkoutTimer();
    wtRestTimerShowIdle();
  }
};

// 레거시 호환 — 기존 index.html의 onclick이 wtToggleType을 부를 수 있으니 alias
window.wtToggleType = window.wtSwitchType;

window._wtSetActiveType = function(type) {
  if (!_WT_TYPE_SECTIONS[type]) type = 'gym';
  _wtActiveType = type;
  _applyActive(type);
};

window._wtResetFlowUI = function() {
  _wtActiveType = 'gym';
  _applyActive('gym');
  wtRestTimerHideIdle();
  Object.keys(_WT_TYPE_SECTIONS).forEach(t => {
    document.getElementById('wt-chip-' + t)?.classList.remove('has-record');
  });
};

// 레거시 호환: load.js 이전 버전이 호출하던 함수
window._wtRestoreTypes = function(types) {
  if (!Array.isArray(types) || types.length === 0) return;
  const first = types.find(t => _WT_TYPE_SECTIONS[t]) || 'gym';
  _wtActiveType = first;
  _applyActive(first);
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

// ── AI 추정 전용 업로드 ─────────────────────────────────────────
// 일반 사진 업로드와 분리. AI 버튼을 통해서만 트리거.
// 흐름: 파일 → base64 → 사진 표시 + 백그라운드 AI 분석 배너
window.uploadMealPhotoAI = async function(meal, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const { imageToBase64 } = await import('./data.js');
    const cnt = Object.values(window._mealPhotos || {}).filter(Boolean).length;
    const maxDim = cnt <= 1 ? 800 : cnt <= 2 ? 720 : 640;
    const quality = cnt <= 1 ? 0.75 : cnt <= 2 ? 0.7 : 0.65;
    const b64 = await imageToBase64(file, maxDim, quality);
    const dataUrl = 'data:image/jpeg;base64,' + b64;

    // 1) 사진은 바로 끼니에 표시 (일반 사진 업로드와 동일한 시각 UX)
    window._mealPhotos = window._mealPhotos || {};
    window._mealPhotos[meal] = dataUrl;
    const { _renderMealPhotos } = await import('./render-workout.js');
    _renderMealPhotos();

    // 2) AI 추정 배너 시작 (pending → preview/error)
    const { startAIEstimate } = await import('./modals/ai-estimate-banner.js');
    startAIEstimate(meal, dataUrl);

    // 3) 사진 자체는 서버에 저장 (AI 확정 전에도 사진은 보존)
    const { saveWorkoutDay } = await import('./render-workout.js');
    saveWorkoutDay().catch(e => console.error('Auto-save after AI photo upload:', e));
  } catch (e) {
    console.error('[uploadMealPhotoAI] error:', e);
    try {
      const { showToast } = await import('./home/utils.js');
      showToast('사진 업로드 실패: ' + (e?.message || e), 2500, 'error');
    } catch {}
  }
  input.value = '';
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
