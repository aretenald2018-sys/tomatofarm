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

const _BULK_AI_LABELS = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
};

let _bulkAISelection = [];

function _prefixForMeal(meal) {
  return meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
}

function _foodKeyForMeal(meal) {
  return meal === 'breakfast' ? 'bFoods' : meal === 'lunch' ? 'lFoods' : meal === 'dinner' ? 'dFoods' : 'sFoods';
}

function _bulkDateKeyFromState(S) {
  const date = S?.shared?.date;
  if (!date) return '';
  return `${date.y}-${String(date.m + 1).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

function _setBulkAIStatus(message, type = 'info') {
  const el = document.getElementById('diet-bulk-ai-status');
  if (!el) return;
  el.textContent = message || '';
  el.dataset.type = type;
}

function _syncBulkAIChips() {
  document.querySelectorAll('.diet-bulk-ai-chip').forEach(chip => {
    const active = _bulkAISelection.includes(chip.dataset.meal);
    chip.classList.toggle('active', active);
    chip.dataset.order = active ? String(_bulkAISelection.indexOf(chip.dataset.meal) + 1) : '';
  });
}

async function _applyBulkMealEstimate(meal, estimate) {
  const { S } = await import('./workout/state.js');
  const { _renderMealFoodItems, _renderDietResults } = await import('./workout/render.js');
  const mealKey = _foodKeyForMeal(meal);
  const prefix = _prefixForMeal(meal);
  const aiFoods = (estimate.detectedItems || []).map(it => ({
    name: it.name,
    grams: it.grams || 0,
    kcal: it.kcal || 0,
    protein: it.protein || 0,
    carbs: it.carbs || 0,
    fat: it.fat || 0,
    source: 'ai',
  }));

  const preserved = (S.diet[mealKey] || []).filter(f => f.source !== 'ai');
  S.diet[mealKey] = [...preserved, ...aiFoods];
  const foods = S.diet[mealKey];
  S.diet[`${prefix}Kcal`] = Math.round(foods.reduce((s, f) => s + (f.kcal || 0), 0));
  S.diet[`${prefix}Protein`] = Math.round(foods.reduce((s, f) => s + (f.protein || 0), 0) * 10) / 10;
  S.diet[`${prefix}Carbs`] = Math.round(foods.reduce((s, f) => s + (f.carbs || 0), 0) * 10) / 10;
  S.diet[`${prefix}Fat`] = Math.round(foods.reduce((s, f) => s + (f.fat || 0), 0) * 10) / 10;
  S.diet[`${prefix}Ok`] = true;
  S.diet[`${prefix}Reason`] = `AI: ${S.diet[`${prefix}Kcal`]}kcal (단${Math.round(S.diet[`${prefix}Protein`])}g 탄${Math.round(S.diet[`${prefix}Carbs`])}g 지${Math.round(S.diet[`${prefix}Fat`])}g)`;
  S.diet[`${prefix}EstimateMeta`] = {
    plateType: estimate.plateType,
    confidence: estimate.confidence,
    priorApplied: !!estimate.priorApplied,
    portionApplied: 'normal',
    excludes: [],
    swaps: [],
    bulkApplied: true,
    createdAt: Date.now(),
  };

  _renderMealFoodItems(meal);
  _renderDietResults();
}

window.openBulkMealAI = function() {
  const panel = document.getElementById('diet-bulk-ai-panel');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) _setBulkAIStatus('');
};

window.toggleBulkMealAIChip = function(chip) {
  const meal = chip?.dataset?.meal;
  if (!_BULK_AI_LABELS[meal]) return;
  if (_bulkAISelection.includes(meal)) {
    _bulkAISelection = _bulkAISelection.filter(m => m !== meal);
  } else {
    _bulkAISelection.push(meal);
  }
  _syncBulkAIChips();
};

window.runBulkMealAIUpload = async function(input) {
  const files = Array.from(input.files || []);
  const meals = [..._bulkAISelection];
  if (!meals.length) {
    window.showToast?.('끼니 칩을 먼저 선택해주세요', 2200, 'warning');
    input.value = '';
    return;
  }
  if (files.length !== meals.length) {
    window.showToast?.(`선택한 칩 ${meals.length}개와 사진 ${files.length}개가 맞지 않아요`, 3200, 'warning');
    _setBulkAIStatus('선택한 칩 수와 사진 수를 맞춰주세요.', 'warning');
    input.value = '';
    return;
  }

  const uploadBtn = document.querySelector('.diet-bulk-ai-upload');
  if (uploadBtn) uploadBtn.disabled = true;
  _setBulkAIStatus(`${meals.length}개 사진 분석 중...`, 'info');

  try {
    const { imageToBase64 } = await import('./data.js');
    const { runAIEstimate } = await import('./workout/ai-estimate.js');
    const { _renderMealPhotos } = await import('./render-workout.js');
    const { _autoSaveDiet } = await import('./workout/save.js');
    const { S } = await import('./workout/state.js');
    const startDateKey = _bulkDateKeyFromState(S);

    window._mealPhotos = window._mealPhotos || {};
    for (let i = 0; i < meals.length; i++) {
      const meal = meals[i];
      if (startDateKey && startDateKey !== _bulkDateKeyFromState(S)) {
        throw new Error('날짜가 바뀌어 일괄 등록을 중단했어요');
      }
      _setBulkAIStatus(`${_BULK_AI_LABELS[meal]} 분석 중 (${i + 1}/${meals.length})`, 'info');
      const b64 = await imageToBase64(files[i], 800, 0.75);
      const dataUrl = 'data:image/jpeg;base64,' + b64;
      window._mealPhotos[meal] = dataUrl;
      _renderMealPhotos();
      const estimate = await runAIEstimate(b64);
      if (startDateKey && startDateKey !== _bulkDateKeyFromState(S)) {
        throw new Error('날짜가 바뀌어 일괄 등록을 중단했어요');
      }
      await _applyBulkMealEstimate(meal, estimate);
      await _autoSaveDiet();
    }

    await _autoSaveDiet();
    _setBulkAIStatus(`${meals.length}개 끼니가 자동 등록됐어요.`, 'success');
    window.showToast?.('일괄 AI 식단 등록 완료', 2500, 'success');
    _bulkAISelection = [];
    _syncBulkAIChips();
  } catch (e) {
    console.error('[runBulkMealAIUpload] error:', e);
    _setBulkAIStatus('분석 실패: ' + (e?.message || e), 'error');
    window.showToast?.('일괄 등록 실패: ' + (e?.message || e), 3500, 'error');
  } finally {
    if (uploadBtn) uploadBtn.disabled = false;
    input.value = '';
  }
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
