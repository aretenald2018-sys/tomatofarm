import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('refactored home interactions are scoped and removed globals stay removed', async () => {
  const [weekly, welcome, router, profile] = await Promise.all([
    readFile(resolve(root, 'home/weekly-streak.js'), 'utf8'),
    readFile(resolve(root, 'home/welcome-back.js'), 'utf8'),
    readFile(resolve(root, 'utils/action-router.js'), 'utf8'),
    readFile(resolve(root, 'data/ai-food-profile.js'), 'utf8'),
  ]);
  assert.match(weekly, /data-app-action="open-workout-date"/);
  assert.doesNotMatch(weekly, /onclick=|window\._homeStreakDays|window\.changeHomeStreakDays/);
  assert.match(welcome, /data-wb-action="start-workout"/);
  assert.match(welcome, /options\.onStartWorkout\?\.\(\)/);
  assert.doesNotMatch(welcome, /onclick=|window\._dismissWelcomeBackPopup/);
  assert.doesNotMatch(router, /window\.registerActions?/);
  assert.doesNotMatch(profile, /window\.(?:rebuildFoodProfile|getFoodPrior|getFoodProfile|dumpFoodProfile)/);
});

test('final documentation points to current boundaries and production workflow', async () => {
  const [readme, architecture, agents, compatibility] = await Promise.all([
    readFile(resolve(root, 'README.md'), 'utf8'),
    readFile(resolve(root, 'ARCHITECTURE.md'), 'utf8'),
    readFile(resolve(root, 'AGENTS.md'), 'utf8'),
    readFile(resolve(root, 'docs/COMPATIBILITY.md'), 'utf8'),
  ]);
  assert.match(readme, /npm\.cmd run verify:assets/);
  assert.match(architecture, /view\/controller -> domain model\/service -> data\.js/);
  assert.match(architecture, /one durable physical owner/);
  assert.match(agents, /git worktree list/);
  assert.match(agents, /style\.css.+generated/is);
  assert.match(agents, /durable architecture, ADR, contract, or reference material/);
  assert.match(compatibility, /Removal target/);
  assert.doesNotMatch(compatibility, /`app\/compatibility-bridge\.js` exposes/);
  assert.match(compatibility, /No new code may import either shim/);
});
