import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const posix = (value) => value.replaceAll('\\', '/');
const failures = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map(posix);
}

function reject(condition, message) {
  if (condition) failures.push(message);
}

const files = trackedFiles().filter((file) => existsSync(path.join(root, file)));
const requiredMarkdown = new Set([
  'AGENTS.md',
  'ARCHITECTURE.md',
  'CLAUDE.md',
  'README.md',
  'docs/COMPATIBILITY.md',
  'docs/DESIGN_SYSTEM.md',
  'docs/LIFE_ZONE_ASSETS.md',
  'docs/adr/2026-05-15-exercise-ssot.md',
  'docs/workout-data-lineage.md',
  'workout/expert/AGENTS.md',
]);
const durableMarkdownPrefixes = [
  'docs/adr/',
  'docs/contracts/',
  'docs/reference/',
];

const markdownFiles = files.filter((file) => file.toLowerCase().endsWith('.md'));
for (const file of markdownFiles) {
  const allowed = requiredMarkdown.has(file)
    || durableMarkdownPrefixes.some((prefix) => file.startsWith(prefix));
  reject(!allowed, `Markdown must be a required document or durable ADR/contract/reference: ${file}`);
}
for (const file of requiredMarkdown) {
  reject(!files.includes(file), `missing authoritative document: ${file}`);
}

const forbiddenTrackedPrefixes = ['.omo/', 'docs/ai/', '.claude/'];
for (const file of files) {
  reject(forbiddenTrackedPrefixes.some((prefix) => file.startsWith(prefix)), `tracked local/history artifact: ${file}`);
}
reject(files.includes('scripts/dev-start.sh'), 'obsolete scripts/dev-start.sh must not be tracked');

const staleInstructionPatterns = [
  [/Dashboard3/iu, 'cross-project Dashboard3 instruction'],
  [/[A-Z]:[\\/]Users[\\/]/u, 'hard-coded user checkout path'],
  [/docs[\\/]ai/iu, 'deleted AI history path'],
  [/NEXT_ACTION/iu, 'deleted next-action workflow'],
  [/scripts[\\/]dev-start\.sh/iu, 'obsolete dev launcher'],
  [/HEAD:main/iu, 'non-canonical production refspec'],
  [/tomatofarm-v20\d{6}/iu, 'hard-coded historical cache version'],
  [/\.omo[\\/]/iu, 'local evidence path'],
];

for (const file of markdownFiles) {
  const source = read(file);
  for (const [pattern, label] of staleInstructionPatterns) {
    reject(pattern.test(source), `${file}: ${label}`);
  }

  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/gu;
  for (const match of source.matchAll(linkPattern)) {
    let target = match[1].trim().replace(/^<|>$/gu, '');
    if (/^(?:https?:|mailto:|#)/iu.test(target)) continue;
    target = decodeURIComponent(target.split('#', 1)[0]);
    const resolved = path.resolve(root, path.dirname(file), target);
    reject(!existsSync(resolved), `${file}: broken Markdown link ${match[1]}`);
  }
}

const agents = read('AGENTS.md');
const claude = read('CLAUDE.md');
reject(agents.split(/\r?\n/u).length > 80, 'AGENTS.md must stay below 80 lines');
reject(claude.split(/\r?\n/u).length > 15, 'CLAUDE.md must remain a short AGENTS.md pointer');
reject(!/style\.css.+generated|generated.+style\.css/isu.test(agents), 'AGENTS.md must state that style.css is generated');
reject(!/styles\//u.test(agents), 'AGENTS.md must identify owner stylesheets');

const testSources = files
  .filter((file) => file.startsWith('tests/') && file.endsWith('.js'))
  .map((file) => [file, read(file)]);
for (const [file, source] of testSources) {
  reject(/docs[\\/]ai|\.omo[\\/]/iu.test(source), `${file}: test depends on historical docs/evidence`);
}

const gitignore = read('.gitignore');
for (const ignored of ['.claude/', '.omo/', '.codex-worktrees/', '.test-results/']) {
  reject(!gitignore.split(/\r?\n/u).includes(ignored), `.gitignore must include ${ignored}`);
}

const packageJson = JSON.parse(read('package.json'));
for (const script of ['dev', 'test', 'build', 'check:governance', 'verify:assets']) {
  reject(!packageJson.scripts?.[script], `package.json is missing script ${script}`);
}
reject(!String(packageJson.scripts?.['verify:assets']).includes('generate-style-entry.mjs --check'), 'verify:assets must check generated CSS without rewriting it');

const workflow = read('.github/workflows/deploy.yml');
reject(!workflow.includes('check-project-governance.mjs'), 'Pages workflow must enforce project governance');
reject(!workflow.includes('generate-style-entry.mjs --check'), 'Pages workflow must reject stale generated CSS');

if (failures.length) {
  console.error('[project-governance] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`[project-governance] ok ${markdownFiles.length} governed Markdown files`);
}
