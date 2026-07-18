import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRunningRoutePreview } from '../workout/running-route-store.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repoUrl(relativePath) {
  return pathToFileURL(path.join(repoRoot, relativePath)).href;
}

function canonicalRoute(pointCount = 620) {
  return Array.from({ length: pointCount }, (_, index) => ({
    lat: 37.5 + (index * 0.00001),
    lng: 127 + (Math.sin(index / 17) * 0.001),
    ts: 1_720_000_000_000 + (index * 1_000),
    accuracy: 4 + (index % 5),
    segmentId: index < 310 ? 0 : 1,
    ...(index === 310 ? { gapBefore: true, gapReason: 'gps-timeout' } : {}),
  }));
}

function routeRef(pointCount = 620, revision = 'a'.repeat(64), firstTimestampMs = 1_720_000_000_000) {
  return {
    version: 1,
    routeId: `v1-${firstTimestampMs}-${revision}`,
    revision,
    pointCount,
    chunkCount: Math.ceil(pointCount / 250),
    firstTimestampMs,
    lastTimestampMs: firstTimestampMs + ((pointCount - 1) * 1_000),
  };
}

function workoutState(runData, existingDay = {}) {
  return {
    shared: { date: { y: 2026, m: 6, d: 10 } },
    workout: {
      sessionIndex: 0,
      sessionId: 'session-1',
      exercises: [],
      cf: false,
      stretching: false,
      swimming: false,
      running: !!(runData.route?.length || runData.routeRef),
      runData,
      cfData: { wod: '', durationMin: 0, durationSec: 0, memo: '' },
      stretchData: { duration: 0, memo: '' },
      swimData: { distance: 0, durationMin: 0, durationSec: 0, stroke: '', memo: '' },
      wineFree: false,
      workoutDuration: 0,
      workoutTimeline: null,
      currentGymId: null,
      pickerGymFilter: null,
      routineMeta: null,
      maxMeta: null,
    },
    diet: {
      breakfast: '', lunch: '', dinner: '', snack: '',
      bFoods: [], lFoods: [], dFoods: [], sFoods: [],
      bKcal: 0, lKcal: 0, dKcal: 0, sKcal: 0,
      breakfastSkipped: false, lunchSkipped: false, dinnerSkipped: false,
    },
    existingDay,
  };
}

async function writeModule(tempDir, name, source) {
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, source, 'utf8');
  return pathToFileURL(filePath).href;
}

function replaceImport(source, specifier, replacement, required = true) {
  const quoted = `'${specifier}'`;
  if (!source.includes(quoted)) {
    if (required) assert.fail(`save harness import not found: ${specifier}`);
    return source;
  }
  return source.replace(quoted, JSON.stringify(replacement));
}

