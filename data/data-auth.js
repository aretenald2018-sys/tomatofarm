// ================================================================
// data-auth.js — 인증, 역할 체크, 비밀번호
// ================================================================

import {
  getCurrentUserRef, setCurrentUserRef,
  ADMIN_ID, ADMIN_GUEST_ID,
  _idbSet, _idbGet, _idbRemove,
} from './data-core.js';

export function getCurrentUser() { return getCurrentUserRef(); }
export function getAdminId() { return ADMIN_ID; }
export function getAdminGuestId() { return ADMIN_GUEST_ID; }

export function isAdmin() {
  return getCurrentUserRef()?.id === ADMIN_ID;
}

export function isAdminGuest() {
  return getCurrentUserRef()?.id === ADMIN_GUEST_ID;
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
  setCurrentUserRef(user);
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    _idbSet('currentUser', user);
  } else {
    localStorage.removeItem('currentUser');
    _idbRemove('currentUser');
    _idbRemove('admin_authenticated');
    _idbRemove('kim_authenticated');
  }
}

export function loadSavedUser() {
  try {
    const saved = localStorage.getItem('currentUser');
    if (saved) { setCurrentUserRef(JSON.parse(saved)); return getCurrentUserRef(); }
  } catch {}
  return null;
}

export function backupAdminAuth() { _idbSet('admin_authenticated', true); }
export function clearAdminAuth() { _idbRemove('admin_authenticated'); }
export const backupKimAuth = backupAdminAuth;
export const clearKimAuth = clearAdminAuth;

export async function restoreUserFromBackup() {
  if (getCurrentUserRef()) return getCurrentUserRef();
  try {
    const backup = await _idbGet('currentUser');
    if (backup) {
      setCurrentUserRef(backup);
      localStorage.setItem('currentUser', JSON.stringify(backup));
      const adminAuth = await _idbGet('admin_authenticated') || await _idbGet('kim_authenticated');
      if (adminAuth) localStorage.setItem('admin_authenticated', 'true');
      return getCurrentUserRef();
    }
  } catch {}
  return null;
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

export function verifyPassword(account, input) {
  if (!account.hasPassword || !account.passwordHash) return true;
  return _simpleHash(input) === account.passwordHash;
}

export function hashPassword(pw) { return _simpleHash(pw); }
