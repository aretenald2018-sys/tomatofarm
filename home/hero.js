// ================================================================
// home/hero.js — 히어로 카드, 스트릭 대시보드, 리더보드
// ================================================================

import { TODAY, calcStreaks, countLocalWeeklyActiveDays,
         getMilestoneShown, saveMilestoneShown,
         getStreakFreezes, getTomatoState, useStreakFreeze,
         getGlobalWeeklyRanking, getMyFriends, getAccountList, getCurrentUser,
         getFriendWorkout, dateKey, isAdmin, _isMySocialId, isActiveWorkoutDayData,
         computeGuildStats, getHeroMessage, markHeroMessageRead }  from '../data.js';
import { setText, showToast, haptic, resolveNickname } from './utils.js';
import { confirmSimple } from '../utils/confirm-modal.js';

function _currentDateKey() {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// renderHome에서 주입됨 (순환 참조 방지)
let _renderTomatoHeroFn = null;
let _renderHomeFn = null;

export function setHeroDeps({ renderTomatoHero, renderHome }) {
  _renderTomatoHeroFn = renderTomatoHero;
  _renderHomeFn = renderHome;
}

// ── 히어로 카드 (토스 스타일 핵심 메시지) ─────────────────────────
export async function renderHero() {
  const el = document.getElementById('hero-content');
  if (!el) return;

  const currentUser = getCurrentUser();
  const todayDateKey = _currentDateKey();
  const customMsg = await getHeroMessage(currentUser?.id, todayDateKey);
  if (!customMsg?.message) return;

  // 읽음 처리는 유저가 실제로 hero 메시지를 "탭(interact)"할 때만 수행.
  // (renderHome이 백그라운드에서 호출되거나 탭이 숨겨진 상태에서도 돌 수 있어
  //  렌더 자체를 "읽음"으로 보면 admin 지표의 신뢰도가 떨어진다.)

  const _maybeMarkRead = () => {
    if (customMsg.id && !customMsg.read && !isAdmin()) {
      markHeroMessageRead(customMsg.id).catch((e) => console.warn('[hero] mark read:', e));
    }
  };

  const labelEl = el.querySelector('.tf-hero-label');
  if (labelEl) {
    labelEl.textContent = customMsg.emoji ? `${customMsg.emoji} ${customMsg.message}` : customMsg.message;
    labelEl.classList.add('hero-message-custom');
    labelEl.onclick = () => {
      _maybeMarkRead();
      labelEl.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' }
      );
    };
    return;
  }

  const msgEl = el.querySelector('.tomato-message');
  if (msgEl) {
    msgEl.textContent = customMsg.emoji ? `${customMsg.emoji} ${customMsg.message}` : customMsg.message;
    msgEl.classList.add('hero-message-custom');
    msgEl.onclick = () => {
      _maybeMarkRead();
      msgEl.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' }
      );
    };
  }
}

// ── 마일스톤 체크 ────────────────────────────────────────────────
export function checkStreakMilestone(type, days) {
  const milestones = [100, 50, 30, 14, 7];
  const shown = getMilestoneShown();
  for (const m of milestones) {
    if (days >= m && !shown[`${type}_${m}`]) {
      shown[`${type}_${m}`] = true;
      saveMilestoneShown(shown);
      setTimeout(() => {
        if (window.openStreakMilestone) window.openStreakMilestone(type, m);
      }, 500);
      break;
    }
  }
}

// ── 소셜 히어로 업데이트 ─────────────────────────────────────────
export function updateHeroSocialProof(activeNames) {
  const el = document.getElementById('hero-social-proof');
  const msgEl = document.querySelector('.hero-message');

  if (!activeNames || !activeNames.length) return;

  const { workout, diet, combined } = calcStreaks();
  const mainStreak = combined;
  const streakLabel = workout >= diet ? '운동' : '식단';
  const firstName = activeNames[0];

  // 듀오링고 스타일: 메인 메시지에 이웃 이름 통합
  if (msgEl) {
    if (mainStreak >= 7) {
      msgEl.innerHTML = `<strong>${firstName}</strong>님과 <strong>함께</strong> ${mainStreak}일째 ${streakLabel} 달리는 중!`;
    } else if (mainStreak >= 3) {
      msgEl.innerHTML = `<strong>${firstName}</strong>님과 <strong>함께</strong> ${mainStreak}일째 이어가는 중!`;
    } else if (mainStreak >= 1) {
      msgEl.innerHTML = `<strong>${firstName}</strong>님도 같이 달리고 있어요!`;
    }
    // mainStreak === 0: 기존 개인 격려 메시지 유지
  }

  // 소셜 증명 줄: 왼쪽 정렬, 이웃 이름 강조
  if (el) {
    if (activeNames.length >= 3) {
      el.innerHTML = `<strong>${activeNames[1]}</strong>님 외 ${activeNames.length - 2}명도 함께 달리는 중 🔥`;
      el.style.display = '';
    } else if (activeNames.length === 2) {
      el.innerHTML = `<strong>${activeNames[1]}</strong>님도 같이 달리고 있어요 🔥`;
      el.style.display = '';
    } else {
      // 1명은 이미 메인 메시지에 포함 — 중복 방지
      el.style.display = 'none';
    }
  }
}

