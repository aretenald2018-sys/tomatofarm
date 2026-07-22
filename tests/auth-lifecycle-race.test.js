import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const AUTH_SOURCE = readFileSync(new URL('../data/data-auth.js', import.meta.url), 'utf8');
const FEATURE_LOGIN_SOURCE = readFileSync(new URL('../feature-login.js', import.meta.url), 'utf8');
const DATA_ACCOUNT_SOURCE = readFileSync(new URL('../data/data-account.js', import.meta.url), 'utf8');
const DATA_API_SOURCE = readFileSync(new URL('../data/data-api.js', import.meta.url), 'utf8');
const AUTH_DATA_IMPORT_MARKER = "import('./" + "data.js')";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    const exactKey = String(key);
    return this.values.has(exactKey) ? this.values.get(exactKey) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

let authModuleSequence = 0;

async function loadAuthModule(overrides = {}) {
  const harnessKey = '__authLifecycleHarness' + (++authModuleSequence);
  const storage = new MemoryStorage();
  const idb = new Map();
  const harness = {
    currentUser: null,
    kimMode: 'admin',
    idb,
    async idbSet(key, value) {
      idb.set(key, value);
    },
    async idbGet(key) {
      return idb.get(key) ?? null;
    },
    async idbRemove(key) {
      idb.delete(key);
    },
    ...overrides,
  };
  globalThis[harnessKey] = harness;

  const coreSource = [
    'const harness = globalThis[' + JSON.stringify(harnessKey) + '];',
    "export const ADMIN_ID = 'admin';",
    "export const ADMIN_GUEST_ID = 'admin(guest)';",
    'export function getCurrentUserRef() { return harness.currentUser; }',
    'export function setCurrentUserRef(user) { harness.currentUser = user; }',
    'export function getKimMode() { return harness.kimMode; }',
    'export function setKimMode(mode) { harness.kimMode = mode; }',
    'export function _idbSet(key, value) { return harness.idbSet(key, value); }',
    'export function _idbGet(key) { return harness.idbGet(key); }',
    'export function _idbRemove(key) { return harness.idbRemove(key); }',
  ].join('\n');
  const coreUrl = 'data:text/javascript;base64,' + Buffer.from(coreSource).toString('base64');
  const platformSource = `export function isInstalledAppSurface() { return ${overrides.installedApp === true ? 'true' : 'false'}; }`;
  const platformUrl = 'data:text/javascript;base64,' + Buffer.from(platformSource).toString('base64');
  const moduleSource = AUTH_SOURCE.replace(
    "from './data-core.js';",
    'from ' + JSON.stringify(coreUrl) + ';',
  ).replace(
    "from '../utils/platform-session.js';",
    'from ' + JSON.stringify(platformUrl) + ';',
  );
  assert.notEqual(moduleSource, AUTH_SOURCE, 'data-auth core import should be replaced');

  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  const moduleUrl = 'data:text/javascript;base64,' +
    Buffer.from(moduleSource).toString('base64') + '#' + authModuleSequence;
  const auth = await import(moduleUrl);

  return {
    auth,
    harness,
    storage,
    cleanup() {
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      delete globalThis[harnessKey];
    },
  };
}

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, startToken + ' should exist');
  const end = source.indexOf(endToken, start);
  assert.notEqual(end, -1, endToken + ' should exist after ' + startToken);
  return source.slice(start, end);
}

