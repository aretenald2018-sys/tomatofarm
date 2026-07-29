import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styleCss = readAppCssSync();
const pickerModal = readFileSync(new URL('../modals/ex-picker-modal.js', import.meta.url), 'utf8');
const exercisesJs = readFileSync(new URL('../workout/exercises.js', import.meta.url), 'utf8');
const swJs = readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + readFileSync(new URL('../runtime-assets.js', import.meta.url), 'utf8');

test('underactive blue muscle tint uses direct color blending, not aura screen glow', () => {
  assert.match(styleCss, /\.stats-fatigue-hotspot\s*\{[\s\S]*mix-blend-mode:\s*color;/);
  assert.doesNotMatch(styleCss, /\.stats-fatigue-hotspot\.is-under,\s*\.stats-fatigue-hotspot\.is-low\s*\{[\s\S]*mix-blend-mode:\s*screen;/);
  assert.doesNotMatch(styleCss, /\.stats-fatigue-hotspot\s*\{[\s\S]*filter:\s*blur\(7px\)/);
});

test('exercise picker category top tabs no longer render custom tab', () => {
  assert.doesNotMatch(exercisesJs, /button\(\{\s*key:\s*'custom',\s*label:\s*'커스텀'/);
  assert.match(exercisesJs, /button\(\{\s*key:\s*'category',\s*label:\s*'분류'/);
  assert.match(exercisesJs, /button\(\{\s*key:\s*'all',\s*label:\s*'전체'/);
});

test('exercise picker footer superset bar is removed from modal markup', () => {
  assert.doesNotMatch(pickerModal, /ex-picker-footer/);
  assert.doesNotMatch(pickerModal, /슈퍼세트/);
  assert.doesNotMatch(pickerModal, /id="ex-picker-done"/);
});

test('exercise picker left rail chips are compact single-line controls', () => {
  assert.match(styleCss, /\.ex-picker-rail-chip,\s*\.ex-picker-rail-action\s*\{[\s\S]*min-height:\s*34px;/);
  assert.match(styleCss, /\.ex-picker-rail-chip,\s*\.ex-picker-rail-action\s*\{[\s\S]*font-size:\s*10\.5px;/);
  assert.match(styleCss, /\.ex-picker-rail-chip span\s*\{[\s\S]*white-space:\s*nowrap;/);
  assert.match(styleCss, /\.ex-picker-rail-chip span\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
});

test('exercise picker exposes visible create actions for CRUD', () => {
  const toolbar = exercisesJs.slice(
    exercisesJs.indexOf('function _renderPickerListToolbar'),
    exercisesJs.indexOf('function _renderPickerBenchmarkScope'),
  );

  assert.match(pickerModal, /id="ex-picker-add-top"[\s\S]*aria-label="종목 추가"/);
  assert.match(toolbar, /data-picker-create-exercise/);
  assert.match(toolbar, /\+ 종목 추가/);
  assert.match(toolbar, /addEventListener\('click', _openPickerEditorFromHeader\)/);
  assert.match(exercisesJs, /data-picker-empty-create/);
  // 편집기 템플릿을 먼저 확보한 뒤 연다.
  assert.match(exercisesJs, /_openExerciseEditorEnsured\(null, _pickerMuscleFilter \|\| null\)/);
  assert.match(exercisesJs, /export async function wtSaveExerciseFromEditor/);
  assert.match(exercisesJs, /export async function wtDeleteExerciseFromEditor/);
  assert.match(styleCss, /\.ex-picker-toolbar-row\s*\{[\s\S]*justify-content:\s*space-between/);
  assert.match(styleCss, /\.ex-picker-create-btn\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(styleCss, /\.ex-picker-empty-actions\s*\{[\s\S]*flex-wrap:\s*wrap/);
});

test('service worker cache version was bumped for stats picker UI polish', () => {
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
