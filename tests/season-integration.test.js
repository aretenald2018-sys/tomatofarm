import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('운동 달력은 시즌 관리 버튼·이전 시즌 셀·시즌 상세 배지를 렌더한다', () => {
  const source = read('render-calendar.js');
  const styles = read('styles/features/seasons.css');
  assert.match(source, /data-wt-season-manager/);
  assert.match(source, /data-wt-season-edit/);
  assert.match(source, /cal-season-settings/);
  assert.match(source, /cal-workout-cell-season-archived/);
  assert.match(source, /cal-season-start-label/);
  assert.match(source, /cal-day-season-badge/);
  assert.match(styles, /cal-workout-cell-season-archived/);
  assert.doesNotMatch(styles, /cal-workout-cell-season-archived[^}]*opacity\s*:/s);
});

test('운동 홈은 시즌 설정과 날짜 상세를 카드형 계층으로 렌더한다', () => {
  const source = read('render-calendar.js');
  const calendarStyles = read('styles/features/calendar-home.css');
  const seasonStyles = read('styles/features/seasons.css');
  const daySheetStyles = read('styles/features/workout-day-sheet.css');

  assert.match(source, /cal-workout-calendar-card/);
  assert.match(source, /cal-season-emblem/);
  assert.match(source, /cal-season-copy/);
  assert.match(source, /cal-season-primary/);
  assert.match(source, /cal-workout-day-icon/);
  assert.match(source, /cal-workout-day-copy/);
  assert.match(calendarStyles, /\.cal-workout-calendar-card\s*\{/);
  assert.match(seasonStyles, /\.cal-season-control\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto;/);
  assert.match(seasonStyles, /\.cal-season-settings svg\s*\{[\s\S]*stroke:\s*currentColor;/);
  assert.match(seasonStyles, /\.cal-season-control\s*\{[\s\S]*padding:\s*11px 14px;/);
  assert.match(seasonStyles, /\.cal-season-emblem\s*\{[\s\S]*width:\s*42px;[\s\S]*height:\s*42px;/);
  assert.match(source, /` : \(isWorkoutHome \? '' : `\s*<div class="cal-month-summary cal-month-empty">/);
  assert.doesNotMatch(source, /cal-month-empty-icon/);
  assert.match(daySheetStyles, /\.cal-workout-day-sheet\s*\{[\s\S]*border-radius:\s*26px 26px 0 0;/);
});

test('시즌 마법사는 선택 확인을 포함한 다섯 단계와 생성·수정 저장 진입을 제공한다', () => {
  const source = read('workout/season-manager.js');
  const styles = read('styles/features/seasons.css');
  assert.match(source, /기간.*종목·목표.*선택 확인.*러닝.*최종 확인/s);
  assert.match(source, /GROUP_LABELS.*가슴.*등.*어깨.*하체.*팔.*복부/s);
  assert.match(source, /SEASON_NORMAL_INCREMENTS_KG/);
  assert.match(source, /data-season-action="select-group" data-season-group/);
  assert.match(source, /data-season-program="program"/);
  assert.match(source, /data-season-normal-track="\$\{track\}" data-season-normal-field="kg"/);
  assert.match(source, /data-season-normal-field="sets"/);
  assert.match(source, /data-season-normal-field="incrementKg"/);
  assert.doesNotMatch(source, /type="checkbox"[^>]*data-season-exercise/);
  assert.match(source, /data-season-action="open-wendler"/);
  assert.match(source, /data-season-wendler-draft="tenRmKg"/);
  assert.match(source, /calculateSeasonWendlerFromTenRm/);
  assert.match(source, /const WENDLER_PLATE_STEP_KG = 1\.25/);
  assert.match(source, /data-season-wendler-draft="threeWeekIncrementKg"/);
  assert.match(source, /incrementKg: Number\(draft\.threeWeekIncrementKg\) \* WENDLER_THREE_WEEK_BLOCKS_PER_CYCLE/);
  assert.doesNotMatch(source, /<span>사이클 증량<\/span>/);
  assert.doesNotMatch(source, /<span>중량 반올림<\/span>/);
  assert.match(styles, /season-exercise-tabs/);
  assert.match(styles, /season-recent-reference/);
  assert.match(styles, /season-track-row/);
  assert.match(styles, /season-wendler-editor-backdrop/);
  assert.match(source, /최근 수행한 종목부터 표시합니다/);
  assert.match(source, /buildSeasonExerciseHistory/);
  assert.match(source, /createWorkoutSeason/);
  assert.match(source, /updateWorkoutSeason/);
  assert.match(source, /season-review-summary/);
  assert.match(source, /RUNNING_GOALS/);
  assert.match(source, /data-season-running-duration-field="hours"/);
  assert.match(source, /data-season-running-duration-field="minutes"/);
  assert.match(source, /baselineWeeklyDistanceKm/);
  assert.match(source, /longestRunKm/);
  assert.match(source, /speedSessionsPerWeek/);
  assert.match(source, /registeredExerciseIds: _state\.exercises\.map/);
  assert.match(source, /registeredExercises: _state\.exercises/);
  assert.match(source, /action === 'save'.*_save\(\)/s);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /\.season-stepper\s*\{[\s\S]*flex:\s*none;[\s\S]*min-height:\s*48px;[\s\S]*overflow:\s*visible;/);
  assert.match(styles, /\.season-sheet-actions\s*\{\s*flex:\s*none;/);
  assert.match(source, /function _syncNormalTrackCardState/);
  assert.match(source, /_syncNormalTrackCardState\(configuredExerciseId, normalTrack, exerciseRoot\)/);
  assert.doesNotMatch(source, /if \(event\.type === 'change'\) _render\(\)/);
});

test('기존 직전 기록·PR API는 현재 시즌 decision cache를 사용한다', () => {
  const api = read('data/data-api.js');
  const expert = read('workout/expert.js');
  assert.match(api, /getVolumeHistory = .*getSeasonDecisionCache\(\)/);
  assert.match(api, /detectPRs = .*getSeasonDecisionCache\(\)/);
  assert.match(api, /getLastSession = .*getSeasonDecisionCache\(excludeDateKey\)/);
  assert.match(expert, /getSeasonDecisionCache as getCache/);
  assert.match(expert, /_getLastSessionCalc\(getCache\(todayKey\)/);
});

test('현재 시즌 성장 보드는 시즌 문서와 활성 보드를 한 트랜잭션으로 함께 저장한다', () => {
  const api = read('data/data-api.js');
  assert.match(api, /const seasonKey = currentSeason \? `season_\$\{currentSeason\.id\}_test_board_v2` : null/);
  assert.match(api, /runTransaction\(db, async \(transaction\) =>/);
  assert.match(api, /if \(seasonRef\) transaction\.set\(seasonRef, \{ value: nextBoard \}\)/);
  assert.match(api, /transaction\.set\(activeRef, \{ value: nextBoard \}\)/);
  assert.match(api, /if \(seasonKey\) _settings\[seasonKey\] = merged/);
});

test('Android에는 신규 시즌 위젯만 남고 구형 REST 위젯과 API key 경로가 없다', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const main = read('android/app/src/main/java/com/lifestreak/app/MainActivity.java');
  assert.match(manifest, /SeasonDashboardWidget/);
  assert.match(manifest, /season_dashboard_widget_info/);
  assert.doesNotMatch(manifest, /StreakWidget|WeekWidget|MonthWidget/);
  assert.match(main, /SeasonWidgetPlugin/);
  for (const legacy of [
    'android/app/src/main/java/com/lifestreak/app/widget/StreakWidget.kt',
    'android/app/src/main/java/com/lifestreak/app/widget/WeekWidget.kt',
    'android/app/src/main/java/com/lifestreak/app/widget/MonthWidget.kt',
    'android/app/src/main/java/com/lifestreak/app/widget/WidgetUtils.kt',
  ]) assert.equal(existsSync(new URL(`../${legacy}`, import.meta.url)), false);
  const provider = read('android/app/src/main/java/com/lifestreak/app/widget/SeasonDashboardWidget.kt');
  const plugin = read('android/app/src/main/java/com/lifestreak/app/widget/SeasonWidgetPlugin.kt');
  assert.doesNotMatch(`${provider}\n${plugin}`, /firestore\.googleapis\.com|AIza/);
  assert.match(provider, /STALE_AFTER_MS/);
  // The season dashboard renders running as a paced trend chart and strength as
  // a goal checklist, so assert those surfaces rather than the retired
  // widget_running_progress / widget_strength_progress bars.
  assert.match(provider, /widget_running_value/);
  assert.match(provider, /widget_running_chart/);
  assert.match(provider, /widget_strength_value/);
  assert.match(provider, /widget_strength_check_1/);
});

test('시즌 위젯 레이아웃은 폰에서 읽히는 글자 크기만 쓴다', () => {
  // 위젯을 폰에 붙였을 때 글자가 너무 작아 안 읽힌다는 문제를 다시 만들지 않도록,
  // 본문 최소 크기를 10sp로 고정한다.
  for (const layout of [
    'android/app/src/main/res/layout/widget_season_dashboard.xml',
    'android/app/src/main/res/layout/widget_season_dashboard_compact.xml',
    // 아래 둘은 tomatodev에만 있는 보조 위젯이라 있을 때만 검사한다.
    'android/app/src/main/res/layout/widget_tomato_status_dashboard.xml',
    'android/app/src/main/res/layout/widget_tomato_metric.xml',
  ]) {
    if (!existsSync(new URL(`../${layout}`, import.meta.url))) continue;
    const sizes = [...read(layout).matchAll(/android:textSize="(\d+)sp"/g)].map(match => Number(match[1]));
    assert.ok(sizes.length > 0, `${layout}에 textSize가 없다`);
    assert.ok(Math.min(...sizes) >= 10, `${layout}에 ${Math.min(...sizes)}sp 글자가 남아 있다`);
  }
});

test('러닝 추이 그래프는 점마다 날짜와 평균 페이스를 함께 찍는다', () => {
  const provider = read('android/app/src/main/java/com/lifestreak/app/widget/SeasonDashboardWidget.kt');
  // 그래프 값은 거리(distanceKm)가 아니라 평균 페이스라야 카드의 페이스 수치와 맞는다.
  assert.match(provider, /avgPaceSecPerKm/);
  assert.doesNotMatch(provider, /distanceKm/);
  assert.match(provider, /canvas\.drawText\(paceLabel/);
  assert.match(provider, /canvas\.drawText\(dateLabel/);
  assert.match(provider, /shortDate/);
});
