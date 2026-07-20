export const PENDING_DAY_WRITE_PREFIX = 'tomatofarm:pending-day-write:v1:';

const PENDING_DAY_WRITE_VERSION = 1;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RECORD_FIELDS = Object.freeze([
  'createdAt',
  'dateKey',
  'ownerId',
  'payload',
  'version',
  'writeId',
]);

let fallbackWriteSequence = 0;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isOwnerId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isJsonValue(value, ancestors = new WeakSet()) {
  if (value === null) return true;

  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (type !== 'object' || ancestors.has(value)) return false;

  ancestors.add(value);
  let valid = true;

  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    valid = keys.length === value.length
      && keys.every((key, index) => key === String(index))
      && value.every((item) => isJsonValue(item, ancestors));
  } else if (isPlainObject(value)) {
    valid = Object.getOwnPropertySymbols(value).length === 0
      && Object.keys(value).every((key) => isJsonValue(value[key], ancestors));
  } else {
    valid = false;
  }

  ancestors.delete(value);
  return valid;
}

function assertOwnerId(ownerId) {
  if (!isOwnerId(ownerId)) {
    throw new TypeError('ownerId must be a non-empty string');
  }
  return ownerId;
}

function assertDateKey(dateKey) {
  if (!isDateKey(dateKey)) {
    throw new TypeError('dateKey must be a valid YYYY-MM-DD date');
  }
  return dateKey;
}

function clonePayload(payload) {
  let valid = false;
  try {
    valid = isPlainObject(payload) && isJsonValue(payload);
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new TypeError('payload must be a plain JSON-serializable object');
  }

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    throw new TypeError('payload must be a plain JSON-serializable object');
  }
}

function assertStorage(storage, methods) {
  if (!storage || typeof storage !== 'object') {
    throw new TypeError('storage must be a Storage-compatible object');
  }
  for (const method of methods) {
    if (typeof storage[method] !== 'function') {
      throw new TypeError(`storage.${method} must be a function`);
    }
  }
}

function resolveCreatedAt(now) {
  let value = now === undefined ? Date.now() : now;
  if (typeof value === 'function') value = value();
  if (value instanceof Date) value = value.getTime();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('now must resolve to a non-negative integer timestamp');
  }
  return value;
}

function createWriteId(createdAt) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid) return uuid;

  fallbackWriteSequence = (fallbackWriteSequence + 1) % Number.MAX_SAFE_INTEGER;
  const randomPart = Math.random().toString(36).slice(2);
  return `${createdAt.toString(36)}-${fallbackWriteSequence.toString(36)}-${randomPart}`;
}

function assertWriteId(writeId, createdAt) {
  const value = writeId === undefined ? createWriteId(createdAt) : writeId;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('writeId must be a non-empty string');
  }
  return value;
}

function keyForRecord(record) {
  try {
    return `${PENDING_DAY_WRITE_PREFIX}${encodeURIComponent(record.ownerId)}:${record.dateKey}:${encodeURIComponent(record.writeId)}`;
  } catch {
    throw new TypeError('ownerId and writeId must be valid Unicode strings');
  }
}

function hasExactRecordFields(record) {
  const fields = Object.keys(record).sort();
  return fields.length === RECORD_FIELDS.length
    && fields.every((field, index) => field === RECORD_FIELDS[index]);
}

function isPendingRecord(record) {
  if (!isPlainObject(record) || !hasExactRecordFields(record)) return false;
  if (record.version !== PENDING_DAY_WRITE_VERSION) return false;
  if (!isOwnerId(record.ownerId) || !isDateKey(record.dateKey)) return false;
  if (typeof record.writeId !== 'string' || record.writeId.trim().length === 0) return false;
  if (!Number.isSafeInteger(record.createdAt) || record.createdAt < 0) return false;
  try {
    return isPlainObject(record.payload) && isJsonValue(record.payload);
  } catch {
    return false;
  }
}

function compareStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareEntries(left, right) {
  return compareStrings(left.record.dateKey, right.record.dateKey)
    || (left.record.createdAt - right.record.createdAt)
    || compareStrings(left.record.writeId, right.record.writeId)
    || compareStrings(left.key, right.key);
}

function isEntrySnapshot(entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.key !== 'string') return false;
  if (typeof entry.raw !== 'string' || !isPendingRecord(entry.record)) return false;
  try {
    return entry.key === keyForRecord(entry.record);
  } catch {
    return false;
  }
}

function sortedValidEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(isEntrySnapshot).sort(compareEntries);
}

function mergeEntryPayloads(entries) {
  let payload = {};
  for (const entry of sortedValidEntries(entries)) {
    payload = { ...payload, ...entry.record.payload };
  }
  return payload;
}

/**
 * Lists immutable pending write snapshots for exactly one caller-supplied owner.
 * This module deliberately does not canonicalize or alias account identities.
 */
