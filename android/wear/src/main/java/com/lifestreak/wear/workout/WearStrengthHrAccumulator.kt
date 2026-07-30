package com.lifestreak.wear.workout

import kotlin.math.roundToInt

/**
 * Pure heart-rate sample buffer for a strength session. Filters obviously-bad readings, bounds
 * memory usage by dropping the oldest sample once the cap is hit, and buckets samples into 10s
 * windows the same way [WearWorkoutPayload]'s run-payload heart rate bucketing does, so
 * `samples10s` in [WearStrengthPayload] matches the run payload's shape exactly.
 */
class WearStrengthHrAccumulator {
    private val samples = ArrayDeque<HeartRateSample>()

    fun add(timestampMs: Long, bpm: Int) {
        if (timestampMs < 0L) return
        if (bpm !in MIN_HEART_RATE_BPM..MAX_HEART_RATE_BPM) return
        samples.addLast(HeartRateSample(timestampMs = timestampMs, bpm = bpm))
        while (samples.size > MAX_SAMPLES) samples.removeFirst()
    }

    fun samples(): List<HeartRateSample> = samples.toList()

    fun avg(): Int? {
        if (samples.isEmpty()) return null
        return samples.map { it.bpm }.average().roundToInt()
    }

    fun max(): Int? = samples.maxOfOrNull { it.bpm }

    /** Buckets all samples into 10s windows anchored to the first sample's timestamp. */
    fun bucket10s(): List<HeartRateSample> {
        if (samples.isEmpty()) return emptyList()
        val sorted = samples.sortedBy { it.timestampMs }
        val startedAtMs = sorted.first().timestampMs
        return sorted
            .groupBy { sample ->
                startedAtMs + ((sample.timestampMs - startedAtMs) / BUCKET_MS) * BUCKET_MS
            }
            .toSortedMap()
            .map { (bucketStartMs, bucketSamples) ->
                HeartRateSample(
                    timestampMs = bucketStartMs,
                    bpm = bucketSamples.map { it.bpm }.average().roundToInt(),
                )
            }
            .take(MAX_BUCKETS)
    }

    companion object {
        private const val MIN_HEART_RATE_BPM = 30
        private const val MAX_HEART_RATE_BPM = 240
        private const val MAX_SAMPLES = 2_500
        private const val BUCKET_MS = 10_000L
        private const val MAX_BUCKETS = 2_161
    }
}
