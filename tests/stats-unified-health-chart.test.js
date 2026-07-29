import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync('index.html', 'utf8');
const statsJs = readFileSync('render-stats.js', 'utf8');
const statsWeeklySeriesJs = readFileSync('stats/weekly-series.js', 'utf8');
const styleCss = readAppCssSync();
const swJs = readFileSync('sw.js', 'utf8') + readFileSync('runtime-assets.js', 'utf8');

test('stats renders health metrics with calorie report flattened into the same card', () => {
  assert.match(indexHtml, /id="kcal-weight-chart"/);
  assert.match(indexHtml, /id="kcal-weight-meta"/);
  assert.match(indexHtml, /체중 & 주간 누적 칼로리 추이/);
  assert.match(indexHtml, /id="calorie-month-summary"/);
  assert.match(indexHtml, /class="stats-block stats-health-block"[\s\S]*id="kcal-weight-chart"[\s\S]*class="stats-health-report"[\s\S]*id="calorie-month-summary"/);
  assert.doesNotMatch(indexHtml, /id="calorie-month-chart"/);
  assert.doesNotMatch(indexHtml, /월간 칼로리 리포트/);
  assert.doesNotMatch(indexHtml, /stats-calorie-report-block/);
  assert.match(indexHtml, /data-stats-analysis-period="week"/);
  assert.doesNotMatch(indexHtml, /id="health-metrics-chart"/);
  assert.doesNotMatch(indexHtml, /id="health-metrics-legend"/);
  assert.doesNotMatch(indexHtml, /id="health-metrics-charts"/);
  assert.doesNotMatch(indexHtml, /class="stats-health-curves"/);
  assert.doesNotMatch(indexHtml, /data-health-period=/);
  assert.doesNotMatch(indexHtml, /data-health-series=/);
  assert.doesNotMatch(indexHtml, /id="checkin-chart"/);
});

test('stats health report uses one chart and compact monthly calorie summary', () => {
  assert.match(statsJs, /function _renderKcalWeightChart/);
  assert.match(statsJs, /function _renderCalorieReport/);
  assert.match(statsJs, /const _kcalWeightCharts = new WeakMap\(\)/);
  assert.match(statsJs, /_renderKcalWeightChart\(scope\);[\s\S]*_renderCalorieReport\(scope\);/);
  assert.match(statsJs, /getDayTargetKcal/);
  assert.match(statsWeeklySeriesJs, /export function _buildWeeklyKcalWeightSeries/);
  assert.match(statsWeeklySeriesJs, /_weeklyDateBuckets\(_dateRange\(range\.fromKey, range\.toKey\)\)/);
  assert.match(statsJs, /label:\s*'체중'/);
  assert.match(statsJs, /label:\s*'주간 누적 섭취칼로리'/);
  assert.match(statsJs, /label:\s*'주간 누적 운동칼로리'/);
  assert.match(statsWeeklySeriesJs, /const dietDay = _statsDietDayFromKey\(cache, key\);[\s\S]*const workoutDay = _statsWorkoutDayFromKey\(cache, key\);[\s\S]*const intake = _dayKcal\(dietDay\);[\s\S]*calcBurnedKcal\(workoutDay, weightForBurn\)\.total/);
  assert.match(statsJs, /const workoutDay = cache\[key\] \|\| \{\};[\s\S]*const exerciseKcal = calcBurnedKcal\(workoutDay, weight\)\.total/);
  assert.doesNotMatch(statsJs, /data-stats-id="calorie-month-chart"/);
  assert.doesNotMatch(statsJs, /_calorieMonthCharts/);
  assert.doesNotMatch(statsJs, /_healthChartPeriod/);
  assert.doesNotMatch(statsJs, /\[data-health-period\]/);
  assert.doesNotMatch(statsJs, /\[data-health-series\]/);
  assert.doesNotMatch(statsJs, /let _healthMetricsChart = null/);
  assert.doesNotMatch(statsJs, /_renderCheckinChart\(\)/);
});

test('stats health rollback chart cards are styled and cache version is bumped', () => {
  assert.match(styleCss, /\.stats-chart-wrap/);
  assert.match(styleCss, /\.stats-health-report/);
  assert.doesNotMatch(styleCss, /\.stats-subblock-title/);
  assert.match(styleCss, /\.calorie-summary-grid/);
  assert.match(styleCss, /\.calorie-meal-grid/);
  assert.doesNotMatch(styleCss, /\.stats-health-toggle/);
  assert.doesNotMatch(styleCss, /\.stats-health-curves/);
  assert.doesNotMatch(styleCss, /\.stats-health-period/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
