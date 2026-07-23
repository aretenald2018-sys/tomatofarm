// ================================================================
// workout/test-v2/board-core.js — 테스트모드 v2 "성장 보드" 순수 로직
// ----------------------------------------------------------------
// 계획: docs/ai/features/2026-06-12-test-mode-v2-board.md (계약 1~13)
// DOM/Firebase 접근 금지 — node:test 단위 테스트 대상.
// 데이터는 _settings.test_board_v2 한 키에 통째로 저장(저장은 data.js 경유,
// 호출부 책임). 이 모듈은 board 객체를 받아 변형/파생만 한다.
//
// 핵심 모델:
//   board.benchmarks[].seed[track] = { kg, reps }  ← 트랙의 "현재 대표 무게"
//   board.steps[]   = 보드 칸(스텝). 같은 처방이 span 주 동안 병합.
//   기본 계획 = 사이클당 1스텝(6주 유지) + 정산 성장폭(상체 2.5/하체 10)
//   웬들러 벤치마크는 스텝 없이 wendler 설정에서 주차 처방 파생.
// ================================================================

import {
  normalizeWendlerConfig,
  wendlerWeekPrescription,
  WENDLER_SCHEMES,
  defaultWendlerIncrement,
  isWendlerAllowedMajor,
  roundToPlate,
} from './wendler.js';
import { W863_ORIGINAL_VERSION } from '../w863-original.js';

export { roundToPlate, isWendlerAllowedMajor };

// ----------------------------------------------------------------
// 상수
// ----------------------------------------------------------------

export const TM2_DEFAULTS = { incrementUpperKg: 2.5, incrementLowerKg: 10 };

export const TM2_GROUPS = [
  { id: 'chest',    label: '가슴', bodyRegion: 'upper', majors: ['chest'],            order: 0 },
  { id: 'back',     label: '등',   bodyRegion: 'upper', majors: ['back'],             order: 1 },
  { id: 'shoulder', label: '어깨', bodyRegion: 'upper', majors: ['shoulder'],         order: 2 },
  { id: 'lower',    label: '하체', bodyRegion: 'lower', majors: ['lower', 'glute'],   order: 3 },
  { id: 'arm',      label: '팔',   bodyRegion: 'upper', majors: ['bicep', 'tricep'],  order: 4 },
  { id: 'abs',      label: '복부', bodyRegion: 'upper', majors: ['abs'],              order: 5 },
];

export const TM2_TRACKS = ['volume', 'intensity'];
export const TM2_TRACK_LABELS = { volume: '볼륨', intensity: '강도' };

export function groupForMajor(major) {
  const m = String(major || '').trim();
  return TM2_GROUPS.find(g => g.majors.includes(m)) || null;
}

export function groupIdForPart(partId) {
  const raw = String(partId || '').trim();
  if (!raw) return null;
  if (raw === 'glute') return 'lower';
  if (raw === 'core' || raw === 'abs_core') return 'abs';
  if (raw === 'bicep' || raw === 'tricep') return 'arm';
  const direct = TM2_GROUPS.find(g => g.id === raw);
  if (direct) return direct.id;
  return groupForMajor(raw)?.id || null;
}

export function visibleGroupIdsForSelectedParts(parts = []) {
  const ids = new Set();
  for (const part of (Array.isArray(parts) ? parts : [])) {
    const groupId = groupIdForPart(part);
    if (groupId) ids.add(groupId);
  }
  if (ids.size) {
    ids.add('arm');
    ids.add('abs');
  }
  return ids;
}

export function defaultIncrementForGroup(groupId) {
  const g = TM2_GROUPS.find(x => x.id === groupId);
  return g?.bodyRegion === 'lower' ? TM2_DEFAULTS.incrementLowerKg : TM2_DEFAULTS.incrementUpperKg;
}

// ----------------------------------------------------------------
// 날짜 유틸 (dateKey: 'YYYY-MM-DD', 주 = 월요일 시작)
// ----------------------------------------------------------------

export function parseKey(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key, n) {
  const dt = parseKey(key);
  dt.setDate(dt.getDate() + n);
  return toKey(dt);
}

export const addWeeks = (key, n) => addDays(key, n * 7);

/** 해당 날짜가 속한 주의 월요일 dateKey */
export function mondayOf(key) {
  const dt = parseKey(key);
  const dow = dt.getDay(); // 0=일
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  return toKey(dt);
}

/** 두 dateKey 사이 주 차이 (a 기준 b가 몇 주 뒤인가, 월요일 정규화) */
export function weeksBetween(a, b) {
  const ms = parseKey(mondayOf(b)) - parseKey(mondayOf(a));
  return Math.round(ms / (7 * 24 * 3600 * 1000));
}

/** 사이클 내 1-based 주차 (범위 밖이면 0 또는 weeks 초과값) */
export function weekIndexOf(cycle, todayKey) {
  return weeksBetween(cycle.startDate, todayKey) + 1;
}

export function isCycleFinished(cycle, todayKey) {
  return weekIndexOf(cycle, todayKey) > (cycle.weeks || 6);
}

/** 'M/D' 표기 */
export function shortDate(key) {
  const dt = parseKey(key);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// ----------------------------------------------------------------
// ID / 클론
// ----------------------------------------------------------------

let _seq = 0;
const _id = (prefix) => `${prefix}_${Date.now().toString(36)}_${(_seq++).toString(36)}`;

export function cloneBoard(board) {
  return JSON.parse(JSON.stringify(board));
}

function _mergePaintedLog(targetLog = null, sourceLog = null) {
  if (!sourceLog?.paintedAt) return targetLog || {};
  const next = { ...(targetLog || {}) };
  if (next.paintedAt) return next;
  return { ...next, ...sourceLog };
}

function _targetStepForPaintedWeek(board, sourceStep, weekStart) {
  if (!board || !sourceStep) return null;
  const byId = sourceStep.id
    ? (board.steps || []).find(step => step.id === sourceStep.id)
    : null;
  if (byId) return byId;
  return _stepCoveringWeek(board, sourceStep.benchmarkId, sourceStep.track || 'volume', weekStart);
}

export function mergeBoardCompletionLogs(latestBoard = null, incomingBoard = null) {
  const merged = cloneBoard(incomingBoard || latestBoard || {});
  if (!latestBoard || typeof latestBoard !== 'object') return merged;

  for (const sourceStep of latestBoard.steps || []) {
    for (const [weekStart, sourceLog] of Object.entries(sourceStep?.weekLog || {})) {
      if (!sourceLog?.paintedAt) continue;
      const targetStep = _targetStepForPaintedWeek(merged, sourceStep, weekStart);
      if (!targetStep) continue;
      targetStep.weekLog = targetStep.weekLog || {};
      targetStep.weekLog[weekStart] = _mergePaintedLog(targetStep.weekLog[weekStart], sourceLog);
      if (sourceStep.state === 'done') targetStep.state = 'done';
    }
  }

  const targetBenchmarks = new Map((merged.benchmarks || []).map(benchmark => [benchmark.id, benchmark]));
  for (const sourceBenchmark of latestBoard.benchmarks || []) {
    const targetBenchmark = targetBenchmarks.get(sourceBenchmark?.id);
    if (!targetBenchmark) continue;
    for (const [weekStart, sourceLog] of Object.entries(sourceBenchmark.wendlerLog || {})) {
      if (!sourceLog?.paintedAt) continue;
      targetBenchmark.wendlerLog = targetBenchmark.wendlerLog || {};
      targetBenchmark.wendlerLog[weekStart] = _mergePaintedLog(targetBenchmark.wendlerLog[weekStart], sourceLog);
    }
  }

  return merged;
}

// ----------------------------------------------------------------
// 온보딩 후보 / 보드 생성 (계약 11)
// ----------------------------------------------------------------

const TM2_DEFAULT_ON = new Set([
  'barbell_bench', 'incline_barbell_bench', 'chest_fly', 'dips',
  'lat_pulldown', 'barbell_row', 'seated_row', 'arm_pulldown',
  'ohp', 'lateral_raise', 'rear_delt_fly', 'front_raise',
  'back_squat', 'leg_press', 'leg_extension', 'leg_curl',
  'barbell_curl', 'hammer_curl', 'cable_tricep_pushdown', 'overhead_tricep_ext',
  'hanging_leg_raise', 'ab_wheel', 'cable_crunch',
]);

const TM2_INTENSITY_DEFAULT = new Set(['barbell_bench', 'back_squat', 'lat_pulldown']);

// 세부 부위(subPattern) → 그룹 매핑 (groupForMajor가 못 잡는 것 보충)
const TM2_SUB_TO_GROUP = {
  quad: 'lower', hamstring: 'lower', calf: 'lower', glute: 'lower',
  chest_upper: 'chest', chest_mid: 'chest', chest_lower: 'chest',
  back_width: 'back', back_thickness: 'back', posterior: 'back',
  shoulder_front: 'shoulder', shoulder_side: 'shoulder', rear_delt: 'shoulder', traps: 'shoulder',
  bicep: 'arm', tricep: 'arm',
  core: 'abs', abs_core: 'abs',
};

/**
 * 실제 등록 종목(getExList 원소)의 부위 그룹 판정.
 * muscleId/muscleIds/movementId 기반. 못 잡으면 null(보드에서 제외).
 */
export function exerciseGroupId(ex = {}, movements = []) {
  const tryIds = [ex.muscleId, ex.primaryMajor, ex.major, ex.primary, ...(Array.isArray(ex.muscleIds) ? ex.muscleIds : [])].filter(Boolean);
  for (const id of tryIds) { const g = groupForMajor(id); if (g) return g.id; }
  for (const id of tryIds) { if (TM2_SUB_TO_GROUP[id]) return TM2_SUB_TO_GROUP[id]; }
  const mv = movements.find(m => m.id === (ex.movementId || ex.id || ex.exerciseId));
  if (mv) {
    const g = groupForMajor(mv.primary);
    if (g) return g.id;
    if (TM2_SUB_TO_GROUP[mv.subPattern]) return TM2_SUB_TO_GROUP[mv.subPattern];
  }
  return null;
}

export function resolveSessionEntryGroupId(entry = {}, { exList = [], movements = [] } = {}) {
  const direct = exerciseGroupId(entry, movements);
  if (direct) return direct;

  const entryId = entry.exerciseId || entry.id;
  const registered = (Array.isArray(exList) ? exList : []).find(ex => ex?.id && ex.id === entryId) || null;
  if (registered) {
    const merged = { ...registered };
    ['movementId', 'muscleId', 'primaryMajor', 'major', 'primary'].forEach((key) => {
      if (entry[key]) merged[key] = entry[key];
    });
    if (Array.isArray(entry.muscleIds) && entry.muscleIds.length) merged.muscleIds = entry.muscleIds;
    const registeredGroup = exerciseGroupId(merged, movements);
    if (registeredGroup) return registeredGroup;
  }

  const movementId = entry.movementId || registered?.movementId || entryId;
  const mv = (Array.isArray(movements) ? movements : []).find(m => m.id === movementId);
  if (!mv) return null;
  const byPrimary = groupForMajor(mv.primary);
  if (byPrimary) return byPrimary.id;
  return TM2_SUB_TO_GROUP[mv.subPattern] || null;
}

/**
 * 운동 기록 캐시(_cache)에서 종목별 최근 본세트 무게 맵 생성 (순수).
 * 반환: { 'id:<exerciseId>': {kg,reps,dateKey}, 'mv:<movementId>':..., 'nm:<name>':... }
 */
export function buildRecentMap(cache = {}) {
  const map = {};
  for (const dk of Object.keys(cache).sort()) { // 오름차순 — 뒤(최근)가 덮어씀
    const exs = Array.isArray(cache[dk]?.exercises) ? cache[dk].exercises : [];
    for (const ex of exs) {
      let best = null;
      for (const s of (Array.isArray(ex?.sets) ? ex.sets : [])) {
        if (s?.done === false || s?.setType === 'warmup') continue;
        const kg = Number(s?.kg) || 0, reps = Number(s?.reps) || 0;
        if (kg <= 0 || reps <= 0) continue;
        if (!best || kg > best.kg) best = { kg, reps };
      }
      if (!best) continue;
      const entry = { kg: best.kg, reps: best.reps, dateKey: dk };
      if (ex.exerciseId) map[`id:${ex.exerciseId}`] = entry;
      if (ex.movementId) map[`mv:${ex.movementId}`] = entry;
      if (ex.name) map[`nm:${ex.name}`] = entry;
    }
  }
  return map;
}

export function sessionExerciseId(entry = {}, idx = 0) {
  const name = String(entry.name || '').trim();
  return entry.exerciseId || entry.id || (name ? `session:${name}` : `session:${idx}`);
}

export function mergeSessionExercises(exList = [], entries = []) {
  const out = Array.isArray(exList) ? [...exList] : [];
  const seen = new Set();
  for (const ex of out) {
    if (ex?.id) seen.add(`id:${ex.id}`);
    if (ex?.name) seen.add(`nm:${ex.name}`);
  }
  (Array.isArray(entries) ? entries : []).forEach((entry, idx) => {
    const name = String(entry?.name || '').trim();
    const id = sessionExerciseId(entry, idx);
    if (!id || !name) return;
    if (seen.has(`id:${id}`) || seen.has(`nm:${name}`)) return;
    seen.add(`id:${id}`);
    seen.add(`nm:${name}`);
    out.push({
      id,
      name,
      movementId: entry.movementId || null,
      muscleId: entry.muscleId || entry.primaryMajor || entry.major || null,
      muscleIds: Array.isArray(entry.muscleIds) ? entry.muscleIds.filter(Boolean) : [],
      __gymNote: entry.gymTagAtTime || entry.gymName || '오늘 운동',
    });
  });
  return out;
}

export function sessionRecentMap(entries = [], dateKeyStr = null) {
  const map = {};
  for (const [idx, entry] of (Array.isArray(entries) ? entries : []).entries()) {
    const sets = (Array.isArray(entry?.sets) ? entry.sets : [])
      .filter(s => s && s.setType !== 'warmup' && s.done !== false && Number(s.kg) > 0 && Number(s.reps) > 0);
    const set = sets[sets.length - 1];
    if (!set) continue;
    const spec = { kg: Number(set.kg), reps: Math.round(Number(set.reps)) || 12, from: '오늘 운동', dateKey: dateKeyStr || null };
    const id = sessionExerciseId(entry, idx);
    const name = String(entry?.name || '').trim();
    if (id) map[`id:${id}`] = spec;
    if (entry?.movementId) map[`mv:${entry.movementId}`] = spec;
    if (name) map[`nm:${name}`] = spec;
  }
  return map;
}

const recentForExercise = (ex, recentMap) =>
  recentMap[`id:${ex.id}`] || (ex.movementId && recentMap[`mv:${ex.movementId}`]) || (ex.name && recentMap[`nm:${ex.name}`]) || null;

const candidateRecentDateKey = (candidate = {}) => String(
  candidate?.tracks?.volume?.dateKey
  || candidate?.tracks?.intensity?.dateKey
  || ''
);

function _benchmarkLookup(benchmarks = []) {
  const byKey = {};
  for (const bm of (Array.isArray(benchmarks) ? benchmarks : [])) {
    for (const key of [bm?.exerciseId, bm?.movementId, bm?.id].filter(Boolean)) {
      if (!byKey[key]) byKey[key] = bm;
    }
  }
  return byKey;
}

export function sortCandidatesByRecent(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({ candidate, index, recentDateKey: candidateRecentDateKey(candidate) }))
    .sort((a, b) => {
      if (a.recentDateKey && b.recentDateKey && a.recentDateKey !== b.recentDateKey) {
        return b.recentDateKey.localeCompare(a.recentDateKey);
      }
      if (a.recentDateKey && !b.recentDateKey) return -1;
      if (!a.recentDateKey && b.recentDateKey) return 1;
      return a.index - b.index;
    })
    .map(item => item.candidate);
}

