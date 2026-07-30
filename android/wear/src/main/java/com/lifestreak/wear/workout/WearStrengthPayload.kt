package com.lifestreak.wear.workout

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class WearStrengthSetEntry(
    val kg: Double,
    val reps: Int,
    val romPct: Int,
    val setType: String,
    val done: Boolean,
    val completedAt: Long,
    /** Reps In Reserve; omitted from the JSON entirely when null (additive field, phone contract
     * tolerates it either way). */
    val rir: Int? = null,
)

data class WearStrengthEntry(
    val exerciseId: String,
    val name: String,
    val muscleId: String,
    val movementId: String,
    val sets: List<WearStrengthSetEntry>,
)

/**
 * The watch -> phone strength-completion payload, matching the plan's Phase 0 JSON schema
 * exactly (same envelope/asset/ack machinery as [WearWorkoutPayload], only `type`/path differ).
 */
data class WearStrengthPayload(
    val dateKey: String,
    val startedAtMs: Long,
    val endedAtMs: Long,
    val durationSec: Long,
    val avgHeartRateBpm: Int?,
    val maxHeartRateBpm: Int?,
    val samples10s: List<HeartRateSample>,
    val entries: List<WearStrengthEntry>,
) {
    fun toJsonString(): String {
        return JSONObject()
            .put("payloadVersion", PAYLOAD_VERSION)
            .put("type", PAYLOAD_TYPE)
            .put("source", SOURCE_WEAR)
            .put("dateKey", dateKey)
            .put("startedAt", startedAtMs)
            .put("endedAt", endedAtMs)
            .put("durationSec", durationSec)
            .putNullable("avgHeartRateBpm", avgHeartRateBpm)
            .putNullable("maxHeartRateBpm", maxHeartRateBpm)
            .put("samples10s", strengthSamplesToJson(samples10s))
            .put("entries", strengthEntriesToJson(entries))
            .toString()
    }

    companion object {
        const val PAYLOAD_VERSION = 1
        const val PAYLOAD_TYPE = "strength"
        const val SOURCE_WEAR = "wear"
        const val MAX_ENTRIES = 30
        const val MAX_SETS_PER_ENTRY = 50
        private const val MAX_HEART_RATE_BUCKETS = 2_161
        private const val MAX_DURATION_SEC = 6L * 60L * 60L

        /**
         * Builds the payload from a finished [WearStrengthSession] plus HR summary stats. Cards
         * with zero logged sets are dropped; entries/sets are capped defensively even though the
         * session state machine already keeps well under these limits in normal use.
         */
        fun fromSession(
            session: WearStrengthSession,
            avgHeartRateBpm: Int?,
            maxHeartRateBpm: Int?,
            samples10s: List<HeartRateSample>,
        ): Result<WearStrengthPayload> = runCatching {
            require(session.endedAtMs > session.startedAtMs) { "endedAtMs must be after startedAtMs" }
            val durationSec = (session.endedAtMs - session.startedAtMs) / 1_000L
            require(durationSec > 0L) { "durationSec must be positive" }
            require(durationSec <= MAX_DURATION_SEC) { "durationSec exceeds payload limit" }

            val entries = session.cards
                .filter { it.loggedSets.isNotEmpty() }
                .take(MAX_ENTRIES)
                .map { card ->
                    WearStrengthEntry(
                        exerciseId = card.exerciseId,
                        name = card.name,
                        muscleId = card.muscleId,
                        movementId = card.movementId,
                        sets = card.loggedSets.take(MAX_SETS_PER_ENTRY).map { set ->
                            WearStrengthSetEntry(
                                kg = set.kg,
                                reps = set.reps,
                                romPct = set.romPct,
                                setType = "main",
                                done = true,
                                completedAt = set.completedAt,
                                rir = set.rir,
                            )
                        },
                    )
                }
            require(entries.isNotEmpty()) { "at least one entry with a logged set is required" }

            WearStrengthPayload(
                dateKey = dateKeyFor(session.startedAtMs),
                startedAtMs = session.startedAtMs,
                endedAtMs = session.endedAtMs,
                durationSec = durationSec,
                avgHeartRateBpm = avgHeartRateBpm,
                maxHeartRateBpm = maxHeartRateBpm,
                samples10s = samples10s.take(MAX_HEART_RATE_BUCKETS),
                entries = entries,
            )
        }

        private fun dateKeyFor(startedAtMs: Long): String {
            val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            formatter.timeZone = TimeZone.getDefault()
            return formatter.format(Date(startedAtMs))
        }
    }
}

private fun strengthSamplesToJson(samples: List<HeartRateSample>): JSONArray {
    return JSONArray().apply {
        samples.forEach { sample ->
            put(JSONObject().put("timestampMs", sample.timestampMs).put("bpm", sample.bpm))
        }
    }
}

private fun strengthEntriesToJson(entries: List<WearStrengthEntry>): JSONArray {
    return JSONArray().apply {
        entries.forEach { entry ->
            put(
                JSONObject()
                    .put("exerciseId", entry.exerciseId)
                    .put("name", entry.name)
                    .put("muscleId", entry.muscleId)
                    .put("movementId", entry.movementId)
                    .put("sets", strengthSetsToJson(entry.sets)),
            )
        }
    }
}

private fun strengthSetsToJson(sets: List<WearStrengthSetEntry>): JSONArray {
    return JSONArray().apply {
        sets.forEach { set ->
            val setJson = JSONObject()
                .put("kg", set.kg)
                .put("reps", set.reps)
                .put("romPct", set.romPct)
                .put("setType", set.setType)
                .put("done", set.done)
                .put("completedAt", set.completedAt)
            if (set.rir != null) setJson.put("rir", set.rir)
            put(setJson)
        }
    }
}

private fun JSONObject.putNullable(name: String, value: Any?): JSONObject = put(name, value ?: JSONObject.NULL)
