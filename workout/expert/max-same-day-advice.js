import { escapeHtml as _esc } from '../../utils/escape-html.js';
// ================================================================
// workout/expert/max-same-day-advice.js
// 동일 대근육 다음 Day 코칭 문구/세부 보완 분석
// ================================================================

import { calcSetVolume, estimateSet1RM, inferWorkoutTrack, SUBPATTERN_TO_MAJOR } from '../../calc.js';
import { MOVEMENTS, MAX_PREFERRED_CATEGORIES } from '../../config.js';
import {
  MAJOR_LABEL,
  SAME_DAY_DETAIL_LABEL,
  SAME_DAY_DETAIL_PARTS,
  WEAK_LABEL,
} from './max-config.js';
import { renderMaxBenchmarkPlanPreview } from './max-cycle-render.js';

function _normalizeMaxMajor(id) {
  if (!id) return null;
  return SUBPATTERN_TO_MAJOR[id] || (id === 'core' ? 'abs' : id);
}

function _formatShortDate(key) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${parseInt(m[1], 10)}/${parseInt(m[2], 10)}`;
}

export function detectMaxMajorsLoose(day, exList, movements = MOVEMENTS, fallbackEntries = []) {
  const out = new Set();
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const entries = (day?.exercises) || fallbackEntries || [];
  for (const entry of entries) {
    const ex = exById.get(entry.exerciseId);
    let major = null;
    const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
      ? ex.muscleIds
      : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
    if (muscleIds.length > 0) {
      const sp = muscleIds[0];
      major = SUBPATTERN_TO_MAJOR[sp] || sp;
    }
    if (!major) {
      const movId = ex?.movementId || entry?.movementId || null;
      if (movId) {
        const mov = movById.get(movId);
        if (mov?.primary) major = mov.primary;
        else if (mov?.subPattern) major = SUBPATTERN_TO_MAJOR[mov.subPattern] || null;
      }
    }
    if (!major) {
      const legacy = ex?.muscleId || entry?.muscleId;
      if (legacy) major = SUBPATTERN_TO_MAJOR[legacy] || legacy;
    }
    if (major) out.add(major);
  }
  return out;
}

function _resolveMaxEntryMajor(entry, exById, movById) {
  const ex = exById.get(entry?.exerciseId);
  const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
    ? ex.muscleIds
    : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
  if (muscleIds.length > 0) return _normalizeMaxMajor(SUBPATTERN_TO_MAJOR[muscleIds[0]] || muscleIds[0]);
  const movId = ex?.movementId || entry?.movementId || null;
  if (movId) {
    const mov = movById.get(movId);
    if (mov?.primary) return _normalizeMaxMajor(mov.primary);
    if (mov?.subPattern) return _normalizeMaxMajor(SUBPATTERN_TO_MAJOR[mov.subPattern] || mov.subPattern);
  }
  const legacy = ex?.muscleId || entry?.muscleId;
  return legacy ? _normalizeMaxMajor(SUBPATTERN_TO_MAJOR[legacy] || legacy) : null;
}

function _resolveMaxEntrySubPattern(entry, exById, movById) {
  const ex = exById.get(entry?.exerciseId);
  const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
    ? ex.muscleIds
    : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
  if (muscleIds.length > 0) return muscleIds[0];
  const movId = ex?.movementId || entry?.movementId || null;
  if (movId) {
    const mov = movById.get(movId);
    if (mov?.subPattern) return mov.subPattern;
  }
  return ex?.muscleId || entry?.muscleId || null;
}

function _isMaxActualWorkSet(set) {
  if (!set || set.setType === 'warmup') return false;
  const kg = Number(set.kg) || 0;
  const reps = Number(set.reps) || 0;
  return set.done !== false && kg > 0 && reps > 0;
}

function _maxSameMuscleInsightStats(day, exList, majors, summary = null, movements = MOVEMENTS) {
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (!majorSet.size) return null;
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const movById = new Map((movements || []).map(m => [m.id, m]));
  let plannedSets = 0;
  let doneSets = 0;
  let plannedVolume = 0;
  let actualVolume = 0;
  let totalReps = 0;
  let topKg = 0;
  let entries = 0;
  let planEntries = 0;
  const names = [];
  const subBalance = {};

  for (const entry of day?.exercises || []) {
    const major = _resolveMaxEntryMajor(entry, exById, movById);
    if (!major || !majorSet.has(major)) continue;
    const ex = exById.get(entry?.exerciseId);
    const sets = entry.sets || [];
    const prescription = entry.maxPrescription || null;
    const workSets = sets.filter(_isMaxActualWorkSet);
    if (!workSets.length) continue;
    const name = ex?.name || entry.name || entry.exerciseId;
    const subPattern = _resolveMaxEntrySubPattern(entry, exById, movById);
    if (name) names.push(name);
    const targetKg = Number(prescription?.startKg) || Number(workSets[0]?.kg) || 0;
    const targetReps = Number(prescription?.repsHigh) || Number(workSets[0]?.reps) || 0;
    const targetSets = Number(prescription?.targetSets) || 0;
    entries += 1;
    doneSets += workSets.length;
    actualVolume += workSets.reduce((sum, s) => sum + calcSetVolume(s), 0);
    totalReps += workSets.reduce((sum, s) => sum + (Number(s.reps) || 0), 0);
    topKg = Math.max(topKg, ...workSets.map(s => Number(s.kg) || 0));
    if (subPattern) subBalance[subPattern] = (subBalance[subPattern] || 0) + workSets.length;
    if (prescription && targetSets > 0) {
      planEntries += 1;
      plannedSets += targetSets;
      plannedVolume += targetKg * targetReps * targetSets;
    }
  }

  if (!entries && !summary) return null;
  const fallbackWorkSets = Number(summary?.workSets) || 0;
  const fallbackVolume = Number(summary?.totalVolume) || 0;
  const workSets = doneSets || fallbackWorkSets;
  const totalVolume = Math.round(actualVolume || fallbackVolume);
  const hasPlan = planEntries > 0 && plannedSets > 0;
  return {
    entries,
    names,
    workSets,
    plannedSets: hasPlan ? plannedSets : null,
    doneSets: hasPlan ? doneSets : null,
    adherence: hasPlan ? Math.round((doneSets / plannedSets) * 100) : null,
    volumeDelta: hasPlan ? Math.round(actualVolume - plannedVolume) : null,
    totalVolume,
    topKg: topKg || Number(summary?.topKg) || 0,
    avgReps: workSets ? Math.round((totalReps / workSets) * 10) / 10 : 0,
    subBalance: entries ? subBalance : { ...(summary?.subBalance || {}) },
  };
}

function _maxSameMuscleHistoryStats({ comparison, cache, exList, majors, movements } = {}) {
  return (comparison?.previous || []).slice(0, 2).map(prev => ({
    dateKey: prev.dateKey,
    ...(_maxSameMuscleInsightStats(cache?.[prev.dateKey], exList, majors, prev, movements) || {}),
  })).filter(s => s?.dateKey && (s.workSets || s.totalVolume));
}

function _finePartLabel(part) {
  return WEAK_LABEL[part] || SAME_DAY_DETAIL_LABEL[part] || part;
}

function _sameDayDetailGaps(comparison, majors) {
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  const out = [];
  for (const major of majorSet) {
    const detailParts = SAME_DAY_DETAIL_PARTS[_normalizeMaxMajor(major)];
    if (!detailParts?.length) continue;
    const counts = Object.fromEntries(detailParts.map(part => [part, 0]));
    for (const session of comparison?.previous || []) {
      for (const part of detailParts) {
        counts[part] += Number(session?.subBalance?.[part]) || 0;
      }
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (!total) continue;
    const gaps = detailParts
      .map(part => ({ part, sets: counts[part], ratio: counts[part] / total }))
      .filter(x => x.sets === 0 || x.ratio < 0.15)
      .sort((a, b) => a.sets - b.sets || a.ratio - b.ratio)
      .slice(0, 2);
    if (gaps.length) out.push({ major: _normalizeMaxMajor(major), total, gaps });
  }
  return out;
}

function _sameDayDetailMovementNames(parts = [], movements = MOVEMENTS) {
  const preferred = new Set(MAX_PREFERRED_CATEGORIES);
  const names = [];
  for (const part of parts) {
    const picked = (movements || [])
      .filter(m => m?.subPattern === part)
      .sort((a, b) => {
        const pa = preferred.has(a.equipment_category) ? 0 : 1;
        const pb = preferred.has(b.equipment_category) ? 0 : 1;
        return pa - pb || (a.nameKo || '').localeCompare(b.nameKo || '');
      })
      .slice(0, 1);
    for (const mov of picked) {
      const name = mov.nameKo || mov.id;
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names.slice(0, 3);
}

function _sameDayMajorList(majors, comparison) {
  const raw = Array.isArray(majors) && majors.length ? majors : (comparison?.majors || []);
  const out = [];
  for (const id of raw) {
    const normalized = _normalizeMaxMajor(id);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function _sameDayMajorSubPatterns(major) {
  const normalized = _normalizeMaxMajor(major);
  const detailParts = SAME_DAY_DETAIL_PARTS[normalized] || [];
  if (detailParts.length) return detailParts;
  return Object.entries(SUBPATTERN_TO_MAJOR)
    .filter(([, mj]) => _normalizeMaxMajor(mj) === normalized)
    .map(([sp]) => sp);
}

function _sameDayMajorMovementNames(major, movements = MOVEMENTS) {
  return _sameDayDetailMovementNames(_sameDayMajorSubPatterns(major), movements);
}

function _emptySameDayStats(dateKey) {
  return {
    dateKey,
    entries: 0,
    names: [],
    workSets: 0,
    plannedSets: null,
    doneSets: null,
    adherence: null,
    volumeDelta: null,
    totalVolume: 0,
    topKg: 0,
    avgReps: 0,
    subBalance: {},
  };
}

function _sameDayMajorHistorySlots({ comparison, cache, exList, major, movements = MOVEMENTS } = {}) {
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const majorId = _normalizeMaxMajor(major);
  const beforeKey = comparison?.today?.dateKey || null;
  const hits = [];
  for (const [dateKey, day] of Object.entries(cache || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (beforeKey && dateKey >= beforeKey) continue;
    const hasMajor = (day?.exercises || []).some(entry => {
      const entryMajor = _resolveMaxEntryMajor(entry, exById, movById);
      return entryMajor === majorId && _entryWorkSets(entry).length > 0;
    });
    if (hasMajor) hits.push(dateKey);
  }
  const keys = hits.length
    ? hits.sort((a, b) => b.localeCompare(a)).slice(0, 2)
    : (comparison?.previous || []).slice(0, 2).map(prev => prev.dateKey);
  return keys.map(dateKey => {
    const stats = _maxSameMuscleInsightStats(cache?.[dateKey], exList, [major], null, movements);
    return stats ? { dateKey, ...stats } : _emptySameDayStats(dateKey);
  });
}

function _benchmarkHistorySlots({ cache, exList, movements = MOVEMENTS, major, benchmark, beforeKey = null } = {}) {
  if (!benchmark) return [];
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const hits = [];
  for (const [dateKey, day] of Object.entries(cache || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (beforeKey && dateKey >= beforeKey) continue;
    const hasBenchmark = (day?.exercises || []).some(entry => {
      const ex = exById.get(entry?.exerciseId);
      return _benchmarkMatchesEntry(entry, ex, benchmark) && _entryWorkSets(entry).length > 0;
    });
    if (hasBenchmark) hits.push(dateKey);
  }
  return hits
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 2)
    .map(dateKey => {
      const stats = _maxSameMuscleInsightStats(cache?.[dateKey], exList, [major], null, movements);
      return stats ? { dateKey, ...stats } : _emptySameDayStats(dateKey);
    });
}

function _sameDayDetailProfileFromSessions(sessions, major) {
  const normalized = _normalizeMaxMajor(major);
  const detailParts = SAME_DAY_DETAIL_PARTS[normalized] || [];
  if (!detailParts.length) return null;
  const counts = Object.fromEntries(detailParts.map(part => [part, 0]));
  for (const session of sessions || []) {
    for (const part of detailParts) {
      counts[part] += Number(session?.subBalance?.[part]) || 0;
    }
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!total) return null;
  const rows = detailParts.map(part => ({ part, sets: counts[part], ratio: counts[part] / total }));
  const gaps = rows
    .filter(x => x.sets === 0 || x.ratio < 0.15)
    .sort((a, b) => a.sets - b.sets || a.ratio - b.ratio)
    .slice(0, 2);
  const dominant = rows
    .filter(x => x.sets > 0)
    .sort((a, b) => b.sets - a.sets || b.ratio - a.ratio)
    .slice(0, 2);
  return { major: normalized, total, gaps, dominant };
}

function _entryWorkSets(entry) {
  return (entry?.sets || []).filter(_isMaxActualWorkSet);
}

function _formatSetPlan({ sets, kg, reps } = {}) {
  if (!sets || !kg || !reps) return '기준 기록 없음';
  return `${sets}set x ${kg}kg x ${reps}reps`;
}

function _plannedSetCount(track) {
  return track === 'H' ? 3 : 4;
}

function _plannedPointForBenchmark(benchmark, track = 'M') {
  const t = track === 'H' ? 'H' : 'M';
  const planned = benchmark?.plannedByTrack?.[t] || (benchmark?.activeTrack === t ? benchmark?.planned : null) || benchmark?.planned || {};
  const kg = Number(planned.plannedKg) || Number(planned.startKg) || Number(benchmark?.startKg) || 0;
  const reps = Number(planned.targetReps) || (t === 'H' ? 6 : 12);
  const sets = _plannedSetCount(t);
  return {
    track: t,
    trackLabel: t === 'H' ? '강도' : '볼륨',
    kg,
    reps,
    sets,
    metric: t === 'H'
      ? estimateSet1RM({ kg, reps }, { useRpe: false })
      : kg * reps * sets,
    text: _formatSetPlan({ sets, kg, reps }),
    name: benchmark?.label || '벤치마크',
  };
}

function _benchmarkMatchesEntry(entry, ex, benchmark) {
  if (!entry || !benchmark) return false;
  if (benchmark.exerciseId && entry.exerciseId === benchmark.exerciseId) return true;
  const movementId = entry.movementId || ex?.movementId || null;
  return !!(benchmark.movementId && movementId && benchmark.movementId === movementId);
}

function _trackForEntry(entry, ex, bestSet) {
  const inferred = inferWorkoutTrack(entry, ex)?.track;
  if (inferred === 'H' || inferred === 'M') return inferred;
  const reps = Number(bestSet?.reps) || 0;
  if (reps > 0 && reps <= 8) return 'H';
  return 'M';
}

function _representativeHistoryPoint({ day, exList, movements, major, benchmark, dateKey, roleLabel, benchmarkOnly = false } = {}) {
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const majorId = _normalizeMaxMajor(major);
  let best = null;
  for (const entry of day?.exercises || []) {
    const ex = exById.get(entry?.exerciseId);
    const benchmarkMatch = _benchmarkMatchesEntry(entry, ex, benchmark);
    if (benchmarkOnly && !benchmarkMatch) continue;
    const entryMajor = _resolveMaxEntryMajor(entry, exById, movById);
    if (!benchmarkOnly && (!entryMajor || entryMajor !== majorId)) continue;
    const workSets = _entryWorkSets(entry);
    if (!workSets.length) continue;
    const topSet = workSets
      .map(set => ({ ...set, e1rm: estimateSet1RM(set, { useRpe: false }) }))
      .sort((a, b) => (b.e1rm || 0) - (a.e1rm || 0) || (Number(b.kg) || 0) - (Number(a.kg) || 0))[0];
    const track = _trackForEntry(entry, ex, topSet);
    const volume = workSets.reduce((sum, set) => sum + calcSetVolume(set), 0);
    const metric = track === 'H' ? (topSet?.e1rm || 0) : volume;
    const score = (benchmarkMatch ? 1000000 : 0) + metric + workSets.length * 10;
    if (!best || score > best.score) {
      best = {
        roleLabel,
        dateKey,
        track,
        trackLabel: track === 'H' ? '강도' : '볼륨',
        kg: Number(topSet?.kg) || 0,
        reps: Number(topSet?.reps) || 0,
        sets: workSets.length,
        metric,
        score,
        name: ex?.name || entry.name || benchmark?.label || '대표 기록',
        benchmarkMatch,
        volume: Math.round(volume),
      };
    }
  }
  if (!best) {
    return {
      roleLabel,
      dateKey,
      track: '',
      trackLabel: '기록 없음',
      kg: 0,
      reps: 0,
      sets: 0,
      metric: 0,
      name: '기록 없음',
      text: '기준 기록 없음',
      empty: true,
    };
  }
  return {
    ...best,
    text: _formatSetPlan(best),
  };
}

function _majorBenchmarks(snapshot, major) {
  const majorId = _normalizeMaxMajor(major);
  return (snapshot?.benchmarks || [])
    .map((benchmark, idx) => ({ benchmark, idx }))
    .filter(({ benchmark }) => _normalizeMaxMajor(benchmark?.primaryMajor) === majorId)
    .sort((a, b) => {
      const aLatest = a.benchmark?.latest ? 1 : 0;
      const bLatest = b.benchmark?.latest ? 1 : 0;
      const aActive = a.benchmark?.activeTrack === snapshot?.track ? 1 : 0;
      const bActive = b.benchmark?.activeTrack === snapshot?.track ? 1 : 0;
      return bLatest - aLatest || bActive - aActive || a.idx - b.idx;
    })
    .map(x => x.benchmark);
}

function _graphIndex(points, point) {
  if (!point?.metric) return 82;
  const sameTrackActuals = points
    .filter(p => p && !p.isToday && p.track === point.track && p.metric > 0)
    .map(p => p.metric);
  const baseline = sameTrackActuals.length
    ? (sameTrackActuals.reduce((sum, n) => sum + n, 0) / sameTrackActuals.length)
    : point.metric;
  if (!baseline) return 82;
  return Math.round((point.metric / baseline) * 100);
}

function _graphY(index) {
  const clamped = Math.max(70, Math.min(120, Number(index) || 100));
  return Math.round(104 - ((clamped - 70) / 50) * 62);
}

function _graphPath(a, b) {
  if (!a || !b) return '';
  return `M${a.x} ${a.y} H${b.x} V${b.y}`;
}

function _renderGrowthGraph(points) {
  const coords = points.map((point, idx) => ({
    ...point,
    x: [36, 138, 292][idx],
    y: _graphY(point.index),
  }));
  return `
    <div class="wt-v4-growth-chart">
      <svg viewBox="0 0 330 132" aria-label="부위별 기준 대비 수행지수 그래프">
        <path d="M18 104 H314" stroke="#ededf0"/><path d="M18 73 H314" stroke="#ededf0"/><path d="M18 42 H314" stroke="#ededf0"/>
        <text x="18" y="36" font-size="10" fill="#9a9aa2">120</text>
        <text x="18" y="70" font-size="10" fill="#9a9aa2">100</text>
        <text x="18" y="119" font-size="10" fill="#707078">${_esc(coords[0]?.roleLabel || '직직전')}</text>
        <text x="124" y="119" font-size="10" fill="#707078">${_esc(coords[1]?.roleLabel || '직전')}</text>
        <text x="276" y="119" font-size="10" fill="#fa342c">오늘</text>
        <path d="${_esc(_graphPath(coords[0], coords[1]))}" fill="none" stroke="#111114" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="today" d="${_esc(_graphPath(coords[1], coords[2]))}" fill="none" stroke="#fa342c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${coords.map(point => `<circle class="${point.isToday ? 'today' : ''}" cx="${point.x}" cy="${point.y}" r="${point.isToday ? 6 : 5}" fill="${point.isToday ? '#fff2f0' : '#fff'}" stroke="${point.isToday ? '#fa342c' : '#111114'}" stroke-width="3"/>`).join('')}
      </svg>
      <div class="wt-v4-growth-legend">
        <span>오늘 점은 성과가 아니라 목표 위치</span>
      </div>
    </div>
  `;
}

function _growthEvidenceText(point) {
  if (!point || point.empty) return '기준 기록 없음';
  const role = point.roleLabel ? `${point.roleLabel} ` : '';
  const date = point.dateKey ? `${_formatShortDate(point.dateKey)} · ` : '';
  return `${role}${point.trackLabel} ${date}${point.name} · ${point.text}`;
}

function _subtractWeeksKey(dateKey, weeksBack = 0) {
  const d = new Date(`${dateKey || ''}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - Math.max(0, Number(weeksBack) || 0) * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _previewCycleFromSnapshot(snapshot, comparison) {
  const todayKey = snapshot?.todayKey || comparison?.today?.dateKey || null;
  const latestKnown = todayKey
    || (comparison?.previous || []).map(x => x?.dateKey).filter(Boolean).sort((a, b) => b.localeCompare(a))[0]
    || null;
  const startDate = snapshot?.startDate
    || snapshot?.schedule?.[0]?.dateKey
    || _subtractWeeksKey(latestKnown, Math.max(0, (Number(snapshot?.weekIndex) || 1) - 1))
    || latestKnown
    || null;
  return {
    ...(snapshot || {}),
    startDate,
    weeks: 6,
    benchmarks: Array.isArray(snapshot?.benchmarks) ? snapshot.benchmarks : [],
  };
}