async function runSaveHarness({ runData, existingDay = {}, savedRef = routeRef(), routeError = null }) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-running-route-save-'));
  const previous = {
    state: globalThis.__routeSaveState,
    calls: globalThis.__routeSaveCalls,
    existingDay: globalThis.__routeExistingDay,
    savedRef: globalThis.__routeSavedRef,
    routeError: globalThis.__routeSaveError,
    document: globalThis.document,
    window: globalThis.window,
    CustomEvent: globalThis.CustomEvent,
  };
  try {
    const state = workoutState(runData, existingDay);
    globalThis.__routeSaveState = state;
    globalThis.__routeSaveCalls = [];
    globalThis.__routeExistingDay = existingDay;
    globalThis.__routeSavedRef = savedRef;
    globalThis.__routeSaveError = routeError;
    globalThis.window = { _mealPhotos: {}, showToast() {} };
    globalThis.document = { getElementById() { return null; }, dispatchEvent() {} };
    globalThis.CustomEvent = class CustomEvent { constructor(type) { this.type = type; } };

    const stateStub = await writeModule(tempDir, 'state.js', 'export const S = globalThis.__routeSaveState;\n');
    const dataStub = await writeModule(tempDir, 'data.js', `
export async function saveRunningRoute(points) {
  globalThis.__routeSaveCalls.push({ type: 'saveRunningRoute', points: structuredClone(points) });
  if (globalThis.__routeSaveError) throw globalThis.__routeSaveError;
  return structuredClone(globalThis.__routeSavedRef);
}
export async function saveDay(key, payload, options) {
  globalThis.__routeSaveCalls.push({ type: 'saveDay', key, payload: structuredClone(payload), options });
  return true;
}
export function dateKey(y, m, d) { return [y, String(m + 1).padStart(2, '0'), String(d).padStart(2, '0')].join('-'); }
export function isFuture() { return false; }
export function trackEvent() {}
export function getExList() { return []; }
export function getDay() { return globalThis.__routeExistingDay; }
`);
    const utilsStub = await writeModule(tempDir, 'utils.js', 'export function showCenterToast() {}\n');
    const crossDomainStub = await writeModule(tempDir, 'cross-domain.js', `
export function deriveActivityFlagsFromDetails(workout) {
  return { cf: !!workout.cf, running: !!workout.running, swimming: !!workout.swimming, stretching: !!workout.stretching };
}
export function deriveDietSuccessFromWorkout() { return null; }
`);
    const configStub = await writeModule(tempDir, 'config.js', 'export const MOVEMENTS = [];\n');
    const volumeStub = await writeModule(tempDir, 'volume.js', 'export function calcSetVolume() { return 0; }\n');
    const lifeZoneStub = await writeModule(tempDir, 'life-zone.js', `
export function hasLifeZoneDietActivity() { return false; }
export function hasLifeZoneRunningActivity() { return false; }
export function hasLifeZoneWorkoutActivity() { return false; }
`);
    const timelineStub = await writeModule(tempDir, 'timeline.js', `
export function buildWorkoutSetTimeline(_exercises, durationSec = 0) { return { mode: 'set-completion', durationSec, checkedSetCount: 0 }; }
export function normalizeSetCompletedAt(value) { return value ?? null; }
`);
    const toastStub = await writeModule(tempDir, 'toast.js', `
export function showToast(...args) { return globalThis.window?.showToast?.(...args); }
`);

    let saveSource = readFileSync(path.join(repoRoot, 'workout/save.js'), 'utf8');
    const replacements = [
      ['./state.js', stateStub],
      ['../home/utils.js', utilsStub],
      ['../data.js', dataStub],
      ['./save-schema.js', repoUrl('workout/save-schema.js')],
      ['./cross-domain.js', crossDomainStub],
      ['../config.js', configStub],
      ['../calc/volume.js', volumeStub],
      ['./save-pure.js', repoUrl('workout/save-pure.js')],
      ['./sessions.js', repoUrl('workout/sessions.js')],
      ['../home/life-zone-state.js', lifeZoneStub],
      ['./timeline.js', timelineStub],
      ['../data/running-route-storage-plan.js', repoUrl('data/running-route-storage-plan.js')],
      ['../diet/photo-store.js', repoUrl('diet/photo-store.js')],
      ['../ui/toast.js', toastStub],
    ];
    for (const [specifier, replacement] of replacements) {
      saveSource = replaceImport(saveSource, specifier, replacement);
    }
    saveSource = replaceImport(
      saveSource,
      './running-route-store.js',
      repoUrl('workout/running-route-store.js'),
      false,
    );
    const saveUrl = await writeModule(tempDir, 'save-under-test.js', saveSource);
    const save = await import(`${saveUrl}?case=${Date.now()}-${Math.random()}`);
    try {
      const result = await save.saveWorkoutDay({ silent: true });
      return { result, error: null, calls: structuredClone(globalThis.__routeSaveCalls), state };
    } catch (error) {
      return { result: null, error, calls: structuredClone(globalThis.__routeSaveCalls), state };
    }
  } finally {
    globalThis.__routeSaveState = previous.state;
    globalThis.__routeSaveCalls = previous.calls;
    globalThis.__routeExistingDay = previous.existingDay;
    globalThis.__routeSavedRef = previous.savedRef;
    globalThis.__routeSaveError = previous.routeError;
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.CustomEvent = previous.CustomEvent;
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('620-point GPS save writes immutable full route before day preview and preserves full memory route', async () => {
  const fullRoute = canonicalRoute();
  const expectedRef = routeRef();
  const runData = {
    distance: 7.4,
    durationMin: 42,
    durationSec: 12,
    memo: '',
    source: 'gps',
    startedAt: fullRoute[0].ts,
    endedAt: fullRoute.at(-1).ts,
    route: fullRoute,
    routeRef: null,
    routeSummary: { source: 'gps', pointCount: 620, distanceKm: 7.4 },
  };

  const out = await runSaveHarness({ runData, savedRef: expectedRef });

  assert.equal(out.result, true);
  assert.deepEqual(out.calls.map(call => call.type), ['saveRunningRoute', 'saveDay']);
  assert.deepEqual(out.calls[0].points, fullRoute);
  const payload = out.calls[1].payload;
  const preview = buildRunningRoutePreview(fullRoute);
  assert.equal(payload.runRoute.length, 240);
  assert.deepEqual(payload.runRoute, preview);
  assert.deepEqual(payload.runRouteRef, expectedRef);
  assert.equal(payload.runRouteSummary.pointCount, 620);
  assert.equal(payload.workoutSessions[0].runRoute.length, 240);
  assert.deepEqual(payload.workoutSessions[0].runRouteRef, expectedRef);
  assert.equal(payload.workoutSessions[0].runRouteSummary.pointCount, 620);
  assert.equal(out.state.workout.runData.route.length, 620);
  assert.deepEqual(out.state.workout.runData.route, fullRoute);
});

test('a second same-sized run rejects the first run ref and stores its own full route', async () => {
  const previousRef = routeRef();
  const timestampOffsetMs = 3_600_000;
  const secondRoute = canonicalRoute().map(point => ({
    ...point,
    lat: point.lat + 0.02,
    ts: point.ts + timestampOffsetMs,
  }));
  const secondRef = routeRef(620, 'b'.repeat(64), secondRoute[0].ts);
  const out = await runSaveHarness({
    runData: {
      distance: 6.8,
      durationMin: 39,
      durationSec: 30,
      memo: '',
      source: 'gps',
      startedAt: secondRoute[0].ts,
      endedAt: secondRoute.at(-1).ts,
      route: secondRoute,
      routeRef: previousRef,
      routeSummary: { source: 'gps', pointCount: secondRoute.length, distanceKm: 6.8 },
    },
    savedRef: secondRef,
  });

  assert.equal(out.error, null);
  assert.deepEqual(out.calls.map(call => call.type), ['saveRunningRoute', 'saveDay']);
  assert.deepEqual(out.calls[0].points, secondRoute);
  const payload = out.calls[1].payload;
  assert.deepEqual(payload.runRouteRef, secondRef);
  assert.notDeepEqual(payload.runRouteRef, previousRef);
  assert.equal(payload.runRouteSummary.pointCount, secondRoute.length);
});

test('preview plus larger existing ref resaves without rewriting immutable route content', async () => {
  const fullRoute = canonicalRoute();
  const preview = buildRunningRoutePreview(fullRoute);
  const existingRef = routeRef();
  const out = await runSaveHarness({
    runData: {
      distance: 7.4,
      durationMin: 42,
      durationSec: 12,
      memo: '',
      source: 'gps',
      route: preview,
      routeRef: existingRef,
      routeSummary: { source: 'gps', pointCount: 620, distanceKm: 7.4 },
    },
  });

  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 0);
  const payload = out.calls.find(call => call.type === 'saveDay').payload;
  assert.deepEqual(payload.runRoute, preview);
  assert.deepEqual(payload.runRouteRef, existingRef);
  assert.equal(payload.runRouteSummary.pointCount, 620);
  assert.deepEqual(payload.workoutSessions[0].runRouteRef, existingRef);
  console.log(`MANUAL_QA ${JSON.stringify({
    full: fullRoute.length,
    preview: payload.runRoute.length,
    refPointCount: payload.runRouteRef.pointCount,
    resaveCalls: out.calls.filter(call => call.type === 'saveRunningRoute').length,
  })}`);
});

