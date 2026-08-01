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
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
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
import kotlin.math.roundToInt

// 러닝 차트 한 점: 위에는 평균 페이스, 아래에는 날짜를 찍는다.
private data class RunPoint(val date: String, val paceSecPerKm: Double)

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

        // 라벨이 비트맵 밖으로 새지 않게 가운데 정렬 기준 x를 안쪽으로 당긴다.
        private fun centered(x: Float, textWidth: Float, width: Int): Float {
            val half = textWidth / 2f
            return if (half * 2f >= width) width / 2f else x.coerceIn(half, width - half)
        }

        // "2026-07-18" → "7/18". 차트 아래에 붙일 짧은 날짜.
        private fun shortDate(dateKey: String): String {
            val parts = dateKey.split("-")
            val month = parts.getOrNull(1)?.toIntOrNull()
            val day = parts.getOrNull(2)?.toIntOrNull()
            return if (month == null || day == null) dateKey else "$month/$day"
        }

        // recentRunning은 최신순 → 과거→최신 순으로 뒤집고 페이스가 있는 기록만 남긴다.
        private fun runPoints(recent: JSONArray?): List<RunPoint> {
            val count = recent?.length() ?: 0
            val points = ArrayList<RunPoint>(count)
            for (index in count - 1 downTo 0) {
                val row = recent?.optJSONObject(index) ?: continue
                val pace = row.optDouble("avgPaceSecPerKm", 0.0)
                if (!pace.isFinite() || pace <= 0) continue
                points.add(RunPoint(shortDate(row.optString("dateKey")), pace))
            }
            return points
        }

        // 최근 러닝을 평균 페이스 추이 그래프로 그린다. 점마다 날짜(아래)와
        // 평균 페이스(위)를 같이 찍어야 그래프만 보고도 읽을 수 있다.
        // 빠를수록(페이스 숫자가 작을수록) 위로 올라간다.
        private fun runChartBitmap(context: Context, recent: JSONArray?, widthPx: Int, heightPx: Int): Bitmap? {
            val runs = runPoints(recent)
            if (runs.size < 2) return null
            val width = widthPx.coerceIn(200, 1200)
            val height = heightPx.coerceIn(90, 500)
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val blue = ContextCompat.getColor(context, R.color.widget_blue)

            val textSize = (height * 0.17f).coerceIn(18f, 34f)
            val pacePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = blue
                this.textSize = textSize
                textAlign = Paint.Align.CENTER
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
            val datePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = ContextCompat.getColor(context, R.color.widget_secondary)
                this.textSize = textSize * 0.94f
                textAlign = Paint.Align.CENTER
            }

            // 라벨이 잘리지 않도록 위/아래/좌우에 글자 높이만큼 여백을 둔다.
            val padT = textSize * 1.9f
            val padB = textSize * 1.9f
            val padX = textSize * 1.5f
            val plotW = (width - padX * 2).coerceAtLeast(1f)
            val plotH = (height - padT - padB).coerceAtLeast(1f)
            val stepX = plotW / (runs.size - 1)
            val fastest = runs.minOf { it.paceSecPerKm }
            val slowest = runs.maxOf { it.paceSecPerKm }
            val span = (slowest - fastest).takeIf { it > 0.5 }

            val points = runs.mapIndexed { index, run ->
                val ratio = if (span == null) 0.5f else ((slowest - run.paceSecPerKm) / span).toFloat()
                PointF(padX + stepX * index, padT + plotH * (1f - ratio.coerceIn(0f, 1f)))
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
                strokeWidth = (height * 0.04f).coerceIn(3f, 6f)
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
                color = blue
            })

            // 포인트 점 (최신 = 강조) + 페이스/날짜 라벨
            val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = blue }
            val dotRadius = (height * 0.045f).coerceIn(3f, 7f)
            points.forEachIndexed { index, point ->
                canvas.drawCircle(point.x, point.y, if (index == points.size - 1) dotRadius * 1.5f else dotRadius, dot)
                val paceLabel = pace(runs[index].paceSecPerKm)
                canvas.drawText(paceLabel, centered(point.x, pacePaint.measureText(paceLabel), width), point.y - textSize * 0.75f, pacePaint)
                val dateLabel = runs[index].date
                canvas.drawText(dateLabel, centered(point.x, datePaint.measureText(dateLabel), width), height - textSize * 0.6f, datePaint)
            }
            return bitmap
        }

        // 칼로리 도넛. 고정 dp ProgressBar는 카드보다 크면 위아래가 잘렸으므로,
        // 직접 그린 비트맵을 ImageView(scaleType=fitCenter)에 얹는다. 카드가 얕아지면
        // 링이 통째로 작아질 뿐 잘리지 않는다.
        private fun dietRingBitmap(context: Context, percent: Int, sizePx: Int): Bitmap {
            val size = sizePx.coerceIn(96, 400)
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val stroke = size * 0.115f
            val inset = stroke / 2f
            val rect = RectF(inset, inset, size - inset, size - inset)
            canvas.drawArc(rect, 0f, 360f, false, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                color = ContextCompat.getColor(context, R.color.widget_success_soft)
            })
            val swept = percent.coerceIn(0, 100) / 100f * 360f
            if (swept > 0f) {
                canvas.drawArc(rect, -90f, swept, false, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    style = Paint.Style.STROKE
                    strokeWidth = stroke
                    strokeCap = Paint.Cap.ROUND
                    color = ContextCompat.getColor(context, R.color.widget_success)
                })
            }
            return bitmap
        }

        // 링 안 글자도 링과 같이 줄어야 구멍 밖으로 넘치지 않는다. 다만 본문 최소
        // 10sp 규칙은 그대로 지키고, 그보다 작아져야 할 상황이면 목표 kcal 줄을
        // 접어 숫자와 퍼센트만 남긴다.
        private fun renderDietRing(context: Context, views: RemoteViews, percent: Int, ringDp: Float) {
            val sizePx = (ringDp * context.resources.displayMetrics.density).roundToInt()
            views.setImageViewBitmap(R.id.widget_diet_ring, dietRingBitmap(context, percent, sizePx))
            views.setTextViewTextSize(R.id.widget_diet_value, TypedValue.COMPLEX_UNIT_SP, (ringDp * 0.27f).coerceIn(14f, 21f))
            views.setTextViewTextSize(R.id.widget_diet_kcal_percent, TypedValue.COMPLEX_UNIT_SP, (ringDp * 0.16f).coerceIn(10f, 13f))
            views.setViewVisibility(R.id.widget_diet_kcal_target, if (ringDp < 56f) View.GONE else View.VISIBLE)
        }

        // 근력 목표 한 줄 = [체크 마크][종목명][처방]. 행 컨테이너를 통째로 숨기면
        // 그 행의 구분선까지 같이 사라진다.
        private val STRENGTH_ROWS = arrayOf(
            intArrayOf(R.id.widget_strength_row_1, R.id.widget_strength_mark_1, R.id.widget_strength_check_1, R.id.widget_strength_detail_1),
            intArrayOf(R.id.widget_strength_row_2, R.id.widget_strength_mark_2, R.id.widget_strength_check_2, R.id.widget_strength_detail_2),
            intArrayOf(R.id.widget_strength_row_3, R.id.widget_strength_mark_3, R.id.widget_strength_check_3, R.id.widget_strength_detail_3),
            intArrayOf(R.id.widget_strength_row_4, R.id.widget_strength_mark_4, R.id.widget_strength_check_4, R.id.widget_strength_detail_4),
            intArrayOf(R.id.widget_strength_row_5, R.id.widget_strength_mark_5, R.id.widget_strength_check_5, R.id.widget_strength_detail_5),
        )

        private fun hideStrengthRows(views: RemoteViews) {
            STRENGTH_ROWS.forEach { views.setViewVisibility(it[0], View.GONE) }
        }

        private fun renderStrengthGoals(context: Context, views: RemoteViews, weeklyGoal: JSONObject) {
            val achieved = weeklyGoal.optInt("achievedCount", 0)
            val total = weeklyGoal.optInt("totalCount", 0)
            views.setTextViewText(R.id.widget_strength_value, "$achieved / $total 목표 달성")
            val items = weeklyGoal.optJSONArray("items")
            STRENGTH_ROWS.forEachIndexed { index, row ->
                val item = items?.optJSONObject(index)
                if (item == null) {
                    views.setViewVisibility(row[0], View.GONE)
                    return@forEachIndexed
                }
                views.setViewVisibility(row[0], View.VISIBLE)
                val state = item.optString("state")
                val done = state == "achieved"
                views.setInt(
                    row[1], "setBackgroundResource",
                    if (done) R.drawable.widget_check_on else R.drawable.widget_check_off,
                )
                views.setTextViewText(row[1], if (done) "✓" else "")
                views.setTextViewText(row[2], item.optString("label").ifBlank { "목표" })
                views.setTextColor(
                    row[2],
                    ContextCompat.getColor(context, if (done) R.color.widget_success else R.color.widget_text),
                )
                views.setTextViewText(row[3], item.optString("detail"))
            }
        }

        private fun renderMacro(views: RemoteViews, valueId: Int, percentId: Int, progressId: Int, actual: Double, target: Double) {
            val actualText = if (actual > 0) intText(actual) else "미입력"
            views.setTextViewText(valueId, if (target > 0) "$actualText / ${intText(target)} g" else actualText)
            val percent = pct(actual, target)
            views.setTextViewText(percentId, if (target > 0) "$percent%" else "—")
            views.setProgressBar(progressId, 100, percent, false)
        }

        // 페이스 배지. diffSec < 0 이면 이전보다 빨라진 것(개선), > 0 이면 느려진 것.
        // 값이 없으면 중립(파랑)으로 둔다.
        private fun paceBadge(context: Context, views: RemoteViews, diffSec: Int?) {
            val background = when {
                diffSec == null || diffSec == 0 -> R.drawable.widget_pill_blue
                diffSec < 0 -> R.drawable.widget_pill_green
                else -> R.drawable.widget_pill_orange
            }
            val textColor = when {
                diffSec == null || diffSec == 0 -> R.color.widget_blue
                diffSec < 0 -> R.color.widget_success
                else -> R.color.widget_orange
            }
            val label = when {
                diffSec == null -> "페이스 개선 —"
                diffSec < 0 -> "페이스 개선 ↑ ${-diffSec}초"
                diffSec > 0 -> "페이스 개선 ↓ ${diffSec}초"
                else -> "페이스 개선 유지"
            }
            views.setInt(R.id.widget_running_improvement, "setBackgroundResource", background)
            views.setTextColor(R.id.widget_running_improvement, ContextCompat.getColor(context, textColor))
            views.setTextViewText(R.id.widget_running_improvement, label)
        }

        private fun empty(context: Context, views: RemoteViews, message: String, ringDp: Float, sync: String = "동기화 대기") {
            views.setTextViewText(R.id.widget_season_title, "오늘/이번 주 요약")
            views.setTextViewText(R.id.widget_season_meta, message)
            views.setTextViewText(R.id.widget_diet_value, "—")
            views.setTextViewText(R.id.widget_diet_kcal_target, "목표 미설정")
            views.setTextViewText(R.id.widget_diet_kcal_percent, "0%")
            views.setTextViewText(R.id.widget_diet_meals, "기록한 식사 0회")
            renderDietRing(context, views, 0, ringDp)
            listOf(R.id.widget_diet_carbs_value, R.id.widget_diet_protein_value, R.id.widget_diet_fat_value).forEach { views.setTextViewText(it, "—") }
            listOf(R.id.widget_diet_carbs_percent, R.id.widget_diet_protein_percent, R.id.widget_diet_fat_percent).forEach { views.setTextViewText(it, "0%") }
            listOf(R.id.widget_diet_carbs_progress, R.id.widget_diet_protein_progress, R.id.widget_diet_fat_progress).forEach { views.setProgressBar(it, 100, 0, false) }
            views.setTextViewText(R.id.widget_strength_value, "0 / 0 목표 달성")
            hideStrengthRows(views)
            views.setTextViewText(R.id.widget_running_subtitle, "평균 페이스 (km당)")
            views.setTextViewText(R.id.widget_running_value, "기록 없음")
            views.setTextViewText(R.id.widget_running_last, "러닝을 기록해 주세요")
            paceBadge(context, views, null)
            views.setImageViewResource(R.id.widget_running_chart, R.drawable.widget_run_chart)
            views.setTextViewText(R.id.widget_sync_time, sync)
        }

        private fun render(context: Context, views: RemoteViews, snapshot: JSONObject, chartWidthPx: Int, chartHeightPx: Int, ringDp: Float) {
            val generatedAt = snapshot.optLong("generatedAt", 0L)
            if (generatedAt <= 0L || System.currentTimeMillis() - generatedAt > STALE_AFTER_MS) {
                empty(context, views, "앱을 열어 업데이트하세요", ringDp, "오래된 데이터")
                return
            }
            if (snapshot.optString("state") != "ready") {
                empty(context, views, snapshot.optString("message", "새 시즌을 설정해 주세요"), ringDp)
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
            renderDietRing(context, views, kcalProgress, ringDp)
            renderMacro(views, R.id.widget_diet_carbs_value, R.id.widget_diet_carbs_percent, R.id.widget_diet_carbs_progress, food.optDouble("carbsG", 0.0), food.optDouble("carbsTargetG", 0.0))
            renderMacro(views, R.id.widget_diet_protein_value, R.id.widget_diet_protein_percent, R.id.widget_diet_protein_progress, food.optDouble("proteinG", 0.0), food.optDouble("proteinTargetG", 0.0))
            renderMacro(views, R.id.widget_diet_fat_value, R.id.widget_diet_fat_percent, R.id.widget_diet_fat_progress, food.optDouble("fatG", 0.0), food.optDouble("fatTargetG", 0.0))

            // ── 이번 주 근력 목표 ──
            renderStrengthGoals(context, views, weeklyGoal)

            // ── 최근 러닝 (그래프) ──
            val runs = runPoints(recent)
            val bestPace = runs.minOfOrNull { it.paceSecPerKm } ?: Double.NaN
            val goal = running.optJSONObject("goal") ?: JSONObject()
            val baselinePace = goal.optDouble("baselinePaceSecPerKm", Double.NaN)
            if (!bestPace.isNaN()) {
                views.setTextViewText(R.id.widget_running_subtitle, "최근 ${runs.size}회 최고 페이스")
                views.setTextViewText(R.id.widget_running_value, pace(bestPace) + "/km")
                views.setTextViewText(R.id.widget_running_last, if (baselinePace.isFinite()) "이전 " + pace(baselinePace) + "/km" else "km당 평균")
                paceBadge(context, views, if (baselinePace.isFinite()) (bestPace - baselinePace).roundToInt() else null)
            } else {
                views.setTextViewText(R.id.widget_running_subtitle, "평균 페이스 (km당)")
                views.setTextViewText(R.id.widget_running_value, "기록 없음")
                views.setTextViewText(R.id.widget_running_last, "러닝을 기록해 주세요")
                paceBadge(context, views, null)
            }
            val chart = runChartBitmap(context, recent, chartWidthPx, chartHeightPx)
            if (chart != null) views.setImageViewBitmap(R.id.widget_running_chart, chart)
            else views.setImageViewResource(R.id.widget_running_chart, R.drawable.widget_run_chart)

            views.setTextViewText(R.id.widget_sync_time, SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(generatedAt)) + " 동기화")
        }

        fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val options = manager.getAppWidgetOptions(widgetId)
            val heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 360)
            val widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 320)
            val compact = heightDp < 300
            val layout = if (compact) R.layout.widget_season_dashboard_compact else R.layout.widget_season_dashboard
            val views = RemoteViews(context.packageName, layout)
            views.setOnClickPendingIntent(R.id.widget_root, actionIntent(context, "workout", widgetId * 10))
            views.setOnClickPendingIntent(R.id.widget_refresh, actionIntent(context, "refresh", widgetId * 10 + 1))
            views.setOnClickPendingIntent(R.id.widget_sync_refresh, actionIntent(context, "refresh", widgetId * 10 + 4))
            views.setOnClickPendingIntent(R.id.widget_running_card, actionIntent(context, "running", widgetId * 10 + 2))
            views.setOnClickPendingIntent(R.id.widget_strength_card, actionIntent(context, "workout", widgetId * 10 + 3))
            val raw = SeasonWidgetStore.read(context)
            val chart = chartSizePx(context, widthDp, heightDp, compact)
            val ringDp = dietRingDp(widthDp, heightDp, compact)
            if (raw.isNullOrBlank()) empty(context, views, "앱을 열어 동기화하세요", ringDp)
            else try { render(context, views, JSONObject(raw), chart.first, chart.second, ringDp) } catch (_: Exception) { empty(context, views, "데이터를 다시 동기화하세요", ringDp) }
            manager.updateAppWidget(widgetId, views)
        }

        // 식단 카드 안 도넛 자리의 대략적인 크기(dp). 레이아웃의 weight와 padding을
        // 되짚어 추정한다. 비트맵 해상도와 가운데 글자 크기를 정하는 데만 쓰므로
        // 추정이 조금 빗나가도 링은 fitCenter라 잘리지 않는다.
        private fun dietRingDp(widgetWidthDp: Int, widgetHeightDp: Int, compact: Boolean): Float {
            val byHeight = if (compact) {
                val cardsDp = (widgetHeightDp - 78).coerceAtLeast(120).toFloat()
                cardsDp * 1.35f / 2.35f - 38f
            } else {
                val cardsDp = (widgetHeightDp - 101).coerceAtLeast(180).toFloat()
                cardsDp * 1.3f / 3.6f - 44f
            }
            // 가로: 루트/카드 패딩을 뺀 뒤 도넛 칸과 매크로 칸의 weight 비율로 나눈다.
            val innerWidthDp = (widgetWidthDp.coerceAtLeast(200) - if (compact) 38 else 46).toFloat()
            val byWidth = innerWidthDp / (if (compact) 2.2f else 2.35f)
            return minOf(byHeight, byWidth).coerceIn(34f, 92f)
        }

        // 차트 비트맵은 ImageView와 같은 픽셀 크기로 그려야 (scaleType=fitXY) 라벨이
        // 늘어나 보이지 않는다. 레이아웃의 layout_weight와 padding을 그대로 되짚어
        // 러닝 카드 안 차트 영역의 dp 크기를 추정한다.
        private fun chartSizePx(context: Context, widgetWidthDp: Int, widgetHeightDp: Int, compact: Boolean): Pair<Int, Int> {
            val density = context.resources.displayMetrics.density
            val chartWeight = if (compact) 1.3f else 1.4f
            // 가로: 루트 패딩(10/8 ×2) + 러닝 카드 패딩(11/9 ×2)을 뺀 뒤 weight로 나눈다.
            val innerWidthDp = (widgetWidthDp.coerceAtLeast(200) - if (compact) 34 else 42).toFloat()
            val chartWidthDp = innerWidthDp * chartWeight / (1f + chartWeight)
            // 세로: 카드 밖(패딩·헤더·동기화 줄)을 뺀 나머지를 카드 weight 비율로 나눈다.
            val chartHeightDp = if (compact) {
                val cardsDp = (widgetHeightDp - 78).coerceAtLeast(120).toFloat()
                (cardsDp * 1f / 2.35f - 36f).coerceIn(36f, 90f)
            } else {
                val cardsDp = (widgetHeightDp - 101).coerceAtLeast(180).toFloat()
                (cardsDp * 1.05f / 3.6f - 46f).coerceIn(50f, 150f)
            }
            return Pair((chartWidthDp * density).roundToInt(), (chartHeightDp * density).roundToInt())
        }

        // 테스트 전용: 스냅샷 JSON으로 RemoteViews를 만들어 렌더 결과를 비트맵으로 검증한다.
        @androidx.annotation.VisibleForTesting
        internal fun buildRemoteViewsForTest(
            context: Context,
            snapshotJson: String,
            widthDp: Int = 360,
            heightDp: Int = 540,
            compact: Boolean = false,
        ): RemoteViews {
            val layout = if (compact) R.layout.widget_season_dashboard_compact else R.layout.widget_season_dashboard
            val views = RemoteViews(context.packageName, layout)
            val chart = chartSizePx(context, widthDp, heightDp, compact)
            val ringDp = dietRingDp(widthDp, heightDp, compact)
            try { render(context, views, JSONObject(snapshotJson), chart.first, chart.second, ringDp) } catch (_: Exception) { empty(context, views, "render error", ringDp) }
            return views
        }
    }
}
