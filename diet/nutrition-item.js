import { NUTRITION_FIELDS } from './nutrition-fields.js';
import {
  normalizeFromCsv,
  normalizeFromLocalDB,
  normalizeFromTopLevel,
  estimateDefaultServingSize,
  serializeForStorage,
} from '../data/nutrition-normalize.js';

function _withInferredServing(item) {
  if (!item?.base?.type || !Array.isArray(item.servings)) return item;
  if (item.base.type !== 'per_100g' && item.base.type !== 'per_100ml') return item;
  if (item._grp === '원재료성' || item.source === 'gov_raw' || String(item.id || '').startsWith('raw_')) return item;

  const currentDefault = item.servings.find(option => option.id === item.defaultServingId);
  if (currentDefault && !['per_100g', 'per_100ml'].includes(currentDefault.id)) return item;

  const existing = item.servings.find(option => option.id === 'serving_est');
  if (existing) return { ...item, defaultServingId: existing.id };

  const amount = estimateDefaultServingSize(item.name);
  // 분류 정보가 없는 레거시 DB는 이름으로 100g 이외의 분량을 확실히 추정할 수 있을 때만 보정한다.
  const isKnownMealOrProduct = Boolean(item._grp && item._grp !== '원재료성')
    || ['csv', 'gov_meal', 'gov_proc', 'external'].includes(item.source);
  if (amount === 100 && !isKnownMealOrProduct) return item;

  const unit = item.base.type === 'per_100ml' ? 'ml' : 'g';
  return {
    ...item,
    servings: [
      ...item.servings,
      { id: 'serving_est', label: `1회 제공량 ${amount}${unit}`, grams: amount },
    ],
    defaultServingId: 'serving_est',
  };
}

export function toCanonicalNutritionItem(item) {
  if (!item) return null;
  if (item.base?.type && Array.isArray(item.servings) && item.servings.length) return _withInferredServing(item);
  if (item.energy != null && item.nutrition == null) return _withInferredServing(normalizeFromCsv(item));
  if (item.nutrition == null && (item.kcal != null || item.protein != null || item.carbs != null)) {
    return _withInferredServing(normalizeFromTopLevel(item));
  }
  return _withInferredServing(normalizeFromLocalDB(item));
}

export function canonicalNutritionDisplay(item) {
  const canonical = toCanonicalNutritionItem(item);
  if (!canonical) return null;
  const serving = canonical.servings.find(option => option.id === canonical.defaultServingId)
    || canonical.servings[0]
    || { grams: canonical.base?.grams || canonical.base?.ml || 100, label: canonical.base?.label || '100g' };
  const baseAmount = canonical.base?.type === 'per_100ml'
    ? (Number(canonical.base.ml) || 100)
    : (Number(canonical.base?.grams) || 100);
  const ratio = baseAmount > 0 ? (Number(serving.grams) || baseAmount) / baseAmount : 1;
  const nutrition = Object.fromEntries(
    NUTRITION_FIELDS
      .map(key => [key, Math.round((Number(canonical.nutrition?.[key]) || 0) * ratio * 10) / 10]),
  );
  return { canonical, serving, nutrition };
}

export function serializeCanonicalNutritionItem(item, extras = {}) {
  return serializeForStorage(toCanonicalNutritionItem(item), extras);
}
