package com.lifestreak.wear.workout

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearRunPayloadTest {
    @Test
    fun buildsPayloadWithTenSecondHeartRateBuckets() {
        val session = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 31_000L,
            distanceMeters = 500.0,
            heartRateSamples = listOf(
                HeartRateSample(timestampMs = 1_000L, bpm = 100),
                HeartRateSample(timestampMs = 5_000L, bpm = 190),
                HeartRateSample(timestampMs = 13_000L, bpm = 140),
                HeartRateSample(timestampMs = 20_000L, bpm = 160),
                HeartRateSample(timestampMs = 21_000L, bpm = 260),
                HeartRateSample(timestampMs = 40_000L, bpm = 150),
            ),
        )

        val payload = session.toPayload().getOrThrow()

        assertEquals(WearWorkoutType.RUNNING, payload.workoutType)
        assertEquals("wear", payload.source)
        assertEquals("2026-07-06", payload.dateKey)
        assertEquals(30L, payload.summary.durationSec)
        assertEquals(0.5, payload.summary.distanceKm, 0.0001)
        assertEquals(60, payload.summary.avgPaceSecPerKm)
        assertEquals(148, payload.summary.avgHeartRateBpm)
        assertEquals(190, payload.summary.maxHeartRateBpm)
        assertEquals(
            listOf(
                HeartRateSample(timestampMs = 1_000L, bpm = 145),
                HeartRateSample(timestampMs = 11_000L, bpm = 150),
            ),
            payload.summary.samples10s,
        )

        val json = JSONObject(payload.toJsonString())
        assertEquals(WearWorkoutPayload.PAYLOAD_VERSION, json.getInt("payloadVersion"))
        assertEquals("running", json.getString("type"))
        assertEquals("wear", json.getString("source"))
        assertEquals(31_000L, json.getLong("endedAt"))
        assertEquals(2, json.getJSONArray("samples10s").length())
        assertEquals(145, json.getJSONArray("samples10s").getJSONObject(0).getInt("bpm"))

        // W3 pace-consistency slice: unrounded distanceMeters travels alongside distanceKm, both
        // at the top level and inside routeSummary.
        assertEquals(500.0, payload.summary.distanceMeters, 0.0001)
        assertEquals(500.0, json.getDouble("distanceMeters"), 0.0001)
        assertEquals(500.0, json.getJSONObject("routeSummary").getDouble("distanceMeters"), 0.0001)
    }

    @Test
    fun acceptsMissingDistanceAndHeartRateWithoutInventingMetrics() {
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 11_000L,
            distanceMeters = 0.0,
            heartRateSamples = emptyList(),
        ).toPayload().getOrThrow()

        assertEquals(10L, payload.summary.durationSec)
        assertEquals(0.0, payload.summary.distanceKm, 0.0001)
        assertNull(payload.summary.avgPaceSecPerKm)
        assertNull(payload.summary.avgHeartRateBpm)
        assertNull(payload.summary.maxHeartRateBpm)
        assertTrue(payload.summary.samples10s.isEmpty())
    }

    @Test
    fun includesGpsRouteAndUsesRouteDistanceWhenDistanceMetricIsMissing() {
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 21_000L,
            distanceMeters = 0.0,
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.5665, lng = 126.9780, altitude = 34.1, bearing = 91.2),
                WearRoutePoint(timestampMs = 11_000L, lat = 37.5666, lng = 126.9790, altitude = 35.0, bearing = 94.4),
            ),
        ).toPayload().getOrThrow()

        assertEquals(2, payload.summary.route.size)
        assertEquals("wear-gps", payload.summary.routeSummary.source)
        assertEquals(2, payload.summary.routeSummary.pointCount)
        assertEquals(1, payload.summary.routeSummary.segmentCount)
        assertEquals(0, payload.summary.routeSummary.gapCount)
        assertFalse(payload.summary.routeSummary.interrupted)
        assertTrue(payload.summary.distanceKm > 0.0)
        assertTrue((payload.summary.avgPaceSecPerKm ?: 0) > 0)

        val json = JSONObject(payload.toJsonString())
        assertEquals(2, json.getJSONArray("route").length())
        assertEquals("wear-gps", json.getJSONObject("routeSummary").getString("source"))
        assertEquals(2, json.getJSONObject("routeSummary").getInt("pointCount"))
        assertFalse(json.isNull("avgPaceSecPerKm"))
    }

    @Test
    fun includesGpsGapMetadataAndRouteSummaryCounts() {
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 41_000L,
            distanceMeters = 600.0,
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.5665, lng = 126.9780, segmentId = 0),
                WearRoutePoint(timestampMs = 11_000L, lat = 37.5666, lng = 126.9790, segmentId = 0),
                WearRoutePoint(
                    timestampMs = 21_000L,
                    lat = 37.5675,
                    lng = 126.9800,
                    segmentId = 1,
                    gapBefore = true,
                    gapReason = "gps-timeout",
                ),
                WearRoutePoint(timestampMs = 31_000L, lat = 37.5676, lng = 126.9810, segmentId = 1),
            ),
        ).toPayload().getOrThrow()

        assertEquals(4, payload.summary.route.size)
        assertEquals(4, payload.summary.routeSummary.pointCount)
        assertEquals(2, payload.summary.routeSummary.segmentCount)
        assertEquals(1, payload.summary.routeSummary.gapCount)
        assertTrue(payload.summary.routeSummary.interrupted)

        val json = JSONObject(payload.toJsonString())
        val route = json.getJSONArray("route")
        assertEquals(4, route.length())
        assertEquals(0, route.getJSONObject(0).getInt("segmentId"))
        assertFalse(route.getJSONObject(0).getBoolean("gapBefore"))
        assertTrue(route.getJSONObject(0).isNull("gapReason"))

        val gapPoint = route.getJSONObject(2)
        assertEquals(1, gapPoint.getInt("segmentId"))
        assertTrue(gapPoint.getBoolean("gapBefore"))
        assertEquals("gps-timeout", gapPoint.getString("gapReason"))

        val routeSummary = json.getJSONObject("routeSummary")
        assertEquals(2, routeSummary.getInt("segmentCount"))
        assertEquals(1, routeSummary.getInt("gapCount"))
        assertTrue(routeSummary.getBoolean("interrupted"))
    }

    @Test
    fun zeroFilteredDistanceDoesNotFallBackToNoisyRouteGeometry() {
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 61_000L,
            distanceMeters = 0.0,
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.5665, lng = 126.9780, segmentId = 0),
                WearRoutePoint(timestampMs = 11_000L, lat = 37.5666, lng = 126.9780, segmentId = 0),
                WearRoutePoint(
                    timestampMs = 21_000L,
                    lat = 35.1796,
                    lng = 129.0756,
                    segmentId = 1,
                    gapBefore = true,
                    gapReason = "gps-timeout",
                ),
                WearRoutePoint(timestampMs = 31_000L, lat = 35.1797, lng = 129.0756, segmentId = 1),
                WearRoutePoint(timestampMs = 41_000L, lat = 33.4996, lng = 126.5312, segmentId = 2),
                WearRoutePoint(timestampMs = 51_000L, lat = 33.4997, lng = 126.5312, segmentId = 2),
            ),
        ).toPayload().getOrThrow()

        assertEquals(0.0, payload.summary.distanceKm, 0.0001)
        assertEquals(3, payload.summary.routeSummary.segmentCount)
        assertEquals(2, payload.summary.routeSummary.gapCount)
        assertTrue(payload.summary.routeSummary.interrupted)
    }

    @Test
    fun sparseGpsTimestampsRemainOneContinuousRouteWithoutAnExplicitPause() {
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 101_000L,
            distanceMeters = 0.0,
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.5665, lng = 126.9780),
                WearRoutePoint(timestampMs = 11_000L, lat = 37.5666, lng = 126.9781),
                WearRoutePoint(timestampMs = 81_000L, lat = 37.5700, lng = 126.9800),
                WearRoutePoint(timestampMs = 91_000L, lat = 37.5701, lng = 126.9801),
            ),
        ).toPayload().getOrThrow()

        assertEquals(listOf(0, 0, 0, 0), payload.summary.route.map { it.segmentId })
        assertFalse(payload.summary.route[1].gapBefore)
        assertFalse(payload.summary.route[2].gapBefore)
        assertEquals(null, payload.summary.route[2].gapReason)
        assertEquals(1, payload.summary.routeSummary.segmentCount)
        assertEquals(0, payload.summary.routeSummary.gapCount)
        assertFalse(payload.summary.routeSummary.interrupted)
        assertTrue(payload.summary.distanceKm > 0.3)
        assertTrue(payload.summary.distanceKm < 0.5)
    }

    @Test
    fun fallbackRouteDistanceHardDropsLowAccuracyFixesLikeThePrimaryPath() {
        // W3 pace-consistency slice: confirmedMovementDistanceMeters() used to be more permissive
        // than the accumulator's confirmedMovementRoute() — it only fed accuracy into the error
        // radius formula instead of hard-dropping fixes worse than 15m, like the primary path
        // does. A weak-accuracy fix should now be excluded entirely, not just discounted.
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 21_000L,
            distanceMeters = 0.0,
            routePoints = listOf(
                WearRoutePoint(timestampMs = 1_000L, lat = 37.5, lng = 127.0, accuracy = 5.0),
                WearRoutePoint(timestampMs = 11_000L, lat = 37.500898, lng = 127.0, accuracy = 20.0),
            ),
        ).toPayload().getOrThrow()

        assertEquals(0.0, payload.summary.distanceKm, 0.0001)
    }

    @Test
    fun liveDisplayOnlyFieldsDoNotLeakIntoPhoneSavePayload() {
        var now = 1_000L
        val state = WearRunUiState { now }
        val distanceSamples = listOf(
            WearDistanceSample(timestampMs = 1_000L, distanceKm = 0.0),
            WearDistanceSample(timestampMs = 61_000L, distanceKm = 0.12),
            WearDistanceSample(timestampMs = 121_000L, distanceKm = 0.25),
            WearDistanceSample(timestampMs = 181_000L, distanceKm = 0.42),
            WearDistanceSample(timestampMs = 241_000L, distanceKm = 0.62),
            WearDistanceSample(timestampMs = 301_000L, distanceKm = 0.75),
        )
        val heartRateSamples = listOf(
            HeartRateSample(timestampMs = 1_000L, bpm = 110),
            HeartRateSample(timestampMs = 61_000L, bpm = 130),
            HeartRateSample(timestampMs = 121_000L, bpm = 145),
            HeartRateSample(timestampMs = 181_000L, bpm = 165),
            HeartRateSample(timestampMs = 241_000L, bpm = 185),
        )
        val routePoints = listOf(
            WearRoutePoint(timestampMs = 1_000L, lat = 37.56650, lng = 126.97800),
            WearRoutePoint(timestampMs = 61_000L, lat = 37.56685, lng = 126.97840),
            WearRoutePoint(timestampMs = 121_000L, lat = 37.56720, lng = 126.97890),
        )
        state.start()
        now += 300_000L
        state.updateLiveMetrics(
            distanceKm = 0.75,
            distanceSamples = distanceSamples,
            heartRateSamples = heartRateSamples,
            routePoints = routePoints,
        )

        val snapshot = state.snapshot()
        assertTrue(snapshot.heartZoneRows.isNotEmpty())
        assertTrue(snapshot.paceTrend.isNotEmpty())
        assertTrue(snapshot.heartRateTrend.isNotEmpty())
        assertTrue(snapshot.routeProjection.isReady)
        assertTrue(snapshot.averagePaceText.contains("'"))
        assertTrue(snapshot.fastestPaceText.contains("'"))

        val session = buildWearRunSessionForSummary(
            exerciseSnapshot = WearExerciseSessionSnapshot(
                startedAtWallClockMs = 1_000L,
                distanceMeters = 750.0,
                latestHeartRateBpm = 185,
                activeDurationMs = 300_000L,
                heartRateSamples = heartRateSamples,
                routePoints = routePoints,
            ),
            uiSnapshot = snapshot,
            nowWallClockMs = 301_000L,
            dateKeyFor = { "2026-07-09" },
        )

        val json = JSONObject(session.toPayload().getOrThrow().toJsonString())
        listOf(
            "durationSec",
            "distanceKm",
            "distanceMeters",
            "avgPaceSecPerKm",
            "avgHeartRateBpm",
            "maxHeartRateBpm",
            "samples10s",
            "route",
            "routeSummary",
        ).forEach { key ->
            assertTrue("missing phone-save key: $key", json.has(key))
        }
        listOf(
            "estimatedCaloriesKcal",
            "heartZoneRows",
            "paceTrend",
            "heartRateTrend",
            "routeProjection",
            "averagePaceText",
            "fastestPaceText",
        ).forEach { key ->
            assertFalse("display-only key leaked into phone-save payload: $key", json.has(key))
        }
    }

    @Test
    fun rejectsMalformedRunSessions() {
        assertTrue(
            WearRunSession(
                dateKey = "2026/07/06",
                startedAtMs = 1_000L,
                endedAtMs = 11_000L,
                distanceMeters = 100.0,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-99-99",
                startedAtMs = 1_000L,
                endedAtMs = 11_000L,
                distanceMeters = 100.0,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 11_000L,
                endedAtMs = 1_000L,
                distanceMeters = 100.0,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 11_000L,
                distanceMeters = -1.0,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 1_500L,
                distanceMeters = 100.0,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 11_000L,
                distanceMeters = Double.POSITIVE_INFINITY,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 1_000L + (7L * 60L * 60L * 1_000L),
                distanceMeters = 1_000.0,
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 11_000L,
                distanceMeters = 100.0,
                heartRateSamples = List(50_001) { index ->
                    HeartRateSample(timestampMs = 1_000L + index, bpm = 120)
                },
            ).toPayload().isFailure,
        )
        assertTrue(
            WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 1_000L + 25_001L * 500L,
                distanceMeters = 100.0,
                routePoints = List(25_001) { index ->
                    WearRoutePoint(timestampMs = 1_000L + index * 500L, lat = 37.0, lng = 126.0)
                },
            ).toPayload().isFailure,
        )
    }

    @Test
    fun preservesMoreThanLegacyTwoThousandOneHundredSixtyOneRoutePoints() {
        val route = List(2_162) { index ->
            WearRoutePoint(
                timestampMs = 1_000L + index * 1_000L,
                lat = 37.5 + index * 0.000001,
                lng = 127.0 + index * 0.000001,
            )
        }
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 1_000L + 2_162_000L,
            distanceMeters = 3_200.0,
            routePoints = route,
        ).toPayload().getOrThrow()

        assertEquals(route.size, payload.summary.route.size)
        assertEquals(route.first().lat, payload.summary.route.first().lat, 0.0)
        assertEquals(route.last().lng, payload.summary.route.last().lng, 0.0)
    }

    @Test
    fun acceptsExactlyTwentyFiveThousandRoutePoints() {
        val route = List(25_000) { index ->
            WearRoutePoint(
                timestampMs = 1_000L + index * 500L,
                lat = 37.5 + index * 0.000001,
                lng = 127.0 + index * 0.000001,
            )
        }
        val payload = WearRunSession(
            dateKey = "2026-07-06",
            startedAtMs = 1_000L,
            endedAtMs = 1_000L + 25_000L * 500L,
            distanceMeters = 10_000.0,
            routePoints = route,
        ).toPayload().getOrThrow()

        assertEquals(25_000, payload.summary.route.size)
    }

    @Test
    fun rejectsInvalidRoutePointsInsteadOfFilteringThem() {
        val invalidPoints = listOf(
            WearRoutePoint(timestampMs = 999L, lat = 37.5, lng = 127.0),
            WearRoutePoint(timestampMs = 11_001L, lat = 37.5, lng = 127.0),
            WearRoutePoint(timestampMs = 5_000L, lat = Double.NaN, lng = 127.0),
            WearRoutePoint(timestampMs = 5_000L, lat = 91.0, lng = 127.0),
            WearRoutePoint(timestampMs = 5_000L, lat = 37.5, lng = Double.POSITIVE_INFINITY),
            WearRoutePoint(timestampMs = 5_000L, lat = 37.5, lng = 181.0),
            WearRoutePoint(timestampMs = 5_000L, lat = 37.5, lng = 127.0, altitude = Double.NaN),
            WearRoutePoint(timestampMs = 5_000L, lat = 37.5, lng = 127.0, bearing = Double.NaN),
        )

        invalidPoints.forEachIndexed { index, invalidPoint ->
            val result = WearRunSession(
                dateKey = "2026-07-06",
                startedAtMs = 1_000L,
                endedAtMs = 11_000L,
                distanceMeters = 100.0,
                routePoints = listOf(invalidPoint),
            ).toPayload()

            assertTrue("invalid route point $index should fail", result.isFailure)
            assertTrue(
                "invalid route point $index should identify its index",
                result.exceptionOrNull()?.message?.contains("routePoints[0]") == true,
            )
        }
    }
}
