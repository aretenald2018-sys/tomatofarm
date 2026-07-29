import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

// ================================================================
// tests/logged-in-browser-flows.test.js
// 로그인 상태에서만 도달하는 화면 흐름을 "진짜 렌더 경로"로 돌린다.
//   1) 달력 하루 시트를 render-calendar.js로 그린 뒤 kg/횟수 칸을 눌러 포커스
//   2) 커스텀 세트 키패드로 숫자를 넣고 필드를 옮길 때 행이 다시 그려지지 않는지
//   3) feature-nutrition.js의 실제 검색 렌더로 공공DB/브랜드 섹션이 나오는지
//
// 프로덕션 Firebase는 절대 건드리지 않는다. data.js는 6줄 배럴이고 Firebase를
// 만지는 경로는 전부 이 배럴을 지나므로, importmap으로 data.js만
// tests/helpers/fake-data-layer.js로 바꾸면 데이터 레이어가 통째로 교체된다.
// data/data-core.js가 import되지 않으니 initializeApp 자체가 실행되지 않는다.
// 그 위에 file:// 이외의 모든 요청을 가로채 막고, 실제로 한 건도 없었음을
// 테스트에서 단언한다.
// ================================================================

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repoUrl(relativePath) {
  return pathToFileURL(path.join(repoRoot, relativePath)).href;
}

async function writeStub(tempDir, name, source) {
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, source, 'utf8');
  return pathToFileURL(filePath).href;
}

const FAKE_DATA_URL = repoUrl('tests/helpers/fake-data-layer.js');

// 로그인 게이트는 Firebase Auth가 아니라 localStorage('currentUser')다.
// 모듈이 뜨기 전에 심어야 앱이 로그인 상태로 동작한다.
const SIGNED_IN_USER = { id: 'harness-user', name: 'QA 사용자', isAuthenticated: true };

async function launchHarness(htmlPath) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  try {
    return await bootstrapHarness(browser, htmlPath);
  } catch (error) {
    // 부트스트랩이 실패하면 호출자에게 browser 핸들이 없어 닫지 못한다.
    // 여기서 닫지 않으면 node --test가 영원히 끝나지 않는다.
    await browser.close().catch(() => {});
    throw error;
  }
}

async function bootstrapHarness(browser, htmlPath) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleWarnings = [];
  const blockedRequests = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') consoleWarnings.push(message.text());
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('file://') || request.url() === 'about:blank') {
      request.continue().catch(() => {});
      return;
    }
    blockedRequests.push(request.url());
    request.abort().catch(() => {});
  });
  await page.evaluateOnNewDocument((user) => {
    try { window.localStorage.setItem('currentUser', JSON.stringify(user)); } catch { /* file:// 오리진 제한 */ }
  }, SIGNED_IN_USER);
  await page.setViewport({ width: 390, height: 1400, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__qaReady === true || window.__qaError, { timeout: 20000 });
  const setupError = await page.evaluate(() => window.__qaError || null);
  assert.equal(setupError, null, `harness bootstrap failed: ${setupError}`);
  return { browser, page, pageErrors, consoleWarnings, blockedRequests };
}

