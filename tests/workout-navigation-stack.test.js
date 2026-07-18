import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  WORKOUT_ROUTES,
  closeWorkoutDaySheet,
  currentWorkoutRoute,
  getWorkoutNavSnapshot,
  handleWorkoutBack,
  openWorkoutCalendar,
  openWorkoutDaySheet,
  resetWorkoutNavState,
  updateWorkoutCalendarState,
} from '../workout/navigation-stack.js';

test('workout back closes the calendar day sheet without legacy routes', () => {
  resetWorkoutNavState();
  updateWorkoutCalendarState({ viewYear: 2026, viewMonth: 5, scrollTop: 320 });
  openWorkoutDaySheet('2026-06-25', { sessionIndex: 1, sheetState: 'full', history: 'replace' });

  let snapshot = getWorkoutNavSnapshot();
  assert.equal(currentWorkoutRoute().name, WORKOUT_ROUTES.CALENDAR);
  assert.deepEqual(snapshot.stack, [{ name: WORKOUT_ROUTES.CALENDAR }]);
  assert.equal(snapshot.calendar.sheetOpen, true);
  assert.equal(snapshot.calendar.selectedKey, '2026-06-25');
  assert.equal(snapshot.calendar.selectedSessionIndex, 1);

  assert.equal(handleWorkoutBack({ preferHistory: false }), true);
  snapshot = getWorkoutNavSnapshot();
  assert.equal(currentWorkoutRoute().name, WORKOUT_ROUTES.CALENDAR);
  assert.deepEqual(snapshot.stack, [{ name: WORKOUT_ROUTES.CALENDAR }]);
  assert.equal(snapshot.calendar.sheetOpen, false);
  assert.equal(snapshot.calendar.sheetState, 'bar');
  assert.equal(snapshot.calendar.selectedKey, '2026-06-25');
  assert.equal(snapshot.calendar.selectedSessionIndex, 1);
  assert.equal(snapshot.calendar.scrollTop, 320);

  assert.equal(handleWorkoutBack({ preferHistory: false }), false);
});

test('sheet close leaves only the calendar route', () => {
  resetWorkoutNavState();
  openWorkoutDaySheet('2026-06-25', { sheetState: 'full', history: 'replace' });
  closeWorkoutDaySheet({ history: 'replace' });

  assert.equal(currentWorkoutRoute().name, WORKOUT_ROUTES.CALENDAR);
  assert.equal(getWorkoutNavSnapshot().calendar.sheetOpen, false);
  assert.equal(handleWorkoutBack({ preferHistory: false }), false);
});

test('inactive tab does not consume back', () => {
  resetWorkoutNavState();
  openWorkoutDaySheet('2026-06-25', { sessionIndex: 0, sheetState: 'full', history: 'replace' });

  assert.equal(handleWorkoutBack({ activeTab: 'home', preferHistory: false }), false);
  assert.equal(currentWorkoutRoute().name, WORKOUT_ROUTES.CALENDAR);
  assert.equal(getWorkoutNavSnapshot().calendar.sheetOpen, true);
});

test('calendar open can reset the workout home month to today', () => {
  resetWorkoutNavState();
  updateWorkoutCalendarState({ viewYear: 0, viewMonth: 0, selectedKey: '2026-01-01' });
  openWorkoutCalendar({
    selectedKey: '2026-06-25',
    selectedSessionIndex: 0,
    viewYear: 2026,
    viewMonth: 5,
    scrollTop: 0,
    history: 'replace',
  });
  const snapshot = getWorkoutNavSnapshot();
  assert.equal(currentWorkoutRoute().name, WORKOUT_ROUTES.CALENDAR);
  assert.equal(snapshot.calendar.selectedKey, '2026-06-25');
  assert.equal(snapshot.calendar.viewYear, 2026);
  assert.equal(snapshot.calendar.viewMonth, 5);
});

