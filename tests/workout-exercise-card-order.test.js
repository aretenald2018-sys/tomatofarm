import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveWorkoutExerciseCard,
  remapWorkoutExercisePositionKey,
  remapWorkoutRestOrigin,
  remapWorkoutRestRecords,
} from '../workout/exercise-card-order.js';
import { getWorkoutSessions, upsertWorkoutSession } from '../workout/sessions.js';
import { buildWorkoutSetTimeline } from '../workout/timeline.js';
import { enqueuePendingDayWrite, listPendingDayWrites, mergePendingDayWritesIntoCache, acknowledgePendingDayWrites } from '../data/pending-day-writes.js';

const key = '2026-10-03';
const entry = (name, extra = {}) => ({
  exerciseId: name,
  name,
  note: `note-${name}`,
  sets: [
    { kg: 50, reps: 5, done: true, completedAt: 1000, restStartedAt: '2026-10-03T00:00:00Z', rir: 2, romPct: 90, custom: 'preserve' },
    { kg: 40, reps: 8, done: false, wendlerRole: 'backoff', wendlerOrder: 6 },
  ],
  exerciseCompletedAt: 2000,
  recommendationMeta: { track: 'H', custom: 'preserve' },
  ...extra,
});

test('card moves insert whole exercises while preserving set order and metadata', () => {
  const exercises = [entry('A'), entry('B'), entry('C')];
  const before = structuredClone(exercises);
  const moved = moveWorkoutExerciseCard(exercises, [[0], [1], [2]], 0, 1);
  assert.deepEqual(moved.exercises.map(item => item.name), ['B', 'A', 'C']);
  assert.deepEqual(moved.entryIndexMap, [1, 0, 2]);
  assert.equal(moved.exercises[1], exercises[0]);
  assert.equal(moved.exercises[1].sets, exercises[0].sets);
  assert.deepEqual(exercises, before, 'input and set metadata must not mutate');
  assert.deepEqual(buildWorkoutSetTimeline(moved.exercises), buildWorkoutSetTimeline(exercises));
  const reversed = moveWorkoutExerciseCard(moved.exercises, [[0], [1], [2]], 1, -1);
  assert.deepEqual(reversed.exercises, before);
});

test('non-adjacent superset members move as one card without splitting their set arrays', () => {
  const exercises = [entry('A', { supersetGroup: 'ss' }), entry('B'), entry('A2', { supersetGroup: 'ss' }), entry('C')];
  const moved = moveWorkoutExerciseCard(exercises, [[0, 2], [1], [3]], 2, 1);
  assert.deepEqual(moved.exercises.map(item => item.name), ['B', 'A', 'A2', 'C']);
  assert.deepEqual(moved.entryIndexMap, [1, 0, 2, 3]);
  assert.equal(moved.targetCardIndex, 1);
  assert.equal(moved.exercises[1].sets, exercises[0].sets);
  assert.equal(moved.exercises[2].sets, exercises[2].sets);
});

test('hidden entries retain their slots and duplicate exercise IDs do not merge', () => {
  const hidden = { opaque: { preserve: true } };
  const exercises = [entry('duplicate'), hidden, entry('duplicate', { note: 'second instance' }), entry('cardio', { cardio: { source: 'manual-cardio' } })];
  const moved = moveWorkoutExerciseCard(exercises, [[0], [2], [3]], 2, -1);
  assert.equal(moved.exercises[0], exercises[2]);
  assert.equal(moved.exercises[1], hidden);
  assert.equal(moved.exercises[2], exercises[0]);
  assert.deepEqual(moved.entryIndexMap, [2, 1, 0, 3]);
  assert.deepEqual(moved.rowIndexMap, [1, 0, 2]);
});

test('invalid or boundary moves fail without mutating records', () => {
  const exercises = [entry('A'), entry('B')];
  const before = structuredClone(exercises);
  for (const [groups, index, direction] of [
    [[[0], [1]], 0, -1], [[[0], [1]], 1, 1], [[[0], [1]], 0, 0],
    [[[0], [1]], 0, 2], [[[0], [1]], -1, 1], [[[0], [1]], 0.5, 1],
    [[[0], [0]], 0, 1], [[[0], [2]], 0, 1], [[[0], []], 0, 1],
  ]) assert.equal(moveWorkoutExerciseCard(exercises, groups, index, direction).changed, false);
  assert.deepEqual(exercises, before);
});