export function listPendingDayWrites(storage, { ownerId, dateKey } = {}) {
  assertStorage(storage, ['key', 'getItem']);
  const exactOwnerId = assertOwnerId(ownerId);
  if (dateKey !== undefined) assertDateKey(dateKey);

  const keys = [];
  const seenKeys = new Set();
  const length = Number(storage.length);
  if (!Number.isInteger(length) || length < 0) {
    throw new TypeError('storage.length must be a non-negative integer');
  }

  for (let index = 0; index < length; index += 1) {
    const key = storage.key(index);
    if (typeof key !== 'string' || !key.startsWith(PENDING_DAY_WRITE_PREFIX) || seenKeys.has(key)) continue;
    seenKeys.add(key);
    keys.push(key);
  }

  const entries = [];
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (typeof raw !== 'string') continue;

    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      continue;
    }

    if (!isPendingRecord(record)) continue;
    if (record.ownerId !== exactOwnerId || (dateKey !== undefined && record.dateKey !== dateKey)) continue;
    try {
      if (key !== keyForRecord(record)) continue;
    } catch {
      continue;
    }
    entries.push({ key, raw, record });
  }

  return entries.sort(compareEntries);
}

/**
 * Rekeys immutable pending entries to a newly selected physical owner. Every
 * destination value is written before the matching source snapshot is removed,
 * so an interrupted migration can be retried without losing a local workout.
 */
export function reassignPendingDayWrites(storage, { fromOwnerId, toOwnerId } = {}) {
  assertStorage(storage, ['key', 'getItem', 'setItem', 'removeItem']);
  const sourceOwnerId = assertOwnerId(fromOwnerId);
  const targetOwnerId = assertOwnerId(toOwnerId);
  if (sourceOwnerId === targetOwnerId) return { moved: 0, entries: [] };

  const sourceEntries = listPendingDayWrites(storage, { ownerId: sourceOwnerId });
  const targetEntries = [];
  for (const sourceEntry of sourceEntries) {
    const record = { ...sourceEntry.record, ownerId: targetOwnerId };
    const key = keyForRecord(record);
    const raw = JSON.stringify(record);
    const existing = storage.getItem(key);
    if (existing !== null && existing !== raw) {
      throw new Error(`pending day writeId conflicts at selected owner: ${record.writeId}`);
    }
    if (existing === null) storage.setItem(key, raw);
    targetEntries.push({ key, raw, record });
  }

  const removed = acknowledgePendingDayWrites(storage, sourceEntries);
  if (removed !== sourceEntries.length) {
    throw new Error('pending day owner reassignment could not acknowledge every source entry');
  }
  return { moved: sourceEntries.length, entries: targetEntries };
}

/**
 * Persists a new immutable entry before removing any included snapshots.
 * A failed setItem therefore leaves every previous entry untouched.
 */
export function enqueuePendingDayWrite(storage, {
  ownerId,
  dateKey,
  payload,
  writeId,
  now,
} = {}) {
  assertStorage(storage, ['key', 'getItem', 'setItem', 'removeItem']);
  const exactOwnerId = assertOwnerId(ownerId);
  const exactDateKey = assertDateKey(dateKey);
  const patch = clonePayload(payload);
  const previousEntries = listPendingDayWrites(storage, {
    ownerId: exactOwnerId,
    dateKey: exactDateKey,
  });
  const createdAt = resolveCreatedAt(now);
  const exactWriteId = assertWriteId(writeId, createdAt);
  const accumulatedPayload = {
    ...mergeEntryPayloads(previousEntries),
    ...patch,
  };
  const record = {
    version: PENDING_DAY_WRITE_VERSION,
    ownerId: exactOwnerId,
    dateKey: exactDateKey,
    writeId: exactWriteId,
    createdAt,
    payload: accumulatedPayload,
  };
  const key = keyForRecord(record);

  if (storage.getItem(key) !== null) {
    throw new Error(`pending day writeId already exists: ${exactWriteId}`);
  }

  const raw = JSON.stringify(record);
  storage.setItem(key, raw);
  const entry = { key, raw, record };

  acknowledgePendingDayWrites(storage, previousEntries);
  return entry;
}

/**
 * Groups one owner's snapshots by date and produces each date's ordered overlay.
 */
export function groupPendingDayWrites(entries = []) {
  const sorted = sortedValidEntries(entries);
  const ownerIds = new Set(sorted.map((entry) => entry.record.ownerId));
  if (ownerIds.size > 1) {
    throw new TypeError('pending entries must belong to exactly one ownerId');
  }

  const groups = {};
  for (const entry of sorted) {
    const { dateKey } = entry.record;
    const current = groups[dateKey] || { entries: [], payload: {} };
    current.entries.push(entry);
    current.payload = { ...current.payload, ...entry.record.payload };
    groups[dateKey] = current;
  }
  return groups;
}

/**
 * Returns a new cache with pending payloads overlaid on their remote day bases.
 */
export function mergePendingDayWritesIntoCache(baseCache, entries = []) {
  const sourceCache = isPlainObject(baseCache) ? baseCache : {};
  const mergedCache = { ...sourceCache };
  const groups = groupPendingDayWrites(entries);

  for (const dateKey of Object.keys(groups).sort()) {
    const remoteDay = isPlainObject(sourceCache[dateKey]) ? sourceCache[dateKey] : {};
    mergedCache[dateKey] = {
      ...remoteDay,
      ...groups[dateKey].payload,
    };
  }

  return mergedCache;
}

/**
 * Removes only entries whose current raw value still matches the listed snapshot.
 */
export function acknowledgePendingDayWrites(storage, entries = []) {
  assertStorage(storage, ['getItem', 'removeItem']);
  let removed = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string' || typeof entry.raw !== 'string') continue;
    if (storage.getItem(entry.key) !== entry.raw) continue;
    storage.removeItem(entry.key);
    removed += 1;
  }

  return removed;
}
