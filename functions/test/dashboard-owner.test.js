"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  TOMATO_ADMIN_OWNER_ID,
  TOMATO_ADMIN_GUEST_OWNER_ID,
  TOMATO_ACCOUNT_DATA_COLLECTIONS,
  TOMATO_DATA_OWNER_REGISTRY_COLLECTION,
  TOMATO_DATA_OWNER_REGISTRY_ID,
  TOMATO_DATA_OWNER_REGISTRY_VERSION,
  TOMATO_DATA_OWNER_REGISTRY_STATUS,
  canonicalTomatoOwnerId,
  mergeTomatoDocuments,
  mergeTomatoWorkoutDays,
  mergeTomatoWorkoutDocuments,
  initializeTomatoDataOwnerId,
  normalizeTomatoDataOwnerId,
  readTomatoDataOwnerRegistry,
  resolveTomatoDataOwnerId,
  tomatoOwnerAliases,
} = require("../dashboard/owner");

const REGISTRY_PATH = `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`;

function snapshot(docs) {
  return { docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })) };
}

function decidedRegistry(ownerId) {
  return {
    ownerId,
    version: TOMATO_DATA_OWNER_REGISTRY_VERSION,
    status: TOMATO_DATA_OWNER_REGISTRY_STATUS,
  };
}

