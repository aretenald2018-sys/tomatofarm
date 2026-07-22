import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { listPendingDayWrites } from '../data/pending-day-writes.js';

const DATE_KEY = '2026-07-17';
const DAY_PATH_A = `users/A/workouts/${DATE_KEY}`;

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

class FakeDataCore {
  constructor(ownerId = 'A') {
    this.ownerId = ownerId;
    this.caches = new Map();
    this.cache = {};
    if (ownerId) this.caches.set(ownerId, this.cache);
    this.documents = new Map();
    this.refCalls = [];
    this.setDocCalls = [];
    this.fbOpCalls = [];
    this.failNextSetDoc = null;
    this.nextSetDocGate = null;
    this.bindCoreCache = null;
  }

  cacheFor(ownerId) {
    return this.caches.get(ownerId) || {};
  }

  acceptCache(value) {
    this.cache = value;
    if (this.ownerId) this.caches.set(this.ownerId, value);
  }

  switchOwner(ownerId) {
    this.ownerId = ownerId;
    if (!this.caches.has(ownerId)) this.caches.set(ownerId, {});
    this.cache = this.caches.get(ownerId);
    this.bindCoreCache?.(this.cache);
  }

  doc(_db, ...segments) {
    const ref = { path: segments.join('/') };
    this.refCalls.push(ref.path);
    return ref;
  }

  async setDoc(ref, payload, options) {
    const call = { path: ref.path, payload: clone(payload), options: clone(options || {}) };
    this.setDocCalls.push(call);

    if (this.failNextSetDoc) {
      const error = this.failNextSetDoc;
      this.failNextSetDoc = null;
      throw error;
    }

    if (this.nextSetDocGate) {
      const gate = this.nextSetDocGate;
      this.nextSetDocGate = null;
      await gate.promise;
    }

    const next = options?.merge
      ? { ...(this.documents.get(ref.path) || {}), ...clone(payload) }
      : clone(payload);
    this.documents.set(ref.path, next);
  }

  async deleteDoc(ref) {
    this.documents.delete(ref.path);
  }

  fbOp(label, operation, options) {
    this.fbOpCalls.push({ label, options: clone(options || {}) });
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

function installGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  };
}

