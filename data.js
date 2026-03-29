// ================================================================
// data.js
// ================================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, deleteDoc,
  collection, getDocs, enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { CONFIG, MUSCLES } from './config.js';
import { INITIAL_WINES }  from './wine-data.js';

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

// ── 설정 캐시 (Firebase settings 컬렉션) ────────────────────────
const DEFAULT_TAB_ORDER = ['home','workout','cooking','monthly','calendar','wine','movie','stats','loa'];

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
};

function _setSyncStatus(state) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + state;
  txt.textContent = { ok:'동기화됨', syncing:'저장 중...', err:'오프라인 — 로컬 저장 후 자동 재시도' }[state] || state;
}

// ── 설정 Firebase 저장 헬퍼 ──────────────────────────────────────
async function _saveSetting(key, value) {
  _settings[key] = value;
  _setSyncStatus('syncing');
  try {
    await setDoc(doc(db, 'settings', key), { value });
    _setSyncStatus('ok');
  } catch(e) {
    _setSyncStatus('err');
    console.error('[data] _saveSetting:', e);
  }
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
  _setSyncStatus('syncing');
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
  try {
    if (isEmpty) { delete _cache[key]; await deleteDoc(doc(db, 'workouts', key)); }
    else { _cache[key] = data; await setDoc(doc(db, 'workouts', key), data); }
    _setSyncStatus('ok');
  } catch(e) { _setSyncStatus('err'); console.error('[data] saveDay:', e); }
}

export async function saveExercise(ex) {
  try {
    await setDoc(doc(db, 'exercises', ex.id), ex);
    const idx = _exList.findIndex(e => e.id === ex.id);
    if (idx >= 0) _exList[idx] = ex; else _exList.push(ex);
    _exList = _sortExList(_exList);
  } catch(e) { console.error('[data] saveExercise:', e); }
}

export async function deleteExercise(id) {
  try { await deleteDoc(doc(db, 'exercises', id)); _exList = _exList.filter(e => e.id !== id); }
  catch(e) { console.error('[data] deleteExercise:', e); }
}

export async function saveGoal(goal) {
  try {
    await setDoc(doc(db, 'goals', goal.id), goal);
    const idx = _goals.findIndex(g => g.id === goal.id);
    if (idx >= 0) _goals[idx] = goal; else _goals.push(goal);
  } catch(e) { console.error('[data] saveGoal:', e); }
}

export async function deleteGoal(id) {
  try { await deleteDoc(doc(db, 'goals', id)); _goals = _goals.filter(g => g.id !== id); }
  catch(e) { console.error('[data] deleteGoal:', e); }
}

export const getGoals = () => _goals;

export async function saveQuest(quest) {
  try {
    await setDoc(doc(db, 'quests', quest.id), quest);
    const idx = _quests.findIndex(q => q.id === quest.id);
    if (idx >= 0) _quests[idx] = quest; else _quests.push(quest);
  } catch(e) { console.error('[data] saveQuest:', e); }
}

export async function deleteQuest(id) {
  try { await deleteDoc(doc(db, 'quests', id)); _quests = _quests.filter(q => q.id !== id); }
  catch(e) { console.error('[data] deleteQuest:', e); }
}

export const getQuests = () => _quests;

export async function saveWine(wine) {
  try {
    await setDoc(doc(db, 'wines', wine.id), wine);
    const idx = _wines.findIndex(w => w.id === wine.id);
    if (idx >= 0) _wines[idx] = wine; else _wines.push(wine);
  } catch(e) { console.error('[data] saveWine:', e); }
}

export async function deleteWine(id) {
  try { await deleteDoc(doc(db, 'wines', id)); _wines = _wines.filter(w => w.id !== id); }
  catch(e) { console.error('[data] deleteWine:', e); }
}

export const getWines = () => _wines;

export async function saveEvent(ev) {
  try {
    await setDoc(doc(db, 'cal_events', ev.id), ev);
    const idx = _events.findIndex(e => e.id === ev.id);
    if (idx >= 0) _events[idx] = ev; else _events.push(ev);
  } catch(e) { console.error('[data] saveEvent:', e); }
}

