// ================================================================
// data.js
// ================================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc,
  collection, getDocs, enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { CONFIG, MUSCLES } from './config.js';
import { INITIAL_WINES }  from './wine-data.js';
import {
  calcDietMetrics  as _calcDietMetrics,
  isDietDaySuccess as _isDietDaySuccess,
  dietDayOk        as _dietDayOk,
  calcStreaks       as _calcStreaks,
  calcVolume       as _calcVolume,
  calcVolumeAll    as _calcVolumeAll,
  getVolumeHistory as _getVolumeHistory,
  getLastSession          as _getLastSession,
  getDayTargetKcal        as _getDayTargetKcal,
  calcExerciseCalorieCredit as _calcExerciseCalorieCredit,
} from './calc.js';

const app = initializeApp(CONFIG.FIREBASE);
const db  = getFirestore(app);

// Firebase IndexedDB 오프라인 캐싱 설정
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[data] 멀티탭 환경 감지 — 다른 탭의 대시보드를 닫아주세요');
  } else if (err.code === 'unimplemented') {
    console.warn('[data] 브라우저가 오프라인 캐시 미지원');
  } else {
    console.warn('[data] IndexedDB 초기화 실패:', err.code);
  }
});

// ── IndexedDB 백업 (모바일 localStorage 클리어 방지) ─────────────
const _IDB_NAME = 'dashboard3_session';
const _IDB_STORE = 'auth';

function _openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(_IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function _idbSet(key, value) {
  try {
    const db = await _openIDB();
    const tx = db.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).put(value, key);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
  } catch {}
}

async function _idbGet(key) {
  try {
    const db = await _openIDB();
    const tx = db.transaction(_IDB_STORE, 'readonly');
    const req = tx.objectStore(_IDB_STORE).get(key);
    const result = await new Promise((r, j) => { req.onsuccess = () => r(req.result); req.onerror = j; });
    db.close();
    return result;
  } catch { return null; }
}

async function _idbRemove(key) {
  try {
    const db = await _openIDB();
    const tx = db.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).delete(key);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    db.close();
  } catch {}
}

// ── 계정 시스템 ──────────────────────────────────────────────────
let _currentUser = null; // { id: 'kim_taewoo', lastName: '김', firstName: '태우', hasPassword: false }

export function getCurrentUser() { return _currentUser; }

// ── 역할 시스템 ──────────────────────────────────────────────────
const ADMIN_ID = '김_태우';
const ADMIN_GUEST_ID = '김_태우(guest)';

export function getAdminId() { return ADMIN_ID; }
export function getAdminGuestId() { return ADMIN_GUEST_ID; }

export function isAdmin() {
  return _currentUser?.id === ADMIN_ID;
}

// 김태우(Guest)는 admin의 데이터를 공유하되 게스트 UX를 사용
export function isAdminGuest() {
  return _currentUser?.id === ADMIN_GUEST_ID;
}

// 두 ID가 같은 인스턴스(admin + guest)인지 확인
export function isSameInstance(id1, id2) {
  if (id1 === id2) return true;
  const normalize = (id) => (id === ADMIN_GUEST_ID ? ADMIN_ID : id);
  return normalize(id1) === normalize(id2);
}

// 특정 ID가 admin 인스턴스(admin 또는 guest)에 속하는지 확인
export function isAdminInstance(id) {
  return id === ADMIN_ID || id === ADMIN_GUEST_ID;
}

// 데이터 경로용 ID (김태우(Guest) → 김태우(Admin)의 데이터 사용)
export function getDataOwnerId() {
  if (!_currentUser) return null;
  if (isAdminGuest()) return ADMIN_ID;
  return _currentUser.id;
}

// 게스트 계정 UX 설정 (admin은 이 설정 무시 → 모든 것이 보임)
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
  _currentUser = user;
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    _idbSet('currentUser', user);
  } else {
    localStorage.removeItem('currentUser');
    _idbRemove('currentUser');
    _idbRemove('admin_authenticated');
    _idbRemove('kim_authenticated'); // 레거시 키 정리
  }
}

export function loadSavedUser() {
  try {
    const saved = localStorage.getItem('currentUser');
    if (saved) { _currentUser = JSON.parse(saved); return _currentUser; }
  } catch {}
  return null;
}

// 관리자 인증 상태 IndexedDB 백업
export function backupAdminAuth() { _idbSet('admin_authenticated', true); }
export function clearAdminAuth() { _idbRemove('admin_authenticated'); }
// 하위 호환
export const backupKimAuth = backupAdminAuth;
export const clearKimAuth = clearAdminAuth;

// localStorage가 클리어된 경우 IndexedDB에서 복구
export async function restoreUserFromBackup() {
  if (_currentUser) return _currentUser; // 이미 로드됨
  try {
    const backup = await _idbGet('currentUser');
    if (backup) {
      _currentUser = backup;
      localStorage.setItem('currentUser', JSON.stringify(backup));
      // 관리자 인증 상태 복구 (kim_authenticated는 레거시 키, admin_authenticated는 신규 키)
      const adminAuth = await _idbGet('admin_authenticated') || await _idbGet('kim_authenticated');
      if (adminAuth) localStorage.setItem('admin_authenticated', 'true');
      return _currentUser;
    }
  } catch {}
  return null;
}

// localStorage 캐시를 Firebase 최신으로 갱신
export async function refreshCurrentUserFromDB() {
  if (!_currentUser) return;
  const accounts = await getAccountList();
  const fresh = accounts.find(a => a.id === _currentUser.id);
  if (fresh) {
    _currentUser = fresh;
    localStorage.setItem('currentUser', JSON.stringify(fresh));
  }
}

// 계정 목록 (Firestore의 _accounts 컬렉션)
export async function getAccountList() {
  try {
    const snap = await getDocs(collection(db, '_accounts'));
    const accounts = [];
    snap.forEach(d => accounts.push(d.data()));
    return accounts;
  } catch { return []; }
}

export async function saveAccount(account) {
  await setDoc(doc(db, '_accounts', account.id), account);
}

// 삭제된 계정 복구: _friend_requests, _guestbook, _likes, _notifications에서 ID 수집
export async function recoverDeletedAccounts() {
  try {
    const existing = await getAccountList();
    const existingIds = new Set(existing.map(a => a.id));
    const missingIds = new Set();

    // 1) _friend_requests에서 ID 수집
    const frSnap = await getDocs(collection(db, '_friend_requests'));
    frSnap.forEach(d => {
      const data = d.data();
      if (data.from && !existingIds.has(data.from)) missingIds.add(data.from);
      if (data.to && !existingIds.has(data.to))     missingIds.add(data.to);
    });

    // 2) _guestbook에서 ID + fromName 수집 (별명 복구용)
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

    // 3) _likes에서 ID 수집
    const lkSnap = await getDocs(collection(db, '_likes'));
    lkSnap.forEach(d => {
      const data = d.data();
      if (data.from && !existingIds.has(data.from)) missingIds.add(data.from);
      if (data.to && !existingIds.has(data.to))     missingIds.add(data.to);
    });

    // 4) _notifications에서 ID 수집
    const ntSnap = await getDocs(collection(db, '_notifications'));
    ntSnap.forEach(d => {
      const data = d.data();
      if (data.from && !existingIds.has(data.from)) missingIds.add(data.from);
      if (data.to && !existingIds.has(data.to))     missingIds.add(data.to);
    });

    // (guest) ID 제외, 관리자 관련은 이미 처리됨
    missingIds.delete(ADMIN_ID);
    missingIds.delete(ADMIN_GUEST_ID);

    // 5) 누락 계정 복구
    let recovered = 0;
    for (const id of missingIds) {
      if (id.includes('(guest)')) continue;
      // ID 형식: lastName_firstName (소문자)
      const parts = id.split('_');
      if (parts.length < 2) continue;
      const lastName = parts[0];
      const firstName = parts.slice(1).join('_');
      // 방명록에 저장된 fromName이 있으면 별명으로 사용
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
      await setDoc(doc(db, '_accounts', id), account);
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

// ── 사용자 삭제 (관리자 전용) ────────────────────────────────────
export async function deleteUserAccount(userId) {
  if (!isAdmin()) throw new Error('관리자만 삭제 가능');
  if (userId === ADMIN_ID || userId === ADMIN_GUEST_ID) throw new Error('관리자 계정은 삭제 불가');

  // 1) users/{userId} 하위 컬렉션 전체 삭제
  const USER_COLS = ['workouts','exercises','goals','quests','wines','cal_events','cooking',
    'body_checkins','nutrition_db','finance_benchmarks','finance_actuals','finance_loans',
    'finance_positions','finance_plans','finance_budgets','movies','tomato_cycles','settings'];
  for (const colName of USER_COLS) {
    try {
      const snap = await getDocs(collection(db, 'users', userId, colName));
      for (const d of snap.docs) await deleteDoc(doc(db, 'users', userId, colName, d.id));
    } catch(e) { console.warn(`[deleteUser] ${colName} 삭제 실패:`, e.message); }
  }

  // 2) 글로벌 컬렉션에서 해당 사용자 관련 문서 삭제
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

  // 3) _accounts에서 삭제
  await deleteDoc(doc(db, '_accounts', userId));
  console.log(`[deleteUser] ${userId} 계정 및 데이터 완전 삭제 완료`);
}

// 소셜 ID: AdminGuest는 Admin과 같은 소셜 ID 사용 (친구/알림 공유)
function _socialId() {
  if (!_currentUser) return null;
  if (isAdminGuest()) return ADMIN_ID;
  return _currentUser.id;
}
function _isMySocialId(id) {
  if (!_currentUser) return false;
  if (id === _currentUser.id) return true;
  if (isAdminGuest() && id === ADMIN_ID) return true;
  if (isAdmin() && id === ADMIN_GUEST_ID) return true;
  return false;
}

// ── 친구 시스템 ──────────────────────────────────────────────────

// 친구 요청 보내기
export async function sendFriendRequest(fromId, toId) {
  const reqId = `${fromId}_${toId}`;
  const existing = await _getFriendDoc(reqId);
  if (existing) return { error: '이미 요청했어요.' };
  // 역방향 체크
  const reverse = await _getFriendDoc(`${toId}_${fromId}`);
  if (reverse && reverse.status === 'accepted') return { error: '이미 이웃이에요.' };
  // 상대가 이미 요청을 보낸 경우 → 자동 수락
  if (reverse && reverse.status === 'pending') {
    await acceptFriendRequest(reverse.id);
    return { ok: true, autoAccepted: true };
  }

  await setDoc(doc(db, '_friend_requests', reqId), {
    id: reqId, from: fromId, to: toId, status: 'pending', createdAt: Date.now(),
  });
  // 상대에게 알림
  await sendNotification(toId, {
    type: 'friend_request', from: fromId, message: '이웃 요청을 보냈어요.',
  });
  return { ok: true };
}

// 친구 요청 수락
export async function acceptFriendRequest(reqId) {
  const reqDoc = await _getFriendDoc(reqId);
  if (!reqDoc) return;
  reqDoc.status = 'accepted';
  reqDoc.acceptedAt = Date.now();
  await setDoc(doc(db, '_friend_requests', reqId), reqDoc);
  // 요청자에게 알림
  await sendNotification(reqDoc.from, {
    type: 'friend_accepted', from: reqDoc.to, message: '이웃 요청을 수락했어요.',
  });
}

// 친구 요청 거절/삭제
export async function removeFriend(reqId) {
  await deleteDoc(doc(db, '_friend_requests', reqId));
}

// 내 친구 목록 가져오기
export async function getMyFriends() {
  if (!_currentUser) return [];
  const snap = await getDocs(collection(db, '_friend_requests'));
  const friends = [];
  const seen = new Set();
  snap.forEach(d => {
    const data = d.data();
    if (data.status === 'accepted') {
      let fid = null;
      if (_isMySocialId(data.from)) fid = data.to;
      else if (_isMySocialId(data.to)) fid = data.from;
      if (fid && !seen.has(fid)) {
        seen.add(fid);
        friends.push({ friendId: fid, reqId: data.id });
      }
    }
  });
  return friends;
}

// 받은 친구 요청 목록
export async function getPendingRequests() {
  if (!_currentUser) return [];
  const snap = await getDocs(collection(db, '_friend_requests'));
  const pending = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.status === 'pending' && _isMySocialId(data.to)) pending.push(data);
  });
  return pending;
}

