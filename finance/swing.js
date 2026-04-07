// ================================================================
// finance/swing.js — 전략A: Contrarian Swing Trading
// ================================================================

import { S, M7, SWING_CACHE_KEY, SWING_CACHE_TIME, SWING_POS_KEY } from './state.js';
import { calcRSI, proxyFetch } from './api.js';
import { getCC, signalBadge, dirBadge } from './utils.js';

// ── 기술적 지표 계산 ──

export function calcBB(closes, period = 20, mult = 2) {
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

export function calcStochastic(highs, lows, closes, kPeriod = 14, kSmooth = 3, dSmooth = 3) {
  if (closes.length < kPeriod + kSmooth + dSmooth - 2) return null;
  const rawKs = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const hSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lSlice = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...hSlice);
    const ll = Math.min(...lSlice);
    rawKs.push(hh !== ll ? ((closes[i] - ll) / (hh - ll)) * 100 : 50);
  }
  const slowKs = [];
  for (let i = kSmooth - 1; i < rawKs.length; i++) {
    const s = rawKs.slice(i - kSmooth + 1, i + 1);
    slowKs.push(s.reduce((a, b) => a + b, 0) / kSmooth);
  }
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

export function rsiSignal(rsi) {
  if (rsi == null) return { signal: 'NEUTRAL', dir: 'N', val: '-' };
  let signal, dir;
  if (rsi <= 30) { signal = 'STRONGLY BUY'; dir = 'B'; }
  else if (rsi <= 37) { signal = 'BUY'; dir = 'B'; }
  else if (rsi <= 44) { signal = 'NEUTRAL'; dir = 'N'; }
  else if (rsi <= 54) { signal = 'SELL'; dir = 'S'; }
  else { signal = 'STRONGLY SELL'; dir = 'S'; }
  return { signal, dir, val: rsi };
}

