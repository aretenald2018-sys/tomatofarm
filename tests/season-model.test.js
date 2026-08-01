import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addSeasonDays,
  assertSeasonRegistry,
  filterCacheToSeason,
  filterCacheToSeasonExercise,
  findSeasonsForDate,
  normalizeSeason,
  seasonContainsExerciseDate,
  seasonExerciseRange,
  selectSeasonDecisionCache,
  findSeasonForDate,
  seasonStatus,
  startOfSeasonWeek,
  validateSeasonRegistry,
} from '../data/season-model.js';

const REGISTRY = {
  seasons: [
    { id: 'spring', name: '봄 시즌', startDate: '2026-04-01', endDate: '2026-06-30' },
    { id: 'summer', name: '여름 시즌', startDate: '2026-07-01', endDate: '2026-08-31' },
  ],
};

test('시즌 날짜 모델은 UTC 기준 날짜 이동과 월요일 주차를 안정적으로 계산한다', () => {
  assert.equal(addSeasonDays('2026-07-01', -1), '2026-06-30');
  assert.equal(addSeasonDays('2028-02-28', 1), '2028-02-29');
  assert.equal(startOfSeasonWeek('2026-07-19'), '2026-07-13');
  assert.equal(startOfSeasonWeek('2026-07-20'), '2026-07-20');
});

test('의사결정 cache는 현재 시즌만 사용하고 시즌 종료 뒤 자동 진행을 멈춘다', () => {
  const cache = {
    '2026-06-30': { value: 'legacy' },
    '2026-07-01': { value: 'season' },
    '2026-09-01': { value: 'after' },
  };
  const registry = {
    seasons: [{ id: 'summer', name: '여름', startDate: '2026-07-01', endDate: '2026-08-31' }],
  };
  assert.deepEqual(Object.keys(selectSeasonDecisionCache(cache, registry, '2026-07-15')), ['2026-07-01']);
  assert.deepEqual(selectSeasonDecisionCache(cache, registry, '2026-09-01'), {});
  assert.deepEqual(Object.keys(selectSeasonDecisionCache(cache, registry, '2026-06-30')), ['2026-06-30']);
});
test('시즌 레지스트리는 경계일을 포함하고 상태를 날짜에서 파생한다', () => {
  const registry = assertSeasonRegistry(REGISTRY);
  const spring = findSeasonForDate(registry, '2026-06-30');
  const summer = findSeasonForDate(registry, '2026-07-01');
  assert.equal(spring.id, 'spring');
  assert.equal(summer.id, 'summer');
  assert.equal(seasonStatus(spring, '2026-07-15'), 'archived');
  assert.equal(seasonStatus(summer, '2026-07-15'), 'current');
  assert.equal(seasonStatus(summer, '2026-06-15'), 'scheduled');
});

test('시즌 레지스트리는 겹침, 중복 id, 잘못된 날짜를 거부한다', () => {
  const overlap = validateSeasonRegistry({
    seasons: [
      { id: 'one', name: '하나', startDate: '2026-07-01', endDate: '2026-07-31' },
      { id: 'two', name: '둘', startDate: '2026-07-31', endDate: '2026-08-31' },
      { id: 'two', name: '셋', startDate: '2026-09-01', endDate: '2026-09-31' },
    ],
  });
  assert.equal(overlap.valid, false);
  assert.match(overlap.errors.join(' '), /overlap/);
  assert.match(overlap.errors.join(' '), /invalid/);
  assert.throws(() => assertSeasonRegistry({ seasons: overlap.registry.seasons }), /overlap/);
});

test('같은 기간이라도 서로 다른 종목 시즌은 병행하고 같은 종목 겹침은 거부한다', () => {
  const parallel = validateSeasonRegistry({
    seasons: [
      { id: 'bench-season', name: '벤치', startDate: '2026-07-01', endDate: '2026-08-31', exerciseIds: ['bench'] },
      { id: 'squat-season', name: '스쿼트', startDate: '2026-07-01', endDate: '2026-08-31', exerciseIds: ['squat'] },
    ],
  });
  assert.equal(parallel.valid, true);
  assert.equal(findSeasonsForDate(parallel.registry, '2026-07-15', { exerciseId: 'bench' }).map(season => season.id).join(','), 'bench-season');
  assert.equal(findSeasonsForDate(parallel.registry, '2026-07-15', { exerciseId: 'squat' }).map(season => season.id).join(','), 'squat-season');

  const conflict = validateSeasonRegistry({
    seasons: [
      { id: 'bench-a', name: '벤치 A', startDate: '2026-07-01', endDate: '2026-08-31', exerciseIds: ['bench'] },
      { id: 'bench-b', name: '벤치 B', startDate: '2026-07-15', endDate: '2026-09-01', exerciseIds: ['bench'] },
    ],
  });
  assert.equal(conflict.valid, false);
  assert.match(conflict.errors.join(' '), /overlap/);
});