async function _getFriendDoc(reqId) {
  try {
    const snap = await getDoc(doc(db, '_friend_requests', reqId));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// 친구의 데이터 읽기 (읽기 전용)
export async function getFriendData(friendId, colName) {
  try {
    const snap = await getDocs(collection(db, 'users', friendId, colName));
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return items;
  } catch { return []; }
}

export async function getFriendWorkout(friendId, dateKey) {
  try {
    const snap = await getDoc(doc(db, 'users', friendId, 'workouts', dateKey));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// ── 표시명 (이웃 여부에 따라 분기) ────────────────────────────────
export function getDisplayName(account, isFriend = false) {
  if (!account) return '익명';
  const fullName = account.lastName + account.firstName;
  const nick = account.nickname || fullName;
  if (isFriend) return `${fullName} (${nick})`;
  return nick;
}

// ── 글로벌 주간 랭킹 ─────────────────────────────────────────────
export async function getGlobalWeeklyRanking() {
  try {
    const snap = await getDoc(doc(db, '_weekly_ranking', 'current'));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// ── 방명록 시스템 ────────────────────────────────────────────────
export async function getGuestbook(targetUserId) {
  const snap = await getDocs(collection(db, '_guestbook'));
  const entries = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.to === targetUserId) entries.push(data);
  });
  entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return entries;
}

export async function writeGuestbook(targetUserId, message, parentId = null) {
  if (!_currentUser || !message.trim()) return { error: '메시지를 입력해주세요.' };
  const fromId = _socialId();
  const entryId = `gb_${fromId}_${targetUserId}_${Date.now()}`;
  const entry = {
    id: entryId, to: targetUserId, from: fromId,
    fromName: _currentUser.nickname || (_currentUser.lastName + _currentUser.firstName),
    message: message.trim(), createdAt: Date.now(),
    ...(parentId ? { parentId } : {}),
  };
  await setDoc(doc(db, '_guestbook', entryId), entry);
  // 상대에게 알림 (자기 자신이면 스킵)
  if (!_isMySocialId(targetUserId)) {
    await sendNotification(targetUserId, {
      type: 'guestbook', from: fromId,
      message: '방명록을 남겼어요 📝',
    });
  }
  return { ok: true };
}

export async function deleteGuestbookEntry(entryId) {
  await deleteDoc(doc(db, '_guestbook', entryId));
}

// ── 댓글 시스템 ──────────────────────────────────────────────────
export async function getComments(targetUserId, dateKey, section) {
  const snap = await getDocs(collection(db, '_comments'));
  const comments = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.to === targetUserId && data.dateKey === dateKey && data.section === section) {
      comments.push(data);
    }
  });
  comments.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return comments;
}

export async function writeComment(targetUserId, dateKey, section, message, parentId = null) {
  if (!_currentUser || !message.trim()) return { error: '메시지를 입력해주세요.' };
  const fromId = _socialId();
  const cmtId = `cmt_${fromId}_${targetUserId}_${Date.now()}`;
  const comment = {
    id: cmtId, to: targetUserId, from: fromId,
    fromName: _currentUser.nickname || (_currentUser.lastName + _currentUser.firstName),
    dateKey, section, message: message.trim(),
    parentId: parentId || null,
    createdAt: Date.now(), updatedAt: null,
  };
  await setDoc(doc(db, '_comments', cmtId), comment);
  // 알림 발송 (자기 자신 스킵)
  if (!_isMySocialId(targetUserId)) {
    await sendNotification(targetUserId, {
      type: parentId ? 'comment_reply' : 'comment',
      from: fromId, dateKey, section,
      message: parentId ? '댓글에 답글을 남겼어요 💬' : '댓글을 남겼어요 💬',
    });
  }
  // 대댓글인 경우 원댓글 작성자에게도 알림
  if (parentId) {
    try {
      const parentSnap = await getDoc(doc(db, '_comments', parentId));
      if (parentSnap.exists()) {
        const parentData = parentSnap.data();
        if (parentData.from !== fromId && !_isMySocialId(parentData.from) && parentData.from !== targetUserId) {
          await sendNotification(parentData.from, {
            type: 'comment_reply', from: fromId, dateKey, section,
            message: '댓글에 답글을 남겼어요 💬',
          });
        }
      }
    } catch(e) { console.warn('[comment] parent notif:', e); }
  }
  return { ok: true, comment };
}

export async function editComment(commentId, newMessage) {
  if (!_currentUser || !newMessage.trim()) return { error: '메시지를 입력해주세요.' };
  await setDoc(doc(db, '_comments', commentId), {
    message: newMessage.trim(), updatedAt: Date.now(),
  }, { merge: true });
  return { ok: true };
}

export async function deleteComment(commentId) {
  const snap = await getDocs(collection(db, '_comments'));
  const toDelete = [commentId];
  snap.forEach(d => {
    if (d.data().parentId === commentId) toDelete.push(d.id);
  });
  await Promise.all(toDelete.map(id => deleteDoc(doc(db, '_comments', id))));
}

// ── 친구 소개 시스템 ─────────────────────────────────────────────
export async function introduceFriend(friendAId, friendBId, friendAName, friendBName) {
  if (!_currentUser) return { error: '로그인이 필요해요.' };
  const myName = _currentUser.lastName + _currentUser.firstName;
  // A에게: "OO님이 B를 소개해줬어요"
  await sendNotification(friendAId, {
    type: 'introduce', from: _socialId(),
    message: `${friendBName}님을 소개받았어요! 이웃이 되어보세요.`,
    introducedId: friendBId, introducedName: friendBName,
  });
  // B에게: "OO님이 A를 소개해줬어요"
  await sendNotification(friendBId, {
    type: 'introduce', from: _socialId(),
    message: `${friendAName}님을 소개받았어요! 이웃이 되어보세요.`,
    introducedId: friendAId, introducedName: friendAName,
  });
  return { ok: true };
}

// ── 활동 추적 (관리자 대시보드용) ────────────────────────────────
export async function recordLogin() {
  if (!_currentUser?.id) return;
  const uid = _currentUser.id;
  try {
    await setDoc(doc(db, '_accounts', uid), { lastLoginAt: Date.now() }, { merge: true });
  } catch(e) { console.warn('[track] login:', e); }
}

