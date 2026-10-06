import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureWorkoutSheetState,
  _rememberWorkoutSheetCarouselSlide,
  _restoreRememberedWorkoutSheetCarousel,
  _restoreWorkoutSheetCarouselToSlide,
  _workoutSheetCarouselSnapshots,
} from '../calendar/sheet-state.js';

test('delayed carousel restores cannot overwrite a newer card order or another session', t => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const callbacks = [];
  let key = '2026-10-06';
  let session = 0;
  const track = {
    scrollLeft: 0,
    querySelector(selector) { return { offsetLeft: Number(selector.match(/"(\d+)"/)[1]) * 300 }; },
    scrollTo({ left }) { this.scrollLeft = left; },
  };
  const sheet = { querySelector: () => track };
  globalThis.document = { getElementById: () => ({ querySelector: () => sheet }) };
  globalThis.window = { requestAnimationFrame: fn => callbacks.push(fn), setTimeout: fn => callbacks.push(fn) };
  configureWorkoutSheetState({ getSelectedKey: () => key, getSessionIndex: () => session });
  t.after(() => {
    for (const name of ['window', 'document']) {
      if (previous[name] === undefined) delete globalThis[name];
      else globalThis[name] = previous[name];
    }
    _workoutSheetCarouselSnapshots.clear();
  });
  for (const restore of [
    () => _restoreRememberedWorkoutSheetCarousel(key, session),
    () => _restoreWorkoutSheetCarouselToSlide(0, { key, sessionIndex: session }),
  ]) {
    _rememberWorkoutSheetCarouselSlide(key, session, 0);
    restore();
    assert.equal(track.scrollLeft, 0);
    _rememberWorkoutSheetCarouselSlide(key, session, 2);
    track.scrollLeft = 600;
    callbacks.splice(0).forEach(fn => fn());
    assert.equal(track.scrollLeft, 600, 'a moved card invalidates every old frame and timeout');

    _rememberWorkoutSheetCarouselSlide(key, session, 0);
    restore();
    session = 1;
    track.scrollLeft = 300;
    callbacks.splice(0).forEach(fn => fn());
    assert.equal(track.scrollLeft, 300, 'old session callbacks cannot scroll the new session');
    session = 0;
  }
});
