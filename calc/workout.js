// calc/workout.js — 운동 분석, 전문가 모드 및 성장판 순수 함수

import { calcRomFactor, calcSetVolume, getLastSession } from './volume.js';
import { isWorkSet as _isWorkSet } from './shared.js';
import { dateFromKey as _dateFromKeyForCycle } from '../utils/date-key.js';

// ════════════════════════════════════════════════════════════════
// 전문가 모드 — RPE / 1RM / 추천 무게 (순수함수, 사이드이펙트 0)
// ────────────────────────────────────────────────────────────────
// 가이드:
//  - 저장 단위는 항상 kg. 입력 단위가 lb인 기구는 UI 층에서 kgToLb/lbToKg로 변환.
//  - estimate1RM: Epley 공식(단순·보수적). 고반복에서 과대추정 경향 → RPE 룩업으로 보정.
//  - targetWeightKg: e1RM × RPE%1RM 룩업표. 표는 RTS(Reactive Training Systems) 통용값.
//  - weightRange: sizeClass별 ±스텝을 적용해 보수/추천/공격 3구간 제시.
// ════════════════════════════════════════════════════════════════

/** Epley 1RM 추정. kg·reps 중 하나라도 0이면 0 반환. */
export function estimate1RM(kg, reps) {
  const k = Number(kg) || 0;
  const r = Number(reps) || 0;
  if (k <= 0 || r <= 0) return 0;
  if (r === 1) return k;
  return k * (1 + r / 30);
}

/**
 * RPE·reps → %1RM 룩업. RTS 권장표 기반 (6~10 RPE × 1~12 reps).
 * 테이블 밖(예: RPE 5, reps 15)은 가장 가까운 값으로 클램프.
 */
const _RPE_PCT_TABLE = {
  // reps:  1     2     3     4     5     6     7     8     9     10    11    12
  10:    [1.00, 0.96, 0.92, 0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68],
  9.5:   [0.98, 0.94, 0.91, 0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67],
  9:     [0.96, 0.92, 0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66],
  8.5:   [0.94, 0.91, 0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67, 0.65],
  8:     [0.92, 0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66, 0.63],
  7.5:   [0.91, 0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67, 0.65, 0.62],
  7:     [0.89, 0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66, 0.63, 0.61],
  6.5:   [0.88, 0.85, 0.82, 0.80, 0.77, 0.75, 0.72, 0.70, 0.67, 0.65, 0.62, 0.60],
  6:     [0.86, 0.84, 0.81, 0.79, 0.76, 0.74, 0.71, 0.68, 0.66, 0.63, 0.61, 0.58],
};
export function rpeRepsToPct(rpe, reps) {
  const r = Math.max(6, Math.min(10, Number(rpe) || 8));
  const rep = Math.max(1, Math.min(12, Math.round(Number(reps) || 10)));
  const rpeKey = Math.round(r * 2) / 2;
  const row = _RPE_PCT_TABLE[rpeKey] || _RPE_PCT_TABLE[8];
  return row[rep - 1];
}

export function estimateSet1RM(set = {}, { useRpe = true, applyRom = true } = {}) {
  const kg = Number(set?.kg) || 0;
  const reps = Number(set?.reps) || 0;
  if (kg <= 0 || reps <= 0) return 0;
  const rpe = Number(set?.rpe) || 0;
  const base = useRpe && rpe >= 6
    ? kg / (rpeRepsToPct(rpe, reps) || 1)
    : estimate1RM(kg, reps);
  return base * (applyRom ? calcRomFactor(set) : 1);
}

/** 목표 무게(kg) = e1RM × RPE/rep 테이블. 반올림 전 raw값. */
export function targetWeightKg(e1RM, rpe, reps) {
  const one = Number(e1RM) || 0;
  if (one <= 0) return 0;
  return one * rpeRepsToPct(rpe, reps);
}

/** 증량 단위로 반올림(가장 가까운 step 배수). step<=0이면 그대로. */
export function roundToIncrement(kg, step) {
  const s = Number(step);
  const k = Number(kg) || 0;
  if (!(s > 0)) return k;
  return Math.round(k / s) * s;
}

/**
 * 보수/추천/공격 3구간 무게. 추천은 roundToIncrement(target).
 * 소근육(small): ±1 step, 대근육(large): ±2 step. step 기본값 2.5.
 */
export function weightRange(target, sizeClass, step) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  const spread = sizeClass === 'large' ? 2 : 1;
  const recommended = roundToIncrement(target, s);
  const conservative = Math.max(0, roundToIncrement(recommended - spread * s, s));
  const aggressive   = roundToIncrement(recommended + spread * s, s);
  return { conservative, recommended, aggressive };
}

/** kg ↔ lb 변환 (IUPAC 1959 정의: 1 lb = 0.45359237 kg). */
const _KG_PER_LB = 0.45359237;
export function kgToLb(kg) { return (Number(kg) || 0) / _KG_PER_LB; }
export function lbToKg(lb) { return (Number(lb) || 0) * _KG_PER_LB; }

export function normalizeWorkoutTrack(track) {
  const t = String(track || '').trim().toUpperCase();
  if (t === 'H' || t === 'HEAVY' || t === 'INTENSITY' || t === 'STRENGTH') return 'H';
  if (t === 'M' || t === 'V' || t === 'VOLUME' || t === 'MEDIUM' || t === 'HYPERTROPHY') return 'M';
  return '';
}

function _trackWorkSets(sets) {
  return (sets || []).filter(s => {
    if (!s || s.setType === 'warmup') return false;
    if (s.done === false) return false;
    return (Number(s.kg) || 0) > 0 && (Number(s.reps) || 0) > 0;
  });
}

export function isWendlerWorkoutEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.recommendationMeta?.program === 'wendler') return true;
  if (entry.maxPrescription?.program === 'wendler') return true;
  if (entry.recommendationMeta?.wendlerSignature || entry.maxPrescription?.wendlerSignature) return true;
  return (entry.sets || []).some(set => !!set?.wendlerRole);
}

