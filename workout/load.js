import { showToast } from '../ui/toast.js';
import { clearAllForDateChange } from '../modals/ai-estimate-banner.js';
// ================================================================
// workout/load.js — 날짜 로드, 상태 복원
// 2026-04-21: S.workout / S.diet / S.shared 네임스페이스 마이그레이션 완료.
// ================================================================

import { S, patchWorkoutState, replaceDietState, setWorkoutDateState }
                                     from './state.js';
import { _renderDateLabel,
         _renderStretchingToggle, _renderWineFreeToggle,
         _renderMealSkippedToggles, _renderDietResults,
         _renderMealFoodItems, _renderMealPhotos,
         renderCalorieTracker, bindDietFoodActions }
                                     from './render.js';
import { _renderWorkoutTimer, _renderTimerControls,
         _fmtDuration, wtRestTimerSkip, _isViewingTimerDate,
         wtApplyActiveWorkoutDraft, wtPersistActiveWorkoutDraft,
         wtCheckWorkoutIdleLimit }
                                     from './timers.js';
import { _renderCfForm,
         _renderStretchForm, _renderSwimForm }
                                     from './activity-forms.js';
import { _initButtonEventListeners } from './status.js';
import { resetWorkoutTypeUi, setActiveWorkoutType } from './type-ui.js';
import { _renderExerciseList }       from './exercises.js';
import { getDay, isFuture, TODAY, isExpertModeEnabled, getExpertPreset, dateKey } from '../data.js';
import { getWorkoutSessions } from './sessions.js';
import { dietStateFromDay, workoutStateFromSession } from './session-hydration.js';
import { replaceDietPhotos } from '../diet/photo-store.js';

function _isActualWorkoutSet(set) {
  if (!set || set.setType === 'warmup') return false;
  if (set.done === true) return true;
  if (set.done === false) return false;
  return (Number(set.kg) || 0) > 0 && (Number(set.reps) || 0) > 0;
}

function _isActualWorkoutEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if ((entry.note || '').toString().trim()) return true;
  return (entry.sets || []).some(_isActualWorkoutSet);
}

function _isMaxDraftEntry(entry) {
  return !!(entry && (
    entry.recommendationMeta?.mode === 'max' ||
    entry.maxPrescription ||
    entry.maxWeakPart
  ));
}

function _normalizeLoadedMaxMeta(day, key) {
  const raw = day?.maxMeta && typeof day.maxMeta === 'object'
    ? JSON.parse(JSON.stringify(day.maxMeta))
    : null;
  if (!raw) return { meta: null, rejectedLegacy: false };
  if (raw.dateKey && raw.dateKey !== key) return { meta: null, rejectedLegacy: false };

  const hasActualWorkout = (day?.exercises || []).some(_isActualWorkoutEntry)
    || !!(day?.cf || day?.stretching || day?.swimming || day?.running)
    || (Number(day?.workoutDuration) || 0) > 0
    || (Number(day?.runDistance) || 0) > 0
    || (Number(day?.swimDistance) || 0) > 0;
  const weakBlock = raw.weakBlock || {};
  const weakSummary = raw.weakSummary || {};
  const hasWeakWork = (Number(weakBlock.durationSec) || 0) > 0
    || !!weakBlock.activeStartedAt
    || (Number(weakSummary.sets) || 0) > 0
    || (Number(weakSummary.volume) || 0) > 0;
  const hasLegacySelection = !raw.dateKey && (
    (Array.isArray(raw.selectedMajors) && raw.selectedMajors.length > 0) ||
    (Array.isArray(raw.selectedWeakParts) && raw.selectedWeakParts.length > 0)
  );
  if (hasLegacySelection && !hasActualWorkout && !hasWeakWork) {
    return { meta: null, rejectedLegacy: true };
  }

  if (!raw.dateKey) raw.dateKey = key;
  return { meta: raw, rejectedLegacy: false };
}

function _restoreWorkoutExercises(day, rejectedLegacyMaxMeta) {
  const exercises = JSON.parse(JSON.stringify(day.exercises || []));
  if (!rejectedLegacyMaxMeta) return exercises;
  return exercises.filter(entry => _isActualWorkoutEntry(entry) || !_isMaxDraftEntry(entry));
}

function _recoverWorkoutIdleLimit(context) {
  wtCheckWorkoutIdleLimit().catch(e => console.error(`[workout idle ${context}] error:`, e));
}

