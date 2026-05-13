import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function readCacheVersion() {
  const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
  const match = sw.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || 'unknown';
}

const commit = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']) || 'local';
const branch = process.env.GITHUB_REF_NAME || git(['branch', '--show-current']) || 'local';
const cacheVersion = await readCacheVersion();

const buildInfo = {
  app: 'tomatofarm',
  commit,
  shortCommit: commit === 'local' ? 'local' : commit.slice(0, 12),
  branch,
  deployedAt: new Date().toISOString(),
  cacheVersion,
  runId: process.env.GITHUB_RUN_ID || null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
};

await writeFile(
  path.join(root, 'build-info.json'),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
  'utf8',
);

console.log(`[build-info] ${buildInfo.shortCommit} ${buildInfo.cacheVersion}`);
