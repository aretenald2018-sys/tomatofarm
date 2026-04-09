// ================================================================
// home/friend-profile.js — 친구 프로필, 방명록, 댓글, 선물
// ================================================================

import { TODAY, getCurrentUser, getMyFriends, getAccountList,
         getFriendWorkout, getFriendTomatoState, getLikes, toggleLike,
         sendFriendRequest, sendTomatoGift, revertTomatoGift,
         getGuestbook, writeGuestbook, deleteGuestbookEntry,
         getComments, writeComment, editComment, deleteComment,
         introduceFriend, markNotificationRead,
         isAdmin, isAdminGuest, getAdminId, getAdminGuestId,
         isAdminInstance, isSameInstance, getDataOwnerId,
         getTomatoState, dateKey, recordAction,
         getAllGuilds }  from '../data.js';
import { resolveNickname, showToast, haptic, formatTimeAgo } from './utils.js';

// 순환 참조 방지: renderHome, renderFriendFeed, refreshNotifCenter 주입
let _renderHomeFn = null;
let _renderFriendFeedFn = null;
let _refreshNotifCenterFn = null;

export function setFriendProfileDeps({ renderHome, renderFriendFeed, refreshNotifCenter }) {
  _renderHomeFn = renderHome;
  _renderFriendFeedFn = renderFriendFeed;
  _refreshNotifCenterFn = refreshNotifCenter;
}

