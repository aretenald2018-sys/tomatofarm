package com.lifestreak.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import com.lifestreak.app.R
import java.util.*
import kotlin.concurrent.thread

class WeekWidget : AppWidgetProvider() {

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
            val views = RemoteViews(ctx.packageName, R.layout.widget_week)
            val pendingOpen = WidgetUtils.openAppIntent(ctx, widgetId)
            views.setOnClickPendingIntent(R.id.widget_root, pendingOpen)

            // Show loading
            views.setTextViewText(R.id.week_title, "이번 주")
            mgr.updateAppWidget(widgetId, views)

            thread {
                try {
                    val workouts = WidgetUtils.fetchWorkouts()
                    val events = WidgetUtils.fetchCalEvents()
                    val now = Calendar.getInstance()

                    Handler(Looper.getMainLooper()).post {
                        try {
                            val v = RemoteViews(ctx.packageName, R.layout.widget_week)
                            v.setOnClickPendingIntent(R.id.widget_root, pendingOpen)

                            // Find Monday of this week
                            val weekStart = now.clone() as Calendar
                            val dow = weekStart.get(Calendar.DAY_OF_WEEK)
                            val offset = if (dow == Calendar.SUNDAY) -6 else Calendar.MONDAY - dow
                            weekStart.add(Calendar.DAY_OF_MONTH, offset)

                            val dayNames = arrayOf("월", "화", "수", "목", "금", "토", "일")
                            val nameIds = arrayOf(
                                R.id.wd0_name, R.id.wd1_name, R.id.wd2_name, R.id.wd3_name,
                                R.id.wd4_name, R.id.wd5_name, R.id.wd6_name
                            )
                            val numIds = arrayOf(
                                R.id.wd0_num, R.id.wd1_num, R.id.wd2_num, R.id.wd3_num,
                                R.id.wd4_num, R.id.wd5_num, R.id.wd6_num
                            )
                            val dotIds = arrayOf(
                                R.id.wd0_dot, R.id.wd1_dot, R.id.wd2_dot, R.id.wd3_dot,
                                R.id.wd4_dot, R.id.wd5_dot, R.id.wd6_dot
                            )
                            val eventIds = arrayOf(
                                R.id.wd0_event, R.id.wd1_event, R.id.wd2_event, R.id.wd3_event,
                                R.id.wd4_event, R.id.wd5_event, R.id.wd6_event
                            )

                            // Title with date range
                            val endCal = weekStart.clone() as Calendar
                            endCal.add(Calendar.DAY_OF_MONTH, 6)
                            val titleText = "${weekStart.get(Calendar.MONTH) + 1}/${weekStart.get(Calendar.DAY_OF_MONTH)} ~ ${endCal.get(Calendar.MONTH) + 1}/${endCal.get(Calendar.DAY_OF_MONTH)}"
                            v.setTextViewText(R.id.week_title, titleText)

                            for (i in 0..6) {
                                val dayCal = weekStart.clone() as Calendar
                                dayCal.add(Calendar.DAY_OF_MONTH, i)

                                val key = WidgetUtils.dateKey(dayCal)
                                val dayData = workouts[key]
                                val isToday = WidgetUtils.isSameDay(dayCal, now)
                                val active = WidgetUtils.hasActivity(dayData)
                                val hasEvent = WidgetUtils.hasEventOnDate(events, dayCal)

                                // Day name
                                v.setTextViewText(nameIds[i], dayNames[i])
                                val nameColor = when {
                                    i == 6 -> WidgetUtils.COLOR_RED    // Sunday
                                    i == 5 -> WidgetUtils.COLOR_BLUE   // Saturday
                                    else -> WidgetUtils.COLOR_GRAY
                                }
                                v.setTextColor(nameIds[i], nameColor)

                                // Day number + click → 일정 등록
                                val dateStr = WidgetUtils.dateKey(dayCal)
                                val datePi = WidgetUtils.openAppWithDate(ctx, dateStr, widgetId * 10 + i)
                                v.setOnClickPendingIntent(numIds[i], datePi)
                                v.setTextViewText(numIds[i], "${dayCal.get(Calendar.DAY_OF_MONTH)}")
                                if (isToday) {
                                    v.setInt(numIds[i], "setBackgroundResource", R.drawable.cal_today_bg)
                                    v.setTextColor(numIds[i], WidgetUtils.COLOR_YELLOW)
                                } else {
                                    v.setInt(numIds[i], "setBackgroundResource", 0)
                                    v.setTextColor(numIds[i], WidgetUtils.COLOR_WHITE)
                                }

                                // Activity dot
                                v.setViewVisibility(dotIds[i],
                                    if (active) View.VISIBLE else View.INVISIBLE)

                                // Event indicator
                                v.setViewVisibility(eventIds[i],
                                    if (hasEvent) View.VISIBLE else View.GONE)
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
