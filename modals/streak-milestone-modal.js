// ================================================================
// modals/streak-milestone-modal.js — 스트릭 마일스톤 축하 모달
// ================================================================

export const MODAL_HTML = `
<div class="modal-backdrop" id="streak-milestone-modal" onclick="closeStreakMilestone(event)" style="display:none;z-index:1002">
  <div class="modal-sheet" style="text-align:center;padding:32px 24px;">
    <div class="sheet-handle"></div>
    <div id="milestone-emoji" style="font-size:64px;margin:16px 0;animation:tomato-bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1);"></div>
    <div id="milestone-title" style="font-size:22px;font-weight:800;color:var(--text);margin-bottom:8px;"></div>
    <div id="milestone-subtitle" style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:24px;"></div>
    <div id="milestone-badge" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:999px;background:var(--primary-bg);color:var(--primary);font-size:13px;font-weight:700;margin-bottom:24px;"></div>
    <div>
      <button class="tds-btn fill md" onclick="closeStreakMilestone()" style="width:100%;font-size:15px;padding:14px;">계속하기 💪</button>
    </div>
  </div>
</div>
`;

const MILESTONE_CONFIG = {
  7:   { emoji: '🔥', title: '일주일 연속 달성!', sub: '꾸준함이 습관을 만들어요.\n대부분이 여기서 포기하지만, 당신은 달라요.' },
  14:  { emoji: '⚡', title: '2주 연속! 습관이 되고 있어요', sub: '이제 몸이 기억하기 시작했어요.\n멈추면 아까울 정도로 잘하고 있어요.' },
  30:  { emoji: '👑', title: '한 달 연속! 대단해요', sub: '30일이면 습관이 완성됩니다.\n이제 당신의 일상이 되었어요.' },
  50:  { emoji: '💎', title: '50일 돌파!', sub: '상위 5%의 의지력이에요.\n주변 사람들도 변화를 느끼고 있을 거예요.' },
  100: { emoji: '🏆', title: '100일! 전설적이에요', sub: '100일 연속이라니, 정말 대단해요.\n당신은 이미 다른 사람이 되었어요.' },
};

window.openStreakMilestone = function(type, days) {
  const config = MILESTONE_CONFIG[days];
  if (!config) return;

  const typeLabel = type === 'workout' ? '운동' : type === 'diet' ? '식단' : type;
  document.getElementById('milestone-emoji').textContent = config.emoji;
  document.getElementById('milestone-title').textContent = config.title;
  document.getElementById('milestone-subtitle').innerHTML = config.sub.replace(/\n/g, '<br>');
  document.getElementById('milestone-badge').innerHTML = `${config.emoji} ${typeLabel} ${days}일 연속`;

  const modal = document.getElementById('streak-milestone-modal');
  modal.style.display = 'flex';

  // Confetti + Haptic
  if (window._showConfetti) window._showConfetti(3500);
  if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 100]);
};

window.closeStreakMilestone = function(e) {
  if (e && e.target && e.target !== document.getElementById('streak-milestone-modal')) return;
  document.getElementById('streak-milestone-modal').style.display = 'none';
};
