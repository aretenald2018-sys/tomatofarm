import { showToast } from './ui/toast.js';
// ================================================================
// render-calendar.js — 캘린더 탭
// 월별 그리드로 일자별 100점 만점 점수 + (섭취kcal/소모kcal/체중) 표시
// ================================================================

import {
  getCache,
  getBodyCheckins,
  getDietPlan,
  getExList,
  getMuscleParts,
  getLatestCheckinWeight,
  getSeasonRegistry,
  loadRunningRoute,
  saveDay,
} from './data.js';
import {
  calcDietMetrics,
  getDayTargetKcal,
  calcBurnedKcal,
  calcDayScore,
  SUBPATTERN_TO_MAJOR,
} from './calc.js';
import { calcSetVolume } from './calc/volume.js';
import { MOVEMENTS } from './config.js';
import { dateKey, TODAY, isFuture, isBeforeStart } from './data/data-date.js';
import { findSeasonForDate } from './data/season-model.js';
import { openModal, closeModal } from './utils/dom.js';
import { confirmAction } from './utils/confirm-modal.js';
import {
  getWorkoutSessions,
  hasWorkoutGymCardData,
  hasWorkoutSessionData,
  upsertWorkoutSession,
  deleteWorkoutSession,
} from './workout/sessions.js';
import { S } from './workout/state.js';
import {
  wtRefreshWorkoutTimelineDuration,
  wtReplaceActiveWorkoutDraftSession,
  wtRestTimerClearSetRecord,
  wtRestTimerStart,
} from './workout/timers.js';
import { saveWorkoutDay } from './workout/save.js';
import { destroyRunningMaps, renderRunningMap } from './workout/running-map.js';
import { createRunningRouteHydrationController } from './workout/running-route-hydration.js';
import {
  formatRunningClock as _formatRunningClock,
  formatRunningDistance as _formatRunningDistance,
  formatRunningPaceCard as _formatRunningPaceCard,
  runningGpsInfoLabel as _runningGpsInfoLabel,
  runningMetricItems as _runningMetricItems,
  runningPlaceLabel as _runningPlaceLabel,
  runningSourceLabel as _runningSourceLabel,
} from './workout/running-presentation.js';
import {
  formatManualCardioMetric as _formatCardioMetric,
  manualCardioDisplayData as _cardioEntryData,
  manualCardioSummaryText as _cardioSummaryText,
} from './workout/cardio-model.js';
import {
  WORKOUT_GYM_SESSION_COUNT,
  WORKOUT_RUNNING_SESSION_INDEX,
} from './workout/session-policy.js';
import {
  clearRunningSessionFields,
  runningOnlySessionFields,
} from './workout/running-model.js';
import {
  isWorkoutRunningTabIndex,
  runningStackSession,
  runningTrackSessionInfo,
} from './workout/calendar-running.js';
import { isTrustedRunningCalories } from './workout/running-analytics.js';
import { deriveDietSuccessFromWorkout } from './workout/cross-domain.js';
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
import { buildWorkoutSetTimeline } from './workout/timeline.js';
import { buildCalendarActivityRows } from './calendar/activity-model.js';
import { tm2OpenBenchmarkSettings, tm2OpenBoard } from './workout/test-v2/entry.js';
import {
  activeWorkoutTrack,
  buildWorkoutTrackTrend,
  formatWorkoutTrackValue,
  workoutFallbackSparkValues,
  workoutTrackLabel,
} from './workout/track-metrics.js';
import {
  formatWorkoutCompletionElapsed,
  latestWorkoutCompletionAt,
} from './workout/completion-metrics.js';
import {
  clearWorkoutExerciseCompletionMarker,
  isCompletableWorkoutExerciseSet,
  isWorkoutExerciseComplete,
  markWorkoutExerciseEntryComplete,
  workoutExerciseCompletionStampAt,
} from './workout/exercise-completion.js';
import {
  bestWorkoutSet,
  formatWorkoutKg,
  formatWorkoutReps,
  normalizeWorkoutSetType,
  workoutSetSummary,
  workoutSetTypeClass,
  workoutSetTypeLabel,
} from './workout/set-presentation.js';

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
const _workoutDetailCollapsed = new Set();
let _workoutEditingCardId = null;
const _workoutExerciseCompletionStamps = new Map();
const _workoutExpandedSetEditors = new Set();
const _workoutOpenSetTypeMenus = new Set();
let _workoutInlineSetEditor = null;
let _workoutSetKeyboardInput = null;
let _workoutSetKeyboardDomLocked = false;
let _workoutSummaryElapsedTimer = null;
const _workoutSheetCarouselSnapshots = new Map();
const _workoutSheetPendingCarouselFocus = new Map();
let _workoutTrackGraphSeq = 0;
let _workoutRunningMapSeq = 0;
let _workoutRunningImportActive = false;
const _workoutRunningMapPayloads = new Map();
const _workoutRunningRouteHydration = createRunningRouteHydrationController(loadRunningRoute);
const WORKOUT_HOME_SHEET_STATES = ['bar', 'full'];
const WORKOUT_HOME_SHEET_CLASS_STATES = ['bar', 'full'];
const WORKOUT_SHEET_SET_INPUT_SELECTOR = '[data-wt-set-input]';
const WORKOUT_SET_TYPE_OPTIONS = [
  { type: 'main', code: 'M', label: '메인세트', className: 'is-main' },
  { type: 'warmup', code: 'W', label: '웜업세트', className: 'is-warmup' },
  { type: 'drop', code: 'D', label: '드랍세트', className: 'is-drop' },
  { type: 'failure', code: 'F', label: '실패세트', className: 'is-failure' },
];

const MAX_WEAK_LABEL = {
  chest_upper:'가슴 상부', chest_lower:'가슴 하부',
  back_width:'등 넓이', back_thickness:'등 두께',
  shoulder_side:'어깨 측면', rear_delt:'어깨 후면',
  bicep:'이두', tricep:'삼두', core:'복근',
  hamstring:'햄스트링', glute:'둔근', calf:'종아리',
};

const CALENDAR_MODES = new Set(['summary', 'workout']);

function _esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function _num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function _fmtNum(value, digits = 1) {
  const n = _num(value);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * (10 ** digits)) / (10 ** digits));
}

function _isBlankWorkoutSheetNumber(value) {
  return value == null || String(value).trim() === '';
}

function _workoutSheetInputValue(value, digits = 1) {
  if (_isBlankWorkoutSheetNumber(value)) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return _fmtNum(n, digits);
}

function _workoutSheetRawNumber(value) {
  return _isBlankWorkoutSheetNumber(value) ? '' : _num(value);
}

function _isActualWorkoutSet(set) {
  const type = set?.setType;
  const role = set?.wendlerRole;
  if (!set || type === 'warmup' || role === 'warmup' || type === 'deload' || role === 'deload') return false;
  if (set.done === true) return true;
  if (set.done === false) return false;
  return _num(set.kg) > 0 && _num(set.reps) > 0;
}

function _hasDraftWorkoutEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !!(
    entry.exerciseId ||
    entry.name ||
    entry.exerciseName ||
    String(entry.note || '').trim()
  );
}

function _formatSetText(set) {
  const kg = _num(set?.kg);
  const reps = _num(set?.reps);
  const rpe = _num(set?.rpe);
  const base = [
    kg > 0 ? `${_fmtNum(kg)}kg` : '',
    reps > 0 ? `${_fmtNum(reps)}회` : '',
  ].filter(Boolean).join(' x ');
  const rpeText = rpe > 0 ? ` · RPE ${_fmtNum(rpe)}` : '';
  return `${base || '세트 기록'}${rpeText}`;
}

function _formatDuration(seconds) {
  const sec = Math.max(0, Math.round(_num(seconds)));
  if (sec <= 0) return '시간 미기록';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${s}초`;
}

function _formatDurationShort(seconds) {
  const sec = Math.max(0, Math.round(_num(seconds)));
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec}초`;
  return `${Math.round(sec / 60)}분`;
}

function _parseDateKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const exact = new Date(y, m, d);
  if (exact.getFullYear() !== y || exact.getMonth() !== m || exact.getDate() !== d) return null;
  return { y, m, d };
}

function _dateFromKey(key) {
  const p = _parseDateKey(key);
  return p ? new Date(p.y, p.m, p.d) : null;
}

function _isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function _formatWorkoutWeekHours(seconds) {
  const sec = Math.max(0, Math.round(_num(seconds)));
  if (sec <= 0) return '—';
  const hours = Math.round((sec / 3600) * 10) / 10;
  return `${String(hours).replace(/\.0$/, '')}h`;
}

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

function _dateDistanceLabel(key) {
  const target = _dateFromKey(key);
  if (!target) return '';
  const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '오늘';
  if (diff > 0) return `${diff}일 전`;
  return `${Math.abs(diff)}일 후`;
}

function _dateTitle(key) {
  const p = _parseDateKey(key);
  if (!p) return key || '';
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function _workoutHomeScrollRoot() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('workout-calendar-root');
}

function _workoutSheetSelectorValue(value) {
  const text = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function _workoutSheetScrollState(input = null) {
  if (typeof document === 'undefined') return null;
  const root = _workoutHomeScrollRoot();
  const sheet = input?.closest?.('[data-wt-day-sheet]')
    || root?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  const scroller = input?.closest?.('.wt-day-sheet-scroll') || sheet?.querySelector?.('.wt-day-sheet-scroll') || null;
  const carousel = _captureWorkoutSheetCarouselState(sheet);
  return {
    scrollerTop: Math.max(0, Number(scroller?.scrollTop) || 0),
    rootTop: Math.max(0, Number(root?.scrollTop) || 0),
    windowTop: typeof window !== 'undefined' ? Math.max(0, Number(window.scrollY) || 0) : 0,
    carouselScrollLeft: carousel?.scrollLeft ?? null,
    carouselSlideIndex: carousel?.slideIndex ?? null,
  };
}

function _captureWorkoutSheetCarouselState(sheet = null) {
  if (!sheet || typeof Element === 'undefined') return null;
  const track = sheet.querySelector?.('[data-wt-day-exercise-carousel-track]');
  if (!track) return null;
  const scrollLeft = Math.max(0, Number(track.scrollLeft) || 0);
  const slides = Array.from(track.querySelectorAll?.('[data-wt-day-exercise-slide]') || []);
  let slideIndex = null;
  if (slides.length) {
    const trackRect = typeof track.getBoundingClientRect === 'function' ? track.getBoundingClientRect() : null;
    let bestDistance = Infinity;
    slides.forEach((slide, index) => {
      const attrIndex = Math.max(0, Math.floor(Number(slide.getAttribute('data-wt-day-exercise-slide')) || index));
      const distance = trackRect && typeof slide.getBoundingClientRect === 'function'
        ? Math.abs((slide.getBoundingClientRect().left || 0) - (trackRect.left || 0))
        : Math.abs((Number(slide.offsetLeft) || 0) - scrollLeft);
      if (distance < bestDistance) {
        bestDistance = distance;
        slideIndex = attrIndex;
      }
    });
  }
  return { scrollLeft, slideIndex };
}

function _restoreWorkoutSheetCarouselState(sheet = null, state = null) {
  if (!sheet || !state) return;
  const track = sheet.querySelector?.('[data-wt-day-exercise-carousel-track]');
  if (!track) return;
  const slideIndex = Number.isFinite(Number(state.carouselSlideIndex))
    ? Math.max(0, Math.floor(Number(state.carouselSlideIndex)))
    : null;
  const slide = slideIndex == null
    ? null
    : track.querySelector?.(`[data-wt-day-exercise-slide="${slideIndex}"]`);
  const fallbackLeft = slide ? Math.max(0, Number(slide.offsetLeft) || 0) : 0;
  const left = state.carouselScrollLeft != null && Number.isFinite(Number(state.carouselScrollLeft))
    ? Math.max(0, Number(state.carouselScrollLeft) || 0)
    : fallbackLeft;
  if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: 'auto' });
  else track.scrollLeft = left;
  if (slide && Math.abs((Number(track.scrollLeft) || 0) - left) > 2) {
    track.scrollLeft = fallbackLeft;
  }
}