// ── FCM 토큰 관리 ──────────────────────────────────────────────────
export async function saveFcmToken(token) {
  if (!_currentUser || !token) return;
  const userId = _socialId();
  const tokenHash = _simpleHash(token);
  const docId = `${userId}_${tokenHash}`;
  await setDoc(doc(db, '_fcm_tokens', docId), {
    userId, token, updatedAt: Date.now(),
  });
}

export async function removeFcmToken(token) {
  if (!_currentUser || !token) return;
  const userId = _socialId();
  const tokenHash = _simpleHash(token);
  const docId = `${userId}_${tokenHash}`;
  await deleteDoc(doc(db, '_fcm_tokens', docId));
}

export async function recordTutorialDone() {
  if (!_currentUser?.id) return;
  const uid = _currentUser.id;
  try {
    await setDoc(doc(db, '_accounts', uid), { tutorialDoneAt: Date.now() }, { merge: true });
  } catch(e) { console.warn('[track] tutorial:', e); }
}

export async function markPatchnoteRead(patchnoteId) {
  if (!_currentUser) return;
  try {
    const pnDoc = await getDoc(doc(db, '_patchnotes', patchnoteId));
    if (!pnDoc.exists()) return;
    const data = pnDoc.data();
    const readBy = data.readBy || [];
    const uid = _currentUser.id;
    if (!readBy.includes(uid)) {
      readBy.push(uid);
      await setDoc(doc(db, '_patchnotes', patchnoteId), { readBy }, { merge: true });
    }
  } catch(e) { console.warn('[track] patchnote read:', e); }
}

export async function recordAction(action) {
  if (!_currentUser?.id) return;
  const uid = _currentUser.id;
  try {
    const accDoc = await getDoc(doc(db, '_accounts', uid));
    const data = accDoc.exists() ? accDoc.data() : {};
    const log = (data.actionLog || []).slice(-29); // 최근 30개만 유지
    log.push({ action, at: Date.now() });
    await setDoc(doc(db, '_accounts', uid), { actionLog: log }, { merge: true });
  } catch(e) { console.warn('[track] action:', e); }
}

// ── 알림 시스템 ──────────────────────────────────────────────────

export async function sendNotification(toUserId, data) {
  const notifId = `${toUserId}_${Date.now()}`;
  await setDoc(doc(db, '_notifications', notifId), {
    id: notifId, to: toUserId, read: false, createdAt: Date.now(), ...data,
  });
}

export async function getMyNotifications() {
  if (!_currentUser) return [];
  const snap = await getDocs(collection(db, '_notifications'));
  const notifs = [];
  snap.forEach(d => {
    const data = d.data();
    if (_isMySocialId(data.to)) notifs.push(data);
  });
  notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return notifs;
}

export async function markNotificationRead(notifId) {
  await setDoc(doc(db, '_notifications', notifId), { read: true }, { merge: true });
}

// ── 운영자 공지 ──────────────────────────────────────────────────
export async function sendAnnouncement(title, body) {
  if (!_currentUser) return { error: '로그인 필요' };
  const fromId = _socialId();
  const accounts = await getAccountList();
  for (const acc of accounts) {
    if (acc.id === fromId || acc.id.includes('(guest)')) continue;
    await sendNotification(acc.id, {
      type: 'announcement', from: fromId,
      title, body,
      message: `📢 ${title}`,
    });
  }
  return { ok: true };
}

// 좋아요
export async function toggleLike(targetUserId, dateKey, field, emoji) {
  // field: 'workout' | 'meal_breakfast' | 'meal_lunch' 등
  if (!_currentUser) return;
  const fromId = _socialId();
  const likeId = `${fromId}_${targetUserId}_${dateKey}_${field}`;
  const likeDoc = doc(db, '_likes', likeId);
  const snap = await getDoc(likeDoc);
  // 레거시 호환: _currentUser.id로 저장된 문서가 있으면 삭제 후 _socialId 기준으로 재생성
  if (!snap.exists() && fromId !== _currentUser.id) {
    const legacyId = `${_currentUser.id}_${targetUserId}_${dateKey}_${field}`;
    const legacySnap = await getDoc(doc(db, '_likes', legacyId)).catch(() => null);
    if (legacySnap?.exists()) {
      await deleteDoc(doc(db, '_likes', legacyId));
      // 레거시 문서를 새 ID로 마이그레이션
      await setDoc(likeDoc, { ...legacySnap.data(), id: likeId, from: fromId });
      return true;
    }
  }
  if (snap.exists()) {
    if (emoji && snap.data().emoji !== emoji) {
      // 이모지 변경
      await setDoc(likeDoc, { ...snap.data(), emoji }, { merge: true });
      return true;
    }
    await deleteDoc(likeDoc);
    return false; // unlike
  } else {
    await setDoc(likeDoc, {
      id: likeId, from: fromId, to: targetUserId,
      dateKey, field, emoji: emoji || '👏', createdAt: Date.now(),
    });
    // 상대에게 알림 (자기 자신이면 스킵)
    if (!_isMySocialId(targetUserId)) {
      await sendNotification(targetUserId, {
        type: 'like', from: fromId, dateKey, field,
        message: `${emoji || '👏'} 리액션을 보냈어요.`,
      });
    }
    return true; // liked
  }
}

export async function getCheerStatus(friendId, dk) {
  if (!_currentUser) return { iSent: false, theyCheerd: false };
  const myId = _socialId();
  const checks = [
    getDoc(doc(db, '_likes', `${myId}_${friendId}_${dk}_cheer`)).catch(() => null),
    getDoc(doc(db, '_likes', `${friendId}_${myId}_${dk}_cheer`)).catch(() => null),
  ];
  // 레거시 호환: _currentUser.id가 _socialId()와 다를 경우 레거시 ID도 조회
  if (myId !== _currentUser.id) {
    checks.push(getDoc(doc(db, '_likes', `${_currentUser.id}_${friendId}_${dk}_cheer`)).catch(() => null));
    checks.push(getDoc(doc(db, '_likes', `${friendId}_${_currentUser.id}_${dk}_cheer`)).catch(() => null));
  }
  const results = await Promise.all(checks);
  const iSent = !!results[0]?.exists() || !!results[2]?.exists();
  const theyCheerd = !!results[1]?.exists() || !!results[3]?.exists();
  return { iSent, theyCheerd };
}

export async function getLikes(targetUserId, dateKey) {
  try {
    const snap = await getDocs(collection(db, '_likes'));
    const likes = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.to === targetUserId && data.dateKey === dateKey) likes.push(data);
    });
    return likes;
  } catch { return []; }
}

// 비밀번호 검증 (단순 해시 비교)
export function verifyPassword(account, input) {
  if (!account.hasPassword || !account.passwordHash) return true;
  return _simpleHash(input) === account.passwordHash;
}

export function hashPassword(pw) { return _simpleHash(pw); }

function _simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

// 컬렉션 경로: users/{userId}/{collectionName}
function _col(name) {
  const ownerId = getDataOwnerId();
  if (!ownerId) {
    console.warn('[data] _col called without user! collection:', name);
    return collection(db, '_orphan', name);
  }
  return collection(db, 'users', ownerId, name);
}
function _doc(name, id) {
  const ownerId = getDataOwnerId();
  if (!ownerId) {
    console.warn('[data] _doc called without user! doc:', name, id);
    return doc(db, '_orphan', name, id);
  }
  return doc(db, 'users', ownerId, name, id);
}

// 기존 데이터 마이그레이션 (루트 → users/kim_taewoo/)
export async function migrateDataToUser(userId) {
  const COLLECTIONS = ['workouts','exercises','goals','quests','wines','cal_events','cooking',
    'body_checkins','nutrition_db','finance_benchmarks','finance_actuals','finance_loans',
    'finance_positions','finance_plans','finance_budgets','settings'];

  console.log(`[migrate] ${userId}로 데이터 마이그레이션 시작...`);
  for (const colName of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      let count = 0;
      for (const d of snap.docs) {
        await setDoc(doc(db, 'users', userId, colName, d.id), d.data());
        count++;
      }
      if (count > 0) console.log(`  [migrate] ${colName}: ${count}건`);
    } catch (e) {
      console.warn(`  [migrate] ${colName} 실패:`, e.message);
    }
  }
  console.log('[migrate] 완료');
}

let _cache        = {};
let _exList       = [];
let _goals        = [];
let _wines        = [];
let _quests       = [];
let _events       = []; // 월간기록 캘린더 이벤트
let _cooking      = []; // 요리 실험 기록
let _bodyCheckins = []; // 주간 체크인 [{id, date, weight, bodyFatPct}]
let _nutritionDB  = []; // 나만의 영양 DB [{id, name, unit, kcal, carbs, protein, fat, note}]
let _movies       = {}; // 영화 데이터 {year-month: [{date, title, tags}]}

// ── 재무 데이터 ──
let _finBenchmarks = [];
let _finActuals    = [];
let _finLoans      = [];
let _finPositions  = [];
let _finPlans      = []; // 계획실적 [{id, name, entries: [{year, target}]}]
let _finBudgets    = []; // 가계부 [{id, year, groups: [{name, items: [{name, target, qGoals:{1:n,...}, months:{1:n,...}}]}]}]

