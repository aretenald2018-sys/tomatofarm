import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { buildWorkoutCardOrderHarnessHtml } from './helpers/workout-card-order-harness.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const baseUrl = process.env.TOMATO_TEST_BASE_URL || pathToFileURL(root).href;
const url = relative => new URL(relative, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).href;

async function openHarness(t) {
  const html = await buildWorkoutCardOrderHarnessHtml(baseUrl);
  const browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files', ...(process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  const blocked = [];
  page.on('pageerror', error => errors.push(String(error.stack || error)));
  await page.setRequestInterception(true);
  const harnessUrl = url('tests/card-order-synthetic.html');
  page.on('request', request => {
    const address = request.url();
    if (address === harnessUrl) return void request.respond({ status: 200, contentType: 'text/html', body: html });
    if (!address.includes('/data/data-core.js') && (address.startsWith(baseUrl) || address.startsWith('data:'))) return void request.continue();
    blocked.push(address); void request.abort();
  });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(harnessUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready || window.__error);
  assert.equal(await page.evaluate(() => window.__error || null), null);
  await page.$eval('#qa-panel', panel => { panel.open = false; });
  t.after(() => { assert.deepEqual(errors, []); assert.deepEqual(blocked, []); });
  return page;
}

const moveButton = (index, direction) => `[data-wt-sheet-card-action="move-exercise-card"][data-exercise-index="${index}"][data-order-direction="${direction}"]`;
async function tap(page, selector) {
  const point = await page.$eval(selector, async element => {
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.touchscreen.tap(point.x, point.y);
}


const rirButton = (exercise = 0, set = 0, direction = 1) => `[data-wt-set-rir-step="${direction}"][data-exercise-index="${exercise}"][data-set-index="${set}"]`;
const clone = value => JSON.parse(JSON.stringify(value));

test('a held RIR pointer survives a save echo after the quiet window and commits on release', { timeout: 30000 }, async t => {
  const page = await openHarness(t);
  const selector = rirButton();
  const point = await page.$eval(selector, button => {
    button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    window.__heldRirButton = button;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await new Promise(resolve => setTimeout(resolve, 650));
  await page.evaluate(() => window.__qa.echo());
  assert.equal(await page.evaluate(() => window.__heldRirButton.isConnected), true);
  await page.mouse.up();
  await page.waitForFunction(() => window.__qa.snapshot().day.workoutSessions[0].exercises[0].sets[0].rir === 2.5);
});

test('RIR touch controls keep mounted nodes and dirty keypad through rapid taps, echoes and reverse acknowledgments', { timeout: 30000 }, async t => {
  const page = await openHarness(t);
  const before = await page.evaluate(() => window.__qa.snapshot());
  await tap(page, '[data-wt-set-edit-field="kg"][data-exercise-index="0"][data-set-index="0"]');
  await page.evaluate(() => {
    const input = document.activeElement;
    input.value = '77.5'; input.dispatchEvent(new Event('input', { bubbles: true }));
    window.__delaySaves = true;
    window.__rirNodes = { input, button: document.querySelector('[data-wt-set-rir-step="1"][data-exercise-index="0"][data-set-index="0"]'), row: input.closest('.wt-max-set-row'), card: input.closest('.wt-day-ex-card') };
  });
  for (let i = 0; i < 3; i += 1) { await tap(page, rirButton()); await page.evaluate(() => window.__qa.echo()); }
  await page.waitForFunction(() => window.__qa.snapshot().acks === 3);
  await page.evaluate(() => { window.__delaySaves = false; window.__qa.acknowledge(); });
  await new Promise(resolve => setTimeout(resolve, 650));
  const after = await page.evaluate(() => ({ ...window.__qa.snapshot(),
    sameInput: window.__rirNodes.input === document.activeElement,
    sameButton: window.__rirNodes.button === document.querySelector('[data-wt-set-rir-step="1"][data-exercise-index="0"][data-set-index="0"]'),
    sameRow: window.__rirNodes.row === document.activeElement.closest('.wt-max-set-row'),
    sameCard: window.__rirNodes.card === document.activeElement.closest('.wt-day-ex-card'),
    dirty: document.activeElement.getAttribute('data-wt-set-keyboard-dirty'),
  }));
  assert.equal(after.sameInput && after.sameButton && after.sameRow && after.sameCard, true);
  assert.equal(after.activeValue, '77.5'); assert.equal(after.dirty, 'true');
  assert.equal(after.day.workoutSessions[0].exercises[0].sets[0].rir, 3.5);
  const expected = clone(before.day.workoutSessions[0].exercises[0]); expected.sets[0].rir = 3.5;
  assert.deepEqual(after.day.workoutSessions[0].exercises[0], expected);
  assert.deepEqual(after.rest, before.rest);
  assert.deepEqual(after.day.restBetweenSets, before.day.restBetweenSets);
});

test('RIR controls preserve zero/missing/decimals, follow moved cards, and fit phone/tablet touch targets', { timeout: 30000 }, async t => {
  const page = await openHarness(t);
  await page.evaluate(() => window.__qa.setRir(0, 0, 2.25));
  await tap(page, rirButton());
  assert.equal((await page.evaluate(() => window.__qa.snapshot())).day.workoutSessions[0].exercises[0].sets[0].rir, 2.75);
  await page.evaluate(() => { window.__delaySaves = true; });
  await tap(page, moveButton(0, 1));
  await page.waitForFunction(() => window.__qa.snapshot().names.join() === 'B,A,C,D');
  await tap(page, rirButton(1));
  await page.waitForFunction(() => window.__qa.snapshot().acks === 2);
  await page.evaluate(() => { window.__delaySaves = false; window.__qa.acknowledge(); });
  const moved = await page.evaluate(() => window.__qa.snapshot());
  assert.equal(moved.day.workoutSessions[0].exercises[1].exerciseId, 'A');
  assert.equal(moved.day.workoutSessions[0].exercises[1].sets[0].rir, 3.25);
  assert.equal(moved.day.workoutSessions[0].exercises[0].sets[0].rir, 2);
  // Seed boundary values on the card the user just moved and is still viewing.
  // Reopening intentionally restores that card; do not race it by scrolling a
  // different, offscreen card into view during fixture setup.
  await page.evaluate(() => { window.__qa.setRir(1, 0, 0); window.__qa.setRir(1, 1, null); });
  assert.equal(await page.$eval(rirButton(1, 0, -1), element => element.disabled), true);
  assert.equal(await page.$eval('[data-wt-set-rir-row][data-exercise-index="1"][data-set-index="1"] output', node => node.textContent), '미입력');
  await tap(page, rirButton(1, 1));
  assert.equal((await page.evaluate(() => window.__qa.snapshot())).day.workoutSessions[0].exercises[1].sets[1].rir, 2.5);
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.__qa.open());
    const sizes = await page.$$eval('[data-wt-set-rir-step]', buttons => buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    assert.ok(sizes.length > 0 && sizes.every(size => size.width >= 44 && size.height >= 44));
    if (process.env.TOMATO_RIR_EVIDENCE_DIR) {
      await mkdir(process.env.TOMATO_RIR_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.TOMATO_RIR_EVIDENCE_DIR, `rir-${width}.png`), fullPage: true });
    }
  }
});
