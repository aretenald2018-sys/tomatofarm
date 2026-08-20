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

// 그날 실제로 입력한 체중만 돌려준다. 표시용 — 입력이 없는 날은 빈칸으로
// 보여야 하므로 _weightAt(이월)과 달리 과거 값을 끌어오지 않는다.
export function _weightRecordedAt(sortedCheckins, key) {
  for (let i = sortedCheckins.length - 1; i >= 0; i--) {
    if (sortedCheckins[i].date === key) return sortedCheckins[i].weight;
    if (sortedCheckins[i].date < key) break;
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
  // 계산용 체중(stepwise 이월): 소모 칼로리·체중 방향 점수는 값이 필요하다.
  const stepWeight = _weightAt(checkins, key);
  // 표시용 체중: 그날 입력한 값만. 없는 날은 캘린더/상세에서 빈칸으로 보인다.
  const weight = _weightRecordedAt(checkins, key);
  const bodyWeight = stepWeight != null
    ? stepWeight
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
  // 방향 점수는 기존대로 이월(stepwise) 체중으로 계산해 점수 이력이 변하지 않는다.
  if (stepWeight != null) {
    const prevKey = _shiftDateKey(key, -7);
    const prevW = _weightAt(checkins, prevKey);
    if (prevW != null) weightDeltaKg = stepWeight - prevW;
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
