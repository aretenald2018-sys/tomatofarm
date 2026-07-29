import { toFiniteNumber as _num } from '../utils/number.js';
import { getWorkoutSessions } from './sessions.js';
import { hasRunningSessionRecord } from './running-model.js';
import {
  buildRunningRouteModel,
  isExplicitRunningRouteGap,
  runningDistanceMeters,
} from './running-route-policy.js';

const KM_IN_METERS = 1000;

function _round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(_num(value) * power) / power;
}

function _positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function _durationSeconds(options = {}) {
  const explicit = _positive(options.durationSec);
  if (explicit != null) return Math.floor(explicit);
  const startedAt = _num(options.startedAt);
  const endedAt = _num(options.endedAt, startedAt);
  const pausedMs = Math.max(0, _num(options.pausedMs));
  return Math.max(0, Math.floor((endedAt - startedAt - pausedMs) / 1000));
}

function _elapsedSeconds(options = {}, activeDurationSec = 0) {
  const startedAt = _num(options.startedAt);
  const endedAt = _num(options.endedAt, startedAt);
  if (endedAt > 0 && endedAt >= startedAt) return Math.floor((endedAt - startedAt) / 1000);
  return activeDurationSec;
}

function _distanceMeters(points = []) {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (isExplicitRunningRouteGap(previous, point)) continue;
    meters += runningDistanceMeters(previous, point);
  }
  return meters;
}

function _elevationMetrics(points = []) {
  let gain = 0;
  let loss = 0;
  let pairCount = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (isExplicitRunningRouteGap(previous, point)) continue;
    const before = Number(previous?.altitude);
    const after = Number(point?.altitude);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    pairCount += 1;
    const delta = after - before;
    if (delta > 0) gain += delta;
    if (delta < 0) loss += Math.abs(delta);
  }
  return pairCount ? {
    elevationGainM: Math.round(gain),
    elevationLossM: Math.round(loss),
  } : {
    elevationGainM: null,
    elevationLossM: null,
  };
}

function _metricValues(points = [], key) {
  return points
    .map(point => _positive(point?.[key]))
    .filter(value => value != null);
}

function _metricSummary(values = []) {
  if (!values.length) return { average: null, maximum: null, count: 0 };
  return {
    average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
    maximum: Math.round(Math.max(...values)),
    count: values.length,
  };
}

function _heartRateValues(route = [], samples = []) {
  const sampleValues = (Array.isArray(samples) ? samples : [])
    .map(sample => _positive(sample?.bpm ?? sample?.heartRateBpm))
    .filter(value => value != null);
  return sampleValues.length ? sampleValues : _metricValues(route, 'heartRateBpm');
}

export const RUNNING_CALORIE_METHOD = 'acsm-speed-grade-v1';

export function isValidRunningWeightKg(value) {
  const weight = _num(value, NaN);
  return Number.isFinite(weight) && weight >= 25 && weight <= 300;
}

// ACSM 대사 방정식: 달리기/걷기의 속도(m/min), 경사, 실제 체중으로 VO₂를 추정한다.
// 심박은 개인의 안정시·최대심박·성별 보정 없이는 오차를 키울 수 있어 여기서는 보정값으로 쓰지 않는다.
export function estimateRunningCalories({ distanceKm = 0, durationSec = 0, weightKg, elevationGainM = 0 } = {}) {
  const distanceM = Math.max(0, _num(distanceKm) * KM_IN_METERS);
  const duration = Math.max(0, _num(durationSec));
  if (distanceM <= 0 || duration <= 0 || !isValidRunningWeightKg(weightKg)) return null;

  const weight = _num(weightKg);
  const speedMPerMin = (distanceM / duration) * 60;
  // GPS 고도 노이즈가 칼로리를 과대 산출하지 않도록 실효 경사는 15%까지만 반영한다.
  const grade = Math.min(.15, Math.max(0, _num(elevationGainM) / distanceM));
  const oxygenMlPerKgPerMin = speedMPerMin < 134
    ? 3.5 + (.1 * speedMPerMin) + (1.8 * speedMPerMin * grade)
    : 3.5 + (.2 * speedMPerMin) + (.9 * speedMPerMin * grade);
  const calories = (oxygenMlPerKgPerMin * weight / 1000) * 5 * (duration / 60);
  return Number.isFinite(calories) && calories > 0 ? Math.round(calories) : null;
}

