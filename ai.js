// ================================================================
// ai.js — 배럴 (R3a 리팩토링으로 ai/ 하위 모듈로 분할)
// ================================================================
// 의존성: data.js, data/data-core.js, calc.js, config.js
// 역할: Gemini Cloud Function 호출 (식단 추천, 운동 추천, 목표 실현가능성,
//       영양정보 파싱, 기구 파싱, 루틴 후보, 음식 사진 추정).
//
// 2026-04-20 refactor (R3a):
//   1530줄 단일 파일 → ai/ 7개 파일로 분할.
//   - llm-core.js      : Gemini/LLM 프록시, JSON 안전 파싱, 타임아웃
//   - muscles.js       : deriveMuscleIdsForItem (기구 → 부위 파생)
//   - diet-rec.js      : getDietRec / getWorkoutRec (말풍선)
//   - nutrition.js     : parseNutrition*, detectLanguage (영양성분 파싱)
//   - equipment.js     : parseEquipment* (기구 파싱, alias 인덱스, 분류기)
//   - routine.js       : generateBalanceNudge / generateRoutineCandidates /
//                        analyzeGoalFeasibility
//   - meal-estimate.js : classifyMealPhoto / estimateByType / estimateInOnePass
// 기존 import 호환을 위해 ai.js 는 배럴로 유지.
// ================================================================

// LLM 코어
export { callGemini, callClaude, ocrImage } from './ai/llm-core.js';

// 부위 파생
export { deriveMuscleIdsForItem } from './ai/muscles.js';

// 식단/운동 말풍선
export { getDietRec, getWorkoutRec } from './ai/diet-rec.js';

// 영양정보 파싱
export { parseNutritionFromImage, parseNutritionFromText, detectLanguage } from './ai/nutrition.js';

// 기구 파싱 (전문가 모드)
export { parseEquipmentFromText, parseEquipmentFromImage } from './ai/equipment.js';

// 루틴 후보 / 균형 nudge / 목표 실현가능성
export { generateBalanceNudge, generateRoutineCandidates, analyzeGoalFeasibility } from './ai/routine.js';

// 음식 사진 AI 추정
export { classifyMealPhoto, estimateByType, estimateInOnePass } from './ai/meal-estimate.js';
