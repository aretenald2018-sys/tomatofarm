import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appJs = readFileSync('app.js', 'utf8');
const actionRouterJs = readFileSync('utils/action-router.js', 'utf8');
const workoutRenderJs = readFileSync('workout/render.js', 'utf8');
const workoutLoadJs = readFileSync('workout/load.js', 'utf8');

test('PWA action bootstrap runs even when app.js evaluates after window load', () => {
  assert.match(appJs, /let _appInitializationStarted = false;/);
  assert.match(appJs, /function startInitializeApp\(\) \{[\s\S]*?if \(_appInitializationStarted\) return;[\s\S]*?void initializeApp\(\)/);
  assert.match(appJs, /if \(document\.readyState === 'complete'\) startInitializeApp\(\);/);
  assert.match(appJs, /window\.addEventListener\('load', startInitializeApp, \{ once: true \}\);/);
  assert.doesNotMatch(appJs, /window\.addEventListener\('load', initializeApp\);/);
});

test('a delayed modal chunk cannot prevent shell action registration', () => {
  const start = appJs.indexOf('async function initializeApp()');
  const end = appJs.indexOf('\n}\n\nlet _lifeZoneNpcQuestEventBound', start);
  const initializeBody = appJs.slice(start, end);
  assert.match(initializeBody, /try \{[\s\S]*?await _withTimeout\(loadAndInjectModals\(\), 8000, 'post-load modal initialization'\);[\s\S]*?\} catch \(e\)/);
  assert.match(initializeBody, /initActionRouter\(\)/);
  assert.match(initializeBody, /registerStaticActions\(\)/);
});

test('diet data actions leave the global router for their direct PWA owner', () => {
  assert.match(actionRouterJs, /document\.addEventListener\('click', _onClick\);/);
  assert.match(actionRouterJs, /const target = e\.target\?\.nodeType === 1 \? e\.target : e\.target\?\.parentElement;/);
  assert.match(actionRouterJs, /action === 'diet:add-food' \|\| action === 'diet:add-frequent-food'/);
});

// Regression: the router used to abdicate for every add-food click inside
// #tab-diet. Before the first date hydration ran bindDietFoodActions(), no
// handler owned the button at all and pressing it did nothing.
test('an unbound add-food button still reaches the registered delegated handler', () => {
  assert.match(actionRouterJs, /export const DIET_FOOD_HANDLED_FLAG = '__tomatoDietFoodHandled';/);
  assert.match(actionRouterJs,
    /action === 'diet:add-food' \|\| action === 'diet:add-frequent-food'\) && e\[DIET_FOOD_HANDLED_FLAG\]\) return;/);
  assert.doesNotMatch(actionRouterJs, /el\.closest\?\.\('#tab-diet'\)/);
  assert.match(workoutRenderJs, /import \{ DIET_FOOD_HANDLED_FLAG \} from '\.\.\/utils\/action-router\.js';/);
  assert.match(workoutRenderJs, /event\[DIET_FOOD_HANDLED_FLAG\] = true;/);
});

test('diet panel directly owns add actions when PWA event delegation is unavailable', () => {
  assert.match(workoutRenderJs, /export function bindDietFoodActions\(\)/);
  assert.match(workoutRenderJs, /panel\.querySelectorAll\('\[data-action="diet:add-food"\], \[data-action="diet:add-frequent-food"\]'\)/);
  assert.match(workoutRenderJs, /control\.addEventListener\('click', \(event\) => \{/);
  assert.match(workoutRenderJs, /control\.dataset\.action === 'diet:add-food'/);
  assert.match(workoutRenderJs, /openNutritionSearch\(control\.dataset\.meal\)/);
  assert.match(workoutRenderJs, /wtAddFrequentFoodSuggestion\(control\.dataset\.meal, control\.dataset\.suggestionKey\)/);
  assert.match(workoutRenderJs, /container\.innerHTML = `<div class="diet-frequent-food-card">\$\{sections\.join\('\'\)\}<\/div>`;[\s\S]*?bindDietFoodActions\(\);/);
  assert.match(workoutLoadJs, /bindDietFoodActions\(\);/);
});