// ── 친구 프로필 상세 ─────────────────────────────────────────────
window.openFriendProfile = async function(friendId, friendName, scrollToSection, overrideDateKey) {
  const user = getCurrentUser();
  const myDataId = getDataOwnerId();

  const normalizedFriendId = isAdminInstance(friendId) ? getAdminId() : friendId;

  const isMyProfile = friendId === user?.id || friendId === myDataId || normalizedFriendId === myDataId;
  const myFriends = await getMyFriends();
  const isFriend = isMyProfile || myFriends.some(f => f.friendId === friendId || f.friendId === normalizedFriendId);
  const DOW = ['일','월','화','수','목','금','토'];

  const allAccounts = await getAccountList();
  const friendAcc = isAdminInstance(friendId)
    ? (allAccounts.find(a => a.id === getAdminId()) || allAccounts.find(a => a.id === friendId))
    : allAccounts.find(a => a.id === friendId);
  let rawNick = friendAcc?.nickname || '';
  if (isAdminInstance(friendId)) {
    const adminBaseName = friendAcc ? friendAcc.lastName + friendAcc.firstName.replace(/\(.*\)/, '') : '';
    const guestAcc = allAccounts.find(a => a.id === getAdminGuestId());
    const adminAcc2 = allAccounts.find(a => a.id === getAdminId());
    const gNick = guestAcc?.nickname || '';
    const aNick = adminAcc2?.nickname || '';
    const isReal = (n) => !n || n === adminBaseName || n === adminBaseName + '(Admin)' || n === adminBaseName + '(Guest)';
    rawNick = (!rawNick || isReal(rawNick)) ? (!isReal(gNick) ? gNick : !isReal(aNick) ? aNick : rawNick) : rawNick;
  }
  const baseName = friendAcc ? friendAcc.lastName + friendAcc.firstName.replace(/\(.*\)/, '') : friendName.replace(/_/g, '');
  const nickname = (rawNick && rawNick !== baseName) ? rawNick : baseName;
  const realName = baseName;
  const ini = nickname.charAt(0);
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const tk = (overrideDateKey && overrideDateKey !== todayKey) ? overrideDateKey : todayKey;
  const isHistorical = tk !== todayKey;
  const dateLabel = isHistorical
    ? (() => { const [y,m,d] = tk.split('-').map(Number); const dow = DOW[new Date(y,m-1,d).getDay()]; return `${m}/${d}(${dow})`; })()
    : '오늘';

  const lookupId = isMyProfile ? myDataId : normalizedFriendId;
  const todayW = await getFriendWorkout(lookupId, tk);

  // 1. 오늘 식단 상세
  let todayDietHtml = '';
  const meals = [
    { key: 'bFoods', label: '아침', memo: 'breakfast' },
    { key: 'lFoods', label: '점심', memo: 'lunch' },
    { key: 'dFoods', label: '저녁', memo: 'dinner' },
    { key: 'sFoods', label: '간식', memo: 'snack' },
  ];
  const allLikes = todayW ? await getLikes(friendId, tk) : [];
  const getReactionCount = (field) => allLikes.filter(l => l.field === field).length;
  const getReactionEmojis = (field) => {
    const emojis = allLikes.filter(l => l.field === field && l.emoji).map(l => l.emoji);
    return [...new Set(emojis)];
  };
  if (todayW) {
    const photoKeys = { breakfast: 'bPhoto', lunch: 'lPhoto', dinner: 'dPhoto', snack: 'sPhoto' };
    meals.forEach(m => {
      const foods = todayW[m.key] || [];
      const memoText = todayW[m.memo] || '';
      const photo = todayW[photoKeys[m.memo]];
      if (foods.length || memoText || photo) {
        const foodNames = foods.map(f => f.name).join(', ') || memoText;
        const kcal = foods.reduce((s, f) => s + (f.kcal || 0), 0);
        const photoThumb = photo ? `<div style="width:40px;height:40px;border-radius:8px;overflow:hidden;flex-shrink:0;cursor:pointer;margin-right:8px;" onclick="event.stopPropagation();openMealPhotoLightbox('${photo.replace(/'/g,"\\'")}')"><img src="${photo}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>` : '';
        const mealField = 'meal_' + m.memo;
        const mealReactCount = getReactionCount(mealField);
        const mealEmojis = getReactionEmojis(mealField);
        const emojiDisplay = mealEmojis.length > 0 ? mealEmojis.join('') : '';
        const reactBadge = mealReactCount > 0 ? `<span class="react-badge-detail" onclick="event.stopPropagation();showReactionDetail(this,'${friendId}','${tk}','${mealField}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:999px;background:var(--surface2);"><span style="font-size:12px;">${emojiDisplay}</span><span style="font-size:10px;font-weight:600;color:var(--primary);">${mealReactCount}</span></span>` : '';
        const reactionBtn = (!isMyProfile) ? `${reactBadge}<button class="friend-like-btn" onclick="showReactionPicker(this,'${friendId}','${tk}','${mealField}')" style="flex-shrink:0;font-size:16px;background:none;border:none;cursor:pointer;padding:2px;">🤍</button>` : (mealReactCount > 0 ? `<span class="react-badge-detail" onclick="event.stopPropagation();showReactionDetail(this,'${friendId}','${tk}','${mealField}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:999px;background:var(--surface2);"><span style="font-size:12px;">${emojiDisplay}</span><span style="font-size:10px;font-weight:600;color:var(--primary);">${mealReactCount}</span></span>` : `<span style="font-size:14px;opacity:0.3;">🤍</span>`);
        const mealCommentBtn = `<button class="comment-toggle-btn" onclick="toggleCommentSection('${normalizedFriendId}','${tk}','${m.memo}')" style="flex-shrink:0;font-size:13px;background:none;border:none;cursor:pointer;padding:2px 4px;color:var(--text-tertiary);">💬</button>`;
        todayDietHtml += `<div style="padding:6px 0;font-size:12px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            ${photoThumb}
            <span style="color:var(--text-secondary);flex-shrink:0;">${m.label}</span>
            <span style="color:var(--text);flex:1;text-align:right;margin:0 8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${foodNames}${kcal ? ` <span style="color:var(--text-tertiary);">${kcal}kcal</span>` : ''}</span>
            ${reactionBtn}
            ${mealCommentBtn}
          </div>
          <div id="comments-${m.memo}" class="comment-section-panel" style="display:none;"></div>
        </div>`;
      }
    });
  }
  if (!todayDietHtml) todayDietHtml = '';

  // 2~3. 주간 운동 데이터
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(TODAY); d.setDate(d.getDate() - i); return d;
  });
  const weekResults = await Promise.allSettled(
    weekDates.map(d => getFriendWorkout(lookupId, dateKey(d.getFullYear(), d.getMonth(), d.getDate())))
  );
  const weekWorkouts = weekResults.map(r => r.status === 'fulfilled' ? r.value : null);

  let volumeGrowth = '';
  if (todayW?.exercises?.length) {
    const todayVol = (todayW.exercises || []).reduce((s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.kg||0)*(set.reps||0), 0), 0);
    let prevVol = 0;
    for (let di = 1; di < weekWorkouts.length; di++) {
      const pw = weekWorkouts[di];
      if (pw?.exercises?.length) {
        prevVol = pw.exercises.reduce((s, e) => s + (e.sets || []).reduce((ss, set) => ss + (set.kg||0)*(set.reps||0), 0), 0);
        break;
      }
    }
    if (prevVol > 0 && todayVol > 0) {
      const diff = Math.round(((todayVol - prevVol) / prevVol) * 100);
      const sign = diff > 0 ? '+' : '';
      const color = diff > 0 ? 'var(--primary)' : diff < 0 ? '#e53935' : 'var(--text-tertiary)';
      const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      volumeGrowth = `<span style="font-size:12px;font-weight:700;color:${color};margin-left:6px;">${arrow} ${sign}${diff}%</span>`;
    } else if (todayVol > 0) {
      volumeGrowth = `<span style="font-size:11px;color:var(--text-tertiary);margin-left:6px;">첫 기록</span>`;
    }
  }

  let workoutDays = 0, streak = 0, streakCounting = true;
  for (let i = 0; i < 7; i++) {
    const w = weekWorkouts[i];
    const has = (w?.muscles?.length || w?.exercises?.length) ? true : false;
    if (has) workoutDays++;
    if (streakCounting && has) streak++;
    else if (streakCounting && i > 0) streakCounting = false;
  }

  let tomatoCount, tomatoLevel = 1;
  if (isMyProfile) {
    const ts = getTomatoState();
    tomatoCount = Math.max(0, ts.totalTomatoes + (ts.giftedReceived || 0) - (ts.giftedSent || 0));
  } else {
    const ts = await getFriendTomatoState(lookupId);
    tomatoCount = Math.max(0, ts.totalTomatoes + (ts.giftedReceived || 0) - (ts.giftedSent || 0));
  }
  if (typeof tomatoCount === 'number') {
    if (tomatoCount >= 100) tomatoLevel = 10;
    else if (tomatoCount >= 70) tomatoLevel = 9;
    else if (tomatoCount >= 50) tomatoLevel = 8;
    else if (tomatoCount >= 35) tomatoLevel = 7;
    else if (tomatoCount >= 24) tomatoLevel = 6;
    else if (tomatoCount >= 16) tomatoLevel = 5;
    else if (tomatoCount >= 10) tomatoLevel = 4;
    else if (tomatoCount >= 5) tomatoLevel = 3;
    else if (tomatoCount >= 2) tomatoLevel = 2;
    else tomatoLevel = 1;
  }

  let goalPct = '—';

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; modal.dataset.isFriend = isFriend ? '1' : '0'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;max-height:85vh;overflow-y:auto;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="text-align:center;padding:16px 0 8px;">
        <div style="width:56px;height:56px;border-radius:50%;background:#fff3e0;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 6px;">🍅</div>
        ${typeof tomatoCount === 'number' ? `<div style="font-size:11px;font-weight:700;color:var(--primary);margin-bottom:6px;">Lv.${tomatoLevel}</div>` : ''}
        <div style="font-size:20px;font-weight:700;color:var(--text);-webkit-user-select:none;user-select:none;">${nickname}</div>
        ${isFriend || isMyProfile
          ? (nickname !== realName ? `<div style="font-size:13px;color:var(--text-tertiary);margin-top:2px;-webkit-user-select:none;user-select:none;">${realName}</div>` : '')
          : ''
        }
        ${(() => {
          const userGuilds = isMyProfile ? (user?.guilds || friendAcc?.guilds || []) : (friendAcc?.guilds || []);
          const primaryG = isMyProfile ? (user?.primaryGuild || friendAcc?.primaryGuild || '') : (friendAcc?.primaryGuild || '');
          const pendingGuilds = isMyProfile ? (user?.pendingGuilds || []) : [];
          const hasPending = pendingGuilds.filter(g => !userGuilds.includes(g)).length > 0;
          if (primaryG && userGuilds.includes(primaryG)) {
            // 대표길드 1개만 표시
            const setBtn = isMyProfile ? `<button onclick="openQuickGuildJoin()" style="background:none;border:none;color:var(--text-tertiary);font-size:11px;font-weight:500;cursor:pointer;padding:0;margin-left:4px;">변경</button>` : '';
            const pendingInfo = hasPending ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">⏳ ${pendingGuilds.filter(g => !userGuilds.includes(g)).join(', ')} 가입 대기중</div>` : '';
            return `<div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:6px;"><span class="guild-chip primary" style="font-size:11px;padding:3px 8px;">★ ${primaryG}</span>${setBtn}</div>${pendingInfo}<div id="quick-guild-join-list" style="display:none;margin-top:6px;"></div>`;
          } else if (userGuilds.length > 0) {
            // 길드는 있지만 대표길드 미설정
            const setBtn = isMyProfile ? ` <button onclick="openQuickGuildJoin()" style="background:none;border:none;color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;padding:0;">대표길드 설정하기</button>` : '';
            const firstChip = `<span class="guild-chip" style="font-size:11px;padding:3px 8px;">${userGuilds[0]}</span>`;
            return `<div style="display:flex;align-items:center;justify-content:center;gap:4px;margin-top:6px;">${firstChip}${setBtn}</div><div id="quick-guild-join-list" style="display:none;margin-top:6px;"></div>`;
          } else if (hasPending) {
            // 가입 대기중만 있음
            const pendingInfo = `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary);">⏳ ${pendingGuilds.filter(g => !userGuilds.includes(g)).join(', ')} 가입 대기중</div>`;
            const setBtn = isMyProfile ? ` <button onclick="openQuickGuildJoin()" style="background:none;border:none;color:var(--primary);font-size:11px;font-weight:600;cursor:pointer;padding:0;margin-top:2px;">대표길드 설정하기</button>` : '';
            return `${pendingInfo}${setBtn}<div id="quick-guild-join-list" style="display:none;margin-top:6px;"></div>`;
          } else if (isMyProfile) {
            return `<div style="margin-top:6px;font-size:12px;color:var(--text-tertiary);">소속 길드가 없습니다. <button onclick="openQuickGuildJoin()" style="background:none;border:none;color:var(--primary);font-size:12px;font-weight:600;cursor:pointer;padding:0;">대표길드 설정하기</button></div><div id="quick-guild-join-list" style="display:none;margin-top:6px;"></div>`;
          }
          return '';
        })()}
        ${!isMyProfile ? `<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px;">
          ${!isFriend ? `<button onclick="quickAddNeighbor('${friendId}')" style="padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:11px;font-weight:500;cursor:pointer;transition:background 0.1s ease-in-out;">🤝 이웃 추가</button>` : ''}
          <button onclick="openIntroduceFriend('${friendId}','${friendName}')" style="padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:11px;font-weight:500;cursor:pointer;transition:background 0.1s ease-in-out;">👋 다른 이웃 소개</button>
          <button onclick="openGuildInvite('${friendId}','${friendName}')" style="padding:6px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:11px;font-weight:500;cursor:pointer;transition:background 0.1s ease-in-out;">🏠 길드 초대</button>
        </div>` : ''}
      </div>

      <div style="display:flex;justify-content:space-around;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin:8px 0;">
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--text);">${workoutDays}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">/7</span></div>
          <div style="font-size:10px;color:var(--text-tertiary);">이번 주</div>
        </div>
        <div style="width:1px;background:var(--border);"></div>
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--primary);">${streak}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">일</span></div>
          <div style="font-size:10px;color:var(--text-tertiary);">연속 기록</div>
        </div>
        <div style="width:1px;background:var(--border);"></div>
        <div style="text-align:center;">
          <div style="font-size:20px;font-weight:700;color:var(--text);">${goalPct}</div>
          <div style="font-size:10px;color:var(--text-tertiary);">목표 달성</div>
        </div>
      </div>

      <div style="padding:10px 4px 6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;font-weight:500;color:var(--text-tertiary);">${dateLabel}의 운동 ${volumeGrowth}</span>
          ${(() => {
            const wReactCount = getReactionCount('workout');
            const wEmojis = getReactionEmojis('workout');
            const wEmojiDisplay = wEmojis.length > 0 ? wEmojis.join('') : '';
            const wBadge = wReactCount > 0 ? `<span class="react-badge-detail" onclick="event.stopPropagation();showReactionDetail(this,'${friendId}','${tk}','workout')" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:999px;background:var(--surface2);margin-right:2px;"><span style="font-size:12px;">${wEmojiDisplay}</span><span style="font-size:10px;font-weight:600;color:var(--primary);">${wReactCount}</span></span>` : '';
            if (!isMyProfile && todayW?.exercises?.length) return `${wBadge}<button class="friend-like-btn" onclick="showReactionPicker(this,'${friendId}','${tk}','workout')" style="font-size:16px;background:none;border:none;cursor:pointer;padding:2px;">🤍</button>`;
            if (wReactCount > 0) return `<span class="react-badge-detail" onclick="event.stopPropagation();showReactionDetail(this,'${friendId}','${tk}','workout')" style="cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:999px;background:var(--surface2);"><span style="font-size:12px;">${wEmojiDisplay}</span><span style="font-size:10px;font-weight:600;color:var(--primary);">${wReactCount}</span></span>`;
            return '';
          })()}
        </div>
        ${todayW?.exercises?.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${(todayW.muscles || []).map(m => `<span style="font-size:11px;padding:3px 8px;background:var(--primary-bg);color:var(--primary);border-radius:999px;font-weight:600;">${m}</span>`).join('')}
          </div>
          ${todayW?.workoutPhoto ? `<img src="${todayW.workoutPhoto}" style="width:100%;max-height:240px;object-fit:contain;border-radius:8px;margin-top:8px;">` : ''}
        ` : '<div style="font-size:12px;color:var(--text-tertiary);">아직 기록이 없어요</div>'}
        <button class="comment-toggle-btn" onclick="toggleCommentSection('${normalizedFriendId}','${tk}','workout')" style="font-size:12px;background:none;border:1px solid var(--border);border-radius:999px;padding:4px 10px;cursor:pointer;color:var(--text-tertiary);margin-top:6px;">💬 댓글</button>
        <div id="comments-workout" class="comment-section-panel" style="display:none;"></div>
      </div>

      <div style="padding:8px 4px;border-top:1px solid var(--border);margin-top:6px;">
        <div style="font-size:12px;font-weight:500;color:var(--text-tertiary);margin-bottom:6px;">${dateLabel}의 식단</div>
        ${todayDietHtml}
      </div>
      <div style="padding:10px 4px;border-top:1px solid var(--border);margin-top:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:500;color:var(--text-tertiary);">수확한 토마토</span>
          <span style="font-size:18px;font-weight:700;color:var(--text);">${tomatoCount}<span style="font-size:11px;font-weight:400;color:var(--text-tertiary);"> 개</span></span>
        </div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;">
          ${typeof tomatoCount === 'number' ? Array.from({length:Math.max(tomatoCount,1)},(_,i)=> i < tomatoCount
            ? '<span style="font-size:16px;">🍅</span>'
            : '<span style="font-size:16px;opacity:0.2;">🍅</span>'
          ).join('') : '<span style="font-size:12px;color:var(--text-tertiary);">비공개</span>'}
        </div>
      </div>

      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <span style="font-size:13px;font-weight:500;color:var(--text-secondary);">오늘의 방명록</span>
        </div>
        <div id="guestbook-list" style="max-height:160px;overflow-y:auto;margin-bottom:10px;">
          <div style="text-align:center;padding:12px;font-size:12px;color:var(--text-tertiary);">불러오는 중...</div>
        </div>
        ${isFriend || isMyProfile ? `<div style="display:flex;gap:6px;">
          <input id="guestbook-input" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:999px;font-size:13px;color:var(--text);background:var(--surface2);outline:none;font-family:var(--font-sans);transition:border-color 0.15s;" placeholder="응원 한마디 남기기" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')submitGuestbook('${normalizedFriendId}')">
          <button onclick="submitGuestbook('${normalizedFriendId}')" style="padding:8px 14px;border:none;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;">남기기</button>
        </div>` : ''}
      </div>

      ${isFriend || isMyProfile ? `
        <div style="display:flex;gap:6px;padding:14px 0 8px;">
          <button onclick="openTomatoGiftModal('${friendId}','${friendName}')" style="flex:1;padding:9px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">🍅 선물</button>
          <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;">닫기</button>
        </div>
      ` : `
        <div style="display:flex;gap:6px;padding:14px 0 8px;">
          <button onclick="quickAddNeighbor('${friendId}')" style="flex:1;padding:9px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:12px;font-weight:600;cursor:pointer;">이웃 추가하기</button>
          <button onclick="document.getElementById('dynamic-modal')?.remove()" style="flex:1;padding:9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;">닫기</button>
        </div>
      `}
    </div>
  </div>`;

  loadGuestbook(normalizedFriendId);

  {
    const commentPanels = document.querySelectorAll('#dynamic-modal .comment-section-panel');
    commentPanels.forEach(panel => {
      panel.style.display = 'block';
      panel.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-tertiary);">불러오는 중...</div>';
    });
    const sectionNames = Array.from(commentPanels).map(p => p.id.replace('comments-', ''));
    Promise.all(sectionNames.map(s => loadComments(normalizedFriendId, tk, s, isFriend)));
  }

  if (scrollToSection) {
    setTimeout(async () => {
      let targetEl = null;
      if (scrollToSection === 'guestbook') {
        targetEl = document.getElementById('guestbook-list');
      } else if (scrollToSection === 'reactions') {
        targetEl = document.getElementById('guestbook-list')?.closest('div[style*="border-top"]');
      } else if (scrollToSection?.startsWith('comments_')) {
        const cmtSection = scrollToSection.replace('comments_', '');
        if (cmtSection) {
          const cmtPanel = document.getElementById(`comments-${cmtSection}`);
          if (cmtPanel && cmtPanel.style.display === 'none') {
            await window.toggleCommentSection(normalizedFriendId, tk, cmtSection);
          }
          targetEl = cmtPanel;
        }
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.style.transition = 'background 0.3s';
        targetEl.style.background = 'var(--seed-bg-brand-weak)';
        setTimeout(() => { targetEl.style.background = ''; }, 1500);
      }
    }, 400);
  }
};

