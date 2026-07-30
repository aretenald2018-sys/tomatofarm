package com.lifestreak.wear.workout

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * A single previously-logged set for an exercise, as inlined into the phone -> watch
 * strength-context payload. Mirrors the phone's set shape (`workout/set-editor.js`) minus
 * `rpe`/`completedAt`, which the watch does not need for prefill purposes.
 */
data class WearStrengthLastSet(
    val kg: Double,
    val reps: Int,
    val romPct: Int,
    val setType: String,
    val done: Boolean,
)

/** The most recent logged session for one exercise (identified by `exerciseId` on the phone). */
data class WearStrengthLastSession(
    val dateKey: String,
    val sets: List<WearStrengthLastSet>,
) {
    /**
     * The set used to prefill a new watch card: the heaviest completed working set (i.e. not a
     * warmup), falling back to the very first recorded set if nothing qualifies.
     */
    fun topSet(): WearStrengthLastSet? {
        val workingSets = sets.filter { it.done && it.setType != SET_TYPE_WARMUP }
        return workingSets.maxByOrNull { it.kg } ?: sets.firstOrNull()
    }

    private companion object {
        const val SET_TYPE_WARMUP = "warmup"
    }
}

data class WearStrengthExercise(
    val exerciseId: String,
    val name: String,
    val muscleId: String,
    val movementId: String,
    val stepKg: Double,
    val lastSession: WearStrengthLastSession?,
) {
    /** e.g. "지난 기록 80kg×8 · 7/28", or null when there is no usable last session. */
    fun lastRecordLabel(): String? {
        val session = lastSession ?: return null
        val top = session.topSet() ?: return null
        val date = try {
            LocalDate.parse(session.dateKey)
        } catch (_: DateTimeParseException) {
            return null
        }
        return "지난 기록 ${formatKg(top.kg)}kg×${top.reps} · ${date.monthValue}/${date.dayOfMonth}"
    }

    private fun formatKg(kg: Double): String {
        val rounded = Math.round(kg * 10.0) / 10.0
        return if (rounded == Math.floor(rounded)) {
            rounded.toLong().toString()
        } else {
            rounded.toString()
        }
    }
}

data class WearStrengthMuscleGroup(
    val muscleId: String,
    val muscleName: String,
    val exercises: List<WearStrengthExercise>,
)

/**
 * The parsed phone -> watch strength-context DataItem payload (schema per the plan's Phase 0
 * section): the full per-muscle exercise catalog (each exercise carrying its own inlined last
 * session so any exercise can be prefilled immediately after selection) plus a short list of
 * recently-performed exercise ids for the picker's "recent" shortcut.
 */
