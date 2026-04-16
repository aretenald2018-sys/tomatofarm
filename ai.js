// ================================================================
// ai.js
// 의존성: data.js, data/data-core.js
// 역할: Gemini Cloud Function 호출 (식단 추천, 운동 추천, 목표 실현가능성, 영양정보 파싱)
// ================================================================

import { TODAY, getMemo, getExercises, getDiet, getExList,
         getMuscles, getCF, dietDayOk }        from './data.js';
import { functions }                           from './data/data-core.js';
import { httpsCallable }                       from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";

const _geminiProxy = httpsCallable(functions, 'geminiProxy');
const _ocrProxy    = httpsCallable(functions, 'ocrProxy');

// ── Cloud Vision OCR 호출 (월 990장 초과 시 resource-exhausted) ────
export async function ocrImage(imageBase64) {
  const { data } = await _ocrProxy({ imageBase64 });
  return data?.text || '';
}

// ── JSON 안전 파싱 헬퍼 ──────────────────────────────────────────
function _cleanJSON(text) {
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

// 서버(geminiProxy Cloud Function)가 자체적으로 Groq fallback을 수행.
// 응답에 provider 필드 포함 ('gemini' or 'groq'). 후속 UI는 이 값으로 판단.
async function _callGeminiProxy(parts, { maxTokens = 400, responseMimeType } = {}) {
  const { data } = await _geminiProxy({
    parts,
    maxTokens,
    responseMimeType,
  });
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
async function _callGeminiJSON(parts, maxTokens = 2000) {
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

async function _callLLMJSON(parts, { maxTokens = 2000, onProviderSwitch } = {}) {
  const { data, provider } = await _callGeminiJSON(parts, maxTokens);
  console.log(`[llm] provider=${provider}`);
  if (provider === 'groq' && typeof onProviderSwitch === 'function') {
    try { onProviderSwitch({ provider: 'groq', reason: 'server_fallback' }); } catch {}
  }
  return { data, provider };
}

// 하위 호환: 기존 callClaude 호출 코드 지원
export const callClaude = callGemini;

// ── 오늘의 식단 추천 ─────────────────────────────────────────────
export async function getDietRec() {
  const bubble = document.getElementById('diet-bubble');
  bubble.textContent = '';
  bubble.classList.add('loading');

  const recentMeals = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate() - i);
    const dt = getDiet(d.getFullYear(), d.getMonth(), d.getDate());
    if (dt.breakfast || dt.lunch || dt.dinner) {
      recentMeals.push(`${i===0?'오늘':i+'일전'}: 아침(${dt.breakfast||'-'}) 점심(${dt.lunch||'-'}) 저녁(${dt.dinner||'-'})`);
    }
  }

  const prompt = `당신은 전문 영양사입니다. 다이어트 중인 성인 남성에게 오늘 식단 3세트를 추천해주세요.
최근 식단: ${recentMeals.length ? recentMeals.join(' / ') : '기록 없음'}
조건: 총 1500kcal 이하, 최근 메뉴와 겹치지 않게, 한식/양식/아시안 다양하게.
형식: 세트1~3 각각 아침/점심/저녁과 총칼로리를 3줄로 간결하게.`;

  try {
    bubble.textContent = await callGemini(prompt);
  } catch(e) {
    bubble.textContent = '오류: ' + e.message;
  } finally {
    bubble.classList.remove('loading');
  }
}

// ── 오늘의 운동 추천 ─────────────────────────────────────────────
export async function getWorkoutRec() {
  const bubble = document.getElementById('workout-bubble');
  bubble.textContent = '';
  bubble.classList.add('loading');

  const weekMemos = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate() - i);
    const y=d.getFullYear(), mo=d.getMonth(), dd=d.getDate();
    const exList  = getExercises(y, mo, dd);
    const memo    = getMemo(y, mo, dd);
    if (exList.length || memo) {
      const names = exList.map(e => {
        const ex = getExList().find(x => x.id === e.exerciseId);
        return ex?.name || e.exerciseId;
      });
      weekMemos.push(`${i===0?'오늘':i+'일전'}(${names.join(',')||'없음'}): ${memo||'메모없음'}`);
    }
  }

  const prompt = `당신은 퍼스널 트레이너입니다. 이번 주 운동 기록을 바탕으로 오늘 운동을 추천해주세요.
이번 주 기록: ${weekMemos.length ? weekMemos.join(' / ') : '기록 없음'}
부족한 부위를 파악하고, 오늘 할 운동 루틴을 세트/횟수 포함해 구체적으로 추천해주세요. 3~4줄로 간결하게.`;

  try {
    bubble.textContent = await callGemini(prompt);
  } catch(e) {
    bubble.textContent = '오류: ' + e.message;
  } finally {
    bubble.classList.remove('loading');
  }
}

