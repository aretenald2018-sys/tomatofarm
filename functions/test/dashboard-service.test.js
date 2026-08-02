"use strict";

// Unit coverage for the two Firestore-cost guards added to the dashboard
// rebuild pipeline (see functions/dashboard/service.js):
//   F1 — processDashboardJob's self-recursion, used to catch up on revisions
//        requested while it held its lock, is capped at MAX_JOB_RECURSION_DEPTH.
//   F2 — queueDashboardRefresh coalesces requests that arrive within
//        COALESCE_WINDOW_MS of the last completed rebuild.
//
// processDashboardJob accepts tomatoDb/budgetDb/messaging directly, so it can
// be exercised end-to-end against an in-memory fake Firestore without an
// emulator or real credentials. queueDashboardRefresh instead builds its own
// budgetDb from a credentialed service account (budgetServices), which a
// plain unit test cannot safely fake — so its coalescing decision was pulled
// out into the pure, directly-testable shouldCoalesceDashboardRefresh(), and
// its wiring into queueDashboardRefresh is checked at the source level.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { FieldValue, FieldPath } = require("firebase-admin/firestore");
const {
  COALESCE_WINDOW_MS,
  MAX_JOB_RECURSION_DEPTH,
  processDashboardJob,
  shouldCoalesceDashboardRefresh,
} = require("../dashboard/service");

const NOW = Date.UTC(2026, 7, 3, 4, 0, 0);

function sentinelName(value) {
  return value && typeof value === "object" && value.constructor ? value.constructor.name : null;
}

function applyPatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (sentinelName(value) === "DeleteTransform") {
      delete target[key];
    } else if (sentinelName(value) === "ServerTimestampTransform") {
      target[key] = { __serverTimestamp: true };
    } else if (sentinelName(value) === "NumericIncrementTransform") {
      target[key] = (Number(target[key]) || 0) + value.operand;
    } else {
      target[key] = value;
    }
  }
}

function matchesFilter(snapshot, filter) {
  const { field, op, value } = filter;
  const isDocId = field instanceof FieldPath && field.isEqual(FieldPath.documentId());
  const actual = isDocId ? snapshot.id : (snapshot.data() || {})[field];
  switch (op) {
    case ">=": return actual !== undefined && actual >= value;
    case "<=": return actual !== undefined && actual <= value;
    case ">": return actual !== undefined && actual > value;
    case "<": return actual !== undefined && actual < value;
    case "==": return actual === value;
    default: throw new Error(`fake store: unsupported operator ${op}`);
  }
}

// Minimal in-memory stand-in for the slice of the Firestore SDK that
// dashboard/service.js actually calls: doc()/collection() with where/orderBy/
// limit, runTransaction(), and batch(). `onGet` (if provided) fires on every
// document read and can mutate the store first, letting tests simulate
// writes racing in concurrently with the code under test.
function createFakeFirestore(seed = {}, { onGet } = {}) {
  const store = new Map();
  for (const [docPath, data] of Object.entries(seed)) store.set(docPath, { ...data });

  function snapshotFor(docPath) {
    if (onGet) onGet(docPath, store);
    const data = store.get(docPath);
    const segments = docPath.split("/");
    return {
      exists: data !== undefined,
      id: segments[segments.length - 1],
      ref: { path: docPath },
      data: () => (data === undefined ? undefined : { ...data }),
    };
  }

  function setDoc(docPath, patch, opts = {}) {
    const current = opts && opts.merge ? (store.get(docPath) || {}) : {};
    const next = { ...current };
    applyPatch(next, patch);
    store.set(docPath, next);
  }

  function docRef(docPath) {
    return {
      path: docPath,
      id: docPath.split("/").pop(),
      get: async () => snapshotFor(docPath),
      set: async (patch, opts) => setDoc(docPath, patch, opts),
      collection: (name) => collectionRef(`${docPath}/${name}`),
    };
  }

  function directChildPaths(collectionPath) {
    const prefix = `${collectionPath}/`;
    const results = [];
    for (const key of store.keys()) {
      if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) results.push(key);
    }
    return results;
  }

  function queryRef(collectionPath, filters, orderBy, limitN) {
    return {
      where: (field, op, value) => queryRef(collectionPath, [...filters, { field, op, value }], orderBy, limitN),
      orderBy: (field, direction = "asc") => queryRef(collectionPath, filters, { field, direction }, limitN),
      limit: (n) => queryRef(collectionPath, filters, orderBy, n),
      doc: (id) => docRef(id ? `${collectionPath}/${id}` : `${collectionPath}/auto-${store.size}`),
      get: async () => {
        let docs = directChildPaths(collectionPath).map(snapshotFor);
        for (const filter of filters) docs = docs.filter((snapshot) => matchesFilter(snapshot, filter));
        if (orderBy) {
          docs = [...docs].sort((a, b) => {
            const av = (a.data() || {})[orderBy.field];
            const bv = (b.data() || {})[orderBy.field];
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return orderBy.direction === "desc" ? -cmp : cmp;
          });
        }
        if (limitN != null) docs = docs.slice(0, limitN);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  function collectionRef(collectionPath) {
    return queryRef(collectionPath, [], null, null);
  }

  return {
    store,
    doc: (docPath) => docRef(docPath),
    collection: (collectionPath) => collectionRef(collectionPath),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push({ type: "set", ref, data, opts }),
        delete: (ref) => ops.push({ type: "delete", ref }),
        commit: async () => {
          for (const op of ops) {
            if (op.type === "set") setDoc(op.ref.path, op.data, op.opts);
            else store.delete(op.ref.path);
          }
        },
      };
    },
    runTransaction: async (callback) => callback({
      get: async (ref) => snapshotFor(ref.path),
      set: (ref, data, opts) => setDoc(ref.path, data, opts),
    }),
  };
}

