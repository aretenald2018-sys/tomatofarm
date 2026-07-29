// calc/cycle.js — 토마토 성장 사이클 순수 함수

import {
  isDietDaySuccess,
  isExerciseDaySuccess,
  resolveDietTolerance,
} from './diet.js';
import { sumDayNutrient } from '../diet/day-nutrition.js';

// ── 토마토 키우기 시스템 ──────────────────────────────────────────

/**
 * 현재 토마토 사이클 상태 계산
 * @param {string} unitGoalStart - dateKey "YYYY-MM-DD"
 * @param {Date} today
 * @returns {{ cycleStart: string, dayIndex: number, days: string[] }}
 */
export function calcTomatoCycle(unitGoalStart, today) {
  if (!unitGoalStart) return { cycleStart: null, dayIndex: 0, days: [] };
  const start = new Date(unitGoalStart + 'T00:00:00');
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const todayMs = new Date(todayKey + 'T00:00:00').getTime();
  const diffDays = Math.floor((todayMs - start.getTime()) / 86400000);

  let cycleStartDate;
  if (diffDays < 0) {
    cycleStartDate = start;
  } else {
    const offset = Math.floor(diffDays / 3) * 3;
    cycleStartDate = new Date(start);
    cycleStartDate.setDate(cycleStartDate.getDate() + offset);
  }

  const dayIndex = Math.max(0, Math.min(2, Math.floor((todayMs - cycleStartDate.getTime()) / 86400000)));
  const days = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(cycleStartDate);
    d.setDate(d.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }

  return {
    cycleStart: days[0],
    dayIndex,
    days,
  };
}

/**
 * 완료된 3일 사이클 결과 평가 (식단 + 운동 듀얼 트랙)
 * @param {Array<{date:string, intake:number, target:number, dayData:object}>} dayResults
 * @param {object|null} [plan] - getDietPlan() 반환값. tolerance 적용에 사용.
 * @returns {{ dietAllSuccess: boolean, exerciseAllSuccess: boolean, tomatoesAwarded: number, dietSuccesses: boolean[], exerciseSuccesses: boolean[] }}
 */
export function evaluateCycleResult(dayResults, plan) {
  const tolerance = resolveDietTolerance(plan || null);
  const dietSuccesses = dayResults.map(d => {
    const dayData = d.dayData || {};
    // canonical 판정: food-chip/skip/sKcal 포함 전체 기록 기반
    const totalKcal = sumDayNutrient(dayData, 'kcal');
    const hasRecord = !!(dayData.breakfast || dayData.lunch || dayData.dinner ||
      (dayData.bFoods?.length) || (dayData.lFoods?.length) ||
      (dayData.dFoods?.length) || (dayData.sFoods?.length) ||
      dayData.breakfast_skipped || dayData.lunch_skipped || dayData.dinner_skipped);
    if (!hasRecord && totalKcal <= 0) return false;
    return isDietDaySuccess(totalKcal, d.target, tolerance);
  });
  const exerciseSuccesses = dayResults.map(d => isExerciseDaySuccess(d.dayData || {}));
  const dietAllSuccess = dietSuccesses.every(s => s);
  const exerciseAllSuccess = exerciseSuccesses.every(s => s);
  const tomatoesAwarded = (dietAllSuccess ? 1 : 0) + (exerciseAllSuccess ? 1 : 0);
  return { dietSuccesses, exerciseSuccesses, dietAllSuccess, exerciseAllSuccess, tomatoesAwarded };
}

/**
 * 날짜로부터 분기 키 반환
 * @param {Date|string} date
 * @returns {string} e.g. "2026-Q2"
 */
export function getQuarterKey(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}
