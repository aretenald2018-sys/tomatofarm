import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatWorkoutCompletionElapsed,
  latestWorkoutCompletionAt,
} from '../workout/completion-metrics.js';

const calendarJs = readFileSync(new URL('../render-calendar.js', import.meta.url), 'utf8');
const calendarWorkoutReadModelJs = readFileSync(new URL('../calendar/workout-read-model.js', import.meta.url), 'utf8');
const calendarDetailTemplateJs = readFileSync(new URL('../calendar/detail-template.js', import.meta.url), 'utf8');
const workoutIndexJs = readFileSync(new URL('../workout/index.js', import.meta.url), 'utf8');
const styleCss = readAppCssSync();
const swJs = readFileSync(new URL('../sw.js', import.meta.url), 'utf8') + readFileSync(new URL('../runtime-assets.js', import.meta.url), 'utf8');

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

test('workout duration remains in the top-right summary card', () => {
  const summary = sliceByFirstBrace(calendarDetailTemplateJs, 'function _renderWorkoutDetailSummaryCard');
  assert.match(summary, /label:\s*'운동시간'/);
  assert.match(summary, /wx\?\.durationSec/);
});

test('workout summary card shows elapsed rest since the latest completed set', () => {
  const summary = sliceByFirstBrace(calendarDetailTemplateJs, 'function _renderWorkoutDetailSummaryCard');
  assert.match(calendarDetailTemplateJs, /from '\.\.\/workout\/completion-metrics\.js'/);
  assert.match(summary, /const lastCompletedAt = latestWorkoutCompletionAt\(wx\)/);
  assert.match(summary, /label:\s*'휴식'/);
  assert.match(summary, /formatWorkoutCompletionElapsed\(lastCompletedAt\)/);
  assert.match(summary, /data-wt-last-complete-elapsed/);
  assert.match(summary, /data-completed-at="\$\{lastCompletedAt\}"/);
  assert.match(calendarJs, /function _mountWorkoutSummaryElapsedTimers/);
  assert.match(calendarJs, /_mountWorkoutSummaryElapsedTimers\(root\)/);
});

test('workout completion metrics use only completed workout timestamps', () => {
  const wx = {
    exercises: [
      {
        exerciseCompletedAt: 1500000,
        rawSetDetails: [
          { done: true, completedAt: 1000000 },
          { done: false, completedAt: 2500000 },
        ],
      },
      {
        rawSetDetails: [
          { done: true, completedAt: 1900000 },
        ],
      },
    ],
  };

  assert.equal(latestWorkoutCompletionAt(wx), 1900000);
  assert.equal(formatWorkoutCompletionElapsed(1000000, 1000000 + (7 * 60000) + 31000), '07:31');
  assert.equal(formatWorkoutCompletionElapsed(1000000, 1000000 + (65 * 60000)), '1:05:00');
  assert.equal(formatWorkoutCompletionElapsed(null, 1000000), '—');
  assert.equal(formatWorkoutCompletionElapsed(1000000, 999999), '00:00');
  assert.equal(latestWorkoutCompletionAt({
    lastCompletedAt: 2100000,
    exercises: [{ setDetails: [{ done: true, completedAt: 2200000 }] }],
  }), 2100000);
  assert.equal(latestWorkoutCompletionAt({
    exercises: [{ setDetails: [{ done: true, completedAt: 2300000 }] }],
  }), 2300000);
  assert.match(calendarJs, /}, 1000\) \|\| null/);
});

test('workout calendar duration can fall back to set completion timeline', () => {
  assert.match(calendarWorkoutReadModelJs, /import \{ buildWorkoutSetTimeline \} from '\.\.\/workout\/timeline\.js'/);
  assert.match(calendarWorkoutReadModelJs, /const workoutTimeline = buildWorkoutSetTimeline\(d\.exercises,\s*d\.workoutDuration\)/);
  assert.match(calendarWorkoutReadModelJs, /workoutTimeline\.durationSec/);
});

test('duration-only workout no longer creates a separate timer activity card', () => {
  const cards = sliceByFirstBrace(calendarDetailTemplateJs, 'function _renderWorkoutDetailCards');
  assert.doesNotMatch(cards, /label:\s*'운동 타이머'/);
  assert.doesNotMatch(cards, /key:\s*'timer'/);
  assert.doesNotMatch(cards, /wx\.workoutDurationSec\s*>\s*0/);
});

test('workout detail modal no longer renders timer-only body sections', () => {
  assert.doesNotMatch(calendarJs, /const timerOnlyHtml/);
  assert.doesNotMatch(calendarJs, /cal-workout-timer-line/);
  assert.doesNotMatch(calendarJs, /운동 타이머 \$\{_formatDuration/);
  assert.doesNotMatch(calendarJs, /timer:\s*'운동 타이머'/);
  assert.doesNotMatch(styleCss, /\.cal-workout-timer-line\b/);
});

test('workout finish saves without opening the old completion insight modal', () => {
  const finish = sliceByFirstBrace(workoutIndexJs, 'export async function wtEndAndShowInsights');
  assert.match(finish, /wtFinishWorkout\(\)/);
  assert.match(finish, /통계 탭에서 기간별로 확인/);
  assert.doesNotMatch(finish, /insightsOpen/);
  assert.doesNotMatch(finish, /sessionKey/);
});

test('service worker cache version was bumped for workout timer summary-only UI', () => {
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
