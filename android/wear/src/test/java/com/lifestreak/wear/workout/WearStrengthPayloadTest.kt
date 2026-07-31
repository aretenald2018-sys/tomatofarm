package com.lifestreak.wear.workout

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WearStrengthPayloadTest {
    // WearStrengthCard no longer has a draftKg/draftReps/draftRomPct/loggedSets constructor (the
    // checklist rework replaced them with `sets: List<PlannedSet>`); this helper rebuilds each
    // WearStrengthLoggedSet as an already-done PlannedSet so `card.loggedSets` (the computed
    // property WearStrengthPayload actually reads) reproduces exactly what the caller passed in.
    private fun cardWithSets(exerciseId: String, sets: List<WearStrengthLoggedSet>): WearStrengthCard {
        return WearStrengthCard(
            exerciseId = exerciseId,
            name = "종목 $exerciseId",
            muscleId = "chest",
            movementId = "movement",
            stepKg = 2.5,
            sets = sets.map { set ->
                PlannedSet(
                    kg = set.kg,
                    reps = set.reps,
                    romPct = set.romPct,
                    done = true,
                    completedAt = set.completedAt,
                    rir = set.rir,
                    setType = set.setType,
                    role = set.role,
                    amrap = set.amrap,
                    supplementalKind = set.supplementalKind,
                )
            },
        )
    }

    private fun firstSetJson(card: WearStrengthCard, index: Int = 0): JSONObject {
        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(card)),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()
        return JSONObject(payload.toJsonString())
            .getJSONArray("entries")
            .getJSONObject(0)
            .getJSONArray("sets")
            .getJSONObject(index)
    }

    /**
     * The payload used to hardcode `setType = "main"` for every logged row. Once a Wendler card
     * prescribes real warm-ups, that turns every warm-up into a working set on the phone and
     * inflates the imported session's set count and volume.
     */
    @Test
    fun prescribedRowsKeepTheirSetTypeAndRoleOnTheWire() {
        val card = cardWithSets(
            "back-squat",
            listOf(
                WearStrengthLoggedSet(
                    kg = 60.0, reps = 5, romPct = 100, completedAt = 1_700_000_100_000L,
                    setType = "warmup", role = "warmup",
                ),
                WearStrengthLoggedSet(
                    kg = 142.5, reps = 4, romPct = 100, completedAt = 1_700_000_200_000L,
                    setType = "main", role = "main", amrap = true,
                ),
                WearStrengthLoggedSet(
                    kg = 75.0, reps = 10, romPct = 100, completedAt = 1_700_000_300_000L,
                    setType = "main", role = "supplemental", supplementalKind = "bbb",
                ),
            ),
        )

        val warmup = firstSetJson(card, 0)
        assertEquals("warmup", warmup.getString("setType"))
        assertEquals("warmup", warmup.getString("wendlerRole"))
        assertFalse("amrap is omitted when false", warmup.has("amrap"))

        val top = firstSetJson(card, 1)
        assertEquals("main", top.getString("setType"))
        assertTrue(top.getBoolean("amrap"))

        val bbb = firstSetJson(card, 2)
        assertEquals("supplemental", bbb.getString("wendlerRole"))
        assertEquals("bbb", bbb.getString("supplementalKind"))
    }

    @Test
    fun aPlainSetOmitsEveryProgramFieldSoTheContractIsUnchangedWithoutAProgram() {
        val card = cardWithSets(
            "bench-press",
            listOf(WearStrengthLoggedSet(kg = 80.0, reps = 8, romPct = 100, completedAt = 1_700_000_300_000L)),
        )
        val set = firstSetJson(card)
        assertEquals("main", set.getString("setType"))
        assertFalse(set.has("wendlerRole"))
        assertFalse(set.has("amrap"))
        assertFalse(set.has("supplementalKind"))
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
        // 123ms -> 456ms used to be the fixture here, but durationSec is integer seconds, so that
        // session rounds to 0s and `fromSession` correctly refuses it. Same assertion, at a
        // duration a real workout can actually have.
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 200_000L)
        val payload = WearStrengthPayload.fromSession(
            session = session(
                listOf(cardWithSets("squat", listOf(loggedSet))),
                startedAtMs = 123_000L,
                endedAtMs = 456_000L,
            ),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        assertEquals(123_000L, payload.startedAtMs)
        assertEquals(456_000L, payload.endedAtMs)
        assertEquals(333L, payload.durationSec)
        assertFalse(payload.toJsonString().isBlank())
    }

    /** The flip side of the fixture above: a sub-second session is not a workout and is rejected. */
    @Test
    fun aSubSecondSessionIsRejectedRatherThanSavedWithZeroDuration() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 200L)
        val result = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("squat", listOf(loggedSet))), startedAtMs = 123L, endedAtMs = 456L),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        )
        assertTrue(result.isFailure)
    }

    @Test
    fun rirKeyIsOmittedFromJsonWhenNull() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1L, rir = null)
        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("squat", listOf(loggedSet)))),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        val set = JSONObject(payload.toJsonString()).getJSONArray("entries").getJSONObject(0).getJSONArray("sets").getJSONObject(0)
        assertFalse(set.has("rir"))
    }

    @Test
    fun rirKeyIsIncludedInJsonWhenSet() {
        val loggedSet = WearStrengthLoggedSet(kg = 20.0, reps = 10, romPct = 100, completedAt = 1L, rir = 3)
        val payload = WearStrengthPayload.fromSession(
            session = session(listOf(cardWithSets("squat", listOf(loggedSet)))),
            avgHeartRateBpm = null,
            maxHeartRateBpm = null,
            samples10s = emptyList(),
        ).getOrThrow()

        val set = JSONObject(payload.toJsonString()).getJSONArray("entries").getJSONObject(0).getJSONArray("sets").getJSONObject(0)
        assertEquals(3, set.getInt("rir"))
    }
}