// ── 영양성분 파싱 공통 규칙 ──────────────────────────────────────
// 이미지/텍스트 양쪽이 같은 엔티티 기반 판정을 쓰도록 통일.
// 판정축: 표의 행/열 구조가 아니라 "독립된 식품 엔티티의 수".
const _NUTRITION_RULES_KO = `═══ STEP 1: 식품 엔티티 식별 ═══
"엔티티" = 독립된 식품/제품/메뉴 1개. 표의 행/열 구조가 아니라 **서로 다른 식품의 수**만 센다.

엔티티로 세는 것:
- 서로 다른 포장/라벨의 제품명 각각
- 비교표의 축(행이든 열이든) 중 하나에 나열된 서로 다른 식품명 각각
  · 예시 A: 행=[사과/바나나/귤], 열=[kcal/탄수/단백] → 엔티티 3개
  · 예시 B: 행=[열량/단백/탄수], 열=[A사 라면/B사 라면/C사 라면] → 엔티티 3개
  · 예시 C: 행=[열량/단백/탄수/지방/나트륨], 열=[값] → 엔티티 1개 (한 제품 영양성분표)
- 메뉴판/식단표에서 이름별로 영양값이 붙은 각 메뉴

엔티티로 세지 않는 것:
- "열량/단백질/탄수화물/지방/나트륨" 같은 영양소 항목 (같은 제품의 속성)
- 같은 제품의 다른 단위 표기(100g당 / 1개당)
- 단위 없는 숫자 나열

═══ STEP 2: 우선순위 (충돌 시 위에서부터) ═══
1. 서로 다른 식품 이름이 2개 이상 식별 → 복수
2. 한 제품(라벨/포장/Nutrition Facts/영양성분표)만 인식 → 단일
3. 판단 불가(흐림/부분 노출) → detectedFoods를 {"name":"unknown","evidence":"..."} 1개로 두고 단일, confidence 하향

═══ STEP 3: 출력 순서 (반드시 지킬 것) ═══
먼저 detectedFoods 배열을 채우고, 그 개수 N에 따라 최종 shape을 결정한다.
items.length는 반드시 detectedFoods.length와 동일해야 한다.

N === 1 (단일):
{
  "detectedFoods": [{"name":"음식명 또는 unknown","evidence":"왜 1개로 판단했는지"}],
  "name": "음식명",
  "unit": "100g",
  "servingSize": 100,
  "servingUnit": "g",
  "nutrition": { "kcal": 165, "protein": 31, "carbs": 0.4, "fat": 3.6, "fiber": 0, "sugar": 0, "sodium": 60 },
  "brand": "브랜드명 또는 null",
  "language": "__LANG__",
  "confidence": 0.95
}

N >= 2 (복수):
{
  "detectedFoods": [{"name":"A","evidence":"..."},{"name":"B","evidence":"..."}],
  "multiple": true,
  "items": [
    { "name":"A","unit":"100g","servingSize":100,"servingUnit":"g","nutrition":{"kcal":165,"protein":31,"carbs":0.4,"fat":3.6,"fiber":0,"sugar":0,"sodium":60},"brand":null,"language":"__LANG__","confidence":0.9 },
    { "name":"B","unit":"1개","servingSize":50,"servingUnit":"g","nutrition":{"kcal":200,"protein":8,"carbs":30,"fat":7,"fiber":1,"sugar":12,"sodium":150},"brand":null,"language":"__LANG__","confidence":0.85 }
  ]
}

공통 규칙:
- 정확히 보이는 값만 (불확실하면 confidence 낮춤)
- 없는 필드는 0 또는 null (fiber/sugar/sodium은 선택)
- 단위 g 통일 (mg → ÷1000, mcg → ÷1000000)
- 범위값은 중간값 평균 ("3~4kcal" → 3.5, "15~20g" → 17.5)
- "약 3.5kcal" → 3.5 (수사 제거)
- **JSON만 출력. 다른 텍스트 금지.**`;

// 응답 정규화: {multiple:true}인데 items<2면 단일로 강등, 불일치 경고
function _normalizeNutritionParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  const detected = Array.isArray(parsed.detectedFoods) ? parsed.detectedFoods : null;

  if (parsed.multiple) {
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (items.length < 2) {
      if (items.length === 1) return { ...items[0], detectedFoods: detected };
      return parsed; // items 0개 → 상위에서 에러 처리
    }
    if (detected && detected.length !== items.length) {
      console.warn('[nutrition] detectedFoods/items 개수 불일치', detected.length, items.length);
    }
    return parsed;
  }

  if (detected && detected.length >= 2) {
    console.warn('[nutrition] 단일 응답이나 detectedFoods는 복수', detected.map(d=>d.name));
  }
  return parsed;
}

// ── 영양성분표 이미지 파싱 (Gemini Vision API) ────────────────────
// 반환: 단일 { detectedFoods, name, nutrition, ... } | 복수 { detectedFoods, multiple:true, items:[>=2] }
export async function parseNutritionFromImage(imageBase64, language = 'ko') {
  const rules = _NUTRITION_RULES_KO.replace(/__LANG__/g, language);
  const prompt = `다음 이미지에서 영양정보를 추출하라.\n\n${rules}`;

  const parsed = await _callGeminiJSON([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
  ], 4096);
  return _normalizeNutritionParse(parsed);
}

// ── 영양성분 텍스트 파싱 ──────────────────────────────────────────
// 이미지 파서와 동일한 엔티티 기반 판정 사용
export async function parseNutritionFromText(rawText) {
  // 1) 정규식 파서 선시도 (AI 호출 전, 단일 항목 한정)
  try {
    const { parseNutritionRegex } = await import('./utils/nutrition-text-parser.js');
    const r = parseNutritionRegex(rawText);
    if (r.ok) return r.data;
  } catch (err) {
    console.warn('[parseNutritionFromText] 정규식 파서 로드 실패, AI로 진행:', err?.message || err);
  }

  // 2) 정규식 실패 → Gemini fallback
  const rules = _NUTRITION_RULES_KO.replace(/__LANG__/g, 'ko');
  const prompt = `다음 텍스트에서 영양정보를 추출하라.\n\n텍스트:\n${rawText}\n\n${rules}`;

  const parsed = await _callGeminiJSON([{ text: prompt }], 4096);
  return _normalizeNutritionParse(parsed);
}

// ── 다국어 감지 ──────────────────────────────────────────────────
export async function detectLanguage(text) {
  const prompt = `텍스트의 주요 언어를 감지하세요.
텍스트: ${text.substring(0, 200)}
JSON 형식: {"language":"ko","confidence":0.95}
language는 ko, ja, en, other 중 하나.`;

  return _callGeminiJSON([{ text: prompt }], 100);
}

// ════════════════════════════════════════════════════════════════
// 전문가 모드 — 기구 파싱 / 루틴 후보 생성 / 균형 nudge
// ────────────────────────────────────────────────────────────────
// 공통 원칙:
//  - movementId는 전달받은 MOVEMENTS 카탈로그 내 값으로만 응답하도록 프롬프트로 강제
//  - 매핑 불가 시 'unknown' 응답 (앱 측에서 ⚠️ 표시 후 사용자 선택)
//  - 응답은 _callGeminiJSON으로 JSON 강제
// ════════════════════════════════════════════════════════════════

function _movementsCatalogBrief(movements) {
  return (movements || []).map(m => `${m.id}:${m.nameKo}(${m.primary}/${m.pattern})`).join('\n');
}

function _makeParseError(code, message, cause) {
  const err = new Error(message);
  err.code = code;
  if (cause !== undefined) err.cause = cause;
  return err;
}

