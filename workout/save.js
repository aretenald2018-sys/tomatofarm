import { showCenterToast, showToast } from '../ui/toast.js';
// ================================================================
// workout/save.js — 저장 로직 (saveWorkoutDay + _autoSaveDiet)
// ================================================================
// 2026-04-21 리팩토링:
//   (1) S 상태가 S.workout / S.diet / S.shared 네임스페이스로 분할됨.
//   (2) 도메인 파생 함수(_computeDietSuccess/_autoDeriveActivityFlags) 는
//       cross-domain.js 로 이전 — 명시적 입력/출력으로 경계 가시화.
//   (3) setDoc({merge:true}) + save-schema.js 의 파티션 상수로 운동/식단 저장 경로가
//       절대 반대편 도메인 필드를 덮지 못하게 차단.
// ================================================================

import { S }                        from './state.js';
import { saveDay, saveRunningRoute, dateKey, isFuture, trackEvent, getExList, getDay } from '../data.js';
import { WORKOUT_PAYLOAD_KEYS, DIET_PAYLOAD_KEYS } from './save-schema.js';
import { deriveActivityFlagsFromDetails, deriveDietSuccessFromWorkout } from './cross-domain.js';
import { MOVEMENTS } from '../config.js';
import { calcSetVolume } from '../calc/volume.js';
import { shouldKeepMaxDraftExercisesForSavePure } from './save-pure.js';
import { upsertWorkoutSession } from './sessions.js';
import { hasLifeZoneDietActivity, hasLifeZoneRunningActivity, hasLifeZoneWorkoutActivity } from '../home/life-zone-state.js';
import { buildWorkoutSetTimeline, normalizeSetCompletedAt } from './timeline.js';
import { assertRunningRouteReference } from '../data/running-route-storage-plan.js';
import { buildRunningRoutePreview, normalizeRunningRoutePoints } from './running-route-store.js';
import { getDietPhoto } from '../diet/photo-store.js';

// 미래 날짜 저장 가드 — 어떤 경로로든 미래 날짜 쓰기 금지 (B-3).
function _blockIfFutureDate() {
  const date = S.shared.date;
  if (!date) return false;
  if (!isFuture(date.y, date.m, date.d)) return false;
  try { showToast('미래 날짜는 저장할 수 없어요', 1800, 'warning'); } catch {}
  return true;
}

function _isLocallyQueuedDayWrite(error) {
  return error?.pendingDayWrite === true && error?.pendingDayStored === true;
}

function _dayWriteFailureMessage(error, domainLabel = '저장') {
  if (error?.localRecoveryUnavailable) {
    return `기기 복구 저장소와 서버 ${domainLabel}에 모두 실패했습니다. 저장공간과 네트워크를 확인해 주세요.`;
  }
  if (error?.name === 'QuotaExceededError' || String(error?.code || '').includes('STORAGE')) {
    return `기기 저장공간 문제로 ${domainLabel}하지 못했습니다. 공간을 확보한 뒤 다시 시도해 주세요.`;
  }
  if (error?.code === 'DAY_OWNER_REQUIRED') {
    return '로그인 계정을 확인한 뒤 다시 저장해 주세요.';
  }
  return `${domainLabel} 실패 — 네트워크를 확인해주세요`;
}

function _workoutDateKeyFromState() {
  const date = S.shared.date;
  if (!date || typeof date.y !== 'number') return null;
  return dateKey(date.y, date.m, date.d);
}

function _isWorkoutDateStill(key, stage) {
  const current = _workoutDateKeyFromState();
  if (!key || !current || key === current) return true;
  console.warn('[workout/save] 날짜 변경 중 stale save 차단:', { started: key, current, stage });
  return false;
}

// ── per-meal 기록 유무 판정 헬퍼 ────────────────────────────────
function _hasMealRecord(textVal, foodsArr, kcalVal, skipFlag) {
  if (skipFlag) return true;
  if (textVal && String(textVal).trim()) return true;
  if (Array.isArray(foodsArr) && foodsArr.length > 0) return true;
  if ((kcalVal || 0) > 0) return true;
  return false;
}

