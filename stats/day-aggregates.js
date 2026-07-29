import { sumDayNutrient } from '../diet/day-nutrition.js';
import { maybeNumber } from './format.js';

export const FOOD_KEYS = Object.freeze(['bFoods', 'lFoods', 'dFoods', 'sFoods']);
export const MEAL_PREFIXES = Object.freeze(['b', 'l', 'd', 's']);
export const SKELETAL_KEYS = Object.freeze([
  'skeletalMuscleMassKg',
  'skeletalMuscleMass',
  'skeletalMuscleKg',
  'muscleMassKg',
  'muscleMass',
  'smmKg',
  'smm',
]);
export const BODY_FAT_MASS_KEYS = Object.freeze([
  'bodyFatMassKg',
  'fatMassKg',
  'bodyFatKg',
  'fatKg',
]);

export function dayKcal(day) {
  return sumDayNutrient(day, 'kcal');
}

export function dayProtein(day) {
  return sumDayNutrient(day, 'protein');
}

export function dayCarbs(day) {
  return sumDayNutrient(day, 'carbs');
}

export function dayFat(day) {
  return sumDayNutrient(day, 'fat');
}

export function firstNumber(object, keys) {
  for (const key of keys) {
    const number = maybeNumber(object?.[key]);
    if (number !== null) return number;
  }
  return null;
}

export function foodItems(day) {
  return FOOD_KEYS.flatMap(key => Array.isArray(day?.[key]) ? day[key] : []);
}

export function foodName(food) {
  return String(food?.name || food?.foodName || food?.label || '').trim();
}

export function foodKcal(food) {
  return Number(food?.kcal ?? food?.calories ?? food?.energy) || 0;
}

export function sumMealFields(day, suffixes) {
  let total = 0;
  let seen = false;
  MEAL_PREFIXES.forEach(prefix => suffixes.forEach(suffix => {
    const number = maybeNumber(day?.[`${prefix}${suffix}`]);
    if (number !== null) {
      total += number;
      seen = true;
    }
  }));
  return seen ? total : null;
}

export function sumFoodFields(day, keys) {
  let total = 0;
  let seen = false;
  foodItems(day).forEach(food => {
    const number = firstNumber(food, keys);
    if (number !== null) {
      total += number;
      seen = true;
    }
  });
  return seen ? total : null;
}

export function daySugar(day) {
  return sumMealFields(day, ['Sugar', 'Sugars']) ?? sumFoodFields(day, ['sugar', 'sugars']);
}

export function daySodium(day) {
  return sumMealFields(day, ['Sodium', 'SodiumMg']) ?? sumFoodFields(day, ['sodium', 'sodiumMg']);
}

export function bodyFatMass(checkin) {
  const direct = firstNumber(checkin, BODY_FAT_MASS_KEYS);
  if (direct !== null) return direct;
  const weight = maybeNumber(checkin?.weight);
  const bodyFatPct = maybeNumber(checkin?.bodyFatPct);
  return weight !== null && bodyFatPct !== null ? weight * bodyFatPct / 100 : null;
}

export function averageFrom(list, getter) {
  let total = 0;
  let count = 0;
  list.forEach(item => {
    const number = getter(item);
    if (number !== null && Number.isFinite(number)) {
      total += number;
      count += 1;
    }
  });
  return count ? total / count : null;
}

export function weightOnOrBefore(checkins, key) {
  for (let index = checkins.length - 1; index >= 0; index -= 1) {
    const checkin = checkins[index];
    if ((checkin?.date || '') <= key) {
      const number = maybeNumber(checkin.weight);
      if (number !== null) return number;
    }
  }
  return null;
}

export function joinedMetrics(values) {
  if (values.every(value => !value)) return null;
  return values.map(value => value || '없음').join(' | ');
}

export function averageDayMetric(entries, specs) {
  let total = 0;
  let count = 0;
  entries.forEach(([, day]) => {
    for (const spec of specs) {
      const number = firstNumber(day, spec.keys);
      if (number === null) continue;
      total += number * (spec.scale || 1);
      count += 1;
      break;
    }
  });
  return count ? total / count : null;
}
