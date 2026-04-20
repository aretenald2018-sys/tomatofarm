// ================════════════════════════════════════════════════
// ai/meal-estimate.js — 음식 사진 AI 추정
// ================================════════════════════════════════
// Pass 1: 초경량 분류 — plateType을 먼저 결정 (~300 토큰)
// Pass 2: 타입별 전용 프롬프트로 detectedItems 생성 (~1500 토큰)
// 단일 긴 프롬프트보다 각 단계 정확도 높음. 비용은 비슷.
// estimateInOnePass: 분류+추정을 한 번에 (Gemini quota 절반 절감).
// ================════════════════════════════════════════════════

import { _callGeminiJSON } from './llm-core.js';

const _PLATE_TYPES = ['cafeteria', 'single_dish', 'pasta', 'sushi_set', 'steak', 'dessert', 'unknown'];

export async function classifyMealPhoto(imageBase64) {
  const prompt = `음식 사진을 다음 카테고리 중 하나로 분류해라.

카테고리:
- cafeteria: 한식 반상/구내식당 (밥+국+메인+반찬 구조)
- single_dish: 단일 한 그릇 요리 (비빔밥, 덮밥, 국수, 김밥 등)
- pasta: 파스타/스파게티/리조또
- sushi_set: 초밥/스시 세트
- steak: 스테이크/고기구이 메인
- dessert: 디저트/빵/음료
- unknown: 분류 불가

JSON만 반환:
{"plateType":"cafeteria","hasRice":true,"hasSoup":true,"hasMeat":true,"itemCountEstimate":5,"confidence":0.85}
confidence는 0~1.`;

  try {
    const { data } = await _callGeminiJSON([
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
    ], 400);
    // 타입 검증
    if (!_PLATE_TYPES.includes(data.plateType)) data.plateType = 'unknown';
    data.confidence = Math.min(1, Math.max(0, Number(data.confidence) || 0.5));
    return data;
  } catch (err) {
    console.warn('[classifyMealPhoto] 분류 실패, unknown으로 대체:', err?.message || err);
    return { plateType: 'unknown', confidence: 0.3 };
  }
}

// 타입별 프롬프트 — 구조와 우선순위가 다르므로 분리
const _ESTIMATE_PROMPTS = {
  cafeteria: `한식 반상 사진에서 각 반찬/국/밥/메인을 분해해 영양정보를 추정하라.
- 통상 한국 구내식당 반상은 총 800~1200kcal 범위.
- 각 구성요소(밥, 국, 메인 반찬, 사이드 반찬들)를 개별 아이템으로.
- 밥은 1공기(200g 전후), 국은 한 대접(250g 전후), 메인은 100~150g 기준.
- 반찬은 소량(30~50g).`,
  single_dish: `단일 한 그릇 요리(비빔밥/덮밥/국수/김밥 등)를 추정하라.
- 주재료와 부재료를 2~4개 아이템으로 분해.
- 통상 한 그릇은 500~800kcal 범위.`,
  pasta: `파스타/리조또 요리를 추정하라.
- 면/밥(주재료), 소스(크림/토마토/오일), 단백질 토핑으로 분해.
- 1인분 기준 600~900kcal.`,
  sushi_set: `초밥 세트를 추정하라.
- 피스 수와 종류를 최대한 파악.
- 초밥 1피스는 40~70kcal (종류별 상이).
- 세트면 8~16피스 범위.`,
  steak: `스테이크 메인 요리를 추정하라.
- 고기 부위와 중량(150g/200g/300g)을 구분.
- 사이드(감자, 샐러드, 빵)를 개별 아이템으로.`,
  dessert: `디저트/빵/음료를 추정하라.
- 사이즈(small/medium/large)에 따라 200~600kcal 범위.`,
  single: `요리를 주재료 기준으로 2~4개 아이템으로 분해하라.`,
  unknown: `사진 속 음식을 최대한 아이템별로 분해하라.`,
};

