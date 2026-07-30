package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Test

class WearExerciseMetricAccumulatorTest {
    @Test
    fun keepsEachConfirmedRunningLocationInsideOneTenSecondWindow() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        repeat(6) { index ->
            accumulator.applyMetricUpdate(
                elapsedRealtimeMs = 1_000L + index * 1_000L,
                routePoint = WearRoutePoint(
                    timestampMs = 10_000L + index * 1_000L,
                    lat = 37.5665,
                    lng = 126.9780 + index * 0.00015,
                ),
            )
        }

        val route = accumulator.snapshot().routePoints
        assertEquals(6, route.size)
        assertEquals(
            listOf(10_000L, 11_000L, 12_000L, 13_000L, 14_000L, 15_000L),
            route.map { it.timestampMs },
        )
        assertEquals(6, route.map { it.lat to it.lng }.distinct().size)
    }

    @Test
    fun rejectsSameTimestampLocationsUntilAConfirmedMoveArrives() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        val first = WearRoutePoint(timestampMs = 11_000L, lat = 37.5665, lng = 126.9780)
        val second = WearRoutePoint(timestampMs = 11_000L, lat = 37.5666, lng = 126.9781)
        val later = WearRoutePoint(timestampMs = 21_000L, lat = 37.5666, lng = 126.9781)

        listOf(later, first, second, first).forEach { point ->
            accumulator.applyMetricUpdate(
                elapsedRealtimeMs = point.timestampMs - 9_000L,
                routePoint = point,
            )
        }

        val route = accumulator.snapshot().routePoints
        assertEquals(listOf(11_000L, 21_000L), route.map { it.timestampMs })
        assertEquals(
            listOf(
                37.5665 to 126.9780,
                37.5666 to 126.9781,
            ),
            route.map { it.lat to it.lng },
        )
    }

    @Test
    fun keepsLatestUiMetricsAndStoresHeartRateAtTenSecondCadence() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            heartRateBpm = 88,
            activeDurationMs = 0L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 5_000L,
            heartRateBpm = 150,
            activeDurationMs = 4_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 12_500L,
            heartRateBpm = 152,
            activeDurationMs = 11_500L,
            routePoint = WearRoutePoint(timestampMs = 22_500L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 13_000L,
            heartRateBpm = 999,
            activeDurationMs = -1L,
        )

        val snapshot = accumulator.snapshot()

        assertEquals(0.0, snapshot.distanceMeters, 0.0001)
        assertEquals(152, snapshot.latestHeartRateBpm)
        assertEquals(11_500L, snapshot.activeDurationMs)
        assertEquals(
            listOf(
                HeartRateSample(timestampMs = 10_000L, bpm = 150),
                HeartRateSample(timestampMs = 20_000L, bpm = 152),
            ),
            snapshot.heartRateSamples,
        )
        assertEquals(
            listOf(WearRoutePoint(timestampMs = 22_500L, lat = 37.5665, lng = 126.9780, segmentId = 0)),
            snapshot.routePoints,
        )
    }

    @Test
    fun marksRouteGapWhenLocationUpdatesResumeAfterExplicitPause() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 11_000L,
            routePoint = WearRoutePoint(timestampMs = 20_000L, lat = 37.5666, lng = 126.9781),
        )
        accumulator.markRouteGap("pause")
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 71_000L,
            routePoint = WearRoutePoint(timestampMs = 80_000L, lat = 37.5700, lng = 126.9800),
        )

        val route = accumulator.snapshot().routePoints

        assertEquals(listOf(0, 0, 1), route.map { it.segmentId })
        assertEquals(false, route[1].gapBefore)
        assertEquals(true, route[2].gapBefore)
        assertEquals("pause", route[2].gapReason)
    }

    @Test
    fun preservesTheExactExplicitGapReason() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_001L,
            routePoint = WearRoutePoint(timestampMs = 10_001L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.markRouteGap("service-restart")
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 50_999L,
            routePoint = WearRoutePoint(timestampMs = 59_999L, lat = 37.5700, lng = 126.9800),
        )

        val route = accumulator.snapshot().routePoints
        assertEquals(listOf(0, 1), route.map { it.segmentId })
        assertEquals(true, route[1].gapBefore)
        assertEquals("service-restart", route[1].gapReason)
    }

    @Test
    fun convertsAccumulatedMetricsToWearRunSession() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 11_000L,
            heartRateBpm = 140,
            activeDurationMs = 10_000L,
        )

        val session = accumulator.toRunSession(
            dateKey = "2026-07-06",
            endedAtWallClockMs = 20_000L,
        )

        assertEquals("2026-07-06", session.dateKey)
        assertEquals(10_000L, session.startedAtMs)
        assertEquals(20_000L, session.endedAtMs)
        assertEquals(0.0, session.distanceMeters, 0.0001)
        assertEquals(listOf(HeartRateSample(timestampMs = 20_000L, bpm = 140)), session.heartRateSamples)
        assertEquals(emptyList<WearRoutePoint>(), session.routePoints)
    }

    @Test
    fun keepsStationaryGpsSamplesForTheMapWithoutCreatingDistance() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780, accuracy = 10.0),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 62_000L,
            routePoint = WearRoutePoint(timestampMs = 71_000L, lat = 37.56658, lng = 126.9780, accuracy = 10.0),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(2, snapshot.routePoints.size)
        assertEquals(0.0, snapshot.distanceMeters, 0.0001)
    }

    @Test
    fun weakGpsCannotCreateDistanceFromStationaryDrift() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5, lng = 127.0, accuracy = 17.0),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 21_000L,
            routePoint = WearRoutePoint(timestampMs = 30_000L, lat = 37.5004, lng = 127.0004, accuracy = 17.0),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(2, snapshot.routePoints.size)
        assertEquals(0.0, snapshot.distanceMeters, 0.0001)
    }

    @Test
    fun weakFirstFixCannotPoisonLaterPreciseRunningDistance() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5, lng = 127.0, accuracy = 30.0),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 11_000L,
            routePoint = WearRoutePoint(timestampMs = 20_000L, lat = 37.5, lng = 127.0, accuracy = 5.0),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 51_000L,
            routePoint = WearRoutePoint(timestampMs = 60_000L, lat = 37.501, lng = 127.0, accuracy = 5.0),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(3, snapshot.routePoints.size)
        assertEquals(true, snapshot.distanceMeters > 100.0)
    }

    @Test
    fun buildsDistanceSamplesOnlyFromConfirmedGpsMovement() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            heartRateBpm = 90,
        )
        assertEquals(emptyList<WearDistanceSample>(), accumulator.snapshot().distanceSamples)

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 11_000L,
            routePoint = WearRoutePoint(
                timestampMs = 20_000L,
                lat = 37.5665,
                lng = 126.9780,
                accuracy = 5.0,
            ),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 21_000L,
            routePoint = WearRoutePoint(
                timestampMs = 30_000L,
                lat = 37.5667,
                lng = 126.9780,
                accuracy = 5.0,
            ),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(2, snapshot.distanceSamples.size)
        assertEquals(snapshot.distanceMeters / 1_000.0, snapshot.distanceSamples.last().distanceKm, 0.000001)
    }

    @Test
    fun keepsOneContinuousSegmentAcrossSparseGpsUpdates() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 61_000L,
            routePoint = WearRoutePoint(timestampMs = 70_000L, lat = 37.5680, lng = 126.9780),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(listOf(0, 0), snapshot.routePoints.map { it.segmentId })
        assertEquals(false, snapshot.routePoints[1].gapBefore)
        assertEquals(true, snapshot.distanceMeters > 150.0)
    }

    @Test
    fun marksAnExplicitPauseGapWithoutCountingTheMissingEdge() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.markRouteGap("pause")
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 61_000L,
            routePoint = WearRoutePoint(timestampMs = 70_000L, lat = 37.5680, lng = 126.9780),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(listOf(0, 1), snapshot.routePoints.map { it.segmentId })
        assertEquals(true, snapshot.routePoints[1].gapBefore)
        assertEquals("pause", snapshot.routePoints[1].gapReason)
        assertEquals(0.0, snapshot.distanceMeters, 0.0001)
    }

    @Test
    fun neverLetsAStaleHealthDurationResetDirectGpsElapsedTime() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 21_000L, activeDurationMs = 20_000L)
        accumulator.applyMetricUpdate(elapsedRealtimeMs = 22_000L, activeDurationMs = 0L)

        assertEquals(20_000L, accumulator.snapshot().activeDurationMs)
    }

    @Test
    fun healthServicesDistanceTakesPrecedenceOverTheFilteredRoute() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        // A confirmed GPS movement of a bit over 100m (see weakFirstFixCannotPoisonLaterPreciseRunningDistance).
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5, lng = 127.0, accuracy = 5.0),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 11_000L,
            routePoint = WearRoutePoint(timestampMs = 20_000L, lat = 37.501, lng = 127.0, accuracy = 5.0),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 12_000L,
            healthDistanceMeters = 250.0,
        )

        val snapshot = accumulator.snapshot()
        assertEquals(250.0, snapshot.distanceMeters, 0.0001)
        assertEquals(250.0, snapshot.healthDistanceMeters!!, 0.0001)
        // The filtered route distance keeps driving distanceSamples/pace-trend regardless of HS.
        assertEquals(true, snapshot.distanceSamples.last().distanceKm < 0.2)
    }

    @Test
    fun healthServicesDistanceIsMonotonicAndIgnoresBadValues() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 1_000L, healthDistanceMeters = 100.0)
        accumulator.applyMetricUpdate(elapsedRealtimeMs = 2_000L, healthDistanceMeters = 40.0)
        assertEquals(100.0, accumulator.snapshot().distanceMeters, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 3_000L, healthDistanceMeters = Double.NaN)
        accumulator.applyMetricUpdate(elapsedRealtimeMs = 4_000L, healthDistanceMeters = -5.0)
        assertEquals(100.0, accumulator.snapshot().distanceMeters, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 5_000L, healthDistanceMeters = 180.0)
        assertEquals(180.0, accumulator.snapshot().distanceMeters, 0.0001)
    }

    @Test
    fun fallsBackToRouteDistanceWhenHealthServicesNeverReports() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 61_000L,
            routePoint = WearRoutePoint(timestampMs = 70_000L, lat = 37.5680, lng = 126.9780),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(null, snapshot.healthDistanceMeters)
        assertEquals(true, snapshot.distanceMeters > 150.0)
    }

    @Test
    fun restoresHealthServicesDistanceFromASnapshotRoundTrip() {
        val accumulator = WearExerciseMetricAccumulator.fromSnapshot(
            snapshot = WearExerciseSessionSnapshot(
                status = WearExerciseSessionStatus.ACTIVE,
                startedAtWallClockMs = 10_000L,
                activeDurationMs = 40_000L,
                healthDistanceMeters = 320.0,
            ),
            startedAtElapsedRealtimeMs = 1_000L,
        )

        assertEquals(320.0, accumulator.snapshot().distanceMeters, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 2_000L, healthDistanceMeters = 150.0)
        assertEquals(320.0, accumulator.snapshot().distanceMeters, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 3_000L, healthDistanceMeters = 400.0)
        assertEquals(400.0, accumulator.snapshot().distanceMeters, 0.0001)
    }

    @Test
    fun restoresPersistedSnapshotAndMarksNextLocationAfterServiceRestart() {
        val accumulator = WearExerciseMetricAccumulator.fromSnapshot(
            snapshot = WearExerciseSessionSnapshot(
                status = WearExerciseSessionStatus.ACTIVE,
                startedAtWallClockMs = 10_000L,
                latestHeartRateBpm = 150,
                activeDurationMs = 40_000L,
                heartRateSamples = listOf(HeartRateSample(timestampMs = 20_000L, bpm = 150)),
                routePoints = listOf(
                    WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780, segmentId = 0),
                    WearRoutePoint(timestampMs = 20_000L, lat = 37.5667, lng = 126.9782, segmentId = 0),
                ),
            ),
            startedAtElapsedRealtimeMs = 1_000L,
            markRestartGap = true,
        )

        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 71_000L,
            activeDurationMs = 70_000L,
            routePoint = WearRoutePoint(timestampMs = 80_000L, lat = 37.5670, lng = 126.9785),
        )

        val snapshot = accumulator.snapshot()

        assertEquals(70_000L, snapshot.activeDurationMs)
        assertEquals(150, snapshot.latestHeartRateBpm)
        assertEquals(listOf(0, 0, 1), snapshot.routePoints.map { it.segmentId })
        assertEquals(true, snapshot.routePoints[2].gapBefore)
        assertEquals("service-restart", snapshot.routePoints[2].gapReason)
    }

    // --- W5a elevation slice --------------------------------------------------------------

    @Test
    fun elevationGainIsMonotonicAndIgnoresBadValues() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 1_000L, healthElevationGainMeters = 12.0)
        accumulator.applyMetricUpdate(elapsedRealtimeMs = 2_000L, healthElevationGainMeters = 5.0)
        assertEquals(12.0, accumulator.snapshot().elevationGainMeters!!, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 3_000L, healthElevationGainMeters = Double.NaN)
        accumulator.applyMetricUpdate(elapsedRealtimeMs = 4_000L, healthElevationGainMeters = -5.0)
        assertEquals(12.0, accumulator.snapshot().elevationGainMeters!!, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 5_000L, healthElevationGainMeters = 20.0)
        assertEquals(20.0, accumulator.snapshot().elevationGainMeters!!, 0.0001)
    }

    @Test
    fun fallsBackToRouteAltitudeWhenHealthServicesNeverReportsElevation() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(
                timestampMs = 10_000L,
                lat = 37.5,
                lng = 127.0,
                altitude = 100.0,
                accuracy = 5.0,
            ),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 11_000L,
            routePoint = WearRoutePoint(
                timestampMs = 20_000L,
                lat = 37.501,
                lng = 127.0,
                altitude = 106.0,
                accuracy = 5.0,
            ),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 21_000L,
            routePoint = WearRoutePoint(
                timestampMs = 30_000L,
                lat = 37.502,
                lng = 127.0,
                altitude = 103.0,
                accuracy = 5.0,
            ),
        )

        val snapshot = accumulator.snapshot()
        assertEquals(null, snapshot.healthElevationGainMeters)
        // +6m then -3m: only the positive delta counts toward gain.
        assertEquals(6.0, snapshot.elevationGainMeters!!, 0.0001)
    }

    @Test
    fun elevationGainIsNullWithoutAltitudeDataOrHealthServices() {
        val accumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = 10_000L,
            startedAtElapsedRealtimeMs = 1_000L,
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 1_000L,
            routePoint = WearRoutePoint(timestampMs = 10_000L, lat = 37.5665, lng = 126.9780),
        )
        accumulator.applyMetricUpdate(
            elapsedRealtimeMs = 61_000L,
            routePoint = WearRoutePoint(timestampMs = 70_000L, lat = 37.5680, lng = 126.9780),
        )

        val snapshot = accumulator.snapshot()
        // A real (non-altitude) route still produces distance — elevation must stay null rather
        // than a fabricated 0.0, since "no altitude data" isn't the same claim as "flat route".
        assertEquals(true, snapshot.distanceMeters > 150.0)
        assertEquals(null, snapshot.elevationGainMeters)
    }

    @Test
    fun restoresHealthServicesElevationFromASnapshotRoundTrip() {
        val accumulator = WearExerciseMetricAccumulator.fromSnapshot(
            snapshot = WearExerciseSessionSnapshot(
                status = WearExerciseSessionStatus.ACTIVE,
                startedAtWallClockMs = 10_000L,
                activeDurationMs = 40_000L,
                healthElevationGainMeters = 45.0,
            ),
            startedAtElapsedRealtimeMs = 1_000L,
        )

        assertEquals(45.0, accumulator.snapshot().elevationGainMeters!!, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 2_000L, healthElevationGainMeters = 30.0)
        assertEquals(45.0, accumulator.snapshot().elevationGainMeters!!, 0.0001)

        accumulator.applyMetricUpdate(elapsedRealtimeMs = 3_000L, healthElevationGainMeters = 60.0)
        assertEquals(60.0, accumulator.snapshot().elevationGainMeters!!, 0.0001)
    }
}