data class WearStrengthCatalog(
    val generatedAt: Long,
    val catalogGroups: List<WearStrengthMuscleGroup>,
    val recentExerciseIds: List<String>,
) {
    private val exercisesById: Map<String, WearStrengthExercise> by lazy {
        catalogGroups.asSequence().flatMap { it.exercises.asSequence() }.associateBy { it.exerciseId }
    }

    fun findExercise(exerciseId: String): WearStrengthExercise? = exercisesById[exerciseId]

    /** [recentExerciseIds] resolved to catalog entries, preserving order and skipping unknown ids. */
    val recentExercises: List<WearStrengthExercise> by lazy {
        recentExerciseIds.mapNotNull { exercisesById[it] }
    }

    companion object {
        const val PAYLOAD_TYPE = "strength-context"
        const val PAYLOAD_VERSION = 1
        private const val MAX_MUSCLE_GROUPS = 300
        private const val MAX_EXERCISES_PER_GROUP = 300
        private const val MAX_LAST_SESSION_SETS = 12
        private const val MAX_RECENT_EXERCISE_IDS = 20
        private const val DEFAULT_STEP_KG = 2.5

        /**
         * Parses the strength-context envelope. Throws only when the top-level envelope itself
         * is wrong (missing/mismatched `type` or `payloadVersion`); every nested entry is parsed
         * tolerantly, skipping malformed items instead of failing the whole payload.
         */
        fun parse(rawJson: String): WearStrengthCatalog {
            val json = JSONObject(rawJson)
            val type = json.optString("type", "")
            require(type == PAYLOAD_TYPE) { "unexpected strength-context type: $type" }
            val version = json.optInt("payloadVersion", -1)
            require(version == PAYLOAD_VERSION) { "unsupported strength-context payloadVersion: $version" }

            val generatedAt = json.optLong("generatedAt", 0L).coerceAtLeast(0L)
            val groups = parseCatalogGroups(json.optJSONArray("catalog"))
            val recentIds = parseRecentIds(json.optJSONArray("recentExerciseIds"))
            return WearStrengthCatalog(
                generatedAt = generatedAt,
                catalogGroups = groups,
                recentExerciseIds = recentIds,
            )
        }

        private fun parseCatalogGroups(array: JSONArray?): List<WearStrengthMuscleGroup> {
            if (array == null) return emptyList()
            val groups = mutableListOf<WearStrengthMuscleGroup>()
            for (index in 0 until array.length()) {
                if (groups.size >= MAX_MUSCLE_GROUPS) break
                val item = array.optJSONObject(index) ?: continue
                val muscleId = item.optString("muscleId", "")
                val muscleName = item.optString("muscleName", "")
                if (muscleId.isBlank() || muscleName.isBlank()) continue
                val exercises = parseExercises(item.optJSONArray("exercises"))
                groups.add(WearStrengthMuscleGroup(muscleId, muscleName, exercises))
            }
            return groups
        }

        private fun parseExercises(array: JSONArray?): List<WearStrengthExercise> {
            if (array == null) return emptyList()
            val exercises = mutableListOf<WearStrengthExercise>()
            for (index in 0 until array.length()) {
                if (exercises.size >= MAX_EXERCISES_PER_GROUP) break
                val item = array.optJSONObject(index) ?: continue
                val exerciseId = item.optString("exerciseId", "")
                val name = item.optString("name", "")
                if (exerciseId.isBlank() || name.isBlank()) continue
                val muscleId = item.optString("muscleId", "")
                val movementId = item.optString("movementId", "")
                val stepKg = item.optDouble("stepKg", DEFAULT_STEP_KG)
                    .takeIf { it.isFinite() && it > 0.0 } ?: DEFAULT_STEP_KG
                val lastSession = parseLastSession(item)
                exercises.add(
                    WearStrengthExercise(
                        exerciseId = exerciseId,
                        name = name,
                        muscleId = muscleId,
                        movementId = movementId,
                        stepKg = stepKg,
                        lastSession = lastSession,
                    ),
                )
            }
            return exercises
        }

        private fun parseLastSession(exerciseJson: JSONObject): WearStrengthLastSession? {
            if (!exerciseJson.has("lastSession") || exerciseJson.isNull("lastSession")) return null
            val sessionJson = exerciseJson.optJSONObject("lastSession") ?: return null
            val dateKey = sessionJson.optString("dateKey", "")
            if (dateKey.isBlank()) return null
            val sets = parseLastSets(sessionJson.optJSONArray("sets"))
            return WearStrengthLastSession(dateKey = dateKey, sets = sets)
        }

        private fun parseLastSets(array: JSONArray?): List<WearStrengthLastSet> {
            if (array == null) return emptyList()
            val sets = mutableListOf<WearStrengthLastSet>()
            for (index in 0 until array.length()) {
                if (sets.size >= MAX_LAST_SESSION_SETS) break
                val item = array.optJSONObject(index) ?: continue
                val kg = item.optDouble("kg", Double.NaN)
                val reps = item.optInt("reps", -1)
                if (!kg.isFinite() || kg < 0.0 || reps <= 0) continue
                val romPct = item.optInt("romPct", 100)
                val setType = item.optString("setType", "main").takeIf { it.isNotBlank() } ?: "main"
                val done = item.optBoolean("done", true)
                sets.add(WearStrengthLastSet(kg = kg, reps = reps, romPct = romPct, setType = setType, done = done))
            }
            return sets
        }

        private fun parseRecentIds(array: JSONArray?): List<String> {
            if (array == null) return emptyList()
            val ids = mutableListOf<String>()
            for (index in 0 until array.length()) {
                if (ids.size >= MAX_RECENT_EXERCISE_IDS) break
                val id = array.optString(index, "")
                if (id.isNotBlank()) ids.add(id)
            }
            return ids
        }
    }
}
