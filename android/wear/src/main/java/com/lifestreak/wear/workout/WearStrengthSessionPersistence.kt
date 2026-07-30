package com.lifestreak.wear.workout

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Versioned process-death survival snapshot for the in-progress strength session: the
 * [WearStrengthSessionState] plus the bounded raw heart-rate samples buffered so far. Restoration
 * priority is described in the plan's "러닝 기능과의 공존 설계" §3 — this store only ever holds a
 * strength session (running has its own [WearExerciseSessionPersistence]).
 */
object WearStrengthSessionPersistence {
    private const val PREFS_NAME = WearStrengthContextStore.PREFS_NAME
    private const val KEY_SNAPSHOT = "session_snapshot"
    private const val VERSION = 1
    private const val MAX_HR_SAMPLES = 2_500

    fun save(context: Context, state: WearStrengthSessionState, hrSamples: List<HeartRateSample>) {
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SNAPSHOT, encode(state, hrSamples))
            .apply()
    }

    /** Returns null when nothing is persisted, or the snapshot is corrupt/wrong-versioned. */
    fun restore(context: Context): Pair<WearStrengthSessionState, List<HeartRateSample>>? {
        val raw = context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SNAPSHOT, null)
        return decode(raw)
    }

    fun clear(context: Context) {
        context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_SNAPSHOT)
            .apply()
    }

    /** Pure encode, exposed for testing without an Android [Context]. */
    internal fun encode(state: WearStrengthSessionState, hrSamples: List<HeartRateSample>): String {
        return JSONObject()
            .put("version", VERSION)
            .put("state", state.toJsonObject())
            .put("hrSamples", hrSamplesToJson(hrSamples))
            .toString()
    }

    /** Pure decode, exposed for testing without an Android [Context]. Corrupt input -> null. */
    internal fun decode(raw: String?): Pair<WearStrengthSessionState, List<HeartRateSample>>? {
        if (raw.isNullOrBlank()) return null
        return try {
            val json = JSONObject(raw)
            if (json.optInt("version", -1) != VERSION) return null
            val stateJson = json.optJSONObject("state") ?: return null
            val state = WearStrengthSessionState.fromJsonObject(stateJson) ?: return null
            val samples = jsonToHrSamples(json.optJSONArray("hrSamples"))
            state to samples
        } catch (_: Exception) {
            null
        }
    }

    private fun hrSamplesToJson(samples: List<HeartRateSample>): JSONArray {
        return JSONArray().apply {
            samples.takeLast(MAX_HR_SAMPLES).forEach { sample ->
                put(JSONObject().put("timestampMs", sample.timestampMs).put("bpm", sample.bpm))
            }
        }
    }

    private fun jsonToHrSamples(array: JSONArray?): List<HeartRateSample> {
        if (array == null) return emptyList()
        val samples = mutableListOf<HeartRateSample>()
        for (index in 0 until array.length()) {
            val item = array.optJSONObject(index) ?: continue
            val timestampMs = item.optLong("timestampMs", -1L)
            val bpm = item.optInt("bpm", -1)
            if (timestampMs >= 0L && bpm in 30..240) {
                samples.add(HeartRateSample(timestampMs = timestampMs, bpm = bpm))
            }
        }
        return samples.sortedBy { it.timestampMs }.takeLast(MAX_HR_SAMPLES)
    }
}
