// ================================================================
// ai/llm-core.js — Gemini/LLM 프록시 공통 인프라
// ================================================================
// 서버(geminiProxy Cloud Function)가 Gemini 실패 시 Groq 자동 전환.
// 응답의 provider 필드('gemini'|'groq') 로 호출부가 UI 판단.
// 클라이언트는 얇은 wrapper + JSON 안전 파싱만 담당.
// ================================================================

import { functions } from '../data/data-core.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js';

const _geminiProxy = httpsCallable(functions, 'geminiProxy');
const _ocrProxy    = httpsCallable(functions, 'ocrProxy');

// ── Cloud Vision OCR 호출 (월 990장 초과 시 resource-exhausted) ────
export async function ocrImage(imageBase64) {
  const { data } = await _ocrProxy({ imageBase64 });
  return data?.text || '';
}

// ── JSON 안전 파싱 헬퍼 ──────────────────────────────────────────
export function _cleanJSON(text) {
  let s = String(text || '').trim();
  // 마크다운 코드블록 제거 (여러 블록이 있으면 첫 블록만)
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // 첫 JSON 토큰 찾기
  const firstIdx = (() => {
    const b = s.indexOf('{'), a = s.indexOf('[');
    if (b === -1) return a;
    if (a === -1) return b;
    return Math.min(a, b);
  })();
  if (firstIdx === -1) throw new Error('no JSON token found');
  // 괄호 매칭으로 첫 번째 유효 JSON 추출 (문자열 리터럴 내부 무시)
  const openChar = s[firstIdx];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = firstIdx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === openChar) depth++;
    else if (ch === closeChar) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('unbalanced JSON');
  s = s.substring(firstIdx, end + 1);
  // trailing comma 제거
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

// ── 잘린 JSON salvage: 배열 응답이 중간에 끊겼을 때 완전한 객체까지 복구 ──
export function _salvagePartialJSONArray(text) {
  let s = String(text || '').trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const openIdx = s.indexOf('[');
  if (openIdx === -1) return null;

  let depth = 0, inStr = false, esc = false;
  let objStart = -1;
  const completeObjs = [];
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === '{') {
      if (depth === 1 && objStart === -1) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 1 && objStart !== -1) {
        completeObjs.push(s.substring(objStart, i + 1));
        objStart = -1;
      }
    }
  }
  if (completeObjs.length === 0) return null;
  try { return JSON.parse('[' + completeObjs.join(',') + ']'); }
  catch { return null; }
}

export function _makeParseError(code, message, cause) {
  const err = new Error(message);
  err.code = code;
  if (cause !== undefined) err.cause = cause;
  return err;
}

// ── AI 타임아웃 헬퍼 — 25초 이내 응답 없으면 친화 에러 ─────────────
async function _withTimeout(promise, ms = 25000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// 서버(geminiProxy Cloud Function)가 자체적으로 Groq fallback을 수행.
// 응답에 provider 필드 포함 ('gemini' or 'groq'). 후속 UI는 이 값으로 판단.
export async function _callGeminiProxy(parts, { maxTokens = 400, responseMimeType } = {}) {
  const { data } = await _withTimeout(_geminiProxy({
    parts,
    maxTokens,
    responseMimeType,
  }));
  const text = data?.text;
  if (!text) throw new Error('Gemini 응답을 파싱할 수 없습니다.');
  return { text, provider: data?.provider || 'gemini' };
}

// ── 공통 Gemini 호출 (텍스트) — 서버가 Groq fallback 자동 처리 ────────
export async function callGemini(prompt, maxTokens = 400) {
  const { text } = await _callGeminiProxy([{ text: prompt }], { maxTokens });
  return text;
}

// ── 공통 Gemini 호출 (JSON 강제) — provider 정보 포함 반환 ──────────
export async function _callGeminiJSON(parts, maxTokens = 2000) {
  const { text, provider } = await _callGeminiProxy(parts, {
    maxTokens,
    responseMimeType: 'application/json',
  });
  return { data: _cleanJSON(text), provider };
}

// ═══════════════════════════════════════════════════════════════════
// LLM Router (Thin Client Wrapper) — 서버측 fallback으로 위임
// ═══════════════════════════════════════════════════════════════════
// 실제 provider fallback 로직은 Firebase Function(geminiProxy)에 내장.
// 서버가 Gemini 호출 실패(quota/5xx) 감지 시 Groq로 자동 전환하고,
// 응답에 provider 필드('gemini'|'groq')를 실어 보냄.
// 클라이언트는:
//   1) 응답의 provider가 'groq'면 onProviderSwitch 콜백 → UI에 "대체 AI로 재시도 중" 표시
//   2) 둘 다 실패 시 서버가 HttpsError('resource-exhausted') 던짐 → 호출부가 quota UI
// ───────────────────────────────────────────────────────────────────
export async function _callLLMJSON(parts, { maxTokens = 2000, onProviderSwitch } = {}) {
  const { data, provider } = await _callGeminiJSON(parts, maxTokens);
  console.log(`[llm] provider=${provider}`);
  if (provider === 'groq' && typeof onProviderSwitch === 'function') {
    try { onProviderSwitch({ provider: 'groq', reason: 'server_fallback' }); } catch {}
  }
  return { data, provider };
}

// 하위 호환: 기존 callClaude 호출 코드 지원
export const callClaude = callGemini;
