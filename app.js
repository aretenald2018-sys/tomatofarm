// ================================================================
// app.js — 앱 진입점
// ================================================================

import { loadAll, TODAY, getTabOrder,
         getRawVisibleTabs, DEFAULT_VIS_TABS,
         isAdmin, isAdminGuest, trackEvent,
         getCurrentUser, loadSavedUser, refreshCurrentUserFromDB } from './data.js';
import { loadCSVDatabase } from './fatsecret-api.js';
// ── 분리된 모듈 ──
import './feature-diet-plan.js';
import './feature-checkin.js';
import './feature-misc.js';
import './workout/expert.js';  // 전문가 모드 렌더와 scoped action binding
import { showTutorialIfNeeded } from './feature-tutorial.js';
import { dismissPWAInstallBanner, initFCM, installPWA, showPWAInstallBanner, updateInstallBtn } from './pwa-fcm.js';
import {
  initTabDrag,
  initSwipeNavigation,
  configureNavigation,
  applyTabOrder,
  applyVisibleTabs,
  openTabSettingsModal,
  closeTabSettingsModal,
  saveTabSettingsFromModal
} from './navigation.js';
import { initUxPolish } from './utils/ux-polish.js';
import { initActionRouter } from './utils/action-router.js';
import { registerStaticActions } from './app/static-actions.js';
import { loadLazyModule } from './app/lazy-loader.js';
import { getTabDefinition, isRegisteredTab } from './app/tab-registry.js';
import { initOverlayStack } from './app/overlay-stack.js';
import { initBuildInfoSurface } from './utils/build-info.js';
import {
  enableWorkoutPwaHistory,
  getWorkoutNavSnapshot,
  handleWorkoutBack,
  openWorkoutCalendar,
  openWorkoutDaySheet,
  subscribeWorkoutNav,
} from './workout/navigation-stack.js';
import './utils/haptics.js';       // window.haptic.light/medium/heavy (Capacitor + web fallback)
try { initBuildInfoSurface(); } catch (e) { console.warn('[app] build info init 실패:', e); }
// ── 코어 탭 (즉시 로드) ──
import { renderHome, refreshNotifCenter, showToast } from './home/index.js';
import { closeNotifCenter, markAllNotifsRead, toggleNotifCenter } from './home/notifications.js';
import { setLifeZoneVisitContext } from './home/life-zone.js';
import { showWelcomeBackPopup } from './home/welcome-back.js';
import { showDietPremiumReportIfNeeded } from './feature-diet-premium-report.js';
import { logoutAccount, openLetterModal } from './feature-login.js';
import {
  loadWorkoutDate,
  wtRecoverTimers, wtRestoreRunningSessionIfActive,
} from './workout/index.js';
import { wtHandleExercisePickerBack } from './workout/exercises.js';
import { wtHandleRunningSessionBack, wtOpenRunningSession } from './workout/running-session.js';
import {
  initSeasonDashboardWidgetSync,
  scheduleSeasonDashboardWidgetSync,
} from './workout/season-widget-bridge.js';

// ── 레이지 로딩 탭 캐시 ──
const _lazy = loadLazyModule;

function _withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      console.warn(`[init] ${label} timed out after ${ms}ms; continuing with available local state`);
      resolve(null);
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
    timeout,
  ]);
}

const APP_BOOT_AUXILIARY_TIMEOUT_MS = 2500;

function _hideLoadingOverlay() {
  const loading = document.getElementById('loading');
  if (!loading) return;
  loading.style.display = 'none';
  loading.classList.add('hidden');
}

// ── 탭 스켈레톤 삽입 (레이지 로드 피드백) ──
function _showTabSkeleton(tabId) {
  const tab = document.getElementById(tabId);
  if (!tab) return;
  // 이미 실제 콘텐츠가 있으면 건너뛰기 (초기 1회만 노출)
  if (tab.dataset.rendered === '1') return;
  if (tab.querySelector('.tds-tab-loader')) return;
  const loader = document.createElement('div');
  loader.className = 'tds-tab-loader';
  loader.innerHTML = `
    <div class="tds-skeleton-card"></div>
    <div class="tds-skeleton-title"></div>
    <div class="tds-skeleton-subtitle"></div>
    <div class="tds-skeleton-card"></div>
  `;
  tab.prepend(loader);
}
function _hideTabSkeleton(tabId) {
  const tab = document.getElementById(tabId);
  if (!tab) return;
  tab.querySelector('.tds-tab-loader')?.remove();
  tab.dataset.rendered = '1';
}

