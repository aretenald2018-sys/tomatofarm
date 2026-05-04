// ================================================================
// workout/expert/max-cycle.js
// 테스트모드 v2 — 6주 성장판 렌더/사이클 helper
// ================================================================

function _esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }

const MAJOR_LABEL = {
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

function _targetRepsForTrack(track) {
  return track === 'H' ? 8 : 12;
}

function _targetTrackLabel(track) {
  return track === 'H' ? '강도' : '볼륨';
}

function _trackRepsRange(track) {
  return track === 'H' ? '5-8' : '10-12';
}

function _trackSpec(benchmark, track = 'M') {
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

function _shortDate(key) {
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

function _displayKg(cycle, todayKey, benchmark, track = 'M') {
  const override = cycle?.todayOverrides?.[todayKey]?.[`${benchmark.id}:${track}`]
    || cycle?.todayOverrides?.[todayKey]?.[benchmark.id];
  const kg = Number(override?.kg);
  return Number.isFinite(kg) && kg > 0 ? kg : benchmark.planned.plannedKg;
}

function _impactCopy(displayKg, benchmark) {
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

function predictBenchmarkProgression(benchmark, cycle, todayKey, track = 'M') {
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

function _benchmarkMovementId(item) {
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

function _benchmarkOptionValue(item) {
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

function _dedupeBenchmarkOptions(items = []) {
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
        const e1rm = _estimate1RM(kg, reps);
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

function _trackWeekStatus(benchmark, row, planned, track, snapshot) {
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

function buildMaxCycleSnapshot({ cycle = null, cache = {}, exList = [], todayKey = null } = {}) {
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

function detectPlateau(points = [], { weeks = 2 } = {}) {
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

function _renderV4Lift(benchmark, snapshot, cycle, index = 0) {
  const track = benchmark.activeTrack || snapshot.track || 'M';
  const reps = `${benchmark.planned.startReps || (track === 'H' ? 8 : 12)}-${benchmark.planned.targetReps || (track === 'H' ? 6 : 12)}`;
  const latest = benchmark.latest;
  const displayKg = _displayKg(cycle, snapshot.todayKey, benchmark, track);
  const changed = Math.abs(Number(displayKg) - Number(benchmark.planned.plannedKg)) > 0.001;
  const pct = Math.max(0, Math.min(100, Number(benchmark.planned?.percent) || 0));
  const actualPct = benchmark.actualPct === null || benchmark.actualPct === undefined ? null : Math.max(0, Math.min(100, Number(benchmark.actualPct) || 0));
  const paceClass = benchmark.onPlan === null ? 'is-empty' : (benchmark.onPlan ? 'is-on' : 'is-behind');
  const paceText = benchmark.onPlan === null ? '실측 없음' : (benchmark.onPlan ? '목표 페이스' : `${benchmark.delta}kg 뒤`);
  const expanded = changed || benchmark.onPlan === false;
  return `
    <article class="wt-v4-lift${changed ? ' is-changed' : ''}${expanded ? ' is-expanded' : ''}${benchmark.hasRegisteredExercise === false ? ' is-missing-exercise' : ''}" data-benchmark-id="${_esc(benchmark.id)}">
      <div class="wt-v4-lift-top">
        <div>
          <div class="wt-v4-lift-part">${_esc(MAJOR_LABEL[benchmark.primaryMajor] || benchmark.primaryMajor)}</div>
          <div class="wt-v4-lift-name">${_esc(benchmark.label)} <em>${track === 'H' ? '강도' : '볼륨'}</em></div>
          ${benchmark.hasRegisteredExercise === false ? '<div class="wt-v4-lift-warning">등록 종목에서 삭제됨 · 벤치마크를 바꾸세요</div>' : ''}
        </div>
        <button type="button" class="wt-v4-expand" data-action="toggle-max-lift" aria-label="상세 보기">${expanded ? '접기' : '상세'}</button>
      </div>
      <div class="wt-v4-row-track${track === 'H' ? ' is-h' : ''}" role="tablist" aria-label="${_esc(benchmark.label)} 트랙">
        <i></i>
        <button type="button" class="${track === 'M' ? 'on' : ''}" data-action="set-max-benchmark-track" data-benchmark-id="${_esc(benchmark.id)}" data-track="M">볼륨</button>
        <button type="button" class="${track === 'H' ? 'on' : ''}" data-action="set-max-benchmark-track" data-benchmark-id="${_esc(benchmark.id)}" data-track="H">강도</button>
      </div>
      <div class="wt-v4-lift-main">
        <div class="wt-v4-weight-wrap">
          <button type="button" class="wt-v4-weight${changed ? ' is-changed' : ''}"
                  data-action="open-max-adjust"
                  data-benchmark-id="${_esc(benchmark.id)}">
            <span>${_esc(displayKg)}</span><small>kg</small>
          </button>
          <div class="wt-v4-step-inline">
            <button type="button" data-action="adjust-max-weight" data-benchmark-id="${_esc(benchmark.id)}" data-delta="-${Number(benchmark.planned.incrementKg) || 2.5}">-${Number(benchmark.planned.incrementKg) || 2.5}</button>
            <button type="button" data-action="adjust-max-weight" data-benchmark-id="${_esc(benchmark.id)}" data-delta="${Number(benchmark.planned.incrementKg) || 2.5}">+${Number(benchmark.planned.incrementKg) || 2.5}</button>
          </div>
        </div>
        <div class="wt-v4-reps">
          <div>${track === 'H' ? '3' : '4'} × ${_esc(reps)}</div>
          <small>${latest ? `이전 ${latest.kg} × ${latest.reps} · ${_shortDate(latest.dateKey)}` : '이전 성공값 없음'}</small>
        </div>
      </div>
      <div class="wt-v4-detail">
        <div class="wt-v4-pace ${paceClass}">${_esc(paceText)}</div>
        <div class="wt-v4-impact"><strong>${changed ? '조정됨.' : '계획값.'}</strong> ${_esc(_impactCopy(displayKg, benchmark))}</div>
        <div class="wt-v4-progression" aria-label="6주 목표 ${_esc(benchmark.planned.targetKg)}kg">
          <div class="wt-v4-prog-line wt-v4-prog-dual">
            <i class="planned" style="width:${pct}%"></i>
            ${actualPct === null ? '' : `<i class="actual" style="width:${actualPct}%"></i>`}
          </div>
          <div class="wt-v4-prog-meta">
            <span>시작 ${_esc(benchmark.planned.startKg)}kg</span>
            <b>계획 ${_esc(displayKg)}kg</b>
            <span>목표 ${_esc(benchmark.planned.targetKg)}kg</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function _renderMatrix(snapshot) {
  const rows = (snapshot.schedule || []).slice(0, snapshot.weeks);
  const bms = (snapshot.benchmarks || []).slice(0, 6);
  if (!rows.length || !bms.length) return '';
  return `
    <div class="wt-max-cycle-matrix" role="table" aria-label="6주 듀얼 트랙 성장판">
      <div class="wt-max-cycle-matrix-row is-head" role="row">
        <div>주차</div>
        ${bms.map(b => `<div>${_esc(b.label)}</div>`).join('')}
      </div>
      ${rows.map(row => `
        <div class="wt-max-cycle-matrix-row${row.week === snapshot.weekIndex ? ' is-today' : ''}" role="row">
          <div>W${row.week}<small>볼륨+강도</small></div>
           ${bms.map(b => {
             const cell = row.cells.find(c => c.benchmarkId === b.id);
             const volume = cell?.plannedByTrack?.M || predictBenchmarkProgression(b, snapshot, row.dateKey, 'M');
             const intensity = cell?.plannedByTrack?.H || predictBenchmarkProgression(b, snapshot, row.dateKey, 'H');
             const volumeStatus = _trackWeekStatus(b, row, volume, 'M', snapshot);
             const intensityStatus = _trackWeekStatus(b, row, intensity, 'H', snapshot);
             return `
               <div class="wt-max-cycle-dual-cell">
                 <span class="track-m is-${_esc(volumeStatus.state)}"><em>볼륨</em><b>${_esc(volume.plannedKg)}</b><small>${_esc(volume.targetReps || _targetRepsForTrack('M'))}회</small><i>${_esc(volumeStatus.label)}</i></span>
                 <span class="track-h is-${_esc(intensityStatus.state)}"><em>강도</em><b>${_esc(intensity.plannedKg)}</b><small>${_esc(intensity.targetReps || _targetRepsForTrack('H'))}회</small><i>${_esc(intensityStatus.label)}</i></span>
               </div>
             `;
          }).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function _renderPrediction(snapshot) {
  const rows = (snapshot.benchmarks || []).slice(0, 5);
  if (!rows.length) return '';
  return `
    <div class="wt-max-cycle-predict">
      <div class="wt-max-cycle-subtitle">6주 뒤 예상</div>
      ${rows.map(b => `
        <div class="wt-max-cycle-predict-row">
          <span>${_esc(b.label)}</span>
          <b>${b.planned.startKg} → ${b.planned.targetKg}kg</b>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderMaxCycleDashboard({ cycle, cache, exList, todayKey, isDraft = false, recommendationHtml = '' } = {}) {
  const snapshot = buildRenderedMaxCycleSnapshot({ cycle, cache, exList, todayKey });
  if (!snapshot) return '';
  snapshot.todayKey = todayKey;
  const trackLabel = _targetTrackLabel(snapshot.track);
  return `
    <section class="wt-v4-board" id="wt-max-cycle-card">
      <div class="wt-v4-head">
        <button type="button" class="wt-v4-icon" onclick="wtExcSwitchToNormalView()" aria-label="일반 모드로">‹</button>
        <button type="button" class="wt-v4-head-center" data-action="open-max-cycle-board">
          <strong>${_esc(_shortDate(todayKey))}</strong>
          <span>Week ${snapshot.weekIndex} / ${snapshot.weeks}</span>
        </button>
        <button type="button" class="wt-v4-icon" data-action="open-max-plan-editor" aria-label="계획 조정">⋯</button>
      </div>
      <button type="button" class="wt-v4-week-strip" data-action="open-max-cycle-board">
        <div>
          <span>Current cycle</span>
          <b>Week ${snapshot.weekIndex}<em> / ${snapshot.weeks}</em></b>
          <small>${isDraft || snapshot.status === 'draft' ? '성장판 초안 · 시작하면 저장됩니다' : `${snapshot.startDate} 시작 · 계획 ${snapshot.progressPct}%${snapshot.actualProgressPct === null ? '' : ` · 실제 ${snapshot.actualProgressPct}%`}`}</small>
        </div>
        <div class="wt-v4-week-bars">
          <div class="wt-v4-week-bar"><i style="width:${Math.min(100, snapshot.progressPct)}%"></i></div>
          <div class="wt-v4-week-bar actual"><i style="width:${Math.min(100, snapshot.actualProgressPct ?? 0)}%"></i></div>
        </div>
      </button>
      <div class="wt-v4-track${snapshot.track === 'H' ? ' is-h' : ''}" role="tablist" aria-label="오늘 트랙">
        <i></i>
        <button type="button" class="${snapshot.track === 'M' ? 'on' : ''}" data-action="set-max-track" data-track="M">볼륨</button>
        <button type="button" class="${snapshot.track === 'H' ? 'on' : ''}" data-action="set-max-track" data-track="H">강도</button>
      </div>
      <div class="wt-v4-lift-list">
        ${(snapshot.benchmarks || []).slice(0, 5).map((b, idx) => _renderV4Lift(b, snapshot, cycle, idx)).join('')}
      </div>
      <button type="button" class="wt-v4-benchmark-edit-entry" data-action="open-max-plan-editor">벤치마크 종목 수정</button>
      ${recommendationHtml || ''}
      <div class="wt-v4-last-ten">
        <div class="wt-v4-last-dot"></div>
        <div>
          <b>마지막 10분 보강</b>
          <span>벤치마크를 끝내면 부족분 1-2개만 제안합니다.</span>
        </div>
      </div>
      <div class="wt-v4-cta">
        <button type="button" class="wt-v4-ghost" data-action="clear-max-major">오늘 부위 변경</button>
        <button type="button" class="wt-v4-primary" data-action="${isDraft || snapshot.status === 'draft' ? 'start-max-cycle' : 'start-max-session'}">
          ${isDraft || snapshot.status === 'draft' ? '6주 성장판 시작' : '종목 추가(선택)'}
        </button>
      </div>
    </section>
  `;
}

export function renderMaxCycleBoard({ cycle, cache, exList, todayKey } = {}) {
  const snapshot = buildRenderedMaxCycleSnapshot({ cycle, cache, exList, todayKey });
  if (!snapshot) return '';
  const primary = snapshot.benchmarks?.[0];
  const rows = snapshot.schedule || [];
  return `
    <div class="wt-v4-sheet-body">
      <div class="wt-v4-modal-head">
        <button type="button" class="wt-v4-icon" data-action="close-max-sheet">‹</button>
        <strong>Week ${snapshot.weekIndex} / ${snapshot.weeks}</strong>
        <button type="button" class="wt-v4-icon" data-action="close-max-sheet">×</button>
      </div>
      ${primary ? `
        <div class="wt-v4-cycle-hero">
          <span>${_esc(MAJOR_LABEL[primary.primaryMajor] || primary.primaryMajor)}</span>
          <b>${_esc(primary.label)}</b>
          <div>${_esc(primary.planned.startKg)} → ${_esc(primary.planned.targetKg)} kg</div>
          <i><em style="width:${Math.min(100, primary.planned.percent)}%"></em></i>
        </div>
      ` : ''}
      <div class="wt-v4-cycle-list">
        ${_renderMatrix(snapshot)}
      </div>
    </div>
  `;
}

export function renderMaxPlanEditor({ cycle, gyms = [], currentGymId = null, movements = [] } = {}) {
  const gym = gyms.find(g => g.id === currentGymId) || null;
  const benchmarks = Array.isArray(cycle?.benchmarks) ? normalizeMaxCycleTracks(cycle).benchmarks : [];
  const exerciseOptions = _dedupeBenchmarkOptions(Array.isArray(movements) ? movements : []);
  const selectedOptionValue = (b) => {
    const exact = exerciseOptions.find(m => _benchmarkOptionValue(m) === b.exerciseId);
    if (exact) return _benchmarkOptionValue(exact);
    const sameMovement = exerciseOptions.find(m => _benchmarkMovementId(m) === b.movementId);
    if (sameMovement) return _benchmarkOptionValue(sameMovement);
    return b.exerciseId || (b.movementId ? `movement:${b.movementId}` : '');
  };
  const weekOptions = [4, 6, 8].map(weeks => `
    <button type="button" class="${Number(cycle?.weeks) === weeks ? 'on' : ''}" data-plan-weeks="${weeks}">${weeks}주</button>
  `).join('');
  const gymOptions = [
    `<option value="">헬스장 미선택</option>`,
    ...gyms.map(g => `<option value="${_esc(g.id)}" ${g.id === currentGymId ? 'selected' : ''}>${_esc(g.name || '이름 없는 헬스장')}</option>`),
  ].join('');
  return `
    <div class="wt-v4-sheet-body wt-v4-plan-editor">
      <div class="wt-v4-modal-head">
        <button type="button" class="wt-v4-icon" data-action="close-max-sheet">‹</button>
        <strong>계획 조정</strong>
        <button type="button" class="wt-v4-save" data-action="save-max-plan-editor">저장</button>
      </div>
      <section class="wt-v4-plan-card">
        <h4>사이클</h4>
        <div class="wt-v4-cycle-len">${weekOptions}</div>
        <input type="hidden" id="max-plan-weeks-value" value="${Number(cycle?.weeks) || 6}">
        <p>각 주차에 볼륨/강도 목표를 함께 기재합니다.</p>
      </section>
      <section class="wt-v4-plan-section">
        <h4>벤치마크 종목</h4>
        <p>운동추가 목록에 등록된 실제 종목을 기준으로 벤치마크를 연결합니다.</p>
        ${benchmarks.map(b => `
          <div class="wt-v4-bench-row wt-v4-bench-edit" data-benchmark-id="${_esc(b.id)}">
            <label>
              <span>${_esc(MAJOR_LABEL[b.primaryMajor] || b.primaryMajor)}</span>
              <select data-bench-field="exerciseId">
                ${(() => {
                  const selectedValue = selectedOptionValue(b);
                  const hasSelected = exerciseOptions.some(m => _benchmarkOptionValue(m) === selectedValue);
                  const options = hasSelected || !selectedValue
                    ? exerciseOptions
                    : [{
                      id: selectedValue,
                      exerciseId: selectedValue && !String(selectedValue).startsWith('movement:') ? selectedValue : null,
                      movementId: b.movementId || null,
                      primary: b.primaryMajor || null,
                      optionLabel: `등록 종목 없음 · ${b.label || b.movementId || selectedValue}`,
                    }, ...exerciseOptions];
                  return options
                    .map(m => {
                      const value = _benchmarkOptionValue(m);
                      return `<option value="${_esc(value)}" ${value === selectedValue ? 'selected' : ''}>${_esc(m.optionLabel || `${MAJOR_LABEL[m.primary] || m.primary || '기타'} · ${m.nameKo || m.name || m.id} · ${m.equipment_category || '공통'}`)}</option>`;
                    })
                    .join('');
                })()}
              </select>
              ${(() => {
                const selectedValue = selectedOptionValue(b);
                const hasSelected = exerciseOptions.some(m => _benchmarkOptionValue(m) === selectedValue);
                return hasSelected ? '' : '<small class="wt-v4-bench-missing">이 벤치마크는 현재 운동추가 목록에 없습니다. 다른 종목으로 바꾸거나 삭제하세요.</small>';
              })()}
            </label>
            <div class="wt-v4-track-edit">
              ${['M', 'H'].map(track => {
                const spec = _trackSpec(b, track);
                return `
                  <div class="wt-v4-track-edit-row" data-track="${track}">
                    <b>${track === 'H' ? '강도' : '볼륨'}</b>
                    <label>시작 <input data-bench-track="${track}" data-bench-field="startKg" type="number" min="0" max="400" step="${Number(spec.incrementKg) || 2.5}" value="${_esc(spec.startKg)}"></label>
                    <label>목표 <input data-bench-track="${track}" data-bench-field="targetKg" type="number" min="0" max="400" step="${Number(spec.incrementKg) || 2.5}" value="${_esc(spec.targetKg)}"></label>
                    <label>반복 <input data-bench-track="${track}" data-bench-field="targetReps" type="number" min="1" max="30" step="1" value="${_esc(spec.targetReps)}"></label>
                    <label class="wt-v4-track-enabled"><input data-bench-track="${track}" data-bench-field="enabled" type="checkbox" ${spec.enabled === false ? '' : 'checked'}> 사용</label>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="wt-v4-bench-actions">
              <small data-bench-default-note>${_esc(b.benchmarkSourceLabel || '볼륨/강도 트랙을 따로 계산합니다.')}</small>
              <button type="button" data-action="delete-max-benchmark" data-benchmark-id="${_esc(b.id)}">삭제</button>
            </div>
          </div>
        `).join('')}
        <button type="button" class="wt-v4-bench-add" data-action="add-max-benchmark">벤치마크 추가</button>
      </section>
      <section class="wt-v4-plan-card">
        <h4>헬스장</h4>
        <label class="wt-v4-field">
          <span>현재 헬스장</span>
          <select id="max-plan-gym-id">${gymOptions}</select>
        </label>
        <div class="wt-v4-inline-create">
          <input id="max-plan-new-gym-name" type="text" placeholder="새 헬스장 이름">
          <button type="button" data-action="create-max-gym">추가</button>
        </div>
        <p>현재: ${_esc(gym?.name || '헬스장 미선택')}</p>
        <button type="button" data-action="open-equipment-pool">헬스장 / 기구 관리</button>
        <button type="button" data-action="open-max-data-cleanse">데이터 클렌징</button>
      </section>
      <details class="wt-v4-advanced">
        <summary>고급 설정 <span>⌄</span></summary>
        <p>프레임워크: 6주 듀얼 트랙</p>
        <p>정체 2주 후 종목 교체 신호</p>
        <p>Deload: 자동</p>
      </details>
    </div>
  `;
}

export function renderMaxCycleSettle(cycle, snapshot) {
  if (!snapshot) return '';
  return `
    <div class="wt-max-cycle-settle">
      <div class="wt-max-cycle-settle-title">사이클 정산</div>
      ${(snapshot.benchmarks || []).map(b => `
        <div class="wt-max-cycle-settle-row">
          <span>${_esc(b.label)}</span>
          <b>${b.planned.startKg} → ${b.latest?.kg || b.planned.plannedKg}kg</b>
          <small>${b.onPlan === false ? '보류/재시도' : '진행 유지'}</small>
        </div>
      `).join('')}
      <div class="wt-max-cycle-settle-note">다음 사이클은 현재 실측값을 시작값으로 자동 시드합니다.</div>
    </div>
  `;
}
