package com.lifestreak.wear.workout

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.InputDeviceCompat
import androidx.core.view.MotionEventCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import androidx.wear.widget.WearableRecyclerView
import com.lifestreak.wear.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Which of the edit screen's four uniform rows the rotary bezel currently targets — the row the
 * user last tapped (default 중량 whenever a new set is opened for editing). */
private enum class EditField {
    KG,
    REPS,
    RIR,
    ROM,
}

/**
 * Owns the strength (헬스) picker/active/summary screens plus the ready-screen 헬스 button, mirroring
 * [WearWorkoutUiController]'s shape (bind/dispose/onHostResumed/onHostPaused, syncSummary
 * choreography, persist-after-every-mutation). See the plan's "러닝 기능과의 공존 설계" for the
 * mutual-exclusion contract with the run controller.
 *
 * Reworked for the Strong/Hevy-style set checklist: the active screen is now a per-exercise set
 * checklist (see [WearStrengthPagerAdapter]) plus two full-screen overlays this controller owns
 * directly — the set-edit screen ([EditField]-focused, rotary-adjustable) and the rest-timer
 * screen (auto-shown after logging a set, vibrates on completion). Both overlays are UI-only
 * state (`editingCardIdx`/`editingSetIdx`/`editingField`/`restScreenVisible`); only the rest
 * timer's deadline needs to survive process death, and that lives in
 * [WearStrengthSessionState.restEndsAtMs] instead.
 */
