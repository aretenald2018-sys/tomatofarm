import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK = readFileSync(
  path.join(repoRoot, 'docs/reference/SHARED_OWNER_RELEASE_RUNBOOK.md'),
  'utf8',
);
const AUDIT_SCRIPT_PATH = 'functions/scripts/audit-legacy-alias-namespace.js';
const AUDIT_SOURCE = readFileSync(path.join(repoRoot, AUDIT_SCRIPT_PATH), 'utf8');
const FUNCTIONS_PACKAGE = JSON.parse(
  readFileSync(path.join(repoRoot, 'functions/package.json'), 'utf8'),
);

test('the retirement audit is wired as an npm script', () => {
  assert.equal(
    FUNCTIONS_PACKAGE.scripts['audit:legacy-alias'],
    'node scripts/audit-legacy-alias-namespace.js',
  );
});

test('the retirement audit never writes', () => {
  // 판정 스크립트가 무언가를 고치기 시작하면 "읽기 전용이라 안전하다"는 전제가
  // 무너진다. 쓰기 API 가 등장하면 여기서 막는다.
  //
  // Firebase 앱 teardown(`app.delete()`)은 Firestore 쓰기가 아니므로 제외한다.
  const firestoreCalls = AUDIT_SOURCE
    .split('\n')
    .filter((line) => !line.includes('admin.apps'))
    .join('\n');

  for (const writeCall of ['.set(', '.update(', '.delete(', '.create(', 'runTransaction(', '.add(']) {
    assert.equal(
      firestoreCalls.includes(writeCall),
      false,
      `the audit script must stay read-only but calls ${writeCall}`,
    );
  }
});

test('a denied read is never counted as an empty namespace', () => {
  // REST 경로는 보안 규칙을 통과해야 한다. 거부를 0 으로 세면 "비어 있으니
  // 폐기해도 된다"는 판정이 나오고, 그 판정대로 지우면 데이터가 사라진다.
  const restSource = readFileSync(
    path.join(repoRoot, 'functions/scripts/lib/firestore-rest.js'),
    'utf8',
  );
  assert.match(restSource, /status === 401 \|\| response\.status === 403/);
  assert.match(restSource, /throw new Error\(/);
  assert.match(restSource, /거부를 '문서 없음'으로 오해하면 안 되므로/);
});

test('the audit counts past the first page', () => {
  // Firestore 의 목록 API 는 pageSize 미만을 돌려주면서도 nextPageToken 을 줄 수
  // 있다. 첫 페이지만 세면 조용히 적게 세고, 폐기 판정에서는 그게 곧 오판이다.
  const restSource = readFileSync(
    path.join(repoRoot, 'functions/scripts/lib/firestore-rest.js'),
    'utf8',
  );
  assert.match(restSource, /nextPageToken/);
  assert.match(restSource, /do \{[\s\S]*\} while \(pageToken\)/);
});

test('the audit refuses to bless retirement while the stale namespace holds data', () => {
  assert.match(AUDIT_SOURCE, /if \(staleCounts\.total === 0\)/);
  assert.match(AUDIT_SOURCE, /✓ 폐기 가능/);
  assert.match(AUDIT_SOURCE, /✗ 폐기 불가/);
  // 조건을 만족하지 못하면 exit code 로도 드러나야 자동화에서 걸린다.
  const failureBranches = AUDIT_SOURCE.match(/process\.exitCode = 1;/g) || [];
  assert.ok(failureBranches.length >= 2, 'both refusal paths should set a failing exit code');
});

test('the runbook documents the retirement path and points at the audit', () => {
  assert.match(RUNBOOK, /## 레지스트리 폐기/);
  assert.match(RUNBOOK, /npm --prefix functions run audit:legacy-alias/);
});

test('every path named in the retirement checklist still exists', () => {
  // 체크리스트가 없는 파일을 가리키기 시작하면, 폐기하는 사람이 무엇을 지워야
  // 하는지 알 수 없게 된다.
  const section = RUNBOOK.slice(RUNBOOK.indexOf('## 레지스트리 폐기'));
  assert.notEqual(section, '', 'the retirement section should exist');

  const referenced = new Set();
  const pattern = /`([A-Za-z0-9_./-]+\.(?:js|mjs|md|rules|yml))`/g;
  let match;
  while ((match = pattern.exec(section)) !== null) referenced.add(match[1]);

  assert.ok(referenced.size >= 8, 'the checklist should name the files to delete');

  const missing = [...referenced]
    .filter((relativePath) => {
      // ACCOUNT_MODEL.md 처럼 같은 폴더를 가리키는 상대 링크는 docs/reference 기준이다.
      if (!relativePath.includes('/')) {
        return !existsSync(path.join(repoRoot, 'docs/reference', relativePath))
          && !existsSync(path.join(repoRoot, relativePath));
      }
      return !existsSync(path.join(repoRoot, relativePath));
    })
    .sort();

  assert.deepEqual(missing, [], `the retirement checklist names missing paths: ${missing.join(', ')}`);
});
