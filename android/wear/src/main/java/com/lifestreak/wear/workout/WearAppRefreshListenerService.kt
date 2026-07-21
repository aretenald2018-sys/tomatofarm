package com.lifestreak.wear.workout

import android.util.Log
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.nio.charset.StandardCharsets

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
            val dataMap = try {
                DataMapItem.fromDataItem(dataItem).dataMap
            } catch (_: Exception) {
                return@forEach
            }
            val transferId = WearWorkoutDataLayer.transferIdFromSavedAck(
                dataItem.uri.path,
                dataMap.getString(WearWorkoutDataLayer.TRANSFER_ID_KEY),
            ) ?: return@forEach
            WearWorkoutDataLayer.acceptSavedAck(applicationContext, transferId)
            Wearable.getDataClient(applicationContext).deleteDataItems(dataItem.uri)
                .addOnFailureListener { error ->
                    Log.w(LOG_TAG, "Saved ACK handled but DataItem deletion failed", error)
                }
        }
    }

    private companion object {
        const val PATH_APP_REFRESH = "/tomato/app/refresh"
        const val PREFS_APP_REFRESH = "tomato_wear_app_refresh"
        const val KEY_LAST_RECEIVED_AT = "last_received_at"
        const val KEY_LAST_PAYLOAD = "last_payload"
        const val MAX_PAYLOAD_BYTES = 2048
        const val LOG_TAG = "TomatoWearRefresh"
    }
}
