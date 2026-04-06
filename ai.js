// ================================================================
// ai.js
// 의존성: config.js, data.js
// 역할: Gemini API 호출 (식단 추천, 운동 추천, 목표 실현가능성, 영양정보 파싱)
// ================================================================

import { CONFIG, MUSCLES }                    from './config.js';
import { TODAY, getMemo, getExercises, getDiet, getExList,
         getMuscles, getCF, dietDayOk }        from './data.js';

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

// ── 공통 Gemini 호출 (텍스트) ────────────────────────────────────
export async function callGemini(prompt, maxTokens = 400) {
  const key = CONFIG.GEMINI_KEY;
  if (!key) throw new Error('Gemini API 키가 설정되지 않았습니다.');
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

// ── 공통 Gemini 호출 (JSON 강제) ─────────────────────────────────
async function _callGeminiJSON(parts, maxTokens = 2000) {
  const key = CONFIG.GEMINI_KEY;
  if (!key) throw new Error('Gemini API 키가 설정되지 않았습니다.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.candidates[0].content.parts[0].text;
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

// ── 영양성분표 이미지 파싱 (Gemini Vision API) ────────────────────
export async function parseNutritionFromImage(imageBase64, language = 'ko') {
  const prompt = `다음 이미지에서 영양정보를 추출하여 JSON으로 응답하세요.

이미지 유형:
- 영양성분표 라벨 (제품 뒷면 등)
- 표/테이블 형식 (엑셀, 스프레드시트 등 - 행에 음식명, 열에 칼로리/탄수화물/단백질/지방 등)
- 메모, 텍스트, 손글씨 등

음식이 1개이면:
{"name":"음식명","unit":"100g","servingSize":100,"servingUnit":"g","nutrition":{"kcal":165,"protein":31,"carbs":0.4,"fat":3.6,"fiber":0,"sugar":0,"sodium":60},"brand":null,"language":"${language}","confidence":0.95}

음식이 2개 이상이면 (표/테이블의 각 행도 개별 음식으로 처리):
{"multiple":true,"items":[위와 같은 형식의 객체 배열]}

규칙:
- 표/테이블이면 각 행을 개별 음식 항목으로 추출
- 열 헤더(칼로리, 탄수화물, 단백질, 지방, 식이섬유, 당류, 나트륨 등)를 매핑
- 정확히 보이는 값만 추출, 없는 필드는 0
- mg는 g로 변환(/1000)
- JSON만 출력`;

  return _callGeminiJSON([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
  ], 2000);
}

// ── 영양성분 텍스트 파싱 ──────────────────────────────────────────
export async function parseNutritionFromText(rawText) {
  const prompt = `다음 텍스트에서 영양정보를 추출하여 JSON으로 응답하세요.

텍스트:
${rawText}

규칙:
- 복수 항목이면 {"multiple":true,"items":[...]}
- 단일이면 {"name":"음식명","unit":"100g","servingSize":100,"servingUnit":"g","nutrition":{"kcal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0},"brand":null,"language":"ko","confidence":0.95}
- 범위값은 중간값 사용 (3~4→3.5)
- mg→g (÷1000), 없는 값은 0
- JSON만 출력`;

  return _callGeminiJSON([{ text: prompt }], 2000);
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
