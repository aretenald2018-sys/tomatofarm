package com.lifestreak.app.wear

import android.net.Uri
import android.util.Log
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.Executors

class TomatoWearWorkoutListenerService : WearableListenerService() {
    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val dataItem = event.dataItem
            val path = dataItem.uri.path ?: return@forEach
            if (!isAcceptedCompletePath(path)) return@forEach
            val dataMap = try {
                DataMapItem.fromDataItem(dataItem).dataMap
            } catch (_: Exception) {
                return@forEach
            }
            val transferId = dataMap.getString(TomatoWearWorkoutBridge.TRANSFER_ID_KEY)
                ?: path.substringAfterLast('/')
            if (transferId != path.substringAfterLast('/')) return@forEach
            val declaredLength = dataMap.getLong(TomatoWearWorkoutBridge.BYTE_LENGTH_KEY, -1L)
            val declaredSha256 = dataMap.getString(TomatoWearWorkoutBridge.SHA256_KEY) ?: return@forEach
            val asset = dataMap.getAsset(TomatoWearWorkoutBridge.ASSET_KEY) ?: return@forEach
            receiveAsset(transferId, declaredLength, declaredSha256, asset, dataItem.uri)
        }
    }

    private fun receiveAsset(
        transferId: String,
        declaredLength: Long,
        declaredSha256: String,
        asset: Asset,
        dataItemUri: Uri,
    ) {
        val dataClient = Wearable.getDataClient(applicationContext)
        dataClient.getFdForAsset(asset)
            .addOnSuccessListener(ioExecutor) { response ->
                var temporaryFile: File? = null
                try {
                    val directory = File(applicationContext.filesDir, TomatoWearWorkoutFileQueue.PAYLOAD_DIRECTORY)
                        .apply { mkdirs() }
                    val incomingFile = File.createTempFile("incoming-", ".tmp", directory)
                    temporaryFile = incomingFile
                    response.inputStream.use { input ->
                        requireNotNull(input) { "Wear Asset did not provide an input stream" }
                        copyAndVerify(input, incomingFile, declaredLength, declaredSha256)
                    }
                    val durablyQueued = TomatoWearWorkoutBridge.enqueueFromWearFile(
                        applicationContext,
                        transferId,
                        incomingFile,
                        declaredLength,
                        declaredSha256,
                    )
                    if (durablyQueued) {
                        dataClient.deleteDataItems(dataItemUri)
                            .addOnFailureListener(ioExecutor) { error ->
                                Log.w(LOG_TAG, "Durable Wear transfer queued but DataItem deletion failed", error)
                            }
                    } else {
                        temporaryFile.delete()
                    }
                } catch (error: Exception) {
                    temporaryFile?.delete()
                    Log.e(LOG_TAG, "Wear Asset was retained because file enqueue failed", error)
                }
            }
            .addOnFailureListener(ioExecutor) { error ->
                Log.e(LOG_TAG, "Wear Asset descriptor retrieval failed; DataItem retained", error)
            }
    }

    private fun copyAndVerify(
        input: InputStream,
        destination: File,
        declaredLength: Long,
        declaredSha256: String,
    ) {
        require(declaredLength in 1..TomatoWearWorkoutFileQueue.maxPayloadBytes()) { "Wear payload length is invalid" }
        var total = 0L
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        destination.outputStream().use { output ->
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                require(total <= TomatoWearWorkoutFileQueue.maxPayloadBytes()) { "Wear payload exceeds size limit" }
                digest.update(buffer, 0, count)
                output.write(buffer, 0, count)
            }
            require(total == declaredLength) { "Wear payload length mismatch" }
            val actualSha256 = digest.digest().joinToString("") { "%02x".format(it) }
            require(actualSha256 == declaredSha256) { "Wear payload SHA-256 mismatch" }
            output.flush()
            output.fd.sync()
        }
    }

    companion object {
        private const val LOG_TAG = "TomatoWearListener"
        private val ioExecutor = Executors.newSingleThreadExecutor()

        private fun isAcceptedCompletePath(path: String): Boolean {
            val isRunComplete = path.startsWith("${TomatoWearWorkoutBridge.PATH_RUN_COMPLETE}/")
            val isStrengthComplete = path.startsWith("${TomatoWearWorkoutBridge.PATH_STRENGTH_COMPLETE}/")
            return isRunComplete || isStrengthComplete
        }

        internal fun isAcceptedCompletePathForTest(path: String): Boolean = isAcceptedCompletePath(path)
    }
}
