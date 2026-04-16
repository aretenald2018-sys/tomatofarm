// ================================================================
// data-analytics.js — 이벤트 트래킹 (일별 집계 → _analytics/{dateKey})
// ================================================================

import {
  db, doc, setDoc, getDoc, getDocs, collection,
  getCurrentUserRef,
} from './data-core.js';
import { dateKey, TODAY } from './data-date.js';

// ── 오늘 dateKey ─────────────────────────────────────────────────
function _todayKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

// ── 인메모리 버퍼 ────────────────────────────────────────────────
let _buffer = {};       // { tabVisits: {home:3}, socialActions: {리액션:1}, ... }
let _flushTimer = null;
const FLUSH_INTERVAL = 30_000; // 30초

function _ensureBuffer() {
  if (!_buffer.tabVisits)      _buffer.tabVisits = {};
  if (!_buffer.socialActions)  _buffer.socialActions = {};
  if (!_buffer.featuresUsed)   _buffer.featuresUsed = new Set();
}

// ── trackEvent: 앱 전역에서 호출하는 단일 진입점 ─────────────────
export function trackEvent(category, action, meta) {
  const uid = getCurrentUserRef()?.id;
  if (!uid) return;

  _ensureBuffer();

  switch (category) {
    case 'nav':
      // meta.tab = 탭 이름
      if (meta?.tab) {
        _buffer.tabVisits[meta.tab] = (_buffer.tabVisits[meta.tab] || 0) + 1;
      }
      break;

    case 'session':
      _buffer.sessions = (_buffer.sessions || 0) + 1;
      break;

    case 'core':
      if (action === 'exercise_logged') _buffer.exerciseLogged = true;
      if (action === 'diet_logged') {
        _buffer.dietLogged = true;
        if (meta?.meals)  _buffer.mealsLogged = meta.meals;
        if (meta?.kcal)   _buffer.kcalLogged = meta.kcal;
      }
      if (action === 'meal_photo_uploaded') _buffer.featuresUsed.add('photo_upload');
      break;

    case 'social':
      // action = 리액션, 방명록, 이웃요청, ...
      _buffer.socialActions[action] = (_buffer.socialActions[action] || 0) + 1;
      break;

    case 'ai':
      _buffer.featuresUsed.add(action); // ai_diet_rec, ai_workout_rec, ai_goal_analysis
      break;

    case 'gamification':
      if (action === 'tomato_harvested') _buffer.tomatoHarvested = true;
      if (action === 'streak_freeze_used') _buffer.featuresUsed.add('streak_freeze');
      break;

    case 'feature':
      if (action) _buffer.featuresUsed.add(action);
      break;

    default:
      break;
  }

  // 디바운스 flush
  if (!_flushTimer) {
    _flushTimer = setTimeout(() => { _flushTimer = null; flushAnalytics(); }, FLUSH_INTERVAL);
  }
}

// ── Firestore flush ──────────────────────────────────────────────
export async function flushAnalytics() {
  const uid = getCurrentUserRef()?.id;
  if (!uid) return;

  _ensureBuffer();

  // 버퍼에 기록된 게 없으면 skip
  const hasData = _buffer.sessions || _buffer.exerciseLogged || _buffer.dietLogged
    || _buffer.tomatoHarvested
    || Object.keys(_buffer.tabVisits).length > 0
    || Object.keys(_buffer.socialActions).length > 0
    || _buffer.featuresUsed.size > 0;
  if (!hasData) return;

  const dk = _todayKey();
  const prefix = `users.${uid}`;

  // dot-notation 업데이트 객체 구성
  const update = { date: dk };

  if (_buffer.sessions)        update[`${prefix}.sessions`]        = _buffer.sessions;
  if (_buffer.exerciseLogged)  update[`${prefix}.exerciseLogged`]  = true;
  if (_buffer.dietLogged)      update[`${prefix}.dietLogged`]      = true;
  if (_buffer.mealsLogged)     update[`${prefix}.mealsLogged`]     = _buffer.mealsLogged;
  if (_buffer.kcalLogged)      update[`${prefix}.kcalLogged`]      = _buffer.kcalLogged;
  if (_buffer.tomatoHarvested) update[`${prefix}.tomatoHarvested`] = true;

  // tabVisits
  for (const [tab, count] of Object.entries(_buffer.tabVisits)) {
    if (count > 0) update[`${prefix}.tabVisits.${tab}`] = count;
  }

  // socialActions
  for (const [action, count] of Object.entries(_buffer.socialActions)) {
    if (count > 0) update[`${prefix}.socialActions.${action}`] = count;
  }

  // featuresUsed — 배열로 변환
  if (_buffer.featuresUsed.size > 0) {
    update[`${prefix}.featuresUsed`] = [..._buffer.featuresUsed];
  }

  try {
    await setDoc(doc(db, '_analytics', dk), update, { merge: true });
    console.log('[analytics] flush OK:', dk, Object.keys(update).length, 'fields');
  } catch (e) {
    console.warn('[analytics] flush fail:', e);
  }

  // 버퍼 리셋
  _buffer = {};
}

