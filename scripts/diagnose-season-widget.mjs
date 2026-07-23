#!/usr/bin/env node
// 시즌 위젯 '이번 주 근력 달성 ✓' 진단기.
//
// 왜 있나: 이 버그는 4회 넘게 "달성 판정 수식만 수정 → APK 재빌드 → 안 되면 반복"으로
// 다뤄졌다. 매번 우리가 만든 합성 데이터로만 검증했고, 실제 사용자 데이터로 위젯이 무엇을
// 그리는지는 한 번도 관찰하지 못했다(= 관찰/검증 도구 갭). 이 스크립트는 실제 프로덕션
// 파이프라인(buildSeasonDashboardSnapshot / buildSeasonOverview)을 그대로 돌려서, 위젯이
// 실제로 그리는 근력 목표 5칸과 각 목표의 달성 상태·달성 로그 키를 사람이 읽을 수 있게
// 출력한다. 위젯을 다시 빌드하지 않고도 "이번 주 달성한 근력목표가 있는지"(요청 1)와
// "왜 위젯에 안 뜨는지"를 초 단위로 판별하기 위한 도구.
//
// 사용법:
//   node scripts/diagnose-season-widget.mjs <export.json>   # 앱에서 내보낸 데이터로 진단
//   node scripts/diagnose-season-widget.mjs --demo          # 데이터 없이 수정 동작 시연
//
// export.json 은 다음 키를 가진 오브젝트를 기대한다(없으면 빈값으로 처리):
//   { todayKey, registry, board, cache, workoutPlan, runningPlan, dietPlan }
// (앱 저장 구조에 맞춰 registry/seasonRegistry, board/testBoardV2 등 흔한 별칭도 자동 인식)

import { readFileSync } from 'node:fs';
import { buildSeasonDashboardSnapshot } from '../data/season-widget-snapshot.js';
import { buildSeasonOverview } from '../data/season-overview.js';
import { findSeasonForDate } from '../data/season-model.js';
import { buildBoardFromOnboarding, paintWeek } from '../workout/test-v2/board-core.js';

const WIDGET_STRENGTH_ROWS = 5; // widget_strength_check_1..5 (SeasonDashboardWidget.renderStrengthGoals)

function _pick(source, keys) {
  for (const key of keys) {
    if (source && source[key] != null) return source[key];
  }
  return undefined;
}

function _todayKeyFromEnv() {
  // 스크립트 실행 시각의 로컬 날짜. export에 todayKey가 있으면 그걸 우선한다.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function _loadExport(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const root = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  return {
    todayKey: _pick(root, ['todayKey', 'today']) || _todayKeyFromEnv(),
    registry: _pick(root, ['registry', 'seasonRegistry', 'seasons']) || {},
    board: _pick(root, ['board', 'testBoardV2', 'test_board_v2', 'workoutBoard']) || {},
    cache: _pick(root, ['cache', 'days', 'workouts']) || {},
    workoutPlan: _pick(root, ['workoutPlan', 'workout_plan']) || {},
    runningPlan: _pick(root, ['runningPlan', 'running_plan']) || {},
    dietPlan: _pick(root, ['dietPlan', 'diet']) || {},
  };
}

function _buildDemo() {
  // 회귀 시나리오: 종목 6개, 마지막 하나만 이번 주 달성. 정렬 수정이 없으면 그 달성 목표는
  // 위젯 5칸 밖(6번째)이라 사라진다.
  const todayKey = '2026-07-15';
  const registry = {
    schemaVersion: 2,
    seasons: [{ id: 'demo', name: '데모 시즌', startDate: '2026-07-01', endDate: '2026-08-31' }],
  };
  const selections = Array.from({ length: 6 }, (_, i) => ({
    exerciseId: `lift_${i}`, movementId: 'back_squat', groupId: 'lower', label: `리프트${i + 1}`,
    tracks: { volume: { kg: 80, reps: 8 } }, wendler: { scheme: 'w863', oneRmKg: 100 + i },
  }));
  const board = buildBoardFromOnboarding({ startDate: '2026-07-01', selections });
  const last = board.benchmarks[board.benchmarks.length - 1];
  paintWeek(board, { benchmarkId: last.id, weekStart: todayKey, log: { at: 123, amrapReps: 7 } });
  return { todayKey, registry, board, cache: {}, workoutPlan: {}, runningPlan: { weeklyDistanceKm: 20, weeklySessions: 3 }, dietPlan: {} };
}

