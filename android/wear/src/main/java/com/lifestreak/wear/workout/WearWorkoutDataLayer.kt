package com.lifestreak.wear.workout

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import java.security.MessageDigest

data class WearWorkoutSendResult(
    val success: Boolean,
    val transferId: String,
    val message: String,
)

object WearWorkoutDataLayer {
    const val PATH_RUN_COMPLETE = "/tomato/workout/run/complete"
    const val PATH_RUN_SAVED_ACK = "/tomato/workout/run/saved"
    const val TRANSFER_ID_KEY = "transferId"
    private const val ASSET_KEY = "routePayload"
    private const val BYTE_LENGTH_KEY = "byteLength"
    private const val SHA256_KEY = "sha256"
    private const val PREFS_RUN_TRANSFER = "tomato_wear_run_transfer"
    private const val KEY_LAST_SAVED_TRANSFER_ID = "last_saved_transfer_id"
    private const val MAX_SEND_ATTEMPTS = 3
    private val transferIdPattern = Regex("^[A-Za-z0-9_-]{1,128}$")
    private val savedListeners = linkedSetOf<(String) -> Unit>()
    private val mainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }

    fun sendRunComplete(
        context: Context,
        payload: WearWorkoutPayload,
        onComplete: (WearWorkoutSendResult) -> Unit,
    ): String {
        val payloadBytes = payload.toJsonString().toByteArray(Charsets.UTF_8)
        val sha256 = MessageDigest.getInstance("SHA-256")
            .digest(payloadBytes)
            .joinToString("") { "%02x".format(it) }
        val transferId = "${payload.startedAtMs}-${payload.endedAtMs}-$sha256"
        val request = PutDataMapRequest.create("$PATH_RUN_COMPLETE/$transferId").apply {
            dataMap.putString(TRANSFER_ID_KEY, transferId)
            dataMap.putLong(BYTE_LENGTH_KEY, payloadBytes.size.toLong())
            dataMap.putString(SHA256_KEY, sha256)
            dataMap.putAsset(ASSET_KEY, Asset.createFromBytes(payloadBytes))
        }.asPutDataRequest().setUrgent()

        putRunComplete(context.applicationContext, request, transferId, 0, onComplete)
        return transferId
    }

    private fun putRunComplete(
        context: Context,
        request: PutDataRequest,
        transferId: String,
        attempt: Int,
        onComplete: (WearWorkoutSendResult) -> Unit,
    ) {
        Wearable.getDataClient(context).putDataItem(request)
            .addOnSuccessListener {
                onComplete(WearWorkoutSendResult(true, transferId, "휴대폰 저장 확인 중"))
            }
            .addOnFailureListener {
                if (attempt + 1 < MAX_SEND_ATTEMPTS) {
                    mainHandler.postDelayed(
                        { putRunComplete(context, request, transferId, attempt + 1, onComplete) },
                        1_000L * (attempt + 1),
                    )
                    return@addOnFailureListener
                }
                onComplete(WearWorkoutSendResult(false, transferId, "휴대폰에 보내지 못했어요"))
            }
    }

    fun addSavedListener(listener: (String) -> Unit): () -> Unit {
        synchronized(savedListeners) { savedListeners.add(listener) }
        return { synchronized(savedListeners) { savedListeners.remove(listener) } }
    }

    fun wasSaved(context: Context, transferId: String): Boolean {
        return context.applicationContext
            .getSharedPreferences(PREFS_RUN_TRANSFER, Context.MODE_PRIVATE)
            .getString(KEY_LAST_SAVED_TRANSFER_ID, null) == transferId
    }

    internal fun acceptSavedAck(context: Context, transferId: String) {
        if (!transferIdPattern.matches(transferId)) return
        context.applicationContext
            .getSharedPreferences(PREFS_RUN_TRANSFER, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LAST_SAVED_TRANSFER_ID, transferId)
            .apply()
        val listeners = synchronized(savedListeners) { savedListeners.toList() }
        listeners.forEach { it(transferId) }
    }

    internal fun transferIdFromSavedAck(path: String?, declaredTransferId: String?): String? {
        val prefix = "$PATH_RUN_SAVED_ACK/"
        if (path == null || !path.startsWith(prefix)) return null
        val pathTransferId = path.removePrefix(prefix)
        if (!transferIdPattern.matches(pathTransferId)) return null
        if (declaredTransferId != pathTransferId) return null
        return pathTransferId
    }
}