// ── 방명록 ───────────────────────────────────────────────────────
let _gbReplyParentId = null;

async function loadGuestbook(targetId) {
  const list = document.getElementById('guestbook-list');
  if (!list) return;
  try {
    const allEntries = await getGuestbook(targetId);
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const entries = allEntries.filter(e => e.createdAt >= todayStart.getTime());
    const user = getCurrentUser();
    const myId = user?.id;
    const myDataOwnerId = getDataOwnerId();
    if (!entries.length) {
      list.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text-tertiary);">오늘의 응원이 아직 없어요.<br>첫 번째 응원을 남겨보세요!</div>';
      return;
    }
    const topEntries = entries.filter(e => !e.parentId);
    const replies = entries.filter(e => e.parentId);
    const replyMap = {};
    replies.forEach(r => { (replyMap[r.parentId] = replyMap[r.parentId] || []).push(r); });

    function renderEntry(e, isReply = false) {
      const isMe = e.from === myId || isSameInstance(e.from, myId);
      const isOwner = targetId === myId || targetId === myDataOwnerId;
      const timeAgo = formatTimeAgo(e.createdAt);
      const delBtn = (isMe || isOwner) ? `<button onclick="deleteGb('${e.id}','${targetId}')" style="background:none;border:none;color:var(--text-tertiary);font-size:10px;cursor:pointer;padding:2px 4px;">삭제</button>` : '';
      const replyBtn = !isReply ? `<button onclick="startGbReply('${e.id}','${(e.fromName||'').replace(/'/g,"\\'")}')" style="background:none;border:none;color:var(--text-tertiary);font-size:10px;cursor:pointer;padding:2px 4px;">답글</button>` : '';
      return `<div style="padding:${isReply?'6':'8'}px 0;${isReply?'margin-left:36px;':''}border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:8px;">
        <div style="width:${isReply?'22':'28'}px;height:${isReply?'22':'28'}px;border-radius:50%;background:${isMe?'#fdf0f0':'var(--surface3)'};color:${isMe?'var(--primary)':'var(--text-secondary)'};display:flex;align-items:center;justify-content:center;font-size:${isReply?'9':'11'}px;font-weight:700;flex-shrink:0;">${(e.fromName||'?').charAt(0)}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:${isReply?'11':'12'}px;font-weight:600;color:var(--text);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();document.getElementById('dynamic-modal')?.remove();openFriendProfile('${e.from}','${e.fromName || '익명'}')">${e.fromName || '익명'}</span>
            <span style="font-size:10px;color:var(--text-tertiary);">${timeAgo}</span>
            ${replyBtn}${delBtn}
          </div>
          <div style="font-size:${isReply?'12':'13'}px;color:var(--text-secondary);margin-top:2px;line-height:1.4;word-break:break-word;">${e.message}</div>
        </div>
      </div>`;
    }

    list.innerHTML = topEntries.slice(0, 20).map(e => {
      let html = renderEntry(e);
      const childReplies = (replyMap[e.id] || []).sort((a,b) => a.createdAt - b.createdAt);
      childReplies.forEach(r => { html += renderEntry(r, true); });
      return html;
    }).join('');
  } catch(err) {
    list.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-tertiary);">불러올 수 없어요</div>';
  }
}

