// ================================================================
// finance/state.js — 공유 상태 & 상수
// ================================================================

export const M7 = [
  { sym: 'AAPL', name: '애플' },
  { sym: 'GOOG', name: '알파벳' },
  { sym: 'AMZN', name: '아마존' },
  { sym: 'NVDA', name: '엔비디아' },
  { sym: 'META', name: '메타' },
  { sym: 'TSLA', name: '테슬라' },
];

export const QUOTE_CACHE_KEY = 'fin_quotes';
export const QUOTE_CACHE_TIME = 'fin_quotes_time';
export const QUOTE_CACHE_MIN = 3; // 3분 캐시
export const SWING_CACHE_KEY = 'swing_ohlc_cache';
export const SWING_CACHE_TIME = 'swing_ohlc_time';
export const SWING_POS_KEY = 'swing_positions';
export const PB_POS_KEY = 'pullback_positions';

// 공유 mutable 상태 (모든 모듈이 import해서 읽기/쓰기)
export const S = {
  quotesMap: {},
  fxRate: 1450,
  fngData: null,
  mainChartInstance: null,
  recent5ChartInstance: null,
  flowChartInstance: null,
  stockPriceChart: null,
  stockVolumeChart: null,
  stockRsiChart: null,
  currentStockSym: null,
  liveChart: null,
  liveVolumeChart: null,
  liveInterval: null,
  liveAutoRefresh: true,
  finChartYAxisBlurred: true,
  swingData: {},
  collapsed: { benchmark: false, reality: false, invest: false, budget: false },
  budgetYear: new Date().getFullYear(),
  budgetQ: Math.ceil((new Date().getMonth() + 1) / 3),
  sdCurrentTab: 'chart',
  cc: null,
  stockChartData: null,
};