/**
 * 온보딩/종목추가 후보 목록 — **사용자 실제 등록 종목(exList)이 1순위**.
 * 운동할 때 참조하는 리스트와 동일 출처(getExList).
 * v2 보드가 있으면 현재/보관 벤치마크의 운동방식을 우선 상속하고,
 * 없을 때만 v1 max_cycle을 시작무게/웬들러 상속용으로 읽는다.
 * exList가 비면 generic MOVEMENTS로 폴백.
 * 반환: [{ exerciseId, movementId, muscleId, label, groupId, defaultOn, tracks, source, wendler? }]
 */
export function buildOnboardingCandidates({ exList = [], v1Cycle = null, v2Board = null, movements = [], recentMap = {} } = {}) {
  const out = [];
  const seen = new Set();

  const v2ByKey = _benchmarkLookup(v2Board?.benchmarks || []);

  // v1 벤치마크 lookup (movementId/exerciseId 키) — 시작무게·웬들러·강도 트랙 상속용
  const v1ByKey = {};
  for (const bm of (Array.isArray(v1Cycle?.benchmarks) ? v1Cycle.benchmarks : [])) {
    const k = bm.movementId || bm.exerciseId || bm.id;
    if (k) v1ByKey[k] = bm;
  }

  const exercises = Array.isArray(exList) ? exList : [];
  for (const ex of exercises) {
    if (!ex?.id || seen.has(ex.id)) continue;
    const groupId = exerciseGroupId(ex, movements);
    if (!groupId) continue;
    seen.add(ex.id);
    const v2 = v2ByKey[ex.id] || (ex.movementId && v2ByKey[ex.movementId]) || null;
    const v1 = v1ByKey[ex.movementId] || v1ByKey[ex.id] || null;
    const recent = recentForExercise(ex, recentMap);
    const volSpec = recent
      ? { kg: recent.kg, reps: recent.reps, from: '최근 기록', dateKey: recent.dateKey || null }
      : (v2 && Number(v2.seed?.volume?.kg) > 0
        ? { kg: Number(v2.seed.volume.kg), reps: Number(v2.seed.volume.reps) || 12, from: 'v2 보드' }
      : (v1 && Number(v1.tracks?.M?.startKg) > 0
        ? { kg: Number(v1.tracks.M.startKg), reps: Number(v1.tracks.M.startReps) || 12, from: 'v1 기록' }
        : { manual: true, reps: 12 }));
    const intSpec = (v2 && (v2.tracks || []).includes('intensity') && Number(v2.seed?.intensity?.kg) > 0)
      ? { kg: Number(v2.seed.intensity.kg), reps: Number(v2.seed.intensity.reps) || 8, from: 'v2 보드' }
      : (v1 && v1.tracks?.H && v1.tracks.H.enabled !== false && Number(v1.tracks.H.startKg) > 0)
      ? { kg: Number(v1.tracks.H.startKg), reps: Number(v1.tracks.H.startReps) || 8, from: 'v1 기록' }
      : null;
    const defaultOn = !!recent || !!v2 || !!v1 || TM2_DEFAULT_ON.has(ex.movementId || ex.id);
    const inheritedWendler = v2
      ? (v2.program === 'wendler' && v2.wendler ? { ...v2.wendler } : null)
      : (v1?.program === 'wendler' && v1.wendler ? { ...v1.wendler } : null);
    out.push({
      exerciseId: ex.id,
      movementId: ex.movementId || null,
      muscleId: ex.muscleId || null,
      label: ex.name || ex.id,
      groupId,
      gymNote: ex.__gymNote || '',
      defaultOn,   // 최근/v1 또는 v2 기본 동작이면 기본 on
      source: 'registry',
      tracks: { volume: volSpec, intensity: intSpec },
      wendler: inheritedWendler,
    });
  }

  // 폴백: 등록 종목이 하나도 없을 때만 generic MOVEMENTS
  if (!out.length) {
    for (const mv of movements) {
      const group = groupForMajor(mv.primary);
      if (!group || seen.has(mv.id)) continue;
      seen.add(mv.id);
      const v2 = v2ByKey[mv.id] || null;
      const v1 = v1ByKey[mv.id] || null;
      const inheritedWendler = v2
        ? (v2.program === 'wendler' && v2.wendler ? { ...v2.wendler } : null)
        : (v1?.program === 'wendler' && v1.wendler ? { ...v1.wendler } : null);
      const volumeSeed = v2 && Number(v2.seed?.volume?.kg) > 0
        ? { kg: Number(v2.seed.volume.kg), reps: Number(v2.seed.volume.reps) || 12, from: 'v2 보드' }
        : (v1 && Number(v1.tracks?.M?.startKg) > 0
          ? { kg: Number(v1.tracks.M.startKg), reps: Number(v1.tracks.M.startReps) || 12, from: 'v1 기록' }
          : { manual: true, reps: 12 });
      const intensitySeed = v2 && (v2.tracks || []).includes('intensity') && Number(v2.seed?.intensity?.kg) > 0
        ? { kg: Number(v2.seed.intensity.kg), reps: Number(v2.seed.intensity.reps) || 8, from: 'v2 보드' }
        : (v1 && v1.tracks?.H && v1.tracks.H.enabled !== false && Number(v1.tracks.H.startKg) > 0
          ? { kg: Number(v1.tracks.H.startKg), reps: Number(v1.tracks.H.startReps) || 8, from: 'v1 기록' }
          : (TM2_INTENSITY_DEFAULT.has(mv.id) ? { manual: true, reps: 8 } : null));
      out.push({
        exerciseId: null,
        movementId: mv.id,
        muscleId: mv.primary,
        label: mv.nameKo || mv.id,
        groupId: group.id,
        gymNote: '',
        defaultOn: !!v2 || !!v1 || TM2_DEFAULT_ON.has(mv.id),
        source: 'library',
        tracks: {
          volume: volumeSeed,
          intensity: intensitySeed,
        },
        wendler: inheritedWendler,
      });
    }
  }
  return out;
}

function _makeBenchmark(candidate, order) {
  const groupId = candidate.groupId;
  const increment = Number(candidate.incrementKg) > 0
    ? Number(candidate.incrementKg)
    : defaultIncrementForGroup(groupId);
  const tracks = [];
  const seed = {};
  for (const t of TM2_TRACKS) {
    const spec = candidate.tracks?.[t];
    if (!spec) continue;
    tracks.push(t);
    seed[t] = {
      kg: Number(spec.kg) > 0 ? Number(spec.kg) : 0,
      reps: Number(spec.reps) > 0 ? Number(spec.reps) : (t === 'intensity' ? 8 : 12),
    };
  }
  if (!tracks.length) {
    tracks.push('volume');
    seed.volume = { kg: 0, reps: 12 };
  }
  const bm = {
    id: _id('bm'),
    exerciseId: candidate.exerciseId || null,   // 실제 운동 기록 연결 (계약 1·통합)
    movementId: candidate.movementId || null,
    muscleId: candidate.muscleId || null,
    groupId,
    label: candidate.label || '종목',
    short: candidate.short || String(candidate.label || '종목').slice(0, 5),
    order,
    status: 'active',
    tracks,
    seed,
    setsDefault: Math.max(1, Math.round(Number(candidate.setsDefault) || 4)),
    setsByTrack: Object.fromEntries(tracks.map(track => [
      track,
      Math.max(1, Math.round(Number(candidate.setsByTrack?.[track]) || Number(candidate.setsDefault) || 4)),
    ])),
    incrementKg: increment,
    incrementKgByTrack: Object.fromEntries(tracks.map(track => [
      track,
      Number(candidate.incrementKgByTrack?.[track]) > 0 ? Number(candidate.incrementKgByTrack[track]) : increment,
    ])),
    progressionWeeks: Number(candidate.progressionWeeks) > 0
      ? Math.max(1, Math.round(Number(candidate.progressionWeeks)))
      : null,
    progressionStartDate: candidate.progressionWeeks
      ? mondayOf(candidate.progressionStartDate || candidate.programStartDate || toKey(new Date()))
      : null,
    program: candidate.wendler ? 'wendler' : 'stair',
    meta: {
      rirTarget: candidate.meta?.rirTarget ?? 2,
      formNote: candidate.meta?.formNote || '',
      gymNote: candidate.meta?.gymNote || candidate.gymNote || '',
    },
  };
  if (bm.program === 'wendler') {
    const major = TM2_GROUPS.find(g => g.id === groupId)?.majors?.[0] || null;
    bm.wendler = normalizeWendlerConfig(candidate.wendler, {
      primaryMajor: major,
      trackSpec: seed.volume ? { startKg: seed.volume.kg, startReps: seed.volume.reps } : null,
      movementId: bm.movementId,
      exerciseId: bm.exerciseId,
      label: bm.label,
    });
    bm.wendlerLog = {};
  }
  return bm;
}

