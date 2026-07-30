export const WEAR_WORKOUT_PAYLOAD_VERSION = 1;
export const LEGACY_WEAR_WORKOUT_PAYLOAD_VERSION = 0;
export const WEAR_WORKOUT_TYPES = ['running', 'strength'];
export const WEAR_STRENGTH_CONTEXT_PAYLOAD_VERSION = 1;

export function readWearWorkoutPayloadVersion(payload = {}) {
  const raw = payload.payloadVersion;
  if (raw == null || raw === '') return LEGACY_WEAR_WORKOUT_PAYLOAD_VERSION;
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('wear payloadVersion must be a non-negative integer');
  if (version > WEAR_WORKOUT_PAYLOAD_VERSION) {
    throw new Error(`unsupported wear payloadVersion: ${version}`);
  }
  return version;
}

export function assertWearWorkoutPayloadEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('wear payload must be an object');
  const payloadVersion = readWearWorkoutPayloadVersion(payload);
  if (!WEAR_WORKOUT_TYPES.includes(payload.type)) throw new Error('unsupported wear workout type');
  return { payloadVersion, type: payload.type };
}

function _readWearStrengthContextPayloadVersion(payload = {}) {
  const raw = payload.payloadVersion;
  if (raw == null || raw === '') return WEAR_STRENGTH_CONTEXT_PAYLOAD_VERSION;
  const version = Number(raw);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('wear strength-context payloadVersion must be a non-negative integer');
  if (version > WEAR_STRENGTH_CONTEXT_PAYLOAD_VERSION) {
    throw new Error(`unsupported wear strength-context payloadVersion: ${version}`);
  }
  return version;
}

export function assertWearStrengthContextEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('wear strength-context payload must be an object');
  const payloadVersion = _readWearStrengthContextPayloadVersion(payload);
  if (payload.type !== 'strength-context') throw new Error('unsupported wear strength-context type');
  return { payloadVersion, type: payload.type };
}