export function isTrustedRunningCalories(summary = {}) {
  const calories = _positive(summary?.calories);
  if (calories == null) return false;
  const source = String(summary?.calorieSource || '').trim();
  if (['wear', 'device', 'health-connect'].includes(source)) return true;
  return source === 'estimated'
    && summary?.calorieMethod === RUNNING_CALORIE_METHOD
    && isValidRunningWeightKg(summary?.calorieWeightKg);
}

function _splitHeartRateMetrics(splits = [], samples = [], route = []) {
  const source = Array.isArray(samples) && samples.length
    ? samples.map(sample => ({ ts: _num(sample?.timestampMs ?? sample?.ts), bpm: _positive(sample?.bpm ?? sample?.heartRateBpm) }))
    : route.map(point => ({ ts: _num(point?.ts), bpm: _positive(point?.heartRateBpm) }));
  const usable = source.filter(sample => sample.ts > 0 && sample.bpm != null);
  if (!usable.length) return splits;
  return splits.map(split => {
    const startAt = _num(split.startedAt);
    const endAt = _num(split.endedAt, startAt);
    const values = usable
      .filter(sample => sample.ts >= startAt && sample.ts <= endAt)
      .map(sample => sample.bpm);
    if (!values.length) return split;
    return {
      ...split,
      avgHeartRateBpm: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      maxHeartRateBpm: Math.round(Math.max(...values)),
    };
  });
}

function _splitRunningRoute(points = [], totalDistanceM = 0, activeDurationSec = 0) {
  if (points.length < 2 || totalDistanceM <= 0 || activeDurationSec <= 0) return [];
  const measuredDistanceM = _distanceMeters(points);
  if (measuredDistanceM <= 0) return [];
  const distanceScale = totalDistanceM / measuredDistanceM;
  const edges = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (isExplicitRunningRouteGap(previous, point)) continue;
    const rawDistanceM = runningDistanceMeters(previous, point);
    const elapsedMs = Math.max(0, _num(point?.ts) - _num(previous?.ts));
    if (rawDistanceM <= 0 || elapsedMs <= 0) continue;
    edges.push({ previous, point, distanceM: rawDistanceM * distanceScale, elapsedMs });
  }
  const observedElapsedMs = edges.reduce((sum, edge) => sum + edge.elapsedMs, 0);
  if (!edges.length || observedElapsedMs <= 0) return [];
  const timeScale = (activeDurationSec * 1000) / observedElapsedMs;
  const splits = [];
  let splitIndex = 1;
  let current = {
    index: splitIndex,
    distanceM: 0,
    durationMs: 0,
    elevationGainM: 0,
    elevationLossM: 0,
    startedAt: _num(edges[0].previous?.ts),
    endedAt: _num(edges[0].previous?.ts),
  };

  for (const edge of edges) {
    let edgeDistanceM = edge.distanceM;
    let edgeProgress = 0;
    while (edgeDistanceM > 0.0001) {
      const neededM = KM_IN_METERS - current.distanceM;
      const usedM = Math.min(neededM, edgeDistanceM);
      const fraction = usedM / edge.distanceM;
      const startRatio = edgeProgress;
      const endRatio = edgeProgress + fraction;
      const fragmentMs = edge.elapsedMs * fraction * timeScale;
      const previousAltitude = Number(edge.previous?.altitude);
      const nextAltitude = Number(edge.point?.altitude);
      if (Number.isFinite(previousAltitude) && Number.isFinite(nextAltitude)) {
        const altitudeDelta = (nextAltitude - previousAltitude) * (endRatio - startRatio);
        if (altitudeDelta > 0) current.elevationGainM += altitudeDelta;
        if (altitudeDelta < 0) current.elevationLossM += Math.abs(altitudeDelta);
      }
      current.distanceM += usedM;
      current.durationMs += fragmentMs;
      current.endedAt = Math.round(_num(edge.previous?.ts) + (edge.elapsedMs * endRatio));
      edgeDistanceM -= usedM;
      edgeProgress = endRatio;
      if (current.distanceM >= KM_IN_METERS - 0.01) {
        const distanceKm = current.distanceM / KM_IN_METERS;
        const durationSec = Math.round(current.durationMs / 1000);
        splits.push({
          index: splitIndex,
          distanceKm: _round(distanceKm, 2),
          durationSec,
          paceSecPerKm: distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0,
          elevationGainM: Math.round(current.elevationGainM),
          elevationLossM: Math.round(current.elevationLossM),
          startedAt: current.startedAt,
          endedAt: current.endedAt,
        });
        splitIndex += 1;
        current = {
          index: splitIndex,
          distanceM: 0,
          durationMs: 0,
          elevationGainM: 0,
          elevationLossM: 0,
          startedAt: current.endedAt,
          endedAt: current.endedAt,
        };
      }
    }
  }
  if (current.distanceM >= 5) {
    const distanceKm = current.distanceM / KM_IN_METERS;
    const durationSec = Math.round(current.durationMs / 1000);
    splits.push({
      index: splitIndex,
      distanceKm: _round(distanceKm, 2),
      durationSec,
      paceSecPerKm: distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0,
      elevationGainM: Math.round(current.elevationGainM),
      elevationLossM: Math.round(current.elevationLossM),
      startedAt: current.startedAt,
      endedAt: current.endedAt,
    });
  }
  return splits;
}

