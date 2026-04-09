// ── 외부 API (환율, Fear & Greed) ────────────────────────────────
const FX_CACHE_KEY = 'fx_usd_krw';
const FX_TIME_KEY  = 'fx_usd_krw_time';
const FX_CACHE_HOURS = 8;

export async function fetchExchangeRate() {
  const now = Date.now();
  const last = parseInt(localStorage.getItem(FX_TIME_KEY) || '0');
  if ((now - last) < FX_CACHE_HOURS * 3600000) {
    const cached = localStorage.getItem(FX_CACHE_KEY);
    if (cached) return parseFloat(cached);
  }
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=KRW');
    const data = await res.json();
    const rate = data.rates?.KRW;
    if (rate) {
      localStorage.setItem(FX_CACHE_KEY, String(rate));
      localStorage.setItem(FX_TIME_KEY, String(now));
      return rate;
    }
  } catch (e) {
    console.warn('[data] 환율 fetch 실패:', e.message);
  }
  const cached = localStorage.getItem(FX_CACHE_KEY);
  return cached ? parseFloat(cached) : 1450; // fallback
}

const FNG_CACHE_KEY  = 'fng_data';
const FNG_TIME_KEY   = 'fng_time';
const FNG_CACHE_HOURS = 4;

export async function fetchFearGreed() {
  const now = Date.now();
  const last = parseInt(localStorage.getItem(FNG_TIME_KEY) || '0');
  if ((now - last) < FNG_CACHE_HOURS * 3600000) {
    const cached = localStorage.getItem(FNG_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  }
  // 1차: CNN 직접 (CORS 실패 가능)
  try {
    const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    if (res.ok) {
      const data = await res.json();
      const score = Math.round(data?.fear_and_greed?.score ?? 0);
      const rating = data?.fear_and_greed?.rating ?? '';
      const result = { score, rating, source: 'cnn' };
      localStorage.setItem(FNG_CACHE_KEY, JSON.stringify(result));
      localStorage.setItem(FNG_TIME_KEY, String(now));
      return result;
    }
  } catch {}
  // 2차: api-server 프록시
  try {
    const res = await fetch('/api/fear-greed');
    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(FNG_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(FNG_TIME_KEY, String(now));
      return data;
    }
  } catch {}
  const cached = localStorage.getItem(FNG_CACHE_KEY);
  return cached ? JSON.parse(cached) : { score: null, rating: '', source: 'none' };
}
