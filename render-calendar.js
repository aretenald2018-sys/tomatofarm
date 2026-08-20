import { toFiniteNumber as _num } from './utils/number.js';
import { escapeHtml as _esc } from './utils/escape-html.js';
import { sumDayNutrient } from './diet/day-nutrition.js';
import { parseDateKey as _parseDateKey } from './utils/date-key.js';
import { KOREAN_WEEKDAYS } from './utils/weekdays.js';
import { showToast } from './ui/toast.js';
// ================================================================
// render-calendar.js — 캘린더 탭
// 월별 그리드로 일자별 100점 만점 점수 + (섭취kcal/소모kcal/체중) 표시
// ================================================================

import {
  getCache,
  getDietPlan,
  getExList,
  getMuscleParts,
  getLatestCheckinWeight,
  getSeasonRegistry,
  getSeasonRunningPlan,
  getSeasonTestBoardV2,
  getSeasonWorkoutPlan,
  getTestBoardV2,
  loadRunningRoute,
  saveDay,
  saveTestBoardV2,
} from './data.js';
import {
  calcDietMetrics,
  SUBPATTERN_TO_MAJOR,
} from './calc.js';
import { dateKey, TODAY, isFuture, isBeforeStart } from './data/data-date.js';
import { findSeasonForDate, findSeasonsForDate, startOfSeasonWeek } from './data/season-model.js';
import { buildSeasonOverview } from './data/season-overview.js';
import { openModal, closeModal } from './utils/dom.js';
import { confirmAction } from './utils/confirm-modal.js';
import {
  getWorkoutSessions,
  hasWorkoutSessionData,
  upsertWorkoutSession,
  deleteWorkoutSession,
} from './workout/sessions.js';
import { S } from './workout/state.js';
import {
  wtRefreshWorkoutTimelineDuration,
  wtRestTimerClearSetRecord,
  wtRestTimerStart,
} from './workout/timers.js';
import { saveWorkoutDay } from './workout/save.js';
import { destroyRunningMaps, renderRunningMap } from './workout/running-map.js';
import { createRunningRouteHydrationController } from './workout/running-route-hydration.js';
import { manualCardioSummaryText as _cardioSummaryText } from './workout/cardio-model.js';
import {
  WORKOUT_GYM_SESSION_COUNT,
  WORKOUT_RUNNING_SESSION_INDEX,
} from './workout/session-policy.js';
import { isWorkoutRunningTabIndex } from './workout/calendar-running.js';
import {
  closeWorkoutDaySheet,
  openWorkoutDaySheet,
  updateWorkoutCalendarState,
} from './workout/navigation-stack.js';
import { normalizeWorkoutExerciseSelectionDetail } from './workout/exercise-entry-actions.js';
import { wtOpenExerciseEditor, wtOpenExercisePicker } from './workout/exercises.js';
import { wtMountRunningSession, wtOpenRunningSession } from './workout/running-session.js';
import { openWorkoutSeasonWizard } from './workout/season-manager.js';
import { loadWorkoutDate as loadWorkoutSessionDate } from './workout/load.js';
import { tm2OpenBenchmarkSettings, tm2OpenBoard } from './workout/test-v2/entry.js';
import {
  formatWorkoutTrackValue,
} from './workout/track-metrics.js';
import { formatWorkoutCompletionElapsed } from './workout/completion-metrics.js';
import {
  clearWorkoutExerciseCompletionMarker,
  isCompletableWorkoutExerciseSet,
  markWorkoutExerciseEntryComplete,
} from './workout/exercise-completion.js';
import { normalizeWorkoutSetType } from './workout/set-presentation.js';
import {
  _dateDistanceLabel,
  _dateTitle,
  _durationFromMinSec,
  _fmtNum,
  _formatDuration,
  _formatDurationShort,
  _isBlankWorkoutSheetNumber,
  _isoWeekNumber,
  _seasonOverviewDateLabel,
  _seasonOverviewStateIcon,
  _seasonOverviewStateLabel,
  _workoutSheetInputValue,
  _workoutSheetRawNumber,
} from './calendar/format.js';
import {
  _workoutHomeSheetCarouselShouldOwnTouch,
  _workoutHomeSheetCarouselShouldOwnWheel,
  _workoutHomeSheetTouchWouldChain,
  _workoutHomeSheetWheelWouldChain,
} from './calendar/gesture-policy.js';
import {
  _activityRows,
  _dayMetrics,
  _shiftDateKey,
  _sortedCheckins,
  _weightAt,
} from './calendar/day-metrics.js';
import {
  _buildWorkoutLookup,
  _previousWorkoutRecordForRow,
  _workoutEntryName,
  _workoutMetrics,
} from './calendar/workout-read-model.js';
import {
  _buildWorkoutRecordsExport,
  _copyTextToClipboard,
  _formatWorkoutExportText,
  _shareOrCopyText,
} from './calendar/export-text.js';
import {
  _clonePlain,
  _isSameWorkoutStateDate,
  _mealOkPatchForWorkoutHomeDay,
  _syncWorkoutHomeSavedSessionState,
  _workoutHomeDay,
  _workoutHomeSessionAt,
  _workoutSessionSavePayload,
} from './calendar/session-state.js';
import {
  _clearWorkoutSetEditorsForExercise,
  _workoutDetailCollapsed,
  _workoutExerciseCompletionStamps,
  _workoutExpandedSetEditors,
  _workoutOpenSetTypeMenus,
  _workoutSetEditorKey,
  _workoutSetInlineFieldKey,
  configureWorkoutDetailTemplate,
  workoutDetailState,
  _renderWorkoutHomeDetailHtml,
  _renderWorkoutExerciseSlides,
  _renderWorkoutDetailSummaryCard,
  _workoutHomeDetailModel,
} from './calendar/detail-template.js';
import {
  WORKOUT_SHEET_SET_INPUT_SELECTOR,
  _captureWorkoutSheetInputState,
  _captureWorkoutSheetScrollState,
  _positionOpenWorkoutSetTypeMenu,
  _rememberRenderedWorkoutSheetCarousel,
  _rememberWorkoutSheetCarouselState,
  _requestWorkoutSheetPendingCarouselFocus,
  _restoreRememberedWorkoutSheetCarousel,
  _restoreWorkoutSheetInputState,
  _restoreWorkoutSheetScrollState,
  _tryRestorePendingWorkoutSheetCarouselFocus,
  _waitWorkoutSheetFocusTransition,
  _workoutHomeScrollRoot,
  _workoutHomeScrollTop,
  _workoutSheetSelectorValue,
  configureWorkoutSheetState,
} from './calendar/sheet-state.js';
import {
  _bindWorkoutSetSwipeDelete,
  _commitWorkoutSetKeyboardInput,
  _hideWorkoutSetKeyboard,
  _lockWorkoutSetKeyboardDom,
  _releaseWorkoutSetKeyboardDom,
  _sameWorkoutSetKeyboardTarget,
  _showWorkoutSetKeyboard,
  _workoutSetKeyboardActiveInput,
  _workoutSetKeyboardElement,
  _workoutSetKeyboardMeta,
  configureWorkoutSetKeyboard,
  workoutSetKeyboardState,
} from './calendar/set-keyboard.js';

// ═════════════════════════════════════════════════════════════
// 뷰 상태
// ═════════════════════════════════════════════════════════════
let _viewYear  = TODAY.getFullYear();
let _viewMonth = TODAY.getMonth();
let _calendarMode = 'summary';
let _workoutHomeSelectedKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
let _workoutHomeView = 'month';
let _workoutHomeSheetState = 'bar';
let _workoutHomeSessionIndex = 0;
let _workoutSummaryElapsedTimer = null;
let _workoutRunningMapSeq = 0;
let _workoutRunningImportActive = false;
const _workoutRunningMapPayloads = new Map();
const _workoutRunningRouteHydration = createRunningRouteHydrationController(loadRunningRoute);
const WORKOUT_HOME_SHEET_STATES = ['bar', 'full'];
const WORKOUT_HOME_SHEET_CLASS_STATES = ['bar', 'full'];

configureWorkoutSheetState({
  getSelectedKey: () => _workoutHomeSelectedKey,
  getSessionIndex: () => _workoutHomeSessionIndex,
});

configureWorkoutSetKeyboard({
  cancelInlineField: (...args) => _cancelWorkoutSetInlineFieldFromSheet(...args),
  getSelectedKey: () => _workoutHomeSelectedKey,
  clearInputOnFocus: _clearWorkoutSetInputOnFocus,
  defaultSet: _defaultWorkoutSheetSet,
  focusEditorField: (...args) => _focusWorkoutSetEditorFieldFromSheet(...args),
  focusInlineField: (...args) => _focusWorkoutSetInlineFieldFromSheet(...args),
  mutateExercise: (...args) => _mutateWorkoutExerciseFromSheet(...args),
  removeExerciseSet: (...args) => _removeWorkoutExerciseSetFromSheet(...args),
  setWorkoutSheetNumber: _setWorkoutSheetNumber,
  syncNavState: _syncWorkoutHomeNavState,
  updateExerciseSet: (...args) => _updateWorkoutExerciseSetFromSheet(...args),
});

const MAX_WEAK_LABEL = {
  chest_upper:'가슴 상부', chest_lower:'가슴 하부',
  back_width:'등 넓이', back_thickness:'등 두께',
  shoulder_side:'어깨 측면', rear_delt:'어깨 후면',
  bicep:'이두', tricep:'삼두', core:'복근',
  hamstring:'햄스트링', glute:'둔근', calf:'종아리',
};

const CALENDAR_MODES = new Set(['summary', 'workout']);

function _renderSeasonOverviewHtml(input) {
  const snapshots = Array.isArray(input) ? input : [input];
  const primary = snapshots[0] || {};
  const season = primary.season || {};
  const allWeeks = snapshots.flatMap(snapshot => snapshot.weeks || []);
  return `<div class="modal-sheet workout-season-overview-sheet" role="dialog" aria-modal="true" aria-labelledby="season-overview-title">
    <header class="season-overview-head"><div><span>SEASON OVERVIEW</span><h2 id="season-overview-title">${_esc(snapshots.length > 1 ? `${snapshots.length}개 병행 시즌` : (season.name || '시즌 목표'))}</h2><small>${_esc(season.startDate)}–${_esc(season.endDate)} · ${snapshots.length > 1 ? '종목별 목표' : `${season.weeks || allWeeks.length}주`}</small></div><button type="button" data-season-overview-close aria-label="닫기">×</button></header>
    <div class="season-overview-summary"><span><b>${allWeeks.filter(week => week.state === 'achieved').length}</b><small>완료 주차</small></span><span><b>${snapshots.reduce((total, snapshot) => total + Number(snapshot.workoutDays || 0), 0)}</b><small>운동 기록일</small></span><span><b>${allWeeks.length}</b><small>전체 주차</small></span></div>
    <div class="season-overview-body">
      ${snapshots.map(snapshot => {
        const currentSeason = snapshot.season || {};
        const weeks = snapshot.weeks || [];
        return `<section class="season-overview-program"><header class="season-overview-program-head"><strong>${_esc(currentSeason.name || '시즌 목표')}</strong><small>${_esc(currentSeason.startDate)}–${_esc(currentSeason.endDate)}</small></header>${weeks.map(week => `<section class="season-overview-week is-${_esc(week.state)}">
        <header><div><strong>${week.index}주차</strong><small>${_seasonOverviewDateLabel(week.startDate)}–${_seasonOverviewDateLabel(week.endDate)}</small></div><em><i>${_seasonOverviewStateIcon(week.state)}</i>${_seasonOverviewStateLabel(week.state)}</em></header>
        <div class="season-overview-items">${week.items.map(item => `<div class="season-overview-item is-${_esc(item.state)}"><span><i>${_seasonOverviewStateIcon(item.state)}</i><b>${_esc(item.label)}</b></span><small>${_esc(item.detail)} · ${_seasonOverviewStateLabel(item.state)}</small></div>`).join('')}</div>
      </section>`).join('') || '<p class="season-overview-empty">이 시즌에 설정된 주차 목표가 없습니다.</p>'}</section>`;
      }).join('')}
    </div>
  </div>`;
}

// 시즌 카드를 누르면 그 날짜에 걸린 시즌(병행 시즌이면 전부)의 주차별 달성 현황을 편다.
function _openWorkoutSeasonOverview(seasonId) {
  const registry = getSeasonRegistry();
  const seasonIds = String(seasonId || '').split(',').map(value => value.trim()).filter(Boolean);
  const seasons = seasonIds.length
    ? seasonIds.map(id => registry.seasons.find(item => item.id === id)).filter(Boolean)
    : findSeasonsForDate(registry, dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()));
  if (!seasons.length) return;
  const snapshots = seasons.map(season => buildSeasonOverview({
    cache: getCache() || {},
    season,
    board: getSeasonTestBoardV2(season.id) || {},
    workoutPlan: getSeasonWorkoutPlan(season.id) || {},
    runningPlan: getSeasonRunningPlan(season.id) || {},
    todayKey: dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()),
  }));
  let modal = document.getElementById('workout-season-overview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'workout-season-overview-modal';
    modal.className = 'modal-backdrop workout-season-overview-modal';
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest?.('[data-season-overview-close]')) {
        modal.hidden = true;
        modal.classList.remove('open');
      }
    });
    document.body.appendChild(modal);
  }
  modal.innerHTML = _renderSeasonOverviewHtml(snapshots);
  modal.hidden = false;
  modal.classList.add('open');
}

// 위젯/딥링크에서 목표입력 시트로 바로 들어오는 진입점. 주차는 캘린더 레일이
// 넘겨주던 값과 같은 의미로, 지정하지 않으면 시트가 현재 주차로 동작한다.
function _workoutGoalExerciseMuscleIds(ex = {}) {
  return Array.from(new Set([
    ex.muscleId,
    ...(Array.isArray(ex.muscleIds) ? ex.muscleIds : []),
    SUBPATTERN_TO_MAJOR[ex.subPattern],
  ].filter(Boolean).map(String)));
}

function _isWorkoutGoalExercise(ex = {}, muscleIds = new Set()) {
  const id = String(ex.id || '');
  const kind = String(ex.kind || ex.type || ex.category || '').toLowerCase();
  if (!id || id.startsWith('cardio:') || ex.cardio || kind.includes('cardio')) return false;
  return _workoutGoalExerciseMuscleIds(ex).some(muscleId => muscleIds.has(muscleId));
}

function _workoutGoalExerciseOptions() {
  const muscles = getMuscleParts();
  const muscleOrder = new Map(muscles.map((muscle, idx) => [String(muscle.id), idx]));
  const muscleNames = new Map(muscles.map(muscle => [String(muscle.id), muscle.name || '기타']));
  const muscleIds = new Set(muscles.map(muscle => String(muscle.id)));
  return getExList()
    .filter(ex => _isWorkoutGoalExercise(ex, muscleIds))
    .map((ex) => {
      const muscleId = _workoutGoalExerciseMuscleIds(ex).find(id => muscleIds.has(id)) || '';
      return {
        id: String(ex.id || ''),
        name: String(ex.name || ex.label || '이름 없는 종목').trim() || '이름 없는 종목',
        muscleId,
        muscleName: muscleNames.get(muscleId) || '기타',
        muscleOrder: muscleOrder.has(muscleId) ? muscleOrder.get(muscleId) : 999,
      };
    })
    .sort((a, b) => a.muscleOrder - b.muscleOrder || a.name.localeCompare(b.name, 'ko'));
}

function _setWorkoutGoalInputLock(on) {
  document.body?.classList.toggle('wt-modal-scroll-lock', !!on);
}

function _closeWorkoutGoalInputSheet(modal) {
  const root = modal || document.getElementById('cal-goal-input-modal');
  if (!root) return;
  root.classList.remove('open');
  root.setAttribute('hidden', '');
  _setWorkoutGoalInputLock(false);
}

function _goalInputSheetOptionsHtml(options = []) {
  if (!options.length) return '<option value="">선택할 수 있는 헬스 운동 종목이 없어요</option>';
  return [
    '<option value="">운동 종목 선택</option>',
    ...options.map(ex => `<option value="${_esc(ex.id)}">${_esc(ex.muscleName)} · ${_esc(ex.name)}</option>`),
  ].join('');
}

