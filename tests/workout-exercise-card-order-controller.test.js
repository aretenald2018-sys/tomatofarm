import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getWorkoutSessions, upsertWorkoutSession } from '../workout/sessions.js';
import * as order from '../workout/exercise-card-order.js';

const calendarSource = readFileSync(new URL('../render-calendar.js', import.meta.url), 'utf8');
const templateSource = readFileSync(new URL('../calendar/detail-template.js', import.meta.url), 'utf8');
const exercisesSource = readFileSync(new URL('../workout/exercises.js', import.meta.url), 'utf8');

function extract(source, name) {
  const marker = source.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} exists`);
  const brace = source.indexOf(') {', start) + 2;
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Cannot extract ${name}`);
}

function harness({ superset = false, input = false, activeSessionIndex = 0, delay = false, fail = false } = {}) {
  const create = new Function('deps', `
    const { getWorkoutSessions, upsertWorkoutSession, moveWorkoutExerciseCard, remapWorkoutExercisePositionKey, remapWorkoutRestOrigin, remapWorkoutRestRecords, config } = deps;
    const key = '2026-10-03';
    let _workoutHomeSelectedKey = key;
    let _workoutHomeSessionIndex = 0;
    let _workoutCardOrderRevision = 0;
    const log = [], saved = [], notices = [], frames = [], acks = [], events = [], legacyMaps = [], drafts = [];
    const entries = ['A', 'B', 'C', 'D'].map((name, index) => ({ exerciseId: name, name, unknown: { keep: index }, sets: [
      { kg: 50 + index, reps: 5, done: true, completedAt: 1000, restStartedAt: name + '-rest', restPlannedSec: 90 },
      { kg: 30 + index, reps: 8, done: false, setType: 'drop', custom: 'keep' },
    ] }));
    if (config.superset) { entries[0].supersetGroup = 'ss'; entries[2].supersetGroup = 'ss'; }
    const cache = { [key]: { breakfast: 'keep', workoutSessions: [{ id: 's1', exercises: entries, workoutPhoto: 'photo' }, { id: 's2', exercises: [], memo: 'keep' }], exercises: entries,
      restBetweenSets: [{ exerciseId: 'A', entryIdx: 0, setIdx: 0, setNumber: 1, startedAt: 'A-rest', custom: 'keep' }],
    } };
    const S = { workout: { sessionIndex: config.activeSessionIndex, exercises: structuredClone(entries), restTimer: { origin: { entryIdx: 0, setIdx: 0, exerciseId: 'A', setNumber: 1 }, startedAt: 1000, remaining: 60, running: true } } };
    const _workoutExpandedSetEditors = new Set([key + ':0:0:1', key + ':1:0:1']);
    const _workoutOpenSetTypeMenus = new Set([key + ':0:1:0']);
    const _workoutOpenSupersetMenus = new Set([key + ':0:0']);
    const _workoutDetailCollapsed = new Set();
    const _workoutExerciseCompletionStamps = new Map([['ex:' + key + ':0:0', 123]]);
    const workoutDetailState = { editingCardId: 'ex:' + key + ':0:0', inlineSetEditor: config.input ? key + ':0:0:1:kg' : null };
    let activeInput = config.input ? { getAttribute(name) { return name === 'data-wt-set-keyboard-dirty' ? 'true' : null; } } : null;
    const inputState = config.input ? { hasInput: true, exerciseIndex: '0', setIndex: '1', field: 'kg', sessionIndex: '0', selectionStart: 2, selectionEnd: 2 } : null;
    const scroll = { scrollerTop: 140, rootTop: 0, windowTop: 0, carouselSlideIndex: 0, carouselScrollLeft: 0 };
    let restored = null, focused = null;
    const button = { focus() { focused = 'button'; } };
    const newInput = { removeAttribute() {}, focus() { focused = 'input'; activeInput = this; }, setSelectionRange() {} };
    const sheet = { querySelector(selector) {
      if (selector.startsWith('[data-wt-set-input]')) { log.push(['focus-selector', selector]); return config.input ? newInput : null; }
      if (selector.startsWith('[data-wt-day-exercise-slide]')) return { querySelector() { return button; } };
      return null;
    } };
    const window = { requestAnimationFrame(fn) { frames.push(fn); } };
    const document = { dispatchEvent(event) { events.push(event.detail); } };
    class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
    const _parseDateKey = value => /^\\d{4}-\\d{2}-\\d{2}$/.test(value);
    const _workoutSetKeyboardActiveInput = () => activeInput;
    const _captureWorkoutSheetInputState = () => inputState ? { ...scroll, ...inputState } : null;
    const _captureWorkoutSheetScrollState = () => ({ ...scroll, hasInput: false });
    const _workoutSheetSelectorValue = value => String(value);
    const _workoutHomeScrollRoot = () => ({ querySelector: () => sheet });
    function _commitWorkoutSetKeyboardInput() { log.push('commit'); cache[key].workoutSessions[0].exercises[0].sets[1].kg = 77; return Promise.resolve(true); }
    function _hideWorkoutSetKeyboard() { activeInput = null; }
    function _workoutHomeSessionAt(targetKey, index) { const day = cache[targetKey]; return { day, session: getWorkoutSessions(day)[index], index }; }
    function _workoutMetrics(targetKey, session) { return { exercises: session.exercises.map((entry, originalIndex) => ({ ...entry, originalIndex })) }; }
    function _buildWorkoutLookup() { return {}; }
    function _isSameWorkoutStateDate(targetKey) { return targetKey === key; }
    function wtRemapWorkoutExerciseCardReferences(map) { legacyMaps.push(map); }
    const getCache = () => cache;
    const _workoutHomeDay = targetKey => cache[targetKey];
    const _workoutSessionSavePayload = result => ({ ...result.aggregate, workoutSessions: result.workoutSessions });
    const _mealOkPatchForWorkoutHomeDay = () => ({});
    function saveDay(targetKey, payload, options) {
      log.push('save'); saved.push({ targetKey, payload: structuredClone(payload), options });
      cache[targetKey] = { ...cache[targetKey], ...structuredClone(payload) };
      if (config.fail) return Promise.reject(new Error('synthetic write failure'));
      return config.delay ? new Promise(resolve => acks.push(resolve)) : Promise.resolve({ state: 'synced' });
    }
    function _syncWorkoutHomeSavedSessionState(targetKey, result, index) {
      drafts.push(structuredClone(result.workoutSessions[index]));
      if (_isSameWorkoutStateDate(targetKey) && index === S.workout.sessionIndex) S.workout.exercises = structuredClone(result.workoutSessions[index].exercises);
    }
    function _renderWorkoutSheetAfterSetEdit() { log.push('render'); return false; }
    function _rememberWorkoutSheetCarouselSlide(targetKey, index, slide) { log.push(['remember', slide]); }
    function _rememberWorkoutSheetCarouselState() {}
    function _restoreWorkoutSheetScrollState(state) { restored = state; }
    function _restoreWorkoutSheetInputState() {}
    function _waitWorkoutSheetFocusTransition() { return Promise.resolve(); }
    function showToast(message, duration, type) { notices.push({ message, type }); }
    const console = { warn() {} };
    ${extract(templateSource, '_workoutExerciseSlideModels')}
    ${extract(calendarSource, '_saveWorkoutHomeSessionResult')}
    ${extract(calendarSource, '_moveWorkoutExerciseCardFromSheet')}
    return {
      move: (index, direction, targetKey = key, session = 0) => _moveWorkoutExerciseCardFromSheet(targetKey, session, index, direction),
      snapshot: () => ({ cache: structuredClone(cache), state: structuredClone(S), log: structuredClone(log), notices: structuredClone(notices), saved: structuredClone(saved), legacyMaps, drafts, restored, focused, editors: [..._workoutExpandedSetEditors], menus: [..._workoutOpenSetTypeMenus], supersets: [..._workoutOpenSupersetMenus], detail: { ...workoutDetailState }, events }),
      flushFrames: () => { frames.splice(0).forEach(fn => fn()); },
      acknowledge: () => { acks.splice(0).reverse().forEach(resolve => resolve({ state: 'synced' })); },
      navigate: () => { _workoutHomeSelectedKey = '2026-10-02'; },
    };
  `);
  return create({ getWorkoutSessions, upsertWorkoutSession, ...order, config: { superset, input, activeSessionIndex, delay, fail } });
}