export function inferWorkoutTrack(entry = {}, ex = null) {
  if (isWendlerWorkoutEntry(entry)) return { track: 'W', source: 'wendler' };

  const explicit = normalizeWorkoutTrack(
    entry?.recommendationMeta?.track ||
    entry?.maxPrescription?.benchmarkTrack ||
    entry?.maxPrescription?.track ||
    entry?.maxTrackPreference
  );
  if (explicit) return { track: explicit, source: 'record' };

  const workSets = _trackWorkSets(entry?.sets);
  if (!workSets.length) return { track: '', source: 'empty' };

  const bestSet = workSets.reduce((best, set) => {
    const score = estimateSet1RM(set, { useRpe: false }) || (Number(set.kg) || 0) * calcRomFactor(set);
    const bestScore = estimateSet1RM(best, { useRpe: false }) || (Number(best.kg) || 0) * calcRomFactor(best);
    return score > bestScore ? set : best;
  }, workSets[0]);
  const reps = Number(bestSet?.reps) || 0;

  if (reps >= 10) return { track: 'M', source: 'reps' };
  if (reps > 0 && reps <= 8) return { track: 'H', source: 'reps' };

  const exerciseMeta = normalizeWorkoutTrack(ex?.maxTrackPreference);
  if (exerciseMeta) return { track: exerciseMeta, source: 'exercise-meta' };
  return { track: '', source: 'ambiguous-reps' };
}

export function calcWendlerSessionMetric(entry = {}) {
  const workSets = _trackWorkSets(entry?.sets);
  if (!workSets.length) return 0;
  const mainSets = workSets.filter(set => set?.wendlerRole === 'main');
  const sourceSets = mainSets.length ? mainSets : workSets;
  return Math.max(...sourceSets.map(set => (
    estimateSet1RM(set) || (Number(set.kg) || 0) * calcRomFactor(set)
  )));
}

export function calcTrackSessionMetric(entry = {}, track = '') {
  const requestedTrack = normalizeWorkoutTrack(track);
  if (isWendlerWorkoutEntry(entry) && requestedTrack) return 0;
  const inferred = requestedTrack
    ? { track: requestedTrack, source: 'explicit' }
    : inferWorkoutTrack(entry);
  const t = inferred.track;
  if (t === 'W') return calcWendlerSessionMetric(entry);
  const workSets = _trackWorkSets(entry?.sets);
  if (!normalizeWorkoutTrack(t) || !workSets.length) return 0;
  if (t === 'H') {
    return Math.max(...workSets.map(s => estimateSet1RM(s) || (Number(s.kg) || 0) * calcRomFactor(s)));
  }
  return workSets.reduce((sum, s) => sum + calcSetVolume(s), 0);
}

export function getTrackMetricHistory(cache, exList, exerciseId) {
  if (!cache || !exerciseId) return { M: [], H: [], unclassified: 0, total: 0 };
  const exById = new Map((exList || []).map(ex => [ex.id, ex]));
  const byDate = {};
  let unclassified = 0;
  let total = 0;

  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entries = (day.exercises || []).filter(e => e?.exerciseId === exerciseId);
    for (const entry of entries) {
      if (isWendlerWorkoutEntry(entry)) continue;
      if (!_trackWorkSets(entry?.sets).length) continue;
      total += 1;
      const ex = exById.get(entry.exerciseId) || null;
      const inferred = inferWorkoutTrack(entry, ex);
      if (!inferred.track) {
        unclassified += 1;
        continue;
      }
      const value = calcTrackSessionMetric(entry, inferred.track);
      if (value <= 0) continue;
      if (!byDate[key]) byDate[key] = { date: key, M: 0, H: 0 };
      byDate[key][inferred.track] += value;
    }
  }

  const rows = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  return {
    M: rows.filter(r => r.M > 0).map(r => ({ date: r.date, value: r.M })),
    H: rows.filter(r => r.H > 0).map(r => ({ date: r.date, value: r.H })),
    unclassified,
    total,
  };
}

export function getWendlerMetricHistory(cache, exList, exerciseId) {
  if (!cache || !exerciseId) return { W: [], total: 0 };
  const byDate = {};
  let total = 0;

  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entries = (day.exercises || []).filter(e => e?.exerciseId === exerciseId);
    for (const entry of entries) {
      if (!isWendlerWorkoutEntry(entry)) continue;
      const value = calcWendlerSessionMetric(entry);
      if (value <= 0) continue;
      total += 1;
      const point = {
        date: key,
        value,
        week: Number(entry.recommendationMeta?.cycleWeek) || null,
        weekStart: entry.recommendationMeta?.boardV2WeekStart || null,
      };
      if (!byDate[key] || value >= byDate[key].value) byDate[key] = point;
    }
  }

  return {
    W: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    total,
  };
}

export function getLastTrackSession(cache, exList, exerciseId, track, excludeDateKey = null) {
  const targetTrack = normalizeWorkoutTrack(track);
  if (!cache || !exerciseId || !targetTrack) return null;
  const exById = new Map((exList || []).map(ex => [ex.id, ex]));
  const dateKeys = Object.keys(cache)
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .filter(key => !excludeDateKey || key < excludeDateKey)
    .sort((a, b) => b.localeCompare(a));

  for (const key of dateKeys) {
    const entries = (cache[key]?.exercises || []).filter(e => e?.exerciseId === exerciseId);
    for (const entry of entries) {
      if (isWendlerWorkoutEntry(entry)) continue;
      if (!_trackWorkSets(entry?.sets).length) continue;
      const ex = exById.get(entry.exerciseId) || null;
      const inferred = inferWorkoutTrack(entry, ex);
      if (normalizeWorkoutTrack(inferred.track) !== targetTrack) continue;
      return {
        date: key,
        sets: entry.sets || [],
        entry,
        track: targetTrack,
        trackSource: inferred.source || null,
      };
    }
  }
  return null;
}

/**
 * subPattern별 작업세트 합계 — Scene 13 balance-block 데이터 소스.
 * weekRange = { fromKey, toKey } inclusive. 생략 시 전체 기간.
 * 작업세트 = 워밍업 아닌 것 + (done===true OR done 필드 없고 kg·reps>0).
 * 반환: { back_width: 5, back_thickness: 14, ... }
 */
export function calcBalanceByPattern(cache, exList, movements, weekRange) {
  if (!cache || !exList?.length) return {};
  const movById   = new Map((movements || []).map(m => [m.id, m]));
  const exByExId  = new Map(exList.map(e => [e.id, e]));
  const { fromKey, toKey } = weekRange || {};
  const out = {};
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (fromKey && key < fromKey) continue;
    if (toKey   && key > toKey)   continue;
    for (const entry of (day.exercises || [])) {
      const ex = exByExId.get(entry.exerciseId);
      // 2026-04-19: 자극 부위 결정 우선순위 — muscleIds[0] (주동근) > movement.subPattern.
      // 유저가 칩 에디터에서 직접 편집한 muscleIds 값을 존중. 없으면 movementId 폴백.
      // 2026-04-20: exList에서 사라진 종목(삭제됨)이나 커스텀 종목도 포함되도록
      //             entry 자체의 스냅샷 필드(muscleIds/movementId)를 fallback으로 사용.
      //             저장 시 _cleanExercises가 스냅샷을 찍어둠. (Codex 지적 #3)
      const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
        ? ex.muscleIds
        : (Array.isArray(entry.muscleIds) ? entry.muscleIds : []);
      const movementId = ex?.movementId || entry.movementId || null;
      let subPattern = null;
      if (muscleIds.length > 0) {
        subPattern = muscleIds[0];
      } else if (movementId) {
        const mov = movById.get(movementId);
        if (mov?.subPattern) subPattern = mov.subPattern;
      }
      if (!subPattern) continue;
      const workSets = (entry.sets || []).filter(s => {
        if (s.setType === 'warmup') return false;
        if (s.done === true) return true;
        if (s.done === false) return false;
        return (s.kg || 0) > 0 && (s.reps || 0) > 0;
      }).length;
      if (workSets > 0) {
        out[subPattern] = (out[subPattern] || 0) + workSets;
      }
    }
  }
  return out;
}

