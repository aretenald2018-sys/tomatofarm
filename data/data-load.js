// ================================================================
// data/data-load.js — 앱 시작 시 전체 데이터 로드 + 관련 마이그레이션/헬퍼
// ================================================================
// loadAll: 로그인 후 _cache + _settings + _exList + _goals/_quests 등 초기 덤프.
// migrateDataToUser: admin 최초 로그인 시 root 컬렉션 → users/{uid}/* 로 이관.
// _mergeWorkoutTwinCache: admin <-> admin(guest) 트윈 계정의 workouts 병합.
// _sanitizeTabList: 레거시 탭 필터 (finance/wine/movie/monthly 등 제거).
// isActiveWorkoutDayData: day 객체가 "기록 있음" 상태인지 판정.
// ================================================================

import { CONFIG, MOVEMENTS } from '../config.js';
import {
  db, doc, setDoc, collection, getDocs, getDoc, runTransaction, onSnapshot,
  getCurrentUserRef, ADMIN_ID, getDataOwnerId,
  _cache, _nutritionDB,
  _setCache, _setExList, _setCustomMuscles, _setGoals, _setQuests, _setCooking, _setBodyCheckins, _setNutritionDB,
  DEFAULT_TAB_ORDER, DEFAULT_DIET_PLAN, DEFAULT_EXPERT_PRESET,
  _setDietPlan, _settings,
  _setTomatoCycles,
  _setSyncStatus, _migrateFromLS,
} from './data-core.js';
import { isAdmin, isAdminGuest } from './data-auth.js';
import { _sortExList } from './data-helpers.js';
import { loadGyms, loadRoutineTemplates } from './data-workout-equipment.js';
import { loadEquipmentPool } from './data-equipment-pool.js';
import {
  ACCOUNT_DATA_COLLECTIONS,
  ACCOUNT_UNIFICATION_MARKER_ID,
  ACCOUNT_UNIFICATION_VERSION,
  ADMIN_ACCOUNT_ID,
  ADMIN_GUEST_ACCOUNT_ID,
  buildAccountUnificationPlan,
} from './account-unification.js';
import { mergeWorkoutDayRecords, workoutDayRecordsEqual } from './workout-day-merge.js';

// ── Pure 헬퍼 (Firebase 비의존) ─────────────────────────────────
// node:test 에서 import 가능하도록 data/data-pure.js 로 분리. 여기서는 re-export.
import {
  EXERCISE_CATALOG_SEED_KEY,
  buildExerciseCatalogSeedPlan,
  buildMaxCycleCanonicalPlan,
  normalizeExerciseMovementRecord,
  _sanitizeTabList,
  isActiveWorkoutDayData,
} from './data-pure.js';
import {
  restorePendingDayWritesForOwner,
  flushPendingDayWrites,
  initializePendingDayWriteSync,
} from './data-save.js';
export { _sanitizeTabList, isActiveWorkoutDayData, buildExerciseCatalogSeedPlan };

let _workoutRealtimeUnsubscribe = null;
let _workoutRealtimeOwnerId = null;
let _workoutRealtimeGeneration = 0;
let _loadAllGeneration = 0;

function _changedWorkoutDateKeys(previousCache, nextCache) {
  const keys = new Set([
    ...Object.keys(previousCache || {}),
    ...Object.keys(nextCache || {}),
  ]);
  return [...keys].filter(key => {
    try {
      return JSON.stringify(previousCache?.[key] || null) !== JSON.stringify(nextCache?.[key] || null);
    } catch {
      return true;
    }
  });
}

function _notifyWorkoutCacheChanged(ownerId, changedDateKeys, source) {
  if (!changedDateKeys.length || typeof document === 'undefined') return;
  document.dispatchEvent(new CustomEvent('data:workouts-updated', {
    detail: { ownerId, changedDateKeys, source },
  }));
}