// ── Streak Freeze UI ─────────────────────────────────────────────
export function renderStreakFreeze() {
  const el = document.getElementById('streak-freeze-row');
  if (!el) return;
  const freezes = getStreakFreezes();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const usedThisWeek = freezes.filter(f => f.usedAt > weekAgo);
  const tomatoState = getTomatoState();
  const available = tomatoState.totalTomatoes + tomatoState.giftedReceived - tomatoState.giftedSent;
  const canUse = available > 0 && usedThisWeek.length === 0;

  if (usedThisWeek.length > 0) {
    el.innerHTML = `<div class="tf-freeze-banner tf-freeze-used">
      <span class="tf-freeze-icon">🍅</span>
      <div class="tf-freeze-text">
        <span class="tf-freeze-title">이번 주 스트릭 보호 사용 완료</span>
        <span class="tf-freeze-desc">다음 주에 다시 사용할 수 있어요</span>
      </div>
    </div>`;
  } else {
    el.innerHTML = `<div class="tf-freeze-banner">
      <span class="tf-freeze-icon">🍅</span>
      <div class="tf-freeze-text">
        <span class="tf-freeze-title">스트릭 보호</span>
        <span class="tf-freeze-desc">토마토 1개 · 주 1회 · 보유 ${available}개</span>
      </div>
      <button class="tf-freeze-action${canUse ? '' : ' disabled'}" onclick="useStreakFreezeUI()" ${canUse ? '' : 'disabled'}>보호하기</button>
    </div>`;
  }
}

window.useStreakFreezeUI = async function() {
  const ok = await confirmSimple('토마토 1개를 사용하여 오늘의 스트릭을 보호할까요?');
  if (!ok) return;
  const result = await useStreakFreeze('workout');
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  haptic('success');
  showToast('🍅 스트릭이 보호됐어요!', 2500, 'success');
  renderStreakFreeze();
  if (_renderHomeFn) _renderHomeFn();
};

// ── 주간 리더보드 (글로벌 랭킹 + 이웃 폴백) ─────────────────────
let _leaderboardTab = 'individual';

export function switchLeaderboardTab(tab) {
  _leaderboardTab = tab;
  // 세그먼트 UI 업데이트
  const btns = document.querySelectorAll('#lb-segmented .tds-segmented-item');
  btns.forEach(b => b.classList.toggle('active', b.textContent.trim() === (tab === 'individual' ? '개인' : '길드')));
  const indicator = document.getElementById('lb-seg-indicator');
  if (indicator && btns.length === 2) {
    const idx = tab === 'individual' ? 0 : 1;
    indicator.style.left = `${btns[idx].offsetLeft}px`;
    indicator.style.width = `${btns[idx].offsetWidth}px`;
  }
  renderLeaderboard();
}
window.switchLeaderboardTab = switchLeaderboardTab;

