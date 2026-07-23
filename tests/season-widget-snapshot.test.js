import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonDashboardSnapshot } from '../data/season-widget-snapshot.js';
import { buildBoardFromOnboarding, paintWeek } from '../workout/test-v2/board-core.js';

const registry = {
  schemaVersion: 2,
  seasons: [{ id: 'summer', name: '여름 시즌', startDate: '2026-07-01', endDate: '2026-08-31' }],
};

function workoutDay(distanceKm = 0) {
  return {
    exercises: [{ exerciseId: 'squat', sets: [{ kg: 100, reps: 5, done: true }] }],
    ...(distanceKm ? { running: true, runDistance: distanceKm, runDurationMin: distanceKm * 6, runDurationSec: 0 } : {}),
  };
}

test('위젯 snapshot은 시즌 스트릭·러닝·헬스·주차를 한 계약으로 만든다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-01',
    selections: [{
      exerciseId: 'squat', movementId: 'back_squat', groupId: 'lower', label: '스쿼트',
      tracks: { volume: { kg: 80, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 110 },
    }],
  });
  const cache = {
    '2026-07-13': workoutDay(4),
    '2026-07-14': workoutDay(6),
    '2026-07-15': workoutDay(2),
  };
  const snapshot = buildSeasonDashboardSnapshot({
    cache, registry, todayKey: '2026-07-15', board,
    workoutPlan: { weeklySessionTarget: 4, startingOneRmByExercise: { squat: 100 } },
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    dietPlan: { _userSet: true, weight: 80, height: 180, age: 35, bodyFatPct: 20, targetWeight: 75, targetBodyFatPct: 15 },
    generatedAt: 123,
  });
  assert.equal(snapshot.state, 'ready');
  assert.equal(snapshot.season.name, '여름 시즌');
  assert.equal(snapshot.season.week, 3);
  assert.equal(snapshot.streak.current, 3);
  assert.equal(snapshot.streak.todayDone, true);
  assert.equal(snapshot.running.distance.actual, 12);
  assert.equal(snapshot.running.distance.percent, 60);
  assert.equal(snapshot.food.actualKcal, 0);
  assert.equal(snapshot.food.targetKcal > 0, true);
  assert.equal(snapshot.weeklyGoal.items.length > 0, true);
  assert.equal(snapshot.recentRunning.length, 3);
  assert.equal(snapshot.strength.sessions.actual, 3);
  assert.equal(snapshot.strength.liftDeltaKg > 0, true);
  assert.match(snapshot.nextPlan.health, /스쿼트/);
});

test('웬들러 종목을 이번 주 달성하면 위젯 주간 목표가 달성으로 집계된다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-01',
    selections: [{
      exerciseId: 'squat_wide', movementId: 'back_squat', groupId: 'lower', label: '스쿼트(와이드)',
      tracks: { volume: { kg: 90, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 120 },
    }],
  });
  const benchmark = board.benchmarks[0];
  assert.equal(benchmark.program, 'wendler');
  // 웬들러는 스텝을 만들지 않는다 — 달성 로그는 benchmark.wendlerLog에만 쌓인다
  assert.equal((board.steps || []).some(step => step.benchmarkId === benchmark.id), false);
  assert.equal(paintWeek(board, { benchmarkId: benchmark.id, weekStart: '2026-07-13', log: { at: 123, amrapReps: 7 } }), true);

  const snapshot = buildSeasonDashboardSnapshot({
    cache: {}, registry, todayKey: '2026-07-15', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const strength = snapshot.weeklyGoal.items.filter(item => item.kind === 'strength');
  assert.equal(strength.length, 1);
  assert.equal(strength[0].label, '스쿼트(와이드)');
  assert.equal(strength[0].state, 'achieved');
  assert.equal(strength[0].achievementSource, 'board-log');
  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
});

