import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const pwaRegisterJs = readFileSync(new URL('../pwa-register.js', import.meta.url), 'utf8');
const buildInfoJs = readFileSync(new URL('../utils/build-info.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const swJs = readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + readFileSync(new URL('../runtime-assets.js', import.meta.url), 'utf8');

function loadPwaRegisterHarness({ activeDraft = false } = {}) {
  const state = {
    banners: [],
    messages: [],
    reloads: 0,
    serviceWorkerListeners: new Map(),
    timers: [],
    windowListeners: new Map(),
  };
  const sessionItems = new Map();

  const addMappedListener = (map, type, handler) => {
    const handlers = map.get(type) || [];
    handlers.push(handler);
    map.set(type, handlers);
  };

  const context = {
    URL,
    clearTimeout() {},
    console: { error() {}, log() {}, warn() {} },
    location: {
      hostname: 'aretenald2018-sys.github.io',
      href: 'https://aretenald2018-sys.github.io/tomatofarm/',
    },
    navigator: {
      serviceWorker: {
        controller: {},
        addEventListener(type, handler) {
          addMappedListener(state.serviceWorkerListeners, type, handler);
        },
        getRegistration() {
          return Promise.resolve(null);
        },
        getRegistrations() {
          return Promise.resolve([]);
        },
        ready: Promise.resolve({ scope: 'https://aretenald2018-sys.github.io/tomatofarm/' }),
        register() {
          return Promise.resolve({
            active: {},
            addEventListener() {},
            installing: null,
            scope: 'https://aretenald2018-sys.github.io/tomatofarm/',
            update() { return Promise.resolve(this); },
            waiting: null,
          });
        },
      },
    },
    sessionStorage: {
      getItem(key) { return sessionItems.has(key) ? sessionItems.get(key) : null; },
      removeItem(key) { sessionItems.delete(key); },
      setItem(key, value) { sessionItems.set(key, String(value)); },
    },
    setTimeout(handler, ms) {
      state.timers.push({ handler, ms });
      return state.timers.length;
    },
    window: {
      __showAppUpdateBanner(registration, meta) {
        state.banners.push({ registration, meta });
      },
      __tomatoAppReady: true,
      __wtHasActiveDraft() {
        return activeDraft;
      },
      addEventListener(type, handler) {
        addMappedListener(state.windowListeners, type, handler);
      },
      location: {
        reload() { state.reloads += 1; },
      },
    },
  };

  vm.runInNewContext(pwaRegisterJs, context, { filename: 'pwa-register.js' });
  return { context, state };
}

function makeWaitingRegistration(state) {
  const worker = {
    scriptURL: 'https://aretenald2018-sys.github.io/tomatofarm/sw.js',
    state: 'installed',
    postMessage(message) {
      state.messages.push(message);
    },
  };
  return {
    registration: {
      scope: 'https://aretenald2018-sys.github.io/tomatofarm/',
      waiting: worker,
      update() { return Promise.resolve(this); },
    },
    worker,
  };
}

test('active workout draft blocks automatic service worker reload and shows update banner', () => {
  const { context, state } = loadPwaRegisterHarness({ activeDraft: true });
  const { registration, worker } = makeWaitingRegistration(state);

  context._requestAppUpdateBanner(registration, worker);

  assert.equal(JSON.stringify(state.messages), JSON.stringify([]));
  assert.equal(state.reloads, 0);
  assert.equal(state.banners.length, 1);
});

test('service worker update timeout shows banner instead of reloading without controllerchange', () => {
  const { context, state } = loadPwaRegisterHarness();
  const { registration, worker } = makeWaitingRegistration(state);

  assert.equal(typeof context._requestAppUpdateBanner, 'function');
  context._requestAppUpdateBanner(registration, worker);

  assert.equal(JSON.stringify(state.messages), JSON.stringify([{ type: 'SKIP_WAITING' }]));
  assert.equal(state.reloads, 0);

  for (const timer of state.timers.filter((entry) => entry.ms === 1500)) {
    timer.handler();
  }

  assert.equal(state.reloads, 0);
  assert.equal(state.banners.length, 1);
});

test('same service worker update is handled only once even if duplicate signals arrive', () => {
  const { context, state } = loadPwaRegisterHarness();
  const { registration, worker } = makeWaitingRegistration(state);

  context._requestAppUpdateBanner(registration, worker);
  for (const timer of state.timers.filter((entry) => entry.ms === 1500)) {
    timer.handler();
  }
  context._requestAppUpdateBanner(registration, worker);

  assert.equal(JSON.stringify(state.messages), JSON.stringify([{ type: 'SKIP_WAITING' }]));
  assert.equal(state.reloads, 0);
  assert.equal(state.banners.length, 1);
});

test('a distinct service worker at the same URL is handled as a new release', () => {
  const { context, state } = loadPwaRegisterHarness({ activeDraft: true });
  const first = makeWaitingRegistration(state);
  const second = makeWaitingRegistration(state);

  context._requestAppUpdateBanner(first.registration, first.worker);
  context._requestAppUpdateBanner(second.registration, second.worker);

  assert.equal(state.messages.length, 0);
  assert.equal(state.banners.length, 2);
  assert.notEqual(state.banners[0].meta.key, state.banners[1].meta.key);
});

test('service worker controllerchange still reloads once', () => {
  const { context, state } = loadPwaRegisterHarness();
  const { registration, worker } = makeWaitingRegistration(state);

  context._requestAppUpdateBanner(registration, worker);
  const [controllerChange] = state.serviceWorkerListeners.get('controllerchange') || [];
  assert.equal(typeof controllerChange, 'function');

  controllerChange();
  for (const timer of state.timers.filter((entry) => entry.ms === 1500)) {
    timer.handler();
  }

  assert.equal(state.reloads, 1);
  assert.equal(state.banners.length, 0);
});

test('production app uses canonical asset URLs and one service worker cache namespace', () => {
  assert.match(indexHtml, /<script src="pwa-register\.js"><\/script>/);
  assert.match(indexHtml, /<script type="module" src="app\.js"><\/script>/);
  assert.match(appJs, /utils\/build-info\.js/);
  assert.match(appJs, /workout\/index\.js/);
  assert.doesNotMatch(appJs, /render-workout\.js/);
  assert.doesNotMatch(indexHtml + appJs, /\?v=/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
  assert.match(swJs, /STATIC_ASSETS\.map\(url => cache\.add\(new Request\(url, \{ cache: 'reload' \}\)\)\)/);
  assert.match(swJs, /const activation = self\.skipWaiting\(\);[\s\S]*?event\.waitUntil\(activation\);/);
});

test('more-menu manual app refresh uses build-info update helper', () => {
  assert.doesNotMatch(indexHtml, /class="[^"]*\btop-nav\b/);
  assert.match(indexHtml, /more-menu-section--app-actions[\s\S]*id="app-refresh-btn"[^>]+data-app-action="refresh-app-update"/);
  assert.match(appJs, /case 'refresh-app-update':/);
  assert.match(appJs, /window\.__requestTomatoAppRefresh\(\{ control, source: 'more-menu' \}\)/);
  assert.match(buildInfoJs, /export async function requestTomatoAppRefresh/);
  assert.match(buildInfoJs, /window\.__requestTomatoAppRefresh = requestTomatoAppRefresh/);
  assert.match(buildInfoJs, /__refreshTomatoAppSWRegistration/);
  assert.match(buildInfoJs, /__wtPersistActiveDraft/);
  assert.match(buildInfoJs, /_syncAppRefreshButtonState/);
  assert.match(buildInfoJs, /has-update/);
  assert.match(pwaRegisterJs, /const _handledAppSWWorkers = new WeakSet\(\)/);
  assert.doesNotMatch(pwaRegisterJs, /APP_SW_UPDATE_HANDLED_PREFIX|APP_SW_UPDATE_RELEASE/);
  assert.doesNotMatch(buildInfoJs, /app-update-indicator/);
  assert.doesNotMatch(buildInfoJs, /app-update-toggle/);
  assert.doesNotMatch(buildInfoJs, /app-update-reload/);
});
