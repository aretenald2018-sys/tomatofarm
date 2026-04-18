// ================================================================
// workout/status.js — 상태 토글 (헬스/CF/스트레칭/수영/런닝/와인/굶음)
// ================================================================

import { S }              from './state.js';
import { saveWorkoutDay } from './save.js';
import { _renderStretchingToggle, _renderWineFreeToggle,
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

// cf/stretching/swimming/running boolean은 save 시점에 _autoDeriveActivityFlags()가
// 각 탭의 입력 데이터 유무로 자동 판정 → 수동 토글 API 삭제.
// 이중 진실원 제거(codex review).

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

// 호환용 no-op: 삭제된 랜딩의 이벤트 위임 유지 비용 회피
let _eventsBound = false;
export function _initButtonEventListeners() {
  if (_eventsBound) return;
  _eventsBound = true;
}
