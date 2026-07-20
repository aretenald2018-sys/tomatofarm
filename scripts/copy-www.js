// Copy the canonical root runtime into Capacitor's generated www directory.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../runtime-assets.js';
import { cleanRuntimeAssetPath } from './runtime-digest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), '..');

function cleanupTemporaryDirectories({ staging, backup, www, activeError }) {
  const cleanupErrors = [];
  const attempt = (operation) => {
    try {
      operation();
    } catch (error) {
      cleanupErrors.push(error);
    }
  };

  attempt(() => rmSync(staging, { recursive: true, force: true }));
  attempt(() => {
    if (!existsSync(backup)) return;
    if (!existsSync(www)) renameSync(backup, www);
    else rmSync(backup, { recursive: true, force: true });
  });

  if (!cleanupErrors.length) return;
  if (activeError) {
    activeError.cleanupErrors = cleanupErrors;
    return;
  }
  throw cleanupErrors[0];
}

export function copyWww({
  projectRoot = defaultRoot,
  outputDir = join(projectRoot, 'www'),
  runtimeAssets = globalThis.TOMATO_STATIC_ASSETS || [],
} = {}) {
  const www = outputDir;
  const operationId = `${process.pid}-${Date.now()}`;
  const staging = join(projectRoot, `.www-staging-${operationId}`);
  const backup = join(projectRoot, `.www-backup-${operationId}`);
  let activeError = null;

  try {
    rmSync(staging, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });

    // The service worker and Capacitor use the same manifest. The full assets
    // directory and optional root data files are also copied for runtime reads
    // that are intentionally outside service-worker precaching.
    const manifestTargets = runtimeAssets.map(cleanRuntimeAssetPath);
    const rootEntries = readdirSync(projectRoot);
    const extraFiles = rootEntries.filter(file => file.endsWith('.csv') || file === 'food_db.json');
    const targets = [...new Set([
      ...manifestTargets,
      'sw.js',
      'assets',
      ...rootEntries.filter(file => file.startsWith('icon-') && file.endsWith('.png')),
      ...rootEntries.filter(file => file.startsWith('screenshot-') && file.endsWith('.png')),
      ...extraFiles,
    ])];

    let copied = 0;
    for (const name of targets) {
      const source = join(projectRoot, name);
      if (!existsSync(source)) throw new Error(`runtime asset source missing: ${name}`);
      cpSync(source, join(staging, name), { recursive: true });
      copied += 1;
    }

    const missingRuntimeAssets = manifestTargets
      .filter(asset => !existsSync(join(staging, asset)));
    if (missingRuntimeAssets.length) {
      throw new Error(`runtime asset copy incomplete: ${missingRuntimeAssets.join(', ')}`);
    }

    // Swap only after the staging tree is complete. The finally block restores
    // the previous directory if the swap fails between these two renames.
    if (existsSync(www)) renameSync(www, backup);
    renameSync(staging, www);
    rmSync(backup, { recursive: true, force: true });

    console.log(`[copy-www] copied=${copied} runtime-assets=${runtimeAssets.length}`);
    return { copied, runtimeAssetCount: runtimeAssets.length };
  } catch (error) {
    activeError = error;
    throw error;
  } finally {
    cleanupTemporaryDirectories({ staging, backup, www, activeError });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  copyWww();
}
