// ================================================================
// data.js — 배럴 모듈 (하위 모듈 re-export + loadAll/saveDay 잔여 로직)
// ================================================================

import { CONFIG, MUSCLES } from './config.js';

// ── data-core: 공유 상태 + Firebase 기반 ─────────────────────────
import {
  db, doc, setDoc, deleteDoc, getDoc, collection, getDocs,
  getCurrentUserRef, setCurrentUserRef,
  ADMIN_ID, ADMIN_GUEST_ID, getDataOwnerId,
  _col, _doc,
  _cache, _exList, _customMuscles, _goals, _quests, _cooking, _bodyCheckins, _nutritionDB,
  _setCache, _setExList, _setCustomMuscles, _setGoals, _setQuests, _setCooking, _setBodyCheckins, _setNutritionDB,
  DEFAULT_TAB_ORDER, DEFAULT_VISIBLE_TABS, DEFAULT_DIET_PLAN, DEFAULT_EXPERT_PRESET,
  _dietPlan, _setDietPlan, _settings, _resetSettings,
  _tomatoCycles, _setTomatoCycles,
  _setSyncStatus, _fbOp, _saveSetting, _migrateFromLS, _generateId,
} from './data/data-core.js';

import { dateKey, TODAY } from './data/data-date.js';
import { _getQuarterKeyNow, _sortExList } from './data/data-helpers.js';
import { isAdmin, isAdminGuest } from './data/data-auth.js';
import { getAccountList, saveAccount } from './data/data-account.js';
import { _socialId, _isMySocialId } from './data/data-social-friends.js';
import { sendNotification } from './data/data-social-interact.js';

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
} from './calc.js';

// 전문가 모드 — Gym / RoutineTemplate CRUD
import {
  loadGyms, loadRoutineTemplates,
} from './data/data-workout-equipment.js';

// ═══════════════════════════════════════════════════════════════
// re-exports (기존 import 호환)
// ═══════════════════════════════════════════════════════════════

// date
export { dateKey, daysInMonth, TODAY, isToday, isFuture, isBeforeStart } from './data/data-date.js';
// image
export { imageToBase64 } from './data/data-image.js';
// external
export { fetchExchangeRate, fetchFearGreed } from './data/data-external.js';
// auth
export {
  getCurrentUser, getAdminId, getAdminGuestId,
  isAdmin, isAdminGuest, isSameInstance, isAdminInstance,
  GUEST_CONFIG, shouldShow,
  setCurrentUser, loadSavedUser,
  backupAdminAuth, clearAdminAuth, backupKimAuth, clearKimAuth,
  restoreUserFromBackup,
  verifyPassword, hashPassword,
} from './data/data-auth.js';
// core
export { getDataOwnerId, getKimMode, setKimMode } from './data/data-core.js';
// account
export {
  getAccountList, saveAccount, refreshCurrentUserFromDB,
  recoverDeletedAccounts, deleteUserAccount,
} from './data/data-account.js';
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
  getGuildJoinRequests, getMyPendingGuildRequests,
  getGlobalGuildWeeklyRanking,
  getGuildLeader, transferGuildLeadership, kickGuildMember,
  deleteGuild, updateGuild, adminAddGuildMember, adminRemoveGuildMember,
  inviteUserToGuild,
  sendNotification, getMyNotifications, getAdminSentNotifications, getAdminOutreachHistory,
  markNotificationRead, markNotificationsRead, markHeroMessageRead, sendAnnouncement,
  getGuestbook, writeGuestbook, deleteGuestbookEntry,
  findCommentProfileOwner, getComments, writeComment, editComment, deleteComment,
  toggleLike, getCheerStatus, getLikes, getUnseenCheers,
  getHeroMessage, saveHeroMessage,
  saveFcmToken, removeFcmToken,
  getCheersConfig, getCheersConfigRemote, saveCheersConfig,
  getCustomCheers, saveCustomCheer, deleteCustomCheer,
  invalidateCheersCache,
  getMySelfCheer, getMySelfCheerRaw, saveMySelfCheer, deleteMySelfCheer, getFriendSelfCheer,
  getFriendLatestTomatoCycle,
  recordLogin, recordTutorialDone, markPatchnoteRead, recordAction,
  getPatchnote, createPatchnote, getLatestPatchnote,
  trackEvent, flushAnalytics, getAnalytics, getAllAnalytics, getApiUsage,
} from './data/data-social.js';

export { computeGuildStats } from './data/data-social-guild.js';

