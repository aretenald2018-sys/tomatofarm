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
  getFinBudgets, saveFinBudget, deleteFinBudget,
  fetchExchangeRate, fetchFearGreed,
} from './data.js';
// Yahoo Finance Chart API (corsproxy.io CORS 프록시, 키 불필요)
const _CORS_PROXIES = [
  url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
];
const _QUOTE_CACHE_KEY = 'fin_quotes';
const _QUOTE_CACHE_TIME = 'fin_quotes_time';
const _QUOTE_CACHE_MIN = 3; // 3분 캐시

function _calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(1));
}

async function _proxyFetch(url) {
  // 직접 요청 시도 (일부 환경에서 CORS 없이 가능)
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}
  // 프록시 순차 시도
  for (const proxy of _CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (!res.ok) continue;
      return await res.json();
    } catch { continue; }
  }
  throw new Error('all proxies failed');
}

async function _fetchAllQuotes(symbols) {
  const now = Date.now();
  const lastTime = parseInt(localStorage.getItem(_QUOTE_CACHE_TIME) || '0');
  if ((now - lastTime) < _QUOTE_CACHE_MIN * 60000) {
    try {
      const cached = JSON.parse(localStorage.getItem(_QUOTE_CACHE_KEY));
      if (cached && Object.keys(cached).length > 0) return cached;
    } catch {}
  }

  const result = {};
  // 개별 chart API 호출 (시세 + RSI 동시 획득)
  for (const sym of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1mo&interval=1d`;
      const data = await _proxyFetch(url);
      const item = data?.chart?.result?.[0];
      if (!item?.meta?.regularMarketPrice) continue;

      const meta = item.meta;
      const price = meta.regularMarketPrice;
      const closes = item.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
      // 전일 종가 = closes 배열의 끝에서 두 번째 값 (마지막은 오늘)
      const prevDayClose = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose || price);
      const change = prevDayClose > 0 ? ((price - prevDayClose) / prevDayClose * 100) : 0;
      const rsi = _calcRSI(closes);

      result[sym] = { price, change: parseFloat(change.toFixed(2)), rsi };
    } catch (e) {
      console.warn(`[finance] ${sym} fetch failed:`, e.message);
    }
  }

  localStorage.setItem(_QUOTE_CACHE_KEY, JSON.stringify(result));
  localStorage.setItem(_QUOTE_CACHE_TIME, String(now));
  return result;
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
let _recent5ChartInstance = null;
let _flowChartInstance = null;
let _stockPriceChart = null;
let _stockVolumeChart = null;
let _stockRsiChart = null;
let _currentStockSym = null;
let _liveChart = null;
let _liveVolumeChart = null;
let _liveInterval = null;
let _liveAutoRefresh = true;

const M7 = [
  { sym: 'AAPL', name: '애플' },
  { sym: 'GOOG', name: '알파벳' },
  { sym: 'AMZN', name: '아마존' },
  { sym: 'NVDA', name: '엔비디아' },
  { sym: 'META', name: '메타' },
  { sym: 'TSLA', name: '테슬라' },
];
const _SWING_CACHE_KEY = 'swing_ohlc_cache';
const _SWING_CACHE_TIME = 'swing_ohlc_time';
const _SWING_POS_KEY = 'swing_positions';
const _PB_POS_KEY = 'pullback_positions';
let _swingData = {}; // { sym: { closes, highs, lows, opens, volumes, price, change } }

const _collapsed = { benchmark: false, reality: false, invest: false, budget: false };
let _budgetYear = new Date().getFullYear();
let _budgetQ = Math.ceil((new Date().getMonth() + 1) / 3); // 현재 분기

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

  // 마켓 상태 표시
  const ms = _getMarketStatus();
  const msEl = document.getElementById('fin-market-status');
  if (msEl) msEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:${ms.color}"><span style="width:5px;height:5px;border-radius:50%;background:${ms.color};display:inline-block"></span>${ms.label}</span>`;

  _loadMarketData().then(() => {
    _renderContextLine();
    _renderPositionTables();
    _renderNetWorthCards();
    _renderRecent5Chart();
    _renderMainChart();
  });

  _loadSwingData().then(() => { _renderStockList(); _renderPortfolioSummary(); });

  _renderBenchmarks();
  _renderActuals();
  _renderPlans();
  _renderRecent5Chart();
  _renderMainChart();
  _renderFlowChart();
  _renderBudget();
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
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="fin-chart-wrap" style="height:220px;flex:1;min-width:0"><canvas id="fin-recent5-chart"></canvas></div>
        <div class="fin-chart-wrap" style="height:220px;flex:1;min-width:0"><canvas id="fin-main-chart"></canvas></div>
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
    <div class="fin-section-body${_collapsed.invest?' collapsed':''}">
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
    <div class="fin-section-body${_collapsed.budget?' collapsed':''}">
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
  btn.textContent = visible ? '📈 현금흐름 추이 보기' : '📈 현금흐름 추이 숨기기';
  if (!visible) _renderFlowChart();
}

// ================================================================
// 시장 데이터
// ================================================================
async function _loadMarketData() {
  const symbols = ['SPY', 'QQQ', ...M7.map(t => t.sym)];
  try {
    const quotes = await _fetchAllQuotes(symbols);
    Object.assign(_quotesMap, quotes);
    console.log(`[finance] ${Object.keys(quotes).length}개 시세 로드 완료`);
  } catch (e) {
    console.warn('[finance] 시세 로드 실패:', e.message);
  }
  try { _fngData = await fetchFearGreed(); } catch {}
}

export async function refreshFinMarketData() {
  localStorage.removeItem(_QUOTE_CACHE_KEY);
  localStorage.removeItem(_QUOTE_CACHE_TIME);
  localStorage.removeItem('fng_data');
  localStorage.removeItem('fng_time');
  _quotesMap = {};
  _fngData = null;
  await _loadMarketData();
  _renderContextLine();
  _renderPositionTables();
  _renderNetWorthCards();
  // 스윙 데이터도 갱신
  localStorage.removeItem(_SWING_CACHE_KEY);
  localStorage.removeItem(_SWING_CACHE_TIME);
  _swingData = {};
  await _loadSwingData();
  _renderStockList();
  _renderPortfolioSummary();
}

// ── 시황 한 줄 (토스 스타일) ──
function _renderContextLine() {
  const el = document.getElementById('fin-context-line');
  if (!el) return;
  const UP = '#ef4444', DN = '#3b82f6';
  const parts = [];
  // F&G
  if (_fngData?.score != null) {
    const s = _fngData.score;
    const c = s <= 25 ? '#ef4444' : s <= 45 ? '#f97316' : s <= 55 ? 'var(--accent)' : s <= 75 ? '#84cc16' : '#10b981';
    parts.push(`<span class="fin-ctx-dot" style="background:${c}"></span><span>F&G ${s}</span>`);
  }
  // SPY, QQQ
  ['SPY','QQQ'].forEach(sym => {
    const q = _quotesMap[sym];
    if (!q) return;
    const c = q.change > 0 ? UP : q.change < 0 ? DN : 'var(--muted)';
    parts.push(`<span>${sym} <span style="color:${c}">${q.change > 0?'+':''}${q.change.toFixed(2)}%</span></span>`);
  });
  const cachedTime = parseInt(localStorage.getItem(_QUOTE_CACHE_TIME) || '0');
  const timeStr = cachedTime ? new Date(cachedTime).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  el.innerHTML = parts.join('<span style="color:var(--border)">·</span>') + `<span style="margin-left:auto;font-size:9px">${timeStr}</span>`;
}

// ── 포지션 요약 카드 ──
function _renderPortfolioSummary() {
  const el = document.getElementById('fin-portfolio-summary');
  if (!el) return;
  const swingPos = _getSwingPositions();
  const pbPos = _getPbPositions();
  const allPos = [...Object.entries(swingPos).map(([sym,p])=>({sym,...p,type:'A'})), ...Object.entries(pbPos).map(([sym,p])=>({sym,...p,type:'B'}))];
  if (allPos.length === 0) { el.innerHTML = ''; return; }

  let totalVal = 0, totalCost = 0;
  allPos.forEach(p => {
    const d = _swingData[p.sym];
    const curPrice = d?.price || 0;
    totalVal += curPrice * p.shares;
    totalCost += p.buyPrice * p.shares;
  });
  const pnl = totalVal - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost * 100) : 0;
  const pnlKrw = pnl * _fxRate;
  const UP = '#ef4444', DN = '#3b82f6';
  const c = pnl >= 0 ? UP : DN;
  const sign = pnl >= 0 ? '+' : '';

  el.innerHTML = `<div class="fin-portfolio-card">
    <div class="fin-pf-label">보유 ${allPos.length}종목</div>
    <div class="fin-pf-pnl" style="color:${c}">${sign}$${Math.abs(pnl).toFixed(0)} (${sign}${pnlPct.toFixed(1)}%)</div>
    <div class="fin-pf-sub">${sign}₩${Math.abs(pnlKrw).toLocaleString('ko-KR',{maximumFractionDigits:0})} · 평가 $${totalVal.toFixed(0)}</div>
  </div>`;
}

