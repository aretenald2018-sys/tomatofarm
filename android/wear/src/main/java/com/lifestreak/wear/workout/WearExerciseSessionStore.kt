package com.lifestreak.wear.workout

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.nio.charset.StandardCharsets
import org.json.JSONArray
import org.json.JSONObject

enum class WearExerciseSessionStatus {
    IDLE,
    STARTING,
    ACTIVE,
    PAUSED,
    ENDED,
    FALLBACK,
    ERROR,
}

data class WearExerciseSessionSnapshot(
    val status: WearExerciseSessionStatus = WearExerciseSessionStatus.IDLE,
    val startedAtWallClockMs: Long = 0L,
    val distanceMeters: Double = 0.0,
    val latestHeartRateBpm: Int? = null,
    val activeDurationMs: Long = 0L,
    val distanceSamples: List<WearDistanceSample> = emptyList(),
    val heartRateSamples: List<HeartRateSample> = emptyList(),
    val routePoints: List<WearRoutePoint> = emptyList(),
    val message: String? = null,
    // W3 pace-consistency slice: Health Services' cumulative distance, carried through restarts so
    // a killed-and-restored service doesn't drop back to the filtered GPS route distance. Null for
    // sessions persisted before this field existed.
    val healthDistanceMeters: Double? = null,
    // W5a elevation slice: same idea for cumulative elevation gain. elevationGainMeters is the
    // merged (Health Services or route-fallback) value the UI/payload use; healthElevationGainMeters
    // is the raw Health-Services-only value carried through restarts so a killed-and-restored
    // service seeds the accumulator's HS-sourced state distinctly from the route fallback. Both
    // null for sessions persisted before this field existed.
    val elevationGainMeters: Double? = null,
    val healthElevationGainMeters: Double? = null,
)

/**
 * Ambient (AOD) flag (plan's W1/W2 slices): set true/false by MainActivity's
 * AmbientLifecycleObserver callback, and read by [WearExerciseService] to relax its live-snapshot
 * and active-duration-checkpoint cadences while the watch is in low-power ambient mode.
 */
object WearAmbientState {
    @Volatile
    var isAmbient: Boolean = false
}

object WearExerciseSessionStore {
    private val lock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val listeners = linkedSetOf<(WearExerciseSessionSnapshot) -> Unit>()
    private var snapshot = WearExerciseSessionSnapshot()

    fun addListener(listener: (WearExerciseSessionSnapshot) -> Unit): () -> Unit {
        val current = synchronized(lock) {
            listeners.add(listener)
            snapshot
        }
        dispatch(listener, current)
        return {
            synchronized(lock) {
                listeners.remove(listener)
            }
        }
    }

    fun resetForStart(startedAtWallClockMs: Long) {
        publish(
            WearExerciseSessionSnapshot(
                status = WearExerciseSessionStatus.STARTING,
                startedAtWallClockMs = startedAtWallClockMs,
            ),
        )
    }

    fun publishFromAccumulator(
        status: WearExerciseSessionStatus,
        accumulator: WearExerciseMetricAccumulator,
        message: String? = null,
    ) {
        val metrics = accumulator.snapshot()
        publish(
            WearExerciseSessionSnapshot(
                status = status,
                startedAtWallClockMs = metrics.startedAtWallClockMs,
                distanceMeters = metrics.distanceMeters,
                latestHeartRateBpm = metrics.latestHeartRateBpm,
                activeDurationMs = metrics.activeDurationMs,
                distanceSamples = metrics.distanceSamples,
                heartRateSamples = metrics.heartRateSamples,
                routePoints = metrics.routePoints,
                message = message,
                healthDistanceMeters = metrics.healthDistanceMeters,
                elevationGainMeters = metrics.elevationGainMeters,
                healthElevationGainMeters = metrics.healthElevationGainMeters,
            ),
        )
    }

    fun markPaused(message: String? = null) {
        updateStatus(WearExerciseSessionStatus.PAUSED, message)
    }

    fun markEnded(message: String? = null) {
        updateStatus(WearExerciseSessionStatus.ENDED, message)
    }

    fun reset() {
        publish(WearExerciseSessionSnapshot())
    }

    fun restore(snapshot: WearExerciseSessionSnapshot) {
        publish(snapshot)
    }

    fun markFallback(message: String) {
        updateStatus(WearExerciseSessionStatus.FALLBACK, message)
    }

    fun markError(message: String) {
        updateStatus(WearExerciseSessionStatus.ERROR, message)
    }

