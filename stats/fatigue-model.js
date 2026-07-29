import { SUBPATTERN_TO_MAJOR, calcVolume } from '../calc.js';
import { MOVEMENTS } from '../config.js';
import { TODAY, getCache, getExList } from '../data.js';
import { getWorkoutSessions } from '../workout/sessions.js';
import { dateFromKey as _dateFromKey } from '../utils/date-key.js';
import { statsAnalysisRange as _statsAnalysisRange } from './analysis-range.js';
import { clamp as _clamp } from './format.js';

export const MAJOR_LABELS = { chest:'가슴', back:'등', lower:'하체', shoulder:'어깨', bicep:'이두', tricep:'삼두', abs:'복근', core:'복근' };
export const LANDMARKS = {
  chest: { label:'가슴', low:8, good:14, high:22 },
  back: { label:'등', low:10, good:16, high:25 },
  lower: { label:'하체', low:8, good:14, high:20 },
  shoulder: { label:'어깨', low:6, good:14, high:22 },
  bicep: { label:'이두', low:6, good:12, high:20 },
  tricep: { label:'삼두', low:6, good:14, high:18 },
  abs: { label:'복근', low:0, good:12, high:25 },
};
const FATIGUE_GROUPS = [
  {
    id: 'back', label: '등', majors: ['back'],
    spots: [{ x: 62, y: 16, w: 24, h: 29, r: -6 }, { x: 65, y: 35, w: 18, h: 16, r: 8 }],
  },
  {
    id: 'shoulder', label: '어깨', majors: ['shoulder'],
    spots: [{ x: 11, y: 18, w: 29, h: 10, r: 3 }, { x: 63, y: 15, w: 26, h: 10, r: -2 }],
  },
  {
    id: 'arms', label: '팔', majors: ['bicep', 'tricep'],
    spots: [{ x: 7, y: 23, w: 10, h: 28, r: -8 }, { x: 32, y: 27, w: 9, h: 27, r: -12 }, { x: 58, y: 23, w: 9, h: 29, r: 10 }, { x: 83, y: 23, w: 8, h: 30, r: -10 }],
  },
  {
    id: 'chest', label: '가슴', majors: ['chest'],
    spots: [{ x: 17, y: 20, w: 22, h: 15, r: 5 }],
  },
  {
    id: 'legs', label: '다리', majors: ['lower', 'glute'],
    spots: [{ x: 12, y: 50, w: 27, h: 39, r: 4 }, { x: 64, y: 49, w: 25, h: 40, r: -3 }],
  },
  {
    id: 'core', label: '코어', majors: ['abs', 'core'],
    spots: [{ x: 21, y: 32, w: 16, h: 19, r: 2 }],
  },
];
const FATIGUE_GROUP_BY_MAJOR = FATIGUE_GROUPS.reduce((acc, group) => {
  group.majors.forEach(major => { acc[major] = group.id; });
  return acc;
}, {});
function _setsBand(sets, lm) {
  if (sets < lm.low) return { tone:'under', label:'부족', msg:`주 ${lm.low - sets}세트만 더` };
  if (sets > lm.high) return { tone:'over', label:'많음', msg:'회복 확인' };
  return { tone:'ok', label: sets >= lm.good ? '충분' : '적정', msg:'유지 가능' };
}
export function _progressView(e) {
  const count = e.pointsCount || 0;
  const deltaKg = e.last - e.first;
  const deltaPct = e.first ? (deltaKg / e.first * 100) : 0;
  const name = String(e.name || '').toLowerCase();
  const likelyAccessory = e.major === 'abs' || /crunch|크런치|curl|컬|raise|레이즈|extension|익스텐션|pushdown|푸시다운/.test(name);
  const suspicious = Math.abs(deltaPct) >= 60 && (count < 4 || likelyAccessory || e.first < 25);
  const reliablePct = count >= 3 && !suspicious && Math.abs(deltaPct) < 60;
  const main = suspicious ? '기록 점검 필요' : (deltaKg >= 0 ? `+${deltaKg.toFixed(1)}kg` : `${deltaKg.toFixed(1)}kg`);
  const sub = suspicious
    ? `변화폭 ${Math.round(deltaPct)}% · 표본 ${count}회`
    : `${e.slope>=0?'+':''}${e.slope.toFixed(1)}kg/주${reliablePct ? ` · ${deltaPct>=0?'+':''}${Math.round(deltaPct)}%` : ` · 표본 ${count}회`}`;
  return { suspicious, main, sub };
}
export function _entryMajor(entry, exById, movById) {
  const ex = exById.get(entry?.exerciseId);
  const sp = Array.isArray(entry?.muscleIds) && entry.muscleIds[0]
    ? entry.muscleIds[0]
    : (Array.isArray(ex?.muscleIds) && ex.muscleIds[0] ? ex.muscleIds[0] : null);
  if (sp && SUBPATTERN_TO_MAJOR[sp]) return SUBPATTERN_TO_MAJOR[sp];
  const mov = movById.get(entry?.movementId || ex?.movementId);
  if (mov?.primary) return mov.primary;
  return entry?.muscleId || ex?.muscleId || 'etc';
}
function _setE1rm(set) {
  const kg = Number(set?.kg) || 0, reps = Number(set?.reps) || 0;
  if (kg <= 0 || reps <= 0) return 0;
  return kg * (1 + Math.min(reps, 30) / 30);
}
export function _isHardSet(set) {
  if (!set || set.setType === 'warmup' || set.done === false) return false;
  if (!((Number(set.kg)||0) > 0 && (Number(set.reps)||0) > 0)) return false;
  const rpe = Number(set.rpe);
  if (Number.isFinite(rpe) && rpe > 0) return rpe >= 7;
  return Number(set.reps) >= 5;
}
export function _topSetE1rm(entry) {
  let best = 0;
  for (const set of entry?.sets || []) {
    if (!_isHardSet(set)) continue;
    best = Math.max(best, _setE1rm(set));
  }
  return best;
}