// ── 앱 종료/백그라운드 시 flush ─────────────────────────────────
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAnalytics();
  });
  window.addEventListener('beforeunload', () => flushAnalytics());
}

// ── 읽기: 어드민 대시보드용 ──────────────────────────────────────

/** 최근 N일치 analytics 문서 로드 (날짜 내림차순) */
export async function getAnalytics(days = 30) {
  const results = [];
  const today = new Date(TODAY);

  // 병렬로 30개 문서 읽기
  const promises = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    promises.push(
      getDoc(doc(db, '_analytics', dk))
        .then(snap => snap.exists() ? { dk, ...snap.data() } : null)
        .catch(() => null)
    );
  }

  const docs = await Promise.all(promises);
  for (const d of docs) {
    if (d) results.push(d);
  }
  results.sort((a, b) => (a.dk > b.dk ? -1 : 1));
  return results;
}

/** 전체 analytics 컬렉션 로드 (히스토리 전체 필요 시) */
export async function getAllAnalytics() {
  const results = [];
  try {
    const snap = await getDocs(collection(db, '_analytics'));
    snap.forEach(d => results.push({ dk: d.id, ...d.data() }));
    results.sort((a, b) => (a.dk > b.dk ? -1 : 1));
  } catch (e) {
    console.warn('[analytics] getAllAnalytics fail:', e);
  }
  return results;
}

// ── API 사용량 집계 (어드민 전용) ────────────────────────────────
// _apiUsage/{YYYY-MM-DD}: { gemini_proxy, ocr_proxy, updatedAt } — 서버 측 증분
// _ocrQuota/{YYYY-MM}: { count } — OCR 월 하드 리밋(990)용, 기존 유지
/**
 * 최근 N일 API 사용량 + 이번 달 OCR 누적치 반환
 * @param {number} days 조회할 최근 일수 (default 30)
 * @returns {{daily: Array<{dk,gemini_proxy,ocr_proxy}>, ocrMonthly: {monthKey:string,count:number,limit:number}}}
 */
export async function getApiUsage(days = 30) {
  const today = new Date(TODAY);
  const daily = [];

  const dailyPromises = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    dailyPromises.push(
      getDoc(doc(db, '_apiUsage', dk))
        .then(snap => ({
          dk,
          gemini_proxy: snap.exists() ? (snap.data().gemini_proxy || 0) : 0,
          ocr_proxy:    snap.exists() ? (snap.data().ocr_proxy    || 0) : 0,
        }))
        .catch(() => ({ dk, gemini_proxy: 0, ocr_proxy: 0 }))
    );
  }
  const dailyDocs = await Promise.all(dailyPromises);
  for (const d of dailyDocs) daily.push(d);
  daily.sort((a, b) => (a.dk > b.dk ? -1 : 1)); // 최신순

  // 이번 달 OCR 누적 (functions/index.js _ocrQuotaKey는 UTC 기준)
  const nowUtc = new Date();
  const monthKey = `${nowUtc.getUTCFullYear()}-${String(nowUtc.getUTCMonth() + 1).padStart(2, '0')}`;
  let ocrMonthly = { monthKey, count: 0, limit: 990 };
  try {
    const snap = await getDoc(doc(db, '_ocrQuota', monthKey));
    if (snap.exists()) ocrMonthly.count = snap.data().count || 0;
  } catch (e) {
    console.warn('[apiUsage] ocrQuota read fail:', e?.message || e);
  }

  return { daily, ocrMonthly };
}
