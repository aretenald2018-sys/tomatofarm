import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Normalize line endings: the source slices below anchor on "\n}\n\n" boundaries,
// which never match on a Windows (CRLF) checkout even though the code is correct.
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

const dataLoadSource = read('data/data-load.js');
const dataApiSource = read('data/data-api.js');
const dataCoreSource = read('data/data-core.js');
const sharedOwnerSource = read('data/shared-account-owner.js');
const workoutEquipmentSource = read('data/data-workout-equipment.js');
const equipmentPoolSource = read('data/data-equipment-pool.js');
const appSource = read('app.js');
const runtimeAssetsSource = read('runtime-assets.js');
const serviceWorkerSource = read('sw.js');

function sliceBetween(source, startToken, endToken, label) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, label + ' start boundary should exist');
  const end = source.indexOf(endToken, start + startToken.length);
  assert.notEqual(end, -1, label + ' end boundary should exist');
  return source.slice(start, end);
}

function sliceFrom(source, startToken, label) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, label + ' start boundary should exist');
  return source.slice(start);
}

function assertOrdered(source, tokens, label) {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, label + ': missing or out-of-order token: ' + token);
    cursor = next;
  }
}

test('loadAll resolves the physical owner before seeding pending data and capturing refs', () => {
  const loadAll = sliceFrom(dataLoadSource, 'export async function loadAll()', 'loadAll');

  assert.match(loadAll,
    /const ownerCollection = \(name\) => collection\(db, 'users', ownerId, name\);/);
  assert.match(loadAll,
    /const ownerDoc = \(name, id\) => doc\(db, 'users', ownerId, name, id\);/);

  assertOrdered(loadAll, [
    'await resolvePrivateDataOwnerId(getCurrentUserRef().id);',
    'const ownerId = getDataOwnerId();',
    'const pendingSeed = restorePendingDayWritesForOwner(ownerId, {});',
    '_setCache(pendingSeed);',
    'const [snap, exSnap, goalSnap, questSnap,',
  ], 'owner decision before private reads');

  for (const collectionName of [
    'workouts', 'exercises', 'goals', 'quests', 'cooking',
    'body_checkins', 'nutrition_db', 'tomato_cycles', 'settings',
  ]) {
    assert.ok(loadAll.includes("getDocs(ownerCollection('" + collectionName + "'))"),
      collectionName + ' should use the collection factory captured for the starting owner');
  }
});

// Regression: an unresolved or failed owner decision used to reset the day
// cache to {}, which hid days that only existed in this device's recovery
// journal. The user saw a just-entered meal vanish on the next reload.
test('a failed owner decision keeps this device unsynced days instead of clearing them', () => {
  const loadAll = sliceFrom(dataLoadSource, 'export async function loadAll()', 'loadAll');
  assert.doesNotMatch(loadAll, /_setCache\(\{\}\);/,
    'loadAll must not reset the day cache without restoring the device journal');
  assert.equal((loadAll.match(/_setCache\(_deviceJournalCacheForCurrentUser\(\)\);/g) || []).length, 2,
    'both owner-failure exits should restore the device journal');

  const recovery = sliceBetween(
    dataLoadSource,
    'function _deviceJournalCacheForCurrentUser()',
    'function _notifyWorkoutCacheChanged',
    '_deviceJournalCacheForCurrentUser',
  );
  assertOrdered(recovery, [
    'const currentUser = getCurrentUserRef();',
    'if (!currentUser) return {};',
    'getDataOwnerId()',
    'isPersonalSharedAccount(currentUser.id) ? getCachedSharedAccountDataOwnerId() : null',
    'if (!ownerId) return {};',
    'return restorePendingDayWritesForOwner(ownerId, {});',
  ], 'signed-out sessions restore nothing and shared accounts fall back to the verified device owner');
});