// ── 날짜 로드 ────────────────────────────────────────────────────
export function loadWorkoutDate(y, m, d, options = {}) {
  const cur = S.shared.date;
  const isSameDate = cur && cur.y === y && cur.m === m && cur.d === d;
  const requested = Number(options?.sessionIndex);
  const requestedSessionIndex = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : null;
  const targetSessionIndex = requestedSessionIndex ?? (isSameDate ? Math.max(0, Number(S.workout.sessionIndex) || 0) : 0);

  if (isSameDate && targetSessionIndex === (Number(S.workout.sessionIndex) || 0)) {
    // Today is commonly loaded before the diet tab is opened. Keep the
    // panel-local food handlers available even when no date hydration runs.
    bindDietFoodActions();
    _renderDateLabel();
    _renderExerciseList();
    _renderWorkoutTimer();
    _renderTimerControls();
    _renderDietResults();
    renderCalorieTracker();
    _renderMealPhotos();
    _recoverWorkoutIdleLimit('same-date load');
    return;
  }

  resetWorkoutTypeUi();

  // 날짜가 실제로 바뀔 때 진행 중인 AI 추정 배너/상태를 모두 정리.
  try { clearAllForDateChange(); } catch (e) { console.warn('[aiEstimateClearAll]', e); }

  setWorkoutDateState({ y, m, d });
  const currentKey = dateKey(y, m, d);
  const day  = getDay(y, m, d);
  const sessions = getWorkoutSessions(day, { minCount: targetSessionIndex + 1 });
  const draftResult = wtApplyActiveWorkoutDraft(sessions[targetSessionIndex] || sessions[0] || {}, {
    date: { y, m, d },
    sessionIndex: targetSessionIndex,
  });
  const workoutSource = draftResult.source;
  const loadedMax = _normalizeLoadedMaxMeta(workoutSource, currentKey);

  const _preset = getExpertPreset();
  const w = patchWorkoutState(workoutStateFromSession(workoutSource, {
    sessionIndex: targetSessionIndex,
    exercises: _restoreWorkoutExercises(workoutSource, loadedMax.rejectedLegacy),
    maxMeta: loadedMax.meta,
    currentGymId: workoutSource.gymId || (isExpertModeEnabled() ? (_preset.currentGymId || null) : null),
  }));

  // ⚠️ 스톱워치(S.workout.workoutStartTime/workoutTimerInterval/workoutTimerDate)는
  // 끝내기/리셋 전에는 절대 멈추면 안 됨. 여기서는 건드리지 않는다.
  // running 상태의 cross-day 복원은 wtRecoverTimers() 가 _settings/active_timer 를
  // 통해 수행 — 날짜 네비게이션과 무관하게 동작한다.
  //
  // 2026-04-20: rest 타이머는 위 `isSameDate` early-return 경로에선 건드리지 않는다.
  //   여기(=실제 날짜 변경) 만 skip — 이전 날짜의 세트 간 휴식이 새 날짜로 이어지면
  //   쉬는시간 개념이 깨지므로. 같은 날짜 autoSave/재렌더에서는 rest 유지.
  wtRestTimerSkip();
  const timerControls = document.querySelector('.wt-timer-controls');
  if (timerControls) timerControls.style.display = '';
  const timerText = document.getElementById('wt-workout-timer');
  if (timerText) timerText.style.display = '';
  const resultEl = document.getElementById('wt-workout-duration-result');
  if (resultEl) resultEl.style.display = 'none';

  // 식단 도메인 복원 — DOM과 무관한 hydration 모델을 통해 in-place 교체한다.
  replaceDietState(dietStateFromDay(day));

  replaceDietPhotos({
    ...(day.bPhoto ? { breakfast: day.bPhoto } : {}),
    ...(day.lPhoto ? { lunch: day.lPhoto } : {}),
    ...(day.dPhoto ? { dinner: day.dPhoto } : {}),
    ...(day.sPhoto ? { snack: day.sPhoto } : {}),
    ...(workoutSource.workoutPhoto ? { workout: workoutSource.workoutPhoto } : {}),
  });

  _renderDateLabel();
  _renderStretchingToggle();
  document.getElementById('wt-chip-swimming')?.classList.toggle('active', w.swimming);
  document.getElementById('wt-chip-running')?.classList.toggle('has-record', w.running);
  _renderCfForm();
  _renderStretchForm();
  _renderSwimForm();
  _renderWorkoutTimer();
  _renderTimerControls();
  _renderWineFreeToggle();
  _renderMealSkippedToggles();
  _initButtonEventListeners();
  bindDietFoodActions();
  _renderExerciseList();
  _renderMealFoodItems('breakfast');
  _renderMealFoodItems('lunch');
  _renderMealFoodItems('dinner');
  _renderMealFoodItems('snack');
  _renderDietResults();
  _renderMealPhotos();

  const memoEl = document.getElementById('wt-workout-memo');
  if (memoEl) {
    memoEl.value = workoutSource.memo || '';
    if (memoEl.dataset.wtDraftBound !== '1') {
      memoEl.addEventListener('input', () => wtPersistActiveWorkoutDraft('memo input'));
      memoEl.dataset.wtDraftBound = '1';
    }
  }
  const bEl = document.getElementById('wt-meal-breakfast');
  const lEl = document.getElementById('wt-meal-lunch');
  const dEl = document.getElementById('wt-meal-dinner');
  const sEl = document.getElementById('wt-meal-snack');
  if (bEl) bEl.value = S.diet.breakfast;
  if (lEl) lEl.value = S.diet.lunch;
  if (dEl) dEl.value = S.diet.dinner;
  if (sEl) sEl.value = S.diet.snack;

  const isFutureDay = isFuture(y, m, d);
  _setInputsDisabled(isFutureDay);

  _restoreFlowState(workoutSource);
  if (draftResult.restored) {
    setTimeout(() => {
      showToast('진행 중이던 운동 기록을 복구했어요', 2200, 'success');
    }, 0);
  }
  _recoverWorkoutIdleLimit('date load');
}