test('일반 운동 저장 기록이 처방을 충족하면 별도 완료 도장 없이 위젯에 체크된다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-01',
    selections: [{
      exerciseId: 'bench', movementId: 'barbell_bench', groupId: 'chest', label: '바벨 벤치프레스',
      tracks: {
        volume: { kg: 90, reps: 12 },
        intensity: { kg: 105, reps: 8 },
      },
    }],
  });
  const cache = {
    '2026-07-15': {
      exercises: [{
        exerciseId: 'bench',
        movementId: 'barbell_bench',
        name: '바벨 벤치프레스',
        recommendationMeta: { track: 'M' },
        sets: [{ kg: 90, reps: 12, done: true, setType: 'main' }],
      }],
    },
  };

  const snapshot = buildSeasonDashboardSnapshot({
    cache, registry, todayKey: '2026-07-15', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const strength = snapshot.weeklyGoal.items.filter(item => item.kind === 'strength');
  const volume = strength.find(item => item.detail.startsWith('볼륨'));
  const intensity = strength.find(item => item.detail.startsWith('강도'));

  assert.equal(volume.state, 'achieved');
  assert.equal(volume.achievementSource, 'workout-record');
  assert.equal(volume.achievementDate, '2026-07-15');
  assert.equal(intensity.state, 'not-achieved');
  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
});

