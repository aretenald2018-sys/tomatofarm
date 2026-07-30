package com.lifestreak.wear.workout

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearStrengthPayloadTest {
    private fun cardWithSets(exerciseId: String, sets: List<WearStrengthLoggedSet>): WearStrengthCard {
        return WearStrengthCard(
            exerciseId = exerciseId,
            name = "종목 $exerciseId",
            muscleId = "chest",
            movementId = "movement",
            stepKg = 2.5,
            draftKg = 20.0,
            draftReps = 10,
            draftRomPct = 100,
            loggedSets = sets,
        )
    }

    private fun session(cards: List<WearStrengthCard>, startedAtMs: Long = 1_700_000_000_000L, endedAtMs: Long = 1_700_000_600_000L): WearStrengthSession {
        return WearStrengthSession(startedAtMs = startedAtMs, endedAtMs = endedAtMs, cards = cards)
    }

    @Test
    fun toJsonStringMatchesPhase0SchemaKeys() {
        val loggedSet = WearStrengthLoggedSet(kg = 82.5, reps = 8, romPct = 100, completedAt = 1_700_000_300_000L)
        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("bench-press", listOf(loggedSet)))),
            avgHeartRateBpm = 118,
            maxHeartRateBpm = 140,
            samples10s = listOf(HeartRateSample(timestampMs = 1_700_000_000_000L, bpm = 118)),
        ).getOrThrow()

        val json = JSONObject(payload.toJsonString())
        assertEquals(1, json.getInt("payloadVersion"))
        assertEquals("strength", json.getString("type"))
        assertEquals("wear", json.getString("source"))
        assertTrue(json.getString("dateKey").matches(Regex("""\d{4}-\d{2}-\d{2}""")))
        assertEquals(1_700_000_000_000L, json.getLong("startedAt"))
        assertEquals(1_700_000_600_000L, json.getLong("endedAt"))
        assertEquals(600L, json.getLong("durationSec"))
        assertEquals(118, json.getInt("avgHeartRateBpm"))
        assertEquals(140, json.getInt("maxHeartRateBpm"))

        val entries = json.getJSONArray("entries")
        assertEquals(1, entries.length())
        val entry = entries.getJSONObject(0)
        assertEquals("bench-press", entry.getString("exerciseId"))
        assertEquals("chest", entry.getString("muscleId"))
        assertEquals("movement", entry.getString("movementId"))

        val sets = entry.getJSONArray("sets")
        assertEquals(1, sets.length())
        val set = sets.getJSONObject(0)
        assertEquals(82.5, set.getDouble("kg"), 0.0001)
        assertEquals(8, set.getInt("reps"))
        assertEquals(100, set.getInt("romPct"))
        assertEquals("main", set.getString("setType"))
        assertTrue(set.getBoolean("done"))
        assertEquals(1_700_000_300_000L, set.getLong("completedAt"))
    }

    @Test
    fun avgAndMaxHeartRateAreNullableInJson() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1_700_000_300_000L)
        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("squat", listOf(loggedSet)))),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        val json = JSONObject(payload.toJsonString())
        assertTrue(json.isNull("avgHeartRateBpm"))
        assertTrue(json.isNull("maxHeartRateBpm"))
        assertEquals(0, json.getJSONArray("samples10s").length())
    }

    @Test
    fun skipsCardsWithZeroLoggedSets() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1_700_000_300_000L)
        val payload = WearStrengthPayload.fromSession(
            session = session(
                listOf(
                    cardWithSets("empty-card", emptyList()),
                    cardWithSets("squat", listOf(loggedSet)),
                ),
            ),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        val entries = JSONObject(payload.toJsonString()).getJSONArray("entries")
        assertEquals(1, entries.length())
        assertEquals("squat", entries.getJSONObject(0).getString("exerciseId"))
    }

    @Test
    fun failsWhenNoEntryHasALoggedSet() {
        val result = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("empty-card", emptyList()))),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        )
        assertTrue(result.isFailure)
    }

    @Test
    fun enforcesEntryCountCap() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1L)
        val manyCards = (0 until 40).map { index -> cardWithSets("exercise-$index", listOf(loggedSet)) }

        val payload = WearStrengthPayload.fromSession(
            session = session(manyCards),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        assertEquals(WearStrengthPayload.MAX_ENTRIES, payload.entries.size)
    }

    @Test
    fun enforcesSetsPerEntryCap() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1L)
        val manySets = (0 until 60).map { loggedSet }

        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("with-many-sets", manySets))),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        assertEquals(1, payload.entries.size)
        assertEquals(WearStrengthPayload.MAX_SETS_PER_ENTRY, payload.entries[0].sets.size)
    }

    @Test
    fun transferIdConstructionUsesTopLevelStartedAndEndedAt() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1L)
        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("squat", listOf(loggedSet))), startedAtMs = 123L, endedAtMs = 456L),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        assertEquals(123L, payload.startedAtMs)
        assertEquals(456L, payload.endedAtMs)
        assertFalse(payload.toJsonString().isBlank())
    }
}
