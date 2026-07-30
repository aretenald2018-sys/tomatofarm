package com.lifestreak.wear.workout

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
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
import androidx.health.services.client.data.WarmUpConfig
import kotlin.math.roundToInt

/**
 * Lightweight FGS (`health` only — no location) that owns heart-rate collection during a
 * strength session. Deliberately not built on [WearExerciseService]: that service hardcodes
 * `ExerciseType.RUNNING` in three places, drives GPS warm-up/route logic strength doesn't need,
 * and declares FGS type `health|location`. Mutual exclusion with running (Health Services only
 * allows one active exercise at a time) is enforced by the UI controllers at their entry points,
 * not here.
 *
 * Every Health Services call is wrapped defensively: capability lookup failure, an unsupported
 * exercise type, or any async failure all fall back to a direct [SensorManager] HR read (ported
 * from `WearExerciseService`'s direct heart-rate fallback).
 */
class WearStrengthHrService : Service() {
    private lateinit var exerciseClient: ExerciseClient
    private var directSensorManager: SensorManager? = null
    private val healthCallbackExecutor by lazy { ContextCompat.getMainExecutor(this) }
    private var exerciseCallback: ExerciseUpdateCallback? = null
    private var exerciseStarted = false
    private var directListener: SensorEventListener? = null
    private var healthAttempted = false

