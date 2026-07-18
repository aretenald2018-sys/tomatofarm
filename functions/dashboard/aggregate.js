"use strict";

const {
  DASHBOARD_SCHEMA_VERSION,
  DEFAULT_DASHBOARD_WEIGHTS,
  normalizeDashboardWeights,
  normalizeDomainScore,
  round,
  validateDashboardSnapshot,
} = require("./contract");
const {
  ceilingTargetScore,
  computeOverallScore,
  freshnessStatus,
  mixedScore,
  ratioScore,
  targetProgressScore,
  trendScore,
} = require("./scoring");
const { buildSeasonHealthGoals } = require("./season-goals");

const DEFAULT_DIET_PLAN = Object.freeze({
  height: null,
  weight: null,
  bodyFatPct: null,
  age: null,
  targetWeight: null,
  targetBodyFatPct: null,
  activityFactor: 1.3,
  lossRatePerWeek: 0.009,
  refeedKcal: 5000,
  refeedDays: [0, 6],
  deficitProteinPct: 41,
  deficitCarbPct: 50,
  deficitFatPct: 9,
  refeedProteinPct: 29,
  refeedCarbPct: 60,
  refeedFatPct: 11,
});

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asEpochMs(value) {
  if (value == null) return null;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function kstParts(nowEpochMs = Date.now()) {
  const shifted = new Date(Number(nowEpochMs) + 9 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

function dateKeyAt(nowEpochMs = Date.now()) {
  const { year, monthIndex, day } = kstParts(nowEpochMs);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateKeyToEpochMs(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - 9 * 60 * 60 * 1000;
}

function addDays(dateKey, offset) {
  const epoch = dateKeyToEpochMs(dateKey);
  if (epoch == null) return dateKey;
  return dateKeyAt(epoch + Number(offset) * 24 * 60 * 60 * 1000);
}

function mondayOf(dateKey) {
  const epoch = dateKeyToEpochMs(dateKey);
  if (epoch == null) return dateKey;
  const { dayOfWeek } = kstParts(epoch + 12 * 60 * 60 * 1000);
  return addDays(dateKey, -((dayOfWeek + 6) % 7));
}

function average(values) {
  const ready = values.map(Number).filter(Number.isFinite);
  return ready.length ? ready.reduce((sum, value) => sum + value, 0) / ready.length : null;
}

function sum(values) {
  return values.reduce((total, value) => total + number(value), 0);
}

function mealTotals(day = {}) {
  return {
    calories: sum([day.bKcal, day.lKcal, day.dKcal, day.sKcal]),
    protein: sum([day.bProtein, day.lProtein, day.dProtein, day.sProtein]),
    carbs: sum([day.bCarbs, day.lCarbs, day.dCarbs, day.sCarbs]),
    fat: sum([day.bFat, day.lFat, day.dFat, day.sFat]),
  };
}

function calcBmr(plan) {
  const weight = number(plan.weight);
  const height = number(plan.height);
  const age = number(plan.age);
  const bodyFatPct = number(plan.bodyFatPct);
  if (!(weight > 0) || !(height > 0) || !(age > 0)) return 0;
  if (bodyFatPct > 0) return Math.round(370 + 21.6 * weight * (1 - bodyFatPct / 100));
  return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
}

function calcDietMetrics(value = {}) {
  const plan = { ...DEFAULT_DIET_PLAN, ...(value || {}) };
  const bmr = calcBmr(plan);
  if (!(bmr > 0)) return null;
  const tdee = Math.ceil(Math.round(bmr * number(plan.activityFactor, 1.3)) / 100) * 100;
  const weeklyLossKg = number(plan.weight) * number(plan.lossRatePerWeek, 0.009);
  const dailyDeficit = weeklyLossKg * (7700 / 7 / number(plan.activityFactor, 1.3));
  const weeklyKcal = Math.round((tdee - dailyDeficit) * 7);
  const refeedDayCount = Array.isArray(plan.refeedDays) && plan.refeedDays.length ? plan.refeedDays.length : 2;
  const deficitDayCount = Math.max(1, 7 - refeedDayCount);
  const deficitKcal = Math.max(0, Math.round((weeklyKcal - number(plan.refeedKcal, 5000)) / deficitDayCount));
  const refeedKcal = Math.max(0, Math.round(number(plan.refeedKcal, 5000) / refeedDayCount));
  const macro = (kcal, proteinPct, carbPct, fatPct) => ({
    kcal,
    proteinG: Math.round(kcal * number(proteinPct) / 100 / 4),
    carbG: Math.round(kcal * number(carbPct) / 100 / 4),
    fatG: Math.round(kcal * number(fatPct) / 100 / 9),
  });
  return {
    deficit: macro(deficitKcal, plan.deficitProteinPct, plan.deficitCarbPct, plan.deficitFatPct),
    refeed: macro(refeedKcal, plan.refeedProteinPct, plan.refeedCarbPct, plan.refeedFatPct),
    refeedDays: Array.isArray(plan.refeedDays) ? plan.refeedDays.map(Number) : [0, 6],
  };
}

function dietTargetFor(dateKey, dietPlan) {
  const metrics = calcDietMetrics(dietPlan);
  if (!metrics) return null;
  const epoch = dateKeyToEpochMs(dateKey);
  if (epoch == null) return null;
  const dayOfWeek = kstParts(epoch + 12 * 60 * 60 * 1000).dayOfWeek;
  return metrics.refeedDays.includes(dayOfWeek) ? metrics.refeed : metrics.deficit;
}

function normalizedWorkouts(workouts = []) {
  return workouts
    .map((day) => ({ ...day, dateKey: day.dateKey || day.id || day.dk }))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day.dateKey || "")))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

function dayByKey(workouts) {
  return new Map(normalizedWorkouts(workouts).map((day) => [day.dateKey, day]));
}

function hasMeaningfulRecordValue(value) {
  if (value == null || value === false) return false;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasMeaningfulRecordValue);
  return true;
}

function hasStrengthSessionRecord(session = {}) {
  return Array.isArray(session?.exercises) && session.exercises.length > 0;
}

function hasRunningSessionRecord(session = {}) {
  const summary = session?.runRouteSummary && typeof session.runRouteSummary === "object"
    ? session.runRouteSummary
    : null;
  return !!(
    session?.running
    || number(session?.runDistance) > 0
    || number(session?.runDurationSec) > 0
    || number(session?.runDurationMin) > 0
    || (Array.isArray(session?.runRoute) && session.runRoute.length > 0)
    || hasMeaningfulRecordValue(session?.runRouteRef)
    || hasMeaningfulRecordValue(summary)
  );
}

function strengthSessions(day = {}) {
  const sessionMatches = (Array.isArray(day.workoutSessions) ? day.workoutSessions : [])
    .filter(hasStrengthSessionRecord);
  if (sessionMatches.length) return sessionMatches;
  return hasStrengthSessionRecord(day) ? [day] : [];
}

function runningSessions(day = {}) {
  const sessionMatches = (Array.isArray(day.workoutSessions) ? day.workoutSessions : [])
    .filter(hasRunningSessionRecord);
  if (sessionMatches.length) return sessionMatches;
  return hasRunningSessionRecord(day) ? [day] : [];
}

function setDone(set = {}) {
  return set.done === true || (number(set.kg) > 0 && number(set.reps) > 0);
}

function strengthDayMetrics(day = {}) {
  const sessions = strengthSessions(day);
  let completedSets = 0;
  let targetSets = 0;
  let volumeKg = 0;
  const exercises = [];
  for (const session of sessions) {
    for (const exercise of session.exercises || []) {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
      const done = sets.filter(setDone);
      completedSets += done.length;
      targetSets += sets.length;
      const volume = done.reduce((total, set) => total + number(set.kg) * number(set.reps), 0);
      volumeKg += volume;
      const best = done.slice().sort((a, b) => number(b.kg) - number(a.kg))[0] || sets[0] || {};
      exercises.push({
        id: exercise.exerciseId || exercise.id || "",
        label: exercise.name || exercise.exerciseName || "운동",
        kg: round(number(best.kg), 1),
        reps: Math.round(number(best.reps)),
        completedSets: done.length,
        targetSets: sets.length,
        volumeKg: volume,
      });
    }
  }
  return { sessions: sessions.length, completedSets, targetSets, volumeKg, exercises };
}

function runningSessionMetrics(session = {}) {
  const summary = session.runRouteSummary && typeof session.runRouteSummary === "object" ? session.runRouteSummary : {};
  const explicitDistanceKm = number(session.runDistance);
  const distanceKm = explicitDistanceKm > 0
    ? explicitDistanceKm
    : number(summary.distanceKm || summary.totalDistanceKm);
  const explicitDurationSec = Math.max(0, number(session.runDurationMin)) * 60
    + Math.max(0, number(session.runDurationSec));
  const durationSec = explicitDurationSec > 0
    ? explicitDurationSec
    : number(summary.durationSec || summary.totalDurationSec);
  const paceSecPerKm = number(session.runAvgPaceSecPerKm || summary.avgPaceSecPerKm) || (distanceKm > 0 ? durationSec / distanceKm : 0);
  return {
    distanceKm,
    durationSec,
    paceSecPerKm,
    cadenceSpm: number(summary.cadenceSpm || summary.avgCadenceSpm) || null,
    startedAt: asEpochMs(session.runStartedAt || summary.startedAt) || null,
  };
}

function foodDomain(workouts, dietPlan, todayKey, nowEpochMs) {
  const days = dayByKey(workouts);
  const today = days.get(todayKey) || {};
  const todayTotals = mealTotals(today);
  const target = dietTargetFor(todayKey, dietPlan);
  const goal = targetProgressScore(todayTotals.calories, target?.kcal);
  const periodScores = (startOffset, endOffset) => {
    const rows = [];
    for (let offset = startOffset; offset <= endOffset; offset += 1) {
      const key = addDays(todayKey, offset);
      const totals = mealTotals(days.get(key) || {});
      if (!(totals.calories > 0)) continue;
      rows.push(targetProgressScore(totals.calories, dietTargetFor(key, dietPlan)?.kcal));
    }
    return rows.filter((score) => score != null);
  };
  const currentAverage = average(periodScores(-6, 0));
  const previousAverage = average(periodScores(-13, -7));
  const trend = trendScore(currentAverage, previousAverage);
  const latestFoodDay = normalizedWorkouts(workouts).filter((day) => mealTotals(day).calories > 0).at(-1);
  const updatedAtEpochMs = latestFoodDay ? dateKeyToEpochMs(latestFoodDay.dateKey) + 23 * 60 * 60 * 1000 : null;
  return {
    score: mixedScore(goal, trend),
    freshness: freshnessStatus(updatedAtEpochMs, nowEpochMs),
    updatedAtEpochMs,
    goalScore: goal,
    trendScore: trend,
    actualKcal: Math.round(todayTotals.calories),
    targetKcal: target?.kcal || null,
    proteinG: round(todayTotals.protein, 1),
    carbsG: round(todayTotals.carbs, 1),
    fatG: round(todayTotals.fat, 1),
    targetProteinG: target?.proteinG || null,
    targetCarbsG: target?.carbG || null,
    targetFatG: target?.fatG || null,
  };
}

function healthDomain(workouts, workoutPlan, todayKey, nowEpochMs) {
  const weekStart = mondayOf(todayKey);
  const previousStart = addDays(weekStart, -7);
  const currentDays = normalizedWorkouts(workouts).filter((day) => day.dateKey >= weekStart && day.dateKey <= todayKey);
  const previousDays = normalizedWorkouts(workouts).filter((day) => day.dateKey >= previousStart && day.dateKey < weekStart);
  const combine = (days) => days.map(strengthDayMetrics).reduce((acc, row) => ({
    sessions: acc.sessions + (row.sessions > 0 ? 1 : 0),
    completedSets: acc.completedSets + row.completedSets,
    targetSets: acc.targetSets + row.targetSets,
    volumeKg: acc.volumeKg + row.volumeKg,
    exercises: [...acc.exercises, ...row.exercises],
  }), { sessions: 0, completedSets: 0, targetSets: 0, volumeKg: 0, exercises: [] });
  const current = combine(currentDays);
  const previous = combine(previousDays);
  const weeklySessionTarget = number(workoutPlan?.weeklySessionTarget, 3);
  const goal = current.targetSets > 0
    ? ratioScore(current.completedSets, current.targetSets)
    : ratioScore(current.sessions, weeklySessionTarget);
  const trend = trendScore(current.volumeKg || current.sessions, previous.volumeKg || previous.sessions);
  const latest = normalizedWorkouts(workouts).filter((day) => strengthSessions(day).length).at(-1);
  const updatedAtEpochMs = latest ? dateKeyToEpochMs(latest.dateKey) + 23 * 60 * 60 * 1000 : null;
  const grouped = new Map();
  for (const exercise of current.exercises) {
    const key = exercise.id || exercise.label;
    const existing = grouped.get(key) || { ...exercise, completedSets: 0, targetSets: 0, volumeKg: 0 };
    existing.completedSets += exercise.completedSets;
    existing.targetSets += exercise.targetSets;
    existing.volumeKg += exercise.volumeKg;
    if (exercise.kg > existing.kg) Object.assign(existing, { kg: exercise.kg, reps: exercise.reps });
    grouped.set(key, existing);
  }
  return {
    score: mixedScore(goal, trend),
    freshness: freshnessStatus(updatedAtEpochMs, nowEpochMs),
    updatedAtEpochMs,
    goalScore: goal,
    trendScore: trend,
    completedSets: current.completedSets,
    targetSets: current.targetSets,
    sessions: current.sessions,
    weeklySessionTarget,
    volumeKg: Math.round(current.volumeKg),
    workouts: [...grouped.values()].sort((a, b) => b.volumeKg - a.volumeKg).slice(0, 3).map((row) => ({
      label: row.label,
      value: row.kg > 0 && row.reps > 0 ? `${row.kg}kg × ${row.reps}` : "기록됨",
      status: row.targetSets > 0 ? `${row.completedSets}/${row.targetSets}` : "완료",
    })),
  };
}

function runningDomain(workouts, runningPlan, todayKey, nowEpochMs) {
  const weekStart = mondayOf(todayKey);
  const weekRows = [];
  for (let offset = -28; offset <= 0; offset += 7) {
    const start = addDays(weekStart, offset);
    const end = addDays(start, 6);
    const metrics = normalizedWorkouts(workouts)
      .filter((day) => day.dateKey >= start && day.dateKey <= end && day.dateKey <= todayKey)
      .flatMap((day) => runningSessions(day).map((session) => ({ dateKey: day.dateKey, ...runningSessionMetrics(session) })));
    weekRows.push({
      start,
      distanceKm: sum(metrics.map((row) => row.distanceKm)),
      sessions: metrics.length,
      paceSecPerKm: average(metrics.filter((row) => row.distanceKm > 0 && row.paceSecPerKm > 0).map((row) => row.paceSecPerKm)),
      cadenceSpm: average(metrics.map((row) => row.cadenceSpm).filter(Boolean)),
      metrics,
    });
  }
  const current = weekRows.at(-1);
  const previous = weekRows.at(-2);
  const distanceGoal = ratioScore(current.distanceKm, number(runningPlan?.weeklyDistanceKm, 20));
  const sessionGoal = ratioScore(current.sessions, number(runningPlan?.weeklySessions, 3));
  const goal = average([distanceGoal, sessionGoal].filter((value) => value != null));
  const distanceTrend = trendScore(current.distanceKm, previous.distanceKm);
  const paceTrend = trendScore(current.paceSecPerKm, previous.paceSecPerKm, { lowerIsBetter: true });
  const trend = average([distanceTrend, paceTrend].filter((value) => value != null));
  const allRuns = normalizedWorkouts(workouts)
    .flatMap((day) => runningSessions(day).map((session, sessionIndex) => ({
      dateKey: day.dateKey,
      sessionIndex,
      ...runningSessionMetrics(session),
    })))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey)
      || number(a.startedAt) - number(b.startedAt)
      || a.sessionIndex - b.sessionIndex);
  const latest = allRuns.at(-1);
  const updatedAtEpochMs = latest ? dateKeyToEpochMs(latest.dateKey) + 23 * 60 * 60 * 1000 : null;
  return {
    score: mixedScore(goal, trend),
    freshness: freshnessStatus(updatedAtEpochMs, nowEpochMs),
    updatedAtEpochMs,
    goalScore: normalizeDomainScore(goal),
    trendScore: normalizeDomainScore(trend),
    weeklyDistanceKm: round(current.distanceKm, 1),
    weeklyDistanceTargetKm: number(runningPlan?.weeklyDistanceKm, 20),
    weeklySessions: current.sessions,
    weeklySessionTarget: number(runningPlan?.weeklySessions, 3),
    latestPaceSecPerKm: latest?.paceSecPerKm ? Math.round(latest.paceSecPerKm) : null,
    latestCadenceSpm: latest?.cadenceSpm ? Math.round(latest.cadenceSpm) : null,
    paceChangePct: current.paceSecPerKm && previous.paceSecPerKm
      ? round(((previous.paceSecPerKm - current.paceSecPerKm) / previous.paceSecPerKm) * 100, 1)
      : null,
    cadenceChangePct: current.cadenceSpm && previous.cadenceSpm
      ? round(((current.cadenceSpm - previous.cadenceSpm) / previous.cadenceSpm) * 100, 1)
      : null,
    trend: weekRows.map((row) => round(row.distanceKm, 1)),
    records: allRuns.slice(-5).reverse().map((run) => ({
      dateKey: run.dateKey,
      distanceKm: round(run.distanceKm, 2),
      paceSecPerKm: run.paceSecPerKm > 0 ? Math.round(run.paceSecPerKm) : null,
      cadenceSpm: run.cadenceSpm ? Math.round(run.cadenceSpm) : null,
    })),
  };
}

