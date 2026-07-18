// ================================================================
// data.js — 배럴 모듈 (하위 모듈 re-export + loadAll/saveDay 잔여 로직)
// ================================================================

import { CONFIG, MUSCLES, MOVEMENTS } from '../config.js';

// ── data-core: 공유 상태 + Firebase 기반 ─────────────────────────
import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs, query, where, runTransaction,
  getCurrentUserRef, setCurrentUserRef,
  ADMIN_ID, ADMIN_GUEST_ID, getDataOwnerId,
  _col, _doc,
  _cache, _exList, _customMuscles, _goals, _quests, _cooking, _bodyCheckins, _nutritionDB,
  _setCache, _setExList, _setCustomMuscles, _setGoals, _setQuests, _setCooking, _setBodyCheckins, _setNutritionDB,
  DEFAULT_TAB_ORDER, DEFAULT_VISIBLE_TABS, DEFAULT_DIET_PLAN, DEFAULT_EXPERT_PRESET,
  _dietPlan, _setDietPlan, _settings, _resetSettings,
  _tomatoCycles, _setTomatoCycles,
  _setSyncStatus, _fbOp, _saveSetting, _migrateFromLS, _generateId,
} from './data-core.js';

import { dateKey, TODAY } from './data-date.js';
import { findSeasonForDate, selectSeasonDecisionCache } from './season-model.js';
import { _getQuarterKeyNow, _sortExList } from './data-helpers.js';
import { bodyCheckinSequence, getEffectiveDailyBodyCheckins } from './body-checkins.js';
import { isAdmin, isAdminGuest } from './data-auth.js';
import { getAccountList, saveAccount } from './data-account.js';
import { _socialId, _isMySocialId } from './data-social-friends.js';
import { sendNotification } from './data-social-interact.js';

import {
  calcDietMetrics  as _calcDietMetrics,
  isDietDaySuccess as _isDietDaySuccess,
  dietDayOk        as _dietDayOk,
  calcStreaks       as _calcStreaks,
  calcVolume       as _calcVolume,
  calcVolumeAll    as _calcVolumeAll,
  getVolumeHistory as _getVolumeHistory,
  getLastSession          as _getLastSession,
  getLastActivitySession  as _getLastActivitySession,
  getDayTargetKcal        as _getDayTargetKcal,
  calcExerciseCalorieCredit as _calcExerciseCalorieCredit,
  getVolumeHistoryByMovement as _getVolumeHistoryByMovement,
  getVolumeHistoryMulti      as _getVolumeHistoryMulti,
  calcBalanceByPattern       as _calcBalanceByPattern,
  detectPRs                   as _detectPRs,
  isExerciseDaySuccess as _isExerciseDaySuccess,
  resolveDietTolerance as _resolveDietTolerance,
  hasDietRecordData as _hasDietRecordData,
} from '../calc.js';

// 전문가 모드 — Gym / RoutineTemplate CRUD
import {
  loadGyms, loadRoutineTemplates,
} from './data-workout-equipment.js';
import {
  loadEquipmentPool,
} from './data-equipment-pool.js';
import { mergeBoardCompletionLogs } from '../workout/test-v2/board-core.js';
import { normalizeBoardForSeason, resolveSeasonTestBoard } from './season-board-resolver.js';

// ═══════════════════════════════════════════════════════════════
// re-exports (기존 import 호환)
// ═══════════════════════════════════════════════════════════════

// date
export { dateKey, daysInMonth, TODAY, isToday, isFuture, isBeforeStart } from './data-date.js';
// image
export { imageToBase64 } from './data-image.js';
// external
export { fetchExchangeRate, fetchFearGreed } from './data-external.js';
// auth
export {
  getCurrentUser, getAdminId, getAdminGuestId,
  isAdmin, isAdminGuest, isSameInstance, isAdminInstance,
  GUEST_CONFIG, shouldShow,
  setCurrentUser, loadSavedUser,
  backupAdminAuth, clearAdminAuth, backupKimAuth, clearKimAuth,
  restoreUserFromBackup, waitForAuthPersistence,
  verifyPassword, hashPassword,
} from './data-auth.js';
// core
export { getDataOwnerId, getKimMode, setKimMode } from './data-core.js';
export {
  saveRunningRoute,
  loadRunningRoute,
  RunningRouteAuthenticationError,
  RunningRouteWriteError,
  RunningRouteReadError,
  RunningRouteNotFoundError,
} from './data-running-route.js';
// account
export {
  getAccountList, saveAccount, refreshCurrentUserFromDB,
  recoverDeletedAccounts, deleteUserAccount,
} from './data-account.js';
// social
export {
  _socialId, _isMySocialId,
  sendFriendRequest, acceptFriendRequest, removeFriend,
  getMyFriends, getPendingRequests,
  getFriendData, getFriendWorkout, getFriendTomatoState,
  getDisplayName, getGlobalWeeklyRanking,
  introduceFriend,
  getAllGuilds, createGuild,
  updateGuildMemberCount, updateGuildIcon, updateGuildLeader,
  createGuildJoinRequest, approveGuildJoinRequest,
  withdrawGuildJoinRequest,
  getGuildJoinRequests, getMyPendingGuildRequests,
  getGlobalGuildWeeklyRanking,
  getGuildLeader, transferGuildLeadership, kickGuildMember,
  deleteGuild, updateGuild, adminAddGuildMember, adminRemoveGuildMember,
  inviteUserToGuild,
  sendNotification, getMyNotifications, getAdminSentNotifications, getAdminOutreachHistory,
  markNotificationRead, markNotificationsRead, deleteNotification, markHeroMessageRead, sendAnnouncement,
  getGuestbook, writeGuestbook, deleteGuestbookEntry,
  findCommentProfileOwner, getComments, writeComment, editComment, deleteComment,
  toggleLike, getCheerStatus, getLikes, getUnseenCheers,
  getHeroMessage, saveHeroMessage,
  saveFcmToken, removeFcmToken,
  getCheersConfig, getCheersConfigRemote, saveCheersConfig,
  getCustomCheers, saveCustomCheer, deleteCustomCheer,
  invalidateCheersCache,
  getMySelfCheer, getMySelfCheerRaw, saveMySelfCheer, deleteMySelfCheer, getFriendSelfCheer,
  sendChatMessage, deleteChatMessage, subscribeChatMessages,
  getFriendLatestTomatoCycle,
  recordLogin, recordTutorialDone, markPatchnoteRead, recordAction,
  getPatchnote, createPatchnote, getLatestPatchnote,
  trackEvent, flushAnalytics, getAnalytics, getAllAnalytics, getApiUsage,
} from './data-social.js';