test('시즌 cache는 원본 객체를 수정하지 않고 날짜 범위만 선택한다', () => {
  const summer = findSeasonForDate(REGISTRY, '2026-07-15');
  const cache = {
    '2026-06-30': { marker: 'old' },
    '2026-07-01': { marker: 'start' },
    '2026-08-31': { marker: 'end' },
    '2026-09-01': { marker: 'future' },
    metadata: { keep: true },
  };
  const scoped = filterCacheToSeason(cache, summer);
  assert.deepEqual(Object.keys(scoped), ['2026-07-01', '2026-08-31']);
  assert.equal(scoped['2026-07-01'], cache['2026-07-01']);
  assert.equal(Object.keys(cache).length, 5);
});

// ── 종목별 기간 (한 시즌 안에서 종목마다 다른 구간) ──────────────
const WINDOWED_SEASON = {
  id: 'summer',
  name: '여름 시즌',
  startDate: '2026-07-01',
  endDate: '2026-08-31',
  exerciseIds: ['bench', 'squat'],
  exerciseWindows: {
    bench: { startDate: '2026-07-01', endDate: '2026-07-31' },
    squat: { startDate: '2026-08-01', endDate: '2026-08-31' },
  },
};

test('종목별 기간은 시즌 범위 안으로 잘리고 시즌과 같은 구간은 저장하지 않는다', () => {
  const normalized = normalizeSeason({
    ...WINDOWED_SEASON,
    exerciseWindows: {
      bench: { startDate: '2026-06-01', endDate: '2026-09-30' }, // 시즌 밖 → 시즌 경계로 클램프 → 시즌과 동일 → 제거
      squat: { startDate: '2026-08-01', endDate: '2026-08-31' },
      deadlift: { startDate: '2026-07-05', endDate: '2026-07-10' }, // 시즌 담당 종목이 아님 → 제거
      broken: { startDate: '2026-08-31', endDate: '2026-08-01' }, // 뒤집힘 → 제거
    },
  });
  assert.deepEqual(Object.keys(normalized.exerciseWindows), ['squat']);
  assert.deepEqual(normalized.exerciseWindows.squat, { startDate: '2026-08-01', endDate: '2026-08-31' });
});

test('종목별 기간이 없으면 시즌 기간을 그대로 쓰고, 담당하지 않는 종목은 null이다', () => {
  const plain = { id: 's', name: 's', startDate: '2026-07-01', endDate: '2026-08-31', exerciseIds: ['bench'] };
  assert.deepEqual(seasonExerciseRange(plain, 'bench'), { startDate: '2026-07-01', endDate: '2026-08-31' });
  assert.equal(seasonExerciseRange(plain, 'squat'), null);
});

test('종목별 기간은 각 종목이 적용받는 구간을 결정한다', () => {
  assert.deepEqual(seasonExerciseRange(WINDOWED_SEASON, 'bench'), { startDate: '2026-07-01', endDate: '2026-07-31' });
  assert.deepEqual(seasonExerciseRange(WINDOWED_SEASON, 'squat'), { startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.equal(seasonContainsExerciseDate(WINDOWED_SEASON, 'bench', '2026-07-15'), true);
  assert.equal(seasonContainsExerciseDate(WINDOWED_SEASON, 'bench', '2026-08-15'), false);
  assert.equal(seasonContainsExerciseDate(WINDOWED_SEASON, 'squat', '2026-08-15'), true);
});

test('캐시는 종목별 구간으로 잘린다', () => {
  const cache = {
    '2026-07-10': { a: 1 },
    '2026-08-10': { b: 2 },
    '2026-09-10': { c: 3 },
  };
  assert.deepEqual(Object.keys(filterCacheToSeasonExercise(cache, WINDOWED_SEASON, 'bench')), ['2026-07-10']);
  assert.deepEqual(Object.keys(filterCacheToSeasonExercise(cache, WINDOWED_SEASON, 'squat')), ['2026-08-10']);
});

test('decision cache는 종목별 구간을 적용하고, 시즌에 없는 종목은 전체 기록을 쓴다', () => {
  const registry = { seasons: [WINDOWED_SEASON] };
  const cache = {
    '2026-06-10': { pre: true },
    '2026-07-10': { a: 1 },
    '2026-08-10': { b: 2 },
  };
  // 8월 15일 기준: 벤치는 7월 구간이라 활성 시즌이 없다 → 시즌 전체 기간으로 폴백
  assert.deepEqual(
    Object.keys(selectSeasonDecisionCache(cache, registry, '2026-08-15', { exerciseId: 'squat' })),
    ['2026-08-10'],
  );
  // 어느 시즌에도 속하지 않은 종목은 자르지 않는다 (사용자 결정)
  assert.deepEqual(
    Object.keys(selectSeasonDecisionCache(cache, registry, '2026-08-15', { exerciseId: 'deadlift' })),
    ['2026-06-10', '2026-07-10', '2026-08-10'],
  );
  // 종목을 지정하지 않으면 기존 동작 그대로 시즌 전체 기간
  assert.deepEqual(
    Object.keys(selectSeasonDecisionCache(cache, registry, '2026-08-15')),
    ['2026-07-10', '2026-08-10'],
  );
});
