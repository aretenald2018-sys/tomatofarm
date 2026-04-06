// ================================================================
// ai.js
// 의존성: config.js, data.js
// 역할: Gemini API 호출 (식단 추천, 운동 추천, 목표 실현가능성, 영양정보 파싱)
// ================================================================

import { CONFIG, MUSCLES }                    from './config.js';
import { TODAY, getMemo, getExercises, getDiet, getExList,
         getMuscles, getCF, dietDayOk }        from './data.js';

// ── 공통 Gemini 호출 ─────────────────────────────────────────────
export async function callGemini(prompt, maxTokens = 400) {
  const key = CONFIG.GEMINI_KEY;
  if (!key) throw new Error('Gemini API 키가 설정되지 않았습니다. 설정에서 입력해주세요.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates[0].content.parts[0].text;
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

// ── 영양성분표 이미지 파싱 (Gemini Vision API) ────────────────────
// 사진에서 영양정보 추출 후 JSON으로 변환
// 단일 제품 → { name, ... }, 복수 제품(표 등) → { multiple: true, items: [...] }
export async function parseNutritionFromImage(imageBase64, language = 'ko') {
  const key = CONFIG.GEMINI_KEY;
  if (!key) throw new Error('Gemini API 키가 설정되지 않았습니다. 설정에서 입력해주세요.');
  const langMap = { ko:'한국어', ja:'일본어', en:'영어' };
  const prompt = `다음 이미지에서 영양정보를 추출해주세요.

이미지에 제품이 **1개**이면 아래 JSON 형식으로 응답:
{
  "name": "음식명",
  "unit": "100g",
  "servingSize": 100,
  "servingUnit": "g",
  "nutrition": { "kcal": 165, "protein": 31, "carbs": 0.4, "fat": 3.6, "fiber": 0, "sugar": 0, "sodium": 60 },
  "brand": "브랜드명 (있으면)",
  "language": "${language}",
  "confidence": 0.95
}

이미지에 제품이 **2개 이상** (표, 비교표, 여러 라벨 등)이면 아래 JSON 형식으로 응답:
{
  "multiple": true,
  "items": [
    {
      "name": "제품A",
      "unit": "100g",
      "servingSize": 100,
      "servingUnit": "g",
      "nutrition": { "kcal": 165, "protein": 31, "carbs": 0.4, "fat": 3.6, "fiber": 0, "sugar": 0, "sodium": 60 },
      "brand": "브랜드명",
      "language": "${language}",
      "confidence": 0.90
    },
    {
      "name": "제품B",
      "unit": "1개",
      "servingSize": 50,
      "servingUnit": "g",
      "nutrition": { "kcal": 200, "protein": 8, "carbs": 30, "fat": 7, "fiber": 1, "sugar": 12, "sodium": 150 },
      "brand": "브랜드명",
      "language": "${language}",
      "confidence": 0.85
    }
  ]
}

주의사항:
- 표(table)에 복수 제품이 나열된 경우 반드시 items 배열로 **각각** 추출
- 정확히 보이는 값만 추출 (확실하지 않으면 confidence 낮추기)
- 없는 필드는 0 또는 null (fiber, sugar, sodium은 선택)
- 단위는 g로 통일 (mg는 /1000)
- 반드시 JSON만 출력 (다른 텍스트 없이)`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
        ]
      }],
      generationConfig: { maxOutputTokens: 2000 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.candidates[0].content.parts[0].text;
  const clean = text.trim().replace(/```json|```/g, '');
  return JSON.parse(clean);
}