async function loadSaveDayModule(surface) {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-save-day-durability-'));
  const harnessKey = `__saveDayDurability_${process.pid}_${Date.now()}_${Math.random()}`;
  globalThis[harnessKey] = surface;

  try {
    const sourceUrl = new URL('../data/data-save.js', import.meta.url);
    const pendingUrl = new URL('../data/pending-day-writes.js', import.meta.url).href;
    const corePath = path.join(tempDir, 'data-core-stub.mjs');
    const savePath = path.join(tempDir, 'data-save-under-test.mjs');
    const source = await readFile(sourceUrl, 'utf8');
    const coreSpecifier = "'./data-core.js'";
    const pendingSpecifier = "'./pending-day-writes.js'";

    assert.ok(source.includes(coreSpecifier), 'data-save.js must import ./data-core.js');
    assert.ok(source.includes(pendingSpecifier), 'data-save.js must import ./pending-day-writes.js');

    await writeFile(corePath, `
const harness = globalThis[${JSON.stringify(harnessKey)}];
export const db = { fake: true };
export const doc = (...args) => harness.doc(...args);
export const setDoc = (...args) => harness.setDoc(...args);
export const deleteDoc = (...args) => harness.deleteDoc(...args);
export const getDataOwnerId = () => harness.ownerId;
export let _cache = harness.cache;
export function _setCache(value) {
  _cache = value;
  harness.acceptCache(value);
}
export const _fbOp = (...args) => harness.fbOp(...args);
harness.bindCoreCache = value => {
  _cache = value;
  harness.acceptCache(value);
};
`, 'utf8');

    const rewritten = source
      .replace(coreSpecifier, JSON.stringify(pathToFileURL(corePath).href))
      .replace(pendingSpecifier, JSON.stringify(pendingUrl));
    await writeFile(savePath, rewritten, 'utf8');
    const module = await import(pathToFileURL(savePath).href);

    return {
      module,
      cleanup: async () => {
        delete globalThis[harnessKey];
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    delete globalThis[harnessKey];
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function pendingEntries(storage, ownerId = 'A') {
  return listPendingDayWrites(storage, { ownerId, dateKey: DATE_KEY });
}

async function withSaveDay(run, { ownerId = 'A', storage = new MemoryStorage(), online = true } = {}) {
  const restoreStorage = installGlobal('localStorage', storage);
  const restoreNavigator = installGlobal('navigator', { onLine: online });
  const surface = new FakeDataCore(ownerId);
  let loaded;
  try {
    loaded = await loadSaveDayModule(surface);
    await run({ save: loaded.module, storage, surface });
  } finally {
    await loaded?.cleanup();
    restoreNavigator();
    restoreStorage();
  }
}

test('saveDay journals and caches diet plus workout before the first remote write', async () => {
  await withSaveDay(async ({ save, storage, surface }) => {
    const remoteGate = deferred();
    surface.nextSetDocGate = remoteGate;

    const dietSave = save.saveDay(DATE_KEY, {
      breakfast: 'tomato omelet',
      bKcal: 420,
    }, { rethrow: true });

    assert.equal(surface.fbOpCalls.length, 0);
    assert.equal(surface.setDocCalls.length, 0);
    assert.deepEqual(surface.cacheFor('A')[DATE_KEY], {
      breakfast: 'tomato omelet',
      bKcal: 420,
    });
    assert.deepEqual(pendingEntries(storage)[0].record.payload, {
      breakfast: 'tomato omelet',
      bKcal: 420,
    });

    const workoutSave = save.saveDay(DATE_KEY, {
      exercises: [{ name: 'squat', sets: [{ kg: 60, reps: 8 }] }],
      workoutPhoto: 'workout-photo',
    }, { rethrow: true });

    const combined = {
      breakfast: 'tomato omelet',
      bKcal: 420,
      exercises: [{ name: 'squat', sets: [{ kg: 60, reps: 8 }] }],
      workoutPhoto: 'workout-photo',
    };
    assert.equal(surface.fbOpCalls.length, 0);
    assert.equal(surface.setDocCalls.length, 0);
    assert.deepEqual(surface.cacheFor('A')[DATE_KEY], combined);
    assert.equal(pendingEntries(storage).length, 1);
    assert.deepEqual(pendingEntries(storage)[0].record.payload, combined);

    await Promise.resolve();
    assert.equal(surface.setDocCalls.length, 1);
    assert.deepEqual(surface.setDocCalls[0], {
      path: DAY_PATH_A,
      payload: combined,
      options: { merge: true },
    });

    remoteGate.resolve();
    await Promise.all([dietSave, workoutSave]);
    assert.deepEqual(surface.documents.get(DAY_PATH_A), combined);
    assert.equal(pendingEntries(storage).length, 0);
  });
});

test('a failed remote write stays pending and the next workout write flushes the full day', async () => {
  await withSaveDay(async ({ save, storage, surface }) => {
    surface.failNextSetDoc = new Error('fake first write failed');

    await assert.rejects(
      save.saveDay(DATE_KEY, { lunch: 'tofu salad', lKcal: 510 }, { rethrow: true }),
      error => error.message === 'fake first write failed'
        && error.pendingDayWrite === true
        && error.pendingDayStored === true,
    );
    assert.equal(surface.documents.has(DAY_PATH_A), false);
    assert.deepEqual(pendingEntries(storage)[0].record.payload, {
      lunch: 'tofu salad',
      lKcal: 510,
    });

    const result = await save.saveDay(DATE_KEY, {
      exercises: [{ name: 'deadlift', sets: [{ kg: 80, reps: 5 }] }],
      memo: 'strong session',
    }, { rethrow: true });

    assert.equal(result.state, 'synced');
    assert.deepEqual(surface.documents.get(DAY_PATH_A), {
      lunch: 'tofu salad',
      lKcal: 510,
      exercises: [{ name: 'deadlift', sets: [{ kg: 80, reps: 5 }] }],
      memo: 'strong session',
    });
    assert.equal(surface.setDocCalls.length, 2);
    assert.equal(pendingEntries(storage).length, 0);
  });
});

test('saveDay captures owner A before await and never updates owner B cache', async () => {
  await withSaveDay(async ({ save, storage, surface }) => {
    const saving = save.saveDay(DATE_KEY, { dinner: 'salmon bowl', dKcal: 630 }, { rethrow: true });
    assert.deepEqual(surface.cacheFor('A')[DATE_KEY], { dinner: 'salmon bowl', dKcal: 630 });

    surface.switchOwner('B');
    assert.deepEqual(surface.cacheFor('B'), {});
    await saving;

    assert.deepEqual(surface.refCalls, [DAY_PATH_A]);
    assert.deepEqual(surface.documents.get(DAY_PATH_A), { dinner: 'salmon bowl', dKcal: 630 });
    assert.equal([...surface.documents.keys()].some(key => key.includes('/B/') || key.includes('_orphan')), false);
    assert.deepEqual(surface.cacheFor('B'), {});
    assert.equal(pendingEntries(storage).length, 0);
  });
});

test('saveDay rejects a missing owner without creating an _orphan ref or journal entry', async () => {
  await withSaveDay(async ({ save, storage, surface }) => {
    await assert.rejects(
      save.saveDay(DATE_KEY, { breakfast: 'must not save' }, { rethrow: true }),
      error => error.code === 'DAY_OWNER_REQUIRED' && error.pendingDayWrite === true,
    );

    assert.deepEqual(surface.refCalls, []);
    assert.deepEqual(surface.setDocCalls, []);
    assert.equal([...storage.values.keys()].some(key => key.includes('_orphan')), false);
    assert.equal(storage.length, 0);
  }, { ownerId: null });
});

// Regression: Android WebView and some desktop network stacks report
// navigator.onLine === false while the connection works. Skipping the remote
// write on that hint left the day in the device journal only, so a reload that
// could not restore the journal looked like "the diet I just added is gone".
test('a false offline hint still writes the day to the server and clears the journal', async () => {
  await withSaveDay(async ({ save, storage, surface }) => {
    const dietResult = await save.saveDay(DATE_KEY, {
      snack: 'greek yogurt',
      sKcal: 190,
    }, { rethrow: true });

    assert.equal(dietResult.state, 'synced');
    assert.equal(surface.setDocCalls.length, 1);
    assert.deepEqual(surface.documents.get(DAY_PATH_A), {
      snack: 'greek yogurt',
      sKcal: 190,
    });
    assert.equal(pendingEntries(storage).length, 0);
  }, { online: false });
});

test('an unacknowledged write reports pending without stacking a duplicate write per save', async () => {
  await withSaveDay(async ({ save, storage, surface }) => {
    // A real offline Firestore write never rejects — it stays unacknowledged
    // until the backend is reachable again.
    surface.nextSetDocGate = deferred();

    const dietResult = await save.saveDay(DATE_KEY, {
      snack: 'greek yogurt',
      sKcal: 190,
    }, { rethrow: true });
    const workoutResult = await save.saveDay(DATE_KEY, {
      exercises: [{ name: 'run', durationMin: 35 }],
      runDistance: 6.2,
    }, { rethrow: true });

    assert.equal(dietResult.state, 'pending');
    assert.equal(workoutResult.state, 'pending');
    assert.equal(surface.setDocCalls.length, 1, 'an in-flight write must not be re-sent per save');
    assert.deepEqual(surface.cacheFor('A')[DATE_KEY], {
      snack: 'greek yogurt',
      sKcal: 190,
      exercises: [{ name: 'run', durationMin: 35 }],
      runDistance: 6.2,
    });
    assert.equal(pendingEntries(storage).length, 1);
  }, { online: false });
});

test('offline saves survive a reload and a fresh module restores both diet and workout', async () => {
  const storage = new MemoryStorage();
  const restoreStorage = installGlobal('localStorage', storage);
  const restoreNavigator = installGlobal('navigator', { onLine: false });
  const firstSurface = new FakeDataCore('A');
  const reloadSurface = new FakeDataCore('A');
  let firstLoad;
  let reload;

  try {
    firstLoad = await loadSaveDayModule(firstSurface);
    firstSurface.nextSetDocGate = deferred();
    const dietResult = await firstLoad.module.saveDay(DATE_KEY, {
      snack: 'greek yogurt',
      sKcal: 190,
    }, { rethrow: true });
    const workoutResult = await firstLoad.module.saveDay(DATE_KEY, {
      exercises: [{ name: 'run', durationMin: 35 }],
      runDistance: 6.2,
    }, { rethrow: true });

    assert.equal(dietResult.state, 'pending');
    assert.equal(workoutResult.state, 'pending');
    assert.deepEqual(firstSurface.cacheFor('A')[DATE_KEY], {
      snack: 'greek yogurt',
      sKcal: 190,
      exercises: [{ name: 'run', durationMin: 35 }],
      runDistance: 6.2,
    });

    reload = await loadSaveDayModule(reloadSurface);
    const restored = reload.module.restorePendingDayWritesForOwner('A', {});
    assert.deepEqual(restored[DATE_KEY], {
      snack: 'greek yogurt',
      sKcal: 190,
      exercises: [{ name: 'run', durationMin: 35 }],
      runDistance: 6.2,
    });
    assert.equal(pendingEntries(storage).length, 1);
    assert.equal(reloadSurface.setDocCalls.length, 0);
  } finally {
    await reload?.cleanup();
    await firstLoad?.cleanup();
    restoreNavigator();
    restoreStorage();
  }
});
