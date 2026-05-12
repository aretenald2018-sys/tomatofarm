// ================================================================
// workout/expert/max-cycle.js
// 테스트모드 v2 — 6주 성장판 렌더/사이클 helper
// ================================================================

export function _esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }

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
  return { ...legacy[key], ...(tracks[key] || {}) };
}

export function normalizeMaxCycleTracks(cycle) {
  if (!cycle || !Array.isArray(cycle.benchmarks)) return cycle;
  return {
    ...cycle,
    benchmarks: cycle.benchmarks.map(b => {
      const m = _trackSpec(b, 'M');
      const h = _trackSpec(b, 'H');
      return {
        ...b,
        tracks: { M: m, H: h },
        startKg: m.startKg,
        targetKg: m.targetKg,
        incrementKg: m.incrementKg,
        startReps: m.startReps,
        targetReps: m.targetReps,
      };
    }),
  };
}

export function _shortDate(key) {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key || '';
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
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

export function _benchmarkOptionValue(item) {
  const exerciseId = _benchmarkExerciseId(item);
  if (exerciseId) return exerciseId;
  const movementId = _benchmarkMovementId(item);
  return movementId ? `movement:${movementId}` : '';
}

function _benchmarkOptionGroupKey(item) {
  if (item?.benchmarkOptionKey) return item.benchmarkOptionKey;
  const movementId = _benchmarkMovementId(item);
  const category = item?.equipment_category || '';
  const tags = Array.isArray(item?.gymTags) ? item.gymTags : [];
  const shared = ['barbell', 'dumbbell', 'bodyweight'].includes(category) || tags.includes('*');
  if (movementId && shared) return `shared:${movementId}`;
  const gymKey = item?.gymId || item?.primaryGymId || tags.find(tag => tag && tag !== '*') || (shared ? '*' : 'ungrouped');
  if (movementId) return `gym:${gymKey}:${movementId}`;
  const nameKey = String(item?.nameKo || item?.name || item?.id || '').trim().toLowerCase();
  return `custom:${gymKey}:${nameKey}`;
}

function _benchmarkOptionRank(item) {
  const sourceScore = ({ exact: 3, legacy: 2, empty: 1 })[item?.benchmarkDefaults?.source] || 0;
  const sessions = Number(item?.benchmarkDefaults?.sessions) || 0;
  return sourceScore * 1000 + sessions * 20 + (_benchmarkExerciseId(item) ? 1 : 0);
}

export function _dedupeBenchmarkOptions(items = []) {
  const grouped = new Map();
  for (const item of items || []) {
    const key = _benchmarkOptionGroupKey(item);
    const current = grouped.get(key);
    if (!current || _benchmarkOptionRank(item) > _benchmarkOptionRank(current)) grouped.set(key, item);
  }
  return [...grouped.values()];
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
      if (best) points.push({ dateKey: date, ...best });
    }
  }
  return points.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function _weekActual(actuals = [], weekStartKey, todayKey = null) {
  const weekEndKey = _addDaysKey(weekStartKey, 7);
  return (actuals || [])
    .filter(p => p?.dateKey >= weekStartKey && p.dateKey < weekEndKey && (!todayKey || p.dateKey <= todayKey))
    .sort((a, b) => (Number(b.e1rm) || 0) - (Number(a.e1rm) || 0) || (Number(b.kg) || 0) - (Number(a.kg) || 0))[0] || null;
}

export function _trackWeekStatus(benchmark, row, planned, track, snapshot) {
  const todayKey = snapshot?.todayKey || null;
  const actual = _weekActual(benchmark?.actuals || [], row?.dateKey, todayKey);
  const plannedKg = Number(planned?.plannedKg) || 0;
  const targetReps = Number(planned?.targetReps) || Number(planned?.startReps) || _targetRepsForTrack(track);
  const isFuture = todayKey && row?.dateKey > todayKey;
  if (isFuture) return { state: 'future', label: '예정', actual: null };
  if (!actual) {
    if (row?.week < snapshot?.weekIndex) return { state: 'missed', label: '미수행', actual: null };
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
  const track = cycle.todayTrack === 'M' || cycle.todayTrack === 'H' ? cycle.todayTrack : (weekIndex % 2 === 0 ? 'H' : 'M');
  const todayTracks = todayKey && cycle.todayTracks?.[todayKey] ? cycle.todayTracks[todayKey] : {};
  const normalized = normalizeMaxCycleTracks(cycle);
  const benchmarks = normalized.benchmarks.map(b => {
    const activeTrack = todayTracks?.[b.id] === 'H' || todayTracks?.[b.id] === 'M'
      ? todayTracks[b.id]
      : (b.defaultTrack === 'H' || b.defaultTrack === 'M' ? b.defaultTrack : track);
    const planned = predictBenchmarkProgression(b, normalized, todayKey, activeTrack);
    const plannedByTrack = {
      M: predictBenchmarkProgression(b, normalized, todayKey, 'M'),
      H: predictBenchmarkProgression(b, normalized, todayKey, 'H'),
    };
    const actuals = _actuals(cache, exList, b, todayKey);
    const hasRegisteredExercise = b.exerciseId
      ? !!(exList || []).some(ex => ex?.id === b.exerciseId)
      : !!(exList || []).some(ex => ex?.movementId === b.movementId);
    const latest = actuals[actuals.length - 1] || null;
    const delta = latest ? Math.round((latest.kg - planned.plannedKg) * 10) / 10 : null;
    const actualPct = latest && planned.targetKg > planned.startKg
      ? Math.max(0, Math.min(100, Math.round(((latest.kg - planned.startKg) / (planned.targetKg - planned.startKg)) * 100)))
      : null;
    return { ...b, activeTrack, planned, plannedByTrack, actuals, latest, delta, actualPct, onPlan: delta === null ? null : delta >= 0, hasRegisteredExercise };
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
    return {
      id: `bm_${major}_${exerciseId || movementId || 'custom'}`,
      exerciseId,
      movementId,
      label: mov?.nameKo || mov?.name || MAJOR_LABEL[major] || major,
      primaryMajor: _benchmarkPrimary(mov) || major,
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