test('controller commits keypad values, remaps rest/editor state, and saves through the optimistic sheet pipeline', async () => {
  const api = harness({ input: true });
  assert.equal(await api.move(0, 1), true);
  api.flushFrames();
  const snapshot = api.snapshot();
  const day = snapshot.cache['2026-10-03'];
  assert.deepEqual(day.workoutSessions[0].exercises.map(item => item.name), ['B', 'A', 'C', 'D']);
  assert.equal(day.workoutSessions[0].exercises[1].sets[1].kg, 77);
  assert.equal(day.workoutSessions[0].exercises[1].sets[1].done, false);
  assert.equal(day.breakfast, 'keep');
  assert.equal(day.workoutSessions[1].memo, 'keep');
  assert.equal(day.workoutSessions[0].workoutPhoto, 'photo');
  assert.deepEqual(day.workoutSessions[0].exercises[1].unknown, { keep: 0 });
  assert.equal(snapshot.state.workout.restTimer.origin.entryIdx, 1);
  assert.equal(snapshot.state.workout.restTimer.startedAt, 1000);
  assert.equal(day.restBetweenSets[0].entryIdx, 1);
  assert.deepEqual(snapshot.editors, ['2026-10-03:0:1:1', '2026-10-03:1:0:1']);
  assert.deepEqual(snapshot.menus, ['2026-10-03:0:0:0']);
  assert.equal(snapshot.detail.editingCardId, 'ex:2026-10-03:0:1');
  assert.equal(snapshot.detail.inlineSetEditor, '2026-10-03:0:1:1:kg');
  assert.equal(snapshot.saved[0].options.mode, 'merge');
  assert.ok(snapshot.log.indexOf('commit') < snapshot.log.indexOf('save'));
  assert.ok(snapshot.log.indexOf('save') < snapshot.log.indexOf('render'));
  assert.equal(snapshot.restored.carouselSlideIndex, 1);
  assert.equal(snapshot.restored.scrollerTop, 140);
  assert.equal(snapshot.focused, 'input');
  assert.equal(snapshot.drafts[0].exercises[1].name, 'A');
  assert.deepEqual(snapshot.legacyMaps, [[1, 0, 2, 3]]);
});

