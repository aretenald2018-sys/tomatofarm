import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRunningActivityAnalytics,
  listRunningActivities,
  summarizeRunningActivities,
} from '../workout/running-analytics.js';

const meterInLongitudeDegrees = 1 / 111_320;

function routePoint(meters, seconds, extras = {}) {
  return {
    lat: 0,
    lng: meters * meterInLongitudeDegrees,
    ts: seconds * 1000,
    accuracy: 5,
    ...extras,
  };
}

test('running analytics collects pace, calories, elevation, heart rate, cadence, and kilometer splits', () => {
  const route = [
    routePoint(0, 0, { altitude: 10, heartRateBpm: 140, cadenceSpm: 160 }),
    routePoint(500, 300, { altitude: 15, heartRateBpm: 150, cadenceSpm: 164 }),
    routePoint(1000, 600, { altitude: 10, heartRateBpm: 160, cadenceSpm: 166 }),
    routePoint(1500, 870, { altitude: 9, heartRateBpm: 170, cadenceSpm: 168 }),
    routePoint(2000, 1140, { altitude: 13, heartRateBpm: 165, cadenceSpm: 162 }),
  ];

  const analytics = buildRunningActivityAnalytics(route, {
    startedAt: 0,
    endedAt: 1_200_000,
    pausedMs: 60_000,
    distanceKm: 2,
    weightKg: 70,
  });

  assert.equal(analytics.durationSec, 1140);
  assert.equal(analytics.elapsedDurationSec, 1200);
  assert.equal(analytics.distanceKm, 2);
  assert.equal(analytics.avgPaceSecPerKm, 570);
  assert.equal(analytics.bestPaceSecPerKm, 540);
  assert.equal(analytics.elevationGainM, 9);
  assert.equal(analytics.elevationLossM, 6);
  assert.equal(analytics.avgHeartRateBpm, 157);
  assert.equal(analytics.maxHeartRateBpm, 170);
  assert.equal(analytics.cadenceSpm, 164);
  assert.equal(analytics.maxCadenceSpm, 168);
  assert.ok(analytics.calories > 0);
  assert.equal(analytics.calorieSource, 'estimated');
  assert.equal(analytics.calorieMethod, 'acsm-speed-grade-v1');
  assert.equal(analytics.calorieWeightKg, 70);
  assert.equal(analytics.splits.length, 2);
  assert.deepEqual(analytics.splits.map(split => ({ distanceKm: split.distanceKm, durationSec: split.durationSec })), [
    { distanceKm: 1, durationSec: 600 },
    { distanceKm: 1, durationSec: 540 },
  ]);
});

test('running analytics lets a watch-provided elevation gain override the route-derived estimate', () => {
  const route = [
    routePoint(0, 0, { altitude: 10 }),
    routePoint(500, 300, { altitude: 15 }),
    routePoint(1000, 600, { altitude: 10 }),
  ];

  // Route-derived gain here is 5m (10 -> 15, the 15 -> 10 descent doesn't count); a watch-supplied
  // value should win over that route-derived number.
  const routeDerived = buildRunningActivityAnalytics(route, { startedAt: 0, endedAt: 600_000, distanceKm: 1 });
  assert.equal(routeDerived.elevationGainM, 5);

  const withOverride = buildRunningActivityAnalytics(route, {
    startedAt: 0,
    endedAt: 600_000,
    distanceKm: 1,
    elevationGainM: 42,
  });
  assert.equal(withOverride.elevationGainM, 42);
  // The return shape stays the same (loss still comes from the route) — only gain is overridden.
  assert.equal(withOverride.elevationLossM, routeDerived.elevationLossM);
});

test('running analytics leaves calories empty instead of inventing a default body weight', () => {
  const analytics = buildRunningActivityAnalytics([
    routePoint(0, 0),
    routePoint(1_000, 600),
  ], {
    startedAt: 0,
    endedAt: 600_000,
    distanceKm: 1,
  });

  assert.equal(analytics.calories, null);
  assert.equal(analytics.calorieSource, null);
  assert.equal(analytics.calorieWeightKg, null);
});

test('running analytics aggregates every saved running session without double-counting daily rollups', () => {
  const entries = [
    ['2026-07-10', {
      workoutSessions: [
        {
          id: 'running-1', running: true, runDistance: 3.5, runDurationMin: 21,
          runRoute: [routePoint(0, 0), routePoint(1_000, 360)],
          runRouteSummary: { calories: 230, calorieSource: 'wear', elevationGainM: 20, elevationLossM: 12, avgHeartRateBpm: 150, maxHeartRateBpm: 168, bestPaceSecPerKm: 340, splits: [{ index: 1, distanceKm: 1, durationSec: 360, paceSecPerKm: 360 }] },
        },
        {
          id: 'running-2', running: true, runDistance: 2, runDurationMin: 14,
          runRouteSummary: { calories: 140, calorieSource: 'wear', elevationGainM: 8, elevationLossM: 6, avgHeartRateBpm: 154, maxHeartRateBpm: 172, bestPaceSecPerKm: 390 },
        },
      ],
      // This rollup is intentionally larger, and must not be counted as a third run.
      running: true,
      runDistance: 5.5,
      runDurationMin: 35,
    }],
    ['2026-07-11', {
      running: true,
      runDistance: 4,
      runDurationMin: 24,
      runRouteSummary: { calories: 280, calorieSource: 'wear', elevationGainM: 16, elevationLossM: 15, avgHeartRateBpm: 148, maxHeartRateBpm: 165, bestPaceSecPerKm: 350 },
    }],
  ];

  const activities = listRunningActivities(entries);
  const summary = summarizeRunningActivities(activities);

  assert.equal(summary.activityCount, 3);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.distanceKm, 9.5);
  assert.equal(summary.durationSec, 3540);
  assert.equal(summary.calories, 650);
  assert.equal(summary.elevationGainM, 44);
  assert.equal(summary.elevationLossM, 33);
  assert.equal(summary.bestPaceSecPerKm, 340);
  assert.equal(summary.maxHeartRateBpm, 172);
  assert.deepEqual(activities[0].splits, [{ index: 1, distanceKm: 1, durationSec: 360, paceSecPerKm: 360 }]);
  assert.equal(activities[0].route.length, 2);
});
