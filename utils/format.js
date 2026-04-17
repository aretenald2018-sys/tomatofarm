// ================================================================
// utils/format.js — 로케일 포맷 유틸 (한국어 기준)
//   - fmtKcal(n): 칼로리. 1000+ 는 천 단위 구분자 (예: "1,234 kcal")
//   - fmtNumber(n, opts): 천 단위 구분자 + 소수점 자리수 제어
//   - fmtWeight(kg): 체중. 소수 1자리 + "kg"
//   - fmtMacro(g): 탄/단/지. 정수 + "g"
//   - fmtDate(d, style): "MM/DD" | "M월 D일" | "ISO" | "short" | "long"
//   - fmtDayOfWeek(d): "월", "화" ...
//   - fmtRelative(d): "방금", "3분 전", "어제" ...
//   - fmtStreak(n): 스트릭. "7일째"
//
// 점진 마이그레이션 대상: 기존 toFixed(), Math.round() 호출처
// ================================================================

const KR_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 숫자 포맷. 기본 천 단위 구분자 + 정수.
 * @param {number|string} n
 * @param {object} [opts]
 * @param {number} [opts.decimals=0] - 소수점 자리수
 * @param {boolean} [opts.grouping=true] - 천 단위 구분자
 */
export function fmtNumber(n, opts = {}) {
  const { decimals = 0, grouping = true } = opts;
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  const options = { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping };
  try {
    return num.toLocaleString('ko-KR', options);
  } catch {
    return num.toFixed(decimals);
  }
}

export function fmtKcal(n) {
  const num = Math.round(Number(n) || 0);
  return `${fmtNumber(num)} kcal`;
}

export function fmtWeight(kg) {
  const num = Number(kg);
  if (!Number.isFinite(num)) return '-';
  return `${fmtNumber(num, { decimals: 1 })}kg`;
}

export function fmtMacro(g) {
  const num = Math.round(Number(g) || 0);
  return `${fmtNumber(num)}g`;
}

/**
 * 날짜 포맷.
 * @param {Date|string|number} d
 * @param {'MM/DD'|'short'|'long'|'ISO'|'iso'|'full'} [style='MM/DD']
 */
export function fmtDate(d, style = 'MM/DD') {
  const date = _toDate(d);
  if (!date) return '-';
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const day = date.getDate();
  const dow = KR_DAYS[date.getDay()];
  switch (style) {
    case 'ISO':
    case 'iso':
      return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    case 'short':
      return `${m}월 ${day}일`;
    case 'long':
      return `${y}년 ${m}월 ${day}일 (${dow})`;
    case 'full':
      return `${y}. ${String(m).padStart(2,'0')}. ${String(day).padStart(2,'0')} (${dow})`;
    case 'MM/DD':
    default:
      return `${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
  }
}

/**
 * 요일만. 기본 "월" "화" 형식.
 */
export function fmtDayOfWeek(d) {
  const date = _toDate(d);
  if (!date) return '-';
  return KR_DAYS[date.getDay()];
}

/**
 * 상대 시간. "방금", "5분 전", "어제", "3일 전" ...
 */
export function fmtRelative(d) {
  const date = _toDate(d);
  if (!date) return '-';
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 30) return '방금';
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return '어제';
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}개월 전`;
  return `${Math.floor(diffDay / 365)}년 전`;
}

export function fmtStreak(n) {
  const num = Math.floor(Number(n) || 0);
  if (num <= 0) return '스트릭 없음';
  return `${fmtNumber(num)}일째`;
}

// ── 내부 ───────────────────────────────────────────────────────
function _toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return Number.isFinite(d.getTime()) ? d : null;
  const date = new Date(d);
  return Number.isFinite(date.getTime()) ? date : null;
}

// ── 전역 노출 (뷰 코드에서 바로 사용) ───────────────────────────
if (typeof window !== 'undefined') {
  window.fmtKcal = fmtKcal;
  window.fmtNumber = fmtNumber;
  window.fmtWeight = fmtWeight;
  window.fmtMacro = fmtMacro;
  window.fmtDate = fmtDate;
  window.fmtDayOfWeek = fmtDayOfWeek;
  window.fmtRelative = fmtRelative;
  window.fmtStreak = fmtStreak;
}