// ── 공통 per-meal 성공 계산 ─────────────────────────────────────
// bOk/lOk/dOk/sOk 은 dayTarget 이 운동(cardio/CF/swim)에 의존하므로 양 저장 경로에서
// 동일하게 재계산. 양 payload 에 모두 포함 — 값 동일하므로 merge last-write-wins 무관.
function _computeMealOk(isDietSuccess) {
  const diet = S.diet;
  return {
    bOk: _hasMealRecord(diet.breakfast, diet.bFoods, diet.bKcal, diet.breakfastSkipped)
           ? (diet.breakfastSkipped ? true : isDietSuccess) : null,
    lOk: _hasMealRecord(diet.lunch,     diet.lFoods, diet.lKcal, diet.lunchSkipped)
           ? (diet.lunchSkipped     ? true : isDietSuccess) : null,
    dOk: _hasMealRecord(diet.dinner,    diet.dFoods, diet.dKcal, diet.dinnerSkipped)
           ? (diet.dinnerSkipped    ? true : isDietSuccess) : null,
    sOk: _hasMealRecord(diet.snack,     diet.sFoods, diet.sKcal, false)
           ? isDietSuccess : null,
  };
}

// 2026-04-20: 빌더 산출 키와 schema 상수 간 드리프트 감지 (dev-only).
let _schemaDriftChecked = false;
function _assertSchemaParity(name, payload, expectedKeys) {
  if (_schemaDriftChecked) return;
  const actual = new Set(Object.keys(payload));
  const expected = new Set(expectedKeys);
  const missing = [...expected].filter(k => !actual.has(k));
  const extra   = [...actual].filter(k => !expected.has(k));
  if (missing.length || extra.length) {
    console.warn(`[save-schema] ${name} 드리프트`, { missing, extra });
  }
}

function _restInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function _restElapsedFromDates(startedAt, endedAt) {
  const startMs = Date.parse(startedAt || '');
  const endMs = endedAt ? Date.parse(endedAt) : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.floor((endMs - startMs) / 1000);
}

function _buildRestBetweenSets(cleanEx) {
  const rests = [];
  (Array.isArray(cleanEx) ? cleanEx : []).forEach((entry, entryIdx) => {
    const sets = Array.isArray(entry?.sets) ? entry.sets : [];
    sets.forEach((set, setIdx) => {
      if (!set?.restStartedAt) return;
      const plannedSec = _restInt(set.restPlannedSec);
      const elapsedSec = Math.max(
        _restInt(set.restElapsedSec),
        _restElapsedFromDates(set.restStartedAt, set.restEndedAt)
      );
      rests.push({
        exerciseId: entry.exerciseId || null,
        exerciseName: entry.name || null,
        entryIdx,
        setIdx,
        setNumber: setIdx + 1,
        plannedSec,
        elapsedSec,
        overSec: Math.max(_restInt(set.restOverSec), Math.max(0, elapsedSec - plannedSec)),
        startedAt: set.restStartedAt || null,
        endedAt: set.restEndedAt || null,
        endedBy: set.restEndedBy || null,
      });
    });
  });
  return rests;
}

// ── 운동 도메인 페이로드 ─────────────────────────────────────────
// 식단 필드(breakfast/bFoods/bKcal/bPhoto/EstimateMeta 등)는 전부 제외 → merge 저장이
// Firestore 의 식단 필드를 건드릴 수 없다.
function _fullRoutePointCount(summary, routeRef, route) {
  if (routeRef) return routeRef.pointCount;
  const summaryCount = Number(summary?.pointCount);
  if (Number.isSafeInteger(summaryCount) && summaryCount >= route.length) return summaryCount;
  return route.length;
}

function _routeReferenceMatchesCapturedRoute(routeRef, route) {
  if (!routeRef || route.length === 0 || route.length > routeRef.pointCount) return false;
  return route[0]?.ts === routeRef.firstTimestampMs
    && route.at(-1)?.ts === routeRef.lastTimestampMs;
}

