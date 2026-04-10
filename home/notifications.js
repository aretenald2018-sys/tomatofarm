// ================================================================
// home/notifications.js — 통합 알림센터
// ================================================================

import { getCurrentUser, getMyNotifications, getAccountList,
         getPendingRequests, acceptFriendRequest, removeFriend,
         markNotificationRead, recordAction,
         approveGuildJoinRequest, findCommentProfileOwner }  from '../data.js';
import { resolveNickname, formatTimeAgo, showToast, haptic } from './utils.js';

let _notifCenterOpen = false;

// 순환 참조 방지
let _renderFriendFeedFn = null;

export function setNotificationsDeps({ renderFriendFeed }) {
  _renderFriendFeedFn = renderFriendFeed;
}

export async function refreshNotifCenter() {
  const user = getCurrentUser();
  if (!user) return;

  const [pendingR, notifsR, accountsR] = await Promise.allSettled([
    getPendingRequests(),
    getMyNotifications(),
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

  if (pending.length === 0 && notifs.length === 0) {
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
        <div class="notif-message"><b style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();closeNotifCenter();openFriendProfile('${req.from}','${nm}')">${nm}</b>님이 이웃 요청을 보냈어요</div>
        <div class="notif-time">${formatTimeAgo(req.createdAt)}</div>
        <div class="notif-actions">
          <button class="notif-accept-btn" onclick="event.stopPropagation();acceptFriendFromNotif('${req.id}')">수락</button>
          <button class="notif-reject-btn" onclick="event.stopPropagation();rejectFriendFromNotif('${req.id}')">거절</button>
        </div>
      </div>
    </div>`;
  }

  let readShown = 0;
  for (const n of notifs) {
    if (n.read && readShown >= 5) continue;
    if (n.read) readShown++;
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
          <button class="notif-accept-btn" onclick="event.stopPropagation();sendFriendFromIntro('${n.introducedId}','${n.id}')">이웃 추가하기</button>
        </div>` : '';
    const guildAction = (n.type === 'guild_join_request' && n.requestId && !n.read)
      ? `<div class="notif-actions" style="margin-top:6px;">
          <button class="notif-accept-btn" onclick="event.stopPropagation();approveGuildFromNotif('${n.requestId}','${n.id}')">맞음</button>
          <button class="notif-reject-btn" onclick="event.stopPropagation();dismissGuildFromNotif('${n.id}',this)">아님</button>
        </div>` : '';
    const guildInviteAction = (n.type === 'guild_invite' && n.guildId && !n.read)
      ? `<div class="notif-actions" style="margin-top:6px;">
          <button class="notif-accept-btn" onclick="event.stopPropagation();acceptGuildInvite('${(n.guildId || '').replace(/'/g, "\\'")}','${n.id}')">가입하기</button>
          <button class="notif-reject-btn" onclick="event.stopPropagation();dismissGuildFromNotif('${n.id}',this)">괜찮아요</button>
        </div>` : '';
    if (n.type === 'announcement') {
      const annBody = n.body ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:3px;line-height:1.4;">${(n.body || '').slice(0, 100)}${(n.body || '').length > 100 ? '…' : ''}</div>` : '';
      html += `<div class="notif-item${unreadCls} notif-announce" data-notif-id="${n.id}" onclick="markNotifFromCenter('${n.id}',this)">
        <div class="notif-icon announce">📢</div>
        <div class="notif-body">
          <div class="notif-message" style="font-weight:700;color:var(--primary);">${n.title || n.message}</div>
          ${annBody}
          <div class="notif-time">${formatTimeAgo(n.createdAt)}</div>
        </div>
      </div>`;
      continue;
    }
    const clickAction = n.type === 'guestbook'
      ? `markNotifFromCenter('${n.id}',this);closeNotifCenter();openMyGuestbook()`
      : n.type === 'patchnote'
      ? `markNotifFromCenter('${n.id}',this);markPatchnoteReadFromNotif()`
      : (n.type === 'comment' || n.type === 'comment_reply')
      ? `markNotifFromCenter('${n.id}',this);closeNotifCenter();openCommentNotif('${n.targetUserId || ''}','${n.from || ''}','${n.section || ''}','${n.dateKey || ''}')`
      : `markNotifFromCenter('${n.id}',this)`;
    html += `<div class="notif-item${unreadCls}" data-notif-id="${n.id}" onclick="${clickAction}">
      <div class="notif-icon ${iconClass}">${icon}</div>
      <div class="notif-body">
        <div class="notif-message"><b style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();closeNotifCenter();openFriendProfile('${n.from}','${nm}')">${nm}</b>님이 ${
          (n.type === 'comment' || n.type === 'comment_reply')
            ? (n.message || '').replace(/(댓글|답글)/g, `<b style="cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();closeNotifCenter();openCommentNotif('${n.targetUserId || ''}','${n.from || ''}','${n.section || ''}','${n.dateKey || ''}')">$1</b>`)
            : (n.message || '')
        }</div>
        <div class="notif-time">${formatTimeAgo(n.createdAt)}</div>
        ${introAction}${guildAction}${guildInviteAction}
      </div>
    </div>`;
  }

  list.innerHTML = html || '<div class="notif-empty">알림이 없어요</div>';
}

window.toggleNotifCenter = function() {
  _notifCenterOpen = !_notifCenterOpen;
  document.getElementById('notif-center').classList.toggle('open', _notifCenterOpen);
  document.getElementById('notif-center-backdrop').classList.toggle('open', _notifCenterOpen);
  if (_notifCenterOpen) refreshNotifCenter();
};

window.closeNotifCenter = function() {
  _notifCenterOpen = false;
  document.getElementById('notif-center').classList.remove('open');
  document.getElementById('notif-center-backdrop').classList.remove('open');
};

window.openCommentNotif = async function(targetUserId, fromId, section, dateKey) {
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
  window.openFriendProfile(profileId, name, `comments_${section}`, dateKey);
};

window.markAllNotifsRead = async function() {
  const { deleteDoc, doc } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  const { getFirestore } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  const db = getFirestore();
  const notifs = await getMyNotifications();

  if (!notifs.length) {
    showToast('지울 알림이 없어요', 2000, 'info');
    return;
  }

  const list = document.getElementById('notif-center-list');
  const nodes = notifs
    .map((n) => list?.querySelector(`[data-notif-id="${n.id}"]`))
    .filter(Boolean);

  await Promise.all(nodes.map((node, index) => new Promise((resolve) => {
    setTimeout(() => {
      node.animate([
        { opacity: 1, transform: 'translateX(0)', height: `${node.offsetHeight}px`, marginBottom: getComputedStyle(node).marginBottom },
        { opacity: 0, transform: 'translateX(26px)', height: '0px', marginBottom: '0px' },
      ], {
        duration: 260,
        easing: 'cubic-bezier(.22,.61,.36,1)',
        fill: 'forwards',
      }).onfinish = () => {
        node.remove();
        resolve();
      };
    }, index * 55);
  })));

  await Promise.all(notifs.map((n) => deleteDoc(doc(db, '_notifications', n.id)).catch(() => {})));
  refreshNotifCenter();
  if (_renderFriendFeedFn) _renderFriendFeedFn();
  showToast('알림을 모두 지웠어요', 2500, 'info');
};

window.acceptFriendFromNotif = async function(id) {
  await acceptFriendRequest(id);
  haptic('success');
  showToast('🤝 이제 이웃이 되었어요!', 2500, 'success');
  refreshNotifCenter();
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};

window.rejectFriendFromNotif = async function(id) {
  await removeFriend(id);
  showToast('요청을 거절했어요', 2500, 'info');
  refreshNotifCenter();
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};

window.markPatchnoteReadFromNotif = async function() {
  const { getDocs, collection, getFirestore } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
  const db = getFirestore();
  const snap = await getDocs(collection(db, '_patchnotes'));
  const pns = []; snap.forEach(d => pns.push(d.data()));
  pns.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
  if (pns.length > 0) {
    const { markPatchnoteRead } = await import('../data.js');
    await markPatchnoteRead(pns[0].id);
  }
  recordAction('패치노트읽음');
};

window.approveGuildFromNotif = async function(requestId, notifId) {
  await approveGuildJoinRequest(requestId);
  await markNotificationRead(notifId);
  haptic('success');
  showToast('🏠 길드원을 확인했어요!', 2500, 'success');
  refreshNotifCenter();
};

// 길드 초대 수락 — 초대자가 이미 길드원이므로 승인 없이 바로 가입
window.acceptGuildInvite = async function(guildId, notifId) {
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
  try {
    const { deleteDoc, doc, getFirestore } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
    await deleteDoc(doc(getFirestore(), '_notifications', `guild_pending_${guildId}_${user.id}`));
  } catch {}
  haptic('success');
  showToast(`${guildId} 길드에 가입했어요!`, 2500, 'success');
  refreshNotifCenter();
};

window.dismissGuildFromNotif = async function(notifId, el) {
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

window.markNotifFromCenter = async function(id, el) {
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
