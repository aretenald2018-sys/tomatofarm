// ================================================================
// tests/helpers/fake-data-layer.js — 브라우저 하네스용 인메모리 data.js 대역
// ================================================================
// data.js는 6줄짜리 배럴이고 Firebase를 건드리는 경로는 전부 이 배럴을 지난다.
// 그래서 importmap으로 data.js만 이 모듈로 갈아끼우면 데이터 레이어가 통째로
// 교체된다. data/data-core.js가 아예 import되지 않으므로 initializeApp도,
// 프로덕션 Firestore 요청도 일어나지 않는다.
//
// 순수 계산(calc.js, data/data-date.js, data/season-model.js)은 진짜 구현을
// 그대로 재수출한다. 화면이 읽는 값은 실제 로직으로 계산되어야 회귀를 잡는다.
// 저장/조회만 모듈 스코프 fake store로 대체한다.
//
// 새 흐름을 추가할 때는 store에 필드를 늘리고 그 필드를 읽는 facade 함수를
// 붙이면 된다. `() => null` 스텁을 쌓지 말 것 — 화면이 못 읽으면 렌더가 조용히
// 비어버리고 테스트가 통과하는 것처럼 보인다.

import { dateKey, TODAY, isFuture } from '../../data/data-date.js';
import {
  calcDietMetrics as _calcDietMetrics,
  calcExerciseCalorieCredit as _calcExerciseCalorieCredit,
  detectPRs as _detectPRs,
  dietDayOk as _dietDayOk,
  getDayTargetKcal as _getDayTargetKcal,
  getLastActivitySession as _getLastActivitySession,
  getLastSession as _getLastSession,
  getVolumeHistory as _getVolumeHistory,
  isDietDaySuccess as _isDietDaySuccess,
} from '../../calc.js';
import {
  normalizeSeasonRegistry,
  selectSeasonDecisionCache,
} from '../../data/season-model.js';

export { dateKey, TODAY, isFuture };
export const calcDietMetrics = _calcDietMetrics;
export const calcExerciseCalorieCredit = _calcExerciseCalorieCredit;
export const isDietDaySuccess = _isDietDaySuccess;

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function emptyStore() {
  return {
    // 날짜별 일지. getCache()가 돌려주는 객체와 같은 identity를 유지해야
    // 낙관적 렌더(cache[key] = {...})가 실제 앱과 똑같이 동작한다.
    cache: {},
    exercises: [],
    gyms: [],
    muscleParts: [],
    customMuscles: [],
    bodyCheckins: [],
    dietPlan: null,
    nutritionDB: [],
    recentNutritionItems: [],
    cookingRecords: [],
    routineTemplates: [],
    equipmentByGym: {},
    settings: {},
    currentUser: null,
    runningRoutes: {},
    // 호출 로그 — 테스트가 "무엇이 저장됐는가"를 사실로 확인할 때 쓴다.
    savedDays: [],
    savedNutritionItems: [],
    deletedNutritionItemIds: [],
    trackedEvents: [],
  };
}

export const fakeDataStore = emptyStore();

export function resetFakeDataLayer(seed = {}) {
  const fresh = emptyStore();
  for (const key of Object.keys(fakeDataStore)) delete fakeDataStore[key];
  Object.assign(fakeDataStore, fresh, seed);
  // cache는 identity가 유지되어야 하므로 seed 값을 그대로 물려받되 객체는 새로.
  fakeDataStore.cache = { ...(seed.cache || {}) };
  return fakeDataStore;
}

function mergeDeep(target, patch) {
  const out = { ...(target || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = mergeDeep(out[key], value);
      continue;
    }
    out[key] = clone(value);
  }
  return out;
}

// ── 일지 캐시 ────────────────────────────────────────────────────
export const getCache = () => fakeDataStore.cache;
export const getAllDateKeys = () => Object.keys(fakeDataStore.cache).filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
export const getDay = (y, m, d) => fakeDataStore.cache[dateKey(y, m, d)] || {};
export const getExercises = (y, m, d) => getDay(y, m, d).exercises || [];
export const getMemo = (y, m, d) => getDay(y, m, d).memo || '';
export const getDiet = (y, m, d) => {
  const day = getDay(y, m, d);
  return { bFoods: day.bFoods || [], lFoods: day.lFoods || [], dFoods: day.dFoods || [], sFoods: day.sFoods || [] };
};