export function buildRunningActivityAnalytics(points = [], options = {}) {
  const model = buildRunningRouteModel(points);
  const route = model.rawRoute;
  const movementRoute = model.movementRoute;
  const startedAt = _num(options.startedAt, route[0]?.ts || 0);
  const endedAt = _num(options.endedAt, route.at(-1)?.ts || startedAt);
  const pausedMs = Math.max(0, _num(options.pausedMs));
  const durationSec = _durationSeconds({ ...options, startedAt, endedAt, pausedMs });
  const elapsedDurationSec = _elapsedSeconds({ ...options, startedAt, endedAt }, durationSec);
  const measuredDistanceM = _distanceMeters(movementRoute);
  const requestedDistanceM = _positive(options.distanceM)
    ?? ((_positive(options.distanceKm) || 0) * KM_IN_METERS);
  const distanceM = requestedDistanceM || measuredDistanceM;
  const preciseDistanceKm = distanceM / KM_IN_METERS;
  const distanceKm = _round(preciseDistanceKm, 2);
  const avgPaceSecPerKm = preciseDistanceKm > 0 && durationSec > 0
    ? Math.round(durationSec / preciseDistanceKm)
    : 0;
  const speedKmh = preciseDistanceKm > 0 && durationSec > 0
    ? _round(preciseDistanceKm / (durationSec / 3600), 2)
    : 0;
  const elevation = _elevationMetrics(movementRoute);
  const fallbackElevation = elevation.elevationGainM == null ? _elevationMetrics(route) : elevation;
  const heart = _metricSummary(_heartRateValues(route, options.heartRateSamples));
  const cadence = _metricSummary(_metricValues(route, 'cadenceSpm'));
  const splits = _splitHeartRateMetrics(
    _splitRunningRoute(movementRoute, distanceM, durationSec),
    options.heartRateSamples,
    route,
  );
  const fullKilometerSplits = splits.filter(split => split.distanceKm >= 0.95 && split.paceSecPerKm > 0);
  const bestPaceSecPerKm = fullKilometerSplits.length
    ? Math.min(...fullKilometerSplits.map(split => split.paceSecPerKm))
    : avgPaceSecPerKm;
  const requestedCalories = _positive(options.calories);
  const calorieWeightKg = isValidRunningWeightKg(options.weightKg) ? _round(options.weightKg, 1) : null;
  const estimatedCalories = estimateRunningCalories({
    distanceKm: preciseDistanceKm,
    durationSec,
    weightKg: calorieWeightKg,
    elevationGainM: fallbackElevation.elevationGainM,
  });
  const calories = requestedCalories != null ? Math.round(requestedCalories) : estimatedCalories;
  const bbox = route.length ? {
    minLat: _round(Math.min(...route.map(point => point.lat)), 6),
    minLng: _round(Math.min(...route.map(point => point.lng)), 6),
    maxLat: _round(Math.max(...route.map(point => point.lat)), 6),
    maxLng: _round(Math.max(...route.map(point => point.lng)), 6),
  } : null;
  const centroid = route.length ? {
    lat: _round(route.reduce((sum, point) => sum + point.lat, 0) / route.length, 6),
    lng: _round(route.reduce((sum, point) => sum + point.lng, 0) / route.length, 6),
  } : null;
  const accuracy = _metricValues(route, 'accuracy');
  const gaps = route.reduce((count, point, index) => (
    index > 0 && isExplicitRunningRouteGap(route[index - 1], point) ? count + 1 : count
  ), 0);

  return {
    analyticsVersion: 1,
    source: options.source || 'gps',
    startedAt: startedAt || null,
    endedAt: endedAt || null,
    pausedMs,
    durationSec,
    elapsedDurationSec,
    distanceM: _round(distanceM, 2),
    distanceKm,
    avgPaceSecPerKm,
    bestPaceSecPerKm,
    speedKmh,
    pointCount: route.length,
    segmentCount: route.length ? gaps + 1 : 0,
    gapCount: gaps,
    interrupted: gaps > 0,
    bbox,
    centroid,
    elevationGainM: fallbackElevation.elevationGainM,
    elevationLossM: fallbackElevation.elevationLossM,
    calories: calories || null,
    calorieSource: requestedCalories != null ? (options.calorieSource || 'device') : (estimatedCalories ? 'estimated' : null),
    calorieMethod: estimatedCalories ? RUNNING_CALORIE_METHOD : null,
    calorieWeightKg: estimatedCalories ? calorieWeightKg : null,
    avgHeartRateBpm: _positive(options.avgHeartRateBpm) ? Math.round(options.avgHeartRateBpm) : heart.average,
    maxHeartRateBpm: _positive(options.maxHeartRateBpm) ? Math.round(options.maxHeartRateBpm) : heart.maximum,
    heartRateSampleCount: heart.count,
    cadenceSpm: cadence.average,
    maxCadenceSpm: cadence.maximum,
    gpsAccuracySummary: accuracy.length ? {
      avgAccuracyM: Math.round(accuracy.reduce((sum, value) => sum + value, 0) / accuracy.length),
      bestAccuracyM: Math.round(Math.min(...accuracy)),
      worstAccuracyM: Math.round(Math.max(...accuracy)),
    } : null,
    splits,
  };
}

