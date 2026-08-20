import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repoUrl(relativePath) {
  return pathToFileURL(path.join(repoRoot, relativePath)).href;
}

async function writeStub(tempDir, name, source) {
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, source, 'utf8');
  return pathToFileURL(filePath).href;
}

async function replaceNumberInput(page, selector, value) {
  await page.click(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.type(selector, String(value));
}

test('workout set edits preserve the pending pointer target and refresh presentation without stale state', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-workout-set-input-'));
  const htmlPath = path.join(tempDir, 'harness.html');
  let browser;

  try {
    const stateUrl = repoUrl('workout/state.js');
    const exercisesUrl = repoUrl('workout/exercises.js');
    const stubDataUrl = await writeStub(tempDir, 'stub-data.js', `
const EXERCISES = [{ id: 'bench-press', name: '벤치프레스', muscleId: 'chest', movementId: 'horizontal-press' }];
export function getExList() { return EXERCISES; }
export function getGlobalExList() { return EXERCISES; }
export function getGymExList() { return []; }
export function getGyms() { return []; }
export function getLastSession() { return null; }
export function detectPRs() { return []; }
export function getSeasonDecisionCache() { return {}; }
export function dateKey() { return '2026-07-18'; }
export async function saveExercise() { return true; }
export async function deleteExercise() { return true; }
export function getMuscleParts() { return [{ id: 'chest', name: '가슴', color: '#334155' }]; }
export async function saveCustomMuscle() { return true; }
export function isExpertModeEnabled() { return false; }
export function getExpertPreset() { return { mode: 'normal' }; }
export function getExpertMode() { return 'normal'; }
export function getMaxCycle() { return null; }
export function getTestBoardV2() { return null; }
export async function saveTestBoardV2() { return true; }
`);
    const stubSaveUrl = await writeStub(tempDir, 'stub-save.js', `
export async function saveWorkoutDay() {
  window.__qaSaves = (window.__qaSaves || 0) + 1;
  return true;
}
`);
    const stubTimersUrl = await writeStub(tempDir, 'stub-timers.js', `
export function wtRestTimerStart() {}
export function wtRestTimerClearSetRecord() {}
export function wtRefreshWorkoutTimelineDuration() {}
export function wtPersistActiveWorkoutDraft() {}
`);
    const stubCalcUrl = await writeStub(tempDir, 'stub-calc.js', `
export const SUBPATTERN_TO_MAJOR = {};
export function estimate1RM() { return 0; }
export function estimateSet1RM() { return 0; }
export function rpeRepsToPct() { return 0; }
export function targetWeightKg() { return 0; }
export function weightRange() { return [0, 0]; }
export function getTrackMetricHistory(cache) {
  const set = cache?.['2026-07-18']?.exercises?.[0]?.sets?.[0];
  const volume = (Number(set?.kg) || 0) * (Number(set?.reps) || 0);
  return {
    M: volume > 0 ? [{ value: 400 }, { value: volume }] : [],
    H: [],
    unclassified: 0,
  };
}
export function getWendlerMetricHistory() { return { W: [] }; }
export function getLastTrackSession() { return null; }
export function normalizeWorkoutTrack(value) { return value || null; }
export function calcSetVolume(set) { return (Number(set?.kg) || 0) * (Number(set?.reps) || 0); }
export function isWendlerWorkoutEntry() { return false; }
`);
    const stubMaxPickerUrl = await writeStub(tempDir, 'stub-max-picker.js', `
export function buildMaxPickerExerciseEntry() { return null; }
export function resolveMaxBenchmarkPickerItems() { return []; }
`);
    const stubEditorUrl = await writeStub(tempDir, 'stub-editor.js', `
export function buildExerciseEditorRecord() { return null; }
export function customExerciseMuscleId(value) { return value || null; }
export function exerciseEditorRecordId(value) { return value || ''; }
export function verifyExerciseEditorSavedRecord() { return true; }
`);
    const stubEntryUrl = await writeStub(tempDir, 'stub-entry.js', `
export function findWorkoutEntryIndexByExerciseId() { return -1; }
export function selectWorkoutExerciseEntry() {}
export function workoutExerciseSelectionDetail(value) { return value; }
`);
    const stubBoardUrl = await writeStub(tempDir, 'stub-board.js', `
export function buildExerciseProgramWorkoutPrescription() { return null; }
export function findExerciseProgramBenchmark() { return null; }
export function getExerciseProgramSettings() { return null; }
export function mondayOf(value) { return value; }
export function orderWendlerPrescriptionSets(value) { return value || []; }
export function upsertExerciseProgramBenchmark() { return null; }
`);
    const stubSessionsUrl = await writeStub(tempDir, 'stub-sessions.js', `
export function getWorkoutSessions() { return []; }
`);
    const stubExpertUrl = await writeStub(tempDir, 'stub-expert.js', `
export function resolveCurrentGymId() { return null; }
export function isExpertViewShown() { return false; }
`);
    const stubRunningUrl = await writeStub(tempDir, 'stub-running.js', `
export function wtOpenRunningSession() {}
`);
    const stubToastUrl = await writeStub(tempDir, 'stub-toast.js', `
export function showToast() {}
`);
    const stubConfirmUrl = await writeStub(tempDir, 'stub-confirm.js', `
export async function confirmAction() { return true; }
`);
    const stubConfigUrl = await writeStub(tempDir, 'stub-config.js', `
export const MOVEMENTS = [];
`);

    const importMap = {
      imports: {
        [repoUrl('data.js')]: stubDataUrl,
        [repoUrl('workout/save.js')]: stubSaveUrl,
        [repoUrl('workout/timers.js')]: stubTimersUrl,
        [repoUrl('calc.js')]: stubCalcUrl,
        [repoUrl('workout/expert/max-benchmark-picker.js')]: stubMaxPickerUrl,
        [repoUrl('workout/exercise-editor-actions.js')]: stubEditorUrl,
        [repoUrl('workout/exercise-entry-actions.js')]: stubEntryUrl,
        [repoUrl('workout/test-v2/board-core.js')]: stubBoardUrl,
        [repoUrl('workout/sessions.js')]: stubSessionsUrl,
        [repoUrl('workout/expert.js')]: stubExpertUrl,
        [repoUrl('workout/running-session.js')]: stubRunningUrl,
        [repoUrl('ui/toast.js')]: stubToastUrl,
        [repoUrl('utils/confirm-modal.js')]: stubConfirmUrl,
        [repoUrl('config.js')]: stubConfigUrl,
      },
    };

    await writeFile(htmlPath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <script type="importmap">${JSON.stringify(importMap)}</script>
</head>
<body>
  <div id="wt-exercise-list"></div>
  <div id="embedded-host"></div>
  <button type="button" id="external-blur">외부 버튼</button>
  <script type="module">
    try {
      const state = await import(${JSON.stringify(stateUrl)});
      const exercises = await import(${JSON.stringify(exercisesUrl)});

      function reset(options = {}) {
        const done = options.done !== false;
        state.S.shared.date = { y: 2026, m: 7, d: 18 };
        state.S.workout.exercises = [{
          muscleId: 'chest',
          exerciseId: 'bench-press',
          movementId: 'horizontal-press',
          name: '벤치프레스',
          sets: [{ kg: 80, reps: 10, rpe: null, romPct: 100, setType: 'main', done }],
        }];
        exercises._renderExerciseList();
        exercises.renderEmbeddedMaxExerciseCard(document.getElementById('embedded-host'), 0, { hideRemove: false });
        window.__qaTrackedRootRepsInput = document.querySelector('#wt-exercise-list [data-wt-set-field="reps"]');
        window.__qaTrackedEmbeddedRepsInput = document.querySelector('#embedded-host [data-wt-set-field="reps"]');
      }

      function surfaceSnapshot(scope) {
        const row = scope?.querySelector('.set-row') || null;
        const card = scope?.querySelector('.ex-block') || null;
        const currentRepsInput = scope?.querySelector('[data-wt-set-field="reps"]') || null;
        return {
          hasRow: !!row,
          currentRepsInput,
          rowDone: row?.classList.contains('done') === true,
          doneButtonDone: row?.querySelector('.set-done-btn')?.classList.contains('done') === true,
          cardComplete: card?.classList.contains('is-complete') === true,
          primaryDone: card?.querySelector('.ex-max-v2-primary')?.classList.contains('is-done') === true,
          header: card?.querySelector('.ex-max-v2-main')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          graphValue: card?.querySelector('.ex-max-track-graph-row[data-track="M"] .ex-max-track-graph-value')?.dataset.value || '',
          kgValue: scope?.querySelector('[data-wt-set-field="kg"]')?.value || '',
          repsValue: scope?.querySelector('[data-wt-set-field="reps"]')?.value || '',
        };
      }

      function snapshot() {
        const entry = state.S.workout.exercises[0] || null;
        const set = entry?.sets?.[0] || null;
        const root = surfaceSnapshot(document.getElementById('wt-exercise-list'));
        const embedded = surfaceSnapshot(document.getElementById('embedded-host'));
        return {
          set: set ? {
            kg: set.kg,
            reps: set.reps,
            rpe: set.rpe,
            romPct: set.romPct,
            done: set.done,
          } : null,
          setCount: entry?.sets?.length ?? 0,
          trackedRootRepsConnected: window.__qaTrackedRootRepsInput?.isConnected === true,
          sameRootRepsInput: window.__qaTrackedRootRepsInput === root.currentRepsInput,
          trackedEmbeddedRepsConnected: window.__qaTrackedEmbeddedRepsInput?.isConnected === true,
          sameEmbeddedRepsInput: window.__qaTrackedEmbeddedRepsInput === embedded.currentRepsInput,
          root: { ...root, currentRepsInput: undefined },
          embedded: { ...embedded, currentRepsInput: undefined },
        };
      }

      window.__qa = { reset, snapshot };
      reset();
      window.__qaReady = true;
    } catch (error) {
      window.__qaError = String(error?.stack || error?.message || error);
    }
  </script>
</body>
</html>`, 'utf8');

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--allow-file-access-from-files',
        ...(typeof process.getuid === 'function' && process.getuid() === 0
          ? ['--no-sandbox', '--disable-setuid-sandbox']
          : []),
      ],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__qaReady || window.__qaError, { timeout: 15000 });
    const setupError = await page.evaluate(() => window.__qaError || null);
    assert.equal(setupError, null);

    await replaceNumberInput(page, '#wt-exercise-list [data-wt-set-field="kg"]', 90);
    await page.click('#wt-exercise-list [data-wt-set-field="reps"]');
    await page.click('#external-blur');
    const blurResult = await page.evaluate(() => window.__qa.snapshot());
    assert.deepEqual(blurResult.set, { kg: 90, reps: 10, rpe: null, romPct: 100, done: false });
    assert.equal(blurResult.trackedRootRepsConnected, true);
    assert.equal(blurResult.sameRootRepsInput, true);
    assert.equal(blurResult.trackedEmbeddedRepsConnected, true);
    assert.equal(blurResult.sameEmbeddedRepsInput, true);
    for (const surface of [blurResult.root, blurResult.embedded]) {
      assert.equal(surface.rowDone, false);
      assert.equal(surface.doneButtonDone, false);
      assert.equal(surface.cardComplete, false);
      assert.equal(surface.primaryDone, false);
      assert.equal(surface.header, '90kg × 10회');
      assert.equal(surface.graphValue, '900kg');
      assert.equal(surface.kgValue, '90');
      assert.equal(surface.repsValue, '10');
    }

    await page.evaluate(() => window.__qa.reset());
    await replaceNumberInput(page, '#embedded-host [data-wt-set-field="kg"]', 95);
    await page.click('#external-blur');
    const embeddedEditResult = await page.evaluate(() => window.__qa.snapshot());
    assert.deepEqual(embeddedEditResult.set, { kg: 95, reps: 10, rpe: null, romPct: 100, done: false });
    for (const surface of [embeddedEditResult.root, embeddedEditResult.embedded]) {
      assert.equal(surface.rowDone, false);
      assert.equal(surface.cardComplete, false);
      assert.equal(surface.header, '95kg × 10회');
      assert.equal(surface.graphValue, '950kg');
      assert.equal(surface.kgValue, '95');
      assert.equal(surface.repsValue, '10');
    }

    await page.evaluate(() => window.__qa.reset());
    await replaceNumberInput(page, '#wt-exercise-list [data-wt-set-field="kg"]', 90);
    await page.click('#wt-exercise-list .set-done-btn');
    const kgDoneResult = await page.evaluate(() => window.__qa.snapshot());
    assert.deepEqual(kgDoneResult.set, { kg: 90, reps: 10, rpe: null, romPct: 100, done: true });

    await page.evaluate(() => window.__qa.reset());
    await replaceNumberInput(page, '#wt-exercise-list [data-wt-set-field="kg"]', 90);
    await page.click('#wt-exercise-list .set-remove-btn');
    const kgRemoveResult = await page.evaluate(() => window.__qa.snapshot());
    assert.equal(kgRemoveResult.setCount, 0);
    assert.equal(kgRemoveResult.set, null);

    await page.evaluate(() => window.__qa.reset({ done: false }));
    await replaceNumberInput(page, '#wt-exercise-list .set-rpe-input', 3);
    await page.click('#wt-exercise-list .set-done-btn');
    const doneResult = await page.evaluate(() => window.__qa.snapshot());
    assert.deepEqual(doneResult.set, { kg: 80, reps: 10, rpe: 7, romPct: 100, done: true });
    for (const surface of [doneResult.root, doneResult.embedded]) {
      assert.equal(surface.rowDone, true);
      assert.equal(surface.doneButtonDone, true);
      assert.equal(surface.cardComplete, true);
      assert.equal(surface.primaryDone, true);
    }

    await page.evaluate(() => window.__qa.reset());
    await replaceNumberInput(page, '#embedded-host .set-rom-input', 8);
    await page.click('#embedded-host .set-remove-btn');
    const removeResult = await page.evaluate(() => window.__qa.snapshot());
    assert.equal(removeResult.setCount, 0);
    assert.equal(removeResult.set, null);
    assert.equal(removeResult.root.hasRow, false);
    assert.equal(removeResult.embedded.hasRow, false);

    assert.deepEqual(pageErrors, []);
  } finally {
    if (browser) await browser.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