// ── 설정 캐시 (Firebase settings 컬렉션) ────────────────────────
const DEFAULT_TAB_ORDER = ['home','workout','cooking','monthly','calendar','wine','movie','stats','finance','dev'];
const DEFAULT_VISIBLE_TABS = ['home','diet','workout','stats']; // 기본 사용자: 홈, 식단, 운동, 통계

const DEFAULT_DIET_PLAN = {
  // 신체 정보 (null = 미입력 → 설정 안내 표시)
  height: null, weight: null, bodyFatPct: null, age: null,
  // 목표
  targetWeight: null, targetBodyFatPct: null,
  // 운동과학 파라미터
  activityFactor: 1.3,
  lossRatePerWeek: 0.009,
  refeedKcal: 5000,
  refeedDays: [0, 6],
  startDate: null,
  // ── 고급 모드 ──
  advancedMode: false,
  // 매크로 비율 (데피싯 데이, %)
  deficitProteinPct: 41,
  deficitCarbPct: 50,
  deficitFatPct: 9,
  // 매크로 비율 (리피드 데이, %)
  refeedProteinPct: 29,
  refeedCarbPct: 60,
  refeedFatPct: 11,
  // 허용 오차 (kcal)
  dietTolerance: 50,
  // 운동 칼로리 크레딧
  exerciseCalorieCredit: false,
  exerciseKcalGym: 250,
  exerciseKcalCF: 300,
  exerciseKcalSwimming: 200,
  exerciseKcalRunning: 250,
};

let _dietPlan = { ...DEFAULT_DIET_PLAN };

let _settings = {
  quest_order:      ['quarterly','monthly','weekly','daily'],
  section_titles:   {},
  stock_purchases:  {},
  mini_memo_items:  [],   // [{id, text, checked}]
  weekly_memos:     {},
  tab_order:        DEFAULT_TAB_ORDER,
  visible_tabs:     null, // null = 아직 설정 안 됨 → 로그인 시 기본값 적용
  diet_plan:        null,
  streak_settings:  {
    fontSizeMode: 'default',  // 'small' | 'default' | 'large'
    cellWidthMode: 'default'  // 'small' | 'default' | 'large'
  },
  home_streak_days: 6,
  unit_goal_start: null,
  calendar_rows: null,  // null = 기본값 사용, [{id:'gym',label:'헬스',emoji:'🏋️'}, ...]
  tomato_state: { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 },
  milestone_shown: {},     // { workout_7: true, diet_30: true, ... }
  streak_freezes: [],      // [{ date, type, usedAt }]
};

function _setSyncStatus(state) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + state;
  txt.textContent = { ok:'동기화됨', syncing:'저장 중...', err:'오프라인 — 로컬 저장 후 자동 재시도' }[state] || state;
}

// Firebase 작업 래퍼 — 에러 핸들링 + 싱크 상태 일관 관리
async function _fbOp(label, fn, { sync = true, rethrow = false } = {}) {
  if (sync) _setSyncStatus('syncing');
  try {
    const result = await fn();
    if (sync) _setSyncStatus('ok');
    return result;
  } catch (e) {
    if (sync) _setSyncStatus('err');
    console.error(`[data] ${label}:`, e);
    if (rethrow) throw e;
  }
}

// ── 설정 Firebase 저장 헬퍼 ──────────────────────────────────────
async function _saveSetting(key, value) {
  _settings[key] = value;
  return _fbOp(`saveSetting(${key})`, () => setDoc(_doc('settings', key), { value }));
}

// ── localStorage 마이그레이션 헬퍼 ───────────────────────────────
function _migrateFromLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch { return fallback; }
}

