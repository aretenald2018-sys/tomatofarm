const _mem = new Map();
const STORAGE_PREFIX = '__adminCache:';

function _now() { return Date.now(); }

function _readStorage(key) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function _writeStorage(key, entry) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch (_) { /* quota / serialization ignore */ }
}

export function getCached(key, ttlMs) {
  const mem = _mem.get(key);
  if (mem && (_now() - mem.at) < ttlMs) return mem.value;
  const store = _readStorage(key);
  if (store && (_now() - store.at) < ttlMs) {
    _mem.set(key, store);
    return store.value;
  }
  return undefined;
}

export function setCached(key, value, { persist = false } = {}) {
  const entry = { at: _now(), value };
  _mem.set(key, entry);
  if (persist) _writeStorage(key, entry);
}

export async function withCache(key, ttlMs, fn, opts = {}) {
  const hit = getCached(key, ttlMs);
  if (hit !== undefined) return hit;
  const value = await fn();
  setCached(key, value, opts);
  return value;
}

export function invalidateCache(key) {
  if (key == null) {
    _mem.clear();
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith(STORAGE_PREFIX))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch (_) { /* ignore */ }
    return;
  }
  _mem.delete(key);
  try { sessionStorage.removeItem(STORAGE_PREFIX + key); } catch (_) { /* ignore */ }
}

export const DEFAULT_TTL_MS = 60 * 1000;