function _ensureWorkoutGoalInputSheet() {
  let modal = document.getElementById('cal-goal-input-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'cal-goal-input-modal';
  modal.className = 'modal-backdrop cal-goal-input-modal';
  modal.setAttribute('hidden', '');
  modal.innerHTML = `
    <div class="modal-sheet cal-goal-input-sheet" role="dialog" aria-modal="true" aria-labelledby="cal-goal-input-title">
      <span class="cal-goal-input-handle" aria-hidden="true"></span>
      <div class="modal-title" id="cal-goal-input-title">목표입력</div>
      <div class="cal-goal-input-body">
        <label class="cal-goal-input-field">
          <span>운동 종목</span>
          <select class="cal-goal-input-select" data-cal-goal-select></select>
        </label>
        <p class="cal-goal-input-empty" data-cal-goal-empty hidden>헬스 운동 종목을 먼저 추가해주세요.</p>
      </div>
      <div class="cal-goal-input-actions">
        <button type="button" class="cal-goal-input-cancel" data-cal-goal-cancel>취소</button>
        <button type="button" class="cal-goal-input-next" data-cal-goal-next>다음</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest?.('[data-cal-goal-cancel]') || target === modal) {
      event.preventDefault();
      _closeWorkoutGoalInputSheet(modal);
      return;
    }
    if (target?.closest?.('[data-cal-goal-next]')) {
      event.preventDefault();
      Promise.resolve(_openSelectedWorkoutGoalExercise(modal)).catch((e) => {
        console.warn('[workout-calendar] goal exercise editor open failed:', e);
      });
    }
  });
  modal.addEventListener('change', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target?.closest?.('[data-cal-goal-select]')) return;
    Promise.resolve(_openSelectedWorkoutGoalExercise(modal)).catch((e) => {
      console.warn('[workout-calendar] goal exercise editor select failed:', e);
    });
  });
  document.body?.appendChild(modal);
  return modal;
}

function _openWorkoutGoalInputSheet(weekStart) {
  const modal = _ensureWorkoutGoalInputSheet();
  const options = _workoutGoalExerciseOptions();
  const select = modal.querySelector('[data-cal-goal-select]');
  const nextBtn = modal.querySelector('[data-cal-goal-next]');
  const empty = modal.querySelector('[data-cal-goal-empty]');
  if (select) {
    select.innerHTML = _goalInputSheetOptionsHtml(options);
    select.disabled = !options.length;
    select.value = '';
  }
  if (nextBtn) nextBtn.disabled = !options.length;
  if (empty) empty.hidden = !!options.length;
  modal.dataset.weekStart = String(weekStart || '');
  modal.removeAttribute('hidden');
  modal.classList.add('open');
  _setWorkoutGoalInputLock(true);
  window.requestAnimationFrame?.(() => select?.focus?.());
}

async function _openSelectedWorkoutGoalExercise(modal) {
  const root = modal || document.getElementById('cal-goal-input-modal');
  const select = root?.querySelector?.('[data-cal-goal-select]');
  const exId = String(select?.value || '').trim();
  if (!exId) {
    showToast('운동 종목을 선택해주세요', 1800, 'warning');
    return;
  }
  _closeWorkoutGoalInputSheet(root);
  try {
    const { loadAndInjectModals } = await import('./modal-manager.js');
    await loadAndInjectModals();
    wtOpenExerciseEditor(exId, null, { returnToPicker: false, source: 'calendar-goal-input' });
  } catch (e) {
    console.warn('[workout-calendar] goal exercise editor open failed:', e);
    showToast('종목 수정 화면을 여는 데 실패했어요', 2200, 'error');
  }
}

async function _openWorkoutCycleTargetSettings(benchmarkId) {
  const bmId = String(benchmarkId || '').trim();
  if (!bmId) return;
  try {
    if (typeof tm2OpenBenchmarkSettings === 'function') {
      await tm2OpenBenchmarkSettings(bmId);
      return;
    }
    await tm2OpenBoard();
  } catch (e) {
    console.warn('[workout-calendar] cycle target settings open failed:', e);
    showToast('목표 설정을 여는 데 실패했어요', 2200, 'error');
  }
}

function _syncWorkoutHomeNavState({ history = 'replace', notify = false, action = 'calendar:sync' } = {}) {
  updateWorkoutCalendarState({
    viewYear: _viewYear,
    viewMonth: _viewMonth,
    selectedKey: _parseDateKey(_workoutHomeSelectedKey) ? _workoutHomeSelectedKey : null,
    selectedSessionIndex: Math.max(0, Math.floor(Number(_workoutHomeSessionIndex) || 0)),
    sheetOpen: _workoutHomeView === 'detail',
    sheetState: _normalizeWorkoutHomeSheetState(_workoutHomeSheetState),
    scrollTop: _workoutHomeScrollTop(),
    activeTab: 'summary',
  }, { history, notify, action });
}

export function applyWorkoutCalendarNavSnapshot(snapshot = {}, options = {}) {
  const calendar = snapshot?.calendar || {};
  const nextSheetOpen = !!calendar.sheetOpen;
  if (_currentWorkoutHomeSheetState() !== 'bar' && !nextSheetOpen) {
    _rememberWorkoutSheetCarouselState(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
  }
  if (calendar.viewYear != null && Number.isFinite(Number(calendar.viewYear))) _viewYear = Number(calendar.viewYear);
  if (calendar.viewMonth != null && Number.isFinite(Number(calendar.viewMonth))) _viewMonth = Number(calendar.viewMonth);
  if (!Number.isFinite(_viewYear) || _viewYear < 1000 || _viewYear > 9999) _viewYear = TODAY.getFullYear();
  if (!Number.isFinite(_viewMonth) || _viewMonth < 0 || _viewMonth > 11) _viewMonth = TODAY.getMonth();
  if (_parseDateKey(calendar.selectedKey)) _workoutHomeSelectedKey = calendar.selectedKey;
  _workoutHomeSessionIndex = Math.max(0, Math.floor(Number(calendar.selectedSessionIndex) || 0));
  _workoutHomeSheetState = _normalizeWorkoutHomeSheetState(calendar.sheetState);
  _workoutHomeView = nextSheetOpen ? 'detail' : 'month';
  renderWorkoutCalendarHome();
  if (nextSheetOpen) _restoreRememberedWorkoutSheetCarousel(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
  if (options.preserveScroll !== false && Number.isFinite(Number(calendar.scrollTop)) && typeof window !== 'undefined') {
    const top = Math.max(0, Number(calendar.scrollTop) || 0);
    const restoreScroll = () => {
      const root = _workoutHomeScrollRoot();
      if (root) {
        if (typeof root.scrollTo === 'function') root.scrollTo({ top, behavior: 'auto' });
        else root.scrollTop = top;
        return;
      }
      window.scrollTo({ top, behavior: 'auto' });
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(restoreScroll);
    else restoreScroll();
  }
}

function _isTodayKey(key) {
  return key === dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

function _clearWorkoutSheetSetRestMetadata(set) {
  if (!set) return;
  delete set.restStartedAt;
  delete set.restPlannedSec;
  delete set.restEndedAt;
  delete set.restElapsedSec;
  delete set.restOverSec;
  delete set.restEndedBy;
}

async function _syncWorkoutRestAfterSheetSet(key, sessionIndex, exerciseIndex, setIndex, done) {
  const activeSessionIndex = Math.max(0, Math.floor(Number(S.workout?.sessionIndex) || 0));
  const targetSessionIndex = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  if (!_isTodayKey(key) || !_isSameWorkoutStateDate(key) || activeSessionIndex !== targetSessionIndex) return false;

  const entryIdx = Math.max(0, Math.floor(Number(exerciseIndex) || 0));
  const targetSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
  const entry = S.workout.exercises?.[entryIdx];
  if (!entry?.sets?.[targetSetIndex]) return false;

  if (done) {
    wtRefreshWorkoutTimelineDuration('calendar sheet set done');
    const exerciseName = entry.name || entry.exerciseName || entry.exerciseId || '운동';
    wtRestTimerStart(null, `${exerciseName} ${targetSetIndex + 1}세트 후 휴식`, {
      entryIdx,
      setIdx: targetSetIndex,
      exerciseId: entry.exerciseId || null,
      exerciseName,
      setNumber: targetSetIndex + 1,
    });
  } else {
    wtRestTimerClearSetRecord(entryIdx, targetSetIndex);
    wtRefreshWorkoutTimelineDuration('calendar sheet set undone');
  }

  // 시트는 호출 전 낙관적 저장에서 이미 부분 갱신됐고, 이 저장은 휴식
  // 메타데이터만 쓴다. renderHandled 없이 저장하면 sheet:saved → renderAll이
  // 시트를 다시 그려 완료 체크 때마다 화면이 맨 위로 튀고 깜빡인다.
  await saveWorkoutDay({ silent: true, renderHandled: true });
  return true;
}

function _sessionLabel(index) {
  return `${Number(index) + 1}회차`;
}

function _isRunningTabIndex(index) {
  return isWorkoutRunningTabIndex(index);
}

function _workoutRecordOrdinalForKey(cache, selectedKey, plan, checkins, lookup) {
  const keys = Object.keys(cache || {})
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .filter(key => key <= selectedKey)
    .sort();
  let count = 0;
  keys.forEach((key) => {
    const bodyWeight = _weightAt(checkins, key) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
    if (_workoutMetrics(key, cache[key] || {}, bodyWeight, lookup).hasWorkout) count += 1;
  });
  return count;
}

async function _loadWorkoutStateForSheetSession(key, sessionIndex = 0) {
  const p = _parseDateKey(key);
  if (!p) return false;
  await Promise.resolve(loadWorkoutSessionDate(p.y, p.m, p.d, {
    sessionIndex: Math.max(0, Math.floor(Number(sessionIndex) || 0)),
  }));
  return true;
}

async function _refreshWorkoutHomeAfterPickerSelect(key, sessionIndex = _workoutHomeSessionIndex, detail = {}) {
  const p = _parseDateKey(key);
  if (!p) return false;
  const targetIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  const selectionDetail = normalizeWorkoutExerciseSelectionDetail(detail);
  const entryIndex = selectionDetail.entryIdx;
  _viewYear = p.y;
  _viewMonth = p.m;
  _workoutHomeSelectedKey = key;
  _workoutHomeSessionIndex = targetIndex;
  _workoutHomeView = 'detail';
  _workoutHomeSheetState = 'full';
  if (entryIndex != null) _requestWorkoutSheetPendingCarouselFocus(key, targetIndex, entryIndex);
  openWorkoutDaySheet(key, {
    sessionIndex: targetIndex,
    sheetState: 'full',
    viewYear: _viewYear,
    viewMonth: _viewMonth,
    scrollTop: _workoutHomeScrollTop(),
    history: 'replace',
    notify: false,
    action: 'sheet:add-exercise',
  });
  const timerBar = typeof document !== 'undefined' ? document.getElementById('wt-workout-timer-bar') : null;
  if (timerBar && !timerBar.classList.contains('wt-open')) timerBar.classList.add('wt-open');
  renderWorkoutCalendarHome();
  if (entryIndex != null) _tryRestorePendingWorkoutSheetCarouselFocus(key, targetIndex);
  if (!selectionDetail.existing) showToast('종목을 추가했어요', 1500, 'success');
  return true;
}

async function _saveWorkoutHomeSessionResult(key, result, options = {}) {
  const inputCaptureOptions = options?.preserveInput ? {
    ignoreSourceInput: options.ignoreSourceInput === true,
    allowSourceFallback: options.preserveSourceInput !== false,
  } : null;
  const restoreState = options?.preserveInput
    ? (_captureWorkoutSheetInputState(options.sourceInput, inputCaptureOptions) || _captureWorkoutSheetScrollState())
    : options?.preserveSheetScroll
      ? _captureWorkoutSheetScrollState()
      : null;
  const existingDay = _workoutHomeDay(key);
  const payload = {
    ..._workoutSessionSavePayload(result),
    ..._mealOkPatchForWorkoutHomeDay(key, existingDay, result.aggregate || {}),
  };
  const savePromise = saveDay(key, payload, { mode: 'merge', rethrow: true });
  if (options?.optimisticRender) {
    const cache = getCache() || {};
    const currentDay = cache[key] && typeof cache[key] === 'object' ? cache[key] : {};
    cache[key] = { ...currentDay, ...payload };
    _syncWorkoutHomeSavedSessionState(key, result, options.sessionIndex);
    const nextRestoreState = restoreState;
    _workoutDetailCollapsed.clear();
    let patchedInPlace = false;
    if (options?.skipRender !== true) {
      // 세트 값만 바뀐 낙관적 갱신은 시트 구조를 건드리지 않는다. 부분 갱신이
      // 먹으면 스크롤/입력 상태를 되돌릴 일도 없다.
      // _renderWorkoutSheetAfterSetEdit는 "전체 렌더로 넘어갔는가"를 돌려준다.
      const fellBackToFullRender = _renderWorkoutSheetAfterSetEdit();
      if (fellBackToFullRender) {
        if (nextRestoreState) _restoreWorkoutSheetInputState(nextRestoreState);
      } else {
        patchedInPlace = true;
      }
    }
    await savePromise;
    // A previous field can finish saving after the user already moved to the
    // next keypad field. Avoid app-level renderAll() replacing that live input;
    // the final field commit will dispatch the normal saved event when idle.
    if (_workoutSetKeyboardActiveInput()) return;
    if (patchedInPlace) {
      // 완료 체크처럼 부분 갱신이 이미 화면을 맞춘 저장에 app.js의 sheet:saved
      // 리스너(renderAll)까지 태우면 시트가 통째로 교체돼 스크롤이 0으로 튀고
      // 깜빡인다. 위젯 동기화 같은 다른 리스너는 계속 들어야 하므로 이벤트는
      // renderHandled 표시만 붙여 그대로 내보낸다.
      document.dispatchEvent(new CustomEvent('sheet:saved', { detail: { renderHandled: true } }));
      return;
    }
    document.dispatchEvent(new CustomEvent('sheet:saved'));
    return;
  }
  await savePromise;
  _syncWorkoutHomeSavedSessionState(key, result, options.sessionIndex);
  if (options?.preserveInput) await _waitWorkoutSheetFocusTransition();
  const latestInputState = options?.preserveInput
    ? _captureWorkoutSheetInputState(options.sourceInput, inputCaptureOptions)
    : null;
  const nextRestoreState = latestInputState || restoreState;
  _workoutDetailCollapsed.clear();
  renderWorkoutCalendarHome();
  if (nextRestoreState) _restoreWorkoutSheetInputState(nextRestoreState);
  document.dispatchEvent(new CustomEvent('sheet:saved'));
}

function _renderCalendarModeTabs() {
  return `
    <div class="cal-mode-tabs" role="tablist" aria-label="캘린더 보기">
      <button type="button" class="cal-mode-tab ${_calendarMode === 'summary' ? 'active' : ''}"
        role="tab" aria-selected="${_calendarMode === 'summary'}" data-cal-action="set-mode" data-mode="summary">종합</button>
      <button type="button" class="cal-mode-tab ${_calendarMode === 'workout' ? 'active' : ''}"
        role="tab" aria-selected="${_calendarMode === 'workout'}" data-cal-action="set-mode" data-mode="workout">운동</button>
    </div>
  `;
}

function _setCalendarMode(mode) {
  if (!CALENDAR_MODES.has(mode)) return;
  _calendarMode = mode;
  renderCalendar();
}

// ═════════════════════════════════════════════════════════════
// 체중 시계열 유틸
// ═════════════════════════════════════════════════════════════
function _bindCalendarActions(root) {
  if (!root || root.dataset.calendarActionsBound) return;
  root.dataset.calendarActionsBound = '1';
  root.addEventListener('click', (event) => {
    const control = event.target.closest('[data-cal-action]');
    if (!control || !root.contains(control)) return;
    const action = control.dataset.calAction;
    if (action === 'set-mode') _setCalendarMode(control.dataset.mode);
    if (action === 'open-day') _openDay(control.dataset.dateKey);
    if (action === 'shift-month') _shiftMonth(Number(control.dataset.delta) || 0);
    if (action === 'go-today') _goToday();
  });
}

function _renderWorkoutCalendar(root, { cache, plan, checkins, y, m, firstDow, daysCount, surface = 'calendar', showModeTabs = true } = {}) {
  let monthSum = { days: 0, durationSec: 0, sets: 0, volume: 0, kcalBurn: 0 };
  const flatCells = [];
  const dayCells = new Map();
  const dayMetrics = new Map();
  const lookup = _buildWorkoutLookup();
  const isWorkoutHome = surface === 'workout-home';
  const surfaceClass = isWorkoutHome ? 'cal-workout-surface-home' : 'cal-workout-surface-calendar';
  const scrollSurfaceAttr = isWorkoutHome ? ' data-wt-calendar-scroll-surface' : '';
  const selectedParsed = _parseDateKey(_workoutHomeSelectedKey);
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const seasonRegistry = getSeasonRegistry();
  const currentSeasons = findSeasonsForDate(seasonRegistry, todayKey);
  const currentSeason = currentSeasons[0] || null;

  if (isWorkoutHome && (!selectedParsed || selectedParsed.y !== y || selectedParsed.m !== m || selectedParsed.d < 1 || selectedParsed.d > daysCount)) {
    const todayInView = TODAY.getFullYear() === y && TODAY.getMonth() === m;
    _workoutHomeSelectedKey = todayInView ? todayKey : dateKey(y, m, 1);
  }

  if (!isWorkoutHome) {
    for (let i = 0; i < firstDow; i++) flatCells.push(`<div class="cal-cell cal-cell-empty"></div>`);
  }

  for (let d = 1; d <= daysCount; d++) {
    const k = dateKey(y, m, d);
    const day = cache[k] || {};
    const future = isFuture(y, m, d);
    const before = isBeforeStart(y, m, d);
    const today = k === todayKey;
    const selected = isWorkoutHome && k === _workoutHomeSelectedKey;
    const daySeason = findSeasonForDate(seasonRegistry, k);
    const archivedSeason = currentSeason
      ? k < currentSeason.startDate
      : !!(daySeason && daySeason.endDate < todayKey);
    const seasonStart = !!(currentSeason && k === currentSeason.startDate);
    const disabled = future || before;
    const bodyWeight = _weightAt(checkins, k) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
    const wx = _workoutMetrics(k, day, bodyWeight, lookup);

    const includeInMonthSummary = !isWorkoutHome
      || (currentSeason ? !archivedSeason : seasonRegistry.seasons.length === 0);
    if (wx.hasWorkout && includeInMonthSummary) {
      monthSum.days += 1;
      monthSum.durationSec += wx.durationSec;
      monthSum.sets += wx.setCount;
      monthSum.volume += wx.volume;
      monthSum.kcalBurn += wx.burned.total;
    }

    const classes = [
      'cal-cell',
      'cal-workout-cell',
      today ? 'cal-cell-today' : '',
      selected ? 'cal-workout-cell-selected' : '',
      disabled ? 'cal-cell-disabled' : '',
      wx.hasWorkout ? 'cal-workout-cell-active' : 'cal-workout-cell-rest',
      archivedSeason ? 'cal-workout-cell-season-archived' : '',
      seasonStart ? 'cal-workout-cell-season-start' : '',
    ].filter(Boolean).join(' ');
    const dayAction = disabled
      ? ''
      : isWorkoutHome
        ? `data-wt-calendar-action="open-day" data-date-key="${k}"`
        : `data-cal-action="open-day" data-date-key="${k}"`;
    const maxLabelLines = isWorkoutHome ? 4 : (wx.durationSec > 0 && wx.setCount > 0 ? 3 : 4);
    const labelLines = wx.displayLabels.slice(0, maxLabelLines);
    const moreCount = Math.max(0, wx.displayLabels.length - labelLines.length);
    const detailHtml = wx.hasWorkout ? `
      <div class="cal-workout-bars">
        ${wx.durationSec > 0 ? `<span class="cal-workout-bar cal-workout-bar-time">${_formatDurationShort(wx.durationSec)}</span>` : ''}
        ${wx.setCount > 0 ? `<span class="cal-workout-bar">${wx.setCount}세트</span>` : ''}
        ${labelLines.map(label => `<span class="cal-workout-bar cal-workout-bar-part" title="${_esc(label.title || label.text)}">${_esc(label.text)}</span>`).join('')}
        ${moreCount > 0 ? `<span class="cal-workout-bar cal-workout-bar-more">+${moreCount}</span>` : ''}
      </div>
      <div class="cal-workout-cell-kcal">${wx.burned.total > 0 ? `${wx.burned.total} kcal` : ''}</div>
    ` : `
      <div class="cal-workout-rest-mark">—</div>
    `;

    const cellHtml = `
      <div class="${classes}" ${dayAction}>
        <div class="cal-cell-head">
          <span class="cal-cell-date">${d}</span>
          ${wx.hasWorkout ? `<span class="cal-workout-dot"></span>` : ''}
        </div>
        ${seasonStart ? '<span class="cal-season-start-label">새 시즌</span>' : ''}
        ${detailHtml}
      </div>
    `;

    if (isWorkoutHome) {
      dayCells.set(d, cellHtml);
      dayMetrics.set(d, wx);
    } else {
      flatCells.push(cellHtml);
    }
  }

  const monthLabel = isWorkoutHome
    ? `${y}.${String(m + 1).padStart(2, '0')}`
    : `${y}년 ${m + 1}월`;
  const weekdays = KOREAN_WEEKDAYS;
  const summaryHtml = monthSum.days > 0 ? `
    <div class="cal-month-summary cal-workout-summary">
      <div class="cal-month-avg">
        <span class="cal-month-avg-label">이번 달 운동</span>
        <span class="cal-month-avg-score">${monthSum.days}<span>일</span></span>
      </div>
      <div class="cal-month-side">
        <div><span>총 시간</span><strong>${_formatDurationShort(monthSum.durationSec)}</strong></div>
        <div><span>총 세트</span><strong>${monthSum.sets.toLocaleString()}세트</strong></div>
        <div><span>총 볼륨</span><strong>${formatWorkoutTrackValue('M', monthSum.volume)}</strong></div>
        <div><span>총 소모</span><strong>${monthSum.kcalBurn.toLocaleString()} kcal</strong></div>
      </div>
    </div>
  ` : (isWorkoutHome ? '' : `
    <div class="cal-month-summary cal-month-empty">
      <span>이번 달 운동 기록이 아직 없어요</span>
    </div>
  `);

  const weekdayHtml = isWorkoutHome ? `
    <div class="cal-weekdays cal-workout-weekdays">
      <div class="cal-week-rail-spacer" aria-hidden="true"></div>
      ${weekdays.map((w, i) => `<div class="cal-wd ${i === 0 ? 'cal-wd-sun' : ''} ${i === 6 ? 'cal-wd-sat' : ''}">${w}</div>`).join('')}
    </div>
  ` : `
    <div class="cal-weekdays">
      ${weekdays.map((w, i) => `<div class="cal-wd ${i === 0 ? 'cal-wd-sun' : ''} ${i === 6 ? 'cal-wd-sat' : ''}">${w}</div>`).join('')}
    </div>
  `;

  const gridHtml = isWorkoutHome
    ? _renderWorkoutHomeMonthGrid({
      y, m, firstDow, daysCount, dayCells, dayMetrics,
      weekGoalsByMonday: _buildWeekGoalsByMonday(seasonRegistry, cache, todayKey),
    })
    : `<div class="cal-grid cal-workout-grid">${flatCells.join('')}</div>`;
  const calendarBodyHtml = isWorkoutHome
    ? `<section class="cal-workout-calendar-card" aria-label="${_esc(monthLabel)} 운동 달력">${weekdayHtml}${gridHtml}</section>`
    : `${weekdayHtml}${gridHtml}`;
  const bottomSheetHtml = isWorkoutHome
    ? _renderWorkoutHomeBottomSheet(_workoutHomeSelectedKey, { cache, plan, checkins, lookup })
    : '';

  const previousMonthAction = isWorkoutHome
    ? 'data-wt-calendar-action="shift-month" data-delta="-1"'
    : 'data-cal-action="shift-month" data-delta="-1"';
  const nextMonthAction = isWorkoutHome
    ? 'data-wt-calendar-action="shift-month" data-delta="1"'
    : 'data-cal-action="shift-month" data-delta="1"';
  const todayAction = isWorkoutHome
    ? 'data-wt-calendar-action="go-today"'
    : 'data-cal-action="go-today"';
  const seasonControlHtml = isWorkoutHome ? `
    <div class="cal-season-control ${currentSeason ? 'has-current-season' : 'needs-season'}" ${currentSeason ? `data-wt-season-overview="${_esc(currentSeasons.map(item => item.id).join(','))}" role="button" tabindex="0" aria-label="${_esc(currentSeasons.length > 1 ? `${currentSeasons.length}개 병행 시즌 목표와 주차별 달성 현황 열기` : `${currentSeason.name} 목표와 주차별 달성 현황 열기`)}"` : ''}>
      <span class="cal-season-emblem" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 20V5.2c4-2.4 7.2 2.4 12 0v9.3c-4.8 2.4-8-2.4-12 0"/><path d="m11.7 8.4.8 1.7 1.8.3-1.3 1.3.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.3 1.8-.3.8-1.7Z"/></svg></span>
      <div class="cal-season-copy"><span>${currentSeason ? 'CURRENT SEASON' : 'SEASON SETUP'}</span><strong>${_esc(currentSeasons.length > 1 ? `${currentSeasons.length}개 병행 시즌` : (currentSeason?.name || '새 시즌 설정 필요'))}</strong>${currentSeason ? `<small>${currentSeason.startDate}–${currentSeason.endDate}${currentSeasons.length > 1 ? ` · ${currentSeasons.map(item => item.name).join(' · ')}` : ''}</small>` : '<small>기록은 유지하고 새 목표를 세우며 시작합니다.</small>'}</div>
      <div class="cal-season-actions">
        ${currentSeason ? `<button type="button" class="cal-season-settings" data-wt-season-edit="${_esc(currentSeason.id)}" aria-label="${_esc(currentSeason.name)} 설정 수정" title="시즌 설정 수정"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.2 13.5a7.8 7.8 0 0 0 .1-1.5 7.8 7.8 0 0 0-.1-1.5l2-1.5-2-3.4-2.4 1a8.4 8.4 0 0 0-2.5-1.5L14 2.5h-4L9.7 5.1a8.4 8.4 0 0 0-2.5 1.5l-2.4-1-2 3.4 2 1.5A7.8 7.8 0 0 0 4.7 12c0 .5 0 1 .1 1.5l-2 1.5 2 3.4 2.4-1a8.4 8.4 0 0 0 2.5 1.5l.3 2.6h4l.3-2.6a8.4 8.4 0 0 0 2.5-1.5l2.4 1 2-3.4-2-1.5Z"/></svg></button>` : ''}
        <button type="button" class="cal-season-primary" data-wt-season-manager>${currentSeason ? '다음 시즌' : '시즌 시작'}</button>
      </div>
    </div>` : '';
  root.innerHTML = `
    <div class="cal-workout-surface ${surfaceClass}"${scrollSurfaceAttr}>
      <div class="cal-header">
        <button class="cal-nav-btn" ${previousMonthAction} aria-label="이전 달">‹</button>
        <div class="cal-title">
          <span>${monthLabel}</span>
          <button class="cal-today-btn" ${todayAction}>오늘</button>
        </div>
        <button class="cal-nav-btn" ${nextMonthAction} aria-label="다음 달">›</button>
      </div>

      ${showModeTabs ? _renderCalendarModeTabs() : ''}
      ${seasonControlHtml}
      ${summaryHtml}
      ${calendarBodyHtml}
      ${bottomSheetHtml}
    </div>
  `;
}

// 주차 레일에 띄울 "이번 주 해야 할 운동"을 시즌 설정에서 만든다.
// 위젯/시즌 개요와 같은 판정을 쓰기 위해 buildSeasonOverview 결과를 그대로 재사용한다.
// 반환: 월요일 키 -> { items, achieved, total }
function _buildWeekGoalsByMonday(registry, cache, todayKey) {
  const byMonday = new Map();
  const seasons = registry?.seasons || [];
  for (const season of seasons) {
    let overview;
    try {
      overview = buildSeasonOverview({
        cache,
        season,
        board: getSeasonTestBoardV2(season.id) || {},
        runningPlan: getSeasonRunningPlan(season.id) || {},
        todayKey,
      });
    } catch {
      continue;
    }
    for (const week of overview?.weeks || []) {
      const mondayKey = week.goalWeekStart;
      if (!mondayKey) continue;
      const bucket = byMonday.get(mondayKey) || { items: [], achieved: 0, total: 0 };
      for (const item of week.items || []) {
        if (!item) continue;
        bucket.items.push(item);
        if (item.state !== 'planned') {
          bucket.total += 1;
          if (item.state === 'achieved') bucket.achieved += 1;
        }
      }
      byMonday.set(mondayKey, bucket);
    }
  }
  return byMonday;
}

function _weekGoalStateIcon(state) {
  if (state === 'achieved') return '✓';
  if (state === 'attempted') return '△';
  if (state === 'planned') return '·';
  return '×';
}

function _renderWeekGoalRail(weekGoals) {
  if (!weekGoals?.items?.length) {
    return '<div class="cal-week-goals is-empty"><span>목표 없음</span></div>';
  }
  const chips = weekGoals.items.map(item => `
    <span class="cal-week-goal is-${_esc(item.state)}" title="${_esc(`${item.label} · ${item.detail}`)}">
      <i aria-hidden="true">${_weekGoalStateIcon(item.state)}</i><b>${_esc(item.label)}</b>
    </span>`).join('');
  return `<div class="cal-week-goals" data-wt-week-goals tabindex="0" role="list" aria-label="이번 주 운동 목표 ${weekGoals.achieved}/${weekGoals.total} 달성">${chips}</div>`;
}

function _renderWorkoutHomeMonthGrid({ y, m, firstDow, daysCount, dayCells, dayMetrics, weekGoalsByMonday }) {
  const weekRows = [];
  const rowCount = Math.ceil((firstDow + daysCount) / 7);
  for (let row = 0; row < rowCount; row++) {
    const cellHtmls = [];
    for (let dow = 0; dow < 7; dow++) {
      const day = (row * 7) + dow - firstDow + 1;
      if (day < 1 || day > daysCount) {
        cellHtmls.push(`<div class="cal-cell cal-cell-empty cal-workout-cell cal-workout-cell-outside"></div>`);
        continue;
      }
      cellHtmls.push(dayCells.get(day) || `<div class="cal-cell cal-cell-empty cal-workout-cell"></div>`);
    }

    const anchorDay = Math.min(daysCount, Math.max(1, (row * 7) - firstDow + 1));
    const weekNo = _isoWeekNumber(new Date(y, m, anchorDay));
    // 레일은 누적 기록 대신 "이 주에 해야 할 운동"을 보여준다. 달력 행은 일요일 시작이고
    // 시즌 주차는 월요일 시작이라, 행 한가운데(수요일)의 주간 시작으로 맞춘다.
    const railAnchorKey = dateKey(y, m, Math.min(daysCount, Math.max(1, (row * 7) - firstDow + 4)));
    const weekGoals = weekGoalsByMonday?.get(startOfSeasonWeek(railAnchorKey)) || null;
    weekRows.push(`
      <div class="cal-workout-week-row">
        <div class="cal-workout-week-rail" aria-label="${weekNo}주 운동 목표">
          <strong>${weekNo}주</strong>
          ${weekGoals?.total ? `<em class="cal-week-goal-count">${weekGoals.achieved}/${weekGoals.total}</em>` : ''}
          ${_renderWeekGoalRail(weekGoals)}
        </div>
        <div class="cal-workout-week-cells">
          ${cellHtmls.join('')}
        </div>
      </div>
    `);
  }
  return `<div class="cal-workout-month-grid" data-wt-calendar-scroll-surface>${weekRows.join('')}</div>`;
}

function _renderWorkoutHomeDayBar(selectedKey, { cache, plan, checkins, lookup }) {
  const selected = _parseDateKey(selectedKey) ? selectedKey : dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const bodyWeight = _weightAt(checkins, selected) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
  const wx = _workoutMetrics(selected, cache[selected] || {}, bodyWeight, lookup);
  const ordinal = _workoutRecordOrdinalForKey(cache, selected, plan, checkins, lookup);
  const recordText = ordinal > 0 ? `${ordinal}번째 기록` : '운동 기록 없음';
  const sessionText = wx.hasWorkout ? '1회차 보기' : '1회차 없음';
  const sheetState = _currentWorkoutHomeSheetState();
  const expanded = sheetState !== 'bar';
  const registry = getSeasonRegistry();
  const selectedSeason = findSeasonForDate(registry, selected);
  const currentSeason = findSeasonForDate(registry, dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()));
  const isArchived = currentSeason ? selected < currentSeason.startDate : !!(selectedSeason && selectedSeason.endDate < dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()));
  const seasonBadge = selectedSeason
    ? `${isArchived ? '지난 시즌' : '현재 시즌'} · ${selectedSeason.name}`
    : (isArchived ? '지난 시즌 이전 기록' : '시즌 미설정');
  return `
    <div class="cal-workout-day-bar" data-wt-sheet-bar aria-expanded="${expanded ? 'true' : 'false'}">
      <button type="button" class="cal-workout-day-expand" data-wt-sheet-toggle data-date-key="${selected}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? '날짜 상세 접기' : '선택한 날짜 열기'}">${expanded ? '⌄' : '⌃'}</button>
      <button type="button" class="cal-workout-day-main" data-wt-sheet-main data-wt-sheet-toggle data-date-key="${selected}" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? '날짜 상세 접기' : '선택한 날짜 열기'}">
        <span class="cal-workout-day-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.8" y="5.2" width="16.4" height="15" rx="2.2"/><path d="M7.5 3.5v3.4M16.5 3.5v3.4M3.8 10h16.4"/><path d="M8.2 14h.1M12 14h.1M15.8 14h.1"/></svg></span>
        <span class="cal-workout-day-copy"><span class="cal-workout-day-date">${selected} <em>${_dateDistanceLabel(selected)}</em><i class="cal-day-season-badge ${isArchived ? 'is-archived' : ''}">${_esc(seasonBadge)}</i></span><span class="cal-workout-day-sub">${recordText} · ${sessionText}</span></span>
      </button>
      <div class="cal-workout-day-actions">
        <button type="button" data-wt-calendar-action="go-today-detail">오늘</button>
      </div>
    </div>
  `;
}

function _renderWorkoutHomeBottomSheet(selectedKey, { cache, plan, checkins, lookup }) {
  const selected = _parseDateKey(selectedKey) ? selectedKey : dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const sheetState = _currentWorkoutHomeSheetState();
  const backdropHiddenAttr = sheetState === 'full' ? '' : ' hidden';
  const backdropAriaHidden = sheetState === 'full' ? 'false' : 'true';
  return `
    <div class="cal-workout-day-backdrop is-${sheetState}" data-wt-sheet-backdrop data-wt-sheet-state="${sheetState}" aria-hidden="${backdropAriaHidden}"${backdropHiddenAttr}></div>
    <section class="cal-workout-day-sheet is-${sheetState}" data-wt-day-sheet data-wt-sheet-state="${sheetState}" role="dialog" aria-modal="false" aria-expanded="${sheetState !== 'bar' ? 'true' : 'false'}" aria-label="선택 날짜 운동 기록">
      ${_renderWorkoutHomeDayBar(selected, { cache, plan, checkins, lookup })}
      <div class="cal-workout-day-sheet-body">
        ${_renderWorkoutHomeDetailHtml({ cache, plan, checkins, key: selected, includeHead: false })}
      </div>
    </section>
  `;
}

// ═════════════════════════════════════════════════════════════
// 월 이동
// ═════════════════════════════════════════════════════════════
function _shiftMonth(delta) {
  const d = new Date(_viewYear, _viewMonth + delta, 1);
  _viewYear  = d.getFullYear();
  _viewMonth = d.getMonth();
  _syncWorkoutHomeNavState({ action: 'calendar:month' });
  renderCalendar();
  renderWorkoutCalendarHome();
}

function _goToday() {
  _viewYear  = TODAY.getFullYear();
  _viewMonth = TODAY.getMonth();
  _syncWorkoutHomeNavState({ action: 'calendar:today' });
  renderCalendar();
  renderWorkoutCalendarHome();
}

// ═════════════════════════════════════════════════════════════
// 렌더
// ═════════════════════════════════════════════════════════════
export function renderCalendar() {
  const root = document.getElementById('calendar-root');
  if (!root) return;
  _bindCalendarActions(root);

  const cache = getCache() || {};
  const plan = getDietPlan() || null;
  const metrics = (plan && plan.weight && plan.height) ? calcDietMetrics(plan) : null;
  const checkins = _sortedCheckins();

  const y = _viewYear, m = _viewMonth;
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const daysCount = new Date(y, m + 1, 0).getDate();

  if (_calendarMode === 'workout') {
    _renderWorkoutCalendar(root, { cache, plan, checkins, y, m, firstDow, daysCount });
    return;
  }

  // 월내 집계 (상단 요약용)
  let monthSum = { scored: 0, count: 0, kcalIn: 0, kcalBurn: 0 };
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(`<div class="cal-cell cal-cell-empty"></div>`);

  for (let d = 1; d <= daysCount; d++) {
    const k = dateKey(y, m, d);
    const day = cache[k] || {};
    const future = isFuture(y, m, d);
    const before = isBeforeStart(y, m, d);
    const today  = k === dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const disabled = future || before;

    const mx = _dayMetrics(k, day, plan, metrics, checkins);

    if (mx.score != null) {
      monthSum.scored += mx.score;
      monthSum.count  += 1;
      monthSum.kcalIn += mx.kcalIn;
      monthSum.kcalBurn += mx.kcalBurned;
    }

    const classes = [
      'cal-cell',
      today ? 'cal-cell-today' : '',
      disabled ? 'cal-cell-disabled' : '',
      mx.band ? `cal-cell-band-${mx.band}` : '',
    ].filter(Boolean).join(' ');

    const onclick = disabled ? '' : `data-cal-action="open-day" data-date-key="${k}"`;
    const scoreHtml = mx.score != null
      ? `<div class="cal-score">${mx.score}<span>점</span></div>`
      : `<div class="cal-score cal-score-empty">—</div>`;

    const kcalInTxt   = mx.kcalIn     > 0 ? `${mx.kcalIn.toLocaleString()}` : '—';
    const kcalBurnTxt = mx.kcalBurned > 0 ? `${mx.kcalBurned.toLocaleString()}` : '—';
    const weightTxt   = mx.weight != null ? `${mx.weight.toFixed(1)}` : '—';
    const maxWeakHtml = mx.maxWeak?.hasAny
      ? `<div class="cal-max-weak-mini">약 ${mx.maxWeak.durationMin}분 · ${mx.maxWeak.sets}세트</div>`
      : '';

    const stampHtml = (mx.score != null && mx.score >= 90)
      ? `<img class="cal-stamp" src="./public/characters/tomato-happy.svg" alt="" aria-hidden="true">`
      : '';

    cells.push(`
      <div class="${classes}" ${onclick}>
        ${stampHtml}
        <div class="cal-cell-head">
          <span class="cal-cell-date">${d}</span>
          ${scoreHtml}
        </div>
        <div class="cal-cell-metrics">
          <div class="cal-metric"><span class="cal-metric-label">섭</span><span class="cal-metric-val">${kcalInTxt}</span></div>
          <div class="cal-metric"><span class="cal-metric-label">소</span><span class="cal-metric-val">${kcalBurnTxt}</span></div>
          <div class="cal-metric"><span class="cal-metric-label">체</span><span class="cal-metric-val">${weightTxt}</span></div>
        </div>
        ${maxWeakHtml}
      </div>
    `);
  }

  const monthLabel = `${y}년 ${m + 1}월`;
  const avgScore = monthSum.count > 0 ? Math.round(monthSum.scored / monthSum.count) : null;
  const weekdays = KOREAN_WEEKDAYS;

  root.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav-btn" data-cal-action="shift-month" data-delta="-1" aria-label="이전 달">‹</button>
      <div class="cal-title">
        <span>${monthLabel}</span>
        <button class="cal-today-btn" data-cal-action="go-today">오늘</button>
      </div>
      <button class="cal-nav-btn" data-cal-action="shift-month" data-delta="1" aria-label="다음 달">›</button>
    </div>

    ${_renderCalendarModeTabs()}

    ${avgScore != null ? `
    <div class="cal-month-summary">
      <div class="cal-month-avg">
        <span class="cal-month-avg-label">이번 달 평균</span>
        <span class="cal-month-avg-score">${avgScore}<span>점</span></span>
      </div>
      <div class="cal-month-side">
        <div><span>기록일</span><strong>${monthSum.count}일</strong></div>
        <div><span>총 섭취</span><strong>${monthSum.kcalIn.toLocaleString()} kcal</strong></div>
        <div><span>총 소모</span><strong>${monthSum.kcalBurn.toLocaleString()} kcal</strong></div>
      </div>
    </div>` : `
    <div class="cal-month-summary cal-month-empty">
      <span>이번 달 기록이 아직 없어요</span>
    </div>`}

    <div class="cal-weekdays">
      ${weekdays.map((w, i) => `<div class="cal-wd ${i === 0 ? 'cal-wd-sun' : ''} ${i === 6 ? 'cal-wd-sat' : ''}">${w}</div>`).join('')}
    </div>
    <div class="cal-grid">${cells.join('')}</div>

    <div class="cal-footnote">
      점수 산정 (100점 만점, 최저 70점): 칼로리(12) · 탄단지(5) · 운동 소모(8) · 체중 방향(3) · 기록 완결(2)
    </div>
  `;
}