function decisionDb({ initialRegistry = null, transactionRegistry = null, populatedCollections = [] } = {}) {
  const populated = new Set(populatedCollections);
  const state = { collectionReads: [], limits: [], writes: [] };
  const snapshot = (registry) => ({ data: () => registry || undefined });
  const registryRef = {
    path: REGISTRY_PATH,
    get: async () => snapshot(initialRegistry),
  };
  return {
    state,
    doc(pathValue) {
      assert.equal(pathValue, REGISTRY_PATH);
      return registryRef;
    },
    collection(pathValue) {
      state.collectionReads.push(pathValue);
      const collectionName = pathValue.split("/").at(-1);
      return {
        limit(limitValue) {
          state.limits.push({ path: pathValue, limit: limitValue });
          return { get: async () => ({ empty: !populated.has(collectionName) }) };
        },
      };
    },
    runTransaction(callback) {
      return callback({
        get: async (ref) => {
          assert.equal(ref, registryRef);
          return snapshot(transactionRegistry);
        },
        set: (ref, value) => {
          assert.equal(ref, registryRef);
          state.writes.push(value);
        },
      });
    },
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

test("shared Tomato data owner resolves only to a valid registered physical owner", async () => {
  const reads = [];
  const db = {
    doc(path) {
      reads.push(path);
      return { get: async () => ({ data: () => decidedRegistry(TOMATO_ADMIN_GUEST_OWNER_ID) }) };
    },
  };

  assert.equal(normalizeTomatoDataOwnerId(TOMATO_ADMIN_GUEST_OWNER_ID), TOMATO_ADMIN_GUEST_OWNER_ID);
  assert.equal(normalizeTomatoDataOwnerId("unrelated-user"), "");
  assert.equal(readTomatoDataOwnerRegistry({ ownerId: TOMATO_ADMIN_GUEST_OWNER_ID }), "");
  assert.equal(await resolveTomatoDataOwnerId(db, TOMATO_ADMIN_OWNER_ID), TOMATO_ADMIN_GUEST_OWNER_ID);
  assert.deepEqual(reads, [REGISTRY_PATH]);
});

test("nonshared Tomato owners remain unchanged without a registry read", async () => {
  const db = { doc: () => assert.fail("nonshared owner must not read the shared registry") };
  assert.equal(await resolveTomatoDataOwnerId(db, "문정_회원"), "문정_회원");
});

test("runtime resolution fails closed instead of letting a client choose a physical owner", async () => {
  const db = decisionDb();

  await assert.rejects(
    resolveTomatoDataOwnerId(db, TOMATO_ADMIN_GUEST_OWNER_ID),
    error => error.code === "TOMATO_DATA_OWNER_NOT_INITIALIZED",
  );
  assert.deepEqual(db.state.collectionReads, []);
  assert.deepEqual(db.state.writes, []);
});

test("privileged initialization selects admin when any known private collection has data", async () => {
  const db = decisionDb({ populatedCollections: ["settings"] });

  assert.equal(await initializeTomatoDataOwnerId(db, { now: () => 123 }), TOMATO_ADMIN_OWNER_ID);
  assert.deepEqual(
    db.state.collectionReads,
    TOMATO_ACCOUNT_DATA_COLLECTIONS.map((name) => `users/${TOMATO_ADMIN_OWNER_ID}/${name}`),
  );
  assert.ok(["running_routes", "custom_muscles", "movies", "settings"].every(
    (name) => TOMATO_ACCOUNT_DATA_COLLECTIONS.includes(name),
  ));
  assert.ok(db.state.limits.every(({ limit }) => limit === 1));
  assert.equal(db.state.writes.length, 1);
  assert.equal(db.state.writes[0].ownerId, TOMATO_ADMIN_OWNER_ID);
  assert.equal(db.state.writes[0].version, TOMATO_DATA_OWNER_REGISTRY_VERSION);
  assert.equal(db.state.writes[0].status, TOMATO_DATA_OWNER_REGISTRY_STATUS);
  assert.equal(db.state.writes[0].decidedAt, 123);
  assert.equal(db.state.writes[0].reason, "admin-has-private-data");
});

test("privileged initialization selects guest only for a literally empty admin namespace", async () => {
  const db = decisionDb();

  assert.equal(await initializeTomatoDataOwnerId(db), TOMATO_ADMIN_GUEST_OWNER_ID);
  assert.equal(db.state.collectionReads.length, TOMATO_ACCOUNT_DATA_COLLECTIONS.length);
  assert.equal(db.state.writes.length, 1);
  assert.equal(db.state.writes[0].ownerId, TOMATO_ADMIN_GUEST_OWNER_ID);
  assert.equal(db.state.writes[0].reason, "admin-private-namespace-empty");
});

test("a valid owner chosen by a concurrent privileged initializer wins", async () => {
  const db = decisionDb({ transactionRegistry: decidedRegistry(TOMATO_ADMIN_OWNER_ID) });

  assert.equal(await initializeTomatoDataOwnerId(db), TOMATO_ADMIN_OWNER_ID);
  assert.equal(db.state.writes.length, 0);
});

test("privileged initialization refuses to overwrite an invalid or partial registry", async () => {
  const db = decisionDb({ initialRegistry: { status: "deciding", version: 2 } });
  await assert.rejects(
    initializeTomatoDataOwnerId(db),
    /exists but is not a valid decided v2 record/,
  );
  assert.deepEqual(db.state.collectionReads, []);
  assert.deepEqual(db.state.writes, []);
});

test("dashboard and weekly ranking are wired to exactly one resolved private owner", () => {
  const serviceSource = fs.readFileSync(path.join(__dirname, "../dashboard/service.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(__dirname, "../index.js"), "utf8");

  assert.match(serviceSource, /const dataOwnerId = await resolveTomatoDataOwnerId\(tomatoDb, ownerId\)/);
  assert.match(serviceSource, /users\/\$\{dataOwnerId\}\/workouts/);
  assert.match(serviceSource, /users\/\$\{dataOwnerId\}\/settings/);
  assert.match(serviceSource, /users\/\$\{dataOwnerId\}\/exercises/);
  assert.doesNotMatch(serviceSource, /mergeTomatoDocuments|legacyRoot|accountSources/);

  assert.match(indexSource, /const ownerId = await resolveTomatoDataOwnerId\(db, account\?\.id\)/);
  assert.doesNotMatch(indexSource, /_candidateWorkoutOwnerIds/);
});

test("the privileged initializer requires an explicit deployed-rules fence acknowledgement", () => {
  const initializerSource = fs.readFileSync(
    path.join(__dirname, "../scripts/initialize-tomato-data-owner.js"),
    "utf8",
  );
  assert.match(initializerSource, /commit && !rulesFenced/);
  assert.match(initializerSource, /--rules-fenced-v2/);
  assert.match(initializerSource, /adminTomatoNamespaceHasData\(db\)/);
  assert.match(initializerSource, /initializeTomatoDataOwnerId\(db\)/);
});
