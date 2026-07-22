// ================================================================
// data-auth.js — 인증, 역할 체크, 비밀번호
// ================================================================

import {
  getCurrentUserRef, setCurrentUserRef,
  ADMIN_ID, ADMIN_GUEST_ID, getKimMode, setKimMode,
  _idbSet, _idbGet, _idbRemove,
} from './data-core.js';
import { isInstalledAppSurface } from '../utils/platform-session.js';

let _authSessionGeneration = 0;
let _authPersistence = Promise.resolve();
export const INSTALLED_APP_SESSION_DISABLED_KEY = 'tomatofarm:installed-app-session-disabled:v1';

function _queueAuthPersistence(operation) {
  const next = _authPersistence.then(operation, operation);
  _authPersistence = next.catch(() => {});
}

export async function waitForAuthPersistence() {
  let pending;
  do {
    pending = _authPersistence;
    await pending;
  } while (pending !== _authPersistence);
}

export function getCurrentUser() { return getCurrentUserRef(); }
export function getAdminId() { return ADMIN_ID; }
export function getAdminGuestId() { return ADMIN_GUEST_ID; }

export function isAdmin() {
  return getCurrentUserRef()?.id === ADMIN_ID && getKimMode() === 'admin';
}

export function isAdminGuest() {
  return getCurrentUserRef()?.id === ADMIN_ID && getKimMode() === 'guest';
}

export function isSameInstance(id1, id2) {
  if (id1 === id2) return true;
  const normalize = (id) => (id === ADMIN_GUEST_ID ? ADMIN_ID : id);
  return normalize(id1) === normalize(id2);
}

export function isAdminInstance(id) {
  return id === ADMIN_ID || id === ADMIN_GUEST_ID;
}

export const GUEST_CONFIG = {
  homeCards: {
    hero: true,
    unit_goal: true,
    mini_memo: false,
    goals: false,
    quests: false,
    diet_goal: true,
    friends: true,
    tomato_basket: true,
  },
};

export function shouldShow(section, key) {
  if (isAdmin()) return true;
  return GUEST_CONFIG[section]?.[key] !== false;
}

export function setCurrentUser(user) {
  _authSessionGeneration += 1;
  const normalizedUser = _normalizeKimUser(user);
  setCurrentUserRef(normalizedUser);
  if (normalizedUser) {
    localStorage.removeItem(INSTALLED_APP_SESSION_DISABLED_KEY);
    localStorage.setItem('currentUser', JSON.stringify(normalizedUser));
    _queueAuthPersistence(() => _idbSet('currentUser', normalizedUser));
  } else {
    localStorage.removeItem('currentUser');
    _queueAuthPersistence(async () => {
      await _idbRemove('currentUser');
      await _idbRemove('admin_authenticated');
      await _idbRemove('kim_authenticated');
    });
  }
}

export function loadSavedUser() {
  try {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      setCurrentUser(_normalizeKimUser(JSON.parse(saved)));
      return getCurrentUserRef();
    }

    // Chrome, an installed PWA, and the Capacitor WebView do not share
    // localStorage/IndexedDB. The native widget is nevertheless backed by the
    // shared tomato admin owner, so a fresh installed surface must enter that
    // owner in its restricted Guest mode instead of booting with no user and
    // rendering an empty cache. Normal Chrome sessions still use explicit login.
    if (
      isInstalledAppSurface()
      && localStorage.getItem(INSTALLED_APP_SESSION_DISABLED_KEY) !== '1'
    ) {
      const installedGuest = {
        id: ADMIN_ID,
        lastName: '김',
        firstName: '태우',
        nickname: '김태우',
        createdAt: 0,
      };
      setKimMode('guest');
      setCurrentUser(installedGuest);
      localStorage.setItem('kim_authenticated', 'true');
      backupAdminAuth();
      return getCurrentUserRef();
    }
  } catch {}
  return null;
}

export function disableInstalledAppSessionFallback() {
  localStorage.setItem(INSTALLED_APP_SESSION_DISABLED_KEY, '1');
}

export function backupAdminAuth() {
  _queueAuthPersistence(() => _idbSet('admin_authenticated', true));
}
export function clearAdminAuth() {
  _queueAuthPersistence(() => _idbRemove('admin_authenticated'));
}
export const backupKimAuth = backupAdminAuth;
export const clearKimAuth = clearAdminAuth;

export async function restoreUserFromBackup() {
  const restoreGeneration = _authSessionGeneration;
  if (getCurrentUserRef()) return getCurrentUserRef();

  await waitForAuthPersistence();
  if (_authSessionGeneration !== restoreGeneration || getCurrentUserRef()) {
    return getCurrentUserRef();
  }

  try {
    const backup = await _idbGet('currentUser');
    if (_authSessionGeneration !== restoreGeneration || getCurrentUserRef()) {
      return getCurrentUserRef();
    }
    if (!backup) return null;

    const [adminAuth, kimAuth] = await Promise.all([
      _idbGet('admin_authenticated'),
      _idbGet('kim_authenticated'),
    ]);
    if (_authSessionGeneration !== restoreGeneration || getCurrentUserRef()) {
      return getCurrentUserRef();
    }

    const normalizedBackup = _normalizeKimUser(backup);
    setCurrentUser(normalizedBackup);
    if (adminAuth || kimAuth) localStorage.setItem('admin_authenticated', 'true');
    return getCurrentUserRef();
  } catch {}
  return null;
}

function _normalizeKimUser(user) {
  if (!user || user.id !== ADMIN_GUEST_ID) return user;
  setKimMode('guest');
  const normalizedFirstName = typeof user.firstName === 'string'
    ? user.firstName.replace(/\(guest\)/i, '').replace(/\(Guest\)/g, '').trim()
    : user.firstName;
  return { ...user, id: ADMIN_ID, firstName: normalizedFirstName };
}

// ── 비밀번호 (단순 해시) ────────────────────────────────────────
export function _simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

function _accountNeedsPassword(account) {
  if (!account) return false;
  const flag = account.hasPassword;
  if (flag === true || flag === 'true' || flag === 1 || flag === '1') return true;
  if (flag === false || flag === 'false' || flag === 0 || flag === '0') return false;
  return !!account.passwordHash;
}

export function verifyPassword(account, input) {
  if (!_accountNeedsPassword(account) || !account.passwordHash) return true;

  const rawInput = String(input ?? '');
  const inputHash = _simpleHash(rawInput);
  const storedHash = account.passwordHash;

  if (String(storedHash) === inputHash) return true;
  if (String(storedHash) === rawInput) return true;

  return false;
}

export function hashPassword(pw) { return _simpleHash(pw); }
