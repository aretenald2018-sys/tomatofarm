package com.lifestreak.wear.workout

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Handler
import android.os.SystemClock
import android.util.Log
import android.view.View
import androidx.core.content.ContextCompat
import android.widget.TextView
import androidx.viewpager2.widget.ViewPager2
import com.lifestreak.wear.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class WearWorkoutUiController(
    private val handler: Handler,
    nowMs: () -> Long = { SystemClock.elapsedRealtime() },
) {
    private val runState = WearRunUiState(nowMs)
    private var sessionStoreUnsubscribe: (() -> Unit)? = null
    private var runEndUnsubscribe: (() -> Unit)? = null
    private var savedAckUnsubscribe: (() -> Unit)? = null
    private var pendingTransferId: String? = null
    private var metricPagerAdapter: WearRunMetricPagerAdapter? = null
    private var metricPager: ViewPager2? = null
    private var metricPageCallback: ViewPager2.OnPageChangeCallback? = null
    private var metricPagePosition = 0
    private var summarySyncStatus = ""
    private var gpsStatus = "바로 시작할 수 있어요"
    private var gpsStatusColor = Color.parseColor("#7C8499")
    private var finishRequested = false
    private var ignoreExerciseUpdatesUntilStart = false
    private var hostInteractive = true

    private companion object {
        const val TAG = "TomatoWearRun"
    }

    fun bind(v: View) {
        clearRunTick(v)
        bindAttachCleanup(v)
        bindExerciseStore(v)
        bindSavedAck(v)
        initializeMetricPager(v)

        v.findViewById<View>(R.id.runStartButton)?.setOnClickListener {
            startRun(v)
        }
        v.findViewById<View>(R.id.runPauseButton)?.setOnClickListener {
            pauseRun(v)
        }
        v.findViewById<View>(R.id.runResumeButton)?.setOnClickListener {
            resumeRun(v)
        }
        v.findViewById<View>(R.id.runFinalStopButton)?.setOnClickListener {
            finishRun(v)
        }
        v.findViewById<View>(R.id.runSummaryDoneButton)?.setOnClickListener {
            finishRequested = false
            ignoreExerciseUpdatesUntilStart = true
            pendingTransferId = null
            runState.reset()
            WearExerciseSessionStore.reset()
            WearExerciseSessionPersistence.clear(v.context)
            WearExerciseService.prepareRun(v.context)
            render(v)
        }

        render(v)
        if (runState.screen == WearRunUiScreen.ACTIVE) scheduleRunTick(v)
    }

    fun dispose() {
        sessionStoreUnsubscribe?.invoke()
        sessionStoreUnsubscribe = null
        runEndUnsubscribe?.invoke()
        runEndUnsubscribe = null
        savedAckUnsubscribe?.invoke()
        savedAckUnsubscribe = null
        pendingTransferId = null
        metricPageCallback?.let { callback -> metricPager?.unregisterOnPageChangeCallback(callback) }
        metricPageCallback = null
        metricPager = null
        handler.removeCallbacksAndMessages(null)
    }

    fun onHostResumed(v: View) {
        hostInteractive = true
        val snapshot = WearExerciseSessionStore.current()
        if (snapshot.status in setOf(
                WearExerciseSessionStatus.ENDED,
                WearExerciseSessionStatus.ERROR,
            )
        ) {
            finishRequested = false
        }
        runState.restoreFromSession(snapshot)
        updateRunLiveMetrics(snapshot)
        updateGpsPresentation(snapshot)
        render(v)
        if (runState.screen == WearRunUiScreen.ACTIVE) scheduleRunTick(v)
    }

    fun onHostPaused(v: View) {
        hostInteractive = false
        v.keepScreenOn = false
        clearRunTick(v)
    }

    private fun bindExerciseStore(v: View) {
        sessionStoreUnsubscribe?.invoke()
        sessionStoreUnsubscribe = WearExerciseSessionStore.addListener { snapshot ->
            if (ignoreExerciseUpdatesUntilStart && snapshot.status != WearExerciseSessionStatus.IDLE) {
                return@addListener
            }
            if (!hostInteractive) return@addListener
            if (finishRequested && snapshot.status !in setOf(
                    WearExerciseSessionStatus.ENDED,
                    WearExerciseSessionStatus.ERROR,
                )
            ) {
                updateRunLiveMetrics(snapshot)
                if (hostInteractive) render(v)
                return@addListener
            }
            if (snapshot.status in setOf(
                    WearExerciseSessionStatus.ENDED,
                    WearExerciseSessionStatus.ERROR,
                )
            ) {
                finishRequested = false
            }
            runState.restoreFromSession(snapshot)
            updateRunLiveMetrics(snapshot)
            updateGpsPresentation(snapshot)
            if (hostInteractive) {
                render(v)
                if (runState.screen == WearRunUiScreen.ACTIVE) scheduleRunTick(v)
            }
        }
    }

    private fun bindSavedAck(v: View) {
        savedAckUnsubscribe?.invoke()
        savedAckUnsubscribe = WearWorkoutDataLayer.addSavedListener { transferId ->
            if (transferId != pendingTransferId) return@addSavedListener
            handler.post { showSavedAck(v, transferId) }
        }
    }

    private fun showSavedAck(v: View, transferId: String) {
        if (transferId != pendingTransferId) return
        pendingTransferId = null
        summarySyncStatus = "휴대폰에 저장했어요"
        render(v)
    }

    private fun bindAttachCleanup(v: View) {
        v.getTag(R.id.wear_run_attach_listener)?.let { existing ->
            v.removeOnAttachStateChangeListener(existing as View.OnAttachStateChangeListener)
        }
        val attachListener = object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(view: View) {
                render(view)
                if (runState.screen == WearRunUiScreen.ACTIVE) scheduleRunTick(view)
            }

            override fun onViewDetachedFromWindow(view: View) {
                view.keepScreenOn = false
                clearRunTick(view)
            }
        }
        v.addOnAttachStateChangeListener(attachListener)
        v.setTag(R.id.wear_run_attach_listener, attachListener)
    }

    private fun startRun(v: View) {
        if (ContextCompat.checkSelfPermission(v.context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            gpsStatus = "위치 권한을 켜주세요"
            summarySyncStatus = "워치 설정에서 정확한 위치를 허용해주세요"
            render(v)
            return
        }
        runEndUnsubscribe?.invoke()
        runEndUnsubscribe = null
        finishRequested = false
        ignoreExerciseUpdatesUntilStart = false
        pendingTransferId = null
        summarySyncStatus = ""
        gpsStatus = "경로 자동 기록"
        gpsStatusColor = Color.parseColor("#7C8499")
        runState.start()
        WearExerciseService.startRun(v.context)
        render(v)
        scheduleRunTick(v)
    }

    private fun pauseRun(v: View) {
        runState.pause()
        WearExerciseService.pauseRun(v.context)
        clearRunTick(v)
        render(v)
    }

    private fun resumeRun(v: View) {
        runState.resume()
        WearExerciseService.resumeRun(v.context)
        render(v)
        scheduleRunTick(v)
    }

    private fun finishRun(v: View) {
        if (finishRequested) return
        finishRequested = true
        runState.finish()
        clearRunTick(v)
        summarySyncStatus = "러닝 저장 중"
        render(v)
        waitForFinalExerciseSnapshot(v)
        WearExerciseService.endRun(v.context)
    }

    private fun waitForFinalExerciseSnapshot(v: View) {
        runEndUnsubscribe?.invoke()
        lateinit var unsubscribe: () -> Unit
        unsubscribe = WearExerciseSessionStore.addListener { snapshot ->
            if (snapshot.status !in setOf(
                    WearExerciseSessionStatus.ENDED,
                    WearExerciseSessionStatus.ERROR,
                )
            ) {
                return@addListener
            }
            handler.post {
                if (runEndUnsubscribe == null) return@post
                runEndUnsubscribe?.invoke()
                runEndUnsubscribe = null
                updateRunLiveMetrics(snapshot)
                if (snapshot.status == WearExerciseSessionStatus.ENDED) {
                    syncRunSummary(v)
                } else {
                    summarySyncStatus = "저장 상태를 확인해 주세요"
                    render(v)
                }
            }
        }
        runEndUnsubscribe = { unsubscribe() }
    }

    private fun render(v: View) {
        val snapshot = runState.snapshot()
        // Keep the display awake only while an active run is visible. The
        // foreground exercise service keeps tracking alive when the watch
        // enters ambient/background, while this gate avoids draining the
        // battery during setup, pause, or the summary screen.
        v.keepScreenOn = hostInteractive && snapshot.screen == WearRunUiScreen.ACTIVE
        v.findViewById<View>(R.id.runReadyScreen)?.visibility =
            if (snapshot.screen == WearRunUiScreen.READY) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.runActiveScreen)?.visibility =
            if (snapshot.screen == WearRunUiScreen.ACTIVE) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.runPausedScreen)?.visibility =
            if (snapshot.screen == WearRunUiScreen.PAUSED) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.runSummaryScreen)?.visibility =
            if (snapshot.screen == WearRunUiScreen.SUMMARY) View.VISIBLE else View.GONE

        v.findViewById<TextView>(R.id.runActiveElapsed)?.text = snapshot.durationText
        v.findViewById<TextView>(R.id.runActiveDistance)?.text = snapshot.distanceText
        v.findViewById<TextView>(R.id.runActivePace)?.text = snapshot.paceText
        v.findViewById<TextView>(R.id.runActiveHeartRate)?.text = snapshot.heartRateText
        v.findViewById<TextView>(R.id.runReadyGpsStatus)?.text = gpsStatus
        v.findViewById<TextView>(R.id.runReadyGpsStatus)?.setTextColor(gpsStatusColor)
        v.findViewById<TextView>(R.id.runActiveGpsStatus)?.text = gpsStatus
        v.findViewById<TextView>(R.id.runActiveGpsStatus)?.setTextColor(gpsStatusColor)
        v.findViewById<TextView>(R.id.runMetricPageIndicator)?.text = metricPageLabel()
        initializeMetricPager(v)?.submitSnapshot(snapshot, metricPagePosition)

        v.findViewById<TextView>(R.id.runPausedElapsed)?.text = snapshot.durationText

        v.findViewById<TextView>(R.id.runSummaryDuration)?.text = snapshot.durationText
        v.findViewById<TextView>(R.id.runSummaryDistance)?.text = snapshot.distanceSummaryText
        v.findViewById<TextView>(R.id.runSummaryPace)?.text = snapshot.paceText
        v.findViewById<TextView>(R.id.runSummaryHeartRate)?.text = snapshot.heartRateText
        v.findViewById<TextView>(R.id.runSummarySyncStatus)?.text = summarySyncStatus
        v.findViewById<TextView>(R.id.runSummaryGpsStatus)?.text = gpsStatus
    }

    private fun syncRunSummary(v: View) {
        summarySyncStatus = "휴대폰에 저장 중"
        render(v)
        val session = buildWearRunSessionForSummary(
            exerciseSnapshot = WearExerciseSessionStore.current(),
            uiSnapshot = runState.snapshot(),
            nowWallClockMs = System.currentTimeMillis(),
            dateKeyFor = ::dateKeyFor,
        )
        session.toPayload()
            .onSuccess { payload ->
                val transferId = WearWorkoutDataLayer.sendRunComplete(v.context, payload) { result ->
                    handler.post {
                        if (result.transferId != pendingTransferId) return@post
                        if (result.success && WearWorkoutDataLayer.wasSaved(v.context, result.transferId)) {
                            showSavedAck(v, result.transferId)
                            return@post
                        }
                        summarySyncStatus = result.message
                        render(v)
                    }
                }
                pendingTransferId = transferId
                if (WearWorkoutDataLayer.wasSaved(v.context, transferId)) {
                    showSavedAck(v, transferId)
                }
            }
            .onFailure { error ->
                Log.w(TAG, "Wear run payload build failed", error)
                summarySyncStatus = "러닝을 저장하지 못했어요"
                render(v)
            }
    }

    private fun initializeMetricPager(v: View): WearRunMetricPagerAdapter? {
        val pager = v.findViewById<ViewPager2>(R.id.runMetricPager) ?: return null
        val adapter = metricPagerAdapter ?: WearRunMetricPagerAdapter().also { metricPagerAdapter = it }
        if (pager.adapter !== adapter) {
            pager.adapter = adapter
            pager.offscreenPageLimit = 1
        }
        if (metricPager !== pager) {
            metricPageCallback?.let { callback -> metricPager?.unregisterOnPageChangeCallback(callback) }
            metricPager = pager
            metricPagePosition = pager.currentItem.coerceIn(0, WearRunMetricPagerAdapter.PAGE_COUNT - 1)
            metricPageCallback = object : ViewPager2.OnPageChangeCallback() {
                override fun onPageSelected(position: Int) {
                    metricPagePosition = position.coerceIn(0, WearRunMetricPagerAdapter.PAGE_COUNT - 1)
                    adapter.refreshPage(metricPagePosition)
                    v.findViewById<TextView>(R.id.runMetricPageIndicator)?.text = metricPageLabel()
                }
            }.also { callback -> pager.registerOnPageChangeCallback(callback) }
        }
        return adapter
    }

    private fun metricPageLabel(): String {
        val labels = listOf("요약", "페이스", "심박", "심박 존", "지도")
        val position = metricPagePosition.coerceIn(0, labels.lastIndex)
        val dots = labels.indices.joinToString(" ") { index -> if (index == position) "●" else "○" }
        return "${labels[position]}  $dots"
    }

    private fun updateGpsPresentation(snapshot: WearExerciseSessionSnapshot) {
        val message = snapshot.message.orEmpty()
        val lastPoint = snapshot.routePoints.lastOrNull()
        when {
            snapshot.status == WearExerciseSessionStatus.ENDED && snapshot.routePoints.size >= 2 -> {
                gpsStatus = "경로 저장됨"
                gpsStatusColor = Color.parseColor("#D7FF3F")
            }
            snapshot.status == WearExerciseSessionStatus.ENDED && lastPoint != null -> {
                gpsStatus = "위치 저장됨"
                gpsStatusColor = Color.parseColor("#D7FF3F")
            }
            snapshot.status == WearExerciseSessionStatus.ENDED -> {
                gpsStatus = "경로 없이 저장됨"
                gpsStatusColor = Color.parseColor("#81877D")
            }
            message.contains("location permission", ignoreCase = true) -> {
                gpsStatus = "위치 권한을 켜주세요"
                gpsStatusColor = Color.parseColor("#FF6B6B")
            }
            message.contains("provider unavailable", ignoreCase = true) -> {
                gpsStatus = "위치 서비스를 켜주세요"
                gpsStatusColor = Color.parseColor("#FFB35A")
            }
            message.contains("GPS weak", ignoreCase = true) -> {
                gpsStatus = if (snapshot.status == WearExerciseSessionStatus.IDLE) {
                    "바로 시작할 수 있어요"
                } else {
                    "야외에서 더 정확해져요"
                }
                gpsStatusColor = Color.parseColor("#FFB35A")
            }
            message.contains("GPS searching", ignoreCase = true) -> {
                gpsStatus = if (snapshot.status == WearExerciseSessionStatus.IDLE) {
                    "바로 시작할 수 있어요"
                } else {
                    "경로 자동 기록"
                }
                gpsStatusColor = Color.parseColor("#81877D")
            }
            message.contains("GPS assisted", ignoreCase = true) -> {
                gpsStatus = "준비 완료"
                gpsStatusColor = Color.parseColor("#D7FF3F")
            }
            message.contains("GPS direct", ignoreCase = true) && snapshot.status == WearExerciseSessionStatus.IDLE -> {
                gpsStatus = "준비 완료"
                gpsStatusColor = Color.parseColor("#D7FF3F")
            }
            snapshot.routePoints.size >= 2 -> {
                gpsStatus = "경로 기록 중"
                gpsStatusColor = Color.parseColor("#D7FF3F")
            }
            lastPoint != null -> {
                gpsStatus = "경로 기록 시작됨"
                gpsStatusColor = Color.parseColor("#D7FF3F")
            }
            snapshot.status in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            ) -> {
                gpsStatus = "경로 자동 기록"
                gpsStatusColor = Color.parseColor("#81877D")
            }
        }
    }

    private fun updateRunLiveMetrics(snapshot: WearExerciseSessionSnapshot) {
        runState.updateLiveMetrics(
            distanceKm = snapshot.distanceMeters / 1_000.0,
            distanceSamples = snapshot.distanceSamples,
            heartRateSamples = snapshot.heartRateSamples,
            routePoints = snapshot.routePoints,
        )
    }

    private fun scheduleRunTick(v: View) {
        if (!hostInteractive || runState.screen != WearRunUiScreen.ACTIVE || !v.isAttachedToWindow) return
        clearRunTick(v)
        val tick = object : Runnable {
            override fun run() {
                if (!hostInteractive || runState.screen != WearRunUiScreen.ACTIVE || !v.isAttachedToWindow) return
                render(v)
                handler.postDelayed(this, 1_000L)
            }
        }
        v.setTag(R.id.wear_run_tick_runnable, tick)
        handler.postDelayed(tick, 1_000L)
    }

    private fun clearRunTick(v: View) {
        val tick = v.getTag(R.id.wear_run_tick_runnable) as? Runnable ?: return
        handler.removeCallbacks(tick)
        v.setTag(R.id.wear_run_tick_runnable, null)
    }

    private fun dateKeyFor(epochMs: Long): String {
        return Instant.ofEpochMilli(epochMs)
            .atZone(ZoneId.systemDefault())
            .toLocalDate()
            .format(DateTimeFormatter.ISO_LOCAL_DATE)
    }
}

