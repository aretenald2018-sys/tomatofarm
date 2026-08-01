import { readAppCssSync } from './helpers/css-source.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repoUrl(relativePath, suffix = '') {
  return `${pathToFileURL(path.join(repoRoot, relativePath)).href}${suffix}`;
}

async function writeStub(tempDir, name, source) {
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, source, 'utf8');
  return pathToFileURL(filePath).href;
}

test('rest counter uses circular stopwatch markup and double-click preset editing', () => {
  const html = read('index.html');

  assert.match(html, /class="[^"]*\bwt-rest-counter\b[^"]*"[^>]*data-dblclick-action="workout:open-rest-preset"/);
  assert.match(html, /<svg[^>]+class="[^"]*\bwt-rest-ring\b[^"]*"/);
  assert.match(html, /id="wt-rest-ring-progress"/);
  assert.match(html, /id="wt-rest-time"/);
});

test('rest counter styles include circular progress and overdue state', () => {
  const css = readAppCssSync();

  assert.match(css, /\.wt-rest-ring-progress/);
  assert.match(css, /stroke-dashoffset/);
  assert.match(css, /\.rest-expired[\s\S]*\.wt-rest-ring-progress/);
  assert.match(css, /\.wt-rest-counter/);
});

test('rest timer records set-level rest metadata and preserves it on save', () => {
  const timers = read('workout/timers.js');
  const exercises = read('workout/exercises.js');

  assert.match(timers, /export function wtRestTimerStart\(seconds, context, meta = \{\}\)/);
  assert.match(timers, /function _restTimerRecordOrigin/);
  assert.match(timers, /restStartedAt/);
  assert.match(timers, /restPlannedSec/);
  assert.match(timers, /restElapsedSec/);
  assert.match(timers, /restOverSec/);
  assert.match(timers, /restEndedBy/);
  assert.match(timers, /export function wtRestTimerClearSetRecord/);
  assert.match(exercises, /wtRestTimerStart\(null,[\s\S]*entryIdx,[\s\S]*setIdx: si/);
  assert.match(exercises, /wtRestTimerClearSetRecord\(entryIdx, si/);
});

test('workout day sheet set completion enters the shared rest and idle-limit flow', () => {
  const calendar = read('render-calendar.js');
  const helperStart = calendar.indexOf('async function _syncWorkoutRestAfterSheetSet');
  const helperEnd = calendar.indexOf('\nfunction _sessionLabel', helperStart);
  const toggleStart = calendar.indexOf('async function _toggleWorkoutExerciseSetDoneFromSheet');
  const toggleEnd = calendar.indexOf('\nasync function _completeWorkoutExerciseFromSheet', toggleStart);
  const completeStart = toggleEnd;
  const completeEnd = calendar.indexOf('\nasync function _addWorkoutHomeSession', completeStart);
  const helper = calendar.slice(helperStart, helperEnd);
  const toggle = calendar.slice(toggleStart, toggleEnd);
  const complete = calendar.slice(completeStart, completeEnd);

  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'sheet rest sync helper should exist');
  assert.match(helper, /_isTodayKey\(key\)/);
  assert.match(helper, /wtRefreshWorkoutTimelineDuration\('calendar sheet set done'\)/);
  assert.match(helper, /wtRestTimerStart\(null/);
  assert.match(helper, /wtRestTimerClearSetRecord\(entryIdx, targetSetIndex\)/);
  // renderHandled: 완료 체크의 휴식 메타데이터 저장이 sheet:saved → renderAll로
  // 시트를 다시 그리지 않도록 표시한다. 부분 갱신이 이미 화면을 맞춘 상태다.
  assert.match(helper, /await saveWorkoutDay\(\{ silent: true, renderHandled: true \}\)/);
  assert.match(toggle, /await _syncWorkoutRestAfterSheetSet\(key, sessionIndex, exerciseIndex, setIndex, savedDone\)/);
  assert.match(complete, /await _syncWorkoutRestAfterSheetSet\(key, sessionIndex, exerciseIndex, lastCompletedSetIndex, true\)/);
});

test('idle-limit recovery runs after workout hydration, same-day reopen, and native resume', () => {
  const load = read('workout/load.js');
  const app = read('app.js');
  const workoutGestures = read('app/workout-gestures.js');
  const sameDateStart = load.indexOf('if (isSameDate && targetSessionIndex');
  const sameDateEnd = load.indexOf('\n  resetWorkoutTypeUi();', sameDateStart);
  const sameDateBranch = load.slice(sameDateStart, sameDateEnd);
  const hydrationStart = load.indexOf('export function loadWorkoutDate');
  const hydrationEnd = load.indexOf('\nfunction _restoreFlowState', hydrationStart);
  const hydrationFlow = load.slice(hydrationStart, hydrationEnd);

  assert.match(load, /wtCheckWorkoutIdleLimit/);
  assert.match(sameDateBranch, /_recoverWorkoutIdleLimit\('same-date load'\)/);
  assert.match(hydrationFlow, /_recoverWorkoutIdleLimit\('date load'\)/);
  // 타이머 복구 진입점은 둘이다. 네이티브 재개는 app/workout-gestures.js 가,
  // 웹 포커스 복귀는 app.js 의 visibilitychange 가 담당한다. 어느 한쪽이
  // 이동하거나 사라지면 백그라운드 이후 휴식 타이머가 멈춘 채로 남는다.
  assert.match(workoutGestures, /addListener\('appStateChange',[\s\S]*event\.isActive[\s\S]*wtRecoverTimers\(\)/);
  assert.match(app, /visibilitychange[\s\S]*_currentTab === 'workout'[\s\S]*wtRecoverTimers\(\)/);
});

test('raw statistics export can include set rest intervals', () => {
  const save = read('workout/save.js');
  const schema = read('workout/save-schema.js');
  const stats = read('stats/raw-export.js');

  assert.match(save, /function _buildRestBetweenSets/);
  assert.match(save, /restBetweenSets:\s*_buildRestBetweenSets\(cleanEx\)/);
  assert.match(schema, /'restBetweenSets'/);
  assert.match(stats, /const _RAW_WORKOUT_KEYS = WORKOUT_PAYLOAD_KEYS/);
});

test('service worker cache is bumped for changed static assets', () => {
  const sw = read('sw.js');

  assert.match(sw, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});

async function runRestTimerRuntimeHarness() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-rest-timer-'));
  const htmlPath = path.join(tempDir, 'harness.html');
  try {
    const stateUrl = repoUrl('workout/state.js');
    const timersUrl = repoUrl('workout/timers.js');
    const stubSaveUrl = await writeStub(tempDir, 'stub-save.js', `
export async function saveWorkoutDay(options = {}) {
  window.__qaSaveCalls = window.__qaSaveCalls || [];
  window.__qaSaveCalls.push(options);
  return true;
}
`);
    const stubUtilsUrl = await writeStub(tempDir, 'stub-utils.js', `
export function showToast() {}
export function showCenterToast() {}
`);
    const stubConfirmUrl = await writeStub(tempDir, 'stub-confirm.js', `
export async function confirmAction() { return true; }
`);
    const stubDataUrl = await writeStub(tempDir, 'stub-data.js', `
export function getActiveTimer() { return null; }
export async function saveActiveTimer() { return true; }
export async function clearActiveTimer() { return true; }
export function getCurrentUser() { return { uid: 'rest-runtime-user' }; }
`);
    const importMap = {
      imports: {
        [repoUrl('workout/save.js')]: stubSaveUrl,
        [repoUrl('home/utils.js')]: stubUtilsUrl,
        [repoUrl('utils/confirm-modal.js')]: stubConfirmUrl,
        [repoUrl('data.js')]: stubDataUrl,
      },
    };
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify(importMap)}</script></head>
<body>
  <div id="wt-workout-timer-bar">
    <div id="wt-rest-section" style="display:none">
      <div class="wt-rest-counter" ondblclick="wtOpenRestPresetSheet()">
        <svg class="wt-rest-ring"><circle id="wt-rest-ring-progress"></circle></svg>
        <span id="wt-rest-time"></span>
      </div>
      <span id="wt-rest-context"></span>
    </div>
    <div id="wt-tbar-progress" style="display:none"><div id="wt-rest-fill"></div></div>
    <button id="wt-rest-minus-btn" type="button"></button>
    <button id="wt-rest-plus-btn" type="button"></button>
    <button id="wt-rest-skip-btn" type="button"></button>
    <button id="wt-timer-pause-btn" type="button"></button>
    <button id="wt-timer-play-btn" type="button"></button>
    <button id="wt-timer-reset-btn" type="button"></button>
    <button id="wt-finish-workout-btn" type="button"></button>
  </div>
  <div id="wt-workout-timer"></div>
  <div id="wt-workout-duration-result"></div>
  <textarea id="wt-workout-memo"></textarea>
<script type="module">
try {
  let now = new Date(2026, 6, 7, 23, 50, 0).getTime();
  const startNow = now;
  const RealDate = Date;
  class TestDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  window.Date = TestDate;
  window.__qaSaveCalls = [];
  window.__qaTimerTicks = [];
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.setInterval = (fn) => {
    window.__qaTimerTicks.push(fn);
    return window.__qaTimerTicks.length;
  };
  window.clearInterval = () => {};
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const state = await import(${JSON.stringify(stateUrl)});
  const timers = await import(${JSON.stringify(timersUrl)});
  window.wtOpenRestPresetSheet = timers.wtOpenRestPresetSheet;
  const today = new Date();
  state.S.shared.date = { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
  state.S.workout.exercises = [{
    exerciseId: 'bench',
    name: 'Bench Press',
    sets: [{ kg: 100, reps: 5, done: true, setType: 'main', completedAt: now }]
  }];

  timers.wtRestTimerStart(60, 'Bench Press set 1', { entryIdx: 0, setIdx: 0 });
  const setAfterStart = state.S.workout.exercises[0].sets[0];
  const afterStart = {
    restStartedAt: setAfterStart.restStartedAt,
    restPlannedSec: setAfterStart.restPlannedSec,
    restElapsedSec: setAfterStart.restElapsedSec,
    restOverSec: setAfterStart.restOverSec,
    restEndedBy: setAfterStart.restEndedBy,
    time: document.getElementById('wt-rest-time')?.textContent || '',
    hasRest: document.getElementById('wt-workout-timer-bar')?.classList.contains('has-rest') || false,
  };

  now += 75000;
  window.__qaTimerTicks.at(-1)();
  const after75s = {
    time: document.getElementById('wt-rest-time')?.textContent || '',
    expired: document.getElementById('wt-workout-timer-bar')?.classList.contains('rest-expired') || false,
  };

  document.querySelector('.wt-rest-counter')?.dispatchEvent(new MouseEvent('dblclick', {
    bubbles: true,
    cancelable: true,
  }));
  await nextFrame();
  const sheetExists = !!document.querySelector('.wt-rest-sheet-back');

  timers.wtRestTimerSkip();
  const setAfterSkip = state.S.workout.exercises[0].sets[0];
  const afterSkip = {
    restPlannedSec: setAfterSkip.restPlannedSec,
    restElapsedSec: setAfterSkip.restElapsedSec,
    restOverSec: setAfterSkip.restOverSec,
    restEndedBy: setAfterSkip.restEndedBy,
    restEndedAt: setAfterSkip.restEndedAt,
  };
  timers.wtRestTimerStart(60, 'Bench Press inactivity limit', { entryIdx: 0, setIdx: 0 });
  now += 30 * 60 * 1000;
  document.dispatchEvent(new Event('visibilitychange'));
  await nextFrame();
  await nextFrame();
  const autoEnded = state.S.workout.workoutTimeline?.endedBy === 'idle-limit';
  window.__qaDone = {
    startNow,
    loadedDate: { ...state.S.shared.date },
    currentDate: { y: new Date().getFullYear(), m: new Date().getMonth(), d: new Date().getDate() },
    afterStart,
    after75s,
    sheetExists,
    afterSkip,
    autoEnded,
    autoRest: {
      running: state.S.workout.restTimer.running,
      restElapsedSec: setAfterSkip.restElapsedSec,
      restEndedBy: setAfterSkip.restEndedBy,
      restEndedAt: setAfterSkip.restEndedAt,
    },
    timeline: state.S.workout.workoutTimeline,
    durationResult: document.getElementById('wt-workout-duration-result')?.textContent || '',
    saveCalls: window.__qaSaveCalls,
  };
} catch (e) {
  window.__qaError = String(e && (e.stack || e.message) || e);
}
</script>
</body></html>`, 'utf8');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--allow-file-access-from-files'],
    });
    let page;
    try {
      page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__qaDone || window.__qaError, { timeout: 15000 });
      const result = await page.evaluate(() => ({ done: window.__qaDone || null, error: window.__qaError || null }));
      assert.equal(result.error, null);
      assert.deepEqual(pageErrors, []);
      return result.done;
    } finally {
      if (page) await page.close();
      await browser.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('runtime rest timer auto-finishes across midnight at the 15-minute idle limit', async () => {
  const result = await runRestTimerRuntimeHarness();

  assert.equal(result.afterStart.restStartedAt, new Date(result.startNow).toISOString());
  assert.equal(result.afterStart.restPlannedSec, 60);
  assert.equal(result.afterStart.restElapsedSec, 0);
  assert.equal(result.afterStart.restOverSec, 0);
  assert.equal(result.afterStart.restEndedBy, null);
  assert.equal(result.afterStart.time, '1:00');
  assert.equal(result.afterStart.hasRest, true);
  assert.equal(result.after75s.time, '+0:15');
  assert.equal(result.after75s.expired, true);
  assert.equal(result.sheetExists, true);
  assert.equal(result.afterSkip.restPlannedSec, 60);
  assert.equal(result.afterSkip.restElapsedSec, 75);
  assert.equal(result.afterSkip.restOverSec, 15);
  assert.equal(result.afterSkip.restEndedBy, 'skip');
  assert.equal(result.afterSkip.restEndedAt, new Date(result.startNow + 75000).toISOString());
  assert.notDeepEqual(result.currentDate, result.loadedDate);
  assert.equal(result.autoEnded, true);
  assert.equal(result.autoRest.running, false);
  assert.equal(result.autoRest.restElapsedSec, (15 * 60) - 75);
  assert.equal(result.autoRest.restEndedBy, 'idle-limit');
  assert.equal(result.autoRest.restEndedAt, new Date(result.startNow + (15 * 60 * 1000)).toISOString());
  assert.equal(result.timeline.endedBy, 'idle-limit');
  assert.equal(result.timeline.endedAt, result.startNow + (15 * 60 * 1000));
  assert.equal(result.timeline.endedAfterSetCompletedAt, result.startNow);
  assert.equal(result.durationResult, '총 0초');
  assert.equal(result.saveCalls.length, 2);
  assert.deepEqual(result.saveCalls[0], { silent: true });
  assert.deepEqual(result.saveCalls[1], {});
});

async function runRestSaveExportHarness() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-rest-save-export-'));
  const htmlPath = path.join(tempDir, 'harness.html');
  try {
    const stateUrl = repoUrl('workout/state.js');
    const saveUrl = repoUrl('workout/save.js');
    const statsUrl = repoUrl('render-stats.js');
    const stubDataUrl = await writeStub(tempDir, 'stub-data.js', `
const pad = (value) => String(value).padStart(2, '0');
const keyOf = (y, m, d) => y + '-' + pad(Number(m) + 1) + '-' + pad(d);
export const TODAY = new Date('2026-07-07T12:00:00.000Z');
export async function saveDay(key, payload, opts = {}) {
  window.__qaSaved = { key, payload: JSON.parse(JSON.stringify(payload)), opts };
  window.__qaCache = { ...(window.__qaCache || {}), [key]: window.__qaSaved.payload };
  return true;
}
export async function saveRunningRoute() {
  throw new Error('manual workout must not persist a running route');
}
export function dateKey(y, m, d) { return keyOf(y, m, d); }
export function isFuture() { return false; }
export function trackEvent() {}
export function getExList() { return [{ id: 'bench', name: 'Bench Press', movementId: 'bench-press', muscleIds: ['chest'] }]; }
export function getDay(y, m, d) { return (window.__qaCache || {})[keyOf(y, m, d)] || {}; }
export function getDietPlan() { return { advancedMode: false, dietTolerance: 50 }; }
export function getDayTargetKcal() { return 0; }
export function isDietDaySuccess() { return null; }
export function getMuscles() { return []; }
export function getCF() { return []; }
export function getDiet(y, m, d) { return getDay(y, m, d); }
export function dietDayOk() { return null; }
export function daysInMonth() { return 31; }
export function getAllMuscles() { return []; }
export function getVolumeHistory() { return []; }
export function getCache() { return window.__qaCache || {}; }
export function calcVolume() { return 0; }
export function getExercises() { return []; }
export function getBodyCheckins() { return []; }
export function hasExerciseRecord(y, m, d) { return !!getDay(y, m, d).exercises?.length; }
export function hasDietRecord() { return false; }
export function getRawBodyCheckins() { return []; }
`);
    const stubUtilsUrl = await writeStub(tempDir, 'stub-utils.js', `
export function showCenterToast() {}
`);
    const stubConfigUrl = await writeStub(tempDir, 'stub-config.js', `
export const MOVEMENTS = [{ id: 'bench-press', primary: 'chest', subPattern: 'chest_all' }];
`);
    const stubCrossDomainUrl = await writeStub(tempDir, 'stub-cross-domain.js', `
export function deriveActivityFlagsFromDetails(workout = {}) {
  return {
    cf: !!workout.cf,
    running: !!workout.running,
    swimming: !!workout.swimming,
    stretching: !!workout.stretching,
  };
}
export function deriveDietSuccessFromWorkout() { return null; }
`);
    const stubVolumeUrl = await writeStub(tempDir, 'stub-volume.js', `
export function calcSetVolume(set = {}) {
  return (Number(set.kg) || 0) * (Number(set.reps) || 0);
}
`);
    const stubLifeZoneUrl = await writeStub(tempDir, 'stub-life-zone.js', `
export function hasLifeZoneDietActivity() { return false; }
export function hasLifeZoneRunningActivity() { return false; }
export function hasLifeZoneWorkoutActivity() { return false; }
`);
    const stubTimelineUrl = await writeStub(tempDir, 'stub-timeline.js', `
export function buildWorkoutSetTimeline(exercises = [], durationSec = 0) {
  const checkedSetCount = exercises.reduce((sum, entry) => {
    return sum + (entry.sets || []).filter(set => set?.done === true).length;
  }, 0);
  return { mode: 'set-completion', durationSec: Number(durationSec) || 0, checkedSetCount };
}
export function normalizeSetCompletedAt(value) { return value ?? null; }
`);
    const stubCalcUrl = await writeStub(tempDir, 'stub-calc.js', `
export const SUBPATTERN_TO_MAJOR = {};
export function calcBurnedKcal() { return { total: 0 }; }
export function calcVolume() { return 0; }
`);
    const importMap = {
      imports: {
        [repoUrl('data.js')]: stubDataUrl,
        [repoUrl('home/utils.js')]: stubUtilsUrl,
        [repoUrl('config.js')]: stubConfigUrl,
        [repoUrl('workout/cross-domain.js')]: stubCrossDomainUrl,
        [repoUrl('calc/volume.js')]: stubVolumeUrl,
        [repoUrl('home/life-zone-state.js')]: stubLifeZoneUrl,
        [repoUrl('workout/timeline.js')]: stubTimelineUrl,
        [repoUrl('calc.js')]: stubCalcUrl,
      },
    };
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify(importMap)}</script></head>
<body>
  <button id="wt-save-btn" type="button">Save</button>
  <textarea id="wt-workout-memo"></textarea>
<script type="module">
try {
  window.__qaCache = {};
  window._mealPhotos = {};
  Date.now = () => Date.parse('2026-07-07T00:01:15.000Z');
  const state = await import(${JSON.stringify(stateUrl)});
  const save = await import(${JSON.stringify(saveUrl)});
  const stats = await import(${JSON.stringify(statsUrl)});
  state.S.shared.date = { y: 2026, m: 6, d: 7 };
  state.S.workout.exercises = [{
    exerciseId: 'bench',
    movementId: 'bench-press',
    muscleIds: ['chest'],
    name: 'Bench Press',
    sets: [{
      kg: 100,
      reps: 5,
      done: true,
      setType: 'main',
      restStartedAt: '2026-07-07T00:00:00.000Z',
      restPlannedSec: 60,
      restEndedAt: '2026-07-07T00:01:15.000Z',
      restElapsedSec: 75,
      restOverSec: 15,
      restEndedBy: 'skip',
    }],
  }];
  await save.saveWorkoutDay({ silent: true });
  const savedRecord = window.__qaSaved.payload.restBetweenSets[0];
  const rawExport = stats.buildStatsRawExport();
  const daily = rawExport.daily.find(row => row.date === '2026-07-07');
  window.__qaDone = {
    saveKey: window.__qaSaved.key,
    saveOpts: window.__qaSaved.opts,
    savedRecord,
    rawRecord: daily?.raw?.workout?.restBetweenSets?.[0] || null,
  };
} catch (e) {
  window.__qaError = String(e && (e.stack || e.message) || e);
}
</script>
</body></html>`, 'utf8');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--allow-file-access-from-files'],
    });
    let page;
    try {
      page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__qaDone || window.__qaError, { timeout: 15000 });
      const result = await page.evaluate(() => ({ done: window.__qaDone || null, error: window.__qaError || null }));
      assert.equal(result.error, null);
      assert.deepEqual(pageErrors, []);
      return result.done;
    } finally {
      if (page) await page.close();
      await browser.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('runtime save payload and raw stats export preserve set rest intervals', async () => {
  const result = await runRestSaveExportHarness();
  const expectedRecord = {
    exerciseId: 'bench',
    exerciseName: 'Bench Press',
    entryIdx: 0,
    setIdx: 0,
    setNumber: 1,
    plannedSec: 60,
    elapsedSec: 75,
    overSec: 15,
    startedAt: '2026-07-07T00:00:00.000Z',
    endedAt: '2026-07-07T00:01:15.000Z',
    endedBy: 'skip',
  };

  assert.equal(result.saveKey, '2026-07-07');
  assert.deepEqual(result.saveOpts, { rethrow: true, mode: 'merge' });
  assert.deepEqual(result.savedRecord, expectedRecord);
  assert.deepEqual(result.rawRecord, expectedRecord);
});