test('late IndexedDB restore cannot replace a user selected after restore began', async () => {
  const backupRead = deferred();
  const readStarted = deferred();
  const writes = [];
  const loaded = await loadAuthModule({
    idbGet(key) {
      if (key === 'currentUser') {
        readStarted.resolve();
        return backupRead.promise;
      }
      return null;
    },
    async idbSet(key, value) {
      writes.push(key + ':' + (value?.id || value));
    },
  });

  try {
    const restorePromise = loaded.auth.restoreUserFromBackup();
    await readStarted.promise;

    const selectedUser = { id: 'owner-b', nickname: 'B' };
    const setResult = loaded.auth.setCurrentUser(selectedUser);
    assert.equal(setResult, undefined, 'setCurrentUser must remain synchronous');

    backupRead.resolve({ id: 'owner-a', nickname: 'A' });
    const restoreResult = await restorePromise;
    await loaded.auth.waitForAuthPersistence();

    assert.equal(restoreResult, selectedUser);
    assert.equal(loaded.harness.currentUser, selectedUser);
    assert.equal(JSON.parse(loaded.storage.getItem('currentUser')).id, 'owner-b');
    assert.deepEqual(writes, ['currentUser:owner-b']);
  } finally {
    loaded.cleanup();
  }
});

test('a fresh installed app restores the shared admin owner in Guest mode', async () => {
  const loaded = await loadAuthModule({ installedApp: true });

  try {
    const restored = loaded.auth.loadSavedUser();
    assert.equal(restored.id, 'admin');
    assert.equal(loaded.harness.kimMode, 'guest');
    assert.equal(loaded.storage.getItem('kim_authenticated'), 'true');
    await loaded.auth.waitForAuthPersistence();
    assert.equal(loaded.harness.idb.get('admin_authenticated'), true);
  } finally {
    loaded.cleanup();
  }
});

test('auth IndexedDB writes and removals run on one ordered promise chain', async () => {
  const operations = [];
  let activeOperations = 0;
  let maxActiveOperations = 0;
  const idb = new Map();

  async function runOperation(label, apply) {
    operations.push(label);
    activeOperations += 1;
    maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
    await new Promise(resolve => setImmediate(resolve));
    apply();
    activeOperations -= 1;
  }

  const loaded = await loadAuthModule({
    idb,
    idbSet(key, value) {
      return runOperation('set:' + key + ':' + (value?.id || value), () => idb.set(key, value));
    },
    idbRemove(key) {
      return runOperation('remove:' + key, () => idb.delete(key));
    },
    async idbGet(key) {
      return idb.get(key) ?? null;
    },
  });

  try {
    assert.equal(loaded.auth.setCurrentUser({ id: 'owner-a' }), undefined);
    loaded.auth.backupAdminAuth();
    loaded.auth.setCurrentUser(null);
    loaded.auth.setCurrentUser({ id: 'owner-b' });
    loaded.auth.clearAdminAuth();

    assert.equal(loaded.harness.currentUser.id, 'owner-b');
    await loaded.auth.waitForAuthPersistence();

    assert.equal(maxActiveOperations, 1);
    assert.deepEqual(operations, [
      'set:currentUser:owner-a',
      'set:admin_authenticated:true',
      'remove:currentUser',
      'remove:admin_authenticated',
      'remove:kim_authenticated',
      'set:currentUser:owner-b',
      'remove:admin_authenticated',
    ]);
    assert.equal(idb.get('currentUser').id, 'owner-b');
    assert.equal(idb.has('admin_authenticated'), false);
    assert.equal(idb.has('kim_authenticated'), false);
  } finally {
    loaded.cleanup();
  }
});

