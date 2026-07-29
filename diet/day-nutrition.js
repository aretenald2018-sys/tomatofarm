export const MEAL_PREFIXES = Object.freeze(['b', 'l', 'd', 's']);

function nutrientField(prefix, nutrient) {
  return `${prefix}${nutrient.charAt(0).toUpperCase()}${nutrient.slice(1)}`;
}

export function sumDayNutrient(day, nutrient) {
  if (!day || !nutrient) return 0;
  return MEAL_PREFIXES.reduce((sum, prefix) => {
    const value = Number(day[nutrientField(prefix, nutrient)]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function hasPositiveDayNutrient(day, nutrient) {
  if (!day || !nutrient) return false;
  return MEAL_PREFIXES.some(prefix => {
    const value = Number(day[nutrientField(prefix, nutrient)]);
    return Number.isFinite(value) && value > 0;
  });
}

export function countRecordedNutrientMeals(day, nutrient) {
  if (!day || !nutrient) return 0;
  return MEAL_PREFIXES.reduce((count, prefix) => {
    const value = Number(day[nutrientField(prefix, nutrient)]);
    return count + (Number.isFinite(value) && value > 0 ? 1 : 0);
  }, 0);
}
