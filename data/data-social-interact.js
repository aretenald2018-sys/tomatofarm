// ================================================================
// data-social-interact.js — 방명록, 댓글, 알림, 좋아요
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs,
  getCurrentUserRef,
} from './data-core.js';
import { isAdmin, isAdminGuest, _simpleHash } from './data-auth.js';
import { _socialId, _isMySocialId } from './data-social-friends.js';

// ── 알림 ────────────────────────────────────────────────────────
export async function sendNotification(toUserId, data) {
  const notifId = `${toUserId}_${Date.now()}`;
  await setDoc(doc(db, '_notifications', notifId), {
    id: notifId, to: toUserId, read: false, createdAt: Date.now(), ...data,
  });
}

export async function getMyNotifications() {
  if (!getCurrentUserRef()) return [];
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
  if (!notifId) return;
  await setDoc(doc(db, '_notifications', notifId), { read: true, readAt: Date.now() }, { merge: true });
}

// 여러 알림 id를 한 번에 읽음 처리 (SW에서 수신 시 사용)
export async function markNotificationsRead(ids = []) {
  const jobs = (ids || []).filter(Boolean).map((id) => markNotificationRead(id));
  await Promise.allSettled(jobs);
}

// Hero 메시지 읽음 처리 — 홈에서 배너 노출 시 호출
export async function markHeroMessageRead(docId) {
  if (!docId) return;
  try {
    await setDoc(doc(db, '_hero_messages', docId), {
      read: true, readAt: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.warn('[hero-message] mark read:', e);
  }
}

export async function getAdminSentNotifications() {
  const snap = await getDocs(collection(db, '_notifications'));
  const notifs = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.from === 'admin') notifs.push(data);
  });
  notifs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return notifs;
}

export async function getAdminOutreachHistory() {
  const [notifSnap, heroSnap] = await Promise.all([
    getDocs(collection(db, '_notifications')),
    getDocs(collection(db, '_hero_messages')),
  ]);

  const history = [];

  notifSnap.forEach((d) => {
    const data = d.data();
    if (data.from !== 'admin') return;
    history.push({
      ...data,
      id: data.id || d.id,
      source: 'notification',
    });
  });

  heroSnap.forEach((d) => {
    const data = d.data();
    history.push({
      ...data,
      id: data.id || d.id,
      source: 'hero',
      type: 'hero',
      to: data.targetUserId || data.to || '',
      body: data.message || data.body || '',
      message: data.message || '',
      read: typeof data.read === 'boolean' ? data.read : null,
      readAt: typeof data.readAt === 'number' ? data.readAt : null,
    });
  });

  history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return history;
}

// ── Cheers 설정 (관리자 제어용) ─────────────────────────────────
// _settings/cheers_config 문서: { modules: {weight:bool, kcal:bool, ...}, updatedAt }
// 관리자 변경 즉시 반영을 위해 캐시 TTL은 짧게(10s) — 비어있는 객체라 비용 부담 작음.
let _cheersConfigCache = null;
let _cheersConfigCacheAt = 0;
const CHEERS_CONFIG_TTL = 10 * 1000;

let _customCheersCache = null;
let _customCheersCacheAt = 0;
const CUSTOM_CHEERS_TTL = 10 * 1000;

export function invalidateCheersCache() {
  _cheersConfigCache = null;
  _cheersConfigCacheAt = 0;
  _customCheersCache = null;
  _customCheersCacheAt = 0;
}

export async function getCheersConfigRemote() {
  try {
    const snap = await getDoc(doc(db, '_settings', 'cheers_config'));
    return snap.exists() ? (snap.data() || {}) : {};
  } catch (e) {
    console.warn('[cheers-config] fetch:', e);
    return {};
  }
}

export async function getCheersConfig() {
  if (_cheersConfigCache && (Date.now() - _cheersConfigCacheAt) < CHEERS_CONFIG_TTL) {
    return _cheersConfigCache;
  }
  _cheersConfigCache = await getCheersConfigRemote();
  _cheersConfigCacheAt = Date.now();
  return _cheersConfigCache;
}

export async function saveCheersConfig(config) {
  // 클라이언트 방어선 (Firestore rules가 진짜 방어선이지만 오탈자/실수 방지)
  if (!isAdmin()) throw new Error('admin only');
  await setDoc(doc(db, '_settings', 'cheers_config'), {
    ...(config || {}),
    updatedAt: Date.now(),
  }, { merge: true });
  _cheersConfigCache = { ...(config || {}), updatedAt: Date.now() };
  _cheersConfigCacheAt = Date.now();
}

