import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function writeWearBridgeModule(tmp) {
  const modulePath = join(tmp, 'wear-bridge-under-test.mjs');
  const source = (await read('workout/wear-bridge.js')).replace("'../ui/toast.js'", "'./toast.js'");
  await Promise.all([
    writeFile(modulePath, source, 'utf8'),
    writeFile(join(tmp, 'toast.js'), 'export function showToast(...args) { return globalThis.window?.showToast?.(...args); }\n', 'utf8'),
    writeFile(join(tmp, 'running-route-store.js'), await read('workout/running-route-store.js'), 'utf8'),
    writeFile(join(tmp, 'running-route-policy.js'), await read('workout/running-route-policy.js'), 'utf8'),
    writeFile(join(tmp, 'running-analytics.js'), await read('workout/running-analytics.js'), 'utf8'),
    writeFile(join(tmp, 'sessions.js'), await read('workout/sessions.js'), 'utf8'),
    writeFile(join(tmp, 'session-policy.js'), await read('workout/session-policy.js'), 'utf8'),
    writeFile(join(tmp, 'running-model.js'), await read('workout/running-model.js'), 'utf8'),
    writeFile(join(tmp, 'running-input.js'), await read('workout/running-input.js'), 'utf8'),
    writeFile(join(tmp, 'wear-payload-contract.js'), await read('workout/wear-payload-contract.js'), 'utf8'),
    writeFile(join(tmp, 'package.json'), '{"type":"module"}\n', 'utf8'),
  ]);
  return modulePath;
}

function wearPayload(route = [], overrides = {}) {
  const startedAt = 1_783_400_000_000;
  return {
    type: 'running',
    source: 'wear',
    dateKey: '2026-07-07',
    startedAt,
    endedAt: startedAt + Math.max(60_000, (route.length - 1) * 1_000),
    durationSec: Math.max(60, route.length - 1),
    distanceKm: 3.21,
    samples10s: [],
    route,
    ...overrides,
  };
}

function curvedRoute(count) {
  const startedAt = 1_783_400_000_000;
  return Array.from({ length: count }, (_, index) => ({
    timestampMs: startedAt + index * 1_000,
    lat: 37.5 + index / 10_000_000,
    lng: 127.05 + Math.sin(index / 23) / 1_000 + index / 20_000_000,
    altitude: 20 + Math.cos(index / 31),
    bearing: (index * 7.25) % 360,
  }));
}

