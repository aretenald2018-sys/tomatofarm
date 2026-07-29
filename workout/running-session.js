import { toFiniteNumber as _num } from '../utils/number.js';
import { escapeHtml as _escapeHtml } from '../utils/escape-html.js';
// ================================================================
// workout/running-session.js — inline running session card flow
// ================================================================

import { S } from './state.js';
import { destroyRunningMaps, readRunningMapConfig, renderRunningMap, updateRunningMap } from './running-map.js';
import {
  MAX_RUNNING_ROUTE_POINTS,
  buildRunningRoutePreview,
  normalizeRunningRoutePoints,
} from './running-route-store.js';
import {
  RUNNING_ROUTE_POLICY,
  buildConfirmedRunningMovementRoute,
  buildRunningRouteModel,
  isConfidentRunningMovement,
  isExplicitRunningRouteGap,
  runningDistanceMeters,
  runningRouteDistanceMeters,
} from './running-route-policy.js';
import {
  RUNNING_SESSION_ID,
  WORKOUT_RUNNING_SESSION_INDEX,
} from './session-policy.js';
import { applyRunningDataToWorkout } from './running-model.js';
import { formatRunningDuration, formatRunningPace } from './running-presentation.js';
import { parseDateKey } from '../utils/date-key.js';
import { runningInputFromPhoneSummary } from './running-input.js';
import { RunningLiveAccumulator } from './running-live-accumulator.js';
import { buildRunningActivityAnalytics, isValidRunningWeightKg } from './running-analytics.js';
import { openWorkoutDaySheet } from './navigation-stack.js';
import { setRunningLiveState } from './running-live-state.js';
import {
  RUNNING_DRAFT_STORAGE_VERSION,
  clearRunningDraftRecord,
  readRunningDraftRecord,
  writeRunningDraftRecord,
} from './running-draft-store.js';

export {
  buildConfirmedRunningMovementRoute,
  buildRunningRouteModel,
  isConfidentRunningMovement,
  runningDistanceMeters,
  runningRouteDistanceMeters,
} from './running-route-policy.js';
export { formatRunningDuration, formatRunningPace } from './running-presentation.js';

const RUNNING_ROUTE_PREVIEW_POINTS = 240;
const RUNNING_DRAFT_ROUTE_WRITE_INTERVAL_MS = 30_000;
const RUNNING_SESSION_DRAFT_VERSION = RUNNING_DRAFT_STORAGE_VERSION;
const RUNNING_SESSION_DRAFT_MAX_MS = 24 * 60 * 60 * 1000;
const RUNNING_SESSION_DRAFT_KEY_PREFIX = 'tomatofarm_running_session_draft_';
const RUNNING_SESSION_DRAFT_ACTIVE_KEY = 'tomatofarm_running_session_draft_active';
const RESTORABLE_RUNNING_PHASES = new Set(['active', 'paused', 'summary']);
const GEO_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
};
const MAX_LIVE_GPS_AGE_MS = 30_000;
const MAX_LIVE_GPS_ACCURACY_M = 35;
const MAX_PLAUSIBLE_RUNNING_SPEED_MPS = RUNNING_ROUTE_POLICY.maxPlausibleSpeedMps;
const NATIVE_LOCATION_POLL_MS = 2_000;
const RUNNING_MAP_UPDATE_INTERVAL_MS = 3_000;
const DEFAULT_RUNNING_GOAL = Object.freeze({ type: 'free', value: 0 });
const RUNNING_GOAL_DEFAULTS = Object.freeze({ distance: 5, time: 30 });
const RUNNING_AUDIO_MIN_MS = 3500;

const _session = {
  open: false,
  phase: 'start',
  watchId: null,
  tickId: null,
  startedAt: null,
  endedAt: null,
  pausedAt: null,
  pausedMs: 0,
  route: [],
  routeAccumulator: new RunningLiveAccumulator(),
  routeRevision: 0,
  pendingGapReason: '',
  previewPoint: null,
  lastError: '',
  saving: false,
  placeSummary: null,
  placePromise: null,
  goal: { ...DEFAULT_RUNNING_GOAL },
  audioGuide: true,
  announcedSplits: 0,
  announcedGoalHalf: false,
  announcedGoalDone: false,
  lastSpeechAt: 0,
  nativeLocationStarted: false,
  nativeLocationCursor: 0,
  nativeLocationPollId: null,
  lastMapRenderAt: 0,
};
let _runningDraftEventsBound = false;
let _runningDraftRouteTimer = null;
let _runningDraftRoutePendingContext = '';
let _lastRunningDraftPersistAt = 0;
let _getRunningWeightKg = null;

function _root() {
  return document.getElementById('wt-running-session-root');
}

function _now() {
  return Date.now();
}

async function _showToast(message, duration = 1800, type = 'info') {
  try {
    const mod = await import('../ui/toast.js');
    mod.showToast?.(message, duration, type);
  } catch {}
}

function _round(value, digits = 2) {
  const n = _num(value, 0);
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function _cloneRunningGoal(goal = DEFAULT_RUNNING_GOAL) {
  const type = goal?.type === 'distance' || goal?.type === 'time' ? goal.type : 'free';
  return { type, value: type === 'free' ? 0 : _num(goal?.value, RUNNING_GOAL_DEFAULTS[type]) };
}

function _cloneJson(value, fallback = null) {
  if (value == null) return fallback;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return fallback; }
}

function _runningGoalLabel(goal = _session.goal) {
  const safe = _cloneRunningGoal(goal);
  if (safe.type === 'distance') return `${_round(safe.value, 2)} km`;
  if (safe.type === 'time') return `${Math.round(safe.value)}분`;
  return '자유 러닝';
}

function _runningGoalProgress(summary = _currentSummary()) {
  const goal = _cloneRunningGoal(_session.goal);
  if (goal.type === 'distance') {
    const target = Math.max(0.1, _num(goal.value, RUNNING_GOAL_DEFAULTS.distance));
    const current = Math.max(0, _num(summary?.distanceKm, 0));
    return {
      active: true,
      type: 'distance',
      current,
      target,
      ratio: target > 0 ? Math.min(1, current / target) : 0,
    };
  }
  if (goal.type === 'time') {
    const target = Math.max(60, _num(goal.value, RUNNING_GOAL_DEFAULTS.time) * 60);
    const current = Math.max(0, _num(summary?.durationSec, 0));
    return {
      active: true,
      type: 'time',
      current,
      target,
      ratio: target > 0 ? Math.min(1, current / target) : 0,
    };
  }
  return { active: false, type: 'free', current: 0, target: 0, ratio: 0 };
}

function _runningGoalRemainingLabel(progress) {
  if (!progress?.active) return '';
  if (progress.ratio >= 1) return '목표 완료';
  const remaining = Math.max(0, progress.target - progress.current);
  if (progress.type === 'distance') return `${_round(remaining, 2)} km 남음`;
  return `${Math.ceil(remaining / 60)}분 남음`;
}

