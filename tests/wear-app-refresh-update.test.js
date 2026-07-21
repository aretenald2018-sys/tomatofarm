import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

const root = new URL('../', import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}

function normalizeTextEol(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function gitCheckIgnore(relativePath) {
  return spawnSync('git', ['check-ignore', relativePath], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  });
}

function assertOrder(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} should exist`);
  assert.notEqual(secondIndex, -1, `${second} should exist`);
  assert.ok(firstIndex < secondIndex, message);
}

function cacheVersionFrom(source) {
  const match = source.match(/CACHE_VERSION\s*=\s*'([^']+)'/);
  assert.ok(match, 'CACHE_VERSION should exist');
  return match[1];
}

function readApkEntryText(apkPath, entryName) {
  const buffer = readFileSync(new URL(apkPath, root));
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, 'APK central directory should be readable');
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (name === entryName) {
      assert.equal(buffer.readUInt32LE(localHeaderOffset), 0x04034b50, 'APK local file header should be readable');
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (compressionMethod === 0) return compressed.toString('utf8');
      if (compressionMethod === 8) return inflateRawSync(compressed).toString('utf8');
      assert.fail(`Unsupported APK compression method ${compressionMethod} for ${entryName}`);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  assert.fail(`${entryName} should exist inside ${apkPath}`);
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  assert.fail('APK end of central directory should be readable');
}

test('phone native plugin can refresh installed watches or open watch install prompt', () => {
  const gitignore = readProjectFile('.gitignore');
  const appGradle = readProjectFile('android/app/build.gradle');
  const mainActivity = readProjectFile('android/app/src/main/java/com/lifestreak/app/MainActivity.java');
  const plugin = readProjectFile('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearAppUpdatePlugin.kt');

  assert.match(gitignore, /!android\/app\/src\/main\/java\/com\/lifestreak\/app\/wear\/TomatoWearAppUpdatePlugin\.kt/);
  assert.match(gitignore, /android\/app\/google-services\.json/);
  assert.match(gitignore, /android\/app\/\*\.jks/);
  assert.match(gitignore, /android\/app\/\*\.keystore/);
  assert.match(gitignore, /!android\/wear\/src\/main\/java\/com\/lifestreak\/wear\/workout\/WearAppRefreshListenerService\.kt/);
  assert.match(gitignore, /!android\/wear\/src\/main\/res\/values\/wear\.xml/);
  assert.equal(gitCheckIgnore('android/app/google-services.json').status, 0);
  assert.equal(gitCheckIgnore('android/app/release.jks').status, 0);
  assert.equal(gitCheckIgnore('android/app/upload.keystore').status, 0);
  assert.equal(gitCheckIgnore('android/app/src/main/res/mipmap-hdpi/ic_launcher.png').status, 0);
  assert.equal(gitCheckIgnore('android/wear/src/main/res/layout/page_workout.xml').status, 1);
  assert.equal(gitCheckIgnore('android/app/build.gradle').status, 1);
  assert.equal(gitCheckIgnore('android/app/src/main/java/com/lifestreak/app/MainActivity.java').status, 1);
  assert.equal(gitCheckIgnore('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearAppUpdatePlugin.kt').status, 1);
  assert.equal(gitCheckIgnore('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutBridge.kt').status, 1);
  assert.equal(gitCheckIgnore('android/app/src/main/java/com/lifestreak/app/wear/TomatoWearWorkoutListenerService.kt').status, 1);
  assert.equal(gitCheckIgnore('android/wear/src/main/AndroidManifest.xml').status, 1);
  assert.equal(gitCheckIgnore('android/wear/src/main/java/com/lifestreak/wear/workout/WearAppRefreshListenerService.kt').status, 1);
  assert.equal(gitCheckIgnore('android/wear/src/main/java/com/lifestreak/wear/workout/WearWorkoutUiController.kt').status, 1);
  assert.equal(gitCheckIgnore('android/wear/src/main/res/values/wear.xml').status, 1);
  assert.match(appGradle, /androidx\.wear:wear-remote-interactions:1\.2\.0/);

  assert.match(mainActivity, /import com\.lifestreak\.app\.wear\.TomatoWearAppUpdatePlugin;/);
  assertOrder(
    mainActivity,
    'registerPlugin(TomatoWearAppUpdatePlugin.class);',
    'super.onCreate(savedInstanceState);',
    'Capacitor plugin must be registered before BridgeActivity onCreate',
  );
  assert.match(mainActivity, /TomatoWearWorkoutBridge\.registerActivity\(this\)/);

  assert.match(plugin, /@CapacitorPlugin\(name = "TomatoWearAppUpdate"\)/);
  assert.match(plugin, /@PluginMethod\s+fun requestRefreshOrInstall\(call: PluginCall\)/);
  assert.match(plugin, /CAPABILITY_WEAR_APP\s*=\s*"tomato_farm_wear_app"/);
  assert.match(plugin, /PATH_APP_REFRESH\s*=\s*"\/tomato\/app\/refresh"/);
  assert.match(plugin, /Wearable\.getNodeClient/);
  assert.match(plugin, /Wearable\.getCapabilityClient/);
  assert.match(plugin, /CapabilityClient\.FILTER_REACHABLE/);
  assert.match(plugin, /Wearable\.getMessageClient/);
  assert.match(plugin, /sendMessage\(/);
  assert.match(plugin, /RemoteActivityHelper/);
  assert.match(plugin, /startRemoteActivity\(intent, node\.id\)/);
  assert.match(plugin, /addListener\(/);
  assert.match(plugin, /future\.get\(\)/);
  assert.match(plugin, /market:\/\/details\?id=com\.lifestreak\.app/);
  assert.match(plugin, /connectedNodes/);
  assert.match(plugin, /installedNodes/);
  assert.match(plugin, /installPrompted/);
});

test('wear app advertises capability and receives app refresh pings', () => {
  const wearXml = readProjectFile('android/wear/src/main/res/values/wear.xml');
  const wearManifest = readProjectFile('android/wear/src/main/AndroidManifest.xml');
  const listener = readProjectFile('android/wear/src/main/java/com/lifestreak/wear/workout/WearAppRefreshListenerService.kt');

  assert.match(wearXml, /android_wear_capabilities/);
  assert.match(wearXml, /<item>tomato_farm_wear_app<\/item>/);

  assert.match(wearManifest, /WearAppRefreshListenerService/);
  assert.match(wearManifest, /com\.google\.android\.gms\.wearable\.MESSAGE_RECEIVED/);
  assert.match(wearManifest, /android\.wearable\.MESSAGE_RECEIVED/);
  assert.match(wearManifest, /android:pathPrefix="\/tomato\/app\/refresh"/);

  assert.match(listener, /WearableListenerService/);
  assert.match(listener, /PATH_APP_REFRESH\s*=\s*"\/tomato\/app\/refresh"/);
  assert.match(listener, /onMessageReceived/);
  assert.match(listener, /MAX_PAYLOAD_BYTES\s*=\s*2048/);
  assert.match(listener, /messageEvent\.data\.take\(MAX_PAYLOAD_BYTES\)/);
  assert.match(listener, /getSharedPreferences/);
  assert.doesNotMatch(listener, /WearExerciseService\.startRun|WearWorkoutDataLayer\.sendRunComplete/);
});

test('manual app refresh keeps native Wear bridge while APK button downloads mobile app', () => {
  const buildInfoJs = readProjectFile('utils/build-info.js');
  const appJs = readProjectFile('app.js');
  const gitignore = readProjectFile('.gitignore');
  const swJs = readProjectFile('sw.js') + readProjectFile('runtime-assets.js');

  assert.match(buildInfoJs, /TomatoWearAppUpdate/);
  assert.match(buildInfoJs, /requestRefreshOrInstall/);
  assert.match(buildInfoJs, /WEAR_APP_REFRESH_TIMEOUT_MS/);
  assert.match(buildInfoJs, /_requestWearAppRefreshOrInstall/);
  assert.match(buildInfoJs, /requestTomatoApkInstall/);
  assert.match(buildInfoJs, /__requestTomatoApkInstall/);
  assert.match(buildInfoJs, /_startTomatoApkDownload/);
  assert.match(appJs, /public\/downloads\/tomato-mobile-debug\.apk/);
  assert.doesNotMatch(appJs, /public\/downloads\/tomato-wear-debug\.apk/);
  assert.match(gitignore, /!public\/downloads\/\*\.apk/);
  assert.match(buildInfoJs, /갤럭시워치 설치 화면/);
  assert.match(buildInfoJs, /browser-download/);
  assert.doesNotMatch(buildInfoJs, /Android 앱에서 실행하거나 PC에서/);
  assert.doesNotMatch(appJs, /Android 앱에서 실행하거나 PC에서/);
  assert.equal(existsSync(new URL('../public/downloads/tomato-mobile-debug.apk', import.meta.url)), true);
  assert.equal(existsSync(new URL('../public/downloads/tomato-wear-debug.apk', import.meta.url)), false);
  assertOrder(
    buildInfoJs,
    'await _requestWearAppRefreshOrInstall',
    'const registration = await _resolveLatestAppSWRegistration();',
    'Wear refresh/install request must run before the page reload path',
  );
  assertOrder(
    buildInfoJs,
    'export async function requestTomatoApkInstall',
    'export async function requestTomatoAppRefresh',
    'APK install helper should stay separate from the page reload path',
  );
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});

test('published mobile APK contains current runtime and workout flow assets', () => {
  const rootSw = readProjectFile('sw.js');
  const apkSw = readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/sw.js');
  const apkBuildInfo = JSON.parse(readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/build-info.json'));
  const apkAppJs = readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/app.js');
  const apkWelcomeBackJs = readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/home/welcome-back.js');
  const apkLifeZoneJs = readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/home/life-zone.js');
  const apkStyleCss = readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/styles/features/home-life-zone.css');
  const apkWorkoutExercises = readApkEntryText('public/downloads/tomato-mobile-debug.apk', 'assets/public/workout/exercises.js');
  const workoutAssetPaths = [
    'render-calendar.js',
    'workout/sessions.js',
    'workout/exercises.js',
    'style.css',
    'styles/features/workout-day-sheet.css',
  ];
  const expectedCacheVersion = cacheVersionFrom(rootSw);

  assert.equal(cacheVersionFrom(apkSw), expectedCacheVersion);
  assert.equal(apkBuildInfo.app, 'tomatofarm');
  assert.match(apkBuildInfo.cacheVersion, /^tomatofarm-/);
  assert.equal(apkBuildInfo.cacheVersion, expectedCacheVersion);
  assert.match(apkAppJs, /const APP_BOOT_AUXILIARY_TIMEOUT_MS = 2500;/);
  assert.match(apkAppJs, /void _showPostLoginExperience\(\{ previousLastLoginAt, runningSessionRestored \}\)/);
  assert.match(apkWelcomeBackJs, /const WELCOME_BACK_DATA_TIMEOUT_MS = 2500;/);
  assert.match(apkLifeZoneJs, /LIFE_ZONE_PHOTO_LIKE_REACTION/);
  assert.match(apkLifeZoneJs, /data-lz-photo-like-key/);
  assert.match(apkLifeZoneJs, /toggleLike\(actor\.accountId,\s*_todayLifeZoneKey\(\),\s*actor\.speechLikeField/);
  assert.match(apkStyleCss, /\.lz-speech::after\s*{[\s\S]*clip-path:\s*polygon\(50% 100%, 0 0, 100% 0\)/);
  assert.match(apkStyleCss, /\.lz-speech-photo-btn\s*{[\s\S]*padding:\s*0/);
  assert.match(apkStyleCss, /\.lz-speech--photo \.lz-photo-like-btn\s*{[\s\S]*background:\s*transparent/);
  assert.match(apkStyleCss, /\.lz-speech--photo \.lz-photo-like-btn\s*{[\s\S]*box-shadow:\s*none/);
  assert.match(apkWorkoutExercises, /_pendingWorkoutNumberInputTarget/);
  assert.match(apkWorkoutExercises, /preserveNumberInputNode/);
  assert.match(apkWorkoutExercises, /_syncWorkoutSetPresentation/);
  for (const assetPath of workoutAssetPaths) {
    assert.equal(
      normalizeTextEol(readApkEntryText('public/downloads/tomato-mobile-debug.apk', `assets/public/${assetPath}`)),
      normalizeTextEol(readProjectFile(assetPath)),
      `${assetPath} in the downloadable APK should match the current source`,
    );
  }
});

test('browser APK fallback starts direct download without old warning toast', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const toasts = [];
  const anchors = [];
  let nativeWearBridgeCalls = 0;
  const control = {
    disabled: false,
    attrs: {},
    classToggles: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    classList: {
      toggle(name, value) {
        control.classToggles.push({ name, value });
      },
    },
  };

  globalThis.window = {
    showToast(message, duration, type) {
      toasts.push({ message, duration, type });
    },
    Capacitor: {
      Plugins: {
        TomatoWearAppUpdate: {
          requestRefreshOrInstall() {
            nativeWearBridgeCalls += 1;
            throw new Error('APK install should not invoke Wear bridge');
          },
        },
      },
    },
  };
  globalThis.document = {
    getElementById() {
      return null;
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      const anchor = {
        download: '',
        href: '',
        rel: '',
        style: {},
        clicked: false,
        removed: false,
        click() {
          this.clicked = true;
        },
        remove() {
          this.removed = true;
        },
      };
      anchors.push(anchor);
      return anchor;
    },
    body: {
      appendChild(anchor) {
        anchor.appended = true;
      },
    },
  };

  try {
    const moduleUrl = new URL(`../utils/build-info.js?mobile-apk-download=${Date.now()}`, import.meta.url);
    const { requestTomatoApkInstall } = await import(moduleUrl.href);
    const result = await requestTomatoApkInstall({ control, source: 'test' });

    assert.equal(result.started, true);
    assert.equal(result.reason, 'browser-download');
    assert.match(result.downloadUrl, /\/public\/downloads\/tomato-mobile-debug\.apk$/);
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0].download, 'tomato-mobile-debug.apk');
    assert.equal(anchors[0].clicked, true);
    assert.equal(anchors[0].removed, true);
    assert.equal(toasts.length, 0);
    assert.equal(nativeWearBridgeCalls, 0);
    assert.equal(toasts.some(toast => String(toast.message).includes('Android 앱에서 실행하거나 PC에서')), false);
    assert.equal(control.disabled, false);
    assert.equal(control.attrs['aria-busy'], 'false');
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});

test('local paired install helper can sideload phone and wear debug APKs', () => {
  const packageJson = readProjectFile('package.json');
  const verifier = readProjectFile('scripts/verify-wear-refresh-adb.mjs');

  assert.match(packageJson, /"install:wear-pair":\s*"node scripts\/verify-wear-refresh-adb\.mjs --mode install"/);
  assert.match(packageJson, /"install:wear-watch":\s*"node scripts\/verify-wear-refresh-adb\.mjs --mode install-watch"/);
  assert.match(verifier, /installPair/);
  assert.match(verifier, /installWatch/);
  assert.match(verifier, /resolveTargetSerials/);
  assert.match(verifier, /resolveWatchSerial/);
  assert.match(verifier, /preferredWatchCandidate/);
  assert.match(verifier, /ro\.build\.characteristics/);
  assert.match(verifier, /classifyDevice/);
  assert.match(verifier, /Galaxy Wearable pairing alone is not enough for adb install/);
  assert.match(verifier, /app-debug\.apk/);
  assert.match(verifier, /wear-debug\.apk/);
  assert.match(verifier, /'install', '-r'/);
  assert.match(verifier, /wear-pair-install-adb-verification\.txt/);
  assert.match(verifier, /phonePackageInstalledAfter/);
  assert.match(verifier, /watchPackageInstalledAfter/);
});