function _renderGrowthDetailPanel({ history = [], detailProfile = null } = {}) {
  const weakLabels = (detailProfile?.gaps || []).map(x => _finePartLabel(x.part));
  const headline = weakLabels.length
    ? `${weakLabels.join('/')} 추천`
    : '';
  const lines = (history || [])
    .filter(point => point && !point.empty)
    .slice(0, 2)
    .map(point => _growthEvidenceText(point));
  if (!headline && !lines.length) return '';
  return `
      <div class="wt-v4-growth-plan">
        ${headline ? `<div class="wt-v4-growth-tags"><span>${_esc(headline)}</span></div>` : ''}
        ${lines.map(line => `<p>${_esc(line)}</p>`).join('')}
      </div>
  `;
}

function _combinedGrowthSubBalance(comparison) {
  const counts = {};
  const sessions = [comparison?.today, ...((comparison?.previous || []))].filter(Boolean);
  for (const session of sessions) {
    for (const [part, value] of Object.entries(session?.subBalance || {})) {
      counts[part] = (counts[part] || 0) + (Number(value) || 0);
    }
  }
  return counts;
}

function _buildGrowthImbalancePlans(comparison, majors = [], movements = MOVEMENTS) {
  const weakSubs = comparison?.imbalance?.weakSubPatterns;
  if (!Array.isArray(weakSubs) || !weakSubs.length) return [];
  const allowedMajors = new Set((majors || []).map(_normalizeMaxMajor).filter(Boolean));
  const counts = _combinedGrowthSubBalance(comparison);
  const byMajor = new Map();
  for (const part of weakSubs) {
    const major = _normalizeMaxMajor(SUBPATTERN_TO_MAJOR[part] || part);
    if (!major || (allowedMajors.size && !allowedMajors.has(major))) continue;
    if (!byMajor.has(major)) byMajor.set(major, []);
    byMajor.get(major).push(part);
  }

  return [...byMajor.entries()].map(([major, parts]) => {
    const labels = parts.map(_finePartLabel);
    const strongest = comparison?.imbalance?.strongest || null;
    const strongestMajor = _normalizeMaxMajor(SUBPATTERN_TO_MAJOR[strongest] || strongest);
    const dominant = strongest && strongestMajor === major ? _finePartLabel(strongest) : '';
    const movementNames = _sameDayDetailMovementNames(parts, movements);
    const move = _sameDayFocusMoveCopy(movementNames, `${labels.join('/')} 보조 종목 1개`);
    const countText = parts
      .map(part => `${_finePartLabel(part)} ${Number(counts[part]) || 0}세트`)
      .join(', ');
    return {
      major,
      label: MAJOR_LABEL[major] || major,
      focus: `${labels.join('/')} 보강`,
      priority: 'warn',
      copy: dominant
        ? `최근 같은 부위 기록이 ${dominant} 위주라 ${labels.join('/')}가 부족합니다. 다음엔 ${move}를 벤치마크 뒤 2-3세트로 넣으세요.`
        : `최근 같은 부위 기록에서 ${labels.join('/')} 비중이 낮습니다. 다음엔 ${move}를 벤치마크 뒤 2-3세트로 넣으세요.`,
      evidence: countText ? `근거: 최근 합산 ${countText}` : '',
    };
  });
}

