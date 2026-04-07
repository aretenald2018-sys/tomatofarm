// ================================================================
// finance/utils.js — UI 헬퍼
// ================================================================

import { S } from './state.js';

export const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

function _c(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

export function chartColors() {
  return {
    tick: _c('--chart-tick') || '#5c6478',
    grid: _c('--chart-grid') || '#2c3040',
    label: _c('--chart-label') || '#e2e4ea',
    ttTitle: _c('--chart-tooltip-title') || '#e2e4ea',
    ttBody: _c('--chart-tooltip-body') || '#a0a6b8',
    bg: _c('--chart-bg') || '#1e2028',
    text: _c('--text') || '#f5f5f7',
    border: _c('--border') || '#2c2c2e',
  };
}

export function getCC() {
  if (!S.cc) S.cc = chartColors();
  return S.cc;
}

export function getMarketStatus() {
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

export function signalBadge(signal) {
  const colors = {
    'STRONGLY BUY': { bg: '#4c0519', color: '#fca5a5', text: 'S.BUY' },
    'BUY': { bg: '#4c0519', color: '#f87171', text: 'BUY' },
    'NEUTRAL': { bg: '#1e293b', color: '#94a3b8', text: 'HOLD' },
    'SELL': { bg: '#172554', color: '#93c5fd', text: 'SELL' },
    'STRONGLY SELL': { bg: '#172554', color: '#fc6a66', text: 'S.SELL' },
  };
  const c = colors[signal] || colors['NEUTRAL'];
  return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;font-family:'JetBrains Mono',monospace;background:${c.bg};color:${c.color};white-space:nowrap">${c.text}</span>`;
}

export function dirBadge(dir) {
  const m = { B: { bg: '#4c0519', c: '#f87171' }, S: { bg: '#172554', c: '#fc6a66' }, N: { bg: '#1e293b', c: '#94a3b8' } };
  const d = m[dir] || m.N;
  return `<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;font-size:10px;font-weight:700;font-family:'JetBrains Mono',monospace;background:${d.bg};color:${d.c}">${dir}</span>`;
}

export function compactBadge(consensus, label) {
  const m = {
    'STRONGLY BUY': {bg:'rgba(239,68,68,0.15)',c:'#ef4444',t:'S.BUY'},
    'BUY': {bg:'rgba(239,68,68,0.12)',c:'#ef4444',t:'BUY'},
    'NEUTRAL': {bg:'rgba(148,163,184,0.15)',c:'var(--text-secondary)',t:'HOLD'},
    'SELL': {bg:'rgba(59,130,246,0.12)',c:'#fa342c',t:'SELL'},
    'STRONGLY SELL': {bg:'rgba(59,130,246,0.15)',c:'#fa342c',t:'S.SELL'},
    'OFF': {bg:'rgba(148,163,184,0.1)',c:'var(--text-tertiary)',t:'OFF'},
  };
  const s = m[consensus] || m['NEUTRAL'];
  return `<span class="fin-sr-badge" style="background:${s.bg};color:${s.c}" title="전략${label}">${s.t}</span>`;
}