export function bbSignal(closes, bb) {
  if (!bb) return { signal: 'NEUTRAL', dir: 'N', val: '-', status: '-' };
  const price = bb.price;
  const pos = bb.position;
  const recent3 = closes.slice(-4, -1);
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

export function stochSignal(stoch) {
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

export function consensus(rsiSig, bbSig, stochSig) {
  const dirs = [rsiSig.dir, bbSig.dir, stochSig.dir];
  const bCount = dirs.filter(d => d === 'B').length;
  const sCount = dirs.filter(d => d === 'S').length;
  const hasConflict = bCount > 0 && sCount > 0;

  let con, action;
  if (hasConflict) {
    con = 'NEUTRAL'; action = '관망';
  } else if (bCount === 3) {
    const strongBuys = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY BUY').length;
    con = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
    action = strongBuys >= 2 ? '즉시 진입' : '진입';
  } else if (bCount === 2 && sCount === 0) {
    const strongBuys = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY BUY').length;
    con = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
    action = strongBuys >= 2 ? '즉시 진입' : '진입';
  } else if (sCount === 3) {
    const strongSells = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY SELL').length;
    con = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else if (sCount === 2 && bCount === 0) {
    const strongSells = [rsiSig, bbSig, stochSig].filter(s => s.signal === 'STRONGLY SELL').length;
    con = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else {
    con = 'NEUTRAL'; action = '관망';
  }

  const summary = dirs.join('+');
  return { consensus: con, action, summary, bCount, sCount };
}

// ── 데이터 로드 ──

export async function loadSwingData() {
  const now = Date.now();
  const lastTime = parseInt(localStorage.getItem(SWING_CACHE_TIME) || '0');
  if ((now - lastTime) < 5 * 60000) {
    try {
      const cached = JSON.parse(localStorage.getItem(SWING_CACHE_KEY));
      if (cached && Object.keys(cached).length >= 7) { S.swingData = cached; return; }
    } catch {}
  }

  const el = document.getElementById('fin-swing-judge');
  if (el) el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;text-align:center">M7 데이터 로딩 중...</div>';

  for (const t of M7) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${t.sym}?range=1y&interval=1d`;
      const data = await proxyFetch(url);
      const r = data?.chart?.result?.[0];
      if (!r) continue;
      const q = r.indicators?.quote?.[0] || {};
      const meta = r.meta;
      const curPrice = meta.regularMarketPrice;
      const allCloses = (q.close || []).filter(v => v != null);
      const prevDayClose = allCloses.length >= 2 ? allCloses[allCloses.length - 2] : curPrice;
      S.swingData[t.sym] = {
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

  localStorage.setItem(SWING_CACHE_KEY, JSON.stringify(S.swingData));
  localStorage.setItem(SWING_CACHE_TIME, String(now));
}

// ── 포지션 관리 (CRUD) ──

export function getSwingPositions() {
  try { return JSON.parse(localStorage.getItem(SWING_POS_KEY)) || {}; } catch { return {}; }
}
export function saveSwingPositions(pos) {
  localStorage.setItem(SWING_POS_KEY, JSON.stringify(pos));
}

// ── 렌더 deps (순환 참조 방지용 콜백) ──
let _deps = {};
export function setSwingDeps(deps) { _deps = deps; }

export function openSwingBuy(sym) {
  const priceStr = prompt(`${sym} 매수 단가 (USD):`);
  if (priceStr === null || priceStr === '') return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { alert('유효한 가격을 입력하세요'); return; }
  const sharesStr = prompt(`${sym} 매수 수량 (주):`);
  if (sharesStr === null || sharesStr === '') return;
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) { alert('유효한 수량을 입력하세요'); return; }
  const pos = getSwingPositions();
  pos[sym] = { buyPrice: price, shares, buyDate: new Date().toISOString().slice(0, 10), amount: price * shares };
  saveSwingPositions(pos);
  if (_deps.renderStockList) _deps.renderStockList();
  if (_deps.renderPortfolioSummary) _deps.renderPortfolioSummary();
}

export function editSwingPosition(sym) {
  const pos = getSwingPositions();
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
  saveSwingPositions(pos);
  if (_deps.renderStockList) _deps.renderStockList();
  if (_deps.renderPortfolioSummary) _deps.renderPortfolioSummary();
}

export function closeSwingPosition(sym) {
  if (!confirm(`${sym} 포지션을 매도 완료 처리할까요?`)) return;
  const pos = getSwingPositions();
  delete pos[sym];
  saveSwingPositions(pos);
  if (_deps.renderStockList) _deps.renderStockList();
  if (_deps.renderPortfolioSummary) _deps.renderPortfolioSummary();
}

// ── 렌더 (테이블 형식, 레거시) ──

export function renderSwingJudge() {
  const el = document.getElementById('fin-swing-judge');
  if (!el) return;
  if (Object.keys(S.swingData).length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const positions = getSwingPositions();
  const UP = '#ef4444';
  const DN = '#fa342c';
  const _chgColor = v => v > 0 ? UP : v < 0 ? DN : 'var(--muted)';

  const results = M7.map(t => {
    const d = S.swingData[t.sym];
    if (!d || !d.closes.length) return { sym: t.sym, name: t.name, noData: true };
    const rsi = calcRSI(d.closes, 14);
    const bb = calcBB(d.closes, 20, 2);
    const stoch = calcStochastic(d.highs, d.lows, d.closes, 14, 3, 3);
    const rsiSig = rsiSignal(rsi);
    const bbSig_ = bbSignal(d.closes, bb);
    const stochSig = stochSignal(stoch);
    const con = consensus(rsiSig, bbSig_, stochSig);
    return { sym: t.sym, name: t.name, price: d.price, change: d.change, rsiSig, bbSig: bbSig_, stochSig, con, stoch };
  });

  let html = `<table style="width:100%;border-collapse:collapse;font-size:10px;min-width:${M7.length * 95}px">`;

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

  html += `<tr style="background:var(--surface2)"><td style="padding:6px 4px;font-weight:700;color:var(--muted2)">종합</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:6px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:6px 3px">
      ${signalBadge(r.con.consensus)}
      <div style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--muted)">${r.con.summary}</div>
      <div style="font-size:9px;font-weight:600;color:var(--muted2);margin-top:2px">${r.con.action}</div>
    </td>`;
  });
  html += `</tr>`;

  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">RSI(14)</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.rsiSig.val}</div>
      <div style="margin-top:2px">${dirBadge(r.rsiSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;color:var(--muted2)">BB(20,2)</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.bbSig.val}</div>
      <div style="font-size:8px;color:var(--muted);margin-top:1px">${r.bbSig.status}</div>
      <div style="margin-top:2px">${dirBadge(r.bbSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">Stoch(14,3)</td>`;
  results.forEach(r => {
    if (r.noData) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--text)">${r.stochSig.val}</div>
      ${r.stochSig.cross ? `<div style="font-size:8px;color:${r.stochSig.dir === 'B' ? UP : DN};font-weight:700">${r.stochSig.cross}</div>` : ''}
      <div style="margin-top:2px">${dirBadge(r.stochSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

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
      const curValKrw = curValUsd * S.fxRate;
      const pnlKrw = pnl * S.fxRate;
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
  html += `<div style="font-size:8px;color:var(--muted);text-align:right;margin-top:4px;padding-right:4px">Contrarian Swing · USD/KRW ${S.fxRate.toLocaleString()} · ${new Date().toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>`;
  el.innerHTML = html;
}
