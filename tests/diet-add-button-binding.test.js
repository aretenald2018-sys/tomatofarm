import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const appJs = readFileSync('app.js', 'utf8');
const indexHtml = readFileSync('index.html', 'utf8');
const staticActionsJs = readFileSync('app/static-actions.js', 'utf8');
const workoutUiJs = readFileSync('workout-ui.js', 'utf8');
const workoutRenderJs = readFileSync('workout/render.js', 'utf8');
const workoutLoadJs = readFileSync('workout/load.js', 'utf8');
const featureNutritionJs = readFileSync('feature-nutrition.js', 'utf8');
const nutritionSearchModalJs = readFileSync('modals/nutrition-search-modal.js', 'utf8');
const nutritionItemModalJs = readFileSync('modals/nutrition-item-modal.js', 'utf8');
const styleCss = readAppCssSync();

function createMealSkipHarness() {
  let active = false;
  const calls = [];
  const button = {
    classList: {
      contains(name) { return name === 'active' && active; },
    },
  };
  const foodList = { innerHTML: 'existing food' };
  const mealInput = { value: 'existing memo' };
  const document = {
    getElementById(id) {
      if (id === 'wt-breakfast-skipped') return button;
      if (id === 'wt-foods-breakfast') return foodList;
      if (id === 'wt-meal-breakfast') return mealInput;
      return null;
    },
  };
  const start = workoutUiJs.indexOf('const _mealSkipDispatches = new Set();');
  const end = workoutUiJs.indexOf('\n};', start) + 3;
  assert.ok(start >= 0 && end > start, 'meal skip function should be extractable');
  const runnable = `${workoutUiJs.slice(start, end)}`
    .replace('export function wtSkipMeal', 'function wtSkipMeal')
    + '\nglobalThis.__wtSkipMeal = wtSkipMeal;';
  const context = {
    document,
    Promise,
    wtToggleMealSkipped() {
      calls.push('toggle');
      active = !active;
    },
  };
  vm.runInNewContext(runnable, context, { filename: 'workout-ui.js' });
  return { calls, run: context.__wtSkipMeal, getActive: () => active, foodList, mealInput };
}

test('all meal add buttons use the static namespaced diet action', () => {
  assert.equal((indexHtml.match(/data-action="diet:add-food"/g) || []).length, 4);
  assert.doesNotMatch(indexHtml, /data-action="addFood"/);
  assert.match(staticActionsJs, /'diet:add-food': \(control\) => openNutritionSearch\(control\.dataset\.meal\)/);
  assert.doesNotMatch(appJs, /function _initDietInputButtons/);
});

test('the retired quick-choice sheet and its crossed-out actions are not shipped', () => {
  assert.doesNotMatch(appJs, /openMealQuickAdd|meal-quick-add|AI 사진 분석|사진만 첨부/, 'quick-choice actions should be removed from the diet add flow');
  assert.doesNotMatch(styleCss, /meal-quick-add/, 'unused quick-choice sheet styles should be removed');
  assert.doesNotMatch(indexHtml, /openMealQuickAdd/, 'meal buttons should not point at the retired action');
});

test('frequent food cards use the static namespaced diet action', () => {
  assert.match(workoutRenderJs, /data-action="diet:add-frequent-food"/);
  assert.match(staticActionsJs, /'diet:add-frequent-food': \(control\) => wtAddFrequentFoodSuggestion\(control\.dataset\.meal, control\.dataset\.suggestionKey\)/);
});

test('same-date workout loads bind diet food actions before returning', () => {
  assert.match(
    workoutLoadJs,
    /if \(isSameDate && targetSessionIndex === \(Number\(S\.workout\.sessionIndex\) \|\| 0\)\) \{[\s\S]*?bindDietFoodActions\(\);[\s\S]*?return;/,
    'opening the diet tab after today was already loaded must not leave food actions unbound'
  );
});

test('photo registration replaces the search sheet with a ready photo editor', () => {
  assert.match(nutritionSearchModalJs, /data-nutrition-action="open-photo-add"[^>]*>사진으로 등록<\/button>/);
  assert.doesNotMatch(nutritionSearchModalJs, /data-action="diet:open-nutrition-photo"/);
  assert.match(featureNutritionJs, /async function _openNutritionEditorTab\(tab\)[\s\S]*await ensureModal\('nutrition-item-modal'\)[\s\S]*closeModal\('nutrition-search-modal'\)[\s\S]*await openNutritionItemEditor\(null\)[\s\S]*switchNutritionTab\(tab\)/);
  assert.match(featureNutritionJs, /if \(action === 'open-photo-add'\) void openNutritionPhotoAdd\(\)/);
  assert.match(workoutRenderJs, /export async function openNutritionPhotoUpload\(\)[\s\S]*await ensureModal\('nutrition-item-modal'\)[\s\S]*closeModal\('nutrition-search-modal'\)[\s\S]*switchNutritionTab\('photo'\)/);
  assert.doesNotMatch(workoutRenderJs, /setTimeout\(\(\) => switchNutritionTab\('photo'\)/);
});

test('nutrition item cancel closes explicitly without turning sheet clicks into backdrop closes', () => {
  assert.match(
    nutritionItemModalJs,
    /if \(action === 'close'\) \{[\s\S]*?if \(control !== modal \|\| event\.target === modal\) closeNutritionItemModal\(\);[\s\S]*?\}/,
  );
  assert.doesNotMatch(
    nutritionItemModalJs,
    /if \(action === 'close'\) closeNutritionItemModal\(event\)/,
  );
});

test('skip meals have one static action owner and retain duplicate-delivery protection', () => {
  assert.match(staticActionsJs, /^\s*'diet:skip-meal': \(_control, _event, meal\) => wtSkipMeal\(meal\),/m);
  assert.match(
    workoutUiJs,
    /const _mealSkipDispatches = new Set\(\);[\s\S]*?if \(_mealSkipDispatches\.has\(meal\)\) return;[\s\S]*?Promise\.resolve\(\)\.then\(\(\) => _mealSkipDispatches\.delete\(meal\)\);/,
    'same-turn duplicate delivery must be ignored while later meal taps still toggle'
  );
});

test('meal skip treats duplicate delivery from one click as one toggle', async () => {
  const harness = createMealSkipHarness();

  harness.run('breakfast');
  harness.run('breakfast');
  assert.deepEqual(harness.calls, ['toggle']);
  assert.equal(harness.getActive(), true);
  assert.equal(harness.foodList.innerHTML, '');
  assert.equal(harness.mealInput.value, '');

  await Promise.resolve();
  harness.run('breakfast');
  assert.deepEqual(harness.calls, ['toggle', 'toggle']);
  assert.equal(harness.getActive(), false, 'a later deliberate tap should still unskip the meal');
});
