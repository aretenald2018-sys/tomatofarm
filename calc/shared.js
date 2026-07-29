// calc/shared.js — 계산 도메인의 최소 공용 수치/세트 판정

export function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function isWorkSet(set) {
  if (!set) return false;
  if (set.setType === 'warmup') return false;
  if (set.done === true) return true;
  if (set.done === false) return false;
  return (set.kg || 0) > 0 && (set.reps || 0) > 0;
}