function _sessionDurationSec(session = {}) {
  return Math.max(0, Math.floor((_num(session.runDurationMin) * 60) + _num(session.runDurationSec)));
}

export function listRunningActivities(entries = []) {
  const activities = [];
  for (const [dateKey, day] of Array.isArray(entries) ? entries : []) {
    const sessions = getWorkoutSessions(day || {});
    sessions.forEach((session, sessionIndex) => {
      if (!hasRunningSessionRecord(session)) return;
      const summary = session?.runRouteSummary && typeof session.runRouteSummary === 'object'
        ? session.runRouteSummary
        : {};
      const hasTrustedCalories = isTrustedRunningCalories(summary);
      const durationSec = _sessionDurationSec(session) || Math.max(0, Math.floor(_num(summary.durationSec)));
      const distanceKm = _positive(session.runDistance) ?? _positive(summary.distanceKm) ?? 0;
      if (durationSec <= 0 && distanceKm <= 0) return;
      const avgPaceSecPerKm = _positive(session.runAvgPaceSecPerKm)
        ?? _positive(summary.avgPaceSecPerKm)
        ?? (distanceKm > 0 && durationSec > 0 ? Math.round(durationSec / distanceKm) : 0);
      activities.push({
        dateKey: String(dateKey || ''),
        sessionIndex,
        id: String(session?.id || `${dateKey}-${sessionIndex}`),
        startedAt: _num(session?.runStartedAt ?? summary.startedAt) || null,
        endedAt: _num(session?.runEndedAt ?? summary.endedAt) || null,
        distanceKm,
        durationSec,
        elapsedDurationSec: Math.max(0, Math.floor(_num(summary.elapsedDurationSec, durationSec))),
        avgPaceSecPerKm,
        bestPaceSecPerKm: _positive(summary.bestPaceSecPerKm) ?? avgPaceSecPerKm,
        calories: hasTrustedCalories ? _positive(summary.calories) : null,
        calorieSource: hasTrustedCalories ? summary.calorieSource : null,
        calorieMethod: hasTrustedCalories ? summary.calorieMethod || null : null,
        calorieWeightKg: hasTrustedCalories ? _positive(summary.calorieWeightKg) : null,
        elevationGainM: _positive(summary.elevationGainM) ?? 0,
        elevationLossM: _positive(summary.elevationLossM) ?? 0,
        avgHeartRateBpm: _positive(summary.avgHeartRateBpm),
        maxHeartRateBpm: _positive(summary.maxHeartRateBpm),
        cadenceSpm: _positive(summary.cadenceSpm),
        splits: Array.isArray(summary.splits) ? summary.splits.map(split => ({ ...split })) : [],
        route: Array.isArray(session?.runRoute) ? session.runRoute : [],
        source: session?.runSource || summary.source || 'manual',
      });
    });
  }
  return activities.sort((a, b) => (
    a.dateKey.localeCompare(b.dateKey)
    || _num(a.startedAt) - _num(b.startedAt)
    || a.sessionIndex - b.sessionIndex
  ));
}

