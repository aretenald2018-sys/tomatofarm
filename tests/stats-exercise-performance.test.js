import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync('index.html', 'utf8');
const statsJs = readFileSync('render-stats.js', 'utf8');
const statsFormatJs = readFileSync('stats/format.js', 'utf8');
const statsSelectorsJs = readFileSync('stats/selectors.js', 'utf8');
const styleCss = readAppCssSync();
const swJs = readFileSync('sw.js', 'utf8') + readFileSync('runtime-assets.js', 'utf8');

test('stats page includes exercise performance trend before volume trend', () => {
  assert.match(indexHtml, /운동별 퍼포먼스 추이[\s\S]*id="exercise-performance-section"[\s\S]*종목별 볼륨 추이/);
  assert.match(statsJs, /data-stats-id="exercise-performance-section"[\s\S]*data-stats-id="volume-section"/);
});

test('exercise performance trend uses period-scoped volume and estimated 1rm signals', () => {
  assert.match(statsJs, /const PERFORMANCE_MAJORS = \['chest', 'back', 'shoulder', 'lower', 'bicep', 'tricep', 'abs'\]/);
  assert.match(statsJs, /function _buildExercisePerformanceRows/);
  assert.match(statsJs, /range\.fromKey/);
  assert.match(statsJs, /range\.toKey/);
  assert.match(statsJs, /calcVolume\(entry\.sets \|\| \[\]\)/);
  assert.match(statsJs, /_topSetE1rm\(entry\)/);
  assert.match(statsJs, /\.slice\(0, 2\)/);
  assert.match(statsSelectorsJs, /성장중/);
  assert.match(statsSelectorsJs, /유지중/);
  assert.match(statsSelectorsJs, /점검필요/);
  assert.match(statsJs, /exercisePerformanceStatus\(row, _fmt\)/);
});

test('stats renders workout volume as kg or t rather than an opaque vol unit', () => {
  assert.match(statsFormatJs, /export function formatVolumeMass\(value\)/);
  assert.match(statsFormatJs, /return `\$\{formatNumber\(Math\.round\(volume\)\)\}kg`/);
  assert.match(statsFormatJs, /return `\$\{formatNumber\(tons, Number\.isInteger\(tons\) \? 0 : 1\)\}t`/);
  assert.match(statsJs, /총 볼륨<\/span><b>\$\{_formatVolumeMass\(state\.totalVolume\)\}/);
  assert.match(statsJs, /_formatVolumeMass\(row\.totalVolume\)/);
  assert.match(statsJs, /_formatVolumeMass\(h\.volume\)/);
  assert.match(statsJs, /총볼륨\(kg\)/);
  assert.doesNotMatch(statsJs, /\}\s*vol|text:'vol'|총볼륨\(vol\)/);
});

test('exercise performance card uses TDS-like compact table styling', () => {
  assert.match(styleCss, /\.stats-performance-block/);
  assert.match(styleCss, /\.stats-perf-table/);
  assert.match(styleCss, /\.stats-perf-row/);
  assert.match(styleCss, /\.stats-perf-spark/);
  assert.match(styleCss, /\.stats-perf-status/);
  assert.match(styleCss, /\.stats-perf-row\.is-growth \.stats-perf-status b \{ color: #2563eb; \}/);
  assert.doesNotMatch(styleCss, /\.stats-perf-row\.is-growth \.stats-perf-status b \{ color: var\(--diet-ok\); \}/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