// ── Self-cheer (유저가 직접 축하받고 싶은 문구) ──────────────────
// 저장: users/{uid}/settings/self_cheer = { text, updatedAt, expiresAt }
// text 규약: **이름 제외 본문**만 저장 (custom cheer와 동일 계약).
// 렌더러가 앞에 "{name}님 " 을 붙인다.
// 만료된 self-cheer는 null 반환 (getFriendSelfCheer와 동일 계약).
// raw 문서가 필요하면 getMySelfCheerRaw 사용.
export async function getMySelfCheer() {
  const data = await getMySelfCheerRaw();
  if (!data?.text) return null;
  if (data.expiresAt && data.expiresAt < Date.now()) return null;
  return data;
}

export async function getMySelfCheerRaw() {
  const u = getCurrentUserRef();
  if (!u) return null;
  try {
    const snap = await getDoc(doc(db, 'users', u.id, 'settings', 'self_cheer'));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[self-cheer] get:', e);
    return null;
  }
}

// 규약: self-cheer는 **당일에만** 유효. 로컬 자정(다음 날 00:00)에 자동 만료되어
// 다음 날은 시스템 자동 감지 축하로 돌아간다. 계속 표출하고 싶으면 매일 재설정.
export async function saveMySelfCheer(payload) {
  const u = getCurrentUserRef();
  if (!u) throw new Error('로그인 필요');
  const rawText = (payload?.text || '').trim();
  const normalizedText = rawText.replace(/^님[\s,]*/, '').trim();
  const todayEnd = new Date();
  todayEnd.setHours(24, 0, 0, 0); // 오늘 23:59:59.999 다음 = 내일 00:00
  const entry = {
    text: normalizedText,
    updatedAt: Date.now(),
    expiresAt: todayEnd.getTime(),
  };
  await setDoc(doc(db, 'users', u.id, 'settings', 'self_cheer'), entry, { merge: true });
  return entry;
}

export async function deleteMySelfCheer() {
  const u = getCurrentUserRef();
  if (!u) return;
  // 텍스트 비우고 expires=0 으로 만료 처리 (docRef 삭제 대신 merge로 비활성)
  await setDoc(doc(db, 'users', u.id, 'settings', 'self_cheer'), {
    text: '', updatedAt: Date.now(), expiresAt: 0,
  }, { merge: true });
}

export async function getFriendSelfCheer(friendId) {
  if (!friendId) return null;
  try {
    const snap = await getDoc(doc(db, 'users', friendId, 'settings', 'self_cheer'));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data?.text) return null;
    if (data.expiresAt && data.expiresAt < Date.now()) return null;
    return data;
  } catch (e) {
    console.warn('[self-cheer] getFriend:', e);
    return null;
  }
}

// ── Cheers 수동 축하 (관리자가 직접 작성한 축하 문구) ─────────────
// _cheers_custom 컬렉션: { id, targetUid, targetName, text, emoji, createdAt, expiresAt, createdBy }
// text 규약: **이름을 제외한 본문**만 저장. 렌더러가 앞에 "{name}님 "을 붙인다.
export async function getCustomCheers() {
  if (_customCheersCache && (Date.now() - _customCheersCacheAt) < CUSTOM_CHEERS_TTL) {
    return _customCheersCache;
  }
  try {
    const snap = await getDocs(collection(db, '_cheers_custom'));
    const items = [];
    const now = Date.now();
    snap.forEach((d) => {
      const data = d.data();
      if (data.expiresAt && data.expiresAt < now) return;
      items.push({ ...data, id: data.id || d.id });
    });
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    _customCheersCache = items;
    _customCheersCacheAt = Date.now();
    return items;
  } catch (e) {
    console.warn('[cheers-custom] fetch:', e);
    return _customCheersCache || [];
  }
}

