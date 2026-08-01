import {
  SEASON_REGISTRY_SCHEMA_VERSION,
  addSeasonDays,
  assertSeasonRegistry,
  findSeasonById,
  findSeasonForDate,
  normalizeSeasonRegistry,
} from './season-model.js';
import {
  buildSeasonWorkoutBoard,
  buildSeasonWorkoutPlan,
} from '../workout/season-reset.js';
import { W863_ORIGINAL_VERSION } from '../workout/w863-original.js';

function _clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function normalizeSeasonRequestId(value) {
  const id = String(value || '').trim();
  if (!id) throw new TypeError('clientRequestId is required');
  return id.slice(0, 160);
}

function _generatedSeasonId(season, clientRequestId) {
  const requested = String(season?.id || '').trim();
  if (requested) return requested;
  const tail = String(clientRequestId).replace(/[^a-zA-Z0-9]/g, '').slice(-10) || Date.now().toString(36);
  return `season-${season.startDate}-${tail}`;
}

export function buildSeasonRunningPlan(seasonId, value = {}, metadata = {}) {
  const distance = Number(value.weeklyDistanceKm);
  const sessions = Number(value.weeklySessions);
  const duration = Number(value.optionalDurationMin);
  const baselineDistance = Number(value.baselineWeeklyDistanceKm);
  const longestRun = Number(value.longestRunKm);
  const speedSessions = Number(value.speedSessionsPerWeek);
  const raceDistance = Number(value.raceDistanceKm);
  const targetTime = Number(value.targetTimeMin);
  const targetPace = Number(value.targetPaceSecPerKm);
  const adaptiveRate = Number(value.adaptiveRatePct);
  const goalType = ['base', '5k', '10k', 'half', 'marathon'].includes(value.goalType)
    ? value.goalType
    : 'base';
  const completionGoal = value.completionGoal === 'time' ? 'time' : 'finish';
  const paceGoalMode = value.paceGoalMode === 'adaptive' ? 'adaptive' : 'fixed';
  return {
    schemaVersion: 2,
    seasonId,
    createdAt: metadata.createdAt ?? value.createdAt ?? Date.now(),
    ...(metadata.updatedAt ? { updatedAt: metadata.updatedAt } : {}),
    clientRequestId: metadata.clientRequestId ?? value.clientRequestId ?? null,
    goalType,
    completionGoal,
    eventName: String(value.eventName || '').trim().slice(0, 80),
    targetDate: String(value.targetDate || '').trim() || null,
    raceDistanceKm: Number.isFinite(raceDistance) && raceDistance > 0 ? Math.round(raceDistance * 100) / 100 : null,
    targetTimeMin: completionGoal === 'time' && Number.isFinite(targetTime) && targetTime > 0
      ? Math.round(targetTime)
      : null,
    paceGoalMode,
    targetPaceSecPerKm: Number.isFinite(targetPace) && targetPace >= 180 && targetPace <= 1200
      ? Math.round(targetPace)
      : null,
    adaptiveRatePct: paceGoalMode === 'adaptive' && Number.isFinite(adaptiveRate) && adaptiveRate > 0 && adaptiveRate <= 10
      ? Math.round(adaptiveRate * 10) / 10
      : null,
    baselineWeeklyDistanceKm: Number.isFinite(baselineDistance) && baselineDistance >= 0
      ? Math.round(baselineDistance * 10) / 10
      : null,
    weeklyDistanceKm: Number.isFinite(distance) && distance > 0 ? Math.round(distance * 10) / 10 : 20,
    weeklySessions: Number.isFinite(sessions) && sessions > 0 ? Math.round(sessions) : 3,
    longestRunKm: Number.isFinite(longestRun) && longestRun > 0 ? Math.round(longestRun * 10) / 10 : null,
    speedSessionsPerWeek: Number.isFinite(speedSessions) && speedSessions >= 0 ? Math.round(speedSessions) : 1,
    optionalDurationMin: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
  };
}

function _benchmarkExerciseKey(benchmark = {}) {
  return String(benchmark.exerciseId || benchmark.movementId || benchmark.id || '');
}

