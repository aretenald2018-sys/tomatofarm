package com.lifestreak.app.wear

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets
import java.nio.file.Files

class TomatoWearWorkoutBridgeTest {
    @Test
    fun queuePreferencesContainContentMetadataOnly() = withFilesDir { filesDir ->
        val payload = writePayload(filesDir, "incoming.tmp", 1_000L, 2_000L, 37.5665)
        val raw = requireNotNull(enqueue(filesDir, "[]", payload))
        val entry = JSONArray(raw).getJSONObject(0)

        assertEquals(
            setOf("id", "fileName", "queuedAt", "byteLength", "sha256"),
            entry.keys().asSequence().toSet(),
        )
        assertEquals(payload.id, entry.getString("id"))
        assertEquals("${payload.id}.json", entry.getString("fileName"))
        assertEquals(payload.bytes.size.toLong(), entry.getLong("byteLength"))
        assertEquals(payload.sha256, entry.getString("sha256"))
        assertFalse(raw.contains("payload"))
        assertFalse(raw.contains("route"))
        assertFalse(raw.contains("37.5665"))
        println("WEAR_QUEUE_QA metadataKeys=${entry.keys().asSequence().toSet().sorted()} payloadInPrefs=false")
    }

    @Test
    fun legacyPayloadJsonIsPurgedInsteadOfPersisted() = withFilesDir { filesDir ->
        val legacy = JSONArray().put(
            JSONObject()
                .put("id", "legacy")
                .put("queuedAt", 1L)
                .put("payload", JSONObject().put("route", JSONArray().put(JSONObject().put("lat", 37.5665)))),
        ).toString()

        assertEquals("[]", TomatoWearWorkoutFileQueue.reconcileForTest(filesDir, legacy))
    }

    @Test
    fun payloadResolutionStaysInsideCanonicalAppPrivateDirectory() = withFilesDir { filesDir ->
        val directory = payloadDirectory(filesDir).canonicalFile
        val expected = File(directory, "transfer.json").canonicalFile

        assertEquals(expected, TomatoWearWorkoutFileQueue.resolveForTest(filesDir, "transfer.json"))
        assertNull(TomatoWearWorkoutFileQueue.resolveForTest(filesDir, "../escape.json"))
        assertNull(TomatoWearWorkoutFileQueue.resolveForTest(filesDir, expected.absolutePath))
    }

    @Test
    fun hashAndLengthMismatchLeaveIncomingFileUnqueued() = withFilesDir { filesDir ->
        val payload = writePayload(filesDir, "mismatch.tmp", 3_000L, 4_000L, 37.1)

        assertNull(
            TomatoWearWorkoutFileQueue.enqueueForTest(
                filesDir, "[]", payload.id, payload.file, payload.bytes.size + 1L, payload.sha256,
            ),
        )
        assertTrue(payload.file.exists())
        assertNull(
            TomatoWearWorkoutFileQueue.enqueueForTest(
                filesDir, "[]", payload.id, payload.file, payload.bytes.size.toLong(), "0".repeat(64),
            ),
        )
        assertTrue(payload.file.exists())
    }

    @Test
    fun duplicateTransferEventKeepsOneFileAndMetadataEntry() = withFilesDir { filesDir ->
        val first = writePayload(filesDir, "first.tmp", 5_000L, 6_000L, 37.2)
        val initial = requireNotNull(enqueue(filesDir, "[]", first))
        val durable = requireNotNull(TomatoWearWorkoutFileQueue.resolveForTest(filesDir, "${first.id}.json"))
        val duplicate = writePayload(filesDir, "duplicate.tmp", 5_000L, 6_000L, 37.2)

        val deduped = requireNotNull(enqueue(filesDir, initial, duplicate))

        assertEquals(1, JSONArray(deduped).length())
        assertEquals(initial, deduped)
        assertTrue(durable.exists())
        assertFalse(duplicate.file.exists())
    }

    @Test
    fun saturatedQueueRejectsNewPayloadWithoutEvictingExistingFiles() = withFilesDir { filesDir ->
        var queue = "[]"
        val accepted = mutableListOf<PayloadFixture>()
        repeat(TomatoWearWorkoutFileQueue.maxQueueSizeForTest()) { index ->
            val payload = writePayload(
                filesDir,
                "incoming-$index.tmp",
                10_000L + index * 2_000L,
                11_000L + index * 2_000L,
                37.0 + index,
            )
            queue = requireNotNull(enqueue(filesDir, queue, payload))
            accepted += payload
        }
        val overflow = writePayload(filesDir, "overflow.tmp", 90_000L, 91_000L, 38.0)

        assertNull(enqueue(filesDir, queue, overflow))
        assertEquals(TomatoWearWorkoutFileQueue.maxQueueSizeForTest(), JSONArray(queue).length())
        accepted.forEach { payload ->
            assertTrue(requireNotNull(TomatoWearWorkoutFileQueue.resolveForTest(filesDir, "${payload.id}.json")).exists())
        }
        assertTrue(overflow.file.exists())
        println("WEAR_QUEUE_QA queueCount=${JSONArray(queue).length()} saturationPreservedExisting=true")
    }