function _restoreWorkoutSheetCarouselToSlide(slideIndex = null, options = {}) {
  if (!Number.isFinite(Number(slideIndex)) || typeof document === 'undefined') return false;
  const index = Math.max(0, Math.floor(Number(slideIndex)));
  const root = _workoutHomeScrollRoot();
  const sheet = root?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  const track = sheet?.querySelector?.('[data-wt-day-exercise-carousel-track]');
  const slide = track?.querySelector?.(`[data-wt-day-exercise-slide="${index}"]`);
  if (!slide) return false;
  const state = {
    carouselSlideIndex: index,
    carouselScrollLeft: null,
  };
  if (options?.remember !== false) {
    _rememberWorkoutSheetCarouselSlide(options?.key ?? _workoutHomeSelectedKey, options?.sessionIndex ?? _workoutHomeSessionIndex, index);
  }
  const restore = () => {
    const root = _workoutHomeScrollRoot();
    const sheet = root?.querySelector?.('[data-wt-day-sheet]')
      || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
    _restoreWorkoutSheetCarouselState(sheet, state);
  };
  restore();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restore);
  }
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(restore, 80);
    window.setTimeout(restore, 220);
  }
  return true;
}

function _workoutSheetCarouselSnapshotKey(key = _workoutHomeSelectedKey, sessionIndex = _workoutHomeSessionIndex) {
  const targetKey = _parseDateKey(key) ? key : _workoutHomeSelectedKey;
  const targetSessionIndex = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  return `${targetKey}::${targetSessionIndex}`;
}

function _rememberWorkoutSheetCarouselSlide(key = _workoutHomeSelectedKey, sessionIndex = _workoutHomeSessionIndex, slideIndex = null) {
  if (!Number.isFinite(Number(slideIndex))) return null;
  const index = Math.max(0, Math.floor(Number(slideIndex)));
  const state = {
    carouselSlideIndex: index,
    carouselScrollLeft: null,
  };
  _workoutSheetCarouselSnapshots.set(_workoutSheetCarouselSnapshotKey(key, sessionIndex), state);
  return state;
}

function _rememberWorkoutSheetCarouselState(key = _workoutHomeSelectedKey, sessionIndex = _workoutHomeSessionIndex, sheet = null) {
  if (typeof document === 'undefined') return null;
  const root = _workoutHomeScrollRoot();
  const targetSheet = sheet
    || root?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  const state = _captureWorkoutSheetCarouselState(targetSheet);
  if (!state || !Number.isFinite(Number(state.slideIndex))) return null;
  return _rememberWorkoutSheetCarouselSlide(key, sessionIndex, state.slideIndex);
}

function _restoreRememberedWorkoutSheetCarousel(key = _workoutHomeSelectedKey, sessionIndex = _workoutHomeSessionIndex) {
  if (typeof document === 'undefined') return;
  const state = _workoutSheetCarouselSnapshots.get(_workoutSheetCarouselSnapshotKey(key, sessionIndex));
  if (!state) return;
  const restore = () => {
    const root = _workoutHomeScrollRoot();
    const sheet = root?.querySelector?.('[data-wt-day-sheet]')
      || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
    _restoreWorkoutSheetCarouselState(sheet, state);
  };
  restore();
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restore);
  }
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(restore, 80);
    window.setTimeout(restore, 220);
  }
}

function _rememberRenderedWorkoutSheetCarousel(root = null) {
  if (typeof document === 'undefined') return;
  const targetRoot = root || _workoutHomeScrollRoot();
  const sheet = targetRoot?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  if (!sheet) return;
  const key = sheet.querySelector?.('[data-wt-sheet-main][data-date-key]')?.getAttribute('data-date-key')
    || _workoutHomeSelectedKey;
  const sessionIndex = sheet.querySelector?.('[data-session-index]')?.getAttribute('data-session-index');
  _rememberWorkoutSheetCarouselState(
    key,
    sessionIndex == null ? _workoutHomeSessionIndex : sessionIndex,
    sheet,
  );
}

function _requestWorkoutSheetPendingCarouselFocus(key, sessionIndex, slideIndex) {
  if (!Number.isFinite(Number(slideIndex))) return false;
  const index = Math.max(0, Math.floor(Number(slideIndex)));
  _workoutSheetPendingCarouselFocus.set(_workoutSheetCarouselSnapshotKey(key, sessionIndex), {
    slideIndex: index,
  });
  return true;
}

function _tryRestorePendingWorkoutSheetCarouselFocus(key = _workoutHomeSelectedKey, sessionIndex = _workoutHomeSessionIndex) {
  const pending = _workoutSheetPendingCarouselFocus.get(_workoutSheetCarouselSnapshotKey(key, sessionIndex));
  if (!pending) return false;
  if (!_restoreWorkoutSheetCarouselToSlide(pending.slideIndex, { key, sessionIndex })) return false;
  _workoutSheetPendingCarouselFocus.delete(_workoutSheetCarouselSnapshotKey(key, sessionIndex));
  return true;
}

function _workoutSheetInputSelection(input) {
  try {
    return {
      selectionStart: Number.isFinite(Number(input?.selectionStart)) ? Number(input.selectionStart) : null,
      selectionEnd: Number.isFinite(Number(input?.selectionEnd)) ? Number(input.selectionEnd) : null,
    };
  } catch {
    return { selectionStart: null, selectionEnd: null };
  }
}

function _captureWorkoutSheetInputState(sourceInput = null, options = {}) {
  if (typeof document === 'undefined') return null;
  const ignoreSourceInput = options?.ignoreSourceInput === true;
  const allowSourceFallback = options?.allowSourceFallback !== false && !ignoreSourceInput;
  const focused = document.activeElement;
  const sourceMatches = sourceInput?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR);
  const active = focused?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)
    && (!ignoreSourceInput || focused !== sourceInput)
    ? focused
    : allowSourceFallback && sourceMatches
      ? sourceInput
      : null;
  if (!active?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return null;
  const selection = _workoutSheetInputSelection(active);
  return {
    ..._workoutSheetScrollState(active),
    hasInput: true,
    sessionIndex: active.getAttribute('data-session-index') || '',
    exerciseIndex: active.getAttribute('data-exercise-index') || '',
    setIndex: active.getAttribute('data-set-index') || '',
    field: active.getAttribute('data-field') || '',
    selectionStart: selection.selectionStart,
    selectionEnd: selection.selectionEnd,
  };
}

function _captureWorkoutSheetScrollState() {
  const state = _workoutSheetScrollState();
  return state ? { ...state, hasInput: false } : null;
}

function _waitWorkoutSheetFocusTransition() {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(done);
    else done();
  });
}

function _restoreWorkoutSheetScrollState(state) {
  if (!state || typeof document === 'undefined') return;
  const root = _workoutHomeScrollRoot();
  const sheet = root?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  const scroller = sheet?.querySelector?.('.wt-day-sheet-scroll');
  _restoreWorkoutSheetCarouselState(sheet, state);
  if (scroller) scroller.scrollTop = Math.max(0, Number(state.scrollerTop) || 0);
  if (root) {
    const top = Math.max(0, Number(state.rootTop) || 0);
    if (typeof root.scrollTo === 'function') root.scrollTo({ top, behavior: 'auto' });
    else root.scrollTop = top;
  }
  if (typeof window !== 'undefined') {
    const top = Math.max(0, Number(state.windowTop) || 0);
    try { window.scrollTo({ top, behavior: 'auto' }); }
    catch { window.scrollTo(0, top); }
  }
}

function _positionOpenWorkoutSetTypeMenu() {
  if (typeof document === 'undefined') return false;
  const root = _workoutHomeScrollRoot();
  const sheet = root?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  const menu = sheet?.querySelector?.('[data-wt-set-type-menu]');
  const row = menu?.closest?.('.wt-max-set-row');
  if (!menu || !row) return false;

  const scroller = menu.closest?.('.wt-day-sheet-scroll') || sheet?.querySelector?.('.wt-day-sheet-scroll') || null;
  const sheetRect = sheet?.getBoundingClientRect?.() || null;
  const scrollerRect = scroller?.getBoundingClientRect?.() || null;
  const windowHeight = typeof window !== 'undefined' ? Number(window.innerHeight) || Infinity : Infinity;
  const visibleTop = Math.max(0, sheetRect?.top ?? 0, scrollerRect?.top ?? 0) + 8;
  const visibleBottom = Math.min(windowHeight, sheetRect?.bottom ?? windowHeight, scrollerRect?.bottom ?? windowHeight) - 8;

  row.classList.remove('is-menu-above');
  let menuRect = menu.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const belowOverflow = menuRect.bottom - visibleBottom;
  const spaceAbove = rowRect.top - visibleTop;
  const spaceBelow = visibleBottom - rowRect.bottom;
  if (belowOverflow > 0 && spaceAbove > spaceBelow) {
    row.classList.add('is-menu-above');
    menuRect = menu.getBoundingClientRect();
  }

  if (scroller && Number.isFinite(visibleTop) && Number.isFinite(visibleBottom)) {
    let delta = 0;
    if (menuRect.bottom > visibleBottom) delta = menuRect.bottom - visibleBottom;
    else if (menuRect.top < visibleTop) delta = menuRect.top - visibleTop;
    if (delta !== 0) scroller.scrollTop = Math.max(0, (Number(scroller.scrollTop) || 0) + delta);
  }

  return row.classList.contains('is-menu-above');
}

function _restoreWorkoutSheetInputState(state) {
  if (!state || typeof document === 'undefined') return;
  const restore = () => {
    _restoreWorkoutSheetScrollState(state);
    if (!state.hasInput) return;
    const root = _workoutHomeScrollRoot();
    const sheet = root?.querySelector?.('[data-wt-day-sheet]')
      || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
    const selector = [
      WORKOUT_SHEET_SET_INPUT_SELECTOR,
      `[data-session-index="${_workoutSheetSelectorValue(state.sessionIndex)}"]`,
      `[data-exercise-index="${_workoutSheetSelectorValue(state.exerciseIndex)}"]`,
      `[data-set-index="${_workoutSheetSelectorValue(state.setIndex)}"]`,
      `[data-field="${_workoutSheetSelectorValue(state.field)}"]`,
    ].join('');
    const input = sheet?.querySelector?.(selector);
    if (!input) return;
    try { input.focus({ preventScroll: true }); }
    catch { input.focus?.(); }
    try {
      if (state.selectionStart != null && state.selectionEnd != null && typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(state.selectionStart, state.selectionEnd);
      }
    } catch {}
    _restoreWorkoutSheetScrollState(state);
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(restore);
    window.setTimeout?.(restore, 80);
    window.setTimeout?.(restore, 220);
  } else {
    restore();
  }
}

