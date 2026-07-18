import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_DATA_COLLECTIONS,
  ACCOUNT_UNIFICATION_VERSION,
  ADMIN_ACCOUNT_ID,
  ADMIN_GUEST_ACCOUNT_ID,
  buildAccountUnificationPlan,
  buildMissingWorkoutFieldPatch,
  canonicalAccountOwnerId,
  getAccountOwnerAliases,
} from '../data/account-unification.js';
import { getLifeZoneActorReadCandidates } from '../home/life-zone-state.js';

test('shared guest identity resolves to the canonical data owner', () => {
  assert.equal(canonicalAccountOwnerId(ADMIN_GUEST_ACCOUNT_ID), ADMIN_ACCOUNT_ID);
  assert.deepEqual(getAccountOwnerAliases(ADMIN_GUEST_ACCOUNT_ID), [
    ADMIN_ACCOUNT_ID,
    ADMIN_GUEST_ACCOUNT_ID,
  ]);
});

test('unification copies missing guest and root documents without overwriting a canonical day', () => {
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

test('unification covers meals, seasons, and workout configuration collections', () => {
  for (const collectionName of [
    'workouts', 'settings', 'tomato_cycles', 'nutrition_db',
    'gyms', 'routine_templates', 'equipment_pool',
  ]) {
    assert.ok(ACCOUNT_DATA_COLLECTIONS.includes(collectionName), `${collectionName} must be unified`);
  }
});

test('v2 unification fills a diet-only canonical day with guest running fields only', () => {
  const canonical = {
    lFoods: [{ name: 'meal' }],
    lPhoto: 'canonical-lunch.jpg',
    memo: 'keep this note',
  };
  const guest = {
    lFoods: [{ name: 'guest meal' }],
    lPhoto: 'guest-lunch.jpg',
    memo: 'guest note',
    running: true,
    runDistance: 5.2,
    runDurationMin: 31,
    runRoute: [{ lat: 37, lng: 127, ts: 1 }],
  };
  const patch = buildMissingWorkoutFieldPatch(canonical, guest);

  assert.equal(ACCOUNT_UNIFICATION_VERSION, 2);
  assert.deepEqual(patch, {
    running: true,
    runDistance: 5.2,
    runDurationMin: 31,
    runRoute: [{ lat: 37, lng: 127, ts: 1 }],
  });
  assert.equal(patch.lFoods, undefined);
  assert.equal(patch.lPhoto, undefined);
  assert.equal(patch.memo, undefined);
});

test('v2 unification preserves a canonical workout and is idempotent', () => {
  const canonical = {
    exercises: [{ id: 'canonical-bench' }],
    running: true,
    runDistance: 3,
    bPhoto: 'breakfast.jpg',
  };
  const guest = {
    exercises: [{ id: 'guest-squat' }],
    running: true,
    runDistance: 8,
    bPhoto: 'guest-breakfast.jpg',
  };
  const patch = buildMissingWorkoutFieldPatch(canonical, guest);

  assert.deepEqual(patch, {});
  assert.deepEqual(buildMissingWorkoutFieldPatch({ ...canonical, ...patch }, guest), {});
});

test('life-zone reads the canonical account before a guest alias', () => {
  assert.deepEqual(getLifeZoneActorReadCandidates({
    accountId: 'moonjung',
    readAccountId: 'moonjung(guest)',
    ownerIdCandidates: ['moonjung(guest)', 'moonjung'],
  }), ['moonjung', 'moonjung(guest)']);
});
