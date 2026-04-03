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
  getLastSession   as _getLastSession,
  getDayTargetKcal as _getDayTargetKcal,
} from './calc.js';

const app = initializeApp(CONFIG.FIREBASE);
const db  = getFirestore(app);

// Firebase IndexedDB 오프라인 캐싱 설정
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    // 멀티탭 환경: 이전 탭을 닫으면 해결됨
    console.warn('[data] 멀티탭 환경 감지 — 다른 탭의 대시보드를 닫아주세요');
  } else if (err.code === 'unimplemented') {
    console.warn('[data] 브라우저가 오프라인 캐시 미지원 — 온라인 모드로 작동합니다');
  } else {
    console.warn('[data] IndexedDB 초기화 실패:', err.code);
  }
});

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

const DEFAULT_DIET_PLAN = {
  // 신체 정보
  height: 175, weight: 75, bodyFatPct: 17, age: 32,
  // 목표
  targetWeight: 68, targetBodyFatPct: 8,
  // 운동과학 파라미터
  activityFactor: 1.3,     // 유지대사량 활동계수 (고정값, 847 상수 기반)
  lossRatePerWeek: 0.009,  // 주당 감량 비율 (트레이너 권장 0.9%, 조정 가능)
  refeedKcal: 5000,        // 리피드 이틀 합계 kcal (조정 가능)
  refeedDays: [0, 6],      // 0=일요일, 6=토요일
  // 플랜 시작일
  startDate: null,
};

let _dietPlan = { ...DEFAULT_DIET_PLAN };

