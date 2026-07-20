import { showToast } from './ui/toast.js';
// ================================================================
// render-stats.js
// 의존성: config.js, data.js
// 변경: 13번 CSV 내보내기 추가
// ================================================================

import { MOVEMENTS }                                 from './config.js';
import { TODAY, getMuscles, getCF, getDiet, dietDayOk,
         daysInMonth, isFuture, getExList, getAllMuscles,
         getVolumeHistory, getCache, calcVolume,
         getExercises, dateKey, getBodyCheckins, getDietPlan, getDayTargetKcal,
         hasExerciseRecord, hasDietRecord, getRawBodyCheckins }    from './data.js';
import { SUBPATTERN_TO_MAJOR, calcBurnedKcal }       from './calc.js';
import { getWorkoutSessions }                        from './workout/sessions.js';
import { WORKOUT_PAYLOAD_KEYS, DIET_PAYLOAD_KEYS, SHARED_PAYLOAD_KEYS } from './workout/save-schema.js';
import { listRunningActivities, summarizeRunningActivities } from './workout/running-analytics.js';
import { exercisePerformanceStatus, lastRecordedValue, normalizeHealthValues, seriesDelta as selectSeriesDelta } from './stats/selectors.js';

let _selectedExerciseId = null;
let _selectedVolumeDate = null;
let _statsAnalysisPeriod = '90';
const STATS_ANALYSIS_PERIODS = {
  week: { label: '이번주', days: 0, kind: 'week' },
  '30': { label: '30일', days: 30 },
  '90': { label: '90일', days: 90 },
  '180': { label: '180일', days: 180 },
  all: { label: '전체', days: 0 },
};

const _healthMetricsCharts = new WeakMap();
const _kcalWeightCharts = new WeakMap();

export function renderStats(root = document) {
  _bindStatsAnalysisPeriodControls(root);
  _bindStatsRawExportControls(root);
  _renderPeriodScopedStats(root);
  _renderVolumeSection(root);
  _renderHeatmap();
}

function _statsNode(root, id) {
  if (!root || root === document) return document.getElementById(id);
  return root.querySelector(`[data-stats-id="${id}"], #${id}`);
}

function _statsNodes(root, selector) {
  return (root || document).querySelectorAll(selector);
}

function _statsAnalysisPeriodControlsMarkup() {
  return `
    <div class="stats-analysis-controls" aria-label="통계 기간 설정">
      <div>
        <span>전체통계</span>
        <b>기간별 통계 보기</b>
      </div>
      <div class="stats-analysis-periods" role="group" aria-label="운동 분석 기간">
        ${Object.entries(STATS_ANALYSIS_PERIODS).map(([key, period]) => `
          <button type="button" class="stats-analysis-period ${key === _statsAnalysisPeriod ? 'active' : ''}" data-stats-analysis-period="${_esc(key)}">${_esc(period.label)}</button>
        `).join('')}
      </div>
    </div>`;
}

function _trainerQuestStatsMarkup() {
  return `
    ${_statsAnalysisPeriodControlsMarkup()}
    <section class="stats-block stats-muscle-fatigue-block trainer-quest-stats-block">
      <div data-stats-id="stats-muscle-fatigue"></div>
    </section>
    <section class="stats-block stats-summary-block trainer-quest-stats-block">
      <div class="stats-block-title">전체 요약</div>
      <div data-stats-id="stats-overall-summary"></div>
    </section>
    <section class="stats-block stats-running-summary-block trainer-quest-stats-block">
      <div class="stats-block-title">러닝 분석</div>
      <div data-stats-id="stats-running-summary"></div>
    </section>
    <section class="stats-block stats-workout-analysis-block trainer-quest-stats-block">
      <div class="stats-block-title">운동 분석</div>
      <div data-stats-id="stats-workout-analysis"></div>
    </section>
    <section class="stats-block stats-health-block trainer-quest-stats-block">
      <div class="stats-block-title">체중 & 주간 누적 칼로리 추이</div>
      <div class="stats-chart-meta" data-stats-id="kcal-weight-meta"></div>
      <div class="stats-chart-wrap"><canvas data-stats-id="kcal-weight-chart"></canvas></div>
      <div data-stats-id="kcal-weight-chart-empty" class="stats-empty" style="display:none">선택 기간에 체중 또는 주간 칼로리 기록이 없어요.</div>
      <div class="stats-health-report">
        <div data-stats-id="calorie-month-summary"></div>
      </div>
    </section>
    <section class="stats-block stats-performance-block trainer-quest-stats-block">
      <div class="stats-block-title">운동별 퍼포먼스 추이</div>
      <div data-stats-id="exercise-performance-section"></div>
    </section>
    <section class="stats-block trainer-quest-stats-block">
      <div class="stats-block-title">종목별 볼륨 추이</div>
      <div data-stats-id="volume-section"></div>
    </section>
  `;
}

export function renderTrainerQuestStats(root) {
  if (!root) return;
  root.setAttribute('data-stats-root', 'trainer-quest');
  root.innerHTML = _trainerQuestStatsMarkup();
  _bindStatsAnalysisPeriodControls(root);
  _bindStatsRawExportControls(root);
  _renderPeriodScopedStats(root);
  _renderVolumeSection(root);
}

export function buildTrainerQuestStatsExport() {
  const cache = getCache();
  const analysisRange = _statsAnalysisRange();
  const entries = _dateEntries().filter(([key]) => key >= analysisRange.fromKey && key <= analysisRange.toKey);
  const checkins = getBodyCheckins()
    .filter(c => (c?.date || '') <= analysisRange.toKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const periodCheckins = checkins.filter(c => (c?.date || '') >= analysisRange.fromKey && (c?.date || '') <= analysisRange.toKey);
  const plan = getDietPlan();
  const ny = TODAY.getFullYear();
  const todayKey = _keyOffset(0);
  const foodsByName = new Map();
  const macro = { carbs: 0, protein: 0, fat: 0, days: 0 };
  const sugar = { total: 0, days: 0 };
  const sodium = { total: 0, days: 0 };
  let topFoodDay = null;
  let topExerciseDay = null;
  let recordDays = 0;
  let exerciseDays = 0;
  let okDays = 0;
  let ngDays = 0;
  let yearFoodKcalTotal = 0;
  let yearFoodKcalDays = 0;
  let yearExerciseKcalTotal = 0;
  let yearExerciseKcalDays = 0;

  entries.forEach(([key, day]) => {
    const kcal = _dayKcal(day);
    if (kcal > 0 && (!topFoodDay || kcal > topFoodDay.kcal)) topFoodDay = { date: key, kcal };
    _foodItems(day).forEach(food => {
      const name = _foodName(food);
      if (!name) return;
      const next = foodsByName.get(name) || { name, count: 0, kcalTotal: 0 };
      next.count += 1;
      next.kcalTotal += _foodKcal(food);
      foodsByName.set(name, next);
    });
    const weight = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
    const burned = calcBurnedKcal(day, weight).total;
    if (burned > 0 && (!topExerciseDay || burned > topExerciseDay.kcal)) topExerciseDay = { date: key, kcal: burned };
    const carbs = _dayCarbs(day), protein = _dayProtein(day), fat = _dayFat(day);
    if (carbs + protein + fat > 0) {
      macro.carbs += carbs;
      macro.protein += protein;
      macro.fat += fat;
      macro.days += 1;
    }
    const daySugar = _daySugar(day);
    if (daySugar !== null) { sugar.total += daySugar; sugar.days += 1; }
    const daySodium = _daySodium(day);
    if (daySodium !== null) { sodium.total += daySodium; sodium.days += 1; }
  });

  _dateRange(analysisRange.fromKey, analysisRange.toKey).forEach(key => {
    const date = _dateFromKey(key);
    if (!date || date > TODAY) return;
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    const day = cache[key] || {};
    const diet = getDiet(y, m, d);
    const hasDiet = hasDietRecord(y, m, d);
    const hasEx = hasExerciseRecord(y, m, d);
    const dok = dietDayOk(y, m, d);
    if (hasDiet || hasEx) recordDays += 1;
    if (hasEx) exerciseDays += 1;
    if (dok === true) okDays += 1;
    else if (dok === false) ngDays += 1;
    const kcal = _dayKcal(diet);
    if (kcal > 0) {
      yearFoodKcalTotal += kcal;
      yearFoodKcalDays += 1;
    }
    const weight = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
    const burned = calcBurnedKcal(day, weight).total;
    if (burned > 0) {
      yearExerciseKcalTotal += burned;
      yearExerciseKcalDays += 1;
    }
  });

  const monthCheckins = periodCheckins;
  const monthFirst = monthCheckins.length >= 2 ? monthCheckins[0] : null;
  const monthLast = monthCheckins.length >= 2 ? monthCheckins[monthCheckins.length - 1] : null;
  const monthWeightFirst = monthFirst ? _maybeNum(monthFirst.weight) : null;
  const monthWeightLast = monthLast ? _maybeNum(monthLast.weight) : null;
  const healthKeys = _healthChartKeys(analysisRange);
  const health = _buildHealthChartData(healthKeys, cache, checkins);
  const fatigue = _buildMuscleFatigue(analysisRange);
  const usedExIds = new Set();
  Object.values(cache).forEach(day => (day.exercises || []).forEach(entry => {
    if (entry?.exerciseId) usedExIds.add(entry.exerciseId);
  }));
  const volumeExercises = _volumeExerciseOptions(usedExIds).slice(0, 12).map(opt => ({
    id: opt.id,
    name: opt.name,
    muscleName: opt.muscleName,
    latestDate: opt.latestDate,
    recentHistory: opt.history.slice(-20).map(point => ({
      date: point.date,
      volume: Math.round(point.volume || 0),
    })),
  }));
  const topFood = [...foodsByName.values()]
    .sort((a, b) => (b.count - a.count) || (b.kcalTotal - a.kcalTotal) || a.name.localeCompare(b.name))[0] || null;
  const dietTotal = okDays + ngDays;
  const workoutAnalysis = _analyzeTrainerWindow(analysisRange.fromKey, analysisRange.toKey);
  const analysisPlan = workoutAnalysis.planStats || {};
  const performanceRows = _buildExercisePerformanceRows(analysisRange);
  const runningSummary = summarizeRunningActivities(listRunningActivities(entries));

  return {
    schema: 'tomatofarm.trainerStats.v1',
    exportedAt: new Date().toISOString(),
    today: todayKey,
    overall: {
      year: ny,
      period: {
        label: analysisRange.label,
        fromKey: analysisRange.fromKey,
        toKey: analysisRange.toKey,
      },
      totalRecordEntries: entries.length,
      recordDays,
      exerciseDays,
      dietSuccess: {
        okDays,
        ngDays,
        ratePct: dietTotal ? Math.round(okDays / dietTotal * 100) : null,
      },
      averageIntakeKcal: yearFoodKcalDays ? Math.round(yearFoodKcalTotal / yearFoodKcalDays) : null,
      averageExerciseKcal: yearExerciseKcalDays ? Math.round(yearExerciseKcalTotal / yearExerciseKcalDays) : null,
      topFood: topFood ? {
        name: topFood.name,
        count: topFood.count,
        avgKcal: Math.round(topFood.kcalTotal / Math.max(topFood.count, 1)),
      } : null,
      topFoodDay,
      topExerciseDay,
    },
    body: {
      averageWeightKg: _avgFrom(periodCheckins, c => _maybeNum(c.weight)),
      averageBodyFatPct: _avgFrom(periodCheckins, c => _maybeNum(c.bodyFatPct)),
      averageSkeletalMuscleKg: _avgFrom(periodCheckins, c => _firstNumber(c, SKELETAL_KEYS)),
      averageFatMassKg: _avgFrom(periodCheckins, _bodyFatMass),
      monthlyWeightDeltaKg: monthWeightFirst !== null && monthWeightLast !== null ? monthWeightLast - monthWeightFirst : null,
      monthCheckinCount: periodCheckins.length,
    },
    nutrition: {
      sampledDays: macro.days,
      averageCarbsG: macro.days ? macro.carbs / macro.days : null,
      averageProteinG: macro.days ? macro.protein / macro.days : null,
      averageFatG: macro.days ? macro.fat / macro.days : null,
      averageSugarG: sugar.days ? sugar.total / sugar.days : null,
      averageSodiumMg: sodium.days ? sodium.total / sodium.days : null,
    },
    running: {
      activityCount: runningSummary.activityCount,
      activeDays: runningSummary.activeDays,
      distanceKm: runningSummary.distanceKm,
      durationSec: runningSummary.durationSec,
      elapsedDurationSec: runningSummary.elapsedDurationSec,
      avgPaceSecPerKm: runningSummary.avgPaceSecPerKm || null,
      bestPaceSecPerKm: runningSummary.bestPaceSecPerKm || null,
      calories: runningSummary.calories || null,
      elevationGainM: runningSummary.elevationGainM || null,
      elevationLossM: runningSummary.elevationLossM || null,
      avgHeartRateBpm: runningSummary.avgHeartRateBpm,
      maxHeartRateBpm: runningSummary.maxHeartRateBpm,
    },
    healthChart: {
      periodDays: analysisRange.key === 'all' ? 'all' : analysisRange.actualDays,
      fromKey: analysisRange.fromKey,
      toKey: analysisRange.toKey,
      labels: health.labels,
      visibleSeries: _healthChartSeriesWithData(health.data),
      series: health.data,
    },
    muscleFatigue: {
      period: fatigue.period.label,
      trainingDays: fatigue.trainingDays,
      totalSets: fatigue.totalSets,
      totalVolume: fatigue.totalVolume,
      top: fatigue.top ? { id: fatigue.top.id, label: fatigue.top.label, relativePct: fatigue.top.relativePct } : null,
      underactive: fatigue.underactive.map(group => ({ id: group.id, label: group.label, hint: group.hint })),
      groups: fatigue.groups.map(group => ({
        id: group.id,
        label: group.label,
        tone: group.tone,
        sets: group.sets,
        volume: group.volume,
        relativePct: group.relativePct,
        days: group.days,
        lastDate: group.lastDate,
      })),
    },
    volume: {
      selectedExerciseId: _selectedExerciseId,
      exercises: volumeExercises,
    },
    exercisePerformance: performanceRows.map(row => ({
      id: row.id,
      major: row.major,
      name: row.name,
      sessionDays: row.sessionDays,
      totalVolume: row.totalVolume,
      latestVolume: _lastHealthValue(row.volumeSeries.map(point => point.value)),
      latestEstimated1rmKg: _lastHealthValue(row.e1rmSeries.map(point => point.value)),
      status: row.status.label,
    })),
    workoutAnalysis: {
      period: analysisRange.label,
      fromKey: analysisRange.fromKey,
      toKey: analysisRange.toKey,
      trainingDays: workoutAnalysis.trainingDays,
      hardSets: workoutAnalysis.hardSets,
      averageRpe: workoutAnalysis.avgRpe || null,
      averageIntakeKcal: workoutAnalysis.avgKcal || null,
      averageProteinG: workoutAnalysis.avgProtein || null,
      planAdherencePct: analysisPlan.plannedSets ? Math.round(analysisPlan.doneSets / analysisPlan.plannedSets * 100) : null,
      planVolumeDelta: analysisPlan.plannedSets ? Math.round((analysisPlan.actualVolume || 0) - (analysisPlan.plannedVolume || 0)) : null,
      completedSets: analysisPlan.plannedSets ? { done: analysisPlan.doneSets, planned: analysisPlan.plannedSets } : null,
    },
  };
}

export function buildTrainerQuestStatsExportText() {
  return JSON.stringify(buildTrainerQuestStatsExport(), null, 2);
}

function _bindStatsAnalysisPeriodControls(root = document) {
  _statsNodes(root, '[data-stats-analysis-period]').forEach(btn => {
    _syncStatsAnalysisPeriodButton(btn);
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const next = btn.dataset.statsAnalysisPeriod || '90';
      if (!STATS_ANALYSIS_PERIODS[next] || next === _statsAnalysisPeriod) return;
      _statsAnalysisPeriod = next;
      const scope = btn.closest?.('[data-stats-root]') || root || document;
      _statsNodes(scope, '[data-stats-analysis-period]').forEach(_syncStatsAnalysisPeriodButton);
      _renderPeriodScopedStats(scope);
    });
  });
}

