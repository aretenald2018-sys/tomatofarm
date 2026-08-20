"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateGeminiRequest, validateOcrRequest } = require("../lib/validation");

test("Gemini validation bounds tokens and preserves JSON mode", () => {
  const result = validateGeminiRequest({
    parts: [{ text: "hello" }],
    maxTokens: 99_999,
    responseMimeType: " application/json ",
  });
  assert.equal(result.generationConfig.maxOutputTokens, 8192);
  assert.equal(result.generationConfig.responseMimeType, "application/json");
  assert.equal(result.wantJSON, true);
});

test("Gemini validation rejects an empty parts list", () => {
  assert.throws(() => validateGeminiRequest({ parts: [] }), /parts 배열/);
});

test("Gemini validation passes withSearch through and drops JSON mode when grounding", () => {
  const plain = validateGeminiRequest({ parts: [{ text: "hi" }] });
  assert.equal(plain.withSearch, false);

  const grounded = validateGeminiRequest({
    parts: [{ text: "닥터유 미니바 영양성분" }],
    withSearch: true,
    responseMimeType: "application/json",
  });
  assert.equal(grounded.withSearch, true);
  // 그라운딩과 JSON 강제 출력은 함께 쓸 수 없다 — 텍스트로 받아 클라가 파싱한다.
  assert.equal(grounded.generationConfig.responseMimeType, undefined);
  assert.equal(grounded.wantJSON, false);
});

test("OCR validation owns image envelope limits", () => {
  const imageBase64 = "a".repeat(100);
  assert.deepEqual(validateOcrRequest({ imageBase64 }), { imageBase64 });
  assert.throws(() => validateOcrRequest({ imageBase64: "tiny" }), /imageBase64/);
});
