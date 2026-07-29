import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} should exist`);
  const end = source.indexOf(endToken, start);
  assert.notEqual(end, -1, `${endToken} should exist after ${startToken}`);
  return source.slice(start, end);
}

const indexHtml = read('index.html');
const featureLoginJs = read('feature-login.js');
const loginActionsJs = read('auth/login-actions.js');
const loginScreenJs = read('auth/login-screen.js');
const signupJs = read('auth/signup.js');
const appJs = read('app.js');
const swJs = read('sw.js') + read('runtime-assets.js');
const welcomeBackJs = read('home/welcome-back.js');

test('login screen markup uses data-login actions instead of inline handlers', () => {
  const loginMarkup = sliceBetween(indexHtml, '<!-- 로그인 화면 -->', '<!-- 알림센터 패널 -->');

  assert.match(loginMarkup, /id="login-password"[^>]*data-login-enter-action="create-account-login"/);
  assert.match(loginMarkup, /id="login-create-btn"[^>]*data-login-action="create-account-login"/);
  assert.match(loginMarkup, /class="login-signup-link"[^>]*data-login-action="show-signup-view"/);
  assert.match(loginMarkup, /class="signup-toggle-row"[^>]*data-login-action="toggle-signup-guild"/);
  assert.match(loginMarkup, /id="signup-guild-input"[^>]*data-login-input-action="search-guilds"[^>]*data-login-focus-action="search-guilds"[^>]*data-login-enter-action="add-guild-chip"/);
  assert.match(loginMarkup, /class="signup-toggle-row"[^>]*data-login-action="toggle-signup-pw"/);
  assert.match(loginMarkup, /class="login-btn signup-submit-btn"[^>]*data-login-action="create-account-signup"/);
  assert.match(loginMarkup, /class="signup-login-link"[^>]*data-login-action="show-login-view"/);
  assert.match(loginMarkup, /id="login-pw-modal-input"[^>]*data-login-enter-action="verify-and-login"/);
  assert.match(loginMarkup, /class="login-btn login-pw-cancel[^"]*"[^>]*data-login-action="close-password-modal"/);
  assert.match(loginMarkup, /class="login-btn u-flex-2"[^>]*data-login-action="verify-and-login"/);

  assert.doesNotMatch(loginMarkup, /\sonclick="/);
  assert.doesNotMatch(loginMarkup, /\sonkeydown="/);
  assert.doesNotMatch(loginMarkup, /\soninput="/);
  assert.doesNotMatch(loginMarkup, /\sonfocus="/);
});

test('feature-login binds login actions with a scoped idempotent bridge', () => {
  assert.match(loginActionsJs, /function _bindLoginActions\(root = document\)/);
  assert.match(loginActionsJs, /doc\.documentElement\.dataset\.loginActionsBound === '1'/);
  assert.match(loginActionsJs, /return !!control\?\.closest\?\.\('#login-screen, #login-pw-modal, #guild-onboarding-overlay, #dynamic-modal, #guild-modal'\)/);
  assert.match(loginActionsJs, /doc\.addEventListener\('click', \(event\) => \{[\s\S]*\[data-login-action\][\s\S]*_runLoginAction\(control\.dataset\.loginAction, control, event\)[\s\S]*\}, true\)/);
  assert.match(loginActionsJs, /doc\.addEventListener\('keydown', \(event\) => \{[\s\S]*\[data-login-enter-action\][\s\S]*event\.preventDefault\(\)[\s\S]*_runLoginAction\(control\.dataset\.loginEnterAction, control, event\)[\s\S]*\}, true\)/);
  assert.match(loginActionsJs, /doc\.addEventListener\('input', \(event\) => \{[\s\S]*\[data-login-input-action\][\s\S]*_runLoginAction\(control\.dataset\.loginInputAction, control, event\)[\s\S]*\}, true\)/);
  assert.match(loginActionsJs, /doc\.addEventListener\('focusin', \(event\) => \{[\s\S]*\[data-login-focus-action\][\s\S]*_runLoginAction\(control\.dataset\.loginFocusAction, control, event\)[\s\S]*\}, true\)/);
  assert.match(loginActionsJs, /case 'create-account-login':[\s\S]*createAccountAndLogin\(\)/);
  assert.match(loginActionsJs, /case 'create-account-signup':[\s\S]*createAccountFromSignup\(\)/);
  assert.match(loginActionsJs, /case 'verify-and-login':[\s\S]*verifyAndLogin\(\)/);
  assert.match(loginActionsJs, /case 'search-guilds':[\s\S]*searchGuildsFor\(_loginGuildPrefix\(control\)\)/);
  assert.match(loginActionsJs, /case 'add-guild-chip':[\s\S]*addGuildChipFor\(_loginGuildPrefix\(control\)\)/);
  assert.match(featureLoginJs, /document\.addEventListener\('DOMContentLoaded', \(\) => \{[\s\S]*_bindLoginActions\(\);[\s\S]*initLoginScreen\(\);[\s\S]*\}\)/);
});

test('login restore skips guild onboarding when a running draft can resume', () => {
  assert.match(loginScreenJs, /function _hasRestorableRunningDraftForUser\(user\)/);
  assert.match(loginScreenJs, /tomatofarm_running_session_draft_active/);
  assert.match(loginScreenJs, /if \(!localStorage\.getItem\(guildObKey\) && !_hasRestorableRunningDraftForUser\(saved\)\)/);
});

test('APK login reboots the in-page user session without a WebView reload', () => {
  assert.match(loginScreenJs, /function _continueToAppAfterLogin\(\)/);
  assert.match(loginScreenJs, /new CustomEvent\('app:start-user-session', \{ detail: \{ resolve \} \}\)/);
  assert.match(appJs, /document\.addEventListener\('app:start-user-session'/);
  assert.match(loginScreenJs, /function _runDeferredLoginMaintenance\(\)/);
  assert.match(loginScreenJs, /LOGIN_SESSION_RESTORE_TIMEOUT_MS = 1800/);
  assert.match(loginScreenJs, /restoreUserFromBackup\(\),[\s\S]*LOGIN_SESSION_RESTORE_TIMEOUT_MS/);

  for (const [source, start, end] of [
    [loginScreenJs, 'async function selectAccount', 'async function verifyAndLogin'],
    [loginScreenJs, 'async function verifyAndLogin', 'function closePasswordModal'],
    [signupJs, 'async function createAccountFromSignup', 'function toggleSignupGuild'],
    [loginScreenJs, 'async function createAccountAndLogin', 'async function logoutAccount'],
  ]) {
    const loginPath = sliceBetween(source, start, end);
    assert.match(loginPath, /return _continueToAppAfterLogin\(\);/);
    assert.doesNotMatch(loginPath, /location\.reload\(\)/);
  }

  assert.match(appJs, /function startTomatoUserSession\(\) \{[\s\S]*return init\(\);[\s\S]*\}/);
  assert.doesNotMatch(appJs, /__startTomatoUserSession:\s*startTomatoUserSession/);
  assert.match(appJs, /await _withTimeout\(loadAndInjectModals\(\), 3000, 'login modal load'\);/);
});

test('APK login does not wait for optional welcome data before showing the app shell', () => {
  assert.match(appJs, /const APP_BOOT_AUXILIARY_TIMEOUT_MS = 2500;/);
  assert.match(appJs, /async function _showPostLoginExperience\(/);
  assert.match(appJs, /void _showPostLoginExperience\(\{ previousLastLoginAt, runningSessionRestored \}\)/);
  assert.match(appJs, /await _withTimeout\(\s*showWelcomeBackPopup\(hoursSinceLogin, \{ onStartWorkout: \(\) => switchTab\('workout'\) \}\),[\s\S]*APP_BOOT_AUXILIARY_TIMEOUT_MS,[\s\S]*'welcome back data'/);
  assert.match(appJs, /await _withTimeout\(switchTab\('admin'\), APP_BOOT_AUXILIARY_TIMEOUT_MS, 'admin tab render'\);/);
  assert.match(welcomeBackJs, /const WELCOME_BACK_DATA_TIMEOUT_MS = 2500;/);
  assert.match(welcomeBackJs, /_withWelcomeDataTimeout\(getMyNotifications\(\), \[\], 'notifications'\)/);
  assert.match(welcomeBackJs, /_withWelcomeDataTimeout\(getGlobalGuildWeeklyRanking\(\), null, 'guild ranking'\)/);
});

test('service worker cache version was bumped for APK login handoff assets', () => {
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
