import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const calendarJs = readFileSync(new URL('../render-calendar.js', import.meta.url), 'utf8');
const setPresentationJs = readFileSync(new URL('../workout/set-presentation.js', import.meta.url), 'utf8');
const styleCss = readAppCssSync();
const testArtifactRoot = process.env.TOMATO_TEST_ARTIFACT_DIR
  ? path.resolve(process.env.TOMATO_TEST_ARTIFACT_DIR)
  : path.join(tmpdir(), 'tomatofarm-test-artifacts');
const mobileEvidenceDir = path.join(testArtifactRoot, 'workout-set-mobile-interactions');
const mobileEvidenceJson = path.join(mobileEvidenceDir, 'mobile-set-row-e2e.json');
const mobileEvidenceScreenshot = path.join(mobileEvidenceDir, 'mobile-set-row-after.png');

function extractFunctionSource(source, name) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const normalStart = source.indexOf(`function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : normalStart;
  assert.ok(start >= 0, `${name} should exist`);
  const signatureEnd = source.indexOf(') {', start);
  const braceStart = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf('{', start);
  assert.ok(braceStart > start, `${name} body should start`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body should end`);
}

function extractConstArraySource(source, name) {
  const start = source.indexOf(`const ${name} = [`);
  assert.ok(start >= 0, `${name} should exist`);
  const end = source.indexOf('];', start);
  assert.ok(end > start, `${name} array should end`);
  return source.slice(start, end + 2);
}

