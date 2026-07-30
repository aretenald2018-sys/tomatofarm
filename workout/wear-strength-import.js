// ================================================================
// workout/wear-strength-import.js — 워치(헬스) 완료 세션 임포트
//   워치→폰 근력 운동 페이로드(Phase 0 계약)를 정규화하고, 오늘 기록의
//   헬스장 세션(0–1번)에 병합하는 순수 플랜 빌더 + 저장 오케스트레이터.
//   workout/running-record-import.js 의 구조를 미러링한다.
// ================================================================
import { showToast } from '../ui/toast.js';
import { assertWearWorkoutPayloadEnvelope } from './wear-payload-contract.js';
import {
  emptyWorkoutSession,
  getWorkoutSessions,
  hasWorkoutGymCardData,
  upsertWorkoutSession,
} from './sessions.js';
import { WORKOUT_GYM_SESSION_COUNT } from './session-policy.js';
import { normalizeWorkoutSetType } from './set-presentation.js';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ENTRIES = 30;
const MAX_SETS_PER_ENTRY = 50;

export class WearStrengthImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WearStrengthImportError';
  }
}

function _finiteOrThrow(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new WearStrengthImportError(`${label} must be a finite number`);
  return n;
}

function _clampRoundToStep(value, min, max, step) {
  const clamped = Math.max(min, Math.min(max, value));
  return Math.round(clamped / step) * step;
}

function _boundedIntOrNull(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const int = Math.round(n);
  return int >= min && int <= max ? int : null;
}

function _nonNegativeIntOrFallback(value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 0) return n;
  return fallback;
}

function _text(value, maxLength = 160) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function _normalizeWearStrengthSet(raw, context, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new WearStrengthImportError(`Invalid wear strength set at index ${index}: set must be an object`);
  }
  const kgRaw = _finiteOrThrow(raw.kg, `set[${index}].kg`);
  const kg = _clampRoundToStep(kgRaw, 0, 1000, 0.5);
  const repsRaw = _finiteOrThrow(raw.reps, `set[${index}].reps`);
  const reps = Math.max(1, Math.min(200, Math.round(repsRaw)));
  const romPctRaw = Number(raw.romPct);
  const romPct = Number.isFinite(romPctRaw) ? _clampRoundToStep(romPctRaw, 10, 100, 5) : 100;
  const rirRaw = Number(raw.rir);
  const rir = Number.isFinite(rirRaw) ? Math.max(0, Math.min(10, Math.round(rirRaw))) : null;
  const setType = normalizeWorkoutSetType(raw.setType);
  const completedAtRaw = Number(raw.completedAt);
  const completedAt = Number.isFinite(completedAtRaw)
    && completedAtRaw >= context.startedAt
    && completedAtRaw <= context.endedAt
    ? Math.floor(completedAtRaw)
    : null;
  const normalized = { kg, reps, rpe: null, romPct, setType, done: true, completedAt };
  if (rir != null) normalized.rir = rir;
  return normalized;
}

function _normalizeWearStrengthEntry(raw, context, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new WearStrengthImportError(`Invalid wear strength entry at index ${index}: entry must be an object`);
  }
  const exerciseId = _text(raw.exerciseId, 120);
  if (!exerciseId) {
    throw new WearStrengthImportError(`Invalid wear strength entry at index ${index}: exerciseId is required`);
  }
  const rawSets = Array.isArray(raw.sets) ? raw.sets : [];
  if (!rawSets.length || rawSets.length > MAX_SETS_PER_ENTRY) {
    throw new WearStrengthImportError(`Wear strength entry at index ${index} must have between 1 and ${MAX_SETS_PER_ENTRY} sets`);
  }
  const sets = rawSets.map((set, setIndex) => _normalizeWearStrengthSet(set, context, setIndex));
  return {
    muscleId: _text(raw.muscleId, 60) || null,
    exerciseId,
    name: _text(raw.name, 120),
    movementId: _text(raw.movementId, 60) || null,
    sets,
    wearImport: {
      fingerprint: context.fingerprint,
      importedAt: context.now,
    },
  };
}

export function normalizeWearStrengthPayload(raw, options = {}) {
  const now = Number(options.now) || Date.now();
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const envelope = assertWearWorkoutPayloadEnvelope(payload);
  if (payload.type !== 'strength') {
    throw new WearStrengthImportError('unsupported wear strength payload type');
  }

  const dateKey = String(payload.dateKey || '');
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new WearStrengthImportError('wear strength dateKey must use yyyy-MM-dd');
  }

  const startedAt = _finiteOrThrow(payload.startedAt, 'startedAt');
  const endedAt = _finiteOrThrow(payload.endedAt, 'endedAt');
  if (!(startedAt < endedAt)) {
    throw new WearStrengthImportError('wear strength endedAt must be after startedAt');
  }

  const durationSec = _nonNegativeIntOrFallback(payload.durationSec, Math.round((endedAt - startedAt) / 1000));
  const avgHeartRateBpm = _boundedIntOrNull(payload.avgHeartRateBpm, 30, 240);
  const maxHeartRateBpm = _boundedIntOrNull(payload.maxHeartRateBpm, 30, 240);

  const fingerprint = `${startedAt}-${endedAt}`;
  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!rawEntries.length || rawEntries.length > MAX_ENTRIES) {
    throw new WearStrengthImportError(`wear strength entries must have between 1 and ${MAX_ENTRIES} items`);
  }
  const context = { startedAt, endedAt, fingerprint, now };
  const entries = rawEntries.map((entry, index) => _normalizeWearStrengthEntry(entry, context, index));

  return {
    payloadVersion: envelope.payloadVersion,
    type: 'strength',
    source: 'wear',
    dateKey,
    startedAt,
    endedAt,
    durationSec,
    avgHeartRateBpm,
    maxHeartRateBpm,
    entries,
    fingerprint,
  };
}

