import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOMATOFARM_REMOTE,
  assertTomatofarmPushTarget,
} from './repository-boundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

const remotes = git(['remote']).split(/\r?\n/u).filter(Boolean);
if (remotes.length !== 1 || remotes[0] !== TOMATOFARM_REMOTE) {
  throw new Error(
    `repository boundary violation: expected only remote "${TOMATOFARM_REMOTE}", found ${remotes.join(', ') || '(none)'}`,
  );
}

// A remote can carry a separate pushurl, so validating only the fetch URL would
// let a cross-environment push target through this guard unnoticed.
const fetchUrl = git(['remote', 'get-url', TOMATOFARM_REMOTE]);
const pushUrl = git(['remote', 'get-url', '--push', TOMATOFARM_REMOTE]);
assertTomatofarmPushTarget(TOMATOFARM_REMOTE, fetchUrl);
assertTomatofarmPushTarget(TOMATOFARM_REMOTE, pushUrl);
console.log(`[repository-boundary] ok ${TOMATOFARM_REMOTE} fetch=${fetchUrl} push=${pushUrl}`);