export function stopWorkoutRealtimeSync() {
  _workoutRealtimeGeneration += 1;
  try { _workoutRealtimeUnsubscribe?.(); } catch {}
  _workoutRealtimeUnsubscribe = null;
  _workoutRealtimeOwnerId = null;
}

export function startWorkoutRealtimeSync(ownerId = getDataOwnerId()) {
  if (!ownerId) {
    stopWorkoutRealtimeSync();
    return;
  }
  if (_workoutRealtimeUnsubscribe && _workoutRealtimeOwnerId === ownerId) return;
  stopWorkoutRealtimeSync();
  _workoutRealtimeOwnerId = ownerId;
  const realtimeGeneration = ++_workoutRealtimeGeneration;
  const ownerWorkouts = collection(db, 'users', ownerId, 'workouts');
  _workoutRealtimeUnsubscribe = onSnapshot(ownerWorkouts, (snapshot) => {
    // An unsubscribe does not guarantee an already queued callback will not
    // run.  Without this token, a stale A callback after A → B can stop or
    // overwrite B's live subscription/cache.
    if (_workoutRealtimeGeneration !== realtimeGeneration) return;
    if (getDataOwnerId() !== ownerId) {
      stopWorkoutRealtimeSync();
      return;
    }
    const remoteCache = {};
    snapshot.forEach(documentSnapshot => {
      remoteCache[documentSnapshot.id] = documentSnapshot.data();
    });
    const nextCache = restorePendingDayWritesForOwner(ownerId, remoteCache);
    if (getDataOwnerId() !== ownerId) return;
    const changedDateKeys = _changedWorkoutDateKeys(_cache, nextCache);
    _setCache(nextCache);
    _notifyWorkoutCacheChanged(ownerId, changedDateKeys, 'firestore');
  }, (error) => {
    if (_workoutRealtimeGeneration !== realtimeGeneration) return;
    if (getDataOwnerId() === ownerId) {
      console.warn('[data] workout realtime sync deferred:', error?.message || error);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Admin ↔ Admin(guest) twin-account workout merge
// ═══════════════════════════════════════════════════════════════
// 관리자/게스트 트윈 계정이 같은 사람의 운동 기록을 공유하므로 로드 시
// 상대 계정의 활성 day 를 내 _cache 에 얕게 병합. 기록 없는 쪽을 덮어쓰지 않음.
function _getWorkoutTwinOwnerId(ownerId) {
  const id = String(ownerId || '').trim();
  if (!id) return '';
  if (/\(guest\)$/i.test(id)) return id.replace(/\(guest\)$/i, '').trim();
  return `${id}(guest)`;
}

// 운동 도메인 필드 — 트윈 병합 시 owner 에 값이 없으면 twin 값 채우기.
// 과거: 전체 day 객체 단위로 판정 → owner 에 식단만 있고 운동 없는 날엔 twin 의 운동이
//       병합 안 돼 스트릭이 계정 로그인 시마다 1↔5 로 흔들렸다 (문정토마토 이슈).
const _TWIN_WORKOUT_FIELDS = [
  'workoutSessions',
  'exercises', 'cf', 'swimming', 'running', 'stretching',
  'runDistance', 'runDurationMin', 'runDurationSec', 'runMemo',
  'runSource', 'runStartedAt', 'runEndedAt', 'runRoute', 'runRouteRef', 'runRouteSummary',
  'runPlaceSummary', 'runAvgPaceSecPerKm', 'runGpsAccuracySummary',
  'swimDistance', 'swimDurationMin', 'swimDurationSec', 'swimStroke', 'swimMemo',
  'cfWod', 'cfDurationMin', 'cfDurationSec', 'cfMemo',
  'stretchDuration', 'stretchMemo',
  'workoutDuration', 'workoutTimeline', 'workoutPhoto',
  'gymId', 'routineMeta',
];

function _isFieldEmpty(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'string') return v === '';
  if (typeof v === 'number') return v === 0;
  if (typeof v === 'boolean') return v === false;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function _mergeTwinWorkoutFields(existing, incoming) {
  const merged = { ...existing };
  for (const field of _TWIN_WORKOUT_FIELDS) {
    if (_isFieldEmpty(existing[field]) && !_isFieldEmpty(incoming[field])) {
      merged[field] = incoming[field];
    }
  }
  return merged;
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
      // 필드 단위 병합 — owner 가 값을 갖고 있지 않은 운동 필드만 twin 값으로 채움.
      _cache[d.id] = _mergeTwinWorkoutFields(existing, incoming);
    });
  } catch (e) {
    console.warn('[data] workout twin merge failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// migrateDataToUser — admin 최초 로그인 시 root → users/{uid}/* 이관
// ═══════════════════════════════════════════════════════════════
function _snapshotDocuments(snapshot) {
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
}

async function _copyMissingDocuments({ targetUserId, collectionName, guestUserId = null }) {
  const reads = [
    getDocs(collection(db, 'users', targetUserId, collectionName)),
    getDocs(collection(db, collectionName)),
  ];
  if (guestUserId) reads.splice(1, 0, getDocs(collection(db, 'users', guestUserId, collectionName)));

  const [canonicalSnap, ...sources] = await Promise.all(reads);
  const [guestSnap, legacySnap] = guestUserId ? sources : [null, sources[0]];
  const plan = buildAccountUnificationPlan({
    canonicalDocuments: _snapshotDocuments(canonicalSnap),
    guestDocuments: guestSnap ? _snapshotDocuments(guestSnap) : [],
    legacyDocuments: legacySnap ? _snapshotDocuments(legacySnap) : [],
    collectionName,
  });

  let copied = 0;
  for (const documentData of plan) {
    const targetRef = doc(db, 'users', targetUserId, collectionName, documentData.id);
    // 최초 read와 write 사이 다른 클라이언트가 canonical day를 만들 수 있다.
    // transaction 안에서 다시 확인해 현재 식단/운동/사진을 절대 덮지 않는다.
    const didCopy = await runTransaction(db, async (transaction) => {
      const current = await transaction.get(targetRef);
      if (collectionName === 'workouts') {
        const currentData = current.exists() ? current.data() : {};
        const merged = mergeWorkoutDayRecords(currentData, documentData.data);
        if (current.exists() && workoutDayRecordsEqual(currentData, merged)) return false;
        transaction.set(targetRef, merged, { merge: true });
        return true;
      }
      if (current.exists()) return false;
      transaction.set(targetRef, documentData.data);
      return true;
    });
    if (didCopy) copied += 1;
  }
  return copied;
}

// Public legacy-root migration API.  It is now copy-only instead of replacing
// a user document that may have been written by another app session.
export async function migrateDataToUser(userId) {
  let copied = 0;
  for (const collectionName of ACCOUNT_DATA_COLLECTIONS) {
    copied += await _copyMissingDocuments({ targetUserId: userId, collectionName });
  }
  return copied;
}

// The guest and root stores are read only as historical sources. Canonical
// records win within each meal/activity domain, while missing same-date domains
// (for example a guest run beside a canonical lunch) are recovered once.
export async function unifySharedAccountData() {
  const markerRef = doc(db, 'users', ADMIN_ACCOUNT_ID, 'settings', ACCOUNT_UNIFICATION_MARKER_ID);
  const marker = await getDoc(markerRef);
  if (Number(marker.data()?.value?.version || 0) >= ACCOUNT_UNIFICATION_VERSION) {
    return { state: 'already-unified', copied: 0 };
  }

  let copied = 0;
  for (const collectionName of ACCOUNT_DATA_COLLECTIONS) {
    copied += await _copyMissingDocuments({
      targetUserId: ADMIN_ACCOUNT_ID,
      guestUserId: ADMIN_GUEST_ACCOUNT_ID,
      collectionName,
    });
  }
  await setDoc(markerRef, {
    value: { version: ACCOUNT_UNIFICATION_VERSION, copied, completedAt: Date.now() },
  }, { merge: true });
  return { state: 'unified', copied };
}

// ═══════════════════════════════════════════════════════════════
// loadAll — 앱 시작 시 전체 데이터 로드
// ═══════════════════════════════════════════════════════════════
export async function loadAll() {
  const loadGeneration = ++_loadAllGeneration;
  const ownerId = getDataOwnerId();
  if (!ownerId) {
    // 이전 계정 캐시를 로그인 화면이나 다음 계정에 노출하지 않는다.
    stopWorkoutRealtimeSync();
    _setCache({});
    _setSyncStatus('err');
    return;
  }

  const ownerCollection = (name) => collection(db, 'users', ownerId, name);
  const ownerDoc = (name, id) => doc(db, 'users', ownerId, name, id);
  const isCurrentLoad = () => (
    _loadAllGeneration === loadGeneration && getDataOwnerId() === ownerId
  );
  const abandonIfStale = () => {
    if (isCurrentLoad()) return false;
    // 새 loadAll이 이미 시작됐다면 그 실행이 소유한 캐시를 건드리지 않는다.
    if (_loadAllGeneration === loadGeneration) {
      const currentOwnerId = getDataOwnerId();
      _setCache(currentOwnerId ? restorePendingDayWritesForOwner(currentOwnerId, {}) : {});
    }
    return true;
  };
  const pendingSeed = restorePendingDayWritesForOwner(ownerId, {});
  // 원격 getDocs가 느리거나 앱 bootstrap timeout을 넘겨도 새로고침 직후
  // 기기에 보관된 식단/운동부터 복원한다.
  if (abandonIfStale()) return;
  _setCache(pendingSeed);

  try {
    if (getCurrentUserRef() && ownerId === ADMIN_ACCOUNT_ID) {
      try {
        await unifySharedAccountData();
      } catch (error) {
        // Keep canonical data readable if a legacy collection is temporarily
        // inaccessible.  No completion marker is written, so this safely retries.
        console.warn('[data] shared account unification deferred:', error?.message || error);
      }
    }
    if (abandonIfStale()) return;

    const [snap, exSnap, goalSnap, questSnap,
           cookSnap, checkinSnap, nutritionSnap,
           tomatoSnap, settingsSnap] = await Promise.all([
      getDocs(ownerCollection('workouts')),
      getDocs(ownerCollection('exercises')),
      getDocs(ownerCollection('goals')),
      getDocs(ownerCollection('quests')),
      getDocs(ownerCollection('cooking')),
      getDocs(ownerCollection('body_checkins')),
      getDocs(ownerCollection('nutrition_db')),
      getDocs(ownerCollection('tomato_cycles')),
      getDocs(ownerCollection('settings')),
    ]);

    if (abandonIfStale()) return;
    const remoteCache = {};
    snap.forEach(d => { remoteCache[d.id] = d.data(); });
    // 원격 snapshot 뒤에 load 시작 시점 pending, 그 뒤 현재 pending을 덮어
    // 쓴다. flush ack와 snapshot 간 순서가 엇갈려도 로컬 최신 변경이 이긴다.
    const remoteWithSeed = { ...remoteCache };
    Object.entries(pendingSeed).forEach(([dateKey, pendingDay]) => {
      remoteWithSeed[dateKey] = { ...(remoteWithSeed[dateKey] || {}), ...pendingDay };
    });
    _setCache(restorePendingDayWritesForOwner(ownerId, remoteWithSeed));

    const fbMap = {};
    settingsSnap.forEach(d => { fbMap[d.id] = d.data().value; });

    const storedExercises = [];
    exSnap.forEach(d => storedExercises.push(d.data()));
    const seedPlan = buildExerciseCatalogSeedPlan({
      defaultExercises: CONFIG.DEFAULT_EXERCISES,
      storedExercises,
      seedState: fbMap[EXERCISE_CATALOG_SEED_KEY],
      now: Date.now(),
    });
    if (seedPlan.needsSeed) {
      try {
        await Promise.all(seedPlan.seedExercises.map(ex => setDoc(ownerDoc('exercises', ex.id), ex)));
        await setDoc(ownerDoc('settings', EXERCISE_CATALOG_SEED_KEY), { value: seedPlan.seedMarker });
        fbMap[EXERCISE_CATALOG_SEED_KEY] = seedPlan.seedMarker;
      } catch (e) {
        console.warn('[data] exercise catalog seed skipped:', e?.message || e);
      }
    }
    if (abandonIfStale()) return;
    _setExList(_sortExList(seedPlan.exercises.map(ex => normalizeExerciseMovementRecord(ex, MOVEMENTS))));
    try {
      const customMuscleSnap = await getDocs(ownerCollection('custom_muscles'));
      if (abandonIfStale()) return;
      const customMuscles = [];
      customMuscleSnap.forEach(d => customMuscles.push({ id: d.id, ...d.data() }));
      _setCustomMuscles(customMuscles);
    } catch (e) {
      if (abandonIfStale()) return;
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
        if (!isCurrentLoad()) return;
        const sharedItems = [];
        sharedSnap.forEach(d => sharedItems.push(d.data()));
        if (sharedItems.length > 0) {
          _setNutritionDB(sharedItems);
          Promise.all(sharedItems.map(item => setDoc(ownerDoc('nutrition_db', item.id), item)))
            .catch(e => console.warn('[data] 영양DB 복사 실패:', e.message));
        }
      }).catch(e => console.warn('[data] 관리자 영양DB 로드 실패:', e.message));
    }

    { const tc = []; tomatoSnap.forEach(d => tc.push(d.data())); _setTomatoCycles(tc); }

    _settings.quest_order    = fbMap.quest_order    ?? _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = fbMap.section_titles ?? _migrateFromLS('section_titles', {});
    _settings.mini_memo_items= fbMap.mini_memo_items?? [];
    _settings.weekly_memos   = fbMap.weekly_memos   ?? _migrateFromLS('weekly_memos',   {});
    _settings.tab_order      = _sanitizeTabList(fbMap.tab_order ?? DEFAULT_TAB_ORDER);
    _settings.visible_tabs   = fbMap.visible_tabs ? _sanitizeTabList(fbMap.visible_tabs) : null;
    _settings.diet_plan = fbMap.diet_plan ?? null;
    if ((isAdmin() || isAdminGuest()) && !_settings.diet_plan) {
      // B3: diet_restored_admin 플래그를 Firestore에서 관리 (localStorage 기기 단위 → 유저별 Firestore)
      const dietRestored = fbMap.admin_diet_restored;
      if (!dietRestored) {
        _settings.diet_plan = {
          height: 175, weight: 75, bodyFatPct: 17, age: 32,
          targetWeight: 68, targetBodyFatPct: 8,
          activityFactor: 1.3, lossRatePerWeek: 0.009,
          refeedKcal: 5000, refeedDays: [0, 6], startDate: null,
        };
        setDoc(ownerDoc('settings', 'diet_plan'), { value: _settings.diet_plan }).catch(e => console.warn('[data] 식단 설정 저장 실패:', e.message));
        setDoc(ownerDoc('settings', 'admin_diet_restored'), { value: 'done' }).catch(e => console.warn('[data] admin_diet_restored 저장 실패:', e.message));
      }
    }
    _settings.home_streak_days = fbMap.home_streak_days ?? 6;
    _settings.unit_goal_start  = fbMap.unit_goal_start  ?? null;
    _settings.active_timer     = fbMap.active_timer     ?? null;
    _settings.max_cycle        = fbMap.max_cycle        ?? null;
    _settings.test_board_v2    = fbMap.test_board_v2    ?? null;
    _settings.season_registry  = fbMap.season_registry  ?? { schemaVersion: 2, seasons: [] };
    Object.entries(fbMap).forEach(([key, value]) => {
      if (/^season_.+_(?:workout_plan|test_board_v2|running_plan)$/.test(key)) {
        _settings[key] = value;
      }
    });
    _settings.exercise_catalog_seed = fbMap.exercise_catalog_seed ?? null;
    _settings.cheer_last_seen  = fbMap.cheer_last_seen  ?? 0;
    _settings.tomato_state     = fbMap.tomato_state     ?? { quarterlyTomatoes: {}, totalTomatoes: 0, giftedReceived: 0, giftedSent: 0 };
    _settings.milestone_shown  = fbMap.milestone_shown  ?? {};
    _settings.streak_freezes   = fbMap.streak_freezes   ?? [];
    _settings.diet_premium_report_inbox = fbMap.diet_premium_report_inbox ?? null;
    _settings.diet_premium_report_seen = fbMap.diet_premium_report_seen ?? {};
    _settings.expert_preset    = fbMap.expert_preset
      ? { ...DEFAULT_EXPERT_PRESET, ...fbMap.expert_preset }
      : { ...DEFAULT_EXPERT_PRESET };
    const maxCyclePlan = buildMaxCycleCanonicalPlan({
      expertPreset: _settings.expert_preset,
      settingCycle: _settings.max_cycle,
      now: Date.now(),
    });
    if (maxCyclePlan.shouldWriteMaxCycle) {
      _settings.max_cycle = maxCyclePlan.canonicalCycle;
      fbMap.max_cycle = maxCyclePlan.canonicalCycle;
      await setDoc(ownerDoc('settings', 'max_cycle'), { value: maxCyclePlan.canonicalCycle })
        .catch(e => console.warn('[data] max_cycle migration failed:', e?.message || e));
      if (abandonIfStale()) return;
    }
    if (maxCyclePlan.shouldWriteExpertPreset) {
      _settings.expert_preset = maxCyclePlan.cleanedPreset;
      fbMap.expert_preset = maxCyclePlan.cleanedPreset;
      await setDoc(ownerDoc('settings', 'expert_preset'), { value: maxCyclePlan.cleanedPreset })
        .catch(e => console.warn('[data] expert_preset maxCycle cleanup failed:', e?.message || e));
      if (abandonIfStale()) return;
    }
    if (_settings.diet_plan) _setDietPlan({ ...DEFAULT_DIET_PLAN, ..._settings.diet_plan });

    // 전문가 모드: Gym / RoutineTemplate 로드 (실패해도 전체 앱 동작 유지)
    await Promise.all([loadGyms(ownerId), loadRoutineTemplates(ownerId), loadEquipmentPool(ownerId)]).catch(e =>
      console.warn('[data] expert equipment load skipped:', e?.message || e)
    );
    if (abandonIfStale()) return;

    for (const key of ['quest_order','section_titles','weekly_memos']) {
      if (!fbMap[key] && JSON.stringify(_settings[key]) !== JSON.stringify(
          key === 'quest_order' ? ['quarterly','monthly','weekly','daily'] : {}
      )) {
        await setDoc(ownerDoc('settings', key), { value: _settings[key] }).catch(e => console.warn(`[data] 설정(${key}) 마이그레이션 실패:`, e.message));
        if (abandonIfStale()) return;
      }
    }

    _setSyncStatus('ok');
  } catch(e) {
    if (abandonIfStale()) return;
    _setSyncStatus('err');
    console.error('[data] loadAll:', e);
    _setExList([...CONFIG.DEFAULT_EXERCISES]);
    _setCustomMuscles([]);
    _settings.quest_order    = _migrateFromLS('quest_order',    ['quarterly','monthly','weekly','daily']);
    _settings.section_titles = _migrateFromLS('section_titles', {});
    _settings.weekly_memos   = _migrateFromLS('weekly_memos',   {});
    _settings.season_registry = { schemaVersion: 2, seasons: [] };
  } finally {
    if (isCurrentLoad()) {
      startWorkoutRealtimeSync(ownerId);
      initializePendingDayWriteSync();
      void flushPendingDayWrites(ownerId).catch(error => {
        console.warn('[data] pending day startup sync deferred:', error?.message || error);
      });
    }
  }
}