export function preserveSeasonBoardProgress(nextBoard = {}, previousBoard = {}) {
  const previousBenchmarks = new Map((previousBoard.benchmarks || []).map(benchmark => [
    _benchmarkExerciseKey(benchmark),
    benchmark,
  ]));
  const previousBenchmarkKeyById = new Map((previousBoard.benchmarks || []).map(benchmark => [
    benchmark.id,
    _benchmarkExerciseKey(benchmark),
  ]));
  const benchmarks = (nextBoard.benchmarks || []).map(benchmark => {
    const previous = previousBenchmarks.get(_benchmarkExerciseKey(benchmark));
    if (!previous) return benchmark;
    return {
      ...benchmark,
      ...(previous.wendlerLog ? { wendlerLog: _clone(previous.wendlerLog) } : {}),
    };
  });

  const previousSteps = new Map((previousBoard.steps || []).map(step => {
    const exerciseKey = previousBenchmarkKeyById.get(step.benchmarkId) || step.benchmarkId;
    return [`${exerciseKey}|${step.track}|${step.weekStart}`, step];
  }));
  const nextBenchmarkKeyById = new Map(benchmarks.map(benchmark => [benchmark.id, _benchmarkExerciseKey(benchmark)]));
  const steps = (nextBoard.steps || []).map(step => {
    const exerciseKey = nextBenchmarkKeyById.get(step.benchmarkId) || step.benchmarkId;
    const previous = previousSteps.get(`${exerciseKey}|${step.track}|${step.weekStart}`);
    if (!previous) return step;
    return {
      ...step,
      ...(previous.weekLog ? { weekLog: _clone(previous.weekLog) } : {}),
      ...(previous.state ? { state: previous.state } : {}),
    };
  });

  const previousCycles = new Map((previousBoard.cycles || []).map(cycle => [
    `${cycle.groupId}|${cycle.startDate}`,
    cycle,
  ]));
  const cycles = (nextBoard.cycles || []).map(cycle => {
    const previous = previousCycles.get(`${cycle.groupId}|${cycle.startDate}`);
    if (!previous) return cycle;
    return {
      ...cycle,
      ...(previous.status ? { status: previous.status } : {}),
      ...(previous.settledAt ? { settledAt: previous.settledAt } : {}),
    };
  });

  return {
    ...nextBoard,
    benchmarks,
    steps,
    cycles,
    lineups: _clone(previousBoard.lineups || nextBoard.lineups || {}),
    history: _clone(previousBoard.history || nextBoard.history || []),
    createdAt: previousBoard.createdAt ?? nextBoard.createdAt,
    updatedAt: Date.now(),
  };
}

export function prepareWorkoutSeasonCreation({
  season: rawSeason,
  clientRequestId: rawRequestId,
  registry = { schemaVersion: 2, seasons: [] },
  previousBoard = null,
  registeredExercises = [],
  registeredExerciseIds = [],
  selectedExerciseIds = null,
  benchmarkMappings = {},
  overrides = {},
  weeklySessionTarget = 3,
  runningPlan = {},
  createdAt = Date.now(),
} = {}) {
  const clientRequestId = normalizeSeasonRequestId(rawRequestId);
  const season = {
    ...rawSeason,
    id: _generatedSeasonId(rawSeason || {}, clientRequestId),
    exerciseIds: [...new Set((Array.isArray(rawSeason?.exerciseIds)
      ? rawSeason.exerciseIds
      : Array.isArray(selectedExerciseIds) ? selectedExerciseIds : [])
      .map(exerciseId => String(exerciseId || '').trim())
      .filter(Boolean))].sort(),
    createdAt,
    sourceVersion: W863_ORIGINAL_VERSION,
    clientRequestId,
  };
  const existing = normalizeSeasonRegistry(registry).seasons.find(item => item.clientRequestId === clientRequestId);
  if (existing) return { duplicate: true, season: existing };
  const nextRegistry = assertSeasonRegistry({
    ...registry,
    schemaVersion: SEASON_REGISTRY_SCHEMA_VERSION,
    seasons: [...normalizeSeasonRegistry(registry).seasons, season],
  });
  const createdFromSeason = findSeasonForDate(registry, addSeasonDays(season.startDate, -1));
  // 종목별 기간은 정규화(시즌 범위로 클램프)된 값을 보드에 넘긴다.
  const normalizedSeason = nextRegistry.seasons.find(item => item.id === season.id) || season;
  const board = buildSeasonWorkoutBoard({
    previousBoard,
    seasonId: season.id,
    startDate: season.startDate,
    registeredExercises,
    selectedExerciseIds,
    benchmarkMappings,
    overrides,
    exerciseWindows: normalizedSeason.exerciseWindows || {},
    createdAt,
  });
  const workoutPlan = buildSeasonWorkoutPlan({
    season,
    board,
    registeredExerciseIds,
    weeklySessionTarget,
    createdFromSeasonId: createdFromSeason?.id || null,
    clientRequestId,
    createdAt,
  });
  return {
    duplicate: false,
    season: findSeasonById(nextRegistry, season.id),
    registry: nextRegistry,
    board,
    workoutPlan,
    runningPlan: buildSeasonRunningPlan(season.id, runningPlan, { createdAt, clientRequestId }),
  };
}

