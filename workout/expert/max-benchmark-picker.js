// ================================================================
// workout/expert/max-benchmark-picker.js
// 테스트모드 "오늘 벤치마크"와 운동 추가 picker의 단일 resolver.
// ================================================================

import { SUBPATTERN_TO_MAJOR } from '../../calc.js';
import {
  buildMaxCycleSnapshot,
  createDefaultMaxCycle,
  normalizeMaxCycleTracks,
  predictBenchmarkProgression,
  resolveBenchmarkExercise,
} from './max-cycle-core.js';

export function normalizeMaxPickerMajor(id) {
  if (!id) return null;
  if (id === 'chest_all') return 'chest';
  if (id === 'back_all') return 'back';
  return SUBPATTERN_TO_MAJOR[id] || (id === 'core' ? 'abs' : id);
}

export function cycleForMaxPickerMajors(cycle, majors = [], {
  todayKey = null,
  movements = [],
  currentGymId = null,
} = {}) {
  const normalized = normalizeMaxCycleTracks(cycle);
  const majorSet = new Set((majors || []).map(normalizeMaxPickerMajor).filter(Boolean));
  if (!majorSet.size) return normalized || null;

  const filtered = (normalized?.benchmarks || [])
    .filter(b => majorSet.has(normalizeMaxPickerMajor(b.primaryMajor)));
  if (filtered.length) return { ...normalized, benchmarks: filtered };

  return createDefaultMaxCycle({
    todayKey,
    majors: [...majorSet],
    movements,
    currentGymId,
    allowFallback: false,
  });
}

export function resolveMaxBenchmarkPickerItems({
  cycle = null,
  exList = [],
  selectedMajors = [],
  currentGymId = null,
  todayKey = null,
  cache = {},
  fallbackMovements = [],
} = {}) {
  const scopedCycle = Array.isArray(selectedMajors) && selectedMajors.length
    ? cycleForMaxPickerMajors(cycle, selectedMajors, { todayKey, movements: fallbackMovements, currentGymId })
    : normalizeMaxCycleTracks(cycle);
  if (!scopedCycle || !Array.isArray(scopedCycle.benchmarks)) return [];

  const snapshot = buildMaxCycleSnapshot({ cycle: scopedCycle, cache, exList, todayKey });
  const benchmarks = snapshot?.benchmarks || scopedCycle.benchmarks || [];
  const seen = new Set();
  const items = [];
  for (const benchmark of benchmarks) {
    const resolved = resolveBenchmarkExercise(benchmark, exList, { gymId: currentGymId });
    if (!resolved?.id || resolved.missing || seen.has(resolved.id)) continue;
    seen.add(resolved.id);
    items.push({
      exercise: {
        ...resolved,
        muscleId: resolved.muscleId || normalizeMaxPickerMajor(benchmark.primaryMajor) || null,
        muscleIds: Array.isArray(resolved.muscleIds) && resolved.muscleIds.length
          ? resolved.muscleIds
          : [normalizeMaxPickerMajor(benchmark.primaryMajor)].filter(Boolean),
        movementId: resolved.movementId || benchmark.movementId || null,
        name: resolved.name || benchmark.label || resolved.id,
      },
      benchmark,
      cycle: scopedCycle,
      snapshot,
    });
  }
  return items;
}

function _roundKg(kg) {
  const n = Number(kg) || 0;
  return Math.round(n * 10) / 10;
}

function _rirFromRpe(rpe) {
  const rir = Math.max(0, Math.min(9, 10 - (Number(rpe) || 8)));
  return Number.isInteger(rir) ? String(rir) : rir.toFixed(1);
}

function _gymTagForExercise(exercise = {}, currentGymId = null) {
  const tags = Array.isArray(exercise.gymTags) ? exercise.gymTags : [];
  if (tags.includes('*') || (!exercise.gymId && !exercise.primaryGymId && !tags.length)) return '*';
  return exercise.gymId || exercise.primaryGymId || tags.find(tag => tag && tag !== '*') || currentGymId || '*';
}

