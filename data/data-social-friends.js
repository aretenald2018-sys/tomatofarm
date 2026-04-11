// ================================================================
// data-social-friends.js — 친구, 소개, 랭킹
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs,
  getCurrentUserRef, ADMIN_ID,
} from './data-core.js';
import { isAdminGuest } from './data-auth.js';

export function _socialId() {
  if (!getCurrentUserRef()) return null;
  if (isAdminGuest()) return ADMIN_ID;
  return getCurrentUserRef().id;
}

export function _isMySocialId(id) {
  if (!getCurrentUserRef()) return false;
  if (id === getCurrentUserRef().id) return true;
  if (isAdminGuest() && id === ADMIN_ID) return true;
  return false;
}

async function _getFriendDoc(reqId) {
  try {
    const snap = await getDoc(doc(db, '_friend_requests', reqId));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
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
  await sendNotification(reqDoc.from, {
    type: 'friend_accepted', from: reqDoc.to, message: '이웃 요청을 수락했어요.',
  });
}

export async function removeFriend(reqId) {
  await deleteDoc(doc(db, '_friend_requests', reqId));
}

export async function getMyFriends() {
  if (!getCurrentUserRef()) return [];
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

export async function getPendingRequests() {
  if (!getCurrentUserRef()) return [];
  const snap = await getDocs(collection(db, '_friend_requests'));
  const pending = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.status === 'pending' && _isMySocialId(data.to)) pending.push(data);
  });
  return pending;
}

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

export async function getFriendTomatoState(friendId) {
  try {
    const snap = await getDoc(doc(db, 'users', friendId, 'settings', 'tomato_state'));
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
