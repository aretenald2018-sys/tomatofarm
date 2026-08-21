import { toFiniteNumber as _num } from '../utils/number.js';
import { escapeHtml as _esc } from '../utils/escape-html.js';
import { parseDateKey as _parseDateKey } from '../utils/date-key.js';
import {
  getCache,
  getExList,
  getLatestCheckinWeight,
  getSeasonRegistry,
} from '../data.js';
import { selectSeasonGraphCache } from '../data/season-model.js';
import {
  getWorkoutSessions,
  hasWorkoutGymCardData,
} from '../workout/sessions.js';
import {
  WORKOUT_GYM_SESSION_COUNT,
  WORKOUT_RUNNING_SESSION_INDEX,
} from '../workout/session-policy.js';
import {
  clearRunningSessionFields,
  runningOnlySessionFields,
} from '../workout/running-model.js';
import {
  isWorkoutRunningTabIndex,
  runningStackSession,
  runningTrackSessionInfo,
} from '../workout/calendar-running.js';
import {
  formatRunningPaceCard as _formatRunningPaceCard,
  runningGpsInfoLabel as _runningGpsInfoLabel,
  runningMetricItems as _runningMetricItems,
  runningPlaceLabel as _runningPlaceLabel,
  runningSourceLabel as _runningSourceLabel,
} from '../workout/running-presentation.js';
import {
  formatManualCardioMetric as _formatCardioMetric,
  manualCardioSummaryText as _cardioSummaryText,
} from '../workout/cardio-model.js';
import {
  activeWorkoutTrack,
  buildWorkoutTrackTrend,
  formatWorkoutTrackValue,
  workoutFallbackSparkValues,
  workoutTrackLabel,
} from '../workout/track-metrics.js';
import {
  formatWorkoutCompletionElapsed,
  latestWorkoutCompletionAt,
} from '../workout/completion-metrics.js';
import { isWorkoutExerciseComplete } from '../workout/exercise-completion.js';
import {
  bestWorkoutSet,
  formatWorkoutKg,
  formatWorkoutReps,
  normalizeWorkoutSetType,
  workoutSetSummary,
  workoutSetTypeClass,
  workoutSetTypeLabel,
} from '../workout/set-presentation.js';
import {
  _dateDistanceLabel,
  _dateTitle,
  _fmtNum,
  _formatDurationShort,
  _workoutSheetInputValue,
} from './format.js';
import {
  _activityRows,
  _weightAt,
} from './day-metrics.js';
import {
  _buildWorkoutLookup,
  _workoutMetrics,
} from './workout-read-model.js';

const WORKOUT_SET_TYPE_OPTIONS = [
  { type: 'main', code: 'M', label: '메인세트', className: 'is-main' },
  { type: 'warmup', code: 'W', label: '웜업세트', className: 'is-warmup' },
  { type: 'drop', code: 'D', label: '드랍세트', className: 'is-drop' },
  { type: 'failure', code: 'F', label: '실패세트', className: 'is-failure' },
];

const workoutDetailRuntime = {
  getSelectedKey: () => '',
  getSessionIndex: () => 0,
  setSessionIndex: () => {},
  recordOrdinal: () => 0,
  registerRunningMapPayload: () => '',
  sessionLabel: index => `${Math.max(0, Math.floor(Number(index) || 0)) + 1}회차`,
};

export const _workoutDetailCollapsed = new Set();
export const _workoutExerciseCompletionStamps = new Map();
export const _workoutExpandedSetEditors = new Set();
export const _workoutOpenSetTypeMenus = new Set();
// 슈퍼세트 묶기 메뉴 열림 상태 — `${key}:${sessionIndex}:${exerciseIndex}` 키.
export const _workoutOpenSupersetMenus = new Set();
export const workoutDetailState = {
  editingCardId: null,
  inlineSetEditor: null,
};

export function configureWorkoutDetailTemplate(runtime = {}) {
  Object.assign(workoutDetailRuntime, runtime);
}

let _workoutTrackGraphSeq = 0;

// 시트 본문(요약 카드 + 종목 카드)이 읽는 모델은 하나다. 전체 렌더와 세트 편집용
// 부분 갱신이 같은 값을 보도록 여기서만 만든다.
export function _workoutHomeDetailModel({ cache, plan, checkins, key }) {
  const lookup = _buildWorkoutLookup();
  const day = cache[key] || {};
  const sessions = getWorkoutSessions(day, { minCount: WORKOUT_RUNNING_SESSION_INDEX + 1 });
  if (workoutDetailRuntime.getSessionIndex() > WORKOUT_RUNNING_SESSION_INDEX) workoutDetailRuntime.setSessionIndex(WORKOUT_RUNNING_SESSION_INDEX);
  const runningInfo = runningTrackSessionInfo(sessions);
  const runningActive = isWorkoutRunningTabIndex(workoutDetailRuntime.getSessionIndex());
  const sessionIndex = runningActive
    ? runningInfo.index
    : Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(workoutDetailRuntime.getSessionIndex()) || 0)));
  const rawSession = sessions[sessionIndex] || sessions[0] || {};
  const runningStack = runningActive
    ? runningStackSession({ session: runningInfo.session, activities: runningInfo.runningSessions }, _activityRows)
    : null;
  const session = runningActive
    ? (runningStack?.session || runningOnlySessionFields(runningInfo.session))
    : clearRunningSessionFields(rawSession);
  const bodyWeight = _weightAt(checkins, key) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
  const wx = _workoutMetrics(key, session, bodyWeight, lookup, {
    includeDraftExercises: true,
    includePreviousRecord: true,
    cache,
  });
  if (runningActive && runningStack?.rows?.length) {
    const activityDurationSec = runningStack.rows.reduce((sum, row) => sum + (row.durationSec || 0), 0);
    wx.activities = runningStack.rows;
    wx.activityDurationSec = activityDurationSec;
    wx.durationSec = Math.max(wx.durationSec || 0, activityDurationSec);
    wx.displayLabels = runningStack.rows.map(row => ({
      text: row.label,
      title: row.main ? `${row.label} · ${row.main}` : row.label,
    }));
    wx.labels = wx.displayLabels.map(row => row.text);
    wx.primaryLabel = wx.labels[0] || '';
    wx.hasWorkout = true;
  }
  return { lookup, sessions, runningInfo, runningActive, sessionIndex, wx };
}

export function _renderWorkoutHomeDetailHtml({ cache, plan, checkins, key, includeHead = true }) {
  const { lookup, sessions, runningInfo, runningActive, sessionIndex, wx } =
    _workoutHomeDetailModel({ cache, plan, checkins, key });
  const ordinal = workoutDetailRuntime.recordOrdinal(cache, key, plan, checkins, lookup);
  const recordText = ordinal > 0 ? `${ordinal}번째 기록` : '운동 기록 없음';
  const sessionTabs = _renderWorkoutDetailSessionTabs(sessions, runningActive ? WORKOUT_RUNNING_SESSION_INDEX : sessionIndex, runningInfo);
  const content = wx.hasWorkout
    ? _renderWorkoutDetailRecorded(key, sessionIndex, wx)
    : (runningActive ? _renderWorkoutRunningEmpty(key) : _renderWorkoutDetailEmpty(sessionIndex));
  const runningSessionHost = runningActive ? `
        <div class="wt-running-inline-host" data-wt-running-session-host>
          <div id="wt-running-session-root" class="wt-running-inline-root" aria-live="polite" hidden></div>
        </div>
      ` : '';
  const fabAttrs = `data-wt-day-add-session data-date-key="${_esc(key)}" aria-label="운동 추가"`;
  const exportDock = _renderWorkoutDayExportDock(key, { solo: runningActive });
  const headHtml = includeHead ? `
      <div class="wt-day-head">
        <button type="button" class="wt-day-back" data-wt-sheet-card-action="back-month" aria-label="캘린더로 돌아가기">⌄</button>
        <div class="wt-day-titlebox">
          <div class="wt-day-date">${_dateTitle(key)} <span>${_dateDistanceLabel(key)}</span></div>
          <div class="wt-day-record">${recordText}</div>
        </div>
        ${_renderWorkoutDetailSummaryCard(wx)}
      </div>
  ` : `
      <div class="wt-day-sheet-summary">
        ${_renderWorkoutDetailSummaryCard(wx)}
      </div>
  `;

  return `
    <div class="wt-day-detail">
      ${headHtml}

      <div class="wt-day-sheet-scroll">
        ${runningSessionHost}
        ${content}
      </div>

      <div class="wt-day-sessionbar" data-running-actions="${runningActive ? 'true' : 'false'}">
        <div class="wt-day-session-tabs">${sessionTabs}</div>
      </div>
      ${runningActive ? `<input type="file" accept="image/jpeg,image/png,image/webp" data-wt-running-upload-input data-date-key="${_esc(key)}" hidden>` : ''}
      ${exportDock}
      ${runningActive ? '' : `<button type="button" class="wt-day-fab" ${fabAttrs}>＋</button>`}
    </div>
  `;
}

