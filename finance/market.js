// ================================================================
// finance/market.js — 시장데이터 & 종목리스트
// ================================================================

import { S, M7, QUOTE_CACHE_KEY, QUOTE_CACHE_TIME, SWING_CACHE_KEY, SWING_CACHE_TIME } from './state.js';
import { fetchAllQuotes, calcRSI } from './api.js';
import { getCC, compactBadge } from './utils.js';
import { fetchFearGreed } from '../data.js';
import { calcBB, calcStochastic, rsiSignal, bbSignal, stochSignal, consensus, getSwingPositions, loadSwingData } from './swing.js';
import { trendGate, pbPriceSignal, pbRsiSignal, pbVolumeSignal, pbDropSpeed, pbConsensus, getPbPositions } from './pullback.js';

// ── deps (순환 참조 방지) ──
let _deps = {};
export function setMarketDeps(deps) { _deps = deps; }

export async function loadMarketData() {
  const symbols = ['SPY', 'QQQ', ...M7.map(t => t.sym)];
  try {
    const quotes = await fetchAllQuotes(symbols);
    Object.assign(S.quotesMap, quotes);
    console.log(`[finance] ${Object.keys(quotes).length}개 시세 로드 완료`);
  } catch (e) {
    console.warn('[finance] 시세 로드 실패:', e.message);
  }
  try { S.fngData = await fetchFearGreed(); } catch {}
}

export async function refreshFinMarketData() {
  localStorage.removeItem(QUOTE_CACHE_KEY);
  localStorage.removeItem(QUOTE_CACHE_TIME);
  localStorage.removeItem('fng_data');
  localStorage.removeItem('fng_time');
  S.quotesMap = {};
  S.fngData = null;
  await loadMarketData();
  renderContextLine();
  if (_deps.renderPositionTables) _deps.renderPositionTables();
  if (_deps.renderNetWorthCards) _deps.renderNetWorthCards();
  // 스윙 데이터도 갱신
  localStorage.removeItem(SWING_CACHE_KEY);
  localStorage.removeItem(SWING_CACHE_TIME);
  S.swingData = {};
  await loadSwingData();
  renderStockList();
  renderPortfolioSummary();
}

export function renderContextLine() {
  const el = document.getElementById('fin-context-line');
  if (!el) return;
  const UP = '#ef4444', DN = '#fa342c';
  const parts = [];
  if (S.fngData?.score != null) {
    const s = S.fngData.score;
    const c = s <= 25 ? '#ef4444' : s <= 45 ? '#f97316' : s <= 55 ? 'var(--accent)' : s <= 75 ? '#84cc16' : '#10b981';
    parts.push(`<span class="fin-ctx-dot" style="background:${c}"></span><span>F&G ${s}</span>`);
  }
  ['SPY','QQQ'].forEach(sym => {
    const q = S.quotesMap[sym];
    if (!q) return;
    const c = q.change > 0 ? UP : q.change < 0 ? DN : 'var(--muted)';
    parts.push(`<span>${sym} <span style="color:${c}">${q.change > 0?'+':''}${q.change.toFixed(2)}%</span></span>`);
  });
  const cachedTime = parseInt(localStorage.getItem(QUOTE_CACHE_TIME) || '0');
  const timeStr = cachedTime ? new Date(cachedTime).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
  el.innerHTML = parts.join('<span style="color:var(--border)">·</span>') + `<span style="margin-left:auto;font-size:9px">${timeStr}</span>`;
}

export function renderPortfolioSummary() {
  const el = document.getElementById('fin-portfolio-summary');
  if (!el) return;
  const swingPos = getSwingPositions();
  const pbPos = getPbPositions();
  const allPos = [...Object.entries(swingPos).map(([sym,p])=>({sym,...p,type:'A'})), ...Object.entries(pbPos).map(([sym,p])=>({sym,...p,type:'B'}))];
  if (allPos.length === 0) { el.innerHTML = ''; return; }

  let totalVal = 0, totalCost = 0;
  allPos.forEach(p => {
    const d = S.swingData[p.sym];
    const curPrice = d?.price || 0;
    totalVal += curPrice * p.shares;
    totalCost += p.buyPrice * p.shares;
  });
  const pnl = totalVal - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost * 100) : 0;
  const pnlKrw = pnl * S.fxRate;
  const UP = '#ef4444', DN = '#fa342c';
  const c = pnl >= 0 ? UP : DN;
  const sign = pnl >= 0 ? '+' : '';

  el.innerHTML = `<div class="fin-portfolio-card">
    <div class="fin-pf-label">보유 ${allPos.length}종목</div>
    <div class="fin-pf-pnl" style="color:${c}">${sign}$${Math.abs(pnl).toFixed(0)} (${sign}${pnlPct.toFixed(1)}%)</div>
    <div class="fin-pf-sub">${sign}₩${Math.abs(pnlKrw).toLocaleString('ko-KR',{maximumFractionDigits:0})} · 평가 $${totalVal.toFixed(0)}</div>
  </div>`;
}

export function renderStockList() {
  const el = document.getElementById('fin-stock-list');
  if (!el) return;
  if (Object.keys(S.swingData).length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:20px;text-align:center">M7 데이터 로딩 중...</div>';
    return;
  }
  const UP = '#ef4444', DN = '#fa342c';
  const swingPos = getSwingPositions();
  const pbPos = getPbPositions();

  el.innerHTML = M7.map(t => {
    const d = S.swingData[t.sym];
    if (!d) return '';
    const chgC = d.change > 0 ? UP : d.change < 0 ? DN : 'var(--muted)';
    const rsi = calcRSI(d.closes, 14);
    const bb = calcBB(d.closes, 20, 2);
    const stoch = calcStochastic(d.highs, d.lows, d.closes, 14, 3, 3);
    const conA = consensus(rsiSignal(rsi), bbSignal(d.closes, bb), stochSignal(stoch));
    const gate = trendGate(d.closes);
    const dropSpeed = pbDropSpeed(d.closes);
    let conB;
    if (!gate.active && !gate.near) {
      conB = { consensus: 'OFF' };
    } else {
      conB = pbConsensus(pbPriceSignal(d.closes), pbRsiSignal(rsi), pbVolumeSignal(d.volumes, d.closes), gate, dropSpeed);
    }
    const badgeA = compactBadge(conA.consensus, 'A');
    const badgeB = compactBadge(conB.consensus, 'B');
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