function _runningSpeechDuration(sec) {
  const total = Math.max(0, Math.floor(_num(sec, 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes > 0 && seconds > 0) return `${minutes}분 ${seconds}초`;
  if (minutes > 0) return `${minutes}분`;
  return `${seconds}초`;
}

function _runningSpeechPace(summary) {
  if (summary?.avgPaceSecPerKm > 0) return `평균 페이스 ${formatRunningPace(summary.avgPaceSecPerKm)}입니다`;
  return `시간 ${_runningSpeechDuration(summary?.durationSec || 0)}입니다`;
}

function _speakRunning(message, options = {}) {
  if (!_session.audioGuide || !message || typeof window === 'undefined') return false;
  const synth = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance;
  if (!synth || typeof synth.speak !== 'function' || typeof Utterance !== 'function') return false;
  const now = _now();
  if (!options.force && now - _session.lastSpeechAt < RUNNING_AUDIO_MIN_MS) return false;
  _session.lastSpeechAt = now;
  try {
    const utterance = new Utterance(message);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.02;
    utterance.pitch = 1;
    if (options.force && typeof synth.cancel === 'function') synth.cancel();
    synth.speak(utterance);
    return true;
  } catch (e) {
    console.warn('[running-session] speech skipped:', e);
    return false;
  }
}

function _checkRunningAudioCues() {
  if (_session.phase !== 'active' || !_session.audioGuide) return;
  const summary = _currentSummary();
  let changed = false;
  const splitKm = Math.floor(_num(summary.distanceKm, 0));
  if (splitKm > 0 && splitKm > _session.announcedSplits) {
    _session.announcedSplits = splitKm;
    changed = true;
    _speakRunning(`${splitKm}킬로미터 통과. ${_runningSpeechPace(summary)}`);
  }
  const progress = _runningGoalProgress(summary);
  if (!progress.active) {
    if (changed) _persistRunningDraft('audio cues');
    return;
  }
  if (!_session.announcedGoalHalf && progress.ratio >= 0.5 && progress.ratio < 1) {
    _session.announcedGoalHalf = true;
    changed = true;
    _speakRunning(`목표의 절반을 지났습니다. ${_runningGoalRemainingLabel(progress)}`);
  }
  if (!_session.announcedGoalDone && progress.ratio >= 1) {
    _session.announcedGoalDone = true;
    changed = true;
    _speakRunning(`${_runningGoalLabel()} 목표를 완료했습니다. 계속 달려도 기록은 이어집니다.`, { force: true });
  }
  if (changed) _persistRunningDraft('audio cues');
}

function _safePoint(point) {
  const lat = point?.lat;
  const lng = point?.lng;
  const ts = point?.ts ?? _now();
  if (typeof lat !== 'number' || !Number.isFinite(lat)
    || typeof lng !== 'number' || !Number.isFinite(lng)
    || typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  const normalized = { lat, lng, ts };
  for (const [key, value] of [
    ['accuracy', point?.accuracy],
    ['altitude', point?.altitude],
    ['speed', point?.speed],
    ['bearing', point?.bearing],
  ]) {
    if (value == null) continue;
    const metric = _optionalFiniteNumber(value);
    if (metric == null) return null;
    normalized[key] = metric;
  }
  const rawHeartRateBpm = point?.heartRateBpm ?? point?.heartRate ?? point?.bpm;
  const rawCadenceSpm = point?.cadenceSpm ?? point?.cadence ?? point?.stepsPerMinute;
  const heartRateBpm = _optionalFiniteNumber(rawHeartRateBpm);
  const cadenceSpm = _optionalFiniteNumber(rawCadenceSpm);
  if (rawHeartRateBpm != null && heartRateBpm == null) return null;
  if (rawCadenceSpm != null && cadenceSpm == null) return null;
  if (heartRateBpm != null) normalized.heartRateBpm = heartRateBpm;
  if (cadenceSpm != null) normalized.cadenceSpm = cadenceSpm;
  const segmentId = Number(point?.segmentId);
  if (Number.isFinite(segmentId) && segmentId >= 0) normalized.segmentId = Math.floor(segmentId);
  if (point?.gapBefore === true) normalized.gapBefore = true;
  const gapReason = _routeGapReason(point?.gapReason);
  if (gapReason) normalized.gapReason = gapReason;
  return normalized;
}

function _optionalNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function _optionalFiniteNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function _routeGapReason(value) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, 48) : '';
}

function _routeSegmentId(point, fallback = 0) {
  const n = Number(point?.segmentId);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function _isRouteGapEdge(prev, next) {
  return isExplicitRunningRouteGap(prev, next);
}

function _routeGapCount(route = []) {
  return route.filter(point => point?.gapBefore === true).length;
}

function _routeSegmentCount(route = []) {
  if (!route.length) return 0;
  let count = 1;
  for (let i = 1; i < route.length; i += 1) {
    if (_isRouteGapEdge(route[i - 1], route[i])) count += 1;
  }
  return count;
}

export function downsampleRunningRoute(points = [], max = RUNNING_ROUTE_PREVIEW_POINTS) {
  return buildRunningRoutePreview(points, max);
}

function _safeRunningPhase(phase) {
  const raw = String(phase || '');
  return RESTORABLE_RUNNING_PHASES.has(raw) ? raw : null;
}

export function normalizeRunningSessionDraft(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const now = _num(options.now, _now());
  const phase = _safeRunningPhase(raw.phase);
  if (!phase) return null;
  const ownerId = String(raw.ownerId || raw.userId || raw.uid || '').trim();

  // Preserve every captured point exactly as stored. Gap inference belongs to
  // distance/map consumers; mutating a draft would make the raw recording lossy.
  const route = normalizeRunningRoutePoints(raw.route || []);
  const startedAt = _num(raw.startedAt, route[0]?.ts || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  if ((now - startedAt) > RUNNING_SESSION_DRAFT_MAX_MS) return null;

  const updatedAt = _num(raw.updatedAt, raw.endedAt || raw.pausedAt || startedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  if ((now - updatedAt) > RUNNING_SESSION_DRAFT_MAX_MS) return null;

  const endedAt = phase === 'summary'
    ? _num(raw.endedAt, updatedAt)
    : null;
  const pausedAt = phase === 'paused'
    ? _num(raw.pausedAt, updatedAt)
    : null;

  return {
    version: RUNNING_SESSION_DRAFT_VERSION,
    phase,
    dateKey: String(raw.dateKey || ''),
    ownerId,
    startedAt,
    endedAt: endedAt && Number.isFinite(endedAt) ? endedAt : null,
    pausedAt: pausedAt && Number.isFinite(pausedAt) ? pausedAt : null,
    pausedMs: Math.max(0, _num(raw.pausedMs, 0)),
    route,
    pendingGapReason: _routeGapReason(raw.pendingGapReason),
    placeSummary: raw.placeSummary && typeof raw.placeSummary === 'object' ? _cloneJson(raw.placeSummary, null) : null,
    goal: _cloneRunningGoal(raw.goal),
    audioGuide: raw.audioGuide !== false,
    announcedSplits: Math.max(0, Math.floor(_num(raw.announcedSplits, 0))),
    announcedGoalHalf: !!raw.announcedGoalHalf,
    announcedGoalDone: !!raw.announcedGoalDone,
    lastSpeechAt: Math.max(0, _num(raw.lastSpeechAt, 0)),
    updatedAt,
  };
}

function _routeBounds(route) {
  if (!route.length) return null;
  let minLat = route[0].lat;
  let maxLat = route[0].lat;
  let minLng = route[0].lng;
  let maxLng = route[0].lng;
  for (const p of route) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    minLat: _round(minLat, 6),
    minLng: _round(minLng, 6),
    maxLat: _round(maxLat, 6),
    maxLng: _round(maxLng, 6),
  };
}

function _routeCentroid(route) {
  if (!route.length) return null;
  const sum = route.reduce((acc, p) => {
    acc.lat += p.lat;
    acc.lng += p.lng;
    return acc;
  }, { lat: 0, lng: 0 });
  return {
    lat: _round(sum.lat / route.length, 6),
    lng: _round(sum.lng / route.length, 6),
  };
}

function _accuracySummary(route) {
  const values = route.map(p => Number(p.accuracy)).filter(Number.isFinite);
  if (!values.length) return null;
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    avgAccuracyM: Math.round(avg),
    bestAccuracyM: Math.round(Math.min(...values)),
    worstAccuracyM: Math.round(Math.max(...values)),
  };
}

function _elevationGain(route) {
  let gain = 0;
  let pairs = 0;
  for (let i = 1; i < route.length; i += 1) {
    if (_isRouteGapEdge(route[i - 1], route[i])) continue;
    const prev = route[i - 1].altitude;
    const next = route[i].altitude;
    if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;
    pairs += 1;
    const diff = next - prev;
    if (diff > 0) gain += diff;
  }
  if (!pairs) return null;
  return Math.round(gain);
}

function _avgRouteMetric(route, key) {
  const values = route.map(point => Number(point?.[key])).filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function summarizeRunningRoute(points = [], options = {}) {
  return buildRunningActivityAnalytics(points, { source: 'gps', ...options });
}

function _elapsedSec() {
  if (!_session.startedAt) return 0;
  const end = _session.phase === 'paused' && _session.pausedAt ? _session.pausedAt : (_session.endedAt || _now());
  return Math.max(0, Math.floor((end - _session.startedAt - _session.pausedMs) / 1000));
}

function _runningWeightKg() {
  const value = typeof _getRunningWeightKg === 'function' ? _getRunningWeightKg() : null;
  return isValidRunningWeightKg(value) ? Number(value) : null;
}

export function configureRunningWeightProvider(getWeightKg) {
  _getRunningWeightKg = typeof getWeightKg === 'function' ? getWeightKg : null;
}

function _currentSummary() {
  const endedAt = _session.endedAt || _now();
  if (_session.routeAccumulator.state.pointCount !== _session.route.length) {
    _session.routeAccumulator.rebuild(_session.route);
  }
  const summaryOptions = {
    startedAt: _session.startedAt || endedAt,
    endedAt,
    pausedMs: _session.pausedMs,
    weightKg: _runningWeightKg(),
    includeAnalytics: false,
  };
  const liveSummary = _session.routeAccumulator.summary(summaryOptions);
  if (_session.phase !== 'summary') return liveSummary;
  return buildRunningActivityAnalytics(_session.route, {
    ...summaryOptions,
    source: 'gps',
    distanceM: liveSummary.distanceM,
  });
}

function _workoutDateKeyFromState() {
  const d = S.shared?.date;
  if (!d || !Number.isFinite(Number(d.y)) || !Number.isFinite(Number(d.m)) || !Number.isFinite(Number(d.d))) return null;
  return `${Number(d.y)}-${String(Number(d.m) + 1).padStart(2, '0')}-${String(Number(d.d)).padStart(2, '0')}`;
}

function _datePartsFromKey(key) {
  const parsed = parseDateKey(key);
  return parsed ? { y: parsed.y, m: parsed.m, d: parsed.d } : null;
}

function _applyRunningDraftDate(dateKey) {
  const date = _datePartsFromKey(dateKey);
  if (!date) return false;
  S.shared.date = date;
  return true;
}

function _ensureRunningWorkoutDate(dateKey, options = {}) {
  const current = _workoutDateKeyFromState();
  if (dateKey && current !== dateKey && _applyRunningDraftDate(dateKey)) return _workoutDateKeyFromState();
  if (current && options.allowCurrent !== false) return current;
  if (!_applyRunningDraftDate(dateKey)) return null;
  return _workoutDateKeyFromState();
}

function _workoutSessionIndexFromState() {
  return WORKOUT_RUNNING_SESSION_INDEX;
}

function _currentRunningDraftOwnerId() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('currentUser') : '';
    const u = raw ? JSON.parse(raw) : null;
    const uid = (u && (u.uid || u.id || u.username || u.name)) || '_anon';
    return String(uid || '_anon');
  } catch {
    return '_anon';
  }
}

function _runningDraftKey(ownerId = _currentRunningDraftOwnerId()) {
  return RUNNING_SESSION_DRAFT_KEY_PREFIX + encodeURIComponent(String(ownerId || '_anon'));
}

function _runningDraftBelongsToCurrentUser(draft, ownerId = _currentRunningDraftOwnerId()) {
  return !!draft?.ownerId && String(draft.ownerId) === String(ownerId || '_anon');
}

function _runningDraftActiveMarker(draft) {
  const ownerId = String(draft?.ownerId || '_anon');
  return {
    version: RUNNING_SESSION_DRAFT_VERSION,
    ownerId,
    phase: _safeRunningPhase(draft?.phase),
    draftKey: _runningDraftKey(ownerId),
    updatedAt: Math.max(0, _num(draft?.updatedAt, _now())),
  };
}

function _buildRunningDraft(context = 'manual') {
  const phase = _safeRunningPhase(_session.phase);
  if (!phase || !_session.startedAt) return null;
  return {
    version: RUNNING_SESSION_DRAFT_VERSION,
    context,
    ownerId: _currentRunningDraftOwnerId(),
    dateKey: _workoutDateKeyFromState() || '',
    phase,
    startedAt: _session.startedAt,
    endedAt: _session.endedAt || null,
    pausedAt: _session.pausedAt || null,
    pausedMs: Math.max(0, _num(_session.pausedMs, 0)),
    route: normalizeRunningRoutePoints(_session.route),
    pendingGapReason: _routeGapReason(_session.pendingGapReason),
    placeSummary: _cloneJson(_session.placeSummary, null),
    goal: _cloneRunningGoal(_session.goal),
    audioGuide: !!_session.audioGuide,
    announcedSplits: Math.max(0, Math.floor(_num(_session.announcedSplits, 0))),
    announcedGoalHalf: !!_session.announcedGoalHalf,
    announcedGoalDone: !!_session.announcedGoalDone,
    lastSpeechAt: Math.max(0, _num(_session.lastSpeechAt, 0)),
    updatedAt: _now(),
  };
}

function _persistRunningDraft(context = 'manual') {
  if (typeof localStorage === 'undefined') return null;
  _clearScheduledRunningRouteDraftPersist();
  const draft = _buildRunningDraft(context);
  if (!draft) return null;
  _lastRunningDraftPersistAt = draft.updatedAt;
  try {
    writeRunningDraftRecord(
      localStorage,
      _runningDraftKey(draft.ownerId),
      RUNNING_SESSION_DRAFT_ACTIVE_KEY,
      draft,
      _runningDraftActiveMarker(draft),
    );
    return draft;
  } catch (error) {
    console.error(`[running-session] draft persistence failed (${context}):`, error);
    _session.lastError = '러닝 임시 저장에 실패했어요. 저장 공간을 확인해주세요.';
    _showToast(_session.lastError, 3000, 'error');
    return null;
  }
}

function _clearScheduledRunningRouteDraftPersist() {
  if (_runningDraftRouteTimer) clearTimeout(_runningDraftRouteTimer);
  _runningDraftRouteTimer = null;
  _runningDraftRoutePendingContext = '';
}

function _scheduleRunningRouteDraftPersist(context = 'route point') {
  if (typeof localStorage === 'undefined') return;
  _runningDraftRoutePendingContext = context;
  const elapsed = _now() - _lastRunningDraftPersistAt;
  if (elapsed >= RUNNING_DRAFT_ROUTE_WRITE_INTERVAL_MS) {
    _persistRunningDraft(context);
    return;
  }
  if (_runningDraftRouteTimer) return;
  _runningDraftRouteTimer = setTimeout(() => {
    _runningDraftRouteTimer = null;
    const pendingContext = _runningDraftRoutePendingContext || context;
    _runningDraftRoutePendingContext = '';
    _persistRunningDraft(pendingContext);
  }, RUNNING_DRAFT_ROUTE_WRITE_INTERVAL_MS - elapsed);
}

function _readRunningDraftFromKey(key) {
  try {
    const stored = readRunningDraftRecord(localStorage, key);
    if (!stored) return null;
    const draft = normalizeRunningSessionDraft(stored);
    if (!draft) clearRunningDraftRecord(localStorage, key);
    return draft;
  } catch {
    try { clearRunningDraftRecord(localStorage, key); } catch {}
    return null;
  }
}

function _readRunningActiveDraft(ownerId) {
  try {
    const raw = localStorage.getItem(RUNNING_SESSION_DRAFT_ACTIVE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    const ownerKey = _runningDraftKey(ownerId);
    if (value?.draftKey) {
      if (!_runningDraftBelongsToCurrentUser(value, ownerId) || value.draftKey !== ownerKey) return null;
      return _readRunningDraftFromKey(ownerKey);
    }
    const legacyDraft = normalizeRunningSessionDraft(value);
    if (!legacyDraft) localStorage.removeItem(RUNNING_SESSION_DRAFT_ACTIVE_KEY);
    return _runningDraftBelongsToCurrentUser(legacyDraft, ownerId) ? legacyDraft : null;
  } catch {
    try { localStorage.removeItem(RUNNING_SESSION_DRAFT_ACTIVE_KEY); } catch {}
    return null;
  }
}

function _readRunningDraft() {
  if (typeof localStorage === 'undefined') return null;
  const ownerId = _currentRunningDraftOwnerId();
  const ownerKey = _runningDraftKey(ownerId);
  const keyedDraft = _readRunningDraftFromKey(ownerKey);
  if (keyedDraft) {
    if (!keyedDraft.ownerId || _runningDraftBelongsToCurrentUser(keyedDraft, ownerId)) return keyedDraft;
    try { clearRunningDraftRecord(localStorage, ownerKey); } catch {}
  }
  return _readRunningActiveDraft(ownerId);
}

function _clearRunningDraft() {
  _clearScheduledRunningRouteDraftPersist();
  if (typeof localStorage === 'undefined') return;
  const ownerId = _currentRunningDraftOwnerId();
  let clearActive = false;
  try {
    const raw = localStorage.getItem(RUNNING_SESSION_DRAFT_ACTIVE_KEY);
    const value = raw ? JSON.parse(raw) : null;
    clearActive = _runningDraftBelongsToCurrentUser(value, ownerId);
  } catch {}
  try { clearRunningDraftRecord(localStorage, _runningDraftKey(ownerId)); } catch {}
  if (clearActive) {
    try { localStorage.removeItem(RUNNING_SESSION_DRAFT_ACTIVE_KEY); } catch {}
  }
}

function _applyRunningDraft(draft) {
  const normalized = normalizeRunningSessionDraft(draft);
  if (!normalized) return false;
  _resetLiveSession();
  _applyRunningDraftDate(normalized.dateKey);
  Object.assign(_session, {
    open: true,
    phase: normalized.phase,
    startedAt: normalized.startedAt,
    endedAt: normalized.endedAt,
    pausedAt: normalized.pausedAt,
    pausedMs: normalized.pausedMs,
    route: normalized.route,
    routeRevision: normalized.route.length,
    pendingGapReason: normalized.pendingGapReason,
    previewPoint: normalized.route[normalized.route.length - 1] || null,
    placeSummary: normalized.placeSummary,
    goal: normalized.goal,
    audioGuide: normalized.audioGuide,
    announcedSplits: normalized.announcedSplits,
    announcedGoalHalf: normalized.announcedGoalHalf,
    announcedGoalDone: normalized.announcedGoalDone,
    lastSpeechAt: normalized.lastSpeechAt,
  });
  _session.routeAccumulator.rebuild(normalized.route);
  const summary = _currentSummary();
  _syncWorkoutRunData(summary, _session.placeSummary || _runningPlaceFallback(summary));
  return true;
}

function _restoreRunningDraftIfAvailable() {
  const draft = _readRunningDraft();
  if (!draft || !_applyRunningDraft(draft)) return false;
  S.workout.sessionIndex = WORKOUT_RUNNING_SESSION_INDEX;
  S.workout.sessionId = RUNNING_SESSION_ID;
  if (_session.phase === 'active') {
    if (!_nativeRunningLocationPlugin()) _markRouteGap('restore');
    _startWatch();
  }
  if (_session.phase === 'active' || _session.phase === 'paused') _startTicker();
  _publishRunningLiveState(_session.phase === 'active' || _session.phase === 'paused');
  _render();
  _showToast('이전 러닝 기록을 복구했어요', 1800, 'success');
  return true;
}

function _bindRunningDraftEvents() {
  if (_runningDraftEventsBound || typeof window === 'undefined') return;
  _runningDraftEventsBound = true;
  window.addEventListener('pagehide', () => {
    if (!_nativeRunningLocationPlugin()) _markRouteGap('pagehide');
    _persistRunningDraft('pagehide');
  });
  window.addEventListener('beforeunload', () => {
    if (!_nativeRunningLocationPlugin()) _markRouteGap('beforeunload');
    _persistRunningDraft('beforeunload');
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (!_nativeRunningLocationPlugin()) _markRouteGap('visibility-hidden');
        _persistRunningDraft('visibility hidden');
      }
    });
  }
}

