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

const _collapsed = { benchmark: false, reality: false, invest: false };

// ================================================================
// 메인 렌더
// ================================================================
export async function renderFinance() {
  const el = document.getElementById('fin-content');
  if (!el) return;

  fetchExchangeRate().then(r => {
    _fxRate = r;
    document.getElementById('fin-fx-rate').textContent = `USD/KRW: ${r.toLocaleString()}`;
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
  _renderMainChart();
}

// ================================================================
// HTML 골격
// ================================================================
function _buildHTML() {
  return `
  <!-- Section 1: 벤치마크 + 현실 통합 -->
  <div class="fin-section" id="fin-sec-benchmark">
    <div class="fin-section-hdr" data-sec="benchmark">
      <h3>📊 벤치마크 vs 현실</h3>
      <div style="display:flex;gap:6px">
        <button class="fin-add-btn" onclick="openFinBenchmarkModal()">+ 벤치마크</button>
        <button class="fin-add-btn" onclick="openFinActualModal()">+ 연간실적</button>
      </div>
    </div>
    <div class="fin-section-body${_collapsed.benchmark?' collapsed':''}">
      <div class="fin-chart-wrap" style="max-height:300px"><canvas id="fin-main-chart"></canvas></div>
      <div id="fin-bench-list"></div>
      <div id="fin-actual-list"></div>
      <div id="fin-cagr-display"></div>
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
      <thead><tr><th>연도</th><th>나이</th><th>누적 저축/투자</th><th>순자산</th><th>비상금</th><th></th></tr></thead>
      <tbody>${actuals.map(a => {
        const em = calcEmergencyMonths(a.emergencyFund, a.monthlyExpense);
        return `<tr>
          <td>${a.year}</td>
          <td>${getAge(a.year)}살</td>
          <td class="num">${formatManwon(a.cumulativeSaved)}</td>
          <td class="num">${a.netWorth ? formatManwon(a.netWorth) : '-'}</td>
          <td class="num">${a.emergencyFund ? formatManwon(a.emergencyFund) + (em != null ? ` (${em}개월)` : '') : '-'}</td>
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
// 통합 차트 (벤치마크 점선 + 현실 실선)
// ================================================================
function _renderMainChart() {
  const canvas = document.getElementById('fin-main-chart');
  if (!canvas || !window.Chart) return;
  if (_mainChartInstance) _mainChartInstance.destroy();

  const benchmarks = getFinBenchmarks();
  const actuals = getFinActuals();
  if (benchmarks.length === 0 && actuals.length === 0) return;

  const colors = ['#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4'];
  const datasets = [];

  benchmarks.forEach((b, i) => {
    const proj = compoundProjection(b);
    datasets.push({
      label: b.name || `벤치마크 ${i + 1}`,
      data: proj.map(r => ({ x: r.year, y: r.closeBalance })),
      borderColor: colors[i % colors.length],
      borderDash: [5, 3],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    });
  });

  if (actuals.length > 0) {
    datasets.push({
      label: '현실 (누적 저축/투자)',
      data: actuals.map(a => ({ x: a.year, y: a.cumulativeSaved })),
      borderColor: '#10b981',
      borderWidth: 3,
      pointRadius: 4,
      pointBackgroundColor: '#10b981',
      fill: false,
      tension: 0.3,
    });
  }

  _mainChartInstance = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: 'linear', title: { display: true, text: '연도', color: '#5c6478', font: { size: 10 } }, ticks: { color: '#5c6478', font: { size: 10 } }, grid: { color: '#2c3040' } },
        y: { ticks: { color: '#5c6478', font: { size: 10 }, callback: v => formatManwon(v) }, grid: { color: '#2c3040' } },
      },
      plugins: {
        legend: { labels: { color: '#e2e4ea', font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}` } },
      },
    },
  });
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
  } else {
    titleEl.textContent = '연간 실적 추가';
    delBtn.style.display = 'none';
    document.getElementById('fin-actual-id').value = '';
    document.getElementById('fin-actual-year').value = new Date().getFullYear();
    document.getElementById('fin-actual-saved').value = 0;
    document.getElementById('fin-actual-networth').value = 0;
    document.getElementById('fin-actual-emergency').value = 0;
    document.getElementById('fin-actual-expense').value = 0;
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
