"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDashboardSnapshot, healthDomain, runningDomain } = require("../dashboard/aggregate");

const NOW = Date.UTC(2026, 6, 18, 3);

test("running falls back to the day root and combines minute and second duration fields", () => {
  const domain = runningDomain([{
    id: "2026-07-18",
    workoutSessions: [{ exercises: [{ name: "Squat", sets: [{ kg: 100, reps: 5, done: true }] }] }],
    running: true,
    runDistance: 5,
    runDurationMin: 30,
    runDurationSec: 15,
    runRouteSummary: { durationSec: 9999, cadenceSpm: 176 },
  }], { weeklyDistanceKm: 20, weeklySessions: 3 }, "2026-07-18", NOW);

  assert.equal(domain.weeklySessions, 1);
  assert.equal(domain.weeklyDistanceKm, 5);
  assert.equal(domain.latestPaceSecPerKm, 363);
  assert.equal(domain.latestCadenceSpm, 176);
});

test("strength falls back to root fields when workoutSessions contains only running", () => {
  const domain = healthDomain([{
    id: "2026-07-18",
    exercises: [{ name: "Squat", sets: [{ kg: 100, reps: 5, done: true }] }],
    workoutSessions: [{ running: true, runDistance: 3, runDurationMin: 18 }],
  }], { weeklySessionTarget: 3 }, "2026-07-18", NOW);

  assert.equal(domain.sessions, 1);
  assert.equal(domain.completedSets, 1);
  assert.equal(domain.volumeKg, 500);
  assert.equal(domain.workouts[0].label, "Squat");
});

test("route, route reference, and route summary alone each count as a run", () => {
  const domain = runningDomain([
    {
      id: "2026-07-15",
      workoutSessions: [{ runRoute: [{ lat: 37.5, lng: 127 }] }],
    },
    {
      id: "2026-07-16",
      workoutSessions: [{ runRouteRef: { routeId: "route-1", pointCount: 620 } }],
    },
    {
      id: "2026-07-17",
      workoutSessions: [{ runRouteSummary: { pointCount: 200, distanceKm: 2.5, durationSec: 900 } }],
    },
  ], { weeklyDistanceKm: 20, weeklySessions: 3 }, "2026-07-18", NOW);

  assert.equal(domain.weeklySessions, 3);
  assert.equal(domain.weeklyDistanceKm, 2.5);
  assert.equal(domain.records.length, 3);
  assert.equal(domain.records[0].distanceKm, 2.5);
  assert.equal(domain.records[0].paceSecPerKm, 360);
});

test("route summary duration is used only when explicit duration fields are empty", () => {
  const domain = runningDomain([{
    id: "2026-07-18",
    runRouteSummary: { pointCount: 20, distanceKm: 4, durationSec: 1440 },
  }], { weeklyDistanceKm: 20, weeklySessions: 3 }, "2026-07-18", NOW);

  assert.equal(domain.weeklySessions, 1);
  assert.equal(domain.latestPaceSecPerKm, 360);
});

test("a mismatched season-keyed board falls back to the matching generic board", () => {
  const snapshot = buildDashboardSnapshot({
    tomato: {
      workouts: [],
      settings: {
        season_registry: {
          seasons: [{ id: "summer", name: "Summer", startDate: "2026-07-01", endDate: "2026-08-31" }],
        },
        season_summer_test_board_v2: { seasonId: "spring", benchmarks: [], cycles: [], steps: [] },
        test_board_v2: { seasonId: "summer", benchmarks: [], cycles: [], steps: [] },
      },
    },
    budget: {},
    nowEpochMs: NOW,
  });

  assert.equal(snapshot.healthGoal.state, "empty");
  assert.equal(snapshot.healthGoal.seasonId, "summer");
});

test("an untagged exact-key board is normalized to the active season", () => {
  const snapshot = buildDashboardSnapshot({
    tomato: {
      workouts: [],
      settings: {
        season_registry: {
          seasons: [{ id: "summer", name: "Summer", startDate: "2026-07-01", endDate: "2026-08-31" }],
        },
        season_summer_test_board_v2: { benchmarks: [], cycles: [], steps: [] },
      },
    },
    budget: {},
    nowEpochMs: NOW,
  });

  assert.equal(snapshot.healthGoal.state, "empty");
  assert.equal(snapshot.healthGoal.seasonId, "summer");
});
