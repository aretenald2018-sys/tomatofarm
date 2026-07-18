import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = readAppCssSync();
const workoutExercises = await readFile(new URL('../workout/exercises.js', import.meta.url), 'utf8');
const setEditorJs = await readFile(new URL('../workout/set-editor.js', import.meta.url), 'utf8');

function ruleBody(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`).exec(source);
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

function gridMinBudgetPx(rule) {
  const grid = /grid-template-columns:\s*([^;]+)/.exec(rule)?.[1] || '';
  const columns = [...grid.matchAll(/minmax\((\d+)px,[^)]+\)|(\d+)px/g)]
    .map(match => Number(match[1] || match[2]))
    .filter(Number.isFinite);
  const gap = Number(/gap:\s*(\d+)px/.exec(rule)?.[1] || 0);
  assert.ok(columns.length > 0, 'grid-template-columns should expose px minimums');
  return columns.reduce((sum, n) => sum + n, 0) + gap * Math.max(0, columns.length - 1);
}

test('test-mode exercise card keeps title from being squeezed by trend graph', () => {
  const titleRow = ruleBody('.ex-max-v2-title-row');
  const plan = ruleBody('.ex-max-v2-plan');
  const goal = ruleBody('.ex-max-v2-plan-goal');
  const trend = ruleBody('.ex-max-v2-trend');

  assert.match(titleRow, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(plan, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(112px,\s*\.72fr\)/);
  assert.match(goal, /min-width:\s*0/);
  assert.match(trend, /min-width:\s*0/);
  assert.doesNotMatch(css, /#tab-workout\s+\.ex-block-header\s+\.ex-sparkline-wrap/);
});

test('workout exercise card DOM renders test-mode trend graph inside plan area only', () => {
  const start = workoutExercises.indexOf('function _buildMaxExerciseCardHeader');
  const end = workoutExercises.indexOf('function _maxSetTypeLabel', start);
  assert.ok(start >= 0 && end > start, 'test-mode card header function should exist');
  const headerFn = workoutExercises.slice(start, end);
  const beforePlan = headerFn.slice(0, headerFn.indexOf('<div class="ex-max-v2-plan">'));

  assert.match(headerFn, /<div class="ex-max-v2-title-row">/);
  assert.match(headerFn, /<div class="ex-max-v2-plan">/);
  assert.match(headerFn, /\$\{sparkline[\s\S]*<div class="ex-max-v2-trend">\$\{sparkline\}<\/div>/);
  assert.doesNotMatch(beforePlan, /\$\{sparkline\}/);
  assert.doesNotMatch(workoutExercises, /<div class="ex-block-header">/);
});

test('test-mode previous volume stays in a single compact row', () => {
  const last = ruleBody('.ex-max-v2-last');
  const text = ruleBody('.ex-max-v2-last-text');
  const start = workoutExercises.indexOf('function _buildMaxLastSessionSummary');
  const end = workoutExercises.indexOf('function _buildMaxExerciseCardHeader', start);
  assert.ok(start >= 0 && end > start, 'last session summary function should exist');
  const fn = workoutExercises.slice(start, end);

  assert.match(last, /white-space:\s*nowrap/);
  assert.match(last, /overflow-x:\s*auto/);
  assert.match(text, /white-space:\s*nowrap/);
  assert.match(fn, /ex-max-v2-last-text/);
  assert.match(fn, /직전 \$\{trackLabel\} \$\{dateLabel\} · \$\{setSummary\}/);
  assert.doesNotMatch(fn, /ex-max-v2-last-label|ex-max-v2-last-sets/);
});

test('workout entry carousel uses horizontal snap slides', () => {
  const shell = ruleBody('#tab-workout .ex-entry-carousel');
  const controls = ruleBody('#tab-workout .ex-entry-carousel-controls');
  const track = ruleBody('#tab-workout .ex-entry-carousel-track');
  const slide = ruleBody('#tab-workout .ex-entry-carousel-slide');
  const slideCard = ruleBody('#tab-workout .ex-entry-carousel-slide > .ex-block');

  assert.match(shell, /display:\s*grid/);
  assert.match(controls, /grid-template-columns:\s*52px minmax\(0,\s*1fr\) 52px/);
  assert.match(track, /display:\s*flex/);
  assert.match(track, /overflow-x:\s*auto/);
  assert.match(track, /scroll-snap-type:\s*x mandatory/);
  assert.match(track, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(slide, /flex:\s*0 0 min\(100%,\s*440px\)/);
  assert.match(slide, /scroll-snap-align:\s*center/);
  assert.match(slide, /scroll-snap-stop:\s*always/);
  assert.match(slideCard, /margin-bottom:\s*0/);
});

test('test-mode set row is one-line compact and does not render ROM slider', () => {
  const row = ruleBody('.ex-max-v2-main-row');
  const set = ruleBody('.ex-max-v2-set');
  const fieldInput = ruleBody('.ex-max-v2-field input');
  const rom = ruleBody('.ex-max-v2-rom-field');
  const romInput = ruleBody('.ex-max-v2-rom-field input');
  const start = workoutExercises.indexOf('function _renderSets');
  const end = workoutExercises.indexOf('if (typeof Sortable', start);
  assert.ok(start >= 0 && end > start, 'set render function should exist');
  const fn = workoutExercises.slice(start, end);

  assert.match(row, /grid-template-columns:\s*30px\s+minmax\(44px,\s*\.9fr\)\s+minmax\(44px,\s*\.9fr\)\s+minmax\(40px,\s*\.76fr\)\s+minmax\(58px,\s*1fr\)\s+28px\s+17px\s+14px/);
  assert.ok(gridMinBudgetPx(row) <= 296, 'base set row minimum width should stay within mobile card budget');
  assert.match(set, /min-height:\s*36px/);
  assert.match(fieldInput, /height:\s*30px/);
  assert.match(fieldInput, /font-size:\s*14px/);
  assert.match(fieldInput, /line-height:\s*18px/);
  assert.match(rom, /grid-template-columns:\s*18px\s+minmax\(20px,\s*1fr\)\s+13px/);
  assert.match(romInput, /height:\s*30px/);
  assert.match(romInput, /font-size:\s*14px/);
  assert.match(romInput, /line-height:\s*18px/);
  const narrowCss = css.slice(css.indexOf('@media (max-width: 360px)'), css.indexOf('.ex-max-v2-actions'));
  const narrowRow = ruleBody('.ex-max-v2-main-row', narrowCss);
  const narrowRom = ruleBody('.ex-max-v2-rom-field', narrowCss);
  assert.match(narrowRow, /grid-template-columns:\s*28px\s+minmax\(38px,\s*\.78fr\)\s+minmax\(38px,\s*\.78fr\)\s+minmax\(34px,\s*\.66fr\)\s+minmax\(54px,\s*1fr\)\s+24px\s+14px\s+10px/);
  assert.ok(gridMinBudgetPx(narrowRow) <= 254, '360px set row minimum width should avoid overflow');
  assert.match(narrowRom, /grid-template-columns:\s*16px\s+minmax\(20px,\s*1fr\)\s+12px/);
  assert.match(fn, /ex-max-v2-rom-field/);
  assert.match(fn, /set-rom-input/);
  assert.match(fn, /_romPctToScoreInput\(romValue\)/);
  assert.match(fn, /inputmode="decimal"\s+min="0"\s+max="10"\s+step="0\.5"/);
  assert.match(fn, /aria-label="가동범위 10점 입력"/);
  assert.match(fn, /<em>\/10<\/em>/);
  assert.match(fn, /_romScoreInputToPct\(e\.target\.value\)/);
  assert.match(workoutExercises, /function _romScoreInputToPct\(val\)[\s\S]*n \* 10/);
  assert.match(workoutExercises, /function _romPctToScoreInput\(val\)[\s\S]*\/ 10/);
  assert.doesNotMatch(fn, /set-rom-range/);
  assert.doesNotMatch(fn, /가동범위 퍼센트 직접 입력|<em>%<\/em>|max="100"/);
});

test('workout number inputs are larger and guarded against keyboard focus scroll', () => {
  const tabInput = ruleBody('#tab-workout .set-input');
  const maxTabInput = ruleBody('#tab-workout .ex-block--max-v2 .ex-max-v2-field input');
  const maxTabRomInput = ruleBody('#tab-workout .ex-block--max-v2 .ex-max-v2-rom-field input');
  const start = workoutExercises.indexOf('function _renderSets');
  const end = workoutExercises.indexOf('if (typeof Sortable', start);
  const addStart = workoutExercises.indexOf('export function wtAddSet');
  const addEnd = workoutExercises.indexOf('export function wtRemoveSet', addStart);
  const updateStart = workoutExercises.indexOf('export function wtUpdateSet');
  const updateEnd = workoutExercises.indexOf('export function wtUpdateSetRir', updateStart);
  assert.ok(start >= 0 && end > start, 'set render function should exist');
  assert.ok(addStart >= 0 && addEnd > addStart, 'set add function should exist');
  assert.ok(updateStart >= 0 && updateEnd > updateStart, 'set update function should exist');
  const fn = workoutExercises.slice(start, end);
  const addFn = workoutExercises.slice(addStart, addEnd);
  const updateFn = workoutExercises.slice(updateStart, updateEnd);

  assert.match(tabInput, /width:\s*64px/);
  assert.match(tabInput, /min-height:\s*36px/);
  assert.match(tabInput, /font-size:\s*16px/);
  assert.match(tabInput, /scroll-margin-bottom:\s*calc\(172px \+ env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.match(maxTabInput, /height:\s*30px/);
  assert.match(maxTabInput, /font-size:\s*14px/);
  assert.match(maxTabRomInput, /height:\s*30px/);
  assert.doesNotMatch(css, /wt-workout-detail-mode|wt-exercise-detail-root/);
  assert.match(fn, /inputmode="decimal" placeholder="kg"/);
  assert.match(fn, /inputmode="decimal" placeholder="회"/);
  assert.doesNotMatch(fn, /class="set-input"[^>]*inputmode="numeric"/);
  assert.match(fn, /_bindWorkoutNumberInputFocusGuard\(row\)/);
  assert.match(workoutExercises, /const WORKOUT_NUMBER_INPUT_SELECTOR = '\.set-input, \.set-rpe-input, \.set-rom-input'/);
  assert.match(workoutExercises, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(workoutExercises, /dataset\.wtNumberInputGuard/);
  assert.match(workoutExercises, /function _rememberWorkoutNumberInputTarget/);
  assert.match(workoutExercises, /function _getPendingWorkoutNumberInputTarget/);
  assert.match(workoutExercises, /dataset\.wtEntryIndex/);
  assert.match(workoutExercises, /pointerdown/);
  assert.match(workoutExercises, /function _captureWorkoutNumberInputRenderScroll/);
  assert.match(workoutExercises, /function _restoreWorkoutRenderScroll/);
  assert.match(workoutExercises, /function _parseWorkoutSetNumberInput/);
  assert.match(setEditorJs, /kg:\s*''/);
  assert.match(setEditorJs, /reps:\s*''/);
  assert.match(addFn, /_restoreWorkoutRenderScroll\(restoreScroll\)/);
  assert.match(updateFn, /sourceInput = null/);
  assert.match(updateFn, /_captureWorkoutNumberInputRenderScroll\(sourceInput\)/);
  assert.match(updateFn, /_parseWorkoutSetNumberInput\(val, \{ integer: field === 'reps' \}\)/);
  assert.match(updateFn, /_restoreWorkoutRenderScroll\(restoreScroll\)/);
  assert.match(fn, /wtUpdateSet\(entryIdx, si, 'kg',\s+e\.target\.value, e\.target\)/);
  assert.match(fn, /wtUpdateSet\(entryIdx, si, 'reps', e\.target\.value, e\.target\)/);
});