test('wear workout bridge uses Asset transfer and app-private file retry for full routes', async () => {
  const appGradle = await read('android/app/build.gradle');
  const wearGradle = await read('android/wear/build.gradle');
  const appManifest = await read('android/app/src/main/AndroidManifest.xml');
  const phoneBridge = await read('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutBridge.kt');
  const fileQueue = await read('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutFileQueue.kt');
  const listener = await read('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutListenerService.kt');
  const mainActivity = await read('android/app/src/main/java/com/lifestreak/app/MainActivity.java');
  const webBridge = await read('workout/wear-bridge.js');
  const wearManifest = await read('android/wear/src/main/AndroidManifest.xml');
  const wearListener = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearAppRefreshListenerService.kt');
  const wearSender = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutDataLayer.kt');
  const wearController = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const wearLayout = await read('android/wear/src/main/res/layout/page_workout.xml');

  assert.match(appGradle, /applicationId "com\.lifestreak\.app"/);
  assert.match(wearGradle, /applicationId "com\.lifestreak\.app"/);
  assert.match(appGradle, /com\.google\.android\.gms:play-services-wearable:18\.2\.0/);
  assert.match(wearGradle, /com\.google\.android\.gms:play-services-wearable:18\.2\.0/);
  assert.match(appManifest, /TomatoWearWorkoutListenerService/);
  assert.match(appManifest, /com\.google\.android\.gms\.wearable\.DATA_CHANGED/);
  assert.match(appManifest, /android:pathPrefix="\/tomato\/workout\/run\/complete"/);
  assert.match(listener, /WearableListenerService/);
  assert.match(listener, /onDataChanged/);
  assert.match(listener, /TYPE_CHANGED/);
  assert.match(listener, /DataMapItem/);
  assert.match(listener, /getFdForAsset/);
  assert.match(listener, /declaredLength/);
  assert.match(listener, /declaredSha256/);
  assert.match(listener, /TomatoWearWorkoutBridge\.enqueueFromWearFile/);
  assert.match(listener, /deleteDataItems/);
  assert.match(fileQueue, /QUEUE_PREFS/);
  assert.match(fileQueue, /wear-route-payloads/);
  assert.match(fileQueue, /MAX_PAYLOAD_BYTES\s*=\s*8 \* 1024 \* 1024/);
  assert.match(fileQueue, /"fileName"/);
  assert.match(fileQueue, /"byteLength"/);
  assert.match(fileQueue, /"sha256"/);
  assert.match(fileQueue, /reconcile/);
  assert.match(fileQueue, /renameTo/);
  assert.match(fileQueue, /ACKNOWLEDGED_EXTENSION/);
  assert.match(fileQueue, /persisted\.distinctBy[\s\S]*readPayloadFile/);
  assert.doesNotMatch(fileQueue, /takeLast|dropLast/);
  assert.match(phoneBridge, /evaluateJavascript/);
  assert.match(phoneBridge, /__tomatoWearWorkoutBridge/);
  assert.match(phoneBridge, /saveFromNative/);
  assert.match(phoneBridge, /drainPendingToWebView/);
  assert.match(phoneBridge, /@JavascriptInterface/);
  assert.match(phoneBridge, /addJavascriptInterface/);
  assert.match(phoneBridge, /__tomatoWearWorkoutNativeAck/);
  assert.match(phoneBridge, /Promise\.resolve/);
  assert.match(phoneBridge, /nativeAck\.accept/);
  assert.match(phoneBridge, /ACK_TIMEOUT_MS\s*=\s*30_000L/);
  assert.match(phoneBridge, /PendingAckTracker/);
  assert.match(phoneBridge, /scheduleAckTimeout/);
  assert.match(phoneBridge, /PATH_RUN_SAVED_ACK\s*=\s*"\/tomato\/workout\/run\/saved"/);
  assert.match(phoneBridge, /PutDataMapRequest\.create\(savedAckPath\(id\)\)/);
  assert.match(phoneBridge, /sendSavedAck\(activity, id, 0\)[\s\S]*private fun sendSavedAck[\s\S]*addOnSuccessListener[\s\S]*TomatoWearWorkoutFileQueue\.acknowledge/);
  assert.match(phoneBridge, /SavedAckTracker/);
  assert.doesNotMatch(`${phoneBridge}\n${fileQueue}`, /sanitizePayloadForPrefs|sanitizeRouteForPrefs|MAX_PERSISTED_ROUTE_POINTS/);
  assert.match(webBridge, /saveFromNative\(raw\)\s*{\s*return saveWearWorkoutPayload\(raw\);\s*}/);
  assert.match(mainActivity, /TomatoWearWorkoutBridge\.registerActivity/);
  assert.match(mainActivity, /TomatoWearWorkoutBridge\.drainPendingToWebView/);
  assert.match(wearSender, /Asset\.createFromBytes/);
  assert.match(wearSender, /PutDataMapRequest/);
  assert.match(wearSender, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(wearSender, /payload\.startedAtMs/);
  assert.match(wearSender, /payload\.endedAtMs/);
  assert.match(wearSender, /putLong\(BYTE_LENGTH_KEY/);
  assert.match(wearSender, /putString\(SHA256_KEY/);
  assert.doesNotMatch(wearSender, /UUID/);
  assert.match(wearSender, /\/tomato\/workout\/run\/complete/);
  assert.match(wearSender, /Wearable\.getDataClient/);
  assert.match(wearSender, /setUrgent/);
  assert.match(wearSender, /MAX_SEND_ATTEMPTS\s*=\s*3/);
  assert.match(wearSender, /휴대폰 저장 확인 중/);
  assert.doesNotMatch(wearSender, /휴대폰에 자동 저장돼요/);
  assert.doesNotMatch(wearSender, /sendMessage|connectedNodes|getNodeClient|getMessageClient|MessageClient/);
  assert.match(wearManifest, /android:pathPrefix="\/tomato\/workout\/run\/saved"/);
  assert.match(wearManifest, /com\.google\.android\.gms\.wearable\.DATA_CHANGED/);
  assert.match(wearListener, /onDataChanged/);
  assert.match(wearListener, /WearWorkoutDataLayer\.transferIdFromSavedAck/);
  assert.match(wearListener, /WearWorkoutDataLayer\.acceptSavedAck/);
  assert.match(wearController, /WearWorkoutDataLayer\.sendRunComplete/);
  assert.match(wearController, /WearWorkoutDataLayer\.addSavedListener/);
  assert.match(wearController, /휴대폰에 저장했어요/);
  assert.match(wearLayout, /@\+id\/runSummarySyncStatus/);
});

test('web Wear boundary normalizes and saves all 2,162 curved route points without changing order or values', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-lossless-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const route = curvedRoute(2_162);
    const payload = wearPayload(route);
    const saved = [];
    const state = { workout: { exercises: [], runData: {} }, diet: {} };
    globalThis.window = { showToast() {} };
    globalThis.document = { dispatchEvent() {} };
    globalThis.CustomEvent = class CustomEvent {};

    const bridge = await import(pathToFileURL(modulePath).href);
    bridge.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: async () => {},
      saveWorkoutDay: async () => {
        saved.push(structuredClone(state.workout.runData.route));
        return true;
      },
      getDay() { return { workoutSessions: [] }; },
    });

    const normalized = bridge.normalizeWearWorkoutPayload(payload);
    assert.equal(normalized.route.length, 2_162);
    normalized.route.forEach((point, index) => {
      assert.equal(point.ts, route[index].timestampMs, `normalized timestamp at index ${index}`);
      assert.equal(point.lat, route[index].lat, `normalized latitude at index ${index}`);
      assert.equal(point.lng, route[index].lng, `normalized longitude at index ${index}`);
    });

    const result = await globalThis.window.__tomatoWearWorkoutBridge.saveFromNative(payload);
    assert.equal(result.ok, true);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].length, 2_162);
    saved[0].forEach((point, index) => {
      assert.equal(point.ts, route[index].timestampMs, `saved timestamp at index ${index}`);
      assert.equal(point.lat, route[index].lat, `saved latitude at index ${index}`);
      assert.equal(point.lng, route[index].lng, `saved longitude at index ${index}`);
    });
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.CustomEvent;
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web Wear boundary rejects 25,001 route points instead of truncating', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-overflow-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const bridge = await import(pathToFileURL(modulePath).href);
    const route = curvedRoute(25_001);

    assert.throws(
      () => bridge.normalizeWearWorkoutPayload(wearPayload(route)),
      /25,?001|25,?000|overflow|limit/i,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web Wear boundary rejects a malformed middle route point by index without saving a partial route', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-invalid-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const route = curvedRoute(9);
    route[4] = { ...route[4], lat: Number.NaN };
    let saveCalls = 0;
    const state = { workout: { exercises: [], runData: {} }, diet: {} };
    const bridge = await import(pathToFileURL(modulePath).href);
    bridge.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: async () => {},
      saveWorkoutDay: async () => {
        saveCalls += 1;
        return true;
      },
      getDay() { return { workoutSessions: [] }; },
    });

    await assert.rejects(
      () => bridge.saveWearWorkoutPayload(wearPayload(route)),
      /index 4.*latitude|latitude.*index 4/i,
    );
    assert.equal(saveCalls, 0);
    assert.deepEqual(state.workout.runData, {});
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web Wear boundary keeps distinct equal-timestamp route points in input order', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-equal-time-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const bridge = await import(pathToFileURL(modulePath).href);
    const route = curvedRoute(4);
    route[2].timestampMs = route[1].timestampMs;

    const normalized = bridge.normalizeWearWorkoutPayload(wearPayload(route));
    assert.deepEqual(
      normalized.route.map(point => [point.lat, point.lng, point.ts]),
      route.map(point => [point.lat, point.lng, point.timestampMs]),
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web Wear boundary rejects decreasing route timestamps instead of sorting', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-time-order-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const bridge = await import(pathToFileURL(modulePath).href);
    const route = curvedRoute(3);
    route[2].timestampMs = route[1].timestampMs - 1;

    assert.throws(
      () => bridge.normalizeWearWorkoutPayload(wearPayload(route)),
      /index 2.*timestamp|timestamp.*non-decreasing|chronological/i,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web Wear boundary enforces the 2,161-sample heart-rate limit', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-heart-rate-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const bridge = await import(pathToFileURL(modulePath).href);
    const startedAt = 1_783_400_000_000;
    const validSamples = Array.from({ length: 2_161 }, (_, index) => ({
      timestampMs: startedAt + index * 10_000,
      bpm: 80 + (index % 40),
    }));
    const payload = wearPayload([], {
      startedAt,
      endedAt: startedAt + 2_161 * 10_000,
      durationSec: 6 * 60 * 60,
      samples10s: validSamples,
    });

    assert.equal(bridge.normalizeWearWorkoutPayload(payload).samples10s.length, 2_161);
    assert.throws(
      () => bridge.normalizeWearWorkoutPayload({
        ...payload,
        samples10s: [...validSamples, { timestampMs: payload.endedAt, bpm: 120 }],
      }),
      /2,?161|heart.?rate.*limit|sample.*limit|overflow/i,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web Wear boundary rejects an invalid heart-rate sample by index', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-heart-rate-invalid-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    const bridge = await import(pathToFileURL(modulePath).href);
    const startedAt = 1_783_400_000_000;
    const validSamples = Array.from({ length: 2_161 }, (_, index) => ({
      timestampMs: startedAt + index * 10_000,
      bpm: 80 + (index % 40),
    }));
    const payload = wearPayload([], {
      startedAt,
      endedAt: startedAt + 2_161 * 10_000,
      durationSec: 6 * 60 * 60,
      samples10s: validSamples,
    });

    assert.throws(
      () => bridge.normalizeWearWorkoutPayload({
        ...payload,
        samples10s: validSamples.map((sample, index) => index === 1_080 ? { ...sample, bpm: 0 } : sample),
      }),
      /index 1080.*bpm|bpm.*index 1080|heart.?rate.*1080/i,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web bridge saves a valid wear run into running-only session storage', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-'));
    try {
      const modulePath = await writeWearBridgeModule(tmp);
      await writeFile(join(tmp, 'state.js'), 'export const S = globalThis.__wearBridgeTestState;\n', 'utf8');
      await writeFile(join(tmp, 'load.js'), 'export const loadWorkoutDate = globalThis.__wearBridgeTestLoad;\n', 'utf8');
      await writeFile(join(tmp, 'save.js'), 'export const saveWorkoutDay = globalThis.__wearBridgeTestSave;\n', 'utf8');
      await writeFile(join(tmp, 'exercises.js'), 'export const wtFocusWorkoutEntryCard = globalThis.__wearBridgeTestFocus;\n', 'utf8');

    const saved = [];
    const focused = [];
    const loadedDates = [];
    const events = [];
    const toast = [];
    const store = new Map();

    globalThis.window = {
      showToast(message, duration, type) { toast.push({ message, duration, type }); },
      localStorage: {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); },
      },
    };
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.document = {
      dispatchEvent(event) { events.push(event.type); },
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    };

    const state = {
      workout: {
        exercises: [],
        sessionIndex: 0,
        running: false,
        runData: {},
      },
      diet: {
        breakfast: '토스트',
        bFoods: [{ name: '토스트' }],
      },
      shared: { date: null },
    };
    globalThis.__wearBridgeTestState = state;
    globalThis.__wearBridgeTestLoad = async (y, m, d) => {
      loadedDates.push([y, m, d]);
      state.shared.date = { y, m, d };
    };
    globalThis.__wearBridgeTestSave = async (options) => {
      saved.push({ options, workout: JSON.parse(JSON.stringify(state.workout)), diet: JSON.parse(JSON.stringify(state.diet)) });
      return true;
    };
    globalThis.__wearBridgeTestFocus = (index) => focused.push(index);

    const bridgeModule = await import(pathToFileURL(modulePath).href);
    bridgeModule.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: globalThis.__wearBridgeTestLoad,
      saveWorkoutDay: globalThis.__wearBridgeTestSave,
      focusEntry: globalThis.__wearBridgeTestFocus,
      getDay() {
        return {
          workoutSessions: [
            { id: 'session-1', label: '1회차', exercises: [{ exerciseId: 'bench' }] },
            { id: 'session-2', label: '2회차', exercises: [{ exerciseId: 'squat' }] },
          ],
        };
      },
    });

    await assert.rejects(
      () => bridgeModule.saveWearWorkoutPayload({ type: 'cycling', dateKey: 'bad' }),
      /unsupported wear workout type|dateKey/,
    );

    const result = await bridgeModule.saveWearWorkoutPayload({
      type: 'running',
      source: 'wear',
      dateKey: '2026-07-07',
      startedAt: 1783400000000,
      endedAt: 1783401265000,
      durationSec: 1265,
      distanceKm: 3.21,
      avgPaceSecPerKm: 394,
      avgHeartRateBpm: 141,
      maxHeartRateBpm: 166,
      samples10s: [
        { timestampMs: 1783400000000, bpm: 136 },
        { timestampMs: 1783400010000, bpm: 141 },
      ],
    });

    assert.equal(result.ok, true);
    assert.deepEqual(loadedDates, [[2026, 6, 7]]);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0].options, { silent: true });
    assert.equal(saved[0].diet.breakfast, '토스트');
    assert.deepEqual(saved[0].diet.bFoods, [{ name: '토스트' }]);
    assert.equal(state.workout.running, true);
    assert.equal(state.workout.sessionIndex, 2);
    assert.equal(state.workout.sessionId, 'running-track');
    assert.equal(state.workout.runData.source, 'wear');
    assert.equal(state.workout.runData.distance, 3.21);
    assert.equal(state.workout.runData.durationMin, 21);
    assert.equal(state.workout.runData.durationSec, 5);
    assert.equal(state.workout.exercises.length, 0);
    assert.equal(focused.length, 0);
    assert.ok(events.includes('sheet:saved'));
    assert.ok(toast.some(item => item.message.includes('워치 런닝 기록')));

    await bridgeModule.saveWearWorkoutPayload({
      type: 'running',
      source: 'wear',
      dateKey: '2026-07-07',
      startedAt: 1783400000000,
      endedAt: 1783401265000,
      durationSec: 1265,
      distanceKm: 3.21,
      avgPaceSecPerKm: 394,
      avgHeartRateBpm: 141,
      maxHeartRateBpm: 166,
      samples10s: [],
    });
    assert.equal(state.workout.exercises.length, 0, 'wear running should never create a workout exercise card');
    assert.equal(saved[1].workout.sessionIndex, 2, 'same wear session should update the existing running slot');
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.CustomEvent;
    delete globalThis.__wearBridgeTestState;
    delete globalThis.__wearBridgeTestLoad;
    delete globalThis.__wearBridgeTestSave;
    delete globalThis.__wearBridgeTestFocus;
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web bridge preserves explicit wear gaps without inventing gaps from sparse GPS', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-gap-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);

    const bridgeModule = await import(pathToFileURL(modulePath).href);
    const basePayload = {
      type: 'running',
      source: 'wear',
      dateKey: '2026-07-07',
      startedAt: 1783400000000,
      endedAt: 1783400120000,
      durationSec: 120,
      distanceKm: 0.5,
      avgPaceSecPerKm: 240,
      samples10s: [],
      route: [
        { timestampMs: 1783400000000, lat: 37.5665, lng: 126.9780, segmentId: 0 },
        { timestampMs: 1783400010000, lat: 37.5666, lng: 126.9790, segmentId: 0 },
        {
          timestampMs: 1783400080000,
          lat: 37.5670,
          lng: 126.9800,
          segmentId: 1,
          gapBefore: true,
          gapReason: 'time-gap',
        },
      ],
      routeSummary: {
        source: 'wear-gps',
        pointCount: 3,
        distanceKm: 0.5,
        durationSec: 120,
        segmentCount: 2,
        gapCount: 1,
        interrupted: true,
      },
    };

    const explicit = bridgeModule.normalizeWearWorkoutPayload(basePayload);
    assert.equal(explicit.route[2].segmentId, 1);
    assert.equal(explicit.route[2].gapBefore, true);
    assert.equal(explicit.route[2].gapReason, 'time-gap');
    assert.equal(explicit.routeSummary.segmentCount, 2);
    assert.equal(explicit.routeSummary.gapCount, 1);
    assert.equal(explicit.routeSummary.interrupted, true);

    const inferred = bridgeModule.normalizeWearWorkoutPayload({
      ...basePayload,
      route: basePayload.route.map(({ segmentId, gapBefore, gapReason, ...point }) => point),
      routeSummary: { source: 'wear-gps', pointCount: 3, distanceKm: 0.5, durationSec: 120 },
    });
    assert.equal(inferred.route[2].segmentId, 0);
    assert.equal(inferred.route[2].gapBefore, undefined);
    assert.equal(inferred.route[2].gapReason, undefined);
    assert.equal(inferred.routeSummary.segmentCount, 1);
    assert.equal(inferred.routeSummary.gapCount, 0);
    assert.equal(inferred.routeSummary.interrupted, false);

    const saved = [];
    const state = { workout: { exercises: [], sessionIndex: 0, running: false, runData: {} }, diet: {}, shared: {} };
    bridgeModule.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: async () => {},
      saveWorkoutDay: async () => {
        saved.push(JSON.parse(JSON.stringify(state.workout)));
        return true;
      },
      focusEntry: () => {},
      getDay() { return { workoutSessions: [] }; },
    });

    await bridgeModule.saveWearWorkoutPayload(basePayload);
    assert.equal(saved[0].runData.route[2].segmentId, 1);
    assert.equal(saved[0].runData.route[2].gapBefore, true);
    assert.equal(saved[0].runData.routeSummary.segmentCount, 2);
    assert.equal(saved[0].runData.routeSummary.gapCount, 1);
    assert.equal(saved[0].runData.routeSummary.interrupted, true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web bridge redacts precise GPS route from persistent queue but drains memory route', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-privacy-'));
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    await writeFile(join(tmp, 'state.js'), 'export const S = globalThis.__wearBridgePrivacyState;\n', 'utf8');
    await writeFile(join(tmp, 'load.js'), 'export const loadWorkoutDate = globalThis.__wearBridgePrivacyLoad;\n', 'utf8');
    await writeFile(join(tmp, 'save.js'), 'export const saveWorkoutDay = globalThis.__wearBridgePrivacySave;\n', 'utf8');
    await writeFile(join(tmp, 'exercises.js'), 'export const wtFocusWorkoutEntryCard = globalThis.__wearBridgePrivacyFocus;\n', 'utf8');

    const store = new Map();
    const saved = [];
    globalThis.window = {
      showToast() {},
      localStorage: {
        getItem(key) { return store.has(key) ? store.get(key) : null; },
        setItem(key, value) { store.set(key, String(value)); },
        removeItem(key) { store.delete(key); },
      },
    };
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.document = { dispatchEvent() {} };
    globalThis.CustomEvent = class CustomEvent {};

    const state = { workout: { exercises: [], sessionIndex: 0, running: false, runData: {} }, diet: {}, shared: {} };
    globalThis.__wearBridgePrivacyState = state;
    globalThis.__wearBridgePrivacyLoad = async () => {};
    globalThis.__wearBridgePrivacySave = async () => {
      saved.push(JSON.parse(JSON.stringify(state.workout)));
      return true;
    };
    globalThis.__wearBridgePrivacyFocus = () => {};

    const bridgeModule = await import(pathToFileURL(modulePath).href);
    const payload = {
      type: 'running',
      source: 'wear',
      dateKey: '2026-07-07',
      startedAt: 1783400000000,
      endedAt: 1783400060000,
      durationSec: 60,
      distanceKm: 0.12,
      avgPaceSecPerKm: 500,
      lat: 37.1111,
      lng: 126.1111,
      gpsDump: { lat: 37.9999, lng: 126.9999 },
      rawRoute: [{ lat: 37.7777, lng: 126.7777 }],
      samples10s: [],
      route: [
        { timestampMs: 1783400000000, lat: 37.5665, lng: 126.978 },
        { timestampMs: 1783400010000, lat: 37.5666, lng: 126.979 },
      ],
      routeSummary: { source: 'wear-gps', pointCount: 2, distanceKm: 0.12, durationSec: 60 },
    };

    bridgeModule.enqueueWearWorkoutPayload(payload);
    await new Promise(resolve => setTimeout(resolve, 0));

    const storedRaw = Array.from(store.values()).join('\n');
    assert.doesNotMatch(storedRaw, /37\.5665|37\.5666|126\.978|126\.979|37\.1111|126\.1111|37\.9999|126\.9999|37\.7777|126\.7777|gpsDump|rawRoute/);
    const storedQueue = JSON.parse(storedRaw || '[]');
    assert.equal(storedQueue.length, 1);
    assert.deepEqual(storedQueue[0].payload.route, []);
    assert.equal(storedQueue[0].payload.routeSummary.pointCount, 2);
    assert.equal(storedQueue[0].payload.routeSummary.redacted, true);
    assert.equal(storedQueue[0].payload.lat, undefined);
    assert.equal(storedQueue[0].payload.gpsDump, undefined);
    assert.equal(storedQueue[0].payload.rawRoute, undefined);

    store.set('tomatofarm_wear_workout_queue_v1', JSON.stringify([{
      id: storedQueue[0].id,
      queuedAt: Date.now(),
      payload: {
        ...payload,
        route: [],
        samples10s: [],
        routeSummary: { source: 'wear-gps', pointCount: 2, redacted: true },
        lat: 37.3333,
        lng: 126.3333,
        gpsDump: { lat: 37.4444, lng: 126.4444 },
        rawRoute: [{ lat: 37.5555, lng: 126.5555 }],
      },
    }]));
    await bridgeModule.drainWearWorkoutQueue();
    const legacyResanitizedRaw = Array.from(store.values()).join('\n');
    assert.doesNotMatch(legacyResanitizedRaw, /37\.3333|126\.3333|37\.4444|126\.4444|37\.5555|126\.5555|gpsDump|rawRoute/);
    assert.equal(warnings.length, 2);
    warnings.forEach(warning => {
      assert.match(warning, /\[wear-bridge\] queued payload save failed: Error: wear workout bridge dependencies are not configured/);
    });

    bridgeModule.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: globalThis.__wearBridgePrivacyLoad,
      saveWorkoutDay: globalThis.__wearBridgePrivacySave,
      focusEntry: globalThis.__wearBridgePrivacyFocus,
      getDay() { return { workoutSessions: [] }; },
    });
    const result = await bridgeModule.drainWearWorkoutQueue();

    assert.equal(result.ok, true);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].runData.route.length, 2);
    assert.equal(saved[0].runData.route[0].lat, 37.5665);
    assert.deepEqual(JSON.parse(Array.from(store.values()).join('\n') || '[]'), []);
    assert.equal(warnings.length, 2, 'configured drain should not add warnings');
  } finally {
    console.warn = originalWarn;
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.CustomEvent;
    delete globalThis.__wearBridgePrivacyState;
    delete globalThis.__wearBridgePrivacyLoad;
    delete globalThis.__wearBridgePrivacySave;
    delete globalThis.__wearBridgePrivacyFocus;
    await rm(tmp, { recursive: true, force: true });
  }
});

