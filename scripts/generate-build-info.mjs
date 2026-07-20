import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../runtime-assets.js';
import {
  RUNTIME_DIGEST_ALGORITHM,
  RUNTIME_DIGEST_VERSION,
  computeRuntimeDigestFromRoot,
} from './runtime-digest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args, projectRoot = root) {
  try {
    return execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function hasTrackedSourceChanges(projectRoot = root) {
  return Boolean(git([
    'status',
    '--porcelain=v1',
    '--untracked-files=no',
    '--',
    '.',
    ':(exclude)build-info.json',
  ], projectRoot));
}

async function readCacheVersion(projectRoot) {
  const sw = await readFile(path.join(projectRoot, 'sw.js'), 'utf8');
  const match = sw.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || 'unknown';
}

export async function generateBuildInfo({
  projectRoot = root,
  environment = process.env,
  runtimeAssets = globalThis.TOMATO_STATIC_ASSETS || [],
  deployedAt = new Date(),
} = {}) {
  const sourceBaseCommit = environment.GITHUB_SHA
    || git(['rev-parse', 'HEAD'], projectRoot)
    || null;
  const sourceDirty = !sourceBaseCommit || hasTrackedSourceChanges(projectRoot);
  const commit = sourceDirty ? 'local-dirty' : sourceBaseCommit;
  const branch = environment.GITHUB_REF_NAME
    || git(['branch', '--show-current'], projectRoot)
    || 'local';
  const [cacheVersion, runtimeDigest] = await Promise.all([
    readCacheVersion(projectRoot),
    computeRuntimeDigestFromRoot(projectRoot, runtimeAssets),
  ]);

  const buildInfo = {
    app: 'tomatofarm',
    commit,
    shortCommit: commit === 'local-dirty' ? commit : commit.slice(0, 12),
    sourceBaseCommit,
    sourceDirty,
    branch,
    deployedAt: new Date(deployedAt).toISOString(),
    cacheVersion,
    runtimeDigest,
    runtimeDigestAlgorithm: RUNTIME_DIGEST_ALGORITHM,
    runtimeDigestVersion: RUNTIME_DIGEST_VERSION,
    runId: environment.GITHUB_RUN_ID || null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT || null,
  };

  await writeFile(
    path.join(projectRoot, 'build-info.json'),
    `${JSON.stringify(buildInfo, null, 2)}\n`,
    'utf8',
  );
  return buildInfo;
}

function isMainModule() {
  return process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const buildInfo = await generateBuildInfo();
  console.log(`[build-info] ${buildInfo.shortCommit} ${buildInfo.cacheVersion} ${buildInfo.runtimeDigest.slice(0, 12)}`);
}
