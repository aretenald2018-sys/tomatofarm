package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearRunUiStateTest {
    private var now = 1_000L
    private val state = WearRunUiState { now }

    @Test
    fun advancesRunningSessionThroughPauseResumeSummaryAndReset() {
        state.start()
        now += 65_000L

        var snapshot = state.snapshot()
        assertEquals(WearRunUiScreen.ACTIVE, snapshot.screen)
        assertEquals("01:05", snapshot.durationText)
        assertEquals("0.00", snapshot.distanceText)
        assertEquals("-- bpm", snapshot.heartRateText)

        state.pause()
        now += 30_000L
        snapshot = state.snapshot()
        assertEquals(WearRunUiScreen.PAUSED, snapshot.screen)
        assertEquals("01:05", snapshot.durationText)

        state.resume()
        now += 15_000L
        state.updateMetrics(distanceKm = 0.4, heartRateBpm = 142)
        snapshot = state.snapshot()
        assertEquals(WearRunUiScreen.ACTIVE, snapshot.screen)
        assertEquals("01:20", snapshot.durationText)
        assertEquals("0.40", snapshot.distanceText)
        assertEquals("3'20\"", snapshot.paceText)
        assertEquals("142 bpm", snapshot.heartRateText)

        state.finish()
        now += 40_000L
        snapshot = state.snapshot()
        assertEquals(WearRunUiScreen.SUMMARY, snapshot.screen)
        assertEquals("01:20", snapshot.durationText)
        assertEquals("0.40 km", snapshot.distanceSummaryText)

        state.reset()
        snapshot = state.snapshot()
        assertEquals(WearRunUiScreen.READY, snapshot.screen)
        assertEquals("00:00", snapshot.durationText)
    }

    @Test
    fun restoresAnActiveSessionWhenTheWorkoutScreenIsReopened() {
        state.restoreFromSession(
            WearExerciseSessionSnapshot(
                status = WearExerciseSessionStatus.ACTIVE,
                startedAtWallClockMs = 10_000L,
                activeDurationMs = 45_000L,
                distanceMeters = 360.0,
                routePoints = listOf(
                    WearRoutePoint(timestampMs = 20_000L, lat = 37.52070, lng = 127.11900),
                ),
            ),
        )

        now += 5_000L
        val snapshot = state.snapshot()

        assertEquals(WearRunUiScreen.ACTIVE, snapshot.screen)
        assertEquals("00:50", snapshot.durationText)
        assertEquals("0.36", snapshot.distanceText)
        assertTrue(snapshot.routeProjection.hasCurrentLocation)
        assertEquals(1, snapshot.routeProjection.geoPoints.size)
    }

    @Test
    fun rejectsInvalidDisplayMetrics() {
        state.start()
        state.updateMetrics(distanceKm = Double.POSITIVE_INFINITY, heartRateBpm = 999)

        val snapshot = state.snapshot()
        assertEquals("0.00", snapshot.distanceText)
        assertEquals("-- bpm", snapshot.heartRateText)
    }

    @Test
    fun summarySessionUsesAtLeastOneSecondForVeryShortHealthDurations() {
        val session = buildWearRunSessionForSummary(
            exerciseSnapshot = WearExerciseSessionSnapshot(
                startedAtWallClockMs = 10_000L,
                activeDurationMs = 450L,
            ),
            uiSnapshot = WearRunUiSnapshot(
                screen = WearRunUiScreen.SUMMARY,
                durationMs = 300L,
                distanceKm = 0.0,
                heartRateBpm = null,
            ),
            nowWallClockMs = 10_500L,
            dateKeyFor = { "2026-07-09" },
        )

        assertEquals(10_000L, session.startedAtMs)
        assertEquals(11_000L, session.endedAtMs)
        assertEquals(1L, session.toPayload().getOrThrow().summary.durationSec)
    }

    @Test
    fun summarySessionEndsAfterPostResumeGpsSamples() {
        val session = buildWearRunSessionForSummary(
            exerciseSnapshot = WearExerciseSessionSnapshot(
                startedAtWallClockMs = 10_000L,
                activeDurationMs = 80_000L,
                routePoints = listOf(
                    WearRoutePoint(timestampMs = 10_000L, lat = 37.5, lng = 127.0),
                    WearRoutePoint(timestampMs = 105_000L, lat = 37.6, lng = 127.1),
                ),
            ),
            uiSnapshot = WearRunUiSnapshot(
                screen = WearRunUiScreen.SUMMARY,
                durationMs = 80_000L,
                distanceKm = 1.0,
                heartRateBpm = 140,
            ),
            nowWallClockMs = 110_000L,
            dateKeyFor = { "2026-07-10" },
        )

        assertEquals(110_000L, session.endedAtMs)
        val payload = session.toPayload().getOrThrow()
        assertEquals(80L, payload.summary.durationSec)
        assertEquals(2, payload.summary.route.size)
    }

    @Test
    fun derivesLivePageMetricsFromSamples() {
        state.start()
        now += 300_000L

        state.updateLiveMetrics(
            distanceKm = 0.75,
            distanceSamples = listOf(
                WearDistanceSample(timestampMs = 1_000L, distanceKm = 0.0),
                WearDistanceSample(timestampMs = 61_000L, distanceKm = 0.12),
                WearDistanceSample(timestampMs = 121_000L, distanceKm = 0.25),
                WearDistanceSample(timestampMs = 181_000L, distanceKm = 0.42),
                WearDistanceSample(timestampMs = 241_000L, distanceKm = 0.62),
                WearDistanceSample(timestampMs = 301_000L, distanceKm = 0.75),
            ),
            heartRateSamples = listOf(
                HeartRateSample(timestampMs = 1_000L, bpm = 110),
                HeartRateSample(timestampMs = 61_000L, bpm = 130),
                HeartRateSample(timestampMs = 121_000L, bpm = 145),
                HeartRateSample(timestampMs = 181_000L, bpm = 165),
                HeartRateSample(timestampMs = 241_000L, bpm = 185),
            ),
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.56650, lng = 126.97800),
                WearRoutePoint(timestampMs = 61_000L, lat = 37.56685, lng = 126.97840),
                WearRoutePoint(timestampMs = 121_000L, lat = 37.56720, lng = 126.97890),
            ),
        )

        val snapshot = state.snapshot()

        assertEquals("6'40\"", snapshot.averagePaceText)
        assertEquals("5'00\"", snapshot.fastestPaceText)
        // W3 pace-consistency slice: buildPaceTrend now rounds (not truncates) seconds/km, so
        // 60/0.13=461.54 -> 462 and 60/0.17=352.94 -> 353 (previously 461 and 352).
        assertEquals(listOf(500, 462, 353, 300, 462), snapshot.paceTrend.map { it.secondsPerKm })

        assertEquals(147, snapshot.averageHeartRateBpm)
        assertEquals(185, snapshot.maxHeartRateBpm)
        assertEquals(listOf(110, 130, 145, 165, 185), snapshot.heartRateTrend.map { it.bpm })
        assertEquals(listOf("5", "4", "3", "2", "1"), snapshot.heartZoneRows.map { it.zoneLabel })
        assertEquals(
            listOf(0L, 60_000L, 60_000L, 60_000L, 60_000L),
            snapshot.heartZoneRows.map { it.durationMs },
        )

        assertTrue(snapshot.routeProjection.isReady)
        assertEquals(3, snapshot.routeProjection.points.size)
        assertEquals(3, snapshot.routeProjection.geoPoints.size)
        assertTrue(
            snapshot.routeProjection.points.all { point ->
                point.x in 0.0..1.0 && point.y in 0.0..1.0
            },
        )
    }

    @Test
    fun derivesHeartZoneDurationsFromTenSecondSamples() {
        state.start()
        now += 50_000L

        state.updateLiveMetrics(
            distanceKm = 0.5,
            distanceSamples = emptyList(),
            heartRateSamples = listOf(
                HeartRateSample(timestampMs = 1_000L, bpm = 110),
                HeartRateSample(timestampMs = 11_000L, bpm = 130),
                HeartRateSample(timestampMs = 21_000L, bpm = 145),
                HeartRateSample(timestampMs = 31_000L, bpm = 165),
                HeartRateSample(timestampMs = 41_000L, bpm = 185),
            ),
            routePoints = emptyList(),
        )

        val snapshot = state.snapshot()

        assertEquals(listOf("5", "4", "3", "2", "1"), snapshot.heartZoneRows.map { it.zoneLabel })
        assertEquals(
            listOf(0L, 10_000L, 10_000L, 10_000L, 10_000L),
            snapshot.heartZoneRows.map { it.durationMs },
        )
    }

    @Test
    fun fallsBackWhenLiveSamplesAreEmpty() {
        state.start()
        now += 75_000L

        state.updateLiveMetrics(
            distanceKm = 0.0,
            distanceSamples = emptyList(),
            heartRateSamples = emptyList(),
            routePoints = emptyList(),
        )

        val snapshot = state.snapshot()

        assertEquals("--", snapshot.averagePaceText)
        assertEquals("--", snapshot.fastestPaceText)
        assertTrue(snapshot.paceTrend.isEmpty())

        assertNull(snapshot.averageHeartRateBpm)
        assertNull(snapshot.maxHeartRateBpm)
        assertTrue(snapshot.heartRateTrend.isEmpty())
        assertTrue(snapshot.heartZoneRows.isEmpty())

        assertFalse(snapshot.routeProjection.isReady)
        assertTrue(snapshot.routeProjection.points.isEmpty())
        assertTrue(snapshot.routeProjection.geoPoints.isEmpty())
    }

    @Test
    fun rejectsInvalidLiveSamples() {
        state.start()
        now += 120_000L

        state.updateLiveMetrics(
            distanceKm = 1.0,
            distanceSamples = listOf(
                WearDistanceSample(timestampMs = -1L, distanceKm = 0.0),
                WearDistanceSample(timestampMs = 1_000L, distanceKm = 0.0),
                WearDistanceSample(timestampMs = 61_000L, distanceKm = Double.NaN),
                WearDistanceSample(timestampMs = 121_000L, distanceKm = 1.0),
            ),
            heartRateSamples = listOf(
                HeartRateSample(timestampMs = 1_000L, bpm = 29),
                HeartRateSample(timestampMs = 61_000L, bpm = 150),
                HeartRateSample(timestampMs = 121_000L, bpm = 241),
            ),
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = Double.NaN, lng = 126.97800),
                WearRoutePoint(timestampMs = 61_000L, lat = 91.0, lng = 126.97810),
                WearRoutePoint(timestampMs = 121_000L, lat = 37.56650, lng = 126.97800),
                WearRoutePoint(timestampMs = 181_000L, lat = 37.56660, lng = 126.97815),
            ),
        )

        val snapshot = state.snapshot()

        assertTrue(snapshot.paceTrend.isEmpty())
        assertEquals(150, snapshot.averageHeartRateBpm)
        assertEquals(150, snapshot.maxHeartRateBpm)
        assertEquals(listOf(150), snapshot.heartRateTrend.map { it.bpm })
        assertTrue(snapshot.heartZoneRows.isEmpty())
        assertEquals(2, snapshot.routeProjection.points.size)
        assertTrue(snapshot.routeProjection.isReady)
        assertTrue(
            snapshot.routeProjection.points.all { point ->
                point.x in 0.0..1.0 && point.y in 0.0..1.0
            },
        )
    }

    @Test
    fun handlesDegenerateRouteProjectionInputs() {
        state.start()
        now += 120_000L

        state.updateLiveMetrics(
            distanceKm = 0.0,
            distanceSamples = emptyList(),
            heartRateSamples = emptyList(),
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.56650, lng = 126.97800),
            ),
        )

        var snapshot = state.snapshot()
        assertFalse(snapshot.routeProjection.isReady)
        assertTrue(snapshot.routeProjection.points.isEmpty())
        assertEquals(1, snapshot.routeProjection.geoPoints.size)
        assertTrue(snapshot.routeProjection.hasCurrentLocation)

        state.updateLiveMetrics(
            distanceKm = 0.0,
            distanceSamples = emptyList(),
            heartRateSamples = emptyList(),
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.56650, lng = 126.97800),
                WearRoutePoint(timestampMs = 11_000L, lat = 37.56650, lng = 126.97800),
            ),
        )

        snapshot = state.snapshot()
        assertTrue(snapshot.routeProjection.isReady)
        assertEquals(2, snapshot.routeProjection.points.size)
        assertTrue(
            snapshot.routeProjection.points.all { point ->
                point.x == 0.5 && point.y == 0.5
            },
        )
    }

    @Test
    fun roundTripsRecoverableRunningSnapshotForPersistence() {
        val snapshot = WearExerciseSessionSnapshot(
            status = WearExerciseSessionStatus.ACTIVE,
            startedAtWallClockMs = 10_000L,
            distanceMeters = 24.0,
            latestHeartRateBpm = 142,
            activeDurationMs = 70_000L,
            distanceSamples = listOf(WearDistanceSample(timestampMs = 20_000L, distanceKm = 0.02)),
            heartRateSamples = listOf(HeartRateSample(timestampMs = 20_000L, bpm = 142)),
            routePoints = listOf(
                WearRoutePoint(
                    timestampMs = 20_000L,
                    lat = 37.5665,
                    lng = 126.9780,
                    accuracy = 8.0,
                    segmentId = 0,
                ),
                WearRoutePoint(
                    timestampMs = 80_000L,
                    lat = 37.5668,
                    lng = 126.9783,
                    accuracy = 9.0,
                    segmentId = 1,
                    gapBefore = true,
                    gapReason = "service-restart",
                ),
            ),
            message = "GPS direct",
        )

        val decoded = WearExerciseSessionPersistence.decode(
            WearExerciseSessionPersistence.encode(snapshot),
        )

        assertEquals(snapshot, decoded)
        assertTrue(WearExerciseSessionPersistence.shouldPersist(snapshot))
    }

    @Test
    fun doesNotPersistIdleOrInvalidRunningSnapshots() {
        assertFalse(
            WearExerciseSessionPersistence.shouldPersist(
                WearExerciseSessionSnapshot(
                    status = WearExerciseSessionStatus.IDLE,
                    startedAtWallClockMs = 10_000L,
                ),
            ),
        )
        assertFalse(
            WearExerciseSessionPersistence.shouldPersist(
                WearExerciseSessionSnapshot(
                    status = WearExerciseSessionStatus.ACTIVE,
                    startedAtWallClockMs = 0L,
                ),
            ),
        )
        assertNull(WearExerciseSessionPersistence.decode("{not-json"))
    }
}