async function writeHarnessHtml(htmlPath, { importMap, body, moduleSource }) {
  await writeFile(htmlPath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script type="importmap">${JSON.stringify(importMap)}</script>
</head>
<body>
${body}
  <script type="module">
    try {
${moduleSource}
      window.__qaReady = true;
    } catch (error) {
      window.__qaError = String(error?.stack || error?.message || error);
    }
  </script>
</body>
</html>`, 'utf8');
}

// 실제 모바일 탭. 커스텀 키패드는 touchstart에서 preventDefault로 포커스를
// 지키기 때문에 마우스 클릭이 아니라 터치로 눌러야 실제 경로를 탄다.
async function tapElement(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  }, selector);
  assert.ok(box, `tap target not found: ${selector}`);
  assert.ok(box.width > 0 && box.height > 0, `tap target has no box: ${selector}`);
  await page.touchscreen.tap(box.x, box.y);
}

function inlineInputSelector(setIndex, field) {
  return `[data-wt-day-sheet] [data-wt-set-inline-input][data-set-index="${setIndex}"][data-field="${field}"]`;
}

function editFieldSelector(setIndex, field) {
  return `[data-wt-day-sheet] [data-wt-set-edit-field="${field}"][data-set-index="${setIndex}"]`;
}

// ── 운동 하루 시트 하네스 ────────────────────────────────────────
async function buildWorkoutSheetHarness(tempDir) {
  const htmlPath = path.join(tempDir, 'workout-day-sheet.html');

  // ai.js는 workout/expert.js → ai/llm-core.js → data/data-functions.js →
  // data/data-core.js로 이어져 Firebase를 초기화한다. 이 흐름과 무관하므로 끊는다.
  // (workout/running-map.js는 진짜를 쓴다. 외부 지도 스크립트는 러닝 카드를
  //  실제로 그릴 때만 붙고, 이 고정 데이터에는 러닝 기록이 없다.)
  const stubAiUrl = await writeStub(tempDir, 'stub-ai.js', `
function unavailable(name) {
  return async () => { throw new Error('harness: ai.js.' + name + ' is not available offline'); };
}
export const parseEquipmentFromText = unavailable('parseEquipmentFromText');
export const parseEquipmentFromImage = unavailable('parseEquipmentFromImage');
export const estimateInOnePass = unavailable('estimateInOnePass');
`);

  const importMap = {
    imports: {
      [repoUrl('data.js')]: FAKE_DATA_URL,
      [repoUrl('ai.js')]: stubAiUrl,
    },
  };

  const moduleSource = `
      const fake = await import(${JSON.stringify(FAKE_DATA_URL)});
      const { S } = await import(${JSON.stringify(repoUrl('workout/state.js'))});
      const keyboard = await import(${JSON.stringify(repoUrl('calendar/set-keyboard.js'))});
      const calendar = await import(${JSON.stringify(repoUrl('render-calendar.js'))});

      const today = fake.TODAY;
      const KEY = fake.dateKey(today.getFullYear(), today.getMonth(), today.getDate());

      window.__qaSheetSavedEvents = 0;
      document.addEventListener('sheet:saved', () => { window.__qaSheetSavedEvents += 1; });

      function seed() {
        fake.resetFakeDataLayer({
          currentUser: ${JSON.stringify(SIGNED_IN_USER)},
          exercises: [
            { id: 'bench-press', name: '벤치프레스', muscleId: 'chest', movementId: 'horizontal-press' },
          ],
          muscleParts: [{ id: 'chest', name: '가슴', color: '#334155' }],
          bodyCheckins: [{ date: KEY, weight: 72 }],
        });
        fake.getCache()[KEY] = {
          workoutSessions: [{
            id: 'session-1',
            label: '1회차',
            exercises: [{
              exerciseId: 'bench-press',
              name: '벤치프레스',
              muscleId: 'chest',
              movementId: 'horizontal-press',
              sets: [
                { kg: 80, reps: 10, rir: 2, romPct: 100, setType: 'main', done: false },
                { kg: 80, reps: 8, rir: 2, romPct: 100, setType: 'main', done: false },
              ],
            }],
          }],
        };
        // S.shared.date를 다른 날로 두어 활성 세션 상태와 얽히지 않게 한다.
        S.shared.date = { y: today.getFullYear(), m: today.getMonth(), d: 1 };
        window.__qaSheetSavedEvents = 0;
      }

      function openDaySheet() {
        calendar.applyWorkoutCalendarNavSnapshot({
          calendar: {
            viewYear: today.getFullYear(),
            viewMonth: today.getMonth(),
            selectedKey: KEY,
            selectedSessionIndex: 0,
            sheetOpen: true,
            sheetState: 'full',
            scrollTop: 0,
            activeTab: 'summary',
          },
        }, { preserveScroll: false });
      }

      function storedSets() {
        const day = fake.getCache()[KEY] || {};
        const session = (day.workoutSessions || [])[0] || {};
        const entry = (session.exercises || [])[0] || {};
        return (entry.sets || []).map(set => ({ kg: set.kg, reps: set.reps, done: set.done === true }));
      }

      function activeSnapshot() {
        const active = document.activeElement;
        const isSetInput = active?.matches?.('[data-wt-set-input]') === true;
        return {
          activeIsSetInput: isSetInput,
          activeField: isSetInput ? active.getAttribute('data-field') : null,
          activeSetIndex: isSetInput ? active.getAttribute('data-set-index') : null,
          activeIsInline: isSetInput ? active.hasAttribute('data-wt-set-inline-input') : false,
          activeValue: isSetInput ? active.value : null,
          keyboardOpen: document.querySelector('[data-wt-set-keyboard]')?.classList.contains('is-open') === true,
          keyboardTracksActive: keyboard.workoutSetKeyboardState.input === active,
          keyboardField: keyboard.workoutSetKeyboardState.input?.getAttribute?.('data-field') ?? null,
          inlineInputCount: document.querySelectorAll('[data-wt-day-sheet] [data-wt-set-inline-input]').length,
          sets: storedSets(),
          sheetSavedEvents: window.__qaSheetSavedEvents,
        };
      }

      window.__qa = {
        key: KEY,
        seed,
        openDaySheet,
        storedSets,
        activeSnapshot,
        savedDayCount: () => fake.fakeDataStore.savedDays.length,
        markRow: (setIndex, token) => {
          const row = document.querySelector('[data-wt-day-sheet] [data-wt-set-swipe-row][data-set-index="' + setIndex + '"]');
          if (!row) return false;
          row.setAttribute('data-qa-row-token', token);
          return true;
        },
        rowToken: (setIndex) => {
          const row = document.querySelector('[data-wt-day-sheet] [data-wt-set-swipe-row][data-set-index="' + setIndex + '"]');
          return row ? row.getAttribute('data-qa-row-token') : null;
        },
        sheetSummary: () => ({
          hasSheet: !!document.querySelector('[data-wt-day-sheet]'),
          sheetState: document.querySelector('[data-wt-day-sheet]')?.getAttribute('data-wt-sheet-state') || null,
          exerciseName: document.querySelector('[data-wt-day-sheet] .wt-max-card-name')?.textContent?.trim() || '',
          setRowCount: document.querySelectorAll('[data-wt-day-sheet] [data-wt-set-swipe-row]').length,
          kgFieldTexts: Array.from(document.querySelectorAll('[data-wt-day-sheet] [data-wt-set-edit-field="kg"]'))
            .map(node => node.textContent.replace(/\\s+/g, '').trim()),
        }),
      };

      seed();
      openDaySheet();
`;

  await writeHarnessHtml(htmlPath, {
    importMap,
    body: `  <main id="workout-calendar-root"></main>
  <div id="wt-workout-timer-bar"></div>
  <button type="button" id="external-blur">시트 밖 버튼</button>`,
    moduleSource,
  });
  return htmlPath;
}

test('workout day sheet renders through render-calendar.js and routes kg/reps taps to the right input', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-logged-in-sheet-'));
  let harness;
  try {
    const htmlPath = await buildWorkoutSheetHarness(tempDir);
    harness = await launchHarness(htmlPath);
    const { page } = harness;

    // 진짜 렌더 경로가 세트 행을 그렸는지부터 확인한다. 여기서 무너지면
    // 아래 상호작용 단언은 전부 공허해진다.
    const summary = await page.evaluate(() => window.__qa.sheetSummary());
    assert.equal(summary.hasSheet, true);
    assert.equal(summary.sheetState, 'full');
    assert.equal(summary.exerciseName, '벤치프레스');
    assert.equal(summary.setRowCount, 2);
    assert.deepEqual(summary.kgFieldTexts, ['80kg', '80kg']);

    // 1세트 무게 칸 탭 → 인라인 입력이 뜨고 그 입력에 포커스가 간다.
    await tapElement(page, editFieldSelector(0, 'kg'));
    await page.waitForSelector(inlineInputSelector(0, 'kg'), { timeout: 5000 });
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      { timeout: 5000 },
      inlineInputSelector(0, 'kg'),
    );
    const afterKgTap = await page.evaluate(() => window.__qa.activeSnapshot());
    assert.equal(afterKgTap.activeIsSetInput, true);
    assert.equal(afterKgTap.activeField, 'kg');
    assert.equal(afterKgTap.activeSetIndex, '0');
    assert.equal(afterKgTap.activeIsInline, true);
    assert.equal(afterKgTap.keyboardOpen, true);
    assert.equal(afterKgTap.keyboardTracksActive, true);

    // 같은 행의 횟수 칸으로 이동 → 포커스가 정확히 그 입력으로 간다.
    await tapElement(page, inlineInputSelector(0, 'reps'));
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      { timeout: 5000 },
      inlineInputSelector(0, 'reps'),
    );
    const afterRepsTap = await page.evaluate(() => window.__qa.activeSnapshot());
    assert.equal(afterRepsTap.activeField, 'reps');
    assert.equal(afterRepsTap.activeSetIndex, '0');
    assert.equal(afterRepsTap.keyboardTracksActive, true);
    assert.equal(afterRepsTap.keyboardField, 'reps');
    // 행이 인라인 모드로 들어가면 무게/횟수가 둘 다 입력으로 마운트된다.
    assert.equal(afterRepsTap.inlineInputCount, 2);

    // 키패드의 ‹ 버튼으로 다시 무게 칸으로. 포커스가 되돌아와야 한다.
    await tapElement(page, '[data-wt-set-keyboard] [data-wt-set-keyboard-action="prev"]');
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      { timeout: 5000 },
      inlineInputSelector(0, 'kg'),
    );
    const afterPrev = await page.evaluate(() => window.__qa.activeSnapshot());
    assert.equal(afterPrev.activeField, 'kg');
    assert.equal(afterPrev.activeSetIndex, '0');
    assert.equal(afterPrev.keyboardTracksActive, true);

    // 시트 밖을 누르면 키패드가 닫히고 행은 읽기 모드로 돌아간다.
    await tapElement(page, '#external-blur');
    await page.waitForFunction(() => !document.querySelector('[data-wt-set-keyboard]'), { timeout: 5000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-wt-day-sheet] [data-wt-set-inline-input]').length === 0,
      { timeout: 5000 },
    );

    // 다른 행(2세트)의 무게 칸 → 그 행만 인라인이 되고 포커스도 그리로 간다.
    await tapElement(page, editFieldSelector(1, 'kg'));
    await page.waitForSelector(inlineInputSelector(1, 'kg'), { timeout: 5000 });
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      { timeout: 5000 },
      inlineInputSelector(1, 'kg'),
    );
    const afterSecondRow = await page.evaluate(() => ({
      ...window.__qa.activeSnapshot(),
      firstRowInline: document.querySelectorAll('[data-wt-day-sheet] [data-wt-set-inline-input][data-set-index="0"]').length,
    }));
    assert.equal(afterSecondRow.activeField, 'kg');
    assert.equal(afterSecondRow.activeSetIndex, '1');
    assert.equal(afterSecondRow.keyboardTracksActive, true);
    assert.equal(afterSecondRow.firstRowInline, 0);

    // 값은 하나도 건드리지 않았으므로 저장이 일어나서는 안 된다.
    assert.deepEqual(afterSecondRow.sets, [
      { kg: 80, reps: 10, done: false },
      { kg: 80, reps: 8, done: false },
    ]);
    assert.equal(await page.evaluate(() => window.__qa.savedDayCount()), 0);

    assert.deepEqual(harness.pageErrors, []);
    assert.deepEqual(harness.blockedRequests, []);
  } finally {
    if (harness?.browser) await harness.browser.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('set keypad commits a dirty value on field switch without rerendering the row or dispatching sheet:saved', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-logged-in-keypad-'));
  let harness;
  try {
    const htmlPath = await buildWorkoutSheetHarness(tempDir);
    harness = await launchHarness(htmlPath);
    const { page } = harness;

    await tapElement(page, editFieldSelector(0, 'kg'));
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      { timeout: 5000 },
      inlineInputSelector(0, 'kg'),
    );

    // 이 행 DOM에 표식을 남긴다. 행이 다시 그려지면 innerHTML이 통째로 바뀌어
    // 표식이 사라지므로, 표식의 생존이 "재렌더 없음"의 사실 확인이 된다.
    assert.equal(await page.evaluate(() => window.__qa.markRow(0, 'row-token-0')), true);

    // 커스텀 키패드로 95 입력 (C → 9 → 5).
    await tapElement(page, '[data-wt-set-keyboard] [data-wt-set-keyboard-action="clear"]');
    await tapElement(page, '[data-wt-set-keyboard] [data-wt-set-keyboard-key="9"]');
    await tapElement(page, '[data-wt-set-keyboard] [data-wt-set-keyboard-key="5"]');
    const typed = await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      return { value: input?.value ?? null, dirty: input?.getAttribute('data-wt-set-keyboard-dirty') };
    }, inlineInputSelector(0, 'kg'));
    assert.equal(typed.value, '95');
    assert.equal(typed.dirty, 'true');
    // 아직 커밋 전이므로 저장도 sheet:saved도 없어야 한다.
    const beforeSwitch = await page.evaluate(() => window.__qa.activeSnapshot());
    assert.deepEqual(beforeSwitch.sets[0], { kg: 80, reps: 10, done: false });
    assert.equal(beforeSwitch.sheetSavedEvents, 0);

    // 같은 행의 횟수 칸으로 이동 = 커밋 시점. 여기서 행이 다시 그려지면
    // 사용자가 보던 입력이 손 밑에서 사라진다.
    await tapElement(page, inlineInputSelector(0, 'reps'));
    await page.waitForFunction(() => window.__qa.storedSets()[0]?.kg === 95, { timeout: 5000 });
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      { timeout: 5000 },
      inlineInputSelector(0, 'reps'),
    );
    // 저장 프라미스가 끝난 뒤에도 sheet:saved가 없어야 한다.
    await page.waitForFunction(() => window.__qa.savedDayCount() >= 1, { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 250));

    const afterCommit = await page.evaluate(() => ({
      ...window.__qa.activeSnapshot(),
      rowToken: window.__qa.rowToken(0),
      kgInputValue: document.querySelector('[data-wt-day-sheet] [data-wt-set-inline-input][data-set-index="0"][data-field="kg"]')?.value ?? null,
    }));
    assert.deepEqual(afterCommit.sets[0], { kg: 95, reps: 10, done: false });
    // render-calendar.js의 domLocked 가드: 키패드가 살아 있는 동안 행은 그대로.
    assert.equal(afterCommit.rowToken, 'row-token-0');
    assert.equal(afterCommit.kgInputValue, '95');
    assert.equal(afterCommit.activeField, 'reps');
    assert.equal(afterCommit.activeSetIndex, '0');
    // render-calendar.js의 _workoutSetKeyboardActiveInput() 가드:
    // 포커스가 살아 있는 동안 sheet:saved를 쏘면 앱이 renderAll로 입력을 덮는다.
    assert.equal(afterCommit.sheetSavedEvents, 0);

    // 키패드 ✓로 마무리하면 그때는 정상적으로 렌더/저장 신호가 나가야 한다.
    await tapElement(page, '[data-wt-set-keyboard] [data-wt-set-keyboard-action="done"]');
    await page.waitForFunction(() => window.__qa.storedSets()[0]?.done === true, { timeout: 5000 });
    await page.waitForFunction(() => window.__qaSheetSavedEvents > 0, { timeout: 5000 });
    const afterDone = await page.evaluate(() => ({
      ...window.__qa.activeSnapshot(),
      keyboardMounted: !!document.querySelector('[data-wt-set-keyboard]'),
    }));
    assert.deepEqual(afterDone.sets[0], { kg: 95, reps: 10, done: true });
    assert.equal(afterDone.keyboardMounted, false);
    assert.ok(afterDone.sheetSavedEvents > 0, 'sheet:saved should fire once the keypad is closed');

    assert.deepEqual(harness.pageErrors, []);
    assert.deepEqual(harness.blockedRequests, []);
  } finally {
    if (harness?.browser) await harness.browser.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ── 식단 검색 하네스 ─────────────────────────────────────────────
test('nutrition search renders the public food DB and brand sections through the real feature-nutrition.js', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tomato-logged-in-nutrition-'));
  let harness;
  try {
    const htmlPath = path.join(tempDir, 'nutrition-search.html');

    // 외부 식품 API는 실제로는 네트워크를 탄다. 결과를 고정하고 네트워크를 끊는다.
    const stubFoodApiUrl = await writeStub(tempDir, 'stub-fatsecret-api.js', `
export async function loadCSVDatabase() { return true; }
export function searchCSVFood(query) {
  if (!String(query || '').trim()) return [];
  return [{ id: 'csv-1', name: '닭가슴살 CSV', kcal: 165, protein: 31, fat: 3.6, carbs: 0, unit: '100g' }];
}
export async function searchGovFoodAPI() {
  return [
    { id: 'gov-raw-1', name: '닭가슴살 생것', _grp: '원재료성', energy: 106, protein: 23, fat: 1.1, carbs: 0, source: '식약처' },
    { id: 'gov-meal-1', name: '닭가슴살 구이', _grp: '음식', energy: 165, protein: 31, fat: 3.6, carbs: 0, source: '식약처' },
    { id: 'gov-proc-1', name: '닭가슴살 소시지', _grp: '가공식품', energy: 130, protein: 18, fat: 5, carbs: 3, manufacturer: '공공', source: '식약처' },
  ];
}
export async function searchOpenFoodFacts() {
  return [
    { id: 'brand-1', name: '스팀 닭가슴살 오리지널', brand: '허닭', energy: 110, protein: 24, fat: 1.5, carbs: 0.5, source: 'OpenFoodFacts' },
  ];
}
`);
    const stubModalManagerUrl = await writeStub(tempDir, 'stub-modal-manager.js', `
export async function ensureModal() { return document.getElementById('nutrition-search-modal'); }
export function registerModal() {}
`);
    const stubOverlayUrl = await writeStub(tempDir, 'stub-overlay-stack.js', `
export function openModal(id) { document.getElementById(id)?.classList.add('open'); }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
export function isModalOpen(id) { return document.getElementById(id)?.classList.contains('open') === true; }
`);
    const stubWeightModalUrl = await writeStub(tempDir, 'stub-nutrition-weight-modal.js', `
export function openNutritionWeightModal(item) { window.__qaWeightModalItem = item; }
`);
    const stubItemModalUrl = await writeStub(tempDir, 'stub-nutrition-item-modal.js', `
export async function openNutritionItemEditor() { return null; }
export function switchNutritionTab() {}
`);
    const stubDietFeatureUrl = await writeStub(tempDir, 'stub-diet-feature.js', `
export function addMealFood(meal, food) { window.__qaAddedMealFoods = [...(window.__qaAddedMealFoods || []), { meal, food }]; }
`);

    const importMap = {
      imports: {
        [repoUrl('data.js')]: FAKE_DATA_URL,
        [repoUrl('fatsecret-api.js')]: stubFoodApiUrl,
        [repoUrl('modal-manager.js')]: stubModalManagerUrl,
        [repoUrl('app/overlay-stack.js')]: stubOverlayUrl,
        [repoUrl('modals/nutrition-weight-modal.js')]: stubWeightModalUrl,
        [repoUrl('modals/nutrition-item-modal.js')]: stubItemModalUrl,
        [repoUrl('diet/feature.js')]: stubDietFeatureUrl,
      },
    };

    const moduleSource = `
      const fake = await import(${JSON.stringify(FAKE_DATA_URL)});
      const nutrition = await import(${JSON.stringify(repoUrl('feature-nutrition.js'))});

      fake.resetFakeDataLayer({
        currentUser: ${JSON.stringify(SIGNED_IN_USER)},
        nutritionDB: [
          { id: 'db-1', name: '닭가슴살 스테이크', kcal: 150, protein: 28, fat: 3, carbs: 1, unit: '100g' },
        ],
        recentNutritionItems: [
          { id: 'db-1', name: '닭가슴살 스테이크', kcal: 150, protein: 28, fat: 3, carbs: 1, unit: '100g' },
        ],
      });

      window.__qa = {
        search: async (query) => {
          document.getElementById('nutrition-search-input').value = query;
          await nutrition.renderNutritionSearchResults();
        },
        sectionTitles: () => Array.from(document.querySelectorAll('#nutrition-search-results > div'))
          .map(node => node.textContent.trim())
          .filter(text => text.length > 0 && text.length < 40),
        resultNames: () => Array.from(document.querySelectorAll('#nutrition-search-results .nutrition-result-name'))
          .map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
        placeholderPresent: () => !!document.getElementById('live-food-db-results-placeholder'),
      };
`;

    await writeHarnessHtml(htmlPath, {
      importMap,
      body: `  <div id="nutrition-search-modal" class="open">
    <input id="nutrition-search-input" data-nutrition-input-action="search">
    <div id="nutrition-search-results"></div>
  </div>`,
      moduleSource,
    });

    harness = await launchHarness(htmlPath);
    const { page } = harness;

    await page.evaluate(() => window.__qa.search('닭가슴살'));

    const titles = await page.evaluate(() => window.__qa.sectionTitles());
    const names = await page.evaluate(() => window.__qa.resultNames());

    // 로컬 섹션 (수정 전에도 그려지던 부분)
    assert.ok(titles.some(text => text.includes('DB 검색 결과')), `local DB section missing: ${JSON.stringify(titles)}`);

    // 회귀 대상: 공공DB / 브랜드 섹션. 수정 전에는 renderNutritionSearchResults가
    // else 블록 바깥에서 dbResults/recentFiltered/rawResults/dedupedCsv를 참조해
    // ReferenceError를 냈고, catch가 삼켜서 이 두 섹션이 통째로 사라졌다.
    assert.ok(titles.some(text => text.includes('공공DB 음식')), `공공DB 음식 section missing: ${JSON.stringify(titles)}`);
    assert.ok(titles.some(text => text.includes('공공DB 가공식품')), `공공DB 가공식품 section missing: ${JSON.stringify(titles)}`);
    assert.ok(titles.some(text => text.includes('최신 브랜드 식품')), `브랜드 식품 section missing: ${JSON.stringify(titles)}`);

    assert.ok(names.some(text => text.includes('닭가슴살 구이')), `공공DB item missing: ${JSON.stringify(names)}`);
    assert.ok(names.some(text => text.includes('닭가슴살 소시지')), `공공DB 가공식품 item missing: ${JSON.stringify(names)}`);
    assert.ok(names.some(text => text.includes('스팀 닭가슴살 오리지널')), `브랜드 item missing: ${JSON.stringify(names)}`);

    // 자리표시자는 실제 결과로 교체되어야 한다. 남아 있거나 사라졌는데 섹션이
    // 없으면 catch 경로로 빠진 것이다.
    assert.equal(await page.evaluate(() => window.__qa.placeholderPresent()), false);

    const searchFailureWarnings = harness.consoleWarnings.filter(text => text.includes('[식품DB] 검색 실패'));
    assert.deepEqual(searchFailureWarnings, [], 'nutrition search must not fall into its catch branch');

    assert.deepEqual(harness.pageErrors, []);
    assert.deepEqual(harness.blockedRequests, []);
  } finally {
    if (harness?.browser) await harness.browser.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
