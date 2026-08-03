// ================================================================
// data-account.js — 계정 CRUD, 복구, 삭제
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDocs, collection,
  ADMIN_CONSOLE_ID, PERSONAL_ID, PERSONAL_LEGACY_ID,
} from './data-core.js';
import { isAdminConsoleAccount } from './account-unification.js';
import { getCurrentUser, isAdmin, setCurrentUser } from './data-auth.js';
import { invalidateFriendsCache } from './data-social-friends.js';
import { invalidateNotificationsCache, invalidateLikesScanCache } from './data-social-interact.js';

// ── _accounts 전역 스캔 TTL 캐시 (60s) ────────────────────────────
// renderHome 경로마다 getAccountList()가 반복 호출되며 _accounts 를 매번
// 풀스캔했다. cheers config 캐시(data-social-interact.js, TTL 10s)와 같은
// 패턴으로 스캔 결과 자체를 캐시하고, admin-console 필터는 호출마다 새로
// 적용한다. 쓰기 경로(saveAccount/deleteUserAccount, 그리고 data-social-log.js
// 의 로그인/튜토리얼/액션 로그 기록)가 성공하면 invalidateAccountListCache() 로
// 무효화하고, 계정 전환 시에는 data-api.js의 setCurrentUser 래퍼가 무효화한다.
const ACCOUNT_LIST_CACHE_TTL_MS = 60 * 1000;
let _accountListScanCache = null;
let _accountListScanCacheAt = 0;

export function invalidateAccountListCache() {
  _accountListScanCache = null;
  _accountListScanCacheAt = 0;
}

async function _readAllAccounts() {
  if (_accountListScanCache && (Date.now() - _accountListScanCacheAt) < ACCOUNT_LIST_CACHE_TTL_MS) {
    return _accountListScanCache;
  }
  try {
    const snap = await getDocs(collection(db, '_accounts'));
    const accounts = [];
    snap.forEach(d => accounts.push(d.data()));
    _accountListScanCache = accounts;
    _accountListScanCacheAt = Date.now();
    return accounts;
  } catch { return []; }
}

// 관리자 콘솔 계정은 사람이 아니라 운영 계정이다. 소셜·랭킹·길드·친구 목록은
// 모두 이 함수를 지나가므로, 여기서 한 번 걸러 두면 화면마다 다시 거를 필요가 없다.
export async function getAccountList() {
  const accounts = await _readAllAccounts();
  return accounts.filter((account) => !isAdminConsoleAccount(account?.id));
}

// 로그인 인증과 관리자 콘솔만 운영 계정을 포함한 원본 목록을 본다.
export async function getAccountListIncludingAdminConsole() {
  return _readAllAccounts();
}

// 프로필·길드 호출자는 세션이 잡아 둔 계정 스냅샷을 그대로 저장한다. 그 스냅샷은
// 로그인 이후 _accounts 에 merge 로 쌓인 lastLoginAt/tutorialDoneAt/actionLog
// (data-social-log.js) 를 갖고 있지 않으므로, 전체 덮어쓰기로 저장하면 그 필드들이
// 조용히 사라진다. merge 로 저장해 스냅샷에 없는 필드는 보존한다. 필드를 실제로
// 비우는 경로는 명시적으로 null 을 넣으므로 merge 에서도 그대로 지워진다.
export async function saveAccount(account) {
  await setDoc(doc(db, '_accounts', account.id), account, { merge: true });
  invalidateAccountListCache();
}

export async function refreshCurrentUserFromDB() {
  const expectedOwnerId = getCurrentUser()?.id;
  if (!expectedOwnerId) return;
  const accounts = await getAccountListIncludingAdminConsole();
  if (getCurrentUser()?.id !== expectedOwnerId) return;
  const fresh = accounts.find(a => a.id === expectedOwnerId);
  if (fresh) setCurrentUser(fresh);
}

