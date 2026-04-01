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

class StreakWidget : AppWidgetProvider() {

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
            val views = RemoteViews(ctx.packageName, R.layout.widget_streak)
            val pendingOpen = WidgetUtils.openAppIntent(ctx, widgetId)
            views.setOnClickPendingIntent(R.id.widget_root, pendingOpen)

            views.setTextViewText(R.id.streak_gym, "\uD83C\uDFCB\uFE0F ...")
            views.setTextViewText(R.id.streak_cf, "\uD83D\uDD25 ...")
            views.setTextViewText(R.id.streak_diet, "\uD83E\uDD57 ...")
            views.setTextViewText(R.id.streak_wine, "\uD83C\uDF77 ...")
            mgr.updateAppWidget(widgetId, views)

            thread {
                try {
                    val workouts = WidgetUtils.fetchWorkouts()
                    val now = Calendar.getInstance()

                    // 운동: exercises OR cf (웹 앱과 동일)
                    val gymStreak = WidgetUtils.calcStreak(workouts, now) {
                        WidgetUtils.hasExercises(it) || WidgetUtils.getBool(it, "cf")
                    }
                    // CF: cf만 단독
                    val cfStreak = WidgetUtils.calcStreak(workouts, now) {
                        WidgetUtils.getBool(it, "cf")
                    }
                    // 식단: diet_ok
                    val dietStreak = WidgetUtils.calcStreak(workouts, now) {
                        WidgetUtils.getBool(it, "diet_ok")
                    }
                    // 금주: wine_free 필드 (웹 앱과 동일)
                    val wineStreak = WidgetUtils.calcStreak(workouts, now) {
                        WidgetUtils.getBool(it, "wine_free")
                    }

                    Handler(Looper.getMainLooper()).post {
                        try {
                            val v = RemoteViews(ctx.packageName, R.layout.widget_streak)
                            v.setOnClickPendingIntent(R.id.widget_root, pendingOpen)

                            v.setTextViewText(R.id.streak_gym, "\uD83C\uDFCB\uFE0F ${gymStreak.count}일")
                            v.setTextViewText(R.id.streak_cf, "\uD83D\uDD25 ${cfStreak.count}일")
                            v.setTextViewText(R.id.streak_diet, "\uD83E\uDD57 ${dietStreak.count}일")
                            v.setTextViewText(R.id.streak_wine, "\uD83C\uDF77 ${wineStreak.count}일")

                            v.setTextColor(R.id.streak_gym,
                                if (gymStreak.todayDone) WidgetUtils.COLOR_GREEN else WidgetUtils.COLOR_GRAY)
                            v.setTextColor(R.id.streak_cf,
                                if (cfStreak.todayDone) WidgetUtils.COLOR_GREEN else WidgetUtils.COLOR_GRAY)
                            v.setTextColor(R.id.streak_diet,
                                if (dietStreak.todayDone) WidgetUtils.COLOR_GREEN else WidgetUtils.COLOR_GRAY)
                            v.setTextColor(R.id.streak_wine,
                                if (wineStreak.todayDone) WidgetUtils.COLOR_GREEN else WidgetUtils.COLOR_GRAY)

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
