// ================================================================
// admin/admin-users.js — 유저 섹션 (개인별 분석 + 코호트)
// ================================================================

import { TODAY, dateKey } from '../data.js';
import { dk, daysAgo, fmtDate, relativeDay, nameResolver, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';

/**
 * 유저 섹션 렌더
 * @param {HTMLElement} container
 * @param {Object} data - 전체 adminData
 */
export function renderUsersSection(container, data) {
  const { realAccs, accs, frs, lks, gbs, analytics, patchnotes, workoutMap, dateKeys30 } = data;
  const _name = nameResolver(accs);

  // 최근 패치노트 읽음 현황
  const latestPatch = patchnotes[0];
  const patchReadSet = new Set(latestPatch?.readBy || []);

  // ── 14일 dateKeys ──
  const last14Keys = dateKeys30.slice(0, 14);

  // ── 유저 카드 데이터 조립 (workoutMap 기반) ──
  const userCards = realAccs.map(acc => {
    const uid = acc.id;
    const nick = acc.nickname || (acc.lastName + acc.firstName);
    const friendCount = frs.filter(f => f.status === 'accepted' && (f.from === uid || f.to === uid)).length;
    const likesSent = lks.filter(l => l.from === uid).length;
    const likesReceived = lks.filter(l => l.to === uid).length;

    // 14일 활동 데이터 (workoutMap에서 직접)
    const activity14 = last14Keys.map(key => {
      const wk = workoutMap[key];
      return wk?.[uid] || null;
    });

    // 마지막 활동일
    let lastActiveIdx = null;
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.any) { lastActiveIdx = i; break; }
    }

    // 스트릭 (연속 운동/식단 일수 — workoutMap 기반)
    let workoutStreak = 0, dietStreak = 0;
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.exercise) workoutStreak++;
      else break;
    }
    for (let i = 0; i < 14; i++) {
      if (activity14[i]?.diet) dietStreak++;
      else break;
    }

    // 최근 액션
    const recentActions = (acc.actionLog || []).slice(-3);

    // 기능 사용 체크리스트 (analytics 기반 — 트래킹 시작 후 축적)
    const featuresUsed = new Set();
    for (const dayDoc of analytics.slice(0, 7)) {
      const u = dayDoc.users?.[uid];
      if (u?.featuresUsed) u.featuresUsed.forEach(f => featuresUsed.add(f));
    }

    // 탭 방문 (analytics 기반 — 트래킹 시작 후 축적)
    const tabVisitSum = {};
    for (const dayDoc of analytics.slice(0, 7)) {
      const u = dayDoc.users?.[uid];
      if (u?.tabVisits) {
        for (const [tab, cnt] of Object.entries(u.tabVisits)) {
          tabVisitSum[tab] = (tabVisitSum[tab] || 0) + cnt;
        }
      }
    }

    // 이탈 위험 점수
    const daysSinceActive = lastActiveIdx ?? 15;
    const churnScore = daysSinceActive * (1 / Math.max(workoutStreak, 1));

    return {
      uid, nick,
      realName: acc.lastName + (acc.firstName || '').replace(/\(.*\)/, ''),
      friendCount, likesSent, likesReceived,
      lastActiveIdx, lastActiveText: relativeDay(lastActiveIdx),
      workoutStreak, dietStreak,
      hasPw: acc.hasPassword || false,
      lastLoginAt: acc.lastLoginAt,
      tutorialDoneAt: acc.tutorialDoneAt,
      patchRead: patchReadSet.has(uid),
      recentActions, featuresUsed, tabVisitSum,
      churnScore,
      activity14,
    };
  });

  // 정렬: 마지막 활동순
  userCards.sort((a, b) => (a.lastActiveIdx ?? 999) - (b.lastActiveIdx ?? 999));

  // ── 정렬 옵션 ──
  const sortOptions = [
    { id: 'active', label: '활동순' },
    { id: 'streak', label: '스트릭순' },
    { id: 'churn', label: '이탈위험순' },
    { id: 'social', label: '소셜순' },
  ];

  // ── 코호트 리텐션 테이블 ──
  // 가입 주차별로 그룹핑 후, 각 주에 활동한 비율
  const cohortData = _buildCohortTable(realAccs, workoutMap, dateKeys30);

  // ── HTML ──
  container.innerHTML = `
    <!-- 정렬 컨트롤 -->
    <div style="display:flex;gap:6px;margin-bottom:12px;overflow-x:auto;">
      ${sortOptions.map(s => `
        <button class="admin-user-sort-btn" data-sort="${s.id}" onclick="window._adminSortUsers('${s.id}')"
          style="padding:5px 12px;border:1px solid var(--border);border-radius:8px;font-size:11px;font-weight:500;color:var(--text-tertiary);background:var(--surface);cursor:pointer;white-space:nowrap;${s.id === 'active' ? 'color:var(--text);font-weight:600;border-color:#fa342c;' : ''}">
          ${s.label}
        </button>
      `).join('')}
    </div>

    <!-- 활동 스트립 범례 -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;padding:8px 12px;border-radius:10px;background:var(--surface2,#F2F4F6);">
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);">
        <div style="width:8px;height:8px;border-radius:2px;background:#22c55e;"></div>운동+식단
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);">
        <div style="width:8px;height:8px;border-radius:2px;background:#86efac;"></div>운동만
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);">
        <div style="width:8px;height:8px;border-radius:2px;background:#93c5fd;"></div>식단만
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);">
        <div style="width:8px;height:8px;border-radius:2px;background:#fbbf24;"></div>기타 활동
      </div>
      <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:var(--text-secondary);">
        <div style="width:8px;height:8px;border-radius:2px;background:var(--border);"></div>미활동
      </div>
    </div>

    <!-- 유저 카드 리스트 -->
    <div id="admin-user-list">
      ${userCards.map(u => _renderUserCard(u)).join('')}
    </div>

    <!-- 코호트 리텐션 -->
    ${cohortData.rows.length > 0 ? `
    <div style="${CARD_STYLE};margin-top:16px;">
      <div style="${SECTION_TITLE}">리텐션 코호트</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr>
              <th style="text-align:left;padding:4px 6px;color:var(--text-tertiary);font-weight:500;">가입 주</th>
              ${cohortData.weekLabels.map(w => `<th style="padding:4px 6px;color:var(--text-tertiary);font-weight:500;">${w}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${cohortData.rows.map(r => `
              <tr>
                <td style="padding:4px 6px;color:var(--text-secondary);white-space:nowrap;">${r.label} (${r.count}명)</td>
                ${r.cells.map(c => `
                  <td style="padding:4px 6px;text-align:center;background:${_cohortColor(c)};color:${c >= 50 ? '#fff' : 'var(--text-secondary)'};border-radius:4px;">${c !== null ? c + '%' : '-'}</td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:8px;">* analytics 트래킹 시작 이후 데이터 기준</div>
    </div>` : ''}
  `;

  // 정렬 이벤트
  window._adminSortUsers = function(sortId) {
    let sorted = [...userCards];
    switch (sortId) {
      case 'active': sorted.sort((a, b) => (a.lastActiveIdx ?? 999) - (b.lastActiveIdx ?? 999)); break;
      case 'streak': sorted.sort((a, b) => (b.workoutStreak + b.dietStreak) - (a.workoutStreak + a.dietStreak)); break;
      case 'churn': sorted.sort((a, b) => b.churnScore - a.churnScore); break;
      case 'social': sorted.sort((a, b) => (b.likesSent + b.likesReceived + b.friendCount) - (a.likesSent + a.likesReceived + a.friendCount)); break;
    }
    const list = document.getElementById('admin-user-list');
    if (list) list.innerHTML = sorted.map(u => _renderUserCard(u)).join('');

    document.querySelectorAll('.admin-user-sort-btn').forEach(btn => {
      const active = btn.dataset.sort === sortId;
      btn.style.color = active ? 'var(--text)' : 'var(--text-tertiary)';
      btn.style.fontWeight = active ? '600' : '500';
      btn.style.borderColor = active ? '#fa342c' : 'var(--border)';
    });
  };
}

// ── 유저 카드 HTML ──
function _renderUserCard(u) {
  const isActiveToday = u.lastActiveIdx === 0;

  // 14일 활동 스트립
  const stripHtml = u.activity14.map(act => {
    if (!act) return '<div style="width:8px;height:8px;border-radius:2px;background:var(--border);"></div>';
    if (act.exercise && act.diet) return '<div style="width:8px;height:8px;border-radius:2px;background:#22c55e;"></div>';
    if (act.exercise) return '<div style="width:8px;height:8px;border-radius:2px;background:#86efac;"></div>';
    if (act.diet) return '<div style="width:8px;height:8px;border-radius:2px;background:#93c5fd;"></div>';
    if (act.any) return '<div style="width:8px;height:8px;border-radius:2px;background:#fbbf24;"></div>';
    return '<div style="width:8px;height:8px;border-radius:2px;background:var(--border);"></div>';
  }).reverse().join(''); // 오래된 날짜가 왼쪽

  return `
    <div style="${CARD_STYLE};margin-bottom:10px;padding:12px 16px;" onclick="this.querySelector('.admin-user-detail')?.classList.toggle('admin-user-detail--open')">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:${isActiveToday ? '#E8F3FF' : 'var(--surface2,#F2F4F6)'};color:${isActiveToday ? '#fa342c' : 'var(--text-tertiary)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;position:relative;">
          ${u.nick.charAt(0)}
          ${isActiveToday ? '<span style="position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border-radius:50%;background:#22c55e;border:2px solid var(--surface);"></span>' : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:13px;font-weight:600;color:var(--text);">${u.nick}</span>
            <span style="font-size:10px;color:var(--text-tertiary);">${u.lastActiveText}</span>
          </div>
          <!-- 14일 활동 스트립 -->
          <div style="display:flex;gap:2px;margin-top:4px;">${stripHtml}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
          ${u.workoutStreak > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:999px;background:#ECFDF5;color:#059669;font-weight:600;">💪${u.workoutStreak}일</span>` : ''}
          ${u.dietStreak > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:999px;background:#EFF6FF;color:#2563eb;font-weight:600;">🥗${u.dietStreak}일</span>` : ''}
        </div>
      </div>

      <!-- 뱃지 행 -->
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;margin-left:42px;">
        <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:var(--surface2,#F2F4F6);color:var(--text-tertiary);">이웃 ${u.friendCount}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:var(--surface2,#F2F4F6);color:var(--text-tertiary);">리액션 ↑${u.likesSent} ↓${u.likesReceived}</span>
        ${!u.hasPw ? '<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:#FEF2F2;color:#f59e0b;font-weight:600;">비번없음</span>' : ''}
        <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${u.tutorialDoneAt ? '#ECFDF5' : '#FEF2F2'};color:${u.tutorialDoneAt ? '#059669' : '#DC2626'};">${u.tutorialDoneAt ? '코칭완료' : '코칭미완'}</span>
        <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${u.patchRead ? '#ECFDF5' : '#FEF2F2'};color:${u.patchRead ? '#059669' : '#DC2626'};">${u.patchRead ? '패치읽음' : '패치안읽음'}</span>
      </div>

      <!-- 확장 영역 (클릭 시 토글) -->
      <div class="admin-user-detail" style="display:none;margin-top:10px;margin-left:42px;padding-top:10px;border-top:1px solid var(--border);">
        <!-- 탭 사용 비율 -->
        ${Object.keys(u.tabVisitSum).length > 0 ? `
        <div style="margin-bottom:8px;">
          <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px;">7일간 탭 사용</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${Object.entries(u.tabVisitSum).sort((a,b) => b[1] - a[1]).map(([tab, cnt]) => `
              <span style="font-size:9px;padding:2px 6px;border-radius:6px;background:var(--surface2,#F2F4F6);color:var(--text-secondary);">${tab} ${cnt}회</span>
            `).join('')}
          </div>
        </div>` : ''}

        <!-- 기능 사용 -->
        ${u.featuresUsed.size > 0 ? `
        <div style="margin-bottom:8px;">
          <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px;">7일간 기능 사용</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${[...u.featuresUsed].map(f => `
              <span style="font-size:9px;padding:2px 6px;border-radius:6px;background:#EFF6FF;color:#2563eb;">${f}</span>
            `).join('')}
          </div>
        </div>` : ''}

        <!-- 최근 액션 -->
        ${u.recentActions.length > 0 ? `
        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px;">최근 액션</div>
          <div style="display:flex;gap:3px;flex-wrap:wrap;">
            ${u.recentActions.map(a => `<span style="font-size:9px;padding:1px 6px;border-radius:6px;background:var(--surface2,#F2F4F6);color:var(--text-tertiary);">${a.action} ${fmtDate(a.at)}</span>`).join('')}
          </div>
        </div>` : ''}

        <!-- 접속 정보 -->
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;">
          접속: ${u.lastLoginAt ? fmtDate(u.lastLoginAt) : '기록없음'}
        </div>

        <!-- 삭제 -->
        <button onclick="event.stopPropagation();window._adminConfirmDeleteUser('${u.uid}','${u.nick}')" style="margin-top:8px;padding:4px 10px;border:1px solid #fecaca;border-radius:8px;background:#fff5f5;color:#ef4444;font-size:11px;font-weight:600;cursor:pointer;">삭제</button>
      </div>
    </div>
  `;
}

// ── 코호트 테이블 빌드 ──
function _buildCohortTable(realAccs, workoutMap, dateKeys30) {
  if (dateKeys30.length < 14) return { rows: [], weekLabels: [] };

  // 주차 단위로 그룹핑
  const now = new Date(TODAY);
  const weekMs = 7 * 86400000;
  const weeksBack = Math.min(Math.floor(dateKeys30.length / 7), 4);
  const weekLabels = [];
  for (let w = 0; w < weeksBack; w++) weekLabels.push(`W${w + 1}`);

  // 가입 주차별 유저 그룹핑
  const cohorts = {};
  for (const acc of realAccs) {
    const ts = acc.createdAt || acc.lastLoginAt;
    if (!ts) continue;
    const weeksAgo = Math.floor((now.getTime() - ts) / weekMs);
    const cohortKey = `${weeksAgo}주 전`;
    if (weeksAgo > 8) continue;
    if (!cohorts[cohortKey]) cohorts[cohortKey] = { label: cohortKey, users: [], weeksAgo };
    cohorts[cohortKey].users.push(acc.id);
  }

  // 각 코호트별, 각 주에 활동한 유저 비율 (workoutMap 기반)
  const rows = Object.values(cohorts).sort((a, b) => b.weeksAgo - a.weeksAgo).map(cohort => {
    const cells = [];
    for (let w = 0; w < weeksBack; w++) {
      const weekStart = w * 7;
      const weekEnd = Math.min((w + 1) * 7, dateKeys30.length);

      const activeInWeek = new Set();
      for (let d = weekStart; d < weekEnd; d++) {
        const wk = workoutMap[dateKeys30[d]] || {};
        for (const uid of cohort.users) {
          if (wk[uid]?.any) activeInWeek.add(uid);
        }
      }

      cells.push(cohort.users.length > 0 ? Math.round((activeInWeek.size / cohort.users.length) * 100) : null);
    }
    return { label: cohort.label, count: cohort.users.length, cells };
  });

  return { rows, weekLabels };
}

function _cohortColor(pct) {
  if (pct === null) return 'transparent';
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#86efac';
  if (pct >= 40) return '#fbbf24';
  if (pct >= 20) return '#fdba74';
  return '#fca5a5';
}

// ── CSS: 유저 상세 토글 ──
const style = document.createElement('style');
style.textContent = `
  .admin-user-detail--open { display:block !important; }
`;
if (!document.getElementById('admin-users-css')) {
  style.id = 'admin-users-css';
  document.head.appendChild(style);
}