export async function renderLeaderboard() {
  const cardEl = document.getElementById('card-leaderboard');
  const contentEl = document.getElementById('leaderboard-content');
  if (!cardEl || !contentEl) return;

  try {
    const user = getCurrentUser();
    if (!user) return;
    const friends = await getMyFriends();
    const friendIdSet = new Set(friends.map((f) => f.friendId));

    // 길드 탭이면 길드 랭킹 렌더링
    if (_leaderboardTab === 'guild') {
      cardEl.style.display = '';
      await _renderGuildLeaderboard(contentEl, user);
      return;
    }

    // 글로벌 랭킹 우선 시도, 없으면 이웃 기반 폴백
    const globalData = await getGlobalWeeklyRanking();
    let board, total, isGlobal;

    if (globalData && globalData.rankings && globalData.rankings.length) {
      // ── 글로벌 랭킹 모드 (내 활동일은 로컬 실시간 계산) ──
      // 내 이번 주 활동일 로컬 계산
      const myLocalDays = countLocalWeeklyActiveDays(TODAY);

      const mergedBoard = new Map();
      globalData.rankings.forEach((r) => {
        const isMe = _isMySocialId(r.userId);
        const key = isMe ? '__me__' : r.userId;
        const next = {
          userId: r.userId,
          name: isMe ? '나' : r.name,
          days: isMe ? Math.max(r.activeDays, myLocalDays) : r.activeDays,
          isMe,
        };
        const prev = mergedBoard.get(key);
        if (!prev) {
          mergedBoard.set(key, next);
          return;
        }
        mergedBoard.set(key, {
          userId: prev.userId,
          name: prev.isMe || isMe ? '나' : (prev.name || next.name),
          days: Math.max(prev.days || 0, next.days || 0),
          isMe: prev.isMe || isMe,
        });
      });
      board = [...mergedBoard.values()];
      // 내가 글로벌 랭킹에 없으면 추가
      if (!board.some(b => b.isMe) && myLocalDays > 0) {
        board.push({ userId: user.id, name: '나', days: myLocalDays, isMe: true });
      }
      total = board.length;
      isGlobal = true;
    } else {
      // ── 이웃 폴백 모드 ──
      if (!friends.length) { cardEl.style.display = 'none'; return; }
      const accounts = await getAccountList();

      const weekKeys = [];
      const now = new Date(TODAY);
      const dayOfWeek = now.getDay() || 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek + 1);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        weekKeys.push(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      }

      const participants = [{ id: user.id, name: '나', isMe: true }];
      for (const f of friends) {
        const acc = accounts.find(a => a.id === f.friendId);
        const name = acc ? resolveNickname(acc, accounts) : f.friendId.replace(/_/g, '');
        participants.push({ id: f.friendId, name, isMe: _isMySocialId(f.friendId) });
      }

      const results = await Promise.allSettled(
        participants.map(async p => {
          if (p.isMe) {
            const days = countLocalWeeklyActiveDays(TODAY);
            return { ...p, days };
          } else {
            let days = 0;
            const dayResults = await Promise.allSettled(weekKeys.map(k => getFriendWorkout(p.id, k)));
            for (const r of dayResults) {
              if (r.status !== 'fulfilled' || !r.value) continue;
              if (isActiveWorkoutDayData(r.value)) days++;
            }
            return { ...p, days };
          }
        })
      );

      board = results.filter(r => r.status === 'fulfilled')
        .map(r => ({ ...r.value, userId: r.value.id }))
        .sort((a, b) => b.days - a.days);

      if (board.length <= 1) { cardEl.style.display = 'none'; return; }
      total = board.length;
      isGlobal = false;
    }

    // ── 공통 렌더링: 전원 표시, 활동 강조 ──

    // 활동자 / 미활동자 분리
    const active = board.filter(p => p.days > 0).sort((a, b) => b.days - a.days);
    const inactive = board.filter(p => p.days === 0);
    const activeCount = active.length;

    // 히어로 소셜프루프 업데이트
    const proofNames = active
      .filter((p) => !p.isMe && friendIdSet.has(p.userId))
      .slice(0, 2)
      .map((p) => p.name);
    if (proofNames.length > 0) updateHeroSocialProof(proofNames);

    // 집단 컨텍스트 문구
    let contextMsg = '';
    if (activeCount === 0) {
      contextMsg = '이번 주 첫 기록의 주인공이 되어보세요!';
    } else if (activeCount === 1 && active[0].isMe) {
      contextMsg = '🔥 이번 주 첫 기록을 시작했어요!';
    } else {
      contextMsg = `🔥 ${activeCount}명이 함께 달리고 있어요`;
    }

    // HTML 렌더링
    const rankIcons = ['🥇', '🥈', '🥉'];
    let html = `<div class="lb-context">${contextMsg}</div>`;

    // 활동자: 아바타 + 순위 + 프로그레스 바
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      const rank = rankIcons[i] || `${i + 1}`;
      const pct = Math.round((p.days / 7) * 100);
      const initial = p.isMe ? '나' : p.name.charAt(0);
      const clickAttr = p.isMe ? '' : ` onclick="openFriendProfile('${p.userId}','${p.name}')" style="cursor:pointer;"`;
      html += `<div class="lb-row${p.isMe ? ' lb-me' : ''}"${clickAttr}>
        <span class="lb-rank">${rank}</span>
        <div class="lb-avatar active">${initial}</div>
        <span class="lb-name">${p.isMe ? '나' : p.name}</span>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        <span class="lb-days">${p.days}일</span>
      </div>`;
    }

    // 미활동자: 순위 번호 없이, 하단 분리
    if (inactive.length > 0) {
      html += `<div class="lb-inactive-label">아직 이번 주 기록 없음</div>`;
      html += `<div class="lb-inactive-row">`;
      for (const p of inactive) {
        const initial = p.isMe ? '나' : p.name.charAt(0);
        const inactiveClickAttr = p.isMe ? '' : ` onclick="openFriendProfile('${p.userId}','${p.name}')" style="cursor:pointer;"`;
        html += `<div class="lb-inactive-item${p.isMe ? ' lb-me-inactive' : ''}"${inactiveClickAttr}>
          <div class="lb-avatar inactive">${initial}</div>
          <span class="lb-inactive-name">${p.isMe ? '나' : p.name}</span>
        </div>`;
      }
      html += `</div>`;
    }

    // 글로벌 모드일 때 업데이트 시각 표시
    if (isGlobal && globalData.updatedAt) {
      const diffMin = Math.floor((Date.now() - globalData.updatedAt) / 60000);
      const freshness = diffMin < 1 ? '방금 업데이트' : diffMin < 60 ? `${diffMin}분 전 업데이트` : `${Math.floor(diffMin / 60)}시간 전 업데이트`;
      html += `<div class="lb-freshness">${freshness}</div>`;
    }

    contentEl.innerHTML = html;
    cardEl.style.display = '';
  } catch(e) { console.warn('[leaderboard]', e); }
}

