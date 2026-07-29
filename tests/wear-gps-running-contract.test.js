import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function writeWearBridgeModule(tmp) {
  const modulePath = join(tmp, 'wear-bridge-under-test.mjs');
  const rewriteImports = source => source.replaceAll("'../utils/number.js'", "'./number.js'");
  const source = rewriteImports(
    (await read('workout/wear-bridge.js')).replace("'../ui/toast.js'", "'./toast.js'"),
  );
  await Promise.all([
    writeFile(modulePath, source, 'utf8'),
    writeFile(join(tmp, 'toast.js'), 'export function showToast(...args) { return globalThis.window?.showToast?.(...args); }\n', 'utf8'),
    writeFile(join(tmp, 'number.js'), await read('utils/number.js'), 'utf8'),
    writeFile(join(tmp, 'running-route-store.js'), await read('workout/running-route-store.js'), 'utf8'),
    writeFile(join(tmp, 'running-route-policy.js'), await read('workout/running-route-policy.js'), 'utf8'),
    writeFile(join(tmp, 'running-analytics.js'), rewriteImports(await read('workout/running-analytics.js')), 'utf8'),
    writeFile(join(tmp, 'sessions.js'), rewriteImports(await read('workout/sessions.js')), 'utf8'),
    writeFile(join(tmp, 'session-policy.js'), await read('workout/session-policy.js'), 'utf8'),
    writeFile(join(tmp, 'running-model.js'), rewriteImports(await read('workout/running-model.js')), 'utf8'),
    writeFile(join(tmp, 'wear-payload-contract.js'), await read('workout/wear-payload-contract.js'), 'utf8'),
    writeFile(join(tmp, 'running-input.js'), await read('workout/running-input.js'), 'utf8'),
    writeFile(join(tmp, 'package.json'), '{"type":"module"}\n', 'utf8'),
  ]);
  return modulePath;
}

