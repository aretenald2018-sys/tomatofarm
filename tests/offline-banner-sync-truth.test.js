import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The offline banner used to read navigator.onLine and nothing else. Android
// WebView and some desktop network stacks report false while the connection
// works, so the app told the user it was offline while every write succeeded —
// and stayed silent when writes actually failed on a "online" connection.
// It now prefers the outcome of the last real server round trip.

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }

  toggle(name, force) {
    if (force === undefined) {
      if (this.values.has(name)) this.values.delete(name);
      else this.values.add(name);
      return this.values.has(name);
    }
    if (force) this.values.add(name);
    else this.values.delete(name);
    return force;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.textContent = '';
    this.children = [];
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  appendChild(child) { this.children.push(child); return child; }
}

function installGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

async function withBanner(run, { onLine = true } = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const fakeDocument = {
    body: new FakeElement(),
    createElement: () => new FakeElement(),
    addEventListener: (type, handler) => {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
  };
  const fakeWindow = {
    addEventListener: (type, handler) => {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
  };
  const navigatorState = { onLine };

  const restoreDocument = installGlobal('document', fakeDocument);
  const restoreWindow = installGlobal('window', fakeWindow);
  const restoreNavigator = installGlobal('navigator', navigatorState);

  try {
    // A fresh module instance per test — the banner keeps module-level state.
    const moduleUrl = new URL('../utils/ux-polish.js', import.meta.url);
    const module = await import(`${moduleUrl.href}?banner=${encodeURIComponent(run.name || 'case')}${Math.random()}`);
    module.initOfflineBanner();
    const banner = fakeDocument.body.children[0];
    await run({
      banner,
      navigatorState,
      isVisible: () => banner.classList.contains('visible'),
      emitSyncStatus: (state) => {
        for (const handler of documentListeners.get('data:sync-status') || []) {
          handler({ detail: { state } });
        }
      },
      emitConnectivity: (type) => {
        for (const handler of windowListeners.get(type) || []) handler();
      },
    });
  } finally {
    restoreNavigator();
    restoreWindow();
    restoreDocument();
  }
}

test('a successful server round trip clears a false offline hint', async () => {
  await withBanner(async ({ isVisible, emitSyncStatus }) => {
    assert.equal(isVisible(), true, 'an offline hint alone still raises the banner at boot');

    emitSyncStatus('ok');
    assert.equal(isVisible(), false, 'a completed server write proves the connection works');
  }, { onLine: false });
});

test('a reported-online session that cannot reach the server still warns the user', async () => {
  await withBanner(async ({ isVisible, emitSyncStatus }) => {
    assert.equal(isVisible(), false);

    emitSyncStatus('err');
    assert.equal(isVisible(), true, 'a failed server write must surface even when onLine is true');

    emitSyncStatus('ok');
    assert.equal(isVisible(), false, 'recovery clears the banner again');
  });
});

test('connectivity events alone cannot override a proven working connection', async () => {
  await withBanner(async ({ isVisible, navigatorState, emitSyncStatus, emitConnectivity }) => {
    emitSyncStatus('ok');
    navigatorState.onLine = false;
    emitConnectivity('offline');
    assert.equal(isVisible(), false, 'a stale offline event must not contradict a successful write');

    emitSyncStatus('err');
    assert.equal(isVisible(), true);
    navigatorState.onLine = true;
    emitConnectivity('online');
    assert.equal(isVisible(), true, 'the banner clears on the next successful write, not on the event');
  });
});

test('the intermediate syncing state never flips the banner on its own', async () => {
  await withBanner(async ({ isVisible, emitSyncStatus }) => {
    emitSyncStatus('err');
    assert.equal(isVisible(), true);

    emitSyncStatus('syncing');
    assert.equal(isVisible(), true, 'a write in progress is not yet evidence of recovery');
  });
});

test('data-core broadcasts every sync outcome before touching optional status nodes', () => {
  const dataCoreSource = readFileSync(new URL('../data/data-core.js', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const start = dataCoreSource.indexOf('export function _setSyncStatus(state)');
  assert.notEqual(start, -1, '_setSyncStatus should exist');
  const body = dataCoreSource.slice(start, dataCoreSource.indexOf('\n}\n', start));

  const dispatch = body.indexOf("new CustomEvent('data:sync-status'");
  const earlyReturn = body.indexOf('if (!dot || !txt) return;');
  assert.notEqual(dispatch, -1, 'sync outcomes should be broadcast to the shell');
  assert.ok(dispatch < earlyReturn,
    'a missing sync-dot element must not swallow the sync-status broadcast');
});
