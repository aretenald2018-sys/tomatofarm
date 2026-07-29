import { toFiniteNumber as _num } from '../utils/number.js';
import {
  estimateSet1RM,
  getTrackMetricHistory,
  normalizeWorkoutTrack,
} from '../calc.js';

function _fmtNum(value, digits = 1) {
  const number = _num(value);
  if (Number.isInteger(number)) return String(number);
  return String(Math.round(number * (10 ** digits)) / (10 ** digits));
}

function _formatWeight(value) {
  const number = _num(value);
  return number > 0 ? _fmtNum(number, 1) : '-';
}

export function activeWorkoutTrack(row = {}, bestSet = null) {
  const explicit = normalizeWorkoutTrack(
    row?.recommendationMeta?.track ||
    row?.maxPrescription?.benchmarkTrack ||
    row?.maxPrescription?.track ||
    row?.maxTrackPreference
  );
  if (explicit) return explicit;
  const reps = _num(bestSet?.reps);
  return reps > 0 && reps <= 8 ? 'H' : 'M';
}

export function workoutTrackLabel(track) {
  return track === 'H' ? '강도' : '볼륨';
}

export function formatWorkoutTrackValue(track, value) {
  const number = _num(value);
  if (number <= 0) return track === 'H' ? '추정1RM' : '총볼륨';
  if (track === 'H') return `${Math.round(number)}kg`;
  if (number >= 1000) return `${_fmtNum(number / 1000, 1)}t`;
  return `${Math.round(number)}kg`;
}

function _formatWorkoutTrackDelta(points = []) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const last = _num(points[points.length - 1]?.value);
  const previous = _num(points[points.length - 2]?.value);
  if (!(last > 0) || !(previous > 0)) return '';
  const percent = Math.round(((last - previous) / previous) * 100);
  if (!Number.isFinite(percent) || percent === 0) return '0%';
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

function _workoutTrackDeltaClass(delta) {
  if (!delta) return 'flat';
  if (delta.startsWith('+')) return 'up';
  if (delta.startsWith('-')) return 'down';
  return 'flat';
}

export function workoutTrackHistoryPoints(row, track, { cache = {}, exList = [] } = {}) {
  if (!row?.exerciseId) return [];
  const history = getTrackMetricHistory(cache, exList, row.exerciseId);
  const points = Array.isArray(history?.[track]) ? history[track] : [];
  const currentKey = String(row?.dateKey || '');
  const scoped = currentKey
    ? points.filter(point => !point?.date || String(point.date) <= currentKey)
    : points;
  return scoped.slice(-6);
}

export function workoutFallbackSparkValues(row, track = 'M') {
  const sets = Array.isArray(row?.setDetails) ? row.setDetails : [];
  const raw = sets.map((set) => {
    const kg = _num(set.kg);
    if (track === 'H') return estimateSet1RM(set) || kg;
    return Math.max(0, kg * _num(set.reps));
  }).filter(value => value > 0);
  return raw.length >= 2 ? raw : raw.length === 1 ? [raw[0], raw[0], raw[0]] : [0, 1, 0];
}

function _workoutFallbackTrackValue(row, bestSet, track = 'M') {
  if (track !== 'H') return _num(row?.volume);
  const sets = Array.isArray(row?.setDetails) ? row.setDetails : [];
  const values = sets
    .map(set => estimateSet1RM(set) || _num(set.kg))
    .filter(value => value > 0);
  if (values.length) return Math.max(...values);
  return bestSet ? estimateSet1RM(bestSet) || _num(bestSet.kg) : 0;
}

export function buildWorkoutTrackTrend(row, bestSet, { cache = {}, exList = [] } = {}, requestedTrack = null) {
  const activeTrack = activeWorkoutTrack(row, bestSet);
  const track = requestedTrack === 'H' || requestedTrack === 'M' ? requestedTrack : activeTrack;
  const points = workoutTrackHistoryPoints(row, track, { cache, exList });
  const latest = points.length ? points[points.length - 1] : null;
  const fallbackValue = _workoutFallbackTrackValue(row, bestSet, track);
  const value = _num(latest?.value) || fallbackValue;
  const delta = _formatWorkoutTrackDelta(points);
  const bestKg = bestSet ? _formatWeight(bestSet.kg) : '-';
  return {
    track,
    trackLabel: workoutTrackLabel(track),
    activeTrack,
    points,
    valueLabel: formatWorkoutTrackValue(track, value),
    delta,
    deltaClass: _workoutTrackDeltaClass(delta),
    bottomLabel: bestKg === '-' ? `${row?.setCount || 0}세트` : `${bestKg}kg`,
  };
}
