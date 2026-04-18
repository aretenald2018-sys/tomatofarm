// ================================================================
// app.js — 앱 진입점
// ================================================================

import { loadAll, TODAY, getTabOrder,
         getRawVisibleTabs, DEFAULT_VIS_TABS,
         isAdmin, isAdminGuest, trackEvent } from './data.js';
import { loadCSVDatabase } from './fatsecret-api.js';
import { getDietRec, getWorkoutRec,
         analyzeGoalFeasibility }                 from './ai.js';
// ── 분리된 모듈 ──
import './feature-nutrition.js';
import './feature-diet-plan.js';
import './feature-fatsecret.js';
import './feature-checkin.js';
import './feature-misc.js';
import './workout-ui.js';
import './workout/expert.js';  // 전문가 모드 (window.* 노출 + 렌더)
import { showTutorialIfNeeded } from './feature-tutorial.js';
import { initFCM, showPWAInstallBanner, updateInstallBtn } from './pwa-fcm.js';
import { initTabDrag, initSwipeNavigation, applyTabOrder, applyVisibleTabs } from './navigation.js';
import { initUxPolish } from './utils/ux-polish.js';
import './utils/confirm-modal.js'; // window.confirmAction / confirmSimple 등록
import './utils/form-guard.js';    // window.createFormGuard / registerFormGuard 등록
import './utils/format.js';        // window.fmtKcal / fmtDate 등 로케일 포맷
import './utils/haptics.js';       // window.haptic.light/medium/heavy (Capacitor + web fallback)
// ── 코어 탭 (즉시 로드) ──
import { renderHome, refreshNotifCenter, showToast } from './render-home.js';
import { showWelcomeBackPopup } from './home/welcome-back.js';
import {
  loadWorkoutDate, changeWorkoutDate, goToTodayWorkout, saveWorkoutDay,
  openNutritionPhotoUpload, wtRecoverTimers,
} from './render-workout.js';

// ── 레이지 로딩 탭 캐시 ──
const _lazyModules = {};
async function _lazy(name, path) {
  if (!_lazyModules[name]) _lazyModules[name] = await import(path);
  return _lazyModules[name];
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

// ── 레이지 프록시: 탭 전환 시 모듈 로드, window.* 자동 등록 ──
async function _lazyRenderStats()   { _showTabSkeleton('tab-stats');   try { const m = await _lazy('stats',   './render-stats.js');              m.renderStats();   return m; } finally { _hideTabSkeleton('tab-stats'); } }
async function _lazyRenderAdmin()   { _showTabSkeleton('tab-admin');   try { const m = await _lazy('admin',   './render-admin.js?v=20260410e');  m.renderAdmin();   return m; } finally { _hideTabSkeleton('tab-admin'); } }
async function _lazyRenderCooking() { _showTabSkeleton('tab-cooking'); try { const m = await _lazy('cooking', './render-cooking.js');            m.renderCooking(); return m; } finally { _hideTabSkeleton('tab-cooking'); } }
async function _lazyRenderCalendar(){ _showTabSkeleton('tab-calendar');try { const m = await _lazy('calendar',  './render-calendar.js');           m.renderCalendar();return m; } finally { _hideTabSkeleton('tab-calendar'); } }
import { loadAndInjectModals } from './modal-manager.js';

// ── 분리된 모달 핸들러 import ──────────────────────────────────
import {
  openGoalModal, closeGoalModal, toggleGoalCondition,
  saveGoalFromModal, deleteGoalItem, analyzeGoalFeasibilityHandler
} from './app-modal-goals.js';
import {
  openQuestModal, closeQuestModal, onQuestAutoChange,
  saveQuestFromModal, openQuestEditModal, closeQuestEditModal,
  saveQuestEdit, deleteQuestItem, toggleQuestCheck
} from './app-modal-quests.js';

// ── 모달 및 CSV 초기화 ───────────────────────────────────────────
async function initializeApp() {
  await loadAndInjectModals();

  // Phase D/E UX 폴리시 (오프라인 배너 / 포커스 트랩 / aria-label)
  try { initUxPolish(); } catch (e) { console.warn('[app] UX polish init 실패:', e); }

  // CSV 데이터 백그라운드 로드
  const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
  const csvPath = basePath + '/public/data/foods.csv';
  loadCSVDatabase(csvPath)
    .then(() => console.log('[app] CSV 데이터 백그라운드 로드 완료'))
    .catch(e => console.warn('[app] CSV 로드 실패:', e));

}

// ── 모달 유틸리티 ────────────────────────────────────────────────
let _openModalStack = [];

function _openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  _openModalStack.push(id);
  document.body.style.overflow = 'hidden';
}
function _closeModal(id, e) {
  if (e && e.target !== document.getElementById(id)) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  _openModalStack = _openModalStack.filter(x => x !== id);
  if (_openModalStack.length === 0) document.body.style.overflow = '';
}

