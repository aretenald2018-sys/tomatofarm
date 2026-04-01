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

            // Show loading with empty cells
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

                            val firstDay = Calendar.getInstance().apply { set(year, month, 1) }
                            val startDow = firstDay.get(Calendar.DAY_OF_WEEK) - 1 // 0=Sun
                            val daysInMonth = firstDay.getActualMaximum(Calendar.DAY_OF_MONTH)
                            val todayDom = now.get(Calendar.DAY_OF_MONTH)

                            // All 42 cells: cal_d0 through cal_d41
                            for (i in 0..41) {
                                val dayNum = i - startDow + 1
                                val cellId = ctx.resources.getIdentifier("cal_d$i", "id", ctx.packageName)
                                if (cellId == 0) continue

                                if (dayNum in 1..daysInMonth) {
                                    v.setTextViewText(cellId, "$dayNum")

                                    val key = WidgetUtils.dateKey(year, month, dayNum)
                                    val dayData = workouts[key]
                                    val active = WidgetUtils.hasActivity(dayData)
                                    val isToday = dayNum == todayDom

                                    val col = i % 7 // 0=Sun, 6=Sat

                                    // Background
                                    if (isToday) {
                                        v.setInt(cellId, "setBackgroundResource", R.drawable.cal_today_bg)
                                    } else {
                                        v.setInt(cellId, "setBackgroundResource", 0)
                                    }

                                    // Text color
                                    val textColor = when {
                                        isToday -> WidgetUtils.COLOR_YELLOW
                                        active -> WidgetUtils.COLOR_GREEN
                                        col == 0 -> WidgetUtils.COLOR_RED    // Sunday
                                        col == 6 -> WidgetUtils.COLOR_BLUE   // Saturday
                                        else -> WidgetUtils.COLOR_GRAY
                                    }
                                    v.setTextColor(cellId, textColor)
                                } else {
                                    v.setTextViewText(cellId, "")
                                    v.setInt(cellId, "setBackgroundResource", 0)
                                }
                            }

                            mgr.updateAppWidget(widgetId, v)
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