test('both account-exit flows delay reload until auth persistence is cleared', async () => {
  const waitGate = deferred();
  const events = [];
  const storage = {
    removeItem(key) { events.push('storage:' + key); },
  };
  const location = {
    reload() { events.push('reload'); },
  };
  const auth = {
    setCurrentUser(user) {
      assert.equal(user, null);
      events.push('clear-user');
    },
    disableInstalledAppSessionFallback() {},
    clearAdminAuth() { events.push('clear-admin'); },
    async waitForAuthPersistence() {
      events.push('wait-start');
      await waitGate.promise;
      events.push('wait-done');
    },
  };

  const confirmLogoutSource = sliceBetween(
    FEATURE_LOGIN_SOURCE,
    'async function confirmLogout()',
    'export async function switchKimMode',
  )
    .replace('async function confirmLogout()', 'async function confirmLogout(__data)')
    .replaceAll(AUTH_DATA_IMPORT_MARKER, 'Promise.resolve(__data)');
  const confirmLogout = new Function(
    'localStorage',
    'location',
    confirmLogoutSource + '\nreturn confirmLogout;',
  )(storage, location);

  const confirmPromise = confirmLogout(auth);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, [
    'clear-user',
    'storage:admin_authenticated',
    'storage:kim_authenticated',
    'clear-admin',
    'wait-start',
  ]);
  assert.equal(events.includes('reload'), false);

  waitGate.resolve();
  await confirmPromise;
  assert.deepEqual(events.slice(-2), ['wait-done', 'reload']);

  const otherAccountSource = sliceBetween(
    FEATURE_LOGIN_SOURCE,
    "document.getElementById('kim-lock-other').onclick",
    "setTimeout(() => document.getElementById('kim-lock-pw')",
  )
    .replace("document.getElementById('kim-lock-other')", 'target')
    .replaceAll(AUTH_DATA_IMPORT_MARKER, 'Promise.resolve(__data)');
  const target = {};
  const lockDiv = { remove() { events.push('remove-lock'); } };
  const otherWaitGate = deferred();
  const otherAuth = {
    disableInstalledAppSessionFallback() {},
    async waitForAuthPersistence() {
      events.push('other-wait-start');
      await otherWaitGate.promise;
      events.push('other-wait-done');
    },
  };
  new Function(
    'target',
    'setCurrentUser',
    'localStorage',
    'lockDiv',
    'location',
    '__data',
    otherAccountSource,
  )(
    target,
    auth.setCurrentUser,
    storage,
    lockDiv,
    location,
    otherAuth,
  );

  const eventStart = events.length;
  const otherPromise = target.onclick();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events.slice(eventStart), [
    'clear-user',
    'storage:admin_authenticated',
    'storage:kim_authenticated',
    'other-wait-start',
  ]);
  otherWaitGate.resolve();
  await otherPromise;
  assert.deepEqual(events.slice(-3), ['other-wait-done', 'remove-lock', 'reload']);
});

test('auth persistence wait is exported through the public data facade', () => {
  assert.match(DATA_API_SOURCE, /restoreUserFromBackup, waitForAuthPersistence,/);
});

test('account refresh cannot overwrite a user selected while its fetch is pending', async () => {
  const refreshSource = sliceBetween(
    DATA_ACCOUNT_SOURCE,
    'export async function refreshCurrentUserFromDB()',
    'export async function recoverDeletedAccounts()',
  ).replace('export async function', 'async function');

  let currentUser = { id: 'owner-a', nickname: 'old-a' };
  let accountRead = deferred();
  const appliedUsers = [];
  const refreshCurrentUserFromDB = new Function(
    'getCurrentUser',
    'getAccountList',
    'setCurrentUser',
    refreshSource + '\nreturn refreshCurrentUserFromDB;',
  )(
    () => currentUser,
    () => accountRead.promise,
    user => {
      appliedUsers.push(user);
      currentUser = user;
    },
  );

  const staleRefresh = refreshCurrentUserFromDB();
  currentUser = { id: 'owner-b', nickname: 'selected-b' };
  accountRead.resolve([{ id: 'owner-a', nickname: 'fresh-a' }]);
  await staleRefresh;
  assert.deepEqual(currentUser, { id: 'owner-b', nickname: 'selected-b' });
  assert.deepEqual(appliedUsers, []);

  accountRead = deferred();
  const matchingRefresh = refreshCurrentUserFromDB();
  const freshB = { id: 'owner-b', nickname: 'fresh-b' };
  accountRead.resolve([freshB]);
  await matchingRefresh;
  assert.equal(currentUser, freshB);
  assert.deepEqual(appliedUsers, [freshB]);
});
