import {
  getDietPlan,
  getCache,
  getSeasonBundleForDate,
} from '../data.js';
import { dateKey, TODAY } from '../data/data-date.js';
import { buildSeasonDashboardSnapshot } from '../data/season-widget-snapshot.js';

let _syncTimer = null;

function _todayKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

export function currentSeasonDashboardSnapshot(options = {}) {
  const todayKey = options.todayKey || _todayKey();
  const bundle = getSeasonBundleForDate(todayKey);
  return buildSeasonDashboardSnapshot({
    cache: getCache(),
    registry: bundle.registry,
    todayKey,
    workoutPlan: bundle.workoutPlan || {},
    runningPlan: bundle.runningPlan || {},
    board: bundle.board,
    dietPlan: getDietPlan(),
    generatedAt: options.generatedAt || Date.now(),
  });
}

export async function syncSeasonDashboardWidget(options = {}) {
  const plugin = globalThis.Capacitor?.Plugins?.SeasonWidget;
  if (!plugin?.saveSnapshot) return { skipped: true, reason: 'native-plugin-unavailable' };
  const snapshot = currentSeasonDashboardSnapshot(options);
  await plugin.saveSnapshot({
    snapshotJson: JSON.stringify(snapshot),
    reason: String(options.reason || 'app-sync'),
  });
  return { skipped: false, snapshot };
}

export function scheduleSeasonDashboardWidgetSync(reason = 'scheduled', delayMs = 120) {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    void syncSeasonDashboardWidget({ reason }).catch(error => {
      console.warn('[season-widget] sync failed:', error?.message || error);
    });
  }, Math.max(0, Number(delayMs) || 0));
}

export function initSeasonDashboardWidgetSync() {
  const appPlugin = globalThis.Capacitor?.Plugins?.App;
  appPlugin?.addListener?.('appStateChange', ({ isActive }) => {
    if (isActive) scheduleSeasonDashboardWidgetSync('app-resume', 0);
  });
}
