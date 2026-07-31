import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

// 성장 보드 웬들러 카드의 세트 입력 보존 계약:
//  (1) 타이핑 즉시(input 이벤트) 상태에 드래프트가 커밋되어, change(블러) 전에
//      카드가 리렌더되거나 시트가 닫혀도 입력값이 사라지지 않는다.
//  (2) 세트 완료 ✓ 토글은 카드 innerHTML 리빌드 없이 행을 제자리 패치한다
//      (깜빡임·포커스/키보드 소실 방지).
//  (3) 입력 키보드를 닫으려는 백드롭 탭(직전에 세트 입력 블러)은 시트를 닫지 않는다.
const boardRenderJs = readFileSync(new URL('../workout/test-v2/board-render.js', import.meta.url), 'utf8');
const exercisesJs = readFileSync(new URL('../workout/exercises.js', import.meta.url), 'utf8');

function extractFunctionSource(source, name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const normalStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : normalStart;
  assert.ok(start >= 0, `${name} should exist`);
  const signatureEnd = source.indexOf(') {', start);
  const braceStart = signatureEnd >= 0 ? signatureEnd + 2 : source.indexOf('{', start);
  assert.ok(braceStart > start, `${name} body should start`);
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

test('board sheet wiring: input draft commit, focusout stamp, backdrop guard stay in place', () => {
  assert.match(boardRenderJs, /sh\.addEventListener\('input', _onSheetInput\)/);
  assert.match(boardRenderJs, /sh\.addEventListener\('change', _onSheetChange\)/);
  assert.match(boardRenderJs, /_sheetSetInputBlurAt = Date\.now\(\)/);
  assert.match(boardRenderJs, /Date\.now\(\) - _sheetSetInputBlurAt < 400/);
  // ✓ 토글은 제자리 패치를 우선하고, 행이 없을 때만 풀 렌더로 폴백한다.
  const toggle = extractFunctionSource(boardRenderJs, '_toggleWendlerSet');
  assert.match(toggle, /_patchWendlerSetRowDone\(idx, done\)/);
  assert.match(toggle, /if \(!_patchWendlerSetRowDone\(idx, done\)\) _rerenderWendlerCardHost\(\)/);
});

test('workout tab set done toggle patches in place and only falls back for structural RPE renders', () => {
  const setDone = extractFunctionSource(exercisesJs, '_setSetDoneState');
  assert.match(setDone, /_workoutSetDoneToggleNeedsRender\(entryIdx, si\)/);
  assert.match(setDone, /_syncWorkoutSetPresentation\(entryIdx, si\);/);
  assert.match(setDone, /_syncWorkoutEntryDerivedPresentation\(entryIdx\);/);
  const needsRender = extractFunctionSource(exercisesJs, '_workoutSetDoneToggleNeedsRender');
  assert.match(needsRender, /if \(!rows\.length\) return true;/);
  assert.match(needsRender, /!row\.classList\.contains\('ex-max-v2-set'\) && !row\.querySelector\('\.set-rpe-select'\)/);
});

async function runBoardSheetHarness() {
  const harnessSource = [
    '_applySheetSetField',
    '_onSheetInput',
    '_onSheetChange',
    '_patchWendlerSetRowDone',
    '_toggleWendlerSet',
    '_ensureRoots',
  ].map(name => extractFunctionSource(boardRenderJs, name)).join('\n\n');

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.setContent(`<!doctype html>
      <html lang="ko">
        <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body>
          <script>
            // board-render.js 모듈 상태/의존 스텁 — 추출된 실제 핸들러가 그대로 돈다.
            var _sheetSetInputBlurAt = 0;
            var WS = { workout: { exercises: [{
              sets: [
                { kg: 60, reps: 8, done: false },
                { kg: 60, reps: 8, done: false },
              ],
            }] } };
            var S = { card: { entryIdx: 0 } };
            window.__closeCalls = 0;
            window.__fullRerenders = 0;
            window.__saveCalls = 0;
            function closeSheet() { window.__closeCalls += 1; }
            function _onAction() {}
            function _stampCurrentWendlerMeta() {}
            function _saveWorkoutDraft() { window.__saveCalls += 1; }
            function _rowHtml(si) {
              var set = WS.workout.exercises[0].sets[si];
              return '<div class="tm2-wset-row' + (set.done ? ' tm2-done' : '') + '">' +
                '<button type="button" data-action="tm2:wset-done" data-si="' + si + '" class="tm2-wset-check' + (set.done ? ' tm2-on' : '') + '"></button>' +
                '<input data-tm2-wset-field="kg" data-si="' + si + '" value="' + (set.kg ?? '') + '">' +
                '<input data-tm2-wset-field="reps" data-si="' + si + '" value="' + (set.reps ?? '') + '">' +
                '</div>';
            }
            function _renderHost() {
              document.getElementById('tm2-card-host').innerHTML = _rowHtml(0) + _rowHtml(1);
            }
            function _rerenderWendlerCardHost() {
              window.__fullRerenders += 1;
              _renderHost();
            }
            ${harnessSource}
            _ensureRoots();
            var sh = document.getElementById('tm2-sheets');
            sh.innerHTML = '<div class="tm2-sheet"><div id="tm2-card-host"></div></div>';
            _renderHost();
          </script>
        </body>
      </html>`);

    const result = await page.evaluate(async () => {
      const out = {};
      const kgInput = document.querySelector('[data-tm2-wset-field="kg"][data-si="0"]');

      // (1) 타이핑(입력 이벤트)만으로 상태에 드래프트가 커밋된다.
      kgInput.value = '82.5';
      kgInput.dispatchEvent(new Event('input', { bubbles: true }));
      out.draftKg = WS.workout.exercises[0].sets[0].kg;

      // change(블러) 없이 카드 전체가 리렌더돼도 입력값이 살아 있다.
      _rerenderWendlerCardHost();
      out.kgAfterFullRerender = document.querySelector('[data-tm2-wset-field="kg"][data-si="0"]').value;

      // (2) ✓ 토글은 행 제자리 패치 — 입력 노드가 교체되지 않고 값이 유지된다.
      const rerendersBeforeToggle = window.__fullRerenders;
      const kgNode = document.querySelector('[data-tm2-wset-field="kg"][data-si="0"]');
      kgNode.value = '85';
      kgNode.dispatchEvent(new Event('input', { bubbles: true }));
      kgNode.__marker = 'same-node';
      _toggleWendlerSet(1);
      const kgNodeAfter = document.querySelector('[data-tm2-wset-field="kg"][data-si="0"]');
      out.sameNodeAfterToggle = kgNodeAfter.__marker === 'same-node';
      out.kgAfterToggle = kgNodeAfter.value;
      out.fullRerendersDuringToggle = window.__fullRerenders - rerendersBeforeToggle;
      out.set1Done = WS.workout.exercises[0].sets[1].done;
      const row1Check = document.querySelector('[data-action="tm2:wset-done"][data-si="1"]');
      out.row1CheckOn = row1Check.classList.contains('tm2-on');
      out.row1RowDone = !!row1Check.closest('.tm2-wset-row').classList.contains('tm2-done');

      // (3) 세트 입력 블러 직후의 백드롭 탭은 시트를 닫지 않는다 (키보드 닫기 취급).
      const sheetLayer = document.getElementById('tm2-sheets');
      kgNodeAfter.dispatchEvent(new Event('focusout', { bubbles: true }));
      sheetLayer.click();
      out.closedRightAfterBlur = window.__closeCalls;
      await new Promise(resolve => setTimeout(resolve, 450));
      sheetLayer.click();
      out.closedAfterQuietPeriod = window.__closeCalls;
      return out;
    });

    return { result, pageErrors };
  } finally {
    await browser.close();
  }
}