function timestampOfTransaction(transaction) {
  return asEpochMs(transaction?.occurredAt || transaction?.date || transaction?.createdAt);
}

function transactionExpense(transaction) {
  if (
    transaction?.hidden
    || transaction?.budgetExcluded
    || transaction?.excludedFromBudget
    || transaction?.excludeFromBudget
    || transaction?.reimbursementExpected
    || transaction?.excludeReason === "reimbursement_expected"
  ) return 0;
  if (!["card_payment", "transfer_out"].includes(transaction?.type)) return 0;
  return Math.max(0, number(transaction.amount));
}

function spendingDomain(budget, nowEpochMs) {
  const { year, monthIndex, day } = kstParts(nowEpochMs);
  const monthStart = Date.UTC(year, monthIndex, 1) - 9 * 60 * 60 * 1000;
  const nextMonthStart = Date.UTC(year, monthIndex + 1, 1) - 9 * 60 * 60 * 1000;
  const previousMonthStart = Date.UTC(year, monthIndex - 1, 1) - 9 * 60 * 60 * 1000;
  const previousMonthEnd = Date.UTC(year, monthIndex, 1) - 9 * 60 * 60 * 1000 - 1;
  const previousMonthDayCount = kstParts(previousMonthEnd).day;
  const comparableDay = Math.min(day, previousMonthDayCount);
  const currentCutoff = Date.UTC(year, monthIndex, day + 1) - 9 * 60 * 60 * 1000;
  const previousCutoff = Date.UTC(year, monthIndex - 1, comparableDay + 1) - 9 * 60 * 60 * 1000;
  const daysInMonth = Math.round((nextMonthStart - monthStart) / (24 * 60 * 60 * 1000));
  const categories = Array.isArray(budget.categories) ? budget.categories : [];
  const byId = new Map(categories.map((category) => [category.id, category]));
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const controlCategories = categories.filter((category) => category.kind === "expense" && category.budgetRhythm !== "fixed");
  const target = controlCategories.reduce((total, category) => (
    total + number(category.monthlyTargets?.[monthKey] ?? category.target)
  ), 0);
  const isControl = (transaction) => {
    const category = byId.get(transaction.categoryId) || categories.find((row) => row.name === transaction.category);
    return !category || category.budgetRhythm !== "fixed";
  };
  const rows = (budget.transactions || []).map((transaction) => ({
    ...transaction,
    epochMs: timestampOfTransaction(transaction),
    expense: transactionExpense(transaction),
    controlExpense: isControl(transaction) ? transactionExpense(transaction) : 0,
  })).filter((transaction) => transaction.epochMs != null);
  const currentSpent = sum(rows.filter((row) => row.epochMs >= monthStart && row.epochMs < currentCutoff).map((row) => row.expense));
  const previousSpent = sum(rows.filter((row) => row.epochMs >= previousMonthStart && row.epochMs < previousCutoff).map((row) => row.expense));
  const currentControlSpent = sum(rows.filter((row) => row.epochMs >= monthStart && row.epochMs < currentCutoff).map((row) => row.controlExpense));
  const previousControlSpent = sum(rows.filter((row) => row.epochMs >= previousMonthStart && row.epochMs < previousCutoff).map((row) => row.controlExpense));
  const expectedTarget = target > 0 ? target * day / daysInMonth : null;
  const goal = ceilingTargetScore(currentControlSpent, expectedTarget);
  const trend = previousControlSpent > 0 ? trendScore(currentControlSpent, previousControlSpent, { lowerIsBetter: true }) : null;
  const latest = rows.filter((row) => row.expense > 0 && row.epochMs < currentCutoff).sort((a, b) => a.epochMs - b.epochMs).at(-1);
  const currentCumulativeTrend = [];
  const previousCumulativeTrend = [];
  let currentCumulative = 0;
  let previousCumulative = 0;
  for (let date = 1; date <= day; date += 1) {
    const currentDayStart = Date.UTC(year, monthIndex, date) - 9 * 60 * 60 * 1000;
    const previousDate = Math.min(date, previousMonthDayCount);
    const previousDayStart = Date.UTC(year, monthIndex - 1, previousDate) - 9 * 60 * 60 * 1000;
    currentCumulative += sum(rows.filter((row) => row.epochMs >= currentDayStart && row.epochMs < currentDayStart + 24 * 60 * 60 * 1000).map((row) => row.expense));
    if (date <= previousMonthDayCount) {
      previousCumulative += sum(rows.filter((row) => row.epochMs >= previousDayStart && row.epochMs < previousDayStart + 24 * 60 * 60 * 1000).map((row) => row.expense));
    }
    currentCumulativeTrend.push(Math.round(currentCumulative));
    previousCumulativeTrend.push(Math.round(previousCumulative));
  }
  const samePeriodDifference = previousSpent - currentSpent;
  const todayKey = dateKeyAt(nowEpochMs);
  const cycle = biweeklyRange(todayKey, budget?.appSettings?.biweeklyStartDate);
  const twoWeekTarget = controlCategories.reduce((total, category) => (
    total + biweeklyTarget(category, monthKey)
  ), 0);
  const twoWeekSpent = sum(rows.filter((row) => (
    row.controlExpense > 0
    && dateKeyAt(row.epochMs) >= cycle.startDate
    && dateKeyAt(row.epochMs) <= todayKey
  )).map((row) => row.controlExpense));
  const todaySpent = sum(rows.filter((row) => (
    row.controlExpense > 0 && dateKeyAt(row.epochMs) === todayKey
  )).map((row) => row.controlExpense));
  const todayTarget = twoWeekTarget > 0 ? Math.round(twoWeekTarget / 14) : 0;
  return {
    score: mixedScore(goal, trend),
    freshness: freshnessStatus(latest?.epochMs, nowEpochMs),
    updatedAtEpochMs: latest?.epochMs || null,
    goalScore: goal,
    trendScore: trend,
    monthSpent: Math.round(currentSpent),
    controlMonthSpent: Math.round(currentControlSpent),
    monthlyTarget: Math.round(target),
    expectedTarget: expectedTarget == null ? null : Math.round(expectedTarget),
    savings: expectedTarget == null ? null : Math.round(expectedTarget - currentControlSpent),
    previousSamePeriodSpent: Math.round(previousSpent),
    samePeriodDifference: Math.round(samePeriodDifference),
    samePeriodChangePct: previousSpent > 0 ? round(((currentSpent - previousSpent) / previousSpent) * 100, 1) : null,
    comparisonDay: comparableDay,
    currentCumulativeTrend,
    previousCumulativeTrend,
    twoWeek: {
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      spent: Math.round(twoWeekSpent),
      target: Math.round(twoWeekTarget),
      todaySpent: Math.round(todaySpent),
      todayTarget,
    },
  };
}

