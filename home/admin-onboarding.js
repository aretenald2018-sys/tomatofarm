// ================================================================
// home/admin-onboarding.js — 관리자 모드 1회성 안내 배너
//   - 조건: isAdmin() && !getAdminOnboardingAck()
//   - ack: _settings.ui_admin_onboarding_ack (Firebase, CLAUDE.md 멀티유저 규칙)
//   - 위치: tab-home .home-section 최상단 (스트릭 경고 위)
// ================================================================

import { isAdmin, getAdminOnboardingAck, saveAdminOnboardingAck } from '../data.js';

const BANNER_ID = 'admin-onboarding-banner';

export function renderAdminOnboarding() {
  const host = document.querySelector('#tab-home .home-section');
  if (!host) return;

  document.getElementById(BANNER_ID)?.remove();

  if (!isAdmin()) return;
  if (getAdminOnboardingAck()) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.className = 'tds-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = `
    <span class="tds-banner-icon">🔒</span>
    <div class="tds-banner-body">
      <strong>관리자 모드로 로그인했어요</strong>
      <span>일반 탭(홈·운동·통계)은 숨겨지고, 관리 탭만 보여요.\n이 안내는 한 번만 표시돼요.</span>
    </div>
    <button type="button" class="tds-banner-close" aria-label="확인">확인</button>
  `;

  host.prepend(banner);

  banner.querySelector('.tds-banner-close').addEventListener('click', async () => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 200);
    try {
      await saveAdminOnboardingAck();
    } catch (e) {
      console.warn('[admin-onboarding] ack 저장 실패:', e);
    }
  });
}
