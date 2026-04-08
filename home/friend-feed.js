// ================================================================
// home/friend-feed.js — 친구 피드, 친구 관리, 리액션
// ================================================================

import { TODAY, getCurrentUser, getMyFriends, getAccountList,
         getPendingRequests, getMyNotifications,
         getFriendWorkout, sendFriendRequest, acceptFriendRequest, removeFriend,
         toggleLike, getLikes, dateKey, getCheerStatus,
         isAdmin, isAdminGuest, getAdminId, getAdminGuestId,
         recordAction }  from '../data.js';
import { resolveNickname, showToast, haptic, formatTimeAgo } from './utils.js';
import { updateHeroSocialProof } from './hero.js';

const _NEIGHBOR_PAGE_SIZE = 3;
let _neighborPage = 0;

// 순환 참조 방지: renderHome, openFriendProfile, openTomatoGiftModal 주입
let _renderHomeFn = null;
let _openFriendProfileFn = null;
let _openTomatoGiftModalFn = null;

export function setFriendFeedDeps({ renderHome, openFriendProfile, openTomatoGiftModal }) {
  _renderHomeFn = renderHome;
  _openFriendProfileFn = openFriendProfile;
  _openTomatoGiftModalFn = openTomatoGiftModal;
}

function _openFriendProfile(fid, fname) {
  if (_openFriendProfileFn) _openFriendProfileFn(fid, fname);
  else if (window.openFriendProfile) window.openFriendProfile(fid, fname);
}

function _openTomatoGiftModal(fid, fname) {
  if (_openTomatoGiftModalFn) _openTomatoGiftModalFn(fid, fname);
  else if (window.openTomatoGiftModal) window.openTomatoGiftModal(fid, fname);
}

// ── 새로운 이웃 섹션 (Seed Design 스타일 페이징) ─────────────────
function buildNeighborSection(suggestList, accounts, friends) {
  const total = suggestList.length;
  if (!total) return '';
  const totalPages = Math.ceil(total / _NEIGHBOR_PAGE_SIZE);
  const page = Math.min(_neighborPage, totalPages - 1);
  const start = page * _NEIGHBOR_PAGE_SIZE;
  const pageItems = suggestList.slice(start, start + _NEIGHBOR_PAGE_SIZE);

  const rows = pageItems.map(a => {
    const nick = resolveNickname(a, accounts);
    return `<div class="neighbor-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);" data-nid="${a.id}" data-nnick="${nick.replace(/"/g,'&quot;')}">
      <div style="width:40px;height:40px;border-radius:50%;background:#fdf0f0;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;cursor:pointer;">🍅</div>
      <div style="flex:1;min-width:0;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;">
        <div style="font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nick}</div>
      </div>
      <button onclick="event.stopPropagation();quickAddNeighbor('${a.id}')" style="padding:7px 16px;border:none;border-radius:999px;background:#fa342c;color:#fff;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;transition:background 0.15s;">이웃 추가</button>
    </div>`;
  }).join('');

  let paging = '';
  if (totalPages > 1) {
    const dots = Array.from({length: totalPages}, (_, i) =>
      `<button class="nb-page-dot" data-nbpage="${i}" style="width:${i === page ? '20px' : '8px'};height:8px;border-radius:4px;border:none;background:${i === page ? '#fa342c' : '#D1D6DB'};cursor:pointer;padding:0;transition:all 0.2s;"></button>`
    ).join('');
    paging = `<div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 0 4px;">${dots}</div>`;
    paging += `<div style="text-align:center;font-size:11px;color:#8B95A1;margin-top:2px;">${page + 1} / ${totalPages}</div>`;
  }

  return `<div id="neighbor-section" style="margin-top:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;background:#fdf0f0;">
      <div style="font-size:14px;font-weight:700;color:#ca1d13;">🍅 새로운 이웃</div>
      <span style="font-size:12px;color:#fe928d;">${total}명</span>
    </div>
    <div id="neighbor-list" style="padding:0 16px;">${rows}</div>
    ${paging}
  </div>`;
}