export {
  getAdminAccountRecords,
  getAdminSocialSnapshot,
  getAdminRecentWorkouts,
  getAdminRecentBodyCheckins,
} from './data-admin.js';

export { computeGuildStats } from './data-social-guild.js';

// workout-equipment (전문가 모드)
export {
  loadGyms, getGyms, getGym, saveGym, deleteGym,
  loadRoutineTemplates, getRoutineTemplates, getRecentRoutineTemplate,
  saveRoutineTemplate, deleteRoutineTemplate,
} from './data-workout-equipment.js';

export {
  loadEquipmentPool, getEquipmentPool, getGlobalEquipmentPool,
  getGymExclusiveEquipment, getActiveEquipmentForGym,
  saveEquipmentPoolItem, createGlobalPool, createGymExclusive,
  updateEquipment, deleteEquipment, toggleGymPool,
} from './data-equipment-pool.js';

// ═══════════════════════════════════════════════════════════════
// loadAll / saveDay / legacy tab sanitizer / twin-merge / isActiveWorkoutDayData
// → data/data-load.js, data/data-save.js 로 분리 (2026-04-20 R4)
// 기존 import 호환을 위해 data.js 에서 re-export.
// ═══════════════════════════════════════════════════════════════
import {
  loadAll, migrateDataToUser, _sanitizeTabList, isActiveWorkoutDayData,
} from './data-load.js';
import { saveDay, restorePendingDayWritesForOwner } from './data-save.js';
import {
  buildMaxCycleCanonicalPlan,
  inferExerciseMovementId,
  removeExerciseFromMaxCycle,
  selectMaxCycleForExerciseCleanup,
} from './data-pure.js';
export { loadAll, migrateDataToUser, saveDay, isActiveWorkoutDayData };

// ═══════════════════════════════════════════════════════════════
// Exercise CRUD
// ═══════════════════════════════════════════════════════════════

// muscleIds 파생 — 2026-04-19 리팩토링으로 도입.
// 한 기구/동작이 활성화시키는 세부 부위(subPattern) 배열.
// [0] = 주동근 (자극 균형 차트 카운트 기준). 이 함수는 legacy 데이터나
// muscleIds 누락된 레코드에서 movementId → [subPattern] 단일 원소로 복원하는
// 용도. 더 풍부한 매핑은 ai.js MOVEMENT_MUSCLES_MAP + deriveMuscleIdsForItem 참고.
//
// 계약: muscleIds[] 원소는 반드시 세부부위(subPattern) — chest_upper/back_width/quad/...
// 대분류(chest/back/lower/...)를 여기에 섞어 넣으면 안 됨. 다운스트림(calc.js
// calcBalanceByPattern, expert.js _SUBPATTERN_TO_MAJOR/_subPatternLabel)이 subPattern
// 키로 소비하기 때문에 'chest' 같은 대분류를 밀어넣으면 라벨이 영어로 나오거나
// 역매핑이 깨져 루틴 필터에서 off-target으로 걸러짐. (2026-04-19 CODEX 지적 수정)
// 커스텀 종목(movementId 없음)은 파생 불가 → []. 다운스트림이 빈 배열을 직접 처리함.
function _deriveLegacyMuscleIds(record) {
  if (Array.isArray(record.muscleIds) && record.muscleIds.length > 0) {
    return record.muscleIds.filter(Boolean);
  }
  if (record.movementId && record.movementId !== 'unknown') {
    const mv = MOVEMENTS.find(m => m.id === record.movementId);
    if (mv?.subPattern) return [mv.subPattern];
  }
  return [];
}

export async function saveExercise(ex) {
  // movementId가 있고 category가 없으면 MOVEMENTS에서 equipment_category 자동 주입.
  // 피커의 장비 카테고리 필터가 movementId 없는 커스텀에도 점진적으로 동작하게 됨.
  const record = { ...ex };
  if (!record.movementId || record.movementId === 'unknown') {
    const inferred = inferExerciseMovementId(record, MOVEMENTS);
    if (inferred) record.movementId = inferred;
  }
  if (!record.category && record.movementId) {
    const mv = MOVEMENTS.find(m => m.id === record.movementId);
    if (mv?.equipment_category) record.category = mv.equipment_category;
  }
  // muscleIds 누락 시 legacy movementId → [subPattern]로 자동 보강.
  // 외부(parseEquipment 호출부)가 명시적으로 [] 전달해도 기본 복원은 수행.
  const derivedIds = _deriveLegacyMuscleIds(record);
  if (derivedIds.length > 0) {
    // 외부에서 명시적으로 muscleIds를 주었고 비어있지 않으면 그대로 유지.
    // 그 외의 경우(undefined 또는 빈 배열)엔 derived로 채움.
    if (!Array.isArray(record.muscleIds) || record.muscleIds.length === 0) {
      record.muscleIds = derivedIds;
    } else {
      record.muscleIds = record.muscleIds.filter(Boolean);
    }
  } else {
    record.muscleIds = [];
  }
  return _fbOp('saveExercise', async () => {
    await setDoc(_doc('exercises', record.id), record);
    const idx = _exList.findIndex(e => e.id === record.id);
    if (idx >= 0) _exList[idx] = record; else _exList.push(record);
    _setExList(_sortExList(_exList));
  }, { sync: false });
}

function _maxCycleHasExercise(cycle = null, exerciseId = '') {
  return Array.isArray(cycle?.benchmarks)
    && cycle.benchmarks.some(benchmark => benchmark?.exerciseId === exerciseId);
}

async function _removeExerciseFromMaxCycleStores(exerciseId) {
  if (!exerciseId) return;
  const presetCycle = _settings.expert_preset?.maxCycle || null;
  const settingCycle = _settings.max_cycle || null;
  if (!_maxCycleHasExercise(presetCycle, exerciseId) && !_maxCycleHasExercise(settingCycle, exerciseId)) return;
  const source = selectMaxCycleForExerciseCleanup(presetCycle, settingCycle);
  if (!source) {
    await saveMaxCycle(null);
    return;
  }
  const result = removeExerciseFromMaxCycle(source, exerciseId, Date.now());
  if (result.changed) await saveMaxCycle(result.cycle);
}

