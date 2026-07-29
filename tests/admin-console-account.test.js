import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ADMIN_CONSOLE_ACCOUNT_ID,
  PERSONAL_ACCOUNT_ID,
  PERSONAL_LEGACY_ALIAS_ID,
  canonicalAccountOwnerId,
  isAdminConsoleAccount,
  isPersonalSharedAccount,
  resolveAccountDataOwnerId,
} from '../data/account-unification.js';
const SIGNUP_SOURCE = readFileSync(new URL('../auth/signup.js', import.meta.url), 'utf8');
const PROVISION_SOURCE = readFileSync(
  new URL('../functions/scripts/provision-admin-console-account.js', import.meta.url),
  'utf8',
);
const REPO_SOURCES = [
  '../app.js', '../feature-login.js', '../render-admin.js',
  '../auth/login-screen.js', '../auth/login-actions.js', '../auth/signup.js',
  '../social/guild-modal.js', '../social/guild-picker.js',
  '../feature-letters.js', '../feature-diet-setup.js',
  '../data/data-core.js', '../data/data-auth.js', '../data/data-api.js',
  '../data/data-account.js', '../data/data-load.js', '../data/data-social-friends.js',
  '../data/shared-account-owner.js', '../home/friend-feed.js', '../home/friend-profile.js',
  '../home/utils.js', '../admin/admin-actions.js',
].map((path) => [path, readFileSync(new URL(path, import.meta.url), 'utf8')]);

test('the admin console account is a separate identity from the personal account', () => {
  assert.equal(ADMIN_CONSOLE_ACCOUNT_ID, '관_리자');
  assert.equal(PERSONAL_ACCOUNT_ID, '김_태우');
  assert.notEqual(ADMIN_CONSOLE_ACCOUNT_ID, PERSONAL_ACCOUNT_ID);

  assert.equal(isAdminConsoleAccount(ADMIN_CONSOLE_ACCOUNT_ID), true);
  assert.equal(isAdminConsoleAccount(PERSONAL_ACCOUNT_ID), false);
  assert.equal(isAdminConsoleAccount(PERSONAL_LEGACY_ALIAS_ID), false);

  assert.equal(isPersonalSharedAccount(ADMIN_CONSOLE_ACCOUNT_ID), false);
  assert.equal(isPersonalSharedAccount(PERSONAL_ACCOUNT_ID), true);
  assert.equal(isPersonalSharedAccount(PERSONAL_LEGACY_ALIAS_ID), true);
});

test('the admin console account never borrows the personal data namespace', () => {
  // 개인 계정만 owner registry 를 거쳐 물리 네임스페이스가 결정된다. 관리자
  // 콘솔 계정이 그 결정에 얹히면 두 개의 쓰기 가능한 SSOT 가 다시 생긴다.
  assert.equal(canonicalAccountOwnerId(ADMIN_CONSOLE_ACCOUNT_ID), ADMIN_CONSOLE_ACCOUNT_ID);
  assert.equal(
    resolveAccountDataOwnerId(ADMIN_CONSOLE_ACCOUNT_ID, PERSONAL_ACCOUNT_ID),
    ADMIN_CONSOLE_ACCOUNT_ID,
  );
  assert.equal(resolveAccountDataOwnerId(ADMIN_CONSOLE_ACCOUNT_ID, null), ADMIN_CONSOLE_ACCOUNT_ID);
});

test('the signup screen refuses to create the admin console account', () => {
  const start = SIGNUP_SOURCE.indexOf('async function createAccountFromSignup()');
  assert.notEqual(start, -1, 'createAccountFromSignup should exist');
  const end = SIGNUP_SOURCE.indexOf('await saveAccount(account);', start);
  assert.notEqual(end, -1, 'the signup save should follow the guard');
  const signupSource = SIGNUP_SOURCE.slice(start, end);

  const guardIndex = signupSource.indexOf('isAdminConsoleAccount(newId)');
  assert.notEqual(guardIndex, -1, 'signup must reject the admin console id');
  const returnAfterGuard = signupSource.indexOf('return;', guardIndex);
  assert.notEqual(returnAfterGuard, -1, 'the guard must return before any write');
});

test('the provisioning script hashes passwords exactly like the client verifier', () => {
  // data-auth.js 를 import 하면 data-core.js 를 통해 Firebase CDN 까지 끌려온다.
  // 두 해시 함수의 소스만 떼어내서 비교한다.
  const [, authSource] = REPO_SOURCES.find(([path]) => path.endsWith('data-auth.js'));
  const clientHashSource = authSource.match(/export function _simpleHash\(str\) \{[\s\S]*?\n\}/);
  assert.notEqual(clientHashSource, null, 'data-auth should define _simpleHash');
  const clientHash = new Function(
    clientHashSource[0].replace('export ', '') + '\nreturn _simpleHash;',
  )();

  const scriptHashSource = PROVISION_SOURCE.match(/function simpleHash\(value\) \{[\s\S]*?\n\}/);
  assert.notEqual(scriptHashSource, null, 'provisioning script should define simpleHash');
  const scriptHash = new Function(scriptHashSource[0] + '\nreturn simpleHash;')();

  for (const password of ['kimtw100', '한글비밀번호123', 'a-very-long-admin-password!', '']) {
    assert.equal(
      scriptHash(password),
      clientHash(password),
      `hash drift for ${JSON.stringify(password)} would lock the admin out`,
    );
  }
});