const _ITEM_SCHEMA = `각 아이템: {"name":"음식명(한국어)","grams":120,"kcal":320,"protein":18,"carbs":35,"fat":12}
최종 JSON:
{
  "totalKcal":930,
  "totalProtein":45,
  "totalCarbs":110,
  "totalFat":28,
  "confidence":0.7,
  "detectedItems":[{아이템}, ...]
}
- grams/kcal/protein/carbs/fat은 모두 숫자. 단위 붙이지 마라.
- name은 반드시 한국어. 구체적으로 (예: "제육볶음", "잡곡밥", "된장찌개").
- confidence는 0~1.
- 그 외 설명, 주석, 마크다운 금지. JSON 객체 하나만.`;

export async function estimateByType(imageBase64, plateType) {
  const typePrompt = _ESTIMATE_PROMPTS[plateType] || _ESTIMATE_PROMPTS.unknown;
  const prompt = `${typePrompt}\n\n${_ITEM_SCHEMA}`;

  const { data } = await _callGeminiJSON([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
  ], 2000);
  return _shapeEstimate(data, plateType);
}

// ── 1-pass: 분류 + 추정을 하나의 호출로 ──────────────────────────
// classifyMealPhoto + estimateByType을 합쳐서 API 호출 1회로.
// Gemini quota를 절반으로 줄이는 주 목적.
export async function estimateInOnePass(imageBase64) {
  // 모든 타입별 rubric을 하나의 프롬프트에 인라인
  const typeRubric = Object.entries(_ESTIMATE_PROMPTS)
    .filter(([k]) => _PLATE_TYPES.includes(k))
    .map(([k, v]) => `■ ${k}:\n${v}`)
    .join('\n\n');

  const prompt = `음식 사진을 분석해서 (1) plateType 분류, (2) detectedItems 상세 추정을 한 번에 수행하라.

━━━ plateType 카테고리 ━━━
- cafeteria: 한식 반상/구내식당 (밥+국+메인+반찬 구조)
- single_dish: 단일 한 그릇 요리 (비빔밥, 덮밥, 국수, 김밥 등)
- pasta: 파스타/스파게티/리조또
- sushi_set: 초밥/스시 세트
- steak: 스테이크/고기구이 메인
- dessert: 디저트/빵/음료
- unknown: 분류 불가

━━━ 분류된 타입별 추정 가이드 ━━━
${typeRubric}

━━━ 출력 스키마 ━━━
${_ITEM_SCHEMA.replace(
    '{\n  "totalKcal"',
    '{\n  "plateType":"cafeteria",\n  "hasRice":true,\n  "totalKcal"'
  )}

- plateType은 위 7개 중 하나.
- 먼저 타입을 판정한 뒤, 해당 타입 가이드에 맞춰 detectedItems를 분해.
- 모든 숫자는 단위 없이 숫자값만.`;

  const { data } = await _callGeminiJSON([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
  ], 2500);

  const plateType = _PLATE_TYPES.includes(data.plateType) ? data.plateType : 'unknown';
  const shaped = _shapeEstimate(data, plateType);
  // 분류 메타 병합
  shaped.classification = {
    plateType,
    hasRice: !!data.hasRice,
    hasSoup: !!data.hasSoup,
    hasMeat: !!data.hasMeat,
    confidence: shaped.confidence,
  };
  return shaped;
}

// 공통 shape/sanitize 함수 — estimateByType/estimateInOnePass 공유
function _shapeEstimate(data, plateType) {
  // sanitize
  const items = Array.isArray(data.detectedItems) ? data.detectedItems : [];
  const cleaned = items.map(it => ({
    name: String(it.name || '').trim(),
    grams: Number(it.grams) || 0,
    kcal: Number(it.kcal) || 0,
    protein: Number(it.protein) || 0,
    carbs: Number(it.carbs) || 0,
    fat: Number(it.fat) || 0,
  })).filter(it => it.name && it.kcal > 0);

  return {
    plateType,
    totalKcal: Math.round(Number(data.totalKcal) || cleaned.reduce((s, i) => s + i.kcal, 0)),
    totalProtein: Math.round((Number(data.totalProtein) || cleaned.reduce((s, i) => s + i.protein, 0)) * 10) / 10,
    totalCarbs: Math.round((Number(data.totalCarbs) || cleaned.reduce((s, i) => s + i.carbs, 0)) * 10) / 10,
    totalFat: Math.round((Number(data.totalFat) || cleaned.reduce((s, i) => s + i.fat, 0)) * 10) / 10,
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0.5)),
    detectedItems: cleaned,
  };
}