export async function loadAll() {
  try {
    // admin 계정만: 데이터가 비어있으면 루트에서 1회 마이그레이션
    if (_currentUser && isAdmin()) {
      const migrateKey = `migrated_${_currentUser.id}`;
      const migrated = localStorage.getItem(migrateKey) || localStorage.getItem('migrated_김_태우');
      if (!migrated) {
        const testSnap = await getDocs(_col('workouts'));
        if (testSnap.empty) {
          const rootSnap = await getDocs(collection(db, 'workouts'));
          if (!rootSnap.empty) {
            console.log(`[loadAll] ${_currentUser.id} 마이그레이션 실행`);
            await migrateDataToUser(_currentUser.id);
          }
        }
        localStorage.setItem(migrateKey, 'done');
      }
    }

    // ── 모든 Firestore 쿼리를 병렬로 실행 ──
    const [snap, exSnap, goalSnap, wineSnap, questSnap, eventSnap,
           cookSnap, checkinSnap, nutritionSnap,
           finBenchSnap, finActSnap, finLoanSnap, finPosSnap, finPlanSnap, finBudgetSnap,
           movieSnap, tomatoSnap, settingsSnap] = await Promise.all([
      getDocs(_col('workouts')),
      getDocs(_col('exercises')),
      getDocs(_col('goals')),
      getDocs(_col('wines')),
      getDocs(_col('quests')),
      getDocs(_col('cal_events')),
      getDocs(_col('cooking')),
      getDocs(_col('body_checkins')),
      getDocs(_col('nutrition_db')),
      getDocs(_col('finance_benchmarks')),
      getDocs(_col('finance_actuals')),
      getDocs(_col('finance_loans')),
      getDocs(_col('finance_positions')),
      getDocs(_col('finance_plans')),
      getDocs(_col('finance_budgets')),
      getDocs(_col('movies')),
      getDocs(_col('tomato_cycles')),
      getDocs(_col('settings')),
    ]);

    snap.forEach(d => { _cache[d.id] = d.data(); });

    const custom = [];
    exSnap.forEach(d => custom.push(d.data()));
    const customIds = new Set(custom.map(e => e.id));
    const defaults  = CONFIG.DEFAULT_EXERCISES.filter(e => !customIds.has(e.id));
    _exList = _sortExList([...defaults, ...custom]);

    _goals = [];
    goalSnap.forEach(d => _goals.push(d.data()));

    _wines = [];
    wineSnap.forEach(d => _wines.push(d.data()));
    // 관리자만 초기 와인 데이터 삽입 (다른 계정은 빈 상태로 시작)
    if (_wines.length === 0 && isAdmin()) {
      for (const wine of INITIAL_WINES) await setDoc(_doc('wines', wine.id), wine);
      _wines = [...INITIAL_WINES];
    }

    _quests = [];
    questSnap.forEach(d => _quests.push(d.data()));

    _events = [];
    eventSnap.forEach(d => _events.push(d.data()));

    _cooking = [];
    cookSnap.forEach(d => _cooking.push(d.data()));

    _bodyCheckins = [];
    checkinSnap.forEach(d => _bodyCheckins.push(d.data()));

    _nutritionDB = [];
    nutritionSnap.forEach(d => _nutritionDB.push(d.data()));
    // 음식 DB가 비어있으면 김태우(관리자) DB에서 복사 (백그라운드)
    if (_nutritionDB.length === 0 && !isAdmin() && !isAdminGuest()) {
      getDocs(collection(db, 'users', ADMIN_ID, 'nutrition_db')).then(sharedSnap => {
        const sharedItems = [];
        sharedSnap.forEach(d => sharedItems.push(d.data()));
        if (sharedItems.length > 0) {
          _nutritionDB = sharedItems;
          Promise.all(sharedItems.map(item => setDoc(_doc('nutrition_db', item.id), item)))
            .catch(e => console.warn('[data] 영양DB 복사 실패:', e.message));
        }
      }).catch(e => console.warn('[data] 관리자 영양DB 로드 실패:', e.message));
    }

    // ── 재무 데이터 처리 ──
    _finBenchmarks = [];
    finBenchSnap.forEach(d => _finBenchmarks.push(d.data()));

    // 새 계정: 기본 벤치마크 샘플 자동 생성
    if (_finBenchmarks.length === 0 && _currentUser) {
      const curYear = new Date().getFullYear();
      const defaultBench = {
        id: 'bench_default_1',
        name: '연 8% 복리 (매년 1,000만원 저축)',
        initialPrincipal: 1000,      // 만원 단위: 1,000만원
        annualRate: 8,
        annualContribution: 1000,    // 만원 단위: 1,000만원/년
        inflationRate: 2.5,
        startYear: curYear,
        periodYears: 30,
      };
      await setDoc(_doc('finance_benchmarks', defaultBench.id), defaultBench);
      _finBenchmarks.push(defaultBench);
    }
    // 기존 잘못된 벤치마크 교정 (years→periodYears, startAge→startYear)
    for (const b of _finBenchmarks) {
      if (b.years && !b.periodYears) { b.periodYears = b.years; delete b.years; }
      if (b.startAge && !b.startYear) { b.startYear = new Date().getFullYear(); delete b.startAge; }
      if (b.initialPrincipal > 100000) { b.initialPrincipal = Math.round(b.initialPrincipal / 10000); } // 원→만원 변환
      if (b.annualContribution > 100000) { b.annualContribution = Math.round(b.annualContribution / 10000); }
    }

    _finActuals = [];
    finActSnap.forEach(d => _finActuals.push(d.data()));

    _finLoans = [];
    finLoanSnap.forEach(d => _finLoans.push(d.data()));

    _finPositions = [];
    finPosSnap.forEach(d => _finPositions.push(d.data()));

    _finPlans = [];
    finPlanSnap.forEach(d => _finPlans.push(d.data()));

    _finBudgets = [];
    finBudgetSnap.forEach(d => _finBudgets.push(d.data()));

    // ── 영화 데이터 처리 ──
    _movies = {};
    movieSnap.forEach(d => {
      const data = d.data();
      _movies[d.id] = data;
    });

    // ── 토마토 사이클 처리 ──
    _tomatoCycles = [];
    tomatoSnap.forEach(d => _tomatoCycles.push(d.data()));
    const fbMap = {};
    settingsSnap.forEach(d => { fbMap[d.id] = d.data().value; });

    _settings.quest_order    = fbMap.quest_order    ?? _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = fbMap.section_titles ?? _migrateFromLS('section_titles', {});
    _settings.stock_purchases= fbMap.stock_purchases?? _migrateFromLS('stock_purchases', {});
    _settings.mini_memo_items= fbMap.mini_memo_items?? [];
    _settings.weekly_memos   = fbMap.weekly_memos   ?? _migrateFromLS('weekly_memos',   {});
    _settings.tab_order      = fbMap.tab_order      ?? DEFAULT_TAB_ORDER;
    _settings.visible_tabs   = fbMap.visible_tabs   ?? null;
    _settings.diet_plan = fbMap.diet_plan ?? null;
    // 김태우 다이어트 플랜 복원 (삭제된 경우 1회, Admin/Guest 공유)
    if ((isAdmin() || isAdminGuest()) && !_settings.diet_plan) {
      const restored = localStorage.getItem('diet_restored_admin');
      if (!restored) {
        _settings.diet_plan = {
          height: 175, weight: 75, bodyFatPct: 17, age: 32,
          targetWeight: 68, targetBodyFatPct: 8,
          activityFactor: 1.3, lossRatePerWeek: 0.009,
          refeedKcal: 5000, refeedDays: [0, 6], startDate: null,
        };
        setDoc(_doc('settings', 'diet_plan'), { value: _settings.diet_plan }).catch(e => console.warn('[data] 식단 설정 저장 실패:', e.message));
        localStorage.setItem('diet_restored_admin', 'done');
      }
    }
    _settings.streak_settings= fbMap.streak_settings ?? { fontSizeMode: 'default', cellWidthMode: 'default' };
    _settings.home_streak_days = fbMap.home_streak_days ?? 6;
    _settings.unit_goal_start  = fbMap.unit_goal_start  ?? null;
    _settings.calendar_rows    = fbMap.calendar_rows    ?? null;
    _settings.tomato_state     = fbMap.tomato_state     ?? { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
    _settings.farm_state       = fbMap.farm_state       ?? null;
    if (_settings.diet_plan) Object.assign(_dietPlan, _settings.diet_plan);

    // localStorage 데이터를 Firebase로 마이그레이션 (최초 1회)
    for (const key of ['quest_order','section_titles','stock_purchases','weekly_memos']) {
      if (!fbMap[key] && JSON.stringify(_settings[key]) !== JSON.stringify(
          key === 'quest_order' ? ['quarterly','monthly','weekly','daily'] : {}
      )) {
        await setDoc(_doc('settings', key), { value: _settings[key] }).catch(e => console.warn(`[data] 설정(${key}) 마이그레이션 실패:`, e.message));
      }
    }

    _setSyncStatus('ok');
  } catch(e) {
    _setSyncStatus('err');
    console.error('[data] loadAll:', e);
    _exList = [...CONFIG.DEFAULT_EXERCISES];
    // localStorage 폴백
    _settings.quest_order    = _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = _migrateFromLS('section_titles', {});
    _settings.stock_purchases= _migrateFromLS('stock_purchases', {});
    _settings.weekly_memos   = _migrateFromLS('weekly_memos',   {});
  }
}

export async function saveDay(key, data) {
  const isEmpty = !data || (
    !data.exercises?.length && !data.cf && !data.memo &&
    !data.breakfast && !data.lunch && !data.dinner &&
    !data.gym_skip && !data.gym_health &&
    !data.cf_skip  && !data.cf_health &&
    !data.stretching && !data.wine_free &&
    !data.breakfast_skipped && !data.lunch_skipped && !data.dinner_skipped &&
    !data.bKcal && !data.lKcal && !data.dKcal && !data.sKcal &&
    !data.bFoods?.length && !data.lFoods?.length && !data.dFoods?.length && !data.sFoods?.length &&
    !data.bPhoto && !data.lPhoto && !data.dPhoto && !data.sPhoto && !data.workoutPhoto
  );
  // 사진 데이터가 너무 크면 자동 제거하여 1MB 제한 방지
  if (!isEmpty) {
    const json = JSON.stringify(data);
    if (json.length > 900000) {
      console.warn('[data] 문서 크기 초과 위험 (' + Math.round(json.length/1024) + 'KB) — 사진 품질 축소');
      const photoKeys = ['bPhoto','lPhoto','dPhoto','sPhoto','workoutPhoto'];
      for (const pk of photoKeys) {
        if (data[pk] && data[pk].length > 100000) {
          // 기존 사진을 더 작게 재압축
          try {
            const img = new Image();
            const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            img.src = data[pk];
            await loaded;
            const c = document.createElement('canvas');
            const MAX = 320;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
              else { w = Math.round(w * MAX / h); h = MAX; }
            }
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            data[pk] = c.toDataURL('image/jpeg', 0.4);
          } catch { data[pk] = null; }
        }
      }
    }
  }
  return _fbOp('saveDay', async () => {
    if (isEmpty) { delete _cache[key]; await deleteDoc(_doc('workouts', key)); }
    else { _cache[key] = data; await setDoc(_doc('workouts', key), data); }
  });
}

export async function saveExercise(ex) {
  return _fbOp('saveExercise', async () => {
    await setDoc(_doc('exercises', ex.id), ex);
    const idx = _exList.findIndex(e => e.id === ex.id);
    if (idx >= 0) _exList[idx] = ex; else _exList.push(ex);
    _exList = _sortExList(_exList);
  }, { sync: false });
}

export async function deleteExercise(id) {
  return _fbOp('deleteExercise', async () => {
    await deleteDoc(_doc('exercises', id));
    _exList = _exList.filter(e => e.id !== id);
  }, { sync: false });
}

// ── CRUD 팩토리 — 반복 패턴 제거 ─────────────────────────────────
function _createCRUD(collectionName, getArray, setArray) {
  return {
    save: (item) => _fbOp(`save:${collectionName}`, async () => {
      await setDoc(_doc(collectionName, item.id), item);
      const arr = getArray();
      const idx = arr.findIndex(x => x.id === item.id);
      if (idx >= 0) arr[idx] = item; else arr.push(item);
    }, { sync: false }),
    delete: (id) => _fbOp(`delete:${collectionName}`, async () => {
      await deleteDoc(_doc(collectionName, id));
      setArray(getArray().filter(x => x.id !== id));
    }, { sync: false }),
    get: () => getArray(),
  };
}

const _goalsCRUD   = _createCRUD('goals',      () => _goals,   v => { _goals = v; });
const _questsCRUD  = _createCRUD('quests',     () => _quests,  v => { _quests = v; });
const _winesCRUD   = _createCRUD('wines',      () => _wines,   v => { _wines = v; });
const _eventsCRUD  = _createCRUD('cal_events', () => _events,  v => { _events = v; });
const _cookingCRUD = _createCRUD('cooking',    () => _cooking, v => { _cooking = v; });

export const saveGoal    = (goal)  => _goalsCRUD.save(goal);
export const deleteGoal  = (id)    => _goalsCRUD.delete(id);
export const getGoals    = ()      => _goals;

export const saveQuest   = (quest) => _questsCRUD.save(quest);
export const deleteQuest = (id)    => _questsCRUD.delete(id);
export const getQuests   = ()      => _quests;

export const saveWine    = (wine)  => _winesCRUD.save(wine);
export const deleteWine  = (id)    => _winesCRUD.delete(id);
export const getWines    = ()      => _wines;

