import { calcBurnedKcal } from '../calc.js';
import { getDietPlan } from '../data.js';
import { escapeHtml as _esc } from '../utils/escape-html.js';
import { dateRange as _dateRange, statsAnalysisRange as _statsAnalysisRange } from './analysis-range.js';
import { dayKcal as _dayKcal, weightOnOrBefore as _weightOnOrBefore } from './day-aggregates.js';
import { formatNumber as _fmt, maybeNumber as _maybeNum } from './format.js';
import { lastRecordedValue, normalizeHealthValues } from './selectors.js';

export const HEALTH_CHART_SERIES = {
  weight: { label: '체중', unit: 'kg', color: '#ef6a6a', background: 'rgba(239,106,106,0.08)', order: 1 },
  bodyFat: { label: '체지방률', unit: '%', color: '#10b981', background: 'rgba(16,185,129,0.08)', order: 2 },
  intake: { label: '섭취칼로리', unit: 'kcal', color: '#6366f1', background: 'rgba(99,102,241,0.10)', order: 3 },
  burned: { label: '운동칼로리', unit: 'kcal', color: '#f59e0b', background: 'rgba(245,158,11,0.10)', order: 4 },
};

function _sampleHealthKeys(keys, maxPoints = 72) {
  if (!Array.isArray(keys) || keys.length <= maxPoints) return keys || [];
  const out = [];
  const step = (keys.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(keys[Math.round(i * step)]);
  }
  return [...new Set(out)];
}

export function _healthChartKeys(range = _statsAnalysisRange()) {
  return _sampleHealthKeys(_dateRange(range.fromKey, range.toKey));
}

export function _buildHealthChartData(keys, cache, checkins) {
  const plan = getDietPlan();
  const checkinByDate = new Map(checkins.map(c => [c.date, c]));
  const labels = keys.map(key => key.slice(5).replace('-', '/'));
  const data = { weight: [], bodyFat: [], intake: [], burned: [] };

  keys.forEach(key => {
    const day = cache[key] || {};
    const checkin = checkinByDate.get(key) || null;
    const weight = _maybeNum(checkin?.weight);
    const bodyFat = _maybeNum(checkin?.bodyFatPct);
    const intake = _dayKcal(day);
    const weightForBurn = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
    const burned = calcBurnedKcal(day, weightForBurn).total;

    data.weight.push(weight !== null ? weight : null);
    data.bodyFat.push(bodyFat !== null ? bodyFat : null);
    data.intake.push(intake > 0 ? intake : null);
    data.burned.push(burned > 0 ? burned : null);
  });

  return { labels, data };
}

function _normalizeHealthValues(values) {
  return normalizeHealthValues(values);
}

export function _healthDataset(key, rawValues) {
  const cfg = HEALTH_CHART_SERIES[key];
  return {
    label: cfg.label,
    data: _normalizeHealthValues(rawValues),
    rawValues,
    healthKey: key,
    borderColor: cfg.color,
    backgroundColor: 'transparent',
    borderWidth: 1.35,
    borderCapStyle: 'round',
    borderJoinStyle: 'round',
    cubicInterpolationMode: 'monotone',
    pointRadius: 0,
    pointHoverRadius: 3,
    pointHitRadius: 12,
    tension: 0.32,
    fill: false,
    spanGaps: true,
    yAxisID: 'y',
    order: cfg.order,
  };
}

export function _formatHealthTooltip(ctx) {
  const key = ctx.dataset.healthKey;
  const value = ctx.dataset.rawValues?.[ctx.dataIndex];
  const cfg = HEALTH_CHART_SERIES[key] || Object.values(HEALTH_CHART_SERIES).find(item => item.label === ctx.dataset.label);
  if (value == null) return `${ctx.dataset.label}: -`;
  if (cfg?.unit === 'kcal') return `${ctx.dataset.label}: ${_fmt(value)}kcal`;
  if (cfg?.unit === '%') return `${ctx.dataset.label}: ${Number(value).toFixed(1)}%`;
  return `${ctx.dataset.label}: ${Number(value).toFixed(1)}kg`;
}

export function _healthChartSeriesWithData(data) {
  return Object.keys(HEALTH_CHART_SERIES)
    .filter(key => data[key]?.some(value => value !== null && value !== undefined));
}

export function _lastHealthValue(values) {
  return lastRecordedValue(values);
}

export function _formatHealthValue(key, value) {
  if (value === null || value === undefined) return '--';
  const cfg = HEALTH_CHART_SERIES[key];
  if (cfg?.unit === 'kcal') return `${_fmt(Math.round(value))}kcal`;
  if (cfg?.unit === '%') return `${Number(value).toFixed(1)}%`;
  return `${Number(value).toFixed(1)}kg`;
}

export function _healthLegendHtml(key, values) {
  const cfg = HEALTH_CHART_SERIES[key];
  const latest = _lastHealthValue(values);
  return `
    <span class="stats-health-legend-chip" style="--health-color:${_esc(cfg.color)}">
      <i></i>${_esc(cfg.label)} <b>${_esc(_formatHealthValue(key, latest))}</b>
    </span>`;
}