window.openIntroduceFriend = async function(friendId, friendName) {
  const friends = await getMyFriends();
  const accounts = await getAccountList();
  const others = friends.filter(f => f.friendId !== friendId);
  if (!others.length) { showToast('소개할 다른 이웃이 없어요', 2500, 'warning'); return; }
  let listHtml = others.map(f => {
    const acc = accounts.find(a => a.id === f.friendId);
    const nm = acc ? resolveNickname(acc, accounts) : f.friendId.replace(/_/g, '');
    const ini = nm.charAt(0);
    return `<button onclick="confirmIntroduce('${friendId}','${f.friendId}','${friendName}','${nm}')" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer;margin-bottom:6px;text-align:left;transition:all 0.15s;">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${ini}</div>
      <span style="font-size:14px;font-weight:500;color:var(--text);">${nm}</span>
    </button>`;
  }).join('');

  const intro = document.createElement('div'); intro.id = 'introduce-modal'; document.body.appendChild(intro);
  intro.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1100;" onclick="if(event.target===this){document.getElementById('introduce-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:360px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">이웃 소개하기</div>
      <div style="text-align:center;font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        <b>${friendName}</b>님에게 소개해줄 이웃을 선택하세요
      </div>
      <div style="max-height:240px;overflow-y:auto;">${listHtml}</div>
      <button onclick="document.getElementById('introduce-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;">취소</button>
    </div>
  </div>`;
};

window.sendFriendFromIntro = async function(targetId, notifId) {
  const user = getCurrentUser();
  if (!user) return;
  const myId = isAdminGuest() ? getAdminId() : user.id;
  const r = await sendFriendRequest(myId, targetId);
  if (r.error) { showToast(r.error, 2500, 'error'); }
  else { showToast('이웃 요청을 보냈어요!', 2500, 'success'); }
  await markNotificationRead(notifId);
  if (_refreshNotifCenterFn) _refreshNotifCenterFn();
};

window.confirmIntroduce = async function(idA, idB, nameA, nameB) {
  document.getElementById('introduce-modal')?.remove();
  const result = await introduceFriend(idA, idB, nameA, nameB);
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  recordAction('이웃소개');
  showToast(`${nameA}님과 ${nameB}님을 소개했어요! 👋`, 2500, 'success');
};

// 길드 초대 (내 길드 중 하나에 초대)
window.openGuildInvite = async function(friendId, friendName) {
  const user = getCurrentUser();
  if (!user) return;
  const myGuilds = user.guilds || [];
  if (!myGuilds.length) { showToast('소속 길드가 없어요. 먼저 길드에 가입해주세요.', 2500, 'warning'); return; }

  let listHtml = myGuilds.map(g =>
    `<button onclick="confirmGuildInvite('${friendId}','${friendName}','${g.replace(/'/g, "\\'")}')" style="display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:1px solid var(--border);border-radius:var(--radius-md,12px);background:var(--surface);cursor:pointer;margin-bottom:6px;text-align:left;transition:all 0.1s ease-in-out;">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-bg);color:var(--primary);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🏠</div>
      <span style="font-size:14px;font-weight:500;color:var(--text);">${g}</span>
    </button>`
  ).join('');

  const modal = document.createElement('div'); modal.id = 'guild-invite-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1100;" onclick="if(event.target===this){document.getElementById('guild-invite-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:360px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">길드에 초대하기</div>
      <div style="text-align:center;font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
        <b>${friendName}</b>님을 초대할 길드를 선택하세요
      </div>
      <div style="max-height:240px;overflow-y:auto;">${listHtml}</div>
      <button onclick="document.getElementById('guild-invite-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:8px;">취소</button>
    </div>
  </div>`;
};

window.confirmGuildInvite = async function(friendId, friendName, guildName) {
  document.getElementById('guild-invite-modal')?.remove();
  const user = getCurrentUser();
  if (!user) return;
  const { sendNotification: sn } = await import('../data.js');
  const myName = user.nickname || (user.lastName + user.firstName);
  await sn(friendId, {
    type: 'guild_invite',
    from: isAdminGuest() ? getAdminId() : user.id,
    guildId: guildName,
    guildName,
    message: `${myName}님이 ${guildName} 모임에 초대했어요! 프로필에서 가입할 수 있어요.`,
  });
  recordAction('길드초대');
  showToast(`${friendName}님에게 ${guildName} 초대를 보냈어요!`, 2500, 'success');
};

// 프로필에서 빠른 길드 가입 (추가하기 버튼)
window.openQuickGuildJoin = async function() {
  const listEl = document.getElementById('quick-guild-join-list');
  if (!listEl) return;
  if (listEl.style.display !== 'none') { listEl.style.display = 'none'; return; }

  const { getAllGuilds } = await import('../data.js');
  const user = getCurrentUser();
  const myGuilds = new Set(user?.guilds || []);
  const myPending = new Set(user?.pendingGuilds || []);
  const guilds = await getAllGuilds();
  if (!guilds.length) {
    listEl.innerHTML = '<div style="font-size:11px;color:var(--text-tertiary);padding:4px 0;text-align:center;">아직 생성된 길드가 없어요</div>';
    listEl.style.display = '';
    return;
  }
  // 내 길드를 상단에 표시 (대표길드 설정용)
  const sorted = [...guilds].sort((a, b) => {
    const aM = myGuilds.has(a.name) ? 0 : myPending.has(a.name) ? 1 : 2;
    const bM = myGuilds.has(b.name) ? 0 : myPending.has(b.name) ? 1 : 2;
    return aM - bM;
  });
  listEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;">${
    sorted.slice(0, 12).map(g => {
      const isMine = myGuilds.has(g.name);
      const isPending = myPending.has(g.name);
      const label = isMine ? '★' : isPending ? '⏳' : `${g.memberCount || 0}명`;
      const bg = isMine ? 'var(--primary-bg)' : 'var(--surface2)';
      const border = isMine ? 'var(--primary)' : 'var(--border)';
      return `<button onclick="quickJoinGuild('${g.name.replace(/'/g, "\\'")}')" class="guild-chip" style="font-size:11px;padding:3px 8px;cursor:pointer;border:1px solid ${border};background:${bg};">
        ${g.name}<span style="font-size:9px;color:var(--text-tertiary);margin-left:2px;">${label}</span>
      </button>`;
    }).join('')
  }</div>`;
  listEl.style.display = '';
};

window.quickJoinGuild = async function(guildName) {
  const user = getCurrentUser();
  if (!user) return;
  const { createGuildJoinRequest, saveAccount, setCurrentUser, createGuild: cg, getAllGuilds } = await import('../data.js');

  // 이미 가입된 길드 → 대표길드로 설정
  if ((user.guilds || []).includes(guildName)) {
    user.primaryGuild = guildName;
    await saveAccount(user);
    setCurrentUser(user);
    showToast(`${guildName}을(를) 대표길드로 설정했어요!`, 2500, 'success');
    document.getElementById('dynamic-modal')?.remove();
    openFriendProfile(isAdminGuest() ? getAdminId() : user.id);
    return;
  }

  // 승인 대기중 길드 → 가입신청 철회
  if ((user.pendingGuilds || []).includes(guildName)) {
    user.pendingGuilds = (user.pendingGuilds || []).filter(g => g !== guildName);
    await saveAccount(user);
    setCurrentUser(user);
    // pending 알림 제거
    try {
      const { deleteDoc: dd, doc: dc, getFirestore: gfs } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");
      await dd(dc(gfs(), '_notifications', `guild_pending_${guildName}_${user.id}`));
    } catch {}
    showToast(`${guildName} 가입신청을 철회했어요.`, 2500, 'info');
    document.getElementById('dynamic-modal')?.remove();
    openFriendProfile(isAdminGuest() ? getAdminId() : user.id);
    return;
  }

  const allG = await getAllGuilds();
  const existing = allG.find(g => g.name === guildName);

  if (existing) {
    // 기존 길드 → 가입 요청 (승인 대기)
    const displayName = user.nickname || (user.lastName + user.firstName);
    const pending = user.pendingGuilds || [];
    if (!pending.includes(guildName)) {
      pending.push(guildName);
      user.pendingGuilds = pending;
      await saveAccount(user);
      setCurrentUser(user);
      await createGuildJoinRequest(guildName, guildName, user.id, displayName);
    }
    showToast(`${guildName} 가입 요청을 보냈어요! 기존 멤버의 승인을 기다려주세요.`, 3000, 'success');
  } else {
    // 새 길드 → 바로 생성 & 가입
    await cg(guildName, user.id);
    const guilds = user.guilds || [];
    guilds.push(guildName);
    user.guilds = guilds;
    if (!user.primaryGuild) user.primaryGuild = guildName;
    await saveAccount(user);
    setCurrentUser(user);
    showToast(`${guildName} 길드를 만들고 가입했어요!`, 3000, 'success');
  }
  // 프로필 모달 닫고 새로고침
  document.getElementById('dynamic-modal')?.remove();
  openFriendProfile(isAdminGuest() ? getAdminId() : user.id);
};

window.openMyGuestbook = async function() {
  const user = getCurrentUser();
  if (!user) return;
  const myId = isAdminGuest() ? getAdminId() : user.id;
  const allEntries = await getGuestbook(myId);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const entries = allEntries.filter(e => e.createdAt >= todayStart.getTime());

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);

  let listHtml = '';
  if (!entries.length) {
    listHtml = '<div style="text-align:center;padding:24px;font-size:13px;color:var(--text-tertiary);">오늘의 응원이 아직 없어요.<br>이웃들이 응원을 남기면 여기에 표시돼요.</div>';
  } else {
    listHtml = entries.slice(0, 30).map(e => {
      const timeAgo = formatTimeAgo(e.createdAt);
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px;">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${(e.fromName||'?').charAt(0)}</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;"><span style="font-size:13px;font-weight:600;color:var(--text);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();document.getElementById('dynamic-modal')?.remove();openFriendProfile('${e.from}','${e.fromName||'익명'}')">${e.fromName||'익명'}</span><span style="font-size:10px;color:var(--text-tertiary);">${timeAgo}</span></div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:3px;line-height:1.4;">${e.message}</div>
        </div>
      </div>`;
    }).join('');
  }

  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:10001;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">📝 오늘의 방명록</div>
      <div style="max-height:400px;overflow-y:auto;padding:0 4px;">${listHtml}</div>
      <button onclick="document.getElementById('dynamic-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:13px;font-weight:600;cursor:pointer;margin-top:12px;">닫기</button>
    </div>
  </div>`;
};

window.startGbReply = function(parentId, fromName) {
  _gbReplyParentId = parentId;
  const input = document.getElementById('guestbook-input');
  if (input) { input.placeholder = `@${fromName}에게 답글`; input.focus(); }
  let cancelBtn = document.getElementById('gb-reply-cancel');
  if (!cancelBtn) {
    cancelBtn = document.createElement('button');
    cancelBtn.id = 'gb-reply-cancel';
    cancelBtn.style.cssText = 'background:none;border:none;color:var(--text-tertiary);font-size:11px;cursor:pointer;padding:4px 0;';
    cancelBtn.textContent = '답글 취소 ✕';
    cancelBtn.onclick = () => { _gbReplyParentId = null; cancelBtn.remove(); input.placeholder = '응원 한마디 남기기'; };
    input.parentElement.parentElement.insertBefore(cancelBtn, input.parentElement);
  }
};

window.submitGuestbook = async function(targetId) {
  if (document.getElementById('dynamic-modal')?.dataset.isFriend !== '1') {
    showToast('이웃만 방명록을 남길 수 있어요', 2500, 'warning'); return;
  }
  const input = document.getElementById('guestbook-input');
  if (!input || !input.value.trim()) return;
  const isReply = !!_gbReplyParentId;
  const result = await writeGuestbook(targetId, input.value, _gbReplyParentId);
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  recordAction('방명록');
  input.value = '';
  input.placeholder = '응원 한마디 남기기';
  _gbReplyParentId = null;
  document.getElementById('gb-reply-cancel')?.remove();
  showToast(isReply ? '답글을 남겼어요 💬' : '방명록을 남겼어요 📝', 2500, 'success');
  loadGuestbook(targetId);
};

window.deleteGb = async function(entryId, targetId) {
  await deleteGuestbookEntry(entryId);
  loadGuestbook(targetId);
  showToast('삭제했어요', 2500, 'info');
};

// ── 댓글 시스템 UI ──────────────────────────────────────────────
let _commentReplyParentId = null;

window.toggleCommentSection = async function(targetId, dk, section) {
  const panel = document.getElementById(`comments-${section}`);
  if (!panel) return;
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    panel.innerHTML = '<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-tertiary);">불러오는 중...</div>';
    const canWrite = document.getElementById('dynamic-modal')?.dataset.isFriend === '1';
    await loadComments(targetId, dk, section, canWrite);
  } else {
    panel.style.display = 'none';
  }
};

async function loadComments(targetId, dk, section, canWrite = true) {
  const panel = document.getElementById(`comments-${section}`);
  if (!panel) return;
  const comments = await getComments(targetId, dk, section);
  const user = getCurrentUser();
  const myId = user?.id;
  const myDataOwnerId = getDataOwnerId();

  const topComments = comments.filter(c => !c.parentId);
  const replies = comments.filter(c => c.parentId);
  const replyMap = {};
  replies.forEach(r => { (replyMap[r.parentId] = replyMap[r.parentId] || []).push(r); });

  let html = '';
  if (topComments.length === 0) {
    html = '<div style="text-align:center;padding:10px;font-size:12px;color:var(--text-tertiary);">아직 댓글이 없어요</div>';
  } else {
    html = topComments.map(c => {
      let h = renderComment(c, false, myId, myDataOwnerId, targetId, dk, section);
      (replyMap[c.id] || []).sort((a,b) => a.createdAt - b.createdAt).forEach(r => {
        h += renderComment(r, true, myId, myDataOwnerId, targetId, dk, section);
      });
      return h;
    }).join('');
  }

  if (canWrite) {
    html += `<div style="display:flex;gap:6px;margin-top:8px;">
      <input id="comment-input-${section}" style="flex:1;padding:7px 12px;border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--text);background:var(--surface2);outline:none;font-family:var(--font-sans);transition:border-color 0.15s;" placeholder="댓글 남기기" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')submitComment('${targetId}','${dk}','${section}')">
      <button onclick="submitComment('${targetId}','${dk}','${section}')" style="padding:6px 12px;border:none;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;">등록</button>
    </div>`;
  }

  panel.innerHTML = `<div style="margin-top:8px;padding:8px 0;border-top:1px dashed var(--border);">${html}</div>`;
}

function renderComment(c, isReply, myId, myDataOwnerId, targetId, dk, section) {
  const isMe = c.from === myId || isSameInstance(c.from, myId);
  const isOwner = targetId === myId || targetId === myDataOwnerId;
  const timeAgo = formatTimeAgo(c.createdAt);
  const edited = c.updatedAt ? ' <span style="font-size:9px;color:var(--text-tertiary);">(수정됨)</span>' : '';
  const delBtn = (isMe || isOwner) ? `<button onclick="deleteCommentUI('${c.id}','${targetId}','${dk}','${section}')" style="background:none;border:none;color:var(--text-tertiary);font-size:10px;cursor:pointer;padding:2px 4px;">삭제</button>` : '';
  const editBtn = isMe ? `<button onclick="editCommentUI('${c.id}','${targetId}','${dk}','${section}')" style="background:none;border:none;color:var(--text-tertiary);font-size:10px;cursor:pointer;padding:2px 4px;">수정</button>` : '';
  const replyBtn = !isReply ? `<button onclick="startCommentReply('${c.id}','${(c.fromName||'').replace(/'/g,"\\'")}','${section}')" style="background:none;border:none;color:var(--text-tertiary);font-size:10px;cursor:pointer;padding:2px 4px;">답글</button>` : '';

  return `<div id="comment-${c.id}" style="padding:${isReply?'5':'7'}px 0;${isReply?'margin-left:32px;':''}border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:7px;">
    <div style="width:${isReply?'20':'26'}px;height:${isReply?'20':'26'}px;border-radius:50%;background:${isMe?'#fdf0f0':'var(--surface3)'};color:${isMe?'var(--primary)':'var(--text-secondary)'};display:flex;align-items:center;justify-content:center;font-size:${isReply?'8':'10'}px;font-weight:700;flex-shrink:0;">${(c.fromName||'?').charAt(0)}</div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
        <span style="font-size:${isReply?'11':'12'}px;font-weight:600;color:var(--text);cursor:pointer;text-decoration:underline;" onclick="event.stopPropagation();document.getElementById('dynamic-modal')?.remove();openFriendProfile('${c.from}','${c.fromName || '익명'}')">${c.fromName || '익명'}</span>
        <span style="font-size:10px;color:var(--text-tertiary);">${timeAgo}${edited}</span>
        ${replyBtn}${editBtn}${delBtn}
      </div>
      <div class="comment-msg-${c.id}" style="font-size:${isReply?'11':'12'}px;color:var(--text-secondary);margin-top:2px;line-height:1.4;word-break:break-word;">${c.message}</div>
    </div>
  </div>`;
}

