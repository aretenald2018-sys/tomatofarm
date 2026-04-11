// ================================================================
// render-workout.js — 심(shim): workout/ 디렉토리로 분할됨
// ================================================================
export {
  loadWorkoutDate, changeWorkoutDate, goToTodayWorkout,
  saveWorkoutDay,
  renderCalorieTracker, _renderMealPhotos, openNutritionPhotoUpload,
  wtAddFoodItem, wtRemoveFoodItem,
  wtSetGymStatus, wtSetCFStatus,
  wtToggleStretching, wtToggleSwimming, wtToggleRunning,
  wtToggleWineFree, wtToggleMealSkipped,
  wtAddSet, wtRemoveSet, wtUpdateSet,
  wtToggleSetDone, wtUpdateSetType, wtMoveSet,
  wtRemoveExerciseEntry,
  wtOpenExercisePicker, wtCloseExercisePicker,
  wtOpenExerciseEditor, wtCloseExerciseEditor,
  wtSaveExerciseFromEditor, wtDeleteExerciseFromEditor,
  wtStartWorkoutTimer, wtPauseWorkoutTimer,
  wtResetWorkoutTimer, wtTogglePauseWorkoutTimer,
  wtFinishWorkout,
  wtRestTimerStart, wtRestTimerSkip, wtRestTimerAdjust,
  wtRestTimerShowIdle, wtRestTimerHideIdle,
} from './workout/index.js';
