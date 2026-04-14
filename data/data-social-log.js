// ================================================================
// data-social-log.js — 로그인/액션 로그, 튜토리얼, 패치노트
// ================================================================

import {
  db, doc, setDoc, updateDoc, getDoc, arrayUnion, getCurrentUserRef,
} from './data-core.js';
import { trackEvent } from './data-analytics.js';

export async function recordLogin() {
  if (!getCurrentUserRef()?.id) return;
  const uid = getCurrentUserRef().id;
  trackEvent('session', 'session_start');
  try {
    await setDoc(doc(db, '_accounts', uid), { lastLoginAt: Date.now() }, { merge: true });
  } catch(e) { console.warn('[track] login:', e); }
}

export async function recordTutorialDone() {
  if (!getCurrentUserRef()?.id) return;
  const uid = getCurrentUserRef().id;
  try {
    await setDoc(doc(db, '_accounts', uid), { tutorialDoneAt: Date.now() }, { merge: true });
  } catch(e) { console.warn('[track] tutorial:', e); }
}

export async function markPatchnoteRead(patchnoteId) {
  if (!patchnoteId || !getCurrentUserRef()) return;
  const uid = getCurrentUserRef().id;
  try {
    // 원자적 append — 동시 열람에서 다른 유저의 readBy가 유실되지 않음.
    await updateDoc(doc(db, '_patchnotes', patchnoteId), { readBy: arrayUnion(uid) });
  } catch(e) {
    // 문서가 없거나 updateDoc이 실패한 경우: 보수적으로 setDoc merge + arrayUnion 재시도
    try {
      await setDoc(doc(db, '_patchnotes', patchnoteId), { readBy: arrayUnion(uid) }, { merge: true });
    } catch(e2) {
      console.warn('[track] patchnote read:', e2);
    }
  }
}

export async function getPatchnote(patchnoteId) {
  if (!patchnoteId) return null;
  try {
    const pnDoc = await getDoc(doc(db, '_patchnotes', patchnoteId));
    if (!pnDoc.exists()) return null;
    return pnDoc.data();
  } catch(e) {
    console.warn('[patchnote] get:', e);
    return null;
  }
}

export async function getLatestPatchnote() {
  try {
    const { collection, getDocs } = await import('./data-core.js');
    const snap = await getDocs(collection(db, '_patchnotes'));
    let latest = null;
    snap.forEach((d) => {
      const pn = d.data();
      if (!latest || (pn.createdAt || 0) > (latest.createdAt || 0)) latest = pn;
    });
    return latest;
  } catch(e) {
    console.warn('[patchnote] latest:', e);
    return null;
  }
}

export async function createPatchnote({ title, body }) {
  const id = `pn_${Date.now()}`;
  const payload = {
    id,
    title: title || '',
    body: body || '',
    createdAt: Date.now(),
    readBy: [],
  };
  await setDoc(doc(db, '_patchnotes', id), payload);
  return payload;
}

export async function recordAction(action) {
  if (!getCurrentUserRef()?.id) return;
  const uid = getCurrentUserRef().id;
  trackEvent('social', action);
  try {
    const accDoc = await getDoc(doc(db, '_accounts', uid));
    const data = accDoc.exists() ? accDoc.data() : {};
    const log = (data.actionLog || []).slice(-29);
    log.push({ action, at: Date.now() });
    await setDoc(doc(db, '_accounts', uid), { actionLog: log }, { merge: true });
  } catch(e) { console.warn('[track] action:', e); }
}
