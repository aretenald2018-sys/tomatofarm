import { dateKey, TODAY } from '../data.js';

export const CARD_STYLE = 'background:var(--hig-surface);border:1px solid var(--hig-separator);border-radius:18px;padding:16px;margin-bottom:16px;';
export const SECTION_TITLE = 'font-size:17px;font-weight:600;letter-spacing:-0.41px;';

export function dk(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}

export function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDateShort(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
}

export function relativeDay(daysAgoVal) {
  if (daysAgoVal === undefined || daysAgoVal === null || daysAgoVal > 14) return '14d+';
  if (daysAgoVal === 0) return 'today';
  if (daysAgoVal === 1) return 'yesterday';
  return `${daysAgoVal}d ago`;
}

export function nameResolver(accs) {
  return (id) => {
    const account = accs.find((x) => x.id === id);
    return account ? (account.nickname || `${account.lastName || ''}${account.firstName || ''}`) : (id || '?').replace(/_/g, '');
  };
}

export function todayKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

export function deltaText(current, previous, suffix = '') {
  if (previous === 0 && current === 0) return '<span class="hig-caption1" style="color:var(--hig-gray1);">No change</span>';
  const diff = current - previous;
  if (diff === 0) return '<span class="hig-caption1" style="color:var(--hig-gray1);">No change</span>';
  const arrow = diff > 0 ? '▲' : '▼';
  const color = diff > 0 ? 'var(--hig-green)' : 'var(--hig-red)';
  return `<span class="hig-caption1" style="color:${color};">${arrow}${Math.abs(diff)}${suffix}</span>`;
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stageColor(stage) {
  switch (stage) {
    case 'new': return 'var(--hig-teal)';
    case 'activated': return 'var(--hig-blue)';
    case 'engaged': return 'var(--hig-green)';
    case 'at-risk': return 'var(--hig-orange)';
    case 'dormant': return 'var(--hig-red)';
    default: return 'var(--hig-gray1)';
  }
}

export function stageLabel(stage) {
  switch (stage) {
    case 'new': return 'New';
    case 'activated': return 'Activated';
    case 'engaged': return 'Engaged';
    case 'at-risk': return 'At-Risk';
    case 'dormant': return 'Dormant';
    default: return '-';
  }
}

export function tierColor(tier) {
  switch (tier) {
    case 'power': return 'var(--hig-purple)';
    case 'regular': return 'var(--hig-blue)';
    case 'casual': return 'var(--hig-orange)';
    case 'inactive': return 'var(--hig-gray1)';
    default: return 'var(--hig-gray1)';
  }
}

export function tierLabel(tier) {
  switch (tier) {
    case 'power': return 'Power';
    case 'regular': return 'Regular';
    case 'casual': return 'Casual';
    case 'inactive': return 'Inactive';
    default: return '-';
  }
}

export function trajectoryColor(trajectory) {
  switch (trajectory) {
    case 'improving': return 'var(--hig-green)';
    case 'declining': return 'var(--hig-red)';
    default: return 'var(--hig-gray1)';
  }
}

export function trajectoryLabel(trajectory) {
  switch (trajectory) {
    case 'improving': return 'Improving';
    case 'declining': return 'Declining';
    case 'stable': return 'Stable';
    default: return '-';
  }
}

export function trajectoryArrow(trajectory) {
  if (trajectory === 'improving') return '↗';
  if (trajectory === 'declining') return '↘';
  return '→';
}

export function healthRing(score, size = 72) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const color = pct >= 70 ? 'var(--hig-green)' : pct >= 40 ? 'var(--hig-orange)' : 'var(--hig-red)';
  return `
    <div class="hig-score-ring" style="--ring-size:${size}px;--ring-value:${pct};--ring-color:${color};">
      <span class="hig-headline">${Math.round(pct)}</span>
    </div>
  `;
}

export function sparklineBars(values = []) {
  const safe = values.map((v) => Math.max(0, Math.min(1, Number(v) || 0)));
  return `
    <div class="hig-sparkline">
      ${safe.map((v) => `<span style="height:${Math.max(14, Math.round(v * 100))}%;"></span>`).join('')}
    </div>
  `;
}