// ── 로컬 구조화 추출: 마크다운/불릿 목록에서 {name,brand,machineType} 배열 ──
// AI 호출 전 로컬에서 대부분의 메타데이터를 확보해 응답 크기/에러율을 줄임.
function _extractEquipmentLines(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const stripEmojis = (s) => s.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/gu, '').trim();
  // 메모/설명 섹션 판정 — 해당 섹션의 불릿은 기구가 아니므로 전부 스킵
  const isMemoSection = (title) => /메모|노트|참고|요약|정리|설명|memo|notes?|summary/i.test(title);
  const detectSectionMachineType = (title) => {
    if (/핀\s*머신|selectorized/i.test(title)) return '핀머신';
    if (/플레이트|plate\s*loaded/i.test(title)) return '플레이트';
    if (/하체\s*특화/.test(title)) return '머신';
    if (/프리\s*웨이트|케이블/i.test(title)) return ''; // 하위 ### 에서 세부 타입 결정
    if (/덤벨|dumbbell/i.test(title)) return '덤벨';
    if (/바벨|barbell/i.test(title)) return '바벨';
    return '';
  };
  const detectBrandMachineType = (title) => {
    if (/랙|플랫폼|rack/i.test(title)) return '바벨';
    if (/스미스|smith/i.test(title)) return '스미스';
    if (/케이블|cable|crossover/i.test(title)) return '케이블';
    if (/벤치|bench/i.test(title)) return '벤치';
    if (/덤벨|dumbbell/i.test(title)) return '덤벨';
    return '';
  };
  // 이름 정규화: "파워랙 **6대**" → "파워랙", "❌ ... (삭제 확정)" → null, **bold** 제거
  const normalizeName = (rawName) => {
    let n = String(rawName || '').trim();
    if (!n) return null;
    // 삭제/제외 마커 감지 → 제외
    if (/삭제\s*확정|\(\s*삭제\s*\)|deleted|removed/i.test(n)) return null;
    // 마크다운 볼드/이탤릭 제거
    n = n.replace(/\*\*/g, '').replace(/__|~~/g, '');
    // 수량 표기 제거: " 6대", " 2개", " 3세트", " 4쌍", "(5대)" 등
    n = n.replace(/\s*\(?\s*\d+\s*(?:대|개|세트|쌍|units?|pcs?)\s*\)?/gi, '');
    // 빈 괄호 제거 및 공백 정리
    n = n.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    return n.length >= 2 ? n : null;
  };

  const lines = raw.split(/\r?\n/);
  let machineType = '';
  let brand = '';
  let series = '';
  let skipSection = false;
  const out = [];

  for (const rawLine of lines) {
    const line = stripEmojis(rawLine).trim();
    if (!line) continue;
    if (/^[-=*_]{3,}$/.test(line)) continue; // HR

    // ## 섹션 헤더 → machineType 컨텍스트
    const mSection = line.match(/^##\s+(.+)$/);
    if (mSection) {
      const t = mSection[1].replace(/^\d+\.\s*/, '').trim();
      skipSection = isMemoSection(t);
      if (!skipSection) {
        const detected = detectSectionMachineType(t);
        if (detected) machineType = detected;
      }
      brand = ''; series = '';
      continue;
    }
    // ### 브랜드/시리즈 또는 장비 카테고리
    const mBrand = line.match(/^###\s+(.+)$/);
    if (mBrand) {
      const t = mBrand[1].trim();
      if (isMemoSection(t)) {
        skipSection = true;
        brand = ''; series = '';
        continue;
      }
      skipSection = false;
      const subType = detectBrandMachineType(t);
      if (subType) {
        machineType = subType;
        brand = ''; series = '';
      } else {
        // "Life Fitness Signature Series" → brand + series 분리 (heuristic)
        // "Series" 단어가 명시적으로 끝에 있을 때만 분리 (Hammer Strength 같은 케이스 보호)
        const m = t.match(/^(.+?)\s+(.+?\s+Series)$/i);
        if (m) { brand = m[1].trim(); series = m[2].trim(); }
        else   { brand = t; series = ''; }
      }
      continue;
    }
    // 메모 섹션 내부 불릿은 기구 아님 → 스킵
    if (skipSection) continue;
    // **부위** 같은 볼드 서브카테고리는 스킵 (기구 아님)
    if (/^\*\*(.+?)\*\*$/.test(line)) continue;

    // 불릿 기구명 (마크다운 형식 입력)
    const mBullet = line.match(/^\s*(?:[-*•·]|\d+[.)])\s+(.+)$/);
    if (mBullet) {
      const name = normalizeName(mBullet[1]);
      if (!name) continue;
      // rawLine은 AI가 무게 숫자(예: "110kg까지")를 추출할 수 있도록 원본 줄 전체 전달
      out.push({ name, brand, series, machineType, rawLine: rawLine.trim() });
      continue;
    }

    // 평문 한 줄 = 기구 하나 (사용자가 불릿 없이 붙여넣는 가장 흔한 케이스).
    // 헤더(##/###), 메모 섹션, 빈 줄, 볼드 서브카테고리는 이미 위에서 필터됨.
    // 숫자/문장부호만 있는 줄은 normalizeName이 null 반환.
    const plainName = normalizeName(line);
    if (plainName) {
      out.push({ name: plainName, brand, series, machineType, rawLine: rawLine.trim() });
    }
  }
  return out.slice(0, 200);
}

