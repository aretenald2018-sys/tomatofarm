// ================================================================
// finance/charts.js — Chart.js 차트 렌더링
// ================================================================

import { S } from './state.js';
import { getCC } from './utils.js';
import { getFinBenchmarks, getFinActuals, getFinPlans } from '../data.js';
import { compoundProjection, formatManwon, getAge } from '../finance-calc.js';

// ── Y축 블러 플러그인 ──
export const yAxisBlurPlugin = {
  id: 'yAxisBlur',
  afterDraw(chart) {
    if (!S.finChartYAxisBlurred) return;
    const yScale = chart.scales.y;
    if (!yScale) return;
    const ctx = chart.ctx;
    const ticks = yScale.ticks;
    if (!ticks || !ticks.length) return;

    ctx.save();
    ctx.filter = 'blur(4px)';
    ctx.font = `${yScale.options.ticks.font?.size || 9}px -apple-system, sans-serif`;
    ctx.fillStyle = yScale.options.ticks.color || getCC().tick;
    ctx.textAlign = yScale.position === 'right' ? 'left' : 'right';
    ctx.textBaseline = 'middle';

    const isRight = yScale.position === 'right';
    const xPos = isRight ? yScale.left + 8 : yScale.right - 8;

    ticks.forEach((tick, i) => {
      const y = yScale.getPixelForTick(i);
      const label = yScale.getLabelForValue(tick.value);
      const formatted = typeof yScale.options.ticks.callback === 'function'
        ? yScale.options.ticks.callback.call(yScale, tick.value, i, ticks)
        : label;
      if (formatted !== undefined && formatted !== null && formatted !== '') {
        const metrics = ctx.measureText(String(formatted));
        const pad = 3;
        ctx.save();
        ctx.filter = 'none';
        ctx.fillStyle = getCC().bg;
        const bgX = isRight ? xPos - pad : xPos - metrics.width - pad;
        ctx.fillRect(bgX, y - 7, metrics.width + pad * 2, 14);
        ctx.restore();

        ctx.fillStyle = yScale.options.ticks.color || getCC().tick;
        ctx.fillText(String(formatted), xPos, y);
      }
    });
    ctx.restore();
  }
};

// ── X축 레이블 생성 ──
function _buildXAxisLabels(allYears) {
  if (allYears.length === 0) return [];
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);
  const labels = [];

  const cutoff = 2030;
  for (let y = minYear; y <= Math.min(maxYear, cutoff); y++) {
    labels.push(y);
  }

  if (maxYear > cutoff) {
    if (allYears.includes(2035) || maxYear >= 2035) labels.push(2035);
    if (allYears.includes(2045) || maxYear >= 2045) labels.push(2045);
  }

  return labels;
}

function _yearToXIndex(year, xLabels) {
  const idx = xLabels.indexOf(year);
  if (idx >= 0) return idx;
  for (let i = 0; i < xLabels.length - 1; i++) {
    if (year > xLabels[i] && year < xLabels[i + 1]) {
      const ratio = (year - xLabels[i]) / (xLabels[i + 1] - xLabels[i]);
      return i + ratio;
    }
  }
  if (year < xLabels[0]) return -1;
  return xLabels.length;
}

