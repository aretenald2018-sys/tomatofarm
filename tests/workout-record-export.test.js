import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const calendarJs = readFileSync(new URL('../render-calendar.js', import.meta.url), 'utf8');

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} should exist`);
  const braceStart = source.indexOf(') {', start) + 2;
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

// 추출 텍스트 조립은 render-calendar의 데이터 계층에 묶여 있지 않은 순수 로직이다.
// 원본 소스를 그대로 떼어와 스텁 위에서 실행한다.
function buildExportApi({ dayBlocks = {} } = {}) {
  const factory = new Function('stubs', `
    const { dayBlocks } = stubs;
    function _parseDateKey(key) {
      const match = String(key || '').match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
      if (!match) return null;
      return { y: +match[1], m: +match[2] - 1, d: +match[3] };
    }
    function _dateTitle(key) { return key; }
    function _shiftDateKey(key, days) {
      const [y, m, d] = key.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + days);
      const pad = n => String(n).padStart(2, '0');
      return \`\${dt.getFullYear()}-\${pad(dt.getMonth() + 1)}-\${pad(dt.getDate())}\`;
    }
    function _buildWorkoutLookup() { return {}; }
    function _sortedCheckins() { return []; }
    function getDietPlan() { return null; }
    function _workoutDayExportBlocks(key) { return dayBlocks[key] || []; }

    ${extractFunctionSource(calendarJs, '_weekKeysFor')}
    ${extractFunctionSource(calendarJs, '_buildWorkoutRecordsExport')}

    return { _weekKeysFor, _buildWorkoutRecordsExport };
  `);
  return factory({ dayBlocks });
}

test('week export spans Monday through Sunday of the selected date', () => {
  const { _weekKeysFor } = buildExportApi();
  // 2026-07-21은 화요일이다.
  assert.deepEqual(_weekKeysFor('2026-07-21'), [
    '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
    '2026-07-24', '2026-07-25', '2026-07-26',
  ]);
  // 일요일은 직전 월요일이 시작이어야 한다.
  assert.equal(_weekKeysFor('2026-07-26')[0], '2026-07-20');
  // 월요일은 자기 자신이 시작이다.
  assert.equal(_weekKeysFor('2026-07-20')[0], '2026-07-20');
  // 월 경계를 넘어가도 7일을 유지한다.
  assert.equal(_weekKeysFor('2026-08-01').length, 7);
  assert.equal(_weekKeysFor('2026-08-01')[0], '2026-07-27');
  assert.deepEqual(_weekKeysFor('not-a-date'), []);
});

test('day export copies only the selected date and skips empty sessions', () => {
  const { _buildWorkoutRecordsExport } = buildExportApi({
    dayBlocks: {
      '2026-07-21': ['[1회차]\n운동시간: 70분', '[러닝]\n운동시간: 30분'],
      '2026-07-22': ['[1회차]\n운동시간: 40분'],
    },
  });

  const day = _buildWorkoutRecordsExport('2026-07-21', 'day');
  assert.equal(day.title, '2026-07-21 운동 기록');
  assert.match(day.text, /^2026-07-21 운동 기록\n\n■ 2026-07-21\n\n\[1회차\]/);
  assert.match(day.text, /\[러닝\]/);
  assert.doesNotMatch(day.text, /2026-07-22/);
});

test('week export joins every recorded day under one heading', () => {
  const { _buildWorkoutRecordsExport } = buildExportApi({
    dayBlocks: {
      '2026-07-20': ['[1회차]\n운동시간: 50분'],
      '2026-07-22': ['[2회차]\n운동시간: 60분'],
    },
  });

  const week = _buildWorkoutRecordsExport('2026-07-21', 'week');
  assert.equal(week.title, '2026-07-20 ~ 2026-07-26 운동 기록');
  assert.match(week.text, /■ 2026-07-20[\s\S]*■ 2026-07-22/);
  // 기록이 없는 날은 헤더도 남기지 않는다.
  assert.doesNotMatch(week.text, /■ 2026-07-21/);
  assert.doesNotMatch(week.text, /■ 2026-07-23/);
});

test('export returns nothing when the range has no records', () => {
  const { _buildWorkoutRecordsExport } = buildExportApi({ dayBlocks: {} });
  assert.equal(_buildWorkoutRecordsExport('2026-07-21', 'day'), null);
  assert.equal(_buildWorkoutRecordsExport('2026-07-21', 'week'), null);
});

test('export writes to the clipboard rather than the share sheet', () => {
  const exportFn = extractFunctionSource(calendarJs, '_exportWorkoutRecords');
  const copyFn = extractFunctionSource(calendarJs, '_copyTextToClipboard');
  assert.match(exportFn, /_copyTextToClipboard\(payload\.text\)/);
  assert.doesNotMatch(exportFn, /navigator\.share|_shareOrCopyText/);
  assert.match(copyFn, /clipboard\?\.writeText/);
  assert.match(copyFn, /document\.execCommand\('copy'\)/);
});
