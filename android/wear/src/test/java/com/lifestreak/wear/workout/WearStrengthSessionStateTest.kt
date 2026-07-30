package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearStrengthSessionStateTest {
    private fun exercise(
        exerciseId: String = "bench-press",
        stepKg: Double = 2.5,
        lastSession: WearStrengthLastSession? = null,
    ): WearStrengthExercise {
        return WearStrengthExercise(
            exerciseId = exerciseId,
            name = "바벨 벤치프레스",
            muscleId = "chest",
            movementId = "barbell-press",
            stepKg = stepKg,
            lastSession = lastSession,
        )
    }

    @Test
    fun startEntersPickerWithEmptyCarousel() {
        val state = WearStrengthSessionState().start(now = 1_000L)
        assertEquals(WearStrengthScreen.PICKER, state.screen)
        assertTrue(state.cards.isEmpty())
        assertEquals(-1, state.activeCardIndex)
        assertEquals(1_000L, state.startedAt)
    }

    @Test
    fun addExerciseCreatesCardAndSwitchesToActive() {
        val state = WearStrengthSessionState().start(now = 1_000L).addExercise(exercise())
        assertEquals(WearStrengthScreen.ACTIVE, state.screen)
        assertEquals(1, state.cards.size)
        assertEquals(0, state.activeCardIndex)
        assertEquals("bench-press", state.activeCard?.exerciseId)
    }

    @Test
    fun addExercisePrefillsFromTopSetWhenLastSessionExists() {
        val lastSession = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(
                WearStrengthLastSet(kg = 40.0, reps = 10, romPct = 100, setType = "warmup", done = true),
                WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 95, setType = "main", done = true),
            ),
        )
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(lastSession = lastSession))
        val card = state.activeCard!!
        assertEquals(80.0, card.draftKg, 0.0001)
        assertEquals(8, card.draftReps)
        assertEquals(95, card.draftRomPct)
    }

    @Test
    fun addExerciseFallsBackToDefaultsWithoutLastSession() {
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(lastSession = null))
        val card = state.activeCard!!
        assertEquals(20.0, card.draftKg, 0.0001)
        assertEquals(10, card.draftReps)
        assertEquals(100, card.draftRomPct)
    }

    @Test
    fun addExerciseInsertsAfterActiveCard() {
        var state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(exerciseId = "a"))
            .addExercise(exercise(exerciseId = "b"))
        assertEquals(listOf("a", "b"), state.cards.map { it.exerciseId })
        assertEquals(1, state.activeCardIndex)

        state = state.selectCard(0).addExercise(exercise(exerciseId = "c"))
        assertEquals(listOf("a", "c", "b"), state.cards.map { it.exerciseId })
        assertEquals(1, state.activeCardIndex)
    }

    @Test
    fun adjustKgUsesCardStepKgAndDefaultsWhenNonPositive() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise(stepKg = 5.0))
        state = state.adjustKg(2)
        assertEquals(30.0, state.activeCard!!.draftKg, 0.0001) // 20 + 2*5

        var zeroStepState = WearStrengthSessionState().start(1_000L).addExercise(exercise(stepKg = 0.0))
        zeroStepState = zeroStepState.adjustKg(1)
        assertEquals(22.5, zeroStepState.activeCard!!.draftKg, 0.0001) // 20 + 1*2.5 default
    }

    @Test
    fun adjustKgClampsToZeroAndFiveHundredAndRoundsToNearestHalf() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustKg(-1000)
        assertEquals(0.0, state.activeCard!!.draftKg, 0.0001)

        state = state.adjustKg(10_000)
        assertEquals(500.0, state.activeCard!!.draftKg, 0.0001)
    }

    @Test
    fun adjustRepsClampsBetweenOneAndOneHundred() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustReps(-1000)
        assertEquals(1, state.activeCard?.draftReps)
        state = state.adjustReps(10_000)
        assertEquals(100, state.activeCard?.draftReps)
    }

    @Test
    fun adjustRomMovesByFivePercentStepsAndClamps() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustRom(-1)
        assertEquals(95, state.activeCard?.draftRomPct)
        state = state.adjustRom(-100)
        assertEquals(10, state.activeCard?.draftRomPct)
        state = state.adjustRom(100)
        assertEquals(100, state.activeCard?.draftRomPct)
    }

    @Test
    fun completeSetAppendsLoggedSetAndCarriesOverDrafts() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustKg(4).adjustReps(2) // 30kg x 12
        state = state.completeSet(now = 2_000L)
        assertEquals(1, state.activeCard?.loggedSets?.size)
        val firstSet = state.activeCard!!.loggedSets[0]
        assertEquals(30.0, firstSet.kg, 0.0001)
        assertEquals(12, firstSet.reps)
        assertEquals(2_000L, firstSet.completedAt)

        // Drafts carry over into the next logged set.
        state = state.completeSet(now = 2_100L)
        assertEquals(2, state.activeCard?.loggedSets?.size)
        assertEquals(30.0, state.activeCard!!.loggedSets[1].kg, 0.0001)
    }

    @Test
    fun undoLastSetRemovesMostRecentSetOnly() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.completeSet(2_000L).completeSet(2_100L)
        assertEquals(2, state.activeCard?.loggedSets?.size)
        state = state.undoLastSet()
        assertEquals(1, state.activeCard?.loggedSets?.size)
        state = state.undoLastSet().undoLastSet()
        assertEquals(0, state.activeCard?.loggedSets?.size)
    }

    @Test
    fun finishRequiresAtLeastOneLoggedSet() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        val untouched = state.finish(now = 5_000L)
        assertEquals(WearStrengthScreen.ACTIVE, untouched.screen)

        state = state.completeSet(2_000L).finish(now = 5_000L)
        assertEquals(WearStrengthScreen.SUMMARY, state.screen)
        assertEquals(5_000L, state.endedAt)
    }

    @Test
    fun buildSessionReflectsStartedAndEndedAt() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise())
            .completeSet(2_000L)
            .finish(3_000L)
        val session = state.buildSession()
        assertEquals(1_000L, session.startedAtMs)
        assertEquals(3_000L, session.endedAtMs)
        assertEquals(1, session.cards.size)
    }

    @Test
    fun closePickerReturnsToActiveOnlyWhenCardsExist() {
        val emptyPickerState = WearStrengthSessionState().start(1_000L)
        assertEquals(WearStrengthScreen.PICKER, emptyPickerState.closePicker().screen)

        val withCard = emptyPickerState.addExercise(exercise()).openPicker()
        assertEquals(WearStrengthScreen.ACTIVE, withCard.closePicker().screen)
    }

    @Test
    fun toJsonRoundTripsThroughFromJson() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(exerciseId = "a"))
            .completeSet(2_000L)
            .addExercise(exercise(exerciseId = "b"))
            .adjustKg(1)

        val restored = WearStrengthSessionState.fromJson(state.toJson())
        assertEquals(state, restored)
    }

    @Test
    fun fromJsonReturnsNullForWrongVersionOrGarbage() {
        assertNull(WearStrengthSessionState.fromJson("not json"))
        assertNull(WearStrengthSessionState.fromJson("""{"version":99,"screen":"IDLE"}"""))
    }
}