const _RAW_SHARED_KEYS = new Set(SHARED_PAYLOAD_KEYS);
const _RAW_WORKOUT_KEYS = WORKOUT_PAYLOAD_KEYS.filter(key => !_RAW_SHARED_KEYS.has(key));
const _RAW_DIET_KEYS = DIET_PAYLOAD_KEYS.filter(key => !_RAW_SHARED_KEYS.has(key));

function _jsonSafeClone(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function _pickRawFields(day, keys) {
  const out = {};
  keys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(day || {}, key)) return;
    const value = _jsonSafeClone(day[key]);
    if (value !== undefined) out[key] = value;
  });
  return out;
}

function _bodyCheckinsByDate(checkins) {
  const byDate = new Map();
  checkins.forEach(checkin => {
    const key = checkin?.date || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const list = byDate.get(key) || [];
    list.push(_jsonSafeClone(checkin));
    byDate.set(key, list);
  });
  return byDate;
}

function _rawWorkoutSummary(day) {
  const sessions = getWorkoutSessions(day, { minCount: 1 });
  const entries = sessions.flatMap(session => Array.isArray(session?.exercises) ? session.exercises : []);
  const sets = entries.flatMap(entry => Array.isArray(entry?.sets) ? entry.sets : []);
  return {
    sessions: sessions.length,
    exercises: entries.length,
    sets: sets.length,
    completedSets: sets.filter(set => set?.done === true).length,
    volume: Math.round(entries.reduce((sum, entry) => sum + calcVolume(entry?.sets || []), 0)),
  };
}

function _rawDietSummary(day) {
  return {
    intakeKcal: _dayKcal(day),
    proteinG: _dayProtein(day),
    carbsG: _dayCarbs(day),
    fatG: _dayFat(day),
    sugarG: _daySugar(day),
    sodiumMg: _daySodium(day),
    foods: _foodItems(day).length,
  };
}

function _rawDailyRow(key, day, checkinsByDate, checkinsToDate, plan) {
  const date = _dateFromKey(key);
  const y = date?.getFullYear();
  const m = date?.getMonth();
  const d = date?.getDate();
  const dietDay = date ? getDiet(y, m, d) : day;
  const bodyCheckins = checkinsByDate.get(key) || [];
  const weightForBurn = _weightOnOrBefore(checkinsToDate, key) ?? _maybeNum(plan?.weight) ?? 70;
  const exerciseKcal = Math.round(calcBurnedKcal(day, weightForBurn).total || 0);
  return {
    date: key,
    hasWorkout: date ? hasExerciseRecord(y, m, d) : false,
    hasDiet: date ? hasDietRecord(y, m, d) : false,
    dietOk: date ? dietDayOk(y, m, d) : null,
    derived: {
      workout: _rawWorkoutSummary(day),
      diet: _rawDietSummary(dietDay),
      exerciseKcal,
      bodyCheckinCount: bodyCheckins.length,
    },
    raw: {
      workout: _pickRawFields(day, _RAW_WORKOUT_KEYS),
      diet: _pickRawFields(day, _RAW_DIET_KEYS),
      shared: _pickRawFields(day, SHARED_PAYLOAD_KEYS),
      day: _jsonSafeClone(day || {}),
      bodyCheckins,
    },
  };
}

export function buildStatsRawExport() {
  const cache = getCache();
  const todayKey = _keyOffset(0);
  const checkins = getRawBodyCheckins()
    .filter(checkin => (checkin?.date || '') <= todayKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const checkinsByDate = _bodyCheckinsByDate(checkins);
  const plan = getDietPlan();
  const dateKeys = new Set(
    Object.keys(cache)
      .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= todayKey)
  );
  checkins.forEach(checkin => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(checkin?.date || '')) dateKeys.add(checkin.date);
  });
  const daily = [...dateKeys]
    .sort((a, b) => a.localeCompare(b))
    .map(key => _rawDailyRow(key, cache[key] || {}, checkinsByDate, checkins, plan));
  const workoutDays = daily.filter(row => row.hasWorkout).length;
  const dietDays = daily.filter(row => row.hasDiet).length;
  return {
    schema: 'tomatofarm.rawDailyStats.v1',
    exportedAt: new Date().toISOString(),
    today: todayKey,
    source: 'data.js getCache users/{uid}/workouts daily documents',
    counts: {
      totalDays: daily.length,
      workoutDays,
      dietDays,
      bodyCheckins: checkins.length,
      workoutPayloadKeys: _RAW_WORKOUT_KEYS.length,
      dietPayloadKeys: _RAW_DIET_KEYS.length,
      sharedPayloadKeys: SHARED_PAYLOAD_KEYS.length,
    },
    daily,
    bodyCheckins: checkins.map(_jsonSafeClone),
  };
}

export function buildStatsRawExportText() {
  return JSON.stringify(buildStatsRawExport(), null, 2);
}

function _downloadTextFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body?.appendChild?.(a);
  a.click();
  a.remove?.();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function _downloadStatsRawExport() {
  try {
    const payload = buildStatsRawExport();
    if (!payload.daily.length) {
      showToast('내보낼 통계 raw 데이터가 없어요', 2200, 'info');
      return;
    }
    const filename = `tomatofarm-raw-stats-${payload.today}.json`;
    _downloadTextFile(filename, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
    showToast(`전체통계 ${payload.counts.totalDays}일 raw 데이터를 다운로드했어요`, 2500, 'success');
  } catch (error) {
    console.warn('[stats] raw export failed:', error);
    showToast('전체통계 다운로드에 실패했어요', 2500, 'error');
  }
}

function _bindStatsRawExportControls(root = document) {
  _statsNodes(root, '[data-stats-raw-export]').forEach(btn => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', _downloadStatsRawExport);
  });
}

function _renderPeriodScopedStats(scope = document) {
  _renderMuscleFatigue(scope);
  _renderOverallSummary(scope);
  _renderRunningSummary(scope);
  _renderWorkoutAnalysis(scope);
  _renderKcalWeightChart(scope);
  _renderCalorieReport(scope);
  _renderExercisePerformanceSection(scope);
}
function _syncStatsAnalysisPeriodButton(btn) {
  const active = btn.dataset.statsAnalysisPeriod === _statsAnalysisPeriod;
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function _keyOffset(daysAgo) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}
const FOOD_KEYS = ['bFoods', 'lFoods', 'dFoods', 'sFoods'];
const MEAL_PREFIXES = ['b', 'l', 'd', 's'];
const SKELETAL_KEYS = ['skeletalMuscleMassKg', 'skeletalMuscleMass', 'skeletalMuscleKg', 'muscleMassKg', 'muscleMass', 'smmKg', 'smm'];
const BODY_FAT_MASS_KEYS = ['bodyFatMassKg', 'fatMassKg', 'bodyFatKg', 'fatKg'];
function _dayKcal(day) { return (day?.bKcal||0)+(day?.lKcal||0)+(day?.dKcal||0)+(day?.sKcal||0); }
function _dayProtein(day) { return (day?.bProtein||0)+(day?.lProtein||0)+(day?.dProtein||0)+(day?.sProtein||0); }
function _dayCarbs(day) { return (day?.bCarbs||0)+(day?.lCarbs||0)+(day?.dCarbs||0)+(day?.sCarbs||0); }
function _dayFat(day) { return (day?.bFat||0)+(day?.lFat||0)+(day?.dFat||0)+(day?.sFat||0); }
const MAJOR_LABELS = { chest:'가슴', back:'등', lower:'하체', shoulder:'어깨', bicep:'이두', tricep:'삼두', abs:'복근', core:'복근' };
const LANDMARKS = {
  chest: { label:'가슴', low:8, good:14, high:22 },
  back: { label:'등', low:10, good:16, high:25 },
  lower: { label:'하체', low:8, good:14, high:20 },
  shoulder: { label:'어깨', low:6, good:14, high:22 },
  bicep: { label:'이두', low:6, good:12, high:20 },
  tricep: { label:'삼두', low:6, good:14, high:18 },
  abs: { label:'복근', low:0, good:12, high:25 },
};
const FATIGUE_GROUPS = [
  {
    id: 'back', label: '등', majors: ['back'],
    spots: [{ x: 62, y: 16, w: 24, h: 29, r: -6 }, { x: 65, y: 35, w: 18, h: 16, r: 8 }],
  },
  {
    id: 'shoulder', label: '어깨', majors: ['shoulder'],
    spots: [{ x: 11, y: 18, w: 29, h: 10, r: 3 }, { x: 63, y: 15, w: 26, h: 10, r: -2 }],
  },
  {
    id: 'arms', label: '팔', majors: ['bicep', 'tricep'],
    spots: [{ x: 7, y: 23, w: 10, h: 28, r: -8 }, { x: 32, y: 27, w: 9, h: 27, r: -12 }, { x: 58, y: 23, w: 9, h: 29, r: 10 }, { x: 83, y: 23, w: 8, h: 30, r: -10 }],
  },
  {
    id: 'chest', label: '가슴', majors: ['chest'],
    spots: [{ x: 17, y: 20, w: 22, h: 15, r: 5 }],
  },
  {
    id: 'legs', label: '다리', majors: ['lower', 'glute'],
    spots: [{ x: 12, y: 50, w: 27, h: 39, r: 4 }, { x: 64, y: 49, w: 25, h: 40, r: -3 }],
  },
  {
    id: 'core', label: '코어', majors: ['abs', 'core'],
    spots: [{ x: 21, y: 32, w: 16, h: 19, r: 2 }],
  },
];
const FATIGUE_GROUP_BY_MAJOR = FATIGUE_GROUPS.reduce((acc, group) => {
  group.majors.forEach(major => { acc[major] = group.id; });
  return acc;
}, {});
function _setsBand(sets, lm) {
  if (sets < lm.low) return { tone:'under', label:'부족', msg:`주 ${lm.low - sets}세트만 더` };
  if (sets > lm.high) return { tone:'over', label:'많음', msg:'회복 확인' };
  return { tone:'ok', label: sets >= lm.good ? '충분' : '적정', msg:'유지 가능' };
}
function _progressView(e) {
  const count = e.pointsCount || 0;
  const deltaKg = e.last - e.first;
  const deltaPct = e.first ? (deltaKg / e.first * 100) : 0;
  const name = String(e.name || '').toLowerCase();
  const likelyAccessory = e.major === 'abs' || /crunch|크런치|curl|컬|raise|레이즈|extension|익스텐션|pushdown|푸시다운/.test(name);
  const suspicious = Math.abs(deltaPct) >= 60 && (count < 4 || likelyAccessory || e.first < 25);
  const reliablePct = count >= 3 && !suspicious && Math.abs(deltaPct) < 60;
  const main = suspicious ? '기록 점검 필요' : (deltaKg >= 0 ? `+${deltaKg.toFixed(1)}kg` : `${deltaKg.toFixed(1)}kg`);
  const sub = suspicious
    ? `변화폭 ${Math.round(deltaPct)}% · 표본 ${count}회`
    : `${e.slope>=0?'+':''}${e.slope.toFixed(1)}kg/주${reliablePct ? ` · ${deltaPct>=0?'+':''}${Math.round(deltaPct)}%` : ` · 표본 ${count}회`}`;
  return { suspicious, main, sub };
}
function _entryMajor(entry, exById, movById) {
  const ex = exById.get(entry?.exerciseId);
  const sp = Array.isArray(entry?.muscleIds) && entry.muscleIds[0]
    ? entry.muscleIds[0]
    : (Array.isArray(ex?.muscleIds) && ex.muscleIds[0] ? ex.muscleIds[0] : null);
  if (sp && SUBPATTERN_TO_MAJOR[sp]) return SUBPATTERN_TO_MAJOR[sp];
  const mov = movById.get(entry?.movementId || ex?.movementId);
  if (mov?.primary) return mov.primary;
  return entry?.muscleId || ex?.muscleId || 'etc';
}
function _setE1rm(set) {
  const kg = Number(set?.kg) || 0, reps = Number(set?.reps) || 0;
  if (kg <= 0 || reps <= 0) return 0;
  return kg * (1 + Math.min(reps, 30) / 30);
}
function _isHardSet(set) {
  if (!set || set.setType === 'warmup' || set.done === false) return false;
  if (!((Number(set.kg)||0) > 0 && (Number(set.reps)||0) > 0)) return false;
  const rpe = Number(set.rpe);
  if (Number.isFinite(rpe) && rpe > 0) return rpe >= 7;
  return Number(set.reps) >= 5;
}
function _topSetE1rm(entry) {
  let best = 0;
  for (const set of entry?.sets || []) {
    if (!_isHardSet(set)) continue;
    best = Math.max(best, _setE1rm(set));
  }
  return best;
}