export async function saveCustomCheer(payload) {
  if (!isAdmin()) throw new Error('admin only');
  const id = payload.id || `cheer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // text 정규화: 앞머리 "님 ", "님, " 패턴은 제거 (contract: 이름 제외 본문)
  const rawText = (payload.text || '').trim();
  const normalizedText = rawText.replace(/^님[\s,]*/, '').trim();
  const entry = {
    id,
    targetUid: payload.targetUid || '',
    targetName: payload.targetName || '',
    text: normalizedText,
    emoji: payload.emoji || '',
    createdAt: payload.createdAt || Date.now(),
    expiresAt: payload.expiresAt || (Date.now() + 3 * 86400000), // 기본 3일 만료
    createdBy: _socialId(),
  };
  await setDoc(doc(db, '_cheers_custom', id), entry);
  _customCheersCache = null; // 다음 조회 시 fresh
  return entry;
}

export async function deleteCustomCheer(id) {
  if (!isAdmin()) throw new Error('admin only');
  if (!id) return;
  await deleteDoc(doc(db, '_cheers_custom', id));
  _customCheersCache = null;
}

export async function sendAnnouncement(title, body) {
  if (!getCurrentUserRef()) return { error: '로그인 필요' };
  const fromId = _socialId();
  const { getAccountList } = await import('./data-account.js');
  const accounts = await getAccountList();
  for (const acc of accounts) {
    if (acc.id === fromId || acc.id.includes('(guest)')) continue;
    await sendNotification(acc.id, {
      type: 'announcement', from: fromId,
      title, body, message: `📢 ${title}`,
    });
  }
  return { ok: true };
}

// ── 방명록 ──────────────────────────────────────────────────────
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
  if (!getCurrentUserRef() || !message.trim()) return { error: '메시지를 입력해주세요.' };
  const fromId = _socialId();
  const entryId = `gb_${fromId}_${targetUserId}_${Date.now()}`;
  const entry = {
    id: entryId, to: targetUserId, from: fromId,
    fromName: getCurrentUserRef().nickname || (getCurrentUserRef().lastName + getCurrentUserRef().firstName),
    message: message.trim(), createdAt: Date.now(),
    ...(parentId ? { parentId } : {}),
  };
  await setDoc(doc(db, '_guestbook', entryId), entry);
  if (!_isMySocialId(targetUserId)) {
    await sendNotification(targetUserId, {
      type: 'guestbook', from: fromId, message: '방명록을 남겼어요 📝',
    });
  }
  return { ok: true };
}

export async function deleteGuestbookEntry(entryId) {
  await deleteDoc(doc(db, '_guestbook', entryId));
}

// ── 댓글 ────────────────────────────────────────────────────────
export async function findCommentProfileOwner(fromId, dateKey, section) {
  const snap = await getDocs(collection(db, '_comments'));
  for (const d of snap.docs) {
    const data = d.data();
    if (data.from === fromId && data.dateKey === dateKey && data.section === section) {
      return data.to;
    }
  }
  return null;
}

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
  if (!getCurrentUserRef() || !message.trim()) return { error: '메시지를 입력해주세요.' };
  const fromId = _socialId();
  const cmtId = `cmt_${fromId}_${targetUserId}_${Date.now()}`;
  const comment = {
    id: cmtId, to: targetUserId, from: fromId,
    fromName: getCurrentUserRef().nickname || (getCurrentUserRef().lastName + getCurrentUserRef().firstName),
    dateKey, section, message: message.trim(),
    parentId: parentId || null,
    createdAt: Date.now(), updatedAt: null,
  };
  await setDoc(doc(db, '_comments', cmtId), comment);
  if (!_isMySocialId(targetUserId)) {
    await sendNotification(targetUserId, {
      type: parentId ? 'comment_reply' : 'comment',
      from: fromId, dateKey, section, targetUserId,
      message: parentId ? '댓글에 답글을 남겼어요 💬' : '댓글을 남겼어요 💬',
    });
  }
  if (parentId) {
    try {
      const parentSnap = await getDoc(doc(db, '_comments', parentId));
      if (parentSnap.exists()) {
        const parentData = parentSnap.data();
        if (parentData.from !== fromId && !_isMySocialId(parentData.from) && parentData.from !== targetUserId) {
          await sendNotification(parentData.from, {
            type: 'comment_reply', from: fromId, dateKey, section, targetUserId,
            message: '댓글에 답글을 남겼어요 💬',
          });
        }
      }
    } catch(e) { console.warn('[comment] parent notif:', e); }
  }
  return { ok: true, comment };
}

export async function editComment(commentId, newMessage) {
  if (!getCurrentUserRef() || !newMessage.trim()) return { error: '메시지를 입력해주세요.' };
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

// ── 좋아요 ──────────────────────────────────────────────────────
export async function toggleLike(targetUserId, dateKey, field, emoji) {
  if (!getCurrentUserRef()) return;
  const fromId = _socialId();
  const likeId = `${fromId}_${targetUserId}_${dateKey}_${field}`;
  const likeDoc = doc(db, '_likes', likeId);
  const snap = await getDoc(likeDoc);
  if (!snap.exists() && fromId !== getCurrentUserRef().id) {
    const legacyId = `${getCurrentUserRef().id}_${targetUserId}_${dateKey}_${field}`;
    const legacySnap = await getDoc(doc(db, '_likes', legacyId)).catch(() => null);
    if (legacySnap?.exists()) {
      await deleteDoc(doc(db, '_likes', legacyId));
      await setDoc(likeDoc, { ...legacySnap.data(), id: likeId, from: fromId });
      return true;
    }
  }
  if (snap.exists()) {
    if (emoji && snap.data().emoji !== emoji) {
      await setDoc(likeDoc, { ...snap.data(), emoji }, { merge: true });
      return true;
    }
    await deleteDoc(likeDoc);
    return false;
  } else {
    await setDoc(likeDoc, {
      id: likeId, from: fromId, to: targetUserId,
      dateKey, field, emoji: emoji || '👏', createdAt: Date.now(),
    });
    if (!_isMySocialId(targetUserId)) {
      await sendNotification(targetUserId, {
        type: 'like', from: fromId, dateKey, field,
        message: `${emoji || '👏'} 리액션을 보냈어요.`,
      });
    }
    return true;
  }
}

export async function getCheerStatus(friendId, dk) {
  if (!getCurrentUserRef()) return { iSent: false, theyCheerd: false };
  const myId = _socialId();
  const checks = [
    getDoc(doc(db, '_likes', `${myId}_${friendId}_${dk}_cheer`)).catch(() => null),
    getDoc(doc(db, '_likes', `${friendId}_${myId}_${dk}_cheer`)).catch(() => null),
  ];
  if (myId !== getCurrentUserRef().id) {
    checks.push(getDoc(doc(db, '_likes', `${getCurrentUserRef().id}_${friendId}_${dk}_cheer`)).catch(() => null));
    checks.push(getDoc(doc(db, '_likes', `${friendId}_${getCurrentUserRef().id}_${dk}_cheer`)).catch(() => null));
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

export async function getUnseenCheers(lastSeenAt = 0) {
  if (!getCurrentUserRef()) return [];
  try {
    const snap = await getDocs(collection(db, '_likes'));
    const cheers = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.field !== 'cheer') return;
      if (!_isMySocialId(data.to)) return;
      if ((data.createdAt || 0) <= (lastSeenAt || 0)) return;
      cheers.push(data);
    });
    cheers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return cheers;
  } catch {
    return [];
  }
}

export async function getHeroMessage(userId, dateKey) {
  try {
    const snap = await getDoc(doc(db, '_hero_messages', `${userId}_${dateKey}`));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[hero-message] get:', e);
    return null;
  }
}

export async function saveHeroMessage(targetUserId, dateKey, message, emoji = '') {
  const docId = `${targetUserId}_${dateKey}`;
  await setDoc(doc(db, '_hero_messages', docId), {
    id: docId,
    targetUserId,
    dateKey,
    message: (message || '').trim(),
    emoji: emoji || '',
    createdBy: _socialId(),
    createdAt: Date.now(),
    read: false,
    readAt: null,
  });
  return { ok: true, id: docId };
}

// ── FCM 토큰 ────────────────────────────────────────────────────
export async function saveFcmToken(token) {
  if (!getCurrentUserRef() || !token) return;
  const userId = _socialId();
  const tokenHash = _simpleHash(token);
  const docId = `${userId}_${tokenHash}`;
  await setDoc(doc(db, '_fcm_tokens', docId), {
    userId, token, updatedAt: Date.now(),
  });
}

export async function removeFcmToken(token) {
  if (!getCurrentUserRef() || !token) return;
  const userId = _socialId();
  const tokenHash = _simpleHash(token);
  const docId = `${userId}_${tokenHash}`;
  await deleteDoc(doc(db, '_fcm_tokens', docId));
}
