// ================================================================
// data/data-save.js — workouts 컬렉션 일별 저장 (운동+식단 통합)
// ================================================================
// setDoc merge / 제한적 replace 두 모드 지원.
//  - merge (기본): 호출자가 전달한 필드만 저장해 반대 도메인 필드를 보존.
//  - replace: allowReplace:true 를 명시한 내부 유지보수 경로에서만 허용.
//  - workout/save.js 가 운동/식단 payload 를 분할 저장해 한쪽이 다른쪽 필드를
//    덮어쓰지 않도록 함. 사진 필드(bPhoto/lPhoto/dPhoto/sPhoto/workoutPhoto) 보존 필수.
//
// 문서 크기 900KB 초과 시 사진 자동 재인코딩(480px, JPEG q=0.5) 해 크기 축소.
// ================================================================

import {
  db, doc, setDoc, deleteDoc,
  getDataOwnerId,
  _cache, _setCache, _fbOp, _setSyncStatus,
} from './data-core.js';
import {
  PENDING_DAY_WRITE_PREFIX,
  enqueuePendingDayWrite,
  listPendingDayWrites,
  mergePendingDayWritesIntoCache,
  acknowledgePendingDayWrites,
  reassignPendingDayWrites,
} from './pending-day-writes.js';

const _pendingFlushByOwnerDate = new Map();
const _inFlightRemoteDayWrites = new Map();
let _pendingSyncListenersReady = false;

// navigator.onLine 은 힌트일 뿐이다. Android WebView 와 일부 데스크톱 네트워크
// 스택은 연결이 정상인데도 false 를 보고하므로, 이 값으로 서버 저장을 건너뛰면
// 식단/운동이 기기에만 남는다. 항상 write 를 시도하되 아래 시간 안에 서버 ack
// 가 오지 않으면 호출자에게 pending 으로 알린다. write 자체는 백그라운드에서
// 계속 진행하고 확정되는 순간 복구 저널을 정리한다.
const REMOTE_ACK_WINDOW_MS = 8000;
const OFFLINE_HINT_ACK_WINDOW_MS = 1200;

function _ownerDateQueueKey(ownerId, key) {
  return `${encodeURIComponent(ownerId)}:${key}`;
}

function _pendingStorage() {
  const storage = globalThis.localStorage;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    const error = new Error('기기 복구 저장소를 사용할 수 없습니다.');
    error.code = 'PENDING_DAY_STORAGE_UNAVAILABLE';
    throw error;
  }
  return storage;
}

function _normalizedPatch(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error('saveDay payload must be an object');
    error.code = 'INVALID_DAY_PAYLOAD';
    throw error;
  }
  const json = JSON.stringify(data);
  if (typeof json !== 'string') {
    const error = new Error('saveDay payload is not serializable');
    error.code = 'INVALID_DAY_PAYLOAD';
    throw error;
  }
  return { patch: JSON.parse(json), json };
}

function _markPendingWriteError(error, fallbackCode = 'PENDING_DAY_SYNC_FAILED') {
  const value = error instanceof Error ? error : new Error(String(error || 'day write failed'));
  value.code = value.code || fallbackCode;
  value.pendingDayWrite = true;
  return value;
}

function _applyPendingPayloadToCurrentCache(ownerId, key, payload) {
  if (getDataOwnerId() !== ownerId) return;
  const existing = _cache[key] && typeof _cache[key] === 'object' ? _cache[key] : {};
  _cache[key] = { ...existing, ...payload };
}

function _notifyDayCacheChanged(ownerId, key, source) {
  if (typeof document === 'undefined' || getDataOwnerId() !== ownerId) return;
  document.dispatchEvent(new CustomEvent('data:workouts-updated', {
    detail: { ownerId, changedDateKeys: [key], source },
  }));
}