// ESC키로 최상위 모달 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _openModalStack.length > 0) {
    const topId = _openModalStack[_openModalStack.length - 1];
    _closeModal(topId);
  }
});
// feature 모듈에서 사용할 수 있도록 window에 노출
window._openModal = _openModal;
window._closeModal = _closeModal;

// ── 탭 전환 ──────────────────────────────────────────────────────
let _currentTab = 'home';
window._getCurrentTab = () => _currentTab;

function _syncNavigationForCurrentRole() {
  const adminOnlyMode = isAdmin();
  const tabNav = document.getElementById('tab-nav');
  const topNav = document.querySelector('.top-nav');
  const moreMenu = document.getElementById('more-menu');
  const adminMenu = document.getElementById('admin-menu-items');
  const moreBtn = tabNav?.querySelector('.tab-more-btn');

  ['home', 'diet', 'workout', 'stats'].forEach((tabId) => {
    const btn = tabNav?.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) btn.style.display = adminOnlyMode ? 'none' : '';
  });

  if (moreBtn) {
    moreBtn.style.display = '';
    moreBtn.dataset.mode = adminOnlyMode ? 'admin-only' : 'default';
    moreBtn.innerHTML = adminOnlyMode
      ? '<span class="tab-icon">🍅</span><span>토마토어드민</span>'
      : '<span class="tab-icon">⋯</span><span>더보기</span>';
    moreBtn.onclick = adminOnlyMode ? (() => switchTab('admin')) : (() => toggleMoreMenu());
    moreBtn.classList.toggle('active', _currentTab === 'admin' && adminOnlyMode);
  }

  if (adminMenu) adminMenu.style.display = isAdmin() ? '' : 'none';

  if (tabNav) tabNav.style.display = '';
  if (topNav) topNav.style.display = adminOnlyMode && _currentTab === 'admin' ? 'none' : '';
  if (moreMenu && adminOnlyMode) moreMenu.style.display = 'none';
}

async function switchTab(tab) {
  if (isAdmin() && tab !== 'admin') tab = 'admin';
  _currentTab = tab;
  trackEvent('nav', 'tab_visit', { tab });
  _syncNavigationForCurrentRole();
  document.querySelectorAll('#tab-nav .tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');

  // 코어 탭 (즉시 로드)
  if (tab === 'home')     renderHome();
  if (tab === 'workout') {
    loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    wtRecoverTimers();
    // 탭 진입 시 프로 모드 뷰는 리셋 → 항상 일반 모드 뷰가 디폴트.
    if (typeof window.resetExpertView === 'function') window.resetExpertView();
    if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
  }
  if (tab === 'diet')     loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  // 레이지 로드 탭
  if (tab === 'stats')    await _lazyRenderStats();
  if (tab === 'admin')    await _lazyRenderAdmin();
  if (tab === 'cooking')  await _lazyRenderCooking();
  if (tab === 'calendar') await _lazyRenderCalendar();
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
  if (_currentTab === 'workout' && typeof window.renderExpertTopArea === 'function') {
    window.renderExpertTopArea();
  }
}

document.addEventListener('sheet:saved',   renderAll);
document.addEventListener('cooking:saved', renderAll);

// ── 운동탭에서 날짜 지정 진입 ────────────────────────────────────
function openWorkoutTab(y, m, d) {
  switchTab('workout');
  loadWorkoutDate(y, m, d);
  wtRecoverTimers();
}

// ── 탭 드래그/스와이프/가시성은 navigation.js로 분리됨 ──────────
// ── 목표 및 퀨스트 모달 함수는 app-modal-*.js에서 import됨 ───────────────

