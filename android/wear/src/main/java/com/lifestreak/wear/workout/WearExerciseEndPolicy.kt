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
