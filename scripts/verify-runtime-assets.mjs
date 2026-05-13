import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', 'node_modules', 'www', 'exports', 'android', 'functions/node_modules']);
const sourceExts = new Set(['.js', '.mjs', '.html', '.css', '.yml', '.yaml', '.json']);

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function gitList(args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = rel(full);
    if (entry.isDirectory()) {
      if (!skipDirs.has(relative) && !skipDirs.has(entry.name)) await walk(full, out);
      continue;
    }
    if (sourceExts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function cleanSpec(spec) {
  const raw = String(spec || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (/^(https?:|data:|mailto:|tel:|node:|chrome:|about:)/i.test(raw)) return null;
  const noHash = raw.split('#')[0];
  const noQuery = noHash.split('?')[0];
  return noQuery || null;
}

function resolveSpec(importer, spec) {
  const cleaned = cleanSpec(spec);
  if (!cleaned) return null;
  if (!cleaned.startsWith('.') && !cleaned.startsWith('/')) {
    return null;
  }
  const base = cleaned.startsWith('/')
    ? path.join(root, cleaned.replace(/^\/+/, ''))
    : path.resolve(path.dirname(importer), cleaned);
  if (!base.startsWith(root)) return null;
  return base;
}

function addRef(refs, importer, spec, kind) {
  const target = resolveSpec(importer, spec);
  if (!target) return;
  refs.push({ importer: rel(importer), spec, target: rel(target), kind });
}

function addRootRef(refs, importer, spec, kind) {
  const cleaned = cleanSpec(spec);
  if (!cleaned || cleaned.startsWith('/')) return;
  const target = path.join(root, cleaned.replace(/^\.\//, ''));
  refs.push({ importer: rel(importer), spec, target: rel(target), kind });
}

function stripJsComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function collectJsRefs(text, importer, refs) {
  const src = stripJsComments(text);
  const staticImport = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of src.matchAll(staticImport)) addRef(refs, importer, match[1], 'module');
  for (const match of src.matchAll(dynamicImport)) addRef(refs, importer, match[1], 'dynamic-module');
}

function collectHtmlRefs(text, importer, refs) {
  const htmlAsset = /\b(?:src|href)=["']([^"']+\.(?:js|css)(?:[?#][^"']*)?)["']/g;
  for (const match of text.matchAll(htmlAsset)) addRef(refs, importer, match[1], 'html-asset');
}

function collectCssRefs(text, importer, refs) {
  const cssImport = /@import\s+(?:url\()?["']?([^"')]+)["']?\)?/g;
  for (const match of text.matchAll(cssImport)) addRef(refs, importer, match[1], 'css-import');
}

function collectSwRefs(text, importer, refs) {
  const block = text.match(/const\s+STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/)?.[1] || '';
  for (const match of block.matchAll(/['"]([^'"]+)['"]/g)) addRef(refs, importer, match[1], 'sw-static-asset');
}

function collectCommandRefs(text, importer, refs) {
  const commandFile = /\b(?:node|bash)\s+([A-Za-z0-9_./-]+\.(?:js|mjs|sh))/g;
  for (const match of text.matchAll(commandFile)) {
    const spec = match[1].startsWith('.') ? match[1] : `./${match[1]}`;
    addRootRef(refs, importer, spec, 'command-file');
  }
}

const files = await walk(root);
const refs = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const ext = path.extname(file);
  if (ext === '.js' || ext === '.mjs') collectJsRefs(text, file, refs);
  if (ext === '.html') collectHtmlRefs(text, file, refs);
  if (ext === '.css') collectCssRefs(text, file, refs);
  if (rel(file) === 'sw.js') collectSwRefs(text, file, refs);
  if (rel(file).startsWith('.github/')) collectCommandRefs(text, file, refs);
}

const missing = refs.filter((ref) => !existsSync(path.join(root, ref.target)));
const directories = refs.filter((ref) => (
  ref.target !== ''
  && existsSync(path.join(root, ref.target))
  && statSync(path.join(root, ref.target)).isDirectory()
));

const tracked = new Set(gitList(['ls-files']));
const generatedAllowed = new Set(['build-info.json']);
const untrackedRuntime = refs.filter((ref) => (
  existsSync(path.join(root, ref.target))
  && !statSync(path.join(root, ref.target)).isDirectory()
  && !tracked.has(ref.target)
  && !generatedAllowed.has(ref.target)
));

if (missing.length || directories.length) {
  console.error('[runtime-assets] Missing or invalid runtime references:');
  for (const ref of missing) console.error(`  - missing ${ref.target} from ${ref.importer} (${ref.kind}: ${ref.spec})`);
  for (const ref of directories) console.error(`  - directory ${ref.target} from ${ref.importer} (${ref.kind}: ${ref.spec})`);
  process.exit(1);
}

if (untrackedRuntime.length) {
  console.error('[runtime-assets] Runtime references exist locally but are not tracked by git:');
  for (const ref of untrackedRuntime) console.error(`  - ${ref.target} from ${ref.importer} (${ref.kind}: ${ref.spec})`);
  console.error('[runtime-assets] Add these files to the commit, or remove the runtime reference.');
  process.exit(1);
}

console.log(`[runtime-assets] ok refs=${refs.length}`);
