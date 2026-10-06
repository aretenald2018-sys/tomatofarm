import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = ['../calendar/set-keyboard.js','../render-calendar.js'].map(p=>readFileSync(new URL(p, import.meta.url),'utf8')).join('\n');
function extract(name) {
  let start=source.indexOf(`async function ${name}(`);if(start<0)start=source.indexOf(`function ${name}(`);
  const brace=source.indexOf(') {',start)+2;let depth=0;
  for(let i=brace;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}
  throw Error(name);
}
function harness(set) {
  const entry={sets:[structuredClone(set)]}, calls=[];
  const attrs=new Map([['data-date-key','2026-10-03'],['data-session-index','0'],['data-exercise-index','0'],['data-set-index','0'],['data-field','kg'],['data-wt-set-inline-input',''],['data-wt-inline-editor-key','row']]);
  const input={value:'77',matches:()=>true,getAttribute:k=>attrs.get(k)??null,hasAttribute:k=>attrs.has(k),removeAttribute:k=>attrs.delete(k)};
  const context={Number,Math,Date,Promise,console,WORKOUT_SHEET_SET_INPUT_SELECTOR:'input',workoutDetailState:{inlineSetEditor:'row'},_num:x=>Number(x)||0,_workoutSheetRawNumber:x=>x??'',clearWorkoutExerciseCompletionMarker:e=>delete e.exerciseCompletedAt,showToast:()=>{},_workoutSetInlineFieldKey:()=>'',_mutateWorkoutExerciseFromSheet:async(k,s,e,fn)=>{calls.push('mutate');return fn(entry);}};
  context.workoutSetKeyboardRuntime={getSelectedKey:()=>'',cancelInlineField:()=>{context.workoutDetailState.inlineSetEditor=null;calls.push('close');return true;},updateExerciseSet:(...args)=>context._updateWorkoutExerciseSetFromSheet(...args)};
  vm.createContext(context);vm.runInContext(['_setWorkoutSheetNumber','_defaultWorkoutSheetSet','_updateWorkoutExerciseSetFromSheet','_commitWorkoutSetKeyboardInput','_commitWorkoutSetKeyboardDone','_addWorkoutExerciseSetFromSheet'].map(extract).join('\n'),context);
  return {entry,calls,input,attrs,context};
}
test('keypad save changes only the dirty value and does not complete or timestamp a draft',async()=>{
  const h=harness({kg:40,reps:10,done:false,rir:2,restElapsedSec:42});h.attrs.set('data-wt-set-keyboard-dirty','true');
  await h.context._commitWorkoutSetKeyboardDone(h.input);
  assert.deepEqual(JSON.parse(JSON.stringify(h.entry.sets[0])),{kg:77,reps:10,done:false,rir:2,restElapsedSec:42});
  assert.deepEqual(h.calls,['mutate']);
});
test('keypad save preserves completion, original completion time and rest metadata',async()=>{
  const original={kg:40,reps:10,done:true,completedAt:123,restStartedAt:'2026-10-03T01:00:00.000Z',restEndedBy:'skip',restElapsedSec:50};
  const h=harness(original);h.attrs.set('data-wt-set-keyboard-dirty','true');await h.context._commitWorkoutSetKeyboardDone(h.input);
  assert.deepEqual(JSON.parse(JSON.stringify(h.entry.sets[0])),{...original,kg:77});
});
test('unchanged keypad confirmation closes input without any mutation',async()=>{
  const h=harness({kg:40,reps:10,done:false});await h.context._commitWorkoutSetKeyboardDone(h.input);
  assert.deepEqual(h.calls,['close']);assert.deepEqual(h.entry.sets[0],{kg:40,reps:10,done:false});
});
test('adding sets leaves original states and timestamps intact, including an empty exercise',async()=>{
  for(const done of [false,true]){
    const original={kg:50,reps:12,done,...(done?{completedAt:123,restElapsedSec:30}:{})};const h=harness(original);
    await h.context._addWorkoutExerciseSetFromSheet('2026-10-03',0,0);assert.deepEqual(h.entry.sets[0],original);assert.equal(h.entry.sets[1].done,false);assert.equal(h.entry.sets[1].completedAt,undefined);
  }
  const h=harness({});h.entry.sets=[];await h.context._addWorkoutExerciseSetFromSheet('2026-10-03',0,0);assert.equal(h.entry.sets.length,1);assert.equal(h.entry.sets[0].done,false);
});