function _makeCycle(groupId, startDate, weeks = 6) {
  return {
    id: _id(`cy_${groupId}`),
    groupId,
    startDate,
    weeks,
    status: 'active',
    settle: null,
  };
}

function _makeStep(benchmark, track, cycle, kg, reps, weekStart = null, span = null) {
  return {
    id: _id('st'),
    benchmarkId: benchmark.id,
    track,
    cycleId: cycle.id,
    weekStart: weekStart || cycle.startDate,
    span: span || cycle.weeks,
    kg,
    reps,
    sets: trackSetsOf(benchmark, track),
    state: 'planned',
    weekLog: {},
  };
}

export function trackIncrementKgOf(benchmark = {}, track = 'volume') {
  const value = Number(benchmark?.incrementKgByTrack?.[track]);
  return value > 0 ? value : Math.max(0, Number(benchmark?.incrementKg) || 0);
}

export function trackSetsOf(benchmark = {}, track = 'volume') {
  const value = Number(benchmark?.setsByTrack?.[track]);
  return Math.max(1, Math.round(value > 0 ? value : (Number(benchmark?.setsDefault) || 4)));
}

function _roundStairKg(value, incrementKg = 0) {
  const unit = Number(incrementKg) === 1.25 ? 0.25 : 0.5;
  return Math.round((Number(value) || 0) / unit) * unit;
}

/** 활성 사이클에 벤치마크의 기본 계획 스텝 생성. progressionWeeks가 있으면 해당 주기마다 증량한다. */
function _planBenchmarkSteps(board, benchmark, cycle, fromWeek = null) {
  if (benchmark.program === 'wendler') return; // 웬들러는 파생
  for (const t of benchmark.tracks) {
    const seed = benchmark.seed[t] || { kg: 0, reps: 12 };
    const incrementKg = trackIncrementKgOf(benchmark, t);
    const weekStart = fromWeek || cycle.startDate;
    const remainingWeeks = Math.max(1, cycle.weeks - weeksBetween(cycle.startDate, weekStart));
    const progressionWeeks = Math.max(0, Math.round(Number(benchmark.progressionWeeks) || 0));
    if (!progressionWeeks) {
      board.steps.push(_makeStep(benchmark, t, cycle, seed.kg, seed.reps, weekStart, remainingWeeks));
      continue;
    }
    const progressionStartDate = benchmark.progressionStartDate || cycle.startDate;
    const elapsedWeeks = Math.max(0, weeksBetween(progressionStartDate, weekStart));
    const phase = elapsedWeeks % progressionWeeks;
    let weekOffset = 0;
    let increaseNo = 0;
    while (weekOffset < remainingWeeks) {
      const untilNextIncrease = weekOffset === 0 && phase > 0 ? progressionWeeks - phase : progressionWeeks;
      const span = Math.min(untilNextIncrease, remainingWeeks - weekOffset);
      const kg = _roundStairKg(Number(seed.kg) + incrementKg * increaseNo, incrementKg);
      board.steps.push(_makeStep(benchmark, t, cycle, kg, seed.reps, addWeeks(weekStart, weekOffset), span));
      weekOffset += span;
      increaseNo++;
    }
  }
}

/**
 * 온보딩 → 보드 생성.
 * selections: buildOnboardingCandidates 결과 중 켜진 항목 (tracks[t].kg 채워진 상태)
 */
export function buildBoardFromOnboarding({ selections = [], startDate, source = 'manual' } = {}) {
  const start = mondayOf(startDate);
  const board = {
    version: 2,
    bootstrappedFrom: source,
    defaults: { ...TM2_DEFAULTS },
    groups: TM2_GROUPS.map(g => ({ id: g.id, label: g.label, bodyRegion: g.bodyRegion, order: g.order })),
    benchmarks: [],
    cycles: [],
    steps: [],
    lineups: {},
    history: [],
    createdAt: null, // 호출부에서 Date.now() 주입 가능
  };
  const groupsUsed = new Set();
  selections.forEach((cand, i) => {
    const bm = _makeBenchmark({ ...cand, progressionStartDate: cand.progressionStartDate || start }, i);
    board.benchmarks.push(bm);
    groupsUsed.add(bm.groupId);
  });
  for (const gid of groupsUsed) {
    const cycle = _makeCycle(gid, start);
    board.cycles.push(cycle);
    const groupBenchmarks = board.benchmarks.filter(b => b.groupId === gid);
    for (const bm of groupBenchmarks.filter(b => b.program === 'wendler')) {
      _normalizeWendlerBenchmark(board, bm, { fallbackStartDate: cycle.startDate });
    }
    for (const bm of groupBenchmarks) {
      _planBenchmarkSteps(board, bm, cycle);
    }
  }
  return board;
}

export function createEmptyBoardV2({ startDate, source = 'exercise-program' } = {}) {
  return buildBoardFromOnboarding({ selections: [], startDate: startDate || toKey(new Date()), source });
}

// ----------------------------------------------------------------
// 조회 헬퍼
// ----------------------------------------------------------------

export const activeBenchmarks = (board, groupId) =>
  (board.benchmarks || [])
    .filter(b => b.status === 'active' && (!groupId || b.groupId === groupId))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

export const activeCycleOf = (board, groupId) =>
  (board.cycles || []).filter(c => c.groupId === groupId && c.status === 'active')
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] || null;

export const settledCyclesOf = (board, groupId) =>
  (board.cycles || []).filter(c => c.groupId === groupId && c.status === 'settled')
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

export const benchmarkById = (board, id) => (board.benchmarks || []).find(b => b.id === id) || null;

const _stepsOf = (board, benchmarkId, track, cycleId) =>
  (board.steps || [])
    .filter(s => s.benchmarkId === benchmarkId && s.track === track && (!cycleId || s.cycleId === cycleId))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));

const _stepCoveringWeek = (board, benchmarkId, track, weekStart) =>
  (board.steps || []).find(s =>
    s.benchmarkId === benchmarkId && s.track === track &&
    weeksBetween(s.weekStart, weekStart) >= 0 &&
    weeksBetween(s.weekStart, weekStart) < s.span) || null;

/** 트랙의 현재 대표 무게 (마지막 스텝 kg, 없으면 seed) */
export function currentKgOf(board, benchmark, track) {
  const steps = _stepsOf(board, benchmark.id, track);
  const last = steps[steps.length - 1];
  if (last && Number(last.kg) > 0) return { kg: last.kg, reps: last.reps };
  const seed = benchmark.seed?.[track];
  return { kg: Number(seed?.kg) || 0, reps: Number(seed?.reps) || 12 };
}

// ----------------------------------------------------------------
// 셀 전개 (보드 렌더의 데이터원)
// ----------------------------------------------------------------

const _hasMissValue = (value) => value != null && String(value).trim() !== '';
const _missWasAttempted = (log) => !!(
  log?.attempted === true ||
  log?.performed === true ||
  log?.missedAt ||
  _hasMissValue(log?.actualKg) ||
  _hasMissValue(log?.actualReps) ||
  _hasMissValue(log?.amrapReps)
);

function _stepCellState(step, cycle, todayKey) {
  const todayMon = mondayOf(todayKey);
  const stepEnd = addWeeks(step.weekStart, step.span); // exclusive
  const weeks = [];
  for (let i = 0; i < step.span; i++) {
    const wk = addWeeks(step.weekStart, i);
    const log = step.weekLog?.[wk] || null;
    const attempted = !!log?.missed && !log?.paintedAt && _missWasAttempted(log);
    weeks.push({
      weekStart: wk,
      painted: !!log?.paintedAt,
      attempted,
      missed: !!log?.missed && !log?.paintedAt && !attempted,
    });
  }
  const allPainted = weeks.length > 0 && weeks.every(w => w.painted);
  const anyAttempted = weeks.some(w => w.attempted);
  const anyMissed = weeks.some(w => w.missed);
  const isCurrent = weeksBetween(step.weekStart, todayMon) >= 0 && todayMon < stepEnd;
  let state;
  if (allPainted || step.state === 'done') state = 'done';
  else if (anyAttempted) state = 'attempted';
  else if (anyMissed || step.state === 'missed') state = 'miss';
  else if (isCurrent) state = 'now';
  else state = 'plan';
  return { state, weeks, isCurrent };
}

/**
 * 벤치마크×트랙×사이클의 셀 목록.
 * stair → [{ kind:'stair', weekStart, span, kg, reps, state, dots, stepId, isCurrent }]
 *   (스텝이 안 덮는 주는 { kind:'rest', weekStart, span })
 * wendler → 주당 1칸 [{ kind:'wendler', weekStart, span:1, kg(톱세트), repsLabel, subLabel, state, week }]
 */
export function expandColumnCells(board, benchmarkId, track, cycleId, todayKey) {
  const bm = benchmarkById(board, benchmarkId);
  const cycle = (board.cycles || []).find(c => c.id === cycleId);
  if (!bm || !cycle) return [];
  const todayMon = mondayOf(todayKey);

  if (bm.program === 'wendler') {
    _normalizeWendlerBenchmark(board, bm, { fallbackStartDate: cycle.startDate });
    const programStartDate = bm.programStartDate;
    const cells = [];
    for (let w = 1; w <= cycle.weeks; w++) {
      const weekStart = addWeeks(cycle.startDate, w - 1);
      if (weeksBetween(programStartDate, weekStart) < 0) {
        cells.push({ kind: 'rest', weekStart, span: 1 });
        continue;
      }
      const plan = _programPlanForBenchmark(board, bm, { weekStart, todayKey: weekStart });
      const rx = plan.rx;
      const log = bm.wendlerLog?.[weekStart] || null;
      let state = 'plan';
      if (log?.paintedAt) state = 'done';
      else if (log?.missed && _missWasAttempted(log)) state = 'attempted';
      else if (log?.missed) state = 'miss';
      else if (weekStart === todayMon) state = 'now';
      const top = rx.topSet;
      cells.push({
        kind: 'wendler',
        weekStart,
        span: 1,
        week: plan.cycleWeek,
        programWeek: plan.programWeek,
        programStartDate: plan.programStartDate,
        tmAnchorWeekStart: plan.tmAnchorWeekStart,
        tmKg: plan.tmKg,
        kg: top?.kg ?? 0,
        repsLabel: top ? `×${top.reps}${top.amrap ? '+' : ''}` : '',
        subLabel: top
          ? `${top.pct}%${rx.supplemental ? ` · ${rx.supplemental.label} ${rx.supplemental.kg}` : ''}`
          : '',
        state,
        isCurrent: weekStart === todayMon,
      });
    }
    return cells;
  }

  const steps = _stepsOf(board, benchmarkId, track, cycleId);
  const cells = [];
  let cursor = cycle.startDate;
  const cycleEnd = addWeeks(cycle.startDate, cycle.weeks); // exclusive
  for (const step of steps) {
    if (weeksBetween(cursor, step.weekStart) > 0) {
      cells.push({ kind: 'rest', weekStart: cursor, span: weeksBetween(cursor, step.weekStart) });
    }
    const clippedSpan = Math.min(step.span, weeksBetween(step.weekStart, cycleEnd));
    if (clippedSpan <= 0) continue;
    const st = _stepCellState(step, cycle, todayKey);
    const todayMon = mondayOf(todayKey);
    // 주별 상태 — 병합 칸이 "그 주까지 비례적으로" 채워지도록 (계약: 진행 색칠)
    const weekStates = st.weeks.slice(0, clippedSpan).map(w => {
      if (w.painted) return 'done';
      if (w.attempted) return 'attempted';
      if (w.missed) return 'miss';
      if (w.weekStart === todayMon) return 'now';
      if (weeksBetween(w.weekStart, todayMon) > 0) return 'past';   // 지난 주 미색칠
      return 'plan';
    });
    cells.push({
      kind: 'stair',
      weekStart: step.weekStart,
      span: clippedSpan,
      kg: step.kg,
      reps: step.reps,
      sets: step.sets || null,
      state: st.state,
      weekStates,
      dots: st.weeks.slice(0, clippedSpan).map(w => ({ weekStart: w.weekStart, on: w.painted, missed: w.missed, attempted: w.attempted })),
      stepId: step.id,
      isCurrent: st.isCurrent,
    });
    cursor = addWeeks(step.weekStart, clippedSpan);
  }
  if (weeksBetween(cursor, cycleEnd) > 0) {
    cells.push({ kind: 'rest', weekStart: cursor, span: weeksBetween(cursor, cycleEnd) });
  }
  return cells;
}