function buildHarnessScript() {
  const functionNames = [
    '_workoutSheetInputValue',
    '_workoutSheetRawNumber',
    '_workoutSetEditorKey',
    '_workoutSetInlineFieldKey',
    '_isWorkoutSetEditorExpanded',
    '_isWorkoutSetInlineEditing',
    '_isWorkoutSetTypeMenuOpen',
    '_workoutHomeScrollRoot',
    '_workoutSheetSelectorValue',
    '_positionOpenWorkoutSetTypeMenu',
    '_renderWorkoutSetInput',
    '_renderWorkoutSetInlineInput',
    '_renderWorkoutSetAddRow',
    '_renderWorkoutSetTypeMenu',
    '_renderWorkoutSetRows',
    '_workoutPreviousSetSummary',
    '_renderWorkoutExerciseDetailCard',
    '_clearWorkoutSetEditorsForExercise',
    '_runWorkoutHomeSheetCardAction',
    '_clearWorkoutSetInputOnFocus',
    '_workoutSetKeyboardElement',
    '_workoutSetKeyboardSheet',
    '_workoutSetKeyboardActiveInput',
    '_workoutSetKeyboardMeta',
    '_sameWorkoutSetKeyboardTarget',
    '_workoutSetKeyboardInlineTargets',
    '_findWorkoutSetKeyboardMoveTarget',
    '_focusWorkoutSetKeyboardTarget',
    '_workoutSetKeyboardRenderedInput',
    '_focusWorkoutSetKeyboardRenderedTarget',
    '_syncWorkoutSetKeyboardButtons',
    '_ensureWorkoutSetKeyboard',
    '_showWorkoutSetKeyboard',
    '_clearWorkoutSetKeyboardSurface',
    '_hideWorkoutSetKeyboard',
    '_markWorkoutSetKeyboardInputDirty',
    '_replaceWorkoutSetKeyboardInputValue',
    '_workoutSetKeyboardCursor',
    '_applyWorkoutSetKeyboardKey',
    '_applyWorkoutSetKeyboardBackspace',
    '_applyWorkoutSetKeyboardClear',
    '_commitWorkoutSetKeyboardInput',
    '_commitWorkoutSetKeyboardDone',
    '_completeWorkoutSetKeyboardInput',
    '_moveWorkoutSetKeyboardFocus',
    '_bindWorkoutSetSwipeDelete',
    '_bindWorkoutHomeSheetActions',
    '_focusWorkoutSetInlineFieldFromSheet',
    '_cancelWorkoutSetInlineFieldFromSheet',
    '_focusWorkoutSetEditorFieldFromSheet',
    '_toggleWorkoutSetEditorFromSheet',
    '_toggleWorkoutSetTypeMenuFromSheet',
    '_setWorkoutSheetNumber',
    '_updateWorkoutExerciseSetFromSheet',
    '_setWorkoutExerciseSetTypeFromSheet',
    '_removeWorkoutExerciseSetFromSheet',
    '_copyPreviousWorkoutSetForSheet',
    '_copyPreviousWorkoutRecordSetsForSheet',
    '_copyPreviousWorkoutExerciseSetsFromSheet',
  ];
  const sourceBundle = [
    setPresentationJs.replace(/^export /gmu, ''),
    extractConstArraySource(calendarJs, 'WORKOUT_SET_TYPE_OPTIONS'),
    ...functionNames.map(name => extractFunctionSource(calendarJs, name)),
  ].join('\n\n');

  return `
    const WORKOUT_GYM_SESSION_COUNT = 2;
    const WORKOUT_SHEET_SET_INPUT_SELECTOR = '[data-wt-set-input]';
    let _workoutHomeSelectedKey = '2026-07-04';
    let _workoutHomeSessionIndex = 0;
    let _workoutHomeSheetState = 'bar';
    const _workoutOpenSetTypeMenus = new Set();
    const _workoutExpandedSetEditors = new Set();
    let _workoutInlineSetEditor = null;
    let _workoutSetKeyboardInput = null;
    let _workoutSetKeyboardDomLocked = false;
    window.__renderCalls = 0;
    window.__syncCalls = [];
    window.__restoreCalls = [];
    window.__mutateCalls = [];
    window.__deferSetMutationRender = false;
    window.__mutationDelayMs = 0;
    window.__pendingMutationRender = null;
    window.__scrollerTouchMoveBlocks = 0;

    function _esc(value = '') {
      return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]);
    }
    function _num(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    function _fmtNum(value, digits = 1) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '';
      return n.toFixed(digits).replace(/\\.0+$/u, '').replace(/(\\.\\d*?)0+$/u, '$1');
    }
    function _isBlankWorkoutSheetNumber(value) {
      return value == null || String(value).trim() === '';
    }
    function _parseDateKey(key) {
      return /^\\d{4}-\\d{2}-\\d{2}$/u.test(String(key || ''));
    }
    function _captureWorkoutSheetScrollState() {
      return { top: 12 };
    }
    function _restoreWorkoutSheetScrollState(state) {
      window.__restoreCalls.push(state);
    }
    function _syncWorkoutHomeNavState(payload) {
      window.__syncCalls.push(payload);
    }
    function _toggleWorkoutHomeSheet() {}
    function _openWorkoutHomeRunning() { return false; }
    function _addWorkoutHomeSession() { return false; }
    function _toggleWorkoutExerciseSetDoneFromSheet() { return false; }
    function _completeWorkoutExerciseFromSheet() { return false; }
    function _editWorkoutExerciseCard() { return false; }
    function _toggleWorkoutDetailCard() { return false; }
    function _deleteWorkoutExercise() { return false; }
    function _deleteWorkoutActivity() { return false; }
    function _isWorkoutExerciseCompletionStamped() { return false; }
    function _renderWorkoutTrackGraph() { return ''; }
    function activeWorkoutTrack() { return 'M'; }
    function workoutTrackLabel() { return '중량'; }
    function _previousWorkoutRecordForRow() { return window.__previousRecord || null; }
    function _workoutEntryName(entry = {}) { return String(entry?.name || entry?.exerciseId || ''); }
    function getCache() { return window.__cache || {}; }
    function _defaultWorkoutSheetSet(prev = {}) {
      return { kg: prev.kg ?? '', reps: prev.reps ?? '', setType: prev.setType || 'main', done: false };
    }
    function clearWorkoutExerciseCompletionMarker(entry) {
      delete entry.exerciseCompletedAt;
      window.__completionMarkerCleared = true;
    }

    ${sourceBundle}

    window.__entry = { name: '벤치프레스', exerciseId: 'bench-press', sets: [] };
    window.__previousRecord = null;
    function _rowFromEntry() {
      const rawSetDetails = (window.__entry.sets || []).map((set, index) => ({ ...set, setIndex: index }));
      return {
        name: window.__entry.name || '벤치프레스',
        exerciseId: window.__entry.exerciseId || 'bench-press',
        originalIndex: 0,
        dateKey: '2026-07-04',
        setCount: rawSetDetails.length,
        setDetails: rawSetDetails,
        rawSetDetails,
        previousRecord: window.__previousRecord,
      };
    }
    function renderWorkoutCalendarHome() {
      if (_workoutSetKeyboardDomLocked && _workoutSetKeyboardElement()?.classList.contains('is-open')) return;
      window.__renderCalls += 1;
      document.body.innerHTML = '<main id="workout-calendar-root"><section data-wt-day-sheet><div class="wt-day-sheet-scroll"><div data-wt-day-exercise-carousel-track>'
        + _renderWorkoutExerciseDetailCard('2026-07-04', 0, _rowFromEntry(), 0)
        + '</div></div></section></main>';
      _bindWorkoutHomeSheetActions(document.getElementById('workout-calendar-root'));
      document.querySelector('.wt-day-sheet-scroll')?.addEventListener('touchmove', (event) => {
        window.__scrollerTouchMoveBlocks += 1;
        event.stopPropagation();
      }, { passive: false });
    }
    async function _mutateWorkoutExerciseFromSheet(targetKey, targetSessionIndex, exerciseIndex, mutator, options = {}) {
      const ok = mutator(window.__entry);
      window.__mutateCalls.push({ targetKey, targetSessionIndex, exerciseIndex, options });
      if (options?.skipRender !== true && (options?.optimisticRender || !window.__deferSetMutationRender)) {
        renderWorkoutCalendarHome();
      } else {
        window.__pendingMutationRender = { targetKey, targetSessionIndex, exerciseIndex, options };
      }
      if (window.__mutationDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, window.__mutationDelayMs));
      }
      return ok;
    }
    window._wtCalUpdateExerciseSet = _updateWorkoutExerciseSetFromSheet;
    window.__copyPreviousWorkoutRecordSets = _copyPreviousWorkoutRecordSetsForSheet;
    window.showToast = (message, duration, type) => {
      window.__lastToast = { message, duration, type };
    };
    window.renderWorkoutCalendarHome = renderWorkoutCalendarHome;
    window.__harnessReady = true;
  `;
}

