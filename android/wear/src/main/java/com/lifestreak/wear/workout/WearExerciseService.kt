package com.lifestreak.wear.workout

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.HeartRateAccuracy
import androidx.health.services.client.data.LocationAccuracy
import androidx.health.services.client.data.WarmUpConfig
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.math.roundToInt

class WearExerciseService : Service() {
    private lateinit var exerciseClient: ExerciseClient
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private val healthCallbackExecutor by lazy { ContextCompat.getMainExecutor(this) }
    private var exerciseCallback: ExerciseUpdateCallback? = null
    private var accumulator: WearExerciseMetricAccumulator? = null
    private var exerciseStarted = false
    private var endRequested = false
    private var wallClockOffsetMs = 0L
    private val activeDurationTracker = WearExerciseActiveDurationTracker()
    private var lastDirectLocationElapsedRealtimeMs = 0L
    private var lastDirectGpsAccuracyM: Double? = null
    private var lastDirectGpsFixElapsedRealtimeMs = 0L
    private var lastGpsStatusPublishedElapsedRealtimeMs = 0L
    private var gpsStatusMessage = GPS_STATUS_SEARCHING
    private var isPreparing = false
    private var healthPreparationInFlight = false
    private var healthPreparationCancelInFlight = false
    private var healthPreparationGeneration = 0
    private var debugRouteReplayActive = false
    private var preparedExerciseConfig: ExerciseConfig? = null
    private var pendingExerciseStart: WearExerciseMetricAccumulator? = null
    private var assistedLocationCallback: LocationCallback? = null
    private var fusedRouteLocationCallback: LocationCallback? = null
    private var directLocationManager: LocationManager? = null
    private var directLocationListener: LocationListener? = null
    private var directHeartRateManager: SensorManager? = null
    private var directHeartRateListener: SensorEventListener? = null
    private var healthLocationManaged = false
    private var healthHeartRateManaged = false
    private var lastLiveSnapshotPublishedElapsedRealtimeMs = 0L
    private var persistenceUnsubscribe: (() -> Unit)? = null
    private var pendingPersistenceSnapshot: WearExerciseSessionSnapshot? = null
    private var persistenceWriteScheduled = false
    private var lastPersistedStatus: WearExerciseSessionStatus? = null
    private val checkpointHandler by lazy { Handler(Looper.getMainLooper()) }
    private val checkpointRunnable = object : Runnable {
        override fun run() {
            checkpointActiveDuration()
        }
    }
    private val preparationTimeoutRunnable = Runnable {
        if (isPreparing) handleCancelPreparation()
    }
    private val persistenceRunnable = Runnable {
        persistenceWriteScheduled = false
        flushPendingPersistence()
    }