// 기록추출 도크는 + 버튼 왼쪽에 붙는다. 러닝 탭에는 + 버튼이 없으므로 도크가
// 그 자리를 그대로 차지한다(is-solo).
export function _renderWorkoutDayExportDock(key, { solo = false } = {}) {
  const dateAttr = `data-date-key="${_esc(key)}"`;
  return `
      <div class="wt-day-export-menu" data-wt-day-export-menu hidden role="menu" aria-label="기록 추출 범위">
        <button type="button" class="wt-day-export-option" role="menuitem" data-wt-sheet-card-action="export-day" ${dateAttr}>오늘기록추출</button>
        <button type="button" class="wt-day-export-option" role="menuitem" data-wt-sheet-card-action="export-week" ${dateAttr}>이번주기록추출</button>
      </div>
      <button type="button" class="wt-day-fab wt-day-fab--export${solo ? ' is-solo' : ''}" data-wt-sheet-card-action="toggle-export-menu" ${dateAttr} aria-haspopup="menu" aria-expanded="false" aria-label="기록 추출">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      </button>`;
}

export function _renderWorkoutDetailSummaryCard(wx) {
  const lastCompletedAt = latestWorkoutCompletionAt(wx);
  const metrics = [
    { label: '운동시간', value: wx?.durationSec ? _formatDurationShort(wx.durationSec) : '—' },
    {
      label: '휴식',
      value: formatWorkoutCompletionElapsed(lastCompletedAt),
      attrs: lastCompletedAt ? ` data-wt-last-complete-elapsed data-completed-at="${lastCompletedAt}"` : '',
    },
    { label: '세트', value: wx?.setCount ? `${wx.setCount}세트` : '—' },
    { label: '볼륨', value: wx?.volume > 0 ? formatWorkoutTrackValue('M', wx.volume) : '—' },
  ];
  return `
    <div class="wt-day-summary-card" aria-label="선택한 회차 요약">
      ${metrics.map(item => `
        <span>
          <i>${item.label}</i>
          <strong${item.attrs || ''}>${item.value}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

export function _renderWorkoutDetailSessionTabs(sessions, activeIndex, runningInfo = null) {
  const gymTabs = (Array.isArray(sessions) ? sessions : []).slice(0, WORKOUT_GYM_SESSION_COUNT);
  const tabs = gymTabs.map((session, index) => {
    const hasRecord = _hasWorkoutHomeSessionRecord(session);
    return `
      <button type="button"
        class="${index === activeIndex ? 'active' : ''} ${hasRecord ? 'has-record' : ''}"
        data-wt-sheet-card-action="select-session" data-session-index="${index}">
        ${workoutDetailRuntime.sessionLabel(index)}${hasRecord ? '<b></b>' : ''}
      </button>
    `;
  });
  const hasRunning = !!runningInfo?.hasRecord;
  tabs.push(`
      <button type="button"
        class="wt-day-session-running ${activeIndex === WORKOUT_RUNNING_SESSION_INDEX ? 'active' : ''} ${hasRunning ? 'has-record' : ''}"
        data-wt-sheet-card-action="select-running">
        러닝${hasRunning ? '<b></b>' : ''}
      </button>
  `);
  return tabs.join('');
}

export function _hasWorkoutHomeSessionRecord(session) {
  return hasWorkoutGymCardData(session);
}

export function _renderWorkoutDetailRecorded(key, sessionIndex, wx) {
  return `
    <div class="wt-day-recorded">
      ${_renderWorkoutDetailCards(key, sessionIndex, wx)}
    </div>
  `;
}

export function _renderWorkoutDetailCards(key, sessionIndex, wx) {
  const exerciseCards = _renderWorkoutExerciseDetailCarousel(key, sessionIndex, wx.exercises);
  const activityCards = wx.activities.map((row, index) => _renderWorkoutActivityDetailCard(key, sessionIndex, row, index));
  return `<div class="wt-day-card-list">${exerciseCards}${activityCards.join('')}</div>`;
}

// 슈퍼세트로 묶인 종목들은 캐러셀에서 슬라이드 하나(통합 카드)로 합쳐진다.
// 슬라이드 구성은 렌더와 부분 갱신(_patchWorkoutSheetSetSurfaces)이 같은
// 판단을 해야 하므로 여기 한 곳에서만 만든다.
export function _workoutExerciseSlideModels(exercises = []) {
  const rows = Array.isArray(exercises) ? exercises : [];
  const groups = new Map();
  rows.forEach((row) => {
    const groupId = !row?.cardio && row?.supersetGroup ? String(row.supersetGroup) : '';
    if (!groupId) return;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(row);
  });
  const emitted = new Set();
  const slides = [];
  rows.forEach((row, index) => {
    const groupId = !row?.cardio && row?.supersetGroup ? String(row.supersetGroup) : '';
    if (groupId && (groups.get(groupId)?.length || 0) >= 2) {
      if (emitted.has(groupId)) return;
      emitted.add(groupId);
      slides.push({ type: 'superset', groupId, rows: groups.get(groupId), index });
      return;
    }
    slides.push({ type: 'single', row, index });
  });
  return slides;
}

// 세트 값 편집은 카드 안쪽만 바꾼다. 캐러셀 껍데기를 남긴 채 슬라이드만
// 갈아끼울 수 있도록 슬라이드 마크업을 따로 만든다.
export function _renderWorkoutExerciseSlides(key, sessionIndex, exercises = []) {
  const rows = Array.isArray(exercises) ? exercises : [];
  const slides = _workoutExerciseSlideModels(rows);
  const count = slides.length;
  // 묶기 후보: 같은 세션의 다른 근력 종목 전부(이미 묶인 종목 포함 — 3종목
  // 슈퍼세트는 묶인 종목에 하나 더 연결해서 만든다).
  const linkCandidates = rows
    .filter(row => row && !row.cardio)
    .map(row => ({ exerciseIndex: row.originalIndex, name: row.name || '운동' }));
  return slides.map((slide, slideIndex) => {
    const label = slide.type === 'superset'
      ? slide.rows.map(row => row?.name || '운동').join(' + ')
      : (slide.row?.name || '운동종목');
    const card = slide.type === 'superset'
      ? _renderWorkoutSupersetDetailCard(key, sessionIndex, slide)
      : _renderWorkoutExerciseDetailCard(key, sessionIndex, slide.row, slide.index, { linkCandidates });
    return `
    <div class="wt-day-exercise-slide" data-wt-day-exercise-slide="${slideIndex}" aria-label="${slideIndex + 1}/${count} ${_esc(label)}">
      ${card}
    </div>
  `;
  }).join('');
}

export function _renderWorkoutExerciseDetailCarousel(key, sessionIndex, exercises = []) {
  const rows = Array.isArray(exercises) ? exercises : [];
  if (!rows.length) return '';
  // 슈퍼세트로 합쳐진 뒤의 실제 슬라이드 수 기준으로 단일/복수 레이아웃을 고른다.
  const count = _workoutExerciseSlideModels(rows).length;
  const slides = _renderWorkoutExerciseSlides(key, sessionIndex, rows);
  return `
    <section class="wt-day-exercise-carousel ${count > 1 ? 'has-multiple' : 'is-single'}" aria-label="운동종목 카드">
      <div class="wt-day-exercise-carousel-track" data-wt-day-exercise-carousel-track>
        ${slides}
      </div>
    </section>
  `;
}

export function _workoutPreviousSetSummary(row) {
  const previous = row?.previousRecord || null;
  if (!previous) return { label: '지난 기록', summary: '이전 세트 기록 없음' };
  const dateLabel = previous.dateLabel || _dateDistanceLabel(previous.dateKey) || '이전';
  return {
    label: `지난 기록 · ${dateLabel}`,
    summary: workoutSetSummary(previous),
  };
}

export function _smoothPath(points) {
  if (!Array.isArray(points) || !points.length) return '';
  const fmt = (n) => String(Math.round(n * 10) / 10);
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };
    d += ` C ${fmt(cp1.x)} ${fmt(cp1.y)}, ${fmt(cp2.x)} ${fmt(cp2.y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}

export function _renderWorkoutSparkline(row, trend = null) {
  const historyValues = (Array.isArray(trend?.points) ? trend.points : [])
    .map(point => _num(point?.value))
    .filter(value => value > 0);
  const raw = historyValues.length >= 2 ? historyValues : workoutFallbackSparkValues(row, ['H', 'W'].includes(trend?.track) ? trend.track : 'M');
  const values = raw.length >= 2 ? raw : raw.length === 1 ? [raw[0], raw[0], raw[0]] : [0, 1, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const step = values.length > 1 ? 112 / (values.length - 1) : 112;
  const points = values.map((value, index) => {
    const x = 4 + (step * index);
    const y = 26 - (((value - min) / spread) * 18);
    return { x, y };
  });
  const path = _smoothPath(points);
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const track = ['H', 'W'].includes(trend?.track) ? trend.track : 'M';
  const color = track === 'W' ? '#0f766e' : track === 'H' ? '#be123c' : '#2563eb';
  const fillId = `wt-history-track-${track}-${_workoutTrackGraphSeq++}`;
  const fillPath = `${path} L ${Math.round(lastPt.x * 10) / 10} 32 L ${Math.round(firstPt.x * 10) / 10} 32 Z`;
  return `
    <svg class="wt-max-spark-svg" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path class="wt-max-spark-area" d="${fillPath}" fill="url(#${fillId})"></path>
      <path class="wt-max-spark-line" d="${path}" stroke="${color}"></path>
      <circle class="wt-max-spark-dot" cx="${Math.round(lastPt.x * 10) / 10}" cy="${Math.round(lastPt.y * 10) / 10}" r="2.3" fill="${color}"></circle>
    </svg>
  `;
}

export function _renderWorkoutTrackGraphRow(row, bestSet, track, activeTrack, actionAttrs = '') {
  // 그래프 히스토리는 이 날짜가 속한 시즌 구간으로 항상 자른다 — 시즌이
  // 관리하지 않는 종목도 기간으로는 잘라서, 새 시즌 첫날(직전 시즌 종료
  // 이후 포함)의 그래프는 과거를 끌고 오지 않고 처음부터 시작한다.
  const trend = buildWorkoutTrackTrend(row, bestSet, {
    cache: selectSeasonGraphCache(getCache(), getSeasonRegistry(), row?.dateKey || '', { exerciseId: row?.exerciseId || '' }),
    exList: getExList(),
  }, track);
  const delta = trend.delta || '';
  return `
    <div class="ex-max-track-graph-row ${track === activeTrack ? 'is-active' : ''}" data-track="${track}"${actionAttrs}>
      <span class="ex-max-track-graph-chip">${_esc(trend.trackLabel)}</span>
      <span class="wt-max-spark">${_renderWorkoutSparkline(row, trend)}</span>
      <span class="ex-max-track-graph-value">${_esc(trend.valueLabel)}${delta ? `<small class="${_esc(trend.deltaClass)}">${_esc(delta)}</small>` : ''}</span>
    </div>
  `;
}

// 웬들러 기록은 볼륨/강도 이분화가 무의미하므로(메인 세트 e1RM 단일 지표)
// W 트랙 한 줄로 통합한다. 비웬들러는 두 줄을 유지하되, 줄을 탭하면 그 날
// 기록의 트랙 분류(볼륨셋/강도셋)를 바꿀 수 있게 카드 액션을 단다.
export function _renderWorkoutTrackGraph(row, bestSet, context = null) {
  const activeTrack = activeWorkoutTrack(row, bestSet);
  if (activeTrack === 'W') {
    return `
      <div class="ex-max-track-graph wt-max-track-graph is-wendler" title="웬들러 기록은 볼륨/강도와 분리해 메인 세트 e1RM 하나로 그립니다.">
        ${_renderWorkoutTrackGraphRow(row, bestSet, 'W', 'W')}
      </div>
    `;
  }
  const toggleAttrs = (track) => (context
    ? ` data-wt-sheet-card-action="set-track-mode" data-date-key="${_esc(context.key)}" data-session-index="${context.sessionIndex}" data-exercise-index="${context.exerciseIndex}" role="button" tabindex="0" aria-label="${workoutTrackLabel(track)} 트랙으로 기록"`
    : '');
  return `
    <div class="ex-max-track-graph wt-max-track-graph" title="볼륨 트랙은 총볼륨, 강도 트랙은 추정 1RM으로 따로 그립니다. 줄을 탭하면 오늘 기록의 트랙이 바뀝니다.">
      ${_renderWorkoutTrackGraphRow(row, bestSet, 'M', activeTrack, toggleAttrs('M'))}
      ${_renderWorkoutTrackGraphRow(row, bestSet, 'H', activeTrack, toggleAttrs('H'))}
    </div>
  `;
}

export function _renderWorkoutSetInput(key, sessionIndex, exerciseIndex, setIndex, field, value, label, step = '1') {
  return `<input type="text" inputmode="none" pattern="[0-9.]*" readonly min="0" step="${_esc(step)}" value="${_esc(value)}" aria-label="${_esc(label)}" data-wt-set-input data-wt-set-keyboard-input data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" data-field="${_esc(field)}" data-wt-set-clear-on-focus>`;
}