function biweeklyTarget(category = {}, monthKey = "") {
  const monthly = number(category?.monthlyTargets?.[monthKey] ?? category?.target);
  return category?.budgetRhythm === "front_loaded" ? Math.round(monthly) : Math.round(monthly / 2);
}

function biweeklyRange(todayKey, anchorDate) {
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(anchorDate || "")) ? String(anchorDate) : "";
  if (anchor) {
    const diffDays = Math.floor((dateKeyToEpochMs(todayKey) - dateKeyToEpochMs(anchor)) / (24 * 60 * 60 * 1000));
    const startDate = addDays(anchor, Math.floor(diffDays / 14) * 14);
    return { startDate, endDate: addDays(startDate, 13) };
  }
  const iso = new Date(`${todayKey}T12:00:00Z`);
  const day = iso.getUTCDay() || 7;
  iso.setUTCDate(iso.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(iso.getUTCFullYear(), 0, 1);
  const week = Math.ceil((((iso.getTime() - yearStart) / 86400000) + 1) / 7);
  const monday = mondayOf(todayKey);
  const startDate = week % 2 === 0 ? addDays(monday, -7) : monday;
  return { startDate, endDate: addDays(startDate, 13) };
}

function rewardPointsDomain(budget, nowEpochMs) {
  const appSettings = budget?.appSettings || {};
  const rewardSettings = appSettings?.rewardSavings || {};
  const categories = Array.isArray(budget?.categories) ? budget.categories : [];
  const byId = new Map(categories.map((category) => [category.id, category]));
  const pointItems = normalizePointItems(rewardSettings);
  const enabledItems = pointItems.filter((item) => item.enabled);
  if (!enabledItems.length) return { state: "missing" };
  const todayKey = dateKeyAt(nowEpochMs);
  const selectedDailyReward = rewardSettings?.dailyReward || {};
  const configuredFocus = enabledItems.find((item) => item.id === String(selectedDailyReward.focusBucketKey || ""));
  const point = configuredFocus || enabledItems[0];
  const cycle = biweeklyRange(todayKey, appSettings.biweeklyStartDate);
  const lookbackDays = [90, 180, 365].includes(Math.round(number(rewardSettings.lookbackDays)))
    ? Math.round(number(rewardSettings.lookbackDays))
    : 180;
  const baselineStart = addDays(todayKey, -lookbackDays);
  const isVariableExpense = (transaction) => {
    if (transactionExpense(transaction) <= 0) return false;
    const category = byId.get(transaction.categoryId) || categories.find((row) => row.name === transaction.category);
    return !!category && category.kind === "expense" && category.budgetRhythm !== "fixed";
  };
  const spendByDate = new Map();
  for (const transaction of Array.isArray(budget?.transactions) ? budget.transactions : []) {
    if (!isVariableExpense(transaction)) continue;
    const epochMs = timestampOfTransaction(transaction);
    if (epochMs == null) continue;
    const key = dateKeyAt(epochMs);
    spendByDate.set(key, (spendByDate.get(key) || 0) + transactionExpense(transaction));
  }
  const dailyBaseline = rewardDailyBaseline(spendByDate, baselineStart, todayKey, rewardSettings.baselineMethod);
  if (dailyBaseline <= 0) return { state: "waiting", label: point.label };
  const daySaved = (key) => Math.max(0, dailyBaseline - number(spendByDate.get(key)));
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const earnedBetween = (startKey, endKey) => {
    let earned = 0;
    for (let key = startKey; key <= endKey; key = addDays(key, 1)) earned += Math.round(daySaved(key) * point.rate);
    return earned;
  };
  const selectedToday = selectedDailyReward.enabled !== false
    && selectedDailyReward.selectedDateKey === todayKey
    && selectedDailyReward.selectedRuleId === "focusPoint"
    && selectedDailyReward.focusBucketKey === point.id;
  const bonus = selectedToday
    ? Math.min(Math.round(daySaved(todayKey) * normalizePointRate(selectedDailyReward.bonusRate, 0.1)), Math.max(0, Math.round(number(selectedDailyReward.bonusCap, 5000))))
    : 0;
  const earnedMonth = earnedBetween(monthStart, todayKey) + bonus;
  const earnedTwoWeek = earnedBetween(cycle.startDate, todayKey) + bonus;
  const spentMonth = (Array.isArray(budget?.rewardPointEntries) ? budget.rewardPointEntries : []).reduce((total, entry) => {
    const usedAt = timestampOfTransaction({ occurredAt: entry?.usedAt });
    if (usedAt == null) return total;
    const key = dateKeyAt(usedAt);
    if (key < monthStart || key > todayKey || String(entry?.pointItemId || entry?.itemId || entry?.key || "") !== point.id) return total;
    return total + Math.max(0, Math.round(number(entry?.amount)));
  }, 0);
  return {
    state: "ready",
    label: point.label,
    balance: Math.round(earnedMonth - spentMonth),
    earnedTwoWeek: Math.round(earnedTwoWeek),
  };
}