test('workout navigation keeps only rendered calendar and day sheet surfaces', async () => {
  const [appJs, calendarJs, indexHtml, workoutExercises, navJs, styleCss, swJs] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../render-calendar.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../workout/exercises.js', import.meta.url), 'utf8'),
    readFile(new URL('../workout/navigation-stack.js', import.meta.url), 'utf8'),
    Promise.resolve(readAppCssSync()),
    Promise.all([
      readFile(new URL('../sw.js', import.meta.url), 'utf8'),
      readFile(new URL('../runtime-assets.js', import.meta.url), 'utf8'),
    ]).then(parts => parts.join('\n')),
  ]);
  const workoutTabHtml = indexHtml.slice(indexHtml.indexOf('<div id="tab-workout"'), indexHtml.indexOf('<div id="tab-diet"'));

  assert.match(appJs, /enableWorkoutPwaHistory\(\{[\s\S]*getActiveTab: \(\) => _currentTab,[\s\S]*handleOverlayBack: _handleWorkoutOverlayBack/);
  assert.match(appJs, /window\.Capacitor\?\.Plugins\?\.App/);
  assert.match(appJs, /_handleWorkoutOverlayBack\(\) \|\| handleWorkoutBack/);
  assert.match(appJs, /handleWorkoutBack\(\{ activeTab: _currentTab, preferHistory: true \}\)/);
  assert.match(appJs, /const WORKOUT_PULL_BACK_THRESHOLD_PX = 72/);
  assert.match(appJs, /function initWorkoutPullBackGesture\(\)/);
  assert.match(appJs, /document\.body\?\.classList\.toggle\('wt-workout-tab-active', tab === 'workout'\)/);
  assert.match(appJs, /window\.addEventListener\('touchmove', onMove, \{ passive: false, capture: true \}\)/);
  assert.match(appJs, /handleWorkoutBack\(\{ activeTab: _currentTab, preferHistory: true, action: 'pull:back' \}\)/);
  assert.doesNotMatch(appJs, /function _isWorkoutRecordScrollTarget\(target\)/);
  assert.doesNotMatch(appJs, /wt-workout-detail-mode|wt-exercise-detail-root/);
  assert.doesNotMatch(appJs, /#tab-workout\.wt-workout-record-mode \.workout-tab-content/);
  assert.match(appJs, /return !!target\?\.closest\?\.\('input, textarea, select/);
  assert.match(appJs, /function _workoutPageScrollTop\(\)/);
  assert.match(appJs, /Number\(document\.body\?\.scrollTop\) \|\| 0/);
  assert.match(appJs, /action:\s*'calendar:tab-today'/);
  assert.match(appJs, /selectedKey:\s*_dateKeyFromParts\(TODAY\.getFullYear\(\), TODAY\.getMonth\(\), TODAY\.getDate\(\)\)/);
  assert.match(appJs, /viewYear:\s*TODAY\.getFullYear\(\)/);
  assert.match(appJs, /viewMonth:\s*TODAY\.getMonth\(\)/);
  assert.match(appJs, /async function openWorkoutDaySheetFromAction/);
  assert.match(appJs, /openWorkoutDaySheet\(dateKey,[\s\S]*sheetState:\s*'full'/);
  assert.doesNotMatch(appJs, /wtOpenWorkoutDaySheet:\s*openWorkoutDaySheetFromAction/);
  assert.doesNotMatch(appJs, /_redirectWorkoutRecordRouteToDaySheet|WORKOUT_ROUTES|currentWorkoutRoute/);
  assert.doesNotMatch(appJs, /wtOpenWorkoutRecord|openWorkoutRecordFromCalendar/);
  assert.match(appJs, /function openWorkoutTab\(y, m, d\)[\s\S]*openWorkoutDaySheetFromAction\(key, 0/);
  assert.match(appJs, /sheet:tab-open/);
  assert.doesNotMatch(appJs, /_setWorkoutSurface\('record'\)/);
  assert.doesNotMatch(appJs, /wt-workout-record-mode|wt-calendar-edit-mode/);
  assert.doesNotMatch(appJs, /pushWorkoutRecord\(/);
  assert.doesNotMatch(appJs, /wtFocusWorkoutEntryFromDetail|renderWorkoutExerciseDetail|clearWorkoutExerciseDetail/);
  assert.match(calendarJs, /openWorkoutDaySheet\(nextKey/);
  assert.match(calendarJs, /calendar\.viewYear != null && Number\.isFinite\(Number\(calendar\.viewYear\)\)/);
  assert.match(calendarJs, /\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$/);
  assert.match(calendarJs, /function _workoutHomeScrollRoot\(\)[\s\S]*document\.getElementById\('workout-calendar-root'\)/);
  assert.match(calendarJs, /function _workoutHomeScrollTop\(\)[\s\S]*const root = _workoutHomeScrollRoot\(\);[\s\S]*Number\(root\?\.scrollTop\) \|\| 0/);
  assert.match(calendarJs, /const restoreScroll = \(\) => \{[\s\S]*const root = _workoutHomeScrollRoot\(\);[\s\S]*root\.scrollTo\(\{ top, behavior: 'auto' \}\)/);
  assert.match(calendarJs, /else root\.scrollTop = top;/);
  assert.doesNotMatch(calendarJs, /window\.wtOpenWorkoutRecord|_openWorkoutEditorForSession|_loadWorkoutEditorForSession/);
  assert.doesNotMatch(workoutTabHtml, /class="wt-record-back-btn"[\s\S]*window\.wtHandleWorkoutBack\?\.\(\)/);
  assert.doesNotMatch(workoutTabHtml, /class="workout-date-nav"|id="wt-date-label"/);
  assert.doesNotMatch(indexHtml, /id="wt-exercise-detail-root"/);
  assert.doesNotMatch(workoutExercises, /pushWorkoutDetail\(\{/);
  assert.doesNotMatch(workoutExercises, /wtFocusWorkoutEntryFromDetail|renderWorkoutExerciseDetail|clearWorkoutExerciseDetail|wt-exercise-detail-root/);
  assert.match(workoutExercises, /function _findWorkoutEntryIndexByExerciseId/);
  assert.match(workoutExercises, /export function wtFocusWorkoutEntryCard/);
  assert.match(workoutExercises, /block\.dataset\.wtEntryIdx = String\(idx\)/);
  assert.match(workoutExercises, /let _pickerAfterSelect = null/);
  assert.match(workoutExercises, /export async function wtOpenExercisePicker\(options = \{\}\)/);
  assert.match(workoutExercises, /if \(afterSelect\) \{[\s\S]*_runPickerAfterSelect\(afterSelect/);
  assert.match(workoutExercises, /selectWorkoutExerciseEntry\(S\.workout\.exercises, ex/);
  assert.match(workoutExercises, /if \(selection\.existing\)[\s\S]*wtFocusWorkoutEntryCard\(selection\.entryIdx\)/);
  assert.match(workoutExercises, /const entryIdx = selection\.entryIdx/);
  assert.doesNotMatch(workoutExercises, /S\.workout\.exercises\.push\(_buildPickerExerciseEntry\(ex\)\)/);
  assert.match(workoutExercises, /wtFocusWorkoutEntryCard\(entryIdx\)/);
  assert.match(workoutExercises, /export function wtHandleExercisePickerBack\(\)/);
  assert.doesNotMatch(navJs, /WorkoutRecordScreen|WorkoutDetailScreen|pushWorkoutRecord|pushWorkoutDetail|\brecord:\s*\{|\bdetail:\s*\{/);
  assert.match(navJs, /typeof options\.handleOverlayBack === 'function' && options\.handleOverlayBack\(\)/);
  assert.match(navJs, /_writeHistory\('push', 'overlay:back'\)/);
  assert.match(appJs, /\[data-wt-calendar-scroll-surface\]/);
  assert.match(calendarJs, /<div class="cal-workout-surface \$\{surfaceClass\}"\$\{scrollSurfaceAttr\}>/);
  assert.match(calendarJs, /class="cal-workout-month-grid" data-wt-calendar-scroll-surface/);
  assert.match(styleCss, /\.cal-workout-surface-home\s*\{[\s\S]*touch-action:\s*pan-y/);
  assert.match(calendarJs, /async function _loadWorkoutStateForSheetSession/);
  assert.match(calendarJs, /await wtOpenExercisePicker\(\{[\s\S]*source:\s*'workout-day-sheet'[\s\S]*afterSelect:/);
  assert.match(styleCss, /\.cal-workout-month-grid\s*\{[\s\S]*touch-action:\s*pan-y/);
  assert.match(styleCss, /#tab-workout\.wt-calendar-home-mode\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/);
  assert.match(styleCss, /#tab-workout\.wt-calendar-home-mode > #workout-calendar-root\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*overscroll-behavior-y:\s*contain;[\s\S]*touch-action:\s*pan-y;/);
  assert.match(styleCss, /#tab-workout\.wt-calendar-home-mode > \.workout-tab-content\s*\{[\s\S]*display:\s*block;[\s\S]*pointer-events:\s*none;/);
  assert.match(styleCss, /#tab-workout\.wt-calendar-home-mode > \.workout-tab-content > :not\(#wt-workout-timer-bar\)\s*\{[\s\S]*display:\s*none !important;/);
  assert.match(styleCss, /#tab-workout\.wt-calendar-home-mode \.wt-workout-timer-bar\s*\{[\s\S]*bottom:\s*calc\(112px \+ env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.doesNotMatch(styleCss, /#tab-workout\.wt-workout-record-mode/);
  assert.doesNotMatch(styleCss, /#tab-workout\.wt-calendar-edit-mode/);
  assert.doesNotMatch(styleCss, /#tab-workout\.wt-readonly \.workout-date-nav/);
  assert.doesNotMatch(styleCss, /#tab-workout\.wt-calendar-home-mode > \.workout-date-nav/);
  assert.doesNotMatch(styleCss, /wt-workout-detail-mode|wt-exercise-detail-root|wt-exercise-detail-/);
  assert.doesNotMatch(styleCss, /\.wt-record-back-btn/);
  assert.doesNotMatch(indexHtml, /card-farm-duolingo|farm-duolingo-content/);
  assert.doesNotMatch(styleCss, /\.farm-scene\b|\.farm-inv-|\.farm-shop-|farm-idle|farm-px-|farm-toolbar|farm-status-bar/);
  assert.doesNotMatch(swJs, /\.\/home\/farm\.js/);
  assert.match(styleCss, /#tab-diet \.workout-date-nav/);
  assert.match(styleCss, /body\.wt-workout-tab-active\s*\{[\s\S]*overscroll-behavior-y:\s*none;/);
  assert.match(styleCss, /body\.wt-workout-tab-active #tab-workout\.active\s*\{[\s\S]*overscroll-behavior-y:\s*contain;/);
  assert.match(swJs, /\.\/workout\/navigation-stack\.js/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
