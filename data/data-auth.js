// ================================================================
// data-auth.js — 인증, 역할 체크, 비밀번호
// ================================================================

import {
  getCurrentUserRef, setCurrentUserRef,
  ADMIN_CONSOLE_ID, PERSONAL_ID, PERSONAL_LEGACY_ID,
  _idbSet, _idbGet, _idbRemove,
} from './data-core.js';
import { isAdminConsoleAccount, isPersonalSharedAccount } from './account-unification.js';
import { isInstalledAppSurface } from '../utils/platform-session.js';

let _authSessionGeneration = 0;
let _authPersistence = Promise.resolve();
export const INSTALLED_APP_SESSION_DISABLED_KEY = 'tomatofarm:installed-app-session-disabled:v1';

// 관리자/게스트를 한 계정의 모드로 나누던 시절의 세션 플래그. 그 플래그가 서 있으면
// 잠금 화면을 건너뛰었고, 모드 전환은 비밀번호를 묻지 않았다. 키를 갈아끼워서
// 예전 플래그가 새 권한 모델로 넘어오지 못하게 한다.
export const SESSION_UNLOCK_KEY = 'tomatofarm:session-unlocked:v2';
const LEGACY_SESSION_UNLOCK_KEYS = Object.freeze(['admin_authenticated', 'kim_authenticated']);
const SESSION_UNLOCK_IDB_KEY = 'session_unlocked';

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
export function getAdminConsoleId() { return ADMIN_CONSOLE_ID; }
export function getPersonalAccountId() { return PERSONAL_ID; }
export function getPersonalLegacyAliasId() { return PERSONAL_LEGACY_ID; }

// 권한은 로그인한 계정 하나로 결정된다. 모드 토글도, 클라이언트 플래그도 없다.
export function isAdmin() {
  return isAdminConsoleAccount(getCurrentUserRef()?.id);
}

export function isSameInstance(id1, id2) {
  if (id1 === id2) return true;
  const normalize = (id) => (id === PERSONAL_LEGACY_ID ? PERSONAL_ID : id);
  return normalize(id1) === normalize(id2);
}

export function isPersonalInstance(id) {
  return isPersonalSharedAccount(id);
}

// 홈 카드 구성은 **모든 계정이 같다.** 계정별 우회로가 없어야 하는 표다.
//
// 2026-04 토마토 리뉴얼이 홈을 토마토/생활존 화면으로 바꾸면서 단위목표·미니
// 메모·목표·퀘스트 카드를 홈에서 내렸다. 그 뒤 이 표에 `isAdmin()` 우회로가
// 남아 있었고, 2026-07-22 관리자 계정 분리 후속 수정(`dbd6bd4`)이 그 우회로를
// `isOwnerAccount()` 로 넓히면서 내려둔 카드 네 개가 개인 계정 홈에 통째로
// 되살아났다. 권한 축(`isAdmin()`)으로 화면 구성을 가르면 권한 모델을 손댈
// 때마다 홈이 따라 움직인다. 그래서 여기에는 계정을 보는 분기를 두지 않는다.
export const HOME_CARD_CONFIG = {
  homeCards: {
    hero: true,
    unit_goal: false,
    mini_memo: false,
    goals: false,
    quests: false,
    diet_goal: true,
    friends: true,
    tomato_basket: true,
  },
};

export function shouldShow(section, key) {
  return HOME_CARD_CONFIG[section]?.[key] !== false;
}

export function setCurrentUser(user) {
  _authSessionGeneration += 1;
  const normalizedUser = _normalizePersonalUser(user);
  setCurrentUserRef(normalizedUser);
  if (normalizedUser) {
    localStorage.removeItem(INSTALLED_APP_SESSION_DISABLED_KEY);
    localStorage.setItem('currentUser', JSON.stringify(normalizedUser));
    _queueAuthPersistence(() => _idbSet('currentUser', normalizedUser));
  } else {
    localStorage.removeItem('currentUser');
    _queueAuthPersistence(async () => {
      await _idbRemove('currentUser');
      await _idbRemove(SESSION_UNLOCK_IDB_KEY);
    });
  }
}