/**
 * 특정 exerciseId의 PR(개인 신기록) 추적.
 *   prKg / prReps / prDate : 역사상 최고 무게 세트
 *   lastKg / lastDate      : 마지막 세션의 최고 작업 무게
 *   progressKg             : 마지막 세션 최고 무게 - 그 이전 세션 최고 무게
 * 기록 부족 시 0/null로 채워 반환.
 */
export function detectPRs(cache, exerciseId) {
  const empty = { prKg:0, prReps:0, prDate:null, lastKg:0, lastDate:null, progressKg:0 };
  if (!cache || !exerciseId) return empty;
  const sessions = [];
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entry = (day.exercises || []).find(e => e.exerciseId === exerciseId);
    if (!entry) continue;
    const workSets = (entry.sets || []).filter(s => {
      if (s.setType === 'warmup') return false;
      if (s.done === false) return false;
      return (s.kg || 0) > 0 && (s.reps || 0) > 0;
    });
    if (!workSets.length) continue;
    const maxKg = Math.max(...workSets.map(s => s.kg || 0));
    const prSet = workSets.find(s => (s.kg || 0) === maxKg) || workSets[0];
    sessions.push({ date: key, maxKg, reps: prSet.reps || 0 });
  }
  if (!sessions.length) return empty;
  sessions.sort((a, b) => a.date.localeCompare(b.date));

  let prKg = 0, prReps = 0, prDate = null;
  for (const s of sessions) {
    if (s.maxKg > prKg) { prKg = s.maxKg; prReps = s.reps; prDate = s.date; }
  }
  const last = sessions[sessions.length - 1];
  const prev = sessions.length >= 2 ? sessions[sessions.length - 2] : null;
  return {
    prKg, prReps, prDate,
    lastKg: last.maxKg, lastDate: last.date,
    progressKg: prev ? +(last.maxKg - prev.maxKg).toFixed(2) : 0,
  };
}

// ================================================================
// Muscle-comparison helpers (인사이트 모달 / 루틴 추천용)
//   "오늘 가슴이면 직전 가슴·직직전 가슴과 subPattern 균형까지 비교한다"
//   - getSessionMajorMuscles: 하루치 세션의 대분류 부위 집합
//   - summarizeMuscleSession: 지정 대분류로 필터링한 세트/볼륨/subBalance
//   - findRecentSameMuscleSessions: beforeKey 이전에서 같은 대분류 세션 N개
//   - buildMuscleComparison: 오늘 + 직전 N개 메트릭 + 델타 + 불균형 경고
// ================================================================

/**
 * subPattern(세부 부위) → major muscle(대분류) 역매핑.
 * MUSCLES/MOVEMENTS와 1:1 정렬. glute는 lower와 분리된 독립 타겟 (workout 탭 칩 기준).
 * 과거엔 expert.js 내부 상수였으나 calc 레이어에서도 필요해 승격.
 */
export const SUBPATTERN_TO_MAJOR = {
  chest_all: 'chest', chest_upper: 'chest', chest_mid: 'chest', chest_lower: 'chest',
  back_all: 'back', back_width: 'back', back_thickness: 'back',
  posterior: 'back',           // 후면사슬(데드/RDL) — 등 두께+햄/둔근 혼합, 등으로 분류
  shoulder_front: 'shoulder', shoulder_side: 'shoulder',
  rear_delt: 'shoulder', traps: 'shoulder',
  quad: 'lower', hamstring: 'lower', calf: 'lower',
  glute: 'glute',              // 독립 타겟
  bicep: 'bicep',
  tricep: 'tricep',
  core: 'abs',
};

/**
 * entry(운동 1건)의 subPattern 결정.
 * 우선순위: ex.muscleIds[0] > entry.muscleIds[0] > movement.subPattern.
 * calcBalanceByPattern과 동일 규칙.
 */
function _resolveSubPattern(entry, ex, movById) {
  const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
    ? ex.muscleIds
    : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
  if (muscleIds.length > 0) return muscleIds[0];
  const movementId = ex?.movementId || entry?.movementId || null;
  if (movementId && movById) {
    const mov = movById.get(movementId);
    if (mov?.subPattern) return mov.subPattern;
  }
  return null;
}

/**
 * entry의 **세션 major** — 주동근(primary) 1개만 반환.
 * 2026-04-20 재설계: 이전 구현은 muscleIds 전체를 역매핑해 "벤치 = 가슴+어깨+삼두 세션"
 *   처럼 보조근까지 부위로 인정했다. 이건 MOVEMENT_MUSCLES_MAP 주석("배열[0]=주동근,
 *   배열[1..]=협응/보조근") 및 calcBalanceByPattern(muscleIds[0] 기준) 과 모순되며, 리뷰
 *   지적 #2/#3 의 혼합 버그 원인이었다. 이제 주동근만 반영 — 보조근은 세션 major 에서 제외.
 *
 * 우선순위: muscleIds[0] → movement.primary → entry.muscleId(major 또는 subPattern) → null.
 * 반환: major 문자열(chest/back/shoulder/lower/glute/bicep/tricep/abs) 또는 null.
 */
function _resolvePrimaryMajor(entry, ex, movById) {
  const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
    ? ex.muscleIds
    : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
  if (muscleIds.length > 0) {
    const sp = muscleIds[0];
    const major = SUBPATTERN_TO_MAJOR[sp];
    if (major) return major;
    // muscleIds[0] 가 이미 major(subPattern 아닌 경우 — 레거시 저장 경로) 면 그대로 반환.
    return sp || null;
  }
  const movementId = ex?.movementId || entry?.movementId || null;
  if (movementId && movById) {
    const mov = movById.get(movementId);
    if (mov?.primary) return mov.primary;
    if (mov?.subPattern && SUBPATTERN_TO_MAJOR[mov.subPattern]) return SUBPATTERN_TO_MAJOR[mov.subPattern];
  }
  // 최후: entry.muscleId — major 일 수도, subPattern 일 수도 있음.
  const leg = entry?.muscleId;
  if (leg) return SUBPATTERN_TO_MAJOR[leg] || leg;
  return null;
}

