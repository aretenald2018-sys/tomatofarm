import { toFiniteNumber as _num } from '../utils/number.js';
import { showToast } from '../ui/toast.js';
import { clearWorkoutExerciseCompletionMarker } from '../workout/exercise-completion.js';
import {
  WORKOUT_SHEET_SET_INPUT_SELECTOR,
  _workoutHomeScrollRoot,
  _workoutSheetSelectorValue,
} from './sheet-state.js';
import {
  _workoutSetInlineFieldKey,
  workoutDetailState,
} from './detail-template.js';

const workoutSetKeyboardRuntime = {
  cancelInlineField: () => false,
  getSelectedKey: () => '',
  clearInputOnFocus: () => {},
  defaultSet: () => ({ kg: '', reps: '', rir: 2, romPct: 100, setType: 'main', done: false }),
  focusEditorField: () => false,
  focusInlineField: () => false,
  mutateExercise: () => Promise.resolve(false),
  removeExerciseSet: () => Promise.resolve(false),
  setWorkoutSheetNumber: value => value,
  syncNavState: () => {},
  updateExerciseSet: () => Promise.resolve(false),
};

export const workoutSetKeyboardState = {
  input: null,
  domLocked: false,
};

export function configureWorkoutSetKeyboard(runtime = {}) {
  Object.assign(workoutSetKeyboardRuntime, runtime);
}

export function _workoutSetKeyboardElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('[data-wt-set-keyboard]');
}

export function _workoutSetKeyboardSheet(input = null) {
  if (typeof document === 'undefined') return null;
  const source = input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)
    ? input
    : workoutSetKeyboardState.input?.isConnected && workoutSetKeyboardState.input.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)
      ? workoutSetKeyboardState.input
      : null;
  return source?.closest?.('[data-wt-day-sheet]')
    || document.querySelector?.('#workout-calendar-root [data-wt-day-sheet]')
    || document.querySelector?.('[data-wt-day-sheet]');
}

