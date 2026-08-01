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
  // 종목별 기간을 지원하려면 decision cache가 어떤 종목을 묻는지 알아야 한다.
  assert.match(api, /getVolumeHistory = .*getSeasonDecisionCache\(null, exerciseId\)/);
  assert.match(api, /detectPRs = .*getSeasonDecisionCache\(null, exerciseId\)/);
  assert.match(api, /getLastSession = .*getSeasonDecisionCache\(excludeDateKey, exerciseId\)/);
  assert.match(expert, /getSeasonDecisionCache as getCache/);
  assert.match(expert, /_getLastSessionCalc\(getCache\(todayKey, ex\.id\)/);
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

test('칼로리 도넛은 고정 dp가 아니라 카드에 맞춰 줄어드는 비트맵이다', () => {
  // 고정 dp ProgressBar는 카드가 얕아지면 위아래가 잘렸다. 이제는 직접 그린
  // 비트맵을 fitCenter로 얹어, 위젯을 줄이면 링이 통째로 작아지기만 한다.
  for (const layout of [
    'android/app/src/main/res/layout/widget_season_dashboard.xml',
    'android/app/src/main/res/layout/widget_season_dashboard_compact.xml',
  ]) {
    const source = read(layout);
    const block = source.match(/id="@\+id\/widget_diet_ring"[\s\S]{0,400}?\/>/);
    assert.ok(block, `${layout}에 widget_diet_ring이 없다`);
    assert.match(block[0], /layout_width="match_parent"/, `${layout} 도넛이 고정 폭이다`);
    assert.match(block[0], /layout_height="match_parent"/, `${layout} 도넛이 고정 높이다`);
    assert.match(block[0], /scaleType="fitCenter"/, `${layout} 도넛이 fitCenter가 아니다`);
    // 잘림의 원인이던 고정 dp ProgressBar 링은 되돌아오면 안 된다.
    assert.doesNotMatch(source, /widget_ring_progress/, `${layout}에 옛 고정 dp 링이 남아 있다`);
  }
  const provider = read('android/app/src/main/java/com/lifestreak/app/widget/SeasonDashboardWidget.kt');
  assert.match(provider, /dietRingBitmap/);
  assert.match(provider, /setImageViewBitmap\(R\.id\.widget_diet_ring/);
  // 링이 작아지면 가운데 글자도 같이 줄어야 구멍 밖으로 넘치지 않는다.
  assert.match(provider, /setTextViewTextSize\(R\.id\.widget_diet_value/);
});

test('시즌 위젯 카드는 아이콘 배지·매크로 점·근력 체크 행 구조를 갖춘다', () => {
  const layout = read('android/app/src/main/res/layout/widget_season_dashboard.xml');
  for (const badge of ['widget_badge_green', 'widget_badge_purple', 'widget_badge_blue']) {
    assert.match(layout, new RegExp(badge), `${badge} 배지가 없다`);
  }
  for (const dot of ['widget_dot_green', 'widget_dot_purple', 'widget_dot_orange']) {
    assert.match(layout, new RegExp(dot), `${dot} 매크로 점이 없다`);
  }
  // 근력 목표 한 줄 = [체크 마크][종목명][처방] + 행 구분선
  for (let index = 1; index <= 5; index += 1) {
    assert.match(layout, new RegExp(`widget_strength_row_${index}`));
    assert.match(layout, new RegExp(`widget_strength_mark_${index}`));
    assert.match(layout, new RegExp(`widget_strength_detail_${index}`));
  }
  assert.match(layout, /widget_divider/);

  const provider = read('android/app/src/main/java/com/lifestreak/app/widget/SeasonDashboardWidget.kt');
  // 행 컨테이너를 숨겨야 구분선까지 같이 사라진다.
  assert.match(provider, /widget_strength_row_1/);
  assert.match(provider, /widget_check_on/);
  assert.match(provider, /widget_check_off/);
  // 달성/미달성이 한 TextView 안 "✓ "/"○ " 접두어로 섞여 있던 옛 방식은 쓰지 않는다.
  assert.doesNotMatch(provider, /"○ "/);
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

test('시즌 마법사는 목표를 세운 종목마다 시즌 안에서 개별 기간을 지정한다', () => {
  const source = read('workout/season-manager.js');
  const styles = read('styles/features/seasons.css');
  // 종목 카드 안의 기간 입력. 시즌 범위를 벗어나지 못하도록 min/max를 시즌 경계로 묶는다.
  assert.match(source, /data-season-exercise-window="start"/);
  assert.match(source, /data-season-exercise-window="end"/);
  assert.match(source, /min="\$\{_esc\(_state\.season\.startDate\)\}" max="\$\{_esc\(_state\.season\.endDate\)\}"/);
  // 입력 핸들러와 저장 경로가 연결돼 있어야 실제로 반영된다.
  assert.match(source, /_setExerciseWindow\(configuredExerciseId/);
  assert.match(source, /exerciseWindows: _collectExerciseWindows\(\)/);
  // 편집 진입 시 기존 종목별 기간을 이어받는다.
  assert.match(source, /exerciseWindows: editingSeason\?\.exerciseWindows/);
  assert.match(styles, /\.season-exercise-window/);
});

test('종목별 기간은 시즌 모델과 조회 경로에서 함께 지켜진다', () => {
  const model = read('data/season-model.js');
  const api = read('data/data-api.js');
  assert.match(model, /export function seasonExerciseRange/);
  assert.match(model, /export function filterCacheToSeasonExercise/);
  // 공유 백엔드 계약: 스키마 버전은 올리지 않고 선택 필드로만 확장한다.
  assert.match(model, /export const SEASON_REGISTRY_SCHEMA_VERSION = 3;/);
  // 어느 시즌에도 없는 종목은 시즌으로 자르지 않는다.
  assert.match(model, /if \(!normalized\.seasons\.some\(season => seasonContainsExercise\(season, exerciseId\)\)\) return cache;/);
  assert.match(api, /function _seasonDecisionCacheForExercises/);
});

test('이미 만들어진 시즌은 5단계 대신 한 화면 관리 시트로 연다', () => {
  const source = read('workout/season-manager.js');
  const styles = read('styles/features/seasons.css');
  // 편집 진입은 기본이 관리 모드다.
  assert.match(source, /_state\.mode = options\.mode \|\| \(_state\.editingSeasonId \? 'manage' : 'wizard'\)/);
  // 관리 모드에서는 단계 표시를 감추고 바로 저장한다.
  assert.match(source, /\$\{isManage \? '' : _stepper\(\)\}/);
  assert.match(source, /isManage \? _manageBody\(\) : _stepBody\(\)/);
  // 종목 줄을 펼쳐 기간을 그 자리에서 고친다.
  assert.match(source, /data-season-action="toggle-manage-row"/);
  assert.match(source, /data-season-action="clear-exercise-window"/);
  assert.match(source, /data-season-action="edit-exercise-goal"/);
  assert.match(source, /data-season-action="remove-exercise"/);
  assert.match(source, /data-season-action="go-to-wizard"/);
  assert.match(source, /'back-to-manage' : 'close'/);
  assert.match(source, /action === 'back-to-manage'/);
  // 관리 시트의 종목 줄에도 종목 기간 입력이 있다.
  assert.match(source, /season-manage-window[\s\S]{0,400}data-season-exercise-window="start"/);
  // 목표 수정은 같은 상태를 들고 위저드 종목 단계로 이어진다(입력값 유지).
  assert.match(source, /_state\.mode = 'wizard';\s*\n\s*_state\.step = 1;/);
  // 단계를 걷지 않고 저장하므로 모든 관문을 한 번에 검사한다.
  assert.match(source, /_state\.mode === 'manage' \? _validateAllSteps\(\) : _validateCurrentStep\(\)/);
  assert.match(source, /function _validateAllSteps\(\)/);
  assert.match(styles, /\.season-manage-row-head/);
  assert.match(styles, /\.season-manage-row-period\.is-custom/);
});

test('주차 레일은 시즌 목표를 미니 캐러셀로 보여주고 달성은 체크로 표기한다', () => {
  const calendar = read('render-calendar.js');
  const styles = read('styles/features/calendar-home.css');
  assert.match(calendar, /function _buildWeekGoalsByMonday/);
  assert.match(calendar, /function _renderWeekGoalRail/);
  // 위젯/개요와 같은 판정을 재사용한다.
  assert.match(calendar, /buildSeasonOverview\(\{[\s\S]{0,200}board: getSeasonTestBoardV2\(season\.id\)/);
  assert.match(calendar, /state === 'achieved'\) return '✓'/);
  // 레일 안에서만 세로로 굴러야 달력 스크롤을 뺏지 않는다.
  assert.match(styles, /\.cal-week-goals\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior:\s*contain;/);
  assert.match(styles, /\.cal-week-goal\.is-achieved/);
});

