import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeWearStrengthPayload,
  planWearStrengthSave,
} from '../workout/wear-strength-import.js';
import { WORKOUT_PAYLOAD_KEYS } from '../workout/save-schema.js';

const STARTED_AT = 1_783_400_000_000;
const ENDED_AT = STARTED_AT + 40 * 60 * 1000; // 40 minutes

function benchSet(overrides = {}) {
  return {
    kg: 82.3,
    reps: 8.6,
    romPct: 97,
    setType: 'main',
    completedAt: STARTED_AT + 60_000,
    ...overrides,
  };
}

function basePayload(overrides = {}) {
  return {
    payloadVersion: 1,
    type: 'strength',
    source: 'wear',
    dateKey: '2026-07-30',
    startedAt: STARTED_AT,
    endedAt: ENDED_AT,
    durationSec: 2400,
    avgHeartRateBpm: 128,
    maxHeartRateBpm: 150,
    entries: [
      {
        exerciseId: 'chest_1',
        name: '바벨 벤치프레스',
        muscleId: 'chest',
        movementId: 'barbell_bench',
        sets: [
          benchSet(),
          { kg: 60, reps: 10, setType: 'warmup' },
        ],
      },
    ],
    ...overrides,
  };
}

function assertPayloadKeysSubset(payload) {
  for (const key of Object.keys(payload)) {
    assert.ok(WORKOUT_PAYLOAD_KEYS.includes(key), `unexpected payload key: ${key}`);
  }
}

// ── normalizeWearStrengthPayload ────────────────────────────────

test('normalizes kg (round to 0.5), reps (int), romPct (round to 5), and defaults', () => {
  const normalized = normalizeWearStrengthPayload(basePayload(), { now: 1_800_000_000_000 });
  const [first, second] = normalized.entries[0].sets;

  assert.equal(first.kg, 82.5); // 82.3 -> nearest 0.5
  assert.equal(first.reps, 9); // 8.6 -> round
  assert.equal(first.romPct, 95); // 97 -> nearest 5
  assert.equal(first.setType, 'main');
  assert.equal(first.rpe, null);
  assert.equal(first.done, true);
  assert.equal(first.completedAt, STARTED_AT + 60_000);

  assert.equal(second.kg, 60);
  assert.equal(second.reps, 10);
  assert.equal(second.romPct, 100, 'romPct defaults to 100 when missing');
  assert.equal(second.setType, 'warmup');
  assert.equal(second.completedAt, null, 'completedAt defaults to null when missing');
});

test('kg clamps to [0, 1000] and reps clamps to [1, 200]', () => {
  const normalized = normalizeWearStrengthPayload(basePayload({
    entries: [{
      exerciseId: 'chest_1',
      sets: [{ kg: 5000, reps: 999 }, { kg: -50, reps: 0.2 }],
    }],
  }));
  const [overweight, underweight] = normalized.entries[0].sets;
  assert.equal(overweight.kg, 1000);
  assert.equal(overweight.reps, 200);
  assert.equal(underweight.kg, 0);
  assert.equal(underweight.reps, 1);
});

test('setType normalizes to the shared vocabulary, defaulting to main', () => {
  const normalized = normalizeWearStrengthPayload(basePayload({
    entries: [{
      exerciseId: 'chest_1',
      sets: [
        { kg: 80, reps: 8, setType: 'drop' },
        { kg: 80, reps: 8, setType: 'failure' },
        { kg: 80, reps: 8, setType: 'not-a-real-type' },
        { kg: 80, reps: 8 },
      ],
    }],
  }));
  const types = normalized.entries[0].sets.map(set => set.setType);
  assert.deepEqual(types, ['drop', 'failure', 'main', 'main']);
});

test('completedAt outside [startedAt, endedAt] becomes null', () => {
  const normalized = normalizeWearStrengthPayload(basePayload({
    entries: [{
      exerciseId: 'chest_1',
      sets: [
        { kg: 80, reps: 8, completedAt: STARTED_AT - 1 },
        { kg: 80, reps: 8, completedAt: ENDED_AT + 1 },
        { kg: 80, reps: 8, completedAt: STARTED_AT },
      ],
    }],
  }));
  const completedAts = normalized.entries[0].sets.map(set => set.completedAt);
  assert.deepEqual(completedAts, [null, null, STARTED_AT]);
});

test('HR bounds: 30-240 int else null', () => {
  const inBounds = normalizeWearStrengthPayload(basePayload({ avgHeartRateBpm: 140, maxHeartRateBpm: 180 }));
  assert.equal(inBounds.avgHeartRateBpm, 140);
  assert.equal(inBounds.maxHeartRateBpm, 180);

  const outOfBounds = normalizeWearStrengthPayload(basePayload({ avgHeartRateBpm: 10, maxHeartRateBpm: 300 }));
  assert.equal(outOfBounds.avgHeartRateBpm, null);
  assert.equal(outOfBounds.maxHeartRateBpm, null);

  const missing = normalizeWearStrengthPayload(basePayload({ avgHeartRateBpm: undefined, maxHeartRateBpm: undefined }));
  assert.equal(missing.avgHeartRateBpm, null);
  assert.equal(missing.maxHeartRateBpm, null);
});

