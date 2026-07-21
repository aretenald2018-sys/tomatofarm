package com.lifestreak.app.wear

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.lifestreak.app.MainActivity
import org.json.JSONObject
import java.io.File
import java.lang.ref.WeakReference

object TomatoWearWorkoutBridge {
    const val PATH_RUN_COMPLETE = "/tomato/workout/run/complete"
    const val PATH_RUN_SAVED_ACK = "/tomato/workout/run/saved"
    const val ASSET_KEY = "routePayload"
    const val TRANSFER_ID_KEY = "transferId"
    const val BYTE_LENGTH_KEY = "byteLength"
    const val SHA256_KEY = "sha256"
    const val SAVED_AT_KEY = "savedAt"

    private const val NATIVE_ACK_NAME = "__tomatoWearWorkoutNativeAck"
    private const val MAX_DRAIN_ATTEMPTS = 6
    private const val ACK_TIMEOUT_MS = 30_000L
    private val transferIdPattern = Regex("^[A-Za-z0-9_-]{1,128}$")
    private val mainHandler: Handler by lazy { Handler(Looper.getMainLooper()) }
    private val pendingAcknowledgements = PendingAckTracker()
    private val savedAcksInFlight = SavedAckTracker()
    private val nativeAck = NativeAck()
    private var activityRef: WeakReference<MainActivity>? = null

    @JvmStatic
    fun registerActivity(activity: MainActivity) {
        synchronized(this) {
            activityRef = WeakReference(activity)
            pendingAcknowledgements.clearAll()
        }
        TomatoWearWorkoutFileQueue.reconcile(activity)
        activity.bridge?.webView?.addJavascriptInterface(nativeAck, NATIVE_ACK_NAME)
        drainPendingToWebView(activity, 900L)
    }

    @JvmStatic
    fun unregisterActivity(activity: MainActivity) {
        activity.bridge?.webView?.removeJavascriptInterface(NATIVE_ACK_NAME)
        synchronized(this) {
            if (activityRef?.get() === activity) activityRef = null
            pendingAcknowledgements.clearAll()
        }
    }

    @JvmStatic
    fun enqueueFromWearFile(
        context: android.content.Context,
        transferId: String,
        sourceFile: File,
        byteLength: Long,
        sha256: String,
    ): Boolean {
        val queued = TomatoWearWorkoutFileQueue.enqueue(
            context.applicationContext,
            transferId,
            sourceFile,
            byteLength,
            sha256,
        )
        if (queued) activityRef?.get()?.let { drainPendingToWebView(it, 0L) }
        return queued
    }

    @JvmStatic
    fun drainPendingToWebView(activity: MainActivity, delayMs: Long = 0L) {
        val runnable = Runnable { drainOne(activity, 0) }
        if (delayMs > 0L) mainHandler.postDelayed(runnable, delayMs) else mainHandler.post(runnable)
    }

    private fun drainOne(activity: MainActivity, attempt: Int) {
        val entry = synchronized(this) {
            val next = TomatoWearWorkoutFileQueue.first(activity) ?: return
            if (pendingAcknowledgements.isPending(next.id) || savedAcksInFlight.isPending(next.id)) return
            next
        }
        val payload = TomatoWearWorkoutFileQueue.readPayload(activity.filesDir, entry)
        if (payload == null) {
            Log.e("TomatoWearBridge", "Queued Wear payload is missing, corrupt, or outside app storage: ${entry.id}")
            return
        }
        val webView = activity.bridge?.webView
        if (webView == null) {
            retry(activity, attempt)
            return
        }
        val token = synchronized(this) { pendingAcknowledgements.start(entry.id) }
        val script = buildJavascript(entry.id, payload)
        webView.post {
            evaluateBridge(webView, script) { dispatched ->
                if (dispatched) {
                    scheduleAckTimeout(activity, entry.id, token, attempt)
                } else if (synchronized(this) { pendingAcknowledgements.expire(entry.id, token) }) {
                    retry(activity, attempt)
                }
            }
        }
    }

    private fun evaluateBridge(webView: WebView, script: String, callback: (Boolean) -> Unit) {
        webView.evaluateJavascript(script) { result -> callback(result?.contains("DISPATCHED") == true) }
    }

    private fun retry(activity: MainActivity, attempt: Int) {
        if (attempt >= MAX_DRAIN_ATTEMPTS) return
        mainHandler.postDelayed({ drainOne(activity, attempt + 1) }, 1_000L * (attempt + 1))
    }