test('two rapid superset moves remain ordered when older saves acknowledge last', async () => {
  const api = harness({ superset: true, delay: true });
  const first = api.move(0, 1);
  const second = api.move(1, 1);
  assert.deepEqual(api.snapshot().cache['2026-10-03'].workoutSessions[0].exercises.map(e => e.name), ['B', 'D', 'A', 'C']);
  api.acknowledge();
  await Promise.all([first, second]);
  api.flushFrames();
  const snapshot = api.snapshot();
  assert.equal(snapshot.state.workout.restTimer.origin.entryIdx, 2);
  assert.deepEqual(snapshot.state.workout.exercises.map(e => e.name), ['B', 'D', 'A', 'C']);
  assert.equal(snapshot.restored.carouselSlideIndex, 2);
  assert.equal(snapshot.notices.length, 1, 'stale acknowledgments must not produce old success notices');
  assert.ok(snapshot.events.every(detail => detail?.renderHandled === true));
});

test('invalid/boundary/stale-session actions never write and another active session keeps its rest origin', async () => {
  const api = harness({ activeSessionIndex: 1 });
  assert.equal(await api.move(0, -1), false);
  assert.equal(await api.move(0, 1, '2026-10-02'), false);
  assert.equal(await api.move(0, 1, '2026-10-03', 1), false);
  assert.equal(api.snapshot().saved.length, 0);
  assert.equal(await api.move(0, 1), true);
  const snapshot = api.snapshot();
  assert.equal(snapshot.state.workout.restTimer.origin.entryIdx, 0);
  assert.equal(snapshot.legacyMaps.length, 0);
});

test('late acknowledgments after navigation cannot refocus the old sheet', async () => {
  const api = harness({ delay: true });
  const pending = api.move(0, 1);
  api.navigate();
  api.acknowledge();
  await pending;
  const before = api.snapshot();
  api.flushFrames();
  assert.deepEqual(api.snapshot().restored, before.restored);
  assert.equal(api.snapshot().notices.length, 0);
});

test('failed saves report failure rather than success', async () => {
  const api = harness({ fail: true });
  assert.equal(await api.move(0, 1), false);
  assert.deepEqual(api.snapshot().notices.map(notice => notice.type), ['error']);
});

test('card-order controls use group source indexes and accessible disabled boundaries', () => {
  const render = new Function(`
    const _esc = value => String(value);
    const _renderWorkoutSupersetDetailCard = () => '<article>superset</article>';
    const _renderWorkoutExerciseDetailCard = () => '<article>single</article>';
    ${extract(templateSource, '_workoutExerciseSlideModels')}
    ${extract(templateSource, '_renderWorkoutExerciseSlides')}
    return _renderWorkoutExerciseSlides;
  `)();
  const rows = [
    { name: 'A', originalIndex: 0, supersetGroup: 'ss' }, { name: 'B', originalIndex: 1 },
    { name: 'C', originalIndex: 2, supersetGroup: 'ss' }, { name: 'D', originalIndex: 3 },
  ];
  const html = render('2026-10-03', 0, rows);
  assert.equal((html.match(/data-wt-sheet-card-action="move-exercise-card"/g) || []).length, 6);
  assert.match(html, /data-exercise-index="0" data-order-direction="-1" aria-label="A \+ C 앞 순서로 이동" disabled/);
  assert.match(html, /data-exercise-index="3" data-order-direction="1" aria-label="D 뒤 순서로 이동" disabled/);
  assert.match(html, /슈퍼세트 순서 1 \/ 3/);
  assert.doesNotMatch(html, /data-set-index/);
  assert.doesNotMatch(render('2026-10-03', 0, [rows[1]]), /move-exercise-card/);
});

test('legacy cursor and embedded owners follow remapped entries without rewriting set payloads', () => {
  const run = new Function(`
    let _activeWorkoutEntryIdx = 2;
    let _pendingWorkoutNumberInputTarget = {};
    const one = { container: { isConnected: true }, options: { name: 'A' } };
    const two = { container: { isConnected: false }, options: { name: 'B' } };
    const _embeddedMaxCards = new Map([[0, one], [1, two]]);
    const rendered = [];
    function renderEmbeddedMaxExerciseCard(container, index, options) { rendered.push({ index, options }); }
    ${extract(exercisesSource, 'wtRemapWorkoutExerciseCardReferences')}
    wtRemapWorkoutExerciseCardReferences([1, 2, 0]);
    return { active: _activeWorkoutEntryIdx, pending: _pendingWorkoutNumberInputTarget, rendered };
  `);
  assert.deepEqual(run(), { active: 0, pending: null, rendered: [{ index: 1, options: { name: 'A' } }] });
});