test('a stored admin hash is never accepted as the literal password', () => {
  // verifyPassword 는 해시 이전 계정을 위해 평문 대조 폴백을 갖고 있다. 그래서
  // 저장된 값 자체가 유효한 비밀번호가 된다. 관리자 콘솔 계정에서 이게 살아
  // 있으면 passwordHash 오기입 하나가 곧 알려진 비밀번호가 된다.
  const [, authSource] = REPO_SOURCES.find(([path]) => path.endsWith('data-auth.js'));
  const verifySource = authSource.slice(
    authSource.indexOf('export function verifyPassword(account, input)'),
  );
  const adminGuard = verifySource.indexOf('if (isAdminConsoleAccount(account?.id)) return false;');
  const plaintextFallback = verifySource.indexOf('storedHash === rawInput');
  assert.notEqual(adminGuard, -1, 'the admin console account must skip the plaintext fallback');
  assert.notEqual(plaintextFallback, -1, 'the plaintext fallback should still exist for legacy accounts');
  assert.ok(
    adminGuard < plaintextFallback,
    'the admin guard must come before the plaintext fallback, or it does nothing',
  );
});

test('the console-document mode returns before touching Firestore', () => {
  // 자격증명 없이 쓰는 경로다. 이 분기가 initializeAdminApp() 뒤로 밀리면
  // 자격증명이 없는 사람에게는 쓸 수 없는 기능이 된다.
  const printIndex = PROVISION_SOURCE.indexOf('args.has("--print-document")');
  const initIndex = PROVISION_SOURCE.indexOf('initializeAdminApp(argv)');
  assert.notEqual(printIndex, -1, 'a --print-document branch should exist');
  assert.notEqual(initIndex, -1, 'the admin app should still be initialized for the write path');
  assert.ok(printIndex < initIndex, '--print-document must return before any credential is required');
});

test('the printed document carries every field the login path reads', () => {
  const block = PROVISION_SOURCE.match(/function printConsoleDocument\(password\) \{[\s\S]*?\n\}/);
  assert.notEqual(block, null, 'printConsoleDocument should exist');
  // 이 중 하나라도 빠지면 콘솔로 만든 계정이 로그인되지 않거나 이름이 깨진다.
  for (const field of ['id', 'lastName', 'firstName', 'nickname', 'hasPassword', 'passwordHash']) {
    assert.match(block[0], new RegExp(`"${field}"`), `printed document should include ${field}`);
  }
  assert.match(block[0], /simpleHash\(password\)/, 'the hash must come from the shared function');
});

test('the provisioning script refuses weak passwords and never writes on a dry run', () => {
  assert.match(PROVISION_SOURCE, /MIN_PASSWORD_LENGTH = 10/);
  assert.match(PROVISION_SOURCE, /refusing a password shorter than/);
  const dryRunIndex = PROVISION_SOURCE.indexOf('if (!commit) {');
  const writeIndex = PROVISION_SOURCE.indexOf('await accountRef.set(');
  assert.notEqual(dryRunIndex, -1, 'a dry-run branch should exist');
  assert.notEqual(writeIndex, -1, 'a commit write should exist');
  assert.ok(dryRunIndex < writeIndex, 'the dry-run branch must return before the write');
});

test('no runtime source still branches on the retired admin/guest mode', () => {
  // 이 테스트가 이 리팩터의 방벽이다. 예전 이름이 하나라도 되살아나면 모드
  // 토글이 조용히 돌아온 것이다.
  const retired = [
    'kimMode', 'getKimMode', 'setKimMode', 'switchKimMode',
    'isAdminGuest', 'getAdminGuestId', 'isAdminInstance',
    'backupAdminAuth', 'clearAdminAuth', 'backupKimAuth', 'clearKimAuth',
    'ADMIN_GUEST_ACCOUNT_ID', 'isSharedAdminAccount',
  ];
  for (const [path, source] of REPO_SOURCES) {
    for (const token of retired) {
      assert.equal(
        source.includes(token),
        false,
        `${path} still references the retired ${token}`,
      );
    }
  }
});

test('the legacy unlock flags survive only as keys to be cleared', () => {
  const [, authSource] = REPO_SOURCES.find(([path]) => path.endsWith('data-auth.js'));
  // 예전 플래그 이름은 "지울 대상" 목록에만 남아야 한다. 읽어서 잠금을 푸는
  // 코드가 남아 있으면 세션 키를 갈아끼운 의미가 없다.
  assert.match(authSource, /LEGACY_SESSION_UNLOCK_KEYS = Object\.freeze\(\['admin_authenticated', 'kim_authenticated'\]\)/);
  assert.equal(authSource.includes("getItem('admin_authenticated')"), false);
  assert.equal(authSource.includes("getItem('kim_authenticated')"), false);

  // 로그인 흐름은 auth/ 와 social/ 로 쪼개져 있다. 한 파일만 보면 옮겨 심은
  // 플래그를 놓친다.
  const loginSurface = REPO_SOURCES.filter(([path]) =>
    path.endsWith('feature-login.js') || path.startsWith('../auth/') || path.startsWith('../social/'));
  assert.ok(loginSurface.length >= 6, 'the split login surface should be scanned');
  for (const [path, loginSource] of loginSurface) {
    assert.equal(loginSource.includes('admin_authenticated'), false, `${path} still reads admin_authenticated`);
    assert.equal(loginSource.includes('kim_authenticated'), false, `${path} still reads kim_authenticated`);
  }
});
