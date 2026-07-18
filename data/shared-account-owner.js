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
    registrySnapshot = await getDocFromServer(registryRef);
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
