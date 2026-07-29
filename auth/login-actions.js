// ================================================================
// auth/login-actions.js — data-login-* 액션 브리지
// ================================================================
// 로그인 화면, 비밀번호 모달, 길드 온보딩 오버레이, 동적 모달, 길드 모달의
// 선언적 액션을 하나의 캡처 단계 리스너로 라우팅한다.
// ================================================================

import { openFriendProfile } from '../home/friend-profile.js';
import {
  closePasswordModal,
  confirmLogout,
  createAccountAndLogin,
  openNicknameEdit,
  verifyAndLogin,
} from './login-screen.js';
import {
  createAccountFromSignup,
  showLoginView,
  showSignupView,
  toggleSignupGuild,
  toggleSignupPw,
} from './signup.js';
import {
  addGuildChipFor,
  removeGuildChip,
  searchGuildsFor,
  selectGuildFor,
} from '../social/guild-picker.js';
import {
  addGuildFromModal,
  closeGuildModal,
  createGuildFromModal,
  kickMember,
  leaderLeaveGuild,
  leaveGuildFromMembers,
  removeGuildFromModal,
  searchGuildsForModal,
  selectGuildForModal,
  selectGuildIcon,
  toggleGuildIconPicker,
  toggleGuildMembers,
  toggleGuildPrimary,
  transferAndLeave,
  transferLeadership,
  uploadGuildPhoto,
} from '../social/guild-modal.js';
import {
  renderLetterStatusList,
  sendLetter,
} from '../feature-letters.js';

export function _loginActionTarget(eventTarget, selector) {
  const target = eventTarget instanceof Element ? eventTarget : eventTarget?.parentElement;
  return target?.closest?.(selector) || null;
}

export function _isLoginBridgeScope(control) {
  return !!control?.closest?.('#login-screen, #login-pw-modal, #guild-onboarding-overlay, #dynamic-modal, #guild-modal');
}

export function _loginGuildPrefix(control) {
  return control?.dataset?.loginGuildPrefix || 'signup';
}

export function _runLoginAction(action, control, event = null) {
  let result;
  switch (action) {
    case 'create-account-login':
      result = createAccountAndLogin();
      break;
    case 'show-signup-view':
      result = showSignupView();
      break;
    case 'show-login-view':
      result = showLoginView();
      break;
    case 'toggle-signup-guild':
      result = toggleSignupGuild();
      break;
    case 'toggle-signup-pw':
      result = toggleSignupPw();
      break;
    case 'create-account-signup':
      result = createAccountFromSignup();
      break;
    case 'close-password-modal':
      result = closePasswordModal();
      break;
    case 'verify-and-login':
      result = verifyAndLogin();
      break;
    case 'search-guilds':
      result = searchGuildsFor(_loginGuildPrefix(control));
      break;
    case 'add-guild-chip':
      result = addGuildChipFor(_loginGuildPrefix(control));
      break;
    case 'select-guild':
      result = selectGuildFor(_loginGuildPrefix(control), control.dataset.guildName || '');
      break;
    case 'remove-guild-chip':
      result = removeGuildChip(control.dataset.guildName || '', control.dataset.containerId || '');
      break;
    case 'close-dynamic-modal':
      if (!event || event.target === control) document.getElementById('dynamic-modal')?.remove();
      break;
    case 'open-nickname-edit':
      result = openNicknameEdit();
      break;
    case 'open-own-profile':
      document.getElementById('dynamic-modal')?.remove();
      result = openFriendProfile(control.dataset.userId || '', control.dataset.userName || '');
      break;
    case 'confirm-logout':
      result = confirmLogout();
      break;
    case 'toggle-guild-primary':
      result = toggleGuildPrimary(control.dataset.guildName || '');
      break;
    case 'toggle-guild-members':
      result = toggleGuildMembers(control.dataset.guildName || '');
      break;
    case 'toggle-guild-icon-picker':
      result = toggleGuildIconPicker(control.dataset.guildName || '');
      break;
    case 'remove-guild':
      result = removeGuildFromModal(control.dataset.guildName || '');
      break;
    case 'transfer-leadership':
      result = transferLeadership(control.dataset.guildName || '', control.dataset.targetId || '', control.dataset.targetName || '');
      break;
    case 'kick-member':
      result = kickMember(control.dataset.guildName || '', control.dataset.targetId || '', control.dataset.targetName || '');
      break;
    case 'leave-guild':
      result = leaveGuildFromMembers(control.dataset.guildName || '');
      break;
    case 'leader-leave-guild':
      result = leaderLeaveGuild(control.dataset.guildName || '');
      break;
    case 'transfer-and-leave':
      result = transferAndLeave(control.dataset.guildName || '', control.dataset.targetId || '', control.dataset.targetName || '');
      break;
    case 'select-guild-icon':
      result = selectGuildIcon(control.dataset.guildName || '', control.dataset.icon || '');
      break;
    case 'close-guild-modal':
      result = closeGuildModal(control);
      break;
    case 'create-guild-modal':
      result = createGuildFromModal();
      break;
    case 'add-guild-modal':
      result = addGuildFromModal();
      break;
    case 'select-guild-modal':
      result = selectGuildForModal(control.dataset.guildName || '');
      break;
    case 'search-guilds-modal':
      result = searchGuildsForModal(control.value || '');
      break;
    case 'send-letter':
      result = sendLetter();
      break;
    case 'refresh-letter-status':
      result = renderLetterStatusList();
      break;
    default:
      return;
  }
  if (result && typeof result.catch === 'function') {
    result.catch((err) => console.error('[login-action]', err));
  }
}

export function _bindLoginActions(root = document) {
  const doc = root.ownerDocument || root;
  if (doc.documentElement.dataset.loginActionsBound === '1') return;
  doc.documentElement.dataset.loginActionsBound = '1';

  doc.addEventListener('click', (event) => {
    const control = _loginActionTarget(event.target, '[data-login-action]');
    if (!control || !_isLoginBridgeScope(control)) return;
    event.preventDefault();
    event.stopPropagation();
    _runLoginAction(control.dataset.loginAction, control, event);
  }, true);

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const control = _loginActionTarget(event.target, '[data-login-enter-action]');
    if (!control || !_isLoginBridgeScope(control)) return;
    event.preventDefault();
    _runLoginAction(control.dataset.loginEnterAction, control, event);
  }, true);

  doc.addEventListener('input', (event) => {
    const control = _loginActionTarget(event.target, '[data-login-input-action]');
    if (!control || !_isLoginBridgeScope(control)) return;
    _runLoginAction(control.dataset.loginInputAction, control, event);
  }, true);

  doc.addEventListener('focusin', (event) => {
    const control = _loginActionTarget(event.target, '[data-login-focus-action]');
    if (!control || !_isLoginBridgeScope(control)) return;
    _runLoginAction(control.dataset.loginFocusAction, control, event);
  }, true);

  doc.addEventListener('change', (event) => {
    const control = _loginActionTarget(event.target, '[data-login-change-action]');
    if (!control || !_isLoginBridgeScope(control)) return;
    if (control.dataset.loginChangeAction === 'upload-guild-photo') {
      void uploadGuildPhoto(control.dataset.guildName || '', control);
    }
  }, true);
}

// 모드 선택 라디오 하이라이트
document.addEventListener('change', (e) => {
  if (e.target.name !== 'login-mode') return;
  document.querySelectorAll('#login-mode-section label').forEach(lbl => {
    const radio = lbl.querySelector('input[type="radio"]');
    lbl.style.borderColor = radio.checked ? 'var(--primary)' : 'transparent';
  });
});
