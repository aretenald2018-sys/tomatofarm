package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Test

class WearExerciseEndPolicyTest {
    @Test
    fun waitsForFinalExerciseUpdateWhenEndFutureCompletesFirst() {
        assertEquals(
            WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE,
            WearExerciseEndPolicy.afterEndFuture(success = true),
        )
        assertEquals(
            WearExerciseEndAction.PUBLISH_FINAL_UPDATE,
            WearExerciseEndPolicy.afterExerciseUpdate(isEnded = true),
        )
    }

    @Test
    fun reportsEndFailureWithoutPublishingSyntheticEndedState() {
        assertEquals(
            WearExerciseEndAction.PUBLISH_ERROR,
            WearExerciseEndPolicy.afterEndFuture(success = false),
        )
    }

    @Test
    fun lateHealthUpdateCannotResumeUserPausedRun() {
        assertEquals(
            WearExerciseSessionStatus.PAUSED,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE,
                currentStatus = WearExerciseSessionStatus.PAUSED,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.ACTIVE,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE,
                currentStatus = WearExerciseSessionStatus.ACTIVE,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.ENDED,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.PUBLISH_FINAL_UPDATE,
                currentStatus = WearExerciseSessionStatus.PAUSED,
            ),
        )
    }

    @Test
    fun lateHealthUpdateCannotResumeEndedRun() {
        assertEquals(
            WearExerciseSessionStatus.ENDED,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE,
                currentStatus = WearExerciseSessionStatus.ENDED,
            ),
        )
    }

    // W4 HS-exclusivity slice: unsolicited-end decision and its status mapping.

    @Test
    fun unsolicitedEndContinuesWithFallbackWhileRequestedEndPublishesFinalUpdate() {
        assertEquals(
            WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
            WearExerciseEndPolicy.afterUnsolicitedEnd(endRequested = false),
        )
        assertEquals(
            WearExerciseEndAction.PUBLISH_FINAL_UPDATE,
            WearExerciseEndPolicy.afterUnsolicitedEnd(endRequested = true),
        )
    }

    @Test
    fun continueWithFallbackMapsActiveLikeStatusesToFallbackButLeavesPausedAndTerminalStatusesAlone() {
        assertEquals(
            WearExerciseSessionStatus.FALLBACK,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
                currentStatus = WearExerciseSessionStatus.ACTIVE,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.FALLBACK,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
                currentStatus = WearExerciseSessionStatus.STARTING,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.FALLBACK,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
                currentStatus = WearExerciseSessionStatus.FALLBACK,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.PAUSED,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
                currentStatus = WearExerciseSessionStatus.PAUSED,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.ENDED,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
                currentStatus = WearExerciseSessionStatus.ENDED,
            ),
        )
        assertEquals(
            WearExerciseSessionStatus.ERROR,
            WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                action = WearExerciseEndAction.CONTINUE_WITH_FALLBACK,
                currentStatus = WearExerciseSessionStatus.ERROR,
            ),
        )
    }

    // W5d auto-pause slice: WearExerciseAutoPausePolicy transitions.

    @Test
    fun entersAutoPauseTheFirstTimeHealthServicesReportsIt() {
        assertEquals(
            WearAutoPauseTransition.ENTERED_AUTO_PAUSE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = false,
                isAutoPausedNow = true,
                manuallyPaused = false,
            ),
        )
    }

    @Test
    fun doesNotReenterAutoPauseOnRepeatedUpdatesWhileAlreadyAutoPaused() {
        assertEquals(
            WearAutoPauseTransition.NONE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = true,
                isAutoPausedNow = true,
                manuallyPaused = false,
            ),
        )
    }

    @Test
    fun exitsAutoPauseWhenHealthServicesReportsActiveAgain() {
        assertEquals(
            WearAutoPauseTransition.EXITED_AUTO_PAUSE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = true,
                isAutoPausedNow = false,
                manuallyPaused = false,
            ),
        )
    }

    @Test
    fun staysNoneWhenNeitherAutoPausedNorJustExited() {
        assertEquals(
            WearAutoPauseTransition.NONE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = false,
                isAutoPausedNow = false,
                manuallyPaused = false,
            ),
        )
    }

    @Test
    fun manualPauseTakesPrecedenceOverAnyHealthServicesAutoPauseReporting() {
        // A manual pause suppresses the transition regardless of what Health Services reports —
        // entering, already-in, or exiting auto-pause all resolve to NONE so the manual pause path
        // (WearExerciseService.handlePauseRun) stays the sole authority while it's in effect.
        assertEquals(
            WearAutoPauseTransition.NONE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = false,
                isAutoPausedNow = true,
                manuallyPaused = true,
            ),
        )
        assertEquals(
            WearAutoPauseTransition.NONE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = true,
                isAutoPausedNow = true,
                manuallyPaused = true,
            ),
        )
        assertEquals(
            WearAutoPauseTransition.NONE,
            WearExerciseAutoPausePolicy.transition(
                wasAutoPaused = true,
                isAutoPausedNow = false,
                manuallyPaused = true,
            ),
        )
    }
}
