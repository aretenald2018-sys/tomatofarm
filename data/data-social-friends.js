// ================================================================
// data-social-friends.js — 친구, 소개, 랭킹
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs,
  query, orderBy, limit,
  getCurrentUserRef,
} from './data-core.js';
import { isSameInstance } from './data-auth.js';
import { resolvePrivateDataOwnerId } from './shared-account-owner.js';

// 세션 사용자의 id 는 setCurrentUser() 에서 이미 정규화된다. 소셜 정체성은
// 그 id 하나뿐이고, 모드에 따라 갈라지지 않는다.
export function _socialId() {
  return getCurrentUserRef()?.id ?? null;
}

export function _isMySocialId(id) {
  const myId = getCurrentUserRef()?.id;
  if (!myId) return false;
  return isSameInstance(id, myId);
}

async function _getFriendDoc(reqId) {
  try {
    const snap = await getDoc(doc(db, '_friend_requests', reqId));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// ── _friend_requests 전역 스캔 TTL 캐시 (60s) ─────────────────────
// getMyFriends/getPendingRequests 는 renderHome 경로마다 반복 호출되며 매번
// _friend_requests 를 풀스캔했다. cheers config 캐시(data-social-interact.js,
// TTL 10s)와 같은 패턴으로 스캔 결과 자체를 60초 캐시하고, "내 친구/내게 온
// 요청" 필터는 호출마다 캐시된 배열 위에서 새로 적용한다(_isMySocialId 는 항상
// 현재 로그인 사용자 기준으로 평가되므로 캐시 자체는 사용자 비의존적이다).
// 쓰기 경로(sendFriendRequest/acceptFriendRequest/removeFriend, 그리고
// data-account.js 의 deleteUserAccount)가 성공하면 invalidateFriendsCache() 로
// 무효화하고, 계정 전환 시에는 data-api.js의 setCurrentUser 래퍼가 무효화한다.
const FRIEND_REQUESTS_CACHE_TTL_MS = 60 * 1000;
let _friendRequestsScanCache = null;
let _friendRequestsScanCacheAt = 0;

export function invalidateFriendsCache() {
  _friendRequestsScanCache = null;
  _friendRequestsScanCacheAt = 0;
}

async function _scanFriendRequests({ force = false } = {}) {
  if (!force && _friendRequestsScanCache && (Date.now() - _friendRequestsScanCacheAt) < FRIEND_REQUESTS_CACHE_TTL_MS) {
    return _friendRequestsScanCache;
  }
  const snap = await getDocs(collection(db, '_friend_requests'));
  const requests = [];
  snap.forEach(d => requests.push(d.data()));
  _friendRequestsScanCache = requests;
  _friendRequestsScanCacheAt = Date.now();
  return requests;
}

export async function sendFriendRequest(fromId, toId) {
  const { sendNotification } = await import('./data-social-interact.js');
  const reqId = `${fromId}_${toId}`;
  const existing = await _getFriendDoc(reqId);
  if (existing) return { error: '이미 요청했어요.' };
  const reverse = await _getFriendDoc(`${toId}_${fromId}`);
  if (reverse && reverse.status === 'accepted') return { error: '이미 이웃이에요.' };
  if (reverse && reverse.status === 'pending') {
    await acceptFriendRequest(reverse.id);
    return { ok: true, autoAccepted: true };
  }
  await setDoc(doc(db, '_friend_requests', reqId), {
    id: reqId, from: fromId, to: toId, status: 'pending', createdAt: Date.now(),
  });
  invalidateFriendsCache();
  await sendNotification(toId, {
    type: 'friend_request', from: fromId, message: '이웃 요청을 보냈어요.',
  });
  return { ok: true };
}

export async function acceptFriendRequest(reqId) {
  const { sendNotification } = await import('./data-social-interact.js');
  const reqDoc = await _getFriendDoc(reqId);
  if (!reqDoc) return;
  reqDoc.status = 'accepted';
  reqDoc.acceptedAt = Date.now();
  await setDoc(doc(db, '_friend_requests', reqId), reqDoc);
  invalidateFriendsCache();
  await sendNotification(reqDoc.from, {
    type: 'friend_accepted', from: reqDoc.to, message: '이웃 요청을 수락했어요.',
  });
}

export async function removeFriend(reqId) {
  await deleteDoc(doc(db, '_friend_requests', reqId));
  invalidateFriendsCache();
}

export async function getMyFriends(opts = {}) {
  if (!getCurrentUserRef()) return [];
  const all = await _scanFriendRequests(opts);
  const friends = [];
  const seen = new Set();
  for (const data of all) {
    if (data.status === 'accepted') {
      let fid = null;
      if (_isMySocialId(data.from)) fid = data.to;
      else if (_isMySocialId(data.to)) fid = data.from;
      if (fid && !seen.has(fid)) {
        seen.add(fid);
        friends.push({ friendId: fid, reqId: data.id });
      }
    }
  }
  return friends;
}

export async function getPendingRequests(opts = {}) {
  if (!getCurrentUserRef()) return [];
  const all = await _scanFriendRequests(opts);
  return all.filter(data => data.status === 'pending' && _isMySocialId(data.to));
}

export async function getFriendData(friendId, colName) {
  try {
    const ownerId = await resolvePrivateDataOwnerId(friendId);
    const snap = await getDocs(collection(db, 'users', ownerId, colName));
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    return items;
  } catch { return []; }
}

export async function getFriendWorkout(friendId, dateKey) {
  try {
    const ownerId = await resolvePrivateDataOwnerId(friendId);
    const snap = await getDoc(doc(db, 'users', ownerId, 'workouts', dateKey));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

// 친구의 가장 최근 정산된 토마토 사이클 문서 1건 반환 (orderBy desc + limit 1).
// tomatoesAwarded(0~2), dietAllSuccess, exerciseAllSuccess 플래그를 소비 측에서 활용.
export async function getFriendLatestTomatoCycle(friendId) {
  if (!friendId) return null;
  let ownerId = null;
  try {
    ownerId = await resolvePrivateDataOwnerId(friendId);
    const q = query(
      collection(db, 'users', ownerId, 'tomato_cycles'),
      orderBy('cycleEnd', 'desc'),
      limit(1),
    );
    const snap = await getDocs(q);
    let latest = null;
    snap.forEach((d) => { latest = d.data(); });
    return latest;
  } catch (e) {
    // orderBy가 인덱스 필요 시 실패 시 legacy fallback (데이터 적을 때만 사용)
    console.warn('[tomato-cycle] getFriend (fallback to full scan):', e?.message || e);
    try {
      if (!ownerId) ownerId = await resolvePrivateDataOwnerId(friendId);
      const snap = await getDocs(collection(db, 'users', ownerId, 'tomato_cycles'));
      let latest = null;
      snap.forEach((d) => {
        const data = d.data();
        if (!data?.cycleEnd) return;
        if (!latest || data.cycleEnd > latest.cycleEnd) latest = data;
      });
      return latest;
    } catch (_) { return null; }
  }
}

export async function getFriendTomatoState(friendId) {
  try {
    const ownerId = await resolvePrivateDataOwnerId(friendId);
    const snap = await getDoc(doc(db, 'users', ownerId, 'settings', 'tomato_state'));
    return snap.exists() ? (snap.data().value || { totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 })
      : { totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
  } catch { return { totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 }; }
}

export function getDisplayName(account, isFriend = false) {
  if (!account) return '익명';
  const fullName = account.lastName + account.firstName;
  const nick = account.nickname || fullName;
  if (isFriend) return `${fullName} (${nick})`;
  return nick;
}

export async function getGlobalWeeklyRanking() {
  try {
    const snap = await getDoc(doc(db, '_weekly_ranking', 'current'));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function introduceFriend(friendAId, friendBId, friendAName, friendBName) {
  const { sendNotification } = await import('./data-social-interact.js');
  if (!getCurrentUserRef()) return { error: '로그인이 필요해요.' };
  await sendNotification(friendAId, {
    type: 'introduce', from: _socialId(),
    message: `${friendBName}님을 소개받았어요! 이웃이 되어보세요.`,
    introducedId: friendBId, introducedName: friendBName,
  });
  await sendNotification(friendBId, {
    type: 'introduce', from: _socialId(),
    message: `${friendAName}님을 소개받았어요! 이웃이 되어보세요.`,
    introducedId: friendAId, introducedName: friendAName,
  });
  return { ok: true };
}
