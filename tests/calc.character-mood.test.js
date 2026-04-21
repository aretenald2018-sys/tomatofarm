// ================================================================
// calc.character-mood.test.js — streakToCharacterMood() 구간 매핑 테스트
// 실행: `node --test tests/calc.character-mood.test.js`
// ================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { streakToCharacterMood } from '../calc.js';

// ── 구간 경계 ─────────────────────────────────────────────────────
test('streakToCharacterMood · 0일 → seed', () => {
  assert.strictEqual(streakToCharacterMood(0), 'seed');
});
test('streakToCharacterMood · 1일 → smile', () => {
  assert.strictEqual(streakToCharacterMood(1), 'smile');
});
test('streakToCharacterMood · 2일 → smile', () => {
  assert.strictEqual(streakToCharacterMood(2), 'smile');
});
test('streakToCharacterMood · 3일 → happy (경계)', () => {
  assert.strictEqual(streakToCharacterMood(3), 'happy');
});
test('streakToCharacterMood · 6일 → happy (경계)', () => {
  assert.strictEqual(streakToCharacterMood(6), 'happy');
});
test('streakToCharacterMood · 7일 → fire (경계)', () => {
  assert.strictEqual(streakToCharacterMood(7), 'fire');
});
test('streakToCharacterMood · 13일 → fire (경계)', () => {
  assert.strictEqual(streakToCharacterMood(13), 'fire');
});
test('streakToCharacterMood · 14일 → legend (경계)', () => {
  assert.strictEqual(streakToCharacterMood(14), 'legend');
});
test('streakToCharacterMood · 30일 → legend', () => {
  assert.strictEqual(streakToCharacterMood(30), 'legend');
});
test('streakToCharacterMood · 365일 → legend', () => {
  assert.strictEqual(streakToCharacterMood(365), 'legend');
});

// ── 방어 케이스 ───────────────────────────────────────────────────
test('streakToCharacterMood · 음수 → seed', () => {
  assert.strictEqual(streakToCharacterMood(-5), 'seed');
});
test('streakToCharacterMood · NaN → seed', () => {
  assert.strictEqual(streakToCharacterMood(NaN), 'seed');
});
test('streakToCharacterMood · undefined → seed', () => {
  assert.strictEqual(streakToCharacterMood(undefined), 'seed');
});
test('streakToCharacterMood · null → seed', () => {
  assert.strictEqual(streakToCharacterMood(null), 'seed');
});
test('streakToCharacterMood · 문자열 "7" → fire (숫자 변환)', () => {
  assert.strictEqual(streakToCharacterMood('7'), 'fire');
});
test('streakToCharacterMood · 문자열 "abc" → seed', () => {
  assert.strictEqual(streakToCharacterMood('abc'), 'seed');
});
test('streakToCharacterMood · 소수 3.9 → happy (3 이상)', () => {
  assert.strictEqual(streakToCharacterMood(3.9), 'happy');
});
test('streakToCharacterMood · 소수 0.5 → smile (1 미만이어도 0 초과니까 seed. 경계 재확인)', () => {
  // 설계: >= 1 이어야 smile. 0.5는 smile 아님.
  assert.strictEqual(streakToCharacterMood(0.5), 'seed');
});
