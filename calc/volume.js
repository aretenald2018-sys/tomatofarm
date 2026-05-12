// ================================================================
// calc/volume.js — 운동 볼륨/히스토리 순수 계산
// ================================================================

export function calcRomFactor(set = {}) {
  if (set.romPct === '' || set.romPct == null) return 1;
  const pct = Number(set.romPct);
  if (!Number.isFinite(pct)) return 1;
  return Math.max(0, Math.min(100, pct)) / 100;
}

export function calcSetVolume(set = {}) {
  return (Number(set.kg) || 0) * (Number(set.reps) || 0) * calcRomFactor(set);
}

export function calcVolume(sets) {
  return (sets || []).reduce((sum, s) => {
    if (s.setType === 'warmup') return sum;
    if (!s.done && s.done !== undefined) return sum;
    return sum + calcSetVolume(s);
  }, 0);
}

export function calcVolumeAll(sets) {
  return (sets || []).reduce((sum, s) => sum + calcSetVolume(s), 0);
}

export function getVolumeHistory(cache, exerciseId) {
  return Object.entries(cache)
    .filter(([, day]) => (day.exercises || []).some(e => e.exerciseId === exerciseId))
    .map(([key, day]) => {
      const entry = day.exercises.find(e => e.exerciseId === exerciseId);
      return { date: key, volume: calcVolume(entry.sets) };
    })
    .filter(h => h.volume > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getLastSession(cache, exerciseId, excludeDateKey = null) {
  const entries = Object.entries(cache)
    .filter(([key, day]) => key !== excludeDateKey && (day.exercises || []).some(e => e.exerciseId === exerciseId))
    .sort(([a], [b]) => b.localeCompare(a));
  if (!entries.length) return null;
  const [date, day] = entries[0];
  const entry = day.exercises.find(e => e.exerciseId === exerciseId);
  return { date, sets: entry.sets };
}

export function getLastActivitySession(cache, type, excludeDateKey = null) {
  const matchers = {
    cf: (day) => !!day.cf,
    running: (day) => !!day.running,
    swimming: (day) => !!day.swimming,
    stretching: (day) => !!day.stretching,
  };
  const isMatch = matchers[type];
  if (!isMatch) return null;

  const entries = Object.entries(cache)
    .filter(([key, day]) => key !== excludeDateKey && isMatch(day))
    .sort(([a], [b]) => b.localeCompare(a));

  if (!entries.length) return null;

  const [date, day] = entries[0];
  if (type === 'cf') {
    return {
      date,
      wod: day.cfWod || '',
      durationMin: day.cfDurationMin || 0,
      durationSec: day.cfDurationSec || 0,
      memo: day.cfMemo || '',
    };
  }
  if (type === 'running') {
    return {
      date,
      distance: day.runDistance || 0,
      durationMin: day.runDurationMin || 0,
      durationSec: day.runDurationSec || 0,
      memo: day.runMemo || '',
    };
  }
  if (type === 'swimming') {
    return {
      date,
      distance: day.swimDistance || 0,
      durationMin: day.swimDurationMin || 0,
      durationSec: day.swimDurationSec || 0,
      stroke: day.swimStroke || '',
      memo: day.swimMemo || '',
    };
  }
  return {
    date,
    duration: day.stretchDuration || 0,
    memo: day.stretchMemo || '',
  };
}

export function getVolumeHistoryByMovement(cache, exList, movementId) {
  if (!cache || !movementId) return [];
  const ids = (exList || [])
    .filter(e => e && e.movementId === movementId)
    .map(e => e.id);
  if (ids.length === 0) return [];
  return getVolumeHistoryMulti(cache, ids);
}

export function getVolumeHistoryMulti(cache, exerciseIds) {
  if (!cache || !exerciseIds?.length) return [];
  const idSet = new Set(exerciseIds);
  const byDate = {};
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const entries = (day.exercises || []).filter(e => idSet.has(e.exerciseId));
    if (!entries.length) continue;
    const vol = entries.reduce((sum, e) => sum + calcVolume(e.sets), 0);
    if (vol > 0) byDate[key] = (byDate[key] || 0) + vol;
  }
  return Object.entries(byDate)
    .map(([date, volume]) => ({ date, volume }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
