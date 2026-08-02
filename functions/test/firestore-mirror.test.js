"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SYNC_FIELD,
  compareVersion,
  eventVersion,
  isExpiredSyncEvent,
  isInternalMirrorMutation,
  isSyncOnlyMutation,
  pathHash,
  shouldMirrorPath,
} = require("../sync/firestore-mirror");

const production = {
  sourceProject: "exercise-management",
  eventId: "prod-write",
  eventTime: "2026-07-19T01:00:00.000Z",
};
const development = {
  sourceProject: "tomatodev-arete",
  eventId: "dev-write",
  eventTime: "2026-07-19T01:01:00.000Z",
};

test("mirrors private documents, nested route chunks, and approved global content only", () => {
  assert.equal(shouldMirrorPath("users/김_태우/workouts/2026-07-19"), true);
  assert.equal(shouldMirrorPath("users/김_태우/running_routes/route-1/chunks/chunk-1"), true);
  assert.equal(shouldMirrorPath("_accounts/김_태우"), true);
  assert.equal(shouldMirrorPath("_guilds/tomato"), true);
  assert.equal(shouldMirrorPath("_notifications/notice-1"), false);
  assert.equal(shouldMirrorPath("_fcm_tokens/device-1"), false);
  assert.equal(shouldMirrorPath("__tomato_sync_tombstones/hash"), false);
  assert.equal(shouldMirrorPath("users/김_태우/workouts/2026-07-19/parts/chunk/too-deep/item"), false);
});

test("version ordering is deterministic for delayed and simultaneous events", () => {
  assert.ok(compareVersion(development, production) > 0);
  assert.ok(compareVersion(production, development) < 0);
  assert.equal(compareVersion(production, { ...production }), 0);
  const sameTimeProduction = { ...production, eventTime: development.eventTime };
  assert.ok(compareVersion(sameTimeProduction, development) < 0);
});

test("only a changed mirror marker suppresses a reflected write", () => {
  assert.equal(isInternalMirrorMutation(
    { [SYNC_FIELD]: production, value: "before" },
    { [SYNC_FIELD]: production, value: "after" },
    "tomatodev-arete",
    "exercise-management",
  ), false, "a user write retaining an old marker must sync back");

  assert.equal(isInternalMirrorMutation(
    { [SYNC_FIELD]: production, value: "before" },
    { [SYNC_FIELD]: development, value: "after" },
    "tomatodev-arete",
    "exercise-management",
  ), true, "the function's own marker update must not loop");
});

test("a sync-marker-only stamp is distinguished from a real payload change", () => {
  const payload = { exercises: [{ name: "squat", sets: [{ reps: 5, kg: 100 }] }], memo: "pr day" };
  assert.equal(isSyncOnlyMutation(
    { ...payload, [SYNC_FIELD]: production },
    { ...payload, [SYNC_FIELD]: development },
  ), true, "the mirror writing its marker back must not queue a dashboard rebuild");

  assert.equal(isSyncOnlyMutation(
    { ...payload, [SYNC_FIELD]: production },
    { ...payload, memo: "deload day", [SYNC_FIELD]: development },
  ), false, "a payload change alongside a marker change must still rebuild");

  assert.equal(isSyncOnlyMutation(
    { exercises: [{ name: "squat" }] },
    { exercises: [{ name: "squat" }, { name: "bench" }] },
  ), false, "nested growth without any marker must rebuild");

  assert.equal(isSyncOnlyMutation(null, { [SYNC_FIELD]: development }), false);
});

test("redelivered events expire after the bounded retry window", () => {
  const now = Date.parse("2026-07-19T12:00:00.000Z");
  const maxAge = 6 * 60 * 60 * 1000;
  assert.equal(isExpiredSyncEvent("2026-07-19T11:00:00.000Z", now, maxAge), false, "fresh events run");
  assert.equal(isExpiredSyncEvent("2026-07-19T05:00:00.000Z", now, maxAge), true, "day-long redelivery is abandoned");
  assert.equal(isExpiredSyncEvent("not-a-timestamp", now, maxAge), false, "unparseable time defers to eventVersion()");
});

test("event versions and tombstone keys require stable event identity", () => {
  assert.deepEqual(eventVersion({ id: "event-1", time: production.eventTime }, "exercise-management"), {
    ...production,
    eventId: "event-1",
  });
  assert.throws(() => eventVersion({ id: "event-1" }, "exercise-management"));
  assert.equal(pathHash("users/김_태우/workouts/2026-07-19"), pathHash("users/김_태우/workouts/2026-07-19"));
  assert.notEqual(pathHash("users/김_태우/workouts/2026-07-19"), pathHash("users/김_태우/workouts/2026-07-20"));
});
