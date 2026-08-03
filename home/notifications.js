// ================================================================
// home/notifications.js — 통합 알림센터
// ================================================================

import { getCurrentUser, getMyNotifications, getAccountList,
         getPendingRequests, acceptFriendRequest, removeFriend,
         markNotificationRead, deleteNotification, recordAction,
         approveGuildJoinRequest, findCommentProfileOwner,
         invalidateAccountListCache }  from '../data.js';
import { resolveNickname, formatTimeAgo, showToast, haptic, escapeHtml } from './utils.js';
import { openFriendProfile, openMyGuestbook, sendFriendFromIntro } from './friend-profile.js';
import { openPatchnote } from '../modals/patchnote-modal.js';

let _notifCenterOpen = false;

// 순환 참조 방지
let _renderFriendFeedFn = null;

export function setNotificationsDeps({ renderFriendFeed }) {
  _renderFriendFeedFn = renderFriendFeed;
}

function _bindNotificationActions(list) {
  if (!list || list.dataset.notificationActionsBound) return;
  list.dataset.notificationActionsBound = '1';
  list.addEventListener('click', (event) => {
    const control = event.target.closest('[data-notif-action]');
    if (!control || !list.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    const action = control.dataset.notifAction;
    const { notifId, requestId, friendId, friendName, targetUserId, fromId, section, dateKey, guildId } = control.dataset;
    if (action === 'open-profile') { closeNotifCenter(); void openFriendProfile(friendId, friendName || ''); }
    if (action === 'accept-friend') void acceptFriendFromNotif(requestId);
    if (action === 'reject-friend') void rejectFriendFromNotif(requestId);
    if (action === 'send-friend-intro') void sendFriendFromIntro(friendId, notifId);
    if (action === 'approve-guild') void approveGuildFromNotif(requestId, notifId);
    if (action === 'dismiss-guild') void dismissGuildFromNotif(notifId, control);
    if (action === 'accept-guild') void acceptGuildInvite(guildId, notifId);
    if (action === 'mark') void markNotifFromCenter(notifId, control.closest('.notif-item'));
    if (action === 'patchnote') void openPatchnoteFromNotif(control.closest('.notif-item'));
    if (action === 'guestbook') {
      void markNotifFromCenter(notifId, control).then(() => { closeNotifCenter(); return openMyGuestbook(); });
    }
    if (action === 'comment') {
      void markNotifFromCenter(notifId, control).then(() => { closeNotifCenter(); return openCommentNotif(targetUserId, fromId, section, dateKey); });
    }
  });
}

// opts.force=true 는 FCM 푸시 수신 디바운스(pwa-fcm.js)가 10초 정지 뒤 실제로
// 실행할 때 사용한다 — A2 캐시(60s TTL)를 우회해 최신 pending/notifs 를 가져오고,
// getAccountList() 는 시그니처를 바꿀 수 없어(잠긴 테스트) 대신 읽기 직전에
// 캐시를 무효화해 같은 효과를 낸다.
export async function refreshNotifCenter(opts = {}) {
  const user = getCurrentUser();
  if (!user) return;

  if (opts.force) invalidateAccountListCache();

  const [pendingR, notifsR, accountsR] = await Promise.allSettled([
    getPendingRequests(opts),
    getMyNotifications(opts),
    getAccountList()
  ]);
  const pending  = pendingR.status  === 'fulfilled' ? pendingR.value  : [];
  const notifs   = notifsR.status   === 'fulfilled' ? notifsR.value   : [];
  const accounts = accountsR.status === 'fulfilled' ? accountsR.value : [];
  const unread = notifs.filter(n => !n.read);

  const badge = document.getElementById('notif-badge');
  const total = pending.length + unread.length;
  if (badge) {
    badge.style.display = total > 0 ? '' : 'none';
    badge.textContent = total > 99 ? '99+' : total;
  }

  const list = document.getElementById('notif-center-list');
  if (!list) return;
  _bindNotificationActions(list);

  if (pending.length === 0 && unread.length === 0) {
    list.innerHTML = '<div class="notif-empty">알림이 없어요</div>';
    return;
  }

  let html = '';

  for (const req of pending) {
    const a = accounts.find(x => x.id === req.from);
    const nm = a ? resolveNickname(a, accounts) : req.from.replace(/_/g, '');
    html += `<div class="notif-item unread">
      <div class="notif-icon friend-req">👋</div>
      <div class="notif-body">
        <div class="notif-message"><b data-notif-action="open-profile" data-friend-id="${escapeHtml(req.from)}" data-friend-name="${escapeHtml(nm)}" style="cursor:pointer;text-decoration:underline;">${nm}</b>님이 이웃 요청을 보냈어요</div>
        <div class="notif-time">${formatTimeAgo(req.createdAt)}</div>
        <div class="notif-actions">
          <button type="button" class="notif-accept-btn" data-notif-action="accept-friend" data-request-id="${escapeHtml(req.id)}">수락</button>
          <button type="button" class="notif-reject-btn" data-notif-action="reject-friend" data-request-id="${escapeHtml(req.id)}">거절</button>
        </div>
      </div>
    </div>`;
  }

  for (const n of notifs) {
    if (n.read) continue;
    if (n.type === 'friend_request' && pending.some(p => p.from === n.from)) continue;
    const a = accounts.find(x => x.id === n.from);
    const nm = a ? resolveNickname(a, accounts) : (n.from || '').replace(/_/g, '');
    let icon, iconClass;
    if (n.type === 'like')            { icon = '❤️'; iconClass = 'like'; }
    else if (n.type === 'friend_accepted') { icon = '🤝'; iconClass = 'friend-ok'; }
    else if (n.type === 'friend_request')  { icon = '👋'; iconClass = 'friend-req'; }
    else if (n.type === 'tomato_gift')     { icon = '🍅'; iconClass = 'default'; }
    else if (n.type === 'reaction')        { icon = n.message?.match(/[👏🔥💪😍🍅]/)?.[0] || '💬'; iconClass = 'like'; }
    else if (n.type === 'guestbook')       { icon = '📝'; iconClass = 'default'; }
    else if (n.type === 'introduce')       { icon = '👋'; iconClass = 'friend-req'; }
    else if (n.type === 'announcement')    { icon = '📢'; iconClass = 'announce'; }
    else if (n.type === 'comment')              { icon = '💬'; iconClass = 'default'; }
    else if (n.type === 'comment_reply')        { icon = '💬'; iconClass = 'default'; }
    else if (n.type === 'guild_join_pending')    { icon = '⏳'; iconClass = 'default'; }
    else if (n.type === 'guild_join_request')   { icon = '🏠'; iconClass = 'default'; }
    else if (n.type === 'guild_join_approved')  { icon = '🏠'; iconClass = 'friend-ok'; }
    else if (n.type === 'guild_member_joined') { icon = '🏠'; iconClass = 'friend-ok'; }
    else if (n.type === 'guild_invite')        { icon = '🏠'; iconClass = 'default'; }
    else                                        { icon = '💬'; iconClass = 'default'; }
    const unreadCls = n.read ? '' : ' unread';
    const introAction = (n.type === 'introduce' && n.introducedId && !n.read)
      ? `<div class="notif-actions" style="margin-top:6px;">
          <button type="button" class="notif-accept-btn" data-notif-action="send-friend-intro" data-friend-id="${escapeHtml(n.introducedId)}" data-notif-id="${escapeHtml(n.id)}">이웃 추가하기</button>
        </div>` : '';
    const guildAction = (n.type === 'guild_join_request' && n.requestId && !n.read)
      ? `<div class="notif-actions" style="margin-top:6px;">
          <button type="button" class="notif-accept-btn" data-notif-action="approve-guild" data-request-id="${escapeHtml(n.requestId)}" data-notif-id="${escapeHtml(n.id)}">맞음</button>
          <button type="button" class="notif-reject-btn" data-notif-action="dismiss-guild" data-notif-id="${escapeHtml(n.id)}">아님</button>
        </div>` : '';
    const guildInviteAction = (n.type === 'guild_invite' && n.guildId && !n.read)
      ? `<div class="notif-actions" style="margin-top:6px;">
          <button type="button" class="notif-accept-btn" data-notif-action="accept-guild" data-guild-id="${escapeHtml(n.guildId || '')}" data-notif-id="${escapeHtml(n.id)}">가입하기</button>
          <button type="button" class="notif-reject-btn" data-notif-action="dismiss-guild" data-notif-id="${escapeHtml(n.id)}">괜찮아요</button>
        </div>` : '';
    if (n.type === 'announcement') {
      const annBody = n.body ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;line-height:1.4;">${(n.body || '').slice(0, 100)}${(n.body || '').length > 100 ? '…' : ''}</div>` : '';
      html += `<div class="notif-item${unreadCls} notif-announce" data-notif-action="mark" data-notif-id="${escapeHtml(n.id)}">
        <div class="notif-icon announce">📢</div>
        <div class="notif-body">
          <div class="notif-message" style="font-weight:700;color:var(--primary);">${n.title || n.message}</div>
          ${annBody}
          <div class="notif-time">${formatTimeAgo(n.createdAt)}</div>
        </div>
      </div>`;
      continue;
    }
    if (n.type === 'patchnote') {
      const rawBody = n.body || '';
      const bodyPreview = rawBody.slice(0, 80) + (rawBody.length > 80 ? '…' : '');
      const pnBody = rawBody ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;line-height:1.4;">${escapeHtml(bodyPreview)}</div>` : '';
      const pnTitle = escapeHtml(n.title || n.message || '새 패치노트가 도착했어요');
      html += `<div class="notif-item${unreadCls} notif-announce"
           data-notif-id="${escapeHtml(n.id)}"
           data-patchnote-id="${escapeHtml(n.patchnoteId || '')}"
           data-patchnote-title="${escapeHtml(n.title || '')}"
           data-patchnote-body="${escapeHtml(n.body || '')}"
           data-patchnote-created="${Number(n.createdAt || 0)}"
           data-notif-action="patchnote">
        <div class="notif-icon announce">📋</div>
        <div class="notif-body">
          <div class="notif-message" style="font-weight:700;color:var(--primary);">${pnTitle}</div>
          ${pnBody}
          <div class="notif-time">${formatTimeAgo(n.createdAt)}</div>
        </div>
      </div>`;
      continue;
    }
    const notifAction = n.type === 'guestbook' ? 'guestbook' : ((n.type === 'comment' || n.type === 'comment_reply') ? 'comment' : 'mark');
    html += `<div class="notif-item${unreadCls}" data-notif-action="${notifAction}" data-notif-id="${escapeHtml(n.id)}" data-target-user-id="${escapeHtml(n.targetUserId || '')}" data-from-id="${escapeHtml(n.from || '')}" data-section="${escapeHtml(n.section || '')}" data-date-key="${escapeHtml(n.dateKey || '')}">
      <div class="notif-icon ${iconClass}">${icon}</div>
      <div class="notif-body">
        <div class="notif-message"><b data-notif-action="open-profile" data-friend-id="${escapeHtml(n.from || '')}" data-friend-name="${escapeHtml(nm)}" style="cursor:pointer;text-decoration:underline;">${nm}</b>님이 ${
          (n.type === 'comment' || n.type === 'comment_reply')
            ? (n.message || '').replace(/(댓글|답글)/g, `<b data-notif-action="comment" data-notif-id="${escapeHtml(n.id)}" data-target-user-id="${escapeHtml(n.targetUserId || '')}" data-from-id="${escapeHtml(n.from || '')}" data-section="${escapeHtml(n.section || '')}" data-date-key="${escapeHtml(n.dateKey || '')}" style="cursor:pointer;text-decoration:underline;">$1</b>`)
            : (n.message || '')
        }</div>
        <div class="notif-time">${formatTimeAgo(n.createdAt)}</div>
        ${introAction}${guildAction}${guildInviteAction}
      </div>
    </div>`;
  }

  list.innerHTML = html || '<div class="notif-empty">알림이 없어요</div>';
}

export function toggleNotifCenter() {
  _notifCenterOpen = !_notifCenterOpen;
  document.getElementById('notif-center').classList.toggle('open', _notifCenterOpen);
  document.getElementById('notif-center-backdrop').classList.toggle('open', _notifCenterOpen);
  if (_notifCenterOpen) refreshNotifCenter();
};

export function closeNotifCenter() {
  _notifCenterOpen = false;
  document.getElementById('notif-center').classList.remove('open');
  document.getElementById('notif-center-backdrop').classList.remove('open');
};

export async function openCommentNotif(targetUserId, fromId, section, dateKey) {
  let profileId = targetUserId;
  if (!profileId) {
    profileId = await findCommentProfileOwner(fromId, dateKey, section);
  }
  if (!profileId) {
    profileId = getCurrentUser()?.id;
  }
  const accounts = await getAccountList();
  const acc = accounts.find(a => a.id === profileId);
  const name = acc ? resolveNickname(acc, accounts) : (profileId || '').replace(/_/g, '');
  await openFriendProfile(profileId, name, `comments_${section}`, dateKey);
};

export async function markAllNotifsRead() {
  const notifs = await getMyNotifications();
  const unread = notifs.filter((n) => !n.read);

  if (!unread.length) {
    showToast('읽지 않은 알림이 없어요', 2000, 'info');
    return;
  }

  const list = document.getElementById('notif-center-list');
  const nodes = unread
    .map((n) => list?.querySelector(`[data-notif-id="${n.id}"]`))
    .filter(Boolean);

  nodes.forEach((node) => {
    node.style.height = `${node.offsetHeight}px`;
    node.style.overflow = 'hidden';
  });

  await Promise.all(nodes.map((node, index) => new Promise((resolve) => {
    setTimeout(() => {
      node.animate([
        { opacity: 1, transform: 'translateY(0)', height: `${node.offsetHeight}px`, paddingTop: '14px', paddingBottom: '14px' },
        { opacity: 0, transform: 'translateY(-4px)', height: '0px', paddingTop: '0px', paddingBottom: '0px' },
      ], {
        duration: 170,
        easing: 'ease-out',
        fill: 'forwards',
      }).onfinish = () => {
        node.remove();
        resolve();
      };
    }, index * 25);
  })));

  await Promise.all(unread.map((n) => markNotificationRead(n.id).catch(() => {})));
  refreshNotifCenter();
  if (_renderFriendFeedFn) _renderFriendFeedFn();
  showToast('알림을 모두 읽었어요', 2500, 'info');
};

export async function acceptFriendFromNotif(id) {
  await acceptFriendRequest(id);
  haptic('success');
  showToast('🤝 이제 이웃이 되었어요!', 2500, 'success');
  refreshNotifCenter();
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};

export async function rejectFriendFromNotif(id) {
  await removeFriend(id);
  showToast('요청을 거절했어요', 2500, 'info');
  refreshNotifCenter();
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};

// 알림 → 패치노트 모달 오픈
// patchnoteId 있으면 해당 노트를 Firestore에서 가져옴. 없으면 (레거시 알림)
// 알림 payload의 title/body를 fallback으로 넘김 — "최신 노트로 때우기" 금지.
export async function openPatchnoteFromNotif(el) {
  if (!el) return;
  const notifId = el.dataset.notifId || '';
  const patchnoteId = el.dataset.patchnoteId || '';
  const fTitle = el.dataset.patchnoteTitle || '';
  const fBody = el.dataset.patchnoteBody || '';
  const fCreated = Number(el.dataset.patchnoteCreated || 0) || Date.now();

  // 알림은 사용자가 명시적으로 클릭한 시점에 읽음 처리 (모달 fetch 성공과 별개)
  if (notifId) markNotificationRead(notifId).catch(() => {});
  el.classList.remove('unread');
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const cnt = parseInt(badge.textContent, 10) - 1;
    if (cnt <= 0) badge.style.display = 'none';
    else badge.textContent = cnt;
  }
  closeNotifCenter();

  const fallback = (fTitle || fBody) ? { title: fTitle, body: fBody, createdAt: fCreated } : null;
  await openPatchnote(patchnoteId, fallback);
  recordAction('패치노트읽음');
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};