test('durationSec falls back to derived value from startedAt/endedAt when missing or invalid', () => {
  const missing = normalizeWearStrengthPayload(basePayload({ durationSec: undefined }));
  assert.equal(missing.durationSec, Math.round((ENDED_AT - STARTED_AT) / 1000));

  const negative = normalizeWearStrengthPayload(basePayload({ durationSec: -5 }));
  assert.equal(negative.durationSec, Math.round((ENDED_AT - STARTED_AT) / 1000));

  const explicit = normalizeWearStrengthPayload(basePayload({ durationSec: 999 }));
  assert.equal(explicit.durationSec, 999);
});

test('entry carries wearImport fingerprint and importedAt', () => {
  const normalized = normalizeWearStrengthPayload(basePayload(), { now: 1_800_000_000_000 });
  assert.equal(normalized.fingerprint, `${STARTED_AT}-${ENDED_AT}`);
  assert.deepEqual(normalized.entries[0].wearImport, {
    fingerprint: `${STARTED_AT}-${ENDED_AT}`,
    importedAt: 1_800_000_000_000,
  });
});

test('entries cap at 30 and sets cap at 50 per entry', () => {
  const tooManyEntries = basePayload({
    entries: Array.from({ length: 31 }, (_, index) => ({
      exerciseId: `ex_${index}`,
      sets: [{ kg: 80, reps: 8 }],
    })),
  });
  assert.throws(() => normalizeWearStrengthPayload(tooManyEntries), /entries must have between 1 and 30/);

  const tooManySets = basePayload({
    entries: [{
      exerciseId: 'chest_1',
      sets: Array.from({ length: 51 }, () => ({ kg: 80, reps: 8 })),
    }],
  });
  assert.throws(() => normalizeWearStrengthPayload(tooManySets), /between 1 and 50 sets/);

  const zeroEntries = basePayload({ entries: [] });
  assert.throws(() => normalizeWearStrengthPayload(zeroEntries), /entries must have between 1 and 30/);

  const zeroSets = basePayload({ entries: [{ exerciseId: 'chest_1', sets: [] }] });
  assert.throws(() => normalizeWearStrengthPayload(zeroSets), /between 1 and 50 sets/);
});

test('rejects bad payloads with descriptive errors', () => {
  assert.throws(() => normalizeWearStrengthPayload(basePayload({ type: 'running' })), /unsupported wear strength payload type/);
  assert.throws(() => normalizeWearStrengthPayload(basePayload({ dateKey: 'not-a-date' })), /dateKey must use yyyy-MM-dd/);
  assert.throws(() => normalizeWearStrengthPayload(basePayload({ startedAt: 'nope' })), /startedAt must be a finite number/);
  assert.throws(() => normalizeWearStrengthPayload(basePayload({ startedAt: ENDED_AT, endedAt: STARTED_AT })), /endedAt must be after startedAt/);
  assert.throws(
    () => normalizeWearStrengthPayload(basePayload({ entries: [{ sets: [{ kg: 80, reps: 8 }] }] })),
    /exerciseId is required/,
  );
  assert.throws(
    () => normalizeWearStrengthPayload(basePayload({ entries: [{ exerciseId: 'chest_1', sets: [{ reps: 8 }] }] })),
    /kg must be a finite number/,
  );
  assert.throws(() => normalizeWearStrengthPayload({ type: 'strength' }), /dateKey must use yyyy-MM-dd/);
});

// ── planWearStrengthSave (targeting rules) ──────────────────────

test('rule 2: places entries into the first empty-card gym session and fills unset duration', () => {
  const day = {};
  const normalized = normalizeWearStrengthPayload(basePayload());
  const { sessionIndex, payload } = planWearStrengthSave(day, normalized);

  assert.equal(sessionIndex, 0);
  assert.equal(payload.workoutSessions[0].exercises.length, 1);
  assert.equal(payload.workoutSessions[0].exercises[0].exerciseId, 'chest_1');
  assert.equal(payload.workoutDuration, normalized.durationSec);
  assert.equal(payload.workoutTimeline.wearStrength.hrSource, 'wear');
  assert.equal(payload.workoutTimeline.wearStrength.durationSec, normalized.durationSec);
  assert.equal(payload.workoutTimeline.wearStrength.avgHeartRateBpm, normalized.avgHeartRateBpm);
  assert.equal(payload.workoutTimeline.wearStrength.maxHeartRateBpm, normalized.maxHeartRateBpm);
  assert.equal(payload.lifeZoneWorkoutActivity.state, 'workout');
  assertPayloadKeysSubset(payload);
});

