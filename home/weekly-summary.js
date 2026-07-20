// 홈 오늘/이번 주 요약 — 저장된 day cache와 시즌 보드를 직접 집계하는 읽기 전용 카드.

import {
  TODAY,
  calcDietMetrics,
  dateKey,
  getCache,
  getDietPlan,
  getSeasonBundleForDate,
} from '../data.js';
import { buildWeeklySummaryModel } from './weekly-summary-model.js';
import { renderSummaryMarkup } from './weekly-summary-view.js';

export { renderSummaryMarkup };

function resolveDietTarget(plan) {
  if (!plan?._userSet) return null;
  try {
    const metrics = calcDietMetrics(plan);
    const target = (plan.refeedDays || []).includes(TODAY.getDay()) ? metrics.refeed : metrics.deficit;
    if (!target || Number(target.kcal) <= 0) return null;
    return {
      kcal: Number(target.kcal) || 0,
      proteinG: Number(target.proteinG) || 0,
      carbG: Number(target.carbG) || 0,
      fatG: Number(target.fatG) || 0,
    };
  } catch (error) {
    console.warn('[weekly-summary] diet target unavailable:', error?.message || error);
    return null;
  }
}

export function renderWeeklySummary() {
  const root = document.getElementById('home-weekly-summary');
  if (!root) return;
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const dietPlan = getDietPlan();
  const season = getSeasonBundleForDate(todayKey);
  const model = buildWeeklySummaryModel({
    cache: getCache(),
    today: TODAY,
    dietTarget: resolveDietTarget(dietPlan),
    workoutTargetDays: season?.workoutPlan?.weeklySessionTarget,
    board: season?.board || null,
  });
  root.innerHTML = renderSummaryMarkup(model);
  root.dataset.summarySource = 'local-day-cache';
}