export async function approveGuildFromNotif(requestId, notifId) {
  await approveGuildJoinRequest(requestId);
  await markNotificationRead(notifId);
  haptic('success');
  showToast('🏠 길드원을 확인했어요!', 2500, 'success');
  refreshNotifCenter();
};

// 길드 초대 수락 — 초대자가 이미 길드원이므로 승인 없이 바로 가입
export async function acceptGuildInvite(guildId, notifId) {
  const { getCurrentUser, saveAccount, setCurrentUser, updateGuildMemberCount } = await import('../data.js');
  const user = getCurrentUser();
  if (!user) return;

  const guilds = user.guilds || [];
  const pending = user.pendingGuilds || [];
  if (!guilds.includes(guildId)) {
    guilds.push(guildId);
    user.guilds = guilds;
  }
  // pendingGuilds에 있었다면 제거
  user.pendingGuilds = pending.filter(g => g !== guildId);
  if (!user.primaryGuild) user.primaryGuild = guildId;
  await saveAccount(user);
  setCurrentUser(user);
  await updateGuildMemberCount(guildId, 1);
  await markNotificationRead(notifId);
  // "진행중" 알림도 제거
  await deleteNotification(`guild_pending_${guildId}_${user.id}`);
  haptic('success');
  showToast(`${guildId} 길드에 가입했어요!`, 2500, 'success');
  refreshNotifCenter();
};

export async function dismissGuildFromNotif(notifId, el) {
  await markNotificationRead(notifId);
  if (el) {
    const item = el.closest('.notif-item');
    if (item) item.classList.remove('unread');
  }
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const cnt = parseInt(badge.textContent) - 1;
    if (cnt <= 0) badge.style.display = 'none';
    else badge.textContent = cnt;
  }
};

export async function markNotifFromCenter(id, el) {
  if (el) el.classList.remove('unread');
  await markNotificationRead(id);
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const cnt = parseInt(badge.textContent) - 1;
    if (cnt <= 0) { badge.style.display = 'none'; }
    else { badge.textContent = cnt; }
  }
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};
