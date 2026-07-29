package com.lifestreak.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import com.lifestreak.app.MainActivity
import com.lifestreak.app.R
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

class FoodIntakeWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) =
        ids.forEach { TomatoMetricWidgetRenderer.update(context, manager, it, javaClass) }
}

class HealthGoalWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) =
        ids.forEach { TomatoMetricWidgetRenderer.update(context, manager, it, javaClass) }
}

class RunningTrendWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) =
        ids.forEach { TomatoMetricWidgetRenderer.update(context, manager, it, javaClass) }
}

class TomatoStatusDashboardWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) =
        ids.forEach { TomatoStatusDashboardRenderer.update(context, manager, it) }
}

object TomatoMetricWidgetRenderer {
    private const val STALE_AFTER_MS = 12L * 60L * 60L * 1000L

    fun update(context: Context, manager: AppWidgetManager, widgetId: Int, provider: Class<*>) {
        val views = RemoteViews(context.packageName, R.layout.widget_tomato_metric)
        val (sectionKey, title, action, requestOffset) = when (provider) {
            // 각 칸은 그 값을 입력하는 화면으로 들어간다. 식단은 지금 시간대의 끼니
            // 입력, 헬스 목표는 목표입력 시트.
            FoodIntakeWidget::class.java -> Quadruple("food", "일일 음식 섭취", "diet-input", 0)
            HealthGoalWidget::class.java -> Quadruple("strength", "주간 헬스 목표", "workout-goal", 1)
            else -> Quadruple("running", "러닝 추이", "running", 2)
        }
        views.setOnClickPendingIntent(R.id.tomato_metric_widget_root, openIntent(context, action, widgetId * 10 + requestOffset))
        val raw = SeasonWidgetStore.read(context)
        if (raw.isNullOrBlank()) renderEmpty(views, title)
        else try { renderSnapshot(views, JSONObject(raw), sectionKey, title) }
        catch (_: Exception) { renderEmpty(views, title) }
        manager.updateAppWidget(widgetId, views)
    }

