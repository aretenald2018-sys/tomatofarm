"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDashboardSnapshot } = require("../dashboard/aggregate");
const { validateDashboardSnapshot } = require("../dashboard/contract");

test("dashboard-v1 fixture is complete and leaves missing wine unrated", () => {
  const now = Date.UTC(2026, 6, 16, 3);
  const snapshot = buildDashboardSnapshot({
    revision: 7,
    nowEpochMs: now,
    tomato: {
      settings: {
        diet_plan: { height: 175, weight: 75, age: 32, bodyFatPct: 17, targetWeight: 68, targetBodyFatPct: 10 },
        season_registry: { seasons: [{ id: "s1", startDate: "2026-07-01", endDate: "2026-08-31" }] },
        season_s1_workout_plan: { weeklySessionTarget: 3 },
        season_s1_running_plan: { weeklyDistanceKm: 20, weeklySessions: 3 },
        season_s1_test_board_v2: {
          seasonId: "s1",
          benchmarks: [{ id: "squat", exerciseId: "squat", groupId: "lower", label: "스쿼트", status: "active", order: 0, program: "stair", tracks: ["volume"], setsDefault: 4 }],
          cycles: [{ id: "lower-cycle", groupId: "lower", startDate: "2026-07-13", weeks: 6, status: "active" }],
          steps: [{ id: "squat-step", benchmarkId: "squat", track: "volume", cycleId: "lower-cycle", weekStart: "2026-07-13", span: 1, kg: 105, reps: 6, sets: 4, weekLog: {} }],
        },
      },
      workouts: [
        {
          id: "2026-07-16",
          bKcal: 500,
          lKcal: 600,
          dKcal: 700,
          bProtein: 35,
          lProtein: 45,
          dProtein: 55,
          exercises: [{ name: "스쿼트", sets: [{ kg: 100, reps: 8, done: true }, { kg: 100, reps: 8, done: true }] }],
          running: true,
          runDistance: 5,
          runDurationSec: 1650,
          runAvgPaceSecPerKm: 330,
          runRouteSummary: { cadenceSpm: 176 },
        },
      ],
    },
    budget: {
      categories: [{ id: "food", kind: "expense", budgetRhythm: "spread", target: 600000, monthlyTargets: { "2026-07": 600000 } }],
      transactions: [{ id: "t1", categoryId: "food", type: "card_payment", amount: 10000, occurredAt: new Date(now - 3600000) }],
      tastings: [],
      bottles: [],
    },
  });
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.domains.wine.score, null);
  assert.equal(validateDashboardSnapshot(snapshot).ok, true);
  assert.ok(snapshot.domains.food.score > 0);
  assert.equal(snapshot.workouts[0].label, "스쿼트");
  assert.equal(snapshot.workouts[0].value, "105kg × 6");
  assert.equal(snapshot.workouts[0].status, "4세트 · 계획");
  assert.equal(snapshot.healthGoal.seasonWeek, 3);
});

test("wine score uses only the five most recent valid ratings", () => {
  const now = Date.UTC(2026, 6, 16, 3);
  const tastings = [5, 4.5, 4, 3.5, 3, 1].map((score, index) => ({
    id: `t${index}`,
    bottleId: "b1",
    taewooScore: score,
    tastedAt: new Date(now - index * 60000),
  }));
  const snapshot = buildDashboardSnapshot({
    nowEpochMs: now,
    tomato: { workouts: [], settings: {} },
    budget: { transactions: [], categories: [], tastings, bottles: [{ id: "b1", name: "Test Wine" }] },
  });
  assert.equal(snapshot.domains.wine.ratedCount, 5);
  assert.equal(snapshot.domains.wine.averageRating, 4);
  assert.equal(snapshot.domains.wine.score, 80);
  assert.equal(snapshot.wine.name, "Test Wine");
});

test("dashboard keeps the latest five running records and point balance details", () => {
  const now = Date.UTC(2026, 6, 16, 3);
  const workouts = [1, 2, 3, 4, 5, 6].map((day) => ({
    id: `2026-07-${String(day + 8).padStart(2, "0")}`,
    running: true,
    runDistance: day,
    runDurationSec: day * 300,
    runRouteSummary: { cadenceSpm: 160 + day },
  }));
  const snapshot = buildDashboardSnapshot({
    nowEpochMs: now,
    tomato: { workouts, settings: {} },
    budget: {
      categories: [{ id: "food", kind: "expense", budgetRhythm: "spread", target: 300000 }],
      transactions: [
        ...Array.from({ length: 90 }, (_, index) => ({
          type: "card_payment",
          categoryId: "food",
          amount: 10000,
          occurredAt: new Date(now - (index + 1) * 24 * 60 * 60 * 1000),
        })),
      ],
      appSettings: {
        biweeklyStartDate: "2026-07-06",
        rewardSavings: {
          lookbackDays: 90,
          baselineMethod: "simple_daily",
          pointItems: [{ id: "wine", label: "와인구매 포인트", rate: 0.3, enabled: true }],
        },
      },
      rewardPointEntries: [{ pointItemId: "wine", amount: 100, usedAt: new Date(now - 24 * 60 * 60 * 1000) }],
      tastings: [],
      bottles: [],
    },
  });

  assert.deepEqual(snapshot.running.records.map((record) => record.distanceKm), [6, 5, 4, 3, 2]);
  assert.deepEqual(snapshot.running.records.map((record) => record.cadenceSpm), [166, 165, 164, 163, 162]);
  assert.equal(snapshot.points.state, "ready");
  assert.equal(snapshot.points.label, "와인구매 포인트");
  assert.ok(snapshot.points.balance >= 0);
  assert.ok(snapshot.points.earnedTwoWeek >= 0);
});
