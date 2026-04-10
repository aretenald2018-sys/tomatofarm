// ================================================================
// admin/admin-export.js — AI 분석용 데이터 CSV 내보내기
// ================================================================

import { TODAY, dateKey } from '../data.js';
import { dk, daysAgo, nameResolver } from './admin-utils.js';

// ── CSV 유틸 ─────────────────────────────────────────────────────
function _escCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _csvRow(arr) {
  return arr.map(_escCsv).join(',');
}

function _downloadCsv(filename, rows) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel 한글 호환
  const csv = BOM + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function _ts(val) {
  if (!val) return '';
  const d = new Date(val);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function _dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── 1. 유저 종합 리포트 ──────────────────────────────────────────
export function exportUsersReport(data) {
  const { realAccs, accs, frs, lks, gbs, analytics, patchnotes, workoutMap, dateKeys30 } = data;
  const _name = nameResolver(accs);
  const last14Keys = dateKeys30.slice(0, 14);

  const latestPatch = patchnotes[0];
  const patchReadSet = new Set(latestPatch?.readBy || []);

  const headers = [
    '유저ID', '닉네임', '실명', '가입일', '마지막접속', '마지막활동(일전)',
    '운동스트릭(일)', '식단스트릭(일)', '14일중_운동일수', '14일중_식단일수', '14일중_코어루프일수',
    '이웃수', '리액션_보냄', '리액션_받음', '방명록_보냄', '방명록_받음',
    '이탈위험점수', '비밀번호설정', '튜토리얼완료', '최근패치읽음',
    '7일_탭방문_홈', '7일_탭방문_운동', '7일_탭방문_식단', '7일_탭방문_통계', '7일_탭방문_요리',
    '7일_기능_운동기록', '7일_기능_식단기록', '7일_기능_사진업로드', '7일_기능_AI식단추천', '7일_기능_AI운동추천',
    // 14일 히트맵 (과거→최근)
    ...Array.from({length: 14}, (_, i) => `D-${13-i}_활동`),
  ];

  const rows = [_csvRow(headers)];

  for (const acc of realAccs) {
    const uid = acc.id;
    const nick = acc.nickname || (acc.lastName + acc.firstName);
    const realName = (acc.lastName || '') + (acc.firstName || '').replace(/\(.*\)/, '');

    const friendCount = frs.filter(f => f.status === 'accepted' && (f.from === uid || f.to === uid)).length;
    const likesSent = lks.filter(l => l.from === uid).length;
    const likesReceived = lks.filter(l => l.to === uid).length;
    const gbSent = gbs.filter(g => g.from === uid).length;
    const gbReceived = gbs.filter(g => g.to === uid).length;

    // 14일 활동
    const activity14 = last14Keys.map(key => workoutMap[key]?.[uid] || null);
    let lastActiveIdx = null;
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.any) { lastActiveIdx = i; break; }
    }

    let workoutStreak = 0, dietStreak = 0;
    let workoutDays14 = 0, dietDays14 = 0, coreDays14 = 0;
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.exercise) workoutDays14++;
      if (activity14[i]?.diet) dietDays14++;
      if (activity14[i]?.exercise && activity14[i]?.diet) coreDays14++;
    }
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.exercise) workoutStreak++; else break;
    }
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.diet) dietStreak++; else break;
    }

    const daysSinceActive = lastActiveIdx ?? 15;
    const churnScore = (daysSinceActive * (1 / Math.max(workoutStreak, 1))).toFixed(1);

    // 7일 탭/기능 사용
    const tabVisitSum = {};
    const featuresUsed = {};
    for (const dayDoc of analytics.slice(0, 7)) {
      const u = dayDoc.users?.[uid];
      if (u?.tabVisits) {
        for (const [tab, cnt] of Object.entries(u.tabVisits)) {
          tabVisitSum[tab] = (tabVisitSum[tab] || 0) + cnt;
        }
      }
      if (u?.featuresUsed) {
        for (const f of u.featuresUsed) {
          featuresUsed[f] = (featuresUsed[f] || 0) + 1;
        }
      }
    }

    // 14일 히트맵: "운동+식단" / "운동만" / "식단만" / "기타" / "미활동"
    const heatmap = activity14.reverse().map(act => {
      if (!act || !act.any) return '미활동';
      if (act.exercise && act.diet) return '운동+식단';
      if (act.exercise) return '운동만';
      if (act.diet) return '식단만';
      return '기타활동';
    });

    rows.push(_csvRow([
      uid, nick, realName,
      _ts(acc.createdAt), _ts(acc.lastLoginAt),
      lastActiveIdx ?? '14+',
      workoutStreak, dietStreak, workoutDays14, dietDays14, coreDays14,
      friendCount, likesSent, likesReceived, gbSent, gbReceived,
      churnScore,
      acc.hasPassword ? 'Y' : 'N',
      acc.tutorialDoneAt ? 'Y' : 'N',
      patchReadSet.has(uid) ? 'Y' : 'N',
      tabVisitSum.home || 0, tabVisitSum.workout || 0, tabVisitSum.diet || 0,
      tabVisitSum.stats || 0, tabVisitSum.cooking || 0,
      featuresUsed['운동'] || featuresUsed['workout'] || 0,
      featuresUsed['식단'] || featuresUsed['diet'] || 0,
      featuresUsed['photo_upload'] || 0,
      featuresUsed['ai_diet_rec'] || 0,
      featuresUsed['ai_workout_rec'] || 0,
      ...heatmap,
    ]));
  }

  const today = _dateStr(TODAY);
  _downloadCsv(`tomatofarm_유저리포트_${today}.csv`, rows);
}

