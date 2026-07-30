import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_WEAR_WORKOUT_PAYLOAD_VERSION,
  WEAR_STRENGTH_CONTEXT_PAYLOAD_VERSION,
  WEAR_WORKOUT_PAYLOAD_VERSION,
  WEAR_WORKOUT_TYPES,
  assertWearStrengthContextEnvelope,
  assertWearWorkoutPayloadEnvelope,
} from '../workout/wear-payload-contract.js';

test('WEAR_WORKOUT_TYPES lists both supported wear workout types', () => {
  assert.deepEqual(WEAR_WORKOUT_TYPES, ['running', 'strength']);
});

test('running envelope acceptance is unchanged', () => {
  assert.deepEqual(assertWearWorkoutPayloadEnvelope({ type: 'running' }), {
    payloadVersion: LEGACY_WEAR_WORKOUT_PAYLOAD_VERSION,
    type: 'running',
  });
  assert.deepEqual(assertWearWorkoutPayloadEnvelope({ payloadVersion: 1, type: 'running' }), {
    payloadVersion: 1,
    type: 'running',
  });
  assert.throws(
    () => assertWearWorkoutPayloadEnvelope({ payloadVersion: 2, type: 'running' }),
    /unsupported wear payloadVersion/,
  );
});

test('strength envelope is accepted the same way running is', () => {
  assert.deepEqual(assertWearWorkoutPayloadEnvelope({ type: 'strength' }), {
    payloadVersion: LEGACY_WEAR_WORKOUT_PAYLOAD_VERSION,
    type: 'strength',
  });
  assert.deepEqual(assertWearWorkoutPayloadEnvelope({ payloadVersion: 1, type: 'strength' }), {
    payloadVersion: 1,
    type: 'strength',
  });
  assert.throws(
    () => assertWearWorkoutPayloadEnvelope({ payloadVersion: 2, type: 'strength' }),
    /unsupported wear payloadVersion/,
  );
});

test('envelope rejects unknown workout types and non-object payloads', () => {
  assert.throws(() => assertWearWorkoutPayloadEnvelope({ type: 'cycling' }), /unsupported wear workout type/);
  assert.throws(() => assertWearWorkoutPayloadEnvelope(null), /wear payload must be an object/);
  assert.throws(() => assertWearWorkoutPayloadEnvelope([]), /wear payload must be an object/);
  assert.throws(() => assertWearWorkoutPayloadEnvelope('running'), /wear payload must be an object/);
});

test('strength-context envelope accept/reject matrix', () => {
  assert.equal(WEAR_STRENGTH_CONTEXT_PAYLOAD_VERSION, 1);
  assert.deepEqual(assertWearStrengthContextEnvelope({ type: 'strength-context' }), {
    payloadVersion: WEAR_STRENGTH_CONTEXT_PAYLOAD_VERSION,
    type: 'strength-context',
  });
  assert.deepEqual(assertWearStrengthContextEnvelope({ payloadVersion: 1, type: 'strength-context' }), {
    payloadVersion: 1,
    type: 'strength-context',
  });
  assert.throws(
    () => assertWearStrengthContextEnvelope({ payloadVersion: 2, type: 'strength-context' }),
    /unsupported wear strength-context payloadVersion/,
  );
  assert.throws(
    () => assertWearStrengthContextEnvelope({ type: 'strength' }),
    /unsupported wear strength-context type/,
  );
  assert.throws(() => assertWearStrengthContextEnvelope(null), /wear strength-context payload must be an object/);
  assert.throws(() => assertWearStrengthContextEnvelope([]), /wear strength-context payload must be an object/);
});
