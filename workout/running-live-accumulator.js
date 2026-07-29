import { toFiniteNumber as _num } from '../utils/number.js';
import {
  RUNNING_ROUTE_POLICY,
  isConfidentRunningMovement,
  isExplicitRunningRouteGap,
  runningDistanceMeters,
} from './running-route-policy.js';
import {
  buildRunningActivityAnalytics,
  estimateRunningCalories,
  isValidRunningWeightKg,
  RUNNING_CALORIE_METHOD,
} from './running-analytics.js';

function _round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(_num(value) * power) / power;
}

function _positiveMetric(state, key, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return;
  state[`${key}Sum`] += number;
  state[`${key}Count`] += 1;
  state[`max${key[0].toUpperCase()}${key.slice(1)}`] = Math.max(
    state[`max${key[0].toUpperCase()}${key.slice(1)}`] || 0,
    number,
  );
}

function _elevationPair(state, prefix, previous, point) {
  if (!previous || !point || isExplicitRunningRouteGap(previous, point)) return;
  const before = Number(previous.altitude);
  const after = Number(point.altitude);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return;
  state[`${prefix}ElevationPairs`] += 1;
  if (after > before) state[`${prefix}ElevationGain`] += after - before;
  if (after < before) state[`${prefix}ElevationLoss`] += before - after;
}

function _freshState() {
  return {
    pointCount: 0,
    gapCount: 0,
    segmentCount: 0,
    latSum: 0,
    lngSum: 0,
    minLat: Infinity,
    minLng: Infinity,
    maxLat: -Infinity,
    maxLng: -Infinity,
    accuracySum: 0,
    accuracyCount: 0,
    bestAccuracy: Infinity,
    worstAccuracy: -Infinity,
    heartRateBpmSum: 0,
    heartRateBpmCount: 0,
    maxHeartRateBpm: 0,
    cadenceSpmSum: 0,
    cadenceSpmCount: 0,
    maxCadenceSpm: 0,
    rawElevationGain: 0,
    rawElevationLoss: 0,
    rawElevationPairs: 0,
    movementElevationGain: 0,
    movementElevationLoss: 0,
    movementElevationPairs: 0,
    distanceM: 0,
    previousRaw: null,
    movementAnchor: null,
    points: [],
  };
}

export class RunningLiveAccumulator {
  constructor(policy = RUNNING_ROUTE_POLICY) {
    this.policy = policy;
    this.reset();
  }

  reset() {
    this.state = _freshState();
    return this;
  }

  rebuild(points = []) {
    this.reset();
    for (const point of Array.isArray(points) ? points : []) this.append(point);
    return this;
  }

  append(point) {
    if (!point || typeof point !== 'object') return false;
    const state = this.state;
    const previousRaw = state.previousRaw;
    const gap = !!previousRaw && isExplicitRunningRouteGap(previousRaw, point);
    state.pointCount += 1;
    state.points.push(point);
    if (state.pointCount === 1) state.segmentCount = 1;
    if (gap) {
      state.gapCount += 1;
      state.segmentCount += 1;
    }

    state.latSum += Number(point.lat);
    state.lngSum += Number(point.lng);
    state.minLat = Math.min(state.minLat, Number(point.lat));
    state.minLng = Math.min(state.minLng, Number(point.lng));
    state.maxLat = Math.max(state.maxLat, Number(point.lat));
    state.maxLng = Math.max(state.maxLng, Number(point.lng));

    const accuracy = Number(point.accuracy);
    if (Number.isFinite(accuracy)) {
      state.accuracySum += accuracy;
      state.accuracyCount += 1;
      state.bestAccuracy = Math.min(state.bestAccuracy, accuracy);
      state.worstAccuracy = Math.max(state.worstAccuracy, accuracy);
    }
    _positiveMetric(state, 'heartRateBpm', point.heartRateBpm);
    _positiveMetric(state, 'cadenceSpm', point.cadenceSpm);
    _elevationPair(state, 'raw', previousRaw, point);

    if (!(Number.isFinite(accuracy) && accuracy > this.policy.maxDistanceAccuracyM)) {
      const anchor = state.movementAnchor;
      if (!anchor || isExplicitRunningRouteGap(anchor, point)) {
        state.movementAnchor = point;
      } else if (isConfidentRunningMovement(anchor, point, this.policy)) {
        state.distanceM += runningDistanceMeters(anchor, point);
        _elevationPair(state, 'movement', anchor, point);
        state.movementAnchor = point;
      }
    }

    state.previousRaw = point;
    return true;
  }

