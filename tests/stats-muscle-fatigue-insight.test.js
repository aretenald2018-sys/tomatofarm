import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const statsJs = readFileSync('render-stats.js', 'utf8');
const fatigueModelJs = readFileSync('stats/fatigue-model.js', 'utf8');
const css = readAppCssSync();
const swJs = readFileSync('sw.js', 'utf8') + readFileSync('runtime-assets.js', 'utf8');

function sliceByFirstBrace(source, startToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} should exist`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `${startToken} should have a body`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${startToken} body should close`);
}

test('muscle fatigue classifies underactive groups as blue action candidates', () => {
  const build = sliceByFirstBrace(fatigueModelJs, 'export function _buildMuscleFatigue');
  assert.match(fatigueModelJs, /export const LANDMARKS = \{/);
  assert.match(statsJs, /import \{[\s\S]*?LANDMARKS,[\s\S]*?\} from '\.\/stats\/fatigue-model\.js'/);
  assert.match(fatigueModelJs, /function _fatigueBlue/);
  assert.match(fatigueModelJs, /function _fatigueStatus/);
  assert.match(build, /group\.tone = status\.tone/);
  assert.match(build, /status\.tone === 'under' \|\| status\.tone === 'low' \? _fatigueBlue/);
  assert.match(build, /underactive/);
  assert.match(build, /hot/);
});

test('muscle fatigue renders next-workout insight instead of color-only feedback', () => {
  const insight = sliceByFirstBrace(statsJs, 'function _fatigueInsight');
  const render = sliceByFirstBrace(statsJs, 'function _renderMuscleFatigue');
  assert.match(insight, /다음 운동은/);
  assert.match(insight, /2-4세트 먼저/);
  assert.match(insight, /빨간 부위/);
  assert.match(insight, /파란 부위/);
  assert.match(render, /다음 운동 힌트/);
  assert.match(render, /보강 후보/);
  assert.match(render, /집중 부위/);
  assert.match(render, /stats-fatigue-range/);
  assert.doesNotMatch(render, /data-fatigue-period/);
});

test('muscle fatigue styles support direct blue and red muscle tint states', () => {
  assert.match(css, /\.stats-fatigue-hotspot\s*\{[\s\S]*mix-blend-mode:\s*color;/);
  assert.doesNotMatch(css, /\.stats-fatigue-hotspot\.is-under,\s*\.stats-fatigue-hotspot\.is-low\s*\{[\s\S]*mix-blend-mode:\s*screen;/);
  assert.match(css, /\.stats-fatigue-insight\.is-under/);
  assert.match(css, /\.stats-fatigue-name em/);
  assert.match(css, /\.stats-fatigue-range/);
  assert.doesNotMatch(css, /\.stats-fatigue-tabs/);
  assert.match(css, /rgba\(0,0,0,0\) 76%\)/);
});

test('service worker cache version was bumped for stats fatigue insight assets', () => {
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
