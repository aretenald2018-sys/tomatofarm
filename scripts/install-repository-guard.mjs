import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

git(['config', '--local', 'core.hooksPath', '.githooks']);
git(['config', '--local', 'remote.pushDefault', 'origin']);
git(['config', '--local', 'fetch.prune', 'true']);
git(['config', '--local', 'remote.origin.prune', 'true']);
git(['config', '--local', 'pull.ff', 'only']);
git(['config', '--local', 'push.default', 'simple']);
git(['config', '--local', 'branch.main.remote', 'origin']);
git(['config', '--local', 'branch.main.merge', 'refs/heads/main']);
console.log('[repository-guard] installed hooks, origin-only push, prune, and fast-forward-only pull policy');