test("service.js exports the two guard constants at the values fixed by this task", () => {
  assert.equal(MAX_JOB_RECURSION_DEPTH, 2);
  assert.equal(COALESCE_WINDOW_MS, 60 * 1000);
});

test("processDashboardJob converges to ready and releases its lock when no further revisions arrive", async () => {
  const ownerId = "테스트유저";
  const budgetUid = "budget-uid-1";
  const jobPath = `dashboardJobs/${ownerId}`;
  const tomatoDb = createFakeFirestore();
  const budgetDb = createFakeFirestore({
    [jobPath]: { ownerId, budgetUid, requestedRevision: 1, reason: "test", requestedAtEpochMs: NOW },
  });
  const messaging = { sendEachForMulticast: async () => ({ successCount: 0, responses: [] }) };

  const result = await processDashboardJob({ tomatoDb, budgetDb, messaging, ownerId, nowEpochMs: NOW });

  assert.equal(result.state, "ready");
  assert.equal(result.processedRevision, 1);
  assert.equal(result.snapshotRevision, 1);
  const jobDoc = budgetDb.store.get(jobPath);
  assert.equal(jobDoc.lockId, undefined, "the lock must be released on the ready path");
  assert.equal(jobDoc.processedRevision, 1);
  assert.ok(jobDoc.processedAtEpochMs > 0, "processedAtEpochMs must be stamped for F2's coalescing check to read");
  const snapshotDoc = budgetDb.store.get(`users/${budgetUid}/dashboard/latest`);
  assert.equal(snapshotDoc.revision, 1);
});

test("processDashboardJob defers an unbounded backlog past MAX_JOB_RECURSION_DEPTH instead of recursing forever", async () => {
  const ownerId = "테스트유저";
  const budgetUid = "budget-uid-2";
  const jobPath = `dashboardJobs/${ownerId}`;
  const tomatoDb = createFakeFirestore();
  let jobReads = 0;
  // Simulate a relentless stream of concurrent writes: every single read of
  // the job doc (inside claimJob, the per-pass loop, and the post-release
  // pending check) observes one more requested revision than the last read,
  // so the job can never fully "catch up" within one processDashboardJob
  // call. Without a recursion cap this would recurse indefinitely.
  const budgetDb = createFakeFirestore(
    { [jobPath]: { ownerId, budgetUid, requestedRevision: 1, reason: "test", requestedAtEpochMs: NOW } },
    {
      onGet: (docPath, store) => {
        if (docPath !== jobPath) return;
        jobReads += 1;
        const current = store.get(docPath) || {};
        store.set(docPath, { ...current, requestedRevision: Number(current.requestedRevision || 0) + 1 });
      },
    },
  );
  const messaging = { sendEachForMulticast: async () => ({ successCount: 0, responses: [] }) };

  const result = await processDashboardJob({ tomatoDb, budgetDb, messaging, ownerId, nowEpochMs: NOW });

  assert.equal(result.state, "deferred");
  assert.ok(result.pendingRevision > result.processedRevision, "the leftover backlog must still be visible on the result");
  const jobDoc = budgetDb.store.get(jobPath);
  assert.equal(jobDoc.lockId, undefined, "hitting the depth cap must still release the lock so the next call can claim it");
  assert.ok(jobReads < 200, `job doc reads should stay bounded by the depth cap, saw ${jobReads}`);
});

test("shouldCoalesceDashboardRefresh batches requests inside the window and lets sparser ones through", () => {
  assert.equal(shouldCoalesceDashboardRefresh(0, NOW), false, "a job with no completed rebuild yet must never coalesce");
  assert.equal(shouldCoalesceDashboardRefresh(undefined, NOW), false);
  assert.equal(shouldCoalesceDashboardRefresh(NOW - 1000, NOW), true, "1s after the last rebuild is inside the window");
  assert.equal(
    shouldCoalesceDashboardRefresh(NOW - (COALESCE_WINDOW_MS - 1), NOW),
    true,
    "just inside the window boundary must still coalesce",
  );
  assert.equal(
    shouldCoalesceDashboardRefresh(NOW - COALESCE_WINDOW_MS, NOW),
    false,
    "exactly at the window boundary counts as elapsed",
  );
  assert.equal(
    shouldCoalesceDashboardRefresh(NOW - (COALESCE_WINDOW_MS + 1), NOW),
    false,
    "a rebuild older than the window must not coalesce",
  );
});

test("queueDashboardRefresh is wired to skip processDashboardJob only via shouldCoalesceDashboardRefresh", () => {
  const source = fs.readFileSync(path.join(__dirname, "../dashboard/service.js"), "utf8");
  assert.match(
    source,
    /coalesced = shouldCoalesceDashboardRefresh\(current\.processedAtEpochMs, nowEpochMs\)/,
    "the coalescing decision must read the job doc's existing processedAtEpochMs field",
  );
  const coalescedBranch = source.slice(source.indexOf("if (coalesced) {"), source.indexOf('return processDashboardJob({ tomatoDb, budgetDb, messaging, ownerId, nowEpochMs });'));
  assert.match(coalescedBranch, /state: "coalesced"/);
  assert.doesNotMatch(coalescedBranch, /processDashboardJob\(/, "a coalesced request must return before the expensive rebuild path runs");
  assert.doesNotMatch(coalescedBranch, /setTimeout|sleep\(/i, "coalescing must not wait out the window inside the function instance");
});
