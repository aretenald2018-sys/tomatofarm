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
    /** Reps In Reserve as recorded on the phone, 0-5; null when absent/invalid. */
    val rir: Int? = null,
)

/** The most recent logged session for one exercise (identified by `exerciseId` on the phone). */
data class WearStrengthLastSession(
    val dateKey: String,
    val sets: List<WearStrengthLastSet>,
) {
    /**
     * The set used to label a card's 지난 기록 strip: the heaviest completed *working* set, using
     * the same warm-up/deload exclusion as [WearStrengthSessionState.plannedSetsFrom] (the phone's
     * `_isActualWorkoutSet`) so the label can never advertise a set that tapping it won't copy.
     * Falls back to the first completed set, then to the first recorded set.
     */
    fun topSet(): WearStrengthLastSet? {
        val workingSets = sets.filter { it.done && it.setType != SET_TYPE_WARMUP && it.setType != SET_TYPE_DELOAD }
        return workingSets.maxByOrNull { it.kg }
            ?: sets.firstOrNull { it.done }
            ?: sets.firstOrNull()
    }

    private companion object {
        const val SET_TYPE_WARMUP = "warmup"
        const val SET_TYPE_DELOAD = "deload"
    }
}

/**
 * One prescribed row of an exercise's program (웬들러 주차 처방 or a growth-board track), computed
 * on the phone (`workout/wear-strength-context.js` `makeWearProgramResolver`) and inlined here.
 * The watch has neither the board nor the Training Max maths, so this is the only way a Wendler
 * exercise can open with that week's sets already laid out.
 */
data class WearStrengthProgramSet(
    val kg: Double,
    val reps: Int,
    val romPct: Int,
    /** Persisted set type — round-trips back to the phone (`main`/`warmup`/`drop`/`failure`). */
    val setType: String,
    /** Display-only wendler role (`warmup`/`main`/`supplemental`/…); null for plain rows. */
    val role: String?,
    /** "As many reps as possible" top set — rendered as `5+`. */
    val amrap: Boolean,
    /** `bbb`/`fsl` when [role] is `supplemental`; null otherwise. */
    val supplementalKind: String?,
)

/** An exercise's whole prescription for the current week. */
data class WearStrengthProgram(
    /** `wendler` or `stair`. */
    val kind: String,
    /** e.g. "웬들러 5/3/1 · 100kg x 5+ · BBB 60kg 5x10". */
    val label: String,
    /** Just the scheme, e.g. "웬들러 5/3/1" — the full [label] does not survive one watch line. */
    val shortLabel: String,
    /** e.g. "3주차"; blank when the phone could not resolve a week. */
    val weekLabel: String,
    val sets: List<WearStrengthProgramSet>,
) {
    /** Compact card header, e.g. "3주차 · 웬들러 5/3/1". Falls back to the long label for a payload
     * written before `shortLabel` existed. */
    fun headerLabel(): String {
        val name = shortLabel.takeIf { it.isNotBlank() } ?: label
        return listOf(weekLabel, name).filter { it.isNotBlank() }.joinToString(" · ")
    }
}

