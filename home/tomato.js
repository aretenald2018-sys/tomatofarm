// ================================================================
// home/tomato.js — 토마토 사이클, 히어로, 바스켓, 통합 카드
// ================================================================

import { TODAY, getDiet, getDietPlan, calcDietMetrics, getBodyCheckins,
         getExercises, calcStreaks, getDay, getAllDateKeys,
         getUnitGoalStart, saveUnitGoalStart, getDayTargetKcal,
         getTomatoState, saveTomatoState, saveTomatoCycle,
         getTomatoCycles, dateKey,
         getStreakFreezes, useStreakFreeze,
         getMyFriends, getAccountList, trackEvent,
         daysSinceLastCheckin }  from '../data.js';
import { calcTomatoCycle, evaluateCycleResult, getQuarterKey,
         isDietDaySuccess, isExerciseDaySuccess,
         getDayTargetKcal as calcDayTarget }  from '../calc.js';
import { checkStreakMilestone } from './hero.js';
import { showToast, haptic, resolveNickname } from './utils.js';

const TOMATO_STAGES = [
  { icon: '🌱', label: '씨앗을 심었어요' },
  { icon: '🌿', label: '새싹이 자라고 있어요' },
  { icon: '🍅', label: '오늘만 지키면 수확해요!' },
];

// ── 토마토 히어로 (게스트 전용, _renderHero에서 호출) ────────────
export function renderTomatoHero(el) {
  const startStr = getUnitGoalStart();
  if (!startStr) {
    el.innerHTML = '<div class="tomato-hero"><div class="tomato-stage">🌱</div><div class="tomato-message">목표 달성 카드에서 시작일을 설정해주세요</div></div>';
    return;
  }

  const cycle = calcTomatoCycle(startStr, TODAY);
  if (!cycle.cycleStart) return;

  const plan = getDietPlan();
  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const totalCount = Math.max(0, state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0));

  // 식단 상태 계산
  const dietStatuses = cycle.days.map((dayKey, i) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);
    if (dayDate > TODAY) return 'future';
    const diet = getDiet(y, m - 1, d);
    const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
    const target = calcDayTarget(plan, y, m - 1, d);
    if (totalKcal <= 0) return i < cycle.dayIndex ? 'fail' : 'pending';
    return isDietDaySuccess(totalKcal, target) ? 'success' : 'fail';
  });

  // 운동 상태 계산
  const exerciseStatuses = cycle.days.map((dayKey, i) => {
    const [y, m, d] = dayKey.split('-').map(Number);
    const dayDate = new Date(y, m - 1, d);
    if (dayDate > TODAY) return 'future';
    const dayData = getDay(y, m - 1, d);
    if (!isExerciseDaySuccess(dayData)) return i < cycle.dayIndex ? 'fail' : 'pending';
    return 'success';
  });

  const todayDiet = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayKcal = (todayDiet.bKcal || 0) + (todayDiet.lKcal || 0) + (todayDiet.dKcal || 0) + (todayDiet.sKcal || 0);
  const todayTarget = calcDayTarget(plan, TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  const dietPriorFail = dietStatuses.slice(0, cycle.dayIndex).some(s => s === 'fail');
  const exPriorFail = exerciseStatuses.slice(0, cycle.dayIndex).some(s => s === 'fail');

  const stage = TOMATO_STAGES[cycle.dayIndex];
  let stageIcon = stage.icon;
  let message = stage.label;

  const dietAllOk = !dietPriorFail;
  const exAllOk = !exPriorFail;

  if (dietAllOk && exAllOk) {
    message = cycle.dayIndex === 2 ? '더블 수확이 가까워요!' : stage.label;
  } else if (dietAllOk && !exAllOk) {
    message = '식단은 잘 지키고 있어요!';
  } else if (!dietAllOk && exAllOk) {
    message = '운동은 꾸준히 하고 있어요!';
  } else {
    message = cycle.dayIndex === 2
      ? '이번 사이클은 아쉽지만, 내일 새로운 시작이에요'
      : '아직 포기하지 마세요! 좋은 습관을 만들어가요';
    if (cycle.dayIndex === 2) stageIcon = '🌿';
  }

  const dayNames = ['일','월','화','수','목','금','토'];
  const dateStr = `${TODAY.getMonth()+1}월 ${TODAY.getDate()}일 ${dayNames[TODAY.getDay()]}요일`;

  const makeDots = (statuses) => statuses.map((s, i) => {
    let cls = 'tomato-dot';
    if (s === 'success') cls += ' success';
    else if (s === 'fail') cls += ' fail';
    if (i === cycle.dayIndex) cls += ' current';
    return `<div class="${cls}"></div>`;
  }).join('');

  const kcalOk = todayKcal > 0 && todayKcal <= todayTarget + 50;
  const kcalIcon = todayKcal <= 0 ? '' : kcalOk ? ' ✓' : ' ✗';
  const kcalCls = todayKcal <= 0 ? '' : kcalOk ? 'tomato-kcal-ok' : 'tomato-kcal-over';

  const doublePossible = dietAllOk && exAllOk;
  const doubleBadge = doublePossible
    ? `<div class="tomato-double-badge">🍅🍅 더블 수확</div>`
    : '';

  el.innerHTML = `
    <div class="tomato-hero">
      <div style="font-size:13px;color:var(--text-tertiary);font-weight:500;margin-bottom:8px;">${dateStr}</div>
      <div class="tomato-stage">${stageIcon}</div>
      <div class="tomato-day-label">D${cycle.dayIndex + 1} <span style="font-weight:400;color:var(--text-tertiary);font-size:14px;">/ 3</span></div>
      <div class="tomato-dual-track">
        <div class="tomato-track-row">
          <span class="tomato-track-label">🥗</span>
          <div class="tomato-track-dots">${makeDots(dietStatuses)}</div>
          <span class="tomato-track-name">식단</span>
        </div>
        <div class="tomato-track-row">
          <span class="tomato-track-label">💪</span>
          <div class="tomato-track-dots">${makeDots(exerciseStatuses)}</div>
          <span class="tomato-track-name">운동</span>
        </div>
      </div>
      ${doubleBadge}
      <div class="tomato-message">${message}</div>
      <div class="tomato-kcal-status ${kcalCls}">
        ${todayKcal > 0 ? `${todayKcal.toLocaleString()} / ${todayTarget.toLocaleString()} kcal${kcalIcon}` : '아직 식단 기록이 없어요'}
      </div>
      <div class="tomato-quarter-summary">
        <span>🍅 이번 분기: ${qCount}개</span>
        <span style="color:var(--border);">·</span>
        <span>누적: ${totalCount}개</span>
        <button class="tf-info-btn" id="tomato-rule-info" aria-label="토마토 획득 규칙">ⓘ</button>
      </div>
      <div class="hero-social-proof" id="hero-social-proof" style="display:none;"></div>
    </div>
  `;
  document.getElementById('tomato-rule-info')?.addEventListener('click', _showTomatoRuleTooltip);
}

