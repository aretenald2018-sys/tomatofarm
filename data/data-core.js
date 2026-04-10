// ================================================================
// data-core.js — 공유 상태 + Firebase 기반 + 유틸리티 래퍼
// ================================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc,
  collection, getDocs, query, where, documentId, enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { CONFIG } from '../config.js';

// ── Firebase 초기화 ─────────────────────────────────────────────
const app = initializeApp(CONFIG.FIREBASE);
export const db  = getFirestore(app);

enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[data] 멀티탭 환경 감지 — 다른 탭의 대시보드를 닫아주세요');
  } else if (err.code === 'unimplemented') {
    console.warn('[data] 브라우저가 오프라인 캐시 미지원');
  } else {
    console.warn('[data] IndexedDB 초기화 실패:', err.code);
  }
});

// Firestore 함수 re-export (하위 모듈용)
export { doc, setDoc, deleteDoc, getDoc, collection, getDocs, query, where, documentId };

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

export async function _idbSet(key, value) {
  try {
    const idb = await _openIDB();
    const tx = idb.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).put(value, key);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    idb.close();
  } catch {}
}

export async function _idbGet(key) {
  try {
    const idb = await _openIDB();
    const tx = idb.transaction(_IDB_STORE, 'readonly');
    const req = tx.objectStore(_IDB_STORE).get(key);
    const result = await new Promise((r, j) => { req.onsuccess = () => r(req.result); req.onerror = j; });
    idb.close();
    return result;
  } catch { return null; }
}

export async function _idbRemove(key) {
  try {
    const idb = await _openIDB();
    const tx = idb.transaction(_IDB_STORE, 'readwrite');
    tx.objectStore(_IDB_STORE).delete(key);
    await new Promise((r, j) => { tx.oncomplete = r; tx.onerror = j; });
    idb.close();
  } catch {}
}

// ── 사용자 상태 (핵심 공유 상태) ────────────────────────────────
let _currentUser = null;
export function getCurrentUserRef()  { return _currentUser; }
export function setCurrentUserRef(u) { _currentUser = u; }

export const ADMIN_ID       = '김_태우';
export const ADMIN_GUEST_ID = '김_태우(guest)';

export function getDataOwnerId() {
  if (!_currentUser) return null;
  if (_currentUser.id === ADMIN_GUEST_ID) return ADMIN_ID;
  return _currentUser.id;
}

// ── Firebase 경로 헬퍼 ──────────────────────────────────────────
export function _col(name) {
  const ownerId = getDataOwnerId();
  if (!ownerId) {
    console.warn('[data] _col called without user! collection:', name);
    return collection(db, '_orphan', name);
  }
  return collection(db, 'users', ownerId, name);
}

export function _doc(name, id) {
  const ownerId = getDataOwnerId();
  if (!ownerId) {
    console.warn('[data] _doc called without user! doc:', name, id);
    return doc(db, '_orphan', name, id);
  }
  return doc(db, 'users', ownerId, name, id);
}

// ── 공유 데이터 캐시 ────────────────────────────────────────────
export let _cache        = {};
export let _exList       = [];
export let _goals        = [];
export let _quests       = [];
export let _cooking      = [];
export let _bodyCheckins = [];
export let _nutritionDB  = [];

// setter (ES module let 바인딩은 외부에서 직접 대입 불가)
export function _setCache(v)        { _cache = v; }
export function _setExList(v)       { _exList = v; }
export function _setGoals(v)        { _goals = v; }
export function _setQuests(v)       { _quests = v; }
export function _setCooking(v)      { _cooking = v; }
export function _setBodyCheckins(v) { _bodyCheckins = v; }
export function _setNutritionDB(v)  { _nutritionDB = v; }

// ── 설정 캐시 ───────────────────────────────────────────────────
export const DEFAULT_TAB_ORDER = ['home','workout','cooking','monthly','stats'];
export const DEFAULT_VISIBLE_TABS = ['home','diet','workout','stats'];

export const DEFAULT_DIET_PLAN = {
  height: null, weight: null, bodyFatPct: null, age: null,
  targetWeight: null, targetBodyFatPct: null,
  activityFactor: 1.3,
  lossRatePerWeek: 0.009,
  refeedKcal: 5000,
  refeedDays: [0, 6],
  startDate: null,
  advancedMode: false,
  deficitProteinPct: 41, deficitCarbPct: 50, deficitFatPct: 9,
  refeedProteinPct: 29, refeedCarbPct: 60, refeedFatPct: 11,
  dietTolerance: 50,
  exerciseCalorieCredit: false,
  exerciseKcalGym: 250, exerciseKcalCF: 300,
  exerciseKcalSwimming: 200, exerciseKcalRunning: 250,
};

export let _dietPlan = { ...DEFAULT_DIET_PLAN };
export function _setDietPlan(v) { _dietPlan = v; }

export let _settings = {
  quest_order:      ['quarterly','monthly','weekly','daily'],
  section_titles:   {},
  mini_memo_items:  [],
  weekly_memos:     {},
  tab_order:        DEFAULT_TAB_ORDER,
  visible_tabs:     null,
  diet_plan:        null,
  streak_settings:  { fontSizeMode: 'default', cellWidthMode: 'default' },
  home_streak_days: 6,
  unit_goal_start: null,
  tomato_state: { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 },
  milestone_shown: {},
  streak_freezes: [],
};
export function _resetSettings(v) { Object.assign(_settings, v); }

// ── 토마토 사이클 캐시 ──────────────────────────────────────────
export let _tomatoCycles = [];
export function _setTomatoCycles(v) { _tomatoCycles = v; }

// ── 동기화 상태 UI ──────────────────────────────────────────────
export function _setSyncStatus(state) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + state;
  txt.textContent = { ok:'동기화됨', syncing:'저장 중...', err:'오프라인 — 로컬 저장 후 자동 재시도' }[state] || state;
}

// ── Firebase 작업 래퍼 ──────────────────────────────────────────
export async function _fbOp(label, fn, { sync = true, rethrow = false } = {}) {
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

// ── 설정 저장 헬퍼 ──────────────────────────────────────────────
export async function _saveSetting(key, value) {
  _settings[key] = value;
  return _fbOp(`saveSetting(${key})`, () => setDoc(_doc('settings', key), { value }));
}

// ── localStorage 마이그레이션 헬퍼 ──────────────────────────────
export function _migrateFromLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch { return fallback; }
}

// ── ID 생성 ─────────────────────────────────────────────────────
export function _generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }
