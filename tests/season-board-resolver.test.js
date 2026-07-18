import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeBoardForSeason,
  resolveSeasonTestBoard,
} from '../data/season-board-resolver.js';

const currentSeason = { id: 'season-current' };

test('season board resolver prefers the exact active-season document', () => {
  const exact = { seasonId: 'season-current', steps: [{ id: 'current-step' }] };
  const generic = { seasonId: 'season-current', steps: [{ id: 'generic-step' }] };
  assert.equal(resolveSeasonTestBoard({ currentSeason, seasonBoard: exact, genericBoard: generic }), exact);
});

test('season board resolver accepts a matching generic board only', () => {
  const matching = { seasonId: 'season-current', steps: [] };
  assert.equal(resolveSeasonTestBoard({ currentSeason, genericBoard: matching }), matching);
  assert.equal(resolveSeasonTestBoard({
    currentSeason,
    genericBoard: { seasonId: 'season-stale', steps: [{ id: 'past-goal' }] },
  }), null);
  assert.equal(resolveSeasonTestBoard({ currentSeason, genericBoard: { steps: [] } }), null);
});

test('an untagged exact-key board is allowed but a mismatched one is rejected', () => {
  const exactLegacy = { steps: [{ id: 'current-step' }] };
  assert.equal(resolveSeasonTestBoard({ currentSeason, seasonBoard: exactLegacy }), exactLegacy);
  assert.equal(resolveSeasonTestBoard({
    currentSeason,
    seasonBoard: { seasonId: 'season-stale', steps: [] },
  }), null);
});

test('saving tags an untagged board and refuses a stale season board', () => {
  assert.deepEqual(normalizeBoardForSeason({ steps: [] }, currentSeason), {
    seasonId: 'season-current',
    steps: [],
  });
  assert.equal(normalizeBoardForSeason({ seasonId: 'season-stale', steps: [] }, currentSeason), null);
});

test('without an active season the legacy generic board remains available', () => {
  const generic = { steps: [{ id: 'legacy' }] };
  assert.equal(resolveSeasonTestBoard({ genericBoard: generic }), generic);
});
