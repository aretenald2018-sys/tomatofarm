package com.lifestreak.wear.workout

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import java.util.Locale
import kotlin.math.roundToInt

data class WearDistanceSample(
    val timestampMs: Long,
    val distanceKm: Double,
)

data class WearPaceTrendPoint(
    val timestampMs: Long,
    val secondsPerKm: Int,
)

data class WearHeartZoneRow(
    val zoneLabel: String,
    val durationMs: Long,
) {
    val durationText: String = formatDuration(durationMs)
}

data class WearProjectedRoutePoint(
    val x: Double,
    val y: Double,
)

data class WearRouteProjection(
    val points: List<WearProjectedRoutePoint> = emptyList(),
    val geoPoints: List<WearRoutePoint> = emptyList(),
) {
    val currentLocation: WearRoutePoint? = geoPoints.lastOrNull()
    val hasCurrentLocation: Boolean = currentLocation != null
    val isReady: Boolean = geoPoints.size >= 2
}

data class WearRunUiSnapshot(
    val screen: WearRunUiScreen,
    val durationMs: Long,
    val distanceKm: Double,
    val heartRateBpm: Int?,
    val paceTrend: List<WearPaceTrendPoint> = emptyList(),
    val heartRateTrend: List<HeartRateSample> = emptyList(),
    val routeProjection: WearRouteProjection = WearRouteProjection(),
    // W5c split-vibration/current-pace slice: rolling pace over the trailing window (see
    // currentPaceSecPerKm below), null while stationary or before enough samples exist.
    val currentPaceSecPerKm: Int? = null,
) {
    val durationText: String = formatDuration(durationMs)
    val distanceText: String = String.format(Locale.US, "%.2f", distanceKm)
    val distanceSummaryText: String = "$distanceText km"
    val paceText: String = formatPace(durationMs, distanceKm)
    val averagePaceText: String = paceText
    val fastestPaceText: String = paceTrend.minOfOrNull { it.secondsPerKm }?.let(::formatPaceSeconds) ?: "--"
    val currentPaceText: String = currentPaceSecPerKm?.let(::formatPaceSeconds) ?: "--"
    val heartRateText: String = heartRateBpm?.let { "$it bpm" } ?: "-- bpm"
    val averageHeartRateBpm: Int? = averageHeartRateBpm(heartRateTrend)
    val maxHeartRateBpm: Int? = heartRateTrend.maxOfOrNull { it.bpm }
    val heartZoneRows: List<WearHeartZoneRow> = heartRateTrend
        .takeIf { it.size >= 2 }
        ?.let(::buildHeartZoneRows)
        ?: emptyList()
}

internal fun validHeartRateSamples(samples: List<HeartRateSample>): List<HeartRateSample> {
    return samples
        .filter { it.timestampMs >= 0L && it.bpm in MIN_HEART_RATE_BPM..MAX_HEART_RATE_BPM }
        .sortedBy { it.timestampMs }
}

internal fun buildPaceTrend(samples: List<WearDistanceSample>): List<WearPaceTrendPoint> {
    val validSamples = samples
        .filter { it.timestampMs >= 0L && it.distanceKm.isFinite() && it.distanceKm >= 0.0 }
        .sortedBy { it.timestampMs }
    if (validSamples.size < 2) return emptyList()

    return validSamples
        .zipWithNext()
        .mapNotNull { (previous, next) ->
            val durationMs = next.timestampMs - previous.timestampMs
            val distanceDeltaKm = next.distanceKm - previous.distanceKm
            if (durationMs <= 0L || distanceDeltaKm <= 0.0) return@mapNotNull null
            val secondsPerKm = (durationMs / 1000.0 / distanceDeltaKm).roundToInt()
            if (secondsPerKm < MIN_VALID_SECONDS_PER_KM) return@mapNotNull null
            WearPaceTrendPoint(
                timestampMs = next.timestampMs,
                secondsPerKm = secondsPerKm,
            )
        }
}

