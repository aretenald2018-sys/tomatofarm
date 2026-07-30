package com.lifestreak.wear.workout

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Pure (no Android imports) state machine for the watch strength-workout flow. See the plan's
 * "러닝 기능과의 공존 설계" / Phase 3 sections: the carousel starts empty, entering strength mode
 * goes straight to the exercise [PICKER], and picking an exercise creates a card + moves to
 * [ACTIVE]. Every mutating method returns a new state (`data class` + `copy`), so it is trivially
 * testable and safe to call from any thread.
 */
enum class WearStrengthScreen {
    IDLE,
    ACTIVE,
    PICKER,
    SUMMARY,
}

data class WearStrengthLoggedSet(
    val kg: Double,
    val reps: Int,
    val romPct: Int,
    val completedAt: Long,
)

data class WearStrengthCard(
    val exerciseId: String,
    val name: String,
    val muscleId: String,
    val movementId: String,
    val stepKg: Double,
    val draftKg: Double,
    val draftReps: Int,
    val draftRomPct: Int,
    val loggedSets: List<WearStrengthLoggedSet> = emptyList(),
)

/** A finished (or in-progress-but-finishable) strength session, ready for [WearStrengthPayload]. */
data class WearStrengthSession(
    val startedAtMs: Long,
    val endedAtMs: Long,
    val cards: List<WearStrengthCard>,
)

