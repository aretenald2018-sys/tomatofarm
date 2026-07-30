import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const wearLayoutRoot = path.join('android', 'wear', 'src', 'main', 'res', 'layout');
const wearWorkoutRoot = path.join(
  'android',
  'wear',
  'src',
  'main',
  'java',
  'com',
  'lifestreak',
  'wear',
  'workout',
);

const liveRunPageLayouts = [
  'wear_run_page_summary.xml',
  'wear_run_page_pace.xml',
  'wear_run_page_heart.xml',
  'wear_run_page_heart_zones.xml',
  'wear_run_page_route.xml',
];

const expectedLiveRunFiles = [
  path.join(wearWorkoutRoot, 'WearRunMetricPagerAdapter.kt'),
  path.join(wearWorkoutRoot, 'WearRunGraphViews.kt'),
  ...liveRunPageLayouts.map((file) => path.join(wearLayoutRoot, file)),
];

function projectPath(...parts) {
  return path.join(root, ...parts);
}

function readProjectFile(...parts) {
  return readFileSync(projectPath(...parts), 'utf8');
}

function assertProjectFileExists(relativePath) {
  assert.equal(existsSync(projectPath(relativePath)), true, `${relativePath} must exist`);
}

function gitIgnored(relativePath) {
  const result = spawnSync('git', ['check-ignore', '-q', relativePath], { cwd: root });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`git check-ignore failed for ${relativePath}: status ${result.status}`);
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function activeRunFlow(xml) {
  const activeStart = xml.indexOf('@+id/runActiveScreen');
  assert.notEqual(activeStart, -1, 'page_workout.xml must keep runActiveScreen');

  const nextFlowMarker = xml.indexOf('@+id/runPausedScreen', activeStart);
  assert.notEqual(nextFlowMarker, -1, 'page_workout.xml must keep runPausedScreen after active flow');

  return xml.slice(activeStart, nextFlowMarker);
}

test('wear active run page declares a ViewPager2 dependency for live metrics only', () => {
  const buildGradle = readProjectFile('android', 'wear', 'build.gradle');

  assert.match(
    buildGradle,
    /androidx\.viewpager2:viewpager2/,
    'android/wear/build.gradle must include androidx.viewpager2:viewpager2',
  );
  assert.doesNotMatch(
    buildGradle,
    /com\.google\.android\.gms:play-services-maps|com\.google\.android\.libraries\.maps|mapbox|osmdroid|mapsforge/i,
    'wear live route rendering must not add a map SDK dependency',
  );
});

test('page_workout hosts exactly one runMetricPager inside the active run flow', () => {
  const workoutLayout = readProjectFile('android', 'wear', 'src', 'main', 'res', 'layout', 'page_workout.xml');
  const activeFlow = activeRunFlow(workoutLayout);

  assert.equal(
    countMatches(workoutLayout, /@(?:\+id|id)\/runMetricPager\b/g),
    1,
    'page_workout.xml must declare exactly one runMetricPager overall',
  );
  assert.equal(
    countMatches(activeFlow, /@(?:\+id|id)\/runMetricPager\b/g),
    1,
    'runMetricPager must be inside runActiveScreen flow, before runPausedScreen',
  );
  assert.match(activeFlow, /androidx\.viewpager2\.widget\.ViewPager2/);
  assert.doesNotMatch(
    workoutLayout,
    /@(?:\+id|id)\/pager|@(?:\+id|id)\/indicator|dot[0-5]|page_(streak|checkin|week|stocks|timer)/,
    'old six-page dashboard pager artifacts must stay out of the wear shell',
  );
});

test('wear run live metric page layouts are present', () => {
  for (const layoutFile of liveRunPageLayouts) {
    const relativePath = path.join(wearLayoutRoot, layoutFile);
    assertProjectFileExists(relativePath);
  }
});

test('new wear live page source files are reviewable by git', () => {
  assert.deepEqual(
    expectedLiveRunFiles.filter(gitIgnored),
    [],
    'new wear live page files must not be hidden by git ignore rules',
  );
});

