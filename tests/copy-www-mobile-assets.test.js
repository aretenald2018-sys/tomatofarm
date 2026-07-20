import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyWww } from '../scripts/copy-www.js';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function makeCopyFixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'tomatofarm-copy-www-'));
  mkdirSync(join(projectRoot, 'assets'), { recursive: true });
  mkdirSync(join(projectRoot, 'www'), { recursive: true });
  writeFileSync(join(projectRoot, 'index.html'), '<main>current</main>\n');
  writeFileSync(join(projectRoot, 'build-info.json'), '{}\n');
  writeFileSync(join(projectRoot, 'sw.js'), "const CACHE_VERSION = 'test';\n");
  writeFileSync(join(projectRoot, 'assets', 'asset.txt'), 'asset\n');
  writeFileSync(join(projectRoot, 'www', 'stale.txt'), 'stale\n');
  return projectRoot;
}

function temporaryCopyDirectories(projectRoot) {
  return readdirSync(projectRoot)
    .filter(name => name.startsWith('.www-staging-') || name.startsWith('.www-backup-'));
}

const copyWwwSource = read('scripts/copy-www.js');

test('mobile Capacitor asset copy includes app shell dependencies', () => {
  assert.match(copyWwwSource, /const manifestTargets = runtimeAssets/);
  assert.match(copyWwwSource, /\.\.\.manifestTargets/);
  assert.match(copyWwwSource, /'assets'/);
  assert.match(copyWwwSource, /\.www-staging-/);
  assert.match(copyWwwSource, /renameSync\(staging, www\)/);
  assert.match(copyWwwSource, /finally/);
  assert.match(copyWwwSource, /cleanupTemporaryDirectories/);
  assert.doesNotMatch(copyWwwSource, /'expert-mode\.css', 'test-mode-v2\.css'/);
});

test('copyWww atomically replaces stale output and removes temporary directories', () => {
  const projectRoot = makeCopyFixture();
  try {
    const result = copyWww({
      projectRoot,
      runtimeAssets: ['./', './index.html', './build-info.json'],
    });

    assert.equal(result.runtimeAssetCount, 3);
    assert.equal(readFileSync(join(projectRoot, 'www', 'index.html'), 'utf8'), '<main>current</main>\n');
    assert.equal(existsSync(join(projectRoot, 'www', 'stale.txt')), false);
    assert.deepEqual(temporaryCopyDirectories(projectRoot), []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('copyWww cleans failed staging and preserves the previous output', () => {
  const projectRoot = makeCopyFixture();
  try {
    assert.throws(
      () => copyWww({
        projectRoot,
        runtimeAssets: ['./', './missing-runtime.js'],
      }),
      /runtime asset source missing: missing-runtime\.js/,
    );

    assert.equal(readFileSync(join(projectRoot, 'www', 'stale.txt'), 'utf8'), 'stale\n');
    assert.equal(existsSync(join(projectRoot, 'www', 'index.html')), false);
    assert.deepEqual(temporaryCopyDirectories(projectRoot), []);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