function normalizePointItems(rewardSettings = {}) {
  const defaults = [
    { id: "winePurchase", label: "와인구매 포인트", rate: 0.3, enabled: true },
    { id: "premiumIngredients", label: "고급재료 포인트", rate: 0, enabled: true },
    { id: "travelFund", label: "여행충당 포인트", rate: 0, enabled: true },
  ];
  const source = Array.isArray(rewardSettings.pointItems) && rewardSettings.pointItems.length
    ? rewardSettings.pointItems
    : defaults;
  return source.map((item, index) => ({
    id: String(item?.id || defaults[index]?.id || "").trim(),
    label: String(item?.label || item?.name || defaults[index]?.label || "포인트").trim(),
    rate: normalizePointRate(item?.rate ?? rewardSettings?.pointRates?.[item?.id] ?? defaults[index]?.rate, 0),
    enabled: item?.enabled !== false && item?.enabled !== "false",
    order: number(item?.order, (index + 1) * 10),
  })).filter((item) => item.id).sort((left, right) => left.order - right.order);
}

function normalizePointRate(value, fallback) {
  const rate = number(value, fallback);
  return Math.max(0, Math.min(1, rate > 1 ? rate / 100 : rate));
}

function rewardDailyBaseline(spendByDate, startKey, endKey, method) {
  const keys = [];
  for (let key = startKey; key < endKey; key = addDays(key, 1)) keys.push(key);
  if (!keys.length) return 0;
  const total = sum(keys.map((key) => number(spendByDate.get(key))));
  if (method === "simple_daily") return total / keys.length;
  const weekly = [];
  for (let index = 0; index < keys.length; index += 7) {
    const slice = keys.slice(index, index + 7);
    const amount = sum(slice.map((key) => number(spendByDate.get(key))));
    if (amount > 0) weekly.push((amount / slice.length) * 7);
  }
  if (weekly.length < 4) return total / keys.length;
  const sorted = weekly.sort((left, right) => left - right);
  const trim = Math.floor(sorted.length * 0.1);
  return sum(sorted.slice(trim, sorted.length - trim)) / Math.max(1, sorted.length - trim * 2) / 7;
}

