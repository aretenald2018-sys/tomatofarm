import { toFiniteNumber as _num } from '../utils/number.js';
import { getCache, getExList, getMuscleParts } from '../data.js';
import { calcBurnedKcal, SUBPATTERN_TO_MAJOR } from '../calc.js';
import { calcSetVolume } from '../calc/volume.js';
import { MOVEMENTS } from '../config.js';
import { getWorkoutSessions } from '../workout/sessions.js';
import { buildWorkoutSetTimeline } from '../workout/timeline.js';
import {
  manualCardioDisplayData as _cardioEntryData,
  manualCardioSummaryText as _cardioSummaryText,
} from '../workout/cardio-model.js';
import { workoutExerciseCompletionStampAt } from '../workout/exercise-completion.js';
import {
  _dateDistanceLabel,
  _formatSetText,
  _hasDraftWorkoutEntry,
  _isActualWorkoutSet,
  _workoutSheetRawNumber,
} from './format.js';
import { _activityRows } from './day-metrics.js';

export const FALLBACK_MAJOR_LABELS = {
  chest: '가슴',
  back: '등',
  shoulder: '어깨',
  lower: '하체',
  glute: '둔부',
  bicep: '이두',
  tricep: '삼두',
  abs: '복부',
  other: '기타',
};

export function _buildWorkoutLookup() {
  return {
    exById: new Map((getExList() || []).filter(Boolean).map(ex => [ex.id, ex])),
    movById: new Map((MOVEMENTS || []).filter(Boolean).map(mv => [mv.id, mv])),
    muscleById: new Map((getMuscleParts() || []).filter(Boolean).map(m => [m.id, m])),
  };
}

export function _primaryFromIds(value) {
  return Array.isArray(value) ? value.find(Boolean) : null;
}

export function _normalizeMajorId(id) {
  if (!id) return null;
  return SUBPATTERN_TO_MAJOR[id] || id;
}

export function _resolveExerciseMajorId(entry, lookup) {
  const lib = lookup?.exById?.get(entry?.exerciseId);
  const primaryId = _primaryFromIds(entry?.muscleIds) || _primaryFromIds(lib?.muscleIds);
  if (primaryId) return _normalizeMajorId(primaryId);

  const movementId = entry?.movementId || lib?.movementId || null;
  const movement = movementId ? lookup?.movById?.get(movementId) : null;
  if (movement?.primary) return movement.primary;
  if (movement?.subPattern) return _normalizeMajorId(movement.subPattern);

  return _normalizeMajorId(entry?.muscleId || lib?.muscleId);
}

export function _majorLabel(id, lookup) {
  if (!id) return FALLBACK_MAJOR_LABELS.other;
  return lookup?.muscleById?.get(id)?.name || FALLBACK_MAJOR_LABELS[id] || id;
}

export function _partDisplayLabels(exercises, lookup) {
  const byMajor = new Map();
  const cardioLabels = [];
  exercises.forEach((row) => {
    if (row.cardio) {
      cardioLabels.push({
        text: row.name,
        title: `${row.name} · 유산소`,
      });
      return;
    }
    if (row.setCount <= 0) return;
    const id = row.majorId || 'other';
    if (!byMajor.has(id)) {
      byMajor.set(id, {
        id,
        name: _majorLabel(id, lookup),
        setCount: 0,
        volume: 0,
        order: byMajor.size,
      });
    }
    const item = byMajor.get(id);
    item.setCount += row.setCount;
    item.volume += row.volume;
  });
  return [
    ...cardioLabels,
    ...[...byMajor.values()]
    .sort((a, b) => (b.setCount - a.setCount) || (b.volume - a.volume) || (a.order - b.order))
    .map(item => ({
      text: `${item.name} ${item.setCount}`,
      title: `${item.name} ${item.setCount}세트`,
    })),
  ];
}

export function _workoutEntryName(entry = {}) {
  return String(entry?.name || entry?.exerciseName || entry?.exerciseId || '').trim();
}