    private fun openIntent(context: Context, action: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("widgetAction", action)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, requestCode, intent, flags)
    }

    private fun renderSnapshot(views: RemoteViews, snapshot: JSONObject, key: String, title: String) {
        val section = snapshot.optJSONObject(key) ?: run {
            renderEmpty(views, title)
            return
        }
        val generatedAt = snapshot.optLong("generatedAt", 0L)
        views.setTextViewText(R.id.tomato_metric_widget_kicker, "운동 시즌")
        views.setTextViewText(R.id.tomato_metric_widget_title, title)
        views.setTextViewText(R.id.tomato_metric_widget_meta, metaFor(key, section))
        if (generatedAt <= 0L) {
            renderEmpty(views, title)
            return
        }
        when (key) {
            "food" -> renderFood(views, section)
            "strength" -> renderStrength(views, section)
            else -> renderRunning(views, section)
        }
        views.setTextViewText(
            R.id.tomato_metric_widget_sync,
            if (System.currentTimeMillis() - generatedAt > STALE_AFTER_MS) {
                "마지막 동기화 ${SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).format(Date(generatedAt))}"
            } else {
                "${SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(generatedAt))} 동기화"
            },
        )
    }

    private fun renderFood(views: RemoteViews, food: JSONObject) {
        val actual = food.optInt("actualKcal", 0)
        val target = food.optInt("targetKcal", 0)
        views.setTextViewText(R.id.tomato_metric_widget_value, if (target > 0) "$actual / $target kcal" else "$actual kcal")
        views.setProgressBar(R.id.tomato_metric_widget_progress, 100, food.optInt("progress", 0).coerceIn(0, 100), false)
        views.setTextViewText(R.id.tomato_metric_widget_detail, "P${food.optInt("proteinG", 0)} · C${food.optInt("carbsG", 0)} · F${food.optInt("fatG", 0)}")
        views.setTextViewText(R.id.tomato_metric_widget_secondary, "기록된 식사 ${food.optInt("recordedMeals", 0)}회")
    }

    private fun renderStrength(views: RemoteViews, strength: JSONObject) {
        val sessions = strength.optJSONObject("sessions") ?: JSONObject()
        val actual = sessions.optInt("actual", 0)
        val target = sessions.optInt("target", 0)
        views.setTextViewText(R.id.tomato_metric_widget_value, "운동 $actual / ${target}회")
        views.setProgressBar(R.id.tomato_metric_widget_progress, 100, percent(sessions), false)
        val volume = strength.optJSONObject("volumeTrend")
        val volumeText = volume?.takeIf { it.optString("status") == "ready" }?.let { signed(it.optDouble("volumeDeltaPct", 0.0), "% 볼륨") } ?: "볼륨 기준 수집 중"
        views.setTextViewText(R.id.tomato_metric_widget_detail, volumeText)
        views.setTextViewText(R.id.tomato_metric_widget_secondary, "1RM ${signed(strength.optDouble("liftDeltaKg", Double.NaN), "kg")}")
    }

    private fun renderRunning(views: RemoteViews, running: JSONObject) {
        val distance = running.optJSONObject("distance") ?: JSONObject()
        val sessions = running.optJSONObject("sessions") ?: JSONObject()
        views.setTextViewText(R.id.tomato_metric_widget_value, "${number(distance.optDouble("actual", 0.0))} / ${number(distance.optDouble("target", 0.0))} km")
        views.setProgressBar(R.id.tomato_metric_widget_progress, 100, percent(distance), false)
        val trend = running.optJSONObject("trend")
        val trendText = trend?.takeIf { it.optString("status") == "ready" }?.let {
            "거리 ${signed(it.optDouble("distanceDeltaPct", 0.0), "%")}"
        } ?: "최근 추이 기준 수집 중"
        views.setTextViewText(R.id.tomato_metric_widget_detail, trendText)
        views.setTextViewText(R.id.tomato_metric_widget_secondary, "${sessions.optInt("actual", 0)} / ${sessions.optInt("target", 0)}회 · ${paceText(running)}")
    }

    private fun renderEmpty(views: RemoteViews, title: String) {
        views.setTextViewText(R.id.tomato_metric_widget_kicker, "운동 시즌")
        views.setTextViewText(R.id.tomato_metric_widget_title, title)
        views.setTextViewText(R.id.tomato_metric_widget_meta, "앱 기록을 기다리는 중")
        views.setTextViewText(R.id.tomato_metric_widget_value, "아직 기록 없음")
        views.setProgressBar(R.id.tomato_metric_widget_progress, 100, 0, false)
        views.setTextViewText(R.id.tomato_metric_widget_detail, "앱을 열어 오늘 데이터를 동기화하세요")
        views.setTextViewText(R.id.tomato_metric_widget_secondary, "")
        views.setTextViewText(R.id.tomato_metric_widget_sync, "동기화 대기")
    }

    private fun metaFor(key: String, section: JSONObject): String = when (key) {
        "food" -> section.optString("dateKey", "오늘")
        "strength" -> "이번 주"
        else -> "이번 주"
    }

    private fun percent(value: JSONObject): Int = value.optDouble("percent", 0.0).roundToInt().coerceIn(0, 100)

    private fun number(value: Double, digits: Int = 1): String {
        if (!value.isFinite()) return "0"
        val formatted = String.format(Locale.KOREA, "%.${digits}f", value)
        return if (digits == 0) formatted else formatted.trimEnd('0').trimEnd('.')
    }

    private fun signed(value: Double, suffix: String): String {
        if (!value.isFinite()) return "기준 수집 중"
        val sign = if (value > 0) "+" else ""
        return "$sign${number(value)}$suffix"
    }

    private fun paceText(running: JSONObject): String {
        val goal = running.optJSONObject("goal") ?: return "페이스 기준 수집 중"
        val actual = goal.optDouble("actualPaceSecPerKm", Double.NaN)
        val target = goal.optDouble("targetPaceSecPerKm", Double.NaN)
        return if (actual.isFinite() && target.isFinite()) "페이스 ${number(actual - target, 0)}초 차이" else "페이스 기준 수집 중"
    }

    private data class Quadruple(val first: String, val second: String, val third: String, val fourth: Int)
}