export function _workoutSetKeyboardActiveInput(input = null) {
  if (input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return input;
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (active?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return active;
  if (workoutSetKeyboardState.input?.isConnected && workoutSetKeyboardState.input.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) {
    return workoutSetKeyboardState.input;
  }
  return null;
}

export function _workoutSetKeyboardMeta(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return null;
  return {
    key: input.getAttribute('data-date-key') || workoutSetKeyboardRuntime.getSelectedKey(),
    sessionIndex: input.getAttribute('data-session-index') || '0',
    exerciseIndex: input.getAttribute('data-exercise-index') || '0',
    setIndex: input.getAttribute('data-set-index') || '0',
    field: input.getAttribute('data-field') || 'kg',
    mode: input.hasAttribute('data-wt-set-inline-input') ? 'inline' : 'editor',
  };
}

export function _sameWorkoutSetKeyboardTarget(a, b) {
  return !!a && !!b
    && String(a.key || '') === String(b.key || '')
    && String(a.sessionIndex || '') === String(b.sessionIndex || '')
    && String(a.exerciseIndex || '') === String(b.exerciseIndex || '')
    && String(a.setIndex || '') === String(b.setIndex || '')
    && String(a.field || '') === String(b.field || '');
}

export function _workoutSetKeyboardInlineTargets(sheet, input) {
  const current = _workoutSetKeyboardMeta(input);
  const rows = Array.from(sheet?.querySelectorAll?.('[data-wt-set-swipe-row]') || []);
  return rows.flatMap(row => ['kg', 'reps'].map(field => ({
    key: row.getAttribute('data-date-key') || current?.key || workoutSetKeyboardRuntime.getSelectedKey(),
    sessionIndex: row.getAttribute('data-session-index') || current?.sessionIndex || '0',
    exerciseIndex: row.getAttribute('data-exercise-index') || current?.exerciseIndex || '0',
    setIndex: row.getAttribute('data-set-index') || '0',
    field,
    mode: 'inline',
  })));
}

export function _findWorkoutSetKeyboardMoveTarget(input, direction) {
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

export function _focusWorkoutSetKeyboardTarget(target) {
  if (!target) return false;
  if (target.mode === 'inline') {
    return workoutSetKeyboardRuntime.focusInlineField(
      target.key,
      target.sessionIndex,
      target.exerciseIndex,
      target.setIndex,
      target.field
    );
  }
  return workoutSetKeyboardRuntime.focusEditorField(
    target.key,
    target.sessionIndex,
    target.exerciseIndex,
    target.setIndex,
    target.field
  );
}

export function _workoutSetKeyboardRenderedInput(target) {
  if (!target || typeof document === 'undefined') return false;
  const sheet = _workoutSetKeyboardSheet();
  const inlineKey = _workoutSetInlineFieldKey(target.key, target.sessionIndex, target.exerciseIndex, target.setIndex, target.field);
  const selector = [
    '[data-wt-set-inline-input]',
    `[data-date-key="${_workoutSheetSelectorValue(target.key || workoutSetKeyboardRuntime.getSelectedKey())}"]`,
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

export function _focusWorkoutSetKeyboardRenderedTarget(target) {
  const input = _workoutSetKeyboardRenderedInput(target);
  if (!input) return false;
  try { input.focus({ preventScroll: true }); }
  catch { input.focus?.(); }
  if (document.activeElement === input) workoutSetKeyboardRuntime.clearInputOnFocus(input);
  _showWorkoutSetKeyboard(input);
  return true;
}

export function _syncWorkoutSetKeyboardButtons(input = null) {
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

export function _ensureWorkoutSetKeyboard() {
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

export function _showWorkoutSetKeyboard(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return;
  workoutSetKeyboardState.input = input;
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

export function _clearWorkoutSetKeyboardSurface(input = null) {
  if (typeof document === 'undefined') return;
  const keyboard = _workoutSetKeyboardElement();
  const active = _workoutSetKeyboardActiveInput(input);
  if (document.activeElement === active) active?.blur?.();
  keyboard?.remove();
  document.documentElement?.classList?.remove('wt-set-keyboard-open');
  document.querySelectorAll?.('[data-wt-day-sheet].has-set-keyboard').forEach(sheet => {
    sheet.classList.remove('has-set-keyboard');
  });
  workoutSetKeyboardState.input = null;
  workoutSetKeyboardState.domLocked = false;
}

export function _hideWorkoutSetKeyboard(options = {}) {
  const input = _workoutSetKeyboardActiveInput();
  if (!input || options?.commit === false) {
    _clearWorkoutSetKeyboardSurface(input);
    return Promise.resolve(false);
  }
  workoutSetKeyboardState.domLocked = false;
  const commitPromise = Promise.resolve(_commitWorkoutSetKeyboardInput(input, { closeInline: true }));
  _clearWorkoutSetKeyboardSurface(input);
  return commitPromise;
}

export function _markWorkoutSetKeyboardInputDirty(input) {
  if (!input?.matches?.(WORKOUT_SHEET_SET_INPUT_SELECTOR)) return;
  input.setAttribute('data-wt-set-keyboard-dirty', 'true');
  input.setAttribute('data-wt-set-keyboard-pending-value', input.value ?? '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function _replaceWorkoutSetKeyboardInputValue(input, value, cursor) {
  input.value = value;
  input.setAttribute('data-wt-set-keyboard-cursor', String(Math.max(0, Math.min(String(value).length, cursor))));
  _markWorkoutSetKeyboardInputDirty(input);
  try { input.setSelectionRange(cursor, cursor); } catch {}
  _syncWorkoutSetKeyboardButtons(input);
}

export function _workoutSetKeyboardCursor(input, value) {
  const stored = Number(input?.getAttribute?.('data-wt-set-keyboard-cursor'));
  if (Number.isFinite(stored)) return Math.max(0, Math.min(value.length, Math.floor(stored)));
  const selected = Number(input?.selectionStart);
  if (Number.isFinite(selected)) return Math.max(0, Math.min(value.length, Math.floor(selected)));
  return value.length;
}

export function _applyWorkoutSetKeyboardKey(key) {
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

export function _applyWorkoutSetKeyboardBackspace() {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) return;
  const value = String(input.value || '');
  const start = _workoutSetKeyboardCursor(input, value);
  const end = start;
  if (start <= 0 && end <= 0) return;
  const removeFrom = start === end ? Math.max(0, start - 1) : start;
  _replaceWorkoutSetKeyboardInputValue(input, `${value.slice(0, removeFrom)}${value.slice(end)}`, removeFrom);
}

export function _applyWorkoutSetKeyboardClear() {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) return;
  _replaceWorkoutSetKeyboardInputValue(input, '', 0);
}

export function _commitWorkoutSetKeyboardInput(input, options = {}) {
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
      return workoutSetKeyboardRuntime.cancelInlineField(
        input.getAttribute('data-date-key') || workoutSetKeyboardRuntime.getSelectedKey(),
        input.getAttribute('data-session-index'),
        input.getAttribute('data-exercise-index'),
        input.getAttribute('data-set-index'),
        input.getAttribute('data-field')
      );
    }
    return false;
  }
  return workoutSetKeyboardRuntime.updateExerciseSet(
    input.getAttribute('data-date-key') || workoutSetKeyboardRuntime.getSelectedKey(),
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

export function _commitWorkoutSetKeyboardDone(input) {
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
    if (inlineEditorKey && workoutDetailState.inlineSetEditor === inlineEditorKey) workoutDetailState.inlineSetEditor = null;
  }
  return workoutSetKeyboardRuntime.mutateExercise(meta.key, meta.sessionIndex, meta.exerciseIndex, (entry) => {
    const sets = Array.isArray(entry.sets) ? entry.sets : [];
    const targetIndex = Math.max(0, Math.floor(Number(meta.setIndex) || 0));
    while (sets.length <= targetIndex) sets.push(workoutSetKeyboardRuntime.defaultSet(sets[sets.length - 1]));
    const nextSet = { ...(sets[targetIndex] || workoutSetKeyboardRuntime.defaultSet(sets[sets.length - 1])) };
    if (dirty) {
      if (safeField === 'kg') nextSet.kg = workoutSetKeyboardRuntime.setWorkoutSheetNumber(value, _num(nextSet.kg), { min: 0, allowEmpty: true });
      if (safeField === 'reps') nextSet.reps = workoutSetKeyboardRuntime.setWorkoutSheetNumber(value, _num(nextSet.reps), { min: 0, integer: true, allowEmpty: true });
      if (safeField === 'rir') nextSet.rir = workoutSetKeyboardRuntime.setWorkoutSheetNumber(value, Number.isFinite(Number(nextSet.rir)) ? Number(nextSet.rir) : 2, { min: 0, max: 10 });
      if (safeField === 'romPct') nextSet.romPct = workoutSetKeyboardRuntime.setWorkoutSheetNumber(value, Number.isFinite(Number(nextSet.romPct)) ? Number(nextSet.romPct) : 100, { min: 0, max: 100, integer: true });
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

export function _completeWorkoutSetKeyboardInput() {
  const input = _workoutSetKeyboardActiveInput();
  if (!input) {
    _clearWorkoutSetKeyboardSurface(input);
    return Promise.resolve(false);
  }
  workoutSetKeyboardState.domLocked = false;
  const commitPromise = Promise.resolve(_commitWorkoutSetKeyboardDone(input))
    .catch((e) => {
      console.warn('[workout-calendar] set keyboard complete failed:', e);
      showToast('세트 완료에 실패했어요', 2200, 'error');
      return false;
    });
  _clearWorkoutSetKeyboardSurface(input);
  return commitPromise;
}

export function _moveWorkoutSetKeyboardFocus(direction) {
  const input = _workoutSetKeyboardActiveInput();
  const target = _findWorkoutSetKeyboardMoveTarget(input, direction);
  if (!input || !target) return false;
  const inlineMove = input.hasAttribute('data-wt-set-inline-input') && target.mode === 'inline';
  const targetAlreadyMounted = inlineMove && !!_workoutSetKeyboardRenderedInput(target);
  if (targetAlreadyMounted) workoutSetKeyboardState.domLocked = true;
  if (inlineMove) workoutSetKeyboardRuntime.syncNavState({ history: 'replace', action: 'sheet:set-inline-field' });
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

export function _bindWorkoutSetSwipeDelete(sheet) {
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
    Promise.resolve(workoutSetKeyboardRuntime.removeExerciseSet(
      current.row.getAttribute('data-date-key') || workoutSetKeyboardRuntime.getSelectedKey(),
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
