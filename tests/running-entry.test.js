import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const workoutUi = await readFile(new URL('../workout-ui.js', import.meta.url), 'utf8');
const workoutTypeUi = await readFile(new URL('../workout/type-ui.js', import.meta.url), 'utf8');
const exercisesJs = await readFile(new URL('../workout/exercises.js', import.meta.url), 'utf8');
const activityFormsJs = await readFile(new URL('../workout/activity-forms.js', import.meta.url), 'utf8');
const workoutIndexJs = await readFile(new URL('../workout/index.js', import.meta.url), 'utf8');
const saveJs = await readFile(new URL('../workout/save.js', import.meta.url), 'utf8');
const appJs = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const workoutGesturesJs = await readFile(new URL('../app/workout-gestures.js', import.meta.url), 'utf8');
const loadJs = await readFile(new URL('../workout/load.js', import.meta.url), 'utf8');
const sessionsJs = await readFile(new URL('../workout/sessions.js', import.meta.url), 'utf8');
const styleCss = readAppCssSync();
const swJs = await readFile(new URL('../sw.js', import.meta.url), 'utf8') + await readFile(new URL('../runtime-assets.js', import.meta.url), 'utf8');
const configJs = await readFile(new URL('../config.js', import.meta.url), 'utf8');
const runningSessionJs = await readFile(new URL('../workout/running-session.js', import.meta.url), 'utf8');
const runningMapJs = await readFile(new URL('../workout/running-map.js', import.meta.url), 'utf8');
const calendarJs = await readFile(new URL('../render-calendar.js', import.meta.url), 'utf8');
const calendarDetailTemplateJs = await readFile(new URL('../calendar/detail-template.js', import.meta.url), 'utf8');
const sessionPolicyJs = await readFile(new URL('../workout/session-policy.js', import.meta.url), 'utf8');
const runningModelJs = await readFile(new URL('../workout/running-model.js', import.meta.url), 'utf8');
const runningDraftStoreJs = await readFile(new URL('../workout/running-draft-store.js', import.meta.url), 'utf8');
const cardioModelJs = await readFile(new URL('../workout/cardio-model.js', import.meta.url), 'utf8');
const sessionHydrationJs = await readFile(new URL('../workout/session-hydration.js', import.meta.url), 'utf8');
const runningInputJs = await readFile(new URL('../workout/running-input.js', import.meta.url), 'utf8');

test('running session mounts as an inline card below the day summary instead of a full-screen root', () => {
  assert.match(indexHtml, /id="wt-chip-running"[^>]*data-action="workout:switch-type"[^>]*data-action-arg="running"[^>]*>🏃 런닝\/조깅<\/button>/);
  assert.doesNotMatch(indexHtml, /id="wt-running-session-root"/);
  assert.match(calendarDetailTemplateJs, /data-wt-running-session-host/);
  assert.match(calendarDetailTemplateJs, /id="wt-running-session-root" class="wt-running-inline-root"/);
  assert.match(calendarJs, /wtMountRunningSession\(\)/);
  assert.match(runningSessionJs, /export function wtMountRunningSession/);
  assert.match(runningSessionJs, /wt-running-live-card/);
  assert.doesNotMatch(runningSessionJs, /document\.body\.appendChild\(root\)/);
  assert.doesNotMatch(runningSessionJs, /wt-running-screen--start/);
  assert.doesNotMatch(indexHtml, /id="wt-running-section"/);
  assert.doesNotMatch(indexHtml, /id="wt-run-distance"/);
  assert.doesNotMatch(indexHtml, /id="wt-run-gps-primary"/);
});

test('workout type switcher opens the running session instead of a detail section', () => {
  assert.doesNotMatch(workoutTypeUi, /running:\s*'wt-running-section'/);
  assert.match(workoutTypeUi, /type === 'running'/);
  assert.match(workoutTypeUi, /wtOpenRunningSession/);
  assert.match(workoutTypeUi, /\.\/running-session\.js/);
});

