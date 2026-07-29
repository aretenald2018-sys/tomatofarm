import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { createRunningRouteHydrationController } from '../workout/running-route-hydration.js';

// 달력 탭 소스는 render-calendar.js + calendar/*.js 분할 이후 여러 파일에 걸쳐 있다.
// 이 스위트는 "달력 탭 코드 어딘가에 있는가"를 보므로 분할 소스를 이어붙여 검사한다.
const calendarJs = [
  '../render-calendar.js',
  '../calendar/format.js',
  '../calendar/gesture-policy.js',
  '../calendar/day-metrics.js',
  '../calendar/workout-read-model.js',
  '../calendar/export-text.js',
  '../calendar/session-state.js',
  '../calendar/detail-template.js',
  '../calendar/sheet-state.js',
  '../calendar/set-keyboard.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n\n');
const calendarActivityModelJs = readFileSync(new URL('../calendar/activity-model.js', import.meta.url), 'utf8');
const hydrationJs = readFileSync(new URL('../workout/running-route-hydration.js', import.meta.url), 'utf8');
const runningModelJs = readFileSync(new URL('../workout/running-model.js', import.meta.url), 'utf8');
const runningPresentationJs = readFileSync(new URL('../workout/running-presentation.js', import.meta.url), 'utf8');
const escapeHtmlJs = readFileSync(new URL('../utils/escape-html.js', import.meta.url), 'utf8');
const escapeHtmlBrowserJs = escapeHtmlJs.replace('export function escapeHtml', 'function escapeHtml');
const numberJs = readFileSync(new URL('../utils/number.js', import.meta.url), 'utf8');
const numberBrowserJs = numberJs.replace('export function toFiniteNumber', 'function toFiniteNumber');
const runningPresentationBrowserJs = runningPresentationJs.replaceAll('export function ', 'function ');
const styleCss = readAppCssSync();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function routePoints(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    lat: 37.5 + ((index + offset) / 100000),
    lng: 127 + ((index + offset) / 100000),
    ts: 1000 + index + offset,
  }));
}

function routeRef(pointCount = 620) {
  return {
    version: 1,
    routeId: `route-${pointCount}`,
    revision: 'a'.repeat(64),
    pointCount,
    chunkCount: Math.ceil(pointCount / 250),
    firstTimestampMs: 1000,
    lastTimestampMs: 1000 + pointCount - 1,
  };
}

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should exist`);
  const signatureEnd = source.indexOf(') {', start);
  const braceStart = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body should end`);
}

test('legacy inline route becomes ready without calling the repository loader', async () => {
  let loaderCalls = 0;
  const controller = createRunningRouteHydrationController(async () => {
    loaderCalls += 1;
    return [];
  });
  const preview = routePoints(8);
  const payload = controller.register({ points: preview });

  const result = await controller.hydrate(payload);

  assert.equal(loaderCalls, 0);
  assert.equal(result.status, 'ready');
  assert.equal(payload.status, 'ready');
  assert.deepEqual(payload.points, preview);
});

test('two concurrent hydrations for one payload share one loader promise', async () => {
  const pending = deferred();
  let loaderCalls = 0;
  const controller = createRunningRouteHydrationController(() => {
    loaderCalls += 1;
    return pending.promise;
  });
  const payload = controller.register({ points: routePoints(240), routeRef: routeRef() });

  const first = controller.hydrate(payload);
  const second = controller.hydrate(payload);

  assert.equal(first, second);
  assert.equal(loaderCalls, 1);
  pending.resolve(routePoints(620));
  await first;
  assert.equal(loaderCalls, 1);
});

test('a hydrated 620-point route replaces the 240-point preview', async () => {
  const fullRoute = routePoints(620);
  const controller = createRunningRouteHydrationController(async () => fullRoute);
  const payload = controller.register({ points: routePoints(240), routeRef: routeRef() });

  const result = await controller.hydrate(payload);

  assert.equal(result.status, 'ready');
  assert.equal(result.points.length, 620);
  assert.equal(payload.points.length, 620);
  assert.deepEqual(payload.points, fullRoute);
});

