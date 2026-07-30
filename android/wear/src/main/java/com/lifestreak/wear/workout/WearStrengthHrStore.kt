package com.lifestreak.wear.workout

import android.os.Handler
import android.os.Looper

data class WearStrengthHrSnapshot(
    val latestBpm: Int? = null,
    val avgBpm: Int? = null,
    val maxBpm: Int? = null,
    val hasPermission: Boolean = true,
)

/**
 * Thread-safe holder for the live/rolling heart-rate state of the current strength session, plus
 * listener fan-out for the UI. [WearStrengthHrService] publishes samples into this store; the
 * active-screen UI controller (Phase 4) subscribes via [addListener].
 */
object WearStrengthHrStore {
    private val lock = Any()
    private val mainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }
    private val listeners = linkedSetOf<(WearStrengthHrSnapshot) -> Unit>()
    private var accumulator = WearStrengthHrAccumulator()
    private var snapshot = WearStrengthHrSnapshot()

    fun addListener(listener: (WearStrengthHrSnapshot) -> Unit): () -> Unit {
        val current = synchronized(lock) {
            listeners.add(listener)
            snapshot
        }
        dispatch(listener, current)
        return { synchronized(lock) { listeners.remove(listener) } }
    }

    fun addSample(timestampMs: Long, bpm: Int) {
        val next = synchronized(lock) {
            accumulator.add(timestampMs, bpm)
            snapshot = snapshot.copy(
                latestBpm = bpm,
                avgBpm = accumulator.avg(),
                maxBpm = accumulator.max(),
                hasPermission = true,
            )
            snapshot
        }
        publish(next)
    }

    fun markPermissionMissing() {
        val next = synchronized(lock) {
            snapshot = snapshot.copy(hasPermission = false)
            snapshot
        }
        publish(next)
    }

    /** Seeds the accumulator from a previously-persisted sample list (process-restart restore). */
    fun restoreSamples(samples: List<HeartRateSample>) {
        val next = synchronized(lock) {
            samples.forEach { sample -> accumulator.add(sample.timestampMs, sample.bpm) }
            snapshot = snapshot.copy(
                latestBpm = accumulator.samples().lastOrNull()?.bpm ?: snapshot.latestBpm,
                avgBpm = accumulator.avg(),
                maxBpm = accumulator.max(),
            )
            snapshot
        }
        publish(next)
    }

    fun current(): WearStrengthHrSnapshot = synchronized(lock) { snapshot }

    /** Bounded, 10s-bucketed samples ready to embed as `samples10s` in [WearStrengthPayload]. */
    fun samplesForPayload(): List<HeartRateSample> = synchronized(lock) { accumulator.bucket10s() }

    /** All raw (unbucketed) samples currently buffered — for session-crash persistence. */
    fun rawSamples(): List<HeartRateSample> = synchronized(lock) { accumulator.samples() }

    fun reset() {
        val next = synchronized(lock) {
            accumulator = WearStrengthHrAccumulator()
            snapshot = WearStrengthHrSnapshot()
            snapshot
        }
        publish(next)
    }

    private fun publish(next: WearStrengthHrSnapshot) {
        val targets = synchronized(lock) { listeners.toList() }
        targets.forEach { listener -> dispatch(listener, next) }
    }

    private fun dispatch(listener: (WearStrengthHrSnapshot) -> Unit, next: WearStrengthHrSnapshot) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            listener(next)
        } else {
            mainHandler.post { listener(next) }
        }
    }
}
