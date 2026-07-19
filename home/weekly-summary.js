// ================================================================
// home/weekly-summary.js — 오늘 식단 + 이번 주 시즌 요약 카드
// ================================================================

import {
  TODAY, dateKey, getCache, getDay, getDiet, getDietPlan, calcDietMetrics,
  getSeasonBundleForDate, getSeasonRegistry, selectSeasonRunningStats,
  selectSeasonStrengthStats, calcSeasonWorkoutStreak,
} from '../data.js';
import { calcWeeklyDietMacroChange } from '../calc.js';
import { activeBenchmarks, activeCycleOf, benchmarkById, expandColumnCells, weeksBetween }
  from '../workout/test-v2/board-core.js';

const TRACKS = ['volume', 'intensity'];

function esc(value) {
  return String(value == null ? '' : value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function todayKey() { return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()); }
function num(value, digits = 0) {
  return (Number(value) || 0).toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function pace(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return seconds ? Math.floor(seconds / 60) + "'" + String(seconds % 60).padStart(2, '0') + '"' : '—';
}
function pct(actual, target) {
  return Number(target) > 0 ? Math.max(0, Math.round((Number(actual) || 0) / Number(target) * 100)) : 0;
}
function dateRanges() {
  const now = new Date(TODAY);
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  const current = [];
  const previous = [];
  for (let i = 0; i <= offset; i += 1) {
    const a = new Date(monday);
    a.setDate(monday.getDate() + i);
    const b = new Date(a);
    b.setDate(a.getDate() - 7);
    current.push(dateKey(a.getFullYear(), a.getMonth(), a.getDate()));
    previous.push(dateKey(b.getFullYear(), b.getMonth(), b.getDate()));
  }
  return { current, previous, currentWeekStart: current[0], previousWeekStart: previous[0] };
}
function mealRecorded(day, textKey, foodsKey, kcalKey, skipKey, photoKey) {
  return Boolean(String(day?.[textKey] || '').trim() || day?.[foodsKey]?.length ||
    Number(day?.[kcalKey]) > 0 || day?.[skipKey] || day?.[photoKey]);
}
function dietView() {
  const plan = getDietPlan();
  if (!plan?._userSet) return { configured: false };
  const y = TODAY.getFullYear(), m = TODAY.getMonth(), d = TODAY.getDate();
  const dayData = getDay(y, m, d) || {};
  const diet = getDiet(y, m, d);
  const metrics = calcDietMetrics(plan);
  const target = (plan.refeedDays || []).includes(TODAY.getDay()) ? metrics.refeed : metrics.deficit;
  const actual = {
    kcal: diet.bKcal + diet.lKcal + diet.dKcal + diet.sKcal,
    carbG: diet.bCarbs + diet.lCarbs + diet.dCarbs + diet.sCarbs,
    proteinG: diet.bProtein + diet.lProtein + diet.dProtein + diet.sProtein,
    fatG: diet.bFat + diet.lFat + diet.dFat + diet.sFat,
  };
  const meals = [
    ['breakfast', 'bFoods', 'bKcal', 'breakfast_skipped', 'bPhoto'],
    ['lunch', 'lFoods', 'lKcal', 'lunch_skipped', 'lPhoto'],
    ['dinner', 'dFoods', 'dKcal', 'dinner_skipped', 'dPhoto'],
    ['snack', 'sFoods', 'sKcal', '', 'sPhoto'],
  ].filter(item => mealRecorded(dayData, item[0], item[1], item[2], item[3], item[4])).length;
  return { configured: true, actual, target, meals };
}
function empty(message, action, label, extra = '') {
  return '<div class="summary-empty"><span>' + esc(message) + '</span>' +
    (action ? '<button type="button" class="tds-btn tonal summary-empty-action" data-action="' +
      esc(action) + '"' + extra + '>' + esc(label) + '</button>' : '') + '</div>';
}
function renderDiet() {
  const view = dietView();
  const badge = view.configured ? '<span class="summary-pill">기록한 식사 ' + view.meals + '회</span>' : '';
  if (!view.configured) {
    return '<article class="home-card summary-card" id="card-today-diet-summary">' +
      '<div class="home-card-header"><span class="home-card-title">오늘 식단</span>' + badge + '</div>' +
      '<div class="summary-card-empty">' + empty('목표를 설정해주세요', 'diet:open-plan', '설정하기') + '</div></article>';
  }
  const ringPct = Math.min(100, pct(view.actual.kcal, view.target.kcal));
  const macros = [
    ['탄수화물', view.actual.carbG, view.target.carbG, 'carb'],
    ['단백질', view.actual.proteinG, view.target.proteinG, 'protein'],
    ['지방', view.actual.fatG, view.target.fatG, 'fat'],
  ];
  const macroHtml = macros.map(item => {
    const p = pct(item[1], item[2]);
    const actual = num(item[1], item[1] % 1 ? 1 : 0);
    return '<div class="summary-macro-row"><div class="summary-macro-head"><span>' + item[0] +
      '</span><strong>' + actual + ' / ' + num(item[2]) + 'g</strong><b>' + p + '%</b></div>' +
      '<div class="diet-goal-prog-bar"><div class="diet-goal-prog-fill summary-macro-fill ' + item[3] +
      '" style="width:' + Math.min(100, p) + '%"></div></div></div>';
  }).join('');
  return '<article class="home-card summary-card" id="card-today-diet-summary">' +
    '<div class="home-card-header"><span class="home-card-title">오늘 식단</span>' + badge + '</div>' +
    '<div class="summary-diet-body"><div class="summary-calorie-ring" style="--summary-ring-progress:' + ringPct +
    '%" aria-label="섭취 칼로리 ' + num(view.actual.kcal) + ' / ' + num(view.target.kcal) + 'kcal ' + ringPct + '%">' +
    '<div class="summary-calorie-ring-center"><span class="summary-calorie-label">섭취 칼로리</span>' +
    '<strong class="diet-goal-stat-val">' + num(view.actual.kcal) + '</strong><span class="summary-calorie-target">/ ' +
    num(view.target.kcal) + ' kcal</span><b class="summary-calorie-percent">' + ringPct + '%</b></div></div>' +
    '<div class="summary-macro-list">' + macroHtml + '</div></div></article>';
}
function tracksOf(benchmark) {
  if (benchmark?.program === 'wendler') return ['volume'];
  const tracks = Array.isArray(benchmark?.tracks) && benchmark.tracks.length ? benchmark.tracks :
    TRACKS.filter(track => benchmark?.seed?.[track]);
  return tracks.length ? tracks : ['volume'];
}
function cellAtWeek(cells, week) {
  return (cells || []).find(cell => cell && cell.kind !== 'rest' && cell.weekStart &&
    (cell.weekStart === week || cell.dots?.some(dot => dot.weekStart === week) ||
      (Number(cell.span) > 1 && weeksBetween(cell.weekStart, week) >= 0 &&
       weeksBetween(cell.weekStart, week) < cell.span))) || null;
}
function stateAtWeek(cell, week) {
  if (!cell) return 'plan';
  const dot = cell.dots?.find(item => item.weekStart === week);
  return dot ? (dot.on ? 'done' : dot.attempted ? 'attempted' : dot.missed ? 'miss' : 'plan') : (cell.state || 'plan');
}
function strengthView(bundle, week) {
  const board = bundle?.board;
  if (!board) return { status: 'empty', rows: [], completed: 0, total: 0 };
  const benchmarks = activeBenchmarks(board);
  if (!benchmarks.length) return { status: 'unregistered', rows: [], completed: 0, total: 0 };
  const rows = [];
  const done = new Set();
  for (const listed of benchmarks) {
    const bm = benchmarkById(board, listed.id) || listed;
    const cycle = activeCycleOf(board, bm.groupId);
    if (!cycle) continue;
    for (const track of tracksOf(bm)) {
      const cell = cellAtWeek(expandColumnCells(board, bm.id, track, cycle.id, week), week);
      if (!cell) continue;
      const state = stateAtWeek(cell, week);
      if (state === 'done') done.add(bm.id);
      rows.push({ label: bm.label || bm.short || bm.name || '운동 목표', kg: Number(cell.kg) || 0,
        reps: cell.reps == null ? (cell.repsLabel || '').replace(/^×/, '') : cell.reps, state });
    }
  }
  return { status: 'ready', rows, completed: done.size, total: benchmarks.length };
}
function renderStrength(bundle, week) {
  if (!bundle?.season) {
    return '<article class="home-card compact summary-card summary-split-card" id="card-weekly-strength">' +
      '<div class="home-card-header"><span class="home-card-title">이번 주 근력 목표</span></div>' +
      empty('시즌을 시작하면 이번 주 목표를 볼 수 있어요', 'home:open-season', '시즌 시작') + '</article>';
  }
  const view = strengthView(bundle, week);
  if (view.status === 'unregistered') {
    return '<article class="home-card compact summary-card summary-split-card" id="card-weekly-strength">' +
      '<div class="home-card-header"><span class="home-card-title">이번 주 근력 목표</span></div>' +
      empty('종목을 등록해주세요', 'home:open-season', '종목 등록') + '</article>';
  }
  const rows = view.rows.length ? view.rows.map(row =>
    '<div class="summary-strength-row"><span class="summary-check ' + (row.state === 'done' ? 'is-done' : '') +
    '">' + (row.state === 'done' ? '✓' : '') + '</span><span class="summary-strength-label">' + esc(row.label) +
    ' <b>' + (row.kg ? num(row.kg, row.kg % 1 ? 1 : 0) + 'kg' : '중량 미정') +
    (row.reps ? ' ' + esc(row.reps) + '회' : '') + '</b></span></div>').join('') : empty('이번 주 목표를 준비 중이에요');
  return '<article class="home-card compact summary-card summary-split-card" id="card-weekly-strength">' +
    '<div class="home-card-header"><span class="home-card-title">이번 주 근력 목표</span><strong class="summary-header-stat">' +
    view.completed + '/' + view.total + ' 목표 달성</strong></div><div class="summary-strength-list">' + rows + '</div></article>';
}
function sparkline(summary) {
  const records = Array.isArray(summary?.records) ? summary.records.filter(record => Number(record?.avgPaceSecPerKm) > 0) : [];
  if (records.length < 2) return '<div class="summary-sparkline summary-sparkline-empty" aria-hidden="true"></div>';
  const values = records.map(record => Number(record.avgPaceSecPerKm));
  const min = Math.min(...values), max = Math.max(...values), spread = Math.max(1, max - min);
  const points = values.map((value, index) => (index / (records.length - 1) * 60).toFixed(1) + ',' +
    (6 + ((max - value) / spread) * 18).toFixed(1)).join(' ');
  return '<svg class="summary-sparkline" viewBox="0 0 60 30" role="img" aria-label="이번 주 러닝 페이스 추세" preserveAspectRatio="none"><polyline points="' +
    points + '"></polyline></svg>';
}
function renderRunning(bundle, key) {
  if (!bundle?.season) {
    return '<article class="home-card compact summary-card summary-split-card" id="card-weekly-running">' +
      '<div class="home-card-header"><span class="home-card-title">이번 주 러닝</span></div>' +
      empty('시즌을 시작하면 이번 주 요약을 볼 수 있어요', 'home:open-season', '시즌 시작') + '</article>';
  }
  const stats = selectSeasonRunningStats(getCache(), getSeasonRegistry(), key, bundle.runningPlan || {});
  const summary = stats.currentWeek?.summary || {};
  if (!summary.activityCount) {
    return '<article class="home-card compact summary-card summary-split-card" id="card-weekly-running">' +
      '<div class="home-card-header"><span class="home-card-title">이번 주 러닝</span></div>' +
      empty('이번 주 러닝 기록이 없어요', 'home:switch-tab', '기록하기', ' data-tab="workout"') + '</article>';
  }
  const ready = stats.trend?.status === 'ready' && Number.isFinite(stats.trend.paceImprovementSecPerKm);
  const delta = ready ? Math.round(stats.trend.paceImprovementSecPerKm) : null;
  const previous = ready ? stats.trend.previous?.avgPaceSecPerKm : null;
  const deltaText = ready ? '페이스 개선 ' + (delta >= 0 ? '-' : '+') + Math.abs(delta) + '초' : '기준 수집 중';
  return '<article class="home-card compact summary-card summary-split-card" id="card-weekly-running">' +
    '<div class="home-card-header"><span class="home-card-title">이번 주 러닝</span><span class="summary-running-icon" aria-hidden="true">🏃</span></div>' +
    '<div class="summary-running-layout"><div class="summary-running-copy"><div class="summary-pace"><strong>' +
    pace(summary.avgPaceSecPerKm) + '</strong><span>/km</span></div><div class="summary-pace-delta ' +
    (ready && delta >= 0 ? 'is-positive' : '') + '">' + deltaText + '</div><div class="summary-running-previous">' +
    (previous ? '최근 2주 평균 ' + pace(previous) + '/km' : '최근 기록을 모으는 중') + '</div></div>' +
    sparkline(summary) + '</div></article>';
}
function changeMetric(label, value, description, tone) {
  return '<div class="summary-change-metric"><span class="summary-change-label">' + esc(label) +
    '</span><strong class="summary-change-value ' + (tone || '') + '">' + esc(value) +
    '</strong><small class="summary-change-description">' + esc(description) + '</small></div>';
}
function renderChange(bundle, key, ranges) {
  if (!bundle?.season) {
    return '<article class="home-card compact summary-card" id="card-weekly-change"><div class="home-card-header">' +
      '<span class="home-card-title">이번 주 변화</span></div>' +
      empty('시즌을 시작하면 이번 주 요약을 볼 수 있어요', 'home:open-season', '시즌 시작') + '</article>';
  }
  const dietFor = keys => keys.map(value => {
    const parts = value.split('-').map(Number);
    return getDiet(parts[0], parts[1] - 1, parts[2]);
  });
  const protein = calcWeeklyDietMacroChange(dietFor(ranges.current), dietFor(ranges.previous));
  const currentStrength = strengthView(bundle, ranges.currentWeekStart);
  const previousStrength = strengthView(bundle, ranges.previousWeekStart);
  const strengthStats = selectSeasonStrengthStats(getCache(), getSeasonRegistry(), key, bundle.workoutPlan || {});
  const running = selectSeasonRunningStats(getCache(), getSeasonRegistry(), key, bundle.runningPlan || {});
  const runningReady = running.trend?.status === 'ready' && Number(running.trend.previous?.avgPaceSecPerKm) > 0 &&
    Number.isFinite(running.trend.paceImprovementSecPerKm);
  const pacePct = runningReady ? Math.round(running.trend.paceImprovementSecPerKm / running.trend.previous.avgPaceSecPerKm * 1000) / 10 : null;
  const observedSessions = strengthStats.currentWeek?.sessions?.actual || 0;
  return '<article class="home-card compact summary-card" id="card-weekly-change"><div class="home-card-header">' +
    '<span class="home-card-title">이번 주 변화</span></div><div class="summary-change-grid">' +
    changeMetric('단백질 섭취', protein.status === 'ready' ? (protein.deltaPct >= 0 ? '+' : '') + protein.deltaPct + '%' : '기준 수집 중',
      '지난주 대비', protein.status === 'ready' ? 'is-positive' : '') +
    changeMetric('관찰된 운동 목표', currentStrength.total ? currentStrength.completed + '/' + currentStrength.total : '기준 수집 중',
      currentStrength.total ? '지난주 ' + previousStrength.completed + '/' + previousStrength.total : '지난 기록을 모으는 중 · ' + observedSessions + '회',
      currentStrength.total ? 'is-strength' : '') +
    changeMetric('평균 페이스 개선', runningReady ? '+' + pacePct + '%' : '기준 수집 중',
      runningReady ? '최근 2주 평균 대비' : '지난 기록을 모으는 중', runningReady ? 'is-positive' : '') +
    '</div></article>';
}
export function renderWeeklySummary() {
  const root = document.getElementById('home-weekly-summary');
  if (!root) return;
  const key = todayKey();
  const ranges = dateRanges();
  const bundle = getSeasonBundleForDate(key);
  const streak = calcSeasonWorkoutStreak(getCache(), getSeasonRegistry(), key);
  root.dataset.currentWorkoutStreak = String(streak.current || 0);
  root.innerHTML = renderDiet() + '<div class="summary-split-grid">' +
    renderStrength(bundle, ranges.currentWeekStart) + renderRunning(bundle, key) +
    '</div>' + renderChange(bundle, key, ranges);
}
