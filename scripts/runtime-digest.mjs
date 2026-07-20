import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const RUNTIME_DIGEST_ALGORITHM = 'sha256';
export const RUNTIME_DIGEST_VERSION = 1;

const TEXT_ASSET_EXTENSIONS = new Set([
  '.css',
  '.csv',
  '.htm',
  '.html',
  '.js',
  '.json',
  '.map',
  '.md',
  '.mjs',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);

export function cleanRuntimeAssetPath(asset) {
  const withoutSuffix = String(asset || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .split(/[?#]/, 1)[0];
  const normalized = path.posix.normalize(withoutSuffix || 'index.html');
  if (
    normalized === '..'
    || normalized.startsWith('../')
    || path.posix.isAbsolute(normalized)
    || normalized.includes('\0')
  ) {
    throw new Error(`runtime asset path escapes the project root: ${asset}`);
  }
  return normalized;
}

export function runtimeDigestAssetPaths(runtimeAssets) {
  return [...new Set(
    Array.from(runtimeAssets || [], cleanRuntimeAssetPath)
      .filter(relativePath => relativePath !== 'build-info.json'),
  )].sort();
}

export function isTextRuntimeAsset(relativePath) {
  return TEXT_ASSET_EXTENSIONS.has(path.posix.extname(cleanRuntimeAssetPath(relativePath)).toLowerCase());
}

export function normalizeRuntimeAssetBytes(relativePath, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (!isTextRuntimeAsset(relativePath)) return bytes;
  return Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

function frameLengths(pathLength, contentLength) {
  const frame = Buffer.allocUnsafe(12);
  frame.writeUInt32BE(pathLength, 0);
  frame.writeBigUInt64BE(BigInt(contentLength), 4);
  return frame;
}

export async function computeRuntimeDigest({ runtimeAssets, readAsset }) {
  if (typeof readAsset !== 'function') throw new TypeError('readAsset must be a function');

  const hash = createHash(RUNTIME_DIGEST_ALGORITHM);
  hash.update(`tomatofarm-runtime-digest-v${RUNTIME_DIGEST_VERSION}\0`, 'utf8');

  for (const relativePath of runtimeDigestAssetPaths(runtimeAssets)) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const content = normalizeRuntimeAssetBytes(relativePath, await readAsset(relativePath));
    hash.update(frameLengths(pathBytes.length, content.length));
    hash.update(pathBytes);
    hash.update(content);
  }

  return hash.digest('hex');
}

export function computeRuntimeDigestFromRoot(projectRoot, runtimeAssets) {
  return computeRuntimeDigest({
    runtimeAssets,
    readAsset: relativePath => readFile(path.join(projectRoot, relativePath)),
  });
}