async function _prepareRunningRoutePayload() {
  const run = S.workout.runData || {};
  const routeInput = {
    runRoute: Array.isArray(run.route) ? run.route : [],
    runRouteRef: run.routeRef ?? null,
  };
  const sourceRoute = routeInput.runRoute;
  const source = run.source || ((sourceRoute.length || routeInput.runRouteRef) ? 'gps' : 'manual');
  const isGpsRecord = sourceRoute.length > 0 || (source !== 'manual' && routeInput.runRouteRef);
  if (!isGpsRecord) {
    run.routeRef = null;
    return { source: 'manual', route: [], routeRef: null, routeSummary: run.routeSummary || null };
  }

  const existingRef = routeInput.runRouteRef == null
    ? null
    : assertRunningRouteReference(routeInput.runRouteRef);
  const canonicalRoute = normalizeRunningRoutePoints(sourceRoute);
  const matchingExistingRef = _routeReferenceMatchesCapturedRoute(existingRef, canonicalRoute)
    ? existingRef
    : null;
  const summaryPointCount = Number(run.routeSummary?.pointCount);
  const declaredPointCount = Number.isSafeInteger(summaryPointCount) && summaryPointCount >= canonicalRoute.length
    ? summaryPointCount
    : canonicalRoute.length;
  const hasFullCapturedRoute = canonicalRoute.length > 0 && (matchingExistingRef
    ? canonicalRoute.length === matchingExistingRef.pointCount
    : canonicalRoute.length === declaredPointCount);

  let routeRef = matchingExistingRef;
  if (hasFullCapturedRoute) {
    routeRef = assertRunningRouteReference(await saveRunningRoute(canonicalRoute));
  }

  const pointCount = _fullRoutePointCount(run.routeSummary, routeRef, canonicalRoute);
  const routeSummary = {
    ...(run.routeSummary && typeof run.routeSummary === 'object' ? run.routeSummary : {}),
    pointCount,
  };
  const route = canonicalRoute.length ? buildRunningRoutePreview(canonicalRoute) : [];
  run.routeRef = routeRef;
  run.routeSummary = routeSummary;
  return { source: source === 'manual' ? 'gps' : source, route, routeRef, routeSummary };
}

function _buildWorkoutPayload(cleanEx, isDietSuccess, persistedRoute) {
  const w = S.workout;
  const workoutTimeline = buildWorkoutSetTimeline(cleanEx, w.workoutDuration, {
    previousTimeline: w.workoutTimeline,
  });
  w.workoutTimeline = workoutTimeline;
  w.workoutDuration = workoutTimeline.durationSec;
  const run = w.runData || {};
  return {
    exercises:  cleanEx,
    cf:         w.cf,
    stretching: w.stretching,
    swimming:   w.swimming,
    running:    w.running,
    runDistance:    run.distance,
    runDurationMin: run.durationMin,
    runDurationSec: run.durationSec,
    runMemo:        run.memo,
    runSource:      persistedRoute.source,
    runStartedAt:   run.startedAt || null,
    runEndedAt:     run.endedAt || null,
    runRoute:       persistedRoute.route,
    runRouteRef:    persistedRoute.routeRef,
    runRouteSummary: persistedRoute.routeSummary,
    runPlaceSummary: run.placeSummary || null,
    runAvgPaceSecPerKm: Number(run.avgPaceSecPerKm) || 0,
    runGpsAccuracySummary: run.gpsAccuracySummary || null,
    cfWod:         w.cfData.wod,
    cfDurationMin: w.cfData.durationMin,
    cfDurationSec: w.cfData.durationSec,
    cfMemo:        w.cfData.memo,
    stretchDuration: w.stretchData.duration,
    stretchMemo:   w.stretchData.memo,
    swimDistance:   w.swimData.distance,
    swimDurationMin: w.swimData.durationMin,
    swimDurationSec: w.swimData.durationSec,
    swimStroke:    w.swimData.stroke,
    swimMemo:      w.swimData.memo,
    workoutDuration: workoutTimeline.durationSec,
    workoutTimeline,
    restBetweenSets: _buildRestBetweenSets(cleanEx),
    wine_free:  w.wineFree,
    memo:       document.getElementById('wt-workout-memo')?.value.trim() || '',
    workoutPhoto: getDietPhoto('workout'),
    gymId: w.currentGymId || null,
    pickerGymFilter: w.pickerGymFilter || null,
    routineMeta: w.routineMeta || null,
    maxMeta: _buildMaxMeta(cleanEx),
    ..._computeMealOk(isDietSuccess),
  };
}

