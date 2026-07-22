import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const AUTH_SOURCE = readFileSync(new URL('../data/data-auth.js', import.meta.url), 'utf8');
const FEATURE_LOGIN_SOURCE = readFileSync(new URL('../feature-login.js', import.meta.url), 'utf8');
const DATA_ACCOUNT_SOURCE = readFileSync(new URL('../data/data-account.js', import.meta.url), 'utf8');
const DATA_API_SOURCE = readFileSync(new URL('../data/data-api.js', import.meta.url), 'utf8');
const AUTH_DATA_IMPORT_MARKER = "import('./" + "data.js')";

const ADMIN_CONSOLE_ID = 'console-admin';
const PERSONAL_ID = 'personal';
const PERSONAL_LEGACY_ID = 'personal(guest)';

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

function inlineModule(source) {
  return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
}

let authModuleSequence = 0;

async function loadAuthModule(overrides = {}) {
  const harnessKey = '__authLifecycleHarness' + (++authModuleSequence);
  const storage = new MemoryStorage();
  const idb = new Map();
  const harness = {
    currentUser: null,
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

  const coreUrl = inlineModule([
    'const harness = globalThis[' + JSON.stringify(harnessKey) + '];',
    'export const ADMIN_CONSOLE_ID = ' + JSON.stringify(ADMIN_CONSOLE_ID) + ';',
    'export const PERSONAL_ID = ' + JSON.stringify(PERSONAL_ID) + ';',
    'export const PERSONAL_LEGACY_ID = ' + JSON.stringify(PERSONAL_LEGACY_ID) + ';',
    'export function getCurrentUserRef() { return harness.currentUser; }',
    'export function setCurrentUserRef(user) { harness.currentUser = user; }',
    'export function _idbSet(key, value) { return harness.idbSet(key, value); }',
    'export function _idbGet(key) { return harness.idbGet(key); }',
    'export function _idbRemove(key) { return harness.idbRemove(key); }',
  ].join('\n'));
  const unificationUrl = inlineModule([
    'const ADMIN_CONSOLE_ID = ' + JSON.stringify(ADMIN_CONSOLE_ID) + ';',
    'const PERSONAL_ID = ' + JSON.stringify(PERSONAL_ID) + ';',
    'const PERSONAL_LEGACY_ID = ' + JSON.stringify(PERSONAL_LEGACY_ID) + ';',
    'export function isAdminConsoleAccount(id) {',
    "  return String(id || '').trim() === ADMIN_CONSOLE_ID;",
    '}',
    'export function isPersonalSharedAccount(id) {',
    "  const value = String(id || '').trim();",
    '  return value === PERSONAL_ID || value === PERSONAL_LEGACY_ID;',
    '}',
  ].join('\n'));
  const platformUrl = inlineModule(
    `export function isInstalledAppSurface() { return ${overrides.installedApp === true ? 'true' : 'false'}; }`,
  );
  const moduleSource = AUTH_SOURCE.replace(
    "from './data-core.js';",
    'from ' + JSON.stringify(coreUrl) + ';',
  ).replace(
    "from './account-unification.js';",
    'from ' + JSON.stringify(unificationUrl) + ';',
  ).replace(
    "from '../utils/platform-session.js';",
    'from ' + JSON.stringify(platformUrl) + ';',
  );
  assert.notEqual(moduleSource, AUTH_SOURCE, 'data-auth core import should be replaced');
  assert.equal(moduleSource.includes("from './"), false, 'every relative import should be inlined');

  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  const auth = await import(inlineModule(moduleSource) + '#' + authModuleSequence);

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

test('a fresh installed app seeds the personal account without authenticating it', async () => {
  const loaded = await loadAuthModule({ installedApp: true });

  try {
    const restored = loaded.auth.loadSavedUser();
    assert.equal(restored.id, PERSONAL_ID);
    // The password lock screen is the only thing standing between an installed
    // surface and the account. Seeding must never pre-authenticate the session.
    assert.equal(loaded.auth.isSessionUnlocked(), false);
    assert.equal(loaded.storage.getItem(loaded.auth.SESSION_UNLOCK_KEY), null);
    // 관리자 권한은 seeding 으로 넘어오지 않는다.
    assert.equal(loaded.auth.isAdmin(), false);
    await loaded.auth.waitForAuthPersistence();
    assert.equal(loaded.harness.idb.has('session_unlocked'), false);
  } finally {
    loaded.cleanup();
  }
});

test('an installed surface never seeds the admin console account', async () => {
  const loaded = await loadAuthModule({ installedApp: true });

  try {
    assert.notEqual(loaded.auth.loadSavedUser().id, ADMIN_CONSOLE_ID);
    assert.equal(loaded.auth.isAdmin(), false);
  } finally {
    loaded.cleanup();
  }
});

test('an ordinary browser session is never seeded with the personal account', async () => {
  const loaded = await loadAuthModule({ installedApp: false });

  try {
    assert.equal(loaded.auth.loadSavedUser(), null);
    assert.equal(loaded.harness.currentUser, null);
  } finally {
    loaded.cleanup();
  }
});

test('choosing another account keeps the installed-app seed off on reload', async () => {
  const loaded = await loadAuthModule({ installedApp: true });

  try {
    assert.equal(loaded.auth.loadSavedUser().id, PERSONAL_ID);
    loaded.auth.setCurrentUser(null);
    loaded.auth.disableInstalledAppSessionFallback();
    assert.equal(loaded.auth.loadSavedUser(), null);
  } finally {
    loaded.cleanup();
  }
});

test('admin is decided by the signed-in account, not by any client-held mode', async () => {
  const loaded = await loadAuthModule();

  try {
    loaded.auth.setCurrentUser({ id: PERSONAL_ID });
    assert.equal(loaded.auth.isAdmin(), false);

    // 예전 모드 플래그를 되살려도 권한은 올라가지 않는다.
    loaded.storage.setItem('kimMode', 'admin');
    loaded.storage.setItem('admin_authenticated', 'true');
    assert.equal(loaded.auth.isAdmin(), false);

    loaded.auth.setCurrentUser({ id: ADMIN_CONSOLE_ID });
    assert.equal(loaded.auth.isAdmin(), true);

    loaded.auth.setCurrentUser(null);
    assert.equal(loaded.auth.isAdmin(), false);
  } finally {
    loaded.cleanup();
  }
});

test('the home card set does not depend on which account is signed in', async () => {
  // 2026-04 토마토 리뉴얼이 단위목표·미니메모·목표·퀘스트를 홈에서 내렸다.
  // 그 뒤 shouldShow 에 계정 우회로가 남아 있었고, 관리자 계정 분리 후속
  // 수정이 그 우회로를 넓히자 내려둔 카드 네 개가 개인 계정 홈에 되살아났다
  // (`dbd6bd4`). 권한 모델을 손대도 홈이 따라 움직이지 않도록 못박는다.
  const loaded = await loadAuthModule();
  const retired = ['unit_goal', 'mini_memo', 'goals', 'quests'];

  try {
    for (const id of [PERSONAL_ID, ADMIN_CONSOLE_ID, '최_준수']) {
      loaded.auth.setCurrentUser({ id });
      for (const card of retired) {
        assert.equal(
          loaded.auth.shouldShow('homeCards', card), false,
          `${card} must stay off the home tab for ${id}`,
        );
      }
      assert.equal(loaded.auth.shouldShow('homeCards', 'friends'), true);
      assert.equal(loaded.auth.shouldShow('homeCards', 'tomato_basket'), true);
    }

    // 관리 권한은 여전히 계정으로 결정된다 — 홈 구성과는 별개 축이다.
    loaded.auth.setCurrentUser({ id: ADMIN_CONSOLE_ID });
    assert.equal(loaded.auth.isAdmin(), true);
    loaded.auth.setCurrentUser({ id: PERSONAL_ID });
    assert.equal(loaded.auth.isAdmin(), false);
  } finally {
    loaded.cleanup();
  }
});

test('a legacy unlock flag cannot unlock a session under the new key', async () => {
  const loaded = await loadAuthModule();

  try {
    loaded.storage.setItem('admin_authenticated', 'true');
    loaded.storage.setItem('kim_authenticated', 'true');
    assert.equal(loaded.auth.isSessionUnlocked(), false);

    loaded.auth.clearLegacySessionUnlockFlags();
    assert.equal(loaded.storage.getItem('admin_authenticated'), null);
    assert.equal(loaded.storage.getItem('kim_authenticated'), null);

    loaded.auth.markSessionUnlocked();
    assert.equal(loaded.auth.isSessionUnlocked(), true);
    loaded.auth.clearSessionUnlock();
    assert.equal(loaded.auth.isSessionUnlocked(), false);
  } finally {
    loaded.cleanup();
  }
});

test('the admin console account cannot be entered without a stored password', async () => {
  const loaded = await loadAuthModule();

  try {
    const passwordless = { id: ADMIN_CONSOLE_ID, hasPassword: false, passwordHash: null };
    assert.equal(loaded.auth.accountNeedsPassword(passwordless), true);
    assert.equal(loaded.auth.verifyPassword(passwordless, ''), false);
    assert.equal(loaded.auth.verifyPassword(passwordless, 'anything'), false);

    const guarded = {
      id: ADMIN_CONSOLE_ID,
      hasPassword: true,
      passwordHash: loaded.auth.hashPassword('correct-horse'),
    };
    assert.equal(loaded.auth.verifyPassword(guarded, 'wrong'), false);
    assert.equal(loaded.auth.verifyPassword(guarded, 'correct-horse'), true);

    // 다른 계정의 "비밀번호 없음 = 바로 로그인" 동작은 그대로 유지된다.
    const openAccount = { id: 'other_user', hasPassword: false, passwordHash: null };
    assert.equal(loaded.auth.verifyPassword(openAccount, ''), true);

    // 저장된 해시 문자열 자체를 입력해도 관리자로는 들어갈 수 없다.
    // passwordHash 오기입 하나가 알려진 비밀번호가 되면 안 된다.
    const misconfigured = { id: ADMIN_CONSOLE_ID, hasPassword: true, passwordHash: 'h_xxxxxx' };
    assert.equal(loaded.auth.verifyPassword(misconfigured, 'h_xxxxxx'), false);

    // 평문 저장 시절의 일반 계정은 여전히 그 값으로 로그인된다.
    const legacyPlaintext = { id: 'legacy_user', hasPassword: true, passwordHash: 'plain-secret' };
    assert.equal(loaded.auth.verifyPassword(legacyPlaintext, 'plain-secret'), true);
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
    loaded.auth.markSessionUnlocked();
    loaded.auth.setCurrentUser(null);
    loaded.auth.setCurrentUser({ id: 'owner-b' });
    loaded.auth.clearSessionUnlock();

    assert.equal(loaded.harness.currentUser.id, 'owner-b');
    await loaded.auth.waitForAuthPersistence();

    assert.equal(maxActiveOperations, 1);
    assert.deepEqual(operations, [
      'set:currentUser:owner-a',
      'set:session_unlocked:true',
      'remove:currentUser',
      'remove:session_unlocked',
      'set:currentUser:owner-b',
      'remove:session_unlocked',
    ]);
    assert.equal(idb.get('currentUser').id, 'owner-b');
    assert.equal(idb.has('session_unlocked'), false);
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
    clearSessionUnlock() { events.push('clear-unlock'); },
    async waitForAuthPersistence() {
      events.push('wait-start');
      await waitGate.promise;
      events.push('wait-done');
    },
  };

  const signOutSource = sliceBetween(
    FEATURE_LOGIN_SOURCE,
    'export async function signOutToLoginScreen()',
    'const confirmLogout = signOutToLoginScreen;',
  )
    .replace('export async function signOutToLoginScreen()', 'async function signOutToLoginScreen(__data)')
    .replaceAll(AUTH_DATA_IMPORT_MARKER, 'Promise.resolve(__data)');
  const signOutToLoginScreen = new Function(
    'localStorage',
    'location',
    signOutSource + '\nreturn signOutToLoginScreen;',
  )(storage, location);

  const signOutPromise = signOutToLoginScreen(auth);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, [
    'clear-user',
    'clear-unlock',
    'wait-start',
  ]);
  assert.equal(events.includes('reload'), false);

  waitGate.resolve();
  await signOutPromise;
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
    clearSessionUnlock() { events.push('clear-unlock'); },
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
    'clear-unlock',
    'other-wait-start',
  ]);
  otherWaitGate.resolve();
  await otherPromise;
  assert.deepEqual(events.slice(-3), ['other-wait-done', 'remove-lock', 'reload']);
});

test('auth persistence wait is exported through the public data facade', () => {
  assert.match(DATA_API_SOURCE, /restoreUserFromBackup, waitForAuthPersistence,/);
});

test('the social account list hides the admin console account', () => {
  // 소셜/랭킹/길드 화면은 모두 getAccountList() 를 지난다. 필터가 여기 한 곳에
  // 있어야 화면마다 다시 거르지 않는다.
  const listSource = sliceBetween(
    DATA_ACCOUNT_SOURCE,
    'export async function getAccountList()',
    'export async function getAccountListIncludingAdminConsole()',
  );
  assert.match(listSource, /filter\(\(account\) => !isAdminConsoleAccount\(account\?\.id\)\)/);
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
    'getAccountListIncludingAdminConsole',
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
