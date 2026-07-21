import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const androidRoot = path.join(root, 'android');
const localGradle = path.join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const gradle = process.env.TOMATO_GRADLE || (existsSync(localGradle) ? localGradle : '');
const builtApk = path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const publishedApk = path.join(root, 'public', 'downloads', 'tomato-mobile-debug.apk');

function run(command, args, cwd = root) {
  if (process.platform === 'win32') {
    const quote = value => {
      const text = String(value);
      return /[\s&|<>^()]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    execFileSync(process.env.ComSpec || 'cmd.exe', [
      '/d',
      '/c',
      [command, ...args].map(quote).join(' '),
    ], { cwd, stdio: 'inherit' });
    return;
  }
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

// 게시하는 APK는 항상 이전 것보다 versionCode가 커야 안드로이드가 설치본을
// 교체(업데이트)한다. 같은 값으로 다시 올리면 기기에 따라 설치가 거부된다.
function bumpVersionCode() {
  const gradleFile = path.join(androidRoot, 'app', 'build.gradle');
  const source = readFileSync(gradleFile, 'utf8');
  const match = source.match(/versionCode\s+(\d+)/);
  if (!match) throw new Error(`versionCode not found in ${gradleFile}`);
  const next = Number(match[1]) + 1;
  writeFileSync(gradleFile, source.replace(/versionCode\s+\d+/, `versionCode ${next}`));
  console.log(`[build-mobile-apk] versionCode ${match[1]} → ${next}`);
  return next;
}

bumpVersionCode();
run(npm, ['run', 'cap:sync']);
if (!gradle) throw new Error('Android Gradle wrapper is missing. Set TOMATO_GRADLE to a Gradle executable.');
run(gradle, [':app:assembleDebug'], androidRoot);
if (!existsSync(builtApk)) throw new Error(`Android debug APK missing: ${builtApk}`);
cpSync(builtApk, publishedApk);
run(process.execPath, ['scripts/verify-apk-runtime-assets.mjs', '--apk', 'public/downloads/tomato-mobile-debug.apk']);

console.log(`[build-mobile-apk] published ${path.relative(root, publishedApk)}`);