async function runHarnessPage(fn) {
  const harnessScript = buildHarnessScript();
  assert.doesNotThrow(() => new Function(harnessScript));
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    await page.setContent('<!doctype html><html lang="ko"><body></body></html>');
    await page.addStyleTag({ content: styleCss });
    await page.addScriptTag({ content: harnessScript });
    const ready = await page.evaluate(() => window.__harnessReady === true);
    assert.deepEqual(pageErrors, []);
    assert.equal(ready, true);
    const result = await fn(page);
    assert.deepEqual(pageErrors, []);
    return result;
  } finally {
    await browser.close();
  }
}

async function runHarness(fn) {
  return runHarnessPage(page => page.evaluate(fn));
}

test('minimal set row opens right editor and left M/W/D/F menu in a browser DOM', async () => {
  const result = await runHarness(async () => {
    window.__entry = { sets: [{ kg: 40, reps: 10, rir: 2, romPct: 85, setType: 'main', done: false }] };
    window.renderWorkoutCalendarHome();
    const collapsed = {
      inputCount: document.querySelectorAll('[data-wt-set-input]').length,
      hasEditor: !!document.querySelector('.wt-max-set-editor'),
      typeText: document.querySelector('.wt-max-set-type-btn')?.textContent?.replace(/\s+/g, ' ').trim(),
      valueText: Array.from(document.querySelectorAll('.wt-max-set-value')).map(node => node.textContent.replace(/\s+/g, ' ').trim()),
      hasRirText: document.body.textContent.includes('RIR'),
      hasRomText: document.body.textContent.includes('ROM'),
    };

    document.querySelector('.wt-max-set-expand').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const expanded = {
      fields: Array.from(document.querySelectorAll('[data-wt-set-input]')).map(input => input.dataset.field),
      editorOpen: !!document.querySelector('.wt-max-set-editor'),
      expandAria: document.querySelector('.wt-max-set-expand')?.getAttribute('aria-expanded'),
    };

    document.querySelector('.wt-max-set-type-btn').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const menu = {
      editorOpen: !!document.querySelector('.wt-max-set-editor'),
      optionCodes: Array.from(document.querySelectorAll('[data-wt-set-type-option] b')).map(node => node.textContent.trim()),
      optionTypes: Array.from(document.querySelectorAll('[data-wt-set-type-option]')).map(node => node.dataset.setType),
      typeAria: document.querySelector('.wt-max-set-type-btn')?.getAttribute('aria-expanded'),
    };
    return { collapsed, expanded, menu, renderCalls: window.__renderCalls, syncCalls: window.__syncCalls };
  });

  assert.equal(result.collapsed.inputCount, 0);
  assert.equal(result.collapsed.hasEditor, false);
  assert.equal(result.collapsed.typeText, '1메인');
  assert.deepEqual(result.collapsed.valueText, ['40kg', '10회']);
  assert.equal(result.collapsed.hasRirText, false);
  assert.equal(result.collapsed.hasRomText, false);
  assert.deepEqual(result.expanded.fields, ['kg', 'reps', 'rir', 'romPct']);
  assert.equal(result.expanded.editorOpen, true);
  assert.equal(result.expanded.expandAria, 'true');
  assert.equal(result.menu.editorOpen, false);
  assert.deepEqual(result.menu.optionCodes, ['M', 'W', 'D', 'F']);
  assert.deepEqual(result.menu.optionTypes, ['main', 'warmup', 'drop', 'failure']);
  assert.equal(result.menu.typeAria, 'true');
  assert.ok(result.renderCalls >= 3);
  assert.deepEqual(result.syncCalls.map(call => call.action), ['sheet:set-editor', 'sheet:set-type']);
});