window.submitComment = async function(targetId, dk, section) {
  if (document.getElementById('dynamic-modal')?.dataset.isFriend !== '1') {
    showToast('이웃만 댓글을 남길 수 있어요', 2500, 'warning'); return;
  }
  const input = document.getElementById(`comment-input-${section}`);
  if (!input || !input.value.trim()) return;
  const isReply = !!_commentReplyParentId;
  await writeComment(targetId, dk, section, input.value, _commentReplyParentId);
  _commentReplyParentId = null;
  input.value = '';
  input.placeholder = '댓글 남기기';
  document.getElementById(`comment-reply-cancel-${section}`)?.remove();
  recordAction('댓글');
  showToast(isReply ? '답글을 남겼어요 💬' : '댓글을 남겼어요 💬', 2500, 'success');
  await loadComments(targetId, dk, section);
};

window.startCommentReply = function(parentId, fromName, section) {
  _commentReplyParentId = parentId;
  const input = document.getElementById(`comment-input-${section}`);
  if (input) { input.placeholder = `@${fromName}에게 답글`; input.focus(); }
  if (!document.getElementById(`comment-reply-cancel-${section}`)) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = `comment-reply-cancel-${section}`;
    cancelBtn.textContent = '답글 취소 ✕';
    cancelBtn.style.cssText = 'background:none;border:none;color:var(--primary);font-size:11px;cursor:pointer;padding:4px 0;margin-top:4px;display:block;';
    cancelBtn.onclick = () => { _commentReplyParentId = null; cancelBtn.remove(); if (input) input.placeholder = '댓글 남기기'; };
    input.parentElement.after(cancelBtn);
  }
};