// ── 잘린 JSON salvage: 배열 응답이 중간에 끊겼을 때 완전한 객체까지 복구 ──
function _salvagePartialJSONArray(text) {
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

// ── 청크 단위 movementId 매핑 (AI는 작은 분류만 담당) ────────────
async function _mapMovementIdChunk(items, catalogBrief) {
  const briefItems = items.map((it, i) => {
    const ctx = [it.brand, it.series, it.machineType].filter(Boolean).join(' / ');
    // 원본 raw 텍스트도 함께 제공 — 무게 숫자 파싱이 가능하도록
    const raw = it.rawLine ? ` <<<${it.rawLine}>>>` : '';
    return `${i}: ${it.name}${ctx ? ` [${ctx}]` : ''}${raw}`;
  }).join('\n');

  const prompt = `헬스장 기구 목록을 카탈로그의 movementId에 매핑하고, 입력에서 무게 정보를 추출하라.

카탈로그 (id : 이름 (주부위/패턴)):
${catalogBrief}

기구 (index: name [brand/series/machineType] <<<원본 입력>>>):
${briefItems}

매핑 원칙 (적극 매핑):
- 브랜드(Hammer Strength, Nautilus, Cybex, Gym80, Newtech, Focus, Life Fitness, Arsenal, Watson, Shinko, Star Trac, HOIST, USP, Atlantis, Matrix, BootyBuilder, Flex Fitness, BodyMasters 등)·시리즈·색상·형식은 전부 무시. 동작(movement)만 보고 판단.
- 부분 일치·어순 다름·오타 허용. 예시:
  · "체스트 프레스", "인클라인 체스트 프레스", "디클라인 체스트 프레스" → chest_press_machine / incline_smith_bench / decline_machine_press 중 가장 가까운 것
  · "랫 풀다운", "프론트 랫 풀다운", "와이드 풀다운" → lat_pulldown
  · "시티드 로우", "로우로우", "ISO-Lateral Row", "버티컬 로우" → seated_row
  · "하이 로우", "레터럴 하이 로우" → high_row
  · "티바로우", "T바 로우", "T-Bar Row" → t_bar_row
  · "숄더 프레스", "바이킹 숄더 프레스", "머신 숄더프레스" → machine_shoulder_press
  · "사레레", "레터럴 레이즈" → lateral_raise / cable_lateral_raise
  · "리어 델트", "페이스풀" → rear_delt_fly / face_pull
  · "스쿼트", "백스쿼트", "V 스쿼트", "스쿼트 프레스" → back_squat / squat_machine
  · "레그 프레스", "Angled Leg Press", "파워 레그 프레스" → leg_press
  · "핵 스쿼트", "핵 프레스" → hack_squat
  · "레그 익스텐션" → leg_extension
  · "레그 컬", "라잉 레그 컬", "시티드 레그 컬" → leg_curl
  · "힙 쓰러스트", "힙 프레스" → hip_thrust
  · "바이셉스 컬", "바이셉 컬" → cable_curl 또는 barbell_curl
  · "트라이셉스", "트라이 익스텐션", "오버헤드 익스텐션", "푸쉬다운" → cable_tricep_pushdown / overhead_tricep_ext
  · "어시스트 풀업", "Chin/Dip Assist" → assisted_pullup
  · "딥스" → dips
  · "Pec Fly", "플라이" → chest_fly
  · "Pullover", "풀오버" → unknown (카탈로그 없음)
  · "Hip Adduction", "Abduction" → unknown (카탈로그 없음)
  · "스미스 머신", "파워랙", "플랫폼", "벤치"만 있는 항목 → unknown (동작이 아니라 도구)
- 정말 카탈로그에 상응하는 동작 자체가 없을 때만 'unknown' (예: 힙 어덕션, 복합 머신).
- 브랜드만 있는 항목("Hammer Strength 풀오버 머신" 등)도 동작으로 판단 ("풀오버" → unknown).

JSON 배열 스키마: [{"i":번호,"m":"movementId 또는 unknown","maxKg":숫자|null,"incKg":숫자|null}, ...]
- 모든 index에 대해 응답.
- maxKg: 원본 입력에 기구 최대중량이 명시돼있으면 kg 숫자, 없으면 null. 예: "랫풀다운 110kg까지" → 110.
- incKg: 원본에 "2.5kg씩 증가" 같은 단위가 있으면 숫자, 없으면 기구 유형 기본값 추론 — 핀머신/플레이트 2.5, 케이블/덤벨 1.25, 바벨 2.5, 불명이면 null.
- JSON 배열만. 설명/주석 금지.`;

  const text = await _callGeminiProxy(
    [{ text: prompt }],
    { maxTokens: 1600, responseMimeType: 'application/json' }
  );
  let parsed;
  try { parsed = _cleanJSON(text); }
  catch {
    const salvaged = _salvagePartialJSONArray(text);
    if (salvaged) parsed = salvaged;
    else throw _makeParseError('PARSE_JSON', 'chunk JSON 파싱 실패');
  }
  const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
  const map = new Map();
  for (const row of arr) {
    const idx = typeof row?.i === 'number' ? row.i : (typeof row?.index === 'number' ? row.index : null);
    const mid = row?.m || row?.movementId || null;
    if (idx === null) continue;
    // 숫자 파싱 (문자열로 올 수도) — 비정상값은 null
    const rawMax = row?.maxKg ?? row?.max ?? null;
    const rawInc = row?.incKg ?? row?.inc ?? null;
    const maxKg = (rawMax != null && isFinite(+rawMax) && +rawMax > 0) ? +rawMax : null;
    const incKg = (rawInc != null && isFinite(+rawInc) && +rawInc > 0) ? +rawInc : null;
    map.set(idx, { movementId: mid ? String(mid) : 'unknown', maxKg, incKg });
  }
  return items.map((it, i) => {
    const r = map.get(i) || { movementId: 'unknown', maxKg: null, incKg: null };
    return { ...it, movementId: r.movementId, aiMaxKg: r.maxKg, aiIncKg: r.incKg };
  });
}

function _standardizeMachineType(mt) {
  if (!mt) return '기타';
  if (/핀|selector/i.test(mt)) return '핀머신';
  if (/플레이트|plate/i.test(mt)) return '플레이트';
  if (/케이블|cable/i.test(mt)) return '케이블';
  if (/덤벨|dumbbell/i.test(mt)) return '덤벨';
  if (/스미스|smith/i.test(mt)) return '스미스';
  if (/바벨|barbell/i.test(mt)) return '바벨';
  if (/벤치|bench/i.test(mt)) return '벤치';
  if (/머신|machine/i.test(mt)) return '머신';
  return '기타';
}

// ── 로컬 카탈로그 매칭 (alias 기반 분류기) ─────────────────────────
// 출력 계약: { state, topId, candidates }
//  - 'mapped'      : 자동 확정 (top 점수 충분, 1·2등 차이 충분)
//  - 'ambiguous'   : 후보 있으나 1등 확신 부족 → 사용자 확인 필요
//  - 'unsupported' : 카탈로그에 동작 자체 없음 OR 단순 도구(랙/벤치 등)
function _normalizeForMatch(s) {
  return String(s || '').toLowerCase()
    .replace(/머신|machine|기구|장비|머쉰/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s\-_·&+[\]/]+/g, '');
}

// 동작 카탈로그에 없는 보조장비/일반도구 — 자동 unsupported 판정
const UNSUPPORTED_PATTERNS = [
  /^파워?\s*랙$/i, /^랙$/i, /half\s*rack/i, /power\s*rack/i, /squat\s*rack/i,
  /^스미스(\s*머신)?$/i, /^smith(\s*machine)?$/i,
  /^플랫(\s*벤치(프레스)?)?(\s*랙)?$/i, /^인클라인\s*벤치$/i, /^벤치$/i, /^bench$/i,
  /^덤벨(\s*랙)?$/i, /dumbbell\s*rack/i, /^원판$/i, /^바벨(\s*\+\s*원판)?(\s*세트)?$/i,
  /^플랫폼$/i, /^platform$/i,
  /풀오버/i, /pullover/i, /pull\s*over/i,                // 카탈로그 없음
  /hip\s*ad?(b?)duction/i, /힙\s*어덕션/i, /힙\s*애브덕션/i, /^abduction$/i, /^adduction$/i,
  /torso\s*rotat/i, /토르소/i, /회전\s*머신/i,
  /백\s*익스텐션/i, /back\s*extension/i,                  // 카탈로그 없음
  /로타리\s*토르소/i,
];