// ── 길드 리더보드 ────────────────────────────────────────────────
async function _renderGuildLeaderboard(contentEl, user) {
  try {
    const myGuilds = new Set(user.guilds || []);
    const myLocalDays = countLocalWeeklyActiveDays(TODAY);
    const { guilds: rankings, updatedAt } = await computeGuildStats({ myLocalDays });

    if (!rankings.length && myGuilds.size === 0) {
      contentEl.innerHTML = `<div class="lb-context" style="text-align:center;padding:20px 0;">
        길드에 가입하면 길드 랭킹에 참여할 수 있어요
        <div style="margin-top:8px;"><button class="tds-btn fill md" onclick="openGuildModal()" style="font-size:12px;">길드 가입하기</button></div>
      </div>`;
      return;
    }
    if (!rankings.length) {
      contentEl.innerHTML = '<div class="lb-context" style="text-align:center;padding:16px 0;">아직 길드 데이터가 없어요</div>';
      return;
    }
    const rankIcons = ['🥇', '🥈', '🥉'];

    let html = `<div class="lb-context">🏠 ${rankings.length}개 길드가 경쟁 중</div>`;

    for (let i = 0; i < rankings.length; i++) {
      const g = rankings[i];
      const rank = rankIcons[i] || `${i + 1}`;
      const pct = Math.round((g.avgActiveDays / 7) * 100);
      const isMine = myGuilds.has(g.guildId);
      const myCls = isMine ? ' lb-my-guild' : '';

      const nameLen = g.guildName.length;
      const nameFontSize = nameLen > 4 ? '11px' : '13px';

      const guildIcon = g.guildIcon || '🏠';
      const avatarHtml = String(guildIcon).startsWith('data:')
        ? `<div class="lb-avatar lb-avatar-photo"><img src="${guildIcon}" alt="${String(g.guildName || '').replace(/"/g, '&quot;')}"></div>`
        : `<div class="lb-avatar active" style="font-size:14px;overflow:hidden;">${guildIcon}</div>`;

      html += `<div class="lb-row${myCls}" onclick="openGuildInfoModal('${String(g.guildName || '').replace(/'/g, "\\'")}')" style="cursor:pointer;">
        <span class="lb-rank">${rank}</span>
        ${avatarHtml}
        <span class="lb-name lb-name-guild" style="font-size:${nameFontSize};">${g.guildName}</span>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        <span class="lb-days"><span class="lb-guild-info">${g.memberCount}명</span> ${Number(g.avgActiveDays || 0).toFixed(1)}일</span>
      </div>`;
    }

    // 업데이트 시각
    if (updatedAt) {
      const diffMin = Math.floor((Date.now() - updatedAt) / 60000);
      const freshness = diffMin < 1 ? '방금 업데이트' : diffMin < 60 ? `${diffMin}분 전 업데이트` : `${Math.floor(diffMin / 60)}시간 전 업데이트`;
      html += `<div class="lb-freshness">${freshness}</div>`;
    }

    // 산정 방법 안내
    html += `<div style="margin-top:12px;padding:10px 14px;background:var(--surface2);border-radius:var(--seed-r2,8px);font-size:11px;line-height:1.6;color:var(--text-tertiary);">
      <span style="font-weight:600;color:var(--text-secondary);">산정 방법</span><br>
      이번 주 (월~일) 멤버별 활동일의 평균으로 순위를 매겨요.<br>
      운동 기록 또는 식단 입력이 있는 날을 활동일로 인정합니다.
    </div>`;

    contentEl.innerHTML = html;
  } catch(e) {
    console.warn('[guild-leaderboard]', e);
    contentEl.innerHTML = '<div class="lb-context">길드 랭킹을 불러올 수 없어요</div>';
  }
}