/**
 * 세션(하루) day 도큐먼트에서 "작업세트 1회 이상"한 대분류 부위 집합.
 *   2026-04-20: 주동근(primary) 기준만. 벤치를 한 날은 {'chest'} (shoulder/tricep 제외).
 *   보조근까지 포함하면 세션 major 가 과대평가되어 루틴 추천/이력 비교가 오염됨.
 * exercises 배열이 비어있거나 모두 워밍업이면 빈 Set.
 * @returns {Set<string>} 예) {'chest'} 또는 {'back','bicep'}
 */
export function getSessionMajorMuscles(day, exList, movements) {
  const out = new Set();
  if (!day?.exercises?.length) return out;
  const exByExId = new Map((exList || []).map(e => [e.id, e]));
  const movById  = new Map((movements || []).map(m => [m.id, m]));
  for (const entry of day.exercises) {
    const workSets = (entry.sets || []).filter(_isWorkSet).length;
    if (workSets === 0) continue;
    const ex = exByExId.get(entry.exerciseId);
    const major = _resolvePrimaryMajor(entry, ex, movById);
    if (major) out.add(major);
  }
  return out;
}

/**
 * 하루치 세션을 "지정 대분류(majors)에 속한 종목만" 집계.
 *   - workSets    : 작업세트 합
 *   - totalVolume : kg*reps*ROM% 합 (작업세트만)
 *   - topKg       : 해당 부위 종목들 중 단일 세트 최대 무게
 *   - subBalance  : { subPattern: workSets } — chest_upper/mid/lower 등
 *   - exercises   : [{ exerciseId, name, subPattern, workSets, topKg, volume, sets:[{kg,reps,rpe,setType,done}] }]
 * @param {string[]|Set<string>|null} majors null이면 전체 부위 집계.
 */
export function summarizeMuscleSession(day, exList, movements, majors) {
  const out = { workSets: 0, totalVolume: 0, topKg: 0, subBalance: {}, exercises: [] };
  if (!day?.exercises?.length) return out;
  const exByExId = new Map((exList || []).map(e => [e.id, e]));
  const movById  = new Map((movements || []).map(m => [m.id, m]));
  const majorSet = majors == null
    ? null
    : (majors instanceof Set ? majors : new Set(majors));
  for (const entry of day.exercises) {
    const ex = exByExId.get(entry.exerciseId);
    // 2026-04-20: 주동근 기준만 매칭. 벤치(주동근 chest) 는 majors=['shoulder'] 필터에 안 잡힘.
    const primary = _resolvePrimaryMajor(entry, ex, movById);
    if (majorSet && (!primary || !majorSet.has(primary))) continue;
    const subPattern = _resolveSubPattern(entry, ex, movById);
    const workSets = (entry.sets || []).filter(_isWorkSet);
    if (workSets.length === 0) continue;
    const topKg = workSets.reduce((a, s) => Math.max(a, Number(s.kg) || 0), 0);
    const volume = workSets.reduce((a, s) => a + calcSetVolume(s), 0);
    out.workSets += workSets.length;
    out.totalVolume += volume;
    if (topKg > out.topKg) out.topKg = topKg;
    if (subPattern) out.subBalance[subPattern] = (out.subBalance[subPattern] || 0) + workSets.length;
    out.exercises.push({
      exerciseId: entry.exerciseId,
      name: ex?.name || entry.name || entry.exerciseId,
      movementId: ex?.movementId || entry.movementId || null,
      subPattern,
      primaryMajor: primary,
      workSets: workSets.length,
      topKg,
      volume: Math.round(volume),
      sets: workSets.map((s, i) => ({
        setNo: i + 1,
        kg: Number(s.kg) || 0,
        reps: Number(s.reps) || 0,
        romPct: s.romPct == null ? null : Math.max(0, Math.min(100, Math.round(Number(s.romPct) || 0))),
        volume: Math.round(calcSetVolume(s)),
        rpe: s.rpe ?? null,
        setType: s.setType || 'main',
        done: s.done !== false,
      })),
    });
  }
  out.totalVolume = Math.round(out.totalVolume);
  return out;
}

/**
 * beforeKey (YYYY-MM-DD) 이전 날짜 중, majors 에 속한 부위를 운동한 세션의 dateKey를
 * 최신 → 과거 순으로 limit 개 반환. beforeKey 당일은 포함하지 않음.
 *   majors: string[] 또는 Set<string>. 빈값이면 []를 반환.
 * 정렬: 문자열 비교 (YYYY-MM-DD 사전순 == 시간순 역순 가능).
 */
export function findRecentSameMuscleSessions(cache, exList, movements, beforeKey, majors, limit = 2) {
  if (!cache || !beforeKey || !/^\d{4}-\d{2}-\d{2}$/.test(beforeKey)) return [];
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (majorSet.size === 0) return [];
  const exByExId = new Map((exList || []).map(e => [e.id, e]));
  const movById  = new Map((movements || []).map(m => [m.id, m]));
  const hits = [];
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (key >= beforeKey) continue;
    if (!day?.exercises?.length) continue;
    // 2026-04-20: 주동근 기준만 매칭. arm_pulldown-only 세션은 majors=['tricep'] 에 매칭되면 안됨.
    let match = false;
    for (const entry of day.exercises) {
      const workSets = (entry.sets || []).filter(_isWorkSet).length;
      if (workSets === 0) continue;
      const ex = exByExId.get(entry.exerciseId);
      const primary = _resolvePrimaryMajor(entry, ex, movById);
      if (primary && majorSet.has(primary)) { match = true; break; }
    }
    if (match) hits.push(key);
  }
  hits.sort((a, b) => b.localeCompare(a));     // 최신 first
  return hits.slice(0, Math.max(1, limit));
}

/**
 * 오늘 세션(todayKey)과 "같은 대분류의 직전 세션들" 비교 요약.
 *   majors: 명시하지 않으면 오늘 세션에서 자동 감지.
 *   limit : 비교 대상 과거 세션 수 (기본 2 — 직전/직직전).
 *   반환:
 *     {
 *       majors: ['chest'],
 *       today:    { dateKey, ...metrics },
 *       previous: [{ dateKey, ...metrics }, ...]   // 최신 → 과거
 *       deltas:   [{ vs: 'prev', workSetsDelta, volumeDelta, topKgDelta }, ...]
 *       imbalance: { weakest, strongest, weakSubPatterns:[...], note } | null
 *     }
 *   오늘 세션이 없거나 해당 부위 이력이 없으면 majors=[] 또는 previous=[] 로 반환.
 *   imbalance: 최근 3세션(today+previous) 합산 기준, 전체 대비 15% 미만 subPattern을 weak로.
 */