// ── 토마토 규칙 바텀시트 (TDS Modal) ─────────────────────────
function _closeTomatoRule() {
  const modal = document.getElementById('tomato-rule-modal');
  if (modal) {
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 200);
  }
}

function _showTomatoRuleTooltip(e) {
  e.stopPropagation();
  if (document.getElementById('tomato-rule-modal')) {
    _closeTomatoRule();
    return;
  }

  const tomatoState = getTomatoState();
  const available = Math.max(0, tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0));
  const freezes = getStreakFreezes();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const usedThisWeek = freezes.filter(f => f.usedAt > weekAgo);
  const canFreeze = available > 0 && usedThisWeek.length === 0;
  const progressPct = Math.min(Math.round(available / 30 * 100), 100);

  let freezeHtml = '';
  if (usedThisWeek.length > 0) {
    freezeHtml = `<div class="tr-action tr-action--done">
      <div class="tr-action-icon">🍅</div>
      <div class="tr-action-body">
        <span class="tr-action-label">끊김없이 토마토 수확하기</span>
        <span class="tr-action-desc">이번 주 사용 완료</span>
      </div>
    </div>`;
  } else {
    freezeHtml = `<div class="tr-action">
      <div class="tr-action-icon">🍅</div>
      <div class="tr-action-body">
        <span class="tr-action-label">끊김없이 토마토 수확하기</span>
        <span class="tr-action-desc">토마토 1개 · 주 1회</span>
      </div>
      <button class="tr-action-btn${canFreeze ? '' : ' disabled'}" id="tooltip-freeze-btn" ${canFreeze ? '' : 'disabled'}>사용</button>
    </div>`;
  }

  const canGift = available > 0;
  const giftHtml = `<div class="tr-action">
    <div class="tr-action-icon">🎁</div>
    <div class="tr-action-body">
      <span class="tr-action-label">이웃에게 선물하기</span>
      <span class="tr-action-desc">토마토 1개 · 이웃 선택</span>
    </div>
    <button class="tr-action-btn${canGift ? '' : ' disabled'}" id="tooltip-gift-btn" ${canGift ? '' : 'disabled'}>사용</button>
  </div>`;

  const modal = document.createElement('div');
  modal.id = 'tomato-rule-modal';
  modal.className = 'modal-backdrop';
  modal.onclick = (ev) => { if (ev.target === modal) _closeTomatoRule(); };
  modal.innerHTML = `
    <div class="modal-sheet tr-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>

      <div class="tr-header">
        <div class="tr-title">토마토 획득 규칙</div>
      </div>

      <div class="tr-section">
        <div class="tr-row">
          <span class="tr-row-icon">🥗</span>
          <span class="tr-row-text">식단 3일 연속 달성</span>
          <span class="tr-row-badge">+1</span>
        </div>
        <div class="tr-row">
          <span class="tr-row-icon">💪</span>
          <span class="tr-row-text">운동 3일 연속 달성</span>
          <span class="tr-row-badge">+1</span>
        </div>
        <div class="tr-row tr-row--highlight">
          <span class="tr-row-icon">🥗+💪</span>
          <span class="tr-row-text">둘 다 달성</span>
          <span class="tr-row-badge tr-row-badge--double">+2</span>
        </div>
      </div>

      <div class="tr-divider"></div>

      <div class="tr-section">
        <div class="tr-section-label">보유 현황</div>
        <div class="tr-progress-row">
          <span class="tr-progress-count">${available}<span class="tr-progress-unit">개</span></span>
          <span class="tr-progress-goal">/ 30개</span>
        </div>
        <div class="tr-progress-bar">
          <div class="tr-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div class="tr-progress-hint">30개 모으면 개발자로부터 실제 토마토 한 팩을 받아볼 수 있어요!</div>
      </div>

      <div class="tr-divider"></div>

      <div class="tr-section">
        <div class="tr-section-label">사용처</div>
        <div class="tr-action-list">
          ${freezeHtml}
          ${giftHtml}
        </div>
      </div>

      <div id="tr-friend-picker" class="tr-friend-picker" style="display:none;">
        <div class="tr-divider"></div>
        <div class="tr-section-label">선물할 이웃 선택</div>
        <div id="tr-friend-list" class="tr-friend-list">
          <div class="tr-friend-loading">불러오는 중...</div>
        </div>
      </div>

      <button class="tds-btn fill md tr-close-btn" onclick="_closeTomatoRuleGlobal()">확인</button>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('open'));

  modal.querySelector('#tooltip-freeze-btn')?.addEventListener('click', async () => {
    if (!confirm('토마토 1개를 사용하여 오늘의 스트릭을 보호할까요?')) return;
    const result = await useStreakFreeze('workout');
    if (result.error) { showToast(result.error, 2500, 'error'); return; }
    haptic('success');
    showToast('🍅 스트릭이 보호됐어요!', 2500, 'success');
    _closeTomatoRule();
  });

  modal.querySelector('#tooltip-gift-btn')?.addEventListener('click', async () => {
    const picker = modal.querySelector('#tr-friend-picker');
    if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
    picker.style.display = '';
    const listEl = modal.querySelector('#tr-friend-list');
    try {
      const [friends, accounts] = await Promise.all([getMyFriends(), getAccountList()]);
      if (friends.length === 0) {
        listEl.innerHTML = '<div class="tr-friend-empty">아직 이웃이 없어요</div>';
        return;
      }
      listEl.innerHTML = friends.map(f => {
        const acc = accounts.find(a => a.id === f.friendId);
        const name = acc ? resolveNickname(acc, accounts) : f.friendId;
        return `<button class="tr-friend-item" data-fid="${f.friendId}" data-fname="${name}">
          <span class="tr-friend-name">${name}</span>
          <span class="tr-friend-send">선물</span>
        </button>`;
      }).join('');
      listEl.querySelectorAll('.tr-friend-item').forEach(btn => {
        btn.addEventListener('click', () => {
          _closeTomatoRule();
          window.openTomatoGiftModal(btn.dataset.fid, btn.dataset.fname);
        });
      });
    } catch (e) {
      console.warn('[tomato-rule] friend list:', e);
      listEl.innerHTML = '<div class="tr-friend-empty">이웃 목록을 불러올 수 없어요</div>';
    }
  });
}

window._closeTomatoRuleGlobal = _closeTomatoRule;

// ── 토마토 사이클 정산 ──────────────────────────────────────────
export function settleTomatoCycleIfNeeded() {
  let startStr = getUnitGoalStart();

  // unit_goal_start가 없거나, 더 오래된 데이터가 있으면 최초 데이터 날짜로 교정
  const allKeys = getAllDateKeys();
  if (allKeys.length > 0) {
    allKeys.sort();
    const earliest = allKeys[0];
    if (!startStr || earliest < startStr) {
      startStr = earliest;
      saveUnitGoalStart(startStr);
    }
  }
  if (!startStr) return;

  const cycle = calcTomatoCycle(startStr, TODAY);
  if (!cycle.cycleStart) return;

  const state = getTomatoState();
  const plan = getDietPlan();
  const existingCycles = getTomatoCycles();
  const existingIds = new Set(existingCycles.map(c => c.id));

  const start = new Date(startStr + 'T00:00:00');
  const todayMs = new Date(dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) + 'T00:00:00').getTime();
  const diffDays = Math.floor((todayMs - start.getTime()) / 86400000);
  console.log(`[tomato] startStr=${startStr}, diffDays=${diffDays}, allKeys=${allKeys.length}개`);
  if (diffDays < 3) return;

  const totalCycles = Math.floor(diffDays / 3);
  // 마이그레이션: 3일 사이클 소급 정산이 안 된 경우 전체 기간 대상
  const migrated = state.migrated_v2;
  const startCycle = migrated ? Math.max(0, totalCycles - 10) : 0;
  console.log(`[tomato] settlement: startStr=${startStr}, totalCycles=${totalCycles}, startCycle=${startCycle}, migrated=${!!migrated}`);

  // 마이그레이션 시 state 재계산 (v1 잔여값 정리)
  if (!migrated) {
    const cycle3Cycles = existingCycles.filter(c => c.id.startsWith('cycle3_'));
    state.totalTomatoes = cycle3Cycles.reduce((sum, c) => sum + (c.tomatoesAwarded || 0), 0);
    state.quarterlyTomatoes = {};
    cycle3Cycles.forEach(c => {
      if (c.tomatoesAwarded > 0) {
        state.quarterlyTomatoes[c.quarter] = (state.quarterlyTomatoes[c.quarter] || 0) + c.tomatoesAwarded;
      }
    });
    // giftedSent가 총 보유량을 초과하면 보정 (음수 표시 방지)
    const maxSent = state.totalTomatoes + (state.giftedReceived || 0);
    if ((state.giftedSent || 0) > maxSent) {
      state.giftedSent = maxSent;
    }
  }
  let newlyAwarded = 0;

  for (let ci = startCycle; ci < totalCycles; ci++) {
    const csDate = new Date(start);
    csDate.setDate(csDate.getDate() + ci * 3);
    const csKey = `${csDate.getFullYear()}-${String(csDate.getMonth()+1).padStart(2,'0')}-${String(csDate.getDate()).padStart(2,'0')}`;
    const cycleId = `cycle3_${csKey}`;

    if (existingIds.has(cycleId)) continue;

    const dayResults = [];
    for (let di = 0; di < 3; di++) {
      const dd = new Date(csDate);
      dd.setDate(dd.getDate() + di);
      const y = dd.getFullYear(), m = dd.getMonth(), d = dd.getDate();
      const diet = getDiet(y, m, d);
      const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
      const dayData = getDay(y, m, d);
      const target = calcDayTarget(plan, y, m, d, dayData);
      dayResults.push({ date: dateKey(y, m, d), intake: totalKcal, target, dayData });
    }

    const result = evaluateCycleResult(dayResults);
    const ceDate = new Date(csDate);
    ceDate.setDate(ceDate.getDate() + 2);
    const ceKey = `${ceDate.getFullYear()}-${String(ceDate.getMonth()+1).padStart(2,'0')}-${String(ceDate.getDate()).padStart(2,'0')}`;
    const qKey = getQuarterKey(ceDate);

    const cycleResult = {
      id: cycleId,
      cycleStart: csKey,
      cycleEnd: ceKey,
      days: dayResults.map((dr, i) => ({
        date: dr.date, intake: dr.intake, target: dr.target,
        dietSuccess: result.dietSuccesses[i],
        exerciseSuccess: result.exerciseSuccesses[i],
      })),
      dietAllSuccess: result.dietAllSuccess,
      exerciseAllSuccess: result.exerciseAllSuccess,
      tomatoesAwarded: result.tomatoesAwarded,
      quarter: qKey,
      settledAt: Date.now(),
    };

    saveTomatoCycle(cycleResult);
    existingIds.add(cycleId);

    if (result.tomatoesAwarded > 0) {
      state.quarterlyTomatoes[qKey] = (state.quarterlyTomatoes[qKey] || 0) + result.tomatoesAwarded;
      state.totalTomatoes += result.tomatoesAwarded;
      newlyAwarded += result.tomatoesAwarded;
    }
  }

  // 마이그레이션 완료 플래그 (유저별 Firebase에 저장)
  if (!migrated) {
    state.migrated_v2 = true;
  }

  saveTomatoState(state);

  console.log(`[tomato] awarded ${newlyAwarded} tomatoes, total=${state.totalTomatoes}`);
  // analytics 계측
  if (newlyAwarded > 0) trackEvent('gamification', 'tomato_harvested');
  // 새로 수확한 토마토가 있으면 축하 모달 예약
  if (newlyAwarded > 0) {
    const total = Math.max(0, state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0));
    setTimeout(() => _showHarvestCelebration(newlyAwarded, total), 800);
  }
}

// ── 토마토 수확 축하 모달 ──────────────────────────────────────
function _showHarvestCelebration(count, totalCount) {
  const existing = document.getElementById('harvest-celebration-modal');
  if (existing) existing.remove();

  const remaining30 = Math.max(0, 30 - totalCount);
  const reached30 = totalCount >= 30;

  let rewardHtml = '';
  if (reached30) {
    rewardHtml = `
      <div class="harvest-reward harvest-reward--complete">
        <span class="harvest-reward-icon">📦</span>
        <div class="harvest-reward-text">
          <div class="harvest-reward-title">토마토 한 팩 배송 대상!</div>
          <div class="harvest-reward-desc">30개 달성! 등록된 주소로 실제 토마토를 보내드려요.</div>
        </div>
      </div>`;
  } else {
    rewardHtml = `
      <div class="harvest-reward">
        <span class="harvest-reward-icon">🎯</span>
        <div class="harvest-reward-text">
          <div class="harvest-reward-title">토마토 30개를 모으면</div>
          <div class="harvest-reward-desc">실제 토마토 한 팩을 집으로 보내드려요!<br>앞으로 <strong>${remaining30}개</strong> 남았어요.</div>
        </div>
      </div>`;
  }

  const modal = document.createElement('div');
  modal.id = 'harvest-celebration-modal';
  modal.className = 'modal-backdrop open';
  modal.style.zIndex = '1003';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal-sheet" style="text-align:center;padding:32px 20px 20px 20px;" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="font-size:64px;margin:16px 0;animation:tomato-bounce-in 0.3s ease;">🍅</div>
      <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px;">
        토마토 ${count}개 수확!
      </div>
      <div style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;">
        꾸준한 노력이 열매를 맺었어요.
      </div>
      <div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:var(--radius-full);background:var(--primary-bg);color:var(--primary);font-size:13px;font-weight:700;margin-bottom:20px;">
        🍅 누적 ${totalCount}개
      </div>
      ${rewardHtml}
      <div class="harvest-rule-section">
        <div class="harvest-rule-header">토마토 획득 규칙</div>
        <div class="harvest-rule-row">
          <span class="harvest-rule-emoji">🥗</span>
          <span class="harvest-rule-label">식단 3일 연속 달성</span>
          <span class="harvest-rule-value">🍅 ×1</span>
        </div>
        <div class="harvest-rule-row">
          <span class="harvest-rule-emoji">💪</span>
          <span class="harvest-rule-label">운동 3일 연속 달성</span>
          <span class="harvest-rule-value">🍅 ×1</span>
        </div>
        <div class="harvest-rule-row harvest-rule-row--last">
          <span class="harvest-rule-emoji">🥗+💪</span>
          <span class="harvest-rule-label">둘 다 달성하면</span>
          <span class="harvest-rule-value" style="color:var(--primary);font-weight:700;">🍅🍅 ×2</span>
        </div>
      </div>
      <div style="margin-top:20px;">
        <button class="tds-btn fill md" style="width:100%;" onclick="this.closest('.modal-backdrop').remove()">계속하기 💪</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Confetti + Haptic
  if (window._showConfetti) window._showConfetti(3500);
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 100]);
  haptic('success');
}

// [DEV] 콘솔에서 수확 카드 테스트: window._debugHarvest(수확개수, 누적개수)
window._debugHarvest = (count = 3, total = 10) => _showHarvestCelebration(count, total);

// ── 토마토 바구니 카드 ──────────────────────────────────────────
export function renderTomatoBasket() {
  const el = document.getElementById('tomato-basket-content');
  if (!el) return;

  const state = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCycles = getTomatoCycles(qKey);
  const qCount = state.quarterlyTomatoes[qKey] || 0;
  const giftCount = state.giftedReceived || 0;
  const totalAvailable = Math.max(0, state.totalTomatoes + (state.giftedReceived || 0) - (state.giftedSent || 0));

  const qStart = new Date(TODAY.getFullYear(), Math.floor(TODAY.getMonth() / 3) * 3, 1);
  const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const maxCycles = Math.floor((qEnd.getTime() - qStart.getTime()) / 86400000 / 3);

  let gridHtml = '';
  for (let i = 0; i < maxCycles; i++) {
    if (i < qCount) {
      gridHtml += '<div class="tomato-basket-cell earned">🍅</div>';
    } else {
      gridHtml += '<div class="tomato-basket-cell"></div>';
    }
  }

  let heatmapHtml = '';
  const startDate = new Date(qStart);
  while (startDate <= qEnd && startDate <= TODAY) {
    const y = startDate.getFullYear(), m = startDate.getMonth(), d = startDate.getDate();
    const diet = getDiet(y, m, d);
    const totalKcal = (diet.bKcal || 0) + (diet.lKcal || 0) + (diet.dKcal || 0) + (diet.sKcal || 0);
    const target = calcDayTarget(getDietPlan(), y, m, d);
    let cls = 'tomato-heatmap-cell';
    if (totalKcal > 0) {
      cls += isDietDaySuccess(totalKcal, target) ? ' ok' : ' fail';
    } else {
      cls += ' empty';
    }
    heatmapHtml += `<div class="${cls}" title="${m+1}/${d}"></div>`;
    startDate.setDate(startDate.getDate() + 1);
  }

  const qLabel = qKey.replace('-', ' ');

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:14px;font-weight:700;color:var(--text);">🍅 ${qLabel} 토마토 바구니</span>
      <button class="section-title-edit-btn" onclick="document.getElementById('tomato-basket-detail').classList.toggle('tomato-expanded')">펼치기</button>
    </div>
    <div class="tomato-basket-summary">
      <span>🍅 수확 ${qCount}개</span>
      ${giftCount > 0 ? `<span>🎁 선물 ${giftCount}개</span>` : ''}
      <span style="margin-left:auto;font-weight:700;color:var(--primary);">총 ${totalAvailable}개</span>
    </div>
    <div id="tomato-basket-detail">
      <div class="tomato-basket-grid">${gridHtml}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin:12px 0 6px;">일별 기록</div>
      <div class="tomato-heatmap">${heatmapHtml}</div>
      <div style="display:flex;gap:12px;margin-top:8px;font-size:10px;color:var(--text-tertiary);">
        <span><span class="tomato-heatmap-cell ok" style="display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:middle;"></span> 성공</span>
        <span><span class="tomato-heatmap-cell fail" style="display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:middle;"></span> 실패</span>
        <span><span class="tomato-heatmap-cell empty" style="display:inline-block;width:8px;height:8px;border-radius:2px;vertical-align:middle;"></span> 미기록</span>
      </div>
    </div>
  `;
}

