import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOMATOFARM_BRANCH,
  TOMATOFARM_PAGES_URL,
  TOMATOFARM_REMOTE,
  assertTomatofarmPushTarget,
} from './repository-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = TOMATOFARM_PAGES_URL;
const remote = TOMATOFARM_REMOTE;
const remoteRef = TOMATOFARM_BRANCH;
const buildInfoPath = path.join(root, 'build-info.json');

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });
  return typeof output === 'string' ? output.trim() : '';
}

function git(args, options = {}) {
  return run('git', args, options);
}

function scriptPath(name) {
  return path.join(root, 'scripts', name);
}

function trackedDirtyFiles() {
  const unstaged = git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean);
  const staged = git(['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean);
  return [...new Set([...unstaged, ...staged])];
}

function restoreTrackedBuildInfo() {
  const status = git(['status', '--porcelain', '--', 'build-info.json']);
  if (!status) return false;
  const tracked = git(['show', 'HEAD:build-info.json']);
  writeFileSync(buildInfoPath, `${tracked.replace(/\s+$/u, '')}\n`, 'utf8');
  return true;
}

function assertCleanTrackedTree() {
  const restored = restoreTrackedBuildInfo();
  if (restored) console.log('[deploy-production] restored generated build-info.json');
  const dirty = trackedDirtyFiles().filter(file => file !== 'build-info.json');
  if (dirty.length) {
    throw new Error(`tracked working tree has uncommitted changes: ${dirty.join(', ')}`);
  }
}

function readCacheVersion() {
  const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
  return sw.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

const remoteUrl = git(['remote', 'get-url', remote]);
assertTomatofarmPushTarget(remote, remoteUrl);
assertCleanTrackedTree();

const currentBranch = git(['branch', '--show-current']);
if (currentBranch !== remoteRef) {
  throw new Error(
    `production deployment requires checked-out ${remoteRef}; current branch is ${currentBranch || '(detached HEAD)'}`,
  );
}

const head = git(['rev-parse', 'HEAD']);
const shortHead = git(['rev-parse', '--short=12', 'HEAD']);
console.log(`[deploy-production] push ${shortHead} -> ${remote}/${remoteRef}`);
git(['push', remote, remoteRef], { stdio: 'inherit' });

console.log(`[deploy-production] verify deploy ${shortHead}`);
run(process.execPath, [scriptPath('verify-deploy.mjs'), baseUrl, head], { stdio: 'inherit' });

const cacheVersion = readCacheVersion();
const markerArgs = [
  `${baseUrl}`,
  'index.html::app.js',
  'app.js::initBuildInfoSurface',
  `sw.js::${cacheVersion}`,
];

console.log('[deploy-production] verify deployed markers');
run(process.execPath, [scriptPath('verify-deployed-markers.mjs'), ...markerArgs], { stdio: 'inherit' });

restoreTrackedBuildInfo();
console.log(`[deploy-production] ok ${shortHead} ${cacheVersion}`);