function wineDomain(budget, nowEpochMs) {
  const tastings = (budget.tastings || []).map((tasting) => ({
    ...tasting,
    epochMs: asEpochMs(tasting.tastedAt || tasting.createdAt),
  })).filter((tasting) => tasting.epochMs != null).sort((a, b) => b.epochMs - a.epochMs);
  const bottles = new Map((budget.bottles || []).map((bottle) => [bottle.id, bottle]));
  const rated = tastings.map((tasting) => number(tasting.taewooScore, NaN)).filter((score) => Number.isFinite(score) && score > 0 && score <= 5).slice(0, 5);
  const score = rated.length ? normalizeDomainScore(average(rated) * 20) : null;
  const latest = tastings[0] || null;
  const bottle = latest ? bottles.get(latest.bottleId) || {} : {};
  return {
    score,
    freshness: freshnessStatus(latest?.epochMs, nowEpochMs),
    updatedAtEpochMs: latest?.epochMs || null,
    ratedCount: rated.length,
    averageRating: rated.length ? round(average(rated), 1) : null,
    latest: latest ? {
      tastingId: latest.id || null,
      bottleId: latest.bottleId || null,
      tastedAtEpochMs: latest.epochMs,
      name: bottle.name || latest.wineName || "와인 기록",
      vintage: bottle.vintage || null,
      note: latest.taewooSummary || latest.note || "",
      rating: number(latest.taewooScore) || null,
      imageThumbnail: bottle.imageThumbnail || bottle.imageUrl || null,
    } : null,
  };
}