export function renderWorkoutCalendarHome() {
  const root = document.getElementById('workout-calendar-root');
  if (!root) return;
  if (workoutSetKeyboardState.domLocked && _workoutSetKeyboardElement()?.classList.contains('is-open')) return;
  _rememberRenderedWorkoutSheetCarousel(root);
  _bindCalendarActions(root);
  destroyRunningMaps(root);
  _workoutRunningRouteHydration.invalidateAll();
  _workoutRunningMapPayloads.clear();

  const cache = getCache() || {};
  const plan = getDietPlan() || null;
  const checkins = _sortedCheckins();

  const y = _viewYear, m = _viewMonth;
  const first = new Date(y, m, 1);
  const firstDow = first.getDay();
  const daysCount = new Date(y, m + 1, 0).getDate();

  _renderWorkoutCalendar(root, {
    cache,
    plan,
    checkins,
    y,
    m,
    firstDow,
    daysCount,
    surface: 'workout-home',
    showModeTabs: false,
  });
  _bindWorkoutCycleRailActions(root);
  _bindWorkoutHomeSheetActions(root);
  _bindWorkoutHomeSheetInputIsolation(root);
  wtMountRunningSession();
  _mountWorkoutRunningMaps(root);
  _mountWorkoutSummaryElapsedTimers(root);
  _restoreRememberedWorkoutSheetCarousel(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
  _tryRestorePendingWorkoutSheetCarouselFocus(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
}

function _renderWorkoutHomeDetail(root, args) {
  destroyRunningMaps(root);
  _workoutRunningRouteHydration.invalidateAll();
  _workoutRunningMapPayloads.clear();
  root.innerHTML = _renderWorkoutHomeDetailHtml(args);
  wtMountRunningSession();
  _mountWorkoutRunningMaps(root);
  _mountWorkoutSummaryElapsedTimers(root);
}

function _registerWorkoutRunningMapPayload(row = {}) {
  const id = `running-detail-map-${++_workoutRunningMapSeq}`;
  _workoutRunningMapPayloads.set(id, _workoutRunningRouteHydration.register({
    points: Array.isArray(row.route) ? row.route : [],
    routeRef: row.routeRef || null,
  }));
  return id;
}

configureWorkoutDetailTemplate({
  getSelectedKey: () => _workoutHomeSelectedKey,
  getSessionIndex: () => _workoutHomeSessionIndex,
  setSessionIndex: (index) => { _workoutHomeSessionIndex = index; },
  recordOrdinal: _workoutRecordOrdinalForKey,
  registerRunningMapPayload: _registerWorkoutRunningMapPayload,
  sessionLabel: _sessionLabel,
});

function _findWorkoutRunningMapShell(root, mapId) {
  if (!mapId) return null;
  const shells = root?.querySelectorAll?.('[data-wt-running-route-map]') || [];
  return Array.from(shells).find(shell => shell.getAttribute('data-wt-running-route-map') === mapId) || null;
}

function _mountWorkoutRunningMaps(root) {
  root?.querySelectorAll?.('[data-wt-running-route-map]').forEach((shell) => {
    if (shell.getAttribute('data-wt-running-map-mounted') === 'true') return;
    const id = shell.getAttribute('data-wt-running-route-map');
    const payload = _workoutRunningMapPayloads.get(id) || { points: [] };
    shell.setAttribute('data-wt-running-map-mounted', 'true');
    const status = shell.querySelector?.('[data-running-map-status]');
    const mount = () => {
      if (status) status.textContent = '지도 불러오는 중';
      return renderRunningMap(shell, { points: payload.points, phase: 'detail' }).catch((e) => {
        shell.removeAttribute('data-wt-running-map-mounted');
        if (status) status.textContent = '지도 표시 실패';
        console.warn('[workout-calendar] running map render failed:', e);
      });
    };
    if (!payload.routeRef) {
      if (status) status.textContent = '지도 불러오는 중';
      void mount();
      return;
    }
    if (status) status.textContent = '전체 경로 불러오는 중';
    void _workoutRunningRouteHydration.hydrate(payload).then((result) => {
      if (result.status !== 'ready' || _workoutRunningMapPayloads.get(id) !== payload) return;
      if (_findWorkoutRunningMapShell(root, id) !== shell) return;
      void mount();
    }).catch((error) => {
      if (_workoutRunningMapPayloads.get(id) !== payload || _findWorkoutRunningMapShell(root, id) !== shell) return;
      shell.removeAttribute('data-wt-running-map-mounted');
      if (status) status.textContent = '전체 경로를 불러오지 못했어요';
      console.warn('[workout-calendar] running route hydration failed:', error);
    });
  });
}

function _showWorkoutRunningRoute(control, mapId) {
  const root = control?.closest?.('[data-wt-day-sheet]') || document;
  const shell = _findWorkoutRunningMapShell(root, mapId);
  if (!shell || !_workoutRunningMapPayloads.has(mapId)) return false;
  _mountWorkoutRunningMaps(root);
  return true;
}

function _syncWorkoutSummaryElapsedTimers(root = document) {
  const scope = root?.querySelectorAll ? root : document;
  scope.querySelectorAll('[data-wt-last-complete-elapsed]').forEach((node) => {
    node.textContent = formatWorkoutCompletionElapsed(node.getAttribute('data-completed-at'));
  });
}

function _clearWorkoutSummaryElapsedTimer() {
  if (!_workoutSummaryElapsedTimer) return;
  const timerApi = typeof window !== 'undefined' ? window : globalThis;
  timerApi.clearInterval?.(_workoutSummaryElapsedTimer);
  _workoutSummaryElapsedTimer = null;
}

function _mountWorkoutSummaryElapsedTimers(root = document) {
  if (typeof document === 'undefined') return;
  const scope = root?.querySelectorAll ? root : document;
  _syncWorkoutSummaryElapsedTimers(scope);
  _clearWorkoutSummaryElapsedTimer();
  if (!document.querySelector('[data-wt-last-complete-elapsed]')) return;
  const timerApi = typeof window !== 'undefined' ? window : globalThis;
  _workoutSummaryElapsedTimer = timerApi.setInterval?.(() => {
    if (!document.querySelector('[data-wt-last-complete-elapsed]')) {
      _clearWorkoutSummaryElapsedTimer();
      return;
    }
    _syncWorkoutSummaryElapsedTimers(document);
  }, 1000) || null;
}

// 세트 값 편집은 달력도 시트 구조도 바꾸지 않는다. 그런데 renderWorkoutCalendarHome()은
// #workout-calendar-root를 통째로 다시 그려서(월 달력 + 시트 + 러닝 지도 재장착) 한 행에
// 값을 넣을 때마다 화면 전체가 교체되고, 그게 입력 중 깜빡임으로 보인다.
// 값이 걸린 두 곳 — 회차 요약 카드와 종목 카드 슬라이드 — 만 갈아끼운다. 스크롤
// 컨테이너와 시트 엘리먼트는 그대로 두므로 스크롤 위치도, 시트에 걸린 위임
// 리스너도 살아 있다. 갈아끼울 자리를 못 찾으면 false를 돌려 전체 렌더로 넘긴다.
function _patchWorkoutSheetSetSurfaces() {
  if (typeof document === 'undefined') return false;
  const root = document.getElementById('workout-calendar-root');
  const sheet = root?.querySelector?.('[data-wt-day-sheet]');
  const track = sheet?.querySelector?.('[data-wt-day-exercise-carousel-track]');
  if (!track) return false;

  const key = _workoutHomeSelectedKey;
  const model = _workoutHomeDetailModel({
    cache: getCache() || {},
    plan: getDietPlan() || null,
    checkins: _sortedCheckins(),
    key,
  });
  // 종목이 사라지거나 늘어난 변화는 캐러셀 껍데기까지 바뀐다. 전체 렌더에 맡긴다.
  const rows = Array.isArray(model.wx?.exercises) ? model.wx.exercises : [];
  if (!rows.length || rows.length !== track.children.length) return false;

  const scrollLeft = track.scrollLeft;
  track.innerHTML = _renderWorkoutExerciseSlides(key, model.sessionIndex, rows);
  track.scrollLeft = scrollLeft;

  const summary = sheet.querySelector('.wt-day-sheet-summary') || sheet.querySelector('.wt-day-head');
  if (summary) {
    const card = summary.querySelector('.wt-day-summary-card');
    if (card) card.outerHTML = _renderWorkoutDetailSummaryCard(model.wx);
    _mountWorkoutSummaryElapsedTimers(root);
  }
  return true;
}

// 세트 편집 뒤 화면 갱신. 부분 갱신이 가능하면 그걸 쓰고, 아니면 전체를 다시 그린다.
function _renderWorkoutSheetAfterSetEdit() {
  if (_patchWorkoutSheetSetSurfaces()) return false;
  renderWorkoutCalendarHome();
  return true;
}

// data:workouts-updated 용 부분 갱신. f74aff5는 sheet:saved → renderAll 경로만
// 막았는데, 저장이 성공하면 Firestore 실시간 리스너가 같은 날짜의 에코를 보내고
// (data/data-load.js), app.js의 data:workouts-updated 리스너가 워크아웃 라우트를
// 통째로 다시 그린다 — #workout-calendar-root가 새 DOM으로 교체되면서 시트
// scrollTop이 0으로 리셋되고 그 순간 깜빡인다. 완료 체크의 증상이 그대로 되살아난
// 두 번째 경로다.
// 열려 있는 시트의 날짜만 바뀐 갱신은 여기서 제자리 패치로 끝내고 true를 돌린다.
// false면 호출부가 기존대로 전체 렌더를 돈다.
export function refreshWorkoutSheetForDataUpdate(changedDateKeys = []) {
  if (typeof document === 'undefined') return false;
  if (_workoutHomeView !== 'detail') return false;
  const keys = [...new Set((Array.isArray(changedDateKeys) ? changedDateKeys : [])
    .map(key => String(key || '').trim())
    .filter(Boolean))];
  // 다른 날짜가 섞였으면 월 달력의 표시까지 바뀌어야 한다. 전체 렌더에 맡긴다.
  if (!keys.length || keys.some(key => key !== _workoutHomeSelectedKey)) return false;
  // 세트 키패드가 열려 있는 동안엔 아무것도 갈아끼우지 않는다. 입력 중인 값과
  // 포커스를 잃는 쪽이 표시 지연보다 나쁘다 — _saveWorkoutHomeSessionResult의
  // 기존 가드와 같은 판단이고, 키패드를 닫는 커밋이 곧 갱신을 이어받는다.
  if (_workoutSetKeyboardActiveInput()) return true;
  return _patchWorkoutSheetSetSurfaces();
}

// ═════════════════════════════════════════════════════════════
// 일자 상세 요약 모달
// ═════════════════════════════════════════════════════════════
function _openWorkoutDay(key) {
  const cache = getCache() || {};
  const day = cache[key] || {};
  const plan = getDietPlan() || null;
  const checkins = _sortedCheckins();
  const bodyWeight = _weightAt(checkins, key) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
  const wx = _workoutMetrics(key, day, bodyWeight, _buildWorkoutLookup());

  const [yy, mm, dd] = key.split('-').map(n => parseInt(n, 10));
  const d = new Date(yy, mm - 1, dd);
  const dowLabel = KOREAN_WEEKDAYS[d.getDay()];
  const title = `${yy}.${String(mm).padStart(2,'0')}.${String(dd).padStart(2,'0')} (${dowLabel}) 운동`;

  const titleEl = document.getElementById('calendar-day-title');
  const body = document.getElementById('calendar-day-body');
  if (!titleEl || !body) return;
  titleEl.textContent = title;

  const exerciseHtml = wx.exercises.length ? `
    <div class="cal-workout-detail-section">
      <div class="cal-workout-detail-title">근력</div>
      <div class="cal-workout-detail-list">
        ${wx.exercises.map((row) => {
          if (row.cardio) {
            return `
              <div class="cal-workout-ex-row cal-workout-ex-row-cardio">
                <div class="cal-workout-ex-head">
                  <strong>${_esc(row.name)}</strong>
                  <span>유산소</span>
                </div>
                <div class="cal-workout-ex-top">${_esc(_cardioSummaryText(row.cardio))}</div>
                ${row.note ? `<div class="cal-workout-note">${_esc(row.note)}</div>` : ''}
              </div>
            `;
          }
          const volumeText = row.volume > 0 ? ` · ${formatWorkoutTrackValue('M', row.volume)}` : '';
          return `
            <div class="cal-workout-ex-row">
              <div class="cal-workout-ex-head">
                <strong>${_esc(row.name)}</strong>
                <span>${row.setCount}세트${volumeText}</span>
              </div>
              <div class="cal-workout-ex-top">대표 ${_esc(row.topSetText)}</div>
              ${row.setTexts.length ? `
                <div class="cal-workout-set-list">
                  ${row.setTexts.map((text, i) => `<span>${i + 1}. ${_esc(text)}</span>`).join('')}
                </div>
              ` : ''}
              ${row.note ? `<div class="cal-workout-note">${_esc(row.note)}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const activityHtml = wx.activities.length ? `
    <div class="cal-workout-detail-section">
      <div class="cal-workout-detail-title">활동</div>
      <div class="cal-workout-activity-list">
        ${wx.activities.map(row => `
          <div class="cal-workout-activity-row cal-workout-activity-${row.tone}">
            <div class="cal-workout-activity-head">
              <strong>${_esc(row.label)}</strong>
              <span>${_formatDurationShort(row.durationSec)}</span>
            </div>
            <div class="cal-workout-activity-main">${_esc(row.main || '기록 있음')}</div>
            ${row.detail ? `<div class="cal-workout-note">${_esc(row.detail)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  body.innerHTML = `
    <div class="cal-workout-detail-summary">
      <div><span>시간</span><strong>${_formatDurationShort(wx.durationSec)}</strong></div>
      <div><span>세트</span><strong>${wx.setCount ? `${wx.setCount}세트` : '—'}</strong></div>
      <div><span>볼륨</span><strong>${wx.volume > 0 ? formatWorkoutTrackValue('M', wx.volume) : '—'}</strong></div>
      <div><span>소모</span><strong>${wx.burned.total > 0 ? `${wx.burned.total} kcal` : '—'}</strong></div>
    </div>

    ${wx.hasWorkout ? `
      ${exerciseHtml}
      ${activityHtml}
    ` : `
      <div class="cal-workout-empty-detail">운동 기록이 없어요</div>
    `}
  `;

  _bindCalendarDayModal();
  openModal('calendar-day-modal');
}

function _openDay(key) {
  if (_calendarMode === 'workout') {
    _openWorkoutDay(key);
    return;
  }

  const cache = getCache() || {};
  const day = cache[key] || {};
  const plan = getDietPlan() || null;
  const metrics = (plan && plan.weight && plan.height) ? calcDietMetrics(plan) : null;
  const checkins = _sortedCheckins();

  const mx = _dayMetrics(key, day, plan, metrics, checkins);

  const [yy, mm, dd] = key.split('-').map(n => parseInt(n, 10));
  const d = new Date(yy, mm - 1, dd);
  const dowLabel = KOREAN_WEEKDAYS[d.getDay()];
  const title = `${yy}.${String(mm).padStart(2,'0')}.${String(dd).padStart(2,'0')} (${dowLabel})`;

  const titleEl = document.getElementById('calendar-day-title');
  const body = document.getElementById('calendar-day-body');
  if (!titleEl || !body) return;
  titleEl.textContent = title;

  // 점수 카드
  // 토마토 팔레트 농도 그라데이션
  const scoreColor =
    mx.band === 'great' ? '#ca1d13' :  // Dark
    mx.band === 'good'  ? '#fa342c' :  // Primary
    mx.band === 'soso'  ? '#fc6a66' :  // Sub
    mx.band === 'bad'   ? '#e89591' :  // Light 중간 (가독성)
    'var(--muted)';
  const scoreText = mx.score != null ? `${mx.score}` : '—';
  const bandLabel = mx.band === 'great' ? '완벽' :
                    mx.band === 'good'  ? '잘한 날' :
                    mx.band === 'soso'  ? '아쉬운 날' :
                    mx.band === 'bad'   ? '개선 필요' : '기록 없음';

  // breakdown
  const bd = mx.breakdown || {};
  const row = (label, item, desc, extraClass = '') => {
    if (!item) return '';
    const gained = item.max - item.penalty;
    const actionAttrs = extraClass ? ' role="button" tabindex="0" aria-label="해당일 운동 기록 열기"' : '';
    return `<div class="cal-bd-row ${extraClass}"${actionAttrs}>
      <div class="cal-bd-main">
        <span class="cal-bd-label">${label}</span>
        <span class="cal-bd-score">${gained}<small>/${item.max}</small></span>
      </div>
      <div class="cal-bd-desc">${desc}</div>
    </div>`;
  };

  const kcalDesc = mx.targetKcal > 0
    ? `목표 ${Math.round(mx.targetKcal).toLocaleString()} kcal · 실제 ${mx.kcalIn.toLocaleString()} kcal`
    : (mx.kcalIn > 0 ? `실제 ${mx.kcalIn.toLocaleString()} kcal (목표 미설정)` : '기록 없음');

  const macroDesc = mx.macroTarget
    ? (() => {
        const p = sumDayNutrient(day, 'protein');
        const c = (day.bCarbs||0)+(day.lCarbs||0)+(day.dCarbs||0)+(day.sCarbs||0);
        const f = (day.bFat||0)+(day.lFat||0)+(day.dFat||0)+(day.sFat||0);
        return `단백 ${Math.round(p)}/${mx.macroTarget.proteinG}g · 탄수 ${Math.round(c)}/${mx.macroTarget.carbG}g · 지방 ${Math.round(f)}/${mx.macroTarget.fatG}g`;
      })()
    : '식단 플랜 미설정';

  const b = mx.burnedBreakdown;
  const workoutParts = [];
  if (b.gym > 0)      workoutParts.push(`헬스 ${b.gym}`);
  if (b.cardio > 0)   workoutParts.push(`유산소 ${b.cardio}`);
  if (b.running > 0)  workoutParts.push(`러닝 ${b.running}`);
  if (b.swimming > 0) workoutParts.push(`수영 ${b.swimming}`);
  if (b.cf > 0)       workoutParts.push(`CF ${b.cf}`);
  const workoutDesc = workoutParts.length
    ? `총 ${b.total} kcal (${workoutParts.join(' · ')})`
    : '운동 기록 없음';

  const weightDesc = mx.weight != null
    ? (mx.weightDeltaKg != null
        ? `${mx.weight.toFixed(1)}kg (7일전 대비 ${mx.weightDeltaKg >= 0 ? '+' : ''}${mx.weightDeltaKg.toFixed(1)}kg)`
        : `${mx.weight.toFixed(1)}kg`)
    : '7일 내 체중 기록 없음';

  const meals = [
    { label: '아침', v: day.bKcal || 0, skipped: day.breakfast_skipped },
    { label: '점심', v: day.lKcal || 0, skipped: day.lunch_skipped },
    { label: '저녁', v: day.dKcal || 0, skipped: day.dinner_skipped },
    { label: '간식', v: day.sKcal || 0, skipped: false },
  ];
  const loggedMeals = meals.filter(m => m.v > 0 || m.skipped).length;
  const completeDesc = `식사 기록 ${loggedMeals}/4 (${meals.filter(m => m.skipped).length > 0 ? '굶음 포함' : '기록 중심'})`;
  const maxWeak = mx.maxWeak;
  const weakNames = maxWeak?.selected?.length
    ? maxWeak.selected.map(x => MAX_WEAK_LABEL[x] || x).join(' · ')
    : '선택 없음';
  const maxWeakDesc = maxWeak?.hasAny
    ? `약점 ${weakNames} · ${maxWeak.durationMin}분 · ${maxWeak.sets}세트 · ${formatWorkoutTrackValue('M', maxWeak.volume)} · +${maxWeak.bonus}점`
    : '';

  body.innerHTML = `
    <div class="cal-score-card" style="border-color:${scoreColor}22;background:${scoreColor}0d;">
      <div class="cal-score-big" style="color:${scoreColor};">
        ${scoreText}<span>${mx.score != null ? '점' : ''}</span>
      </div>
      <div class="cal-score-band" style="color:${scoreColor};">${bandLabel}</div>
    </div>

    <div class="cal-bd-list">
      ${row('섭취 칼로리', bd.kcal, kcalDesc)}
      ${row('탄단지 균형', bd.macro, macroDesc)}
      ${row('운동 소모',   bd.workout, workoutDesc, 'cal-bd-row-workout')}
      ${row('체중 방향',   bd.weight, weightDesc)}
      ${row('기록 완결',   bd.complete, completeDesc)}
      ${maxWeak?.hasAny ? `<div class="cal-bd-row cal-bd-row-max">
        <div class="cal-bd-main">
          <span class="cal-bd-label">맥스 약점 공략</span>
          <span class="cal-bd-score">+${maxWeak.bonus}<small>/5</small></span>
        </div>
        <div class="cal-bd-desc">${maxWeakDesc}</div>
      </div>` : ''}
    </div>
  `;

  _bindCalendarDayModal();
  openModal('calendar-day-modal');
  const workoutRow = body.querySelector('.cal-bd-row-workout');
  if (workoutRow) {
    const openWorkout = () => {
      closeModal('calendar-day-modal');
      const key = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      openWorkoutDaySheet(key, {
        sessionIndex: 0,
        sheetState: 'full',
        action: 'calendar-modal:workout-sheet',
      });
    };
    workoutRow.addEventListener('click', openWorkout);
    workoutRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWorkout();
      }
    });
  }
}

function _closeDay(e) {
  if (e && e.target && e.target.id !== 'calendar-day-modal' && !e.target.classList.contains('cal-day-close')) return;
  closeModal('calendar-day-modal');
}

function _normalizeWorkoutHomeSheetState(state) {
  return WORKOUT_HOME_SHEET_STATES.includes(state) ? state : 'bar';
}

function _currentWorkoutHomeSheetState() {
  return _workoutHomeView === 'detail' ? _normalizeWorkoutHomeSheetState(_workoutHomeSheetState) : 'bar';
}

function _applyWorkoutHomeSheetState() {
  if (typeof document === 'undefined') return;
  const sheet = document.querySelector('#workout-calendar-root [data-wt-day-sheet]');
  const backdrop = document.querySelector('#workout-calendar-root [data-wt-sheet-backdrop]');
  if (!sheet) {
    if (backdrop) {
      backdrop.classList.remove('is-full');
      backdrop.classList.add('is-bar');
      backdrop.setAttribute('data-wt-sheet-state', 'bar');
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.toggleAttribute('hidden', true);
    }
    return;
  }
  const state = _currentWorkoutHomeSheetState();
  const expanded = state !== 'bar';
  const expandedText = expanded ? 'true' : 'false';
  const toggleLabel = expanded ? '날짜 상세 접기' : '선택한 날짜 열기';
  WORKOUT_HOME_SHEET_CLASS_STATES.forEach(item => sheet.classList.toggle(`is-${item}`, item === state));
  sheet.dataset.wtSheetState = state;
  sheet.setAttribute('aria-expanded', expandedText);
  const bar = sheet.querySelector('[data-wt-sheet-bar]');
  if (bar) bar.setAttribute('aria-expanded', expandedText);
  sheet.querySelectorAll('[data-wt-sheet-toggle]').forEach((toggle) => {
    toggle.setAttribute('aria-expanded', expandedText);
    toggle.setAttribute('aria-label', toggleLabel);
  });
  const arrow = sheet.querySelector('.cal-workout-day-expand[data-wt-sheet-toggle]');
  if (arrow) arrow.textContent = expanded ? '⌄' : '⌃';
  if (backdrop) {
    backdrop.classList.toggle('is-full', expanded);
    backdrop.classList.toggle('is-bar', !expanded);
    backdrop.setAttribute('data-wt-sheet-state', state);
    backdrop.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    backdrop.toggleAttribute('hidden', !expanded);
  }
}

function _setWorkoutHomeSheetState(state, { render = false } = {}) {
  const next = _normalizeWorkoutHomeSheetState(state);
  if (_currentWorkoutHomeSheetState() !== 'bar' && next === 'bar') {
    _rememberWorkoutSheetCarouselState(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
  }
  _workoutHomeSheetState = next;
  _workoutHomeView = next === 'bar' ? 'month' : 'detail';
  if (_workoutHomeView === 'month') {
    closeWorkoutDaySheet({ history: 'replace', notify: false, action: 'sheet:close' });
  } else {
    _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:update' });
  }
  if (render) {
    renderWorkoutCalendarHome();
    return;
  }
  _applyWorkoutHomeSheetState();
}

function _toggleWorkoutHomeSheet(key = _workoutHomeSelectedKey) {
  _workoutHomeSelectedKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  if (_currentWorkoutHomeSheetState() === 'bar') {
    _workoutHomeView = 'detail';
    _workoutHomeSheetState = 'full';
    openWorkoutDaySheet(_workoutHomeSelectedKey, {
      sessionIndex: _workoutHomeSessionIndex,
      sheetState: 'full',
      viewYear: _viewYear,
      viewMonth: _viewMonth,
      scrollTop: _workoutHomeScrollTop(),
      history: 'push',
      notify: false,
      action: 'sheet:open',
    });
    renderWorkoutCalendarHome();
    _restoreRememberedWorkoutSheetCarousel(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
    return;
  }
  _setWorkoutHomeSheetState('bar');
}

function _runWorkoutHomeSheetCardAction(action, control) {
  const key = control?.getAttribute?.('data-date-key') || _workoutHomeSelectedKey;
  const sessionIndex = control?.getAttribute?.('data-session-index');
  const exerciseIndex = control?.getAttribute?.('data-exercise-index');
  const setIndex = control?.getAttribute?.('data-set-index');
  const setType = control?.getAttribute?.('data-set-type') || '';
  const cardId = control?.getAttribute?.('data-card-id') || '';
  const activityKey = control?.getAttribute?.('data-activity-key') || '';
  const field = control?.getAttribute?.('data-wt-set-edit-field') || '';
  const routeMapId = control?.getAttribute?.('data-route-map-id') || '';
  switch (action) {
    case 'back-month':
      _backWorkoutHomeMonth();
      return true;
    case 'select-session':
      _selectWorkoutHomeSession(sessionIndex);
      return true;
    case 'select-running':
      _selectWorkoutHomeRunning();
      return true;
    case 'add-exercise-set':
      return _addWorkoutExerciseSetFromSheet(key, sessionIndex, exerciseIndex);
    case 'copy-previous-sets':
      return _copyPreviousWorkoutExerciseSetsFromSheet(key, sessionIndex, exerciseIndex);
    case 'edit-set-field':
      return _focusWorkoutSetInlineFieldFromSheet(key, sessionIndex, exerciseIndex, setIndex, field);
    case 'toggle-set-editor':
      return _toggleWorkoutSetEditorFromSheet(key, sessionIndex, exerciseIndex, setIndex);
    case 'toggle-set-type':
      return _toggleWorkoutSetTypeMenuFromSheet(key, sessionIndex, exerciseIndex, setIndex);
    case 'set-set-type':
      return _setWorkoutExerciseSetTypeFromSheet(key, sessionIndex, exerciseIndex, setIndex, setType);
    case 'set-backoff-mode':
      return _setWorkoutBackoffModeFromSheet(key, sessionIndex, exerciseIndex, setIndex, control?.getAttribute?.('data-backoff-mode') || '');
    case 'complete-exercise':
      return _completeWorkoutExerciseFromSheet(cardId, key, sessionIndex, exerciseIndex);
    case 'edit-exercise':
      _editWorkoutExerciseCard(cardId);
      return true;
    case 'toggle-card':
      _toggleWorkoutDetailCard(cardId);
      return true;
    case 'add-running':
      return _openWorkoutHomeRunning(key);
    case 'show-running-route':
      return _showWorkoutRunningRoute(control, routeMapId);
    case 'delete-exercise':
      return _deleteWorkoutExercise(key, sessionIndex, exerciseIndex);
    case 'delete-activity':
      return _deleteWorkoutActivity(key, sessionIndex, activityKey);
    case 'toggle-export-menu':
      _toggleWorkoutDayExportMenu(control);
      return true;
    case 'export-day':
      _closeWorkoutDayExportMenu(control);
      return _exportWorkoutRecords(key, 'day');
    case 'export-week':
      _closeWorkoutDayExportMenu(control);
      return _exportWorkoutRecords(key, 'week');
    default:
      return false;
  }
}

function _workoutDayExportMenuParts(control) {
  const root = control?.closest?.('[data-wt-day-sheet]')
    || control?.closest?.('.wt-day-detail')
    || (typeof document !== 'undefined' ? document : null);
  return {
    menu: root?.querySelector?.('[data-wt-day-export-menu]') || null,
    trigger: root?.querySelector?.('[data-wt-sheet-card-action="toggle-export-menu"]') || null,
  };
}

// 시트 전체를 다시 그리지 않고 메뉴만 여닫는다. 세트 입력 중 재렌더가 끼어들면
// 포커스와 커서가 튀기 때문에 구조 변경이 없는 토글은 DOM에서 직접 처리한다.
function _toggleWorkoutDayExportMenu(control) {
  const { menu, trigger } = _workoutDayExportMenuParts(control);
  if (!menu) return;
  const open = menu.hasAttribute('hidden');
  menu.toggleAttribute('hidden', !open);
  trigger?.setAttribute?.('aria-expanded', open ? 'true' : 'false');
}

function _closeWorkoutDayExportMenu(control) {
  const { menu, trigger } = _workoutDayExportMenuParts(control);
  if (!menu) return;
  menu.setAttribute('hidden', '');
  trigger?.setAttribute?.('aria-expanded', 'false');
}

async function _importWorkoutRunningRecord(input, key) {
  if (_workoutRunningImportActive) return false;
  const file = input?.files?.[0];
  if (!file) return false;
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const sheet = input.closest?.('[data-wt-day-sheet]');
  const buttons = Array.from(sheet?.querySelectorAll?.('[data-wt-day-upload-running]') || []);
  const labels = buttons
    .map(button => button.querySelector?.('[data-wt-running-upload-label]'))
    .filter(Boolean);
  const originalLabels = new Map(labels.map(label => [label, label.textContent || '기록 업로드']));
  _workoutRunningImportActive = true;
  input.disabled = true;
  buttons.forEach((button) => {
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
  });
  labels.forEach((label) => { label.textContent = '읽는 중'; });
  showToast('스크린샷에서 러닝 기록을 읽고 있어요', 2400, 'info');
  try {
    const {
      parseRunningRecordImage,
      saveImportedRunningRecord,
    } = await import('./workout/running-record-import.js');
    const record = await parseRunningRecordImage(file, { targetDateKey: targetKey });
    await saveImportedRunningRecord(targetKey, record);
    _workoutHomeSelectedKey = targetKey;
    _workoutHomeSessionIndex = WORKOUT_RUNNING_SESSION_INDEX;
    _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:running-import' });
    _workoutDetailCollapsed.clear();
    document.dispatchEvent(new CustomEvent('sheet:saved', {
      detail: { source: 'screenshot-import', dateKey: targetKey },
    }));
    showToast(`${_fmtNum(record.distanceKm, 2)}km 러닝 기록을 저장했어요`, 2400, 'success');
    return true;
  } catch (error) {
    console.warn('[workout-calendar] running screenshot import failed:', error);
    showToast(error?.message || '러닝 기록을 읽지 못했어요', 3200, 'error');
    return false;
  } finally {
    _workoutRunningImportActive = false;
    input.value = '';
    input.disabled = false;
    buttons.forEach((button) => {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.removeAttribute('aria-busy');
    });
    labels.forEach((label) => { label.textContent = originalLabels.get(label) || '기록 업로드'; });
  }
}

function _bindWorkoutHomeSheetActions(root) {
  const sheet = root?.querySelector?.('[data-wt-day-sheet]');
  if (!sheet) return;
  _bindWorkoutSetSwipeDelete(sheet);
  sheet.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const input = target?.closest?.(WORKOUT_SHEET_SET_INPUT_SELECTOR);
    if (!input || !sheet.contains(input)) return;
    // 잠금은 이 인계가 끝나면 반드시 풀어야 한다. 커밋이 떠 있으면 커밋이,
    // 없으면 이 핸들러 끝에서 푼다. 안 풀면 키패드가 사는 내내 잠금이 남아
    // 다른 세트 행 탭에 필요한 재렌더까지 막힌다.
    const previousInput = workoutSetKeyboardState.input?.isConnected ? workoutSetKeyboardState.input : null;
    const targetMeta = _workoutSetKeyboardMeta(input);
    const isInline = input.hasAttribute('data-wt-set-inline-input');
    const switchingMountedField = isInline
      && previousInput
      && previousInput !== input
      && previousInput.hasAttribute('data-wt-set-inline-input');
    let domLockToken = switchingMountedField ? _lockWorkoutSetKeyboardDom() : null;
    let domLockHandedToCommit = false;
    if (isInline) {
      const inlineEditorKey = input.getAttribute('data-wt-inline-editor-key') || '';
      if (inlineEditorKey) workoutDetailState.inlineSetEditor = inlineEditorKey;
    }
    // 이전 칸에 입력해 둔 값은 어떤 세트 입력으로 옮기든 즉시 상태에 커밋한다.
    // 확장 편집 패널(무게/횟수/RIR/ROM)은 readonly 키패드 입력이라 change 이벤트가
    // 없어서, 여기서 커밋하지 않으면 확인(완료) 시 리렌더가 값을 지워버린다.
    if (previousInput && previousInput !== input
      && previousInput.getAttribute('data-wt-set-keyboard-dirty') === 'true') {
      domLockHandedToCommit = !!domLockToken;
      const releaseToken = domLockToken;
      Promise.resolve(_commitWorkoutSetKeyboardInput(previousInput, {
        closeInline: false,
        nextTarget: targetMeta,
        skipRender: true,
      })).catch((error) => {
        console.warn('[workout-calendar] set field handoff commit failed:', error);
      }).finally(() => {
        if (releaseToken) _releaseWorkoutSetKeyboardDom(releaseToken);
      });
    }
    if (switchingMountedField) {
      _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-inline-field' });
    }
    _clearWorkoutSetInputOnFocus(input);
    _showWorkoutSetKeyboard(input);
    // focusin은 포커스가 이미 옮겨진 뒤에 온다. 커밋이 없으면 인계는 여기서 끝.
    if (!domLockHandedToCommit) _releaseWorkoutSetKeyboardDom(domLockToken);
  }, true);
  sheet.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const input = target?.closest?.(WORKOUT_SHEET_SET_INPUT_SELECTOR);
    if (!input || !sheet.contains(input)) return;
    input.setAttribute('data-wt-set-keyboard-dirty', 'true');
    input.setAttribute('data-wt-set-keyboard-pending-value', input.value ?? '');
  }, true);
  sheet.addEventListener('change', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const runningUploadInput = target?.closest?.('[data-wt-running-upload-input]');
    if (runningUploadInput && sheet.contains(runningUploadInput)) {
      const key = runningUploadInput.getAttribute('data-date-key') || _workoutHomeSelectedKey;
      Promise.resolve(_importWorkoutRunningRecord(runningUploadInput, key)).catch((error) => {
        console.warn('[workout-calendar] running upload change failed:', error);
      });
      return;
    }
    const input = target?.closest?.(WORKOUT_SHEET_SET_INPUT_SELECTOR);
    if (!input || !sheet.contains(input)) return;
    input.removeAttribute('data-wt-set-keyboard-dirty');
    Promise.resolve(_updateWorkoutExerciseSetFromSheet(
      input.getAttribute('data-date-key') || _workoutHomeSelectedKey,
      input.getAttribute('data-session-index'),
      input.getAttribute('data-exercise-index'),
      input.getAttribute('data-set-index'),
      input.getAttribute('data-field'),
      input.value,
      input,
    )).catch((error) => {
      console.warn('[workout-calendar] set input change failed:', error);
    });
  }, true);
  sheet.addEventListener('focusout', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const input = target?.closest?.(WORKOUT_SHEET_SET_INPUT_SELECTOR);
    if (!input || !sheet.contains(input)) return;
    window.setTimeout?.(() => {
      const active = document.activeElement;
      if (active?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return;
      if (active?.closest?.('[data-wt-set-keyboard]')) return;
      if (active?.closest?.('[data-wt-set-edit-field]')) return;
      _hideWorkoutSetKeyboard({ commit: true });
    }, 0);
  }, true);
  sheet.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const input = target?.closest?.('[data-wt-set-inline-input]');
    if (!input || !sheet.contains(input)) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      input.blur?.();
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    Promise.resolve(_cancelWorkoutSetInlineFieldFromSheet(
      input.getAttribute('data-date-key') || _workoutHomeSelectedKey,
      input.getAttribute('data-session-index'),
      input.getAttribute('data-exercise-index'),
      input.getAttribute('data-set-index'),
      input.getAttribute('data-field')
    )).catch((e) => {
      console.warn('[workout-calendar] set inline edit cancel failed:', e);
    });
  }, true);
  sheet.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target?.closest?.('[data-wt-day-export-menu], [data-wt-sheet-card-action="toggle-export-menu"]')) {
      _closeWorkoutDayExportMenu(sheet);
    }
    const editField = target?.closest?.('[data-wt-set-edit-field]');
    if (editField && sheet.contains(editField)) {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(_focusWorkoutSetInlineFieldFromSheet(
        editField.getAttribute('data-date-key') || _workoutHomeSelectedKey,
        editField.getAttribute('data-session-index'),
        editField.getAttribute('data-exercise-index'),
        editField.getAttribute('data-set-index'),
        editField.getAttribute('data-wt-set-edit-field')
      )).catch((e) => {
        console.warn('[workout-calendar] set field edit action failed:', e);
      });
      return;
    }
    const doneToggle = target?.closest?.('[data-wt-set-done-toggle]');
    if (doneToggle && sheet.contains(doneToggle)) {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(_toggleWorkoutExerciseSetDoneFromSheet(
        doneToggle.getAttribute('data-date-key') || _workoutHomeSelectedKey,
        doneToggle.getAttribute('data-session-index'),
        doneToggle.getAttribute('data-exercise-index'),
        doneToggle.getAttribute('data-set-index')
      )).catch((e) => {
        console.warn('[workout-calendar] set done toggle action failed:', e);
      });
      return;
    }
    const setRemove = target?.closest?.('[data-wt-set-remove]');
    if (setRemove && sheet.contains(setRemove)) {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(_removeWorkoutExerciseSetFromSheet(
        setRemove.getAttribute('data-date-key') || _workoutHomeSelectedKey,
        setRemove.getAttribute('data-session-index'),
        setRemove.getAttribute('data-exercise-index'),
        setRemove.getAttribute('data-set-index')
      )).catch((e) => {
        console.warn('[workout-calendar] set remove action failed:', e);
      });
      return;
    }
    const cardAction = target?.closest?.('[data-wt-sheet-card-action]');
    if (cardAction && sheet.contains(cardAction)) {
      event.preventDefault();
      event.stopPropagation();
      const action = cardAction.getAttribute('data-wt-sheet-card-action') || '';
      const result = _runWorkoutHomeSheetCardAction(action, cardAction);
      if (result === false) {
        console.warn('[workout-calendar] unknown sheet card action:', action);
        return;
      }
      Promise.resolve(result).catch((e) => {
        console.warn('[workout-calendar] sheet card action failed:', e);
      });
      return;
    }
    if (target?.closest?.('[data-wt-sheet-action]')) return;
    const toggle = target?.closest?.('[data-wt-sheet-toggle]');
    if (toggle && sheet.contains(toggle)) {
      event.preventDefault();
      event.stopPropagation();
      _toggleWorkoutHomeSheet(toggle.getAttribute('data-date-key') || _workoutHomeSelectedKey);
      return;
    }
    const addRunning = target?.closest?.('[data-wt-day-add-running]');
    if (addRunning) {
      event.preventDefault();
      event.stopPropagation();
      const key = addRunning.getAttribute('data-date-key') || _workoutHomeSelectedKey;
      Promise.resolve(_openWorkoutHomeRunning(key)).catch((e) => {
        console.warn('[workout-calendar] running action failed:', e);
      });
      return;
    }
    const uploadRunning = target?.closest?.('[data-wt-day-upload-running]');
    if (uploadRunning && sheet.contains(uploadRunning)) {
      event.preventDefault();
      event.stopPropagation();
      const uploadInput = sheet.querySelector?.('[data-wt-running-upload-input]');
      if (!uploadInput || _workoutRunningImportActive) return;
      uploadInput.setAttribute('data-date-key', uploadRunning.getAttribute('data-date-key') || _workoutHomeSelectedKey);
      uploadInput.click();
      return;
    }
    const add = target?.closest?.('[data-wt-day-add-session]');
    if (!add) return;
    event.preventDefault();
    event.stopPropagation();
    const key = add.getAttribute('data-date-key') || _workoutHomeSelectedKey;
    Promise.resolve(_addWorkoutHomeSession(key)).catch((e) => {
      console.warn('[workout-calendar] add session action failed:', e);
      showToast('종목 추가 화면을 열지 못했어요', 2200, 'error');
    });
  }, true);
}

