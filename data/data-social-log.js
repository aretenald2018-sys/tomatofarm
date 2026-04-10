// ================================================================
// data-social-log.js — 로그인/액션 로그, 튜토리얼, 패치노트
// ================================================================

import {
  db, doc, setDoc, getDoc, getCurrentUserRef,
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
  if (!getCurrentUserRef()) return;
  try {
    const pnDoc = await getDoc(doc(db, '_patchnotes', patchnoteId));
    if (!pnDoc.exists()) return;
    const data = pnDoc.data();
    const readBy = data.readBy || [];
    const uid = getCurrentUserRef().id;
    if (!readBy.includes(uid)) {
      readBy.push(uid);
      await setDoc(doc(db, '_patchnotes', patchnoteId), { readBy }, { merge: true });
    }
  } catch(e) { console.warn('[track] patchnote read:', e); }
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
