// ================================================================
// admin/admin-social.js — 소셜 ("커뮤니티 건강" 뷰)
// ================================================================

import { TODAY } from '../data.js';
import {
  getAccountList, getAllGuilds, createGuild, updateGuild, deleteGuild,
  adminAddGuildMember, adminRemoveGuildMember,
} from '../data.js';
import { dk, daysAgo, fmtDate, nameResolver, CARD_STYLE, SECTION_TITLE } from './admin-utils.js';
import { renderSocialStacked } from './admin-charts.js';

function _escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _enc(value) {
  return encodeURIComponent(String(value || ''));
}

function _readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let _guildAdminUsers = [];
let _guildMemberManagerState = null;

function _displayName(acc) {
  return acc?.nickname || `${acc?.lastName || ''}${acc?.firstName || ''}` || acc?.id || '이름없음';
}

async function _renderGuildAdminPanel() {
  const wrap = document.getElementById('admin-guild-admin');
  if (!wrap) return;

  const [guilds, accounts] = await Promise.all([
    getAllGuilds(),
    getAccountList(),
  ]);
  _guildAdminUsers = accounts.filter((acc) => acc.id && !acc.id.includes('(guest)'));

  const sortedGuilds = [...guilds].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!sortedGuilds.length) {
    wrap.innerHTML = `
      <div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:16px 0;">
        생성된 길드가 없어요
      </div>
    `;
    return;
  }

  wrap.innerHTML = sortedGuilds.map((guild) => {
    const guildId = guild.id || guild.name;
    const members = _guildAdminUsers.filter((acc) => (acc.guilds || []).includes(guild.id || guild.name));
    const leader = _guildAdminUsers.find((acc) => acc.id === guild.leader || acc.id === guild.createdBy);
    const leaderName = leader ? (leader.nickname || `${leader.lastName || ''}${leader.firstName || ''}` || leader.id) : '미정';
    return `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="width:40px;height:40px;border-radius:12px;background:var(--surface2,#F2F4F6);display:flex;align-items:center;justify-content:center;font-size:20px;overflow:hidden;flex-shrink:0;">
            ${String(guild.icon || '🏠').startsWith('data:')
              ? `<img src="${guild.icon}" style="width:100%;height:100%;object-fit:cover;">`
              : _escapeHtml(guild.icon || '🏠')}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <div style="font-size:14px;font-weight:700;color:var(--text);">${_escapeHtml(guild.name)}</div>
              <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:var(--surface2,#F2F4F6);color:var(--text-tertiary);">${members.length}명</span>
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">리더 ${_escapeHtml(leaderName)}</div>
            ${guild.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">${_escapeHtml(guild.description)}</div>` : ''}
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
              ${members.slice(0, 8).map((member) => `
                <span style="font-size:10px;padding:4px 8px;border-radius:999px;background:rgba(250,52,44,0.08);color:#fa342c;font-weight:600;">
                  ${_escapeHtml(member.nickname || `${member.lastName || ''}${member.firstName || ''}` || member.id)}
                </span>
              `).join('') || '<span style="font-size:11px;color:var(--text-tertiary);">멤버 없음</span>'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
          <button onclick="window._adminOpenGuildEditor('${_enc(guildId)}')" style="padding:6px 10px;border:none;border-radius:8px;background:#3182F6;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">편집</button>
          <button type="button" data-guild-members="${_enc(guildId)}" style="padding:6px 10px;border:none;border-radius:8px;background:#10B981;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">멤버 관리</button>
          <button onclick="window._adminDeleteGuild('${_enc(guildId)}')" style="padding:6px 10px;border:none;border-radius:8px;background:#EF4444;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">삭제</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.onclick = (event) => {
    const button = event.target.closest('[data-guild-members]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const guildIdEncoded = button.getAttribute('data-guild-members') || '';
    window._adminOpenGuildMembers(guildIdEncoded);
  };
}

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

    <!-- 길드 관리 -->
    <div style="${CARD_STYLE}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="${SECTION_TITLE};margin-bottom:0;">길드 관리</div>
        <button onclick="window._adminOpenGuildEditor('')" style="padding:6px 14px;border:none;border-radius:8px;background:#fa342c;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">+ 새 길드</button>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;">길드 소개, 아이콘, 리더, 멤버를 여기서 관리합니다.</div>
      <div id="admin-guild-admin">
        <div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px;">불러오는 중...</div>
      </div>
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

  _renderGuildAdminPanel().catch((e) => {
    console.error('[admin] guild panel:', e);
    const wrap = document.getElementById('admin-guild-admin');
    if (wrap) wrap.innerHTML = '<div style="font-size:12px;color:#ef4444;text-align:center;padding:12px;">길드 데이터를 불러오지 못했어요</div>';
  });
}

window._adminOpenGuildEditor = async function(guildIdEncoded) {
  const guildId = decodeURIComponent(guildIdEncoded || '');
  const guilds = await getAllGuilds();
  const guild = guilds.find((item) => (item.id || item.name) === guildId) || null;

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'dynamic-modal';
  document.body.appendChild(modal);
  modal.innerHTML = `
    <div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
      <div class="modal-sheet" style="max-width:440px;padding:24px;" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:16px;">${guild ? '길드 편집' : '새 길드 만들기'}</div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">길드명</label>
          <input id="guild-edit-name" type="text" value="${_escapeHtml(guild?.name || '')}" ${guild ? 'disabled' : ''} placeholder="예: 관리사무소" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;color:var(--text);background:${guild ? 'var(--surface2,#F2F4F6)' : 'var(--surface)'};outline:none;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">대표 사진</label>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:54px;height:54px;border-radius:16px;background:var(--surface2,#F2F4F6);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:24px;flex-shrink:0;">
              ${String(guild?.icon || '🏠').startsWith('data:') ? `<img src="${guild.icon}" style="width:100%;height:100%;object-fit:cover;">` : _escapeHtml(guild?.icon || '🏠')}
            </div>
            <input id="guild-edit-image-file" type="file" accept="image/*" style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);box-sizing:border-box;">
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;">이미지를 선택하지 않으면 기존 대표 사진을 유지합니다.</div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">소개</label>
          <textarea id="guild-edit-desc" style="width:100%;min-height:100px;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;resize:vertical;font-family:inherit;box-sizing:border-box;line-height:1.6;" placeholder="길드 소개를 적어주세요">${_escapeHtml(guild?.description || '')}</textarea>
        </div>
        <div style="display:flex;gap:8px;">
          <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
          <button onclick="window._adminSaveGuildEditor('${_enc(guildId || '')}')" style="flex:2;padding:14px;border:none;border-radius:12px;background:#fa342c;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">저장</button>
        </div>
      </div>
    </div>
  `;
};

window._adminSaveGuildEditor = async function(originalGuildIdEncoded) {
  const originalGuildId = decodeURIComponent(originalGuildIdEncoded || '');
  const name = document.getElementById('guild-edit-name')?.value.trim();
  const description = document.getElementById('guild-edit-desc')?.value.trim();
  const imageFile = document.getElementById('guild-edit-image-file')?.files?.[0] || null;

  if (!name) {
    alert('길드명을 입력하세요.');
    return;
  }

  const icon = imageFile ? await _readFileAsDataUrl(imageFile) : null;

  if (!originalGuildId) {
    const currentUsers = await getAccountList();
    const leaderId = currentUsers.find((acc) => !acc.id.includes('(guest)'))?.id;
    if (!leaderId) {
      alert('리더로 지정할 사용자가 없어요.');
      return;
    }
    await createGuild(name, leaderId);
    await updateGuild(name, { icon: icon || '🏠', description, memberCount: 0 });
  } else {
    const updates = { description };
    if (icon) updates.icon = icon;
    await updateGuild(originalGuildId, updates);
  }

  document.getElementById('dynamic-modal')?.remove();
  await _renderGuildAdminPanel();
};

window._adminDeleteGuild = async function(guildIdEncoded) {
  const guildId = decodeURIComponent(guildIdEncoded || '');
  if (!confirm(`${guildId} 길드를 삭제할까요? 멤버 계정에서도 길드 정보가 제거됩니다.`)) return;
  await deleteGuild(guildId);
  await _renderGuildAdminPanel();
};

function _renderGuildMemberRows() {
  const listEl = document.getElementById('guild-member-list');
  const searchEl = document.getElementById('guild-member-search');
  if (!listEl || !_guildMemberManagerState) return;

  const q = (searchEl?.value || '').trim().toLowerCase();
  const { allUsers, selectedUserIds, leaderId } = _guildMemberManagerState;
  const filtered = allUsers.filter((acc) => {
    if (!q) return true;
    const name = _displayName(acc).toLowerCase();
    const id = String(acc.id || '').toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  listEl.innerHTML = filtered.map((acc) => {
    const checked = selectedUserIds.has(acc.id);
    const isLeader = leaderId === acc.id;
    return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">
        <input type="checkbox" data-member-user-id="${_escapeHtml(acc.id)}" ${checked ? 'checked' : ''} style="width:18px;height:18px;accent-color:#10B981;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text);">${_escapeHtml(_displayName(acc))}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${_escapeHtml(acc.id)}${isLeader ? ' · 현재 리더' : ''}</div>
        </div>
        <button type="button" data-leader-user-id="${_escapeHtml(acc.id)}" style="padding:6px 10px;border:none;border-radius:8px;background:${isLeader ? '#1D4ED8' : '#3182F6'};color:#fff;font-size:11px;font-weight:700;cursor:pointer;">${isLeader ? '리더' : '리더 지정'}</button>
      </label>
    `;
  }).join('') || '<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:12px 0;">검색 결과가 없어요</div>';

  listEl.querySelectorAll('[data-member-user-id]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const userId = checkbox.getAttribute('data-member-user-id');
      if (!userId || !_guildMemberManagerState) return;
      if (checkbox.checked) _guildMemberManagerState.selectedUserIds.add(userId);
      else _guildMemberManagerState.selectedUserIds.delete(userId);
      const countEl = document.getElementById('guild-member-selected-count');
      if (countEl) countEl.textContent = String(_guildMemberManagerState.selectedUserIds.size);
    });
  });

  listEl.querySelectorAll('[data-leader-user-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const userId = button.getAttribute('data-leader-user-id');
      if (!userId || !_guildMemberManagerState) return;
      _guildMemberManagerState.leaderId = userId;
      _guildMemberManagerState.selectedUserIds.add(userId);
      const countEl = document.getElementById('guild-member-selected-count');
      if (countEl) countEl.textContent = String(_guildMemberManagerState.selectedUserIds.size);
      _renderGuildMemberRows();
    });
  });
}

window._adminOpenGuildMembers = async function(guildIdEncoded) {
  const guildId = decodeURIComponent(guildIdEncoded || '');
  const [accounts, guilds] = await Promise.all([getAccountList(), getAllGuilds()]);
  const guild = guilds.find((item) => (item.id || item.name) === guildId);
  const allUsers = accounts
    .filter((acc) => acc.id && !acc.id.includes('(guest)'))
    .sort((a, b) => _displayName(a).localeCompare(_displayName(b)));
  const selectedUserIds = new Set(
    allUsers.filter((acc) => (acc.guilds || []).includes(guildId)).map((acc) => acc.id),
  );

  _guildMemberManagerState = {
    guildId,
    allUsers,
    selectedUserIds,
    originalUserIds: new Set(selectedUserIds),
    leaderId: guild?.leader || guild?.createdBy || '',
  };

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'dynamic-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" style="display:flex;z-index:10000;" id="guild-member-backdrop">
      <div class="modal-sheet" style="max-width:480px;padding:24px;max-height:90vh;overflow-y:auto;">
        <div class="sheet-handle"></div>
        <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:12px;">${_escapeHtml(guild?.name || guildId)} 멤버 관리</div>
        <div style="margin-bottom:12px;padding:12px;border-radius:12px;background:var(--surface2,#F2F4F6);font-size:12px;color:var(--text-secondary);line-height:1.6;">
          체크된 사용자가 이 길드에 포함됩니다. 리더 지정 버튼을 누르면 해당 사용자가 리더가 되고 자동으로 멤버에도 포함됩니다.<br>
          현재 선택 <b id="guild-member-selected-count">${selectedUserIds.size}</b>명
        </div>
        <input id="guild-member-search" type="text" placeholder="이름 또는 별명으로 검색" style="width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:13px;color:var(--text);background:var(--surface);outline:none;box-sizing:border-box;margin-bottom:12px;">
        <div id="guild-member-list"></div>
        <div style="display:flex;gap:8px;margin-top:16px;">
          <button type="button" id="guild-member-cancel" style="flex:1;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">취소</button>
          <button type="button" id="guild-member-save" style="flex:2;padding:14px;border:none;border-radius:12px;background:#10B981;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">저장</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const backdrop = document.getElementById('guild-member-backdrop');
  backdrop?.addEventListener('click', (event) => {
    if (event.target === backdrop) document.getElementById('dynamic-modal')?.remove();
  });
  document.getElementById('guild-member-cancel')?.addEventListener('click', () => {
    document.getElementById('dynamic-modal')?.remove();
  });
  document.getElementById('guild-member-search')?.addEventListener('input', _renderGuildMemberRows);
  document.getElementById('guild-member-save')?.addEventListener('click', async () => {
    const state = _guildMemberManagerState;
    if (!state) return;
    const added = [...state.selectedUserIds].filter((id) => !state.originalUserIds.has(id));
    const removed = [...state.originalUserIds].filter((id) => !state.selectedUserIds.has(id));

    for (const userId of added) await adminAddGuildMember(state.guildId, userId);
    for (const userId of removed) await adminRemoveGuildMember(state.guildId, userId);

    if (state.leaderId) {
      await updateGuild(state.guildId, { leader: state.leaderId });
    }

    document.getElementById('dynamic-modal')?.remove();
    _guildMemberManagerState = null;
    await _renderGuildAdminPanel();
  });

  _renderGuildMemberRows();
};
