import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const verifyDeploy = await readFile(new URL('../scripts/verify-deploy.mjs', import.meta.url), 'utf8');
const verifyMarkers = await readFile(new URL('../scripts/verify-deployed-markers.mjs', import.meta.url), 'utf8');
const deployProduction = await readFile(new URL('../scripts/deploy-production.mjs', import.meta.url), 'utf8');
const repositoryBoundary = await readFile(new URL('../scripts/repository-boundary.mjs', import.meta.url), 'utf8');
const prePush = await readFile(new URL('../.githooks/pre-push', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const { assertTomatofarmPushTarget, repositoryFromRemoteUrl } = await import('../scripts/repository-boundary.mjs');

test('verify-deploy resolves git refs such as HEAD before comparing deployed commit', () => {
  assert.match(verifyDeploy, /function resolveExpectedCommit\(input\)/);
  assert.match(verifyDeploy, /git\(\['rev-parse', raw\]\) \|\| raw/);
  assert.match(verifyDeploy, /const expectedCommit = resolveExpectedCommit\(expectedCommitInput\)/);
  assert.match(verifyDeploy, /function commitMatches\(deployedCommit, expectedCommit\)/);
});

test('verify-deploy retries stale Pages commit mismatches inside the deploy wait loop', () => {
  const waitStart = verifyDeploy.indexOf('async function waitForDeploySnapshot()');
  assert.ok(waitStart >= 0, 'waitForDeploySnapshot should exist');
  const waitBody = verifyDeploy.slice(waitStart, verifyDeploy.indexOf('const { buildInfo, swText }', waitStart));

  assert.match(waitBody, /for \(let attempt = 0; attempt <= deployRetries; attempt \+= 1\)/);
  assert.match(waitBody, /deployed commit mismatch/);
  assert.match(waitBody, /if \(attempt < deployRetries\) await sleep\(deployDelayMs\)/);
  assert.doesNotMatch(waitBody, /fetchText\('build-info\.json', \{ retries: 24/);
});

test('deployed marker verification is a script, not PowerShell node -e quoting', () => {
  assert.match(verifyMarkers, /Usage: node scripts\/verify-deployed-markers\.mjs/);
  assert.match(verifyMarkers, /const sep = raw\.indexOf\('::'\)/);
  assert.match(verifyMarkers, /text\.includes\(marker\)/);
  assert.equal(packageJson.scripts['verify:deployed-markers'], 'node scripts/verify-deployed-markers.mjs');
});

test('production deploy is locked to the Tomato Farm repository, branch, and Pages URL', () => {
  assert.match(repositoryBoundary, /TOMATOFARM_REPOSITORY = 'aretenald2018-sys\/tomatofarm'/);
  assert.match(repositoryBoundary, /TOMATOFARM_REMOTE = 'origin'/);
  assert.match(repositoryBoundary, /TOMATOFARM_BRANCH = 'main'/);
  assert.match(repositoryBoundary, /TOMATOFARM_PAGES_URL = 'https:\/\/aretenald2018-sys\.github\.io\/tomatofarm\/'/);
  assert.match(deployProduction, /assertTomatofarmPushTarget\(remote, remoteUrl\)/);
  assert.match(deployProduction, /git\(\['push', remote, remoteRef\]/);
  assert.match(deployProduction, /verify-deploy\.mjs/);
  assert.match(deployProduction, /verify-deployed-markers\.mjs/);
  assert.equal(packageJson.scripts['deploy:production'], 'node scripts/deploy-production.mjs');
  assert.equal(packageJson.scripts['deploy:dashboard3'], undefined);
});

test('pre-push hook blocks cross-environment remotes', () => {
  assert.match(prePush, /check-push-target\.mjs/);
  assert.match(repositoryBoundary, /blocked cross-environment push/);
  assert.equal(
    packageJson.scripts['check:repository'],
    'node scripts/check-repository-boundary.mjs && node scripts/check-project-governance.mjs',
  );
  assert.equal(repositoryFromRemoteUrl('git@github.com:aretenald2018-sys/tomatofarm.git'), 'aretenald2018-sys/tomatofarm');
  assert.doesNotThrow(() => assertTomatofarmPushTarget('origin', 'https://github.com/aretenald2018-sys/tomatofarm.git'));
  assert.throws(
    () => assertTomatofarmPushTarget('dashboard3', 'https://github.com/aretenald2018-sys/dashboard3.git'),
    /blocked cross-environment push/,
  );
});