function _loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function _fitPatchForFirestore(patch, sourceJson) {
  if (sourceJson.length <= 900000) return { patch, changed: false };

  console.warn('[data] 문서 크기 초과 위험 (' + Math.round(sourceJson.length / 1024) + 'KB) — 사진 품질 축소');
  const next = { ...patch };
  let changed = false;
  const photoKeys = ['bPhoto', 'lPhoto', 'dPhoto', 'sPhoto', 'workoutPhoto'];
  for (const photoKey of photoKeys) {
    if (typeof next[photoKey] !== 'string' || next[photoKey].length <= 100000) continue;
    try {
      const image = await _loadImage(next[photoKey]);
      const canvas = document.createElement('canvas');
      const maxSize = 480;
      let width = image.width;
      let height = image.height;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      next[photoKey] = canvas.toDataURL('image/jpeg', 0.5);
      changed = true;
    } catch (error) {
      // 원본을 null로 지우면 복구 저널에도 사진 소실이 확정된다. 원본을 보존하고
      // 서버가 거부할 경우 pending 상태로 남겨 다음 실행에서 다시 복구한다.
      console.warn(`[data] ${photoKey} 사진 축소 실패 — 원본 보존:`, error?.message || error);
    }
  }
  return { patch: next, changed };
}

function _restorePendingEntries(ownerId, baseCache = {}) {
  const entries = listPendingDayWrites(_pendingStorage(), { ownerId });
  return mergePendingDayWritesIntoCache(baseCache, entries);
}

export function restorePendingDayWritesForOwner(ownerId, baseCache = {}) {
  if (!ownerId) return { ...baseCache };
  try {
    return _restorePendingEntries(ownerId, baseCache);
  } catch (error) {
    console.warn('[data] pending day restore skipped:', error?.message || error);
    return { ...baseCache };
  }
}

export function reassignPendingDayWritesToOwner(targetOwnerId, sourceOwnerIds = []) {
  if (!targetOwnerId) return 0;
  let moved = 0;
  const storage = _pendingStorage();
  for (const sourceOwnerId of new Set(sourceOwnerIds || [])) {
    if (!sourceOwnerId || sourceOwnerId === targetOwnerId) continue;
    moved += reassignPendingDayWrites(storage, {
      fromOwnerId: sourceOwnerId,
      toOwnerId: targetOwnerId,
    }).moved;
  }
  return moved;
}

function _remoteAckWindowMs() {
  const offlineHint = typeof navigator !== 'undefined' && navigator.onLine === false;
  return offlineHint ? OFFLINE_HINT_ACK_WINDOW_MS : REMOTE_ACK_WINDOW_MS;
}

