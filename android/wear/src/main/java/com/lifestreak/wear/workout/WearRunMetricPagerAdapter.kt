package com.lifestreak.wear.workout

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.lifestreak.wear.R

class WearRunMetricPagerAdapter : RecyclerView.Adapter<WearRunMetricPagerAdapter.PageViewHolder>() {
    private var snapshot: WearRunUiSnapshot? = null
    private var attachedRecyclerView: RecyclerView? = null

    fun submitSnapshot(nextSnapshot: WearRunUiSnapshot, activePage: Int) {
        if (snapshot == nextSnapshot) return
        snapshot = nextSnapshot
        bindOrNotify(activePage)
    }

    fun refreshPage(position: Int) {
        bindOrNotify(position)
    }

    override fun onAttachedToRecyclerView(recyclerView: RecyclerView) {
        super.onAttachedToRecyclerView(recyclerView)
        attachedRecyclerView = recyclerView
    }

    override fun onDetachedFromRecyclerView(recyclerView: RecyclerView) {
        if (attachedRecyclerView === recyclerView) attachedRecyclerView = null
        super.onDetachedFromRecyclerView(recyclerView)
    }

    private fun bindOrNotify(position: Int) {
        val page = position.coerceIn(0, PAGE_COUNT - 1)
        val holder = attachedRecyclerView
            ?.findViewHolderForAdapterPosition(page) as? PageViewHolder
        if (holder != null) {
            holder.bind(page, snapshot)
        } else {
            notifyItemChanged(page)
        }
    }

    override fun getItemCount(): Int = PAGE_COUNT

    override fun getItemViewType(position: Int): Int = PAGE_LAYOUTS[position]

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PageViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(viewType, parent, false)
        return PageViewHolder(view)
    }

    override fun onBindViewHolder(holder: PageViewHolder, position: Int) {
        holder.bind(position, snapshot)
    }

    class PageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        fun bind(position: Int, snapshot: WearRunUiSnapshot?) {
            if (snapshot == null) return
            when (position) {
                PAGE_SUMMARY -> bindSummary(snapshot)
                PAGE_PACE -> bindPace(snapshot)
                PAGE_HEART -> bindHeart(snapshot)
                PAGE_HEART_ZONES -> bindHeartZones(snapshot)
                PAGE_ROUTE -> bindRoute(snapshot)
            }
        }

        private fun bindSummary(snapshot: WearRunUiSnapshot) {
            itemView.findViewById<TextView>(R.id.runSummaryPageDistance)?.text = snapshot.distanceSummaryText
            itemView.findViewById<TextView>(R.id.runSummaryPageDuration)?.text = snapshot.durationText
            itemView.findViewById<TextView>(R.id.runSummaryPagePace)?.text = snapshot.averagePaceText.asPaceLabel()
            itemView.findViewById<TextView>(R.id.runSummaryPageHeartRate)?.text = snapshot.heartRateText
        }

        private fun bindPace(snapshot: WearRunUiSnapshot) {
            // W5c current-pace slice: the primary (largest) value on this page is now the rolling
            // current pace; average/fastest stay as the secondary row below it.
            itemView.findViewById<TextView>(R.id.runPaceCurrent)?.text = snapshot.currentPaceText
            itemView.findViewById<TextView>(R.id.runPaceAverage)?.text = snapshot.averagePaceText
            itemView.findViewById<TextView>(R.id.runPaceFastest)?.text = snapshot.fastestPaceText
            itemView.findViewById<WearRunPaceGraphView>(R.id.runPaceGraph)
                ?.setTrend(snapshot.paceTrend)
        }

        private fun bindHeart(snapshot: WearRunUiSnapshot) {
            itemView.findViewById<TextView>(R.id.runHeartAverage)?.text =
                snapshot.averageHeartRateBpm?.let { "$it bpm" } ?: snapshot.heartRateText
            itemView.findViewById<TextView>(R.id.runHeartMax)?.text =
                snapshot.maxHeartRateBpm?.let { "$it bpm" } ?: "-- bpm"
            itemView.findViewById<WearRunHeartGraphView>(R.id.runHeartGraph)
                ?.setTrend(snapshot.heartRateTrend)
        }

        private fun bindHeartZones(snapshot: WearRunUiSnapshot) {
            itemView.findViewById<WearRunHeartZonesView>(R.id.runHeartZonesGraph)
                ?.setZoneRows(snapshot.heartZoneRows)
        }

        private fun bindRoute(snapshot: WearRunUiSnapshot) {
            itemView.findViewById<WearRunLiveRouteMapView>(R.id.runRouteMap)
                ?.setRouteProjection(snapshot.routeProjection)
            itemView.findViewById<TextView>(R.id.runRouteCoordinate)?.text =
                "내 경로"
        }
    }

    companion object {
        const val PAGE_COUNT = 5
        private const val PAGE_SUMMARY = 0
        private const val PAGE_PACE = 1
        private const val PAGE_HEART = 2
        private const val PAGE_HEART_ZONES = 3
        private const val PAGE_ROUTE = 4

        private val PAGE_LAYOUTS = intArrayOf(
            R.layout.wear_run_page_summary,
            R.layout.wear_run_page_pace,
            R.layout.wear_run_page_heart,
            R.layout.wear_run_page_heart_zones,
            R.layout.wear_run_page_route,
        )
    }
}

private fun String.asPaceLabel(): String {
    return if (this == "--") "-- /km" else "$this /km"
}