export async function deleteEvent(id) {
  try {
    await deleteDoc(doc(db, 'cal_events', id));
    _events = _events.filter(e => e.id !== id);
    return { success: true };
  } catch(e) {
    console.error('[data] deleteEvent:', e);
    return { success: false, error: e.message };
  }
}

export const getEvents = () => _events;

export async function saveCooking(record) {
  try {
    await setDoc(doc(db, 'cooking', record.id), record);
    const idx = _cooking.findIndex(c => c.id === record.id);
    if (idx >= 0) _cooking[idx] = record; else _cooking.push(record);
  } catch(e) { console.error('[data] saveCooking:', e); }
}

export async function deleteCooking(id) {
  try { await deleteDoc(doc(db, 'cooking', id)); _cooking = _cooking.filter(c => c.id !== id); }
  catch(e) { console.error('[data] deleteCooking:', e); }
}

export const getCookingRecords  = () => _cooking;
export const getCookingForDate  = (dateStr) => _cooking.filter(c => c.date === dateStr);

// ── 체크인 (무제한) ───────────────────────────────────────────────
export async function saveBodyCheckin(rec) {
  try {
    await setDoc(doc(db, 'body_checkins', rec.id), rec);
    const idx = _bodyCheckins.findIndex(c => c.id === rec.id);
    if (idx >= 0) _bodyCheckins[idx] = rec; else _bodyCheckins.push(rec);
  } catch(e) { console.error('[data] saveBodyCheckin:', e); }
}
export async function deleteBodyCheckin(id) {
  try { await deleteDoc(doc(db, 'body_checkins', id)); _bodyCheckins = _bodyCheckins.filter(c => c.id !== id); }
  catch(e) { console.error('[data] deleteBodyCheckin:', e); }
}
export const getBodyCheckins = () => [..._bodyCheckins].sort((a,b) => (a.date||'').localeCompare(b.date||''));

// ── 나만의 영양 DB ────────────────────────────────────────────────
function _generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

export async function saveNutritionItem(item) {
  try {
    if (!item.id) item.id = _generateId();
    item.createdAt = item.createdAt || new Date().toISOString();
    item.updatedAt = new Date().toISOString();
    await setDoc(doc(db, 'nutrition_db', item.id), item);
    const idx = _nutritionDB.findIndex(n => n.id === item.id);
    if (idx >= 0) _nutritionDB[idx] = item; else _nutritionDB.push(item);
    return item;
  } catch(e) { console.error('[data] saveNutritionItem:', e); throw e; }
}