function _workoutHomeScrollTop() {
  if (typeof document === 'undefined') return 0;
  const root = _workoutHomeScrollRoot();
  const windowTop = typeof window !== 'undefined' ? Number(window.scrollY) || 0 : 0;
  return Math.max(
    0,
    Number(root?.scrollTop) || 0,
    Number(document.scrollingElement?.scrollTop) || 0,
    Number(document.documentElement?.scrollTop) || 0,
    Number(document.body?.scrollTop) || 0,
    windowTop
  );
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

  await saveWorkoutDay({ silent: true });
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

function _clonePlain(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function _workoutHomeDay(key) {
  return (getCache() || {})[key] || {};
}

function _workoutHomeSessionAt(key, sessionIndex, minCount = 1) {
  const day = _workoutHomeDay(key);
  const index = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  const sessions = getWorkoutSessions(day, { minCount: Math.max(minCount, index + 1) });
  return {
    day,
    sessions,
    index,
    session: sessions[index] || sessions[0] || {},
  };
}

function _workoutSessionSavePayload(result) {
  return {
    ...result.aggregate,
    workoutSessions: result.workoutSessions,
  };
}

function _isSameWorkoutStateDate(key) {
  const p = _parseDateKey(key);
  const current = S.shared?.date;
  return !!p && !!current && current.y === p.y && current.m === p.m && current.d === p.d;
}

function _applyWorkoutHomeSessionToActiveState(session = {}, sessionIndex = 0) {
  const w = S.workout;
  const index = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  w.sessionIndex = index;
  w.sessionId = session.id || `session-${index + 1}`;
  w.exercises = _clonePlain(session.exercises || []);
  w.cf = !!session.cf;
  w.stretching = !!session.stretching;
  w.swimming = !!session.swimming;
  w.running = !!session.running;
  w.runData = {
    distance: session.runDistance || 0,
    durationMin: session.runDurationMin || 0,
    durationSec: session.runDurationSec || 0,
    memo: session.runMemo || '',
    source: session.runSource || 'manual',
    startedAt: session.runStartedAt || null,
    endedAt: session.runEndedAt || null,
    route: Array.isArray(session.runRoute) ? _clonePlain(session.runRoute) : [],
    routeRef: _clonePlain(session.runRouteRef || null),
    routeSummary: _clonePlain(session.runRouteSummary || null),
    placeSummary: _clonePlain(session.runPlaceSummary || null),
    avgPaceSecPerKm: Number(session.runAvgPaceSecPerKm) || 0,
    gpsAccuracySummary: _clonePlain(session.runGpsAccuracySummary || null),
  };
  w.cfData = {
    wod: session.cfWod || '',
    durationMin: session.cfDurationMin || 0,
    durationSec: session.cfDurationSec || 0,
    memo: session.cfMemo || '',
  };
  w.stretchData = {
    duration: session.stretchDuration || 0,
    memo: session.stretchMemo || '',
  };
  w.swimData = {
    distance: session.swimDistance || 0,
    durationMin: session.swimDurationMin || 0,
    durationSec: session.swimDurationSec || 0,
    stroke: session.swimStroke || '',
    memo: session.swimMemo || '',
  };
  w.wineFree = !!session.wine_free;
  w.workoutDuration = Math.max(0, Math.floor(Number(session.workoutDuration) || 0));
  w.workoutTimeline = _clonePlain(session.workoutTimeline || null);
  w.currentGymId = session.gymId || null;
  w.pickerGymFilter = session.pickerGymFilter || null;
  w.routineMeta = _clonePlain(session.routineMeta || null);
  w.maxMeta = _clonePlain(session.maxMeta || null);
}

function _syncWorkoutHomeSavedSessionState(key, result, sessionIndex = null) {
  const p = _parseDateKey(key);
  const sessions = Array.isArray(result?.workoutSessions) ? result.workoutSessions : [];
  if (!p || !sessions.length) return;
  const targetIndexRaw = Number(sessionIndex);
  if (!Number.isFinite(targetIndexRaw)) return;
  const targetIndex = Math.max(0, Math.floor(targetIndexRaw));
  const targetSession = sessions[targetIndex];
  if (!targetSession) return;
  const date = { y: p.y, m: p.m, d: p.d };
  try {
    wtReplaceActiveWorkoutDraftSession(date, targetIndex, targetSession, 'sheet session save');
  } catch (e) {
    console.warn('[workout-calendar] active draft sync skipped:', e);
  }
  if (!_isSameWorkoutStateDate(key)) return;
  const activeIndex = Math.max(0, Math.floor(Number(S.workout?.sessionIndex) || 0));
  if (activeIndex !== targetIndex) return;
  _applyWorkoutHomeSessionToActiveState(targetSession, targetIndex);
}

function _hasWorkoutHomeMealRecord(day, mealKey) {
  const textKey = mealKey;
  const foodsKey = `${mealKey[0]}Foods`;
  const kcalKey = `${mealKey[0]}Kcal`;
  const skipKey = `${mealKey}_skipped`;
  if (day?.[skipKey]) return true;
  if (String(day?.[textKey] || '').trim()) return true;
  if (Array.isArray(day?.[foodsKey]) && day[foodsKey].length > 0) return true;
  return _num(day?.[kcalKey]) > 0;
}

function _mealOkPatchForWorkoutHomeDay(key, existingDay, aggregate) {
  const p = _parseDateKey(key);
  if (!p) return {};
  try {
    const diet = {
      bKcal: existingDay.bKcal || 0,
      lKcal: existingDay.lKcal || 0,
      dKcal: existingDay.dKcal || 0,
      sKcal: existingDay.sKcal || 0,
    };
    const isDietSuccess = deriveDietSuccessFromWorkout(aggregate, diet, { y: p.y, m: p.m, d: p.d }, aggregate.exercises || []);
    return {
      bOk: _hasWorkoutHomeMealRecord(existingDay, 'breakfast')
        ? (existingDay.breakfast_skipped ? true : isDietSuccess) : null,
      lOk: _hasWorkoutHomeMealRecord(existingDay, 'lunch')
        ? (existingDay.lunch_skipped ? true : isDietSuccess) : null,
      dOk: _hasWorkoutHomeMealRecord(existingDay, 'dinner')
        ? (existingDay.dinner_skipped ? true : isDietSuccess) : null,
      sOk: _hasWorkoutHomeMealRecord(existingDay, 'snack') ? isDietSuccess : null,
    };
  } catch (e) {
    console.warn('[workout-calendar] meal ok recompute skipped:', e);
    return {};
  }
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
    if (options?.skipRender !== true) {
      renderWorkoutCalendarHome();
      if (nextRestoreState) _restoreWorkoutSheetInputState(nextRestoreState);
    }
    await savePromise;
    // A previous field can finish saving after the user already moved to the
    // next keypad field. Avoid app-level renderAll() replacing that live input;
    // the final field commit will dispatch the normal saved event when idle.
    if (_workoutSetKeyboardActiveInput()) return;
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

function _durationFromMinSec(min, sec) {
  return Math.max(0, Math.round((_num(min) * 60) + _num(sec)));
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
function _sortedCheckins() {
  return (getBodyCheckins() || [])
    .filter(c => c?.date && typeof c.weight === 'number' && isFinite(c.weight))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function _weightAt(sortedCheckins, key) {
  for (let i = sortedCheckins.length - 1; i >= 0; i--) {
    if (sortedCheckins[i].date <= key) return sortedCheckins[i].weight;
  }
  return null;
}

function _shiftDateKey(key, days) {
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function _maxWeakMetrics(day) {
  const meta = day?.maxMeta;
  if (!meta || meta.mode !== 'max') return null;
  const block = meta.weakBlock || {};
  const activeAdd = block.activeStartedAt ? Math.max(0, Math.floor((Date.now() - block.activeStartedAt) / 1000)) : 0;
  const durationSec = Math.max(0, Math.floor(Number(block.durationSec) || 0) + activeAdd);
  const summary = meta.weakSummary || {};
  const sets = Math.max(0, Number(summary.sets) || 0);
  const volume = Math.max(0, Math.round(Number(summary.volume) || 0));
  const selected = Array.isArray(meta.selectedWeakParts) ? meta.selectedWeakParts : [];
  const bonus = Math.min(5, Math.floor(durationSec / 600) + Math.floor(sets / 4));
  return {
    durationSec,
    durationMin: Math.floor(durationSec / 60),
    sets,
    volume,
    selected,
    bonus,
    hasAny: durationSec > 0 || sets > 0 || selected.length > 0,
  };
}

// ═════════════════════════════════════════════════════════════
// 한 날짜의 전체 메트릭 계산
// ═════════════════════════════════════════════════════════════
function _dayMetrics(key, day, plan, metrics, checkins) {
  // 체중 (stepwise)
  const weight = _weightAt(checkins, key);
  const bodyWeight = weight != null
    ? weight
    : (getLatestCheckinWeight() ?? plan?.weight ?? 70);

  // 섭취 칼로리
  const kcalIn = (day.bKcal||0) + (day.lKcal||0) + (day.dKcal||0) + (day.sKcal||0);

  // 소모 칼로리 (MET 기반)
  const burned = calcBurnedKcal(day, bodyWeight);

  // 목표 칼로리 & 탄단지
  let targetKcal = 0;
  let macroTarget = null;
  if (plan && plan.weight && plan.height) {
    const [yy, mm, dd] = key.split('-').map(n => parseInt(n, 10));
    try {
      targetKcal = getDayTargetKcal(plan, yy, mm - 1, dd, day);
      const dow = new Date(yy, mm - 1, dd).getDay();
      const isRefeed = (plan.refeedDays || []).includes(dow);
      const macro = isRefeed ? metrics.refeed : metrics.deficit;
      macroTarget = { proteinG: macro.proteinG, carbG: macro.carbG, fatG: macro.fatG };
    } catch (_) { /* plan 불완전 */ }
  }

  // 체중 방향성 (7일전 대비)
  let weightDeltaKg = null;
  let weightDirSign = -1; // 기본: 감량
  if (plan && plan.targetWeight && plan.weight) {
    weightDirSign = plan.targetWeight < plan.weight ? -1
                  : plan.targetWeight > plan.weight ? +1 : 0;
  }
  if (weight != null) {
    const prevKey = _shiftDateKey(key, -7);
    const prevW = _weightAt(checkins, prevKey);
    if (prevW != null) weightDeltaKg = weight - prevW;
  }

  // 점수
  const scoreResult = calcDayScore({
    day, targetKcal, macroTarget, burnedKcal: burned.total,
    weightDeltaKg, weightDirSign,
  });
  const maxWeak = _maxWeakMetrics(day);
  const baseScore = scoreResult.score;
  const score = baseScore != null
    ? Math.min(100, baseScore + (maxWeak?.bonus || 0))
    : baseScore;
  const band =
    score == null ? scoreResult.band :
    score >= 95 ? 'great' :
    score >= 90 ? 'good' :
    score >= 80 ? 'soso' : 'bad';

  return {
    key, day,
    kcalIn, kcalBurned: burned.total, burnedBreakdown: burned,
    weight,
    targetKcal, macroTarget,
    weightDeltaKg, weightDirSign,
    score,
    band,
    breakdown: scoreResult.breakdown,
    maxWeak,
  };
}

function _activityRows(day) {
  return buildCalendarActivityRows(day, { isTrustedRunningCalories });
}

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

const FALLBACK_MAJOR_LABELS = {
  chest: '가슴',
  back: '등',
  shoulder: '어깨',
  lower: '하체',
  glute: '둔부',
  bicep: '이두',
  tricep: '삼두',
  abs: '복부',
  other: '기타',
};

function _buildWorkoutLookup() {
  return {
    exById: new Map((getExList() || []).filter(Boolean).map(ex => [ex.id, ex])),
    movById: new Map((MOVEMENTS || []).filter(Boolean).map(mv => [mv.id, mv])),
    muscleById: new Map((getMuscleParts() || []).filter(Boolean).map(m => [m.id, m])),
  };
}

function _primaryFromIds(value) {
  return Array.isArray(value) ? value.find(Boolean) : null;
}

function _normalizeMajorId(id) {
  if (!id) return null;
  return SUBPATTERN_TO_MAJOR[id] || id;
}

function _resolveExerciseMajorId(entry, lookup) {
  const lib = lookup?.exById?.get(entry?.exerciseId);
  const primaryId = _primaryFromIds(entry?.muscleIds) || _primaryFromIds(lib?.muscleIds);
  if (primaryId) return _normalizeMajorId(primaryId);

  const movementId = entry?.movementId || lib?.movementId || null;
  const movement = movementId ? lookup?.movById?.get(movementId) : null;
  if (movement?.primary) return movement.primary;
  if (movement?.subPattern) return _normalizeMajorId(movement.subPattern);

  return _normalizeMajorId(entry?.muscleId || lib?.muscleId);
}

function _majorLabel(id, lookup) {
  if (!id) return FALLBACK_MAJOR_LABELS.other;
  return lookup?.muscleById?.get(id)?.name || FALLBACK_MAJOR_LABELS[id] || id;
}

function _partDisplayLabels(exercises, lookup) {
  const byMajor = new Map();
  const cardioLabels = [];
  exercises.forEach((row) => {
    if (row.cardio) {
      cardioLabels.push({
        text: row.name,
        title: `${row.name} · 유산소`,
      });
      return;
    }
    if (row.setCount <= 0) return;
    const id = row.majorId || 'other';
    if (!byMajor.has(id)) {
      byMajor.set(id, {
        id,
        name: _majorLabel(id, lookup),
        setCount: 0,
        volume: 0,
        order: byMajor.size,
      });
    }
    const item = byMajor.get(id);
    item.setCount += row.setCount;
    item.volume += row.volume;
  });
  return [
    ...cardioLabels,
    ...[...byMajor.values()]
    .sort((a, b) => (b.setCount - a.setCount) || (b.volume - a.volume) || (a.order - b.order))
    .map(item => ({
      text: `${item.name} ${item.setCount}`,
      title: `${item.name} ${item.setCount}세트`,
    })),
  ];
}

function _workoutEntryName(entry = {}) {
  return String(entry?.name || entry?.exerciseName || entry?.exerciseId || '').trim();
}

// 2026-07-25: '지난 기록'은 종목(기구) 단위 기억이어야 한다. movementId는 동작 카탈로그
//   (chest_fly 등)라 같은 헬스장의 아스날 플라이/매트릭스 플라이가 모두 같은 값을 갖는다.
//   이전 구현은 exerciseId가 서로 달라도 movementId 폴백으로 내려가 다른 기구 기록을
//   집어왔다(아스날 카드에 매트릭스 41kg×15 4세트 노출). 양쪽 모두 exerciseId를 가지면
//   그 비교 결과가 곧 결론이고, 폴백은 exerciseId가 없는 레거시 기록에만 적용한다.
//   트랙 그래프(getTrackMetricHistory)와 동일한 exerciseId 기준 정체성이다.
function _workoutEntryMatchesRow(entry = {}, row = {}) {
  const rowExerciseId = String(row?.exerciseId || '').trim();
  const entryExerciseId = String(entry?.exerciseId || '').trim();
  if (rowExerciseId && entryExerciseId) return rowExerciseId === entryExerciseId;
  const rowName = String(row?.name || '').trim();
  const entryName = _workoutEntryName(entry);
  if (rowName && entryName) return rowName === entryName;
  const rowMovementId = String(row?.movementId || '').trim();
  const entryMovementId = String(entry?.movementId || '').trim();
  return !!rowMovementId && rowMovementId === entryMovementId;
}

function _workoutRecordFromEntry(key, entry = {}) {
  const rawSets = Array.isArray(entry?.sets) ? entry.sets.filter(Boolean) : [];
  const sets = rawSets.filter(_isActualWorkoutSet);
  if (!sets.length) return null;
  const topSet = [...sets].sort((a, b) => calcSetVolume(b) - calcSetVolume(a))[0] || null;
  return {
    dateKey: key,
    dateLabel: _dateDistanceLabel(key),
    setCount: sets.length,
    volume: sets.reduce((sum, set) => sum + calcSetVolume(set), 0),
    topSetText: topSet ? _formatSetText(topSet) : '세트 기록 없음',
    setTexts: sets.map(_formatSetText),
    setDetails: sets.map((set, setIndex) => ({
      setIndex,
      kg: _num(set.kg),
      reps: _num(set.reps),
      rpe: _num(set.rpe),
      rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
      romPct: Number.isFinite(Number(set.romPct)) ? Number(set.romPct) : 100,
      setType: set.setType || 'main',
      wendlerRole: set.wendlerRole || '',
      supplementalKind: set.supplementalKind || '',
      wendlerPct: Number.isFinite(Number(set.wendlerPct)) ? Number(set.wendlerPct) : null,
      amrap: set.amrap === true,
      completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null,
      done: _isActualWorkoutSet(set),
    })),
  };
}

function _previousWorkoutRecordForRow(cache = null, row = {}) {
  const selectedKey = String(row?.dateKey || '').trim();
  const source = cache && typeof cache === 'object' ? cache : getCache();
  const keys = Object.keys(source || {})
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && (!selectedKey || key < selectedKey))
    .sort((a, b) => b.localeCompare(a));
  for (const key of keys) {
    const sessions = getWorkoutSessions(source[key] || {});
    for (const session of sessions) {
      const entry = (Array.isArray(session?.exercises) ? session.exercises : [])
        .find(item => _workoutEntryMatchesRow(item, row));
      const record = entry ? _workoutRecordFromEntry(key, entry) : null;
      if (record) return record;
    }
  }
  return null;
}

function _exerciseRows(day, lookup = _buildWorkoutLookup(), key = null, options = {}) {
  const includeDraftExercises = options?.includeDraftExercises === true;
  const includePreviousRecord = options?.includePreviousRecord === true;
  const previousRecordCache = options?.cache || null;
  return (Array.isArray(day?.exercises) ? day.exercises : [])
    .map((entry, originalIndex) => {
      const rawSets = Array.isArray(entry?.sets) ? entry.sets.filter(Boolean) : [];
      const sets = rawSets.filter(_isActualWorkoutSet);
      const note = (entry?.note || '').toString().trim();
      const hasDraftExercise = includeDraftExercises && _hasDraftWorkoutEntry(entry);
      const cardio = _cardioEntryData(entry);
      if (!sets.length && !note && !hasDraftExercise && !cardio) return null;
      const volume = sets.reduce((sum, set) => sum + calcSetVolume(set), 0);
      const topSet = [...sets].sort((a, b) => calcSetVolume(b) - calcSetVolume(a))[0] || null;
      const majorId = cardio ? 'cardio' : _resolveExerciseMajorId(entry, lookup);
      const lib = lookup?.exById?.get(entry?.exerciseId);
      const row = {
        dateKey: key,
        exerciseId: entry?.exerciseId || null,
        movementId: entry?.movementId || lib?.movementId || null,
        name: cardio?.label || entry?.name || entry?.exerciseName || entry?.exerciseId || '운동',
        majorId,
        majorName: cardio ? '유산소' : _majorLabel(majorId, lookup),
        recommendationMeta: entry?.recommendationMeta || null,
        maxPrescription: entry?.maxPrescription || null,
        maxTrackPreference: lib?.maxTrackPreference || null,
        exerciseCompletedAt: workoutExerciseCompletionStampAt(entry),
        setCount: sets.length,
        volume,
        topSetText: cardio ? _cardioSummaryText(cardio) : (topSet ? _formatSetText(topSet) : '세트 기록 없음'),
        setTexts: sets.map(_formatSetText),
        setDetails: sets.map((set, setIndex) => ({
          setIndex,
          kg: _num(set.kg),
          reps: _num(set.reps),
          rpe: _num(set.rpe),
          rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
          romPct: Number.isFinite(Number(set.romPct)) ? Number(set.romPct) : 100,
          setType: set.setType || 'main',
          wendlerRole: set.wendlerRole || '',
          supplementalKind: set.supplementalKind || '',
          wendlerPct: Number.isFinite(Number(set.wendlerPct)) ? Number(set.wendlerPct) : null,
          amrap: set.amrap === true,
          completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null,
          done: _isActualWorkoutSet(set),
        })),
        rawSetDetails: rawSets.map((set, setIndex) => ({
          setIndex,
          kg: _workoutSheetRawNumber(set.kg),
          reps: _workoutSheetRawNumber(set.reps),
          rpe: _num(set.rpe),
          rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
          romPct: Number.isFinite(Number(set.romPct)) ? Number(set.romPct) : 100,
          setType: set.setType || 'main',
          wendlerRole: set.wendlerRole || '',
          supplementalKind: set.supplementalKind || '',
          wendlerPct: Number.isFinite(Number(set.wendlerPct)) ? Number(set.wendlerPct) : null,
          amrap: set.amrap === true,
          completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null,
          done: set.done === true,
        })),
        note,
        cardio,
        originalIndex,
      };
      if (includePreviousRecord) {
        row.previousRecord = _previousWorkoutRecordForRow(previousRecordCache, row);
      }
      return row;
    })
    .filter(Boolean);
}

function _workoutMetrics(key, day, bodyWeight, lookup = _buildWorkoutLookup(), options = {}) {
  const d = day || {};
  const exercises = _exerciseRows(d, lookup, key, options);
  const activities = _activityRows(d);
  const burned = calcBurnedKcal(d, bodyWeight);
  const workoutTimeline = buildWorkoutSetTimeline(d.exercises, d.workoutDuration);
  const workoutDurationSec = Math.max(0, Math.round(_num(workoutTimeline.durationSec)));
  const activityDurationSec = activities.reduce((sum, row) => sum + (row.durationSec || 0), 0);
  const hasTimelineRecord = (Number(workoutTimeline.checkedSetCount) || 0) > 0;
  const gymDurationSec = (exercises.length || hasTimelineRecord) ? workoutDurationSec : 0;
  const durationSec = Math.max(gymDurationSec + activityDurationSec, workoutDurationSec, activityDurationSec);
  const setCount = exercises.reduce((sum, row) => sum + row.setCount, 0);
  const volume = exercises.reduce((sum, row) => sum + row.volume, 0);
  const displayLabels = [
    ..._partDisplayLabels(exercises, lookup),
    ...activities.map(row => ({
      text: row.label,
      title: row.main ? `${row.label} · ${row.main}` : row.label,
    })),
  ].filter(row => row?.text);
  const labels = displayLabels.map(row => row.text);
  const hasWorkout = exercises.length > 0 || activities.length > 0 || workoutDurationSec > 0 || hasTimelineRecord || burned.total > 0;
  return {
    key,
    day: d,
    exercises,
    activities,
    burned,
    durationSec,
    workoutDurationSec,
    activityDurationSec,
    setCount,
    volume,
    labels,
    displayLabels,
    primaryLabel: labels[0] || '',
    hasWorkout,
  };
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
  const currentSeason = findSeasonForDate(seasonRegistry, todayKey);

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
  const weekdays = ['일','월','화','수','목','금','토'];
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
    ? _renderWorkoutHomeMonthGrid({ y, m, firstDow, daysCount, dayCells, dayMetrics })
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
    <div class="cal-season-control ${currentSeason ? 'has-current-season' : 'needs-season'}">
      <span class="cal-season-emblem" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 20V5.2c4-2.4 7.2 2.4 12 0v9.3c-4.8 2.4-8-2.4-12 0"/><path d="m11.7 8.4.8 1.7 1.8.3-1.3 1.3.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.3 1.8-.3.8-1.7Z"/></svg></span>
      <div class="cal-season-copy"><span>${currentSeason ? 'CURRENT SEASON' : 'SEASON SETUP'}</span><strong>${_esc(currentSeason?.name || '새 시즌 설정 필요')}</strong>${currentSeason ? `<small>${currentSeason.startDate}–${currentSeason.endDate}</small>` : '<small>기록은 유지하고 새 목표를 세우며 시작합니다.</small>'}</div>
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

function _renderWorkoutHomeMonthGrid({ y, m, firstDow, daysCount, dayCells, dayMetrics }) {
  const weekRows = [];
  const rowCount = Math.ceil((firstDow + daysCount) / 7);
  for (let row = 0; row < rowCount; row++) {
    const cellHtmls = [];
    let weekDurationSec = 0;
    let weekSets = 0;
    for (let dow = 0; dow < 7; dow++) {
      const day = (row * 7) + dow - firstDow + 1;
      if (day < 1 || day > daysCount) {
        cellHtmls.push(`<div class="cal-cell cal-cell-empty cal-workout-cell cal-workout-cell-outside"></div>`);
        continue;
      }
      const wx = dayMetrics.get(day);
      if (wx?.hasWorkout) {
        weekDurationSec += wx.durationSec || 0;
        weekSets += wx.setCount || 0;
      }
      cellHtmls.push(dayCells.get(day) || `<div class="cal-cell cal-cell-empty cal-workout-cell"></div>`);
    }

    const anchorDay = Math.min(daysCount, Math.max(1, (row * 7) - firstDow + 1));
    const weekNo = _isoWeekNumber(new Date(y, m, anchorDay));
    weekRows.push(`
      <div class="cal-workout-week-row">
        <div class="cal-workout-week-rail" aria-label="${weekNo}주 운동 요약">
          <strong>${weekNo}주</strong>
          <span>${_formatWorkoutWeekHours(weekDurationSec)}</span>
          <span>${weekSets > 0 ? `${weekSets}s` : '—'}</span>
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
  const weekdays = ['일','월','화','수','목','금','토'];

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
  if (_workoutSetKeyboardDomLocked && _workoutSetKeyboardElement()?.classList.contains('is-open')) return;
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

function _renderWorkoutHomeDetailHtml({ cache, plan, checkins, key, includeHead = true }) {
  const lookup = _buildWorkoutLookup();
  const day = cache[key] || {};
  const sessions = getWorkoutSessions(day, { minCount: WORKOUT_RUNNING_SESSION_INDEX + 1 });
  if (_workoutHomeSessionIndex > WORKOUT_RUNNING_SESSION_INDEX) _workoutHomeSessionIndex = WORKOUT_RUNNING_SESSION_INDEX;
  const runningInfo = runningTrackSessionInfo(sessions);
  const runningActive = _isRunningTabIndex(_workoutHomeSessionIndex);
  const sessionIndex = runningActive
    ? runningInfo.index
    : Math.max(0, Math.min(WORKOUT_GYM_SESSION_COUNT - 1, Math.floor(Number(_workoutHomeSessionIndex) || 0)));
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
  const ordinal = _workoutRecordOrdinalForKey(cache, key, plan, checkins, lookup);
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
function _renderWorkoutDayExportDock(key, { solo = false } = {}) {
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

function _renderWorkoutDetailSummaryCard(wx) {
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

function _renderWorkoutDetailSessionTabs(sessions, activeIndex, runningInfo = null) {
  const gymTabs = (Array.isArray(sessions) ? sessions : []).slice(0, WORKOUT_GYM_SESSION_COUNT);
  const tabs = gymTabs.map((session, index) => {
    const hasRecord = _hasWorkoutHomeSessionRecord(session);
    return `
      <button type="button"
        class="${index === activeIndex ? 'active' : ''} ${hasRecord ? 'has-record' : ''}"
        data-wt-sheet-card-action="select-session" data-session-index="${index}">
        ${_sessionLabel(index)}${hasRecord ? '<b></b>' : ''}
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

function _hasWorkoutHomeSessionRecord(session) {
  return hasWorkoutGymCardData(session);
}

function _renderWorkoutDetailRecorded(key, sessionIndex, wx) {
  return `
    <div class="wt-day-recorded">
      ${_renderWorkoutDetailCards(key, sessionIndex, wx)}
    </div>
  `;
}

function _renderWorkoutDetailCards(key, sessionIndex, wx) {
  const exerciseCards = _renderWorkoutExerciseDetailCarousel(key, sessionIndex, wx.exercises);
  const activityCards = wx.activities.map((row, index) => _renderWorkoutActivityDetailCard(key, sessionIndex, row, index));
  return `<div class="wt-day-card-list">${exerciseCards}${activityCards.join('')}</div>`;
}

function _renderWorkoutExerciseDetailCarousel(key, sessionIndex, exercises = []) {
  const rows = Array.isArray(exercises) ? exercises : [];
  if (!rows.length) return '';
  const count = rows.length;
  const slides = rows.map((row, index) => `
    <div class="wt-day-exercise-slide" data-wt-day-exercise-slide="${index}" aria-label="${index + 1}/${count} ${_esc(row?.name || '운동종목')}">
      ${_renderWorkoutExerciseDetailCard(key, sessionIndex, row, index)}
    </div>
  `).join('');
  return `
    <section class="wt-day-exercise-carousel ${count > 1 ? 'has-multiple' : 'is-single'}" aria-label="운동종목 카드">
      <div class="wt-day-exercise-carousel-track" data-wt-day-exercise-carousel-track>
        ${slides}
      </div>
    </section>
  `;
}

function _workoutPreviousSetSummary(row) {
  const previous = row?.previousRecord || null;
  if (!previous) return { label: '지난 기록', summary: '이전 세트 기록 없음' };
  const dateLabel = previous.dateLabel || _dateDistanceLabel(previous.dateKey) || '이전';
  return {
    label: `지난 기록 · ${dateLabel}`,
    summary: workoutSetSummary(previous),
  };
}

function _smoothPath(points) {
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

function _renderWorkoutSparkline(row, trend = null) {
  const historyValues = (Array.isArray(trend?.points) ? trend.points : [])
    .map(point => _num(point?.value))
    .filter(value => value > 0);
  const raw = historyValues.length >= 2 ? historyValues : workoutFallbackSparkValues(row, trend?.track === 'H' ? 'H' : 'M');
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
  const track = trend?.track === 'H' ? 'H' : 'M';
  const color = track === 'H' ? '#be123c' : '#2563eb';
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

function _renderWorkoutTrackGraphRow(row, bestSet, track, activeTrack) {
  const trend = buildWorkoutTrackTrend(row, bestSet, {
    cache: getCache(),
    exList: getExList(),
  }, track);
  const delta = trend.delta || '';
  return `
    <div class="ex-max-track-graph-row ${track === activeTrack ? 'is-active' : ''}" data-track="${track}">
      <span class="ex-max-track-graph-chip">${_esc(trend.trackLabel)}</span>
      <span class="wt-max-spark">${_renderWorkoutSparkline(row, trend)}</span>
      <span class="ex-max-track-graph-value">${_esc(trend.valueLabel)}${delta ? `<small class="${_esc(trend.deltaClass)}">${_esc(delta)}</small>` : ''}</span>
    </div>
  `;
}

function _renderWorkoutTrackGraph(row, bestSet) {
  const activeTrack = activeWorkoutTrack(row, bestSet);
  return `
    <div class="ex-max-track-graph wt-max-track-graph" title="볼륨 트랙은 총볼륨, 강도 트랙은 추정 1RM으로 따로 그립니다.">
      ${_renderWorkoutTrackGraphRow(row, bestSet, 'M', activeTrack)}
      ${_renderWorkoutTrackGraphRow(row, bestSet, 'H', activeTrack)}
    </div>
  `;
}

function _renderWorkoutSetInput(key, sessionIndex, exerciseIndex, setIndex, field, value, label, step = '1') {
  return `<input type="text" inputmode="none" pattern="[0-9.]*" readonly min="0" step="${_esc(step)}" value="${_esc(value)}" aria-label="${_esc(label)}" data-wt-set-input data-wt-set-keyboard-input data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" data-field="${_esc(field)}" data-wt-set-clear-on-focus>`;
}

function _workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex) {
  return [
    _parseDateKey(key) ? key : _workoutHomeSelectedKey,
    Math.max(0, Math.floor(Number(sessionIndex) || 0)),
    Math.max(0, Math.floor(Number(exerciseIndex) || 0)),
    Math.max(0, Math.floor(Number(setIndex) || 0)),
  ].join(':');
}

function _workoutSetInlineFieldKey(key, sessionIndex, exerciseIndex, setIndex, field) {
  const safeField = String(field || '');
  if (!['kg', 'reps'].includes(safeField)) return '';
  return `${_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex)}:${safeField}`;
}

function _isWorkoutSetEditorExpanded(key, sessionIndex, exerciseIndex, setIndex) {
  return _workoutExpandedSetEditors.has(_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex));
}

function _isWorkoutSetInlineEditing(key, sessionIndex, exerciseIndex, setIndex, field) {
  const inlineKey = _workoutSetInlineFieldKey(key, sessionIndex, exerciseIndex, setIndex, field);
  return !!inlineKey && _workoutInlineSetEditor === inlineKey;
}

function _isWorkoutSetTypeMenuOpen(key, sessionIndex, exerciseIndex, setIndex) {
  return _workoutOpenSetTypeMenus.has(_workoutSetEditorKey(key, sessionIndex, exerciseIndex, setIndex));
}

function _clearWorkoutSetEditorsForExercise(key, sessionIndex, exerciseIndex) {
  const prefix = [
    _parseDateKey(key) ? key : _workoutHomeSelectedKey,
    Math.max(0, Math.floor(Number(sessionIndex) || 0)),
    Math.max(0, Math.floor(Number(exerciseIndex) || 0)),
  ].join(':') + ':';
  [..._workoutExpandedSetEditors].forEach((editorKey) => {
    if (editorKey.startsWith(prefix)) _workoutExpandedSetEditors.delete(editorKey);
  });
  [..._workoutOpenSetTypeMenus].forEach((menuKey) => {
    if (menuKey.startsWith(prefix)) _workoutOpenSetTypeMenus.delete(menuKey);
  });
  if (_workoutInlineSetEditor?.startsWith?.(prefix)) _workoutInlineSetEditor = null;
}

function _renderWorkoutSetInlineInput(key, sessionIndex, exerciseIndex, setIndex, field, value, label, step = '1') {
  const safeField = ['kg', 'reps'].includes(String(field || '')) ? String(field) : 'kg';
  const inlineKey = _workoutSetInlineFieldKey(key, sessionIndex, exerciseIndex, setIndex, safeField);
  return `<input type="text" inputmode="none" pattern="[0-9.]*" readonly min="0" step="${_esc(step)}" value="${_esc(value)}" class="wt-max-set-value-input" aria-label="${_esc(label)}" data-wt-set-input data-wt-set-keyboard-input data-wt-set-inline-input data-wt-inline-editor-key="${_esc(inlineKey)}" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}" data-field="${_esc(safeField)}" data-wt-set-clear-on-focus>`;
}

function _renderWorkoutSetAddRow(key, sessionIndex, exerciseIndex, cardId = '') {
  return `
    <button type="button" class="wt-max-set-add-row" data-wt-sheet-card-action="add-exercise-set" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${exerciseIndex}" aria-label="세트 추가">
      <span aria-hidden="true">+</span>
    </button>
  `;
}

function _renderWorkoutSetTypeMenu(key, sessionIndex, exerciseIndex, setIndex, currentType = 'main') {
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
    </div>
  `;
}

function _renderWorkoutSetRows(row, options = {}) {
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
  const rows = sets.map((set) => {
    const setIndex = Math.max(0, Math.floor(Number(set.setIndex) || 0));
    const rom = Math.max(0, Math.min(100, Math.round(_num(set.romPct) || 100)));
    const kgText = formatWorkoutKg(set.kg);
    const repsText = formatWorkoutReps(set.reps);
    const kgDisplayText = kgText === '-' ? '미입력' : kgText;
    const repsDisplayText = repsText === '-' ? '미입력' : repsText;
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
      <div class="wt-max-set-row ${set.done ? 'is-done' : ''} ${editable ? 'is-editing' : ''} ${expanded ? 'is-expanded-editor' : ''} ${typeMenuOpen ? 'is-type-menu-open' : ''}"${swipeAttrs}>
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
        ${typeMenuOpen ? _renderWorkoutSetTypeMenu(key, sessionIndex, exerciseIndex, setIndex, setTypeValue) : ''}
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
  }).join('');
  return `${rows}${addRow}`;
}

function _isWorkoutExerciseCompletionStamped(cardId, row = null) {
  if (isWorkoutExerciseComplete(row)) return true;
  _workoutExerciseCompletionStamps.delete(cardId);
  return false;
}

function _cardioMetricItems(row) {
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

function _renderWorkoutCardioDetailCard(key, sessionIndex, row, index) {
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

function _renderWorkoutExerciseDetailCard(key, sessionIndex, row, index) {
  if (row?.cardio) return _renderWorkoutCardioDetailCard(key, sessionIndex, row, index);
  const cardId = `ex:${key}:${sessionIndex}:${index}`;
  const stamped = _isWorkoutExerciseCompletionStamped(cardId, row);
  const collapsed = stamped && _workoutEditingCardId !== cardId;
  const editing = !collapsed;
  const originalIndex = Number.isFinite(Number(row.originalIndex)) ? Number(row.originalIndex) : index;
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
        <button type="button" data-wt-sheet-card-action="delete-exercise" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" aria-label="운동 삭제">×</button>
      </div>
      <div class="wt-max-card-name">${_esc(row.name)}</div>
      <div class="wt-max-plan">
        <div class="wt-max-plan-goal">
          <span>오늘 성공 기준</span>
          <strong>${_esc(goalText)}</strong>
          <em>${_esc(trackText)}</em>
        </div>
        <div class="wt-max-trend">
          ${_renderWorkoutTrackGraph(row, bestSet)}
        </div>
      </div>
      <div class="wt-max-last">
        ${Array.isArray(row?.previousRecord?.setDetails) && row.previousRecord.setDetails.length > 0 ? `
          <button type="button" class="wt-max-last-copy" data-wt-sheet-card-action="copy-previous-sets" data-date-key="${_esc(key)}" data-session-index="${sessionIndex}" data-exercise-index="${originalIndex}" aria-label="지난 기록 ${row.previousRecord.setDetails.length}세트 전체 복사">
            <span>${_esc(previousSummary.label)}<em>전체 세트 복사</em></span>
        ` : `
          <span>${_esc(previousSummary.label)}</span>
        `}
        <strong>${_esc(previousSummary.summary)}</strong>${Array.isArray(row?.previousRecord?.setDetails) && row.previousRecord.setDetails.length > 0 ? '</button>' : ''}
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

function _renderRunningRouteMap(row) {
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
  const mapId = _registerWorkoutRunningMapPayload(row);
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

function _renderRunningRouteDetail(row) {
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

function _renderRunningGpsStatus(row) {
  return '';
}

function _renderWorkoutRunningDetailCard(key, sessionIndex, row, index) {
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

function _renderWorkoutActivityDetailCard(key, sessionIndex, row, index) {
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

function _renderWorkoutDetailEmpty(sessionIndex) {
  return `
    <div class="wt-day-empty">
      <div class="wt-day-session-label">${_sessionLabel(sessionIndex)}</div>
      <div class="wt-empty-center">
        <div class="wt-empty-dumbbell" aria-hidden="true"></div>
        <p><strong>${_sessionLabel(sessionIndex)} 운동 기록</strong>이 없습니다</p>
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

function _renderWorkoutRunningEmpty(key) {
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
  const dowLabel = ['일','월','화','수','목','금','토'][d.getDay()];
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
  const dowLabel = ['일','월','화','수','목','금','토'][d.getDay()];
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
        const p = (day.bProtein||0)+(day.lProtein||0)+(day.dProtein||0)+(day.sProtein||0);
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
    if (input.hasAttribute('data-wt-set-inline-input')) {
      const previousInput = _workoutSetKeyboardInput?.isConnected ? _workoutSetKeyboardInput : null;
      const targetMeta = _workoutSetKeyboardMeta(input);
      const inlineEditorKey = input.getAttribute('data-wt-inline-editor-key') || '';
      const switchingMountedField = previousInput
        && previousInput !== input
        && previousInput.hasAttribute('data-wt-set-inline-input');
      if (switchingMountedField) _workoutSetKeyboardDomLocked = true;
      if (inlineEditorKey) _workoutInlineSetEditor = inlineEditorKey;
      if (switchingMountedField && previousInput.getAttribute('data-wt-set-keyboard-dirty') === 'true') {
        Promise.resolve(_commitWorkoutSetKeyboardInput(previousInput, {
          closeInline: false,
          nextTarget: targetMeta,
          skipRender: true,
        })).catch((error) => {
          console.warn('[workout-calendar] mounted inline field commit failed:', error);
        });
      }
      if (switchingMountedField) {
        _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-inline-field' });
      }
    }
    _clearWorkoutSetInputOnFocus(input);
    _showWorkoutSetKeyboard(input);
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

function _workoutSetKeyboardElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('[data-wt-set-keyboard]');
}

function _workoutSetKeyboardSheet(input = null) {
  if (typeof document === 'undefined') return null;
  const source = input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)
    ? input
    : _workoutSetKeyboardInput?.isConnected && _workoutSetKeyboardInput.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)
      ? _workoutSetKeyboardInput
      : null;
  return source?.closest?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]')
    || document.querySelector?.('[data-wt-day-sheet]');
}

function _workoutSetKeyboardActiveInput(input = null) {
  if (input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return input;
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (active?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return active;
  if (_workoutSetKeyboardInput?.isConnected && _workoutSetKeyboardInput.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) {
    return _workoutSetKeyboardInput;
  }
  return null;
}

function _workoutSetKeyboardMeta(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return null;
  return {
    key: input.getAttribute('data-date-key') || _workoutHomeSelectedKey,
    sessionIndex: input.getAttribute('data-session-index') || '0',
    exerciseIndex: input.getAttribute('data-exercise-index') || '0',
    setIndex: input.getAttribute('data-set-index') || '0',
    field: input.getAttribute('data-field') || 'kg',
    mode: input.hasAttribute('data-wt-set-inline-input') ? 'inline' : 'editor',
  };
}

function _sameWorkoutSetKeyboardTarget(a, b) {
  return !!a && !!b
    && String(a.key || '') === String(b.key || '')
    && String(a.sessionIndex || '') === String(b.sessionIndex || '')
    && String(a.exerciseIndex || '') === String(b.exerciseIndex || '')
    && String(a.setIndex || '') === String(b.setIndex || '')
    && String(a.field || '') === String(b.field || '');
}

function _workoutSetKeyboardInlineTargets(sheet, input) {
  const current = _workoutSetKeyboardMeta(input);
  const rows = Array.from(sheet?.querySelectorAll?.('[data-wt-set-swipe-row]') || []);
  return rows.flatMap(row => ['kg', 'reps'].map(field => ({
    key: row.getAttribute('data-date-key') || current?.key || _workoutHomeSelectedKey,
    sessionIndex: row.getAttribute('data-session-index') || current?.sessionIndex || '0',
    exerciseIndex: row.getAttribute('data-exercise-index') || current?.exerciseIndex || '0',
    setIndex: row.getAttribute('data-set-index') || '0',
    field,
    mode: 'inline',
  })));
}

function _findWorkoutSetKeyboardMoveTarget(input, direction) {
  const active = _workoutSetKeyboardActiveInput(input);
  const sheet = _workoutSetKeyboardSheet(active);
  const step = direction === 'prev' ? -1 : 1;
  if (!active || !sheet) return null;
  const current = _workoutSetKeyboardMeta(active);
  const targets = active.hasAttribute('data-wt-set-inline-input')
    ? _workoutSetKeyboardInlineTargets(sheet, active)
    : Array.from(sheet.querySelectorAll(WORKOUT_SHEET_SET_INPUT_SELECTOR)).map(node => _workoutSetKeyboardMeta(node));
  const index = targets.findIndex(target => _sameWorkoutSetKeyboardTarget(target, current));
  if (index < 0) return null;
  const nextIndex = Math.max(0, Math.min(targets.length - 1, index + step));
  return nextIndex === index ? null : targets[nextIndex];
}

function _focusWorkoutSetKeyboardTarget(target) {
  if (!target) return false;
  if (target.mode === 'inline') {
    return _focusWorkoutSetInlineFieldFromSheet(
      target.key,
      target.sessionIndex,
      target.exerciseIndex,
      target.setIndex,
      target.field
    );
  }
  return _focusWorkoutSetEditorFieldFromSheet(
    target.key,
    target.sessionIndex,
    target.exerciseIndex,
    target.setIndex,
    target.field
  );
}

function _workoutSetKeyboardRenderedInput(target) {
  if (!target || typeof document === 'undefined') return false;
  const sheet = _workoutSetKeyboardSheet();
  const inlineKey = _workoutSetInlineFieldKey(target.key, target.sessionIndex, target.exerciseIndex, target.setIndex, target.field);
  const selector = [
    '[data-wt-set-inline-input]',
    `[data-date-key="${_workoutSheetSelectorValue(target.key || _workoutHomeSelectedKey)}"]`,
    `[data-session-index="${_workoutSheetSelectorValue(target.sessionIndex || '0')}"]`,
    `[data-exercise-index="${_workoutSheetSelectorValue(target.exerciseIndex || '0')}"]`,
    `[data-set-index="${_workoutSheetSelectorValue(target.setIndex || '0')}"]`,
    `[data-field="${_workoutSheetSelectorValue(target.field || 'kg')}"]`,
  ].join('');
  const input = inlineKey
    ? (sheet?.querySelector?.(`[data-wt-inline-editor-key="${_workoutSheetSelectorValue(inlineKey)}"]`) || sheet?.querySelector?.(selector))
    : sheet?.querySelector?.(selector);
  return input || null;
}

function _focusWorkoutSetKeyboardRenderedTarget(target) {
  const input = _workoutSetKeyboardRenderedInput(target);
  if (!input) return false;
  try { input.focus({ preventScroll: true }); }
  catch { input.focus?.(); }
  if (document.activeElement === input) _clearWorkoutSetInputOnFocus(input);
  _showWorkoutSetKeyboard(input);
  return true;
}

function _syncWorkoutSetKeyboardButtons(input = null) {
  const keyboard = _workoutSetKeyboardElement();
  const active = _workoutSetKeyboardActiveInput(input);
  if (!keyboard || !active) return;
  const field = active.getAttribute('data-field') || '';
  keyboard.querySelectorAll('[data-wt-set-keyboard-field]').forEach(node => {
    node.classList.toggle('is-active', node.getAttribute('data-wt-set-keyboard-field') === field);
  });
  const prev = keyboard.querySelector('[data-wt-set-keyboard-action="prev"]');
  const next = keyboard.querySelector('[data-wt-set-keyboard-action="next"]');
  if (prev) prev.disabled = !_findWorkoutSetKeyboardMoveTarget(active, 'prev');
  if (next) next.disabled = !_findWorkoutSetKeyboardMoveTarget(active, 'next');
}

function _ensureWorkoutSetKeyboard() {
  if (typeof document === 'undefined') return null;
  const existing = _workoutSetKeyboardElement();
  if (existing) return existing;
  const keyboard = document.createElement('div');
  keyboard.className = 'wt-set-keyboard';
  keyboard.setAttribute('data-wt-set-keyboard', '');
  keyboard.setAttribute('role', 'group');
  keyboard.setAttribute('aria-label', '운동 숫자 키보드');
  keyboard.innerHTML = `
    <div class="wt-set-keyboard-grid">
      <button type="button" data-wt-set-keyboard-key="1">1</button>
      <button type="button" data-wt-set-keyboard-key="2">2</button>
      <button type="button" data-wt-set-keyboard-key="3">3</button>
      <button type="button" class="wt-set-keyboard-tool" data-wt-set-keyboard-action="backspace" aria-label="한 글자 지우기">⌫</button>
      <button type="button" data-wt-set-keyboard-key="4">4</button>
      <button type="button" data-wt-set-keyboard-key="5">5</button>
      <button type="button" data-wt-set-keyboard-key="6">6</button>
      <button type="button" class="wt-set-keyboard-tool" data-wt-set-keyboard-action="prev" aria-label="왼쪽 입력으로 이동">‹</button>
      <button type="button" data-wt-set-keyboard-key="7">7</button>
      <button type="button" data-wt-set-keyboard-key="8">8</button>
      <button type="button" data-wt-set-keyboard-key="9">9</button>
      <button type="button" class="wt-set-keyboard-tool" data-wt-set-keyboard-action="next" aria-label="오른쪽 입력으로 이동">›</button>
      <button type="button" data-wt-set-keyboard-key=".">.</button>
      <button type="button" data-wt-set-keyboard-key="0">0</button>
      <button type="button" class="wt-set-keyboard-tool" data-wt-set-keyboard-action="clear" aria-label="전체 지우기">C</button>
      <button type="button" class="wt-set-keyboard-tool is-primary" data-wt-set-keyboard-action="done" aria-label="입력 완료">✓</button>
    </div>
  `;
  let lastKeyboardTouchAt = 0;
  const runKeyboardButton = (event) => {
    const button = event.target?.closest?.('button');
    if (!button || !keyboard.contains(button) || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const key = button.getAttribute('data-wt-set-keyboard-key');
    const action = button.getAttribute('data-wt-set-keyboard-action');
    if (key != null) {
      _applyWorkoutSetKeyboardKey(key);
      return;
    }
    if (action === 'backspace') return _applyWorkoutSetKeyboardBackspace();
    if (action === 'clear') return _applyWorkoutSetKeyboardClear();
    if (action === 'prev' || action === 'next') return _moveWorkoutSetKeyboardFocus(action);
    if (action === 'done') return _completeWorkoutSetKeyboardInput();
  };
  keyboard.addEventListener('touchstart', event => {
    lastKeyboardTouchAt = Date.now();
    runKeyboardButton(event);
  }, { passive: false });
  keyboard.addEventListener('click', event => {
    const button = event.target?.closest?.('button');
    if (!button || !keyboard.contains(button)) return;
    if (Date.now() - lastKeyboardTouchAt < 450) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    runKeyboardButton(event);
  });
  document.body.appendChild(keyboard);
  return keyboard;
}

function _showWorkoutSetKeyboard(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return;
  _workoutSetKeyboardInput = input;
  input.removeAttribute('data-wt-set-keyboard-dirty');
  input.removeAttribute('data-wt-set-keyboard-pending-value');
  input.setAttribute('data-wt-set-keyboard-cursor', String(String(input.value || '').length));
  const keyboard = _ensureWorkoutSetKeyboard();
  const sheet = _workoutSetKeyboardSheet(input);
  document.documentElement?.classList?.add('wt-set-keyboard-open');
  sheet?.classList?.add('has-set-keyboard');
  keyboard?.classList?.add('is-open');
  _syncWorkoutSetKeyboardButtons(input);
}

function _clearWorkoutSetKeyboardSurface(input = null) {
  if (typeof document === 'undefined') return;
  const keyboard = _workoutSetKeyboardElement();
  const active = _workoutSetKeyboardActiveInput(input);
  if (document.activeElement === active) active?.blur?.();
  keyboard?.remove();
  document.documentElement?.classList?.remove('wt-set-keyboard-open');
  document.querySelectorAll?.('[data-wt-day-sheet].has-set-keyboard').forEach(sheet => {
    sheet.classList.remove('has-set-keyboard');
  });
  _workoutSetKeyboardInput = null;
  _workoutSetKeyboardDomLocked = false;
}

function _hideWorkoutSetKeyboard(options = {}) {
  const input = _workoutSetKeyboardActiveInput();
  if (!input || options?.commit === false) {
    _clearWorkoutSetKeyboardSurface(input);
    return Promise.resolve(false);
  }
  _workoutSetKeyboardDomLocked = false;
  const commitPromise = Promise.resolve(_commitWorkoutSetKeyboardInput(input, { closeInline: true }));
  _clearWorkoutSetKeyboardSurface(input);
  return commitPromise;
}

function _markWorkoutSetKeyboardInputDirty(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return;
  input.setAttribute('data-wt-set-keyboard-dirty', 'true');
  input.setAttribute('data-wt-set-keyboard-pending-value', input.value ?? '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function _replaceWorkoutSetKeyboardInputValue(input, value, cursor) {
  input.value = value;
  input.setAttribute('data-wt-set-keyboard-cursor', String(Math.max(0, Math.min(String(value).length, cursor))));
  _markWorkoutSetKeyboardInputDirty(input);
  try { input.setSelectionRange(cursor, cursor); } catch {}
  _syncWorkoutSetKeyboardButtons(input);
}

function _workoutSetKeyboardCursor(input, value) {
  const stored = Number(input?.getAttribute?.('data-wt-set-keyboard-cursor'));
  if (Number.isFinite(stored)) return Math.max(0, Math.min(value.length, Math.floor(stored)));
  const selected = Number(input?.selectionStart);
  if (Number.isFinite(selected)) return Math.max(0, Math.min(value.length, Math.floor(selected)));
  return value.length;
}

function _applyWorkoutSetKeyboardKey(key) {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) return;
  const field = input.getAttribute('data-field') || '';
  if (key === '.' && (field === 'reps' || field === 'romPct')) return;
  const value = String(input.value || '');
  const start = _workoutSetKeyboardCursor(input, value);
  const end = start;
  const next = `${value.slice(0, start)}${key}${value.slice(end)}`;
  if (key === '.' && next.indexOf('.') !== next.lastIndexOf('.')) return;
  _replaceWorkoutSetKeyboardInputValue(input, next, start + key.length);
}

function _applyWorkoutSetKeyboardBackspace() {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) return;
  const value = String(input.value || '');
  const start = _workoutSetKeyboardCursor(input, value);
  const end = start;
  if (start <= 0 && end <= 0) return;
  const removeFrom = start === end ? Math.max(0, start - 1) : start;
  _replaceWorkoutSetKeyboardInputValue(input, `${value.slice(0, removeFrom)}${value.slice(end)}`, removeFrom);
}

function _applyWorkoutSetKeyboardClear() {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) return;
  _replaceWorkoutSetKeyboardInputValue(input, '', 0);
}

function _commitWorkoutSetKeyboardInput(input, options = {}) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return Promise.resolve(false);
  const dirty = input.getAttribute('data-wt-set-keyboard-dirty') === 'true';
  const pendingValue = input.getAttribute('data-wt-set-keyboard-pending-value');
  const value = pendingValue == null ? input.value : pendingValue;
  input.removeAttribute('data-wt-set-keyboard-dirty');
  input.removeAttribute('data-wt-set-keyboard-cursor');
  input.removeAttribute('data-wt-set-keyboard-pending-value');
  const nextTarget = options?.nextTarget || null;
  const nextInlineEditorKey = nextTarget?.mode === 'inline'
    ? _workoutSetInlineFieldKey(nextTarget.key, nextTarget.sessionIndex, nextTarget.exerciseIndex, nextTarget.setIndex, nextTarget.field)
    : '';
  if (!dirty) {
    if (options?.closeInline && input.hasAttribute('data-wt-set-inline-input')) {
      return _cancelWorkoutSetInlineFieldFromSheet(
        input.getAttribute('data-date-key') || _workoutHomeSelectedKey,
        input.getAttribute('data-session-index'),
        input.getAttribute('data-exercise-index'),
        input.getAttribute('data-set-index'),
        input.getAttribute('data-field')
      );
    }
    return false;
  }
  return _updateWorkoutExerciseSetFromSheet(
    input.getAttribute('data-date-key') || _workoutHomeSelectedKey,
    input.getAttribute('data-session-index'),
    input.getAttribute('data-exercise-index'),
    input.getAttribute('data-set-index'),
    input.getAttribute('data-field'),
    value,
    input,
    {
      nextInlineEditorKey,
      optimisticRender: true,
      skipRender: options?.skipRender === true,
    }
  );
}

function _commitWorkoutSetKeyboardDone(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return Promise.resolve(false);
  const meta = _workoutSetKeyboardMeta(input);
  if (!meta) return false;
  const safeField = ['kg', 'reps', 'rir', 'romPct'].includes(String(meta.field || '')) ? String(meta.field) : 'kg';
  const dirty = input.getAttribute('data-wt-set-keyboard-dirty') === 'true';
  const pendingValue = input.getAttribute('data-wt-set-keyboard-pending-value');
  const value = pendingValue == null ? input.value : pendingValue;
  input.removeAttribute('data-wt-set-keyboard-dirty');
  input.removeAttribute('data-wt-set-keyboard-cursor');
  input.removeAttribute('data-wt-set-keyboard-pending-value');
  if (input.hasAttribute('data-wt-set-inline-input')) {
    const inlineEditorKey = input.getAttribute('data-wt-inline-editor-key') || '';
    if (inlineEditorKey && _workoutInlineSetEditor === inlineEditorKey) _workoutInlineSetEditor = null;
  }
  return _mutateWorkoutExerciseFromSheet(meta.key, meta.sessionIndex, meta.exerciseIndex, (entry) => {
    const sets = Array.isArray(entry.sets) ? entry.sets : [];
    const targetIndex = Math.max(0, Math.floor(Number(meta.setIndex) || 0));
    while (sets.length <= targetIndex) sets.push(_defaultWorkoutSheetSet(sets[sets.length - 1]));
    const nextSet = { ...(sets[targetIndex] || _defaultWorkoutSheetSet(sets[sets.length - 1])) };
    if (dirty) {
      if (safeField === 'kg') nextSet.kg = _setWorkoutSheetNumber(value, _num(nextSet.kg), { min: 0, allowEmpty: true });
      if (safeField === 'reps') nextSet.reps = _setWorkoutSheetNumber(value, _num(nextSet.reps), { min: 0, integer: true, allowEmpty: true });
      if (safeField === 'rir') nextSet.rir = _setWorkoutSheetNumber(value, Number.isFinite(Number(nextSet.rir)) ? Number(nextSet.rir) : 2, { min: 0, max: 10 });
      if (safeField === 'romPct') nextSet.romPct = _setWorkoutSheetNumber(value, Number.isFinite(Number(nextSet.romPct)) ? Number(nextSet.romPct) : 100, { min: 0, max: 100, integer: true });
    }
    const wasDone = nextSet.done === true;
    nextSet.done = true;
    if (!wasDone || !Number.isFinite(Number(nextSet.completedAt))) nextSet.completedAt = Date.now();
    if (!Number.isFinite(Number(nextSet.romPct))) nextSet.romPct = 100;
    if (!Number.isFinite(Number(nextSet.rir))) nextSet.rir = 2;
    sets[targetIndex] = nextSet;
    entry.sets = sets;
    clearWorkoutExerciseCompletionMarker(entry);
    return true;
  }, { preserveSheetScroll: true, optimisticRender: true });
}

function _completeWorkoutSetKeyboardInput() {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) {
    _clearWorkoutSetKeyboardSurface(input);
    return Promise.resolve(false);
  }
  _workoutSetKeyboardDomLocked = false;
  const commitPromise = Promise.resolve(_commitWorkoutSetKeyboardDone(input))
    .catch((e) => {
      console.warn('[workout-calendar] set keyboard complete failed:', e);
      showToast('세트 완료에 실패했어요', 2200, 'error');
      return false;
    });
  _clearWorkoutSetKeyboardSurface(input);
  return commitPromise;
}

function _moveWorkoutSetKeyboardFocus(direction) {
  const input = _workoutSetKeyboardActiveInput();
  const target = _findWorkoutSetKeyboardMoveTarget(input, direction);
  if (!input || !target) return false;
  const inlineMove = input.hasAttribute('data-wt-set-inline-input') && target.mode === 'inline';
  const targetAlreadyMounted = inlineMove && !!_workoutSetKeyboardRenderedInput(target);
  if (targetAlreadyMounted) _workoutSetKeyboardDomLocked = true;
  if (inlineMove) _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-inline-field' });
  const commitPromise = Promise.resolve(_commitWorkoutSetKeyboardInput(input, {
    closeInline: false,
    nextTarget: target,
    skipRender: targetAlreadyMounted,
  }));
  const focusRenderedTarget = () => {
    if (_focusWorkoutSetKeyboardRenderedTarget(target)) return true;
    window.requestAnimationFrame?.(() => _focusWorkoutSetKeyboardRenderedTarget(target));
    window.setTimeout?.(() => _focusWorkoutSetKeyboardRenderedTarget(target), 80);
    return false;
  };
  if (!inlineMove) _focusWorkoutSetKeyboardTarget(target);
  else if (targetAlreadyMounted) _focusWorkoutSetKeyboardRenderedTarget(target);
  else focusRenderedTarget();
  commitPromise.then(() => {
    if (inlineMove && !targetAlreadyMounted) _focusWorkoutSetKeyboardRenderedTarget(target);
  }).catch((e) => {
    console.warn('[workout-calendar] set keyboard move failed:', e);
  });
  return true;
}

function _bindWorkoutSetSwipeDelete(sheet) {
  if (!sheet || sheet.__wtSetSwipeDeleteBound) return;
  sheet.__wtSetSwipeDeleteBound = true;
  let swipe = null;
  const resetRow = (row) => {
    if (!row) return;
    row.classList.remove('is-swiping', 'is-swipe-delete-ready', 'is-swipe-delete-left', 'is-swipe-delete-right');
    row.style.transform = '';
  };
  const interactiveSelector = [
    'input',
    'select',
    'textarea',
    'label',
    '[data-wt-set-type-menu]',
  ].join(',');
  sheet.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (target?.closest?.(interactiveSelector)) return;
    const row = target?.closest?.('[data-wt-set-swipe-row]');
    if (!row || !sheet.contains(row)) return;
    const touch = event.touches[0];
    swipe = {
      row,
      startX: touch.clientX,
      startY: touch.clientY,
      dx: 0,
      dy: 0,
      active: false,
    };
  }, { passive: true, capture: true });
  sheet.addEventListener('touchmove', (event) => {
    if (!swipe || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - swipe.startX;
    const dy = touch.clientY - swipe.startY;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    swipe.dx = dx;
    swipe.dy = dy;
    if (!swipe.active && (dx >= 0 || ax < 8 || ax <= ay)) return;
    swipe.active = true;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const offset = Math.max(-76, Math.min(0, dx));
    const ready = dx <= -64 && ax > ay * 1.2;
    swipe.row.classList.add('is-swiping');
    swipe.row.classList.toggle('is-swipe-delete-left', dx < 0);
    swipe.row.classList.remove('is-swipe-delete-right');
    swipe.row.classList.toggle('is-swipe-delete-ready', ready);
    swipe.row.style.transform = `translateX(${offset}px)`;
  }, { passive: false, capture: true });
  const finish = () => {
    if (!swipe) return;
    const current = swipe;
    swipe = null;
    const accepted = current.active && current.dx <= -64 && Math.abs(current.dx) > Math.abs(current.dy) * 1.2;
    if (!accepted) {
      resetRow(current.row);
      return;
    }
    current.row.classList.remove('is-swiping');
    Promise.resolve(_removeWorkoutExerciseSetFromSheet(
      current.row.getAttribute('data-date-key') || _workoutHomeSelectedKey,
      current.row.getAttribute('data-session-index'),
      current.row.getAttribute('data-exercise-index'),
      current.row.getAttribute('data-set-index')
    )).catch((e) => {
      resetRow(current.row);
      console.warn('[workout-calendar] set swipe remove action failed:', e);
    });
  };
  sheet.addEventListener('touchend', finish, { passive: true, capture: true });
  sheet.addEventListener('touchcancel', () => {
    if (swipe) resetRow(swipe.row);
    swipe = null;
  }, { passive: true, capture: true });
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

function _workoutHomeSheetEventTarget(event) {
  return event?.target instanceof Element ? event.target : event?.target?.parentElement;
}

function _workoutHomeSheetEventHitsCarousel(event) {
  return !!_workoutHomeSheetEventTarget(event)?.closest?.('[data-wt-day-exercise-carousel-track]');
}

function _workoutHomeSheetHasHorizontalIntent(deltaX, deltaY) {
  const ax = Math.abs(Number(deltaX) || 0);
  const ay = Math.abs(Number(deltaY) || 0);
  return ax >= 4 && ax > ay;
}

function _workoutHomeSheetCarouselShouldOwnTouch(event, dx, dy) {
  return _workoutHomeSheetEventHitsCarousel(event) && _workoutHomeSheetHasHorizontalIntent(dx, dy);
}

function _workoutHomeSheetCarouselShouldOwnWheel(event) {
  return _workoutHomeSheetEventHitsCarousel(event)
    && _workoutHomeSheetHasHorizontalIntent(Number(event?.deltaX) || 0, Number(event?.deltaY) || 0);
}

function _workoutHomeSheetTouchWouldChain(scroller, dy) {
  const scrollTop = Math.max(0, Number(scroller?.scrollTop) || 0);
  const maxScrollTop = Math.max(0, (Number(scroller?.scrollHeight) || 0) - (Number(scroller?.clientHeight) || 0));
  if (maxScrollTop <= 0) return true;
  if (dy > 0 && scrollTop <= 0) return true;
  return dy < 0 && scrollTop >= maxScrollTop - 1;
}

function _workoutHomeSheetWheelWouldChain(scroller, deltaY) {
  const scrollTop = Math.max(0, Number(scroller?.scrollTop) || 0);
  const maxScrollTop = Math.max(0, (Number(scroller?.scrollHeight) || 0) - (Number(scroller?.clientHeight) || 0));
  if (maxScrollTop <= 0) return true;
  if (deltaY < 0 && scrollTop <= 0) return true;
  return deltaY > 0 && scrollTop >= maxScrollTop - 1;
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
    const btn = target?.closest?.('[data-cal-cycle-target]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    Promise.resolve(_openWorkoutCycleTargetSettings(btn.getAttribute('data-cal-cycle-target'))).catch((e) => {
      console.warn('[workout-calendar] cycle target click failed:', e);
    });
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
    if (_workoutEditingCardId === cardId) _workoutEditingCardId = null;
  }
  renderWorkoutCalendarHome();
}

function _editWorkoutExerciseCard(cardId) {
  if (!cardId) return;
  _workoutEditingCardId = cardId;
  _workoutDetailCollapsed.delete(cardId);
  renderWorkoutCalendarHome();
}

function _finishWorkoutExerciseEdit(cardId) {
  if (!cardId || _workoutEditingCardId === cardId) _workoutEditingCardId = null;
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
  _workoutInlineSetEditor = inlineKey;
  _workoutHomeSelectedKey = targetKey;
  _workoutHomeSessionIndex = targetSessionIndex;
  _workoutHomeSheetState = 'full';
  _syncWorkoutHomeNavState({ history: 'replace', action: 'sheet:set-inline-field' });
  if (!shouldCommitActiveInput) renderWorkoutCalendarHome();
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
  if (!inlineKey || _workoutInlineSetEditor !== inlineKey) return false;
  const restoreState = _captureWorkoutSheetScrollState();
  _workoutInlineSetEditor = null;
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
  _workoutInlineSetEditor = null;
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
  _workoutInlineSetEditor = null;
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
  _workoutInlineSetEditor = null;
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
  if (isInlineSource && inlineEditorKey && _workoutInlineSetEditor === inlineEditorKey && options?.preserveInlineEditor !== true) {
    _workoutInlineSetEditor = nextInlineEditorKey || null;
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
    if (_workoutEditingCardId === cardId) _workoutEditingCardId = null;
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

function _formatWorkoutExportText(key, sessionIndex, session, wx, { heading = null } = {}) {
  const lines = [
    heading || `${_dateTitle(key)} ${_sessionLabel(sessionIndex)}`,
    `운동시간: ${_formatDuration(wx.durationSec)}`,
  ];
  if (wx.setCount > 0) lines.push(`총 세트: ${wx.setCount}세트`);
  if (wx.volume > 0) lines.push(`총 볼륨: ${formatWorkoutTrackValue('M', wx.volume)}`);
  if (wx.burned?.total > 0) lines.push(`소모: ${wx.burned.total} kcal`);

  wx.exercises.forEach((row) => {
    lines.push('', `${row.name}${row.majorName ? ` (${row.majorName})` : ''}`);
    if (row.cardio) {
      lines.push(`- 유산소: ${_cardioSummaryText(row.cardio)}`);
      if (row.note) lines.push(`- 메모: ${row.note}`);
      return;
    }
    row.setTexts.forEach((text, i) => lines.push(`- ${i + 1}세트: ${text}`));
    if (row.note) lines.push(`- 메모: ${row.note}`);
  });

  wx.activities.forEach((row) => {
    lines.push('', `${row.label}${row.main ? `: ${row.main}` : ''}`);
    if (row.detail) lines.push(`- 메모: ${row.detail}`);
  });

  const memo = String(session?.memo || '').trim();
  if (memo) lines.push('', `운동 메모: ${memo}`);
  return lines.join('\n');
}

async function _shareOrCopyText(text, title) {
  const nav = window.navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, text });
      return 'share';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancel';
    }
  }
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return 'clipboard';
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('clipboard fallback failed');
  return 'clipboard';
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
function _workoutDayExportBlocks(key, context) {
  const { lookup, checkins, plan } = context;
  const day = _workoutHomeDay(key);
  const sessions = getWorkoutSessions(day, { minCount: WORKOUT_RUNNING_SESSION_INDEX + 1 });
  const bodyWeight = _weightAt(checkins, key) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
  const blocks = [];

  sessions.slice(0, WORKOUT_GYM_SESSION_COUNT).forEach((raw, index) => {
    const session = clearRunningSessionFields(raw);
    if (!hasWorkoutSessionData(session)) return;
    const wx = _workoutMetrics(key, session, bodyWeight, lookup);
    blocks.push(_formatWorkoutExportText(key, index, session, wx, { heading: `[${_sessionLabel(index)}]` }));
  });

  const runningInfo = runningTrackSessionInfo(sessions);
  if (runningInfo.hasRecord) {
    const stack = runningStackSession(
      { session: runningInfo.session, activities: runningInfo.runningSessions },
      _activityRows,
    );
    const wx = _workoutMetrics(key, stack.session, bodyWeight, lookup);
    if (stack.rows.length) {
      const activityDurationSec = stack.rows.reduce((sum, row) => sum + (row.durationSec || 0), 0);
      wx.activities = stack.rows;
      wx.durationSec = Math.max(wx.durationSec || 0, activityDurationSec);
    }
    blocks.push(_formatWorkoutExportText(key, WORKOUT_RUNNING_SESSION_INDEX, stack.session, wx, { heading: '[러닝]' }));
  }

  return blocks;
}

function _weekKeysFor(key) {
  const parsed = _parseDateKey(key);
  if (!parsed) return [];
  const mondayOffset = (new Date(parsed.y, parsed.m, parsed.d).getDay() + 6) % 7;
  const monday = _shiftDateKey(key, -mondayOffset);
  return Array.from({ length: 7 }, (_, offset) => _shiftDateKey(monday, offset));
}

function _buildWorkoutRecordsExport(key, scope) {
  const context = { lookup: _buildWorkoutLookup(), checkins: _sortedCheckins(), plan: getDietPlan() || null };
  const keys = scope === 'week' ? _weekKeysFor(key) : [key];
  const days = keys
    .map(dayKey => ({ dayKey, blocks: _workoutDayExportBlocks(dayKey, context) }))
    .filter(entry => entry.blocks.length);
  if (!days.length) return null;

  const heading = scope === 'week'
    ? `${_dateTitle(keys[0])} ~ ${_dateTitle(keys[keys.length - 1])} 운동 기록`
    : `${_dateTitle(key)} 운동 기록`;
  const body = days
    .map(entry => [`■ ${_dateTitle(entry.dayKey)}`, ...entry.blocks].join('\n\n'))
    .join('\n\n');
  return { title: heading, text: `${heading}\n\n${body}` };
}

async function _copyTextToClipboard(text) {
  const clipboard = window.navigator?.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('clipboard write failed');
}

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
    _workoutEditingCardId = null;
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
