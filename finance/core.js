// ================================================================
// finance/core.js — renderFinance 메인 오케스트레이터
// ================================================================

import { S } from './state.js';
import { chartColors, getCC, getMarketStatus } from './utils.js';
import { fetchExchangeRate } from '../data.js';
import { loadMarketData, renderContextLine, renderStockList, renderPortfolioSummary } from './market.js';
import { loadSwingData } from './swing.js';
import { renderBenchmarks, renderActuals, renderPlans, renderNetWorthCards } from './assets.js';
import { renderRecent5Chart, renderMainChart, renderFlowChart } from './charts.js';
import { renderPositionTables } from './positions.js';
import { renderBudget } from './budget.js';

export async function renderFinance() {
  const el = document.getElementById('fin-content');
  if (!el) return;
  S.cc = chartColors(); // 테마 변경 시 갱신

  fetchExchangeRate().then(r => {
    S.fxRate = r;
    const fxEl = document.getElementById('fin-fx-rate');
    if (fxEl) fxEl.textContent = `USD/KRW: ${r.toLocaleString()}`;
  });

  el.innerHTML = _buildHTML();
  _bindToggle();

  // 마켓 상태 표시
  const ms = getMarketStatus();
  const msEl = document.getElementById('fin-market-status');
  if (msEl) msEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:${ms.color}"><span style="width:5px;height:5px;border-radius:50%;background:${ms.color};display:inline-block"></span>${ms.label}</span>`;

  loadMarketData().then(() => {
    renderContextLine();
    renderPositionTables();
    renderNetWorthCards();
    renderRecent5Chart();
    renderMainChart();
  });

  loadSwingData().then(() => { renderStockList(); renderPortfolioSummary(); });

  renderBenchmarks();
  renderActuals();
  renderPlans();
  renderRecent5Chart();
  renderMainChart();
  renderFlowChart();
  renderBudget();
}

export function toggleFlowChart() {
  const sec = document.getElementById('fin-flow-section');
  const btn = document.getElementById('fin-flow-toggle');
  if (!sec) return;
  const visible = sec.style.display !== 'none';
  sec.style.display = visible ? 'none' : '';
  btn.textContent = visible ? '📈 현금흐름 추이 보기' : '📈 현금흐름 추이 숨기기';
  if (!visible) renderFlowChart();
}

// ── 차트 Y축 블러 토글 ──
window.__toggleFinChartBlur = function() {
  S.finChartYAxisBlurred = !S.finChartYAxisBlurred;
  document.querySelectorAll('.fin-chart-blurable').forEach(el => {
    el.style.cursor = S.finChartYAxisBlurred ? 'pointer' : 'default';
  });
  renderRecent5Chart();
  renderMainChart();
};

// ── HTML 골격 ──
function _buildHTML() {
  return `
  <!-- Section 1: 벤치마크 + 현실 + 계획실적 통합 -->
  <div class="fin-section" id="fin-sec-benchmark">
    <div class="fin-section-hdr" data-sec="benchmark">
      <h3>📊 자산 추이 그래프</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="fin-add-btn" onclick="openFinBenchmarkModal()">+ 벤치마크</button>
        <button class="fin-add-btn" onclick="openFinActualModal()">+ 연간실적</button>
        <button class="fin-add-btn" onclick="openFinPlanModal()">+ 계획실적</button>
      </div>
    </div>
    <div class="fin-section-body${S.collapsed.benchmark?' collapsed':''}">
      <div class="fin-charts-grid">
        <div class="fin-chart-wrap fin-chart-blurable" style="height:240px;position:relative;cursor:pointer" onclick="window.__toggleFinChartBlur()"><canvas id="fin-recent5-chart"></canvas></div>
        <div class="fin-chart-wrap fin-chart-blurable" style="height:240px;position:relative;cursor:pointer" onclick="window.__toggleFinChartBlur()"><canvas id="fin-main-chart"></canvas></div>
      </div>
      <div id="fin-bench-list"></div>
      <div id="fin-plan-list"></div>
      <div id="fin-actual-list"></div>

      <!-- Inflow/Outflow 그래프 (토글, 디폴트 숨김) -->
      <div style="margin-top:12px">
        <button class="fin-toggle-btn" id="fin-flow-toggle" onclick="toggleFlowChart()">📈 현금흐름 추이 보기</button>
        <div id="fin-flow-section" style="display:none">
          <div class="fin-chart-wrap" style="max-height:280px;margin-top:8px"><canvas id="fin-flow-chart"></canvas></div>
          <div id="fin-flow-table"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Section 2: 투자상황 (토스 스타일) -->
  <div class="fin-section" id="fin-sec-invest">
    <div class="fin-section-hdr" data-sec="invest">
      <h3>📈 투자상황</h3>
      <div style="display:flex;align-items:center;gap:6px">
        <span id="fin-market-status"></span>
        <button class="fin-add-btn" onclick="refreshFinMarketData()" style="border-color:var(--muted);color:var(--muted)">↻</button>
      </div>
    </div>
    <div class="fin-section-body${S.collapsed.invest?' collapsed':''}">
      <div id="fin-context-line" class="fin-context-line"></div>
      <div id="fin-portfolio-summary"></div>
      <div id="fin-stock-list"></div>
    </div>
  </div>

  <!-- Section 4: 월간 가계부 -->
  <div class="fin-section" id="fin-sec-budget">
    <div class="fin-section-hdr" data-sec="budget">
      <h3>📒 월간 가계부</h3>
      <div style="display:flex;gap:6px">
        <button class="fin-add-btn" onclick="openBudgetItemModal()">+ 항목</button>
        <button class="fin-add-btn" onclick="openBudgetGroupModal()">+ 그룹</button>
      </div>
    </div>
    <div class="fin-section-body${S.collapsed.budget?' collapsed':''}">
      <div id="fin-budget-controls" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <select id="fin-budget-year" onchange="onBudgetYearChange()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11px"></select>
        <div id="fin-budget-qtabs" style="display:flex;gap:2px"></div>
      </div>
      <div id="fin-budget-table"></div>
    </div>
  </div>
  `;
}

function _bindToggle() {
  document.querySelectorAll('.fin-section-hdr[data-sec]').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.fin-add-btn')) return;
      const sec = hdr.dataset.sec;
      S.collapsed[sec] = !S.collapsed[sec];
      hdr.nextElementSibling.classList.toggle('collapsed', S.collapsed[sec]);
    });
  });
}
