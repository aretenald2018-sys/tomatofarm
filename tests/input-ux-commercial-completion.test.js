import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync('index.html', 'utf8');
const workoutTypeUiJs = readFileSync('workout/type-ui.js', 'utf8');
const styleCss = readAppCssSync();
const swJs = readFileSync('sw.js', 'utf8') + readFileSync('runtime-assets.js', 'utf8');

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...tokens) {
    tokens.forEach(token => this.values.add(token));
  }

  remove(...tokens) {
    tokens.forEach(token => this.values.delete(token));
  }

  toggle(token, force) {
    const shouldAdd = force == null ? !this.values.has(token) : !!force;
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    return shouldAdd;
  }

  contains(token) {
    return this.values.has(token);
  }
}

class FakeElement {
  constructor(id, classes = []) {
    this.id = id;
    this.classList = new FakeClassList(classes);
    this.style = {};
    this.dataset = {};
  }
}

function tagById(html, id) {
  const pattern = new RegExp(`<([a-z0-9-]+)\\b[^>]*\\bid="${id}"[^>]*>(?:[^<]*)`, 'i');
  const match = html.match(pattern);
  assert.ok(match, `${id} should exist`);
  return match[0];
}

function buildWorkoutUiHarness() {
  const calls = {
    timerStarts: 0,
    restShows: 0,
    restHides: 0,
    manualCardioOpens: 0,
    runningOpens: 0,
  };
  const ids = [
    'wt-chip-gym',
    'wt-chip-running',
    'wt-chip-cardio',
    'wt-chip-cf',
    'wt-chip-stretch',
    'wt-chip-swimming',
    'wt-gym-section',
    'wt-cf-section',
    'wt-stretch-section',
    'wt-swim-section',
    'wt-workout-timer-bar',
    'wt-memo-section',
    'wt-save-section',
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  elements.get('wt-chip-gym').classList.add('active');

  const document = {
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const contextWindow = {
    wtOpenManualCardioInput() {
      calls.manualCardioOpens += 1;
    },
    wtOpenRunningSession() {
      calls.runningOpens += 1;
    },
  };
  const runnable = `
    const wtStartWorkoutTimer = () => { window.__calls.timerStarts += 1; };
    const wtRestTimerShowIdle = () => { window.__calls.restShows += 1; };
    const wtRestTimerHideIdle = () => { window.__calls.restHides += 1; };
    const wtOpenManualCardioInput = () => { window.__calls.manualCardioOpens += 1; };
    const wtOpenRunningSession = () => { window.__calls.runningOpens += 1; };
    ${workoutTypeUiJs.replace(/^import .*;$/gm, '').replace(/^export\s+/gm, '')}
    window.wtSwitchType = wtSwitchType;
  `;
  vm.runInNewContext(runnable, {
    window: Object.assign(contextWindow, { __calls: calls }),
    document,
    Element: FakeElement,
    console,
  }, { filename: 'workout-ui.js' });
  return { calls, elements, window: contextWindow };
}

test('workout shell exposes first-class activity type entries and forms', () => {
  const activityTabs = [
    ['wt-chip-gym', 'gym', '헬스'],
    ['wt-chip-running', 'running', '런닝'],
    ['wt-chip-cardio', 'manual-cardio', '유산소'],
    ['wt-chip-cf', 'cf', '크로스핏'],
    ['wt-chip-stretch', 'stretch', '스트레칭'],
    ['wt-chip-swimming', 'swimming', '수영'],
  ];
  for (const [id, type, label] of activityTabs) {
    const tag = tagById(indexHtml, id);
    assert.match(tag, /wt-type-tab/);
    assert.match(tag, /data-action="workout:switch-type"/);
    assert.ok(tag.includes(`data-action-arg="${type}"`), `${id} should expose its activity type`);
    assert.ok(tag.includes(label), `${id} should expose the expected label`);
  }

  for (const id of [
    'wt-cf-section',
    'wt-cf-wod',
    'wt-cf-duration-min',
    'wt-stretch-section',
    'wt-stretch-duration',
    'wt-swim-section',
    'wt-swim-distance',
    'wt-swim-duration-min',
  ]) {
    tagById(indexHtml, id);
  }
});

test('workout type state machine opens activity surfaces without starting non-gym timers', () => {
  const { calls, elements, window } = buildWorkoutUiHarness();

  window.wtSwitchType('cf');
  assert.equal(elements.get('wt-chip-cf').classList.contains('active'), true);
  assert.equal(elements.get('wt-cf-section').classList.contains('wt-open'), true);
  assert.equal(elements.get('wt-workout-timer-bar').classList.contains('wt-open'), true);
  assert.equal(calls.timerStarts, 0);

  window.wtSwitchType('manual-cardio');
  assert.equal(elements.get('wt-chip-cardio').classList.contains('active'), true);
  assert.equal(elements.get('wt-cf-section').classList.contains('wt-open'), false);
  assert.equal(calls.manualCardioOpens, 1);
  assert.equal(calls.timerStarts, 0);

  window.wtSwitchType('running');
  assert.equal(elements.get('wt-chip-running').classList.contains('active'), true);
  assert.equal(calls.runningOpens, 1);
  assert.equal(calls.timerStarts, 0);

  window.wtSwitchType('gym');
  assert.equal(elements.get('wt-chip-gym').classList.contains('active'), true);
  assert.equal(calls.timerStarts, 1);
  assert.equal(calls.restShows, 1);

  window.wtSwitchType('gym');
  assert.equal(calls.timerStarts, 1, 're-clicking gym should not start a duplicate timer');
});

test('new input UX styles and service worker cache marker are present', () => {
  assert.match(styleCss, /\.wt-activity-fields/);
  assert.match(styleCss, /\.diet-frequent-food-options/);
  assert.doesNotMatch(styleCss, /\.meal-quick-add-backdrop/);
  assert.match(styleCss, /\.ex-picker-cardio-backdrop--standalone/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