// ── 레이지 프록시: 탭 전환 시 모듈 로드 후 공개 render entrypoint 호출 ──
async function _lazyRenderStats()   { const cfg = getTabDefinition('stats');    _showTabSkeleton(cfg.panelId); try { const m = await _lazy(cfg.id, cfg.module); m.renderStats(); return m; } finally { _hideTabSkeleton(cfg.panelId); } }
async function _lazyRenderAdmin()   { const cfg = getTabDefinition('admin');    _showTabSkeleton(cfg.panelId); try { const m = await _lazy(cfg.id, cfg.module); m.renderAdmin(); return m; } finally { _hideTabSkeleton(cfg.panelId); } }
async function _lazyRenderCooking() { const cfg = getTabDefinition('cooking');  _showTabSkeleton(cfg.panelId); try { const m = await _lazy(cfg.id, cfg.module); m.renderCooking(); return m; } finally { _hideTabSkeleton(cfg.panelId); } }
async function _lazyRenderCalendar(){ const cfg = getTabDefinition('calendar'); _showTabSkeleton(cfg.panelId); try { const m = await _lazy(cfg.id, cfg.module); m.renderCalendar(); return m; } finally { _hideTabSkeleton(cfg.panelId); } }
async function _lazyRenderWorkoutCalendarHome(){ const cfg = getTabDefinition('calendar'); const m = await _lazy(cfg.id, cfg.module); m.renderWorkoutCalendarHome?.(); return m; }
import { ensureModal, loadAndInjectModals } from './modal-manager.js';

// ── 모달 및 CSV 초기화 ───────────────────────────────────────────
async function initializeApp() {
  // 앱 시작 화면은 session bootstrap과 별개다. APK WebView에서 모달 청크 하나가
  // 지연돼도 전역 action/router 초기화가 영구히 멈추지 않도록 제한한다.
  try {
    await _withTimeout(loadAndInjectModals(), 8000, 'post-load modal initialization');
  } catch (e) {
    // 모달 청크의 지연/실패가 식단 추가처럼 shell 안에 이미 있는 액션까지
    // 막으면 안 된다. 늦게 주입된 모달은 각 기능의 ensureModal 경로가 복구한다.
    console.warn('[app] post-load modal initialization failed:', e);
  }
  initWorkoutSystemBack();
  initOverlayStack();

  // shell data-action 이벤트 위임 라우터와 정적 action registry
  try { initActionRouter(); } catch (e) { console.warn('[app] action router init 실패:', e); }
  try { initSeasonDashboardWidgetSync(); } catch (e) { console.warn('[season-widget] init failed:', e); }
  try { registerStaticActions(); } catch (e) { console.warn('[app] static actions init 실패:', e); }

  // Phase D/E UX 폴리시 (오프라인 배너 / 포커스 트랩 / aria-label)
  try { initUxPolish(); } catch (e) { console.warn('[app] UX polish init 실패:', e); }

  // CSV 데이터 백그라운드 로드
  const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
  const csvPath = basePath + '/public/data/foods.csv';
  loadCSVDatabase(csvPath)
    .then(() => console.log('[app] CSV 데이터 백그라운드 로드 완료'))
    .catch(e => console.warn('[app] CSV 로드 실패:', e));

}

let _lifeZoneNpcQuestEventBound = false;
function _bindLifeZoneNpcQuestEvent() {
  if (_lifeZoneNpcQuestEventBound) return;
  _lifeZoneNpcQuestEventBound = true;
  document.addEventListener('life-zone:npc-quest', async (event) => {
    const npc = event?.detail?.npc;
    const modalByNpc = {
      trainer: {
        modalId: 'trainer-quest-modal',
        module: './modals/trainer-quest-modal.js',
        opener: 'openTrainerQuestModal',
        label: '트레이너'
      },
      miranda: {
        modalId: 'miranda-quest-modal',
        module: './modals/miranda-quest-modal.js',
        opener: 'openMirandaQuestModal',
        label: '미란다'
      },
      consultingChief: {
        modalId: 'consulting-chief-quest-modal',
        module: './modals/consulting-chief-quest-modal.js',
        opener: 'openConsultingChiefQuestModal',
        label: '상담실장'
      }
    };
    const modalConfig = modalByNpc[npc];
    if (!modalConfig) return;
    event.preventDefault?.();
    try {
      await ensureModal(modalConfig.modalId);
      const modalModule = await import(modalConfig.module);
      const opener = modalModule[modalConfig.opener];
      if (typeof opener === 'function') {
        opener();
        return;
      }
      throw new Error(`${modalConfig.opener} is not registered`);
    } catch (error) {
      console.warn('[app] life zone NPC modal open failed:', error);
      showToast?.(`${modalConfig.label} 대화창을 열지 못했어요. 새로고침 후 다시 시도해주세요.`, 2500, 'error');
    }
  });
}

let _runningLiveEventBound = false;
let _runningLiveRenderTimer = null;
let _lastRunningLiveRenderAt = 0;

