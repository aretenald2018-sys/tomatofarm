// ================================================================
// ai/diet-rec.js — 오늘의 식단/운동 추천 (말풍선 UI)
// ================================================================

import { TODAY, getMemo, getExercises, getDiet, getExList } from '../data.js';
import { callGemini } from './llm-core.js';

// ── 오늘의 식단 추천 ─────────────────────────────────────────────
export async function getDietRec() {
  const bubble = document.getElementById('diet-bubble');
  bubble.textContent = '';
  bubble.classList.add('loading');

  const recentMeals = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(TODAY); d.setDate(d.getDate() - i);
    const y = d.getFullYear(), mo = d.getMonth(), dd = d.getDate();
    const dt = getDiet(y, mo, dd);
    const foodsOrText = (meal, textVal) => {
      const foods = dt[meal + 'Foods'] || [];
      if (foods.length) return foods.map(f => f.name).slice(0, 3).join(', ');
      return textVal || '-';
    };
    const hasText = dt.breakfast || dt.lunch || dt.dinner || dt.snack;
    const hasFoods = (dt.bFoods?.length || 0) + (dt.lFoods?.length || 0) + (dt.dFoods?.length || 0) + (dt.sFoods?.length || 0) > 0;
    const hasKcal = ((dt.bKcal||0) + (dt.lKcal||0) + (dt.dKcal||0) + (dt.sKcal||0)) > 0;
    if (hasText || hasFoods || hasKcal) {
      const snackPart = (dt.snack || (dt.sFoods?.length > 0)) ? ` 간식(${foodsOrText('s', dt.snack)})` : '';
      recentMeals.push(`${i===0?'오늘':i+'일전'}: 아침(${foodsOrText('b', dt.breakfast)}) 점심(${foodsOrText('l', dt.lunch)}) 저녁(${foodsOrText('d', dt.dinner)})${snackPart}`);
    }
  }

  const prompt = `당신은 전문 영양사입니다. 다이어트 중인 성인 남성에게 오늘 식단 3세트를 추천해주세요.
최근 식단: ${recentMeals.length ? recentMeals.join(' / ') : '기록 없음'}
조건: 총 1500kcal 이하, 최근 메뉴와 겹치지 않게, 한식/양식/아시안 다양하게.
형식: 세트1~3 각각 아침/점심/저녁과 총칼로리를 3줄로 간결하게.`;

  try {
    bubble.textContent = await callGemini(prompt);
  } catch(e) {
    bubble.textContent = e.message === 'AI_TIMEOUT'
      ? '네트워크가 불안정해요. 다시 시도해주세요.'
      : '응답을 받지 못했어요.';
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
    bubble.textContent = e.message === 'AI_TIMEOUT'
      ? '네트워크가 불안정해요. 다시 시도해주세요.'
      : '응답을 받지 못했어요.';
  } finally {
    bubble.classList.remove('loading');
  }
}