test('rule 1: redelivering the same fingerprint replaces wear entries without duplicating (idempotent)', () => {
  const normalized = normalizeWearStrengthPayload(basePayload());
  const day1 = {};
  const first = planWearStrengthSave(day1, normalized);
  assert.equal(first.payload.workoutSessions[0].exercises.length, 1);

  // Simulate the merge-mode Firestore save landing back in the local cache.
  const day2 = { ...day1, ...first.payload };
  const second = planWearStrengthSave(day2, normalized);

  assert.equal(second.sessionIndex, 0);
  assert.equal(second.payload.workoutSessions[0].exercises.length, 1, 'redelivery must not duplicate entries');
  assert.equal(second.payload.workoutSessions[0].exercises[0].exerciseId, 'chest_1');
  assertPayloadKeysSubset(second.payload);
});

test('rule 1: a later delivery with a different fingerprint updates in place without touching unrelated entries', () => {
  const normalized1 = normalizeWearStrengthPayload(basePayload());
  const day1 = {};
  const first = planWearStrengthSave(day1, normalized1);
  const day2 = { ...day1, ...first.payload };

  // Same session, but the set values changed on a second wear sync with the same fingerprint.
  const normalized2 = normalizeWearStrengthPayload(basePayload({
    entries: [{
      exerciseId: 'chest_1',
      muscleId: 'chest',
      movementId: 'barbell_bench',
      sets: [{ kg: 90, reps: 6 }],
    }],
  }));
  const second = planWearStrengthSave(day2, normalized2);
  assert.equal(second.sessionIndex, 0);
  assert.equal(second.payload.workoutSessions[0].exercises.length, 1);
  assert.equal(second.payload.workoutSessions[0].exercises[0].sets.length, 1);
  assert.equal(second.payload.workoutSessions[0].exercises[0].sets[0].kg, 90);
});

test('rule 3: merges into gym session 0, appending sets to an existing entry with the same exerciseId', () => {
  const day = {
    workoutSessions: [
      {
        id: 'session-1',
        label: '1회차',
        exercises: [{ exerciseId: 'chest_1', name: '바벨 벤치프레스', sets: [{ kg: 80, reps: 8, done: true }] }],
      },
      {
        id: 'session-2',
        label: '2회차',
        exercises: [{ exerciseId: 'lower_1', name: '스쿼트', sets: [{ kg: 100, reps: 5, done: true }] }],
      },
    ],
  };
  const normalized = normalizeWearStrengthPayload(basePayload());
  const { sessionIndex, payload } = planWearStrengthSave(day, normalized);

  assert.equal(sessionIndex, 0);
  const session0 = payload.workoutSessions[0];
  const benchEntry = session0.exercises.find(entry => entry.exerciseId === 'chest_1');
  assert.ok(benchEntry, 'existing bench entry should still be present');
  assert.equal(benchEntry.sets.length, 3, 'existing set + 2 wear sets appended');
  assert.equal(benchEntry.sets[0].kg, 80, 'pre-existing set is preserved first');

  const session1 = payload.workoutSessions[1];
  assert.equal(session1.exercises.length, 1);
  assert.equal(session1.exercises[0].exerciseId, 'lower_1');
  assertPayloadKeysSubset(payload);
});

test('rule 3: merges into gym session 0, appending a new entry when exerciseId does not match', () => {
  const day = {
    workoutSessions: [
      {
        id: 'session-1',
        label: '1회차',
        exercises: [{ exerciseId: 'back_1', name: '랫풀다운', sets: [{ kg: 60, reps: 10, done: true }] }],
      },
      {
        id: 'session-2',
        label: '2회차',
        exercises: [{ exerciseId: 'lower_1', name: '스쿼트', sets: [{ kg: 100, reps: 5, done: true }] }],
      },
    ],
  };
  const normalized = normalizeWearStrengthPayload(basePayload());
  const { sessionIndex, payload } = planWearStrengthSave(day, normalized);

  assert.equal(sessionIndex, 0);
  const session0 = payload.workoutSessions[0];
  assert.equal(session0.exercises.length, 2);
  assert.ok(session0.exercises.some(entry => entry.exerciseId === 'back_1'));
  assert.ok(session0.exercises.some(entry => entry.exerciseId === 'chest_1'));
});

test('workoutDuration is not overwritten once the day already has a nonzero duration', () => {
  const day = { workoutDuration: 500 };
  const normalized = normalizeWearStrengthPayload(basePayload());
  const { payload } = planWearStrengthSave(day, normalized);
  assert.equal(payload.workoutDuration, 500, 'existing nonzero duration must be preserved');
});