function _scheduleRunningLiveHomeRender() {
  if (_currentTab !== 'home' || _runningLiveRenderTimer) return;
  const delay = Math.max(0, 1500 - (Date.now() - _lastRunningLiveRenderAt));
  _runningLiveRenderTimer = setTimeout(() => {
    _runningLiveRenderTimer = null;
    if (_currentTab !== 'home') return;
    _lastRunningLiveRenderAt = Date.now();
    renderHome();
  }, delay);
}

function _bindRunningLiveEvent() {
  if (_runningLiveEventBound) return;
  _runningLiveEventBound = true;
  document.addEventListener('life-zone:running-live', () => {
    _scheduleRunningLiveHomeRender();
  });
}

// ── 탭 전환 ──────────────────────────────────────────────────────
let _currentTab = 'home';

function _syncNavigationForCurrentRole() {
  const adminOnlyMode = isAdmin();
  const tabNav = document.getElementById('tab-nav');
  const moreMenu = document.getElementById('more-menu');
  const adminMenu = document.getElementById('admin-menu-items');
  const moreBtn = tabNav?.querySelector('.tab-more-btn');

  ['home', 'diet', 'workout', 'stats', 'calendar'].forEach((tabId) => {
    const btn = tabNav?.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.style.display = adminOnlyMode ? 'none' : '';
  });

  if (moreBtn) {
    moreBtn.style.display = '';
    moreBtn.dataset.mode = adminOnlyMode ? 'admin-only' : 'default';
    moreBtn.dataset.appAction = adminOnlyMode ? 'switch-tab' : 'toggle-more-menu';
    moreBtn.dataset.tab = adminOnlyMode ? 'admin' : 'more';
    moreBtn.innerHTML = adminOnlyMode
      ? '<span class="tab-icon nav-icon nav-icon-admin" aria-hidden="true"></span><span class="tab-label">토마토어드민</span>'
      : '<span class="tab-icon nav-icon nav-icon-more" aria-hidden="true"></span><span class="tab-label">더보기</span>';
    moreBtn.onclick = null;
    moreBtn.classList.toggle('active', _currentTab === 'admin' && adminOnlyMode);
  }

  if (adminMenu) adminMenu.style.display = isAdmin() ? '' : 'none';

  if (tabNav) tabNav.style.display = '';
  if (moreMenu && adminOnlyMode) moreMenu.style.display = 'none';
}

const APP_SHELL_ACTION_SCOPE = '#notif-center, #notif-center-backdrop, #tab-nav, #more-menu, #tab-settings-modal, #weekly-streak-grid';

function _closeMoreMenu() {
  const menu = document.getElementById('more-menu');
  if (menu) menu.style.display = 'none';
}

function _toggleMoreMenu() {
  const menu = document.getElementById('more-menu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

function _runAppShellAction(action, control, event) {
  const tab = control?.dataset?.tab;
  switch (action) {
    case 'install-pwa':
      installPWA();
      _closeMoreMenu();
      break;
    case 'install-apk':
      if (typeof window.__requestTomatoApkInstall === 'function') {
        void window.__requestTomatoApkInstall({ control, source: 'more-menu' });
      } else {
        window.location.assign(new URL('./public/downloads/tomato-mobile-debug.apk', window.location.href).href);
      }
      _closeMoreMenu();
      break;
    case 'open-letter-modal':
      _closeMoreMenu();
      void openLetterModal();
      break;
    case 'toggle-notif-center':
      _closeMoreMenu();
      toggleNotifCenter();
      break;
    case 'refresh-app-update':
      _closeMoreMenu();
      if (typeof window.__requestTomatoAppRefresh === 'function') {
        void window.__requestTomatoAppRefresh({ control, source: 'more-menu' });
      } else {
        window.location.reload();
      }
      break;
    case 'logout-account':
      _closeMoreMenu();
      void logoutAccount();
      break;
    case 'mark-all-notifs-read':
      void markAllNotifsRead();
      break;
    case 'close-notif-center':
      closeNotifCenter();
      break;
    case 'switch-tab':
      if (tab) void switchTab(tab);
      break;
    case 'open-workout-date':
      openWorkoutTab(control.dataset.year, control.dataset.month, control.dataset.day);
      break;
    case 'toggle-more-menu':
      _toggleMoreMenu();
      break;
    case 'switch-tab-close-more':
      if (tab) void switchTab(tab);
      _closeMoreMenu();
      break;
    case 'open-tab-settings-close-more':
      openTabSettingsModal();
      _closeMoreMenu();
      break;
    case 'close-tab-settings':
      closeTabSettingsModal(event);
      break;
    case 'save-tab-settings':
      void saveTabSettingsFromModal();
      break;
    default:
      console.warn(`[app-shell] unknown action: ${action}`);
  }
}

function _bindAppShellActions(root = document) {
  const marker = root.documentElement || root;
  if (!marker || marker.dataset.appShellActionsBound === '1') return;
  marker.dataset.appShellActionsBound = '1';

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const control = target?.closest?.('[data-app-action]');
    if (!control || !root.contains(control)) return;
    if (!control.matches(APP_SHELL_ACTION_SCOPE) && !control.closest(APP_SHELL_ACTION_SCOPE)) return;
    if (control.id === 'tab-settings-modal' && event.target !== control) return;

    event.preventDefault();
    _runAppShellAction(control.dataset.appAction, control, event);
  });
}

