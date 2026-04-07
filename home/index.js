// ================================================================
// home/index.js — 홈 탭 오케스트레이터
// ================================================================

import { shouldShow, isAdmin } from '../data.js';

// 서브 모듈 import
import { showToast }                                         from './utils.js';
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
export function renderHome() {
  try {
    _applyCardVisibility();
    if (!isAdmin()) {
      try { settleTomatoCycleIfNeeded(); } catch(e) { console.warn('[tomato] settle error:', e); }
      try { renderTomatoCard(); } catch(e) { console.warn('[tomato] card error:', e); renderHero(); }
    } else {
      renderHero();
    }
    if (isAdmin() && shouldShow('homeCards', 'unit_goal'))  renderUnitGoal();
    if (shouldShow('homeCards', 'mini_memo'))  renderMiniMemo();
    applyAllSectionTitles();
    if (shouldShow('homeCards', 'goals'))      renderGoals();
    if (shouldShow('homeCards', 'quests'))     { renderQuests(); initQuestDragDrop(); }
    const dietGoalEl = document.getElementById('card-diet-goal');
    if (dietGoalEl) dietGoalEl.style.display = 'none';
    renderFriendFeed();
    renderLeaderboard();
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

// ── Export ────────────────────────────────────────────────────────
export { refreshNotifCenter, showToast };
