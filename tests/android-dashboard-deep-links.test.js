import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const activity = readFileSync('android/app/src/main/java/com/lifestreak/app/MainActivity.java', 'utf8');
const app = readFileSync('app.js', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');

test('TomatoFarm exposes the dashboard module deep-link contract', () => {
  assert.match(manifest, /android:scheme="tomatofarm"/);
  assert.match(manifest, /android:host="diet"[\s\S]*android:pathPrefix="\/today"/);
  assert.match(manifest, /android:host="workout"[\s\S]*android:pathPrefix="\/season"/);
  assert.match(manifest, /android:host="workout"[\s\S]*android:pathPrefix="\/running"/);
  assert.match(activity, /"diet"\.equals\(host\)[\s\S]*return "diet"/);
  assert.match(activity, /"workout"\.equals\(host\)[\s\S]*"\/season"\.equals\(path\)[\s\S]*return "season"/);
  assert.match(activity, /"workout"\.equals\(host\)[\s\S]*"\/running"\.equals\(path\)[\s\S]*return "running"/);
});

test('dashboard destinations open their exact TomatoFarm screens', () => {
  assert.match(app, /action === 'diet'[\s\S]*switchTab\('diet', \{ allowAdminDestination: true \}\)/);
  assert.match(app, /action === 'season'[\s\S]*switchTab\('workout', \{ allowAdminDestination: true \}\)/);
  assert.doesNotMatch(app, /tm2OpenBoard/);
  assert.match(app, /action === 'running'[\s\S]*switchTab\('workout', \{[\s\S]*allowAdminDestination: true[\s\S]*workoutDate:[\s\S]*wtOpenRunningSession\(\)/);
  assert.match(app, /\['diet', 'season', 'running'\]\.includes\(entry\)/);
  assert.match(app, /window\.__tomatoAppReady !== true/);
  assert.match(app, /_dashboardDataReady !== true/);
  assert.match(app, /Promise\.resolve\(loadAll\(\)\)\.finally[\s\S]*_dashboardDataReady = true[\s\S]*openPendingDashboardEntry\(\)/);
  assert.match(app, /_dashboardDataLoadGeneration !== dashboardDataLoadGeneration/);
  assert.match(app, /!openedDashboardEntry && !_pendingDashboardEntry/);
  assert.match(activity, /window\.__tomatoAppReady===true[\s\S]*tomato-app-ready[\s\S]*once:true/);
  assert.doesNotMatch(app, /_takeWorkoutTargetSessionIndex/);
});

test('the distributable TomatoFarm APK version is bumped for deep links', () => {
  assert.match(gradle, /versionCode 4/);
  assert.match(gradle, /versionName "1\.3"/);
});