function _normalizeFatigueMajor(major) {
  if (major === 'glute') return 'glute';
  if (major === 'core') return 'abs';
  return major || 'etc';
}

function _emptyFatigueGroups() {
  return FATIGUE_GROUPS.map(group => ({
    ...group,
    score: 0,
    sets: 0,
    volume: 0,
    days: new Set(),
    lastDate: '',
    level: 0,
  }));
}
function _fatigueRed(level) {
  const n = _clamp(Number(level) || 0, 0, 1);
  const saturation = Math.round(34 + n * 62);
  const lightness = Math.round(72 - n * 16);
  return `hsl(3, ${saturation}%, ${lightness}%)`;
}

function _fatigueBlue(level) {
  const n = _clamp(Number(level) || 0, 0, 1);
  const saturation = Math.round(46 + n * 38);
  const lightness = Math.round(72 - n * 24);
  return `hsl(205, ${saturation}%, ${lightness}%)`;
}

function _fatigueStatus(group, relative) {
  if (relative <= 0) return { tone: 'under', label: '보강', hint: '이번 기간 기록 없음' };
  if (relative < 0.35) return { tone: 'under', label: '보강', hint: '최고 활성 대비 낮음' };
  if (relative < 0.55) return { tone: 'low', label: '낮음', hint: '다음 운동에서 먼저 채우기' };
  if (relative >= 0.82) return { tone: 'hot', label: '집중', hint: '회복 상태 확인' };
  return { tone: 'steady', label: '균형', hint: '현재 흐름 유지' };
}

function _fatigueExerciseEntries(day) {
  return getWorkoutSessions(day, { minCount: 1 })
    .flatMap(session => Array.isArray(session?.exercises) ? session.exercises : []);
}

export function _buildMuscleFatigue(range = _statsAnalysisRange()) {
  const period = {
    key: range.key,
    label: range.label,
    title: range.key === 'week' ? '이번 주' : range.label,
    days: range.actualDays,
  };
  const groups = _emptyFatigueGroups();
  const byId = new Map(groups.map(group => [group.id, group]));
  const exById = new Map(getExList().map(ex => [ex.id, ex]));
  const movById = new Map(MOVEMENTS.map(mov => [mov.id, mov]));
  const todayKey = range.toKey;
  const sinceKey = range.fromKey;
  let trainingDays = 0;

  Object.entries(getCache())
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= sinceKey && key <= todayKey)
    .forEach(([key, day]) => {
      let touched = false;
      const date = _dateFromKey(key);
      const daysAgo = date ? Math.max(0, Math.round((new Date(TODAY) - date) / 86400000)) : 0;
      const recency = 1 - Math.min(daysAgo, Math.max(period.days - 1, 1)) / Math.max(period.days, 1) * 0.3;

      for (const entry of _fatigueExerciseEntries(day)) {
        const major = _normalizeFatigueMajor(_entryMajor(entry, exById, movById));
        const groupId = FATIGUE_GROUP_BY_MAJOR[major];
        const group = byId.get(groupId);
        if (!group) continue;

        const sets = (entry.sets || []).filter(_isHardSet).length;
        const volume = calcVolume(entry.sets || []);
        if (sets <= 0 && volume <= 0) continue;

        group.sets += sets;
        group.volume += volume;
        group.score += (sets || Math.min(volume / 500, 1)) * recency;
        group.days.add(key);
        group.lastDate = group.lastDate && group.lastDate > key ? group.lastDate : key;
        touched = true;
      }

      if (touched) trainingDays++;
    });

  const totalScore = groups.reduce((sum, group) => sum + group.score, 0);
  const maxScore = Math.max(...groups.map(group => group.score), 1);
  groups.forEach(group => {
    const relative = totalScore > 0 ? group.score / maxScore : 0;
    const status = totalScore > 0 ? _fatigueStatus(group, relative) : { tone: 'empty', label: '기록 없음', hint: '' };
    const visualLevel = totalScore > 0
      ? (relative > 0 ? _clamp(relative, 0.18, 1) : 0.30)
      : 0;
    group.level = group.score > 0 ? _clamp(relative, 0.18, 1) : 0;
    group.visualLevel = visualLevel;
    group.relativePct = Math.round(relative * 100);
    group.tone = status.tone;
    group.statusLabel = status.label;
    group.hint = status.hint;
    group.tint = totalScore > 0
      ? (status.tone === 'under' || status.tone === 'low' ? _fatigueBlue(visualLevel) : _fatigueRed(visualLevel))
      : '';
    group.days = group.days.size;
    group.volume = Math.round(group.volume);
  });

  const active = groups.filter(group => group.level > 0).sort((a, b) => b.score - a.score);
  const underactive = totalScore > 0
    ? groups.filter(group => group.tone === 'under' || group.tone === 'low').sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, 'ko'))
    : [];
  const hot = totalScore > 0
    ? groups.filter(group => group.tone === 'hot').sort((a, b) => b.score - a.score)
    : [];
  return {
    period,
    groups,
    active,
    underactive,
    hot,
    top: active[0] || null,
    trainingDays,
    totalSets: groups.reduce((sum, group) => sum + group.sets, 0),
    totalVolume: groups.reduce((sum, group) => sum + group.volume, 0),
    totalScore,
  };
}