function _runningPlaceFallback(summary, status = 'resolving') {
  if (!summary?.centroid) return { status: 'unavailable', label: '위치 정보 없음', provider: null };
  const label = status === 'resolved'
    ? '위치 기록'
    : status === 'unavailable'
      ? 'GPS 위치 기록'
      : '위치 확인 중';
  return { status, label, provider: 'vworld' };
}

function _formatVworldPlace(result = null) {
  const structure = result?.structure || {};
  const city = structure.level1 || '';
  const district = structure.level2 || '';
  const legalDong = structure.level4L || structure.level3 || '';
  const adminDong = structure.level4A || '';
  const dong = adminDong || legalDong;
  const label = [dong, district, city].filter(Boolean).join(', ');
  if (!label) return null;
  return {
    label,
    adminArea: { city, district, dong, legalDong, adminDong },
  };
}

export async function resolveRunningPlaceSummary(summary) {
  const center = summary?.centroid;
  if (!Number.isFinite(Number(center?.lat)) || !Number.isFinite(Number(center?.lng))) return _runningPlaceFallback(summary, 'unavailable');
  const config = readRunningMapConfig();
  const key = config?.key;
  if (!key) return _runningPlaceFallback(summary, 'unavailable');
  const point = `${encodeURIComponent(center.lng)},${encodeURIComponent(center.lat)}`;
  const url = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${point}&format=json&type=BOTH&zipcode=false&simple=false&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`vworld status ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json?.response?.result) ? json.response.result : [];
    const parsed = _formatVworldPlace(results.find(item => item?.type === 'parcel') || results[0]);
    if (!parsed) return _runningPlaceFallback(summary, 'unavailable');
    return {
      status: 'resolved',
      label: parsed.label,
      provider: 'vworld',
      point: center,
      adminArea: parsed.adminArea,
    };
  } catch (e) {
    console.warn('[running-session] place lookup failed:', e);
    return _runningPlaceFallback(summary, 'unavailable');
  }
}

async function _ensureRunningPlaceSummary(summary) {
  if (_session.placeSummary?.status === 'resolved') return _session.placeSummary;
  if (!_session.placePromise) {
    _session.placePromise = resolveRunningPlaceSummary(summary).then((place) => {
      _session.placeSummary = place;
      _session.placePromise = null;
      _persistRunningDraft('place resolved');
      return place;
    });
  }
  return _session.placePromise;
}

function _matchingCapturedRouteReference(routeRef, route) {
  if (!routeRef || typeof routeRef !== 'object' || route.length === 0) return null;
  const firstTimestampMs = route[0]?.ts;
  const lastTimestampMs = route.at(-1)?.ts;
  return Number(routeRef.pointCount) === route.length
    && Number(routeRef.firstTimestampMs) === firstTimestampMs
    && Number(routeRef.lastTimestampMs) === lastTimestampMs
    ? routeRef
    : null;
}

function _syncWorkoutRunData(summary, placeSummary = _session.placeSummary) {
  const route = normalizeRunningRoutePoints(_session.route);
  const routeRef = _matchingCapturedRouteReference(S.workout.runData?.routeRef, route);
  applyRunningDataToWorkout(S.workout, runningInputFromPhoneSummary(summary, {
    route,
    routeRef,
    placeSummary: placeSummary || _runningPlaceFallback(summary),
  }), {
    sessionIndex: WORKOUT_RUNNING_SESSION_INDEX,
    sessionId: RUNNING_SESSION_ID,
  });
}

function _resetLiveSession(options = {}) {
  if (!options.skipStop) void _stopWatch('reset');
  _stopTicker();
  _clearScheduledRunningRouteDraftPersist();
  _lastRunningDraftPersistAt = 0;
  Object.assign(_session, {
    phase: 'start',
    watchId: null,
    tickId: null,
    startedAt: null,
    endedAt: null,
    pausedAt: null,
    pausedMs: 0,
    route: [],
    routeRevision: 0,
    pendingGapReason: '',
    previewPoint: null,
    lastError: '',
    saving: false,
    placeSummary: null,
    placePromise: null,
    goal: { ...DEFAULT_RUNNING_GOAL },
    audioGuide: true,
    announcedSplits: 0,
    announcedGoalHalf: false,
    announcedGoalDone: false,
    lastSpeechAt: 0,
    nativeLocationStarted: false,
    nativeLocationCursor: 0,
    nativeLocationPollId: null,
    lastMapRenderAt: 0,
  });
  _session.routeAccumulator.reset();
}

function _publishRunningLiveState(active = false) {
  const sourceRoute = _session.route;
  const route = buildRunningRoutePreview(sourceRoute, RUNNING_ROUTE_PREVIEW_POINTS);
  const routeSummary = sourceRoute.length ? _currentSummary() : null;
  const detail = {
    active: !!active,
    phase: _session.phase,
    startedAt: _session.startedAt || null,
    updatedAt: _now(),
    pointCount: sourceRoute.length,
    route,
    routeSummary,
    placeSummary: _session.placeSummary || (routeSummary ? _runningPlaceFallback(routeSummary) : null),
    previewPoint: _session.previewPoint || route[route.length - 1] || null
  };
  setRunningLiveState(detail);
  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('life-zone:running-live', { detail }));
  }
  const shouldResolvePlace = active
    && routeSummary?.centroid
    && !_session.placePromise
    && _session.placeSummary?.status !== 'resolved'
    && _session.placeSummary?.status !== 'unavailable';
  if (shouldResolvePlace) {
    _ensureRunningPlaceSummary(routeSummary).then(() => {
      if (_session.open && (_session.phase === 'active' || _session.phase === 'paused')) {
        _publishRunningLiveState(true);
      }
    });
  }
}

function _nativeRunningLocationPlugin() {
  if (typeof window === 'undefined') return null;
  const capacitor = window.Capacitor;
  const plugin = capacitor?.Plugins?.TomatoRunningLocation;
  if (!plugin) return null;
  if (typeof capacitor?.isNativePlatform === 'function' && !capacitor.isNativePlatform()) return null;
  return plugin;
}

function _clearNativeLocationPoll() {
  if (_session.nativeLocationPollId) clearInterval(_session.nativeLocationPollId);
  _session.nativeLocationPollId = null;
}

function _nativePointToRoutePoint(point = {}) {
  return _safePoint({
    lat: Number(point.lat),
    lng: Number(point.lng),
    ts: Number(point.ts ?? point.timestamp ?? point.timestampMs),
    accuracy: point.accuracy == null ? null : Number(point.accuracy),
    altitude: point.altitude == null ? null : Number(point.altitude),
    speed: point.speed == null ? null : Number(point.speed),
    bearing: point.bearing == null ? null : Number(point.bearing),
  });
}

function _isUsableLiveGpsPoint(point, now = _now()) {
  if (!point) return false;
  const ageMs = now - Number(point.ts);
  if (!Number.isFinite(ageMs) || ageMs > MAX_LIVE_GPS_AGE_MS) return false;
  const accuracy = Number(point.accuracy);
  if (Number.isFinite(accuracy) && accuracy > MAX_LIVE_GPS_ACCURACY_M) return false;
  const last = _session.route[_session.route.length - 1];
  if (!last) return true;
  const elapsedSec = (Number(point.ts) - Number(last.ts)) / 1000;
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return false;
  const inferredSpeedMps = runningDistanceMeters(last, point) / elapsedSec;
  return Number.isFinite(inferredSpeedMps) && inferredSpeedMps <= MAX_PLAUSIBLE_RUNNING_SPEED_MPS;
}

function _ingestNativeLocationResult(result = {}) {
  const points = Array.isArray(result.points) ? result.points : [];
  let changed = false;
  points.forEach(raw => {
    const point = _nativePointToRoutePoint(raw);
    if (!_isUsableLiveGpsPoint(point)) return;
    if (_pushRoutePoint(point)) changed = true;
  });
  const nextIndex = Number(result.nextIndex);
  if (Number.isFinite(nextIndex) && nextIndex >= 0) _session.nativeLocationCursor = Math.floor(nextIndex);
  if (changed) {
    _session.lastError = '';
    _publishRunningLiveState(_session.phase === 'active' || _session.phase === 'paused');
    _scheduleRunningRouteDraftPersist('native route point');
    if (_session.open) _render();
  }
  return changed;
}

async function _drainNativeLocationUpdates(plugin = _nativeRunningLocationPlugin()) {
  if (!plugin?.getUpdates || !_session.nativeLocationStarted) return false;
  const result = await plugin.getUpdates({ afterIndex: _session.nativeLocationCursor });
  return _ingestNativeLocationResult(result);
}

async function _startNativeLocationWatch(plugin) {
  _clearNativeLocationPoll();
  try {
    if (!_session.nativeLocationStarted) {
      const status = await plugin.getStatus?.();
      const canResume = !!status?.tracking
        && Math.abs(Number(status.startedAt || 0) - Number(_session.startedAt || 0)) < 60_000;
      if (canResume) {
        _session.nativeLocationStarted = true;
        _session.nativeLocationCursor = 0;
        await plugin.resumeTracking?.();
      } else {
        const started = await plugin.startTracking({ startedAt: _session.startedAt || _now() });
        _session.nativeLocationStarted = true;
        _session.nativeLocationCursor = 0;
        _ingestNativeLocationResult(started);
      }
    } else {
      await plugin.resumeTracking?.();
    }
    await _drainNativeLocationUpdates(plugin);
    _session.nativeLocationPollId = setInterval(() => {
      _drainNativeLocationUpdates(plugin).catch(error => {
        console.warn('[running-session] native GPS poll failed:', error);
      });
    }, NATIVE_LOCATION_POLL_MS);
  } catch (error) {
    _session.nativeLocationStarted = false;
    _session.lastError = '휴대폰 위치 권한을 허용해주세요';
    console.warn('[running-session] native GPS start failed:', error);
    if (_session.open) _render();
  }
}

async function _stopWatch(mode = 'pause') {
  _clearNativeLocationPoll();
  const nativePlugin = _nativeRunningLocationPlugin();
  if (_session.nativeLocationStarted && nativePlugin) {
    try {
      if (mode === 'finish') {
        const result = await nativePlugin.stopTracking?.({ afterIndex: _session.nativeLocationCursor });
        _ingestNativeLocationResult(result);
        _session.nativeLocationStarted = false;
      } else if (mode === 'reset') {
        await nativePlugin.stopTracking?.();
        _session.nativeLocationStarted = false;
      } else {
        await _drainNativeLocationUpdates(nativePlugin);
        await nativePlugin.pauseTracking?.();
      }
    } catch (error) {
      console.warn(`[running-session] native GPS ${mode} failed:`, error);
    }
  }
  if (_session.watchId != null && typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) {
    if (typeof _session.watchId === 'number') navigator.geolocation.clearWatch(_session.watchId);
  }
  _session.watchId = null;
}

function _stopTicker() {
  if (_session.tickId) clearInterval(_session.tickId);
  _session.tickId = null;
}

function _startTicker() {
  _stopTicker();
  _session.tickId = setInterval(() => {
    if (_session.open && (_session.phase === 'active' || _session.phase === 'paused')) {
      _checkRunningAudioCues();
      _render();
    }
  }, 1000);
}

function _positionToPoint(position) {
  const coords = position?.coords || {};
  const sensor = _readRunningSensorSnapshot(position);
  const point = _safePoint({
    lat: coords.latitude,
    lng: coords.longitude,
    ts: position?.timestamp ?? _now(),
    accuracy: coords.accuracy,
    altitude: coords.altitude ?? sensor.altitude,
    speed: coords.speed,
    bearing: coords.heading,
    heartRateBpm: sensor.heartRateBpm,
    cadenceSpm: sensor.cadenceSpm,
  });
  return _isUsableLiveGpsPoint(point) ? point : null;
}

function _markRouteGap(reason = 'interruption') {
  if (!_session.open || !_session.route.length) return false;
  if (_session.phase !== 'active' && _session.phase !== 'paused') return false;
  _session.pendingGapReason = _routeGapReason(reason) || 'interruption';
  return true;
}

function _pushRoutePoint(point, options = {}) {
  const safe = _safePoint(point);
  if (!safe) {
    _rejectRunningRoutePoint('GPS 좌표가 올바르지 않아 이 위치를 기록하지 않았어요.');
    return false;
  }

  let normalized;
  try {
    [normalized] = normalizeRunningRoutePoints([safe]);
  } catch (error) {
    _rejectRunningRoutePoint('GPS 좌표가 올바르지 않아 이 위치를 기록하지 않았어요.', error);
    return false;
  }

  if (_session.route.length >= MAX_RUNNING_ROUTE_POINTS) {
    _pauseRunningCaptureAtRouteLimit();
    return false;
  }

  const last = _session.route[_session.route.length - 1];
  const pendingReason = _routeGapReason(options.gapReason) || _routeGapReason(_session.pendingGapReason);
  if (last && normalized.ts < last.ts) {
    _rejectRunningRoutePoint('이전 위치보다 오래된 GPS 좌표를 기록하지 않았어요.');
    return false;
  }
  const sourceGapReason = normalized.gapBefore === true
    ? _routeGapReason(normalized.gapReason) || 'interruption'
    : '';
  const gapReason = last && (options.gapBefore || pendingReason || sourceGapReason)
    ? pendingReason || sourceGapReason || 'resume'
    : '';

  const segmentId = last ? _routeSegmentId(last, 0) + (gapReason ? 1 : 0) : 0;
  const stored = { ...normalized, segmentId };
  if (gapReason) {
    stored.gapBefore = true;
    stored.gapReason = gapReason;
  }
  _session.route.push(stored);
  _session.routeAccumulator.append(stored);
  _session.routeRevision += 1;
  _session.pendingGapReason = '';
  if (_session.route.length === MAX_RUNNING_ROUTE_POINTS) {
    _pauseRunningCaptureAtRouteLimit();
    return false;
  }
  return true;
}

function _pauseRunningCaptureAtRouteLimit() {
  if (_session.phase === 'active') {
    _session.phase = 'paused';
    _session.pausedAt = _now();
  }
  _session.lastError = '더 이상 경로를 기록할 수 없습니다. 러닝을 저장한 뒤 새로 시작해주세요.';
  console.error('[running-session] route point limit reached:', MAX_RUNNING_ROUTE_POINTS);
  _stopWatch();
  _stopTicker();
  _publishRunningLiveState(false);
  _persistRunningDraft('route point limit');
  _render();
  _showToast(_session.lastError, 3500, 'error');
}

function _rejectRunningRoutePoint(message, error = null) {
  _session.lastError = message;
  if (error) console.warn('[running-session] route point rejected:', error);
  if (_session.open) _render();
}

function _requestActiveSeedPosition() {
  if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) return;
  navigator.geolocation.getCurrentPosition(
    position => {
      if (!_session.open || _session.phase !== 'active' || _session.route.length) return;
      _pushPosition(position, { force: true });
      _render();
    },
    () => {},
    GEO_OPTIONS
  );
}

function _seedRunningStartPoint() {
  if (_session.previewPoint
    && _isUsableLiveGpsPoint(_session.previewPoint)
    && _pushRoutePoint(_session.previewPoint, { force: true })) return;
  _requestActiveSeedPosition();
}

function _readRunningSensorSnapshot(position = null) {
  if (typeof window === 'undefined') return {};
  const providers = [
    window.__tomatoRunningSensorSnapshot,
    window.__tomatoRunningSensors?.snapshot,
    window.__tomatoRunningSensors?.getSnapshot,
    window.TomatoRunningSensors?.getSnapshot,
  ].filter(Boolean);
  for (const provider of providers) {
    try {
      const raw = typeof provider === 'function'
        ? provider({ position, phase: _session.phase, startedAt: _session.startedAt })
        : provider;
      if (!raw || typeof raw !== 'object') continue;
      return {
        altitude: _optionalFiniteNumber(raw.altitudeM ?? raw.altitude),
        heartRateBpm: _optionalNumber(raw.heartRateBpm ?? raw.heartRate ?? raw.bpm),
        cadenceSpm: _optionalNumber(raw.cadenceSpm ?? raw.cadence ?? raw.stepsPerMinute),
      };
    } catch (e) {
      console.warn('[running-session] sensor snapshot skipped:', e);
    }
  }
  return {};
}

function _pushPosition(position, options = {}) {
  const point = _positionToPoint(position);
  if (!_pushRoutePoint(point, options)) return;
  _publishRunningLiveState(true);
  _scheduleRunningRouteDraftPersist('route point');
}

function _startWatch() {
  const nativePlugin = _nativeRunningLocationPlugin();
  if (nativePlugin) {
    _session.watchId = 'native';
    void _startNativeLocationWatch(nativePlugin);
    return;
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) {
    _session.lastError = '이 브라우저는 위치 기록을 지원하지 않아요';
    return;
  }
  _session.watchId = navigator.geolocation.watchPosition(
    position => {
      _session.lastError = '';
      if (_session.phase === 'active') _pushPosition(position);
    },
    error => {
      _session.lastError = error?.message || 'GPS 권한을 확인해주세요';
      _render();
    },
    GEO_OPTIONS
  );
}

function _beginRunningSession(goal, audioGuide, previewPoint) {
  _session.goal = goal;
  _session.audioGuide = audioGuide;
  _session.previewPoint = previewPoint;
  _session.open = true;
  _session.phase = 'active';
  _session.startedAt = _now();
  _session.pausedMs = 0;
  _seedRunningStartPoint();
  _startWatch();
  _startTicker();
  _publishRunningLiveState(true);
  _render();
  const goalText = _session.goal.type === 'free' ? '' : `${_runningGoalLabel(_session.goal)} 목표 `;
  _speakRunning(`${goalText}러닝을 시작합니다.`, { force: true });
  _persistRunningDraft('start');
}

function _startRun() {
  const goal = _cloneRunningGoal(_session.goal);
  const audioGuide = !!_session.audioGuide;
  const previewPoint = _session.previewPoint;
  if (_nativeRunningLocationPlugin()) {
    void (async () => {
      await _stopWatch('reset');
      _resetLiveSession({ skipStop: true });
      _beginRunningSession(goal, audioGuide, previewPoint);
    })();
    return;
  }
  _resetLiveSession();
  _beginRunningSession(goal, audioGuide, previewPoint);
}

function _pauseRun() {
  if (_session.phase !== 'active') return;
  _session.phase = 'paused';
  _session.pausedAt = _now();
  _markRouteGap('pause');
  void _stopWatch('pause');
  _publishRunningLiveState(true);
  _render();
  _speakRunning('러닝을 일시정지했습니다.', { force: true });
  _persistRunningDraft('pause');
}

function _resumeRun() {
  if (_session.phase !== 'paused') return;
  if (_session.pausedAt) _session.pausedMs += Math.max(0, _now() - _session.pausedAt);
  _session.phase = 'active';
  _session.pausedAt = null;
  _startWatch();
  _publishRunningLiveState(true);
  _render();
  _speakRunning('러닝을 다시 시작합니다.', { force: true });
  _persistRunningDraft('resume');
}

async function _finishRun() {
  if (_session.phase !== 'active' && _session.phase !== 'paused') return;
  if (_session.phase === 'paused' && _session.pausedAt) {
    _session.pausedMs += Math.max(0, _now() - _session.pausedAt);
  }
  _session.pausedAt = null;
  await _stopWatch('finish');
  _session.phase = 'summary';
  _session.endedAt = _now();
  _stopTicker();
  const summary = _currentSummary();
  _session.placeSummary = _runningPlaceFallback(summary);
  _syncWorkoutRunData(summary);
  _publishRunningLiveState(false);
  _render();
  _speakRunning(`러닝 완료. ${summary.distanceKm.toFixed(2)}킬로미터, 시간 ${_runningSpeechDuration(summary.durationSec)}, ${_runningSpeechPace(summary)}`, { force: true });
  _persistRunningDraft('finish');
  _ensureRunningPlaceSummary(summary).then((place) => {
    _syncWorkoutRunData(_currentSummary(), place);
    _persistRunningDraft('finish place resolved');
    if (_session.open && _session.phase === 'summary') _render();
  });
}

async function _saveSummary() {
  if (_session.saving) return;
  _session.saving = true;
  const summary = _currentSummary();
  const draft = _readRunningDraft();
  const targetDateKey = draft
    ? _ensureRunningWorkoutDate(draft.dateKey, { allowCurrent: false })
    : _workoutDateKeyFromState();
  const targetSessionIndex = _workoutSessionIndexFromState();
  const placeSummary = await _ensureRunningPlaceSummary(summary);
  _syncWorkoutRunData(summary, placeSummary);
  _render();
  try {
    if (!targetDateKey) throw new Error('running save skipped: restored workout date is unavailable');
    const { saveWorkoutDay } = await import('./save.js');
    const saved = await saveWorkoutDay({ silent: true });
    if (!saved) throw new Error('running save skipped: workout date is unavailable or invalid');
    await _showToast('러닝 기록 저장 완료', 2200, 'success');
  } catch (e) {
    console.error('[running-session] save failed:', e);
    _session.saving = false;
    _render();
    return;
  }
  wtCloseRunningSession();
  if (targetDateKey) {
    try {
      openWorkoutDaySheet(targetDateKey, {
        sessionIndex: targetSessionIndex,
        sheetState: 'full',
        history: 'replace',
        action: 'running:save-detail',
      });
    } catch (e) {
      console.warn('[running-session] saved but detail sheet open failed:', e);
    }
  }
}

function _latestRouteMetric(key) {
  for (let i = _session.route.length - 1; i >= 0; i -= 1) {
    const value = _optionalNumber(_session.route[i]?.[key]);
    if (value != null) return Math.round(value);
  }
  return null;
}

function _renderRunningMetrics(items, className = 'wt-running-primary-stats', label = '러닝 지표') {
  return `
    <div class="${className}" aria-label="${_escapeHtml(label)}">
      ${items.map(item => `
        <span>
          <strong>${_escapeHtml(item.value)}</strong>
          <i>${_escapeHtml(item.label)}</i>
        </span>
      `).join('')}
    </div>
  `;
}

function _renderRunningLiveOverview(distance, stats) {
  return `
    <div class="wt-running-overview wt-running-live-overview">
      <div class="wt-running-distance-hero">
        <strong>${_escapeHtml(distance)}</strong>
        <span>KM</span>
      </div>
      ${_renderRunningMetrics(stats, 'wt-running-primary-stats', '러닝 핵심 지표')}
    </div>
  `;
}

function _renderProgress() {
  const summary = _currentSummary();
  const elapsed = _elapsedSec();
  const isPaused = _session.phase === 'paused';
  const pace = summary.distanceKm > 0 ? formatRunningPace(elapsed / summary.distanceKm) : "--'--''";
  const bpm = summary.avgHeartRateBpm == null ? _latestRouteMetric('heartRateBpm') : summary.avgHeartRateBpm;
  const state = isPaused ? '일시정지' : '러닝 중';
  const stats = [
    { label: '시간', value: formatRunningDuration(elapsed) },
    { label: '평균 페이스', value: pace },
    { label: '심박', value: bpm == null ? '--' : `${Math.round(bpm)} bpm` },
  ];
  return `
    <article class="wt-day-ex-card wt-max-read-card wt-running-read-card wt-running-live-card" data-running-screen="progress">
      <div class="wt-max-card-kicker wt-running-card-kicker">
        <span><i></i>OUTDOOR RUN</span>
        <em class="wt-running-live-state ${isPaused ? 'is-paused' : ''}">${state}</em>
      </div>
      ${_renderRunningLiveOverview(summary.distanceKm.toFixed(2), stats)}
      ${_session.lastError ? `<p class="wt-running-live-status is-error">${_escapeHtml(_session.lastError)}</p>` : ''}
      ${_renderLiveRunningMap()}
      <div class="wt-max-actions">
        <button type="button" class="wt-max-action-primary" data-running-action="${isPaused ? 'resume' : 'pause'}">${isPaused ? '계속' : '일시정지'}</button>
        <button type="button" class="wt-max-action-secondary" data-running-action="finish">종료</button>
      </div>
    </article>
  `;
}

function _renderSummary() {
  const summary = _currentSummary();
  const distance = summary.distanceKm.toFixed(2);
  const pace = formatRunningPace(summary.avgPaceSecPerKm);
  const time = formatRunningDuration(summary.durationSec);
  const location = _session.placeSummary?.label || _runningPlaceFallback(summary).label;
  const stats = [
    { label: '시간', value: time },
    { label: '평균 페이스', value: pace },
    { label: '심박', value: summary.avgHeartRateBpm == null ? '--' : `${Math.round(summary.avgHeartRateBpm)} bpm` },
  ];
  return `
    <article class="wt-day-ex-card wt-max-read-card wt-running-read-card wt-running-live-card is-summary" data-running-screen="summary">
      <div class="wt-max-card-kicker wt-running-card-kicker">
        <span><i></i>RUN COMPLETE</span>
        <em class="wt-running-live-state is-finished">완료</em>
      </div>
      <div class="wt-max-card-name">러닝 완료</div>
      ${_renderRunningLiveOverview(distance, stats)}
      <p class="wt-running-live-status">${_escapeHtml(location)}</p>
      ${_renderLiveRunningMap()}
      <div class="wt-max-actions wt-max-actions--single">
        <button type="button" class="wt-max-action-primary" data-running-action="save" ${_session.saving ? 'disabled' : ''}>${_session.saving ? '저장 중' : '러닝 기록 저장'}</button>
      </div>
    </article>
  `;
}

function _renderLiveRunningMap() {
  return `
    <div class="wt-running-route-wrap wt-running-live-route-wrap">
      <div class="wt-running-route-map wt-run-real-map is-active" data-running-real-map="live" data-running-live-map aria-label="실시간 러닝 GPS 경로 지도">
        <div class="wt-run-map-canvas" data-running-map-canvas></div>
        <div class="wt-run-map-status" data-running-map-status>경로 준비 중</div>
      </div>
    </div>
  `;
}

function _liveRunningMapKey() {
  return _session.phase;
}

function _liveRunningRenderPoints() {
  return buildRunningRouteModel(_session.route).renderRoute;
}

function _mountLiveRunningMap(shell, key) {
  if (!shell) return;
  shell.dataset.runningLiveMapKey = key;
  shell.dataset.runningLiveMapRevision = String(_session.routeRevision);
  _session.lastMapRenderAt = _now();
  const phase = _session.phase === 'summary' ? 'detail' : _session.phase;
  const points = _liveRunningRenderPoints();
  renderRunningMap(shell, { points, phase }).catch(error => {
    if (shell.dataset.runningLiveMapKey !== key) return;
    console.warn('[running-session] live map render failed:', error);
  });
}

function _syncInlineRunningVisibility(open, root = _root()) {
  const host = root?.closest?.('[data-wt-running-session-host]');
  if (host) host.hidden = !open;
  document.querySelectorAll?.('[data-wt-running-empty]').forEach(empty => { empty.hidden = !!open; });
  const detail = root?.closest?.('.wt-day-detail');
  detail?.querySelector?.('.wt-day-fab--running')?.toggleAttribute('hidden', !!open);
}

function _render() {
  const root = _root();
  if (!root || !_session.open) {
    _syncInlineRunningVisibility(false, root);
    return;
  }
  root.classList.add('is-open');
  root.hidden = false;
  _syncInlineRunningVisibility(true, root);
  const previousMap = root.querySelector('[data-running-live-map]');
  const mapKey = _liveRunningMapKey();
  root.innerHTML = _session.phase === 'summary' ? _renderSummary() : _renderProgress();
  const nextMap = root.querySelector('[data-running-live-map]');
  if (previousMap?.dataset.runningLiveMapKey === mapKey && nextMap) {
    nextMap.replaceWith(previousMap);
    const renderedRevision = Number(previousMap.dataset.runningLiveMapRevision || -1);
    const routeChanged = renderedRevision !== _session.routeRevision;
    const updateDue = (_now() - _session.lastMapRenderAt) >= RUNNING_MAP_UPDATE_INTERVAL_MS;
    if (!routeChanged || (!updateDue && _session.phase !== 'summary')) return;
    const phase = _session.phase === 'summary' ? 'detail' : _session.phase;
    updateRunningMap(previousMap, { points: _liveRunningRenderPoints(), phase }).catch(error => {
      console.warn('[running-session] live map update failed:', error);
    });
    previousMap.dataset.runningLiveMapRevision = String(_session.routeRevision);
    _session.lastMapRenderAt = _now();
    return;
  }
  destroyRunningMaps(previousMap);
  _mountLiveRunningMap(nextMap, mapKey);
}

function _handleAction(action) {
  if (!action || action === 'noop') return;
  if (action === 'close') return wtCloseRunningSession();
  if (action === 'start') return _startRun();
  if (action === 'pause') return _pauseRun();
  if (action === 'resume') return _resumeRun();
  if (action === 'finish') return _finishRun();
  if (action === 'save') return _saveSummary();
}

export function initRunningSession() {
  const root = _root();
  _bindRunningDraftEvents();
  if (!root || root.dataset.runningSessionBound === '1') return;
  root.dataset.runningSessionBound = '1';
  root.hidden = true;
  root.addEventListener('click', event => {
    const actionEl = event.target?.closest?.('[data-running-action]');
    if (!actionEl || !root.contains(actionEl)) return;
    event.preventDefault();
    _handleAction(actionEl.getAttribute('data-running-action'));
  });
}

export function wtMountRunningSession() {
  initRunningSession();
  if (_session.open) _render();
}

export function wtOpenRunningSession() {
  if (!_root() && typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('workout:select-running'));
  }
  initRunningSession();
  if (!_root()) {
    _showToast('러닝 화면을 먼저 열어주세요', 2200, 'warning');
    return false;
  }
  if (_session.open) {
    _render();
    return;
  }
  if (wtRestoreRunningSessionIfActive()) return;
  _resetLiveSession();
  S.workout.sessionIndex = WORKOUT_RUNNING_SESSION_INDEX;
  S.workout.sessionId = RUNNING_SESSION_ID;
  _session.open = true;
  _startRun();
  return true;
}

export function wtRestoreRunningSessionIfActive() {
  initRunningSession();
  return _restoreRunningDraftIfAvailable();
}

export function wtCloseRunningSession() {
  const root = _root();
  _clearRunningDraft();
  _resetLiveSession();
  _session.open = false;
  _publishRunningLiveState(false);
  if (root) {
    destroyRunningMaps(root);
    root.classList.remove('is-open');
    root.hidden = true;
    root.innerHTML = '';
  }
  _syncInlineRunningVisibility(false, root);
}

export function wtHandleRunningSessionBack() {
  if (!_session.open) return false;
  if (_session.phase === 'active') {
    _pauseRun();
    return true;
  }
  wtCloseRunningSession();
  return true;
}
