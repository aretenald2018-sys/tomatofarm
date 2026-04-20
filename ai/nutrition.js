// ================================================================
// ai/nutrition.js — 영양정보 파싱 (이미지/텍스트) + 언어 감지
// ================================================================
// 이미지/텍스트 양쪽이 같은 엔티티 기반 판정을 쓰도록 통일.
// 판정축: 표의 행/열 구조가 아니라 "독립된 식품 엔티티의 수".
//
// 2026-04-18 refactor: 영양성분표(라벨) 컬럼 disambiguate 로직 추가.
// 가공식품 라벨은 보통 "총 내용량 / 1회 제공량 / 100g(또는 100ml) 기준 / %영양성분기준치" 컬럼이 섞여 있어
// 잘못된 컬럼을 읽으면 kcal이 엉뚱하게 잡힘. 본 프롬프트는 다음 원칙을 강제한다:
//  1. %영양성분기준치(%DV)는 절대 값으로 쓰지 않는다.
//  2. 1회 제공량당 컬럼이 있으면 servingSize = 실제 g/ml 값, servingUnit = 'g'|'ml'
//  3. 100g당(또는 100ml당) 컬럼은 항상 servingSize=100.
//  4. 두 컬럼이 다 보이면 1회 제공량당을 우선하고, 100g당 값은 `per100` 필드에 보조로 기록.
// ================================================================

import { _callGeminiJSON } from './llm-core.js';

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

═══ STEP 2: 영양성분표(라벨) 컬럼 disambiguate ⚠️ 매우 중요 ═══
가공식품 영양성분표에는 **여러 기준 컬럼이 섞여 있으므로 반드시 어느 컬럼을 쓰는지 식별한다.**

등장하는 컬럼 종류:
(a) **1회 제공량당** ("1회 제공량 30g당", "per serving", "단위 섭취량당", "1회분당")
(b) **100g당 / 100ml당** ("100g당", "100ml당", "per 100g", "per 100ml")
(c) **총 내용량당** (1통/1봉 전체 기준) — 환산 없이 그대로 쓰지 말고 totalAmount만 기록
(d) **%영양성분기준치 / %Daily Value / %1일 영양성분 기준치** — ⚠️ **절대 실제 값으로 쓰지 말 것!**
    (예: "나트륨 15%"는 300mg이 아니라 "하루 권장량의 15%"라는 뜻. 실제 값은 같은 행의 mg/g 컬럼에서 읽어야 함.)

