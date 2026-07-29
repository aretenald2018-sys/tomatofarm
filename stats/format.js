import { toFiniteNumber } from '../utils/number.js';

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function maybeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatNumber(value, digits = 0) {
  return Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatVolumeMass(value) {
  const volume = Math.max(0, toFiniteNumber(value));
  if (volume >= 1000) {
    const tons = Math.round((volume / 1000) * 10) / 10;
    return `${formatNumber(tons, Number.isInteger(tons) ? 0 : 1)}t`;
  }
  return `${formatNumber(Math.round(volume))}kg`;
}

export function formatVolumeDelta(value) {
  const volume = toFiniteNumber(value);
  if (!volume) return '0kg';
  return `${volume > 0 ? '+' : '-'}${formatVolumeMass(Math.abs(volume))}`;
}

export function formatSigned(value, digits = 1, unit = 'kg') {
  return `${value >= 0 ? '+' : ''}${formatNumber(value, digits)} ${unit}`;
}

export function formatDateShort(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return match ? `${Number(match[2])}/${Number(match[3])}` : String(key || '');
}