export async function deleteExercise(id) {
  const deleted = await _fbOp('deleteExercise', async () => {
    await deleteDoc(_doc('exercises', id));
    _setExList(_exList.filter(e => e.id !== id));
    return true;
  }, { sync: false });
  if (deleted) await _removeExerciseFromMaxCycleStores(id);
  return deleted;
}

// ═══════════════════════════════════════════════════════════════
// CRUD 팩토리 + Goals/Quests/Cooking
// ═══════════════════════════════════════════════════════════════

function _createCRUD(collectionName, getArray, setArray) {
  return {
    save: (item) => _fbOp(`save:${collectionName}`, async () => {
      await setDoc(_doc(collectionName, item.id), item);
      const arr = getArray();
      const idx = arr.findIndex(x => x.id === item.id);
      if (idx >= 0) arr[idx] = item; else arr.push(item);
    }, { sync: false }),
    delete: (id) => _fbOp(`delete:${collectionName}`, async () => {
      await deleteDoc(_doc(collectionName, id));
      setArray(getArray().filter(x => x.id !== id));
    }, { sync: false }),
    get: () => getArray(),
  };
}

const _goalsCRUD   = _createCRUD('goals',      () => _goals,   v => _setGoals(v));
const _questsCRUD  = _createCRUD('quests',     () => _quests,  v => _setQuests(v));
const _cookingCRUD = _createCRUD('cooking',    () => _cooking, v => _setCooking(v));
const _customMusclesCRUD = _createCRUD('custom_muscles', () => _customMuscles, v => _setCustomMuscles(v));

export const saveGoal    = (goal)  => _goalsCRUD.save(goal);
export const deleteGoal  = (id)    => _goalsCRUD.delete(id);
export const getGoals    = ()      => _goals;

export const saveQuest   = (quest) => _questsCRUD.save(quest);
export const deleteQuest = (id)    => _questsCRUD.delete(id);
export const getQuests   = ()      => _quests;

export const saveCooking   = (record) => _cookingCRUD.save(record);
export const deleteCooking = (id)     => _cookingCRUD.delete(id);
export const saveCustomMuscle = (muscle) => _customMusclesCRUD.save(muscle);
export const deleteCustomMuscle = (id)   => _customMusclesCRUD.delete(id);

export const getCookingRecords  = () => _cooking;
export const getCookingForDate  = (dateStr) => _cooking.filter(c => c.date === dateStr);

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

// ═══════════════════════════════════════════════════════════════
// Body Checkins
// ═══════════════════════════════════════════════════════════════

const _checkinCRUD = _createCRUD('body_checkins', () => _bodyCheckins, v => _setBodyCheckins(v));
export const saveBodyCheckin   = (rec) => _checkinCRUD.save(rec);
export const deleteBodyCheckin = (id)  => _checkinCRUD.delete(id);
export const getRawBodyCheckins = () => [..._bodyCheckins]
  .sort((a,b) => (a.date||'').localeCompare(b.date||'') || bodyCheckinSequence(a) - bodyCheckinSequence(b));
export const getBodyCheckins = () => getEffectiveDailyBodyCheckins(_bodyCheckins);

// ═══════════════════════════════════════════════════════════════
// Nutrition DB
// ═══════════════════════════════════════════════════════════════

const _NUTRITION_SEARCH_SYNONYMS = Object.freeze({
  added: ['에디드'],
  bar: ['바'],
  chocolate: ['초콜릿'],
  corn: ['콘'],
  greek: ['그릭'],
  just: ['저스트'],
  light: ['라이트'],
  moova: ['무바'],
  no: ['노'],
  plain: ['플레인'],
  protein: ['프로틴'],
  shake: ['쉐이크', '셰이크'],
  sugar: ['슈가'],
  sweet: ['스위트'],
  yogurt: ['요거트', '요구르트'],
  zero: ['제로'],
});

function _normalizeNutritionSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _splitNutritionAliases(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
  }
  return [...new Set(
    String(value || '')
      .split(/[,\n/]/)
      .map(v => v.trim())
      .filter(Boolean)
  )];
}

function _buildNutritionSearchVariants(value) {
  const normalized = _normalizeNutritionSearchText(value);
  if (!normalized) return [];

  const variants = new Set([normalized, normalized.replace(/\s+/g, '')]);
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return [...variants];

  let combos = [''];
  for (const token of tokens) {
    const options = [token, ...(_NUTRITION_SEARCH_SYNONYMS[token] || [])]
      .map(_normalizeNutritionSearchText)
      .filter(Boolean)
      .slice(0, 3);
    const next = [];
    for (const prefix of combos.slice(0, 12)) {
      for (const option of options) {
        next.push(prefix ? `${prefix} ${option}` : option);
      }
    }
    combos = next.slice(0, 24);
  }

  combos.forEach((variant) => {
    const v = _normalizeNutritionSearchText(variant);
    if (!v) return;
    variants.add(v);
    variants.add(v.replace(/\s+/g, ''));
  });

  return [...variants];
}

function _getNutritionSearchCandidates(item) {
  const rawValues = [
    item?.name,
    item?.manufacturer,
    item?.brand,
    ..._splitNutritionAliases(item?.aliases),
  ];
  const candidates = new Set();
  rawValues.forEach((value) => {
    _buildNutritionSearchVariants(value).forEach((variant) => candidates.add(variant));
  });
  return [...candidates];
}

function _getNutritionSearchScore(item, query) {
  const queryVariants = _buildNutritionSearchVariants(query);
  if (!queryVariants.length) return 0;

  const queryTokens = _normalizeNutritionSearchText(query).split(' ').filter(Boolean);
  const candidates = _getNutritionSearchCandidates(item);
  let best = 0;

  for (const candidate of candidates) {
    const candidateNoSpace = candidate.replace(/\s+/g, '');
    for (const queryVariant of queryVariants) {
      const queryNoSpace = queryVariant.replace(/\s+/g, '');

      if (candidate === queryVariant || candidateNoSpace === queryNoSpace) {
        best = Math.max(best, 120);
        continue;
      }
      if (candidate.startsWith(queryVariant) || candidateNoSpace.startsWith(queryNoSpace)) {
        best = Math.max(best, 105);
      }
      if (candidate.includes(queryVariant) || candidateNoSpace.includes(queryNoSpace)) {
        best = Math.max(best, 92);
      }
      const matchedWords = queryTokens.filter(token =>
        candidate.includes(token) || candidateNoSpace.includes(token)
      ).length;
      if (matchedWords === queryTokens.length && queryTokens.length > 0) {
        best = Math.max(best, 80 + matchedWords * 3);
      } else if (matchedWords > 0) {
        best = Math.max(best, 45 + matchedWords * 6);
      }
    }
  }

  return best;
}