/**
 * 활성 사이클 이후 미래 사이클들의 "투영" 셀 (계약: 최소 18주 가시화).
 * 정산 전이므로 실제 cycle/step을 만들지 않고 계산값만 — 각 미래 사이클 = 현재 대표 + 증량폭×offset.
 * minAheadWeeks: 활성 사이클 끝 기준 앞으로 최소 몇 주를 채울지.
 */
export function projectFutureCells(board, benchmarkId, track, minAheadWeeks = 12) {
  const bm = benchmarkById(board, benchmarkId);
  if (!bm) return [];
  const active = activeCycleOf(board, bm.groupId);
  if (!active) return [];
  const cells = [];
  let projStart = addWeeks(active.startDate, active.weeks);
  let offset = 1;
  const isWnd = bm.program === 'wendler';
  if (isWnd) _normalizeWendlerBenchmark(board, bm, { fallbackStartDate: active.startDate });
  const isOriginal = isWnd && bm.wendler?.templateVersion === W863_ORIGINAL_VERSION;
  const baseKg = isOriginal
    ? bm.wendler.oneRmKg
    : (isWnd ? (_resolveWendlerTmAnchor(bm, active.startDate)?.tmKg || bm.wendler.tmKg) : currentKgOf(board, bm, track).kg);
  const baseReps = isWnd ? 0 : currentKgOf(board, bm, track).reps;
  const inc = isWnd ? bm.wendler.incrementKg : trackIncrementKgOf(bm, track);
  const limit = addWeeks(addWeeks(active.startDate, active.weeks), minAheadWeeks);
  const progressionWeeks = isWnd ? 0 : Math.max(0, Math.round(Number(bm.progressionWeeks) || 0));
  if (progressionWeeks) {
    const progressionStartDate = bm.progressionStartDate || active.startDate;
    const steps = _stepsOf(board, bm.id, track, active.id);
    const last = steps[steps.length - 1] || { weekStart: active.startDate };
    const lastLevel = Math.floor(Math.max(0, weeksBetween(progressionStartDate, last.weekStart)) / progressionWeeks);
    let cursor = projStart;
    let level = Math.floor(Math.max(0, weeksBetween(progressionStartDate, cursor)) / progressionWeeks);
    let kg = _roundStairKg(baseKg + inc * Math.max(0, level - lastLevel), inc);
    while (weeksBetween(cursor, limit) > 0) {
      const phase = Math.max(0, weeksBetween(progressionStartDate, cursor)) % progressionWeeks;
      const span = Math.min(phase > 0 ? progressionWeeks - phase : progressionWeeks, weeksBetween(cursor, limit));
      cells.push({
        kind: 'stair', weekStart: cursor, span, kg, reps: baseReps,
        state: 'future', dots: [], isCurrent: false, projected: true, offset: Math.max(1, level - lastLevel),
      });
      cursor = addWeeks(cursor, span);
      level++;
      kg = _roundStairKg(kg + inc, inc);
    }
    return cells;
  }
  while (weeksBetween(projStart, limit) > 0 && offset <= 6) {
    if (isWnd) {
      const exactAnchor = (bm.wendler?.tmAnchors || []).find(anchor => anchor.weekStart === projStart);
      const projectedKg = exactAnchor
        ? (isOriginal ? roundToPlate(exactAnchor.tmKg / 0.9, 0.5) : exactAnchor.tmKg)
        : roundToPlate(baseKg + inc * offset, 0.5);
      const tm = isOriginal ? roundToPlate(projectedKg * 0.9, 0.5) : projectedKg;
      for (let w = 1; w <= active.weeks; w++) {
        const weekStart = addWeeks(projStart, w - 1);
        const programWeek = Math.max(1, weeksBetween(bm.programStartDate, weekStart) + 1);
        const cycleWeek = ((programWeek - 1) % active.weeks) + 1;
        const rx = wendlerWeekPrescription({
          ...bm.wendler,
          tmKg: tm,
          ...(isOriginal ? { oneRmKg: projectedKg } : {}),
        }, cycleWeek);
        const top = rx.topSet;
        cells.push({
          kind: 'wendler', weekStart, span: 1, week: cycleWeek, programWeek,
          programStartDate: bm.programStartDate, tmAnchorWeekStart: exactAnchor?.weekStart || null, tmKg: tm,
          kg: top?.kg ?? 0, repsLabel: top ? `×${top.reps}${top.amrap ? '+' : ''}` : '',
          subLabel: top ? `${top.pct}%` : '', state: 'future', isCurrent: false, projected: true, offset,
        });
      }
    } else {
      const kg = roundToPlate(baseKg + inc * offset, 0.5);
      cells.push({
        kind: 'stair', weekStart: projStart, span: active.weeks, kg, reps: baseReps,
        state: 'future', dots: [], isCurrent: false, projected: true, offset,
      });
    }
    projStart = addWeeks(projStart, active.weeks);
    offset++;
  }
  return cells;
}

// ----------------------------------------------------------------
// 색칠 / 못 채움 (계약 4·5)
// ----------------------------------------------------------------

/**
 * 오늘 카드 완료 판정 — 목표(무게·횟수)를 **동시에** 충족한 본세트 중 '최다 반복' 세트를
 * 실적(=이번 주 톱세트 AMRAP)으로 고른다. 충족 세트가 없으면 null(미달).
 *
 * '가장 무거운 세트 하나'만 보면 안 되는 이유: 원본 8/6/3 웬들러 프리셋에는 톱세트보다
 * 무거운 헤비싱글(1회)이 섞여 있다. 헤비싱글이 '가장 무거운 세트'가 되면 그 1회를
 * 톱세트 목표 횟수(예: 6회)와 비교하게 되어 톱세트를 실제로 친 주도 영원히 미달로
 * 처리된다(토마토팜 위젯 '이번 주 근력 달성 ✓' 소실의 진짜 원인). 그래서 무게·횟수를
 * 함께 만족한 세트 중에서 고른다.
 */
export function resolveTopSetHit(workingSets = [], plan = {}) {
  const targetKg = Number(plan?.kg) || 0;
  const targetReps = Number(plan?.reps) || 0;
  return (Array.isArray(workingSets) ? workingSets : []).reduce((best, set) => {
    const kg = Number(set?.kg) || 0;
    const reps = Number(set?.reps) || 0;
    if (kg < targetKg || reps < targetReps) return best;
    return (!best || reps > (Number(best?.reps) || 0)) ? set : best;
  }, null);
}

/** 달성 색칠 — 유저의 명시적 액션. log: { at, actualReps, rir, note, amrapReps, suppDone } */
export function paintWeek(board, { benchmarkId, track = 'volume', weekStart, log = {} }) {
  const bm = benchmarkById(board, benchmarkId);
  if (!bm) return false;
  const wk = mondayOf(weekStart);
  const entry = {
    paintedAt: log.at || null,
    actualReps: log.actualReps ?? null,
    rir: log.rir ?? null,
    note: log.note || '',
  };
  if (bm.program === 'wendler') {
    bm.wendlerLog = bm.wendlerLog || {};
    bm.wendlerLog[wk] = { ...entry, amrapReps: log.amrapReps ?? null, suppDone: log.suppDone ?? null };
    return true;
  }
  const step = _stepCoveringWeek(board, benchmarkId, track, wk);
  if (!step) return false;
  step.weekLog = step.weekLog || {};
  step.weekLog[wk] = entry;
  const allPainted = Array.from({ length: step.span }, (_, i) => addWeeks(step.weekStart, i))
    .every(w => step.weekLog[w]?.paintedAt);
  if (allPainted) step.state = 'done';
  return true;
}

/**
 * 못 채운 날 기록 + 계획 조정 (계약 5 — 1순위 "한 주 더 도전").
 * choice: 'extend' | 'lowerKg' | 'lowerReps' | 'none'(기록만)
 */
export function recordMiss(board, { benchmarkId, track = 'volume', weekStart, log = {}, choice = 'none', params = {} }) {
  const bm = benchmarkById(board, benchmarkId);
  if (!bm) return false;
  const wk = mondayOf(weekStart);
  const attempted = log.attempted === true || log.performed === true || !!log.at ||
    _hasMissValue(log.actualKg) || _hasMissValue(log.actualReps) || _hasMissValue(log.amrapReps);
  const missEntry = {
    missed: true,
    attempted,
    missedAt: log.at || null,
    actualKg: log.actualKg ?? null,
    actualReps: log.actualReps ?? null,
    rir: log.rir ?? null,
    note: log.note || '',
  };

  if (bm.program === 'wendler') {
    bm.wendlerLog = bm.wendlerLog || {};
    bm.wendlerLog[wk] = { ...(bm.wendlerLog[wk] || {}), ...missEntry };
    return true;
  }

  const step = _stepCoveringWeek(board, benchmarkId, track, wk);
  if (!step) return false;
  step.weekLog = step.weekLog || {};
  step.weekLog[wk] = { ...(step.weekLog[wk] || {}), ...missEntry };
  step.state = 'missed';

  const cycle = (board.cycles || []).find(c => c.id === step.cycleId);
  const cycleEnd = cycle ? addWeeks(cycle.startDate, cycle.weeks) : null;

  if (choice === 'extend') {
    // 이 칸을 1주 연장, 같은 트랙의 뒤 스텝들을 1주씩 밀고 사이클 끝에서 클립
    step.span += 1;
    const after = _stepsOf(board, benchmarkId, track, step.cycleId)
      .filter(s => s.id !== step.id && weeksBetween(step.weekStart, s.weekStart) > 0);
    for (const s of after) s.weekStart = addWeeks(s.weekStart, 1);
    if (cycleEnd) {
      for (const s of [step, ...after]) {
        const room = weeksBetween(s.weekStart, cycleEnd);
        if (room <= 0) {
          board.steps = board.steps.filter(x => x.id !== s.id); // 다음 사이클로 이월(정산 때 재생성)
        } else if (s.span > room) {
          s.span = room;
        }
      }
    }
  } else if (choice === 'lowerKg') {
    const delta = Number(params.deltaKg) > 0 ? Number(params.deltaKg) : 2.5;
    step.kg = Math.max(0, roundToPlate(step.kg - delta, 0.5));
    step.state = 'planned'; // 새 기준으로 재도전
  } else if (choice === 'lowerReps') {
    const reps = Math.max(1, Math.round(Number(params.reps) || (step.reps - 2)));
    step.reps = reps;
    step.state = 'planned';
  }
  return true;
}

/** 조정 미리보기 — 복제 보드에 적용 후 before/after 셀 요약 반환 */
export function previewAdjust(board, args, todayKey) {
  const bm = benchmarkById(board, args.benchmarkId);
  const step = _stepCoveringWeek(board, args.benchmarkId, args.track || 'volume', mondayOf(args.weekStart));
  const cycleId = step?.cycleId || activeCycleOf(board, bm?.groupId)?.id;
  const summarize = (b) => expandColumnCells(b, args.benchmarkId, args.track || 'volume', cycleId, todayKey)
    .filter(c => c.kind === 'stair')
    .map(c => ({ kg: c.kg, reps: c.reps, weekStart: c.weekStart, span: c.span, state: c.state }));
  const before = summarize(board);
  const clone = cloneBoard(board);
  recordMiss(clone, args);
  const after = summarize(clone);
  return { before, after };
}

// ----------------------------------------------------------------
// 오늘의 배열 (계약 13)
// ----------------------------------------------------------------

