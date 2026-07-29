import { toFiniteNumber as _num } from '../utils/number.js';
// ================================================================
// workout/timeline.js — set-completion workout duration timeline
// ================================================================

export const WORKOUT_TIMELINE_MODE = 'set-completion';
export const MAX_WORKOUT_TIMELINE_SPAN_SEC = 8 * 60 * 60;
export const MAX_WORKOUT_REST_GAP_SEC = 15 * 60;

export function normalizeSetCompletedAt(value) {
  const n = _num(value);
  if (n <= 0) return null;
  return Math.floor(n);
}

export function stampSetCompletedAt(set, now = Date.now()) {
  if (!set || typeof set !== 'object') return null;
  const ts = normalizeSetCompletedAt(now) || Date.now();
  set.completedAt = ts;
  return ts;
}

export function clearSetCompletedAt(set) {
  if (!set || typeof set !== 'object') return;
  delete set.completedAt;
}

export function stripSetCompletedAt(set = {}) {
  const next = { ...set };
  delete next.completedAt;
  return next;
}

export function clearWorkoutSetCompletedAt(exercises = []) {
  let count = 0;
  for (const entry of Array.isArray(exercises) ? exercises : []) {
    for (const set of Array.isArray(entry?.sets) ? entry.sets : []) {
      if (normalizeSetCompletedAt(set?.completedAt) != null) {
        clearSetCompletedAt(set);
        count += 1;
      }
    }
  }
  return count;
}

export function collectSetCompletionTimes(exercises = []) {
  const times = [];
  for (const entry of Array.isArray(exercises) ? exercises : []) {
    for (const set of Array.isArray(entry?.sets) ? entry.sets : []) {
      if (!set || set.done !== true) continue;
      const completedAt = normalizeSetCompletedAt(set.completedAt);
      if (completedAt == null) continue;
      times.push(completedAt);
    }
  }
  return times.sort((a, b) => a - b);
}

function _matchingTimelineEnd(previousTimeline, lastSetCompletedAt, checkedSetCount) {
  if (!previousTimeline || lastSetCompletedAt == null) return null;
  const endedAfterSetCompletedAt = normalizeSetCompletedAt(previousTimeline.endedAfterSetCompletedAt);
  const endedAt = normalizeSetCompletedAt(previousTimeline.endedAt);
  const endedCheckedSetCount = Math.max(0, Math.floor(_num(previousTimeline.endedCheckedSetCount)));
  if (endedAfterSetCompletedAt !== lastSetCompletedAt || endedAt == null || endedAt < lastSetCompletedAt) {
    return null;
  }
  if (endedCheckedSetCount > 0 && endedCheckedSetCount !== checkedSetCount) return null;
  return {
    endedAt,
    endedAfterSetCompletedAt,
    endedCheckedSetCount: endedCheckedSetCount || checkedSetCount,
    endedBy: String(previousTimeline.endedBy || 'manual'),
  };
}

export function buildWorkoutSetTimeline(exercises = [], fallbackDurationSec = 0, options = {}) {
  const maxSpanSec = Math.max(60, Math.floor(_num(options.maxSpanSec) || MAX_WORKOUT_TIMELINE_SPAN_SEC));
  const maxRestGapSec = Math.max(60, Math.floor(_num(options.maxRestGapSec) || MAX_WORKOUT_REST_GAP_SEC));
  const times = collectSetCompletionTimes(exercises);
  const checkedSetCount = times.length;
  const firstSetCompletedAt = checkedSetCount ? times[0] : null;
  const lastSetCompletedAt = checkedSetCount ? times[checkedSetCount - 1] : null;
  const rawSpanSec = checkedSetCount >= 2
    ? Math.floor((lastSetCompletedAt - firstSetCompletedAt) / 1000)
    : 0;
  const gapSeconds = times.slice(1).map((completedAt, index) => (
    Math.max(0, Math.floor((completedAt - times[index]) / 1000))
  ));
  const durationSecFromTimeline = gapSeconds.reduce((sum, gapSec) => sum + Math.min(gapSec, maxRestGapSec), 0);
  const excludedIdleSec = gapSeconds.reduce((sum, gapSec) => sum + Math.max(0, gapSec - maxRestGapSec), 0);
  const cappedGapCount = gapSeconds.filter(gapSec => gapSec > maxRestGapSec).length;
  const invalidSpan = rawSpanSec < 0;
  const hasTimeline = checkedSetCount > 0 && !invalidSpan;
  const durationSec = hasTimeline
    ? durationSecFromTimeline
    : Math.max(0, Math.floor(_num(fallbackDurationSec)));
  const source = hasTimeline ? WORKOUT_TIMELINE_MODE : (durationSec > 0 ? 'legacy-duration' : 'none');
  const matchingEnd = _matchingTimelineEnd(options.previousTimeline, lastSetCompletedAt, checkedSetCount);
  return {
    mode: WORKOUT_TIMELINE_MODE,
    source,
    firstSetCompletedAt,
    lastSetCompletedAt,
    checkedSetCount,
    durationSec,
    rawSpanSec,
    excludedIdleSec,
    cappedGapCount,
    invalidSpan,
    maxSpanSec,
    maxRestGapSec,
    ...(matchingEnd || {}),
  };
}

export function syncWorkoutTimeline(workout, options = {}) {
  if (!workout || typeof workout !== 'object') return null;
  const timeline = buildWorkoutSetTimeline(workout.exercises, workout.workoutDuration, {
    ...options,
    previousTimeline: options.previousTimeline || workout.workoutTimeline,
  });
  workout.workoutTimeline = timeline;
  workout.workoutDuration = timeline.durationSec;
  return timeline;
}

export function closeWorkoutTimeline(workout, options = {}) {
  const timeline = syncWorkoutTimeline(workout, options);
  if (!timeline?.lastSetCompletedAt) return timeline;
  const requestedEnd = normalizeSetCompletedAt(options.endedAt) || Date.now();
  timeline.endedAt = Math.max(timeline.lastSetCompletedAt, requestedEnd);
  timeline.endedAfterSetCompletedAt = timeline.lastSetCompletedAt;
  timeline.endedCheckedSetCount = timeline.checkedSetCount;
  timeline.endedBy = String(options.endedBy || 'manual');
  workout.workoutTimeline = timeline;
  workout.workoutDuration = timeline.durationSec;
  return timeline;
}