// movementId → 한/영 별칭 사전 (브랜드 무관 일반 명칭 위주)
// AI 매핑 + 카탈로그 nameKo 외에 추가 신뢰도를 주는 보조 사전
const MOVEMENT_ALIASES = {
  // 가슴
  barbell_bench:           ['바벨 벤치프레스', '바벨 벤치 프레스', 'barbell bench press', 'flat barbell bench'],
  dumbbell_bench:          ['덤벨 벤치프레스', '덤벨 벤치 프레스', 'dumbbell bench press', 'db bench press'],
  incline_smith_bench:     ['인클라인 스미스 벤치프레스', 'incline smith bench', 'smith incline bench', '인클라인 스미스'],
  incline_dumbbell_bench:  ['인클라인 덤벨 벤치프레스', 'incline dumbbell bench', '인클라인 덤벨 프레스', 'incline db bench'],
  decline_machine_press:   ['디클라인 머신 프레스', 'decline machine press', '디클라인 체스트 프레스', 'decline chest press', 'decline press'],
  chest_press_machine:     ['체스트 프레스', '체스트프레스', 'chest press', 'iso-lateral bench press', 'iso lateral bench press', 'iso-lateral chest press', 'incline chest press', '인클라인 체스트 프레스', 'iso-lateral incline press', 'iso-lateral super incline press', 'super incline press', 'plate chest press'],
  chest_fly:               ['플라이', 'pec fly', 'chest fly', 'pec deck', '펙 덱', 'machine fly', '머신 플라이'],
  cable_crossover:         ['케이블 크로스오버', 'cable crossover', '케이블 플라이', 'cable fly'],
  dips:                    ['딥스', 'dips', '체스트 딥스'],

  // 등 - 풀다운 계열
  lat_pulldown:            ['랫 풀다운', '랫풀다운', 'lat pulldown', '와이드 풀다운', 'wide pulldown', '프론트 랫 풀다운', 'front lat pulldown', 'iso-lateral wide pulldown', 'iso-lateral front lat pulldown', 'wide lat pulldown', '와이드 풀다운 리어'],
  arm_pulldown:            ['암 풀다운', '암풀다운', 'arm pulldown', 'straight arm pulldown'],
  pullup:                  ['풀업', 'pull up', 'pullup', '친업', 'chin up'],
  assisted_pullup:         ['어시스트 풀업', 'assisted pullup', 'assisted pull up', 'chin/dip assist', 'chin dip assist', '어시스트 친업'],

  // 등 - 로우 계열
  barbell_row:             ['바벨 로우', '바벨로우', 'barbell row', '벤트오버 로우', 'bent over row', '펜들레이 로우'],
  t_bar_row:               ['티바 로우', '티바로우', 't-bar row', 't bar row', 'tbar row', 't바 로우'],
  seated_row:              ['시티드 로우', '시티드로우', 'seated row', 'seated cable row', '로우로우', 'low row', 'iso-lateral row', 'iso-lateral low row', 'iso lateral low row', 'mid row', '미드 로우', '리니어 로우', 'linear row', '어드저스터블 로우'],
  high_row:                ['하이 로우', '하이로우', 'high row', 'iso-lateral high row', '레터럴 하이 로우', 'lateral high row', 'incline lever row', 'incline row', '버티컬 로우', 'vertical row', 'dy 로우', 'iso-lateral pulldown'],
  dumbbell_row:            ['덤벨 로우', '덤벨로우', 'dumbbell row', 'one arm dumbbell row', '원암 덤벨 로우'],
  deadlift:                ['데드리프트', 'deadlift', '컨벤셔널 데드리프트'],
  rdl:                     ['루마니안 데드리프트', '루마니안 데드', 'romanian deadlift', 'rdl', '스티프 레그 데드'],
  face_pull:               ['페이스풀', '페이스 풀', 'face pull'],

  // 어깨
  ohp:                     ['오버헤드프레스', '오버헤드 프레스', 'overhead press', 'ohp', '바벨 숄더프레스', 'military press', '밀리터리 프레스'],
  dumbbell_shoulder_press: ['덤벨 숄더프레스', '덤벨 숄더 프레스', 'dumbbell shoulder press', 'db shoulder press'],
  machine_shoulder_press:  ['머신 숄더프레스', '머신 숄더 프레스', 'machine shoulder press', '숄더 프레스 머신', 'shoulder press machine', '숄더 프레스', 'shoulder press', '바이킹 숄더 프레스', 'viking shoulder press', '넥프레스', '넥 프레스', 'neck press', '인클라인 숄더 프레스'],
  lateral_raise:           ['사이드 레터럴 레이즈', '레터럴 레이즈', '사레레', 'lateral raise', 'side lateral raise', '사이드 레이즈', '시티드 레터럴 레이즈', 'seated lateral raise', '스탠딩 레터럴 레이즈', 'standing lateral raise'],
  cable_lateral_raise:     ['케이블 사레레', '케이블 레터럴 레이즈', 'cable lateral raise'],
  front_raise:             ['프론트 레이즈', 'front raise', '전면 레이즈'],
  rear_delt_fly:           ['리어 델트 플라이', '리어 델트', 'rear delt fly', 'rear delt', 'rear deltoid', '후면', 'pec fly / rear delt', 'rear delt machine', 'bentover lateral raise', '벤트오버 레터럴', 'matrix rear delt'],
  upright_row:             ['업라이트 로우', 'upright row'],
  shrug:                   ['슈러그', 'shrug', '바벨 슈러그'],

  // 하체
  back_squat:              ['백스쿼트', '백 스쿼트', 'back squat', '바벨 스쿼트'],
  front_squat:             ['프론트 스쿼트', 'front squat'],
  hack_squat:              ['핵스쿼트', '핵 스쿼트', 'hack squat', '핵 프레스', 'hack press'],
  squat_machine:           ['스쿼트 머신', 'squat machine', 'v 스쿼트', 'v squat', '스쿼트 프레스', 'squat press', '몬스터 글루트', 'monster glute', '플레이트 스쿼트'],
  leg_press:               ['레그프레스', '레그 프레스', 'leg press', 'angled leg press', '앵글 레그 프레스', 'iso-lateral leg press', '파워 레그 프레스', 'horizontal leg press', 'angled linear leg press', 'linear leg press'],
  leg_extension:           ['레그 익스텐션', '레그익스텐션', 'leg extension', 'iso-lateral leg extension'],
  leg_curl:                ['레그 컬', '레그컬', 'leg curl', '라잉 레그 컬', 'lying leg curl', 'seated leg curl', '시티드 레그 컬', 'iso-lateral leg curl', 'standing leg curl', 'standing hamstring curl', '햄스트링 컬'],
  hip_thrust:              ['힙 쓰러스트', '힙쓰러스트', 'hip thrust', 'booty builder', 'bootybuilder', '힙 프레스', 'hip press', 'standing hip thrust'],
  lunge:                   ['런지', 'lunge', 'walking lunge', '워킹 런지'],
  bulgarian_split_squat:   ['불가리안 스플릿 스쿼트', 'bulgarian split squat', 'split squat'],
  calf_raise:              ['카프 레이즈', 'calf raise', 'standing calf raise', 'seated calf raise', '카프'],

  // 이두
  barbell_curl:            ['바벨 컬', '바벨컬', 'barbell curl', 'ez bar curl', 'ez 바 컬'],
  dumbbell_curl:           ['덤벨 컬', '덤벨컬', 'dumbbell curl', 'standing dumbbell curl'],
  hammer_curl:             ['해머 컬', '해머컬', 'hammer curl'],
  cable_curl:              ['케이블 컬', '케이블컬', 'cable curl', 'rope curl', '바이셉스 컬', '바이셉 컬', 'bicep curl', 'biceps curl', 'biceps curl machine'],
  preacher_curl:           ['프리처 컬', 'preacher curl'],
  incline_dumbbell_curl:   ['인클라인 덤벨 컬', 'incline dumbbell curl'],

  // 삼두
  cable_tricep_pushdown:   ['케이블 푸쉬다운', '푸쉬다운', 'tricep pushdown', 'triceps pushdown', '트라이셉스 푸쉬다운', 'rope pushdown', 'cable pushdown', 'tricep press', 'triceps press', '트라이셉스 프레스', 'tricep extension', 'triceps extension', '어시스트 딥스'],
  overhead_tricep_ext:     ['오버헤드 트라이셉 익스텐션', 'overhead tricep extension', 'overhead triceps extension', '오버헤드 익스텐션', 'french press', '프렌치 프레스'],
  skull_crusher:           ['스컬 크러셔', 'skull crusher', '라잉 트라이셉 익스텐션'],
  close_grip_bench:        ['클로즈 그립 벤치', 'close grip bench', '내로우 벤치'],

  // 복부
  plank:                   ['플랭크', 'plank'],
  hanging_leg_raise:       ['행잉 레그 레이즈', 'hanging leg raise', '레그 레이즈', '무빙 레그 레이즈'],
  ab_wheel:                ['앱 휠', 'ab wheel', 'ab roller'],
  cable_crunch:            ['케이블 크런치', 'cable crunch', 'rope crunch', 'abdominal crunch', '복근 크런치', 'abdominal'],
};