// 시트 안에서 아직 확정되지 않은 세트 입력(중량/횟수)을 찾는다. 커스텀 키패드는
// 값을 프로그램으로 넣기 때문에 change 이벤트가 없고, blur 커밋은 setTimeout(0)로
// 밀린다. 그래서 클릭 액션이 먼저 렌더를 갈아치우면 입력이 그대로 사라진다.
// 입력을 먼저 확정한 뒤 세트를 다시 읽는 액션을 실행한다.
function _clearWorkoutSetInputOnFocus(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return;
  if (!input.hasAttribute('data-wt-set-clear-on-focus')) return;
  input.removeAttribute('data-wt-set-clear-on-focus');
  if (input.value !== '') input.value = '';
}

function _bindCalendarDayModal() {
  const modal = document.getElementById('calendar-day-modal');
  if (!modal || modal.dataset.calendarDayActionsBound) return;
  modal.dataset.calendarDayActionsBound = '1';
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-cal-day-close]')) _closeDay(event);
  });
}

function _bindWorkoutHomeSheetInputIsolation(root) {
  const backdrop = root?.querySelector?.('[data-wt-sheet-backdrop]');
  const sheet = root?.querySelector?.('[data-wt-day-sheet]');
  const scroller = sheet?.querySelector?.('.wt-day-sheet-scroll');
  const blockBackgroundInput = (event) => {
    if (_currentWorkoutHomeSheetState() !== 'full') return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
  };

  backdrop?.addEventListener('touchmove', blockBackgroundInput, { passive: false });
  backdrop?.addEventListener('wheel', blockBackgroundInput, { passive: false });

  sheet?.addEventListener('touchmove', (event) => {
    if (_currentWorkoutHomeSheetState() !== 'full') return;
    if (event.target?.closest?.('.wt-day-sheet-scroll')) return;
    blockBackgroundInput(event);
  }, { passive: false });
  sheet?.addEventListener('wheel', (event) => {
    if (_currentWorkoutHomeSheetState() !== 'full') return;
    if (event.target?.closest?.('.wt-day-sheet-scroll')) return;
    blockBackgroundInput(event);
  }, { passive: false });

  if (!scroller) return;
  let lastTouchX = 0;
  let lastTouchY = 0;
  scroller.addEventListener('touchstart', (event) => {
    if (event.touches?.length !== 1) return;
    lastTouchX = Number(event.touches[0]?.clientX) || 0;
    lastTouchY = Number(event.touches[0]?.clientY) || 0;
  }, { passive: true });
  scroller.addEventListener('touchmove', (event) => {
    if (_currentWorkoutHomeSheetState() !== 'full' || event.touches?.length !== 1) return;
    const x = Number(event.touches[0]?.clientX) || lastTouchX;
    const y = Number(event.touches[0]?.clientY) || lastTouchY;
    const dx = x - lastTouchX;
    const dy = y - lastTouchY;
    lastTouchX = x;
    lastTouchY = y;
    if (_workoutHomeSheetCarouselShouldOwnTouch(event, dx, dy)) {
      event.stopPropagation();
      return;
    }
    if (_workoutHomeSheetTouchWouldChain(scroller, dy) && event.cancelable) event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
  scroller.addEventListener('wheel', (event) => {
    if (_currentWorkoutHomeSheetState() !== 'full') return;
    if (_workoutHomeSheetCarouselShouldOwnWheel(event)) {
      event.stopPropagation();
      return;
    }
    if (_workoutHomeSheetWheelWouldChain(scroller, Number(event.deltaY) || 0) && event.cancelable) event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
}

function _bindWorkoutCycleRailActions(root) {
  const actionRoot = root?.querySelector?.('.cal-workout-surface-home') || root;
  if (!actionRoot) return;
  actionRoot.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const calendarAction = target?.closest?.('[data-wt-calendar-action]');
    if (calendarAction && actionRoot.contains(calendarAction)) {
      event.preventDefault();
      event.stopPropagation();
      const action = calendarAction.getAttribute('data-wt-calendar-action');
      if (action === 'shift-month') {
        _shiftMonth(Number(calendarAction.getAttribute('data-delta')) || 0);
      } else if (action === 'go-today') {
        _goToday();
      } else if (action === 'go-today-detail') {
        _goTodayWorkoutDetail();
      } else if (action === 'open-day') {
        _openWorkoutHomeDay(calendarAction.getAttribute('data-date-key'));
      }
      return;
    }
    const goalBtn = target?.closest?.('[data-cal-goal-input]');
    if (goalBtn) {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(_openWorkoutGoalInputSheet(goalBtn.getAttribute('data-week-start'))).catch((e) => {
        console.warn('[workout-calendar] goal input click failed:', e);
      });
      return;
    }
    const seasonEditBtn = target?.closest?.('[data-wt-season-edit]');
    if (seasonEditBtn) {
      event.preventDefault();
      event.stopPropagation();
      openWorkoutSeasonWizard({ editingSeasonId: seasonEditBtn.getAttribute('data-wt-season-edit') });
      return;
    }
    const seasonBtn = target?.closest?.('[data-wt-season-manager]');
    if (seasonBtn) {
      event.preventDefault();
      event.stopPropagation();
      openWorkoutSeasonWizard();
      return;
    }
    const seasonOverviewBtn = target?.closest?.('[data-wt-season-overview]');
    if (seasonOverviewBtn) {
      event.preventDefault();
      event.stopPropagation();
      _openWorkoutSeasonOverview(seasonOverviewBtn.getAttribute('data-wt-season-overview'));
      return;
    }
    const btn = target?.closest?.('[data-cal-cycle-target]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    Promise.resolve(_openWorkoutCycleTargetSettings(btn.getAttribute('data-cal-cycle-target'))).catch((e) => {
      console.warn('[workout-calendar] cycle target click failed:', e);
    });
  }, true);
  // 시즌 카드는 div라 키보드 진입이 필요하다. 안쪽 설정/시작 버튼은 자기 동작을 유지한다.
  actionRoot.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const seasonOverviewBtn = target?.closest?.('[data-wt-season-overview]');
    if (!seasonOverviewBtn || target?.closest?.('[data-wt-season-edit], [data-wt-season-manager]')) return;
    event.preventDefault();
    event.stopPropagation();
    _openWorkoutSeasonOverview(seasonOverviewBtn.getAttribute('data-wt-season-overview'));
  }, true);
}

