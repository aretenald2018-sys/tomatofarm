package com.lifestreak.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.lifestreak.app.MainActivity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.*

object WidgetUtils {

    const val PROJECT_ID = "exercise-management"
    const val API_KEY = "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk"
    const val BASE_URL =
        "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents"

    // Colors
    const val COLOR_GREEN  = 0xFF4CAF50.toInt()
    const val COLOR_RED    = 0xFFFF6B6B.toInt()
    const val COLOR_BLUE   = 0xFF6B9FFF.toInt()
    const val COLOR_YELLOW = 0xFFFFD54F.toInt()
    const val COLOR_GRAY   = 0xFF888888.toInt()
    const val COLOR_DIM    = 0xFF444444.toInt()
    const val COLOR_WHITE  = 0xFFCCCCCC.toInt()
    const val COLOR_TRANSPARENT = 0x00000000

    const val ACTION_REFRESH = "com.lifestreak.REFRESH_WIDGET"

    // ── Date key matching Firestore document IDs ──
    fun dateKey(y: Int, m: Int, d: Int): String =
        "%04d-%02d-%02d".format(y, m + 1, d)

    fun dateKey(cal: Calendar): String =
        dateKey(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH))

    // ── Firestore field helpers ──
    fun getBool(fields: JSONObject, name: String): Boolean {
        return try {
            fields.getJSONObject(name).optBoolean("booleanValue", false)
        } catch (_: Exception) { false }
    }

    fun getString(fields: JSONObject, name: String): String {
        return try {
            fields.getJSONObject(name).optString("stringValue", "")
        } catch (_: Exception) { "" }
    }

    fun hasExercises(fields: JSONObject): Boolean {
        return try {
            val ex = fields.getJSONObject("exercises")
            val arr = ex.getJSONObject("arrayValue").getJSONArray("values")
            arr.length() > 0
        } catch (_: Exception) { false }
    }

    fun hasActivity(fields: JSONObject?): Boolean {
        if (fields == null) return false
        return hasExercises(fields) || getBool(fields, "cf")
    }

    // ── Firestore REST fetch ──
    fun fetchWorkouts(): Map<String, JSONObject> {
        val result = mutableMapOf<String, JSONObject>()
        try {
            val url = URL("$BASE_URL/workouts?pageSize=400&key=$API_KEY")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            try {
                val text = conn.inputStream.bufferedReader().readText()
                val json = JSONObject(text)
                val docs = json.optJSONArray("documents") ?: return result
                for (i in 0 until docs.length()) {
                    val doc = docs.getJSONObject(i)
                    val name = doc.getString("name")
                    val key = name.substringAfterLast("/")
                    val fields = doc.getJSONObject("fields")
                    result[key] = fields
                }
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return result
    }

    fun fetchCalEvents(): List<JSONObject> {
        val result = mutableListOf<JSONObject>()
        try {
            val url = URL("$BASE_URL/cal_events?pageSize=200&key=$API_KEY")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            try {
                val text = conn.inputStream.bufferedReader().readText()
                val json = JSONObject(text)
                val docs = json.optJSONArray("documents") ?: return result
                for (i in 0 until docs.length()) {
                    val doc = docs.getJSONObject(i)
                    val fields = doc.getJSONObject("fields")
                    result.add(fields)
                }
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return result
    }

    fun hasEventOnDate(events: List<JSONObject>, cal: Calendar): Boolean {
        val ds = dateKey(cal)
        return events.any { ev ->
            val start = getString(ev, "start")
            val end = getString(ev, "end").ifEmpty { start }
            ds in start..end
        }
    }

    fun isSameDay(a: Calendar, b: Calendar): Boolean =
        a.get(Calendar.YEAR) == b.get(Calendar.YEAR) &&
        a.get(Calendar.MONTH) == b.get(Calendar.MONTH) &&
        a.get(Calendar.DAY_OF_MONTH) == b.get(Calendar.DAY_OF_MONTH)

    // ── Streak calculation ──
    // Count consecutive days backwards from yesterday where condition is met.
    // If today also meets condition, add 1.
    data class StreakResult(val count: Int, val todayDone: Boolean)

    // 웹 앱과 동일한 스트릭 계산: 오늘부터 역순으로 연속 일수
    fun calcStreak(
        workouts: Map<String, JSONObject>,
        now: Calendar,
        condition: (JSONObject) -> Boolean
    ): StreakResult {
        val todayKey = dateKey(now)
        val todayDone = workouts[todayKey]?.let { condition(it) } ?: false

        var streak = 0
        val cal = now.clone() as Calendar

        for (i in 0..365) {
            val key = dateKey(cal)
            val day = workouts[key]
            val met = day?.let { condition(it) } ?: false
            if (met) {
                streak++
            } else {
                break
            }
            cal.add(Calendar.DAY_OF_MONTH, -1)
        }

        return StreakResult(streak, todayDone)
    }

    // ── Open-app PendingIntent ──
    fun openAppIntent(ctx: Context, requestCode: Int = 0): PendingIntent {
        val intent = Intent(ctx, MainActivity::class.java)
        return PendingIntent.getActivity(
            ctx, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