// 2026-07-25: '지난 기록'은 종목(기구) 단위 기억이어야 한다. movementId는 동작 카탈로그
//   (chest_fly 등)라 같은 헬스장의 아스날 플라이/매트릭스 플라이가 모두 같은 값을 갖는다.
//   이전 구현은 exerciseId가 서로 달라도 movementId 폴백으로 내려가 다른 기구 기록을
//   집어왔다(아스날 카드에 매트릭스 41kg×15 4세트 노출). 양쪽 모두 exerciseId를 가지면
//   그 비교 결과가 곧 결론이고, 폴백은 exerciseId가 없는 레거시 기록에만 적용한다.
//   트랙 그래프(getTrackMetricHistory)와 동일한 exerciseId 기준 정체성이다.
export function _workoutEntryMatchesRow(entry = {}, row = {}) {
  const rowExerciseId = String(row?.exerciseId || '').trim();
  const entryExerciseId = String(entry?.exerciseId || '').trim();
  if (rowExerciseId && entryExerciseId) return rowExerciseId === entryExerciseId;
  const rowName = String(row?.name || '').trim();
  const entryName = _workoutEntryName(entry);
  if (rowName && entryName) return rowName === entryName;
  const rowMovementId = String(row?.movementId || '').trim();
  const entryMovementId = String(entry?.movementId || '').trim();
  return !!rowMovementId && rowMovementId === entryMovementId;
}

export function _workoutRecordFromEntry(key, entry = {}) {
  const rawSets = Array.isArray(entry?.sets) ? entry.sets.filter(Boolean) : [];
  const sets = rawSets.filter(_isActualWorkoutSet);
  if (!sets.length) return null;
  const topSet = [...sets].sort((a, b) => calcSetVolume(b) - calcSetVolume(a))[0] || null;
  return {
    dateKey: key,
    dateLabel: _dateDistanceLabel(key),
    setCount: sets.length,
    volume: sets.reduce((sum, set) => sum + calcSetVolume(set), 0),
    topSetText: topSet ? _formatSetText(topSet) : '세트 기록 없음',
    setTexts: sets.map(_formatSetText),
    setDetails: sets.map((set, setIndex) => ({
      setIndex,
      kg: _num(set.kg),
      reps: _num(set.reps),
      rpe: _num(set.rpe),
      rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
      romPct: Number.isFinite(Number(set.romPct)) ? Number(set.romPct) : 100,
      setType: set.setType || 'main',
      wendlerRole: set.wendlerRole || '',
      supplementalKind: set.supplementalKind || '',
      wendlerPct: Number.isFinite(Number(set.wendlerPct)) ? Number(set.wendlerPct) : null,
      amrap: set.amrap === true,
      completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null,
      done: _isActualWorkoutSet(set),
    })),
  };
}

export function _previousWorkoutRecordForRow(cache = null, row = {}) {
  const selectedKey = String(row?.dateKey || '').trim();
  const source = cache && typeof cache === 'object' ? cache : getCache();
  const keys = Object.keys(source || {})
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && (!selectedKey || key < selectedKey))
    .sort((a, b) => b.localeCompare(a));
  for (const key of keys) {
    const sessions = getWorkoutSessions(source[key] || {});
    for (const session of sessions) {
      const entry = (Array.isArray(session?.exercises) ? session.exercises : [])
        .find(item => _workoutEntryMatchesRow(item, row));
      const record = entry ? _workoutRecordFromEntry(key, entry) : null;
      if (record) return record;
    }
  }
  return null;
}

