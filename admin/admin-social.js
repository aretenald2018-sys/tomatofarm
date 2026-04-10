// ================================================================
// admin/admin-social.js — 소셜 ("커뮤니티 건강" 뷰)
// ================================================================

import { TODAY } from '../data.js';
import { dk, daysAgo, fmtDate, nameResolver, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';
import { renderSocialStacked } from './admin-charts.js';

/**
 * 소셜 섹션 렌더
 * @param {HTMLElement} container
 * @param {Object} data - 전체 adminData
 */
export function renderSocialSection(container, data) {
  const { realAccs, accs, frs, gbs, lks, analytics } = data;
  const _name = nameResolver(accs);

  // ── 소셜 요약 카드 ──
  const friendships = frs.filter(f => f.status === 'accepted').length;
  const pendingReqs = frs.filter(f => f.status === 'pending').length;

  // 유저별 친구 수
  const friendCounts = {};
  for (const acc of realAccs) {
    friendCounts[acc.id] = frs.filter(f => f.status === 'accepted' && (f.from === acc.id || f.to === acc.id)).length;
  }
  const avgFriends = realAccs.length > 0
    ? (Object.values(friendCounts).reduce((s, c) => s + c, 0) / realAccs.length).toFixed(1)
    : '0';
  const isolatedUsers = realAccs.filter(a => (friendCounts[a.id] || 0) === 0);

  // ── 14일 소셜 인터랙션 트렌드 (날짜별) ──
  const trendLabels = [];
  const reactionData = [];
  const guestbookData = [];

  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i);
    const dayStart = new Date(d).setHours(0,0,0,0);
    const dayEnd = dayStart + 86400000;
    trendLabels.push(`${d.getMonth()+1}/${d.getDate()}`);
    reactionData.push(lks.filter(l => l.createdAt >= dayStart && l.createdAt < dayEnd).length);
    guestbookData.push(gbs.filter(g => g.createdAt >= dayStart && g.createdAt < dayEnd).length);
  }

  // ── 인터랙션 매트릭스 (유저×유저) ──
  const userIds = realAccs.map(a => a.id);
  const matrix = {};
  for (const uid of userIds) {
    matrix[uid] = {};
    for (const uid2 of userIds) matrix[uid][uid2] = 0;
  }
  // 좋아요
  for (const l of lks) {
    if (matrix[l.from]?.[l.to] !== undefined) matrix[l.from][l.to]++;
    if (matrix[l.to]?.[l.from] !== undefined) matrix[l.to][l.from]++;
  }
  // 방명록
  for (const g of gbs) {
    if (matrix[g.from]?.[g.to] !== undefined) matrix[g.from][g.to]++;
    if (matrix[g.to]?.[g.from] !== undefined) matrix[g.to][g.from]++;
  }

  // 매트릭스 최대값 (색 강도 계산용)
  let matrixMax = 1;
  for (const row of Object.values(matrix)) {
    for (const val of Object.values(row)) {
      if (val > matrixMax) matrixMax = val;
    }
  }

  // ── 최근 소셜 활동 (통합 타임라인) ──
  const recentSocial = [];
  lks.forEach(l => recentSocial.push({
    time: l.createdAt || 0,
    type: 'reaction',
    text: `${_name(l.from)} → ${_name(l.to)} ${l.emoji || '👏'}`,
  }));
  gbs.forEach(g => recentSocial.push({
    time: g.createdAt || 0,
    type: 'guestbook',
    text: `${g.fromName || _name(g.from)} → ${_name(g.to)} "${(g.message || '').slice(0, 30)}${(g.message || '').length > 30 ? '…' : ''}"`,
  }));
  recentSocial.sort((a, b) => b.time - a.time);

  // ── HTML ──
  container.innerHTML = `
    <!-- 소셜 요약 -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:16px;">
      ${[
        { label: '이웃 관계', value: friendships, sub: pendingReqs > 0 ? `대기 ${pendingReqs}건` : '' },
        { label: '평균 이웃 수', value: avgFriends },
        { label: '고립 유저 (0명)', value: isolatedUsers.length, color: isolatedUsers.length > 0 ? '#ef4444' : '#22c55e' },
        { label: '총 리액션', value: lks.length },
      ].map(m => `
        <div style="${CARD_STYLE};margin-bottom:0;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">${m.label}</div>
          <div style="font-size:22px;font-weight:800;color:${m.color || 'var(--text)'};">${m.value}</div>
          ${m.sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px;">${m.sub}</div>` : ''}
        </div>
      `).join('')}
    </div>

    <!-- 고립 유저 명단 -->
    ${isolatedUsers.length > 0 ? `
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">고립 유저 (이웃 0명)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${isolatedUsers.map(a => `
          <span style="font-size:11px;padding:4px 10px;border-radius:8px;background:#FEF2F2;color:#ef4444;font-weight:500;">${a.nickname || a.lastName + a.firstName}</span>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- 14일 소셜 트렌드 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">14일 소셜 인터랙션 트렌드</div>
      <div id="admin-social-trend-wrap" style="height:180px;"></div>
    </div>

    <!-- 인터랙션 매트릭스 -->
    ${userIds.length <= 30 ? `
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">인터랙션 매트릭스</div>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-size:9px;">
          <thead>
            <tr>
              <th style="padding:3px;"></th>
              ${userIds.map(uid => `<th style="padding:3px;writing-mode:vertical-lr;transform:rotate(180deg);color:var(--text-tertiary);font-weight:500;max-width:20px;overflow:hidden;">${_name(uid).slice(0, 3)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${userIds.map(fromId => `
              <tr>
                <td style="padding:3px;color:var(--text-tertiary);font-weight:500;white-space:nowrap;">${_name(fromId).slice(0, 4)}</td>
                ${userIds.map(toId => {
                  if (fromId === toId) return '<td style="padding:1px;"><div style="width:14px;height:14px;background:var(--surface2,#F2F4F6);border-radius:2px;"></div></td>';
                  const val = matrix[fromId][toId] || 0;
                  const intensity = val > 0 ? Math.max(0.15, val / matrixMax) : 0;
                  return `<td style="padding:1px;" title="${_name(fromId)}↔${_name(toId)}: ${val}회">
                    <div style="width:14px;height:14px;border-radius:2px;background:${val > 0 ? `rgba(250,52,44,${intensity})` : 'var(--surface2,#F2F4F6)'};${val > 0 ? 'cursor:help;' : ''}"></div>
                  </td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <span style="font-size:10px;color:var(--text-tertiary);">낮음</span>
        <div style="display:flex;gap:1px;">
          ${[0.15, 0.3, 0.5, 0.7, 1].map(o => `<div style="width:14px;height:8px;border-radius:2px;background:rgba(250,52,44,${o});"></div>`).join('')}
        </div>
        <span style="font-size:10px;color:var(--text-tertiary);">높음</span>
      </div>
    </div>` : ''}

    <!-- 최근 소셜 활동 -->
    <div style="${CARD_STYLE}">
      <div style="${SECTION_TITLE}">최근 소셜 활동</div>
      ${recentSocial.length === 0 ? '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">아직 없어요</div>' :
        recentSocial.slice(0, 20).map(s => `
          <div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);">
            <span style="width:6px;height:6px;border-radius:50%;background:${s.type === 'reaction' ? '#fa342c' : '#8b5cf6'};flex-shrink:0;"></span>
            <span style="font-size:12px;color:var(--text);flex:1;">${s.text}</span>
            <span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0;">${fmtDate(s.time)}</span>
          </div>
        `).join('')
      }
    </div>
  `;

  // 차트 렌더
  const trendWrap = document.getElementById('admin-social-trend-wrap');
  if (trendWrap) {
    renderSocialStacked(trendWrap, trendLabels, [
      { label: '리액션', data: reactionData },
      { label: '방명록', data: guestbookData },
    ]);
  }
}