컬럼 선택 우선순위:
1. 1회 제공량당 컬럼이 명확히 보이면 → 그 값을 nutrition으로, servingSize = 1회 제공량 숫자(g|ml), unit = "1회 제공량 Ng" 같이 기록
2. 1회 제공량당이 없고 100g당(또는 100ml당)만 보이면 → servingSize=100, servingUnit='g' 또는 'ml', unit="100g" 또는 "100ml"
3. 두 컬럼 다 보이면 → **기본은 1회 제공량당**을 nutrition에 쓰고, 100g당 값을 \`per100\` 보조 객체에 기록 (앱이 사용자에게 선택지를 주기 위함)
4. 총 내용량당만 있는 경우 (예: "1통 500g 기준") → servingSize=총 내용량 수치, unit="1통 500g" 식으로 기록
5. % 기준치 컬럼의 숫자는 **무시**. 숫자 뒤에 % 표시가 붙은 행은 값으로 쓰지 않음.

servingUnit 판정:
- 라벨에 "내용량 250ml", "1회 제공량 200ml", "per 100ml" 가 보이면 servingUnit='ml'
- 그 외 고체/반고체는 'g'
- 단위가 불명확하면 'g' (기본값)

totalAmount 추출:
- "총 내용량 500g", "내용량 250ml", "Net Wt. 100g" 같은 표기가 보이면 totalAmount 숫자로 기록
- 없으면 totalAmount는 null

═══ STEP 3: 우선순위 (충돌 시 위에서부터) ═══
1. 서로 다른 식품 이름이 2개 이상 식별 → 복수
2. 한 제품(라벨/포장/Nutrition Facts/영양성분표)만 인식 → 단일
3. 판단 불가(흐림/부분 노출) → detectedFoods를 {"name":"unknown","evidence":"..."} 1개로 두고 단일, confidence 하향

═══ STEP 4: 출력 shape (반드시 지킬 것) ═══
먼저 detectedFoods 배열을 채우고, 그 개수 N에 따라 최종 shape을 결정한다.
items.length는 반드시 detectedFoods.length와 동일해야 한다.

N === 1 (단일):
{
  "detectedFoods": [{"name":"음식명 또는 unknown","evidence":"왜 1개로 판단했는지. 어느 컬럼을 읽었는지 명시 (예: '1회 제공량 30g당 컬럼 사용')"}],
  "name": "음식명",
  "unit": "1회 제공량 30g",                 // 또는 "100g" / "100ml" / "1통 500g"
  "servingSize": 30,                        // 숫자만. 1회 제공량이면 실제 g/ml. 100g 기준이면 100.
  "servingUnit": "g",                       // "g" 또는 "ml"
  "totalAmount": 500,                       // 총 내용량 수치 (없으면 null)
  "nutrition": { "kcal": 150, "protein": 3, "carbs": 20, "fat": 7, "fiber": 0, "sugar": 8, "sodium": 150 },
  "per100": { "kcal": 500, "protein": 10, "carbs": 66, "fat": 23, "sodium": 500 }, // 100g당 컬럼이 보일 때만. 없으면 생략.
  "brand": "브랜드명 또는 null",
  "language": "__LANG__",
  "confidence": 0.95
}

N >= 2 (복수):
{
  "detectedFoods": [{"name":"A","evidence":"..."},{"name":"B","evidence":"..."}],
  "multiple": true,
  "items": [
    { "name":"A","unit":"100g","servingSize":100,"servingUnit":"g","totalAmount":null,"nutrition":{"kcal":165,"protein":31,"carbs":0.4,"fat":3.6,"fiber":0,"sugar":0,"sodium":60},"brand":null,"language":"__LANG__","confidence":0.9 },
    { "name":"B","unit":"1회 제공량 50g","servingSize":50,"servingUnit":"g","totalAmount":null,"nutrition":{"kcal":200,"protein":8,"carbs":30,"fat":7,"fiber":1,"sugar":12,"sodium":150},"brand":null,"language":"__LANG__","confidence":0.85 }
  ]
}

═══ STEP 5: 공통 규칙 ═══
- 정확히 보이는 값만 (불확실하면 confidence 낮춤)
- 없는 필드는 0 또는 null (fiber/sugar/sodium은 선택)
- 단위 g 통일 (mg → ÷1000, mcg → ÷1000000)
  ⚠️ 단 sodium(나트륨)은 라벨에 보통 mg 단위로 표기 → 그대로 mg 수치로 기록 (예: "나트륨 300mg" → sodium: 300)
- 범위값은 중간값 평균 ("3~4kcal" → 3.5, "15~20g" → 17.5)
- "약 3.5kcal" → 3.5 (수사 제거)
- %영양성분기준치/%DV/%1일 기준치 값은 **절대 nutrition 필드에 쓰지 않는다.**
- **JSON만 출력. 다른 텍스트 금지.**

═══ STEP 6: 자체 검증 (출력 전 점검) ═══
nutrition.kcal ≈ 4 × carbs + 4 × protein + 9 × fat ± 25% 범위인지 스스로 확인.
범위를 심하게 벗어나면 잘못된 컬럼(%DV 등)을 읽었을 가능성이 높으므로 **confidence를 0.5 이하로 낮추고 evidence에 "kcal-매크로 불일치" 명시**.`;

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
// 2026-04-20 (Codex #1 수정): _callGeminiJSON 은 { data, provider } wrapper 를 돌려주므로
//   반드시 `{ data }` 로 destructure 한 뒤 _normalizeNutritionParse 에 넘겨야 한다. 이전에는
//   wrapper 전체가 호출자에게 흘러가 parsed.multiple / parsed.items / parsed.nutrition 체크가
//   항상 실패 → 이미지 파싱이 사실상 상시 깨져 있었음. 모달의 _populateNutritionForm 에도
//   undefined 가 흘러가 "버튼은 눌려도 값이 비어 보이는" 증상의 2차 원인이 됐다.
export async function parseNutritionFromImage(imageBase64, language = 'ko') {
  const rules = _NUTRITION_RULES_KO.replace(/__LANG__/g, language);
  const prompt = `다음 이미지에서 영양정보를 추출하라.\n\n${rules}`;

  const { data } = await _callGeminiJSON([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
  ], 4096);
  return _normalizeNutritionParse(data);
}

// ── 영양성분 텍스트 파싱 ──────────────────────────────────────────
// 이미지 파서와 동일한 엔티티 기반 판정 사용
export async function parseNutritionFromText(rawText) {
  // 1) 정규식 파서 선시도 (AI 호출 전, 단일 항목 한정)
  try {
    const { parseNutritionRegex } = await import('../utils/nutrition-text-parser.js');
    const r = parseNutritionRegex(rawText);
    if (r.ok) return r.data;
  } catch (err) {
    console.warn('[parseNutritionFromText] 정규식 파서 로드 실패, AI로 진행:', err?.message || err);
  }

  // 2) 정규식 실패 → Gemini fallback
  // 2026-04-20 (Codex #1 수정): 위와 동일 — _callGeminiJSON 반환을 반드시 { data } 로 unwrap.
  const rules = _NUTRITION_RULES_KO.replace(/__LANG__/g, 'ko');
  const prompt = `다음 텍스트에서 영양정보를 추출하라.\n\n텍스트:\n${rawText}\n\n${rules}`;

  const { data } = await _callGeminiJSON([{ text: prompt }], 4096);
  return _normalizeNutritionParse(data);
}

// ── 다국어 감지 ──────────────────────────────────────────────────
// 2026-04-20: _callGeminiJSON 반환을 { data } 로 unwrap. wrapper 그대로 반환하면
//   호출자가 language/confidence 필드 접근 실패 (detectLanguage 는 현재 미사용이지만
//   방어적으로 수정 — 향후 호출자 추가 시 회귀 방지).
export async function detectLanguage(text) {
  const prompt = `텍스트의 주요 언어를 감지하세요.
텍스트: ${text.substring(0, 200)}
JSON 형식: {"language":"ko","confidence":0.95}
language는 ko, ja, en, other 중 하나.`;

  const { data } = await _callGeminiJSON([{ text: prompt }], 100);
  return data;
}
