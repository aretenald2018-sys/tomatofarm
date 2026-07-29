import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync('index.html', 'utf8');
const appJs = readFileSync('app.js', 'utf8');
const statsJs = readFileSync('render-stats.js', 'utf8');
const statsSummaryModelJs = readFileSync('stats/summary-model.js', 'utf8');
const statsAnalysisRangeJs = readFileSync('stats/analysis-range.js', 'utf8');
const styleCss = readAppCssSync();
const swJs = readFileSync('sw.js', 'utf8') + readFileSync('runtime-assets.js', 'utf8');

function cssRule(selector) {
  const start = styleCss.indexOf(selector);
  assert.notEqual(start, -1, `${selector} should exist`);
  const end = styleCss.indexOf('}', start);
  assert.notEqual(end, -1, `${selector} should close`);
  return styleCss.slice(start, end + 1);
}

test('overall stats uses one compact summary instead of duplicated aggregation cards', () => {
  assert.match(indexHtml, /class="stats-block stats-summary-block"/);
  assert.match(indexHtml, /id="stats-overall-summary"/);
  assert.match(indexHtml, /id="stats-workout-analysis"/);
  assert.match(indexHtml, /id="exercise-performance-section"/);
  assert.match(indexHtml, /class="stats-block stats-muscle-fatigue-block"[\s\S]*class="stats-block stats-summary-block"[\s\S]*class="stats-block stats-workout-analysis-block"/);
  assert.match(indexHtml, /data-stats-analysis-period="week"/);
  assert.match(indexHtml, /data-stats-analysis-period="90"/);
  assert.doesNotMatch(indexHtml, /data-health-period=/);
  assert.doesNotMatch(indexHtml, /data-fatigue-period=/);
  assert.doesNotMatch(indexHtml, /id="stats-metadata-summary"/);
  assert.doesNotMatch(indexHtml, /id="muscle-14d"/);
  assert.doesNotMatch(indexHtml, /id="muscle-period"/);
  assert.doesNotMatch(indexHtml, /id="diet-stats"/);
  assert.doesNotMatch(indexHtml, /id="monthly-summary"/);
  assert.doesNotMatch(indexHtml, /stats-view-tabs/);
  assert.doesNotMatch(indexHtml, /stats-deep-panel/);
  assert.doesNotMatch(indexHtml, /deep-stats-report/);
  assert.doesNotMatch(indexHtml, /부위별 운동 비중/);
  assert.doesNotMatch(indexHtml, /기간별 운동 횟수/);
  assert.doesNotMatch(indexHtml, /식단 달성 단계/);
  assert.doesNotMatch(indexHtml, /월별 운동 일수/);
});

test('overall summary renderer replaces legacy aggregate renderers', () => {
  assert.match(statsJs, /function _renderOverallSummary/);
  assert.match(statsJs, /function _renderPeriodScopedStats/);
  assert.match(statsJs, /_renderOverallSummary\(scope\)/);
  assert.match(statsJs, /const range = _statsAnalysisRange\(\)/);
  assert.match(statsJs, /buildStatsPeriodSummary\(range\)/);
  assert.match(statsSummaryModelJs, /hasDietRecord\(y, m, d\)/);
  assert.match(statsJs, /stats-summary-kpi/);
  assert.match(statsJs, /stats-summary-fact/);
  assert.doesNotMatch(statsJs, /function _renderOverallMetadata/);
  assert.doesNotMatch(statsJs, /function _renderMuscle14d/);
  assert.doesNotMatch(statsJs, /function _renderMusclePeriod/);
  assert.doesNotMatch(statsJs, /function _renderDietStats/);
  assert.doesNotMatch(statsJs, /function _renderMonthlySummary/);
  assert.doesNotMatch(statsJs, /_renderMuscle14d\(\)/);
  assert.doesNotMatch(statsJs, /_renderMusclePeriod\(\)/);
  assert.doesNotMatch(statsJs, /_renderDietStats\(\)/);
  assert.doesNotMatch(statsJs, /_renderMonthlySummary\(\)/);
});

test('deep stats tab is merged into the overall workout analysis block', () => {
  assert.match(statsJs, /function _renderWorkoutAnalysis/);
  assert.match(statsJs, /STATS_ANALYSIS_PERIODS/);
  assert.match(statsAnalysisRangeJs, /week:\s*\{\s*label:\s*'이번주'/);
  assert.match(statsAnalysisRangeJs, /export function weekStartKey/);
  assert.match(statsAnalysisRangeJs, /config\.kind === 'week'/);
  assert.match(statsJs, /계획 이행률/);
  assert.match(statsJs, /계획 대비 볼륨/);
  assert.match(statsJs, /완료 세트/);
  assert.match(statsJs, /_renderWorkoutAnalysis\(scope\)/);
  assert.doesNotMatch(statsJs, /function _renderDeepStats/);
  assert.doesNotMatch(statsJs, /switchStatsView/);
  assert.doesNotMatch(statsJs, /deep-stats-report/);
  assert.doesNotMatch(statsJs, /trainer-quest-deep-stats/);
  assert.doesNotMatch(statsJs, /export function setPeriod/);
  assert.doesNotMatch(appJs, /window\.setPeriod/);
});

test('trainer quest stats export exposes JSON data for AI sharing', () => {
  assert.match(statsJs, /export function buildTrainerQuestStatsExport\(\)/);
  assert.match(statsJs, /schema: 'tomatofarm\.trainerStats\.v1'/);
  assert.match(statsJs, /buildTrainerQuestStatsExportText/);
  assert.match(statsJs, /JSON\.stringify\(buildTrainerQuestStatsExport\(\), null, 2\)/);
  assert.match(statsJs, /healthChart/);
  assert.match(statsJs, /muscleFatigue/);
  assert.match(statsJs, /workoutAnalysis/);
  assert.match(statsJs, /exercisePerformance/);
  assert.match(statsJs, /planAdherencePct/);
});

test('compact summary styles are present and cache version is bumped', () => {
  const summaryValueRule = cssRule('.stats-summary-block .stats-summary-kpi b');
  assert.match(styleCss, /\.stats-summary-kpis/);
  assert.match(styleCss, /\.stats-summary-block \.stats-summary-kpis\s*\{[\s\S]*?gap:\s*8px/);
  assert.match(summaryValueRule, /font-weight:\s*850/);
  assert.doesNotMatch(summaryValueRule, /font-family:\s*var\(--font-mono\)/);
  assert.match(styleCss, /\.stats-analysis-controls/);
  assert.match(styleCss, /\.stats-analysis-card/);
  assert.match(styleCss, /\.stats-performance-block/);
  assert.match(styleCss, /\.stats-summary-fact/);
  assert.match(styleCss, /\.stats-summary-kpi\.is-good/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
