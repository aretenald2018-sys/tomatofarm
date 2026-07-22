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
const FEATURE_LOGIN_SOURCE = readFileSync(new URL('../feature-login.js', import.meta.url), 'utf8');
const PROVISION_SOURCE = readFileSync(
  new URL('../functions/scripts/provision-admin-console-account.js', import.meta.url),
  'utf8',
);
const REPO_SOURCES = [
  '../app.js', '../feature-login.js', '../render-admin.js',
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
  const start = FEATURE_LOGIN_SOURCE.indexOf('async function createAccountFromSignup()');
  assert.notEqual(start, -1, 'createAccountFromSignup should exist');
  const end = FEATURE_LOGIN_SOURCE.indexOf('await saveAccount(account);', start);
  assert.notEqual(end, -1, 'the signup save should follow the guard');
  const signupSource = FEATURE_LOGIN_SOURCE.slice(start, end);

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

  const [, loginSource] = REPO_SOURCES.find(([path]) => path.endsWith('feature-login.js'));
  assert.equal(loginSource.includes('admin_authenticated'), false);
  assert.equal(loginSource.includes('kim_authenticated'), false);
});
