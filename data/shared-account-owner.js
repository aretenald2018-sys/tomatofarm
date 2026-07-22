import {
  db,
  doc,
  getDocFromServer,
  getCachedSharedAccountDataOwnerId,
  getSharedAccountDataOwnerId,
  setSharedAccountDataOwnerId,
  resolveDataOwnerId,
} from './data-core.js';
import {
  ADMIN_ACCOUNT_ID,
  ADMIN_GUEST_ACCOUNT_ID,
  SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION,
  SHARED_ACCOUNT_OWNER_REGISTRY_ID,
  isSharedAdminAccount,
  normalizeSharedAccountDataOwnerId,
  readSharedAccountDataOwnerRegistry,
} from './account-unification.js';
import { reassignPendingDayWritesToOwner } from './data-save.js';

let _resolutionPromise = null;

// 레지스트리 읽기가 응답 없이 매달리면 앱 부팅 전체가 멈추고 캐시가 빈 채로
// 남는다. 모바일에서 이는 "기록이 사라졌다"로 보인다. 네트워크 실패와 동일하게
// 취급해 이미 검증된 기기 캐시로 넘어간다.
const REGISTRY_READ_TIMEOUT_MS = 8000;

async function _readOwnerRegistrySnapshot(registryRef) {
  let timer = null;
  try {
    return await Promise.race([
      getDocFromServer(registryRef),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error('shared account owner registry read timed out');
          error.code = 'deadline-exceeded';
          reject(error);
        }, REGISTRY_READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function _isRemoteRegistryUnavailable(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return new Set([
    'unavailable',
    'deadline-exceeded',
    'network-request-failed',
  ]).has(String(error?.code || '').replace(/^firestore\//, ''));
}

function _adoptSharedAccountDataOwner(ownerId) {
  const selectedOwnerId = normalizeSharedAccountDataOwnerId(ownerId);
  if (!selectedOwnerId) throw new TypeError('shared account data owner must be an admin alias');
  reassignPendingDayWritesToOwner(selectedOwnerId, [
    ADMIN_ACCOUNT_ID,
    ADMIN_GUEST_ACCOUNT_ID,
  ]);
  return setSharedAccountDataOwnerId(selectedOwnerId);
}

async function _resolveSharedAccountDataOwner() {
  const registryRef = doc(
    db,
    SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION,
    SHARED_ACCOUNT_OWNER_REGISTRY_ID,
  );
  let registrySnapshot;
  try {
    registrySnapshot = await _readOwnerRegistrySnapshot(registryRef);
  } catch (error) {
    const cachedOwnerId = getCachedSharedAccountDataOwnerId();
    if (cachedOwnerId && _isRemoteRegistryUnavailable(error)) {
      console.warn('[data] shared account registry unavailable; using verified device cache');
      return _adoptSharedAccountDataOwner(cachedOwnerId);
    }
    throw error;
  }
  const registeredOwnerId = readSharedAccountDataOwnerRegistry(registrySnapshot.data());
  if (registeredOwnerId) return _adoptSharedAccountDataOwner(registeredOwnerId);
  // Owner selection is a privileged deployment migration. A browser must not
  // be able to choose a physical namespace or race an already-open client.
  const error = new Error('shared account data owner has not been initialized by the server');
  error.code = 'SHARED_DATA_OWNER_NOT_INITIALIZED';
  throw error;
}

export async function ensureSharedAccountDataOwner() {
  const sessionOwnerId = getSharedAccountDataOwnerId();
  if (sessionOwnerId) {
    return _adoptSharedAccountDataOwner(sessionOwnerId);
  }
  if (!_resolutionPromise) {
    _resolutionPromise = _resolveSharedAccountDataOwner()
      .finally(() => { _resolutionPromise = null; });
  }
  return _resolutionPromise;
}

export async function resolvePrivateDataOwnerId(ownerId) {
  if (!isSharedAdminAccount(ownerId)) return resolveDataOwnerId(ownerId);
  const selectedOwnerId = await ensureSharedAccountDataOwner();
  if (!selectedOwnerId) {
    throw new Error('shared account data owner is unresolved');
  }
  return selectedOwnerId;
}
