package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WearStrengthHrAccumulatorTest {
    @Test
    fun filtersOutOfRangeBpmAndNegativeTimestamps() {
        val accumulator = WearStrengthHrAccumulator()
        accumulator.add(1_000L, 29) // too low
        accumulator.add(1_000L, 241) // too high
        accumulator.add(-1L, 100) // negative timestamp
        accumulator.add(1_000L, 100) // valid

        assertEquals(listOf(100), accumulator.samples().map { it.bpm })
    }

    @Test
    fun avgAndMaxAreNullWhenEmpty() {
        val accumulator = WearStrengthHrAccumulator()
        assertNull(accumulator.avg())
        assertNull(accumulator.max())
    }

    @Test
    fun avgAndMaxReflectAddedSamples() {
        val accumulator = WearStrengthHrAccumulator()
        listOf(100, 110, 120).forEachIndexed { index, bpm ->
            accumulator.add(index * 1_000L, bpm)
        }
        assertEquals(110, accumulator.avg())
        assertEquals(120, accumulator.max())
    }

    @Test
    fun dropsOldestSampleOnceOverCapacity() {
        val accumulator = WearStrengthHrAccumulator()
        val capacity = 2_500
        repeat(capacity + 10) { index ->
            accumulator.add(index.toLong(), 100)
        }
        val samples = accumulator.samples()
        assertEquals(capacity, samples.size)
        assertEquals(10L, samples.first().timestampMs)
        assertEquals((capacity + 9).toLong(), samples.last().timestampMs)
    }

    @Test
    fun bucket10sGroupsSamplesIntoTenSecondWindowsAnchoredToFirstSample() {
        val accumulator = WearStrengthHrAccumulator()
        accumulator.add(0L, 100)
        accumulator.add(5_000L, 110)
        accumulator.add(9_999L, 120)
        accumulator.add(10_000L, 130)
        accumulator.add(15_000L, 140)

        val buckets = accumulator.bucket10s()
        assertEquals(listOf(0L, 10_000L), buckets.map { it.timestampMs })
        assertEquals(110, buckets[0].bpm) // avg(100, 110, 120) rounded
        assertEquals(135, buckets[1].bpm) // avg(130, 140)
    }

    @Test
    fun bucket10sReturnsEmptyWhenNoSamples() {
        assertTrue(WearStrengthHrAccumulator().bucket10s().isEmpty())
    }

    @Test
    fun bucket10sCapsAtMaxBucketCount() {
        val accumulator = WearStrengthHrAccumulator()
        // One sample every 10s for more than 2161 buckets' worth of time, but capped to 2500
        // raw samples first, so use widely-spaced timestamps within the sample cap to exceed the
        // bucket cap.
        repeat(2_200) { index ->
            accumulator.add(index * 10_000L, 100)
        }
        assertEquals(2_161, accumulator.bucket10s().size)
    }
}