/**
 * W5c current-pace slice: rolling pace over a trailing ~40s window of the same 10s-bucketed
 * distance samples [buildPaceTrend] consumes, rather than the whole-run average — this is what
 * other running apps show as "current pace". Pure and side-effect free, like [buildPaceTrend].
 *
 * - Newest-vs-oldest-within-window difference: takes the most recent sample and the oldest sample
 *   still inside [windowMs] of it, and derives pace from their time/distance delta.
 * - If the newest sample itself is older than [windowMs] relative to [nowMs] (e.g. the runner has
 *   stopped and no new confirmed-movement point has arrived), this returns null — "--" on screen —
 *   rather than reporting a stale pace.
 * - If the distance delta inside the window is negligible (below [MIN_CURRENT_PACE_DISTANCE_DELTA_KM]),
 *   this also returns null instead of an absurdly large number.
 * - Symmetrically, a pace faster than MIN_VALID_SECONDS_PER_KM (3:00/km) is a GPS artefact rather
 *   than a runner, so it also reads null instead of flashing an impossible number on the wrist.
 *   Same floor [buildPaceTrend] applies, deliberately.
 */
internal fun currentPaceSecPerKm(
    samples: List<WearDistanceSample>,
    nowMs: Long,
    windowMs: Long = CURRENT_PACE_WINDOW_MS,
): Int? {
    val validSamples = samples
        .filter { it.timestampMs >= 0L && it.distanceKm.isFinite() && it.distanceKm >= 0.0 }
        .sortedBy { it.timestampMs }
    if (validSamples.size < 2) return null

    val newest = validSamples.last()
    if (nowMs - newest.timestampMs > windowMs) return null

    val windowStartMs = newest.timestampMs - windowMs
    val windowSamples = validSamples.filter { it.timestampMs >= windowStartMs }
    if (windowSamples.size < 2) return null

    val oldest = windowSamples.first()
    val durationMs = newest.timestampMs - oldest.timestampMs
    val distanceDeltaKm = newest.distanceKm - oldest.distanceKm
    if (durationMs <= 0L || distanceDeltaKm < MIN_CURRENT_PACE_DISTANCE_DELTA_KM) return null

    val secondsPerKm = (durationMs / 1000.0 / distanceDeltaKm).roundToInt()
    if (secondsPerKm < MIN_VALID_SECONDS_PER_KM) return null
    return secondsPerKm
}

internal fun projectRoute(points: List<WearRoutePoint>): WearRouteProjection {
    val validPoints = points
        .filter(::isValidRoutePoint)
        .sortedBy { it.timestampMs }
    if (validPoints.size < 2) return WearRouteProjection(geoPoints = validPoints)

    val minLng = validPoints.minOf { it.lng }
    val maxLng = validPoints.maxOf { it.lng }
    val minLat = validPoints.minOf { it.lat }
    val maxLat = validPoints.maxOf { it.lat }
    val lngRange = maxLng - minLng
    val latRange = maxLat - minLat

    return WearRouteProjection(
        points = validPoints.map { point ->
            WearProjectedRoutePoint(
                x = normalized(point.lng, minLng, lngRange),
                y = 1.0 - normalized(point.lat, minLat, latRange),
            )
        },
        geoPoints = validPoints,
    )
}

internal fun formatDuration(durationMs: Long): String {
    val totalSeconds = (durationMs.coerceAtLeast(0L) / 1000L).toInt()
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
        String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.US, "%02d:%02d", minutes, seconds)
    }
}

private fun formatPace(durationMs: Long, distanceKm: Double): String {
    if (durationMs <= 0L || distanceKm <= 0.0 || !distanceKm.isFinite()) return "--"
    // Rounded (not truncated) to match the phone's Math.round-based pace display (W3
    // pace-consistency slice).
    val secondsPerKm = (durationMs / 1000.0 / distanceKm).roundToInt()
    return formatPaceSeconds(secondsPerKm)
}

private fun formatPaceSeconds(secondsPerKm: Int): String {
    val safeSeconds = secondsPerKm.coerceAtLeast(0)
    return String.format(Locale.US, "%d'%02d\"", safeSeconds / 60, safeSeconds % 60)
}

private fun averageHeartRateBpm(samples: List<HeartRateSample>): Int? {
    if (samples.isEmpty()) return null
    return samples.map { it.bpm }.average().roundToInt()
}

private fun buildHeartZoneRows(samples: List<HeartRateSample>): List<WearHeartZoneRow> {
    val durationsByZone = linkedMapOf(
        "5" to 0L,
        "4" to 0L,
        "3" to 0L,
        "2" to 0L,
        "1" to 0L,
    )
    samples.forEachIndexed { index, sample ->
        val zone = heartZoneFor(sample.bpm)
        durationsByZone[zone] = durationsByZone.getValue(zone) + heartZoneDurationMs(samples, index)
    }
    return durationsByZone.map { (zone, durationMs) ->
        WearHeartZoneRow(zoneLabel = zone, durationMs = durationMs)
    }
}

