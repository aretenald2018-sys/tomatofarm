package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WearStrengthSessionPersistenceTest {
    @Test
    fun encodeDecodeRoundTripsStateAndHrSamples() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(
                WearStrengthExercise(
                    exerciseId = "bench-press",
                    name = "바벨 벤치프레스",
                    muscleId = "chest",
                    movementId = "barbell-press",
                    stepKg = 2.5,
                    lastSession = null,
                ),
            )
            .logSet(cardIdx = 0, setIdx = 0, now = 2_000L)
        val hrSamples = listOf(
            HeartRateSample(timestampMs = 1_000L, bpm = 100),
            HeartRateSample(timestampMs = 2_000L, bpm = 110),
        )

        val encoded = WearStrengthSessionPersistence.encode(state, hrSamples)
        val restored = WearStrengthSessionPersistence.decode(encoded)

        assertEquals(state, restored?.first)
        assertEquals(hrSamples, restored?.second)
    }

    @Test
    fun encodeDecodeRoundTripsARunningRestTimer() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(
                WearStrengthExercise(
                    exerciseId = "bench-press",
                    name = "바벨 벤치프레스",
                    muscleId = "chest",
                    movementId = "barbell-press",
                    stepKg = 2.5,
                    lastSession = null,
                ),
            )
            .logSet(cardIdx = 0, setIdx = 0, now = 2_000L)
            .startRest(now = 2_000L)

        val encoded = WearStrengthSessionPersistence.encode(state, emptyList())
        val restored = WearStrengthSessionPersistence.decode(encoded)

        assertEquals(state, restored?.first)
        assertEquals(2_000L + WearStrengthSessionState.DEFAULT_REST_MS, restored?.first?.restEndsAtMs)
    }

    @Test
    fun decodeReturnsNullForNullBlankOrGarbageInput() {
        assertNull(WearStrengthSessionPersistence.decode(null))
        assertNull(WearStrengthSessionPersistence.decode(""))
        assertNull(WearStrengthSessionPersistence.decode("not json at all"))
    }

    @Test
    fun decodeReturnsNullForWrongVersion() {
        val encoded = """{"version":99,"state":{},"hrSamples":[]}"""
        assertNull(WearStrengthSessionPersistence.decode(encoded))
    }

    @Test
    fun decodeFiltersOutOfRangeHrSamplesButKeepsValidState() {
        val stateJson = WearStrengthSessionState().start(1_000L).toJsonObject()
        val raw = """
            {
              "version": 1,
              "state": $stateJson,
              "hrSamples": [
                { "timestampMs": 1000, "bpm": 100 },
                { "timestampMs": 2000, "bpm": 5 },
                { "timestampMs": -1, "bpm": 100 }
              ]
            }
        """.trimIndent()

        val restored = WearStrengthSessionPersistence.decode(raw)
        assertEquals(listOf(HeartRateSample(timestampMs = 1_000L, bpm = 100)), restored?.second)
    }
}
