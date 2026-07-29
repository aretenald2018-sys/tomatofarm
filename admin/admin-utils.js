import { dateKey, TODAY } from '../data.js';

// ── HTML 이스케이프는 ../utils/escape-html.js 의 정본을 그대로 재수출한다 ──
export { escapeHtml } from '../utils/escape-html.js';

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

export function nameResolver(accs) {
  return (id) => {
    const account = accs.find((x) => x.id === id);
    return account ? (account.nickname || `${account.lastName || ''}${account.firstName || ''}`) : (id || '?').replace(/_/g, '');
  };
}

export function todayKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

export function fmtReadDelay(createdAt, readAt) {
  if (!createdAt || !readAt) return '';
  const diff = Math.max(0, readAt - createdAt);
  if (diff < 60 * 1000) return `${Math.round(diff / 1000)}초 뒤 읽음`;
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / 60000)}분 뒤 읽음`;
  if (diff < 24 * 60 * 60 * 1000) {
    const h = Math.floor(diff / 3600000);
    const m = Math.round((diff - h * 3600000) / 60000);
    return m ? `${h}시간 ${m}분 뒤 읽음` : `${h}시간 뒤 읽음`;
  }
  const days = Math.floor(diff / 86400000);
  return `${days}일 뒤 읽음`;
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