function _dateKeyFromParts(y, m, d) {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function _parseWorkoutDateKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

const WORKOUT_PULL_BACK_DEADZONE_PX = 8;
const WORKOUT_PULL_BACK_THRESHOLD_PX = 72;
function _setWorkoutSurface() {
  const panel = document.getElementById('tab-workout');
  if (!panel) return;
  panel.classList.add('wt-calendar-home-mode');
}

async function _renderWorkoutCalendarRoute(snapshot = getWorkoutNavSnapshot(), action = '') {
  _setWorkoutSurface();
  const calendarModule = await _lazyRenderWorkoutCalendarHome();
  calendarModule.applyWorkoutCalendarNavSnapshot?.(snapshot, { preserveScroll: true, action });
}

async function _renderWorkoutRoute(snapshot = getWorkoutNavSnapshot(), action = '') {
  await _renderWorkoutCalendarRoute(snapshot, action);
}

async function openWorkoutDaySheetFromAction(key, sessionIndex = 0, options = {}) {
  const dateKey = typeof key === 'string'
    ? key
    : _dateKeyFromParts(key?.y, key?.m, key?.d);
  const parsed = _parseWorkoutDateKey(dateKey);
  if (!parsed) return false;
  const targetSessionIndex = Math.max(0, Math.floor(Number(sessionIndex) || 0));
  const action = options.action || 'sheet:open-external';
  openWorkoutDaySheet(dateKey, {
    sessionIndex: targetSessionIndex,
    sheetState: 'full',
    viewYear: parsed.y,
    viewMonth: parsed.m,
    scrollTop: 0,
    history: options.history || 'replace',
    notify: false,
    action,
  });
  if (_currentTab !== 'workout') {
    await switchTab('workout', { preserveWorkoutRoute: true });
    return true;
  }
  await _renderWorkoutRoute(getWorkoutNavSnapshot(), action);
  return true;
}

subscribeWorkoutNav((snapshot, action) => {
  if (_currentTab !== 'workout') return;
  _renderWorkoutRoute(snapshot, action).catch(e => console.warn('[app] workout route render failed:', e));
});
function _handleWorkoutOverlayBack() {
  return _currentTab === 'workout' && (
    wtHandleRunningSessionBack() === true ||
    wtHandleExercisePickerBack() === true
  );
}

function _isWorkoutPullBlockedTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable="true"], [data-wt-day-sheet], [data-wt-calendar-scroll-surface], .modal-backdrop.open, .modal-overlay.open');
}

function _nearestWorkoutScroller(target) {
  const panel = document.getElementById('tab-workout');
  let node = target instanceof Element ? target : null;
  while (node && node !== panel && node !== document.body && node !== document.documentElement) {
    const style = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(node) : null;
    const overflowY = style?.overflowY || '';
    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll|overlay)/.test(overflowY)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function _workoutPageScrollTop() {
  return Math.max(
    0,
    Number(document.scrollingElement?.scrollTop) || 0,
    Number(document.documentElement?.scrollTop) || 0,
    Number(document.body?.scrollTop) || 0,
    Number(window.scrollY) || 0
  );
}

function _canStartWorkoutPullBack(target) {
  if (_currentTab !== 'workout' || _isWorkoutPullBlockedTarget(target)) return false;
  const rootTop = _workoutPageScrollTop();
  const scroller = _nearestWorkoutScroller(target);
  const scrollerTop = Math.max(0, Number(scroller?.scrollTop) || 0);
  return rootTop <= 1 && scrollerTop <= 1;
}

let _workoutPullBackGesture = null;
let _workoutPullBackBound = false;
function initWorkoutPullBackGesture() {
  if (_workoutPullBackBound || typeof window === 'undefined') return;
  _workoutPullBackBound = true;

  const reset = () => { _workoutPullBackGesture = null; };
  const onStart = (event) => {
    if (event.touches?.length !== 1) return reset();
    const touch = event.touches[0];
    _workoutPullBackGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      handled: false,
      canPull: _canStartWorkoutPullBack(event.target),
    };
  };
  const onMove = (event) => {
    const gesture = _workoutPullBackGesture;
    if (!gesture || event.touches?.length !== 1 || _currentTab !== 'workout') return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (!gesture.canPull || dy <= WORKOUT_PULL_BACK_DEADZONE_PX || Math.abs(dx) > dy * 0.75) return;

    if (event.cancelable) event.preventDefault();
    if (gesture.handled || dy < WORKOUT_PULL_BACK_THRESHOLD_PX) return;
    gesture.handled = true;
    _handleWorkoutOverlayBack() || handleWorkoutBack({ activeTab: _currentTab, preferHistory: true, action: 'pull:back' });
  };

  window.addEventListener('touchstart', onStart, { passive: true, capture: true });
  window.addEventListener('touchmove', onMove, { passive: false, capture: true });
  window.addEventListener('touchend', reset, { passive: true, capture: true });
  window.addEventListener('touchcancel', reset, { passive: true, capture: true });
}