function _openWorkoutHomeDay(key) {
  const nextKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  if (_workoutHomeSelectedKey === nextKey && _currentWorkoutHomeSheetState() === 'full') return;
  _workoutHomeSelectedKey = nextKey;
  _workoutHomeView = 'detail';
  _workoutHomeSheetState = 'full';
  _workoutHomeSessionIndex = 0;
  openWorkoutDaySheet(nextKey, {
    sessionIndex: _workoutHomeSessionIndex,
    sheetState: 'full',
    viewYear: _viewYear,
    viewMonth: _viewMonth,
    scrollTop: _workoutHomeScrollTop(),
    history: 'push',
    notify: false,
    action: 'sheet:open-day',
  });
  renderWorkoutCalendarHome();
  _restoreRememberedWorkoutSheetCarousel(nextKey, _workoutHomeSessionIndex);
}

async function _openWorkoutHomeRoutine(key) {
  _workoutHomeSelectedKey = key;
  const sessionIndex = _workoutHomeSessionIndex;
  if (!_isTodayKey(key)) {
    showToast('과거 기록에서는 루틴을 열지 않아요. 오늘 운동에서 시작해 주세요.', 2200, 'info');
    return;
  }
  renderWorkoutCalendarHome();

  try {
    const loaded = await _loadWorkoutStateForSheetSession(key, sessionIndex);
    if (!loaded) throw new Error('workout state loader is not available');

    const expert = await import('./workout/expert.js');
    await expert.openRoutineSuggestWithRecent();
  } catch (e) {
    console.warn('[workout-calendar] routine open failed:', e);
    showToast('루틴을 여는 데 실패했어요', 2200, 'error');
  }
}

