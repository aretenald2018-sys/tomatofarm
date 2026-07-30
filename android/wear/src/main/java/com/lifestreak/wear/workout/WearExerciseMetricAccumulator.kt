package com.lifestreak.wear.workout

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class WearExerciseMetricsSnapshot(
    val startedAtWallClockMs: Long,
    val distanceMeters: Double,
    val latestHeartRateBpm: Int?,
    val activeDurationMs: Long,
    val distanceSamples: List<WearDistanceSample>,
    val heartRateSamples: List<HeartRateSample>,
    val routePoints: List<WearRoutePoint>,
    val healthDistanceMeters: Double? = null,
) {
    val distanceKm: Double = distanceMeters / 1_000.0
}

class WearExerciseMetricAccumulator(
    private val startedAtWallClockMs: Long,
    private val startedAtElapsedRealtimeMs: Long,
) {
    private var latestHeartRateBpm: Int? = null
    private var activeDurationMs = 0L
    private val heartRateSamplesByBucket = linkedMapOf<Long, HeartRateSample>()
    private val routePoints = linkedSetOf<WearRoutePoint>()
    private var pendingRouteGapReason: String? = null
    // W3 pace-consistency slice: Health Services' own cumulative distance, when the platform
    // supplies it. Monotonic (only ever moves up) like activeDurationMs above, and takes
    // precedence over the filtered route distance in snapshot() below.
    private var healthDistanceMeters: Double? = null

    fun markRouteGap(reason: String = "interruption") {
        if (routePoints.isNotEmpty()) pendingRouteGapReason = reason.take(48)
    }

    fun applyMetricUpdate(
        elapsedRealtimeMs: Long,
        heartRateBpm: Int? = null,
        activeDurationMs: Long? = null,
        routePoint: WearRoutePoint? = null,
        healthDistanceMeters: Double? = null,
    ) {
        if (activeDurationMs != null && activeDurationMs >= 0L) {
            this.activeDurationMs = maxOf(this.activeDurationMs, activeDurationMs)
        }
        if (healthDistanceMeters != null && healthDistanceMeters.isFinite() && healthDistanceMeters >= 0.0) {
            this.healthDistanceMeters = maxOf(this.healthDistanceMeters ?: 0.0, healthDistanceMeters)
        }
        if (heartRateBpm != null && heartRateBpm in MIN_HEART_RATE_BPM..MAX_HEART_RATE_BPM) {
            latestHeartRateBpm = heartRateBpm
            val bucketStartMs = bucketStartFor(elapsedRealtimeMs)
            heartRateSamplesByBucket[bucketStartMs] = HeartRateSample(
                timestampMs = bucketStartMs,
                bpm = heartRateBpm,
            )
        }
        if (routePoint != null && isValidRoutePoint(routePoint)) {
            val gapReason = pendingRouteGapReason
            routePoints.add(if (gapReason == null) routePoint else routePoint.copy(
                gapBefore = true,
                gapReason = gapReason,
            ))
            pendingRouteGapReason = null
        }
    }

    fun snapshot(): WearExerciseMetricsSnapshot {
        val normalizedRoute = normalizedRoutePoints()
        val movementRoute = confirmedMovementRoute(normalizedRoute)
        val routeDistanceMeters = routeDistanceMeters(movementRoute)
        // Health Services' cumulative distance wins for the reported/pace-driving distance once
        // available; the filtered polyline stays exactly as-is for route display, distanceSamples
        // (pace-trend), and as the fallback when HS distance is absent, so those may diverge
        // slightly from the HS total by design.
        return WearExerciseMetricsSnapshot(
            startedAtWallClockMs = startedAtWallClockMs,
            distanceMeters = healthDistanceMeters ?: routeDistanceMeters,
            latestHeartRateBpm = latestHeartRateBpm,
            activeDurationMs = activeDurationMs,
            distanceSamples = routeDistanceSamples(movementRoute),
            heartRateSamples = heartRateSamplesByBucket.values.sortedBy { it.timestampMs },
            routePoints = normalizedRoute,
            healthDistanceMeters = healthDistanceMeters,
        )
    }

    fun toRunSession(dateKey: String, endedAtWallClockMs: Long): WearRunSession {
        val snapshot = snapshot()
        return WearRunSession(
            dateKey = dateKey,
            startedAtMs = startedAtWallClockMs,
            endedAtMs = endedAtWallClockMs,
            distanceMeters = snapshot.distanceMeters,
            heartRateSamples = snapshot.heartRateSamples,
            routePoints = snapshot.routePoints,
        )
    }

    private fun isValidRoutePoint(point: WearRoutePoint): Boolean {
        return point.lat.isFinite() &&
            point.lng.isFinite() &&
            point.lat in -90.0..90.0 &&
            point.lng in -180.0..180.0 &&
            (point.accuracy == null || (point.accuracy.isFinite() && point.accuracy > 0.0 && point.accuracy <= MAX_GPS_ACCURACY_M)) &&
            point.timestampMs >= 0L
    }

    private fun normalizedRoutePoints(): List<WearRoutePoint> {
        var lastRouteTimestampMs: Long? = null
        var currentRouteSegmentId = 0
        val accepted = mutableListOf<WearRoutePoint>()
        routePoints
            .sortedBy { point -> point.timestampMs }
            .forEach { routePoint ->
                val previous = accepted.lastOrNull()
                if (previous != null) {
                    val elapsedMs = routePoint.timestampMs - previous.timestampMs
                    if (elapsedMs <= 0L) return@forEach
                    val inferredSpeedMps = haversineMeters(previous, routePoint) / (elapsedMs / 1_000.0)
                    if (!inferredSpeedMps.isFinite() || inferredSpeedMps > MAX_RUNNING_SPEED_MPS) return@forEach
                }
                val explicitGap = routePoint.gapBefore
                if (explicitGap && lastRouteTimestampMs != routePoint.timestampMs) {
                    currentRouteSegmentId += 1
                }
                lastRouteTimestampMs = routePoint.timestampMs
                accepted.add(routePoint.copy(
                    segmentId = routePoint.segmentId ?: currentRouteSegmentId,
                    gapBefore = explicitGap,
                    gapReason = routePoint.gapReason,
                ))
            }
        return accepted
    }

    private fun confirmedMovementRoute(route: List<WearRoutePoint>): List<WearRoutePoint> {
        if (route.size < 2) return route
        val confirmed = mutableListOf<WearRoutePoint>()
        var anchor: WearRoutePoint? = null
        route.forEach { point ->
            if ((point.accuracy ?: 0.0) > MAX_DISTANCE_GPS_ACCURACY_M) {
                return@forEach
            }
            val previous = anchor
            if (previous == null || point.gapBefore || previous.segmentId != point.segmentId) {
                confirmed.add(point)
                anchor = point
            } else if (isConfidentRunningMovement(previous, point)) {
                confirmed.add(point)
                anchor = point
            }
        }
        return confirmed
    }

    private fun isConfidentRunningMovement(previous: WearRoutePoint, point: WearRoutePoint): Boolean {
        val elapsedMs = point.timestampMs - previous.timestampMs
        if (elapsedMs <= 0L) return false
        val distanceM = haversineMeters(previous, point)
        val reportedAccuracyM = maxOf(previous.accuracy ?: 0.0, point.accuracy ?: 0.0)
        if (reportedAccuracyM > MAX_DISTANCE_GPS_ACCURACY_M) return false
        val errorRadiusM = maxOf(
            MIN_ROUTE_DISPLACEMENT_M,
            minOf(MAX_GPS_ERROR_RADIUS_M, reportedAccuracyM * 2.0),
        )
        if (distanceM <= errorRadiusM) return false
        val inferredSpeedMps = distanceM / (elapsedMs / 1_000.0)
        return inferredSpeedMps in MIN_CONFIDENT_RUNNING_SPEED_MPS..MAX_RUNNING_SPEED_MPS
    }

    private fun routeDistanceMeters(route: List<WearRoutePoint>): Double {
        if (route.size < 2) return 0.0
        return route.zipWithNext().sumOf { (previous, point) ->
            if (point.gapBefore || previous.segmentId != point.segmentId) 0.0
            else haversineMeters(previous, point)
        }
    }

    private fun routeDistanceSamples(route: List<WearRoutePoint>): List<WearDistanceSample> {
        if (route.isEmpty()) return emptyList()
        var cumulativeDistanceMeters = 0.0
        val samplesByBucket = linkedMapOf<Long, WearDistanceSample>()
        route.forEachIndexed { index, point ->
            if (index > 0) {
                val previous = route[index - 1]
                if (!point.gapBefore && previous.segmentId == point.segmentId) {
                    cumulativeDistanceMeters += haversineMeters(previous, point)
                }
            }
            val elapsedSinceStartMs = (point.timestampMs - startedAtWallClockMs).coerceAtLeast(0L)
            val bucketStartMs = startedAtWallClockMs +
                (elapsedSinceStartMs / HEART_RATE_BUCKET_MS) * HEART_RATE_BUCKET_MS
            samplesByBucket[bucketStartMs] = WearDistanceSample(
                timestampMs = bucketStartMs,
                distanceKm = cumulativeDistanceMeters / 1_000.0,
            )
        }
        return samplesByBucket.values.toList()
    }

    private fun haversineMeters(a: WearRoutePoint, b: WearRoutePoint): Double {
        val earthRadiusM = 6_371_000.0
        val lat1 = Math.toRadians(a.lat)
        val lat2 = Math.toRadians(b.lat)
        val dLat = lat2 - lat1
        val dLng = Math.toRadians(b.lng - a.lng)
        val h = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * earthRadiusM * atan2(sqrt(h), sqrt(1 - h))
    }

    private fun bucketStartFor(elapsedRealtimeMs: Long): Long {
        val elapsedSinceStartMs = (elapsedRealtimeMs - startedAtElapsedRealtimeMs).coerceAtLeast(0L)
        val wallClockMs = startedAtWallClockMs + elapsedSinceStartMs
        return startedAtWallClockMs + ((wallClockMs - startedAtWallClockMs) / HEART_RATE_BUCKET_MS) *
            HEART_RATE_BUCKET_MS
    }

    companion object {
        fun fromSnapshot(
            snapshot: WearExerciseSessionSnapshot,
            startedAtElapsedRealtimeMs: Long,
            markRestartGap: Boolean = false,
        ): WearExerciseMetricAccumulator {
            val accumulator = WearExerciseMetricAccumulator(
                startedAtWallClockMs = snapshot.startedAtWallClockMs,
                startedAtElapsedRealtimeMs = startedAtElapsedRealtimeMs,
            )
            accumulator.latestHeartRateBpm = snapshot.latestHeartRateBpm
                ?: snapshot.heartRateSamples.lastOrNull()?.bpm
            accumulator.activeDurationMs = snapshot.activeDurationMs.coerceAtLeast(0L)
            accumulator.healthDistanceMeters = snapshot.healthDistanceMeters
                ?.takeIf { distance -> distance.isFinite() && distance >= 0.0 }
            snapshot.heartRateSamples
                .filter { sample -> sample.timestampMs >= 0L && sample.bpm in MIN_HEART_RATE_BPM..MAX_HEART_RATE_BPM }
                .forEach { sample -> accumulator.heartRateSamplesByBucket[sample.timestampMs] = sample }
            snapshot.routePoints
                .filter { point -> accumulator.isValidRoutePoint(point) }
                .sortedBy { point -> point.timestampMs }
                .forEach { point -> accumulator.routePoints.add(point) }
            if (markRestartGap && accumulator.routePoints.isNotEmpty()) {
                accumulator.markRouteGap("service-restart")
            }
            return accumulator
        }

        private const val HEART_RATE_BUCKET_MS = 10_000L
        private const val MAX_GPS_ACCURACY_M = 35.0
        private const val MAX_DISTANCE_GPS_ACCURACY_M = 15.0
        private const val MIN_ROUTE_DISPLACEMENT_M = 12.0
        private const val MAX_GPS_ERROR_RADIUS_M = 30.0
        private const val MIN_CONFIDENT_RUNNING_SPEED_MPS = 0.3
        private const val MAX_RUNNING_SPEED_MPS = 15.0
        private const val MIN_HEART_RATE_BPM = 30
        private const val MAX_HEART_RATE_BPM = 240
    }
}
