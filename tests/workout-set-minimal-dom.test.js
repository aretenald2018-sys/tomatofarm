import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

// 달력 탭 소스는 render-calendar.js + calendar/*.js 분할 이후 여러 파일에 걸쳐 있다.
// 이 스위트는 "달력 탭 코드 어딘가에 있는가"를 보므로 분할 소스를 이어붙여 검사한다.
const calendarJs = [
  '../render-calendar.js',
  '../calendar/format.js',
  '../calendar/gesture-policy.js',
  '../calendar/day-metrics.js',
  '../calendar/workout-read-model.js',
  '../calendar/export-text.js',
  '../calendar/session-state.js',
  '../calendar/detail-template.js',
  '../calendar/sheet-state.js',
  '../calendar/set-keyboard.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n\n');
const setPresentationJs = readFileSync(new URL('../workout/set-presentation.js', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const workoutSaveJs = readFileSync(new URL('../workout/save.js', import.meta.url), 'utf8');
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
    '_workoutBackoffModeOptions',
    '_renderWorkoutSetTypeMenu',
    '_renderWorkoutSetRows',
    '_workoutPreviousSetSummary',
    '_renderWorkoutExerciseDetailCard',
    '_renderWorkoutExerciseSlides',
    '_patchWorkoutSheetSetSurfaces',
    '_renderWorkoutSheetAfterSetEdit',
    'refreshWorkoutSheetForDataUpdate',
    '_clearWorkoutSetEditorsForExercise',
    '_runWorkoutHomeSheetCardAction',
    '_workoutDayExportMenuParts',
    '_toggleWorkoutDayExportMenu',
    '_closeWorkoutDayExportMenu',
    '_clearWorkoutSetInputOnFocus',
    '_lockWorkoutSetKeyboardDom',
    '_releaseWorkoutSetKeyboardDom',
    '_resetWorkoutSetKeyboardDomLock',
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
    '_commitPendingWorkoutSetKeyboardInput',
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
    '_saveWorkoutHomeSessionResult',
    '_toggleWorkoutExerciseSetDoneFromSheet',
    '_clearWorkoutSheetSetRestMetadata',
    '_syncWorkoutRestAfterSheetSet',
    '_copyPreviousWorkoutSetForSheet',
    '_copyPreviousWorkoutRecordSetsForSheet',
    '_copyPreviousWorkoutExerciseSetsFromSheet',
    '_undoPreviousWorkoutSetCopyFromSheet',
    '_setWorkoutTrackModeFromSheet',
    '_addWorkoutExerciseSetFromSheet',
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
    // 하네스는 항상 기록 시트가 열린 상태를 세운다(detail).
    let _workoutHomeView = 'detail';
    const _workoutOpenSetTypeMenus = new Set();
    const _workoutExpandedSetEditors = new Set();
    // 달력 분할 이후 이 상태들은 calendar/detail-template.js와 calendar/set-keyboard.js의
    // 모듈 상태 객체에 산다. 하네스도 같은 모양으로 넣어줘야 떼어온 함수가 그대로 돈다.
    const workoutDetailState = { editingCardId: null, inlineSetEditor: null };
    const workoutSetKeyboardState = { input: null, domLocked: false };
    const workoutSetKeyboardDomLocks = new Set();
    let workoutSetKeyboardDomLockSeq = 0;
    const workoutDetailRuntime = {
      getSelectedKey: () => _workoutHomeSelectedKey,
      getSessionIndex: () => _workoutHomeSessionIndex,
      setSessionIndex: (index) => { _workoutHomeSessionIndex = index; },
    };
    const workoutSetKeyboardRuntime = {
      cancelInlineField: (...args) => _cancelWorkoutSetInlineFieldFromSheet(...args),
      getSelectedKey: () => _workoutHomeSelectedKey,
      clearInputOnFocus: input => _clearWorkoutSetInputOnFocus(input),
      defaultSet: (...args) => _defaultWorkoutSheetSet(...args),
      focusEditorField: (...args) => _focusWorkoutSetEditorFieldFromSheet(...args),
      focusInlineField: (...args) => _focusWorkoutSetInlineFieldFromSheet(...args),
      mutateExercise: (...args) => _mutateWorkoutExerciseFromSheet(...args),
      removeExerciseSet: (...args) => _removeWorkoutExerciseSetFromSheet(...args),
      setWorkoutSheetNumber: (...args) => _setWorkoutSheetNumber(...args),
      syncNavState: (...args) => _syncWorkoutHomeNavState(...args),
      updateExerciseSet: (...args) => _updateWorkoutExerciseSetFromSheet(...args),
    };
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
    function _completeWorkoutExerciseFromSheet() { return false; }
    function _editWorkoutExerciseCard() { return false; }
    function _toggleWorkoutDetailCard() { return false; }
    function _deleteWorkoutExercise() { return false; }
    function _deleteWorkoutActivity() { return false; }
    function _exportWorkoutRecords() { return false; }
    function _isWorkoutExerciseCompletionStamped() { return false; }
    function _renderWorkoutTrackGraph() { return ''; }
    function activeWorkoutTrack() { return 'M'; }
    function workoutTrackLabel() { return '중량'; }
    function _previousWorkoutRecordForRow() { return window.__previousRecord || null; }
    function _clonePlain(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function normalizeWorkoutTrack(value) { return value === 'H' || value === 'M' ? value : ''; }
    function isWendlerWorkoutEntry(entry = {}) {
      if (entry?.recommendationMeta?.program === 'wendler' || entry?.maxPrescription?.program === 'wendler') return true;
      return (entry?.sets || []).some(set => !!set?.wendlerRole);
    }
    function _workoutEntryName(entry = {}) { return String(entry?.name || entry?.exerciseId || ''); }
    function getCache() { return window.__cache || {}; }
    function getDietPlan() { return null; }
    function _sortedCheckins() { return []; }
    function _renderWorkoutDetailSummaryCard() { return '<div class="wt-day-summary-card"></div>'; }
    function _mountWorkoutSummaryElapsedTimers() {}
    // 부분 갱신은 시트 모델을 다시 읽어 카드만 갈아끼운다. 하네스는 종목 하나만
    // 세우므로 같은 모양의 모델을 돌려준다.
    function _workoutHomeDetailModel() {
      return { sessionIndex: 0, wx: { exercises: [_rowFromEntry()] } };
    }
    function _defaultWorkoutSheetSet(prev = {}) {
      return { kg: prev.kg ?? '', reps: prev.reps ?? '', setType: prev.setType || 'main', done: false };
    }
    function clearWorkoutExerciseCompletionMarker(entry) {
      delete entry.exerciseCompletedAt;
      window.__completionMarkerCleared = true;
    }
    // ── 완료 토글 전체 경로용 경계 스텁 ──────────────────────────
    // 실제 _saveWorkoutHomeSessionResult / _syncWorkoutRestAfterSheetSet 소스를
    // 그대로 태우기 위한 최소 경계. 저장/휴식 타이머는 호출 기록만 남긴다.
    const _workoutDetailCollapsed = new Set();
    const S = { workout: { sessionIndex: 0, get exercises() { return [window.__entry]; } } };
    window.__todayKey = null;
    window.__sheetSavedEvents = [];
    window.__saveWorkoutDayCalls = [];
    window.__restTimerStarts = [];
    window.__restTimerClears = [];
    window.__restTimelineCalls = [];
    function _isTodayKey(key) { return key === window.__todayKey; }
    function _isSameWorkoutStateDate() { return true; }
    function wtRefreshWorkoutTimelineDuration(context) { window.__restTimelineCalls.push(context); }
    function wtRestTimerStart(seconds, context, meta) { window.__restTimerStarts.push({ context, meta }); }
    function wtRestTimerClearSetRecord(entryIdx, setIdx) { window.__restTimerClears.push({ entryIdx, setIdx }); }
    // workout/save.js saveWorkoutDay의 경계 재현: 저장 후 sheet:saved를 낸다.
    // renderHandled를 빠뜨리면 아래 renderAll 재현 리스너가 전체 렌더를 돌리므로,
    // 완료 토글 경로가 이 옵션을 잃는 회귀가 렌더 횟수로 드러난다.
    async function saveWorkoutDay(options = {}) {
      window.__saveWorkoutDayCalls.push(options);
      document.dispatchEvent(options?.renderHandled === true
        ? new CustomEvent('sheet:saved', { detail: { renderHandled: true } })
        : new CustomEvent('sheet:saved'));
      return true;
    }
    async function saveDay() { return { state: 'synced' }; }
    function _workoutHomeDay() { return {}; }
    function _workoutSessionSavePayload() { return {}; }
    function _mealOkPatchForWorkoutHomeDay() { return {}; }
    function _syncWorkoutHomeSavedSessionState() {}
    function _captureWorkoutSheetInputState() { return null; }
    function _restoreWorkoutSheetInputState(state) { window.__restoreCalls.push(state); }
    function _waitWorkoutSheetFocusTransition() { return Promise.resolve(); }

    ${sourceBundle}

    // 기존 테스트들은 완료 토글이 아무것도 하지 않는 스텁이라는 전제로 돈다.
    // 번들의 실제 구현은 __realToggleWorkoutSetDone으로 보관해 전체 경로
    // 테스트에서만 되살린다.
    window.__realToggleWorkoutSetDone = _toggleWorkoutExerciseSetDoneFromSheet;
    _toggleWorkoutExerciseSetDoneFromSheet = function () { return false; };

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
      if (workoutSetKeyboardState.domLocked && _workoutSetKeyboardElement()?.classList.contains('is-open')) return;
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
    // app.js의 sheet:saved 리스너 재현: renderHandled가 붙은 저장은 renderAll
    // (전체 렌더)을 건너뛴다. 이 재현이 있어야 "완료 체크 → 전체 렌더 0회"를
    // 저장 이벤트까지 포함한 실제 경로로 검증할 수 있다.
    document.addEventListener('sheet:saved', (event) => {
      window.__sheetSavedEvents.push(event?.detail ?? null);
      if (event?.detail?.renderHandled === true) return;
      renderWorkoutCalendarHome();
    });
    // app.js의 data:workouts-updated 리스너 재현. 저장이 서버에 닿으면 Firestore
    // 실시간 리스너가 같은 날짜의 에코를 보내고 이 경로가 워크아웃 화면을 다시
    // 그린다. 시트가 제자리 갱신을 처리했다고 답하면 전체 렌더는 돌지 않는다.
    window.__workoutsUpdatedEvents = [];
    document.addEventListener('data:workouts-updated', (event) => {
      const changedDateKeys = event?.detail?.changedDateKeys || [];
      window.__workoutsUpdatedEvents.push(changedDateKeys);
      if (refreshWorkoutSheetForDataUpdate(changedDateKeys) === true) return;
      renderWorkoutCalendarHome();
    });
    async function _mutateWorkoutExerciseFromSheet(targetKey, targetSessionIndex, exerciseIndex, mutator, options = {}) {
      const ok = mutator(window.__entry);
      window.__mutateCalls.push({ targetKey, targetSessionIndex, exerciseIndex, options });
      // 전체 경로 검증용: 실제 소스로 추출한 _saveWorkoutHomeSessionResult를 태워
      // 부분 갱신과 sheet:saved 발행 판단까지 검증한다. 기존 테스트는 스텁 경로.
      if (window.__useRealSaveResult) {
        if (ok === false) return false;
        await _saveWorkoutHomeSessionResult(targetKey, { aggregate: {} }, { ...options, sessionIndex: 0 });
        return ok;
      }
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
    window.showToast = (message, duration, type, opts = null) => {
      window.__lastToast = { message, duration, type, hasUndo: typeof opts?.onAction === 'function' && opts?.action === '실행 취소' };
      window.__lastToastAction = opts?.onAction || null;
    };
    window.renderWorkoutCalendarHome = renderWorkoutCalendarHome;
    window.__harnessReady = true;
  `;
}

async function runHarnessPage(fn) {
  const harnessScript = buildHarnessScript();
  assert.doesNotThrow(() => new Function(harnessScript));
  const browser = await puppeteer.launch({ headless: true, args: typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [] });
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
    const copyIsCompactChip = copyCard?.classList.contains('wt-max-last-copy-chip') === true
      && copyCard?.closest('.wt-max-last-head') != null;
    copyCard?.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const afterCopy = {
      copiedSets: JSON.parse(JSON.stringify(window.__entry.sets)),
      completionMarkerCleared: !('exerciseCompletedAt' in window.__entry),
      toast: window.__lastToast,
      copyIsCompactChip,
    };
    // 오탭 복구: 토스트의 실행 취소가 복사 전 세트와 완료 마커를 되살린다.
    window.__lastToastAction?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      ...afterCopy,
      undoneSets: window.__entry.sets,
      undoneCompletedAt: window.__entry.exerciseCompletedAt ?? null,
      undoToast: window.__lastToast,
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
  // 오탭 방지 1: 블록 전체가 아니라 작은 칩만 복사 버튼이다.
  assert.equal(result.copyIsCompactChip, true, '복사 버튼은 지난 기록 헤더의 칩이어야 한다');
  // 오탭 방지 2: 토스트에 실행 취소가 붙는다.
  assert.deepEqual(result.toast, {
    message: '지난 기록 2세트를 가져왔어요',
    duration: 5000,
    type: 'success',
    hasUndo: true,
  });
  // 실행 취소는 복사 전 세트와 완료 마커를 그대로 복원한다.
  assert.deepEqual(result.undoneSets, [{ kg: 20, reps: 5, done: false }]);
  assert.equal(result.undoneCompletedAt, 999);
  assert.equal(result.undoToast.message, '복사 전 세트로 되돌렸어요');
});

test('add-set row checks the copied original and leaves the new copy unchecked', async () => {
  const result = await runHarness(async () => {
    // 시나리오 1: 원본이 미완료 상태에서 + — 원본에 ✓, 복사본은 미완료.
    window.__entry = {
      name: '벤치프레스',
      exerciseId: 'bench-press',
      sets: [{ kg: 60, reps: 10, setType: 'main', done: false }],
    };
    window.renderWorkoutCalendarHome();
    document.querySelector('[data-wt-sheet-card-action="add-exercise-set"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const uncheckedOriginal = {
      sets: JSON.parse(JSON.stringify(window.__entry.sets)),
      toast: window.__lastToast,
    };

    // 시나리오 2: 원본이 이미 완료(✓) — 원본 완료시각을 건드리지 않고 복사만.
    window.__entry = {
      name: '벤치프레스',
      exerciseId: 'bench-press',
      sets: [{ kg: 60, reps: 10, setType: 'main', done: true, completedAt: 111 }],
    };
    window.renderWorkoutCalendarHome();
    document.querySelector('[data-wt-sheet-card-action="add-exercise-set"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      uncheckedOriginal,
      doneOriginal: {
        sets: JSON.parse(JSON.stringify(window.__entry.sets)),
        toast: window.__lastToast,
      },
    };
  });

  // 시나리오 1: 원본에 ✓와 완료시각이 찍히고, 복사본은 값만 복사된 미완료 행.
  const first = result.uncheckedOriginal;
  assert.equal(first.sets.length, 2);
  assert.equal(first.sets[0].done, true, '+는 방금 수행한 원본 세트를 완료로 표시한다');
  assert.ok(Number(first.sets[0].completedAt) > 0, '원본에 완료 시각이 기록된다');
  assert.equal(first.sets[1].kg, 60, '직전 세트 무게를 복사한다');
  assert.equal(first.sets[1].reps, 10, '직전 세트 횟수를 복사한다');
  assert.equal(first.sets[1].done, false, '복사본은 미완료로 남아야 한다');
  assert.equal('completedAt' in first.sets[1], false, '복사본에 완료 시각을 기록하지 않는다');
  assert.equal(first.toast.message, '직전 세트를 완료로 표시하고 복사했어요');

  // 시나리오 2: 이미 완료된 원본은 그대로(완료시각 유지), 복사본만 추가.
  const second = result.doneOriginal;
  assert.equal(second.sets.length, 2);
  assert.equal(second.sets[0].completedAt, 111, '이미 완료된 원본의 완료 시각은 유지된다');
  assert.equal(second.sets[1].done, false, '복사본은 미완료로 남아야 한다');
  assert.equal(second.toast.message, '직전 세트를 복사했어요');
});

test('track graph row tap reclassifies a non-wendler record and skips wendler entries', async () => {
  const result = await runHarness(async () => {
    // 하네스의 _renderWorkoutTrackGraph는 빈 스텁이라 카드에는 줄이 없다.
    // 실제 카드 액션 배선(_runWorkoutHomeSheetCardAction → _setWorkoutTrackModeFromSheet)을
    // 검증하기 위해 같은 속성의 컨트롤을 시트 안에 직접 세운다.
    window.__entry = {
      name: '벤치프레스',
      exerciseId: 'bench-press',
      sets: [{ kg: 60, reps: 10, done: true }],
    };
    window.renderWorkoutCalendarHome();
    const sheet = document.querySelector('[data-wt-day-sheet] .wt-day-sheet-scroll');
    sheet.insertAdjacentHTML('beforeend', '<div class="ex-max-track-graph-row" data-wt-sheet-card-action="set-track-mode" data-track="H" data-date-key="2026-07-04" data-session-index="0" data-exercise-index="0"></div>');
    document.querySelector('[data-wt-sheet-card-action="set-track-mode"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const afterToggle = {
      meta: JSON.parse(JSON.stringify(window.__entry.recommendationMeta || null)),
      sets: JSON.parse(JSON.stringify(window.__entry.sets)),
      toast: window.__lastToast,
    };

    // 웬들러 기록은 W 고정 — 탭해도 분류 메타를 만들지 않는다.
    window.__entry = {
      name: '스쿼트(와이드)',
      exerciseId: 'squat-wide',
      sets: [{ kg: 97.5, reps: 4, done: true, wendlerRole: 'main' }],
    };
    window.renderWorkoutCalendarHome();
    const sheet2 = document.querySelector('[data-wt-day-sheet] .wt-day-sheet-scroll');
    sheet2.insertAdjacentHTML('beforeend', '<div class="ex-max-track-graph-row" data-wt-sheet-card-action="set-track-mode" data-track="H" data-date-key="2026-07-04" data-session-index="0" data-exercise-index="0"></div>');
    window.__lastToast = null;
    document.querySelector('[data-wt-sheet-card-action="set-track-mode"]').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    return {
      afterToggle,
      wendlerMeta: window.__entry.recommendationMeta ?? null,
      wendlerToast: window.__lastToast,
    };
  });

  assert.equal(result.afterToggle.meta?.track, 'H', '탭한 트랙이 기록 분류 메타에 저장돼야 한다');
  assert.equal(result.afterToggle.meta?.userTrackOverride, true);
  // 세트 자체(무게/횟수/완료)는 손대지 않는다 — 기록 편집이 아니라 분류 전환이다.
  assert.deepEqual(result.afterToggle.sets, [{ kg: 60, reps: 10, done: true }]);
  assert.equal(result.afterToggle.toast?.message, '강도 트랙 기록으로 바꿨어요');
  assert.equal(result.wendlerMeta, null, '웬들러 기록에는 트랙 메타를 쓰지 않는다');
  assert.equal(result.wendlerToast, null, '웬들러에서는 전환 토스트도 없다');
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

// 완료 체크(✓)는 세트 값 편집과 같은 부분 갱신 경로를 타야 한다. 예전에는
// 낙관적 저장과 휴식 동기화 저장이 각각 sheet:saved → app.js renderAll을 불러
// 시트가 통째로 다시 그려졌고, 그때마다 스크롤이 0으로 튀며 화면이 깜빡였다.
test('tapping the done check patches the row in place without any full calendar render', async () => {
  // 하네스의 renderAll 재현이 실제 app.js 리스너와 같은 규칙임을 소스로 못박는다.
  assert.match(appJs, /addEventListener\('sheet:saved', \(event\) => \{[\s\S]{0,300}?renderHandled[\s\S]{0,120}?renderAll\(\)/);
  // 하네스의 saveWorkoutDay 경계 재현이 실제 workout/save.js 발행 규칙과 같음도 확인한다.
  assert.match(workoutSaveJs, /renderHandled\s*\?\s*new CustomEvent\('sheet:saved', \{ detail: \{ renderHandled: true \} \}\)/);

  const result = await runHarnessPage(async (page) => {
    await page.evaluate(() => {
      window.__entry = {
        name: '벤치프레스',
        exerciseId: 'bench-press',
        sets: [
          { kg: 70, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false },
          { kg: 40, reps: 12, rir: 2, romPct: 100, setType: 'main', done: false },
        ],
      };
      // 오늘 날짜로 취급해 휴식 타이머 동기화(_syncWorkoutRestAfterSheetSet)의
      // saveWorkoutDay 경로까지 실제 소스로 태운다.
      window.__todayKey = '2026-07-04';
      window.__useRealSaveResult = true;
      window._toggleWorkoutExerciseSetDoneFromSheet = window.__realToggleWorkoutSetDone;
      window.renderWorkoutCalendarHome();
      window.__renderCalls = 0;
      window.__sheetSavedEvents = [];
      window.__scroller = document.querySelector('.wt-day-sheet-scroll');
      window.__sheet = document.querySelector('[data-wt-day-sheet]');
    });

    async function tapSelector(selector) {
      const handle = await page.waitForSelector(selector, { visible: true });
      const box = await handle.boundingBox();
      assert.ok(box, `${selector} should have a bounding box`);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    }

    await tapSelector('[data-wt-set-done-toggle][data-set-index="0"]');
    await page.waitForFunction(() => (
      window.__entry.sets[0]?.done === true && window.__saveWorkoutDayCalls.length === 1
    ), { timeout: 2000 });
    const afterOn = await page.evaluate(() => ({
      renderCalls: window.__renderCalls,
      sameScroller: window.__scroller === document.querySelector('.wt-day-sheet-scroll'),
      sameSheet: window.__sheet === document.querySelector('[data-wt-day-sheet]'),
      rowDone: document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]')?.classList.contains('is-done') ?? null,
      checkPressed: document.querySelector('[data-wt-set-done-toggle][data-set-index="0"]')?.getAttribute('aria-pressed'),
      completedAtIsNumber: Number.isFinite(Number(window.__entry.sets[0]?.completedAt)),
      otherSetDone: window.__entry.sets[1]?.done,
      sheetSavedEvents: window.__sheetSavedEvents,
      saveWorkoutDayCalls: window.__saveWorkoutDayCalls,
      restTimerStarts: window.__restTimerStarts.length,
    }));

    // 해제도 같은 부분 갱신 경로를 타야 한다.
    await tapSelector('[data-wt-set-done-toggle][data-set-index="0"]');
    await page.waitForFunction(() => (
      window.__entry.sets[0]?.done === false && window.__saveWorkoutDayCalls.length === 2
    ), { timeout: 2000 });
    const afterOff = await page.evaluate(() => ({
      renderCalls: window.__renderCalls,
      sameScroller: window.__scroller === document.querySelector('.wt-day-sheet-scroll'),
      sameSheet: window.__sheet === document.querySelector('[data-wt-day-sheet]'),
      rowDone: document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]')?.classList.contains('is-done') ?? null,
      checkPressed: document.querySelector('[data-wt-set-done-toggle][data-set-index="0"]')?.getAttribute('aria-pressed'),
      hasCompletedAt: 'completedAt' in (window.__entry.sets[0] || {}),
      restTimerClears: window.__restTimerClears.length,
      sheetSavedEvents: window.__sheetSavedEvents,
    }));

    return { afterOn, afterOff };
  });

  // 완료로 켤 때: 전체 렌더 0회, 스크롤 컨테이너와 시트 엘리먼트 유지.
  assert.equal(result.afterOn.renderCalls, 0);
  assert.equal(result.afterOn.sameScroller, true);
  assert.equal(result.afterOn.sameSheet, true);
  // 행 완료 상태는 실제로 바뀐다 — is-done 스타일과 aria-pressed, completedAt.
  assert.equal(result.afterOn.rowDone, true);
  assert.equal(result.afterOn.checkPressed, 'true');
  assert.equal(result.afterOn.completedAtIsNumber, true);
  assert.equal(result.afterOn.otherSetDone, false);
  // 휴식 타이머 동기화는 그대로 동작하고, 두 저장 모두 renderHandled로 나간다.
  assert.equal(result.afterOn.restTimerStarts, 1);
  assert.deepEqual(result.afterOn.saveWorkoutDayCalls, [{ silent: true, renderHandled: true }]);
  assert.deepEqual(result.afterOn.sheetSavedEvents, [
    { renderHandled: true },
    { renderHandled: true },
  ]);
  // 해제할 때도 전체 렌더 없이 행이 되돌아오고 휴식 기록이 정리된다.
  assert.equal(result.afterOff.renderCalls, 0);
  assert.equal(result.afterOff.sameScroller, true);
  assert.equal(result.afterOff.sameSheet, true);
  assert.equal(result.afterOff.rowDone, false);
  assert.equal(result.afterOff.checkPressed, 'false');
  assert.equal(result.afterOff.hasCompletedAt, false);
  assert.equal(result.afterOff.restTimerClears, 1);
  assert.equal(result.afterOff.sheetSavedEvents.length, 4);
  assert.ok(result.afterOff.sheetSavedEvents.every(detail => detail?.renderHandled === true));
});

// f74aff5가 막은 건 sheet:saved → renderAll 하나였다. 저장이 서버에 닿으면
// data/data-load.js의 Firestore 실시간 리스너가 같은 날짜의 에코를 발행하고,
// app.js의 data:workouts-updated 분기가 워크아웃 라우트를 통째로 다시 그린다 —
// #workout-calendar-root가 새 DOM으로 교체돼 완료 체크의 "맨 위로 튀고 깜빡임"이
// 그대로 되살아났다. 이 스위트의 하네스는 가짜 데이터 층이 에코를 내지 않아
// 그 회귀를 못 잡았다. 여기서 에코를 직접 발행해 못박는다.
test('a workouts-updated echo for the open sheet date patches in place instead of a full render', async () => {
  // 실제 app.js가 워크아웃 탭 갱신을 시트 제자리 갱신으로 먼저 보내는지 소스로 확인한다.
  assert.match(appJs, /addEventListener\('data:workouts-updated'[\s\S]{0,900}?_refreshWorkoutSurfaceForDataUpdate\(changedDateKeys\)/);
  assert.match(appJs, /refreshWorkoutSheetForDataUpdate\?\.\(changedDateKeys\) === true\) return;/);

  const result = await runHarnessPage(async (page) => {
    await page.evaluate(() => {
      window.__entry = {
        name: '벤치프레스',
        exerciseId: 'bench-press',
        sets: [{ kg: 70, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false }],
      };
      window.__todayKey = '2026-07-04';
      window.__useRealSaveResult = true;
      window._toggleWorkoutExerciseSetDoneFromSheet = window.__realToggleWorkoutSetDone;
      window.renderWorkoutCalendarHome();
      window.__renderCalls = 0;
      window.__scroller = document.querySelector('.wt-day-sheet-scroll');
      window.__sheet = document.querySelector('[data-wt-day-sheet]');
    });

    const handle = await page.waitForSelector('[data-wt-set-done-toggle][data-set-index="0"]', { visible: true });
    const box = await handle.boundingBox();
    assert.ok(box, 'done toggle should have a bounding box');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => (
      window.__entry.sets[0]?.done === true && window.__saveWorkoutDayCalls.length === 1
    ), { timeout: 2000 });

    // 저장 성공 뒤 Firestore 에코: 열려 있는 시트의 날짜 하나만 바뀌었다.
    const afterEcho = await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('data:workouts-updated', {
        detail: { ownerId: 'harness-user', changedDateKeys: ['2026-07-04'], source: 'firestore' },
      }));
      return {
        renderCalls: window.__renderCalls,
        sameScroller: window.__scroller === document.querySelector('.wt-day-sheet-scroll'),
        sameSheet: window.__sheet === document.querySelector('[data-wt-day-sheet]'),
        rowDone: document.querySelector('[data-wt-set-swipe-row][data-set-index="0"]')?.classList.contains('is-done') ?? null,
        checkPressed: document.querySelector('[data-wt-set-done-toggle][data-set-index="0"]')?.getAttribute('aria-pressed'),
      };
    });

    // 다른 날짜가 섞인 갱신은 월 달력 표시까지 바뀌어야 하므로 전체 렌더로 넘어간다.
    const afterOtherDate = await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('data:workouts-updated', {
        detail: { ownerId: 'harness-user', changedDateKeys: ['2026-07-04', '2026-07-05'], source: 'firestore' },
      }));
      return { renderCalls: window.__renderCalls };
    });

    // 세트 키패드가 열려 있는 동안의 에코는 입력을 지키기 위해 아무것도 갈아끼우지 않는다.
    const kgHandle = await page.waitForSelector('[data-wt-set-edit-field="kg"][data-set-index="0"]', { visible: true });
    const kgBox = await kgHandle.boundingBox();
    assert.ok(kgBox, 'kg value should have a bounding box');
    await page.touchscreen.tap(kgBox.x + kgBox.width / 2, kgBox.y + kgBox.height / 2);
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]'));
    const afterKeypadEcho = await page.evaluate(() => {
      window.__renderCalls = 0;
      const input = document.querySelector('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]');
      window.__keypadInput = input || null;
      document.dispatchEvent(new CustomEvent('data:workouts-updated', {
        detail: { ownerId: 'harness-user', changedDateKeys: ['2026-07-04'], source: 'firestore' },
      }));
      return {
        hadInput: !!window.__keypadInput,
        renderCalls: window.__renderCalls,
        sameInput: window.__keypadInput === document.querySelector('[data-wt-set-inline-input][data-field="kg"][data-set-index="0"]'),
      };
    });

    return { afterEcho, afterOtherDate, afterKeypadEcho };
  });

  // 에코 하나로는 전체 렌더가 돌지 않고, 스크롤 컨테이너/시트 엘리먼트가 유지된다.
  assert.equal(result.afterEcho.renderCalls, 0);
  assert.equal(result.afterEcho.sameScroller, true);
  assert.equal(result.afterEcho.sameSheet, true);
  // 제자리 갱신이라도 행 상태는 캐시 모델대로 다시 그려져 완료 표시가 유지된다.
  assert.equal(result.afterEcho.rowDone, true);
  assert.equal(result.afterEcho.checkPressed, 'true');
  // 다른 날짜가 섞이면 억제하지 않는다 — 전체 렌더 1회.
  assert.equal(result.afterOtherDate.renderCalls, 1);
  // 키패드가 열려 있으면 전체 렌더도, 입력 엘리먼트 교체도 없다.
  assert.equal(result.afterKeypadEcho.hadInput, true);
  assert.equal(result.afterKeypadEcho.renderCalls, 0);
  assert.equal(result.afterKeypadEcho.sameInput, true);
});
