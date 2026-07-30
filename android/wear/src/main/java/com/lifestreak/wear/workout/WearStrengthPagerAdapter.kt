package com.lifestreak.wear.workout

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.lifestreak.wear.R

/**
 * ViewPager2 adapter for the strength-workout carousel: one `wear_strength_page_exercise` card
 * per [WearStrengthCard] (see the plan's Phase 4 / "44mm 대화면 최적화" sections). Mirrors
 * [WearRunMetricPagerAdapter]'s inflate/bind shape, but each item *is* a card rather than a fixed
 * metric page, so a full [submitCards] + `notifyDataSetChanged` on every mutation is simplest and
 * cheap at the small card counts a watch workout realistically reaches.
 *
 * All button/long-press callbacks act on the *active* card (`WearStrengthSessionState.
 * activeCardIndex`), not on this holder's bound position: [WearStrengthUiController] keeps
 * `activeCardIndex` in sync with the visible page via the ViewPager2 page-change callback before
 * any of these can fire, so routing through the session state directly is correct and avoids
 * plumbing position into every callback.
 */
class WearStrengthPagerAdapter(
    private val callbacks: Callbacks,
    private val lastRecordLabelFor: (String) -> String?,
) : RecyclerView.Adapter<WearStrengthPagerAdapter.CardViewHolder>() {

    interface Callbacks {
        fun onAdjustKg(delta: Int)
        fun onAdjustReps(delta: Int)
        fun onAdjustRom(delta: Int)
        fun onCompleteSet()
        fun onUndoLastSet()
    }

    private var cards: List<WearStrengthCard> = emptyList()

    /** Full rebind on every session mutation — acceptable at watch-workout card counts. */
    fun submitCards(nextCards: List<WearStrengthCard>) {
        cards = nextCards
        notifyDataSetChanged()
    }

    override fun getItemCount(): Int = cards.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CardViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.wear_strength_page_exercise, parent, false)
        return CardViewHolder(view, callbacks)
    }

    override fun onBindViewHolder(holder: CardViewHolder, position: Int) {
        holder.bind(cards[position], lastRecordLabelFor)
    }

    class CardViewHolder(
        itemView: View,
        private val callbacks: Callbacks,
    ) : RecyclerView.ViewHolder(itemView) {
        init {
            itemView.findViewById<View>(R.id.strengthCardKgMinus)
                ?.setOnClickListener { callbacks.onAdjustKg(-1) }
            itemView.findViewById<View>(R.id.strengthCardKgPlus)
                ?.setOnClickListener { callbacks.onAdjustKg(1) }
            itemView.findViewById<View>(R.id.strengthCardRepsMinus)
                ?.setOnClickListener { callbacks.onAdjustReps(-1) }
            itemView.findViewById<View>(R.id.strengthCardRepsPlus)
                ?.setOnClickListener { callbacks.onAdjustReps(1) }
            itemView.findViewById<View>(R.id.strengthCardRomMinus)
                ?.setOnClickListener { callbacks.onAdjustRom(-1) }
            itemView.findViewById<View>(R.id.strengthCardRomPlus)
                ?.setOnClickListener { callbacks.onAdjustRom(1) }
            itemView.findViewById<View>(R.id.strengthCardCompleteButton)
                ?.setOnClickListener { callbacks.onCompleteSet() }
            itemView.findViewById<View>(R.id.strengthCardSetCounter)
                ?.setOnLongClickListener {
                    callbacks.onUndoLastSet()
                    true
                }
        }

        fun bind(card: WearStrengthCard, lastRecordLabelFor: (String) -> String?) {
            itemView.findViewById<TextView>(R.id.strengthCardExerciseName)?.text = card.name
            itemView.findViewById<TextView>(R.id.strengthCardLastRecord)?.text =
                lastRecordLabelFor(card.exerciseId).orEmpty()
            itemView.findViewById<TextView>(R.id.strengthCardSetCounter)?.text =
                "${card.loggedSets.size}세트"
            itemView.findViewById<TextView>(R.id.strengthCardKgValue)?.text =
                "${formatStrengthKg(card.draftKg)}kg"
            itemView.findViewById<TextView>(R.id.strengthCardRepsValue)?.text =
                "${card.draftReps}회"
            itemView.findViewById<TextView>(R.id.strengthCardRomValue)?.text =
                "ROM ${card.draftRomPct}%"
            itemView.findViewById<TextView>(R.id.strengthCardLoggedTrail)?.text =
                card.loggedSets.takeLast(2).joinToString(" · ") { set ->
                    "${formatStrengthKg(set.kg)}×${set.reps}"
                }
        }
    }
}

/** e.g. `82.5` -> `"82.5"`, `80.0` -> `"80"`. Shared with [WearStrengthUiController]'s summary text. */
internal fun formatStrengthKg(kg: Double): String {
    val rounded = Math.round(kg * 10.0) / 10.0
    return if (rounded == Math.floor(rounded)) rounded.toLong().toString() else rounded.toString()
}
