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

export { wtToggleWineFree, wtToggleMealSkipped }
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
import { wtToggleMealSkipped }                     from './status.js';
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
import { confirmAction }                           from '../utils/confirm-modal.js';
import { S }                                       from './state.js';
import { dateKey }                                 from '../data.js';

// ── window.* 등록 (HTML onclick 연결) ───────────────────────────
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

// 운동종료 → 확인 모달 → 실제 타이머 정지/저장 + 주간 인사이트(Scene 13) 모달 연결.
// 실수 방지를 위해 confirm 모달을 먼저 띄우고, 승인 시에만 종료 흐름을 실행.
// 2026-04-19: wtFinishWorkout 의 저장 Promise를 **반드시 await** 한 뒤 insightsOpen 호출.
// 배경: 직전까지는 fire-and-forget 이었고, _cache[key]=data 가 동기 경로에서 먼저
// 갱신되기는 하나, 저장이 완료되기 전에 insights 모달이 렌더되면 '이번 주 · 부위별
// 자극 균형'/'주요 종목 추세' 가 당일 기록을 누락한 채 계산되는 회귀가 재현됐음
// (사용자 리포트 2026-04-19 "여전히 반영이 되지 않는 버그"). 저장 완료 후 열도록 변경.
window.wtEndAndShowInsights = async () => {
  const ok = await confirmAction({
    title: '운동을 종료할까요?',
    message: '타이머가 정지되고 오늘 기록이 저장돼요.\n이번 주 인사이트를 바로 확인할 수 있어요.',
    confirmLabel: '종료',
    cancelLabel: '취소',
  });
  if (!ok) return;
  // 저장이 끝난 뒤에만 insights 열기 — 당일 기록이 cache/Firestore에 확실히 반영된 상태.
  // 2026-04-20: 저장 실패 시 인사이트 모달을 열지 않는다 (Codex 지적 #1).
  //             실패하면 save.js에서 이미 error toast를 띄웠으므로 여기서는 조용히 종료.
  // 2026-04-20: 세션 날짜(sessionKey)를 insightsOpen 에 전달 (Codex 지적 #2).
  //             TODAY 고정값 대신 사용자가 기록한 실제 날짜로 주/오늘 범위 계산.
  //             과거 날짜 편집이나 자정을 넘긴 세션에서도 정확히 반영.
  const sessionKey = S.shared.date ? dateKey(S.shared.date.y, S.shared.date.m, S.shared.date.d) : null;
  try {
    const savePromise = wtFinishWorkout();
    if (savePromise && typeof savePromise.then === 'function') {
      await savePromise;
    }
  } catch (e) {
    console.warn('[wtEndAndShowInsights.finish] 저장 실패 — 인사이트 모달 열지 않음:', e);
    return;
  }
  try {
    if (typeof window.insightsOpen === 'function') await window.insightsOpen(sessionKey);
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
