import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSharedAccountDataOwnerRegistry } from '../data/account-unification.js';

const gate = readFileSync(new URL('../scripts/verify-shared-owner-release-gate.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

test('the release gate verifies the registry instead of trusting an attestation', () => {
  // 사람이 켜는 변수는 두 방향으로 다 틀렸다: 안 켜면 영원히 막히고, 켜면
  // 아무도 확인하지 않은 주장이 통과한다. 실제 문서를 읽어야 한다.
  assert.doesNotMatch(gate, /TOMATO_SHARED_OWNER_V2_READY/);
  assert.doesNotMatch(workflow, /TOMATO_SHARED_OWNER_V2_READY/);
  assert.match(workflow, /run: node scripts\/verify-shared-owner-release-gate\.mjs/);

  // 게이트는 클라이언트의 판정 함수를 그대로 import 해야 한다. 규칙을 다시
  // 적으면 클라이언트가 조건을 바꿨을 때 조용히 어긋난다.
  assert.match(gate, /import \{[\s\S]*readSharedAccountDataOwnerRegistry[\s\S]*\} from '\.\.\/data\/account-unification\.js'/);
  assert.match(gate, /readSharedAccountDataOwnerRegistry\(document\)/);
  assert.doesNotMatch(gate, /version\s*[<>=]=?\s*2\b/);
  assert.doesNotMatch(gate, /=== 'decided'/);

  // 네트워크가 흔들린다고 닫힌 게이트가 열려서는 안 된다.
  assert.match(gate, /RETRIES/);
  assert.match(gate, /could not read the registry after/);
});

test('the gate rejects exactly the records the client rejects', () => {
  const decided = { ownerId: '김_태우', version: 2, status: 'decided' };
  assert.equal(readSharedAccountDataOwnerRegistry(decided), '김_태우');
  assert.equal(readSharedAccountDataOwnerRegistry({ ...decided, ownerId: '김_태우(guest)' }), '김_태우(guest)');

  // 2026-07-18에 실제로 기록된 v1 레코드. 존재하지만 클라이언트는 거부한다.
  assert.equal(readSharedAccountDataOwnerRegistry({
    ownerId: '김_태우',
    version: 1,
    reason: 'admin-private-data-present',
    decidedAt: 1784364828326,
  }), null);

  assert.equal(readSharedAccountDataOwnerRegistry({ ...decided, status: undefined }), null);
  assert.equal(readSharedAccountDataOwnerRegistry({ ...decided, version: 1 }), null);
  assert.equal(readSharedAccountDataOwnerRegistry({ ...decided, ownerId: '누군가' }), null);
  assert.equal(readSharedAccountDataOwnerRegistry(null), null);
});

test('the v1 promotion script never picks an owner on its own', () => {
  const promote = readFileSync(new URL('../functions/scripts/promote-tomato-data-owner-v2.js', import.meta.url), 'utf8');

  // 네임스페이스 선택은 사람의 결정이다. 스크립트는 이미 정해진 ownerId에
  // 누락된 필드만 붙인다.
  assert.match(promote, /refusing to promote:/);
  assert.match(promote, /knownOwnerId\(current\.ownerId\)/);
  assert.doesNotMatch(promote, /adminTomatoNamespaceHasData/);
  assert.match(promote, /ownerId unchanged/);

  // 기본은 dry run이고, 쓰기는 트랜잭션 안에서 다시 읽어 확인한다.
  assert.match(promote, /const commit = args\.has\("--commit"\)/);
  assert.match(promote, /if \(!commit\)[\s\S]*no write performed/);
  assert.match(promote, /runTransaction/);
  assert.match(promote, /registry ownerId changed mid-promotion/);
  assert.match(promote, /refusing to downgrade/);

  const functionsPackage = JSON.parse(
    readFileSync(new URL('../functions/package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    functionsPackage.scripts?.['promote:tomato-owner-v2'],
    'node scripts/promote-tomato-data-owner-v2.js',
  );
});