function _logKeysForBoard(board) {
  // 달성 로그가 어떤 주(월요일) 키에 저장돼 있는지 보여준다 — 주 경계 어긋남 진단용.
  const lines = [];
  for (const bm of board?.benchmarks || []) {
    if (bm.program === 'wendler') {
      const keys = Object.keys(bm.wendlerLog || {});
      lines.push(`  · ${bm.label || bm.id} (wendler) wendlerLog 키: ${keys.length ? keys.join(', ') : '(없음)'}`);
    }
  }
  for (const step of board?.steps || []) {
    const keys = Object.keys(step.weekLog || {});
    if (keys.length) lines.push(`  · step ${step.benchmarkId}/${step.track} weekLog 키: ${keys.join(', ')}`);
  }
  return lines.join('\n');
}

function main() {
  const arg = process.argv[2];
  if (!arg || arg === '-h' || arg === '--help') {
    console.log('사용법: node scripts/diagnose-season-widget.mjs <export.json | --demo>');
    process.exit(arg ? 0 : 1);
  }

  const input = arg === '--demo' ? _buildDemo() : _loadExport(arg);
  const { todayKey, registry, board, cache, workoutPlan, runningPlan, dietPlan } = input;

  console.log('=== 시즌 위젯 근력 목표 진단 ===');
  console.log(`오늘(todayKey): ${todayKey}`);

  const season = findSeasonForDate(registry, todayKey);
  console.log(`현재 시즌: ${season ? `${season.name} (${season.startDate} ~ ${season.endDate})` : '(없음 — 위젯은 "새 시즌을 설정" 상태)'}`);

  const snapshot = buildSeasonDashboardSnapshot({
    cache, registry, todayKey, workoutPlan, runningPlan, board, dietPlan, generatedAt: 123,
  });
  const goal = snapshot.weeklyGoal || { state: 'missing', items: [] };
  console.log(`\n이번 주 목표 상태: ${goal.state}  (달성 ${goal.achievedCount ?? 0} / ${goal.totalCount ?? 0})`);
  if (goal.startDate) console.log(`이번 주 창(월요일 정렬): ${goal.startDate} ~ ${goal.endDate}`);

  const items = goal.items || [];
  const strengthItems = items.filter(item => item.kind === 'strength');
  const achievedStrength = strengthItems.filter(item => item.state === 'achieved');

  console.log('\n[요청 1] 이번 주 달성한 근력목표 종목:');
  if (achievedStrength.length) {
    achievedStrength.forEach(item => console.log(`  ✓ ${item.label} — ${item.detail || ''}`));
  } else {
    console.log('  (달성 상태로 집계된 근력목표 없음)');
  }

  console.log('\n[요청 2] 위젯이 실제로 그리는 근력 칸(최대 5개) — 스냅샷 순서 그대로:');
  items.slice(0, WIDGET_STRENGTH_ROWS).forEach((item, i) => {
    const mark = item.state === 'achieved' ? '✓' : '○';
    console.log(`  ${i + 1}. [${mark} ${item.state}] ${item.kind} · ${item.label} — ${item.detail || ''}`);
  });
  const hidden = items.slice(WIDGET_STRENGTH_ROWS);
  if (hidden.length) {
    console.log(`\n  ⚠ 위젯 5칸 밖으로 밀려 렌더되지 않는 항목 ${hidden.length}개:`);
    hidden.forEach(item => console.log(`     - [${item.state}] ${item.kind} · ${item.label}`));
  }

  // 달성으로 집계됐지만 5칸 밖으로 밀린 경우 = 이 버그의 표시-선택 원인. 수정 후에는 발생 X.
  const achievedButHidden = hidden.filter(item => item.kind === 'strength' && item.state === 'achieved');
  if (achievedButHidden.length) {
    console.log(`\n  ❌ 달성했는데 위젯 밖으로 밀린 근력목표 ${achievedButHidden.length}개 — 표시-선택 버그!`);
  }

  console.log('\n[달성 로그 키] (paintWeek는 항상 월요일(mondayOf) 키로 저장):');
  console.log(_logKeysForBoard(board) || '  (근력 벤치마크 없음)');

  console.log('\n[판정] ' + (
    goal.state === 'missing' ? '시즌/보드 없음 — 데이터부터 확인하세요.'
    : achievedStrength.length && !achievedButHidden.length
      ? '이번 주 달성한 근력목표가 위젯 보이는 칸 안에 정상 노출됩니다.'
    : achievedButHidden.length ? '달성은 됐지만 표시-선택에서 밀렸습니다(수정 대상).'
    : '이번 주 달성으로 집계된 근력목표가 없습니다 — 달성-판정(top-set 무게·횟수) 또는 요구사항(무엇을 달성으로 볼지) 문제일 수 있습니다.'
  ));
}

main();
