// ================================================================
// feature-login.js — 로그인/가입/잠금/길드 온보딩 진입점
// ================================================================
// 구현은 auth/, social/, feature-letters.js, feature-diet-setup.js 가
// 소유한다. 이 파일은 부팅 시 액션 브리지를 붙이고 기존 임포터가 쓰는
// 공개 이름만 다시 내보낸다.
// ================================================================

import { initLoginScreen } from './auth/login-screen.js';
import { _bindLoginActions } from './auth/login-actions.js';

export {
  logoutAccount,
  signOutToLoginScreen,
} from './auth/login-screen.js';
export { openGuildModal } from './social/guild-modal.js';
export { openLetterModal } from './feature-letters.js';
export { submitDietSetup } from './feature-diet-setup.js';

// 페이지 로드 시 로그인 초기화
document.addEventListener('DOMContentLoaded', () => {
  _bindLoginActions();
  initLoginScreen();
});

// 밝은 모드 고정 (앱은 라이트 테마 전용, :root.light 규칙을 활성화)
(function() {
  document.documentElement.classList.add('light');
})();
