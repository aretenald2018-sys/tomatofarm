import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_DATA_COLLECTIONS,
  ADMIN_ACCOUNT_ID,
  ADMIN_GUEST_ACCOUNT_ID,
  buildAccountUnificationPlan,
  canonicalAccountOwnerId,
  getAccountOwnerAliases,
} from '../data/account-unification.js';
import { mergeWorkoutDayRecords } from '../data/workout-day-merge.js';
import { getLifeZoneActorReadCandidates } from '../home/life-zone-state.js';

test('shared guest identity resolves to the canonical data owner', () => {
  assert.equal(canonicalAccountOwnerId(ADMIN_GUEST_ACCOUNT_ID), ADMIN_ACCOUNT_ID);
  assert.deepEqual(getAccountOwnerAliases(ADMIN_GUEST_ACCOUNT_ID), [
    ADMIN_ACCOUNT_ID,
    ADMIN_GUEST_ACCOUNT_ID,
  ]);
});

test('generic unification copies only missing documents', () => {
  const plan = buildAccountUnificationPlan({
    canonicalDocuments: [{ id: '2026-07-17', data: { lFoods: [{ name: 'meal' }] } }],
    guestDocuments: [
      { id: '2026-07-17', data: { running: true, runDistance: 5 } },
      { id: '2026-07-16', data: { bFoods: [{ name: 'breakfast' }] } },
    ],
    legacyDocuments: [
      { id: '2026-07-16', data: { running: true } },
      { id: '2026-07-15', data: { exercises: [{ id: 'bench' }] } },
    ],
  });

  assert.deepEqual(plan.map((document) => document.id), ['2026-07-16', '2026-07-15']);
  assert.equal(plan.find((document) => document.id === '2026-07-16').data.bFoods[0].name, 'breakfast');
});

test('workout unification recovers missing same-day domains without replacing canonical meals', () => {
  const plan = buildAccountUnificationPlan({
    collectionName: 'workouts',
    canonicalDocuments: [{
      id: '2026-07-17',
      data: { lFoods: [{ name: 'canonical lunch' }], lKcal: 620 },
    }],
    guestDocuments: [
      {
        id: '2026-07-17',
        data: {
          lFoods: [{ name: 'stale lunch' }],
          lKcal: 500,
          running: true,
          runDistance: 5,
          runDurationMin: 30,
          runDurationSec: 15,
        },
      },
      { id: '2026-07-16', data: { bFoods: [{ name: 'breakfast' }] } },
    ],
    legacyDocuments: [
      { id: '2026-07-16', data: { running: true, runDistance: 3 } },
      { id: '2026-07-15', data: { exercises: [{ id: 'bench' }], restBetweenSets: 90 } },
    ],
  });

  assert.deepEqual(plan.map(document => document.id), ['2026-07-17', '2026-07-16', '2026-07-15']);
  assert.equal(plan[0].data.lFoods[0].name, 'canonical lunch');
  assert.equal(plan[0].data.lKcal, 620);
  assert.equal(plan[0].data.runDistance, 5);
  assert.equal(plan[1].data.bFoods[0].name, 'breakfast');
  assert.equal(plan[1].data.runDistance, 3);
  assert.equal(plan[2].data.restBetweenSets, 90);
});

test('same-domain canonical run remains authoritative while a missing meal is recovered', () => {
  const merged = mergeWorkoutDayRecords({
    running: true,
    runDistance: 6.2,
    runDurationMin: 36,
    runRouteRef: { path: 'canonical-route' },
  }, {
    running: true,
    runDistance: 2,
    runDurationMin: 15,
    runRouteRef: { path: 'stale-route' },
    dFoods: [{ name: 'dinner' }],
    dKcal: 710,
  });

  assert.equal(merged.runDistance, 6.2);
  assert.deepEqual(merged.runRouteRef, { path: 'canonical-route' });
  assert.equal(merged.dFoods[0].name, 'dinner');
  assert.equal(merged.dKcal, 710);
});

test('an empty normalized session does not block recovery of a real run', () => {
  const merged = mergeWorkoutDayRecords({
    workoutSessions: [{
      exercises: [{ id: 'squat' }],
      running: false,
      runDistance: 0,
      runDurationMin: 0,
      runDurationSec: 0,
      runSource: 'manual',
      runRouteSummary: { pointCount: 0 },
    }],
  }, {
    running: true,
    runDistance: 5,
    runDurationMin: 29,
  });

  assert.equal(merged.running, true);
  assert.equal(merged.runDistance, 5);
  assert.equal(merged.runDurationMin, 29);
  assert.equal(merged.workoutSessions.length, 1);
});

test('an empty workout timeline on a run does not block recovery of strength', () => {
  const merged = mergeWorkoutDayRecords({
    running: true,
    runDistance: 5,
    workoutTimeline: {
      mode: 'set-completion',
      source: 'none',
      checkedSetCount: 0,
      durationSec: 0,
    },
  }, {
    exercises: [{ id: 'squat', sets: [{ kg: 100, reps: 5 }] }],
    workoutDuration: 600,
    restBetweenSets: 90,
  });

  assert.equal(merged.runDistance, 5);
  assert.equal(merged.exercises[0].id, 'squat');
  assert.equal(merged.workoutDuration, 600);
  assert.equal(merged.restBetweenSets, 90);
});

test('unification covers meals, seasons, and workout configuration collections', () => {
  for (const collectionName of [
    'workouts', 'settings', 'tomato_cycles', 'nutrition_db',
    'gyms', 'routine_templates', 'equipment_pool',
  ]) {
    assert.ok(ACCOUNT_DATA_COLLECTIONS.includes(collectionName), `${collectionName} must be unified`);
  }
});

test('life-zone reads the canonical account before a guest alias', () => {
  assert.deepEqual(getLifeZoneActorReadCandidates({
    accountId: 'moonjung',
    readAccountId: 'moonjung(guest)',
    ownerIdCandidates: ['moonjung(guest)', 'moonjung'],
  }), ['moonjung', 'moonjung(guest)']);
});
