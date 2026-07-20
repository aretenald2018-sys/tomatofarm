import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { closeModal, openModal } from '../app/overlay-stack.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fakeControl(name) {
  return {
    name,
    hidden: false,
    isConnected: true,
    focused: false,
    getAttribute: () => null,
    focus() { this.focused = true; globalThis.document.activeElement = this; },
  };
}

test('overlay stack moves focus into dialogs and restores the opener', () => {
  const opener = fakeControl('opener');
  const first = fakeControl('first');
  const attributes = new Map();
  const panel = {
    ...fakeControl('panel'),
    getAttribute: name => attributes.get(name) || null,
    setAttribute: (name, value) => attributes.set(name, value),
    querySelectorAll: () => [first],
  };
  const classes = new Set();
  const modal = {
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    contains: value => value === panel || value === first,
    matches: () => false,
    querySelector: selector => selector === '[autofocus]' ? null : panel,
    querySelectorAll: () => [first],
    setAttribute: (name, value) => attributes.set(`overlay:${name}`, value),
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: opener,
    body: { style: {} },
    getElementById: id => id === 'test-modal' ? modal : null,
  };

  try {
    assert.equal(openModal('test-modal'), true);
    assert.equal(classes.has('open'), true);
    assert.equal(attributes.get('role'), 'dialog');
    assert.equal(attributes.get('aria-modal'), 'true');
    assert.equal(first.focused, true);
    assert.equal(closeModal('test-modal'), true);
    assert.equal(classes.has('open'), false);
    assert.equal(opener.focused, true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('design system owns tokens, primitives, accessibility, and CSS order', async () => {
  const [tokens, primitives, accessibility, index, sw, runtimeAssets, docs] = await Promise.all([
    readFile(resolve(root, 'styles/tokens.css'), 'utf8'),
    readFile(resolve(root, 'styles/primitives.css'), 'utf8'),
    readFile(resolve(root, 'styles/accessibility.css'), 'utf8'),
    readFile(resolve(root, 'index.html'), 'utf8'),
    readFile(resolve(root, 'sw.js'), 'utf8'),
    readFile(resolve(root, 'runtime-assets.js'), 'utf8'),
    readFile(resolve(root, 'docs/DESIGN_SYSTEM.md'), 'utf8'),
  ]);

  assert.match(tokens, /--touch-target-min:\s*44px/);
  for (const primitive of ['tds-field', 'tds-chip', 'tds-sheet', 'tds-feedback']) assert.match(primitives, new RegExp(`\\.${primitive}`));
  assert.match(accessibility, /:focus-visible/);
  assert.match(accessibility, /prefers-reduced-motion:\s*reduce/);
  assert.match(index, /href="style\.css"/);
  assert.doesNotMatch(index, /href="styles\/features\//);
  const entry = await readFile(resolve(root, 'style.css'), 'utf8');
  assert.ok(entry.indexOf('SOURCE: styles/tokens.css') < entry.indexOf('SOURCE: styles/primitives.css'));
  assert.ok(entry.indexOf('SOURCE: styles/accessibility.css') > entry.indexOf('SOURCE: styles/workout/expert-mode.css'));
  assert.match(entry, /SOURCE: styles\/features\/home-foundations\.css/);
  assert.match(entry, /SOURCE: styles\/features\/workout-day-sheet\.css/);
  assert.match(entry, /SOURCE: styles\/features\/app-status\.css/);
  assert.match(entry, /url\(['"]?\.\/assets\/nav-icons\/home\.svg/);
  assert.doesNotMatch(entry, /url\(['"]?\.\.\/assets\/nav-icons\//);
  assert.match(sw, /importScripts\('\.\/runtime-assets\.js'\)/);
  assert.match(runtimeAssets, /\.\/styles\/primitives\.css/);
  assert.match(runtimeAssets, /\.\/styles\/accessibility\.css/);
  assert.match(runtimeAssets, /\.\/styles\/workout\/expert-mode\.css/);
  assert.match(docs, /STYLE_ENTRY_SOURCES/);
  assert.match(docs, /style\.css` is a generated standalone WebView bundle/);
});