    override fun onCreate() {
        super.onCreate()
        exerciseClient = HealthServices.getClient(this).exerciseClient
        directSensorManager = getSystemService(SensorManager::class.java)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundWithHealthType(buildNotification())
        when (intent?.action) {
            ACTION_END -> handleEnd()
            else -> handleStartOrRestore()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        clearExerciseCallback()
        stopDirectHeartRate()
        super.onDestroy()
    }

    private fun handleStartOrRestore() {
        if (exerciseStarted || directListener != null || healthAttempted) return
        healthAttempted = true
        if (!hasHeartRatePermission()) {
            WearStrengthHrStore.markPermissionMissing()
            return
        }
        startHealthExercise()
    }

    private fun startHealthExercise() {
        val capabilitiesFuture = try {
            exerciseClient.getCapabilitiesAsync()
        } catch (_: Exception) {
            startDirectHeartRate()
            return
        }
        capabilitiesFuture.addListener(
            {
                val exerciseType = try {
                    val supported = capabilitiesFuture.get().supportedExerciseTypes
                    when {
                        supported.contains(ExerciseType.STRENGTH_TRAINING) -> ExerciseType.STRENGTH_TRAINING
                        supported.contains(ExerciseType.WEIGHTLIFTING) -> ExerciseType.WEIGHTLIFTING
                        else -> null
                    }
                } catch (_: Exception) {
                    null
                }
                if (exerciseType == null) {
                    startDirectHeartRate()
                    return@addListener
                }
                val dataTypes: Set<DataType<*, *>> = try {
                    val typeCapabilities = capabilitiesFuture.get().getExerciseTypeCapabilities(exerciseType)
                    setOf<DataType<*, *>>(DataType.HEART_RATE_BPM).intersect(typeCapabilities.supportedDataTypes)
                } catch (_: Exception) {
                    emptySet()
                }
                if (dataTypes.isEmpty()) {
                    startDirectHeartRate()
                    return@addListener
                }
                prepareThenStartExercise(exerciseType, dataTypes)
            },
            healthCallbackExecutor,
        )
    }

    private fun prepareThenStartExercise(exerciseType: ExerciseType, dataTypes: Set<DataType<*, *>>) {
        val config = ExerciseConfig(
            exerciseType = exerciseType,
            dataTypes = dataTypes,
            isAutoPauseAndResumeEnabled = false,
            isGpsEnabled = false,
            exerciseGoals = emptyList(),
        )
        val warmUpFuture = try {
            exerciseClient.prepareExerciseAsync(
                WarmUpConfig(exerciseType, setOf<DeltaDataType<*, *>>(DataType.HEART_RATE_BPM)),
            )
        } catch (_: Exception) {
            null
        }
        if (warmUpFuture == null) {
            startConfiguredExercise(config)
            return
        }
        warmUpFuture.addListener(
            {
                runCatching { warmUpFuture.get() }
                startConfiguredExercise(config)
            },
            healthCallbackExecutor,
        )
    }

    private fun startConfiguredExercise(config: ExerciseConfig) {
        val startFuture = try {
            exerciseClient.startExerciseAsync(config)
        } catch (_: Exception) {
            startDirectHeartRate()
            return
        }
        startFuture.addListener(
            {
                try {
                    startFuture.get()
                    exerciseStarted = true
                    registerExerciseCallback()
                } catch (_: Exception) {
                    startDirectHeartRate()
                }
            },
            healthCallbackExecutor,
        )
    }

    private fun registerExerciseCallback() {
        if (exerciseCallback != null) return
        val callback = object : ExerciseUpdateCallback {
            override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
                publishHeartRate(update)
            }

            override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) = Unit

            override fun onRegistered() = Unit

            override fun onRegistrationFailed(throwable: Throwable) {
                exerciseStarted = false
                startDirectHeartRate()
            }

            override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) = Unit
        }
        exerciseCallback = callback
        try {
            exerciseClient.setUpdateCallback(callback)
        } catch (_: Exception) {
            exerciseCallback = null
            startDirectHeartRate()
        }
    }

    private fun publishHeartRate(update: ExerciseUpdate) {
        val heartRatePoint = try {
            update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()
        } catch (_: Exception) {
            null
        } ?: return
        val accuracy = heartRatePoint.accuracy as? HeartRateAccuracy
        if (accuracy != null && accuracy.sensorStatus !in setOf(
                HeartRateAccuracy.SensorStatus.ACCURACY_LOW,
                HeartRateAccuracy.SensorStatus.ACCURACY_MEDIUM,
                HeartRateAccuracy.SensorStatus.ACCURACY_HIGH,
            )
        ) {
            return
        }
        val bpm = heartRatePoint.value.roundToInt()
        if (bpm !in MIN_HEART_RATE_BPM.toInt()..MAX_HEART_RATE_BPM.toInt()) return
        WearStrengthHrStore.addSample(System.currentTimeMillis(), bpm)
    }

    private fun clearExerciseCallback() {
        val callback = exerciseCallback ?: return
        exerciseCallback = null
        try {
            exerciseClient.clearUpdateCallbackAsync(callback)
        } catch (_: Exception) {
        }
    }

    private fun startDirectHeartRate() {
        if (directListener != null) return
        if (!hasHeartRatePermission()) {
            WearStrengthHrStore.markPermissionMissing()
            return
        }
        val manager = directSensorManager ?: return
        val sensor = manager.getDefaultSensor(Sensor.TYPE_HEART_RATE) ?: return
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                if (event.sensor.type != Sensor.TYPE_HEART_RATE) return
                if (event.accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE ||
                    event.accuracy == SensorManager.SENSOR_STATUS_NO_CONTACT
                ) {
                    return
                }
                val bpm = event.values.firstOrNull()
                    ?.takeIf { value -> value.isFinite() && value in MIN_HEART_RATE_BPM..MAX_HEART_RATE_BPM }
                    ?.roundToInt()
                    ?: return
                WearStrengthHrStore.addSample(System.currentTimeMillis(), bpm)
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        try {
            if (manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)) {
                directListener = listener
            }
        } catch (_: SecurityException) {
            directListener = null
        }
    }

    private fun stopDirectHeartRate() {
        val listener = directListener ?: return
        directSensorManager?.unregisterListener(listener)
        directListener = null
    }

    private fun handleEnd() {
        stopDirectHeartRate()
        if (exerciseStarted) {
            exerciseStarted = false
            val endFuture = try {
                exerciseClient.endExerciseAsync()
            } catch (_: Exception) {
                null
            }
            if (endFuture == null) {
                finishService()
                return
            }
            endFuture.addListener(
                {
                    runCatching { endFuture.get() }
                    finishService()
                },
                healthCallbackExecutor,
            )
        } else {
            finishService()
        }
    }

    private fun finishService() {
        clearExerciseCallback()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
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

    private fun buildNotification(): Notification {
        ensureNotificationChannel()
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Tomato Farm")
            .setContentText("헬스 기록 중")
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun startForegroundWithHealthType(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
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
                "Strength tracking",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    companion object {
        private const val ACTION_START = "com.lifestreak.wear.workout.strength.START"
        private const val ACTION_RESTORE = "com.lifestreak.wear.workout.strength.RESTORE"
        private const val ACTION_END = "com.lifestreak.wear.workout.strength.END"
        private const val NOTIFICATION_CHANNEL_ID = "tomato_wear_strength_hr"
        private const val NOTIFICATION_ID = 2101
        private const val MIN_HEART_RATE_BPM = 30f
        private const val MAX_HEART_RATE_BPM = 240f
        const val PERMISSION_READ_HEART_RATE = "android.permission.health.READ_HEART_RATE"

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, intentFor(context, ACTION_START))
        }

        fun restore(context: Context) {
            ContextCompat.startForegroundService(context, intentFor(context, ACTION_RESTORE))
        }

        fun end(context: Context) {
            ContextCompat.startForegroundService(context, intentFor(context, ACTION_END))
        }

        private fun intentFor(context: Context, action: String): Intent {
            return Intent(context, WearStrengthHrService::class.java).setAction(action)
        }
    }
}
