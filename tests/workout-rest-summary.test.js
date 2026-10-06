import test from 'node:test';
import assert from 'node:assert/strict';
import { workoutRestSummary } from '../workout/completion-metrics.js';
import { closeWorkoutTimeline } from '../workout/timeline.js';
const at = Date.parse('2026-09-29T23:59:00.000Z');
function fixture() {
  return { exercises: [{ sets: [{done:true, completedAt:at, restStartedAt:new Date(at).toISOString(), restElapsedSec:0}]}] };
}
const activeRest = { running:true, startedAt:at, origin:{entryIdx:0,setIdx:0} };
test('past completion without real rest metadata never becomes a running clock', () => {
  const record = { exercises:[{sets:[{done:true,completedAt:at}]}] };
  assert.deepEqual(workoutRestSummary(record,{now:at+83*3600000}),{value:'—',running:false});
});
test('only matching active rest advances and stops at existing idle deadline, including midnight', () => {
  assert.deepEqual(workoutRestSummary(fixture(),{activeRest,now:at+75000}),{value:'01:15',running:true});
  assert.deepEqual(workoutRestSummary(fixture(),{activeRest,now:at+900000}),{value:'15:00',running:false});
  assert.deepEqual(workoutRestSummary(fixture(),{activeRest,now:at+83*3600000}),{value:'15:00',running:false});
});
test('another session or inactive stale rest cannot keep increasing', () => {
  assert.deepEqual(workoutRestSummary(fixture(),{now:at+60000}),{value:'—',running:false});
  assert.deepEqual(workoutRestSummary(fixture(),{activeRest:{...activeRest,origin:{entryIdx:1,setIdx:0}},now:at+60000}),{value:'—',running:false});
  const stored=fixture(); stored.exercises[0].sets[0].restElapsedSec=42;
  assert.deepEqual(workoutRestSummary(stored,{now:at+83*3600000}),{value:'00:42',running:false});
});
test('skip and finish records display fixed measured durations even when active state is stale', () => {
  for (const restEndedBy of ['skip','finish','next-set','idle-limit']) {
    const record=fixture();Object.assign(record.exercises[0].sets[0],{restEndedAt:new Date(at+75000).toISOString(),restEndedBy});
    assert.deepEqual(workoutRestSummary(record,{activeRest,now:at+83*3600000}),{value:'01:15',running:false});
  }
});
test('closed workout bounds an unfinished rest without mutating history', () => {
  const record=fixture();closeWorkoutTimeline(record,{endedAt:at+50000,endedBy:'manual'});const before=JSON.stringify(record);
  assert.deepEqual(workoutRestSummary(record,{activeRest,now:at+83*3600000}),{value:'00:50',running:false});
  assert.equal(JSON.stringify(record),before);
});
test('latest rest starts at the new actual set, and undo excludes that set', () => {
  const record=fixture();Object.assign(record.exercises[0].sets[0],{restEndedAt:new Date(at+60000).toISOString()});
  record.exercises[0].sets.push({done:true,completedAt:at+60000,restStartedAt:new Date(at+60000).toISOString()});
  const next={running:true,startedAt:at+60000,origin:{entryIdx:0,setIdx:1}};
  assert.deepEqual(workoutRestSummary(record,{activeRest:next,now:at+75000}),{value:'00:15',running:true});
  record.exercises[0].sets[1].done=false;
  assert.deepEqual(workoutRestSummary(record,{activeRest:next,now:at+75000}),{value:'01:00',running:false});
});
