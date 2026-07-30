package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WearExerciseActiveDurationTrackerTest {
    @Test
    fun excludesPausedWallClockTimeFromDirectGpsDuration() {
        val tracker = WearExerciseActiveDurationTracker()

        tracker.start(1_000L)
        assertEquals(4_000L, tracker.activeDurationAt(5_000L))

        tracker.pause(5_000L)
        assertEquals(4_000L, tracker.activeDurationAt(35_000L))

        tracker.resume(35_000L)
        assertEquals(7_000L, tracker.activeDurationAt(38_000L))
    }

    @Test
    fun rejectsDelayedHealthDurationFromAnotherExercise() {
        val tracker = WearExerciseActiveDurationTracker()
        tracker.start(1_000L)

        assertNull(tracker.plausibleHealthDuration(600_000L, 30_000L))
        assertEquals(28_000L, tracker.plausibleHealthDuration(28_000L, 30_000L))
        assertEquals(40_000L, tracker.plausibleHealthDuration(40_000L, 30_000L))
    }

    // W5d auto-pause slice: WearExerciseService.publishExerciseUpdate drives this tracker with the
    // exact same pause()/resume() calls handlePauseRun/handleResumeRun use, so an auto-pause and
    // auto-resume must exclude the paused wall-clock span identically to a manual pause/resume —
    // this is the W3 moving-time-pace consistency guarantee for auto-pauses.
    @Test
    fun excludesAutoPausedWallClockTimeTheSameWayAsAManualPause() {
        val tracker = WearExerciseActiveDurationTracker()

        tracker.start(0L)
        assertEquals(10_000L, tracker.activeDurationAt(10_000L))

        // Health Services reports AUTO_PAUSED for the first time.
        tracker.pause(10_000L)
        // The runner stays stationary for a while — duration must not advance.
        assertEquals(10_000L, tracker.activeDurationAt(45_000L))

        // Health Services reports active again (auto-resume).
        tracker.resume(45_000L)
        assertEquals(13_000L, tracker.activeDurationAt(48_000L))
    }
}
