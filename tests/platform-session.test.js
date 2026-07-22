import test from 'node:test';
import assert from 'node:assert/strict';
import { isInstalledAppSurface } from '../utils/platform-session.js';

test('native Capacitor surfaces are installed app sessions', () => {
  assert.equal(isInstalledAppSurface({
    capacitor: { isNativePlatform: () => true },
    matchMedia: () => ({ matches: false }),
  }), true);
});

test('standalone PWA surfaces are installed app sessions', () => {
  assert.equal(isInstalledAppSurface({
    capacitor: { isNativePlatform: () => false },
    matchMedia: query => ({ matches: query === '(display-mode: standalone)' }),
  }), true);
  assert.equal(isInstalledAppSurface({
    capacitor: { isNativePlatform: () => false },
    matchMedia: () => ({ matches: false }),
    standalone: true,
  }), true);
});

test('ordinary Chrome browser sessions remain explicit-login sessions', () => {
  assert.equal(isInstalledAppSurface({
    capacitor: { isNativePlatform: () => false },
    matchMedia: () => ({ matches: false }),
    standalone: false,
  }), false);
});
