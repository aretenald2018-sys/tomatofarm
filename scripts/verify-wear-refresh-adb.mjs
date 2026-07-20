import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultEvidenceDir = path.join(root, '.test-results', 'wear-app-refresh-update-install');
const appPackage = 'com.lifestreak.app';
const prefsName = 'tomato_wear_app_refresh.xml';
const prefsPath = `shared_prefs/${prefsName}`;
const marketPackageDefault = 'com.android.vending';
const defaultAppApk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const defaultWearApk = path.join(root, 'android', 'wear', 'build', 'outputs', 'apk', 'debug', 'wear-debug.apk');
const debugBuildCommand = '.\\android\\gradlew.bat -p android :app:assembleDebug :wear:assembleDebug';

function parseArgs(argv) {
  const args = {
    mode: 'probe',
    packageName: appPackage,
    waitMs: 45000,
    pollMs: 2000,
    evidenceDir: defaultEvidenceDir,
    marketPackage: marketPackageDefault,
    appApk: defaultAppApk,
    wearApk: defaultWearApk,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (key === 'mode' && next) args.mode = next;
    if (key === 'phone' && next) args.phone = next;
    if (key === 'watch' && next) args.watch = next;
    if (key === 'package' && next) args.packageName = next;
    if (key === 'wait-ms' && next) args.waitMs = Number(next);
    if (key === 'poll-ms' && next) args.pollMs = Number(next);
    if (key === 'evidence-dir' && next) args.evidenceDir = path.resolve(root, next);
    if (key === 'market-package' && next) args.marketPackage = next;
    if (key === 'app-apk' && next) args.appApk = path.resolve(root, next);
    if (key === 'wear-apk' && next) args.wearApk = path.resolve(root, next);
    if (key === 'help') args.help = true;
    if (next && !next.startsWith('--')) i += 1;
  }
  return args;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-wear-refresh-adb.mjs --mode probe',
    '  node scripts/verify-wear-refresh-adb.mjs --mode install [--phone PHONE_SERIAL --watch WATCH_SERIAL]',
    '  node scripts/verify-wear-refresh-adb.mjs --mode install-watch [--watch WATCH_SERIAL]',
    '  node scripts/verify-wear-refresh-adb.mjs --mode installed [--phone PHONE_SERIAL --watch WATCH_SERIAL]',
    '  node scripts/verify-wear-refresh-adb.mjs --mode missing [--phone PHONE_SERIAL --watch WATCH_SERIAL]',
    '',
    'Modes:',
    '  probe      List attached adb devices and write a blocker/evidence note.',
    '  install    Install existing debug phone/watch APKs onto the selected paired devices.',
    '  install-watch Install the existing debug Wear APK onto one adb-visible watch.',
    '  installed  Wait for a fresh watch SharedPreferences receipt after the phone refresh button is clicked.',
    '  missing    Wait for the Wear Play Store package to become foreground after the phone refresh button is clicked.',
    '',
    'Install mode flow:',
    '  1. Build debug APKs in a normal terminal:',
    `     ${debugBuildCommand}`,
    '  2. Run this script with --mode install. If exactly one phone and one watch are visible to adb, serials are optional.',
    '  3. Re-open the phone app, then run installed mode to verify the refresh ping.',
    '',
    'Watch-only install flow:',
    '  1. Build the Wear debug APK in a normal terminal:',
    `     ${debugBuildCommand}`,
    '  2. Connect the watch with adb pair/connect.',
    '  3. Run this script with --mode install-watch. If exactly one watch is visible to adb, --watch is optional.',
    '',
    'Installed mode flow:',
    '  1. Install the phone APK and the watch APK on a paired phone/watch.',
    '  2. Run this script with --mode installed.',
    '  3. Click the phone app header refresh button while the script is waiting.',
    '',
    'Missing mode flow:',
    '  1. Keep the phone APK installed and remove the watch APK from the paired watch.',
    '  2. Run this script with --mode missing.',
    '  3. Click the phone app header refresh button while the script is waiting.',
  ].join('\n');
}

