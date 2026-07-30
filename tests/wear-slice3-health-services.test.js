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
    // Haptics (rest timer, per-kilometre splits, heart-zone alerts) need this or every
    // Vibrator.vibrate() throws SecurityException into a swallowing try/catch.
    'android.permission.VIBRATE',
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

test('wear slice C checks Health Services ownership before starting and re-arms sensors when superseded', () => {
  const service = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const policy = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseEndPolicy.kt');
  const strengthService = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthHrService.kt');
  const controller = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');

  // Ownership pre-check helper: queries getCurrentExerciseInfoAsync and fails OPEN.
  assert.match(service, /fun checkOtherAppOwnsExercise\(/);
  assert.match(service, /exerciseClient\.getCurrentExerciseInfoAsync\(\)/);
  assert.match(service, /ExerciseTrackedStatus\.OTHER_APP_IN_PROGRESS/);
  assert.match(service, /onResult\(false\)/);

  // Prepare path skips the Health Services warm-up when another app owns the exercise.
  assert.match(
    service,
    /checkOtherAppOwnsExercise \{ otherAppOwns ->[\s\S]{0,120}prepareHealthExercise\(\)/,
  );

  // Start path enters 호환 모드 instead of calling startExerciseAsync when another app owns it.
  assert.match(
    service,
    /checkOtherAppOwnsExercise \{ otherAppOwns ->[\s\S]{0,400}enableDirectSensorFallbacks\(\)[\s\S]{0,200}markFallback\(COMPAT_MODE_MESSAGE\)/,
  );
  assert.match(service, /COMPAT_MODE_MESSAGE = "다른 앱 운동과 함께 기록 중"/);

  // Existing pause/resume/end already no-op the Health Services calls when exerciseStarted is
  // false, so compat-mode runs pause/finish correctly without any HS call.
  assert.match(service, /if \(!exerciseStarted\) return\n\s*val pauseFuture/);
  assert.match(service, /if \(!exerciseStarted\) return\n\s*val resumeFuture/);
  assert.match(service, /if \(exerciseStarted\) \{\s*\n\s*val endFuture = exerciseClient\.endExerciseAsync\(\)/);

  // New end-policy action for an unsolicited end, plus its status mapping.
  assert.match(policy, /CONTINUE_WITH_FALLBACK/);
  assert.match(policy, /fun afterUnsolicitedEnd\(endRequested: Boolean\)/);
  assert.match(policy, /WearExerciseEndAction\.CONTINUE_WITH_FALLBACK -> when \(currentStatus\)/);

  // Supersede branch: clears the callback, re-arms direct sensors, marks a route gap, and uses the
  // new policy action + honest message — all inside the `isEnded && !endRequested` branch.
  assert.match(
    service,
    /state\.isEnded && !endRequested\) \{[\s\S]{0,600}clearExerciseCallback\(\)[\s\S]{0,100}enableDirectSensorFallbacks\(\)[\s\S]{0,100}markRouteGap\("superseded"\)/,
  );
  assert.match(service, /WearExerciseEndPolicy\.afterUnsolicitedEnd\(endRequested = endRequested\)/);
  assert.match(service, /unsolicitedHealthEndMessage\(update\)/);
  assert.match(service, /"다른 앱이 운동을 시작해 자체 GPS로 기록 중"/);
  assert.match(service, /"권한이 해제돼 자체 GPS로 기록 중"/);

  // The pre-existing final-update path (requested end) must keep working unchanged.
  assert.match(service, /force = endAction == WearExerciseEndAction\.PUBLISH_FINAL_UPDATE/);

  // UI: amber supersede/compat-mode branches land before the generic route-based "경로 기록 중" line.
  const supersedeIndex = controller.indexOf('다른 앱 운동 감지 · 자체 GPS 기록 중');
  const compatIndex = controller.indexOf('다른 앱과 함께 기록 중');
  const genericRouteIndex = controller.indexOf('경로 기록 중');
  assert.ok(supersedeIndex !== -1 && compatIndex !== -1 && genericRouteIndex !== -1);
  assert.ok(supersedeIndex < genericRouteIndex && compatIndex < genericRouteIndex);
  assert.match(controller, /다른 앱 운동 감지 · 자체 GPS 기록 중[\s\S]{0,60}#FFB35A/);
  assert.match(controller, /다른 앱과 함께 기록 중[\s\S]{0,60}#FFB35A/);

  // Strength HR service: ownership pre-check before starting its own exercise, and an isEnded
  // check on the exercise-update callback that falls back to the direct sensor.
  assert.match(strengthService, /fun checkOtherAppOwnsExercise\(/);
  assert.match(strengthService, /exerciseClient\.getCurrentExerciseInfoAsync\(\)/);
  assert.match(strengthService, /ExerciseTrackedStatus\.OTHER_APP_IN_PROGRESS/);
  assert.match(
    strengthService,
    /fun startHealthExercise\(\) \{\s*checkOtherAppOwnsExercise \{ otherAppOwns ->[\s\S]{0,150}startDirectHeartRate\(\)/,
  );
  const publishHeartRateBody = strengthService.slice(
    strengthService.indexOf('fun publishHeartRate(update: ExerciseUpdate)'),
    strengthService.indexOf('fun clearExerciseCallback'),
  );
  assert.match(publishHeartRateBody, /val isEnded = runCatching \{ update\.exerciseStateInfo\.state\.isEnded \}/);
  assert.match(publishHeartRateBody, /if \(isEnded\) \{/);
  assert.match(publishHeartRateBody, /clearExerciseCallback\(\)/);
  assert.match(publishHeartRateBody, /startDirectHeartRate\(\)/);
});

test('wear slice D requests Health Services elevation gain and buzzes at each completed kilometre', () => {
  const service = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const accumulator = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulator.kt');
  const uiMetrics = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiMetrics.kt');

  // W5a elevation slice: requested alongside DISTANCE_TOTAL, read the same defensive way.
  assert.ok(service.includes('DataType.ELEVATION_GAIN'), 'must request Health Services cumulative elevation gain');
  assert.match(service, /metrics\.getData\(DataType\.ELEVATION_GAIN\)/);
  assert.match(service, /healthElevationGainMeters\s*=\s*healthElevationGainMeters/);
  assert.ok(!service.includes('DataType.SPEED'), 'W5a must not introduce an HS speed request either');
  assert.match(accumulator, /elevationGainMeters/);

  // W5c split-vibration slice: last-announced-kilometre tracking lives in the service (so it fires
  // with the screen off/ambient), reset on a fresh start and seeded from the restored distance so a
  // relaunch mid-run doesn't re-buzz kilometres already passed.
  assert.match(service, /lastAnnouncedSplitKm/);
  assert.match(service, /floor\(distanceMeters \/ 1_000\.0\)/);
  assert.match(service, /floor\(snapshot\.distanceMeters \/ 1_000\.0\)/);
  assert.match(service, /WearRunHaptics\.vibrateSplit\(/);

  // Vibration helper itself: VibratorManager (API 31+) with a legacy Vibrator fallback, defensive
  // end to end (mirrors the existing strength rest-timer vibration).
  assert.match(uiMetrics, /object WearRunHaptics/);
  assert.match(uiMetrics, /VibratorManager/);
  assert.match(uiMetrics, /Vibrator\b/);
  assert.match(uiMetrics, /VibrationEffect/);
});

test('wear slice E buzzes on heart-zone departure and auto-pauses via Health Services', () => {
  const service = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const uiMetrics = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiMetrics.kt');
  const endPolicy = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseEndPolicy.kt');
  const controller = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const layout = readProjectFile('android/wear/src/main/res/layout/page_workout.xml');

  // W5b heart-zone departure haptic: pure tracker in WearRunUiMetrics.kt, fed from both HR paths
  // and wired to distinct UP/DOWN buzzes.
  assert.match(uiMetrics, /class WearHeartZoneAlertTracker/);
  assert.match(uiMetrics, /enum class WearHeartZoneAlertDirection/);
  assert.match(uiMetrics, /fun seedHomeZone\(/);
  assert.match(uiMetrics, /fun vibrateZoneUp\(/);
  assert.match(uiMetrics, /fun vibrateZoneDown\(/);
  assert.match(service, /private val heartZoneAlertTracker = WearHeartZoneAlertTracker\(\)/);
  assert.match(service, /heartZoneAlertTracker\.reset\(\)/);
  assert.match(service, /heartZoneAlertTracker\.seedHomeZone\(/);
  assert.match(service, /fun checkHeartZoneAlert\(/);
  assert.match(service, /WearRunHaptics\.vibrateZoneUp\(this\)/);
  assert.match(service, /WearRunHaptics\.vibrateZoneDown\(this\)/);
  // Fed from the Health Services HR path (publishExerciseUpdate) ...
  assert.match(service, /heartRateBpm\?\.let \{ bpm -> checkHeartZoneAlert\(bpm, elapsedRealtimeMs\) \}/);
  // ... and from the direct SensorManager path, so it also works in compat mode.
  const publishDirectHeartRateBody = service.slice(
    service.indexOf('private fun publishDirectHeartRate('),
    service.indexOf('private fun requestedDataTypes('),
  );
  assert.match(publishDirectHeartRateBody, /checkHeartZoneAlert\(bpm, elapsedRealtimeMs\)/);

  // W5d auto-pause slice: capability-driven config, first-observed AUTO_PAUSED transition, and the
  // two published messages.
  assert.doesNotMatch(service, /isAutoPauseAndResumeEnabled = false/);
  assert.match(service, /isAutoPauseAndResumeEnabled = supportsAutoPause/);
  assert.match(service, /supportsAutoPauseAndResume/);
  assert.match(service, /private var manualPauseActive = false/);
  assert.match(service, /private var autoPauseActive = false/);
  assert.match(service, /WearExerciseAutoPausePolicy\.transition\(/);
  assert.match(service, /WearAutoPauseTransition\.ENTERED_AUTO_PAUSE/);
  assert.match(service, /WearAutoPauseTransition\.EXITED_AUTO_PAUSE/);
  assert.match(service, /자동 일시정지 · 움직이면 다시 시작돼요/);
  assert.match(service, /자동 재시작/);
  assert.match(endPolicy, /object WearExerciseAutoPausePolicy/);
  assert.match(endPolicy, /enum class WearAutoPauseTransition/);
  // WearStrengthHrService's auto-pause stays disabled (untouched by this slice).
  const strengthService = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthHrService.kt');
  assert.match(strengthService, /isAutoPauseAndResumeEnabled = false/);

  // UI: runPausedReason surfaces the auto-pause message (blank for a manual pause), reusing the
  // existing paused screen/resume button rather than adding new navigation.
  assert.match(layout, /@\+id\/runPausedReason/);
  assert.match(controller, /runPausedReason/);
  assert.match(controller, /R\.id\.runPausedReason/);
});