// ── 다이어트 플랜/체크인/FatSecret은 feature-*.js로 분리됨 ──────
// ── 초기화 ───────────────────────────────────────────────────────
async function init() {
  try {
    // 로그인 안 되어있으면 모달만 로드하고 대기
    const { getCurrentUser, loadSavedUser } = await import('./data.js');
    const user = loadSavedUser() || getCurrentUser();
    const previousLastLoginAt = user?.lastLoginAt || 0;
    if (!user) {
      await loadAndInjectModals();
      document.getElementById('loading').style.display = 'none';
      return; // 로그인 화면이 표시됨
    }

    // 모달 로드 + 데이터 로드 병렬 실행
    await Promise.all([loadAndInjectModals(), loadAll()]);
    // localStorage 캐시를 Firebase 최신으로 동기화
    const { refreshCurrentUserFromDB } = await import('./data.js');
    await refreshCurrentUserFromDB();

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

    if (isAdmin()) {
      await switchTab('admin');
    } else {
      renderHome({ deferCheerCard: true });
      let priorityPopupShown = false;
      if (previousLastLoginAt) {
        const hoursSinceLogin = (Date.now() - previousLastLoginAt) / 3600000;
        priorityPopupShown = await showWelcomeBackPopup(hoursSinceLogin).catch((e) => {
          console.warn('[welcome-back]', e);
          return false;
        });
      }
      if (!priorityPopupShown) {
        priorityPopupShown = showTutorialIfNeeded({ previousLastLoginAt });
      }
      if (!priorityPopupShown) {
        renderHome();
      }
    }

    // 홈 렌더링 후 즉시 로딩 화면 숨기기 (나머지는 백그라운드)
    const loadEl2 = document.getElementById('loading');
    if (loadEl2) { loadEl2.style.display = 'none'; loadEl2.classList.add('hidden'); }

    // 나머지 초기화는 비동기로 (체감 속도 개선)
    const bellBtn = document.getElementById('notif-bell');
    if (bellBtn) bellBtn.style.display = isAdmin() ? 'none' : '';
    requestAnimationFrame(() => {
      if (!isAdmin()) {
        refreshNotifCenter();
        loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      }
    });

    // FCM 푸시 알림 초기화 (백그라운드)
    initFCM();
  } catch (err) {
    console.error('[init] 초기화 오류:', err);
    // 오류가 발생해도 로딩 화면 숨기고 기본 렌더링
    renderHome();
  } finally {
    const loadEl = document.getElementById('loading');
    if (loadEl) { loadEl.style.display = 'none'; loadEl.classList.add('hidden'); }
    setTimeout(() => {
      document.querySelectorAll('.today-cell')[0]
        ?.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 400);
    // PWA 설치 안내 배너 (앱 미설치 + 이전에 닫지 않았으면)
    showPWAInstallBanner();
    updateInstallBtn();
  }
}

// ── 식단 입력 버튼 이벤트 위임 (끼니별 버튼 지원) ──────────────────
function _initDietInputButtons() {
  // 식단 영역 전체에 이벤트 위임 (각 끼니별 addFood/photoUpload 버튼)
  const dietGrid = document.querySelector('.diet-grid');
  if (!dietGrid) return;

  dietGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;
    const meal = btn.dataset.meal; // 끼니 (breakfast/lunch/dinner/snack)

    // meal이 있으면 해당 끼니를 미리 선택
    if (meal) window._nutritionSearchMeal = meal;

    if (action === 'addFood') {
      openNutritionItemEditor(null);
    } else if (action === 'photoUpload') {
      openNutritionPhotoUpload();
    }
  }, false);
}


init();
_initDietInputButtons();

// ── window 등록 ──────────────────────────────────────────────────
window.renderAll                = renderAll;
window.renderHome               = renderHome;
window.switchTab                = switchTab;
window.showToast                = showToast;
window.setPeriod                = async (...a) => (await _lazy('stats', './render-stats.js')).setPeriod(...a);
window.getDietRec               = getDietRec;
window.getWorkoutRec            = getWorkoutRec;
// 운동·식단 탭
window.openWorkoutTab           = openWorkoutTab;
window.openSheet                = openWorkoutTab;
window.changeWorkoutDate        = changeWorkoutDate;
window.goToTodayWorkout         = goToTodayWorkout;
window.saveWorkoutDay           = saveWorkoutDay;
window._wtExports = { loadWorkoutDate };
// 요리 탭 (레이지)
window.openCookingModal         = async (...a) => (await _lazy('cooking', './render-cooking.js')).openCookingModal(...a);
window.closeCookingModal        = async (...a) => (await _lazy('cooking', './render-cooking.js')).closeCookingModal(...a);
window.saveCookingFromModal     = async (...a) => (await _lazy('cooking', './render-cooking.js')).saveCookingFromModal(...a);
window.deleteCookingFromModal   = async (...a) => (await _lazy('cooking', './render-cooking.js')).deleteCookingFromModal(...a);
window.onCookingPhotoInput      = async (...a) => (await _lazy('cooking', './render-cooking.js')).onCookingPhotoInput(...a);
// 목표
window.openGoalModal            = openGoalModal;
window.closeGoalModal           = closeGoalModal;
window.saveGoalFromModal        = saveGoalFromModal;
window.deleteGoalItem           = deleteGoalItem;
window.analyzeGoalFeasibility   = analyzeGoalFeasibilityHandler;
window.toggleGoalCondition      = toggleGoalCondition;
// 퀘스트
window.openQuestModal           = openQuestModal;
window.closeQuestModal          = closeQuestModal;
window.saveQuestFromModal       = saveQuestFromModal;
window.openQuestEditModal       = openQuestEditModal;
window.closeQuestEditModal      = closeQuestEditModal;
window.saveQuestEdit            = saveQuestEdit;
window.deleteQuestItem          = deleteQuestItem;
window.toggleQuestCheck         = toggleQuestCheck;
window.onQuestAutoChange        = onQuestAutoChange;

// ── 앱 초기화 ────────────────────────────────────────────────
window.addEventListener('load', initializeApp);

// 앱이 다시 포커스되면 홈탭 갱신 (이웃 데이터 최신화)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _currentTab === 'home') {
    renderHome();
  }
  if (!document.hidden && _currentTab === 'workout') {
    wtRecoverTimers();
  }
});