object TomatoStatusDashboardRenderer {
    fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_tomato_status_dashboard)
        views.setOnClickPendingIntent(
            R.id.tomato_dashboard_root,
            openIntent(context, "season-overview", widgetId * 10),
        )
        views.setOnClickPendingIntent(
            R.id.tomato_dashboard_food_root,
            openIntent(context, "diet-input", widgetId * 10 + 1),
        )
        views.setOnClickPendingIntent(
            R.id.tomato_dashboard_strength_root,
            openIntent(context, "workout-goal", widgetId * 10 + 2),
        )
        views.setOnClickPendingIntent(
            R.id.tomato_dashboard_running_root,
            openIntent(context, "running", widgetId * 10 + 3),
        )
        val raw = SeasonWidgetStore.read(context)
        if (raw.isNullOrBlank()) renderEmpty(views)
        else try { renderSnapshot(views, JSONObject(raw)) }
        catch (_: Exception) { renderEmpty(views) }
        manager.updateAppWidget(widgetId, views)
    }

    private fun openIntent(context: Context, action: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra("widgetAction", action)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(context, requestCode, intent, flags)
    }

    private fun renderSnapshot(views: RemoteViews, snapshot: JSONObject) {
        val food = snapshot.optJSONObject("food") ?: JSONObject()
        val goal = snapshot.optJSONObject("weeklyGoal") ?: JSONObject()
        views.setTextViewText(R.id.tomato_dashboard_meta, dateLabel(food.optString("dateKey", "")) + " · 오늘 상태 요약")
        renderFood(views, food)
        renderGoal(views, goal)
        renderRunning(views, snapshot.optJSONArray("recentRunning"))
        views.setTextViewText(R.id.tomato_dashboard_sync, syncLabel(snapshot.optLong("generatedAt", 0L)))
    }

    private fun renderFood(views: RemoteViews, food: JSONObject) {
        val actual = food.optInt("actualKcal", 0)
        val target = food.optInt("targetKcal", 0)
        views.setTextViewText(R.id.tomato_dashboard_food_value, if (target > 0) "$actual / $target kcal" else "$actual kcal")
        views.setProgressBar(R.id.tomato_dashboard_food_progress, 100, food.optInt("progress", 0).coerceIn(0, 100), false)
        views.setTextViewText(
            R.id.tomato_dashboard_food_detail,
            if (food.optString("state") == "waiting") "식단 데이터 필요" else "기록된 식사 ${food.optInt("recordedMeals", 0)}회",
        )
    }

    private fun renderGoal(views: RemoteViews, goal: JSONObject) {
        val items = goal.optJSONArray("items")
        val achieved = goal.optInt("achievedCount", 0)
        val total = goal.optInt("totalCount", 0)
        views.setTextViewText(
            R.id.tomato_dashboard_strength_value,
            if (goal.optString("state") == "missing") "시즌 목표를 설정해 주세요" else "$achieved / $total 목표 달성",
        )
        views.setProgressBar(
            R.id.tomato_dashboard_strength_progress,
            100,
            if (total > 0) (achieved * 100 / total).coerceIn(0, 100) else 0,
            false,
        )
        val lines = mutableListOf<String>()
        if (items != null) {
            for (index in 0 until minOf(items.length(), 5)) {
                val item = items.optJSONObject(index) ?: continue
                val mark = if (item.optString("state") == "achieved") "●" else "○"
                lines += "$mark ${item.optString("label", "운동")} · ${item.optString("detail", "목표 확인")}"
            }
        }
        views.setTextViewText(R.id.tomato_dashboard_strength_items, lines.ifEmpty { listOf("시즌 목표를 설정해 주세요") }.joinToString("\n"))
    }

    private fun renderRunning(views: RemoteViews, records: org.json.JSONArray?) {
        if (records == null || records.length() == 0) {
            views.setTextViewText(R.id.tomato_dashboard_running_summary, "최근 러닝 기록 없음")
            views.setTextViewText(R.id.tomato_dashboard_running_records, "러닝을 기록하면 최근 5회가 여기에 표시됩니다")
            return
        }
        val lines = mutableListOf<String>()
        var totalDistance = 0.0
        for (index in 0 until minOf(records.length(), 5)) {
            val record = records.optJSONObject(index) ?: continue
            val distance = record.optDouble("distanceKm", 0.0)
            totalDistance += distance
            lines += "${dateLabel(record.optString("dateKey", ""))}  ${number(distance)}km · ${pace(record.optInt("avgPaceSecPerKm", 0))}"
        }
        views.setTextViewText(R.id.tomato_dashboard_running_summary, "최근 ${lines.size}회 · ${number(totalDistance)}km")
        views.setTextViewText(R.id.tomato_dashboard_running_records, lines.joinToString("\n"))
    }

    private fun renderEmpty(views: RemoteViews) {
        views.setTextViewText(R.id.tomato_dashboard_meta, "연결 대기 · 앱을 열어 데이터를 동기화하세요")
        renderFood(views, JSONObject())
        renderGoal(views, JSONObject())
        renderRunning(views, null)
        views.setTextViewText(R.id.tomato_dashboard_sync, "동기화 대기")
    }

    private fun dateLabel(value: String): String = if (value.length >= 10) value.substring(5).replace('-', '.') else "오늘"

    private fun pace(seconds: Int): String {
        if (seconds <= 0) return "페이스 --"
        return "페이스 ${seconds / 60}'${String.format(Locale.KOREA, "%02d", seconds % 60)}\""
    }

    private fun number(value: Double): String {
        if (!value.isFinite()) return "0"
        val formatted = String.format(Locale.KOREA, "%.2f", value)
        return formatted.trimEnd('0').trimEnd('.')
    }

    private fun syncLabel(generatedAt: Long): String = if (generatedAt > 0L) {
        "${SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(generatedAt))} 동기화"
    } else "동기화 대기"
}