test('mobile set row exposes editable kg/reps values and swipe delete targets in a browser DOM', async () => {
  const result = await runHarness(() => {
    window.__entry = {
      sets: [
        { kg: 70, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false },
        { kg: 40, reps: 12, rir: 2, romPct: 100, setType: 'main', done: false },
      ],
    };
    window.renderWorkoutCalendarHome();
    const editFields = Array.from(document.querySelectorAll('[data-wt-set-edit-field]')).map(node => node.dataset.wtSetEditField);
    const swipeRows = Array.from(document.querySelectorAll('[data-wt-set-swipe-row]')).map(node => node.dataset.setIndex);
    const remove = document.querySelector('.wt-max-set-remove-btn');
    const expand = document.querySelector('.wt-max-set-expand');
    const row = document.querySelector('.wt-max-set-row');
    const check = document.querySelector('.wt-max-set-check');
    return {
      editFields,
      swipeRows,
      firstKgText: document.querySelector('[data-wt-set-edit-field="kg"]')?.textContent?.replace(/\s+/g, '').trim() || '',
      firstRepsText: document.querySelector('[data-wt-set-edit-field="reps"]')?.textContent?.replace(/\s+/g, '').trim() || '',
      removeAction: remove?.getAttribute('data-wt-set-remove') ?? null,
      removeLabel: remove?.getAttribute('aria-label') ?? '',
      removeBeforeExpand: !!(remove && expand && remove.compareDocumentPosition(expand) & Node.DOCUMENT_POSITION_FOLLOWING),
      rowHeight: row?.getBoundingClientRect().height ?? 0,
      controlHeight: check?.getBoundingClientRect().height ?? 0,
    };
  });

  assert.deepEqual(result.editFields, ['kg', 'reps', 'kg', 'reps']);
  assert.deepEqual(result.swipeRows, ['0', '1']);
  assert.equal(result.firstKgText, '70kg');
  assert.equal(result.firstRepsText, '10회');
  assert.equal(result.removeAction, '');
  assert.match(result.removeLabel, /세트 삭제/);
  assert.equal(result.removeBeforeExpand, true);
  assert.equal(result.rowHeight, 38);
  assert.equal(result.controlHeight, 32);
  assert.ok(Math.abs((result.rowHeight / 54) - 0.7) < 0.01);
});

test('mobile set row inline editing clears values and only right-to-left swipe removes sets', async () => {
  const result = await runHarnessPage(async (page) => {
    await page.evaluate(() => {
      window.__entry = {
        sets: [
          { kg: 70, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false },
          { kg: 40, reps: 12, rir: 2, romPct: 100, setType: 'main', done: false },
          { kg: 35, reps: 14, rir: 2, romPct: 100, setType: 'main', done: false },
        ],
      };
      window.__syncCalls = [];
      window.__restoreCalls = [];
      window.renderWorkoutCalendarHome();
    });

    async function tapSelector(selector) {
      const handle = await page.waitForSelector(selector, { visible: true });
      const box = await handle.boundingBox();
      assert.ok(box, `${selector} should have a bounding box`);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    }

    await tapSelector('[data-wt-set-edit-field="kg"][data-set-index="0"]');
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]'));
    const kgFocus = await page.evaluate(() => ({
      field: document.activeElement?.getAttribute('data-field') || '',
      value: document.activeElement?.value ?? null,
      editorOpen: !!document.querySelector('.wt-max-set-editor'),
      inlineEditing: !!document.querySelector('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]'),
    }));
    await page.$eval('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]', input => {
      input.value = '55';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => window.__entry.sets[0]?.kg === 55);

    await tapSelector('[data-wt-set-edit-field="reps"][data-set-index="0"]');
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]'));
    const repsFocus = await page.evaluate(() => ({
      field: document.activeElement?.getAttribute('data-field') || '',
      value: document.activeElement?.value ?? null,
      editorOpen: !!document.querySelector('.wt-max-set-editor'),
      inlineEditing: !!document.querySelector('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]'),
    }));
    await page.$eval('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]', input => {
      input.value = '15';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => window.__entry.sets[0]?.reps === 15);

    const hitTargets = await page.evaluate(() => {
      const check = document.querySelector('.wt-max-set-check');
      const type = document.querySelector('.wt-max-set-type-btn');
      const remove = document.querySelector('.wt-max-set-remove-btn');
      const expand = document.querySelector('.wt-max-set-expand');
      const checkRect = check.getBoundingClientRect();
      const typeRect = type.getBoundingClientRect();
      const removeRect = remove.getBoundingClientRect();
      const expandRect = expand.getBoundingClientRect();
      return {
        checkWidth: checkRect.width,
        checkHeight: checkRect.height,
        typeWidth: typeRect.width,
        typeHeight: typeRect.height,
        removeWidth: removeRect.width,
        removeHeight: removeRect.height,
        removeCenterX: removeRect.left + removeRect.width / 2,
        expandCenterX: expandRect.left + expandRect.width / 2,
        gap: expandRect.left - removeRect.right,
      };
    });

    async function swipeElement(selector, deltaX) {
      const target = await page.waitForSelector(selector, { visible: true });
      const rowBox = await target.boundingBox();
      assert.ok(rowBox, `${selector} should have a bounding box`);
      const client = await page.target().createCDPSession();
      const startX = rowBox.x + rowBox.width / 2;
      const startY = rowBox.y + rowBox.height / 2;
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y: startY }],
      });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: startX + deltaX, y: startY + 3 }],
      });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await client.detach();
    }

    await page.evaluate(() => { window.__deferSetMutationRender = true; });
    await swipeElement('[data-wt-set-edit-field="kg"][data-set-index="2"]', 74);
    await new Promise(resolve => setTimeout(resolve, 80));
    const afterRightSwipe = await page.evaluate(() => {
      const row = document.querySelector('[data-wt-set-swipe-row][data-set-index="2"]');
      return {
        rows: document.querySelectorAll('[data-wt-set-swipe-row]').length,
        sets: window.__entry.sets.length,
        transform: row?.style.transform || '',
        swiping: row?.classList.contains('is-swiping') || false,
      };
    });
    assert.deepEqual(afterRightSwipe, { rows: 3, sets: 3, transform: '', swiping: false });

    await swipeElement('[data-wt-set-edit-field="reps"][data-set-index="1"]', -74);
    await page.waitForFunction(() => (
      window.__entry.sets.length === 2
      && document.querySelectorAll('[data-wt-set-swipe-row]').length === 2
    ), { timeout: 1500 });

    const finalState = await page.evaluate(() => ({
      sets: window.__entry.sets,
      rows: document.querySelectorAll('[data-wt-set-swipe-row]').length,
      values: Array.from(document.querySelectorAll('.wt-max-set-value')).map(node => node.textContent.replace(/\s+/g, '').trim()),
      syncActions: window.__syncCalls.map(call => call.action),
      mutationOptions: window.__mutateCalls.map(call => call.options),
      pendingMutationRender: window.__pendingMutationRender,
      restoreCount: window.__restoreCalls.length,
      toast: window.__lastToast,
    }));

    mkdirSync(mobileEvidenceDir, { recursive: true });
    writeFileSync(mobileEvidenceJson, JSON.stringify({ kgFocus, repsFocus, hitTargets, finalState }, null, 2), 'utf8');
    await page.screenshot({ path: mobileEvidenceScreenshot, fullPage: true });

    return { kgFocus, repsFocus, hitTargets, finalState };
  });

  assert.deepEqual(result.kgFocus, { field: 'kg', value: '', editorOpen: false, inlineEditing: true });
  assert.deepEqual(result.repsFocus, { field: 'reps', value: '', editorOpen: false, inlineEditing: true });
  assert.equal(result.hitTargets.checkWidth, 32);
  assert.equal(result.hitTargets.checkHeight, 32);
  assert.equal(result.hitTargets.typeWidth, 32);
  assert.equal(result.hitTargets.typeHeight, 32);
  assert.equal(result.hitTargets.removeWidth, 32);
  assert.equal(result.hitTargets.removeHeight, 32);
  assert.ok(result.hitTargets.removeCenterX < result.hitTargets.expandCenterX);
  assert.ok(result.hitTargets.gap >= 3);
  assert.deepEqual(result.finalState.sets, [
    { kg: 55, reps: 15, rir: 2, romPct: 100, setType: 'main', done: false },
    { kg: 35, reps: 14, rir: 2, romPct: 100, setType: 'main', done: false },
  ]);
  assert.equal(result.finalState.rows, 2);
  assert.deepEqual(result.finalState.values, ['55kg', '15회', '35kg', '14회']);
  assert.ok(result.finalState.syncActions.includes('sheet:set-inline-field'));
  assert.equal(result.finalState.mutationOptions.filter(options => options.optimisticRender === true).length, 1);
  assert.equal(result.finalState.pendingMutationRender, null);
  assert.equal(result.finalState.toast?.message, '세트를 삭제했어요');
});