window.editCommentUI = function(commentId, targetId, dk, section) {
  const msgEl = document.querySelector(`.comment-msg-${commentId}`);
  if (!msgEl) return;
  const oldText = msgEl.textContent;
  msgEl.innerHTML = `<div style="display:flex;gap:4px;align-items:center;margin-top:2px;">
    <input id="edit-${commentId}" value="${oldText.replace(/"/g,'&quot;')}" style="flex:1;padding:4px 8px;border:1px solid var(--primary);border-radius:6px;font-size:12px;color:var(--text);background:var(--surface2);outline:none;" onkeydown="if(event.key==='Enter')confirmEditComment('${commentId}','${targetId}','${dk}','${section}')">
    <button onclick="confirmEditComment('${commentId}','${targetId}','${dk}','${section}')" style="font-size:10px;padding:3px 8px;border:none;border-radius:4px;background:var(--primary);color:#fff;cursor:pointer;flex-shrink:0;">저장</button>
  </div>`;
  document.getElementById(`edit-${commentId}`)?.focus();
};

window.confirmEditComment = async function(commentId, targetId, dk, section) {
  const input = document.getElementById(`edit-${commentId}`);
  if (!input || !input.value.trim()) return;
  await editComment(commentId, input.value);
  showToast('댓글을 수정했어요', 2500, 'success');
  await loadComments(targetId, dk, section);
};