export function getLineup(board, dateKeyStr) {
  const list = board.lineups?.[dateKeyStr];
  return Array.isArray(list) ? [...list].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
}

/** 오늘 행 칸 담기/빼기. 반환: 현재 배열 */
export function toggleLineup(board, dateKeyStr, benchmarkId, track = 'volume') {
  board.lineups = board.lineups || {};
  const cur = getLineup(board, dateKeyStr);
  const idx = cur.findIndex(x => x.benchmarkId === benchmarkId && x.track === track);
  if (idx >= 0) {
    cur.splice(idx, 1);
    cur.forEach((x, i) => { x.order = i; });
  } else {
    cur.push({ benchmarkId, track, order: cur.length });
  }
  board.lineups[dateKeyStr] = cur;
  // 보관: 최근 40일치만 유지
  const keys = Object.keys(board.lineups).sort();
  while (keys.length > 40) delete board.lineups[keys.shift()];
  return cur;
}

// ----------------------------------------------------------------
// 정산 (계약 6·7·8)
// ----------------------------------------------------------------

export function isSettleDue(board, groupId, todayKey) {
  const cycle = activeCycleOf(board, groupId);
  return !!cycle && isCycleFinished(cycle, todayKey);
}

function _missedCount(board, bm, track, cycleId) {
  if (bm.program === 'wendler') {
    const cycle = (board.cycles || []).find(c => c.id === cycleId);
    if (!cycle) return 0;
    let n = 0;
    const scoredWeeks = bm.wendler?.templateVersion === W863_ORIGINAL_VERSION
      ? Math.max(0, cycle.weeks - 1)
      : cycle.weeks;
    for (let w = 0; w < scoredWeeks; w++) {
      const log = bm.wendlerLog?.[addWeeks(cycle.startDate, w)];
      if (log?.missed && !log?.paintedAt) n++;
    }
    return n;
  }
  let n = 0;
  for (const s of _stepsOf(board, bm.id, track, cycleId)) {
    for (const log of Object.values(s.weekLog || {})) {
      if (log?.missed && !log?.paintedAt) n++;
    }
    if (s.state === 'missed') n = Math.max(n, 1);
  }
  return n;
}

/** 정산 행 — 트랙별(stair) / 벤치마크별(wendler). 못 채운 종목은 '유지' 기본(계약 7). */
export function buildSettleRows(board, groupId) {
  const cycle = activeCycleOf(board, groupId);
  if (!cycle) return [];
  const rows = [];
  for (const bm of activeBenchmarks(board, groupId)) {
    if (bm.program === 'wendler') {
      _normalizeWendlerBenchmark(board, bm, { fallbackStartDate: cycle.startDate });
      const isOriginal = bm.wendler?.templateVersion === W863_ORIGINAL_VERSION;
      const currentTm = isOriginal
        ? bm.wendler.oneRmKg
        : (_resolveWendlerTmAnchor(bm, cycle.startDate)?.tmKg || bm.wendler.tmKg);
      const missed = _missedCount(board, bm, null, cycle.id);
      rows.push({
        key: bm.id,
        benchmarkId: bm.id,
        program: 'wendler',
        label: bm.label,
        trackLabel: isOriginal ? '8/6/3 1RM' : '웬들러',
        currentKg: currentTm,
        incrementKg: bm.wendler.incrementKg,
        nextKg: isOriginal
          ? Math.round((currentTm + bm.wendler.incrementKg) * 10) / 10
          : roundToPlate(currentTm + bm.wendler.incrementKg, 0.5),
        missedCount: missed,
        defaultDecision: missed > 0 ? 'hold' : 'grow',
        isTm: !isOriginal,
        isOneRm: isOriginal,
      });
      continue;
    }
    for (const t of bm.tracks) {
      const cur = currentKgOf(board, bm, t);
      const missed = _missedCount(board, bm, t, cycle.id);
      rows.push({
        key: `${bm.id}:${t}`,
        benchmarkId: bm.id,
        track: t,
        program: 'stair',
        label: bm.label,
        trackLabel: TM2_TRACK_LABELS[t],
        currentKg: cur.kg,
        currentReps: cur.reps,
        incrementKg: trackIncrementKgOf(bm, t),
        nextKg: _roundStairKg(cur.kg + trackIncrementKgOf(bm, t), trackIncrementKgOf(bm, t)),
        missedCount: missed,
        defaultDecision: missed > 0 ? 'hold' : 'grow',
        isTm: false,
      });
    }
  }
  return rows;
}

/**
 * 정산 확정 — 성장폭은 종목별 설정값 그대로(계약 7, 하드코딩 금지).
 * decisions: { [row.key]: 'grow'|'hold' } (없으면 row.defaultDecision)
 */
export function applySettle(board, groupId, decisions = {}, todayKey, now = null) {
  const cycle = activeCycleOf(board, groupId);
  if (!cycle) return null;
  const rows = buildSettleRows(board, groupId);
  const results = [];
  const candidate = addWeeks(cycle.startDate, cycle.weeks);
  const todayMon = mondayOf(todayKey);
  const nextStart = weeksBetween(candidate, todayMon) > 0 ? todayMon : candidate;

  for (const row of rows) {
    const bm = benchmarkById(board, row.benchmarkId);
    const decision = decisions[row.key] || row.defaultDecision;
    const grow = decision === 'grow';
    if (row.program === 'wendler') {
      const before = row.currentKg;
      const after = grow
        ? (bm.wendler?.templateVersion === W863_ORIGINAL_VERSION
          ? Math.round((before + bm.wendler.incrementKg) * 10) / 10
          : roundToPlate(before + bm.wendler.incrementKg, 0.5))
        : before;
      if (bm.wendler?.templateVersion === W863_ORIGINAL_VERSION) {
        bm.wendler.oneRmKg = after;
        const nextTm = roundToPlate(after * 0.9, 0.5);
        _upsertWendlerTmAnchor(bm, nextStart, nextTm, { source: 'settle', updatedAt: now });
        results.push({ benchmarkId: bm.id, program: 'wendler', before, after, decision, oneRmKg: after, tmAnchorWeekStart: nextStart });
      } else {
        _upsertWendlerTmAnchor(bm, nextStart, after, { source: 'settle', updatedAt: now });
        results.push({ benchmarkId: bm.id, program: 'wendler', before, after, decision, tmAnchorWeekStart: nextStart });
      }
    } else {
      const before = currentKgOf(board, bm, row.track).kg;
      const progressionWeeks = Math.max(0, Math.round(Number(bm.progressionWeeks) || 0));
      const lastStep = _stepsOf(board, bm.id, row.track, cycle.id).at(-1) || null;
      const progressionStartDate = bm.progressionStartDate || cycle.startDate;
      const previousLevel = progressionWeeks && lastStep
        ? Math.floor(Math.max(0, weeksBetween(progressionStartDate, lastStep.weekStart)) / progressionWeeks)
        : 0;
      const nextLevel = progressionWeeks
        ? Math.floor(Math.max(0, weeksBetween(progressionStartDate, nextStart)) / progressionWeeks)
        : previousLevel + 1;
      const increaseCount = Math.max(0, nextLevel - previousLevel);
      const incrementKg = trackIncrementKgOf(bm, row.track);
      const after = grow ? _roundStairKg(before + incrementKg * increaseCount, incrementKg) : before;
      bm.seed[row.track] = { kg: after, reps: currentKgOf(board, bm, row.track).reps };
      results.push({ benchmarkId: bm.id, track: row.track, program: 'stair', before, after, decision });
    }
  }

  cycle.status = 'settled';
  cycle.settle = { decisions: { ...decisions }, settledAt: now };

  // 다음 사이클 생성 + 기본 계획(스텝) 재생성
  const nextCycle = _makeCycle(groupId, nextStart, cycle.weeks);
  board.cycles.push(nextCycle);
  for (const bm of activeBenchmarks(board, groupId)) {
    _planBenchmarkSteps(board, bm, nextCycle);
  }

  const entry = {
    cycleId: cycle.id,
    groupId,
    period: { start: cycle.startDate, end: addDays(addWeeks(cycle.startDate, cycle.weeks), -1) },
    settledAt: now,
    results,
  };
  board.history = [...(board.history || []), entry].slice(-60);
  return { entry, nextCycle };
}

// ----------------------------------------------------------------
// 종목 추가/삭제 (계약 12 — 빼기=보관, 기록 보존, 재추가 시 이어서)
// ----------------------------------------------------------------

export function archiveBenchmark(board, benchmarkId) {
  const bm = benchmarkById(board, benchmarkId);
  if (!bm) return false;
  bm.status = 'archived';
  return true;
}

/**
 * 종목 추가 — 같은 movementId의 보관 종목이 있으면 복원(이어서),
 * 없으면 새로 생성. 활성 사이클의 남은 주에 스텝 생성(다음 주 월요일부터).
 */
export function addBenchmark(board, candidate, todayKey) {
  const candKey = candidate.exerciseId || candidate.movementId;
  const archived = (board.benchmarks || []).find(b =>
    b.status === 'archived' && candKey && (b.exerciseId || b.movementId) === candKey && b.groupId === candidate.groupId);
  let bm;
  if (archived) {
    archived.status = 'active';
    bm = archived;
  } else {
    bm = _makeBenchmark(candidate, (board.benchmarks || []).length);
    board.benchmarks.push(bm);
  }
  let cycle = activeCycleOf(board, bm.groupId);
  if (!cycle) {
    cycle = _makeCycle(bm.groupId, mondayOf(todayKey));
    board.cycles.push(cycle);
  }
  if (bm.program !== 'wendler') {
    const nextMonday = addWeeks(mondayOf(todayKey), 1);
    const fromWeek = weeksBetween(cycle.startDate, nextMonday) < cycle.weeks && weeksBetween(cycle.startDate, nextMonday) >= 0
      ? nextMonday : null;
    for (const t of bm.tracks) {
      const has = _stepsOf(board, bm.id, t, cycle.id).length > 0;
      if (!has && fromWeek) {
        const seed = currentKgOf(board, bm, t);
        const span = Math.max(1, cycle.weeks - weeksBetween(cycle.startDate, fromWeek));
        board.steps.push(_makeStep(bm, t, cycle, seed.kg, seed.reps, fromWeek, span));
      }
    }
  }
  return bm;
}

// ----------------------------------------------------------------
// 종목 카탈로그 ↔ 성장보드 프로그램 연결
// ----------------------------------------------------------------

function _ensureBoardV2(board, { todayKey = toKey(new Date()), source = 'exercise-program' } = {}) {
  const b = board && typeof board === 'object' ? board : createEmptyBoardV2({ startDate: todayKey, source });
  b.version = b.version || 2;
  b.defaults = b.defaults || { ...TM2_DEFAULTS };
  b.groups = Array.isArray(b.groups) && b.groups.length
    ? b.groups
    : TM2_GROUPS.map(g => ({ id: g.id, label: g.label, bodyRegion: g.bodyRegion, order: g.order }));
  b.benchmarks = Array.isArray(b.benchmarks) ? b.benchmarks : [];
  b.cycles = Array.isArray(b.cycles) ? b.cycles : [];
  b.steps = Array.isArray(b.steps) ? b.steps : [];
  b.lineups = b.lineups && typeof b.lineups === 'object' ? b.lineups : {};
  b.history = Array.isArray(b.history) ? b.history : [];
  return b;
}

function _exerciseKeyParts(exercise = {}) {
  return {
    exerciseId: exercise.exerciseId || exercise.id || null,
    movementId: exercise.movementId || null,
  };
}

function _benchmarkExerciseRank(bm = {}, exercise = {}) {
  const { exerciseId, movementId } = _exerciseKeyParts(exercise);
  if (exerciseId && bm.exerciseId === exerciseId) return 1;
  if (movementId && bm.movementId === movementId) return (exerciseId && bm.exerciseId) ? 3 : 2;
  return 0;
}

