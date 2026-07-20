import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOMATOFARM_BRANCH,
  TOMATOFARM_REMOTE,
  assertTomatofarmPushTarget,
} from './repository-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];

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

function configEquals(key, expected) {
  let actual = '';
  try {
    actual = git(['config', '--local', '--get', key]);
  } catch {
    // Missing configuration is reported below with the same message as a mismatch.
  }
  if (actual !== expected) failures.push(`${key}=${actual || '(missing)'}; expected ${expected}`);
}

function check() {
  const remotes = git(['remote']).split(/\r?\n/u).filter(Boolean);
  if (remotes.length !== 1 || remotes[0] !== TOMATOFARM_REMOTE) {
    failures.push(`remotes=${remotes.join(', ') || '(none)'}; expected only ${TOMATOFARM_REMOTE}`);
  } else {
    const remoteUrl = git(['remote', 'get-url', TOMATOFARM_REMOTE]);
    try {
      assertTomatofarmPushTarget(TOMATOFARM_REMOTE, remoteUrl);
    } catch (error) {
      failures.push(error.message);
    }
  }

  configEquals('core.hooksPath', '.githooks');
  configEquals('remote.pushDefault', TOMATOFARM_REMOTE);
  configEquals('fetch.prune', 'true');
  configEquals(`remote.${TOMATOFARM_REMOTE}.prune`, 'true');
  configEquals('pull.ff', 'only');
  configEquals('push.default', 'simple');

  const branch = git(['branch', '--show-current']);
  const head = git(['rev-parse', 'HEAD']);
  const originHead = git(['rev-parse', `refs/remotes/${TOMATOFARM_REMOTE}/${TOMATOFARM_BRANCH}`]);
  if (branch === TOMATOFARM_BRANCH) {
    if (head !== originHead) {
      failures.push(`main is not synchronized: HEAD ${head.slice(0, 12)} != origin/main ${originHead.slice(0, 12)}`);
    }
  } else if (!branch) {
    failures.push('detached HEAD; use main for the shared integration checkout');
  } else {
    const base = git(['merge-base', `refs/remotes/${TOMATOFARM_REMOTE}/${TOMATOFARM_BRANCH}`, 'HEAD']);
    if (base !== originHead) {
      failures.push(`task branch ${branch} is based on ${base.slice(0, 12)}, not current origin/main ${originHead.slice(0, 12)}`);
    }
    warnings.push(`task branch ${branch}; shared baseline is ${originHead.slice(0, 12)}`);
  }

  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) {
    if (branch === TOMATOFARM_BRANCH) failures.push('main worktree has uncommitted or untracked files');
    else warnings.push('task worktree has local changes');
  }

  if (warnings.length) warnings.forEach((warning) => console.log(`[development-check] warning: ${warning}`));
  if (failures.length) {
    failures.forEach((failure) => console.error(`[development-check] fail: ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(`[development-check] ok branch=${branch} head=${head.slice(0, 12)} origin/main=${originHead.slice(0, 12)}`);
}

try {
  check();
} catch (error) {
  console.error(`[development-check] fail: ${error.message}`);
  process.exitCode = 1;
}