// ── 영양성분 텍스트 파싱 ──────────────────────────────────────────
// 복사한 텍스트에서 영양정보 추출 (복수 항목 + 범위값 평균 처리)
// 단일 → { name, ... }, 복수 → { multiple: true, items: [...] }
export async function parseNutritionFromText(rawText) {
  const prompt = `다음 텍스트에서 영양정보를 추출해주세요.

텍스트:
${rawText}

═══ 규칙 ═══
1. **복수 항목**: 텍스트에 식재료/음식이 2개 이상이면 반드시 items 배열로 각각 추출
2. **범위값 평균**: "3~4 kcal"이면 3.5, "0.5~1g"이면 0.75 — 항상 중간값 사용
3. **"약" 제거**: "약 3.5kcal" → 3.5 (숫자만)
4. **1개당 기준**: "1개(15~20g) 기준" → servingSize는 중간값(17.5), unit은 "1개(17.5g)"
5. **단위 통일**: mg → g (÷1000), mcg → g (÷1000000)
6. **없는 값**: 0으로 처리 (null 아님)

═══ 응답 형식 ═══

식재료/음식이 **1개**일 때:
{
  "name": "음식명",
  "unit": "100g",
  "servingSize": 100,
  "servingUnit": "g",
  "nutrition": { "kcal": 165, "protein": 31, "carbs": 0.4, "fat": 3.6, "fiber": 0, "sugar": 0, "sodium": 0.06 },
  "brand": null,
  "language": "ko",
  "confidence": 0.95
}

식재료/음식이 **2개 이상**일 때:
{
  "multiple": true,
  "items": [
    { "name": "양송이버섯", "unit": "1개(17.5g)", "servingSize": 17.5, "servingUnit": "g", "nutrition": { "kcal": 3.5, "protein": 0.5, "carbs": 0.5, "fat": 0.05, "fiber": 0, "sugar": 0, "sodium": 0 }, "brand": null, "language": "ko", "confidence": 0.9 },
    { "name": "방울토마토", "unit": "1개(17.5g)", "servingSize": 17.5, "servingUnit": "g", "nutrition": { "kcal": 3.5, "protein": 0.2, "carbs": 0.8, "fat": 0.03, "fiber": 0, "sugar": 0, "sodium": 0 }, "brand": null, "language": "ko", "confidence": 0.9 }
  ]
}

반드시 JSON만 출력 (다른 텍스트 없이)`;

  const text = await callGemini(prompt, 2000);
  const clean = text.trim().replace(/```json|```/g, '');
  return JSON.parse(clean);
}

// ── 다국어 감지 ──────────────────────────────────────────────────
// 텍스트의 주요 언어 감지
export async function detectLanguage(text) {
  const prompt = `다음 텍스트의 주요 언어를 감지하고 JSON으로만 응답하세요.
텍스트: ${text.substring(0, 200)}

반드시 다음 형식으로만 (다른 텍스트 없이):
{"language": "ko|ja|en|other", "confidence": 0.95}`;

  const result = await callGemini(prompt, 100);
  const clean = result.trim().replace(/```json|```/g, '');
  return JSON.parse(clean);
}

// ── 목표 실현가능성 분석 ─────────────────────────────────────────
// 반환: { feasibility(0-100), realisticDate(YYYY-MM-DD), summary }
export async function analyzeGoalFeasibility(goal) {
  const today    = new Date();
  const ddayDate = goal.dday ? new Date(goal.dday) : null;
  const daysLeft = ddayDate ? Math.ceil((ddayDate - today) / 86400000) : null;

  // 최근 30일 운동/식단 실적
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
    : '(조건 미설정 — 목표 이름에서 추론하여 판단, 추론 기반 참고용)';

  const prompt = `당신은 헬스 트레이너 겸 목표 달성 코치입니다.
사용자 목표: "${goal.label}"
D-day: ${daysLeft !== null ? `${daysLeft}일 후 (${goal.dday})` : '날짜 미설정'}
${conditionStr}

최근 30일 실적:
- 운동 실시율: ${workoutRate}% (${workoutDays}/30일)
- 식단OK 달성률: ${dietRate}% (${dietOkDays}/30일)

반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이):
{"feasibility":72,"realisticDate":"2025-09-15","summary":"현재 운동 빈도는 양호하나 식단 관리가 부족합니다. 주 5회 운동과 식단 80% 달성 시 목표 달성 가능합니다."}

feasibility: 0-100 정수 (현재 페이스 유지 시 목표일 내 달성 가능성 %)
realisticDate: 현재 페이스를 유지했을 때 실제로 목표 달성 가능한 날짜 (YYYY-MM-DD)
summary: 2-3문장 간결한 분석 및 개선 제안`;

  const text  = await callGemini(prompt, 400);
  const clean = text.trim().replace(/```json|```/g, '');
  return JSON.parse(clean);
}