function _makeTrackPrescription({ benchmark, cycle, todayKey, track }) {
  const trackCode = track === 'H' ? 'H' : 'M';
  const planned = benchmark.plannedByTrack?.[trackCode]
    || (benchmark.activeTrack === trackCode ? benchmark.planned : null)
    || predictBenchmarkProgression(benchmark, cycle, todayKey, trackCode);
  const kg = _roundKg(planned?.plannedKg);
  const reps = Math.max(1, Number(planned?.targetReps) || (trackCode === 'H' ? 6 : 12));
  const targetSets = trackCode === 'H' ? 3 : 4;
  const targetRpe = trackCode === 'H' ? 9 : 8;
  const trackLabel = trackCode === 'H' ? '강도' : '볼륨';
  const sets = Array.from({ length: targetSets }, () => ({
    kg,
    reps,
    setType: 'main',
    done: false,
    rpe: targetRpe,
  }));
  return {
    label: `${trackLabel} 벤치마크 · ${targetSets}세트 x ${reps}회 · RIR ${_rirFromRpe(targetRpe)}`,
    week: planned?.week || 1,
    weeks: planned?.weeks || cycle?.weeks || 6,
    targetSets,
    repsLow: reps,
    repsHigh: reps,
    targetRpe,
    startKg: kg,
    action: 'benchmark',
    actionLabel: trackLabel,
    deltaKg: benchmark.delta ?? null,
    reason: '오늘 벤치마크 카드와 같은 계획값입니다.',
    transparency: {
      type: 'benchmark_cycle',
      label: '벤치마크 기준',
      detail: `오늘 계획 ${kg}kg x ${reps}회 x ${targetSets}세트`,
    },
    evidence: [
      { label: '성장판', value: `W${planned?.week || 1}/${planned?.weeks || cycle?.weeks || 6} · ${trackLabel} 트랙` },
      { label: '계획', value: `${kg}kg x ${reps}회 x ${targetSets}세트` },
    ],
    benchmarkTrack: trackCode,
    track: trackCode,
    sets,
  };
}

export function buildMaxBenchmarkPickerEntry({
  exercise = null,
  benchmark = null,
  cycle = null,
  todayKey = null,
  currentGymId = null,
  now = Date.now(),
} = {}) {
  if (!exercise?.id || !benchmark) return null;
  const normalizedCycle = normalizeMaxCycleTracks(cycle) || cycle || {};
  const activeTrack = benchmark.activeTrack === 'H' || benchmark.activeTrack === 'M'
    ? benchmark.activeTrack
    : (benchmark.defaultTrack === 'H' || benchmark.defaultTrack === 'M' ? benchmark.defaultTrack : 'M');
  const trackAlternatives = {
    M: _makeTrackPrescription({ benchmark, cycle: normalizedCycle, todayKey, track: 'M' }),
    H: _makeTrackPrescription({ benchmark, cycle: normalizedCycle, todayKey, track: 'H' }),
  };
  const prescription = {
    ...trackAlternatives[activeTrack],
    exerciseId: exercise.id,
    movementId: benchmark.movementId || exercise.movementId || null,
    benchmarkId: benchmark.id,
    weakTarget: false,
    lastDateKey: benchmark.latest?.dateKey || null,
    lastSet: benchmark.latest || null,
    trackAlternatives,
  };
  const gymTag = _gymTagForExercise(exercise, currentGymId);
  const primaryMajor = normalizeMaxPickerMajor(benchmark.primaryMajor || exercise.muscleId) || null;
  return {
    exerciseId: exercise.id,
    muscleId: exercise.muscleId || primaryMajor,
    name: exercise.name || benchmark.label || exercise.id,
    movementId: benchmark.movementId || exercise.movementId || null,
    recommendationMeta: {
      mode: 'max',
      id: `max:benchmark:${benchmark.id || exercise.id}`,
      kind: 'benchmark',
      reason: '오늘 벤치마크 카드에서 선택',
      userAction: 'accepted',
      acceptedAt: now,
      primaryMajor,
      subPattern: Array.isArray(exercise.muscleIds) ? (exercise.muscleIds[0] || null) : null,
      cycleId: normalizedCycle?.id || null,
      cycleWeek: prescription.week || null,
      track: activeTrack,
      gymScope: { sessionGymId: currentGymId || null, tag: gymTag },
    },
    gymTagAtTime: gymTag,
    maxWeakPart: null,
    maxPrescription: prescription,
    sets: prescription.sets || [],
  };
}
