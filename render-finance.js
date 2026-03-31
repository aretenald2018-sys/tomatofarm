// ================================================================
// render-finance.js — 재무 탭 렌더링
// 금액 단위: 만원 (입력/저장/표시)
// ================================================================

import { CONFIG } from './config.js';
import {
  getFinBenchmarks, saveFinBenchmark, deleteFinBenchmark,
  getFinActuals, saveFinActual, deleteFinActual,
  getFinLoans, saveFinLoan, deleteFinLoan,
  getFinPositions, saveFinPosition, deleteFinPosition,
  getFinPlans, saveFinPlan, deleteFinPlan,
  fetchExchangeRate, fetchFearGreed,
} from './data.js';
// Alpha Vantage 직접 호출
const _AV_BASE = 'https://www.alphavantage.co/query';
async function fetchQuote(sym) {
  if (!CONFIG.ALPHAVANTAGE_KEY) throw new Error('no key');
  const res = await fetch(`${_AV_BASE}?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${CONFIG.ALPHAVANTAGE_KEY}`);
  const data = await res.json();
  if (data['Information']) throw new Error('rate limit');
  const q = data['Global Quote'];
  if (!q?.['05. price']) throw new Error('invalid');
  return { price: parseFloat(q['05. price']), change: parseFloat(q['10. change percent']?.replace('%', '') || '0') };
}
import {
  compoundProjection, calcCAGR, calcNetWorth, calcDebtRatio,
  calcPositionPnL, checkRebalanceAlerts, calcEmergencyMonths,
  formatMoney, formatManwon, formatUSD, formatMoneyDetail, getAge,
} from './finance-calc.js';
import { callClaude } from './ai.js';

const _id = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

let _quotesMap = {};
let _fxRate = 1450;
let _fngData = null;
let _mainChartInstance = null;
let _flowChartInstance = null;

const _collapsed = { benchmark: false, reality: false, invest: false };

// ================================================================
// 메인 렌더
// ================================================================
export async function renderFinance() {
  const el = document.getElementById('fin-content');
  if (!el) return;

  fetchExchangeRate().then(r => {
    _fxRate = r;
    const fxEl = document.getElementById('fin-fx-rate');
    if (fxEl) fxEl.textContent = `USD/KRW: ${r.toLocaleString()}`;
  });

  el.innerHTML = _buildHTML();
  _bindToggle();

  _loadMarketData().then(() => {
    _renderMarketSection();
    _renderPositionTables();
    _renderNetWorthCards();
    _renderMainChart();
  });

  _renderBenchmarks();
  _renderActuals();
  _renderPlans();
  _renderMainChart();
  _renderFlowChart();
}

// ================================================================
// HTML 골격
// ================================================================
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
    <div class="fin-section-body${_collapsed.benchmark?' collapsed':''}">
      <div class="fin-chart-wrap" style="max-height:340px"><canvas id="fin-main-chart"></canvas></div>
      <div id="fin-bench-list"></div>
      <div id="fin-plan-list"></div>
      <div id="fin-actual-list"></div>
      <div id="fin-cagr-display"></div>

      <!-- Inflow/Outflow 그래프 (토글, 디폴트 숨김) -->
      <div style="margin-top:12px">
        <button class="fin-toggle-btn" id="fin-flow-toggle" onclick="toggleFlowChart()">📈 Inflow / Outflow 추이 보기</button>
        <div id="fin-flow-section" style="display:none">
          <div class="fin-chart-wrap" style="max-height:280px;margin-top:8px"><canvas id="fin-flow-chart"></canvas></div>
          <div id="fin-flow-table"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Section 2: 현실 요약 -->
  <div class="fin-section" id="fin-sec-reality">
    <div class="fin-section-hdr" data-sec="reality">
      <h3>💰 자산 현황</h3>
    </div>
    <div class="fin-section-body${_collapsed.reality?' collapsed':''}">
      <div id="fin-networth-cards"></div>
      <div id="fin-rebal-alerts"></div>
    </div>
  </div>

  <!-- Section 3: 투자상황 -->
  <div class="fin-section" id="fin-sec-invest">
    <div class="fin-section-hdr" data-sec="invest">
      <h3>📈 투자상황</h3>
      <button class="fin-add-btn" onclick="refreshFinMarketData()" style="border-color:var(--muted);color:var(--muted)">↻ 새로고침</button>
    </div>
    <div class="fin-section-body${_collapsed.invest?' collapsed':''}">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--muted2)">시황</div>
      <div id="fin-market-data"></div>
      <div id="fin-fng-display"></div>
      <div id="fin-stock-chips"></div>

      <div style="font-size:12px;font-weight:600;margin:12px 0 6px;color:var(--muted2)">내 상황</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;color:var(--muted)">대출/레버리지</span>
        <button class="fin-add-btn" onclick="openFinLoanModal()">+ 추가</button>
      </div>
      <div id="fin-loan-table"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px">
        <span style="font-size:11px;color:var(--muted)">레버리지 포지션</span>
        <button class="fin-add-btn" onclick="openFinPositionModal('leveraged')">+ 추가</button>
      </div>
      <div id="fin-pos-leveraged-table"></div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px">
        <span style="font-size:11px;color:var(--muted)">현금 포지션</span>
        <button class="fin-add-btn" onclick="openFinPositionModal('cash')">+ 추가</button>
      </div>
      <div id="fin-pos-cash-table"></div>

      <div id="fin-leverage-summary"></div>
      <div id="fin-total-summary"></div>

      <button class="fin-ai-btn" onclick="runFinAIAnalysis()">🤖 AI 포트폴리오 분석</button>
      <div id="fin-ai-result"></div>
    </div>
  </div>
  `;
}

function _bindToggle() {
  document.querySelectorAll('.fin-section-hdr[data-sec]').forEach(hdr => {
    hdr.addEventListener('click', e => {
      if (e.target.closest('.fin-add-btn')) return;
      const sec = hdr.dataset.sec;
      _collapsed[sec] = !_collapsed[sec];
      hdr.nextElementSibling.classList.toggle('collapsed', _collapsed[sec]);
    });
  });
}

// ================================================================
// Inflow/Outflow 토글
// ================================================================
export function toggleFlowChart() {
  const sec = document.getElementById('fin-flow-section');
  const btn = document.getElementById('fin-flow-toggle');
  if (!sec) return;
  const visible = sec.style.display !== 'none';
  sec.style.display = visible ? 'none' : '';
  btn.textContent = visible ? '📈 Inflow / Outflow 추이 보기' : '📈 Inflow / Outflow 추이 숨기기';
  if (!visible) _renderFlowChart();
}

// ================================================================
// 시장 데이터
// ================================================================
async function _loadMarketData() {
  const tickers = ['SPY', 'QQQ', ...CONFIG.TICKERS.map(t => t.sym)];
  for (const sym of tickers) {
    try { _quotesMap[sym] = await fetchQuote(sym); } catch {}
  }
  try { _fngData = await fetchFearGreed(); } catch {}
}

export async function refreshFinMarketData() {
  localStorage.removeItem('stock_data');
  localStorage.removeItem('stock_time');
  localStorage.removeItem('fng_data');
  localStorage.removeItem('fng_time');
  _quotesMap = {};
  _fngData = null;
  await _loadMarketData();
  _renderMarketSection();
  _renderPositionTables();
  _renderNetWorthCards();
}

function _renderMarketSection() {
  const indices = [{ sym: 'SPY', label: 'S&P 500 (SPY)' }, { sym: 'QQQ', label: 'NASDAQ (QQQ)' }];
  const mktEl = document.getElementById('fin-market-data');
  if (mktEl) {
    mktEl.innerHTML = `<div class="fin-market-row">${indices.map(idx => {
      const q = _quotesMap[idx.sym];
      const price = q ? q.price.toFixed(2) : '-';
      const chg = q ? q.change : 0;
      const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : '';
      return `<div class="fin-market-chip"><div class="label">${idx.label}</div><div class="value">$${price}</div><div class="change ${cls}">${chg > 0 ? '+' : ''}${chg.toFixed(2)}%</div></div>`;
    }).join('')}</div>`;
  }

  const fngEl = document.getElementById('fin-fng-display');
  if (fngEl && _fngData?.score != null) {
    const s = _fngData.score;
    const color = s <= 25 ? 'var(--diet-bad)' : s <= 45 ? '#f97316' : s <= 55 ? 'var(--accent)' : s <= 75 ? '#84cc16' : 'var(--diet-ok)';
    fngEl.innerHTML = `<div class="fin-fng"><div class="fin-fng-score" style="color:${color}">${s}</div><div style="flex:1"><div class="fin-fng-bar"><div class="fin-fng-fill" style="width:${s}%;background:${color}"></div></div><div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:2px"><span>Extreme Fear</span><span>Extreme Greed</span></div></div><div class="fin-fng-label">${_fngData.rating || ''}</div></div>`;
  } else if (fngEl) {
    fngEl.innerHTML = `<div class="fin-fng"><div style="color:var(--muted);font-size:11px">Fear & Greed: 데이터 없음</div></div>`;
  }

  const chipEl = document.getElementById('fin-stock-chips');
  if (chipEl) {
    chipEl.innerHTML = `<div class="fin-market-row">${CONFIG.TICKERS.map(t => {
      const q = _quotesMap[t.sym];
      const price = q ? q.price.toFixed(2) : '-';
      const chg = q ? q.change : 0;
      const cls = chg > 0 ? 'up' : chg < 0 ? 'down' : '';
      return `<div class="fin-market-chip" style="min-width:80px"><div class="label">${t.sym}</div><div class="value" style="font-size:12px">$${price}</div><div class="change ${cls}" style="font-size:10px">${chg > 0 ? '+' : ''}${chg.toFixed(2)}%</div></div>`;
    }).join('')}</div>`;
  }
}