function _replaceFingerprintedEntries(session, entries, fingerprint) {
  return [
    ...(session.exercises || []).filter(entry => entry?.wearImport?.fingerprint !== fingerprint),
    ...entries,
  ];
}

function _mergeIntoBaseSession(session, entries) {
  const nextExercises = (session.exercises || []).map(entry => ({
    ...entry,
    sets: Array.isArray(entry.sets) ? [...entry.sets] : entry.sets,
  }));
  for (const entry of entries) {
    const existingIndex = nextExercises.findIndex(existing => existing?.exerciseId === entry.exerciseId);
    if (existingIndex !== -1) {
      const existing = nextExercises[existingIndex];
      nextExercises[existingIndex] = {
        ...existing,
        sets: [...(Array.isArray(existing.sets) ? existing.sets : []), ...entry.sets],
      };
    } else {
      nextExercises.push(entry);
    }
  }
  return nextExercises;
}

// PURE: 오늘 day 객체 + 정규화된 워치 페이로드 → 저장할 payload/sessionIndex 플랜.
// 타게팅: ① 동일 fingerprint 보유 헬스장 세션(멱등 재전송) ② 카드 데이터 없는 빈 헬스장 세션
//        ③ 세션 0 병합(동일 exerciseId 엔트리엔 세트 append, 아니면 엔트리 추가).
export function planWearStrengthSave(day = {}, normalized = {}, options = {}) {
  const now = Number(options.now) || Date.now();
  const sessions = getWorkoutSessions(day, { minCount: WORKOUT_GYM_SESSION_COUNT });
  const gymRange = sessions.slice(0, WORKOUT_GYM_SESSION_COUNT);
  const entries = Array.isArray(normalized.entries) ? normalized.entries : [];
  const fingerprint = normalized.fingerprint;

  let sessionIndex = gymRange.findIndex(session => (
    (session.exercises || []).some(entry => entry?.wearImport?.fingerprint === fingerprint)
  ));

  let nextExercises;
  if (sessionIndex !== -1) {
    nextExercises = _replaceFingerprintedEntries(gymRange[sessionIndex], entries, fingerprint);
  } else {
    sessionIndex = gymRange.findIndex(session => !hasWorkoutGymCardData(session));
    if (sessionIndex !== -1) {
      nextExercises = [...entries];
    } else {
      sessionIndex = 0;
      nextExercises = _mergeIntoBaseSession(gymRange[0] || emptyWorkoutSession(0), entries);
    }
  }

  const targetSession = sessions[sessionIndex] || emptyWorkoutSession(sessionIndex);
  const sessionPayload = { ...targetSession, exercises: nextExercises };

  // day-level workoutDuration 은 이미 값이 있으면 덮어쓰지 않는다(사용자 수동 기록 보호).
  const dayDurationUnset = !(Number(day.workoutDuration) > 0);
  if (dayDurationUnset) {
    sessionPayload.workoutDuration = normalized.durationSec;
  }

  const result = upsertWorkoutSession(day, sessionPayload, sessionIndex, { now });

  const hrSummary = {
    durationSec: normalized.durationSec,
    avgHeartRateBpm: normalized.avgHeartRateBpm ?? null,
    maxHeartRateBpm: normalized.maxHeartRateBpm ?? null,
    hrSource: 'wear',
  };
  const baseTimeline = result.aggregate.workoutTimeline && typeof result.aggregate.workoutTimeline === 'object'
    ? result.aggregate.workoutTimeline
    : {};
  const workoutTimeline = { ...baseTimeline, wearStrength: hrSummary };

  // 워치 근력 배달은 항상 완료된(done:true) 세트를 동반하므로 라이프존 상태는 항상 활성.
  // (workout/save.js _attachLifeZoneWorkoutSnapshot 의 헬스장 경로 리터럴을 복제)
  const snapshot = { state: 'workout', updatedAt: now };

  const payload = {
    ...result.aggregate,
    workoutSessions: result.workoutSessions,
    workoutTimeline,
    lifeZoneWorkoutActivity: snapshot,
    lifeZoneLastActivity: snapshot,
  };

  return { sessionIndex, payload };
}

export async function saveWearStrengthPayload(raw, options = {}) {
  const normalized = normalizeWearStrengthPayload(raw, options);
  const { getCache, saveDay } = await import('../data.js');
  const cache = getCache() || {};
  const day = cache[normalized.dateKey] && typeof cache[normalized.dateKey] === 'object'
    ? cache[normalized.dateKey]
    : {};
  const plan = planWearStrengthSave(day, normalized, options);
  await saveDay(normalized.dateKey, plan.payload, { mode: 'merge', rethrow: true });
  if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
    document.dispatchEvent(new CustomEvent('sheet:saved', { detail: { source: 'wear-strength', dateKey: normalized.dateKey } }));
  }
  if (typeof window !== 'undefined') showToast('워치 근력 운동 기록을 저장했어요', 2200, 'success');
  return { ok: true, sessionIndex: plan.sessionIndex, dateKey: normalized.dateKey };
}
