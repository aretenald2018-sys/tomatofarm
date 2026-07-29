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

function run(command, args, cwd = root, env = process.env) {
  if (process.platform === 'win32') {
    const quote = value => {
      const text = String(value);
      return /[\s&|<>^()]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    // 이 체크아웃 경로에는 공백이 있어 gradlew.bat 가 반드시 인용된다. Node 는
    // 인용부호가 든 인자를 `\"` 로 escape 하는데 cmd.exe 는 그 문법을 모른다.
    // windowsVerbatimArguments 로 escape 를 끄고, cmd 의 `/s` 로 바깥 인용
    // 한 쌍만 벗겨 나머지를 그대로 실행시킨다.
    execFileSync(process.env.ComSpec || 'cmd.exe', [
      '/d',
      '/s',
      '/c',
      `"${[command, ...args].map(quote).join(' ')}"`,
    ], { cwd, env, stdio: 'inherit', windowsVerbatimArguments: true });
    return;
  }
  execFileSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  });
}

// Gradle 은 JAVA_HOME 없이는 아예 시작하지 않는다. 릴리스가 셸 환경 설정에
// 의존하지 않도록, 설정되어 있지 않으면 Android Studio 번들 JDK 를 찾는다.
function resolveJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    'C:\\Program Files\\Android\\Android Studio\\jre',
    'C:\\Program Files\\Android\\Android Studio Preview\\jbr',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'),
  ];
  return candidates.find((candidate) => candidate && existsSync(path.join(candidate, 'bin', 'java.exe'))) || '';
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
const javaHome = resolveJavaHome();
if (!javaHome) {
  throw new Error('JAVA_HOME is not set and no Android Studio JDK was found. Set JAVA_HOME to a JDK 21 installation.');
}
run(gradle, [':app:assembleDebug'], androidRoot, { ...process.env, JAVA_HOME: javaHome });
if (!existsSync(builtApk)) throw new Error(`Android debug APK missing: ${builtApk}`);
cpSync(builtApk, publishedApk);
run(process.execPath, ['scripts/verify-apk-runtime-assets.mjs', '--apk', 'public/downloads/tomato-mobile-debug.apk']);

console.log(`[build-mobile-apk] published ${path.relative(root, publishedApk)}`);