test('stale preview summary cannot replace a larger existing full-route ref', async () => {
  const fullRoute = canonicalRoute();
  const preview = buildRunningRoutePreview(fullRoute);
  const existingRef = routeRef();
  const out = await runSaveHarness({
    runData: {
      distance: 7.4,
      durationMin: 42,
      durationSec: 12,
      source: 'gps',
      route: preview,
      routeRef: existingRef,
      routeSummary: { source: 'gps', pointCount: preview.length, distanceKm: 7.4 },
    },
  });

  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 0);
  const payload = out.calls.find(call => call.type === 'saveDay').payload;
  assert.deepEqual(payload.runRouteRef, existingRef);
  assert.equal(payload.runRouteSummary.pointCount, 620);
});

test('full route matching an existing ref rewrites idempotently and corrects stale summary count', async () => {
  const fullRoute = canonicalRoute();
  const existingRef = routeRef();
  const out = await runSaveHarness({
    runData: {
      distance: 7.4,
      durationMin: 42,
      durationSec: 12,
      memo: '',
      source: 'gps',
      route: fullRoute,
      routeRef: existingRef,
      routeSummary: { source: 'gps', pointCount: 1000, distanceKm: 7.4 },
    },
    savedRef: existingRef,
  });

  assert.equal(out.error, null);
  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 1);
  assert.deepEqual(out.calls[0].points, fullRoute);
  const payload = out.calls.find(call => call.type === 'saveDay').payload;
  assert.equal(payload.runRoute.length, 240);
  assert.deepEqual(payload.runRouteRef, existingRef);
  assert.equal(payload.runRouteSummary.pointCount, 620);
  assert.equal(payload.workoutSessions[0].runRouteSummary.pointCount, 620);
});

