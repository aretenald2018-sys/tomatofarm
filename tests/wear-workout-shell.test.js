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

test('wear activity shell hosts a single run+strength surface (no legacy six-page dashboard)', () => {
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

  // MainActivity owns two workout controllers now (run + strength), bound to the same host and
  // wired for mutual exclusion (see the plan's "러닝 기능과의 공존 설계").
  assert.match(mainActivity, /WearStrengthUiController/);
  assert.match(mainActivity, /wearWorkoutUi\.isStrengthActive\s*=\s*wearStrengthUi::isStrengthActive/);
  assert.match(mainActivity, /wearWorkoutUi\.isStrengthOccupyingScreen\s*=\s*wearStrengthUi::isStrengthOccupyingScreen/);
  assert.match(mainActivity, /wearStrengthUi\.onScreenChanged\s*=/);

  // Restoration priority ①러닝 -> ②헬스 -> ③모드 선택: the run restore call must appear (and be
  // checked) before the strength restore call in onCreate's textual order.
  const onCreateStart = mainActivity.indexOf('override fun onCreate');
  const onResumeStart = mainActivity.indexOf('override fun onResume');
  assert.notEqual(onCreateStart, -1);
  assert.notEqual(onResumeStart, -1);
  const onCreateBody = mainActivity.slice(onCreateStart, onResumeStart);
  assertOrder(onCreateBody, 'restoreRunServiceIfNeeded()', 'wearStrengthUi.restoreIfNeeded');
});

function assertOrder(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `expected to find "${first}"`);
  assert.notEqual(secondIndex, -1, `expected to find "${second}"`);
  assert.ok(firstIndex < secondIndex, `expected "${first}" before "${second}"`);
}

test('wear workout layout exposes running and strength controls, one pager of each, and no legacy carousel', () => {
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

  for (const id of [
    'strengthOpenButton',
    'strengthPickerScreen',
    'strengthPickerList',
    'strengthContextEmptyView',
    'strengthActiveScreen',
    'strengthExercisePager',
    'strengthPageDots',
    'strengthLiveHeartRate',
    'strengthAddExerciseButton',
    'strengthFinishButton',
    'strengthSummaryScreen',
    'strengthSummaryStats',
    'strengthSummarySyncStatus',
    'strengthSummaryDoneButton',
  ]) {
    assert.match(workoutLayout, new RegExp(`@\\+id/${id}`), `${id} must exist in the wear strength flow`);
  }

  assert.equal(
    [...workoutLayout.matchAll(/@(?:\+id|id)\/runMetricPager\b/g)].length,
    1,
    'page_workout.xml must declare exactly one active run metrics pager',
  );
  assert.equal(
    [...workoutLayout.matchAll(/@(?:\+id|id)\/strengthExercisePager\b/g)].length,
    1,
    'page_workout.xml must declare exactly one strength exercise pager',
  );
  assert.match(activeFlow, /androidx\.viewpager2\.widget\.ViewPager2/);
  assert.match(activeFlow, /@(?:\+id|id)\/runMetricPager\b/);
  assert.doesNotMatch(
    workoutLayout,
    /@\+id\/pager|@\+id\/indicator|dot[0-5]|page_(streak|checkin|week|stocks|timer)|wearWorkoutPicker|wearWorkoutCarousel|wearWorkoutCarouselStrip|walkComingSoonButton|bikeComingSoonButton|rowComingSoonButton|stepComingSoonButton|wo_list|준비중|오늘 앱 기록 없음/,
  );

  // Both mode buttons on the ready screen keep their existing ids/roles (러닝 first, 헬스 added).
  assert.match(workoutLayout, /러닝/);
  assert.match(workoutLayout, /헬스/);

  const exerciseCard = read('android', 'wear', 'src', 'main', 'res', 'layout', 'wear_strength_page_exercise.xml');
  assert.match(exerciseCard, /세트 완료/);
});

test('wear run controller starts exercise and saves completed runs, refusing to start while strength is active', () => {
  const controller = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearWorkoutUiController.kt');
  const state = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearRunUiState.kt');
  const bridge = read('workout', 'wear-bridge.js');

  assert.match(state, /READY/);
  assert.doesNotMatch(state, /PICKER/);

  assert.match(controller, /WearRunUiScreen\.READY/);
  assert.match(controller, /WearExerciseService\.startRun/);
  assert.match(controller, /WearWorkoutDataLayer\.sendRunComplete/);
  assert.doesNotMatch(controller, /HorizontalScrollView|Toast|ComingSoon|centerRunButton|wearWorkoutCarousel/);

  // Mutual exclusion with strength (plan's "러닝 기능과의 공존 설계" §2): the run controller refuses
  // to start while strength owns the picker/carousel, and hides its own ready screen whenever any
  // strength screen is sharing the host.
  assert.match(controller, /var isStrengthActive: \(\) -> Boolean = \{ false \}/);
  assert.match(controller, /var isStrengthOccupyingScreen: \(\) -> Boolean = \{ false \}/);
  assert.match(controller, /if \(isStrengthActive\(\)\)/);
  assert.match(controller, /snapshot\.screen == WearRunUiScreen\.READY && !isStrengthOccupyingScreen\(\)/);

  assert.match(bridge, /wear-running/);
  assert.match(bridge, /saveWorkoutDay\(\{ silent: true \}\)/);
});

