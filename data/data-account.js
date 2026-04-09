// ================================================================
// data-account.js — 계정 CRUD, 복구, 삭제
// ================================================================

import {
  db, doc, setDoc, deleteDoc, getDocs, collection,
  ADMIN_ID, ADMIN_GUEST_ID,
} from './data-core.js';
import { isAdmin } from './data-auth.js';

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

export async function refreshCurrentUserFromDB() {
  const { getCurrentUserRef, setCurrentUserRef } = await import('./data-core.js');
  if (!getCurrentUserRef()) return;
  const accounts = await getAccountList();
  const fresh = accounts.find(a => a.id === getCurrentUserRef().id);
  if (fresh) {
    setCurrentUserRef(fresh);
    localStorage.setItem('currentUser', JSON.stringify(fresh));
  }
}

export async function recoverDeletedAccounts() {
  try {
    const existing = await getAccountList();
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

    missingIds.delete(ADMIN_ID);
    missingIds.delete(ADMIN_GUEST_ID);

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

export async function deleteUserAccount(userId) {
  if (!isAdmin()) throw new Error('관리자만 삭제 가능');
  if (userId === ADMIN_ID || userId === ADMIN_GUEST_ID) throw new Error('관리자 계정은 삭제 불가');

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

  await deleteDoc(doc(db, '_accounts', userId));
  console.log(`[deleteUser] ${userId} 계정 및 데이터 완전 삭제 완료`);
}