function _backWorkoutHomeMonth() {
  _setWorkoutHomeSheetState('bar');
}

function _goTodayWorkoutDetail() {
  const key = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  _viewYear = TODAY.getFullYear();
  _viewMonth = TODAY.getMonth();
  _workoutHomeSelectedKey = key;
  _workoutHomeView = 'detail';
  _workoutHomeSheetState = 'full';
  _workoutHomeSessionIndex = 0;
  openWorkoutDaySheet(key, {
    sessionIndex: 0,
    sheetState: 'full',
    viewYear: _viewYear,
    viewMonth: _viewMonth,
    scrollTop: _workoutHomeScrollTop(),
    history: 'push',
    notify: false,
    action: 'sheet:today',
  });
  renderCalendar();
  renderWorkoutCalendarHome();
  _restoreRememberedWorkoutSheetCarousel(key, 0);
}

function _selectWorkoutHomeSession(index) {
  _rememberWorkoutSheetCarouselState(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
  _workoutHomeSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(index) || 0)));
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:session' });
  renderWorkoutCalendarHome();
  _restoreRememberedWorkoutSheetCarousel(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
}

function _selectWorkoutHomeRunning() {
  _rememberWorkoutSheetCarouselState(_workoutHomeSelectedKey, _workoutHomeSessionIndex);
  _workoutHomeSessionIndex = WORKOUT_RUNNING_SESSION_INDEX;
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:running' });
  renderWorkoutCalendarHome();
}

