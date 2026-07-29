import { calcBurnedKcal } from '../calc.js';
import { getDiet, getDietPlan } from '../data.js';
import { dateFromKey as _dateFromKey } from '../utils/date-key.js';
import { dateRange as _dateRange, keyFromDate as _keyFromDate } from './analysis-range.js';
import { dayKcal as _dayKcal, weightOnOrBefore as _weightOnOrBefore } from './day-aggregates.js';
import { maybeNumber as _maybeNum } from './format.js';

function _statsDietDayFromKey(cache, key) {
  const date = _dateFromKey(key);
  return date ? getDiet(date.getFullYear(), date.getMonth(), date.getDate()) : (cache[key] || {});
}

function _statsWorkoutDayFromKey(cache, key) {
  return cache[key] || {};
}

function _weekStartDateForStats(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function _weekBucketLabel(startKey, endKey) {
  const start = startKey.slice(5).replace('-', '/');
  const end = endKey.slice(5).replace('-', '/');
  return start === end ? start : `${start}~${end}`;
}

function _weeklyDateBuckets(keys) {
  const buckets = [];
  let bucket = null;
  keys.forEach(key => {
    const date = _dateFromKey(key);
    if (!date) return;
    const weekKey = _keyFromDate(_weekStartDateForStats(date));
    if (!bucket || bucket.weekKey !== weekKey) {
      bucket = { weekKey, keys: [] };
      buckets.push(bucket);
    }
    bucket.keys.push(key);
  });
  return buckets.map(item => {
    const startKey = item.keys[0];
    const endKey = item.keys[item.keys.length - 1];
    return { ...item, startKey, endKey, label: _weekBucketLabel(startKey, endKey) };
  });
}

export function _buildWeeklyKcalWeightSeries(range, cache, checkins) {
  const plan = getDietPlan();
  const checkinByDate = new Map(checkins.map(c => [c.date, c]));
  const buckets = _weeklyDateBuckets(_dateRange(range.fromKey, range.toKey));
  const labels = buckets.map(bucket => bucket.label);
  const intakeData = [];
  const burnedData = [];
  const weightData = [];

  buckets.forEach(bucket => {
    let intakeTotal = 0;
    let burnedTotal = 0;
    let hasIntake = false;
    let hasBurned = false;
    let weekWeight = null;

    bucket.keys.forEach(key => {
      const dietDay = _statsDietDayFromKey(cache, key);
      const workoutDay = _statsWorkoutDayFromKey(cache, key);
      const recordedWeight = _maybeNum(checkinByDate.get(key)?.weight);
      if (recordedWeight !== null) weekWeight = recordedWeight;
      const intake = _dayKcal(dietDay);
      if (intake > 0) {
        intakeTotal += intake;
        hasIntake = true;
      }
      const weightForBurn = _weightOnOrBefore(checkins, key) ?? _maybeNum(plan?.weight) ?? 70;
      const burned = calcBurnedKcal(workoutDay, weightForBurn).total;
      if (burned > 0) {
        burnedTotal += burned;
        hasBurned = true;
      }
    });

    weightData.push(weekWeight !== null ? weekWeight : null);
    intakeData.push(hasIntake ? Math.round(intakeTotal) : null);
    burnedData.push(hasBurned ? Math.round(burnedTotal) : null);
  });

  return { labels, buckets, intakeData, burnedData, weightData };
}
