import { calcBurnedKcal } from '../calc.js';
import {
  TODAY,
  dietDayOk,
  getBodyCheckins,
  getCache,
  getDiet,
  getDietPlan,
  hasDietRecord,
  hasExerciseRecord,
} from '../data.js';
import { dateFromKey } from '../utils/date-key.js';
import { dateRange } from './analysis-range.js';
import {
  SKELETAL_KEYS,
  averageDayMetric,
  averageFrom,
  bodyFatMass,
  dayCarbs,
  dayFat,
  dayKcal,
  dayProtein,
  daySodium,
  daySugar,
  firstNumber,
  foodItems,
  foodKcal,
  foodName,
  weightOnOrBefore,
} from './day-aggregates.js';
import { maybeNumber } from './format.js';

export function buildStatsPeriodSummary(range) {
  const cache = getCache();
  const rangeKeys = dateRange(range.fromKey, range.toKey);
  const entries = rangeKeys.map(key => [key, cache[key] || {}]);
  const recordedEntries = Object.entries(cache)
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= range.fromKey && key <= range.toKey)
    .sort(([a], [b]) => a.localeCompare(b));
  const checkinsToDate = getBodyCheckins()
    .filter(checkin => (checkin?.date || '') <= range.toKey)
    .sort((a, b) => (a?.date || '').localeCompare(b?.date || ''));
  const periodCheckins = checkinsToDate
    .filter(checkin => (checkin?.date || '') >= range.fromKey);
  const plan = getDietPlan();
  const foodsByName = new Map();
  const macro = { carbs: 0, protein: 0, fat: 0, days: 0 };
  const sugar = { total: 0, days: 0 };
  const sodium = { total: 0, days: 0 };
  let topFoodDay = null;
  let topExerciseDay = null;
  let recordDays = 0;
  let exerciseDays = 0;
  let okDays = 0;
  let ngDays = 0;
  let intakeTotal = 0;
  let intakeDays = 0;
  let exerciseTotal = 0;
  let exerciseKcalDays = 0;

  const averageWeight = averageFrom(periodCheckins, checkin => maybeNumber(checkin.weight));
  const fallbackWeight = averageFrom(checkinsToDate, checkin => maybeNumber(checkin.weight));

  entries.forEach(([key, day]) => {
    const date = dateFromKey(key);
    if (date && date <= TODAY) {
      const y = date.getFullYear();
      const m = date.getMonth();
      const d = date.getDate();
      const diet = getDiet(y, m, d);
      const hasDiet = hasDietRecord(y, m, d);
      const hasExercise = hasExerciseRecord(y, m, d);
      const dietResult = dietDayOk(y, m, d);
      if (hasDiet || hasExercise) recordDays += 1;
      if (hasExercise) exerciseDays += 1;
      if (dietResult === true) okDays += 1;
      else if (dietResult === false) ngDays += 1;
      const intake = dayKcal(diet);
      if (intake > 0) {
        intakeTotal += intake;
        intakeDays += 1;
      }
    }

    const dayIntake = dayKcal(day);
    if (dayIntake > 0 && (!topFoodDay || dayIntake > topFoodDay.kcal)) {
      topFoodDay = { key, date: key, kcal: dayIntake };
    }
    foodItems(day).forEach(food => {
      const name = foodName(food);
      if (!name) return;
      const next = foodsByName.get(name) || { name, count: 0, kcalTotal: 0 };
      next.count += 1;
      next.kcalTotal += foodKcal(food);
      foodsByName.set(name, next);
    });

    const weight = weightOnOrBefore(checkinsToDate, key)
      ?? averageWeight
      ?? fallbackWeight
      ?? maybeNumber(plan?.weight)
      ?? 70;
    const burned = calcBurnedKcal(day, weight).total;
    if (burned > 0) {
      if (!topExerciseDay || burned > topExerciseDay.kcal) {
        topExerciseDay = { key, date: key, kcal: burned };
      }
      exerciseTotal += burned;
      exerciseKcalDays += 1;
    }

    const carbs = dayCarbs(day);
    const protein = dayProtein(day);
    const fat = dayFat(day);
    if (carbs + protein + fat > 0) {
      macro.carbs += carbs;
      macro.protein += protein;
      macro.fat += fat;
      macro.days += 1;
    }
    const sugarValue = daySugar(day);
    if (sugarValue !== null) {
      sugar.total += sugarValue;
      sugar.days += 1;
    }
    const sodiumValue = daySodium(day);
    if (sodiumValue !== null) {
      sodium.total += sodiumValue;
      sodium.days += 1;
    }
  });

  const topFood = [...foodsByName.values()]
    .sort((a, b) => (
      (b.count - a.count)
      || (b.kcalTotal - a.kcalTotal)
      || a.name.localeCompare(b.name)
    ))[0] || null;
  const firstCheckin = periodCheckins.length >= 2 ? periodCheckins[0] : null;
  const lastCheckin = periodCheckins.length >= 2
    ? periodCheckins[periodCheckins.length - 1]
    : null;
  const firstWeight = firstCheckin ? maybeNumber(firstCheckin.weight) : null;
  const lastWeight = lastCheckin ? maybeNumber(lastCheckin.weight) : null;
  const dietTotal = okDays + ngDays;

  return {
    cache,
    plan,
    range,
    entries,
    recordedEntries,
    checkinsToDate,
    periodCheckins,
    recordDays,
    exerciseDays,
    okDays,
    ngDays,
    dietRate: dietTotal ? Math.round(okDays / dietTotal * 100) : null,
    averageIntakeKcal: intakeDays ? Math.round(intakeTotal / intakeDays) : null,
    averageExerciseKcal: exerciseKcalDays ? Math.round(exerciseTotal / exerciseKcalDays) : null,
    intakeDays,
    exerciseKcalDays,
    topFood,
    topFoodDay,
    topExerciseDay,
    body: {
      averageWeightKg: averageWeight,
      averageBodyFatPct: averageFrom(periodCheckins, checkin => maybeNumber(checkin.bodyFatPct)),
      averageSkeletalMuscleKg: averageFrom(
        periodCheckins,
        checkin => firstNumber(checkin, SKELETAL_KEYS),
      ),
      averageFatMassKg: averageFrom(periodCheckins, bodyFatMass),
      weightDeltaKg: firstWeight !== null && lastWeight !== null ? lastWeight - firstWeight : null,
      checkinCount: periodCheckins.length,
    },
    nutrition: {
      sampledDays: macro.days,
      averageCarbsG: macro.days ? macro.carbs / macro.days : null,
      averageProteinG: macro.days ? macro.protein / macro.days : null,
      averageFatG: macro.days ? macro.fat / macro.days : null,
      averageSugarG: sugar.days ? sugar.total / sugar.days : null,
      averageSodiumMg: sodium.days ? sodium.total / sodium.days : null,
    },
    lifestyle: {
      averageSteps: averageDayMetric(entries, [
        { keys: ['steps', 'stepCount', 'dailySteps', 'walkSteps', 'walkingSteps'] },
      ]),
      averageStepKcal: averageDayMetric(entries, [
        { keys: ['stepsKcal', 'stepKcal', 'walkKcal', 'walkingKcal'] },
      ]),
      averageWaterMl: averageDayMetric(entries, [
        { keys: ['waterMl', 'waterIntakeMl', 'hydrationMl', 'drinkWaterMl'] },
        { keys: ['waterL', 'waterLiter'], scale: 1000 },
        { keys: ['waterCups', 'waterCupCount'], scale: 250 },
      ]),
      averageBowelCount: averageDayMetric(entries, [
        { keys: ['bowelCount', 'bowelMovementCount', 'stoolCount', 'poopCount', 'defecationCount'] },
      ]),
    },
  };
}
