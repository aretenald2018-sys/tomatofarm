package com.lifestreak.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import com.lifestreak.app.R
import java.util.*
import kotlin.concurrent.thread

class MonthWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) updateWidget(ctx, mgr, id)
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        super.onReceive(ctx, intent)
        if (intent.action == WidgetUtils.ACTION_REFRESH) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS) ?: return
            for (id in ids) updateWidget(ctx, mgr, id)
        }
    }

    private fun updateWidget(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
        try {
            val views = RemoteViews(ctx.packageName, R.layout.widget_month)
            val pendingOpen = WidgetUtils.openAppIntent(ctx, widgetId)
            views.setOnClickPendingIntent(R.id.widget_root, pendingOpen)

            val now = Calendar.getInstance()
            val year = now.get(Calendar.YEAR)
            val month = now.get(Calendar.MONTH)
            views.setTextViewText(R.id.month_label, "${year}년 ${month + 1}월")

            mgr.updateAppWidget(widgetId, views)

            thread {
                try {
                    val workouts = WidgetUtils.fetchWorkouts()
                    val events = WidgetUtils.fetchCalEvents()

                    Handler(Looper.getMainLooper()).post {
                        try {
                            val v = RemoteViews(ctx.packageName, R.layout.widget_month)
                            v.setOnClickPendingIntent(R.id.widget_root, pendingOpen)
                            v.setTextViewText(R.id.month_label, "${year}년 ${month + 1}월")

                            val firstDay = GregorianCalendar(year, month, 1)
                            val startDow = firstDay.get(Calendar.DAY_OF_WEEK) - 1
                            val daysInMonth = firstDay.getActualMaximum(Calendar.DAY_OF_MONTH)
                            val todayDom = now.get(Calendar.DAY_OF_MONTH)
                            val upcoming = mutableListOf<String>()

                            for (i in 0..41) {
                                val dayNum = i - startDow + 1
                                val cellId = ctx.resources.getIdentifier("cal_d$i", "id", ctx.packageName)
                                if (cellId == 0) continue

                                if (dayNum in 1..daysInMonth) {
                                    val dayCal = GregorianCalendar(year, month, dayNum)
                                    val titles = WidgetUtils.getEventTitles(events, dayCal)
                                    val key = WidgetUtils.dateKey(year, month, dayNum)
                                    val active = WidgetUtils.hasActivity(workouts[key])
                                    val isToday = dayNum == todayDom
                                    val hasEvent = titles.isNotEmpty()
                                    val col = i % 7

                                    // 텍스트: 날짜 + 일정제목
                                    if (hasEvent) {
                                        v.setTextViewText(cellId, "$dayNum\n${titles.first().take(3)}")
                                    } else {
                                        v.setTextViewText(cellId, "$dayNum")
                                    }

                                    // 배경
                                    if (isToday) {
                                        v.setInt(cellId, "setBackgroundResource", R.drawable.cal_today_bg)
                                    } else if (hasEvent) {
                                        v.setInt(cellId, "setBackgroundResource", R.drawable.cal_day_bg)
                                    } else {
                                        v.setInt(cellId, "setBackgroundResource", 0)
                                    }

                                    // 색상
                                    val textColor = when {
                                        isToday -> 0xFFFFD54F.toInt()
                                        active && hasEvent -> 0xFF80FFB0.toInt()
                                        hasEvent -> 0xFF79BAFF.toInt()
                                        active -> 0xFF4CAF50.toInt()
                                        col == 0 -> 0xFFFF6B6B.toInt()
                                        col == 6 -> 0xFF6B9FFF.toInt()
                                        else -> 0xFF888888.toInt()
                                    }
                                    v.setTextColor(cellId, textColor)

                                    // 클릭 → 일정 등록
                                    val dateStr = WidgetUtils.dateKey(year, month, dayNum)
                                    v.setOnClickPendingIntent(cellId, WidgetUtils.openAppWithDate(ctx, dateStr, widgetId * 100 + dayNum))

                                    if (hasEvent) titles.forEach { t -> upcoming.add("${dayNum}일 $t") }
                                } else {
                                    v.setTextViewText(cellId, "")
                                    v.setInt(cellId, "setBackgroundResource", 0)
                                }
                            }

                            // 하단 일정 목록
                            val eventListId = ctx.resources.getIdentifier("event_list", "id", ctx.packageName)
                            if (eventListId != 0 && upcoming.isNotEmpty()) {
                                v.setTextViewText(eventListId, upcoming.joinToString(" · "))
                            }

                            mgr.updateAppWidget(widgetId, v)
                        } catch (e: Exception) { e.printStackTrace() }
                    }
                } catch (e: Exception) { e.printStackTrace() }
            }
        } catch (e: Exception) { e.printStackTrace() }
    }
}
