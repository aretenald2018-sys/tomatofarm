// ================================================================
// finance/stock-detail.js — 종목 상세 모달 & 차트
// ================================================================

import { S, M7 } from './state.js';
import { calcRSI, proxyFetch } from './api.js';
import { getCC, getMarketStatus, signalBadge, dirBadge } from './utils.js';
import { calcBB, calcStochastic, rsiSignal, bbSignal, stochSignal, consensus, getSwingPositions } from './swing.js';
import { trendGate, pbPriceSignal, pbRsiSignal, pbVolumeSignal, pbDropSpeed, pbConsensus, getPbPositions } from './pullback.js';

// ── 크로스헤어 + 툴팁바 ──
function _updateTooltipBar(idx) {
  const bar = document.getElementById('sc-tooltip-bar');
  if (!bar || !S.stockChartData || idx == null) { if (bar) bar.style.display = 'none'; return; }
  const d = S.stockChartData;
  const c = d.closes[idx], o = d.opens[idx], h = d.highs[idx], l = d.lows[idx];
  if (c == null) { bar.style.display = 'none'; return; }
  const prev = idx > 0 ? d.closes[idx - 1] : o;
  const chg = prev ? ((c - prev) / prev * 100) : 0;
  const UP = '#ef4444', DN = '#fa342c';
  const col = chg >= 0 ? UP : DN;
  const sign = chg >= 0 ? '+' : '';
  const rsi = d.rsiValues[idx];
  const vol = d.volumes[idx];
  const rsiColor = rsi != null ? (rsi >= 70 ? UP : rsi <= 30 ? '#10b981' : 'var(--text-secondary)') : '#64748b';
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span style="color:var(--text);font-weight:700">$${c.toFixed(2)}</span>
    <span style="color:${col}">${sign}${chg.toFixed(2)}%</span>
    <span style="color:#64748b;font-size:10px">${d.labels[idx]}</span>
    <span style="color:#64748b">|</span>
    <span style="font-size:10px">시 $${o?.toFixed(0)||'-'} 고 <span style="color:${UP}">$${h?.toFixed(0)||'-'}</span> 저 <span style="color:${DN}">$${l?.toFixed(0)||'-'}</span></span>
    <span style="color:#64748b">|</span>
    <span style="font-size:10px;color:${rsiColor}">RSI ${rsi ?? '-'}</span>
    <span style="font-size:10px;color:#64748b">${vol != null ? (vol >= 1e6 ? (vol/1e6).toFixed(1)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(0)+'K' : vol) : '-'}</span>`;
}

const _crosshairPlugin = {
  id: 'crosshair',
  afterEvent(chart, args) {
    const evt = args.event;
    if (evt.type === 'mousemove' || evt.type === 'click') {
      const el = chart.getElementsAtEventForMode(args.event, 'index', { intersect: false }, false);
      if (el.length > 0) {
        chart._crosshairX = el[0].element.x;
        chart._crosshairIdx = el[0].index;
        [S.stockPriceChart, S.stockVolumeChart, S.stockRsiChart].forEach(ch => {
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
      [S.stockPriceChart, S.stockVolumeChart, S.stockRsiChart].forEach(ch => {
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

// ── 드래그 핸들 ──
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
      [S.stockPriceChart, S.stockVolumeChart, S.stockRsiChart].forEach(c => c?.resize());
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

// ── 종목 상세 모달 ──

export async function openStockDetail(sym) {
  S.currentStockSym = sym;
  const modal = document.getElementById('stock-detail-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const t = M7.find(x => x.sym === sym) || { sym, name: '' };
  const d = S.swingData[sym];
  const UP = '#ef4444', DN = '#fa342c';
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
  S.sdCurrentTab = 'live';
  document.querySelectorAll('.fin-detail-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === 'live'));
  await _renderDetailTab(sym, 'live');
}

export function closeStockDetailModal(e) {
  if (e && e.target !== document.getElementById('stock-detail-modal')) return;
  document.getElementById('stock-detail-modal').style.display = 'none';
  _stopLiveRefresh();
  if (S.liveChart) { S.liveChart.destroy(); S.liveChart = null; }
  if (S.liveVolumeChart) { S.liveVolumeChart.destroy(); S.liveVolumeChart = null; }
  if (S.stockPriceChart) { S.stockPriceChart.destroy(); S.stockPriceChart = null; }
  if (S.stockVolumeChart) { S.stockVolumeChart.destroy(); S.stockVolumeChart = null; }
  if (S.stockRsiChart) { S.stockRsiChart.destroy(); S.stockRsiChart = null; }
}

export async function switchStockDetailTab(tab) {
  if (!S.currentStockSym) return;
  S.sdCurrentTab = tab;
  document.querySelectorAll('.fin-detail-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  if (tab !== 'chart') {
    if (S.stockPriceChart) { S.stockPriceChart.destroy(); S.stockPriceChart = null; }
    if (S.stockVolumeChart) { S.stockVolumeChart.destroy(); S.stockVolumeChart = null; }
    if (S.stockRsiChart) { S.stockRsiChart.destroy(); S.stockRsiChart = null; }
  }
  if (tab !== 'live') {
    if (S.liveChart) { S.liveChart.destroy(); S.liveChart = null; }
    if (S.liveVolumeChart) { S.liveVolumeChart.destroy(); S.liveVolumeChart = null; }
  }
  await _renderDetailTab(S.currentStockSym, tab);
}

async function _renderDetailTab(sym, tab) {
  const content = document.getElementById('sd-content');
  if (!content) return;

  if (tab !== 'live') _stopLiveRefresh();

  if (tab === 'live') {
    const ms = getMarketStatus();
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
  const d = S.swingData[sym];
  if (!d) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">데이터 없음</div>'; return; }
  const rsi = calcRSI(d.closes, 14);
  const bb = calcBB(d.closes, 20, 2);
  const stoch = calcStochastic(d.highs, d.lows, d.closes, 14, 3, 3);
  const rsiSig = rsiSignal(rsi);
  const bbSig_ = bbSignal(d.closes, bb);
  const stochSig = stochSignal(stoch);
  const con = consensus(rsiSig, bbSig_, stochSig);
  const pos = getSwingPositions()[sym];

  el.innerHTML = `
    <div class="fin-verdict">
      <div class="fin-verdict-label">Contrarian Swing 종합</div>
      ${signalBadge(con.consensus)}
      <div class="fin-verdict-summary">${con.summary}</div>
      <div class="fin-verdict-action">${con.action}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">RSI (14)</div></div>
      <div class="fin-ind-val">${rsiSig.val} ${dirBadge(rsiSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">Bollinger Bands (20,2)</div><div class="fin-ind-sub">${bbSig_.status}</div></div>
      <div class="fin-ind-val">${bbSig_.val} ${dirBadge(bbSig_.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">Stochastic (14,3,3)</div>${stochSig.cross ? `<div class="fin-ind-sub" style="color:${stochSig.dir==='B'?'#ef4444':'#fa342c'};font-weight:600">${stochSig.cross}</div>` : ''}</div>
      <div class="fin-ind-val">${stochSig.val} ${dirBadge(stochSig.dir)}</div>
    </div>
    ${_renderPosCard(sym, pos, 'swing')}`;
}

function _renderDetailStratB(sym, el) {
  const d = S.swingData[sym];
  if (!d) { el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">데이터 없음</div>'; return; }
  const gate = trendGate(d.closes);
  const rsi = calcRSI(d.closes, 14);
  const priceSig = pbPriceSignal(d.closes);
  const rsiSig = pbRsiSignal(rsi);
  const volSig = pbVolumeSignal(d.volumes, d.closes);
  const dropSpeed = pbDropSpeed(d.closes);
  let con;
  if (!gate.active && !gate.near) {
    con = { consensus: 'OFF', action: '비활성 — 전략A 참고', summary: '-' };
  } else {
    con = pbConsensus(priceSig, rsiSig, volSig, gate, dropSpeed);
  }
  const pos = getPbPositions()[sym];
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
      ${con.consensus === 'OFF' ? '<span class="fin-sr-badge" style="background:rgba(148,163,184,0.1);color:var(--text-tertiary);font-size:11px;padding:4px 10px">OFF</span>' : signalBadge(con.consensus)}
      <div class="fin-verdict-summary">${con.summary}</div>
      <div class="fin-verdict-action">${con.action}</div>
    </div>
    ${gate.active || gate.near ? `
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">20SMA 이격</div><div class="fin-ind-sub">SMA20: $${priceSig.sma20?.toFixed(0)||'-'}</div></div>
      <div class="fin-ind-val">${priceSig.val} ${dirBadge(priceSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">RSI (14)</div></div>
      <div class="fin-ind-val">${rsiSig.val} ${dirBadge(rsiSig.dir)}</div>
    </div>
    <div class="fin-ind-row">
      <div><div class="fin-ind-label">거래량 추세 (5d/20d)</div></div>
      <div class="fin-ind-val">${volSig.val} ${dirBadge(volSig.dir)}</div>
    </div>` : ''}
    ${_renderPosCard(sym, pos, 'pullback')}`;
}

function _renderPosCard(sym, pos, type) {
  const UP = '#ef4444', DN = '#fa342c';
  const buyFn = type === 'swing' ? 'openSwingBuy' : 'openPbBuy';
  const editFn = type === 'swing' ? 'editSwingPosition' : 'editPbPosition';
  const closeFn = type === 'swing' ? 'closeSwingPosition' : 'closePbPosition';
  const label = type === 'swing' ? '전략A' : '전략B';

  if (!pos) {
    return `<div class="fin-pos-card" style="text-align:center">
      <button class="fin-pos-btn" style="background:#4c0519;color:#fca5a5;border-color:#881337;width:auto;display:inline-block;padding:10px 24px" onclick="${buyFn}('${sym}');switchStockDetailTab('${type==='swing'?'stratA':'stratB'}')">매수 실행 (${label})</button>
    </div>`;
  }
  const d = S.swingData[sym];
  const curPrice = d?.price || 0;
  const pnl = (curPrice - pos.buyPrice) * pos.shares;
  const pnlPct = pos.buyPrice > 0 ? ((curPrice - pos.buyPrice) / pos.buyPrice * 100) : 0;
  const pnlKrw = pnl * S.fxRate;
  const c = pnl >= 0 ? UP : DN;
  const sign = pnl >= 0 ? '+' : '';
  const curVal = curPrice * pos.shares;

  return `<div class="fin-pos-card">
    <div class="fin-pos-info">${pos.buyDate} · ${pos.shares}주 · 매입 $${pos.buyPrice}</div>
    <div class="fin-pos-pnl" style="color:${c}">${sign}$${Math.abs(pnl).toFixed(0)} (${sign}${pnlPct.toFixed(1)}%)</div>
    <div class="fin-pos-info">${sign}₩${Math.abs(pnlKrw).toLocaleString('ko-KR',{maximumFractionDigits:0})} · 평가 $${curVal.toFixed(0)} · ₩${(curVal*S.fxRate).toLocaleString('ko-KR',{maximumFractionDigits:0})}</div>
    <div class="fin-pos-actions">
      <button class="fin-pos-btn" style="background:var(--surface3);color:var(--muted2)" onclick="${editFn}('${sym}');switchStockDetailTab('${type==='swing'?'stratA':'stratB'}')">수정</button>
      <button class="fin-pos-btn" style="background:#172554;color:#93c5fd;border-color:#1e40af" onclick="${closeFn}('${sym}');switchStockDetailTab('${type==='swing'?'stratA':'stratB'}')">매도 완료</button>
    </div>
  </div>`;
}

export async function changeStockChartRange(range) {
  if (!S.currentStockSym) return;
  document.querySelectorAll('.stock-range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === range));
  if (S.stockPriceChart) { S.stockPriceChart.destroy(); S.stockPriceChart = null; }
  if (S.stockVolumeChart) { S.stockVolumeChart.destroy(); S.stockVolumeChart = null; }
  if (S.stockRsiChart) { S.stockRsiChart.destroy(); S.stockRsiChart = null; }
  await _loadStockChart(S.currentStockSym, range);
}

// ================================================================
// 차트 로딩
// ================================================================

async function _loadStockChart(sym, range) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=1d`;
    const data = await proxyFetch(url);
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

    const rsiValues = [];
    const period = 14;
    for (let i = 0; i < closes.length; i++) {
      if (i < period) { rsiValues.push(null); continue; }
      const slice = closes.slice(0, i + 1).filter(c => c != null);
      if (slice.length < period + 1) { rsiValues.push(null); continue; }
      rsiValues.push(calcRSI(slice, period));
    }

    S.stockChartData = { labels, opens, highs, lows, closes, volumes, rsiValues };

    const firstClose = closes.find(c => c != null) || 0;
    const lastClose = closes.filter(c => c != null).pop() || 0;
    const isUp = lastClose >= firstClose;
    const UP = '#ef4444', DN = '#fa342c';
    const lineColor = isUp ? UP : DN;

    const xPadRight = 20;
    const baseOpts = {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { right: xPadRight } },
    };

    if (S.stockPriceChart) S.stockPriceChart.destroy();
    const priceCanvas = document.getElementById('stock-price-chart');
    if (!priceCanvas) return;
    const priceCtx = priceCanvas.getContext('2d');
    const gradFill = priceCtx.createLinearGradient(0, 0, 0, priceCanvas.parentElement.offsetHeight);
    gradFill.addColorStop(0, isUp ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)');
    gradFill.addColorStop(1, 'rgba(0,0,0,0)');

    S.stockPriceChart = new Chart(priceCanvas, {
      type: 'line',
      data: { labels, datasets: [{ label: '종가', data: closes, borderColor: lineColor, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: lineColor, pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2, fill: true, backgroundColor: gradFill, tension: 0.3, spanGaps: true }] },
      options: { ...baseOpts, scales: { x: { ticks: { color: getCC().tick, font: { size: 9 }, maxTicksLimit: 6, maxRotation: 0, padding: 4 }, grid: { display: false } }, y: { position: 'right', ticks: { color: getCC().tick, font: { size: 9 }, callback: v => '$' + v.toFixed(0), maxTicksLimit: 5 }, grid: { color: 'rgba(255,255,255,0.04)' } } }, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [_crosshairPlugin],
    });

    if (S.stockVolumeChart) S.stockVolumeChart.destroy();
    const volCanvas = document.getElementById('stock-volume-chart');
    if (!volCanvas) return;

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

    S.stockVolumeChart = new Chart(volCanvas, {
      type: 'bar',
      data: { labels, datasets: [
        { label: '거래량', data: volumes, backgroundColor: volColors, borderWidth: 0, order: 2 },
        { label: '20MA', data: volMA, type: 'line', borderColor: '#f59e0b', borderWidth: 1.2, pointRadius: 0, fill: false, tension: 0.3, order: 1 },
      ] },
      options: { ...baseOpts, scales: { x: { ticks: { display: false }, grid: { display: false } }, y: { position: 'right', ticks: { color: getCC().tick, font: { size: 8 }, callback: v => v >= 1e6 ? (v/1e6).toFixed(0)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : '', maxTicksLimit: 3 }, grid: { color: 'rgba(255,255,255,0.03)' } } }, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [_crosshairPlugin],
    });

    if (S.stockRsiChart) S.stockRsiChart.destroy();
    const rsiCanvas = document.getElementById('stock-rsi-chart');
    if (!rsiCanvas) return;
    const rsiCtx = rsiCanvas.getContext('2d');

    const lastRsi = rsiValues.filter(r => r != null).pop();
    const rsiLineColor = lastRsi != null ? (lastRsi >= 70 ? UP : lastRsi <= 30 ? '#10b981' : '#f59e0b') : '#f59e0b';
    const rsiFillAlpha = lastRsi != null ? (lastRsi >= 70 ? 'rgba(239,68,68,0.12)' : lastRsi <= 30 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)') : 'rgba(245,158,11,0.12)';
    const rsiFillGrad = rsiCtx.createLinearGradient(0, 0, 0, rsiCanvas.parentElement.offsetHeight);
    rsiFillGrad.addColorStop(0, rsiFillAlpha);
    rsiFillGrad.addColorStop(1, 'rgba(0,0,0,0)');

    S.stockRsiChart = new Chart(rsiCanvas, {
      type: 'line',
      data: { labels, datasets: [{ label: 'RSI(14)', data: rsiValues, borderColor: rsiLineColor, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: rsiLineColor, fill: true, backgroundColor: rsiFillGrad, tension: 0.3 }] },
      options: { ...baseOpts, scales: { x: { ticks: { display: false }, grid: { display: false } }, y: { min: 0, max: 100, position: 'right', ticks: { color: getCC().tick, font: { size: 8 }, stepSize: 50, callback: v => v === 50 ? '50' : v === 0 ? '' : v === 100 ? '' : '' }, grid: { color: 'rgba(255,255,255,0.03)' } } }, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      plugins: [_crosshairPlugin, {
        id: 'rsiZones',
        beforeDraw(chart) {
          const ctx = chart.ctx;
          const yScale = chart.scales.y;
          const { left, right } = chart.chartArea;
          ctx.save();
          const y70 = yScale.getPixelForValue(70);
          const y100 = yScale.getPixelForValue(100);
          ctx.fillStyle = 'rgba(239,68,68,0.06)';
          ctx.fillRect(left, y100, right - left, y70 - y100);
          const y30 = yScale.getPixelForValue(30);
          const y0 = yScale.getPixelForValue(0);
          ctx.fillStyle = 'rgba(16,185,129,0.06)';
          ctx.fillRect(left, y30, right - left, y0 - y30);
          ctx.strokeStyle = 'rgba(239,68,68,0.25)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(left, y70); ctx.lineTo(right, y70); ctx.stroke();
          ctx.strokeStyle = 'rgba(16,185,129,0.25)';
          ctx.beginPath(); ctx.moveTo(left, y30); ctx.lineTo(right, y30); ctx.stroke();
          const y50 = yScale.getPixelForValue(50);
          ctx.strokeStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath(); ctx.moveTo(left, y50); ctx.lineTo(right, y50); ctx.stroke();
          ctx.font = '8px sans-serif';
          ctx.fillStyle = 'rgba(239,68,68,0.5)';
          ctx.fillText('과매수', left + 2, y70 + 10);
          ctx.fillStyle = 'rgba(16,185,129,0.5)';
          ctx.fillText('과매도', left + 2, y30 - 4);
          ctx.restore();
        },
      }],
    });

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

function _stopLiveRefresh() {
  if (S.liveInterval) { clearInterval(S.liveInterval); S.liveInterval = null; }
}

export function toggleLiveAutoRefresh() {
  S.liveAutoRefresh = !S.liveAutoRefresh;
  const btn = document.getElementById('live-auto-toggle');
  if (btn) {
    btn.textContent = S.liveAutoRefresh ? '자동갱신 ON' : '자동갱신 OFF';
    btn.style.color = S.liveAutoRefresh ? '#10b981' : '#64748b';
  }
  if (S.liveAutoRefresh && S.currentStockSym) {
    _startLiveRefresh(S.currentStockSym);
  } else {
    _stopLiveRefresh();
  }
}

function _startLiveRefresh(sym) {
  _stopLiveRefresh();
  const ms = getMarketStatus();
  if ((ms.status === 'open' || ms.status === 'pre' || ms.status === 'after') && S.liveAutoRefresh) {
    S.liveInterval = setInterval(() => {
      if (S.sdCurrentTab === 'live' && S.currentStockSym === sym) {
        _loadLiveChart(sym, false);
      } else {
        _stopLiveRefresh();
      }
    }, 60000);
  }
}

export function changeLiveRange(range) {
  if (!S.currentStockSym) return;
  document.querySelectorAll('.live-range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === range));
  _loadLiveChart(S.currentStockSym, true, range);
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
    const data = await proxyFetch(url);
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

    const change = prevClose ? ((curPrice - prevClose) / prevClose * 100) : 0;
    const changeDollar = prevClose ? (curPrice - prevClose) : 0;
    const UP = '#ef4444', DN = '#fa342c';
    const chgC = change >= 0 ? UP : DN;
    const sign = change >= 0 ? '+' : '';

    const ms = getMarketStatus();

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

    const priceEl = document.getElementById('live-price-header');
    if (priceEl) {
      priceEl.innerHTML = `
        <span style="font-size:22px;font-weight:700;font-family:'JetBrains Mono',monospace">$${curPrice.toFixed(2)}</span>
        <span style="font-size:13px;font-family:'JetBrains Mono',monospace;color:${chgC};margin-left:8px">${sign}$${Math.abs(changeDollar).toFixed(2)} (${sign}${change.toFixed(2)}%)</span>`;
    }

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

    const lineColor = curPrice >= prevClose ? UP : DN;
    const fillColor = curPrice >= prevClose ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)';

    if (S.liveChart) S.liveChart.destroy();
    const canvas = document.getElementById('live-price-canvas');
    if (!canvas) return;

    S.liveChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: '가격', data: closes, borderColor: lineColor, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, fill: true, backgroundColor: fillColor, tension: 0.1, spanGaps: true },
        prevClose ? { label: '전일종가', data: Array(labels.length).fill(prevClose), borderColor: 'rgba(148,163,184,0.4)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false } : null,
      ].filter(Boolean) },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: showLoading ? { duration: 400 } : false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: getCC().tick, font: { size: 8 }, maxTicksLimit: 6, maxRotation: 0 }, grid: { color: getCC().grid } },
          y: { ticks: { color: getCC().tick, font: { size: 9 }, callback: v => '$' + v.toFixed(0) }, grid: { color: getCC().grid } },
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
            titleColor: getCC().label, bodyColor: getCC().tick,
            borderColor: '#3c4060', borderWidth: 1, padding: 10,
          },
        },
      },
      plugins: [_crosshairPlugin],
    });

    if (S.liveVolumeChart) S.liveVolumeChart.destroy();
    const volCanvas = document.getElementById('live-volume-canvas');
    if (!volCanvas) return;
    const volColors = closes.map((c, i) => {
      if (i === 0 || c == null) return 'rgba(148,163,184,0.4)';
      const prev = closes[i-1] != null ? closes[i-1] : prevClose;
      return c >= prev ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)';
    });
    S.liveVolumeChart = new Chart(volCanvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: volumes, backgroundColor: volColors, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: showLoading ? { duration: 400 } : false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: getCC().tick, font: { size: 8 }, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: getCC().tick, font: { size: 8 }, callback: v => v >= 1e6 ? (v/1e6).toFixed(0)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v }, grid: { color: getCC().grid } },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
      plugins: [_crosshairPlugin],
    });

    _startLiveRefresh(sym);

    if (S.swingData[sym]) {
      S.swingData[sym].price = curPrice;
      S.swingData[sym].change = parseFloat(change.toFixed(2));
    }

  } catch (e) {
    console.warn('[live-chart]', e);
    const statusEl = document.getElementById('live-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--diet-bad);font-size:10px">데이터 로드 실패 — 프록시 재시도 중...</span>';
  }
}
