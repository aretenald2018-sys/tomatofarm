import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modalHtml = await readFile(new URL('../modals/ex-picker-modal.js', import.meta.url), 'utf8');
const exercisesJs = await readFile(new URL('../workout/exercises.js', import.meta.url), 'utf8');

test('exercise picker no longer renders footer done controls', () => {
  assert.doesNotMatch(modalHtml, /id="ex-picker-done"/);
  assert.doesNotMatch(modalHtml, /class="ex-picker-footer"/);
});

test('exercise picker row selection closes picker and focuses the selected record card by default', () => {
  const selectionIndex = exercisesJs.indexOf('const selection = selectWorkoutExerciseEntry(S.workout.exercises, ex');
  assert.ok(selectionIndex > 0, 'missing picker row exercise selection helper');
  const selectionHandler = exercisesJs.slice(Math.max(0, selectionIndex - 760), selectionIndex + 1900);
  const renderStart = exercisesJs.indexOf('export function _renderPickerList()');
  const renderEnd = exercisesJs.indexOf('export async function wtOpenExercisePicker', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, 'picker list renderer should exist');
  const renderFn = exercisesJs.slice(renderStart, renderEnd);
  assert.match(exercisesJs, /selectWorkoutExerciseEntry,\s*\n\s*workoutExerciseSelectionDetail,/);
  assert.match(exercisesJs, /async function _selectPickerExercise\(ex\)/);
  assert.match(exercisesJs, /function _handlePickerListClick\(event\)/);
  assert.match(exercisesJs, /container\.addEventListener\('click', _handlePickerListClick\)/);
  assert.match(exercisesJs, /container\.addEventListener\('keydown', _handlePickerListKeydown\)/);
  assert.match(renderFn, /_bindPickerListActions\(container\)/);
  assert.match(renderFn, /btn\.dataset\.pickerExerciseId = ex\.id/);
  assert.match(renderFn, /data-picker-row-action="edit"/);
  assert.match(renderFn, /data-picker-row-action="hide"/);
  assert.match(renderFn, /data-picker-row-action="delete"/);
  assert.doesNotMatch(renderFn, /btn\.addEventListener\('click'/);
  assert.match(selectionHandler, /const afterSelect = _consumePickerAfterSelect\(\)/);
  assert.match(selectionHandler, /const shouldRefreshWorkoutTab = !afterSelect/);
  assert.match(selectionHandler, /selectWorkoutExerciseEntry\(S\.workout\.exercises, ex,/);
  assert.match(selectionHandler, /_ensureExpertManualSession\(\)/);
  assert.match(selectionHandler, /return _buildPickerExerciseEntry\(exercise\)/);
  assert.match(selectionHandler, /if \(selection\.existing\)/);
  assert.match(selectionHandler, /wtFocusWorkoutEntryCard\(selection\.entryIdx\)/);
  assert.match(selectionHandler, /if \(shouldRefreshWorkoutTab\) \{[\s\S]*_renderExerciseList\(\)[\s\S]*_syncExpertTopArea\(\)[\s\S]*_refreshWorkoutTimeline\('exercise add'\)[\s\S]*\}/);
  assert.match(selectionHandler, /wtCloseExercisePicker\(\)/);
  assert.match(selectionHandler, /const savePromise = saveWorkoutDay\(\{ silent: true, keepDraftExercises: !!afterSelect \}\)/);
  assert.match(selectionHandler, /wtFocusWorkoutEntryCard\(entryIdx\)/);
  assert.doesNotMatch(selectionHandler, /S\.workout\.exercises\.push\(_buildPickerExerciseEntry\(ex\)\)/);
  assert.doesNotMatch(selectionHandler, /pushWorkoutDetail/);
  assert.doesNotMatch(selectionHandler, /btn\.classList\.add\('already'\)/);
  assert.doesNotMatch(selectionHandler, /name\.textContent/);
});

test('exercise picker supports sheet afterSelect without record-card focus', () => {
  assert.match(exercisesJs, /let _pickerAfterSelect = null/);
  assert.match(exercisesJs, /function _consumePickerAfterSelect\(\)/);
  assert.match(exercisesJs, /async function _runPickerAfterSelect\(handler, detail = \{\}\)/);
  assert.match(exercisesJs, /export async function wtOpenExercisePicker\(options = \{\}\)/);
  assert.match(exercisesJs, /Object\.prototype\.hasOwnProperty\.call\(options \|\| \{\}, 'afterSelect'\)/);
  const selectionIndex = exercisesJs.indexOf('const selection = selectWorkoutExerciseEntry(S.workout.exercises, ex');
  const selectionHandler = exercisesJs.slice(Math.max(0, selectionIndex - 760), selectionIndex + 1900);
  assert.match(selectionHandler, /if \(afterSelect\) \{[\s\S]*_runPickerAfterSelect\(afterSelect, workoutExerciseSelectionDetail\(selection\)\)/);
  assert.match(selectionHandler, /const shouldRefreshWorkoutTab = !afterSelect/);
  assert.match(selectionHandler, /if \(shouldRefreshWorkoutTab\) \{[\s\S]*_renderExerciseList\(\)[\s\S]*_refreshWorkoutTimeline\('exercise add'\)[\s\S]*\}[\s\S]*wtPersistActiveWorkoutDraft\('exercise add'\)/);
  assert.match(selectionHandler, /saveWorkoutDay\(\{ silent: true, keepDraftExercises: !!afterSelect \}\)/);
  const saveIndex = selectionHandler.indexOf('const savePromise = saveWorkoutDay');
  const refreshIndex = selectionHandler.indexOf('await _runPickerAfterSelect', saveIndex);
  const backgroundSaveIndex = selectionHandler.indexOf('savePromise.catch', saveIndex);
  assert.ok(saveIndex >= 0 && refreshIndex > saveIndex, 'sheet refresh should follow draft persistence');
  assert.ok(backgroundSaveIndex > saveIndex && backgroundSaveIndex < refreshIndex, 'remote save errors should be handled without delaying the immediate sheet refresh');
  assert.equal(selectionHandler.indexOf('await savePromise', saveIndex), -1, 'picker selection must not wait for remote save before rendering');
  assert.match(selectionHandler, /if \(afterSelect\) \{[\s\S]*return;[\s\S]*\}[\s\S]*wtFocusWorkoutEntryCard\(entryIdx\)/);
});

test('manual cardio picker also refreshes the sheet before remote save settles', () => {
  const start = exercisesJs.indexOf('async function _saveManualCardioFromSheet');
  const end = exercisesJs.indexOf('function _bindManualCardioSheet', start);
  assert.ok(start >= 0 && end > start, 'manual cardio sheet save function should exist');
  const saveFn = exercisesJs.slice(start, end);
  const saveIndex = saveFn.indexOf('const savePromise = saveWorkoutDay');
  const refreshIndex = saveFn.indexOf('await _runPickerAfterSelect', saveIndex);
  const backgroundSaveIndex = saveFn.indexOf('savePromise.catch', saveIndex);

  assert.match(saveFn, /saveWorkoutDay\(\{ silent: true, keepDraftExercises: !!afterSelect \}\)/);
  assert.ok(refreshIndex > saveIndex);
  assert.ok(backgroundSaveIndex > saveIndex && backgroundSaveIndex < refreshIndex);
  assert.equal(saveFn.indexOf('await savePromise', saveIndex), -1);
});

test('exercise editor can close without reopening the picker for calendar goal input', () => {
  assert.match(exercisesJs, /let _exerciseEditorReturnToPicker = true/);
  assert.match(exercisesJs, /function _setExerciseEditorReturnMode\(options = \{\}\)/);
  assert.match(exercisesJs, /_exerciseEditorReturnToPicker = options\?\.returnToPicker !== false/);
  assert.match(exercisesJs, /function _finishExerciseEditorReturn\(options = \{\}\)/);
  assert.match(exercisesJs, /export function wtOpenExerciseEditor\(exId, defaultMuscleId, options = \{\}\)/);

  const returnStart = exercisesJs.indexOf('function _finishExerciseEditorReturn(options = {})');
  const returnEnd = exercisesJs.indexOf('export function wtOpenExerciseEditor', returnStart);
  assert.ok(returnStart >= 0 && returnEnd > returnStart, 'editor return helper should exist before editor open');
  const returnHelper = exercisesJs.slice(returnStart, returnEnd);
  assert.match(returnHelper, /const returnToPicker = _exerciseEditorReturnToPicker !== false/);
  assert.match(returnHelper, /_exerciseEditorReturnToPicker = true/);
  assert.match(returnHelper, /if \(returnToPicker\) wtOpenExercisePicker\(\)/);
  // 새 종목을 그날 기록에 바로 담는 경로만 피커 재오픈을 건너뛴다.
  assert.match(returnHelper, /if \(options\?\.reopenPicker === false\) return;/);

  const closeStart = exercisesJs.indexOf('export function wtCloseExerciseEditor');
  const closeEnd = exercisesJs.indexOf('export async function wtSaveExerciseFromEditor', closeStart);
  assert.ok(closeStart >= 0 && closeEnd > closeStart, 'editor close function should exist');
  const closeFn = exercisesJs.slice(closeStart, closeEnd);
  assert.match(closeFn, /_finishExerciseEditorReturn\(\)/);

  const saveStart = exercisesJs.indexOf('export async function wtSaveExerciseFromEditor');
  const saveEnd = exercisesJs.indexOf('export async function wtDeleteExerciseFromEditor', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart, 'editor save function should exist');
  const saveFn = exercisesJs.slice(saveStart, saveEnd);
  assert.match(saveFn, /_finishExerciseEditorReturn\(\);/);
  assert.match(saveFn, /_finishExerciseEditorReturn\(\{ reopenPicker: false \}\)/);

  const deleteStart = exercisesJs.indexOf('export async function wtDeleteExerciseFromEditor');
  assert.ok(deleteStart >= 0, 'editor delete function should exist');
  const deleteFn = exercisesJs.slice(deleteStart);
  assert.match(deleteFn, /_finishExerciseEditorReturn\(\)/);
});