// ── 2. 일별 활동 리포트 ──────────────────────────────────────────
export function exportDailyActivity(data) {
  const { realAccs, lks, gbs, workoutMap, dateKeys30 } = data;

  // 헤더: 날짜, DAU, 운동유저수, 식단유저수, 코어루프유저수, 리액션수, 방명록수, 유저별 활동...
  const userIds = realAccs.map(a => a.id);
  const userNicks = realAccs.map(a => a.nickname || (a.lastName + a.firstName));

  const headers = [
    '날짜', 'DAU', '운동유저수', '식단유저수', '코어루프유저수', '리액션수', '방명록수',
    ...userNicks.map(n => `${n}_활동`),
  ];

  const rows = [_csvRow(headers)];

  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i);
    const dateStr = _dateStr(d);
    const dayStart = new Date(d).setHours(0,0,0,0);
    const dayEnd = dayStart + 86400000;

    const wk = workoutMap[dateKeys30[i]] || {};
    let dau = 0, exCount = 0, dietCount = 0, coreCount = 0;
    const userActivity = [];

    for (const uid of userIds) {
      const w = wk[uid];
      if (w?.any) dau++;
      if (w?.exercise) exCount++;
      if (w?.diet) dietCount++;
      if (w?.exercise && w?.diet) coreCount++;

      if (!w || !w.any) userActivity.push('미활동');
      else if (w.exercise && w.diet) userActivity.push('운동+식단');
      else if (w.exercise) userActivity.push('운동만');
      else if (w.diet) userActivity.push('식단만');
      else userActivity.push('기타활동');
    }

    const dayLikes = lks.filter(l => l.createdAt >= dayStart && l.createdAt < dayEnd).length;
    const dayGb = gbs.filter(g => g.createdAt >= dayStart && g.createdAt < dayEnd).length;

    rows.push(_csvRow([
      dateStr, dau, exCount, dietCount, coreCount, dayLikes, dayGb,
      ...userActivity,
    ]));
  }

  const today = _dateStr(TODAY);
  _downloadCsv(`tomatofarm_일별활동_${today}.csv`, rows);
}

// ── 3. 소셜 인터랙션 ────────────────────────────────────────────
export function exportSocialInteractions(data) {
  const { accs, frs, lks, gbs } = data;
  const _name = nameResolver(accs);

  const headers = ['유형', '보낸사람', '받은사람', '내용', '날짜시간', '상태'];
  const rows = [_csvRow(headers)];

  // 리액션 (좋아요)
  for (const l of lks) {
    rows.push(_csvRow([
      '리액션', _name(l.from), _name(l.to),
      l.emoji || '👏', _ts(l.createdAt), '',
    ]));
  }

  // 방명록
  for (const g of gbs) {
    rows.push(_csvRow([
      '방명록', g.fromName || _name(g.from), _name(g.to),
      g.message || '', _ts(g.createdAt), '',
    ]));
  }

  // 이웃 요청
  for (const f of frs) {
    rows.push(_csvRow([
      '이웃요청', _name(f.from), _name(f.to),
      '', _ts(f.createdAt), f.status || '',
    ]));
  }

  const today = _dateStr(TODAY);
  _downloadCsv(`tomatofarm_소셜인터랙션_${today}.csv`, rows);
}

