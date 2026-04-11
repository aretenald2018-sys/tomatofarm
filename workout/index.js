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
         wtFinishWorkout,
         wtRestTimerStart, wtRestTimerSkip, wtRestTimerAdjust,
         wtRestTimerShowIdle, wtRestTimerHideIdle }
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
         wtResetWorkoutTimer, wtFinishWorkout,
         wtRestTimerStart, wtRestTimerSkip,
         wtRestTimerAdjust, wtRestTimerShowIdle,
         wtRestTimerHideIdle }                    from './timers.js';
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
window.wtRestTimerStart = wtRestTimerStart;
window.wtRestTimerSkip = wtRestTimerSkip;
window.wtRestTimerAdjust = wtRestTimerAdjust;
window.wtRestTimerShowIdle = wtRestTimerShowIdle;
window.wtRestTimerHideIdle = wtRestTimerHideIdle;
window.wtAddFoodItem = wtAddFoodItem;
window.wtRemoveFoodItem = wtRemoveFoodItem;

// ── 초기화 (모듈 로드 시 이벤트 바인딩) ─────────────────────────
setTimeout(_initRestTimerPresets, 0);
setTimeout(_initRunningEvents, 0);
setTimeout(_initTypeFormEvents, 0);
