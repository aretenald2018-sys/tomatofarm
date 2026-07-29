import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildCalendarActivityRows } from '../calendar/activity-model.js';
import { cheerSignature, hasPriorityHomeOverlay, homeCardVisibility } from '../home/read-model.js';
import { runOptimisticSocialAction } from '../home/social-action.js';
import { exercisePerformanceStatus, lastRecordedValue, normalizeHealthValues, seriesDelta } from '../stats/selectors.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('calendar activity model preserves running telemetry and secondary activities', () => {
  const route = [{ lat: 37.5, lng: 127.0 }];
  const rows = buildCalendarActivityRows({
    running: true,
    runDistance: 5.25,
    runDurationMin: 30,
    runDurationSec: 12,
    runRoute: route,
    runRouteSummary: { calories: 410, calorieSource: 'wear', cadenceSpm: 172, segmentCount: 2 },
    swimming: true,
    swimDistance: 800,
    swimDurationMin: 20,
    swimStroke: '자유형',
  }, { isTrustedRunningCalories: () => true });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].main, '5.25km · 30분');
  assert.equal(rows[0].calories, 410);
  assert.equal(rows[0].cadenceSpm, 172);
  assert.equal(rows[0].route, route);
  assert.equal(rows[1].main, '800m · 20분 · 자유형');
});

test('stats selectors calculate trends without chart or DOM dependencies', () => {
  assert.deepEqual(seriesDelta([{ value: 100 }, { value: 115 }]), { count: 2, first: 100, last: 115, pct: 15 });
  assert.equal(exercisePerformanceStatus({ sessionDays: 2, volumeSeries: [{ value: 100 }, { value: 111 }], e1rmSeries: [] }).tone, 'growth');
  assert.deepEqual(normalizeHealthValues([70, null, 75]), [0, null, 100]);
  assert.equal(lastRecordedValue([null, 71, undefined]), 71);
});

test('home read model owns visibility, cheer signatures, and overlay priority', () => {
  const visible = homeCardVisibility(key => key !== 'quests');
  assert.equal(visible.find(card => card.key === 'quests').visible, false);
  assert.equal(visible.find(card => card.key === 'unit_goal').id, 'card-unit-goal');
  assert.equal(cheerSignature([{ id: 'a' }, { from: 'u1', createdAt: 3 }]), 'a|u1_3');
  assert.equal(hasPriorityHomeOverlay({ getElementById: id => id === 'tutorial-overlay' ? {} : null, querySelector: () => null }), true);
});

test('social action refreshes on success and rolls back before failure refresh', async () => {
  const success = [];
  const result = await runOptimisticSocialAction({
    apply: () => success.push('apply'),
    commit: async () => 7,
    refresh: (reason, value) => success.push(`${reason}:${value}`),
    reason: 'like',
  });
  assert.equal(result, 7);
  assert.deepEqual(success, ['apply', 'like:7']);

  const failed = [];
  await assert.rejects(() => runOptimisticSocialAction({
    apply: () => ({ selected: false }),
    commit: async () => { throw new Error('offline'); },
    rollback: snapshot => failed.push(`rollback:${snapshot.selected}`),
    refresh: reason => failed.push(`refresh:${reason}`),
    reason: 'reaction',
  }), /offline/);
  assert.deepEqual(failed, ['rollback:false', 'refresh:reaction:rollback']);
});

test('presentation renderers delegate models and admin stays behind data API', async () => {
  const [calendar, calendarDayMetrics, stats, admin] = await Promise.all([
    readFile(resolve(root, 'render-calendar.js'), 'utf8'),
    readFile(resolve(root, 'calendar/day-metrics.js'), 'utf8'),
    readFile(resolve(root, 'render-stats.js'), 'utf8'),
    readFile(resolve(root, 'render-admin.js'), 'utf8'),
  ]);
  assert.match(calendar, /from '\.\/calendar\/day-metrics\.js'/);
  assert.match(calendarDayMetrics, /buildCalendarActivityRows/);
  assert.match(stats, /from '\.\/stats\/selectors\.js'/);
  assert.doesNotMatch(admin, /data-core|firebase\/firestore|\b(?:getDoc|setDoc|collection)\s*\(/);
});