// ── 매크로 라인 헬퍼 ─────────────────────────────────────────────
function buildMacroLine(label, dayData, actKey, tgtKey, lessIsGood) {
  let cells = '';
  dayData.forEach(d => {
    const act = d[actKey], tgt = d[tgtKey];
    if (d.future || act <= 0) {
      cells += '<span class="tf-macro-cell muted">—</span>';
    } else {
      const diff = Math.round(act - tgt);
      const sign = diff > 0 ? '+' : '';
      const cls = diff > 0 ? 'tf-over' : (diff < 0 ? (lessIsGood ? 'tf-ok' : 'tf-over') : 'tf-ok');
      cells += `<span class="tf-macro-cell ${cls}">${sign}${diff}g</span>`;
    }
  });
  return `<div class="tf-macro-line">
    <span class="tf-macro-label">${label}</span>
    <div class="tf-macro-cells">${cells}</div>
  </div>`;
}

// ── 다이어트 현황 HTML 빌드 ──────────────────────────────────────
function buildDietStatusHtml(plan, metrics) {
  if (!plan._userSet || !plan.weight) return '';

  const checkins = getBodyCheckins();
  const latest = checkins.length ? checkins[checkins.length - 1] : null;
  const curWeight = latest?.weight ?? plan.weight;
  const wTarget = plan.targetWeight || (plan.weight - (metrics.totalWeightLoss || 0));
  const wStart = plan.weight;
  const lost = Math.max(wStart - curWeight, 0);
  const remain = Math.max(curWeight - wTarget, 0);
  const wProgress = wStart > wTarget ? Math.min(Math.round((wStart - curWeight) / (wStart - wTarget) * 100), 100) : 0;

  const weeksLeft = metrics.weeksNeeded;
  const doneText = plan.startDate
    ? (() => { const d = new Date(plan.startDate); d.setDate(d.getDate() + Math.round(weeksLeft * 7)); return `${d.getMonth()+1}/${d.getDate()}`; })()
    : `${Math.round(weeksLeft)}주 후`;

  const dow = TODAY.getDay();
  const isRefeed = (plan.refeedDays || []).includes(dow);

  return `
    <div class="tf-diet-section">
      <div class="tf-kcal-header">
        <span class="tf-kcal-label">다이어트 현황</span>
        <button onclick="openCheckinModal()" style="font-size:11px;color:#fa342c;font-weight:600;background:none;border:none;cursor:pointer;padding:0;">몸무게 입력 →</button>
      </div>
      <div class="tf-diet-body">
        <div class="tf-diet-stats">
          <div class="tf-diet-stat">
            <span class="tf-diet-stat-label">현재</span>
            <span class="tf-diet-stat-value">${curWeight.toFixed(1)}<span class="tf-diet-stat-unit">kg</span></span>
          </div>
          <div class="tf-diet-stat-arrow">→</div>
          <div class="tf-diet-stat">
            <span class="tf-diet-stat-label">목표</span>
            <span class="tf-diet-stat-value">${wTarget.toFixed(1)}<span class="tf-diet-stat-unit">kg</span></span>
          </div>
          <div class="tf-diet-stat-divider"></div>
          <div class="tf-diet-stat">
            <span class="tf-diet-stat-label">감량</span>
            <span class="tf-diet-stat-value tf-diet-highlight">${lost > 0 ? '-' : ''}${lost.toFixed(1)}<span class="tf-diet-stat-unit">kg</span></span>
          </div>
        </div>
        <div class="tf-diet-progress-wrap">
          <div class="tf-diet-progress-bar">
            <div class="tf-diet-progress-fill" style="width:${wProgress}%"></div>
          </div>
          <div class="tf-diet-progress-info">
            <div class="tf-diet-tags">
              <span class="tf-diet-tag ${isRefeed ? 'tf-diet-tag-blue' : 'tf-diet-tag-orange'}">${isRefeed ? '리피드' : '데피싯'}</span>
              ${remain > 0 ? `<span class="tf-diet-tag tf-diet-tag-gray">${remain.toFixed(1)}kg 남음</span>` : '<span class="tf-diet-tag tf-diet-tag-green">달성!</span>'}
            </div>
            <span class="tf-diet-eta">📅 ${doneText} 예상</span>
          </div>
        </div>
      </div>
    </div>`;
}

