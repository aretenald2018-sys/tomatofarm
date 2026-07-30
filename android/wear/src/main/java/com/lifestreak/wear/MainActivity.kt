package com.lifestreak.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
// androidx.wear:wear:1.3.0 (already a build.gradle dependency) is expected to carry
// AmbientLifecycleObserver; if a real build can't resolve it, the fallback is adding the
// standalone `androidx.wear:wear-ambient` artifact.
import androidx.wear.ambient.AmbientLifecycleObserver
import com.lifestreak.wear.workout.WearAmbientState
import com.lifestreak.wear.workout.WearExerciseService
import com.lifestreak.wear.workout.WearExerciseSessionPersistence
import com.lifestreak.wear.workout.WearExerciseSessionStatus
import com.lifestreak.wear.workout.WearExerciseSessionStore
import com.lifestreak.wear.workout.WearStrengthUiController
import com.lifestreak.wear.workout.WearWorkoutUiController

class MainActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val wearWorkoutUi = WearWorkoutUiController(handler)
    private val wearStrengthUi = WearStrengthUiController(handler)
    private var restoredRunStatus: WearExerciseSessionStatus? = null
    private var runHost: View? = null

    /**
     * Fans out ambient enter/update/exit to both workout controllers (W1 of the plan's ambient
     * slice) and keeps the visibility-following GPS warm-up (W2) honest across ambient
     * transitions: a wrist-down (ambient) is treated like backgrounding for warm-up purposes.
     */
    private val ambientCallback = object : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
            WearAmbientState.isAmbient = true
            val host = runHost ?: return
            wearWorkoutUi.onEnterAmbient(
                host,
                ambientDetails.burnInProtectionRequired,
                ambientDetails.deviceHasLowBitAmbient,
            )
            wearStrengthUi.onEnterAmbient(
                host,
                ambientDetails.burnInProtectionRequired,
                ambientDetails.deviceHasLowBitAmbient,
            )
            if (WearExerciseSessionStore.current().status == WearExerciseSessionStatus.IDLE) {
                WearExerciseService.cancelPreparation(this@MainActivity)
            }
        }

        override fun onUpdateAmbient() {
            val host = runHost ?: return
            wearWorkoutUi.onUpdateAmbient(host)
            wearStrengthUi.onUpdateAmbient(host)
        }

        override fun onExitAmbient() {
            WearAmbientState.isAmbient = false
            val host = runHost ?: return
            wearWorkoutUi.onExitAmbient(host)
            wearStrengthUi.onExitAmbient(host)
            maybeWarmUpRun()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        lifecycle.addObserver(AmbientLifecycleObserver(this, ambientCallback))
        val restoredRun = WearExerciseSessionPersistence.load(this)
        if (restoredRun != null) {
            WearExerciseSessionStore.restore(restoredRun)
            restoredRunStatus = restoredRun.status
        }

        runHost = findViewById<View>(R.id.wearRunHost)
            ?: findViewById(android.R.id.content)
        val host = requireNotNull(runHost)

        // Cross-controller wiring for the plan's "러닝 기능과의 공존 설계": the run controller asks
        // the strength controller whether it may refuse a run start / must hide runReadyScreen, and
        // the strength controller asks the run controller to recompute that visibility whenever its
        // own screen changes (see WearStrengthUiController.onScreenChanged's kdoc).
        wearWorkoutUi.isStrengthActive = wearStrengthUi::isStrengthActive
        wearWorkoutUi.isStrengthOccupyingScreen = wearStrengthUi::isStrengthOccupyingScreen
        wearStrengthUi.onScreenChanged = { hostView -> wearWorkoutUi.onHostResumed(hostView) }

        wearWorkoutUi.bind(host)
        wearStrengthUi.bind(host)

        if (requestWearExercisePermissionsIfNeeded()) {
            if (!restoreRunServiceIfNeeded()) {
                // Restoration priority ①러닝 -> ②헬스 -> ③모드 선택 (plan §3). GPS warm-up itself is
                // no longer fired here — onResume (below) now drives it visibility-following, so it
                // doesn't linger for PREPARATION_TIMEOUT_MS after a launch the user walked away
                // from, and onResume runs immediately after onCreate anyway.
                wearStrengthUi.restoreIfNeeded(host)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        runHost?.let(wearWorkoutUi::onHostResumed)
        runHost?.let(wearStrengthUi::onHostResumed)
        maybeWarmUpRun()
    }

    override fun onPause() {
        runHost?.let(wearWorkoutUi::onHostPaused)
        runHost?.let(wearStrengthUi::onHostPaused)
        if (WearExerciseSessionStore.current().status == WearExerciseSessionStatus.IDLE && !isChangingConfigurations) {
            WearExerciseService.cancelPreparation(this)
        }
        super.onPause()
    }

    /**
     * Visibility-following GPS warm-up (plan's W2 battery slice): keeps Health Services' warm-up
     * alive only while the ready screen is actually resumed and on-screen, instead of the old
     * fire-once-at-launch approach that could keep GPS hot for the old 5-minute
     * `PREPARATION_TIMEOUT_MS` after the user had already walked away. Shared by onResume and the
     * ambient-exit hook so re-entering from either backgrounding or ambient behaves the same way.
     */
    private fun maybeWarmUpRun() {
        if (hasFineLocationPermission() &&
            WearExerciseSessionStore.current().status == WearExerciseSessionStatus.IDLE &&
            !wearStrengthUi.isStrengthOccupyingScreen()
        ) {
            WearExerciseService.prepareRun(this)
        }
    }

    private fun hasFineLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    override fun onBackPressed() {
        val host = runHost
        if (host != null && wearStrengthUi.handleBackPressed(host)) return
        super.onBackPressed()
    }

    private fun requestWearExercisePermissionsIfNeeded(): Boolean {
        val permissions = mutableListOf(
            Manifest.permission.ACTIVITY_RECOGNITION,
            Manifest.permission.ACCESS_FINE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= 36) {
            permissions.add(WearExerciseService.PERMISSION_READ_HEART_RATE)
        } else {
            permissions.add(Manifest.permission.BODY_SENSORS)
        }
        val missing = permissions.filter { permission ->
            ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                missing.toTypedArray(),
                REQUEST_EXERCISE_PERMISSIONS,
            )
        }
        return missing.isEmpty()
    }

    private fun restoreRunServiceIfNeeded(): Boolean {
        if (restoredRunStatus !in setOf(
                WearExerciseSessionStatus.STARTING,
                WearExerciseSessionStatus.ACTIVE,
                WearExerciseSessionStatus.PAUSED,
                WearExerciseSessionStatus.FALLBACK,
            )
        ) {
            return false
        }
        restoredRunStatus = null
        WearExerciseService.restoreRun(this)
        return true
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_EXERCISE_PERMISSIONS &&
            grantResults.isNotEmpty() &&
            grantResults.all { result -> result == PackageManager.PERMISSION_GRANTED }
        ) {
            if (!restoreRunServiceIfNeeded()) {
                // GPS warm-up itself isn't fired here either — the onResume that follows this
                // permission-grant callback picks it up via maybeWarmUpRun().
                val host = runHost
                if (host != null) wearStrengthUi.restoreIfNeeded(host)
            }
        }
    }

    override fun onDestroy() {
        if (isFinishing && WearExerciseSessionStore.current().status == WearExerciseSessionStatus.IDLE) {
            WearExerciseService.cancelPreparation(this)
        }
        super.onDestroy()
        wearWorkoutUi.dispose()
        wearStrengthUi.dispose()
    }

    private companion object {
        const val REQUEST_EXERCISE_PERMISSIONS = 2001
    }
}