// workout-equipment (전문가 모드)
export {
  loadGyms, getGyms, getGym, saveGym, deleteGym,
  loadRoutineTemplates, getRoutineTemplates, getRecentRoutineTemplate,
  saveRoutineTemplate, deleteRoutineTemplate,
} from './data/data-workout-equipment.js';

// ═══════════════════════════════════════════════════════════════
// Legacy tab sanitizer
// ═══════════════════════════════════════════════════════════════
// 과거 경량화 이전에 저장된 tab_order/visible_tabs에는 이미 UI가 제거된
// 레거시 탭('monthly' 캘린더, 'finance', 'wine', 'movie', 'dev', 'calendar' 등)이
// 남아 있을 수 있음. 이 탭들이 남아 있으면 applyTabOrder/initSwipeNavigation이
// 존재하지 않는 #tab-* 패널을 찾으려 하여 잠깐의 플래시/빈 렌더가 발생함.
// 알려진 live 탭만 필터링해 그 플래시를 차단한다.
const _LIVE_TABS = new Set(['home','diet','workout','cooking','stats','admin']);
function _sanitizeTabList(list) {
  if (!Array.isArray(list)) return [...DEFAULT_TAB_ORDER];
  const cleaned = list.filter(t => _LIVE_TABS.has(t));
  return cleaned.length ? cleaned : [...DEFAULT_TAB_ORDER];
}

// ═══════════════════════════════════════════════════════════════
// loadAll — 앱 시작 시 전체 데이터 로드
// ═══════════════════════════════════════════════════════════════

export async function migrateDataToUser(userId) {
  const COLLECTIONS = ['workouts','exercises','goals','quests','wines','cal_events','cooking',
    'body_checkins','nutrition_db','finance_benchmarks','finance_actuals','finance_loans',
    'finance_positions','finance_plans','finance_budgets','settings'];
  console.log(`[migrate] ${userId}로 데이터 마이그레이션 시작...`);
  for (const colName of COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      let count = 0;
      for (const d of snap.docs) {
        await setDoc(doc(db, 'users', userId, colName, d.id), d.data());
        count++;
      }
      if (count > 0) console.log(`  [migrate] ${colName}: ${count}건`);
    } catch (e) { console.warn(`  [migrate] ${colName} 실패:`, e.message); }
  }
  console.log('[migrate] 완료');
}

