import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readWorkoutRir, stepWorkoutRir } from '../calendar/rir-stepper.js';
import { getWorkoutSessions, upsertWorkoutSession } from '../workout/sessions.js';
import { moveWorkoutExerciseCard } from '../workout/exercise-card-order.js';

const calendar = readFileSync(new URL('../render-calendar.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../calendar/detail-template.js', import.meta.url), 'utf8');
const keyboard = readFileSync(new URL('../calendar/set-keyboard.js', import.meta.url), 'utf8');
const readModel = readFileSync(new URL('../calendar/workout-read-model.js', import.meta.url), 'utf8');
function extract(source, name) {
  const start = source.indexOf(source.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`);
  assert.ok(start >= 0, name);
  const brace = source.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Cannot extract ${name}`);
}
const plain = value => JSON.parse(JSON.stringify(value));

function harness({ value = 2.25, delay = false, fail = false } = {}) {
  const context = vm.createContext({ readWorkoutRir, stepWorkoutRir, getWorkoutSessions, upsertWorkoutSession, moveWorkoutExerciseCard, structuredClone, config: { value, delay, fail } });
  vm.runInContext(`
    const key = '2026-10-03';
    let _workoutHomeSelectedKey = key, _workoutHomeSessionIndex = 0, _workoutHomeView = 'detail', _workoutRirGesture = null;
    const WORKOUT_SHEET_SET_INPUT_SELECTOR = '[data-wt-set-input]';
    const workoutDetailState = { inlineSetEditor: null };
    const _workoutDetailCollapsed = new Set();
    const workoutSetKeyboardState = { input: null };
    const saved = [], acks = [], events = [], notices = [], timers = new Map();
    let timerId = 0, now = 1000000, renders = 0, commits = 0, hides = 0;
    const Date = { now: () => now };
    const window = { setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout(id) { timers.delete(id); } };
    class Element {
      constructor(attrs = {}) { this.attrs = { ...attrs }; this.isConnected = true; this.disabled = false; this.value = ''; this.textContent = ''; this.classes = new Set(); this.classList = { toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name) }; }
      getAttribute(name) { return Object.hasOwn(this.attrs, name) ? String(this.attrs[name]) : null; }
      setAttribute(name, value) { this.attrs[name] = String(value); }
      removeAttribute(name) { delete this.attrs[name]; }
      hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
      matches(selector) { return selector === WORKOUT_SHEET_SET_INPUT_SELECTOR && this.hasAttribute('data-wt-set-input'); }
      closest(selector) { if (selector === WORKOUT_SHEET_SET_INPUT_SELECTOR && this.matches(selector)) return this; if (selector === '[data-wt-set-rir-step]' && this.hasAttribute('data-wt-set-rir-step')) return this; if (selector === '[data-wt-set-rir-row]') return this.rirRow || null; return null; }
    }
    const document = { activeElement: null, dispatchEvent(event) { events.push(event.detail); } };
    class CustomEvent { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } }
    const entries = ['A', 'B'].map(exerciseId => ({ exerciseId, exerciseCompletedAt: 9876, recommendationMeta: { track: 'H', keep: true }, unknown: { retain: true }, sets: [
      { kg: 70, reps: 8, done: true, completedAt: 1234, rir: config.value, rpe: 7.5, romPct: 85, setType: 'main', restStartedAt: '2026-10-03T00:00:00Z', restPlannedSec: 90, restElapsedSec: 15, restEndedBy: 'skip', unknown: 'keep' },
      { kg: 30, reps: 12, done: false, rir: null, setType: 'drop' },
    ] }));
    const cache = { [key]: { breakfast: 'keep', exercises: structuredClone(entries), workoutSessions: [{ id: 's1', exercises: structuredClone(entries), workoutPhoto: 'keep-photo' }, { id: 's2', exercises: [], memo: 'keep' }], restBetweenSets: [{ exerciseId: 'A', entryIdx: 0, setIdx: 0, startedAt: '2026-10-03T00:00:00Z', elapsedSec: 15 }] } };
    const S = { workout: { exercises: structuredClone(entries), restTimer: { origin: { exerciseId: 'A', entryIdx: 0, setIdx: 0 }, startedAt: 123, running: true, remaining: 60 } } };
    const listeners = {};
    const sheet = { contains: node => node.isConnected, querySelector: () => null, addEventListener(type, fn) { listeners[type] = fn; } };
    const root = { querySelector: () => sheet };
    const controls = [];
    function makeControl(index = 0, setIndex = 0, direction = 1) {
      const attrs = { 'data-date-key': key, 'data-session-index': 0, 'data-exercise-index': index, 'data-set-index': setIndex };
      const button = new Element({ ...attrs, 'data-wt-set-rir-step': direction });
      const other = new Element({ ...attrs, 'data-wt-set-rir-step': -direction });
      const output = new Element();
      const rirInput = new Element({ ...attrs, 'data-wt-set-input': '', 'data-field': 'rir' });
      const setRow = { querySelectorAll: () => [rirInput] };
      const row = new Element(attrs);
      row.querySelector = () => output; row.querySelectorAll = () => [button, other]; row.closest = () => setRow;
      button.rirRow = row; other.rirRow = row;
      controls.push({ button, row, output, rirInput });
      return button;
    }
    function input(field = 'kg', value = '77', index = 0) {
      const node = new Element({ 'data-wt-set-input': '', 'data-date-key': key, 'data-session-index': 0, 'data-exercise-index': index, 'data-set-index': 0, 'data-field': field, 'data-wt-set-keyboard-dirty': 'true', 'data-wt-set-keyboard-pending-value': value, 'data-wt-set-keyboard-cursor': String(value.length) });
      node.value = value; document.activeElement = node; workoutSetKeyboardState.input = node; return node;
    }
    function saveDay(targetKey, payload, options) { saved.push({ targetKey, payload: structuredClone(payload), options }); if (config.fail) return Promise.reject(new Error('synthetic failure')); return config.delay ? new Promise(resolve => acks.push(resolve)) : Promise.resolve({ state: 'synced' }); }
    function _syncWorkoutHomeSavedSessionState(targetKey, result, index) { S.workout.exercises = structuredClone(result.workoutSessions[index].exercises); }
    const getCache = () => cache, _workoutHomeDay = targetKey => cache[targetKey];
    const _workoutSessionSavePayload = result => ({ ...result.aggregate, workoutSessions: result.workoutSessions });
    const _mealOkPatchForWorkoutHomeDay = () => ({});
    const _workoutHomeSessionAt = (targetKey, index) => ({ day: cache[targetKey], session: getWorkoutSessions(cache[targetKey])[index], index });
    const _parseDateKey = value => /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
    const _clonePlain = structuredClone;
    const _num = value => Number(value) || 0;
    const _captureWorkoutSheetScrollState = () => ({ scrollerTop: 123 });
    const _captureWorkoutSheetInputState = () => null;
    const _restoreWorkoutSheetInputState = () => { throw new Error('must not restore old input'); };
    function renderWorkoutCalendarHome() { renders += 1; }
    function _renderWorkoutSheetAfterSetEdit() { renders += 1; return false; }
    function _patchWorkoutSheetSetSurfaces() { renders += 1; return true; }
    function clearWorkoutExerciseCompletionMarker(entry) { delete entry.exerciseCompletedAt; }
    function _defaultWorkoutSheetSet() { throw new Error('must not create a set'); }
    function showToast(message, duration, type) { notices.push({ message, type }); }
    const console = { warn() {} };
    function _bindWorkoutSetSwipeDelete() {}
    function _commitPendingWorkoutSetKeyboardInput() { commits += 1; }
    function _hideWorkoutSetKeyboard() { hides += 1; }
    ${['_workoutSetKeyboardActiveInput', '_workoutSetKeyboardMeta', '_sameWorkoutSetKeyboardTarget'].map(name => extract(keyboard, name)).join('\n')}
    ${['_saveWorkoutHomeSessionResult', '_mutateWorkoutExerciseFromSheet', '_setWorkoutSheetNumber', '_updateWorkoutExerciseSetFromSheet', '_patchWorkoutSetRirControl', '_stepWorkoutSetRirFromSheet', '_beginWorkoutRirGesture', '_deferWorkoutRirGestureRefresh', 'refreshWorkoutSheetForDataUpdate', '_bindWorkoutHomeSheetActions'].map(name => extract(calendar, name)).join('\n')}
    _bindWorkoutHomeSheetActions(root);
    function fire(type, target, relatedTarget = null) { const event = { target, relatedTarget, cancelable: true, preventDefault() { this.prevented = true; }, stopPropagation() {} }; listeners[type](event); return event; }
    function advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } }
    globalThis.api = {
      makeControl, input, fire, advance,
      step: _stepWorkoutSetRirFromSheet,
      echo: (keys = [key]) => refreshWorkoutSheetForDataUpdate(keys),
      ack: () => acks.splice(0).reverse().forEach(resolve => resolve({ state: 'synced' })),
      clearInput: () => { document.activeElement = null; workoutSetKeyboardState.input = null; },
      navigate: () => { _workoutHomeSelectedKey = '2026-10-02'; },
      move() { const day = cache[key]; const session = getWorkoutSessions(day)[0]; const moved = moveWorkoutExerciseCard(session.exercises, [[0], [1]], 0, 1); const result = upsertWorkoutSession(day, { ...session, exercises: moved.exercises }, 0); Object.assign(day, _workoutSessionSavePayload(result)); S.workout.exercises = structuredClone(moved.exercises); controls.forEach(({ button, row }) => { button.isConnected = false; row.isConnected = false; }); },
      snapshot: () => ({ day: structuredClone(cache[key]), state: structuredClone(S), saved, events, renders, commits, hides, notices, controls: controls.map(({ output, button, rirInput }) => ({ text: output.textContent, disabled: button.disabled, expandedRir: rirInput.value })) }),
    };
  `, context);
  return context.api;
}

