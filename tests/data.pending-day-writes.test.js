import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_DAY_WRITE_PREFIX,
  acknowledgePendingDayWrites,
  enqueuePendingDayWrite,
  groupPendingDayWrites,
  listPendingDayWrites,
  mergePendingDayWritesIntoCache,
  reassignPendingDayWrites,
} from '../data/pending-day-writes.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.beforeNextSet = null;
    this.nextSetError = null;
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
    if (this.beforeNextSet) {
      const callback = this.beforeNextSet;
      this.beforeNextSet = null;
      callback();
    }
    if (this.nextSetError) {
      const error = this.nextSetError;
      this.nextSetError = null;
      throw error;
    }
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

const DATE = '2026-07-17';

test('pending writes validate owner, calendar date, and plain JSON payloads', () => {
  const storage = new MemoryStorage();
  assert.throws(() => enqueuePendingDayWrite(storage, {
    ownerId: '  ', dateKey: DATE, payload: {}, writeId: 'empty-owner', now: 1,
  }), /ownerId/);
  assert.throws(() => enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: '2026-02-30', payload: {}, writeId: 'bad-date', now: 1,
  }), /dateKey/);
  assert.throws(() => enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: [], writeId: 'array-payload', now: 1,
  }), /payload/);
  assert.throws(() => enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { value: 1n }, writeId: 'bigint-payload', now: 1,
  }), /payload/);

  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: cyclic, writeId: 'cyclic-payload', now: 1,
  }), /payload/);
  assert.equal(storage.length, 0);
});

test('owner filtering is exact and does not alias canonical or guest identities', () => {
  const storage = new MemoryStorage();
  enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { memo: 'A' }, writeId: 'owner-a', now: 1,
  });
  enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: '2026-07-16', payload: { memo: 'A previous' }, writeId: 'owner-a-previous', now: 1,
  });
  enqueuePendingDayWrite(storage, {
    ownerId: 'owner-b', dateKey: DATE, payload: { memo: 'B' }, writeId: 'owner-b', now: 2,
  });
  enqueuePendingDayWrite(storage, {
    ownerId: '김_태우', dateKey: DATE, payload: { memo: 'canonical' }, writeId: 'canonical', now: 3,
  });
  enqueuePendingDayWrite(storage, {
    ownerId: '김_태우(guest)', dateKey: DATE, payload: { memo: 'guest' }, writeId: 'guest', now: 4,
  });

  assert.deepEqual(listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: DATE })
    .map((entry) => entry.record.payload.memo), ['A']);
  assert.deepEqual(listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: '2026-07-16' })
    .map((entry) => entry.record.payload.memo), ['A previous']);
  assert.deepEqual(listPendingDayWrites(storage, { ownerId: 'owner-b' })
    .map((entry) => entry.record.payload.memo), ['B']);
  const ownerAGroups = groupPendingDayWrites(listPendingDayWrites(storage, { ownerId: 'owner-a' }));
  assert.deepEqual(Object.keys(ownerAGroups), ['2026-07-16', DATE]);
  assert.equal(ownerAGroups['2026-07-16'].payload.memo, 'A previous');
  assert.equal(ownerAGroups[DATE].payload.memo, 'A');
  const canonicalEntries = listPendingDayWrites(storage, { ownerId: '김_태우' });
  const guestEntries = listPendingDayWrites(storage, { ownerId: '김_태우(guest)' });
  assert.deepEqual(canonicalEntries.map((entry) => entry.record.payload.memo), ['canonical']);
  assert.deepEqual(guestEntries.map((entry) => entry.record.payload.memo), ['guest']);
  assert.throws(() => groupPendingDayWrites([...canonicalEntries, ...guestEntries]), /one ownerId/);
});

test('pending writes move to the selected physical owner without leaving alias copies', () => {
  const storage = new MemoryStorage();
  enqueuePendingDayWrite(storage, {
    ownerId: '김_태우',
    dateKey: DATE,
    payload: { running: false, runDistance: 0 },
    writeId: 'admin-day',
    now: 3,
  });
  enqueuePendingDayWrite(storage, {
    ownerId: '김_태우',
    dateKey: '2026-07-16',
    payload: { exercises: [] },
    writeId: 'admin-previous',
    now: 4,
  });

  const result = reassignPendingDayWrites(storage, {
    fromOwnerId: '김_태우',
    toOwnerId: '김_태우(guest)',
  });

  assert.equal(result.moved, 2);
  assert.deepEqual(listPendingDayWrites(storage, { ownerId: '김_태우' }), []);
  const guestEntries = listPendingDayWrites(storage, { ownerId: '김_태우(guest)' });
  assert.equal(guestEntries.length, 2);
  assert.ok(guestEntries.every(entry => entry.record.ownerId === '김_태우(guest)'));
  assert.equal(reassignPendingDayWrites(storage, {
    fromOwnerId: '김_태우',
    toOwnerId: '김_태우(guest)',
  }).moved, 0);
});

test('owner reassignment preserves the source when a destination write conflicts', () => {
  const storage = new MemoryStorage();
  enqueuePendingDayWrite(storage, {
    ownerId: '김_태우',
    dateKey: DATE,
    payload: { memo: 'source' },
    writeId: 'same-write',
    now: 5,
  });
  enqueuePendingDayWrite(storage, {
    ownerId: '김_태우(guest)',
    dateKey: DATE,
    payload: { memo: 'different destination' },
    writeId: 'same-write',
    now: 5,
  });

  assert.throws(() => reassignPendingDayWrites(storage, {
    fromOwnerId: '김_태우',
    toOwnerId: '김_태우(guest)',
  }), /conflicts/);
  assert.equal(listPendingDayWrites(storage, { ownerId: '김_태우' }).length, 1);
  assert.equal(listPendingDayWrites(storage, { ownerId: '김_태우(guest)' }).length, 1);
});

