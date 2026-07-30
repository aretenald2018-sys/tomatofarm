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

private fun heartZoneFor(bpm: Int): String =
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

/**
 * W5c split-vibration slice: a single buzz each time the run crosses a whole kilometre (service-
 * side — see WearExerciseService — so it fires with the screen off/ambient, not just when the UI
 * happens to be visible). Mirrors WearStrengthUiController's rest-timer vibrate() helper: prefers
 * [VibratorManager] on API 31+ with a legacy [Vibrator] fallback, and is wrapped defensively
 * end-to-end so a missing vibrator service or a thrown exception just silently skips the buzz.
 * No new manifest permission is needed — see AndroidManifest.xml/the plan notes: the existing
 * rest-timer vibration already relies on the platform granting VIBRATE without a manifest entry.
 */
internal object WearRunHaptics {
    private const val TAG = "WearRunHaptics"
    private const val SPLIT_VIBRATION_DURATION_MS = 400L

    fun vibrateSplit(context: Context) {
        vibrate(context, SPLIT_VIBRATION_DURATION_MS)
    }

    private fun vibrate(context: Context, durationMs: Long) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator == null || !vibrator.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(durationMs)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Wear run split vibration failed", e)
        }
    }
}