test('wear run uses GPS location data and sends route result in final payload', async () => {
  const manifest = await read('android/wear/src/main/AndroidManifest.xml');
  const mainActivity = await read('android/wear/src/main/java/com/lifestreak/wear/MainActivity.kt');
  const service = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const endPolicy = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseEndPolicy.kt');
  const durationTracker = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseActiveDurationTracker.kt');
  const store = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseSessionStore.kt');
  const accumulator = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulator.kt');
  const payload = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunPayload.kt');
  const controller = await read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const layout = await read('android/wear/src/main/res/layout/page_workout.xml');

  assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
  assert.match(manifest, /android:foregroundServiceType="health\|location"/);
  assert.match(manifest, /BODY_SENSORS"[\s\S]*android:maxSdkVersion="35"/);
  assert.match(mainActivity, /Manifest\.permission\.ACCESS_FINE_LOCATION/);
  assert.match(mainActivity, /if \(Build\.VERSION\.SDK_INT >= 36\)[\s\S]*PERMISSION_READ_HEART_RATE[\s\S]*else[\s\S]*BODY_SENSORS/);

  assert.match(service, /DataType\.LOCATION/);
  assert.match(service, /isGpsEnabled = hasLocationPermission\(\)/);
  assert.match(service, /WarmUpConfig/);
  assert.match(service, /prepareExerciseAsync/);
  assert.match(service, /requestedDataTypes\(\)\.intersect\(runningCapabilities\.supportedDataTypes\)/);
  assert.match(service, /warmUpDataTypes\(config\.dataTypes\)/);
  assert.doesNotMatch(service, /ensureGpsDataTypes/);
  assert.match(service, /hasLocationPermission/);
  assert.match(service, /getData\(DataType\.LOCATION\)/);
  assert.doesNotMatch(service, /getData\(DataType\.LOCATION\)[\s\S]{0,120}lastOrNull\(\)/);
  assert.match(service, /locationPoints\.forEach/);
  assert.match(service, /activeDurationTracker\.plausibleHealthDuration/);
  assert.match(service, /activeDurationTracker\.pause/);
  assert.match(durationTracker, /MAX_HEALTH_DURATION_LEAD_MS = 15_000L/);

  assert.match(accumulator, /WearRoutePoint/);
  assert.match(accumulator, /routePoints/);
  assert.doesNotMatch(accumulator, /routePointsByBucket/);
  assert.doesNotMatch(accumulator, /ROUTE_GAP_MS/);
  assert.match(accumulator, /fun markRouteGap/);
  assert.match(accumulator, /gapBefore = explicitGap/);
  assert.match(store, /routePoints: List<WearRoutePoint>/);
  assert.match(payload, /data class WearRoutePoint/);
  assert.doesNotMatch(payload, /ROUTE_GAP_MS/);
  assert.match(payload, /confirmedMovementDistanceMeters\(route\)/);
  assert.match(payload, /segmentId: Int\?/);
  assert.match(payload, /gapBefore: Boolean/);
  assert.match(payload, /gapReason: String\?/);
  assert.match(payload, /"route"/);
  assert.match(payload, /"routeSummary"/);
  assert.match(payload, /"segmentId"/);
  assert.match(payload, /"gapBefore"/);
  assert.match(payload, /"gapReason"/);
  assert.match(payload, /"segmentCount"/);
  assert.match(payload, /"gapCount"/);
  assert.match(payload, /"interrupted"/);
  assert.match(controller, /routePoints = exerciseSnapshot\.routePoints/);
  const endHandler = service.match(/private fun handleEndRun\(\) \{([\s\S]*?)\n    private fun publishEndedSnapshot/);
  assert.ok(endHandler, 'expected Wear end handler');
  const startedEndBranch = endHandler[1].split('} else {', 1)[0];
  assert.doesNotMatch(startedEndBranch, /endFuture\.get\(\)[\s\S]*publishEndedSnapshot/);
  assert.match(endHandler[1], /endRequested = true[\s\S]*stopDirectLocationUpdates\(\)[\s\S]*stopFusedRouteLocationUpdates\(\)[\s\S]*stopDirectHeartRateUpdates\(\)/);
  assert.match(service, /private fun publishDirectLocation\([\s\S]*endRequested \|\| WearExerciseSessionStore\.current\(\)\.status !in setOf/);
  assert.match(service, /private fun publishGpsStatus\(message: String\) \{\s*if \(endRequested\) return/);
  assert.match(service, /private fun publishExerciseUpdate\(update: ExerciseUpdate\) \{[\s\S]*if \(endRequested && !update\.exerciseStateInfo\.state\.isEnded\) return/);
  assert.match(service, /private fun finishService\(\) \{[\s\S]*clearExerciseCallback\(\)[\s\S]*accumulator = null[\s\S]*exerciseStarted = false/);
  assert.match(service, /afterEndFuture\(success = true\)/);
  assert.match(service, /WearExerciseEndPolicy\.afterExerciseUpdate\(\s*update\.exerciseStateInfo\.state\.isEnded\s*,?\s*\)/);
  assert.match(endPolicy, /PUBLISH_FINAL_UPDATE\s*->\s*WearExerciseSessionStatus\.ENDED/);
  assert.match(endPolicy, /WearExerciseSessionStatus\.PAUSED\s*->\s*WearExerciseSessionStatus\.PAUSED/);
  assert.match(endPolicy, /WearExerciseSessionStatus\.ENDED,[\s\S]*-> currentStatus/);
  assert.match(controller, /WearExerciseSessionStatus\.ENDED[\s\S]*syncRunSummary\(v\)/);
  assert.match(controller, /WearExerciseSessionStatus\.ERROR[\s\S]*저장 상태를 확인해 주세요/);
  assert.match(controller, /finishRequested && snapshot\.status !in setOf\([\s\S]*WearExerciseSessionStatus\.ENDED,[\s\S]*WearExerciseSessionStatus\.ERROR,[\s\S]*updateRunLiveMetrics\(snapshot\)[\s\S]*return@addListener/);
  assert.match(controller, /ignoreExerciseUpdatesUntilStart && snapshot\.status != WearExerciseSessionStatus\.IDLE/);
  const finalSnapshotWait = controller.match(/private fun waitForFinalExerciseSnapshot\(v: View\) \{([\s\S]*?)\n    private fun render/);
  assert.ok(finalSnapshotWait, 'expected final Wear snapshot wait');
  assert.doesNotMatch(finalSnapshotWait[1], /WearExerciseSessionStatus\.FALLBACK/);
  assert.ok(
    controller.indexOf('snapshot.status == WearExerciseSessionStatus.ENDED && snapshot.routePoints.size >= 2')
      < controller.indexOf('message.contains("GPS weak"'),
    'an ended run with saved route points must not be presented as a weak live GPS fix',
  );

  assert.match(layout, /@\+id\/runActiveGpsStatus/);
  assert.match(layout, /@\+id\/runSummaryGpsStatus/);
});

test('web wear bridge saves GPS route into running data only', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'wear-gps-bridge-'));
  try {
    const modulePath = await writeWearBridgeModule(tmp);
    await writeFile(join(tmp, 'state.js'), 'export const S = globalThis.__wearGpsState;\n', 'utf8');
    await writeFile(join(tmp, 'load.js'), 'export const loadWorkoutDate = globalThis.__wearGpsLoad;\n', 'utf8');
    await writeFile(join(tmp, 'save.js'), 'export const saveWorkoutDay = globalThis.__wearGpsSave;\n', 'utf8');
    await writeFile(join(tmp, 'exercises.js'), 'export const wtFocusWorkoutEntryCard = globalThis.__wearGpsFocus;\n', 'utf8');

    const saved = [];
    globalThis.window = {
      showToast() {},
      localStorage: {
        getItem() { return '[]'; },
        setItem() {},
        removeItem() {},
      },
    };
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.document = { dispatchEvent() {} };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    };
    const state = { workout: { exercises: [], runData: {} }, diet: {} };
    globalThis.__wearGpsState = state;
    globalThis.__wearGpsLoad = async () => {};
    globalThis.__wearGpsSave = async () => {
      saved.push(JSON.parse(JSON.stringify(state.workout)));
      return true;
    };
    globalThis.__wearGpsFocus = () => {};

    const bridge = await import(pathToFileURL(modulePath).href);
    bridge.configureWearWorkoutBridgeForTest({
      state,
      loadWorkoutDate: globalThis.__wearGpsLoad,
      saveWorkoutDay: globalThis.__wearGpsSave,
      focusEntry: globalThis.__wearGpsFocus,
      getDay() { return { workoutSessions: [] }; },
      getRunningWeightKg() { return 72; },
    });

    await bridge.saveWearWorkoutPayload({
      type: 'running',
      source: 'wear',
      dateKey: '2026-07-07',
      startedAt: 1783400000000,
      endedAt: 1783400060000,
      durationSec: 60,
      distanceKm: 0.12,
      avgPaceSecPerKm: 500,
      avgHeartRateBpm: 132,
      maxHeartRateBpm: 145,
      samples10s: [],
      route: [
        { timestampMs: 1783400000000, lat: 37.5665, lng: 126.978, altitude: 34.1, bearing: 91.2 },
        { timestampMs: 1783400010000, lat: 37.5666, lng: 126.979, altitude: 35.0, bearing: 94.4 },
      ],
      routeSummary: {
        source: 'wear-gps',
        pointCount: 2,
        distanceKm: 0.12,
        durationSec: 60,
        startedAt: 1783400000000,
        endedAt: 1783400060000,
      },
    });

    assert.equal(saved.length, 1);
    assert.equal(state.workout.runData.route.length, 2);
    assert.equal(state.workout.runData.route[0].lat, 37.5665);
    assert.equal(state.workout.runData.routeSummary.source, 'wear-gps');
    assert.equal(state.workout.runData.routeSummary.pointCount, 2);
    assert.equal(state.workout.runData.routeSummary.calorieSource, 'estimated');
    assert.equal(state.workout.runData.routeSummary.calorieMethod, 'acsm-speed-grade-v1');
    assert.equal(state.workout.runData.routeSummary.calorieWeightKg, 72);
    assert.ok(state.workout.runData.routeSummary.calories > 0);
    assert.equal(state.workout.sessionIndex, 2);
    assert.equal(state.workout.exercises.length, 0);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
    delete globalThis.document;
    delete globalThis.CustomEvent;
    delete globalThis.__wearGpsState;
    delete globalThis.__wearGpsLoad;
    delete globalThis.__wearGpsSave;
    delete globalThis.__wearGpsFocus;
    await rm(tmp, { recursive: true, force: true });
  }
});
