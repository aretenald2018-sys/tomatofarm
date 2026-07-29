// ================================================================
// social/guild-modal.js — 프로필의 길드 관리 모달 (길드 CRUD)
// ================================================================
// 길드 목록/멤버/아이콘/대표 길드 설정과 Firebase 동기화를 소유한다.
// 검색 입력 캐시는 social/guild-picker.js 의 guildPickerState 를 공유한다.
// ================================================================

import { showToast } from '../ui/toast.js';
import { confirmAction } from '../utils/confirm-modal.js';
import { guildPickerState } from './guild-picker.js';

let _guildModalGuilds = []; // [{name, status:'member'|'pending'}]
let _guildModalPrimary = null;
let _guildIconMap = {}; // guildName → icon emoji

const GUILD_ICON_OPTIONS = ['🏠','🏃','💪','🧘','🏋️','🚴','⚽','🎾','🏊','🥊','🧗','🎯','🔥','🌿','🍅','⭐'];

let _guildLeaderMap = {}; // guildName → leaderId
let _guildModalUserId = null;
let _guildModalSocialId = null; // 소셜 ID

// 현재 유저가 해당 길드의 길드장인지
export function _isMyGuildLeader(guildName) {
  const leader = _guildLeaderMap[guildName];
  if (!leader) return false;
  return leader === _guildModalUserId || leader === _guildModalSocialId;
}

export async function openGuildModal() {
  const { getCurrentUser, getAllGuilds } = await import('../data.js');
  const user = getCurrentUser();
  if (!user) return;
  _guildModalUserId = user.id;
  _guildModalSocialId = user.id;

  guildPickerState.allGuildsCache = await getAllGuilds();
  _guildIconMap = {};
  _guildLeaderMap = {};
  guildPickerState.allGuildsCache.forEach(g => {
    if (g.icon) _guildIconMap[g.name] = g.icon;
    if (g.leader || g.createdBy) _guildLeaderMap[g.name] = g.leader || g.createdBy;
  });

  _guildModalGuilds = [
    ...(user.guilds || []).map(g => ({ name: g, status: 'member' })),
    ...(user.pendingGuilds || []).map(g => ({ name: g, status: 'pending' })),
  ];
  _guildModalPrimary = user.primaryGuild || null;

  const modal = document.getElementById('guild-modal');
  if (modal) {
    modal.style.display = 'flex';
    _renderGuildModalList();
  }
}

export function closeGuildModal(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('guild-modal');
  if (modal) modal.style.display = 'none';
}

export function _closeOtherGuildPanels(targetGuildName, panelType) {
  _guildModalGuilds.forEach(g => {
    const safeId = g.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const membersEl = document.getElementById('gm-members-' + safeId);
    const iconEl = document.getElementById('gm-icon-picker-' + safeId);
    if (membersEl && !(panelType === 'members' && g.name === targetGuildName)) membersEl.style.display = 'none';
    if (iconEl && !(panelType === 'icon' && g.name === targetGuildName)) iconEl.style.display = 'none';
  });
}