function _restoreFlowState(day) {
  const timerBar = document.getElementById('wt-workout-timer-bar');

  const hasExercises  = (day.exercises || []).length > 0;
  const hasCf         = !!day.cf;
  const hasStretching = !!day.stretching;
  const hasSwimming   = !!day.swimming;
  const hasRunning    = !!day.running;

  const flags = {
    gym: hasExercises, cf: hasCf, stretch: hasStretching,
    swimming: hasSwimming, running: hasRunning,
  };
  Object.entries(flags).forEach(([t, on]) => {
    const chip = document.getElementById('wt-chip-' + t);
    if (!chip) return;
    chip.classList.toggle('has-record', on);
  });
  let active = 'gym';
  if (!hasExercises) {
    const firstWithRecord = Object.entries(flags).find(([, on]) => on);
    if (firstWithRecord) active = firstWithRecord[0];
  }
  if (active === 'running') active = 'gym';
  setActiveWorkoutType(active);

  // 2026-04-20: 타이머 바는 운동 탭에 있는 동안 **항상** 노출.
  const hasAnyRecord = hasExercises || hasCf || hasStretching || hasSwimming || hasRunning;
  if (timerBar) timerBar.classList.add('wt-open');
  if (hasAnyRecord) {
    document.getElementById('wt-memo-section')?.classList.add('wt-open');
    document.getElementById('wt-save-section')?.classList.add('wt-open');
  } else {
    document.getElementById('wt-memo-section')?.classList.remove('wt-open');
    document.getElementById('wt-save-section')?.classList.remove('wt-open');
  }

  // 2026-04-19: 타이머 컨트롤 노출 규칙 — 오늘 or 타이머 날짜.
  const date = S.shared.date;
  const isToday = date && date.y === TODAY.getFullYear() && date.m === TODAY.getMonth() && date.d === TODAY.getDate();
  const showControls = isToday || _isViewingTimerDate();
  if (!showControls && timerBar) {
    const controls = timerBar.querySelector('.wt-timer-controls');
    if (controls) controls.style.display = 'none';
    if (S.workout.workoutDuration > 0) {
      const resultEl = document.getElementById('wt-workout-duration-result');
      if (resultEl) { resultEl.textContent = `총 ${_fmtDuration(S.workout.workoutDuration)}`; resultEl.style.display = ''; }
      const timerText = document.getElementById('wt-workout-timer');
      if (timerText) timerText.style.display = 'none';
    }
  } else {
    _renderTimerControls();
  }
}

function _setInputsDisabled(disabled) {
  const panel = document.getElementById('tab-workout');
  if (!panel) return;
  panel.querySelectorAll('input, textarea, select, button').forEach(el => {
    if (el.classList.contains('wt-date-nav-btn')) return;
    if (el.classList.contains('wt-today-btn')) return;
    el.disabled = disabled;
  });
  panel.classList.toggle('wt-readonly', !!disabled);
  const notice = document.getElementById('wt-future-notice');
  if (notice) notice.style.display = disabled ? 'block' : 'none';
}

export function changeWorkoutDate(delta) {
  const date = S.shared.date;
  if (!date) return;
  const d = new Date(date.y, date.m, date.d + delta);
  loadWorkoutDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function goToTodayWorkout() {
  loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}