export function buildMuscleComparison(cache, exList, movements, todayKey, majors, limit = 2) {
  const empty = { majors: [], today: null, previous: [], deltas: [], imbalance: null };
  if (!cache || !todayKey || !/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) return empty;
  const day = cache[todayKey];
  if (!day) return empty;
  // majors 자동 감지
  let majorSet;
  if (majors && (Array.isArray(majors) ? majors.length : majors.size)) {
    majorSet = majors instanceof Set ? new Set(majors) : new Set(majors);
  } else {
    majorSet = getSessionMajorMuscles(day, exList, movements);
  }
  if (majorSet.size === 0) return empty;

  const todaySum = summarizeMuscleSession(day, exList, movements, majorSet);
  const prevKeys = findRecentSameMuscleSessions(cache, exList, movements, todayKey, majorSet, limit);
  const previous = prevKeys.map(k => ({
    dateKey: k,
    ...summarizeMuscleSession(cache[k], exList, movements, majorSet),
  }));

  const deltas = previous.map((p, i) => ({
    vs: i === 0 ? 'prev' : (i === 1 ? 'prevPrev' : `prev${i}`),
    dateKey: p.dateKey,
    workSetsDelta: todaySum.workSets - p.workSets,
    volumeDelta: todaySum.totalVolume - p.totalVolume,
    topKgDelta: +(todaySum.topKg - p.topKg).toFixed(2),
  }));

  // 불균형 판단: today + previous 합산 subBalance 에서
  //   (a) 전체 대비 비중 <15% 인 subPattern + (b) 아예 0세트인 subPattern 을 weak 로.
  //   2026-04-20 수정: 이전에는 `combinedEntries.length >= 2` 인 경우에만 0세트 탐지를
  //   수행해서 "세션 내내 chest_mid 만" 같은 가장 심한 불균형 케이스를 놓쳤다. possibleSubs
  //   (이 대분류에 속한 정의된 subPattern 전체) 가 2개 이상이면 분석을 실행한다.
  const combined = { ...todaySum.subBalance };
  for (const p of previous) {
    for (const [sp, v] of Object.entries(p.subBalance || {})) {
      combined[sp] = (combined[sp] || 0) + v;
    }
  }
  const combinedEntries = Object.entries(combined).sort((a, b) => b[1] - a[1]);
  const possibleSubs = new Set();
  for (const [sp, mj] of Object.entries(SUBPATTERN_TO_MAJOR)) {
    if (majorSet.has(mj)) possibleSubs.add(sp);
  }
  let imbalance = null;
  if (possibleSubs.size >= 2) {
    const totalSets = combinedEntries.reduce((a, [, v]) => a + v, 0);
    const weakSet = new Set();
    // (a) 관측됐지만 비중이 낮은 경우
    if (totalSets > 0) {
      for (const [sp, v] of combinedEntries) {
        if (v / totalSets < 0.15) weakSet.add(sp);
      }
    }
    // (b) possibleSubs 중 한 번도 관측되지 않은 경우 — 가장 명확한 불균형
    for (const sp of possibleSubs) {
      if (!(sp in combined)) weakSet.add(sp);
    }
    const weak = [...weakSet];
    const strongest = combinedEntries[0]?.[0] || null;
    if (weak.length > 0) {
      imbalance = {
        weakSubPatterns: weak,
        strongest,
        note: `${weak.join(', ')} 비중이 낮음 — 다음 세션에 보완 권장`,
      };
    }
  }

  return {
    majors: [...majorSet],
    today: { dateKey: todayKey, ...todaySum },
    previous,
    deltas,
    imbalance,
  };
}

// ================================================================
// Max-mode Boost Suggester
//   "직전·직직전 같은 부위 세션을 보고, 부족한 subPattern을 보강하는
//    바벨/덤벨 위주 종목을 제안한다. 강제 X — 후보 목록만."
//   입력은 buildMuscleComparison() 결과 + MOVEMENTS 카탈로그 + 사용자
//   exList(이미 등록된 종목 매핑) + takenExerciseIds(오늘 이미 추가됨).
// ================================================================

/**
 * Max 모드 보강 추천. 순수 함수 — DOM/Firebase 접근 X.
 * @param {Object} args
 * @param {Object} args.comparison - buildMuscleComparison() 결과
 * @param {Array}  args.exList     - 사용자 등록 종목 [{id, movementId, name, ...}]
 * @param {Array}  args.movements  - MOVEMENTS 카탈로그
 * @param {Array}  [args.preferredCategories=['barbell','dumbbell']] - 가산 카테고리
 * @param {Array}  [args.takenExerciseIds=[]] - 오늘 이미 추가된 exerciseId 목록
 * @param {Number} [args.limit=3]  - 전체 반환 동작 수 상한
 * @returns {Array<{subPattern, subPatternLabel, exercises: Array}>}
 *   exercises[i]: { movementId, nameKo, equipment_category, sizeClass, primary, isPreferred, exerciseId|null, score }
 *   subPattern마다 상위 2개씩 골라 카테고리 다양성 확보.
 */