export function _renderGuildModalList() {
  const list = document.getElementById('guild-modal-list');
  if (!list) return;
  if (!_guildModalGuilds.length) {
    list.innerHTML = '<div class="gm-empty-state">아직 소속 길드가 없어요</div>';
    return;
  }
  list.innerHTML = _guildModalGuilds.map(g => {
    const isPrimary = g.name === _guildModalPrimary;
    const iconVal = _guildIconMap[g.name] || '🏠';
    const isPhoto = iconVal.startsWith('data:');
    const iconDisplay = isPhoto
      ? `<img src="${iconVal}">`
      : iconVal;
    const safeName = g.name.replace(/'/g, "\\'");
    const starBtn = g.status === 'member'
      ? `<button class="gm-primary-btn${isPrimary ? ' is-active' : ''}" data-login-action="toggle-guild-primary" data-guild-name="${safeName}" title="대표 길드 설정">${isPrimary ? '★' : '☆'}</button>`
      : '';
    const amLeader = g.status === 'member' && _isMyGuildLeader(g.name);
    const leaderBadge = amLeader ? ' <span class="guild-leader-badge">👑 길드장</span>' : '';
    const badge = g.status === 'pending'
      ? '<span class="guild-chip-badge pending">승인 대기 중</span>'
      : '';
    const memberBtn = g.status === 'member'
      ? `<button class="gm-action-pill" type="button" data-login-action="toggle-guild-members" data-guild-name="${safeName}">멤버보기</button>`
      : '';
    const iconBtn = g.status === 'member'
      ? `<button class="gm-icon-btn" type="button" data-login-action="toggle-guild-icon-picker" data-guild-name="${safeName}" title="탭하여 아이콘 변경">${iconDisplay}<span class="gm-icon-edit-badge">✎</span></button>`
      : `<span class="gm-icon-static">${iconDisplay}</span>`;
    const safeId = g.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    return `<div>
      <div class="gm-guild-row">
        ${starBtn}${iconBtn}
        <div class="gm-guild-info"><span class="gm-guild-name${isPrimary ? ' is-primary' : ''}">${g.name}</span>${leaderBadge}${badge}</div>
        <div class="gm-guild-actions">
          ${memberBtn}
          <button class="gm-action-pill gm-remove" type="button" data-login-action="remove-guild" data-guild-name="${safeName}">삭제</button>
        </div>
      </div>
      <div class="gm-icon-picker" id="gm-icon-picker-${safeId}"></div>
      <div class="gm-members-panel" id="gm-members-${safeId}"></div>
    </div>`;
  }).join('');
}

export async function toggleGuildMembers(guildName) {
  const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  const el = document.getElementById('gm-members-' + safeId);
  if (!el) return;
  if (getComputedStyle(el).display !== 'none') { el.style.display = 'none'; return; }
  _closeOtherGuildPanels(guildName, 'members');

  // 길드원 목록 + 길드장 정보 로드
  const { getAccountList: gal, getGuildLeader, getCurrentUser } = await import('../data.js');
  const accounts = await gal();
  const members = accounts.filter(a => (a.guilds || []).includes(guildName));
  const leaderId = await getGuildLeader(guildName);
  const currentUser = getCurrentUser();
  const amILeader = currentUser && (leaderId === currentUser.id || leaderId === _guildModalSocialId);

  if (!members.length) {
    el.innerHTML = '<div class="gm-member-row"><span class="gm-member-name" style="color:var(--text-tertiary);">길드원이 없어요</span></div>';
  } else {
    el.innerHTML = members.map(m => {
      const isLeader = m.id === leaderId;
      const name = m.nickname || (m.lastName + m.firstName);
      const leaderBadge = isLeader ? '<span class="guild-leader-badge">👑 길드장</span>' : '';
      const isMe = currentUser && (m.id === currentUser.id || (m.id === _guildModalSocialId));
      let actionBtns = '';
      const safeName = guildName.replace(/'/g, "\\'");
      if (amILeader && !isMe) {
        const safeTargetId = m.id.replace(/'/g, "\\'");
        const safeTargetName = name.replace(/'/g, "\\'");
        actionBtns = `<div class="gm-member-actions"><button class="guild-member-action transfer" data-login-action="transfer-leadership" data-guild-name="${safeName}" data-target-id="${safeTargetId}" data-target-name="${safeTargetName}">위임</button>
          <button class="guild-member-action kick" data-login-action="kick-member" data-guild-name="${safeName}" data-target-id="${safeTargetId}" data-target-name="${safeTargetName}">강퇴</button></div>`;
      } else if (isMe && !isLeader) {
        actionBtns = `<div class="gm-member-actions"><button class="guild-member-action kick" data-login-action="leave-guild" data-guild-name="${safeName}">탈퇴</button></div>`;
      } else if (isMe && isLeader) {
        actionBtns = `<div class="gm-member-actions"><button class="guild-member-action kick" data-login-action="leader-leave-guild" data-guild-name="${safeName}">탈퇴</button></div>`;
      }
      return `<div class="gm-member-row">
        <div class="gm-member-avatar">${name.charAt(0)}</div>
        <span class="gm-member-name">${name}${leaderBadge ? ' ' + leaderBadge : ''}</span>
        ${actionBtns}
      </div>`;
    }).join('');
  }
  el.style.display = 'block';
}

// 길드장 위임
export async function transferLeadership(guildName, targetId, targetName) {
  const _ok = await (confirmAction({ title: '길드장 위임', message: `${targetName}님에게 길드장을 위임하시겠습니까?\n위임 후에는 되돌릴 수 없습니다.`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${targetName}님에게 길드장을 위임하시겠습니까?`)));
  if (!_ok) return;
  const { transferGuildLeadership } = await import('../data.js');
  const ok = await transferGuildLeadership(guildName, targetId);
  const { showToast: _st } = await import('../home/utils.js');
  if (ok) {
    _guildLeaderMap[guildName] = targetId;
    _st(`${targetName}님에게 길드장을 위임했어요`, 3000, 'success');
    _renderGuildModalList();
    // 멤버 목록 새로고침
    const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const el = document.getElementById('gm-members-' + safeId);
    if (el) { el.style.display = 'none'; toggleGuildMembers(guildName); }
  } else {
    _st('위임에 실패했어요', 3000, 'error');
  }
}

// 길드원 강퇴
export async function kickMember(guildName, targetId, targetName) {
  const _ok2 = await (confirmAction({ title: '길드원 강퇴', message: `정말 ${targetName}님을 강퇴하시겠습니까?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`정말 ${targetName}님을 강퇴하시겠습니까?`)));
  if (!_ok2) return;
  const { kickGuildMember } = await import('../data.js');
  const ok = await kickGuildMember(guildName, targetId);
  const { showToast: _st } = await import('../home/utils.js');
  if (ok) {
    _st(`${targetName}님을 내보냈어요`, 3000, 'success');
    // 멤버 목록 새로고침
    const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const el = document.getElementById('gm-members-' + safeId);
    if (el) { el.style.display = 'none'; toggleGuildMembers(guildName); }
  } else {
    _st('강퇴에 실패했어요. 길드장만 강퇴할 수 있어요.', 3000, 'error');
  }
}

// 일반 멤버 자진 탈퇴
export async function leaveGuildFromMembers(guildName) {
  const _ok3 = await (confirmAction({ title: '길드 탈퇴', message: `${guildName} 길드에서 탈퇴할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${guildName} 길드에서 탈퇴할까요?`)));
  if (!_ok3) return;
  const { getCurrentUser, saveAccount, setCurrentUser, updateGuildMemberCount } = await import('../data.js');
  const user = getCurrentUser();
  if (!user) return;
  user.guilds = (user.guilds || []).filter(g => g !== guildName);
  user.pendingGuilds = (user.pendingGuilds || []).filter(g => g !== guildName);
  if (user.primaryGuild === guildName) {
    user.primaryGuild = user.guilds.length > 0 ? user.guilds[0] : null;
  }
  await saveAccount(user);
  setCurrentUser(user);
  await updateGuildMemberCount(guildName, -1);
  // 모달 상태도 동기화
  _guildModalGuilds = _guildModalGuilds.filter(g => g.name !== guildName);
  if (_guildModalPrimary === guildName) {
    const first = _guildModalGuilds.find(g => g.status === 'member');
    _guildModalPrimary = first ? first.name : null;
  }
  _renderGuildModalList();
  const { showToast: _st } = await import('../home/utils.js');
  _st(`${guildName}에서 탈퇴했어요`, 3000, 'success');
}

// 길드장 탈퇴: 위임할 사람 선택 후 탈퇴
export async function leaderLeaveGuild(guildName) {
  const { getAccountList } = await import('../data.js');
  const accounts = await getAccountList();
  const members = accounts.filter(a => (a.guilds || []).includes(guildName) && a.id !== _guildModalUserId && a.id !== _guildModalSocialId);

  if (!members.length) {
    // 혼자 남은 길드장 → 그냥 탈퇴
    const _ok4 = await (confirmAction({ title: '길드 탈퇴', message: `${guildName}의 마지막 멤버입니다. 탈퇴하면 길드가 비게 됩니다. 탈퇴할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${guildName}의 마지막 멤버입니다. 탈퇴하면 길드가 비게 됩니다. 탈퇴할까요?`)));
    if (!_ok4) return;
    await leaveGuildFromMembers(guildName);
    return;
  }

  // 위임할 멤버 선택 UI
  const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  const el = document.getElementById('gm-members-' + safeId);
  if (!el) return;

  const safeName = guildName.replace(/'/g, "\\'");
  const memberList = members.map(m => {
    const name = m.nickname || (m.lastName + m.firstName);
    return `<button class="guild-member-action transfer" data-login-action="transfer-and-leave" data-guild-name="${safeName}" data-target-id="${m.id.replace(/"/g, '&quot;')}" data-target-name="${name.replace(/"/g, '&quot;')}">${name}에게 위임</button>`;
  }).join('');

  el.innerHTML = `<div class="gm-transfer-panel">
    <div class="gm-transfer-title">길드장을 위임할 멤버를 선택하세요</div>
    <div class="gm-transfer-list">${memberList}</div>
    <button class="guild-member-action kick" style="margin-top:8px;" data-login-action="toggle-guild-members" data-guild-name="${safeName}">취소</button>
  </div>`;
}

// 위임 후 탈퇴
export async function transferAndLeave(guildName, newLeaderId, newLeaderName) {
  const _ok5 = await (confirmAction({ title: '위임 후 탈퇴', message: `${newLeaderName}님에게 길드장을 위임하고 탈퇴할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${newLeaderName}님에게 길드장을 위임하고 탈퇴할까요?`)));
  if (!_ok5) return;
  const { transferGuildLeadership } = await import('../data.js');
  const ok = await transferGuildLeadership(guildName, newLeaderId);
  if (!ok) {
    const { showToast: _st } = await import('../home/utils.js');
    _st('위임에 실패했어요', 3000, 'error');
    return;
  }
  _guildLeaderMap[guildName] = newLeaderId;
  await leaveGuildFromMembers(guildName);
}

export function toggleGuildIconPicker(guildName) {
  const safeId = guildName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
  const el = document.getElementById('gm-icon-picker-' + safeId);
  if (!el) return;
  if (getComputedStyle(el).display !== 'none') { el.style.display = 'none'; return; }
  _closeOtherGuildPanels(guildName, 'icon');
  const safeName = guildName.replace(/'/g, "\\'");
  el.innerHTML = `<div class="gm-icon-grid">${
    GUILD_ICON_OPTIONS.map(ic =>
      `<button class="gm-icon-option${_guildIconMap[guildName] === ic ? ' is-selected' : ''}" type="button" data-login-action="select-guild-icon" data-guild-name="${safeName}" data-icon="${ic}">${ic}</button>`
    ).join('')
  }
  <label class="gm-icon-upload" title="사진 업로드">
    📷<input type="file" accept="image/*" data-login-change-action="upload-guild-photo" data-guild-name="${safeName}">
  </label>
  </div>`;
  el.style.display = 'block';
}

export async function selectGuildIcon(guildName, icon) {
  _guildIconMap[guildName] = icon;
  const { updateGuildIcon } = await import('../data.js');
  await updateGuildIcon(guildName, icon);
  _renderGuildModalList();
  const { showToast: _st } = await import('../home/utils.js');
  _st('아이콘이 변경되었어요', 2000, 'success');
}

export async function uploadGuildPhoto(guildName, input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    const { showToast: _st } = await import('../home/utils.js');
    _st('사진이 너무 커요. 500KB 이하로 올려주세요.', 3000, 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    // 32x32 크기로 리사이즈
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
      ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 64, 64);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      _guildIconMap[guildName] = dataUrl;
      const { updateGuildIcon } = await import('../data.js');
      await updateGuildIcon(guildName, dataUrl);
      _renderGuildModalList();
      const { showToast: _st } = await import('../home/utils.js');
      _st('사진이 설정되었어요', 2000, 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}


export async function toggleGuildPrimary(name) {
  const g = _guildModalGuilds.find(x => x.name === name);
  if (!g || g.status !== 'member') return;
  _guildModalPrimary = _guildModalPrimary === name ? null : name;
  _renderGuildModalList();
  await syncGuildModalState({ successMessage: _guildModalPrimary ? `${name}을(를) 대표 길드로 설정했어요` : '대표 길드 설정을 해제했어요', successType: 'success', refreshCache: false });
}

export async function removeGuildFromModal(name) {
  const guildEntry = _guildModalGuilds.find(g => g.name === name);
  const isPending = guildEntry && guildEntry.status === 'pending';

  if (!isPending) {
    // 정식 멤버 → 탈퇴
    if (_isMyGuildLeader(name)) {
      const { showToast: _st } = await import('../home/utils.js');
      _st('길드장은 탈퇴 전에 다른 멤버에게 길드장을 위임해주세요.', 3000, 'warning');
      return;
    }
    const _ok6 = await (confirmAction({ title: '길드 탈퇴', message: `${name} 길드에서 탈퇴할까요?\n길드 데이터는 유지됩니다.`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${name} 길드에서 탈퇴할까요?`)));
    if (!_ok6) return;
  } else {
    // 승인 대기중 → 가입신청 철회
    const _ok7 = await (confirmAction({ title: '가입신청 철회', message: `${name} 가입신청을 철회할까요?`, destructive: true, longPress: 2000 }) ?? Promise.resolve(confirm(`${name} 가입신청을 철회할까요?`)));
    if (!_ok7) return;

    // pending은 즉시 Firebase 반영 (저장하기 안 눌러도 적용)
    const { getCurrentUser, saveAccount, setCurrentUser, withdrawGuildJoinRequest } = await import('../data.js');
    const user = getCurrentUser();
    if (user) {
      user.pendingGuilds = (user.pendingGuilds || []).filter(g => g !== name);
      await saveAccount(user);
      setCurrentUser(user);
    }
    if (user) await withdrawGuildJoinRequest(name, user.id);
    const { showToast: _st } = await import('../home/utils.js');
    _st(`${name} 가입신청을 철회했어요`, 2500, 'info');
  }

  _guildModalGuilds = _guildModalGuilds.filter(g => g.name !== name);
  if (_guildModalPrimary === name) {
    const firstMember = _guildModalGuilds.find(g => g.status === 'member');
    _guildModalPrimary = firstMember ? firstMember.name : null;
  }
  _renderGuildModalList();
  await syncGuildModalState({ refreshCache: false });
}

export async function searchGuildsForModal(query) {
  const sugBox = document.getElementById('gm-guild-suggestions');
  if (!sugBox) return;
  const q = (query || '').trim().toLowerCase();
  const guilds = guildPickerState.allGuildsCache || [];
  // 빈 쿼리일 때도 전체 목록 표시 (드롭다운)
  const filtered = guilds.filter(g => (!q || g.name.toLowerCase().includes(q)) && !_guildModalGuilds.some(s => s.name === g.name));
  if (!filtered.length) { sugBox.style.display = 'none'; return; }
  sugBox.innerHTML = filtered.slice(0, 8).map(g =>
    `<div class="guild-suggest-item" data-login-action="select-guild-modal" data-guild-name="${g.name.replace(/"/g, '&quot;')}">
      <span>${g.name}</span><span style="font-size:11px;color:var(--text-tertiary);">${g.memberCount || 0}명</span>
    </div>`
  ).join('');
  sugBox.style.display = '';
}

export async function selectGuildForModal(name) {
  if (_guildModalGuilds.some(g => g.name === name)) return;
  const existing = (guildPickerState.allGuildsCache || []).find(g => g.name === name);
  if (!existing) return;
  _guildModalGuilds.push({ name, status: (existing && (existing.memberCount || 0) > 0) ? 'pending' : 'member', isNew: !existing });
  document.getElementById('gm-guild-input').value = '';
  document.getElementById('gm-guild-suggestions').style.display = 'none';
  _renderGuildModalList();
  await syncGuildModalState({ refreshCache: true });
}

export async function addGuildFromModal() {
  const input = document.getElementById('gm-guild-input');
  const name = (input?.value || '').trim();
  if (!name || _guildModalGuilds.some(g => g.name === name)) { if (input) input.value = ''; return; }
  const existing = (guildPickerState.allGuildsCache || []).find(g => g.name === name);
  if (!existing) {
    const { showToast: _st } = await import('../home/utils.js');
    _st('검색 결과에 없는 길드는 아래에서 새로 만들어주세요.', 2600, 'info');
    return;
  }
  _guildModalGuilds.push({ name, status: (existing.memberCount || 0) > 0 ? 'pending' : 'member', isNew: false });
  input.value = '';
  document.getElementById('gm-guild-suggestions').style.display = 'none';
  _renderGuildModalList();
  await syncGuildModalState({ refreshCache: true });
}

export async function createGuildFromModal() {
  const input = document.getElementById('gm-create-guild-input');
  const name = (input?.value || '').trim();
  if (!name) return;
  if (_guildModalGuilds.some(g => g.name === name)) {
    const { showToast: _st } = await import('../home/utils.js');
    _st('이미 목록에 담긴 길드예요.', 2200, 'info');
    if (input) input.value = '';
    return;
  }
  const existing = (guildPickerState.allGuildsCache || []).find(g => g.name === name);
  if (existing) {
    const { showToast: _st } = await import('../home/utils.js');
    _st('이미 있는 길드예요. 위에서 검색해서 추가해 주세요.', 2600, 'warning');
    if (input) input.value = '';
    return;
  }
  _guildModalGuilds.push({ name, status: 'member', isNew: true });
  if (input) input.value = '';
  _renderGuildModalList();
  await syncGuildModalState({ successMessage: `${name} 길드를 만들었어요.`, successType: 'success', refreshCache: true });
}

export async function syncGuildModalState(options = {}) {
  const { closeAfter = false, successMessage = '', successType = 'success', refreshCache = true } = options;
  const { getCurrentUser, saveAccount, setCurrentUser, createGuild, createGuildJoinRequest, updateGuildMemberCount, updateGuildLeader, withdrawGuildJoinRequest } = await import('../data.js');
  const user = getCurrentUser();
  if (!user) return;

  const oldGuilds = new Set(user.guilds || []);
  const oldPending = new Set(user.pendingGuilds || []);
  const newGuilds = [];
  const newPending = [];

  for (const g of _guildModalGuilds) {
    if (g.status === 'member') {
      newGuilds.push(g.name);
      // 새로 생성되는 길드
      if (g.isNew && !oldGuilds.has(g.name)) {
        await createGuild(g.name, user.id);
      }
      // 기존 길드에서 새로 가입 (이전에 없었던 것)
      if (!g.isNew && !oldGuilds.has(g.name)) {
        await updateGuildMemberCount(g.name, 1);
        const guildMeta = (guildPickerState.allGuildsCache || []).find(item => item.name === g.name);
        if ((guildMeta?.memberCount || 0) === 0) {
          await updateGuildLeader(g.name, user.id);
        }
      }
    } else {
      newPending.push(g.name);
      // 새로운 pending 길드 → 가입 요청
      if (!oldPending.has(g.name)) {
        const displayName = user.nickname || (user.lastName + user.firstName);
        await createGuildJoinRequest(g.name, g.name, user.id, displayName);
      }
    }
  }

  // 탈퇴한 길드 memberCount 감소
  for (const oldG of oldGuilds) {
    if (!newGuilds.includes(oldG)) {
      await updateGuildMemberCount(oldG, -1);
    }
  }

  // 철회된 pending 길드 → repository에서 요청과 pending 알림을 함께 제거
  for (const oldP of oldPending) {
    if (!newPending.includes(oldP)) {
      await withdrawGuildJoinRequest(oldP, user.id);
    }
  }

  // 승인된 멤버가 1개 이상이면 대표길드 필수
  const primaryGuild = newGuilds.length > 0
    ? (newGuilds.includes(_guildModalPrimary) ? _guildModalPrimary : newGuilds[0])
    : null;

  user.guilds = newGuilds;
  user.pendingGuilds = newPending;
  user.primaryGuild = primaryGuild;
  await saveAccount(user);
  setCurrentUser(user);

  if (refreshCache) {
    const { getAllGuilds } = await import('../data.js');
    guildPickerState.allGuildsCache = await getAllGuilds();
  }
  if (closeAfter) closeGuildModal();
  if (successMessage) {
    const { showToast: _st } = await import('../home/utils.js');
    _st(successMessage, 2600, successType);
  }
}

export async function saveGuildFromModal() {
  await syncGuildModalState({ closeAfter: true, successMessage: '저장되었습니다', successType: 'success' });
}


export async function manageAccountPassword(accountId) {
  const { getAccountList, saveAccount, hashPassword, verifyPassword } = await import('../data.js');
  const accounts = await getAccountList();
  const account = accounts.find(a => a.id === accountId);
  if (!account) return;

  if (account.hasPassword) {
    // 기존 비밀번호 확인 후 변경/해제
    const oldPw = prompt(`${account.lastName}${account.firstName} — 현재 비밀번호를 입력하세요`);
    if (oldPw === null) return;
    if (!verifyPassword(account, oldPw)) { showToast('비밀번호가 맞지 않아요', 2500, 'error'); return; }

    const action = confirm('비밀번호를 변경하시겠어요?\n\n확인 = 새 비밀번호 설정\n취소 = 비밀번호 해제');
    if (action) {
      const newPw = prompt('새 비밀번호를 입력하세요');
      if (!newPw) return;
      account.passwordHash = hashPassword(newPw);
      await saveAccount(account);
      showToast('비밀번호가 변경되었어요', 2500, 'success');
    } else {
      account.hasPassword = false;
      account.passwordHash = null;
      await saveAccount(account);
      showToast('비밀번호가 해제되었어요', 2500, 'success');
    }
  } else {
    // 비밀번호 새로 설정
    const newPw = prompt(`${account.lastName}${account.firstName} — 비밀번호를 설정하세요`);
    if (!newPw) return;
    account.hasPassword = true;
    account.passwordHash = hashPassword(newPw);
    await saveAccount(account);
    showToast('비밀번호가 설정되었어요', 2500, 'success');
  }
  // 목록 갱신
  const { initLoginScreen } = await import('../auth/login-screen.js');
  await initLoginScreen();
}