let _aliasIndex = null;
function _getAliasIndex(movements) {
  if (_aliasIndex) return _aliasIndex;
  _aliasIndex = new Map();
  for (const m of movements) {
    const list = MOVEMENT_ALIASES[m.id] ? [...MOVEMENT_ALIASES[m.id]] : [];
    if (m.nameKo) list.push(m.nameKo);
    _aliasIndex.set(m.id, list.map(_normalizeForMatch).filter(s => s.length >= 2));
  }
  return _aliasIndex;
}

// 분류기: alias 점수 → 3-state 판정 (mapped/ambiguous/unsupported)
function _classifyEquipment(item, movements) {
  const rawName = String(item.name || '');
  const normName = _normalizeForMatch(rawName);
  if (!normName || normName.length < 1) return { state: 'unsupported', topId: null, candidates: [], reason: 'empty' };

  // 1) unsupported 패턴 → 즉시 판정
  for (const pat of UNSUPPORTED_PATTERNS) {
    if (pat.test(rawName)) return { state: 'unsupported', topId: null, candidates: [], reason: 'pattern' };
  }

  // 2) alias 점수
  const idx = _getAliasIndex(movements);
  const scores = [];
  for (const [movementId, aliases] of idx.entries()) {
    let best = 0;
    for (const a of aliases) {
      let s = 0;
      if (normName === a) s = 100;
      else if (normName.includes(a)) s = a.length * 2;
      else if (a.includes(normName) && normName.length >= 4) s = normName.length;
      if (s > best) best = s;
    }
    if (best > 0) scores.push({ id: movementId, score: best });
  }
  if (scores.length === 0) return { state: 'unsupported', topId: null, candidates: [], reason: 'no-match' };

  scores.sort((a, b) => b.score - a.score);
  const top1 = scores[0];
  const top2 = scores[1];

  // 자동 확정: top1 충분히 강력 + 2등과 충분한 격차
  const TOP_STRONG = 8;
  const MARGIN = 4;
  if (top1.score >= TOP_STRONG && (!top2 || (top1.score - top2.score) >= MARGIN)) {
    return { state: 'mapped', topId: top1.id, candidates: scores.slice(0, 3) };
  }
  // 후보 존재 → 사용자 확인 필요
  if (top1.score >= 4) {
    return { state: 'ambiguous', topId: top1.id, candidates: scores.slice(0, 3) };
  }
  return { state: 'unsupported', topId: null, candidates: [], reason: 'low-score' };
}

