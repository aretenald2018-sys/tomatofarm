package com.lifestreak.wear.workout

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class WearStrengthSessionStateTest {
    private fun exercise(
        exerciseId: String = "bench-press",
        stepKg: Double = 2.5,
        lastSession: WearStrengthLastSession? = null,
        program: WearStrengthProgram? = null,
    ): WearStrengthExercise {
        return WearStrengthExercise(
            exerciseId = exerciseId,
            name = "바벨 벤치프레스",
            muscleId = "chest",
            movementId = "barbell-press",
            stepKg = stepKg,
            lastSession = lastSession,
            program = program,
        )
    }

    /** 5/3/1 3주차 처방을 축약한 형태: 워밍업 1 + 메인 3(마지막 AMRAP) + BBB 2. */
    private fun wendlerProgram(): WearStrengthProgram = WearStrengthProgram(
        kind = "wendler",
        label = "웬들러 5/3/1 · 142.5kg x 1+ · BBB 75kg 5x10",
        shortLabel = "웬들러 5/3/1",
        weekLabel = "3주차",
        sets = listOf(
            WearStrengthProgramSet(60.0, 5, 100, "warmup", "warmup", false, null),
            WearStrengthProgramSet(112.5, 5, 100, "main", "main", false, null),
            WearStrengthProgramSet(127.5, 3, 100, "main", "main", false, null),
            WearStrengthProgramSet(142.5, 1, 100, "main", "main", true, null),
            WearStrengthProgramSet(75.0, 10, 100, "main", "supplemental", false, "bbb"),
            WearStrengthProgramSet(75.0, 10, 100, "main", "supplemental", false, "bbb"),
        ),
    )

    // ---- start / picker --------------------------------------------------------------------

    @Test
    fun startEntersPickerWithEmptyCarousel() {
        val state = WearStrengthSessionState().start(now = 1_000L)
        assertEquals(WearStrengthScreen.PICKER, state.screen)
        assertTrue(state.cards.isEmpty())
        assertEquals(-1, state.activeCardIndex)
        assertEquals(1_000L, state.startedAt)
    }

    @Test
    fun closePickerReturnsToActiveOnlyWhenCardsExist() {
        val emptyPickerState = WearStrengthSessionState().start(1_000L)
        assertEquals(WearStrengthScreen.PICKER, emptyPickerState.closePicker().screen)

        val withCard = emptyPickerState.addExercise(exercise()).openPicker()
        assertEquals(WearStrengthScreen.ACTIVE, withCard.closePicker().screen)
    }

    // ---- addExercise / 지난 기록 복사 ----------------------------------------------------------

    @Test
    fun addExerciseCreatesCardAndSwitchesToActive() {
        val state = WearStrengthSessionState().start(now = 1_000L).addExercise(exercise())
        assertEquals(WearStrengthScreen.ACTIVE, state.screen)
        assertEquals(1, state.cards.size)
        assertEquals(0, state.activeCardIndex)
        assertEquals("bench-press", state.activeCard?.exerciseId)
    }

    @Test
    fun addExerciseAlwaysStartsWithOneBlankRowEvenWhenAPreviousSessionExists() {
        // 폰 카드와 동일하게, 추가 시점에는 자동으로 지난 기록을 채우지 않는다.
        val lastSession = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 100, setType = "main", done = true)),
        )
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(lastSession = lastSession))
        val sets = state.activeCard!!.sets
        assertEquals(1, sets.size)
        assertEquals(20.0, sets[0].kg, 0.0001)
        assertEquals(10, sets[0].reps)
    }

    @Test
    fun addExerciseFallsBackToOneDefaultRowWithoutLastSession() {
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(lastSession = null))
        val sets = state.activeCard!!.sets
        assertEquals(1, sets.size)
        assertEquals(20.0, sets[0].kg, 0.0001)
        assertEquals(10, sets[0].reps)
        assertEquals(100, sets[0].romPct)
        assertEquals(false, sets[0].done)
        assertNull(sets[0].completedAt)
        assertNull(sets[0].rir)
    }

    @Test
    fun copyPreviousSetsCreatesOneRowPerLastSessionWorkingSet() {
        // 지난 세션 [80x8, 80x8, 82.5x6] -> 정확히 3개의 대기 행, 각자의 romPct/rir을 유지.
        val lastSession = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(
                WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 100, setType = "main", done = true, rir = 3),
                WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 95, setType = "main", done = true, rir = 2),
                WearStrengthLastSet(kg = 82.5, reps = 6, romPct = 90, setType = "main", done = true, rir = 1),
            ),
        )
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(lastSession = lastSession))
            .copyPreviousSets(0, lastSession)
        val sets = state.activeCard!!.sets
        assertEquals(3, sets.size)
        assertTrue(sets.all { !it.done })
        assertEquals(listOf(80.0, 80.0, 82.5), sets.map { it.kg })
        assertEquals(listOf(8, 8, 6), sets.map { it.reps })
        assertEquals(listOf(100, 95, 90), sets.map { it.romPct })
        assertEquals(listOf(3, 2, 1), sets.map { it.rir })
    }

    @Test
    fun copyPreviousSetsExcludesWarmupDeloadAndNotDoneSets() {
        val lastSession = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(
                WearStrengthLastSet(kg = 40.0, reps = 10, romPct = 100, setType = "warmup", done = true),
                WearStrengthLastSet(kg = 45.0, reps = 10, romPct = 100, setType = "deload", done = true),
                WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 100, setType = "main", done = true),
                WearStrengthLastSet(kg = 82.5, reps = 6, romPct = 90, setType = "main", done = false),
            ),
        )
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(lastSession = lastSession))
            .copyPreviousSets(0, lastSession)
        val sets = state.activeCard!!.sets
        assertEquals(1, sets.size)
        assertEquals(80.0, sets[0].kg, 0.0001)
        assertEquals(8, sets[0].reps)
    }

    @Test
    fun copyPreviousSetsReplacesExistingRowsAndIsANoOpWithoutAWorkingSet() {
        val empty = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(WearStrengthLastSet(kg = 40.0, reps = 10, romPct = 100, setType = "warmup", done = true)),
        )
        val added = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(lastSession = empty))
            .addPlannedSet(0)
        assertEquals(2, added.activeCard!!.sets.size)

        // 복사할 본세트가 없으면 카드를 건드리지 않는다.
        assertSame(added, added.copyPreviousSets(0, empty))
        assertSame(added, added.copyPreviousSets(0, null))
        assertSame(added, added.copyPreviousSets(9, empty))

        // 있으면 append가 아니라 replace.
        val real = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 100, setType = "main", done = true)),
        )
        val copied = added.copyPreviousSets(0, real)
        assertEquals(1, copied.activeCard!!.sets.size)
        assertEquals(80.0, copied.activeCard!!.sets[0].kg, 0.0001)
        assertEquals(false, copied.activeCard!!.sets[0].done)
        assertNull(copied.activeCard!!.sets[0].completedAt)
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

    // ---- logSet / unlogSet --------------------------------------------------------------------

    @Test
    fun logSetMarksDoneAndAppendsCarryOverRowWhenItWasTheLastRow() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        // Single default pending row (20kg x 10, ROM100) at (0, 0).
        state = state.logSet(cardIdx = 0, setIdx = 0, now = 2_000L)

        val sets = state.cards[0].sets
        assertEquals(2, sets.size)
        assertTrue(sets[0].done)
        assertEquals(2_000L, sets[0].completedAt)
        assertEquals(20.0, sets[0].kg, 0.0001)
        // Carry-over row: same kg/reps/romPct/rir, pending.
        assertEquals(false, sets[1].done)
        assertNull(sets[1].completedAt)
        assertEquals(20.0, sets[1].kg, 0.0001)
        assertEquals(10, sets[1].reps)
        assertEquals(100, sets[1].romPct)
    }

    @Test
    fun logSetCarriesOverRirOntoTheAppendedRow() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustRir(0, 0, 1) // null -> 2
        state = state.logSet(0, 0, 2_000L)
        assertEquals(2, state.cards[0].sets[0].rir)
        assertEquals(2, state.cards[0].sets[1].rir)
    }

    @Test
    fun logSetOnANonLastRowDoesNotAppendAnotherRow() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.addPlannedSet(0).addPlannedSet(0) // now 3 pending rows
        assertEquals(3, state.cards[0].sets.size)

        state = state.logSet(0, 0, 2_000L)
        assertEquals(3, state.cards[0].sets.size)
        assertTrue(state.cards[0].sets[0].done)
        assertEquals(false, state.cards[0].sets[1].done)
    }

    @Test
    fun logSetIsNoOpWhenAlreadyDoneOrOutOfRange() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.logSet(0, 0, 2_000L)
        val afterFirstLog = state
        state = state.logSet(0, 0, 3_000L) // row 0 is already done now
        assertEquals(afterFirstLog, state)

        val outOfRange = state.logSet(5, 0, 4_000L)
        assertEquals(state, outOfRange)
    }

    @Test
    fun unlogSetRestoresPendingAndClearsCompletedAt() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.logSet(0, 0, 2_000L)
        assertTrue(state.cards[0].sets[0].done)

        state = state.unlogSet(0, 0)
        assertEquals(false, state.cards[0].sets[0].done)
        assertNull(state.cards[0].sets[0].completedAt)
    }

    @Test
    fun unlogSetIsNoOpWhenAlreadyPendingOrOutOfRange() {
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        assertEquals(state, state.unlogSet(0, 0))
        assertEquals(state, state.unlogSet(9, 9))
    }

    // ---- updateSetKg/Reps/Rom ------------------------------------------------------------------

    @Test
    fun updateSetKgUsesCardStepKgAndDefaultsWhenNonPositive() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise(stepKg = 5.0))
        state = state.updateSetKg(0, 0, 2)
        assertEquals(30.0, state.cards[0].sets[0].kg, 0.0001) // 20 + 2*5

        var zeroStepState = WearStrengthSessionState().start(1_000L).addExercise(exercise(stepKg = 0.0))
        zeroStepState = zeroStepState.updateSetKg(0, 0, 1)
        assertEquals(22.5, zeroStepState.cards[0].sets[0].kg, 0.0001) // 20 + 1*2.5 default
    }

    @Test
    fun updateSetKgClampsToZeroAndFiveHundredAndRoundsToNearestHalf() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.updateSetKg(0, 0, -1000)
        assertEquals(0.0, state.cards[0].sets[0].kg, 0.0001)

        state = state.updateSetKg(0, 0, 10_000)
        assertEquals(500.0, state.cards[0].sets[0].kg, 0.0001)
    }

    @Test
    fun updateSetRepsClampsBetweenOneAndOneHundred() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.updateSetReps(0, 0, -1000)
        assertEquals(1, state.cards[0].sets[0].reps)
        state = state.updateSetReps(0, 0, 10_000)
        assertEquals(100, state.cards[0].sets[0].reps)
    }

    @Test
    fun updateSetRomMovesByFivePercentStepsAndClamps() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.updateSetRom(0, 0, -1)
        assertEquals(95, state.cards[0].sets[0].romPct)
        state = state.updateSetRom(0, 0, -100)
        assertEquals(10, state.cards[0].sets[0].romPct)
        state = state.updateSetRom(0, 0, 100)
        assertEquals(100, state.cards[0].sets[0].romPct)
    }

    @Test
    fun updateSetKgRepsRomAreNoOpsOutOfRange() {
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        assertEquals(state, state.updateSetKg(9, 0, 1))
        assertEquals(state, state.updateSetReps(0, 9, 1))
        assertEquals(state, state.updateSetRom(9, 9, 1))
    }

    // ---- adjustRir ------------------------------------------------------------------------------

    @Test
    fun adjustRirFirstPlusTapFromUnsetGoesToTwo() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        assertNull(state.cards[0].sets[0].rir)
        state = state.adjustRir(0, 0, 1)
        assertEquals(2, state.cards[0].sets[0].rir)
    }

    @Test
    fun adjustRirMinusTapWhileUnsetIsANoOp() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustRir(0, 0, -1)
        assertNull(state.cards[0].sets[0].rir)
    }

    @Test
    fun adjustRirMovesWithinZeroToFiveClamp() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustRir(0, 0, 1) // -> 2
        state = state.adjustRir(0, 0, 1) // -> 3
        assertEquals(3, state.cards[0].sets[0].rir)
        repeat(5) { state = state.adjustRir(0, 0, 1) }
        assertEquals(5, state.cards[0].sets[0].rir) // clamped at MAX_RIR
    }

    @Test
    fun adjustRirDroppingBelowZeroUnsetsItAgain() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.adjustRir(0, 0, 1) // -> 2
        state = state.adjustRir(0, 0, -2) // -> 0
        assertEquals(0, state.cards[0].sets[0].rir)
        state = state.adjustRir(0, 0, -1) // -> -1 -> unset
        assertNull(state.cards[0].sets[0].rir)
    }

    // ---- addPlannedSet -------------------------------------------------------------------------

    @Test
    fun addPlannedSetCarriesOverLastRowValuesIncludingRir() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.updateSetKg(0, 0, 4).updateSetReps(0, 0, 2).adjustRir(0, 0, 1) // 30kg x 12, rir 2
        state = state.addPlannedSet(0)
        assertEquals(2, state.cards[0].sets.size)
        val added = state.cards[0].sets[1]
        assertEquals(30.0, added.kg, 0.0001)
        assertEquals(12, added.reps)
        assertEquals(2, added.rir)
        assertEquals(false, added.done)
    }

    @Test
    fun addPlannedSetUsesDefaultsWhenCardSomehowHasNoRows() {
        // Not reachable via normal flows (a card always starts with >=1 row), but addPlannedSet
        // should still degrade gracefully rather than throw.
        val cardWithNoRows = WearStrengthCard(
            exerciseId = "x",
            name = "x",
            muscleId = "m",
            movementId = "mv",
            stepKg = 2.5,
            sets = emptyList(),
        )
        val state = WearStrengthSessionState(cards = listOf(cardWithNoRows)).addPlannedSet(0)
        val added = state.cards[0].sets.single()
        assertEquals(20.0, added.kg, 0.0001)
        assertEquals(10, added.reps)
        assertEquals(100, added.romPct)
        assertNull(added.rir)
    }

    // ---- rest timer -----------------------------------------------------------------------------

    @Test
    fun startRestDefaultsToNinetySeconds() {
        val state = WearStrengthSessionState().startRest(now = 10_000L)
        assertEquals(10_000L + WearStrengthSessionState.DEFAULT_REST_MS, state.restEndsAtMs)
        assertEquals(WearStrengthSessionState.DEFAULT_REST_MS, state.restTotalMs)
        assertTrue(state.isResting)
    }

    @Test
    fun restRemainingMsCountsDownAndFloorsAtZero() {
        val state = WearStrengthSessionState().startRest(now = 10_000L, durationMs = 90_000L)
        assertEquals(90_000L, state.restRemainingMs(10_000L))
        assertEquals(40_000L, state.restRemainingMs(60_000L))
        assertEquals(0L, state.restRemainingMs(200_000L)) // already expired -> floors at 0, never negative
    }

    @Test
    fun extendRestGrowsBothDeadlineAndTotal() {
        var state = WearStrengthSessionState().startRest(now = 10_000L, durationMs = 90_000L)
        state = state.extendRest(15_000L)
        assertEquals(10_000L + 90_000L + 15_000L, state.restEndsAtMs)
        assertEquals(105_000L, state.restTotalMs)
    }

    @Test
    fun extendRestIsNoOpWhenNothingIsRunning() {
        val state = WearStrengthSessionState()
        assertEquals(state, state.extendRest())
    }

    @Test
    fun clearRestRemovesTheTimer() {
        val state = WearStrengthSessionState().startRest(10_000L).clearRest()
        assertNull(state.restEndsAtMs)
        assertEquals(0L, state.restTotalMs)
        assertEquals(false, state.isResting)
    }

    @Test
    fun finishClearsAnyRunningRestTimer() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        state = state.logSet(0, 0, 2_000L).startRest(2_000L)
        assertTrue(state.isResting)
        state = state.finish(now = 5_000L)
        assertEquals(false, state.isResting)
        assertNull(state.restEndsAtMs)
    }

    // ---- finish / buildSession -------------------------------------------------------------------

    @Test
    fun finishRequiresAtLeastOneLoggedSet() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        val untouched = state.finish(now = 5_000L)
        assertEquals(WearStrengthScreen.ACTIVE, untouched.screen)

        state = state.logSet(0, 0, 2_000L).finish(now = 5_000L)
        assertEquals(WearStrengthScreen.SUMMARY, state.screen)
        assertEquals(5_000L, state.endedAt)
    }

    @Test
    fun buildSessionAggregatesOnlyDoneSetsAcrossCards() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(exerciseId = "a"))
            .logSet(0, 0, 2_000L) // done, auto-appends a pending row
            .finish(3_000L)
        val session = state.buildSession()
        assertEquals(1_000L, session.startedAtMs)
        assertEquals(3_000L, session.endedAtMs)
        assertEquals(1, session.cards.size)
        assertEquals(1, session.cards[0].loggedSets.size)
        assertEquals(20.0, session.cards[0].loggedSets[0].kg, 0.0001)
    }

    @Test
    fun totalSetsAndTotalVolumeCountOnlyDoneSets() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise())
        assertEquals(0, state.totalSets)
        assertEquals(0.0, state.totalVolumeKg, 0.0001)

        state = state.logSet(0, 0, 2_000L) // 20kg x 10
        assertEquals(1, state.totalSets)
        assertEquals(200.0, state.totalVolumeKg, 0.0001)
    }

    // ---- program prescription (웬들러 주차 처방) ---------------------------------------------

    @Test
    fun addExerciseLaysOutTheWholeWeekPrescriptionWhenTheExerciseHasAProgram() {
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(program = wendlerProgram()))
        val sets = state.cards[0].sets

        assertEquals(6, sets.size)
        assertEquals(listOf(60.0, 112.5, 127.5, 142.5, 75.0, 75.0), sets.map { it.kg })
        assertEquals(listOf(5, 5, 3, 1, 10, 10), sets.map { it.reps })
        assertEquals(
            listOf("warmup", "main", "main", "main", "supplemental", "supplemental"),
            sets.map { it.role },
        )
        assertTrue("톱세트는 AMRAP 이어야 한다", sets[3].amrap)
        assertEquals("bbb", sets[4].supplementalKind)
        assertTrue("처방 행은 전부 대기 상태여야 한다", sets.none { it.done })
    }

    @Test
    fun addExerciseStillFallsBackToOneBlankRowWithoutAProgram() {
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(program = null))
        val sets = state.cards[0].sets
        assertEquals(1, sets.size)
        assertEquals(20.0, sets[0].kg, 0.0001)
        assertEquals(10, sets[0].reps)
        assertNull(sets[0].role)
    }

    @Test
    fun anEmptyProgramFallsBackToTheBlankRowRatherThanAnEmptyCard() {
        val empty = WearStrengthProgram(kind = "wendler", label = "x", shortLabel = "x", weekLabel = "1주차", sets = emptyList())
        val state = WearStrengthSessionState().start(1_000L).addExercise(exercise(program = empty))
        assertEquals(1, state.cards[0].sets.size)
    }

    @Test
    fun roleLabelMapsPrescriptionRolesToTheSameBadgesAsThePhone() {
        val sets = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(program = wendlerProgram()))
            .cards[0].sets
        assertEquals("웜업", sets[0].roleLabel())
        assertNull("메인 세트에는 배지를 달지 않는다", sets[1].roleLabel())
        assertEquals("BBB", sets[4].roleLabel())
    }

    /**
     * The whole point of carrying setType/role: the phone's `_isActualWorkoutSet` drops warm-ups
     * and deloads, so the watch summary has to drop them too or the two screens disagree about the
     * same session.
     */
    @Test
    fun warmupsCountAsLoggedRowsButNotAsWorkingSetsOrVolume() {
        var state = WearStrengthSessionState().start(1_000L).addExercise(exercise(program = wendlerProgram()))
        state = state.logSet(0, 0, 2_000L) // 60kg x 5 warm-up
        assertEquals(1, state.loggedRowCount)
        assertEquals(0, state.totalSets)
        assertEquals(0.0, state.totalVolumeKg, 0.0001)

        state = state.logSet(0, 1, 3_000L) // 112.5kg x 5 main
        assertEquals(2, state.loggedRowCount)
        assertEquals(1, state.totalSets)
        assertEquals(562.5, state.totalVolumeKg, 0.0001)
    }

    @Test
    fun aDeloadRoleIsExcludedEvenThoughItsSetTypeIsMain() {
        val deloadOnly = WearStrengthProgram(
            kind = "wendler",
            label = "8/6/3 원본",
            shortLabel = "8/6/3 원본",
            weekLabel = "7주차",
            sets = listOf(WearStrengthProgramSet(90.0, 5, 100, "main", "deload", false, null)),
        )
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(program = deloadOnly))
            .logSet(0, 0, 2_000L)
        assertEquals(1, state.loggedRowCount)
        assertEquals(0, state.totalSets)
    }

    @Test
    fun loggedSetsCarryTheirSetTypeAndRoleIntoTheCompletionPayloadShape() {
        val logged = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(program = wendlerProgram()))
            .logSet(0, 0, 2_000L)
            .logSet(0, 4, 3_000L)
            .cards[0].loggedSets

        assertEquals("warmup", logged[0].setType)
        assertEquals("warmup", logged[0].role)
        assertEquals("main", logged[1].setType)
        assertEquals("supplemental", logged[1].role)
        assertEquals("bbb", logged[1].supplementalKind)
    }

    @Test
    fun theRowAppendedPastTheEndOfAPrescriptionIsAPlainExtraSet() {
        val sets = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(program = wendlerProgram()))
            .logSet(0, 5, 2_000L) // last BBB row
            .cards[0].sets

        assertEquals(7, sets.size)
        val appended = sets[6]
        assertEquals(75.0, appended.kg, 0.0001)
        assertEquals("main", appended.setType)
        assertNull("추가 세트를 BBB 라고 부르면 거짓말이다", appended.role)
        assertNull(appended.supplementalKind)
        assertEquals(false, appended.amrap)
    }

    @Test
    fun copiedPreviousSetsAreAlwaysPlainWorkingRows() {
        val lastSession = WearStrengthLastSession(
            dateKey = "2026-07-28",
            sets = listOf(WearStrengthLastSet(kg = 80.0, reps = 8, romPct = 100, setType = "main", done = true)),
        )
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(program = wendlerProgram()))
            .copyPreviousSets(0, lastSession)

        assertEquals(1, state.cards[0].sets.size)
        assertEquals("main", state.cards[0].sets[0].setType)
        assertNull(state.cards[0].sets[0].role)
    }

    @Test
    fun programRowsSurviveTheProcessDeathSnapshotRoundTrip() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(program = wendlerProgram()))
            .logSet(0, 0, 2_000L)

        val restored = WearStrengthSessionState.fromJson(state.toJson())
        assertEquals(state, restored)
        assertEquals("warmup", restored!!.cards[0].sets[0].setType)
        assertEquals("warmup", restored.cards[0].sets[0].role)
        assertTrue(restored.cards[0].sets[3].amrap)
        assertEquals("bbb", restored.cards[0].sets[4].supplementalKind)
    }

    /** A snapshot written before program prescriptions existed must still restore, as a plain card. */
    @Test
    fun aPreProgramSnapshotRestoresRowsAsPlainWorkingSets() {
        val json = """
            {
              "version": 2,
              "screen": "ACTIVE",
              "cards": [
                {
                  "exerciseId": "bench-press",
                  "name": "바벨 벤치프레스",
                  "muscleId": "chest",
                  "movementId": "barbell-press",
                  "stepKg": 2.5,
                  "sets": [
                    { "kg": 80, "reps": 8, "romPct": 100, "done": true, "completedAt": 2000, "rir": null }
                  ]
                }
              ],
              "activeCardIndex": 0,
              "startedAt": 1000,
              "endedAt": null,
              "restEndsAtMs": null,
              "restTotalMs": 0
            }
        """.trimIndent()

        val restored = WearStrengthSessionState.fromJson(json)!!
        val set = restored.cards[0].sets[0]
        assertEquals("main", set.setType)
        assertNull(set.role)
        assertEquals(false, set.amrap)
        assertEquals(1, restored.totalSets)
    }

    // ---- JSON round-trip + migration --------------------------------------------------------------

    @Test
    fun toJsonRoundTripsThroughFromJsonIncludingRirAndRestFields() {
        val state = WearStrengthSessionState().start(1_000L)
            .addExercise(exercise(exerciseId = "a"))
            .adjustRir(0, 0, 1)
            .logSet(0, 0, 2_000L)
            .startRest(2_000L)
            .addExercise(exercise(exerciseId = "b"))
            .updateSetKg(1, 0, 1)

        val restored = WearStrengthSessionState.fromJson(state.toJson())
        assertEquals(state, restored)
        assertEquals(2, restored?.cards?.get(0)?.sets?.get(0)?.rir)
        assertTrue(restored!!.isResting)
    }

    @Test
    fun fromJsonReturnsNullForWrongVersionOrGarbage() {
        assertNull(WearStrengthSessionState.fromJson("not json"))
        assertNull(WearStrengthSessionState.fromJson("""{"version":99,"screen":"IDLE"}"""))
    }

    @Test
    fun migratesVersionOneSnapshotIntoChecklistRows() {
        val legacyJson = """
            {
              "version": 1,
              "screen": "ACTIVE",
              "cards": [
                {
                  "exerciseId": "bench-press",
                  "name": "바벨 벤치프레스",
                  "muscleId": "chest",
                  "movementId": "barbell-press",
                  "stepKg": 2.5,
                  "draftKg": 82.5,
                  "draftReps": 6,
                  "draftRomPct": 90,
                  "loggedSets": [
                    { "kg": 80, "reps": 8, "romPct": 100, "completedAt": 2000 },
                    { "kg": 80, "reps": 8, "romPct": 100, "completedAt": 2100 }
                  ]
                }
              ],
              "activeCardIndex": 0,
              "startedAt": 1000,
              "endedAt": null
            }
        """.trimIndent()

        val migrated = WearStrengthSessionState.fromJson(legacyJson)
        assertTrue(migrated != null)
        assertEquals(WearStrengthScreen.ACTIVE, migrated!!.screen)
        assertNull(migrated.restEndsAtMs)
        assertEquals(0L, migrated.restTotalMs)

        val sets = migrated.cards[0].sets
        // 2 done rows (from loggedSets) + 1 trailing pending row (from the draft editor).
        assertEquals(3, sets.size)
        assertTrue(sets[0].done)
        assertEquals(80.0, sets[0].kg, 0.0001)
        assertEquals(2_000L, sets[0].completedAt)
        assertTrue(sets[1].done)
        assertEquals(2_100L, sets[1].completedAt)
        assertEquals(false, sets[2].done)
        assertEquals(82.5, sets[2].kg, 0.0001)
        assertEquals(6, sets[2].reps)
        assertEquals(90, sets[2].romPct)
        assertNull(sets[2].rir)

        // buildSession still only surfaces done sets, so the migrated payload shape is unaffected.
        assertEquals(2, migrated.cards[0].loggedSets.size)
    }

    @Test
    fun migratesVersionOneSnapshotWithNoLoggedSetsToASingleDraftRow() {
        val legacyJson = """
            {
              "version": 1,
              "screen": "ACTIVE",
              "cards": [
                {
                  "exerciseId": "squat",
                  "name": "스쿼트",
                  "muscleId": "legs",
                  "movementId": "squat",
                  "stepKg": 2.5,
                  "draftKg": 60.0,
                  "draftReps": 5,
                  "draftRomPct": 100,
                  "loggedSets": []
                }
              ],
              "activeCardIndex": 0,
              "startedAt": 500,
              "endedAt": null
            }
        """.trimIndent()

        val migrated = WearStrengthSessionState.fromJson(legacyJson)!!
        assertEquals(1, migrated.cards[0].sets.size)
        assertEquals(false, migrated.cards[0].sets[0].done)
        assertEquals(60.0, migrated.cards[0].sets[0].kg, 0.0001)
    }

    @Test
    fun toJsonObjectProducesVersionTwoEnvelope() {
        val json = WearStrengthSessionState().start(1_000L).toJsonObject()
        assertEquals(2, json.getInt("version"))
        assertTrue(json.has("restTotalMs"))
        assertTrue(json.isNull("restEndsAtMs"))
    }

    @Test
    fun cardsJsonIncludesSetsArrayNotLegacyDraftFields() {
        val json = JSONObject(
            WearStrengthSessionState().start(1_000L).addExercise(exercise()).toJson(),
        )
        val cardJson = json.getJSONArray("cards").getJSONObject(0)
        assertTrue(cardJson.has("sets"))
        assertTrue(!cardJson.has("draftKg"))
        assertTrue(!cardJson.has("loggedSets"))
    }
}
