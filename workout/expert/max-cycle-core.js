export { escapeHtml as _esc } from '../../utils/escape-html.js';
import { KOREAN_WEEKDAYS } from '../../utils/weekdays.js';
// ================================================================
// workout/expert/max-cycle.js
// 테스트모드 v2 — 6주 성장판 렌더/사이클 helper
// ================================================================

import { inferEquipmentMovementIds, inferExerciseMovementId, normalizeEquipmentCategory } from '../../data/data-pure.js';
import { normalizeWendlerConfig } from './max-wendler.js';
import { W863_ORIGINAL_VERSION } from '../w863-original.js';

export const MAJOR_LABEL = {
  chest: '가슴',
  back: '등',
  lower: '하체',
  shoulder: '어깨',
  glute: '둔부',
  bicep: '이두',
  tricep: '삼두',
  abs: '복근',
};

export const MAX_VOLUME_ONLY_MAJORS = new Set(['bicep', 'tricep', 'abs']);

export function isMaxVolumeOnlyMajor(major) {
  return MAX_VOLUME_ONLY_MAJORS.has(String(major || '').trim());
}

export function isMaxVolumeOnlyBenchmark(benchmark = {}) {
  return isMaxVolumeOnlyMajor(benchmark?.primaryMajor);
}

export function isMaxTrackEnabled(benchmark = {}, track = 'M') {
  if (track !== 'H') return true;
  return _trackSpec(benchmark, 'H').enabled !== false;
}

export function maxBenchmarkTrackList(benchmark = {}) {
  return isMaxTrackEnabled(benchmark, 'H') ? ['M', 'H'] : ['M'];
}

const DEFAULT_BENCHMARK_BY_MAJOR = {
  chest: 'barbell_bench',
  back: 'lat_pulldown',
  lower: 'back_squat',
  shoulder: 'dumbbell_shoulder_press',
  glute: 'hip_thrust',
  bicep: 'barbell_curl',
  tricep: 'cable_tricep_pushdown',
  abs: 'cable_crunch',
};