export function suggestMaxBoosts({
  comparison,
  exList = [],
  movements = [],
  preferredCategories = ['barbell', 'dumbbell'],
  takenExerciseIds = [],
  limit = 3,
} = {}) {
  const weakSubs = comparison?.imbalance?.weakSubPatterns;
  if (!Array.isArray(weakSubs) || weakSubs.length === 0) return [];

  const preferredSet = new Set(preferredCategories || []);
  const takenSet = new Set(takenExerciseIds || []);

  // exList 매핑: movementId -> exerciseId (사용자가 이미 등록한 종목 우대)
  const movToExId = new Map();
  for (const e of exList) {
    if (e?.movementId) movToExId.set(e.movementId, e.id);
  }

  // takenSet -> takenMovIds 역매핑 (오늘 이미 추가된 movementId 추적)
  const takenMovIds = new Set();
  for (const e of exList) {
    if (e?.id && takenSet.has(e.id) && e.movementId) takenMovIds.add(e.movementId);
  }

  const subLabel = (sp) => ({
    chest_all:'가슴 전체', chest_upper:'가슴 상부', chest_mid:'가슴 중부', chest_lower:'가슴 하부',
    back_all:'등 전체', back_width:'등 넓이', back_thickness:'등 두께', posterior:'후면사슬',
    shoulder_front:'어깨 전면', shoulder_side:'어깨 측면', rear_delt:'어깨 후면',
    traps:'승모', quad:'대퇴사두', hamstring:'햄스트링', glute:'둔근', calf:'종아리',
    bicep:'이두', tricep:'삼두', core:'코어',
  }[sp] || sp);

  const result = [];
  let totalPicked = 0;

  for (const sp of weakSubs) {
    // 후보: subPattern == sp 인 모든 MOVEMENTS
    const candidates = movements
      .filter(m => m.subPattern === sp)
      .map(m => {
        let score = 0;
        const isPreferred = preferredSet.has(m.equipment_category);
        if (isPreferred) score += 5;                          // 바벨/덤벨 가산
        if (movToExId.has(m.id)) score += 3;                  // 사용자 등록 종목 +3
        if (takenMovIds.has(m.id)) score -= 100;              // 오늘 이미 추가됨 → 사실상 제외
        if (m.sizeClass === 'large') score += 1;              // 복합관절 미세 가산
        return {
          movementId: m.id,
          nameKo: m.nameKo,
          equipment_category: m.equipment_category,
          sizeClass: m.sizeClass,
          primary: m.primary,
          isPreferred,
          exerciseId: movToExId.get(m.id) || null,
          score,
        };
      })
      .filter(c => c.score > -50);  // taken 항목 제외

    if (candidates.length === 0) continue;

    // 정렬: score 내림차순 → 카테고리 다양성 적용
    candidates.sort((a, b) => b.score - a.score);

    // 카테고리 다양성: 동일 카테고리 2개째부터 -2 패널티
    const catCount = {};
    const ranked = candidates.map(c => {
      const used = catCount[c.equipment_category] || 0;
      catCount[c.equipment_category] = used + 1;
      const adjusted = used >= 1 ? c.score - 2 : c.score;
      return { ...c, score: adjusted };
    });
    ranked.sort((a, b) => b.score - a.score);

    // subPattern당 상위 2개
    const picked = ranked.slice(0, 2);
    if (picked.length === 0) continue;

    result.push({
      subPattern: sp,
      subPatternLabel: subLabel(sp),
      exercises: picked,
    });
    totalPicked += picked.length;
  }

  // limit 적용 — 마지막 group에서 초과분 잘라냄
  if (totalPicked > limit) {
    const fair = [];
    let remaining = Math.max(0, limit);
    for (const group of result) {
      if (remaining <= 0) break;
      fair.push({ ...group, exercises: group.exercises.slice(0, 1) });
      remaining -= 1;
    }
    let cursor = 0;
    while (remaining > 0 && fair.some((g, i) => g.exercises.length < (result[i]?.exercises.length || 0))) {
      const source = result[cursor];
      const target = fair[cursor];
      if (target && source && target.exercises.length < source.exercises.length) {
        target.exercises.push(source.exercises[target.exercises.length]);
        remaining -= 1;
      }
      cursor = (cursor + 1) % fair.length;
    }
    result.length = 0;
    result.push(...fair.filter(g => g.exercises.length));
  }

  return result;
}

function _workSetsOnly(sets = []) {
  return (sets || []).filter(_isWorkSet);
}

function _setE1RM(set) {
  return estimateSet1RM(set);
}

function _bestRecentSet(sets = []) {
  return _workSetsOnly(sets)
    .map(s => ({ ...s, e1rm: _setE1RM(s) }))
    .filter(s => s.e1rm > 0)
    .sort((a, b) => b.e1rm - a.e1rm)[0] || null;
}

function _defaultMaxPrescription(movement, sessionType = 'high_volume', weakTarget = false) {
  const isHeavy = sessionType === 'heavy_volume';
  const isCore = movement?.subPattern === 'core' || movement?.primary === 'abs';
  const isLarge = movement?.sizeClass === 'large';
  if (isCore) {
    return { targetSets: weakTarget ? 5 : 4, repsLow: 10, repsHigh: 15, targetRpe: isHeavy ? 9 : 8, action: weakTarget ? 'volume' : 'hold' };
  }
  if (isHeavy) {
    return isLarge
      ? { targetSets: weakTarget ? 5 : 4, repsLow: 6, repsHigh: 10, targetRpe: 9, action: 'load' }
      : { targetSets: weakTarget ? 5 : 4, repsLow: 8, repsHigh: 12, targetRpe: 9, action: 'load' };
  }
  return isLarge
    ? { targetSets: weakTarget ? 5 : 4, repsLow: 8, repsHigh: 12, targetRpe: 8, action: weakTarget ? 'volume' : 'hold' }
    : { targetSets: weakTarget ? 5 : 4, repsLow: 12, repsHigh: 18, targetRpe: 8, action: 'volume' };
}

function _targetRirLabel(targetRpe) {
  const rir = Math.max(0, Math.min(9, 10 - (Number(targetRpe) || 8)));
  return Number.isInteger(rir) ? `RIR ${rir}` : `RIR ${rir.toFixed(1)}`;
}

function _movementExerciseIds(exList = [], movementId) {
  return (exList || []).filter(e => e?.movementId === movementId).map(e => e.id).filter(Boolean);
}

function _findMovementSessions(cache, exList, movementId, beforeKey = null) {
  const ids = new Set(_movementExerciseIds(exList, movementId));
  if (!ids.size) return [];
  return Object.entries(cache || {})
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && (!beforeKey || key !== beforeKey))
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([dateKey, day]) => (day?.exercises || [])
      .filter(e => ids.has(e.exerciseId))
      .map(entry => ({ dateKey, entry })));
}

export function recommendMaxProgressionAction({
  lastSet,
  prescription,
  sessionType = 'high_volume',
  stepKg = 2.5,
} = {}) {
  const reps = Number(lastSet?.reps) || 0;
  const rpe = Number(lastSet?.rpe) || 0;
  const repsLow = Number(prescription?.repsLow) || 8;
  const repsHigh = Number(prescription?.repsHigh) || 12;
  const safeStep = Number(stepKg) > 0 ? Number(stepKg) : 2.5;
  if (reps <= 0) {
    return { action: prescription?.action || 'hold', deltaKg: 0, reason: '이전 유효 세트가 부족해 기본 처방으로 시작합니다.' };
  }
  if (reps >= repsHigh + 3 && (!rpe || rpe <= 8)) {
    return { action: 'load', deltaKg: safeStep, reason: `상한보다 ${reps - repsHigh}회 더 가능해 다음 세트는 증량 후보입니다.` };
  }
  if (reps < Math.max(1, repsLow - 2) || rpe >= 9.5) {
    return { action: 'hold', deltaKg: 0, reason: '목표 반복 하한보다 낮아 오늘은 무게를 고정하고 품질을 맞춥니다.' };
  }
  if (sessionType === 'heavy_volume' && reps >= repsHigh) {
    return { action: 'load', deltaKg: safeStep, reason: '중상볼륨 Day에서 목표 상한을 채워 소폭 증량이 적절합니다.' };
  }
  if (sessionType === 'high_volume' && reps >= repsHigh) {
    return { action: 'volume', deltaKg: 0, reason: '고볼륨 Day에서는 같은 무게로 유효 세트 누적을 우선합니다.' };
  }
  return { action: prescription?.action || 'hold', deltaKg: 0, reason: '목표 반복 범위 안이므로 오늘 처방을 그대로 진행합니다.' };
}