test('RIR parsing preserves missing, zero and decimals; explicit first tap uses 2 ± 0.5 and clamps 0–10', () => {
  for (const value of [null, undefined, '', ' ', false, [], {}, NaN, Infinity, -1, 11]) assert.equal(readWorkoutRir(value), null);
  for (const value of [0, '0', 2.25, '2.25', 10]) assert.equal(readWorkoutRir(value), Number(value));
  assert.equal(stepWorkoutRir(null, -1), 1.5);
  assert.equal(stepWorkoutRir('', 1), 2.5);
  assert.equal(stepWorkoutRir(0, -1), 0);
  assert.equal(stepWorkoutRir(10, 1), 10);
  assert.equal(stepWorkoutRir(2.25, 1), 2.75);
  assert.equal(stepWorkoutRir(2.25, -1), 1.75);
  assert.equal(stepWorkoutRir(0.25, -1), 0);
  assert.equal(stepWorkoutRir(9.75, 1), 10);
  assert.equal(stepWorkoutRir(2, 2), null);
});

test('actual sheet setter saves rapid decimal taps optimistically and preserves all completion/rest/unknown metadata', async () => {
  const api = harness({ delay: true });
  const button = api.makeControl();
  const before = plain(api.snapshot());
  const pending = [api.step(button), api.step(button), api.step(button)];
  const after = plain(api.snapshot());
  const expectedEntry = before.day.workoutSessions[0].exercises[0]; expectedEntry.sets[0].rir = 3.75;
  assert.deepEqual(after.day.workoutSessions[0].exercises[0], expectedEntry);
  assert.deepEqual(after.day.workoutSessions[0].exercises[1], before.day.workoutSessions[0].exercises[1]);
  assert.deepEqual(after.day.restBetweenSets, before.day.restBetweenSets);
  assert.deepEqual(after.state.workout.restTimer, before.state.workout.restTimer);
  assert.deepEqual(after.day.workoutSessions[1], plain(getWorkoutSessions(before.day)[1]));
  assert.equal(after.day.breakfast, 'keep');
  assert.equal(after.controls[0].text, '3.75');
  assert.equal(after.controls[0].expandedRir, '3.75');
  assert.equal(after.renders, 0);
  assert.deepEqual(after.saved.map(save => save.payload.workoutSessions[0].exercises[0].sets[0].rir), [2.75, 3.25, 3.75]);
  assert.ok(after.saved.every(save => save.options.mode === 'merge'));
  api.ack(); await Promise.all(pending);
  assert.equal(api.snapshot().renders, 0);
  assert.ok(api.snapshot().events.every(detail => detail.renderHandled === true));
});

