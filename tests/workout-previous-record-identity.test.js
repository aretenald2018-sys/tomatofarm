import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const calendarJs = readFileSync(new URL('../render-calendar.js', import.meta.url), 'utf8');

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should exist`);
  const braceStart = source.indexOf('{', source.indexOf(') {', start));
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body should close`);
}

// '지난 기록' 조회는 데이터 계층에 묶여 있지 않은 순수 매칭 로직이다.
// 원본 소스를 그대로 떼어와 최소 스텁 위에서 실행한다.
function buildPreviousRecordApi(cache = {}) {
  const factory = new Function('stubs', `
    const { cache } = stubs;
    function _num(value) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }
    function _isActualWorkoutSet(set) {
      if (!set || set.setType === 'warmup') return false;
      if (set.done === true) return true;
      if (set.done === false) return false;
      return _num(set.kg) > 0 && _num(set.reps) > 0;
    }
    function _dateDistanceLabel(key) { return key; }
    function _formatSetText(set) { return _num(set.kg) + 'kg×' + _num(set.reps); }
    function calcSetVolume(set) { return _num(set.kg) * _num(set.reps); }
    function getCache() { return cache; }
    function getWorkoutSessions(day) {
      return Array.isArray(day?.workoutSessions) && day.workoutSessions.length
        ? day.workoutSessions
        : [{ exercises: Array.isArray(day?.exercises) ? day.exercises : [] }];
    }
    ${extractFunctionSource(calendarJs, '_workoutEntryName')}
    ${extractFunctionSource(calendarJs, '_workoutEntryMatchesRow')}
    ${extractFunctionSource(calendarJs, '_workoutRecordFromEntry')}
    ${extractFunctionSource(calendarJs, '_previousWorkoutRecordForRow')}
    return { _workoutEntryMatchesRow, _previousWorkoutRecordForRow };
  `);
  return factory({ cache });
}

const ARSENAL = { exerciseId: 'ex_arsenal_fly', movementId: 'chest_fly', name: 'Arsenal 체스트플라이 머신 아스날' };
const MATRIX = { exerciseId: 'ex_matrix_fly', movementId: 'chest_fly', name: 'Matrix 체스트플라이 머신 매트릭스' };

test('same movement on a different machine is not the same exercise', () => {
  const { _workoutEntryMatchesRow } = buildPreviousRecordApi();
  assert.equal(_workoutEntryMatchesRow(MATRIX, ARSENAL), false);
  assert.equal(_workoutEntryMatchesRow(ARSENAL, ARSENAL), true);
  // exerciseId가 없는 레거시 기록은 이름으로 이어붙인다.
  assert.equal(_workoutEntryMatchesRow({ movementId: 'chest_fly', name: ARSENAL.name }, ARSENAL), true);
  assert.equal(_workoutEntryMatchesRow({ movementId: 'chest_fly', name: MATRIX.name }, ARSENAL), false);
  // 이름조차 없는 기록만 movementId 폴백을 쓴다.
  assert.equal(_workoutEntryMatchesRow({ movementId: 'chest_fly' }, ARSENAL), true);
});

test('previous record skips other machines and keeps searching for the same exercise', () => {
  const cache = {
    '2026-07-14': {
      exercises: [{ ...ARSENAL, sets: [{ kg: 18, reps: 15, done: true }, { kg: 18, reps: 15, done: true }] }],
    },
    '2026-07-20': {
      exercises: [{ ...MATRIX, sets: [{ kg: 41, reps: 15, done: true }] }],
    },
    '2026-07-24': {
      exercises: [{ ...ARSENAL, sets: [{ kg: 20, reps: 15, done: true }] }],
    },
  };
  const { _previousWorkoutRecordForRow } = buildPreviousRecordApi(cache);
  const record = _previousWorkoutRecordForRow(cache, { ...ARSENAL, dateKey: '2026-07-24' });
  assert.ok(record, '아스날 플라이의 지난 기록이 있어야 한다');
  assert.equal(record.dateKey, '2026-07-14');
  assert.equal(record.setCount, 2);
  assert.equal(record.topSetText, '18kg×15');
});

test('previous record reads every session of a day, not only the first', () => {
  const cache = {
    '2026-07-20': {
      workoutSessions: [
        { exercises: [{ ...MATRIX, sets: [{ kg: 41, reps: 15, done: true }] }] },
        { exercises: [{ ...ARSENAL, sets: [{ kg: 22, reps: 12, done: true }] }] },
      ],
    },
  };
  const { _previousWorkoutRecordForRow } = buildPreviousRecordApi(cache);
  const record = _previousWorkoutRecordForRow(cache, { ...ARSENAL, dateKey: '2026-07-24' });
  assert.equal(record?.topSetText, '22kg×12');
});

test('no previous record for this machine returns null instead of another machine record', () => {
  const cache = {
    '2026-07-20': {
      exercises: [{ ...MATRIX, sets: [{ kg: 41, reps: 15, done: true }] }],
    },
  };
  const { _previousWorkoutRecordForRow } = buildPreviousRecordApi(cache);
  assert.equal(_previousWorkoutRecordForRow(cache, { ...ARSENAL, dateKey: '2026-07-24' }), null);
});
