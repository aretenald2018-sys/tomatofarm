import { sumDayNutrient } from '../diet/day-nutrition.js';
import {
  getBodyCheckins,
  getLatestCheckinWeight,
} from '../data.js';
import {
  calcBurnedKcal,
  calcDayScore,
  getDayTargetKcal,
} from '../calc.js';
import { dateKey } from '../data/data-date.js';
import { buildCalendarActivityRows } from './activity-model.js';
import { isTrustedRunningCalories } from '../workout/running-analytics.js';

export function _sortedCheckins() {
  return (getBodyCheckins() || [])
    .filter(c => c?.date && typeof c.weight === 'number' && isFinite(c.weight))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function _weightAt(sortedCheckins, key) {
  for (let i = sortedCheckins.length - 1; i >= 0; i--) {
    if (sortedCheckins[i].date <= key) return sortedCheckins[i].weight;
  }
  return null;
}

export function _shiftDateKey(key, days) {
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function _maxWeakMetrics(day) {
  const meta = day?.maxMeta;
  if (!meta || meta.mode !== 'max') return null;
  const block = meta.weakBlock || {};
  const activeAdd = block.activeStartedAt ? Math.max(0, Math.floor((Date.now() - block.activeStartedAt) / 1000)) : 0;
  const durationSec = Math.max(0, Math.floor(Number(block.durationSec) || 0) + activeAdd);
  const summary = meta.weakSummary || {};
  const sets = Math.max(0, Number(summary.sets) || 0);
  const volume = Math.max(0, Math.round(Number(summary.volume) || 0));
  const selected = Array.isArray(meta.selectedWeakParts) ? meta.selectedWeakParts : [];
  const bonus = Math.min(5, Math.floor(durationSec / 600) + Math.floor(sets / 4));
  return {
    durationSec,
    durationMin: Math.floor(durationSec / 60),
    sets,
    volume,
    selected,
    bonus,
    hasAny: durationSec > 0 || sets > 0 || selected.length > 0,
  };
}

// ═════════════════════════════════════════════════════════════
// 한 날짜의 전체 메트릭 계산
// ═════════════════════════════════════════════════════════════
export function _dayMetrics(key, day, plan, metrics, checkins) {
  // 체중 (stepwise)
  const weight = _weightAt(checkins, key);
  const bodyWeight = weight != null
    ? weight
    : (getLatestCheckinWeight() ?? plan?.weight ?? 70);

  // 섭취 칼로리
  const kcalIn = sumDayNutrient(day, 'kcal');

  // 소모 칼로리 (MET 기반)
  const burned = calcBurnedKcal(day, bodyWeight);

  // 목표 칼로리 & 탄단지
  let targetKcal = 0;
  let macroTarget = null;
  if (plan && plan.weight && plan.height) {
    const [yy, mm, dd] = key.split('-').map(n => parseInt(n, 10));
    try {
      targetKcal = getDayTargetKcal(plan, yy, mm - 1, dd, day);
      const dow = new Date(yy, mm - 1, dd).getDay();
      const isRefeed = (plan.refeedDays || []).includes(dow);
      const macro = isRefeed ? metrics.refeed : metrics.deficit;
      macroTarget = { proteinG: macro.proteinG, carbG: macro.carbG, fatG: macro.fatG };
    } catch (_) { /* plan 불완전 */ }
  }

  // 체중 방향성 (7일전 대비)
  let weightDeltaKg = null;
  let weightDirSign = -1; // 기본: 감량
  if (plan && plan.targetWeight && plan.weight) {
    weightDirSign = plan.targetWeight < plan.weight ? -1
                  : plan.targetWeight > plan.weight ? +1 : 0;
  }
  if (weight != null) {
    const prevKey = _shiftDateKey(key, -7);
    const prevW = _weightAt(checkins, prevKey);
    if (prevW != null) weightDeltaKg = weight - prevW;
  }

  // 점수
  const scoreResult = calcDayScore({
    day, targetKcal, macroTarget, burnedKcal: burned.total,
    weightDeltaKg, weightDirSign,
  });
  const maxWeak = _maxWeakMetrics(day);
  const baseScore = scoreResult.score;
  const score = baseScore != null
    ? Math.min(100, baseScore + (maxWeak?.bonus || 0))
    : baseScore;
  const band =
    score == null ? scoreResult.band :
    score >= 95 ? 'great' :
    score >= 90 ? 'good' :
    score >= 80 ? 'soso' : 'bad';

  return {
    key, day,
    kcalIn, kcalBurned: burned.total, burnedBreakdown: burned,
    weight,
    targetKcal, macroTarget,
    weightDeltaKg, weightDirSign,
    score,
    band,
    breakdown: scoreResult.breakdown,
    maxWeak,
  };
}

export function _activityRows(day) {
  return buildCalendarActivityRows(day, { isTrustedRunningCalories });
}
