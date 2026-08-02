import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stateUrl = pathToFileURL(path.join(repoRoot, 'workout/state.js')).href;
const runningSessionUrl = pathToFileURL(path.join(repoRoot, 'workout/running-session.js')).href;
const realSaveUrl = pathToFileURL(path.join(repoRoot, 'workout/save.js')).href;
const runningSessionJs = readFileSync(new URL('../workout/running-session.js', import.meta.url), 'utf8');

// 러닝 화면을 여는 것과 러닝을 시작하는 것은 다른 행동이다. 화면만 열었을 때
// GPS 구독이 생기면 사용자가 시작을 누르지 않아도 러닝이 기록된다.
async function runManualStartHarness() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-running-manual-start-'));
  const stubSavePath = path.join(tempDir, 'stub-save.js');
  const htmlPath = path.join(tempDir, 'harness.html');
  try {
    await writeFile(stubSavePath, `export async function saveWorkoutDay() {
  window.__qaSaves = (window.__qaSaves || 0) + 1;
  return true;
}
`, 'utf8');

    const imports = { [realSaveUrl]: pathToFileURL(stubSavePath).href };
    await writeFile(htmlPath, `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({ imports })}</script></head>
<body><div id="wt-running-session-root"></div>
<script type="module">
try {
  window.showToast = () => {};
  window.__watchCalls = 0;
  window.__clearCalls = 0;
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      watchPosition() { window.__watchCalls += 1; return 7; },
      clearWatch() { window.__clearCalls += 1; },
      getCurrentPosition() {},
    },
    configurable: true,
  });

  const state = await import(${JSON.stringify(stateUrl)});
  const running = await import(${JSON.stringify(runningSessionUrl)});
  state.S.shared.date = { y: 2026, m: 6, d: 27 };

  running.wtOpenRunningSession();
  const root = document.getElementById('wt-running-session-root');
  const readAfterOpen = {
    watchCalls: window.__watchCalls,
    screen: root.querySelector('[data-running-screen]')?.getAttribute('data-running-screen') || '',
    startButtons: root.querySelectorAll('[data-running-action="start"]').length,
    pauseButtons: root.querySelectorAll('[data-running-action="pause"]').length,
    stateText: root.querySelector('.wt-running-live-state')?.textContent?.trim() || '',
  };

  root.querySelector('[data-running-action="start"]')?.click();
  await new Promise(resolve => setTimeout(resolve, 60));
  const readAfterStart = {
    watchCalls: window.__watchCalls,
    screen: root.querySelector('[data-running-screen]')?.getAttribute('data-running-screen') || '',
    pauseButtons: root.querySelectorAll('[data-running-action="pause"]').length,
    startButtons: root.querySelectorAll('[data-running-action="start"]').length,
  };

  window.__qaResult = { readAfterOpen, readAfterStart };
} catch (error) {
  window.__qaError = String(error && error.stack || error);
}
</script></body></html>`, 'utf8');

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--allow-file-access-from-files'],
    });
    try {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__qaResult || window.__qaError, { timeout: 15000 });
      const harnessError = await page.evaluate(() => window.__qaError || null);
      assert.equal(harnessError, null, `harness failed: ${harnessError}`);
      assert.deepEqual(pageErrors, []);
      return await page.evaluate(() => window.__qaResult);
    } finally {
      await browser.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('opening the running screen does not start GPS by itself', { timeout: 40000 }, async () => {
  const result = await runManualStartHarness();

  // 화면만 열었을 때: 위치 구독 없음, 시작 버튼만 보인다.
  assert.equal(result.readAfterOpen.watchCalls, 0);
  assert.equal(result.readAfterOpen.screen, 'ready');
  assert.equal(result.readAfterOpen.startButtons, 1);
  assert.equal(result.readAfterOpen.pauseButtons, 0);
  assert.equal(result.readAfterOpen.stateText, '시작 전');

  // 사용자가 시작을 누른 뒤에만 GPS가 켜지고 진행 화면으로 바뀐다.
  assert.equal(result.readAfterStart.watchCalls, 1);
  assert.equal(result.readAfterStart.screen, 'progress');
  assert.equal(result.readAfterStart.pauseButtons, 1);
  assert.equal(result.readAfterStart.startButtons, 0);
});

test('the running screen keeps one slot per run instead of always writing the first', () => {
  // 화면 진입이 곧 시작이던 흔적이 남아 있으면 안 된다.
  const openFn = runningSessionJs.slice(
    runningSessionJs.indexOf('export function wtOpenRunningSession'),
    runningSessionJs.indexOf('export function wtRestoreRunningSessionIfActive'),
  );
  assert.match(openFn, /_session\.phase = 'start';/);
  // 주석의 설명이 아니라 실제 호출문이 없어야 한다.
  assert.doesNotMatch(openFn, /^\s*_startRun\(\);/mu);

  // 저장 칸은 상수가 아니라 그 날의 러닝 칸에서 결정된다.
  assert.match(runningSessionJs, /function _resolveRunningSessionIndex\(\)/);
  assert.match(runningSessionJs, /findRunningSessionIndex\(sessions, \(session\) =>/);
  assert.match(runningSessionJs, /_session\.sessionIndex = _resolveRunningSessionIndex\(\)/);
  assert.match(runningSessionJs, /sessionIndex: _resolveRunningSessionIndex\(\)/);
  // 데이터 파사드는 지연 로드해야 러닝 모듈이 단독으로도 뜬다.
  assert.doesNotMatch(runningSessionJs, /^import \{ getDay \}/mu);
  assert.match(runningSessionJs, /import\('\.\.\/data\.js'\)/);
});

test('a new run takes the next free running slot and never overwrites an earlier one', async () => {
  const { getWorkoutSessions } = await import('../workout/sessions.js');
  const { findRunningSessionIndex } = await import('../workout/running-model.js');

  // running-session._resolveRunningSessionIndex와 같은 규칙.
  const resolve = (day, startedAt) => findRunningSessionIndex(
    getWorkoutSessions(day),
    (session) => Number.isFinite(startedAt) && startedAt > 0 && Number(session?.runStartedAt) === startedAt,
  );
  const run = (km, startedAt) => ({
    exercises: [],
    running: true,
    runDistance: km,
    runDurationMin: 30,
    runStartedAt: startedAt,
    runEndedAt: startedAt + 1_800_000,
  });
  const gym = { exercises: [{ exerciseId: 'bench', sets: [{ kg: 60, reps: 10, done: true }] }] };

  const noRun = { workoutSessions: [gym, { exercises: [] }] };
  assert.equal(resolve(noRun, 1_785_000_000_000), 2);

  const oneRun = { workoutSessions: [gym, { exercises: [] }, run(3, 1_785_000_000_000)] };
  assert.equal(resolve(oneRun, 1_785_009_999_999), 3, 'second run of the day must not reuse the first slot');
  assert.equal(resolve(oneRun, 1_785_000_000_000), 2, 'resuming the same run keeps its slot');

  const twoRuns = {
    workoutSessions: [gym, { exercises: [] }, run(3, 1_785_000_000_000), run(5, 1_785_010_000_000)],
  };
  assert.equal(resolve(twoRuns, 1_785_020_000_000), 4);
  assert.equal(resolve(twoRuns, 1_785_010_000_000), 3);

  // 일 단위로만 남은 옛 기록은 러닝 칸 밖(0번)에 있으므로 건드리지 않는다.
  const legacy = { running: true, runDistance: 4, runStartedAt: 1_785_000_000_000 };
  assert.equal(resolve(legacy, 1_785_030_000_000), 2);
});

test('deleting one running record leaves the other runs of that day intact', async () => {
  const { getWorkoutSessions, upsertWorkoutSession } = await import('../workout/sessions.js');
  const { runningTrackSessionInfo, runningStackSession } = await import('../workout/calendar-running.js');

  const activityRows = (session) => (session?.running || Number(session?.runDistance) > 0 ? [{
    key: 'running',
    label: '러닝',
    distanceKm: Number(session.runDistance) || 0,
    durationSec: (Number(session.runDurationMin) || 0) * 60,
  }] : []);
  const run = (km, startedAt) => ({
    exercises: [],
    running: true,
    runDistance: km,
    runDurationMin: 30,
    runStartedAt: startedAt,
    runEndedAt: startedAt + 1_800_000,
    runRouteRef: { version: 1, routeId: `v1-${startedAt}-abc`, revision: 'abc', pointCount: 10 },
  });
  const day = {
    workoutSessions: [
      { exercises: [{ exerciseId: 'bench', sets: [{ kg: 60, reps: 10, done: true }] }] },
      { exercises: [] },
      run(3, 1_785_000_000_000),
      run(5, 1_785_010_000_000),
    ],
  };

  const info = runningTrackSessionInfo(getWorkoutSessions(day));
  const stack = runningStackSession({ session: info.session, activities: info.runningSessions }, activityRows);
  assert.deepEqual(stack.rows.map(row => row.sessionIndex), [2, 3]);
  assert.deepEqual(stack.rows.map(row => row.distanceKm), [3, 5]);

  // render-calendar._clearWorkoutActivityFields('running')와 같은 패치.
  const RUN_CLEARED = {
    running: false,
    runDistance: 0,
    runDurationMin: 0,
    runDurationSec: 0,
    runMemo: '',
    runSource: 'manual',
    runStartedAt: null,
    runEndedAt: null,
    runRoute: [],
    runRouteRef: null,
    runRouteSummary: null,
    runPlaceSummary: null,
    runAvgPaceSecPerKm: 0,
    runGpsAccuracySummary: null,
  };
  const targetIndex = stack.rows[0].sessionIndex;
  const sessions = getWorkoutSessions(day, { minCount: targetIndex + 1 });
  const result = upsertWorkoutSession(day, { ...sessions[targetIndex], ...RUN_CLEARED }, targetIndex, { now: 1 });

  const afterDay = { ...day, ...result.aggregate, workoutSessions: result.workoutSessions };
  const afterInfo = runningTrackSessionInfo(getWorkoutSessions(afterDay));
  const afterStack = runningStackSession(
    { session: afterInfo.session, activities: afterInfo.runningSessions },
    activityRows,
  );

  assert.deepEqual(afterStack.rows.map(row => row.sessionIndex), [3], 'only the deleted run disappears');
  assert.deepEqual(afterStack.rows.map(row => row.distanceKm), [5]);
  assert.equal(result.aggregate.running, true);
  assert.equal(result.aggregate.runDistance, 5);
  // 헬스 기록도 그대로 남는다.
  assert.equal(result.workoutSessions[0].exercises.length, 1);
});
