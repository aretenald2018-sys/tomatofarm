const baseArg = process.argv[2];
const expectedCommit = process.argv[3] || process.env.GITHUB_SHA || '';

if (!baseArg) {
  console.error('Usage: node scripts/verify-deploy.mjs <base-url> [expected-commit]');
  process.exit(2);
}

const baseUrl = baseArg.endsWith('/') ? baseArg : `${baseArg}/`;

function toUrl(filePath) {
  return new URL(filePath.replace(/^\.\//, ''), baseUrl).toString();
}

async function fetchText(filePath) {
  const url = toUrl(filePath);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${filePath} HTTP ${res.status}`);
  return res.text();
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function extractStaticAssets(swText) {
  const block = swText.match(/const\s+STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const buildInfoText = await fetchText('build-info.json');
const buildInfo = JSON.parse(buildInfoText);
const swText = await fetchText('sw.js');
const swCacheVersion = swText.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';

if (expectedCommit) {
  const deployedCommit = String(buildInfo.commit || '');
  assertOk(
    deployedCommit === expectedCommit || deployedCommit.startsWith(expectedCommit) || expectedCommit.startsWith(deployedCommit),
    `deployed commit mismatch: expected ${expectedCommit}, got ${deployedCommit}`,
  );
}

assertOk(buildInfo.cacheVersion === swCacheVersion, `cacheVersion mismatch: build-info=${buildInfo.cacheVersion}, sw=${swCacheVersion}`);

const staticAssets = extractStaticAssets(swText);
for (const asset of staticAssets) {
  await fetchText(asset);
}

const keyFiles = [
  { path: 'index.html', marker: 'app.js' },
  { path: 'app.js', marker: 'initBuildInfoSurface' },
  { path: 'utils/build-info.js', marker: 'renderBuildInfo' },
  { path: 'workout/save-pure.js', marker: 'shouldKeepMaxDraftExercisesForSavePure' },
  { path: 'workout/expert/max-benchmark-picker.js', marker: 'resolveMaxBenchmarkPickerItems' },
  { path: 'workout/exercises.js', marker: 'ex-max-v2-last-sets' },
  { path: 'render-calendar.js', marker: 'cal-bd-row-workout' },
];

for (const item of keyFiles) {
  const text = await fetchText(item.path);
  assertOk(text.includes(item.marker), `${item.path} marker missing: ${item.marker}`);
}

const indexText = await fetchText('index.html');
assertOk(!indexText.includes('20260421e'), 'index.html still references stale 20260421e assets');

console.log(`[deploy-verify] ok ${buildInfo.shortCommit || buildInfo.commit} ${buildInfo.cacheVersion} static=${staticAssets.length}`);
