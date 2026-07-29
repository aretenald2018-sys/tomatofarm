// ================================================================
// auth/signup.js — 가입 뷰 전환 / 계정 생성 / 가입 토글
// ================================================================

import { showToast } from '../ui/toast.js';
import { isAdminConsoleAccount } from '../data/account-unification.js';
import { _continueToAppAfterLogin, _normalizeLoginId } from './login-screen.js';
import {
  _loadAllGuilds,
  guildPickerState,
  searchGuildsFor,
} from '../social/guild-picker.js';

// ── 로그인/가입 뷰 전환 ─────────────────────────────────────────
export function showSignupView() {
  guildPickerState.selectedGuilds = [];
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('signup-view').style.display = '';
  document.getElementById('signup-last-name')?.focus();
}
export function showLoginView() {
  guildPickerState.selectedGuilds = [];
  document.getElementById('signup-view').style.display = 'none';
  document.getElementById('login-view').style.display = '';
  document.getElementById('login-last-name')?.focus();
}

// ── 가입 전용 함수 ─────────────────────────────────────────────
export async function createAccountFromSignup() {
  const lastName = document.getElementById('signup-last-name').value.trim();
  const firstName = document.getElementById('signup-first-name').value.trim();
  if (!lastName || !firstName) { showToast('성과 이름을 입력해주세요', 2500, 'warning'); return; }

  const { saveAccount, setCurrentUser, hashPassword, getAccountListIncludingAdminConsole } = await import('../data.js');

  const newId = _normalizeLoginId(lastName, firstName);

  // 관리자 콘솔 계정은 서버 스크립트로만 만든다. 가입 화면에서 선점할 수 있으면
  // 아무나 관리자가 된다.
  if (isAdminConsoleAccount(newId)) {
    document.getElementById('signup-status').innerHTML = '<span style="color:#ef4444;">사용할 수 없는 이름이에요.</span>';
    return;
  }

  const existing = await getAccountListIncludingAdminConsole();
  const found = existing.find(a => a.id === newId);
  if (found) {
    document.getElementById('signup-status').innerHTML = '<span style="color:#ef4444;">이미 존재하는 계정이에요. 로그인해주세요.</span>';
    return;
  }

  const nickname = document.getElementById('signup-nickname')?.value.trim() || '';
  if (!nickname) {
    document.getElementById('signup-status').innerHTML = '<span style="color:#ef4444;">별명을 입력해주세요.</span>';
    document.getElementById('signup-nickname')?.focus();
    return;
  }

  const usePw = document.getElementById('signup-pw-toggle')?.classList.contains('on');
  const pw = document.getElementById('signup-new-password')?.value || '';

  // 길드 처리
  const { createGuild, createGuildJoinRequest } = await import('../data.js');
  const guilds = [];
  const pendingGuilds = [];

  for (const g of guildPickerState.selectedGuilds) {
    if (g.isNew) {
      await createGuild(g.name, newId);
      guilds.push(g.name);
    } else {
      pendingGuilds.push(g.name);
    }
  }

  const primaryGuild = guilds.length > 0 ? guilds[0] : null;

  const account = {
    id: newId, lastName, firstName,
    nickname,
    hasPassword: usePw && pw.length > 0,
    passwordHash: usePw && pw.length > 0 ? hashPassword(pw) : null,
    createdAt: Date.now(),
    guilds, pendingGuilds, primaryGuild,
  };

  await saveAccount(account);

  // 길드 가입 요청 + 온보딩 플래그 설정
  for (const gName of pendingGuilds) {
    await createGuildJoinRequest(gName, gName, newId, nickname);
  }
  if (guilds.length > 0 || pendingGuilds.length > 0) {
    localStorage.setItem('guild_onboarding_v1_' + newId, 'done');
  }

  setCurrentUser(account);
  const { recordLogin: rl } = await import('../data.js');
  rl();
  return _continueToAppAfterLogin();
}

// ── 가입 토글 (TDS Switch) ───────────────────────────────────────
export function toggleSignupGuild() {
  const sw = document.getElementById('signup-guild-toggle');
  const field = document.getElementById('signup-guild-field');
  if (!sw || !field) return;
  const on = sw.classList.toggle('on');
  sw.setAttribute('aria-checked', on);
  field.style.display = on ? 'block' : 'none';
  if (on) {
    // 드롭다운 자동 노출 (기존 길드 리스트)
    const inp = document.getElementById('signup-guild-input');
    if (inp) inp.focus();
    _loadAllGuilds().then(() => searchGuildsFor('signup'));
  }
}
export function toggleSignupPw() {
  const sw = document.getElementById('signup-pw-toggle');
  const field = document.getElementById('signup-pw-field');
  if (!sw || !field) return;
  const on = sw.classList.toggle('on');
  sw.setAttribute('aria-checked', on);
  field.style.display = on ? 'block' : 'none';
  if (on) document.getElementById('signup-new-password')?.focus();
}