test('web bridge stacks distinct wear runs after the running tab session index', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-bridge-stack-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    await writeFile(join(tmp, 'state.js'), 'export const S = globalThis.__wearBridgeStackState;\n', 'utf8');
    await writeFile(join(tmp, 'load.js'), 'export const loadWorkoutDate = globalThis.__wearBridgeStackLoad;\n', 'utf8');
    await writeFile(join(tmp, 'save.js'), 'export const saveWorkoutDay = globalThis.__wearBridgeStackSave;\n', 'utf8');
    await writeFile(join(tmp, 'exercises.js'), 'export const wtFocusWorkoutEntryCard = globalThis.__wearBridgeStackFocus;\n', 'utf8');

    const saved = [];
    const existingDay = {
      workoutSessions: [
        { id: 'session-1', label: '1회차', exercises: [{ exerciseId: 'bench' }] },
        { id: 'session-2', label: '2회차', exercises: [] },
        {
          id: 'session-3',
          label: '3회차',
          exercises: [],
          running: true,
          runStartedAt: 1783400000000,
          runEndedAt: 1783401265000,
          runDistance: 3.21,
        },
      ],
    };
    const state = { workout: { exercises: [], sessionIndex: 0, running: false, runData: {} }, diet: {}, shared: {} };

    globalThis.window = {
      showToast() {},
      localStorage: { getItem() { return '[]'; }, setItem() {}, removeItem() {} },
    };
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.document = { dispatchEvent() {} };
    globalThis.CustomEvent = class CustomEvent {};
    globalThis.__wearBridgeStackState = state;
    globalThis.__wearBridgeStackLoad = async () => {};
    globalThis.__wearBridgeStackSave = async () => {
      saved.push(JSON.parse(JSON.stringify(state.workout)));
      return true;
    };
    globalThis.__wearBridgeStackFocus = () => {};

    const bridgeModule = await import(pathToFileURL(modulePath).href);
    bridgeModule.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: globalThis.__wearBridgeStackLoad,
      saveWorkoutDay: globalThis.__wearBridgeStackSave,
      focusEntry: globalThis.__wearBridgeStackFocus,
      getDay() { return existingDay; },
    });

    await bridgeModule.saveWearWorkoutPayload({
      type: 'running',
      source: 'wear',
      dateKey: '2026-07-07',
      startedAt: 1783402000000,
      endedAt: 1783402600000,
      durationSec: 600,
      distanceKm: 1.4,
      avgPaceSecPerKm: 428,
      samples10s: [],
    });

    assert.equal(saved.length, 1);
    assert.equal(saved[0].sessionIndex, 3, 'a distinct second run should append after existing running sessions');
    assert.equal(saved[0].exercises.length, 0);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.CustomEvent;
    delete globalThis.__wearBridgeStackState;
    delete globalThis.__wearBridgeStackLoad;
    delete globalThis.__wearBridgeStackSave;
    delete globalThis.__wearBridgeStackFocus;
    await rm(tmp, { recursive: true, force: true });
  }
});