export async function parseEquipmentFromText(rawText, movements) {
  const candidates = _extractEquipmentLines(rawText);
  if (candidates.length === 0) {
    throw _makeParseError('PARSE_EMPTY', '입력에서 기구를 추출하지 못했습니다');
  }

  // 1) 로컬 분류 (mapped / ambiguous / unsupported)
  const classified = candidates.map(item => ({
    ...item,
    classification: _classifyEquipment(item, movements),
  }));

  // 2) AI 호출: mapped 제외한 전체(ambiguous + unsupported). 브랜드/모델명 위주 입력이
  //    로컬 alias에 안 잡혀 unsupported가 된 경우를 구제 — AI는 카탈로그 풀텍스트 참조 가능.
  //    aiMaxKg/aiIncKg도 함께 추출해 리뷰 화면에 즉시 반영.
  const needsAiIdxs = classified
    .map((c, i) => (c.classification.state !== 'mapped' ? i : -1))
    .filter(i => i >= 0);

  // AI가 추출한 무게 — classified에 역병합용 맵
  const aiWeights = new Map();  // origIdx → {maxKg, incKg}

  let aiUsed = false;
  let aiFailed = false;
  if (needsAiIdxs.length > 0) {
    aiUsed = true;
    const CHUNK = 20;
    const catalog = _movementsCatalogBrief(movements);
    for (let i = 0; i < needsAiIdxs.length; i += CHUNK) {
      const idxSlice = needsAiIdxs.slice(i, i + CHUNK);
      const itemSlice = idxSlice.map(idx => classified[idx]);
      try {
        const aiResults = await _mapMovementIdChunk(itemSlice, catalog);
        aiResults.forEach((r, j) => {
          const origIdx = idxSlice[j];
          const c = classified[origIdx].classification;
          // 무게 정보는 항상 저장 (매핑 성공 여부와 무관)
          if (r.aiMaxKg != null || r.aiIncKg != null) {
            aiWeights.set(origIdx, { maxKg: r.aiMaxKg, incKg: r.aiIncKg });
          }
          if (r.movementId && r.movementId !== 'unknown') {
            const hadLocalCandidates = c.candidates.length > 0;
            const inCandidates = c.candidates.some(cd => cd.id === r.movementId);
            // 로컬 후보가 있을 때: candidate 일치 → mapped / 불일치 → ambiguous
            // 로컬 후보가 없었을 때(이전 unsupported): AI 판단 신뢰 → mapped
            classified[origIdx].classification = {
              state: inCandidates ? 'mapped'
                   : hadLocalCandidates ? 'ambiguous'
                   : 'mapped',
              topId: r.movementId,
              candidates: c.candidates,
              reason: inCandidates ? 'ai-confirmed'
                    : hadLocalCandidates ? 'ai-override'
                    : 'ai-rescued',  // unsupported → AI가 구조
            };
          }
        });
      } catch (e) {
        console.warn(`[parseEquipmentFromText] AI chunk ${i}-${i+idxSlice.length} 실패:`, e?.message || e);
        aiFailed = true;
      }
    }
  }

  const counts = { mapped: 0, ambiguous: 0, unsupported: 0 };
  for (const c of classified) counts[c.classification.state]++;
  console.log(`[parseEquipmentFromText] 분류 → mapped ${counts.mapped} · ambiguous ${counts.ambiguous} · unsupported ${counts.unsupported} (AI ${aiUsed ? (aiFailed ? '일부 실패' : '사용') : '미사용'})`);

  // 최종 스키마로 정규화 (리뷰 화면이 기대하는 필드 맞춤)
  return classified.map((x, i) => {
    const c = x.classification;
    const w = aiWeights.get(i) || { maxKg: null, incKg: null };
    return {
      name: x.name,
      brand: x.brand || (x.series || ''),
      machineType: _standardizeMachineType(x.machineType),
      maxKg: w.maxKg,                         // AI가 원본 입력에서 추출 (없으면 null)
      incKg: w.incKg,                         // AI가 추론 (없으면 null → 저장 시 동작 기본값 적용)
      weightUnit: 'kg',
      // unsupported는 movementId='unknown' (저장 시 자동 제외)
      movementId: c.state === 'unsupported' ? 'unknown' : (c.topId || 'unknown'),
      mappingState: c.state,                 // 'mapped' | 'ambiguous' | 'unsupported'
      candidates: c.candidates || [],        // [{id, score}, ...] (최대 3개)
      confidence: c.state === 'mapped' ? 0.9 : (c.state === 'ambiguous' ? 0.5 : 0),
    };
  });
}

export async function parseEquipmentFromImage(imageBase64, movements) {
  const prompt = `이미지에 보이는 헬스장 기구(라벨/안내판/기구 사진)를 추출하라.

카탈로그 (id : 이름 (주부위/패턴)):
${_movementsCatalogBrief(movements)}

JSON 배열 스키마:
[{"name":"표시명","brand":"브랜드(선택)","machineType":"핀머신|플레이트|케이블|덤벨|바벨|스미스|벤치|머신|기타","movementId":"카탈로그 id 또는 unknown","maxKg":숫자|null,"incKg":숫자|null}]

규칙:
- movementId는 카탈로그 id만 사용. 애매하면 'unknown'.
- 카테고리명/브랜드명만 있고 기구 아닌 것은 항목 제외.
- maxKg: 이미지의 라벨/스티커에 최대 중량이 보이면 kg 숫자, 아니면 null.
- incKg: 기구 유형 기본값 — 핀머신/플레이트 2.5, 케이블/덤벨 1.25, 바벨 2.5, 불명 null.
- JSON 배열만 출력. 설명 금지.`;
  let text;
  try {
    text = await _callGeminiProxy([
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
    ], { maxTokens: 2400, responseMimeType: 'application/json' });
  } catch (e) {
    console.warn('[parseEquipmentFromImage] Gemini 호출 실패:', e?.message || e);
    throw _makeParseError('PARSE_API', 'AI 서버 호출 실패', e);
  }
  let parsed;
  try { parsed = _cleanJSON(text); }
  catch (e) {
    const salvaged = _salvagePartialJSONArray(text);
    if (salvaged) parsed = salvaged;
    else {
      console.warn('[parseEquipmentFromImage] JSON 파싱 실패:', e?.message || e);
      throw _makeParseError('PARSE_JSON', 'AI 응답 JSON 파싱 실패', e);
    }
  }
  const items = Array.isArray(parsed) ? parsed
              : (Array.isArray(parsed?.items) ? parsed.items : null);
  if (!Array.isArray(items)) throw _makeParseError('PARSE_JSON', 'AI 응답 스키마 불일치');
  if (items.length === 0) throw _makeParseError('PARSE_EMPTY', '추출된 기구 없음');
  // 공통 정규화 — 숫자 필드는 유효성 검증 (AI가 문자열/NaN 반환 가능)
  const num = (v) => (v != null && isFinite(+v) && +v > 0) ? +v : null;
  return items.map(x => ({
    name: x.name || '',
    brand: x.brand || '',
    machineType: _standardizeMachineType(x.machineType),
    maxKg: num(x.maxKg),
    incKg: num(x.incKg),
    weightUnit: 'kg',
    movementId: x.movementId || 'unknown',
    confidence: (x.movementId && x.movementId !== 'unknown') ? 0.8 : 0.3,
  })).filter(x => x.name && x.name.length >= 2);
}

// ── 균형 nudge (Scene 10 노란 카드 문구) ────────────────────────
export async function generateBalanceNudge({ balanceByPattern, targetMuscles, preset }) {
  const summary = Object.entries(balanceByPattern || {})
    .map(([k,v]) => `${k}:${v}세트`).join(', ') || '최근 기록 부족';
  const targets = (targetMuscles || []).join(',') || '자동';
  const prompt = `당신은 짧고 친근한 피트니스 코치. JSON만 출력하라.
최근 2주 subPattern별 작업세트: ${summary}
오늘 선택 부위: ${targets}
목표: ${preset?.goal || '미설정'} / 빈도: 주${preset?.daysPerWeek}회

JSON 스키마:
{"title":"한 줄 제안 (~15자)","body":"두 줄 이내 이유(HTML 허용: <b>)","suggest":["muscleId",...]}
예시:
{"title":"이번엔 등 넓이 어때요?","body":"지난 4회 등 운동이 <b>두께 중심(로우·시티드로우)</b>이었어요. 균형을 위해 <b>넓이 자극(랫풀다운·암풀다운)</b>을 추천해요.","suggest":["shoulder"]}

균형이 이미 좋으면 title을 "오늘도 좋은 선택이에요" 처럼 긍정적으로.`;
  // nudge는 실패해도 UI 치명적이지 않음 → catch→default 유지. 단, 라우터로 Groq 기회는 제공.
  try {
    const { data: r, provider } = await _callLLMJSON([{ text: prompt }], { maxTokens: 400 });
    return {
      title: r?.title || '오늘도 힘내세요',
      body: r?.body || '',
      suggest: Array.isArray(r?.suggest) ? r.suggest : [],
      _provider: provider,
    };
  } catch (e) {
    console.warn('[generateBalanceNudge] fallback (default):', e?.code || e?.message || e);
    return { title: '오늘도 힘내세요', body: '', suggest: [] };
  }
}

