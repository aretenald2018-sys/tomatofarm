// ── 유틸리티 헬퍼 ────────────────────────────────────────────────
import { MUSCLES } from '../config.js';
import { _customMuscles } from './data-core.js';

export function _getQuarterKeyNow() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

export function _sortExList(list) {
  const mOrder = [...MUSCLES, ..._customMuscles].map(m => m.id);
  return list.sort((a,b) => {
    const ai = mOrder.indexOf(a.muscleId);
    const bi = mOrder.indexOf(b.muscleId);
    const mi = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return mi !== 0 ? mi : (a.order||99) - (b.order||99);
  });
}
