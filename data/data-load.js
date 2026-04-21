// ================================================================
// data/data-load.js — 앱 시작 시 전체 데이터 로드 + 관련 마이그레이션/헬퍼
// ================================================================
// loadAll: 로그인 후 _cache + _settings + _exList + _goals/_quests 등 초기 덤프.
// migrateDataToUser: admin 최초 로그인 시 root 컬렉션 → users/{uid}/* 로 이관.
// _mergeWorkoutTwinCache: admin <-> admin(guest) 트윈 계정의 workouts 병합.
// _sanitizeTabList: 레거시 탭 필터 (finance/wine/movie/monthly 등 제거).
// isActiveWorkoutDayData: day 객체가 "기록 있음" 상태인지 판정.
// ================================================================

import { CONFIG } from '../config.js';
import {
  db, doc, setDoc, collection, getDocs,
  getCurrentUserRef, ADMIN_ID, getDataOwnerId,
  _col, _doc,
  _cache, _nutritionDB,
  _setExList, _setCustomMuscles, _setGoals, _setQuests, _setCooking, _setBodyCheckins, _setNutritionDB,
  DEFAULT_TAB_ORDER, DEFAULT_DIET_PLAN, DEFAULT_EXPERT_PRESET,
  _setDietPlan, _settings,
  _setTomatoCycles,
  _setSyncStatus, _migrateFromLS,
} from './data-core.js';
import { isAdmin, isAdminGuest } from './data-auth.js';
import { _sortExList } from './data-helpers.js';
import { loadGyms, loadRoutineTemplates } from './data-workout-equipment.js';

// ── Pure 헬퍼 (Firebase 비의존) ─────────────────────────────────
// node:test 에서 import 가능하도록 data/data-pure.js 로 분리. 여기서는 re-export.
import { _sanitizeTabList, isActiveWorkoutDayData } from './data-pure.js';
export { _sanitizeTabList, isActiveWorkoutDayData };

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
  'exercises', 'cf', 'swimming', 'running', 'stretching',
  'runDistance', 'runDurationMin', 'runDurationSec', 'runMemo',
  'swimDistance', 'swimDurationMin', 'swimDurationSec', 'swimStroke', 'swimMemo',
  'cfWod', 'cfDurationMin', 'cfDurationSec', 'cfMemo',
  'stretchDuration', 'stretchMemo',
  'workoutDuration', 'workoutPhoto',
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

// ═══════════════════════════════════════════════════════════════
// loadAll — 앱 시작 시 전체 데이터 로드
// ═══════════════════════════════════════════════════════════════
export async function loadAll() {
  try {
    if (getCurrentUserRef() && isAdmin()) {
      const migrateKey = `migrated_${getCurrentUserRef().id}`;
      // localStorage 폴백 제거: 기기 단위 플래그는 멀티 유저 환경에서 오작동 위험.
      // migrateKey(유저별 키)만 사용. 'migrated_김_태우' 하드코딩 폴백 제거.
      const migrated = localStorage.getItem(migrateKey);
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
      // B3: diet_restored_admin 플래그를 Firestore에서 관리 (localStorage 기기 단위 → 유저별 Firestore)
      const dietRestored = fbMap.admin_diet_restored;
      if (!dietRestored) {
        _settings.diet_plan = {
          height: 175, weight: 75, bodyFatPct: 17, age: 32,
          targetWeight: 68, targetBodyFatPct: 8,
          activityFactor: 1.3, lossRatePerWeek: 0.009,
          refeedKcal: 5000, refeedDays: [0, 6], startDate: null,
        };
        setDoc(_doc('settings', 'diet_plan'), { value: _settings.diet_plan }).catch(e => console.warn('[data] 식단 설정 저장 실패:', e.message));
        setDoc(_doc('settings', 'admin_diet_restored'), { value: 'done' }).catch(e => console.warn('[data] admin_diet_restored 저장 실패:', e.message));
      }
    }
    _settings.home_streak_days = fbMap.home_streak_days ?? 6;
    _settings.unit_goal_start  = fbMap.unit_goal_start  ?? null;
    _settings.active_timer     = fbMap.active_timer     ?? null;
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