// ── 오늘의 루틴 후보 2개 생성 (Scene 11) ────────────────────────
// onProviderSwitch({provider, reason}): Groq로 전환될 때 UI 중간 상태 콜백.
export async function generateRoutineCandidates({ preset, targetMuscles, sessionMinutes, preferredRpe, gymExercises, recentHistory, movements, onProviderSwitch }) {
  const gymList = (gymExercises || []).map(e =>
    `${e.id}:${e.name}(${e.movementId || 'unknown'}, ${e.muscleId}, max ${e.maxWeightKg || '?'}kg, step ${e.incrementKg || 2.5}kg)`
  ).join('\n');
  const hist = (recentHistory || []).slice(0, 20).map(h => `- ${h.exerciseId} ${h.date}: top ${h.topKg}kg×${h.topReps}`).join('\n') || '기록 없음';

  const prompt = `당신은 전문 트레이너. 오늘 루틴 후보 2개를 JSON으로 설계하라.

프리셋: 목표=${preset?.goal}, 주${preset?.daysPerWeek}회, 선호=${(preset?.preferMuscles||[]).join(',')}, 기피=${(preset?.avoidMuscles||[]).join(',')}, 금지동작=${(preset?.forbiddenMovements||[]).join(',')}
오늘 부위: ${(targetMuscles||[]).join(',') || '자동'}  / 시간: ${sessionMinutes}분 / RPE: ${preferredRpe}

가능한 기구(이것만 사용):
${gymList || '없음 — 일반 기구 추천'}

최근 14일 기록(참고):
${hist}

규칙:
- 후보 A는 "균형 보완" 의도(최근 부족한 subPattern 보강). candidateTag="A · 균형 보완 ⭐".
- 후보 B는 "익숙한 패턴" 유지. candidateTag="B · 익숙한 패턴".
- 각 후보는 items 5~7개, 총 소요 ≈ ${sessionMinutes}분.
- exerciseId는 위 기구 id 중 하나. movementId는 카탈로그(${(movements||[]).map(m=>m.id).slice(0,60).join(',')}).
- sets: reps는 4~15, rpeTarget은 6~10.

JSON 스키마:
{"candidates":[{
  "candidateKey":"A",
  "candidateTag":"A · 균형 보완 ⭐",
  "title":"등 넓이 빌더",
  "sessionMinutes": ${sessionMinutes||60},
  "rationale":"한 문단(HTML <b>허용)",
  "items":[{"exerciseId":"...","sets":[{"reps":10,"rpeTarget":8}],"restSec":90}]
},{...B}]}
JSON만 출력.`;
  // 라우터 사용: Gemini 실패 시 Groq로 자동 전환. 에러는 swallow하지 않고 정규화된 형태로 throw
  // → 호출부(expert.js:routineSuggestGenerate)의 catch가 quota 전용 UI를 띄울 수 있음.
  try {
    const { data: r, provider } = await _callLLMJSON([{ text: prompt }], {
      maxTokens: 4096,
      onProviderSwitch,
    });
    console.log(`[generateRoutineCandidates] provider=${provider} raw:`, r);
    const candidates = Array.isArray(r?.candidates) ? r.candidates.slice(0, 2) : [];
    if (candidates.length === 0) {
      const err = new Error('AI가 후보를 반환하지 않음');
      err.code = 'NO_CANDIDATES';
      err.provider = provider;
      throw err;
    }
    return candidates;
  } catch (e) {
    // 이미 정규화된 에러(QUOTA_EXCEEDED, PROVIDER_ALL_FAIL 등)는 그대로 전파.
    // 그 외(네트워크, 스키마 등)는 명시적으로 마킹 후 throw.
    if (e?.code) {
      console.error('[generateRoutineCandidates] routed error:', e.code, e.message);
      throw e;
    }
    console.error('[generateRoutineCandidates] unknown error:', e);
    const err = new Error(e?.message || '루틴 생성 실패');
    err.code = 'UNKNOWN';
    err.cause = e;
    throw err;
  }
}

// ── 목표 실현가능성 분석 ─────────────────────────────────────────
export async function analyzeGoalFeasibility(goal) {
  const today    = new Date();
  const ddayDate = goal.dday ? new Date(goal.dday) : null;
  const daysLeft = ddayDate ? Math.ceil((ddayDate - today) / 86400000) : null;

  let workoutDays=0, dietOkDays=0;
  for (let i=0; i<30; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate()-i);
    const y=d.getFullYear(), m=d.getMonth(), dd=d.getDate();
    if (getMuscles(y,m,dd).length > 0 || getCF(y,m,dd)) workoutDays++;
    if (dietDayOk(y,m,dd) === true) dietOkDays++;
  }
  const workoutRate = Math.round((workoutDays / 30) * 100);
  const dietRate    = Math.round((dietOkDays  / 30) * 100);

  const conditionStr = goal.condition
    ? `사용자 설정 조건: 주 ${goal.condition.workoutPerWeek}회 운동, 식단OK ${goal.condition.dietOkPct}% 달성`
    : '(조건 미설정 — 목표 이름에서 추론하여 판단)';

  const prompt = `헬스 트레이너 겸 목표 달성 코치로서 분석하세요.
사용자 목표: "${goal.label}"
D-day: ${daysLeft !== null ? `${daysLeft}일 후 (${goal.dday})` : '날짜 미설정'}
${conditionStr}
최근 30일: 운동 ${workoutRate}%(${workoutDays}/30일), 식단OK ${dietRate}%(${dietOkDays}/30일)

JSON 형식: {"feasibility":72,"realisticDate":"2025-09-15","summary":"2~3문장 분석"}
feasibility: 0-100, realisticDate: YYYY-MM-DD, summary: 간결한 분석`;

  return _callGeminiJSON([{ text: prompt }], 400);
}