export function findExerciseProgramBenchmark(board, exercise = {}, { includeArchived = false } = {}) {
  const list = Array.isArray(board?.benchmarks) ? board.benchmarks : [];
  const candidates = list
    .map((bm, index) => ({ bm, index, rank: _benchmarkExerciseRank(bm, exercise) }))
    .filter(item => item.rank && (includeArchived || item.bm.status !== 'archived'));
  candidates.sort((a, b) => {
    const activeDelta = (a.bm.status === 'archived' ? 1 : 0) - (b.bm.status === 'archived' ? 1 : 0);
    if (activeDelta) return activeDelta;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.index - b.index;
  });
  return candidates[0]?.bm || null;
}

function _isWendlerProgramValue(value) {
  const p = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return p === 'wendler'
    || p === 'w863'
    || p === '863'
    || p === '8/6/3'
    || p === '8-6-3'
    || p === '8_6_3'
    || /^w?8[/_-]6[/_-]3$/.test(p);
}

export function isWendlerBenchmark(benchmark = {}) {
  return _isWendlerProgramValue(benchmark.program)
    || _isWendlerProgramValue(benchmark.scheme)
    || _isWendlerProgramValue(benchmark.wendler?.scheme)
    || benchmark.templateVersion === W863_ORIGINAL_VERSION
    || benchmark.wendler?.templateVersion === W863_ORIGINAL_VERSION;
}

function _normalizeProgram(program) {
  const p = String(program || '').trim();
  if (p === 'none' || p === 'default' || p === 'off') return 'none';
  if (p === 'wendler') return 'wendler';
  if (p === 'custom') return 'custom';
  return 'stair';
}

function _normalizeProgramTracks(program, tracks) {
  if (program === 'wendler') return ['volume'];
  const raw = Array.isArray(tracks) ? tracks : [];
  const out = TM2_TRACKS.filter(t => raw.includes(t));
  return out.length ? out : ['volume'];
}

function _seedSpecFor(track, config = {}, existing = null) {
  const seed = config.seed && typeof config.seed === 'object' ? config.seed : {};
  const rawTracks = config.tracks && !Array.isArray(config.tracks) && typeof config.tracks === 'object' ? config.tracks : {};
  const raw = seed[track] || rawTracks[track] || config[track] || null;
  const fallback = existing || {};
  const kg = Number(raw?.kg ?? raw?.startKg ?? fallback.kg ?? 0);
  const reps = Number(raw?.reps ?? raw?.startReps ?? fallback.reps ?? (track === 'intensity' ? 8 : 12));
  return {
    kg: kg > 0 ? kg : 0,
    reps: reps > 0 ? Math.round(reps) : (track === 'intensity' ? 8 : 12),
  };
}

function _candidateFromExerciseProgram(exercise = {}, config = {}, { movements = [] } = {}) {
  const program = _normalizeProgram(config.program);
  const groupId = config.groupId || exercise.groupId || exerciseGroupId(exercise, movements);
  if (!groupId) return null;
  const tracks = _normalizeProgramTracks(program, config.tracks);
  const seed = {};
  for (const track of tracks) seed[track] = _seedSpecFor(track, config);
  return {
    exerciseId: exercise.exerciseId || exercise.id || null,
    movementId: exercise.movementId || null,
    muscleId: exercise.muscleId || null,
    label: config.label || exercise.name || exercise.label || exercise.id || '종목',
    short: config.short || null,
    groupId,
    tracks: seed,
    incrementKg: config.incrementKg,
    setsDefault: config.setsDefault,
    incrementKgByTrack: config.incrementKgByTrack,
    setsByTrack: config.setsByTrack,
    gymNote: config.gymNote || exercise.__gymNote || '',
    meta: config.meta || {},
    wendler: program === 'wendler' ? (config.wendler || {}) : null,
  };
}