export async function loadAll() {
  try {
    if (getCurrentUserRef() && isAdmin()) {
      const migrateKey = `migrated_${getCurrentUserRef().id}`;
      const migrated = localStorage.getItem(migrateKey) || localStorage.getItem('migrated_김_태우');
      if (!migrated) {
        const testSnap = await getDocs(_col('workouts'));
        if (testSnap.empty) {
          const rootSnap = await getDocs(collection(db, 'workouts'));
          if (!rootSnap.empty) {
            console.log(`[loadAll] ${getCurrentUserRef().id} 마이그레이션 실행`);
            await migrateDataToUser(getCurrentUserRef().id);
          }
        }
        localStorage.setItem(migrateKey, 'done');
      }
    }

    const [snap, exSnap, goalSnap, questSnap,
           cookSnap, checkinSnap, nutritionSnap,
           tomatoSnap, settingsSnap] = await Promise.all([
      getDocs(_col('workouts')),
      getDocs(_col('exercises')),
      getDocs(_col('goals')),
      getDocs(_col('quests')),
      getDocs(_col('cooking')),
      getDocs(_col('body_checkins')),
      getDocs(_col('nutrition_db')),
      getDocs(_col('tomato_cycles')),
      getDocs(_col('settings')),
    ]);

      snap.forEach(d => { _cache[d.id] = d.data(); });
      if (getCurrentUserRef()) {
        await _mergeWorkoutTwinCache(getDataOwnerId());
      }

    const custom = [];
    exSnap.forEach(d => custom.push(d.data()));
    const customIds = new Set(custom.map(e => e.id));
    const defaults  = CONFIG.DEFAULT_EXERCISES.filter(e => !customIds.has(e.id));
    _setExList(_sortExList([...defaults, ...custom]));
    try {
      const customMuscleSnap = await getDocs(_col('custom_muscles'));
      const customMuscles = [];
      customMuscleSnap.forEach(d => customMuscles.push({ id: d.id, ...d.data() }));
      _setCustomMuscles(customMuscles);
    } catch (e) {
      // rules 미반영/권한 오류가 있어도 로그인/기존 기능은 동작하도록 fail-safe
      console.warn('[data] custom_muscles load skipped:', e?.message || e);
      _setCustomMuscles([]);
    }

    { const g = []; goalSnap.forEach(d => g.push(d.data())); _setGoals(g); }
    { const q = []; questSnap.forEach(d => q.push(d.data())); _setQuests(q); }
    { const c = []; cookSnap.forEach(d => c.push(d.data())); _setCooking(c); }
    { const bc = []; checkinSnap.forEach(d => bc.push(d.data())); _setBodyCheckins(bc); }
    { const ndb = []; nutritionSnap.forEach(d => ndb.push(d.data())); _setNutritionDB(ndb); }

    if (_nutritionDB.length === 0 && !isAdmin() && !isAdminGuest()) {
      getDocs(collection(db, 'users', ADMIN_ID, 'nutrition_db')).then(sharedSnap => {
        const sharedItems = [];
        sharedSnap.forEach(d => sharedItems.push(d.data()));
        if (sharedItems.length > 0) {
          _setNutritionDB(sharedItems);
          Promise.all(sharedItems.map(item => setDoc(_doc('nutrition_db', item.id), item)))
            .catch(e => console.warn('[data] 영양DB 복사 실패:', e.message));
        }
      }).catch(e => console.warn('[data] 관리자 영양DB 로드 실패:', e.message));
    }

    { const tc = []; tomatoSnap.forEach(d => tc.push(d.data())); _setTomatoCycles(tc); }
    const fbMap = {};
    settingsSnap.forEach(d => { fbMap[d.id] = d.data().value; });

    _settings.quest_order    = fbMap.quest_order    ?? _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = fbMap.section_titles ?? _migrateFromLS('section_titles', {});
    _settings.mini_memo_items= fbMap.mini_memo_items?? [];
    _settings.weekly_memos   = fbMap.weekly_memos   ?? _migrateFromLS('weekly_memos',   {});
    _settings.tab_order      = _sanitizeTabList(fbMap.tab_order ?? DEFAULT_TAB_ORDER);
    _settings.visible_tabs   = fbMap.visible_tabs ? _sanitizeTabList(fbMap.visible_tabs) : null;
    _settings.diet_plan = fbMap.diet_plan ?? null;
    if ((isAdmin() || isAdminGuest()) && !_settings.diet_plan) {
      const restored = localStorage.getItem('diet_restored_admin');
      if (!restored) {
        _settings.diet_plan = {
          height: 175, weight: 75, bodyFatPct: 17, age: 32,
          targetWeight: 68, targetBodyFatPct: 8,
          activityFactor: 1.3, lossRatePerWeek: 0.009,
          refeedKcal: 5000, refeedDays: [0, 6], startDate: null,
        };
        setDoc(_doc('settings', 'diet_plan'), { value: _settings.diet_plan }).catch(e => console.warn('[data] 식단 설정 저장 실패:', e.message));
        localStorage.setItem('diet_restored_admin', 'done');
      }
    }
    _settings.home_streak_days = fbMap.home_streak_days ?? 6;
    _settings.unit_goal_start  = fbMap.unit_goal_start  ?? null;
    _settings.cheer_last_seen  = fbMap.cheer_last_seen  ?? 0;
    _settings.tomato_state     = fbMap.tomato_state     ?? { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
    _settings.farm_state       = fbMap.farm_state       ?? null;
    _settings.milestone_shown  = fbMap.milestone_shown  ?? {};
    _settings.streak_freezes   = fbMap.streak_freezes   ?? [];
    _settings.expert_preset    = fbMap.expert_preset
      ? { ...DEFAULT_EXPERT_PRESET, ...fbMap.expert_preset }
      : { ...DEFAULT_EXPERT_PRESET };
    if (_settings.diet_plan) _setDietPlan({ ...DEFAULT_DIET_PLAN, ..._settings.diet_plan });

    // 전문가 모드: Gym / RoutineTemplate 로드 (실패해도 전체 앱 동작 유지)
    await Promise.all([loadGyms(), loadRoutineTemplates()]).catch(e =>
      console.warn('[data] expert equipment load skipped:', e?.message || e)
    );

    for (const key of ['quest_order','section_titles','weekly_memos']) {
      if (!fbMap[key] && JSON.stringify(_settings[key]) !== JSON.stringify(
          key === 'quest_order' ? ['quarterly','monthly','weekly','daily'] : {}
      )) {
        await setDoc(_doc('settings', key), { value: _settings[key] }).catch(e => console.warn(`[data] 설정(${key}) 마이그레이션 실패:`, e.message));
      }
    }

    _setSyncStatus('ok');
  } catch(e) {
    _setSyncStatus('err');
    console.error('[data] loadAll:', e);
    _setExList([...CONFIG.DEFAULT_EXERCISES]);
    _setCustomMuscles([]);
    _settings.quest_order    = _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = _migrateFromLS('section_titles', {});
    _settings.weekly_memos   = _migrateFromLS('weekly_memos',   {});
  }
}

// ═══════════════════════════════════════════════════════════════
// saveDay — 운동/식단 데이터 저장
// ═══════════════════════════════════════════════════════════════

export async function saveDay(key, data) {
  const isEmpty = !data || (
    !data.exercises?.length && !data.cf && !data.memo &&
    !data.breakfast && !data.lunch && !data.dinner && !data.snack &&
    !data.gym_skip && !data.gym_health &&
    !data.cf_skip  && !data.cf_health &&
    !data.stretching && !data.swimming && !data.running && !data.wine_free &&
    !data.breakfast_skipped && !data.lunch_skipped && !data.dinner_skipped &&
    !data.bKcal && !data.lKcal && !data.dKcal && !data.sKcal &&
    !data.runDistance && !data.swimDistance &&
    !data.bFoods?.length && !data.lFoods?.length && !data.dFoods?.length && !data.sFoods?.length &&
    !data.bPhoto && !data.lPhoto && !data.dPhoto && !data.sPhoto && !data.workoutPhoto
  );
  if (!isEmpty) {
    const json = JSON.stringify(data);
    if (json.length > 900000) {
      console.warn('[data] 문서 크기 초과 위험 (' + Math.round(json.length/1024) + 'KB) — 사진 품질 축소');
      const photoKeys = ['bPhoto','lPhoto','dPhoto','sPhoto','workoutPhoto'];
      for (const pk of photoKeys) {
        if (data[pk] && data[pk].length > 100000) {
          try {
            const img = new Image();
            const loaded = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            img.src = data[pk];
            await loaded;
            const c = document.createElement('canvas');
            const MAX = 480;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
              else { w = Math.round(w * MAX / h); h = MAX; }
            }
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            data[pk] = c.toDataURL('image/jpeg', 0.5);
          } catch { data[pk] = null; }
        }
      }
    }
  }
  return _fbOp('saveDay', async () => {
    if (isEmpty) { delete _cache[key]; await deleteDoc(_doc('workouts', key)); }
    else { _cache[key] = data; await setDoc(_doc('workouts', key), data); }
  });
}

