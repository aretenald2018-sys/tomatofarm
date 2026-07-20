// 홈 오늘/이번 주 요약 — 저장된 day cache를 직접 집계하는 읽기 전용 카드.

import {
  TODAY,
  calcDietMetrics,
  dateKey,
  getCache,
  getDietPlan,
  getSeasonBundleForDate,
} from '../data.js';
import { buildWeeklySummaryModel } from './weekly-summary-model.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function number(value, digits = 0) {
  return (Number(value) || 0).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pace(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return value ? `${Math.floor(value / 60)}'${String(value % 60).padStart(2, '0')}"` : '—';
}

function percent(actual, target) {
  return Number(target) > 0 ? Math.max(0, Math.round((Number(actual) || 0) / Number(target) * 100)) : null;
}

function shortDate(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${month}/${day} (${WEEKDAYS[date.getDay()]})`;
}

function emptyState(message, actionLabel, tab) {
  return `<div class="summary-empty">
    <strong>${escapeHtml(message)}</strong>
    <span>실제 기록이 생기면 이곳에 집계됩니다.</span>
    ${tab ? `<button type="button" class="tds-btn tonal summary-empty-action" data-action="home:switch-tab" data-tab="${escapeHtml(tab)}">${escapeHtml(actionLabel)}</button>` : ''}
  </div>`;
}

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

function renderMacroRow(label, actual, target, tone) {
  const actualText = actual > 0 ? `${number(actual, actual % 1 ? 1 : 0)}g` : '미입력';
  const targetText = target > 0 ? ` / ${number(target)}g` : '';
  const progress = percent(actual, target);
  return `<div class="summary-macro-row">
    <div class="summary-macro-head"><span>${label}</span><strong>${actualText}${targetText}</strong><b>${progress == null ? '—' : `${progress}%`}</b></div>
    ${progress == null ? '<div class="summary-macro-no-target">목표 미설정</div>' : `<div class="summary-progress"><i class="${tone}" style="width:${Math.min(progress, 100)}%"></i></div>`}
  </div>`;
}

function renderDiet(model) {
  const view = model.today.diet;
  const target = view.target;
  const kcalProgress = percent(view.kcal, target?.kcal);
  const calorieText = view.kcal > 0 ? number(view.kcal) : '0';
  const body = view.recorded
    ? `<div class="summary-diet-body">
        <div class="summary-calorie-ring${kcalProgress == null ? ' no-target' : ''}" style="--summary-ring-progress:${Math.min(kcalProgress || 0, 100)}%" role="img" aria-label="오늘 섭취 칼로리 ${calorieText}킬로칼로리">
          <div class="summary-calorie-ring-center"><span class="summary-calorie-label">오늘 섭취</span><strong>${calorieText}</strong><span>${target ? `/ ${number(target.kcal)} kcal` : 'kcal · 목표 미설정'}</span><b>${kcalProgress == null ? '—' : `${kcalProgress}%`}</b></div>
        </div>
        <div class="summary-macro-list">
          ${renderMacroRow('탄수화물', view.carbG, target?.carbG, 'carb')}
          ${renderMacroRow('단백질', view.proteinG, target?.proteinG, 'protein')}
          ${renderMacroRow('지방', view.fatG, target?.fatG, 'fat')}
        </div>
      </div>`
    : emptyState('오늘 식단 기록이 없습니다', '식단 기록하기', 'diet');
  return `<article class="home-card summary-card summary-diet-card${view.recorded ? '' : ' is-empty'}" id="card-today-diet-summary">
    <div class="home-card-header"><span class="home-card-title">오늘 식단</span><span class="summary-pill">식사 ${view.mealCount}/4</span></div>
    ${body}
  </article>`;
}

function workoutActivityLabel(day) {
  const labels = [];
  if (day.activities.includes('strength')) labels.push(`근력 ${day.strengthSets}세트`);
  if (day.activities.includes('running')) labels.push('러닝');
  if (day.activities.includes('swimming')) labels.push('수영');
  if (day.activities.includes('crossfit')) labels.push('크로스핏');
  if (day.activities.includes('stretching')) labels.push('스트레칭');
  return labels.join(' · ') || '운동 기록';
}

function renderWorkout(model) {
  const view = model.current.workout;
  const goalText = model.workoutTargetDays ? `${view.workoutDays}/${model.workoutTargetDays}일` : `${view.workoutDays}일 기록`;
  const rows = view.days.map((day) => `<div class="summary-workout-row"><span>${shortDate(day.key)}</span><strong>${escapeHtml(workoutActivityLabel(day))}</strong></div>`).join('');
  return `<article class="home-card compact summary-card summary-split-card${view.workoutDays ? '' : ' is-empty'}" id="card-weekly-workout">
    <div class="home-card-header"><span class="home-card-title">이번 주 운동</span><strong class="summary-header-stat">${goalText}</strong></div>
    ${view.workoutDays ? `<div class="summary-workout-stats"><b>${view.sessionCount}회</b><span>세션</span><b>${view.strengthSets}세트</b><span>근력</span></div><div class="summary-workout-list">${rows}</div>` : emptyState('이번 주 운동 기록이 없습니다', '운동 기록하기', 'workout')}
  </article>`;
}

function chartPoints(records) {
  const values = records.map((record) => Number(record.avgPaceSecPerKm)).filter((value) => value > 0);
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  return values.map((value, index) => `${(index / Math.max(values.length - 1, 1) * 176 + 8).toFixed(1)},${(10 + ((max - value) / spread) * 42).toFixed(1)}`).join(' ');
}

function renderRunningChart(records) {
  if (!records.length) return '<div class="summary-chart-empty">실제 러닝 기록이 없어 그래프를 표시하지 않습니다.</div>';
  const points = chartPoints(records);
  const dots = records.map((record, index) => {
    const point = points.split(' ')[index].split(',');
    return `<circle cx="${point[0]}" cy="${point[1]}" r="${records.length === 1 ? 4 : 2.8}"><title>${escapeHtml(shortDate(record.dateKey))} ${pace(record.avgPaceSecPerKm)}/km</title></circle>`;
  }).join('');
  return `<svg class="summary-sparkline" viewBox="0 0 192 64" role="img" aria-label="실제 러닝 기록 ${records.length}회의 페이스 추세" preserveAspectRatio="none">
    <line x1="8" y1="58" x2="184" y2="58" class="summary-chart-axis"></line>
    ${records.length > 1 ? `<polyline points="${points}"></polyline>` : ''}${dots}
  </svg>`;
}

function renderRunning(model) {
  const view = model.current.running;
  const records = (view.records || []).filter((record) => Number(record.avgPaceSecPerKm) > 0);
  const body = view.activityCount
    ? `<div class="summary-running-layout"><div class="summary-running-copy"><div class="summary-pace"><strong>${pace(view.avgPaceSecPerKm)}</strong><span>/km</span></div><div class="summary-running-distance">${number(view.distanceKm, 2)}km · ${view.activityCount}회</div><div class="summary-running-previous">이번 주 실제 기록 기준</div></div>${renderRunningChart(records)}</div>`
    : emptyState('이번 주 러닝 기록이 없습니다', '러닝 기록하기', 'workout');
  return `<article class="home-card compact summary-card summary-split-card${view.activityCount ? '' : ' is-empty'}" id="card-weekly-running">
    <div class="home-card-header"><span class="home-card-title">이번 주 러닝</span><span class="summary-running-icon" aria-hidden="true">🏃</span></div>${body}
  </article>`;
}

function comparison(actual, previous, formatter, fallback) {
  if (actual > 0 && previous > 0) {
    const delta = Math.round((actual - previous) / previous * 100);
    return { value: `${delta >= 0 ? '+' : ''}${delta}%`, description: '지난주 같은 기간 대비' };
  }
  if (actual > 0) return { value: formatter(actual), description: '이번 주 실제 기록' };
  return { value: fallback, description: '비교할 기록이 없습니다' };
}

function renderChange(model) {
  const protein = comparison(model.current.diet.proteinG, model.previous.diet.proteinG, (value) => `${number(value)}g`, '기록 없음');
  const volume = comparison(model.current.workout.volumeKg, model.previous.workout.volumeKg, (value) => `${number(value)}kg`, '기록 없음');
  const paceChange = model.current.running.avgPaceSecPerKm > 0 && model.previous.running.avgPaceSecPerKm > 0
    ? { value: `${model.current.running.avgPaceSecPerKm <= model.previous.running.avgPaceSecPerKm ? '-' : '+'}${Math.abs(model.current.running.avgPaceSecPerKm - model.previous.running.avgPaceSecPerKm)}초`, description: '지난주 같은 기간 대비' }
    : model.current.running.avgPaceSecPerKm > 0
      ? { value: pace(model.current.running.avgPaceSecPerKm), description: '이번 주 실제 기록' }
      : { value: '기록 없음', description: '비교할 러닝이 없습니다' };
  const metric = (label, value, description, tone = '') => `<div class="summary-change-metric"><span>${label}</span><strong class="${tone}">${escapeHtml(value)}</strong><small>${escapeHtml(description)}</small></div>`;
  return `<article class="home-card compact summary-card" id="card-weekly-change"><div class="home-card-header"><span class="home-card-title">이번 주 변화</span><span class="summary-source-label">내 기록 집계</span></div><div class="summary-change-grid">
    ${metric('단백질 섭취', protein.value, protein.description, 'is-positive')}
    ${metric('운동 볼륨', volume.value, volume.description, 'is-strength')}
    ${metric('평균 페이스', paceChange.value, paceChange.description, paceChange.value.includes('-') ? 'is-positive' : '')}
  </div></article>`;
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
  });
  root.innerHTML = `<div class="summary-overview-head"><div><strong>오늘 · 이번 주 요약</strong><span>${shortDate(model.ranges.currentWeekStart)} — ${shortDate(model.ranges.currentWeekEnd)}</span></div><span class="summary-data-badge">실제 저장 기록</span></div>
    ${renderDiet(model)}<div class="summary-split-grid">${renderWorkout(model)}${renderRunning(model)}</div>${renderChange(model)}`;
  root.dataset.summarySource = 'local-day-cache';
}