    fun current(): WearExerciseSessionSnapshot = synchronized(lock) { snapshot }

    private fun updateStatus(status: WearExerciseSessionStatus, message: String?) {
        val next = synchronized(lock) {
            snapshot.copy(status = status, message = message)
        }
        publish(next)
    }

    private fun publish(next: WearExerciseSessionSnapshot) {
        val targets = synchronized(lock) {
            snapshot = next
            listeners.toList()
        }
        targets.forEach { listener -> dispatch(listener, next) }
    }

    private fun dispatch(
        listener: (WearExerciseSessionSnapshot) -> Unit,
        next: WearExerciseSessionSnapshot,
    ) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            listener(next)
        } else {
            mainHandler.post { listener(next) }
        }
    }
}

object WearExerciseSessionPersistence {
    private const val PREFS_NAME = "tomato_wear_exercise"
    private const val KEY_SNAPSHOT = "running_snapshot"
    private const val ROUTE_FILE_NAME = "wear-running-route.jsonl"
    private const val VERSION = 1
    private const val MAX_DISTANCE_SAMPLES = 2_500
    private const val MAX_HEART_RATE_SAMPLES = 2_500
    private const val MAX_ROUTE_POINTS = 25_000
    private var persistedRouteStartedAtMs = 0L
    private var persistedRoutePointCount = 0

    @Synchronized
    fun load(context: Context): WearExerciseSessionSnapshot? {
        val snapshot = decode(
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(KEY_SNAPSHOT, null),
        ) ?: return null
        val fileRoutes = readPersistedRoutePoints(context)
        val restoredRoutes = if (fileRoutes.isNotEmpty()) fileRoutes else snapshot.routePoints
        persistedRouteStartedAtMs = snapshot.startedAtWallClockMs
        persistedRoutePointCount = if (fileRoutes.isNotEmpty()) fileRoutes.size else 0
        return snapshot.copy(routePoints = restoredRoutes)
    }

    @Synchronized
    fun saveOrClear(context: Context, snapshot: WearExerciseSessionSnapshot) {
        if (!shouldPersist(snapshot)) {
            clear(context)
            return
        }
        val routeFileUpdated = appendNewRoutePoints(context, snapshot)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(
                KEY_SNAPSHOT,
                if (routeFileUpdated) encodeForPersistence(snapshot) else encode(snapshot),
            )
            .apply()
    }

