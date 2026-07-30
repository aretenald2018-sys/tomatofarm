package com.lifestreak.wear.workout

import android.os.Handler
import android.util.Log
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.InputDeviceCompat
import androidx.core.view.MotionEventCompat
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import androidx.wear.widget.WearableRecyclerView
import com.lifestreak.wear.R

/**
 * Owns the strength (헬스) picker/active/summary screens plus the ready-screen 헬스 button, mirroring
 * [WearWorkoutUiController]'s shape (bind/dispose/onHostResumed/onHostPaused, syncSummary
 * choreography, persist-after-every-mutation). See the plan's "러닝 기능과의 공존 설계" for the
 * mutual-exclusion contract with the run controller and "44mm 대화면 최적화" for the screen layout
 * this binds against.
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
    private var pendingTransferId: String? = null
    private var summarySyncStatus = ""
    private var lastHrSnapshot = WearStrengthHrSnapshot()
    private var hostInteractive = true

    /** Invoked at the end of every [render] so the run controller can recompute `runReadyScreen`
     * visibility (only it writes that id — see [WearWorkoutUiController.isStrengthOccupyingScreen]). */
    var onScreenChanged: (View) -> Unit = {}

    private companion object {
        const val TAG = "TomatoWearStrength"
    }

    /** Guard used by the run controller to refuse a run start (Health Services allows one session). */
    fun isStrengthActive(): Boolean =
        state.screen == WearStrengthScreen.ACTIVE || state.screen == WearStrengthScreen.PICKER

    /** Broader than [isStrengthActive]: true whenever any strength screen — including summary — is
     * sharing the ready-screen host, so the run controller knows to keep `runReadyScreen` hidden. */
    fun isStrengthOccupyingScreen(): Boolean = state.screen != WearStrengthScreen.IDLE

    fun bind(v: View) {
        catalog = WearStrengthContextStore.load(v.context)
        v.findViewById<View>(R.id.strengthOpenButton)?.setOnClickListener { openStrengthMode(v) }
        v.findViewById<View>(R.id.strengthAddExerciseButton)?.setOnClickListener { openPicker(v) }
        v.findViewById<View>(R.id.strengthFinishButton)?.setOnClickListener { finishStrength(v) }
        v.findViewById<View>(R.id.strengthSummaryDoneButton)?.setOnClickListener { completeSummary(v) }
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
        WearStrengthHrStore.restoreSamples(hrSamples)
        if (state.screen == WearStrengthScreen.ACTIVE || state.screen == WearStrengthScreen.PICKER) {
            WearStrengthHrService.restore(v.context)
            subscribeHr(v)
        }
        resetPickerToTopLevel()
        render(v)
        return true
    }

    /** Handles the system back gesture: picker-with-cards returns to the carousel (plan §5); an
     * empty picker cancels strength mode entirely. Returns false when the run controller/Activity
     * should fall back to default back behavior. */
    fun handleBackPressed(v: View): Boolean {
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
        pendingTransferId = null
        pagerCallback?.let { callback -> pager?.unregisterOnPageChangeCallback(callback) }
        pagerCallback = null
        pager = null
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

    private fun openStrengthMode(v: View) {
        if (WearExerciseSessionStore.current().status != WearExerciseSessionStatus.IDLE) {
            v.findViewById<TextView>(R.id.wearModeGuardStatus)?.text = "러닝 진행 중"
            return
        }
        v.findViewById<TextView>(R.id.wearModeGuardStatus)?.text = ""
        catalog = WearStrengthContextStore.load(v.context)
        WearExerciseService.cancelPreparation(v.context)
        state = state.start(nowMs())
        resetPickerToTopLevel()
        persist(v)
        render(v)
    }

    private fun openPicker(v: View) {
        catalog = WearStrengthContextStore.load(v.context)
        state = state.openPicker()
        resetPickerToTopLevel()
        persist(v)
        render(v)
    }

    private fun cancelStrengthMode(v: View) {
        unsubscribeHr()
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
        state = state.finish(nowMs())
        unsubscribeHr()
        persist(v)
        render(v)
        WearStrengthHrService.end(v.context)
        syncStrengthSummary(v)
    }

    private fun completeSummary(v: View) {
        pendingTransferId = null
        summarySyncStatus = ""
        WearStrengthSessionPersistence.clear(v.context)
        WearStrengthHrStore.reset()
        lastHrSnapshot = WearStrengthHrSnapshot()
        state = WearStrengthSessionState()
        render(v)
        WearExerciseService.prepareRun(v.context)
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

    private fun handleAdjustKg(v: View, delta: Int) = mutateActiveCard(v) { adjustKg(delta) }
    private fun handleAdjustReps(v: View, delta: Int) = mutateActiveCard(v) { adjustReps(delta) }
    private fun handleAdjustRom(v: View, delta: Int) = mutateActiveCard(v) { adjustRom(delta) }
    private fun handleCompleteSet(v: View) = mutateActiveCard(v) { completeSet(nowMs()) }
    private fun handleUndoLastSet(v: View) = mutateActiveCard(v) { undoLastSet() }

    private inline fun mutateActiveCard(
        v: View,
        mutation: WearStrengthSessionState.() -> WearStrengthSessionState,
    ) {
        state = state.mutation()
        persist(v)
        render(v)
    }

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
                override fun onAdjustKg(delta: Int) = handleAdjustKg(v, delta)
                override fun onAdjustReps(delta: Int) = handleAdjustReps(v, delta)
                override fun onAdjustRom(delta: Int) = handleAdjustRom(v, delta)
                override fun onCompleteSet() = handleCompleteSet(v)
                override fun onUndoLastSet() = handleUndoLastSet(v)
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
                }
            }.also { callback -> pagerView.registerOnPageChangeCallback(callback) }
        }
        return adapter
    }

    /** Bezel/rotary input on the active carousel adjusts kg on the active card (plan requirement). */
    private fun bindRotary(v: View) {
        val pagerView = v.findViewById<View>(R.id.strengthExercisePager) ?: return
        pagerView.setOnGenericMotionListener { _, event ->
            if (event.action == MotionEvent.ACTION_SCROLL &&
                event.isFromSource(InputDeviceCompat.SOURCE_ROTARY_ENCODER)
            ) {
                val delta = -event.getAxisValue(MotionEventCompat.AXIS_SCROLL)
                when {
                    delta > 0f -> handleAdjustKg(v, 1)
                    delta < 0f -> handleAdjustKg(v, -1)
                }
                true
            } else {
                false
            }
        }
    }

    private fun render(v: View) {
        v.keepScreenOn = hostInteractive && state.screen == WearStrengthScreen.ACTIVE
        v.findViewById<View>(R.id.strengthPickerScreen)?.visibility =
            if (state.screen == WearStrengthScreen.PICKER) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.strengthActiveScreen)?.visibility =
            if (state.screen == WearStrengthScreen.ACTIVE) View.VISIBLE else View.GONE
        v.findViewById<View>(R.id.strengthSummaryScreen)?.visibility =
            if (state.screen == WearStrengthScreen.SUMMARY) View.VISIBLE else View.GONE

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
        v.findViewById<TextView>(R.id.strengthSummaryStats)?.text =
            "${exerciseCount}종목 · ${state.totalSets}세트 · ${formatStrengthKg(state.totalVolumeKg)}kg"
        val hr = lastHrSnapshot
        v.findViewById<TextView>(R.id.strengthSummaryHeartRate)?.text =
            "${hr.avgBpm ?: "--"} / ${hr.maxBpm ?: "--"} bpm"
        v.findViewById<TextView>(R.id.strengthSummarySyncStatus)?.text = summarySyncStatus
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