export function loadSavedUser() {
  try {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      setCurrentUser(_normalizePersonalUser(JSON.parse(saved)));
      return getCurrentUserRef();
    }

    // Chrome, an installed home-screen PWA, and the Capacitor WebView do not
    // share localStorage/IndexedDB — the APK runs on its own https://localhost
    // origin. A fresh installed surface therefore has no session, the shared
    // owner never resolves, and the app renders an empty cache that reads as
    // "my diet records are gone". Seed the personal account so the surface knows
    // whose account it is; it stays UNauthenticated so the existing password
    // lock still runs. The admin console account is never seeded — an installed
    // surface must not hand out admin without a password.
    if (
      isInstalledAppSurface()
      && localStorage.getItem(INSTALLED_APP_SESSION_DISABLED_KEY) !== '1'
    ) {
      setCurrentUser({
        id: PERSONAL_ID,
        lastName: '김',
        firstName: '태우',
        nickname: '김태우',
        createdAt: 0,
      });
      return getCurrentUserRef();
    }
  } catch {}
  return null;
}

export function disableInstalledAppSessionFallback() {
  localStorage.setItem(INSTALLED_APP_SESSION_DISABLED_KEY, '1');
}

export function markSessionUnlocked() {
  localStorage.setItem(SESSION_UNLOCK_KEY, 'true');
  _queueAuthPersistence(() => _idbSet(SESSION_UNLOCK_IDB_KEY, true));
}

export function clearSessionUnlock() {
  localStorage.removeItem(SESSION_UNLOCK_KEY);
  clearLegacySessionUnlockFlags();
  _queueAuthPersistence(() => _idbRemove(SESSION_UNLOCK_IDB_KEY));
}

export function isSessionUnlocked() {
  return localStorage.getItem(SESSION_UNLOCK_KEY) === 'true';
}

export function clearLegacySessionUnlockFlags() {
  for (const key of LEGACY_SESSION_UNLOCK_KEYS) localStorage.removeItem(key);
}

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

    const unlocked = await _idbGet(SESSION_UNLOCK_IDB_KEY);
    if (_authSessionGeneration !== restoreGeneration || getCurrentUserRef()) {
      return getCurrentUserRef();
    }

    setCurrentUser(_normalizePersonalUser(backup));
    if (unlocked) localStorage.setItem(SESSION_UNLOCK_KEY, 'true');
    return getCurrentUserRef();
  } catch {}
  return null;
}

function _normalizePersonalUser(user) {
  if (!user || user.id !== PERSONAL_LEGACY_ID) return user;
  const normalizedFirstName = typeof user.firstName === 'string'
    ? user.firstName.replace(/\(guest\)/i, '').replace(/\(Guest\)/g, '').trim()
    : user.firstName;
  return { ...user, id: PERSONAL_ID, firstName: normalizedFirstName };
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

export function accountNeedsPassword(account) {
  // 관리자 콘솔 계정은 비밀번호 없이 열리는 경로가 있어서는 안 된다.
  if (isAdminConsoleAccount(account?.id)) return true;
  return _accountNeedsPassword(account);
}

export function verifyPassword(account, input) {
  // 비밀번호가 등록되지 않은 관리자 콘솔 계정은 통과시키지 않는다. 다른 계정의
  // "비밀번호 없음 = 바로 로그인" 동작은 그대로 둔다.
  if (isAdminConsoleAccount(account?.id) && !account?.passwordHash) return false;
  if (!_accountNeedsPassword(account) || !account?.passwordHash) return true;

  const rawInput = String(input ?? '');
  const inputHash = _simpleHash(rawInput);
  const storedHash = String(account.passwordHash);

  if (storedHash === inputHash) return true;

  // 평문 대조 폴백. 해시 이전에 비밀번호를 그대로 저장한 오래된 계정을 위한
  // 것이라, 저장된 값 자체가 곧 유효한 비밀번호가 된다는 뜻이기도 하다.
  // 관리자 콘솔 계정에는 적용하지 않는다 — passwordHash 를 잘못 채워 넣으면
  // 그 값을 아는 사람이 곧 관리자가 되기 때문이다.
  if (isAdminConsoleAccount(account?.id)) return false;
  if (storedHash === rawInput) return true;

  return false;
}

export function hashPassword(pw) { return _simpleHash(pw); }
