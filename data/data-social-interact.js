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
  await setDoc(doc(db, '_notifications', notifId), { read: true }, { merge: true });
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
