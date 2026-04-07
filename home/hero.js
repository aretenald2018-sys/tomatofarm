// ================================================================
// home/hero.js — 히어로 카드, 스트릭 대시보드, 리더보드
// ================================================================

import { TODAY, calcStreaks, getMuscles, getDiet, getCF,
         getMilestoneShown, saveMilestoneShown,
         getStreakFreezes, getTomatoState, useStreakFreeze,
         getMyFriends, getAccountList, getCurrentUser,
         getFriendWorkout, dateKey, isAdmin }  from '../data.js';
import { setText, showToast, haptic, resolveNickname } from './utils.js';

// renderHome에서 주입됨 (순환 참조 방지)
let _renderTomatoHeroFn = null;
let _renderHomeFn = null;

export function setHeroDeps({ renderTomatoHero, renderHome }) {
  _renderTomatoHeroFn = renderTomatoHero;
  _renderHomeFn = renderHome;
}

// ── 히어로 카드 (토스 스타일 핵심 메시지) ─────────────────────────
export function renderHero() {
  const el = document.getElementById('hero-content');
  if (!el) return;

  if (!isAdmin()) {
    if (_renderTomatoHeroFn) _renderTomatoHeroFn(el);
    return;
  }

  const { workout, diet } = calcStreaks();
  const mainStreak = Math.max(workout, diet);
  const streakLabel = workout >= diet ? '운동' : '식단';
  const streakEmoji = mainStreak >= 7 ? '🔥' : mainStreak >= 3 ? '💪' : '👋';

  const m = TODAY.getMonth() + 1;
  const d = TODAY.getDate();
  const dow = ['일','월','화','수','목','금','토'][TODAY.getDay()];

  let message = '';
  if (mainStreak >= 7) message = `대단해요! ${streakLabel} ${mainStreak}일 연속`;
  else if (mainStreak >= 3) message = `좋은 흐름이에요. ${streakLabel} ${mainStreak}일째`;
  else if (mainStreak >= 1) message = `${streakLabel} ${mainStreak}일째, 이어가 볼까요?`;
  else message = '오늘부터 시작해볼까요?';

  el.innerHTML = `
    <div class="hero-date">${m}월 ${d}일 ${dow}요일</div>
    <div class="hero-streak">${streakEmoji} ${mainStreak}<span class="hero-streak-unit">일</span></div>
    <div class="hero-message">${message}</div>
    <div class="hero-sub-streaks">
      <span class="hero-sub">🏋️ 운동 ${workout}일</span>
      <span class="hero-sub-dot">·</span>
      <span class="hero-sub">🥗 식단 ${diet}일</span>
    </div>
    <div class="streak-freeze-row" id="streak-freeze-row"></div>
    <div class="hero-social-proof" id="hero-social-proof" style="display:none;"></div>
  `;

  checkStreakMilestone('workout', workout);
  checkStreakMilestone('diet', diet);
  renderStreakFreeze();
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
  if (!el || !activeNames.length) return;
  let text = '';
  if (activeNames.length === 1) text = `${activeNames[0]}님도 오늘 달리고 있어요`;
  else if (activeNames.length === 2) text = `${activeNames[0]}, ${activeNames[1]}님도 함께하고 있어요`;
  else text = `${activeNames[0]}, ${activeNames[1]} 외 ${activeNames.length - 2}명이 함께하고 있어요`;
  el.textContent = text;
  el.style.display = '';
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
  el.innerHTML = `<button class="streak-freeze-btn${canUse ? '' : ' disabled'}" onclick="useStreakFreezeUI()" ${canUse ? '' : 'disabled'}>
    스트릭 보호<span class="streak-freeze-sub">토마토 1개 · 주 1회</span>
  </button>`;
}

window.useStreakFreezeUI = async function() {
  if (!confirm('토마토 1개를 사용하여 오늘의 스트릭을 보호할까요?')) return;
  const result = await useStreakFreeze('workout');
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  haptic('success');
  showToast('🧊 스트릭이 보호됐어요!', 2500, 'success');
  renderStreakFreeze();
  if (_renderHomeFn) _renderHomeFn();
};

// ── 스트릭 대시보드 ──────────────────────────────────────────────
export function renderDashboard() {
  const { workout, diet, stretching, wineFree } = calcStreaks();
  const cfStreak = calcCFStreak();

  setText('dash-workout-streak',  workout);
  setText('dash-diet-streak',     diet);
  setText('dash-cf-streak',       cfStreak);
  setText('dash-stretch-streak',  stretching);
  setText('dash-wine-free-streak',wineFree);
}

function calcCFStreak() {
  let streak = 0;
  const cur  = new Date(TODAY);
  while (true) {
    const y = cur.getFullYear(), m = cur.getMonth(), d = cur.getDate();
    if (!getCF(y, m, d)) break;
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

// ── 주간 리더보드 ────────────────────────────────────────────────
export async function renderLeaderboard() {
  const cardEl = document.getElementById('card-leaderboard');
  const contentEl = document.getElementById('leaderboard-content');
  if (!cardEl || !contentEl) return;

  try {
    const friends = await getMyFriends();
    if (!friends.length) { cardEl.style.display = 'none'; return; }
    const accounts = await getAccountList();
    const user = getCurrentUser();
    if (!user) return;

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
      participants.push({ id: f.friendId, name, isMe: false });
    }

    const results = await Promise.allSettled(
      participants.map(async p => {
        if (p.isMe) {
          let days = 0;
          for (const wk of weekKeys) {
            const [y, m, d] = wk.split('-').map(Number);
            const muscles = getMuscles(y, m - 1, d);
            const diet = getDiet(y, m - 1, d);
            const hasDiet = diet.bKcal || diet.lKcal || diet.dKcal;
            if ((muscles || []).length > 0 || hasDiet) days++;
          }
          return { ...p, days };
        } else {
          let days = 0;
          const dayResults = await Promise.allSettled(weekKeys.map(k => getFriendWorkout(p.id, k)));
          for (const r of dayResults) {
            if (r.status !== 'fulfilled' || !r.value) continue;
            const w = r.value;
            if ((w.muscles||[]).length || w.exercises?.length || w.breakfast || w.lunch || w.dinner || w.bFoods?.length || w.lFoods?.length || w.dFoods?.length) days++;
          }
          return { ...p, days };
        }
      })
    );

    const board = results.filter(r => r.status === 'fulfilled').map(r => r.value).sort((a, b) => b.days - a.days);

    if (board.length <= 1) { cardEl.style.display = 'none'; return; }

    const rankIcons = ['🥇', '🥈', '🥉'];
    let html = '';
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      const rank = rankIcons[i] || `${i + 1}`;
      const pct = Math.round((p.days / 7) * 100);
      const isMe = p.isMe;
      html += `<div class="lb-row${isMe ? ' lb-me' : ''}">
        <span class="lb-rank">${rank}</span>
        <span class="lb-name">${p.name}</span>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        <span class="lb-days">${p.days}일</span>
      </div>`;
    }
    contentEl.innerHTML = html;
    cardEl.style.display = '';
  } catch(e) { console.warn('[leaderboard]', e); }
}