    override fun onCreate() {
        super.onCreate()
        exerciseClient = HealthServices.getClient(this).exerciseClient
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        directLocationManager = getSystemService(LocationManager::class.java)
        directHeartRateManager = getSystemService(SensorManager::class.java)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PREPARE_RUN -> handlePrepareRun()
            ACTION_CANCEL_PREPARATION -> handleCancelPreparation()
            ACTION_START_RUN -> handleStartRun()
            ACTION_RESTORE_RUN -> handleRestoreRun()
            ACTION_PAUSE_RUN -> handlePauseRun()
            ACTION_RESUME_RUN -> handleResumeRun()
            ACTION_END_RUN -> handleEndRun()
            ACTION_DEBUG_ROUTE_POINT -> handleDebugRoutePoint(intent)
            else -> handleRestoreRun()
        }
        // addListener immediately emits the in-memory snapshot. Restore first so a
        // fresh service process cannot overwrite a saved workout with IDLE.
        ensurePersistenceListener()
        return START_STICKY
    }

    override fun onDestroy() {
        flushPendingPersistence()
        checkpointHandler.removeCallbacks(persistenceRunnable)
        persistenceUnsubscribe?.invoke()
        persistenceUnsubscribe = null
        clearExerciseCallback()
        stopAssistedLocationUpdates()
        stopFusedRouteLocationUpdates()
        stopDirectLocationUpdates()
        stopDirectHeartRateUpdates()
        stopActiveDurationCheckpoints()
        checkpointHandler.removeCallbacks(preparationTimeoutRunnable)
        super.onDestroy()
    }

    private fun handlePrepareRun() {
        if (isPreparing) return
        if (!hasLocationPermission() || WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) {
            stopSelf()
            return
        }
        isPreparing = true
        gpsStatusMessage = GPS_STATUS_SEARCHING
        startForegroundWithHealthType(buildNotification("러닝 준비 중"))
        startAssistedLocationUpdates()
        startDirectLocationUpdates()
        publishPreparationStatus(GPS_STATUS_SEARCHING)
        checkpointHandler.removeCallbacks(preparationTimeoutRunnable)
        checkpointHandler.postDelayed(preparationTimeoutRunnable, PREPARATION_TIMEOUT_MS)
        if (hasActivityRecognitionPermission()) prepareHealthExercise()
    }

    private fun handleCancelPreparation() {
        if (!isPreparing || WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) return
        isPreparing = false
        checkpointHandler.removeCallbacks(preparationTimeoutRunnable)
        pendingExerciseStart = null
        preparedExerciseConfig = null
        healthPreparationInFlight = false
        healthPreparationGeneration += 1
        stopAssistedLocationUpdates()
        stopDirectLocationUpdates()
        if (hasActivityRecognitionPermission()) {
            healthPreparationCancelInFlight = true
            val endFuture = exerciseClient.endExerciseAsync()
            endFuture.addListener(
                {
                    runCatching { endFuture.get() }
                    healthPreparationCancelInFlight = false
                    val pending = pendingExerciseStart
                    pendingExerciseStart = null
                    if (pending != null) {
                        startHealthExercise(pending)
                    } else {
                        finishService()
                    }
                },
                healthCallbackExecutor,
            )
        } else {
            finishService()
        }
    }

    private fun handleStartRun() {
        if (!hasLocationPermission()) {
            WearExerciseSessionPersistence.clear(this)
            WearExerciseSessionStore.markError("location permission missing")
            stopSelf()
            return
        }
        val startedAtWallClockMs = System.currentTimeMillis()
        val startedAtElapsedRealtimeMs = SystemClock.elapsedRealtime()
        wallClockOffsetMs = startedAtWallClockMs - startedAtElapsedRealtimeMs
        activeDurationTracker.start(startedAtElapsedRealtimeMs)
        isPreparing = false
        checkpointHandler.removeCallbacks(preparationTimeoutRunnable)
        stopAssistedLocationUpdates()
        lastDirectLocationElapsedRealtimeMs = 0L
        lastGpsStatusPublishedElapsedRealtimeMs = 0L
        lastLiveSnapshotPublishedElapsedRealtimeMs = 0L
        healthLocationManaged = false
        healthHeartRateManaged = false
        if (lastDirectGpsAccuracyM == null) gpsStatusMessage = GPS_STATUS_SEARCHING
        val nextAccumulator = WearExerciseMetricAccumulator(
            startedAtWallClockMs = startedAtWallClockMs,
            startedAtElapsedRealtimeMs = startedAtElapsedRealtimeMs,
        )
        accumulator = nextAccumulator
        debugRouteReplayActive = false
        exerciseStarted = false
        endRequested = false
        WearExerciseSessionStore.resetForStart(startedAtWallClockMs)

        startForegroundWithHealthType(buildNotification())
        startDirectLocationUpdates()
        startDirectHeartRateUpdates()
        startActiveDurationCheckpoints()
        if (!hasActivityRecognitionPermission()) {
            WearExerciseSessionStore.publishFromAccumulator(
                status = WearExerciseSessionStatus.ACTIVE,
                accumulator = nextAccumulator,
                message = "$gpsStatusMessage · activity permission missing",
            )
            return
        }
        registerExerciseCallback()
        if (healthPreparationInFlight || healthPreparationCancelInFlight) {
            pendingExerciseStart = nextAccumulator
        } else {
            val preparedConfig = preparedExerciseConfig
            preparedExerciseConfig = null
            if (preparedConfig != null) {
                startConfiguredExercise(preparedConfig, nextAccumulator)
            } else {
                startHealthExercise(nextAccumulator)
            }
        }
    }

    private fun handleDebugRoutePoint(intent: Intent) {
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0) return
        if (endRequested) return
        if (WearExerciseSessionStore.current().status !in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) return
        val lat = intent.getStringExtra(EXTRA_DEBUG_LAT)?.toDoubleOrNull() ?: return
        val lng = intent.getStringExtra(EXTRA_DEBUG_LNG)?.toDoubleOrNull() ?: return
        val activeDurationMs = intent.getStringExtra(EXTRA_DEBUG_ACTIVE_DURATION_MS)?.toLongOrNull()
            ?.coerceAtLeast(0L)
        val sessionStartedAtMs = WearExerciseSessionStore.current().startedAtWallClockMs
        val timestampMs = if (sessionStartedAtMs > 0L && activeDurationMs != null) {
            sessionStartedAtMs + activeDurationMs
        } else {
            intent.getStringExtra(EXTRA_DEBUG_TIMESTAMP_MS)?.toLongOrNull()
                ?: System.currentTimeMillis()
        }
        val accuracy = intent.getStringExtra(EXTRA_DEBUG_ACCURACY)?.toDoubleOrNull()
        val altitude = intent.getStringExtra(EXTRA_DEBUG_ALTITUDE)?.toDoubleOrNull()
        val bearing = intent.getStringExtra(EXTRA_DEBUG_BEARING)?.toDoubleOrNull()
        val elapsedRealtimeMs = SystemClock.elapsedRealtime()
        val currentAccumulator = if (debugRouteReplayActive) {
            accumulator ?: return
        } else {
            debugRouteReplayActive = true
            stopDirectLocationUpdates()
            stopFusedRouteLocationUpdates()
            stopDirectHeartRateUpdates()
            WearExerciseMetricAccumulator(
                startedAtWallClockMs = sessionStartedAtMs,
                startedAtElapsedRealtimeMs = (elapsedRealtimeMs - (activeDurationMs ?: 0L)).coerceAtLeast(0L),
            ).also { replayAccumulator -> accumulator = replayAccumulator }
        }
        currentAccumulator.applyMetricUpdate(
            elapsedRealtimeMs = elapsedRealtimeMs,
            activeDurationMs = activeDurationMs,
            routePoint = WearRoutePoint(
                timestampMs = timestampMs,
                lat = lat,
                lng = lng,
                altitude = altitude,
                bearing = bearing,
                accuracy = accuracy,
                segmentId = 0,
            ),
        )
        lastDirectGpsAccuracyM = accuracy
        lastDirectGpsFixElapsedRealtimeMs = elapsedRealtimeMs
        gpsStatusMessage = GPS_STATUS_DIRECT
        WearExerciseSessionStore.publishFromAccumulator(
            status = WearExerciseSessionStatus.ACTIVE,
            accumulator = currentAccumulator,
            message = "GPS direct · debug route",
        )
    }

    private fun prepareHealthExercise() {
        if (healthPreparationInFlight || preparedExerciseConfig != null) return
        healthPreparationInFlight = true
        val generation = ++healthPreparationGeneration
        val capabilitiesFuture = exerciseClient.getCapabilitiesAsync()
        capabilitiesFuture.addListener(
            {
                if (generation != healthPreparationGeneration) return@addListener
                if (!isPreparing && pendingExerciseStart == null) {
                    healthPreparationInFlight = false
                    return@addListener
                }
                val dataTypes = try {
                    val runningCapabilities = capabilitiesFuture.get()
                        .getExerciseTypeCapabilities(ExerciseType.RUNNING)
                    requestedDataTypes().intersect(runningCapabilities.supportedDataTypes)
                } catch (_: Exception) {
                    requestedDataTypes()
                }
                val config = buildExerciseConfig(dataTypes)
                preparedExerciseConfig = config
                val warmUpTypes = warmUpDataTypes(config.dataTypes)
                if (warmUpTypes.isEmpty()) {
                    completeHealthPreparation(generation)
                    return@addListener
                }
                val warmUpFuture = exerciseClient.prepareExerciseAsync(
                    WarmUpConfig(ExerciseType.RUNNING, warmUpTypes),
                )
                warmUpFuture.addListener(
                    {
                        runCatching { warmUpFuture.get() }
                        completeHealthPreparation(generation)
                    },
                    healthCallbackExecutor,
                )
            },
            healthCallbackExecutor,
        )
    }

    private fun completeHealthPreparation(generation: Int) {
        if (generation != healthPreparationGeneration) return
        healthPreparationInFlight = false
        if (healthPreparationCancelInFlight) return
        val pending = pendingExerciseStart ?: return
        pendingExerciseStart = null
        val config = preparedExerciseConfig
        preparedExerciseConfig = null
        if (config != null) startConfiguredExercise(config, pending) else startHealthExercise(pending)
    }

    private fun buildExerciseConfig(dataTypes: Set<DataType<*, *>>): ExerciseConfig {
        return ExerciseConfig(
            exerciseType = ExerciseType.RUNNING,
            dataTypes = dataTypes,
            isAutoPauseAndResumeEnabled = false,
            isGpsEnabled = hasLocationPermission(),
            exerciseGoals = emptyList(),
        )
    }

    private fun handleRestoreRun() {
        val restored = restorePersistedSessionIfMissing(markRestartGap = true) ?: run {
            stopSelf()
            return
        }
        if (!hasLocationPermission() && restored.status in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) {
            publishEndedSnapshot("location permission missing")
            finishService()
            return
        }
        when (restored.status) {
            WearExerciseSessionStatus.STARTING,
            WearExerciseSessionStatus.ACTIVE,
            WearExerciseSessionStatus.FALLBACK,
            -> {
                startForegroundWithHealthType(buildNotification())
                startDirectLocationUpdates()
                startDirectHeartRateUpdates()
                startActiveDurationCheckpoints()
                if (hasActivityRecognitionPermission()) {
                    registerExerciseCallback()
                    exerciseStarted = true
                }
            }
            WearExerciseSessionStatus.PAUSED -> {
                startForegroundWithHealthType(buildNotification("러닝 기록 일시정지"))
                stopFusedRouteLocationUpdates()
                stopDirectLocationUpdates()
                stopDirectHeartRateUpdates()
                stopActiveDurationCheckpoints()
                if (hasActivityRecognitionPermission()) {
                    registerExerciseCallback()
                    exerciseStarted = true
                }
            }
            WearExerciseSessionStatus.ENDED -> stopSelf()
            WearExerciseSessionStatus.IDLE,
            WearExerciseSessionStatus.ERROR,
            -> stopSelf()
        }
    }

    private fun startHealthExercise(nextAccumulator: WearExerciseMetricAccumulator) {
        val capabilitiesFuture = exerciseClient.getCapabilitiesAsync()
        capabilitiesFuture.addListener(
            {
                val dataTypes = try {
                    val runningCapabilities = capabilitiesFuture.get()
                        .getExerciseTypeCapabilities(ExerciseType.RUNNING)
                    requestedDataTypes().intersect(runningCapabilities.supportedDataTypes)
                } catch (_: Exception) {
                    requestedDataTypes()
                }

                if (dataTypes.isEmpty()) {
                    enableDirectSensorFallbacks()
                    WearExerciseSessionStore.markFallback("RUNNING metrics unsupported")
                    return@addListener
                }

                val config = buildExerciseConfig(dataTypes)
                prepareThenStartExercise(config, nextAccumulator)
            },
            healthCallbackExecutor,
        )
    }

    private fun prepareThenStartExercise(
        config: ExerciseConfig,
        nextAccumulator: WearExerciseMetricAccumulator,
    ) {
        val warmUpTypes = warmUpDataTypes(config.dataTypes)
        if (warmUpTypes.isEmpty()) {
            startConfiguredExercise(config, nextAccumulator)
            return
        }
        val warmUpFuture = exerciseClient.prepareExerciseAsync(
            WarmUpConfig(ExerciseType.RUNNING, warmUpTypes),
        )
        warmUpFuture.addListener(
            {
                try {
                    warmUpFuture.get()
                } catch (_: Exception) {
                } finally {
                    startConfiguredExercise(config, nextAccumulator)
                }
            },
            healthCallbackExecutor,
        )
    }

    private fun startConfiguredExercise(
        config: ExerciseConfig,
        nextAccumulator: WearExerciseMetricAccumulator,
    ) {
        val startFuture = exerciseClient.startExerciseAsync(config)
        startFuture.addListener(
            {
                try {
                    startFuture.get()
                    exerciseStarted = true
                    applyHealthSensorOwnership(config.dataTypes)
                    WearExerciseSessionStore.publishFromAccumulator(
                        status = WearExerciseSessionStatus.ACTIVE,
                        accumulator = nextAccumulator,
                        message = locationStatusMessage(),
                    )
                } catch (_: Exception) {
                    exerciseStarted = false
                    enableDirectSensorFallbacks()
                    WearExerciseSessionStore.publishFromAccumulator(
                        status = WearExerciseSessionStatus.ACTIVE,
                        accumulator = nextAccumulator,
                        message = "GPS direct · Health Services unavailable",
                    )
                }
            },
            healthCallbackExecutor,
        )
    }

    private fun applyHealthSensorOwnership(dataTypes: Set<DataType<*, *>>) {
        if (!dataTypes.contains(DataType.LOCATION)) {
            healthLocationManaged = false
            startDirectLocationUpdates()
        }
        if (!dataTypes.contains(DataType.HEART_RATE_BPM)) {
            healthHeartRateManaged = false
            startDirectHeartRateUpdates()
        }
    }

    private fun startMissingHealthSensorFallbacks() {
        if (!healthLocationManaged) startDirectLocationUpdates()
        if (!healthHeartRateManaged) startDirectHeartRateUpdates()
    }

    private fun enableDirectSensorFallbacks() {
        healthLocationManaged = false
        healthHeartRateManaged = false
        startMissingHealthSensorFallbacks()
    }

    private fun handlePauseRun() {
        restorePersistedSessionIfMissing(markRestartGap = true)
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        accumulator?.let { currentAccumulator ->
            currentAccumulator.markRouteGap("pause")
            currentAccumulator.applyMetricUpdate(
                elapsedRealtimeMs = nowElapsedRealtimeMs,
                activeDurationMs = activeDurationTracker.pause(nowElapsedRealtimeMs),
            )
            WearExerciseSessionStore.publishFromAccumulator(
                status = WearExerciseSessionStatus.PAUSED,
                accumulator = currentAccumulator,
            )
        } ?: WearExerciseSessionStore.markPaused()
        stopDirectLocationUpdates()
        stopFusedRouteLocationUpdates()
        stopDirectHeartRateUpdates()
        stopActiveDurationCheckpoints()
        if (!exerciseStarted) return
        val pauseFuture = exerciseClient.pauseExerciseAsync()
        pauseFuture.addListener(
            {
                try {
                    pauseFuture.get()
                } catch (error: Exception) {
                    WearExerciseSessionStore.markPaused(
                        "GPS direct · Health Services pause failed: ${error.message ?: error.javaClass.simpleName}",
                    )
                }
            },
            healthCallbackExecutor,
        )
    }

    private fun handleResumeRun() {
        restorePersistedSessionIfMissing(markRestartGap = true)
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        accumulator?.let {
            it.applyMetricUpdate(
                elapsedRealtimeMs = nowElapsedRealtimeMs,
                activeDurationMs = activeDurationTracker.resume(nowElapsedRealtimeMs),
            )
            WearExerciseSessionStore.publishFromAccumulator(
                status = WearExerciseSessionStatus.ACTIVE,
                accumulator = it,
            )
        }
        startForegroundWithHealthType(buildNotification())
        startMissingHealthSensorFallbacks()
        startActiveDurationCheckpoints()
        if (!exerciseStarted) return
        val resumeFuture = exerciseClient.resumeExerciseAsync()
        resumeFuture.addListener(
            {
                try {
                    resumeFuture.get()
                } catch (error: Exception) {
                    enableDirectSensorFallbacks()
                    accumulator?.let {
                        WearExerciseSessionStore.publishFromAccumulator(
                            status = WearExerciseSessionStatus.ACTIVE,
                            accumulator = it,
                            message = "GPS direct · Health Services resume failed: ${error.message ?: error.javaClass.simpleName}",
                        )
                    }
                }
            },
            healthCallbackExecutor,
        )
    }

    private fun handleEndRun() {
        restorePersistedSessionIfMissing(markRestartGap = true)
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        accumulator?.applyMetricUpdate(
            elapsedRealtimeMs = nowElapsedRealtimeMs,
            activeDurationMs = activeDurationTracker.pause(nowElapsedRealtimeMs),
        )
        stopActiveDurationCheckpoints()
        endRequested = true
        stopDirectLocationUpdates()
        stopFusedRouteLocationUpdates()
        stopDirectHeartRateUpdates()
        if (exerciseStarted) {
            val endFuture = exerciseClient.endExerciseAsync()
            endFuture.addListener(
                {
                    try {
                        endFuture.get()
                        WearExerciseEndPolicy.afterEndFuture(success = true)
                    } catch (error: Exception) {
                        WearExerciseEndPolicy.afterEndFuture(success = false)
                        publishEndFailure(error)
                        finishService()
                    }
                },
                healthCallbackExecutor,
            )
        } else {
            publishEndedSnapshot()
            finishService()
        }
    }

    private fun publishEndFailure(error: Exception) {
        publishEndedSnapshot(
            "GPS direct · Health Services end failed: ${error.message ?: error.javaClass.simpleName}",
        )
    }

    private fun publishEndedSnapshot(message: String? = null) {
        val currentAccumulator = accumulator
        if (currentAccumulator == null) {
            WearExerciseSessionStore.markEnded(message)
            return
        }
        WearExerciseSessionStore.publishFromAccumulator(
            status = WearExerciseSessionStatus.ENDED,
            accumulator = currentAccumulator,
            message = message,
        )
    }

    private fun finishService() {
        isPreparing = false
        healthPreparationInFlight = false
        healthPreparationCancelInFlight = false
        healthPreparationGeneration += 1
        preparedExerciseConfig = null
        pendingExerciseStart = null
        checkpointHandler.removeCallbacks(preparationTimeoutRunnable)
        stopAssistedLocationUpdates()
        stopFusedRouteLocationUpdates()
        stopDirectLocationUpdates()
        stopDirectHeartRateUpdates()
        stopActiveDurationCheckpoints()
        clearExerciseCallback()
        accumulator = null
        exerciseStarted = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun registerExerciseCallback() {
        if (exerciseCallback != null) return
        exerciseCallback = object : ExerciseUpdateCallback {
            override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
                publishExerciseUpdate(update)
            }

            override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) = Unit

            override fun onRegistered() = Unit

            override fun onRegistrationFailed(throwable: Throwable) {
                if (endRequested || WearExerciseSessionStore.current().status == WearExerciseSessionStatus.ENDED) return
                enableDirectSensorFallbacks()
                WearExerciseSessionStore.markFallback(
                    "Health Services callback failed: ${throwable.message ?: throwable.javaClass.simpleName}",
                )
            }

            override fun onAvailabilityChanged(
                dataType: DataType<*, *>,
                availability: Availability,
            ) = Unit
        }
        exerciseCallback?.let { callback -> exerciseClient.setUpdateCallback(callback) }
    }

    private fun publishExerciseUpdate(update: ExerciseUpdate) {
        val nextAccumulator = accumulator ?: return
        if (endRequested && !update.exerciseStateInfo.state.isEnded) return
        if (update.exerciseStateInfo.state.isEnded && !endRequested) {
            val currentStatus = WearExerciseSessionStore.current().status
            exerciseStarted = false
            clearExerciseCallback()
            WearExerciseSessionStore.publishFromAccumulator(
                status = WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
                    action = WearExerciseEndAction.WAIT_FOR_FINAL_UPDATE,
                    currentStatus = currentStatus,
                ),
                accumulator = nextAccumulator,
                message = "GPS direct · Health Services ended",
            )
            return
        }
        val metrics = update.latestMetrics
        val heartRatePoint = metrics.getData(DataType.HEART_RATE_BPM).lastOrNull()
        val heartRateAccuracy = heartRatePoint?.accuracy as? HeartRateAccuracy
        val heartRateBpm = heartRatePoint
            ?.takeIf {
                heartRateAccuracy == null || heartRateAccuracy.sensorStatus in setOf(
                    HeartRateAccuracy.SensorStatus.ACCURACY_LOW,
                    HeartRateAccuracy.SensorStatus.ACCURACY_MEDIUM,
                    HeartRateAccuracy.SensorStatus.ACCURACY_HIGH,
                )
            }
            ?.value
            ?.roundToInt()
        val elapsedRealtimeMs = SystemClock.elapsedRealtime()
        val healthActiveDurationMs = activeDurationTracker.plausibleHealthDuration(
            reportedDurationMs = update.activeDurationCheckpoint?.activeDuration?.toMillis(),
            nowElapsedRealtimeMs = elapsedRealtimeMs,
        )
        val activeDurationMs = maxOf(
            activeDurationTracker.activeDurationAt(elapsedRealtimeMs),
            healthActiveDurationMs ?: 0L,
        )
        val locationPoints = if (debugRouteReplayActive) {
            emptyList()
        } else {
            metrics.getData(DataType.LOCATION)
                .sortedBy { point -> point.timeDurationFromBoot }
        }
        if (heartRateBpm != null && !healthHeartRateManaged) {
            healthHeartRateManaged = true
            stopDirectHeartRateUpdates()
        }
        if (locationPoints.isNotEmpty() && !healthLocationManaged) {
            healthLocationManaged = true
            stopDirectLocationUpdates()
            stopFusedRouteLocationUpdates()
        }

        nextAccumulator.applyMetricUpdate(
            elapsedRealtimeMs = elapsedRealtimeMs,
            heartRateBpm = heartRateBpm,
            activeDurationMs = activeDurationMs,
        )
        locationPoints.forEach { point ->
            val pointElapsedRealtimeMs = point.timeDurationFromBoot.toMillis()
            val pointAccuracy = (point.accuracy as? LocationAccuracy)
                ?.horizontalPositionErrorMeters
                ?.takeIf { accuracy -> accuracy.isFinite() && accuracy > 0.0 }
                ?: recentDirectGpsAccuracy(pointElapsedRealtimeMs)
                ?: MAX_DIRECT_GPS_ACCURACY_M.toDouble()
            lastDirectGpsAccuracyM = pointAccuracy
            lastDirectGpsFixElapsedRealtimeMs = pointElapsedRealtimeMs
            gpsStatusMessage = if (pointAccuracy <= MAX_READY_GPS_ACCURACY_M) {
                GPS_STATUS_DIRECT
            } else {
                "GPS weak ±${pointAccuracy.roundToInt()}m"
            }
            nextAccumulator.applyMetricUpdate(
                elapsedRealtimeMs = pointElapsedRealtimeMs,
                routePoint = WearRoutePoint(
                    timestampMs = wallClockMsForElapsed(pointElapsedRealtimeMs),
                    lat = point.value.latitude,
                    lng = point.value.longitude,
                    altitude = point.value.altitude.takeIf { it.isFinite() && it in MIN_ALTITUDE_M..MAX_ALTITUDE_M },
                    bearing = point.value.bearing.takeIf { it.isFinite() },
                    accuracy = pointAccuracy,
                ),
            )
        }

        val endAction = WearExerciseEndPolicy.afterExerciseUpdate(update.exerciseStateInfo.state.isEnded)
        val status = WearExerciseEndPolicy.sessionStatusAfterExerciseUpdate(
            action = endAction,
            currentStatus = WearExerciseSessionStore.current().status,
        )
        publishAccumulatorSnapshot(
            status = status,
            accumulator = nextAccumulator,
            message = locationStatusMessage(),
            force = endAction == WearExerciseEndAction.PUBLISH_FINAL_UPDATE,
        )

        if (endAction == WearExerciseEndAction.PUBLISH_FINAL_UPDATE) {
            finishService()
        }
    }

    private fun clearExerciseCallback() {
        exerciseCallback?.let { callback ->
            exerciseClient.clearUpdateCallbackAsync(callback)
        }
        exerciseCallback = null
    }

    private fun restorePersistedSessionIfMissing(markRestartGap: Boolean = false): WearExerciseSessionSnapshot? {
        if (accumulator != null && WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) {
            return WearExerciseSessionStore.current()
        }
        val persisted = WearExerciseSessionPersistence.load(this) ?: return null
        restoreRuntimeFromSnapshot(persisted, markRestartGap)
        return WearExerciseSessionStore.current()
    }

    private fun restoreRuntimeFromSnapshot(
        snapshot: WearExerciseSessionSnapshot,
        markRestartGap: Boolean,
    ) {
        val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
        wallClockOffsetMs = System.currentTimeMillis() - nowElapsedRealtimeMs
        lastDirectLocationElapsedRealtimeMs = snapshot.routePoints
            .maxOfOrNull { point -> (point.timestampMs - wallClockOffsetMs).coerceAtLeast(0L) }
            ?: 0L
        lastDirectGpsAccuracyM = snapshot.routePoints.lastOrNull()?.accuracy
            ?.takeIf { accuracy -> accuracy.isFinite() && accuracy > 0.0 && accuracy <= MAX_DIRECT_GPS_ACCURACY_M }
        lastDirectGpsFixElapsedRealtimeMs = if (lastDirectGpsAccuracyM == null) 0L else nowElapsedRealtimeMs
        gpsStatusMessage = snapshot.message
            ?.takeIf { message -> message.startsWith("GPS ") }
            ?: if (snapshot.routePoints.isEmpty()) GPS_STATUS_SEARCHING else GPS_STATUS_DIRECT
        val runningStatus = snapshot.status in setOf(
            WearExerciseSessionStatus.STARTING,
            WearExerciseSessionStatus.ACTIVE,
            WearExerciseSessionStatus.FALLBACK,
        )
        activeDurationTracker.restore(
            persistedActiveDurationMs = snapshot.activeDurationMs,
            nowElapsedRealtimeMs = nowElapsedRealtimeMs,
            isRunning = runningStatus,
        )
        val restoredAccumulator = WearExerciseMetricAccumulator.fromSnapshot(
            snapshot = snapshot,
            startedAtElapsedRealtimeMs = (nowElapsedRealtimeMs - snapshot.activeDurationMs)
                .coerceAtLeast(0L),
            markRestartGap = markRestartGap && runningStatus,
        )
        accumulator = restoredAccumulator
        exerciseStarted = false
        endRequested = false
        if (runningStatus) {
            restoredAccumulator.applyMetricUpdate(
                elapsedRealtimeMs = nowElapsedRealtimeMs,
                activeDurationMs = activeDurationTracker.activeDurationAt(nowElapsedRealtimeMs),
            )
            WearExerciseSessionStore.publishFromAccumulator(
                status = snapshot.status,
                accumulator = restoredAccumulator,
                message = snapshot.message ?: "GPS direct · restored",
            )
        } else {
            WearExerciseSessionStore.restore(snapshot)
        }
    }

    private fun ensurePersistenceListener() {
        if (persistenceUnsubscribe != null) return
        persistenceUnsubscribe = WearExerciseSessionStore.addListener { snapshot ->
            schedulePersistence(snapshot)
        }
    }

    private fun schedulePersistence(snapshot: WearExerciseSessionSnapshot) {
        pendingPersistenceSnapshot = snapshot
        val statusChanged = snapshot.status != lastPersistedStatus
        val terminalOrPaused = snapshot.status !in setOf(
            WearExerciseSessionStatus.STARTING,
            WearExerciseSessionStatus.ACTIVE,
            WearExerciseSessionStatus.FALLBACK,
        )
        if (statusChanged || terminalOrPaused) {
            checkpointHandler.removeCallbacks(persistenceRunnable)
            persistenceWriteScheduled = false
            flushPendingPersistence()
        } else if (!persistenceWriteScheduled) {
            persistenceWriteScheduled = true
            checkpointHandler.postDelayed(persistenceRunnable, PERSISTENCE_CHECKPOINT_MS)
        }
    }

    private fun flushPendingPersistence() {
        val snapshot = pendingPersistenceSnapshot ?: return
        pendingPersistenceSnapshot = null
        WearExerciseSessionPersistence.saveOrClear(this, snapshot)
        lastPersistedStatus = snapshot.status
    }

    private fun publishAccumulatorSnapshot(
        status: WearExerciseSessionStatus,
        accumulator: WearExerciseMetricAccumulator,
        message: String? = null,
        force: Boolean = false,
    ) {
        val elapsedRealtimeMs = SystemClock.elapsedRealtime()
        val statusChanged = WearExerciseSessionStore.current().status != status
        // Ambient/wrist-down (plan's W2 battery slice): relax the live-snapshot cadence since
        // nothing is watching the screen in real time.
        val snapshotIntervalMs = if (WearAmbientState.isAmbient) {
            AMBIENT_LIVE_SNAPSHOT_INTERVAL_MS
        } else {
            LIVE_SNAPSHOT_INTERVAL_MS
        }
        if (!force && !statusChanged &&
            elapsedRealtimeMs - lastLiveSnapshotPublishedElapsedRealtimeMs < snapshotIntervalMs
        ) return
        lastLiveSnapshotPublishedElapsedRealtimeMs = elapsedRealtimeMs
        WearExerciseSessionStore.publishFromAccumulator(
            status = status,
            accumulator = accumulator,
            message = message,
        )
    }

    private fun startActiveDurationCheckpoints() {
        checkpointHandler.removeCallbacks(checkpointRunnable)
        // Kept as the plain ACTIVE_DURATION_CHECKPOINT_MS literal (an existing, out-of-scope test
        // pins this exact call) — this only fires right at start/resume, which practically never
        // races with an ambient transition; the ambient-aware cadence takes over from the very
        // next tick via checkpointActiveDuration()'s own reschedule below.
        checkpointHandler.postDelayed(checkpointRunnable, ACTIVE_DURATION_CHECKPOINT_MS)
    }

    private fun stopActiveDurationCheckpoints() {
        checkpointHandler.removeCallbacks(checkpointRunnable)
    }

    private fun checkpointActiveDuration() {
        val status = WearExerciseSessionStore.current().status
        if (status !in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) return
        val currentAccumulator = accumulator ?: return
        val elapsedRealtimeMs = SystemClock.elapsedRealtime()
        currentAccumulator.applyMetricUpdate(
            elapsedRealtimeMs = elapsedRealtimeMs,
            activeDurationMs = activeDurationTracker.activeDurationAt(elapsedRealtimeMs),
        )
        publishAccumulatorSnapshot(
            status = status,
            accumulator = currentAccumulator,
            message = locationStatusMessage(),
        )
        checkpointHandler.postDelayed(
            checkpointRunnable,
            if (WearAmbientState.isAmbient) AMBIENT_ACTIVE_DURATION_CHECKPOINT_MS else ACTIVE_DURATION_CHECKPOINT_MS,
        )
    }

    /**
     * Fused location is intentionally readiness-only. On Wear OS it may be supplied by the
     * companion phone, so it must never enter the route accumulator or distance calculation.
     */
    private fun startAssistedLocationUpdates() {
        if (!hasLocationPermission() || assistedLocationCallback != null) return
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let(::publishAssistedLocation)
            }
        }
        assistedLocationCallback = callback
        val request = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            ASSISTED_LOCATION_INTERVAL_MS,
        )
            .setMinUpdateIntervalMillis(ASSISTED_LOCATION_MIN_INTERVAL_MS)
            .setMaxUpdateAgeMillis(MAX_ASSISTED_LOCATION_AGE_MS)
            .build()
        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                location?.let(::publishAssistedLocation)
            }
            fusedLocationClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
        } catch (_: SecurityException) {
            assistedLocationCallback = null
        }
    }

    private fun stopAssistedLocationUpdates() {
        val callback = assistedLocationCallback ?: return
        fusedLocationClient.removeLocationUpdates(callback)
        assistedLocationCallback = null
    }

    private fun publishAssistedLocation(location: Location) {
        if (!isPreparing || accumulator != null) return
        val accuracy = location.accuracy.takeIf { location.hasAccuracy() && it.isFinite() && it > 0f } ?: return
        if (accuracy > MAX_ASSISTED_LOCATION_ACCURACY_M) return
        val now = System.currentTimeMillis()
        val locationTime = location.time.takeIf { it > 0L } ?: now
        if (now - locationTime > MAX_ASSISTED_LOCATION_AGE_MS || locationTime - now > 10_000L) return
        if (gpsStatusMessage != GPS_STATUS_DIRECT) publishPreparationStatus(GPS_STATUS_ASSISTED)
    }

    private fun publishPreparationStatus(message: String) {
        if (!isPreparing || WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) return
        gpsStatusMessage = message
        WearExerciseSessionStore.restore(WearExerciseSessionStore.current().copy(message = message))
    }

    /** High-accuracy fused fixes are only a fallback when the watch GPS provider is unavailable. */
    private fun startFusedRouteLocationUpdates() {
        if (!hasLocationPermission() || fusedRouteLocationCallback != null) return
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                if (accumulator == null) return
                result.lastLocation?.let(::publishDirectLocation)
            }
        }
        fusedRouteLocationCallback = callback
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            FUSED_ROUTE_LOCATION_INTERVAL_MS,
        )
            .setMinUpdateIntervalMillis(FUSED_ROUTE_LOCATION_MIN_INTERVAL_MS)
            .setMinUpdateDistanceMeters(FUSED_ROUTE_MIN_DISTANCE_M)
            .setMaxUpdateAgeMillis(0L)
            .build()
        try {
            fusedLocationClient.requestLocationUpdates(request, callback, Looper.getMainLooper())
                .addOnFailureListener {
                    if (fusedRouteLocationCallback === callback) fusedRouteLocationCallback = null
                }
        } catch (_: SecurityException) {
            fusedRouteLocationCallback = null
        }
    }

    private fun stopFusedRouteLocationUpdates() {
        val callback = fusedRouteLocationCallback ?: return
        fusedLocationClient.removeLocationUpdates(callback)
        fusedRouteLocationCallback = null
    }

    private fun startDirectLocationUpdates() {
        if (!hasLocationPermission() || directLocationListener != null) return
        val manager = directLocationManager ?: return
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                publishDirectLocation(location)
            }

            override fun onProviderEnabled(provider: String) {
                publishGpsStatus(GPS_STATUS_SEARCHING)
                stopFusedRouteLocationUpdates()
            }

            override fun onProviderDisabled(provider: String) {
                publishGpsStatus("GPS provider unavailable")
                startFusedRouteLocationUpdates()
            }
        }
        try {
            val gpsEnabled = manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            if (gpsEnabled) {
                manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1_000L, 2f, listener)
                directLocationListener = listener
            } else {
                gpsStatusMessage = "GPS provider unavailable"
                startFusedRouteLocationUpdates()
                if (isPreparing) {
                    publishPreparationStatus("GPS provider unavailable")
                } else {
                    WearExerciseSessionStore.markFallback("GPS provider unavailable")
                }
            }
        } catch (_: SecurityException) {
            directLocationListener = null
            gpsStatusMessage = "location permission missing"
            if (isPreparing) {
                publishPreparationStatus("location permission missing")
            } else {
                WearExerciseSessionStore.markFallback("location permission missing")
            }
        } catch (_: IllegalArgumentException) {
            directLocationListener = null
            gpsStatusMessage = "GPS provider unavailable"
            startFusedRouteLocationUpdates()
            if (isPreparing) {
                publishPreparationStatus("GPS provider unavailable")
            } else {
                WearExerciseSessionStore.markFallback("GPS provider unavailable")
            }
        }
    }

    private fun stopDirectLocationUpdates() {
        val listener = directLocationListener ?: return
        try {
            directLocationManager?.removeUpdates(listener)
        } catch (_: SecurityException) {
        }
        directLocationListener = null
    }

    private fun publishDirectLocation(location: Location) {
        val accuracy = location.accuracy.takeIf { location.hasAccuracy() && it.isFinite() && it > 0f } ?: return
        val now = System.currentTimeMillis()
        val locationTime = location.time.takeIf { it > 0L } ?: now
        if (now - locationTime > MAX_DIRECT_GPS_AGE_MS || locationTime - now > 10_000L) return
        val reportedElapsedRealtimeMs = if (location.elapsedRealtimeNanos > 0L) {
            location.elapsedRealtimeNanos / 1_000_000L
        } else {
            0L
        }
        val systemElapsedRealtimeMs = SystemClock.elapsedRealtime()
        lastDirectGpsAccuracyM = accuracy.toDouble()
        lastDirectGpsFixElapsedRealtimeMs = reportedElapsedRealtimeMs.takeIf { it > 0L } ?: systemElapsedRealtimeMs
        if (accuracy > MAX_DIRECT_GPS_ACCURACY_M) {
            publishGpsStatus("GPS weak ±${accuracy.roundToInt()}m")
            return
        }
        val currentAccumulator = accumulator
        if (currentAccumulator == null) {
            publishPreparationStatus(
                if (accuracy <= MAX_READY_GPS_ACCURACY_M) GPS_STATUS_DIRECT else "GPS weak ±${accuracy.roundToInt()}m",
            )
            return
        }
        if (endRequested || WearExerciseSessionStore.current().status !in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) return
        if (reportedElapsedRealtimeMs > 0L &&
            reportedElapsedRealtimeMs <= lastDirectLocationElapsedRealtimeMs
        ) return
        val elapsedRealtimeMs = when {
            reportedElapsedRealtimeMs > lastDirectLocationElapsedRealtimeMs -> reportedElapsedRealtimeMs
            else -> systemElapsedRealtimeMs
        }.coerceAtLeast(lastDirectLocationElapsedRealtimeMs + 1L)
        lastDirectLocationElapsedRealtimeMs = elapsedRealtimeMs
        // A healthy direct GPS fix makes the high-accuracy fused request redundant — drop it so
        // it isn't drawing power for a route source we're not using (plan's W2 battery slice).
        stopFusedRouteLocationUpdates()
        lastDirectGpsFixElapsedRealtimeMs = elapsedRealtimeMs
        val activeDurationMs = activeDurationTracker.activeDurationAt(elapsedRealtimeMs)
        currentAccumulator.applyMetricUpdate(
            elapsedRealtimeMs = elapsedRealtimeMs,
            activeDurationMs = activeDurationMs,
            routePoint = WearRoutePoint(
                timestampMs = wallClockMsForElapsed(elapsedRealtimeMs),
                lat = location.latitude,
                lng = location.longitude,
                altitude = location.altitude.takeIf {
                    location.hasAltitude() && it.isFinite() && it in MIN_ALTITUDE_M..MAX_ALTITUDE_M
                },
                bearing = location.bearing.toDouble().takeIf { location.hasBearing() && it.isFinite() },
                accuracy = accuracy.toDouble(),
            ),
        )
        val gpsMessage = if (accuracy <= MAX_READY_GPS_ACCURACY_M) {
            GPS_STATUS_DIRECT
        } else {
            "GPS weak ±${accuracy.roundToInt()}m"
        }
        publishAccumulatorSnapshot(
            status = WearExerciseSessionStatus.ACTIVE,
            accumulator = currentAccumulator,
            message = gpsMessage,
        )
        gpsStatusMessage = gpsMessage
    }

    private fun recentDirectGpsAccuracy(pointElapsedRealtimeMs: Long): Double? {
        val accuracy = lastDirectGpsAccuracyM ?: return null
        val ageMs = pointElapsedRealtimeMs - lastDirectGpsFixElapsedRealtimeMs
        return accuracy.takeIf { ageMs in 0L..MAX_DIRECT_GPS_AGE_MS }
    }

    private fun publishGpsStatus(message: String) {
        if (endRequested) return
        gpsStatusMessage = message
        val elapsedRealtimeMs = SystemClock.elapsedRealtime()
        if (elapsedRealtimeMs - lastGpsStatusPublishedElapsedRealtimeMs < GPS_STATUS_PUBLISH_INTERVAL_MS) return
        lastGpsStatusPublishedElapsedRealtimeMs = elapsedRealtimeMs
        val currentAccumulator = accumulator
        if (currentAccumulator == null) {
            publishPreparationStatus(message)
            return
        }
        val status = WearExerciseSessionStore.current().status
        if (status !in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) return
        WearExerciseSessionStore.publishFromAccumulator(
            status = status,
            accumulator = currentAccumulator,
            message = message,
        )
    }

    private fun startDirectHeartRateUpdates() {
        if (!hasHeartRatePermission() || directHeartRateListener != null) return
        val manager = directHeartRateManager ?: return
        val sensor = manager.getDefaultSensor(Sensor.TYPE_HEART_RATE) ?: return
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type != Sensor.TYPE_HEART_RATE) return
                if (event.accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE ||
                    event.accuracy == SensorManager.SENSOR_STATUS_NO_CONTACT
                ) return
                val bpm = event.values.firstOrNull()
                    ?.takeIf { value -> value.isFinite() && value in MIN_HEART_RATE_BPM..MAX_HEART_RATE_BPM }
                    ?.roundToInt()
                    ?: return
                publishDirectHeartRate(bpm, event.timestamp)
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        try {
            if (manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)) {
                directHeartRateListener = listener
            }
        } catch (_: SecurityException) {
            directHeartRateListener = null
        }
    }

    private fun stopDirectHeartRateUpdates() {
        val listener = directHeartRateListener ?: return
        directHeartRateManager?.unregisterListener(listener)
        directHeartRateListener = null
    }

    private fun publishDirectHeartRate(bpm: Int, timestampNanos: Long) {
        if (endRequested || WearExerciseSessionStore.current().status !in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) return
        val currentAccumulator = accumulator ?: return
        val elapsedRealtimeMs = (timestampNanos / 1_000_000L)
            .takeIf { timestampMs -> timestampMs > 0L }
            ?: SystemClock.elapsedRealtime()
        currentAccumulator.applyMetricUpdate(
            elapsedRealtimeMs = elapsedRealtimeMs,
            heartRateBpm = bpm,
            activeDurationMs = activeDurationTracker.activeDurationAt(elapsedRealtimeMs),
        )
        publishAccumulatorSnapshot(
            status = WearExerciseSessionStatus.ACTIVE,
            accumulator = currentAccumulator,
            message = locationStatusMessage(),
        )
    }

    private fun requestedDataTypes(): Set<DataType<*, *>> {
        val dataTypes = mutableSetOf<DataType<*, *>>(
            DataType.ACTIVE_EXERCISE_DURATION_TOTAL,
        )
        if (hasHeartRatePermission()) {
            dataTypes.add(DataType.HEART_RATE_BPM)
        }
        if (hasLocationPermission()) {
            dataTypes.add(DataType.LOCATION)
        }
        return dataTypes
    }

    private fun warmUpDataTypes(dataTypes: Set<DataType<*, *>>): Set<DeltaDataType<*, *>> {
        val warmUpTypes = mutableSetOf<DeltaDataType<*, *>>()
        if (dataTypes.contains(DataType.LOCATION)) warmUpTypes.add(DataType.LOCATION)
        if (dataTypes.contains(DataType.HEART_RATE_BPM)) warmUpTypes.add(DataType.HEART_RATE_BPM)
        return warmUpTypes
    }

    private fun hasActivityRecognitionPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACTIVITY_RECOGNITION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasHeartRatePermission(): Boolean {
        val hasGranularPermission = ContextCompat.checkSelfPermission(
            this,
            PERMISSION_READ_HEART_RATE,
        ) == PackageManager.PERMISSION_GRANTED
        val hasLegacyPermission = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.BODY_SENSORS,
        ) == PackageManager.PERMISSION_GRANTED
        return hasGranularPermission || hasLegacyPermission
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun locationStatusMessage(): String? {
        return if (hasLocationPermission()) gpsStatusMessage else "location permission missing"
    }

    private fun wallClockMsForElapsed(elapsedRealtimeMs: Long): Long {
        return wallClockOffsetMs + elapsedRealtimeMs
    }

    private fun buildNotification(contentText: String = "런닝/조깅 기록 중"): Notification {
        ensureNotificationChannel()
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Tomato Farm")
            .setContentText(contentText)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun startForegroundWithHealthType(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val foregroundType = ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH or
                if (hasLocationPermission()) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
            startForeground(
                NOTIFICATION_ID,
                notification,
                foregroundType,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Workout tracking",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    companion object {
        private const val ACTION_PREPARE_RUN = "com.lifestreak.wear.workout.PREPARE_RUN"
        private const val ACTION_CANCEL_PREPARATION = "com.lifestreak.wear.workout.CANCEL_PREPARATION"
        private const val ACTION_START_RUN = "com.lifestreak.wear.workout.START_RUN"
        private const val ACTION_RESTORE_RUN = "com.lifestreak.wear.workout.RESTORE_RUN"
        private const val ACTION_PAUSE_RUN = "com.lifestreak.wear.workout.PAUSE_RUN"
        private const val ACTION_RESUME_RUN = "com.lifestreak.wear.workout.RESUME_RUN"
        private const val ACTION_END_RUN = "com.lifestreak.wear.workout.END_RUN"
        const val ACTION_DEBUG_ROUTE_POINT = "com.lifestreak.wear.workout.DEBUG_ROUTE_POINT"
        const val EXTRA_DEBUG_LAT = "lat"
        const val EXTRA_DEBUG_LNG = "lng"
        const val EXTRA_DEBUG_TIMESTAMP_MS = "timestampMs"
        const val EXTRA_DEBUG_ACTIVE_DURATION_MS = "activeDurationMs"
        const val EXTRA_DEBUG_ACCURACY = "accuracy"
        const val EXTRA_DEBUG_ALTITUDE = "altitude"
        const val EXTRA_DEBUG_BEARING = "bearing"
        private const val NOTIFICATION_CHANNEL_ID = "wear-exercise"
        private const val NOTIFICATION_ID = 2001
        private const val MAX_DIRECT_GPS_ACCURACY_M = 35f
        private const val MAX_READY_GPS_ACCURACY_M = 15f
        private const val MAX_DIRECT_GPS_AGE_MS = 30_000L
        private const val MAX_ASSISTED_LOCATION_ACCURACY_M = 200f
        private const val MAX_ASSISTED_LOCATION_AGE_MS = 30_000L
        private const val ASSISTED_LOCATION_INTERVAL_MS = 2_000L
        private const val ASSISTED_LOCATION_MIN_INTERVAL_MS = 1_000L
        private const val FUSED_ROUTE_LOCATION_INTERVAL_MS = 1_000L
        private const val FUSED_ROUTE_LOCATION_MIN_INTERVAL_MS = 500L
        private const val FUSED_ROUTE_MIN_DISTANCE_M = 1f
        private const val LIVE_SNAPSHOT_INTERVAL_MS = 1_000L
        private const val PERSISTENCE_CHECKPOINT_MS = 10_000L
        private const val ACTIVE_DURATION_CHECKPOINT_MS = 10_000L
        // Ambient/wrist-down cadences (plan's W2 battery slice): relaxed versions of the two
        // constants above, used only while WearAmbientState.isAmbient is true.
        private const val AMBIENT_LIVE_SNAPSHOT_INTERVAL_MS = 15_000L
        private const val AMBIENT_ACTIVE_DURATION_CHECKPOINT_MS = 60_000L
        private const val PREPARATION_TIMEOUT_MS = 90_000L
        private const val GPS_STATUS_PUBLISH_INTERVAL_MS = 5_000L
        private const val GPS_STATUS_SEARCHING = "GPS searching"
        private const val GPS_STATUS_DIRECT = "GPS direct"
        private const val GPS_STATUS_ASSISTED = "GPS assisted"
        private const val MIN_HEART_RATE_BPM = 30f
        private const val MAX_HEART_RATE_BPM = 240f
        private const val MIN_ALTITUDE_M = -500.0
        private const val MAX_ALTITUDE_M = 9_000.0
        const val PERMISSION_READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"

        fun prepareRun(context: Context) {
            if (WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) return
            if (ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ) != PackageManager.PERMISSION_GRANTED
            ) return
            ContextCompat.startForegroundService(context, intentFor(context, ACTION_PREPARE_RUN))
        }

        fun cancelPreparation(context: Context) {
            context.startService(intentFor(context, ACTION_CANCEL_PREPARATION))
        }

        fun startRun(context: Context) {
            ContextCompat.startForegroundService(context, intentFor(context, ACTION_START_RUN))
        }

        fun restoreRun(context: Context) {
            ContextCompat.startForegroundService(context, intentFor(context, ACTION_RESTORE_RUN))
        }

        fun pauseRun(context: Context) {
            context.startService(intentFor(context, ACTION_PAUSE_RUN))
        }

        fun resumeRun(context: Context) {
            context.startService(intentFor(context, ACTION_RESUME_RUN))
        }

        fun endRun(context: Context) {
            context.startService(intentFor(context, ACTION_END_RUN))
        }

        private fun intentFor(context: Context, action: String): Intent {
            return Intent(context, WearExerciseService::class.java).setAction(action)
        }
    }
}