export async function recoverDeletedAccounts() {
  try {
    const existing = await getAccountListIncludingAdminConsole();
    const existingIds = new Set(existing.map(a => a.id));
    const missingIds = new Set();

    const frSnap = await getDocs(collection(db, '_friend_requests'));
    frSnap.forEach(d => {
      const data = d.data();
      if (data.from && !existingIds.has(data.from)) missingIds.add(data.from);
      if (data.to && !existingIds.has(data.to))     missingIds.add(data.to);
    });

    const gbNameMap = {};
    const gbSnap = await getDocs(collection(db, '_guestbook'));
    gbSnap.forEach(d => {
      const data = d.data();
      if (data.from) {
        if (!existingIds.has(data.from)) missingIds.add(data.from);
        if (data.fromName) gbNameMap[data.from] = data.fromName;
      }
      if (data.to && !existingIds.has(data.to)) missingIds.add(data.to);
    });

    const lkSnap = await getDocs(collection(db, '_likes'));
    lkSnap.forEach(d => {
      const data = d.data();
      if (data.from && !existingIds.has(data.from)) missingIds.add(data.from);
      if (data.to && !existingIds.has(data.to))     missingIds.add(data.to);
    });

    const ntSnap = await getDocs(collection(db, '_notifications'));
    ntSnap.forEach(d => {
      const data = d.data();
      if (data.from && !existingIds.has(data.from)) missingIds.add(data.from);
      if (data.to && !existingIds.has(data.to))     missingIds.add(data.to);
    });

    missingIds.delete(PERSONAL_ID);
    missingIds.delete(PERSONAL_LEGACY_ID);
    missingIds.delete(ADMIN_CONSOLE_ID);

    let recovered = 0;
    for (const id of missingIds) {
      if (id.includes('(guest)')) continue;
      const parts = id.split('_');
      if (parts.length < 2) continue;
      const lastName = parts[0];
      const firstName = parts.slice(1).join('_');
      const savedName = gbNameMap[id] || '';
      const baseName = lastName + firstName;
      const account = {
        id,
        lastName,
        firstName,
        nickname: savedName || baseName,
        hasPassword: false,
        passwordHash: null,
        createdAt: Date.now(),
      };
      // 복구 스캔은 계정 목록을 읽은 뒤 실제 재생성과 경합할 수 있다. 그 사이에
      // 쌓인 필드를 스텁으로 통째로 덮지 않도록 merge 저장을 거친다.
      await saveAccount(account);
      recovered++;
      console.log('[recover] 계정 복구:', id, '별명:', account.nickname);
    }
    if (recovered > 0) console.log(`[recover] 총 ${recovered}개 계정 복구 완료`);
    return recovered;
  } catch(e) {
    console.warn('[recover] 계정 복구 실패:', e);
    return 0;
  }
}

export async function deleteUserAccount(userId) {
  if (!isAdmin()) throw new Error('관리자만 삭제 가능');
  if (userId === ADMIN_CONSOLE_ID) throw new Error('관리자 콘솔 계정은 삭제 불가');
  if (userId === PERSONAL_ID || userId === PERSONAL_LEGACY_ID) throw new Error('개인 계정은 삭제 불가');

  const USER_COLS = ['workouts','exercises','goals','quests','wines','cal_events','cooking',
    'body_checkins','nutrition_db','finance_benchmarks','finance_actuals','finance_loans',
    'finance_positions','finance_plans','finance_budgets','movies','tomato_cycles','settings'];
  for (const colName of USER_COLS) {
    try {
      const snap = await getDocs(collection(db, 'users', userId, colName));
      for (const d of snap.docs) await deleteDoc(doc(db, 'users', userId, colName, d.id));
    } catch(e) { console.warn(`[deleteUser] ${colName} 삭제 실패:`, e.message); }
  }

  const globalCols = [
    { name: '_friend_requests', fields: ['from','to'] },
    { name: '_guestbook',       fields: ['from','to'] },
    { name: '_comments',        fields: ['from','to'] },
    { name: '_likes',           fields: ['from','to'] },
    { name: '_notifications',   fields: ['to'] },
    { name: '_fcm_tokens',      fields: ['userId'] },
    { name: '_letters',         fields: ['from'] },
  ];
  for (const gc of globalCols) {
    try {
      const snap = await getDocs(collection(db, gc.name));
      for (const d of snap.docs) {
        const data = d.data();
        if (gc.fields.some(f => data[f] === userId)) {
          await deleteDoc(doc(db, gc.name, d.id));
        }
      }
    } catch(e) { console.warn(`[deleteUser] ${gc.name} 삭제 실패:`, e.message); }
  }
  // 위 루프가 _friend_requests/_likes/_notifications 에서도 문서를 지웠으므로
  // 해당 컬렉션들의 스캔 캐시(A2)도 함께 무효화한다.
  invalidateFriendsCache();
  invalidateLikesScanCache();
  invalidateNotificationsCache();

  await deleteDoc(doc(db, '_accounts', userId));
  invalidateAccountListCache();
  console.log(`[deleteUser] ${userId} 계정 및 데이터 완전 삭제 완료`);
}