export async function saveNutritionItem(item) {
  if (!item.id) item.id = _generateId();
  item.aliases = _splitNutritionAliases(item.aliases);
  item.createdAt = item.createdAt || new Date().toISOString();
  item.updatedAt = new Date().toISOString();
  return _fbOp('saveNutritionItem', async () => {
    await setDoc(_doc('nutrition_db', item.id), item);
    const idx = _nutritionDB.findIndex(n => n.id === item.id);
    if (idx >= 0) _nutritionDB[idx] = item; else _nutritionDB.push(item);
    return item;
  }, { sync: false, rethrow: true });
}

export async function deleteNutritionItem(id) {
  return _fbOp('deleteNutritionItem', async () => {
    await deleteDoc(_doc('nutrition_db', id));
    _setNutritionDB(_nutritionDB.filter(n => n.id !== id));
  }, { sync: false });
}

export const getNutritionDB       = () => [..._nutritionDB].sort((a,b) => (a.name||'').localeCompare(b.name||''));
export const searchNutritionDB    = (q) => {
  const query = String(q || '').trim();
  if (!query) return getNutritionDB();
  return [..._nutritionDB]
    .map(item => ({ item, score: _getNutritionSearchScore(item, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.item.name || '').localeCompare(b.item.name || ''))
    .map(({ item }) => item);
};

export const getRecentNutritionItems = (limit = 10) => {
  return [..._nutritionDB]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, limit);
};

export async function saveNutritionItemFromOCR(parsedData, source = 'ocr') {
  const item = {
    id: _generateId(),
    name: parsedData.name || '',
    source, language: parsedData.language || 'ko',
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

// ═══════════════════════════════════════════════════════════════
// Diet Plan
// ═══════════════════════════════════════════════════════════════

export const getDietPlan = () => {
  const p = { ...DEFAULT_DIET_PLAN, ..._settings.diet_plan };
  p._userSet = !!(_settings.diet_plan && _settings.diet_plan.weight && _settings.diet_plan.height);
  if (isAdminGuest() && p.weight && p.height) p._userSet = true;
  return p;
};
export const saveDietPlan = async (plan) => {
  const merged = { ...(getDietPlan()), ...plan };
  Object.assign(_dietPlan, merged);
  return _saveSetting('diet_plan', merged);
};

export const calcDietMetrics = _calcDietMetrics;
export const isDietDaySuccess = _isDietDaySuccess;
export const resolveDietTolerance = _resolveDietTolerance;
export const getDayTargetKcal = (plan, y, m, d, dayData) => _getDayTargetKcal(plan, y, m, d, dayData);
export const calcExerciseCalorieCredit = _calcExerciseCalorieCredit;

// ═══════════════════════════════════════════════════════════════
// Data Accessors
// ═══════════════════════════════════════════════════════════════

export const getExList    = ()      => _exList;
export const getGlobalExList = ()   => _exList.filter(e => !e.gymId);
export const getGymExList = (gymId) => _exList.filter(e => e.gymId === gymId);
export const getCustomMuscles = ()  => _customMuscles;
export const getAllMuscles = () => {
  const byId = new Map(MUSCLES.map(m => [m.id, m]));
  _customMuscles.forEach(m => {
    if (m?.id && m?.name) byId.set(m.id, { ...m, kind: m.kind || 'part' });
  });
  return [...byId.values()];
};
// 헬스 자극부위(유산소 활동 제외) — Expert/종목추가/장비 모달에서 사용.
export const getMuscleParts = () => getAllMuscles().filter(m => (m.kind || 'part') === 'part');
export const getCache     = ()      => _cache;
export function getSeasonDecisionCache(referenceDateKey = null) {
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const reference = /^\d{4}-\d{2}-\d{2}$/.test(String(referenceDateKey || '')) ? String(referenceDateKey) : todayKey;
  return selectSeasonDecisionCache(_cache, _settings.season_registry || {}, reference);
}
export const getAllDateKeys = () => Object.keys(_cache).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
export const getDay       = (y,m,d) => _cache[dateKey(y,m,d)] || {};
export async function ensureWorkoutDayCached(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return {};
  const ownerId = getDataOwnerId();
  if (!ownerId) return {};
  const startingCache = _cache;
  const existing = startingCache[key];
  if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) return existing;
  const pendingSeed = restorePendingDayWritesForOwner(ownerId, {})[key] || {};
  const workoutRef = doc(db, 'users', ownerId, 'workouts', key);
  const snap = await getDoc(workoutRef);
  // 늦은 A 계정 조회가 계정 전환 뒤 B 캐시에 들어가지 않게 폐기한다.
  if (getDataOwnerId() !== ownerId) return {};
  // 같은 계정이라도 대기 중 realtime/local 저장이 이 날짜를 채웠다면, 늦은
  // getDoc 응답으로 새 캐시를 되돌리지 않는다.
  if (_cache !== startingCache || _cache[key] !== existing) return _cache[key] || {};
  const remoteDay = snap.exists() ? (snap.data() || {}) : {};
  const remoteWithSeed = { [key]: { ...remoteDay, ...pendingSeed } };
  const latest = restorePendingDayWritesForOwner(ownerId, remoteWithSeed);
  _cache[key] = latest[key] || {};
  return _cache[key];
}

// 가장 최근 body_checkin의 날짜/체중. 없으면 null.
// 실제 체중 시계열은 body_checkins 컬렉션이 진실(기존 체크인 모달이 쓰는 경로).
export function getLatestCheckinDate() {
  const list = getBodyCheckins();
  if (!list.length) return null;
  const latest = list[list.length - 1];
  return latest?.date || null;
}

export function getLatestCheckinWeight() {
  const list = getBodyCheckins();
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i]?.weight;
    if (typeof w === 'number' && isFinite(w)) return w;
  }
  const plan = _settings?.diet_plan;
  if (plan && typeof plan.weight === 'number' && isFinite(plan.weight)) return plan.weight;
  return null;
}