function _buildWorkoutPayloadWithSessions(ctxKey, payload) {
  const sessionIndex = Math.max(0, Math.floor(Number(S.workout.sessionIndex) || 0));
  const [yy, mm, dd] = ctxKey.split('-').map(part => parseInt(part, 10));
  const existingDay = getDay(yy, mm - 1, dd);
  const sessionResult = upsertWorkoutSession(existingDay, payload, sessionIndex, { now: Date.now() });
  return {
    ...payload,
    ...sessionResult.aggregate,
    workoutSessions: sessionResult.workoutSessions,
  };
}

function _attachLifeZoneWorkoutSnapshot(payload) {
  const active = hasLifeZoneWorkoutActivity(payload);
  const state = hasLifeZoneRunningActivity(payload) ? 'running' : 'workout';
  const snapshot = active ? { state, updatedAt: Date.now() } : null;
  return {
    ...payload,
    lifeZoneWorkoutActivity: snapshot,
    lifeZoneLastActivity: snapshot,
  };
}

const LIFE_ZONE_MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

function _resolveLifeZoneDietMeal(payload, requestedMeal = null) {
  if (requestedMeal && LIFE_ZONE_MEAL_KEYS.includes(requestedMeal)) return requestedMeal;
  const mealMap = {
    breakfast: ['breakfast', 'bFoods', 'bKcal', 'bPhoto', 'breakfast_skipped'],
    lunch: ['lunch', 'lFoods', 'lKcal', 'lPhoto', 'lunch_skipped'],
    dinner: ['dinner', 'dFoods', 'dKcal', 'dPhoto', 'dinner_skipped'],
    snack: ['snack', 'sFoods', 'sKcal', 'sPhoto'],
  };
  for (const meal of [...LIFE_ZONE_MEAL_KEYS].reverse()) {
    const keys = mealMap[meal];
    const hasRecord = keys.some((key) => {
      const value = payload?.[key];
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'number') return value > 0;
      return !!value;
    });
    if (hasRecord) return meal;
  }
  return null;
}

function _attachLifeZoneDietSnapshot(payload, options = {}) {
  const active = hasLifeZoneDietActivity(payload);
  const snapshot = active
    ? { state: 'diet', meal: _resolveLifeZoneDietMeal(payload, options.meal), updatedAt: Date.now() }
    : null;
  return {
    ...payload,
    lifeZoneDietActivity: snapshot,
    lifeZoneLastActivity: snapshot,
  };
}

function _resolveEntrySubPattern(entry, exById, movById) {
  if (entry?.maxWeakPart) return entry.maxWeakPart;
  const lib = exById.get(entry?.exerciseId);
  const muscleIds = Array.isArray(entry?.muscleIds) && entry.muscleIds.length
    ? entry.muscleIds
    : (Array.isArray(lib?.muscleIds) ? lib.muscleIds : []);
  if (muscleIds[0]) return muscleIds[0];
  const movementId = entry?.movementId || lib?.movementId || null;
  if (movementId) return movById.get(movementId)?.subPattern || null;
  return null;
}