export function _exerciseRows(day, lookup = _buildWorkoutLookup(), key = null, options = {}) {
  const includeDraftExercises = options?.includeDraftExercises === true;
  const includePreviousRecord = options?.includePreviousRecord === true;
  const previousRecordCache = options?.cache || null;
  return (Array.isArray(day?.exercises) ? day.exercises : [])
    .map((entry, originalIndex) => {
      const rawSets = Array.isArray(entry?.sets) ? entry.sets.filter(Boolean) : [];
      const sets = rawSets.filter(_isActualWorkoutSet);
      const note = (entry?.note || '').toString().trim();
      const hasDraftExercise = includeDraftExercises && _hasDraftWorkoutEntry(entry);
      const cardio = _cardioEntryData(entry);
      if (!sets.length && !note && !hasDraftExercise && !cardio) return null;
      const volume = sets.reduce((sum, set) => sum + calcSetVolume(set), 0);
      const topSet = [...sets].sort((a, b) => calcSetVolume(b) - calcSetVolume(a))[0] || null;
      const majorId = cardio ? 'cardio' : _resolveExerciseMajorId(entry, lookup);
      const lib = lookup?.exById?.get(entry?.exerciseId);
      const row = {
        dateKey: key,
        exerciseId: entry?.exerciseId || null,
        movementId: entry?.movementId || lib?.movementId || null,
        name: cardio?.label || entry?.name || entry?.exerciseName || entry?.exerciseId || '운동',
        majorId,
        majorName: cardio ? '유산소' : _majorLabel(majorId, lookup),
        recommendationMeta: entry?.recommendationMeta || null,
        maxPrescription: entry?.maxPrescription || null,
        maxTrackPreference: lib?.maxTrackPreference || null,
        supersetGroup: !cardio && entry?.supersetGroup ? String(entry.supersetGroup) : null,
        exerciseCompletedAt: workoutExerciseCompletionStampAt(entry),
        setCount: sets.length,
        volume,
        topSetText: cardio ? _cardioSummaryText(cardio) : (topSet ? _formatSetText(topSet) : '세트 기록 없음'),
        setTexts: sets.map(_formatSetText),
        setDetails: sets.map((set, setIndex) => ({
          setIndex,
          kg: _num(set.kg),
          reps: _num(set.reps),
          rpe: _num(set.rpe),
          rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
          romPct: Number.isFinite(Number(set.romPct)) ? Number(set.romPct) : 100,
          setType: set.setType || 'main',
          wendlerRole: set.wendlerRole || '',
          supplementalKind: set.supplementalKind || '',
          wendlerPct: Number.isFinite(Number(set.wendlerPct)) ? Number(set.wendlerPct) : null,
          amrap: set.amrap === true,
          completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null,
          done: _isActualWorkoutSet(set),
        })),
        rawSetDetails: rawSets.map((set, setIndex) => ({
          setIndex,
          kg: _workoutSheetRawNumber(set.kg),
          reps: _workoutSheetRawNumber(set.reps),
          rpe: _num(set.rpe),
          rir: Number.isFinite(Number(set.rir)) ? Number(set.rir) : null,
          romPct: Number.isFinite(Number(set.romPct)) ? Number(set.romPct) : 100,
          setType: set.setType || 'main',
          wendlerRole: set.wendlerRole || '',
          supplementalKind: set.supplementalKind || '',
          wendlerPct: Number.isFinite(Number(set.wendlerPct)) ? Number(set.wendlerPct) : null,
          amrap: set.amrap === true,
          completedAt: Number.isFinite(Number(set.completedAt)) ? Number(set.completedAt) : null,
          done: set.done === true,
        })),
        note,
        cardio,
        originalIndex,
      };
      if (includePreviousRecord) {
        row.previousRecord = _previousWorkoutRecordForRow(previousRecordCache, row);
      }
      return row;
    })
    .filter(Boolean);
}

export function _workoutMetrics(key, day, bodyWeight, lookup = _buildWorkoutLookup(), options = {}) {
  const d = day || {};
  const exercises = _exerciseRows(d, lookup, key, options);
  const activities = _activityRows(d);
  const burned = calcBurnedKcal(d, bodyWeight);
  const workoutTimeline = buildWorkoutSetTimeline(d.exercises, d.workoutDuration);
  const workoutDurationSec = Math.max(0, Math.round(_num(workoutTimeline.durationSec)));
  const activityDurationSec = activities.reduce((sum, row) => sum + (row.durationSec || 0), 0);
  const hasTimelineRecord = (Number(workoutTimeline.checkedSetCount) || 0) > 0;
  const gymDurationSec = (exercises.length || hasTimelineRecord) ? workoutDurationSec : 0;
  const durationSec = Math.max(gymDurationSec + activityDurationSec, workoutDurationSec, activityDurationSec);
  const setCount = exercises.reduce((sum, row) => sum + row.setCount, 0);
  const volume = exercises.reduce((sum, row) => sum + row.volume, 0);
  const displayLabels = [
    ..._partDisplayLabels(exercises, lookup),
    ...activities.map(row => ({
      text: row.label,
      title: row.main ? `${row.label} · ${row.main}` : row.label,
    })),
  ].filter(row => row?.text);
  const labels = displayLabels.map(row => row.text);
  const hasWorkout = exercises.length > 0 || activities.length > 0 || workoutDurationSec > 0 || hasTimelineRecord || burned.total > 0;
  return {
    key,
    day: d,
    exercises,
    activities,
    burned,
    durationSec,
    workoutDurationSec,
    activityDurationSec,
    setCount,
    volume,
    labels,
    displayLabels,
    primaryLabel: labels[0] || '',
    hasWorkout,
  };
}
