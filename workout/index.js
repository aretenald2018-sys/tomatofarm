import { showToast } from '../ui/toast.js';
// ================================================================
// workout/index.js — 오케스트레이터: re-export + window.* 등록
// ================================================================

// ── 테스트모드 v2 성장 보드 진입 카드 (side-effect: #tm2-entry 렌더) ──
export { tm2RenderEntry } from './test-v2/entry.js';

// ── 서브모듈 import ─────────────────────────────────────────────
import { loadWorkoutDate, changeWorkoutDate, goToTodayWorkout }
  from './load.js';

export { loadWorkoutDate, changeWorkoutDate, goToTodayWorkout };

export { saveWorkoutDay }
  from './save.js';

export { renderCalorieTracker, _renderMealPhotos,
         wtAddFoodItem, wtRemoveFoodItem,
         wtAddFrequentFoodSuggestion,
         openNutritionPhotoUpload }
  from './render.js';

export { wtToggleWineFree, wtToggleMealSkipped }
  from './status.js';

export { wtAddSet, wtRemoveSet, wtUpdateSet,
         wtToggleSetDone, wtUpdateSetType, wtMoveSet,
         wtRemoveExerciseEntry,
         wtFocusWorkoutEntryCard,
         wtOpenExercisePicker, wtCloseExercisePicker,
         wtHandleExercisePickerBack,
         wtOpenExerciseEditor, wtCloseExerciseEditor,
         wtSaveExerciseFromEditor, wtDeleteExerciseFromEditor,
         wtOpenManualCardioInput }
  from './exercises.js';

export { wtStartWorkoutTimer, wtPauseWorkoutTimer,
         wtResetWorkoutTimer, wtTogglePauseWorkoutTimer,
         wtFinishWorkout, wtRecoverTimers,
         wtRestTimerStart, wtRestTimerSkip, wtRestTimerAdjust,
         wtRestTimerShowIdle, wtRestTimerHideIdle,
         wtOpenRestPresetSheet }
  from './timers.js';

export { initRunningSession, wtMountRunningSession, wtOpenRunningSession, wtHandleRunningSessionBack, wtRestoreRunningSessionIfActive, configureRunningWeightProvider }
  from './running-session.js';

// ── 내부 import (초기화 + 도메인 브리지 구성용) ────────────────────
import { saveWorkoutDay }                          from './save.js';
import { S }                                       from './state.js';
import { wtFocusWorkoutEntryCard }                 from './exercises.js';
import { wtFinishWorkout }                         from './timers.js';
import { _initRestTimerPresets }                   from './timers.js';
import { _initTypeFormEvents }                     from './activity-forms.js';
import { initRunningSession, configureRunningWeightProvider } from './running-session.js';
import { configureWearWorkoutBridge, initWearWorkoutBridge } from './wear-bridge.js';
import { initWearStrengthContextSync } from './wear-strength-context.js';
import { confirmAction }                           from '../utils/confirm-modal.js';
import { getDay, getLatestCheckinWeight }          from '../data.js';

configureRunningWeightProvider(getLatestCheckinWeight);
configureWearWorkoutBridge({
  state: S,
  loadWorkoutDate,
  saveWorkoutDay,
  focusEntry: wtFocusWorkoutEntryCard,
  getDay,
  getRunningWeightKg: getLatestCheckinWeight,
});

// 운동종료 → 확인 모달 → 실제 타이머 정지/저장.
// 실수 방지를 위해 confirm 모달을 먼저 띄우고, 승인 시에만 종료 흐름을 실행.
// 통계성 완료 인사이트는 전체통계의 기간별 운동 분석으로 통합한다.
export async function wtEndAndShowInsights() {
  const ok = await confirmAction({
    title: '운동을 종료할까요?',
    message: '타이머가 정지되고 오늘 기록이 저장돼요.\n운동 분석은 통계 탭에서 기간별로 확인할 수 있어요.',
    confirmLabel: '종료',
    cancelLabel: '취소',
  });
  if (!ok) return;
  try {
    const savePromise = wtFinishWorkout();
    if (savePromise && typeof savePromise.then === 'function') {
      await savePromise;
    }
  } catch (e) {
    console.warn('[wtEndAndShowInsights.finish] 저장 실패:', e);
    return;
  }
  if (typeof showToast === 'function') {
    showToast('운동 기록 저장 완료. 통계 탭에서 기간별로 확인하세요.', 2200, 'success');
  }
}
// ── 초기화 (모듈 로드 시 이벤트 바인딩) ─────────────────────────
setTimeout(_initRestTimerPresets, 0);
setTimeout(_initTypeFormEvents, 0);
setTimeout(initRunningSession, 0);
setTimeout(initWearWorkoutBridge, 0);
setTimeout(initWearStrengthContextSync, 0);
