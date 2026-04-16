// ================================================================
// workout/ai-estimate.js
// AI 음식 사진 추정 파이프라인 (1-pass)
//   1) estimateInOnePass (분류+추정 단일 호출 — Gemini quota 절반 절약)
//   2) applyCafeteriaPrior (Bayesian shrinkage — 반상 800~1200 prior)
//   3) normalizeItems (한식 alias 통일 + kcal sanity check)
// ================================================================

import { estimateInOnePass } from '../ai.js';
import { normalizeFood, sanityCheckKcal } from '../data/korean-food-normalize.js';

// ── Bayesian prior 보정 (반상 전용) ──────────────────────────────
// confidence가 낮으면 prior(1000kcal) 쪽으로 shrinkage,
// confidence가 높으면 모델 값 신뢰.
export function applyCafeteriaPrior(estimate) {
  if (!estimate || estimate.plateType !== 'cafeteria') return estimate;

  const { totalKcal, confidence } = estimate;
  const priorMean = 1000;
  const priorMin = 800, priorMax = 1200;

  // confidence 0.5 미만 & 범위 밖이면 적극 보정
  if (confidence < 0.5 && (totalKcal < priorMin || totalKcal > priorMax)) {
    const weight = 1 - confidence; // 0.5 → 0.5
    const adjusted = Math.round(totalKcal * confidence + priorMean * weight);
    const clamped = Math.max(priorMin, Math.min(priorMax, adjusted));
    // 아이템별 kcal을 비례 스케일
    const scale = clamped / Math.max(totalKcal, 1);
    const items = estimate.detectedItems.map(it => ({
      ...it,
      kcal: Math.round(it.kcal * scale),
      protein: Math.round(it.protein * scale * 10) / 10,
      carbs: Math.round(it.carbs * scale * 10) / 10,
      fat: Math.round(it.fat * scale * 10) / 10,
    }));
    return {
      ...estimate,
      totalKcal: clamped,
      totalProtein: Math.round(estimate.totalProtein * scale * 10) / 10,
      totalCarbs: Math.round(estimate.totalCarbs * scale * 10) / 10,
      totalFat: Math.round(estimate.totalFat * scale * 10) / 10,
      detectedItems: items,
      priorApplied: true,
    };
  }
  return estimate;
}

// ── 아이템 이름 정규화 + kcal sanity check ───────────────────────
export function normalizeItems(estimate) {
  if (!estimate || !Array.isArray(estimate.detectedItems)) return estimate;
  const items = estimate.detectedItems.map(it => {
    const canonical = normalizeFood(it.name);
    const { kcal, corrected } = sanityCheckKcal(canonical, it.kcal, it.grams);
    return {
      ...it,
      name: canonical,
      originalName: it.name !== canonical ? it.name : undefined,
      kcal: kcal,
      kcalCorrected: corrected || undefined,
    };
  });
  // 총합 재계산 (sanity check로 값이 바뀌었을 수 있음)
  const totalKcal = Math.round(items.reduce((s, i) => s + (i.kcal || 0), 0));
  return { ...estimate, detectedItems: items, totalKcal };
}

// ── 수량/양 보정용 scale 적용 (빠른 보정 버튼) ──────────────────
// portion: 'less' | 'normal' | 'more' (기본 normal)
export function applyPortionScale(estimate, portion) {
  const scaleMap = { less: 0.75, normal: 1.0, more: 1.3 };
  const scale = scaleMap[portion] ?? 1.0;
  if (scale === 1.0) return estimate;
  const items = estimate.detectedItems.map(it => ({
    ...it,
    grams: Math.round((it.grams || 0) * scale),
    kcal: Math.round((it.kcal || 0) * scale),
    protein: Math.round((it.protein || 0) * scale * 10) / 10,
    carbs: Math.round((it.carbs || 0) * scale * 10) / 10,
    fat: Math.round((it.fat || 0) * scale * 10) / 10,
  }));
  return {
    ...estimate,
    detectedItems: items,
    totalKcal: Math.round(estimate.totalKcal * scale),
    totalProtein: Math.round(estimate.totalProtein * scale * 10) / 10,
    totalCarbs: Math.round(estimate.totalCarbs * scale * 10) / 10,
    totalFat: Math.round(estimate.totalFat * scale * 10) / 10,
    portionApplied: portion,
  };
}

// ── 특정 아이템 제외 (국 제외 등) ────────────────────────────────
export function excludeItems(estimate, predicate) {
  const kept = estimate.detectedItems.filter(it => !predicate(it));
  const totalKcal = Math.round(kept.reduce((s, i) => s + (i.kcal || 0), 0));
  const totalProtein = Math.round(kept.reduce((s, i) => s + (i.protein || 0), 0) * 10) / 10;
  const totalCarbs = Math.round(kept.reduce((s, i) => s + (i.carbs || 0), 0) * 10) / 10;
  const totalFat = Math.round(kept.reduce((s, i) => s + (i.fat || 0), 0) * 10) / 10;
  return { ...estimate, detectedItems: kept, totalKcal, totalProtein, totalCarbs, totalFat };
}

// ── 전체 파이프라인 (1-pass) ────────────────────────────────────
// estimateInOnePass 내부에서 이미 분류+아이템 추정이 단일 호출로 끝남.
// 호출 1회 = Gemini RPM 1 소모. (과거 2회 소모)
export async function runAIEstimate(imageBase64) {
  // 단일 호출로 분류 + 상세 추정
  let estimate = await estimateInOnePass(imageBase64);

  // Prior 보정 (반상만)
  estimate = applyCafeteriaPrior(estimate);

  // 한식 alias 정규화 + kcal sanity check
  estimate = normalizeItems(estimate);

  return estimate; // classification은 이미 내부에 포함됨
}
