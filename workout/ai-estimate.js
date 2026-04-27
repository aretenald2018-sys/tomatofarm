// ================================================================
// workout/ai-estimate.js
// AI 음식 사진 추정 파이프라인 (1-pass)
//   1) estimateInOnePass (분류+추정 단일 호출 — Gemini quota 절반 절약)
//   2) applyCafeteriaPrior (다이어트 기록용 보수 prior)
//   3) normalizeItems (한식 alias 통일 + kcal sanity check)
//   4) applyCafeteriaPortionGuard (반상 과잉합산 방지)
// ================================================================

import { estimateInOnePass } from '../ai.js';
import { normalizeFood, sanityCheckKcal } from '../data/korean-food-normalize.js';

// ── 반상 prior 보정 ──────────────────────────────────────────────
// 사진 속 모든 접시를 "전량 섭취"로 더하는 경향을 줄이기 위한 보수 추정.
export function applyCafeteriaPrior(estimate) {
  if (!estimate || estimate.plateType !== 'cafeteria') return estimate;

  const { totalKcal, confidence } = estimate;
  const priorMean = 760;
  const priorMin = 550, priorMax = 900;

  if (totalKcal > priorMax || confidence < 0.65) {
    const modelWeight = totalKcal > priorMax ? 0.35 : Math.max(0.2, Math.min(0.55, confidence));
    const adjusted = Math.round(totalKcal * modelWeight + priorMean * (1 - modelWeight));
    const clamped = Math.max(priorMin, Math.min(priorMax, adjusted));
    return { ..._scaleEstimate(estimate, clamped), priorApplied: true };
  }
  return estimate;
}

function _isRice(name) {
  return /밥|잡곡|현미|귀리|보리/.test(name || '');
}

function _isSoup(name) {
  return /국|탕|찌개|스프|수프|전골|국물/.test(name || '');
}

function _recalcEstimate(estimate, items, extra = {}) {
  return {
    ...estimate,
    ...extra,
    detectedItems: items,
    totalKcal: Math.round(items.reduce((s, i) => s + (i.kcal || 0), 0)),
    totalProtein: Math.round(items.reduce((s, i) => s + (i.protein || 0), 0) * 10) / 10,
    totalCarbs: Math.round(items.reduce((s, i) => s + (i.carbs || 0), 0) * 10) / 10,
    totalFat: Math.round(items.reduce((s, i) => s + (i.fat || 0), 0) * 10) / 10,
  };
}

function _scaleItem(item, scale) {
  return {
    ...item,
    grams: Math.round((item.grams || 0) * scale),
    kcal: Math.round((item.kcal || 0) * scale),
    protein: Math.round((item.protein || 0) * scale * 10) / 10,
    carbs: Math.round((item.carbs || 0) * scale * 10) / 10,
    fat: Math.round((item.fat || 0) * scale * 10) / 10,
  };
}

function _scaleEstimate(estimate, targetKcal) {
  const scale = targetKcal / Math.max(estimate.totalKcal || 1, 1);
  const items = (estimate.detectedItems || []).map(it => _scaleItem(it, scale));
  return _recalcEstimate(estimate, items);
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

export function applyCafeteriaPortionGuard(estimate) {
  if (!estimate || !['cafeteria', 'single_dish'].includes(estimate.plateType)) return estimate;
  let items = (estimate.detectedItems || []).map(it => {
    const name = it.name || '';
    if (_isRice(name) && (it.grams || 0) > 160) {
      return { ..._scaleItem(it, 160 / Math.max(it.grams || 1, 1)), portionCapped: 'rice160g' };
    }
    if (_isSoup(name) && (it.kcal || 0) > 180) {
      return { ..._scaleItem(it, 180 / Math.max(it.kcal || 1, 1)), portionCapped: 'soup180kcal' };
    }
    if (/반찬|나물|김치|샐러드/.test(name) && (it.kcal || 0) > 90) {
      return { ..._scaleItem(it, 90 / Math.max(it.kcal || 1, 1)), portionCapped: 'side90kcal' };
    }
    return it;
  });

  let guarded = _recalcEstimate(estimate, items);
  if (estimate.plateType === 'single_dish') {
    const looksLikeSet = items.length >= 5;
    if (looksLikeSet && guarded.totalKcal > 950) {
      return {
        ..._scaleEstimate(guarded, 850),
        portionGuardApplied: true,
      };
    }
    return guarded;
  }

  const hasRice = items.some(it => _isRice(it.name));
  const hasSoup = items.some(it => _isSoup(it.name));
  const isManyItemTray = items.length >= 5 || (hasRice && hasSoup && items.length >= 4);
  if (isManyItemTray && guarded.totalKcal > 850) {
    const target = hasRice && hasSoup ? 780 : 850;
    guarded = {
      ..._scaleEstimate(guarded, target),
      portionGuardApplied: true,
    };
  }
  return guarded;
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

  // 한식 반상 과잉합산 방지
  estimate = applyCafeteriaPortionGuard(estimate);

  return estimate; // classification은 이미 내부에 포함됨
}