export async function deleteNutritionItem(id) {
  try { await deleteDoc(doc(db, 'nutrition_db', id)); _nutritionDB = _nutritionDB.filter(n => n.id !== id); }
  catch(e) { console.error('[data] deleteNutritionItem:', e); }
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
      const result = reader.result;
      const base64 = result.split(',')[1]; // data:image/jpeg;base64, 제거
      resolve(base64);
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

// 다이어트 계산 유틸
export function calcDietMetrics(plan) {
  const p = { ...DEFAULT_DIET_PLAN, ...plan };
  const bmr      = Math.round(13.7 * p.weight + 5 * p.height - 6.8 * p.age + 66);
  const tdeeCalc = Math.round(bmr * p.activityFactor);
  const tdee     = Math.ceil(tdeeCalc / 100) * 100; // 100단위 올림
  const lbm      = p.weight - (p.weight * p.bodyFatPct / 100); // 수정된 수식
  const fatMass  = p.weight * p.bodyFatPct / 100;
  const fatToLose = (p.weight * (p.bodyFatPct - p.targetBodyFatPct)) / 100;
  const totalWeightLoss = fatToLose / 0.713;
  const weeklyLossKg = p.weight * p.lossRatePerWeek;
  const calPerKgPerDay = 7700 / 7 / p.activityFactor; // 847 상수의 일반화
  const dailyDeficit = weeklyLossKg * calPerKgPerDay;
  const dailyIntake  = tdee - dailyDeficit;
  const weeksNeeded  = totalWeightLoss / weeklyLossKg;
  const weeklyKcal   = Math.round(dailyIntake * 7);
  const refeedTotal  = p.refeedKcal; // 이틀 합계
  const deficitDayKcal = Math.round((weeklyKcal - refeedTotal) / 5);
  const refeedDayKcal  = Math.round(refeedTotal / 2);
  // 탄단지 — 데피싯 데이
  const dProteinKcal = Math.round(deficitDayKcal * 0.41);
  const dCarbKcal    = Math.round(deficitDayKcal * 0.50);
  const dFatKcal     = Math.round(deficitDayKcal * 0.09);
  // 탄단지 — 리피드 데이
  const rProteinKcal = Math.round(refeedDayKcal * 0.29);
  const rCarbKcal    = Math.round(refeedDayKcal * 0.60);
  const rFatKcal     = Math.round(refeedDayKcal * 0.11);
  return {
    bmr, tdee, lbm, fatMass, fatToLose, totalWeightLoss,
    weeklyLossKg, weeklyLossG: Math.round(weeklyLossKg * 1000),
    dailyDeficit: Math.round(dailyDeficit), dailyIntake: Math.round(dailyIntake),
    weeksNeeded,
    deficit: {
      kcal: deficitDayKcal,
      proteinKcal: dProteinKcal, proteinG: Math.round(dProteinKcal / 4),
      carbKcal: dCarbKcal,       carbG:    Math.round(dCarbKcal / 4),
      fatKcal: dFatKcal,         fatG:     Math.round(dFatKcal / 9),
    },
    refeed: {
      kcal: refeedDayKcal,
      proteinKcal: rProteinKcal, proteinG: Math.round(rProteinKcal / 4),
      carbKcal: rCarbKcal,       carbG:    Math.round(rCarbKcal / 4),
      fatKcal: rFatKcal,         fatG:     Math.round(rFatKcal / 9),
    },
  };
}

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
    bReason:r.bReason||'', lReason:r.lReason||'', dReason:r.dReason||'',
    bFoods:r.bFoods||[], lFoods:r.lFoods||[], dFoods:r.dFoods||[], sFoods:r.sFoods||[],
  };
};

export const dietDayOk = (y,m,d) => {
  // 1. 날짜의 식단 데이터 로드
  const dt = getDiet(y,m,d);

  // 2. 사용자 설정 로드
  const plan = getDietPlan();
  const metrics = calcDietMetrics(plan);

  // 3. 오늘이 리피드데이인지 판정 (m은 0-indexed)
  const dayOfWeek = new Date(y, m, d).getDay();  // 0=일, 6=토
  const isRefeed = plan.refeedDays.includes(dayOfWeek);
  const limitKcal = isRefeed ? metrics.refeed.kcal : metrics.deficit.kcal;

  // 4. 오늘 섭취 총 칼로리 계산
  const totalKcal = (dt.bKcal || 0) + (dt.lKcal || 0) + (dt.dKcal || 0) + (dt.sKcal || 0);

  // 5. Skip 여부 확인
  const bSkip = getBreakfastSkipped(y, m, d);
  const lSkip = getLunchSkipped(y, m, d);
  const dSkip = getDinnerSkipped(y, m, d);

  // 6. 기록 유무 확인 (음식 또는 메모가 있는 경우)
  const hasRecord = dt.breakfast || dt.lunch || dt.dinner ||
                    (dt.bFoods?.length > 0) || (dt.lFoods?.length > 0) ||
                    (dt.dFoods?.length > 0) || (dt.sFoods?.length > 0);

  // 아무 기록도 없고 스킵도 안 했다면 null (빈 칸)
  if (!hasRecord && !bSkip && !lSkip && !dSkip) return null;

  // 7. 핵심: 칼로리 제한 비교 (saveWorkoutDay와 동일한 +50kcal 허용)
  const calorieSuccess = totalKcal <= limitKcal + 50;

  // 8. 각 끼니별 성공 여부
  const bOk = bSkip || (dt.bOk ?? false);
  const lOk = lSkip || (dt.lOk ?? false);
  const dOk = dSkip || (dt.dOk ?? false);

  // 9. 최종 결과 반환
  // (모든 끼니가 기록/스킵됨) AND (총 칼로리가 제한선 이하)
  return bOk && lOk && dOk && calorieSuccess;
};