function _toggleWorkoutDetailCard(cardId) {
  if (!cardId) return;
  if (_workoutDetailCollapsed.has(cardId)) _workoutDetailCollapsed.delete(cardId);
  else {
    _workoutDetailCollapsed.add(cardId);
    if (workoutDetailState.editingCardId === cardId) workoutDetailState.editingCardId = null;
  }
  renderWorkoutCalendarHome();
}

function _editWorkoutExerciseCard(cardId) {
  if (!cardId) return;
  workoutDetailState.editingCardId = cardId;
  _workoutDetailCollapsed.delete(cardId);
  renderWorkoutCalendarHome();
}

function _finishWorkoutExerciseEdit(cardId) {
  if (!cardId || workoutDetailState.editingCardId === cardId) workoutDetailState.editingCardId = null;
  renderWorkoutCalendarHome();
}

function _markWorkoutExerciseCompletionStamp(cardId) {
  if (!cardId) return;
  _workoutExerciseCompletionStamps.set(cardId, Date.now());
}

async function _focusWorkoutSetInlineFieldFromSheet(key, sessionIndex, exerciseIndex, setIndex, field) {
  const safeField = String(field || '');
  if (!['kg', 'reps'].includes(safeField)) return false;
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  const targetExerciseIndex = Math.max(0, Math.floor(Number(exerciseIndex) || 0));
  const targetSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
  const editorKey = _workoutSetEditorKey(targetKey, targetSessionIndex, targetExerciseIndex, targetSetIndex);
  const inlineKey = _workoutSetInlineFieldKey(targetKey, targetSessionIndex, targetExerciseIndex, targetSetIndex, safeField);
  const restoreState = _captureWorkoutSheetScrollState();
  const targetMeta = {
    key: targetKey,
    sessionIndex: targetSessionIndex,
    exerciseIndex: targetExerciseIndex,
    setIndex: targetSetIndex,
    field: safeField,
    mode: 'inline',
  };
  const activeInput = _workoutSetKeyboardActiveInput();
  const activeMeta = _workoutSetKeyboardMeta(activeInput);
  const shouldCommitActiveInput = activeInput?.hasAttribute?.('data-wt-set-inline-input')
    && !_sameWorkoutSetKeyboardTarget(activeMeta, targetMeta)
    && activeInput.getAttribute('data-wt-set-keyboard-dirty') === 'true';
  const commitPromise = shouldCommitActiveInput
    ? Promise.resolve(_commitWorkoutSetKeyboardInput(activeInput, {
      closeInline: false,
      nextTarget: targetMeta,
    }))
    : null;
  _workoutOpenSetTypeMenus.delete(editorKey);
  _workoutExpandedSetEditors.delete(editorKey);
  workoutDetailState.inlineSetEditor = inlineKey;
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = targetSessionIndex;
  _workoutHomeSheetState = 'full';
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-inline-field' });
  // 값 버튼을 입력칸으로 바꾸는 건 그 행 안에서 끝나는 변화다. 달력까지 다시
  // 그리면 행을 옮길 때마다 화면이 통째로 교체돼 깜빡인다.
  if (!shouldCommitActiveInput) _renderWorkoutSheetAfterSetEdit();
  const focusInput = () => {
    _restoreWorkoutSheetScrollState(restoreState);
    if (typeof document === 'undefined') return false;
    const root = _workoutHomeScrollRoot();
    const sheet = root?.querySelector?.('[data-wt-day-sheet]')
      || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
    const selector = [
      '[data-wt-set-inline-input]',
      `[data-session-index="${_workoutSheetSelectorValue(targetSessionIndex)}"]`,
      `[data-exercise-index="${_workoutSheetSelectorValue(targetExerciseIndex)}"]`,
      `[data-set-index="${_workoutSheetSelectorValue(targetSetIndex)}"]`,
      `[data-field="${_workoutSheetSelectorValue(safeField)}"]`,
    ].join('');
    const input = sheet?.querySelector?.(selector);
    if (!input) return false;
    input.setAttribute('data-wt-set-clear-on-focus', '');
    try { input.focus({ preventScroll: true }); }
    catch { input.focus?.(); }
    if (document.activeElement === input) _clearWorkoutSetInputOnFocus(input);
    _restoreWorkoutSheetScrollState(restoreState);
    return document.activeElement === input;
  };
  let focusRetryCount = 0;
  let focusRetryTimer = null;
  let targetFocused = false;
  const focusInputWhenReady = () => {
    if (targetFocused) return true;
    if (focusInput()) {
      targetFocused = true;
      focusRetryCount = 0;
      focusRetryTimer = null;
      return true;
    }
    if (typeof window === 'undefined' || focusRetryTimer || focusRetryCount >= 15) return false;
    focusRetryCount += 1;
    focusRetryTimer = window.setTimeout?.(() => {
      focusRetryTimer = null;
      focusInputWhenReady();
    }, 40) || null;
    return false;
  };
  focusInputWhenReady();
  commitPromise?.then(() => {
    if (targetFocused) return;
    focusRetryCount = 0;
    focusInputWhenReady();
  }).catch((error) => {
    console.warn('[workout-calendar] inline field switch commit failed:', error);
  });
  return true;
}

function _cancelWorkoutSetInlineFieldFromSheet(key, sessionIndex, exerciseIndex, setIndex, field) {
  const safeField = String(field || '');
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  const targetExerciseIndex = Math.max(0, Math.floor(Number(exerciseIndex) || 0));
  const targetSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
  const inlineKey = _workoutSetInlineFieldKey(targetKey, targetSessionIndex, targetExerciseIndex, targetSetIndex, safeField);
  if (!inlineKey || workoutDetailState.inlineSetEditor !== inlineKey) return false;
  const restoreState = _captureWorkoutSheetScrollState();
  workoutDetailState.inlineSetEditor = null;
  renderWorkoutCalendarHome();
  _restoreWorkoutSheetScrollState(restoreState);
  return true;
}

function _focusWorkoutSetEditorFieldFromSheet(key, sessionIndex, exerciseIndex, setIndex, field) {
  const safeField = String(field || '');
  if (!['kg', 'reps', 'rir', 'romPct'].includes(safeField)) return false;
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  const targetExerciseIndex = Math.max(0, Math.floor(Number(exerciseIndex) || 0));
  const targetSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
  const editorKey = _workoutSetEditorKey(targetKey, targetSessionIndex, targetExerciseIndex, targetSetIndex);
  const restoreState = _captureWorkoutSheetScrollState();
  _workoutOpenSetTypeMenus.delete(editorKey);
  workoutDetailState.inlineSetEditor = null;
  _workoutExpandedSetEditors.add(editorKey);
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = targetSessionIndex;
  _workoutHomeSheetState = 'full';
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-field-editor' });
  renderWorkoutCalendarHome();
  const focusInput = () => {
    _restoreWorkoutSheetScrollState(restoreState);
    if (typeof document === 'undefined') return;
    const root = _workoutHomeScrollRoot();
    const sheet = root?.querySelector?.('[data-wt-day-sheet]')
      || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
    const selector = [
      WORKOUT_SHEET_SET_INPUT_SELECTOR,
      `[data-session-index="${_workoutSheetSelectorValue(targetSessionIndex)}"]`,
      `[data-exercise-index="${_workoutSheetSelectorValue(targetExerciseIndex)}"]`,
      `[data-set-index="${_workoutSheetSelectorValue(targetSetIndex)}"]`,
      `[data-field="${_workoutSheetSelectorValue(safeField)}"]`,
    ].join('');
    const input = sheet?.querySelector?.(selector);
    if (!input) return;
    input.setAttribute('data-wt-set-clear-on-focus', '');
    try { input.focus({ preventScroll: true }); }
    catch { input.focus?.(); }
    if (document.activeElement === input) _clearWorkoutSetInputOnFocus(input);
    _restoreWorkoutSheetScrollState(restoreState);
  };
  focusInput();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(focusInput);
    window.setTimeout?.(focusInput, 80);
  }
  return true;
}

function _toggleWorkoutSetEditorFromSheet(key, sessionIndex, exerciseIndex, setIndex) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  const editorKey = _workoutSetEditorKey(targetKey, targetSessionIndex, exerciseIndex, setIndex);
  const restoreState = _captureWorkoutSheetScrollState();
  _workoutOpenSetTypeMenus.delete(editorKey);
  workoutDetailState.inlineSetEditor = null;
  if (_workoutExpandedSetEditors.has(editorKey)) _workoutExpandedSetEditors.delete(editorKey);
  else _workoutExpandedSetEditors.add(editorKey);
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = targetSessionIndex;
  _workoutHomeSheetState = 'full';
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-editor' });
  renderWorkoutCalendarHome();
  _restoreWorkoutSheetScrollState(restoreState);
  return true;
}

function _toggleWorkoutSetTypeMenuFromSheet(key, sessionIndex, exerciseIndex, setIndex) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  const menuKey = _workoutSetEditorKey(targetKey, targetSessionIndex, exerciseIndex, setIndex);
  const restoreState = _captureWorkoutSheetScrollState();
  const wasOpen = _workoutOpenSetTypeMenus.has(menuKey);
  _workoutOpenSetTypeMenus.clear();
  _workoutExpandedSetEditors.delete(menuKey);
  workoutDetailState.inlineSetEditor = null;
  if (!wasOpen) _workoutOpenSetTypeMenus.add(menuKey);
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = targetSessionIndex;
  _workoutHomeSheetState = 'full';
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-type' });
  renderWorkoutCalendarHome();
  _restoreWorkoutSheetScrollState(restoreState);
  _positionOpenWorkoutSetTypeMenu();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(_positionOpenWorkoutSetTypeMenu);
    window.setTimeout?.(_positionOpenWorkoutSetTypeMenu, 80);
  }
  return true;
}

function _editWorkoutHomeSession(key, sessionIndex = _workoutHomeSessionIndex) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
  _workoutHomeSheetState = 'full';
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:edit-inline' });
  renderWorkoutCalendarHome();
  showToast('카드 안에서 세트를 바로 수정해 주세요', 1600, 'info');
}

function _setWorkoutSheetNumber(value, fallback = 0, options = {}) {
  const text = String(value ?? '').trim();
  if (options.allowEmpty && text === '') return '';
  const n = Number(text);
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : Infinity;
  const raw = Number.isFinite(n) ? n : fallback;
  const rounded = options.integer ? Math.round(raw) : Math.round(raw * 10) / 10;
  return Math.max(min, Math.min(max, rounded));
}

function _defaultWorkoutSheetSet(prev = null) {
  const kg = _workoutSheetRawNumber(prev?.kg);
  const reps = _workoutSheetRawNumber(prev?.reps);
  return {
    setType: prev?.setType || 'main',
    kg: kg === '' ? 40 : kg,
    reps: reps === '' ? 10 : reps,
    rpe: 0,
    rir: Number.isFinite(Number(prev?.rir)) ? Number(prev.rir) : 2,
    romPct: Number.isFinite(Number(prev?.romPct)) ? Number(prev.romPct) : 100,
    done: false,
  };
}

async function _mutateWorkoutExerciseFromSheet(key, sessionIndex, exerciseIndex, mutator, options = {}) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const { day, session, index } = _workoutHomeSessionAt(targetKey, sessionIndex, 1);
  const exIndex = Math.max(0, Math.floor(Number(exerciseIndex) || 0));
  const nextSession = _clonePlain(session) || {};
  const exercises = Array.isArray(nextSession.exercises) ? nextSession.exercises : [];
  const target = exercises[exIndex];
  if (!target) {
    showToast('수정할 운동을 찾지 못했어요', 1800, 'warning');
    return false;
  }
  nextSession.exercises = exercises;
  const changeResult = mutator(target, nextSession, exIndex);
  const changed = changeResult && typeof changeResult.then === 'function'
    ? await changeResult
    : changeResult;
  if (changed === false) return false;
  const result = upsertWorkoutSession(day, nextSession, index, { now: Date.now() });
  await _saveWorkoutHomeSessionResult(targetKey, result, { ...options, sessionIndex: index });
  return true;
}

async function _updateWorkoutExerciseSetFromSheet(key, sessionIndex, exerciseIndex, setIndex, field, value, sourceInput = null, options = {}) {
  const safeField = String(field || '');
  if (!['kg', 'reps', 'rir', 'romPct'].includes(safeField)) return;
  const isInlineSource = sourceInput?.hasAttribute?.('data-wt-set-inline-input') === true;
  const inlineEditorKey = sourceInput?.getAttribute?.('data-wt-inline-editor-key') || '';
  const nextInlineEditorKey = options?.nextInlineEditorKey || '';
  if (isInlineSource && inlineEditorKey && workoutDetailState.inlineSetEditor === inlineEditorKey && options?.preserveInlineEditor !== true) {
    workoutDetailState.inlineSetEditor = nextInlineEditorKey || null;
  }
  try {
    await _mutateWorkoutExerciseFromSheet(key, sessionIndex, exerciseIndex, (entry) => {
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      const targetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
      while (sets.length <= targetIndex) sets.push(_defaultWorkoutSheetSet(sets[sets.length - 1]));
      const nextSet = { ...(sets[targetIndex] || _defaultWorkoutSheetSet(sets[sets.length - 1])) };
      if (safeField === 'kg') nextSet.kg = _setWorkoutSheetNumber(value, _num(nextSet.kg), { min: 0, allowEmpty: true });
      if (safeField === 'reps') nextSet.reps = _setWorkoutSheetNumber(value, _num(nextSet.reps), { min: 0, integer: true, allowEmpty: true });
      if (safeField === 'rir') nextSet.rir = _setWorkoutSheetNumber(value, Number.isFinite(Number(nextSet.rir)) ? Number(nextSet.rir) : 2, { min: 0, max: 10 });
      if (safeField === 'romPct') nextSet.romPct = _setWorkoutSheetNumber(value, Number.isFinite(Number(nextSet.romPct)) ? Number(nextSet.romPct) : 100, { min: 0, max: 100, integer: true });
      sets[targetIndex] = nextSet;
      entry.sets = sets;
      clearWorkoutExerciseCompletionMarker(entry);
      return true;
    }, options?.optimisticRender
      ? {
        preserveSheetScroll: true,
        optimisticRender: true,
        skipRender: options?.skipRender === true,
      }
      : isInlineSource
        ? { preserveSheetScroll: true }
        : { preserveInput: true, sourceInput, ignoreSourceInput: true });
  } catch (e) {
    console.warn('[workout-calendar] sheet set update failed:', e);
    showToast('세트 수정에 실패했어요', 2200, 'error');
  }
}

async function _setWorkoutExerciseSetTypeFromSheet(key, sessionIndex, exerciseIndex, setIndex, setType) {
  const safeType = normalizeWorkoutSetType(setType);
  try {
    const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
    const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
    const targetSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
    const menuKey = _workoutSetEditorKey(targetKey, targetSessionIndex, exerciseIndex, targetSetIndex);
    _workoutOpenSetTypeMenus.delete(menuKey);
    const ok = await _mutateWorkoutExerciseFromSheet(targetKey, targetSessionIndex, exerciseIndex, (entry) => {
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      while (sets.length <= targetSetIndex) sets.push(_defaultWorkoutSheetSet(sets[sets.length - 1]));
      const nextSet = { ...(sets[targetSetIndex] || _defaultWorkoutSheetSet(sets[sets.length - 1])) };
      nextSet.setType = safeType;
      delete nextSet.wendlerRole;
      delete nextSet.wendlerPct;
      delete nextSet.supplementalKind;
      delete nextSet.amrap;
      sets[targetSetIndex] = nextSet;
      entry.sets = sets;
      clearWorkoutExerciseCompletionMarker(entry);
      return true;
    }, { preserveSheetScroll: true });
    return ok;
  } catch (e) {
    console.warn('[workout-calendar] sheet set type update failed:', e);
    showToast('세트 유형 변경에 실패했어요', 2200, 'error');
    return false;
  }
}

// 하루 시트에서 웬들러(863) 백오프를 FSL(본세트1)/SSL(본세트2) 무게로 전환한다.
// 무게는 같은 종목의 본세트에서 읽고, 미완료 백오프 세트만 바꾼다. 선택은 성장
// 보드 설정(wendler.backoffMode)에도 저장해 다음 주 처방부터 같은 방식이 나온다.
async function _setWorkoutBackoffModeFromSheet(key, sessionIndex, exerciseIndex, setIndex, mode) {
  const nextMode = mode === 'fsl' ? 'fsl' : 'ssl';
  try {
    const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
    const targetSessionIndex = Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(sessionIndex) || 0)));
    const targetSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
    _workoutOpenSetTypeMenus.delete(_workoutSetEditorKey(targetKey, targetSessionIndex, exerciseIndex, targetSetIndex));
    let targetKg = 0;
    let exerciseId = '';
    const ok = await _mutateWorkoutExerciseFromSheet(targetKey, targetSessionIndex, exerciseIndex, (entry) => {
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      const mains = sets.filter(set => set?.wendlerRole === 'main');
      const source = nextMode === 'fsl' ? mains[0] : (mains[1] || mains[0]);
      if (!(Number(source?.kg) > 0)) return false;
      targetKg = Number(source.kg);
      exerciseId = String(entry.exerciseId || '');
      entry.sets = sets.map(set => (
        set?.wendlerRole === 'backoff' && set.done !== true
          ? { ...set, kg: targetKg, wendlerPct: source.wendlerPct ?? null, supplementalKind: nextMode }
          : set
      ));
      return true;
    }, { preserveSheetScroll: true });
    if (!ok) {
      showToast('본세트 무게를 찾지 못해 백오프 방식을 바꾸지 못했어요', 2200, 'warning');
      return false;
    }
    await _syncWendlerBackoffModeToBoard(exerciseId, nextMode);
    showToast(nextMode === 'fsl'
      ? `FSL 백오프 — 미완료 세트를 본세트1 ${targetKg}kg로 맞췄어요`
      : `SSL 백오프 — 미완료 세트를 본세트2 ${targetKg}kg로 맞췄어요`, 2200, 'success');
    return true;
  } catch (e) {
    console.warn('[workout-calendar] backoff mode change failed:', e);
    showToast('백오프 방식 변경에 실패했어요', 2200, 'error');
    return false;
  }
}