// ── 최근 5년 차트 ──
export function renderRecent5Chart() {
  const canvas = document.getElementById('fin-recent5-chart');
  if (!canvas || !window.Chart) return;
  if (S.recent5ChartInstance) S.recent5ChartInstance.destroy();

  const actuals = getFinActuals();
  const plans = getFinPlans();
  const benchmarks = getFinBenchmarks();
  if (benchmarks.length === 0 && actuals.length === 0 && plans.length === 0) return;

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 4;
  const xLabels = [];
  for (let y = startYear; y <= currentYear; y++) xLabels.push(y);

  const benchColors = ['#f59e0b', '#fa342c', '#a855f7', '#ec4899', '#06b6d4'];
  const planColors = ['#8b5cf6', '#d946ef', '#14b8a6', '#f97316', '#64748b'];
  const datasets = [];

  benchmarks.forEach((b, i) => {
    const proj = compoundProjection(b);
    const hasInflation = (b.inflationRate || 0) > 0;
    const nomData = [];
    const realData = [];
    proj.forEach(r => {
      if (r.year >= startYear && r.year <= currentYear) {
        const xi = xLabels.indexOf(r.year);
        if (xi >= 0) {
          nomData.push({ x: xi, y: r.closeBalance });
          if (hasInflation) realData.push({ x: xi, y: r.realCloseBalance });
        }
      }
    });
    const color = benchColors[i % benchColors.length];
    if (nomData.length > 0) {
      datasets.push({ label: (b.name || `벤치마크 ${i + 1}`) + (hasInflation ? ' (명목)' : ''), data: nomData, borderColor: color, borderDash: [5, 3], borderWidth: 2, pointRadius: 3, pointBackgroundColor: color, fill: false, tension: 0.3 });
    }
    if (hasInflation && realData.length > 0) {
      datasets.push({ label: (b.name || `벤치마크 ${i + 1}`) + ' (실질)', data: realData, borderColor: color, borderDash: [2, 4], borderWidth: 1.5, pointRadius: 2, pointBackgroundColor: color, fill: false, tension: 0.3 });
    }
  });

  plans.forEach((p, i) => {
    const entries = (p.entries || []).filter(e => e.year >= startYear && e.year <= currentYear).sort((a, b) => a.year - b.year);
    const data = entries.map(e => ({ x: xLabels.indexOf(e.year), y: e.target })).filter(d => d.x >= 0);
    if (data.length > 0) {
      datasets.push({ label: '🎯 ' + (p.name || `계획 ${i + 1}`), data, borderColor: planColors[i % planColors.length], borderDash: [10, 4], borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: planColors[i % planColors.length], fill: false, tension: 0.3 });
    }
  });

  const recentActuals = actuals.filter(a => a.year >= startYear && a.year <= currentYear);
  if (recentActuals.length > 0) {
    const data = recentActuals.map(a => ({ x: xLabels.indexOf(a.year), y: a.cumulativeSaved })).filter(d => d.x >= 0);
    data.sort((a, b) => a.x - b.x);
    datasets.push({ label: '현실 (누적 저축/투자)', data, borderColor: '#10b981', borderWidth: 3, pointRadius: 5, pointBackgroundColor: '#10b981', fill: false, tension: 0.3 });
  }

  if (datasets.length === 0) return;

  S.recent5ChartInstance = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { left: 0, right: 4, top: 4, bottom: 0 } },
      scales: {
        x: { type: 'linear', min: 0, max: xLabels.length - 1, ticks: { color: getCC().tick, font: { size: 9 }, stepSize: 1, callback: function(value) { const idx = Math.round(value); return idx >= 0 && idx < xLabels.length ? xLabels[idx] : ''; } }, grid: { color: getCC().grid } },
        y: { ticks: { color: getCC().tick, font: { size: 9 }, callback: v => formatManwon(v), maxTicksLimit: 6 }, grid: { color: getCC().grid } },
      },
      plugins: {
        legend: { labels: { color: getCC().label, font: { size: 9 }, boxWidth: 10, padding: 6 } },
        tooltip: { filter: () => !S.finChartYAxisBlurred, callbacks: { title: ctx => { const idx = Math.round(ctx[0].parsed.x); return idx >= 0 && idx < xLabels.length ? `${xLabels[idx]}년 (${getAge(xLabels[idx])}살)` : ''; }, label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}` } },
        title: { display: true, text: `최근 5년 (${startYear}~${currentYear})`, color: getCC().label, font: { size: 11 }, padding: { bottom: 6 } },
      },
    },
    plugins: [yAxisBlurPlugin],
  });
}

// ── 통합 차트 ──
export function renderMainChart() {
  const canvas = document.getElementById('fin-main-chart');
  if (!canvas || !window.Chart) return;
  if (S.mainChartInstance) S.mainChartInstance.destroy();

  const benchmarks = getFinBenchmarks();
  const actuals = getFinActuals();
  const plans = getFinPlans();
  if (benchmarks.length === 0 && actuals.length === 0 && plans.length === 0) return;

  const allYears = new Set();
  benchmarks.forEach(b => { const proj = compoundProjection(b); proj.forEach(r => allYears.add(r.year)); });
  actuals.forEach(a => allYears.add(a.year));
  plans.forEach(p => (p.entries || []).forEach(e => allYears.add(e.year)));

  const xLabels = _buildXAxisLabels([...allYears]);
  if (xLabels.length === 0) return;

  const benchColors = ['#f59e0b', '#fa342c', '#a855f7', '#ec4899', '#06b6d4'];
  const planColors = ['#8b5cf6', '#d946ef', '#14b8a6', '#f97316', '#64748b'];
  const datasets = [];

  benchmarks.forEach((b, i) => {
    const proj = compoundProjection(b);
    const hasInflation = (b.inflationRate || 0) > 0;
    const nomData = [];
    const realData = [];
    for (const label of xLabels) {
      const row = proj.find(r => r.year === label);
      if (row) {
        nomData.push({ x: xLabels.indexOf(label), y: row.closeBalance });
        if (hasInflation) realData.push({ x: xLabels.indexOf(label), y: row.realCloseBalance });
      }
    }
    proj.forEach(r => {
      if (!xLabels.includes(r.year)) {
        const xi = _yearToXIndex(r.year, xLabels);
        if (xi >= 0 && xi <= xLabels.length) {
          nomData.push({ x: xi, y: r.closeBalance });
          if (hasInflation) realData.push({ x: xi, y: r.realCloseBalance });
        }
      }
    });
    nomData.sort((a, b) => a.x - b.x);

    const color = benchColors[i % benchColors.length];
    datasets.push({ label: (b.name || `벤치마크 ${i + 1}`) + (hasInflation ? ' (명목)' : ''), data: nomData, borderColor: color, borderDash: [5, 3], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3 });

    if (hasInflation) {
      realData.sort((a, b) => a.x - b.x);
      datasets.push({ label: (b.name || `벤치마크 ${i + 1}`) + ' (실질)', data: realData, borderColor: color, borderDash: [2, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 });
    }
  });

  plans.forEach((p, i) => {
    const entries = (p.entries || []).sort((a, b) => a.year - b.year);
    const data = [];
    entries.forEach(e => {
      const xi = xLabels.includes(e.year) ? xLabels.indexOf(e.year) : _yearToXIndex(e.year, xLabels);
      if (xi >= 0) data.push({ x: xi, y: e.target });
    });
    data.sort((a, b) => a.x - b.x);
    datasets.push({ label: '🎯 ' + (p.name || `계획 ${i + 1}`), data, borderColor: planColors[i % planColors.length], borderDash: [10, 4], borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: planColors[i % planColors.length], fill: false, tension: 0.3 });
  });

  if (actuals.length > 0) {
    const data = [];
    actuals.forEach(a => {
      const xi = xLabels.includes(a.year) ? xLabels.indexOf(a.year) : _yearToXIndex(a.year, xLabels);
      if (xi >= 0) data.push({ x: xi, y: a.cumulativeSaved });
    });
    data.sort((a, b) => a.x - b.x);
    datasets.push({ label: '현실 (누적 저축/투자)', data, borderColor: '#10b981', borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#10b981', fill: false, tension: 0.3 });
  }

  const gapAnnotations = [];
  for (let i = 0; i < xLabels.length - 1; i++) {
    if (xLabels[i + 1] - xLabels[i] > 1) {
      gapAnnotations.push({ gapStart: i, gapEnd: i + 1, label: `${xLabels[i]}~${xLabels[i + 1]}` });
    }
  }

  S.mainChartInstance = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { left: 0, right: 4, top: 4, bottom: 0 } },
      scales: {
        x: { type: 'linear', min: 0, max: xLabels.length - 1, ticks: { color: getCC().tick, font: { size: 9 }, stepSize: 1, maxRotation: 45, minRotation: 0, callback: function(value) { const idx = Math.round(value); if (idx >= 0 && idx < xLabels.length) return xLabels[idx]; return ''; } }, grid: { color: getCC().grid } },
        y: { ticks: { color: getCC().tick, font: { size: 9 }, callback: v => formatManwon(v), maxTicksLimit: 6 }, grid: { color: getCC().grid } },
      },
      plugins: {
        legend: { labels: { color: getCC().label, font: { size: 9 }, boxWidth: 12, padding: 8 } },
        tooltip: { filter: () => !S.finChartYAxisBlurred, callbacks: { title: ctx => { const idx = Math.round(ctx[0].parsed.x); if (idx >= 0 && idx < xLabels.length) return `${xLabels[idx]}년 (${getAge(xLabels[idx])}살)`; return ''; }, label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}` } },
        title: { display: true, text: '전체 추이', color: getCC().label, font: { size: 11 }, padding: { bottom: 6 } },
      },
    },
    plugins: [yAxisBlurPlugin, {
      id: 'gapIndicator',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        gapAnnotations.forEach(gap => {
          const x1 = xScale.getPixelForValue(gap.gapStart + 0.3);
          const x2 = xScale.getPixelForValue(gap.gapEnd - 0.3);
          const yMid = (yScale.top + yScale.bottom) / 2;
          ctx.save();
          ctx.strokeStyle = getCC().tick;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x1, yScale.top); ctx.lineTo(x1, yScale.bottom); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x2, yScale.top); ctx.lineTo(x2, yScale.bottom); ctx.stroke();
          ctx.setLineDash([]);
          const xMid = (x1 + x2) / 2;
          ctx.fillStyle = getCC().bg;
          ctx.fillRect(xMid - 12, yMid - 10, 24, 20);
          ctx.fillStyle = getCC().tick;
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⋯', xMid, yMid);
          ctx.restore();
        });
      },
    }],
  });
}

