import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_DATA_COLLECTIONS,
  ADMIN_ACCOUNT_ID,
  ADMIN_GUEST_ACCOUNT_ID,
  LEGACY_ROOT_MIGRATION_COLLECTION,
  LEGACY_ROOT_MIGRATION_ID,
  LEGACY_ROOT_MIGRATION_VERSION,
  SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION,
  SHARED_ACCOUNT_OWNER_REGISTRY_ID,
  SHARED_ACCOUNT_OWNER_REGISTRY_STATUS,
  SHARED_ACCOUNT_OWNER_REGISTRY_VERSION,
  buildAccountUnificationPlan,
  canonicalAccountOwnerId,
  normalizeSharedAccountDataOwnerId,
  readSharedAccountDataOwnerRegistry,
  resolveAccountDataOwnerId,
  selectSharedAccountDataOwner,
} from '../data/account-unification.js';

test('logical admin identity stays canonical while private data owner is separate', () => {
  assert.equal(canonicalAccountOwnerId(ADMIN_GUEST_ACCOUNT_ID), ADMIN_ACCOUNT_ID);
  assert.equal(resolveAccountDataOwnerId(ADMIN_ACCOUNT_ID, null), null);
  assert.equal(
    resolveAccountDataOwnerId(ADMIN_ACCOUNT_ID, ADMIN_GUEST_ACCOUNT_ID),
    ADMIN_GUEST_ACCOUNT_ID,
  );
  assert.equal(
    resolveAccountDataOwnerId(ADMIN_GUEST_ACCOUNT_ID, ADMIN_ACCOUNT_ID),
    ADMIN_ACCOUNT_ID,
  );
  assert.equal(resolveAccountDataOwnerId('최_준수', null), '최_준수');
});

test('the durable registry wins and accepts only the two shared owner ids', () => {
  assert.equal(SHARED_ACCOUNT_OWNER_REGISTRY_COLLECTION, '_account_data_owners');
  assert.equal(SHARED_ACCOUNT_OWNER_REGISTRY_ID, 'tomato_admin');
  assert.equal(SHARED_ACCOUNT_OWNER_REGISTRY_VERSION, 2);
  assert.equal(SHARED_ACCOUNT_OWNER_REGISTRY_STATUS, 'decided');
  assert.equal(normalizeSharedAccountDataOwnerId('invalid-owner'), null);
  assert.equal(readSharedAccountDataOwnerRegistry({
    ownerId: ADMIN_GUEST_ACCOUNT_ID,
    version: 1,
    status: SHARED_ACCOUNT_OWNER_REGISTRY_STATUS,
  }), null);
  assert.equal(readSharedAccountDataOwnerRegistry({
    ownerId: ADMIN_GUEST_ACCOUNT_ID,
    version: SHARED_ACCOUNT_OWNER_REGISTRY_VERSION,
    status: 'deciding',
  }), null);
  assert.equal(readSharedAccountDataOwnerRegistry({
    ownerId: ADMIN_GUEST_ACCOUNT_ID,
    version: SHARED_ACCOUNT_OWNER_REGISTRY_VERSION,
    status: SHARED_ACCOUNT_OWNER_REGISTRY_STATUS,
  }), ADMIN_GUEST_ACCOUNT_ID);
  assert.equal(selectSharedAccountDataOwner({
    registeredOwnerId: ADMIN_GUEST_ACCOUNT_ID,
    adminHasData: true,
  }), ADMIN_GUEST_ACCOUNT_ID);
  assert.equal(selectSharedAccountDataOwner({
    registeredOwnerId: ADMIN_ACCOUNT_ID,
    adminHasData: false,
  }), ADMIN_ACCOUNT_ID);
});

test('legacy root migration uses a top-level owner-scoped completion marker', () => {
  assert.equal(LEGACY_ROOT_MIGRATION_COLLECTION, '_account_data_migrations');
  assert.equal(LEGACY_ROOT_MIGRATION_ID, 'tomato_legacy_root_to_shared_owner');
  assert.equal(LEGACY_ROOT_MIGRATION_VERSION, 1);
});

test('admin data presence preserves admin; a literally empty namespace selects guest', () => {
  assert.equal(
    selectSharedAccountDataOwner({ adminHasData: true }),
    ADMIN_ACCOUNT_ID,
  );
  assert.equal(
    selectSharedAccountDataOwner({ adminHasData: false }),
    ADMIN_GUEST_ACCOUNT_ID,
  );
});

test('owner detection covers every private data collection including routes and legacy movies', () => {
  for (const collectionName of [
    'workouts', 'settings', 'tomato_cycles', 'nutrition_db',
    'gyms', 'routine_templates', 'equipment_pool', 'running_routes',
    'custom_muscles', 'movies',
  ]) {
    assert.ok(ACCOUNT_DATA_COLLECTIONS.includes(collectionName), `${collectionName} must be scanned`);
  }
});

test('legacy root migration is copy-only and never imports the other admin alias', () => {
  const plan = buildAccountUnificationPlan({
    canonicalDocuments: [{ id: '2026-07-17', data: { running: false, runDistance: 0 } }],
    guestDocuments: [
      { id: '2026-07-17', data: { running: true, runDistance: 5 } },
      { id: '2026-07-16', data: { running: true, runDistance: 8 } },
    ],
    legacyDocuments: [
      { id: '2026-07-17', data: { running: true } },
      { id: '2026-07-15', data: { exercises: [{ id: 'bench' }] } },
    ],
  });

  assert.deepEqual(plan, [
    { id: '2026-07-15', data: { exercises: [{ id: 'bench' }] } },
  ]);
});
