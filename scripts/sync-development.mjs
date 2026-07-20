import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOMATOFARM_BRANCH,
  TOMATOFARM_REMOTE,
  assertTomatofarmPushTarget,
} from './repository-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim();
    throw new Error(detail || `git ${args.join(' ')} failed`);
  }
}

function runGit(args) {
  try {
    execFileSync('git', args, { cwd: root, stdio: 'inherit' });
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed with exit code ${error.status ?? 'unknown'}`);
  }
}

function assertRepositoryBoundary() {
  const remotes = git(['remote']).split(/\r?\n/u).filter(Boolean);
  if (remotes.length !== 1 || remotes[0] !== TOMATOFARM_REMOTE) {
    throw new Error(
      `expected only remote "${TOMATOFARM_REMOTE}", found ${remotes.join(', ') || '(none)'}`,
    );
  }
  const remoteUrl = git(['remote', 'get-url', TOMATOFARM_REMOTE]);
  assertTomatofarmPushTarget(TOMATOFARM_REMOTE, remoteUrl);
}

function assertCleanWorktree() {
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) {
    const files = status.split(/\r?\n/u).slice(0, 20).join('\n');
    const suffix = status.split(/\r?\n/u).length > 20 ? '\n…' : '';
    throw new Error(
      `worktree is not clean; commit or safely move these changes before syncing:\n${files}${suffix}`,
    );
  }
}

function main() {
  assertRepositoryBoundary();

  const branch = git(['branch', '--show-current']);
  if (branch !== TOMATOFARM_BRANCH) {
    throw new Error(
      `sync must run from ${TOMATOFARM_BRANCH}, currently on ${branch || '(detached HEAD)'}`,
    );
  }

  assertCleanWorktree();
  console.log('[development-sync] fetching origin with prune');
  runGit(['fetch', TOMATOFARM_REMOTE, '--prune']);
  console.log('[development-sync] fast-forwarding local main');
  runGit(['merge', '--ff-only', `${TOMATOFARM_REMOTE}/${TOMATOFARM_BRANCH}`]);

  const head = git(['rev-parse', 'HEAD']);
  const originHead = git(['rev-parse', `refs/remotes/${TOMATOFARM_REMOTE}/${TOMATOFARM_BRANCH}`]);
  if (head !== originHead) {
    throw new Error(`sync incomplete: HEAD ${head} != ${TOMATOFARM_REMOTE}/${TOMATOFARM_BRANCH} ${originHead}`);
  }

  console.log(`[development-sync] ok ${head.slice(0, 12)} ${TOMATOFARM_REMOTE}/${TOMATOFARM_BRANCH}`);
}

try {
  main();
} catch (error) {
  console.error(`[development-sync] ${error.message}`);
  process.exitCode = 1;
}