// 기준 날짜로부터 N일 전의 체중(그 이전 가장 최근 체크인). 없으면 null.
export function getCheckinWeightOnOrBefore(refKey, daysBefore) {
  const list = getBodyCheckins();
  if (!list.length) return null;
  const refDate = new Date(refKey);
  const target = new Date(refDate);
  target.setDate(target.getDate() - daysBefore);
  const targetKey = dateKey(target.getFullYear(), target.getMonth(), target.getDate());
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (!c || !c.date) continue;
    if (c.date > targetKey) continue;
    if (typeof c.weight === 'number' && isFinite(c.weight)) {
      return { dk: c.date, weight: c.weight };
    }
  }
  return null;
}

// "체중이 일주일 넘게 미입력" 판정 (홈 카드 stale 표시용)
export function daysSinceLastCheckin() {
  const latestDate = getLatestCheckinDate();
  if (!latestDate) return Infinity;
  try {
    const latest = new Date(latestDate + 'T00:00:00');
    const today = new Date(TODAY);
    today.setHours(0, 0, 0, 0);
    const diffMs = today - latest;
    return Math.max(0, Math.round(diffMs / 86400000));
  } catch (_) {
    return Infinity;
  }
}
export const getExercises = (y,m,d) => getDay(y,m,d).exercises || [];

/**
 * 운동 기록 존재 여부 — canonical 판정.
 * stretching/running/swimming 포함, isExerciseDaySuccess와 동일 규칙.
 * @param {number} y @param {number} m (0-indexed) @param {number} d
 * @returns {boolean}
 */
export function hasExerciseRecord(y, m, d) {
  return _isExerciseDaySuccess(getDay(y, m, d));
}

/**
 * 식단 기록 존재 여부 — canonical 판정.
 * 텍스트 meal / food-chip / kcal-only / skip 플래그 / 사진 포함.
 * @param {number} y @param {number} m (0-indexed) @param {number} d
 * @returns {boolean}
 */
export function hasDietRecord(y, m, d) {
  return _hasDietRecordData(getDay(y, m, d));
}

// isActiveWorkoutDayData / _mergeWorkoutTwinCache 는 data/data-load.js 로 이동 (R4).
// isActiveLocalDay 는 data.js 의 getDay 에 의존하므로 여기 유지.
export const isActiveLocalDay = (y,m,d) => isActiveWorkoutDayData(getDay(y,m,d));

export const getMuscles   = (y,m,d) => {
  const day = getDay(y,m,d);
  const ids = new Set(getExercises(y,m,d).map(e => e.muscleId));
  if (day.swimming) ids.add('swimming');
  if (day.running)  ids.add('running');
  return [...ids];
};
export const getCF        = (y,m,d) => !!getDay(y,m,d).cf;
export const getMemo      = (y,m,d) => getDay(y,m,d).memo || '';

export const getStretching = (y,m,d) => !!getDay(y,m,d)?.stretching;
export const getWineFree   = (y,m,d) => !!getDay(y,m,d)?.wine_free;

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
export const getVolumeHistory = (exerciseId) => _getVolumeHistory(getSeasonDecisionCache(), exerciseId);
export const getLastSession = (exerciseId, excludeDateKey = null) => _getLastSession(getSeasonDecisionCache(excludeDateKey), exerciseId, excludeDateKey);
export const getLastActivitySession = (type, excludeDateKey = null) => _getLastActivitySession(getSeasonDecisionCache(excludeDateKey), type, excludeDateKey);
// 전문가 모드 분석 함수 (순수함수는 calc.js, 여기서는 _cache/_exList 자동 주입)
export const getVolumeHistoryByMovement = (movementId) => _getVolumeHistoryByMovement(getSeasonDecisionCache(), _exList, movementId);
export const getVolumeHistoryMulti = (exerciseIds) => _getVolumeHistoryMulti(getSeasonDecisionCache(), exerciseIds);
export const detectPRs = (exerciseId) => _detectPRs(getSeasonDecisionCache(), exerciseId);
// MOVEMENTS 인자는 호출부에서 주입 (config.js 순환참조 회피)
export const calcBalanceByPattern = (movements, weekRange) => _calcBalanceByPattern(_cache, _exList, movements, weekRange);

// ── Expert Preset 접근자 ───────────────────────────────────────
// 2026-04-25: mode lazy migration 추가. 기존 enabled=true 유저는 mode='pro'로 derive.
//   Firestore 영속화는 다음 saveExpertPreset 호출 시 자동 반영. 그 전까지는 in-memory 보정.
export const getExpertPreset = () => {
  const merged = { ...DEFAULT_EXPERT_PRESET, ..._settings.expert_preset };
  if (merged.enabled && (!merged.mode || merged.mode === 'normal')) {
    merged.mode = 'pro';
  }
  return merged;
};
function _normalizeMaxCycleSetting(cycle, updatedAt) {
  return cycle && typeof cycle === 'object'
    ? { ...cycle, updatedAt }
    : null;
}
function _stripLegacyMaxCycle(preset) {
  const cleaned = { ...(preset || {}) };
  delete cleaned.maxCycle;
  return cleaned;
}
export async function saveExpertPreset(patch) {
  const now = Date.now();
  const hasMaxCyclePatch = Object.prototype.hasOwnProperty.call(patch || {}, 'maxCycle');
  const maxCycleRecord = hasMaxCyclePatch
    ? _normalizeMaxCycleSetting(patch.maxCycle, now)
    : undefined;
  const presetPatch = { ...(patch || {}) };
  delete presetPatch.maxCycle;
  const merged = _stripLegacyMaxCycle({
    ...getExpertPreset(),
    ...presetPatch,
    updatedAt: now,
  });
  // mode <-> enabled 동기화: mode='normal'은 enabled=false, 그 외는 enabled=true.
  if (merged.mode === 'normal') merged.enabled = false;
  else if (merged.mode === 'pro' || merged.mode === 'max') merged.enabled = true;
  await _saveSetting('expert_preset', merged);
  if (hasMaxCyclePatch) await _saveSetting('max_cycle', maxCycleRecord);
  return merged;
}
export const isExpertModeEnabled = () => !!_settings.expert_preset?.enabled;
// 2026-04-25: 'normal' | 'pro' | 'max' 모드 discriminator.
export const getExpertMode = () => getExpertPreset().mode || 'normal';
export const getMaxCycle = () => _settings.max_cycle || null;
export async function saveMaxCycle(cycle) {
  const now = Date.now();
  const record = _normalizeMaxCycleSetting(cycle, now);
  await _saveSetting('max_cycle', record);
  const cleanup = buildMaxCycleCanonicalPlan({
    expertPreset: _settings.expert_preset,
    settingCycle: record,
    now,
  });
  if (cleanup.shouldWriteExpertPreset) await _saveSetting('expert_preset', cleanup.cleanedPreset);
  return record;
}
// 테스트모드 사이클 히스토리 — 정산 1회당 요약 1개 (성장 계단 데이터원)
export const getMaxCycleHistory = () => (Array.isArray(_settings.max_cycle_history) ? _settings.max_cycle_history : []);
export async function appendMaxCycleHistory(entry) {
  if (!entry || typeof entry !== 'object') return getMaxCycleHistory();
  const next = [...getMaxCycleHistory(), entry].slice(-24);
  await _saveSetting('max_cycle_history', next);
  return next;
}