class WearStrengthUiController(
    private val handler: Handler,
    private val nowMs: () -> Long = { System.currentTimeMillis() },
) {
    private var state = WearStrengthSessionState()
    private var catalog: WearStrengthCatalog? = null
    private var pickerAdapter: StrengthPickerAdapter? = null
    private var pagerAdapter: WearStrengthPagerAdapter? = null
    private var pager: ViewPager2? = null
    private var pagerCallback: ViewPager2.OnPageChangeCallback? = null
    private var hrUnsubscribe: (() -> Unit)? = null
    private var savedAckUnsubscribe: (() -> Unit)? = null
    private var contextUnsubscribe: (() -> Unit)? = null
    private var pendingTransferId: String? = null
    private var summarySyncStatus = ""
    private var lastHrSnapshot = WearStrengthHrSnapshot()
    private var hostInteractive = true

    // Ambient (AOD) state (plan's W1 앰비언트 슬라이스) — see onEnterAmbient/onUpdateAmbient/onExitAmbient.
    private var ambientActive = false
    private var burnInProtectionRequired = false
    private var ambientBurnInStep = 0
    private var ambientRestWakeRunnable: Runnable? = null

    // Set-edit overlay (UI-level only — never persisted; closing it just hides it, values are
    // already applied live to `state` as the ± buttons/rotary are used).
    private var editingCardIdx: Int? = null
    private var editingSetIdx: Int? = null
    private var editingField: EditField = EditField.KG

    // Rest-timer overlay visibility (UI-level only). The deadline itself
    // (state.restEndsAtMs/restTotalMs) is what's persisted, so a hidden-but-running timer survives
    // a pager swipe, a screen change, or process death.
    private var restScreenVisible: Boolean = false

    /** Invoked at the end of every [render] so the run controller can recompute `runReadyScreen`
     * visibility (only it writes that id — see [WearWorkoutUiController.isStrengthOccupyingScreen]). */
    var onScreenChanged: (View) -> Unit = {}

    private companion object {
        const val TAG = "TomatoWearStrength"
        val VIBRATE_PATTERN_FINISH_VISIBLE = longArrayOf(0, 120, 90, 120)
        val VIBRATE_PATTERN_FINISH_HIDDEN = longArrayOf(0, 140)
    }

    /** Guard used by the run controller to refuse a run start (Health Services allows one session). */
    fun isStrengthActive(): Boolean =
        state.screen == WearStrengthScreen.ACTIVE || state.screen == WearStrengthScreen.PICKER

    /** Broader than [isStrengthActive]: true whenever any strength screen — including summary — is
     * sharing the ready-screen host, so the run controller knows to keep `runReadyScreen` hidden. */
    fun isStrengthOccupyingScreen(): Boolean = state.screen != WearStrengthScreen.IDLE

    fun bind(v: View) {
        catalog = WearStrengthContextStore.load(v.context)
        // The phone's push lands asynchronously, so pick it up while the screen is showing rather
        // than only on the next entry into strength mode.
        contextUnsubscribe?.invoke()
        contextUnsubscribe = WearStrengthContextStore.addListener {
            catalog = WearStrengthContextStore.load(v.context)
            render(v)
        }
        v.findViewById<View>(R.id.strengthOpenButton)?.setOnClickListener { openStrengthMode(v) }
        v.findViewById<View>(R.id.strengthAddExerciseButton)?.setOnClickListener { openPicker(v) }
        v.findViewById<View>(R.id.strengthFinishButton)?.setOnClickListener { finishStrength(v) }
        v.findViewById<View>(R.id.strengthSummaryDoneButton)?.setOnClickListener { completeSummary(v) }

        v.findViewById<View>(R.id.strengthEditConfirmButton)?.setOnClickListener { closeEditScreen(v) }
        v.findViewById<View>(R.id.strengthEditKgRow)?.setOnClickListener { setEditingField(v, EditField.KG) }
        v.findViewById<View>(R.id.strengthEditRepsRow)?.setOnClickListener { setEditingField(v, EditField.REPS) }
        v.findViewById<View>(R.id.strengthEditRirRow)?.setOnClickListener { setEditingField(v, EditField.RIR) }
        v.findViewById<View>(R.id.strengthEditRomRow)?.setOnClickListener { setEditingField(v, EditField.ROM) }
        v.findViewById<View>(R.id.strengthEditKgMinus)?.setOnClickListener { handleEditAdjustKg(v, -1) }
        v.findViewById<View>(R.id.strengthEditKgPlus)?.setOnClickListener { handleEditAdjustKg(v, 1) }
        v.findViewById<View>(R.id.strengthEditRepsMinus)?.setOnClickListener { handleEditAdjustReps(v, -1) }
        v.findViewById<View>(R.id.strengthEditRepsPlus)?.setOnClickListener { handleEditAdjustReps(v, 1) }
        v.findViewById<View>(R.id.strengthEditRirMinus)?.setOnClickListener { handleEditAdjustRir(v, -1) }
        v.findViewById<View>(R.id.strengthEditRirPlus)?.setOnClickListener { handleEditAdjustRir(v, 1) }
        v.findViewById<View>(R.id.strengthEditRomMinus)?.setOnClickListener { handleEditAdjustRom(v, -1) }
        v.findViewById<View>(R.id.strengthEditRomPlus)?.setOnClickListener { handleEditAdjustRom(v, 1) }

        v.findViewById<View>(R.id.strengthRestExtend)?.setOnClickListener { handleExtendRest(v) }
        v.findViewById<View>(R.id.strengthRestSkip)?.setOnClickListener { handleSkipRest(v) }
        v.findViewById<View>(R.id.strengthRestChip)?.setOnClickListener { openRestScreenFromChip(v) }

        bindSavedAck(v)
        initializePicker(v)
        initializePager(v)
        bindRotary(v)
        render(v)
    }

    /**
     * Restores an in-progress strength session persisted before a process death (restoration
     * priority ②, after the run controller's own restore — see the plan's §3). Returns false when
     * there was nothing to restore, so [com.lifestreak.wear.MainActivity] can fall through to the
     * normal ready screen / `prepareRun` warm-up.
     */
    fun restoreIfNeeded(v: View): Boolean {
        val (restoredState, hrSamples) = WearStrengthSessionPersistence.restore(v.context) ?: return false
        if (restoredState.screen == WearStrengthScreen.IDLE) return false
        state = restoredState
        if (state.restEndsAtMs != null && state.restRemainingMs(nowMs()) <= 0L) {
            // Expired while the process was dead: clear it silently, no vibration for time we
            // weren't there to feel.
            state = state.clearRest()
            persist(v)
        }
        WearStrengthHrStore.restoreSamples(hrSamples)
        if (state.screen == WearStrengthScreen.ACTIVE || state.screen == WearStrengthScreen.PICKER) {
            WearStrengthHrService.restore(v.context)
            subscribeHr(v)
        }
        resetPickerToTopLevel()
        render(v)
        if (state.restEndsAtMs != null) scheduleRestTick(v)
        return true
    }

    /** Handles the system back gesture: the edit/rest overlays close first; a picker-with-cards
     * returns to the carousel (plan §5); an empty picker cancels strength mode entirely. Returns
     * false when the run controller/Activity should fall back to default back behavior. */
    fun handleBackPressed(v: View): Boolean {
        if (editingCardIdx != null || editingSetIdx != null) {
            closeEditScreen(v)
            return true
        }
        if (restScreenVisible) {
            restScreenVisible = false
            render(v)
            return true
        }
        if (state.screen != WearStrengthScreen.PICKER) return false
        if (state.cards.isNotEmpty()) {
            state = state.closePicker()
            persist(v)
            render(v)
            return true
        }
        cancelStrengthMode(v)
        return true
    }

    fun dispose() {
        unsubscribeHr()
        savedAckUnsubscribe?.invoke()
        savedAckUnsubscribe = null
        contextUnsubscribe?.invoke()
        contextUnsubscribe = null
        pendingTransferId = null
        pagerCallback?.let { callback -> pager?.unregisterOnPageChangeCallback(callback) }
        pagerCallback = null
        pager = null
        cancelAmbientRestWake()
        handler.removeCallbacksAndMessages(null)
    }

    fun onHostResumed(v: View) {
        hostInteractive = true
        render(v)
    }

    fun onHostPaused(v: View) {
        hostInteractive = false
        v.keepScreenOn = false
    }

    /**
     * Ambient entry (plan's W1): cancels the 1s rest tick (a single delayed wake-up at
     * `restEndsAtMs` takes over so the countdown still refreshes to its finished state without
     * ticking every second), hides the interactive strength screens/overlays, and populates +
     * shows the shared [R.id.wearAmbientScreen] overlay. Skips populating that overlay's content
     * whenever strength itself isn't occupying the host (see [isStrengthOccupyingScreen]) —
     * mirrors [WearWorkoutUiController]'s side of the same mutual-exclusion contract, so only one
     * controller ever writes to the shared ambient text views at a time.
     */
    fun onEnterAmbient(v: View, burnInProtectionRequired: Boolean, lowBitAmbient: Boolean) {
        ambientActive = true
        this.burnInProtectionRequired = burnInProtectionRequired
        ambientBurnInStep = 0
        clearRestTick(v)
        v.findViewById<View>(R.id.strengthPickerScreen)?.visibility = View.GONE
        v.findViewById<View>(R.id.strengthActiveScreen)?.visibility = View.GONE
        v.findViewById<View>(R.id.strengthSummaryScreen)?.visibility = View.GONE
        v.findViewById<View>(R.id.strengthEditScreen)?.visibility = View.GONE
        v.findViewById<View>(R.id.strengthRestScreen)?.visibility = View.GONE
        if (!isStrengthOccupyingScreen()) return
        renderAmbient(v)
        v.findViewById<View>(R.id.wearAmbientScreen)?.visibility = View.VISIBLE
        if (state.restEndsAtMs != null) scheduleAmbientRestWake(v)
    }

    /** Periodic ambient refresh (roughly once a minute, driven by the system): refreshes the
     * ambient text and, when burn-in protection is required, nudges the whole overlay by a small
     * cycling ±8px offset so the same pixels aren't lit for hours on end. */
    fun onUpdateAmbient(v: View) {
        if (!ambientActive || !isStrengthOccupyingScreen()) return
        renderAmbient(v)
        if (burnInProtectionRequired) applyAmbientBurnInOffset(v)
    }

    /** Ambient exit: clears ambient flags, cancels the rest-timer wake-up, hides the overlay,
     * restores the normal interactive render, and re-starts the 1s rest tick if a timer is still
     * running. */
    fun onExitAmbient(v: View) {
        ambientActive = false
        burnInProtectionRequired = false
        ambientBurnInStep = 0
        cancelAmbientRestWake()
        v.findViewById<View>(R.id.wearAmbientScreen)?.apply {
            visibility = View.GONE
            translationX = 0f
            translationY = 0f
        }
        render(v)
        if (state.restEndsAtMs != null) scheduleRestTick(v)
    }

    /** Rest-timer countdown as of ambient entry doesn't need a per-second tick — instead this
     * posts exactly one delayed refresh timed to `restEndsAtMs`, which repaints the ambient text
     * to its finished state (0:00) without waking the screen every second while ambient. */
    private fun scheduleAmbientRestWake(v: View) {
        cancelAmbientRestWake()
        val endsAt = state.restEndsAtMs ?: return
        val delayMs = (endsAt - nowMs()).coerceAtLeast(0L)
        val wake = Runnable {
            if (ambientActive) renderAmbient(v)
        }
        ambientRestWakeRunnable = wake
        handler.postDelayed(wake, delayMs)
    }

    private fun cancelAmbientRestWake() {
        ambientRestWakeRunnable?.let { handler.removeCallbacks(it) }
        ambientRestWakeRunnable = null
    }

    private fun renderAmbient(v: View) {
        v.findViewById<TextView>(R.id.ambientClock)?.text = currentClockText()
        val card = state.activeCard
        if (state.restEndsAtMs != null) {
            val remainingMs = state.restRemainingMs(nowMs())
            val roundedMs = (((remainingMs + 5_000L) / 10_000L) * 10_000L).coerceAtLeast(0L)
            v.findViewById<TextView>(R.id.ambientModeLabel)?.text = "휴식"
            v.findViewById<TextView>(R.id.ambientPrimary)?.text = formatRestClock(roundedMs)
            v.findViewById<TextView>(R.id.ambientSecondary)?.text = card?.name.orEmpty()
        } else {
            val doneCount = card?.sets?.count { it.done } ?: 0
            val totalCount = card?.sets?.size ?: 0
            v.findViewById<TextView>(R.id.ambientModeLabel)?.text = ""
            v.findViewById<TextView>(R.id.ambientPrimary)?.text = "$doneCount/${totalCount}세트"
            v.findViewById<TextView>(R.id.ambientSecondary)?.text = card?.name.orEmpty()
        }
        v.findViewById<TextView>(R.id.ambientTertiary)?.text = ambientHeartRateText()
    }

    private fun ambientHeartRateText(): String {
        val hr = lastHrSnapshot
        return when {
            !hr.hasPermission -> ""
            hr.latestBpm != null -> "${hr.latestBpm} bpm"
            else -> "-- bpm"
        }
    }

    private fun applyAmbientBurnInOffset(v: View) {
        ambientBurnInStep = (ambientBurnInStep + 1) % 4
        val offsetPx = 8f
        val (dx, dy) = when (ambientBurnInStep) {
            0 -> 0f to 0f
            1 -> offsetPx to 0f
            2 -> offsetPx to offsetPx
            else -> 0f to offsetPx
        }
        v.findViewById<View>(R.id.wearAmbientScreen)?.translationX = dx
        v.findViewById<View>(R.id.wearAmbientScreen)?.translationY = dy
    }

    private fun currentClockText(): String {
        return DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.now())
    }

    private fun openStrengthMode(v: View) {
        if (WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) {
            v.findViewById<TextView>(R.id.wearModeGuardStatus)?.text = "러닝 진행 중"
            return
        }
        v.findViewById<TextView>(R.id.wearModeGuardStatus)?.text = ""
        catalog = WearStrengthContextStore.load(v.context)
        WearExerciseService.cancelPreparation(v.context)
        closeOverlays()
        state = state.start(nowMs())
        resetPickerToTopLevel()
        persist(v)
        render(v)
    }

    private fun openPicker(v: View) {
        catalog = WearStrengthContextStore.load(v.context)
        closeOverlays()
        state = state.openPicker()
        resetPickerToTopLevel()
        persist(v)
        render(v)
    }

    private fun cancelStrengthMode(v: View) {
        unsubscribeHr()
        clearRestTick(v)
        closeOverlays()
        WearStrengthHrService.end(v.context)
        WearStrengthSessionPersistence.clear(v.context)
        WearStrengthHrStore.reset()
        lastHrSnapshot = WearStrengthHrSnapshot()
        pendingTransferId = null
        summarySyncStatus = ""
        state = WearStrengthSessionState()
        render(v)
        WearExerciseService.prepareRun(v.context)
    }

    private fun finishStrength(v: View) {
        if (state.totalSets < 1) {
            v.findViewById<TextView>(R.id.strengthActiveStatus)?.text = "완료한 세트가 없어요"
            return
        }
        v.findViewById<TextView>(R.id.strengthActiveStatus)?.text = ""
        closeOverlays()
        state = state.finish(nowMs())
        unsubscribeHr()
        persist(v)
        render(v)
        WearStrengthHrService.end(v.context)
        syncStrengthSummary(v)
    }

    private fun completeSummary(v: View) {
        clearRestTick(v)
        closeOverlays()
        pendingTransferId = null
        summarySyncStatus = ""
        WearStrengthSessionPersistence.clear(v.context)
        WearStrengthHrStore.reset()
        lastHrSnapshot = WearStrengthHrSnapshot()
        state = WearStrengthSessionState()
        render(v)
        WearExerciseService.prepareRun(v.context)
    }

    /** Closes both overlays (edit + rest screen), without touching the running rest timer's
     * deadline in `state` — only its visibility. Used whenever we navigate away from the active
     * checklist screen (picker/summary/cancel), so an overlay doesn't linger stale underneath. */
    private fun closeOverlays() {
        editingCardIdx = null
        editingSetIdx = null
        restScreenVisible = false
    }

    private fun syncStrengthSummary(v: View) {
        summarySyncStatus = "휴대폰에 저장 중"
        render(v)
        val hr = lastHrSnapshot
        WearStrengthPayload.fromSession(
            state.buildSession(),
            hr.avgBpm,
            hr.maxBpm,
            WearStrengthHrStore.samplesForPayload(),
        ).onSuccess { payload ->
            val transferId = WearWorkoutDataLayer.sendStrengthComplete(v.context, payload) { result ->
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
        }.onFailure { error ->
            Log.w(TAG, "Wear strength payload build failed", error)
            summarySyncStatus = "운동을 저장하지 못했어요"
            render(v)
        }
    }

    private fun showSavedAck(v: View, transferId: String) {
        if (transferId != pendingTransferId) return
        pendingTransferId = null
        summarySyncStatus = "휴대폰에 저장했어요"
        render(v)
    }

    private fun bindSavedAck(v: View) {
        savedAckUnsubscribe?.invoke()
        savedAckUnsubscribe = WearWorkoutDataLayer.addSavedListener { transferId ->
            if (transferId != pendingTransferId) return@addSavedListener
            handler.post { showSavedAck(v, transferId) }
        }
    }

    private fun subscribeHr(v: View) {
        hrUnsubscribe?.invoke()
        lastHrSnapshot = WearStrengthHrStore.current()
        hrUnsubscribe = WearStrengthHrStore.addListener { snapshot ->
            lastHrSnapshot = snapshot
            if (hostInteractive) renderHeartRate(v)
        }
    }

    private fun unsubscribeHr() {
        hrUnsubscribe?.invoke()
        hrUnsubscribe = null
    }

    private fun persist(v: View) {
        WearStrengthSessionPersistence.save(v.context, state, WearStrengthHrStore.rawSamples())
    }

    // ---- Checklist row callbacks -------------------------------------------------------------

    /** Pending row -> logs it and starts the rest timer; done row -> undoes it (no rest timer). */
    private fun handleToggleSet(v: View, cardIdx: Int, setIdx: Int) {
        val card = state.cards.getOrNull(cardIdx) ?: return
        val set = card.sets.getOrNull(setIdx) ?: return
        if (set.done) {
            state = state.unlogSet(cardIdx, setIdx)
            persist(v)
            render(v)
            return
        }
        state = state.logSet(cardIdx, setIdx, nowMs()).startRest(nowMs())
        restScreenVisible = true
        persist(v)
        render(v)
        scheduleRestTick(v)
    }

    private fun handleEditSet(v: View, cardIdx: Int, setIdx: Int) {
        val card = state.cards.getOrNull(cardIdx) ?: return
        val set = card.sets.getOrNull(setIdx) ?: return
        if (set.done) return
        editingCardIdx = cardIdx
        editingSetIdx = setIdx
        editingField = EditField.KG
        render(v)
    }

    private fun handleAddSet(v: View, cardIdx: Int) {
        state = state.addPlannedSet(cardIdx)
        persist(v)
        render(v)
    }

    // ---- Set-edit overlay ---------------------------------------------------------------------

    private fun setEditingField(v: View, field: EditField) {
        editingField = field
        renderEditFocus(v)
    }

    private fun handleEditAdjustKg(v: View, delta: Int) = mutateEditingSet(v) { c, s -> updateSetKg(c, s, delta) }
    private fun handleEditAdjustReps(v: View, delta: Int) = mutateEditingSet(v) { c, s -> updateSetReps(c, s, delta) }
    private fun handleEditAdjustRir(v: View, delta: Int) = mutateEditingSet(v) { c, s -> adjustRir(c, s, delta) }
    private fun handleEditAdjustRom(v: View, delta: Int) = mutateEditingSet(v) { c, s -> updateSetRom(c, s, delta) }

    private fun handleEditAdjustFocusedField(v: View, delta: Int) {
        when (editingField) {
            EditField.KG -> handleEditAdjustKg(v, delta)
            EditField.REPS -> handleEditAdjustReps(v, delta)
            EditField.RIR -> handleEditAdjustRir(v, delta)
            EditField.ROM -> handleEditAdjustRom(v, delta)
        }
    }

    private inline fun mutateEditingSet(
        v: View,
        mutation: WearStrengthSessionState.(Int, Int) -> WearStrengthSessionState,
    ) {
        val cardIdx = editingCardIdx ?: return
        val setIdx = editingSetIdx ?: return
        state = state.mutation(cardIdx, setIdx)
        persist(v)
        render(v)
    }

    private fun closeEditScreen(v: View) {
        editingCardIdx = null
        editingSetIdx = null
        render(v)
    }

    // ---- Rest-timer overlay ---------------------------------------------------------------------

    private fun handleExtendRest(v: View) {
        state = state.extendRest()
        persist(v)
        renderRestScreen(v)
    }

    private fun handleSkipRest(v: View) {
        state = state.clearRest()
        restScreenVisible = false
        clearRestTick(v)
        persist(v)
        render(v)
    }

    private fun openRestScreenFromChip(v: View) {
        if (state.restEndsAtMs == null) return
        restScreenVisible = true
        render(v)
    }

    /** Ticks once a second while a rest timer is running (visible or hidden-behind-chip) so the
     * countdown/ring/chip stay live and expiry is detected promptly. Mirrors
     * [WearWorkoutUiController.scheduleRunTick]'s `View`-tag idiom. */
    private fun scheduleRestTick(v: View) {
        clearRestTick(v)
        if (state.restEndsAtMs == null) return
        val tick = object : Runnable {
            override fun run() {
                if (!v.isAttachedToWindow || state.restEndsAtMs == null) return
                if (state.restRemainingMs(nowMs()) <= 0L) {
                    checkRestExpiry(v)
                    return
                }
                if (restScreenVisible) renderRestScreen(v)
                renderRestChip(v)
                handler.postDelayed(this, 1_000L)
            }
        }
        v.setTag(R.id.wear_strength_rest_tick_runnable, tick)
        handler.postDelayed(tick, 1_000L)
    }

    private fun clearRestTick(v: View) {
        val tick = v.getTag(R.id.wear_strength_rest_tick_runnable) as? Runnable ?: return
        handler.removeCallbacks(tick)
        v.setTag(R.id.wear_strength_rest_tick_runnable, null)
    }

    /** A running rest timer just hit zero: clears it, vibrates (double pulse if the rest screen
     * was open — the flagship "time's up" moment — single pulse if it was only running behind the
     * chip), and re-renders (auto-returns to the checklist when the rest screen was visible). */
    private fun checkRestExpiry(v: View) {
        if (state.restEndsAtMs == null) return
        val wasVisible = restScreenVisible
        state = state.clearRest()
        restScreenVisible = false
        persist(v)
        render(v)
        if (wasVisible) vibrate(v.context, VIBRATE_PATTERN_FINISH_VISIBLE) else vibrate(v.context, VIBRATE_PATTERN_FINISH_HIDDEN)
    }

    private fun vibrate(context: Context, pattern: LongArray) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator == null || !vibrator.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Wear strength rest-timer vibration failed", e)
        }
    }

    // ---- Exercise selection / pager wiring ----------------------------------------------------

    private fun selectExercise(v: View, exercise: WearStrengthExercise) {
        val isFirstExercise = state.cards.isEmpty()
        state = state.addExercise(exercise)
        if (isFirstExercise) {
            WearStrengthHrService.start(v.context)
            subscribeHr(v)
        }
        persist(v)
        render(v)
    }

    private fun resetPickerToTopLevel() {
        val cat = catalog
        pickerAdapter?.submitTopLevel(cat?.recentExercises.orEmpty(), cat?.catalogGroups.orEmpty())
    }

    private fun initializePicker(v: View) {
        val list = v.findViewById<WearableRecyclerView>(R.id.strengthPickerList) ?: return
        // Without a layout manager RecyclerView skips layout entirely and the picker draws as a
        // blank screen — the rows are in the adapter, nothing measures them. Deliberately the plain
        // LinearLayoutManager: WearableLinearLayoutManager curves the list on a round screen, which
        // shifts these full-width pill rows sideways until they clip off the right edge.
        if (list.layoutManager == null) {
            list.layoutManager = LinearLayoutManager(list.context)
        }
        val adapter = pickerAdapter ?: StrengthPickerAdapter(
            onExerciseTap = { exercise -> selectExercise(v, exercise) },
            onBackTap = { resetPickerToTopLevel() },
        ).also { pickerAdapter = it }
        if (list.adapter !== adapter) {
            list.adapter = adapter
        }
        resetPickerToTopLevel()
    }

    private fun initializePager(v: View): WearStrengthPagerAdapter? {
        val pagerView = v.findViewById<ViewPager2>(R.id.strengthExercisePager) ?: return null
        val adapter = pagerAdapter ?: WearStrengthPagerAdapter(
            callbacks = object : WearStrengthPagerAdapter.Callbacks {
                override fun onToggleSet(cardIdx: Int, setIdx: Int) = handleToggleSet(v, cardIdx, setIdx)
                override fun onEditSet(cardIdx: Int, setIdx: Int) = handleEditSet(v, cardIdx, setIdx)
                override fun onAddSet(cardIdx: Int) = handleAddSet(v, cardIdx)
            },
            lastRecordLabelFor = { exerciseId -> catalog?.findExercise(exerciseId)?.lastRecordLabel() },
        ).also { pagerAdapter = it }
        if (pagerView.adapter !== adapter) {
            pagerView.adapter = adapter
            pagerView.offscreenPageLimit = 1
        }
        if (pager !== pagerView) {
            pagerCallback?.let { callback -> pager?.unregisterOnPageChangeCallback(callback) }
            pager = pagerView
            pagerCallback = object : ViewPager2.OnPageChangeCallback() {
                override fun onPageSelected(position: Int) {
                    state = state.selectCard(position)
                    persist(v)
                    renderPageDots(v)
                    // Swiping the pager exits the rest screen (the timer itself keeps running in
                    // `state`) — surfaced instead as the top-arc chip.
                    if (restScreenVisible) {
                        restScreenVisible = false
                        v.findViewById<View>(R.id.strengthRestScreen)?.visibility = View.GONE
                        renderRestChip(v)
                    }
                }
            }.also { callback -> pagerView.registerOnPageChangeCallback(callback) }
        }
        return adapter
    }

    /** Bezel/rotary input on the set-edit screen adjusts the currently-focused field (plan
     * requirement: moved off the pager now that kg is no longer directly on the checklist). */
    private fun bindRotary(v: View) {
        val editScreen = v.findViewById<View>(R.id.strengthEditScreen) ?: return
        editScreen.setOnGenericMotionListener { _, event ->
            if (event.action == MotionEvent.ACTION_SCROLL &&
                event.isFromSource(InputDeviceCompat.SOURCE_ROTARY_ENCODER)
            ) {
                val delta = -event.getAxisValue(MotionEventCompat.AXIS_SCROLL)
                when {
                    delta > 0f -> handleEditAdjustFocusedField(v, 1)
                    delta < 0f -> handleEditAdjustFocusedField(v, -1)
                }
                true
            } else {
                false
            }
        }
    }

    // ---- Rendering ------------------------------------------------------------------------------

    private fun render(v: View) {
        if (ambientActive) return
        v.keepScreenOn = hostInteractive && state.screen == WearStrengthScreen.ACTIVE
        v.findViewById<View>(R.id.strengthPickerScreen)?.visibility =
            if (state.screen == WearStrengthScreen.PICKER) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.strengthActiveScreen)?.visibility =
            if (state.screen == WearStrengthScreen.ACTIVE) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.strengthSummaryScreen)?.visibility =
            if (state.screen == WearStrengthScreen.SUMMARY) View.VISIBLE else View.GONE

        val editingVisible = state.screen == WearStrengthScreen.ACTIVE && editingCardIdx != null && editingSetIdx != null
        v.findViewById<View>(R.id.strengthEditScreen)?.visibility = if (editingVisible) View.VISIBLE else View.GONE

        val restVisible = state.screen == WearStrengthScreen.ACTIVE && restScreenVisible && state.restEndsAtMs != null
        v.findViewById<View>(R.id.strengthRestScreen)?.visibility = if (restVisible) View.VISIBLE else View.GONE

        renderPickerEmptyState(v)
        initializePager(v)?.submitCards(state.cards)
        pager?.let { pg ->
            if (state.activeCardIndex in state.cards.indices && pg.currentItem != state.activeCardIndex) {
                pg.setCurrentItem(state.activeCardIndex, false)
            }
        }
        renderPageDots(v)
        renderHeartRate(v)
        renderSummaryScreen(v)
        if (editingVisible) renderEditScreen(v)
        renderRestScreen(v)
        renderRestChip(v)

        onScreenChanged(v)
    }

    private fun renderPickerEmptyState(v: View) {
        val cat = catalog
        val hasCatalog = cat != null && (cat.catalogGroups.isNotEmpty() || cat.recentExercises.isNotEmpty())
        v.findViewById<View>(R.id.strengthContextEmptyView)?.visibility =
            if (state.screen == WearStrengthScreen.PICKER && !hasCatalog) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.strengthPickerList)?.visibility =
            if (state.screen == WearStrengthScreen.PICKER && hasCatalog) View.VISIBLE else View.GONE
    }

    private fun renderPageDots(v: View) {
        val container = v.findViewById<LinearLayout>(R.id.strengthPageDots) ?: return
        val count = state.cards.size
        if (container.childCount != count) {
            container.removeAllViews()
            repeat(count) { container.addView(View(v.context)) }
        }
        val activeSize = v.resources.getDimensionPixelSize(R.dimen.strength_page_dot_active_size)
        val inactiveSize = v.resources.getDimensionPixelSize(R.dimen.strength_page_dot_size)
        val gap = v.resources.getDimensionPixelSize(R.dimen.strength_page_dot_gap)
        for (index in 0 until count) {
            val dot = container.getChildAt(index) ?: continue
            val isActive = index == state.activeCardIndex
            val size = if (isActive) activeSize else inactiveSize
            val params = LinearLayout.LayoutParams(size, size)
            params.marginStart = if (index == 0) 0 else gap
            dot.layoutParams = params
            dot.setBackgroundResource(
                if (isActive) R.drawable.wear_strength_dot_active else R.drawable.wear_strength_dot_inactive,
            )
        }
    }

    private fun renderHeartRate(v: View) {
        val hr = lastHrSnapshot
        v.findViewById<TextView>(R.id.strengthLiveHeartRate)?.text = when {
            !hr.hasPermission -> "심박 없이 기록 중"
            hr.latestBpm != null -> "${hr.latestBpm} bpm"
            else -> "-- bpm"
        }
    }

    private fun renderSummaryScreen(v: View) {
        val exerciseCount = state.cards.count { it.loggedSets.isNotEmpty() }
        val durationMs = ((state.endedAt ?: state.startedAt) - state.startedAt).coerceAtLeast(0L)
        v.findViewById<TextView>(R.id.strengthSummaryDuration)?.text = formatDuration(durationMs)
        v.findViewById<TextView>(R.id.strengthSummaryExerciseCount)?.text = "${exerciseCount}종목"
        v.findViewById<TextView>(R.id.strengthSummarySetCount)?.text = "${state.totalSets}세트"
        v.findViewById<TextView>(R.id.strengthSummaryVolume)?.text = "볼륨 ${formatVolumeKg(state.totalVolumeKg)}kg"

        val hr = lastHrSnapshot
        val hrView = v.findViewById<TextView>(R.id.strengthSummaryHeartRate)
        if (hr.avgBpm != null || hr.maxBpm != null) {
            hrView?.visibility = View.VISIBLE
            hrView?.text = "♥ 평균 ${hr.avgBpm ?: "--"} · 최고 ${hr.maxBpm ?: "--"}"
        } else {
            hrView?.visibility = View.GONE
        }
        v.findViewById<TextView>(R.id.strengthSummarySyncStatus)?.text = summarySyncStatus
    }

    private fun renderEditScreen(v: View) {
        val cardIdx = editingCardIdx
        val setIdx = editingSetIdx
        val card = cardIdx?.let { state.cards.getOrNull(it) }
        val set = if (card != null && setIdx != null) card.sets.getOrNull(setIdx) else null
        if (cardIdx == null || setIdx == null || card == null || set == null) {
            editingCardIdx = null
            editingSetIdx = null
            return
        }
        v.findViewById<TextView>(R.id.strengthEditSetLabel)?.text = "${setIdx + 1}세트"
        v.findViewById<TextView>(R.id.strengthEditKgValue)?.text = "${formatStrengthKg(set.kg)}kg"
        v.findViewById<TextView>(R.id.strengthEditRepsValue)?.text = "${set.reps}회"
        v.findViewById<TextView>(R.id.strengthEditRirValue)?.text = set.rir?.toString() ?: "–"
        v.findViewById<TextView>(R.id.strengthEditRomValue)?.text = "${set.romPct}%"
        renderEditFocus(v)
    }

    /** Highlights the currently rotary-focused row's value in lime; the rest stay the default
     * prominent white. Only text color changes — no rebind of the numbers themselves. */
    private fun renderEditFocus(v: View) {
        val focusColor = Color.parseColor("#D7FF3F")
        val normalColor = Color.parseColor("#F7F8F4")
        val valueIdsByField = mapOf(
            EditField.KG to R.id.strengthEditKgValue,
            EditField.REPS to R.id.strengthEditRepsValue,
            EditField.RIR to R.id.strengthEditRirValue,
            EditField.ROM to R.id.strengthEditRomValue,
        )
        valueIdsByField.forEach { (field, id) ->
            v.findViewById<TextView>(id)?.setTextColor(if (field == editingField) focusColor else normalColor)
        }
    }

    private fun renderRestScreen(v: View) {
        if (state.restEndsAtMs == null) return
        val remaining = state.restRemainingMs(nowMs())
        v.findViewById<TextView>(R.id.strengthRestCountdown)?.text = formatRestClock(remaining)
        (v.findViewById<View>(R.id.strengthRestRing) as? WearStrengthRestRingView)?.setProgress(remaining, state.restTotalMs)
        v.findViewById<TextView>(R.id.strengthRestNextPreview)?.text = nextSetPreviewLabel()
    }

    private fun renderRestChip(v: View) {
        val chip = v.findViewById<TextView>(R.id.strengthRestChip) ?: return
        val showChip = state.screen == WearStrengthScreen.ACTIVE && state.restEndsAtMs != null && !restScreenVisible
        chip.visibility = if (showChip) View.VISIBLE else View.GONE
        if (showChip) {
            chip.text = "휴식 ${formatRestClock(state.restRemainingMs(nowMs()))}"
        }
    }

    /** "다음: 2세트 80kg×8" for the currently-visible page's next pending row, or "" when there is
     * none (shouldn't normally happen — [WearStrengthSessionState.logSet] always leaves a pending
     * row on offer). */
    private fun nextSetPreviewLabel(): String {
        val cardIdx = pager?.currentItem?.takeIf { it in state.cards.indices } ?: state.activeCardIndex
        val card = state.cards.getOrNull(cardIdx) ?: return ""
        val nextIdx = card.sets.indexOfFirst { !it.done }
        val nextSet = card.sets.getOrNull(nextIdx) ?: return ""
        return "다음: ${nextIdx + 1}세트 ${formatStrengthKg(nextSet.kg)}kg×${nextSet.reps}"
    }

    private fun formatRestClock(remainingMs: Long): String {
        val totalSeconds = (remainingMs / 1_000L).coerceAtLeast(0L)
        val minutes = totalSeconds / 60L
        val seconds = totalSeconds % 60L
        return "%d:%02d".format(minutes, seconds)
    }

    /** e.g. `12480.5` -> `"12,480.5"`. Thousands-grouped so the summary volume line never runs
     * long enough to clip the round safe area at realistic values. */
    private fun formatVolumeKg(kg: Double): String {
        val raw = formatStrengthKg(kg)
        val dotIndex = raw.indexOf('.')
        val intPart = if (dotIndex >= 0) raw.substring(0, dotIndex) else raw
        val fractionPart = if (dotIndex >= 0) raw.substring(dotIndex) else ""
        val grouped = intPart.reversed().chunked(3).joinToString(",").reversed()
        return grouped + fractionPart
    }
}