function bindNeighborPaging(container, suggestList, accounts, friends) {
  if (!suggestList.length) return;
  container.addEventListener('click', (e) => {
    const dot = e.target.closest('.nb-page-dot');
    if (dot) {
      _neighborPage = parseInt(dot.dataset.nbpage);
      const section = container.querySelector('#neighbor-section');
      if (section) {
        section.outerHTML = buildNeighborSection(suggestList, accounts, friends);
        bindNeighborPaging(container, suggestList, accounts, friends);
      }
      return;
    }
    const row = e.target.closest('.neighbor-row');
    if (row && !e.target.closest('button')) {
      e.preventDefault();
      _openFriendProfile(row.dataset.nid, row.dataset.nnick);
    }
  });
}

// ── 친구 피드 ────────────────────────────────────────────────────
export async function renderFriendFeed() {
  const feedEl = document.getElementById('friend-feed');
  if (!feedEl) return;
  const user = getCurrentUser();
  if (!user) { feedEl.innerHTML = ''; return; }

  const notifEl = document.getElementById('friend-notifications');
  try {
    const pending = await getPendingRequests();
    if (pending.length > 0) {
      notifEl.style.display = 'block';
      const accounts = await getAccountList();
      let nh = '';
      for (const req of pending) {
        const a = accounts.find(x => x.id === req.from);
        const nm = a ? resolveNickname(a, accounts) : req.from.replace(/_/g, '');
        nh += '<div class="friend-notif-row"><span>' + nm + '님이 이웃 요청을 보냈어요</span><div style="display:flex;gap:6px;"><button onclick="acceptFriendReq(\'' + req.id + '\')" style="background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">수락</button><button onclick="rejectFriendReq(\'' + req.id + '\')" style="background:var(--surface3);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);padding:6px 12px;font-size:12px;cursor:pointer;">거절</button></div></div>';
      }
      notifEl.innerHTML = nh;
    } else if (notifEl) { notifEl.style.display = 'none'; }
  } catch(e) { console.warn('[friends] notif:', e); }

  try {
    let [friends, accounts, allNotifs] = await Promise.all([getMyFriends(), getAccountList(), getMyNotifications()]);

    if (friends.length > 1) {
      const myId = getCurrentUser()?.id;
      const lastInteraction = {};
      for (const n of allNotifs) {
        if (n.from && n.from !== myId) {
          if (!lastInteraction[n.from] || n.createdAt > lastInteraction[n.from])
            lastInteraction[n.from] = n.createdAt;
        }
      }
      friends.sort((a, b) => {
        const ta = lastInteraction[a.friendId] || 0;
        const tb = lastInteraction[b.friendId] || 0;
        return tb - ta;
      });
    }

    if (!friends.length) {
      feedEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px;line-height:1.6;">이웃을 추가하고 함께 토마토를 키워보세요.<br>서로 응원하며 더 건강해질 수 있어요.</div>';
      return;
    }
    const tk = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const recentKeys = [1, 2, 3].map(i => {
      const d = new Date(TODAY); d.setDate(d.getDate() - i);
      return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    });

    const friendResults = await Promise.allSettled(
      friends.map(f => getFriendWorkout(f.friendId, tk))
    );
    const friendWorkouts = friendResults.map(r => r.status === 'fulfilled' ? r.value : null);
    const recentResults = await Promise.allSettled(
      friends.map(f => Promise.allSettled(recentKeys.map(k => getFriendWorkout(f.friendId, k)))
        .then(rs => rs.map(r => r.status === 'fulfilled' ? r.value : null)))
    );
    const recentWorkouts = recentResults.map(r => r.status === 'fulfilled' ? r.value : [null, null, null]);

    const cheerResults = await Promise.allSettled(
      friends.map(f => getCheerStatus(f.friendId, tk))
    );
    const cheerStatuses = cheerResults.map(r => r.status === 'fulfilled' ? r.value : { iSent: false, theyCheerd: false });

    let activeCount = 0;
    const FRIEND_PAGE_SIZE = 3;
    const friendCards = [];
    const activeNames = [];
    const avatarEntries = [];

    for (let fi = 0; fi < friends.length; fi++) {
      const f = friends[fi];
      const acc = accounts.find(a => a.id === f.friendId);
      const nick = acc ? resolveNickname(acc, accounts) : f.friendId.replace(/_/g, '');
      const fullName = acc ? acc.lastName + acc.firstName.replace(/\(.*\)/, '') : f.friendId.replace(/_/g, '');
      const name = nick;
      const w = friendWorkouts[fi];

      const hasToday = !!(w && ((w.muscles||[]).length || w.exercises?.length || w.breakfast || w.lunch || w.dinner || w.bFoods?.length || w.lFoods?.length || w.dFoods?.length));
      const hasRecent = !hasToday && recentWorkouts[fi].some(rw => rw && ((rw.muscles||[]).length || rw.exercises?.length || rw.breakfast || rw.lunch || rw.dinner));
      // 비활성 판정: 마지막 접속으로부터 12시간 이상 지나야 inactive
      const lastLogin = acc?.lastLoginAt || 0;
      const hoursSinceLogin = (Date.now() - lastLogin) / (1000 * 60 * 60);
      const isInactive = !hasToday && !hasRecent && hoursSinceLogin >= 12;
      const statusClass = hasToday ? 'active' : hasRecent ? 'recent' : (isInactive ? 'inactive' : 'recent');

      avatarEntries.push({ name, statusClass, fid: f.friendId, fullName });

      let items = '';
      if (w) {
        if ((w.muscles || []).length > 0) {
          items += '<div class="friend-feed-item"><span>🏋️ ' + (w.muscles || []).slice(0, 3).join(', ') + '</span></div>';
        }
        const feedMealMap = {breakfast:{foods:'bFoods',memo:'breakfast'},lunch:{foods:'lFoods',memo:'lunch'},dinner:{foods:'dFoods',memo:'dinner'},snack:{foods:'sFoods',memo:'snack'}};
        ['breakfast','lunch','dinner','snack'].forEach(meal => {
          const mk = feedMealMap[meal];
          const foods = w[mk.foods] || [];
          const memo = w[mk.memo] || '';
          if (foods.length || memo) {
            const foodText = foods.map(x => x.name).join(', ').slice(0, 30) || memo;
            const kcal = foods.reduce((s, x) => s + (x.kcal || 0), 0);
            const lb = {breakfast:'🌅',lunch:'☀️',dinner:'🌙',snack:'🥤'}[meal];
            items += '<div class="friend-feed-item"><span>' + lb + ' ' + (foodText) + (kcal ? ' (' + kcal + 'kcal)' : '') + '</span></div>';
          }
        });
      }
      if (items || hasToday) { activeCount++; if (!activeNames.includes(name)) activeNames.push(name); }
      const cs = cheerStatuses[fi];
      const isMutual = cs.iSent && cs.theyCheerd;
      let cheerBtn = '';
      if (hasToday) {
        if (isMutual) {
          cheerBtn = `<button class="friend-cheer-btn" data-cheer-fid="${f.friendId}" data-cheer-name="${name.replace(/"/g,'&quot;')}" title="서로 응원!" style="padding:4px 10px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;">🤝 함께응원!</button>`;
        } else if (cs.iSent) {
          cheerBtn = `<button class="friend-cheer-btn" data-cheer-fid="${f.friendId}" data-cheer-name="${name.replace(/"/g,'&quot;')}" title="응원 보내기" style="padding:4px 10px;border:none;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;opacity:0.7;">✓ 응원 완료</button>`;
        } else {
          cheerBtn = `<button class="friend-cheer-btn" data-cheer-fid="${f.friendId}" data-cheer-name="${name.replace(/"/g,'&quot;')}" title="응원 보내기" style="padding:4px 10px;border:none;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;">👏 응원</button>`;
        }
      }
      friendCards.push({ statusClass, html: `<div class="friend-card"><div class="friend-card-header"><span class="friend-avatar" style="font-size:18px;">🍅<span class="status-dot ${statusClass}"></span></span><span class="friend-name" data-fid="${f.friendId}" data-fname="${fullName.replace(/"/g,'&quot;')}" style="cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;">${name}</span><div style="display:flex;gap:6px;align-items:center;">${cheerBtn}<button class="friend-gift-btn" data-gift-fid="${f.friendId}" data-gift-name="${fullName.replace(/"/g,'&quot;')}" title="토마토 선물">🍅</button></div></div>${items}</div>` });
    }

    const statusOrder = { active: 0, recent: 1, inactive: 2 };
    friendCards.sort((a, b) => statusOrder[a.statusClass] - statusOrder[b.statusClass]);

    const visibleCards = friendCards.filter(c => c.statusClass !== 'inactive');
    const hiddenCards = friendCards.filter(c => c.statusClass === 'inactive');

    let bannerText = '';
    if (activeNames.length === 1) bannerText = `${activeNames[0]}님이 오늘 달리고 있어요 🔥`;
    else if (activeNames.length === 2) bannerText = `${activeNames[0]}, ${activeNames[1]}님이 함께 달리는 중! 🔥`;
    else if (activeNames.length > 2) bannerText = `${activeNames[0]}, ${activeNames[1]} 외 ${activeNames.length - 2}명이 함께 달리는 중! 🔥`;
    const banner = bannerText
      ? `<div style="padding:10px 12px;background:var(--primary-bg);border-radius:10px;font-size:12px;font-weight:500;color:var(--primary);margin-bottom:10px;text-align:center;">${bannerText}</div>`
      : '';

    avatarEntries.sort((a, b) => statusOrder[a.statusClass] - statusOrder[b.statusClass]);
    let activityBarHtml = '';
    if (avatarEntries.length > 0) {
      const avatars = avatarEntries.map(e => {
        const initial = e.name.charAt(0);
        return `<div class="activity-avatar-item" data-fid="${e.fid}" data-fname="${e.fullName.replace(/"/g,'&quot;')}">
          <div class="activity-avatar ${e.statusClass}">${initial}</div>
          <div class="activity-avatar-name">${e.name}</div>
        </div>`;
      }).join('');
      activityBarHtml = `<div class="activity-avatar-bar">${avatars}</div>`;
    }

    const allVisibleHtml = visibleCards.map(c => c.html);
    const totalPages = Math.ceil(allVisibleHtml.length / FRIEND_PAGE_SIZE);
    let pagedHtml = '';
    for (let p = 0; p < totalPages; p++) {
      const pageCards = allVisibleHtml.slice(p * FRIEND_PAGE_SIZE, (p + 1) * FRIEND_PAGE_SIZE);
      pagedHtml += `<div class="friend-page" data-page="${p}" style="${p > 0 ? 'display:none' : ''}">${pageCards.join('')}</div>`;
    }
    const dotsHtml = totalPages > 1
      ? `<div class="friend-paging-controls">${Array.from({length:totalPages}, (_,i) => `<button class="friend-paging-dot${i===0?' active':''}" data-fp="${i}"></button>`).join('')}</div>`
      : '';

    let hiddenSection = '';
    if (hiddenCards.length > 0) {
      hiddenSection = `<div class="inactive-friends-section">
        <button class="inactive-friends-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.textContent=this.nextElementSibling.style.display==='none'?'비활성 이웃 ${hiddenCards.length}명 보기 ▾':'접기 ▴'">비활성 이웃 ${hiddenCards.length}명 보기 ▾</button>
        <div style="display:none">${hiddenCards.map(c => c.html).join('')}</div>
      </div>`;
    }

    feedEl.innerHTML = banner + activityBarHtml + pagedHtml + dotsHtml + hiddenSection;

    updateHeroSocialProof(activeNames);

    feedEl.querySelectorAll('.activity-avatar-item').forEach(el => {
      el.addEventListener('click', () => _openFriendProfile(el.dataset.fid, el.dataset.fname));
    });

    let _friendPageCur = 0;
    const _friendPageTotal = totalPages;

    function _goFriendPage(page) {
      if (page < 0 || page >= _friendPageTotal) return;
      _friendPageCur = page;
      feedEl.querySelectorAll('.friend-page').forEach(p => p.style.display = parseInt(p.dataset.page) === page ? '' : 'none');
      feedEl.querySelectorAll('.friend-paging-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.fp) === page));
    }

    feedEl.querySelectorAll('.friend-paging-dot').forEach(dot => {
      dot.onclick = (e) => {
        e.stopPropagation();
        _goFriendPage(parseInt(dot.dataset.fp));
      };
    });

    if (_friendPageTotal > 1) {
      let _fsx = 0, _fsy = 0, _fswiping = false;
      feedEl.addEventListener('touchstart', e => {
        _fsx = e.touches[0].clientX;
        _fsy = e.touches[0].clientY;
        _fswiping = false;
      }, { passive: true });
      feedEl.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - _fsx;
        const dy = e.touches[0].clientY - _fsy;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 15) _fswiping = true;
      }, { passive: true });
      feedEl.addEventListener('touchend', e => {
        if (!_fswiping) return;
        const dx = e.changedTouches[0].clientX - _fsx;
        if (Math.abs(dx) > 50) {
          _goFriendPage(_friendPageCur + (dx < 0 ? 1 : -1));
        }
      });
    }

    async function _sendCheer(btnEl) {
      const fid = btnEl.dataset.cheerFid;
      const fname = btnEl.dataset.cheerName;
      if (btnEl.disabled) return;
      btnEl.disabled = true;
      btnEl.style.opacity = '0.5';
      btnEl.textContent = '보내는 중...';
      try {
        const dk = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
        const liked = await toggleLike(fid, dk, 'cheer', '👏');
        if (liked) {
          const { theyCheerd } = await getCheerStatus(fid, dk);
          if (theyCheerd) {
            haptic('success');
            btnEl.textContent = '🤝 함께응원!';
            btnEl.style.background = 'var(--primary, #fa342c)';
            btnEl.style.color = '#fff';
            btnEl.style.opacity = '1';
          } else {
            haptic('success');
            btnEl.textContent = '✓ 응원 완료';
            btnEl.style.background = 'var(--primary-bg, #fdf0f0)';
            btnEl.style.color = 'var(--primary, #fa342c)';
            btnEl.style.opacity = '0.7';
          }
        } else {
          btnEl.textContent = '👏 응원';
          btnEl.style.background = 'var(--primary-bg)';
          btnEl.style.color = 'var(--primary)';
          btnEl.style.opacity = '1';
        }
      } catch (e) {
        console.warn('[cheer] error:', e);
        btnEl.textContent = '👏 응원';
        btnEl.style.opacity = '1';
      }
      btnEl.disabled = false;
    }

    feedEl.onclick = (e) => {
      if (e.target.closest('.friend-paging-dot')) return;
      const nameEl = e.target.closest('.friend-name[data-fid]');
      if (nameEl) { e.preventDefault(); _openFriendProfile(nameEl.dataset.fid, nameEl.dataset.fname); return; }
      const cheerEl = e.target.closest('.friend-cheer-btn[data-cheer-fid]');
      if (cheerEl) { _sendCheer(cheerEl); return; }
      const giftEl = e.target.closest('.friend-gift-btn[data-gift-fid]');
      if (giftEl) { _openTomatoGiftModal(giftEl.dataset.giftFid, giftEl.dataset.giftName); return; }
    };
  } catch(e) { console.warn('[friends] feed:', e); feedEl.innerHTML = ''; }
}