// Firestore 는 오프라인 write 를 거부하지 않고 서버 ack 까지 promise 를 보류한다.
// 복구 저널은 이미 durable 하므로 정해진 시간만 기다렸다가 제어를 돌려주고,
// 실제 write 는 그대로 진행시킨다. 실패는 창 안에서만 호출자에게 전파한다.
function _awaitRemoteAck(remoteWrite, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    if (typeof timer?.unref === 'function') timer.unref();
    remoteWrite.then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    }, (error) => {
      if (settled) {
        console.warn('[data] deferred day write failed:', error?.message || error);
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function _trackInFlightRemoteDayWrite(queueKey, remoteWrite) {
  _inFlightRemoteDayWrites.set(queueKey, remoteWrite);
  const clear = () => {
    if (_inFlightRemoteDayWrites.get(queueKey) === remoteWrite) {
      _inFlightRemoteDayWrites.delete(queueKey);
    }
  };
  remoteWrite.then(clear, clear);
}

async function _drainPendingDayWrites(ownerId, key, dayRef) {
  const queueKey = _ownerDateQueueKey(ownerId, key);

  while (true) {
    const storage = _pendingStorage();
    const entries = listPendingDayWrites(storage, { ownerId, dateKey: key });
    if (!entries.length) return { state: 'synced', ownerId, dateKey: key };

    // 앞선 write 가 아직 확정되지 않았다면 같은 날짜에 write 를 겹쳐 쌓지 않는다.
    // 그 write 가 끝나면 남은 저널을 이어서 보낸다.
    if (_inFlightRemoteDayWrites.has(queueKey)) {
      return { state: 'pending', ownerId, dateKey: key };
    }

    const pendingCache = mergePendingDayWritesIntoCache({}, entries);
    const payload = pendingCache[key];
    if (!payload || typeof payload !== 'object') {
      throw _markPendingWriteError(new Error('pending day payload is invalid'), 'PENDING_DAY_INVALID');
    }

    // 대상 ref는 호출 당시 canonical owner로 고정한다. await 뒤 현재 로그인
    // 계정을 다시 읽지 않으므로 A 계정 저장이 B/_orphan으로 새지 않는다.
    const remoteWrite = setDoc(dayRef, payload, { merge: true }).then(() => {
      // 늦게 확정된 write 도 저널을 정리해야 다음 flush 가 같은 payload 를
      // 다시 보내지 않는다. 저장소 접근 실패로 서버 성공을 실패로 바꾸지 않는다.
      try {
        acknowledgePendingDayWrites(_pendingStorage(), entries);
      } catch (error) {
        console.warn('[data] pending day acknowledgement skipped:', error?.message || error);
      }
    });
    _trackInFlightRemoteDayWrite(queueKey, remoteWrite);

    let acknowledged;
    try {
      acknowledged = await _awaitRemoteAck(remoteWrite, _remoteAckWindowMs());
    } catch (error) {
      const marked = _markPendingWriteError(error);
      marked.pendingDayStored = true;
      throw marked;
    }

    if (!acknowledged) {
      remoteWrite.then(
        () => { void _requestPendingDayFlush(ownerId, key, { dayRef }); },
        () => {},
      );
      return { state: 'pending', ownerId, dateKey: key };
    }
  }
}

function _requestPendingDayFlush(ownerId, key, { dayRef = null, rethrow = false } = {}) {
  const queueKey = _ownerDateQueueKey(ownerId, key);
  let state = _pendingFlushByOwnerDate.get(queueKey);
  if (!state) {
    const capturedRef = dayRef || doc(db, 'users', ownerId, 'workouts', key);
    // _fbOp 의 기본 sync 처리는 "resolve = 서버 왕복 성공" 을 전제한다. 이 흐름은
    // 서버 ack 를 못 받아도 pending 으로 정상 resolve 하므로, 그 전제를 그대로
    // 두면 기기에만 남은 기록을 앱이 '동기화됨' 이라고 보고한다. 결과에 따라
    // 직접 상태를 알린다.
    const promise = _fbOp(
      'flushPendingDayWrites',
      async () => {
        _setSyncStatus('syncing');
        try {
          const result = await _drainPendingDayWrites(ownerId, key, capturedRef);
          _setSyncStatus(result?.state === 'pending' ? 'pending' : 'ok');
          return result;
        } catch (error) {
          _setSyncStatus('err');
          throw error;
        }
      },
      { rethrow: true, dateKey: queueKey, sync: false },
    ).finally(() => {
      if (_pendingFlushByOwnerDate.get(queueKey)?.promise === promise) {
        _pendingFlushByOwnerDate.delete(queueKey);
      }
    });
    state = { promise };
    _pendingFlushByOwnerDate.set(queueKey, state);
  }

  if (rethrow) return state.promise;
  return state.promise.catch((error) => {
    console.warn('[data] pending day sync deferred:', error?.message || error);
    return { state: 'pending', ownerId, dateKey: key, error };
  });
}

export async function flushPendingDayWrites(ownerId = getDataOwnerId()) {
  if (!ownerId) return { state: 'idle', synced: 0, failed: 0 };
  let entries;
  try {
    entries = listPendingDayWrites(_pendingStorage(), { ownerId });
  } catch (error) {
    console.warn('[data] pending day flush unavailable:', error?.message || error);
    return { state: 'unavailable', synced: 0, failed: 1 };
  }
  const dateKeys = [...new Set(entries.map(entry => entry.record.dateKey))];
  if (!dateKeys.length) return { state: 'idle', synced: 0, failed: 0 };
  const results = await Promise.allSettled(
    dateKeys.map(key => _requestPendingDayFlush(ownerId, key, { rethrow: true })),
  );
  const failed = results.filter(result => result.status === 'rejected').length;
  const pending = results.filter(result => (
    result.status === 'fulfilled' && result.value?.state === 'pending'
  )).length;
  const synced = results.length - failed - pending;
  return {
    state: failed || pending ? 'pending' : 'synced',
    synced,
    pending,
    failed,
  };
}

function _schedulePendingFlush() {
  const ownerId = getDataOwnerId();
  if (!ownerId) return;
  void flushPendingDayWrites(ownerId).catch(error => {
    console.warn('[data] pending day background sync deferred:', error?.message || error);
  });
}

export function initializePendingDayWriteSync() {
  if (_pendingSyncListenersReady || typeof window === 'undefined') return;
  _pendingSyncListenersReady = true;
  window.addEventListener('online', _schedulePendingFlush);
  window.addEventListener('focus', _schedulePendingFlush);
  window.addEventListener('storage', (event) => {
    if (!String(event?.key || '').startsWith(PENDING_DAY_WRITE_PREFIX)) return;
    const ownerId = getDataOwnerId();
    if (!ownerId) return;
    const nextCache = restorePendingDayWritesForOwner(ownerId, _cache);
    const changedDateKeys = [...new Set([
      ...Object.keys(_cache || {}),
      ...Object.keys(nextCache || {}),
    ])].filter(key => {
      try { return JSON.stringify(_cache?.[key] || null) !== JSON.stringify(nextCache?.[key] || null); }
      catch { return true; }
    });
    if (getDataOwnerId() === ownerId) {
      _setCache(nextCache);
      if (changedDateKeys.length && typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('data:workouts-updated', {
          detail: { ownerId, changedDateKeys, source: 'pending-storage' },
        }));
      }
    }
    _schedulePendingFlush();
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _schedulePendingFlush();
    });
  }
}