function _buildMaxMeta(cleanEx) {
  const src = S.workout.maxMeta;
  if (!src || typeof src !== 'object') return null;
  const currentDateKey = _workoutDateKeyFromState();
  if (src.dateKey && currentDateKey && src.dateKey !== currentDateKey) {
    console.warn('[workout/save] 다른 날짜 maxMeta 저장 차단:', { metaDateKey: src.dateKey, currentDateKey });
    return null;
  }
  const selectedWeakParts = Array.isArray(src.selectedWeakParts)
    ? [...new Set(src.selectedWeakParts.filter(Boolean))]
    : [];
  const selectedMajors = Array.isArray(src.selectedMajors)
    ? [...new Set(src.selectedMajors.filter(Boolean))]
    : [];
  const rejectedRecommendations = Array.isArray(src.rejectedRecommendations)
    ? [...new Set(src.rejectedRecommendations.filter(Boolean))].slice(-30)
    : [];
  const exById = new Map((getExList() || []).map(e => [e.id, e]));
  const movById = new Map((MOVEMENTS || []).map(m => [m.id, m]));
  const weakSet = new Set(selectedWeakParts);
  const summary = { sets: 0, volume: 0, byPart: {} };
  let maxExerciseCount = 0;
  for (const entry of cleanEx || []) {
    if (entry?.recommendationMeta?.mode === 'max' || entry?.maxPrescription || entry?.maxWeakPart) {
      maxExerciseCount += 1;
    }
    const sp = _resolveEntrySubPattern(entry, exById, movById);
    if (!sp || (!weakSet.has(sp) && !entry.maxWeakPart)) continue;
    const part = entry.maxWeakPart || sp;
    for (const set of entry.sets || []) {
      if (!set || set.setType === 'warmup') continue;
      const done = set.done === true || (set.done !== false && ((set.kg || 0) > 0 || (set.reps || 0) > 0));
      if (!done) continue;
      const volume = calcSetVolume(set);
      summary.sets += 1;
      summary.volume += volume;
      if (!summary.byPart[part]) summary.byPart[part] = { sets: 0, volume: 0 };
      summary.byPart[part].sets += 1;
      summary.byPart[part].volume += volume;
    }
  }
  const weakDurationSec = Math.max(0, Math.floor(Number(src.weakBlock?.durationSec) || 0));
  const hasActiveState =
    selectedMajors.length > 0 ||
    selectedWeakParts.length > 0 ||
    rejectedRecommendations.length > 0 ||
    weakDurationSec > 0 ||
    !!src.weakBlock?.activeStartedAt ||
    src.majorGateOpen === true ||
    src.majorGateOpen === false;
  if (!hasActiveState && maxExerciseCount === 0) return null;
  return {
    mode: 'max',
    dateKey: currentDateKey || src.dateKey || null,
    sessionType: src.sessionType === 'heavy_volume' ? 'heavy_volume' : 'high_volume',
    selectedMajors,
    selectedWeakParts,
    rejectedRecommendations,
    majorGateOpen: src.majorGateOpen === true,
    weakBlock: {
      durationSec: weakDurationSec,
      activeStartedAt: src.weakBlock?.activeStartedAt || null,
    },
    weakSummary: summary,
  };
}

// ── 식단 도메인 페이로드 ─────────────────────────────────────────
// 운동 필드 전부 제외 → 식단 자동저장이 운동 데이터를 건드릴 수 없다.
function _buildDietPayload(isDietSuccess) {
  const d = S.diet;
  return {
    breakfast_skipped: d.breakfastSkipped,
    lunch_skipped:     d.lunchSkipped,
    dinner_skipped:    d.dinnerSkipped,
    breakfast:  d.breakfast,
    lunch:      d.lunch,
    dinner:     d.dinner,
    snack:      d.snack,
    bKcal:d.bKcal, lKcal:d.lKcal, dKcal:d.dKcal, sKcal:d.sKcal,
    bReason:d.bReason, lReason:d.lReason, dReason:d.dReason, sReason:d.sReason,
    bProtein:d.bProtein, bCarbs:d.bCarbs, bFat:d.bFat,
    lProtein:d.lProtein, lCarbs:d.lCarbs, lFat:d.lFat,
    dProtein:d.dProtein, dCarbs:d.dCarbs, dFat:d.dFat,
    sProtein:d.sProtein, sCarbs:d.sCarbs, sFat:d.sFat,
    bFoods:d.bFoods||[], lFoods:d.lFoods||[], dFoods:d.dFoods||[], sFoods:d.sFoods||[],
    bPhoto: getDietPhoto('breakfast'),
    lPhoto: getDietPhoto('lunch'),
    dPhoto: getDietPhoto('dinner'),
    sPhoto: getDietPhoto('snack'),
    bEstimateMeta: d.bEstimateMeta || null,
    lEstimateMeta: d.lEstimateMeta || null,
    dEstimateMeta: d.dEstimateMeta || null,
    sEstimateMeta: d.sEstimateMeta || null,
    ..._computeMealOk(isDietSuccess),
  };
}