export async function saveDay(key, patch = {}, options = {}) {
  const mode = options?.mode === 'replace' ? 'replace' : 'merge';
  const previous = fakeDataStore.cache[key] || {};
  fakeDataStore.cache[key] = mode === 'replace' ? clone(patch) : mergeDeep(previous, patch);
  fakeDataStore.savedDays.push({ key, patch: clone(patch), mode, at: Date.now() });
  return true;
}

export async function ensureWorkoutDayCached(key) {
  return fakeDataStore.cache[key] || {};
}

export function hasExerciseRecord(y, m, d) {
  return (getDay(y, m, d).exercises || []).length > 0;
}

// ── 시즌 ─────────────────────────────────────────────────────────
export function getSeasonRegistry() {
  return normalizeSeasonRegistry(fakeDataStore.settings.season_registry || {});
}
export function getSeasonDecisionCache(referenceDateKey = null) {
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const reference = /^\d{4}-\d{2}-\d{2}$/.test(String(referenceDateKey || '')) ? String(referenceDateKey) : todayKey;
  return selectSeasonDecisionCache(fakeDataStore.cache, fakeDataStore.settings.season_registry || {}, reference);
}
export const getSeasonWorkoutPlan = (seasonId) => clone(fakeDataStore.settings[`season_${seasonId}_workout_plan`] || null);
export const getSeasonTestBoardV2 = (seasonId) => clone(fakeDataStore.settings[`season_${seasonId}_test_board_v2`] || null);
export const getSeasonRunningPlan = (seasonId) => clone(fakeDataStore.settings[`season_${seasonId}_running_plan`] || null);
export async function createWorkoutSeason() { throw new Error('fake-data-layer: createWorkoutSeason is not wired for this harness'); }
export async function updateWorkoutSeason() { throw new Error('fake-data-layer: updateWorkoutSeason is not wired for this harness'); }

// ── 통계/기록 파생값 (진짜 calc.js 구현 사용) ────────────────────
export const getVolumeHistory = (exerciseId) => _getVolumeHistory(getSeasonDecisionCache(), exerciseId);
export const getLastSession = (exerciseId, excludeDateKey = null) => _getLastSession(getSeasonDecisionCache(excludeDateKey), exerciseId, excludeDateKey);
export const getLastActivitySession = (type, excludeDateKey = null) => _getLastActivitySession(getSeasonDecisionCache(excludeDateKey), type, excludeDateKey);
export const detectPRs = (exerciseId) => _detectPRs(getSeasonDecisionCache(), exerciseId);
export const getDayTargetKcal = (plan, y, m, d, dayData) => _getDayTargetKcal(plan, y, m, d, dayData);
export const dietDayOk = (y, m, d) => _dietDayOk(getDay(y, m, d), getDietPlan(), y, m, d);

// ── 운동 카탈로그 ────────────────────────────────────────────────
export const getExList = () => fakeDataStore.exercises;
export const getGlobalExList = () => fakeDataStore.exercises;
export const getGymExList = () => [];
export const getGyms = () => fakeDataStore.gyms;
export const getMuscleParts = () => fakeDataStore.muscleParts;
export const getCustomMuscles = () => fakeDataStore.customMuscles;
export const getActiveEquipmentForGym = (gymId) => fakeDataStore.equipmentByGym[gymId] || [];
export const getRoutineTemplates = () => fakeDataStore.routineTemplates;
export const getRecentRoutineTemplate = () => fakeDataStore.routineTemplates[0] || null;

