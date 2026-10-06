import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { getWorkoutSessions } from '../workout/sessions.js';
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

test('real sheet card moves preserve metadata, live rest attachment and keyboard focus', { timeout: 30000 }, async t => {
  const page = await openHarness(t);
  const before = await page.evaluate(() => window.__qa.snapshot());
  const editField = '[data-wt-set-edit-field="kg"][data-exercise-index="0"][data-set-index="1"]';
  if (await page.$(editField)) await tap(page, editField);
  await tap(page, '[data-wt-set-inline-input][data-exercise-index="0"][data-set-index="1"][data-field="kg"]');
  await page.evaluate(() => {
    const input = document.activeElement;
    input.value = '77'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tap(page, moveButton(0, 1));
  await page.waitForFunction(() => window.__qa.snapshot().names.join() === 'B,A,C,D');
  await new Promise(resolve => setTimeout(resolve, 300));
  const after = await page.evaluate(() => window.__qa.snapshot());
  assert.deepEqual(after.activeNames, ['B', 'A', 'C', 'D']);
  assert.equal(after.rest.origin.entryIdx, 1);
  assert.equal(after.rest.startedAt, before.rest.startedAt);
  assert.equal(after.rest.running, true);
  assert.equal(after.day.restBetweenSets[0].entryIdx, 1);
  assert.equal(after.day.workoutSessions[0].exercises[1].sets[1].kg, 77);
  assert.equal(after.day.workoutSessions[0].exercises[1].sets[1].done, false);
  assert.equal(after.activeEntry, '1');
  assert.equal(after.activeField, 'kg');
  assert.equal(after.activeValue, '77');
  assert.equal(after.activeSlide, 1);
  assert.deepEqual(after.day.workoutSessions[1], getWorkoutSessions(before.day)[1]);
  assert.equal(after.day.breakfast, 'untouched');
  const expected = structuredClone(before.day.workoutSessions[0].exercises[0]); expected.sets[1].kg = 77;
  assert.deepEqual(after.day.workoutSessions[0].exercises[1], expected);
  await page.evaluate(() => window.__qa.skipRest());
  await page.waitForFunction(() => window.__qa.snapshot().day.workoutSessions[0].exercises.find(e => e.exerciseId === 'A')?.sets[0].restEndedBy === 'skip', { timeout: 5000 });
  const finalized = await page.evaluate(() => window.__qa.snapshot());
  assert.equal(finalized.day.workoutSessions[0].exercises.find(e => e.exerciseId === 'A').sets[0].restEndedBy, 'skip');
  assert.equal(finalized.day.workoutSessions[0].exercises.find(e => e.exerciseId === 'B').sets[0].restEndedBy, undefined);
  await page.waitForFunction(() => !document.querySelector('[data-wt-rest-live]'));
  const stopped = await page.$eval('[data-wt-rest-summary]', node => node.textContent);
  assert.notEqual(stopped, '—');
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(await page.$eval('[data-wt-rest-summary]', node => node.textContent), stopped);
});

test('superset order moves the group and survives rapid moves with delayed acknowledgments', { timeout: 30000 }, async t => {
  const page = await openHarness(t);
  await page.evaluate(() => { window.__qa.seed(true); window.__delaySaves = true; });
  const before = await page.evaluate(() => window.__qa.snapshot());
  assert.equal(before.cardCount, 3);
  await tap(page, moveButton(0, 1));
  await page.waitForFunction(() => window.__qa.snapshot().names.join() === 'B,A,C,D');
  await tap(page, moveButton(1, 1));
  await page.waitForFunction(() => window.__qa.snapshot().names.join() === 'B,D,A,C');
  await page.waitForFunction(() => window.__qa.snapshot().acks === 2);
  await page.evaluate(() => { window.__delaySaves = false; window.__qa.acknowledge(); });
  await new Promise(resolve => setTimeout(resolve, 300));
  const after = await page.evaluate(() => window.__qa.snapshot());
  assert.deepEqual(after.names, ['B', 'D', 'A', 'C']);
  assert.equal(after.cardCount, 3);
  assert.equal(after.activeSlide, 2);
  assert.equal(after.rest.origin.entryIdx, 2);
  assert.equal(await page.$eval(moveButton(2, 1), button => button.disabled), true);
  assert.deepEqual(after.day.workoutSessions[0].exercises[2], before.day.workoutSessions[0].exercises[0]);
  assert.deepEqual(after.day.workoutSessions[0].exercises[3], before.day.workoutSessions[0].exercises[2]);
  await page.evaluate(() => window.__qa.open());
  assert.deepEqual((await page.evaluate(() => window.__qa.snapshot())).names, after.names);
  for (const [width, height] of [[390, 844], [768, 1024]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await page.evaluate(() => { window.__qa.open(); });
    await new Promise(resolve => setTimeout(resolve, 300));
    const sizes = await page.$$eval('[data-wt-sheet-card-action="move-exercise-card"]', buttons => buttons.map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44));
    if (process.env.TOMATO_CARD_ORDER_EVIDENCE_DIR) {
      await mkdir(process.env.TOMATO_CARD_ORDER_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.TOMATO_CARD_ORDER_EVIDENCE_DIR, `card-order-${width}.png`), fullPage: true });
    }
  }
});