test('legacy inline GPS route without ref remains readable and migrates to immutable storage', async () => {
  const legacyRoute = canonicalRoute(12);
  const migratedRef = routeRef(12, 'b'.repeat(64));
  migratedRef.lastTimestampMs = legacyRoute.at(-1).ts;
  migratedRef.chunkCount = 1;
  migratedRef.routeId = `v1-${legacyRoute[0].ts}-${migratedRef.revision}`;
  const out = await runSaveHarness({
    runData: {
      distance: 0.2,
      durationMin: 1,
      durationSec: 0,
      memo: '',
      source: 'manual',
      route: legacyRoute,
      routeSummary: { source: 'gps', pointCount: 12 },
    },
    savedRef: migratedRef,
  });

  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 1);
  const payload = out.calls.find(call => call.type === 'saveDay').payload;
  assert.deepEqual(payload.runRoute, legacyRoute);
  assert.deepEqual(payload.runRouteRef, migratedRef);
  assert.equal(payload.runSource, 'gps');
  assert.equal(payload.runRouteSummary.pointCount, 12);
});

test('legacy preview without a ref is not promoted to a complete immutable route', async () => {
  const fullRoute = canonicalRoute(340);
  const preview = buildRunningRoutePreview(fullRoute);
  const out = await runSaveHarness({
    runData: {
      distance: 4.2,
      durationMin: 28,
      durationSec: 0,
      source: 'gps',
      route: preview,
      routeRef: null,
      routeSummary: { source: 'gps', pointCount: 340 },
    },
  });

  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 0);
  const payload = out.calls.find(call => call.type === 'saveDay').payload;
  assert.equal(payload.runRouteRef, null);
  assert.equal(payload.runRoute.length, 240);
  assert.equal(payload.runRouteSummary.pointCount, 340);
});

test('manual non-GPS workout stores an empty preview and null route ref', async () => {
  const out = await runSaveHarness({
    runData: {
      distance: 5,
      durationMin: 30,
      durationSec: 0,
      memo: 'treadmill',
      source: 'manual',
      route: [],
      routeRef: routeRef(),
      routeSummary: null,
    },
  });

  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 0);
  const payload = out.calls.find(call => call.type === 'saveDay').payload;
  assert.deepEqual(payload.runRoute, []);
  assert.equal(payload.runRouteRef, null);
});

test('route storage failure aborts the workout day write loudly', async () => {
  const routeError = new Error('route storage unavailable');
  const out = await runSaveHarness({
    runData: {
      distance: 7.4,
      durationMin: 42,
      durationSec: 12,
      memo: '',
      source: 'gps',
      route: canonicalRoute(),
      routeRef: null,
      routeSummary: { source: 'gps', pointCount: 620 },
    },
    routeError,
  });

  assert.match(out.error?.message || '', /route storage unavailable/);
  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 1);
  assert.equal(out.calls.filter(call => call.type === 'saveDay').length, 0);
});

test('malformed preview ref fails before route or day persistence', async () => {
  const fullRoute = canonicalRoute();
  const malformedRef = { ...routeRef(), revision: 'not-a-sha256-digest' };
  const out = await runSaveHarness({
    runData: {
      distance: 7.4,
      durationMin: 42,
      durationSec: 12,
      memo: '',
      source: 'gps',
      route: buildRunningRoutePreview(fullRoute),
      routeRef: malformedRef,
      routeSummary: { source: 'gps', pointCount: 620 },
    },
  });

  assert.match(out.error?.message || '', /runRouteRef revision/i);
  assert.equal(out.calls.filter(call => call.type === 'saveRunningRoute').length, 0);
  assert.equal(out.calls.filter(call => call.type === 'saveDay').length, 0);
});

test('general workout load restores preview plus ref without eager full-route hydration', () => {
  const loadSource = readFileSync(path.join(repoRoot, 'workout/load.js'), 'utf8');
  const hydrationSource = readFileSync(path.join(repoRoot, 'workout/session-hydration.js'), 'utf8');
  const accountUnificationSource = readFileSync(path.join(repoRoot, 'data/account-unification.js'), 'utf8');

  assert.match(hydrationSource, /route:\s*Array\.isArray\(source\.runRoute\)\s*\?\s*source\.runRoute\s*:\s*\[\]/);
  assert.match(hydrationSource, /routeRef:\s*source\.runRouteRef\s*\|\|\s*null/);
  assert.doesNotMatch(loadSource, /loadRunningRoute/);
  assert.match(accountUnificationSource, /'runRoute',\s*'runRouteRef',\s*'runRouteSummary'/);
});
