import { toFiniteNumber } from '../utils/number.js';
import { TODAY, getDeveloperLetterStatus, getDeveloperLetterStatusMeta } from '../data.js';

// CSV 필드 이스케이프다. utils/escape-html.js 의 HTML 이스케이프와 규칙이
// 달라서 그 정본으로 대체하지 않는다 — 쉼표·따옴표·줄바꿈이 든 필드는
// 따옴표로 감싸야 열이 밀리지 않는다.
function _esc(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function _row(values) {
  return values.map(_esc).join(',');
}

function _dateStamp(date = TODAY) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const _num = (value, fallback = null) => toFiniteNumber(value, fallback);

function _fmtNum(value, digits = 1) {
  const n = _num(value);
  return n === null ? '' : n.toFixed(digits);
}

function _download(name, lines) {
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function _contentStyle(uid, data) {
  const keys14 = data.dateKeys30.slice(0, 14);
  let exercise = 0;
  let diet = 0;
  keys14.forEach((key) => {
    const day = data.workoutMap[key]?.[uid];
    if (day?.exercise) exercise++;
    if (day?.diet) diet++;
  });
  const total = exercise + diet;
  if (total === 0) return '미참여';
  const ratio = exercise / total;
  if (ratio >= 0.65) return '운동형';
  if (ratio <= 0.35) return '식단형';
  return '균형형';
}

function _socialStyle(uid, data) {
  const likesOut = (data.lks || []).filter((x) => x.from === uid).length;
  const likesIn = (data.lks || []).filter((x) => x.to === uid).length;
  const gbOut = (data.gbs || []).filter((x) => x.from === uid).length;
  const gbIn = (data.gbs || []).filter((x) => x.to === uid).length;
  const sent = likesOut + gbOut;
  const received = likesIn + gbIn;
  if (sent + received === 0) return '미참여';
  if (sent >= received * 1.2) return '적극형';
  if (received > sent * 1.2) return '수동형';
  return '균형형';
}

function _checkinLabel(rec, data) {
  const name = data.resolveName ? data.resolveName(rec.uid) : rec.uid;
  const weight = _fmtNum(rec.weight, 1);
  const bodyFat = _fmtNum(rec.bodyFatPct, 1);
  const suffix = bodyFat ? ` / ${bodyFat}%` : '';
  return `${name}: ${weight}kg${suffix}`;
}

export function exportUsersReport(data) {
  const lines = [];
  lines.push(_row([
    'name', 'stage', 'trajectory', 'score',
    'workoutStreak', 'dietStreak', 'activeDays14d',
    'contentType', 'socialType', 'lastLoginAt',
  ]));

  data.realAccs.forEach((account) => {
    const uid = account.id;
    const name = account.nickname || `${account.lastName || ''}${account.firstName || ''}` || uid;
    const segment = data.userSegments?.[uid] || {};

    let workoutStreak = 0;
    let dietStreak = 0;
    let activeDays14d = 0;
    for (let i = 0; i < Math.min(14, data.dateKeys30.length); i++) {
      const day = data.workoutMap[data.dateKeys30[i]]?.[uid];
      if (i === workoutStreak && day?.exercise) workoutStreak++;
      if (i === dietStreak && day?.diet) dietStreak++;
      if (day?.any) activeDays14d++;
    }

    lines.push(_row([
      name,
      segment.stage || '-',
      segment.trajectory || '-',
      segment.score ?? 0,
      workoutStreak,
      dietStreak,
      activeDays14d,
      _contentStyle(uid, data),
      _socialStyle(uid, data),
      account.lastLoginAt || '',
    ]));
  });

  _download(`tomatofarm_users_${_dateStamp()}.csv`, lines);
}

export function exportDailyActivity(data) {
  const lines = [];
  lines.push(_row([
    'date', 'dau', 'exerciseUsers', 'dietUsers', 'coreLoopUsers',
    'weightCheckins', 'weightCheckinUsers', 'avgWeightKg', 'weightRecords',
  ]));

  data.dateKeys30.slice().reverse().forEach((key) => {
    const wk = data.workoutMap[key] || {};
    const checkins = data.bodyCheckinMap?.[key] || [];
    const weights = checkins.map((rec) => _num(rec.weight)).filter((n) => n !== null);
    const uniqueUsers = new Set(checkins.map((rec) => rec.uid).filter(Boolean)).size;
    const avgWeight = weights.length
      ? (weights.reduce((sum, n) => sum + n, 0) / weights.length).toFixed(1)
      : '';
    const records = checkins.map((rec) => _checkinLabel(rec, data)).join('; ');
    const dau = Object.values(wk).filter((v) => v.any).length;
    const ex = Object.values(wk).filter((v) => v.exercise).length;
    const diet = Object.values(wk).filter((v) => v.diet).length;
    const core = Object.values(wk).filter((v) => v.exercise && v.diet).length;
    lines.push(_row([key, dau, ex, diet, core, checkins.length, uniqueUsers, avgWeight, records]));
  });

  _download(`tomatofarm_daily_${_dateStamp()}.csv`, lines);
}

export function exportBodyCheckins(data) {
  const lines = [];
  lines.push(_row(['date', 'name', 'uid', 'weightKg', 'bodyFatPct', 'note']));

  (data.bodyCheckins || []).forEach((rec) => {
    lines.push(_row([
      rec.date || '',
      data.resolveName ? data.resolveName(rec.uid) : rec.uid,
      rec.uid || '',
      _fmtNum(rec.weight, 1),
      _fmtNum(rec.bodyFatPct, 1),
      rec.note || '',
    ]));
  });

  _download(`tomatofarm_body_checkins_${_dateStamp()}.csv`, lines);
}

export function exportSocialInteractions(data) {
  const lines = [];
  lines.push(_row(['type', 'from', 'to', 'message', 'createdAt']));

  data.lks.forEach((item) => {
    lines.push(_row(['like', data.resolveName(item.from), data.resolveName(item.to), item.emoji || '', item.createdAt || '']));
  });
  data.gbs.forEach((item) => {
    lines.push(_row(['guestbook', item.fromName || data.resolveName(item.from), data.resolveName(item.to), item.message || '', item.createdAt || '']));
  });
  data.frs.forEach((item) => {
    lines.push(_row(['friend_request', data.resolveName(item.from), data.resolveName(item.to), item.status || '', item.createdAt || '']));
  });

  _download(`tomatofarm_social_${_dateStamp()}.csv`, lines);
}

export function exportLettersAndPatchnotes(data) {
  const lines = [];
  lines.push(_row(['type', 'from', 'title', 'message', 'status', 'read', 'createdAt']));
  data.letters.forEach((item) => {
    const status = getDeveloperLetterStatusMeta(getDeveloperLetterStatus(item)).label;
    lines.push(_row(['letter', item.fromName || data.resolveName(item.from), '', item.message || '', status, item.read ? 'Y' : 'N', item.createdAt || '']));
  });
  data.patchnotes.forEach((item) => {
    lines.push(_row(['patchnote', 'admin', item.title || '', item.body || '', '', (item.readBy || []).length, item.createdAt || '']));
  });

  _download(`tomatofarm_letters_patchnotes_${_dateStamp()}.csv`, lines);
}

export function exportAll(data) {
  exportUsersReport(data);
  setTimeout(() => exportDailyActivity(data), 250);
  setTimeout(() => exportBodyCheckins(data), 500);
  setTimeout(() => exportSocialInteractions(data), 750);
  setTimeout(() => exportLettersAndPatchnotes(data), 1000);
}

export function exportAIJson(data) {
  const users = data.realAccs.map((account) => ({
    uid: account.id,
    name: account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id,
    createdAt: account.createdAt || null,
    lastLoginAt: account.lastLoginAt || null,
    segment: data.userSegments?.[account.id] || null,
  }));

  const payload = {
    exportedAt: new Date().toISOString(),
    summary: {
      totalUsers: data.realAccs.length,
      unreadLetters: data.unreadLetters,
      actionQueue: data.segmentSummary?.actionQueue || [],
    },
    users,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tomatofarm_ai_${_dateStamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
