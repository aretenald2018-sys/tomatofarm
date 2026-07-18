import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

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

function cleanAssetPath(asset) {
  const value = String(asset || '').replace(/^\.\//, '').split(/[?#]/, 1)[0];
  return value || 'index.html';
}

function cacheVersion(source) {
  return source.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

const apk = await readFile(apkPath);
const failures = [];
for (const asset of runtimeAssets) {
  const relativePath = cleanAssetPath(asset);
  if (relativePath === 'build-info.json') continue;
  const sourcePath = path.join(root, relativePath);
  const apkEntryPath = `assets/public/${relativePath}`;
  try {
    const [source, embedded] = await Promise.all([readFile(sourcePath), Promise.resolve(apkEntry(apk, apkEntryPath))]);
    if (!source.equals(embedded)) failures.push(`${relativePath} differs from ${apkEntryPath}`);
  } catch (error) {
    failures.push(`${relativePath}: ${error.message}`);
  }
}

try {
  const rootSw = await readFile(path.join(root, 'sw.js'), 'utf8');
  const apkBuildInfo = JSON.parse(apkEntry(apk, 'assets/public/build-info.json').toString('utf8'));
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

console.log(`[apk-runtime-assets] ok assets=${runtimeAssets.length} apk=${path.relative(root, apkPath)}`);
