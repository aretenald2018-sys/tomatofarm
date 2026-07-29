import { parseDateKey as _parseDateKey } from '../utils/date-key.js';

const workoutSheetStateRuntime = {
  getSelectedKey: () => '',
  getSessionIndex: () => 0,
};

export const WORKOUT_SHEET_SET_INPUT_SELECTOR = '[data-wt-set-input]';
export const _workoutSheetCarouselSnapshots = new Map();
export const _workoutSheetPendingCarouselFocus = new Map();

export function configureWorkoutSheetState(runtime = {}) {
  Object.assign(workoutSheetStateRuntime, runtime);
}

export function _workoutHomeScrollRoot() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('workout-calendar-root');
}

export function _workoutSheetSelectorValue(value) {
  const text = String(value ?? '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function _workoutSheetScrollState(input = null) {
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

export function _captureWorkoutSheetCarouselState(sheet = null) {
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

export function _restoreWorkoutSheetCarouselState(sheet = null, state = null) {
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

export function _restoreWorkoutSheetCarouselToSlide(slideIndex = null, options = {}) {
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
    _rememberWorkoutSheetCarouselSlide(options?.key ?? workoutSheetStateRuntime.getSelectedKey(), options?.sessionIndex ?? workoutSheetStateRuntime.getSessionIndex(), index);
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

export function _workoutSheetCarouselSnapshotKey(key = workoutSheetStateRuntime.getSelectedKey(), sessionIndex = workoutSheetStateRuntime.getSessionIndex()) {
  const targetKey = _parseDateKey(key) ? key : workoutSheetStateRuntime.getSelectedKey();
  const targetSessionIndex = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  return `${targetKey}::${targetSessionIndex}`;
}

export function _rememberWorkoutSheetCarouselSlide(key = workoutSheetStateRuntime.getSelectedKey(), sessionIndex = workoutSheetStateRuntime.getSessionIndex(), slideIndex = null) {
  if (!Number.isFinite(Number(slideIndex))) return null;
  const index = Math.max(0, Math.floor(Number(slideIndex)));
  const state = {
    carouselSlideIndex: index,
    carouselScrollLeft: null,
  };
  _workoutSheetCarouselSnapshots.set(_workoutSheetCarouselSnapshotKey(key, sessionIndex), state);
  return state;
}

export function _rememberWorkoutSheetCarouselState(key = workoutSheetStateRuntime.getSelectedKey(), sessionIndex = workoutSheetStateRuntime.getSessionIndex(), sheet = null) {
  if (typeof document === 'undefined') return null;
  const root = _workoutHomeScrollRoot();
  const targetSheet = sheet
    || root?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  const state = _captureWorkoutSheetCarouselState(targetSheet);
  if (!state || !Number.isFinite(Number(state.slideIndex))) return null;
  return _rememberWorkoutSheetCarouselSlide(key, sessionIndex, state.slideIndex);
}

export function _restoreRememberedWorkoutSheetCarousel(key = workoutSheetStateRuntime.getSelectedKey(), sessionIndex = workoutSheetStateRuntime.getSessionIndex()) {
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

export function _rememberRenderedWorkoutSheetCarousel(root = null) {
  if (typeof document === 'undefined') return;
  const targetRoot = root || _workoutHomeScrollRoot();
  const sheet = targetRoot?.querySelector?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]');
  if (!sheet) return;
  const key = sheet.querySelector?.('[data-wt-sheet-main][data-date-key]')?.getAttribute('data-date-key')
    || workoutSheetStateRuntime.getSelectedKey();
  const sessionIndex = sheet.querySelector?.('[data-session-index]')?.getAttribute('data-session-index');
  _rememberWorkoutSheetCarouselState(
    key,
    sessionIndex == null ? workoutSheetStateRuntime.getSessionIndex() : sessionIndex,
    sheet,
  );
}

export function _requestWorkoutSheetPendingCarouselFocus(key, sessionIndex, slideIndex) {
  if (!Number.isFinite(Number(slideIndex))) return false;
  const index = Math.max(0, Math.floor(Number(slideIndex)));
  _workoutSheetPendingCarouselFocus.set(_workoutSheetCarouselSnapshotKey(key, sessionIndex), {
    slideIndex: index,
  });
  return true;
}

export function _tryRestorePendingWorkoutSheetCarouselFocus(key = workoutSheetStateRuntime.getSelectedKey(), sessionIndex = workoutSheetStateRuntime.getSessionIndex()) {
  const pending = _workoutSheetPendingCarouselFocus.get(_workoutSheetCarouselSnapshotKey(key, sessionIndex));
  if (!pending) return false;
  if (!_restoreWorkoutSheetCarouselToSlide(pending.slideIndex, { key, sessionIndex })) return false;
  _workoutSheetPendingCarouselFocus.delete(_workoutSheetCarouselSnapshotKey(key, sessionIndex));
  return true;
}

export function _workoutSheetInputSelection(input) {
  try {
    return {
      selectionStart: Number.isFinite(Number(input?.selectionStart)) ? Number(input.selectionStart) : null,
      selectionEnd: Number.isFinite(Number(input?.selectionEnd)) ? Number(input.selectionEnd) : null,
    };
  } catch {
    return { selectionStart: null, selectionEnd: null };
  }
}

export function _captureWorkoutSheetInputState(sourceInput = null, options = {}) {
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

export function _captureWorkoutSheetScrollState() {
  const state = _workoutSheetScrollState();
  return state ? { ...state, hasInput: false } : null;
}

export function _waitWorkoutSheetFocusTransition() {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(done);
    else done();
  });
}

export function _restoreWorkoutSheetScrollState(state) {
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

export function _positionOpenWorkoutSetTypeMenu() {
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

export function _restoreWorkoutSheetInputState(state) {
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

export function _workoutHomeScrollTop() {
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