test('mobile inline field switching commits a dirty keypad value without rerendering the row', async () => {
  const result = await runHarnessPage(async (page) => {
    await page.evaluate(() => {
      window.__entry = {
        sets: [{ kg: 70, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false }],
      };
      window.__mutateCalls = [];
      window.renderWorkoutCalendarHome();
    });

    async function tapSelector(selector) {
      const handle = await page.waitForSelector(selector, { visible: true });
      const box = await handle.boundingBox();
      assert.ok(box, `${selector} should have a bounding box`);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    }

    await tapSelector('[data-wt-set-edit-field="kg"][data-set-index="0"]');
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]'));
    await page.$eval('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]', (input) => {
      input.value = '55';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const beforeSwitch = await page.evaluate(() => {
      window.__fieldSwitchRow = document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]');
      window.__fieldSwitchKeyboard = document.querySelector('[data-wt-set-keyboard]');
      return {
        inputValue: document.activeElement?.value ?? null,
        storedKg: window.__entry.sets[0]?.kg ?? null,
        dirty: document.activeElement?.getAttribute('data-wt-set-keyboard-dirty') || '',
        inlineFields: Array.from(document.querySelectorAll('[data-wt-set-inline-input][data-set-index="0"]'))
          .map(input => input.getAttribute('data-field')),
        renderCalls: window.__renderCalls,
      };
    });

    await tapSelector('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]');
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]'));
    const afterSwitch = await page.evaluate(() => ({
      activeField: document.activeElement?.getAttribute('data-field') || '',
      activeValue: document.activeElement?.value ?? null,
      sets: window.__entry.sets,
      renderCalls: window.__renderCalls,
      sameRow: window.__fieldSwitchRow === document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]'),
      sameKeyboard: window.__fieldSwitchKeyboard === document.querySelector('[data-wt-set-keyboard]'),
      mutationOptions: window.__mutateCalls.map(call => call.options),
    }));

    await page.$eval('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]', (input) => {
      input.value = '12';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await tapSelector('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]');
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]'));
    const afterReturn = await page.evaluate(() => ({
      activeField: document.activeElement?.getAttribute('data-field') || '',
      activeValue: document.activeElement?.value ?? null,
      sets: window.__entry.sets,
      renderCalls: window.__renderCalls,
      sameRow: window.__fieldSwitchRow === document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]'),
      sameKeyboard: window.__fieldSwitchKeyboard === document.querySelector('[data-wt-set-keyboard]'),
      keyboardOpen: !!document.querySelector('[data-wt-set-keyboard].is-open'),
      mutationOptions: window.__mutateCalls.map(call => call.options),
    }));

    return { beforeSwitch, afterSwitch, afterReturn };
  });

  assert.deepEqual(result.beforeSwitch.inlineFields, ['kg', 'reps']);
  assert.equal(result.beforeSwitch.inputValue, '55');
  assert.equal(result.beforeSwitch.storedKg, 70);
  assert.equal(result.beforeSwitch.dirty, 'true');
  assert.equal(result.afterSwitch.activeField, 'reps');
  assert.equal(result.afterSwitch.activeValue, '');
  assert.equal(result.afterSwitch.sets[0].kg, 55);
  assert.equal(result.afterSwitch.sets[0].reps, 10);
  assert.equal(result.afterSwitch.renderCalls, result.beforeSwitch.renderCalls);
  assert.equal(result.afterSwitch.sameRow, true);
  assert.equal(result.afterSwitch.sameKeyboard, true);
  assert.equal(result.afterSwitch.mutationOptions.length, 1);
  assert.equal(result.afterSwitch.mutationOptions[0].optimisticRender, true);
  assert.equal(result.afterSwitch.mutationOptions[0].skipRender, true);
  assert.equal(result.afterReturn.activeField, 'kg');
  assert.equal(result.afterReturn.activeValue, '55');
  assert.equal(result.afterReturn.sets[0].kg, 55);
  assert.equal(result.afterReturn.sets[0].reps, 12);
  assert.equal(result.afterReturn.renderCalls, result.beforeSwitch.renderCalls);
  assert.equal(result.afterReturn.sameRow, true);
  assert.equal(result.afterReturn.sameKeyboard, true);
  assert.equal(result.afterReturn.keyboardOpen, true);
  assert.equal(result.afterReturn.mutationOptions.length, 2);
  assert.ok(result.afterReturn.mutationOptions.every(options => (
    options.optimisticRender === true && options.skipRender === true
  )));
});