test('exercise picker category renders running and cardio as body-category tiles', () => {
  assert.match(exercisesJs, /PICKER_BODY_CATEGORIES/);
  assert.match(exercisesJs, /data-picker-body-category="\$\{_escPicker\(category\.id\)\}"/);
  assert.match(exercisesJs, /data-picker-body-action="\$\{_escPicker\(category\.action\)\}"/);
  assert.match(exercisesJs, /assets\/workout\/muscles\/full-body\.png/);
  assert.match(exercisesJs, /런닝\/조깅/);
  assert.match(exercisesJs, /id:\s*'cardio'/);
  assert.match(exercisesJs, /action:\s*'cardio'/);
  assert.match(exercisesJs, /유산소/);
  assert.match(exercisesJs, /CARDIO_PICKER_EXERCISES/);
  assert.match(cardioModelJs, /CARDIO_PICKER_ASSET_BASE/);
  assert.match(exercisesJs, /function _pickerCardioFigureHtml/);
  assert.match(exercisesJs, /data-picker-cardio-img/);
  assert.match(cardioModelJs, /트레드밀 러닝/);
  assert.match(cardioModelJs, /마이마운틴/);
  assert.match(cardioModelJs, /스텝머신/);
  assert.match(cardioModelJs, /실내 자전거/);
  assert.match(cardioModelJs, /로잉/);
  assert.match(cardioModelJs, /인도어 사이클링/);
  assert.match(cardioModelJs, /리컴번트 바이크/);
  assert.match(cardioModelJs, /assets\/workout\/cardio\/[\s\S]*treadmill-running\.png/);
  assert.match(cardioModelJs, /assets\/workout\/cardio\/[\s\S]*my-mountain\.png/);
  assert.match(exercisesJs, /function _openPickerCardioList/);
  assert.match(exercisesJs, /data-picker-cardio-id/);
  assert.match(exercisesJs, /function _openManualCardioInput/);
  assert.match(exercisesJs, /id="ex-cardio-kcal"/);
  assert.match(exercisesJs, /id="ex-cardio-distance"/);
  assert.match(exercisesJs, /id="ex-cardio-speed"/);
  assert.match(exercisesJs, /id="\$\{_escPicker\(config\.inputId\)\}"/);
  assert.match(cardioModelJs, /angleDeg/);
  assert.match(cardioModelJs, /level/);
  assert.match(exercisesJs, /id="ex-cardio-laps"/);
  assert.match(exercisesJs, /_buildManualCardioEntry/);
  assert.match(cardioModelJs, /const cardioData = \{/);
  assert.match(cardioModelJs, /cardio: cardioData/);
  assert.match(cardioModelJs, /source: 'manual-cardio'/);
  assert.match(cardioModelJs, /function estimateManualCardioCalories/);
  assert.match(exercisesJs, /saveWorkoutDay\(\{ silent: true \}\)/);
  assert.doesNotMatch(exercisesJs, /S\.workout\.exercises = \[\]/);
  assert.doesNotMatch(exercisesJs, /function _snapshotManualCardioPreviousWorkout/);
  assert.doesNotMatch(exercisesJs, /PICKER_MANUAL_CARDIO_SESSION_INDEX = 2/);
  assert.doesNotMatch(exercisesJs, /data-picker-activity=/);
  assert.doesNotMatch(exercisesJs, /wt-running-section/);
});

test('running picker tile and inline session card have dedicated styles', () => {
  assert.match(styleCss, /\.ex-picker-body-category-tile \.ex-picker-muscle-name/);
  assert.match(styleCss, /\.ex-picker-body-figure--cardio/);
  assert.match(styleCss, /\.ex-picker-cardio-item/);
  assert.match(styleCss, /\.ex-picker-cardio-backdrop/);
  assert.match(styleCss, /\.ex-picker-cardio-fields/);
  assert.match(styleCss, /\.ex-picker-cardio-preview/);
  assert.match(styleCss, /\.ex-block--cardio/);
  assert.match(styleCss, /\.wt-cardio-read-card/);
  assert.match(styleCss, /\.ex-picker-body-figure/);
  assert.match(styleCss, /\.ex-picker-cardio-figure/);
  assert.doesNotMatch(styleCss, /\.ex-picker-activity-figure/);
  assert.match(styleCss, /\.wt-running-inline-host/);
  assert.match(styleCss, /\.wt-running-inline-root/);
  assert.match(styleCss, /\.wt-running-live-card/);
  assert.match(styleCss, /\.wt-running-live-state/);
  assert.match(styleCss, /\.wt-running-live-status/);
  assert.match(styleCss, /image-rendering:\s*auto/);
  assert.match(styleCss, /-webkit-font-smoothing:\s*antialiased/);
  assert.match(styleCss, /width:\s*min\(24vw,\s*110px\)/);
  assert.match(styleCss, /cursor:\s*grab/);
  assert.doesNotMatch(styleCss, /\.wt-running-session-route-svg/);
  assert.doesNotMatch(styleCss, /run-map-road/);
  assert.doesNotMatch(styleCss, /\.wt-running-gps\b/);
  assert.doesNotMatch(styleCss, /\.wt-run-tip-card/);
  assert.doesNotMatch(styleCss, /\.wt-run-float/);
  assert.doesNotMatch(styleCss, /\.wt-run-map-label/);
});

test('running live progress does not show fake swipe pagination dots', () => {
  assert.doesNotMatch(runningSessionJs, /wt-run-live-pages/);
  assert.doesNotMatch(styleCss, /\.wt-run-live-pages/);
});

test('running session keeps Korean voice guidance without the separate setup screen', () => {
  assert.match(runningSessionJs, /DEFAULT_RUNNING_GOAL/);
  assert.match(runningSessionJs, /RUNNING_GOAL_DEFAULTS/);
  assert.match(runningSessionJs, /function _runningGoalProgress/);
  assert.match(runningSessionJs, /function _checkRunningAudioCues/);
  assert.match(runningSessionJs, /announcedSplits/);
  assert.match(runningSessionJs, /announcedGoalHalf/);
  assert.match(runningSessionJs, /announcedGoalDone/);
  assert.match(runningSessionJs, /SpeechSynthesisUtterance/);
  assert.match(runningSessionJs, /utterance\.lang = 'ko-KR'/);
  assert.match(runningSessionJs, /킬로미터 통과/);
  assert.match(runningSessionJs, /목표를 완료했습니다/);
  assert.doesNotMatch(runningSessionJs, /data-running-action="audio-toggle"/);
  assert.doesNotMatch(runningSessionJs, /data-running-action="goal-save"/);
  assert.doesNotMatch(runningSessionJs, /name="running-goal-type"/);
});

test('running session publishes home life-zone live state without rendering a duplicate home track', () => {
  assert.match(runningSessionJs, /function _publishRunningLiveState/);
  assert.match(runningSessionJs, /setRunningLiveState\(detail\)/);
  assert.match(runningSessionJs, /life-zone:running-live/);
  assert.match(runningSessionJs, /routeSummary/);
  assert.match(runningSessionJs, /placeSummary:\s*_session\.placeSummary \|\| \(routeSummary \? _runningPlaceFallback\(routeSummary\) : null\)/);
  assert.match(runningSessionJs, /previewPoint/);
  assert.match(runningSessionJs, /const shouldResolvePlace = active[\s\S]*routeSummary\?\.centroid[\s\S]*_ensureRunningPlaceSummary\(routeSummary\)\.then/);
  assert.match(runningSessionJs, /route,\s*\n\s*routeSummary/);
  assert.match(runningSessionJs, /_publishRunningLiveState\(true\);[\s\S]*function _startWatch/);
  assert.match(appJs, /document\.addEventListener\('life-zone:running-live'/);
  assert.match(appJs, /function _scheduleRunningLiveHomeRender/);
  assert.match(appJs, /_runningLiveRenderTimer = setTimeout/);

  assert.doesNotMatch(runningSessionJs, /function _renderLiveTrackStage/);
  assert.doesNotMatch(runningSessionJs, /wt-run-home-track-stage/);
  assert.doesNotMatch(runningSessionJs, /progress-bubble/);
  assert.doesNotMatch(runningSessionJs, /wt-run-home-runner/);
  assert.doesNotMatch(runningSessionJs, /running-track-live\.png/);

  assert.doesNotMatch(styleCss, /\.wt-run-home-track-stage/);
  assert.doesNotMatch(styleCss, /\.wt-run-home-track-map-bubble/);
  assert.doesNotMatch(styleCss, /@keyframes wt-run-home-runner-lap/);
  assert.doesNotMatch(styleCss, /assets\/workout\/running-track-live\.png/);
});

test('saved and live running cards render the real map inside their cards', () => {
  assert.match(configJs, /PUBLIC_VWORLD_MAP_KEY/);
  assert.match(configJs, /cfg_running_map_provider/);
  assert.match(configJs, /cfg_vworld_api_key/);
  assert.match(configJs, /cfg_vworld_map_layer/);
  assert.match(configJs, /cfg_google_maps_key/);
  assert.match(configJs, /cfg_tmap_app_key/);
  assert.match(runningMapJs, /buildVworldTileUrl/);
  assert.match(runningMapJs, /wt-vworld-map/);
  assert.match(runningMapJs, /buildGoogleMapsScriptUrl/);
  assert.match(runningMapJs, /buildTmapScriptUrl/);
  assert.match(runningMapJs, /Tmapv2\.Map/);
  assert.match(runningMapJs, /google\.maps/);
  assert.match(runningMapJs, /devicePixelRatio/);
  assert.match(runningMapJs, /tileCssSize/);
  assert.match(runningMapJs, /pointerdown/);
  assert.match(runningMapJs, /wheel/);
  assert.match(runningMapJs, /dblclick/);
  assert.match(runningMapJs, /pointerDistance/);
  assert.match(runningMapJs, /function _vworldZoomForRoute/);
  assert.match(runningMapJs, /const pad = 72/);
  assert.doesNotMatch(runningMapJs, /RUNNING_MAP_HOME_MAX_ZOOM/);
  assert.match(calendarJs, /renderRunningMap/);
  assert.match(calendarJs, /data-wt-running-route-map/);
  assert.match(runningSessionJs, /readRunningMapConfig/);
  assert.match(runningSessionJs, /data-running-real-map="live"/);
  assert.match(runningSessionJs, /data-running-live-map/);
  assert.match(runningSessionJs, /renderRunningMap\(shell, \{ points, phase \}\)/);
  assert.doesNotMatch(runningMapJs, /키를 설정하면/);
  assert.doesNotMatch(runningSessionJs, /밤에 러닝하시나요/);
  assert.doesNotMatch(runningSessionJs, /러닝 가이드/);
  assert.doesNotMatch(runningSessionJs, /현재 위치/);
  assert.doesNotMatch(runningSessionJs, /wt-run-map-label/);
  assert.doesNotMatch(runningSessionJs, /wt-run-tip-card/);
  assert.doesNotMatch(runningSessionJs, /wt-run-float/);
  assert.doesNotMatch(runningSessionJs, /buildRunningSessionRouteSvg/);
  assert.doesNotMatch(runningSessionJs, /<svg class="wt-running-session-route-svg/);
});

test('running session is wired into app init, save, load, and sessions', () => {
  assert.doesNotMatch(activityFormsJs, /initRunningTracker|renderRunningTracker/);
  assert.match(workoutIndexJs, /initRunningSession/);
  assert.match(workoutIndexJs, /export \{ initRunningSession, wtMountRunningSession, wtOpenRunningSession/);
  assert.match(workoutIndexJs, /import \{ loadWorkoutDate, changeWorkoutDate, goToTodayWorkout \}\s+from '\.\/load\.js';/);
  assert.match(workoutIndexJs, /configureWearWorkoutBridge\(\{[\s\S]*loadWorkoutDate,[\s\S]*saveWorkoutDay/);
  assert.match(workoutGesturesJs, /wtHandleRunningSessionBack/);
  assert.doesNotMatch(saveJs, /wt-run-distance|wt-run-duration-min|wt-run-duration-sec|wt-run-memo/);
  assert.match(saveJs, /runRoute:\s*Array\.isArray\(run\.route\) \? run\.route : \[\]/);
  assert.match(saveJs, /runPlaceSummary:\s*run\.placeSummary \|\| null/);
  assert.match(sessionHydrationJs, /route:\s*Array\.isArray\(source\.runRoute\) \? source\.runRoute : \[\]/);
  assert.match(loadJs, /if \(active === 'running'\) active = 'gym'/);
  assert.match(sessionsJs, /'runRoute'/);
  assert.match(sessionsJs, /function _aggregateRunningSessions/);
  assert.match(sessionsJs, /multiSession:\s*true/);
});

test('running summary save opens the saved workout day detail sheet', () => {
  assert.match(appJs, /openWorkoutDaySheet,/);
  assert.match(appJs, /async function openWorkoutDaySheetFromAction/);
  assert.match(appJs, /openWorkoutDaySheet\(dateKey,[\s\S]*sheetState:\s*'full'/);
  assert.match(runningSessionJs, /_ensureRunningWorkoutDate\(draft\.dateKey, \{ allowCurrent: false \}\)/);
  assert.match(runningSessionJs, /const targetSessionIndex = _workoutSessionIndexFromState\(\)/);
  assert.match(runningSessionJs, /const saved = await saveWorkoutDay\(\{ silent: true \}\)/);
  assert.match(runningSessionJs, /if \(!saved\) throw new Error\('running save skipped: workout date is unavailable or invalid'\)/);
  assert.match(runningSessionJs, /openWorkoutDaySheet\(targetDateKey, \{[\s\S]*sessionIndex:\s*targetSessionIndex,[\s\S]*action:\s*'running:save-detail'/);
  assert.match(runningSessionJs, /wtCloseRunningSession\(\);[\s\S]*if \(targetDateKey\)/);
  assert.match(saveJs, /if \(!ctx\) return false/);
  assert.match(saveJs, /return true;\s*\n}/);
});

test('a new running summary cannot inherit an immutable route ref from a previous run', () => {
  const syncStart = runningSessionJs.indexOf('function _syncWorkoutRunData');
  const syncEnd = runningSessionJs.indexOf('\nfunction ', syncStart + 1);
  const syncBlock = runningSessionJs.slice(syncStart, syncEnd);
  assert.match(syncBlock, /const routeRef = _matchingCapturedRouteReference\(S\.workout\.runData\?\.routeRef, route\)/);
  assert.match(syncBlock, /routeRef,/);
  assert.match(runningSessionJs, /Number\(routeRef\.firstTimestampMs\) === firstTimestampMs/);
  assert.match(runningSessionJs, /Number\(routeRef\.lastTimestampMs\) === lastTimestampMs/);
});

test('running session persists unsaved live records across app reloads', () => {
  assert.match(runningSessionJs, /RUNNING_SESSION_DRAFT_KEY_PREFIX = 'tomatofarm_running_session_draft_'/);
  assert.match(runningSessionJs, /RUNNING_SESSION_DRAFT_ACTIVE_KEY = 'tomatofarm_running_session_draft_active'/);
  assert.doesNotMatch(runningSessionJs, /ROUTE_GAP_MS/);
  assert.match(runningSessionJs, /pendingGapReason/);
  assert.match(runningSessionJs, /function _markRouteGap/);
  assert.match(runningSessionJs, /export function normalizeRunningSessionDraft/);
  assert.match(runningSessionJs, /ownerId:\s*_currentRunningDraftOwnerId\(\)/);
  assert.match(runningSessionJs, /segmentId/);
  assert.match(runningSessionJs, /gapBefore/);
  assert.match(runningSessionJs, /gapReason/);
  assert.match(runningSessionJs, /writeRunningDraftRecord\(/);
  assert.match(runningDraftStoreJs, /storage:\s*'chunked-route-v2'/);
  assert.match(runningDraftStoreJs, /RUNNING_DRAFT_ROUTE_CHUNK_SIZE = 500/);
  assert.match(runningSessionJs, /function _readRunningDraft\(\)[\s\S]*RUNNING_SESSION_DRAFT_ACTIVE_KEY[\s\S]*_runningDraftBelongsToCurrentUser/);
  assert.match(runningSessionJs, /window\.addEventListener\('pagehide', \(\) => \{[\s\S]*_markRouteGap\('pagehide'\)[\s\S]*_persistRunningDraft\('pagehide'\)/);
  assert.match(runningSessionJs, /window\.addEventListener\('beforeunload', \(\) => \{[\s\S]*_markRouteGap\('beforeunload'\)[\s\S]*_persistRunningDraft\('beforeunload'\)/);
  assert.match(runningSessionJs, /document\.addEventListener\('visibilitychange', \(\) => \{[\s\S]*document\.hidden[\s\S]*_persistRunningDraft\('visibility hidden'\)/);
  assert.match(runningSessionJs, /function _restoreRunningDraftIfAvailable\(\)[\s\S]*_applyRunningDraft\(draft\)[\s\S]*_startWatch\(\)/);
  assert.match(runningSessionJs, /function _applyRunningDraftDate\(dateKey\)/);
  assert.match(runningSessionJs, /S\.shared\.date = date/);
  assert.match(runningSessionJs, /function _ensureRunningWorkoutDate\(dateKey, options = \{\}\)/);
  assert.match(runningSessionJs, /export function wtRestoreRunningSessionIfActive/);
  assert.match(runningSessionJs, /export function wtOpenRunningSession\(\) \{[\s\S]*if \(wtRestoreRunningSessionIfActive\(\)\) return/);
  assert.match(appJs, /wtRestoreRunningSessionIfActive/);
  const restoreCallIndex = appJs.indexOf('runningSessionRestored = wtRestoreRunningSessionIfActive');
  assert.ok(restoreCallIndex > 0, 'app init should explicitly restore a running draft after login');
  const popupIndex = appJs.indexOf('showDietPremiumReportIfNeeded().catch', restoreCallIndex);
  assert.ok(popupIndex > restoreCallIndex, 'running draft restore must run before ordinary popups');
  assert.match(appJs, /if \(!runningSessionRestored\) \{\s*loadWorkoutDate\(TODAY\.getFullYear\(\), TODAY\.getMonth\(\), TODAY\.getDate\(\)\);\s*\}/);
  assert.match(runningSessionJs, /function _finishRun\(\)[\s\S]*_persistRunningDraft\('finish'\)/);
  assert.match(runningSessionJs, /export function wtCloseRunningSession\(\) \{[\s\S]*_clearRunningDraft\(\);[\s\S]*_resetLiveSession\(\);/);
});

test('running records save into a dedicated running session with place and device metrics', () => {
  assert.match(sessionPolicyJs, /WORKOUT_RUNNING_SESSION_INDEX = WORKOUT_GYM_SESSION_COUNT/);
  assert.match(sessionPolicyJs, /RUNNING_SESSION_ID = 'running-track'/);
  assert.match(runningSessionJs, /return WORKOUT_RUNNING_SESSION_INDEX/);
  assert.match(runningSessionJs, /applyRunningDataToWorkout\(S\.workout/);
  assert.match(runningModelJs, /workout\.sessionId = options\.sessionId/);
  assert.match(runningInputJs, /memo:\s*context\.memo \|\| ''/);
  assert.doesNotMatch(runningSessionJs, /러닝 세션/);
  assert.doesNotMatch(runningSessionJs, /대한민국 위치 기록/);

  assert.match(runningSessionJs, /export async function resolveRunningPlaceSummary/);
  assert.match(runningSessionJs, /api\.vworld\.kr\/req\/address/);
  assert.match(runningSessionJs, /type=BOTH/);
  assert.match(runningSessionJs, /level4A/);
  assert.match(runningSessionJs, /level4L/);
  assert.match(runningSessionJs, /adminArea/);

  assert.match(runningSessionJs, /function _readRunningSensorSnapshot/);
  assert.match(runningSessionJs, /window\.__tomatoRunningSensorSnapshot/);
  assert.match(runningSessionJs, /window\.__tomatoRunningSensors\?\.getSnapshot/);
  assert.match(runningSessionJs, /window\.TomatoRunningSensors\?\.getSnapshot/);
  assert.match(runningSessionJs, /altitude:\s*_optionalFiniteNumber/);
  assert.match(runningSessionJs, /heartRateBpm:\s*_optionalNumber/);
  assert.match(runningSessionJs, /cadenceSpm:\s*_optionalNumber/);
  assert.match(runningSessionJs, /const bpm = summary\.avgHeartRateBpm/);
  assert.match(runningSessionJs, /\{ label: '심박', value: bpm == null \? '--' : `\$\{Math\.round\(bpm\)\} bpm` \}/);
  assert.match(runningSessionJs, /\{ label: '평균 페이스', value: pace \}/);
  assert.doesNotMatch(runningSessionJs, /label: '칼로리'|estimateRunningCalories|GPS 측정 중|GPS 정확도/);
  assert.match(runningSessionJs, /OUTDOOR RUN/);
  assert.match(runningSessionJs, /RUN COMPLETE/);
});

test('running workout save writes a running life-zone snapshot', () => {
  assert.match(saveJs, /hasLifeZoneDietActivity,\s*hasLifeZoneRunningActivity,\s*hasLifeZoneWorkoutActivity/);
  assert.match(saveJs, /const state = hasLifeZoneRunningActivity\(payload\) \? 'running' : 'workout';/);
  assert.match(saveJs, /const snapshot = active \? \{ state, updatedAt: Date\.now\(\) \} : null;/);
});

test('service worker cache version was bumped for running session assets', () => {
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
  assert.match(swJs, /\.\/workout\/index\.js/);
  assert.doesNotMatch(swJs, /\.\/workout\/index\.js\?v=/);
  assert.match(swJs, /\.\/workout\/running-map\.js/);
  assert.match(swJs, /\.\/workout\/running-session\.js/);
  assert.match(swJs, /\.\/workout\/running-live-accumulator\.js/);
  assert.match(swJs, /\.\/workout\/running-draft-store\.js/);
  assert.match(swJs, /\.\/assets\/home\/life-zone\/sprites\/jups-running-track\.png/);
  assert.match(swJs, /\.\/assets\/home\/life-zone\/sprites\/moonjung-tomato-running-track\.png/);
  assert.match(swJs, /\.\/assets\/home\/life-zone\/sprites\/lee-jaeheon-running-track\.png/);
  assert.doesNotMatch(swJs, /\.\/assets\/workout\/running-track-live\.png/);
  assert.doesNotMatch(swJs, /\.\/workout\/running-tracker\.js/);
});