test('일반 웬들러 운동 기록도 톱세트 무게·횟수를 채우면 별도 완료 도장 없이 체크된다', () => {
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-01',
    selections: [{
      exerciseId: 'squat_wide', movementId: 'back_squat', groupId: 'lower', label: '스쿼트(와이드)',
      tracks: { volume: { kg: 90, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 120 },
    }],
  });
  const benchmark = board.benchmarks[0];
  const emptySnapshot = buildSeasonDashboardSnapshot({
    cache: {}, registry, todayKey: '2026-07-15', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const target = emptySnapshot.weeklyGoal.items.find(item => item.kind === 'strength');
  const match = target.detail.match(/([0-9.]+)kg x ([0-9]+)/);
  assert.ok(match, `웬들러 목표를 읽을 수 있어야 함: ${target.detail}`);

  const cache = {
    '2026-07-15': {
      exercises: [{
        exerciseId: benchmark.exerciseId,
        movementId: benchmark.movementId,
        name: benchmark.label,
        sets: [{
          kg: Number(match[1]),
          reps: Number(match[2]),
          done: true,
          setType: 'main',
        }],
      }],
    },
  };
  const snapshot = buildSeasonDashboardSnapshot({
    cache, registry, todayKey: '2026-07-15', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const strength = snapshot.weeklyGoal.items.filter(item => item.kind === 'strength');

  assert.equal(strength[0].state, 'achieved');
  assert.equal(strength[0].achievementSource, 'workout-record');
  assert.equal(strength[0].achievementDate, '2026-07-15');
  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
});

test('월요일이 아닌 요일(일요일)에 시작한 시즌도 이번 주 달성이 위젯에 잡힌다', () => {
  // 리그레션: paintWeek는 달성을 항상 월요일(mondayOf) 키로 저장한다.
  // 과거 season-overview는 주를 '시즌 시작 요일' 기준 7일씩 끊어, 시즌이 일요일에
  // 시작하면 이번 주 달성 주(월요일)와 어긋나 체크(✓)가 사라졌다.
  const sundayRegistry = {
    schemaVersion: 2,
    seasons: [{ id: 'sun', name: '일요일 시즌', startDate: '2026-07-05', endDate: '2026-08-31' }],
  };
  const board = buildBoardFromOnboarding({
    startDate: '2026-07-05', // 일요일
    selections: [{
      exerciseId: 'squat_wide', movementId: 'back_squat', groupId: 'lower', label: '스쿼트(와이드)',
      tracks: { volume: { kg: 90, reps: 8 } },
      wendler: { scheme: 'w863', oneRmKg: 120 },
    }],
  });
  const benchmark = board.benchmarks[0];
  // 사용자가 오늘(목, 2026-07-23)이 속한 주에 달성 → mondayOf = 2026-07-20에 저장
  assert.equal(paintWeek(board, { benchmarkId: benchmark.id, weekStart: '2026-07-23', log: { at: 123, amrapReps: 7 } }), true);
  assert.deepEqual(Object.keys(benchmark.wendlerLog), ['2026-07-20']);

  const snapshot = buildSeasonDashboardSnapshot({
    cache: {}, registry: sundayRegistry, todayKey: '2026-07-23', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });
  const strength = snapshot.weeklyGoal.items.filter(item => item.kind === 'strength');
  assert.equal(strength[0].label, '스쿼트(와이드)');
  assert.equal(strength[0].state, 'achieved');
  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
  // 위젯이 고른 주 경계도 월요일 정렬(오늘이 속한 ISO 주)이어야 한다
  assert.equal(snapshot.weeklyGoal.startDate, '2026-07-20');
  assert.equal(snapshot.weeklyGoal.endDate, '2026-07-26');
});

test('달성한 근력목표는 종목이 많아도 위젯이 그리는 5칸 안에 노출된다', () => {
  // 리그레션: 위젯은 근력 칸을 5개(widget_strength_check_1..5)만 렌더한다. 종목이 여러
  // 개일 때 달성(✓)한 종목이 벤치마크 순서상 6번째 이후로 밀리면, 잘라내기가 상태를 보지
  // 않아 달성 목표가 위젯에서 통째로 사라졌다. 스냅샷은 잘라내기 전에 달성 목표를 앞으로
  // 정렬해야 한다.
  const selections = Array.from({ length: 6 }, (_, i) => ({
    exerciseId: `lift_${i}`,
    movementId: 'back_squat',
    groupId: 'lower',
    label: `리프트${i + 1}`,
    tracks: { volume: { kg: 80, reps: 8 } },
    wendler: { scheme: 'w863', oneRmKg: 100 + i },
  }));
  const board = buildBoardFromOnboarding({ startDate: '2026-07-01', selections });
  assert.equal(board.benchmarks.length, 6);
  // 마지막(6번째) 종목만 이번 주 달성 → 정렬 없이는 위젯 5칸 밖(6번째)이라 안 보인다.
  const achievedBenchmark = board.benchmarks[board.benchmarks.length - 1];
  assert.equal(
    paintWeek(board, { benchmarkId: achievedBenchmark.id, weekStart: '2026-07-15', log: { at: 123, amrapReps: 7 } }),
    true,
  );

  const snapshot = buildSeasonDashboardSnapshot({
    cache: {}, registry, todayKey: '2026-07-15', board,
    runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 },
    generatedAt: 123,
  });

  assert.equal(snapshot.weeklyGoal.achievedCount, 1);
  const visible = snapshot.weeklyGoal.items.slice(0, 5); // 위젯이 실제로 그리는 칸
  const achievedVisible = visible.find(item => item.kind === 'strength' && item.state === 'achieved');
  assert.ok(achievedVisible, '달성한 근력목표가 위젯 5칸 안에 들어와야 한다');
  assert.equal(achievedVisible.label, achievedBenchmark.label);
});

test('현재 시즌이 없으면 위젯은 과거 수치를 섞지 않고 설정 안내 상태를 만든다', () => {
  const snapshot = buildSeasonDashboardSnapshot({
    cache: { '2026-06-30': workoutDay(100) },
    registry,
    todayKey: '2026-09-01',
    generatedAt: 123,
  });
  const { food: _food, weeklyGoal: _weeklyGoal, recentRunning: _recentRunning, ...legacySnapshot } = snapshot;
  assert.deepEqual(legacySnapshot, {
    schemaVersion: 1,
    generatedAt: 123,
    state: 'no-season',
    message: '새 시즌을 설정해 주세요',
  });
});
