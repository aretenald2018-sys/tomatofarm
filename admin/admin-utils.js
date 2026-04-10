// ================================================================
// admin/admin-utils.js — 어드민 공유 유틸리티
// ================================================================

import { dateKey, TODAY } from '../data.js';

/** dateKey 생성 */
export function dk(d) { return dateKey(d.getFullYear(), d.getMonth(), d.getDate()); }

/** N일 전 Date 객체 */
export function daysAgo(n) { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; }

/** 타임스탬프 → "M/D H:MM" */
export function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/** 타임스탬프 → "M/D(요일)" */
export function fmtDateShort(ts) {
  const d = new Date(ts);
  const dow = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getMonth()+1}/${d.getDate()}(${dow})`;
}

/** 상대 시간 ("오늘", "어제", "3일 전", "14일+ 미활동") */
export function relativeDay(daysAgoVal) {
  if (daysAgoVal === undefined || daysAgoVal === null || daysAgoVal > 14) return '14일+ 미활동';
  if (daysAgoVal === 0) return '오늘';
  if (daysAgoVal === 1) return '어제';
  return `${daysAgoVal}일 전`;
}

/** 계정 리스트에서 이름 해석 */
export function nameResolver(accs) {
  return (id) => {
    const a = accs.find(x => x.id === id);
    return a ? (a.nickname || a.lastName + a.firstName) : (id || '?').replace(/_/g, '');
  };
}

/** 오늘 dateKey */
export function todayKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

/** TDS 카드 래퍼 스타일 */
export const CARD_STYLE = 'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:16px;';

/** 섹션 제목 스타일 */
export const SECTION_TITLE = 'font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;';

/** 숫자 변화량 화살표 */
export function deltaText(current, previous) {
  if (previous === 0 && current === 0) return '';
  const diff = current - previous;
  if (diff === 0) return '<span style="font-size:10px;color:var(--text-tertiary);">→ 동일</span>';
  const arrow = diff > 0 ? '↑' : '↓';
  const color = diff > 0 ? '#22c55e' : '#ef4444';
  return `<span style="font-size:10px;color:${color};">${arrow}${Math.abs(diff)}</span>`;
}
