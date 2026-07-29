// ================================================================
// workout/timers.js — 운동 타이머 + 세트 간 휴식 타이머
// ================================================================

import { S }                from './state.js';
import { saveWorkoutDay }   from './save.js';
import { showToast, showCenterToast } from '../ui/toast.js';
import { confirmAction }    from '../utils/confirm-modal.js';
import { getActiveTimer, saveActiveTimer, clearActiveTimer, getCurrentUser } from '../data.js';
import {
  buildWorkoutSetTimeline,
  closeWorkoutTimeline,
  clearWorkoutSetCompletedAt,
  MAX_WORKOUT_REST_GAP_SEC,
  syncWorkoutTimeline,
} from './timeline.js';
import { getDietPhoto } from '../diet/photo-store.js';

// running 타이머가 "이 정도 이상 방치되면 freak-out" 가드 (24h). active_timer 의
// startedAt 이 너무 오래되었다면 OS kill/탭 종료로 정산 못한 유령 세션으로 간주, 복원하지 않음.
const _MAX_LIVE_TIMER_MS = 24 * 60 * 60 * 1000;
const _MAX_ACTIVE_WORKOUT_DRAFT_MS = 30 * 60 * 60 * 1000;
const _GROWTH_BOARD_AUTO_MAX_SEC = 2 * 60 * 60;
const _GROWTH_BOARD_AUTO_GRACE_MS = 10 * 60 * 1000;
const _WORKOUT_IDLE_LIMIT_MS = MAX_WORKOUT_REST_GAP_SEC * 1000;

let _workoutIdleFinishTimeout = null;
let _workoutIdleFinishPromise = null;

function _normalizeTimerDate(date) {
  if (!date || typeof date !== 'object') return null;
  const y = Number(date.y);
  const m = Number(date.m);
  const d = Number(date.d);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y: Math.trunc(y), m: Math.trunc(m), d: Math.trunc(d) };
}

function _todayTimerDate() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

function _currentWorkoutTimerDate() {
  return _normalizeTimerDate(S.shared.date) || _todayTimerDate();
}

function _sameTimerDate(a, b) {
  const da = _normalizeTimerDate(a);
  const db = _normalizeTimerDate(b);
  return !!da && !!db && da.y === db.y && da.m === db.m && da.d === db.d;
}