enableWorkoutPwaHistory({
  getActiveTab: () => _currentTab,
  handleOverlayBack: _handleWorkoutOverlayBack,
});

let _workoutSystemBackBound = false;
function initWorkoutSystemBack() {
  if (_workoutSystemBackBound || typeof window === 'undefined') return;
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (!appPlugin || typeof appPlugin.addListener !== 'function') return;
  _workoutSystemBackBound = true;
  appPlugin.addListener('backButton', (event = {}) => {
    if (_handleWorkoutOverlayBack()) return;
    if (handleWorkoutBack({ activeTab: _currentTab, preferHistory: true })) return;
    if (event.canGoBack && window.history?.back) window.history.back();
  });
  appPlugin.addListener('appStateChange', (event = {}) => {
    if (event.isActive) wtRecoverTimers();
  });
}
setTimeout(initWorkoutSystemBack, 0);
setTimeout(initWorkoutPullBackGesture, 0);

async function switchTab(tab, options = {}) {
  if (isAdmin() && tab !== 'admin' && options?.allowAdminDestination !== true) tab = 'admin';
  if (!isRegisteredTab(tab)) {
    console.warn(`[app] unknown tab ignored: ${tab}`);
    return false;
  }
  const tabDefinition = getTabDefinition(tab);
  if (tab !== _currentTab) dismissPWAInstallBanner();
  _currentTab = tab;
  document.body?.classList.toggle('wt-workout-tab-active', tab === 'workout');
  trackEvent('nav', 'tab_visit', { tab });
  _syncNavigationForCurrentRole();
  document.querySelectorAll('#tab-nav .tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(tabDefinition.panelId);
  if (panel) panel.classList.add('active');

  // 코어 탭 (즉시 로드)
  if (tab === 'home')     renderHome();
  if (tab === 'workout') {
    const targetDate = options?.workoutDate || null;
    const hasTargetDate = targetDate
      && Number.isFinite(Number(targetDate.y))
      && Number.isFinite(Number(targetDate.m))
      && Number.isFinite(Number(targetDate.d));
    if (hasTargetDate) {
      const key = _dateKeyFromParts(Number(targetDate.y), Number(targetDate.m), Number(targetDate.d));
      const targetSessionIndex = 0;
      const parsed = _parseWorkoutDateKey(key);
      openWorkoutDaySheet(key, {
        sessionIndex: targetSessionIndex,
        sheetState: 'full',
        viewYear: parsed?.y ?? TODAY.getFullYear(),
        viewMonth: parsed?.m ?? TODAY.getMonth(),
        scrollTop: 0,
        action: 'sheet:tab-open',
        history: options?.history || 'replace',
        notify: false,
      });
    } else if (!options?.preserveWorkoutRoute) {
      openWorkoutCalendar({
        action: 'calendar:tab-today',
        history: 'replace',
        notify: false,
        closeSheet: false,
        selectedKey: _dateKeyFromParts(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()),
        selectedSessionIndex: 0,
        viewYear: TODAY.getFullYear(),
        viewMonth: TODAY.getMonth(),
        scrollTop: 0,
      });
    }
    const routeSnapshot = getWorkoutNavSnapshot();
    _setWorkoutSurface();
    if (hasTargetDate) {
      await _renderWorkoutRoute(routeSnapshot, 'sheet:tab-open');
    } else {
      loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      await _renderWorkoutRoute(routeSnapshot, options?.preserveWorkoutRoute ? 'route:preserve-tab' : 'calendar:tab');
    }
  }
  if (tab === 'diet')     loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  // 레이지 로드 탭
  if (tab === 'stats')    await _lazyRenderStats();
  if (tab === 'admin')    await _lazyRenderAdmin();
  if (tab === 'cooking')  await _lazyRenderCooking();
  if (tab === 'calendar') await _lazyRenderCalendar();
  if (tab === 'workout') await _lazyRenderWorkoutCalendarHome();
  return true;
}

async function renderAll() {
  if (_currentTab === 'admin') {
    await _lazyRenderAdmin();
    return;
  }

  renderHome();
  if (_currentTab === 'stats')    await _lazyRenderStats();
  if (_currentTab === 'cooking')  await _lazyRenderCooking();
  if (_currentTab === 'calendar') await _lazyRenderCalendar();
  if (_currentTab === 'workout') {
    await _lazyRenderWorkoutCalendarHome();
  }
}

document.addEventListener('sheet:saved',   renderAll);
document.addEventListener('cooking:saved', renderAll);
document.addEventListener('app:render-requested', renderAll);
let _workoutDataRefreshTimer = null;
document.addEventListener('data:workouts-updated', () => {
  if (_workoutDataRefreshTimer) clearTimeout(_workoutDataRefreshTimer);
  _workoutDataRefreshTimer = setTimeout(() => {
    _workoutDataRefreshTimer = null;
    if (_currentTab === 'home') {
      renderHome();
      return;
    }
    if (_currentTab === 'diet') {
      loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      return;
    }
    if (_currentTab === 'workout') {
      void _renderWorkoutRoute(getWorkoutNavSnapshot(), 'data:workouts-updated');
      return;
    }
    if (_currentTab === 'calendar') {
      void _lazyRenderCalendar();
      return;
    }
    if (_currentTab === 'stats') void _lazyRenderStats();
  }, 80);
});
document.addEventListener('sheet:saved', () => scheduleSeasonDashboardWidgetSync('workout-saved'));
document.addEventListener('season:changed', () => {
  void renderAll();
  scheduleSeasonDashboardWidgetSync('season-changed', 0);
});
async function openDashboardDestination(action) {
  if (action === 'refresh') {
    scheduleSeasonDashboardWidgetSync('manual-refresh', 0);
    return;
  }
  if (action === 'diet') {
    await switchTab('diet', { allowAdminDestination: true });
    return;
  }
  if (action === 'season') {
    // The widget target is the current workout calendar/season card. Opening
    // the historical test board here also opened settled cycles and stale goal
    // sheets, so modals remain user-initiated from the current-season card.
    await switchTab('workout', { allowAdminDestination: true });
    return;
  }
  if (action === 'running') {
    await switchTab('workout', {
      allowAdminDestination: true,
      workoutDate: {
        y: TODAY.getFullYear(),
        m: TODAY.getMonth(),
        d: TODAY.getDate(),
      },
      history: 'replace',
    });
    wtOpenRunningSession();
    return;
  }
  if (action === 'workout') await switchTab('workout', { allowAdminDestination: true });
}

function readDashboardEntry() {
  const params = new URLSearchParams(window.location.search);
  const entry = String(params.get('entry') || '');
  return ['diet', 'season', 'running'].includes(entry) ? entry : '';
}

function clearDashboardEntry() {
  const url = new URL(window.location.href);
  url.searchParams.delete('entry');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

let _pendingDashboardEntry = readDashboardEntry();
let _dashboardDestinationRevision = 0;
let _dashboardDataReady = false;
let _dashboardDataLoadGeneration = 0;
function openPendingDashboardEntry() {
  if (
    !_pendingDashboardEntry
    || window.__tomatoAppReady !== true
    || _dashboardDataReady !== true
    || !(getCurrentUser() || loadSavedUser())
  ) return;
  const entry = _pendingDashboardEntry;
  _pendingDashboardEntry = '';
  _dashboardDestinationRevision += 1;
  clearDashboardEntry();
  void openDashboardDestination(entry);
}

document.addEventListener('widget:action', (event) => {
  const action = String(event.detail?.action || '');
  if (!['diet', 'season', 'running', 'workout', 'refresh'].includes(action)) return;
  _pendingDashboardEntry = action;
  openPendingDashboardEntry();
});
document.addEventListener('app:start-user-session', (event) => {
  Promise.resolve(startTomatoUserSession())
    .then((result) => {
      event.detail?.resolve?.(result);
      if (result) openPendingDashboardEntry();
    })
    .catch((error) => {
      console.error('[app] user session start failed:', error);
      event.detail?.resolve?.(false);
    });
});

// ── 운동탭에서 날짜 지정 진입 ────────────────────────────────────
function openWorkoutTab(y, m, d) {
  const key = _dateKeyFromParts(y, m, d);
  if (key) {
    openWorkoutDaySheetFromAction(key, 0, {
      history: 'replace',
      action: 'sheet:open-from-tab-date',
    });
    return;
  }
  switchTab('workout');
}

// ── 탭 드래그/스와이프/가시성은 navigation.js로 분리됨 ──────────
// ── 목표 및 퀨스트 모달 함수는 app-modal-*.js에서 import됨 ───────────────

// ── 다이어트 플랜/체크인은 feature-*.js로 분리됨 ──────
// ── 초기화 ───────────────────────────────────────────────────────
let _appInitPromise = null;
let _appInitUserId = null;

function _getAppInitUserId() {
  // localStorage 세션은 data 모듈이 로드된 직후 동기 복원할 수 있다.
  // 이 값을 먼저 확인해야 로그인 화면의 자동 복원과 app bootstrap이 같은
  // 세션을 중복으로 초기화하지 않는다.
  return (getCurrentUser() || loadSavedUser())?.id || null;
}

function init() {
  const requestedUserId = _getAppInitUserId();
  if (_appInitPromise) {
    if (_appInitUserId === requestedUserId) return _appInitPromise;
    // 비로그인 bootstrap이 끝나기 전에 로그인한 경우, 기존 초기화를 끝낸 뒤
    // 새 사용자 세션을 한 번만 시작한다.
    return _appInitPromise.then(() => init(), () => init());
  }

  _appInitUserId = requestedUserId;
  const task = _initializeAppSession();
  _appInitPromise = task;
  task.then(
    () => { if (_appInitPromise === task) _appInitPromise = null; },
    () => { if (_appInitPromise === task) _appInitPromise = null; }
  );
  return task;
}

function startTomatoUserSession() {
  return init();
}

async function _showPostLoginExperience({ previousLastLoginAt, runningSessionRestored }) {
  let priorityPopupShown = runningSessionRestored;
  if (!priorityPopupShown) {
    priorityPopupShown = await _withTimeout(
      showDietPremiumReportIfNeeded(),
      APP_BOOT_AUXILIARY_TIMEOUT_MS,
      'diet premium report'
    );
  }
  if (previousLastLoginAt && !priorityPopupShown) {
    const hoursSinceLogin = (Date.now() - previousLastLoginAt) / 3600000;
    priorityPopupShown = await _withTimeout(
      showWelcomeBackPopup(hoursSinceLogin, { onStartWorkout: () => switchTab('workout') }),
      APP_BOOT_AUXILIARY_TIMEOUT_MS,
      'welcome back data'
    );
  }
  if (!priorityPopupShown) {
    priorityPopupShown = showTutorialIfNeeded({ previousLastLoginAt });
  }
  if (!priorityPopupShown) {
    renderHome();
  }
}

async function _initializeAppSession() {
  window.__tomatoAppReady = false;
  _dashboardDataReady = false;
  const dashboardDataLoadGeneration = ++_dashboardDataLoadGeneration;
  const dashboardRevisionAtBoot = _dashboardDestinationRevision;
  let bootUser = null;
  let runningSessionRestored = false;
  try {
    // 로그인 안 되어있으면 모달만 로드하고 대기
    const user = loadSavedUser() || getCurrentUser();
    bootUser = user;
    const previousLastLoginAt = user?.lastLoginAt || 0;
    if (!user) {
      // APK에서 네트워크/캐시 상태가 불안정해도 로그인 진입이 멈추지 않게 한다.
      await _withTimeout(loadAndInjectModals(), 3000, 'login modal load');
      document.getElementById('loading').style.display = 'none';
      return; // 로그인 화면이 표시됨
    }

    // 모달 로드 + 데이터 로드 병렬 실행
    // Keep the real data promise alive after the shell timeout. Dashboard
    // deep links wait for it so they never render from the empty bootstrap
    // cache and then remain stale.
    const dashboardDataLoad = Promise.resolve(loadAll()).finally(() => {
      if (_dashboardDataLoadGeneration !== dashboardDataLoadGeneration) return;
      _dashboardDataReady = true;
      if (window.__tomatoAppReady === true) openPendingDashboardEntry();
    });
    await Promise.all([
      _withTimeout(loadAndInjectModals(), 8000, 'modal load'),
      _withTimeout(dashboardDataLoad, 10000, 'data load'),
    ]);
    // localStorage 캐시를 Firebase 최신으로 동기화
    await _withTimeout(refreshCurrentUserFromDB(), 6000, 'user refresh');
    const refreshedUser = getCurrentUser() || user;
    setLifeZoneVisitContext({
      userId: refreshedUser?.id || user?.id || null,
      previousLastLoginAt,
      createdAt: refreshedUser?.createdAt ?? user?.createdAt ?? 0
    });

    // AI 음식 프로파일 빌드 (P1: 메모리 전용, _cache 기반 — 네트워크 없음, 비동기 비차단)
    // P2에서 runAIEstimate 파이프라인에 연결될 예정. 지금은 관측/축적 단계.
    requestAnimationFrame(async () => {
      try {
        const { rebuildFoodProfile } = await import('./data/ai-food-profile.js');
        rebuildFoodProfile();
      } catch (e) { console.warn('[ai-food-profile]', e); }
    });
    applyTabOrder(getTabOrder());

    // 하단 탭 가시성 적용
    // 김태우(Guest)는 게스트 디폴트 강제 적용 (admin 설정 공유 무시)
    let visTabs;
    if (isAdminGuest()) {
      visTabs = DEFAULT_VIS_TABS;
    } else if (isAdmin()) {
      visTabs = getRawVisibleTabs() || ['home','diet','workout','stats'];
    } else {
      visTabs = getRawVisibleTabs() || DEFAULT_VIS_TABS;
    }
    // diet 탭이 기존 설정에 없으면 추가 + 순서 강제 (홈→식단→운동→나머지)
    if (!visTabs.includes('diet')) {
      visTabs.push('diet');
    }
    // 순서 강제: 원하는 순서대로 정렬
    const TAB_ORDER = ['home','diet','workout','stats'];
    visTabs.sort((a, b) => {
      const ai = TAB_ORDER.indexOf(a), bi = TAB_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    applyVisibleTabs(visTabs);
    _syncNavigationForCurrentRole();

    initTabDrag();
    initSwipeNavigation();
    // 편지 버튼 표시 (모든 사용자)
    const letterBtn = document.getElementById('letter-btn');
    if (letterBtn) letterBtn.style.display = '';
    runningSessionRestored = wtRestoreRunningSessionIfActive();

    if (isAdmin()) {
      if (!runningSessionRestored) {
        await _withTimeout(switchTab('admin'), APP_BOOT_AUXILIARY_TIMEOUT_MS, 'admin tab render');
        if (!_pendingDashboardEntry) {
          void showDietPremiumReportIfNeeded().catch((e) => console.warn('[diet-premium-report]', e));
        }
      }
    } else {
      renderHome({ deferCheerCard: true });
      // 알림/길드 조회는 APK의 느린 Firebase 연결에서 오래 멈출 수 있다. 앱 셸은
      // 먼저 표시하고, 환영 팝업 같은 보조 경험은 백그라운드에서 처리한다.
      if (!_pendingDashboardEntry) {
        void _showPostLoginExperience({ previousLastLoginAt, runningSessionRestored })
          .catch((e) => console.warn('[post-login]', e));
      }
    }

    // 홈/관리자 첫 화면이 준비되면, 보조 네트워크 작업을 기다리지 않고 닫는다.
    _hideLoadingOverlay();
    scheduleSeasonDashboardWidgetSync('initial-load', 0);

    // 나머지 초기화는 비동기로 (체감 속도 개선)
    const bellBtn = document.getElementById('notif-bell');
    if (bellBtn) bellBtn.style.display = isAdmin() ? 'none' : '';
    requestAnimationFrame(() => {
      if (!isAdmin()) {
        refreshNotifCenter();
        if (!runningSessionRestored) {
          loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
        }
      }
    });

    // FCM 푸시 알림 초기화 (백그라운드)
    initFCM();
  } catch (err) {
    console.error('[init] 초기화 오류:', err);
    // 오류가 발생해도 로딩 화면 숨기고 기본 렌더링
    renderHome();
  } finally {
    _hideLoadingOverlay();
    window.__tomatoAppReady = true;
    window.dispatchEvent(new Event('tomato-app-ready'));
    if (bootUser) {
      openPendingDashboardEntry();
      const openedDashboardEntry = _dashboardDestinationRevision > dashboardRevisionAtBoot;
      if (!runningSessionRestored && !openedDashboardEntry && !_pendingDashboardEntry) {
        requestAnimationFrame(() => {
          showDietPremiumReportIfNeeded().catch((e) => console.warn('[diet-premium-report]', e));
        });
        setTimeout(() => {
          document.querySelectorAll('.today-cell')[0]
            ?.scrollIntoView({ behavior:'smooth', block:'center' });
        }, 400);
        // PWA 설치 안내 배너 (앱 미설치 + 이전에 닫지 않았으면)
        showPWAInstallBanner();
      }
      updateInstallBtn();
    }
  }
}

_bindLifeZoneNpcQuestEvent();
_bindRunningLiveEvent();
_bindAppShellActions();
configureNavigation({ getCurrentTab: () => _currentTab, switchTab });
init();

document.addEventListener('app:switch-tab', (event) => {
  const tab = event.detail?.tab;
  if (tab) void switchTab(tab);
});

// ── 앱 초기화 ────────────────────────────────────────────────
// PWA가 복원되거나 캐시된 모듈이 늦게 평가되면 window load가 이미 끝난 뒤
// 이 파일이 실행될 수 있다. 그 경우에도 data-action 라우터를 반드시 등록한다.
let _appInitializationStarted = false;
function startInitializeApp() {
  if (_appInitializationStarted) return;
  _appInitializationStarted = true;
  void initializeApp().catch((error) => {
    console.error('[app] post-load initialization failed:', error);
  });
}

if (document.readyState === 'complete') startInitializeApp();
else window.addEventListener('load', startInitializeApp, { once: true });

// 앱이 다시 포커스되면 홈탭 갱신 (이웃 데이터 최신화)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _currentTab === 'home') {
    renderHome();
  }
  if (!document.hidden && _currentTab === 'workout') {
    wtRecoverTimers();
  }
});
