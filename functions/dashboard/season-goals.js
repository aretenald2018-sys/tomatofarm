"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;
const W863_VERSION = "w863-original-v1";
const W531_WEEKS = [
  [[65, 5], [75, 5], [85, 5]],
  [[70, 3], [80, 3], [90, 3]],
  [[75, 5], [85, 3], [95, 1]],
  [[65, 5], [75, 5], [85, 5]],
  [[70, 3], [80, 3], [90, 3]],
  [[75, 5], [85, 3], [95, 1]],
];
const W863_TOP_SETS = Object.freeze({
  squat: { reference1RmKg: 110, weeks: [[80, 8, true], [85, 6, true], [90, 3, true], [80, 8, true], [85, 6, true], [90, 3, true], [65, 5, false]] },
  ohp: { reference1RmKg: 55, weeks: [[40, 8, true], [40, 6, true], [45, 3, true], [40, 8, true], [45, 6, true], [45, 3, true], [35, 5, false]] },
  deadlift: { reference1RmKg: 120, weeks: [[85, 8, true], [90, 6, true], [95, 3, true], [90, 8, true], [95, 6, true], [100, 3, true], [70, 5, false]] },
  bench: { reference1RmKg: 95, weeks: [[70, 8, true], [70, 6, true], [75, 3, true], [70, 8, true], [75, 6, true], [80, 3, true], [50, 3, false]] },
});