function combinedStreak(workouts, todayKey) {
  const days = dayByKey(workouts);
  let current = 0;
  for (let offset = 0; offset > -370; offset -= 1) {
    const day = days.get(addDays(todayKey, offset));
    if (!day) break;
    const food = mealTotals(day).calories > 0;
    const activity = strengthSessions(day).length > 0 || runningSessions(day).length > 0 || day.cf || day.swimming || day.stretching;
    if (!food && !activity) break;
    current += 1;
  }
  return current;
}

function activeSeasonBoard(settings = {}, activeSeason = null) {
  const seasonId = String(activeSeason?.id || "").trim();
  if (!seasonId) return null;
  const keyed = settings?.[`season_${seasonId}_test_board_v2`];
  if (keyed && typeof keyed === "object" && !Array.isArray(keyed)) {
    const keyedSeasonId = String(keyed.seasonId || "").trim();
    if (!keyedSeasonId) return { ...keyed, seasonId };
    if (keyedSeasonId === seasonId) return keyed;
  }
  const generic = settings?.test_board_v2;
  if (
    generic
    && typeof generic === "object"
    && !Array.isArray(generic)
    && String(generic.seasonId || "").trim() === seasonId
  ) return generic;
  return null;
}

function buildDashboardSnapshot({ tomato = {}, budget = {}, weights, revision = 1, nowEpochMs = Date.now() } = {}) {
  const normalizedWeights = normalizeDashboardWeights(weights || budget.dashboardSettings?.weights || DEFAULT_DASHBOARD_WEIGHTS);
  const todayKey = dateKeyAt(nowEpochMs);
  const registry = tomato.settings?.season_registry || {};
  const activeSeason = (registry.seasons || []).find((season) => season.startDate <= todayKey && season.endDate >= todayKey) || null;
  const workoutPlan = activeSeason ? tomato.settings?.[`season_${activeSeason.id}_workout_plan`] || {} : {};
  const runningPlan = activeSeason ? tomato.settings?.[`season_${activeSeason.id}_running_plan`] || {} : {};
  const seasonBoard = activeSeasonBoard(tomato.settings, activeSeason);
  const healthGoal = buildSeasonHealthGoals({ season: activeSeason, board: seasonBoard, todayKey });
  const domains = {
    food: foodDomain(tomato.workouts || [], tomato.settings?.diet_plan || {}, todayKey, nowEpochMs),
    health: healthDomain(tomato.workouts || [], workoutPlan, todayKey, nowEpochMs),
    running: runningDomain(tomato.workouts || [], runningPlan, todayKey, nowEpochMs),
    spending: spendingDomain(budget, nowEpochMs),
    wine: wineDomain(budget, nowEpochMs),
  };
  const points = rewardPointsDomain(budget, nowEpochMs);
  const overall = computeOverallScore(domains, normalizedWeights);
  const streakDays = combinedStreak(tomato.workouts || [], todayKey);
  const snapshot = {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    revision: Math.max(1, Math.round(number(revision, 1))),
    generatedAtEpochMs: Number(nowEpochMs),
    timezone: "Asia/Seoul",
    weights: normalizedWeights,
    score: overall.score,
    coverage: overall.coverage,
    streak: { days: streakDays, label: streakDays > 0 ? `${streakDays}일 연속 순항중` : "오늘부터 기록 시작" },
    domains,
    nutrition: {
      actualKcal: domains.food.actualKcal,
      targetKcal: domains.food.targetKcal,
      progress: domains.food.targetKcal > 0 ? Math.round((domains.food.actualKcal / domains.food.targetKcal) * 100) : null,
      proteinG: domains.food.proteinG,
      carbsG: domains.food.carbsG,
      fatG: domains.food.fatG,
    },
    healthGoal,
    workouts: healthGoal.items,
    running: {
      paceChangePct: domains.running.paceChangePct,
      cadenceChangePct: domains.running.cadenceChangePct,
      paceSecPerKm: domains.running.latestPaceSecPerKm,
      cadenceSpm: domains.running.latestCadenceSpm,
      weeklyDistanceKm: domains.running.weeklyDistanceKm,
      trend: domains.running.trend,
      records: domains.running.records,
    },
    spending: {
      samePeriodDifference: domains.spending.samePeriodDifference,
      samePeriodChangePct: domains.spending.samePeriodChangePct,
      previousSamePeriodSpent: domains.spending.previousSamePeriodSpent,
      monthSpent: domains.spending.monthSpent,
      comparisonDay: domains.spending.comparisonDay,
      currentCumulativeTrend: domains.spending.currentCumulativeTrend,
      previousCumulativeTrend: domains.spending.previousCumulativeTrend,
      twoWeek: domains.spending.twoWeek,
    },
    points,
    wine: domains.wine.latest,
  };
  const validation = validateDashboardSnapshot(snapshot);
  if (!validation.ok) throw new Error(`invalid dashboard snapshot: ${validation.errors.join(", ")}`);
  return snapshot;
}

module.exports = {
  addDays,
  activeSeasonBoard,
  buildDashboardSnapshot,
  calcDietMetrics,
  dateKeyAt,
  dietTargetFor,
  healthDomain,
  mealTotals,
  mondayOf,
  runningDomain,
  spendingDomain,
  wineDomain,
};
