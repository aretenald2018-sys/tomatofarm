package com.lifestreak.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.lifestreak.app.MainActivity
import com.lifestreak.app.R
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

class SeasonDashboardWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { update(context, manager, it) }
    }

    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        update(context, manager, id)
    }

    companion object {
        private const val STALE_AFTER_MS = 12L * 60L * 60L * 1000L

        private fun actionIntent(context: Context, action: String, requestCode: Int): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                putExtra("widgetAction", action)
                putExtra("tab", "workout")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            return PendingIntent.getActivity(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun intText(value: Double): String = if (value.isFinite()) value.roundToInt().toString() else "0"

        private fun pct(actual: Double, target: Double): Int =
            if (target > 0) ((actual / target) * 100).roundToInt().coerceIn(0, 100) else 0

        private fun pace(value: Double): String {
            if (!value.isFinite() || value <= 0) return "—"
            val total = value.roundToInt()
            return "${total / 60}'" + String.format(Locale.KOREA, "%02d", total % 60) + "\""
        }

        // 최근 러닝 5회를 라인+영역 그래프 비트맵으로 그린다 (사진의 러닝 차트).
        private fun runChartBitmap(context: Context, recent: JSONArray?): Bitmap? {
            val count = recent?.length() ?: 0
            if (count < 2) return null
            // recentRunning은 최신순 → 과거→최신 순으로 뒤집는다.
            val values = DoubleArray(count) { index ->
                val row = recent!!.optJSONObject(count - 1 - index)
                (row?.optDouble("distanceKm", 0.0) ?: 0.0).coerceAtLeast(0.0)
            }
            val width = 360
            val height = 108
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val maxValue = max(values.maxOrNull() ?: 0.0, 0.001)
            val padL = 8f; val padR = 8f; val padT = 10f; val padB = 10f
            val plotW = width - padL - padR
            val plotH = height - padT - padB
            val stepX = if (count > 1) plotW / (count - 1) else 0f
            val blue = ContextCompat.getColor(context, R.color.widget_blue)

            val points = ArrayList<PointF>(count)
            for (index in 0 until count) {
                val x = padL + stepX * index
                val ratio = (values[index] / maxValue).toFloat().coerceIn(0f, 1f)
                val y = padT + plotH * (1f - ratio)
                points.add(PointF(x, y))
            }

            // 영역(반투명 파랑)
            val area = Path().apply {
                moveTo(points.first().x, height - padB)
                points.forEach { lineTo(it.x, it.y) }
                lineTo(points.last().x, height - padB)
                close()
            }
            canvas.drawPath(area, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.FILL
                color = (blue and 0x00FFFFFF) or 0x30000000
            })

            // 라인
            val line = Path().apply {
                moveTo(points.first().x, points.first().y)
                for (index in 1 until points.size) lineTo(points[index].x, points[index].y)
            }
            canvas.drawPath(line, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 5f
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                color = blue
            })

            // 포인트 점 (최신 = 강조)
            val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = blue }
            points.forEachIndexed { index, point ->
                canvas.drawCircle(point.x, point.y, if (index == points.size - 1) 6f else 4f, dot)
            }
            return bitmap
        }

        private fun renderStrengthGoals(context: Context, views: RemoteViews, weeklyGoal: JSONObject) {
            val achieved = weeklyGoal.optInt("achievedCount", 0)
            val total = weeklyGoal.optInt("totalCount", 0)
            views.setTextViewText(R.id.widget_strength_value, "$achieved / $total 목표 달성")
            val items = weeklyGoal.optJSONArray("items")
            val ids = intArrayOf(
                R.id.widget_strength_check_1,
                R.id.widget_strength_check_2,
                R.id.widget_strength_check_3,
                R.id.widget_strength_check_4,
                R.id.widget_strength_check_5,
            )
            ids.forEachIndexed { index, id ->
                val item = items?.optJSONObject(index)
                if (item == null) {
                    views.setViewVisibility(id, View.GONE)
                    return@forEachIndexed
                }
                views.setViewVisibility(id, View.VISIBLE)
                val done = item.optString("state") == "achieved"
                val label = item.optString("label").ifBlank { "목표" }
                val detail = item.optString("detail")
                val text = if (detail.isBlank()) label else "$label  $detail"
                views.setTextViewText(id, (if (done) "✓ " else "○ ") + text)
                views.setTextColor(id, ContextCompat.getColor(context, if (done) R.color.widget_success else R.color.widget_muted))
            }
        }

        private fun renderMacro(views: RemoteViews, valueId: Int, percentId: Int, progressId: Int, actual: Double, target: Double) {
            val actualText = if (actual > 0) intText(actual) else "미입력"
            views.setTextViewText(valueId, if (target > 0) "$actualText / ${intText(target)} g" else actualText)
            val percent = pct(actual, target)
            views.setTextViewText(percentId, if (target > 0) "$percent%" else "—")
            views.setProgressBar(progressId, 100, percent, false)
        }

        private fun signedPct(value: Double): String {
            if (!value.isFinite()) return "—"
            val rounded = (value * 10).roundToInt() / 10.0
            val sign = if (rounded > 0) "+" else ""
            val body = if (rounded % 1.0 == 0.0) rounded.roundToInt().toString() else String.format(Locale.KOREA, "%.1f", rounded)
            return "$sign$body%"
        }

        private fun empty(context: Context, views: RemoteViews, message: String, sync: String = "동기화 대기") {
            views.setTextViewText(R.id.widget_season_title, "오늘/이번 주 요약")
            views.setTextViewText(R.id.widget_season_meta, message)
            views.setTextViewText(R.id.widget_diet_value, "—")
            views.setTextViewText(R.id.widget_diet_kcal_target, "목표 미설정")
            views.setTextViewText(R.id.widget_diet_kcal_percent, "0%")
            views.setTextViewText(R.id.widget_diet_meals, "기록한 식사 0회")
            views.setProgressBar(R.id.widget_diet_progress, 100, 0, false)
            listOf(R.id.widget_diet_carbs_value, R.id.widget_diet_protein_value, R.id.widget_diet_fat_value).forEach { views.setTextViewText(it, "—") }
            listOf(R.id.widget_diet_carbs_percent, R.id.widget_diet_protein_percent, R.id.widget_diet_fat_percent).forEach { views.setTextViewText(it, "0%") }
            listOf(R.id.widget_diet_carbs_progress, R.id.widget_diet_protein_progress, R.id.widget_diet_fat_progress).forEach { views.setProgressBar(it, 100, 0, false) }
            views.setTextViewText(R.id.widget_strength_value, "0 / 0 목표 달성")
            listOf(R.id.widget_strength_check_1, R.id.widget_strength_check_2, R.id.widget_strength_check_3, R.id.widget_strength_check_4, R.id.widget_strength_check_5)
                .forEach { views.setViewVisibility(it, View.GONE) }
            views.setTextViewText(R.id.widget_running_value, "기록 없음")
            views.setTextViewText(R.id.widget_running_last, "러닝을 기록해 주세요")
            views.setTextViewText(R.id.widget_running_improvement, "페이스 개선\n—")
            views.setImageViewResource(R.id.widget_running_chart, R.drawable.widget_run_chart)
            views.setTextViewText(R.id.widget_change_protein, "—")
            views.setTextViewText(R.id.widget_change_strength, "—")
            views.setTextViewText(R.id.widget_change_running, "—")
            views.setTextViewText(R.id.widget_sync_time, sync)
        }

        private fun render(context: Context, views: RemoteViews, snapshot: JSONObject) {
            val generatedAt = snapshot.optLong("generatedAt", 0L)
            if (generatedAt <= 0L || System.currentTimeMillis() - generatedAt > STALE_AFTER_MS) {
                empty(context, views, "앱을 열어 업데이트하세요", "오래된 데이터")
                return
            }
            if (snapshot.optString("state") != "ready") {
                empty(context, views, snapshot.optString("message", "새 시즌을 설정해 주세요"))
                return
            }

            val season = snapshot.optJSONObject("season") ?: JSONObject()
            val food = snapshot.optJSONObject("food") ?: JSONObject()
            val weeklyGoal = snapshot.optJSONObject("weeklyGoal") ?: JSONObject()
            val running = snapshot.optJSONObject("running") ?: JSONObject()
            val recent = snapshot.optJSONArray("recentRunning")
            val week = season.optInt("week", 0)
            val seasonName = season.optString("name", "")
            views.setTextViewText(R.id.widget_season_title, "오늘/이번 주 요약")
            views.setTextViewText(R.id.widget_season_meta, if (seasonName.isBlank()) "운동 시즌" else seasonName + if (week > 0) " · W$week" else "")

            // ── 오늘 식단 ──
            val kcalActual = food.optDouble("actualKcal", 0.0)
            val kcalTarget = food.optDouble("targetKcal", 0.0)
            val kcalProgress = food.optInt("progress", 0)
            views.setTextViewText(R.id.widget_diet_value, intText(kcalActual))
            views.setTextViewText(R.id.widget_diet_kcal_target, String.format(Locale.KOREA, "/ %,d kcal", kcalTarget.roundToInt()))
            views.setTextViewText(R.id.widget_diet_kcal_percent, "$kcalProgress%")
            views.setTextViewText(R.id.widget_diet_meals, "기록한 식사 " + food.optInt("recordedMeals", 0) + "회")
            views.setProgressBar(R.id.widget_diet_progress, 100, kcalProgress, false)
            renderMacro(views, R.id.widget_diet_carbs_value, R.id.widget_diet_carbs_percent, R.id.widget_diet_carbs_progress, food.optDouble("carbsG", 0.0), food.optDouble("carbsTargetG", 0.0))
            renderMacro(views, R.id.widget_diet_protein_value, R.id.widget_diet_protein_percent, R.id.widget_diet_protein_progress, food.optDouble("proteinG", 0.0), food.optDouble("proteinTargetG", 0.0))
            renderMacro(views, R.id.widget_diet_fat_value, R.id.widget_diet_fat_percent, R.id.widget_diet_fat_progress, food.optDouble("fatG", 0.0), food.optDouble("fatTargetG", 0.0))

            // ── 이번 주 근력 목표 ──
            renderStrengthGoals(context, views, weeklyGoal)

            // ── 최근 러닝 (그래프) ──
            var bestPace = Double.NaN
            for (index in 0 until (recent?.length() ?: 0)) {
                val p = recent!!.optJSONObject(index)?.optDouble("avgPaceSecPerKm", 0.0) ?: 0.0
                if (p > 0 && (bestPace.isNaN() || p < bestPace)) bestPace = p
            }
            val goal = running.optJSONObject("goal") ?: JSONObject()
            val baselinePace = goal.optDouble("baselinePaceSecPerKm", Double.NaN)
            if (!bestPace.isNaN()) {
                views.setTextViewText(R.id.widget_running_value, pace(bestPace) + "/km")
                views.setTextViewText(R.id.widget_running_last, if (baselinePace.isFinite()) "이전 " + pace(baselinePace) + "/km" else "최근 5회 최고")
                val diff = if (baselinePace.isFinite()) (bestPace - baselinePace).roundToInt() else null
                val diffText = if (diff != null) (if (diff > 0) "+" else "") + diff + "초" else "—"
                views.setTextViewText(R.id.widget_running_improvement, "페이스 개선\n$diffText")
            } else {
                views.setTextViewText(R.id.widget_running_value, "기록 없음")
                views.setTextViewText(R.id.widget_running_last, "러닝을 기록해 주세요")
                views.setTextViewText(R.id.widget_running_improvement, "페이스 개선\n—")
            }
            val chart = runChartBitmap(context, recent)
            if (chart != null) views.setImageViewBitmap(R.id.widget_running_chart, chart)
            else views.setImageViewResource(R.id.widget_running_chart, R.drawable.widget_run_chart)

            // ── 이번 주 변화 ──
            val proteinPct = pct(food.optDouble("proteinG", 0.0), food.optDouble("proteinTargetG", 0.0))
            views.setTextViewText(R.id.widget_change_protein, "$proteinPct%")
            views.setTextViewText(R.id.widget_change_strength, weeklyGoal.optInt("achievedCount", 0).toString() + " / " + weeklyGoal.optInt("totalCount", 0))
            val paceImprovePct = if (!bestPace.isNaN() && baselinePace.isFinite() && baselinePace > 0) ((baselinePace - bestPace) / baselinePace) * 100 else Double.NaN
            views.setTextViewText(R.id.widget_change_running, if (paceImprovePct.isFinite()) signedPct(paceImprovePct) else "집계 중")

            views.setTextViewText(R.id.widget_sync_time, SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(generatedAt)) + " 동기화")
        }

        fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val options = manager.getAppWidgetOptions(widgetId)
            val compact = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 360) < 300
            val layout = if (compact) R.layout.widget_season_dashboard_compact else R.layout.widget_season_dashboard
            val views = RemoteViews(context.packageName, layout)
            views.setOnClickPendingIntent(R.id.widget_root, actionIntent(context, "workout", widgetId * 10))
            views.setOnClickPendingIntent(R.id.widget_refresh, actionIntent(context, "refresh", widgetId * 10 + 1))
            views.setOnClickPendingIntent(R.id.widget_running_card, actionIntent(context, "running", widgetId * 10 + 2))
            views.setOnClickPendingIntent(R.id.widget_strength_card, actionIntent(context, "workout", widgetId * 10 + 3))
            val raw = SeasonWidgetStore.read(context)
            if (raw.isNullOrBlank()) empty(context, views, "앱을 열어 동기화하세요")
            else try { render(context, views, JSONObject(raw)) } catch (_: Exception) { empty(context, views, "데이터를 다시 동기화하세요") }
            manager.updateAppWidget(widgetId, views)
        }

        // 테스트 전용: 스냅샷 JSON으로 RemoteViews를 만들어 렌더 결과를 비트맵으로 검증한다.
        @androidx.annotation.VisibleForTesting
        internal fun buildRemoteViewsForTest(context: Context, snapshotJson: String): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_season_dashboard)
            try { render(context, views, JSONObject(snapshotJson)) } catch (_: Exception) { empty(context, views, "render error") }
            return views
        }
    }
}
