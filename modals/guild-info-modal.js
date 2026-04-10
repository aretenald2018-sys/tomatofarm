export const MODAL_HTML = `
<div class="modal-backdrop" id="guild-info-modal" style="display:none;" onclick="closeGuildInfoModal(event)">
  <div class="modal-sheet" style="max-width:460px;">
    <div class="sheet-handle"></div>
    <div id="guild-info-content" style="padding-bottom:8px;"></div>
  </div>
</div>
`;

function _escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getWeekStreak(members) {
  if (!members.length) return 0;
  return members.reduce((min, member) => Math.min(min, member.activeDays || 0), 7);
}

function _displayName(account) {
  if (!account) return '미정';
  return account.nickname || `${account.lastName || ''}${account.firstName || ''}` || account.id;
}

function _personLabel(account) {
  if (!account) return '';
  return `${account.lastName || ''}${account.firstName || ''}`.trim();
}

function _todayDateKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

async function _resizeGuildImage(file) {
  const dataUrl = await _readFileAsDataUrl(file);
  if (!dataUrl) return '';
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function _renderGuildInfo(guildName) {
  const content = document.getElementById('guild-info-content');
  if (!content) return;

  const {
    getAllGuilds, getAccountList, getCurrentUser, getGlobalGuildWeeklyRanking,
    updateGuild, inviteUserToGuild, isAdmin, _isMySocialId,
  } = await import('../data.js');

  const user = getCurrentUser();
  const [guilds, accounts, guildRanking] = await Promise.all([
    getAllGuilds(),
    getAccountList(),
    getGlobalGuildWeeklyRanking(),
  ]);

  const guildMeta = guilds.find((g) => g.name === guildName || g.id === guildName);
  const members = accounts.filter((acc) => (acc.guilds || []).includes(guildName));
  const rankingList = guildRanking?.rankings || [];
  const rankingItem = rankingList.find((item) => item.guildId === guildName || item.guildName === guildName);
  const guildMembers = (rankingItem?.members || members.map((acc) => ({
    userId: acc.id,
    name: _displayName(acc),
    activeDays: 0,
  }))).sort((a, b) => (b.activeDays || 0) - (a.activeDays || 0));

  const leaderId = guildMeta?.leader || guildMeta?.createdBy;
  const leaderAcc = accounts.find((acc) => acc.id === leaderId);
  const leaderName = _displayName(leaderAcc);
  const guildIcon = guildMeta?.icon || '🏠';
  const memberCount = rankingItem?.memberCount || guildMeta?.memberCount || members.length;
  const avgActiveDays = typeof rankingItem?.avgActiveDays === 'number'
    ? rankingItem.avgActiveDays.toFixed(1)
    : (guildMembers.length ? (guildMembers.reduce((sum, member) => sum + (member.activeDays || 0), 0) / guildMembers.length).toFixed(1) : '0.0');
  const rank = rankingList.findIndex((item) => item.guildId === guildName || item.guildName === guildName) + 1;
  const weekStreak = _getWeekStreak(guildMembers);
  const isMember = !!user && (user.guilds || []).includes(guildName);
  const isPending = !!user && (user.pendingGuilds || []).includes(guildName);
  const canManage = !!user && (_isMySocialId?.(leaderId) || user.id === leaderId || isAdmin());
  const actionLabel = isPending ? '가입 승인 대기 중' : '가입 신청';
  const actionDisabled = isPending ? 'disabled' : '';
  const actionFn = "openGuildModal(); closeGuildInfoModal();";
  const avatarHtml = guildMembers.slice(0, 5).map((member) => {
    const initial = _escapeHtml((member.name || '?').charAt(0));
    return `<div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text);margin-left:-6px;border:2px solid var(--surface);">${initial}</div>`;
  }).join('');
  const barsHtml = guildMembers.map((member) => {
    const width = Math.max(8, Math.round(((member.activeDays || 0) / 7) * 100));
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="min-width:72px;font-size:13px;font-weight:600;color:var(--text);">${_escapeHtml(member.name)}</div>
        <div style="flex:1;height:8px;border-radius:999px;background:var(--surface2);overflow:hidden;">
          <div style="width:${width}%;height:100%;background:linear-gradient(90deg,#fa342c,#ff8a3d);"></div>
        </div>
        <div style="min-width:34px;text-align:right;font-size:12px;color:var(--text-secondary);">${member.activeDays || 0}일</div>
      </div>
    `;
  }).join('') || '<div style="font-size:12px;color:var(--text-tertiary);padding:12px 0;">표시할 멤버가 없어요</div>';

  const inviteableAccounts = accounts
    .filter((acc) => acc.id && !acc.id.includes('(guest)') && !(acc.guilds || []).includes(guildName))
    .sort((a, b) => _displayName(a).localeCompare(_displayName(b)));

  content.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
        <div style="position:relative;width:64px;height:64px;flex-shrink:0;">
          <div style="width:64px;height:64px;border-radius:18px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:32px;overflow:hidden;">
            ${String(guildIcon).startsWith('data:') ? `<img src="${guildIcon}" style="width:100%;height:100%;object-fit:cover;">` : guildIcon}
          </div>
          ${canManage ? `
            <button type="button" onclick="openGuildPhotoPicker()" style="position:absolute;right:-4px;bottom:-4px;width:26px;height:26px;border:none;border-radius:50%;background:linear-gradient(135deg,#fa342c,#ff8a3d);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(250,52,44,0.24);cursor:pointer;">
              <span style="font-size:16px;font-weight:700;line-height:1;">+</span>
            </button>
          ` : ''}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:20px;font-weight:800;color:var(--text);line-height:1.2;">${_escapeHtml(guildName)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">리더 ${_escapeHtml(leaderName)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${canManage ? `<button class="tds-btn secondary md" type="button" onclick="toggleGuildInviteSection()">멤버 초대</button>` : ''}
        <button class="tds-btn ghost md" type="button" onclick="closeGuildInfoModal()">닫기</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
      <div style="padding:10px;border-radius:12px;background:var(--surface2);text-align:center;">
        <div style="font-size:11px;color:var(--text-tertiary);">멤버</div>
        <div style="font-size:16px;font-weight:800;color:var(--text);">${memberCount}명</div>
      </div>
      <div style="padding:10px;border-radius:12px;background:var(--surface2);text-align:center;">
        <div style="font-size:11px;color:var(--text-tertiary);">평균 활동</div>
        <div style="font-size:16px;font-weight:800;color:var(--text);">${avgActiveDays}일</div>
      </div>
      <div style="padding:10px;border-radius:12px;background:var(--surface2);text-align:center;">
        <div style="font-size:11px;color:var(--text-tertiary);">랭킹</div>
        <div style="font-size:16px;font-weight:800;color:var(--text);">${rank > 0 ? `${rank}위` : '-'}</div>
      </div>
    </div>

    <div style="margin-bottom:12px;padding:12px 14px;border-radius:12px;background:var(--surface2);font-size:13px;line-height:1.6;color:var(--text-secondary);">
      ${_escapeHtml(guildMeta?.description || '아직 길드 소개가 없어요.')}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,rgba(250,52,44,0.08),rgba(255,138,61,0.12));">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text);">이번 주 전원 활동 스트릭</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">이번 주 전원 활동 ${weekStreak}일째</div>
      </div>
      <div style="display:flex;align-items:center;padding-left:6px;">${avatarHtml}</div>
    </div>

    ${canManage ? `
      <div id="guild-invite-section" style="display:none;margin-bottom:12px;padding:12px;border-radius:14px;background:var(--surface2);">
        <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;">이름 또는 별명으로 초대</div>
        <input id="guild-invite-query" type="text" placeholder="예: 김태우 / 별명" oninput="searchGuildInviteCandidates('${String(guildName).replace(/'/g, "\\'")}')" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);font-size:13px;box-sizing:border-box;">
        <div id="guild-invite-results" style="margin-top:8px;max-height:180px;overflow-y:auto;">
          ${inviteableAccounts.slice(0, 8).map((acc) => `
            <button onclick="sendGuildInvite('${String(guildName).replace(/'/g, "\\'")}','${String(acc.id).replace(/'/g, "\\'")}')" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);cursor:pointer;">
              <span>${_escapeHtml(_displayName(acc))}</span>
              <span style="font-size:11px;color:var(--text-tertiary);">${_escapeHtml(_personLabel(acc) || _displayName(acc))}</span>
            </button>
          `).join('') || '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0;">초대 가능한 사용자가 없어요</div>'}
        </div>
      </div>
    ` : ''}

    <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">멤버 활동</div>
    <div style="margin-bottom:14px;">${barsHtml}</div>

    ${!isMember ? `
      <div style="display:flex;gap:8px;">
        <button class="tds-btn fill md" style="flex:1;" ${actionDisabled} onclick="${actionFn}">${actionLabel}</button>
      </div>
    ` : ''}
  `;

  window.__guildInviteAccounts = inviteableAccounts;
  window.__guildInfoName = guildName;
  window.__guildInfoTodayKey = _todayDateKey();
}

export async function openGuildInfoModal(guildName) {
  const modal = document.getElementById('guild-info-modal');
  if (!modal || !guildName) return;
  await _renderGuildInfo(guildName);
  modal.style.display = 'flex';
}

export function closeGuildInfoModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('guild-info-modal');
  if (modal) modal.style.display = 'none';
}

window.openGuildPhotoPicker = function() {
  const temp = document.createElement('input');
  temp.type = 'file';
  temp.accept = 'image/*';
  temp.addEventListener('change', async () => {
    const guildName = window.__guildInfoName;
    const file = temp.files?.[0];
    if (!guildName || !file) return;
    const { updateGuild } = await import('../data.js');
    const icon = await _resizeGuildImage(file);
    if (!icon) return;
    await updateGuild(guildName, { icon });
    await _renderGuildInfo(guildName);
  }, { once: true });
  temp.click();
};

window.toggleGuildInviteSection = function() {
  const el = document.getElementById('guild-invite-section');
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

window.removeGuildPhoto = async function(guildName) {
  const { updateGuild } = await import('../data.js');
  await updateGuild(guildName, { icon: '🏠' });
  await _renderGuildInfo(guildName);
};

window.searchGuildInviteCandidates = function(guildName) {
  const query = document.getElementById('guild-invite-query')?.value?.trim().toLowerCase() || '';
  const wrap = document.getElementById('guild-invite-results');
  if (!wrap) return;
  const items = (window.__guildInviteAccounts || []).filter((acc) => {
    if (!query) return true;
    const name = _displayName(acc).toLowerCase();
    const id = String(acc.id || '').toLowerCase();
    return name.includes(query) || id.includes(query);
  });
  wrap.innerHTML = items.slice(0, 12).map((acc) => `
    <button onclick="sendGuildInvite('${String(guildName).replace(/'/g, "\\'")}','${String(acc.id).replace(/'/g, "\\'")}')" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);cursor:pointer;">
      <span>${_escapeHtml(_displayName(acc))}</span>
      <span style="font-size:11px;color:var(--text-tertiary);">${_escapeHtml(_personLabel(acc) || _displayName(acc))}</span>
    </button>
  `).join('') || '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0;">검색 결과가 없어요</div>';
};

window.sendGuildInvite = async function(guildName, userId) {
  const { inviteUserToGuild, getCurrentUser } = await import('../data.js');
  const inviter = getCurrentUser();
  const inviterName = _displayName(inviter);
  const result = await inviteUserToGuild(guildName, userId, inviterName);
  if (result?.error) {
    alert(result.error);
    return;
  }
  alert('길드 초대를 보냈어요.');
  await _renderGuildInfo(guildName);
};

window.openGuildInfoModal = openGuildInfoModal;
window.closeGuildInfoModal = closeGuildInfoModal;
