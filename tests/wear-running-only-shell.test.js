import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => existsSync(path.join(root, ...parts));

function activeRunFlow(xml) {
  const activeStart = xml.indexOf('@+id/runActiveScreen');
  assert.notEqual(activeStart, -1, 'page_workout.xml must keep runActiveScreen');

  const pausedStart = xml.indexOf('@+id/runPausedScreen', activeStart);
  assert.notEqual(pausedStart, -1, 'page_workout.xml must keep runPausedScreen after active flow');

  return xml.slice(activeStart, pausedStart);
}

function gitIgnored(file) {
  const result = spawnSync('git', ['check-ignore', '-q', file], { cwd: root });
  return result.status === 0;
}

test('wear activity shell is a single run-only surface', () => {
  const activityMain = read('android', 'wear', 'src', 'main', 'res', 'layout', 'activity_main.xml');
  const mainActivity = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'MainActivity.kt');

  assert.match(activityMain, /layout="@layout\/page_workout"/);
  assert.doesNotMatch(activityMain, /ViewPager2|@\+id\/pager|@\+id\/indicator|dot[0-5]/);

  assert.doesNotMatch(
    mainActivity,
    /ViewPager2|RecyclerView|PageAdapter|getItemCount\(\)\s*=\s*6|bindStreak|bindCheckin|bindWeek|bindStocks|bindTimer|FirebaseHelper|CountDownTimer/,
  );
  assert.doesNotMatch(
    mainActivity,
    /R\.layout\.page_(streak|checkin|week|stocks|timer)/,
  );
});

test('wear workout layout exposes only running controls and the active metric pager', () => {
  const workoutLayout = read('android', 'wear', 'src', 'main', 'res', 'layout', 'page_workout.xml');
  const activeFlow = activeRunFlow(workoutLayout);

  for (const id of [
    'runReadyScreen',
    'runStartButton',
    'runActiveScreen',
    'runMetricPager',
    'runPauseButton',
    'runPausedScreen',
    'runResumeButton',
    'runFinalStopButton',
    'runSummaryScreen',
    'runSummaryDistance',
    'runSummaryDuration',
    'runSummaryHeartRate',
    'runSummarySyncStatus',
  ]) {
    assert.match(workoutLayout, new RegExp(`@\\+id/${id}`), `${id} must stay in the wear run flow`);
  }

  assert.equal(
    [...workoutLayout.matchAll(/@(?:\+id|id)\/runMetricPager\b/g)].length,
    1,
    'page_workout.xml must declare exactly one active metrics pager',
  );
  assert.match(activeFlow, /androidx\.viewpager2\.widget\.ViewPager2/);
  assert.match(activeFlow, /@(?:\+id|id)\/runMetricPager\b/);
  assert.doesNotMatch(
    workoutLayout,
    /@\+id\/pager|@\+id\/indicator|dot[0-5]|page_(streak|checkin|week|stocks|timer)|wearWorkoutPicker|wearWorkoutCarousel|wearWorkoutCarouselStrip|walkComingSoonButton|bikeComingSoonButton|rowComingSoonButton|stepComingSoonButton|wo_list|준비중|오늘 앱 기록 없음/,
  );
});

test('wear run controller starts exercise and saves completed runs through data layer', () => {
  const controller = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearWorkoutUiController.kt');
  const state = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearRunUiState.kt');
  const bridge = read('workout', 'wear-bridge.js');

  assert.match(state, /READY/);
  assert.doesNotMatch(state, /PICKER/);

  assert.match(controller, /WearRunUiScreen\.READY/);
  assert.match(controller, /WearExerciseService\.startRun/);
  assert.match(controller, /WearWorkoutDataLayer\.sendRunComplete/);
  assert.doesNotMatch(controller, /HorizontalScrollView|Toast|ComingSoon|centerRunButton|wearWorkoutCarousel/);

  assert.match(bridge, /wear-running/);
  assert.match(bridge, /saveWorkoutDay\(\{ silent: true \}\)/);
});