// ── 토마토 통합 카드 (게스트용 메인 카드) ────────────────────────
export function renderTomatoCard() {
  const heroEl = document.getElementById('hero-content');
  const unitEl = document.getElementById('unit-goal-content');
  if (!heroEl) return;

  const plan = getDietPlan();
  const _chk = getBodyCheckins();
  const _latestW = _chk.length ? _chk[_chk.length - 1].weight : null;
  const metrics = calcDietMetrics(_latestW ? { ...plan, weight: _latestW } : plan);
  const tomatoState = getTomatoState();
  const qKey = getQuarterKey(TODAY);
  const qCount = tomatoState.quarterlyTomatoes[qKey] || 0;
  const totalCount = Math.max(0, tomatoState.totalTomatoes + (tomatoState.giftedReceived || 0) - (tomatoState.giftedSent || 0));

  let startStr = getUnitGoalStart();
  if (!startStr) {
    startStr = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    saveUnitGoalStart(startStr);
  }
  const cycle = calcTomatoCycle(startStr, TODAY);
  const dayIndex = cycle.dayIndex;
  const stages = ['🌱','🌿','🍅'];
  const stageLabels = ['씨앗 심기','새싹 돌보기','수확하기'];

  const streaks = calcStreaks();
  const bestStreak = Math.max(streaks.workout, streaks.diet);
  const streakType = streaks.workout >= streaks.diet ? '운동' : '식단';
  const todayDk = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayDiet = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayExercises = getExercises(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const hasRecordedToday = (todayExercises && todayExercises.length > 0) ||
    (todayDiet && ((todayDiet.bKcal||0) + (todayDiet.lKcal||0) + (todayDiet.dKcal||0) > 0));
  const now = new Date();
  const hour = now.getHours();
  const hoursLeft = 23 - hour;
  const dow = TODAY.getDay();
  const isMonday = dow === 1;
  const isFriday = dow === 5;
  const isWeekend = dow === 0 || dow === 6;
  const isDawn = hour >= 5 && hour < 7;
  const isMorning = hour >= 7 && hour < 10;
  const isMidday = hour >= 10 && hour < 13;
  const isAfternoon = hour >= 13 && hour < 18;
  const isEvening = hour >= 18 && hour < 22;
  const isLateNight = hour >= 22;  // 22시 이후만 긴급 (새벽 0~5시는 제외)

  // 결정적 랜덤: 같은 날·시간대엔 동일 문구, 시간 바뀌면 자연스럽게 변경
  function pickMsg(pool) {
    const seed = TODAY.getDate() * 31 + hour;
    return pool[seed % pool.length];
  }

  const todayDietForKcal = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const todayKcal = (todayDietForKcal.bKcal||0) + (todayDietForKcal.lKcal||0) + (todayDietForKcal.dKcal||0) + (todayDietForKcal.sKcal||0);
  const isRefeed = (plan.refeedDays || []).includes(dow);
  const dayTarget = isRefeed ? metrics.refeed : metrics.deficit;
  const todayTarget = dayTarget.kcal || 0;

  let heroLabel, heroCount, heroSub, heroEmoji;

  if (bestStreak >= 14 && hasRecordedToday) {
    heroLabel = pickMsg([
      '멈출 수 없는 기세!',
      '완전히 습관이 됐어요!',
      `${bestStreak}일째, 전설을 쓰는 중!`,
      '이 루틴, 누구도 못 막아요!',
      '꾸준함의 끝판왕!',
    ]);
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `🍅 ${totalCount}개 · 이번 분기 <b>${qCount}개</b>`;
    heroEmoji = '🔥';
  } else if (bestStreak >= 7 && hasRecordedToday) {
    heroLabel = pickMsg([
      '대단해요, 일주일 넘었어요!',
      '꾸준함이 빛나는 순간!',
      '이 루틴 정말 멋져요!',
      `${bestStreak}일째, 습관이 되어가고 있어요!`,
    ]);
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `🍅 ${totalCount}개 · 이번 분기 <b>${qCount}개</b>`;
    heroEmoji = '🔥';
  } else if (bestStreak >= 3 && hasRecordedToday) {
    heroLabel = pickMsg([
      '좋은 흐름이에요!',
      '리듬을 타고 있어요!',
      `${bestStreak}일째, 멋진 페이스!`,
      '이대로만 가면 돼요!',
    ]);
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `🍅 ${totalCount}개 · 이번 분기 <b>${qCount}개</b>`;
    heroEmoji = '🔥';
  } else if (bestStreak >= 2 && !hasRecordedToday && (isEvening || isLateNight)) {
    heroLabel = pickMsg([
      '연속 기록이 위험해요!',
      `${hoursLeft}시간 남았어요!`,
      '오늘이 끝나기 전에!',
      isLateNight ? '자기 전에 기록 한 번!' : '지금 기록하면 연속 유지!',
    ]);
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `<span style="color:#fdf0f0;font-weight:600;">오늘 기록하면 ${bestStreak + 1}일째 · ${hoursLeft}시간 남음</span>`;
    heroEmoji = '⚠️';
  } else if (bestStreak >= 2 && !hasRecordedToday) {
    heroLabel = pickMsg([
      '오늘도 이어가볼까요?',
      isFriday ? '금요일! 주말에도 이어가볼까요?' : '오늘 한 번이면 연속 유지!',
      isWeekend ? '쉬는 날에도 가볍게 한 번!' : '기록 한 번이면 충분해요',
    ]);
    heroCount = `${bestStreak}<span class="tf-hero-unit">일</span>`;
    heroSub = `<span style="color:#fdf0f0;font-weight:600;">기록하면 ${bestStreak + 1}일 연속!</span>`;
    heroEmoji = '💪';
  } else if (hasRecordedToday) {
    heroLabel = pickMsg([
      '오늘도 기록 완료!',
      '잘했어요, 오늘의 할 일 끝!',
      '오늘도 한 발짝 나아갔어요!',
    ]);
    heroCount = `${totalCount}<span class="tf-hero-unit">개</span>`;
    heroSub = `이번 분기 <b>${qCount}개</b> 수확`;
    heroEmoji = stages[dayIndex];
  } else if (bestStreak === 0) {
    heroLabel = pickMsg([
      '다시 시작하는 것도 멋져요',
      '오늘부터 새로운 1일차!',
      isWeekend ? '주말이니까 가볍게 시작해볼까요?' : '한 번이면 돼요, 시작해봐요',
      isMonday ? '새로운 한 주, 새로운 시작!' : '오늘이 바로 그날이에요',
    ]);
    heroCount = `${totalCount}<span class="tf-hero-unit">개</span>`;
    heroSub = `이번 분기 <b>${qCount}개</b> 수확`;
    heroEmoji = stages[dayIndex];
  } else {
    heroLabel = pickMsg([
      '오늘 첫 기록을 남겨보세요',
      '작은 기록이 큰 변화를 만들어요',
      '시작이 반이에요!',
    ]);
    heroCount = `${totalCount}<span class="tf-hero-unit">개</span>`;
    heroSub = `이번 분기 <b>${qCount}개</b> 수확`;
    heroEmoji = stages[dayIndex];
  }

  heroEl.innerHTML = `
    <div class="tf-card">
      <div class="tf-hero tf-hero--gradient">
        <div class="tf-hero-left">
          <div class="tf-hero-label">${heroLabel}</div>
          <div class="tf-hero-count">${heroCount}</div>
          <div class="tf-hero-sub">${heroSub} <button class="tf-info-btn tf-info-btn--light" id="tomato-rule-info-card" aria-label="토마토 획득 규칙">ⓘ</button></div>
        </div>
        <div class="tf-hero-right">
          <div class="tf-hero-tomato">${heroEmoji}</div>
        </div>
      </div>
      <div class="hero-social-proof" id="hero-social-proof" style="display:none;padding:0 16px 12px;"></div>
    </div>
  `;

  document.getElementById('tomato-rule-info-card')?.addEventListener('click', _showTomatoRuleTooltip);

  checkStreakMilestone('workout', streaks.workout);
  checkStreakMilestone('diet', streaks.diet);

  const unitCard = document.getElementById('card-unit-goal');
  if (unitCard) unitCard.style.display = 'none';

  document.getElementById('tf-meal-card')?.remove();
  document.getElementById('tf-weight-card')?.remove();

  const homeHero = document.getElementById('home-hero');
  const todayDietData = getDiet(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const totalIntake = (todayDietData.bKcal||0) + (todayDietData.lKcal||0) + (todayDietData.dKcal||0) + (todayDietData.sKcal||0);
  const kcalPct = todayTarget > 0 ? Math.min(Math.round(totalIntake / todayTarget * 100), 100) : 0;
  const kcalState = totalIntake <= 0 ? '' : totalIntake <= todayTarget + 50 ? 'ok' : 'over';
  const remaining = Math.max(todayTarget - totalIntake, 0);

  const mealCard = document.createElement('div');
  mealCard.id = 'tf-meal-card';
  mealCard.className = 'home-card tf-summary-card';
  mealCard.onclick = () => switchTab('diet');
  mealCard.innerHTML = `
    <div class="tf-sum-row">
      <div class="tf-sum-left">
        <span class="tf-sum-title">오늘의 칼로리</span>
        <div class="tf-sum-nums">
          <span class="tf-sum-big ${kcalState === 'over' ? 'tf-over' : ''}">${totalIntake > 0 ? totalIntake.toLocaleString() : '—'}</span>
          <span class="tf-sum-sep">/</span>
          <span class="tf-sum-target">${todayTarget.toLocaleString()}<span class="tf-sum-unit">kcal</span></span>
        </div>
        ${totalIntake > 0 && todayTarget > 0 ? `<span class="tf-sum-remaining ${kcalState}">${kcalState === 'over' ? `${(totalIntake - todayTarget).toLocaleString()}kcal 초과` : `${remaining.toLocaleString()}kcal 남음`}</span>` : '<span class="tf-sum-remaining">아직 기록이 없어요</span>'}
      </div>
      <div class="tf-sum-ring-wrap">
        <svg class="tf-sum-ring" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--surface2)" stroke-width="5"/>
          <circle cx="24" cy="24" r="20" fill="none"
            stroke="${kcalState === 'over' ? '#e53935' : 'var(--primary)'}"
            stroke-width="5" stroke-linecap="round"
            stroke-dasharray="${Math.round(125.66 * Math.min(kcalPct, 100) / 100)} 125.66"
            transform="rotate(-90 24 24)"
            style="transition:stroke-dasharray 0.5s ease;"/>
        </svg>
        <span class="tf-sum-ring-text">${kcalPct}%</span>
      </div>
    </div>
    <div class="tf-sum-footer">
      <span class="tf-sum-hint">식단 탭에서 상세 보기</span>
      <span class="tf-sum-arrow">›</span>
    </div>
  `;
  homeHero.after(mealCard);

  if (plan._userSet && plan.weight) {
    const checkins = getBodyCheckins();
    const latest = checkins.length ? checkins[checkins.length - 1] : null;
    const curWeight = latest?.weight ?? plan.weight;
    const wTarget = plan.targetWeight || (plan.weight - (metrics.totalWeightLoss || 0));
    const wStart = plan.weight;
    const lost = Math.max(wStart - curWeight, 0);
    const wRange = wStart - wTarget;
    const wProgress = wRange > 0 ? Math.min(Math.round(Math.max(wStart - curWeight, 0) / wRange * 100), 100) : 0;
    const wProgressVisual = (wStart - curWeight) > 0 ? Math.max(wProgress, 8) : 0;

    const daysSince = daysSinceLastCheckin();
    const isStale = daysSince >= 7;
    const hintText = isStale ? '바뀐 몸무게 입력하기 ›' : '몸무게 입력 ›';
    const staleSub = isStale && daysSince !== Infinity
      ? `<span class="tf-wt-stale-sub">${daysSince}일째 미입력</span>`
      : '';

    const weightCard = document.createElement('div');
    weightCard.id = 'tf-weight-card';
    weightCard.className = 'home-card tf-summary-card' + (isStale ? ' tf-weight-card-stale' : '');
    weightCard.onclick = () => openCheckinModal();
    weightCard.innerHTML = `
      <div class="tf-sum-row">
        <div class="tf-sum-left">
          <span class="tf-sum-title">체중${staleSub}</span>
          <div class="tf-sum-nums">
            <span class="tf-sum-big">${curWeight.toFixed(1)}</span>
            <span class="tf-sum-unit-lg">kg</span>
            ${lost > 0 ? `<span class="tf-wt-delta">-${lost.toFixed(1)}</span>` : ''}
          </div>
        </div>
        <div class="tf-sum-right-text">
          <span class="tf-sum-hint${isStale ? ' tf-sum-hint-stale' : ''}">${hintText}</span>
        </div>
      </div>
      <div class="tf-wt-journey">
        <div class="tf-wt-journey-bar">
          <div class="tf-wt-journey-fill tf-wt-animate" data-width="${wProgressVisual}"></div>
          <div class="tf-wt-journey-marker tf-wt-animate-marker" data-left="${wProgressVisual}"></div>
        </div>
      </div>
    `;
    mealCard.after(weightCard);

    setTimeout(() => {
      const fill = weightCard.querySelector('.tf-wt-animate');
      const marker = weightCard.querySelector('.tf-wt-animate-marker');
      if (fill) { fill.style.width = fill.dataset.width + '%'; }
      if (marker) { marker.style.left = marker.dataset.left + '%'; }
    }, 50);
  }
}
