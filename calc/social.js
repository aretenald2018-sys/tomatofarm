// calc/social.js — 소셜 축하 이벤트 감지 순수 함수

import { calcSetVolume } from './volume.js';
import { safeNumber as _safeNum } from './shared.js';
import { hasPositiveDayNutrient, sumDayNutrient } from '../diet/day-nutrition.js';

// ================================================================
// Celebration Detectors (home/cheers-card 용 순수 함수들)
// 입력: 친구 워크아웃 문서들(today/yesterday/weekAgo) + 메타
// 출력: { type, priority, template, params } 또는 null
//   - template: 렌더 템플릿 id (cheers-card에서 문구로 변환)
//   - params: { name, exercise, value, ... } 모든 값은 원본(렌더링 단계에서 escape)
// calc.js는 판정만 수행하며 HTML/innerHTML 문자열을 생성하지 않는다 (XSS 방지).
// ================================================================

function _totalKcal(w) {
  return sumDayNutrient(w, 'kcal');
}

function _hasExerciseActivity(w) {
  if (!w) return false;
  return !!((w.exercises||[]).length || w.cf || w.swimming || w.running);
}

function _hasDietActivity(w) {
  if (!w) return false;
  return !!((w.bFoods||[]).length || (w.lFoods||[]).length || (w.dFoods||[]).length || (w.sFoods||[]).length)
    || hasPositiveDayNutrient(w, 'kcal');
}

function _isActiveDay(w) {
  return _hasExerciseActivity(w) || _hasDietActivity(w);
}

function _exerciseVolume(w) {
  if (!w || !Array.isArray(w.exercises)) return {};
  const out = {};
  for (const ex of w.exercises) {
    const id = ex.exerciseId || ex.id || ex.name || 'unknown';
    const name = ex.name || ex.exerciseName || id;
    let volume = 0;
    let topWeight = 0;
    for (const s of (ex.sets || [])) {
      const kg = _safeNum(s.kg);
      const reps = _safeNum(s.reps);
      if (kg > 0 && reps > 0) {
        volume += calcSetVolume(s);
        if (kg > topWeight) topWeight = kg;
      }
    }
    if (volume > 0 || topWeight > 0) {
      if (!out[id] || (out[id].volume < volume)) {
        out[id] = { id, name, volume, topWeight };
      }
    }
  }
  return out;
}

// weight 감지: body_checkins 기반 (호출부가 { latest:{date,weight}, weekAgo:{date,weight} } 전달)
// 두 체크인이 5일 이상 떨어져 있어야 의미있는 비교로 간주.
// category: 'diet' (체중은 식단/건강 축)
export function detectWeightDelta({ name, latestWeight, priorWeight, daysBetween }) {
  if (typeof latestWeight !== 'number' || !isFinite(latestWeight)) return null;
  if (typeof priorWeight !== 'number' || !isFinite(priorWeight)) return null;
  if (!daysBetween || daysBetween < 5) return null;
  const delta = Math.round((latestWeight - priorWeight) * 10) / 10;
  if (Math.abs(delta) < 0.3) return null;
  if (delta < 0) {
    return {
      type: 'weight_loss', priority: 95, category: 'diet',
      template: 'weight_loss',
      params: { name, kg: Math.abs(delta), days: daysBetween },
    };
  }
  return {
    type: 'weight_gain', priority: 40, category: 'diet',
    template: 'weight_gain',
    params: { name, kg: delta, days: daysBetween },
  };
}

// category: 'both' — 운동/식단 양쪽에서 활용 가능 (둘 다 복귀 시그널)
export function detectRevival({ name, today, yesterday, weekAgo }) {
  const activeToday = _isActiveDay(today);
  if (!activeToday) return null;
  const wasInactive = !_isActiveDay(yesterday) && !_isActiveDay(weekAgo);
  if (!wasInactive) return null;
  return {
    type: 'streak_revival', priority: 90, category: 'both',
    template: 'streak_revival',
    params: { name },
  };
}

