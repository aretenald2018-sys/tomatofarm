package com.lifestreak.wear.workout

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import kotlin.math.round
import kotlin.math.roundToInt

enum class WearWorkoutType(val wireValue: String) {
    RUNNING("running"),
}

data class HeartRateSample(
    val timestampMs: Long,
    val bpm: Int,
)

data class WearRoutePoint(
    val timestampMs: Long,
    val lat: Double,
    val lng: Double,
    val altitude: Double? = null,
    val bearing: Double? = null,
    val accuracy: Double? = null,
    val segmentId: Int? = null,
    val gapBefore: Boolean = false,
    val gapReason: String? = null,
)

data class WearRouteSummary(
    val source: String,
    val pointCount: Int,
    val distanceKm: Double,
    val durationSec: Long,
    val startedAtMs: Long,
    val endedAtMs: Long,
    val segmentCount: Int = 0,
    val gapCount: Int = 0,
    val interrupted: Boolean = false,
    val distanceMeters: Double = distanceKm * 1_000.0,
)

data class WearRunSession(
    val dateKey: String,
    val startedAtMs: Long,
    val endedAtMs: Long,
    val distanceMeters: Double,
    val activeDurationMs: Long? = null,
    val heartRateSamples: List<HeartRateSample> = emptyList(),
    val routePoints: List<WearRoutePoint> = emptyList(),
) {
    fun toPayload(): Result<WearWorkoutPayload> = WearWorkoutPayload.fromSession(this)
}

data class WearRunSummary(
    val durationSec: Long,
    val distanceKm: Double,
    // Unrounded distance (W3 pace-consistency slice) so the phone can derive pace from a precise
    // denominator instead of the 2-decimal distanceKm, kept alongside it for compatibility.
    val distanceMeters: Double,
    val avgPaceSecPerKm: Int?,
    val avgHeartRateBpm: Int?,
    val maxHeartRateBpm: Int?,
    val samples10s: List<HeartRateSample>,
    val route: List<WearRoutePoint>,
    val routeSummary: WearRouteSummary,
)