test('custom workout set keypad enters values and moves left or right across inline fields', async () => {
  const result = await runHarnessPage(async (page) => {
    await page.evaluate(() => {
      window.__entry = {
        sets: [
          { kg: 70, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false },
          { kg: 40, reps: 12, rir: 2, romPct: 100, setType: 'main', done: false },
        ],
      };
      window.__syncCalls = [];
      window.__mutateCalls = [];
      window.__mutationDelayMs = 600;
      window.renderWorkoutCalendarHome();
    });

    async function tapSelector(selector) {
      const handle = await page.waitForSelector(selector, { visible: true });
      const box = await handle.boundingBox();
      assert.ok(box, `${selector} should have a bounding box`);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    }

    await tapSelector('[data-wt-set-edit-field="kg"][data-set-index="0"]');
    await page.waitForFunction(() => document.querySelector('[data-wt-set-keyboard].is-open'));
    await new Promise(resolve => setTimeout(resolve, 220));
    const shown = await page.evaluate(() => {
      const input = document.activeElement;
      return {
        field: input?.getAttribute('data-field') || '',
        value: input?.value ?? null,
        readOnly: input?.readOnly === true,
        inputMode: input?.getAttribute('inputmode') || '',
        keyCount: document.querySelectorAll('[data-wt-set-keyboard-key]').length,
        hasPrev: !!document.querySelector('[data-wt-set-keyboard-action="prev"]'),
        hasNext: !!document.querySelector('[data-wt-set-keyboard-action="next"]'),
        sheetPadded: document.querySelector('[data-wt-day-sheet]')?.classList.contains('has-set-keyboard') || false,
      };
    });

    await tapSelector('[data-wt-set-keyboard-key="8"]');
    await tapSelector('[data-wt-set-keyboard-key="0"]');
    const typedKg = await page.evaluate(() => ({
      value: document.activeElement?.value ?? null,
      dirty: document.activeElement?.getAttribute('data-wt-set-keyboard-dirty') || '',
      storedKg: window.__entry.sets[0]?.kg ?? null,
      mutationCount: window.__mutateCalls.length,
    }));

    const renderBeforeNext = await page.evaluate(() => {
      window.__nextMoveRow = document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]');
      window.__nextMoveKeyboard = document.querySelector('[data-wt-set-keyboard]');
      return window.__renderCalls;
    });
    const nextStartedAt = Date.now();
    await tapSelector('[data-wt-set-keyboard-action="next"]');
    await page.waitForFunction(() => (
      window.__entry.sets[0]?.kg === 80
      && document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="reps"][data-set-index="0"]')
    ), { timeout: 1500 });
    const afterNextMove = await page.evaluate((before) => ({
      renderDelta: window.__renderCalls - before,
      activeField: document.activeElement?.getAttribute('data-field') || '',
      keyboardOpen: !!document.querySelector('[data-wt-set-keyboard].is-open'),
      sameRow: window.__nextMoveRow === document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]'),
      sameKeyboard: window.__nextMoveKeyboard === document.querySelector('[data-wt-set-keyboard]'),
    }), renderBeforeNext);
    afterNextMove.elapsedMs = Date.now() - nextStartedAt;

    await tapSelector('[data-wt-set-keyboard-key="1"]');
    await tapSelector('[data-wt-set-keyboard-key="5"]');
    const renderBeforePrev = await page.evaluate(() => {
      window.__prevMoveRow = document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]');
      window.__prevMoveKeyboard = document.querySelector('[data-wt-set-keyboard]');
      return window.__renderCalls;
    });
    const prevStartedAt = Date.now();
    await tapSelector('[data-wt-set-keyboard-action="prev"]');
    await page.waitForFunction(() => (
      window.__entry.sets[0]?.reps === 15
      && document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]')
    ));
    const afterPrevMove = await page.evaluate((before) => ({
      renderDelta: window.__renderCalls - before,
      activeField: document.activeElement?.getAttribute('data-field') || '',
      keyboardOpen: !!document.querySelector('[data-wt-set-keyboard].is-open'),
      sameRow: window.__prevMoveRow === document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]'),
      sameKeyboard: window.__prevMoveKeyboard === document.querySelector('[data-wt-set-keyboard]'),
    }), renderBeforePrev);
    afterPrevMove.elapsedMs = Date.now() - prevStartedAt;

    const afterPrev = await page.evaluate(() => ({
      activeField: document.activeElement?.getAttribute('data-field') || '',
      activeValue: document.activeElement?.value ?? null,
      sets: window.__entry.sets,
      keyboardOpen: !!document.querySelector('[data-wt-set-keyboard].is-open'),
      syncActions: window.__syncCalls.map(call => call.action),
      mutationOptions: window.__mutateCalls.map(call => call.options),
    }));

    const doneStartedAt = Date.now();
    await tapSelector('[data-wt-set-keyboard-action="done"]');
    await page.waitForFunction(() => (
      !document.querySelector('[data-wt-set-keyboard]')
      && !document.querySelector('[data-wt-set-inline-input]')
    ));

    const hidden = await page.evaluate(() => ({
      sets: window.__entry.sets,
      firstCompletedAtIsNumber: Number.isFinite(Number(window.__entry.sets[0]?.completedAt)),
      keyboardOpenClass: document.documentElement.classList.contains('wt-set-keyboard-open'),
      sheetPadded: document.querySelector('[data-wt-day-sheet]')?.classList.contains('has-set-keyboard') || false,
    }));
    hidden.elapsedMs = Date.now() - doneStartedAt;

    return { shown, typedKg, afterNextMove, afterPrevMove, afterPrev, hidden };
  });

  assert.deepEqual(result.shown, {
    field: 'kg',
    value: '',
    readOnly: true,
    inputMode: 'none',
    keyCount: 11,
    hasPrev: true,
    hasNext: true,
    sheetPadded: true,
  });
  assert.deepEqual(result.typedKg, { value: '80', dirty: 'true', storedKg: 70, mutationCount: 0 });
  assert.deepEqual(
    { ...result.afterNextMove, elapsedMs: undefined },
    {
      renderDelta: 0,
      activeField: 'reps',
      keyboardOpen: true,
      sameRow: true,
      sameKeyboard: true,
      elapsedMs: undefined,
    },
  );
  assert.ok(result.afterNextMove.elapsedMs < 250, `next field took ${result.afterNextMove.elapsedMs}ms`);
  assert.deepEqual(
    { ...result.afterPrevMove, elapsedMs: undefined },
    {
      renderDelta: 0,
      activeField: 'kg',
      keyboardOpen: true,
      sameRow: true,
      sameKeyboard: true,
      elapsedMs: undefined,
    },
  );
  assert.ok(result.afterPrevMove.elapsedMs < 250, `previous field took ${result.afterPrevMove.elapsedMs}ms`);
  assert.equal(result.afterPrev.activeField, 'kg');
  assert.equal(result.afterPrev.activeValue, '80');
  assert.deepEqual(result.afterPrev.sets[0], { kg: 80, reps: 15, rir: 2, romPct: 100, setType: 'main', done: false });
  assert.equal(result.afterPrev.keyboardOpen, true);
  assert.ok(result.afterPrev.syncActions.filter(action => action === 'sheet:set-inline-field').length >= 3);
  assert.ok(result.afterPrev.mutationOptions.every(options => (
    options.preserveSheetScroll === true
    && options.optimisticRender === true
    && options.skipRender === true
  )));
  assert.equal(result.hidden.sets[0].kg, 80);
  assert.equal(result.hidden.sets[0].reps, 15);
  assert.equal(result.hidden.sets[0].done, true);
  assert.equal(result.hidden.firstCompletedAtIsNumber, true);
  assert.deepEqual(result.hidden.sets[1], { kg: 40, reps: 12, rir: 2, romPct: 100, setType: 'main', done: false });
  assert.equal(result.hidden.keyboardOpenClass, false);
  assert.equal(result.hidden.sheetPadded, false);
  assert.ok(result.hidden.elapsedMs < 250, `done button took ${result.hidden.elapsedMs}ms`);
});

