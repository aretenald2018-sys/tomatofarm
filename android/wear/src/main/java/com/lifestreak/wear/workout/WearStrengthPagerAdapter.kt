package com.lifestreak.wear.workout

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.lifestreak.wear.R

/**
 * ViewPager2 adapter for the strength-workout carousel: one `wear_strength_page_exercise` page
 * per [WearStrengthCard], each page a Strong/Hevy-style *set checklist* rather than a single-set
 * editor. `strengthCardSetList` is a plain `LinearLayout` (not a nested RecyclerView — the
 * per-workout row count realistically stays under ~15, so rebuilding it on every bind is cheap
 * and avoids nested-scrolling friction against the outer ViewPager2) whose children are rebuilt
 * from [WearStrengthCard.sets] plus a trailing "+ 세트 추가" row on every bind.
 *
 * Row taps route straight to the *card index this page is bound to* (passed into every callback
 * below), not to [WearStrengthSessionState.activeCardIndex] — unlike the old single-set-per-card
 * design, a row's identity is the (cardIdx, setIdx) pair the adapter already knows when it builds
 * the row, so there is no need to go through "the active card".
 */
class WearStrengthPagerAdapter(
    private val callbacks: Callbacks,
    private val lastRecordLabelFor: (String) -> String?,
) : RecyclerView.Adapter<WearStrengthPagerAdapter.CardViewHolder>() {

    interface Callbacks {
        /** Pending row -> logs it (then the caller starts the rest timer); done row -> undoes it. */
        fun onToggleSet(cardIdx: Int, setIdx: Int)

        /** Tapping the *values* area of a still-pending row opens the edit screen for it. */
        fun onEditSet(cardIdx: Int, setIdx: Int)

        /** The trailing "+ 세트 추가" row. */
        fun onAddSet(cardIdx: Int)

        /** The 지난 기록 strip — replaces this card's rows with the previous session's sets. */
        fun onCopyPreviousSets(cardIdx: Int)
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
        return CardViewHolder(view)
    }

    override fun onBindViewHolder(holder: CardViewHolder, position: Int) {
        holder.bind(position, cards[position], callbacks, lastRecordLabelFor)
    }

    class CardViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val setList = itemView.findViewById<LinearLayout>(R.id.strengthCardSetList)

        fun bind(
            cardIdx: Int,
            card: WearStrengthCard,
            callbacks: Callbacks,
            lastRecordLabelFor: (String) -> String?,
        ) {
            itemView.findViewById<TextView>(R.id.strengthCardExerciseName)?.text = card.name

            // The whole 지난 기록 strip is the copy button, same as the phone's card. Hidden outright
            // when the exercise has no previous session, so it never offers a no-op tap.
            val label = lastRecordLabelFor(card.exerciseId)
            itemView.findViewById<TextView>(R.id.strengthCardLastRecord)?.apply {
                text = label.orEmpty()
                visibility = if (label != null) View.VISIBLE else View.GONE
                isClickable = label != null
                contentDescription = label?.let { "$it, 전체 세트 복사" }
                setOnClickListener(
                    if (label != null) View.OnClickListener { callbacks.onCopyPreviousSets(cardIdx) } else null,
                )
            }

            val list = setList ?: return
            list.removeAllViews()
            val inflater = LayoutInflater.from(list.context)
            card.sets.forEachIndexed { setIdx, set ->
                val row = inflater.inflate(R.layout.wear_strength_set_row, list, false)
                bindSetRow(row, cardIdx, setIdx, set, callbacks)
                list.addView(row)
            }
            val addRow = inflater.inflate(R.layout.wear_strength_set_row_add, list, false)
            addRow.setOnClickListener { callbacks.onAddSet(cardIdx) }
            list.addView(addRow)
        }

        private fun bindSetRow(
            row: View,
            cardIdx: Int,
            setIdx: Int,
            set: PlannedSet,
            callbacks: Callbacks,
        ) {
            row.findViewById<TextView>(R.id.setRowIndex)?.text = (setIdx + 1).toString()
            val valuesView = row.findViewById<TextView>(R.id.setRowValues)
            valuesView?.text = "${formatStrengthKg(set.kg)}kg × ${set.reps}회"
            val checkView = row.findViewById<TextView>(R.id.setRowCheck)
            if (set.done) {
                valuesView?.setTextColor(Color.parseColor(COLOR_MUTED))
                checkView?.text = "✓"
                checkView?.setTextColor(Color.parseColor(COLOR_CHECK_GLYPH))
                checkView?.setBackgroundResource(R.drawable.wear_cardio_circle_primary)
            } else {
                valuesView?.setTextColor(Color.parseColor(COLOR_PROMINENT))
                checkView?.text = ""
                checkView?.setBackgroundResource(R.drawable.wear_cardio_circle_muted)
            }
            checkView?.setOnClickListener { callbacks.onToggleSet(cardIdx, setIdx) }
            valuesView?.setOnClickListener {
                if (!set.done) callbacks.onEditSet(cardIdx, setIdx)
            }
        }

        private companion object {
            const val COLOR_MUTED = "#81877D"
            const val COLOR_PROMINENT = "#F7F8F4"
            const val COLOR_CHECK_GLYPH = "#06120C"
        }
    }
}

/** e.g. `82.5` -> `"82.5"`, `80.0` -> `"80"`. Shared with [WearStrengthUiController]'s summary text. */
internal fun formatStrengthKg(kg: Double): String {
    val rounded = Math.round(kg * 10.0) / 10.0
    return if (rounded == Math.floor(rounded)) rounded.toLong().toString() else rounded.toString()
}
