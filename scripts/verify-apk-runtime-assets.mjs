import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import {
  RUNTIME_DIGEST_ALGORITHM,
  RUNTIME_DIGEST_VERSION,
  computeRuntimeDigest,
  computeRuntimeDigestFromRoot,
  normalizeRuntimeAssetBytes,
  runtimeDigestAssetPaths,
} from './runtime-digest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkArgumentIndex = process.argv.indexOf('--apk');
const apkPath = path.resolve(
  root,
  apkArgumentIndex >= 0 && process.argv[apkArgumentIndex + 1]
    ? process.argv[apkArgumentIndex + 1]
    : 'public/downloads/tomato-mobile-debug.apk',
);

if (!existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);

await import(pathToFileURL(path.join(root, 'runtime-assets.js')).href);
const runtimeAssets = globalThis.TOMATO_STATIC_ASSETS || [];

function apkEntry(buffer, entryName) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('APK end of central directory is unreadable');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('APK central directory is unreadable');
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (name === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error(`APK entry header is unreadable: ${entryName}`);
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed;
      if (compressionMethod === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported APK compression method ${compressionMethod}: ${entryName}`);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`APK entry missing: ${entryName}`);
}

function cacheVersion(source) {
  return source.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function validateBuildSourceMetadata(label, buildInfo, failures) {
  if (typeof buildInfo.sourceDirty !== 'boolean') {
    failures.push(`${label} sourceDirty is missing or invalid`);
    return;
  }
  if (!Object.hasOwn(buildInfo, 'sourceBaseCommit')) {
    failures.push(`${label} sourceBaseCommit is missing`);
  }
  if (buildInfo.sourceDirty && buildInfo.commit !== 'local-dirty') {
    failures.push(`${label} dirty source must use commit=local-dirty`);
  }
  if (!buildInfo.sourceDirty && buildInfo.commit !== buildInfo.sourceBaseCommit) {
    failures.push(`${label} clean source commit differs from sourceBaseCommit`);
  }
}

const apk = await readFile(apkPath);
const failures = [];
const runtimeAssetPaths = runtimeDigestAssetPaths(runtimeAssets);
for (const relativePath of runtimeAssetPaths) {
  const sourcePath = path.join(root, relativePath);
  const apkEntryPath = `assets/public/${relativePath}`;
  try {
    const [source, embedded] = await Promise.all([readFile(sourcePath), Promise.resolve(apkEntry(apk, apkEntryPath))]);
    const normalizedSource = normalizeRuntimeAssetBytes(relativePath, source);
    const normalizedEmbedded = normalizeRuntimeAssetBytes(relativePath, embedded);
    if (!normalizedSource.equals(normalizedEmbedded)) failures.push(`${relativePath} differs from ${apkEntryPath}`);
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
  }
}

try {
  const [rootSw, rootBuildInfoText, rootRuntimeDigest, apkRuntimeDigest] = await Promise.all([
    readFile(path.join(root, 'sw.js'), 'utf8'),
    readFile(path.join(root, 'build-info.json'), 'utf8'),
    computeRuntimeDigestFromRoot(root, runtimeAssets),
    computeRuntimeDigest({
      runtimeAssets,
      readAsset: relativePath => apkEntry(apk, `assets/public/${relativePath}`),
    }),
  ]);
  const rootBuildInfo = JSON.parse(rootBuildInfoText);
  const apkBuildInfo = JSON.parse(apkEntry(apk, 'assets/public/build-info.json').toString('utf8'));

  validateBuildSourceMetadata('root build-info.json', rootBuildInfo, failures);
  validateBuildSourceMetadata('APK build-info.json', apkBuildInfo, failures);

  if (rootBuildInfo.runtimeDigest !== rootRuntimeDigest) {
    failures.push('root build-info.json runtimeDigest differs from root runtime assets');
  }
  if (apkBuildInfo.runtimeDigest !== apkRuntimeDigest) {
    failures.push('APK build-info.json runtimeDigest differs from embedded runtime assets');
  }
  if (rootRuntimeDigest !== apkRuntimeDigest) {
    failures.push('root runtimeDigest differs from APK runtimeDigest');
  }
  for (const [label, buildInfo] of [
    ['root build-info.json', rootBuildInfo],
    ['APK build-info.json', apkBuildInfo],
  ]) {
    if (buildInfo.runtimeDigestAlgorithm !== RUNTIME_DIGEST_ALGORITHM) {
      failures.push(`${label} runtimeDigestAlgorithm is invalid`);
    }
    if (buildInfo.runtimeDigestVersion !== RUNTIME_DIGEST_VERSION) {
      failures.push(`${label} runtimeDigestVersion is invalid`);
    }
  }

  if (rootBuildInfo.cacheVersion !== cacheVersion(rootSw)) {
    failures.push('root build-info.json cacheVersion differs from root sw.js');
  }
  if (apkBuildInfo.cacheVersion !== cacheVersion(rootSw)) {
    failures.push('build-info.json cacheVersion differs from root sw.js');
  }
} catch (error) {
  failures.push(`build-info.json: ${error.message}`);
}

if (failures.length) {
  console.error('[apk-runtime-assets] verification failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`[apk-runtime-assets] ok assets=${runtimeAssetPaths.length} apk=${path.relative(root, apkPath)}`);