test('a later workout patch accumulates an earlier diet patch before compacting it', () => {
  const storage = new MemoryStorage();
  const dietEntry = enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a',
    dateKey: DATE,
    payload: { lFoods: [{ name: '비빔밥' }] },
    writeId: 'diet',
    now: 10,
  });
  const workoutEntry = enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a',
    dateKey: DATE,
    payload: { exercises: [{ id: 'squat' }] },
    writeId: 'workout',
    now: 20,
  });

  assert.equal(storage.getItem(dietEntry.key), null);
  assert.equal(storage.getItem(workoutEntry.key), workoutEntry.raw);
  const entries = listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: DATE });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].record.payload, {
    lFoods: [{ name: '비빔밥' }],
    exercises: [{ id: 'squat' }],
  });
});

test('pending entries reload and overlay a remote cache without mutating it', () => {
  const storage = new MemoryStorage();
  enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a',
    dateKey: DATE,
    payload: { memo: 'local memo', exercises: [{ id: 'bench' }] },
    writeId: 'reload',
    now: 30,
  });

  const reloadedEntries = listPendingDayWrites(storage, { ownerId: 'owner-a' });
  const remoteCache = {
    [DATE]: { memo: 'remote memo', lFoods: [{ name: '샐러드' }] },
    '2026-07-16': { memo: 'untouched' },
  };
  const merged = mergePendingDayWritesIntoCache(remoteCache, reloadedEntries);

  assert.notEqual(merged, remoteCache);
  assert.deepEqual(merged[DATE], {
    memo: 'local memo',
    lFoods: [{ name: '샐러드' }],
    exercises: [{ id: 'bench' }],
  });
  assert.deepEqual(remoteCache[DATE], {
    memo: 'remote memo',
    lFoods: [{ name: '샐러드' }],
  });
  assert.equal(merged['2026-07-16'], remoteCache['2026-07-16']);
});

test('acknowledgement preserves a changed raw value and entries outside its snapshot', () => {
  const storage = new MemoryStorage();
  enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { memo: 'old' }, writeId: 'old', now: 1,
  });
  const [staleSnapshot] = listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: DATE });

  const replacementRaw = JSON.stringify({
    ...staleSnapshot.record,
    payload: { memo: 'replacement' },
  });
  storage.setItem(staleSnapshot.key, replacementRaw);

  const separateStorage = new MemoryStorage();
  const newEntry = enqueuePendingDayWrite(separateStorage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { exercises: [] }, writeId: 'new', now: 2,
  });
  storage.setItem(newEntry.key, newEntry.raw);

  assert.equal(acknowledgePendingDayWrites(storage, [staleSnapshot]), 0);
  assert.equal(storage.getItem(staleSnapshot.key), replacementRaw);
  assert.equal(storage.getItem(newEntry.key), newEntry.raw);
});

test('cross-writer immutable entries both survive and merge by date', () => {
  const storage = new MemoryStorage();
  let secondWriterEntry;
  storage.beforeNextSet = () => {
    secondWriterEntry = enqueuePendingDayWrite(storage, {
      ownerId: 'owner-a',
      dateKey: DATE,
      payload: { exercises: [{ id: 'deadlift' }] },
      writeId: 'writer-b',
      now: 200,
    });
  };

  const firstWriterEntry = enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a',
    dateKey: DATE,
    payload: { dFoods: [{ name: '닭가슴살' }] },
    writeId: 'writer-a',
    now: 100,
  });

  assert.equal(storage.getItem(firstWriterEntry.key), firstWriterEntry.raw);
  assert.equal(storage.getItem(secondWriterEntry.key), secondWriterEntry.raw);
  const entries = listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: DATE });
  assert.equal(entries.length, 2);
  const groups = groupPendingDayWrites(entries);
  assert.deepEqual(groups[DATE].entries.map((entry) => entry.record.writeId), ['writer-a', 'writer-b']);
  assert.deepEqual(groups[DATE].payload, {
    dFoods: [{ name: '닭가슴살' }],
    exercises: [{ id: 'deadlift' }],
  });
});

test('listing ignores corrupted JSON, schema mismatches, and record/key mismatches', () => {
  const storage = new MemoryStorage();
  const validEntry = enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { memo: 'valid' }, writeId: 'valid', now: 1,
  });
  storage.setItem(`${PENDING_DAY_WRITE_PREFIX}broken-json`, '{');
  storage.setItem(`${PENDING_DAY_WRITE_PREFIX}wrong-schema`, JSON.stringify({
    ownerId: 'owner-a', dateKey: DATE, payload: {}, writeId: 'wrong-schema', createdAt: 2,
  }));
  storage.setItem(`${PENDING_DAY_WRITE_PREFIX}wrong-key`, validEntry.raw);
  storage.setItem('unrelated-key', validEntry.raw);

  const entries = listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: DATE });
  assert.deepEqual(entries.map((entry) => entry.key), [validEntry.key]);
});

test('setItem quota failure throws while preserving every previous entry', () => {
  const storage = new MemoryStorage();
  const existingEntry = enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { memo: 'safe' }, writeId: 'existing', now: 1,
  });
  const quotaError = new Error('quota exceeded');
  storage.nextSetError = quotaError;

  assert.throws(() => enqueuePendingDayWrite(storage, {
    ownerId: 'owner-a', dateKey: DATE, payload: { exercises: [] }, writeId: 'failed', now: 2,
  }), (error) => error === quotaError);
  assert.equal(storage.getItem(existingEntry.key), existingEntry.raw);
  assert.deepEqual(listPendingDayWrites(storage, { ownerId: 'owner-a', dateKey: DATE })
    .map((entry) => entry.record.writeId), ['existing']);
});