    @Test
    fun durableOrphanFileIsRecoveredIntoMetadataOnRestart() = withFilesDir { filesDir ->
        val payload = writePayload(filesDir, "orphan.tmp", 100_000L, 101_000L, 37.4)
        val orphan = File(payloadDirectory(filesDir), "${payload.id}.json")
        assertTrue(payload.file.renameTo(orphan))

        val reconciled = TomatoWearWorkoutFileQueue.reconcileForTest(filesDir, "[]")

        assertEquals(1, JSONArray(reconciled).length())
        assertEquals(payload.id, JSONArray(reconciled).getJSONObject(0).getString("id"))
        assertTrue(orphan.exists())
    }

    @Test
    fun invalidLeadingMetadataDoesNotBlockLaterValidPayload() = withFilesDir { filesDir ->
        val valid = writePayload(filesDir, "valid.tmp", 110_000L, 111_000L, 37.45)
        val validQueue = JSONArray(requireNotNull(enqueue(filesDir, "[]", valid)))
        val zeros = "0".repeat(64)
        val missingId = "1-2-$zeros"
        val corruptId = "3-4-$zeros"
        val corruptFile = File(payloadDirectory(filesDir), "$corruptId.json").apply { writeText("corrupt") }
        val mixedQueue = JSONArray()
            .put(metadataEntry(missingId, 123L, zeros))
            .put(metadataEntry(corruptId, corruptFile.length(), zeros))
            .put(validQueue.getJSONObject(0))

        val reconciled = JSONArray(TomatoWearWorkoutFileQueue.reconcileForTest(filesDir, mixedQueue.toString()))

        assertEquals(1, reconciled.length())
        assertEquals(valid.id, reconciled.getJSONObject(0).getString("id"))
        println("WEAR_QUEUE_QA reconciliation=invalid-leading-dropped,valid-later-drainable")
    }

    @Test
    fun staleAckTimeoutTokenCannotClearNewerDispatch() {
        val tracker = TomatoWearWorkoutBridge.PendingAckTracker()
        val firstToken = tracker.start("transfer")
        assertTrue(tracker.clear("transfer"))
        val secondToken = tracker.start("transfer")

        assertFalse(tracker.expire("transfer", firstToken))
        assertTrue(tracker.isPending("transfer"))
        assertTrue(tracker.expire("transfer", secondToken))
        assertFalse(tracker.isPending("transfer"))
        println("WEAR_QUEUE_QA ackTimeout=stale-token-ignored,current-token-expired")
    }

    @Test
    fun savedAckPathAndInFlightTrackerAreStableAndDeduplicated() {
        val transferId = "1000-2000-${"a".repeat(64)}"
        val tracker = TomatoWearWorkoutBridge.SavedAckTracker()

        assertEquals(
            "/tomato/workout/run/saved/$transferId",
            TomatoWearWorkoutBridge.savedAckPathForTest(transferId),
        )
        assertTrue(tracker.start(transferId))
        assertFalse(tracker.start(transferId))
        assertTrue(tracker.isPending(transferId))
        assertTrue(tracker.finish(transferId))
        assertFalse(tracker.isPending(transferId))
    }

    @Test
    fun acknowledgedTombstoneCannotResurrectDuringReconciliation() = withFilesDir { filesDir ->
        val payload = writePayload(filesDir, "accepted.tmp", 120_000L, 121_000L, 37.46)
        val queue = requireNotNull(enqueue(filesDir, "[]", payload))
        assertEquals("[]", TomatoWearWorkoutFileQueue.acknowledgeForTest(filesDir, queue, payload.id, true))
        val tombstone = File(payloadDirectory(filesDir), "${payload.id}.acked").apply { writeBytes(payload.bytes) }

        assertEquals("[]", TomatoWearWorkoutFileQueue.reconcileForTest(filesDir, "[]"))
        assertFalse("acknowledged tombstones must be cleaned instead of recovered", tombstone.exists())
        println("WEAR_QUEUE_QA acknowledgedOrphan=cleaned,not-recovered")
    }

