package com.lifestreak.wear.workout

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * Circular rest-timer progress ring for the flagship rest screen — a small custom `View` in the
 * same Canvas-drawing idiom as [WearRunPaceGraphView]/[WearRunHeartGraphView]. Progress is
 * `remaining / total`, drawn as a lime arc over a muted track, sweeping clockwise from 12 o'clock
 * so it visibly drains as the rest period elapses.
 */
class WearStrengthRestRingView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val bounds = RectF()
    private var progress: Float = 1f

    /** [remainingMs]/[totalMs] clamped to [0,1]; a non-positive [totalMs] draws an empty ring. */
    fun setProgress(remainingMs: Long, totalMs: Long) {
        progress = if (totalMs > 0L) (remainingMs.toFloat() / totalMs.toFloat()).coerceIn(0f, 1f) else 0f
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val strokeWidth = width.coerceAtMost(height) * STROKE_WIDTH_FRACTION
        if (strokeWidth <= 0f) return
        paint.strokeWidth = strokeWidth
        val inset = strokeWidth / 2f
        bounds.set(inset, inset, width - inset, height - inset)

        paint.color = Color.rgb(0x34, 0x3B, 0x31)
        canvas.drawArc(bounds, 0f, 360f, false, paint)

        if (progress > 0f) {
            paint.color = Color.rgb(0xD7, 0xFF, 0x3F)
            canvas.drawArc(bounds, -90f, 360f * progress, false, paint)
        }
    }

    private companion object {
        const val STROKE_WIDTH_FRACTION = 0.07f
    }
}
