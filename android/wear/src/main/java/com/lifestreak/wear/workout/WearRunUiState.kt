package com.lifestreak.wear.workout

enum class WearRunUiScreen {
    READY,
    ACTIVE,
    PAUSED,
    SUMMARY,
}

class WearRunUiState(
    private val nowMs: () -> Long,
) {
    var screen: WearRunUiScreen = WearRunUiScreen.READY
        private set

    private var startedAtMs = 0L
    private var accumulatedMs = 0L
    private var finishedMs = 0L
    private var distanceKm = 0.0
    private var heartRateBpm: Int? = null
    private var distanceSamples: List<WearDistanceSample> = emptyList()
    private var heartRateSamples: List<HeartRateSample> = emptyList()
    private var routePoints: List<WearRoutePoint> = emptyList()

    fun start() {
        screen = WearRunUiScreen.ACTIVE
        startedAtMs = nowMs()
        accumulatedMs = 0L
        finishedMs = 0L
        distanceKm = 0.0
        heartRateBpm = null
        distanceSamples = emptyList()
        heartRateSamples = emptyList()
        routePoints = emptyList()
    }

    fun pause() {
        if (screen != WearRunUiScreen.ACTIVE) return
        accumulatedMs += nowMs() - startedAtMs
        screen = WearRunUiScreen.PAUSED
    }

    fun resume() {
        if (screen != WearRunUiScreen.PAUSED) return
        startedAtMs = nowMs()
        screen = WearRunUiScreen.ACTIVE
    }

    fun finish() {
        finishedMs = currentDurationMs()
        accumulatedMs = finishedMs
        screen = WearRunUiScreen.SUMMARY
    }

    fun reset() {
        screen = WearRunUiScreen.READY
        startedAtMs = 0L
        accumulatedMs = 0L
        finishedMs = 0L
        distanceKm = 0.0
        heartRateBpm = null
        distanceSamples = emptyList()
        heartRateSamples = emptyList()
        routePoints = emptyList()
    }

    fun restoreFromSession(snapshot: WearExerciseSessionSnapshot) {
        when (snapshot.status) {
            WearExerciseSessionStatus.STARTING,
            WearExerciseSessionStatus.ACTIVE,
            WearExerciseSessionStatus.FALLBACK -> {
                screen = WearRunUiScreen.ACTIVE
                startedAtMs = nowMs()
                accumulatedMs = snapshot.activeDurationMs.coerceAtLeast(0L)
                finishedMs = 0L
            }
            WearExerciseSessionStatus.PAUSED -> {
                screen = WearRunUiScreen.PAUSED
                startedAtMs = nowMs()
                accumulatedMs = snapshot.activeDurationMs.coerceAtLeast(0L)
                finishedMs = 0L
            }
            WearExerciseSessionStatus.ENDED -> {
                screen = WearRunUiScreen.SUMMARY
                startedAtMs = nowMs()
                accumulatedMs = snapshot.activeDurationMs.coerceAtLeast(0L)
                finishedMs = accumulatedMs
            }
            WearExerciseSessionStatus.IDLE,
            WearExerciseSessionStatus.ERROR -> return
        }
        updateLiveMetrics(
            distanceKm = snapshot.distanceMeters / 1_000.0,
            distanceSamples = snapshot.distanceSamples,
            heartRateSamples = snapshot.heartRateSamples,
            routePoints = snapshot.routePoints,
        )
    }

    fun updateMetrics(distanceKm: Double = this.distanceKm, heartRateBpm: Int? = this.heartRateBpm) {
        if (distanceKm.isFinite() && distanceKm >= 0.0) {
            this.distanceKm = distanceKm
        }
        this.heartRateBpm = heartRateBpm?.takeIf { it in 30..240 }
    }

    fun updateLiveMetrics(
        distanceKm: Double = this.distanceKm,
        distanceSamples: List<WearDistanceSample> = this.distanceSamples,
        heartRateSamples: List<HeartRateSample> = this.heartRateSamples,
        routePoints: List<WearRoutePoint> = this.routePoints,
    ) {
        val validHeartRateSamples = validHeartRateSamples(heartRateSamples)
        updateMetrics(
            distanceKm = distanceKm,
            heartRateBpm = validHeartRateSamples.lastOrNull()?.bpm,
        )
        this.distanceSamples = distanceSamples
        this.heartRateSamples = validHeartRateSamples
        this.routePoints = routePoints
    }

    fun snapshot(): WearRunUiSnapshot {
        return WearRunUiSnapshot(
            screen = screen,
            durationMs = currentDurationMs(),
            distanceKm = distanceKm,
            heartRateBpm = heartRateBpm,
            paceTrend = buildPaceTrend(distanceSamples),
            heartRateTrend = heartRateSamples,
            routeProjection = projectRoute(routePoints),
            // W5c current-pace slice: pure function of the same distanceSamples buildPaceTrend
            // above consumes, plus "now" so a stationary runner (no recent samples) reads null.
            currentPaceSecPerKm = currentPaceSecPerKm(distanceSamples, nowMs()),
        )
    }

    private fun currentDurationMs(): Long =
        when (screen) {
            WearRunUiScreen.ACTIVE -> accumulatedMs + (nowMs() - startedAtMs)
            WearRunUiScreen.PAUSED -> accumulatedMs
            WearRunUiScreen.SUMMARY -> finishedMs
            WearRunUiScreen.READY -> 0L
        }.coerceAtLeast(0L)
}
