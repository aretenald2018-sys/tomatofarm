// ================================================================
// home/hero.js — 히어로 카드, 스트릭 대시보드, 리더보드
// ================================================================

import { TODAY, calcStreaks, countLocalWeeklyActiveDays,
         getMilestoneShown, saveMilestoneShown,
         getStreakFreezes, getTomatoState, useStreakFreeze,
         getMyFriends, getAccountList, getCurrentUser,
         getFriendWorkout, getFriendData, dateKey, isAdmin, _isMySocialId, isActiveWorkoutDayData,
         getAllDateKeys, getDay, getHeroMessage, markHeroMessageRead }  from '../data.js';
import { setText, showToast, haptic, resolveNickname } from './utils.js';
import { escapeHtml as _escapeHtml } from '../utils/escape-html.js';
import { confirmSimple } from '../utils/confirm-modal.js';
import { openFriendProfile } from './friend-profile.js';
import { openStreakMilestone } from '../modals/streak-milestone-modal.js';

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
  const labelEl = document.querySelector('[data-hero-message-target]');
  if (!el && !labelEl) return;

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

  const msgEl = el?.querySelector('.tomato-message');
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
        openStreakMilestone(type, m);
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
      <button type="button" class="tf-freeze-action${canUse ? '' : ' disabled'}" data-hero-action="use-streak-freeze" ${canUse ? '' : 'disabled'}>보호하기</button>
    </div>`;
  }
  el.onclick = (event) => {
    if (event.target.closest('[data-hero-action="use-streak-freeze"]')) void useStreakFreezeUI();
  };
}

export async function useStreakFreezeUI() {
  const ok = await confirmSimple('토마토 1개를 사용하여 오늘의 스트릭을 보호할까요?');
  if (!ok) return;
  const result = await useStreakFreeze('workout');
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  haptic('success');
  showToast('🍅 스트릭이 보호됐어요!', 2500, 'success');
  renderStreakFreeze();
  if (_renderHomeFn) _renderHomeFn();
};

// ── 랭킹 (누적 기본 + 주간 선택 저장) ─────────────────────────────
const LEADERBOARD_PERIOD_STORAGE_KEY = 'tomatofarm.home.leaderboard.period';
const LEADERBOARD_PERIODS = new Set(['cumulative', 'weekly']);
const LEADERBOARD_DISPLAY_LIMIT = 5;
let _leaderboardPeriod = _readLeaderboardPeriod();

function _readLeaderboardPeriod() {
  try {
    const saved = localStorage.getItem(LEADERBOARD_PERIOD_STORAGE_KEY);
    if (LEADERBOARD_PERIODS.has(saved)) return saved;
  } catch (_) { /* ignore */ }
  return 'cumulative';
}

function _saveLeaderboardPeriod(period) {
  try { localStorage.setItem(LEADERBOARD_PERIOD_STORAGE_KEY, period); }
  catch (_) { /* ignore */ }
}

function _syncLeaderboardSegmented(period) {
  const btns = [...document.querySelectorAll('#lb-segmented .tds-segmented-item')];
  btns.forEach((btn) => btn.classList.toggle('active', btn.dataset.period === period));
  const indicator = document.getElementById('lb-seg-indicator');
  const activeBtn = btns.find((btn) => btn.dataset.period === period);
  if (indicator && activeBtn) {
    indicator.style.left = `${activeBtn.offsetLeft}px`;
    indicator.style.width = `${activeBtn.offsetWidth}px`;
  }
}

export function switchLeaderboardTab(period) {
  const nextPeriod = LEADERBOARD_PERIODS.has(period) ? period : 'cumulative';
  _leaderboardPeriod = nextPeriod;
  _saveLeaderboardPeriod(nextPeriod);
  _syncLeaderboardSegmented(nextPeriod);
  renderLeaderboard();
}

function _weekKeys(baseDateLike = TODAY) {
  const keys = [];
  const now = new Date(baseDateLike);
  const dayOfWeek = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    keys.push(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return keys;
}

function _countActiveDays(items) {
  return (items || []).reduce((sum, item) => sum + (isActiveWorkoutDayData(item) ? 1 : 0), 0);
}

function _countLocalCumulativeActiveDays() {
  return getAllDateKeys().reduce((sum, key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    if (!y || !m || !d) return sum;
    return sum + (isActiveWorkoutDayData(getDay(y, m - 1, d)) ? 1 : 0);
  }, 0);
}

async function _buildParticipants(user) {
  const accounts = await getAccountList();
  const byKey = new Map();

  for (const acc of accounts) {
    if (!acc?.id) continue;
    const isMe = _isMySocialId(acc.id);
    const key = isMe ? '__me__' : acc.id;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: acc.id,
      name: isMe ? '나' : resolveNickname(acc, accounts),
      isMe,
    });
  }

  if (!byKey.has('__me__')) {
    byKey.set('__me__', { id: user.id, name: '나', isMe: true });
  }

  return [...byKey.values()];
}

// 참가자별 누적 활성일수는 참가자마다 getFriendData(id,'workouts') 로 그 사람의
// workouts 컬렉션 전체를 읽는다. renderHome은 앱 시작·탭 복귀·저장 1회마다
// 다시 돌므로, 이 캐시가 없으면 참가자 수 x 렌더 횟수만큼 풀스캔이 반복된다.
// "나"의 활성일수는 로컬 캐시(getAllDateKeys/getDay)만 읽는 0-네트워크 계산이라
// 캐시 적중 시에도 항상 새로 계산한다 — 방금 저장한 오늘 기록이 최대 5분간
// 반영되지 않는 것을 막기 위함. 캐시는 로그인 계정이 바뀌면(ownerId 불일치)
// 자동으로 미스 처리된다.
const CUMULATIVE_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;
let _cumulativeRowsCache = null; // { ownerId, rows, at }

async function _buildCumulativeRows(user) {
  const ownerId = user?.id || null;
  if (
    _cumulativeRowsCache
    && _cumulativeRowsCache.ownerId === ownerId
    && (Date.now() - _cumulativeRowsCache.at) < CUMULATIVE_ROWS_CACHE_TTL_MS
  ) {
    return _cumulativeRowsCache.rows
      .map((row) => (row.isMe ? { ...row, days: _countLocalCumulativeActiveDays() } : row))
      .sort((a, b) => b.days - a.days);
  }

  const participants = await _buildParticipants(user);
  const results = await Promise.allSettled(
    participants.map(async (p) => {
      if (p.isMe) return { ...p, days: _countLocalCumulativeActiveDays() };
      const days = _countActiveDays(await getFriendData(p.id, 'workouts'));
      return { ...p, days };
    })
  );
  const rows = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => ({ ...r.value, userId: r.value.id }))
    .sort((a, b) => b.days - a.days);

  _cumulativeRowsCache = { ownerId, rows, at: Date.now() };
  return rows;
}

async function _buildWeeklyBoard(user) {
  const weekKeys = _weekKeys(TODAY);
  const participants = await _buildParticipants(user);
  const results = await Promise.allSettled(
    participants.map(async (p) => {
      if (p.isMe) return { ...p, days: countLocalWeeklyActiveDays(TODAY) };
      let days = 0;
      const dayResults = await Promise.allSettled(weekKeys.map(k => getFriendWorkout(p.id, k)));
      for (const r of dayResults) {
        if (r.status !== 'fulfilled' || !r.value) continue;
        if (isActiveWorkoutDayData(r.value)) days++;
      }
      return { ...p, days };
    })
  );
  return {
    board: results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => ({ ...r.value, userId: r.value.id }))
      .sort((a, b) => b.days - a.days),
    updatedAt: null,
  };
}

function _escapeJsSingle(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

function _leaderboardContext(period, active) {
  const activeCount = active.length;
  if (period === 'weekly') {
    if (activeCount === 0) return '이번 주 첫 기록의 주인공이 되어보세요!';
    if (activeCount === 1 && active[0].isMe) return '이번 주 첫 기록을 시작했어요!';
    return `${activeCount}명이 이번 주 기록 중이에요`;
  }
  if (activeCount === 0) return '아직 누적 기록이 없어요';
  if (activeCount === 1 && active[0].isMe) return '내 누적 기록을 쌓는 중이에요';
  return `${activeCount}명의 누적 기록을 비교하고 있어요`;
}

function _renderLeaderboardHtml({ board, period, updatedAt, friendIdSet }) {
  const visibleBoard = board.slice(0, LEADERBOARD_DISPLAY_LIMIT);
  const active = visibleBoard.filter(p => p.days > 0).sort((a, b) => b.days - a.days);
  const inactive = visibleBoard.filter(p => p.days === 0);
  const proofNames = active
    .filter((p) => !p.isMe && friendIdSet.has(p.userId))
    .slice(0, 2)
    .map((p) => p.name);
  if (period === 'weekly' && proofNames.length > 0) updateHeroSocialProof(proofNames);

  const rankIcons = ['🥇', '🥈', '🥉'];
  const maxDays = period === 'weekly' ? 7 : Math.max(1, ...active.map((p) => Number(p.days) || 0));
  const inactiveLabel = period === 'weekly' ? '아직 이번 주 기록 없음' : '아직 누적 기록 없음';
  let html = `<div class="lb-context">${_escapeHtml(_leaderboardContext(period, active))}</div>`;

  for (let i = 0; i < active.length; i++) {
    const p = active[i];
    const rank = rankIcons[i] || `${i + 1}`;
    const pct = Math.max(0, Math.min(100, Math.round(((Number(p.days) || 0) / maxDays) * 100)));
    const initial = p.isMe ? '나' : String(p.name || '').charAt(0);
    const clickAttr = p.isMe ? '' : ` data-hero-action="open-profile" data-user-id="${_escapeHtml(p.userId)}" data-user-name="${_escapeHtml(p.name)}" style="cursor:pointer;"`;
    html += `<div class="lb-row${p.isMe ? ' lb-me' : ''}"${clickAttr}>
      <span class="lb-rank">${rank}</span>
      <div class="lb-avatar active">${_escapeHtml(initial)}</div>
      <span class="lb-name">${_escapeHtml(p.isMe ? '나' : p.name)}</span>
      <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
      <span class="lb-days">${Number(p.days) || 0}일</span>
    </div>`;
  }

  if (inactive.length > 0) {
    html += `<div class="lb-inactive-label">${inactiveLabel}</div>`;
    html += '<div class="lb-inactive-row">';
    for (const p of inactive) {
      const initial = p.isMe ? '나' : String(p.name || '').charAt(0);
      const inactiveClickAttr = p.isMe ? '' : ` data-hero-action="open-profile" data-user-id="${_escapeHtml(p.userId)}" data-user-name="${_escapeHtml(p.name)}" style="cursor:pointer;"`;
      html += `<div class="lb-inactive-item${p.isMe ? ' lb-me-inactive' : ''}"${inactiveClickAttr}>
        <div class="lb-avatar inactive">${_escapeHtml(initial)}</div>
        <span class="lb-inactive-name">${_escapeHtml(p.isMe ? '나' : p.name)}</span>
      </div>`;
    }
    html += '</div>';
  }

  if (period === 'weekly' && updatedAt) {
    const diffMin = Math.floor((Date.now() - updatedAt) / 60000);
    const freshness = diffMin < 1 ? '방금 업데이트' : diffMin < 60 ? `${diffMin}분 전 업데이트` : `${Math.floor(diffMin / 60)}시간 전 업데이트`;
    html += `<div class="lb-freshness">${freshness}</div>`;
  }

  return html;
}

export async function renderLeaderboard() {
  const cardEl = document.getElementById('card-leaderboard');
  const contentEl = document.getElementById('leaderboard-content');
  if (!cardEl || !contentEl) return;
  if (!contentEl.dataset.heroActionsBound) {
    contentEl.dataset.heroActionsBound = '1';
    contentEl.addEventListener('click', (event) => {
      const control = event.target.closest('[data-hero-action="open-profile"]');
      if (control) void openFriendProfile(control.dataset.userId, control.dataset.userName);
    });
  }

  try {
    const user = getCurrentUser();
    if (!user) return;
    _leaderboardPeriod = _readLeaderboardPeriod();
    _syncLeaderboardSegmented(_leaderboardPeriod);

    const friends = await getMyFriends();
    const friendIdSet = new Set(friends.map((f) => f.friendId));
    const result = _leaderboardPeriod === 'weekly'
      ? await _buildWeeklyBoard(user)
      : { board: await _buildCumulativeRows(user), updatedAt: null };

    const board = result.board || [];
    if (!board.length) {
      cardEl.style.display = 'none';
      return;
    }

    contentEl.innerHTML = _renderLeaderboardHtml({
      board,
      period: _leaderboardPeriod,
      updatedAt: result.updatedAt,
      friendIdSet,
    });
    cardEl.style.display = '';
    _syncLeaderboardSegmented(_leaderboardPeriod);
  } catch(e) { console.warn('[leaderboard]', e); }
}

export const __leaderboardTest__ = {
  _countActiveDays,
  _leaderboardContext,
  _renderLeaderboardHtml,
  LEADERBOARD_DISPLAY_LIMIT,
};

