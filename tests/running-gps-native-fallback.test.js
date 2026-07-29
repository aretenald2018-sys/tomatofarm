import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('phone APK requests precise location and runs a foreground GPS service', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const build = read('android/app/build.gradle');
  const activity = read('android/app/src/main/java/com/lifestreak/app/MainActivity.java');
  const plugin = read('android/app/src/main/java/com/lifestreak/app/running/TomatoRunningLocationPlugin.java');
  const service = read('android/app/src/main/java/com/lifestreak/app/running/TomatoRunningLocationService.java');

  assert.match(manifest, /ACCESS_FINE_LOCATION/);
  assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/);
  assert.match(manifest, /TomatoRunningLocationService/);
  assert.match(manifest, /foregroundServiceType="location"/);
  assert.match(activity, /registerPlugin\(TomatoRunningLocationPlugin\.class\)/);
  assert.match(plugin, /requestPermissionForAlias\("location"/);
  assert.match(plugin, /startForegroundService/);
  assert.match(service, /LocationManager\.GPS_PROVIDER/);
  assert.match(build, /play-services-location:21\.3\.0/);
  assert.match(service, /FusedLocationProviderClient/);
  assert.match(service, /Priority\.PRIORITY_HIGH_ACCURACY/);
  assert.match(service, /result\.getLocations\(\)/);
  assert.doesNotMatch(service, /LocationManager\.NETWORK_PROVIDER/);
  assert.match(service, /requestLocationUpdates/);
});

