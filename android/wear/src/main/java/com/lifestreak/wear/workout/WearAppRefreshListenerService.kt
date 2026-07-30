package com.lifestreak.wear.workout

import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

class WearAppRefreshListenerService : WearableListenerService() {
    override fun onMessageReceived(messageEvent: MessageEvent) {
        if (messageEvent.path != PATH_APP_REFRESH) {
            super.onMessageReceived(messageEvent)
            return
        }

        val payloadBytes = messageEvent.data.take(MAX_PAYLOAD_BYTES).toByteArray()
        val payload = String(payloadBytes, StandardCharsets.UTF_8)
        getSharedPreferences(PREFS_APP_REFRESH, MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_RECEIVED_AT, System.currentTimeMillis())
            .putString(KEY_LAST_PAYLOAD, payload)
            .apply()
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val dataItem = event.dataItem
            val path = dataItem.uri.path
            if (path != null && path.startsWith(PATH_STRENGTH_CONTEXT)) {
                handleStrengthContext(dataItem)
            } else {
                handleSavedAck(dataItem)
            }
        }
    }

    private fun handleSavedAck(dataItem: DataItem) {
        val dataMap = try {
            DataMapItem.fromDataItem(dataItem).dataMap
        } catch (_: Exception) {
            return
        }
        val transferId = WearWorkoutDataLayer.transferIdFromSavedAck(
            dataItem.uri.path,
            dataMap.getString(WearWorkoutDataLayer.TRANSFER_ID_KEY),
        ) ?: return
        WearWorkoutDataLayer.acceptSavedAck(applicationContext, transferId)
        Wearable.getDataClient(applicationContext).deleteDataItems(dataItem.uri)
            .addOnFailureListener { error ->
                Log.w(LOG_TAG, "Saved ACK handled but DataItem deletion failed", error)
            }
    }

    /**
     * The strength-context DataItem is a fixed, overwrite-only item the phone keeps up to date
     * (see plan Phase 2) — unlike the saved-ack item, it is never deleted here so a watch that
     * connects later still finds the latest context.
     */
    private fun handleStrengthContext(dataItem: DataItem) {
        val dataMap = try {
            DataMapItem.fromDataItem(dataItem).dataMap
        } catch (_: Exception) {
            return
        }
        val asset = dataMap.getAsset(STRENGTH_ASSET_KEY) ?: return
        val expectedSha256 = dataMap.getString(STRENGTH_SHA256_KEY) ?: return
        val expectedLength = dataMap.getLong(STRENGTH_BYTE_LENGTH_KEY, -1L)
        if (expectedLength < 0L) return
        val rawBytes = try {
            val fdResponse = Tasks.await(
                Wearable.getDataClient(applicationContext).getFdForAsset(asset),
                ASSET_FETCH_TIMEOUT_SEC,
                TimeUnit.SECONDS,
            )
            fdResponse.inputStream.use { stream -> stream.readBytes() }
        } catch (_: Exception) {
            return
        }
        WearStrengthContextStore.accept(applicationContext, rawBytes, expectedSha256, expectedLength)
    }

    private companion object {
        const val PATH_APP_REFRESH = "/tomato/app/refresh"
        const val PATH_STRENGTH_CONTEXT = "/tomato/workout/strength/context"
        const val PREFS_APP_REFRESH = "tomato_wear_app_refresh"
        const val KEY_LAST_RECEIVED_AT = "last_received_at"
        const val KEY_LAST_PAYLOAD = "last_payload"
        const val MAX_PAYLOAD_BYTES = 2048
        const val LOG_TAG = "TomatoWearRefresh"

        // DataMap keys for the /tomato/workout/strength/context DataItem pushed by the phone's
        // TomatoWearStrengthContextPlugin (Phase 2, android/app) — that plugin must use these
        // exact key names.
        const val STRENGTH_ASSET_KEY = "payload"
        const val STRENGTH_SHA256_KEY = "sha256"
        const val STRENGTH_BYTE_LENGTH_KEY = "byteLength"
        const val ASSET_FETCH_TIMEOUT_SEC = 10L
    }
}
