// ================================================================
// stocks.js — Yahoo Finance + RSI (API 키 불필요)
// ================================================================

import { CONFIG } from './config.js';
import { getStockPurchases } from './data.js';

const CACHE_KEY      = 'stock_data';
const CACHE_TIME_KEY = 'stock_time';

const _CORS_PROXIES = [
  url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
];

const delay = ms => new Promise(r => setTimeout(r, ms));

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains  += diff;
    else           losses -= diff;
  }
  let avgGain = gains  / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(1));
}

async function _proxyFetch(url) {
  for (const proxy of _CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (!res.ok) continue;
      return await res.json();
    } catch { continue; }
  }
  throw new Error('all proxies failed');
}

/**
 * Yahoo Finance chart API — 시세 + 일별종가(RSI용) 동시 조회
 */
export async function fetchQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1mo&interval=1d`;
  const data = await _proxyFetch(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('invalid');

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change = prevClose > 0 ? ((price - prevClose) / prevClose * 100) : 0;

  const closes = result.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
  const rsi = calcRSI(closes);

  return {
    price,
    change: parseFloat(change.toFixed(2)),
    rsi,
  };
}

export async function loadStocks() {
  const now       = Date.now();
  const lastFetch = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0');

  if ((now - lastFetch) < CONFIG.STOCK_CACHE_HOURS * 3600000) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) { renderStocks(JSON.parse(cached)); return; }
  }

  _renderLoading();

  const results = CONFIG.TICKERS.map(t => ({ ...t, price:null, change:null, rsi:null }));

  for (let i = 0; i < CONFIG.TICKERS.length; i++) {
    const sym = CONFIG.TICKERS[i].sym;
    try {
      const quote = await fetchQuote(sym);
      results[i]  = { ...results[i], ...quote };
      renderStocks(results, true);
    } catch(e) {
      console.warn(`[stocks] ${sym}:`, e.message);
    }
    if (i < CONFIG.TICKERS.length - 1) await delay(300);
  }

  localStorage.setItem(CACHE_KEY, JSON.stringify(results));
  localStorage.setItem(CACHE_TIME_KEY, String(now));
  renderStocks(results);
}

function _renderLoading() {
  const el = document.getElementById('stock-row');
  if (!el) return;
  el.innerHTML = CONFIG.TICKERS.map(t => `
    <div class="stock-chip">
      <div class="s-ticker">${t.sym}</div><div class="s-name">${t.name}</div>
      <div class="s-price" style="color:var(--muted)">로딩중...</div>
      <div class="s-change change-flat">-</div>
      <div class="s-rsi">RSI <span class="rsi-val">-</span></div>
    </div>`).join('');
}

export function renderStocks(data, partial = false) {
  const purchases = getStockPurchases();
  const stockRow = document.getElementById('stock-row');
  if (!stockRow) return;
  stockRow.innerHTML = data.map(s => {
    const p = purchases[s.sym];
    let purchaseHtml = '';
    if (p) {
      const shares     = p.qty ? p.qty : (p.amount / p.price);
      const currentVal = s.price ? shares * s.price : null;
      const profit     = currentVal ? currentVal - p.amount : null;
      const profitPct  = profit ? (profit / p.amount * 100) : null;
      const profColor  = profit > 0 ? 'var(--streak)' : profit < 0 ? 'var(--diet-bad)' : 'var(--muted)';
      const profSign   = profit > 0 ? '+' : '';
      const qtyStr     = p.qty ? `${p.qty}주 · ` : '';
      purchaseHtml = `
        <div class="s-purchase">
          <span class="s-buy-info">${p.date} · ${qtyStr}매입 $${p.price} · $${p.amount.toLocaleString()}</span>
          ${profitPct !== null ? `<span class="s-profit" style="color:${profColor}">${profSign}${profitPct.toFixed(1)}% (${profSign}$${Math.abs(profit).toFixed(0)})</span>` : ''}
          <button class="s-edit-btn" onclick="openStockPurchaseModal('${s.sym}')">✏️</button>
        </div>`;
    } else {
      purchaseHtml = `<button class="s-add-purchase-btn" onclick="openStockPurchaseModal('${s.sym}')">+ 매입 정보</button>`;
    }

    if (!s.price) return `
      <div class="stock-chip">
        <div class="s-ticker">${s.sym}</div><div class="s-name">${s.name}</div>
        <div class="s-price" style="color:var(--muted)">로딩중...</div>
        <div class="s-change change-flat">-</div>
        <div class="s-rsi">RSI <span class="rsi-val">-</span></div>
        ${purchaseHtml}
      </div>`;

    const chgClass = s.change > 0 ? 'change-up' : s.change < 0 ? 'change-down' : 'change-flat';
    const chgSign  = s.change > 0 ? '+' : '';
    return `
      <div class="stock-chip">
        <div class="s-ticker">${s.sym}</div><div class="s-name">${s.name}</div>
        <div class="s-price">$${s.price.toFixed(2)}</div>
        <div class="s-change ${chgClass}">${chgSign}${s.change.toFixed(2)}%</div>
        <div class="s-rsi">RSI <span class="rsi-val" style="color:${s.rsi!=null?(s.rsi>=70?'#ef4444':s.rsi<=30?'#10b981':'var(--text)'):'var(--muted)'}">${s.rsi != null ? s.rsi : '--'}</span></div>
        ${purchaseHtml}
      </div>`;
  }).join('');

  if (!partial) {
    document.getElementById('stock-updated').textContent =
      'Yahoo Finance · ' + new Date().toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
}