test('WearRunGraphViews uses local Canvas drawing and no map tiles or SDK hooks', () => {
  const relativePath = path.join(wearWorkoutRoot, 'WearRunGraphViews.kt');
  assertProjectFileExists(relativePath);

  const graphViews = readProjectFile(relativePath);

  assert.match(graphViews, /import android\.graphics\.Canvas/);
  assert.match(graphViews, /import android\.graphics\.Paint/);
  assert.match(graphViews, /override fun onDraw\(/);
  assert.match(graphViews, /draw(?:Line|Path|Circle|Rect)/);
  assert.doesNotMatch(
    graphViews,
    /MapView|GoogleMap|TileOverlay|UrlTileProvider|Mapbox|Osmdroid|HttpURLConnection|https?:\/\//i,
    'route and graph views must draw local samples without map tiles or external map SDKs',
  );
});

test('wear run pace page keeps current pace as the primary metric above average/fastest', () => {
  const pacePage = readProjectFile(path.join(wearLayoutRoot, 'wear_run_page_pace.xml'));

  const currentIndex = pacePage.indexOf('@+id/runPaceCurrent');
  const averageIndex = pacePage.indexOf('@+id/runPaceAverage');
  const fastestIndex = pacePage.indexOf('@+id/runPaceFastest');
  const graphIndex = pacePage.indexOf('@+id/runPaceGraph');
  assert.notEqual(currentIndex, -1, 'wear_run_page_pace.xml must declare runPaceCurrent');
  assert.notEqual(averageIndex, -1, 'wear_run_page_pace.xml must keep runPaceAverage');
  assert.notEqual(fastestIndex, -1, 'wear_run_page_pace.xml must keep runPaceFastest');
  assert.ok(
    currentIndex < averageIndex && averageIndex < fastestIndex && fastestIndex < graphIndex,
    'current pace must render above the average/fastest row and the pace graph',
  );

  // Primary metric reads visually larger than the secondary average/fastest row.
  const currentBlock = pacePage.slice(currentIndex, averageIndex);
  const currentSizeMatch = currentBlock.match(/textSize="(\d+)sp"/);
  const averageBlock = pacePage.slice(averageIndex, fastestIndex);
  const averageSizeMatch = averageBlock.match(/textSize="(\d+)sp"/);
  assert.ok(currentSizeMatch && averageSizeMatch, 'expected textSize on both runPaceCurrent and runPaceAverage');
  assert.ok(
    Number(currentSizeMatch[1]) > Number(averageSizeMatch[1]),
    'runPaceCurrent must be the visually larger, primary value',
  );
});

test('WearRunMetricPagerAdapter binds exactly the five live pages and no old dashboard pages', () => {
  const relativePath = path.join(wearWorkoutRoot, 'WearRunMetricPagerAdapter.kt');
  assertProjectFileExists(relativePath);

  const adapter = readProjectFile(relativePath);

  assert.match(adapter, /ViewPager2|RecyclerView\.Adapter/);
  assert.match(adapter, /wear_run_page_summary/);
  assert.match(adapter, /wear_run_page_pace/);
  assert.match(adapter, /wear_run_page_heart/);
  assert.match(adapter, /wear_run_page_heart_zones/);
  assert.match(adapter, /wear_run_page_route/);
  assert.match(
    adapter,
    /(?:PAGE_COUNT\s*=\s*5|getItemCount\(\)\s*(?::\s*Int)?\s*=\s*5|return\s+5\b)/,
    'live metric pager adapter must expose exactly five pages',
  );
  assert.doesNotMatch(
    adapter,
    /PAGE_COUNT\s*=\s*6|getItemCount\(\)[\s\S]{0,120}(?:=\s*6|return\s+6\b)|page_(streak|checkin|week|stocks|timer)/,
    'adapter must not restore the old six-page dashboard',
  );
});
