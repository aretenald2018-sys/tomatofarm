import { readAppCssSync } from './helpers/css-source.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const exercisesJs = await readFile(new URL('../workout/exercises.js', import.meta.url), 'utf8');
const editorActionsJs = await readFile(new URL('../workout/exercise-editor-actions.js', import.meta.url), 'utf8');
const dataLoadJs = await readFile(new URL('../data/data-load.js', import.meta.url), 'utf8');
const styleCss = readAppCssSync();
const swJs = await readFile(new URL('../sw.js', import.meta.url), 'utf8') + await readFile(new URL('../runtime-assets.js', import.meta.url), 'utf8');

test('exercise editor renders program controls backed by test_board_v2', () => {
  assert.match(exercisesJs, /getTestBoardV2,\s*saveTestBoardV2/);
  assert.match(exercisesJs, /getExerciseProgramSettings/);
  assert.match(exercisesJs, /upsertExerciseProgramBenchmark/);
  assert.match(exercisesJs, /id = 'ex-editor-program-wrap'/);
  assert.match(exercisesJs, /data-ex-program-mode="\$\{item\.id\}"/);
  assert.match(exercisesJs, /data-ex-program-mode="custom"[\s\S]*disabled/);
  assert.match(exercisesJs, /id="ex-program-wendler-tm"/);
  assert.match(exercisesJs, /id="ex-program-wendler-supp"/);
  assert.match(exercisesJs, /id="ex-program-start-date"/);
  assert.match(exercisesJs, /data-ex-program-calendar-toggle/);
  assert.match(exercisesJs, /function _renderProgramStartCalendar/);
  assert.match(exercisesJs, /class="ex-program-calendar-row"/);
  assert.match(exercisesJs, /_programCycleHint\(programStartDate,\s*isOriginal863 \? 7 : 6\)/);
  assert.match(exercisesJs, /programStartDate:\s*document\.getElementById\('ex-program-start-date'\)/);
  assert.match(exercisesJs, /data-ex-program-tm-calc/);
  assert.match(exercisesJs, /estimate1RM\(kg,\s*reps\)/);
  assert.match(exercisesJs, /id="ex-program-tm-calc-kg"/);
  assert.match(exercisesJs, /id="ex-program-tm-calc-reps"/);
  assert.match(exercisesJs, /실제 1RM보다 낮은 기준 중량/);
  assert.match(exercisesJs, /보조 세트에 쓰는 TM 비율/);
  assert.match(exercisesJs, /const todayKey = _todayDateKey\(\) \|\| dateKey/);
  assert.match(exercisesJs, /todayKey,\s*\n\s*movements: MOVEMENTS/);
  assert.doesNotMatch(exercisesJs, /todayKey:\s*dateKey,/);
  assert.doesNotMatch(exercisesJs, /id="ex-program-wendler-start"[^>]+type="number"/);
});