export function buildMaxPrescription({
  cache = {},
  exList = [],
  movement = null,
  exerciseId = null,
  todayKey = null,
  sessionType = 'high_volume',
  weakTarget = false,
} = {}) {
  if (!movement?.id) return null;
  const base = _defaultMaxPrescription(movement, sessionType, weakTarget);
  const stepKg = Number(movement.stepKg) > 0 ? Number(movement.stepKg) : 2.5;
  const sessions = exerciseId
    ? (() => {
        const last = getLastSession(cache, exerciseId, todayKey);
        return last ? [{ dateKey: last.date, entry: { sets: last.sets || [] } }] : [];
      })()
    : _findMovementSessions(cache, exList, movement.id, todayKey);
  const bestSession = sessions.find(s => _bestRecentSet(s.entry?.sets));
  const lastSet = bestSession ? _bestRecentSet(bestSession.entry?.sets) : null;
  const targetReps = sessionType === 'heavy_volume' ? base.repsLow : base.repsHigh;
  const e1rm = lastSet ? _setE1RM(lastSet) : 0;
  const rawTarget = e1rm > 0 ? targetWeightKg(e1rm, base.targetRpe, targetReps) : 0;
  const startKg = rawTarget > 0 ? roundToIncrement(rawTarget, stepKg) : 0;
  const progression = recommendMaxProgressionAction({ lastSet, prescription: base, sessionType, stepKg });
  const kgForSets = progression.action === 'load' && startKg > 0
    ? roundToIncrement(startKg + progression.deltaKg, stepKg)
    : startKg;
  const repsForSets = sessionType === 'heavy_volume' ? base.repsLow : base.repsHigh;
  const sets = Array.from({ length: base.targetSets }, () => ({
    kg: kgForSets || 0,
    reps: repsForSets,
    setType: 'main',
    done: false,
    rpe: base.targetRpe,
  }));
  const actionLabel = progression.action === 'load' ? '증량' : (progression.action === 'volume' ? '볼륨' : '유지');
  return {
    label: `${base.targetSets}세트 x ${base.repsLow}-${base.repsHigh}회 · ${_targetRirLabel(base.targetRpe)}`,
    targetSets: base.targetSets,
    repsLow: base.repsLow,
    repsHigh: base.repsHigh,
    targetRpe: base.targetRpe,
    startKg: kgForSets || 0,
    action: progression.action,
    actionLabel,
    deltaKg: progression.deltaKg,
    reason: progression.reason,
    lastDateKey: bestSession?.dateKey || null,
    lastSet: lastSet ? { kg: Number(lastSet.kg) || 0, reps: Number(lastSet.reps) || 0, rpe: Number(lastSet.rpe) || null } : null,
    weakTarget: !!weakTarget,
    sets,
  };
}

