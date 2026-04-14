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
  let s = text.trim();
  // 마크다운 코드블록 제거
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // JSON 앞뒤 불필요한 텍스트 제거 (첫 번째 { 또는 [ 부터 마지막 } 또는 ] 까지)
  const start = Math.min(
    s.indexOf('{') === -1 ? Infinity : s.indexOf('{'),
    s.indexOf('[') === -1 ? Infinity : s.indexOf('[')
  );
  const endBrace = s.lastIndexOf('}');
  const endBracket = s.lastIndexOf(']');
  const end = Math.max(endBrace, endBracket);
  if (start !== Infinity && end > start) s = s.substring(start, end + 1);
  // trailing comma 제거 (JSON 표준 위반)
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

async function _callGeminiProxy(parts, { maxTokens = 400, responseMimeType } = {}) {
  const { data } = await _geminiProxy({
    parts,
    maxTokens,
    responseMimeType,
  });
  const text = data?.text;
  if (!text) throw new Error('Gemini 응답을 파싱할 수 없습니다.');
  return text;
}

// ── 공통 Gemini 호출 (텍스트) ────────────────────────────────────
export async function callGemini(prompt, maxTokens = 400) {
  return _callGeminiProxy([{ text: prompt }], { maxTokens });
}

// ── 공통 Gemini 호출 (JSON 강제) ─────────────────────────────────
async function _callGeminiJSON(parts, maxTokens = 2000) {
  const text = await _callGeminiProxy(parts, {
    maxTokens,
    responseMimeType: 'application/json',
  });
  return _cleanJSON(text);
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