// 한 끼가 기록되었는지: 텍스트 OR kcal OR foods OR skip OR diet-success 플래그
// dietDayOk()와 동일한 "기록 신호"를 사용해 텍스트 전용 기록도 인식한다.
function _mealHasRecord(textField, kcal, foods, skipped, ok) {
  return !!(
    (typeof textField === 'string' && textField.trim()) ||
    (typeof kcal === 'number' && kcal > 0) ||
    (Array.isArray(foods) && foods.length > 0) ||
    skipped || ok
  );
}

// 3끼 모두 "기록 있음(또는 skip)"인 완결된 다이어트 데이 판정 (공용 predicate)
// kcal cheers가 대상으로 삼는 "완결된 날" 정의. dietDayOk()와 계약을 공유.
export function dietDayHasAllMeals(w) {
  if (!w) return false;
  const b = _mealHasRecord(w.breakfast, w.bKcal, w.bFoods, w.breakfast_skipped, w.bOk);
  const l = _mealHasRecord(w.lunch,     w.lKcal, w.lFoods, w.lunch_skipped,     w.lOk);
  const d = _mealHasRecord(w.dinner,    w.dKcal, w.dFoods, w.dinner_skipped,    w.dOk);
  return b && l && d;
}

export function detectKcalDrop({ name, yesterday, dayBefore }) {
  // 오늘은 의도적으로 제외 — 아침/점심까지만 입력된 시점에 "덜 먹었다"로 오판정하는 문제 방지
  if (!dietDayHasAllMeals(yesterday) || !dietDayHasAllMeals(dayBefore)) return null;
  const yk = _totalKcal(yesterday);
  const dk = _totalKcal(dayBefore);
  if (yk <= 0 || dk <= 0) return null;
  const drop = dk - yk;
  if (drop < 200) return null; // 감지 임계값 상향(150→200)으로 노이즈 억제
  return {
    type: 'kcal_reduction', priority: 55, category: 'diet',
    template: 'kcal_reduction',
    params: { name, kcal: drop },
  };
}

// 노이즈 억제: pct와 abs 양쪽 하한선을 모두 넘어야 PR 인정.
// 선정은 '체감 의미'가 더 큰 abs 증가량 우선 → 메인 운동의 작은 % 개선이
// 보조 운동의 큰 %(ex. 5kg→6kg)보다 우선 노출되도록.
const VOLUME_PR_MIN_PCT  = 10;   // 기존 트리거 임계값 유지
const VOLUME_PR_MIN_ABS  = 200;  // kg·rep 하한 (보조운동 노이즈 컷)
const LIFT_PR_MIN_PCT    = 5;    // 1kg/20kg(=5%)처럼 과장되는 케이스 컷
const LIFT_PR_MIN_ABS_KG = 2.5;  // 원판 최소 증량분 기준

export function detectVolumePR({ name, today, yesterday, weekAgo }) {
  const tVol = _exerciseVolume(today);
  const yVol = _exerciseVolume(yesterday);
  const wVol = _exerciseVolume(weekAgo);
  let best = null;
  for (const id of Object.keys(tVol)) {
    const t = tVol[id];
    const prev = Math.max(yVol[id]?.volume || 0, wVol[id]?.volume || 0);
    if (prev <= 0) continue;
    const absDelta = t.volume - prev;
    const pct = Math.round((absDelta / prev) * 100);
    if (pct < VOLUME_PR_MIN_PCT) continue;
    if (absDelta < VOLUME_PR_MIN_ABS) continue;
    if (!best || absDelta > best._absDelta) {
      best = {
        type: 'volume_pr', priority: 75, category: 'exercise',
        template: 'volume_pr',
        params: { name, exerciseId: id, exercise: t.name, pct },
        _absDelta: absDelta,
      };
    }
  }
  if (best) delete best._absDelta;
  return best;
}