// 탭 칩의 기록 힌트(has-record) 즉시 동기화 — 저장/상태 변경 후 호출.
function _refreshTabDots() {
  const w = S.workout;
  const flags = {
    gym: (w.exercises || []).length > 0,
    cf: !!w.cf,
    stretch: !!w.stretching,
    swimming: !!w.swimming,
    running: !!w.running,
  };
  Object.entries(flags).forEach(([t, on]) => {
    document.getElementById('wt-chip-' + t)?.classList.toggle('has-record', !!on);
  });
}

function _hasSaveWorthySet(set) {
  if (!set) return false;
  if (set.setType === 'warmup') return set.done === true && normalizeSetCompletedAt(set.completedAt) != null;
  if (set.done === true) return true;
  if (set.done === false) return false;
  return (Number(set.kg) || 0) > 0 && (Number(set.reps) || 0) > 0;
}

function _hasManualCardioEntry(entry) {
  const cardio = entry?.cardio;
  if (!cardio || typeof cardio !== 'object') return false;
  if (cardio.source === 'manual-cardio' || cardio.source === 'wear-running') return true;
  return ['kcal', 'distanceKm', 'speedKmh', 'laps'].some(key => Number(cardio[key]) > 0);
}

export function shouldKeepMaxDraftExercisesForSave(workout = S.workout) {
  return shouldKeepMaxDraftExercisesForSavePure(workout, _workoutDateKeyFromState());
}

function _shouldKeepDraftExercises() {
  return shouldKeepMaxDraftExercisesForSave(S.workout);
}

function _cleanExercises(includeNotes, includeDrafts = false) {
  // 저장 시점에 exList에서 movementId/muscleIds 스냅샷 (삭제된 종목·커스텀 종목 대응).
  const exById = new Map((getExList() || []).map(e => [e.id, e]));
  return S.workout.exercises
    .map(e => {
      const lib = exById.get(e.exerciseId);
      const movementId = e.movementId || lib?.movementId || null;
      const muscleIds  = Array.isArray(e.muscleIds) && e.muscleIds.length
        ? e.muscleIds
        : (Array.isArray(lib?.muscleIds) ? lib.muscleIds : []);
      // 2026-04-21: 저장 시 name 도 스냅샷. 다른 유저(친구) 가 이 workout 문서를 읽어
      //   cheers-card / insights 등에 표시할 때 exerciseId 원본이 노출되던 회귀 방지
      //   (예: "줍스님이 mo3t9kmdbvia7rssnh4을(를) 오늘부터 루틴에 다시 추가했어요").
      //   커스텀 종목 이름은 작성자 본인의 exList 에만 있으므로 스냅샷이 필수.
      const name = e.name || lib?.name || null;
      const rawSets = Array.isArray(e.sets) ? e.sets.filter(Boolean) : [];
      const sets = includeDrafts
        ? (rawSets.length ? rawSets : [{ kg: 0, reps: 0, setType: 'main', done: false }])
        : rawSets.filter(_hasSaveWorthySet);
      return {
        ...e,
        name,
        movementId,
        muscleIds,
        sets,
      };
    })
    .filter(e => e.sets.length > 0 || _hasManualCardioEntry(e) || (includeNotes && e.note) || (includeDrafts && e.exerciseId));
}