export const saveEvent   = (ev)    => _eventsCRUD.save(ev);
export async function deleteEvent(id) {
  try {
    await _fbOp('delete:cal_events', async () => {
      await deleteDoc(_doc('cal_events', id));
      _events = _events.filter(e => e.id !== id);
    }, { sync: false, rethrow: true });
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}
export const getEvents   = ()      => _events;

export const saveCooking   = (record) => _cookingCRUD.save(record);
export const deleteCooking = (id)     => _cookingCRUD.delete(id);

export const getCookingRecords  = () => _cooking;
export const getCookingForDate  = (dateStr) => _cooking.filter(c => c.date === dateStr);

// ── 레시피 참조 식단 검색 (소급 업데이트용) ──────────────────────────
export function findDietEntriesByRecipeId(recipeId) {
  const results = [];
  for (const [key, day] of Object.entries(_cache)) {
    for (const mealKey of ['bFoods', 'lFoods', 'dFoods', 'sFoods']) {
      const foods = day[mealKey] || [];
      foods.forEach((food, idx) => {
        if (food.recipeId === recipeId) {
          results.push({ dateKey: key, mealKey, foodIndex: idx, food, day });
        }
      });
    }
  }
  return results;
}

// ── 체크인 (무제한) ───────────────────────────────────────────────
// ── 재무 CRUD ────────────────────────────────────────────────────
const _finBenchCRUD = _createCRUD('finance_benchmarks', () => _finBenchmarks, v => { _finBenchmarks = v; });
const _finActCRUD   = _createCRUD('finance_actuals',    () => _finActuals,    v => { _finActuals = v; });
const _finLoanCRUD  = _createCRUD('finance_loans',      () => _finLoans,      v => { _finLoans = v; });
const _finPosCRUD   = _createCRUD('finance_positions',  () => _finPositions,  v => { _finPositions = v; });

export const saveFinBenchmark   = (b) => _finBenchCRUD.save(b);
export const deleteFinBenchmark = (id) => _finBenchCRUD.delete(id);
export const getFinBenchmarks   = () => _finBenchmarks;

export const saveFinActual   = (a) => _finActCRUD.save(a);
export const deleteFinActual = (id) => _finActCRUD.delete(id);
export const getFinActuals   = () => [..._finActuals].sort((a, b) => a.year - b.year);

export const saveFinLoan   = (l) => _finLoanCRUD.save(l);
export const deleteFinLoan = (id) => _finLoanCRUD.delete(id);
export const getFinLoans   = () => _finLoans;

export const saveFinPosition   = (p) => _finPosCRUD.save(p);
export const deleteFinPosition = (id) => _finPosCRUD.delete(id);
export const getFinPositions   = () => _finPositions;

const _finPlanCRUD = _createCRUD('finance_plans', () => _finPlans, v => { _finPlans = v; });
export const saveFinPlan   = (p) => _finPlanCRUD.save(p);
export const deleteFinPlan = (id) => _finPlanCRUD.delete(id);
export const getFinPlans   = () => _finPlans;

const _finBudgetCRUD = _createCRUD('finance_budgets', () => _finBudgets, v => { _finBudgets = v; });
export const saveFinBudget   = (b) => _finBudgetCRUD.save(b);
export const deleteFinBudget = (id) => _finBudgetCRUD.delete(id);
export const getFinBudgets   = () => _finBudgets;

// ── 환율 (Frankfurter API, 키 불필요) ─────────────────────────────
const FX_CACHE_KEY = 'fx_usd_krw';
const FX_TIME_KEY  = 'fx_usd_krw_time';
const FX_CACHE_HOURS = 8;

export async function fetchExchangeRate() {
  const now = Date.now();
  const last = parseInt(localStorage.getItem(FX_TIME_KEY) || '0');
  if ((now - last) < FX_CACHE_HOURS * 3600000) {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) return parseFloat(cached);
  }
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=KRW');
    const data = await res.json();
    const rate = data.rates?.KRW;
    if (rate) {
      localStorage.setItem(FX_CACHE_KEY, String(rate));
      localStorage.setItem(FX_TIME_KEY, String(now));
      return rate;
    }
  } catch (e) {
    console.warn('[data] 환율 fetch 실패:', e.message);
  }
  const cached = localStorage.getItem(FX_CACHE_KEY);
  return cached ? parseFloat(cached) : 1450; // fallback
}

// ── Fear & Greed Index ────────────────────────────────────────────
const FNG_CACHE_KEY  = 'fng_data';
const FNG_TIME_KEY   = 'fng_time';
const FNG_CACHE_HOURS = 4;

export async function fetchFearGreed() {
  const now = Date.now();
  const last = parseInt(localStorage.getItem(FNG_TIME_KEY) || '0');
  if ((now - last) < FNG_CACHE_HOURS * 3600000) {
    const cached = localStorage.getItem(FNG_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }
  // 1차: CNN 직접 (CORS 실패 가능)
  try {
    const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    if (res.ok) {
      const data = await res.json();
      const score = Math.round(data?.fear_and_greed?.score ?? 0);
      const rating = data?.fear_and_greed?.rating ?? '';
      const result = { score, rating, source: 'cnn' };
      localStorage.setItem(FNG_CACHE_KEY, JSON.stringify(result));
      localStorage.setItem(FNG_TIME_KEY, String(now));
      return result;
    }
  } catch {}
  // 2차: api-server 프록시
  try {
    const res = await fetch('/api/fear-greed');
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(FNG_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(FNG_TIME_KEY, String(now));
      return data;
    }
  } catch {}
  const cached = localStorage.getItem(FNG_CACHE_KEY);
  return cached ? JSON.parse(cached) : { score: null, rating: '', source: 'none' };
}

const _checkinCRUD = _createCRUD('body_checkins', () => _bodyCheckins, v => { _bodyCheckins = v; });
export const saveBodyCheckin   = (rec) => _checkinCRUD.save(rec);
export const deleteBodyCheckin = (id)  => _checkinCRUD.delete(id);
export const getBodyCheckins = () => [..._bodyCheckins].sort((a,b) => (a.date||'').localeCompare(b.date||''));

// ── 나만의 영양 DB ────────────────────────────────────────────────
function _generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

export async function saveNutritionItem(item) {
  if (!item.id) item.id = _generateId();
  item.createdAt = item.createdAt || new Date().toISOString();
  item.updatedAt = new Date().toISOString();
  return _fbOp('saveNutritionItem', async () => {
    await setDoc(_doc('nutrition_db', item.id), item);
    const idx = _nutritionDB.findIndex(n => n.id === item.id);
    if (idx >= 0) _nutritionDB[idx] = item; else _nutritionDB.push(item);
    return item;
  }, { sync: false, rethrow: true });
}

export async function deleteNutritionItem(id) {
  return _fbOp('deleteNutritionItem', async () => {
    await deleteDoc(_doc('nutrition_db', id));
    _nutritionDB = _nutritionDB.filter(n => n.id !== id);
  }, { sync: false });
}

export const getNutritionDB       = () => [..._nutritionDB].sort((a,b) => (a.name||'').localeCompare(b.name||''));
export const searchNutritionDB    = (q) => _nutritionDB.filter(n => n.name?.toLowerCase().includes((q||'').toLowerCase()));

// 최근 음식 N개 반환 (createdAt 역순)
export const getRecentNutritionItems = (limit = 10) => {
  return [..._nutritionDB]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit);
};