let _settings = {
  quest_order:      ['quarterly','monthly','weekly','daily'],
  section_titles:   {},
  stock_purchases:  {},
  mini_memo_items:  [],   // [{id, text, checked}]
  weekly_memos:     {},
  tab_order:        DEFAULT_TAB_ORDER,
  diet_plan:        null,
  streak_settings:  {
    fontSizeMode: 'default',  // 'small' | 'default' | 'large'
    cellWidthMode: 'default'  // 'small' | 'default' | 'large'
  },
  home_streak_days: 6,        // 0~6: 월요일 이후 추가 표시 일수 (6 = 일요일까지)
  unit_goal_start: null,      // YYYY-MM-DD: 4일 단위 목표 시작일
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
  return _fbOp(`saveSetting(${key})`, () => setDoc(doc(db, 'settings', key), { value }));
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
    const snap = await getDocs(collection(db, 'workouts'));
    snap.forEach(d => { _cache[d.id] = d.data(); });

    const exSnap = await getDocs(collection(db, 'exercises'));
    const custom = [];
    exSnap.forEach(d => custom.push(d.data()));
    const customIds = new Set(custom.map(e => e.id));
    const defaults  = CONFIG.DEFAULT_EXERCISES.filter(e => !customIds.has(e.id));
    _exList = _sortExList([...defaults, ...custom]);

    const goalSnap = await getDocs(collection(db, 'goals'));
    _goals = [];
    goalSnap.forEach(d => _goals.push(d.data()));

    const wineSnap = await getDocs(collection(db, 'wines'));
    _wines = [];
    wineSnap.forEach(d => _wines.push(d.data()));
    if (_wines.length === 0) {
      for (const wine of INITIAL_WINES) await setDoc(doc(db, 'wines', wine.id), wine);
      _wines = [...INITIAL_WINES];
    }

    const questSnap = await getDocs(collection(db, 'quests'));
    _quests = [];
    questSnap.forEach(d => _quests.push(d.data()));

    const eventSnap = await getDocs(collection(db, 'cal_events'));
    _events = [];
    eventSnap.forEach(d => _events.push(d.data()));

    const cookSnap = await getDocs(collection(db, 'cooking'));
    _cooking = [];
    cookSnap.forEach(d => _cooking.push(d.data()));

    const checkinSnap = await getDocs(collection(db, 'body_checkins'));
    _bodyCheckins = [];
    checkinSnap.forEach(d => _bodyCheckins.push(d.data()));

    const nutritionSnap = await getDocs(collection(db, 'nutrition_db'));
    _nutritionDB = [];
    nutritionSnap.forEach(d => _nutritionDB.push(d.data()));

    // ── 재무 데이터 로드 ──
    const finBenchSnap = await getDocs(collection(db, 'finance_benchmarks'));
    _finBenchmarks = [];
    finBenchSnap.forEach(d => _finBenchmarks.push(d.data()));

    const finActSnap = await getDocs(collection(db, 'finance_actuals'));
    _finActuals = [];
    finActSnap.forEach(d => _finActuals.push(d.data()));

    const finLoanSnap = await getDocs(collection(db, 'finance_loans'));
    _finLoans = [];
    finLoanSnap.forEach(d => _finLoans.push(d.data()));

    const finPosSnap = await getDocs(collection(db, 'finance_positions'));
    _finPositions = [];
    finPosSnap.forEach(d => _finPositions.push(d.data()));

    const finPlanSnap = await getDocs(collection(db, 'finance_plans'));
    _finPlans = [];
    finPlanSnap.forEach(d => _finPlans.push(d.data()));

    const finBudgetSnap = await getDocs(collection(db, 'finance_budgets'));
    _finBudgets = [];
    finBudgetSnap.forEach(d => _finBudgets.push(d.data()));

    // ── 영화 데이터 로드 ──
    const movieSnap = await getDocs(collection(db, 'movies'));
    _movies = {};
    movieSnap.forEach(d => {
      const data = d.data();
      _movies[d.id] = data;
    });

    // ── 설정 로드 (Firebase → localStorage 마이그레이션 포함) ──
    const settingsSnap = await getDocs(collection(db, 'settings'));
    const fbMap = {};
    settingsSnap.forEach(d => { fbMap[d.id] = d.data().value; });

    _settings.quest_order    = fbMap.quest_order    ?? _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = fbMap.section_titles ?? _migrateFromLS('section_titles', {});
    _settings.stock_purchases= fbMap.stock_purchases?? _migrateFromLS('stock_purchases', {});
    _settings.mini_memo_items= fbMap.mini_memo_items?? [];
    _settings.weekly_memos   = fbMap.weekly_memos   ?? _migrateFromLS('weekly_memos',   {});
    _settings.tab_order      = fbMap.tab_order      ?? DEFAULT_TAB_ORDER;
    _settings.diet_plan      = fbMap.diet_plan      ?? null;
    _settings.streak_settings= fbMap.streak_settings ?? { fontSizeMode: 'default', cellWidthMode: 'default' };
    _settings.home_streak_days = fbMap.home_streak_days ?? 6;
    _settings.unit_goal_start  = fbMap.unit_goal_start  ?? null;
    if (_settings.diet_plan) Object.assign(_dietPlan, _settings.diet_plan);

    // localStorage 데이터를 Firebase로 마이그레이션 (최초 1회)
    for (const key of ['quest_order','section_titles','stock_purchases','weekly_memos']) {
      if (!fbMap[key] && JSON.stringify(_settings[key]) !== JSON.stringify(
          key === 'quest_order' ? ['quarterly','monthly','weekly','daily'] : {}
      )) {
        await setDoc(doc(db, 'settings', key), { value: _settings[key] }).catch(() => {});
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
    !data.bFoods?.length && !data.lFoods?.length && !data.dFoods?.length && !data.sFoods?.length
  );
  return _fbOp('saveDay', async () => {
    if (isEmpty) { delete _cache[key]; await deleteDoc(doc(db, 'workouts', key)); }
    else { _cache[key] = data; await setDoc(doc(db, 'workouts', key), data); }
  });
}

export async function saveExercise(ex) {
  return _fbOp('saveExercise', async () => {
    await setDoc(doc(db, 'exercises', ex.id), ex);
    const idx = _exList.findIndex(e => e.id === ex.id);
    if (idx >= 0) _exList[idx] = ex; else _exList.push(ex);
    _exList = _sortExList(_exList);
  }, { sync: false });
}

export async function deleteExercise(id) {
  return _fbOp('deleteExercise', async () => {
    await deleteDoc(doc(db, 'exercises', id));
    _exList = _exList.filter(e => e.id !== id);
  }, { sync: false });
}

// ── CRUD 팩토리 — 반복 패턴 제거 ─────────────────────────────────
function _createCRUD(collectionName, getArray, setArray) {
  return {
    save: (item) => _fbOp(`save:${collectionName}`, async () => {
      await setDoc(doc(db, collectionName, item.id), item);
      const arr = getArray();
      const idx = arr.findIndex(x => x.id === item.id);
      if (idx >= 0) arr[idx] = item; else arr.push(item);
    }, { sync: false }),
    delete: (id) => _fbOp(`delete:${collectionName}`, async () => {
      await deleteDoc(doc(db, collectionName, id));
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
      await deleteDoc(doc(db, 'cal_events', id));
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
    await setDoc(doc(db, 'nutrition_db', item.id), item);
    const idx = _nutritionDB.findIndex(n => n.id === item.id);
    if (idx >= 0) _nutritionDB[idx] = item; else _nutritionDB.push(item);
    return item;
  }, { sync: false, rethrow: true });
}

export async function deleteNutritionItem(id) {
  return _fbOp('deleteNutritionItem', async () => {
    await deleteDoc(doc(db, 'nutrition_db', id));
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
        // 최대 1024px로 리사이징 (Anthropic API 권장 + fetch 안정성)
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else                { width  = Math.round(width  * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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
export const getDietPlan = () => ({ ...DEFAULT_DIET_PLAN, ..._settings.diet_plan });
export const saveDietPlan = async (plan) => {
  const merged = { ...(getDietPlan()), ...plan };
  Object.assign(_dietPlan, merged);
  return _saveSetting('diet_plan', merged);
};

// 다이어트 계산 유틸 — 실제 로직은 calc.js에서 관리
export const calcDietMetrics = _calcDietMetrics;
export const isDietDaySuccess = _isDietDaySuccess;
export const getDayTargetKcal = (plan, y, m, d) => _getDayTargetKcal(plan, y, m, d);

export const getExList    = ()      => _exList;
export const getCache     = ()      => _cache;
export const getDay       = (y,m,d) => _cache[dateKey(y,m,d)] || {};
export const getExercises = (y,m,d) => getDay(y,m,d).exercises || [];
export const getMuscles   = (y,m,d) => [...new Set(getExercises(y,m,d).map(e => e.muscleId))];
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

export const getUnitGoalStart = () => _settings.unit_goal_start ?? null;
export async function saveUnitGoalStart(dateStr) {
  _settings.unit_goal_start = dateStr;
  await _saveSetting('unit_goal_start', dateStr);
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
    const snap = await getDoc(doc(db, 'movies', key));
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
    const snap = await getDoc(doc(db, 'movies', key));
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
  return _fbOp('saveMovieData', () => setDoc(doc(db, 'movies', key), data));
}

export function getAllMovieMonths() {
  return Object.keys(_movies).sort();
}

// ── Window 전역 노출 (UI에서 직접 접근 가능) ────────────────────────
window.getStreakSettings = getStreakSettings;
window.saveStreakSettings = saveStreakSettings;