function _fmtDateShort(key) {
  return String(key || '').slice(5).replace('-', '.');
}

function _normalizeFatigueMajor(major) {
  if (major === 'glute') return 'glute';
  if (major === 'core') return 'abs';
  return major || 'etc';
}

function _emptyFatigueGroups() {
  return FATIGUE_GROUPS.map(group => ({
    ...group,
    score: 0,
    sets: 0,
    volume: 0,
    days: new Set(),
    lastDate: '',
    level: 0,
  }));
}
function _fatigueRed(level) {
  const n = _clamp(Number(level) || 0, 0, 1);
  const saturation = Math.round(34 + n * 62);
  const lightness = Math.round(72 - n * 16);
  return `hsl(3, ${saturation}%, ${lightness}%)`;
}

function _fatigueBlue(level) {
  const n = _clamp(Number(level) || 0, 0, 1);
  const saturation = Math.round(46 + n * 38);
  const lightness = Math.round(72 - n * 24);
  return `hsl(205, ${saturation}%, ${lightness}%)`;
}

function _fatigueStatus(group, relative) {
  if (relative <= 0) return { tone: 'under', label: '보강', hint: '이번 기간 기록 없음' };
  if (relative < 0.35) return { tone: 'under', label: '보강', hint: '최고 활성 대비 낮음' };
  if (relative < 0.55) return { tone: 'low', label: '낮음', hint: '다음 운동에서 먼저 채우기' };
  if (relative >= 0.82) return { tone: 'hot', label: '집중', hint: '회복 상태 확인' };
  return { tone: 'steady', label: '균형', hint: '현재 흐름 유지' };
}

function _fatigueExerciseEntries(day) {
  return getWorkoutSessions(day, { minCount: 1 })
    .flatMap(session => Array.isArray(session?.exercises) ? session.exercises : []);
}

function _buildMuscleFatigue(range = _statsAnalysisRange()) {
  const period = {
    key: range.key,
    label: range.label,
    title: range.key === 'week' ? '이번 주' : range.label,
    days: range.actualDays,
  };
  const groups = _emptyFatigueGroups();
  const byId = new Map(groups.map(group => [group.id, group]));
  const exById = new Map(getExList().map(ex => [ex.id, ex]));
  const movById = new Map(MOVEMENTS.map(mov => [mov.id, mov]));
  const todayKey = range.toKey;
  const sinceKey = range.fromKey;
  let trainingDays = 0;

  Object.entries(getCache())
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= sinceKey && key <= todayKey)
    .forEach(([key, day]) => {
      let touched = false;
      const date = _dateFromKey(key);
      const daysAgo = date ? Math.max(0, Math.round((new Date(TODAY) - date) / 86400000)) : 0;
      const recency = 1 - Math.min(daysAgo, Math.max(period.days - 1, 1)) / Math.max(period.days, 1) * 0.3;

      for (const entry of _fatigueExerciseEntries(day)) {
        const major = _normalizeFatigueMajor(_entryMajor(entry, exById, movById));
        const groupId = FATIGUE_GROUP_BY_MAJOR[major];
        const group = byId.get(groupId);
        if (!group) continue;

        const sets = (entry.sets || []).filter(_isHardSet).length;
        const volume = calcVolume(entry.sets || []);
        if (sets <= 0 && volume <= 0) continue;

        group.sets += sets;
        group.volume += volume;
        group.score += (sets || Math.min(volume / 500, 1)) * recency;
        group.days.add(key);
        group.lastDate = group.lastDate && group.lastDate > key ? group.lastDate : key;
        touched = true;
      }

      if (touched) trainingDays++;
    });

  const totalScore = groups.reduce((sum, group) => sum + group.score, 0);
  const maxScore = Math.max(...groups.map(group => group.score), 1);
  groups.forEach(group => {
    const relative = totalScore > 0 ? group.score / maxScore : 0;
    const status = totalScore > 0 ? _fatigueStatus(group, relative) : { tone: 'empty', label: '기록 없음', hint: '' };
    const visualLevel = totalScore > 0
      ? (relative > 0 ? _clamp(relative, 0.18, 1) : 0.30)
      : 0;
    group.level = group.score > 0 ? _clamp(relative, 0.18, 1) : 0;
    group.visualLevel = visualLevel;
    group.relativePct = Math.round(relative * 100);
    group.tone = status.tone;
    group.statusLabel = status.label;
    group.hint = status.hint;
    group.tint = totalScore > 0
      ? (status.tone === 'under' || status.tone === 'low' ? _fatigueBlue(visualLevel) : _fatigueRed(visualLevel))
      : '';
    group.days = group.days.size;
    group.volume = Math.round(group.volume);
  });

  const active = groups.filter(group => group.level > 0).sort((a, b) => b.score - a.score);
  const underactive = totalScore > 0
    ? groups.filter(group => group.tone === 'under' || group.tone === 'low').sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, 'ko'))
    : [];
  const hot = totalScore > 0
    ? groups.filter(group => group.tone === 'hot').sort((a, b) => b.score - a.score)
    : [];
  return {
    period,
    groups,
    active,
    underactive,
    hot,
    top: active[0] || null,
    trainingDays,
    totalSets: groups.reduce((sum, group) => sum + group.sets, 0),
    totalVolume: groups.reduce((sum, group) => sum + group.volume, 0),
    totalScore,
  };
}

function _fatigueHotspotsHtml(groups) {
  return groups.filter(group => group.visualLevel > 0).flatMap(group => {
    const opacity = (0.22 + group.visualLevel * 0.48).toFixed(2);
    const saturation = (0.74 + group.visualLevel * 0.54).toFixed(2);
    return group.spots.map((spot, idx) => `
      <i class="stats-fatigue-hotspot is-${_esc(group.tone)}" aria-hidden="true"
         style="left:${spot.x}%;top:${spot.y}%;width:${spot.w}%;height:${spot.h}%;--mf:${group.tint};--sat:${saturation};--r:${spot.r || 0}deg;opacity:${opacity}"
         data-muscle="${_esc(group.id)}-${idx}"></i>`);
  }).join('');
}

function _fatigueRowsHtml(groups) {
  const visible = groups.filter(group => group.visualLevel > 0);
  if (!visible.length) {
    return '<div class="stats-fatigue-empty">선택 기간에 활성 부위 기록이 없어요.</div>';
  }
  return visible
    .sort((a, b) => {
      const rank = { under: 0, low: 1, hot: 2, steady: 3, empty: 4 };
      return (rank[a.tone] ?? 9) - (rank[b.tone] ?? 9) || b.score - a.score;
    })
    .map(group => {
      const pct = group.score > 0 ? Math.max(8, group.relativePct) : 8;
      const volume = _formatVolumeMass(group.volume);
      return `
        <div class="stats-fatigue-row is-${_esc(group.tone)}" style="--mf:${group.tint};--pct:${pct}%">
          <span class="stats-fatigue-name">${_esc(group.label)}<em>${_esc(group.statusLabel)}</em></span>
          <span class="stats-fatigue-meter"><i></i></span>
          <b>${_esc(volume)}</b>
          <small>${group.sets ? `${group.sets}세트` : '0세트'} · ${_esc(group.hint)}</small>
        </div>`;
    }).join('');
}

function _fatigueInsight(state) {
  if (!state.top) {
    return {
      tone: 'empty',
      title: '운동 기록이 쌓이면 보강 부위를 잡아드릴게요',
      note: '선택 기간 기록이 생기면 많이 쓴 부위는 빨강, 덜 쓴 부위는 파랑으로 나눠 다음 운동 우선순위를 보여줍니다.',
    };
  }
  const focus = state.underactive.slice(0, 2);
  const topShare = state.totalScore > 0 ? Math.round(state.top.score / state.totalScore * 100) : 0;
  if (focus.length) {
    const focusLabel = focus.map(group => group.label).join(' · ');
    return {
      tone: 'under',
      title: `다음 운동은 ${focusLabel} 2-4세트 먼저`,
      note: `${state.top.label}은 ${state.period.title} 활성 비중 ${topShare}%로 높습니다. 파란 부위는 보조종목을 먼저 넣고, 빨간 부위는 강도를 올리기보다 회복 상태를 확인하세요.`,
    };
  }
  return {
    tone: 'steady',
    title: `${state.period.title} 부위 균형이 크게 무너지지 않았어요`,
    note: `가장 많이 쓴 부위는 ${state.top.label}이며 활성 비중은 ${topShare}%입니다. 다음 운동은 기존 계획을 유지하되 빨간 부위의 통증/피로만 확인하세요.`,
  };
}

function _renderMuscleFatigue(scope = document) {
  const root = _statsNode(scope, 'stats-muscle-fatigue');
  if (!root) return;

  const range = _statsAnalysisRange();
  const state = _buildMuscleFatigue(range);
  const insight = _fatigueInsight(state);
  const focusText = state.underactive.length ? state.underactive.slice(0, 2).map(group => group.label).join(' · ') : '균형 유지';
  const hotText = state.hot.length ? state.hot.map(group => group.label).join(' · ') : (state.top?.label || '-');
  const headline = state.top
    ? `${state.period.title} ${state.top.label} 집중${state.underactive[0] ? ` · ${state.underactive[0].label} 보강` : ''}`
    : `${state.period.title} 기록 없음`;
  const summary = state.top
    ? `${state.trainingDays}일 운동 · ${state.totalSets}세트 · 다음 ${focusText}`
    : '선택 기간의 운동 기록이 아직 없어요.';

  root.innerHTML = `
    <div class="stats-fatigue-head">
      <div>
        <span>운동 활성 부위</span>
        <h3>${_esc(headline)}</h3>
        <p>${_esc(summary)}</p>
      </div>
      <small class="stats-fatigue-range">${_esc(_fmtDateShort(range.fromKey))} - ${_esc(_fmtDateShort(range.toKey))}</small>
    </div>
    <div class="stats-fatigue-body">
      <div class="stats-fatigue-figure" aria-label="활성 근육 렌더링">
        <img src="./assets/stats/muscle-fatigue-body.png" alt="">
        ${_fatigueHotspotsHtml(state.groups)}
      </div>
      <div class="stats-fatigue-summary">
        <div><span>집중 부위</span><b>${_esc(hotText)}</b></div>
        <div><span>보강 후보</span><b>${_esc(focusText)}</b></div>
        <div><span>총 볼륨</span><b>${_formatVolumeMass(state.totalVolume)}</b></div>
      </div>
      <div class="stats-fatigue-insight is-${_esc(insight.tone)}">
        <span>다음 운동 힌트</span>
        <b>${_esc(insight.title)}</b>
        <p>${_esc(insight.note)}</p>
      </div>
    </div>
    <div class="stats-fatigue-rows">${_fatigueRowsHtml(state.groups)}</div>
  `;
}