test('rejection clears the in-flight request so retry starts a fresh load', async () => {
  let loaderCalls = 0;
  const fullRoute = routePoints(620);
  const controller = createRunningRouteHydrationController(async () => {
    loaderCalls += 1;
    if (loaderCalls === 1) throw new Error('missing chunk');
    return fullRoute;
  });
  const payload = controller.register({ points: routePoints(240), routeRef: routeRef() });

  const failed = controller.hydrate(payload);
  await assert.rejects(failed, /missing chunk/);
  assert.equal(payload.promise, null);
  assert.equal(payload.status, 'error');

  const retried = controller.hydrate(payload);
  assert.notEqual(retried, failed);
  const result = await retried;
  assert.equal(loaderCalls, 2);
  assert.equal(result.status, 'ready');
  assert.equal(payload.points.length, 620);
});

test('invalidation makes a late prior response stale without overwriting newer state', async () => {
  const firstLoad = deferred();
  const secondLoad = deferred();
  let loaderCalls = 0;
  const controller = createRunningRouteHydrationController(() => {
    loaderCalls += 1;
    return loaderCalls === 1 ? firstLoad.promise : secondLoad.promise;
  });
  const ref = routeRef();
  const oldPayload = controller.register({ points: routePoints(240), routeRef: ref });
  const oldRequest = controller.hydrate(oldPayload);

  controller.invalidateAll();
  const newPayload = controller.register({ points: routePoints(240, 10000), routeRef: ref });
  const newRequest = controller.hydrate(newPayload);
  const newestRoute = routePoints(620, 20000);
  secondLoad.resolve(newestRoute);
  await newRequest;

  firstLoad.resolve(routePoints(620));
  const staleResult = await oldRequest;

  assert.equal(loaderCalls, 2);
  assert.equal(staleResult.status, 'stale');
  assert.deepEqual(newPayload.points, newestRoute);
  assert.equal(oldPayload.points.length, 240);
});

test('calendar running card automatically hydrates the full route before mounting the map', async () => {
  const sourceBundle = [
    '_registerWorkoutRunningMapPayload',
    '_findWorkoutRunningMapShell',
    '_mountWorkoutRunningMaps',
    '_showWorkoutRunningRoute',
  ].map(name => extractFunctionSource(calendarJs, name)).join('\n\n');
  const buildHarness = new Function('createRunningRouteHydrationController', 'loadRunningRoute', `
    const _workoutRunningMapPayloads = new Map();
    const _workoutRunningRouteHydration = createRunningRouteHydrationController(loadRunningRoute);
    let _workoutRunningMapSeq = 0;
    let renderCalls = 0;
    let renderedPointCount = 0;
    function renderRunningMap(_shell, options) {
      renderCalls += 1;
      renderedPointCount = options.points.length;
      return Promise.resolve();
    }
    ${sourceBundle}
    return function run(row) {
      const attributes = new Map();
      const status = { textContent: '경로 대기 중' };
      const shell = {
        getAttribute(name) { return name === 'data-wt-running-route-map' ? mapId : attributes.get(name) ?? null; },
        setAttribute(name, value) { attributes.set(name, value); },
        removeAttribute(name) { attributes.delete(name); },
        querySelector(selector) {
          if (selector === '[data-running-map-status]') return status;
          return null;
        },
      };
      const root = { querySelectorAll() { return [shell]; } };
      const mapId = _registerWorkoutRunningMapPayload(row);
      _mountWorkoutRunningMaps(root);
      return {
        mapId,
        payload: () => _workoutRunningMapPayloads.get(mapId),
        ready: () => _workoutRunningMapPayloads.get(mapId).promise,
        snapshot: () => ({
          renderCalls,
          renderedPointCount,
          status: status.textContent,
          mounted: attributes.get('data-wt-running-map-mounted') === 'true',
        }),
      };
    };
  `)(createRunningRouteHydrationController, () => Promise.resolve(routePoints(620)));

  const harness = buildHarness({ route: routePoints(240), routeRef: routeRef() });
  assert.equal(harness.snapshot().renderCalls, 0);
  await harness.ready();

  assert.equal(harness.payload().points.length, 620);
  assert.deepEqual(harness.snapshot(), {
    renderCalls: 1,
    renderedPointCount: 620,
    status: '지도 불러오는 중',
    mounted: true,
  });
});