test('rest origin and UI keys follow moved instances and keep unrelated sessions unchanged', () => {
  const map = [2, 1, 0, 3];
  const rowMap = [1, 0, 2];
  const origin = { entryIdx: 0, setIdx: 1, setNumber: 2, exerciseId: 'duplicate', exerciseName: 'A' };
  assert.deepEqual(remapWorkoutRestOrigin(origin, map), { ...origin, entryIdx: 2 });
  assert.equal(origin.entryIdx, 0);
  const remap = value => remapWorkoutExercisePositionKey(value, key, 0, map, rowMap);
  assert.equal(remap(`${key}:0:0:1:kg`), `${key}:0:2:1:kg`);
  assert.equal(remap(`${key}:0:2`), `${key}:0:0`);
  assert.equal(remap(`ex:${key}:0:0`), `ex:${key}:0:1`);
  assert.equal(remap(`ss:${key}:0:ss`), `ss:${key}:0:ss`);
  assert.equal(remap(`act:${key}:0:0`), `act:${key}:0:0`);
  assert.equal(remap(`${key}:1:0:1:kg`), `${key}:1:0:1:kg`);
  assert.equal(remap('2026-10-02:0:0:1:kg'), '2026-10-02:0:0:1:kg');
  assert.equal(remap(null), null);
});

test('session round-trip preserves reorder, other sessions, routes, and nested metadata', () => {
  const day = { breakfast: 'untouched', workoutSessions: [
    { id: 'gym', exercises: [entry('A'), entry('B')], workoutPhoto: 'photo', maxMeta: { preserve: true }, workoutTimeline: { mode: 'set-completion' } },
    { id: 'running', exercises: [], running: true, runRouteRef: { routeId: 'synthetic' }, runMemo: 'preserve' },
  ] };
  const session = getWorkoutSessions(day)[0];
  const moved = moveWorkoutExerciseCard(session.exercises, [[0], [1]], 1, -1);
  const result = upsertWorkoutSession(day, { ...session, exercises: moved.exercises }, 0);
  const reloaded = getWorkoutSessions({ ...day, ...result.aggregate, workoutSessions: result.workoutSessions });
  assert.deepEqual(reloaded[0].exercises, moved.exercises);
  assert.equal(reloaded[0].workoutPhoto, 'photo');
  assert.deepEqual(reloaded[0].maxMeta, { preserve: true });
  assert.deepEqual(reloaded[1], getWorkoutSessions(day)[1]);
  assert.deepEqual(result.aggregate.exercises.map(item => item.name), ['B', 'A']);
});

test('legacy rest summary follows uniquely matched rest metadata, preserving all other fields', () => {
  const exercises = [entry('B'), entry('A')];
  const record = { exerciseId: 'A', entryIdx: 0, setIdx: 0, setNumber: 1, startedAt: exercises[1].sets[0].restStartedAt, elapsedSec: 45, custom: 'preserve' };
  const unmatched = { ...record, exerciseId: 'other-session' };
  const records = remapWorkoutRestRecords([record, unmatched], exercises);
  assert.deepEqual(records[0], { ...record, entryIdx: 1 });
  assert.equal(records[1], unmatched);
  assert.equal(remapWorkoutRestRecords(90, exercises), 90, 'legacy numeric form remains unchanged');
  assert.equal(remapWorkoutRestRecords([record], [entry('A'), entry('A')])[0], record, 'ambiguous duplicate must not be reassigned');
});

test('offline pending snapshots retain the newest card order across reload and an older acknowledgment', () => {
  const values = new Map();
  const storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const exercises = [entry('A'), entry('B'), entry('C')];
  const first = moveWorkoutExerciseCard(exercises, [[0], [1], [2]], 0, 1);
  const second = moveWorkoutExerciseCard(first.exercises, [[0], [1], [2]], 1, 1);
  const old = enqueuePendingDayWrite(storage, { ownerId: 'synthetic-owner', dateKey: key, payload: { exercises: first.exercises, workoutSessions: [{ id: 'gym', exercises: first.exercises }] }, now: 1, writeId: 'first' });
  enqueuePendingDayWrite(storage, { ownerId: 'synthetic-owner', dateKey: key, payload: { exercises: second.exercises, workoutSessions: [{ id: 'gym', exercises: second.exercises }] }, now: 2, writeId: 'second' });
  acknowledgePendingDayWrites(storage, [old]);
  const pending = listPendingDayWrites(storage, { ownerId: 'synthetic-owner' });
  const cache = mergePendingDayWritesIntoCache({ [key]: { breakfast: 'keep', exercises } }, pending);
  assert.equal(pending.length, 1);
  assert.deepEqual(getWorkoutSessions(cache[key])[0].exercises, second.exercises);
  assert.deepEqual(cache[key].exercises.map(item => item.name), ['B', 'C', 'A']);
  assert.equal(cache[key].breakfast, 'keep');
  assert.deepEqual(listPendingDayWrites(storage, { ownerId: 'different-owner' }), []);
});
