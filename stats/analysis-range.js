import { TODAY, dateKey, getCache } from '../data.js';
import { dateFromKey } from '../utils/date-key.js';

export const STATS_ANALYSIS_PERIODS = Object.freeze({
  week: { label: '이번주', days: 0, kind: 'week' },
  '30': { label: '30일', days: 30 },
  '90': { label: '90일', days: 90 },
  '180': { label: '180일', days: 180 },
  all: { label: '전체', days: 0 },
});

export function keyFromDate(date) {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function keyOffset(daysAgo) {
  const date = new Date(TODAY);
  date.setDate(date.getDate() - daysAgo);
  return keyFromDate(date);
}

export function dateRange(startKey, endKey) {
  const start = dateFromKey(startKey);
  const end = dateFromKey(endKey);
  if (!start || !end || start > end) return [];
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(keyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function dateEntries() {
  const todayKey = keyOffset(0);
  return Object.entries(getCache())
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= todayKey)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function linearSlope(points) {
  const valid = points.filter(point => Number.isFinite(point.y));
  if (valid.length < 2) return 0;
  const count = valid.length;
  const sumX = valid.reduce((sum, point) => sum + point.x, 0);
  const sumY = valid.reduce((sum, point) => sum + point.y, 0);
  const sumXX = valid.reduce((sum, point) => sum + point.x * point.x, 0);
  const sumXY = valid.reduce((sum, point) => sum + point.x * point.y, 0);
  const denominator = count * sumXX - sumX * sumX;
  return denominator ? (count * sumXY - sumX * sumY) / denominator : 0;
}

export function daysBetween(fromKey, toKey) {
  const from = dateFromKey(fromKey);
  const to = dateFromKey(toKey);
  if (!from || !to || from > to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function analysisPeriodConfig(key = '90') {
  return STATS_ANALYSIS_PERIODS[key] || STATS_ANALYSIS_PERIODS['90'];
}

export function weekStartKey() {
  const date = new Date(TODAY);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return keyFromDate(date);
}

export function statsAnalysisRange(key = '90') {
  const config = analysisPeriodConfig(key);
  const todayKey = keyOffset(0);
  const firstKey = dateEntries()[0]?.[0] || todayKey;
  const fromKey = config.kind === 'week'
    ? weekStartKey()
    : (config.days > 0 ? keyOffset(config.days - 1) : firstKey);
  const actualDays = Math.max(1, daysBetween(fromKey, todayKey) + 1);
  return { ...config, key, fromKey, toKey: todayKey, actualDays };
}