    @Test
    fun oversizedCorruptAndMissingPayloadsAreRejected() = withFilesDir { filesDir ->
        val oversized = File(payloadDirectory(filesDir), "oversized.tmp")
        RandomAccessFile(oversized, "rw").use { it.setLength(TomatoWearWorkoutFileQueue.maxPayloadBytes() + 1L) }
        val zeros = "0".repeat(64)
        assertNull(TomatoWearWorkoutFileQueue.enqueueForTest(filesDir, "[]", "1-2-$zeros", oversized, oversized.length(), zeros))

        val corrupt = File(payloadDirectory(filesDir), "corrupt.tmp").apply { writeText("not-json") }
        val corruptSha = TomatoWearWorkoutFileQueue.sha256(corrupt.readBytes())
        assertNull(TomatoWearWorkoutFileQueue.enqueueForTest(filesDir, "[]", "1-2-$corruptSha", corrupt, corrupt.length(), corruptSha))

        val missingEntry = JSONArray().put(
            JSONObject()
                .put("id", "1-2-$zeros")
                .put("fileName", "1-2-$zeros.json")
                .put("queuedAt", 3L)
                .put("byteLength", 123L)
                .put("sha256", zeros),
        ).toString()
        assertNull(TomatoWearWorkoutFileQueue.readForTest(filesDir, missingEntry))
    }

    @Test
    fun dispatchAndRejectionRetainFileUntilExplicitAsyncAccept() = withFilesDir { filesDir ->
        val payload = writePayload(filesDir, "async.tmp", 200_000L, 201_000L, 37.5)
        val queue = requireNotNull(enqueue(filesDir, "[]", payload))
        val durable = requireNotNull(TomatoWearWorkoutFileQueue.resolveForTest(filesDir, "${payload.id}.json"))
        val script = TomatoWearWorkoutBridge.buildJavascriptForTest(payload.id, durable.readText())

        assertTrue(script.contains("Promise.resolve"))
        assertTrue(script.contains("nativeAck.accept"))
        assertEquals(queue, TomatoWearWorkoutFileQueue.acknowledgeForTest(filesDir, queue, payload.id, false))
        assertTrue("a rejected save must retain the payload", durable.exists())
        assertEquals(queue, TomatoWearWorkoutFileQueue.reconcileForTest(filesDir, queue))
        assertTrue("restart reconciliation must retain the payload", durable.exists())

        assertEquals("[]", TomatoWearWorkoutFileQueue.acknowledgeForTest(filesDir, queue, payload.id, true))
        assertFalse("only explicit async accept may delete the payload", durable.exists())
        println("WEAR_QUEUE_QA lifecycle=queued,rejected-retained,recovered-retained,accepted-deleted")
    }

    private fun enqueue(filesDir: File, queue: String, payload: PayloadFixture): String? {
        return TomatoWearWorkoutFileQueue.enqueueForTest(
            filesDir,
            queue,
            payload.id,
            payload.file,
            payload.bytes.size.toLong(),
            payload.sha256,
        )
    }

    private fun metadataEntry(id: String, byteLength: Long, sha256: String): JSONObject {
        return JSONObject()
            .put("id", id)
            .put("fileName", "$id.json")
            .put("queuedAt", 1L)
            .put("byteLength", byteLength)
            .put("sha256", sha256)
    }

    private fun writePayload(
        filesDir: File,
        name: String,
        startedAt: Long,
        endedAt: Long,
        latitude: Double,
    ): PayloadFixture {
        val bytes = JSONObject()
            .put("type", "running")
            .put("startedAt", startedAt)
            .put("endedAt", endedAt)
            .put("route", JSONArray().put(JSONObject().put("lat", latitude).put("lng", 126.978)))
            .toString()
            .toByteArray(StandardCharsets.UTF_8)
        val sha256 = TomatoWearWorkoutFileQueue.sha256(bytes)
        val file = File(payloadDirectory(filesDir), name).apply { writeBytes(bytes) }
        return PayloadFixture(file, bytes, sha256, "$startedAt-$endedAt-$sha256")
    }

    private fun payloadDirectory(filesDir: File): File =
        File(filesDir, TomatoWearWorkoutFileQueue.PAYLOAD_DIRECTORY).apply { mkdirs() }

    private inline fun withFilesDir(block: (File) -> Unit) {
        val filesDir = Files.createTempDirectory("wear-bridge-test").toFile()
        try {
            block(filesDir)
        } finally {
            filesDir.deleteRecursively()
        }
    }

    private data class PayloadFixture(
        val file: File,
        val bytes: ByteArray,
        val sha256: String,
        val id: String,
    )
}