// ═══════════════════════════════════════════════════════════════
// Exercise CRUD
// ═══════════════════════════════════════════════════════════════

export async function saveExercise(ex) {
  return _fbOp('saveExercise', async () => {
    await setDoc(_doc('exercises', ex.id), ex);
    const idx = _exList.findIndex(e => e.id === ex.id);
    if (idx >= 0) _exList[idx] = ex; else _exList.push(ex);
    _setExList(_sortExList(_exList));
  }, { sync: false });
}

export async function deleteExercise(id) {
  return _fbOp('deleteExercise', async () => {
    await deleteDoc(_doc('exercises', id));
    _setExList(_exList.filter(e => e.id !== id));
  }, { sync: false });
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
export const getBodyCheckins = () => [..._bodyCheckins].sort((a,b) => (a.date||'').localeCompare(b.date||''));

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
    if (m?.id && m?.name) byId.set(m.id, m);
  });
  return [...byId.values()];
};
export const getCache     = ()      => _cache;
export const getAllDateKeys = () => Object.keys(_cache).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
export const getDay       = (y,m,d) => _cache[dateKey(y,m,d)] || {};

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
export function isActiveWorkoutDayData(workoutData) {
  if (!workoutData) return false;
  const w = workoutData;
  if ((w.exercises || []).length > 0) return true;
  if (w.cf || w.swimming || w.running || w.stretching) return true;
  if ((w.muscles || []).length > 0) return true;
  if ((w.workoutDuration || 0) > 0) return true;
  if ((w.runDistance || 0) > 0) return true;
  if ((w.runDurationMin || 0) > 0) return true;
  if ((w.runDurationSec || 0) > 0) return true;
  if ((w.cfDurationMin || 0) > 0) return true;
  if ((w.cfDurationSec || 0) > 0) return true;
  if ((w.cfWod || '').toString().trim()) return true;
  if ((w.stretchDuration || 0) > 0) return true;
  if ((w.swimDistance || 0) > 0) return true;
  if ((w.swimDurationMin || 0) > 0) return true;
  if ((w.swimDurationSec || 0) > 0) return true;
  if ((w.swimStroke || '').toString().trim()) return true;
  if (w.bKcal || w.lKcal || w.dKcal) return true;
  if (w.sKcal) return true;
  if ((w.bFoods || []).length || (w.lFoods || []).length || (w.dFoods || []).length) return true;
  if ((w.sFoods || []).length) return true;
  if (w.breakfast || w.lunch || w.dinner) return true;
  if (w.snack) return true;
  if (w.bPhoto || w.lPhoto || w.dPhoto || w.sPhoto || w.workoutPhoto) return true;
  if (w.workoutPhoto) return true;
  return false;
}
export const isActiveLocalDay = (y,m,d) => isActiveWorkoutDayData(getDay(y,m,d));

