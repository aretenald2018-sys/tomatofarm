// ================================================================
// home/index.js — 홈 탭 오케스트레이터
// ================================================================

import { shouldShow, isAdmin, getCheerLastSeen, getUnseenCheers } from '../data.js';

// 서브 모듈 import
import { showToast, showConfetti }                           from './utils.js';
import { renderHero, renderLeaderboard, setHeroDeps }        from './hero.js';
import { renderWeeklyStreak }                                from './weekly-streak.js';
import { renderUnitGoal, setUnitGoalDeps }                   from './unit-goal.js';
import { renderMiniMemo, applyAllSectionTitles,
         renderGoals, renderQuests, initQuestDragDrop }      from './goals-quests.js';
import { renderTomatoCard, settleTomatoCycleIfNeeded,
         renderTomatoHero }                                  from './tomato.js';
import { renderFriendFeed, setFriendFeedDeps }               from './friend-feed.js';
import { setFriendProfileDeps }                              from './friend-profile.js';
import { refreshNotifCenter, setNotificationsDeps }          from './notifications.js';
import { clearCheerCard, renderCheerCard }                   from './cheer-card.js';
import { renderGuildCard }                                   from './guild-card.js';
import { renderCheersCard }                                  from './cheers-card.js';
import { renderStreakWarning }                                from './streak-warning.js';
import { renderAdminOnboarding }                              from './admin-onboarding.js';
import { applyHomeCardPersonalization }                       from './personalize.js';

let _lastCheerSignature = '';

// ── 순환 참조 해결: 콜백 주입 ────────────────────────────────────
setHeroDeps({ renderTomatoHero, renderHome });
setUnitGoalDeps({ renderHome });
setFriendFeedDeps({
  renderHome,
  openFriendProfile: (...args) => window.openFriendProfile(...args),
  openTomatoGiftModal: (...args) => window.openTomatoGiftModal(...args),
});
setFriendProfileDeps({
  renderHome,
  renderFriendFeed,
  refreshNotifCenter,
});
setNotificationsDeps({ renderFriendFeed });

// ── 메인 렌더 함수 ──────────────────────────────────────────────
export function renderHome(options = {}) {
  const { deferCheerCard = false } = options;
  try {
    _applyCardVisibility();
    // 관리자 1회성 onboarding 배너 (스트릭 경고보다 먼저 prepend → 위에 배치)
    try { renderStreakWarning(); } catch(e) { console.warn('[streak-warning]', e); }
    try { renderAdminOnboarding(); } catch(e) { console.warn('[admin-onboarding]', e); }
    // 토마토 정산은 모든 사용자에게 실행
    try { settleTomatoCycleIfNeeded(); } catch(e) { console.warn('[tomato] settle error:', e); }
    if (!isAdmin()) {
      try { renderTomatoCard(); } catch(e) { console.warn('[tomato] card error:', e); }
      renderHero().catch(err => console.warn('[hero] render error:', err));
    } else {
      renderHero().catch(err => console.warn('[hero] render error:', err));
    }
    if (isAdmin() && shouldShow('homeCards', 'unit_goal'))  renderUnitGoal();
    if (shouldShow('homeCards', 'mini_memo'))  renderMiniMemo();
    applyAllSectionTitles();
    if (shouldShow('homeCards', 'goals'))      renderGoals();
    if (shouldShow('homeCards', 'quests'))     { renderQuests(); initQuestDragDrop(); }
    const dietGoalEl = document.getElementById('card-diet-goal');
    if (dietGoalEl) dietGoalEl.style.display = 'none';
    renderCheersCard().catch(e => console.warn('[cheers-card]', e));
    renderFriendFeed();
    renderLeaderboard();
    renderGuildCard().catch(e => console.warn('[guild-card]', e));
    if (deferCheerCard) {
      clearCheerCard();
    } else {
      _renderCheerCardIfNeeded().catch(e => console.warn('[cheer-card]', e));
    }
    // 개인화 (순서 재배치 / 숨김) — 모든 카드 렌더 후 적용
    try { applyHomeCardPersonalization(); } catch(e) { console.warn('[personalize]', e); }
  } catch(e) {
    console.error('[renderHome] 렌더링 오류:', e);
  }
}

function _applyCardVisibility() {
  const map = {
    unit_goal: 'card-unit-goal',
    mini_memo: 'card-mini-memo',
    goals:     'card-goals',
    quests:    'card-quests',
    diet_goal: 'card-diet-goal',
    tomato_basket: 'card-tomato-basket',
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.style.display = shouldShow('homeCards', key) ? '' : 'none';
  }
}

async function _renderCheerCardIfNeeded() {
  if (_hasPriorityOverlay()) {
    clearCheerCard();
    return;
  }
  const cheers = await getUnseenCheers(getCheerLastSeen());
  if (_hasPriorityOverlay()) {
    clearCheerCard();
    return;
  }
  if (!cheers.length) {
    _lastCheerSignature = '';
    clearCheerCard();
    return;
  }

  const signature = cheers.map(c => c.id || `${c.from}_${c.createdAt}`).join('|');
  if (_lastCheerSignature !== signature) {
    showConfetti(3000);
    _lastCheerSignature = signature;
  }
  renderCheerCard(cheers, () => { _lastCheerSignature = ''; });
}

function _hasPriorityOverlay() {
  return !!document.getElementById('tutorial-overlay')
    || !!document.querySelector('#dynamic-modal .wb-overlay');
}

// ── Export ────────────────────────────────────────────────────────
export { refreshNotifCenter, showToast };