data class WearStrengthSessionState(
    val screen: WearStrengthScreen = WearStrengthScreen.IDLE,
    val cards: List<WearStrengthCard> = emptyList(),
    val activeCardIndex: Int = -1,
    val startedAt: Long = 0L,
    val endedAt: Long? = null,
) {
    val activeCard: WearStrengthCard?
        get() = cards.getOrNull(activeCardIndex)

    val totalSets: Int
        get() = cards.sumOf { it.loggedSets.size }

    val totalVolumeKg: Double
        get() = cards.sumOf { card -> card.loggedSets.sumOf { it.kg * it.reps } }

    /** Enters strength mode: empty carousel, straight to the exercise picker. */
    fun start(now: Long): WearStrengthSessionState {
        return WearStrengthSessionState(
            screen = WearStrengthScreen.PICKER,
            cards = emptyList(),
            activeCardIndex = -1,
            startedAt = now,
            endedAt = null,
        )
    }

    fun openPicker(): WearStrengthSessionState {
        if (screen == WearStrengthScreen.IDLE || screen == WearStrengthScreen.SUMMARY) return this
        return copy(screen = WearStrengthScreen.PICKER)
    }

    /** Back-swipe from the picker: returns to the carousel if it already has a card. */
    fun closePicker(): WearStrengthSessionState {
        if (screen != WearStrengthScreen.PICKER) return this
        if (cards.isEmpty()) return this
        return copy(screen = WearStrengthScreen.ACTIVE)
    }

    /**
     * Adds [exercise] as a new card right after [afterIndex] (defaults to the current active
     * card), prefilled from its last session's [WearStrengthLastSession.topSet] — or 20kg/10
     * reps/100% ROM when there is no usable history — then focuses the new card and switches to
     * [ACTIVE].
     */
    fun addExercise(
        exercise: WearStrengthExercise,
        afterIndex: Int = activeCardIndex,
    ): WearStrengthSessionState {
        val prefill = exercise.lastSession?.topSet()
        val newCard = WearStrengthCard(
            exerciseId = exercise.exerciseId,
            name = exercise.name,
            muscleId = exercise.muscleId,
            movementId = exercise.movementId,
            stepKg = exercise.stepKg,
            draftKg = clampKg(prefill?.kg ?: DEFAULT_DRAFT_KG),
            draftReps = clampReps(prefill?.reps ?: DEFAULT_DRAFT_REPS),
            draftRomPct = clampRom(prefill?.romPct ?: DEFAULT_DRAFT_ROM_PCT),
        )
        val insertAt = (afterIndex + 1).coerceIn(0, cards.size)
        val nextCards = cards.toMutableList().apply { add(insertAt, newCard) }
        return copy(screen = WearStrengthScreen.ACTIVE, cards = nextCards, activeCardIndex = insertAt)
    }

    fun selectCard(index: Int): WearStrengthSessionState {
        if (index !in cards.indices) return this
        val nextScreen = if (screen == WearStrengthScreen.PICKER) WearStrengthScreen.ACTIVE else screen
        return copy(activeCardIndex = index, screen = nextScreen)
    }

    /** delta is in "steps": the actual kg movement is `delta * card.stepKg` (fallback 2.5). */
    fun adjustKg(delta: Int): WearStrengthSessionState = updateActiveCard { card ->
        val step = card.stepKg.takeIf { it > 0.0 } ?: DEFAULT_STEP_KG
        card.copy(draftKg = clampKg(roundToHalf(card.draftKg + delta * step)))
    }

    fun adjustReps(delta: Int): WearStrengthSessionState = updateActiveCard { card ->
        card.copy(draftReps = clampReps(card.draftReps + delta))
    }

    /** delta is in "steps" of [ROM_STEP_PCT] percent. */
    fun adjustRom(delta: Int): WearStrengthSessionState = updateActiveCard { card ->
        card.copy(draftRomPct = clampRom(card.draftRomPct + delta * ROM_STEP_PCT))
    }

    /** Logs the active card's current draft as a completed set. Drafts carry over unchanged. */
    fun completeSet(now: Long): WearStrengthSessionState = updateActiveCard { card ->
        card.copy(
            loggedSets = card.loggedSets + WearStrengthLoggedSet(
                kg = card.draftKg,
                reps = card.draftReps,
                romPct = card.draftRomPct,
                completedAt = now,
            ),
        )
    }

    fun undoLastSet(): WearStrengthSessionState = updateActiveCard { card ->
        if (card.loggedSets.isEmpty()) card else card.copy(loggedSets = card.loggedSets.dropLast(1))
    }

    /** Requires at least one logged set across all cards; otherwise this is a no-op. */
    fun finish(now: Long): WearStrengthSessionState {
        if (screen == WearStrengthScreen.SUMMARY) return this
        if (totalSets < 1) return this
        return copy(screen = WearStrengthScreen.SUMMARY, endedAt = now)
    }

    fun buildSession(): WearStrengthSession {
        return WearStrengthSession(
            startedAtMs = startedAt,
            endedAtMs = endedAt ?: startedAt,
            cards = cards,
        )
    }

    fun toJson(): String = toJsonObject().toString()

    internal fun toJsonObject(): JSONObject {
        return JSONObject()
            .put("version", VERSION)
            .put("screen", screen.name)
            .put("cards", cardsToJson(cards))
            .put("activeCardIndex", activeCardIndex)
            .put("startedAt", startedAt)
            .putNullable("endedAt", endedAt)
    }

    private fun updateActiveCard(transform: (WearStrengthCard) -> WearStrengthCard): WearStrengthSessionState {
        val index = activeCardIndex
        val card = cards.getOrNull(index) ?: return this
        val nextCards = cards.toMutableList().also { it[index] = transform(card) }
        return copy(cards = nextCards)
    }

    companion object {
        const val VERSION = 1
        const val DEFAULT_DRAFT_KG = 20.0
        const val DEFAULT_DRAFT_REPS = 10
        const val DEFAULT_DRAFT_ROM_PCT = 100
        const val DEFAULT_STEP_KG = 2.5
        const val ROM_STEP_PCT = 5
        const val MIN_KG = 0.0
        const val MAX_KG = 500.0
        const val MIN_REPS = 1
        const val MAX_REPS = 100
        const val MIN_ROM_PCT = 10
        const val MAX_ROM_PCT = 100

        fun fromJson(raw: String): WearStrengthSessionState? {
            return try {
                fromJsonObject(JSONObject(raw))
            } catch (_: Exception) {
                null
            }
        }

        internal fun fromJsonObject(json: JSONObject): WearStrengthSessionState? {
            return try {
                if (json.optInt("version", -1) != VERSION) return null
                val screen = WearStrengthScreen.valueOf(json.getString("screen"))
                val cards = jsonToCards(json.optJSONArray("cards"))
                val rawActiveCardIndex = json.optInt("activeCardIndex", -1)
                WearStrengthSessionState(
                    screen = screen,
                    cards = cards,
                    activeCardIndex = if (rawActiveCardIndex in cards.indices) rawActiveCardIndex else -1,
                    startedAt = json.optLong("startedAt", 0L).coerceAtLeast(0L),
                    endedAt = json.optNullableLong("endedAt"),
                )
            } catch (_: Exception) {
                null
            }
        }

        private fun clampKg(value: Double): Double = value.coerceIn(MIN_KG, MAX_KG)
        private fun clampReps(value: Int): Int = value.coerceIn(MIN_REPS, MAX_REPS)
        private fun clampRom(value: Int): Int = value.coerceIn(MIN_ROM_PCT, MAX_ROM_PCT)
        private fun roundToHalf(value: Double): Double = (value * 2.0).roundToInt() / 2.0

        private fun cardsToJson(cards: List<WearStrengthCard>): JSONArray {
            return JSONArray().apply {
                cards.forEach { card ->
                    put(
                        JSONObject()
                            .put("exerciseId", card.exerciseId)
                            .put("name", card.name)
                            .put("muscleId", card.muscleId)
                            .put("movementId", card.movementId)
                            .put("stepKg", card.stepKg)
                            .put("draftKg", card.draftKg)
                            .put("draftReps", card.draftReps)
                            .put("draftRomPct", card.draftRomPct)
                            .put("loggedSets", loggedSetsToJson(card.loggedSets)),
                    )
                }
            }
        }

        private fun loggedSetsToJson(sets: List<WearStrengthLoggedSet>): JSONArray {
            return JSONArray().apply {
                sets.forEach { set ->
                    put(
                        JSONObject()
                            .put("kg", set.kg)
                            .put("reps", set.reps)
                            .put("romPct", set.romPct)
                            .put("completedAt", set.completedAt),
                    )
                }
            }
        }

        private fun jsonToCards(array: JSONArray?): List<WearStrengthCard> {
            if (array == null) return emptyList()
            val cards = mutableListOf<WearStrengthCard>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val exerciseId = item.optString("exerciseId", "")
                val name = item.optString("name", "")
                if (exerciseId.isBlank() || name.isBlank()) continue
                val stepKg = item.optDouble("stepKg", DEFAULT_STEP_KG)
                    .takeIf { it.isFinite() && it > 0.0 } ?: DEFAULT_STEP_KG
                val draftKg = item.optDouble("draftKg", DEFAULT_DRAFT_KG)
                    .takeIf { it.isFinite() } ?: DEFAULT_DRAFT_KG
                cards.add(
                    WearStrengthCard(
                        exerciseId = exerciseId,
                        name = name,
                        muscleId = item.optString("muscleId", ""),
                        movementId = item.optString("movementId", ""),
                        stepKg = stepKg,
                        draftKg = clampKg(draftKg),
                        draftReps = clampReps(item.optInt("draftReps", DEFAULT_DRAFT_REPS)),
                        draftRomPct = clampRom(item.optInt("draftRomPct", DEFAULT_DRAFT_ROM_PCT)),
                        loggedSets = jsonToLoggedSets(item.optJSONArray("loggedSets")),
                    ),
                )
            }
            return cards
        }

        private fun jsonToLoggedSets(array: JSONArray?): List<WearStrengthLoggedSet> {
            if (array == null) return emptyList()
            val sets = mutableListOf<WearStrengthLoggedSet>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val kg = item.optDouble("kg", Double.NaN)
                val reps = item.optInt("reps", -1)
                val romPct = item.optInt("romPct", -1)
                val completedAt = item.optLong("completedAt", -1L)
                if (!kg.isFinite() || kg < 0.0 || reps <= 0 || romPct <= 0 || completedAt < 0L) continue
                sets.add(WearStrengthLoggedSet(kg = kg, reps = reps, romPct = romPct, completedAt = completedAt))
            }
            return sets
        }
    }
}

private fun JSONObject.putNullable(name: String, value: Any?): JSONObject = put(name, value ?: JSONObject.NULL)

private fun JSONObject.optNullableLong(name: String): Long? {
    return if (has(name) && !isNull(name)) optLong(name) else null
}
