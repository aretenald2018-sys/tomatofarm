import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULES = readFileSync(path.join(repoRoot, 'firestore.rules'), 'utf8');
// 주석은 규칙이 아니다. 금지 패턴을 설명하는 주석이 그 금지에 걸리면 안 된다.
const RULE_STATEMENTS = RULES.replace(/^\s*\/\/.*$/gm, '');
const FIREBASE_JSON = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));

// 앱이 실제로 접근하는 소스만 본다. 생성물(www/, android/)과 개발 도구(tools/)는
// 배포되는 클라이언트가 아니다.
const SCANNED_DIRECTORIES = ['data', 'home', 'admin', 'workout', 'modals', 'utils', 'ai', 'diet', 'app', 'auth', 'social'];
const SCANNED_FILES = [
  'app.js', 'data.js', 'feature-login.js', 'render-admin.js',
  'feature-letters.js', 'feature-diet-setup.js',
];

function collectSourceFiles() {
  const files = [];
  for (const file of SCANNED_FILES) {
    try {
      if (statSync(path.join(repoRoot, file)).isFile()) files.push(path.join(repoRoot, file));
    } catch {}
  }
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  for (const directory of SCANNED_DIRECTORIES) walk(path.join(repoRoot, directory));
  return files;
}

function referencedTopLevelCollections() {
  const found = new Set();
  const pattern = /(?:collection|doc)\(\s*db\s*,\s*'([^']+)'/g;
  for (const file of collectSourceFiles()) {
    const source = readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source)) !== null) found.add(match[1]);
  }
  return found;
}

function ruledTopLevelCollections() {
  const found = new Set();
  const pattern = /match \/([A-Za-z_][A-Za-z0-9_]*)\//g;
  let match;
  while ((match = pattern.exec(RULE_STATEMENTS)) !== null) found.add(match[1]);
  return found;
}

test('firebase.json declares the tracked ruleset', () => {
  assert.equal(FIREBASE_JSON.firestore?.rules, 'firestore.rules');
});

test('the ruleset has no permissive catch-all', () => {
  // Firestore 규칙은 OR 로 합쳐진다. 허용형 catch-all 이 하나라도 있으면 아래의
  // 관리자 계정/레지스트리 금지가 통째로 무효가 된다.
  const catchAll = /match\s+\/\{[A-Za-z_][A-Za-z0-9_]*=\*\*\}\s*\{[^}]*allow[^}]*if\s+true/;
  assert.equal(
    catchAll.test(RULE_STATEMENTS),
    false,
    'a permissive catch-all would defeat every deny rule',
  );
});

test('the admin console account cannot be written by a client', () => {
  const block = RULES.match(/match \/_accounts\/\{accountId\} \{[\s\S]*?\n {4}\}/);
  assert.notEqual(block, null, '_accounts should have an explicit rule');
  assert.match(block[0], /allow write: if accountId != '관_리자';/);
});

test('the shared owner registry is server-decided and client-read-only', () => {
  const block = RULES.match(/match \/_account_data_owners\/\{documentId\} \{[\s\S]*?\n {4}\}/);
  assert.notEqual(block, null, '_account_data_owners should have an explicit rule');
  assert.match(block[0], /allow read: if true;/);
  assert.match(block[0], /allow write: if false;/);
});

test('the legacy migration marker cannot be rolled back or deleted', () => {
  const block = RULES.match(/match \/_account_data_migrations\/\{documentId\} \{[\s\S]*?\n {4}\}/);
  assert.notEqual(block, null, '_account_data_migrations should have an explicit rule');
  assert.match(block[0], /request\.resource\.data\.version >= resource\.data\.version/);
  assert.match(block[0], /allow delete: if false;/);
});

test('every collection the client touches has an explicit rule', () => {
  // 규칙에 없는 컬렉션은 배포 순간 접근이 막힌다. 새 컬렉션을 쓰기 시작하면
  // 이 테스트가 먼저 잡는다.
  const referenced = referencedTopLevelCollections();
  const ruled = ruledTopLevelCollections();
  const missing = [...referenced].filter((name) => !ruled.has(name)).sort();
  assert.deepEqual(missing, [], `firestore.rules is missing: ${missing.join(', ')}`);
});

test('the ruleset carries its unreconciled warning until it is deployed', () => {
  // 라이브 콘솔 규칙과 대조하기 전에는 배포하면 안 된다. 경고를 지우는 커밋이
  // 곧 "대조 끝났다"는 선언이 되도록 테스트로 묶어 둔다.
  assert.match(RULES, /라이브 콘솔 규칙과 대조되지 않았다/);
  assert.match(RULES, /docs\/reference\/FIRESTORE_RULES\.md/);
});