// ================================================================
// 벤치마크 렌더 (새 테이블 형식)
// ================================================================
function _renderBenchmarks() {
  const benchmarks = getFinBenchmarks();
  const listEl = document.getElementById('fin-bench-list');
  if (!listEl) return;

  if (benchmarks.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:12px;text-align:center">벤치마크를 추가하세요</div>`;
    return;
  }

  listEl.innerHTML = benchmarks.map(b => {
    const proj = compoundProjection(b);
    const last = proj[proj.length - 1];
    return `
    <div class="fin-bench-card">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">${b.name || '벤치마크'}</span>
        <span class="fin-bench-meta">초기 ${formatManwon(b.initialPrincipal)} · ${b.annualRate}% · ${formatManwon(b.annualContribution)}/yr → ${formatManwon(last.closeBalance)}</span>
      </div>
      <div class="fin-bench-detail" style="display:none">
        <div style="font-size:10px;color:var(--muted);margin:6px 0">초기 ${formatManwon(b.initialPrincipal)}에 연 ${b.annualRate}% 복리, 매년 연말 ${formatManwon(b.annualContribution)} 납입 가정</div>
        <div style="overflow-x:auto">
        <table class="fin-proj-table">
          <thead><tr><th>연차</th><th>나이</th><th>기초 잔액</th><th>연간 이자 (${b.annualRate}%)</th><th>기말 납입금</th><th>기말 잔액</th></tr></thead>
          <tbody>${proj.map(r => `<tr>
            <td>${r.year}년 말</td>
            <td>${r.age}살</td>
            <td>${formatManwon(r.openBalance)}</td>
            <td>${formatManwon(r.interest)}</td>
            <td>${formatManwon(r.contribution)}</td>
            <td style="font-weight:600">${formatManwon(r.closeBalance)}</td>
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>
      <div class="fin-bench-actions">
        <button onclick="openFinBenchmarkModal('${b.id}')">수정</button>
        <button class="fin-del-btn" onclick="deleteFinBenchmarkDirect('${b.id}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

// ================================================================
// 계획실적 렌더
// ================================================================
function _renderPlans() {
  const plans = getFinPlans();
  const listEl = document.getElementById('fin-plan-list');
  if (!listEl) return;

  if (plans.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = plans.map(p => {
    const entries = (p.entries || []).sort((a, b) => a.year - b.year);
    const last = entries[entries.length - 1];
    return `
    <div class="fin-bench-card" style="border-left-color:#8b5cf6">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">🎯 ${p.name || '계획실적'}</span>
        <span class="fin-bench-meta">${entries.length}개 연도 ${last ? '→ ' + last.year + '년 ' + formatManwon(last.target) : ''}</span>
      </div>
      <div class="fin-bench-detail" style="display:none">
        <div style="overflow-x:auto">
        <table class="fin-proj-table">
          <thead><tr><th>연도</th><th>나이</th><th>목표 기말잔액</th></tr></thead>
          <tbody>${entries.map(e => `<tr>
            <td>${e.year}년</td>
            <td>${getAge(e.year)}살</td>
            <td style="font-weight:600">${formatManwon(e.target)}</td>
          </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>
      <div class="fin-bench-actions">
        <button onclick="openFinPlanModal('${p.id}')">수정</button>
        <button class="fin-del-btn" onclick="deleteFinPlanDirect('${p.id}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

// ================================================================
// 현실 섹션
// ================================================================
function _renderActuals() {
  const actuals = getFinActuals();
  const listEl = document.getElementById('fin-actual-list');
  if (!listEl) return;

  if (actuals.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:12px;text-align:center">연간 실적을 추가하세요</div>`;
  } else {
    listEl.innerHTML = `<table class="fin-table">
      <thead><tr><th>연도</th><th>나이</th><th>누적 저축/투자</th><th>순자산</th><th>비상금</th><th>Inflow</th><th>Outflow</th><th></th></tr></thead>
      <tbody>${actuals.map(a => {
        const em = calcEmergencyMonths(a.emergencyFund, a.monthlyExpense);
        return `<tr>
          <td>${a.year}</td>
          <td>${getAge(a.year)}살</td>
          <td class="num">${formatManwon(a.cumulativeSaved)}</td>
          <td class="num">${a.netWorth ? formatManwon(a.netWorth) : '-'}</td>
          <td class="num">${a.emergencyFund ? formatManwon(a.emergencyFund) + (em != null ? ` (${em}개월)` : '') : '-'}</td>
          <td class="num">${a.inflow ? formatManwon(a.inflow) : '-'}</td>
          <td class="num">${a.outflow ? formatManwon(a.outflow) : '-'}</td>
          <td class="action-cell"><button class="edit-btn" onclick="openFinActualModal('${a.id}')">✏️</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  const cagrEl = document.getElementById('fin-cagr-display');
  if (cagrEl && actuals.length >= 2) {
    const first = actuals[0], last = actuals[actuals.length - 1];
    const years = last.year - first.year;
    if (years > 0 && first.cumulativeSaved > 0) {
      const cagr = calcCAGR(first.cumulativeSaved, last.cumulativeSaved, years);
      cagrEl.innerHTML = `<div style="font-size:11px;color:var(--muted);margin:6px 0">CAGR: <span style="color:var(--diet-ok);font-weight:700;font-family:'JetBrains Mono',monospace">${(cagr * 100).toFixed(1)}%</span></div>`;
    }
  }
}

function _renderNetWorthCards() {
  const el = document.getElementById('fin-networth-cards');
  if (!el) return;

  const positions = getFinPositions();
  const loans = getFinLoans();
  const { totalAssets, totalDebt, netWorth } = calcNetWorth(positions, loans, _quotesMap);
  const debtRatio = calcDebtRatio(totalDebt, totalAssets);

  const actuals = getFinActuals();
  const latest = actuals[actuals.length - 1];
  const emMonths = latest ? calcEmergencyMonths(latest.emergencyFund, latest.monthlyExpense) : null;
  const emClass = emMonths == null ? '' : emMonths < 3 ? 'negative' : emMonths < 6 ? 'warn' : 'positive';

  el.innerHTML = `<div class="fin-networth-row">
    <div class="fin-nw-card"><div class="fin-nw-label">총 자산</div><div class="fin-nw-val">${formatUSD(totalAssets)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">총 부채</div><div class="fin-nw-val negative">${formatManwon(totalDebt)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">부채비율</div><div class="fin-nw-val ${debtRatio > 0.5 ? 'negative' : debtRatio > 0.3 ? 'warn' : 'positive'}">${(debtRatio * 100).toFixed(1)}%</div></div>
    ${emMonths != null ? `<div class="fin-nw-card"><div class="fin-nw-label">비상금</div><div class="fin-nw-val ${emClass}">${emMonths}개월</div></div>` : ''}
  </div>`;

  const alerts = checkRebalanceAlerts(positions, _quotesMap);
  const alertEl = document.getElementById('fin-rebal-alerts');
  if (alertEl) {
    alertEl.innerHTML = alerts.length > 0
      ? `<div class="fin-rebal-alert">⚠️ 리밸런싱 필요: ${alerts.map(a => `${a.name || a.ticker} (${a.pct}%)`).join(', ')} — 단일 종목 30% 초과</div>`
      : '';
  }
}

// ================================================================
// X축 레이블 생성 (2030까지 매년 + 2035 + 2045, 생략구간 표시)
// ================================================================
function _buildXAxisLabels(allYears) {
  if (allYears.length === 0) return [];
  const minYear = Math.min(...allYears);
  const maxYear = Math.max(...allYears);
  const labels = [];

  // 데이터 시작연도부터 2030까지 매년
  const cutoff = 2030;
  for (let y = minYear; y <= Math.min(maxYear, cutoff); y++) {
    labels.push(y);
  }

  // 2030 이후에는 2035, 2045만 포함 (데이터에 있을 경우)
  if (maxYear > cutoff) {
    if (allYears.includes(2035) || maxYear >= 2035) labels.push(2035);
    if (allYears.includes(2045) || maxYear >= 2045) labels.push(2045);
  }

  return labels;
}

// 연도를 X축 인덱스로 매핑 (생략구간 고려)
function _yearToXIndex(year, xLabels) {
  const idx = xLabels.indexOf(year);
  if (idx >= 0) return idx;
  // 정확한 레이블에 없으면 비례 보간
  // 2030과 2035 사이, 2035와 2045 사이 등
  for (let i = 0; i < xLabels.length - 1; i++) {
    if (year > xLabels[i] && year < xLabels[i + 1]) {
      const ratio = (year - xLabels[i]) / (xLabels[i + 1] - xLabels[i]);
      return i + ratio;
    }
  }
  // 범위 밖
  if (year < xLabels[0]) return -1;
  return xLabels.length;
}

// ================================================================
// 통합 차트 (벤치마크 점선 + 현실 실선 + 계획실적 파선)
// X축: 2030까지 매년, 이후 2035·2045만 (생략구간 표시)
// ================================================================
function _renderMainChart() {
  const canvas = document.getElementById('fin-main-chart');
  if (!canvas || !window.Chart) return;
  if (_mainChartInstance) _mainChartInstance.destroy();

  const benchmarks = getFinBenchmarks();
  const actuals = getFinActuals();
  const plans = getFinPlans();
  if (benchmarks.length === 0 && actuals.length === 0 && plans.length === 0) return;

  // 모든 연도 수집
  const allYears = new Set();
  benchmarks.forEach(b => {
    const proj = compoundProjection(b);
    proj.forEach(r => allYears.add(r.year));
  });
  actuals.forEach(a => allYears.add(a.year));
  plans.forEach(p => (p.entries || []).forEach(e => allYears.add(e.year)));

  const xLabels = _buildXAxisLabels([...allYears]);
  if (xLabels.length === 0) return;

  const benchColors = ['#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4'];
  const planColors = ['#8b5cf6', '#d946ef', '#14b8a6', '#f97316', '#64748b'];
  const datasets = [];

  // 벤치마크 (점선)
  benchmarks.forEach((b, i) => {
    const proj = compoundProjection(b);
    const data = [];
    for (const label of xLabels) {
      const row = proj.find(r => r.year === label);
      if (row) data.push({ x: xLabels.indexOf(label), y: row.closeBalance });
    }
    // 2035, 2045 등 비표시 연도에도 데이터가 있으면 보간 위치에 추가
    proj.forEach(r => {
      if (!xLabels.includes(r.year)) {
        const xi = _yearToXIndex(r.year, xLabels);
        if (xi >= 0 && xi <= xLabels.length) {
          data.push({ x: xi, y: r.closeBalance });
        }
      }
    });
    data.sort((a, b) => a.x - b.x);

    datasets.push({
      label: b.name || `벤치마크 ${i + 1}`,
      data,
      borderColor: benchColors[i % benchColors.length],
      borderDash: [5, 3],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    });
  });

  // 계획실적 (긴 대시)
  plans.forEach((p, i) => {
    const entries = (p.entries || []).sort((a, b) => a.year - b.year);
    const data = [];
    entries.forEach(e => {
      const xi = xLabels.includes(e.year) ? xLabels.indexOf(e.year) : _yearToXIndex(e.year, xLabels);
      if (xi >= 0) data.push({ x: xi, y: e.target });
    });
    data.sort((a, b) => a.x - b.x);

    datasets.push({
      label: '🎯 ' + (p.name || `계획 ${i + 1}`),
      data,
      borderColor: planColors[i % planColors.length],
      borderDash: [10, 4],
      borderWidth: 2.5,
      pointRadius: 3,
      pointBackgroundColor: planColors[i % planColors.length],
      fill: false,
      tension: 0.3,
    });
  });

  // 현실 (실선)
  if (actuals.length > 0) {
    const data = [];
    actuals.forEach(a => {
      const xi = xLabels.includes(a.year) ? xLabels.indexOf(a.year) : _yearToXIndex(a.year, xLabels);
      if (xi >= 0) data.push({ x: xi, y: a.cumulativeSaved });
    });
    data.sort((a, b) => a.x - b.x);

    datasets.push({
      label: '현실 (누적 저축/투자)',
      data,
      borderColor: '#10b981',
      borderWidth: 3,
      pointRadius: 4,
      pointBackgroundColor: '#10b981',
      fill: false,
      tension: 0.3,
    });
  }

  // 생략 구간 annotation용 (2030과 2035 사이에 물결 표시)
  const gapAnnotations = [];
  for (let i = 0; i < xLabels.length - 1; i++) {
    if (xLabels[i + 1] - xLabels[i] > 1) {
      gapAnnotations.push({
        gapStart: i,
        gapEnd: i + 1,
        label: `${xLabels[i]}~${xLabels[i + 1]}`,
      });
    }
  }

  _mainChartInstance = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          min: 0, max: xLabels.length - 1,
          ticks: {
            color: '#5c6478', font: { size: 10 },
            stepSize: 1,
            callback: function(value) {
              const idx = Math.round(value);
              if (idx >= 0 && idx < xLabels.length) return xLabels[idx];
              return '';
            },
          },
          grid: { color: '#2c3040' },
          afterDraw: function(chart) {
            // 생략 구간에 물결선 그리기 (plugin에서 처리)
          },
        },
        y: {
          ticks: { color: '#5c6478', font: { size: 10 }, callback: v => formatManwon(v) },
          grid: { color: '#2c3040' },
        },
      },
      plugins: {
        legend: { labels: { color: '#e2e4ea', font: { size: 10 } } },
        tooltip: {
          callbacks: {
            title: ctx => {
              const idx = Math.round(ctx[0].parsed.x);
              if (idx >= 0 && idx < xLabels.length) return `${xLabels[idx]}년 (${getAge(xLabels[idx])}살)`;
              return '';
            },
            label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}`,
          },
        },
      },
    },
    plugins: [{
      id: 'gapIndicator',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        gapAnnotations.forEach(gap => {
          const x1 = xScale.getPixelForValue(gap.gapStart + 0.3);
          const x2 = xScale.getPixelForValue(gap.gapEnd - 0.3);
          const yMid = (yScale.top + yScale.bottom) / 2;
          // 물결선 그리기
          ctx.save();
          ctx.strokeStyle = '#5c6478';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          const xMid = (x1 + x2) / 2;
          ctx.moveTo(x1, yScale.top);
          ctx.lineTo(x1, yScale.bottom);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x2, yScale.top);
          ctx.lineTo(x2, yScale.bottom);
          ctx.stroke();
          // 물결 기호
          ctx.setLineDash([]);
          ctx.fillStyle = '#1e2030';
          ctx.fillRect(xMid - 12, yMid - 10, 24, 20);
          ctx.fillStyle = '#5c6478';
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

// ================================================================
// Inflow / Outflow 추이 차트
// ================================================================
function _renderFlowChart() {
  const canvas = document.getElementById('fin-flow-chart');
  if (!canvas || !window.Chart) return;
  if (_flowChartInstance) _flowChartInstance.destroy();

  const actuals = getFinActuals().filter(a => a.inflow || a.outflow);
  if (actuals.length === 0) {
    const tableEl = document.getElementById('fin-flow-table');
    if (tableEl) tableEl.innerHTML = `<div style="color:var(--muted);font-size:11px;text-align:center;padding:8px">Inflow/Outflow 데이터가 없습니다. 연간실적에서 입력하세요.</div>`;
    return;
  }

  const labels = actuals.map(a => `${a.year} (${getAge(a.year)}살)`);
  const inflowData = actuals.map(a => a.inflow || 0);
  const outflowData = actuals.map(a => a.outflow || 0);
  const netData = actuals.map(a => (a.inflow || 0) - (a.outflow || 0));

  _flowChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Inflow (제세순수익)',
          data: inflowData,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: '#10b981',
          borderWidth: 1,
          barPercentage: 0.7,
        },
        {
          label: 'Outflow (총지출)',
          data: outflowData,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: '#ef4444',
          borderWidth: 1,
          barPercentage: 0.7,
        },
        {
          label: 'Net (순저축)',
          data: netData,
          type: 'line',
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#f59e0b',
          fill: false,
          tension: 0.3,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#5c6478', font: { size: 10 } }, grid: { color: '#2c3040' } },
        y: { ticks: { color: '#5c6478', font: { size: 10 }, callback: v => formatManwon(v) }, grid: { color: '#2c3040' } },
      },
      plugins: {
        legend: { labels: { color: '#e2e4ea', font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}` } },
      },
    },
  });

  // Inflow/Outflow 테이블
  const tableEl = document.getElementById('fin-flow-table');
  if (tableEl) {
    tableEl.innerHTML = `<table class="fin-table" style="margin-top:8px">
      <thead><tr><th>연도</th><th>나이</th><th>Inflow</th><th>Outflow</th><th>Net</th></tr></thead>
      <tbody>${actuals.map(a => {
        const net = (a.inflow || 0) - (a.outflow || 0);
        const cls = net >= 0 ? 'pos' : 'neg';
        return `<tr>
          <td>${a.year}</td>
          <td>${getAge(a.year)}살</td>
          <td class="num">${a.inflow ? formatManwon(a.inflow) : '-'}</td>
          <td class="num">${a.outflow ? formatManwon(a.outflow) : '-'}</td>
          <td class="num ${cls}">${formatManwon(net)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }
}

// ================================================================
// 포지션/대출 테이블
// ================================================================
function _renderPositionTables() {
  _renderLoanTable();
  _renderPosTable('leveraged');
  _renderPosTable('cash');
  _renderLeverageSummary();
  _renderTotalSummary();
}

function _renderLoanTable() {
  const el = document.getElementById('fin-loan-table');
  if (!el) return;
  const loans = getFinLoans();
  if (loans.length === 0) { el.innerHTML = `<div style="color:var(--muted);font-size:11px">대출 없음</div>`; return; }
  el.innerHTML = `<table class="fin-table">
    <thead><tr><th>대출명</th><th>잔액</th><th>금리</th><th>월상환</th><th>만기일</th><th></th></tr></thead>
    <tbody>${loans.map(l => `<tr>
      <td>${l.name}</td>
      <td class="num">${formatManwon(l.amount)}</td>
      <td class="num">${l.interestRate}%</td>
      <td class="num">${formatManwon(l.monthlyPayment)}</td>
      <td>${l.endDate || '-'}</td>
      <td class="action-cell"><button class="edit-btn" onclick="openFinLoanModal('${l.id}')">✏️</button></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function _renderPosTable(type) {
  const el = document.getElementById(`fin-pos-${type}-table`);
  if (!el) return;
  const positions = getFinPositions().filter(p => p.type === type);
  if (positions.length === 0) { el.innerHTML = `<div style="color:var(--muted);font-size:11px">포지션 없음</div>`; return; }

  el.innerHTML = `<table class="fin-table">
    <thead><tr><th>종목</th><th>현재가</th><th>수량</th><th>평가금액</th><th>수익률</th><th></th></tr></thead>
    <tbody>${positions.map(p => {
      const curPrice = p.autoPrice ? (_quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
      const { value, pnl, pnlPct } = calcPositionPnL(p, curPrice);
      const cls = pnl >= 0 ? 'pos' : 'neg';
      const sign = pnl >= 0 ? '+' : '';
      return `<tr>
        <td>${p.name || p.ticker}<br><span style="font-size:9px;color:var(--muted)">${p.ticker} · ${p.category}</span></td>
        <td class="num">${formatMoneyDetail(curPrice, p.currency)}</td>
        <td class="num">${p.shares}</td>
        <td class="num">${formatMoney(value, p.currency)}</td>
        <td class="num ${cls}">${sign}${pnlPct.toFixed(1)}%</td>
        <td class="action-cell"><button class="edit-btn" onclick="openFinPositionModal(null,'${p.id}')">✏️</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function _renderLeverageSummary() {
  const el = document.getElementById('fin-leverage-summary');
  if (!el) return;
  const positions = getFinPositions();
  let levTotal = 0, cashTotal = 0;
  positions.forEach(p => {
    const price = p.autoPrice ? (_quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    const val = price * (p.shares || 0);
    if (p.type === 'leveraged') levTotal += val; else cashTotal += val;
  });
  const total = levTotal + cashTotal;
  if (total <= 0) { el.innerHTML = ''; return; }
  const levPct = (levTotal / total * 100).toFixed(1);
  const cashPct = (cashTotal / total * 100).toFixed(1);
  el.innerHTML = `<div class="fin-leverage-summary" style="flex-direction:column">
    <div class="fin-leverage-bar"><div class="lev" style="width:${levPct}%"></div><div class="cash" style="width:${cashPct}%"></div></div>
    <div class="fin-leverage-labels"><span>레버리지 ${levPct}% (${formatUSD(levTotal)})</span><span>현금 ${cashPct}% (${formatUSD(cashTotal)})</span></div>
  </div>`;
}

function _renderTotalSummary() {
  const el = document.getElementById('fin-total-summary');
  if (!el) return;
  const positions = getFinPositions();
  let totalCost = 0, totalValue = 0;
  positions.forEach(p => {
    const price = p.autoPrice ? (_quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    totalCost += p.avgCost * (p.shares || 0);
    totalValue += price * (p.shares || 0);
  });
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost * 100) : 0;
  const cls = pnl >= 0 ? 'positive' : 'negative';
  const sign = pnl >= 0 ? '+' : '';
  el.innerHTML = `<div class="fin-networth-row" style="margin-top:10px">
    <div class="fin-nw-card"><div class="fin-nw-label">총 투자원금</div><div class="fin-nw-val">${formatUSD(totalCost)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">현재 가치</div><div class="fin-nw-val">${formatUSD(totalValue)}</div></div>
    <div class="fin-nw-card"><div class="fin-nw-label">전체 손익</div><div class="fin-nw-val ${cls}">${sign}${formatUSD(pnl)} (${sign}${pnlPct.toFixed(1)}%)</div></div>
  </div>`;
}

// ================================================================
// AI 분석
// ================================================================
export async function runFinAIAnalysis() {
  const el = document.getElementById('fin-ai-result');
  if (!el) return;
  el.innerHTML = `<div class="fin-ai-box"><div class="ai-content" style="color:var(--muted)">분석 중...</div></div>`;

  const positions = getFinPositions();
  const loans = getFinLoans();
  const { totalAssets, totalDebt, netWorth } = calcNetWorth(positions, loans, _quotesMap);

  const positionSummary = positions.map(p => {
    const price = p.autoPrice ? (_quotesMap[p.ticker]?.price || p.manualPrice || p.avgCost) : (p.manualPrice || p.avgCost);
    const { pnlPct } = calcPositionPnL(p, price);
    return `${p.name||p.ticker}(${p.type}): ${p.shares}주 @${price}, 수익률 ${pnlPct.toFixed(1)}%`;
  }).join('\n');

  const loanSummary = loans.map(l => `${l.name}: ${l.amount}만원 @${l.interestRate}%`).join('\n');

  const marketSummary = [
    _quotesMap.SPY ? `SPY: $${_quotesMap.SPY.price.toFixed(2)} (${_quotesMap.SPY.change > 0?'+':''}${_quotesMap.SPY.change.toFixed(2)}%)` : '',
    _quotesMap.QQQ ? `QQQ: $${_quotesMap.QQQ.price.toFixed(2)} (${_quotesMap.QQQ.change > 0?'+':''}${_quotesMap.QQQ.change.toFixed(2)}%)` : '',
    _fngData?.score != null ? `Fear & Greed: ${_fngData.score} (${_fngData.rating})` : '',
  ].filter(Boolean).join('\n');

  const prompt = `당신은 개인 자산관리 전문가입니다. 다음은 사용자의 포트폴리오 현황입니다.

[포지션]
${positionSummary || '없음'}

[대출/레버리지]
${loanSummary || '없음'}

[요약]
총자산: $${totalAssets.toFixed(0)}, 총부채: ${totalDebt.toLocaleString()}만원, 환율: ${_fxRate} KRW/USD

[시장 상황]
${marketSummary || '데이터 없음'}

다음 관점에서 간결하게 분석해주세요 (한국어, 총 300자 이내):
1. 현재 포트폴리오의 리스크 수준
2. 레버리지 대비 수익률 효율성
3. 리밸런싱 필요 여부와 방향
4. 현재 시장 상황에서 고려할 점`;

  try {
    const reply = await callClaude(prompt);
    el.innerHTML = `<div class="fin-ai-box"><div class="ai-title">🤖 AI 포트폴리오 분석</div><div class="ai-content">${reply}</div></div>`;
  } catch (e) {
    el.innerHTML = `<div class="fin-ai-box"><div class="ai-content" style="color:var(--diet-bad)">분석 실패: ${e.message}</div></div>`;
  }
}

// ================================================================
// 모달 핸들러 (모든 금액 만원 단위)
// ================================================================

// ── 벤치마크 ──
export function openFinBenchmarkModal(id) {
  const modal = document.getElementById('fin-benchmark-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-bench-modal-title');
  const delBtn = document.getElementById('fin-bench-del-btn');

  if (id) {
    const b = getFinBenchmarks().find(x => x.id === id);
    if (!b) return;
    titleEl.textContent = '벤치마크 수정';
    delBtn.style.display = '';
    document.getElementById('fin-bench-id').value = b.id;
    document.getElementById('fin-bench-name').value = b.name || '';
    document.getElementById('fin-bench-startYear').value = b.startYear || 2026;
    document.getElementById('fin-bench-period').value = b.periodYears || 20;
    document.getElementById('fin-bench-rate').value = b.annualRate || 7;
    document.getElementById('fin-bench-inflation').value = b.inflationRate || 0;
    document.getElementById('fin-bench-principal').value = b.initialPrincipal || 0;
    document.getElementById('fin-bench-contribution').value = b.annualContribution || 0;
  } else {
    titleEl.textContent = '벤치마크 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-bench-id').value = '';
    document.getElementById('fin-bench-name').value = '';
    document.getElementById('fin-bench-startYear').value = new Date().getFullYear();
    document.getElementById('fin-bench-period').value = 20;
    document.getElementById('fin-bench-rate').value = 7;
    document.getElementById('fin-bench-inflation').value = 2.5;
    document.getElementById('fin-bench-principal').value = 5000;
    document.getElementById('fin-bench-contribution').value = 2000;
  }
  modal.classList.add('open');
}

export function closeFinBenchmarkModal(e) {
  if (e && e.target !== document.getElementById('fin-benchmark-modal')) return;
  document.getElementById('fin-benchmark-modal')?.classList.remove('open');
}

export async function saveFinBenchmarkFromModal() {
  const id = document.getElementById('fin-bench-id').value || _id();
  await saveFinBenchmark({
    id,
    name: document.getElementById('fin-bench-name').value,
    startYear: parseInt(document.getElementById('fin-bench-startYear').value),
    periodYears: parseInt(document.getElementById('fin-bench-period').value),
    annualRate: parseFloat(document.getElementById('fin-bench-rate').value),
    inflationRate: parseFloat(document.getElementById('fin-bench-inflation').value) || 0,
    initialPrincipal: parseFloat(document.getElementById('fin-bench-principal').value) || 0,
    annualContribution: parseFloat(document.getElementById('fin-bench-contribution').value) || 0,
    createdAt: new Date().toISOString(),
  });
  closeFinBenchmarkModal();
  renderFinance();
}

export async function deleteFinBenchmarkDirect(id) {
  if (!confirm('이 벤치마크를 삭제할까요?')) return;
  await deleteFinBenchmark(id);
  renderFinance();
}

export async function deleteFinBenchmarkFromModal() {
  const id = document.getElementById('fin-bench-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinBenchmark(id);
  closeFinBenchmarkModal();
  renderFinance();
}

// ── 현실 (연간 실적) ──
export function openFinActualModal(id) {
  const modal = document.getElementById('fin-actual-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-actual-modal-title');
  const delBtn = document.getElementById('fin-actual-del-btn');

  if (id) {
    const a = getFinActuals().find(x => x.id === id);
    if (!a) return;
    titleEl.textContent = '연간 실적 수정';
    delBtn.style.display = '';
    document.getElementById('fin-actual-id').value = a.id;
    document.getElementById('fin-actual-year').value = a.year;
    document.getElementById('fin-actual-saved').value = a.cumulativeSaved || 0;
    document.getElementById('fin-actual-networth').value = a.netWorth || 0;
    document.getElementById('fin-actual-emergency').value = a.emergencyFund || 0;
    document.getElementById('fin-actual-expense').value = a.monthlyExpense || 0;
    document.getElementById('fin-actual-inflow').value = a.inflow || 0;
    document.getElementById('fin-actual-outflow').value = a.outflow || 0;
  } else {
    titleEl.textContent = '연간 실적 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-actual-id').value = '';
    document.getElementById('fin-actual-year').value = new Date().getFullYear();
    document.getElementById('fin-actual-saved').value = 0;
    document.getElementById('fin-actual-networth').value = 0;
    document.getElementById('fin-actual-emergency').value = 0;
    document.getElementById('fin-actual-expense').value = 0;
    document.getElementById('fin-actual-inflow').value = 0;
    document.getElementById('fin-actual-outflow').value = 0;
  }
  modal.classList.add('open');
}

export function closeFinActualModal(e) {
  if (e && e.target !== document.getElementById('fin-actual-modal')) return;
  document.getElementById('fin-actual-modal')?.classList.remove('open');
}

export async function saveFinActualFromModal() {
  const id = document.getElementById('fin-actual-id').value || _id();
  await saveFinActual({
    id,
    year: parseInt(document.getElementById('fin-actual-year').value),
    cumulativeSaved: parseFloat(document.getElementById('fin-actual-saved').value) || 0,
    netWorth: parseFloat(document.getElementById('fin-actual-networth').value) || 0,
    emergencyFund: parseFloat(document.getElementById('fin-actual-emergency').value) || 0,
    monthlyExpense: parseFloat(document.getElementById('fin-actual-expense').value) || 0,
    inflow: parseFloat(document.getElementById('fin-actual-inflow').value) || 0,
    outflow: parseFloat(document.getElementById('fin-actual-outflow').value) || 0,
    createdAt: new Date().toISOString(),
  });
  closeFinActualModal();
  renderFinance();
}

export async function deleteFinActualFromModal() {
  const id = document.getElementById('fin-actual-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinActual(id);
  closeFinActualModal();
  renderFinance();
}

// ── 계획실적 ──
export function openFinPlanModal(id) {
  const modal = document.getElementById('fin-plan-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-plan-modal-title');
  const delBtn = document.getElementById('fin-plan-del-btn');
  const entriesEl = document.getElementById('fin-plan-entries');

  if (id) {
    const p = getFinPlans().find(x => x.id === id);
    if (!p) return;
    titleEl.textContent = '계획실적 수정';
    delBtn.style.display = '';
    document.getElementById('fin-plan-id').value = p.id;
    document.getElementById('fin-plan-name').value = p.name || '';
    // 기존 entries 렌더
    entriesEl.innerHTML = '';
    (p.entries || []).sort((a, b) => a.year - b.year).forEach(e => {
      _addPlanEntryRow(entriesEl, e.year, e.target);
    });
  } else {
    titleEl.textContent = '계획실적 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-plan-id').value = '';
    document.getElementById('fin-plan-name').value = '';
    entriesEl.innerHTML = '';
    // 기본 1개 행
    _addPlanEntryRow(entriesEl, new Date().getFullYear(), 0);
  }
  modal.classList.add('open');
}

function _addPlanEntryRow(container, year, target) {
  const row = document.createElement('div');
  row.className = 'fin-modal-row fin-plan-entry';
  row.style.alignItems = 'center';
  row.innerHTML = `
    <div class="fin-modal-field" style="flex:1">
      <label>연도</label>
      <input type="number" class="fin-plan-year" value="${year}">
    </div>
    <div class="fin-modal-field" style="flex:1">
      <label>목표 기말잔액 (만원)</label>
      <input type="number" class="fin-plan-target" value="${target}" placeholder="5000 = 5천만원">
    </div>
    <button class="fin-del-btn" onclick="this.parentElement.remove()" style="margin-top:18px;padding:4px 8px;font-size:12px">✕</button>
  `;
  container.appendChild(row);
}

export function addFinPlanEntry() {
  const container = document.getElementById('fin-plan-entries');
  if (!container) return;
  const rows = container.querySelectorAll('.fin-plan-entry');
  const lastYear = rows.length > 0
    ? parseInt(rows[rows.length - 1].querySelector('.fin-plan-year').value) + 1
    : new Date().getFullYear();
  _addPlanEntryRow(container, lastYear, 0);
}

export function closeFinPlanModal(e) {
  if (e && e.target !== document.getElementById('fin-plan-modal')) return;
  document.getElementById('fin-plan-modal')?.classList.remove('open');
}

export async function saveFinPlanFromModal() {
  const id = document.getElementById('fin-plan-id').value || _id();
  const name = document.getElementById('fin-plan-name').value;
  const rows = document.querySelectorAll('#fin-plan-entries .fin-plan-entry');
  const entries = [];
  rows.forEach(row => {
    const year = parseInt(row.querySelector('.fin-plan-year').value);
    const target = parseFloat(row.querySelector('.fin-plan-target').value) || 0;
    if (year && target) entries.push({ year, target });
  });

  await saveFinPlan({
    id,
    name,
    entries,
    createdAt: new Date().toISOString(),
  });
  closeFinPlanModal();
  renderFinance();
}

export async function deleteFinPlanDirect(id) {
  if (!confirm('이 계획실적을 삭제할까요?')) return;
  await deleteFinPlan(id);
  renderFinance();
}

export async function deleteFinPlanFromModal() {
  const id = document.getElementById('fin-plan-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinPlan(id);
  closeFinPlanModal();
  renderFinance();
}

// ── 대출 ──
export function openFinLoanModal(id) {
  const modal = document.getElementById('fin-loan-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-loan-modal-title');
  const delBtn = document.getElementById('fin-loan-del-btn');

  if (id) {
    const l = getFinLoans().find(x => x.id === id);
    if (!l) return;
    titleEl.textContent = '대출 수정';
    delBtn.style.display = '';
    document.getElementById('fin-loan-id').value = l.id;
    document.getElementById('fin-loan-name').value = l.name || '';
    document.getElementById('fin-loan-amount').value = l.amount || 0;
    document.getElementById('fin-loan-rate').value = l.interestRate || 0;
    document.getElementById('fin-loan-monthly').value = l.monthlyPayment || 0;
    document.getElementById('fin-loan-type').value = l.type || 'margin';
    document.getElementById('fin-loan-start').value = l.startDate || '';
    document.getElementById('fin-loan-end').value = l.endDate || '';
  } else {
    titleEl.textContent = '대출 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-loan-id').value = '';
    document.getElementById('fin-loan-name').value = '';
    document.getElementById('fin-loan-amount').value = 0;
    document.getElementById('fin-loan-rate').value = 5;
    document.getElementById('fin-loan-monthly').value = 0;
    document.getElementById('fin-loan-type').value = 'margin';
    document.getElementById('fin-loan-start').value = '';
    document.getElementById('fin-loan-end').value = '';
  }
  modal.classList.add('open');
}

export function closeFinLoanModal(e) {
  if (e && e.target !== document.getElementById('fin-loan-modal')) return;
  document.getElementById('fin-loan-modal')?.classList.remove('open');
}

export async function saveFinLoanFromModal() {
  const id = document.getElementById('fin-loan-id').value || _id();
  await saveFinLoan({
    id,
    name: document.getElementById('fin-loan-name').value,
    amount: parseFloat(document.getElementById('fin-loan-amount').value) || 0,
    interestRate: parseFloat(document.getElementById('fin-loan-rate').value) || 0,
    monthlyPayment: parseFloat(document.getElementById('fin-loan-monthly').value) || 0,
    type: document.getElementById('fin-loan-type').value,
    startDate: document.getElementById('fin-loan-start').value,
    endDate: document.getElementById('fin-loan-end').value,
    createdAt: new Date().toISOString(),
  });
  closeFinLoanModal();
  renderFinance();
}

export async function deleteFinLoanFromModal() {
  const id = document.getElementById('fin-loan-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinLoan(id);
  closeFinLoanModal();
  renderFinance();
}

// ── 포지션 ──
export function openFinPositionModal(defaultType, id) {
  const modal = document.getElementById('fin-position-modal');
  if (!modal) return;
  const titleEl = document.getElementById('fin-pos-modal-title');
  const delBtn = document.getElementById('fin-pos-del-btn');

  if (id) {
    const p = getFinPositions().find(x => x.id === id);
    if (!p) return;
    titleEl.textContent = '포지션 수정';
    delBtn.style.display = '';
    document.getElementById('fin-pos-id').value = p.id;
    document.getElementById('fin-pos-ticker').value = p.ticker || '';
    document.getElementById('fin-pos-name').value = p.name || '';
    document.getElementById('fin-pos-type').value = p.type || 'cash';
    document.getElementById('fin-pos-category').value = p.category || 'stock';
    document.getElementById('fin-pos-shares').value = p.shares || 0;
    document.getElementById('fin-pos-avgcost').value = p.avgCost || 0;
    document.getElementById('fin-pos-date').value = p.purchaseDate || '';
    document.getElementById('fin-pos-currency').value = p.currency || 'USD';
    document.getElementById('fin-pos-autoprice').value = p.autoPrice ? 'true' : 'false';
    document.getElementById('fin-pos-manualprice').value = p.manualPrice || 0;
  } else {
    titleEl.textContent = '포지션 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-pos-id').value = '';
    document.getElementById('fin-pos-ticker').value = '';
    document.getElementById('fin-pos-name').value = '';
    document.getElementById('fin-pos-type').value = defaultType || 'cash';
    document.getElementById('fin-pos-category').value = 'stock';
    document.getElementById('fin-pos-shares').value = 0;
    document.getElementById('fin-pos-avgcost').value = 0;
    document.getElementById('fin-pos-date').value = '';
    document.getElementById('fin-pos-currency').value = 'USD';
    document.getElementById('fin-pos-autoprice').value = 'true';
    document.getElementById('fin-pos-manualprice').value = 0;
  }
  modal.classList.add('open');
}

export function closeFinPositionModal(e) {
  if (e && e.target !== document.getElementById('fin-position-modal')) return;
  document.getElementById('fin-position-modal')?.classList.remove('open');
}

export async function saveFinPositionFromModal() {
  const id = document.getElementById('fin-pos-id').value || _id();
  await saveFinPosition({
    id,
    ticker: document.getElementById('fin-pos-ticker').value.toUpperCase(),
    name: document.getElementById('fin-pos-name').value,
    type: document.getElementById('fin-pos-type').value,
    category: document.getElementById('fin-pos-category').value,
    shares: parseFloat(document.getElementById('fin-pos-shares').value) || 0,
    avgCost: parseFloat(document.getElementById('fin-pos-avgcost').value) || 0,
    purchaseDate: document.getElementById('fin-pos-date').value,
    currency: document.getElementById('fin-pos-currency').value,
    autoPrice: document.getElementById('fin-pos-autoprice').value === 'true',
    manualPrice: parseFloat(document.getElementById('fin-pos-manualprice').value) || 0,
    createdAt: new Date().toISOString(),
  });
  closeFinPositionModal();
  renderFinance();
}

export async function deleteFinPositionFromModal() {
  const id = document.getElementById('fin-pos-id').value;
  if (!id || !confirm('삭제할까요?')) return;
  await deleteFinPosition(id);
  closeFinPositionModal();
  renderFinance();
}
