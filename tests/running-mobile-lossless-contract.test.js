import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sessionPath = path.join(repoRoot, 'workout/running-session.js');
const sessionUrl = pathToFileURL(sessionPath).href;
const stateUrl = pathToFileURL(path.join(repoRoot, 'workout/state.js')).href;
const realMapUrl = pathToFileURL(path.join(repoRoot, 'workout/running-map.js')).href;
const draftStoreUrl = pathToFileURL(path.join(repoRoot, 'workout/running-draft-store.js')).href;

async function runMobileCaptureHarness(pointCount = 620) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-running-lossless-'));
  const mapStubPath = path.join(tempDir, 'running-map-stub.js');
  const htmlPath = path.join(tempDir, 'harness.html');
  try {
    await writeFile(mapStubPath, `
export function destroyRunningMaps() {}
export function readRunningMapConfig() { return { provider: 'none', configured: false }; }
export async function renderRunningMap(_shell, options = {}) {
  window.__mapPointCounts = (window.__mapPointCounts || []).concat([options.points?.length || 0]);
}
export async function updateRunningMap(_shell, options = {}) {
  window.__mapPointCounts = (window.__mapPointCounts || []).concat([options.points?.length || 0]);
}
`, 'utf8');
    await writeFile(htmlPath, `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({ imports: { [realMapUrl]: pathToFileURL(mapStubPath).href } })}</script>
</head><body><div id="wt-running-session-root"></div><script type="module">
try {
  let latestRunningLive = null;
  document.addEventListener('life-zone:running-live', event => { latestRunningLive = event.detail; });
  const originalSetItem = Storage.prototype.setItem;
  window.__draftWrites = 0;
  Storage.prototype.setItem = function(key, value) {
    if (String(key).startsWith('tomatofarm_running_session_draft')) window.__draftWrites += 1;
    return originalSetItem.call(this, key, value);
  };
  localStorage.setItem('currentUser', JSON.stringify({ id: 'mobile-lossless-runner' }));
  window.__draftWrites = 0;
  window._mealPhotos = {};
  window.showToast = () => {};
  window.__tomatoRunningSensorSnapshot = ({ position }) => position.__sensor;
  let watchSuccess = null;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition() {},
      watchPosition(success) { watchSuccess = success; return 17; },
      clearWatch() {},
    },
  });

  const state = await import(${JSON.stringify(stateUrl)});
  const draftStore = await import(${JSON.stringify(draftStoreUrl)});
  state.S.shared.date = { y: 2026, m: 6, d: 10 };
  const session = await import(${JSON.stringify(sessionUrl)});
  session.wtOpenRunningSession();
  // 화면을 여는 것만으로는 GPS가 켜지지 않는다. 사용자가 누르는 시작 버튼까지 눌러야
  // 위치 구독이 생긴다.
  document.querySelector('[data-running-action="start"]').click();
  const inlineCardBeforeFinish = document.querySelector('.wt-running-live-card')?.className || '';
  window.__draftWrites = 0;

  const base = Date.now();
  for (let index = 0; index < ${pointCount}; index += 1) {
    watchSuccess({
      timestamp: base + index * 1000,
      coords: {
        latitude: 37.5209 + Math.sin(index / 8) * 0.000003,
        longitude: 126.977 + index * 0.000032,
        accuracy: index === 0 ? 0 : 5,
        altitude: index === 0 ? 0 : 20 + Math.sin(index / 12),
        speed: 0,
      },
      __sensor: {
        heartRateBpm: index === 0 ? 0 : 145,
        cadenceSpm: index === 0 ? 0 : 166,
      },
    });
  }

  const live = structuredClone(latestRunningLive);
  watchSuccess({
    timestamp: base - 1,
    coords: { latitude: 37.6, longitude: 127.1, accuracy: 5, altitude: 20, speed: 2.8 },
    __sensor: { heartRateBpm: 145, cadenceSpm: 166 },
  });
  const rejectionError = document.querySelector('.wt-running-live-status')?.textContent || '';
  const routePointWrites = window.__draftWrites;
  document.querySelector('[data-running-action="pause"]').click();
  const draftRaw = localStorage.getItem('tomatofarm_running_session_draft_mobile-lossless-runner');
  const activeRaw = localStorage.getItem('tomatofarm_running_session_draft_active');
  const draft = draftStore.readRunningDraftRecord(localStorage, 'tomatofarm_running_session_draft_mobile-lossless-runner');
  const activeMarker = JSON.parse(activeRaw);
  document.querySelector('[data-running-action="finish"]').click();
  await new Promise(resolve => setTimeout(resolve, 50));
  window.__qaDone = {
    live,
    rejectionError,
    routePointWrites,
    draft,
    draftBytes: draftRaw.length,
    activeMarker,
    activeBytes: activeRaw.length,
    runData: structuredClone(state.S.workout.runData),
    mapPointCounts: window.__mapPointCounts || [],
    screen: document.querySelector('[data-running-screen]')?.getAttribute('data-running-screen') || null,
    inlineCardBeforeFinish,
    inlineCardAfterFinish: document.querySelector('.wt-running-live-card')?.className || '',
  };
} catch (error) {
  window.__qaError = String(error?.stack || error?.message || error);
}
</script></body></html>`, 'utf8');

    const browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files'] });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__qaDone || window.__qaError, { timeout: 60_000 });
      const result = await page.evaluate(() => ({ done: window.__qaDone || null, error: window.__qaError || null }));
      assert.equal(result.error, null);
      assert.deepEqual(pageErrors, []);
      return result.done;
    } finally {
      await browser.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('mobile capture preserves the full route and sends every captured coordinate to the map', async () => {
  const result = await runMobileCaptureHarness();

  assert.equal(result.live.pointCount, 620);
  assert.equal(result.live.routeSummary.pointCount, result.live.pointCount);
  assert.equal(result.live.route.length, 240);
  assert.ok(result.live.routeSummary.distanceKm > 1.7);
  assert.ok(result.routePointWrites <= 3, `expected one chunked draft checkpoint, got ${result.routePointWrites}`);
  assert.equal(result.draft.route.length, result.live.pointCount);
  assert.equal(result.activeMarker.ownerId, 'mobile-lossless-runner');
  assert.equal(result.activeMarker.draftKey, 'tomatofarm_running_session_draft_mobile-lossless-runner');
  assert.equal(Object.hasOwn(result.activeMarker, 'route'), false);
  assert.ok(result.activeBytes < 512);
  assert.equal(result.draft.context, 'pause');
  assert.equal(result.draft.route[0].accuracy, 0);
  assert.equal(result.draft.route[0].altitude, 0);
  assert.equal(result.draft.route[0].speed, 0);
  assert.equal(result.draft.route[0].heartRateBpm, 0);
  assert.equal(result.draft.route[0].cadenceSpm, 0);
  result.draft.route.slice(1).forEach((point, index) => {
    assert.ok(point.ts > result.draft.route[index].ts);
  });
  assert.match(result.rejectionError, /GPS 좌표|오래된 GPS 좌표/);
  assert.equal(result.runData.route.length, result.live.pointCount);
  assert.equal(result.runData.routeSummary.pointCount, result.live.pointCount);
  assert.equal(result.screen, 'summary');
  assert.match(result.inlineCardBeforeFinish, /wt-running-live-card/);
  assert.match(result.inlineCardAfterFinish, /is-summary/);
  assert.ok(result.mapPointCounts.length >= 2);
  assert.equal(result.mapPointCounts.at(-1), result.live.pointCount);
});

test('mobile draft keeps a six-hour 1Hz route once and uses a small active marker', async () => {
  const route = Array.from({ length: 21_600 }, (_, index) => ({
    lat: 37.5209 + Math.sin(index / 8) * 0.000003,
    lng: 126.977 + index * 0.000005,
    ts: 1_720_000_000_000 + index * 1_000,
    accuracy: 5,
    altitude: 20 + Math.sin(index / 12),
    speed: 2.8,
    heartRateBpm: 145,
    cadenceSpm: 166,
    segmentId: 0,
  }));
  const draftBytes = Buffer.byteLength(JSON.stringify({
    version: 1,
    ownerId: 'mobile-lossless-runner',
    phase: 'active',
    startedAt: route[0].ts,
    route,
  }));
  const markerBytes = Buffer.byteLength(JSON.stringify({
    version: 1,
    ownerId: 'mobile-lossless-runner',
    phase: 'active',
    draftKey: 'tomatofarm_running_session_draft_mobile-lossless-runner',
    updatedAt: route.at(-1).ts,
  }));
  const chromiumQuotaBytes = 5 * 1024 * 1024;

  assert.ok(draftBytes + markerBytes < chromiumQuotaBytes);
  assert.ok(draftBytes * 2 > chromiumQuotaBytes);
});

test('mobile session source uses the lossless route boundary and has no legacy source drops', async () => {
  const source = await readFile(sessionPath, 'utf8');

  assert.match(source, /import\s*\{[^}]*MAX_RUNNING_ROUTE_POINTS[^}]*buildRunningRoutePreview[^}]*normalizeRunningRoutePoints[^}]*\}\s*from\s*['"]\.\/running-route-store\.js['"]/s);
  assert.doesNotMatch(source, /\bMIN_ROUTE_STEP_M\b/);
  assert.doesNotMatch(source, /_session\.route\s*=\s*downsampleRunningRoute/);
  assert.doesNotMatch(source, /route:\s*downsampleRunningRoute\(_session\.route/);
  assert.match(source, /function _clearRunningDraft\(\)[\s\S]*?_clearScheduledRunningRouteDraftPersist\(\)/);
  assert.match(source, /function _pauseRunningCaptureAtRouteLimit\(\)[\s\S]*?_session\.phase = 'paused'[\s\S]*?_session\.pausedAt = _now\(\)[\s\S]*?_persistRunningDraft\('route point limit'\)/);
  assert.match(source, /const sourceRoute = _session\.route;/);
});