test('8/6/3 original editor and workout card expose profile, 1RM, recovery roles, and direct PR confirmation binding', () => {
  assert.match(exercisesJs, /8\/6\/3 원본/);
  assert.match(exercisesJs, /id="ex-program-w863-profile"/);
  assert.match(exercisesJs, /id="ex-program-w863-one-rm"/);
  assert.match(exercisesJs, /data-wendler-supp-fields/);
  assert.match(exercisesJs, /data-action="confirm-w863-pr"/);
  assert.match(exercisesJs, /function _bindW863PrChip[\s\S]*addEventListener\('click'/);
  assert.match(exercisesJs, /wendlerRole === 'heavy_single'[\s\S]*return '조커'/);
  assert.match(exercisesJs, /wendlerRole === 'backoff'[\s\S]*return 'FSL'[\s\S]*return 'SSL'[\s\S]*return '백오프'/);
  assert.match(exercisesJs, /wendlerRole === 'deload'[\s\S]*return '회복'/);
  assert.doesNotMatch(exercisesJs, /onclick=.*confirm-w863-pr/);
});

test('exercise editor saves exercise before saving program contract', () => {
  const saveFlow = exercisesJs.slice(
    exercisesJs.indexOf('export async function wtSaveExerciseFromEditor'),
    exercisesJs.indexOf('export async function wtDeleteExerciseFromEditor'),
  );
  const saveExerciseIdx = saveFlow.indexOf('await saveExercise(record)');
  const buildRecordIdx = saveFlow.indexOf('const built = buildExerciseEditorRecord');
  const verifyHelperIdx = saveFlow.indexOf('verifyExerciseEditorSavedRecord(record, saved)');
  const verifyIdx = saveFlow.indexOf("throw new Error('saveExercise verification failed')");
  const fallbackProgramRecordIdx = saveFlow.indexOf('const programRecord = saved || record');
  const verifiedProgramRecordIdx = saveFlow.indexOf('const programRecord = verified.record');
  const saveProgramIdx = saveFlow.indexOf('await _saveExerciseProgramFromEditor(programRecord)');
  assert.match(exercisesJs, /buildExerciseEditorRecord,\s*\n\s*customExerciseMuscleId,\s*\n\s*exerciseEditorRecordId,\s*\n\s*verifyExerciseEditorSavedRecord,/);
  assert.match(editorActionsJs, /export function buildExerciseEditorRecord/);
  assert.match(editorActionsJs, /export function verifyExerciseEditorSavedRecord/);
  assert.ok(buildRecordIdx > 0, 'missing editor record builder');
  assert.ok(saveExerciseIdx > 0, 'missing saveExercise call');
  assert.ok(saveExerciseIdx > buildRecordIdx, 'saveExercise should use the built editor record');
  assert.ok(verifyHelperIdx > saveExerciseIdx, 'missing post-save verification helper before program save');
  assert.ok(verifyIdx > verifyHelperIdx, 'verification failure should still stop program save');
  assert.ok(fallbackProgramRecordIdx < 0, 'program save should no longer fall back to unverified record');
  assert.ok(verifiedProgramRecordIdx > verifyIdx, 'program save should use the verified exercise record');
  assert.ok(saveProgramIdx > verifiedProgramRecordIdx, 'program save should run after choosing the verified exercise record');
});

test('exercise editor binds save actions directly inside the modal', () => {
  const binding = exercisesJs.slice(
    exercisesJs.indexOf('function _bindExerciseEditorChrome'),
    exercisesJs.indexOf('function _renderPickerTabs'),
  );
  assert.match(binding, /const bindEditorAction = \(action, handler\)/);
  assert.match(binding, /event\.stopPropagation\(\)/);
  assert.match(binding, /bindEditorAction\('save-exercise-editor', \(\) => void wtSaveExerciseFromEditor\(\)\)/);
  assert.match(binding, /bindEditorAction\('close-exercise-editor', \(\) => wtCloseExerciseEditor\(\)\)/);
  assert.match(binding, /bindEditorAction\('delete-exercise-editor', \(\) => void wtDeleteExerciseFromEditor\(\)\)/);
});

test('exercise program board is rehydrated from settings on load', () => {
  assert.match(dataLoadJs, /_settings\.test_board_v2\s*=\s*fbMap\.test_board_v2\s*\?\?\s*null/);
});

test('exercise editor program controls have compact fixed layout styles', () => {
  assert.match(styleCss, /#ex-editor-modal \.ex-program-editor/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-seg/);
  assert.match(styleCss, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-grid-four/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-date-btn/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-mini-cal/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-calendar-row/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-mini-cal\s*{[\s\S]*?position:\s*static/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-compact-list/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-tm-calc/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-calc-btn/);
  assert.match(styleCss, /#ex-editor-modal \.ex-program-wendler \.ex-editor-input,[\s\S]*?min-height:\s*24px/);
  assert.match(styleCss, /\.ex-program-wendler \[data-wendler-tm-field\]\[hidden\],[\s\S]*?\.ex-program-wendler \[data-wendler-supp-fields\]\[hidden\][\s\S]*?display:\s*none/);
  assert.match(swJs, /const CACHE_VERSION = 'tomatofarm-v\d{8}z\d+-[^']+';/);
});
