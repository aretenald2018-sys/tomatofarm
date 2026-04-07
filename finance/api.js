// ================================================================
// finance/api.js — CORS 프록시, 시세 API, RSI 계산
// ================================================================

import { QUOTE_CACHE_KEY, QUOTE_CACHE_TIME, QUOTE_CACHE_MIN } from './state.js';

const _CORS_PROXIES = [
  url => 'https://corsproxy.io/?' + encodeURIComponent(url),
  url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
  url => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
];

export function calcRSI(closes, period = 14) {
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

export async function proxyFetch(url) {
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}
  for (const proxy of _CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (!res.ok) continue;
      return await res.json();
    } catch { continue; }
  }
  throw new Error('all proxies failed');
}

export async function fetchAllQuotes(symbols) {
  const now = Date.now();
  const lastTime = parseInt(localStorage.getItem(QUOTE_CACHE_TIME) || '0');
  if ((now - lastTime) < QUOTE_CACHE_MIN * 60000) {
    try {
      const cached = JSON.parse(localStorage.getItem(QUOTE_CACHE_KEY));
      if (cached && Object.keys(cached).length > 0) return cached;
    } catch {}
  }

  const result = {};
  for (const sym of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1mo&interval=1d`;
      const data = await proxyFetch(url);
      const item = data?.chart?.result?.[0];
      if (!item?.meta?.regularMarketPrice) continue;

      const meta = item.meta;
      const price = meta.regularMarketPrice;
      const closes = item.indicators?.quote?.[0]?.close?.filter(c => c != null) || [];
      const prevDayClose = closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose || price);
      const change = prevDayClose > 0 ? ((price - prevDayClose) / prevDayClose * 100) : 0;
      const rsi = calcRSI(closes);

      result[sym] = { price, change: parseFloat(change.toFixed(2)), rsi };
    } catch (e) {
      console.warn(`[finance] ${sym} fetch failed:`, e.message);
    }
  }

  localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(result));
  localStorage.setItem(QUOTE_CACHE_TIME, String(now));
  return result;
}