// ── 테스트모드 v2 "성장 보드" (workout/test-v2/) ──────────────────
// 별도 키 test_board_v2 — v1 max_cycle은 v2 경로에서 절대 쓰지 않는다
// (docs/ai/features/2026-06-12-test-mode-v2-board.md 금지 목록).
export const getTestBoardV2 = () => {
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const currentSeason = findSeasonForDate(_settings.season_registry || {}, todayKey);
  const seasonBoard = currentSeason ? _settings[`season_${currentSeason.id}_test_board_v2`] : null;
  return resolveSeasonTestBoard({
    currentSeason,
    seasonBoard,
    genericBoard: _settings.test_board_v2,
  });
};
export async function saveTestBoardV2(board) {
  if (!board || typeof board !== 'object') return null;
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const currentSeason = findSeasonForDate(_settings.season_registry || {}, todayKey);
  const normalizedBoard = normalizeBoardForSeason(board, currentSeason);
  if (!normalizedBoard) return null;
  const seasonKey = currentSeason ? `season_${currentSeason.id}_test_board_v2` : null;
  const activeRef = _doc('settings', 'test_board_v2');
  const seasonRef = seasonKey ? _doc('settings', seasonKey) : null;
  const localBoard = resolveSeasonTestBoard({
    currentSeason,
    seasonBoard: seasonKey ? _settings[seasonKey] : null,
    genericBoard: _settings.test_board_v2,
  });
  const merged = await _fbOp(
    `saveSetting(${seasonKey || 'test_board_v2'})`,
    () => runTransaction(db, async (transaction) => {
      const seasonSnap = seasonRef ? await transaction.get(seasonRef) : null;
      const activeSnap = await transaction.get(activeRef);
      const remoteSeasonBoard = seasonSnap?.exists() ? (seasonSnap.data()?.value || null) : null;
      const remoteActiveBoard = activeSnap.exists() ? (activeSnap.data()?.value || null) : null;
      const latestBoard = resolveSeasonTestBoard({
        currentSeason,
        seasonBoard: remoteSeasonBoard,
        genericBoard: remoteActiveBoard,
      }) || localBoard;
      const nextBoard = mergeBoardCompletionLogs(latestBoard, normalizedBoard);
      if (seasonRef) transaction.set(seasonRef, { value: nextBoard });
      transaction.set(activeRef, { value: nextBoard });
      return nextBoard;
    }),
    { rethrow: true }
  );
  _settings.test_board_v2 = merged;
  if (seasonKey) _settings[seasonKey] = merged;
  return merged;
}

export function calcStreaks() {
  return _calcStreaks(_cache, TODAY, getDietPlan(), dateKey);
}

export function countLocalWeeklyActiveDays(baseDateLike = TODAY) {
  const now = new Date(baseDateLike);
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (isActiveLocalDay(d.getFullYear(), d.getMonth(), d.getDate())) activeDays++;
  }
  return activeDays;
}

// ═══════════════════════════════════════════════════════════════
// UI Settings
// ═══════════════════════════════════════════════════════════════

export const getQuestOrder = () => _settings.quest_order || ['quarterly','monthly','weekly','daily'];
export const saveQuestOrder = (order) => _saveSetting('quest_order', order);

const _defaultTitles = {
  ai: '🤖 AI 추천', quests: '📋 퀘스트',
  goals: '🎯 목표', today_diet: '🥗 오늘 식단', today_workout: '💪 오늘 운동',
  mini_memo: '📝 미니 메모',
};
export const getSectionTitle  = (key) => (_settings.section_titles || {})[key] || _defaultTitles[key] || key;
export const saveSectionTitle = async (key, title) => {
  const titles = { ...(_settings.section_titles || {}), [key]: title };
  await _saveSetting('section_titles', titles);
};

export const getMiniMemoItems  = () => _settings.mini_memo_items || [];
export const saveMiniMemoItems = (items) => _saveSetting('mini_memo_items', items);

export const getTabOrder  = () => _sanitizeTabList(_settings.tab_order);
export const saveTabOrder = (order) => _saveSetting('tab_order', _sanitizeTabList(order));

export const DEFAULT_VIS_TABS = DEFAULT_VISIBLE_TABS;
export const getVisibleTabs  = () => _settings.visible_tabs || DEFAULT_VISIBLE_TABS;
export const getRawVisibleTabs = () => _settings.visible_tabs;
export const saveVisibleTabs = (tabs) => _saveSetting('visible_tabs', tabs);

export const getWeeklyMemos = () => _settings.weekly_memos || {};
export const saveWeeklyMemo = async (weekKey, text) => {
  const m = { ...getWeeklyMemos() };
  if (text) m[weekKey] = text; else delete m[weekKey];
  await _saveSetting('weekly_memos', m);
};

// ── 스트릭 경고 배너 ack (21시 이후 "오늘 기록 없어요" 노출 / 1일 1회) ──
export const getStreakWarningAck = () => _settings.streak_warning_ack_date || '';
export const saveStreakWarningAck = (dateStr) => _saveSetting('streak_warning_ack_date', dateStr);

