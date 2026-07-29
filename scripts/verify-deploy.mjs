import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseArg = process.argv[2];
const expectedCommitInput = process.argv[3] || '';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deployRetries = Number(process.env.VERIFY_DEPLOY_RETRIES || 36);
const deployDelayMs = Number(process.env.VERIFY_DEPLOY_DELAY_MS || 5000);
// 두 환경이 같은 자산 구조를 공유하기 때문에, 배포본이 실제로 이 앱인지까지
// 확인해야 한다. 확인하지 않으면 다른 환경의 Pages 배포를 통과시킬 수 있다.
const EXPECTED_APP = 'tomatofarm';

if (!baseArg) {
  console.error('Usage: node scripts/verify-deploy.mjs <base-url> [expected-commit]');
  process.exit(2);
}

const baseUrl = baseArg.endsWith('/') ? baseArg : `${baseArg}/`;

function toUrl(filePath) {
  return new URL(filePath.replace(/^\.\//, ''), baseUrl).toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function resolveExpectedCommit(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^[0-9a-f]{7,40}$/i.test(raw)) return raw;
  return git(['rev-parse', raw]) || raw;
}

async function fetchTextOnce(filePath) {
  const url = toUrl(filePath);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${filePath} HTTP ${res.status}`);
  return res.text();
}

async function fetchText(filePath, { retries = 0, delayMs = 5000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchTextOnce(filePath);
    } catch (e) {
      lastError = e;
      if (attempt < retries) await sleep(delayMs);
    }
  }
  throw lastError;
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function commitMatches(deployedCommit, expectedCommit) {
  if (!expectedCommit) return true;
  if (!deployedCommit) return false;
  return deployedCommit === expectedCommit
    || deployedCommit.startsWith(expectedCommit)
    || expectedCommit.startsWith(deployedCommit);
}

function extractStaticAssets(manifestText) {
  const block = manifestText.match(/TOMATO_STATIC_ASSETS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || '';
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const expectedCommit = resolveExpectedCommit(expectedCommitInput);

async function waitForDeploySnapshot() {
  let lastError = null;
  for (let attempt = 0; attempt <= deployRetries; attempt += 1) {
    try {
      const buildInfoText = await fetchTextOnce('build-info.json');
      const buildInfo = JSON.parse(buildInfoText);
      const swText = await fetchTextOnce('sw.js');
      const swCacheVersion = swText.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
      const runtimeAssetsText = await fetchTextOnce('runtime-assets.js');
      const deployedCommit = String(buildInfo.commit || '');

      assertOk(
        commitMatches(deployedCommit, expectedCommit),
        `deployed commit mismatch: expected ${expectedCommitInput || expectedCommit}, got ${deployedCommit}`,
      );
      assertOk(
        buildInfo.app === EXPECTED_APP,
        `deployed app mismatch: expected ${EXPECTED_APP}, got ${buildInfo.app || '(missing)'}`,
      );
      assertOk(buildInfo.cacheVersion === swCacheVersion, `cacheVersion mismatch: build-info=${buildInfo.cacheVersion}, sw=${swCacheVersion}`);
      return { buildInfo, swText, runtimeAssetsText };
    } catch (e) {
      lastError = e;
      if (attempt < deployRetries) await sleep(deployDelayMs);
    }
  }
  throw lastError;
}

const { buildInfo, swText, runtimeAssetsText } = await waitForDeploySnapshot();

const staticAssets = extractStaticAssets(runtimeAssetsText);
assertOk(staticAssets.length > 0, 'runtime asset manifest is empty');
for (const asset of staticAssets) {
  await fetchText(asset, { retries: 2, delayMs: 2000 });
}

const keyFiles = [
  { path: 'index.html', marker: 'app.js' },
  { path: 'app.js', marker: 'initBuildInfoSurface' },
  { path: 'utils/build-info.js', marker: 'renderBuildInfo' },
  { path: 'workout/save.js', marker: './save-pure.js' },
  { path: 'workout/save-pure.js', marker: 'shouldKeepMaxDraftExercisesForSavePure' },
  { path: 'workout/expert/max-benchmark-picker.js', marker: 'resolveMaxBenchmarkPickerItems' },
];

for (const item of keyFiles) {
  const text = await fetchText(item.path, { retries: 2, delayMs: 2000 });
  assertOk(text.includes(item.marker), `${item.path} marker missing: ${item.marker}`);
}

const indexText = await fetchText('index.html', { retries: 2, delayMs: 2000 });
assertOk(!indexText.includes('20260421e'), 'index.html still references stale 20260421e assets');

console.log(`[deploy-verify] ok ${buildInfo.shortCommit || buildInfo.commit} ${buildInfo.cacheVersion} static=${staticAssets.length}`);
