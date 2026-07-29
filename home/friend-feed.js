// ================================================================
// home/friend-feed.js — 친구 피드, 친구 관리, 리액션
// ================================================================

import { TODAY, getCurrentUser, getMyFriends, getAccountList,
         getPendingRequests, getMyNotifications,
         getFriendWorkout, sendFriendRequest, acceptFriendRequest, removeFriend,
         toggleLike, getLikes, dateKey, getCheerStatus,
         isAdmin,
         recordAction }  from '../data.js';
import { isExerciseDaySuccess } from '../calc.js';
import { hasPositiveDayNutrient } from '../diet/day-nutrition.js';
import { mealDisplayText } from '../ai/meal-artifact-filter.js';
import { resolveNickname, showToast, haptic, formatTimeAgo, escapeHtml } from './utils.js';
import { updateHeroSocialProof } from './hero.js';
import { createSocialRenderScheduler } from './social-render-scheduler.js';
import { runOptimisticSocialAction } from './social-action.js';
import { confirmAction } from '../utils/confirm-modal.js';
import { openPhotoLightbox } from '../utils/photo-lightbox.js';

const _NEIGHBOR_PAGE_SIZE = 3;
let _neighborPage = 0;

// 순환 참조 방지: renderHome, openFriendProfile, openTomatoGiftModal 주입
let _renderHomeFn = null;
let _openFriendProfileFn = null;
let _openTomatoGiftModalFn = null;
let _openIntroduceFriendFn = null;
let _sendReactionFn = null;
let _deleteFriendLock = false;

export function setFriendFeedDeps({ renderHome, openFriendProfile, openTomatoGiftModal, openIntroduceFriend, sendReaction }) {
  _renderHomeFn = renderHome;
  _openFriendProfileFn = openFriendProfile;
  _openTomatoGiftModalFn = openTomatoGiftModal;
  _openIntroduceFriendFn = openIntroduceFriend;
  _sendReactionFn = sendReaction;
}

function _openFriendProfile(fid, fname) {
  _openFriendProfileFn?.(fid, fname);
}

function _openTomatoGiftModal(fid, fname) {
  _openTomatoGiftModalFn?.(fid, fname);
}

function _feedAttr(value) {
  return escapeHtml(value);
}

function _bindFriendFeedActions(root = document) {
  const marker = root.documentElement || root;
  if (!marker || marker.dataset.friendFeedActionsBound === '1') return;
  marker.dataset.friendFeedActionsBound = '1';
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const control = target?.closest?.('[data-feed-action]');
    if (!control || !root.contains(control)) return;
    event.preventDefault();
    event.stopPropagation();
    Promise.resolve(_runFriendFeedAction(control.dataset.feedAction, control, event))
      .catch(err => {
        console.warn('[friend-feed action]:', err);
        showToast('이웃 작업 중 문제가 생겼어요', 2200, 'error');
      });
  }, true);
}

async function _runFriendFeedAction(action, control, event) {
  switch (action) {
    case 'quick-add-neighbor':
      return quickAddNeighbor(control.dataset.targetId || '');
    case 'accept-friend-request':
      return acceptFriendReq(control.dataset.requestId || '');
    case 'reject-friend-request':
      return rejectFriendReq(control.dataset.requestId || '');
    case 'open-meal-photo':
      return openPhotoLightbox(control.dataset.photo || '');
    case 'toggle-inactive-friends': {
      const body = control.nextElementSibling;
      if (!body) return;
      const nextVisible = body.style.display === 'none';
      body.style.display = nextVisible ? '' : 'none';
      control.textContent = nextVisible ? '접기 ▴' : `비활성 이웃 ${control.dataset.count || 0}명 보기 ▾`;
      return;
    }
    case 'select-feed-page': {
      const page = Number(control.dataset.fp);
      const feedRoot = control.closest('#friend-feed');
      feedRoot?._friendFeedGoPage?.(page);
      return;
    }
    case 'open-profile':
      _openFriendProfile(control.dataset.fid || '', control.dataset.fname || '');
      return;
    case 'send-cheer': {
      const feedRoot = control.closest('#friend-feed');
      return feedRoot?._friendFeedSendCheer?.(control);
    }
    case 'open-gift':
      _openTomatoGiftModal(control.dataset.giftFid || '', control.dataset.giftName || '');
      return;
    case 'send-friend-request':
      return sendFriendReq();
    case 'close-dynamic-modal':
      document.getElementById('dynamic-modal')?.remove();
      return;
    case 'introduce-friend':
      return _openIntroduceFriendFn?.(control.dataset.friendId || '', control.dataset.friendName || '');
    case 'edit-friend-nickname':
      return editFriendNickname(control.dataset.friendId || '');
    case 'delete-friend':
      return deleteFriend(control.dataset.requestId || '');
    case 'show-reaction-picker':
      return showReactionPicker(control, control.dataset.targetId || '', control.dataset.dateKey || '', control.dataset.field || '');
    case 'show-reaction-detail':
      return showReactionDetail(control, control.dataset.targetId || '', control.dataset.dateKey || '', control.dataset.field || '');
    case 'send-reaction':
      return _sendReactionFn?.(control.dataset.targetId || '', control.dataset.dateKey || '', control.dataset.field || '', control.dataset.emoji || '');
    default:
      console.warn(`[friend-feed] unknown action: ${action}`);
  }
}