export const calcVolume = (sets) =>
  (sets||[]).reduce((sum, s) => {
    if (s.setType === 'warmup') return sum;
    if (!s.done && s.done !== undefined) return sum;
    return sum + (s.kg||0) * (s.reps||0);
  }, 0);

export const calcVolumeAll = (sets) =>
  (sets||[]).reduce((sum, s) => sum + (s.kg||0) * (s.reps||0), 0);

export const getVolumeHistory = (exerciseId) =>
  Object.entries(_cache)
    .filter(([, day]) => (day.exercises||[]).some(e => e.exerciseId === exerciseId))
    .map(([key, day]) => {
      const entry = day.exercises.find(e => e.exerciseId === exerciseId);
      return { date: key, volume: calcVolume(entry.sets) };
    })
    .filter(h => h.volume > 0)
    .sort((a,b) => a.date.localeCompare(b.date));

export const getLastSession = (exerciseId) => {
  const entries = Object.entries(_cache)
    .filter(([, day]) => (day.exercises||[]).some(e => e.exerciseId === exerciseId))
    .sort(([a],[b]) => b.localeCompare(a));
  if (!entries.length) return null;
  const [date, day] = entries[0];
  const entry = day.exercises.find(e => e.exerciseId === exerciseId);
  return { date, sets: entry.sets };
};

export function calcStreaks() {
  let workout=0, diet=0, stretching=0, wineFree=0;
  let cur = new Date(TODAY);

  while (true) {
    const y=cur.getFullYear(), m=cur.getMonth(), d=cur.getDate();
    if (!getMuscles(y,m,d).length && !getCF(y,m,d)) break;
    workout++; cur.setDate(cur.getDate()-1);
  }
  cur = new Date(TODAY);
  while (true) {
    const y=cur.getFullYear(), m=cur.getMonth(), d=cur.getDate();
    const dok = dietDayOk(y,m,d);
    if (dok === false) break;          // 실패한 날 → streak 끊김
    if (dok === true) diet++;          // 성공한 날 → streak 카운트
    if (dok === null && cur < TODAY) break; // 과거 미기록 날 → streak 끊김
    // dok === null && 오늘 → 아직 미입력, 건너뛰고 어제부터 계산
    cur.setDate(cur.getDate()-1);
  }
  cur = new Date(TODAY);
  while (true) {
    const y=cur.getFullYear(), m=cur.getMonth(), d=cur.getDate();
    if (!getStretching(y,m,d)) break;
    stretching++; cur.setDate(cur.getDate()-1);
  }
  cur = new Date(TODAY);
  while (true) {
    const y=cur.getFullYear(), m=cur.getMonth(), d=cur.getDate();
    if (!getWineFree(y,m,d)) break;
    wineFree++; cur.setDate(cur.getDate()-1);
  }

  return { workout, diet, stretching, wineFree };
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

export async function saveMovieData(year, month, data) {
  const key = `${year}-${String(month + 1).padStart(2, '0')}`;
  _movies[key] = data;
  _setSyncStatus('syncing');
  try {
    await setDoc(doc(db, 'movies', key), data);
    _setSyncStatus('ok');
  } catch(e) {
    _setSyncStatus('err');
    console.error('[data] saveMovieData:', e);
  }
}

export function getAllMovieMonths() {
  return Object.keys(_movies).sort();
}

// ── Window 전역 노출 (UI에서 직접 접근 가능) ────────────────────────
window.getStreakSettings = getStreakSettings;
window.saveStreakSettings = saveStreakSettings;