export function summarizeRunningActivities(activities = []) {
  const records = Array.isArray(activities) ? activities : [];
  const distanceKm = records.reduce((sum, record) => sum + _num(record.distanceKm), 0);
  const durationSec = records.reduce((sum, record) => sum + _num(record.durationSec), 0);
  const elapsedDurationSec = records.reduce((sum, record) => sum + _num(record.elapsedDurationSec, record.durationSec), 0);
  const calories = records.reduce((sum, record) => sum + _num(record.calories), 0);
  const elevationGainM = records.reduce((sum, record) => sum + _num(record.elevationGainM), 0);
  const elevationLossM = records.reduce((sum, record) => sum + _num(record.elevationLossM), 0);
  const weightedHeartSamples = records.filter(record => _positive(record.avgHeartRateBpm) != null);
  const avgHeartRateBpm = weightedHeartSamples.length
    ? Math.round(weightedHeartSamples.reduce((sum, record) => sum + (_num(record.avgHeartRateBpm) * Math.max(1, _num(record.durationSec))), 0)
      / weightedHeartSamples.reduce((sum, record) => sum + Math.max(1, _num(record.durationSec)), 0))
    : null;
  const maxHeartRateValues = records.map(record => _positive(record.maxHeartRateBpm)).filter(value => value != null);
  const bestPaceValues = records.map(record => _positive(record.bestPaceSecPerKm)).filter(value => value != null);
  return {
    activityCount: records.length,
    activeDays: new Set(records.map(record => record.dateKey).filter(Boolean)).size,
    distanceKm: _round(distanceKm, 2),
    durationSec: Math.round(durationSec),
    elapsedDurationSec: Math.round(elapsedDurationSec),
    avgPaceSecPerKm: distanceKm > 0 && durationSec > 0 ? Math.round(durationSec / distanceKm) : 0,
    bestPaceSecPerKm: bestPaceValues.length ? Math.min(...bestPaceValues) : 0,
    calories: Math.round(calories),
    elevationGainM: Math.round(elevationGainM),
    elevationLossM: Math.round(elevationLossM),
    avgHeartRateBpm,
    maxHeartRateBpm: maxHeartRateValues.length ? Math.round(Math.max(...maxHeartRateValues)) : null,
    records,
  };
}
