import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readProjectFile(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('wear slice3 declares Health Services dependency, permissions, and foreground service', () => {
  const gradle = readProjectFile('android/wear/build.gradle');
  const manifest = readProjectFile('android/wear/src/main/AndroidManifest.xml');

  assert.match(gradle, /androidx\.health:health-services-client:/);

  [
    'android.permission.BODY_SENSORS',
    'android.permission.health.READ_HEART_RATE',
    'android.permission.ACTIVITY_RECOGNITION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_HEALTH',
  ].forEach((permissionName) => {
    assert.match(manifest, new RegExp(`android:name="${permissionName.replaceAll('.', '\\.')}"`));
  });

  assert.match(manifest, /android:name="\.workout\.WearExerciseService"/);
  assert.match(manifest, /android:exported="false"/);
  assert.match(manifest, /android:foregroundServiceType="health(?:\|location)?"/);
});

test('wear slice3 service owns ExerciseClient and streams run metrics to UI state', () => {
  const service = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const controller = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const runState = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiState.kt');

  [
    'HealthServices.getClient',
    'ExerciseUpdateCallback',
    'setUpdateCallback',
    'clearUpdateCallbackAsync',
    'ExerciseConfig',
    'ExerciseType.RUNNING',
    'DataType.HEART_RATE_BPM',
    'DataType.LOCATION',
    'DataType.ACTIVE_EXERCISE_DURATION_TOTAL',
    'startForeground',
  ].forEach((needle) => {
    assert.ok(service.includes(needle), `missing ${needle}`);
  });
  // W3 pace-consistency slice: Health Services' cumulative distance is requested so pace can match
  // other running apps; the capability intersection filters it out where unsupported.
  assert.ok(service.includes('DataType.DISTANCE_TOTAL'), 'must request Health Services cumulative distance');
  assert.match(service, /metrics\.getData\(DataType\.DISTANCE_TOTAL\)/);
  assert.match(service, /healthDistanceMeters\s*=\s*healthDistanceMeters/);
  assert.ok(!service.includes('DataType.SPEED'), 'current pace must come from distance samples, not an HS speed stream');

  [
    'WearExerciseService.startRun',
    'WearExerciseService.pauseRun',
    'WearExerciseService.resumeRun',
    'WearExerciseService.endRun',
    'WearExerciseSessionStore',
    'WearExerciseSessionStore.addListener',
    'updateRunLiveMetrics',
    'runState.updateLiveMetrics',
  ].forEach((needle) => {
    assert.ok(controller.includes(needle), `missing ${needle}`);
  });

  assert.match(runState, /fun updateLiveMetrics\([\s\S]*updateMetrics\(/);
});

test('wear running power policy preserves sensor samples while batching expensive work', () => {
  const activity = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/MainActivity.kt');
  const service = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const controller = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const pager = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunMetricPagerAdapter.kt');

  assert.match(activity, /override fun onPause\(\)[\s\S]*wearWorkoutUi::onHostPaused/);
  assert.match(controller, /fun onHostPaused[\s\S]*keepScreenOn = false[\s\S]*clearRunTick/);
  assert.match(controller, /fun onHostResumed[\s\S]*WearExerciseSessionStore\.current\(\)[\s\S]*updateRunLiveMetrics/);
  assert.match(controller, /if \(!hostInteractive\) return@addListener/);
  assert.doesNotMatch(controller, /keepScreenOn\s*=\s*snapshot\.screen\s*==/);
  assert.match(controller, /if \(!hostInteractive \|\| runState\.screen != WearRunUiScreen\.ACTIVE/);

  assert.match(service, /LocationAccuracy[\s\S]*horizontalPositionErrorMeters/);
  assert.match(service, /locationPoints\.forEach/);
  assert.match(service, /healthLocationManaged = true[\s\S]*stopDirectLocationUpdates\(\)[\s\S]*stopFusedRouteLocationUpdates\(\)/);
  assert.match(service, /healthHeartRateManaged = true[\s\S]*stopDirectHeartRateUpdates\(\)/);
  assert.match(service, /LIVE_SNAPSHOT_INTERVAL_MS = 1_000L/);
  assert.match(service, /PERSISTENCE_CHECKPOINT_MS = 10_000L/);
  assert.match(service, /pendingPersistenceSnapshot = snapshot[\s\S]*postDelayed\(persistenceRunnable, PERSISTENCE_CHECKPOINT_MS\)/);
  assert.match(service, /force = endAction == WearExerciseEndAction\.PUBLISH_FINAL_UPDATE/);

  assert.doesNotMatch(pager, /notifyItemRangeChanged/);
  assert.match(pager, /findViewHolderForAdapterPosition\(page\)/);
  assert.match(pager, /holder\.bind\(page, snapshot\)/);
  assert.match(pager, /else \{\s*notifyItemChanged\(page\)/);
});

test('wear slice A wires ambient (AOD) fan-out and visibility-following GPS warm-up', () => {
  const activity = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/MainActivity.kt');
  const service = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const controller = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');

  // MainActivity attaches AmbientLifecycleObserver and fans enter/update/exit out to both
  // controllers, in that order.
  assert.match(activity, /AmbientLifecycleObserver/);
  assert.match(activity, /lifecycle\.addObserver\(AmbientLifecycleObserver\(/);
  const onEnterIndex = activity.indexOf('onEnterAmbient(ambientDetails');
  const onUpdateIndex = activity.indexOf('onUpdateAmbient()');
  const onExitIndex = activity.indexOf('onExitAmbient()');
  assert.ok(onEnterIndex !== -1 && onUpdateIndex !== -1 && onExitIndex !== -1, 'expected all three ambient callbacks');
  assert.ok(onEnterIndex < onUpdateIndex && onUpdateIndex < onExitIndex, 'expected onEnterAmbient/onUpdateAmbient/onExitAmbient in that order');

  // Hard constraints from the plan: the pinned guard/return-line prefixes stay intact, and the
  // new ambient disjunct/early-return are additive.
  assert.match(controller, /if \(!hostInteractive \|\| runState\.screen != WearRunUiScreen\.ACTIVE[\s\S]*?\|\| ambientActive\) return/);
  assert.match(controller, /if \(ambientActive\) return/);

  // Battery slice (W2): the new ambient constants and the shortened preparation timeout.
  assert.match(service, /AMBIENT_LIVE_SNAPSHOT_INTERVAL_MS = 15_000L/);
  assert.match(service, /AMBIENT_ACTIVE_DURATION_CHECKPOINT_MS = 60_000L/);
  assert.match(service, /PREPARATION_TIMEOUT_MS = 90_000L/);

  // A healthy direct GPS fix drops the redundant high-accuracy fused request.
  assert.match(
    service,
    /lastDirectLocationElapsedRealtimeMs = elapsedRealtimeMs[\s\S]{0,400}stopFusedRouteLocationUpdates\(\)/,
  );
});