export function detectMaxFixedMovements({
  cache = {},
  exList = [],
  movements = [],
  todayKey = null,
  majors = [],
  lookbackSessions = 4,
  minHits = 2,
} = {}) {
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (!majorSet.size) return [];
  const keys = findRecentSameMuscleSessions(cache, exList, movements, todayKey, majorSet, lookbackSessions);
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const counts = new Map();
  for (const key of keys) {
    const seen = new Set();
    for (const entry of cache?.[key]?.exercises || []) {
      const ex = exById.get(entry.exerciseId);
      const movId = entry.movementId || ex?.movementId;
      const mov = movById.get(movId);
      if (!mov || !majorSet.has(mov.primary)) continue;
      if (_workSetsOnly(entry.sets).length === 0) continue;
      seen.add(mov.id);
    }
    for (const movId of seen) counts.set(movId, (counts.get(movId) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minHits)
    .map(([movementId, count]) => ({ ...movById.get(movementId), movementId, count, lookback: keys.length }))
    .filter(x => x.id)
    .sort((a, b) => b.count - a.count || (a.nameKo || '').localeCompare(b.nameKo || ''));
}

// ════════════════════════════════════════════════════════════════
// 테스트모드 v2 — 6주 듀얼 트랙 성장판 순수 함수
// ════════════════════════════════════════════════════════════════

function _keyFromDateForCycle(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _roundCycleKg(kg, step = 2.5) {
  const k = Number(kg) || 0;
  const s = Number(step) > 0 ? Number(step) : 2.5;
  return Math.round((Math.round(k / s) * s) * 10) / 10;
}

export function getMaxCycleWeekIndex(cycle, todayKey) {
  const start = _dateFromKeyForCycle(cycle?.startDate);
  const today = _dateFromKeyForCycle(todayKey);
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  if (!start || !today) return 1;
  const diff = Math.floor((today - start) / 604800000);
  return Math.max(1, Math.min(weeks, diff + 1));
}

export function getMaxCycleTrack(cycle, todayKey) {
  const week = getMaxCycleWeekIndex(cycle, todayKey);
  const forced = cycle?.todayTrack;
  if (forced === 'M' || forced === 'H') return forced;
  return week % 2 === 0 ? 'H' : 'M';
}

export function predictBenchmarkProgression(benchmark, cycle, todayKey) {
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  const week = getMaxCycleWeekIndex(cycle, todayKey);
  const startKg = Number(benchmark?.startKg) || 0;
  const targetKg = Number(benchmark?.targetKg) || startKg;
  const step = Number(benchmark?.incrementKg) > 0 ? Number(benchmark.incrementKg) : 2.5;
  const perWeek = weeks > 1 ? (targetKg - startKg) / (weeks - 1) : 0;
  const plannedKg = _roundCycleKg(startKg + perWeek * (week - 1), step);
  return {
    week,
    weeks,
    startKg,
    targetKg: _roundCycleKg(targetKg, step),
    plannedKg,
    deltaKg: Math.round((plannedKg - startKg) * 10) / 10,
    remainingKg: Math.round((targetKg - plannedKg) * 10) / 10,
    percent: targetKg > startKg ? Math.max(0, Math.min(100, Math.round(((plannedKg - startKg) / (targetKg - startKg)) * 100))) : 100,
  };
}

export function buildMaxCycleSchedule(cycle) {
  const start = _dateFromKeyForCycle(cycle?.startDate);
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  const benchmarks = Array.isArray(cycle?.benchmarks) ? cycle.benchmarks : [];
  if (!start || benchmarks.length === 0) return [];
  const rows = [];
  for (let w = 1; w <= weeks; w++) {
    const d = new Date(start);
    d.setDate(start.getDate() + (w - 1) * 7);
    const key = _keyFromDateForCycle(d);
    const rowCycle = { ...cycle, weeks, startDate: cycle.startDate };
    rows.push({
      week: w,
      dateKey: key,
      track: w % 2 === 0 ? 'H' : 'M',
      cells: benchmarks.map(b => ({
        benchmarkId: b.id,
        movementId: b.movementId,
        label: b.label,
        major: b.primaryMajor,
        track: w % 2 === 0 ? 'H' : 'M',
        planned: predictBenchmarkProgression(b, rowCycle, key),
      })),
    });
  }
  return rows;
}

export function resolveMovementExercises(movementId, exList = [], { gymId = null } = {}) {
  if (!movementId) return [];
  return (exList || []).filter(e => {
    if (!e?.id || e?.movementId !== movementId) return false;
    if (!gymId) return true;
    const ids = [
      e.gymId,
      e.primaryGymId,
      ...(Array.isArray(e.gymIds) ? e.gymIds : []),
      ...(Array.isArray(e.gymTags) ? e.gymTags : []),
    ].filter(Boolean);
    return !ids.length || ids.includes('*') || ids.includes(gymId);
  });
}

export function resolveBenchmarkExercise(benchmark = {}, exList = [], { gymId = null } = {}) {
  const exerciseId = benchmark?.exerciseId || null;
  if (exerciseId) {
    return (exList || []).find(e => e?.id === exerciseId) || { id: exerciseId, movementId: benchmark?.movementId || null, missing: true };
  }
  return resolveMovementExercises(benchmark?.movementId || benchmark?.id, exList, { gymId })[0] || null;
}

export function findBenchmarkActuals(cache = {}, exList = [], benchmarkOrMovementId, todayKey = null, maybeExerciseId = null) {
  const benchmark = typeof benchmarkOrMovementId === 'object'
    ? benchmarkOrMovementId
    : { movementId: benchmarkOrMovementId, exerciseId: maybeExerciseId };
  const movementId = benchmark?.movementId || benchmark?.id || null;
  const exerciseId = benchmark?.exerciseId || null;
  const ids = new Set(exerciseId ? [exerciseId] : (exList || []).filter(e => e?.movementId === movementId).map(e => e.id));
  const points = [];
  for (const [date, day] of Object.entries(cache || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (todayKey && date > todayKey) continue;
    for (const entry of day?.exercises || []) {
      const entryMovementId = entry.movementId || (ids.has(entry.exerciseId) ? movementId : null);
      const match = exerciseId
        ? entry.exerciseId === exerciseId
        : (entryMovementId === movementId || ids.has(entry.exerciseId));
      if (!match) continue;
      let best = null;
      for (const set of entry.sets || []) {
        if (set?.setType === 'warmup') continue;
        if (!set?.done && set?.done !== undefined) continue;
        const kg = Number(set?.kg) || 0;
        const reps = Number(set?.reps) || 0;
        if (kg <= 0 || reps <= 0) continue;
        const e1rm = estimateSet1RM(set);
        if (!best || e1rm > best.e1rm) best = { kg, reps, e1rm: Math.round(e1rm * 10) / 10 };
      }
      if (best) points.push({ dateKey: date, exerciseId: entry.exerciseId || null, movementId: entryMovementId || movementId || null, ...best });
    }
  }
  return points.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildBenchmarkActuals({ cache = {}, exList = [], benchmark = null, movementId = null, exerciseId = null, todayKey = null } = {}) {
  return findBenchmarkActuals(cache, exList, benchmark || { movementId, exerciseId }, todayKey);
}

function _maxCycleActualsOnOrAfter(actuals = [], startDate = null) {
  if (!startDate) return actuals || [];
  return (actuals || []).filter(p => p?.dateKey >= startDate);
}

function _maxCycleActualsBefore(actuals = [], startDate = null) {
  if (!startDate) return [];
  return (actuals || []).filter(p => p?.dateKey < startDate);
}

export function buildMaxCycleSnapshot({
  cycle = null,
  cache = {},
  exList = [],
  todayKey = null,
} = {}) {
  if (!cycle || !Array.isArray(cycle.benchmarks)) return null;
  const weekIndex = getMaxCycleWeekIndex(cycle, todayKey);
  const track = getMaxCycleTrack(cycle, todayKey);
  const weeks = Math.max(1, Number(cycle.weeks) || 6);
  const schedule = buildMaxCycleSchedule(cycle);
  const benchmarks = cycle.benchmarks.map(b => {
    const planned = predictBenchmarkProgression(b, cycle, todayKey);
    const allActuals = buildBenchmarkActuals({ cache, exList, benchmark: b, todayKey });
    const actuals = _maxCycleActualsOnOrAfter(allActuals, cycle.startDate);
    const baselineActuals = _maxCycleActualsBefore(allActuals, cycle.startDate);
    const latest = actuals[actuals.length - 1] || null;
    const baselineLatest = baselineActuals[baselineActuals.length - 1] || null;
    const delta = latest ? Math.round((latest.kg - planned.plannedKg) * 10) / 10 : null;
    return {
      ...b,
      planned,
      actuals,
      baselineActuals,
      baselineLatest,
      latest,
      delta,
      onPlan: delta === null ? null : delta >= 0,
    };
  });
  const completed = benchmarks.filter(b => b.latest && b.latest.kg >= b.planned.plannedKg).length;
  return {
    id: cycle.id,
    status: cycle.status || 'active',
    framework: cycle.framework || 'dual_track_progression_v2',
    startDate: cycle.startDate,
    weeks,
    weekIndex,
    progressPct: Math.round((weekIndex / weeks) * 100),
    track,
    benchmarks,
    schedule,
    completed,
    total: benchmarks.length,
  };
}

export function detectPlateau(points = [], { weeks = 2 } = {}) {
  const recent = (points || []).slice(-Math.max(2, weeks));
  if (recent.length < Math.max(2, weeks)) return { plateau: false, reason: '데이터 부족' };
  const best = Math.max(...recent.map(p => Number(p.e1rm) || 0));
  const first = Number(recent[0]?.e1rm) || 0;
  const last = Number(recent[recent.length - 1]?.e1rm) || 0;
  const plateau = best > 0 && last <= first * 1.005;
  return {
    plateau,
    reason: plateau ? `${recent.length}회 기록에서 e1RM 증가가 거의 없습니다.` : '최근 e1RM은 유지 또는 상승 중입니다.',
    first,
    last,
  };
}