// ── 친구 관리 모달 ───────────────────────────────────────────────
window.openFriendManager = async function() {
  const friends = await getMyFriends();
  const accounts = await getAccountList();
  let fl = '';
  if (!friends.length) fl = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px;">아직 등록된 이웃이 없어요</div>';
  else fl = friends.map(f => {
    const a = accounts.find(x => x.id === f.friendId);
    const nick = a ? resolveNickname(a, accounts) : f.friendId.replace(/_/g, '');
    const realName = a ? a.lastName + a.firstName.replace(/\(.*\)/, '') : f.friendId.replace(/_/g, '');
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" data-fid="${f.friendId}" data-fname="${nick.replace(/"/g,'&quot;')}" class="friend-manager-row">
      <span class="friend-avatar">${nick.charAt(0)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:500;">${nick}</div>
        ${nick !== realName ? `<div style="font-size:11px;color:var(--text-tertiary);">${realName}</div>` : ''}
      </div>
      <button onclick="event.stopPropagation();openIntroduceFriend('${f.friendId}','${nick.replace(/'/g,"&#39;")}')" style="background:none;border:none;color:var(--seed-red-600,#fc6a66);font-size:12px;cursor:pointer;padding:4px 8px;">소개</button>
      <button onclick="event.stopPropagation();editFriendNickname('${f.friendId}')" style="background:none;border:none;color:var(--primary);font-size:12px;cursor:pointer;padding:4px 8px;${!isAdmin() ? 'display:none;' : ''}">별명</button>
      <button onclick="event.stopPropagation();deleteFriend('${f.reqId}')" style="background:none;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;">삭제</button>
    </div>`;
  }).join('');

  let neighborHtml = '';
  try {
    const user = getCurrentUser();
    const myId = isAdminGuest() ? getAdminId() : user?.id;
    const friendIds = new Set(friends.map(f => f.friendId));
    friendIds.add(myId);
    if (isAdminGuest()) { friendIds.add(getAdminGuestId()); friendIds.add(getAdminId()); }
    const suggestList = accounts.filter(a => a.id && !friendIds.has(a.id) && !a.id.includes('(guest)'));
    if (suggestList.length > 0) {
      const rows = suggestList.map(a => {
        const nick = resolveNickname(a, accounts);
        return `<div class="neighbor-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);" data-nid="${a.id}" data-nnick="${nick.replace(/"/g,'&quot;')}">
          <div style="width:40px;height:40px;border-radius:50%;background:#fdf0f0;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;cursor:pointer;">🍅</div>
          <div style="flex:1;min-width:0;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;">
            <div style="font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nick}</div>
          </div>
          <button onclick="event.stopPropagation();quickAddNeighbor('${a.id}')" style="padding:7px 16px;border:none;border-radius:999px;background:#fa342c;color:#fff;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;transition:background 0.15s;">이웃 추가</button>
        </div>`;
      }).join('');
      neighborHtml = `
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;margin-top:16px;">새로운 이웃</div>
        <div id="modal-neighbor-list">${rows}</div>`;
    }
  } catch(e) { console.warn('[suggest]', e); }

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">이웃 관리</div>
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">이웃 추가</div>
        <div style="display:flex;gap:6px;">
          <input class="login-input" id="friend-add-last" placeholder="성" style="flex:1;height:40px;font-size:13px;">
          <input class="login-input" id="friend-add-first" placeholder="이름" style="flex:2;height:40px;font-size:13px;">
          <button onclick="sendFriendReq()" style="background:var(--primary);color:#fff;border:none;border-radius:999px;padding:0 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">요청</button>
        </div>
        <div id="friend-add-status" style="font-size:12px;margin-top:6px;min-height:16px;"></div>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">내 이웃</div>
      <div id="friend-manager-list">${fl}</div>
      ${neighborHtml}
      <button onclick="document.getElementById('dynamic-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:12px;">닫기</button>
    </div>
  </div>`;
  modal.addEventListener('click', e => {
    const row = e.target.closest('.friend-manager-row');
    if (!row || e.target.closest('button')) return;
    const fid = row.dataset.fid;
    const fname = row.dataset.fname;
    document.getElementById('dynamic-modal')?.remove();
    _openFriendProfile(fid, fname);
  });
  modal.addEventListener('click', e => {
    const nrow = e.target.closest('.neighbor-row');
    if (!nrow || e.target.closest('button')) return;
    document.getElementById('dynamic-modal')?.remove();
    _openFriendProfile(nrow.dataset.nid, nrow.dataset.nnick);
  });
};

window.sendFriendReq = async function() {
  const ln = document.getElementById('friend-add-last')?.value.trim();
  const fn = document.getElementById('friend-add-first')?.value.trim();
  const st = document.getElementById('friend-add-status');
  if (!ln || !fn) { st.innerHTML = '<span style="color:var(--text-tertiary);">성과 이름을 입력해주세요.</span>'; return; }
  const tid = (ln + '_' + fn).toLowerCase().replace(/\s/g, '');
  const user = getCurrentUser();
  if (!user) return;
  const myId = isAdminGuest() ? getAdminId() : user.id;
  if (tid === myId || tid === user.id) { st.innerHTML = '<span style="color:var(--text-tertiary);">본인에게는 요청할 수 없어요.</span>'; return; }
  const accs = await getAccountList();
  if (!accs.find(a => a.id === tid)) { st.innerHTML = '<span style="color:#ef4444;">해당 이름의 계정이 없어요.</span>'; return; }
  const r = await sendFriendRequest(myId, tid);
  st.innerHTML = r.error ? '<span style="color:var(--text-tertiary);">' + r.error + '</span>' : '<span style="color:var(--primary);">이웃 요청을 보냈어요!</span>';
  if (!r.error) { recordAction('이웃요청'); document.getElementById('friend-add-last').value = ''; document.getElementById('friend-add-first').value = ''; }
};

window.acceptFriendReq = async function(id) {
  await acceptFriendRequest(id);
  recordAction('이웃수락');
  showToast('🤝 이제 이웃이 되었어요!', 2500, 'success');
  haptic('success');
  if (_renderHomeFn) _renderHomeFn();
};
window.rejectFriendReq = async function(id) { await removeFriend(id); if (_renderHomeFn) _renderHomeFn(); };
window.deleteFriend = async function(id) { if(!confirm('이웃을 삭제할까요?')) return; await removeFriend(id); window.openFriendManager(); };

window.quickAddNeighbor = async function(targetId) {
  const user = getCurrentUser();
  if (!user) return;
  const myId = isAdminGuest() ? getAdminId() : user.id;
  const r = await sendFriendRequest(myId, targetId);
  if (r.error) { showToast(r.error, 2500, 'error'); }
  else { showToast('이웃 요청을 보냈어요!', 2500, 'success'); }
  renderFriendFeed();
};

window.editFriendNickname = async function(friendId) {
  if (!isAdmin()) { showToast('별명 변경은 관리자만 가능해요', 2500, 'warning'); return; }
  const { getAccountList, saveAccount } = await import('../data.js');
  const accounts = await getAccountList();
  const acc = accounts.find(a => a.id === friendId);
  if (!acc) { showToast('계정을 찾을 수 없어요', 2500, 'error'); return; }
  const realName = acc.lastName + acc.firstName.replace(/\(.*\)/, '');
  const current = acc.nickname || realName;
  const newNick = prompt(`${realName}의 별명을 입력하세요`, current === realName ? '' : current);
  if (newNick === null) return;
  acc.nickname = newNick.trim() || realName;
  await saveAccount(acc);
  showToast(`별명이 "${acc.nickname}"(으)로 변경되었어요`, 2500, 'success');
  window.openFriendManager();
};

// ── 리액션 시스템 ────────────────────────────────────────────────
export const REACTIONS = [
  { emoji: '👏', label: '대단해' },
  { emoji: '🔥', label: '불타오르네' },
  { emoji: '💪', label: '파이팅' },
  { emoji: '😍', label: '맛있겠다' },
  { emoji: '🍅', label: '토마토' },
];

window.friendLike = async function(tid, dk, field) { await toggleLike(tid, dk, field); renderFriendFeed(); };

window.showReactionPicker = function(btn, tid, dk, field) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = REACTIONS.map(r =>
    `<button class="reaction-opt" onclick="sendReaction('${tid}','${dk}','${field}','${r.emoji}');event.stopPropagation();">${r.emoji}</button>`
  ).join('');
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(picker);
  requestAnimationFrame(() => picker.classList.add('show'));
  const ac = new AbortController();
  requestAnimationFrame(() => {
    document.addEventListener('click', (e) => {
      if (!picker.contains(e.target)) { picker.remove(); ac.abort(); }
    }, { signal: ac.signal });
  });
};

window.showReactionDetail = async function(btn, tid, dk, field) {
  document.querySelectorAll('.reaction-detail-popup').forEach(p => p.remove());
  const likes = await getLikes(tid, dk);
  const fieldLikes = likes.filter(l => l.field === field);
  if (!fieldLikes.length) return;
  const accounts = await getAccountList();
  const rows = fieldLikes.map(l => {
    const acc = accounts.find(a => a.id === l.from);
    const name = acc ? resolveNickname(acc, accounts) : l.from.replace(/_/g, '');
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;${fieldLikes.indexOf(l) < fieldLikes.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
      <span style="font-size:16px;">${l.emoji || '👏'}</span>
      <span style="font-size:13px;font-weight:500;color:var(--text);">${name}</span>
    </div>`;
  }).join('');
  const popup = document.createElement('div');
  popup.className = 'reaction-detail-popup';
  popup.style.cssText = 'position:absolute;bottom:100%;right:0;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;min-width:140px;max-width:220px;';
  popup.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;">리액션 ${fieldLikes.length}개</div>${rows}`;
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(popup);
  const ac2 = new AbortController();
  requestAnimationFrame(() => {
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== btn) { popup.remove(); ac2.abort(); }
    }, { signal: ac2.signal });
  });
};