test('zero boundaries do not write; missing first tap and non-done set remain separate from completion', async () => {
  const api = harness({ value: 0 });
  assert.equal(await api.step(api.makeControl(0, 0, -1)), false);
  assert.equal(api.snapshot().saved.length, 0);
  assert.equal(await api.step(api.makeControl(0, 1, -1)), true);
  assert.equal(api.snapshot().day.workoutSessions[0].exercises[0].sets[1].rir, 1.5);
  assert.equal(api.snapshot().day.workoutSessions[0].exercises[0].sets[1].done, false);
  assert.equal(api.snapshot().day.workoutSessions[0].exercises[0].exerciseCompletedAt, 9876);
  const upper = harness({ value: 9.75 }); const plus = upper.makeControl();
  await upper.step(plus); assert.equal(plus.disabled, true);
  assert.equal(await upper.step(plus), false);
  assert.equal(upper.snapshot().saved.length, 1);
});

test('real pointer/click/focusout handlers preserve a dirty keypad input, value and cursor without committing it', async () => {
  const api = harness({ delay: true });
  const input = api.input('kg', '77.5'); const button = api.makeControl();
  assert.equal(api.fire('pointerdown', button).prevented, true);
  assert.equal(api.fire('mousedown', button).prevented, true);
  api.fire('focusout', input, button);
  api.fire('click', button);
  api.advance(0);
  assert.equal(input.value, '77.5');
  assert.equal(input.getAttribute('data-wt-set-keyboard-dirty'), 'true');
  assert.equal(input.getAttribute('data-wt-set-keyboard-cursor'), '4');
  assert.equal(api.snapshot().day.workoutSessions[0].exercises[0].sets[0].kg, 70);
  assert.equal(api.snapshot().day.workoutSessions[0].exercises[0].sets[0].rir, 2.75);
  assert.equal(api.snapshot().commits, 0); assert.equal(api.snapshot().hides, 0);
  api.ack(); await Promise.resolve(); await Promise.resolve();
  assert.equal(api.snapshot().renders, 0);
});