// ── 공통 저장 prep ──────────────────────────────────────────────
// 양 저장 경로(saveWorkoutDay / _autoSaveDiet) 가 동일하게 거치는 단계:
//   1) 날짜 가드 (없으면 / 미래면 차단)
//   2) DOM → S.diet 텍스트 동기화 (식단 4끼)
//   3) [optional] DOM → S.workout.runData 동기화 (런닝 폼) + activity flag 파생
//      → workout 경로만 수행. 식단 자동저장은 운동 flag 를 건드리지 않는 정책 유지.
//   4) cleanEx 계산 + isDietSuccess 도메인 파생
// 반환: { y, m, d, cleanEx, isDietSuccess } 또는 null (가드 차단 시).
function _prepareSave({ syncWorkoutDetails, keepDraftExercises = false }) {
  if (!S.shared.date) return null;
  if (_blockIfFutureDate()) return null;
  const { y, m, d } = S.shared.date;

  // 식단 텍스트 동기화 — 양 경로 공통.
  // DOM 존재 여부로 분기: 존재하면 (빈 문자열 포함) 덮어쓰기, 없으면 기존값 보존.
  // 과거 saveWorkoutDay 는 DOM 없을 때 '' 로 클리어했으나 _autoSaveDiet 는 보존했음.
  // 통합 시 _autoSaveDiet 의 보존 정책을 정답으로 채택 — 사용자가 입력칸을 지운
  // 경우(DOM present + value '') 에는 양쪽 모두 정확히 클리어 동작.
  const diet = S.diet;
  const _syncMeal = (key, elId) => {
    const el = document.getElementById(elId);
    if (el) diet[key] = el.value.trim();
  };
  _syncMeal('breakfast', 'wt-meal-breakfast');
  _syncMeal('lunch',     'wt-meal-lunch');
  _syncMeal('dinner',    'wt-meal-dinner');
  _syncMeal('snack',     'wt-meal-snack');

  if (syncWorkoutDetails) {
    // 활동 flag 자동 파생 (세부 입력 → boolean flag).
    // 식단 자동저장은 호출하지 않음 — 식단 CRUD 가 운동 flag 변경에 관여 금지.
    const derived = deriveActivityFlagsFromDetails(S.workout);
    S.workout.cf = derived.cf;
    S.workout.running = derived.running;
    S.workout.swimming = derived.swimming;
    S.workout.stretching = derived.stretching;
  }

  const cleanEx = _cleanExercises(
    !syncWorkoutDetails,
    syncWorkoutDetails && (keepDraftExercises || _shouldKeepDraftExercises())
  );  // 식단 경로는 메모만 있는 종목도 보존
  const isDietSuccess = deriveDietSuccessFromWorkout(S.workout, S.diet, S.shared.date, cleanEx);
  return { y, m, d, cleanEx, isDietSuccess };
}