// ── 현금흐름 추이 차트 ──
export function renderFlowChart() {
  const canvas = document.getElementById('fin-flow-chart');
  if (!canvas || !window.Chart) return;
  if (S.flowChartInstance) S.flowChartInstance.destroy();

  const actuals = getFinActuals().filter(a => a.inflow || a.fOutflow);
  if (actuals.length === 0) {
    const tableEl = document.getElementById('fin-flow-table');
    if (tableEl) tableEl.innerHTML = `<div style="color:var(--muted);font-size:11px;text-align:center;padding:8px">현금흐름 데이터가 없습니다. 연간실적에서 Inflow/고정지출을 입력하세요.</div>`;
    return;
  }

  const labels = actuals.map(a => `${a.year} (${getAge(a.year)}살)`);
  const inflowData = actuals.map(a => a.inflow || 0);
  const fixedData = actuals.map(a => a.fOutflow || 0);
  const discretionaryData = actuals.map(a => (a.inflow || 0) - (a.fOutflow || 0));
  const monthlyDiscData = actuals.map(a => {
    const d = (a.inflow || 0) - (a.fOutflow || 0);
    return d > 0 ? Math.round(d / 12) : 0;
  });

  S.flowChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Inflow (제세순수익)', data: inflowData, backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: '#10b981', borderWidth: 1, barPercentage: 0.6 },
        { label: '고정지출', data: fixedData, backgroundColor: 'rgba(148, 163, 184, 0.7)', borderColor: '#94a3b8', borderWidth: 1, barPercentage: 0.6 },
        { label: '가처분여력', data: discretionaryData, backgroundColor: 'rgba(59, 130, 246, 0.5)', borderColor: '#fa342c', borderWidth: 1, barPercentage: 0.6 },
        { label: '월환산 가처분', data: monthlyDiscData, type: 'line', borderColor: '#f59e0b', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#f59e0b', fill: false, tension: 0.3, yAxisID: 'y' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: getCC().tick, font: { size: 10 } }, grid: { color: getCC().grid } },
        y: { ticks: { color: getCC().tick, font: { size: 10 }, callback: v => formatManwon(v) }, grid: { color: getCC().grid } },
      },
      plugins: {
        legend: { labels: { color: getCC().label, font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}` } },
      },
    },
  });

  const tableEl = document.getElementById('fin-flow-table');
  if (tableEl) {
    tableEl.innerHTML = `<table class="fin-table" style="margin-top:8px">
      <thead><tr><th>연도</th><th>나이</th><th>Inflow</th><th>고정지출</th><th>가처분여력</th><th>월환산</th></tr></thead>
      <tbody>${actuals.map(a => {
        const disc = (a.inflow || 0) - (a.fOutflow || 0);
        const monthly = disc > 0 ? Math.round(disc / 12) : null;
        const cls = disc >= 0 ? '' : 'neg';
        return `<tr>
          <td>${a.year}</td>
          <td>${getAge(a.year)}살</td>
          <td class="num">${a.inflow ? formatManwon(a.inflow) : '-'}</td>
          <td class="num">${a.fOutflow ? formatManwon(a.fOutflow) : '-'}</td>
          <td class="num ${cls}">${formatManwon(disc)}</td>
          <td class="num">${monthly != null ? formatManwon(monthly) + '/월' : '-'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }
}