export async function saveExercise(exercise) {
  const index = fakeDataStore.exercises.findIndex(item => item.id === exercise?.id);
  if (index >= 0) fakeDataStore.exercises[index] = { ...fakeDataStore.exercises[index], ...exercise };
  else fakeDataStore.exercises.push({ ...exercise });
  return true;
}
export async function deleteExercise(exerciseId) {
  fakeDataStore.exercises = fakeDataStore.exercises.filter(item => item.id !== exerciseId);
  return true;
}
export async function saveCustomMuscle(muscle) {
  fakeDataStore.customMuscles.push({ ...muscle });
  return true;
}
export async function deleteCustomMuscle(muscleId) {
  fakeDataStore.customMuscles = fakeDataStore.customMuscles.filter(item => item.id !== muscleId);
  return true;
}
export async function saveGym(gym) {
  fakeDataStore.gyms.push({ ...gym });
  return true;
}
export async function deleteGym(gymId) {
  fakeDataStore.gyms = fakeDataStore.gyms.filter(item => item.id !== gymId);
  return true;
}
export async function saveRoutineTemplate(template) {
  fakeDataStore.routineTemplates.unshift({ ...template });
  return true;
}

// ── 설정/전문가 모드/타이머 ──────────────────────────────────────
export const getExpertPreset = () => clone(fakeDataStore.settings.expert_preset || { enabled: false, mode: 'normal' });
export const getExpertMode = () => getExpertPreset().mode || 'normal';
export const isExpertModeEnabled = () => !!fakeDataStore.settings.expert_preset?.enabled;
export async function saveExpertPreset(preset) {
  fakeDataStore.settings.expert_preset = clone(preset);
  return true;
}
export const getMaxCycle = () => clone(fakeDataStore.settings.max_cycle || null);
export const getMaxCycleHistory = () => (Array.isArray(fakeDataStore.settings.max_cycle_history) ? fakeDataStore.settings.max_cycle_history : []);
export async function saveMaxCycle(cycle) {
  fakeDataStore.settings.max_cycle = clone(cycle);
  return true;
}
export async function appendMaxCycleHistory(entry) {
  const history = getMaxCycleHistory();
  history.push(clone(entry));
  fakeDataStore.settings.max_cycle_history = history;
  return true;
}
export const getTestBoardV2 = () => clone(fakeDataStore.settings.test_board_v2 || null);
export async function saveTestBoardV2(board) {
  fakeDataStore.settings.test_board_v2 = clone(board);
  return true;
}
export const getActiveTimer = () => fakeDataStore.settings.active_timer || null;
export async function saveActiveTimer(state) {
  fakeDataStore.settings.active_timer = clone(state);
  return true;
}
export async function clearActiveTimer() {
  fakeDataStore.settings.active_timer = null;
  return true;
}

// ── 체중/식단 ────────────────────────────────────────────────────
export const getBodyCheckins = () => fakeDataStore.bodyCheckins;
export const getLatestCheckinWeight = () => {
  const latest = [...fakeDataStore.bodyCheckins].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop();
  return latest?.weight ?? null;
};
export const getDietPlan = () => fakeDataStore.dietPlan;

// ── 영양 DB ──────────────────────────────────────────────────────
export const getNutritionDB = () => fakeDataStore.nutritionDB;
export const getRecentNutritionItems = (limit = 10) => fakeDataStore.recentNutritionItems.slice(0, limit);
export function searchNutritionDB(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return fakeDataStore.nutritionDB.filter(item => String(item?.name || '').toLowerCase().includes(q));
}
export async function saveNutritionItem(item) {
  fakeDataStore.savedNutritionItems.push(clone(item));
  fakeDataStore.nutritionDB.push({ ...item });
  return true;
}
export async function deleteNutritionItem(itemId) {
  fakeDataStore.deletedNutritionItemIds.push(itemId);
  fakeDataStore.nutritionDB = fakeDataStore.nutritionDB.filter(item => item.id !== itemId);
  fakeDataStore.recentNutritionItems = fakeDataStore.recentNutritionItems.filter(item => item.id !== itemId);
  return true;
}
export const getCookingRecords = () => fakeDataStore.cookingRecords;

// ── 러닝 경로 ────────────────────────────────────────────────────
export async function loadRunningRoute(ref) {
  const id = typeof ref === 'string' ? ref : ref?.id || ref?.path || '';
  return clone(fakeDataStore.runningRoutes[id] || null);
}
export async function saveRunningRoute(id, route) {
  fakeDataStore.runningRoutes[id] = clone(route);
  return { id };
}

// ── 계정/분석 ────────────────────────────────────────────────────
export const getCurrentUser = () => fakeDataStore.currentUser;
export function trackEvent(category, action, meta) {
  fakeDataStore.trackedEvents.push({ category, action, meta });
}