window.deleteCommentUI = async function(commentId, targetId, dk, section) {
  await deleteComment(commentId);
  showToast('댓글을 삭제했어요', 2500, 'info');
  await loadComments(targetId, dk, section);
};

// ── 리액션 보내기 + 토마토 선물 ──────────────────────────────────
window.sendReaction = async function(tid, dk, field, emoji) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const user = getCurrentUser();
  if (!user) return;
  await toggleLike(tid, dk, field, emoji);
  recordAction('리액션');
  haptic('light');
  showToast(`${emoji} 리액션을 보냈어요!`, 2500, 'success');
  if (document.getElementById('dynamic-modal')) {
    const accounts = await getAccountList();
    const acc = accounts.find(a => a.id === tid);
    const name = acc ? resolveNickname(acc, accounts) : tid.replace(/_/g, '');
    document.getElementById('dynamic-modal').remove();
    window.openFriendProfile(tid, name);
  }
  if (_renderFriendFeedFn) _renderFriendFeedFn();
};

window.markNotifRead = async function(id) {
  await markNotificationRead(id);
  if (_renderFriendFeedFn) _renderFriendFeedFn();
  if (_refreshNotifCenterFn) _refreshNotifCenterFn();
};

window.openTomatoGiftModal = function(friendId, friendName) {
  const state = getTomatoState();
  const available = Math.max(0, state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0));
  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div'); modal.id = 'dynamic-modal'; document.body.appendChild(modal);
  modal.innerHTML = `<div class="modal-backdrop" style="display:flex;z-index:1000;" onclick="if(event.target===this){document.getElementById('dynamic-modal')?.remove();}">
    <div class="modal-sheet" style="max-width:400px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div class="modal-title" style="font-size:17px;font-weight:700;">토마토 선물하기</div>
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:15px;font-weight:500;color:var(--text);margin-bottom:12px;"><b>${friendName}</b>님에게 토마토를 선물할까요?</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:16px;">남은 토마토: <b style="color:var(--primary);">${available}개</b></div>
        ${available <= 0
          ? `<div style="font-size:13px;color:var(--text-tertiary);padding:12px;background:var(--surface2);border-radius:12px;margin-bottom:12px;">선물할 토마토가 없어요. 목표를 달성해서 토마토를 수확하세요!</div>
             <button onclick="document.getElementById('dynamic-modal')?.remove()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;">닫기</button>`
          : `<input class="login-input" id="tomato-gift-msg" placeholder="응원 메시지 (선택)" style="margin-bottom:16px;text-align:center;">
             <div style="display:flex;gap:8px;">
               <button style="flex:1;padding:10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-secondary);font-size:14px;font-weight:600;cursor:pointer;" onclick="document.getElementById('dynamic-modal')?.remove()">취소</button>
               <button style="flex:2;padding:10px;border:none;border-radius:999px;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;" onclick="sendTomatoGiftFromModal('${friendId}')">선물하기</button>
             </div>`
        }
      </div>
    </div>
  </div>`;
};

window.sendTomatoGiftFromModal = async function(friendId) {
  const msg = document.getElementById('tomato-gift-msg')?.value || '';
  const result = await sendTomatoGift(friendId, msg);
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  recordAction('토마토선물');
  showToast('토마토를 선물했어요!', 2500, 'success');
  document.getElementById('modals-container').innerHTML = '';
  if (_renderHomeFn) _renderHomeFn();
  if (_refreshNotifCenterFn) _refreshNotifCenterFn();
};

// 데이터 복구용 (콘솔에서 호출)
window.revertTomatoGift = revertTomatoGift;
