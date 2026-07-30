export function runningInputFromPhoneSummary(summary = {}, context = {}) {
  const durationSecTotal = Math.max(0, Math.floor(Number(summary.durationSec) || 0));
  return {
    distance: Math.max(0, Number(summary.distanceKm) || 0),
    durationMin: Math.floor(durationSecTotal / 60),
    durationSec: durationSecTotal % 60,
    memo: context.memo || '',
    source: context.source || 'gps',
    startedAt: summary.startedAt || null,
    endedAt: summary.endedAt || null,
    route: Array.isArray(context.route) ? context.route : [],
    routeRef: context.routeRef || null,
    routeSummary: summary,
    placeSummary: context.placeSummary || null,
    avgPaceSecPerKm: Number(summary.avgPaceSecPerKm) || 0,
    gpsAccuracySummary: summary.gpsAccuracySummary || null,
  };
}

export function runningInputFromWearPayload(payload = {}) {
  const durationSecTotal = Math.max(0, Math.floor(Number(payload.durationSec) || 0));
  // W3 pace-consistency slice: the watch's unrounded distanceMeters (top level, falling back to
  // the routeSummary's own copy) rides along on the normalized routeSummary so downstream day
  // rollups (sessions.js) can compute pace from a precise denominator instead of the 2dp distance.
  const distanceMeters = Number.isFinite(Number(payload.distanceMeters)) && Number(payload.distanceMeters) >= 0
    ? Number(payload.distanceMeters)
    : (Number(payload.routeSummary?.distanceMeters) || undefined);
  return {
    distance: Math.max(0, Number(payload.distanceKm) || 0),
    durationMin: Math.floor(durationSecTotal / 60),
    durationSec: durationSecTotal % 60,
    memo: '',
    source: 'wear',
    startedAt: payload.startedAt || null,
    endedAt: payload.endedAt || null,
    route: Array.isArray(payload.route) ? payload.route : [],
    routeRef: payload.routeRef || null,
    routeSummary: {
      ...(payload.routeSummary || {}),
      ...(distanceMeters != null ? { distanceMeters } : {}),
      heartRateSamples10s: Array.isArray(payload.samples10s) ? payload.samples10s : [],
    },
    placeSummary: { status: 'unavailable', label: '워치 기록', provider: 'wear' },
    avgPaceSecPerKm: Number(payload.avgPaceSecPerKm) || 0,
    gpsAccuracySummary: payload.gpsAccuracySummary || null,
  };
}