test('board sheet harness: draft survives rerender, toggle patches in place, backdrop tap only closes when idle', async () => {
  const { result, pageErrors } = await runBoardSheetHarness();
  assert.deepEqual(pageErrors, []);
  assert.equal(result.draftKg, 82.5, 'input 이벤트만으로 상태에 커밋되어야 한다');
  assert.equal(result.kgAfterFullRerender, '82.5', '전체 리렌더 후에도 입력값이 유지되어야 한다');
  assert.equal(result.sameNodeAfterToggle, true, '✓ 토글이 입력 노드를 교체하면 안 된다');
  assert.equal(result.kgAfterToggle, '85', '✓ 토글 후 타이핑 중이던 값이 유지되어야 한다');
  assert.equal(result.fullRerendersDuringToggle, 0, '✓ 토글은 카드 전체 리렌더를 유발하면 안 된다');
  assert.equal(result.set1Done, true);
  assert.equal(result.row1CheckOn, true);
  assert.equal(result.row1RowDone, true);
  assert.equal(result.closedRightAfterBlur, 0, '입력 블러 직후 백드롭 탭은 시트를 닫으면 안 된다');
  assert.equal(result.closedAfterQuietPeriod, 1, '입력과 무관한 백드롭 탭은 시트를 닫아야 한다');
});
