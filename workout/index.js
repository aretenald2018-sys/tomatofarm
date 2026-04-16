// ================================================================
// workout/index.js — 오케스트레이터: re-export + window.* 등록
// ================================================================

// ── 서브모듈 import ─────────────────────────────────────────────
export { loadWorkoutDate, changeWorkoutDate, goToTodayWorkout }
  from './load.js';

export { saveWorkoutDay }
  from './save.js';

export { renderCalorieTracker, _renderMealPhotos,
         wtAddFoodItem, wtRemoveFoodItem,
         openNutritionPhotoUpload }
  from './render.js';

export { wtSetGymStatus, wtSetCFStatus,
         wtToggleStretching, wtToggleSwimming, wtToggleRunning,
         wtToggleWineFree, wtToggleMealSkipped }
  from './status.js';

export { wtAddSet, wtRemoveSet, wtUpdateSet,
         wtToggleSetDone, wtUpdateSetType, wtMoveSet,
         wtRemoveExerciseEntry,
         wtOpenExercisePicker, wtCloseExercisePicker,
         wtOpenExerciseEditor, wtCloseExerciseEditor,
         wtSaveExerciseFromEditor, wtDeleteExerciseFromEditor }
  from './exercises.js';

export { wtStartWorkoutTimer, wtPauseWorkoutTimer,
         wtResetWorkoutTimer, wtTogglePauseWorkoutTimer,
         wtFinishWorkout, wtRecoverTimers,
         wtRestTimerStart, wtRestTimerSkip, wtRestTimerAdjust,
         wtRestTimerShowIdle, wtRestTimerHideIdle,
         wtOpenRestPresetSheet }
  from './timers.js';

// ── 내부 import (window 등록 + 초기화용) ─────────────────────────
import { saveWorkoutDay }                          from './save.js';
import { wtAddFoodItem, wtRemoveFoodItem }         from './render.js';
import { wtSetGymStatus, wtSetCFStatus,
         wtToggleMealSkipped }                     from './status.js';
import { wtOpenExercisePicker, wtCloseExercisePicker,
         wtOpenExerciseEditor, wtCloseExerciseEditor,
         wtSaveExerciseFromEditor,
         wtDeleteExerciseFromEditor }              from './exercises.js';
import { wtStartWorkoutTimer, wtTogglePauseWorkoutTimer,
         wtResetWorkoutTimer, wtFinishWorkout, wtRecoverTimers,
         wtRestTimerStart, wtRestTimerSkip,
         wtRestTimerAdjust, wtRestTimerShowIdle,
         wtRestTimerHideIdle, wtOpenRestPresetSheet } from './timers.js';
import { _initRestTimerPresets }                   from './timers.js';
import { _initRunningEvents }                      from './activity-forms.js';
import { _initTypeFormEvents }                     from './activity-forms.js';

// ── window.* 등록 (HTML onclick 연결) ───────────────────────────
window.wtSetGymStatus = wtSetGymStatus;
window.wtSetCFStatus = wtSetCFStatus;
window.wtToggleMealSkipped = wtToggleMealSkipped;
window.saveWorkoutDay = saveWorkoutDay;
window.wtOpenExercisePicker = wtOpenExercisePicker;
window.wtCloseExercisePicker = wtCloseExercisePicker;
window.wtOpenExerciseEditor = wtOpenExerciseEditor;
window.wtCloseExerciseEditor = wtCloseExerciseEditor;
window.wtSaveExerciseFromEditor = wtSaveExerciseFromEditor;
window.wtDeleteExerciseFromEditor = wtDeleteExerciseFromEditor;
window.wtStartWorkoutTimer = wtStartWorkoutTimer;
window.wtTogglePauseWorkoutTimer = wtTogglePauseWorkoutTimer;
window.wtResetWorkoutTimer = wtResetWorkoutTimer;
window.wtFinishWorkout = wtFinishWorkout;
window.wtRecoverTimers = wtRecoverTimers;

// 운동종료 → 실제 타이머 정지/저장 + 주간 인사이트(Scene 13) 모달 연결.
// wtFinishWorkout만 부르면 UI 의도와 맞지 않고, insightsOpen만 부르면 타이머가 계속 감.
window.wtEndAndShowInsights = () => {
  try { wtFinishWorkout(); } catch (e) { console.warn('[wtEndAndShowInsights.finish]:', e); }
  try {
    if (typeof window.insightsOpen === 'function') window.insightsOpen();
  } catch (e) { console.warn('[wtEndAndShowInsights.insights]:', e); }
};
window.wtRestTimerStart = wtRestTimerStart;
window.wtRestTimerSkip = wtRestTimerSkip;
window.wtRestTimerAdjust = wtRestTimerAdjust;
window.wtRestTimerShowIdle = wtRestTimerShowIdle;
window.wtRestTimerHideIdle = wtRestTimerHideIdle;
window.wtOpenRestPresetSheet = wtOpenRestPresetSheet;
window.wtAddFoodItem = wtAddFoodItem;
window.wtRemoveFoodItem = wtRemoveFoodItem;

// ── 초기화 (모듈 로드 시 이벤트 바인딩) ─────────────────────────
setTimeout(_initRestTimerPresets, 0);
setTimeout(_initRunningEvents, 0);
setTimeout(_initTypeFormEvents, 0);
