import { toFiniteNumber as _num } from '../utils/number.js';
import { dateFromKey as _dateFromKey, parseDateKey as _parseDateKey } from '../utils/date-key.js';
import { TODAY } from '../data/data-date.js';

export function _fmtNum(value, digits = 1) {
  const number = _num(value);
  if (Number.isInteger(number)) return String(number);
  return String(Math.round(number * (10 ** digits)) / (10 ** digits));
}

export function _isBlankWorkoutSheetNumber(value) {
  return value == null || String(value).trim() === '';
}

export function _workoutSheetInputValue(value, digits = 1) {
  if (_isBlankWorkoutSheetNumber(value)) return '';
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return _fmtNum(number, digits);
}

export function _workoutSheetRawNumber(value) {
  return _isBlankWorkoutSheetNumber(value) ? '' : _num(value);
}

export function _isActualWorkoutSet(set) {
  const type = set?.setType;
  const role = set?.wendlerRole;
  if (!set || type === 'warmup' || role === 'warmup' || type === 'deload' || role === 'deload') return false;
  if (set.done === true) return true;
  if (set.done === false) return false;
  return _num(set.kg) > 0 && _num(set.reps) > 0;
}

export function _hasDraftWorkoutEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !!(
    entry.exerciseId
    || entry.name
    || entry.exerciseName
    || String(entry.note || '').trim()
  );
}

// RIR은 0이 유효한 값(실패 지점까지 수행)이라 _num의 0 처리에 기대지 못한다.
export function _workoutSetRir(set) {
  const raw = set?.rir;
  if (raw == null || String(raw).trim() === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function _formatSetText(set) {
  const kg = _num(set?.kg);
  const reps = _num(set?.reps);
  const rpe = _num(set?.rpe);
  const rir = _workoutSetRir(set);
  const base = [
    kg > 0 ? `${_fmtNum(kg)}kg` : '',
    reps > 0 ? `${_fmtNum(reps)}회` : '',
  ].filter(Boolean).join(' x ');
  const rpeText = rpe > 0 ? ` · RPE ${_fmtNum(rpe)}` : '';
  const rirText = rir != null ? ` · RIR ${_fmtNum(rir)}` : '';
  return `${base || '세트 기록'}${rpeText}${rirText}`;
}

export function _formatDuration(seconds) {
  const sec = Math.max(0, Math.round(_num(seconds)));
  if (sec <= 0) return '시간 미기록';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSeconds = sec % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${remainingSeconds}초`;
}

export function _formatDurationShort(seconds) {
  const sec = Math.max(0, Math.round(_num(seconds)));
  if (sec <= 0) return '—';
  if (sec < 60) return `${sec}초`;
  return `${Math.round(sec / 60)}분`;
}

export function _isoWeekNumber(date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}


export function _dateDistanceLabel(key) {
  const target = _dateFromKey(key);
  if (!target) return '';
  const today = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '오늘';
  if (diff > 0) return `${diff}일 전`;
  return `${Math.abs(diff)}일 후`;
}

export function _dateTitle(key) {
  const parsed = _parseDateKey(key);
  if (!parsed) return key || '';
  return `${parsed.y}-${String(parsed.m + 1).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
}

export function _durationFromMinSec(min, sec) {
  return Math.max(0, Math.round((_num(min) * 60) + _num(sec)));
}
