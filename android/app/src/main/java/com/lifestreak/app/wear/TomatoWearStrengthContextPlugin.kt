package com.lifestreak.app.wear

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Phone -> watch push of the strength workout "context" (full exercise catalog + per-exercise
 * last-session records; see plan Phase 0/2). The DataItem at [PATH_STRENGTH_CONTEXT] is a fixed,
 * overwrite-only item — it is never deleted, so a watch that connects later still picks up the
 * latest context. DataMap key names below are read verbatim by the watch's
 * WearAppRefreshListenerService (android/wear) — they must match exactly.
 */
@CapacitorPlugin(name = "TomatoWearStrengthContext")
class TomatoWearStrengthContextPlugin : Plugin() {
    @PluginMethod
    fun pushStrengthContext(call: PluginCall) {
        val payload = call.getString("payload")
        if (payload.isNullOrBlank()) {
            call.reject("payload is required")
            return
        }
        val bytes = payload.toByteArray(StandardCharsets.UTF_8)
        if (bytes.isEmpty() || bytes.size > MAX_PAYLOAD_BYTES) {
            call.reject("payload size is invalid")
            return
        }

        val sha256 = sha256Hex(bytes)
        val request = PutDataMapRequest.create(PATH_STRENGTH_CONTEXT).apply {
            dataMap.putAsset(ASSET_KEY, Asset.createFromBytes(bytes))
            dataMap.putString(SHA256_KEY, sha256)
            dataMap.putLong(BYTE_LENGTH_KEY, bytes.size.toLong())
            dataMap.putLong(GENERATED_AT_KEY, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()

        Wearable.getDataClient(context).putDataItem(request)
            .addOnSuccessListener {
                call.resolve()
            }
            .addOnFailureListener { error ->
                call.reject(error.message ?: "strength context push failed", error)
            }
    }

    private fun sha256Hex(bytes: ByteArray): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
    }

    private companion object {
        const val PATH_STRENGTH_CONTEXT = "/tomato/workout/strength/context"
        const val ASSET_KEY = "payload"
        const val SHA256_KEY = "sha256"
        const val BYTE_LENGTH_KEY = "byteLength"
        const val GENERATED_AT_KEY = "generatedAt"
        const val MAX_PAYLOAD_BYTES = 1_048_576
    }
}
