// ================================================================
// finance/pullback.js — 전략B: 상승추세 눌림목 전략
// ================================================================

import { S, M7, PB_POS_KEY } from './state.js';
import { calcRSI } from './api.js';
import { signalBadge, dirBadge } from './utils.js';

// ── SMA 계산 ──

export function calcSMA(arr, period) {
  if (arr.length < period) return null;
  const slice = arr.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

// ── 추세 게이트 ──
export function trendGate(closes) {
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);
  if (sma50 == null || sma200 == null) return { active: false, sma50: null, sma200: null, reason: '데이터 부족', strength: 'none' };
  const diff = (sma50 - sma200) / sma200 * 100;
  let strength;
  if (diff >= 5) strength = 'strong';
  else if (diff >= 3) strength = 'moderate';
  else if (diff > 0) strength = 'weak';
  else strength = 'none';
  return { active: sma50 > sma200, sma50, sma200, diff, near: Math.abs(diff) <= 1, strength };
}

// ── 20SMA 대비 가격 위치 ──
export function pbPriceSignal(closes) {
  const sma20 = calcSMA(closes, 20);
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
export function pbRsiSignal(rsi) {
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
export function pbVolumeSignal(volumes, closes) {
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
export function pbDropSpeed(closes) {
  if (closes.length < 6) return { fast: false, drop5d: 0, val: '-' };
  const now = closes[closes.length - 1];
  const ago5 = closes[closes.length - 6];
  const drop5d = ((now - ago5) / ago5) * 100;
  return { fast: drop5d <= -7, drop5d, val: (drop5d >= 0 ? '+' : '') + drop5d.toFixed(1) + '%' };
}

// ── 풀백 합의 모델 ──
export function pbConsensus(priceSig, rsiSig, volSig, gate, dropSpeed) {
  const dirs = [priceSig.dir, rsiSig.dir, volSig.dir];
  const bCount = dirs.filter(d => d === 'B').length;
  const sCount = dirs.filter(d => d === 'S').length;
  const summary = dirs.join('+');

  let con, action;

  if (dropSpeed.fast) {
    return { consensus: 'NEUTRAL', action: '관망 (급락감지)', summary, bCount, sCount };
  }

  const weakTrend = gate.strength === 'weak';
  const hasConflict = bCount > 0 && sCount > 0;

  if (hasConflict) {
    con = 'NEUTRAL'; action = '관망';
  } else if (bCount === 3) {
    const strongBuys = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY BUY').length;
    if (weakTrend) {
      con = 'BUY'; action = '소량 진입 (추세 약)';
    } else {
      con = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
      action = strongBuys >= 2 ? '즉시 진입' : '진입';
    }
  } else if (bCount === 2 && sCount === 0) {
    if (weakTrend) {
      con = 'NEUTRAL'; action = '관망 (추세 약)';
    } else {
      const strongBuys = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY BUY').length;
      con = strongBuys >= 2 ? 'STRONGLY BUY' : 'BUY';
      action = strongBuys >= 2 ? '즉시 진입' : '진입';
    }
  } else if (sCount === 3) {
    const strongSells = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY SELL').length;
    con = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else if (sCount === 2 && bCount === 0) {
    const strongSells = [priceSig, rsiSig, volSig].filter(s => s.signal === 'STRONGLY SELL').length;
    con = strongSells >= 2 ? 'STRONGLY SELL' : 'SELL';
    action = strongSells >= 2 ? '즉시 청산' : '청산';
  } else {
    con = 'NEUTRAL'; action = '관망';
  }

  return { consensus: con, action, summary, bCount, sCount };
}

// ── 포지션 관리 (Pullback) ──
export function getPbPositions() {
  try { return JSON.parse(localStorage.getItem(PB_POS_KEY)) || {}; } catch { return {}; }
}
export function savePbPositions(pos) {
  localStorage.setItem(PB_POS_KEY, JSON.stringify(pos));
}

let _deps = {};
export function setPullbackDeps(deps) { _deps = deps; }

export function openPbBuy(sym) {
  const priceStr = prompt(`[Pullback] ${sym} 매수 단가 (USD):`);
  if (priceStr === null || priceStr === '') return;
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) { alert('유효한 가격을 입력하세요'); return; }
  const sharesStr = prompt(`[Pullback] ${sym} 매수 수량 (주):`);
  if (sharesStr === null || sharesStr === '') return;
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) { alert('유효한 수량을 입력하세요'); return; }
  const pos = getPbPositions();
  pos[sym] = { buyPrice: price, shares, buyDate: new Date().toISOString().slice(0, 10), amount: price * shares };
  savePbPositions(pos);
  if (_deps.renderStockList) _deps.renderStockList();
  if (_deps.renderPortfolioSummary) _deps.renderPortfolioSummary();
}

export function editPbPosition(sym) {
  const pos = getPbPositions();
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
  savePbPositions(pos);
  if (_deps.renderStockList) _deps.renderStockList();
  if (_deps.renderPortfolioSummary) _deps.renderPortfolioSummary();
}

export function closePbPosition(sym) {
  if (!confirm(`[Pullback] ${sym} 포지션을 매도 완료 처리할까요?`)) return;
  const pos = getPbPositions();
  delete pos[sym];
  savePbPositions(pos);
  if (_deps.renderStockList) _deps.renderStockList();
  if (_deps.renderPortfolioSummary) _deps.renderPortfolioSummary();
}

// ── 렌더 (테이블 형식, 레거시) ──

export function renderPullbackJudge() {
  const el = document.getElementById('fin-pullback-judge');
  if (!el) return;
  if (Object.keys(S.swingData).length === 0) {
    el.innerHTML = '<div style="color:var(--muted);font-size:11px;padding:12px;text-align:center">데이터 없음</div>';
    return;
  }

  const positions = getPbPositions();
  const UP = '#ef4444';
  const DN = '#fa342c';
  const _chgColor = v => v > 0 ? UP : v < 0 ? DN : 'var(--muted)';

  const results = M7.map(t => {
    const d = S.swingData[t.sym];
    if (!d || !d.closes.length) return { sym: t.sym, name: t.name, noData: true };
    const gate = trendGate(d.closes);
    const priceSig = pbPriceSignal(d.closes);
    const rsi = calcRSI(d.closes, 14);
    const rsiSig = pbRsiSignal(rsi);
    const volSig = pbVolumeSignal(d.volumes, d.closes);
    const dropSpeed_ = pbDropSpeed(d.closes);
    let con;
    if (!gate.active && !gate.near) {
      con = { consensus: 'OFF', action: '비활성 (전략A 검토)', summary: '-', bCount: 0, sCount: 0 };
    } else {
      con = pbConsensus(priceSig, rsiSig, volSig, gate, dropSpeed_);
      if (gate.near && !con.action.includes('추세')) con.action += ' (추세 경계)';
    }
    return { sym: t.sym, name: t.name, price: d.price, change: d.change, gate, priceSig, rsiSig, volSig, dropSpeed: dropSpeed_, con };
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
      ${signalBadge(r.con.consensus)}
      <div style="margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--muted)">${r.con.summary}</div>
      <div style="font-size:9px;font-weight:600;color:var(--muted2);margin-top:2px">${r.con.action}</div>
    </td>`;
  });
  html += `</tr>`;

  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;color:var(--muted2)">20SMA 이격</td>`;
  results.forEach(r => {
    if (r.noData || !r.priceSig) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.priceSig.val}</div>
      <div style="margin-top:2px">${dirBadge(r.priceSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  html += `<tr><td style="padding:5px 4px;color:var(--muted2)">RSI(14)</td>`;
  results.forEach(r => {
    if (r.noData || !r.rsiSig) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.rsiSig.val}</div>
      <div style="margin-top:2px">${dirBadge(r.rsiSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

  html += `<tr style="background:var(--surface2)"><td style="padding:5px 4px;color:var(--muted2)">거래량 추세</td>`;
  results.forEach(r => {
    if (r.noData || !r.volSig) { html += `<td style="text-align:center;padding:5px 3px;color:var(--muted)">-</td>`; return; }
    html += `<td style="text-align:center;padding:5px 3px">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text)">${r.volSig.val}</div>
      <div style="margin-top:2px">${dirBadge(r.volSig.dir)}</div>
    </td>`;
  });
  html += `</tr>`;

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

  html += `<tr style="border-top:2px solid var(--border)"><td style="padding:6px 4px;font-weight:700;color:var(--muted2)">포지션</td>`;
  results.forEach(r => {
    const pos = positions[r.sym];
    if (pos) {
      const curPrice = r.price || 0;
      const pnl = (curPrice - pos.buyPrice) * pos.shares;
      const pnlPct = pos.buyPrice > 0 ? ((curPrice - pos.buyPrice) / pos.buyPrice * 100) : 0;
      const UP = '#ef4444', DN = '#fa342c';
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
  html += `<div style="font-size:8px;color:var(--muted);text-align:right;margin-top:4px;padding-right:4px">Pullback · 50SMA>200SMA 전제 · USD/KRW ${S.fxRate.toLocaleString()} · ${new Date().toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>`;
  el.innerHTML = html;
}
