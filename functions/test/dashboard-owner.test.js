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
  initializeTomatoDataOwnerId,
  normalizeTomatoDataOwnerId,
  readTomatoDataOwnerRegistry,
  resolveTomatoDataOwnerId,
  tomatoOwnerAliases,
} = require("../dashboard/owner");

const REGISTRY_PATH = `${TOMATO_DATA_OWNER_REGISTRY_COLLECTION}/${TOMATO_DATA_OWNER_REGISTRY_ID}`;

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