export function _workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex) {
  return [
    _parseDateKey(key) ? key : workoutDetailRuntime.getSelectedKey(),
    Math.max(0, Math.floor(Number(sessionIndex) || 0)),
    Math.max(0, Math.floor(Number(exerciseIndex) || 0)),
    Math.max(0, Math.floor(Number(setIndex) || 0)),
  ].join(':');
}

export function _workoutSetInlineFieldKey(key, sessionIndex, exerciseIndex, setIndex, field) {
  const safeField = String(field || '');
  if (!['kg', 'reps'].includes(safeField)) return '';
  return `${_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex)}:${safeField}`;
}

export function _isWorkoutSetEditorExpanded(key, sessionIndex, exerciseIndex, setIndex) {
  return _workoutExpandedSetEditors.has(_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex));
}

export function _isWorkoutSetInlineEditing(key, sessionIndex, exerciseIndex, setIndex, field) {
  const inlineKey = _workoutSetInlineFieldKey(key, sessionIndex, exerciseIndex, setIndex, field);
  return !!inlineKey && workoutDetailState.inlineSetEditor === inlineKey;
}

export function _isWorkoutSetTypeMenuOpen(key, sessionIndex, exerciseIndex, setIndex) {
  return _workoutOpenSetTypeMenus.has(_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex));
}