test('previous workout card copies every set value but resets completion state', async () => {
  const result = await runHarness(async () => {
    window.__entry = {
      name: '벤치프레스',
      exerciseId: 'bench-press',
      exerciseCompletedAt: 999,
      sets: [{ kg: 20, reps: 5, done: false }],
    };
    window.__previousRecord = {
      dateLabel: '3일 전',
      setDetails: [
      {
        kg: 60,
        reps: 10,
        rpe: 8,
        rir: 2,
        romPct: 90,
        setType: 'main',
        completedAt: 111,
        done: true,
      },
      {
        kg: 50,
        reps: 12,
        rpe: 9,
        rir: 1,
        romPct: 100,
        setType: 'drop',
        wendlerRole: 'backoff',
        supplementalKind: 'bbb',
        wendlerPct: 65,
        amrap: true,
        completedAt: 222,
        done: true,
      },
    ],
    };
    window.renderWorkoutCalendarHome();
    const copyCard = document.querySelector('[data-wt-sheet-card-action="copy-previous-sets"]');
    copyCard?.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      copiedSets: window.__entry.sets,
      completionMarkerCleared: !('exerciseCompletedAt' in window.__entry),
      toast: window.__lastToast,
    };
  });

  assert.deepEqual(result.copiedSets, [
    {
      kg: 60,
      reps: 10,
      rpe: 8,
      rir: 2,
      romPct: 90,
      setType: 'main',
      done: false,
    },
    {
      kg: 50,
      reps: 12,
      rpe: 9,
      rir: 1,
      romPct: 100,
      setType: 'drop',
      wendlerRole: 'backoff',
      supplementalKind: 'bbb',
      wendlerPct: 65,
      amrap: true,
      done: false,
    },
  ]);
  assert.equal(result.completionMarkerCleared, true);
  assert.deepEqual(result.toast, {
    message: '지난 기록 2세트를 가져왔어요',
    duration: 1400,
    type: 'success',
  });
});

