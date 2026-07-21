import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateBuildInfo } from '../scripts/generate-build-info.mjs';
import {
  cleanRuntimeAssetPath,
  computeRuntimeDigest,
  runtimeDigestAssetPaths,
} from '../scripts/runtime-digest.mjs';

function digest(runtimeAssets, entries) {
  return computeRuntimeDigest({
    runtimeAssets,
    readAsset(relativePath) {
      if (!entries.has(relativePath)) throw new Error(`missing fixture: ${relativePath}`);
      return entries.get(relativePath);
    },
  });
}

function git(projectRoot, args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('runtime digest canonicalizes order, aliases, and excludes build-info.json', () => {
  assert.equal(cleanRuntimeAssetPath('./'), 'index.html');
  assert.deepEqual(
    runtimeDigestAssetPaths([
      './z.js?cache=1',
      './build-info.json',
      './',
      './index.html',
      '.\\a.js',
    ]),
    ['a.js', 'index.html', 'z.js'],
  );
  assert.throws(() => cleanRuntimeAssetPath('../outside.js'), /escapes the project root/);
});

test('runtime digest normalizes text EOLs but keeps binary bytes exact', async () => {
  const assets = ['./index.html', './script.js', './image.png', './build-info.json'];
  const lfEntries = new Map([
    ['index.html', Buffer.from('<main>ok</main>\n')],
    ['script.js', Buffer.from('const value = 1;\n')],
    ['image.png', Buffer.from([0x0d, 0x0a, 0x00, 0xff])],
  ]);
  const crlfEntries = new Map([
    ['index.html', Buffer.from('<main>ok</main>\r\n')],
    ['script.js', Buffer.from('const value = 1;\r\n')],
    ['image.png', Buffer.from([0x0d, 0x0a, 0x00, 0xff])],
  ]);
  const changedBinaryEntries = new Map(crlfEntries);
  changedBinaryEntries.set('image.png', Buffer.from([0x0a, 0x00, 0xff]));

  assert.equal(await digest(assets, lfEntries), await digest([...assets].reverse(), crlfEntries));
  assert.notEqual(await digest(assets, lfEntries), await digest(assets, changedBinaryEntries));
});

test('build info identifies dirty local source and records its deterministic runtime digest', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'tomatofarm-build-info-'));
  const runtimeAssets = ['./', './index.html', './build-info.json'];
  try {
    mkdirSync(join(projectRoot, 'scripts'), { recursive: true });
    writeFileSync(join(projectRoot, 'index.html'), '<main>clean</main>\n');
    writeFileSync(join(projectRoot, 'sw.js'), "const CACHE_VERSION = 'fixture-v1';\n");
    writeFileSync(join(projectRoot, 'build-info.json'), '{}\n');

    git(projectRoot, ['init']);
    git(projectRoot, ['config', 'user.email', 'codex-test@example.invalid']);
    git(projectRoot, ['config', 'user.name', 'Codex Test']);
    git(projectRoot, ['add', 'index.html', 'sw.js', 'build-info.json']);
    git(projectRoot, ['commit', '-m', 'fixture']);
    const head = git(projectRoot, ['rev-parse', 'HEAD']);

    const clean = await generateBuildInfo({
      projectRoot,
      environment: {},
      runtimeAssets,
      deployedAt: '2026-07-18T00:00:00.000Z',
    });
    assert.equal(clean.commit, head);
    assert.equal(clean.sourceBaseCommit, head);
    assert.equal(clean.sourceDirty, false);
    assert.match(clean.runtimeDigest, /^[0-9a-f]{64}$/);
    assert.equal(clean.runtimeDigestAlgorithm, 'sha256');
    assert.equal(clean.runtimeDigestVersion, 1);

    const cleanAfterGeneratedMetadata = await generateBuildInfo({
      projectRoot,
      environment: {},
      runtimeAssets,
      deployedAt: '2026-07-18T00:00:00.500Z',
    });
    assert.equal(cleanAfterGeneratedMetadata.sourceDirty, false);
    assert.equal(cleanAfterGeneratedMetadata.runtimeDigest, clean.runtimeDigest);

    writeFileSync(join(projectRoot, 'index.html'), '<main>dirty</main>\n');
    const dirty = await generateBuildInfo({
      projectRoot,
      environment: {},
      runtimeAssets,
      deployedAt: '2026-07-18T00:00:01.000Z',
    });
    assert.equal(dirty.commit, 'local-dirty');
    assert.equal(dirty.shortCommit, 'local-dirty');
    assert.equal(dirty.sourceBaseCommit, head);
    assert.equal(dirty.sourceDirty, true);
    assert.notEqual(dirty.runtimeDigest, clean.runtimeDigest);

    const written = JSON.parse(readFileSync(join(projectRoot, 'build-info.json'), 'utf8'));
    assert.deepEqual(written, dirty);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('APK verifier compares normalized assets and embedded runtime digests', () => {
  const verifier = readFileSync(new URL('../scripts/verify-apk-runtime-assets.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /normalizeRuntimeAssetBytes/);
  assert.match(verifier, /computeRuntimeDigestFromRoot/);
  assert.match(verifier, /apkBuildInfo\.runtimeDigest !== apkRuntimeDigest/);
  assert.match(verifier, /rootRuntimeDigest !== apkRuntimeDigest/);
  assert.match(verifier, /EXPECTED_APP\s*=\s*'tomatofarm'/);
  assert.match(verifier, /buildInfo\.app !== EXPECTED_APP/);
  assert.match(verifier, /EXPECTED_CACHE_PREFIX\s*=\s*'tomatofarm-'/);
  assert.doesNotMatch(verifier, /source\.equals\(embedded\)/);
});

test('Pages workflow generates build metadata before runtime and APK verification', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const generateIndex = workflow.indexOf('run: node scripts/generate-build-info.mjs');
  const runtimeVerifyIndex = workflow.indexOf('run: node scripts/verify-runtime-assets.mjs');
  const apkVerifyIndex = workflow.indexOf('run: node scripts/verify-apk-runtime-assets.mjs');

  assert.notEqual(generateIndex, -1, 'Pages workflow should generate build-info.json');
  assert.notEqual(runtimeVerifyIndex, -1, 'Pages workflow should verify runtime references');
  assert.notEqual(apkVerifyIndex, -1, 'Pages workflow should verify the downloadable APK');
  assert.ok(generateIndex < runtimeVerifyIndex, 'build info must be generated before runtime verification');
  assert.ok(runtimeVerifyIndex < apkVerifyIndex, 'runtime verification must run before APK verification');
});