test('an expanded dirty RIR input supplies the latest value to the stepper', async () => {
  const api = harness(); const button = api.makeControl();
  api.input('rir', '4.25'); await api.step(button);
  assert.equal(api.snapshot().day.workoutSessions[0].exercises[0].sets[0].rir, 4.75);
  assert.equal(api.snapshot().controls[0].expandedRir, '4.75');
});

test('echoes cannot replace nodes during the tap gesture; latest updates reconcile after quiet time', async () => {
  const api = harness({ delay: true }); const button = api.makeControl();
  api.fire('pointerdown', button); assert.equal(api.echo(), true); assert.equal(api.snapshot().renders, 0);
  const first = api.step(button); api.advance(400); const second = api.step(button);
  api.echo(); api.advance(400); assert.equal(api.snapshot().renders, 0);
  api.ack(); await Promise.all([first, second]); assert.equal(api.snapshot().renders, 0);
  api.advance(101); assert.equal(api.snapshot().renders, 1);
  assert.equal(api.echo(['2026-10-03', '2026-10-04']), false, 'another date must not be hidden');
});

test('reordered cards use their new indexes; old controls and reverse save acknowledgments cannot touch new input', async () => {
  const api = harness({ delay: true }); const oldButton = api.makeControl();
  const first = api.step(oldButton); api.move(); const currentButton = api.makeControl(1);
  const second = api.step(currentButton); const input = api.input('reps', '13', 1);
  assert.equal(await api.step(oldButton), false);
  api.ack(); await Promise.all([first, second]); api.advance(501);
  const result = plain(api.snapshot());
  assert.deepEqual(result.day.workoutSessions[0].exercises.map(ex => [ex.exerciseId, ex.sets[0].rir]), [['B', 2.25], ['A', 3.25]]);
  assert.equal(input.value, '13'); assert.equal(result.renders, 0);
});

test('navigation cancels old gesture reconciliation and failed saves report error without completion changes', async () => {
  const api = harness({ delay: true }); const pending = api.step(api.makeControl()); api.echo(); api.navigate(); api.advance(501); api.ack(); await pending;
  assert.equal(api.snapshot().renders, 0);
  const failed = harness({ fail: true }); assert.equal(await failed.step(failed.makeControl()), false);
  assert.deepEqual(plain(failed.snapshot().notices).map(n => n.type), ['error']);
  assert.equal(failed.snapshot().day.workoutSessions[0].exercises[0].exerciseCompletedAt, 9876);
});

test('rendered RIR controls show missing explicitly, preserve zero/precision, and use native labelled buttons', () => {
  const render = vm.runInNewContext(`${extract(template, '_renderWorkoutSetRirStepper')}; _renderWorkoutSetRirStepper`, { readWorkoutRir, _esc: String });
  const missing = render('2026-10-03', 0, 1, 2, null);
  assert.match(missing, />미입력<\/output>/); assert.match(missing, /RIR 2를 기준/);
  assert.equal((missing.match(/data-wt-set-rir-step=/g) || []).length, 2);
  assert.match(missing, /aria-label="3세트 RIR 0.5 줄이기"/);
  assert.match(render('2026-10-03', 0, 0, 0, 0), /줄이기" disabled/);
  assert.match(render('2026-10-03', 0, 0, 0, 2.25), />2.25<\/output>/);
  assert.match(render('2026-10-03', 0, 0, 0, 10), /늘리기" disabled/);
});

test('previous-record read model does not coerce absent RIR to a recorded zero or quantize stored decimals', () => {
  const run = vm.runInNewContext(`${extract(readModel, '_workoutRecordFromEntry')}; _workoutRecordFromEntry`, {
    readWorkoutRir, _isActualWorkoutSet: () => true, calcSetVolume: () => 1, _dateDistanceLabel: String, _formatSetText: () => '', _num: Number,
  });
  const values = [null, undefined, '', ' ', 0, 2.25];
  const result = run('2026-10-03', { sets: values.map(rir => ({ rir, kg: 1, reps: 1 })) });
  assert.deepEqual(plain(result.setDetails.map(set => set.rir)), [null, null, null, null, 0, 2.25]);
  assert.equal((readModel.match(/rir: readWorkoutRir\(set.rir\)/g) || []).length, 3);
});