function _keyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _weekStartKey(todayKey) {
  const d = new Date(`${todayKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return todayKey;
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return _keyFromDate(d);
}

function _kgStepForMajor(major) {
  return major === 'lower' || major === 'glute' ? 5 : 2.5;
}

export function _targetRepsForTrack(track) {
  return track === 'H' ? 8 : 12;
}

export function _targetTrackLabel(track) {
  return track === 'H' ? '강도' : '볼륨';
}

function _trackRepsRange(track) {
  return track === 'H' ? '5-8' : '10-12';
}

export function _trackSpec(benchmark, track = 'M') {
  const key = track === 'H' ? 'H' : 'M';
  const legacyStart = Number(benchmark?.startKg) || 0;
  const legacyTarget = Number(benchmark?.targetKg) || legacyStart;
  const legacyStep = Number(benchmark?.incrementKg) > 0 ? Number(benchmark.incrementKg) : 2.5;
  const legacy = {
    M: {
      startKg: legacyStart,
      targetKg: legacyTarget,
      incrementKg: legacyStep,
      startReps: Number(benchmark?.startReps) || 12,
      targetReps: Number(benchmark?.targetReps) || 12,
      enabled: true,
    },
    H: {
      startKg: _roundKg(legacyStart + legacyStep * 2, legacyStep),
      targetKg: _roundKg(legacyTarget + legacyStep * 2, legacyStep),
      incrementKg: legacyStep,
      startReps: 8,
      targetReps: 6,
      enabled: true,
    },
  };
  const tracks = benchmark?.tracks && !Array.isArray(benchmark.tracks) ? benchmark.tracks : {};
  const merged = { ...legacy[key], ...(tracks[key] || {}) };
  if (!isMaxVolumeOnlyBenchmark(benchmark)) return merged;
  return key === 'H'
    ? { ...merged, enabled: false }
    : { ...merged, enabled: true };
}

export function normalizeMaxCycleTracks(cycle) {
  if (!cycle || !Array.isArray(cycle.benchmarks)) return cycle;
  const benchmarks = cycle.benchmarks.map(b => {
    const m = _trackSpec(b, 'M');
    const h = _trackSpec(b, 'H');
    const defaultTrack = h.enabled === false
      ? 'M'
      : (b.defaultTrack === 'H' || b.defaultTrack === 'M' ? b.defaultTrack : null);
    const wendler = b.program === 'wendler'
      ? normalizeWendlerConfig(b.wendler || {}, {
        primaryMajor: b.primaryMajor,
        trackSpec: h.enabled === false ? m : h,
        movementId: b.movementId,
        exerciseId: b.exerciseId,
        label: b.label,
      })
      : b.wendler;
    return {
      ...b,
      ...(defaultTrack ? { defaultTrack } : {}),
      ...(wendler ? { wendler } : {}),
      tracks: { M: m, H: h },
      startKg: m.startKg,
      targetKg: m.targetKg,
      incrementKg: m.incrementKg,
      startReps: m.startReps,
      targetReps: m.targetReps,
    };
  });
  const hasOriginal = benchmarks.some(b => b.wendler?.templateVersion === W863_ORIGINAL_VERSION);
  return {
    ...cycle,
    weeks: hasOriginal ? Math.max(7, Number(cycle.weeks) || 0) : cycle.weeks,
    benchmarks,
  };
}

function _storedCycleTime(cycle = null) {
  return Math.max(0, Number(cycle?.updatedAt) || 0, Number(cycle?.createdAt) || 0);
}

function _storedCycleTrackScore(cycle = null) {
  if (!cycle || !Array.isArray(cycle.benchmarks)) return 0;
  return cycle.benchmarks.reduce((score, benchmark) => {
    const tracks = benchmark?.tracks && !Array.isArray(benchmark.tracks) ? benchmark.tracks : {};
    const hasM = tracks.M && typeof tracks.M === 'object';
    const hasH = tracks.H && typeof tracks.H === 'object';
    return score + 1 + (hasM ? 2 : 0) + (hasH ? 2 : 0);
  }, 0);
}

export function selectPersistedMaxCycle(presetCycle = null, settingCycle = null) {
  const presetValid = presetCycle && Array.isArray(presetCycle.benchmarks) ? presetCycle : null;
  const settingValid = settingCycle && Array.isArray(settingCycle.benchmarks) ? settingCycle : null;
  if (!presetValid) return settingValid;
  if (!settingValid) return presetValid;

  const presetTime = _storedCycleTime(presetValid);
  const settingTime = _storedCycleTime(settingValid);
  if (settingTime > presetTime) return settingValid;
  if (presetTime > settingTime) return presetValid;

  const presetScore = _storedCycleTrackScore(presetValid);
  const settingScore = _storedCycleTrackScore(settingValid);
  if (settingScore > presetScore) return settingValid;
  if (presetScore > settingScore) return presetValid;

  return settingValid;
}

export function _shortDate(key) {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key || '';
  const day = KOREAN_WEEKDAYS[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${day}`;
}

function _addDaysKey(key, days) {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key || '';
  d.setDate(d.getDate() + Number(days || 0));
  return _keyFromDate(d);
}

export function _displayKg(cycle, todayKey, benchmark, track = 'M') {
  const override = cycle?.todayOverrides?.[todayKey]?.[`${benchmark.id}:${track}`]
    || cycle?.todayOverrides?.[todayKey]?.[benchmark.id];
  const kg = Number(override?.kg);
  return Number.isFinite(kg) && kg > 0 ? kg : benchmark.planned.plannedKg;
}

export function _impactCopy(displayKg, benchmark) {
  const planned = Number(benchmark.planned?.plannedKg) || 0;
  const diff = Math.round((Number(displayKg) - planned) * 10) / 10;
  if (!diff) return '계획값입니다. 오늘 성공하면 다음 주도 예정대로 진행합니다.';
  if (diff > 0) return `계획보다 +${diff}kg. 성공하면 다음 주 목표를 한 주 앞당깁니다.`;
  return `계획보다 ${diff}kg. 오늘만 낮추고 다음 주는 원래 계획을 유지합니다.`;
}

function _weekIndex(cycle, todayKey) {
  const start = new Date(`${cycle?.startDate}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) return 1;
  return Math.max(1, Math.min(weeks, Math.floor((today - start) / 604800000) + 1));
}

function _roundKg(kg, step = 2.5) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  return Math.round((Math.round((Number(kg) || 0) / s) * s) * 10) / 10;
}

function _estimate1RM(kg, reps) {
  const k = Number(kg) || 0;
  const r = Number(reps) || 0;
  if (k <= 0 || r <= 0) return 0;
  return r === 1 ? k : k * (1 + r / 30);
}

function _romFactor(set = {}) {
  if (set.romPct === '' || set.romPct == null) return 1;
  const pct = Number(set.romPct);
  if (!Number.isFinite(pct)) return 1;
  return Math.max(0, Math.min(100, pct)) / 100;
}

function _estimateSet1RM(set = {}) {
  return _estimate1RM(set.kg, set.reps) * _romFactor(set);
}

export function predictBenchmarkProgression(benchmark, cycle, todayKey, track = 'M') {
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  const week = _weekIndex(cycle, todayKey);
  const spec = _trackSpec(benchmark, track);
  const startKg = Number(spec.startKg) || 0;
  const targetKg = Number(spec.targetKg) || startKg;
  const step = Number(spec.incrementKg) > 0 ? Number(spec.incrementKg) : 2.5;
  const perWeek = weeks > 1 ? (targetKg - startKg) / (weeks - 1) : 0;
  const plannedKg = _roundKg(startKg + perWeek * (week - 1), step);
  return {
    week,
    weeks,
    track: track === 'H' ? 'H' : 'M',
    startKg,
    targetKg: _roundKg(targetKg, step),
    plannedKg,
    startReps: Number(spec.startReps) || (track === 'H' ? 8 : 12),
    targetReps: Number(spec.targetReps) || (track === 'H' ? 6 : 12),
    incrementKg: step,
    percent: targetKg > startKg ? Math.max(0, Math.min(100, Math.round(((plannedKg - startKg) / (targetKg - startKg)) * 100))) : 100,
  };
}

export function _benchmarkMovementId(item) {
  if (item && Object.prototype.hasOwnProperty.call(item, 'exerciseId')) return item?.movementId || null;
  return item?.movementId || item?.id || null;
}

function _benchmarkExerciseId(item) {
  if (item && Object.prototype.hasOwnProperty.call(item, 'exerciseId')) return item?.exerciseId || null;
  return item?.exerciseId || (item?.movementId ? item?.id : null);
}

function _benchmarkPrimary(item) {
  return item?.primary || item?.primaryMajor || null;
}

function _benchmarkOptionCategory(item = {}) {
  const candidates = [
    item?.movementEquipmentCategory,
    item?.equipment_category,
    item?.category,
    item?.equipmentCategory,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeEquipmentCategory(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function _benchmarkOptionGymIds(item = {}) {
  return [...new Set([
    item?.gymId,
    item?.primaryGymId,
    item?.ownerGymId,
    ...(Array.isArray(item?.gymIds) ? item.gymIds : []),
    ...(Array.isArray(item?.gymTags) ? item.gymTags.filter(tag => tag && tag !== '*') : []),
  ].filter(Boolean))];
}

export function _benchmarkOptionValue(item) {
  const exerciseId = _benchmarkExerciseId(item);
  if (exerciseId) return exerciseId;
  const movementId = _benchmarkMovementId(item);
  return movementId ? `movement:${movementId}` : '';
}

export function getMaxBenchmarkOptionGroupKey(item, { currentGymId = null } = {}) {
  if (item?.benchmarkOptionKey) return item.benchmarkOptionKey;
  const movementId = _benchmarkMovementId(item);
  const category = _benchmarkOptionCategory(item);
  const tags = Array.isArray(item?.gymTags) ? item.gymTags : [];
  const shared = BENCHMARK_SHARED_CATEGORIES.has(category) || tags.includes('*') || item?.scope === 'global' || item?.scope === 'common';
  if (movementId && shared) return `shared:${movementId}`;
  const gymKey = _benchmarkOptionGymIds(item)[0] || (shared ? '*' : 'ungrouped');
  if (movementId) return `gym:${gymKey}:${movementId}`;
  const nameKey = String(item?.nameKo || item?.name || item?.id || '').trim().toLowerCase();
  return `custom:${gymKey}:${nameKey}`;
}

function _benchmarkOptionRank(item, { currentGymId = null } = {}) {
  const sourceScore = ({ exact: 3, legacy: 2, empty: 1 })[item?.benchmarkDefaults?.source] || 0;
  const sessions = Number(item?.benchmarkDefaults?.sessions) || 0;
  const gymMatch = currentGymId && _benchmarkOptionGymIds(item).includes(currentGymId) ? 1 : 0;
  return sourceScore * 1000 + sessions * 20 + gymMatch * 10 + (_benchmarkExerciseId(item) ? 1 : 0);
}

export function dedupeMaxBenchmarkOptions(items = [], options = {}) {
  const context = typeof options === 'string' ? { currentGymId: options } : (options || {});
  const grouped = new Map();
  for (const item of items || []) {
    const key = getMaxBenchmarkOptionGroupKey(item, context);
    const current = grouped.get(key);
    const next = { ...item, benchmarkOptionKey: key };
    if (!current || _benchmarkOptionRank(next, context) > _benchmarkOptionRank(current, context)) grouped.set(key, next);
  }
  return [...grouped.values()];
}

export function _dedupeBenchmarkOptions(items = [], options = {}) {
  return dedupeMaxBenchmarkOptions(items, options);
}

const BENCHMARK_SHARED_CATEGORIES = new Set(['barbell', 'dumbbell', 'bodyweight']);
const BENCHMARK_CATEGORY_EQUIPMENT_CATEGORIES = new Set(['barbell', 'dumbbell', 'bodyweight', 'cable']);
const BENCHMARK_SCOPED_CATEGORY_FALLBACKS = new Set(['machine', 'smith', 'cable']);

function _planExerciseGymIds(ex = {}) {
  return [
    ex.gymId,
    ex.primaryGymId,
    ...(Array.isArray(ex.gymIds) ? ex.gymIds : []),
    ...(Array.isArray(ex.gymTags) ? ex.gymTags.filter(tag => tag && tag !== '*') : []),
  ].filter(Boolean);
}

function _planExerciseMatchesGym(ex = {}, gymId = null) {
  if (!gymId) return false;
  return _planExerciseGymIds(ex).includes(gymId);
}

function _planExerciseIsShared(ex = {}, category = '') {
  const tags = Array.isArray(ex.gymTags) ? ex.gymTags : [];
  const gymIds = _planExerciseGymIds(ex);
  return BENCHMARK_SHARED_CATEGORIES.has(category)
    || tags.includes('*')
    || (!gymIds.length && !ex.gymId && !ex.primaryGymId);
}

function _planEquipmentMovementIds(item = {}, movements = []) {
  return inferEquipmentMovementIds(item, movements);
}

function _planEquipmentByMovement(activeEquipment = [], movements = []) {
  const byMovement = new Map();
  const sourceRank = { category: 1, name: 2, explicit: 3 };
  const rankRef = (ref) => (ref?.item?.scope === 'gym' ? 10 : 0) + (sourceRank[ref?.source] || 0);
  const setEquipment = (movementId, item, source = 'explicit') => {
    if (!movementId) return;
    const current = byMovement.get(movementId);
    const next = { item, source };
    if (!current || rankRef(next) > rankRef(current)) {
      byMovement.set(movementId, next);
    }
  };

  for (const item of activeEquipment || []) {
    const explicitIds = Array.isArray(item?.movementIds) ? item.movementIds.filter(Boolean) : [];
    const source = explicitIds.length ? 'explicit' : 'name';
    for (const movementId of _planEquipmentMovementIds(item, movements)) {
      setEquipment(movementId, item, source);
    }
  }

  for (const item of activeEquipment || []) {
    const category = item?.category || '';
    if (!BENCHMARK_CATEGORY_EQUIPMENT_CATEGORIES.has(category)) continue;
    for (const mov of movements || []) {
      if (mov?.equipment_category === category) setEquipment(mov.id, item, 'category');
    }
  }
  return byMovement;
}

export function buildMaxPlanMovementOptionSeeds({
  exList = [],
  movements = [],
  activeEquipment = [],
  currentGymId = null,
} = {}) {
  const movementById = new Map((movements || []).map(m => [m.id, m]));
  const equipmentByMovement = _planEquipmentByMovement(activeEquipment, movements);
  const seeds = [];
  const scopedFallbacks = new Map();

  for (const ex of exList || []) {
    const movementId = inferExerciseMovementId(ex, movements);
    if (!ex?.id || !movementId) continue;
    const mov = movementById.get(movementId) || null;
    if (!mov) continue;
    const category = ex.category || mov?.equipment_category || '';
    const isCurrentGym = _planExerciseMatchesGym(ex, currentGymId);
    const isSharedOrRegistered = _planExerciseIsShared(ex, category);
    const equipmentRef = equipmentByMovement.get(movementId) || null;
    if (!isCurrentGym && !isSharedOrRegistered) continue;
    seeds.push({
      kind: 'exercise',
      exercise: movementId === ex.movementId ? ex : { ...ex, movementId },
      movement: mov,
      equipment: equipmentRef?.item || null,
    });
    if (BENCHMARK_SCOPED_CATEGORY_FALLBACKS.has(category) && mov?.primary) {
      scopedFallbacks.set(`${category}:${mov.primary}`, { category, primary: mov.primary });
    }
  }

  for (const fallback of scopedFallbacks.values()) {
    for (const mov of movements || []) {
      if (!mov?.id || mov.equipment_category !== fallback.category || mov.primary !== fallback.primary) continue;
      const exists = seeds.some(seed => seed.movement?.id === mov.id);
      if (exists) continue;
      seeds.push({
        kind: 'movement',
        exercise: null,
        movement: mov,
        equipment: null,
      });
    }
  }

  for (const [movementId, equipmentRef] of equipmentByMovement.entries()) {
    if (equipmentRef?.source !== 'explicit' && equipmentRef?.source !== 'name') continue;
    const equipment = equipmentRef.item;
    const mov = movementById.get(movementId);
    if (!mov) continue;
    const hasExercise = seeds.some(seed => {
      if (seed.exercise?.movementId !== movementId) return false;
      if (equipment?.scope !== 'gym') return true;
      return _planExerciseMatchesGym(seed.exercise, currentGymId);
    });
    if (hasExercise) continue;
    seeds.push({
      kind: 'movement',
      exercise: null,
      movement: mov,
      equipment,
    });
  }

  return seeds;
}

function _exerciseGymIds(ex = {}) {
  return [
    ex.gymId,
    ex.primaryGymId,
    ...(Array.isArray(ex.gymIds) ? ex.gymIds : []),
    ...(Array.isArray(ex.gymTags) ? ex.gymTags : []),
  ].filter(Boolean);
}

function _exerciseMatchesGym(ex = {}, gymId = null) {
  if (!gymId) return true;
  const ids = _exerciseGymIds(ex);
  if (!ids.length || ids.includes('*')) return true;
  return ids.includes(gymId);
}

export function resolveMovementExercises(movementId, exList = [], { gymId = null } = {}) {
  if (!movementId) return [];
  return (exList || [])
    .filter(ex => ex?.id && ex?.movementId === movementId)
    .filter(ex => _exerciseMatchesGym(ex, gymId));
}

export function resolveBenchmarkExercise(benchmark = {}, exList = [], { gymId = null } = {}) {
  const exerciseId = _benchmarkExerciseId(benchmark);
  if (exerciseId) {
    const exact = (exList || []).find(ex => ex?.id === exerciseId);
    if (exact) return exact;
    return { id: exerciseId, movementId: _benchmarkMovementId(benchmark), missing: true };
  }
  const movementId = _benchmarkMovementId(benchmark);
  const scoped = resolveMovementExercises(movementId, exList, { gymId });
  return scoped[0] || null;
}

function _entryTrack(entry = {}, best = null) {
  const raw = entry?.recommendationMeta?.track
    || entry?.recommendationMeta?.benchmarkTrack
    || entry?.maxPrescription?.benchmarkTrack
    || entry?.maxPrescription?.track
    || entry?.maxTrackPreference
    || entry?.benchmarkTrack
    || '';
  if (raw === 'H' || raw === 'M') return raw;
  const reps = Number(best?.reps) || 0;
  if (reps >= 9) return 'M';
  if (reps > 0 && reps <= 8) return 'H';
  return null;
}

function _actuals(cache = {}, exList = [], benchmarkOrMovementId, todayKey, maybeExerciseId = null) {
  const benchmark = typeof benchmarkOrMovementId === 'object'
    ? benchmarkOrMovementId
    : { movementId: benchmarkOrMovementId, exerciseId: maybeExerciseId };
  const movementId = benchmark?.movementId || null;
  const exerciseId = benchmark?.exerciseId || null;
  const ids = new Set();
  if (exerciseId) ids.add(exerciseId);
  else (exList || []).filter(e => e?.movementId === movementId).forEach(e => ids.add(e.id));
  const points = [];
  for (const [date, day] of Object.entries(cache || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (todayKey && date > todayKey) continue;
    for (const entry of day?.exercises || []) {
      const match = exerciseId
        ? entry.exerciseId === exerciseId
        : (entry.movementId === movementId || ids.has(entry.exerciseId));
      if (!match) continue;
      let best = null;
      for (const set of entry.sets || []) {
        if (set?.setType === 'warmup') continue;
        if (!set?.done && set?.done !== undefined) continue;
        const kg = Number(set?.kg) || 0;
        const reps = Number(set?.reps) || 0;
        if (kg <= 0 || reps <= 0) continue;
        const e1rm = _estimateSet1RM(set);
        if (!best || e1rm > best.e1rm) best = { kg, reps, e1rm: Math.round(e1rm * 10) / 10 };
      }
      if (best) points.push({ dateKey: date, exerciseId: entry.exerciseId || null, movementId: entry.movementId || movementId || null, track: _entryTrack(entry, best), ...best });
    }
  }
  return points.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildBenchmarkActuals({ cache = {}, exList = [], benchmark = null, movementId = null, exerciseId = null, todayKey = null, track = null } = {}) {
  const target = benchmark || { movementId, exerciseId };
  const points = _actuals(cache, exList, target, todayKey);
  const normalizedTrack = track === 'H' || track === 'M' ? track : null;
  return normalizedTrack ? points.filter(p => p?.track === normalizedTrack) : points;
}

export function overlayCurrentWorkoutDay(cache = {}, todayKey = null, currentExercises = null) {
  if (!todayKey || !Array.isArray(currentExercises)) return cache || {};
  return {
    ...(cache || {}),
    [todayKey]: {
      ...((cache || {})[todayKey] || {}),
      exercises: currentExercises,
    },
  };
}

function _weekActual(actuals = [], weekStartKey, todayKey = null) {
  const weekEndKey = _addDaysKey(weekStartKey, 7);
  return (actuals || [])
    .filter(p => p?.dateKey >= weekStartKey && p.dateKey < weekEndKey && (!todayKey || p.dateKey <= todayKey))
    .sort((a, b) => (Number(b.e1rm) || 0) - (Number(a.e1rm) || 0) || (Number(b.kg) || 0) - (Number(a.kg) || 0))[0] || null;
}

function _actualsOnOrAfter(actuals = [], startDate = null) {
  if (!startDate) return actuals || [];
  return (actuals || []).filter(p => p?.dateKey >= startDate);
}

function _actualsBefore(actuals = [], startDate = null) {
  if (!startDate) return [];
  return (actuals || []).filter(p => p?.dateKey < startDate);
}

export function _trackWeekStatus(benchmark, row, planned, track, snapshot) {
  const todayKey = snapshot?.todayKey || null;
  const actual = _weekActual(benchmark?.actuals || [], row?.dateKey, todayKey);
  const plannedKg = Number(planned?.plannedKg) || 0;
  const targetReps = Number(planned?.targetReps) || Number(planned?.startReps) || _targetRepsForTrack(track);
  const isFuture = todayKey && row?.dateKey > todayKey;
  if (isFuture) return { state: 'future', label: '예정', actual: null };
  if (!actual) {
    if (row?.week < snapshot?.weekIndex) return { state: 'missed', label: '계획 미수행', actual: null };
    return { state: 'challenge', label: '도전 전', actual: null };
  }
  const kg = Number(actual.kg) || 0;
  const reps = Number(actual.reps) || 0;
  const kgOk = kg >= plannedKg;
  const repsOk = reps >= targetReps;
  if (kgOk && repsOk) {
    const over = kg > plannedKg || reps > targetReps;
    return { state: over ? 'over' : 'done', label: `${over ? '초과' : '달성'} ${kg}×${reps}`, actual };
  }
  const miss = kg < plannedKg
    ? `${Math.round((kg - plannedKg) * 10) / 10}kg`
    : `${reps - targetReps}회`;
  return { state: 'behind', label: `${miss} 미달`, actual };
}

function _schedule(cycle) {
  const start = new Date(`${cycle?.startDate}T00:00:00`);
  const weeks = Math.max(1, Number(cycle?.weeks) || 6);
  const normalized = normalizeMaxCycleTracks(cycle);
  const benchmarks = Array.isArray(normalized?.benchmarks) ? normalized.benchmarks : [];
  if (Number.isNaN(start.getTime()) || !benchmarks.length) return [];
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    const key = _keyFromDate(d);
    return {
      week: i + 1,
      dateKey: key,
      cells: benchmarks.map(b => ({
        benchmarkId: b.id,
        movementId: b.movementId,
        exerciseId: b.exerciseId || null,
        plannedByTrack: {
          M: predictBenchmarkProgression(b, normalized, key, 'M'),
          H: predictBenchmarkProgression(b, normalized, key, 'H'),
        },
      })),
    };
  });
}

export function buildMaxCycleSnapshot({ cycle = null, cache = {}, exList = [], todayKey = null } = {}) {
  if (!cycle || !Array.isArray(cycle.benchmarks)) return null;
  const weekIndex = _weekIndex(cycle, todayKey);
  const weeks = Math.max(1, Number(cycle.weeks) || 6);
  const normalized = normalizeMaxCycleTracks(cycle);
  const requestedTrack = cycle.todayTrack === 'M' || cycle.todayTrack === 'H' ? cycle.todayTrack : (weekIndex % 2 === 0 ? 'H' : 'M');
  const hasAnyIntensity = (normalized.benchmarks || []).some(b => isMaxTrackEnabled(b, 'H'));
  const track = requestedTrack === 'H' && !hasAnyIntensity ? 'M' : requestedTrack;
  const todayTracks = todayKey && cycle.todayTracks?.[todayKey] ? cycle.todayTracks[todayKey] : {};
  const benchmarks = normalized.benchmarks.map(b => {
    const requestedActiveTrack = todayTracks?.[b.id] === 'H' || todayTracks?.[b.id] === 'M'
      ? todayTracks[b.id]
      : (b.defaultTrack === 'H' || b.defaultTrack === 'M' ? b.defaultTrack : track);
    const activeTrack = requestedActiveTrack === 'H' && !isMaxTrackEnabled(b, 'H') ? 'M' : requestedActiveTrack;
    const planned = predictBenchmarkProgression(b, normalized, todayKey, activeTrack);
    const plannedByTrack = {
      M: predictBenchmarkProgression(b, normalized, todayKey, 'M'),
      H: predictBenchmarkProgression(b, normalized, todayKey, 'H'),
    };
    const allActuals = buildBenchmarkActuals({ cache, exList, benchmark: b, todayKey });
    const actuals = _actualsOnOrAfter(allActuals, normalized.startDate);
    const baselineActuals = _actualsBefore(allActuals, normalized.startDate);
    const hasRegisteredExercise = b.exerciseId
      ? !!(exList || []).some(ex => ex?.id === b.exerciseId)
      : !!(exList || []).some(ex => ex?.movementId === b.movementId);
    const latest = actuals[actuals.length - 1] || null;
    const baselineLatest = baselineActuals[baselineActuals.length - 1] || null;
    const delta = latest ? Math.round((latest.kg - planned.plannedKg) * 10) / 10 : null;
    const actualPct = latest && planned.targetKg > planned.startKg
      ? Math.max(0, Math.min(100, Math.round(((latest.kg - planned.startKg) / (planned.targetKg - planned.startKg)) * 100)))
      : null;
    return { ...b, activeTrack, availableTracks: maxBenchmarkTrackList(b), planned, plannedByTrack, actuals, baselineActuals, baselineLatest, latest, delta, actualPct, onPlan: delta === null ? null : delta >= 0, hasRegisteredExercise };
  });
  const actualProgressVals = benchmarks
    .map(b => b.actualPct)
    .filter(v => Number.isFinite(Number(v)));
  const actualProgressPct = actualProgressVals.length
    ? Math.round(actualProgressVals.reduce((sum, v) => sum + Number(v), 0) / actualProgressVals.length)
    : null;
  return {
    id: cycle.id,
    status: cycle.status || 'active',
    framework: cycle.framework || 'dual_track_progression_v2',
    startDate: cycle.startDate,
    weeks,
    weekIndex,
    progressPct: Math.round((weekIndex / weeks) * 100),
    actualProgressPct,
    track,
    benchmarks,
    schedule: _schedule(cycle),
    completed: benchmarks.filter(b => b.latest && b.latest.kg >= b.planned.plannedKg).length,
    total: benchmarks.length,
    todayKey,
  };
}

export function detectPlateau(points = [], { weeks = 2 } = {}) {
  const recent = (points || []).slice(-Math.max(2, weeks));
  if (recent.length < Math.max(2, weeks)) return { plateau: false };
  const first = Number(recent[0]?.e1rm) || 0;
  const last = Number(recent[recent.length - 1]?.e1rm) || 0;
  return { plateau: first > 0 && last <= first * 1.005, first, last };
}

function _pickMovement(major, movements) {
  const preferred = DEFAULT_BENCHMARK_BY_MAJOR[major];
  return (movements || []).find(m => _benchmarkMovementId(m) === preferred)
    || (movements || []).find(m => _benchmarkPrimary(m) === major && ['barbell', 'dumbbell', 'machine', 'cable', 'smith'].includes(m.equipment_category))
    || (movements || []).find(m => _benchmarkPrimary(m) === major)
    || null;
}

export function createDefaultMaxCycle({
  todayKey,
  majors = [],
  movements = [],
  currentGymId = null,
  allowFallback = true,
} = {}) {
  const normalizedMajors = [...new Set((majors || []).filter(Boolean))];
  const fallback = ['chest', 'back', 'lower', 'shoulder', 'bicep'];
  const targetMajors = (normalizedMajors.length ? normalizedMajors : (allowFallback ? fallback : [])).slice(0, 8);
  const startDate = _weekStartKey(todayKey || _keyFromDate(new Date()));
  const benchmarks = targetMajors.map(major => {
    const mov = _pickMovement(major, movements);
    const movementId = _benchmarkMovementId(mov);
    const exerciseId = _benchmarkExerciseId(mov);
    const defaults = mov?.benchmarkDefaults && typeof mov.benchmarkDefaults === 'object' ? mov.benchmarkDefaults : null;
    const fallbackStart = major === 'lower' ? 100 : (major === 'back' ? 60 : (major === 'shoulder' ? 25 : 40));
    const step = Number(defaults?.incrementKg) > 0 ? Number(defaults.incrementKg) : (Number(mov?.stepKg) > 0 ? Number(mov.stepKg) : 2.5);
    const startKg = Number(defaults?.startKg) > 0 ? Number(defaults.startKg) : fallbackStart;
    const targetKg = Number(defaults?.targetKg) > 0 ? Number(defaults.targetKg) : startKg + _kgStepForMajor(major);
    const primaryMajor = _benchmarkPrimary(mov) || major;
    const defaultTracks = {
      M: { startKg, targetKg, incrementKg: step, startReps: 12, targetReps: 12, enabled: true },
      H: {
        startKg: _roundKg(startKg + step * 2, step),
        targetKg: _roundKg(targetKg + step * 2, step),
        incrementKg: step,
        startReps: 8,
        targetReps: 6,
        enabled: true,
      },
    };
    const tracks = defaults?.tracks && !Array.isArray(defaults.tracks)
      ? {
        M: { ...defaultTracks.M, ...(defaults.tracks.M || {}) },
        H: { ...defaultTracks.H, ...(defaults.tracks.H || {}) },
      }
      : defaultTracks;
    if (isMaxVolumeOnlyMajor(primaryMajor)) {
      tracks.M = { ...tracks.M, enabled: true };
      tracks.H = { ...tracks.H, enabled: false };
    }
    return {
      id: `bm_${major}_${exerciseId || movementId || 'custom'}`,
      exerciseId,
      movementId,
      label: mov?.nameKo || mov?.name || MAJOR_LABEL[major] || major,
      primaryMajor,
      ...(isMaxVolumeOnlyMajor(primaryMajor) ? { defaultTrack: 'M' } : {}),
      benchmarkSource: defaults?.source || null,
      benchmarkSourceLabel: defaults?.sourceLabel || null,
      tracks,
      startKg,
      startReps: 12,
      targetKg,
      targetReps: 12,
      incrementKg: step,
    };
  }).filter(b => b.exerciseId || b.movementId);
  return {
    id: `max_cycle_${startDate.replaceAll('-', '')}`,
    status: 'draft',
    framework: 'dual_track_progression_v2',
    startDate,
    weeks: 6,
    primaryGymId: currentGymId || null,
    weeklyVolumeTarget: { chest: 12, back: 14, lower: 12, shoulder: 10, glute: 8, bicep: 8, tricep: 8, abs: 8 },
    benchmarks,
    rotatePolicy: { enabled: true, plateauWeeks: 2, minVolumeKept: 0.7 },
    goal: 'hypertrophy',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function buildRenderedMaxCycleSnapshot({ cycle, cache, exList, todayKey }) {
  return buildMaxCycleSnapshot({ cycle, cache, exList, todayKey });
}

// ================================================================
// 정산(6주 1회 성장) — 순수 헬퍼
//   규칙: 성장은 정산 시점에만 일어나고, 성장폭은 사용자가 설정한
//   증량폭(트랙별 incrementKg / 웬들러 TM incrementKg) 그대로다.
//   실측이 계획 미달(onPlan !== true)인 벤치마크는 '유지'가 기본.
// ================================================================

function _plus(kg, delta) {
  return Math.round(((Number(kg) || 0) + (Number(delta) || 0)) * 10) / 10;
}

export function maxBenchmarkProgram(benchmark = {}) {
  return benchmark?.program === 'wendler' ? 'wendler' : 'linear';
}

/**
 * 정산 결과 계산 (저장 없음).
 * @returns {{ rows: Array, grown: number, held: number }}
 */
export function buildMaxCycleSettleResult(cycle, snapshot, { decisions = {} } = {}) {
  const normalized = normalizeMaxCycleTracks(cycle) || {};
  const snapshotRows = new Map((snapshot?.benchmarks || []).map(b => [b.id, b]));
  const rows = (normalized.benchmarks || []).map(base => {
    const snap = snapshotRows.get(base.id) || null;
    const program = maxBenchmarkProgram(base);
    const requested = decisions[base.id];
    const decision = requested === 'grow' || requested === 'hold'
      ? requested
      : (snap?.onPlan === true ? 'grow' : 'hold');
    const tracks = {};
    for (const track of ['M', 'H']) {
      const spec = _trackSpec(base, track);
      const incrementKg = Number(spec.incrementKg) > 0 ? Number(spec.incrementKg) : 2.5;
      const delta = decision === 'grow' ? incrementKg : 0;
      tracks[track] = {
        ...spec,
        incrementKg,
        before: Number(spec.startKg) || 0,
        startKg: _plus(spec.startKg, delta),
        targetKg: _plus(spec.targetKg, delta),
      };
    }
    let wendler = null;
    if (program === 'wendler' && base.wendler && typeof base.wendler === 'object') {
      const incrementKg = Number(base.wendler.incrementKg) > 0
        ? Number(base.wendler.incrementKg)
        : tracks.M.incrementKg;
      const delta = decision === 'grow' ? incrementKg : 0;
      const isOriginal = base.wendler.templateVersion === W863_ORIGINAL_VERSION;
      const before = Number(isOriginal ? base.wendler.oneRmKg : base.wendler.tmKg) || 0;
      const after = _plus(before, delta);
      wendler = {
        ...base.wendler,
        incrementKg,
        before,
        ...(isOriginal
          ? { oneRmKg: after, tmKg: Math.round(after * 0.9 * 10) / 10 }
          : { tmKg: after }),
      };
    }
    const representative = wendler
      ? { kind: wendler.templateVersion === W863_ORIGINAL_VERSION ? 'oneRm' : 'tm', before: wendler.before, after: wendler.templateVersion === W863_ORIGINAL_VERSION ? wendler.oneRmKg : wendler.tmKg, incrementKg: wendler.incrementKg }
      : { kind: 'startKg', before: tracks.M.before, after: tracks.M.startKg, incrementKg: tracks.M.incrementKg };
    return {
      id: base.id,
      label: base.label || base.movementId || '벤치마크',
      primaryMajor: base.primaryMajor || 'custom',
      program,
      decision,
      onPlan: snap?.onPlan ?? null,
      latest: snap?.latest || null,
      representative,
      tracks,
      wendler,
    };
  });
  return {
    rows,
    grown: rows.filter(r => r.decision === 'grow').length,
    held: rows.filter(r => r.decision === 'hold').length,
  };
}

/** 사이클 히스토리 보존용 요약 엔트리 (Firestore _settings.max_cycle_history 원소). */
export function buildMaxCycleHistoryEntry(cycle, settleResult, { settledAt = 0, todayKey = null } = {}) {
  return {
    cycleId: cycle?.id || null,
    startDate: cycle?.startDate || null,
    endDate: todayKey,
    weeks: Math.max(1, Number(cycle?.weeks) || 6),
    settledAt: Number(settledAt) || 0,
    grown: settleResult?.grown || 0,
    held: settleResult?.held || 0,
    benchmarks: (settleResult?.rows || []).map(r => ({
      id: r.id,
      movementId: (cycle?.benchmarks || []).find(b => b.id === r.id)?.movementId || null,
      label: r.label,
      primaryMajor: r.primaryMajor,
      program: r.program,
      decision: r.decision,
      representative: r.representative,
      latest: r.latest ? { kg: r.latest.kg, reps: r.latest.reps, dateKey: r.latest.dateKey } : null,
    })),
  };
}

/** 정산 결과로 다음 사이클 생성 (벤치마크 id/연결 종목/설정 보존, 당일 상태 초기화). */
export function buildNextMaxCycleFromSettle(cycle, settleResult, { todayKey, now = 0 } = {}) {
  const normalized = normalizeMaxCycleTracks(cycle) || {};
  const rowById = new Map((settleResult?.rows || []).map(r => [r.id, r]));
  const startDate = _weekStartKey(_addDaysKey(todayKey || normalized.startDate, 7));
  const benchmarks = (normalized.benchmarks || []).map(base => {
    const row = rowById.get(base.id);
    if (!row) return base;
    const tracks = {
      M: { ...(base.tracks?.M || {}), startKg: row.tracks.M.startKg, targetKg: row.tracks.M.targetKg, incrementKg: row.tracks.M.incrementKg },
      H: { ...(base.tracks?.H || {}), startKg: row.tracks.H.startKg, targetKg: row.tracks.H.targetKg, incrementKg: row.tracks.H.incrementKg },
    };
    return {
      ...base,
      tracks,
      startKg: tracks.M.startKg,
      targetKg: tracks.M.targetKg,
      incrementKg: tracks.M.incrementKg,
      ...(row.wendler ? { wendler: {
        ...base.wendler,
        tmKg: row.wendler.tmKg,
        ...(row.wendler.templateVersion === W863_ORIGINAL_VERSION ? { oneRmKg: row.wendler.oneRmKg } : {}),
        incrementKg: row.wendler.incrementKg,
      } } : {}),
    };
  });
  const next = { ...normalized };
  delete next.todayOverrides;
  delete next.todayTracks;
  delete next.todayTrack;
  delete next.nextSeed;
  delete next.completedAt;
  return {
    ...next,
    id: `max_cycle_${String(startDate).replaceAll('-', '')}`,
    status: 'active',
    startDate,
    weeks: Math.max(1, Number(normalized.weeks) || 6),
    benchmarks,
    createdAt: Number(now) || 0,
    updatedAt: Number(now) || 0,
  };
}

/**
 * 히스토리 → 벤치마크별 성장 계단 시리즈.
 * 각 포인트 = 사이클 1개 (정산 1회). 마지막에 현재 사이클 + 예약 성장 점 추가.
 */
export function buildMaxGrowthStairs(history = [], cycle = null, { maxPoints = 6 } = {}) {
  const normalized = cycle ? normalizeMaxCycleTracks(cycle) : null;
  const series = new Map();
  const push = (key, point, meta) => {
    if (!series.has(key)) series.set(key, { id: key, label: meta.label, primaryMajor: meta.primaryMajor, points: [] });
    const lane = series.get(key);
    lane.label = meta.label || lane.label;
    lane.points.push(point);
  };
  for (const entry of history || []) {
    for (const b of entry?.benchmarks || []) {
      const key = b.movementId || b.id;
      if (!key) continue;
      push(key, {
        kind: 'settled',
        kg: Number(b.representative?.before) || 0,
        afterKg: Number(b.representative?.after) || 0,
        decision: b.decision,
        incrementKg: Number(b.representative?.incrementKg) || 0,
        settledAt: entry.settledAt || 0,
        startDate: entry.startDate || null,
        endDate: entry.endDate || null,
      }, { label: b.label, primaryMajor: b.primaryMajor });
    }
  }
  for (const b of normalized?.benchmarks || []) {
    const key = b.movementId || b.id;
    if (!key) continue;
    const program = maxBenchmarkProgram(b);
    const spec = _trackSpec(b, 'M');
    const representativeKg = program === 'wendler'
      ? (Number(b.wendler?.templateVersion === W863_ORIGINAL_VERSION ? b.wendler?.oneRmKg : b.wendler?.tmKg) || 0)
      : (Number(spec.startKg) || 0);
    const incrementKg = program === 'wendler'
      ? (Number(b.wendler?.incrementKg) > 0 ? Number(b.wendler.incrementKg) : (Number(spec.incrementKg) || 2.5))
      : (Number(spec.incrementKg) > 0 ? Number(spec.incrementKg) : 2.5);
    push(key, {
      kind: 'current',
      kg: representativeKg,
      afterKg: _plus(representativeKg, incrementKg),
      incrementKg,
      startDate: normalized.startDate || null,
    }, { label: b.label, primaryMajor: b.primaryMajor });
  }
  return [...series.values()].map(lane => ({
    ...lane,
    points: lane.points.slice(-Math.max(2, maxPoints)),
  }));
}