function _getWorkoutTwinOwnerId(ownerId) {
  const id = String(ownerId || '').trim();
  if (!id) return '';
  if (/\(guest\)$/i.test(id)) return id.replace(/\(guest\)$/i, '').trim();
  return `${id}(guest)`;
}

async function _mergeWorkoutTwinCache(ownerId) {
  const twinOwnerId = _getWorkoutTwinOwnerId(ownerId);
  if (!ownerId || !twinOwnerId || twinOwnerId === ownerId) return;

  try {
    const twinSnap = await getDocs(collection(db, 'users', twinOwnerId, 'workouts'));
    twinSnap.forEach((d) => {
      const incoming = d.data();
      const existing = _cache[d.id];
      if (!existing) {
        _cache[d.id] = incoming;
        return;
      }
      if (!isActiveWorkoutDayData(existing) && isActiveWorkoutDayData(incoming)) {
        _cache[d.id] = { ...existing, ...incoming };
      }
    });
  } catch (e) {
    console.warn('[data] workout twin merge failed:', e.message);
  }
}

export const getMuscles   = (y,m,d) => {
  const day = getDay(y,m,d);
  const ids = new Set(getExercises(y,m,d).map(e => e.muscleId));
  if (day.swimming) ids.add('swimming');
  if (day.running)  ids.add('running');
  return [...ids];
};
export const getCF        = (y,m,d) => !!getDay(y,m,d).cf;
export const getMemo      = (y,m,d) => getDay(y,m,d).memo || '';

export const getGymSkip   = (y,m,d) => !!getDay(y,m,d)?.gym_skip;
export const getGymHealth = (y,m,d) => !!getDay(y,m,d)?.gym_health;
export const getCFSkip    = (y,m,d) => !!getDay(y,m,d)?.cf_skip;
export const getCFHealth  = (y,m,d) => !!getDay(y,m,d)?.cf_health;

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
export const getVolumeHistory = (exerciseId) => _getVolumeHistory(_cache, exerciseId);
export const getLastSession = (exerciseId, excludeDateKey = null) => _getLastSession(_cache, exerciseId, excludeDateKey);
export const getLastActivitySession = (type, excludeDateKey = null) => _getLastActivitySession(_cache, type, excludeDateKey);
// 전문가 모드 분석 함수 (순수함수는 calc.js, 여기서는 _cache/_exList 자동 주입)
export const getVolumeHistoryByMovement = (movementId) => _getVolumeHistoryByMovement(_cache, _exList, movementId);
export const getVolumeHistoryMulti = (exerciseIds) => _getVolumeHistoryMulti(_cache, exerciseIds);
export const detectPRs = (exerciseId) => _detectPRs(_cache, exerciseId);
// MOVEMENTS 인자는 호출부에서 주입 (config.js 순환참조 회피)
export const calcBalanceByPattern = (movements, weekRange) => _calcBalanceByPattern(_cache, _exList, movements, weekRange);

// ── Expert Preset 접근자 ───────────────────────────────────────
export const getExpertPreset = () => ({ ...DEFAULT_EXPERT_PRESET, ..._settings.expert_preset });
export async function saveExpertPreset(patch) {
  const merged = { ...getExpertPreset(), ...patch, updatedAt: Date.now() };
  return _saveSetting('expert_preset', merged);
}
export const isExpertModeEnabled = () => !!_settings.expert_preset?.enabled;

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

export const getTabOrder  = () => _settings.tab_order || DEFAULT_TAB_ORDER;
export const saveTabOrder = (order) => _saveSetting('tab_order', order);

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

// ═══════════════════════════════════════════════════════════════
// Farm System
// ═══════════════════════════════════════════════════════════════