export function detectLiftPR({ name, today, yesterday, weekAgo }) {
  const tVol = _exerciseVolume(today);
  const yVol = _exerciseVolume(yesterday);
  const wVol = _exerciseVolume(weekAgo);
  let best = null;
  for (const id of Object.keys(tVol)) {
    const t = tVol[id];
    if (t.topWeight <= 0) continue;
    const prev = Math.max(yVol[id]?.topWeight || 0, wVol[id]?.topWeight || 0);
    if (prev <= 0) continue;
    const absDelta = t.topWeight - prev;
    const pct = Math.round((absDelta / prev) * 100);
    if (pct < LIFT_PR_MIN_PCT) continue;
    if (absDelta < LIFT_PR_MIN_ABS_KG) continue;
    if (!best || absDelta > best._absDelta) {
      best = {
        type: 'weight_pr', priority: 85, category: 'exercise',
        template: 'weight_pr',
        params: { name, exerciseId: id, exercise: t.name, pct },
        _absDelta: absDelta,
      };
    }
  }
  if (best) delete best._absDelta;
  return best;
}

export function detectFrequencyUp({ name, today, weekAgo }) {
  const tVol = _exerciseVolume(today);
  const wVol = _exerciseVolume(weekAgo);
  const newlyAdded = Object.values(tVol).filter((t) => !wVol[t.id]);
  if (!newlyAdded.length) return null;
  const pick = newlyAdded[0];
  return {
    type: 'frequency_up', priority: 50, category: 'exercise',
    template: 'frequency_up',
    params: { name, exerciseId: pick.id, exercise: pick.name },
  };
}

export function detectFullDietDay({ name, today }) {
  if (!today) return null;
  const full = !!(today.bOk && today.lOk && today.dOk);
  if (!full) return null;
  return {
    type: 'full_diet_day', priority: 45, category: 'diet',
    template: 'full_diet_day',
    params: { name },
  };
}

// NOTE: detectStreakMilestone, detectProteinGoal 은 별도 입력(streakDays, 친구 자신의 plan)이
// 호출부에서 안정적으로 확보되지 않는 한 자동 배열에 포함하지 않는다.
// 현재 cheers-card 컨텍스트에서는 정확한 판정이 불가능하므로 export만 하고 기본 배열에서 제외.
export function detectStreakMilestone({ name, streakDays }) {
  if (!streakDays) return null;
  const milestones = [3, 7, 14, 21, 30, 50, 100];
  if (!milestones.includes(streakDays)) return null;
  return {
    type: 'streak_milestone', priority: 80, category: 'both',
    template: 'streak_milestone',
    params: { name, days: streakDays },
  };
}

export function detectProteinGoal({ name, today, friendPlan }) {
  if (!today || !friendPlan) return null;
  const protein = sumDayNutrient(today, 'protein');
  const targetG = _safeNum(friendPlan.weight) * 1.6;
  if (targetG <= 0) return null;
  if (protein < targetG) return null;
  return {
    type: 'protein_goal', priority: 55, category: 'diet',
    template: 'protein_goal',
    params: { name, grams: Math.round(targetG) },
  };
}

// 기본 자동 실행 감지기 — 친구의 workouts 문서만으로 판정 가능한 것만 포함
// (streakDays / friendPlan 등 추가 입력이 필요한 감지기는 호출부에서 개별 실행)
export const CELEBRATION_DETECTORS = [
  detectWeightDelta,
  detectRevival,
  detectKcalDrop,
  detectVolumePR,
  detectLiftPR,
  detectFrequencyUp,
  detectFullDietDay,
];

export function runAllCelebrations(ctx) {
  const out = [];
  for (const fn of CELEBRATION_DETECTORS) {
    try {
      const r = fn(ctx);
      if (r) out.push(r);
    } catch (_) { /* ignore single detector failure */ }
  }
  return out;
}