// 2026-04-20: `opts.rethrow=true`로 호출하면 Firebase 저장 실패가 호출자에게 전파됨.
// 기본은 기존 동작(swallow) — fire-and-forget 호출 호환.
// 운동 종료 흐름(saveWorkoutDay → wtFinishWorkout → wtEndAndShowInsights)은
// rethrow=true로 호출해 실패 시 성공 토스트/인사이트 모달이 거짓말하지 않도록 한다.
//
// 2026-04-20 (merge-mode): `opts.mode='merge'` 추가.
//   - 'merge'          — setDoc({merge:true}) 로 부분 업데이트. 호출자가 전달한 필드만 Firestore
//                        에 기록되고 나머지는 보존. _cache 도 병합 규칙 적용. isEmpty 삭제 스킵.
//   - 'replace'        — 전체 덮어쓰기 + isEmpty 삭제. 2026-06-26부터 allowReplace:true 필요.
//     workout/save.js 가 운동/식단 payload 를 분할해 merge 로 저장 → 한쪽 경로가 다른쪽
//     필드를 절대 덮어쓰지 못해 "운동 수정하면 식단 깨지고 vice versa" 구조적 결합 제거.
//     호출부가 "무언가 하나라도 기록됐나"를 이미 판정한 뒤 부를 책임.
//
// 2026-04-20 (serialize): data-core._fbOp 가 dateKey 별 Promise chain 으로 직렬화 처리.
//   동시에 호출된 saveWorkoutDay + _autoSaveDiet 가 order-of-writes race 를 일으키지 않음.
export async function saveDay(key, data, opts = {}) {
  const { rethrow = false, mode = 'merge', allowReplace = false } = opts;
  const saveMode = mode === 'replace' ? 'replace' : 'merge';
  const ownerId = getDataOwnerId();
  if (!ownerId) {
    const error = _markPendingWriteError(new Error('로그인 계정이 없어 날짜 기록을 저장할 수 없습니다.'), 'DAY_OWNER_REQUIRED');
    if (rethrow) throw error;
    console.warn('[data] saveDay blocked without owner:', key);
    return { state: 'rejected', error };
  }
  const dayRef = doc(db, 'users', ownerId, 'workouts', key);
  let normalized;
  try {
    normalized = _normalizedPatch(data);
  } catch (error) {
    if (rethrow) throw error;
    console.warn('[data] invalid saveDay payload:', error?.message || error);
    return { state: 'rejected', error };
  }

  if (saveMode === 'merge') {
    let entry;
    try {
      // 첫 await 전에 복구 저널과 캐시를 함께 갱신한다. 운동 picker가 저장
      // Promise를 기다리지 않고 재렌더해도 같은 날짜의 식단/운동이 사라지지 않는다.
      entry = enqueuePendingDayWrite(_pendingStorage(), {
        ownerId,
        dateKey: key,
        payload: normalized.patch,
      });
      _applyPendingPayloadToCurrentCache(ownerId, key, entry.record.payload);
    } catch (error) {
      // localStorage quota/WebView 제한이 있어도 네트워크가 살아 있으면 서버에
      // 직접 저장한다. 이 경로는 원격 성공 전 cache를 갱신하지 않아 거짓
      // "저장됨" 상태를 만들지 않는다.
      const journalError = _markPendingWriteError(error, 'PENDING_DAY_STORAGE_FAILED');
      try {
        const fittedFallback = await _fitPatchForFirestore(normalized.patch, normalized.json);
        return await _fbOp('saveDay(merge-direct)', async () => {
          await setDoc(dayRef, fittedFallback.patch, { merge: true });
          _applyPendingPayloadToCurrentCache(ownerId, key, fittedFallback.patch);
          _notifyDayCacheChanged(ownerId, key, 'direct-fallback');
          return { state: 'synced', ownerId, dateKey: key, recoveryJournal: false };
        }, { rethrow: true, dateKey: _ownerDateQueueKey(ownerId, key) });
      } catch (remoteError) {
        const marked = _markPendingWriteError(remoteError, 'DAY_WRITE_AND_RECOVERY_FAILED');
        marked.localRecoveryUnavailable = true;
        marked.recoveryCause = journalError;
        if (rethrow) throw marked;
        console.error('[data] saveDay direct fallback failed:', marked);
        return { state: 'rejected', error: marked };
      }
    }

    const fitted = await _fitPatchForFirestore(normalized.patch, normalized.json);
    if (fitted.changed) {
      try {
        entry = enqueuePendingDayWrite(_pendingStorage(), {
          ownerId,
          dateKey: key,
          payload: fitted.patch,
        });
        _applyPendingPayloadToCurrentCache(ownerId, key, entry.record.payload);
      } catch (error) {
        const marked = _markPendingWriteError(error, 'PENDING_DAY_STORAGE_FAILED');
        marked.pendingDayStored = true;
        if (rethrow) throw marked;
        return { state: 'pending', ownerId, dateKey: key, error: marked };
      }
    }
    return _requestPendingDayFlush(ownerId, key, { dayRef, rethrow });
  }

  if (!allowReplace) {
    const err = new Error('saveDay replace requires allowReplace:true');
    console.warn('[data] unsafe saveDay replace blocked:', key);
    if (rethrow) throw err;
    return undefined;
  }

  // 기존 'replace' 경로 — 전체 덮어쓰기 + isEmpty 삭제.
  const replacement = normalized.patch;
  const isEmpty = !replacement || (
    !replacement.exercises?.length && !replacement.cf && !replacement.memo &&
    !replacement.breakfast && !replacement.lunch && !replacement.dinner && !replacement.snack &&
    !replacement.stretching && !replacement.swimming && !replacement.running && !replacement.wine_free &&
    !replacement.breakfast_skipped && !replacement.lunch_skipped && !replacement.dinner_skipped &&
    !replacement.bKcal && !replacement.lKcal && !replacement.dKcal && !replacement.sKcal &&
    !replacement.runDistance && !replacement.swimDistance &&
    !replacement.bFoods?.length && !replacement.lFoods?.length && !replacement.dFoods?.length && !replacement.sFoods?.length &&
    !replacement.bPhoto && !replacement.lPhoto && !replacement.dPhoto && !replacement.sPhoto && !replacement.workoutPhoto
  );
  return _fbOp('saveDay', async () => {
    if (isEmpty) {
      await deleteDoc(dayRef);
      if (getDataOwnerId() === ownerId) delete _cache[key];
    } else {
      await setDoc(dayRef, replacement);
      if (getDataOwnerId() === ownerId) _cache[key] = replacement;
    }
  }, { rethrow, dateKey: _ownerDateQueueKey(ownerId, key) });
}