// ── 관리자 모드 onboarding ack (1회성) ─────────────────────────────
export const getAdminOnboardingAck = () => !!_settings.ui_admin_onboarding_ack;
export const saveAdminOnboardingAck = () => _saveSetting('ui_admin_onboarding_ack', true);

const DEVELOPER_LETTER_STATUS_META = Object.freeze({
  pending: { key: 'pending', label: '시행전' },
  in_progress: { key: 'in-progress', label: '진행중' },
  done: { key: 'done', label: '완료' },
  failed: { key: 'failed', label: '확인필요' },
});

export function getDeveloperLetterStatusMeta(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (['in_progress', 'progress', 'processing', 'running', 'started', '진행중'].includes(raw)) {
    return DEVELOPER_LETTER_STATUS_META.in_progress;
  }
  if (['done', 'complete', 'completed', 'deployed', 'closed', 'resolved', '완료'].includes(raw)) {
    return DEVELOPER_LETTER_STATUS_META.done;
  }
  if (['failed', 'error', 'blocked', 'skipped', 'needs_review', '실패', '보류', '확인필요'].includes(raw)) {
    return DEVELOPER_LETTER_STATUS_META.failed;
  }
  return DEVELOPER_LETTER_STATUS_META.pending;
}

export function getDeveloperLetterStatus(letter) {
  return letter?.automationStatus || letter?.status || letter?.requestStatus || letter?.devStatus || 'pending';
}

export async function sendDeveloperLetter(message) {
  const user = getCurrentUserRef();
  if (!user) throw new Error('로그인이 필요해요.');

  const text = String(message || '').trim();
  if (!text) throw new Error('내용을 입력해주세요.');

  const now = Date.now();
  const id = `letter_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const letter = {
    id,
    from: user.id,
    fromName: user.nickname || `${user.lastName || ''}${user.firstName || ''}` || user.id,
    message: text,
    createdAt: now,
    read: false,
    status: 'pending',
    automationStatus: 'pending',
    statusUpdatedAt: now,
  };

  await _fbOp('sendDeveloperLetter', async () => {
    await setDoc(doc(db, '_letters', id), letter);
    await sendNotification(ADMIN_ID, {
      type: 'letter',
      from: user.id,
      message: '개발자에게 편지를 보냈어요 ✉️',
    });
  }, { rethrow: true });

  return letter;
}

export async function getMyDeveloperLetters(maxItems = 8) {
  const user = getCurrentUserRef();
  if (!user) return [];

  const snap = await getDocs(query(collection(db, '_letters'), where('from', '==', user.id)));
  const letters = [];
  snap.forEach((docSnap) => letters.push({ id: docSnap.id, ...docSnap.data() }));
  return letters
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, Math.max(1, Number(maxItems) || 8));
}

export const DIET_PREMIUM_CONTENT_VERSION = 'diet_premium_20260512';
export const DIET_PREMIUM_REPORT_AUTO_DELIVERY_ENABLED = false;
export const DIET_PREMIUM_REPORT_TARGETS = Object.freeze([
  { id: '최_준수', name: '최준수', nick: '줍스' },
  { id: '김_태우', name: '김태우', nick: '문정토마토' },
  { id: '이_재헌', name: '이재헌', nick: '이재헌' },
]);

const _pad2 = (n) => String(n).padStart(2, '0');

function _getIsoWeekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${_pad2(week)}`;
}

function _getDietReportCycle(period, date = new Date()) {
  const normalized = period === 'monthly' ? 'monthly' : 'weekly';
  if (normalized === 'monthly') {
    return {
      period: normalized,
      cycleKey: `${date.getFullYear()}-${_pad2(date.getMonth() + 1)}`,
      cycleLabel: `${date.getFullYear()}년 ${date.getMonth() + 1}월`,
    };
  }
  return {
    period: normalized,
    cycleKey: _getIsoWeekKey(date),
    cycleLabel: `${_getIsoWeekKey(date)} 주간`,
  };
}

export const getDietPremiumReportInbox = () => _settings.diet_premium_report_inbox || null;

export async function publishDietPremiumReportIssue({ period = 'weekly', targetUserIds = null } = {}) {
  const cycle = _getDietReportCycle(period);
  const targets = Array.isArray(targetUserIds) && targetUserIds.length
    ? targetUserIds
    : DIET_PREMIUM_REPORT_TARGETS.map((target) => target.id);
  const publishedAt = Date.now();
  const reportId = `diet_premium_${cycle.period}_${cycle.cycleKey}`;
  const baseIssue = {
    reportId,
    period: cycle.period,
    cycleKey: cycle.cycleKey,
    cycleLabel: cycle.cycleLabel,
    contentVersion: DIET_PREMIUM_CONTENT_VERSION,
    publishedAt,
    title: cycle.period === 'monthly' ? '월간 식단 프리미엄 리포트' : '주간 식단 프리미엄 리포트',
    targetUserIds: targets,
  };

  if (!DIET_PREMIUM_REPORT_AUTO_DELIVERY_ENABLED) {
    return { ...baseIssue, deliveredCount: 0, disabled: true };
  }

  await _fbOp('publishDietPremiumReportIssue', () => Promise.all(targets.map((userId) => (
    setDoc(doc(db, 'users', userId, 'settings', 'diet_premium_report_inbox'), {
      value: { ...baseIssue, recipientUserId: userId },
    })
  ))), { rethrow: true });

  if (targets.includes(getDataOwnerId())) {
    _settings.diet_premium_report_inbox = { ...baseIssue, recipientUserId: getDataOwnerId() };
  }

  return { ...baseIssue, deliveredCount: targets.length };
}

export const getDietPremiumReportSeen = (reportId) => !!(_settings.diet_premium_report_seen || {})[reportId];
export const saveDietPremiumReportSeen = (reportId, value = true) => {
  const seen = { ...(_settings.diet_premium_report_seen || {}) };
  seen[reportId] = value;
  return _saveSetting('diet_premium_report_seen', seen);
};