export function _clearWorkoutSetEditorsForExercise(key, sessionIndex, exerciseIndex) {
  const prefix = [
    _parseDateKey(key) ? key : workoutDetailRuntime.getSelectedKey(),
    Math.max(0, Math.floor(Number(sessionIndex) || 0)),
    Math.max(0, Math.floor(Number(exerciseIndex) || 0)),
  ].join(':') + ':';
  [..._workoutExpandedSetEditors].forEach((editorKey) => {
    if (editorKey.startsWith(prefix)) _workoutExpandedSetEditors.delete(editorKey);
  });
  [..._workoutOpenSetTypeMenus].forEach((menuKey) => {
    if (menuKey.startsWith(prefix)) _workoutOpenSetTypeMenus.delete(menuKey);
  });
  if (workoutDetailState.inlineSetEditor?.startsWith?.(prefix)) workoutDetailState.inlineSetEditor = null;
}

export function _renderWorkoutSetInlineInput(key, sessionIndex, exerciseIndex, setIndex, field, value, label, step = '1') {
  const safeField = ['kg', 'reps'].includes(String(field || '')) ? String(field) : 'kg';
  const inlineKey = _workoutSetInlineFieldKey(key, sessionIndex, exerciseIndex, setIndex, safeField);
  return `<input type="text" inputmode="none" pattern="[0-9.]*" readonly min="0" step="${_esc(step)}" value="${_esc(value)}" class="wt-max-set-value-input" aria-label="${_esc(label)}" data-wt-set-input data-wt-set-keyboard-input data-wt-set-inline-input data-wt-inline-editor-key="${_esc(inlineKey)}" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" data-field="${_esc(safeField)}" data-wt-set-clear-on-focus>`;
}

export function _renderWorkoutSetAddRow(key, sessionIndex, exerciseIndex, cardId = '', options = {}) {
  // 슈퍼세트 통합 카드에서는 + 행이 종목마다 하나씩이라 라벨로 구분한다.
  const label = String(options?.label || '').trim();
  const accent = options?.color ? ` style="--wt-ss-accent:${_esc(options.color)}"` : '';
  return `
    <button type="button" class="wt-max-set-add-row${label ? ' wt-ss-set-add-row' : ''}" data-wt-sheet-card-action="add-exercise-set" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" aria-label="${label ? `${_esc(label)} 세트 추가` : '세트 추가'}"${accent}>
      <span aria-hidden="true">+</span>${label ? `<em>${_esc(label)}</em>` : ''}
    </button>
  `;
}

// 웬들러(863) 백오프 세트에서만 노출되는 FSL/SSL 선택지. 무게는 같은 종목의
// 본세트1·2에서 그대로 읽으므로 보드 없이도 하루 시트 단독으로 동작한다.
function _workoutBackoffModeOptions(key, sessionIndex, exerciseIndex, setIndex, set = {}, sets = []) {
  if (set?.wendlerRole !== 'backoff') return '';
  const mains = (Array.isArray(sets) ? sets : []).filter(item => item?.wendlerRole === 'main');
  const fslKg = _num(mains[0]?.kg);
  const sslKg = _num(mains[1]?.kg);
  if (!(fslKg > 0) || !(sslKg > 0)) return '';
  const currentMode = set.supplementalKind === 'fsl' || set.supplementalKind === 'ssl'
    ? set.supplementalKind
    : (_num(set.kg) === fslKg ? 'fsl' : _num(set.kg) === sslKg ? 'ssl' : '');
  const options = [
    { mode: 'fsl', label: `FSL 백오프 · 본세트1 ${formatWorkoutKg(fslKg)}kg` },
    { mode: 'ssl', label: `SSL 백오프 · 본세트2 ${formatWorkoutKg(sslKg)}kg` },
  ];
  return `
      <div class="wt-max-set-type-menu-note">백오프 방식 — 미완료 백오프 전체에 적용</div>
      ${options.map(option => `
        <button type="button" class="wt-max-set-type-option is-backoff-mode ${option.mode === currentMode ? 'is-active' : ''}" data-wt-sheet-card-action="set-backoff-mode" data-backoff-mode="${option.mode}" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-pressed="${option.mode === currentMode ? 'true' : 'false'}">
          <b>${option.mode === 'fsl' ? 'F' : 'S'}</b>
          <span>${_esc(option.label)}</span>
          <i aria-hidden="true">i</i>
        </button>
      `).join('')}`;
}

export function _renderWorkoutSetTypeMenu(key, sessionIndex, exerciseIndex, setIndex, currentType = 'main', context = {}) {
  const normalized = normalizeWorkoutSetType(currentType);
  return `
    <div class="wt-max-set-type-menu" data-wt-set-type-menu="${_esc(_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex))}">
      ${WORKOUT_SET_TYPE_OPTIONS.map(option => `
        <button type="button" class="wt-max-set-type-option ${option.type === normalized ? 'is-active' : ''} ${_esc(option.className)}" data-wt-sheet-card-action="set-set-type" data-wt-set-type-option data-set-type="${_esc(option.type)}" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-pressed="${option.type === normalized ? 'true' : 'false'}">
          <b>${_esc(option.code)}</b>
          <span>${_esc(option.label)}</span>
          <i aria-hidden="true">i</i>
        </button>
      `).join('')}
      ${_workoutBackoffModeOptions(key, sessionIndex, exerciseIndex, setIndex, context.set, context.sets)}
    </div>
  `;
}

export function _renderWorkoutSetRows(row, options = {}) {
  const editable = options?.editable === true;
  const key = options?.key || row?.dateKey || '';
  const sessionIndex = Math.max(0, Math.floor(Number(options?.sessionIndex) || 0));
  const exerciseIndex = Math.max(0, Math.floor(Number(options?.exerciseIndex) || 0));
  const cardId = options?.cardId || '';
  const sets = editable
    ? (Array.isArray(row?.rawSetDetails) ? row.rawSetDetails : [])
    : (Array.isArray(row?.setDetails) ? row.setDetails : []);
  const addRow = _renderWorkoutSetAddRow(key, sessionIndex, exerciseIndex, cardId);
  if (!sets.length) return `<div class="wt-max-empty-sets">세트 상세 기록이 없습니다</div>${addRow}`;
  const rows = sets.map((set) => _renderWorkoutSetRowItem(set, { editable, key, sessionIndex, exerciseIndex, sets })).join('');
  return `${rows}${addRow}`;
}

