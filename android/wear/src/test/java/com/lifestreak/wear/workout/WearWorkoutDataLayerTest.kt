package com.lifestreak.wear.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WearWorkoutDataLayerTest {
    @Test
    fun savedAckRequiresMatchingSafeTransferIdInPathAndPayload() {
        val transferId = "1000-2000-${"b".repeat(64)}"
        val path = "/tomato/workout/run/saved/$transferId"

        assertEquals(transferId, WearWorkoutDataLayer.transferIdFromSavedAck(path, transferId))
        assertNull(WearWorkoutDataLayer.transferIdFromSavedAck(path, "different"))
        assertNull(WearWorkoutDataLayer.transferIdFromSavedAck("$path/extra", "$transferId/extra"))
        assertNull(WearWorkoutDataLayer.transferIdFromSavedAck("/tomato/workout/run/complete/$transferId", transferId))
    }
}
