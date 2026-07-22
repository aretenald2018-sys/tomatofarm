// The "+ 음식 추가" button reported as dead in the APK was only covered by
// source-string assertions, which pass whether or not a click actually reaches
// a handler. These exercise the real router and the real panel binding in a
// browser DOM: before hydration the delegated handler must own the click, after
// hydration the panel must own it, and neither may fire twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const actionRouterJs = readFileSync(new URL('../utils/action-router.js', import.meta.url), 'utf8');
const workoutRenderJs = readFileSync(new URL('../workout/render.js', import.meta.url), 'utf8');

function extractFunctionSource(source, name) {
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `${name} should be exported`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body should end`);
}

function dietAddButtons() {
  const buttons = indexHtml.match(/<button[^>]*data-action="diet:add-food"[^>]*>[^<]*<\/button>/g) || [];
  assert.equal(buttons.length, 4, 'index.html should still ship four meal add buttons');
  return buttons.join('\n');
}

// The frequent-food option is rendered from a template literal, so its
// attribute contract is asserted here and reproduced for the DOM under test.
function frequentFoodButton() {
  assert.match(workoutRenderJs, /data-action="diet:add-frequent-food" data-meal="\$\{meal\}" data-suggestion-key="\$\{_escapeHtml\(key\)\}"/);
  return '<button type="button" class="diet-frequent-food-option" data-action="diet:add-frequent-food" data-meal="lunch" data-suggestion-key="oatmeal">오트밀</button>';
}

function buildHarnessModule() {
  return `
${actionRouterJs}

const __calls = [];
function showToast() {}
async function openNutritionSearch(meal) {
  __calls.push({ via: 'panel', action: 'diet:add-food', meal });
}
function wtAddFrequentFoodSuggestion(meal, suggestionKey) {
  __calls.push({ via: 'panel', action: 'diet:add-frequent-food', meal, suggestionKey });
}

${extractFunctionSource(workoutRenderJs, 'bindDietFoodActions')}

initActionRouter();
registerAction('diet:add-food', (control) => {
  __calls.push({ via: 'router', action: 'diet:add-food', meal: control.dataset.meal });
});
registerAction('diet:add-frequent-food', (control) => {
  __calls.push({ via: 'router', action: 'diet:add-frequent-food', meal: control.dataset.meal, suggestionKey: control.dataset.suggestionKey });
});

window.__diet = {
  calls: __calls,
  bind: bindDietFoodActions,
  reset() { __calls.length = 0; },
};
window.__dietHarnessReady = true;
`;
}

async function runHarness(fn) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.setContent(`<!doctype html><html lang="ko"><body>
      <div id="tab-diet">
        ${dietAddButtons()}
        ${frequentFoodButton()}
      </div>
    </body></html>`);
    await page.addScriptTag({ content: buildHarnessModule(), type: 'module' });
    await page.waitForFunction(() => window.__dietHarnessReady === true, { timeout: 10000 });
    assert.deepEqual(pageErrors, []);
    const result = await fn(page);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    return result;
  } finally {
    await browser.close();
  }
}

// Regression: the router used to return early for every diet add action inside
// #tab-diet. Until the first date hydration ran bindDietFoodActions(), nothing
// owned the button and pressing it did nothing at all.
test('an add-food click before hydration reaches the delegated handler exactly once', async () => {
  const calls = await runHarness(page => page.evaluate(() => {
    document.querySelector('[data-action="diet:add-food"][data-meal="breakfast"]').click();
    return window.__diet.calls;
  }));

  assert.deepEqual(calls, [{ via: 'router', action: 'diet:add-food', meal: 'breakfast' }]);
});

test('a frequent-food click before hydration also reaches the delegated handler', async () => {
  const calls = await runHarness(page => page.evaluate(() => {
    document.querySelector('[data-action="diet:add-frequent-food"]').click();
    return window.__diet.calls;
  }));

  assert.deepEqual(calls, [{
    via: 'router',
    action: 'diet:add-frequent-food',
    meal: 'lunch',
    suggestionKey: 'oatmeal',
  }]);
});

// Some Android WebView clicks report the button's inner text node as the event
// target, and Text has no closest().
test('a click reported on the label text node still opens the food search', async () => {
  const calls = await runHarness(page => page.evaluate(() => {
    const button = document.querySelector('[data-action="diet:add-food"][data-meal="dinner"]');
    button.firstChild.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    return window.__diet.calls;
  }));

  assert.deepEqual(calls, [{ via: 'router', action: 'diet:add-food', meal: 'dinner' }]);
});

test('after hydration the panel owns the click and the router does not double-fire', async () => {
  const calls = await runHarness(page => page.evaluate(() => {
    window.__diet.bind();
    document.querySelector('[data-action="diet:add-food"][data-meal="lunch"]').click();
    document.querySelector('[data-action="diet:add-frequent-food"]').click();
    return window.__diet.calls;
  }));

  assert.deepEqual(calls, [
    { via: 'panel', action: 'diet:add-food', meal: 'lunch' },
    { via: 'panel', action: 'diet:add-frequent-food', meal: 'lunch', suggestionKey: 'oatmeal' },
  ]);
});

// stopPropagation() is the normal guard, but it is exactly what some WebViews
// drop; the handled flag has to stand on its own.
test('the handled flag alone stops the router when the click still bubbles', async () => {
  const calls = await runHarness(page => page.evaluate(() => {
    window.__diet.bind();
    const button = document.querySelector('[data-action="diet:add-food"][data-meal="snack"]');
    const event = new MouseEvent('click', { bubbles: true });
    event.stopPropagation = () => {};
    button.dispatchEvent(event);
    return window.__diet.calls;
  }));

  assert.deepEqual(calls, [{ via: 'panel', action: 'diet:add-food', meal: 'snack' }]);
});

test('hydrating twice does not stack a second panel handler on the same button', async () => {
  const calls = await runHarness(page => page.evaluate(() => {
    window.__diet.bind();
    window.__diet.bind();
    document.querySelector('[data-action="diet:add-food"][data-meal="breakfast"]').click();
    return window.__diet.calls;
  }));

  assert.deepEqual(calls, [{ via: 'panel', action: 'diet:add-food', meal: 'breakfast' }]);
});