internal fun buildWearRunSessionForSummary(
    exerciseSnapshot: WearExerciseSessionSnapshot,
    uiSnapshot: WearRunUiSnapshot,
    nowWallClockMs: Long,
    dateKeyFor: (Long) -> String,
): WearRunSession {
    val uiDurationMs = uiSnapshot.durationMs.coerceAtLeast(1_000L)
    val startedAt = if (exerciseSnapshot.startedAtWallClockMs > 0L) {
        exerciseSnapshot.startedAtWallClockMs
    } else {
        (nowWallClockMs - uiDurationMs).coerceAtLeast(0L)
    }
    val durationMs = maxOf(
        exerciseSnapshot.activeDurationMs,
        uiSnapshot.durationMs,
        1_000L,
    )
    val latestSampleAt = maxOf(
        exerciseSnapshot.routePoints.maxOfOrNull { it.timestampMs } ?: startedAt,
        exerciseSnapshot.heartRateSamples.maxOfOrNull { it.timestampMs } ?: startedAt,
        exerciseSnapshot.distanceSamples.maxOfOrNull { it.timestampMs } ?: startedAt,
    )
    val endedAt = maxOf(startedAt + durationMs, latestSampleAt, nowWallClockMs)
    return WearRunSession(
        dateKey = dateKeyFor(startedAt),
        startedAtMs = startedAt,
        endedAtMs = endedAt,
        activeDurationMs = durationMs,
        distanceMeters = exerciseSnapshot.distanceMeters,
        heartRateSamples = exerciseSnapshot.heartRateSamples,
        routePoints = exerciseSnapshot.routePoints,
    )
}