// 보드 동기화는 부가 작업이다 — 보드가 없거나 저장이 실패해도 하루 시트의
// 변경은 유지되어야 하므로 실패는 조용히 넘긴다.
async function _syncWendlerBackoffModeToBoard(exerciseId, mode) {
  if (!exerciseId) return;
  try {
    const board = getTestBoardV2();
    const benchmark = (board?.benchmarks || []).find(bm => (
      bm?.program === 'wendler' && String(bm.exerciseId) === exerciseId && bm.status !== 'archived'
    ));
    if (!benchmark?.wendler) return;
    if ((benchmark.wendler.backoffMode === 'fsl' ? 'fsl' : 'ssl') === mode) return;
    benchmark.wendler.backoffMode = mode;
    await saveTestBoardV2(board);
  } catch (e) {
    console.warn('[workout-calendar] backoff mode board sync skipped:', e);
  }
}

async function _addWorkoutExerciseSetFromSheet(key, sessionIndex, exerciseIndex) {
  try {
    let copiedPreviousSet = false;
    const ok = await _mutateWorkoutExerciseFromSheet(key, sessionIndex, exerciseIndex, (entry) => {
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      copiedPreviousSet = sets.length > 0;
      sets.push(_defaultWorkoutSheetSet(sets[sets.length - 1]));
      entry.sets = sets;
      clearWorkoutExerciseCompletionMarker(entry);
      return true;
    }, { preserveSheetScroll: true, optimisticRender: true });
    if (ok) showToast(copiedPreviousSet ? '직전 세트를 복사했어요' : '세트를 추가했어요', 1200, 'success');
  } catch (e) {
    console.warn('[workout-calendar] sheet set add failed:', e);
    showToast('세트 추가에 실패했어요', 2200, 'error');
  }
}

function _copyPreviousWorkoutSetForSheet(set = {}) {
  const nextSet = {
    setType: normalizeWorkoutSetType(set?.setType),
    kg: _workoutSheetRawNumber(set?.kg),
    reps: _workoutSheetRawNumber(set?.reps),
    rpe: _num(set?.rpe),
    rir: Number.isFinite(Number(set?.rir)) ? Number(set.rir) : 2,
    romPct: Number.isFinite(Number(set?.romPct)) ? Number(set.romPct) : 100,
    done: false,
  };
  if (set?.wendlerRole) nextSet.wendlerRole = String(set.wendlerRole);
  if (set?.supplementalKind) nextSet.supplementalKind = String(set.supplementalKind);
  if (Number.isFinite(Number(set?.wendlerPct))) nextSet.wendlerPct = Number(set.wendlerPct);
  if (set?.amrap === true) nextSet.amrap = true;
  return nextSet;
}

function _copyPreviousWorkoutRecordSetsForSheet(previousRecord = null) {
  const details = Array.isArray(previousRecord?.setDetails) ? previousRecord.setDetails : [];
  return details.map(set => _copyPreviousWorkoutSetForSheet(set));
}

async function _copyPreviousWorkoutExerciseSetsFromSheet(key, sessionIndex, exerciseIndex) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  let copiedSetCount = 0;
  let previousRecordMissing = false;
  try {
    const ok = await _mutateWorkoutExerciseFromSheet(targetKey, sessionIndex, exerciseIndex, (entry) => {
      const previousRecord = _previousWorkoutRecordForRow(getCache(), {
        dateKey: targetKey,
        exerciseId: entry?.exerciseId || null,
        movementId: entry?.movementId || null,
        name: _workoutEntryName(entry),
      });
      const copiedSets = _copyPreviousWorkoutRecordSetsForSheet(previousRecord);
      if (!copiedSets.length) {
        previousRecordMissing = true;
        return false;
      }
      entry.sets = copiedSets;
      copiedSetCount = copiedSets.length;
      clearWorkoutExerciseCompletionMarker(entry);
      _clearWorkoutSetEditorsForExercise(targetKey, sessionIndex, exerciseIndex);
      return true;
    }, { preserveSheetScroll: true });
    if (!ok) {
      if (previousRecordMissing) showToast('복사할 지난 세트 기록이 없어요', 1800, 'warning');
      return false;
    }
    showToast(`지난 기록 ${copiedSetCount}세트를 가져왔어요`, 1400, 'success');
    return true;
  } catch (e) {
    console.warn('[workout-calendar] previous set copy failed:', e);
    showToast('지난 기록 세트를 가져오지 못했어요', 2200, 'error');
    return false;
  }
}

async function _removeWorkoutExerciseSetFromSheet(key, sessionIndex, exerciseIndex, setIndex) {
  try {
    const ok = await _mutateWorkoutExerciseFromSheet(key, sessionIndex, exerciseIndex, (entry) => {
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      const targetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
      if (!sets[targetIndex]) return false;
      sets.splice(targetIndex, 1);
      entry.sets = sets;
      clearWorkoutExerciseCompletionMarker(entry);
      _clearWorkoutSetEditorsForExercise(key, sessionIndex, exerciseIndex);
      return true;
    }, { preserveSheetScroll: true, optimisticRender: true });
    if (ok) showToast('세트를 삭제했어요', 1200, 'success');
  } catch (e) {
    console.warn('[workout-calendar] sheet set remove failed:', e);
    showToast('세트 삭제에 실패했어요', 2200, 'error');
  }
}

async function _toggleWorkoutExerciseSetDoneFromSheet(key, sessionIndex, exerciseIndex, setIndex) {
  try {
    let savedDone = false;
    const ok = await _mutateWorkoutExerciseFromSheet(key, sessionIndex, exerciseIndex, (entry) => {
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      const targetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
      while (sets.length <= targetIndex) sets.push(_defaultWorkoutSheetSet(sets[sets.length - 1]));
      const nextSet = { ...(sets[targetIndex] || _defaultWorkoutSheetSet(sets[sets.length - 1])) };
      const wasDone = nextSet.done === true;
      const nextDone = !wasDone;
      savedDone = nextDone;
      nextSet.done = nextDone;
      _clearWorkoutSheetSetRestMetadata(nextSet);
      if (nextDone) {
        nextSet.completedAt = Date.now();
        if (!Number.isFinite(Number(nextSet.romPct))) nextSet.romPct = 100;
        if (!Number.isFinite(Number(nextSet.rir))) nextSet.rir = 2;
      } else {
        delete nextSet.completedAt;
      }
      sets[targetIndex] = nextSet;
      entry.sets = sets;
      clearWorkoutExerciseCompletionMarker(entry);
      return true;
    }, { preserveSheetScroll: true, optimisticRender: true });
    if (ok) {
      await _syncWorkoutRestAfterSheetSet(key, sessionIndex, exerciseIndex, setIndex, savedDone);
    }
  } catch (e) {
    console.warn('[workout-calendar] sheet set done toggle failed:', e);
    showToast('세트 완료 변경에 실패했어요', 2200, 'error');
  }
}

// 종목완료로 주간 목표 칸을 색칠한다.
//
// 성장 보드의 "운동 완료"만 색칠하도록 두면 주간 목표는 사실상 켤 수 없다.
// 운동 탭은 달력 홈 모드로 고정돼 있고(app.js _setWorkoutSurface) 그 모드에서는
// 운동 방식 목록(#expert-top-area)이 통째로 숨겨져 보드로 들어갈 길이 없다.
// 그래서 사람이 실제로 누르는 이 버튼이 같은 판정을 돌려 색칠까지 해야 한다.
//
// 성공했을 때만 색칠한다. 미달이면 아무것도 하지 않는다 — 계획 조정은 보드의
// 일이고, 여기서 조정 시트를 띄우면 기록 흐름을 가로챈다.
async function _completeWorkoutExerciseFromSheet(cardId, key, sessionIndex, exerciseIndex) {
  try {
    let completedCount = 0;
    let lastCompletedSetIndex = null;
    const ok = await _mutateWorkoutExerciseFromSheet(key, sessionIndex, exerciseIndex, (entry) => {
      const now = Date.now();
      const sets = Array.isArray(entry.sets) ? entry.sets : [];
      const nextSets = sets.map((set, setIndex) => {
        const nextSet = { ...(set || {}) };
        if (!isCompletableWorkoutExerciseSet(nextSet)) return nextSet;
        completedCount += 1;
        if (nextSet.done !== true) {
          lastCompletedSetIndex = setIndex;
          _clearWorkoutSheetSetRestMetadata(nextSet);
        }
        nextSet.done = true;
        if (!Number.isFinite(Number(nextSet.completedAt))) nextSet.completedAt = now;
        if (!Number.isFinite(Number(nextSet.romPct))) nextSet.romPct = 100;
        if (!Number.isFinite(Number(nextSet.rir))) nextSet.rir = 2;
        return nextSet;
      });
      if (!completedCount) {
        showToast('완료할 세트를 먼저 입력해 주세요', 1800, 'warning');
        return false;
      }
      entry.sets = nextSets;
      markWorkoutExerciseEntryComplete(entry, now);
      return true;
    }, { preserveSheetScroll: true, optimisticRender: true });
    if (!ok) return;
    if (lastCompletedSetIndex != null) {
      await _syncWorkoutRestAfterSheetSet(key, sessionIndex, exerciseIndex, lastCompletedSetIndex, true);
    }
    if (workoutDetailState.editingCardId === cardId) workoutDetailState.editingCardId = null;
    _markWorkoutExerciseCompletionStamp(cardId);
    renderWorkoutCalendarHome();
    showToast('종목 기록을 저장했어요', 1200, 'success');
  } catch (e) {
    console.warn('[workout-calendar] exercise complete failed:', e);
    showToast('종목 완료 저장에 실패했어요', 2200, 'error');
  }
}

async function _addWorkoutHomeSession(key) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetIndex = Math.max(0, Math.min(_workoutHomeSessionIndex, WORKOUT_GYM_SESSION_COUNT - 1));

  try {
    _workoutHomeSelectedKey = targetKey;
    _workoutHomeSessionIndex = targetIndex;
    _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:add-picker' });
    const loaded = await _loadWorkoutStateForSheetSession(targetKey, targetIndex);
    if (!loaded) throw new Error('workout state loader is not available');
    await wtOpenExercisePicker({
      source: 'workout-day-sheet',
      dateKey: targetKey,
      sessionIndex: targetIndex,
      afterSelect: detail => _refreshWorkoutHomeAfterPickerSelect(targetKey, targetIndex, detail),
    });
  } catch (e) {
    console.warn('[workout-calendar] add session picker open failed:', e);
    showToast('종목 추가 화면을 열지 못했어요', 2200, 'error');
    renderWorkoutCalendarHome();
  }
}

async function _openWorkoutHomeRunning(key) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = WORKOUT_RUNNING_SESSION_INDEX;
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:running-start' });
  if (!_isTodayKey(targetKey)) {
    showToast('러닝 측정은 오늘 날짜에서 시작해 주세요', 2200, 'info');
    renderWorkoutCalendarHome();
    return;
  }
  try {
    const loaded = await _loadWorkoutStateForSheetSession(targetKey, WORKOUT_RUNNING_SESSION_INDEX);
    if (!loaded) throw new Error('workout state loader is not available');
    wtOpenRunningSession();
  } catch (e) {
    console.warn('[workout-calendar] running open failed:', e);
    showToast('러닝 화면을 열지 못했어요', 2200, 'error');
  }
}

async function _exportWorkoutHomeSession(key, sessionIndex = _workoutHomeSessionIndex) {
  const { session, index } = _workoutHomeSessionAt(key, sessionIndex, 1);
  if (!hasWorkoutSessionData(session)) {
    showToast('내보낼 운동 기록이 없어요', 1800, 'info');
    return;
  }
  const plan = getDietPlan() || null;
  const checkins = _sortedCheckins();
  const bodyWeight = _weightAt(checkins, key) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
  const wx = _workoutMetrics(key, session, bodyWeight, _buildWorkoutLookup());
  const title = `${_dateTitle(key)} ${_sessionLabel(index)} 운동 기록`;
  const text = _formatWorkoutExportText(key, index, session, wx);
  try {
    const mode = await _shareOrCopyText(text, title);
    if (mode === 'cancel') return;
    showToast(mode === 'share' ? '운동 기록을 공유했어요' : '운동 기록을 복사했어요', 1800, 'success');
  } catch (e) {
    console.warn('[workout-calendar] export failed:', e);
    showToast('내보내기에 실패했어요', 2200, 'error');
  }
}

// 하루치 기록을 회차별 + 러닝 블록으로 펼친다. 기록이 없는 회차는 건너뛴다.








async function _exportWorkoutRecords(key, scope) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const payload = _buildWorkoutRecordsExport(targetKey, scope);
  if (!payload) {
    showToast(scope === 'week' ? '이번 주 운동 기록이 없어요' : '이 날짜의 운동 기록이 없어요', 1800, 'info');
    return;
  }
  try {
    await _copyTextToClipboard(payload.text);
    showToast(scope === 'week' ? '이번 주 기록을 복사했어요' : '오늘 기록을 복사했어요', 1800, 'success');
  } catch (e) {
    console.warn('[workout-calendar] record export failed:', e);
    showToast('기록 복사에 실패했어요', 2200, 'error');
  }
}

async function _deleteWorkoutHomeSession(key, sessionIndex = _workoutHomeSessionIndex) {
  const { day, index, session } = _workoutHomeSessionAt(key, sessionIndex, 1);
  if (!hasWorkoutSessionData(session)) {
    showToast('삭제할 운동 기록이 없어요', 1800, 'info');
    return;
  }
  const ok = await confirmAction({
    title: '회차를 삭제할까요?',
    message: `${_dateTitle(key)} ${_sessionLabel(index)} 기록만 삭제합니다.\n식단 기록은 유지됩니다.`,
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
  });
  if (!ok) return;
  try {
    const result = deleteWorkoutSession(day, index);
    _workoutHomeSessionIndex = Math.max(0, Math.min(index, result.workoutSessions.length - 1));
    await _saveWorkoutHomeSessionResult(key, result, { sessionIndex: _workoutHomeSessionIndex });
    showToast('회차 운동 기록을 삭제했어요', 1800, 'success');
  } catch (e) {
    console.warn('[workout-calendar] session delete failed:', e);
    showToast('회차 삭제에 실패했어요', 2200, 'error');
  }
}

async function _deleteWorkoutExercise(key, sessionIndex, exerciseIndex) {
  const { day, session, index } = _workoutHomeSessionAt(key, sessionIndex, 1);
  const exIndex = Math.max(0, Math.floor(Number(exerciseIndex) || 0));
  const exercises = Array.isArray(session.exercises) ? session.exercises : [];
  const target = exercises[exIndex];
  if (!target) {
    showToast('삭제할 운동을 찾지 못했어요', 1800, 'warning');
    return;
  }
  const label = target.name || target.exerciseName || '운동';
  const ok = await confirmAction({
    title: '운동을 삭제할까요?',
    message: `${_sessionLabel(index)}의 ${label} 기록을 삭제합니다.`,
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
  });
  if (!ok) return;
  try {
    const nextSession = _clonePlain(session) || {};
    nextSession.exercises = exercises.filter((_, i) => i !== exIndex);
    const result = upsertWorkoutSession(day, nextSession, index, { now: Date.now() });
    workoutDetailState.editingCardId = null;
    await _saveWorkoutHomeSessionResult(key, result, { sessionIndex: index });
    showToast('운동을 삭제했어요', 1800, 'success');
  } catch (e) {
    console.warn('[workout-calendar] exercise delete failed:', e);
    showToast('운동 삭제에 실패했어요', 2200, 'error');
  }
}

function _clearWorkoutActivityFields(activityKey) {
  if (activityKey === 'running') {
    return {
      running: false,
      runDistance: 0,
      runDurationMin: 0,
      runDurationSec: 0,
      runMemo: '',
      runSource: 'manual',
      runStartedAt: null,
      runEndedAt: null,
      runRoute: [],
      runRouteRef: null,
      runRouteSummary: null,
      runPlaceSummary: null,
      runAvgPaceSecPerKm: 0,
      runGpsAccuracySummary: null,
    };
  }
  if (activityKey === 'swimming') {
    return {
      swimming: false,
      swimDistance: 0,
      swimDurationMin: 0,
      swimDurationSec: 0,
      swimStroke: '',
      swimMemo: '',
    };
  }
  if (activityKey === 'cf') {
    return {
      cf: false,
      cfWod: '',
      cfDurationMin: 0,
      cfDurationSec: 0,
      cfMemo: '',
    };
  }
  if (activityKey === 'stretching') {
    return {
      stretching: false,
      stretchDuration: 0,
      stretchMemo: '',
    };
  }
  if (activityKey === 'timer') {
    return { workoutDuration: 0 };
  }
  return null;
}

async function _deleteWorkoutActivity(key, sessionIndex, activityKey) {
  const patch = _clearWorkoutActivityFields(activityKey);
  if (!patch) {
    showToast('삭제할 활동을 찾지 못했어요', 1800, 'warning');
    return;
  }
  const { day, session, index } = _workoutHomeSessionAt(key, sessionIndex, 1);
  const label = {
    running: '러닝',
    swimming: '수영',
    cf: '크로스핏',
    stretching: '스트레칭',
  }[activityKey] || '활동';
  const ok = await confirmAction({
    title: '활동을 삭제할까요?',
    message: `${_sessionLabel(index)}의 ${label} 기록을 삭제합니다.`,
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
  });
  if (!ok) return;
  try {
    const nextSession = { ...(_clonePlain(session) || {}), ...patch };
    const result = upsertWorkoutSession(day, nextSession, index, { now: Date.now() });
    await _saveWorkoutHomeSessionResult(key, result, { sessionIndex: index });
    showToast('활동을 삭제했어요', 1800, 'success');
  } catch (e) {
    console.warn('[workout-calendar] activity delete failed:', e);
    showToast('활동 삭제에 실패했어요', 2200, 'error');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('workout:select-running', _selectWorkoutHomeRunning);
}
