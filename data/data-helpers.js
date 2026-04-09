// ── 유틸리티 헬퍼 ────────────────────────────────────────────────
import { MUSCLES } from '../config.js';

export function _getQuarterKeyNow() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

export function _sortExList(list) {
  const mOrder = MUSCLES.map(m => m.id);
  return list.sort((a,b) => {
    const mi = mOrder.indexOf(a.muscleId) - mOrder.indexOf(b.muscleId);
    return mi !== 0 ? mi : (a.order||99) - (b.order||99);
  });
}
