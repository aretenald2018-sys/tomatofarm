import { buildWorkoutSetTimeline, MAX_WORKOUT_REST_GAP_SEC } from './timeline.js';

// ================================================================
// workout/completion-metrics.js — 완료 시각 기반 휴식 표시 모델
// ================================================================

function coerceWorkoutCompletionAt(value) {
  const stamp = Number(value);
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
}

function latestWorkoutCompletionAtFromRows(exercises = []) {
  let latest = null;
  const addStamp = (value) => {
    const stamp = coerceWorkoutCompletionAt(value);
    if (stamp == null) return;
    if (latest == null || stamp > latest) latest = stamp;
  };

  (Array.isArray(exercises) ? exercises : []).forEach((row) => {
    addStamp(row?.exerciseCompletedAt);
    const rawSets = Array.isArray(row?.rawSetDetails) ? row.rawSetDetails : [];
    const fallbackSets = Array.isArray(row?.setDetails) ? row.setDetails : [];
    const sets = rawSets.length ? rawSets : fallbackSets;
    sets.forEach((set) => {
      if (set?.done === false) return;
      addStamp(set?.completedAt);
    });
  });

  return latest;
}

export function latestWorkoutCompletionAt(workout) {
  const source = workout || {};
  return coerceWorkoutCompletionAt(source.lastCompletedAt)
    ?? latestWorkoutCompletionAtFromRows(source.exercises);
}

export function formatWorkoutCompletionElapsed(completedAt, now = Date.now()) {
  const stamp = coerceWorkoutCompletionAt(completedAt);
  const current = Number(now);
  if (stamp == null || !Number.isFinite(current)) return '—';
  const elapsedSec = Math.max(0, Math.floor((current - stamp) / 1000));
  const seconds = elapsedSec % 60;
  const totalMinutes = Math.floor(elapsedSec / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// 요약의 휴식은 실제 휴식 기록을 읽는다. 마지막 완료 이후의 벽시계 시간은
// 휴식이 아니며, 과거 기록을 열었다는 이유로 누적하거나 기록을 보정하지 않는다.
export function workoutRestSummary(workout = {}, options = {}) {
  const now = Number(options.now ?? Date.now());
  const candidates = [];
  (Array.isArray(workout.exercises) ? workout.exercises : []).forEach((entry, entryIdx) => {
    (Array.isArray(entry?.sets) ? entry.sets : []).forEach((set, setIdx) => {
      const startedAt = Date.parse(set?.restStartedAt || '');
      if (set?.done === false || !Number.isFinite(startedAt)) return;
      candidates.push({ set, startedAt, entryIdx, setIdx });
    });
  });
  const latest = candidates.sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!latest) return { value: '—', running: false };
  const { set, startedAt, entryIdx, setIdx } = latest;
  const timeline = buildWorkoutSetTimeline(workout.exercises, workout.workoutDuration, {
    previousTimeline: workout.workoutTimeline,
  });
  const recordedEnd = Date.parse(set.restEndedAt || '');
  const sessionEnd = Number(timeline.endedAt);
  const idleEnd = Number(timeline.lastSetCompletedAt) > 0
    ? Number(timeline.lastSetCompletedAt) + MAX_WORKOUT_REST_GAP_SEC * 1000
    : null;
  const active = options.activeRest;
  const isActive = active?.running === true
    && Number(active.startedAt) === startedAt
    && active.origin?.entryIdx === entryIdx
    && active.origin?.setIdx === setIdx;
  let endAt = Number.isFinite(recordedEnd) && recordedEnd >= startedAt ? recordedEnd : null;
  if (endAt == null && Number.isFinite(sessionEnd) && sessionEnd >= startedAt) endAt = sessionEnd;
  if (endAt != null) return { value: formatWorkoutCompletionElapsed(startedAt, endAt), running: false };
  if (isActive && idleEnd != null && idleEnd >= startedAt && Number.isFinite(now)) {
    return {
      value: formatWorkoutCompletionElapsed(startedAt, Math.min(now, idleEnd)),
      running: now < idleEnd,
    };
  }
  // 복귀/과거 기록의 미종료 메타데이터는 지금까지 연장하지 않는다.
  // 저장 당시 이미 측정된 시간이 있으면 그 값만 보여준다.
  const elapsedSec = Number(set.restElapsedSec);
  return {
    value: Number.isFinite(elapsedSec) && elapsedSec > 0
      ? formatWorkoutCompletionElapsed(startedAt, startedAt + elapsedSec * 1000)
      : '—',
    running: false,
  };
}