function dateEpoch(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function addDays(dateKey, amount) {
  const epoch = dateEpoch(dateKey);
  return epoch == null ? dateKey : new Date(epoch + Number(amount) * DAY_MS).toISOString().slice(0, 10);
}

function mondayOf(dateKey) {
  const epoch = dateEpoch(dateKey);
  if (epoch == null) return dateKey;
  const day = new Date(epoch).getUTCDay();
  return addDays(dateKey, -((day + 6) % 7));
}

function weeksBetween(startKey, endKey) {
  const start = dateEpoch(mondayOf(startKey));
  const end = dateEpoch(mondayOf(endKey));
  return start == null || end == null ? 0 : Math.round((end - start) / (7 * DAY_MS));
}

function activeCycle(board, groupId, weekStart) {
  return (board?.cycles || [])
    .filter((cycle) => cycle?.groupId === groupId && cycle?.status === "active")
    .sort((left, right) => String(right.startDate || "").localeCompare(String(left.startDate || "")))
    .find((cycle) => {
      const offset = weeksBetween(cycle.startDate, weekStart);
      return offset >= 0 && offset < Math.max(1, Number(cycle.weeks) || 1);
    }) || null;
}

function goalState(log = {}) {
  if (log?.paintedAt) return "done";
  if (log?.missed && (log?.attempted || log?.performed || log?.missedAt || log?.actualKg || log?.actualReps)) return "attempted";
  if (log?.missed) return "missed";
  return "planned";
}

function stateLabel(state) {
  return ({ done: "완료", attempted: "시도", missed: "미달", planned: "계획" })[state] || "계획";
}

function roundWeight(value, step = 2.5) {
  const unit = Number(step) > 0 ? Number(step) : 2.5;
  return Math.round((Number(value) || 0) / unit) * unit;
}

function weightText(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function inferW863Profile(benchmark = {}) {
  const configured = benchmark?.wendler?.profileId;
  if (W863_TOP_SETS[configured]) return configured;
  const raw = [benchmark.movementId, benchmark.exerciseId, benchmark.label]
    .filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, "");
  if (/ohp|overhead|오버헤드|밀리터리|숄더프레스/.test(raw)) return "ohp";
  if (/bench|벤치/.test(raw)) return "bench";
  if (/dead|sumo|데드|스모/.test(raw)) return "deadlift";
  return "squat";
}

function _programValue(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function isW863Benchmark(benchmark = {}) {
  const values = [benchmark.program, benchmark.scheme, benchmark.wendler?.scheme];
  return values.some(value => ['w863', '863', '8/6/3', '8-6-3', '8_6_3'].includes(_programValue(value)))
    || benchmark.templateVersion === W863_VERSION
    || benchmark.wendler?.templateVersion === W863_VERSION;
}

function isWendlerBenchmark(benchmark = {}) {
  return _programValue(benchmark.program) === 'wendler' || isW863Benchmark(benchmark);
}

function latestTm(wendler = {}, weekStart) {
  const anchors = (wendler.tmAnchors || [])
    .filter((anchor) => anchor?.weekStart <= weekStart && Number(anchor?.tmKg) > 0)
    .sort((left, right) => String(right.weekStart).localeCompare(String(left.weekStart)));
  return Number(anchors[0]?.tmKg) || Number(wendler.tmKg) || 0;
}

function wendlerGoal(benchmark, cycle, weekStart) {
  const wendler = benchmark.wendler || {};
  const programStart = benchmark.programStartDate || wendler.programStartDate || cycle.startDate;
  const programWeek = Math.max(1, weeksBetween(programStart, weekStart) + 1);
  const original = wendler.templateVersion === W863_VERSION || wendler.scheme === "w863" || isW863Benchmark(benchmark);
  const weekCount = original ? 7 : Math.max(1, wendler.weekMap?.length || cycle.weeks || 6);
  const week = ((programWeek - 1) % weekCount) + 1;
  const log = benchmark.wendlerLog?.[weekStart] || {};
  if (original) {
    const profile = W863_TOP_SETS[inferW863Profile(benchmark)];
    const [referenceKg, reps, amrap] = profile.weeks[week - 1];
    const anchorTm = latestTm(wendler, weekStart);
    const oneRm = anchorTm > 0 && Math.abs(anchorTm - Number(wendler.tmKg || 0)) > 0.001
      ? anchorTm / 0.9
      : Number(wendler.oneRmKg) || (anchorTm > 0 ? anchorTm / 0.9 : profile.reference1RmKg);
    const kg = roundWeight(referenceKg * oneRm / profile.reference1RmKg, Number(wendler.roundKg) || 5);
    return { week, kg, reps, amrap, sets: null, state: goalState(log) };
  }
  const weekMap = Array.isArray(wendler.weekMap) && wendler.weekMap.length ? wendler.weekMap : W531_WEEKS.map((sets) => ({ sets: sets.map(([pct, reps], index) => ({ pct, reps, amrap: index === sets.length - 1 })) }));
  const sets = weekMap[(week - 1) % weekMap.length]?.sets || [];
  const top = sets.at(-1) || {};
  const kg = roundWeight(latestTm(wendler, weekStart) * Number(top.pct || 0) / 100, Number(wendler.roundKg) || 2.5);
  return { week, kg, reps: Number(top.reps) || 0, amrap: top.amrap !== false, sets: sets.length || null, state: goalState(log) };
}

function stairGoal(board, benchmark, cycle, track, weekStart) {
  const step = (board.steps || []).find((candidate) => {
    if (candidate?.benchmarkId !== benchmark.id || candidate?.track !== track || candidate?.cycleId !== cycle.id) return false;
    const offset = weeksBetween(candidate.weekStart, weekStart);
    return offset >= 0 && offset < Math.max(1, Number(candidate.span) || 1);
  });
  const fallback = benchmark.seed?.[track] || {};
  const log = step?.weekLog?.[weekStart] || {};
  return {
    week: Math.max(1, weeksBetween(cycle.startDate, weekStart) + 1),
    kg: Number(step?.kg ?? fallback.kg) || 0,
    reps: Number(step?.reps ?? fallback.reps) || (track === "intensity" ? 8 : 12),
    sets: Math.max(1, Math.round(Number(step?.sets ?? benchmark.setsByTrack?.[track] ?? benchmark.setsDefault) || 4)),
    state: goalState(log),
  };
}

function buildSeasonHealthGoals({ season, board, todayKey } = {}) {
  const weekStart = mondayOf(todayKey);
  const seasonWeek = season?.startDate ? Math.max(1, Math.floor((dateEpoch(todayKey) - dateEpoch(season.startDate)) / (7 * DAY_MS)) + 1) : null;
  if (!season || !board || board.seasonId !== season.id) {
    return { state: "missing", seasonId: season?.id || null, seasonName: season?.name || null, weekStart, seasonWeek, items: [] };
  }
  const items = [];
  const benchmarks = (board.benchmarks || [])
    .filter((benchmark) => benchmark?.status === "active")
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  for (const benchmark of benchmarks) {
    const cycle = activeCycle(board, benchmark.groupId, weekStart);
    if (!cycle) continue;
    const wendler = isWendlerBenchmark(benchmark);
    const tracks = wendler ? ["volume"] : (benchmark.tracks?.length ? benchmark.tracks : ["volume"]);
    for (const track of tracks) {
      const goal = wendler
        ? wendlerGoal(benchmark, cycle, weekStart)
        : stairGoal(board, benchmark, cycle, track, weekStart);
      const trackLabel = track === "intensity" ? "강도" : "볼륨";
      items.push({
        benchmarkId: benchmark.id,
        exerciseId: benchmark.exerciseId || null,
        track,
        label: `${benchmark.label || "운동"}${tracks.length > 1 ? ` · ${trackLabel}` : ""}`,
        value: goal.kg > 0 && goal.reps > 0 ? `${weightText(goal.kg)}kg × ${goal.reps}${goal.amrap ? "+" : ""}` : "목표 확인",
        status: `${goal.sets ? `${goal.sets}세트 · ` : ""}${stateLabel(goal.state)}`,
        state: goal.state,
        week: goal.week,
        kg: goal.kg,
        reps: goal.reps,
        sets: goal.sets,
        amrap: Boolean(goal.amrap),
      });
    }
  }
  return { state: items.length ? "ready" : "empty", seasonId: season.id, seasonName: season.name || "현재 시즌", weekStart, seasonWeek, items };
}

module.exports = { buildSeasonHealthGoals, mondayOf, weeksBetween };
