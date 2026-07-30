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
    fun snapshotExposesCurrentPaceDerivedFromLiveDistanceSamples() {
        state.start()
        now += 40_000L

        state.updateLiveMetrics(
            distanceKm = 0.40,
            distanceSamples = listOf(
                WearDistanceSample(timestampMs = 0L, distanceKm = 0.0),
                WearDistanceSample(timestampMs = 40_000L, distanceKm = 0.40),
            ),
        )

        val snapshot = state.snapshot()
        assertEquals(100, snapshot.currentPaceSecPerKm)
        assertEquals("1'40\"", snapshot.currentPaceText)
    }

    // --- W5c current-pace pure function -----------------------------------------------------

    @Test
    fun currentPaceUsesTheNewestAndOldestSampleInsideTheTrailingWindow() {
        val samples = listOf(
            WearDistanceSample(timestampMs = 0L, distanceKm = 0.0),
            WearDistanceSample(timestampMs = 10_000L, distanceKm = 0.10),
            WearDistanceSample(timestampMs = 20_000L, distanceKm = 0.20),
            WearDistanceSample(timestampMs = 30_000L, distanceKm = 0.30),
            WearDistanceSample(timestampMs = 40_000L, distanceKm = 0.40),
        )

        // Window of 40s ending at the newest sample (40_000L) reaches back to 0L, so
        // oldest=0.0km@0ms, newest=0.40km@40_000ms -> 40s / 0.4km = 100s/km.
        assertEquals(100, currentPaceSecPerKm(samples, nowMs = 40_000L, windowMs = 40_000L))
    }

    @Test
    fun currentPaceExcludesSamplesOutsideTheTrailingWindow() {
        val samples = listOf(
            WearDistanceSample(timestampMs = 0L, distanceKm = 0.0),
            WearDistanceSample(timestampMs = 10_000L, distanceKm = 0.30), // fast start, outside the window
            WearDistanceSample(timestampMs = 50_000L, distanceKm = 0.40),
            WearDistanceSample(timestampMs = 60_000L, distanceKm = 0.50),
            WearDistanceSample(timestampMs = 70_000L, distanceKm = 0.60),
            WearDistanceSample(timestampMs = 80_000L, distanceKm = 0.70),
        )

        // Window [40_000, 80_000]: the oldest sample inside is 50_000L@0.40km (10_000L@0.30km
        // falls outside it), newest is 80_000L@0.70km -> 30s / 0.30km = 100s/km. If the excluded
        // fast-start sample leaked in, the pace would come out faster than this.
        assertEquals(100, currentPaceSecPerKm(samples, nowMs = 80_000L, windowMs = 40_000L))
    }

    @Test
    fun currentPaceIsNullWhenTheNewestSampleIsOlderThanTheWindow() {
        val samples = listOf(
            WearDistanceSample(timestampMs = 0L, distanceKm = 0.0),
            WearDistanceSample(timestampMs = 10_000L, distanceKm = 0.10),
        )

        // "now" is 50s past the newest sample, further than the 40s window — treat as stopped
        // rather than reporting a stale pace.
        assertNull(currentPaceSecPerKm(samples, nowMs = 60_000L, windowMs = 40_000L))
    }

    @Test
    fun currentPaceIsNullWhenDistanceBarelyMovesInsideTheWindow() {
        val samples = listOf(
            WearDistanceSample(timestampMs = 0L, distanceKm = 0.500),
            WearDistanceSample(timestampMs = 40_000L, distanceKm = 0.5001),
        )

        assertNull(currentPaceSecPerKm(samples, nowMs = 40_000L, windowMs = 40_000L))
    }

    @Test
    fun currentPaceRoundsSecondsPerKilometre() {
        val samples = listOf(
            WearDistanceSample(timestampMs = 0L, distanceKm = 0.0),
            WearDistanceSample(timestampMs = 40_000L, distanceKm = 0.13),
        )

        // 40s / 0.13km = 307.69... -> 308
        assertEquals(308, currentPaceSecPerKm(samples, nowMs = 40_000L, windowMs = 40_000L))
    }

    @Test
    fun currentPaceIsNullWithFewerThanTwoSamples() {
        assertNull(currentPaceSecPerKm(emptyList(), nowMs = 0L))
        assertNull(
            currentPaceSecPerKm(
                listOf(WearDistanceSample(timestampMs = 0L, distanceKm = 0.0)),
                nowMs = 0L,
            ),
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

    // --- W5b heart-zone departure alert tracker ---------------------------------------------

    @Test
    fun establishesHomeZoneAfterStableSixtySecondsThenAlertsUpAfterTwentySecondDeparture() {
        val tracker = WearHeartZoneAlertTracker()

        assertNull(tracker.onHeartRate(125, 0L))
        assertNull(tracker.onHeartRate(125, 59_000L))
        assertNull(tracker.onHeartRate(125, 60_000L)) // zone 2 stable 60s -> home established

        assertNull(tracker.onHeartRate(165, 61_000L)) // departs to zone 4, timer starts
        assertNull(tracker.onHeartRate(165, 75_000L)) // 14s < 20s persistence threshold
        assertEquals(
            WearHeartZoneAlertDirection.UP,
            tracker.onHeartRate(165, 82_000L), // 21s >= 20s -> fires
        )
    }

    @Test
    fun alertsDownWhenTheNewZoneIsBelowHome() {
        val tracker = WearHeartZoneAlertTracker()
        tracker.seedHomeZone(bpm = 165, nowMs = 0L) // home zone 4

        assertNull(tracker.onHeartRate(125, 10_000L))
        assertEquals(
            WearHeartZoneAlertDirection.DOWN,
            tracker.onHeartRate(125, 31_000L), // 21s persisted
        )
    }

    @Test
    fun doesNotAlertOnBriefSpikesThatReturnHomeBeforePersistenceThreshold() {
        val tracker = WearHeartZoneAlertTracker()
        tracker.seedHomeZone(bpm = 125, nowMs = 0L) // home zone 2

        assertNull(tracker.onHeartRate(165, 10_000L)) // spike starts
        assertNull(tracker.onHeartRate(165, 20_000L)) // 10s spike, short of 20s
        assertNull(tracker.onHeartRate(125, 25_000L)) // back home before the alert threshold

        assertNull(tracker.onHeartRate(165, 100_000L)) // a second, separate brief spike
        assertNull(tracker.onHeartRate(165, 115_000L)) // 15s, still short of 20s
    }

    @Test
    fun enforcesCooldownBetweenAlertsThenAllowsAnotherOnceItElapses() {
        val tracker = WearHeartZoneAlertTracker()
        tracker.seedHomeZone(bpm = 125, nowMs = 0L) // home zone 2

        assertNull(tracker.onHeartRate(165, 10_000L))
        assertEquals(WearHeartZoneAlertDirection.UP, tracker.onHeartRate(165, 31_000L)) // first alert

        assertNull(tracker.onHeartRate(125, 35_000L)) // back home, departure episode resets
        assertNull(tracker.onHeartRate(165, 40_000L)) // departs again
        // 21s persisted (61_000 - 40_000) but only 30s since the last alert -> cooldown suppresses.
        assertNull(tracker.onHeartRate(165, 61_000L))
        // 61s since the last alert (92_000 - 31_000) -> cooldown has elapsed, fires again.
        assertEquals(WearHeartZoneAlertDirection.UP, tracker.onHeartRate(165, 92_000L))
    }

    @Test
    fun sustainedNewZoneQuietlyBecomesTheNewHomeWithoutARepeatAlert() {
        val tracker = WearHeartZoneAlertTracker()
        tracker.seedHomeZone(bpm = 125, nowMs = 0L) // home zone 2

        assertNull(tracker.onHeartRate(165, 10_000L))
        assertEquals(WearHeartZoneAlertDirection.UP, tracker.onHeartRate(165, 31_000L))
        // Still in zone 4 60s after the departure started (10_000L) -> quietly re-baselines home
        // to zone 4 instead of firing again.
        assertNull(tracker.onHeartRate(165, 70_000L))
        // Now stable in the (new) home zone -> no alert.
        assertNull(tracker.onHeartRate(165, 71_000L))
    }

    @Test
    fun seedingEstablishesHomeZoneImmediatelyWithoutItselfFiringAnAlert() {
        val tracker = WearHeartZoneAlertTracker()

        tracker.seedHomeZone(bpm = 145, nowMs = 500_000L) // restore mid-run already in zone 3

        assertNull(tracker.onHeartRate(165, 500_001L)) // departure just starting
        assertNull(tracker.onHeartRate(165, 510_000L)) // ~10s, short of the 20s threshold
        assertEquals(
            WearHeartZoneAlertDirection.UP,
            tracker.onHeartRate(165, 521_000L), // ~21s persisted -> fires as normal, no delay
        )
    }

    @Test
    fun doesNotAlertWhileNoHomeZoneHasBeenEstablishedYet() {
        val tracker = WearHeartZoneAlertTracker()

        assertNull(tracker.onHeartRate(125, 0L))
        assertNull(tracker.onHeartRate(165, 5_000L)) // zone changes before 60s stability -> no home yet, no alert
        assertNull(tracker.onHeartRate(165, 10_000L))
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
