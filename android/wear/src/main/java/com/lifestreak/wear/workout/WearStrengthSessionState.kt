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
 *
 * Reworked for the Strong/Hevy-style set checklist: a card's "draft" single-set editor is gone.
 * Instead each card carries an ordered list of [PlannedSet] rows (prefilled set-by-set from the
 * exercise's last session), and logging/undoing/editing act on one row at a time by (cardIdx,
 * setIdx). [EDIT]/[REST] are UI-level overlays owned by [WearStrengthUiController] — the only
 * piece of the rest timer that needs to survive process death is [restEndsAtMs]/[restTotalMs],
 * so those two fields live here.
 */
enum class WearStrengthScreen {
    IDLE,
    ACTIVE,
    PICKER,
    SUMMARY,
}

/** A completed set, exactly as [WearStrengthPayload] and the phone contract expect it. */
data class WearStrengthLoggedSet(
    val kg: Double,
    val reps: Int,
    val romPct: Int,
    val completedAt: Long,
    val rir: Int? = null,
    /** `main`/`warmup`/`drop`/`failure` — carried through from the row so a prescribed warm-up
     * does not land on the phone as a working set. */
    val setType: String = SET_TYPE_MAIN,
    /** The phone's `wendlerRole`. Needed separately from [setType] because the 8/6/3 원본 template
     * stores a deload row as `setType: "main"` + `wendlerRole: "deload"`, and the phone's
     * `_isActualWorkoutSet` excludes it on the *role*. */
    val role: String? = null,
    val amrap: Boolean = false,
    val supplementalKind: String? = null,
) {
    /** Mirrors the phone's `_isActualWorkoutSet` (calendar/format.js). */
    val isWorkingSet: Boolean
        get() = setType != SET_TYPE_WARMUP_VALUE && setType != SET_TYPE_DELOAD_VALUE &&
            role != SET_TYPE_WARMUP_VALUE && role != SET_TYPE_DELOAD_VALUE
}

/**
 * One row of the set checklist: either still pending (not yet performed this session) or done
 * (logged, with the timestamp it was logged at).
 */
data class PlannedSet(
    val kg: Double,
    val reps: Int,
    val romPct: Int,
    val done: Boolean = false,
    val completedAt: Long? = null,
    /** Reps In Reserve, 0-5; null means unset (the phone's set model treats it the same way). */
    val rir: Int? = null,
    /** Persisted set type, round-tripped to the phone. Defaults to a plain working set. */
    val setType: String = SET_TYPE_MAIN,
    /** Display-only wendler role from the program prescription (`warmup`/`supplemental`/…). */
    val role: String? = null,
    /** Program-prescribed AMRAP row — rendered as `5+회`. */
    val amrap: Boolean = false,
    /** `bbb`/`fsl` when [role] is `supplemental`. */
    val supplementalKind: String? = null,
) {
    /** Short badge for the checklist row: "웜업", "BBB", "메인+"… or null for a plain main set.
     * Mirrors the phone's `workoutSetTypeLabel` (workout/set-presentation.js). */
    fun roleLabel(): String? = when (role) {
        "warmup" -> "웜업"
        "heavy_single" -> "싱글"
        "backoff" -> "백오프"
        "deload" -> "회복"
        "pr_attempt" -> "PR"
        "supplemental" -> when (supplementalKind) {
            "bbb" -> "BBB"
            "fsl" -> "FSL"
            else -> "보조"
        }
        else -> if (setType == "warmup") "웜업" else null
    }
}

internal const val SET_TYPE_MAIN = "main"
internal const val SET_TYPE_WARMUP_VALUE = "warmup"
internal const val SET_TYPE_DELOAD_VALUE = "deload"