export function prepareWorkoutSeasonUpdate({
  season: rawSeason,
  registry = { schemaVersion: 2, seasons: [] },
  previousBoard = null,
  existingWorkoutPlan = null,
  existingRunningPlan = null,
  registeredExercises = [],
  registeredExerciseIds = [],
  selectedExerciseIds = null,
  benchmarkMappings = {},
  overrides = {},
  weeklySessionTarget = 3,
  runningPlan = {},
  updatedAt = Date.now(),
} = {}) {
  const seasonId = String(rawSeason?.id || '').trim();
  const current = findSeasonById(registry, seasonId);
  if (!current) throw new RangeError('season not found');
  const season = {
    ...current,
    ...rawSeason,
    id: current.id,
    createdAt: current.createdAt,
    clientRequestId: current.clientRequestId,
    sourceVersion: current.sourceVersion || W863_ORIGINAL_VERSION,
    updatedAt,
    exerciseIds: [...new Set((Array.isArray(rawSeason?.exerciseIds)
      ? rawSeason.exerciseIds
      : Array.isArray(selectedExerciseIds) ? selectedExerciseIds : current.exerciseIds || [])
      .map(exerciseId => String(exerciseId || '').trim())
      .filter(Boolean))].sort(),
  };
  const nextRegistry = assertSeasonRegistry({
    ...registry,
    schemaVersion: SEASON_REGISTRY_SCHEMA_VERSION,
    seasons: normalizeSeasonRegistry(registry).seasons.map(item => item.id === seasonId ? season : item),
  });
  const normalizedSeason = nextRegistry.seasons.find(item => item.id === seasonId) || season;
  const rebuiltBoard = buildSeasonWorkoutBoard({
    previousBoard,
    seasonId,
    startDate: season.startDate,
    registeredExercises,
    selectedExerciseIds,
    benchmarkMappings,
    overrides,
    exerciseWindows: normalizedSeason.exerciseWindows || {},
    createdAt: previousBoard?.createdAt ?? current.createdAt ?? updatedAt,
  });
  const board = preserveSeasonBoardProgress(rebuiltBoard, previousBoard || {});
  const workoutPlan = buildSeasonWorkoutPlan({
    season,
    board,
    registeredExerciseIds,
    weeklySessionTarget,
    createdFromSeasonId: existingWorkoutPlan?.createdFromSeasonId || null,
    clientRequestId: current.clientRequestId || existingWorkoutPlan?.clientRequestId || null,
    createdAt: existingWorkoutPlan?.createdAt || current.createdAt || updatedAt,
  });
  workoutPlan.updatedAt = updatedAt;
  return {
    season: findSeasonById(nextRegistry, seasonId),
    registry: nextRegistry,
    board,
    workoutPlan,
    runningPlan: buildSeasonRunningPlan(seasonId, { ...existingRunningPlan, ...runningPlan }, {
      createdAt: existingRunningPlan?.createdAt || current.createdAt || updatedAt,
      updatedAt,
      clientRequestId: current.clientRequestId || existingRunningPlan?.clientRequestId || null,
    }),
  };
}