test('phone route collection rejects stale and inaccurate fixes and drains native points on finish', () => {
  const store = read('android/app/src/main/java/com/lifestreak/app/running/PhoneRunningLocationStore.java');
  const session = read('workout/running-session.js');

  assert.match(store, /MAX_ACCURACY_M = 35f/);
  assert.match(store, /MAX_LOCATION_AGE_MS = 30_000L/);
  assert.match(store, /MAX_RUNNING_SPEED_MPS = 15\.0/);
  assert.match(store, /PREFS_NAME = "tomato_running_location"/);
  assert.match(store, /POINTS_FILE_NAME = "running-location-points\.jsonl"/);
  assert.match(store, /public static synchronized void restore\(Context context\)/);
  assert.match(store, /appendLastPoint\(context\)/);
  assert.match(store, /void resume\(Context context\) \{\s*restore\(context\);\s*resume\(\);/);
  assert.match(store, /void stop\(Context context\) \{\s*restore\(context\);\s*stop\(\);/);
  assert.match(session, /maximumAge:\s*0/);
  assert.match(session, /TomatoRunningLocation/);
  assert.match(session, /await _stopWatch\('finish'\)/);
  assert.match(session, /stopTracking\?\.\(\{ afterIndex: _session\.nativeLocationCursor \}\)/);
});

test('watch uses direct GPS fallback and refuses to start without precise location permission', () => {
  const service = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const controller = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const accumulator = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulator.kt');

  assert.match(service, /LocationManager\.GPS_PROVIDER/);
  assert.match(service, /startDirectLocationUpdates\(\)/);
  assert.doesNotMatch(service, /LocationManager\.NETWORK_PROVIDER/);
  assert.match(service, /when \(intent\?\.action\)[\s\S]*ensurePersistenceListener\(\)/);
  assert.match(service, /directLocationListener = listener/);
  assert.match(service, /GPS provider unavailable/);
  assert.match(
    read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseSessionStore.kt'),
    /ROUTE_FILE_NAME = "wear-running-route\.jsonl"/,
  );
  assert.match(service, /WearRoutePoint\([\s\S]*accuracy = accuracy\.toDouble\(\)/);
  assert.match(service, /GPS weak ±\$\{accuracy\.roundToInt\(\)\}m/);
  assert.match(service, /point\.accuracy as\? LocationAccuracy[\s\S]*horizontalPositionErrorMeters[\s\S]*recentDirectGpsAccuracy\(pointElapsedRealtimeMs\)/);
  assert.match(service, /lastDirectGpsAccuracyM = accuracy\.toDouble\(\)[\s\S]*if \(accuracy > MAX_DIRECT_GPS_ACCURACY_M\)/);
  assert.match(service, /it in MIN_ALTITUDE_M\.\.MAX_ALTITUDE_M/);
  assert.match(controller, /야외에서 더 정확해져요/);
  assert.match(controller, /경로 자동 기록/);
  assert.doesNotMatch(controller, /위치 확인 중/);
  assert.match(controller, /경로 기록 중/);
  assert.doesNotMatch(controller, /\$\{snapshot\.routePoints\.size\}점|accuracyText/);
  assert.match(service, /Sensor\.TYPE_HEART_RATE/);
  assert.match(service, /registerListener\(listener, sensor, SensorManager\.SENSOR_DELAY_NORMAL\)/);
  assert.match(service, /ACTIVE_DURATION_CHECKPOINT_MS = 10_000L/);
  assert.match(service, /checkpointHandler\.postDelayed\(checkpointRunnable, ACTIVE_DURATION_CHECKPOINT_MS\)/);
  assert.match(service, /activeDurationMs = activeDurationTracker\.activeDurationAt\(elapsedRealtimeMs\)/);
  assert.doesNotMatch(service, /metrics\.getData\(DataType\.DISTANCE_TOTAL\)/);
  assert.doesNotMatch(service, /DataType\.SPEED/);
  assert.match(accumulator, /distanceSamples = routeDistanceSamples\(movementRoute\)/);
  assert.match(service, /private fun handlePauseRun\(\)[\s\S]*stopActiveDurationCheckpoints\(\)/);
  assert.match(controller, /ACCESS_FINE_LOCATION/);
  assert.match(controller, /위치 권한을 켜주세요/);
  assert.match(controller, /경로 저장됨/);
  assert.match(controller, /runMetricPageIndicator/);
});

test('watch warms location before start and keeps companion-assisted fixes out of route distance', () => {
  const build = read('android/wear/build.gradle');
  const activity = read('android/wear/src/main/java/com/lifestreak/wear/MainActivity.kt');
  const service = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt');
  const controller = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const layout = read('android/wear/src/main/res/layout/page_workout.xml');
  const map = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunLiveRouteMapView.kt');

  assert.match(build, /play-services-location:21\.3\.0/);
  assert.match(activity, /WearExerciseService\.prepareRun\(this\)/);
  assert.match(activity, /WearExerciseSessionStore\.current\(\)\.status == WearExerciseSessionStatus\.IDLE/);
  assert.match(service, /ACTION_PREPARE_RUN/);
  assert.match(service, /fun prepareRun[\s\S]*WearExerciseSessionStore\.current\(\)\.status != WearExerciseSessionStatus\.IDLE/);
  assert.match(service, /prepareExerciseAsync/);
  assert.match(service, /Priority\.PRIORITY_BALANCED_POWER_ACCURACY/);
  assert.match(service, /Priority\.PRIORITY_HIGH_ACCURACY/);
  const startHandler = service.match(/private fun handleStartRun\(\)[\s\S]*?private fun handleDebugRoutePoint/)?.[0] ?? '';
  const resumeHandler = service.match(/private fun handleResumeRun\(\)[\s\S]*?private fun handleEndRun/)?.[0] ?? '';
  assert.doesNotMatch(startHandler, /startFusedRouteLocationUpdates\(\)/);
  assert.doesNotMatch(resumeHandler, /startFusedRouteLocationUpdates\(\)/);
  assert.match(service, /onProviderDisabled[\s\S]*startFusedRouteLocationUpdates\(\)/);
  assert.match(service, /private fun handlePauseRun[\s\S]*stopFusedRouteLocationUpdates\(\)/);
  assert.match(service, /reportedElapsedRealtimeMs <= lastDirectLocationElapsedRealtimeMs/);
  assert.match(service, /private fun publishAssistedLocation[\s\S]*if \(!isPreparing \|\| accumulator != null\) return/);
  assert.doesNotMatch(
    service.match(/private fun publishAssistedLocation[\s\S]*?private fun publishPreparationStatus/)?.[0] ?? '',
    /WearRoutePoint|applyMetricUpdate|publishFromAccumulator/,
  );
  assert.match(layout, /runReadyGpsStatus/);
  assert.match(controller, /준비 완료/);
  assert.match(map, /달리면 경로가 나타나요/);
});

test('watch UI does not invent calories, pace, or heart-zone time when sensors have no data', () => {
  const metrics = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiMetrics.kt');
  const accumulator = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulator.kt');
  const summary = read('android/wear/src/main/res/layout/wear_run_page_summary.xml');
  const workoutLayout = read('android/wear/src/main/res/layout/page_workout.xml');
  const adapter = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunMetricPagerAdapter.kt');
  const graphs = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearRunGraphViews.kt');
  const routePage = read('android/wear/src/main/res/layout/wear_run_page_route.xml');
  const controller = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt');
  const dataLayer = read('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutDataLayer.kt');

  assert.doesNotMatch(metrics, /calorieText|estimateCaloriesKcal|FALLBACK_SECONDS_PER_KM|HEART_ZONE_DEFAULT_SAMPLE_MS/);
  assert.doesNotMatch(summary, /kcal|Calories/);
  assert.match(summary, /runSummaryPageHeartRate/);
  assert.doesNotMatch(adapter, /String\.format[\s\S]*point\.lat/);
  assert.match(graphs, /if \(values\.size < 2\)[\s\S]*페이스 계산 중/);
  assert.match(routePage, /wear_run_map_round/);
  assert.match(routePage, /android:clipToOutline="true"/);
  assert.match(metrics, /if \(secondsPerKm < MIN_VALID_SECONDS_PER_KM\) return@mapNotNull null/);
  assert.match(metrics, /\.takeIf \{ it\.size >= 2 \}/);
  assert.match(accumulator, /reportedAccuracyM > MAX_DISTANCE_GPS_ACCURACY_M/);
  assert.doesNotMatch(controller, /summarySyncStatus\s*=\s*"[^"]*(?:대기열|payload|전송 중)/);
  assert.doesNotMatch(dataLayer, /대기열|등록 완료/);
  assert.doesNotMatch(workoutLayout, /RUN SAVED/);
});

test('empty running routes never render the Seoul City Hall fallback as a recorded route', () => {
  const runningMap = read('workout/running-map.js');
  const calendarDetail = read('calendar/detail-template.js');

  assert.match(runningMap, /if \(!route\.length\) \{[\s\S]*'no-location'[\s\S]*return null/);
  assert.match(calendarDetail, /if \(!hasStoredRoute\) \{[\s\S]*GPS 경로가 저장되지 않았어요/);
});