function _timerDateKey(date) {
  const d = _normalizeTimerDate(date);
  if (!d) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${d.y}-${pad(d.m + 1)}-${pad(d.d)}`;
}

function _ensureWorkoutTimerDate() {
  const current = _normalizeTimerDate(S.workout.workoutTimerDate);
  if (current) {
    S.workout.workoutTimerDate = current;
    return current;
  }
  if (!S.workout.workoutStartTime) return null;
  const fallback = _currentWorkoutTimerDate();
  S.workout.workoutTimerDate = fallback;
  return fallback;
}

function _ensureWorkoutTimerInterval() {
  if (!S.workout.workoutStartTime || S.workout.workoutTimerInterval) return;
  S.workout.workoutTimerInterval = setInterval(_renderWorkoutTimer, 1000);
}

function _activeTimerState() {
  if (!S.workout.workoutStartTime) return null;
  return {
    startedAt: S.workout.workoutStartTime,
    date: _ensureWorkoutTimerDate(),
  };
}

function _persistActiveTimerState(context) {
  const activeState = _activeTimerState();
  if (!activeState?.date) return;
  _lsWriteTimer(activeState);
  saveActiveTimer(activeState).catch(e => console.error(`[${context}] saveActiveTimer error:`, e));
}

// localStorage 백업(동기/로컬) — Firestore write 가 네트워크 실패했을 때의 안전망.
//   CLAUDE.md: localStorage 는 기기 단위이므로 유저별 키를 써서 다른 계정으로 로그인 시
//   유령 타이머가 살아나지 않게 한다.
const _LS_TIMER_KEY_PREFIX = 'tomatofarm_active_timer_';
const _LS_ACTIVE_WORKOUT_DRAFT_KEY_PREFIX = 'tomatofarm_active_workout_draft_';
const _LS_GROWTH_BOARD_TIMER_KEY_PREFIX = 'tomatofarm_growth_board_auto_timer_';
function _lsKey() {
  try {
    const u = getCurrentUser();
    const uid = (u && (u.uid || u.id || u.username)) || '_anon';
    return _LS_TIMER_KEY_PREFIX + uid;
  } catch { return _LS_TIMER_KEY_PREFIX + '_anon'; }
}
function _lsGrowthBoardTimerKey() {
  try {
    const u = getCurrentUser();
    const uid = (u && (u.uid || u.id || u.username)) || '_anon';
    return _LS_GROWTH_BOARD_TIMER_KEY_PREFIX + uid;
  } catch { return _LS_GROWTH_BOARD_TIMER_KEY_PREFIX + '_anon'; }
}
function _lsActiveWorkoutDraftKey() {
  try {
    const u = getCurrentUser();
    const uid = (u && (u.uid || u.id || u.username)) || '_anon';
    return _LS_ACTIVE_WORKOUT_DRAFT_KEY_PREFIX + uid;
  } catch { return _LS_ACTIVE_WORKOUT_DRAFT_KEY_PREFIX + '_anon'; }
}
function _lsWriteTimer(state) {
  try { localStorage.setItem(_lsKey(), JSON.stringify(state)); } catch {}
}
function _lsReadTimer() {
  try {
    const raw = localStorage.getItem(_lsKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _lsClearTimer() {
  try { localStorage.removeItem(_lsKey()); } catch {}
}
function _lsWriteActiveWorkoutDraft(state) {
  try { localStorage.setItem(_lsActiveWorkoutDraftKey(), JSON.stringify(state)); } catch {}
}
function _lsReadActiveWorkoutDraft() {
  try {
    const raw = localStorage.getItem(_lsActiveWorkoutDraftKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _lsClearActiveWorkoutDraft() {
  try { localStorage.removeItem(_lsActiveWorkoutDraftKey()); } catch {}
}
function _lsWriteGrowthBoardTimer(state) {
  try { localStorage.setItem(_lsGrowthBoardTimerKey(), JSON.stringify(state)); } catch {}
}
function _lsReadGrowthBoardTimer() {
  try {
    const raw = localStorage.getItem(_lsGrowthBoardTimerKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _lsClearGrowthBoardTimer() {
  try { localStorage.removeItem(_lsGrowthBoardTimerKey()); } catch {}
}
function _isValidActiveTimer(t) {
  const startedAt = Number(t?.startedAt);
  return !!t && Number.isFinite(startedAt) && startedAt > 0 &&
         (Date.now() - startedAt) < _MAX_LIVE_TIMER_MS &&
         !!_normalizeTimerDate(t.date);
}

let _lastRestoredDraftKey = null;

function _cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return fallback; }
}

function _readWorkoutMemoDraft() {
  if (typeof document === 'undefined') return '';
  const el = document.getElementById('wt-workout-memo');
  return el ? String(el.value || '').trim() : '';
}

function _sessionDateKey(date) {
  return _timerDateKey(date) || '';
}

function _sessionHasExerciseDraft(exercises) {
  return (Array.isArray(exercises) ? exercises : []).some(entry => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.exerciseId || entry.name || entry.note) return true;
    return Array.isArray(entry.sets) && entry.sets.length > 0;
  });
}

function _sessionHasDraftData(session = {}, draft = {}) {
  if (_sessionHasExerciseDraft(session.exercises)) return true;
  if (String(session.memo || '').trim()) return true;
  if (Number(session.workoutDuration) > 0) return true;
  if (draft.workoutStartTime) return true;
  if (session.cf || session.stretching || session.swimming || session.running) return true;
  if (Number(session.runDistance) > 0 || Number(session.runDurationMin) > 0 || Number(session.runDurationSec) > 0) return true;
  if (Array.isArray(session.runRoute) && session.runRoute.length > 0) return true;
  if (Number(session.cfDurationMin) > 0 || Number(session.cfDurationSec) > 0 || String(session.cfWod || '').trim()) return true;
  if (Number(session.stretchDuration) > 0 || String(session.stretchMemo || '').trim()) return true;
  if (Number(session.swimDistance) > 0 || Number(session.swimDurationMin) > 0 || Number(session.swimDurationSec) > 0) return true;
  if (session.workoutPhoto) return true;
  const weakBlock = session.maxMeta?.weakBlock || {};
  if ((Number(weakBlock.durationSec) || 0) > 0 || weakBlock.activeStartedAt) return true;
  return false;
}

function _activeWorkoutSessionDraftPayload(memo) {
  const w = S.workout;
  return {
    id: w.sessionId || `session-${(Number(w.sessionIndex) || 0) + 1}`,
    label: `${(Number(w.sessionIndex) || 0) + 1}회차`,
    exercises: _cloneJson(w.exercises, []),
    cf: !!w.cf,
    stretching: !!w.stretching,
    swimming: !!w.swimming,
    running: !!w.running,
    runDistance: Number(w.runData?.distance) || 0,
    runDurationMin: Number(w.runData?.durationMin) || 0,
    runDurationSec: Number(w.runData?.durationSec) || 0,
    runMemo: String(w.runData?.memo || ''),
    runSource: String(w.runData?.source || 'manual'),
    runStartedAt: w.runData?.startedAt || null,
    runEndedAt: w.runData?.endedAt || null,
    runRoute: _cloneJson(w.runData?.route, []),
    runRouteSummary: _cloneJson(w.runData?.routeSummary, null),
    runPlaceSummary: _cloneJson(w.runData?.placeSummary, null),
    runAvgPaceSecPerKm: Number(w.runData?.avgPaceSecPerKm) || 0,
    runGpsAccuracySummary: _cloneJson(w.runData?.gpsAccuracySummary, null),
    cfWod: String(w.cfData?.wod || ''),
    cfDurationMin: Number(w.cfData?.durationMin) || 0,
    cfDurationSec: Number(w.cfData?.durationSec) || 0,
    cfMemo: String(w.cfData?.memo || ''),
    stretchDuration: Number(w.stretchData?.duration) || 0,
    stretchMemo: String(w.stretchData?.memo || ''),
    swimDistance: Number(w.swimData?.distance) || 0,
    swimDurationMin: Number(w.swimData?.durationMin) || 0,
    swimDurationSec: Number(w.swimData?.durationSec) || 0,
    swimStroke: String(w.swimData?.stroke || ''),
    swimMemo: String(w.swimData?.memo || ''),
    workoutDuration: Math.max(0, Math.floor(Number(w.workoutDuration) || 0)),
    workoutTimeline: _cloneJson(w.workoutTimeline, null),
    wine_free: !!w.wineFree,
    memo,
    workoutPhoto: getDietPhoto('workout'),
    gymId: w.currentGymId || null,
    pickerGymFilter: w.pickerGymFilter || null,
    routineMeta: _cloneJson(w.routineMeta, null),
    maxMeta: _cloneJson(w.maxMeta, null),
  };
}

function _normalizeActiveWorkoutDraft(draft) {
  if (!draft || typeof draft !== 'object') return null;
  const date = _normalizeTimerDate(draft.date);
  const session = draft.session && typeof draft.session === 'object' ? draft.session : null;
  const sessionIndex = Math.max(0, Math.floor(Number(draft.sessionIndex) || 0));
  const updatedAt = Number(draft.updatedAt);
  if (!date || !session || !Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  if ((Date.now() - updatedAt) > _MAX_ACTIVE_WORKOUT_DRAFT_MS) return null;
  const normalized = {
    version: 1,
    date,
    dateKey: draft.dateKey || _sessionDateKey(date),
    sessionIndex,
    sessionId: String(draft.sessionId || session.id || `session-${sessionIndex + 1}`),
    workoutStartTime: Number(draft.workoutStartTime) || null,
    workoutTimerDate: _normalizeTimerDate(draft.workoutTimerDate) || null,
    updatedAt,
    context: String(draft.context || ''),
    session,
  };
  if (!_sessionHasDraftData(normalized.session, normalized)) return null;
  return normalized;
}

function _readValidActiveWorkoutDraft() {
  const draft = _normalizeActiveWorkoutDraft(_lsReadActiveWorkoutDraft());
  if (!draft) {
    if (_lsReadActiveWorkoutDraft()) _lsClearActiveWorkoutDraft();
    return null;
  }
  return draft;
}

export function wtPersistActiveWorkoutDraft(context = 'manual') {
  const currentDate = _normalizeTimerDate(S.shared.date);
  const timerDate = _normalizeTimerDate(S.workout.workoutTimerDate);
  const existingDraft = _readValidActiveWorkoutDraft();
  const passiveContext = ['beforeunload', 'visibility hidden', 'external flush', 'status check'].includes(context);

  if (S.workout.workoutStartTime && timerDate) {
    _persistActiveTimerState(`draft ${context}`);
    if (currentDate && !_sameTimerDate(currentDate, timerDate)) {
      return _readValidActiveWorkoutDraft();
    }
  }

  const date = currentDate || timerDate;
  if (!date) return null;
  if (passiveContext && !S.workout.workoutStartTime && !existingDraft) return null;

  const sessionIndex = Math.max(0, Math.floor(Number(S.workout.sessionIndex) || 0));
  const memo = _readWorkoutMemoDraft();
  const session = _activeWorkoutSessionDraftPayload(memo);
  const draft = {
    version: 1,
    date,
    dateKey: _sessionDateKey(date),
    sessionIndex,
    sessionId: session.id,
    workoutStartTime: Number(S.workout.workoutStartTime) || null,
    workoutTimerDate: timerDate,
    updatedAt: Date.now(),
    context,
    session,
  };

  if (!_sessionHasDraftData(session, draft)) {
    if (existingDraft && _sameTimerDate(existingDraft.date, date) && existingDraft.sessionIndex === sessionIndex) {
      _lsClearActiveWorkoutDraft();
    }
    return null;
  }

  _lsWriteActiveWorkoutDraft(draft);
  return draft;
}

export function wtClearActiveWorkoutDraft() {
  _lsClearActiveWorkoutDraft();
  _lastRestoredDraftKey = null;
}

export function wtReplaceActiveWorkoutDraftSession(dateLike, sessionIndex = 0, session = {}, context = 'session sync') {
  const date = _normalizeTimerDate(dateLike);
  const targetSessionIndex = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  const existingDraft = _readValidActiveWorkoutDraft();
  if (!date || !existingDraft) return null;
  if (!_sameTimerDate(existingDraft.date, date) || existingDraft.sessionIndex !== targetSessionIndex) return existingDraft;

  const nextSession = _cloneJson(session, {}) || {};
  const nextSessionId = String(nextSession.id || existingDraft.sessionId || `session-${targetSessionIndex + 1}`);
  const nextDraft = {
    ...existingDraft,
    date,
    dateKey: _sessionDateKey(date),
    sessionIndex: targetSessionIndex,
    sessionId: nextSessionId,
    updatedAt: Date.now(),
    context,
    session: {
      ...nextSession,
      id: nextSessionId,
      label: nextSession.label || `${targetSessionIndex + 1}회차`,
    },
  };

  if (!_sessionHasDraftData(nextDraft.session, nextDraft)) {
    _lsClearActiveWorkoutDraft();
    return null;
  }

  _lsWriteActiveWorkoutDraft(nextDraft);
  return nextDraft;
}

export function wtHasActiveWorkoutDraft() {
  if (S.workout.workoutStartTime) wtPersistActiveWorkoutDraft('status check');
  return !!_readValidActiveWorkoutDraft();
}

export function wtApplyActiveWorkoutDraft(workoutSource = {}, options = {}) {
  const draft = _readValidActiveWorkoutDraft();
  if (!draft) return { source: workoutSource || {}, restored: false, draft: null };
  const targetDate = _normalizeTimerDate(options.date);
  const targetSessionIndex = Math.max(0, Math.floor(Number(options.sessionIndex) || 0));
  if (!targetDate || !_sameTimerDate(draft.date, targetDate) || draft.sessionIndex !== targetSessionIndex) {
    return { source: workoutSource || {}, restored: false, draft };
  }

  const source = workoutSource && typeof workoutSource === 'object' ? workoutSource : {};
  const sourceUpdatedAt = Number(source.updatedAt) || 0;
  if (sourceUpdatedAt > 0 && sourceUpdatedAt > draft.updatedAt) {
    return { source, restored: false, draft };
  }

  const merged = {
    ...source,
    ..._cloneJson(draft.session, {}),
    id: source.id || draft.sessionId || `session-${targetSessionIndex + 1}`,
    label: source.label || `${targetSessionIndex + 1}회차`,
  };
  const restoreKey = `${draft.dateKey}:${draft.sessionIndex}:${draft.updatedAt}`;
  const shouldNotify = _lastRestoredDraftKey !== restoreKey;
  _lastRestoredDraftKey = restoreKey;
  return { source: merged, restored: shouldNotify, draft };
}

let _growthBoardAutoTimer = null;

function _normalizeGrowthBoardAutoTimer(state) {
  if (!state || typeof state !== 'object') return null;
  const dateKey = String(state.dateKey || '');
  const startedAt = Number(state.startedAt);
  const lastActivityAt = Number(state.lastActivityAt);
  if (!dateKey || !Number.isFinite(startedAt) || startedAt <= 0) return null;
  return {
    source: state.source || 'growth-board',
    dateKey,
    startedAt,
    lastActivityAt: Number.isFinite(lastActivityAt) && lastActivityAt >= startedAt ? lastActivityAt : null,
  };
}

function _growthBoardAutoTimerForDate(dateKey) {
  if (!dateKey) return null;
  const current = _normalizeGrowthBoardAutoTimer(_growthBoardAutoTimer);
  if (current?.dateKey === dateKey) {
    _growthBoardAutoTimer = current;
    return current;
  }
  const stored = _normalizeGrowthBoardAutoTimer(_lsReadGrowthBoardTimer());
  if (stored?.dateKey === dateKey) {
    _growthBoardAutoTimer = stored;
    return stored;
  }
  if (stored && stored.dateKey !== dateKey) _lsClearGrowthBoardTimer();
  _growthBoardAutoTimer = null;
  return null;
}

function _saveGrowthBoardAutoTimer(state) {
  const normalized = _normalizeGrowthBoardAutoTimer(state);
  if (!normalized) return null;
  _growthBoardAutoTimer = normalized;
  _lsWriteGrowthBoardTimer(normalized);
  return normalized;
}

function _clearGrowthBoardAutoTimer() {
  _growthBoardAutoTimer = null;
  _lsClearGrowthBoardTimer();
}

function _growthBoardAutoDurationSec() {
  const dateKey = _timerDateKey(_ensureWorkoutTimerDate() || _currentWorkoutTimerDate());
  const state = _growthBoardAutoTimerForDate(dateKey);
  if (!state?.lastActivityAt) return null;
  const sec = Math.floor((state.lastActivityAt + _GROWTH_BOARD_AUTO_GRACE_MS - state.startedAt) / 1000);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.min(_GROWTH_BOARD_AUTO_MAX_SEC, sec);
}

function _syncWorkoutTimelineDuration() {
  return syncWorkoutTimeline(S.workout) || buildWorkoutSetTimeline([], S.workout.workoutDuration);
}

function _cancelWorkoutIdleFinishTimer() {
  if (_workoutIdleFinishTimeout) clearTimeout(_workoutIdleFinishTimeout);
  _workoutIdleFinishTimeout = null;
}

function _isLoadedWorkoutTimelineDate(timeline) {
  const lastSetCompletedAt = Number(timeline?.lastSetCompletedAt);
  if (!Number.isFinite(lastSetCompletedAt) || lastSetCompletedAt <= 0) return false;
  const completedAt = new Date(lastSetCompletedAt);
  const completedDate = {
    y: completedAt.getFullYear(),
    m: completedAt.getMonth(),
    d: completedAt.getDate(),
  };
  return _sameTimerDate(_normalizeTimerDate(S.shared.date), completedDate);
}

function _timelineEndedAfterLatestSet(timeline) {
  if (!timeline?.lastSetCompletedAt || !timeline?.endedAt) return false;
  if (Number(timeline.endedAfterSetCompletedAt) !== Number(timeline.lastSetCompletedAt)) return false;
  const endedCount = Math.max(0, Math.floor(Number(timeline.endedCheckedSetCount) || 0));
  return endedCount === 0 || endedCount === Math.max(0, Math.floor(Number(timeline.checkedSetCount) || 0));
}

function _scheduleWorkoutIdleFinish(timeline, now = Date.now()) {
  _cancelWorkoutIdleFinishTimer();
  if (!_isLoadedWorkoutTimelineDate(timeline) || _timelineEndedAfterLatestSet(timeline)) return null;
  const deadlineAt = Number(timeline.lastSetCompletedAt) + _WORKOUT_IDLE_LIMIT_MS;
  const delayMs = Math.max(0, deadlineAt - Number(now));
  _workoutIdleFinishTimeout = setTimeout(() => {
    _workoutIdleFinishTimeout = null;
    wtCheckWorkoutIdleLimit().catch(e => console.error('[workout idle finish] error:', e));
  }, delayMs);
  return deadlineAt;
}

function _measuredWorkoutDurationSec() {
  return _syncWorkoutTimelineDuration().durationSec;
}

export function wtRefreshWorkoutTimelineDuration(context = 'set timeline') {
  const timeline = _syncWorkoutTimelineDuration();
  _renderWorkoutTimer();
  _renderTimerControls();
  wtPersistActiveWorkoutDraft(context);
  _scheduleWorkoutIdleFinish(timeline);
  return timeline;
}

export async function wtCheckWorkoutIdleLimit(now = Date.now()) {
  const timeline = _syncWorkoutTimelineDuration();
  if (!_isLoadedWorkoutTimelineDate(timeline) || _timelineEndedAfterLatestSet(timeline)) {
    _cancelWorkoutIdleFinishTimer();
    return false;
  }
  const deadlineAt = Number(timeline.lastSetCompletedAt) + _WORKOUT_IDLE_LIMIT_MS;
  if (Number(now) < deadlineAt) {
    _scheduleWorkoutIdleFinish(timeline, now);
    return false;
  }
  if (_workoutIdleFinishPromise) return _workoutIdleFinishPromise;
  _cancelWorkoutIdleFinishTimer();
  _workoutIdleFinishPromise = Promise.resolve(wtFinishWorkout({
    endedAt: deadlineAt,
    endedBy: 'idle-limit',
  })).then(() => true).finally(() => {
    _workoutIdleFinishPromise = null;
  });
  return _workoutIdleFinishPromise;
}

// ── 운동 시간 측정 ───────────────────────────────────────────────
// 근력 운동 시간은 앱 실행 시간/화면 켜짐 시간이 아니라 세트 완료 시각 timeline에서 계산한다.
// workoutTimerDate/workoutStartTime은 레거시 포인터 정리와 기존 외부 API 호환을 위해 남긴다.
export function _isViewingTimerDate() {
  const td = _normalizeTimerDate(S.workout.workoutTimerDate);
  const cd = _normalizeTimerDate(S.shared.date) || (S.workout.workoutStartTime ? td : null);
  return _sameTimerDate(td, cd);
}

export function wtStartGrowthBoardAutoTimer() {
  const dateKey = _timerDateKey(_currentWorkoutTimerDate());
  if (!dateKey) return null;
  const current = _growthBoardAutoTimerForDate(dateKey);
  const startedAt = current?.startedAt || Date.now();
  const state = _saveGrowthBoardAutoTimer({
    source: 'growth-board',
    dateKey,
    startedAt,
    lastActivityAt: current?.lastActivityAt || null,
  });
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.add('wt-open');
  wtRefreshWorkoutTimelineDuration('growth-board timeline open');
  return state;
}

export function wtMarkGrowthBoardExerciseAdded() {
  const state = wtStartGrowthBoardAutoTimer();
  if (!state) return null;
  return _saveGrowthBoardAutoTimer({
    ...state,
    lastActivityAt: Date.now(),
  });
}

export function wtStartWorkoutTimer() {
  S.workout.workoutTimerDate = _currentWorkoutTimerDate();
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  S.workout.workoutStartTime = null;
  _lsClearTimer();
  clearActiveTimer().catch(e => console.error('[timer start] clear legacy activeTimer error:', e));
  wtRefreshWorkoutTimelineDuration('timer timeline open');
}

export function wtPauseWorkoutTimer() {
  S.workout.workoutStartTime = null;
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  wtRefreshWorkoutTimelineDuration('timer pause');
  saveWorkoutDay()
    .then(() => {
      _lsClearTimer();
      return clearActiveTimer();
    })
    .catch(e => console.error('[timer pause] persist chain error:', e));
}

export async function wtResetWorkoutTimer() {
  _cancelWorkoutIdleFinishTimer();
  // 운동 시간 초기화는 파괴적 액션. 실수 방지 위해 confirm 필수.
  const timeline = _syncWorkoutTimelineDuration();
  const hasTime = timeline.durationSec > 0 || timeline.checkedSetCount > 0 || !!S.workout.workoutStartTime;
  if (hasTime) {
    const ok = await confirmAction({
      title: '운동 시간을 초기화할까요?',
      message: '세트 완료 시각이 지워지고 총 운동 시간이 0으로 돌아가요.',
      confirmLabel: '초기화',
      cancelLabel: '취소',
      destructive: true,
    });
    if (!ok) return;
  }
  clearWorkoutSetCompletedAt(S.workout.exercises);
  S.workout.workoutDuration = 0;
  S.workout.workoutTimeline = buildWorkoutSetTimeline(S.workout.exercises, 0);
  S.workout.workoutStartTime = null;
  S.workout.workoutTimerDate = null;
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  _renderTimerControls();
  wtPersistActiveWorkoutDraft('timer reset');
  // 순서: saveWorkoutDay → clearActiveTimer (pause 와 동일 이유).
  saveWorkoutDay()
    .then(() => {
      _lsClearTimer();
      _clearGrowthBoardAutoTimer();
      return clearActiveTimer();
    })
    .catch(e => console.error('[timer reset] persist chain error:', e));
}

export function _renderWorkoutTimer() {
  const el = document.getElementById('wt-workout-timer');
  if (!el) return;
  const elapsed = _measuredWorkoutDurationSec();
  el.textContent = _fmtTimerCompact(elapsed);
  el.style.display = '';
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.toggle('wt-running', false);
}

// 2026-06-26: play/pause stopwatch는 근력 운동 시간 기준에서 제외.
//   타이머 바는 세트 완료 timeline을 보여주고, reset/finish만 의미 있을 때 노출한다.
function _hasWorkoutRecord() {
  const list = Array.isArray(S.workout.exercises) ? S.workout.exercises : [];
  for (const entry of list) {
    for (const s of (entry?.sets || [])) {
      if (s?.setType === 'warmup') continue;
      if (s?.done === true) return true;
      if (s?.done === false) continue;
      if ((s?.kg || 0) > 0 && (s?.reps || 0) > 0) return true;
    }
  }
  return false;
}

export function _renderTimerControls() {
  const timeline = _syncWorkoutTimelineDuration();
  const hasTime   = timeline.durationSec > 0 || timeline.checkedSetCount > 0;
  const hasRecord = _hasWorkoutRecord();
  const pauseBtn  = document.getElementById('wt-timer-pause-btn');
  const playBtn   = document.getElementById('wt-timer-play-btn');
  const resetBtn  = document.getElementById('wt-timer-reset-btn');
  const finBtn    = document.getElementById('wt-finish-workout-btn');
  const resultEl  = document.getElementById('wt-workout-duration-result');

  if (pauseBtn) pauseBtn.style.display = 'none';
  if (playBtn)  playBtn.style.display  = 'none';
  if (resetBtn) resetBtn.style.display = hasTime ? '' : 'none';
  if (finBtn)   finBtn.style.display   = (hasTime || hasRecord) ? '' : 'none';
  if (resultEl) resultEl.style.display = 'none';
}

export function _fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function _fmtTimerCompact(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export function wtTogglePauseWorkoutTimer() {
  if (S.workout.workoutStartTime) {
    wtPauseWorkoutTimer();
  } else {
    wtStartWorkoutTimer();
  }
}

// 2026-04-19: 반환값이 saveWorkoutDay의 Promise.
// 호출자(wtEndAndShowInsights 등)가 저장 완료를 명시적으로 await 해야 할 때 사용.
// 기존 fire-and-forget 호출부는 `.catch(...)` 만 붙이면 동일하게 동작한다.
// 배경: "끝내기 직후 인사이트 모달이 당일 기록을 아직 반영 못 하는" 회귀를 방지하려면,
//      insightsOpen이 cache 읽기 전에 setDoc/_cache 업데이트가 마무리돼야 한다.
//      _cache[key]=data는 동기 경로에서 이미 갱신되지만, Firebase round-trip까지
//      기다려야 다른 레이어(getCache 소비자, analytics 등)와의 순서가 명확해진다.
export function wtFinishWorkout(options = {}) {
  _cancelWorkoutIdleFinishTimer();
  const endedBy = String(options.endedBy || 'manual');
  const endedAt = Number(options.endedAt) || Date.now();
  const finalTimeline = closeWorkoutTimeline(S.workout, {
    endedAt,
    endedBy,
  }) || _syncWorkoutTimelineDuration();
  const finalDuration = finalTimeline.durationSec;
  if (S.workout.restTimer.running) {
    _finalizeRestTimerRecord(endedBy === 'idle-limit' ? 'idle-limit' : 'finish', endedAt);
    _stopRestTimerUi();
  }
  S.workout.workoutStartTime = null;
  S.workout.workoutDuration = finalDuration;
  S.workout.workoutTimerDate = null;
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  const pauseBtn = document.getElementById('wt-timer-pause-btn');
  const resetBtn = document.getElementById('wt-timer-reset-btn');
  const finBtn   = document.getElementById('wt-finish-workout-btn');
  const resultEl = document.getElementById('wt-workout-duration-result');
  if (pauseBtn) pauseBtn.style.display = 'none';
  const playBtn = document.getElementById('wt-timer-play-btn');
  if (playBtn) playBtn.style.display = 'none';
  if (resetBtn) resetBtn.style.display = 'none';
  if (finBtn)   finBtn.style.display = 'none';
  if (resultEl) {
    resultEl.textContent = `총 ${_fmtDuration(S.workout.workoutDuration)}`;
    resultEl.style.display = '';
  }
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.remove('wt-running');
  const finishMessage = endedBy === 'idle-limit'
    ? `15분 동안 추가 기록이 없어 운동을 종료했어요 · ${_fmtDuration(S.workout.workoutDuration)}`
    : `운동 완료! ${_fmtDuration(S.workout.workoutDuration)}`;
  showCenterToast(finishMessage, 2600);
  // 순서: saveWorkoutDay (총 duration 영속화) → clearActiveTimer (포인터 해제).
  //   save 가 throw 하면 반환 Promise 도 reject → wtEndAndShowInsights 가 인사이트 모달 차단.
  //   active_timer 는 save 성공 뒤에만 정리 — save 실패 시 포인터가 살아있어야 recovery
  //   경로가 이어받아 유저가 재시도 가능 (2026-04-21 Codex 지적 #2).
  return saveWorkoutDay().then(() => {
    _lsClearTimer();
    _clearGrowthBoardAutoTimer();
    wtClearActiveWorkoutDraft();
    clearActiveTimer().catch(e => console.error('[timer finish] clearActiveTimer error:', e));
  });
}

export function wtRecoverTimers() {
  const fromFs = getActiveTimer();
  const fromLs = _lsReadTimer();
  if (fromLs) _lsClearTimer();
  if (fromFs) clearActiveTimer().catch(() => {});
  S.workout.workoutStartTime = null;
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  const timeline = _syncWorkoutTimelineDuration();
  _renderWorkoutTimer();
  _renderTimerControls();

  if (S.workout.restTimer.running) {
    if (!S.workout.restTimer.startedAt) {
      const elapsed = Math.max(0, (S.workout.restTimer.total || 0) - (S.workout.restTimer.remaining || 0));
      S.workout.restTimer.startedAt = Date.now() - elapsed * 1000;
    }
    if (!S.workout.restTimer.interval) {
      S.workout.restTimer.interval = setInterval(_syncRestTimerFromNow, 1000);
    }
    _syncRestTimerFromNow();
  }
  if (timeline?.lastSetCompletedAt && !_timelineEndedAfterLatestSet(timeline)) {
    wtCheckWorkoutIdleLimit().catch(e => console.error('[workout idle recover] error:', e));
  } else {
    _cancelWorkoutIdleFinishTimer();
  }
}

if (typeof window !== 'undefined') {
  window.__wtPersistActiveDraft = (context = 'external flush') => wtPersistActiveWorkoutDraft(context);
  window.__wtHasActiveDraft = () => wtHasActiveWorkoutDraft();
  window.addEventListener('beforeunload', () => {
    wtPersistActiveWorkoutDraft('beforeunload');
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        wtPersistActiveWorkoutDraft('visibility hidden');
        return;
      }
      wtCheckWorkoutIdleLimit().catch(e => console.error('[workout idle visible] error:', e));
    });
  }
}

// ── 세트 간 휴식 타이머 (통합 바 버전) ─────────────────────────
// DOM 구조: wt-workout-timer-bar (부모, has-rest / rest-expired 클래스)
//   └ wt-rest-section (세그먼트, display toggle)
//   └ wt-tbar-progress (진행바 컨테이너, display toggle)
//   └ wt-rest-minus-btn / wt-rest-plus-btn / wt-rest-skip-btn (컨트롤 버튼)
function _restSegEl()     { return document.getElementById('wt-rest-section'); }
function _restBarEl()     { return document.getElementById('wt-workout-timer-bar'); }
function _restProgEl()    { return document.getElementById('wt-tbar-progress'); }
function _restTimeEl()    { return document.getElementById('wt-rest-time'); }
function _restFillEl()    { return document.getElementById('wt-rest-fill'); }
function _restRingEl()    { return document.getElementById('wt-rest-ring-progress'); }

const _REST_CTRL_IDS   = ['wt-rest-minus-btn', 'wt-rest-plus-btn', 'wt-rest-skip-btn'];
const _WORK_CTRL_IDS   = ['wt-timer-pause-btn', 'wt-timer-play-btn', 'wt-timer-reset-btn', 'wt-finish-workout-btn'];

function _setDisplay(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? '' : 'none';
}
function _showRestControls() {
  _REST_CTRL_IDS.forEach(id => _setDisplay(id, true));
  _WORK_CTRL_IDS.forEach(id => _setDisplay(id, false));
}
function _hideRestControls() {
  _REST_CTRL_IDS.forEach(id => _setDisplay(id, false));
  _renderTimerControls();
}

function _formatTime(sec) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  const sign = sec < 0 ? '+' : '';
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

function _restTimerRecordOrigin(meta = {}) {
  const entryIdx = Number(meta.entryIdx);
  const setIdx = Number(meta.setIdx);
  if (!Number.isInteger(entryIdx) || !Number.isInteger(setIdx)) return null;
  return {
    entryIdx,
    setIdx,
    exerciseId: meta.exerciseId || null,
    exerciseName: meta.exerciseName || null,
    setNumber: Math.max(1, Math.floor(Number(meta.setNumber) || (setIdx + 1))),
  };
}

function _activeRestOrigin() {
  const origin = S.workout.restTimer.origin;
  if (origin) return _restTimerRecordOrigin(origin);
  return _restTimerRecordOrigin(S.workout.restTimer);
}

function _sameRestOrigin(a, b) {
  return !!a && !!b && a.entryIdx === b.entryIdx && a.setIdx === b.setIdx;
}

function _restSetFromOrigin(origin) {
  if (!origin) return null;
  return S.workout.exercises?.[origin.entryIdx]?.sets?.[origin.setIdx] || null;
}

function _clearRestSetFields(set) {
  if (!set) return;
  delete set.restStartedAt;
  delete set.restPlannedSec;
  delete set.restEndedAt;
  delete set.restElapsedSec;
  delete set.restOverSec;
  delete set.restEndedBy;
}

function _restElapsedSec(now = Date.now()) {
  const startedAt = Number(S.workout.restTimer.startedAt) || now;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function _syncRestProgress(remaining, total) {
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  const ring = _restRingEl();
  if (ring) {
    const offset = remaining <= 0
      ? 0
      : Math.max(0, Math.min(100, 100 - (Math.max(0, remaining) / safeTotal) * 100));
    ring.style.strokeDasharray = '100';
    ring.style.strokeDashoffset = String(offset);
  }
  const fill = _restFillEl();
  if (fill) {
    const width = remaining <= 0
      ? 100
      : Math.max(0, Math.min(100, (Math.max(0, remaining) / safeTotal) * 100));
    fill.style.width = `${width}%`;
  }
}

function _syncRestVisual() {
  const remaining = Math.floor(Number(S.workout.restTimer.remaining) || 0);
  const total = Math.max(1, Math.floor(Number(S.workout.restTimer.total) || 1));
  const t = _restTimeEl();
  if (t) t.textContent = _formatTime(remaining);
  _syncRestProgress(remaining, total);
  _restBarEl()?.classList.toggle('rest-expired', remaining <= 0);
}

function _writeRestTimerStartRecord(origin, total, startedAt) {
  const set = _restSetFromOrigin(origin);
  if (!set) return;
  set.restStartedAt = new Date(startedAt).toISOString();
  set.restPlannedSec = total;
  set.restEndedAt = null;
  set.restElapsedSec = 0;
  set.restOverSec = 0;
  set.restEndedBy = null;
}

function _writeActiveRestPlannedSec(total) {
  const set = _restSetFromOrigin(_activeRestOrigin());
  if (set?.restStartedAt) set.restPlannedSec = total;
}

function _finalizeRestTimerRecord(endedBy = 'skip', endedAt = Date.now()) {
  const set = _restSetFromOrigin(_activeRestOrigin());
  if (!set?.restStartedAt) return false;
  const now = Number(endedAt) || Date.now();
  const startedMs = Number(S.workout.restTimer.startedAt) || Date.parse(set.restStartedAt);
  const elapsedSec = Number.isFinite(startedMs)
    ? Math.max(0, Math.floor((now - startedMs) / 1000))
    : Math.max(0, Math.floor(Number(set.restElapsedSec) || 0));
  const plannedSec = Math.max(0, Math.floor(Number(S.workout.restTimer.total || set.restPlannedSec) || 0));
  set.restPlannedSec = plannedSec;
  set.restEndedAt = new Date(now).toISOString();
  set.restElapsedSec = elapsedSec;
  set.restOverSec = Math.max(0, elapsedSec - plannedSec);
  set.restEndedBy = endedBy;
  wtPersistActiveWorkoutDraft(`rest timer ${endedBy}`);
  return true;
}

function _saveRestTimerRecord(context) {
  saveWorkoutDay({ silent: true }).catch(e => console.error(`[rest timer ${context}] save error:`, e));
}

function _stopRestTimerUi() {
  if (S.workout.restTimer.interval) clearInterval(S.workout.restTimer.interval);
  S.workout.restTimer.interval = null;
  S.workout.restTimer.running = false;
  S.workout.restTimer.startedAt = null;
  S.workout.restTimer.origin = null;
  S.workout.restTimer.context = '';
  S.workout.restTimer.expiredNotified = false;
  const seg = _restSegEl();
  if (seg) seg.style.display = 'none';
  const prog = _restProgEl();
  if (prog) prog.style.display = 'none';
  _restBarEl()?.classList.remove('has-rest', 'rest-expired');
  _hideRestControls();
}

function _setRestTimerTotal(seconds, { persist = false } = {}) {
  const total = Math.max(15, Math.floor(Number(seconds) || 0));
  S.workout.restTimer.total = total;
  S.workout.restTimer.remaining = S.workout.restTimer.running
    ? total - _restElapsedSec()
    : total;
  _writeActiveRestPlannedSec(total);
  _syncRestVisual();
  if (S.workout.restTimer.remaining > 0) S.workout.restTimer.expiredNotified = false;
  if (persist) {
    wtPersistActiveWorkoutDraft('rest timer total update');
    _saveRestTimerRecord('total update');
  }
}

export function wtRestTimerStart(seconds, context, meta = {}) {
  const seg = _restSegEl();
  const bar = _restBarEl();
  if (!seg || !bar) return;
  const origin = _restTimerRecordOrigin(meta);
  if (S.workout.restTimer.running && !_sameRestOrigin(_activeRestOrigin(), origin)) {
    _finalizeRestTimerRecord(origin ? 'next-set' : 'restart');
  }
  if (Number(seconds) > 0) S.workout.restTimer.total = Math.max(1, Math.floor(Number(seconds)));
  const total = Math.max(1, Math.floor(Number(S.workout.restTimer.total) || 90));
  const startedAt = Date.now();
  const ctxEl = document.getElementById('wt-rest-context');
  if (ctxEl) ctxEl.textContent = context || '';
  S.workout.restTimer.total = total;
  S.workout.restTimer.remaining = total;
  S.workout.restTimer.running = true;
  S.workout.restTimer.startedAt = startedAt;
  S.workout.restTimer.context = context || '';
  S.workout.restTimer.origin = origin;
  S.workout.restTimer.expiredNotified = false;
  _writeRestTimerStartRecord(origin, total, startedAt);

  seg.style.display = '';
  const prog = _restProgEl();
  if (prog) prog.style.display = '';
  bar.classList.add('has-rest');
  bar.classList.remove('rest-expired');
  _showRestControls();
  _syncRestVisual();

  if (S.workout.restTimer.interval) clearInterval(S.workout.restTimer.interval);
  S.workout.restTimer.interval = setInterval(_syncRestTimerFromNow, 1000);
  wtPersistActiveWorkoutDraft('rest timer start');
}

export function wtRestTimerShowIdle() {}
export function wtRestTimerHideIdle() {}

export function wtRestTimerSkip() {
  const recorded = _finalizeRestTimerRecord('skip');
  _stopRestTimerUi();
  wtPersistActiveWorkoutDraft('rest timer skip');
  if (recorded) _saveRestTimerRecord('skip');
}

export function wtRestTimerClearSetRecord(entryIdx, si) {
  const origin = _restTimerRecordOrigin({ entryIdx, setIdx: si });
  const set = _restSetFromOrigin(origin);
  _clearRestSetFields(set);
  if (_sameRestOrigin(_activeRestOrigin(), origin)) _stopRestTimerUi();
  wtPersistActiveWorkoutDraft('rest timer clear set');
}

export function wtRestTimerAdjust(delta) {
  if (!S.workout.restTimer.running) return;
  const nextTotal = Math.max(15, Math.floor(Number(S.workout.restTimer.total) || 90) + Math.floor(Number(delta) || 0));
  _setRestTimerTotal(nextTotal, { persist: true });
}

function _syncRestTimerFromNow() {
  const bar = _restBarEl();
  if (!bar || !S.workout.restTimer.running) return;
  S.workout.restTimer.remaining = (S.workout.restTimer.total || 0) - _restElapsedSec();
  _syncRestVisual();
  if (S.workout.restTimer.remaining > 0) {
    S.workout.restTimer.expiredNotified = false;
    return;
  }
  if (S.workout.restTimer.remaining === 0 && !S.workout.restTimer.expiredNotified) {
    S.workout.restTimer.expiredNotified = true;
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  const lastSetCompletedAt = Number(S.workout.workoutTimeline?.lastSetCompletedAt) || 0;
  if (lastSetCompletedAt > 0 && Date.now() >= lastSetCompletedAt + _WORKOUT_IDLE_LIMIT_MS) {
    wtCheckWorkoutIdleLimit().catch(e => console.error('[workout idle rest tick] error:', e));
  }
}

export function _initRestTimerPresets() {}

// ── Rest Preset Bottom Sheet ──────────────────────────────────────
export function wtOpenRestPresetSheet() {
  document.querySelectorAll('.wt-rest-sheet-back').forEach(el => el.remove());

  const currentTotal = S.workout.restTimer.total || 90;
  const options = [
    { sec: 30,  label: '0:30' },
    { sec: 60,  label: '1:00' },
    { sec: 90,  label: '1:30' },
    { sec: 120, label: '2:00' },
    { sec: 180, label: '3:00' },
    { sec: 300, label: '5:00' },
  ];

  const back = document.createElement('div');
  back.className = 'wt-rest-sheet-back';
  back.innerHTML = `
    <div class="wt-rest-sheet">
      <div class="wt-rest-sheet-title">휴식시간 설정</div>
      <div class="wt-rest-sheet-grid">
        ${options.map(o =>
          `<button type="button" class="wt-rest-sheet-opt${o.sec === currentTotal ? ' is-on' : ''}" data-sec="${o.sec}">${o.label}</button>`
        ).join('')}
      </div>
      <button type="button" class="wt-rest-sheet-close">취소</button>
    </div>
  `;
  document.body.appendChild(back);

  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); };

  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  back.querySelector('.wt-rest-sheet-close')?.addEventListener('click', close);
  back.querySelectorAll('.wt-rest-sheet-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = +btn.dataset.sec;
      if (S.workout.restTimer.running) {
        _setRestTimerTotal(sec, { persist: true });
      } else {
        S.workout.restTimer.total = sec;
        S.workout.restTimer.remaining = sec;
        _syncRestVisual();
      }
      close();
    });
  });

  requestAnimationFrame(() => back.classList.add('show'));
}