// 세트 한 줄. 단일 카드와 슈퍼세트 통합 카드(다른 종목의 행이 교차로 섞임)가
// 같은 마크업을 쓴다 — 행의 모든 컨트롤이 (exerciseIndex, setIndex)를 직접
// 들고 있어 어느 카드에 있든 같은 액션 경로를 탄다. member는 슈퍼세트에서
// 행이 어느 종목 것인지 드러내는 색 악센트다.
export function _renderWorkoutSetRowItem(set, context = {}) {
  const { editable, key, sessionIndex, exerciseIndex, sets } = context;
  const member = context.member || null;
  const memberClass = member ? ' wt-ss-set-row' : '';
  const memberStyle = member ? ` style="--wt-ss-accent:${_esc(member.color)}"` : '';
  {
    const setIndex = Math.max(0, Math.floor(Number(set.setIndex) || 0));
    const rom = Math.max(0, Math.min(100, Math.round(_num(set.romPct) || 100)));
    const kgText = formatWorkoutKg(set.kg);
    const repsText = formatWorkoutReps(set.reps);
    const kgDisplayText = kgText === '-' ? '미입력' : kgText;
    // PR세트(AMRAP)의 처방 반복수는 최소치다 — 완료 전까지 '8+'로 보여 최대반복 개념을 드러낸다.
    const amrapSuffix = set.amrap === true && set.done !== true && repsText !== '-' ? '+' : '';
    const repsDisplayText = repsText === '-' ? '미입력' : `${repsText}${amrapSuffix}`;
    const kgUnit = kgText === '-' ? '' : '<small>kg</small>';
    const repsUnit = repsText === '-' ? '' : '<small>회</small>';
    const expanded = editable && _isWorkoutSetEditorExpanded(key, sessionIndex, exerciseIndex, setIndex);
    const kgInline = editable && _isWorkoutSetInlineEditing(key, sessionIndex, exerciseIndex, setIndex, 'kg');
    const repsInline = editable && _isWorkoutSetInlineEditing(key, sessionIndex, exerciseIndex, setIndex, 'reps');
    const rowInline = kgInline || repsInline;
    const typeMenuOpen = editable && _isWorkoutSetTypeMenuOpen(key, sessionIndex, exerciseIndex, setIndex);
    const setTypeLabel = workoutSetTypeLabel(set);
    const setTypeClass = workoutSetTypeClass(set);
    const setTypeValue = normalizeWorkoutSetType(set?.setType);
    const typeControl = editable
      ? `<button type="button" class="wt-max-set-type wt-max-set-type-btn ${_esc(setTypeClass)}" data-wt-sheet-card-action="toggle-set-type" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-expanded="${typeMenuOpen ? 'true' : 'false'}" aria-label="${setIndex + 1}세트 유형 선택"><b>${setIndex + 1}</b><small>${_esc(setTypeLabel)}</small></button>`
      : `<span class="wt-max-set-type ${_esc(setTypeClass)}"><b>${setIndex + 1}</b><small>${_esc(setTypeLabel)}</small></span>`;
    const swipeAttrs = editable
      ? ` data-wt-set-swipe-row data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}"`
      : '';
    const kgControl = rowInline
      ? `<span class="wt-max-set-value is-inline-editing ${kgInline ? 'is-active' : ''}">${_renderWorkoutSetInlineInput(key, sessionIndex, exerciseIndex, setIndex, 'kg', _workoutSheetInputValue(set.kg, 1), '무게', '0.5')}</span>`
      : `<button type="button" class="wt-max-set-value" data-wt-set-edit-field="kg" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-label="무게 수정"><b>${_esc(kgDisplayText)}${kgUnit}</b></button>`;
    const repsControl = rowInline
      ? `<span class="wt-max-set-value is-inline-editing ${repsInline ? 'is-active' : ''}">${_renderWorkoutSetInlineInput(key, sessionIndex, exerciseIndex, setIndex, 'reps', _workoutSheetInputValue(set.reps, 0), '반복', '1')}</span>`
      : `<button type="button" class="wt-max-set-value" data-wt-set-edit-field="reps" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-label="횟수 수정"><b>${_esc(repsDisplayText)}${repsUnit}</b></button>`;
    return `
      <div class="wt-max-set-row${memberClass} ${set.done ? 'is-done' : ''} ${editable ? 'is-editing' : ''} ${expanded ? 'is-expanded-editor' : ''} ${typeMenuOpen ? 'is-type-menu-open' : ''}"${swipeAttrs}${memberStyle}>
        <div class="wt-max-set-main">
          ${editable
            ? `<button type="button" class="wt-max-set-check wt-max-set-toggle" data-wt-set-done-toggle data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-pressed="${set.done ? 'true' : 'false'}" aria-label="세트 완료 토글">✓</button>
               ${typeControl}
               ${kgControl}
               ${repsControl}
               <button type="button" class="wt-max-set-remove wt-max-set-remove-btn" data-wt-set-remove data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-label="세트 삭제">×</button>
               <button type="button" class="wt-max-set-expand" data-wt-sheet-card-action="toggle-set-editor" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? '세트 수정 닫기' : '세트 수정 열기'}"><span aria-hidden="true">${expanded ? '⌃' : '⌄'}</span></button>`
            : `<i class="wt-max-set-check" aria-hidden="true">✓</i>
               ${typeControl}
               <span class="wt-max-set-value"><b>${_esc(kgDisplayText)}${kgUnit}</b></span>
               <span class="wt-max-set-value"><b>${_esc(repsDisplayText)}${repsUnit}</b></span>
               <i class="wt-max-set-remove" aria-hidden="true">×</i>
               <i class="wt-max-set-expand" aria-hidden="true">⌄</i>`}
        </div>
        ${typeMenuOpen ? _renderWorkoutSetTypeMenu(key, sessionIndex, exerciseIndex, setIndex, setTypeValue, { set, sets }) : ''}
        ${expanded ? `
          <div class="wt-max-set-editor" data-wt-set-editor-panel="${_esc(_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex))}">
            <label><span>무게</span>${_renderWorkoutSetInput(key, sessionIndex, exerciseIndex, setIndex, 'kg', _workoutSheetInputValue(set.kg, 1), '무게', '0.5')}<em>kg</em></label>
            <label><span>횟수</span>${_renderWorkoutSetInput(key, sessionIndex, exerciseIndex, setIndex, 'reps', _workoutSheetInputValue(set.reps, 0), '반복', '1')}<em>회</em></label>
            <label><span>RIR</span>${_renderWorkoutSetInput(key, sessionIndex, exerciseIndex, setIndex, 'rir', set.rir == null ? '2' : _fmtNum(set.rir, 1), 'RIR', '0.5')}</label>
            <label class="wt-max-set-editor-rom"><span>ROM</span>${_renderWorkoutSetInput(key, sessionIndex, exerciseIndex, setIndex, 'romPct', rom, 'ROM', '1')}<em>%</em></label>
          </div>
        ` : ''}
      </div>
    `;
  }
}

export function _isWorkoutExerciseCompletionStamped(cardId, row = null) {
  if (isWorkoutExerciseComplete(row)) return true;
  _workoutExerciseCompletionStamps.delete(cardId);
  return false;
}

export function _cardioMetricItems(row) {
  const cardio = row?.cardio || {};
  return [
    { label: '칼로리', value: _formatCardioMetric(cardio.kcal, ' kcal', 0) },
    { label: '거리', value: _formatCardioMetric(cardio.distanceKm, ' km', 2) },
    { label: '속도', value: _formatCardioMetric(cardio.speedKmh, ' km/h', 1) },
    ...(cardio.id === 'my-mountain' ? [{ label: '각도', value: _formatCardioMetric(cardio.angleDeg, '°', 1) }] : []),
    ...(cardio.id === 'step-machine' ? [{ label: '단계', value: _formatCardioMetric(cardio.level, '단계', 0) }] : []),
    { label: '랩/반복', value: _formatCardioMetric(cardio.laps, '회', 0) },
  ];
}

export function _renderWorkoutCardioDetailCard(key, sessionIndex, row, index) {
  const originalIndex = Number.isFinite(Number(row.originalIndex)) ? Number(row.originalIndex) : index;
  const metrics = _cardioMetricItems(row);
  const headline = row?.cardio?.kcal > 0 ? `${Math.round(row.cardio.kcal)} kcal` : row.name;
  const summary = _cardioSummaryText(row.cardio);
  return `
    <article class="wt-day-ex-card wt-max-read-card wt-cardio-read-card is-expanded">
      <div class="wt-max-card-kicker wt-cardio-card-kicker">
        <span><i></i>유산소 · 수기 입력</span>
        <button type="button" data-wt-sheet-card-action="delete-exercise" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" aria-label="유산소 삭제">×</button>
      </div>
      <div class="wt-max-card-name">${_esc(row.name)}</div>
      <div class="wt-running-headline wt-cardio-headline">
        <strong>${_esc(headline)}</strong>
        <span>${_esc(summary)}</span>
      </div>
      <div class="wt-running-metric-grid wt-cardio-metric-grid">
        ${metrics.map(item => `
          <span>
            <i>${_esc(item.label)}</i>
            <strong>${_esc(item.value)}</strong>
          </span>
        `).join('')}
      </div>
      ${row.note ? `<div class="wt-max-note">${_esc(row.note)}</div>` : ''}
      <div class="wt-max-collapsed-note">유산소 완료 · 카드가 접혔어요</div>
      <div class="wt-max-actions wt-max-actions--single">
        <button type="button" class="wt-max-action-primary is-muted" aria-disabled="true" tabindex="-1">운동 완료</button>
      </div>
    </article>
  `;
}

// 카드 머리의 목표 문구. 처방이 있으면 처방을 적고, 없으면 오늘 최고 세트를
// 적되 그렇게 말한다. 오늘 내 세트를 "성공 기준"이라고 부르면 무엇을 하든
// 기준을 채운 것처럼 보여서, 주간 목표가 왜 안 켜지는지 읽을 수 없다.
export function _workoutSupersetMenuKey(key, sessionIndex, exerciseIndex) {
  return [
    _parseDateKey(key) ? key : workoutDetailRuntime.getSelectedKey(),
    Math.max(0, Math.floor(Number(sessionIndex) || 0)),
    Math.max(0, Math.floor(Number(exerciseIndex) || 0)),
  ].join(':');
}

// 슈퍼세트 묶기 진입점. 같은 세션의 다른 근력 종목이 있어야 열린다.
function _renderWorkoutSupersetLinkControl(key, sessionIndex, row, linkCandidates = []) {
  const originalIndex = Number.isFinite(Number(row?.originalIndex)) ? Number(row.originalIndex) : 0;
  const candidates = (Array.isArray(linkCandidates) ? linkCandidates : [])
    .filter(candidate => Number(candidate?.exerciseIndex) !== originalIndex);
  if (!candidates.length && !row?.supersetGroup) return '';
  const menuOpen = _workoutOpenSupersetMenus.has(_workoutSupersetMenuKey(key, sessionIndex, originalIndex));
  const button = `<button type="button" class="wt-ss-link-btn ${row?.supersetGroup ? 'is-linked' : ''}" data-wt-sheet-card-action="toggle-superset-menu" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" aria-expanded="${menuOpen ? 'true' : 'false'}" aria-label="슈퍼세트로 묶기">🔗</button>`;
  if (!menuOpen) return button;
  const menu = `
    <div class="wt-ss-link-menu" data-wt-superset-menu>
      <div class="wt-ss-link-menu-note">함께 번갈아 수행할 종목을 고르면 카드 하나로 합쳐져요</div>
      ${candidates.map(candidate => `
        <button type="button" class="wt-ss-link-option" data-wt-sheet-card-action="link-superset" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" data-partner-index="${Number(candidate.exerciseIndex) || 0}">
          🔗 <span>${_esc(candidate.name)}</span>와 묶기
        </button>
      `).join('')}
      ${row?.supersetGroup ? `
        <button type="button" class="wt-ss-link-option is-unlink" data-wt-sheet-card-action="unlink-superset" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}">묶기 해제</button>
      ` : ''}
    </div>
  `;
  return `${button}${menu}`;
}