function _programStartDateKey(config = {}) {
  const raw = config.programStartDate || config.wendler?.programStartDate || config.startDate || config.cycleStartDate || '';
  const key = String(raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function _roundProgramKg(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function _programStartDateForBenchmark(board, bm = {}, fallbackKey = null) {
  const raw = _programStartDateKey(bm) || activeCycleOf(board, bm.groupId)?.startDate || fallbackKey || toKey(new Date());
  return mondayOf(raw);
}

function _setProgramStartDateForBenchmark(board, bm, fallbackKey = null) {
  const start = _programStartDateForBenchmark(board, bm, fallbackKey);
  bm.programStartDate = start;
  if (bm.wendler && typeof bm.wendler === 'object') bm.wendler.programStartDate = start;
  return start;
}

function _rawTmAnchors(rawAnchors) {
  if (Array.isArray(rawAnchors)) return rawAnchors;
  if (rawAnchors && typeof rawAnchors === 'object') {
    return Object.entries(rawAnchors).map(([weekStart, value]) => (
      value && typeof value === 'object' ? { weekStart, ...value } : { weekStart, tmKg: value }
    ));
  }
  return [];
}

function _normalizeTmAnchors(rawAnchors, programStartDate, fallbackTmKg, { source = 'legacy' } = {}) {
  const byWeek = new Map();
  const push = (raw) => {
    const key = _programStartDateKey({ programStartDate: raw?.weekStart || raw?.startDate || raw?.date });
    const tm = _roundProgramKg(raw?.tmKg ?? raw?.tm ?? raw?.kg);
    if (!key || tm <= 0) return;
    const anchor = { weekStart: mondayOf(key), tmKg: tm };
    if (raw?.source) anchor.source = String(raw.source);
    if (raw?.updatedAt != null) anchor.updatedAt = raw.updatedAt;
    byWeek.set(anchor.weekStart, anchor);
  };
  for (const raw of _rawTmAnchors(rawAnchors)) push(raw);

  const fallbackTm = _roundProgramKg(fallbackTmKg);
  if (programStartDate && fallbackTm > 0 && !byWeek.has(programStartDate)) {
    byWeek.set(programStartDate, { weekStart: programStartDate, tmKg: fallbackTm, source });
  }

  return Array.from(byWeek.values()).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

function _latestTmAnchor(anchors = []) {
  return anchors[anchors.length - 1] || null;
}

function _resolveWendlerTmAnchor(bm = {}, weekStart) {
  const anchors = _normalizeTmAnchors(bm.wendler?.tmAnchors, bm.programStartDate, bm.wendler?.tmKg);
  if (!anchors.length) return null;
  const wk = mondayOf(weekStart);
  let chosen = null;
  for (const anchor of anchors) {
    if (weeksBetween(anchor.weekStart, wk) >= 0) chosen = anchor;
    else break;
  }
  return chosen || anchors[0];
}

function _upsertWendlerTmAnchor(bm, weekStart, tmKg, { source = 'manual', updatedAt = null } = {}) {
  if (!bm.wendler || typeof bm.wendler !== 'object') bm.wendler = {};
  const wk = mondayOf(weekStart);
  const tm = _roundProgramKg(tmKg);
  if (tm <= 0) return null;
  const anchors = _normalizeTmAnchors(bm.wendler.tmAnchors, bm.programStartDate || wk, bm.wendler.tmKg);
  const next = { weekStart: wk, tmKg: tm, source };
  if (updatedAt != null) next.updatedAt = updatedAt;
  bm.wendler.tmAnchors = anchors.filter(anchor => anchor.weekStart !== wk).concat(next)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  bm.wendler.tmKg = _latestTmAnchor(bm.wendler.tmAnchors)?.tmKg || tm;
  return next;
}

function _normalizeWendlerBenchmark(board, bm, { fallbackStartDate = null, primaryMajor = null, trackSpec = null } = {}) {
  if (!bm || bm.program !== 'wendler') return bm;
  const major = primaryMajor || TM2_GROUPS.find(g => g.id === bm.groupId)?.majors?.[0] || bm.groupId;
  const programStartDate = _setProgramStartDateForBenchmark(board, bm, fallbackStartDate);
  const raw = bm.wendler || {};
  const cfg = normalizeWendlerConfig(raw, {
    primaryMajor: major,
    trackSpec: trackSpec || (bm.seed?.volume ? { startKg: bm.seed.volume.kg, startReps: bm.seed.volume.reps } : null),
    movementId: bm.movementId,
    exerciseId: bm.exerciseId,
    label: bm.label,
  });
  const tmAnchors = _normalizeTmAnchors(raw.tmAnchors, programStartDate, cfg.tmKg);
  bm.wendler = {
    ...cfg,
    programStartDate,
    tmAnchors,
    tmKg: _latestTmAnchor(tmAnchors)?.tmKg || cfg.tmKg,
  };
  if (cfg.templateVersion === W863_ORIGINAL_VERSION) {
    for (const cycle of (board.cycles || [])) {
      if (cycle.groupId === bm.groupId && cycle.status !== 'settled') cycle.weeks = Math.max(7, Number(cycle.weeks) || 0);
    }
  }
  return bm;
}

function _activeCycleForProgram(board, groupId, todayKey) {
  const startDate = mondayOf(todayKey);
  let cycle = activeCycleOf(board, groupId);
  if (!cycle) {
    cycle = _makeCycle(groupId, startDate);
    board.cycles.push(cycle);
  }
  return cycle;
}

export function normalizeLegacyPrograms(board, { fallbackStartDate = null } = {}) {
  if (!board || typeof board !== 'object') return { board, changed: false };
  const before = JSON.stringify(board);
  for (const bm of (Array.isArray(board.benchmarks) ? board.benchmarks : [])) {
    if (!isWendlerBenchmark(bm)) continue;
    bm.program = 'wendler';
    bm.tracks = ['volume'];
    if (bm.seed && typeof bm.seed === 'object') delete bm.seed.intensity;
    if (bm.setsByTrack && typeof bm.setsByTrack === 'object') delete bm.setsByTrack.intensity;
    if (bm.incrementKgByTrack && typeof bm.incrementKgByTrack === 'object') delete bm.incrementKgByTrack.intensity;
    const raw = bm.wendler && typeof bm.wendler === 'object' ? bm.wendler : {};
    bm.wendler = {
      ...raw,
      scheme: raw.scheme || 'w863',
      ...(raw.templateVersion || raw.scheme === 'w531' || raw.scheme === 'custom'
        ? {}
        : { templateVersion: W863_ORIGINAL_VERSION }),
    };
    const cycle = (board.cycles || []).find(item => item.groupId === bm.groupId && item.status === 'active');
    _normalizeWendlerBenchmark(board, bm, {
      fallbackStartDate: fallbackStartDate || cycle?.startDate || bm.programStartDate || null,
    });
  }
  return { board, changed: before !== JSON.stringify(board) };
}

function _stepHasLog(step = {}) {
  return Object.keys(step.weekLog || {}).length > 0;
}

function _syncStairSteps(board, bm, cycle, todayKey, { fromCycleStart = false } = {}) {
  if (!cycle) return;
  for (const track of (bm.tracks || ['volume'])) {
    const seed = bm.seed?.[track] || { kg: 0, reps: track === 'intensity' ? 8 : 12 };
    const existing = _stepsOf(board, bm.id, track, cycle.id);
    if (!existing.length) {
      const weekStart = fromCycleStart ? cycle.startDate : mondayOf(todayKey);
      _planBenchmarkSteps(board, { ...bm, tracks: [track], seed: { [track]: seed } }, cycle, weekStart);
      continue;
    }
    if (existing.length && existing.every(step => !_stepHasLog(step))) {
      board.steps = (board.steps || []).filter(step => !(step.benchmarkId === bm.id && step.track === track && step.cycleId === cycle.id));
      const weekStart = fromCycleStart ? cycle.startDate : mondayOf(todayKey);
      _planBenchmarkSteps(board, { ...bm, tracks: [track], seed: { [track]: seed } }, cycle, weekStart);
      continue;
    }
    const editable = existing.find(step => !_stepHasLog(step));
    if (editable) {
      editable.kg = seed.kg;
      editable.reps = seed.reps;
      continue;
    }
    const weekStart = fromCycleStart ? cycle.startDate : mondayOf(todayKey);
    const span = Math.max(1, cycle.weeks - weeksBetween(cycle.startDate, weekStart));
    board.steps.push(_makeStep(bm, track, cycle, seed.kg, seed.reps, weekStart, span));
  }
}

function _removeActiveCycleSteps(board, bm) {
  const cycle = activeCycleOf(board, bm.groupId);
  if (!cycle) return;
  board.steps = (board.steps || []).filter(s => !(s.benchmarkId === bm.id && s.cycleId === cycle.id));
}

function _applyExerciseProgramToBenchmark(board, bm, candidate, config, todayKey) {
  const program = _normalizeProgram(config.program);
  const previousProgram = bm.program === 'wendler' ? 'wendler' : 'stair';
  const tracks = _normalizeProgramTracks(program, config.tracks);
  bm.status = 'active';
  bm.exerciseId = candidate.exerciseId || bm.exerciseId || null;
  bm.movementId = candidate.movementId || bm.movementId || null;
  bm.muscleId = candidate.muscleId || bm.muscleId || null;
  bm.groupId = candidate.groupId;
  bm.label = candidate.label || bm.label || '종목';
  bm.short = candidate.short || bm.short || String(bm.label).slice(0, 5);
  bm.incrementKg = Number(config.incrementKg) > 0 ? Number(config.incrementKg) : (bm.incrementKg || defaultIncrementForGroup(bm.groupId));
  bm.setsDefault = Math.max(1, Math.round(Number(config.setsDefault) || bm.setsDefault || 4));
  bm.incrementKgByTrack = { ...(bm.incrementKgByTrack || {}), ...(config.incrementKgByTrack || {}) };
  bm.setsByTrack = { ...(bm.setsByTrack || {}), ...(config.setsByTrack || {}) };
  bm.meta = {
    ...(bm.meta || {}),
    ...(config.meta || {}),
    ...(config.gymNote ? { gymNote: config.gymNote } : {}),
  };
  bm.tracks = tracks;
  bm.seed = bm.seed || {};
  for (const track of tracks) {
    const existing = currentKgOf(board, bm, track);
    bm.seed[track] = _seedSpecFor(track, config, existing);
  }

  const cycle = _activeCycleForProgram(board, bm.groupId, todayKey, config);
  if (program === 'wendler') {
    const major = TM2_GROUPS.find(g => g.id === bm.groupId)?.majors?.[0] || bm.groupId;
    bm.program = 'wendler';
    const rawWendler = { ...(bm.wendler || {}), ...(config.wendler || {}) };
    bm.wendler = rawWendler;
    const requestedStart = _programStartDateKey(config) || _programStartDateKey(rawWendler);
    if (requestedStart) bm.programStartDate = mondayOf(requestedStart);
    _normalizeWendlerBenchmark(board, bm, {
      fallbackStartDate: cycle?.startDate || todayKey,
      primaryMajor: major,
      trackSpec: bm.seed?.volume ? { startKg: bm.seed.volume.kg, startReps: bm.seed.volume.reps } : null,
    });
    if (bm.wendler?.templateVersion === W863_ORIGINAL_VERSION && Number(config.wendler?.oneRmKg) > 0) {
      const derivedTm = roundToPlate(Number(config.wendler.oneRmKg) * 0.9, 0.5);
      _upsertWendlerTmAnchor(bm, bm.programStartDate, derivedTm, { source: 'manual' });
    } else if (Number(config.wendler?.tmKg) > 0) {
      _upsertWendlerTmAnchor(bm, bm.programStartDate, config.wendler.tmKg, { source: 'manual' });
    }
    bm.wendlerLog = bm.wendlerLog || {};
    _removeActiveCycleSteps(board, bm);
  } else {
    bm.program = 'stair';
    _syncStairSteps(board, bm, cycle, todayKey, { fromCycleStart: previousProgram === 'wendler' });
  }
  return bm;
}

export function getExerciseProgramSettings(board, exercise = {}, options = {}) {
  const bm = findExerciseProgramBenchmark(board, exercise, options);
  if (!bm || bm.status === 'archived') return { program: 'none', benchmark: null };
  const cycle = activeCycleOf(board, bm.groupId);
  if (bm.program === 'wendler') _normalizeWendlerBenchmark(board, bm, { fallbackStartDate: cycle?.startDate || null });
  return {
    program: bm.program === 'wendler' ? 'wendler' : 'stair',
    benchmarkId: bm.id,
    exerciseId: bm.exerciseId || null,
    movementId: bm.movementId || null,
    groupId: bm.groupId || null,
    programStartDate: bm.program === 'wendler' ? bm.programStartDate || null : cycle?.startDate || null,
    tracks: bm.program === 'wendler' ? ['volume'] : [...(bm.tracks || ['volume'])],
    seed: cloneBoard(bm.seed || {}),
    setsDefault: bm.setsDefault || 4,
    setsByTrack: cloneBoard(bm.setsByTrack || {}),
    incrementKg: bm.program === 'wendler' ? bm.wendler?.incrementKg || bm.incrementKg : bm.incrementKg,
    incrementKgByTrack: cloneBoard(bm.incrementKgByTrack || {}),
    wendler: bm.program === 'wendler' ? cloneBoard(bm.wendler || {}) : null,
    benchmark: bm,
  };
}

export function upsertExerciseProgramBenchmark(board, exercise = {}, config = {}, options = {}) {
  const todayKey = options.todayKey || toKey(new Date());
  const b = _ensureBoardV2(board, { todayKey, source: options.source });
  const program = _normalizeProgram(config.program);
  const existing = findExerciseProgramBenchmark(b, exercise, { includeArchived: true });

  if (program === 'custom') {
    return { board: b, benchmark: existing, action: 'skipped', reason: 'custom-not-supported' };
  }
  if (program === 'none') {
    if (existing) {
      existing.status = 'archived';
      return { board: b, benchmark: existing, action: 'archived' };
    }
    return { board: b, benchmark: null, action: 'noop' };
  }

  const candidate = _candidateFromExerciseProgram(exercise, config, { movements: options.movements || [] });
  if (!candidate) return { board: b, benchmark: null, action: 'skipped', reason: 'missing-group' };

  let bm = existing || null;
  const action = bm ? (bm.status === 'archived' ? 'restored' : 'updated') : 'created';
  if (!bm) {
    bm = _makeBenchmark({ ...candidate, wendler: program === 'wendler' ? (config.wendler || {}) : null }, b.benchmarks.length);
    b.benchmarks.push(bm);
  }
  _applyExerciseProgramToBenchmark(b, bm, candidate, config, todayKey);
  return { board: b, benchmark: bm, action };
}

const _programTrackToCode = (track) => track === 'intensity' ? 'H' : 'M';

function _programTargetRpeOf(bm = {}) {
  return Math.max(1, Math.min(10, 10 - Number(bm.meta?.rirTarget == null ? 2 : bm.meta.rirTarget)));
}

function _programPlanForBenchmark(board, bm, { track = 'volume', weekStart = null, todayKey = null } = {}) {
  if (!bm || bm.status === 'archived') return null;
  const wkMon = mondayOf(weekStart || todayKey || toKey(new Date()));
  const cycle = activeCycleOf(board, bm.groupId);
  if (bm.program === 'wendler') {
    _normalizeWendlerBenchmark(board, bm, { fallbackStartDate: cycle?.startDate || wkMon });
    const programStartDate = bm.programStartDate;
    const programWeek = Math.max(1, weeksBetween(programStartDate, wkMon) + 1);
    const weeks = bm.wendler?.weekMap?.length || cycle?.weeks || 6;
    const cycleWeek = ((programWeek - 1) % weeks) + 1;
    const groupCycleWeek = cycle ? Math.max(1, Math.min(cycle.weeks, weekIndexOf(cycle, wkMon))) : null;
    const anchor = _resolveWendlerTmAnchor(bm, wkMon);
    const isOriginal = bm.wendler?.templateVersion === W863_ORIGINAL_VERSION;
    const anchorTm = anchor?.tmKg || bm.wendler?.tmKg || 0;
    const anchorOneRm = isOriginal && anchor?.tmKg
      ? (Math.abs(Number(anchor.tmKg) - Number(bm.wendler?.tmKg)) < 0.001
        ? bm.wendler.oneRmKg
        : roundToPlate(anchor.tmKg / 0.9, 0.5))
      : null;
    const rx = wendlerWeekPrescription({
      ...(bm.wendler || {}),
      tmKg: anchorTm,
      ...(anchorOneRm ? { oneRmKg: anchorOneRm } : {}),
    }, cycleWeek);
    return {
      kind: 'wendler',
      track: 'volume',
      weekStart: wkMon,
      week: cycleWeek,
      cycleWeek,
      programWeek,
      programStartDate,
      groupCycleWeek,
      tmAnchorWeekStart: anchor?.weekStart || null,
      tmKg: rx.tmKg,
      kg: rx.topSet?.kg || 0,
      reps: rx.topSet?.reps || 0,
      amrap: !!rx.topSet?.amrap,
      rx,
    };
  }
  const useTrack = (bm.tracks || []).includes(track) ? track : (bm.tracks || ['volume'])[0];
  let cell = null;
  if (cycle) {
    const cells = expandColumnCells(board, bm.id, useTrack, cycle.id, todayKey || wkMon);
    cell = cells.find(c => c.kind === 'stair' && weeksBetween(c.weekStart, wkMon) >= 0 && weeksBetween(c.weekStart, wkMon) < c.span);
  }
  const fallback = currentKgOf(board, bm, useTrack);
  return {
    kind: 'stair',
    track: useTrack,
    weekStart: wkMon,
    week: cycle ? Math.max(1, Math.min(cycle.weeks, weekIndexOf(cycle, wkMon))) : 1,
    kg: cell?.kg || fallback.kg || 0,
    reps: cell?.reps || fallback.reps || (useTrack === 'intensity' ? 8 : 12),
    sets: trackSetsOf(bm, useTrack),
  };
}

export function exerciseProgramWendlerSignature(plan) {
  if (plan?.kind !== 'wendler') return '';
  const rx = plan.rx || {};
  const setSig = (sets = []) => sets.map(s => [
    s.pct ?? '',
    s.kg ?? '',
    s.reps ?? '',
    s.amrap ? 'amrap' : '',
  ].join(':')).join(',');
  const supp = rx.supplemental
    ? [rx.supplemental.kind, rx.supplemental.pct, rx.supplemental.kg, rx.supplemental.sets, rx.supplemental.reps].join(':')
    : 'none';
  return [
    `tm:${rx.tmKg ?? ''}`,
    `oneRm:${rx.oneRmKg ?? ''}`,
    `template:${rx.templateVersion ?? ''}`,
    `profile:${rx.profileId ?? ''}`,
    `week:${rx.week ?? ''}`,
    `board:${rx.boardWeek ?? ''}`,
    `round:${rx.roundKg ?? ''}`,
    `warm:${setSig(rx.warmup?.sets || [])}`,
    `main:${setSig(rx.sets || [])}`,
    `singles:${setSig(rx.heavySingles || [])}`,
    `optional:${setSig(rx.optionalSets || [])}`,
    `backoff:${setSig(rx.backoff || [])}`,
    `deload:${setSig(rx.deload || [])}`,
    `supp:${supp}`,
  ].join('|');
}

// 웬들러 종목의 화면/저장 순서는 항상 웜업 → 메인 → 보조(BBB/FSL)다.
// 기존 초안이나 다른 진입점에서 세트 배열 순서가 흐트러져도 역할 순서는 보존한다.
export function orderWendlerPrescriptionSets(sets = []) {
  if (!Array.isArray(sets)) return [];
  const roleOrder = {
    warmup: 0,
    main: 1,
    heavy_single: 2,
    pr_attempt: 3,
    backoff: 4,
    deload: 5,
    supplemental: 6,
  };
  return sets
    .map((set, index) => ({
      set,
      index,
      role: roleOrder[set?.wendlerRole] ?? (set?.setType === 'warmup' ? 0 : 1),
      order: Number.isFinite(Number(set?.wendlerOrder)) ? Number(set.wendlerOrder) : index,
    }))
    .sort((a, b) => a.role - b.role || a.order - b.order || a.index - b.index)
    .map(item => item.set);
}

function _programSetsForWorkoutCard(bm, plan) {
  const rpe = _programTargetRpeOf(bm);
  if (plan.kind === 'wendler') {
    const signature = exerciseProgramWendlerSignature(plan);
    if (plan.rx?.templateVersion === W863_ORIGINAL_VERSION) {
      return (plan.rx.requiredSets || []).map((set, idx) => ({
        kg: set.kg,
        reps: set.reps,
        rpe: set.role === 'warmup' || set.role === 'deload' ? Math.max(1, rpe - 2) : rpe,
        romPct: 100,
        setType: set.role === 'warmup' ? 'warmup' : 'main',
        wendlerRole: set.role,
        wendlerPct: set.pct ?? null,
        wendlerOrder: idx,
        wendlerSignature: signature,
        amrap: !!set.amrap,
        done: false,
      }));
    }
    const sets = [];
    for (const [idx, set] of (plan.rx?.warmup?.sets || []).entries()) {
      sets.push({
        kg: set.kg,
        reps: set.reps,
        rpe: Math.max(1, rpe - 2),
        romPct: 100,
        setType: 'warmup',
        wendlerRole: 'warmup',
        wendlerPct: set.pct ?? null,
        wendlerOrder: idx,
        wendlerSignature: signature,
        done: false,
      });
    }
    sets.push(...(plan.rx?.sets || []).map((set, idx) => ({
      kg: set.kg,
      reps: set.reps,
      rpe,
      romPct: 100,
      setType: 'main',
      wendlerRole: 'main',
      wendlerPct: set.pct ?? null,
      wendlerOrder: idx,
      wendlerSignature: signature,
      amrap: !!set.amrap,
      done: false,
    })));
    const supp = plan.rx?.supplemental;
    if (supp) {
      for (let i = 0; i < Math.max(0, Number(supp.sets) || 0); i += 1) {
        sets.push({
          kg: supp.kg,
          reps: supp.reps,
          rpe,
          romPct: 100,
          setType: 'main',
          wendlerRole: 'supplemental',
          supplementalKind: supp.kind,
          wendlerPct: supp.pct ?? null,
          wendlerOrder: i,
          wendlerSignature: signature,
          done: false,
        });
      }
    }
    return orderWendlerPrescriptionSets(sets);
  }
  return Array.from({ length: Math.max(1, Number(plan.sets) || 4) }, () => ({
    kg: plan.kg,
    reps: plan.reps,
    rpe,
    romPct: 100,
    setType: 'main',
    done: false,
  }));
}

function _programRxLabel(plan, bm, track) {
  if (plan.kind === 'wendler') {
    const top = plan.rx?.topSet;
    const supp = plan.rx?.supplemental;
    const scheme = WENDLER_SCHEMES[bm.wendler?.scheme]?.label || '커스텀';
    const main = `웬들러 ${scheme} · ${top?.kg || '—'}kg x ${top?.reps || ''}${top?.amrap ? '+' : ''}`;
    if (plan.rx?.templateVersion === W863_ORIGINAL_VERSION) {
      const pr = plan.rx.optionalSets?.[0];
      return `${main}${pr ? ` · PR ${pr.kg}kg 확인` : ''}`;
    }
    const supplemental = supp ? ` · ${supp.label} ${supp.kg}kg ${supp.sets}x${supp.reps}` : '';
    return `${main}${supplemental}`;
  }
  const label = track === 'intensity' ? '강도' : '볼륨';
  return `${label} 트랙 · ${plan.sets || 4}세트 x ${plan.reps || ''}회`;
}

export function buildExerciseProgramWorkoutPrescription(board, benchmark, { track = 'volume', weekStart = null, todayKey = null, includeAlternatives = true } = {}) {
  if (!board || !benchmark || benchmark.status === 'archived') return null;
  const plan = _programPlanForBenchmark(board, benchmark, { track, weekStart, todayKey });
  if (!plan) return null;
  const bm = benchmark;
  const wkMon = plan.weekStart;
  const cycle = activeCycleOf(board, bm.groupId);
  const useTrack = plan.kind === 'wendler' ? 'volume' : plan.track;
  const code = _programTrackToCode(useTrack);
  const sets = _programSetsForWorkoutCard(bm, plan);
  const optionalSets = plan.kind === 'wendler'
    ? (plan.rx?.optionalSets || []).map((set, idx) => ({
      kg: set.kg,
      reps: set.reps,
      rpe: _programTargetRpeOf(bm),
      romPct: 100,
      setType: 'main',
      wendlerRole: 'pr_attempt',
      wendlerPct: set.pct ?? null,
      wendlerOrder: idx,
      wendlerSignature: exerciseProgramWendlerSignature(plan),
      optional: true,
      requiresConfirmation: true,
      done: false,
    }))
    : [];
  const signature = plan.kind === 'wendler' ? exerciseProgramWendlerSignature(plan) : '';
  const label = _programRxLabel(plan, bm, useTrack);
  const prescription = {
    benchmarkId: bm.id,
    cycleId: cycle?.id || null,
    benchmarkTrack: code,
    track: code,
    startKg: plan.kg || 0,
    repsLow: plan.reps || 0,
    repsHigh: plan.reps || 0,
    targetSets: sets.length,
    targetRpe: _programTargetRpeOf(bm),
    action: plan.kind === 'wendler' ? 'wendler' : 'plan',
    actionLabel: plan.kind === 'wendler' ? '웬들러' : (useTrack === 'intensity' ? '강도 트랙' : '볼륨 트랙'),
    label,
    reason: plan.kind === 'wendler' ? '종목에 설정된 웬들러 처방을 불러왔어요.' : '종목에 설정된 성장보드 트랙 처방을 불러왔어요.',
    transparency: {
      detail: plan.kind === 'wendler'
        ? `${plan.week}주차 · ${label}`
        : `${plan.week}주차 · ${plan.kg || '—'}kg × ${plan.reps || ''}회`,
    },
    applySets: true,
    sets,
    ...(optionalSets.length ? { optionalSets } : {}),
    program: plan.kind,
    ...(signature ? { wendlerSignature: signature } : {}),
  };
  if (plan.kind !== 'wendler' && includeAlternatives) {
    prescription.trackAlternatives = {};
    for (const altTrack of (bm.tracks || [useTrack])) {
      const alt = buildExerciseProgramWorkoutPrescription(board, bm, { track: altTrack, weekStart: wkMon, todayKey: todayKey || wkMon, includeAlternatives: false });
      if (alt?.prescription) prescription.trackAlternatives[_programTrackToCode(altTrack)] = alt.prescription;
    }
  }
  const recommendationMeta = {
    kind: 'benchmark',
    source: 'test_board_v2',
    program: plan.kind,
    track: code,
    cycleWeek: plan.cycleWeek || plan.week,
    ...(plan.kind === 'wendler' ? {
      programWeek: plan.programWeek,
      programStartDate: plan.programStartDate,
      groupCycleWeek: plan.groupCycleWeek,
      tmAnchorWeekStart: plan.tmAnchorWeekStart,
      tmKg: plan.tmKg,
      oneRmKg: plan.rx?.oneRmKg ?? null,
      templateVersion: plan.rx?.templateVersion ?? null,
      profileId: plan.rx?.profileId ?? null,
    } : {}),
    cycleId: cycle?.id || null,
    boardV2BenchmarkId: bm.id,
    boardV2WeekStart: wkMon,
    ...(signature ? { wendlerSignature: signature, wendlerManualOverride: false } : {}),
  };
  return { plan, prescription, recommendationMeta };
}

// ----------------------------------------------------------------
// 줌아웃 미니맵 데이터 (계약 10)
// ----------------------------------------------------------------

export function buildMinimapData(board, todayKey) {
  const allCycles = (board.cycles || []).slice().sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  if (!allCycles.length) return { fromKey: mondayOf(todayKey), totalWeeks: 0, groups: [] };
  const fromKey = allCycles[0].startDate;
  let endKey = fromKey;
  for (const c of allCycles) {
    const e = addWeeks(c.startDate, c.weeks);
    if (weeksBetween(endKey, e) > 0) endKey = e;
  }
  const totalWeeks = Math.max(1, weeksBetween(fromKey, endKey));
  const groups = (board.groups || []).map(g => {
    const cols = [];
    for (const bm of activeBenchmarks(board, g.id)) {
      for (const t of (bm.program === 'wendler' ? ['volume'] : bm.tracks)) {
        const segs = [];
        for (const c of (board.cycles || []).filter(x => x.groupId === g.id)) {
          for (const cell of expandColumnCells(board, bm.id, t, c.id, todayKey)) {
            segs.push({
              offset: weeksBetween(fromKey, cell.weekStart),
              span: cell.span,
              state: cell.kind === 'rest' ? 'rest' : cell.state,
            });
          }
        }
        segs.sort((a, b) => a.offset - b.offset);
        cols.push({ benchmarkId: bm.id, track: t, label: bm.short, segs });
      }
    }
    return { id: g.id, label: g.label, cols };
  }).filter(g => g.cols.length);
  return { fromKey, totalWeeks, groups, todayOffset: weeksBetween(fromKey, todayKey) };
}

// ----------------------------------------------------------------
// 최근 기록 (셀 시트 "최근 기록" 섹션)
// ----------------------------------------------------------------

export function recentPaintLogs(board, benchmarkId, track, beforeWeek, limit = 2) {
  const bm = benchmarkById(board, benchmarkId);
  if (!bm) return [];
  const out = [];
  if (bm.program === 'wendler') {
    for (const [wk, log] of Object.entries(bm.wendlerLog || {})) {
      if (log?.paintedAt && weeksBetween(wk, beforeWeek) > 0) out.push({ weekStart: wk, kg: null, reps: log.amrapReps, rir: log.rir });
    }
  } else {
    for (const s of _stepsOf(board, benchmarkId, track)) {
      for (const [wk, log] of Object.entries(s.weekLog || {})) {
        if (log?.paintedAt && weeksBetween(wk, beforeWeek) > 0) out.push({ weekStart: wk, kg: s.kg, reps: s.reps, rir: log.rir });
      }
    }
  }
  return out.sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)).slice(0, limit);
}

function _workoutEntryMatchesBenchmark(entry = {}, benchmark = {}) {
  if (!entry || !benchmark) return false;
  const entryName = _normalizeWorkoutName(entry.name);
  const benchmarkName = _normalizeWorkoutName(benchmark.label || benchmark.short);
  return (benchmark.exerciseId && entry.exerciseId === benchmark.exerciseId)
    || (benchmark.movementId && entry.movementId === benchmark.movementId)
    || (entry.recommendationMeta?.boardV2BenchmarkId && entry.recommendationMeta.boardV2BenchmarkId === benchmark.id)
    || (entryName && benchmarkName && (entryName === benchmarkName || entryName.includes(benchmarkName) || benchmarkName.includes(entryName)));
}

function _normalizeWorkoutName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]{}·ㆍ\-_]/g, '');
}