// ── 4. 편지 & 패치노트 ──────────────────────────────────────────
export function exportLettersAndPatchnotes(data) {
  const { accs, letters, patchnotes, realAccs } = data;
  const _name = nameResolver(accs);

  // 편지
  const lHeaders = ['유형', '보낸사람', '내용', '읽음여부', '날짜시간'];
  const lRows = [_csvRow(lHeaders)];

  for (const l of letters) {
    lRows.push(_csvRow([
      '편지', l.fromName || _name(l.from),
      l.message || '', l.read ? 'Y' : 'N', _ts(l.createdAt),
    ]));
  }

  // 패치노트
  lRows.push(_csvRow([])); // 빈 줄 구분
  lRows.push(_csvRow(['[패치노트]']));
  const pHeaders = ['제목', '내용', '발행일', '읽은유저수', '전체유저수', '도달률(%)'];
  lRows.push(_csvRow(pHeaders));

  const totalUsers = realAccs.length;
  for (const p of patchnotes) {
    const readCount = (p.readBy || []).length;
    const rate = totalUsers > 0 ? Math.round((readCount / totalUsers) * 100) : 0;
    lRows.push(_csvRow([
      p.title || '', p.body || '', _ts(p.createdAt),
      readCount, totalUsers, rate,
    ]));
  }

  const today = _dateStr(TODAY);
  _downloadCsv(`tomatofarm_편지_패치노트_${today}.csv`, lRows);
}

// ── 5. 전체 내보내기 (모든 CSV 한번에) ──────────────────────────
export function exportAll(data) {
  exportUsersReport(data);
  setTimeout(() => exportDailyActivity(data), 300);
  setTimeout(() => exportSocialInteractions(data), 600);
  setTimeout(() => exportLettersAndPatchnotes(data), 900);
}

// ── 6. AI 분석용 종합 JSON ───────────────────────────────────────
export function exportAIJson(data) {
  const { realAccs, accs, frs, lks, gbs, letters, patchnotes, analytics, workoutMap, dateKeys30 } = data;
  const _name = nameResolver(accs);
  const last14Keys = dateKeys30.slice(0, 14);

  const exportData = {
    exportDate: _dateStr(TODAY),
    summary: {
      totalUsers: realAccs.length,
      totalFriendships: frs.filter(f => f.status === 'accepted').length,
      totalReactions: lks.length,
      totalGuestbooks: gbs.length,
      totalLetters: letters.length,
      unreadLetters: letters.filter(l => !l.read).length,
    },
    users: realAccs.map(acc => {
      const uid = acc.id;
      const activity14 = last14Keys.map(key => {
        const w = workoutMap[key]?.[uid];
        if (!w) return { date: key, exercise: false, diet: false, any: false };
        return { date: key, exercise: !!w.exercise, diet: !!w.diet, any: !!w.any };
      });

      let workoutStreak = 0, dietStreak = 0;
      for (let i = 0; i < 14; i++) {
        if (activity14[i]?.exercise) workoutStreak++; else break;
      }
      for (let i = 0; i < 14; i++) {
        if (activity14[i]?.diet) dietStreak++; else break;
      }

      return {
        id: uid,
        nickname: acc.nickname || (acc.lastName + acc.firstName),
        createdAt: _ts(acc.createdAt),
        lastLogin: _ts(acc.lastLoginAt),
        workoutStreak, dietStreak,
        friends: frs.filter(f => f.status === 'accepted' && (f.from === uid || f.to === uid)).length,
        reactionsSent: lks.filter(l => l.from === uid).length,
        reactionsReceived: lks.filter(l => l.to === uid).length,
        hasPassword: !!acc.hasPassword,
        tutorialDone: !!acc.tutorialDoneAt,
        activity14,
      };
    }),
    dailyMetrics: dateKeys30.slice().reverse().map((key, idx) => {
      const i = 29 - idx;
      const d = daysAgo(i);
      const wk = workoutMap[key] || {};
      const dayStart = new Date(d).setHours(0,0,0,0);
      const dayEnd = dayStart + 86400000;
      return {
        date: _dateStr(d),
        dau: Object.values(wk).filter(w => w.any).length,
        exerciseUsers: Object.values(wk).filter(w => w.exercise).length,
        dietUsers: Object.values(wk).filter(w => w.diet).length,
        reactions: lks.filter(l => l.createdAt >= dayStart && l.createdAt < dayEnd).length,
        guestbooks: gbs.filter(g => g.createdAt >= dayStart && g.createdAt < dayEnd).length,
      };
    }),
    socialGraph: {
      friendships: frs.filter(f => f.status === 'accepted').map(f => ({
        from: _name(f.from), to: _name(f.to),
      })),
      recentReactions: lks.slice(-50).map(l => ({
        from: _name(l.from), to: _name(l.to), emoji: l.emoji || '👏', date: _ts(l.createdAt),
      })),
    },
    letters: letters.map(l => ({
      from: l.fromName || _name(l.from), message: l.message || '', read: !!l.read, date: _ts(l.createdAt),
    })),
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tomatofarm_AI분석용_${_dateStr(TODAY)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
