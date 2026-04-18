// ================================================================
// home/streak-warning.js — 스트릭 경고 배너 (21시 이후)
//   - 조건: 21시 이후 & 오늘 아무 기록 없음 & 오늘 ack 안 했음
//   - 위치: tab-home .home-section 최상단
//   - ack: _settings.streak_warning_ack_date (Firebase, CLAUDE.md 규칙)
// ================================================================

import {
  TODAY, dateKey, getMuscles, getCF, getDay,
  getStreakWarningAck, saveStreakWarningAck,
} from '../data.js';

const BANNER_ID = 'streak-warning-banner';
const CUTOFF_HOUR = 21; // 21시 이후

export function renderStreakWarning() {
  const host = document.querySelector('#tab-home .home-section');
  if (!host) return;

  // 이미 있는 배너 제거 (재렌더 대비)
  document.getElementById(BANNER_ID)?.remove();

  if (!_shouldShow()) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'tds-streak-warning';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <span class="tds-streak-warning-icon">⏰</span>
    <div class="tds-streak-warning-body">
      <strong>오늘 기록이 없어요</strong>
      <span>자정 전에 한 끼 or 운동을 기록하면 스트릭이 유지돼요</span>
    </div>
    <button type="button" class="tds-streak-warning-close" aria-label="닫기">✕</button>
  `;

  host.prepend(banner);

  banner.querySelector('.tds-streak-warning-close').addEventListener('click', async () => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 200);
    try {
      await saveStreakWarningAck(_todayKey());
    } catch (e) {
      console.warn('[streak-warning] ack 저장 실패:', e);
    }
  });
}

// ── 조건 체크 ─────────────────────────────────────────────────
function _shouldShow() {
  const now = new Date();
  if (now.getHours() < CUTOFF_HOUR) return false;

  // 오늘 ack 했으면 숨김
  if (getStreakWarningAck() === _todayKey()) return false;

  // 오늘 기록 존재하면 숨김
  const y = TODAY.getFullYear();
  const m = TODAY.getMonth();
  const d = TODAY.getDate();
  const muscles = getMuscles(y, m, d);
  const day = getDay(y, m, d) || {};
  const hasWorkout = muscles.length > 0 || getCF(y, m, d)
    || !!day.stretching || !!day.swimming || !!day.running;
  const hasMeal = !!(day.breakfast || day.lunch || day.dinner || day.snack)
    || (day.bKcal || 0) > 0 || (day.lKcal || 0) > 0
    || (day.dKcal || 0) > 0 || (day.sKcal || 0) > 0
    || !!day.breakfast_skipped || !!day.lunch_skipped || !!day.dinner_skipped;
  return !hasWorkout && !hasMeal;
}

function _todayKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}