test('wear strength controller wires picker/active/summary screens and shares the run save-and-ack transport', () => {
  const controller = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearStrengthUiController.kt');
  const pagerAdapter = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearStrengthPagerAdapter.kt');
  const bridge = read('workout', 'wear-bridge.js');

  // Entry guard + GPS warm-up handoff (plan §1-2).
  assert.match(controller, /WearExerciseSessionStore\.current\(\)\.status != WearExerciseSessionStatus\.IDLE/);
  assert.match(controller, /러닝 진행 중/);
  assert.match(controller, /WearExerciseService\.cancelPreparation/);
  assert.match(controller, /WearExerciseService\.prepareRun/);

  // Picker -> carousel -> HR service lifecycle.
  assert.match(controller, /state\.addExercise\(/);
  assert.match(controller, /WearStrengthHrService\.start/);
  assert.match(controller, /WearStrengthHrService\.end/);
  assert.match(controller, /WearStrengthHrService\.restore/);
  assert.match(controller, /WearStrengthSessionPersistence\.save/);
  assert.match(controller, /WearStrengthSessionPersistence\.restore/);
  assert.match(controller, /완료한 세트가 없어요/);

  // Same transport/ack choreography as the run controller's syncRunSummary.
  assert.match(controller, /WearStrengthPayload\.fromSession/);
  assert.match(controller, /WearWorkoutDataLayer\.sendStrengthComplete/);
  assert.match(controller, /WearWorkoutDataLayer\.addSavedListener/);
  assert.match(controller, /휴대폰에 저장했어요/);

  // Rotary bezel maps to kg adjustment on the active card.
  assert.match(controller, /OnGenericMotionListener|setOnGenericMotionListener/);
  assert.match(controller, /SOURCE_ROTARY_ENCODER/);

  assert.match(pagerAdapter, /RecyclerView\.Adapter/);
  assert.match(pagerAdapter, /wear_strength_page_exercise/);

  assert.match(bridge, /type === 'strength'/);
  assert.match(bridge, /wear-strength-import/);
});

test('wear run and strength save sources are reviewable (not hidden by gitignore)', () => {
  const controller = read('android', 'wear', 'src', 'main', 'java', 'com', 'lifestreak', 'wear', 'workout', 'WearWorkoutUiController.kt');
  const reviewableFiles = [
    'android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutBridge.kt',
    'android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutListenerService.kt',
    'android/wear/build.gradle',
    'android/wear/proguard-rules.pro',
    'android/wear/src/debug/AndroidManifest.xml',
    'android/wear/src/debug/java/com/lifestreak/wear/debug/WearRouteReplayReceiver.kt',
    'android/wear/src/main/AndroidManifest.xml',
    'android/wear/src/main/res/drawable/wear_cardio_circle_muted.xml',
    'android/wear/src/main/res/drawable/wear_cardio_circle_primary.xml',
    'android/wear/src/main/res/drawable/wear_cardio_circle_stop.xml',
    'android/wear/src/main/res/drawable/wear_run_footer_scrim.xml',
    'android/wear/src/main/res/drawable/wear_run_map_round.xml',
    'android/wear/src/main/res/drawable/wear_strength_dot_active.xml',
    'android/wear/src/main/res/drawable/wear_strength_dot_inactive.xml',
    'android/wear/src/main/res/drawable/wear_strength_pill_muted.xml',
    'android/wear/src/main/res/drawable/wear_strength_pill_primary.xml',
    'android/wear/src/main/res/drawable/wear_strength_pill_stop.xml',
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
    'android/wear/src/main/res/values/dimens.xml',
    'android/wear/src/main/res/values/ids.xml',
    'android/wear/src/main/res/values/strings.xml',
    'android/wear/src/main/res/values/styles.xml',
    'android/wear/src/main/res/values/wear.xml',
    'android/wear/src/main/java/com/lifestreak/wear/MainActivity.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearAppRefreshListenerService.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseActiveDurationTracker.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseEndPolicy.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulator.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseService.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearExerciseSessionStore.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunLiveRouteMapView.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunPayload.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunMetricPagerAdapter.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunGraphViews.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiMetrics.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearRunUiState.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthCatalog.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthContextStore.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthHrAccumulator.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthHrService.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthHrStore.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthPagerAdapter.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthPayload.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthSessionPersistence.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthSessionState.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearStrengthUiController.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutDataLayer.kt',
    'android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt',
    'android/wear/src/main/res/layout/wear_run_page_summary.xml',
    'android/wear/src/main/res/layout/wear_run_page_pace.xml',
    'android/wear/src/main/res/layout/wear_run_page_heart.xml',
    'android/wear/src/main/res/layout/wear_run_page_heart_zones.xml',
    'android/wear/src/main/res/layout/wear_run_page_route.xml',
    'android/wear/src/main/res/layout/wear_strength_page_exercise.xml',
    'android/wear/src/main/res/layout/wear_strength_picker_row_exercise.xml',
    'android/wear/src/main/res/layout/wear_strength_picker_row_group.xml',
    'android/wear/src/main/res/layout/wear_strength_picker_row_header.xml',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearExerciseActiveDurationTrackerTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearExerciseEndPolicyTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearExerciseMetricAccumulatorTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearRouteMapProjectionTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearRunPayloadTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearRunUiStateTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearStrengthCatalogTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearStrengthHrAccumulatorTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearStrengthPayloadTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearStrengthSessionPersistenceTest.kt',
    'android/wear/src/test/java/com/lifestreak/wear/workout/WearStrengthSessionStateTest.kt',
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