  summary(options = {}) {
    const state = this.state;
    const startedAt = _num(options.startedAt, state.previousRaw?.ts || Date.now());
    const endedAt = _num(options.endedAt, state.previousRaw?.ts || startedAt);
    const pausedMs = Math.max(0, _num(options.pausedMs));
    const durationSec = Math.max(0, Math.floor((endedAt - startedAt - pausedMs) / 1000));
    const distanceM = Math.max(0, _num(options.distanceM, state.distanceM));
    const preciseDistanceKm = distanceM / 1000;
    const distanceKm = _round(preciseDistanceKm, 2);
    const avgPaceSecPerKm = preciseDistanceKm > 0 && durationSec > 0
      ? Math.round(durationSec / preciseDistanceKm)
      : 0;
    const speedKmh = preciseDistanceKm > 0 && durationSec > 0
      ? _round(preciseDistanceKm / (durationSec / 3600), 2)
      : 0;
    const bbox = state.pointCount ? {
      minLat: _round(state.minLat, 6),
      minLng: _round(state.minLng, 6),
      maxLat: _round(state.maxLat, 6),
      maxLng: _round(state.maxLng, 6),
    } : null;
    const centroid = state.pointCount ? {
      lat: _round(state.latSum / state.pointCount, 6),
      lng: _round(state.lngSum / state.pointCount, 6),
    } : null;
    const elevationPairs = state.movementElevationPairs || state.rawElevationPairs;
    const elevationGain = state.movementElevationPairs
      ? state.movementElevationGain
      : state.rawElevationGain;
    const elevationLoss = state.movementElevationPairs
      ? state.movementElevationLoss
      : state.rawElevationLoss;
    const elevationGainM = elevationPairs ? Math.round(elevationGain) : null;
    const calorieWeightKg = isValidRunningWeightKg(options.weightKg) ? _round(options.weightKg, 1) : null;
    const calories = estimateRunningCalories({
      distanceKm: preciseDistanceKm,
      durationSec,
      weightKg: calorieWeightKg,
      elevationGainM,
    });

    const base = {
      source: 'gps',
      startedAt,
      endedAt,
      pausedMs,
      pointCount: state.pointCount,
      segmentCount: state.segmentCount,
      gapCount: state.gapCount,
      interrupted: state.gapCount > 0,
      durationSec,
      elapsedDurationSec: Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
      distanceM: _round(distanceM, 2),
      distanceKm,
      avgPaceSecPerKm,
      speedKmh,
      bbox,
      centroid,
      elevationGainM,
      elevationLossM: elevationPairs ? Math.round(elevationLoss) : null,
      calories: calories || null,
      calorieSource: calories ? 'estimated' : null,
      calorieMethod: calories ? RUNNING_CALORIE_METHOD : null,
      calorieWeightKg: calories ? calorieWeightKg : null,
      avgHeartRateBpm: state.heartRateBpmCount
        ? Math.round(state.heartRateBpmSum / state.heartRateBpmCount)
        : null,
      maxHeartRateBpm: state.maxHeartRateBpm || null,
      cadenceSpm: state.cadenceSpmCount
        ? Math.round(state.cadenceSpmSum / state.cadenceSpmCount)
        : null,
      maxCadenceSpm: state.maxCadenceSpm || null,
      gpsAccuracySummary: state.accuracyCount ? {
        avgAccuracyM: Math.round(state.accuracySum / state.accuracyCount),
        bestAccuracyM: Math.round(state.bestAccuracy),
        worstAccuracyM: Math.round(state.worstAccuracy),
      } : null,
    };
    if (options.includeAnalytics === false) return base;
    return buildRunningActivityAnalytics(state.points, {
      ...options,
      source: options.source || 'gps',
      startedAt,
      endedAt,
      pausedMs,
      durationSec,
      distanceM,
    });
  }
}
