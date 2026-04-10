import { calcStreaks, getCurrentUser, getMyNotifications, getGlobalGuildWeeklyRanking } from '../data.js';

function _localDateKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function _pickMessage(hoursSinceLogin, user, notifications, guildRanking) {
  const daysAway = hoursSinceLogin / 24;
  const unreadCount = notifications.filter((item) => !item.read).length;
  const primaryGuild = user.primaryGuild || (user.guilds || [])[0];
  const guildRank = primaryGuild
    ? (guildRanking?.rankings || []).findIndex((item) => item.guildId === primaryGuild || item.guildName === primaryGuild) + 1
    : 0;
  const fromName = notifications.find((item) => item.fromName)?.fromName || notifications.find((item) => item.userName)?.userName || '이웃';
  const streaks = calcStreaks();
  const mainStreak = Math.max(streaks.workout, streaks.diet);

  if (daysAway < 3) {
    return `${fromName}님도 최근에 기록했어요. 다시 만나서 반가워요.`;
  }
  if (daysAway < 7) {
    return unreadCount > 0
      ? `${fromName}님 관련 알림이 ${unreadCount}개 있어요. 다시 둘러볼까요?`
      : `${fromName}님이 기다리고 있었어요. 다시 만나서 반가워요.`;
  }
  if (mainStreak > 0) {
    return `돌아와서 기록하면 ${mainStreak + 1}일째예요. 다시 흐름을 붙여볼까요?`;
  }
  if (primaryGuild && guildRank > 0) {
    return `새로운 1일차를 시작해볼까요? 지금 ${primaryGuild}은 ${guildRank}위예요.`;
  }
  return '다시 시작하는 것도 대단한 거예요. 오늘 한 줄부터 남겨볼까요?';
}

export async function showWelcomeBackPopup(hoursSinceLogin) {
  const user = getCurrentUser();
  const thresholdHours = Math.max(0, Number(user?.welcomeBackThresholdHours || 24));
  if (!user || thresholdHours <= 0 || hoursSinceLogin < thresholdHours) return;

  const storageKey = `welcome_back_seen_${user.id}_${_localDateKey()}`;
  if (sessionStorage.getItem(storageKey)) return;
  sessionStorage.setItem(storageKey, '1');

  const [notifications, guildRanking] = await Promise.all([
    getMyNotifications(),
    getGlobalGuildWeeklyRanking(),
  ]);
  const unreadCount = notifications.filter((item) => !item.read).length;
  const message = (user.welcomeBackCustomMessage || '').trim() || _pickMessage(hoursSinceLogin, user, notifications, guildRanking);

  document.getElementById('dynamic-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'dynamic-modal';
  modal.innerHTML = `
    <div class="modal-backdrop" style="display:flex;z-index:10000;" onclick="if(event.target===this)document.getElementById('dynamic-modal')?.remove();">
      <div class="modal-sheet" style="max-width:420px;padding:24px;" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:30px;margin-bottom:8px;">🍅</div>
          <div style="font-size:18px;font-weight:800;color:var(--text);">다시 돌아왔네요</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:6px;">${Math.floor(hoursSinceLogin)}시간 만의 복귀</div>
        </div>
        <div style="padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(250,52,44,0.08),rgba(255,138,61,0.12));font-size:14px;line-height:1.7;color:var(--text);">${message}</div>
        <div style="display:flex;gap:8px;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--text-secondary);">
          <span>읽지 않은 알림 ${unreadCount}개</span>
          <span>${user.primaryGuild ? `내 길드 ${user.primaryGuild}` : '길드 미가입'}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:18px;">
          <button class="tds-btn ghost md" style="flex:1;" onclick="document.getElementById('dynamic-modal')?.remove()">나중에</button>
          <button class="tds-btn fill md" style="flex:1;" onclick="document.getElementById('dynamic-modal')?.remove(); window.switchTab && window.switchTab('workout');">오늘 기록하러 가기</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}