function _renderGrowthWeakCoachPanel({ comparison, cache, exList, majors, movements = MOVEMENTS } = {}) {
  const majorList = _sameDayMajorList(majors, comparison);
  if (!majorList.length) return '';
  const recentPlans = _buildSameDayMajorPlans({ comparison, cache, exList, majors: majorList, movements })
    .filter(plan => plan && plan.priority !== 'ok');
  const rows = [];
  const seenMajors = new Set();
  for (const plan of recentPlans) {
    if (!plan?.major || seenMajors.has(plan.major)) continue;
    seenMajors.add(plan.major);
    rows.push(plan);
  }
  for (const plan of _buildGrowthImbalancePlans(comparison, majorList, movements)) {
    if (!plan?.major || seenMajors.has(plan.major)) continue;
    seenMajors.add(plan.major);
    rows.push(plan);
  }
  if (!rows.length) return '';

  const summary = rows
    .slice(0, 3)
    .map(row => {
      const focus = String(row.focus || '');
      return focus.startsWith(row.label) ? focus : `${row.label} ${focus}`;
    })
    .join(' · ');

  return `
      <div class="wt-v4-growth-plan wt-v4-growth-coach">
        <div class="wt-v4-growth-coach-head">
          <span class="wt-v4-growth-coach-label">보완 코멘트</span>
          ${summary ? `<span class="wt-v4-growth-coach-summary">${_esc(summary)}</span>` : ''}
        </div>
        <div class="wt-v4-growth-coach-list">
          ${rows.map(row => `
            <div class="wt-v4-growth-coach-row">
              <p class="wt-v4-growth-coach-copy">${_esc(row.label)} · ${_esc(row.copy)}</p>
              ${row.evidence ? `<p class="wt-v4-growth-coach-evidence">${_esc(row.evidence)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
  `;
}

export function renderMaxGrowthPreview({ comparison, cache, exList, majors, movements = MOVEMENTS, snapshot = null } = {}) {
  const majorList = _sameDayMajorList(majors, comparison);
  if (!majorList.length) return '';
  const coachHtml = _renderGrowthWeakCoachPanel({ comparison, cache, exList, majors: majorList, movements });
  const cards = majorList.map(major => {
    const benchmarks = _majorBenchmarks(snapshot, major);
    const benchmark = benchmarks[0] || null;
    const majorHistorySlots = _sameDayMajorHistorySlots({ comparison, cache, exList, major, movements });
    const benchmarkHistorySlots = _benchmarkHistorySlots({
      cache,
      exList,
      movements,
      major,
      benchmark,
      beforeKey: comparison?.today?.dateKey || null,
    });
    const historySlots = benchmarkHistorySlots.length ? benchmarkHistorySlots : majorHistorySlots;
    const benchmarkOnly = benchmarkHistorySlots.length > 0;
    const history = historySlots.map((slot, idx) => _representativeHistoryPoint({
      day: cache?.[slot.dateKey],
      exList,
      movements,
      major,
      benchmark,
      dateKey: slot.dateKey,
      roleLabel: benchmarkOnly
        ? (idx === 0 ? '기준' : '이전 기준')
        : (idx === 0 ? '직전' : '직직전'),
      benchmarkOnly,
    }));
    const latest = history[0] || null;
    const prev = history[1] || null;
    const detailProfile = _sameDayDetailProfileFromSessions(historySlots, major);
    const detailHtml = _renderGrowthDetailPanel({
      history: [latest, prev],
      detailProfile,
    });
    return renderMaxBenchmarkPlanPreview({
      cycle: _previewCycleFromSnapshot(snapshot, comparison),
      major,
      benchmark,
      extraBenchmarks: Math.max(0, benchmarks.length - 1),
      cache,
      exList,
      todayKey: snapshot?.todayKey || comparison?.today?.dateKey || null,
      detailHtml,
    });
  }).join('');
  return `
    <section class="card wt-v4-growth-preview" aria-label="성장판 미리보기">
      <div class="card-head">
        <div>
          <b>성장판 미리보기</b>
        </div>
        <div class="badge">통합</div>
      </div>
      ${coachHtml}
      <div class="wt-v4-growth-list">${cards}</div>
    </section>
  `;
}

function _formatMajorDelta(n, unit = '') {
  if (n == null) return '';
  const rounded = Math.round(Number(n) || 0);
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString()}${unit}`;
}

function _sameDayFocusMoveCopy(names, fallback) {
  return names?.length ? `${names.join(' / ')} 중 1개` : fallback;
}

function _sameDayMajorEvidence({ label, latest, prev, volumeDelta, detailProfile, noHistory }) {
  if (noHistory) return `근거: 최근 2회에서 ${label} 작업세트 없음`;
  const pieces = [];
  if (latest) pieces.push(`직전 ${_formatShortDate(latest.dateKey)} ${latest.workSets || 0}세트`);
  if (prev) pieces.push(`직직전 ${_formatShortDate(prev.dateKey)} ${prev.workSets || 0}세트`);
  if (volumeDelta != null) pieces.push(`볼륨 ${_formatMajorDelta(volumeDelta)}`);
  if (detailProfile?.gaps?.length) {
    const weak = detailProfile.gaps.map(x => _finePartLabel(x.part)).join('/');
    const dominant = detailProfile.dominant?.map(x => _finePartLabel(x.part)).join('/');
    pieces.push(dominant ? `${dominant} 대비 ${weak} 부족` : `${weak} 부족`);
  }
  return `근거: ${pieces.join(' · ')}`;
}

function _buildSameDayMajorPlan({ comparison, cache, exList, major, movements = MOVEMENTS } = {}) {
  const label = MAJOR_LABEL[major] || major;
  const history = _sameDayMajorHistorySlots({ comparison, cache, exList, major, movements });
  const latest = history[0] || null;
  const prev = history[1] || null;
  const latestHas = !!(latest && (latest.workSets || latest.totalVolume));
  const prevHas = !!(prev && (prev.workSets || prev.totalVolume));
  const noHistory = !latestHas && !prevHas;
  const setDelta = latest && prev ? (latest.workSets || 0) - (prev.workSets || 0) : null;
  const volumeDelta = latest && prev ? (latest.totalVolume || 0) - (prev.totalVolume || 0) : null;
  const repsDelta = latest && prev ? Math.round(((latest.avgReps || 0) - (prev.avgReps || 0)) * 10) / 10 : null;
  const planMiss = latest?.adherence != null && latest.adherence < 90;
  const setDrop = prevHas && setDelta != null && setDelta <= -2;
  const volumeDrop = prevHas && volumeDelta != null && volumeDelta < 0;
  const repsDrop = latestHas && prevHas && repsDelta != null && repsDelta < -0.5;
  const detailProfile = _sameDayDetailProfileFromSessions(history, major);
  const weakParts = detailProfile?.gaps?.map(x => x.part) || [];
  const weakLabels = weakParts.map(_finePartLabel);
  const dominantLabels = detailProfile?.dominant?.map(x => _finePartLabel(x.part)) || [];
  const weakMoveNames = weakParts.length ? _sameDayDetailMovementNames(weakParts, movements) : [];
  const majorMoveNames = _sameDayMajorMovementNames(major, movements);
  const fallbackMove = `${label} 보조 종목 1개`;
  let focus = '유지';
  let priority = 'ok';
  let copy = `${label}은 최근 흐름이 크게 무너지지 않았습니다. 메인은 계획대로 가고 미달 종목만 같은 중량으로 반복 품질을 맞추세요.`;

  if (noHistory) {
    focus = '기준 기록 만들기';
    priority = 'warn';
    const move = _sameDayFocusMoveCopy(majorMoveNames, fallbackMove);
    copy = `최근 같은 부위 기록이 부족합니다. 다음엔 ${move}를 2-3세트 넣어서 비교 기준부터 남기세요.`;
  } else if (weakParts.length) {
    focus = `${weakLabels.join('/')} 보강`;
    priority = 'warn';
    const dominant = dominantLabels.length ? `${dominantLabels.join('/')} 위주` : '한쪽 패턴 위주';
    const move = _sameDayFocusMoveCopy(weakMoveNames, `${weakLabels.join('/')} 보조 종목 1개`);
    copy = `최근 2회가 ${dominant}라 ${weakLabels.join('/')}가 부족합니다. 다음엔 ${move}를 벤치마크 뒤 2-3세트로 넣으세요.`;
  } else if (!latestHas && prevHas) {
    focus = '볼륨 회복';
    priority = 'warn';
    const move = _sameDayFocusMoveCopy(majorMoveNames, fallbackMove);
    copy = `직전 같은 부위 Day에서 ${label} 작업세트가 빠졌습니다. 다음엔 ${move}를 2-4세트 넣어 총량부터 회복하세요.`;
  } else if (setDrop || volumeDrop || planMiss) {
    focus = '볼륨 회복';
    priority = 'warn';
    const move = _sameDayFocusMoveCopy(majorMoveNames, fallbackMove);
    copy = `직전 ${label} 세트/볼륨이 직직전보다 줄었습니다. 증량보다 ${move}를 2-4세트 채워 총량을 먼저 맞추세요.`;
  } else if (repsDrop) {
    focus = '반복 회복';
    priority = 'warn';
    copy = `평균 반복수가 내려갔습니다. 다음 ${label} 메인은 무게를 올리기보다 같은 중량으로 목표 반복을 먼저 맞추세요.`;
  }

  return {
    major,
    label,
    focus,
    priority,
    copy,
    evidence: _sameDayMajorEvidence({ label, latest, prev, volumeDelta, detailProfile, noHistory }),
  };
}

function _buildSameDayMajorPlans({ comparison, cache, exList, majors, movements = MOVEMENTS } = {}) {
  return _sameDayMajorList(majors, comparison)
    .map(major => _buildSameDayMajorPlan({ comparison, cache, exList, major, movements }))
    .filter(Boolean);
}

function _renderSameDayMajorPlans(plans = []) {
  if (!plans.length) return '';
  return `
    <div class="wt-v4-next-day-plan-list">
      ${plans.map(plan => `
        <div class="wt-v4-next-day-major-row ${plan.priority === 'ok' ? 'is-ok' : 'is-warn'}">
          <div class="wt-v4-next-day-major-head">
            <b>${_esc(plan.label)}</b>
            <strong>${_esc(plan.focus)}</strong>
          </div>
          <p>${_esc(plan.copy)}</p>
          <small>${_esc(plan.evidence)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function _sameDayOverallCopy(plans = []) {
  const priorities = plans.filter(p => p.priority !== 'ok');
  if (!priorities.length) return '전체적으로 무리한 이탈은 없습니다. 메인 계획은 유지하고 실패한 세트만 반복 품질을 맞추세요.';
  return priorities
    .slice(0, 3)
    .map(p => `${p.label} ${p.focus}`)
    .join(' → ') + ' 순서로 가져가세요.';
}

function _renderSameDayDetailAdvice(comparison, majors, movements = MOVEMENTS) {
  const gaps = _sameDayDetailGaps(comparison, majors);
  if (!gaps.length) return '';
  const weakParts = gaps.flatMap(g => g.gaps.map(x => x.part));
  const movementNames = _sameDayDetailMovementNames(weakParts, movements);
  const summary = gaps.map(g => {
    const majorLabel = MAJOR_LABEL[g.major] || g.major;
    const parts = g.gaps.map(x => `${_finePartLabel(x.part)} ${x.sets}세트`).join(', ');
    return `${majorLabel} 안에서는 ${parts} 비중이 낮습니다`;
  }).join(' · ');
  const movementCopy = movementNames.length
    ? `추천 보강은 ${movementNames.join(' / ')} 중 1-2개를 벤치마크 뒤에 2-3세트입니다.`
    : '추천 보강은 해당 세부 부위 고립 또는 보조 종목을 벤치마크 뒤에 2-3세트입니다.';
  return `
    <div class="bench wt-v4-next-day-detail-row">
      <div>
        <b>세부 보완</b>
        <span>${_esc(summary)}.</span>
        <span>${_esc(movementCopy)}</span>
      </div>
      <strong class="warn">보강</strong>
    </div>
  `;
}

function _signedNum(n) {
  const v = Number(n) || 0;
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}`;
}

function _formatVolume(n) {
  return Math.round(Number(n) || 0).toLocaleString();
}

function _renderSameDaySessionRow(session, { label, status = '기록', statusClass = '' } = {}) {
  if (!session) return '';
  const parts = [
    `${session.workSets || 0}세트`,
    `${_formatVolume(session.totalVolume)}볼륨`,
  ];
  if (session.avgReps) parts.push(`평균 ${session.avgReps}회`);
  if (session.topKg) parts.push(`최고 ${session.topKg}kg`);
  return `
    <div class="bench">
      <div>
        <b>${_esc(label)} · ${_esc(_formatShortDate(session.dateKey))}</b>
        <span>${_esc(parts.join(' · '))}</span>
      </div>
      <strong class="${_esc(statusClass)}">${_esc(status)}</strong>
    </div>
  `;
}

function _renderSameDaySignalRow({ latest, setDelta, volumeDelta, repsDelta, good }) {
  const signals = [];
  if (latest.adherence != null) signals.push(`계획 이행률 ${latest.adherence}%`);
  if (latest.volumeDelta != null) signals.push(`계획 대비 볼륨 ${_signedNum(latest.volumeDelta)}`);
  if (setDelta != null) signals.push(`세트 ${_signedNum(setDelta)}`);
  if (volumeDelta != null) signals.push(`볼륨 ${_signedNum(volumeDelta)}`);
  if (repsDelta != null) signals.push(`평균 반복 ${_signedNum(repsDelta)}회`);
  if (!signals.length) return '';
  return `
    <div class="bench">
      <div>
        <b>다음 Day 판정</b>
        <span>${_esc(signals.join(' · '))}</span>
      </div>
      <strong class="${good ? '' : 'warn'}">${good ? '진행' : '조정'}</strong>
    </div>
  `;
}

export function renderNextSameMuscleDayAdvice({ comparison, cache, exList, majors, movements = MOVEMENTS } = {}) {
  const sessions = _maxSameMuscleHistoryStats({ comparison, cache, exList, majors, movements });
  const latest = sessions[0];
  if (!latest) return '';
  const prev = sessions[1] || null;
  const setDelta = prev ? latest.workSets - prev.workSets : null;
  const volumeDelta = prev ? latest.totalVolume - prev.totalVolume : null;
  const repsDelta = prev ? Math.round((latest.avgReps - prev.avgReps) * 10) / 10 : null;
  const planMiss = latest.adherence != null && latest.adherence < 90;
  const volumeDrop = volumeDelta != null && volumeDelta < 0;
  const repsDrop = repsDelta != null && repsDelta < -0.5;
  const setDrop = setDelta != null && setDelta <= -2;
  const good = !planMiss && !volumeDrop && !repsDrop && !setDrop;
  const majorPlans = _buildSameDayMajorPlans({ comparison, cache, exList, majors, movements });
  const hasMajorAdjust = majorPlans.some(p => p.priority !== 'ok');
  const statusGood = good && !hasMajorAdjust;
  const evidenceHtml = `
    <details class="wt-v4-next-day-evidence">
      <summary>직전 기록 근거</summary>
      <div class="bench-list">
        ${_renderSameDaySessionRow(latest, { label: '직전 동일 부위', status: '기준' })}
        ${prev ? _renderSameDaySessionRow(prev, { label: '직직전 동일 부위', status: '비교', statusClass: 'muted' }) : ''}
        ${_renderSameDaySignalRow({ latest, setDelta, volumeDelta, repsDelta, good })}
      </div>
    </details>
  `;
  return `
    <section class="card wt-v4-next-day-coach">
      <div class="card-head">
        <div>
          <b>다음 동일 부위 Day 제안</b>
          <span>${_esc(_sameDayOverallCopy(majorPlans))}</span>
        </div>
        <div class="badge ${statusGood ? '' : 'warn'}">${statusGood ? '정상 페이스' : '조정 필요'}</div>
      </div>
      ${_renderSameDayMajorPlans(majorPlans)}
      ${evidenceHtml}
    </section>
  `;
}