private fun heartZoneDurationMs(samples: List<HeartRateSample>, index: Int): Long {
    val current = samples[index]
    val measuredDurationMs = samples.getOrNull(index + 1)?.let { next ->
        next.timestampMs - current.timestampMs
    } ?: return 0L
    if (measuredDurationMs <= 0L) return 0L
    return measuredDurationMs.coerceAtMost(HEART_ZONE_MAX_SAMPLE_MS)
}

internal fun heartZoneFor(bpm: Int): String =
    when {
        bpm >= 180 -> "5"
        bpm >= 160 -> "4"
        bpm >= 140 -> "3"
        bpm >= 120 -> "2"
        else -> "1"
    }

private fun normalized(value: Double, min: Double, range: Double): Double {
    if (range <= 0.0 || !range.isFinite()) return 0.5
    return ((value - min) / range).coerceIn(0.0, 1.0)
}

private fun isValidRoutePoint(point: WearRoutePoint): Boolean =
    point.timestampMs >= 0L &&
        point.lat.isFinite() &&
        point.lng.isFinite() &&
        point.lat in -90.0..90.0 &&
        point.lng in -180.0..180.0

private const val MIN_VALID_SECONDS_PER_KM = 180
private const val MIN_HEART_RATE_BPM = 30
private const val MAX_HEART_RATE_BPM = 240
private const val HEART_ZONE_MAX_SAMPLE_MS = 60_000L
private const val CURRENT_PACE_WINDOW_MS = 40_000L
// Below this, treat the window's distance progress as GPS/route-filter noise rather than genuine
// movement (a confirmed running fix advances distance by well more than this over 40s).
private const val MIN_CURRENT_PACE_DISTANCE_DELTA_KM = 0.001

/** W5b heart-zone departure haptic: which way the runner just moved relative to their home zone. */
internal enum class WearHeartZoneAlertDirection {
    UP,
    DOWN,
}

/**
 * W5b heart-zone departure slice: pure, side-effect-free (no Android imports) so it is unit-
 * testable without a device — mirrors [buildPaceTrend]/[currentPaceSecPerKm] above. Consumes one
 * (bpm, nowMs) sample at a time and reuses [heartZoneFor] for zone classification (the same "1".."5"
 * labels [buildHeartZoneRows] uses).
 *
 * Behavior:
 * - A "home zone" is only established once a single zone has held for [ZONE_STABILITY_MS] (~60s) —
 *   this also re-applies whenever the runner settles into a *new* zone for that long, so a
 *   sustained effort-level change quietly becomes the new normal instead of alerting forever.
 * - Once a home zone exists, an alert fires only after the runner has been in a *different* zone
 *   continuously for [ZONE_DEPARTURE_ALERT_MS] (~20s) — a brief spike that returns to the home
 *   zone before that never alerts.
 * - A [ALERT_COOLDOWN_MS] (~60s) cooldown applies between alerts so a runner oscillating at a zone
 *   boundary doesn't get buzzed continuously.
 * - [WearHeartZoneAlertDirection.UP] vs [DOWN] is which way the new zone sits relative to home.
 *
 * Call [seedHomeZone] once after restoring a run (service relaunch mid-run) so the already-
 * established zone is trusted immediately instead of waiting out another [ZONE_STABILITY_MS] —
 * seeding itself never returns/fires an alert, so a relaunch can't cause an immediate buzz. Call
 * [reset] at the start of a fresh run.
 */
internal class WearHeartZoneAlertTracker {
    private var homeZone: String? = null

    // Reused for two purposes depending on whether homeZone is established yet: (1) while
    // bootstrapping the very first home zone, this tracks the current zone candidate and how long
    // it's held; (2) once a home zone exists, this tracks the zone the runner has departed to.
    private var trackedZone: String? = null
    private var trackedZoneSinceMs: Long? = null
    private var alertedForCurrentDeparture = false
    private var lastAlertAtMs: Long? = null