export function _renderWorkoutExerciseDetailCard(key, sessionIndex, row, index, context = {}) {
  if (row?.cardio) return _renderWorkoutCardioDetailCard(key, sessionIndex, row, index);
  const cardId = `ex:${key}:${sessionIndex}:${index}`;
  const stamped = _isWorkoutExerciseCompletionStamped(cardId, row);
  const collapsed = stamped && workoutDetailState.editingCardId !== cardId;
  const editing = !collapsed;
  const originalIndex = Number.isFinite(Number(row.originalIndex)) ? Number(row.originalIndex) : index;
  const linkControl = _renderWorkoutSupersetLinkControl(key, sessionIndex, row, context?.linkCandidates);
  const bestSet = bestWorkoutSet(row);
  const bestKg = bestSet ? formatWorkoutKg(bestSet.kg) : '-';
  const bestReps = bestSet ? formatWorkoutReps(bestSet.reps) : '-';
  const previousSummary = _workoutPreviousSetSummary(row);
  const hasSetDetails = Array.isArray(row?.setDetails) && row.setDetails.length > 0;
  const activeTrack = activeWorkoutTrack(row, bestSet);
  const activeTrackLabel = workoutTrackLabel(activeTrack);
  const goalText = hasSetDetails ? `${bestKg}kg × ${bestReps}회` : '세트 입력 대기';
  const trackText = hasSetDetails ? `오늘 ${activeTrackLabel} 트랙 · ${row.setCount}세트` : '+ 행으로 세트를 입력하세요';
  return `
    <article class="wt-day-ex-card wt-max-read-card ${collapsed ? 'is-collapsed' : 'is-expanded'} ${editing ? 'is-editing' : ''} ${stamped ? 'is-complete-stamped' : ''}">
      ${stamped ? '<div class="wt-max-complete-stamp" aria-hidden="true">완료</div>' : ''}
      <div class="wt-max-card-kicker">
        <span><i></i>추천 종목 · 선택 헬스장</span>
        <span class="wt-max-card-kicker-actions">
          ${linkControl}
          <button type="button" data-wt-sheet-card-action="delete-exercise" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" aria-label="운동 삭제">×</button>
        </span>
      </div>
      <div class="wt-max-card-name">${_esc(row.name)}</div>
      <div class="wt-max-plan">
        <div class="wt-max-plan-goal">
          <span>오늘 성공 기준</span>
          <strong>${_esc(goalText)}</strong>
          <em>${_esc(trackText)}</em>
        </div>
        <div class="wt-max-trend">
          ${_renderWorkoutTrackGraph(row, bestSet, { key, sessionIndex, exerciseIndex: originalIndex })}
        </div>
      </div>
      <div class="wt-max-last">
        <div class="wt-max-last-head">
          <span>${_esc(previousSummary.label)}</span>
          ${Array.isArray(row?.previousRecord?.setDetails) && row.previousRecord.setDetails.length > 0
    ? `<button type="button" class="wt-max-last-copy-chip" data-wt-sheet-card-action="copy-previous-sets" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" aria-label="지난 기록 ${row.previousRecord.setDetails.length}세트 전체 세트 복사">전체 세트 복사</button>`
    : ''}
        </div>
        <strong>${_esc(previousSummary.summary)}</strong>
      </div>
      ${row.note ? `<div class="wt-max-note">${_esc(row.note)}</div>` : ''}
      <div class="wt-max-collapsed-note">모든 세트 완료 · 카드가 접혔어요</div>
      <div class="wt-max-set-list">${_renderWorkoutSetRows(row, { editable: editing, key, sessionIndex, exerciseIndex: originalIndex, cardId })}</div>
      <div class="wt-max-actions wt-max-actions--single">
        ${collapsed
          ? `<button type="button" class="wt-max-action-primary is-muted" data-wt-sheet-card-action="edit-exercise" data-card-id="${_esc(cardId)}">수정하기</button>`
          : `<button type="button" class="wt-max-action-primary" data-wt-sheet-card-action="complete-exercise" data-card-id="${_esc(cardId)}" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}">종목완료</button>`}
      </div>
    </article>
  `;
}

// 슈퍼세트 통합 카드의 완료 스탬프: 멤버 전원이 종목완료여야 접힌다.
export function _isWorkoutSupersetCompletionStamped(cardId, rows = []) {
  if (rows.length && rows.every(row => isWorkoutExerciseComplete(row))) return true;
  _workoutExerciseCompletionStamps.delete(cardId);
  return false;
}

const _WT_SS_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309'];

// 슈퍼세트 통합 카드 — 묶인 종목들을 카드 하나로 합치고 세트를 수행 순서
// (1라운드 = 각 종목 1세트)대로 교차 배치한다. 좌우 스와이프 없이 위에서
// 아래로 체크만 하며 내려가는 것이 목적. 데이터는 종목별 엔트리 그대로이고
// (통계·그래프·히스토리 불변) 렌더링만 합친다.
export function _renderWorkoutSupersetDetailCard(key, sessionIndex, slide) {
  const rows = Array.isArray(slide?.rows) ? slide.rows : [];
  const groupId = String(slide?.groupId || '');
  const cardId = `ss:${key}:${sessionIndex}:${groupId}`;
  const stamped = _isWorkoutSupersetCompletionStamped(cardId, rows);
  const collapsed = stamped && workoutDetailState.editingCardId !== cardId;
  const editing = !collapsed;
  const members = rows.map((row, memberIndex) => ({
    row,
    color: _WT_SS_COLORS[memberIndex % _WT_SS_COLORS.length],
    originalIndex: Number.isFinite(Number(row?.originalIndex)) ? Number(row.originalIndex) : memberIndex,
  }));
  const firstIndex = members[0]?.originalIndex ?? 0;

  const memberStrips = members.map(({ row, color }) => {
    const bestSet = bestWorkoutSet(row);
    const hasSetDetails = Array.isArray(row?.setDetails) && row.setDetails.length > 0;
    const goalText = hasSetDetails
      ? `${formatWorkoutKg(bestSet?.kg)}kg × ${formatWorkoutReps(bestSet?.reps)}회`
      : '세트 입력 대기';
    const activeTrack = activeWorkoutTrack(row, bestSet);
    return `
      <div class="wt-ss-member" style="--wt-ss-accent:${color}">
        <span class="wt-ss-member-dot" aria-hidden="true"></span>
        <div class="wt-ss-member-info">
          <b>${_esc(row.name)}</b>
          <em>${_esc(goalText)}</em>
        </div>
        <div class="wt-ss-member-graph">${_renderWorkoutTrackGraphRow(row, bestSet, activeTrack, activeTrack)}</div>
      </div>
    `;
  }).join('');

  const memberSets = members.map(({ row }) => (editing
    ? (Array.isArray(row?.rawSetDetails) ? row.rawSetDetails : [])
    : (Array.isArray(row?.setDetails) ? row.setDetails : [])));
  const maxSets = Math.max(0, ...memberSets.map(list => list.length));
  let interleaved = '';
  for (let position = 0; position < maxSets; position += 1) {
    members.forEach((member, memberIndex) => {
      const sets = memberSets[memberIndex];
      const set = sets[position];
      if (!set) return;
      interleaved += _renderWorkoutSetRowItem(set, {
        editable: editing,
        key,
        sessionIndex,
        exerciseIndex: member.originalIndex,
        sets,
        member: { color: member.color },
      });
    });
  }
  const addRows = editing
    ? members.map(member => _renderWorkoutSetAddRow(key, sessionIndex, member.originalIndex, cardId, { label: member.row?.name || '운동', color: member.color })).join('')
    : '';
  const setList = interleaved
    ? `${interleaved}${addRows}`
    : `<div class="wt-max-empty-sets">세트 상세 기록이 없습니다</div>${addRows}`;

  return `
    <article class="wt-day-ex-card wt-max-read-card wt-ss-card ${collapsed ? 'is-collapsed' : 'is-expanded'} ${editing ? 'is-editing' : ''} ${stamped ? 'is-complete-stamped' : ''}">
      ${stamped ? '<div class="wt-max-complete-stamp" aria-hidden="true">완료</div>' : ''}
      <div class="wt-max-card-kicker">
        <span><i></i>🔗 슈퍼세트 · ${rows.length}종목</span>
        <span class="wt-max-card-kicker-actions">
          <button type="button" class="wt-ss-unlink-btn" data-wt-sheet-card-action="unlink-superset" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${firstIndex}" aria-label="슈퍼세트 해제">묶기 해제</button>
        </span>
      </div>
      <div class="wt-max-card-name wt-ss-card-name">${members.map(({ row, color }) => `<span style="--wt-ss-accent:${color}">${_esc(row?.name || '운동')}</span>`).join('<i aria-hidden="true">+</i>')}</div>
      <div class="wt-ss-members">${memberStrips}</div>
      <div class="wt-max-collapsed-note">슈퍼세트 완료 · 카드가 접혔어요</div>
      <div class="wt-max-set-list wt-ss-set-list">${setList}</div>
      <div class="wt-max-actions wt-max-actions--single">
        ${collapsed
    ? `<button type="button" class="wt-max-action-primary is-muted" data-wt-sheet-card-action="edit-exercise" data-card-id="${_esc(cardId)}">수정하기</button>`
    : `<button type="button" class="wt-max-action-primary" data-wt-sheet-card-action="complete-superset" data-card-id="${_esc(cardId)}" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-indexes="${members.map(member => member.originalIndex).join(',')}">슈퍼세트 완료</button>`}
      </div>
    </article>
  `;
}

export function _renderRunningRouteMap(row) {
  const importedMapImage = String(row?.routeSummary?.mapImageDataUrl || '');
  if (/^data:image\/(?:jpeg|webp|png);base64,[a-z0-9+/=]+$/i.test(importedMapImage)) {
    const sourceApp = String(row?.routeSummary?.sourceApp || '외부 러닝 앱').trim();
    return `
      <div class="wt-running-route-map wt-running-route-map--imported" aria-label="${_esc(sourceApp)}에서 업로드한 러닝 경로 이미지">
        <img src="${_esc(importedMapImage)}" alt="${_esc(sourceApp)} 러닝 경로">
      </div>
    `;
  }
  const hasStoredRoute = (Array.isArray(row?.route) && row.route.length > 0)
    || !!row?.routeRef
    || _num(row?.pointCount ?? row?.routeSummary?.pointCount) > 0;
  if (!hasStoredRoute) {
    return `
      <div class="wt-running-route-map wt-running-route-map--unavailable" aria-label="GPS 경로 없음">
        <div class="wt-run-map-status">GPS 경로가 저장되지 않았어요</div>
        <div class="wt-running-route-place">위치 정보 없음</div>
      </div>
    `;
  }
  const mapId = workoutDetailRuntime.registerRunningMapPayload(row);
  const place = _runningPlaceLabel(row);
  const gpsInfoLabel = _runningGpsInfoLabel(row);
  return `
    <div class="wt-running-route-map wt-run-real-map is-active" data-wt-running-route-map="${_esc(mapId)}" aria-label="러닝 경로 지도">
      <div class="wt-run-map-canvas" data-running-map-canvas aria-label="${_esc(place)}"></div>
      <div class="wt-run-map-status" data-running-map-status>전체 경로 불러오는 중</div>
      <div class="wt-running-route-place">${_esc(place)}</div>
      ${gpsInfoLabel ? `<span class="wt-run-gps-info" role="note" tabindex="0" aria-label="${_esc(gpsInfoLabel)}" title="${_esc(gpsInfoLabel)}" data-tip="${_esc(gpsInfoLabel)}">?</span>` : ''}
    </div>
  `;
}

export function _renderRunningRouteDetail(row) {
  const summary = row?.routeSummary || {};
  const elapsedDurationSec = _num(row?.elapsedDurationSec) || _num(summary.elapsedDurationSec);
  const detailMetrics = [
    { label: '최고 페이스', value: _formatRunningPaceCard(row?.bestPaceSecPerKm) || '' },
    { label: '경과 시간', value: elapsedDurationSec > 0 ? _formatDurationShort(elapsedDurationSec) : '' },
    { label: '고도 하강', value: row?.elevationLossM == null ? '' : `${Math.round(row.elevationLossM)} m` },
    { label: '최대 심박수', value: row?.maxHeartRateBpm == null ? '' : `${Math.round(row.maxHeartRateBpm)} bpm` },
    { label: '최대 케이던스', value: row?.maxCadenceSpm == null ? '' : `${Math.round(row.maxCadenceSpm)} spm` },
    { label: 'GPS 포인트', value: _num(row?.pointCount) > 0 ? `${Math.round(row.pointCount)}개` : '' },
  ].filter(metric => metric.value);
  const splits = Array.isArray(row?.splits) ? row.splits : [];
  const splitRows = splits.map((split, index) => {
    const distance = _num(split?.distanceKm);
    const label = distance > 0.95 && distance < 1.05
      ? `${index + 1} km`
      : `${_fmtNum(distance, 2)} km`;
    const pace = _formatRunningPaceCard(split?.paceSecPerKm) || '--';
    const elevation = Number.isFinite(Number(split?.elevationGainM))
      ? `${Math.round(split.elevationGainM)} m`
      : '--';
    const heart = Number(split?.avgHeartRateBpm) > 0
      ? `${Math.round(split.avgHeartRateBpm)}`
      : '--';
    return `
      <div class="wt-running-split-row" role="row">
        <span role="cell">${_esc(label)}</span>
        <strong role="cell">${_esc(pace)}</strong>
        <span role="cell">${_esc(elevation)}</span>
        <span role="cell">${_esc(heart)}</span>
      </div>`;
  }).join('');
  if (!detailMetrics.length && !splitRows) return '';
  return `
    <section class="wt-running-detail-block" aria-label="러닝 상세 데이터">
      ${detailMetrics.length ? `
        <div class="wt-running-detail-title">상세 데이터</div>
        <div class="wt-running-detail-stats">
          ${detailMetrics.map(metric => `<span><strong>${_esc(metric.value)}</strong><i>${_esc(metric.label)}</i></span>`).join('')}
        </div>` : ''}
      ${splitRows ? `
        <div class="wt-running-split-title">구간</div>
        <div class="wt-running-split-table" role="table" aria-label="킬로미터별 러닝 구간">
          <div class="wt-running-split-row wt-running-split-row--head" role="row">
            <span role="columnheader">거리</span><span role="columnheader">평균 페이스</span><span role="columnheader">고도</span><span role="columnheader">심박</span>
          </div>
          ${splitRows}
        </div>` : ''}
    </section>`;
}

export function _renderRunningGpsStatus(row) {
  return '';
}

export function _renderWorkoutRunningDetailCard(key, sessionIndex, row, index) {
  const rowSessionIndex = Number.isFinite(Number(row?.sessionIndex))
    ? Math.max(0, Math.floor(Number(row.sessionIndex)))
    : sessionIndex;
  const activityKey = String(row.key || '').replace(/[^a-z0-9_-]/gi, '');
  const distanceValue = row.distanceKm > 0 ? _fmtNum(row.distanceKm, 2) : '0.00';
  const durationText = row.durationSec ? _formatDurationShort(row.durationSec) : '';
  const paceText = _formatRunningPaceCard(row.avgPaceSecPerKm);
  const caloriesText = row.calories > 0 ? `${Math.round(row.calories)}` : '--';
  const elevationText = row.elevationGainM == null ? '--' : `${Math.round(row.elevationGainM)} m`;
  const heartRateText = row.avgHeartRateBpm == null ? '-- ♡' : `${Math.round(row.avgHeartRateBpm)}`;
  const cadenceText = row.cadenceSpm == null ? '--' : `${Math.round(row.cadenceSpm)}`;
  const primaryMetrics = [
    { label: '평균 페이스', value: paceText || "--'--''" },
    { label: '시간', value: durationText || '--' },
    { label: '칼로리', value: caloriesText },
    { label: '고도 상승', value: elevationText },
    { label: '평균 심박수', value: heartRateText },
    { label: '케이던스', value: cadenceText },
  ];
  return `
    <article class="wt-day-ex-card wt-max-read-card wt-running-read-card is-expanded">
      <div class="wt-max-card-kicker wt-running-card-kicker">
        <span><i></i>${_esc(row.label || '러닝')} · ${_esc(_runningSourceLabel(row.source))}</span>
        <button type="button" data-wt-sheet-card-action="delete-activity" data-date-key="${_esc(key)}" data-session-index="${rowSessionIndex}" data-activity-key="${_esc(activityKey)}" aria-label="러닝 삭제">×</button>
      </div>
      <div class="wt-running-overview">
        <div class="wt-running-distance-hero">
          <strong>${_esc(distanceValue)}</strong>
          <span>킬로미터</span>
        </div>
        <div class="wt-running-primary-stats" aria-label="러닝 핵심 지표">
          ${primaryMetrics.map(item => `
            <span>
              <strong>${_esc(item.value)}</strong>
              <i>${_esc(item.label)}</i>
            </span>
          `).join('')}
        </div>
      </div>
      <div class="wt-running-route-wrap">
        ${_renderRunningRouteMap(row)}
      </div>
      ${_renderRunningGpsStatus(row)}
      ${_renderRunningRouteDetail(row)}
      <div class="wt-max-actions wt-running-card-actions">
        <button type="button" class="wt-max-action-secondary wt-running-card-upload" data-wt-day-upload-running data-date-key="${_esc(key)}" aria-label="러닝 기록 스크린샷 추가 업로드">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
          <span data-wt-running-upload-label>추가 업로드</span>
        </button>
        <button type="button" class="wt-max-action-primary wt-running-card-start" data-wt-sheet-card-action="add-running" data-date-key="${_esc(key)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>
          <span>러닝 시작</span>
        </button>
      </div>
    </article>
  `;
}

export function _renderWorkoutActivityDetailCard(key, sessionIndex, row, index) {
  if (row?.key === 'running') return _renderWorkoutRunningDetailCard(key, sessionIndex, row, index);
  const rowSessionIndex = Number.isFinite(Number(row?.sessionIndex))
    ? Math.max(0, Math.floor(Number(row.sessionIndex)))
    : sessionIndex;
  const cardId = `act:${key}:${rowSessionIndex}:${index}`;
  const collapsed = _workoutDetailCollapsed.has(cardId);
  const activityKey = String(row.key || '').replace(/[^a-z0-9_-]/gi, '');
  return `
    <article class="wt-day-ex-card wt-day-activity-card ${collapsed ? 'is-collapsed' : ''}">
      <div class="wt-day-ex-top">
        <div>
          <strong>${_esc(row.label || '활동')}</strong>
          <span>${_esc(row.main || '')}</span>
        </div>
        <div class="wt-day-ex-frames" aria-hidden="true"><i></i><i></i></div>
      </div>
      <div class="wt-day-ex-body">
        <p>${_esc(row.detail || row.main || '기록 있음')}</p>
      </div>
      <div class="wt-day-ex-foot">
        <span class="wt-day-check">✓</span>
        <span>${row.durationSec ? _formatDurationShort(row.durationSec) : '기록'}</span>
        <button type="button" data-wt-sheet-card-action="toggle-card" data-card-id="${_esc(cardId)}">${collapsed ? '펼치기' : '접기'}</button>
        <button type="button" data-wt-sheet-card-action="delete-activity" data-date-key="${_esc(key)}" data-session-index="${rowSessionIndex}" data-activity-key="${_esc(activityKey)}">삭제</button>
      </div>
    </article>
  `;
}

export function _renderWorkoutDetailEmpty(sessionIndex) {
  return `
    <div class="wt-day-empty">
      <div class="wt-day-session-label">${workoutDetailRuntime.sessionLabel(sessionIndex)}</div>
      <div class="wt-empty-center">
        <div class="wt-empty-dumbbell" aria-hidden="true"></div>
        <p><strong>${workoutDetailRuntime.sessionLabel(sessionIndex)} 운동 기록</strong>이 없습니다</p>
        <span>하단 + 버튼으로 추가해보세요</span>
      </div>
      <div class="wt-empty-help">
        <p>하루에 운동을 여러번 하시나요?</p>
        <p>회차를 선택해서 구분해보세요</p>
        <p>운동 시간 등이 별도로 기록됩니다</p>
      </div>
    </div>
  `;
}

export function _renderWorkoutRunningEmpty(key) {
  return `
    <div class="wt-day-empty wt-running-empty" data-wt-running-empty>
      <div class="wt-day-session-label">러닝</div>
      <div class="wt-empty-center">
        <div class="wt-empty-run" aria-hidden="true">
          <svg viewBox="0 0 64 64"><path class="wt-empty-run-route" d="M13 45c8-13 11-24 20-24 8 0 7 12 14 12 4 0 6-4 7-8"/><circle cx="13" cy="45" r="4"/><path class="wt-empty-run-pin" d="M54 12a8 8 0 0 0-8 8c0 6 8 14 8 14s8-8 8-14a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg>
        </div>
        <p><strong>러닝 기록</strong>이 없습니다</p>
        <span>직접 측정하거나 러닝 앱 기록을 가져오세요</span>
        <div class="wt-running-empty-actions" aria-label="러닝 기록 추가">
          <button type="button" class="wt-running-upload-action wt-running-upload-action--empty" data-wt-day-upload-running data-date-key="${_esc(key)}" aria-label="러닝 기록 스크린샷 업로드">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
            <span data-wt-running-upload-label>기록 업로드</span>
          </button>
          <button type="button" class="wt-running-start-inline" data-wt-day-add-running data-date-key="${_esc(key)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>
            <span>러닝 시작</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