data class WearStrengthCard(
    val exerciseId: String,
    val name: String,
    val muscleId: String,
    val movementId: String,
    val stepKg: Double,
    val sets: List<PlannedSet> = emptyList(),
) {
    /** Done rows only, in [WearStrengthPayload]'s shape — the phone contract never sees a
     * [PlannedSet], so this is the sole bridge between the checklist model and the wire format. */
    val loggedSets: List<WearStrengthLoggedSet>
        get() = sets.filter { it.done }.map {
            WearStrengthLoggedSet(
                kg = it.kg,
                reps = it.reps,
                romPct = it.romPct,
                completedAt = it.completedAt ?: 0L,
                rir = it.rir,
                setType = it.setType,
                role = it.role,
                amrap = it.amrap,
                supplementalKind = it.supplementalKind,
            )
        }

    /** Logged rows that count as training volume — warm-ups and deloads excluded, exactly as the
     * phone's read model does (`calendar/workout-read-model.js`). */
    val workingLoggedSets: List<WearStrengthLoggedSet>
        get() = loggedSets.filter { it.isWorkingSet }
}

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
    /** Rest-timer deadline; null when no rest timer is running. Persisted so a process-death
     * restore resumes the countdown from wall-clock time rather than resetting it. */
    val restEndsAtMs: Long? = null,
    /** The duration the current rest timer started (or was extended to) — used to compute the
     * countdown ring's progress (`remaining / restTotalMs`). Meaningless while [restEndsAtMs] is
     * null. */
    val restTotalMs: Long = 0L,
) {
    val activeCard: WearStrengthCard?
        get() = cards.getOrNull(activeCardIndex)

    /** Working sets only, so the watch summary and the phone's imported record agree. A prescribed
     * Wendler card is mostly warm-ups on week 1; counting them here would show "9세트" on the watch
     * for a session the phone then renders as "3세트". */
    val totalSets: Int
        get() = cards.sumOf { it.workingLoggedSets.size }

    /** Every checked-off row including warm-ups — the "did the user actually do anything?" gate,
     * kept separate from [totalSets] so the finish button can tell the two cases apart. */
    val loggedRowCount: Int
        get() = cards.sumOf { it.loggedSets.size }

    val totalVolumeKg: Double
        get() = cards.sumOf { card -> card.workingLoggedSets.sumOf { it.kg * it.reps } }

    val isResting: Boolean
        get() = restEndsAtMs != null

    /** Milliseconds left in the current rest timer as of [now]; 0 when none is running or it has
     * already elapsed. Pure — callers decide what to do with a zero/negative result. */
    fun restRemainingMs(now: Long): Long {
        val endsAt = restEndsAtMs ?: return 0L
        return (endsAt - now).coerceAtLeast(0L)
    }

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
     * card), prefilled set-by-set from its last session's working sets (e.g. a last session of
     * [80×8, 80×8, 82.5×6] produces three pending rows, each carrying its own romPct) — or a
     * single 20kg×10회 ROM100% row when there is no usable history — then focuses the new card
     * and switches to [ACTIVE].
     */
    fun addExercise(
        exercise: WearStrengthExercise,
        afterIndex: Int = activeCardIndex,
    ): WearStrengthSessionState {
        val newCard = WearStrengthCard(
            exerciseId = exercise.exerciseId,
            name = exercise.name,
            muscleId = exercise.muscleId,
            movementId = exercise.movementId,
            stepKg = exercise.stepKg,
            // A program-registered exercise (웬들러 주차 처방 / 트랙) opens with that week's rows
            // already laid out, exactly like the phone's picker. Otherwise one blank row —
            // pulling the *previous session* stays an explicit action on the 지난 기록 strip
            // ([copyPreviousSets]), never automatic.
            sets = plannedSetsFromProgram(exercise.program) ?: listOf(
                PlannedSet(kg = DEFAULT_DRAFT_KG, reps = DEFAULT_DRAFT_REPS, romPct = DEFAULT_DRAFT_ROM_PCT),
            ),
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

    /**
     * Logs the pending set at (cardIdx, setIdx): marks it done with [now], and — when it was the
     * last row in the card (there is always a "next set" on offer, Strong/Hevy-style) — appends a
     * fresh pending row carrying over its kg/reps/romPct/setType. No-ops for an out-of-range index
     * or a row that is already done.
     *
     * The appended row deliberately drops `role`/`amrap`: it is an *extra* set the user chose to
     * do past the end of the prescription, so labelling it BBB (or AMRAP) would be a lie.
     */
    fun logSet(cardIdx: Int, setIdx: Int, now: Long): WearStrengthSessionState {
        val card = cards.getOrNull(cardIdx) ?: return this
        val target = card.sets.getOrNull(setIdx) ?: return this
        if (target.done) return this
        val loggedRow = target.copy(done = true, completedAt = now)
        val nextSets = card.sets.toMutableList().also { it[setIdx] = loggedRow }
        if (setIdx == nextSets.lastIndex) {
            nextSets.add(
                PlannedSet(
                    kg = loggedRow.kg,
                    reps = loggedRow.reps,
                    romPct = loggedRow.romPct,
                    rir = loggedRow.rir,
                    setType = loggedRow.setType,
                ),
            )
        }
        return replaceCard(cardIdx, card.copy(sets = nextSets))
    }

    /** Un-logs a done row back to pending, clearing its completedAt. No-op if already pending. */
    fun unlogSet(cardIdx: Int, setIdx: Int): WearStrengthSessionState {
        val card = cards.getOrNull(cardIdx) ?: return this
        val target = card.sets.getOrNull(setIdx) ?: return this
        if (!target.done) return this
        val nextSets = card.sets.toMutableList().also { it[setIdx] = target.copy(done = false, completedAt = null) }
        return replaceCard(cardIdx, card.copy(sets = nextSets))
    }

    /** delta is in "steps": the actual kg movement is `delta * card.stepKg` (fallback 2.5). */
    fun updateSetKg(cardIdx: Int, setIdx: Int, delta: Int): WearStrengthSessionState = updateSet(cardIdx, setIdx) { set, card ->
        val step = card.stepKg.takeIf { it > 0.0 } ?: DEFAULT_STEP_KG
        set.copy(kg = clampKg(roundToHalf(set.kg + delta * step)))
    }

    fun updateSetReps(cardIdx: Int, setIdx: Int, delta: Int): WearStrengthSessionState = updateSet(cardIdx, setIdx) { set, _ ->
        set.copy(reps = clampReps(set.reps + delta))
    }

    /** delta is in "steps" of [ROM_STEP_PCT] percent. */
    fun updateSetRom(cardIdx: Int, setIdx: Int, delta: Int): WearStrengthSessionState = updateSet(cardIdx, setIdx) { set, _ ->
        set.copy(romPct = clampRom(set.romPct + delta * ROM_STEP_PCT))
    }

    /**
     * Adjusts Reps In Reserve (0-5, null = unset). An unset row's first `+1` tap sets it to
     * [DEFAULT_RIR_ON_SET] (a sensible starting point matching the phone's progressive-overload
     * default); an unset row ignores a `-1` tap (nothing to decrement). Once set, `delta` moves it
     * within the 0-5 clamp, and dropping below 0 unsets it again rather than going negative.
     */
    fun adjustRir(cardIdx: Int, setIdx: Int, delta: Int): WearStrengthSessionState = updateSet(cardIdx, setIdx) { set, _ ->
        val current = set.rir
        val next = if (current == null) {
            if (delta > 0) DEFAULT_RIR_ON_SET else null
        } else {
            val moved = current + delta
            if (moved < MIN_RIR) null else moved.coerceAtMost(MAX_RIR)
        }
        set.copy(rir = next)
    }

    /** Manually appends a pending row to [cardIdx] (the "+ 세트 추가" pill), carrying over the
     * last row's values — or the defaults when the card somehow has no rows yet. */
    fun addPlannedSet(cardIdx: Int): WearStrengthSessionState {
        val card = cards.getOrNull(cardIdx) ?: return this
        val last = card.sets.lastOrNull()
        val newSet = PlannedSet(
            kg = last?.kg ?: DEFAULT_DRAFT_KG,
            reps = last?.reps ?: DEFAULT_DRAFT_REPS,
            romPct = last?.romPct ?: DEFAULT_DRAFT_ROM_PCT,
            rir = last?.rir,
            setType = last?.setType ?: SET_TYPE_MAIN,
        )
        return replaceCard(cardIdx, card.copy(sets = card.sets + newSet))
    }

    /**
     * Replaces [cardIdx]'s rows with every working set of [lastSession] — the watch side of the
     * phone's "지난 기록 · 전체 세트 복사" strip (calendar/detail-template.js). Replace, not append,
     * and each copied row comes back pending so it still has to be checked off. No-op when the
     * previous session has nothing worth copying.
     */
    fun copyPreviousSets(cardIdx: Int, lastSession: WearStrengthLastSession?): WearStrengthSessionState {
        val card = cards.getOrNull(cardIdx) ?: return this
        val copied = plannedSetsFrom(lastSession) ?: return this
        return replaceCard(cardIdx, card.copy(sets = copied))
    }

    /** Starts (or restarts) the rest timer; defaults to 90s. */
    fun startRest(now: Long, durationMs: Long = DEFAULT_REST_MS): WearStrengthSessionState {
        return copy(restEndsAtMs = now + durationMs, restTotalMs = durationMs)
    }

    /** Extends a running timer by [extraMs] (default 15s); no-op when nothing is running. Both
     * the deadline and the total grow together so the countdown ring's progress stays in [0,1]. */
    fun extendRest(extraMs: Long = REST_EXTEND_MS): WearStrengthSessionState {
        val endsAt = restEndsAtMs ?: return this
        return copy(restEndsAtMs = endsAt + extraMs, restTotalMs = restTotalMs + extraMs)
    }

    fun clearRest(): WearStrengthSessionState = copy(restEndsAtMs = null, restTotalMs = 0L)

    /** Requires at least one logged set across all cards; otherwise this is a no-op. Clears any
     * running rest timer — the workout is over. */
    fun finish(now: Long): WearStrengthSessionState {
        if (screen == WearStrengthScreen.SUMMARY) return this
        if (totalSets < 1) return this
        return copy(screen = WearStrengthScreen.SUMMARY, endedAt = now, restEndsAtMs = null, restTotalMs = 0L)
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
            .putNullable("restEndsAtMs", restEndsAtMs)
            .put("restTotalMs", restTotalMs)
    }

    private fun replaceCard(cardIdx: Int, card: WearStrengthCard): WearStrengthSessionState {
        val nextCards = cards.toMutableList().also { it[cardIdx] = card }
        return copy(cards = nextCards)
    }

    private inline fun updateSet(
        cardIdx: Int,
        setIdx: Int,
        transform: (PlannedSet, WearStrengthCard) -> PlannedSet,
    ): WearStrengthSessionState {
        val card = cards.getOrNull(cardIdx) ?: return this
        val set = card.sets.getOrNull(setIdx) ?: return this
        val nextSets = card.sets.toMutableList().also { it[setIdx] = transform(set, card) }
        return replaceCard(cardIdx, card.copy(sets = nextSets))
    }

    companion object {
        const val VERSION = 2
        private const val LEGACY_VERSION_1 = 1
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
        const val DEFAULT_REST_MS = 90_000L
        const val REST_EXTEND_MS = 15_000L
        const val MIN_RIR = 0
        const val MAX_RIR = 5
        const val DEFAULT_RIR_ON_SET = 2
        private const val SET_TYPE_WARMUP = "warmup"
        private const val SET_TYPE_DELOAD = "deload"

        fun fromJson(raw: String): WearStrengthSessionState? {
            return try {
                fromJsonObject(JSONObject(raw))
            } catch (_: Exception) {
                null
            }
        }

        internal fun fromJsonObject(json: JSONObject): WearStrengthSessionState? {
            return try {
                when (json.optInt("version", -1)) {
                    VERSION -> fromCurrentJsonObject(json)
                    LEGACY_VERSION_1 -> migrateV1JsonObject(json)
                    else -> null
                }
            } catch (_: Exception) {
                null
            }
        }

        private fun fromCurrentJsonObject(json: JSONObject): WearStrengthSessionState? {
            val screen = WearStrengthScreen.valueOf(json.getString("screen"))
            val cards = jsonToCards(json.optJSONArray("cards"))
            val rawActiveCardIndex = json.optInt("activeCardIndex", -1)
            return WearStrengthSessionState(
                screen = screen,
                cards = cards,
                activeCardIndex = if (rawActiveCardIndex in cards.indices) rawActiveCardIndex else -1,
                startedAt = json.optLong("startedAt", 0L).coerceAtLeast(0L),
                endedAt = json.optNullableLong("endedAt"),
                restEndsAtMs = json.optNullableLong("restEndsAtMs"),
                restTotalMs = json.optLong("restTotalMs", 0L).coerceAtLeast(0L),
            )
        }

        /**
         * Migrates the pre-checklist (version 1) snapshot shape: each card's `loggedSets` become
         * done [PlannedSet] rows, and its single `draftKg`/`draftReps`/`draftRomPct` editor
         * becomes one trailing pending row. The rest timer is new in version 2, so a migrated
         * snapshot always starts with no rest timer running.
         */
        private fun migrateV1JsonObject(json: JSONObject): WearStrengthSessionState? {
            val screen = WearStrengthScreen.valueOf(json.getString("screen"))
            val cardsArray = json.optJSONArray("cards")
            val cards = mutableListOf<WearStrengthCard>()
            if (cardsArray != null) {
                for (index in 0 until cardsArray.length()) {
                    val item = cardsArray.optJSONObject(index) ?: continue
                    val exerciseId = item.optString("exerciseId", "")
                    val name = item.optString("name", "")
                    if (exerciseId.isBlank() || name.isBlank()) continue
                    val stepKg = item.optDouble("stepKg", DEFAULT_STEP_KG)
                        .takeIf { it.isFinite() && it > 0.0 } ?: DEFAULT_STEP_KG
                    val draftKg = clampKg(
                        item.optDouble("draftKg", DEFAULT_DRAFT_KG).takeIf { it.isFinite() } ?: DEFAULT_DRAFT_KG,
                    )
                    val draftReps = clampReps(item.optInt("draftReps", DEFAULT_DRAFT_REPS))
                    val draftRomPct = clampRom(item.optInt("draftRomPct", DEFAULT_DRAFT_ROM_PCT))
                    val doneSets = migrateV1LoggedSets(item.optJSONArray("loggedSets"))
                    val sets = doneSets + PlannedSet(kg = draftKg, reps = draftReps, romPct = draftRomPct)
                    cards.add(
                        WearStrengthCard(
                            exerciseId = exerciseId,
                            name = name,
                            muscleId = item.optString("muscleId", ""),
                            movementId = item.optString("movementId", ""),
                            stepKg = stepKg,
                            sets = sets,
                        ),
                    )
                }
            }
            val rawActiveCardIndex = json.optInt("activeCardIndex", -1)
            return WearStrengthSessionState(
                screen = screen,
                cards = cards,
                activeCardIndex = if (rawActiveCardIndex in cards.indices) rawActiveCardIndex else -1,
                startedAt = json.optLong("startedAt", 0L).coerceAtLeast(0L),
                endedAt = json.optNullableLong("endedAt"),
                restEndsAtMs = null,
                restTotalMs = 0L,
            )
        }

        private fun migrateV1LoggedSets(array: JSONArray?): List<PlannedSet> {
            if (array == null) return emptyList()
            val sets = mutableListOf<PlannedSet>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val kg = item.optDouble("kg", Double.NaN)
                val reps = item.optInt("reps", -1)
                val romPct = item.optInt("romPct", -1)
                val completedAt = item.optLong("completedAt", -1L)
                if (!kg.isFinite() || kg < 0.0 || reps <= 0 || romPct <= 0 || completedAt < 0L) continue
                sets.add(PlannedSet(kg = kg, reps = reps, romPct = romPct, done = true, completedAt = completedAt))
            }
            return sets
        }

        private fun clampKg(value: Double): Double = value.coerceIn(MIN_KG, MAX_KG)
        private fun clampReps(value: Int): Int = value.coerceIn(MIN_REPS, MAX_REPS)
        private fun clampRom(value: Int): Int = value.coerceIn(MIN_ROM_PCT, MAX_ROM_PCT)
        private fun roundToHalf(value: Double): Double = (value * 2.0).roundToInt() / 2.0

        /**
         * The previous session's working sets, or null when it has none worth copying. Mirrors the
         * phone's `_isActualWorkoutSet` (calendar/format.js): warm-up and deload rows never count.
         */
        fun plannedSetsFrom(lastSession: WearStrengthLastSession?): List<PlannedSet>? {
            val workingSets = lastSession?.sets
                ?.filter { it.done && it.setType != SET_TYPE_WARMUP && it.setType != SET_TYPE_DELOAD }
                .orEmpty()
            if (workingSets.isEmpty()) return null
            return workingSets.map {
                PlannedSet(
                    kg = clampKg(it.kg),
                    reps = clampReps(it.reps),
                    romPct = clampRom(it.romPct),
                    rir = it.rir?.coerceIn(MIN_RIR, MAX_RIR),
                    setType = SET_TYPE_MAIN,
                )
            }
        }

        /**
         * That week's prescribed rows for a program-registered exercise, straight from the phone's
         * `program` block — the watch side of the phone picker's
         * `_testModeSetsFromPrescription` (workout/exercises.js). Every row comes back *pending*,
         * so a Wendler card opens with the full 웜업/메인/보조 checklist still to be checked off.
         * Null when there is no program (or none of its rows survived clamping).
         */
        fun plannedSetsFromProgram(program: WearStrengthProgram?): List<PlannedSet>? {
            val rows = program?.sets.orEmpty()
            if (rows.isEmpty()) return null
            return rows.map {
                PlannedSet(
                    kg = clampKg(it.kg),
                    reps = clampReps(it.reps),
                    romPct = clampRom(it.romPct),
                    setType = it.setType,
                    role = it.role,
                    amrap = it.amrap,
                    supplementalKind = it.supplementalKind,
                )
            }
        }

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
                            .put("sets", plannedSetsToJson(card.sets)),
                    )
                }
            }
        }

        private fun plannedSetsToJson(sets: List<PlannedSet>): JSONArray {
            return JSONArray().apply {
                sets.forEach { set ->
                    put(
                        JSONObject()
                            .put("kg", set.kg)
                            .put("reps", set.reps)
                            .put("romPct", set.romPct)
                            .put("done", set.done)
                            .putNullable("completedAt", set.completedAt)
                            .putNullable("rir", set.rir)
                            .put("setType", set.setType)
                            .putNullable("role", set.role)
                            .put("amrap", set.amrap)
                            .putNullable("supplementalKind", set.supplementalKind),
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
                cards.add(
                    WearStrengthCard(
                        exerciseId = exerciseId,
                        name = name,
                        muscleId = item.optString("muscleId", ""),
                        movementId = item.optString("movementId", ""),
                        stepKg = stepKg,
                        sets = jsonToPlannedSets(item.optJSONArray("sets")),
                    ),
                )
            }
            return cards
        }

        private fun jsonToPlannedSets(array: JSONArray?): List<PlannedSet> {
            if (array == null) return emptyList()
            val sets = mutableListOf<PlannedSet>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val kg = item.optDouble("kg", Double.NaN)
                val reps = item.optInt("reps", -1)
                val romPct = item.optInt("romPct", -1)
                if (!kg.isFinite() || kg < 0.0 || reps <= 0 || romPct <= 0) continue
                val done = item.optBoolean("done", false)
                val completedAt = item.optNullableLong("completedAt")
                val rir = item.optNullableLong("rir")?.toInt()?.coerceIn(MIN_RIR, MAX_RIR)
                // setType/role/amrap are additive (added with program prescriptions), so a
                // snapshot written before them restores as a plain main row rather than failing.
                val setType = item.optTextOrEmpty("setType").takeIf { it.isNotBlank() } ?: SET_TYPE_MAIN
                val role = item.optTextOrEmpty("role").takeIf { it.isNotBlank() }
                val supplementalKind = item.optTextOrEmpty("supplementalKind").takeIf { it.isNotBlank() }
                sets.add(
                    PlannedSet(
                        kg = kg,
                        reps = reps,
                        romPct = romPct,
                        done = done,
                        completedAt = completedAt,
                        rir = rir,
                        setType = setType,
                        role = role,
                        amrap = item.optBoolean("amrap", false),
                        supplementalKind = supplementalKind,
                    ),
                )
            }
            return sets
        }
    }
}

private fun JSONObject.putNullable(name: String, value: Any?): JSONObject = put(name, value ?: JSONObject.NULL)

private fun JSONObject.optNullableLong(name: String): Long? {
    return if (has(name) && !isNull(name)) optLong(name) else null
}