// ── 명시적 저장 (운동 도메인) ───────────────────────────────────
export async function saveWorkoutDay(options = {}) {
  const { silent = false, keepDraftExercises = false, renderHandled = false } = options || {};
  const startedKey = _workoutDateKeyFromState();
  const ctx = _prepareSave({ syncWorkoutDetails: true, keepDraftExercises });
  if (!ctx) return false;
  const { y, m, d, cleanEx, isDietSuccess } = ctx;
  const ctxKey = dateKey(y, m, d);
  if (startedKey !== ctxKey || !_isWorkoutDateStill(startedKey, 'prepared')) return false;

  const btn = silent ? null : document.getElementById('wt-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  let daySaveState = 'synced';
  try {
    if (!_isWorkoutDateStill(startedKey, 'before-route-write')) {
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
      return false;
    }
    const persistedRoute = await _prepareRunningRoutePayload();
    if (!_isWorkoutDateStill(startedKey, 'before-day-write')) {
      if (btn) { btn.disabled = false; btn.textContent = '저장'; }
      return false;
    }
    const payload = _attachLifeZoneWorkoutSnapshot(
      _buildWorkoutPayloadWithSessions(ctxKey, _buildWorkoutPayload(cleanEx, isDietSuccess, persistedRoute))
    );
    _assertSchemaParity('workout', payload, WORKOUT_PAYLOAD_KEYS);
    const result = await saveDay(ctxKey, payload, { rethrow: true, mode: 'merge' });
    daySaveState = result?.state === 'pending' ? 'pending' : 'synced';
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
    if (_isLocallyQueuedDayWrite(e)) {
      daySaveState = 'pending';
      console.warn('[workout/save] 서버 동기화 대기 — 기기 복구 저널에 보관됨:', e?.message || e);
    } else {
      console.error('[workout/save] saveWorkoutDay 실패:', e);
      showToast(_dayWriteFailureMessage(e), 3200, 'error');
      throw e;
    }
  }

  // analytics
  const hasLoggedSet = cleanEx.some(e => (e.sets || []).some(_hasSaveWorthySet));
  if (hasLoggedSet || S.workout.cf || S.workout.swimming || S.workout.running) {
    trackEvent('core', 'exercise_logged');
  }

  if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  _refreshTabDots();
  // renderHandled: 호출자가 화면 갱신을 이미 끝낸 저장(예: 달력 시트의 부분 갱신
  // 뒤 휴식 메타데이터 저장). app.js의 renderAll 리스너가 전체 렌더를 건너뛰도록
  // 표시만 남기고, 위젯 동기화 등 다른 리스너에는 그대로 전달한다.
  document.dispatchEvent(renderHandled
    ? new CustomEvent('sheet:saved', { detail: { renderHandled: true } })
    : new CustomEvent('sheet:saved'));

  if (!silent) {
    if (daySaveState === 'pending') {
      showToast('기기에 보관했습니다 — 연결되면 자동 동기화됩니다', 3000, 'warning');
    } else {
      showToast('저장 완료', 2000, 'success');
    }
  }
  return true;
}

// ── 식단 자동 저장 (식단 도메인) ────────────────────────────────
// 식단 페이로드만 merge 저장 — 운동 필드 전부 제외 → 자동저장이 운동을 건드리지 못함.
export async function _autoSaveDiet(options = {}) {
  const startedKey = _workoutDateKeyFromState();
  const ctx = _prepareSave({ syncWorkoutDetails: false });
  if (!ctx) {
    if (!S.shared.date) console.warn('[render-workout] 날짜 정보가 없어 저장할 수 없습니다');
    return;
  }
  const { y, m, d, isDietSuccess } = ctx;
  const ctxKey = dateKey(y, m, d);
  if (startedKey !== ctxKey || !_isWorkoutDateStill(startedKey, 'diet-prepared')) return;
  const diet = S.diet;

  console.log('[render-workout] 식단 자동 저장 시작:', {
    dateKey: ctxKey,
    foods: { b: diet.bFoods?.length || 0, l: diet.lFoods?.length || 0, d: diet.dFoods?.length || 0 },
  });

  try {
    const payload = _attachLifeZoneDietSnapshot(_buildDietPayload(isDietSuccess), options);
    _assertSchemaParity('diet', payload, DIET_PAYLOAD_KEYS);
    if (!_isWorkoutDateStill(startedKey, 'diet-before-write')) return;
    const result = await saveDay(ctxKey, payload, { rethrow: true, mode: 'merge' });

    const totalFoods = (diet.bFoods?.length || 0) + (diet.lFoods?.length || 0)
      + (diet.dFoods?.length || 0) + (diet.sFoods?.length || 0);
    if (totalFoods > 0) {
      const meals = [diet.bFoods, diet.lFoods, diet.dFoods, diet.sFoods]
        .filter(f => f?.length > 0).length;
      const kcal = (payload.bKcal || 0) + (payload.lKcal || 0) + (payload.dKcal || 0) + (payload.sKcal || 0);
      trackEvent('core', 'diet_logged', { meals, kcal });
    }

    console.log('[render-workout] 식단 자동 저장 완료');
    _refreshTabDots();
    document.dispatchEvent(new CustomEvent('sheet:saved'));
    showCenterToast(result?.state === 'pending'
      ? '기기에 보관됨 · 연결 시 자동 동기화'
      : '저장되었습니다');
  } catch(e) {
    if (_isLocallyQueuedDayWrite(e)) {
      console.warn('[render-workout] 식단 서버 동기화 대기 — 기기 복구 저널에 보관됨:', e?.message || e);
      _refreshTabDots();
      document.dispatchEvent(new CustomEvent('sheet:saved'));
      showCenterToast('기기에 보관됨 · 연결 시 자동 동기화');
    } else {
      showToast(_dayWriteFailureMessage(e, '식단 저장'), 3400, 'error');
      console.error('[render-workout] 자동 저장 실패:', e);
    }
  }
}
