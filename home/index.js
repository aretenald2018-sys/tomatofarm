// ================================================================
// home/index.js — 홈 탭 오케스트레이터
// ================================================================

import { shouldShow, isOwnerAccount, getCheerLastSeen, getUnseenCheers } from '../data.js';

// 서브 모듈 import
import { showToast, showConfetti }                           from './utils.js';
import { renderHero, renderLeaderboard, setHeroDeps }        from './hero.js';
import { renderWeeklyStreak }                                from './weekly-streak.js';
import { renderUnitGoal, setUnitGoalDeps }                   from './unit-goal.js';
import { renderMiniMemo, applyAllSectionTitles,
         renderGoals, renderQuests, initQuestDragDrop }      from './goals-quests.js';
import { renderTomatoCard, settleTomatoCycleIfNeeded,
         renderTomatoHero }                                  from './tomato.js';
import { renderFriendFeed, setFriendFeedDeps, quickAddNeighbor, showReactionPicker, showReactionDetail } from './friend-feed.js';
import { setFriendProfileDeps, openFriendProfile, openTomatoGiftModal, openIntroduceFriend, sendReaction } from './friend-profile.js';
import { refreshNotifCenter, setNotificationsDeps }          from './notifications.js';
import { clearCheerCard, renderCheerCard }                   from './cheer-card.js';
import { renderStreakWarning }                                from './streak-warning.js';
import { renderAdminOnboarding }                              from './admin-onboarding.js';
import { applyHomeCardPersonalization }                       from './personalize.js';
import { cheerSignature, hasPriorityHomeOverlay, homeCardVisibility } from './read-model.js';
import { renderHomeChat }                                     from './chat.js';

let _lastCheerSignature = '';

// ── 순환 참조 해결: 콜백 주입 ────────────────────────────────────
setHeroDeps({ renderTomatoHero, renderHome });
setUnitGoalDeps({ renderHome });
setFriendFeedDeps({
  renderHome,
  openFriendProfile,
  openTomatoGiftModal,
  openIntroduceFriend,
  sendReaction,
});
setFriendProfileDeps({
  renderHome,
  renderFriendFeed,
  refreshNotifCenter,
  quickAddNeighbor,
  showReactionPicker,
  showReactionDetail,
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
    // 토마토 카드 경로는 홈 레이아웃을 통째로 바꾼다 — 단위목표 카드를 숨기고
    // 식사/체중/생활존 카드를 걷어낸 뒤 자기 히어로를 세운다. 주인 계정은 그
    // 재배치를 받지 않는 홈을 써 왔으므로 계속 그대로 둔다. 권한이 아니라
    // 화면 구성의 문제라 isAdmin() 이 아니라 isOwnerAccount() 로 가른다.
    if (!isOwnerAccount()) {
      try { renderTomatoCard(); } catch(e) { console.warn('[tomato] card error:', e); }
    }
    renderHero().catch(err => console.warn('[hero] render error:', err));
    renderHomeChat();
    if (isOwnerAccount() && shouldShow('homeCards', 'unit_goal'))  renderUnitGoal();
    if (shouldShow('homeCards', 'mini_memo'))  renderMiniMemo();
    applyAllSectionTitles();
    if (shouldShow('homeCards', 'goals'))      renderGoals();
    if (shouldShow('homeCards', 'quests'))     { renderQuests(); initQuestDragDrop(); }
    const dietGoalEl = document.getElementById('card-diet-goal');
    if (dietGoalEl) dietGoalEl.style.display = 'none';
    renderFriendFeed();
    renderLeaderboard();
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
  for (const { id, visible } of homeCardVisibility(key => shouldShow('homeCards', key))) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
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

  const signature = cheerSignature(cheers);
  if (_lastCheerSignature !== signature) {
    showConfetti(3000);
    _lastCheerSignature = signature;
  }
  renderCheerCard(cheers, () => { _lastCheerSignature = ''; });
}

function _hasPriorityOverlay() {
  return hasPriorityHomeOverlay(document);
}

// ── Export ────────────────────────────────────────────────────────
export { refreshNotifCenter, showToast };