test('375px running detail card hydrates the full route without overlap or clipping', async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setContent('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="root"></main></body></html>');
    await page.addStyleTag({ content: styleCss });
    await page.addStyleTag({ content: `
      html, body { margin: 0; width: 100%; min-width: 0; }
      #root { width: 100%; min-width: 0; padding: 12px; box-sizing: border-box; }
    ` });

    const sourceBundle = [
      '_fmtNum',
      '_formatDurationShort',
      '_registerWorkoutRunningMapPayload',
      '_findWorkoutRunningMapShell',
      '_mountWorkoutRunningMaps',
      '_showWorkoutRunningRoute',
      '_renderRunningRouteMap',
      '_renderRunningRouteDetail',
      '_renderRunningGpsStatus',
      '_renderWorkoutRunningDetailCard',
    ].map(name => extractFunctionSource(calendarJs, name)).join('\n\n');
    const controllerSource = hydrationJs.replace(
      'export function createRunningRouteHydrationController',
      'function createRunningRouteHydrationController',
    );

    await page.addScriptTag({ content: `
      ${controllerSource}
      const _workoutDetailCollapsed = new Set();
      const _workoutRunningMapPayloads = new Map();
      let _workoutRunningMapSeq = 0;
      const workoutDetailRuntime = {
        registerRunningMapPayload: row => _registerWorkoutRunningMapPayload(row),
      };
      let loaderCalls = 0;
      let renderCalls = 0;
      let pendingLoad = null;
      function loadRunningRoute() {
        loaderCalls += 1;
        return new Promise((resolve, reject) => { pendingLoad = { resolve, reject }; });
      }
      function renderRunningMap(shell, options) {
        renderCalls += 1;
        shell.dataset.mapPointCount = String(options.points.length);
        return Promise.resolve();
      }
      function destroyRunningMaps() {}
      const _workoutRunningRouteHydration = createRunningRouteHydrationController(loadRunningRoute);
      ${escapeHtmlBrowserJs}
      const _esc = escapeHtml;
      ${numberBrowserJs}
      const _num = toFiniteNumber;
      ${runningPresentationBrowserJs}
      const _formatRunningClock = formatRunningClock;
      const _formatRunningDistance = formatRunningDistance;
      const _formatRunningPaceCard = formatRunningPaceCard;
      const _runningSourceLabel = runningSourceLabel;
      const _runningMetricItems = runningMetricItems;
      const _runningPlaceLabel = runningPlaceLabel;
      const _runningGpsInfoLabel = runningGpsInfoLabel;
      ${sourceBundle}

      window.__mountRunningCard = (row) => {
        const root = document.getElementById('root');
        root.innerHTML = '<section data-wt-day-sheet>' +
          _renderWorkoutRunningDetailCard('2026-07-10', 2, row, 0) +
          '</section>';
        _mountWorkoutRunningMaps(root);
      };
      window.__resolveRunningRoute = points => pendingLoad.resolve(points);
      window.__runningSnapshot = () => {
        const shell = document.querySelector('[data-wt-running-route-map]');
        return {
          loaderCalls,
          renderCalls,
          mapPointCount: Number(shell?.dataset.mapPointCount || 0),
          status: shell?.querySelector('[data-running-map-status]')?.textContent || '',
          mapMounted: shell?.getAttribute('data-wt-running-map-mounted') === 'true',
        };
      };
      window.__runningLayout = () => {
        const card = document.querySelector('.wt-running-read-card');
        const map = document.querySelector('[data-wt-running-route-map]');
        const blocks = [
          document.querySelector('.wt-running-overview'),
          document.querySelector('.wt-running-route-wrap'),
          document.querySelector('.wt-running-detail-stats'),
          document.querySelector('.wt-max-actions'),
        ].filter(Boolean);
        const overlaps = [];
        for (let index = 0; index < blocks.length - 1; index += 1) {
          const current = blocks[index].getBoundingClientRect();
          const next = blocks[index + 1].getBoundingClientRect();
          if (current.bottom > next.top + 1) overlaps.push(index);
        }
        const clipped = Array.from(card.querySelectorAll(
          '.wt-running-distance-hero strong, .wt-running-primary-stats strong, .wt-running-detail-stats strong, [data-running-map-status]'
        )).filter(element => element.getClientRects().length && element.scrollWidth > element.clientWidth + 1)
          .map(element => element.textContent.trim());
        const cardRect = card.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          cardInsideViewport: cardRect.left >= 0 && cardRect.right <= window.innerWidth + 1,
          mapVisible: map.getBoundingClientRect().height > 0,
          gpsInfoVisible: !!document.querySelector('.wt-run-gps-info'),
          gpsStatusVisible: !!document.querySelector('.wt-run-gps-status'),
          metricCount: document.querySelectorAll('.wt-running-primary-stats span').length,
          overlaps,
          clipped,
        };
      };
    ` });

    const preview = routePoints(240);
    const fullRoute = routePoints(620);
    await page.evaluate((row) => window.__mountRunningCard(row), {
      key: 'running',
      label: '러닝',
      source: 'gps',
      distanceKm: 6.2,
      durationSec: 2232,
      speedKmh: 10,
      avgPaceSecPerKm: 360,
      calories: 420,
      elevationGainM: 42,
      avgHeartRateBpm: 148,
      cadenceSpm: 172,
      segmentCount: 2,
      gapCount: 1,
      interrupted: true,
      route: preview,
      routeRef: routeRef(),
      routeSummary: { pointCount: 620, segmentCount: 2, gapCount: 1 },
      placeSummary: { label: '서울 러닝 경로' },
    });

    assert.deepEqual(await page.evaluate(() => window.__runningSnapshot()), {
      loaderCalls: 1,
      renderCalls: 0,
      mapPointCount: 0,
      status: '전체 경로 불러오는 중',
      mapMounted: true,
    });
    const layout = await page.evaluate(() => window.__runningLayout());
    assert.equal(layout.viewportWidth, 375);
    assert.equal(layout.horizontalOverflow, false);
    assert.equal(layout.cardInsideViewport, true);
    assert.equal(layout.mapVisible, true);
    assert.equal(layout.gpsInfoVisible, true);
    assert.equal(layout.gpsStatusVisible, false);
    assert.equal(layout.metricCount, 6);
    assert.deepEqual(layout.overlaps, []);
    assert.deepEqual(layout.clipped, []);

    await page.evaluate(points => window.__resolveRunningRoute(points), fullRoute);
    await page.waitForFunction(() => Number(document.querySelector('[data-wt-running-route-map]')?.dataset.mapPointCount || 0) === 620);
    const hydrated = await page.evaluate(() => window.__runningSnapshot());
    assert.equal(hydrated.loaderCalls, 1);
    assert.equal(hydrated.renderCalls, 1);
    assert.equal(hydrated.mapPointCount, 620);
    assert.equal(hydrated.mapMounted, true);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});

test('calendar source propagates route refs and loads the full route automatically', () => {
  assert.match(calendarJs, /loadRunningRoute,/);
  assert.match(calendarJs, /createRunningRouteHydrationController/);
  assert.match(calendarJs, /from '\.\.\/workout\/running-presentation\.js'/);
  assert.match(calendarJs, /runRouteRef:\s*null/);
  assert.match(runningModelJs, /runRouteRef:\s*_clone\(source\.runRouteRef, null\)/);
  assert.match(calendarJs, /routeRef:\s*_clonePlain\(session\.runRouteRef\s*\|\|\s*null\)/);
  assert.match(calendarActivityModelJs, /routeRef:\s*day\.runRouteRef\s*\|\|\s*null/);
  assert.match(calendarJs, /routeRef:\s*row\.routeRef\s*\|\|\s*null/);
  assert.match(calendarJs, /전체 경로 불러오는 중/);
  assert.match(calendarJs, /전체 경로를 불러오지 못했어요/);
  assert.match(calendarJs, /querySelectorAll\?\.\('\[data-wt-running-route-map\]'\)/);
});
