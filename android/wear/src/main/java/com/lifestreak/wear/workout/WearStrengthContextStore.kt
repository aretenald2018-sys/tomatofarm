package com.lifestreak.wear.workout

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * Persists the phone -> watch strength-context payload (full exercise catalog + last-session
 * inline records) so the watch can browse/prefill exercises even when the phone is unreachable.
 * Mirrors [WearWorkoutDataLayer]'s sha256 verification for the wear -> phone direction.
 */
object WearStrengthContextStore {
    private const val FILE_NAME = "wear-strength-context.json"
    private const val TEMP_FILE_NAME = "wear-strength-context.json.tmp"
    const val PREFS_NAME = "tomato_wear_strength"
    private const val KEY_RECEIVED_AT = "context_received_at"

    /**
     * Verifies [rawBytes] against [expectedSha256]/[expectedLength] and, if valid, writes them
     * atomically (temp file + rename) to `filesDir/$FILE_NAME`. Returns false without touching
     * disk when verification fails.
     */
    fun accept(
        context: Context,
        rawBytes: ByteArray,
        expectedSha256: String,
        expectedLength: Long,
    ): Boolean {
        if (rawBytes.size.toLong() != expectedLength) return false
        if (!sha256Hex(rawBytes).equals(expectedSha256, ignoreCase = true)) return false

        val appContext = context.applicationContext
        val tempFile = File(appContext.filesDir, TEMP_FILE_NAME)
        val targetFile = File(appContext.filesDir, FILE_NAME)
        return try {
            FileOutputStream(tempFile).use { it.write(rawBytes) }
            if (!tempFile.renameTo(targetFile)) return false
            appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_RECEIVED_AT, System.currentTimeMillis())
                .apply()
            true
        } catch (_: Exception) {
            tempFile.delete()
            false
        }
    }

    /** Parses the cached context file. Returns null when absent, unreadable, or corrupt. */
    fun load(context: Context): WearStrengthCatalog? {
        val file = File(context.applicationContext.filesDir, FILE_NAME)
        if (!file.isFile) return null
        return try {
            WearStrengthCatalog.parse(file.readText(Charsets.UTF_8))
        } catch (_: Exception) {
            null
        }
    }

    fun receivedAt(context: Context): Long {
        return context.applicationContext
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getLong(KEY_RECEIVED_AT, 0L)
    }

    private fun sha256Hex(bytes: ByteArray): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it) }
    }
}
