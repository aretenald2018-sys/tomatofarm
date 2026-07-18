import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const exercisesJs = readFileSync(new URL('../workout/exercises.js', import.meta.url), 'utf8');
const boardRenderJs = readFileSync(new URL('../workout/test-v2/board-render.js', import.meta.url), 'utf8');
const dataJs = readFileSync(new URL('../data/data-api.js', import.meta.url), 'utf8');

function sliceByFirstBrace(source, startToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} should exist`);
  let open = -1;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] !== '{') continue;
    const before = source.slice(start, i);
    if (/\)\s*$/.test(before)) {
      open = i;
      break;
    }
  }
  assert.notEqual(open, -1, `${startToken} should have a body`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${startToken} body should close`);
}

test('Max primary complete buttons set a set done instead of toggling it back off', () => {
  assert.match(exercisesJs, /function _setSetDoneState\(entryIdx, si, nextDone\)/);
  assert.match(exercisesJs, /_setSetDoneState\(idx,\s*target,\s*true\)/);
  assert.match(exercisesJs, /_setSetDoneState\(entryIdx,\s*target,\s*true\)/);
  assert.doesNotMatch(exercisesJs, /wtToggleSetDone\(idx,\s*target\)/);
  assert.doesNotMatch(exercisesJs, /wtToggleSetDone\(entryIdx,\s*target\)/);
});

test('growth board workout commit only shows a stamp after required board persistence succeeds', () => {
  const commit = sliceByFirstBrace(boardRenderJs, 'async function _commitWorkoutCard');
  assert.match(boardRenderJs, /cardCommitting/);
  assert.match(boardRenderJs, /function _isCompletionStamped/);
  assert.match(boardRenderJs, /async function _persistRequired/);
  assert.match(commit, /_persistRequired\('완료 도장 저장 실패/);
  assert.doesNotMatch(commit, /await _persist\(\)/);
});

test('test board saving preserves existing completion logs and propagates failures', () => {
  const save = sliceByFirstBrace(dataJs, 'export async function saveTestBoardV2');
  assert.match(dataJs, /import \{ mergeBoardCompletionLogs \} from '\.\.\/workout\/test-v2\/board-core\.js'/);
  assert.match(save, /runTransaction\(db, async \(transaction\) =>/);
  assert.match(save, /transaction\.get\(activeRef\)/);
  assert.match(save, /mergeBoardCompletionLogs\(latestBoard, normalizedBoard\)/);
  assert.match(save, /transaction\.set\(activeRef, \{ value: nextBoard \}\)/);
  assert.match(save, /rethrow:\s*true/);
});