test('set type menu click mutates only the target set type and clears completion marker', async () => {
  const result = await runHarness(async () => {
    window.__entry = {
      exerciseCompletedAt: 12345,
      sets: [
        {
          kg: 40,
          reps: 10,
          rir: 2,
          romPct: 100,
          setType: 'main',
          done: true,
          wendlerRole: 'main',
          wendlerPct: 80,
          supplementalKind: 'bbb',
          amrap: true,
        },
      ],
    };
    window.renderWorkoutCalendarHome();
    document.querySelector('.wt-max-set-type-btn').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    document.querySelector('[data-set-type="failure"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      entry: window.__entry,
      menuOpenCount: document.querySelectorAll('[data-wt-set-type-option]').length,
      typeText: document.querySelector('.wt-max-set-type-btn')?.textContent?.replace(/\s+/g, ' ').trim(),
      mutateCalls: window.__mutateCalls,
      markerCleared: window.__completionMarkerCleared === true,
    };
  });

  assert.equal(result.entry.sets.length, 1);
  assert.equal(result.entry.sets[0].setType, 'failure');
  assert.equal(result.entry.sets[0].kg, 40);
  assert.equal(result.entry.sets[0].reps, 10);
  assert.equal(result.entry.sets[0].done, true);
  assert.equal('wendlerRole' in result.entry.sets[0], false);
  assert.equal('wendlerPct' in result.entry.sets[0], false);
  assert.equal('supplementalKind' in result.entry.sets[0], false);
  assert.equal('amrap' in result.entry.sets[0], false);
  assert.equal('exerciseCompletedAt' in result.entry, false);
  assert.equal(result.markerCleared, true);
  assert.equal(result.menuOpenCount, 0);
  assert.equal(result.typeText, '1실패');
  assert.equal(result.mutateCalls.length, 1);
  assert.equal(result.mutateCalls[0].targetKey, '2026-07-04');
  assert.equal(result.mutateCalls[0].targetSessionIndex, 0);
  assert.equal(result.mutateCalls[0].exerciseIndex, '0');
  assert.deepEqual(result.mutateCalls[0].options, { preserveSheetScroll: true });
});