function _bindFriendManagerActions(modal) {
  if (!modal || modal.dataset.friendManagerActionsBound === '1') return;
  modal.dataset.friendManagerActionsBound = '1';
  modal.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const backdrop = modal.querySelector('.modal-backdrop');
    if (target === backdrop) {
      document.getElementById('dynamic-modal')?.remove();
      return;
    }
    const row = target?.closest?.('.friend-manager-row');
    if (row && !target.closest('button')) {
      document.getElementById('dynamic-modal')?.remove();
      _openFriendProfile(row.dataset.fid, row.dataset.fname);
      return;
    }
    const nrow = target?.closest?.('.neighbor-row');
    if (nrow && !target.closest('button')) {
      document.getElementById('dynamic-modal')?.remove();
      _openFriendProfile(nrow.dataset.nid, nrow.dataset.nnick);
    }
  });
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
      <button type="button" data-feed-action="quick-add-neighbor" data-target-id="${_feedAttr(a.id)}" style="padding:7px 16px;border:none;border-radius:999px;background:#fa342c;color:#fff;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;transition:background 0.15s;">이웃 추가</button>
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
  _bindFriendFeedActions();
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
        nh += '<div class="friend-notif-row"><span>' + nm + '님이 이웃 요청을 보냈어요</span><div style="display:flex;gap:6px;"><button type="button" data-feed-action="accept-friend-request" data-request-id="' + _feedAttr(req.id) + '" style="background:var(--primary);color:#fff;border:none;border-radius:var(--radius-sm);padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">수락</button><button type="button" data-feed-action="reject-friend-request" data-request-id="' + _feedAttr(req.id) + '" style="background:var(--surface3);color:var(--text-secondary);border:none;border-radius:var(--radius-sm);padding:6px 12px;font-size:12px;cursor:pointer;">거절</button></div></div>';
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

      // canonical 판정: isExerciseDaySuccess (sets 기반 → note-only exercise false positive 제거) + 식단 기록
      const _isActive = (x) => !!(x && (
        isExerciseDaySuccess(x) || (x.muscles||[]).length > 0 ||
        x.breakfast || x.lunch || x.dinner || x.snack ||
        x.bFoods?.length || x.lFoods?.length || x.dFoods?.length || x.sFoods?.length ||
        hasPositiveDayNutrient(x, 'kcal') ||
        x.breakfast_skipped || x.lunch_skipped || x.dinner_skipped ||
        x.bPhoto || x.lPhoto || x.dPhoto || x.sPhoto
      ));
      const hasToday = _isActive(w);
      const hasRecent = !hasToday && recentWorkouts[fi].some(_isActive);
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
        const feedMealMap = {
          breakfast:{foods:'bFoods',memo:'breakfast',photo:'bPhoto'},
          lunch:{foods:'lFoods',memo:'lunch',photo:'lPhoto'},
          dinner:{foods:'dFoods',memo:'dinner',photo:'dPhoto'},
          snack:{foods:'sFoods',memo:'snack',photo:'sPhoto'}
        };
        ['breakfast','lunch','dinner','snack'].forEach(meal => {
          const mk = feedMealMap[meal];
          const foods = w[mk.foods] || [];
          const memo = w[mk.memo] || '';
          const photo = w[mk.photo] || '';
          if (foods.length || memo || photo) {
            const foodText = mealDisplayText(foods, memo, photo ? '사진 기록' : '메뉴 미기록').slice(0, 30);
            const kcal = foods.reduce((s, x) => s + (x.kcal || 0), 0);
            const lb = {breakfast:'🌅',lunch:'☀️',dinner:'🌙',snack:'🥤'}[meal];
            const photoThumb = photo ? `<button type="button" aria-label="${lb} 식단 사진 보기" data-feed-action="open-meal-photo" data-photo="${_feedAttr(photo)}" style="width:34px;height:34px;border:0;border-radius:8px;overflow:hidden;padding:0;flex-shrink:0;background:var(--surface2);cursor:pointer;"><img src="${escapeHtml(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></button>` : '';
            items += '<div class="friend-feed-item"><span style="display:flex;align-items:center;gap:8px;min-width:0;">' + photoThumb + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + lb + ' ' + escapeHtml(foodText) + (kcal ? ' (' + kcal + 'kcal)' : '') + '</span></span></div>';
          }
        });
      }
      if (items || hasToday) { activeCount++; if (!activeNames.includes(name)) activeNames.push(name); }
      const cs = cheerStatuses[fi];
      const isMutual = cs.iSent && cs.theyCheerd;
      let cheerBtn = '';
      if (hasToday) {
        if (isMutual) {
          cheerBtn = `<button class="friend-cheer-btn" data-feed-action="send-cheer" data-cheer-fid="${_feedAttr(f.friendId)}" data-cheer-name="${_feedAttr(name)}" data-is-mutual="1" title="서로 응원!" style="padding:4px 10px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;">🤝 함께응원!</button>`;
        } else if (cs.iSent) {
          cheerBtn = `<button class="friend-cheer-btn" data-feed-action="send-cheer" data-cheer-fid="${_feedAttr(f.friendId)}" data-cheer-name="${_feedAttr(name)}" data-is-mutual="0" title="응원 보내기" style="padding:4px 10px;border:none;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;opacity:0.7;">✓ 응원 완료</button>`;
        } else {
          cheerBtn = `<button class="friend-cheer-btn" data-feed-action="send-cheer" data-cheer-fid="${_feedAttr(f.friendId)}" data-cheer-name="${_feedAttr(name)}" data-is-mutual="0" title="응원 보내기" style="padding:4px 10px;border:none;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.15s;">👏 응원</button>`;
        }
      }
      friendCards.push({ statusClass, html: `<div class="friend-card"><div class="friend-card-header"><span class="friend-avatar" style="font-size:18px;">🍅<span class="status-dot ${statusClass}"></span></span><span class="friend-name" data-feed-action="open-profile" data-fid="${_feedAttr(f.friendId)}" data-fname="${_feedAttr(fullName)}" style="cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;">${name}</span><div style="display:flex;gap:6px;align-items:center;">${cheerBtn}<button class="friend-gift-btn" data-feed-action="open-gift" data-gift-fid="${_feedAttr(f.friendId)}" data-gift-name="${_feedAttr(fullName)}" title="토마토 선물">🍅</button></div></div>${items}</div>` });
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
        return `<div class="activity-avatar-item" data-feed-action="open-profile" data-fid="${_feedAttr(e.fid)}" data-fname="${_feedAttr(e.fullName)}">
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
      ? `<div class="friend-paging-controls">${Array.from({length:totalPages}, (_,i) => `<button type="button" class="friend-paging-dot${i===0?' active':''}" data-feed-action="select-feed-page" data-fp="${i}"></button>`).join('')}</div>`
      : '';

    let hiddenSection = '';
    if (hiddenCards.length > 0) {
      hiddenSection = `<div class="inactive-friends-section">
        <button type="button" class="inactive-friends-toggle" data-feed-action="toggle-inactive-friends" data-count="${hiddenCards.length}">비활성 이웃 ${hiddenCards.length}명 보기 ▾</button>
        <div style="display:none">${hiddenCards.map(c => c.html).join('')}</div>
      </div>`;
    }

    feedEl.innerHTML = banner + activityBarHtml + pagedHtml + dotsHtml + hiddenSection;

    updateHeroSocialProof(activeNames);

    let _friendPageCur = 0;
    const _friendPageTotal = totalPages;

    function _goFriendPage(page) {
      if (page < 0 || page >= _friendPageTotal) return;
      _friendPageCur = page;
      feedEl.querySelectorAll('.friend-page').forEach(p => p.style.display = parseInt(p.dataset.page) === page ? '' : 'none');
      feedEl.querySelectorAll('.friend-paging-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.fp) === page));
    }

    feedEl._friendFeedGoPage = _goFriendPage;

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
      if (btnEl.dataset.isMutual === '1') {
        showToast('함께응원은 취소할 수 없어요 🤝', 2000, 'info');
        return;
      }
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
            btnEl.dataset.isMutual = '1';
            btnEl.textContent = '🤝 함께응원!';
            btnEl.style.background = 'var(--primary, #fa342c)';
            btnEl.style.color = '#fff';
            btnEl.style.opacity = '1';
          } else {
            haptic('success');
            btnEl.dataset.isMutual = '0';
            btnEl.textContent = '✓ 응원 완료';
            btnEl.style.background = 'var(--primary-bg, #fdf0f0)';
            btnEl.style.color = 'var(--primary, #fa342c)';
            btnEl.style.opacity = '0.7';
          }
        } else {
          btnEl.dataset.isMutual = '0';
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

    feedEl._friendFeedSendCheer = _sendCheer;
  } catch(e) { console.warn('[friends] feed:', e); feedEl.innerHTML = ''; }
}

const _scheduleFriendFeedRender = createSocialRenderScheduler(
  () => renderFriendFeed(),
  'friend-feed render',
);

// ── 친구 관리 모달 ───────────────────────────────────────────────
export async function openFriendManager() {
  _bindFriendFeedActions();
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
      <button type="button" data-feed-action="introduce-friend" data-friend-id="${_feedAttr(f.friendId)}" data-friend-name="${_feedAttr(nick)}" style="background:none;border:none;color:var(--seed-red-600,#fc6a66);font-size:12px;cursor:pointer;padding:4px 8px;">소개</button>
      <button type="button" data-feed-action="edit-friend-nickname" data-friend-id="${_feedAttr(f.friendId)}" style="background:none;border:none;color:var(--primary);font-size:12px;cursor:pointer;padding:4px 8px;${!isAdmin() ? 'display:none;' : ''}">별명</button>
      <button type="button" data-feed-action="delete-friend" data-request-id="${_feedAttr(f.reqId)}" style="background:none;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;">삭제</button>
    </div>`;
  }).join('');

  let neighborHtml = '';
  try {
    const user = getCurrentUser();
    const myId = user?.id;
    const friendIds = new Set(friends.map(f => f.friendId));
    friendIds.add(myId);
    const suggestList = accounts.filter(a => a.id && !friendIds.has(a.id) && !a.id.includes('(guest)'));
    if (suggestList.length > 0) {
      const rows = suggestList.map(a => {
        const nick = resolveNickname(a, accounts);
        return `<div class="neighbor-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);" data-nid="${a.id}" data-nnick="${nick.replace(/"/g,'&quot;')}">
          <div style="width:40px;height:40px;border-radius:50%;background:#fdf0f0;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;cursor:pointer;">🍅</div>
          <div style="flex:1;min-width:0;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;">
            <div style="font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${nick}</div>
          </div>
          <button type="button" data-feed-action="quick-add-neighbor" data-target-id="${_feedAttr(a.id)}" style="padding:7px 16px;border:none;border-radius:999px;background:#fa342c;color:#fff;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;transition:background 0.15s;">이웃 추가</button>
        </div>`;
      }).join('');
      neighborHtml = `
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;margin-top:16px;">새로운 이웃</div>
        <div id="modal-neighbor-list">${rows}</div>`;
    }
  } catch(e) { console.warn('[suggest]', e); }

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;">
    <div class="modal-sheet" style="max-width:400px;">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">이웃 관리</div>
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">이웃 추가</div>
        <div style="display:flex;gap:6px;">
          <input class="login-input" id="friend-add-last" placeholder="성" style="flex:1;height:40px;font-size:13px;">
          <input class="login-input" id="friend-add-first" placeholder="이름" style="flex:2;height:40px;font-size:13px;">
          <button type="button" data-feed-action="send-friend-request" style="background:var(--primary);color:#fff;border:none;border-radius:999px;padding:0 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">요청</button>
        </div>
        <div id="friend-add-status" style="font-size:12px;margin-top:6px;min-height:16px;"></div>
      </div>
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">내 이웃</div>
      <div id="friend-manager-list">${fl}</div>
      ${neighborHtml}
      <button type="button" data-feed-action="close-dynamic-modal" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:12px;">닫기</button>
    </div>
  </div>`;
  _bindFriendManagerActions(modal);
}

export async function sendFriendReq() {
  const ln = document.getElementById('friend-add-last')?.value.trim();
  const fn = document.getElementById('friend-add-first')?.value.trim();
  const st = document.getElementById('friend-add-status');
  if (!ln || !fn) { st.innerHTML = '<span style="color:var(--text-tertiary);">성과 이름을 입력해주세요.</span>'; return; }
  const tid = (ln + '_' + fn).toLowerCase().replace(/\s/g, '');
  const user = getCurrentUser();
  if (!user) return;
  const myId = user.id;
  if (tid === myId || tid === user.id) { st.innerHTML = '<span style="color:var(--text-tertiary);">본인에게는 요청할 수 없어요.</span>'; return; }
  const accs = await getAccountList();
  if (!accs.find(a => a.id === tid)) { st.innerHTML = '<span style="color:#ef4444;">해당 이름의 계정이 없어요.</span>'; return; }
  const r = await sendFriendRequest(myId, tid);
  st.innerHTML = r.error ? '<span style="color:var(--text-tertiary);">' + r.error + '</span>' : '<span style="color:var(--primary);">이웃 요청을 보냈어요!</span>';
  if (!r.error) { recordAction('이웃요청'); document.getElementById('friend-add-last').value = ''; document.getElementById('friend-add-first').value = ''; }
};

export async function acceptFriendReq(id) {
  await acceptFriendRequest(id);
  recordAction('이웃수락');
  showToast('🤝 이제 이웃이 되었어요!', 2500, 'success');
  haptic('success');
  if (_renderHomeFn) _renderHomeFn();
};
export async function rejectFriendReq(id) { await removeFriend(id); showToast('요청을 거절했어요', 2500, 'info'); if (_renderHomeFn) _renderHomeFn(); };
export async function deleteFriend(id) {
  const ok = await confirmAction({ title: '이웃 삭제', message: '이웃을 삭제할까요?', destructive: true, longPress: 2000 });
  if (!ok) return;
  // 더블탭 가드: 삭제 완료 전 재호출 방지
  if (_deleteFriendLock) return;
  _deleteFriendLock = true;
  try {
    await removeFriend(id);
    showToast('이웃을 삭제했어요', 2500, 'info');
    openFriendManager();
  } finally {
    _deleteFriendLock = false;
  }
};

export async function quickAddNeighbor(targetId) {
  const user = getCurrentUser();
  if (!user) return;
  const myId = user.id;
  const r = await sendFriendRequest(myId, targetId);
  if (r.error) { showToast(r.error, 2500, 'error'); }
  else { showToast('이웃 요청을 보냈어요!', 2500, 'success'); }
  _scheduleFriendFeedRender('quick-add-neighbor');
};

export async function editFriendNickname(friendId) {
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
  openFriendManager();
};

// ── 리액션 시스템 ────────────────────────────────────────────────
export const REACTIONS = [
  { emoji: '👏', label: '대단해' },
  { emoji: '🔥', label: '불타오르네' },
  { emoji: '💪', label: '파이팅' },
  { emoji: '😍', label: '맛있겠다' },
  { emoji: '🍅', label: '토마토' },
];

export async function friendLike(tid, dk, field) {
  return runOptimisticSocialAction({
    commit: () => toggleLike(tid, dk, field),
    refresh: reason => _scheduleFriendFeedRender(reason),
    reason: 'friend-like',
  });
};

export function showReactionPicker(btn, tid, dk, field) {
  _bindFriendFeedActions();
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = REACTIONS.map(r =>
    `<button type="button" class="reaction-opt" data-feed-action="send-reaction" data-target-id="${_feedAttr(tid)}" data-date-key="${_feedAttr(dk)}" data-field="${_feedAttr(field)}" data-emoji="${_feedAttr(r.emoji)}">${r.emoji}</button>`
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

export async function showReactionDetail(btn, tid, dk, field) {
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