test('wear run save sources are reviewable and payload duration cannot underflow', () => {
  const controller = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearWorkoutUiController.kt');
  const reviewableFiles = [
    'android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutBridge.kt',
    'android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutListenerService.kt',
    'android/wear/build.gradle',
    'android/wear/proguard-rules.pro',
    'android/wear/src/main/AndroidManifest.xml',
    'android/wear/src/main/res/drawable/wear_cardio_circle_muted.xml',
    'android/wear/src/main/res/drawable/wear_cardio_circle_primary.xml',
    'android/wear/src/main/res/drawable/wear_cardio_circle_stop.xml',
    'android/wear/src/main/res/layout/activity_main.xml',
    'android/wear/src/main/res/layout/page_workout.xml',
    'android/wear/src/main/res/mipmap-hdpi/ic_launcher.png',
    'android/wear/src/main/res/mipmap-hdpi/ic_launcher_foreground.png',
    'android/wear/src/main/res/mipmap-hdpi/ic_launcher_round.png',
    'android/wear/src/main/res/mipmap-mdpi/ic_launcher.png',
    'android/wear/src/main/res/mipmap-mdpi/ic_launcher_foreground.png',
    'android/wear/src/main/res/mipmap-mdpi/ic_launcher_round.png',
    'android/wear/src/main/res/mipmap-xhdpi/ic_launcher.png',
    'android/wear/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png',
    'android/wear/src/main/res/mipmap-xhdpi/ic_launcher_round.png',
    'android/wear/src/main/res/mipmap-xxhdpi/ic_launcher.png',
    'android/wear/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png',
    'android/wear/src/main/res/mipmap-xxhdpi/ic_launcher_round.png',
    'android/wear/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    'android/wear/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
    'android/wear/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png',
    'android/wear/src/main/res/values/ids.xml',
    'android/wear/src/main/res/values/strings.xml',
    'android/wear/src/main/res/values/styles.xml',
    'android/wear/src/main/res/values/wear.xml',
    'android/wear/src/main/java/com/lifestreak/wear/MainActivity.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulator.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseSessionStore.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunPayload.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunMetricPagerAdapter.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunGraphViews.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiMetrics.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiState.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutDataLayer.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt',
    'android/wear/src/main/res/layout/wear_run_page_summary.xml',
    'android/wear/src/main/res/layout/wear_run_page_pace.xml',
    'android/wear/src/main/res/layout/wear_run_page_heart.xml',
    'android/wear/src/main/res/layout/wear_run_page_heart_zones.xml',
    'android/wear/src/main/res/layout/wear_run_page_route.xml',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulatorTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearRunPayloadTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearRunUiStateTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearWorkoutDataLayerTest.kt',
  ];

  assert.deepEqual(reviewableFiles.filter(gitIgnored), []);
  assert.match(controller, /internal fun buildWearRunSessionForSummary/);
  assert.match(
    controller,
    /maxOf\(\s*exerciseSnapshot\.activeDurationMs,\s*uiSnapshot\.durationMs,\s*1_000L,?\s*\)/,
  );
  assert.doesNotMatch(controller, /activeDurationMs\.takeIf \{ it > 0L \}/);
});

test('obsolete six-page wear artifacts are removed', () => {
  for (const file of [
    ['android', 'wear', 'src', 'main', 'res', 'layout', 'page_streak.xml'],
    ['android', 'wear', 'src', 'main', 'res', 'layout', 'page_checkin.xml'],
    ['android', 'wear', 'src', 'main', 'res', 'layout', 'page_week.xml'],
    ['android', 'wear', 'src', 'main', 'res', 'layout', 'page_stocks.xml'],
    ['android', 'wear', 'src', 'main', 'res', 'layout', 'page_timer.xml'],
    ['android', 'wear', 'src', 'main', 'res', 'layout', 'stock_row.xml'],
    ['android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'FirebaseHelper.kt'],
  ]) {
    assert.equal(exists(...file), false, `${file.join('/')} should be deleted`);
  }
});