function _workSetsOf(entry = {}) {
  return (Array.isArray(entry?.sets) ? entry.sets : [])
    .filter(s => s && s.setType !== 'warmup' && s.wendlerRole !== 'deload' && s.done !== false && Number(s.kg) > 0 && Number(s.reps) > 0)
    .map(s => ({
      kg: Number(s.kg),
      reps: Math.round(Number(s.reps)) || 0,
      rir: s.rir == null || s.rir === '' ? null : Number(s.rir),
      romPct: s.romPct == null || s.romPct === '' ? null : Number(s.romPct),
    }));
}

export function workoutRecordsForBenchmarkWeek(cache = {}, benchmark = {}, weekStart = null) {
  const wk = mondayOf(weekStart || toKey(new Date()));
  const out = [];
  for (const dateKey of Object.keys(cache || {}).sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (mondayOf(dateKey) !== wk) continue;
    const entries = Array.isArray(cache[dateKey]?.exercises) ? cache[dateKey].exercises : [];
    for (const entry of entries) {
      if (!_workoutEntryMatchesBenchmark(entry, benchmark)) continue;
      const sets = _workSetsOf(entry);
      if (!sets.length) continue;
      const best = sets.reduce((max, set) => (
        !max || set.kg > max.kg || (set.kg === max.kg && set.reps > max.reps)
          ? set
          : max
      ), null);
      out.push({
        dateKey,
        exerciseId: entry.exerciseId || null,
        movementId: entry.movementId || null,
        name: entry.name || benchmark.label || '',
        sets,
        best,
      });
    }
  }
  return out;
}