    fun onHeartRate(bpm: Int, nowMs: Long): WearHeartZoneAlertDirection? {
        val zone = heartZoneFor(bpm)
        val currentHome = homeZone

        if (currentHome == null) {
            trackCandidate(zone, nowMs)
            val since = trackedZoneSinceMs ?: nowMs
            if (nowMs - since >= ZONE_STABILITY_MS) {
                establishHomeZone(zone)
            }
            return null
        }

        if (zone == currentHome) {
            trackedZone = null
            trackedZoneSinceMs = null
            alertedForCurrentDeparture = false
            return null
        }

        trackCandidate(zone, nowMs)
        val departedSinceMs = trackedZoneSinceMs ?: return null
        val departureDurationMs = nowMs - departedSinceMs

        if (departureDurationMs >= ZONE_STABILITY_MS) {
            // Sustained long enough that this is simply the new normal now — quietly re-baseline
            // without another alert.
            establishHomeZone(zone)
            return null
        }

        if (alertedForCurrentDeparture || departureDurationMs < ZONE_DEPARTURE_ALERT_MS) return null

        val lastAlert = lastAlertAtMs
        if (lastAlert != null && nowMs - lastAlert < ALERT_COOLDOWN_MS) return null

        alertedForCurrentDeparture = true
        lastAlertAtMs = nowMs
        return if (zoneRank(zone) > zoneRank(currentHome)) {
            WearHeartZoneAlertDirection.UP
        } else {
            WearHeartZoneAlertDirection.DOWN
        }
    }

    /** Restore-time seed: trusts the already-established zone immediately, never itself alerts. */
    fun seedHomeZone(bpm: Int, nowMs: Long) {
        establishHomeZone(heartZoneFor(bpm), nowMs)
    }

    fun reset() {
        homeZone = null
        trackedZone = null
        trackedZoneSinceMs = null
        alertedForCurrentDeparture = false
        lastAlertAtMs = null
    }

    private fun trackCandidate(zone: String, nowMs: Long) {
        if (trackedZone != zone) {
            trackedZone = zone
            trackedZoneSinceMs = nowMs
        }
    }

    private fun establishHomeZone(zone: String, nowMs: Long? = null) {
        homeZone = zone
        trackedZone = null
        trackedZoneSinceMs = nowMs
        alertedForCurrentDeparture = false
    }

    private fun zoneRank(zone: String): Int = zone.toIntOrNull() ?: 0

    private companion object {
        const val ZONE_STABILITY_MS = 60_000L
        const val ZONE_DEPARTURE_ALERT_MS = 20_000L
        const val ALERT_COOLDOWN_MS = 60_000L
    }
}

/**
 * W5c split-vibration slice (extended by W5b's heart-zone departure alerts below): a single buzz
 * each time the run crosses a whole kilometre (service-side — see WearExerciseService — so it
 * fires with the screen off/ambient, not just when the UI happens to be visible). Mirrors
 * WearStrengthUiController's rest-timer vibrate() helper: prefers [VibratorManager] on API 31+
 * with a legacy [Vibrator] fallback, and is wrapped defensively end-to-end so a missing vibrator
 * service or a thrown exception just silently skips the buzz. `android.permission.VIBRATE` is
 * declared in the wear manifest (see AndroidManifest.xml) — without it every vibrate() call here
 * throws a SecurityException that this same try/catch would otherwise swallow silently.
 */
internal object WearRunHaptics {
    private const val TAG = "WearRunHaptics"
    private const val SPLIT_VIBRATION_DURATION_MS = 400L

    // W5b heart-zone departure alerts: UP is two short pulses, DOWN is one longer pulse, so the
    // two are distinguishable by feel alone (screen may be off/ambient).
    private val ZONE_UP_PATTERN_MS = longArrayOf(0L, 120L, 100L, 120L)
    private const val ZONE_DOWN_VIBRATION_DURATION_MS = 600L

    fun vibrateSplit(context: Context) {
        vibrate(context, SPLIT_VIBRATION_DURATION_MS)
    }

    fun vibrateZoneUp(context: Context) {
        vibratePattern(context, ZONE_UP_PATTERN_MS)
    }

    fun vibrateZoneDown(context: Context) {
        vibrate(context, ZONE_DOWN_VIBRATION_DURATION_MS)
    }

    private fun vibrate(context: Context, durationMs: Long) {
        withVibrator(context) { vibrator ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(durationMs)
            }
        }
    }

    /** [patternMs] alternates off/on durations starting with an off gap, per [VibrationEffect.createWaveform]. */
    private fun vibratePattern(context: Context, patternMs: LongArray) {
        withVibrator(context) { vibrator ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(patternMs, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(patternMs, -1)
            }
        }
    }

    private fun withVibrator(context: Context, action: (Vibrator) -> Unit) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator == null || !vibrator.hasVibrator()) return
            action(vibrator)
        } catch (e: Exception) {
            Log.w(TAG, "Wear run vibration failed", e)
        }
    }
}