// ── 홈 카드 개인화: 순서/숨김 ────────────────────────────────────────
// order: ['hero', 'unit_goal', 'farm', 'goals', 'quests', ...] 카드 id 배열
// hidden: ['mini_memo', 'friends'] 등 숨길 카드 id 배열
export const getHomeCardOrder = () => _settings.home_card_order || null;
export const saveHomeCardOrder = (orderArr) => _saveSetting('home_card_order', orderArr);
export const getHomeCardHidden = () => _settings.home_card_hidden || [];
export const saveHomeCardHidden = (hiddenArr) => _saveSetting('home_card_hidden', hiddenArr);

// ── 햅틱 설정 ───────────────────────────────────────────────────────
export const getHapticsEnabled = () => _settings.haptics_enabled !== false; // 기본 true
export const saveHapticsEnabled = (flag) => _saveSetting('haptics_enabled', !!flag);

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

export const getCheerLastSeen = () => _settings.cheer_last_seen ?? 0;
export async function saveCheerLastSeen(ts) {
  _settings.cheer_last_seen = ts || 0;
  await _saveSetting('cheer_last_seen', _settings.cheer_last_seen);
}

// ═══════════════════════════════════════════════════════════════
// Tomato System
// ═══════════════════════════════════════════════════════════════

export const getTomatoState = () => _settings.tomato_state || { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
export const saveTomatoState = (state) => { _settings.tomato_state = state; return _saveSetting('tomato_state', state); };

// ── 운동 타이머 cross-day SoT ────────────────────────────────────
// 2026-04-21: day-doc 에 startedAt 을 저장하던 방식은 자정 넘김 케이스에서 실패했다
// (오늘 doc 에는 startedAt 이 없으므로 복원 불가). _settings/active_timer 에 모으면
// 몇일자 운동을 보고 있든 동일 포인터로 복원된다.
// value 스키마: { startedAt: number(epoch ms), date: {y,m,d} } | null
export const getActiveTimer   = () => _settings.active_timer || null;
export const saveActiveTimer  = (state) => { _settings.active_timer = state; return _saveSetting('active_timer', state); };
export const clearActiveTimer = () => { _settings.active_timer = null; return _saveSetting('active_timer', null); };

export const getMilestoneShown = () => _settings.milestone_shown || {};
export const saveMilestoneShown = (obj) => { _settings.milestone_shown = obj; return _saveSetting('milestone_shown', obj); };

export function getStreakFreezes() { return _settings.streak_freezes || []; }
export async function useStreakFreeze(type) {
  const state = getTomatoState();
  const available = state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0);
  if (available <= 0) return { error: '토마토가 부족해요.' };
  const freezes = getStreakFreezes();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentFreeze = freezes.find(f => f.type === type && f.usedAt > weekAgo);
  if (recentFreeze) return { error: '이번 주에는 이미 사용했어요. (주 1회)' };
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  freezes.push({ date: dateStr, type, usedAt: now });
  state.giftedSent = (state.giftedSent || 0) + 1;
  await _saveSetting('streak_freezes', freezes);
  await saveTomatoState(state);
  return { ok: true };
}

export async function saveTomatoCycle(cycleResult) {
  _tomatoCycles.push(cycleResult);
  return _fbOp('saveTomatoCycle', () => setDoc(_doc('tomato_cycles', cycleResult.id), cycleResult));
}

export function getTomatoCycles(quarterKey) {
  if (!quarterKey) return _tomatoCycles;
  return _tomatoCycles.filter(c => c.quarter === quarterKey);
}

export function getAllTomatoCycles() { return _tomatoCycles; }

export async function sendTomatoGift(toUserId, message) {
  if (!getCurrentUserRef()) return { error: '로그인이 필요해요.' };
  const state = getTomatoState();
  const available = state.totalTomatoes + state.giftedReceived - state.giftedSent;
  if (available <= 0) return { error: '선물할 토마토가 없어요.' };
  const fromId = _socialId();
  const giftId = `${fromId}_${toUserId}_${Date.now()}`;
  await setDoc(doc(db, '_tomato_gifts', giftId), {
    id: giftId, from: fromId, to: toUserId,
    quarter: _getQuarterKeyNow(), message: message || '',
    createdAt: Date.now(),
  });
  state.giftedSent++;
  await saveTomatoState(state);
  try {
    const recvSnap = await getDoc(doc(db, 'users', toUserId, 'settings', 'tomato_state'));
    const recvState = recvSnap.exists()
      ? (recvSnap.data().value || { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 })
      : { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
    recvState.giftedReceived = (recvState.giftedReceived || 0) + 1;
    await setDoc(doc(db, 'users', toUserId, 'settings', 'tomato_state'), { value: recvState });
  } catch(e) { console.warn('[gift] 받는 사람 토마토 상태 업데이트 실패:', e); }
  await sendNotification(toUserId, { type: 'tomato_gift', from: fromId, message: '토마토를 선물했어요! 🍅' });
  return { ok: true };
}

export async function revertTomatoGift(fromUserId, toUserId) {
  const snap = await getDocs(collection(db, '_tomato_gifts'));
  let deleted = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.from === fromUserId && data.to === toUserId) {
      await deleteDoc(doc(db, '_tomato_gifts', d.id));
      deleted++;
    }
  }
  const senderSnap = await getDoc(doc(db, 'users', fromUserId, 'settings', 'tomato_state'));
  if (senderSnap.exists()) {
    const sState = senderSnap.data().value;
    sState.giftedSent = Math.max(0, (sState.giftedSent || 0) - deleted);
    await setDoc(doc(db, 'users', fromUserId, 'settings', 'tomato_state'), { value: sState });
  }
  const recvSnap = await getDoc(doc(db, 'users', toUserId, 'settings', 'tomato_state'));
  if (recvSnap.exists()) {
    const rState = recvSnap.data().value;
    rState.giftedReceived = Math.max(0, (rState.giftedReceived || 0) - deleted);
    await setDoc(doc(db, 'users', toUserId, 'settings', 'tomato_state'), { value: rState });
  }
  if (_socialId() === fromUserId) {
    const s = getTomatoState();
    s.giftedSent = Math.max(0, (s.giftedSent || 0) - deleted);
    _settings.tomato_state = s;
  }
  return { ok: true, deleted };
}

export async function getReceivedTomatoGifts() {
  if (!getCurrentUserRef()) return [];
  const snap = await getDocs(collection(db, '_tomato_gifts'));
  const gifts = [];
  snap.forEach(d => { const data = d.data(); if (_isMySocialId(data.to)) gifts.push(data); });
  gifts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return gifts;
}