// OCR/파싱 결과를 정규화하여 저장
export async function saveNutritionItemFromOCR(parsedData, source = 'ocr') {
  const item = {
    id: _generateId(),
    name: parsedData.name || '',
    source: source, // 'ocr' | 'manual' | 'fatsecret'
    language: parsedData.language || 'ko',
    unit: parsedData.unit || '100g',
    servingSize: parseInt(parsedData.servingSize || 100),
    servingUnit: parsedData.servingUnit || 'g',

    nutrition: {
      kcal: parseFloat(parsedData.nutrition?.kcal || 0),
      protein: parseFloat(parsedData.nutrition?.protein || 0),
      carbs: parseFloat(parsedData.nutrition?.carbs || 0),
      fat: parseFloat(parsedData.nutrition?.fat || 0),
      fiber: parseFloat(parsedData.nutrition?.fiber || 0),
      sugar: parseFloat(parsedData.nutrition?.sugar || 0),
      sodium: parseFloat(parsedData.nutrition?.sodium || 0),
    },

    photoUrl: parsedData.photoUrl || null,
    rawText: parsedData.rawText || null,
    confidence: parseFloat(parsedData.confidence || 0.8),
    brand: parsedData.brand || null,
    notes: parsedData.notes || '',

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return await saveNutritionItem(item);
}

// 텍스트 이미지 base64로 변환
export function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // 최대 512px로 리사이징 (Firestore 1MB 문서 제한 대응)
        const MAX = 512;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else                { width  = Math.round(width  * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── 다이어트 플랜 (Firebase settings) ────────────────────────────
// 활동계수 변경 시 847 상수도 자동 재계산: 7700 / 7 / activityFactor
export const getDietPlan = () => {
  const p = { ...DEFAULT_DIET_PLAN, ..._settings.diet_plan };
  // Admin/AdminGuest는 데이터 공유 → 둘 다 userSet 동일하게 판정
  p._userSet = !!(_settings.diet_plan && _settings.diet_plan.weight && _settings.diet_plan.height);
  // AdminGuest도 Admin 데이터를 사용하므로 Admin이 설정했으면 userSet=true
  if (isAdminGuest() && p.weight && p.height) p._userSet = true;
  return p;
};
export const saveDietPlan = async (plan) => {
  const merged = { ...(getDietPlan()), ...plan };
  Object.assign(_dietPlan, merged);
  return _saveSetting('diet_plan', merged);
};

// 다이어트 계산 유틸 — 실제 로직은 calc.js에서 관리
export const calcDietMetrics = _calcDietMetrics;
export const isDietDaySuccess = _isDietDaySuccess;
export const getDayTargetKcal = (plan, y, m, d, dayData) => _getDayTargetKcal(plan, y, m, d, dayData);
export const calcExerciseCalorieCredit = _calcExerciseCalorieCredit;

export const getExList    = ()      => _exList;
export const getCache     = ()      => _cache;
export const getDay       = (y,m,d) => _cache[dateKey(y,m,d)] || {};
export const getExercises = (y,m,d) => getDay(y,m,d).exercises || [];
export const getMuscles   = (y,m,d) => {
  const day = getDay(y,m,d);
  const ids = new Set(getExercises(y,m,d).map(e => e.muscleId));
  if (day.swimming) ids.add('swimming');
  if (day.running)  ids.add('running');
  return [...ids];
};
export const getCF        = (y,m,d) => !!getDay(y,m,d).cf;
export const getMemo      = (y,m,d) => getDay(y,m,d).memo || '';

// ── 헬스/클핏 상태 (skip=의도적 안함, health=건강이슈) ─────────────
export const getGymSkip   = (y,m,d) => !!getDay(y,m,d)?.gym_skip;
export const getGymHealth = (y,m,d) => !!getDay(y,m,d)?.gym_health;
export const getCFSkip    = (y,m,d) => !!getDay(y,m,d)?.cf_skip;
export const getCFHealth  = (y,m,d) => !!getDay(y,m,d)?.cf_health;

// ── 스트레칭 / 와인프리데이 ───────────────────────────────────────
export const getStretching = (y,m,d) => !!getDay(y,m,d)?.stretching;
export const getWineFree   = (y,m,d) => !!getDay(y,m,d)?.wine_free;

// ── 식사 스킵(굶었음) 상태 ─────────────────────────────────────────
export const getBreakfastSkipped = (y,m,d) => !!getDay(y,m,d)?.breakfast_skipped;
export const getLunchSkipped     = (y,m,d) => !!getDay(y,m,d)?.lunch_skipped;
export const getDinnerSkipped    = (y,m,d) => !!getDay(y,m,d)?.dinner_skipped;

export const getDiet = (y,m,d) => {
  const r = getDay(y,m,d);
  return {
    breakfast:r.breakfast||'', lunch:r.lunch||'', dinner:r.dinner||'',
    bOk:r.bOk??null, lOk:r.lOk??null, dOk:r.dOk??null,
    bKcal:r.bKcal||0, lKcal:r.lKcal||0, dKcal:r.dKcal||0, sKcal:r.sKcal||0,
    bProtein:r.bProtein||0, lProtein:r.lProtein||0, dProtein:r.dProtein||0, sProtein:r.sProtein||0,
    bCarbs:r.bCarbs||0, lCarbs:r.lCarbs||0, dCarbs:r.dCarbs||0, sCarbs:r.sCarbs||0,
    bFat:r.bFat||0, lFat:r.lFat||0, dFat:r.dFat||0, sFat:r.sFat||0,
    bReason:r.bReason||'', lReason:r.lReason||'', dReason:r.dReason||'',
    bFoods:r.bFoods||[], lFoods:r.lFoods||[], dFoods:r.dFoods||[], sFoods:r.sFoods||[],
  };
};

export const dietDayOk = (y,m,d) => _dietDayOk(getDay(y,m,d), getDietPlan(), y, m, d);

export const calcVolume = _calcVolume;
export const calcVolumeAll = _calcVolumeAll;
export const getVolumeHistory = (exerciseId) => _getVolumeHistory(_cache, exerciseId);
export const getLastSession = (exerciseId) => _getLastSession(_cache, exerciseId);

export function calcStreaks() {
  return _calcStreaks(_cache, TODAY, getDietPlan(), dateKey);
}

// ── 퀘스트 셀 순서 (Firebase) ─────────────────────────────────────
export const getQuestOrder = () => _settings.quest_order || ['quarterly','monthly','weekly','daily'];
export const saveQuestOrder = (order) => _saveSetting('quest_order', order);

// ── 구역 제목 (Firebase) ──────────────────────────────────────────
const _defaultTitles = {
  stocks:         '📈 주가 · RSI',
  ai:             '🤖 AI 추천',
  quests:         '📋 퀘스트',
  goals:          '🎯 목표',
  today_diet:     '🥗 오늘 식단',
  today_workout:  '💪 오늘 운동',
  mini_memo:      '📝 미니 메모',
};
export const getSectionTitle  = (key) => (_settings.section_titles || {})[key] || _defaultTitles[key] || key;
export const saveSectionTitle = async (key, title) => {
  const titles = { ...(_settings.section_titles || {}), [key]: title };
  await _saveSetting('section_titles', titles);
};

// ── 주가 매입 정보 (Firebase) ─────────────────────────────────────
export const getStockPurchases = () => _settings.stock_purchases || {};
export const saveStockPurchase = async (sym, data) => {
  const p = { ...getStockPurchases() };
  if (data) p[sym] = data; else delete p[sym];
  await _saveSetting('stock_purchases', p);
};

// ── 미니 메모 아이템 (Firebase) ───────────────────────────────────
export const getMiniMemoItems  = () => _settings.mini_memo_items || [];
export const saveMiniMemoItems = (items) => _saveSetting('mini_memo_items', items);

// ── 탭 순서 (Firebase) ────────────────────────────────────────────
export const getTabOrder  = () => _settings.tab_order || DEFAULT_TAB_ORDER;
export const saveTabOrder = (order) => _saveSetting('tab_order', order);

// ── 하단 탭 가시성 (Firebase) ────────────────────────────────────
export const DEFAULT_VIS_TABS = DEFAULT_VISIBLE_TABS;
export const getVisibleTabs  = () => _settings.visible_tabs || DEFAULT_VISIBLE_TABS;
export const getRawVisibleTabs = () => _settings.visible_tabs; // null이면 아직 저장 안 됨
export const saveVisibleTabs = (tabs) => _saveSetting('visible_tabs', tabs);

// ── 주간 메모 (Firebase) ──────────────────────────────────────────
export const getWeeklyMemos = () => _settings.weekly_memos || {};
export const saveWeeklyMemo = async (weekKey, text) => {
  const m = { ...getWeeklyMemos() };
  if (text) m[weekKey] = text; else delete m[weekKey];
  await _saveSetting('weekly_memos', m);
};

// ── 날짜 유틸 ────────────────────────────────────────────────────
export const dateKey     = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
export const daysInMonth = (y,m)   => new Date(y,m+1,0).getDate();
export const TODAY       = (() => { const t=new Date(); t.setHours(0,0,0,0); return t; })();
export const isToday     = (y,m,d) => { const t=new Date(y,m,d);t.setHours(0,0,0,0);return t.getTime()===TODAY.getTime(); };
export const isFuture    = (y,m,d) => { const t=new Date(y,m,d);t.setHours(0,0,0,0);return t.getTime()>TODAY.getTime(); };
// 앱 시작일 이전: 2026-03-21
export const isBeforeStart = (y,m,d) => {
  const t=new Date(y,m,d); t.setHours(0,0,0,0);
  const start=new Date(2026,2,21); start.setHours(0,0,0,0);
  return t.getTime() < start.getTime();
};

// ── Streak Settings ────────────────────────────────────────────────
export const getStreakSettings = () => _settings.streak_settings || {
  fontSizeMode: 'default',
  cellWidthMode: 'default'
};

export async function saveStreakSettings(key, value) {
  if (!_settings.streak_settings) {
    _settings.streak_settings = {
      fontSizeMode: 'default',
      cellWidthMode: 'default'
    };
  }
  _settings.streak_settings[key] = value;
  await _saveSetting('streak_settings', _settings.streak_settings);
}

// ── Home Streak Days ──────────────────────────────────────────────
export const getHomeStreakDays = () => _settings.home_streak_days ?? 6;
export async function saveHomeStreakDays(n) {
  _settings.home_streak_days = Math.max(0, Math.min(6, n));
  await _saveSetting('home_streak_days', _settings.home_streak_days);
}

export const DEFAULT_CALENDAR_ROWS = [
  { id: 'gym',  label: '헬스', emoji: '🏋️' },
  { id: 'diet', label: '식단', emoji: '🥗' },
];

export function getCalendarRows() {
  return _settings.calendar_rows || DEFAULT_CALENDAR_ROWS;
}
export async function saveCalendarRows(rows) {
  _settings.calendar_rows = rows;
  await _saveSetting('calendar_rows', rows);
}

export const getUnitGoalStart = () => _settings.unit_goal_start ?? null;
export async function saveUnitGoalStart(dateStr) {
  _settings.unit_goal_start = dateStr;
  await _saveSetting('unit_goal_start', dateStr);
}

// ── 토마토 키우기 (Firebase) ─────────────────────────────────────
let _tomatoCycles = []; // 완료된 사이클 캐시

export const getTomatoState = () => _settings.tomato_state || { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
export const saveTomatoState = (state) => { _settings.tomato_state = state; return _saveSetting('tomato_state', state); };

// ── 마일스톤 기록 ───────────────────────────────────────────────
export const getMilestoneShown = () => _settings.milestone_shown || {};
export const saveMilestoneShown = (obj) => { _settings.milestone_shown = obj; return _saveSetting('milestone_shown', obj); };

// ── Streak Freeze ───────────────────────────────────────────────
export function getStreakFreezes() { return _settings.streak_freezes || []; }
export async function useStreakFreeze(type) {
  const state = getTomatoState();
  const available = state.totalTomatoes + state.giftedReceived - state.giftedSent;
  if (available <= 0) return { error: '토마토가 부족해요.' };
  const freezes = getStreakFreezes();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentFreeze = freezes.find(f => f.type === type && f.usedAt > weekAgo);
  if (recentFreeze) return { error: '이번 주에는 이미 사용했어요. (주 1회)' };
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  freezes.push({ date: dateStr, type, usedAt: now });
  state.giftedSent = (state.giftedSent || 0) + 1; // 토마토 1개 차감 (giftedSent로 차감)
  await _saveSetting('streak_freezes', freezes);
  await saveTomatoState(state);
  return { ok: true };
}

export async function saveTomatoCycle(cycleResult) {
  _tomatoCycles.push(cycleResult);
  return _fbOp('saveTomatoCycle', () => setDoc(_doc('tomato_cycles', cycleResult.id), cycleResult));
}

export function getTomatoCycles(quarterKey) {
  if (!quarterKey) return _tomatoCycles;
  return _tomatoCycles.filter(c => c.quarter === quarterKey);
}

export function getAllTomatoCycles() { return _tomatoCycles; }

export async function sendTomatoGift(toUserId, message) {
  if (!_currentUser) return { error: '로그인이 필요해요.' };
  const state = getTomatoState();
  const available = state.totalTomatoes + state.giftedReceived - state.giftedSent;
  if (available <= 0) return { error: '선물할 토마토가 없어요.' };
  const fromId = _socialId();
  const giftId = `${fromId}_${toUserId}_${Date.now()}`;
  await setDoc(doc(db, '_tomato_gifts', giftId), {
    id: giftId, from: fromId, to: toUserId,
    quarter: _getQuarterKeyNow(), message: message || '',
    createdAt: Date.now(),
  });
  state.giftedSent++;
  await saveTomatoState(state);
  await sendNotification(toUserId, { type: 'tomato_gift', from: fromId, message: '토마토를 선물했어요! 🍅' });
  return { ok: true };
}

export async function getReceivedTomatoGifts() {
  if (!_currentUser) return [];
  const snap = await getDocs(collection(db, '_tomato_gifts'));
  const gifts = [];
  snap.forEach(d => { const data = d.data(); if (_isMySocialId(data.to)) gifts.push(data); });
  gifts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return gifts;
}

// ── 농장 시스템 (Firebase) ────────────────────────────────────────
const FARM_SHOP_ITEMS = [
  // 자연
  { id: 'tree1',     name: '나무',       emoji: '🌳', price: 3, category: 'nature' },
  { id: 'tree2',     name: '소나무',     emoji: '🌲', price: 3, category: 'nature' },
  { id: 'flower1',   name: '꽃',         emoji: '🌸', price: 1, category: 'nature' },
  { id: 'flower2',   name: '해바라기',   emoji: '🌻', price: 1, category: 'nature' },
  { id: 'flower3',   name: '튤립',       emoji: '🌷', price: 1, category: 'nature' },
  { id: 'mushroom',  name: '버섯',       emoji: '🍄', price: 1, category: 'nature' },
  { id: 'cactus',    name: '선인장',     emoji: '🌵', price: 2, category: 'nature' },
  { id: 'herb',      name: '허브',       emoji: '🌿', price: 1, category: 'nature' },
  // 건물/구조물
  { id: 'house',     name: '집',         emoji: '🏡', price: 8, category: 'building' },
  { id: 'barn',      name: '헛간',       emoji: '🏚️', price: 5, category: 'building' },
  { id: 'fence',     name: '울타리',     emoji: '🪵', price: 1, category: 'building' },
  { id: 'well',      name: '우물',       emoji: '⛲', price: 4, category: 'building' },
  { id: 'bench',     name: '벤치',       emoji: '🪑', price: 2, category: 'building' },
  { id: 'lamp',      name: '가로등',     emoji: '🏮', price: 2, category: 'building' },
  // 동물
  { id: 'cat',       name: '고양이',     emoji: '🐱', price: 5, category: 'animal' },
  { id: 'dog',       name: '강아지',     emoji: '🐶', price: 5, category: 'animal' },
  { id: 'chicken',   name: '닭',         emoji: '🐔', price: 3, category: 'animal' },
  { id: 'rabbit',    name: '토끼',       emoji: '🐰', price: 4, category: 'animal' },
  // 특별
  { id: 'rainbow',   name: '무지개',     emoji: '🌈', price: 10, category: 'special' },
  { id: 'star',      name: '별',         emoji: '⭐', price: 6, category: 'special' },
];

export const getFarmShopItems = () => FARM_SHOP_ITEMS;

// 농장 상태: 6x4 타일맵 + 캐릭터 위치 + 소유 아이템
const DEFAULT_FARM_STATE = {
  tiles: Array(24).fill(null), // 6x4 = 24칸, 각 칸은 null 또는 { itemId, placedAt }
  ownedItems: [],              // [{ itemId, quantity }]
  characterPos: 7,             // 캐릭터 기본 위치 (인덱스)
  characterDir: 'down',        // 방향
};

export function getFarmState() {
  return _settings.farm_state || { ...DEFAULT_FARM_STATE, tiles: Array(24).fill(null), ownedItems: [] };
}

export async function saveFarmState(state) {
  _settings.farm_state = state;
  return _saveSetting('farm_state', state);
}

export async function buyFarmItem(itemId) {
  const shop = FARM_SHOP_ITEMS.find(i => i.id === itemId);
  if (!shop) return { error: '아이템을 찾을 수 없어요.' };
  const tomato = getTomatoState();
  const available = tomato.totalTomatoes + (tomato.giftedReceived || 0) - (tomato.giftedSent || 0);
  // 이미 사용한 토마토 계산 (상점 구매용)
  const farm = getFarmState();
  const spent = (farm.ownedItems || []).reduce((sum, i) => {
    const s = FARM_SHOP_ITEMS.find(x => x.id === i.itemId);
    return sum + (s ? s.price * i.quantity : 0);
  }, 0);
  const balance = available - spent;
  if (balance < shop.price) return { error: `토마토가 부족해요. (필요: ${shop.price}🍅, 보유: ${balance}🍅)` };

  const owned = farm.ownedItems || [];
  const existing = owned.find(i => i.itemId === itemId);
  if (existing) { existing.quantity++; } else { owned.push({ itemId, quantity: 1 }); }
  farm.ownedItems = owned;
  await saveFarmState(farm);
  return { ok: true, balance: balance - shop.price };
}

export async function placeFarmItem(tileIndex, itemId) {
  const farm = getFarmState();
  if (tileIndex < 0 || tileIndex >= 24) return;
  // 인벤토리에서 차감 (배치 안 된 수량 확인)
  const placedCount = farm.tiles.filter(t => t?.itemId === itemId).length;
  const owned = (farm.ownedItems || []).find(i => i.itemId === itemId);
  if (!owned || owned.quantity <= placedCount) return; // 배치 가능한 수량 없음
  farm.tiles[tileIndex] = { itemId, placedAt: Date.now() };
  await saveFarmState(farm);
}

export async function removeFarmItem(tileIndex) {
  const farm = getFarmState();
  if (tileIndex < 0 || tileIndex >= 24) return;
  farm.tiles[tileIndex] = null;
  await saveFarmState(farm);
}

export async function moveFarmCharacter(tileIndex) {
  const farm = getFarmState();
  farm.characterPos = tileIndex;
  await saveFarmState(farm);
}

function _getQuarterKeyNow() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

function _sortExList(list) {
  const mOrder = MUSCLES.map(m => m.id);
  return list.sort((a,b) => {
    const mi = mOrder.indexOf(a.muscleId) - mOrder.indexOf(b.muscleId);
    return mi !== 0 ? mi : (a.order||99) - (b.order||99);
  });
}

// ── 영화 데이터 ────────────────────────────────────────────────────
export async function getMovieData(year, month) {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;

  // 캐시에 있으면 반환
  if (_movies[key]) {
    return _movies[key];
  }

  // Firestore에서 로드 시도
  try {
    const snap = await getDoc(_doc('movies', key));
    if (snap.exists()) {
      const data = snap.data();
      _movies[key] = data;
      return data;
    }
  } catch (e) {
    console.warn(`[data] Firestore 로드 실패: ${key}`, e.message);
  }

  // JSON 파일에서 로드 시도 (GitHub Pages용)
  try {
    const response = await fetch(`./data/movies/${key}.json`);
    if (response.ok) {
      const data = await response.json();
      _movies[key] = data;
      return data;
    }
  } catch (e) {
    console.warn(`[data] JSON 로드 실패: ${key}`, e.message);
  }

  return {};
}

// Firestore에서 영화 데이터 강제 새로고침
export async function refreshMovieData(year, month) {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  delete _movies[key]; // 캐시 삭제

  try {
    const snap = await getDoc(_doc('movies', key));
    if (snap.exists()) {
      const data = snap.data();
      _movies[key] = data;
      return data;
    }
  } catch (e) {
    console.warn(`[data] Firestore 새로고침 실패: ${key}`, e.message);
  }

  // Firestore 실패 시 JSON 파일 폴백
  return getMovieData(year, month);
}

export async function saveMovieData(year, month, data) {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  _movies[key] = data;
  return _fbOp('saveMovieData', () => setDoc(_doc('movies', key), data));
}

export function getAllMovieMonths() {
  return Object.keys(_movies).sort();
}

// ── Window 전역 노출 (UI에서 직접 접근 가능) ────────────────────────
window.getStreakSettings = getStreakSettings;
window.saveStreakSettings = saveStreakSettings;