// ── 종목 리스트 (토스 스타일) ──
function _renderStockList() {
  const el = document.getElementById('fin-stock-list');
  if (!el) return;
  if (Object.keys(_swingData).length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:20px;text-align:center">M7 데이터 로딩 중...</div>';
    return;
  }
  const UP = '#ef4444', DN = '#3b82f6';
  const swingPos = _getSwingPositions();
  const pbPos = _getPbPositions();

  el.innerHTML = M7.map(t => {
    const d = _swingData[t.sym];
    if (!d) return '';
    const chgC = d.change > 0 ? UP : d.change < 0 ? DN : 'var(--muted)';
    // 전략A 신호
    const rsi = _calcRSI(d.closes, 14);
    const bb = _calcBB(d.closes, 20, 2);
    const stoch = _calcStochastic(d.highs, d.lows, d.closes, 14, 3, 3);
    const conA = _consensus(_rsiSignal(rsi), _bbSignal(d.closes, bb), _stochSignal(stoch));
    // 전략B 신호
    const gate = _trendGate(d.closes);
    const dropSpeed = _pbDropSpeed(d.closes);
    let conB;
    if (!gate.active && !gate.near) {
      conB = { consensus: 'OFF' };
    } else {
      conB = _pbConsensus(_pbPriceSignal(d.closes), _pbRsiSignal(rsi), _pbVolumeSignal(d.volumes, d.closes), gate, dropSpeed);
    }
    const badgeA = _compactBadge(conA.consensus, 'A');
    const badgeB = _compactBadge(conB.consensus, 'B');
    const hasPos = swingPos[t.sym] || pbPos[t.sym];

    return `<div class="fin-stock-row" onclick="openStockDetail('${t.sym}')">
      <div class="fin-sr-left">
        <div class="fin-sr-sym">${t.sym}</div>
        <div class="fin-sr-name">${t.name}</div>
      </div>
      <div class="fin-sr-center">
        <div class="fin-sr-price">$${d.price.toFixed(2)}</div>
        <div class="fin-sr-change" style="color:${chgC}">${d.change > 0?'+':''}${d.change.toFixed(2)}%</div>
      </div>
      <div class="fin-sr-right">
        ${badgeA}${badgeB}${hasPos ? '<span class="fin-sr-pos-dot"></span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function _compactBadge(consensus, label) {
  const m = {
    'STRONGLY BUY': {bg:'#4c0519',c:'#fca5a5',t:'S.BUY'},
    'BUY': {bg:'#4c0519',c:'#f87171',t:'BUY'},
    'NEUTRAL': {bg:'#1e293b',c:'#94a3b8',t:'HOLD'},
    'SELL': {bg:'#172554',c:'#93c5fd',t:'SELL'},
    'STRONGLY SELL': {bg:'#172554',c:'#60a5fa',t:'S.SELL'},
    'OFF': {bg:'#1e293b',c:'#64748b',t:'OFF'},
  };
  const s = m[consensus] || m['NEUTRAL'];
  return `<span class="fin-sr-badge" style="background:${s.bg};color:${s.c}" title="전략${label}">${s.t}</span>`;
}

// ================================================================
// 종목 상세 모달 (토스 스타일 — 차트/전략A/전략B 탭)
// ================================================================
let _sdCurrentTab = 'chart';

export async function openStockDetail(sym) {
  _currentStockSym = sym;
  const modal = document.getElementById('stock-detail-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const t = M7.find(x => x.sym === sym) || { sym, name: '' };
  const d = _swingData[sym];
  const UP = '#ef4444', DN = '#3b82f6';
  const chg = d?.change || 0;
  const chgC = chg > 0 ? UP : chg < 0 ? DN : 'var(--muted)';
  document.getElementById('sd-header').innerHTML = `
    <div style="display:flex;align-items:baseline;gap:8px">
      <span style="font-size:18px;font-weight:700;color:var(--text)">${sym}</span>
      <span style="font-size:12px;color:var(--muted)">${t.name}</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
      <span style="font-size:20px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--text)">$${d?.price?.toFixed(2) || '-'}</span>
      <span style="font-size:13px;font-family:'JetBrains Mono',monospace;color:${chgC}">${chg > 0?'+':''}${chg.toFixed(2)}%</span>
    </div>`;
  _sdCurrentTab = 'live';
  document.querySelectorAll('.fin-detail-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === 'live'));
  await _renderDetailTab(sym, 'live');
}

export function closeStockDetailModal(e) {
  if (e && e.target !== document.getElementById('stock-detail-modal')) return;
  document.getElementById('stock-detail-modal').style.display = 'none';
  _stopLiveRefresh();
  if (_liveChart) { _liveChart.destroy(); _liveChart = null; }
  if (_liveVolumeChart) { _liveVolumeChart.destroy(); _liveVolumeChart = null; }
  if (_stockPriceChart) { _stockPriceChart.destroy(); _stockPriceChart = null; }
  if (_stockVolumeChart) { _stockVolumeChart.destroy(); _stockVolumeChart = null; }
  if (_stockRsiChart) { _stockRsiChart.destroy(); _stockRsiChart = null; }
}

export async function switchStockDetailTab(tab) {
  if (!_currentStockSym) return;
  _sdCurrentTab = tab;
  document.querySelectorAll('.fin-detail-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  // 차트 정리
  if (tab !== 'chart') {
    if (_stockPriceChart) { _stockPriceChart.destroy(); _stockPriceChart = null; }
    if (_stockVolumeChart) { _stockVolumeChart.destroy(); _stockVolumeChart = null; }
    if (_stockRsiChart) { _stockRsiChart.destroy(); _stockRsiChart = null; }
  }
  if (tab !== 'live') {
    if (_liveChart) { _liveChart.destroy(); _liveChart = null; }
    if (_liveVolumeChart) { _liveVolumeChart.destroy(); _liveVolumeChart = null; }
  }
  await _renderDetailTab(_currentStockSym, tab);
}

async function _renderDetailTab(sym, tab) {
  const content = document.getElementById('sd-content');
  if (!content) return;

  // 실시간 탭이 아니면 자동갱신 중지
  if (tab !== 'live') _stopLiveRefresh();

  if (tab === 'live') {
    const ms = _getMarketStatus();
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div id="live-status" style="display:flex;align-items:center;gap:6px">
          <span style="display:inline-flex;align-items:center;gap:4px">
            <span style="width:6px;height:6px;border-radius:50%;background:${ms.color};display:inline-block"></span>
            <span style="color:${ms.color};font-size:10px;font-weight:600">${ms.label}</span>
          </span>
        </div>
        <button class="fin-add-btn" id="live-auto-toggle" onclick="toggleLiveAutoRefresh()" style="font-size:9px;padding:2px 8px;color:#10b981">자동갱신 ON</button>
      </div>
      <div id="live-price-header" style="margin-bottom:8px"></div>
      <div style="display:flex;justify-content:center;gap:6px;margin-bottom:8px">
        <button class="fin-add-btn live-range-btn active" data-range="1d" onclick="changeLiveRange('1d')">1D</button>
        <button class="fin-add-btn live-range-btn" data-range="5d" onclick="changeLiveRange('5d')">5D</button>
      </div>
      <div id="live-summary" style="display:flex;gap:8px;justify-content:center;margin-bottom:8px;flex-wrap:wrap"></div>
      <div id="live-chart-container">
        <div style="height:200px"><canvas id="live-price-canvas"></canvas></div>
        <div style="height:60px;margin-top:4px"><canvas id="live-volume-canvas"></canvas></div>
      </div>`;
    await _loadLiveChart(sym, true);
  } else if (tab === 'chart') {
    content.innerHTML = `
      <div style="display:flex;justify-content:center;gap:4px;margin-bottom:10px">
        <button class="fin-add-btn stock-range-btn" data-range="1mo" onclick="changeStockChartRange('1mo')">1개월</button>
        <button class="fin-add-btn stock-range-btn active" data-range="3mo" onclick="changeStockChartRange('3mo')">3개월</button>
        <button class="fin-add-btn stock-range-btn" data-range="6mo" onclick="changeStockChartRange('6mo')">6개월</button>
        <button class="fin-add-btn stock-range-btn" data-range="1y" onclick="changeStockChartRange('1y')">1년</button>
      </div>
      <div id="sc-tooltip-bar" class="sc-tooltip-bar"></div>
      <div id="sc-price-wrap" class="sc-chart-wrap" style="height:200px"><canvas id="stock-price-chart"></canvas></div>
      <div class="sc-drag-handle" data-above="sc-price-wrap" data-below="sc-vol-wrap"></div>
      <div id="sc-vol-wrap" class="sc-chart-wrap" style="height:70px"><canvas id="stock-volume-chart"></canvas></div>
      <div class="sc-drag-handle" data-above="sc-vol-wrap" data-below="sc-rsi-wrap"></div>
      <div id="sc-rsi-wrap" class="sc-chart-wrap" style="height:80px"><canvas id="stock-rsi-chart"></canvas></div>`;
    _initDragHandles();
    await _loadStockChart(sym, '3mo');
  } else if (tab === 'stratA') {
    _renderDetailStratA(sym, content);
  } else if (tab === 'stratB') {
    _renderDetailStratB(sym, content);
  }
}

function _renderDetailStratA(sym, el) {
  const d = _swingData[sym];
  if (!d) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">데이터 없음</div>'; return; }
  const rsi = _calcRSI(d.closes, 14);
  const bb = _calcBB(d.closes, 20, 2);
  const stoch = _calcStochastic(d.highs, d.lows, d.closes, 14, 3, 3);
  const rsiSig = _rsiSignal(rsi);
  const bbSig = _bbSignal(d.closes, bb);
  const stochSig = _stochSignal(stoch);
  const con = _consensus(rsiSig, bbSig, stochSig);
  const pos = _getSwingPositions()[sym];

  el.innerHTML = `
    <div class="fin-verdict">
      <div class="fin-verdict-label">Contrarian Swing 종합</div>
      ${_signalBadge(con.consensus)}
      <div class="fin-verdict-summary">${con.summary}</div>
      <div class="fin-verdict-action">${con.action}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">RSI (14)</div></div>
      <div class="fin-ind-val">${rsiSig.val} ${_dirBadge(rsiSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">Bollinger Bands (20,2)</div><div class="fin-ind-sub">${bbSig.status}</div></div>
      <div class="fin-ind-val">${bbSig.val} ${_dirBadge(bbSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">Stochastic (14,3,3)</div>${stochSig.cross ? `<div class="fin-ind-sub" style="color:${stochSig.dir==='B'?'#ef4444':'#3b82f6'};font-weight:600">${stochSig.cross}</div>` : ''}</div>
      <div class="fin-ind-val">${stochSig.val} ${_dirBadge(stochSig.dir)}</div>
    </div>
    ${_renderPosCard(sym, pos, 'swing')}`;
}

function _renderDetailStratB(sym, el) {
  const d = _swingData[sym];
  if (!d) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">데이터 없음</div>'; return; }
  const gate = _trendGate(d.closes);
  const rsi = _calcRSI(d.closes, 14);
  const priceSig = _pbPriceSignal(d.closes);
  const rsiSig = _pbRsiSignal(rsi);
  const volSig = _pbVolumeSignal(d.volumes, d.closes);
  const dropSpeed = _pbDropSpeed(d.closes);
  let con;
  if (!gate.active && !gate.near) {
    con = { consensus: 'OFF', action: '비활성 — 전략A 참고', summary: '-' };
  } else {
    con = _pbConsensus(priceSig, rsiSig, volSig, gate, dropSpeed);
  }
  const pos = _getPbPositions()[sym];
  const gateColor = gate.active ? '#10b981' : gate.near ? '#f59e0b' : '#ef4444';
  const gateText = gate.active ? 'ON' : gate.near ? '경계' : 'OFF';
  const strengthLabel = { strong: '강', moderate: '중', weak: '약', none: '-' }[gate.strength] || '-';
  const strengthColor = { strong: '#10b981', moderate: '#f59e0b', weak: '#ef4444', none: '#64748b' }[gate.strength] || '#64748b';

  el.innerHTML = `
    <div class="fin-ind-row" style="padding:12px 0">
      <div><div class="fin-ind-label">추세 게이트</div><div class="fin-ind-sub">50SMA ${gate.sma50?.toFixed(0)||'-'} vs 200SMA ${gate.sma200?.toFixed(0)||'-'} · 이격 ${gate.diff?.toFixed(1)||'-'}%</div></div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:14px;font-weight:700;color:${gateColor}">${gateText}</span>
        <span style="font-size:10px;color:${strengthColor}">(${strengthLabel})</span>
      </div>
    </div>
    ${dropSpeed.fast ? `<div class="fin-ind-row" style="background:rgba(239,68,68,0.08);border-radius:6px;padding:8px 10px;margin-bottom:4px">
      <div><div class="fin-ind-label" style="color:#ef4444">급락 감지</div><div class="fin-ind-sub">5일간 ${dropSpeed.val} — 눌림목이 아닌 급락 가능성</div></div>
      <div style="font-size:12px;font-weight:700;color:#ef4444">⚠️</div>
    </div>` : ''}
    <div class="fin-verdict">
      <div class="fin-verdict-label">Pullback 종합</div>
      ${con.consensus === 'OFF' ? '<span class="fin-sr-badge" style="background:#1e293b;color:#64748b;font-size:11px;padding:4px 10px">OFF</span>' : _signalBadge(con.consensus)}
      <div class="fin-verdict-summary">${con.summary}</div>
      <div class="fin-verdict-action">${con.action}</div>
    </div>
    ${gate.active || gate.near ? `
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">20SMA 이격</div><div class="fin-ind-sub">SMA20: $${priceSig.sma20?.toFixed(0)||'-'}</div></div>
      <div class="fin-ind-val">${priceSig.val} ${_dirBadge(priceSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">RSI (14)</div></div>
      <div class="fin-ind-val">${rsiSig.val} ${_dirBadge(rsiSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">거래량 추세 (5d/20d)</div></div>
      <div class="fin-ind-val">${volSig.val} ${_dirBadge(volSig.dir)}</div>
    </div>` : ''}
    ${_renderPosCard(sym, pos, 'pullback')}`;
}

function _renderPosCard(sym, pos, type) {
  const UP = '#ef4444', DN = '#3b82f6';
  const buyFn = type === 'swing' ? 'openSwingBuy' : 'openPbBuy';
  const editFn = type === 'swing' ? 'editSwingPosition' : 'editPbPosition';
  const closeFn = type === 'swing' ? 'closeSwingPosition' : 'closePbPosition';
  const label = type === 'swing' ? '전략A' : '전략B';

  if (!pos) {
    return `<div class="fin-pos-card" style="text-align:center">
      <button class="fin-pos-btn" style="background:#4c0519;color:#fca5a5;border-color:#881337;width:auto;display:inline-block;padding:10px 24px" onclick="${buyFn}('${sym}');switchStockDetailTab('${type==='swing'?'stratA':'stratB'}')">매수 실행 (${label})</button>
    </div>`;
  }
  const d = _swingData[sym];
  const curPrice = d?.price || 0;
  const pnl = (curPrice - pos.buyPrice) * pos.shares;
  const pnlPct = pos.buyPrice > 0 ? ((curPrice - pos.buyPrice) / pos.buyPrice * 100) : 0;
  const pnlKrw = pnl * _fxRate;
  const c = pnl >= 0 ? UP : DN;
  const sign = pnl >= 0 ? '+' : '';
  const curVal = curPrice * pos.shares;

  return `<div class="fin-pos-card">
    <div class="fin-pos-info">${pos.buyDate} · ${pos.shares}주 · 매입 $${pos.buyPrice}</div>
    <div class="fin-pos-pnl" style="color:${c}">${sign}$${Math.abs(pnl).toFixed(0)} (${sign}${pnlPct.toFixed(1)}%)</div>
    <div class="fin-pos-info">${sign}₩${Math.abs(pnlKrw).toLocaleString('ko-KR',{maximumFractionDigits:0})} · 평가 $${curVal.toFixed(0)} · ₩${(curVal*_fxRate).toLocaleString('ko-KR',{maximumFractionDigits:0})}</div>
    <div class="fin-pos-actions">
      <button class="fin-pos-btn" style="background:var(--surface3);color:var(--muted2)" onclick="${editFn}('${sym}');switchStockDetailTab('${type==='swing'?'stratA':'stratB'}')">수정</button>
      <button class="fin-pos-btn" style="background:#172554;color:#93c5fd;border-color:#1e40af" onclick="${closeFn}('${sym}');switchStockDetailTab('${type==='swing'?'stratA':'stratB'}')">매도 완료</button>
    </div>
  </div>`;
}

export async function changeStockChartRange(range) {
  if (!_currentStockSym) return;
  document.querySelectorAll('.stock-range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === range));
  if (_stockPriceChart) { _stockPriceChart.destroy(); _stockPriceChart = null; }
  if (_stockVolumeChart) { _stockVolumeChart.destroy(); _stockVolumeChart = null; }
  if (_stockRsiChart) { _stockRsiChart.destroy(); _stockRsiChart = null; }
  await _loadStockChart(_currentStockSym, range);
}

// ── 드래그 핸들: 차트 영역 리사이즈 ──
function _initDragHandles() {
  document.querySelectorAll('.sc-drag-handle').forEach(handle => {
    let startY = 0, aboveH = 0, belowH = 0, aboveEl = null, belowEl = null;
    const onMove = e => {
      e.preventDefault();
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      const dy = y - startY;
      const newAbove = Math.max(40, aboveH + dy);
      const newBelow = Math.max(40, belowH - dy);
      aboveEl.style.height = newAbove + 'px';
      belowEl.style.height = newBelow + 'px';
      // 차트 리사이즈
      [_stockPriceChart, _stockVolumeChart, _stockRsiChart].forEach(c => c?.resize());
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    const onStart = e => {
      aboveEl = document.getElementById(handle.dataset.above);
      belowEl = document.getElementById(handle.dataset.below);
      if (!aboveEl || !belowEl) return;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      aboveH = aboveEl.offsetHeight;
      belowH = belowEl.offsetHeight;
      document.addEventListener('mousemove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    };
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
  });
}

// ── 크로스헤어 + 토스 스타일 툴팁바 ──
function _updateTooltipBar(idx) {
  const bar = document.getElementById('sc-tooltip-bar');
  if (!bar || !_stockChartData || idx == null) { if (bar) bar.style.display = 'none'; return; }
  const d = _stockChartData;
  const c = d.closes[idx], o = d.opens[idx], h = d.highs[idx], l = d.lows[idx];
  if (c == null) { bar.style.display = 'none'; return; }
  const prev = idx > 0 ? d.closes[idx - 1] : o;
  const chg = prev ? ((c - prev) / prev * 100) : 0;
  const UP = '#ef4444', DN = '#3b82f6';
  const col = chg >= 0 ? UP : DN;
  const sign = chg >= 0 ? '+' : '';
  const rsi = d.rsiValues[idx];
  const vol = d.volumes[idx];
  const rsiColor = rsi != null ? (rsi >= 70 ? UP : rsi <= 30 ? '#10b981' : '#e2e4ea') : '#64748b';
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span style="color:#e2e4ea;font-weight:700">$${c.toFixed(2)}</span>
    <span style="color:${col}">${sign}${chg.toFixed(2)}%</span>
    <span style="color:#64748b;font-size:10px">${d.labels[idx]}</span>
    <span style="color:#64748b">|</span>
    <span style="font-size:10px">시 $${o?.toFixed(0)||'-'} 고 <span style="color:${UP}">$${h?.toFixed(0)||'-'}</span> 저 <span style="color:${DN}">$${l?.toFixed(0)||'-'}</span></span>
    <span style="color:#64748b">|</span>
    <span style="font-size:10px;color:${rsiColor}">RSI ${rsi ?? '-'}</span>
    <span style="font-size:10px;color:#64748b">${vol != null ? (vol >= 1e6 ? (vol/1e6).toFixed(1)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(0)+'K' : vol) : '-'}</span>`;
}

// 크로스헤어 세로선 + 동기화 플러그인
const _crosshairPlugin = {
  id: 'crosshair',
  afterEvent(chart, args) {
    const evt = args.event;
    if (evt.type === 'mousemove' || evt.type === 'click') {
      const el = chart.getElementsAtEventForMode(args.event, 'index', { intersect: false }, false);
      if (el.length > 0) {
        chart._crosshairX = el[0].element.x;
        chart._crosshairIdx = el[0].index;
        // 동기화
        [_stockPriceChart, _stockVolumeChart, _stockRsiChart].forEach(ch => {
          if (!ch || ch === chart) return;
          ch._crosshairX = el[0].element.x;
          ch._crosshairIdx = el[0].index;
          ch.setActiveElements([{ datasetIndex: 0, index: el[0].index }]);
          ch.update('none');
        });
        _updateTooltipBar(el[0].index);
      }
    }
    if (evt.type === 'mouseout') {
      chart._crosshairX = null;
      chart._crosshairIdx = null;
      [_stockPriceChart, _stockVolumeChart, _stockRsiChart].forEach(ch => {
        if (!ch) return;
        ch._crosshairX = null;
        ch._crosshairIdx = null;
        ch.update('none');
      });
      _updateTooltipBar(null);
    }
  },
  afterDraw(chart) {
    if (chart._crosshairX == null) return;
    const ctx = chart.ctx;
    const { top, bottom } = chart.chartArea;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(chart._crosshairX, top);
    ctx.lineTo(chart._crosshairX, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

// 저장된 OHLC + RSI 데이터 (툴팁 연동용)
let _stockChartData = null;

async function _loadStockChart(sym, range) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d`;
    const data = await _proxyFetch(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('no data');

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens = quote.open || [];
    const closes = quote.close || [];
    const volumes = quote.volume || [];
    const highs = quote.high || [];
    const lows = quote.low || [];

    const labels = timestamps.map(t => {
      const d = new Date(t * 1000);
      return `${d.getMonth()+1}/${d.getDate()}`;
    });

    // RSI(14) 계산
    const rsiValues = [];
    const period = 14;
    for (let i = 0; i < closes.length; i++) {
      if (i < period) { rsiValues.push(null); continue; }
      const slice = closes.slice(0, i + 1).filter(c => c != null);
      if (slice.length < period + 1) { rsiValues.push(null); continue; }
      rsiValues.push(_calcRSI(slice, period));
    }

    // 데이터 저장 (툴팁 연동용)
    _stockChartData = { labels, opens, highs, lows, closes, volumes, rsiValues };

    // 종가 기준 등락 판별 (토스 스타일: 첫날 대비)
    const firstClose = closes.find(c => c != null) || 0;
    const lastClose = closes.filter(c => c != null).pop() || 0;
    const isUp = lastClose >= firstClose;
    const UP = '#ef4444', DN = '#3b82f6';
    const lineColor = isUp ? UP : DN;

    // 공통: X축 패딩 (오른쪽에 여유 공간 → 오늘 터치 가능)
    const xPadRight = 20;

    // 공통: 차트 기본 옵션
    const baseOpts = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { right: xPadRight } },
    };

    // ── 가격 차트 (토스 스타일: 부드러운 라인 + 그라디언트 fill) ──
    if (_stockPriceChart) _stockPriceChart.destroy();
    const priceCanvas = document.getElementById('stock-price-chart');
    if (!priceCanvas) return;
    const priceCtx = priceCanvas.getContext('2d');
    const gradFill = priceCtx.createLinearGradient(0, 0, 0, priceCanvas.parentElement.offsetHeight);
    gradFill.addColorStop(0, isUp ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)');
    gradFill.addColorStop(1, 'rgba(0,0,0,0)');

    _stockPriceChart = new Chart(priceCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '종가',
          data: closes,
          borderColor: lineColor,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          fill: true,
          backgroundColor: gradFill,
          tension: 0.3,
          spanGaps: true,
        }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: {
            ticks: { color: '#5c6478', font: { size: 9 }, maxTicksLimit: 6, maxRotation: 0, padding: 4 },
            grid: { display: false },
          },
          y: {
            position: 'right',
            ticks: { color: '#5c6478', font: { size: 9 }, callback: v => '$' + v.toFixed(0), maxTicksLimit: 5 },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
      plugins: [_crosshairPlugin],
    });

    // ── 거래량 차트 (토스 스타일: 등락 컬러바) ──
    if (_stockVolumeChart) _stockVolumeChart.destroy();
    const volCanvas = document.getElementById('stock-volume-chart');
    if (!volCanvas) return;

    // 거래량 이동평균(20) — 추이 파악용
    const volMA = [];
    for (let i = 0; i < volumes.length; i++) {
      if (i < 19) { volMA.push(null); continue; }
      const s = volumes.slice(i - 19, i + 1);
      volMA.push(s.reduce((a, b) => a + (b || 0), 0) / 20);
    }

    const volColors = closes.map((c, i) => {
      if (i === 0 || c == null) return 'rgba(148,163,184,0.3)';
      const prev = closes[i - 1];
      return c >= prev ? 'rgba(239,68,68,0.55)' : 'rgba(59,130,246,0.55)';
    });

    _stockVolumeChart = new Chart(volCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '거래량', data: volumes, backgroundColor: volColors, borderWidth: 0, order: 2 },
          { label: '20MA', data: volMA, type: 'line', borderColor: '#f59e0b', borderWidth: 1.2, pointRadius: 0, fill: false, tension: 0.3, order: 1 },
        ],
      },
      options: {
        ...baseOpts,
        scales: {
          x: { ticks: { display: false }, grid: { display: false } },
          y: {
            position: 'right',
            ticks: { color: '#5c6478', font: { size: 8 }, callback: v => v >= 1e6 ? (v/1e6).toFixed(0)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : '', maxTicksLimit: 3 },
            grid: { color: 'rgba(255,255,255,0.03)' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
      plugins: [_crosshairPlugin],
    });

    // ── RSI 차트 (토스 스타일: 영역 fill + 구간 표시) ──
    if (_stockRsiChart) _stockRsiChart.destroy();
    const rsiCanvas = document.getElementById('stock-rsi-chart');
    if (!rsiCanvas) return;
    const rsiCtx = rsiCanvas.getContext('2d');

    // RSI 색상: 현재 값 기준
    const lastRsi = rsiValues.filter(r => r != null).pop();
    const rsiLineColor = lastRsi != null ? (lastRsi >= 70 ? UP : lastRsi <= 30 ? '#10b981' : '#f59e0b') : '#f59e0b';
    const rsiFillAlpha = lastRsi != null ? (lastRsi >= 70 ? 'rgba(239,68,68,0.12)' : lastRsi <= 30 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)') : 'rgba(245,158,11,0.12)';
    const rsiFillGrad = rsiCtx.createLinearGradient(0, 0, 0, rsiCanvas.parentElement.offsetHeight);
    rsiFillGrad.addColorStop(0, rsiFillAlpha);
    rsiFillGrad.addColorStop(1, 'rgba(0,0,0,0)');

    _stockRsiChart = new Chart(rsiCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'RSI(14)',
          data: rsiValues,
          borderColor: rsiLineColor,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: rsiLineColor,
          fill: true,
          backgroundColor: rsiFillGrad,
          tension: 0.3,
        }],
      },
      options: {
        ...baseOpts,
        scales: {
          x: { ticks: { display: false }, grid: { display: false } },
          y: {
            min: 0, max: 100,
            position: 'right',
            ticks: { color: '#5c6478', font: { size: 8 }, stepSize: 50, callback: v => v === 50 ? '50' : v === 0 ? '' : v === 100 ? '' : '' },
            grid: { color: 'rgba(255,255,255,0.03)' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      },
      plugins: [
        _crosshairPlugin,
        {
          id: 'rsiZones',
          beforeDraw(chart) {
            const ctx = chart.ctx;
            const yScale = chart.scales.y;
            const { left, right, top, bottom } = chart.chartArea;
            ctx.save();
            // 과매수 영역 (70~100)
            const y70 = yScale.getPixelForValue(70);
            const y100 = yScale.getPixelForValue(100);
            ctx.fillStyle = 'rgba(239,68,68,0.06)';
            ctx.fillRect(left, y100, right - left, y70 - y100);
            // 과매도 영역 (0~30)
            const y30 = yScale.getPixelForValue(30);
            const y0 = yScale.getPixelForValue(0);
            ctx.fillStyle = 'rgba(16,185,129,0.06)';
            ctx.fillRect(left, y30, right - left, y0 - y30);
            // 경계선
            ctx.strokeStyle = 'rgba(239,68,68,0.25)';
            ctx.setLineDash([3, 3]);
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(left, y70); ctx.lineTo(right, y70); ctx.stroke();
            ctx.strokeStyle = 'rgba(16,185,129,0.25)';
            ctx.beginPath(); ctx.moveTo(left, y30); ctx.lineTo(right, y30); ctx.stroke();
            // 50 기준선
            const y50 = yScale.getPixelForValue(50);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath(); ctx.moveTo(left, y50); ctx.lineTo(right, y50); ctx.stroke();
            // 레이블
            ctx.font = '8px sans-serif';
            ctx.fillStyle = 'rgba(239,68,68,0.5)';
            ctx.fillText('과매수', left + 2, y70 + 10);
            ctx.fillStyle = 'rgba(16,185,129,0.5)';
            ctx.fillText('과매도', left + 2, y30 - 4);
            ctx.restore();
          },
        },
      ],
    });

    // 초기 툴팁바: 마지막 데이터
    _updateTooltipBar(closes.length - 1);

  } catch (e) {
    console.warn('[stock-chart]', e);
    const el = document.getElementById('sd-content');
    if (el) el.innerHTML = `<div style="color:var(--diet-bad);font-size:12px;text-align:center;padding:20px">차트 데이터를 불러올 수 없습니다</div>`;
  }
}

// ================================================================
// 실시간 인트라데이 차트
// ================================================================

function _getMarketStatus() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = et.getHours(), m = et.getMinutes(), day = et.getDay();
  const t = h * 60 + m;
  if (day === 0 || day === 6) return { status: 'closed', label: '주말 휴장', color: '#64748b' };
  if (t >= 240 && t < 570) return { status: 'pre', label: '프리마켓', color: '#f59e0b' };
  if (t >= 570 && t < 960) return { status: 'open', label: '정규장', color: '#10b981' };
  if (t >= 960 && t < 1200) return { status: 'after', label: '애프터마켓', color: '#a855f7' };
  return { status: 'closed', label: '장 마감', color: '#64748b' };
}

function _stopLiveRefresh() {
  if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; }
}

export function toggleLiveAutoRefresh() {
  _liveAutoRefresh = !_liveAutoRefresh;
  const btn = document.getElementById('live-auto-toggle');
  if (btn) {
    btn.textContent = _liveAutoRefresh ? '자동갱신 ON' : '자동갱신 OFF';
    btn.style.color = _liveAutoRefresh ? '#10b981' : '#64748b';
  }
  if (_liveAutoRefresh && _currentStockSym) {
    _startLiveRefresh(_currentStockSym);
  } else {
    _stopLiveRefresh();
  }
}

function _startLiveRefresh(sym) {
  _stopLiveRefresh();
  const ms = _getMarketStatus();
  if ((ms.status === 'open' || ms.status === 'pre' || ms.status === 'after') && _liveAutoRefresh) {
    _liveInterval = setInterval(() => {
      if (_sdCurrentTab === 'live' && _currentStockSym === sym) {
        _loadLiveChart(sym, false);
      } else {
        _stopLiveRefresh();
      }
    }, 60000);
  }
}

export function changeLiveRange(range) {
  if (!_currentStockSym) return;
  document.querySelectorAll('.live-range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === range));
  _loadLiveChart(_currentStockSym, true, range);
}

async function _loadLiveChart(sym, showLoading = true, rangeOverride) {
  const container = document.getElementById('live-chart-container');
  if (!container) return;
  const range = rangeOverride || document.querySelector('.live-range-btn.active')?.dataset?.range || '1d';
  const interval = range === '1d' ? '1m' : range === '5d' ? '5m' : '15m';

  if (showLoading) {
    const statusEl = document.getElementById('live-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--muted)">로딩 중...</span>';
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=${interval}&includePrePost=true`;
    const data = await _proxyFetch(url);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('no data');

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const closes = quote.close || [];
    const volumes = quote.volume || [];
    const highs = quote.high || [];
    const lows = quote.low || [];

    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const curPrice = meta.regularMarketPrice;

    const labels = timestamps.map(t => {
      const d = new Date(t * 1000);
      return range === '1d'
        ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
        : `${d.getMonth()+1}/${d.getDate()} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}`;
    });

    // 가격 변동 계산
    const change = prevClose ? ((curPrice - prevClose) / prevClose * 100) : 0;
    const changeDollar = prevClose ? (curPrice - prevClose) : 0;
    const UP = '#ef4444', DN = '#3b82f6';
    const chgC = change >= 0 ? UP : DN;
    const sign = change >= 0 ? '+' : '';

    // 마켓 상태
    const ms = _getMarketStatus();

    // 상태 업데이트
    const statusEl = document.getElementById('live-status');
    if (statusEl) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      statusEl.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px">
          <span style="width:6px;height:6px;border-radius:50%;background:${ms.color};display:inline-block"></span>
          <span style="color:${ms.color};font-size:10px;font-weight:600">${ms.label}</span>
        </span>
        <span style="color:var(--muted);font-size:10px;margin-left:8px">갱신: ${timeStr}</span>`;
    }

    // 가격 헤더 업데이트
    const priceEl = document.getElementById('live-price-header');
    if (priceEl) {
      priceEl.innerHTML = `
        <span style="font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace">$${curPrice.toFixed(2)}</span>
        <span style="font-size:13px;font-family:'JetBrains Mono',monospace;color:${chgC};margin-left:8px">${sign}$${Math.abs(changeDollar).toFixed(2)} (${sign}${change.toFixed(2)}%)</span>`;
    }

    // 당일 요약
    const validCloses = closes.filter(c => c != null);
    const dayHigh = Math.max(...highs.filter(v => v != null));
    const dayLow = Math.min(...lows.filter(v => v != null));
    const totalVol = volumes.reduce((s, v) => s + (v || 0), 0);
    const summaryEl = document.getElementById('live-summary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="live-stat"><span class="live-stat-label">고가</span><span class="live-stat-val" style="color:${UP}">$${dayHigh.toFixed(2)}</span></div>
        <div class="live-stat"><span class="live-stat-label">저가</span><span class="live-stat-val" style="color:${DN}">$${dayLow.toFixed(2)}</span></div>
        <div class="live-stat"><span class="live-stat-label">거래량</span><span class="live-stat-val">${totalVol >= 1e6 ? (totalVol/1e6).toFixed(1)+'M' : totalVol >= 1e3 ? (totalVol/1e3).toFixed(0)+'K' : totalVol}</span></div>
        <div class="live-stat"><span class="live-stat-label">전일종가</span><span class="live-stat-val">$${prevClose?.toFixed(2) || '-'}</span></div>`;
    }

    // 라인 색상: 전일종가 기준
    const lineColor = curPrice >= prevClose ? UP : DN;
    const fillColor = curPrice >= prevClose ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)';

    // 가격 차트
    if (_liveChart) _liveChart.destroy();
    const canvas = document.getElementById('live-price-canvas');
    if (!canvas) return;

    _liveChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '가격',
            data: closes,
            borderColor: lineColor,
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 3,
            fill: true,
            backgroundColor: fillColor,
            tension: 0.1,
            spanGaps: true,
          },
          prevClose ? {
            label: '전일종가',
            data: Array(labels.length).fill(prevClose),
            borderColor: 'rgba(148,163,184,0.4)',
            borderWidth: 1,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
          } : null,
        ].filter(Boolean),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: showLoading ? { duration: 400 } : false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            ticks: { color: '#5c6478', font: { size: 8 }, maxTicksLimit: 6, maxRotation: 0 },
            grid: { color: '#2c3040' },
          },
          y: {
            ticks: { color: '#5c6478', font: { size: 9 }, callback: v => '$' + v.toFixed(0) },
            grid: { color: '#2c3040' },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex === 1) return `전일종가: $${prevClose?.toFixed(2)}`;
                const v = ctx.raw;
                if (v == null) return '';
                const diff = prevClose ? v - prevClose : 0;
                const pct = prevClose ? ((diff / prevClose) * 100).toFixed(2) : '0';
                return `$${v.toFixed(2)} (${diff >= 0 ? '+' : ''}${pct}%)`;
              },
            },
            backgroundColor: 'rgba(20,22,40,0.95)',
            titleColor: '#e2e4ea', bodyColor: '#a0a6b8',
            borderColor: '#3c4060', borderWidth: 1, padding: 10,
          },
        },
      },
      plugins: [_crosshairPlugin],
    });

    // 거래량 차트
    if (_liveVolumeChart) _liveVolumeChart.destroy();
    const volCanvas = document.getElementById('live-volume-canvas');
    if (!volCanvas) return;
    const volColors = closes.map((c, i) => {
      if (i === 0 || c == null) return 'rgba(148,163,184,0.4)';
      const prev = closes[i-1] != null ? closes[i-1] : prevClose;
      return c >= prev ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)';
    });
    _liveVolumeChart = new Chart(volCanvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: volumes, backgroundColor: volColors, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: showLoading ? { duration: 400 } : false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: '#5c6478', font: { size: 8 }, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: '#5c6478', font: { size: 8 }, callback: v => v >= 1e6 ? (v/1e6).toFixed(0)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v }, grid: { color: '#2c3040' } },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
      plugins: [_crosshairPlugin],
    });

    // 자동 갱신 시작
    _startLiveRefresh(sym);

    // swingData도 업데이트 (실시간 가격 반영)
    if (_swingData[sym]) {
      _swingData[sym].price = curPrice;
      _swingData[sym].change = parseFloat(change.toFixed(2));
    }

  } catch (e) {
    console.warn('[live-chart]', e);
    const statusEl = document.getElementById('live-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--diet-bad);font-size:10px">데이터 로드 실패 — 프록시 재시도 중...</span>';
  }
}

// ================================================================
// M7 Swing Judge — Contrarian Swing Trading
// ================================================================

// ── 기술적 지표 계산 ──

function _calcBB(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = sma + mult * std;
  const lower = sma - mult * std;
  const price = closes[closes.length - 1];
  const position = upper !== lower ? (price - lower) / (upper - lower) : 0.5;
  return { sma, upper, lower, position, price };
}

function _calcStochastic(highs, lows, closes, kPeriod = 14, kSmooth = 3, dSmooth = 3) {
  if (closes.length < kPeriod + kSmooth + dSmooth - 2) return null;
  // Raw %K values
  const rawKs = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const hSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lSlice = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...hSlice);
    const ll = Math.min(...lSlice);
    rawKs.push(hh !== ll ? ((closes[i] - ll) / (hh - ll)) * 100 : 50);
  }
  // Slow %K = SMA(rawK, kSmooth)
  const slowKs = [];
  for (let i = kSmooth - 1; i < rawKs.length; i++) {
    const s = rawKs.slice(i - kSmooth + 1, i + 1);
    slowKs.push(s.reduce((a, b) => a + b, 0) / kSmooth);
  }
  // %D = SMA(slowK, dSmooth)
  const ds = [];
  for (let i = dSmooth - 1; i < slowKs.length; i++) {
    const s = slowKs.slice(i - dSmooth + 1, i + 1);
    ds.push(s.reduce((a, b) => a + b, 0) / dSmooth);
  }
  if (slowKs.length < 2 || ds.length < 2) return null;
  const k = slowKs[slowKs.length - 1];
  const d = ds[ds.length - 1];
  const prevK = slowKs[slowKs.length - 2];
  const prevD = ds.length >= 2 ? ds[ds.length - 2] : d;
  const goldenCross = prevK < prevD && k >= d;
  const deadCross = prevK > prevD && k <= d;
  return { k: parseFloat(k.toFixed(1)), d: parseFloat(d.toFixed(1)), goldenCross, deadCross };
}

// ── 개별 신호 판단 ──

function _rsiSignal(rsi) {
  if (rsi == null) return { signal: 'NEUTRAL', dir: 'N', val: '-' };
  let signal, dir;
  if (rsi <= 30) { signal = 'STRONGLY BUY'; dir = 'B'; }
  else if (rsi <= 37) { signal = 'BUY'; dir = 'B'; }
  else if (rsi <= 44) { signal = 'NEUTRAL'; dir = 'N'; }
  else if (rsi <= 54) { signal = 'SELL'; dir = 'S'; }
  else { signal = 'STRONGLY SELL'; dir = 'S'; }
  return { signal, dir, val: rsi };
}

function _bbSignal(closes, bb) {
  if (!bb) return { signal: 'NEUTRAL', dir: 'N', val: '-', status: '-' };
  const price = bb.price;
  const pos = bb.position;
  // 최근 3거래일 내 Lower 이탈 후 복귀 체크
  const recent3 = closes.slice(-4, -1); // 최근 3거래일 (오늘 제외)
  const hadLowerBreak = recent3.some(c => c < bb.lower);
  const hadUpperBreak = recent3.some(c => c > bb.upper);
  let signal, dir, status;
  if (hadLowerBreak && price > bb.lower) {
    signal = 'STRONGLY BUY'; dir = 'B'; status = 'Lower 이탈→복귀';
  } else if (price < bb.lower) {
    signal = 'BUY'; dir = 'B'; status = 'Lower 이탈';
  } else if (hadUpperBreak && price < bb.upper) {
    signal = 'STRONGLY SELL'; dir = 'S'; status = 'Upper 이탈→하향';
  } else if (price > bb.upper) {
    signal = 'STRONGLY SELL'; dir = 'S'; status = 'Upper 돌파';
  } else if (pos >= 0.75) {
    signal = 'SELL'; dir = 'S'; status = '상위 25%';
  } else if (pos <= 0.25) {
    signal = 'NEUTRAL'; dir = 'N'; status = '하위 25%';
  } else {
    signal = 'NEUTRAL'; dir = 'N'; status = '밴드 중심';
  }
  return { signal, dir, val: (pos * 100).toFixed(0) + '%', status };
}

function _stochSignal(stoch) {
  if (!stoch) return { signal: 'NEUTRAL', dir: 'N', val: '-', cross: '' };
  const { k, d, goldenCross, deadCross } = stoch;
  let signal, dir, cross = '';
  if (k <= 20 && goldenCross) {
    signal = 'STRONGLY BUY'; dir = 'B'; cross = '골든크로스';
  } else if (k < 20) {
    signal = 'BUY'; dir = 'B';
  } else if (k >= 65 && deadCross) {
    signal = 'STRONGLY SELL'; dir = 'S'; cross = '데드크로스';
  } else if (k > 65) {
    signal = 'SELL'; dir = 'S';
  } else {
    signal = 'NEUTRAL'; dir = 'N';
  }
  return { signal, dir, val: `%K=${k} %D=${d}`, cross };
}

// ── 합의 모델 ──

function _consensus(rsiSig, bbSig, stochSig) {
  const dirs = [rsiSig.dir, bbSig.dir, stochSig.dir];
  const bCount = dirs.filter(d => d === 'B').length;
  const sCount = dirs.filter(d => d === 'S').length;
  const hasConflict = bCount > 0 && sCount > 0;

  let consensus, action;
  if (hasConflict) {
    consensus = 'NEUTRAL'; action = '관망';
  } else if (bCount === 3) {
    // 강도 보정
    const strongBuys = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY BUY').length;
    consensus = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
    action = strongBuys >= 2 ? '즉시 진입' : '진입';
  } else if (bCount === 2 && sCount === 0) {
    const strongBuys = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY BUY').length;
    consensus = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
    action = strongBuys >= 2 ? '즉시 진입' : '진입';
  } else if (sCount === 3) {
    const strongSells = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY SELL').length;
    consensus = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else if (sCount === 2 && bCount === 0) {
    const strongSells = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY SELL').length;
    consensus = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else {
    consensus = 'NEUTRAL'; action = '관망';
  }

  const summary = dirs.join('+');
  return { consensus, action, summary, bCount, sCount };
}

// ── 데이터 로드 ──

async function _loadSwingData() {
  const now = Date.now();
  const lastTime = parseInt(localStorage.getItem(_SWING_CACHE_TIME) || '0');
  if ((now - lastTime) < 5 * 60000) {
    try {
      const cached = JSON.parse(localStorage.getItem(_SWING_CACHE_KEY));
      if (cached && Object.keys(cached).length >= 7) { _swingData = cached; return; }
    } catch {}
  }

  const el = document.getElementById('fin-swing-judge');
  if (el) el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;text-align:center">M7 데이터 로딩 중...</div>';

  for (const t of M7) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t.sym}?range=1y&interval=1d`;
      const data = await _proxyFetch(url);
      const r = data?.chart?.result?.[0];
      if (!r) continue;
      const q = r.indicators?.quote?.[0] || {};
      const meta = r.meta;
      const curPrice = meta.regularMarketPrice;
      const allCloses = (q.close || []).filter(v => v != null);
      // 전일 종가 = closes 배열의 끝에서 두 번째 값
      const prevDayClose = allCloses.length >= 2 ? allCloses[allCloses.length - 2] : curPrice;
      _swingData[t.sym] = {
        opens: (q.open || []).filter(v => v != null),
        highs: (q.high || []).filter(v => v != null),
        lows: (q.low || []).filter(v => v != null),
        closes: allCloses,
        volumes: (q.volume || []).filter(v => v != null),
        price: curPrice,
        change: prevDayClose > 0 ? parseFloat(((curPrice - prevDayClose) / prevDayClose * 100).toFixed(2)) : 0,
      };
    } catch (e) {
      console.warn(`[swing] ${t.sym} failed:`, e.message);
    }
  }

  localStorage.setItem(_SWING_CACHE_KEY, JSON.stringify(_swingData));
  localStorage.setItem(_SWING_CACHE_TIME, String(now));
}

// ── 포지션 관리 (CRUD) ──

function _getSwingPositions() {
  try { return JSON.parse(localStorage.getItem(_SWING_POS_KEY)) || {}; } catch { return {}; }
}
function _saveSwingPositions(pos) {
  localStorage.setItem(_SWING_POS_KEY, JSON.stringify(pos));
}

export function openSwingBuy(sym) {
  const priceStr = prompt(`${sym} 매수 단가 (USD):`);
  if (priceStr === null || priceStr === '') return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { alert('유효한 가격을 입력하세요'); return; }
  const sharesStr = prompt(`${sym} 매수 수량 (주):`);
  if (sharesStr === null || sharesStr === '') return;
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) { alert('유효한 수량을 입력하세요'); return; }
  const pos = _getSwingPositions();
  pos[sym] = { buyPrice: price, shares, buyDate: new Date().toISOString().slice(0, 10), amount: price * shares };
  _saveSwingPositions(pos);
  _renderStockList(); _renderPortfolioSummary();
}

export function editSwingPosition(sym) {
  const pos = _getSwingPositions();
  const cur = pos[sym];
  if (!cur) return;
  const priceStr = prompt(`${sym} 매수 단가 수정 (USD):`, cur.buyPrice);
  if (priceStr === null) return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { alert('유효한 가격을 입력하세요'); return; }
  const sharesStr = prompt(`${sym} 매수 수량 수정 (주):`, cur.shares);
  if (sharesStr === null) return;
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) { alert('유효한 수량을 입력하세요'); return; }
  const dateStr = prompt(`${sym} 매수 날짜 수정:`, cur.buyDate);
  if (dateStr === null) return;
  pos[sym] = { buyPrice: price, shares, buyDate: dateStr || cur.buyDate, amount: price * shares };
  _saveSwingPositions(pos);
  _renderStockList(); _renderPortfolioSummary();
}

export function closeSwingPosition(sym) {
  if (!confirm(`${sym} 포지션을 매도 완료 처리할까요?`)) return;
  const pos = _getSwingPositions();
  delete pos[sym];
  _saveSwingPositions(pos);
  _renderStockList(); _renderPortfolioSummary();
}

// ── 신호 색상/배지 ──

function _signalBadge(signal) {
  // 한국식: BUY=빨강(매수세), SELL=파랑(매도세), NEUTRAL=회색
  const colors = {
    'STRONGLY BUY': { bg: '#4c0519', color: '#fca5a5', text: 'S.BUY' },
    'BUY': { bg: '#4c0519', color: '#f87171', text: 'BUY' },
    'NEUTRAL': { bg: '#1e293b', color: '#94a3b8', text: 'HOLD' },
    'SELL': { bg: '#172554', color: '#93c5fd', text: 'SELL' },
    'STRONGLY SELL': { bg: '#172554', color: '#60a5fa', text: 'S.SELL' },
  };
  const c = colors[signal] || colors['NEUTRAL'];
  return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;background:${c.bg};color:${c.color};white-space:nowrap">${c.text}</span>`;
}

function _dirBadge(dir) {
  // B=빨강, S=파랑, N=회색
  const m = { B: { bg: '#4c0519', c: '#f87171' }, S: { bg: '#172554', c: '#60a5fa' }, N: { bg: '#1e293b', c: '#94a3b8' } };
  const d = m[dir] || m.N;
  return `<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;background:${d.bg};color:${d.c}">${dir}</span>`;
}

// ── 렌더 ──

function _renderSwingJudge() {
  const el = document.getElementById('fin-swing-judge');
  if (!el) return;
  if (Object.keys(_swingData).length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const positions = _getSwingPositions();
  // 주가색상: 상승=빨강, 하락=파랑 (한국식)
  const UP = '#ef4444';
  const DN = '#3b82f6';
  const _chgColor = v => v > 0 ? UP : v < 0 ? DN : 'var(--muted)';

  // 각 종목별 지표 계산
  const results = M7.map(t => {
    const d = _swingData[t.sym];
    if (!d || !d.closes.length) return { sym: t.sym, name: t.name, noData: true };
    const rsi = _calcRSI(d.closes, 14);
    const bb = _calcBB(d.closes, 20, 2);
    const stoch = _calcStochastic(d.highs, d.lows, d.closes, 14, 3, 3);
    const rsiSig = _rsiSignal(rsi);
    const bbSig = _bbSignal(d.closes, bb);
    const stochSig = _stochSignal(stoch);
    const con = _consensus(rsiSig, bbSig, stochSig);
    return { sym: t.sym, name: t.name, price: d.price, change: d.change, rsiSig, bbSig, stochSig, con, stoch };
  });

  // 테이블 빌드
  let html = `<table style="width:100%;border-collapse:collapse;font-size:10px;min-width:${M7.length * 95}px">`;

  // 헤더: 종목명
  html += `<thead><tr><th style="text-align:left;padding:6px 4px;color:var(--muted);font-size:9px;border-bottom:1px solid var(--border);min-width:70px"></th>`;
  results.forEach(r => {
    html += `<th style="text-align:center;padding:6px 3px;border-bottom:1px solid var(--border);min-width:85px">
      <div style="font-size:11px;font-weight:700;color:var(--text)">${r.sym}</div>
      <div style="font-size:9px;color:var(--muted)">${r.name}</div>
      ${r.price ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">$${r.price.toFixed(2)}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${_chgColor(r.change)}">${r.change > 0 ? '+' : ''}${r.change.toFixed(2)}%</div>` : ''}
    </th>`;
  });
  html += `</tr></thead><tbody>`;

  // 행 1: 종합 판정
  html += `<tr style="background:var(--surface2)"><td style="padding:6px 4px;font-weight:700;color:var(--muted2)">종합</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:6px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:6px 3px">
      ${_signalBadge(r.con.consensus)}
      <div style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--muted)">${r.con.summary}</div>
      <div style="font-size:9px;font-weight:600;color:var(--muted2);margin-top:2px">${r.con.action}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 2: RSI(14)
  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">RSI(14)</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.rsiSig.val}</div>
      <div style="margin-top:2px">${_dirBadge(r.rsiSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 3: BB(20,2)
  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;color:var(--muted2)">BB(20,2)</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.bbSig.val}</div>
      <div style="font-size:8px;color:var(--muted);margin-top:1px">${r.bbSig.status}</div>
      <div style="margin-top:2px">${_dirBadge(r.bbSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 4: Stoch(14,3,3)
  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">Stoch(14,3)</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text)">${r.stochSig.val}</div>
      ${r.stochSig.cross ? `<div style="font-size:8px;color:${r.stochSig.dir === 'B' ? UP : DN};font-weight:700">${r.stochSig.cross}</div>` : ''}
      <div style="margin-top:2px">${_dirBadge(r.stochSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 5: 포지션 / 매매 버튼
  html += `<tr style="background:var(--surface2);border-top:2px solid var(--border)"><td style="padding:6px 4px;font-weight:700;color:var(--muted2)">포지션</td>`;
  results.forEach(r => {
    const pos = positions[r.sym];
    if (pos) {
      const curPrice = r.price || 0;
      const pnl = (curPrice - pos.buyPrice) * pos.shares;
      const pnlPct = pos.buyPrice > 0 ? ((curPrice - pos.buyPrice) / pos.buyPrice * 100) : 0;
      const pnlColor = pnl >= 0 ? UP : DN;
      const pnlSign = pnl >= 0 ? '+' : '';
      const curValUsd = curPrice * pos.shares;
      const curValKrw = curValUsd * _fxRate;
      const pnlKrw = pnl * _fxRate;
      html += `<td style="text-align:center;padding:6px 3px">
        <div style="font-size:8px;color:var(--muted)">${pos.buyDate}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text)">${pos.shares}주 · $${pos.buyPrice}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:${pnlColor};margin-top:2px">
          ${pnlSign}$${Math.abs(pnl).toFixed(0)} (${pnlSign}${pnlPct.toFixed(1)}%)
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:${pnlColor}">
          ${pnlSign}₩${Math.abs(pnlKrw).toLocaleString('ko-KR', {maximumFractionDigits:0})}
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--muted);margin-top:1px">
          평가: $${curValUsd.toFixed(0)} · ₩${curValKrw.toLocaleString('ko-KR', {maximumFractionDigits:0})}
        </div>
        <div style="display:flex;gap:3px;justify-content:center;margin-top:4px">
          <button onclick="editSwingPosition('${r.sym}')" style="font-size:8px;padding:2px 5px;background:var(--surface3);color:var(--muted2);border:1px solid var(--border);border-radius:4px;cursor:pointer">수정</button>
          <button onclick="closeSwingPosition('${r.sym}')" style="font-size:8px;padding:2px 5px;background:#1e3a5f;color:#93c5fd;border:1px solid #1e40af;border-radius:4px;cursor:pointer">매도</button>
        </div>
      </td>`;
    } else {
      html += `<td style="text-align:center;padding:6px 3px">
        <button onclick="openSwingBuy('${r.sym}')" style="font-size:9px;padding:3px 8px;background:#4c0519;color:#fca5a5;border:1px solid #881337;border-radius:4px;cursor:pointer">매수 실행</button>
      </td>`;
    }
  });
  html += `</tr>`;

  html += `</tbody></table>`;
  html += `<div style="font-size:8px;color:var(--muted);text-align:right;margin-top:4px;padding-right:4px">Contrarian Swing · USD/KRW ${_fxRate.toLocaleString()} · ${new Date().toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>`;
  el.innerHTML = html;
}

// ================================================================
// M7 Pullback Judge — 상승추세 눌림목 전략
// ================================================================

function _calcSMA(arr, period) {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

// ── 추세 게이트 ──
function _trendGate(closes) {
  const sma50 = _calcSMA(closes, 50);
  const sma200 = _calcSMA(closes, 200);
  if (sma50 == null || sma200 == null) return { active: false, sma50: null, sma200: null, reason: '데이터 부족', strength: 'none' };
  const diff = (sma50 - sma200) / sma200 * 100;
  // 추세 강도: strong(5%+), moderate(3-5%), weak(0-3%), none(역배열)
  let strength;
  if (diff >= 5) strength = 'strong';
  else if (diff >= 3) strength = 'moderate';
  else if (diff > 0) strength = 'weak';
  else strength = 'none';
  return { active: sma50 > sma200, sma50, sma200, diff, near: Math.abs(diff) <= 1, strength };
}

// ── 20SMA 대비 가격 위치 ──
function _pbPriceSignal(closes) {
  const sma20 = _calcSMA(closes, 20);
  if (sma20 == null) return { signal: 'NEUTRAL', dir: 'N', val: '-' };
  const price = closes[closes.length - 1];
  const gap = ((price - sma20) / sma20) * 100;
  let signal, dir;
  if (gap < -3) { signal = 'STRONGLY BUY'; dir = 'B'; }
  else if (gap < 0) { signal = 'BUY'; dir = 'B'; }
  else if (gap <= 2) { signal = 'NEUTRAL'; dir = 'N'; }
  else if (gap <= 5) { signal = 'SELL'; dir = 'S'; }
  else { signal = 'STRONGLY SELL'; dir = 'S'; }
  return { signal, dir, val: (gap >= 0 ? '+' : '') + gap.toFixed(1) + '%', sma20 };
}

// ── RSI(14) 풀백용 ──
function _pbRsiSignal(rsi) {
  if (rsi == null) return { signal: 'NEUTRAL', dir: 'N', val: '-' };
  let signal, dir;
  if (rsi <= 35) { signal = 'STRONGLY BUY'; dir = 'B'; }
  else if (rsi <= 44) { signal = 'BUY'; dir = 'B'; }
  else if (rsi <= 54) { signal = 'NEUTRAL'; dir = 'N'; }
  else if (rsi <= 64) { signal = 'SELL'; dir = 'S'; }
  else { signal = 'STRONGLY SELL'; dir = 'S'; }
  return { signal, dir, val: rsi };
}

// ── 거래량 추세 ──
function _pbVolumeSignal(volumes, closes) {
  if (volumes.length < 20) return { signal: 'NEUTRAL', dir: 'N', val: '-', ratio: null };
  const avg5 = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const avg20 = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
  const ratio = avg20 > 0 ? avg5 / avg20 : 1;
  let signal, dir;
  if (ratio <= 0.7) { signal = 'STRONGLY BUY'; dir = 'B'; }
  else if (ratio <= 0.9) { signal = 'BUY'; dir = 'B'; }
  else if (ratio <= 1.1) { signal = 'NEUTRAL'; dir = 'N'; }
  else if (ratio <= 1.4) { signal = 'SELL'; dir = 'S'; }
  else { signal = 'STRONGLY SELL'; dir = 'S'; }
  return { signal, dir, val: ratio.toFixed(2), ratio };
}

// ── 하락 속도 감지 ──
function _pbDropSpeed(closes) {
  if (closes.length < 6) return { fast: false, drop5d: 0, val: '-' };
  const now = closes[closes.length - 1];
  const ago5 = closes[closes.length - 6];
  const drop5d = ((now - ago5) / ago5) * 100;
  return { fast: drop5d <= -7, drop5d, val: (drop5d >= 0 ? '+' : '') + drop5d.toFixed(1) + '%' };
}

// ── 풀백 합의 모델 (개선) ──
function _pbConsensus(priceSig, rsiSig, volSig, gate, dropSpeed) {
  const dirs = [priceSig.dir, rsiSig.dir, volSig.dir];
  const bCount = dirs.filter(d => d === 'B').length;
  const sCount = dirs.filter(d => d === 'S').length;
  const summary = dirs.join('+');

  let consensus, action;

  // 급락 시 → 관망 (눌림목이 아닌 급락)
  if (dropSpeed.fast) {
    return { consensus: 'NEUTRAL', action: '관망 (급락감지)', summary, bCount, sCount };
  }

  const weakTrend = gate.strength === 'weak'; // diff 0~3%
  const hasConflict = bCount > 0 && sCount > 0;

  if (hasConflict) {
    consensus = 'NEUTRAL'; action = '관망';
  } else if (bCount === 3) {
    const strongBuys = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY BUY').length;
    if (weakTrend) {
      consensus = 'BUY'; action = '소량 진입 (추세 약)';
    } else {
      consensus = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
      action = strongBuys >= 2 ? '즉시 진입' : '진입';
    }
  } else if (bCount === 2 && sCount === 0) {
    if (weakTrend) {
      consensus = 'NEUTRAL'; action = '관망 (추세 약)';
    } else {
      const strongBuys = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY BUY').length;
      consensus = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
      action = strongBuys >= 2 ? '즉시 진입' : '진입';
    }
  } else if (sCount === 3) {
    const strongSells = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY SELL').length;
    consensus = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else if (sCount === 2 && bCount === 0) {
    const strongSells = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY SELL').length;
    consensus = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else {
    consensus = 'NEUTRAL'; action = '관망';
  }

  return { consensus, action, summary, bCount, sCount };
}

// ── 포지션 관리 (Pullback) ──
function _getPbPositions() {
  try { return JSON.parse(localStorage.getItem(_PB_POS_KEY)) || {}; } catch { return {}; }
}
function _savePbPositions(pos) {
  localStorage.setItem(_PB_POS_KEY, JSON.stringify(pos));
}

export function openPbBuy(sym) {
  const priceStr = prompt(`[Pullback] ${sym} 매수 단가 (USD):`);
  if (priceStr === null || priceStr === '') return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { alert('유효한 가격을 입력하세요'); return; }
  const sharesStr = prompt(`[Pullback] ${sym} 매수 수량 (주):`);
  if (sharesStr === null || sharesStr === '') return;
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) { alert('유효한 수량을 입력하세요'); return; }
  const pos = _getPbPositions();
  pos[sym] = { buyPrice: price, shares, buyDate: new Date().toISOString().slice(0, 10), amount: price * shares };
  _savePbPositions(pos);
  _renderStockList(); _renderPortfolioSummary();
}

export function editPbPosition(sym) {
  const pos = _getPbPositions();
  const cur = pos[sym];
  if (!cur) return;
  const priceStr = prompt(`[Pullback] ${sym} 매수 단가 수정 (USD):`, cur.buyPrice);
  if (priceStr === null) return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { alert('유효한 가격을 입력하세요'); return; }
  const sharesStr = prompt(`[Pullback] ${sym} 매수 수량 수정 (주):`, cur.shares);
  if (sharesStr === null) return;
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) { alert('유효한 수량을 입력하세요'); return; }
  const dateStr = prompt(`[Pullback] ${sym} 매수 날짜 수정:`, cur.buyDate);
  if (dateStr === null) return;
  pos[sym] = { buyPrice: price, shares, buyDate: dateStr || cur.buyDate, amount: price * shares };
  _savePbPositions(pos);
  _renderStockList(); _renderPortfolioSummary();
}

export function closePbPosition(sym) {
  if (!confirm(`[Pullback] ${sym} 포지션을 매도 완료 처리할까요?`)) return;
  const pos = _getPbPositions();
  delete pos[sym];
  _savePbPositions(pos);
  _renderStockList(); _renderPortfolioSummary();
}

// ── 렌더 ──
function _renderPullbackJudge() {
  const el = document.getElementById('fin-pullback-judge');
  if (!el) return;
  if (Object.keys(_swingData).length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const positions = _getPbPositions();
  const UP = '#ef4444';
  const DN = '#3b82f6';
  const _chgColor = v => v > 0 ? UP : v < 0 ? DN : 'var(--muted)';

  const results = M7.map(t => {
    const d = _swingData[t.sym];
    if (!d || !d.closes.length) return { sym: t.sym, name: t.name, noData: true };
    const gate = _trendGate(d.closes);
    const priceSig = _pbPriceSignal(d.closes);
    const rsi = _calcRSI(d.closes, 14);
    const rsiSig = _pbRsiSignal(rsi);
    const volSig = _pbVolumeSignal(d.volumes, d.closes);
    const dropSpeed = _pbDropSpeed(d.closes);
    let con;
    if (!gate.active && !gate.near) {
      con = { consensus: 'OFF', action: '비활성 (전략A 검토)', summary: '-', bCount: 0, sCount: 0 };
    } else {
      con = _pbConsensus(priceSig, rsiSig, volSig, gate, dropSpeed);
      if (gate.near && !con.action.includes('추세')) con.action += ' (추세 경계)';
    }
    return { sym: t.sym, name: t.name, price: d.price, change: d.change, gate, priceSig, rsiSig, volSig, dropSpeed, con };
  });

  let html = `<table style="width:100%;border-collapse:collapse;font-size:10px;min-width:${M7.length * 95}px">`;

  // 헤더
  html += `<thead><tr><th style="text-align:left;padding:6px 4px;color:var(--muted);font-size:9px;border-bottom:1px solid var(--border);min-width:70px"></th>`;
  results.forEach(r => {
    html += `<th style="text-align:center;padding:6px 3px;border-bottom:1px solid var(--border);min-width:85px">
      <div style="font-size:11px;font-weight:700;color:var(--text)">${r.sym}</div>
      <div style="font-size:9px;color:var(--muted)">${r.name}</div>
      ${r.price ? `<div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">$${r.price.toFixed(2)}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:${_chgColor(r.change)}">${r.change > 0 ? '+' : ''}${r.change.toFixed(2)}%</div>` : ''}
    </th>`;
  });
  html += `</tr></thead><tbody>`;

  // 행 1: 추세 게이트
  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;font-weight:700;color:var(--muted2)">추세 게이트</td>`;
  results.forEach(r => {
    if (r.noData || !r.gate) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    const g = r.gate;
    let gateColor, gateText;
    if (!g.active && !g.near) { gateColor = '#ef4444'; gateText = 'OFF'; }
    else if (g.near) { gateColor = '#f59e0b'; gateText = '경계'; }
    else if (g.strength === 'weak') { gateColor = '#f59e0b'; gateText = 'ON 약'; }
    else if (g.strength === 'moderate') { gateColor = '#10b981'; gateText = 'ON'; }
    else { gateColor = '#10b981'; gateText = 'ON 강'; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-size:10px;font-weight:700;color:${gateColor}">${gateText}</div>
      ${g.sma50 ? `<div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--muted)">50: ${g.sma50.toFixed(0)} · 200: ${g.sma200.toFixed(0)}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:${gateColor}">${g.diff >= 0 ? '+' : ''}${g.diff.toFixed(1)}%</div>` : ''}
    </td>`;
  });
  html += `</tr>`;

  // 행 2: 종합 판정
  html += `<tr><td style="padding:6px 4px;font-weight:700;color:var(--muted2)">종합</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:6px 3px;color:var(--muted)">-</td>`; return; }
    if (r.con.consensus === 'OFF') {
      html += `<td style="text-align:center;padding:6px 3px">
        <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;background:#1e293b;color:#64748b">OFF</span>
        <div style="font-size:8px;color:var(--muted);margin-top:2px">전략A 참고</div>
      </td>`;
      return;
    }
    html += `<td style="text-align:center;padding:6px 3px">
      ${_signalBadge(r.con.consensus)}
      <div style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--muted)">${r.con.summary}</div>
      <div style="font-size:9px;font-weight:600;color:var(--muted2);margin-top:2px">${r.con.action}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 3: 20SMA 위치
  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;color:var(--muted2)">20SMA 이격</td>`;
  results.forEach(r => {
    if (r.noData || !r.priceSig) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.priceSig.val}</div>
      <div style="margin-top:2px">${_dirBadge(r.priceSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 4: RSI(14)
  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">RSI(14)</td>`;
  results.forEach(r => {
    if (r.noData || !r.rsiSig) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.rsiSig.val}</div>
      <div style="margin-top:2px">${_dirBadge(r.rsiSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 5: 거래량 추세
  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;color:var(--muted2)">거래량 추세</td>`;
  results.forEach(r => {
    if (r.noData || !r.volSig) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.volSig.val}</div>
      <div style="margin-top:2px">${_dirBadge(r.volSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  // 행 6: 5일 하락속도
  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">5일 변화</td>`;
  results.forEach(r => {
    if (r.noData || !r.dropSpeed) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    const ds = r.dropSpeed;
    const dsColor = ds.fast ? '#ef4444' : ds.drop5d < -3 ? '#f59e0b' : 'var(--muted)';
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${dsColor};font-weight:${ds.fast ? '700' : '400'}">${ds.val}</div>
      ${ds.fast ? '<div style="font-size:8px;color:#ef4444;margin-top:1px">⚠ 급락</div>' : ''}
    </td>`;
  });
  html += `</tr>`;

  // 행 7: 포지션
  html += `<tr style="border-top:2px solid var(--border)"><td style="padding:6px 4px;font-weight:700;color:var(--muted2)">포지션</td>`;
  results.forEach(r => {
    const pos = positions[r.sym];
    if (pos) {
      const curPrice = r.price || 0;
      const pnl = (curPrice - pos.buyPrice) * pos.shares;
      const pnlPct = pos.buyPrice > 0 ? ((curPrice - pos.buyPrice) / pos.buyPrice * 100) : 0;
      const pnlColor = pnl >= 0 ? UP : DN;
      const pnlSign = pnl >= 0 ? '+' : '';
      const curValUsd = curPrice * pos.shares;
      const curValKrw = curValUsd * _fxRate;
      const pnlKrw = pnl * _fxRate;
      html += `<td style="text-align:center;padding:6px 3px">
        <div style="font-size:8px;color:var(--muted)">${pos.buyDate}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text)">${pos.shares}주 · $${pos.buyPrice}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;color:${pnlColor};margin-top:2px">
          ${pnlSign}$${Math.abs(pnl).toFixed(0)} (${pnlSign}${pnlPct.toFixed(1)}%)
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:${pnlColor}">
          ${pnlSign}₩${Math.abs(pnlKrw).toLocaleString('ko-KR', {maximumFractionDigits:0})}
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--muted);margin-top:1px">
          평가: $${curValUsd.toFixed(0)} · ₩${curValKrw.toLocaleString('ko-KR', {maximumFractionDigits:0})}
        </div>
        <div style="display:flex;gap:3px;justify-content:center;margin-top:4px">
          <button onclick="editPbPosition('${r.sym}')" style="font-size:8px;padding:2px 5px;background:var(--surface3);color:var(--muted2);border:1px solid var(--border);border-radius:4px;cursor:pointer">수정</button>
          <button onclick="closePbPosition('${r.sym}')" style="font-size:8px;padding:2px 5px;background:#1e3a5f;color:#93c5fd;border:1px solid #1e40af;border-radius:4px;cursor:pointer">매도</button>
        </div>
      </td>`;
    } else {
      html += `<td style="text-align:center;padding:6px 3px">
        <button onclick="openPbBuy('${r.sym}')" style="font-size:9px;padding:3px 8px;background:#4c0519;color:#fca5a5;border:1px solid #881337;border-radius:4px;cursor:pointer">매수 실행</button>
      </td>`;
    }
  });
  html += `</tr>`;

  html += `</tbody></table>`;
  html += `<div style="font-size:8px;color:var(--muted);text-align:right;margin-top:4px;padding-right:4px">Pullback · 50SMA>200SMA 전제 · USD/KRW ${_fxRate.toLocaleString()} · ${new Date().toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>`;
  el.innerHTML = html;
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
    const hasInflation = (b.inflationRate || 0) > 0;
    return `
    <div class="fin-bench-card">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">${b.name || '벤치마크'}</span>
        <span class="fin-bench-meta">초기 ${formatManwon(b.initialPrincipal)} · ${b.annualRate}% · ${formatManwon(b.annualContribution)}/yr → ${formatManwon(last.closeBalance)}${hasInflation ? ` (실질 ${formatManwon(last.realCloseBalance)})` : ''}</span>
      </div>
      <div class="fin-bench-detail" style="display:none">
        <div style="font-size:10px;color:var(--muted);margin:6px 0">초기 ${formatManwon(b.initialPrincipal)}에 연 ${b.annualRate}% 복리, 매년 연말 ${formatManwon(b.annualContribution)} 납입${hasInflation ? `, 물가상승률 ${b.inflationRate}%` : ''} 가정</div>
        <div style="overflow-x:auto">
        <table class="fin-proj-table">
          <thead><tr><th>연차</th><th>나이</th><th>기초 잔액</th><th>연간 이자 (${b.annualRate}%)</th><th>기말 납입금</th><th>기말 잔액 (명목)</th>${hasInflation ? `<th>기말 잔액 (실질)</th>` : ''}</tr></thead>
          <tbody>${proj.map(r => `<tr>
            <td>${r.year}년 말</td>
            <td>${r.age}살</td>
            <td>${formatManwon(r.openBalance)}</td>
            <td>${formatManwon(r.interest)}</td>
            <td>${formatManwon(r.contribution)}</td>
            <td style="font-weight:600">${formatManwon(r.closeBalance)}</td>
            ${hasInflation ? `<td style="font-weight:600;color:var(--muted2)">${formatManwon(r.realCloseBalance)}</td>` : ''}
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
    const latest = actuals[actuals.length - 1];
    listEl.innerHTML = `
    <div class="fin-bench-card" style="border-left-color:#10b981">
      <div class="fin-bench-summary" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <span class="fin-bench-name">📋 연간 실적</span>
        <span class="fin-bench-meta">${actuals.length}건 · 최근 ${latest.year}년 (${getAge(latest.year)}살) ${formatManwon(latest.cumulativeSaved)}</span>
      </div>
      <div style="display:none">
        <div style="overflow-x:auto">
        <table class="fin-table" style="margin-top:6px">
          <thead><tr><th>연도</th><th>나이</th><th>누적 저축/투자</th><th>순자산</th><th>비상금</th><th>Inflow</th><th>고정지출</th><th>가처분여력</th><th>월환산</th><th></th></tr></thead>
          <tbody>${actuals.map(a => {
            const em = calcEmergencyMonths(a.emergencyFund, a.monthlyExpense);
            const discretionary = (a.inflow || 0) - (a.fOutflow || 0);
            const monthlyDisc = discretionary > 0 ? Math.round(discretionary / 12) : null;
            const hasFlow = a.inflow || a.fOutflow;
            return `<tr>
              <td>${a.year}</td>
              <td>${getAge(a.year)}살</td>
              <td class="num">${formatManwon(a.cumulativeSaved)}</td>
              <td class="num">${a.netWorth ? formatManwon(a.netWorth) : '-'}</td>
              <td class="num">${a.emergencyFund ? formatManwon(a.emergencyFund) + (em != null ? ` (${em}개월)` : '') : '-'}</td>
              <td class="num">${a.inflow ? formatManwon(a.inflow) : '-'}</td>
              <td class="num">${a.fOutflow ? formatManwon(a.fOutflow) : '-'}</td>
              <td class="num ${hasFlow ? (discretionary < 0 ? 'neg' : '') : ''}">${hasFlow ? formatManwon(discretionary) : '-'}</td>
              <td class="num">${monthlyDisc != null ? formatManwon(monthlyDisc) + '/월' : '-'}</td>
              <td class="action-cell"><button class="edit-btn" onclick="openFinActualModal('${a.id}')">✏️</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
        </div>
      </div>
    </div>`;
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

  // 총 자산을 원화로 환산 (USD 포지션 합계 × 환율 → 만원)
  const totalAssetsKRW = Math.round(totalAssets * _fxRate / 10000);
  el.innerHTML = `<div class="fin-networth-row">
    <div class="fin-nw-card"><div class="fin-nw-label">총 자산</div><div class="fin-nw-val">${formatManwon(totalAssetsKRW)}</div><div style="font-size:9px;color:var(--muted)">${formatUSD(totalAssets)}</div></div>
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
// 최근 5년 차트 (계획 vs 현실 비교용)
// ================================================================
function _renderRecent5Chart() {
  const canvas = document.getElementById('fin-recent5-chart');
  if (!canvas || !window.Chart) return;
  if (_recent5ChartInstance) _recent5ChartInstance.destroy();

  const actuals = getFinActuals();
  const plans = getFinPlans();
  const benchmarks = getFinBenchmarks();
  if (benchmarks.length === 0 && actuals.length === 0 && plans.length === 0) return;

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 4; // 최근 5년
  const xLabels = [];
  for (let y = startYear; y <= currentYear; y++) xLabels.push(y);

  const benchColors = ['#f59e0b', '#3b82f6', '#a855f7', '#ec4899', '#06b6d4'];
  const planColors = ['#8b5cf6', '#d946ef', '#14b8a6', '#f97316', '#64748b'];
  const datasets = [];

  // 벤치마크
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
      datasets.push({
        label: (b.name || `벤치마크 ${i + 1}`) + (hasInflation ? ' (명목)' : ''),
        data: nomData, borderColor: color, borderDash: [5, 3], borderWidth: 2,
        pointRadius: 3, pointBackgroundColor: color, fill: false, tension: 0.3,
      });
    }
    if (hasInflation && realData.length > 0) {
      datasets.push({
        label: (b.name || `벤치마크 ${i + 1}`) + ' (실질)',
        data: realData, borderColor: color, borderDash: [2, 4], borderWidth: 1.5,
        pointRadius: 2, pointBackgroundColor: color, fill: false, tension: 0.3,
      });
    }
  });

  // 계획실적
  plans.forEach((p, i) => {
    const entries = (p.entries || []).filter(e => e.year >= startYear && e.year <= currentYear).sort((a, b) => a.year - b.year);
    const data = entries.map(e => ({ x: xLabels.indexOf(e.year), y: e.target })).filter(d => d.x >= 0);
    if (data.length > 0) {
      datasets.push({
        label: '🎯 ' + (p.name || `계획 ${i + 1}`),
        data, borderColor: planColors[i % planColors.length], borderDash: [10, 4],
        borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: planColors[i % planColors.length],
        fill: false, tension: 0.3,
      });
    }
  });

  // 현실
  const recentActuals = actuals.filter(a => a.year >= startYear && a.year <= currentYear);
  if (recentActuals.length > 0) {
    const data = recentActuals.map(a => ({ x: xLabels.indexOf(a.year), y: a.cumulativeSaved })).filter(d => d.x >= 0);
    data.sort((a, b) => a.x - b.x);
    datasets.push({
      label: '현실 (누적 저축/투자)',
      data, borderColor: '#10b981', borderWidth: 3, pointRadius: 5,
      pointBackgroundColor: '#10b981', fill: false, tension: 0.3,
    });
  }

  if (datasets.length === 0) return;

  _recent5ChartInstance = new Chart(canvas, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { left: 0, right: 4, top: 4, bottom: 0 } },
      scales: {
        x: {
          type: 'linear', min: 0, max: xLabels.length - 1,
          ticks: {
            color: '#5c6478', font: { size: 9 }, stepSize: 1,
            callback: function(value) {
              const idx = Math.round(value);
              return idx >= 0 && idx < xLabels.length ? xLabels[idx] : '';
            },
          },
          grid: { color: '#2c3040' },
        },
        y: {
          ticks: { color: '#5c6478', font: { size: 9 }, callback: v => formatManwon(v), maxTicksLimit: 6 },
          grid: { color: '#2c3040' },
        },
      },
      plugins: {
        legend: { labels: { color: '#e2e4ea', font: { size: 9 }, boxWidth: 10, padding: 6 } },
        tooltip: {
          callbacks: {
            title: ctx => {
              const idx = Math.round(ctx[0].parsed.x);
              return idx >= 0 && idx < xLabels.length ? `${xLabels[idx]}년 (${getAge(xLabels[idx])}살)` : '';
            },
            label: ctx => `${ctx.dataset.label}: ${formatManwon(ctx.parsed.y)}`,
          },
        },
        title: { display: true, text: `최근 5년 (${startYear}~${currentYear})`, color: '#e2e4ea', font: { size: 11 }, padding: { bottom: 6 } },
      },
    },
  });
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

  // 벤치마크 (명목: 점선, 실질: 점선+얇은)
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
    datasets.push({
      label: (b.name || `벤치마크 ${i + 1}`) + (hasInflation ? ' (명목)' : ''),
      data: nomData,
      borderColor: color,
      borderDash: [5, 3],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    });

    if (hasInflation) {
      realData.sort((a, b) => a.x - b.x);
      datasets.push({
        label: (b.name || `벤치마크 ${i + 1}`) + ' (실질)',
        data: realData,
        borderColor: color,
        borderDash: [2, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
        tension: 0.3,
      });
    }
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
      layout: { padding: { left: 0, right: 4, top: 4, bottom: 0 } },
      scales: {
        x: {
          type: 'linear',
          min: 0, max: xLabels.length - 1,
          ticks: {
            color: '#5c6478', font: { size: 9 },
            stepSize: 1,
            maxRotation: 45, minRotation: 0,
            callback: function(value) {
              const idx = Math.round(value);
              if (idx >= 0 && idx < xLabels.length) return xLabels[idx];
              return '';
            },
          },
          grid: { color: '#2c3040' },
        },
        y: {
          ticks: { color: '#5c6478', font: { size: 9 }, callback: v => formatManwon(v), maxTicksLimit: 6 },
          grid: { color: '#2c3040' },
        },
      },
      plugins: {
        legend: { labels: { color: '#e2e4ea', font: { size: 9 }, boxWidth: 12, padding: 8 } },
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
        title: { display: true, text: '전체 추이', color: '#e2e4ea', font: { size: 11 }, padding: { bottom: 6 } },
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
// 현금흐름 추이 차트
// ================================================================
function _renderFlowChart() {
  const canvas = document.getElementById('fin-flow-chart');
  if (!canvas || !window.Chart) return;
  if (_flowChartInstance) _flowChartInstance.destroy();

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
          barPercentage: 0.6,
        },
        {
          label: '고정지출',
          data: fixedData,
          backgroundColor: 'rgba(148, 163, 184, 0.7)',
          borderColor: '#94a3b8',
          borderWidth: 1,
          barPercentage: 0.6,
        },
        {
          label: '가처분여력',
          data: discretionaryData,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          barPercentage: 0.6,
        },
        {
          label: '월환산 가처분',
          data: monthlyDiscData,
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

  // 현금흐름 테이블
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
    document.getElementById('fin-actual-foutflow').value = a.fOutflow || 0;
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
    document.getElementById('fin-actual-foutflow').value = 0;
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
    fOutflow: parseFloat(document.getElementById('fin-actual-foutflow').value) || 0,
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

// ================================================================
// 월간 가계부 (Budget)
// ================================================================

function _getBudgetDoc(year) {
  return getFinBudgets().find(b => b.year === year);
}

function _ensureBudgetDoc(year) {
  let doc = _getBudgetDoc(year);
  if (!doc) {
    doc = { id: _id(), year, groups: [
      { name: '생활유지비', items: [
        { name: '주거비용', target: 80, qGoals: {}, months: {} },
        { name: '보험비용', target: 9, qGoals: {}, months: {} },
        { name: '통신비용', target: 5, qGoals: {}, months: {} },
        { name: '교통비용', target: 9, qGoals: {}, months: {} },
        { name: '생활비용', target: 40, qGoals: {}, months: {} },
      ]},
      { name: '자아유지비', items: [
        { name: '교육비용', target: 12, qGoals: {}, months: {} },
        { name: '카페비용', target: 8, qGoals: {}, months: {} },
        { name: '정신건강', target: 20, qGoals: {}, months: {} },
      ]},
      { name: '변동비', items: [
        { name: '헬스미용피부', target: 0, qGoals: {}, months: {} },
        { name: '대인관계1', target: 30, qGoals: {}, months: {} },
        { name: '대인관계2', target: 10, qGoals: {}, months: {} },
        { name: '와인/야식', target: 10, qGoals: {}, months: {} },
        { name: '취미/여가/의류/쇼핑/기타', target: 10, qGoals: {}, months: {} },
      ]},
    ]};
  }
  return doc;
}

function _qMonths(q) {
  const start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

const _monthNames = ['', '1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function _shortYear(y) { return String(y).slice(-2); }

function _renderBudget() {
  const ctrlEl = document.getElementById('fin-budget-controls');
  const tableEl = document.getElementById('fin-budget-table');
  if (!ctrlEl || !tableEl) return;

  // 연도 select 채우기
  const yearSel = document.getElementById('fin-budget-year');
  if (yearSel) {
    const years = new Set();
    getFinBudgets().forEach(b => years.add(b.year));
    years.add(_budgetYear);
    const sortedYears = [...years].sort();
    yearSel.innerHTML = sortedYears.map(y =>
      `<option value="${y}"${y === _budgetYear ? ' selected' : ''}>${y}</option>`
    ).join('');
  }

  // 분기 탭 채우기
  const qTabEl = document.getElementById('fin-budget-qtabs');
  if (qTabEl) {
    qTabEl.innerHTML = [1,2,3,4].map(q =>
      `<button class="fin-q-tab${q === _budgetQ ? ' active' : ''}" onclick="onBudgetQChange(${q})">${_shortYear(_budgetYear)}'${q}Q</button>`
    ).join('');
  }

  const budgetDoc = _getBudgetDoc(_budgetYear);
  if (!budgetDoc || budgetDoc.groups.length === 0) {
    tableEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:16px;text-align:center">
      가계부 데이터가 없습니다. <b>+ 그룹</b>으로 대분류를 추가하세요.
    </div>`;
    return;
  }

  // 테이블 빌드 — 항목 | 목표/월 | 월1 | 월2 | 월3 | 분기합 | 차이
  const months = _qMonths(_budgetQ);
  let html = `<div style="overflow-x:auto"><table class="fin-budget-tbl">
    <thead><tr>
      <th class="bud-name">항목</th>
      <th class="bud-num">목표/월</th>
      <th class="bud-num">${_monthNames[months[0]]}</th>
      <th class="bud-num">${_monthNames[months[1]]}</th>
      <th class="bud-num">${_monthNames[months[2]]}</th>
      <th class="bud-num">분기합</th>
      <th class="bud-num">차이</th>
    </tr></thead><tbody>`;

  let grandTarget = 0, grandMonths = [0,0,0], grandQSum = 0;

  budgetDoc.groups.forEach((grp, gi) => {
    let grpTarget = 0, grpMonths = [0,0,0], grpQSum = 0;

    html += `<tr class="bud-group-row">
      <td colspan="7">
        <span class="bud-group-name">${grp.name}</span>
        <button class="bud-edit-grp" onclick="openBudgetGroupModal(${gi})" title="그룹 수정">✏️</button>
        <button class="bud-del-grp" onclick="deleteBudgetGroup(${gi})" title="그룹 삭제">🗑️</button>
      </td>
    </tr>`;

    (grp.items || []).forEach((item, ii) => {
      const target = item.target || 0;
      const m0 = (item.months && item.months[months[0]]) || 0;
      const m1 = (item.months && item.months[months[1]]) || 0;
      const m2 = (item.months && item.months[months[2]]) || 0;
      const qSum = m0 + m1 + m2;
      const qTarget = target * 3;
      const diff = qTarget > 0 ? qSum - qTarget : 0;

      grpTarget += target;
      grpMonths[0] += m0; grpMonths[1] += m1; grpMonths[2] += m2;
      grpQSum += qSum;

      const overBudget = qTarget > 0 && qSum > qTarget;
      const diffCls = diff > 0 ? ' bud-over' : diff < 0 ? ' bud-under' : '';

      html += `<tr class="bud-item-row">
        <td class="bud-name">
          <span>${item.name}</span>
          <button class="bud-edit-item" onclick="openBudgetItemModal(${gi},${ii})" title="수정">✏️</button>
          <button class="bud-del-item" onclick="deleteBudgetItem(${gi},${ii})" title="삭제">🗑️</button>
        </td>
        <td class="bud-num">${_fmtBudget(target)}</td>
        <td class="bud-num bud-month" onclick="editBudgetMonth(${gi},${ii},${months[0]})">${_fmtBudget(m0)}</td>
        <td class="bud-num bud-month" onclick="editBudgetMonth(${gi},${ii},${months[1]})">${_fmtBudget(m1)}</td>
        <td class="bud-num bud-month" onclick="editBudgetMonth(${gi},${ii},${months[2]})">${_fmtBudget(m2)}</td>
        <td class="bud-num">${_fmtBudget(qSum)}</td>
        <td class="bud-num${diffCls}">${diff > 0 ? '+' : ''}${diff !== 0 ? _fmtBudget(diff) : '-'}</td>
      </tr>`;
    });

    const grpQTarget = grpTarget * 3;
    const grpDiff = grpQTarget > 0 ? grpQSum - grpQTarget : 0;
    const grpOver = grpQTarget > 0 && grpQSum > grpQTarget;
    html += `<tr class="bud-sum-row">
      <td class="bud-name"><b>소계</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpTarget)}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpMonths[0])}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpMonths[1])}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpMonths[2])}</b></td>
      <td class="bud-num"><b>${_fmtBudget(grpQSum)}</b></td>
      <td class="bud-num${grpOver ? ' bud-over' : ''}"><b>${grpDiff > 0 ? '+' : ''}${grpDiff !== 0 ? _fmtBudget(grpDiff) : '-'}</b></td>
    </tr>`;

    grandTarget += grpTarget;
    grandMonths[0] += grpMonths[0]; grandMonths[1] += grpMonths[1]; grandMonths[2] += grpMonths[2];
    grandQSum += grpQSum;
  });

  const grandQTarget = grandTarget * 3;
  const grandDiff = grandQTarget > 0 ? grandQSum - grandQTarget : 0;
  const totalOver = grandQTarget > 0 && grandQSum > grandQTarget;
  html += `<tr class="bud-total-row">
    <td class="bud-name"><b>TOTAL</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandTarget)}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandMonths[0])}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandMonths[1])}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandMonths[2])}</b></td>
    <td class="bud-num"><b>${_fmtBudget(grandQSum)}</b></td>
    <td class="bud-num${totalOver ? ' bud-over' : ''}"><b>${grandDiff > 0 ? '+' : ''}${grandDiff !== 0 ? _fmtBudget(grandDiff) : '-'}</b></td>
  </tr>`;

  html += `</tbody></table></div>`;
  tableEl.innerHTML = html;
}

function _fmtBudget(v) {
  if (!v || v === 0) return '-';
  return v.toLocaleString();
}

// ── 연도/분기 변경 ──
export function onBudgetYearChange() {
  const sel = document.getElementById('fin-budget-year');
  if (sel) _budgetYear = parseInt(sel.value);
  _renderBudget();
}

export function onBudgetQChange(q) {
  _budgetQ = q;
  _renderBudget();
}

// ── 인라인 편집: 월간 실적 ──
export function editBudgetMonth(gi, ii, month) {
  const doc = _getBudgetDoc(_budgetYear);
  if (!doc) return;
  const item = doc.groups[gi]?.items[ii];
  if (!item) return;
  const cur = (item.months && item.months[month]) || 0;
  const val = prompt(`${item.name} — ${_monthNames[month]} 실적 (만원):`, cur || '');
  if (val === null) return;
  if (!item.months) item.months = {};
  item.months[month] = parseFloat(val) || 0;
  saveFinBudget(doc);
  _renderBudget();
}

// ── 인라인 편집: 분기 목표 ──
export function editBudgetQGoal(gi, ii) {
  const doc = _getBudgetDoc(_budgetYear);
  if (!doc) return;
  const item = doc.groups[gi]?.items[ii];
  if (!item) return;
  const cur = (item.qGoals && item.qGoals[_budgetQ]) || 0;
  const val = prompt(`${item.name} — ${_shortYear(_budgetYear)}'${_budgetQ}Q 목표 (만원):`, cur || '');
  if (val === null) return;
  if (!item.qGoals) item.qGoals = {};
  item.qGoals[_budgetQ] = parseFloat(val) || 0;
  saveFinBudget(doc);
  _renderBudget();
}

// ── 그룹 추가/수정 모달 ──
export function openBudgetGroupModal(gi) {
  const isEdit = gi !== undefined && gi !== null;
  let doc = _ensureBudgetDoc(_budgetYear);
  const existing = isEdit ? doc.groups[gi] : null;
  const name = prompt(isEdit ? '그룹명 수정:' : '새 그룹명 (대분류):', existing?.name || '');
  if (!name) return;
  if (isEdit) {
    doc.groups[gi].name = name;
  } else {
    // 새 그룹 추가
    if (!_getBudgetDoc(_budgetYear)) {
      // 새 문서 생성
    }
    doc.groups.push({ name, items: [] });
  }
  saveFinBudget(doc);
  _renderBudget();
}

// ── 그룹 삭제 ──
export function deleteBudgetGroup(gi) {
  const doc = _getBudgetDoc(_budgetYear);
  if (!doc) return;
  if (!confirm(`"${doc.groups[gi].name}" 그룹과 하위 항목을 모두 삭제할까요?`)) return;
  doc.groups.splice(gi, 1);
  saveFinBudget(doc);
  _renderBudget();
}

// ── 항목 추가/수정 모달 ──
export function openBudgetItemModal(gi, ii) {
  const modal = document.getElementById('fin-budget-item-modal');
  if (!modal) return;

  const doc = _ensureBudgetDoc(_budgetYear);
  const isEdit = gi !== undefined && gi !== null && ii !== undefined && ii !== null;
  const item = isEdit ? doc.groups[gi]?.items[ii] : null;

  document.getElementById('bud-item-modal-title').textContent = isEdit ? '항목 수정' : '항목 추가';
  document.getElementById('bud-item-gi').value = gi !== undefined && gi !== null ? gi : '';
  document.getElementById('bud-item-ii').value = isEdit ? ii : '';
  document.getElementById('bud-item-name').value = item?.name || '';
  document.getElementById('bud-item-target').value = item?.target || '';
  document.getElementById('bud-item-del-btn').style.display = isEdit ? '' : 'none';

  // 그룹 선택
  const grpSel = document.getElementById('bud-item-group');
  grpSel.innerHTML = doc.groups.map((g, i) =>
    `<option value="${i}"${(gi !== undefined && gi !== null && i === gi) ? ' selected' : ''}>${g.name}</option>`
  ).join('');

  modal.classList.add('open');
}

export function closeBudgetItemModal(e) {
  if (e && e.target !== document.getElementById('fin-budget-item-modal')) return;
  document.getElementById('fin-budget-item-modal')?.classList.remove('open');
}

export async function saveBudgetItemFromModal() {
  let doc = _ensureBudgetDoc(_budgetYear);
  const gi = parseInt(document.getElementById('bud-item-group').value);
  const iiStr = document.getElementById('bud-item-ii').value;
  const isEdit = iiStr !== '';
  const ii = isEdit ? parseInt(iiStr) : -1;

  const name = document.getElementById('bud-item-name').value.trim();
  if (!name) { alert('항목명을 입력하세요'); return; }
  const target = parseFloat(document.getElementById('bud-item-target').value) || 0;

  if (isEdit) {
    // 기존 그룹에서 꺼내기 (그룹이 변경될 수 있음)
    const origGi = parseInt(document.getElementById('bud-item-gi').value);
    const existingItem = doc.groups[origGi]?.items[ii];
    const itemObj = existingItem ? { ...existingItem, name, target } : { name, target, qGoals: {}, months: {} };

    if (origGi !== gi) {
      // 그룹 이동
      doc.groups[origGi].items.splice(ii, 1);
      doc.groups[gi].items.push(itemObj);
    } else {
      doc.groups[gi].items[ii] = itemObj;
    }
  } else {
    doc.groups[gi].items.push({ name, target, qGoals: {}, months: {} });
  }

  await saveFinBudget(doc);
  closeBudgetItemModal();
  _renderBudget();
}

export async function deleteBudgetItemFromModal() {
  const gi = parseInt(document.getElementById('bud-item-gi').value);
  const ii = parseInt(document.getElementById('bud-item-ii').value);
  const doc = _getBudgetDoc(_budgetYear);
  if (!doc || !confirm('이 항목을 삭제할까요?')) return;
  doc.groups[gi].items.splice(ii, 1);
  await saveFinBudget(doc);
  closeBudgetItemModal();
  _renderBudget();
}

export function deleteBudgetItem(gi, ii) {
  const doc = _getBudgetDoc(_budgetYear);
  if (!doc) return;
  const item = doc.groups[gi]?.items[ii];
  if (!item || !confirm(`"${item.name}" 항목을 삭제할까요?`)) return;
  doc.groups[gi].items.splice(ii, 1);
  saveFinBudget(doc);
  _renderBudget();
}
