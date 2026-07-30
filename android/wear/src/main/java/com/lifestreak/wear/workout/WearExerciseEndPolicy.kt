package com.lifestreak.wear.workout

internal enum class WearExerciseEndAction {
    WAIT_FOR_FINAL_UPDATE,
    PUBLISH_FINAL_UPDATE,
    PUBLISH_ERROR,
    // W4 HS-exclusivity slice: our session was ended by Health Services without us asking (another
    // app/the OS took ownership, or a permission was revoked) — keep recording via the direct
    // GPS/HR fallbacks instead of treating this as a normal finish.
    CONTINUE_WITH_FALLBACK,
}

internal object WearExerciseEndPolicy {
    fun afterEndFuture(success: Boolean): WearExerciseEndAction =
        if (success) {
            WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE
        } else {
            WearExerciseEndAction.PUBLISH_ERROR
        }

    fun afterExerciseUpdate(isEnded: Boolean): WearExerciseEndAction =
        if (isEnded) {
            WearExerciseEndAction.PUBLISH_FINAL_UPDATE
        } else {
            WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE
        }

    /**
     * Decision for the "our HS session ended but we didn't ask" branch
     * (`WearExerciseService.publishExerciseUpdate`'s `isEnded && !endRequested` case): a *requested*
     * end (the user pressed Finish; `endRequested == true`) is the existing terminal path, but an
     * *unsolicited* end — Health Services superseded us, or we lost a permission — means the run
     * keeps going on direct sensors rather than being published as finished.
     */
    fun afterUnsolicitedEnd(endRequested: Boolean): WearExerciseEndAction =
        if (endRequested) {
            WearExerciseEndAction.PUBLISH_FINAL_UPDATE
        } else {
            WearExerciseEndAction.CONTINUE_WITH_FALLBACK
        }

    fun sessionStatusAfterExerciseUpdate(
        action: WearExerciseEndAction,
        currentStatus: WearExerciseSessionStatus,
    ): WearExerciseSessionStatus = when (action) {
        WearExerciseEndAction.PUBLISH_FINAL_UPDATE -> WearExerciseSessionStatus.ENDED
        WearExerciseEndAction.CONTINUE_WITH_FALLBACK -> when (currentStatus) {
            WearExerciseSessionStatus.ENDED,
            WearExerciseSessionStatus.ERROR,
            -> currentStatus
            WearExerciseSessionStatus.PAUSED -> WearExerciseSessionStatus.PAUSED
            else -> WearExerciseSessionStatus.FALLBACK
        }
        WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE,
        WearExerciseEndAction.PUBLISH_ERROR,
        -> when (currentStatus) {
            WearExerciseSessionStatus.ENDED,
            WearExerciseSessionStatus.ERROR,
            -> currentStatus
            WearExerciseSessionStatus.PAUSED -> WearExerciseSessionStatus.PAUSED
            else -> WearExerciseSessionStatus.ACTIVE
        }
    }
}

/**
 * W5d auto-pause slice: the transition an exercise-update tick represents, relative to the
 * service's own auto-pause bookkeeping ([WearExerciseService]'s `autoPauseActive` flag).
 */
internal enum class WearAutoPauseTransition {
    /** No auto-pause-related change to act on this tick. */
    NONE,
    /** Health Services reports auto-paused for the first time since the last auto-resume. */
    ENTERED_AUTO_PAUSE,
    /** Health Services reports active again after having been auto-paused. */
    EXITED_AUTO_PAUSE,
}

/**
 * Pure decision for "given the previous auto-pause bookkeeping, what Health Services just
 * reported, and whether *we* requested a (manual) pause, what transition is this" — factored out
 * of [WearExerciseService.publishExerciseUpdate] so it's unit-testable without Android. Manual
 * pause always takes precedence: while the user has explicitly paused, Health Services' own
 * auto-pause state is ignored entirely so it can never fight the manual pause/resume buttons.
 */
internal object WearExerciseAutoPausePolicy {
    fun transition(
        wasAutoPaused: Boolean,
        isAutoPausedNow: Boolean,
        manuallyPaused: Boolean,
    ): WearAutoPauseTransition {
        if (manuallyPaused) return WearAutoPauseTransition.NONE
        return when {
            !wasAutoPaused && isAutoPausedNow -> WearAutoPauseTransition.ENTERED_AUTO_PAUSE
            wasAutoPaused && !isAutoPausedNow -> WearAutoPauseTransition.EXITED_AUTO_PAUSE
            else -> WearAutoPauseTransition.NONE
        }
    }
}
