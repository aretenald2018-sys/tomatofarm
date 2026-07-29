import {
  getCache,
  getDietPlan,
  getLatestCheckinWeight,
} from '../data.js';
import {
  getWorkoutSessions,
  hasWorkoutSessionData,
} from '../workout/sessions.js';
import {
  WORKOUT_GYM_SESSION_COUNT,
  WORKOUT_RUNNING_SESSION_INDEX,
} from '../workout/session-policy.js';
import { clearRunningSessionFields } from '../workout/running-model.js';
import {
  runningStackSession,
  runningTrackSessionInfo,
} from '../workout/calendar-running.js';
import { formatWorkoutTrackValue } from '../workout/track-metrics.js';
import { manualCardioSummaryText as _cardioSummaryText } from '../workout/cardio-model.js';
import {
  _activityRows,
  _shiftDateKey,
  _sortedCheckins,
  _weightAt,
} from './day-metrics.js';
import {
  _buildWorkoutLookup,
  _workoutMetrics,
} from './workout-read-model.js';
import {
  _dateTitle,
  _formatDuration,
} from './format.js';
import { parseDateKey as _parseDateKey } from '../utils/date-key.js';

function _sessionLabel(index) {
  return `${Number(index) + 1}회차`;
}

function _workoutHomeDay(key) {
  return (getCache() || {})[key] || {};
}

export function _formatWorkoutExportText(key, sessionIndex, session, wx, { heading = null } = {}) {
  const lines = [
    heading || `${_dateTitle(key)} ${_sessionLabel(sessionIndex)}`,
    `운동시간: ${_formatDuration(wx.durationSec)}`,
  ];
  if (wx.setCount > 0) lines.push(`총 세트: ${wx.setCount}세트`);
  if (wx.volume > 0) lines.push(`총 볼륨: ${formatWorkoutTrackValue('M', wx.volume)}`);
  if (wx.burned?.total > 0) lines.push(`소모: ${wx.burned.total} kcal`);

  wx.exercises.forEach((row) => {
    lines.push('', `${row.name}${row.majorName ? ` (${row.majorName})` : ''}`);
    if (row.cardio) {
      lines.push(`- 유산소: ${_cardioSummaryText(row.cardio)}`);
      if (row.note) lines.push(`- 메모: ${row.note}`);
      return;
    }
    row.setTexts.forEach((text, i) => lines.push(`- ${i + 1}세트: ${text}`));
    if (row.note) lines.push(`- 메모: ${row.note}`);
  });

  wx.activities.forEach((row) => {
    lines.push('', `${row.label}${row.main ? `: ${row.main}` : ''}`);
    if (row.detail) lines.push(`- 메모: ${row.detail}`);
  });

  const memo = String(session?.memo || '').trim();
  if (memo) lines.push('', `운동 메모: ${memo}`);
  return lines.join('\n');
}

export async function _shareOrCopyText(text, title) {
  const nav = window.navigator;
  if (nav?.share) {
    try {
      await nav.share({ title, text });
      return 'share';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancel';
    }
  }
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text);
    return 'clipboard';
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('clipboard fallback failed');
  return 'clipboard';
}

export function _workoutDayExportBlocks(key, context) {
  const { lookup, checkins, plan } = context;
  const day = _workoutHomeDay(key);
  const sessions = getWorkoutSessions(day, { minCount: WORKOUT_RUNNING_SESSION_INDEX + 1 });
  const bodyWeight = _weightAt(checkins, key) ?? getLatestCheckinWeight() ?? plan?.weight ?? 70;
  const blocks = [];

  sessions.slice(0, WORKOUT_GYM_SESSION_COUNT).forEach((raw, index) => {
    const session = clearRunningSessionFields(raw);
    if (!hasWorkoutSessionData(session)) return;
    const wx = _workoutMetrics(key, session, bodyWeight, lookup);
    blocks.push(_formatWorkoutExportText(key, index, session, wx, { heading: `[${_sessionLabel(index)}]` }));
  });

  const runningInfo = runningTrackSessionInfo(sessions);
  if (runningInfo.hasRecord) {
    const stack = runningStackSession(
      { session: runningInfo.session, activities: runningInfo.runningSessions },
      _activityRows,
    );
    const wx = _workoutMetrics(key, stack.session, bodyWeight, lookup);
    if (stack.rows.length) {
      const activityDurationSec = stack.rows.reduce((sum, row) => sum + (row.durationSec || 0), 0);
      wx.activities = stack.rows;
      wx.durationSec = Math.max(wx.durationSec || 0, activityDurationSec);
    }
    blocks.push(_formatWorkoutExportText(key, WORKOUT_RUNNING_SESSION_INDEX, stack.session, wx, { heading: '[러닝]' }));
  }

  return blocks;
}

export function _weekKeysFor(key) {
  const parsed = _parseDateKey(key);
  if (!parsed) return [];
  const mondayOffset = (new Date(parsed.y, parsed.m, parsed.d).getDay() + 6) % 7;
  const monday = _shiftDateKey(key, -mondayOffset);
  return Array.from({ length: 7 }, (_, offset) => _shiftDateKey(monday, offset));
}

export function _buildWorkoutRecordsExport(key, scope) {
  const context = { lookup: _buildWorkoutLookup(), checkins: _sortedCheckins(), plan: getDietPlan() || null };
  const keys = scope === 'week' ? _weekKeysFor(key) : [key];
  const days = keys
    .map(dayKey => ({ dayKey, blocks: _workoutDayExportBlocks(dayKey, context) }))
    .filter(entry => entry.blocks.length);
  if (!days.length) return null;

  const heading = scope === 'week'
    ? `${_dateTitle(keys[0])} ~ ${_dateTitle(keys[keys.length - 1])} 운동 기록`
    : `${_dateTitle(key)} 운동 기록`;
  const body = days
    .map(entry => [`■ ${_dateTitle(entry.dayKey)}`, ...entry.blocks].join('\n\n'))
    .join('\n\n');
  return { title: heading, text: `${heading}\n\n${body}` };
}

export async function _copyTextToClipboard(text) {
  const clipboard = window.navigator?.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('clipboard write failed');
}