function adbCandidates() {
  const candidates = [];
  if (process.env.ADB) candidates.push(process.env.ADB);
  candidates.push('adb');
  if (process.env.ANDROID_HOME) {
    candidates.push(path.join(process.env.ANDROID_HOME, 'platform-tools', exeName('adb')));
  }
  if (process.env.ANDROID_SDK_ROOT) {
    candidates.push(path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', exeName('adb')));
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exeName('adb')));
  }
  candidates.push(path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', exeName('adb')));
  return [...new Set(candidates)];
}

function exeName(base) {
  return process.platform === 'win32' ? `${base}.exe` : base;
}

function canRun(command) {
  if (command !== 'adb' && !existsSync(command)) return false;
  const result = spawnSync(command, ['version'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function resolveAdb() {
  return adbCandidates().find(canRun) || null;
}

function runAdb(adb, adbArgs, { serial = null, timeoutMs = 15000, binary = false } = {}) {
  const fullArgs = serial ? ['-s', serial, ...adbArgs] : adbArgs;
  const result = spawnSync(adb, fullArgs, {
    cwd: root,
    encoding: binary ? undefined : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || (binary ? Buffer.alloc(0) : ''),
    stderr: result.stderr || (binary ? Buffer.alloc(0) : ''),
    error: result.error || null,
    command: `adb ${fullArgs.join(' ')}`,
  };
}

function parseDevices(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);
      return { serial, state, details: details.join(' ') };
    });
}

function getprop(adb, serial, propName) {
  const result = runAdb(adb, ['shell', 'getprop', propName], {
    serial,
    timeoutMs: 5000,
  });
  return String(result.stdout || '').trim();
}

function connectedAdbDevices(adb) {
  const result = runAdb(adb, ['devices', '-l']);
  return parseDevices(result.stdout)
    .filter((device) => device.state === 'device')
    .map((device) => ({
      ...device,
      characteristics: getprop(adb, device.serial, 'ro.build.characteristics'),
      model: getprop(adb, device.serial, 'ro.product.model'),
      manufacturer: getprop(adb, device.serial, 'ro.product.manufacturer'),
    }));
}

function classifyDevice(device) {
  const haystack = [
    device.characteristics,
    device.model,
    device.manufacturer,
    device.details,
  ].join(' ').toLowerCase();
  if (haystack.includes('watch') || haystack.includes('wear')) return 'watch';
  if (haystack.includes('phone') || haystack.includes('handset')) return 'phone';
  return 'unknown';
}

function preferredWatchCandidate(watchCandidates) {
  if (watchCandidates.length === 1) return watchCandidates[0];
  const ipSerialCandidates = watchCandidates.filter((device) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(device.serial));
  return ipSerialCandidates.length === 1 ? ipSerialCandidates[0] : null;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function writeEvidence(args, fileName, lines, extraFiles = []) {
  await mkdir(args.evidenceDir, { recursive: true });
  const target = path.join(args.evidenceDir, fileName);
  const body = [
    `generatedAt=${new Date().toISOString()}`,
    `mode=${args.mode}`,
    ...lines,
    ...extraFiles.map((file) => `artifact=${path.relative(root, file).replaceAll(path.sep, '/')}`),
    '',
  ].join('\n');
  await writeFile(target, body, 'utf8');
  return target;
}

function packageInstalled(adb, serial, packageName) {
  const result = runAdb(adb, ['shell', 'pm', 'path', packageName], { serial });
  return result.status === 0 && String(result.stdout).includes(`package:`);
}

function installApk(adb, serial, apkPath) {
  return runAdb(adb, ['install', '-r', apkPath], {
    serial,
    timeoutMs: 120000,
  });
}

function readWatchReceipt(adb, serial, packageName) {
  const result = runAdb(
    adb,
    ['shell', 'run-as', packageName, 'cat', prefsPath],
    { serial, timeoutMs: 10000 },
  );
  const text = String(result.stdout || '');
  const timestamp = Number(text.match(/name="last_received_at"\s+value="(\d+)"/)?.[1] || 0);
  return {
    ok: result.status === 0 && timestamp > 0,
    timestamp,
    text,
    error: String(result.stderr || '').trim(),
    command: result.command,
  };
}

function currentFocus(adb, serial) {
  const result = runAdb(adb, ['shell', 'dumpsys', 'window'], { serial, timeoutMs: 10000 });
  const text = String(result.stdout || '');
  const focus = text
    .split(/\r?\n/)
    .find((line) => /mCurrentFocus|mFocusedApp|topResumedActivity/i.test(line))
    ?.trim() || '';
  return { focus, status: result.status, error: String(result.stderr || '').trim() };
}

async function captureScreenshot(adb, serial, args, name) {
  const result = runAdb(adb, ['exec-out', 'screencap', '-p'], {
    serial,
    timeoutMs: 15000,
    binary: true,
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length === 0) {
    return null;
  }
  await mkdir(args.evidenceDir, { recursive: true });
  const target = path.join(args.evidenceDir, name);
  await writeFile(target, result.stdout);
  return target;
}

function requireSerials(args) {
  const missing = [];
  if (!args.phone) missing.push('--phone PHONE_SERIAL');
  if (!args.watch) missing.push('--watch WATCH_SERIAL');
  return missing;
}

function resolveTargetSerials(adb, args) {
  if (args.phone && args.watch) return { ok: true, lines: [] };

  const devices = connectedAdbDevices(adb);
  const classified = devices.map((device) => ({
    ...device,
    type: classifyDevice(device),
  }));
  const watchCandidates = classified.filter((device) => device.type === 'watch');
  const phoneCandidates = classified.filter((device) => device.type !== 'watch');
  const lines = [
    `adbVisibleDeviceCount=${classified.length}`,
    ...classified.map((device) => (
      `adbDevice=${device.serial} type=${device.type} characteristics=${device.characteristics || 'unknown'} model=${device.model || 'unknown'} manufacturer=${device.manufacturer || 'unknown'}`
    )),
  ];

  if (!args.phone && phoneCandidates.length === 1) {
    args.phone = phoneCandidates[0].serial;
    lines.push(`autoPhone=${args.phone}`);
  }
  if (!args.watch && watchCandidates.length === 1) {
    args.watch = watchCandidates[0].serial;
    lines.push(`autoWatch=${args.watch}`);
  }

  const missing = requireSerials(args);
  if (missing.length) {
    lines.push(`blocker: missing ${missing.join(', ')}.`);
    if (!classified.length) {
      lines.push('blocker: no adb devices are attached. Galaxy Wearable pairing alone is not enough for adb install.');
    } else if (!args.watch) {
      lines.push('blocker: no adb-visible watch was detected. Enable Developer options and Wireless debugging on the watch, then pair/connect it with adb.');
    } else if (!args.phone) {
      lines.push('blocker: no adb-visible phone was detected. Enable USB debugging on the phone and accept the RSA prompt.');
    }
  }
  return { ok: missing.length === 0, lines };
}

function resolveWatchSerial(adb, args) {
  if (args.watch) return { ok: true, lines: [] };

  const devices = connectedAdbDevices(adb);
  const classified = devices.map((device) => ({
    ...device,
    type: classifyDevice(device),
  }));
  const watchCandidates = classified.filter((device) => device.type === 'watch');
  const lines = [
    `adbVisibleDeviceCount=${classified.length}`,
    ...classified.map((device) => (
      `adbDevice=${device.serial} type=${device.type} characteristics=${device.characteristics || 'unknown'} model=${device.model || 'unknown'} manufacturer=${device.manufacturer || 'unknown'}`
    )),
  ];

  const preferredWatch = preferredWatchCandidate(watchCandidates);
  if (preferredWatch) {
    args.watch = preferredWatch.serial;
    lines.push(`autoWatch=${args.watch}`);
  }
  if (!args.watch) {
    lines.push('blocker: missing --watch WATCH_SERIAL.');
    if (!classified.length) {
      lines.push('blocker: no adb devices are attached. Galaxy Wearable pairing alone is not enough for adb install.');
    } else {
      lines.push('blocker: no single adb-visible watch was detected. Enable Wireless debugging on the watch, then adb pair/connect it.');
    }
  }
  return { ok: !!args.watch, lines };
}

async function probe(adb, args) {
  const devices = connectedAdbDevices(adb);
  const lines = [
    `adb=${adb}`,
    `deviceCount=${devices.length}`,
    ...devices.map((device) => (
      `device=${device.serial} type=${classifyDevice(device)} state=${device.state} characteristics=${device.characteristics || 'unknown'} model=${device.model || 'unknown'} ${device.details}`.trim()
    )),
  ];
  if (!devices.length) {
    lines.push('not verified yet: no adb devices are attached.');
  } else {
    lines.push('not verified yet: run install/installed/missing mode. Serials are optional only when exactly one phone and one watch are visible.');
  }
  const evidence = await writeEvidence(args, 'adb-device-probe-latest.txt', lines);
  console.log(lines.join('\n'));
  console.log(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
  return devices.length ? 2 : 2;
}

async function verifyInstalled(adb, args) {
  const targets = resolveTargetSerials(adb, args);
  if (!targets.ok) {
    console.error(targets.lines.join('\n'));
    console.error(usage());
    return 2;
  }

  const phoneInstalled = packageInstalled(adb, args.phone, args.packageName);
  const watchInstalled = packageInstalled(adb, args.watch, args.packageName);
  const before = readWatchReceipt(adb, args.watch, args.packageName);
  const startedAt = Date.now();

  console.log('Click the phone app header refresh button now.');
  console.log(`Waiting ${args.waitMs}ms for a fresh watch receipt...`);

  let latest = before;
  const deadline = Date.now() + args.waitMs;
  while (Date.now() < deadline) {
    sleep(args.pollMs);
    latest = readWatchReceipt(adb, args.watch, args.packageName);
    if (latest.timestamp > before.timestamp) break;
  }

  const passed = phoneInstalled && watchInstalled && latest.timestamp > before.timestamp;
  const lines = [
    `adb=${adb}`,
    `phone=${args.phone}`,
    `watch=${args.watch}`,
    `package=${args.packageName}`,
    `phonePackageInstalled=${phoneInstalled}`,
    `watchPackageInstalled=${watchInstalled}`,
    `previousReceiptAt=${before.timestamp || 0}`,
    `latestReceiptAt=${latest.timestamp || 0}`,
    `startedAt=${startedAt}`,
    ...targets.lines,
    `result=${passed ? 'PASS' : 'not verified yet'}`,
  ];
  if (!phoneInstalled) lines.push('blocker: phone package is not installed.');
  if (!watchInstalled) lines.push('blocker: watch package is not installed.');
  if (watchInstalled && latest.timestamp <= before.timestamp) {
    lines.push('blocker: no fresh /tomato/app/refresh receipt appeared on the watch during the wait window.');
  }
  if (latest.error) lines.push(`receiptReadError=${latest.error}`);

  const evidence = await writeEvidence(args, 'installed-node-adb-verification.txt', lines);
  console.log(lines.join('\n'));
  console.log(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
  return passed ? 0 : 1;
}

async function installPair(adb, args) {
  const targets = resolveTargetSerials(adb, args);
  if (!targets.ok) {
    const lines = [
      `adb=${adb}`,
      ...targets.lines,
      'result=not verified yet',
    ];
    const evidence = await writeEvidence(args, 'wear-pair-install-adb-verification.txt', lines);
    console.error(lines.join('\n'));
    console.error(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
    console.error(usage());
    return 2;
  }

  const appApkExists = existsSync(args.appApk);
  const wearApkExists = existsSync(args.wearApk);
  const lines = [
    `adb=${adb}`,
    `phone=${args.phone}`,
    `watch=${args.watch}`,
    `package=${args.packageName}`,
    `appApk=${path.relative(root, args.appApk).replaceAll(path.sep, '/')}`,
    `wearApk=${path.relative(root, args.wearApk).replaceAll(path.sep, '/')}`,
    ...targets.lines,
    `appApkExists=${appApkExists}`,
    `wearApkExists=${wearApkExists}`,
  ];

  if (!appApkExists || !wearApkExists) {
    lines.push('result=not verified yet');
    lines.push(`buildCommand=${debugBuildCommand}`);
    if (!appApkExists) lines.push('blocker: phone debug APK is missing.');
    if (!wearApkExists) lines.push('blocker: wear debug APK is missing.');
    const evidence = await writeEvidence(args, 'wear-pair-install-adb-verification.txt', lines);
    console.log(lines.join('\n'));
    console.log(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
    return 1;
  }

  const phoneInstall = installApk(adb, args.phone, args.appApk);
  const watchInstall = installApk(adb, args.watch, args.wearApk);
  const phonePackageInstalledAfter = packageInstalled(adb, args.phone, args.packageName);
  const watchPackageInstalledAfter = packageInstalled(adb, args.watch, args.packageName);
  const passed = phoneInstall.status === 0
    && watchInstall.status === 0
    && phonePackageInstalledAfter
    && watchPackageInstalledAfter;

  lines.push(`phoneInstallStatus=${phoneInstall.status}`);
  lines.push(`watchInstallStatus=${watchInstall.status}`);
  if (String(phoneInstall.stdout || '').trim()) lines.push(`phoneInstallStdout=${String(phoneInstall.stdout).trim()}`);
  if (String(phoneInstall.stderr || '').trim()) lines.push(`phoneInstallStderr=${String(phoneInstall.stderr).trim()}`);
  if (String(watchInstall.stdout || '').trim()) lines.push(`watchInstallStdout=${String(watchInstall.stdout).trim()}`);
  if (String(watchInstall.stderr || '').trim()) lines.push(`watchInstallStderr=${String(watchInstall.stderr).trim()}`);
  lines.push(`phonePackageInstalledAfter=${phonePackageInstalledAfter}`);
  lines.push(`watchPackageInstalledAfter=${watchPackageInstalledAfter}`);
  lines.push(`result=${passed ? 'PASS' : 'not verified yet'}`);
  if (!phonePackageInstalledAfter) lines.push('blocker: phone package is not installed after adb install.');
  if (!watchPackageInstalledAfter) lines.push('blocker: watch package is not installed after adb install.');

  const evidence = await writeEvidence(args, 'wear-pair-install-adb-verification.txt', lines);
  console.log(lines.join('\n'));
  console.log(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
  return passed ? 0 : 1;
}

async function installWatch(adb, args) {
  const target = resolveWatchSerial(adb, args);
  const wearApkExists = existsSync(args.wearApk);
  const lines = [
    `adb=${adb}`,
    ...target.lines,
    `watch=${args.watch || 'unknown'}`,
    `package=${args.packageName}`,
    `wearApk=${path.relative(root, args.wearApk).replaceAll(path.sep, '/')}`,
    `wearApkExists=${wearApkExists}`,
  ];

  if (!target.ok || !wearApkExists) {
    lines.push('result=not verified yet');
    if (!wearApkExists) {
      lines.push(`buildCommand=${debugBuildCommand}`);
      lines.push('blocker: wear debug APK is missing.');
    }
    const evidence = await writeEvidence(args, 'wear-watch-install-adb-verification.txt', lines);
    console.error(lines.join('\n'));
    console.error(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
    return 1;
  }

  const watchInstall = installApk(adb, args.watch, args.wearApk);
  const watchPackageInstalledAfter = packageInstalled(adb, args.watch, args.packageName);
  const passed = watchInstall.status === 0 && watchPackageInstalledAfter;
  lines.push(`watchInstallStatus=${watchInstall.status}`);
  if (String(watchInstall.stdout || '').trim()) lines.push(`watchInstallStdout=${String(watchInstall.stdout).trim()}`);
  if (String(watchInstall.stderr || '').trim()) lines.push(`watchInstallStderr=${String(watchInstall.stderr).trim()}`);
  lines.push(`watchPackageInstalledAfter=${watchPackageInstalledAfter}`);
  lines.push(`result=${passed ? 'PASS' : 'not verified yet'}`);
  if (!watchPackageInstalledAfter) lines.push('blocker: watch package is not installed after adb install.');

  const evidence = await writeEvidence(args, 'wear-watch-install-adb-verification.txt', lines);
  console.log(lines.join('\n'));
  console.log(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
  return passed ? 0 : 1;
}

async function verifyMissing(adb, args) {
  const targets = resolveTargetSerials(adb, args);
  if (!targets.ok) {
    console.error(targets.lines.join('\n'));
    console.error(usage());
    return 2;
  }

  const phoneInstalled = packageInstalled(adb, args.phone, args.packageName);
  const watchInstalled = packageInstalled(adb, args.watch, args.packageName);
  const startedAt = Date.now();

  console.log('Click the phone app header refresh button now.');
  console.log(`Waiting ${args.waitMs}ms for ${args.marketPackage} to become foreground on the watch...`);

  let focus = currentFocus(adb, args.watch);
  const deadline = Date.now() + args.waitMs;
  while (Date.now() < deadline) {
    sleep(args.pollMs);
    focus = currentFocus(adb, args.watch);
    if (focus.focus.includes(args.marketPackage)) break;
  }

  const screenshot = await captureScreenshot(
    adb,
    args.watch,
    args,
    `missing-watch-install-prompt-${Date.now()}.png`,
  );
  const passed = phoneInstalled && !watchInstalled && focus.focus.includes(args.marketPackage);
  const lines = [
    `adb=${adb}`,
    `phone=${args.phone}`,
    `watch=${args.watch}`,
    `package=${args.packageName}`,
    `marketPackage=${args.marketPackage}`,
    `phonePackageInstalled=${phoneInstalled}`,
    `watchPackageInstalled=${watchInstalled}`,
    `startedAt=${startedAt}`,
    ...targets.lines,
    `watchFocus=${focus.focus || 'unknown'}`,
    `result=${passed ? 'PASS' : 'not verified yet'}`,
  ];
  if (!phoneInstalled) lines.push('blocker: phone package is not installed.');
  if (watchInstalled) lines.push('blocker: watch package is still installed; remove it before missing-watch QA.');
  if (!focus.focus.includes(args.marketPackage)) {
    lines.push(`blocker: watch foreground did not show ${args.marketPackage} during the wait window.`);
  }
  if (focus.error) lines.push(`focusReadError=${focus.error}`);

  const evidence = await writeEvidence(
    args,
    'missing-watch-install-prompt-adb-verification.txt',
    lines,
    screenshot ? [screenshot] : [],
  );
  console.log(lines.join('\n'));
  console.log(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
  if (screenshot) console.log(`screenshot=${path.relative(root, screenshot).replaceAll(path.sep, '/')}`);
  return passed ? 0 : 1;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const adb = resolveAdb();
if (!adb) {
  const evidence = await writeEvidence(args, 'adb-device-probe-latest.txt', [
    'not verified yet: adb was not found.',
    'Set ADB or install Android SDK platform-tools.',
  ]);
  console.error('adb was not found.');
  console.error(`evidence=${path.relative(root, evidence).replaceAll(path.sep, '/')}`);
  process.exit(2);
}

let status = 2;
if (args.mode === 'probe') status = await probe(adb, args);
else if (args.mode === 'install') status = await installPair(adb, args);
else if (args.mode === 'install-watch') status = await installWatch(adb, args);
else if (args.mode === 'installed') status = await verifyInstalled(adb, args);
else if (args.mode === 'missing') status = await verifyMissing(adb, args);
else {
  console.error(`Unknown mode: ${args.mode}`);
  console.error(usage());
}
process.exit(status);