data class WearWorkoutPayload(
    val workoutType: WearWorkoutType,
    val source: String,
    val dateKey: String,
    val startedAtMs: Long,
    val endedAtMs: Long,
    val summary: WearRunSummary,
) {
    fun toJsonString(): String {
        return JSONObject()
            .put("payloadVersion", PAYLOAD_VERSION)
            .put("type", workoutType.wireValue)
            .put("source", source)
            .put("dateKey", dateKey)
            .put("startedAt", startedAtMs)
            .put("endedAt", endedAtMs)
            .put("durationSec", summary.durationSec)
            .put("distanceKm", summary.distanceKm)
            .put("distanceMeters", summary.distanceMeters)
            .putNullable("avgPaceSecPerKm", summary.avgPaceSecPerKm)
            .putNullable("avgHeartRateBpm", summary.avgHeartRateBpm)
            .putNullable("maxHeartRateBpm", summary.maxHeartRateBpm)
            .put(
                "route",
                JSONArray().apply {
                    summary.route.forEach { point ->
                        put(
                            JSONObject()
                                .put("timestampMs", point.timestampMs)
                                .put("lat", point.lat)
                                .put("lng", point.lng)
                                .putNullable("altitude", point.altitude)
                                .putNullable("bearing", point.bearing)
                                .putNullable("accuracy", point.accuracy)
                                .putNullable("segmentId", point.segmentId)
                                .put("gapBefore", point.gapBefore)
                                .putNullable("gapReason", point.gapReason),
                        )
                    }
                },
            )
            .put(
                "routeSummary",
                JSONObject()
                    .put("source", summary.routeSummary.source)
                    .put("pointCount", summary.routeSummary.pointCount)
                    .put("distanceKm", summary.routeSummary.distanceKm)
                    .put("distanceMeters", summary.routeSummary.distanceMeters)
                    .put("durationSec", summary.routeSummary.durationSec)
                    .put("startedAt", summary.routeSummary.startedAtMs)
                    .put("endedAt", summary.routeSummary.endedAtMs)
                    .put("segmentCount", summary.routeSummary.segmentCount)
                    .put("gapCount", summary.routeSummary.gapCount)
                    .put("interrupted", summary.routeSummary.interrupted),
            )
            .put(
                "samples10s",
                JSONArray().apply {
                    summary.samples10s.forEach { sample ->
                        put(
                            JSONObject()
                                .put("timestampMs", sample.timestampMs)
                                .put("bpm", sample.bpm),
                        )
                    }
                },
            )
            .toString()
    }

    companion object {
        const val SOURCE_WEAR = "wear"
        const val PAYLOAD_VERSION = 1

        private const val HEART_RATE_BUCKET_MS = 10_000L
        private const val MAX_RUN_DURATION_SEC = 6L * 60L * 60L
        private const val MAX_HEART_RATE_BUCKETS = 2_161
        private const val MAX_HEART_RATE_SAMPLE_COUNT = 50_000
        private const val MAX_ROUTE_POINT_COUNT = 25_000
        private const val MIN_ROUTE_DISPLACEMENT_M = 12.0
        private const val MAX_GPS_ERROR_RADIUS_M = 30.0
        private const val MIN_CONFIDENT_RUNNING_SPEED_MPS = 0.3
        private const val MAX_RUNNING_SPEED_MPS = 15.0
        // Mirrors WearExerciseMetricAccumulator.MAX_DISTANCE_GPS_ACCURACY_M (W3 pace-consistency
        // slice): this fallback path used to be more permissive than the primary accumulator path
        // since it never hard-dropped low-accuracy fixes, which was an inconsistency.
        private const val MAX_DISTANCE_GPS_ACCURACY_M = 15.0
        private val DATE_KEY_PATTERN = Regex("""\d{4}-\d{2}-\d{2}""")

        fun fromSession(session: WearRunSession): Result<WearWorkoutPayload> = runCatching {
            validateDateKey(session.dateKey)
            require(session.startedAtMs >= 0L) { "startedAtMs must be positive" }
            require(session.endedAtMs > session.startedAtMs) { "endedAtMs must be after startedAtMs" }
            require(session.distanceMeters.isFinite() && session.distanceMeters >= 0.0) {
                "distanceMeters must be finite and non-negative"
            }
            require(session.heartRateSamples.size <= MAX_HEART_RATE_SAMPLE_COUNT) {
                "heartRateSamples exceeds payload limit"
            }
            require(session.routePoints.size <= MAX_ROUTE_POINT_COUNT) {
                "routePoints exceeds payload limit"
            }

            val wallDurationMs = session.endedAtMs - session.startedAtMs
            val durationMs = session.activeDurationMs
                ?.takeIf { it > 0L }
                ?.coerceAtMost(wallDurationMs)
                ?: wallDurationMs
            val durationSec = durationMs / 1_000L
            require(durationSec > 0L) { "durationSec must be positive" }
            require(durationSec <= MAX_RUN_DURATION_SEC) { "durationSec exceeds payload limit" }
            validateRoutePoints(session)
            val route = normalizeRoute(session)
            val routeGapSummary = summarizeRouteGaps(route)
            val distanceMeters = session.distanceMeters.takeIf { it > 0.0 }
                ?: confirmedMovementDistanceMeters(route)
            val distanceKm = roundTo(distanceMeters / 1_000.0, digits = 2)
            val validHeartRateSamples = session.heartRateSamples
                .filter { sample ->
                    sample.timestampMs in session.startedAtMs..session.endedAtMs &&
                        sample.bpm in 30..240
                }
                .sortedBy { it.timestampMs }
            val bucketedSamples = bucketHeartRates(session.startedAtMs, validHeartRateSamples)
            require(bucketedSamples.size <= MAX_HEART_RATE_BUCKETS) {
                "samples10s exceeds payload limit"
            }

            WearWorkoutPayload(
                workoutType = WearWorkoutType.RUNNING,
                source = SOURCE_WEAR,
                dateKey = session.dateKey,
                startedAtMs = session.startedAtMs,
                endedAtMs = session.endedAtMs,
                summary = WearRunSummary(
                    durationSec = durationSec,
                    distanceKm = distanceKm,
                    distanceMeters = distanceMeters,
                    // Moving-time pace (pauses excluded from durationSec above) — this matches the
                    // common default in other running apps (e.g. Strava's "moving time"), so this
                    // isn't a bug to "fix" later.
                    avgPaceSecPerKm = if (distanceMeters > 0.0) {
                        (durationSec / (distanceMeters / 1_000.0)).roundToInt()
                    } else {
                        null
                    },
                    avgHeartRateBpm = bucketedSamples.averageBpmOrNull(),
                    maxHeartRateBpm = validHeartRateSamples.maxOfOrNull { it.bpm },
                    samples10s = bucketedSamples,
                    route = route,
                    routeSummary = WearRouteSummary(
                        source = if (route.isNotEmpty()) "wear-gps" else "unavailable",
                        pointCount = route.size,
                        distanceKm = distanceKm,
                        distanceMeters = distanceMeters,
                        durationSec = durationSec,
                        startedAtMs = session.startedAtMs,
                        endedAtMs = session.endedAtMs,
                        segmentCount = routeGapSummary.segmentCount,
                        gapCount = routeGapSummary.gapCount,
                        interrupted = routeGapSummary.interrupted,
                    ),
                ),
            )
        }

        private fun validateDateKey(dateKey: String) {
            require(DATE_KEY_PATTERN.matches(dateKey)) { "dateKey must use yyyy-MM-dd" }
            LocalDate.parse(dateKey)
        }

        private fun bucketHeartRates(
            startedAtMs: Long,
            samples: List<HeartRateSample>,
        ): List<HeartRateSample> {
            return samples
                .groupBy { sample ->
                    startedAtMs + ((sample.timestampMs - startedAtMs) / HEART_RATE_BUCKET_MS) *
                        HEART_RATE_BUCKET_MS
                }
                .toSortedMap()
                .map { (bucketStartMs, bucketSamples) ->
                    HeartRateSample(
                        timestampMs = bucketStartMs,
                        bpm = bucketSamples.map { it.bpm }.average().roundToInt(),
                    )
                }
        }

        private fun normalizeRoute(session: WearRunSession): List<WearRoutePoint> {
            val points = session.routePoints
                .sortedBy { it.timestampMs }
            val normalized = mutableListOf<WearRoutePoint>()
            var currentSegmentId = 0
            points.forEach { point ->
                val previous = normalized.lastOrNull()
                val previousSegmentId = previous?.segmentId ?: currentSegmentId
                val explicitSegmentId = point.segmentId
                val segmentChanged = previous != null &&
                    explicitSegmentId != null &&
                    explicitSegmentId != previousSegmentId
                val gapBefore = previous != null && (point.gapBefore || segmentChanged)
                currentSegmentId = when {
                    explicitSegmentId != null && gapBefore && !segmentChanged -> {
                        maxOf(explicitSegmentId, previousSegmentId + 1)
                    }
                    explicitSegmentId != null -> explicitSegmentId
                    gapBefore -> previousSegmentId + 1
                    else -> previousSegmentId
                }
                normalized.add(
                    point.copy(
                        segmentId = currentSegmentId,
                        gapBefore = gapBefore,
                        gapReason = if (gapBefore) {
                            point.gapReason ?: "watch-gap"
                        } else {
                            null
                        },
                    ),
                )
            }
            return normalized
        }

        private fun validateRoutePoints(session: WearRunSession) {
            session.routePoints.forEachIndexed { index, point ->
                require(point.timestampMs in session.startedAtMs..session.endedAtMs) {
                    "routePoints[$index].timestampMs must be within the session"
                }
                require(point.lat.isFinite() && point.lat in -90.0..90.0) {
                    "routePoints[$index].lat must be finite and within -90..90"
                }
                require(point.lng.isFinite() && point.lng in -180.0..180.0) {
                    "routePoints[$index].lng must be finite and within -180..180"
                }
                require(point.altitude == null || point.altitude.isFinite()) {
                    "routePoints[$index].altitude must be finite"
                }
                require(point.bearing == null || point.bearing.isFinite()) {
                    "routePoints[$index].bearing must be finite"
                }
                require(point.accuracy == null || (point.accuracy.isFinite() && point.accuracy > 0.0)) {
                    "routePoints[$index].accuracy must be finite and positive"
                }
                require(point.segmentId == null || point.segmentId >= 0) {
                    "routePoints[$index].segmentId must be non-negative"
                }
            }
        }

        private fun summarizeRouteGaps(route: List<WearRoutePoint>): RouteGapSummary {
            if (route.isEmpty()) return RouteGapSummary(segmentCount = 0, gapCount = 0)

            var segmentCount = 1
            var gapCount = 0
            route.zipWithNext().forEach { (previous, point) ->
                if (isGapEdge(previous, point)) {
                    segmentCount += 1
                    gapCount += 1
                }
            }
            return RouteGapSummary(segmentCount = segmentCount, gapCount = gapCount)
        }

        private fun isGapEdge(previous: WearRoutePoint, point: WearRoutePoint): Boolean {
            val segmentChanged = previous.segmentId != null &&
                point.segmentId != null &&
                previous.segmentId != point.segmentId
            return point.gapBefore || segmentChanged
        }

        private fun confirmedMovementDistanceMeters(route: List<WearRoutePoint>): Double {
            if (route.size < 2) return 0.0
            var anchor: WearRoutePoint? = null
            var total = 0.0
            route.forEach { point ->
                if ((point.accuracy ?: 0.0) > MAX_DISTANCE_GPS_ACCURACY_M) return@forEach
                val previous = anchor
                if (previous == null || isGapEdge(previous, point)) {
                    anchor = point
                    return@forEach
                }
                val elapsedMs = point.timestampMs - previous.timestampMs
                if (elapsedMs <= 0L) return@forEach
                val distanceM = haversineMeters(previous, point)
                val errorRadiusM = maxOf(
                    MIN_ROUTE_DISPLACEMENT_M,
                    minOf(MAX_GPS_ERROR_RADIUS_M, maxOf(previous.accuracy ?: 0.0, point.accuracy ?: 0.0) * 2.0),
                )
                val inferredSpeedMps = distanceM / (elapsedMs / 1_000.0)
                if (distanceM <= errorRadiusM || inferredSpeedMps !in MIN_CONFIDENT_RUNNING_SPEED_MPS..MAX_RUNNING_SPEED_MPS) {
                    return@forEach
                }
                total += distanceM
                anchor = point
            }
            return total
        }

        private fun haversineMeters(a: WearRoutePoint, b: WearRoutePoint): Double {
            val radiusMeters = 6_371_000.0
            val dLat = Math.toRadians(b.lat - a.lat)
            val dLng = Math.toRadians(b.lng - a.lng)
            val lat1 = Math.toRadians(a.lat)
            val lat2 = Math.toRadians(b.lat)
            val h = kotlin.math.sin(dLat / 2) * kotlin.math.sin(dLat / 2) +
                kotlin.math.cos(lat1) * kotlin.math.cos(lat2) *
                    kotlin.math.sin(dLng / 2) * kotlin.math.sin(dLng / 2)
            return 2 * radiusMeters * kotlin.math.atan2(kotlin.math.sqrt(h), kotlin.math.sqrt(1 - h))
        }

        private fun List<HeartRateSample>.averageBpmOrNull(): Int? {
            if (isEmpty()) return null
            return map { it.bpm }.average().roundToInt()
        }

        private fun roundTo(value: Double, digits: Int): Double {
            val multiplier = (1..digits).fold(1.0) { acc, _ -> acc * 10.0 }
            return round(value * multiplier) / multiplier
        }
    }

    private data class RouteGapSummary(
        val segmentCount: Int,
        val gapCount: Int,
    ) {
        val interrupted: Boolean = gapCount > 0
    }
}

private fun JSONObject.putNullable(name: String, value: Any?): JSONObject {
    return put(name, value ?: JSONObject.NULL)
}