test('loadAll discards stale-owner results and overlays remote data with pending writes', () => {
  const loadAll = sliceFrom(dataLoadSource, 'export async function loadAll()', 'loadAll');

  assert.match(loadAll,
    /const loadGeneration = \+\+_loadAllGeneration;[\s\S]*const isCurrentLoad = \(\) => \([\s\S]*_loadAllGeneration === loadGeneration[\s\S]*getDataOwnerId\(\) === ownerId/);
  assert.match(loadAll,
    /const abandonIfStale = \(\) => \{[\s\S]*if \(isCurrentLoad\(\)\) return false;[\s\S]*if \(_loadAllGeneration === loadGeneration\)[\s\S]*restorePendingDayWritesForOwner\(currentOwnerId, \{\}\)/);
  assert.ok((loadAll.match(/if \(abandonIfStale\(\)\) return;/g) || []).length >= 7,
    'loadAll should guard cache and global-state writes after every async stage');
  assertOrdered(loadAll, [
    'await Promise.all([',
    'if (abandonIfStale()) return;',
    'const remoteCache = {};',
  ], 'stale owner result discard');
  assert.match(loadAll, /catch\(e\) \{\s*if \(abandonIfStale\(\)\) return;/,
    'a stale failed load must not reset the newly selected account to defaults');

  assertOrdered(loadAll, [
    'const remoteCache = {};',
    'const remoteWithSeed = { ...remoteCache };',
    'Object.entries(pendingSeed).forEach(([dateKey, pendingDay]) => {',
    'remoteWithSeed[dateKey] = { ...(remoteWithSeed[dateKey] || {}), ...pendingDay };',
    '_setCache(restorePendingDayWritesForOwner(ownerId, remoteWithSeed));',
  ], 'remote then pending overlay');
});

test('late account-scoped equipment loads cannot populate a newly selected account', () => {
  const loadAll = sliceFrom(dataLoadSource, 'export async function loadAll()', 'loadAll');
  assert.match(loadAll,
    /Promise\.all\(\[loadGyms\(ownerId\), loadRoutineTemplates\(ownerId\), loadEquipmentPool\(ownerId\)\]\)/);

  for (const [source, loader, collectionName] of [
    [workoutEquipmentSource, 'loadGyms', 'gyms'],
    [workoutEquipmentSource, 'loadRoutineTemplates', 'routine_templates'],
    [equipmentPoolSource, 'loadEquipmentPool', 'equipment_pool'],
  ]) {
    const body = sliceFrom(source, 'export async function ' + loader, loader);
    assert.ok(body.startsWith('export async function ' + loader + '(ownerId = getDataOwnerId())'));
    assert.ok(body.includes("collection(db, 'users', ownerId, '" + collectionName + "')"));
    assert.ok(body.includes('if (getDataOwnerId() !== ownerId) return;'));
  }
});

test('workout realtime subscription stays owner-scoped and emits changed-date events', () => {
  const realtime = sliceBetween(
    dataLoadSource,
    'export function startWorkoutRealtimeSync',
    '// Shared account owner resolution and legacy root migration',
    'startWorkoutRealtimeSync',
  );
  const notify = sliceBetween(
    dataLoadSource,
    'function _notifyWorkoutCacheChanged',
    'export function stopWorkoutRealtimeSync',
    '_notifyWorkoutCacheChanged',
  );

  assert.match(realtime,
    /const ownerWorkouts = collection\(db, 'users', ownerId, 'workouts'\);/);
  assertOrdered(realtime, [
    'onSnapshot(ownerWorkouts, (snapshot) => {',
    'if (getDataOwnerId() !== ownerId) {',
    'const remoteCache = {};',
    'const nextCache = restorePendingDayWritesForOwner(ownerId, remoteCache);',
    'if (getDataOwnerId() !== ownerId) return;',
    'const changedDateKeys = _changedWorkoutDateKeys(_cache, nextCache);',
    '_setCache(nextCache);',
    "_notifyWorkoutCacheChanged(ownerId, changedDateKeys, 'firestore');",
  ], 'owner-scoped realtime cache update');
  assert.match(notify,
    /new CustomEvent\('data:workouts-updated', \{\s*detail: \{ ownerId, changedDateKeys, source \},\s*\}\)/);
});

test('a queued callback from an unsubscribed realtime listener cannot stop a newer owner listener', () => {
  const realtime = sliceBetween(
    dataLoadSource,
    'export function startWorkoutRealtimeSync',
    '// Shared account owner resolution and legacy root migration',
    'startWorkoutRealtimeSync',
  );

  assert.match(dataLoadSource, /let _workoutRealtimeGeneration = 0;/);
  assert.match(dataLoadSource,
    /export function stopWorkoutRealtimeSync\(\) \{\s*_workoutRealtimeGeneration \+= 1;/);
  assertOrdered(realtime, [
    'const realtimeGeneration = ++_workoutRealtimeGeneration;',
    'onSnapshot(ownerWorkouts, (snapshot) => {',
    'if (_workoutRealtimeGeneration !== realtimeGeneration) return;',
    'if (getDataOwnerId() !== ownerId) {',
    'stopWorkoutRealtimeSync();',
  ], 'stale realtime callback fence');
});

test('ensureWorkoutDayCached uses its captured owner and rejects stale async results', () => {
  const ensureDay = sliceBetween(
    dataApiSource,
    'export async function ensureWorkoutDayCached',
    '// 가장 최근 body_checkin',
    'ensureWorkoutDayCached',
  );

  assertOrdered(ensureDay, [
    'const ownerId = getDataOwnerId();',
    'const startingCache = _cache;',
    'const existing = startingCache[key];',
    'const pendingSeed = restorePendingDayWritesForOwner(ownerId, {})[key] || {};',
    "const workoutRef = doc(db, 'users', ownerId, 'workouts', key);",
    'const snap = await getDoc(workoutRef);',
    'if (getDataOwnerId() !== ownerId) return {};',
    'if (_cache !== startingCache || _cache[key] !== existing) return _cache[key] || {};',
    'const remoteDay = snap.exists() ? (snap.data() || {}) : {};',
    'const remoteWithSeed = { [key]: { ...remoteDay, ...pendingSeed } };',
    'const latest = restorePendingDayWritesForOwner(ownerId, remoteWithSeed);',
    '_cache[key] = latest[key] || {};',
  ], 'captured-owner day hydration');
});

test('workout data updates rerender the active app tab', () => {
  const handler = sliceBetween(
    appSource,
    "document.addEventListener('data:workouts-updated'",
    "document.addEventListener('sheet:saved', () => scheduleSeasonDashboardWidgetSync",
    'data:workouts-updated handler',
  );

  assert.match(handler, /_workoutDataRefreshTimer = setTimeout\(\(\) => \{/);
  const expectedBranches = [
    ['home', 'renderHome();'],
    ['diet', 'loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());'],
    ['workout', "void _renderWorkoutRoute(getWorkoutNavSnapshot(), 'data:workouts-updated');"],
    ['calendar', 'void _lazyRenderCalendar();'],
    ['stats', 'void _lazyRenderStats();'],
  ];
  for (const [tab, action] of expectedBranches) {
    const branchStart = handler.indexOf("if (_currentTab === '" + tab + "')");
    const actionIndex = handler.indexOf(action, branchStart);
    const nextBranch = handler.indexOf('if (_currentTab ===', branchStart + 1);
    assert.ok(branchStart >= 0 && actionIndex > branchStart
      && (nextBranch === -1 || actionIndex < nextBranch),
    tab + ' should rerender through its own active-tab branch');
  }
});

test('pending journal is precached under a versioned service worker cache', () => {
  const runtimeAssetList = sliceBetween(
    runtimeAssetsSource,
    'root.TOMATO_STATIC_ASSETS = Object.freeze([',
    ']);',
    'runtime asset list',
  );

  assert.match(runtimeAssetList, /'\.\/data\/pending-day-writes\.js'/);
  assert.match(runtimeAssetList, /'\.\/data\/shared-account-owner\.js'/);
  assert.match(serviceWorkerSource,
    /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});

test('shared admin data uses a durable one-owner registry and never field-merges aliases', () => {
  assert.match(sharedOwnerSource,
    /SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION[\s\S]*SHARED_ACCOUNT_OWNER_REGISTRY_ID/);
  assert.match(sharedOwnerSource,
    /readSharedAccountDataOwnerRegistry\(registrySnapshot\.data\(\)\)/);
  assert.match(sharedOwnerSource, /SHARED_DATA_OWNER_NOT_INITIALIZED/);
  assert.doesNotMatch(sharedOwnerSource,
    /getDocsFromServer|runTransaction|transaction\.set|selectSharedAccountDataOwner/);
  assert.doesNotMatch(dataLoadSource,
    /unifySharedAccountData|buildMissingWorkoutFieldPatch|_mergeWorkoutTwinCache|_backfillSharedAccountWorkoutFields/);
  assert.match(dataCoreSource,
    /if \(_currentUser && isPersonalSharedAccount\(_currentUser\.id\)\)[\s\S]*SHARED_DATA_OWNER_UNRESOLVED/);

  const adopter = sliceBetween(
    sharedOwnerSource,
    'function _adoptSharedAccountDataOwner(ownerId)',
    '\n}\n\nasync function _resolveSharedAccountDataOwner',
    'shared owner adopter',
  );
  assertOrdered(adopter, [
    'reassignPendingDayWritesToOwner(selectedOwnerId',
    'return setSharedAccountDataOwnerId(selectedOwnerId);',
  ], 'pending journal reassignment before session owner commit');

  const setter = sliceBetween(
    dataCoreSource,
    'export function setSharedAccountDataOwnerId(ownerId)',
    '\n}\n\nexport function resolveDataOwnerId',
    'shared owner setter',
  );
  assertOrdered(setter, [
    'localStorage.setItem(SHARED_ACCOUNT_OWNER_CACHE_KEY, normalized);',
    '_sharedAccountDataOwnerId = normalized;',
    '_cachedSharedAccountDataOwnerId = normalized;',
  ], 'durable owner cache before in-memory owner commit');
});

test('a new session validates the remote registry before accepting an offline owner cache', () => {
  assert.match(dataCoreSource, /getDoc, getDocFromServer,/);
  assert.match(dataCoreSource, /let _cachedSharedAccountDataOwnerId = normalizeSharedAccountDataOwnerId/);
  assert.match(dataCoreSource, /let _sharedAccountDataOwnerId = null;/);

  assertOrdered(sharedOwnerSource, [
    'registrySnapshot = await _readOwnerRegistrySnapshot(registryRef);',
    '} catch (error) {',
    'const cachedOwnerId = getCachedSharedAccountDataOwnerId();',
    'if (cachedOwnerId && _isRemoteRegistryUnavailable(error)) {',
    'return _adoptSharedAccountDataOwner(cachedOwnerId);',
  ], 'remote registry before offline cache');

  // A hung registry read must not freeze bootstrap with an empty cache; it is
  // classified exactly like any other network failure.
  assertOrdered(sharedOwnerSource, [
    'async function _readOwnerRegistrySnapshot(registryRef)',
    'getDocFromServer(registryRef)',
    "error.code = 'deadline-exceeded';",
  ], 'bounded registry read before offline cache');

  const resolver = sliceFrom(
    sharedOwnerSource,
    'export async function resolvePrivateDataOwnerId(ownerId)',
    'resolvePrivateDataOwnerId',
  );
  assert.match(resolver, /const selectedOwnerId = await ensureSharedAccountDataOwner\(\);/);
  assert.doesNotMatch(resolver, /resolveDataOwnerId\(ownerId\) \|\|/);
});

test('legacy root data migrates copy-only to the selected owner before shared private reads', () => {
  const copier = sliceBetween(
    dataLoadSource,
    'async function _copyMissingDocuments',
    '// Public legacy-root migration API.',
    '_copyMissingDocuments',
  );
  const migrate = sliceBetween(
    dataLoadSource,
    'export async function migrateDataToUser',
    'export async function loadAll()',
    'migrateDataToUser',
  );
  const loadAll = sliceFrom(dataLoadSource, 'export async function loadAll()', 'loadAll');

  assert.match(migrate, /const targetUserId = await resolvePrivateDataOwnerId\(userId\);/);
  assert.match(migrate, /LEGACY_ROOT_MIGRATION_COLLECTION[\s\S]*LEGACY_ROOT_MIGRATION_ID/);
  assert.match(migrate, /const markerSnapshot = await getDocFromServer\(markerRef\);/);
  assert.match(migrate, /copied \+= await _copyMissingDocuments\(\{ targetUserId, collectionName \}\);/);
  assertOrdered(copier, [
    'const didCopy = await runTransaction(db, async (transaction) => {',
    'const current = await transaction.get(targetRef);',
    'if (current.exists()) return false;',
    'transaction.set(targetRef, documentData.data);',
  ], 'copy-only transaction must not overwrite selected-owner documents');
  assertOrdered(migrate, [
    'for (const collectionName of ACCOUNT_DATA_COLLECTIONS)',
    'await _copyMissingDocuments({ targetUserId, collectionName })',
    'await runTransaction(db, async (transaction) => {',
    'transaction.set(markerRef, {',
  ], 'copy all root data before completion marker');
  assert.doesNotMatch(migrate, /PERSONAL_LEGACY_ALIAS_ID|guestUserId|guestDocuments/);
  assert.match(dataLoadSource,
    /getDocsFromServer\(collection\(db, 'users', targetUserId, collectionName\)\)[\s\S]*getDocsFromServer\(collection\(db, collectionName\)\)/);
  assertOrdered(loadAll, [
    'await resolvePrivateDataOwnerId(getCurrentUserRef().id);',
    'if (isPersonalSharedAccount(getCurrentUserRef()?.id)) {',
    'await migrateDataToUser(getCurrentUserRef().id);',
    'const [snap, exSnap, goalSnap, questSnap,',
  ], 'shared root migration before selected-owner load');
});

test('shared owner timeout keeps the app fail-closed behind an explicit retry action', () => {
  assert.match(appSource,
    /if \(isPersonalInstance\(user\.id\) && !getDataOwnerId\(\)\) \{\s*_showSharedOwnerRetryState\(\);\s*return false;/);
  assert.match(appSource, /id="shared-owner-retry-btn"/);
  assert.match(appSource, /확인되기 전에는 기록을 저장하지 않습니다/);
  assert.match(appSource, /retryButton\?\.addEventListener\('click',[\s\S]*Promise\.resolve\(\)\.then\(\(\) => init\(\)\)/);
  assert.match(appSource, /retryButton\?\.addEventListener\('click',[\s\S]*\}, \{ once: true \}\);/);
  assert.match(appSource,
    /if \(_appInitPromise\) \{[\s\S]*if \(_appInitUserId === requestedUserId\) return _appInitPromise;/);
  assert.match(appSource,
    /finally \{\s*if \(!_sharedOwnerBootBlocked\) \{\s*_hideLoadingOverlay\(\);\s*window\.__tomatoAppReady = true;/);
});