    @Synchronized
    fun clear(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SNAPSHOT)
            .apply()
        deleteRouteFile(context)
        persistedRouteStartedAtMs = 0L
        persistedRoutePointCount = 0
    }

    internal fun encode(snapshot: WearExerciseSessionSnapshot): String {
        return encodeSnapshot(snapshot, snapshot.routePoints)
    }

    private fun encodeForPersistence(snapshot: WearExerciseSessionSnapshot): String {
        return encodeSnapshot(snapshot, emptyList())
    }

    private fun encodeSnapshot(
        snapshot: WearExerciseSessionSnapshot,
        routePoints: List<WearRoutePoint>,
    ): String {
        return JSONObject()
            .put("version", VERSION)
            .put("status", snapshot.status.name)
            .put("startedAtWallClockMs", snapshot.startedAtWallClockMs)
            .put("distanceMeters", snapshot.distanceMeters)
            .putNullable("latestHeartRateBpm", snapshot.latestHeartRateBpm)
            .put("activeDurationMs", snapshot.activeDurationMs)
            .put("distanceSamples", distanceSamplesToJson(snapshot.distanceSamples))
            .put("heartRateSamples", heartRateSamplesToJson(snapshot.heartRateSamples))
            .put("routePoints", routePointsToJson(routePoints))
            .putNullable("message", snapshot.message)
            .putNullable("healthDistanceMeters", snapshot.healthDistanceMeters)
            .putNullable("elevationGainMeters", snapshot.elevationGainMeters)
            .putNullable("healthElevationGainMeters", snapshot.healthElevationGainMeters)
            .toString()
    }

    internal fun decode(raw: String?): WearExerciseSessionSnapshot? {
        if (raw.isNullOrBlank()) return null
        return runCatching {
            val json = JSONObject(raw)
            if (json.optInt("version", VERSION) != VERSION) return null
            val status = runCatching {
                WearExerciseSessionStatus.valueOf(json.getString("status"))
            }.getOrElse { return null }
            val snapshot = WearExerciseSessionSnapshot(
                status = status,
                startedAtWallClockMs = json.optLong("startedAtWallClockMs", 0L).coerceAtLeast(0L),
                distanceMeters = json.optDouble("distanceMeters", 0.0).takeIf { it.isFinite() && it >= 0.0 } ?: 0.0,
                latestHeartRateBpm = json.optNullableInt("latestHeartRateBpm")
                    ?.takeIf { it in 30..240 },
                activeDurationMs = json.optLong("activeDurationMs", 0L).coerceAtLeast(0L),
                distanceSamples = json.optJSONArray("distanceSamples")
                    .toDistanceSamples()
                    .takeLast(MAX_DISTANCE_SAMPLES),
                heartRateSamples = json.optJSONArray("heartRateSamples")
                    .toHeartRateSamples()
                    .takeLast(MAX_HEART_RATE_SAMPLES),
                routePoints = json.optJSONArray("routePoints")
                    .toRoutePoints()
                    .takeLast(MAX_ROUTE_POINTS),
                message = json.optNullableString("message"),
                healthDistanceMeters = json.optNullableDouble("healthDistanceMeters")
                    ?.takeIf { distance -> distance.isFinite() && distance >= 0.0 },
                elevationGainMeters = json.optNullableDouble("elevationGainMeters")
                    ?.takeIf { elevation -> elevation.isFinite() && elevation >= 0.0 },
                healthElevationGainMeters = json.optNullableDouble("healthElevationGainMeters")
                    ?.takeIf { elevation -> elevation.isFinite() && elevation >= 0.0 },
            )
            snapshot.takeIf { shouldPersist(it) }
        }.getOrNull()
    }

    internal fun shouldPersist(snapshot: WearExerciseSessionSnapshot): Boolean {
        if (snapshot.startedAtWallClockMs <= 0L) return false
        return snapshot.status in setOf(
            WearExerciseSessionStatus.STARTING,
            WearExerciseSessionStatus.ACTIVE,
            WearExerciseSessionStatus.PAUSED,
            WearExerciseSessionStatus.FALLBACK,
            WearExerciseSessionStatus.ENDED,
        )
    }

    private fun appendNewRoutePoints(
        context: Context,
        snapshot: WearExerciseSessionSnapshot,
    ): Boolean {
        val allPoints = snapshot.routePoints.takeLast(MAX_ROUTE_POINTS)
        val isNewSession = persistedRouteStartedAtMs != snapshot.startedAtWallClockMs
        val routeWasTrimmed = allPoints.size < persistedRoutePointCount
        if (isNewSession || routeWasTrimmed) {
            deleteRouteFile(context)
            persistedRouteStartedAtMs = snapshot.startedAtWallClockMs
            persistedRoutePointCount = 0
        }
        val newPoints = allPoints.drop(persistedRoutePointCount)
        if (newPoints.isEmpty()) return true
        return try {
            BufferedWriter(
                OutputStreamWriter(
                    FileOutputStream(routeFile(context), true),
                    StandardCharsets.UTF_8,
                ),
            ).use { writer ->
                newPoints.forEach { point ->
                    writer.write(routePointToJson(point).toString())
                    writer.newLine()
                }
            }
            persistedRoutePointCount += newPoints.size
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun readPersistedRoutePoints(context: Context): List<WearRoutePoint> {
        val file = routeFile(context)
        if (!file.isFile) return emptyList()
        return try {
            BufferedReader(
                InputStreamReader(FileInputStream(file), StandardCharsets.UTF_8),
            ).use { reader ->
                val points = mutableListOf<WearRoutePoint>()
                while (points.size < MAX_ROUTE_POINTS) {
                    val line = reader.readLine() ?: break
                    routePointFromJson(line)?.let(points::add)
                }
                points.sortedBy { point -> point.timestampMs }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun routeFile(context: Context): File = File(context.filesDir, ROUTE_FILE_NAME)

    private fun deleteRouteFile(context: Context) {
        val file = routeFile(context)
        if (file.exists() && !file.delete()) file.deleteOnExit()
    }

    private fun distanceSamplesToJson(samples: List<WearDistanceSample>): JSONArray {
        return JSONArray().apply {
            samples.takeLast(MAX_DISTANCE_SAMPLES).forEach { sample ->
                put(
                    JSONObject()
                        .put("timestampMs", sample.timestampMs)
                        .put("distanceKm", sample.distanceKm),
                )
            }
        }
    }

    private fun heartRateSamplesToJson(samples: List<HeartRateSample>): JSONArray {
        return JSONArray().apply {
            samples.takeLast(MAX_HEART_RATE_SAMPLES).forEach { sample ->
                put(
                    JSONObject()
                        .put("timestampMs", sample.timestampMs)
                        .put("bpm", sample.bpm),
                )
            }
        }
    }

    private fun routePointsToJson(points: List<WearRoutePoint>): JSONArray {
        return JSONArray().apply {
            points.takeLast(MAX_ROUTE_POINTS).forEach { point ->
                put(routePointToJson(point))
            }
        }
    }

    private fun routePointToJson(point: WearRoutePoint): JSONObject {
        return JSONObject()
            .put("timestampMs", point.timestampMs)
            .put("lat", point.lat)
            .put("lng", point.lng)
            .putNullable("altitude", point.altitude)
            .putNullable("bearing", point.bearing)
            .putNullable("accuracy", point.accuracy)
            .putNullable("segmentId", point.segmentId)
            .put("gapBefore", point.gapBefore)
            .putNullable("gapReason", point.gapReason)
    }

    private fun JSONArray?.toDistanceSamples(): List<WearDistanceSample> {
        if (this == null) return emptyList()
        val samples = mutableListOf<WearDistanceSample>()
        for (index in 0 until length()) {
            val item = optJSONObject(index) ?: continue
            val timestampMs = item.optLong("timestampMs", -1L)
            val distanceKm = item.optDouble("distanceKm", Double.NaN)
            if (timestampMs >= 0L && distanceKm.isFinite() && distanceKm >= 0.0) {
                samples.add(WearDistanceSample(timestampMs = timestampMs, distanceKm = distanceKm))
            }
        }
        return samples.sortedBy { sample -> sample.timestampMs }
    }

    private fun JSONArray?.toHeartRateSamples(): List<HeartRateSample> {
        if (this == null) return emptyList()
        val samples = mutableListOf<HeartRateSample>()
        for (index in 0 until length()) {
            val item = optJSONObject(index) ?: continue
            val timestampMs = item.optLong("timestampMs", -1L)
            val bpm = item.optInt("bpm", -1)
            if (timestampMs >= 0L && bpm in 30..240) {
                samples.add(HeartRateSample(timestampMs = timestampMs, bpm = bpm))
            }
        }
        return samples.sortedBy { sample -> sample.timestampMs }
    }

    private fun JSONArray?.toRoutePoints(): List<WearRoutePoint> {
        if (this == null) return emptyList()
        val points = mutableListOf<WearRoutePoint>()
        for (index in 0 until length()) {
            val item = optJSONObject(index) ?: continue
            routePointFromJson(item)?.let(points::add)
        }
        return points.sortedBy { point -> point.timestampMs }
    }

    private fun routePointFromJson(item: JSONObject?): WearRoutePoint? {
        val json = item ?: return null
        val timestampMs = json.optLong("timestampMs", -1L)
        val lat = json.optDouble("lat", Double.NaN)
        val lng = json.optDouble("lng", Double.NaN)
        if (timestampMs < 0L || !lat.isFinite() || !lng.isFinite()) return null
        return WearRoutePoint(
            timestampMs = timestampMs,
            lat = lat,
            lng = lng,
            altitude = json.optNullableDouble("altitude"),
            bearing = json.optNullableDouble("bearing"),
            accuracy = json.optNullableDouble("accuracy"),
            segmentId = json.optNullableInt("segmentId"),
            gapBefore = json.optBoolean("gapBefore", false),
            gapReason = json.optNullableString("gapReason"),
        )
    }

    private fun routePointFromJson(raw: String?): WearRoutePoint? {
        if (raw.isNullOrBlank()) return null
        return runCatching { routePointFromJson(JSONObject(raw)) }.getOrNull()
    }

    private fun JSONObject.optNullableInt(name: String): Int? {
        return if (has(name) && !isNull(name)) optInt(name) else null
    }

    private fun JSONObject.optNullableDouble(name: String): Double? {
        return if (has(name) && !isNull(name)) {
            optDouble(name).takeIf { it.isFinite() }
        } else {
            null
        }
    }

    private fun JSONObject.optNullableString(name: String): String? {
        return if (has(name) && !isNull(name)) optString(name).takeIf { it.isNotBlank() } else null
    }

    private fun JSONObject.putNullable(name: String, value: Any?): JSONObject {
        return put(name, value ?: JSONObject.NULL)
    }
}
