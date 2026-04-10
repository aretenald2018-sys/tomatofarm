// ================================================================
// home/hero.js — 히어로 카드, 스트릭 대시보드, 리더보드
// ================================================================

import { TODAY, calcStreaks, getMuscles, getDiet, getCF,
         getMilestoneShown, saveMilestoneShown,
         getStreakFreezes, getTomatoState, useStreakFreeze,
         getGlobalWeeklyRanking, getMyFriends, getAccountList, getCurrentUser,
         getFriendWorkout, dateKey, isAdmin, _isMySocialId,
         getGlobalGuildWeeklyRanking }  from '../data.js';
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
  const hour = new Date().getHours();
  const dayOfWeek = TODAY.getDay();
  const isMonday = dayOfWeek === 1;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  function _pick(pool) {
    const seed = TODAY.getDate() * 31 + hour;
    return pool[seed % pool.length];
  }

  let message = '';
  if (mainStreak >= 14) message = _pick([
    `대단해요! ${streakLabel} ${mainStreak}일 연속`,
    `${mainStreak}일째, 완전히 습관이 됐어요!`,
    `멈출 수 없는 기세! ${streakLabel} ${mainStreak}일`,
  ]);
  else if (mainStreak >= 7) message = _pick([
    `대단해요! ${streakLabel} ${mainStreak}일 연속`,
    `일주일 넘었어요! ${streakLabel} ${mainStreak}일째`,
    `꾸준함이 빛나요! ${mainStreak}일 연속`,
  ]);
  else if (mainStreak >= 3) message = _pick([
    `좋은 흐름이에요. ${streakLabel} ${mainStreak}일째`,
    `리듬을 타고 있어요! ${mainStreak}일째`,
    `${mainStreak}일째, 이대로만!`,
  ]);
  else if (mainStreak >= 1) message = _pick([
    `${streakLabel} ${mainStreak}일째, 이어가 볼까요?`,
    isMonday ? '새로운 한 주, 이어가볼까요?' : '오늘도 한 번 더!',
    '기록 하나면 연속 유지!',
  ]);
  else message = _pick([
    '오늘부터 시작해볼까요?',
    '다시 시작하는 것도 멋져요',
    isWeekend ? '주말이니까 가볍게!' : '새로운 1일차를 만들어봐요',
  ]);

  el.innerHTML = `
    <div class="hero-date">${m}월 ${d}일 ${dow}요일</div>
    <div class="hero-streak">${streakEmoji} ${mainStreak}<span class="hero-streak-unit">일</span></div>
    <div class="hero-message">${message}</div>
    <div class="hero-sub-streaks">
      <span class="hero-sub">🏋️ 운동 ${workout}일</span>
      <span class="hero-sub-dot">·</span>
      <span class="hero-sub">🥗 식단 ${diet}일</span>
    </div>
    <div class="hero-social-proof" id="hero-social-proof" style="display:none;"></div>
  `;

  checkStreakMilestone('workout', workout);
  checkStreakMilestone('diet', diet);
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

  const { workout, diet } = calcStreaks();
  const mainStreak = Math.max(workout, diet);
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
  if (!confirm('토마토 1개를 사용하여 오늘의 스트릭을 보호할까요?')) return;
  const result = await useStreakFreeze('workout');
  if (result.error) { showToast(result.error, 2500, 'error'); return; }
  haptic('success');
  showToast('🍅 스트릭이 보호됐어요!', 2500, 'success');
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
      const now = new Date(TODAY);
      const dow = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);
      let myLocalDays = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(mon); d.setDate(mon.getDate() + i);
        const muscles = getMuscles(d.getFullYear(), d.getMonth(), d.getDate());
        const diet = getDiet(d.getFullYear(), d.getMonth(), d.getDate());
        if ((muscles || []).length > 0 || diet.bKcal || diet.lKcal || diet.dKcal) myLocalDays++;
      }

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
      const friends = await getMyFriends();
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
    const proofNames = active.filter(p => !p.isMe).slice(0, 2).map(p => p.name);
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
    const guildData = await getGlobalGuildWeeklyRanking();
    const myGuilds = new Set(user.guilds || []);

    // 길드 아이콘 로드
    let guildIconMap = {};
    try {
      const { getAllGuilds } = await import('../data.js');
      const allGuilds = await getAllGuilds();
      allGuilds.forEach(g => { if (g.icon) guildIconMap[g.name] = g.icon; });
    } catch {};

    let rankings;

    if (guildData && guildData.rankings && guildData.rankings.length) {
      rankings = guildData.rankings;
    } else if (myGuilds.size === 0) {
      contentEl.innerHTML = `<div class="lb-context" style="text-align:center;padding:20px 0;">
        길드에 가입하면 길드 랭킹에 참여할 수 있어요
        <div style="margin-top:8px;"><button class="tds-btn fill md" onclick="openGuildModal()" style="font-size:12px;">길드 가입하기</button></div>
      </div>`;
      return;
    } else {
      // ── 로컬 폴백: 계정 데이터에서 길드 랭킹 계산 ──
      const accounts = await getAccountList();
      const now = new Date(TODAY);
      const dow = now.getDay() || 7;
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1);

      // 전체 길드 → 멤버 매핑
      const guildMembers = {};
      for (const acc of accounts) {
        for (const gName of (acc.guilds || [])) {
          if (!guildMembers[gName]) guildMembers[gName] = [];
          // 내 활동일은 로컬 계산
          let days = 0;
          if (acc.id === user.id) {
            for (let i = 0; i < 7; i++) {
              const d = new Date(mon); d.setDate(mon.getDate() + i);
              const muscles = getMuscles(d.getFullYear(), d.getMonth(), d.getDate());
              const diet = getDiet(d.getFullYear(), d.getMonth(), d.getDate());
              if ((muscles || []).length > 0 || diet.bKcal || diet.lKcal || diet.dKcal) days++;
            }
          }
          guildMembers[gName].push({ userId: acc.id, name: acc.nickname || acc.firstName || acc.id, activeDays: days });
        }
      }
      rankings = Object.entries(guildMembers).map(([gName, members]) => ({
        guildId: gName,
        guildName: gName,
        memberCount: members.length,
        totalActiveDays: members.reduce((s, m) => s + m.activeDays, 0),
        avgActiveDays: +(members.reduce((s, m) => s + m.activeDays, 0) / members.length).toFixed(1),
        members,
      })).sort((a, b) => b.avgActiveDays - a.avgActiveDays);

      if (!rankings.length) {
        contentEl.innerHTML = '<div class="lb-context" style="text-align:center;padding:16px 0;">아직 길드 데이터가 없어요</div>';
        return;
      }
    }
    const rankIcons = ['🥇', '🥈', '🥉'];
    const maxAvg = Math.max(...rankings.map(r => r.avgActiveDays), 1);

    let html = `<div class="lb-context">🏠 ${rankings.length}개 길드가 경쟁 중</div>`;

    for (let i = 0; i < rankings.length; i++) {
      const g = rankings[i];
      const rank = rankIcons[i] || `${i + 1}`;
      const pct = Math.round((g.avgActiveDays / 7) * 100);
      const isMine = myGuilds.has(g.guildId);
      const myCls = isMine ? ' lb-my-guild' : '';

      const nameLen = g.guildName.length;
      const nameFontSize = nameLen > 4 ? '11px' : '13px';

      html += `<div class="lb-row${myCls}">
        <span class="lb-rank">${rank}</span>
        <div class="lb-avatar active" style="font-size:14px;overflow:hidden;">${((guildIconMap[g.guildName] || '🏠').startsWith('data:')) ? `<img src="${guildIconMap[g.guildName]}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : (guildIconMap[g.guildName] || '🏠')}</div>
        <span class="lb-name lb-name-guild" style="font-size:${nameFontSize};">${g.guildName}</span>
        <div class="lb-bar-track"><div class="lb-bar-fill" style="width:${pct}%"></div></div>
        <span class="lb-days"><span class="lb-guild-info">${g.memberCount}명</span> ${g.avgActiveDays}일</span>
      </div>`;
    }

    // 업데이트 시각
    if (guildData?.updatedAt) {
      const diffMin = Math.floor((Date.now() - guildData.updatedAt) / 60000);
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