    private fun scheduleAckTimeout(activity: MainActivity, id: String, token: Long, attempt: Int) {
        mainHandler.postDelayed(
            {
                val expired = synchronized(this) { pendingAcknowledgements.expire(id, token) }
                if (expired) retry(activity, attempt)
            },
            ACK_TIMEOUT_MS,
        )
    }

    private fun buildJavascript(id: String, payload: String): String {
        return """
            (function(){
              var bridge = window.__tomatoWearWorkoutBridge;
              var nativeAck = window.$NATIVE_ACK_NAME;
              if (!bridge || typeof bridge.saveFromNative !== 'function' || !nativeAck) return 'BRIDGE_NOT_READY';
              try {
                Promise.resolve(bridge.saveFromNative(${JSONObject.quote(payload)}))
                  .then(function(result){
                    if (result && result.ok === true) nativeAck.accept(${JSONObject.quote(id)});
                    else nativeAck.reject(${JSONObject.quote(id)});
                  })
                  .catch(function(){ nativeAck.reject(${JSONObject.quote(id)}); });
                return 'DISPATCHED';
              } catch (error) {
                nativeAck.reject(${JSONObject.quote(id)});
                return 'ERROR:' + (error && error.message ? error.message : String(error));
              }
            })()
        """.trimIndent()
    }

    private class NativeAck {
        @JavascriptInterface
        fun accept(id: String) = handleNativeAck(id, accepted = true)

        @JavascriptInterface
        fun reject(id: String) = handleNativeAck(id, accepted = false)
    }

    private fun handleNativeAck(id: String, accepted: Boolean) {
        if (!transferIdPattern.matches(id)) return
        val activity = synchronized(this) { activityRef?.get() } ?: return
        if (!synchronized(this) { pendingAcknowledgements.clear(id) }) return
        if (!accepted) {
            mainHandler.postDelayed({ drainOne(activity, 1) }, 1_000L)
            return
        }
        if (!synchronized(this) { savedAcksInFlight.start(id) }) return
        sendSavedAck(activity, id, 0)
    }

    private fun sendSavedAck(activity: MainActivity, id: String, attempt: Int) {
        val request = PutDataMapRequest.create(savedAckPath(id)).apply {
            dataMap.putString(TRANSFER_ID_KEY, id)
            dataMap.putLong(SAVED_AT_KEY, System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(activity.applicationContext).putDataItem(request)
            .addOnSuccessListener {
                mainHandler.post {
                    synchronized(this) { savedAcksInFlight.finish(id) }
                    if (!synchronized(this) { TomatoWearWorkoutFileQueue.acknowledge(activity, id) }) {
                        Log.e("TomatoWearBridge", "Failed to durably acknowledge Wear payload after saved ACK: $id")
                        mainHandler.postDelayed({ drainOne(activity, 0) }, 1_000L)
                        return@post
                    }
                    drainOne(activity, 0)
                }
            }
            .addOnFailureListener { error ->
                mainHandler.post {
                    if (attempt < MAX_DRAIN_ATTEMPTS) {
                        mainHandler.postDelayed(
                            { sendSavedAck(activity, id, attempt + 1) },
                            1_000L * (attempt + 1),
                        )
                        return@post
                    }
                    synchronized(this) { savedAcksInFlight.finish(id) }
                    Log.w("TomatoWearBridge", "Phone save succeeded but Wear saved ACK retries were exhausted: $id", error)
                    mainHandler.postDelayed({ drainOne(activity, 0) }, ACK_TIMEOUT_MS)
                }
            }
    }

    private fun savedAckPath(id: String): String = "$PATH_RUN_SAVED_ACK/$id"

    internal fun buildJavascriptForTest(id: String, payload: String): String = buildJavascript(id, payload)

    internal fun savedAckPathForTest(id: String): String = savedAckPath(id)

    internal class PendingAckTracker {
        private val tokens = mutableMapOf<String, Long>()
        private var nextToken = 0L

        fun start(id: String): Long {
            nextToken += 1L
            tokens[id] = nextToken
            return nextToken
        }

        fun isPending(id: String): Boolean = tokens.containsKey(id)

        fun clear(id: String): Boolean = tokens.remove(id) != null

        fun expire(id: String, token: Long): Boolean {
            if (tokens[id] != token) return false
            tokens.remove(id)
            return true
        }

        fun clearAll() = tokens.clear()
    }

    internal class SavedAckTracker {
        private val ids = mutableSetOf<String>()

        fun start(id: String): Boolean = ids.add(id)

        fun isPending(id: String): Boolean = ids.contains(id)

        fun finish(id: String): Boolean = ids.remove(id)
    }
}