const FARM_SHOP_ITEMS = [
  { id: 'tree1', name: '나무', emoji: '🌳', price: 3, category: 'nature' },
  { id: 'tree2', name: '소나무', emoji: '🌲', price: 3, category: 'nature' },
  { id: 'flower1', name: '꽃', emoji: '🌸', price: 1, category: 'nature' },
  { id: 'flower2', name: '해바라기', emoji: '🌻', price: 1, category: 'nature' },
  { id: 'flower3', name: '튤립', emoji: '🌷', price: 1, category: 'nature' },
  { id: 'mushroom', name: '버섯', emoji: '🍄', price: 1, category: 'nature' },
  { id: 'cactus', name: '선인장', emoji: '🌵', price: 2, category: 'nature' },
  { id: 'herb', name: '허브', emoji: '🌿', price: 1, category: 'nature' },
  { id: 'house', name: '집', emoji: '🏡', price: 8, category: 'building' },
  { id: 'barn', name: '헛간', emoji: '🏚️', price: 5, category: 'building' },
  { id: 'fence', name: '울타리', emoji: '🪵', price: 1, category: 'building' },
  { id: 'well', name: '우물', emoji: '⛲', price: 4, category: 'building' },
  { id: 'bench', name: '벤치', emoji: '🪑', price: 2, category: 'building' },
  { id: 'lamp', name: '가로등', emoji: '🏮', price: 2, category: 'building' },
  { id: 'cat', name: '고양이', emoji: '🐱', price: 5, category: 'animal' },
  { id: 'dog', name: '강아지', emoji: '🐶', price: 5, category: 'animal' },
  { id: 'chicken', name: '닭', emoji: '🐔', price: 3, category: 'animal' },
  { id: 'rabbit', name: '토끼', emoji: '🐰', price: 4, category: 'animal' },
  { id: 'rainbow', name: '무지개', emoji: '🌈', price: 10, category: 'special' },
  { id: 'star', name: '별', emoji: '⭐', price: 6, category: 'special' },
];

export const getFarmShopItems = () => FARM_SHOP_ITEMS;

const DEFAULT_FARM_STATE = {
  tiles: Array(24).fill(null),
  ownedItems: [],
  characterPos: 7,
  characterDir: 'down',
};

export function getFarmState() {
  return _settings.farm_state || { ...DEFAULT_FARM_STATE, tiles: Array(24).fill(null), ownedItems: [] };
}

export async function saveFarmState(state) {
  _settings.farm_state = state;
  return _saveSetting('farm_state', state);
}

export async function buyFarmItem(itemId) {
  const shop = FARM_SHOP_ITEMS.find(i => i.id === itemId);
  if (!shop) return { error: '아이템을 찾을 수 없어요.' };
  const tomato = getTomatoState();
  const available = tomato.totalTomatoes + (tomato.giftedReceived || 0) - (tomato.giftedSent || 0);
  const farm = getFarmState();
  const spent = (farm.ownedItems || []).reduce((sum, i) => {
    const s = FARM_SHOP_ITEMS.find(x => x.id === i.itemId);
    return sum + (s ? s.price * i.quantity : 0);
  }, 0);
  const balance = available - spent;
  if (balance < shop.price) return { error: `토마토가 부족해요. (필요: ${shop.price}🍅, 보유: ${balance}🍅)` };
  const owned = farm.ownedItems || [];
  const existing = owned.find(i => i.itemId === itemId);
  if (existing) { existing.quantity++; } else { owned.push({ itemId, quantity: 1 }); }
  farm.ownedItems = owned;
  await saveFarmState(farm);
  return { ok: true, balance: balance - shop.price };
}

export async function placeFarmItem(tileIndex, itemId) {
  const farm = getFarmState();
  if (tileIndex < 0 || tileIndex >= 24) return;
  const placedCount = farm.tiles.filter(t => t?.itemId === itemId).length;
  const owned = (farm.ownedItems || []).find(i => i.itemId === itemId);
  if (!owned || owned.quantity <= placedCount) return;
  farm.tiles[tileIndex] = { itemId, placedAt: Date.now() };
  await saveFarmState(farm);
}

export async function removeFarmItem(tileIndex) {
  const farm = getFarmState();
  if (tileIndex < 0 || tileIndex >= 24) return;
  farm.tiles[tileIndex] = null;
  await saveFarmState(farm);
}

export async function moveFarmCharacter(tileIndex) {
  const farm = getFarmState();
  farm.characterPos = tileIndex;
  await saveFarmState(farm);
}