/**
 * Two-level picker adapter: top level shows "최근" quick-access rows (max [MAX_RECENT_ROWS]) then
 * muscle-group rows; tapping a group swaps in that group's exercise rows with a back row on top.
 * A single adapter instance owns both levels (per the plan's Phase 4 wording) so the
 * [androidx.wear.widget.WearableRecyclerView]'s rotary/curved-scroll behavior is never re-attached.
 */
private class StrengthPickerAdapter(
    private val onExerciseTap: (WearStrengthExercise) -> Unit,
    private val onBackTap: () -> Unit,
) : RecyclerView.Adapter<StrengthPickerAdapter.RowHolder>() {

    private sealed class Row {
        data class Header(val label: String) : Row()
        data class Recent(val exercise: WearStrengthExercise) : Row()
        data class Group(val group: WearStrengthMuscleGroup) : Row()
        object Back : Row()
        data class Exercise(val exercise: WearStrengthExercise) : Row()
    }

    private var rows: List<Row> = emptyList()

    fun submitTopLevel(recent: List<WearStrengthExercise>, groups: List<WearStrengthMuscleGroup>) {
        val nextRows = mutableListOf<Row>()
        if (recent.isNotEmpty()) {
            nextRows.add(Row.Header("최근"))
            recent.take(MAX_RECENT_ROWS).forEach { nextRows.add(Row.Recent(it)) }
        }
        groups.forEach { nextRows.add(Row.Group(it)) }
        rows = nextRows
        notifyDataSetChanged()
    }

    /** Drills into [group]'s exercise list with a back row on top — entirely adapter-local state;
     * the controller only ever learns about exercise taps ([onExerciseTap]) or a back tap that
     * bubbles past the group level ([onBackTap]). */
    private fun enterGroup(group: WearStrengthMuscleGroup) {
        val nextRows = mutableListOf<Row>(Row.Back)
        group.exercises.forEach { nextRows.add(Row.Exercise(it)) }
        rows = nextRows
        notifyDataSetChanged()
    }

    override fun getItemCount(): Int = rows.size

    override fun getItemViewType(position: Int): Int = when (rows[position]) {
        is Row.Header -> VIEW_TYPE_HEADER
        is Row.Group, is Row.Back -> VIEW_TYPE_GROUP
        is Row.Recent, is Row.Exercise -> VIEW_TYPE_EXERCISE
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RowHolder {
        val layoutRes = when (viewType) {
            VIEW_TYPE_HEADER -> R.layout.wear_strength_picker_row_header
            VIEW_TYPE_GROUP -> R.layout.wear_strength_picker_row_group
            else -> R.layout.wear_strength_picker_row_exercise
        }
        val view = LayoutInflater.from(parent.context).inflate(layoutRes, parent, false)
        return RowHolder(view)
    }

    override fun onBindViewHolder(holder: RowHolder, position: Int) {
        when (val row = rows[position]) {
            is Row.Header -> {
                holder.itemView.findViewById<TextView>(R.id.strengthPickerRowHeaderLabel)?.text = row.label
                holder.itemView.setOnClickListener(null)
            }
            is Row.Group -> bindGroupRow(holder.itemView, icon = "●", label = row.group.muscleName) {
                enterGroup(row.group)
            }
            Row.Back -> bindGroupRow(holder.itemView, icon = "‹", label = "부위 목록") {
                onBackTap()
            }
            is Row.Recent -> bindExerciseRow(holder.itemView, row.exercise)
            is Row.Exercise -> bindExerciseRow(holder.itemView, row.exercise)
        }
    }

    private fun bindGroupRow(view: View, icon: String, label: String, onTap: () -> Unit) {
        view.findViewById<TextView>(R.id.strengthPickerRowGroupIcon)?.text = icon
        view.findViewById<TextView>(R.id.strengthPickerRowGroupName)?.text = label
        view.setOnClickListener { onTap() }
    }

    private fun bindExerciseRow(view: View, exercise: WearStrengthExercise) {
        view.findViewById<TextView>(R.id.strengthPickerRowExerciseName)?.text = exercise.name
        val topSet = exercise.lastSession?.topSet()
        view.findViewById<TextView>(R.id.strengthPickerRowExerciseBadge)?.text =
            if (topSet != null) "${formatStrengthKg(topSet.kg)}kg×${topSet.reps}" else ""
        view.setOnClickListener { onExerciseTap(exercise) }
    }

    class RowHolder(itemView: View) : RecyclerView.ViewHolder(itemView)

    private companion object {
        const val VIEW_TYPE_HEADER = 0
        const val VIEW_TYPE_GROUP = 1
        const val VIEW_TYPE_EXERCISE = 2
        const val MAX_RECENT_ROWS = 8
    }
}