data class WearStrengthExercise(
    val exerciseId: String,
    val name: String,
    val muscleId: String,
    val movementId: String,
    val stepKg: Double,
    val lastSession: WearStrengthLastSession?,
    val program: WearStrengthProgram? = null,
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
        private const val MAX_PROGRAM_SETS = 24
        private const val DEFAULT_STEP_KG = 2.5
        private val VALID_SET_TYPES = setOf("main", "warmup", "drop", "failure")
        private val VALID_PROGRAM_ROLES =
            setOf("warmup", "main", "supplemental", "heavy_single", "backoff", "deload", "pr_attempt")

        /**
         * Parses the strength-context envelope. Throws only when the top-level envelope itself
         * is wrong (wrong `type`, or a `payloadVersion` below the floor); every nested entry is
         * parsed tolerantly, skipping malformed items instead of failing the whole payload.
         *
         * A *newer* payloadVersion is accepted rather than rejected. Every field added to this
         * schema so far has been additive, and the phone ships independently of the watch app, so
         * a strict `==` check would blank the whole exercise picker on every watch that has not
         * been updated yet — a far worse failure than ignoring one unknown field.
         */
        fun parse(rawJson: String): WearStrengthCatalog {
            val json = JSONObject(rawJson)
            val type = json.optString("type", "")
            require(type == PAYLOAD_TYPE) { "unexpected strength-context type: $type" }
            val version = json.optInt("payloadVersion", -1)
            require(version >= PAYLOAD_VERSION) { "unsupported strength-context payloadVersion: $version" }

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
                val muscleId = item.optTextOrEmpty("muscleId")
                val muscleName = item.optTextOrEmpty("muscleName")
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
                val exerciseId = item.optTextOrEmpty("exerciseId")
                val name = item.optTextOrEmpty("name")
                if (exerciseId.isBlank() || name.isBlank()) continue
                val muscleId = item.optTextOrEmpty("muscleId")
                val movementId = item.optTextOrEmpty("movementId")
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
                        program = parseProgram(item.optJSONObject("program")),
                    ),
                )
            }
            return exercises
        }

        /** Tolerant: a program with no usable rows parses to null, so the card falls back to the
         * plain blank row rather than opening empty. */
        private fun parseProgram(json: JSONObject?): WearStrengthProgram? {
            if (json == null) return null
            val sets = parseProgramSets(json.optJSONArray("sets"))
            if (sets.isEmpty()) return null
            return WearStrengthProgram(
                kind = json.optTextOrEmpty("kind").takeIf { it.isNotBlank() } ?: "program",
                label = json.optTextOrEmpty("label"),
                shortLabel = json.optTextOrEmpty("shortLabel"),
                weekLabel = json.optTextOrEmpty("weekLabel"),
                sets = sets,
            )
        }

        private fun parseProgramSets(array: JSONArray?): List<WearStrengthProgramSet> {
            if (array == null) return emptyList()
            val sets = mutableListOf<WearStrengthProgramSet>()
            for (index in 0 until array.length()) {
                if (sets.size >= MAX_PROGRAM_SETS) break
                val item = array.optJSONObject(index) ?: continue
                val kg = item.optDouble("kg", Double.NaN)
                val reps = item.optInt("reps", -1)
                if (!kg.isFinite() || kg < 0.0 || reps <= 0) continue
                val setType = item.optTextOrEmpty("setType").takeIf { it in VALID_SET_TYPES } ?: "main"
                val role = item.optTextOrEmpty("role").takeIf { it in VALID_PROGRAM_ROLES }
                val supplementalKind = item.optTextOrEmpty("supplementalKind").takeIf { it.isNotBlank() }
                sets.add(
                    WearStrengthProgramSet(
                        kg = kg,
                        reps = reps,
                        romPct = item.optInt("romPct", 100),
                        setType = setType,
                        role = role,
                        amrap = item.optBoolean("amrap", false),
                        supplementalKind = supplementalKind,
                    ),
                )
            }
            return sets
        }

        private fun parseLastSession(exerciseJson: JSONObject): WearStrengthLastSession? {
            if (!exerciseJson.has("lastSession") || exerciseJson.isNull("lastSession")) return null
            val sessionJson = exerciseJson.optJSONObject("lastSession") ?: return null
            val dateKey = sessionJson.optTextOrEmpty("dateKey")
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
                val setType = item.optTextOrEmpty("setType").takeIf { it.isNotBlank() } ?: "main"
                val done = item.optBoolean("done", true)
                val rir = item.optInt("rir", -1).takeIf { it in 0..5 }
                sets.add(
                    WearStrengthLastSet(kg = kg, reps = reps, romPct = romPct, setType = setType, done = done, rir = rir),
                )
            }
            return sets
        }

        private fun parseRecentIds(array: JSONArray?): List<String> {
            if (array == null) return emptyList()
            val ids = mutableListOf<String>()
            for (index in 0 until array.length()) {
                if (ids.size >= MAX_RECENT_EXERCISE_IDS) break
                val id = if (array.isNull(index)) "" else array.optString(index, "")
                if (id.isNotBlank()) ids.add(id)
            }
            return ids
        }
    }
}

/**
 * `optString` with a JSON-`null` guard.
 *
 * Android's bundled `org.json` returns the *literal string* `"null"` for a key whose value is JSON
 * `null` (`JSONObject.NULL.toString()`), while the reference `org.json` artifact used by these
 * unit tests returns the fallback. The phone emits `movementId: null` for any exercise with no
 * mapped movement, so without this guard those exercises get a `movementId` of `"null"` on the
 * watch — which then rides the completion payload back to the phone as a real movement id.
 */
internal fun JSONObject.optTextOrEmpty(name: String): String {
    if (!has(name) || isNull(name)) return ""
    return optString(name, "")
}
