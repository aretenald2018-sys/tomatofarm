"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  canonicalTomatoOwnerId,
  mergeTomatoDocuments,
  mergeTomatoWorkoutDays,
  mergeTomatoWorkoutDocuments,
  tomatoOwnerAliases,
} = require("../dashboard/owner");

function snapshot(documents) {
  return {
    docs: documents.map(({ id, data }) => ({ id, data: () => data })),
  };
}

test("Daybird dashboard canonicalizes the Tomato guest owner and keeps its aliases", () => {
  assert.equal(canonicalTomatoOwnerId(TOMATO_ADMIN_GUEST_OWNER_ID), TOMATO_ADMIN_OWNER_ID);
  assert.deepEqual(tomatoOwnerAliases(TOMATO_ADMIN_GUEST_OWNER_ID), [
    TOMATO_ADMIN_OWNER_ID,
    TOMATO_ADMIN_GUEST_OWNER_ID,
  ]);
});

test("dashboard source merges same-date workout documents by meal, strength, and running domains", () => {
  const rows = mergeTomatoWorkoutDocuments([
    snapshot([{ id: "2026-07-17", data: {
      lKcal: 620,
      lFoods: [{ name: "canonical lunch" }],
      workoutSessions: [{ exercises: [{ name: "canonical squat", sets: [{ kg: 100, reps: 5 }] }] }],
    } }]),
    snapshot([
      { id: "2026-07-17", data: {
        bKcal: 400,
        lKcal: 999,
        lFoods: [{ name: "stale guest lunch" }],
        running: true,
        runDistance: 5,
        runDurationMin: 30,
        runDurationSec: 15,
        workoutSessions: [{
          exercises: [{ name: "stale guest squat", sets: [{ kg: 50, reps: 5 }] }],
          running: true,
          runDistance: 5,
          runDurationMin: 30,
          runDurationSec: 15,
        }],
      } },
      { id: "2026-07-16", data: { bKcal: 400 } },
    ]),
  ], (document) => ({ id: document.id, ...document.data() }));

  assert.equal(rows[0].bKcal, 400);
  assert.equal(rows[0].lKcal, 620);
  assert.equal(rows[0].lFoods[0].name, "canonical lunch");
  assert.equal(rows[0].running, true);
  assert.equal(rows[0].runDistance, 5);
  assert.equal(rows[0].workoutSessions.length, 2);
  assert.equal(rows[0].workoutSessions[0].exercises[0].name, "canonical squat");
  assert.equal(rows[0].workoutSessions[1].exercises, undefined);
  assert.equal(rows[0].workoutSessions[1].runDistance, 5);
  assert.deepEqual(rows[1], { id: "2026-07-16", bKcal: 400 });
});

test("generic settings merge still keeps the canonical whole document", () => {
  const rows = mergeTomatoDocuments([
    snapshot([{ id: "setting", data: { value: "canonical" } }]),
    snapshot([{ id: "setting", data: { value: "guest" } }]),
  ], (document) => ({ id: document.id, ...document.data() }));

  assert.deepEqual(rows, [{ id: "setting", value: "canonical" }]);
});

test("later aliases fill only domains that remain missing", () => {
  const [row] = mergeTomatoWorkoutDocuments([
    snapshot([{ id: "2026-07-18", data: {
      bOk: true,
      running: true,
      runDistance: 4,
    } }]),
    snapshot([{ id: "2026-07-18", data: {
      exercises: [{ name: "guest deadlift", sets: [{ kg: 120, reps: 3 }] }],
      running: true,
      runDistance: 8,
    } }]),
    snapshot([{ id: "2026-07-18", data: {
      bKcal: 350,
      exercises: [{ name: "legacy press", sets: [{ kg: 60, reps: 5 }] }],
    } }]),
  ], (document) => ({ id: document.id, ...document.data() }));

  assert.equal(row.bKcal, 350);
  assert.equal(row.runDistance, 4);
  assert.equal(row.exercises[0].name, "guest deadlift");
});

test("strength, crossfit, stretching, and swimming recover independently", () => {
  const [row] = mergeTomatoWorkoutDocuments([
    snapshot([{ id: "2026-07-18", data: {
      workoutSessions: [{
        id: "strength-session",
        exercises: [{ name: "canonical squat", sets: [{ kg: 100, reps: 5 }] }],
        running: false,
        runDistance: 0,
        runDurationMin: 0,
        runDurationSec: 0,
        runSource: "manual",
      }],
    } }]),
    snapshot([{ id: "2026-07-18", data: {
      workoutSessions: [{
        id: "mixed-cardio-session",
        cf: true,
        cfWod: "Fran",
        stretching: true,
        stretchDuration: 10,
        swimming: true,
        swimDistance: 1000,
        running: true,
        runDistance: 5,
      }],
    } }]),
  ], (document) => ({ id: document.id, ...document.data() }));

  assert.equal(row.workoutSessions.length, 5);
  assert.equal(row.workoutSessions[0].exercises[0].name, "canonical squat");
  assert.equal(row.workoutSessions[1].cf, true);
  assert.equal(row.workoutSessions[1].swimming, undefined);
  assert.equal(row.workoutSessions[2].stretchDuration, 10);
  assert.equal(row.workoutSessions[3].swimDistance, 1000);
  assert.equal(row.workoutSessions[4].runDistance, 5);
});

test("an empty workout timeline on a run does not block fallback strength", () => {
  const row = mergeTomatoWorkoutDays({
    running: true,
    runDistance: 5,
    workoutTimeline: {
      mode: "set-completion",
      source: "none",
      checkedSetCount: 0,
      durationSec: 0,
    },
  }, {
    exercises: [{ name: "Squat", sets: [{ kg: 100, reps: 5 }] }],
    workoutDuration: 600,
    restBetweenSets: 90,
  });

  assert.equal(row.runDistance, 5);
  assert.equal(row.exercises[0].name, "Squat");
  assert.equal(row.workoutDuration, 600);
  assert.equal(row.restBetweenSets, 90);
});