function _num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function _maybeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function _firstNumber(obj, keys) {
  for (const key of keys) {
    const n = _maybeNum(obj?.[key]);
    if (n !== null) return n;
  }
  return null;
}
function _fmt(n, digits = 0) {
  return Number(n).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
function _formatVolumeMass(value) {
  const volume = Math.max(0, _num(value));
  if (volume >= 1000) {
    const tons = Math.round((volume / 1000) * 10) / 10;
    return `${_fmt(tons, Number.isInteger(tons) ? 0 : 1)}t`;
  }
  return `${_fmt(Math.round(volume))}kg`;
}
function _formatVolumeDelta(value) {
  const volume = _num(value);
  if (!volume) return '0kg';
  return `${volume > 0 ? '+' : '-'}${_formatVolumeMass(Math.abs(volume))}`;
}
function _fmtSigned(n, digits = 1, unit = 'kg') {
  return `${n >= 0 ? '+' : ''}${_fmt(n, digits)} ${unit}`;
}
function _dateFromKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function _keyFromDate(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}
function _dateRange(startKey, endKey) {
  const start = _dateFromKey(startKey), end = _dateFromKey(endKey);
  if (!start || !end || start > end) return [];
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(_keyFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
function _dateEntries() {
  const todayKey = _keyOffset(0);
  return Object.entries(getCache())
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key <= todayKey)
    .sort(([a], [b]) => a.localeCompare(b));
}
function _foodItems(day) {
  return FOOD_KEYS.flatMap(key => Array.isArray(day?.[key]) ? day[key] : []);
}
function _foodName(food) {
  return String(food?.name || food?.foodName || food?.label || '').trim();
}
function _foodKcal(food) {
  return _num(food?.kcal ?? food?.calories ?? food?.energy);
}
function _sumMealFields(day, suffixes) {
  let total = 0, seen = false;
  MEAL_PREFIXES.forEach(prefix => suffixes.forEach(suffix => {
    const n = _maybeNum(day?.[`${prefix}${suffix}`]);
    if (n !== null) { total += n; seen = true; }
  }));
  return seen ? total : null;
}
function _sumFoodFields(day, keys) {
  let total = 0, seen = false;
  _foodItems(day).forEach(food => {
    const n = _firstNumber(food, keys);
    if (n !== null) { total += n; seen = true; }
  });
  return seen ? total : null;
}
function _daySugar(day) {
  return _sumMealFields(day, ['Sugar', 'Sugars']) ?? _sumFoodFields(day, ['sugar', 'sugars']);
}
function _daySodium(day) {
  return _sumMealFields(day, ['Sodium', 'SodiumMg']) ?? _sumFoodFields(day, ['sodium', 'sodiumMg']);
}
function _bodyFatMass(checkin) {
  const direct = _firstNumber(checkin, BODY_FAT_MASS_KEYS);
  if (direct !== null) return direct;
  const weight = _maybeNum(checkin?.weight);
  const pct = _maybeNum(checkin?.bodyFatPct);
  if (weight !== null && pct !== null) return weight * pct / 100;
  return null;
}
function _avgFrom(list, getter) {
  let total = 0, count = 0;
  list.forEach(item => {
    const n = getter(item);
    if (n !== null && Number.isFinite(n)) { total += n; count++; }
  });
  return count ? total / count : null;
}
function _weightOnOrBefore(checkins, key) {
  for (let i = checkins.length - 1; i >= 0; i--) {
    const c = checkins[i];
    if ((c?.date || '') <= key) {
      const n = _maybeNum(c.weight);
      if (n !== null) return n;
    }
  }
  return null;
}
function _joinedMetrics(values) {
  if (values.every(v => !v)) return null;
  return values.map(v => v || '없음').join(' | ');
}
function _avgDayMetric(entries, specs) {
  let total = 0, count = 0;
  entries.forEach(([, day]) => {
    for (const spec of specs) {
      const n = _firstNumber(day, spec.keys);
      if (n === null) continue;
      total += n * (spec.scale || 1);
      count++;
      break;
    }
  });
  return count ? total / count : null;
}
function _summaryKpi(label, value, note = '', tone = '') {
  const hasValue = value !== null && value !== undefined && value !== '';
  const cls = ['stats-summary-kpi'];
  if (!hasValue) cls.push('is-empty');
  if (tone) cls.push(`is-${tone}`);
  return `
    <div class="${cls.join(' ')}">
      <span>${_esc(label)}</span>
      <b>${_esc(hasValue ? value : '-')}</b>
      ${note ? `<small>${_esc(note)}</small>` : ''}
    </div>`;
}
function _summaryFact(label, value) {
  const hasValue = value !== null && value !== undefined && value !== '';
  return `
    <div class="stats-summary-fact ${hasValue ? '' : 'is-empty'}">
      <span>${_esc(label)}</span>
      <b>${_esc(hasValue ? value : '데이터 없음')}</b>
    </div>`;
}
function _renderOverallSummary(scope = document) {
  const root = _statsNode(scope, 'stats-overall-summary');
  if (!root) return;

  const cache = getCache();
  const range = _statsAnalysisRange();
  const rangeKeys = _dateRange(range.fromKey, range.toKey);
  const entries = rangeKeys.map(key => [key, cache[key] || {}]);
  const checkins = getBodyCheckins()
    .filter(c => (c?.date || '') >= range.fromKey && (c?.date || '') <= range.toKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const checkinsToDate = getBodyCheckins()
    .filter(c => (c?.date || '') <= range.toKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const avgWeight = _avgFrom(checkins, c => _maybeNum(c.weight));
  const avgSkeletal = _avgFrom(checkins, c => _firstNumber(c, SKELETAL_KEYS));
  const avgFatMass = _avgFrom(checkins, _bodyFatMass);
  const fallbackWeight = _avgFrom(checkinsToDate, c => _maybeNum(c.weight));
  const foodsByName = new Map();
  let topFoodDay = null;
  let topExerciseDay = null;
  const macro = { carbs: 0, protein: 0, fat: 0, days: 0 };
  const sugar = { total: 0, days: 0 };
  const sodium = { total: 0, days: 0 };
  let recordDays = 0, exerciseDays = 0, okDays = 0, ngDays = 0;
  let periodFoodKcalTotal = 0, periodFoodKcalDays = 0, periodExerciseKcalTotal = 0, periodExerciseKcalDays = 0;

  entries.forEach(([key, day]) => {
    const date = _dateFromKey(key);
    if (date) {
      const y = date.getFullYear();
      const m = date.getMonth();
      const d = date.getDate();
      const diet = getDiet(y, m, d);
      const hasDiet = hasDietRecord(y, m, d);
      const hasEx = hasExerciseRecord(y, m, d);
      const dok = dietDayOk(y, m, d);
      if (hasDiet || hasEx) recordDays++;
      if (hasEx) exerciseDays++;
      if (dok === true) okDays++;
      else if (dok === false) ngDays++;
      const dietKcal = _dayKcal(diet);
      if (dietKcal > 0) {
        periodFoodKcalTotal += dietKcal;
        periodFoodKcalDays++;
      }
    }

    const kcal = _dayKcal(day);
    if (kcal > 0) {
      if (!topFoodDay || kcal > topFoodDay.kcal) topFoodDay = { key, kcal };
    }

    _foodItems(day).forEach(food => {
      const name = _foodName(food);
      if (!name) return;
      const next = foodsByName.get(name) || { name, count: 0, kcalTotal: 0 };
      next.count++;
      next.kcalTotal += _foodKcal(food);
      foodsByName.set(name, next);
    });

    const weight = _weightOnOrBefore(checkinsToDate, key) ?? avgWeight ?? fallbackWeight ?? 70;
    const burned = calcBurnedKcal(day, weight).total;
    if (burned > 0) {
      if (!topExerciseDay || burned > topExerciseDay.kcal) topExerciseDay = { key, kcal: burned };
      periodExerciseKcalTotal += burned;
      periodExerciseKcalDays++;
    }

    const carbs = _dayCarbs(day);
    const protein = _dayProtein(day);
    const fat = _dayFat(day);
    if (carbs + protein + fat > 0) {
      macro.carbs += carbs;
      macro.protein += protein;
      macro.fat += fat;
      macro.days++;
    }
    const daySugar = _daySugar(day);
    if (daySugar !== null) { sugar.total += daySugar; sugar.days++; }
    const daySodium = _daySodium(day);
    if (daySodium !== null) { sodium.total += daySodium; sodium.days++; }
  });

  const topFood = [...foodsByName.values()]
    .sort((a, b) => (b.count - a.count) || (b.kcalTotal - a.kcalTotal) || a.name.localeCompare(b.name))[0];

  const firstCheckin = checkins.length >= 2 ? checkins[0] : null;
  const lastCheckin = checkins.length >= 2 ? checkins[checkins.length - 1] : null;
  const weightFirst = firstCheckin ? _maybeNum(firstCheckin.weight) : null;
  const weightLast = lastCheckin ? _maybeNum(lastCheckin.weight) : null;
  const weightDelta = weightFirst !== null && weightLast !== null ? weightLast - weightFirst : null;
  const avgSteps = _avgDayMetric(entries, [{ keys: ['steps', 'stepCount', 'dailySteps', 'walkSteps', 'walkingSteps'] }]);
  const avgStepKcal = _avgDayMetric(entries, [{ keys: ['stepsKcal', 'stepKcal', 'walkKcal', 'walkingKcal'] }]);
  const avgWaterMl = _avgDayMetric(entries, [
    { keys: ['waterMl', 'waterIntakeMl', 'hydrationMl', 'drinkWaterMl'] },
    { keys: ['waterL', 'waterLiter'], scale: 1000 },
    { keys: ['waterCups', 'waterCupCount'], scale: 250 },
  ]);
  const avgBowel = _avgDayMetric(entries, [{ keys: ['bowelCount', 'bowelMovementCount', 'stoolCount', 'poopCount', 'defecationCount'] }]);

  const hasAnyNutrient = macro.days || sugar.days || sodium.days;
  const nutrientValue = hasAnyNutrient ? [
    macro.days ? `탄수 ${_fmt(macro.carbs / macro.days, 1)}g` : '탄수 없음',
    macro.days ? `단백 ${_fmt(macro.protein / macro.days, 1)}g` : '단백 없음',
    macro.days ? `지방 ${_fmt(macro.fat / macro.days, 1)}g` : '지방 없음',
    sugar.days ? `당 ${_fmt(sugar.total / sugar.days, 1)}g` : '당 없음',
    sodium.days ? `나트륨 ${_fmt(sodium.total / sodium.days, 0)}mg` : '나트륨 없음',
  ].join(' | ') : null;

  const dietTotal = okDays + ngDays;
  const dietRate = dietTotal ? Math.round(okDays / dietTotal * 100) : null;
  const dietTone = dietRate === null ? '' : (dietRate >= 80 ? 'good' : dietRate >= 50 ? 'warn' : 'bad');
  const avgFoodKcal = periodFoodKcalDays ? Math.round(periodFoodKcalTotal / periodFoodKcalDays) : null;
  const avgExerciseKcal = periodExerciseKcalDays ? Math.round(periodExerciseKcalTotal / periodExerciseKcalDays) : null;
  const bodyValue = _joinedMetrics([
    avgWeight !== null ? `체중 ${_fmt(avgWeight, 1)}kg` : null,
    avgSkeletal !== null ? `골격근 ${_fmt(avgSkeletal, 1)}kg` : null,
    avgFatMass !== null ? `체지방량 ${_fmt(avgFatMass, 1)}kg` : null,
  ]);
  const lifestyleValue = _joinedMetrics([
    avgSteps !== null ? `걸음 ${_fmt(Math.round(avgSteps))}${avgStepKcal !== null ? `/${_fmt(Math.round(avgStepKcal))}kcal` : ''}` : null,
    avgWaterMl !== null ? `물 ${_fmt(Math.round(avgWaterMl))}ml` : null,
    avgBowel !== null ? `배변 ${_fmt(avgBowel, 1)}회` : null,
  ]);

  const kpis = [
    _summaryKpi('기록일', `${_fmt(recordDays)}일`, '식단 또는 운동'),
    _summaryKpi('운동일', `${_fmt(exerciseDays)}일`, '선택 기간 운동 기록'),
    _summaryKpi('식단 성공률', dietRate !== null ? `${dietRate}%` : null, dietTotal ? `${okDays}성공 · ${ngDays}실패` : '판정 없음', dietTone),
    _summaryKpi('평균 섭취', avgFoodKcal !== null ? `${_fmt(avgFoodKcal)}kcal` : null, periodFoodKcalDays ? `${_fmt(periodFoodKcalDays)}일 평균` : '기록 없음'),
    _summaryKpi('평균 운동', avgExerciseKcal !== null ? `${_fmt(avgExerciseKcal)}kcal` : null, periodExerciseKcalDays ? `${_fmt(periodExerciseKcalDays)}일 평균` : '기록 없음'),
    _summaryKpi('체중 변화', weightDelta !== null && Number.isFinite(weightDelta) ? _fmtSigned(weightDelta) : null, checkins.length ? `${checkins.length}회 체크인` : '체크인 부족'),
  ].join('');

  const facts = [
    _summaryFact('자주 먹은 음식', topFood ? `${topFood.name} · ${_fmt(Math.round(topFood.kcalTotal / Math.max(topFood.count, 1)))}kcal · ${topFood.count}회` : null),
    _summaryFact('최고 섭취일', topFoodDay ? `${topFoodDay.key} · ${_fmt(topFoodDay.kcal)}kcal` : null),
    _summaryFact('최고 운동일', topExerciseDay ? `${topExerciseDay.key} · ${_fmt(topExerciseDay.kcal)}kcal` : null),
    _summaryFact('평균 체성분', bodyValue),
    _summaryFact('평균 영양소', nutrientValue),
    _summaryFact('생활지표', lifestyleValue),
  ].join('');

  root.innerHTML = `
    <div class="stats-summary-head">
      <span>${_esc(range.label)} 핵심 지표</span>
      <b>${_esc(_fmtDateShort(range.fromKey))} - ${_esc(_fmtDateShort(range.toKey))} · 기록 ${_fmt(recordDays)}일</b>
    </div>
    <div class="stats-summary-kpis">${kpis}</div>
    <div class="stats-summary-details">${facts}</div>`;
}

function _formatRunningDuration(sec) {
  const total = Math.max(0, Math.floor(_num(sec)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function _formatRunningPace(secPerKm) {
  const total = Math.round(_num(secPerKm));
  if (total <= 0) return '--';
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}''`;
}

function _renderRunningSummary(scope = document) {
  const root = _statsNode(scope, 'stats-running-summary');
  if (!root) return;
  const range = _statsAnalysisRange();
  const entries = _dateRange(range.fromKey, range.toKey).map(key => [key, getCache()[key] || {}]);
  const summary = summarizeRunningActivities(listRunningActivities(entries));
  if (!summary.activityCount) {
    root.innerHTML = `
      <div class="stats-running-empty">
        <b>${_esc(range.label)}에 저장된 러닝 기록이 없어요.</b>
        <span>GPS 또는 워치로 러닝을 기록하면 거리·페이스·심박·구간을 자동 집계합니다.</span>
      </div>`;
    return;
  }
  const heartText = summary.avgHeartRateBpm == null
    ? '심박 데이터 없음'
    : `평균 ${summary.avgHeartRateBpm} bpm${summary.maxHeartRateBpm == null ? '' : ` · 최고 ${summary.maxHeartRateBpm} bpm`}`;
  root.innerHTML = `
    <div class="stats-running-head">
      <div><span>${_esc(range.label)} 누적</span><b>${_fmt(summary.activityCount)}회 · ${_fmt(summary.activeDays)}일</b></div>
      <small>저장된 러닝 세션 기준</small>
    </div>
    <div class="stats-running-kpis">
      <div><span>누적 거리</span><b>${_fmt(summary.distanceKm, 2)}<small>km</small></b></div>
      <div><span>활동 시간</span><b>${_esc(_formatRunningDuration(summary.durationSec))}</b></div>
      <div><span>평균 페이스</span><b>${_esc(_formatRunningPace(summary.avgPaceSecPerKm))}<small>/km</small></b></div>
      <div><span>소모 칼로리</span><b>${_fmt(summary.calories)}<small>kcal</small></b></div>
    </div>
    <div class="stats-running-facts">
      <span><i>최고 페이스</i><b>${_esc(_formatRunningPace(summary.bestPaceSecPerKm))}/km</b></span>
      <span><i>누적 고도</i><b>+${_fmt(summary.elevationGainM)} m · -${_fmt(summary.elevationLossM)} m</b></span>
      <span><i>심박</i><b>${_esc(heartText)}</b></span>
    </div>
    <p class="stats-running-note">칼로리는 워치가 제공한 실제값 또는 체중·속도·활동 시간 기반 추정값입니다.</p>`;
}

function _linearSlope(points) {
  const pts = points.filter(p => Number.isFinite(p.y));
  if (pts.length < 2) return 0;
  const n = pts.length, sx = pts.reduce((s,p)=>s+p.x,0), sy = pts.reduce((s,p)=>s+p.y,0);
  const sxx = pts.reduce((s,p)=>s+p.x*p.x,0), sxy = pts.reduce((s,p)=>s+p.x*p.y,0);
  const den = n*sxx - sx*sx;
  return den ? (n*sxy - sx*sy) / den : 0;
}
function _daysBetween(fromKey, toKey) {
  const from = _dateFromKey(fromKey);
  const to = _dateFromKey(toKey);
  if (!from || !to || from > to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}
function _analysisPeriodConfig(key = _statsAnalysisPeriod) {
  return STATS_ANALYSIS_PERIODS[key] || STATS_ANALYSIS_PERIODS['90'];
}
function _weekStartKey() {
  const d = new Date(TODAY);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return _keyFromDate(d);
}
function _statsAnalysisRange(key = _statsAnalysisPeriod) {
  const cfg = _analysisPeriodConfig(key);
  const todayKey = _keyOffset(0);
  const firstKey = _dateEntries()[0]?.[0] || todayKey;
  const fromKey = cfg.kind === 'week' ? _weekStartKey() : (cfg.days > 0 ? _keyOffset(cfg.days - 1) : firstKey);
  const actualDays = Math.max(1, _daysBetween(fromKey, todayKey) + 1);
  return { ...cfg, key, fromKey, toKey: todayKey, actualDays };
}
function _statsAnalysisCompareRange(range) {
  const spanDays = range.key === 'week' ? 7 : (range.days > 0 ? range.days : Math.min(180, Math.max(30, range.actualDays || 90)));
  const halfDays = Math.max(7, Math.round(spanDays / 2));
  return {
    halfDays,
    recent: _analyzeTrainerWindow(_keyOffset(halfDays - 1), _keyOffset(0)),
    prior: _analyzeTrainerWindow(_keyOffset(spanDays - 1), _keyOffset(halfDays)),
  };
}
function _entryPlanStats(entry) {
  const prescription = entry?.maxPrescription || null;
  const isTestMode = prescription || entry?.recommendationMeta?.mode === 'max';
  if (!isTestMode) return null;
  const sets = Array.isArray(entry?.sets) ? entry.sets : [];
  const targetKg = Number(prescription?.startKg) || Number(prescription?.targetKg) || Number(prescription?.kg) || Number(sets[0]?.kg) || 0;
  const targetReps = Number(prescription?.repsHigh) || Number(prescription?.targetReps) || Number(prescription?.reps) || Number(sets[0]?.reps) || 0;
  const targetSets = Number(prescription?.targetSets) || Number(prescription?.sets) || sets.length || 0;
  const done = sets.filter(s => s?.done === true && s?.setType !== 'warmup');
  const plannedVolume = targetKg * targetReps * targetSets;
  const actualVolume = done.reduce((sum, s) => sum + (Number(s.kg) || 0) * (Number(s.reps) || 0), 0);
  return { rows: 1, plannedSets: targetSets, doneSets: done.length, plannedVolume, actualVolume };
}
function _analyzeTrainerWindow(fromKey, toKey) {
  const cache = getCache();
  const exList = getExList();
  const exById = new Map(exList.map(e => [e.id, e]));
  const movById = new Map(MOVEMENTS.map(m => [m.id, m]));
  const byMajor = {};
  const byExercise = {};
  const rpeByMajor = {};
  const planStats = { rows: 0, plannedSets: 0, doneSets: 0, plannedVolume: 0, actualVolume: 0 };
  let trainingDays = 0, hardSets = 0, rpeSum = 0, rpeCount = 0, kcalTotal = 0, kcalDays = 0, proteinTotal = 0, proteinDays = 0;
  for (const [key, day] of Object.entries(cache)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < fromKey || key > toKey) continue;
    if (Array.isArray(day.exercises) && day.exercises.length > 0) trainingDays++;
    if (_dayKcal(day) > 0) { kcalTotal += _dayKcal(day); kcalDays++; }
    if (_dayProtein(day) > 0) { proteinTotal += _dayProtein(day); proteinDays++; }
    for (const entry of day.exercises || []) {
      const major = _entryMajor(entry, exById, movById);
      const ex = exById.get(entry.exerciseId);
      byMajor[major] = byMajor[major] || { hardSets:0, volume:0 };
      const id = entry.movementId || ex?.movementId || entry.exerciseId;
      byExercise[id] = byExercise[id] || { name: ex?.name || entry.name || id, major, points:[], volume:0, rpes:[] };
      byExercise[id].volume += calcVolume(entry.sets);
      const entryPlan = _entryPlanStats(entry);
      if (entryPlan) {
        planStats.rows += entryPlan.rows;
        planStats.plannedSets += entryPlan.plannedSets;
        planStats.doneSets += entryPlan.doneSets;
        planStats.plannedVolume += entryPlan.plannedVolume;
        planStats.actualVolume += entryPlan.actualVolume;
      }
      const best = _topSetE1rm(entry);
      if (best > 0) byExercise[id].points.push({ date:key, y:best });
      for (const set of entry.sets || []) {
        if (!_isHardSet(set)) continue;
        hardSets++;
        byMajor[major].hardSets++;
        byMajor[major].volume += (Number(set.kg)||0) * (Number(set.reps)||0);
        const rpe = Number(set.rpe);
        if (Number.isFinite(rpe) && rpe > 0) {
          rpeSum += rpe; rpeCount++;
          byExercise[id].rpes.push({ date:key, rpe });
          rpeByMajor[major] = rpeByMajor[major] || { sum:0, count:0 };
          rpeByMajor[major].sum += rpe; rpeByMajor[major].count++;
        }
      }
    }
  }
  return {
    trainingDays, hardSets,
    avgKcal: kcalDays ? Math.round(kcalTotal / kcalDays) : 0,
    avgProtein: proteinDays ? Math.round(proteinTotal / proteinDays) : 0,
    avgRpe: rpeCount ? rpeSum / rpeCount : 0,
    planStats, byMajor, byExercise, rpeByMajor,
  };
}

function _workoutAnalysisLiftAnalyses(analysis) {
  return Object.values(analysis.byExercise).map(e => {
    const rawPts = e.points.sort((a,b)=>a.date.localeCompare(b.date)).slice(-8);
    const baseTime = rawPts[0] ? new Date(rawPts[0].date).getTime() : 0;
    const pts = rawPts.map((p,i)=>({
      x: baseTime ? Math.max((new Date(p.date).getTime() - baseTime) / 604800000, i * 0.25) : i,
      y: p.y,
      date: p.date,
    }));
    const rpes = e.rpes.sort((a,b)=>a.date.localeCompare(b.date));
    const slope = _linearSlope(pts);
    const first = pts[0]?.y || 0, last = pts.at(-1)?.y || 0;
    const plateau = pts.length >= 3 && Math.abs(slope) < .15 && (rpes.at(-1)?.rpe || 0) - (rpes[0]?.rpe || 0) >= .5;
    const next = { ...e, slope, first, last, plateau, pointsCount: pts.length };
    return { ...next, view: _progressView(next) };
  }).filter(e => e.last > 0);
}

function _renderWorkoutAnalysis(scope = document) {
  const root = _statsNode(scope, 'stats-workout-analysis');
  if (!root) return;

  const range = _statsAnalysisRange();
  const current = _analyzeTrainerWindow(range.fromKey, range.toKey);
  const compare = _statsAnalysisCompareRange(range);
  const weeklySets = Math.round(current.hardSets / Math.max(1, range.actualDays / 7));
  const setDelta = compare.recent.hardSets - compare.prior.hardSets;
  const dayDelta = compare.recent.trainingDays - compare.prior.trainingDays;
  const plan = current.planStats || {};
  const adherence = plan.plannedSets ? Math.round(plan.doneSets / plan.plannedSets * 100) : null;
  const volumeDelta = plan.plannedSets ? Math.round((plan.actualVolume || 0) - (plan.plannedVolume || 0)) : null;
  const planTone = adherence === null ? 'empty' : (adherence >= 90 ? 'good' : adherence >= 60 ? 'warn' : 'bad');
  const liftAnalyses = _workoutAnalysisLiftAnalyses(current);
  const plateauCount = liftAnalyses.filter(e => e.plateau).length;
  const dataWarnings = liftAnalyses.filter(e => e.view.suspicious).slice(0, 3);
  const under = Object.entries(LANDMARKS)
    .map(([major, lm]) => ({ major, lm, sets: Math.round((current.byMajor[major]?.hardSets || 0) / Math.max(1, range.actualDays / 7)) }))
    .filter(x => x.sets < x.lm.low)
    .sort((a, b) => (a.sets - a.lm.low) - (b.sets - b.lm.low))[0];
  const topExercise = Object.values(current.byExercise).sort((a, b) => b.volume - a.volume)[0];

  const checkins = getBodyCheckins().filter(c => (c?.date || '') >= range.fromKey && (c?.date || '') <= range.toKey);
  const firstC = checkins[0] || null;
  const lastC = checkins[checkins.length - 1] || null;
  const weightDelta = firstC && lastC && _maybeNum(firstC.weight) !== null && _maybeNum(lastC.weight) !== null
    ? _maybeNum(lastC.weight) - _maybeNum(firstC.weight)
    : null;
  const bfDelta = firstC && lastC && _maybeNum(firstC.bodyFatPct) !== null && _maybeNum(lastC.bodyFatPct) !== null
    ? _maybeNum(lastC.bodyFatPct) - _maybeNum(firstC.bodyFatPct)
    : null;
  const proteinPerKg = lastC?.weight ? current.avgProtein / Number(lastC.weight) : 0;
  const bodyDirection = weightDelta === null
    ? '체성분 기록 부족'
    : (Math.abs(weightDelta) < .2 && (bfDelta ?? 0) < 0 ? '체중 유지 + 체지방 감량'
      : (weightDelta > .3 ? ((bfDelta ?? 0) > .4 ? '증량 속도 빠름' : '천천히 증량')
        : (weightDelta < -.3 ? '감량 중' : '유지 중')));

  const liftRows = liftAnalyses
    .sort((a,b)=>(b.plateau-a.plateau) || (b.view.suspicious-a.view.suspicious) || Math.abs(b.slope)-Math.abs(a.slope)).slice(0, 4)
    .map(e => `<div class="stats-analysis-lift-row ${e.plateau ? 'is-plateau' : ''} ${e.view.suspicious ? 'is-suspicious' : ''}"><div><span>${_esc(MAJOR_LABELS[e.major] || e.major)}</span><b>${_esc(e.name)}</b></div><strong>${_esc(e.view.main)}</strong><small>${_fmt(Math.round(e.first))} → ${_fmt(Math.round(e.last))}kg · ${_esc(e.view.sub)}${e.plateau ? ' · 피로 누적 의심' : ''}</small></div>`).join('');
  const warningList = dataWarnings.map(e => `<li><b>${_esc(e.name)}</b><span>${_fmt(Math.round(e.first))} → ${_fmt(Math.round(e.last))}kg, 표본 ${e.pointsCount}회. 같은 기구/단위/종목명 기록인지 확인하세요.</span></li>`).join('');
  const rpeRows = Object.entries(current.rpeByMajor).map(([major, r]) => {
    const avg = r.count ? r.sum / r.count : 0;
    return `<div class="stats-analysis-mini ${avg >= 8.5 ? 'is-high' : avg < 7 ? 'is-low' : ''}"><span>${_esc(MAJOR_LABELS[major] || major)}</span><b>${avg.toFixed(1)}</b></div>`;
  }).join('');
  const briefTitle = dataWarnings.length
    ? '기록 신뢰도 확인이 먼저입니다'
    : (under ? `${under.lm.label} 보강이 1순위` : (plateauCount ? '정체 종목 회복 관리가 필요합니다' : '현재 루프는 유지 가능합니다'));
  const brief = dataWarnings.length
    ? '변화폭이 비정상적으로 큰 종목은 성장 판단에 쓰기 전에 기록 단위와 종목명을 먼저 확인하세요.'
    : (under
      ? `${under.lm.label}이 주당 ${under.sets}세트로 기준선보다 낮습니다. 다음 2주는 해당 부위 보조종목을 2-3세트 먼저 채우세요.`
      : (plateauCount ? '같은 무게에서 RPE가 올라가는 종목이 있습니다. 다음 주는 볼륨을 줄이거나 종목 교체를 검토하세요.' : '자극, 적응, 회복 흐름이 크게 무너지지 않았습니다. 벤치마크 1-2개만 소폭 증량하세요.'));
  const hasWorkout = current.trainingDays > 0 || current.hardSets > 0 || (plan.plannedSets || 0) > 0;

  root.innerHTML = `
    <div class="stats-analysis-head">
      <div><span>${_esc(range.label)} 집계</span><b>${_esc(_fmtDateShort(range.fromKey))} - ${_esc(_fmtDateShort(range.toKey))}</b></div>
      <small>최근 절반 ${setDelta >= 0 ? '+' : ''}${_fmt(setDelta)}세트 · ${dayDelta >= 0 ? '+' : ''}${_fmt(dayDelta)}일</small>
    </div>
    <div class="stats-analysis-kpis">
      ${_summaryKpi('운동일', hasWorkout ? `${_fmt(current.trainingDays)}일` : null, `${_fmt(range.actualDays)}일 중 기록`)}
      ${_summaryKpi('주당 유효세트', hasWorkout ? `${_fmt(weeklySets)}세트` : null, 'RPE 7 이상 또는 반복 기록 기준')}
      ${_summaryKpi('평균 RPE', current.avgRpe ? current.avgRpe.toFixed(1) : null, current.avgRpe >= 8.6 ? '피로 높음' : '기록 기준')}
      ${_summaryKpi('계획 이행률', adherence !== null ? `${adherence}%` : null, adherence !== null ? `완료 세트 ${_fmt(plan.doneSets)}/${_fmt(plan.plannedSets)}` : '테스트모드 기록 없음', planTone)}
      ${_summaryKpi('계획 대비 볼륨', volumeDelta !== null ? _formatVolumeDelta(volumeDelta) : null, 'kg x reps 합계', planTone)}
      ${_summaryKpi('완료 세트', plan.plannedSets ? `${_fmt(plan.doneSets)}/${_fmt(plan.plannedSets)}` : null, '테스트모드 처방 기준', planTone)}
    </div>
    <div class="stats-analysis-card">
      <div class="stats-analysis-card-head"><b>성장 추세</b><span>${topExercise ? `볼륨 상위: ${_esc(topExercise.name)}` : '기록 누적 필요'}</span></div>
      <div class="stats-analysis-lifts">${liftRows || '<p class="stats-analysis-empty">성장 추세를 계산할 운동 기록이 부족합니다.</p>'}</div>
    </div>
    ${warningList ? `<div class="stats-analysis-card is-warning"><div class="stats-analysis-card-head"><b>기록 점검</b><span>갑자기 크게 뛴 종목</span></div><ul class="stats-analysis-warning-list">${warningList}</ul></div>` : ''}
    <div class="stats-analysis-card">
      <div class="stats-analysis-card-head"><b>몸 변화와 식단</b><span>운동 성과와 체성분 연결</span></div>
      <div class="stats-analysis-mini-grid">
        <div class="stats-analysis-mini"><span>현재 방향</span><b>${_esc(bodyDirection)}</b></div>
        <div class="stats-analysis-mini"><span>체중 변화</span><b>${weightDelta === null ? '--' : `${weightDelta >= 0 ? '+' : ''}${weightDelta.toFixed(1)}kg`}</b></div>
        <div class="stats-analysis-mini"><span>체지방률</span><b>${bfDelta === null ? '--' : `${bfDelta >= 0 ? '+' : ''}${bfDelta.toFixed(1)}%p`}</b></div>
        <div class="stats-analysis-mini"><span>단백질</span><b>${proteinPerKg ? `${proteinPerKg.toFixed(2)}g/kg` : '--'}</b></div>
      </div>
      <p>${current.avgKcal ? `평균 섭취 ${_fmt(current.avgKcal)}kcal, 단백질 ${_fmt(current.avgProtein)}g입니다.` : '선택 기간 식단 기록이 부족해서 운동 성과와 식단의 연결은 판단하지 않습니다.'}</p>
    </div>
    <div class="stats-analysis-card">
      <div class="stats-analysis-card-head"><b>피로도</b><span>부위별 체감강도</span></div>
      <div class="stats-analysis-mini-grid">${rpeRows || '<p class="stats-analysis-empty">RPE 기록이 부족합니다.</p>'}</div>
    </div>
    <div class="stats-analysis-note ${dataWarnings.length ? 'is-warning' : under ? 'is-under' : plateauCount ? 'is-warn' : 'is-good'}">
      <span>코치 제안</span>
      <b>${_esc(briefTitle)}</b>
      <p>${_esc(brief)}</p>
    </div>
  `;
}

const PERFORMANCE_MAJORS = ['chest', 'back', 'shoulder', 'lower', 'bicep', 'tricep', 'abs'];

function _performanceMajor(major) {
  if (major === 'core') return 'abs';
  if (major === 'glute') return 'lower';
  return PERFORMANCE_MAJORS.includes(major) ? major : null;
}

function _seriesDelta(series) {
  return selectSeriesDelta(series);
}

function _performanceStatus(row) {
  return exercisePerformanceStatus(row, _fmt);
}

function _trendSparkline(series, color) {
  const values = series.map(p => Number(p.value)).filter(v => Number.isFinite(v) && v > 0);
  if (values.length < 2) return '<span class="stats-perf-empty">--</span>';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((value, idx) => {
    const x = values.length === 1 ? 50 : idx / (values.length - 1) * 100;
    const y = 34 - ((value - min) / span * 28);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="stats-perf-spark" viewBox="0 0 100 40" aria-hidden="true">
    <polyline points="${_esc(points)}" style="stroke:${_esc(color)}"></polyline>
  </svg>`;
}

function _buildExercisePerformanceRows(range = _statsAnalysisRange()) {
  const cache = getCache();
  const exById = new Map(getExList().map(ex => [ex.id, ex]));
  const movById = new Map(MOVEMENTS.map(mov => [mov.id, mov]));
  const buckets = new Map(PERFORMANCE_MAJORS.map(major => [major, new Map()]));
  Object.entries(cache).forEach(([key, day]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key < range.fromKey || key > range.toKey) return;
    for (const entry of day.exercises || []) {
      const ex = exById.get(entry.exerciseId);
      const major = _performanceMajor(_entryMajor(entry, exById, movById));
      if (!major) continue;
      const id = entry.exerciseId || entry.movementId || entry.name || `${major}-${key}`;
      const byExercise = buckets.get(major);
      const bucket = byExercise.get(id) || {
        id,
        major,
        name: ex?.name || entry.name || entry.exerciseId || '운동',
        dates: new Set(),
        totalVolume: 0,
        byDate: new Map(),
      };
      const volume = calcVolume(entry.sets || []);
      const e1rm = _topSetE1rm(entry);
      const point = bucket.byDate.get(key) || { date: key, volume: 0, e1rm: 0 };
      point.volume += volume;
      point.e1rm = Math.max(point.e1rm, e1rm);
      bucket.byDate.set(key, point);
      bucket.dates.add(key);
      bucket.totalVolume += volume;
      byExercise.set(id, bucket);
    }
  });

  return PERFORMANCE_MAJORS.flatMap(major => {
    return [...(buckets.get(major)?.values() || [])]
      .sort((a, b) => (b.dates.size - a.dates.size) || (b.totalVolume - a.totalVolume) || a.name.localeCompare(b.name, 'ko'))
      .slice(0, 2)
      .map(bucket => {
        const points = [...bucket.byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        const row = {
          id: bucket.id,
          major,
          majorLabel: MAJOR_LABELS[major] || major,
          name: bucket.name,
          sessionDays: bucket.dates.size,
          totalVolume: Math.round(bucket.totalVolume),
          volumeSeries: points.map(point => ({ date: point.date, value: Math.round(point.volume || 0) })),
          e1rmSeries: points.map(point => ({ date: point.date, value: point.e1rm ? Math.round(point.e1rm * 10) / 10 : 0 })),
        };
        return { ...row, status: _performanceStatus(row) };
      });
  });
}

function _performanceRowHtml(row) {
  const latestVolume = _lastHealthValue(row.volumeSeries.map(p => p.value));
  const latestE1rm = _lastHealthValue(row.e1rmSeries.map(p => p.value));
  return `
    <div class="stats-perf-row is-${_esc(row.status.tone)}">
      <div class="stats-perf-exercise">
        <span>${_esc(row.majorLabel)}</span>
        <b>${_esc(row.name)}</b>
        <small>${_fmt(row.sessionDays)}일 · ${_formatVolumeMass(row.totalVolume)}</small>
      </div>
      <div class="stats-perf-trend">
        ${_trendSparkline(row.volumeSeries, '#f97316')}
        <small>${latestVolume ? _formatVolumeMass(latestVolume) : '--'}</small>
      </div>
      <div class="stats-perf-trend">
        ${_trendSparkline(row.e1rmSeries, '#2563eb')}
        <small>${latestE1rm ? `${_fmt(latestE1rm, latestE1rm % 1 ? 1 : 0)}kg` : '--'}</small>
      </div>
      <div class="stats-perf-status">
        <b>${_esc(row.status.label)}</b>
        <small>${_esc(row.status.note)}</small>
      </div>
    </div>`;
}

function _renderExercisePerformanceSection(scope = document) {
  const root = _statsNode(scope, 'exercise-performance-section');
  if (!root) return;
  const range = _statsAnalysisRange();
  const rows = _buildExercisePerformanceRows(range);
  root.innerHTML = `
    <div class="stats-perf-head">
      <div><span>${_esc(range.label)} 집계</span><b>${_esc(_fmtDateShort(range.fromKey))} - ${_esc(_fmtDateShort(range.toKey))}</b></div>
      <small>부위별 자주 한 종목 최대 2개</small>
    </div>
    <div class="stats-perf-table" role="table" aria-label="운동별 퍼포먼스 추이">
      <div class="stats-perf-row stats-perf-row--head" role="row">
        <span>운동</span><span>볼륨추이</span><span>추정1RM</span><span>판정</span>
      </div>
      ${rows.length ? rows.map(_performanceRowHtml).join('') : '<div class="stats-perf-empty-card">선택 기간에 분석할 운동 기록이 없어요.</div>'}
    </div>`;
}

// ── 13번: CSV 내보내기 ───────────────────────────────────────────
export function exportCSV(period) {
  const cache  = getCache();
  const exList = getExList();
  const rows   = [['날짜','운동부위','종목','세트수','총볼륨(kg)','아침','점심','저녁','총칼로리','식단OK']];

  // 기간 필터
  const now   = new Date(TODAY);
  const since = period > 0
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - period)
    : null;

  Object.entries(cache)
    .filter(([key]) => !since || key >= dateKey(since.getFullYear(), since.getMonth(), since.getDate()))
    .sort(([a],[b]) => a.localeCompare(b))
    .forEach(([key, day]) => {
      // canonical diet 기록 — 텍스트(snack 포함)/food-chip/kcal-only/skip/photo 전부 인정
      const dietHas = day.breakfast || day.lunch || day.dinner || day.snack ||
                      day.bFoods?.length || day.lFoods?.length || day.dFoods?.length || day.sFoods?.length ||
                      (day.bKcal||0) > 0 || (day.lKcal||0) > 0 || (day.dKcal||0) > 0 || (day.sKcal||0) > 0 ||
                      day.breakfast_skipped || day.lunch_skipped || day.dinner_skipped ||
                      day.bPhoto || day.lPhoto || day.dPhoto || day.sPhoto;
      const diet     = dietHas ? day : null;
      const totalKcal= (day.bKcal||0)+(day.lKcal||0)+(day.dKcal||0)+(day.sKcal||0);
      const dietOk   = diet ? (day.bOk!==false&&day.lOk!==false&&day.dOk!==false?'O':'X') : '';

      if (day.exercises?.length) {
        const allMuscles = getAllMuscles();
        day.exercises.forEach(entry => {
          const ex  = exList.find(e => e.id === entry.exerciseId);
          const mc  = allMuscles.find(m => m.id === entry.muscleId);
          const vol = calcVolume(entry.sets);
          rows.push([
            key,
            mc?.name||entry.muscleId,
            ex?.name||entry.exerciseId,
            entry.sets.length,
            vol,
            day.breakfast||'', day.lunch||'', day.dinner||'',
            totalKcal||'', dietOk,
          ]);
        });
      } else if (day.cf) {
        rows.push([key,'크로스핏','크로스핏','','','',day.breakfast||'',day.lunch||'',day.dinner||'',totalKcal||'',dietOk]);
      } else if (diet) {
        rows.push([key,'','','','',day.breakfast||'',day.lunch||'',day.dinner||'',totalKcal||'',dietOk]);
      }
    });

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `life-streak-${TODAY.toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 종목별 볼륨 추이 ──────────────────────────────────────────────
function _volumeDateLabel(date) {
  return String(date || '').replace(/-/g, '/');
}

function _volumeExerciseOptions(usedExIds) {
  const exById = new Map(getExList().map(ex => [ex.id, ex]));
  const muscleById = new Map(getAllMuscles().map(m => [m.id, m]));
  return [...usedExIds].map(id => {
    const ex = exById.get(id);
    const history = getVolumeHistory(id);
    const muscle = muscleById.get(ex?.muscleId);
    return {
      id,
      name: ex?.name || id,
      color: muscle?.color || '#14b8a6',
      muscleName: muscle?.name || ex?.muscleId || '종목',
      latestDate: history.at(-1)?.date || '',
      history,
    };
  })
    .filter(opt => opt.history.length)
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name, 'ko'));
}

function _volumeSetRowsHtml(entry) {
  const rows = (entry?.sets || []).map((set, idx) => {
    const vol = calcVolume([set]);
    const counted = vol > 0;
    const kg = _maybeNum(set?.kg);
    const reps = _maybeNum(set?.reps);
    const rpe = _maybeNum(set?.rpe);
    const rom = _maybeNum(set?.romPct);
    const kind = set?.setType === 'warmup' ? '워밍업' : (set?.done === false ? '미완료' : '본세트');
    const parts = [
      kg !== null ? `${_fmt(kg, kg % 1 ? 1 : 0)}kg` : '무게 없음',
      reps !== null ? `${_fmt(reps, reps % 1 ? 1 : 0)}회` : '횟수 없음',
    ];
    if (rom !== null && rom > 0 && rom < 100) parts.push(`ROM ${_fmt(rom)}%`);
    if (rpe !== null && rpe > 0) parts.push(`RPE ${_fmt(rpe, rpe % 1 ? 1 : 0)}`);
    return `
      <div class="vol-set-row ${counted ? '' : 'is-muted'}">
        <span class="vol-set-no">${idx + 1}</span>
        <span class="vol-set-main">${_esc(parts.join(' × '))}<small>${_esc(kind)}</small></span>
        <b>${counted ? _formatVolumeMass(vol) : '-'}</b>
      </div>`;
  }).join('');
  return rows || '<div class="vol-set-empty">세트 기록이 없어요.</div>';
}

function _volumeEntryDetailHtml(entry, selectedExerciseId) {
  const ex = getExList().find(item => item.id === entry?.exerciseId);
  const muscle = getAllMuscles().find(m => m.id === (ex?.muscleId || entry?.muscleId));
  const total = calcVolume(entry?.sets || []);
  const countedSets = (entry?.sets || []).filter(set => calcVolume([set]) > 0).length;
  const isSelected = entry?.exerciseId === selectedExerciseId;
  const color = muscle?.color || '#14b8a6';
  return `
    <div class="vol-entry ${isSelected ? 'is-selected' : ''}" style="--mc:${_esc(color)}">
      <div class="vol-entry-head">
        <div>
          <span>${_esc(muscle?.name || '운동')}</span>
          <b>${_esc(ex?.name || entry?.name || entry?.exerciseId || '운동')}</b>
        </div>
        <strong>${_formatVolumeMass(total)}</strong>
      </div>
      <div class="vol-entry-meta">${countedSets}개 본세트 반영</div>
      <div class="vol-set-list">${_volumeSetRowsHtml(entry)}</div>
    </div>`;
}

function _renderVolumeDayDetail(detailEl, exerciseId, date, pointVolume = null) {
  if (!detailEl) return;
  const day = getCache()[date] || {};
  const entries = Array.isArray(day.exercises) ? day.exercises : [];
  const selectedEntry = entries.find(entry => entry.exerciseId === exerciseId);
  const selectedEx = getExList().find(ex => ex.id === exerciseId);
  const selectedVolume = pointVolume ?? (selectedEntry ? calcVolume(selectedEntry.sets || []) : 0);
  const dayVolume = entries.reduce((sum, entry) => sum + calcVolume(entry.sets || []), 0);
  const selectedSets = (selectedEntry?.sets || []).filter(set => calcVolume([set]) > 0).length;
  const orderedEntries = [
    ...entries.filter(entry => entry.exerciseId === exerciseId),
    ...entries.filter(entry => entry.exerciseId !== exerciseId),
  ];
  detailEl.innerHTML = `
    <div class="vol-detail-head">
      <div><span>선택일</span><b>${_esc(_volumeDateLabel(date))}</b></div>
      <div><span>그래프값</span><b>${_formatVolumeMass(selectedVolume)}</b></div>
      <div><span>기준 세트</span><b>${selectedSets}세트</b></div>
    </div>
    <div class="vol-detail-note">
      ${_esc(selectedEx?.name || exerciseId)} 기준 ${_formatVolumeMass(selectedVolume)} · 해당일 전체 ${_formatVolumeMass(dayVolume)}
    </div>
    <div class="vol-entry-list">
      ${orderedEntries.length ? orderedEntries.map(entry => _volumeEntryDetailHtml(entry, exerciseId)).join('') : '<div class="vol-set-empty">해당일 운동 기록이 없어요.</div>'}
    </div>`;
}

function _syncVolumeRows(container) {
  container.querySelectorAll('[data-volume-date]').forEach(row => {
    row.classList.toggle('active', row.dataset.volumeDate === _selectedVolumeDate);
  });
}

function _renderVolumeSection(scope = document) {
  const container = _statsNode(scope, 'volume-section');
  if (!container) return;
  container.innerHTML='';
  const usedExIds=new Set();
  Object.values(getCache()).forEach(day=>(day.exercises||[]).forEach(e=>usedExIds.add(e.exerciseId)));

  if(!usedExIds.size){
    container.innerHTML='<div style="font-size:12px;color:var(--muted)">운동 기록이 없어요.</div>';
    return;
  }

  const options = _volumeExerciseOptions(usedExIds);
  if(!options.length){
    container.innerHTML+='<div style="font-size:12px;color:var(--muted);margin-top:8px">볼륨 기록이 없어요.</div>';
    return;
  }

  if(!_selectedExerciseId || !options.some(opt => opt.id === _selectedExerciseId)) {
    _selectedExerciseId = options[0].id;
    _selectedVolumeDate = null;
  }

  const selectedOption = options.find(opt => opt.id === _selectedExerciseId) || options[0];
  const history=selectedOption.history;
  if(!history.length){
    container.innerHTML+='<div style="font-size:12px;color:var(--muted);margin-top:8px">기록이 없어요.</div>';
    return;
  }

  if(!_selectedVolumeDate || !history.some(h => h.date === _selectedVolumeDate))
    _selectedVolumeDate = history.at(-1)?.date || history[0].date;

  const basis=document.createElement('div');
  basis.className='vol-basis';
  basis.style.setProperty('--mc', selectedOption.color);
  basis.innerHTML=`
    <div class="vol-basis-copy">
      <span>기준 종목</span>
      <b>${_esc(selectedOption.name)}</b>
      <small>완료 본세트의 kg × 횟수 합산 · ROM 보정 포함</small>
    </div>
    ${options.length > 1 ? `<select class="vol-select" aria-label="볼륨 그래프 기준 종목">
      ${options.map(opt => `<option value="${_esc(opt.id)}" ${opt.id === _selectedExerciseId ? 'selected' : ''}>${_esc(opt.name)}</option>`).join('')}
    </select>` : ''}`;
  container.appendChild(basis);
  basis.querySelector('.vol-select')?.addEventListener('change', (event) => {
    _selectedExerciseId = event.target.value;
    _selectedVolumeDate = null;
    _renderVolumeSection(scope);
  });

  const chartWrap=document.createElement('div');
  chartWrap.className='vol-chart-wrap';
  const canvas=document.createElement('canvas');
  if (scope === document) canvas.id='vol-chart';
  else canvas.dataset.statsId='vol-chart';
  chartWrap.appendChild(canvas);container.appendChild(chartWrap);

  const detailEl=document.createElement('div');
  detailEl.className='vol-detail';
  container.appendChild(detailEl);

  const selectDate = (date) => {
    const point = history.find(h => h.date === date) || history.at(-1);
    if (!point) return;
    _selectedVolumeDate = point.date;
    _renderVolumeDayDetail(detailEl, _selectedExerciseId, point.date, point.volume);
    _syncVolumeRows(container);
    const chart = typeof Chart !== 'undefined' ? Chart.getChart(canvas) : null;
    if (chart) chart.update();
  };

  const recent=history.slice(-5).reverse();
  const tableWrap=document.createElement('div');tableWrap.className='vol-table';
  tableWrap.innerHTML=`<div class="vol-table-title">최근 ${recent.length}회 기록</div>`+
    recent.map((h,i)=>{
      const prev=recent[i+1],diff=prev?h.volume-prev.volume:0;
      const arrow=diff>0?'↑':diff<0?'↓':'→';
      const col=diff>0?'var(--diet-ok)':diff<0?'var(--diet-bad)':'var(--muted)';
      return `<button type="button" class="vol-row" data-volume-date="${_esc(h.date)}" aria-label="${_esc(_volumeDateLabel(h.date))} 운동 상세">
        <span class="vol-date">${h.date.replace(/-/g,'/')}</span>
        <span class="vol-val">${_formatVolumeMass(h.volume)}</span>
        <span class="vol-diff" style="color:${col}">${diff!==0?`${arrow}${_formatVolumeMass(Math.abs(diff))}`:arrow}</span>
      </button>`;
    }).join('');
  container.appendChild(tableWrap);

  tableWrap.querySelectorAll('[data-volume-date]').forEach(row => {
    row.addEventListener('click', () => selectDate(row.dataset.volumeDate));
  });
  selectDate(_selectedVolumeDate);
  requestAnimationFrame(()=>_drawVolumeChart(canvas,history,selectDate,selectedOption.color));
}

function _drawVolumeChart(canvas,history,onSelect,color){
  if(typeof Chart==='undefined')return;
  const existing=Chart.getChart(canvas);if(existing)existing.destroy();
  new Chart(canvas,{
    type:'line',
    data:{labels:history.map(h=>h.date.slice(5)),
      datasets:[{data:history.map(h=>h.volume),borderColor:color,backgroundColor:color+'22',tension:.3,fill:true,
        pointRadius:ctx=>history[ctx.dataIndex]?.date===_selectedVolumeDate?6:4,
        pointHoverRadius:7,
        pointHitRadius:14,
        pointBorderWidth:ctx=>history[ctx.dataIndex]?.date===_selectedVolumeDate?2:0,
        pointBorderColor:'#fff',
        pointBackgroundColor:color}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',intersect:false},onClick:(evt,elements,chart)=>{
        const hit=elements?.[0]||chart.getElementsAtEventForMode(evt,'nearest',{intersect:false},true)?.[0];
        const point=history[hit?.index];
        if(point)onSelect(point.date);
      },
      plugins:{legend:{display:false},tooltip:{callbacks:{
        title:items=>_volumeDateLabel(history[items[0]?.dataIndex]?.date),
        label:ctx=>`볼륨: ${_formatVolumeMass(ctx.parsed.y)}`,
      }}},
      scales:{x:{ticks:{color:'#5c6478',font:{size:10}},grid:{color:document.documentElement.classList.contains('light') ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}},
              y:{title:{display:true,text:'kg',color:'#5c6478',font:{size:10}},ticks:{color:'#5c6478',font:{size:10}},grid:{color:document.documentElement.classList.contains('light') ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}}}},
  });
}

function _recentChartKeys(days = 90) {
  const todayKey = _keyOffset(0);
  const start = new Date(TODAY);
  start.setDate(start.getDate() - (days - 1));
  return _dateRange(_keyFromDate(start), todayKey);
}

function _chartColors() {
  return {
    grid: 'rgba(0,0,0,0.07)',
    text: '#6b7280',
  };
}

function _destroyTrackedChart(tracker, canvas) {
  if (!canvas) return;
  const tracked = tracker.get(canvas);
  if (tracked) {
    tracked.destroy();
    tracker.delete(canvas);
  }
  const existing = typeof Chart !== 'undefined' && typeof Chart.getChart === 'function'
    ? Chart.getChart(canvas)
    : null;
  if (existing && existing !== tracked) existing.destroy();
}

function _statsDietDayFromKey(cache, key) {
  const date = _dateFromKey(key);
  return date ? getDiet(date.getFullYear(), date.getMonth(), date.getDate()) : (cache[key] || {});
}

function _statsWorkoutDayFromKey(cache, key) {
  return cache[key] || {};
}

function _weekStartDateForStats(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function _weekBucketLabel(startKey, endKey) {
  const start = startKey.slice(5).replace('-', '/');
  const end = endKey.slice(5).replace('-', '/');
  return start === end ? start : `${start}~${end}`;
}

function _weeklyDateBuckets(keys) {
  const buckets = [];
  let bucket = null;
  keys.forEach(key => {
    const date = _dateFromKey(key);
    if (!date) return;
    const weekKey = _keyFromDate(_weekStartDateForStats(date));
    if (!bucket || bucket.weekKey !== weekKey) {
      bucket = { weekKey, keys: [] };
      buckets.push(bucket);
    }
    bucket.keys.push(key);
  });
  return buckets.map(item => {
    const startKey = item.keys[0];
    const endKey = item.keys[item.keys.length - 1];
    return { ...item, startKey, endKey, label: _weekBucketLabel(startKey, endKey) };
  });
}

function _buildWeeklyKcalWeightSeries(range, cache, checkins) {
  const plan = getDietPlan();
  const checkinByDate = new Map(checkins.map(c => [c.date, c]));
  const buckets = _weeklyDateBuckets(_dateRange(range.fromKey, range.toKey));
  const labels = buckets.map(bucket => bucket.label);
  const intakeData = [];
  const burnedData = [];
  const weightData = [];

  buckets.forEach(bucket => {
    let intakeTotal = 0;
    let burnedTotal = 0;
    let hasIntake = false;
    let hasBurned = false;
    let weekWeight = null;

    bucket.keys.forEach(key => {
      const dietDay = _statsDietDayFromKey(cache, key);
      const workoutDay = _statsWorkoutDayFromKey(cache, key);
      const recordedWeight = _maybeNum(checkinByDate.get(key)?.weight);
      if (recordedWeight !== null) weekWeight = recordedWeight;
      const intake = _dayKcal(dietDay);
      if (intake > 0) {
        intakeTotal += intake;
        hasIntake = true;
      }
      const weightForBurn = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
      const burned = calcBurnedKcal(workoutDay, weightForBurn).total;
      if (burned > 0) {
        burnedTotal += burned;
        hasBurned = true;
      }
    });

    weightData.push(weekWeight !== null ? weekWeight : null);
    intakeData.push(hasIntake ? Math.round(intakeTotal) : null);
    burnedData.push(hasBurned ? Math.round(burnedTotal) : null);
  });

  return { labels, buckets, intakeData, burnedData, weightData };
}

function _renderKcalWeightChart(scope = document) {
  const canvas = _statsNode(scope, 'kcal-weight-chart');
  const emptyEl = _statsNode(scope, 'kcal-weight-chart-empty');
  const metaEl = _statsNode(scope, 'kcal-weight-meta');
  if (!canvas) return;
  _destroyTrackedChart(_kcalWeightCharts, canvas);

  const range = _statsAnalysisRange();
  const cache = getCache();
  const checkins = getBodyCheckins()
    .filter(c => (c?.date || '') <= range.toKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const { labels, buckets, intakeData, burnedData, weightData } = _buildWeeklyKcalWeightSeries(range, cache, checkins);
  const hasKcal = intakeData.some(v => v !== null) || burnedData.some(v => v !== null);
  const hasWeight = weightData.some(v => v !== null);
  const hasChartData = hasKcal || hasWeight;

  canvas.style.display = hasChartData ? 'block' : 'none';
  if (canvas.parentElement) canvas.parentElement.style.display = hasChartData ? 'block' : 'none';
  if (emptyEl) {
    emptyEl.style.display = hasChartData ? 'none' : 'block';
    emptyEl.textContent = '선택 기간에 체중 또는 주간 칼로리 기록이 없어요.';
  }
  if (metaEl) {
    const first = buckets[0]?.startKey?.replace(/-/g, '.') || '';
    const last = buckets[buckets.length - 1]?.endKey?.replace(/-/g, '.') || '';
    metaEl.textContent = first && last ? `${first} - ${last} · 주간 누적` : '선택 기간 기록 없음';
  }
  if (!hasChartData || typeof Chart === 'undefined') return;

  const colors = _chartColors();
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '체중',
          data: weightData,
          borderColor: '#ef6a6a',
          backgroundColor: 'rgba(239,106,106,0.08)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.3,
          spanGaps: true,
          yAxisID: 'weight',
        },
        {
          label: '주간 누적 섭취칼로리',
          data: intakeData,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.10)',
          borderWidth: 1.8,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          tension: 0.25,
          spanGaps: true,
          yAxisID: 'kcal',
        },
        {
          label: '주간 누적 운동칼로리',
          data: burnedData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.10)',
          borderWidth: 1.8,
          pointRadius: 2.5,
          pointHoverRadius: 4,
          tension: 0.25,
          spanGaps: true,
          yAxisID: 'kcal',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: colors.text, boxWidth: 9, font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.dataset.yAxisID === 'weight'
              ? `${ctx.dataset.label}: ${ctx.parsed.y ?? '-'}kg`
              : `${ctx.dataset.label}: ${ctx.parsed.y ? _fmt(ctx.parsed.y) : '-'}kcal`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.text, font: { size: 10 }, maxTicksLimit: 7, maxRotation: 0 },
          grid: { color: colors.grid },
        },
        weight: {
          position: 'left',
          title: { display: true, text: 'kg', color: colors.text, font: { size: 10 } },
          ticks: { color: colors.text, font: { size: 10 } },
          grid: { color: colors.grid },
        },
        kcal: {
          position: 'right',
          title: { display: true, text: 'kcal', color: colors.text, font: { size: 10 } },
          ticks: { color: colors.text, font: { size: 10 }, callback: v => _fmt(v) },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
  _kcalWeightCharts.set(canvas, chart);
}

function _renderCalorieReport(scope = document) {
  const summaryEl = _statsNode(scope, 'calorie-month-summary');
  if (!summaryEl) return;

  const y = TODAY.getFullYear();
  const m = TODAY.getMonth();
  const cache = getCache();
  const plan = getDietPlan();
  const checkins = getBodyCheckins();
  const dayCount = daysInMonth(y, m);
  const lastDay = TODAY.getDate();
  const mealTotals = { b: 0, l: 0, d: 0, s: 0 };
  let successDays = 0, failDays = 0, totalOver = 0, loggedDays = 0, totalMealKcal = 0, hasTarget = false;
  let exerciseKcalTotal = 0, exerciseKcalDays = 0;

  for (let d = 1; d <= Math.min(lastDay, dayCount); d++) {
    const key = dateKey(y, m, d);
    const day = getDiet(y, m, d);
    const workoutDay = cache[key] || {};
    const dayKcal = _dayKcal(day);
    const weight = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
    const exerciseKcal = calcBurnedKcal(workoutDay, weight).total;
    const goal = getDayTargetKcal(plan, y, m, d, day);
    const ok = dietDayOk(y, m, d);

    if (goal > 0 && Number.isFinite(goal)) hasTarget = true;
    if (exerciseKcal > 0) {
      exerciseKcalTotal += exerciseKcal;
      exerciseKcalDays += 1;
    }

    if (ok === true) successDays++;
    else if (ok === false) failDays++;
    if (dayKcal > 0) {
      loggedDays++;
      mealTotals.b += _num(day.bKcal);
      mealTotals.l += _num(day.lKcal);
      mealTotals.d += _num(day.dKcal);
      mealTotals.s += _num(day.sKcal);
      totalMealKcal += dayKcal;
      if (goal > 0 && Number.isFinite(goal)) totalOver += Math.max(0, dayKcal - goal);
    }
  }

  const mealRows = [
    ['아침', mealTotals.b],
    ['점심', mealTotals.l],
    ['저녁', mealTotals.d],
    ['간식', mealTotals.s],
  ].map(([label, total]) => {
    const avg = loggedDays ? Math.round(total / loggedDays) : 0;
    const pct = totalMealKcal ? Math.round(total / totalMealKcal * 1000) / 10 : 0;
    return `<div class="calorie-meal-cell"><span>${label}</span><b>${_fmt(avg)}</b><small>${pct ? `${pct}%` : '-'}</small></div>`;
  }).join('');

  summaryEl.innerHTML = `
    <div class="calorie-summary-grid">
      <div><span>성공</span><b>${successDays}</b><small>일</small></div>
      <div><span>실패</span><b>${failDays}</b><small>일</small></div>
      <div><span>초과</span><b>${hasTarget ? _fmt(Math.round(totalOver)) : '-'}</b><small>kcal</small></div>
      <div><span>운동</span><b>${exerciseKcalDays ? _fmt(Math.round(exerciseKcalTotal)) : '-'}</b><small>kcal</small></div>
    </div>
    <div class="calorie-meal-grid">${mealRows}</div>
  `;
}

const HEALTH_CHART_SERIES = {
  weight: { label: '체중', unit: 'kg', color: '#ef6a6a', background: 'rgba(239,106,106,0.08)', order: 1 },
  bodyFat: { label: '체지방률', unit: '%', color: '#10b981', background: 'rgba(16,185,129,0.08)', order: 2 },
  intake: { label: '섭취칼로리', unit: 'kcal', color: '#6366f1', background: 'rgba(99,102,241,0.10)', order: 3 },
  burned: { label: '운동칼로리', unit: 'kcal', color: '#f59e0b', background: 'rgba(245,158,11,0.10)', order: 4 },
};

function _sampleHealthKeys(keys, maxPoints = 72) {
  if (!Array.isArray(keys) || keys.length <= maxPoints) return keys || [];
  const out = [];
  const step = (keys.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    out.push(keys[Math.round(i * step)]);
  }
  return [...new Set(out)];
}

function _healthChartKeys(range = _statsAnalysisRange()) {
  return _sampleHealthKeys(_dateRange(range.fromKey, range.toKey));
}

function _buildHealthChartData(keys, cache, checkins) {
  const plan = getDietPlan();
  const checkinByDate = new Map(checkins.map(c => [c.date, c]));
  const labels = keys.map(key => key.slice(5).replace('-', '/'));
  const data = { weight: [], bodyFat: [], intake: [], burned: [] };

  keys.forEach(key => {
    const day = cache[key] || {};
    const checkin = checkinByDate.get(key) || null;
    const weight = _maybeNum(checkin?.weight);
    const bodyFat = _maybeNum(checkin?.bodyFatPct);
    const intake = _dayKcal(day);
    const weightForBurn = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
    const burned = calcBurnedKcal(day, weightForBurn).total;

    data.weight.push(weight !== null ? weight : null);
    data.bodyFat.push(bodyFat !== null ? bodyFat : null);
    data.intake.push(intake > 0 ? intake : null);
    data.burned.push(burned > 0 ? burned : null);
  });

  return { labels, data };
}

function _normalizeHealthValues(values) {
  return normalizeHealthValues(values);
}

function _healthDataset(key, rawValues) {
  const cfg = HEALTH_CHART_SERIES[key];
  return {
    label: cfg.label,
    data: _normalizeHealthValues(rawValues),
    rawValues,
    healthKey: key,
    borderColor: cfg.color,
    backgroundColor: 'transparent',
    borderWidth: 1.35,
    borderCapStyle: 'round',
    borderJoinStyle: 'round',
    cubicInterpolationMode: 'monotone',
    pointRadius: 0,
    pointHoverRadius: 3,
    pointHitRadius: 12,
    tension: 0.32,
    fill: false,
    spanGaps: true,
    yAxisID: 'y',
    order: cfg.order,
  };
}

function _formatHealthTooltip(ctx) {
  const key = ctx.dataset.healthKey;
  const value = ctx.dataset.rawValues?.[ctx.dataIndex];
  const cfg = HEALTH_CHART_SERIES[key] || Object.values(HEALTH_CHART_SERIES).find(item => item.label === ctx.dataset.label);
  if (value == null) return `${ctx.dataset.label}: -`;
  if (cfg?.unit === 'kcal') return `${ctx.dataset.label}: ${_fmt(value)}kcal`;
  if (cfg?.unit === '%') return `${ctx.dataset.label}: ${Number(value).toFixed(1)}%`;
  return `${ctx.dataset.label}: ${Number(value).toFixed(1)}kg`;
}

function _healthChartSeriesWithData(data) {
  return Object.keys(HEALTH_CHART_SERIES)
    .filter(key => data[key]?.some(value => value !== null && value !== undefined));
}

function _lastHealthValue(values) {
  return lastRecordedValue(values);
}

function _formatHealthValue(key, value) {
  if (value === null || value === undefined) return '--';
  const cfg = HEALTH_CHART_SERIES[key];
  if (cfg?.unit === 'kcal') return `${_fmt(Math.round(value))}kcal`;
  if (cfg?.unit === '%') return `${Number(value).toFixed(1)}%`;
  return `${Number(value).toFixed(1)}kg`;
}

function _healthLegendHtml(key, values) {
  const cfg = HEALTH_CHART_SERIES[key];
  const latest = _lastHealthValue(values);
  return `
    <span class="stats-health-legend-chip" style="--health-color:${_esc(cfg.color)}">
      <i></i>${_esc(cfg.label)} <b>${_esc(_formatHealthValue(key, latest))}</b>
    </span>`;
}

function _destroyHealthChart(canvas) {
  if (!canvas) return;
  const tracked = _healthMetricsCharts.get(canvas);
  if (tracked) {
    tracked.destroy();
    _healthMetricsCharts.delete(canvas);
  }
  const existing = typeof Chart !== 'undefined' && typeof Chart.getChart === 'function'
    ? Chart.getChart(canvas)
    : null;
  if (existing && existing !== tracked) existing.destroy();
}

function _renderHealthMetricsChart(scope = document) {
  const canvas = _statsNode(scope, 'health-metrics-chart');
  const legendEl = _statsNode(scope, 'health-metrics-legend');
  const emptyEl = _statsNode(scope, 'health-chart-empty');
  const metaEl = _statsNode(scope, 'health-chart-meta');
  if (!canvas) return;
  _destroyHealthChart(canvas);

  const range = _statsAnalysisRange();
  const cache = getCache();
  const checkins = getBodyCheckins()
    .filter(c => (c?.date || '') <= range.toKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const keys = _healthChartKeys(range);
  const { labels, data } = _buildHealthChartData(keys, cache, checkins);
  const visibleKeys = _healthChartSeriesWithData(data);
  const hasChartData = visibleKeys.length > 0;

  canvas.style.display = hasChartData ? 'block' : 'none';
  if (canvas.parentElement) canvas.parentElement.style.display = hasChartData ? 'block' : 'none';
  if (legendEl) {
    legendEl.style.display = hasChartData ? 'flex' : 'none';
    legendEl.innerHTML = hasChartData ? visibleKeys.map(key => _healthLegendHtml(key, data[key])).join('') : '';
  }
  if (emptyEl) {
    emptyEl.style.display = hasChartData ? 'none' : 'block';
    emptyEl.textContent = '선택한 기간에 표시할 건강 지표 기록이 없어요.';
  }
  if (metaEl) {
    const first = keys[0]?.replace(/-/g, '.') || '';
    const last = keys[keys.length - 1]?.replace(/-/g, '.') || '';
    const picked = visibleKeys.map(key => HEALTH_CHART_SERIES[key].label).join(' · ') || '기록 없음';
    metaEl.textContent = first && last ? `${first} - ${last} · 통합 그래프` : picked;
  }
  if (!hasChartData || typeof Chart === 'undefined') return;

  const colors = _chartColors();
  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: visibleKeys.map(key => _healthDataset(key, data[key])) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => labels[items[0]?.dataIndex] || '',
            label: _formatHealthTooltip,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: colors.text, font: { size: 10 }, maxTicksLimit: 5, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: { display: false, maxTicksLimit: 3 },
          grid: { color: colors.grid, drawTicks: false },
          border: { display: false },
        },
      },
    },
  });
  _healthMetricsCharts.set(canvas, chart);
}

// ── 연간 히트맵 ──────────────────────────────────────────────────
function _renderHeatmap(){
  const y=TODAY.getFullYear();
  const yearEl=document.getElementById('heatmap-year');
  if(yearEl) yearEl.textContent=y+'년';
  const el=document.getElementById('heatmap');if(!el)return;el.innerHTML='';
  const startDow=new Date(y,0,1).getDay();
  for(let i=0;i<startDow;i++){const b=document.createElement('div');b.style.aspectRatio='1';el.appendChild(b);}
  for(let m=0;m<12;m++)for(let d=1;d<=daysInMonth(y,m);d++){
    const hasGym=getMuscles(y,m,d).length>0,hasCF=getCF(y,m,d),hasDiet=dietDayOk(y,m,d)===true,fut=isFuture(y,m,d);
    const hasEx=hasExerciseRecord(y,m,d);
    const cell=document.createElement('div');cell.className='heatmap-cell';
    if(!fut){
      if(hasGym&&hasCF)cell.classList.add('h4');
      else if(hasGym){const cnt=getMuscles(y,m,d).length;cell.classList.add(cnt>=3?'h3':cnt===2?'h2':'h1');}
      else if(hasCF)cell.classList.add('hcf');
      else if(hasEx)cell.classList.add('hcf'); // stretching/running/swimming도 표시
      else if(hasDiet)cell.classList.add('hdiet');
    }
    el.appendChild(cell);
  }
}
