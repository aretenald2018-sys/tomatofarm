// ================================================================
// app.js — 앱 진입점
// ================================================================

import { CONFIG } from './config.js';
import { loadAll, saveGoal, deleteGoal, getGoals,
         saveQuest, deleteQuest, getQuests, dateKey,
         TODAY, getSectionTitle, saveSectionTitle,
         saveStockPurchase, getStockPurchases,
         getMiniMemoItems, saveMiniMemoItems,
         saveQuestOrder, getQuestOrder,
         saveEvent, deleteEvent, getEvents,
         getTabOrder, saveTabOrder,
         getVisibleTabs, getRawVisibleTabs, saveVisibleTabs, DEFAULT_VIS_TABS,
         isAdmin, isAdminGuest,
         getDietPlan, saveDietPlan, calcDietMetrics,
         saveBodyCheckin, deleteBodyCheckin, getBodyCheckins,
         saveNutritionItem, deleteNutritionItem, getNutritionDB, searchNutritionDB, getRecentNutritionItems,
         imageToBase64, getMovieData, saveMovieData, getAllMovieMonths,
         getCookingRecords,
         getCalendarRows, saveCalendarRows } from './data.js';
import { loadCSVDatabase, searchCSVFood, searchGovFoodAPI } from './fatsecret-api.js';
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected,
         tryAutoConnect, syncCreateToGCal, syncUpdateToGCal, syncDeleteToGCal,
         fetchGCalEvents } from './gcal-sync.js';
import { loadStocks }                             from './stocks.js?v=20260401';
import { getDietRec, getWorkoutRec,
         analyzeGoalFeasibility }                 from './ai.js';
import { renderCalendar, changeYear }             from './render-calendar.js';
import { renderStats, setPeriod, exportCSV }      from './render-stats.js';
import { renderHome, refreshNotifCenter, showToast } from './render-home.js';
import { renderMonthlyCalendar, renderMonthlyCalendarInModal,
         changeMonthlyMonth }                     from './render-monthly-calendar.js';
import { renderMovie, changeMovieMonth, startMovieCrawl, toggleMovieTagFilter }  from './render-movie.js';
import { renderDev, submitDevTask }                from './render-dev.js';
import { renderAdmin }                            from './render-admin.js';
import { renderWine, openWineModal, closeWineModal,
         saveWineFromModal, deleteWineFromModal,
         searchVivinoRating, searchWineImage,
         analyzeWinePreference, bulkSearchVivino,
         searchCriticRatings }                    from './render-wine.js';
import {
  loadWorkoutDate, changeWorkoutDate, goToTodayWorkout, saveWorkoutDay,
  wtSetGymStatus, wtSetCFStatus, wtToggleStretching, wtToggleSwimming, wtToggleRunning, wtToggleWineFree, wtToggleMealSkipped,
  wtOpenExercisePicker, wtCloseExercisePicker,
  wtOpenExerciseEditor, wtCloseExerciseEditor,
  wtSaveExerciseFromEditor, wtDeleteExerciseFromEditor,
  wtAddSet, wtRemoveSet, wtUpdateSet, wtToggleSetDone, wtUpdateSetType, wtRemoveExerciseEntry,
  wtAddFoodItem, wtRemoveFoodItem,
  openNutritionPhotoUpload,
} from './render-workout.js';
import {
  renderCooking, openCookingModal, closeCookingModal,
  saveCookingFromModal, deleteCookingFromModal, onCookingPhotoInput,
  calcPerServing,
} from './render-cooking.js';
import {
  renderFinance, refreshFinMarketData, runFinAIAnalysis, toggleFlowChart,
  openFinBenchmarkModal, closeFinBenchmarkModal, saveFinBenchmarkFromModal,
  deleteFinBenchmarkFromModal, deleteFinBenchmarkDirect,
  openFinActualModal, closeFinActualModal, saveFinActualFromModal, deleteFinActualFromModal,
  openFinLoanModal, closeFinLoanModal, saveFinLoanFromModal, deleteFinLoanFromModal,
  openFinPositionModal, closeFinPositionModal, saveFinPositionFromModal, deleteFinPositionFromModal,
  openFinPlanModal, closeFinPlanModal, saveFinPlanFromModal, deleteFinPlanFromModal,
  deleteFinPlanDirect, addFinPlanEntry,
  onBudgetYearChange, onBudgetQChange,
  openBudgetGroupModal, deleteBudgetGroup,
  openBudgetItemModal, closeBudgetItemModal, saveBudgetItemFromModal, deleteBudgetItemFromModal, deleteBudgetItem,
  editBudgetMonth, editBudgetQGoal,
  openStockDetail, closeStockDetailModal, switchStockDetailTab, changeStockChartRange,
  toggleLiveAutoRefresh, changeLiveRange,
  openSwingBuy, editSwingPosition, closeSwingPosition,
  openPbBuy, editPbPosition, closePbPosition,
} from './render-finance.js';
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

  // CSV 데이터 백그라운드 로드
  const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
  const csvPath = basePath + '/public/data/foods.csv';
  loadCSVDatabase(csvPath)
    .then(() => console.log('[app] CSV 데이터 백그라운드 로드 완료'))
    .catch(e => console.warn('[app] CSV 로드 실패:', e));

  // 이벤트 표시 모드 토글 초기화
  _updateEventViewToggle();

  // Google Calendar 자동 재연결 비활성화 (팝업 방지)
  // tryAutoConnect().then(ok => {
  //   if (ok) { console.log('[app] Google Calendar 자동 연결 성공'); syncGCalNow(); }
  // });
}

// ── 모달 유틸리티 ────────────────────────────────────────────────
function _openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function _closeModal(id, e) {
  if (e && e.target !== document.getElementById(id)) return;
  document.getElementById(id)?.classList.remove('open');
}

// ── 탭 전환 ──────────────────────────────────────────────────────
let _currentTab = 'home';

function switchTab(tab) {
  _currentTab = tab;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab-' + tab);
  if (panel) panel.classList.add('active');
  if (tab === 'home')     renderHome();
  if (tab === 'stats')    renderStats();
  if (tab === 'calendar') { renderCalendar(); if (isGCalConnected()) syncGCalNow(); }
  if (tab === 'wine')     renderWine();
  if (tab === 'dev')      renderDev();
  if (tab === 'admin')    renderAdmin();
  if (tab === 'cooking')  renderCooking();
  if (tab === 'movie')    renderMovie();
  if (tab === 'finance')  renderFinance();
  if (tab === 'workout')  loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  if (tab === 'diet')     loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

function renderAll() {
  renderHome();
  if (_currentTab === 'calendar') renderCalendar();
  if (_currentTab === 'stats')    renderStats();
  if (_currentTab === 'cooking')  renderCooking();
  if (_currentTab === 'movie')    renderMovie();
}

document.addEventListener('sheet:saved',   renderAll);
document.addEventListener('cooking:saved', renderAll);

// ── 운동탭에서 날짜 지정 진입 ────────────────────────────────────
function openWorkoutTab(y, m, d) {
  switchTab('workout');
  loadWorkoutDate(y, m, d);
}

// ── 탭 드래그 순서 변경 ──────────────────────────────────────────
function _initTabDrag() {
  const nav = document.getElementById('tab-nav');
  if (!nav) return;
  let _dragSrc = null;

  nav.addEventListener('dragstart', e => {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (!btn) return;
    _dragSrc = btn;
    btn.classList.add('tab-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  nav.addEventListener('dragover', e => {
    e.preventDefault();
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (!btn || btn === _dragSrc) return;
    nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-drag-over'));
    btn.classList.add('tab-drag-over');
  });

  nav.addEventListener('dragleave', e => {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (btn) btn.classList.remove('tab-drag-over');
  });

  nav.addEventListener('drop', e => {
    e.preventDefault();
    const btn = e.target.closest('.tab-btn[data-tab]');
    nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-drag-over'));
    if (!btn || !_dragSrc || btn === _dragSrc) return;

    // DOM 재배치
    const btns    = [...nav.querySelectorAll('.tab-btn[data-tab]')];
    const srcIdx  = btns.indexOf(_dragSrc);
    const tgtIdx  = btns.indexOf(btn);
    if (srcIdx < tgtIdx) nav.insertBefore(_dragSrc, btn.nextSibling);
    else                 nav.insertBefore(_dragSrc, btn);

    // Firebase에 순서 저장
    const newOrder = [...nav.querySelectorAll('.tab-btn[data-tab]')].map(b => b.dataset.tab);
    saveTabOrder(newOrder);
  });

  nav.addEventListener('dragend', e => {
    nav.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('tab-dragging', 'tab-drag-over');
    });
    _dragSrc = null;
  });

  // Touch 드래그 (간단한 long-press 재배치는 생략, 마우스 기반으로 충분)
}

// ── 모바일 스와이프 탭 전환 (슬라이드 애니메이션) ─────────────────
function _initSwipeNavigation() {
  let startX = 0, startY = 0, startTime = 0;
  let tracking = false, swiping = false;
  let curPanel = null, nextPanel = null, swipeDir = 0;
  const W = () => window.innerWidth;

  function getSwipeableTabs() {
    return [...document.querySelectorAll('#tab-nav .tab-btn[data-tab]')]
      .map(b => b.dataset.tab)
      .filter(t => document.getElementById('tab-' + t));
  }

  function getNextTab(dir) {
    const tabs = getSwipeableTabs();
    const idx = tabs.indexOf(_currentTab);
    if (idx === -1) return null;
    const ni = idx + dir;
    return (ni >= 0 && ni < tabs.length) ? tabs[ni] : null;
  }

  document.body.addEventListener('touchstart', e => {
    if (document.querySelector('.modal.open')) return;
    const t = e.target;
    if (t.closest('.tab-nav') || t.closest('input[type="range"]') ||
        t.closest('canvas') || t.closest('textarea') ||
        t.closest('.dash-board') || t.closest('.stock-panel') ||
        t.closest('.grid-wrap')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    tracking = true;
    swiping = false;
    curPanel = null;
    nextPanel = null;
    swipeDir = 0;
  }, { passive: true });

  document.body.addEventListener('touchmove', e => {
    if (!tracking) return;
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const dx = cx - startX;
    const dy = cy - startY;

    // 아직 방향 미결정
    if (!swiping) {
      if (Math.abs(dy) > Math.abs(dx) * 0.8 && Math.abs(dy) > 15) {
        tracking = false; return; // 수직 스크롤 → 포기
      }
      if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiping = true;
        swipeDir = dx < 0 ? 1 : -1; // 1=다음, -1=이전
        const nextTab = getNextTab(swipeDir);
        if (!nextTab) { tracking = false; return; } // 끝이면 포기

        curPanel = document.getElementById('tab-' + _currentTab);
        nextPanel = document.getElementById('tab-' + nextTab);

        // 다음 패널을 화면 밖에 준비
        nextPanel.style.transition = 'none';
        nextPanel.style.transform = `translateX(${swipeDir * 100}%)`;
        nextPanel.style.display = 'block';
        nextPanel.style.position = 'absolute';
        nextPanel.style.top = curPanel.offsetTop + 'px';
        nextPanel.style.left = '0';
        nextPanel.style.right = '0';
        curPanel.style.transition = 'none';
      }
      return;
    }

    if (!curPanel || !nextPanel) return;

    // 손가락 따라 패널 이동
    const pct = (dx / W()) * 100;
    curPanel.style.transform = `translateX(${pct}%)`;
    nextPanel.style.transform = `translateX(${swipeDir * 100 + pct}%)`;
  }, { passive: true });

  document.body.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    if (!swiping || !curPanel || !nextPanel) {
      _cleanupSwipe();
      return;
    }

    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX;
    const elapsed = Math.max(Date.now() - startTime, 1);
    const velocity = Math.abs(dx) / elapsed;
    const ratio = Math.abs(dx) / W();

    // 전환 판정: 30% 이상 이동 또는 빠른 플릭
    const doSwitch = (ratio > 0.3 || (velocity > 0.4 && Math.abs(dx) > 40))
                     && (dx < 0 ? swipeDir === 1 : swipeDir === -1);

    const duration = Math.max(120, Math.min(300, (1 - ratio) * 300));

    if (doSwitch) {
      // 전환 완료 애니메이션
      curPanel.style.transition = `transform ${duration}ms ease-out`;
      nextPanel.style.transition = `transform ${duration}ms ease-out`;
      curPanel.style.transform = `translateX(${-swipeDir * 100}%)`;
      nextPanel.style.transform = 'translateX(0)';

      setTimeout(() => {
        const nextTab = getNextTab(swipeDir);
        // 깨끗하게 정리 후 switchTab
        curPanel.style.cssText = '';
        nextPanel.style.cssText = '';
        if (nextTab) switchTab(nextTab);
      }, duration + 10);
    } else {
      // 원위치 복귀 애니메이션
      curPanel.style.transition = `transform ${duration}ms ease-out`;
      nextPanel.style.transition = `transform ${duration}ms ease-out`;
      curPanel.style.transform = 'translateX(0)';
      nextPanel.style.transform = `translateX(${swipeDir * 100}%)`;

      setTimeout(() => _cleanupSwipe(), duration + 10);
    }
  }, { passive: true });

  function _cleanupSwipe() {
    if (curPanel) curPanel.style.cssText = '';
    if (nextPanel) { nextPanel.style.cssText = ''; nextPanel.classList.remove('active'); }
    curPanel = null;
    nextPanel = null;
    swiping = false;
  }
}

function _applyTabOrder(order) {
  const nav = document.getElementById('tab-nav');
  if (!nav || !order?.length) return;
  // diet이 없으면 workout 앞에 삽입
  if (!order.includes('diet')) {
    const wIdx = order.indexOf('workout');
    order.splice(wIdx >= 0 ? wIdx : 1, 0, 'diet');
  }
  const settingsBtn = nav.querySelector('.tab-btn-settings');
  order.forEach(tabId => {
    const btn = nav.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) nav.insertBefore(btn, settingsBtn);
  });
}

// ── 하단 탭 가시성 ──────────────────────────────────────────────
const ALL_CONFIGURABLE_TABS = [
  { id: 'home',     icon: '🏠', label: '홈',      fixed: true },
  { id: 'diet',     icon: '🥗', label: '식단' },
  { id: 'workout',  icon: '💪', label: '운동' },
  { id: 'calendar', icon: '📆', label: '캘린더' },
  { id: 'finance',  icon: '💰', label: '재무' },
  { id: 'stats',    icon: '📊', label: '통계' },
];

function _applyVisibleTabs(visibleTabs) {
  const nav = document.getElementById('tab-nav');
  if (!nav) return;
  const dynamicContainer = document.getElementById('more-menu-dynamic-tabs');
  if (dynamicContainer) dynamicContainer.innerHTML = '';

  ALL_CONFIGURABLE_TABS.forEach(t => {
    if (t.fixed) return; // 홈은 항상 표시
    const btn = nav.querySelector(`.tab-btn[data-tab="${t.id}"]`);
    if (!btn) return;
    const isVisible = visibleTabs.includes(t.id);
    btn.style.display = isVisible ? '' : 'none';

    // 하단 탭에 없는 항목은 더보기 메뉴에 표시
    if (!isVisible && dynamicContainer) {
      const item = document.createElement('button');
      item.className = 'more-menu-item tab-btn';
      item.dataset.tab = t.id;
      item.textContent = `${t.icon} ${t.label}`;
      item.onclick = () => { switchTab(t.id); toggleMoreMenu(); };
      dynamicContainer.appendChild(item);
    }
  });
}

function openTabSettingsModal() {
  const list = document.getElementById('tab-settings-list');
  if (!list) return;
  const current = getVisibleTabs();
  list.innerHTML = ALL_CONFIGURABLE_TABS.filter(t => !t.fixed).map(t => {
    const checked = current.includes(t.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius-md);background:var(--surface2);cursor:pointer;">
      <input type="checkbox" data-tab-id="${t.id}" ${checked} style="width:18px;height:18px;accent-color:var(--primary);">
      <span style="font-size:18px;">${t.icon}</span>
      <span style="font-size:14px;font-weight:500;color:var(--text);">${t.label}</span>
    </label>`;
  }).join('');
  document.getElementById('tab-settings-modal').classList.add('open');
}

function closeTabSettingsModal(e) {
  if (e && e.target !== document.getElementById('tab-settings-modal')) return;
  document.getElementById('tab-settings-modal').classList.remove('open');
}

async function saveTabSettingsFromModal() {
  const checks = document.querySelectorAll('#tab-settings-list input[data-tab-id]');
  const selected = ['home']; // 홈은 항상 포함
  checks.forEach(c => { if (c.checked) selected.push(c.dataset.tabId); });
  await saveVisibleTabs(selected);
  _applyVisibleTabs(selected);
  document.getElementById('tab-settings-modal').classList.remove('open');
  showToast('탭 설정이 저장되었습니다');
}

window.openTabSettingsModal = openTabSettingsModal;
window.closeTabSettingsModal = closeTabSettingsModal;
window.saveTabSettingsFromModal = saveTabSettingsFromModal;

// ── 목표 및 퀨스트 모달 함수는 app-modal-*.js에서 import됨 ───────────────

// ── 구역 제목 편집 ────────────────────────────────────────────────
function editSectionTitle(key) {
  document.getElementById('section-title-key').value   = key;
  document.getElementById('section-title-input').value = getSectionTitle(key);
  _openModal('section-title-modal');
}

function closeSectionTitleModal(e) { _closeModal('section-title-modal', e); }

async function saveSectionTitleFromModal() {
  const key   = document.getElementById('section-title-key').value;
  const title = document.getElementById('section-title-input').value.trim();
  if (!title) return;
  await saveSectionTitle(key, title);
  // DOM 즉시 반영
  const el = document.getElementById(`title-${key}`);
  if (el) el.textContent = title;
  document.getElementById('section-title-modal').classList.remove('open');
  showToast('저장되었습니다');
}

// ── 미니 메모 (체크리스트) ────────────────────────────────────────
async function addMiniMemoItem() {
  const input = document.getElementById('mini-memo-new-input');
  const text  = input.value.trim();
  if (!text) return;
  const items = getMiniMemoItems();
  items.push({ id: `memo_${Date.now()}`, text, checked: false });
  await saveMiniMemoItems(items);
  input.value = '';
  renderHome();
}

async function toggleMiniMemoItem(id) {
  const items = getMiniMemoItems().map(item =>
    item.id === id ? { ...item, checked: !item.checked } : item
  );
  await saveMiniMemoItems(items);
  renderHome();
}

async function deleteMiniMemoItem(id) {
  const items = getMiniMemoItems().filter(item => item.id !== id);
  await saveMiniMemoItems(items);
  renderHome();
}

// ── 주가 매입 정보 모달 ──────────────────────────────────────────
function openStockPurchaseModal(sym) {
  const purchases = getStockPurchases();
  const p = purchases[sym] || {};
  document.getElementById('sp-sym').value        = sym;
  document.getElementById('sp-sym-display').textContent = sym;
  document.getElementById('sp-date').value        = p.date   || '';
  document.getElementById('sp-price').value       = p.price  || '';
  document.getElementById('sp-qty').value         = p.qty    || '';
  document.getElementById('sp-amount').value      = p.amount || '';
  document.getElementById('sp-delete-btn').style.display = p.date ? 'block' : 'none';
  document.getElementById('stock-purchase-modal').classList.add('open');
}

function closeStockPurchaseModal(e) { _closeModal('stock-purchase-modal', e); }

async function saveStockPurchaseFromModal() {
  const sym    = document.getElementById('sp-sym').value;
  const date   = document.getElementById('sp-date').value;
  const price  = parseFloat(document.getElementById('sp-price').value) || 0;
  const qty    = parseFloat(document.getElementById('sp-qty').value)   || 0;
  let   amount = parseFloat(document.getElementById('sp-amount').value) || 0;
  if (!date || !price) { alert('날짜와 매입가를 입력해주세요.'); return; }
  if (!qty && !amount) { alert('매입수량 또는 매입금액을 입력해주세요.'); return; }
  // 수량 있으면 금액 자동 계산 (미입력 시)
  if (qty && !amount) amount = parseFloat((price * qty).toFixed(2));
  await saveStockPurchase(sym, { date, price, qty: qty || null, amount });
  document.getElementById('stock-purchase-modal').classList.remove('open');
  loadStocks(); // 재렌더
}

async function deleteStockPurchaseFromModal() {
  const sym = document.getElementById('sp-sym').value;
  if (!confirm('매입 정보를 삭제할까요?')) return;
  await saveStockPurchase(sym, null);
  document.getElementById('stock-purchase-modal').classList.remove('open');
  loadStocks();
}

// ── 캘린더 이벤트 모달 ───────────────────────────────────────────
let _calEventId = null;
let _calEventColor = '#f59e0b';
let _calEventStyle = 'bar';

function openCalEventModal(startDate, endDate, eventId) {
  _calEventId    = eventId || null;
  _calEventColor = '#f59e0b';
  _calEventStyle = localStorage.getItem('event_view_mode') || 'bar'; // 신규 이벤트 기본값

  if (eventId) {
    const ev = getEvents().find(e => e.id === eventId);
    if (ev) {
      _calEventColor = ev.color || '#f59e0b';
      _calEventStyle = ev.displayMode || 'bar';
      document.getElementById('cal-event-title').value = ev.title || '';
      document.getElementById('cal-event-start').value = ev.start || startDate;
      document.getElementById('cal-event-end').value   = ev.end   || endDate;
    }
    document.getElementById('cal-event-modal-title').textContent = '📅 일정 수정';
    document.getElementById('cal-event-delete-btn').style.display = 'block';
  } else {
    document.getElementById('cal-event-title').value = '';
    document.getElementById('cal-event-start').value = startDate || '';
    document.getElementById('cal-event-end').value   = endDate   || startDate || '';
    document.getElementById('cal-event-modal-title').textContent = '📅 일정 추가';
    document.getElementById('cal-event-delete-btn').style.display = 'none';
  }

  // 색상 스와치 업데이트
  document.querySelectorAll('.event-color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === _calEventColor);
  });
  document.getElementById('cal-event-modal').classList.add('open');
  _updateEventStyleBtns();
}

function closeCalEventModal(e) { _closeModal('cal-event-modal', e); }

function selectEventColor(color) {
  _calEventColor = color;
  document.querySelectorAll('.event-color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === color);
  });
}

async function saveCalEventFromModal() {
  const title    = document.getElementById('cal-event-title').value.trim();
  const start    = document.getElementById('cal-event-start').value;
  const end      = document.getElementById('cal-event-end').value;
  if (!title) { alert('일정 이름을 입력해주세요.'); return; }
  if (!start || !end) { alert('기간을 입력해주세요.'); return; }
  if (end < start) { alert('종료일이 시작일보다 빠릅니다.'); return; }

  const isNew = !_calEventId;
  const existing = isNew ? null : getEvents().find(e => e.id === _calEventId);

  // 시간 정보 분리: "영화모임 다섯시반" → title:"영화모임", startTime:"17:30"
  const { parseTimeFromTitle } = await import('./gcal-sync.js');
  const timeParsed = parseTimeFromTitle(title);
  const cleanTitle = timeParsed?.cleanTitle || title;
  const startTime = timeParsed ? `${String(timeParsed.hour).padStart(2,'0')}:${String(timeParsed.minute).padStart(2,'0')}` : (existing?.startTime || null);

  const ev = {
    id:    _calEventId || `ev_${Date.now()}`,
    title: cleanTitle, start, end, color: _calEventColor,
    displayMode: _calEventStyle,
    startTime,
    gcalId: existing?.gcalId || null,
  };
  await saveEvent(ev);

  // Google Calendar 동기화
  if (isGCalConnected()) {
    if (isNew || !ev.gcalId) {
      const gcalId = await syncCreateToGCal(ev);
      if (gcalId) { ev.gcalId = gcalId; await saveEvent(ev); }
    } else {
      await syncUpdateToGCal(ev);
    }
  }

  document.getElementById('cal-event-modal').classList.remove('open');
  renderMonthlyCalendar();
  renderCalendar();
}

async function deleteCalEventFromModal() {
  if (!_calEventId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;
  const ev = getEvents().find(e => e.id === _calEventId);
  const result = await deleteEvent(_calEventId);
  if (result.success) {
    // Google Calendar에서도 삭제
    if (isGCalConnected() && ev?.gcalId) {
      await syncDeleteToGCal(ev.gcalId);
    }
    document.getElementById('cal-event-modal').classList.remove('open');
    renderMonthlyCalendar();
    renderCalendar();
  } else {
    alert(`⚠️ 일정 삭제 실패: ${result.error}`);
  }
}

// ── 월간 캘린더 모달 ──────────────────────────────────────────────
function openMonthlyCalendarModal(year, month) {
  const content = document.getElementById('monthly-calendar-modal-content');
  if (!content) return;
  renderMonthlyCalendarInModal(year, month, content);
  document.getElementById('monthly-calendar-modal').classList.add('open');
}

function closeMonthlyCalendarModal(e) { _closeModal('monthly-calendar-modal', e); }

// ── 이벤트 표시 모드 전환 (바 ↔ 화살표) ─────────────────────────
function toggleEventViewMode() {
  const current = localStorage.getItem('event_view_mode') || 'bar';
  const next = current === 'bar' ? 'arrow' : 'bar';
  localStorage.setItem('event_view_mode', next);
  _updateEventViewToggle();
  renderCalendar();
  renderMonthlyCalendar();
}

function _updateEventViewToggle() {
  const btn = document.getElementById('event-view-toggle');
  if (!btn) return;
  const mode = localStorage.getItem('event_view_mode') || 'bar';
  btn.textContent = mode === 'bar' ? '━ 바' : '→ 선';
}

function _updateEventStyleBtns() {
  const barBtn = document.getElementById('evt-style-bar');
  const arrowBtn = document.getElementById('evt-style-arrow');
  if (barBtn) barBtn.style.borderColor = _calEventStyle === 'bar' ? 'var(--accent)' : 'var(--border)';
  if (arrowBtn) arrowBtn.style.borderColor = _calEventStyle === 'arrow' ? 'var(--accent)' : 'var(--border)';
}

function setEventViewFromModal(mode) {
  _calEventStyle = mode;
  // 새 이벤트의 기본값도 업데이트
  localStorage.setItem('event_view_mode', mode);
  _updateEventStyleBtns();
  _updateEventViewToggle();
}

// CSV 내보내기 ─────────────────────────────────────────────────
function openExportModal() {
  document.getElementById('export-modal').classList.add('open');
}
function closeExportModal(e) { _closeModal('export-modal', e); }
function runExportCSV(period) {
  exportCSV(period);
  document.getElementById('export-modal').classList.remove('open');
}

// ── 설정 모달 ────────────────────────────────────────────────────
function openSettingsModal() {
  document.getElementById('cfg-anthropic').value = localStorage.getItem('cfg_anthropic') || '';
  _updateGCalStatus();
  _renderNutritionDBList();
  _renderCalendarRowsSettings();
  document.getElementById('settings-modal').classList.add('open');
}

function _renderCalendarRowsSettings() {
  const container = document.getElementById('settings-calendar-rows');
  if (!container) return;
  const rows = getCalendarRows();
  container.innerHTML = rows.map((r, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:16px;">${r.emoji || '📌'}</span>
      <span style="flex:1;font-size:13px;font-weight:500;color:var(--text);">${r.label}</span>
      ${['gym','diet'].includes(r.id)
        ? '<span style="font-size:10px;color:var(--text-tertiary);">기본</span>'
        : `<button onclick="removeCalendarRow(${i})" style="background:none;border:none;color:var(--text-tertiary);font-size:14px;cursor:pointer;">✕</button>`
      }
    </div>
  `).join('');
}

window.addCalendarRow = async function() {
  const label = prompt('활동 이름을 입력하세요 (예: 요가, 수영, 러닝)');
  if (!label?.trim()) return;
  const emoji = prompt('이모지를 입력하세요 (예: 🧘, 🏊, 🏃)', '📌') || '📌';
  const rows = getCalendarRows();
  rows.push({ id: 'custom_' + Date.now(), label: label.trim(), emoji });
  await saveCalendarRows(rows);
  _renderCalendarRowsSettings();
  if (window.renderCalendar) renderCalendar();
};

window.removeCalendarRow = async function(index) {
  const rows = getCalendarRows();
  if (['gym','diet'].includes(rows[index]?.id)) return; // 기본 행 삭제 방지
  rows.splice(index, 1);
  await saveCalendarRows(rows);
  _renderCalendarRowsSettings();
  if (window.renderCalendar) renderCalendar();
};

function _renderNutritionDBList() {
  const container = document.getElementById('settings-nutrition-db-list');
  if (!container) return;
  const db = getNutritionDB();
  if (!db.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px">DB가 비어 있어요</div>';
    return;
  }
  container.innerHTML = db.map(item => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text)">${item.name}${item.unit ? ` <span style="font-weight:400;color:var(--muted)">(${item.unit})</span>` : ''}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:1px">${item.kcal}kcal ${item.protein!=null?`단${item.protein}g`:''} ${item.carbs!=null?`탄${item.carbs}g`:''} ${item.fat!=null?`지${item.fat}g`:''}</div>
      </div>
      <button style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;padding:4px" onclick="openNutritionItemEditor('${item.id}')">✏️</button>
      <button style="background:none;border:none;color:var(--diet-bad);font-size:14px;cursor:pointer;padding:4px" onclick="_quickDeleteNutritionItem('${item.id}')">✕</button>
    </div>`).join('');
}

async function _quickDeleteNutritionItem(id) {
  if (!confirm('삭제할까요?')) return;
  await deleteNutritionItem(id);
  _renderNutritionDBList();
}
window._quickDeleteNutritionItem = _quickDeleteNutritionItem;

function closeSettingsModal(e) { _closeModal('settings-modal', e); }
function saveSettings() {
  const anthropic = document.getElementById('cfg-anthropic').value.trim();
  if (anthropic) localStorage.setItem('cfg_anthropic', anthropic);

  document.getElementById('settings-modal').classList.remove('open');
  showToast('설정이 저장되었습니다');
  loadStocks();
}

// ── Google Calendar 연동 ──────────────────────────────────────────
function _updateGCalStatus() {
  const statusEl = document.getElementById('gcal-status');
  const connectBtn = document.getElementById('gcal-connect-btn');
  const disconnectBtn = document.getElementById('gcal-disconnect-btn');
  const syncBtn = document.getElementById('gcal-sync-btn');
  if (!statusEl) return;

  if (isGCalConnected()) {
    statusEl.textContent = '연결됨';
    statusEl.style.color = '#10b981';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = '';
    syncBtn.style.display = '';
  } else {
    statusEl.textContent = '미연결';
    statusEl.style.color = 'var(--muted)';
    connectBtn.style.display = '';
    disconnectBtn.style.display = 'none';
    syncBtn.style.display = 'none';
  }
}

async function connectGCal() {
  const ok = await connectGoogleCalendar();
  if (ok) {
    _updateGCalStatus();
    await syncGCalNow();
  }
}

function disconnectGCal() {
  disconnectGoogleCalendar();
  _updateGCalStatus();
}

async function syncGCalNow() {
  if (!isGCalConnected()) return;

  const syncBtn = document.getElementById('gcal-sync-btn');
  if (syncBtn) { syncBtn.textContent = '동기화 중...'; syncBtn.disabled = true; }

  try {
    // 1년 전 ~ 1년 후 범위로 동기화
    const now = new Date();
    const yearAgo = new Date(now); yearAgo.setFullYear(now.getFullYear() - 1);
    const yearLater = new Date(now); yearLater.setFullYear(now.getFullYear() + 1);
    const fmt = d => d.toISOString().substring(0, 10);

    const gcalEvents = await fetchGCalEvents(fmt(yearAgo), fmt(yearLater));
    const appEvents = getEvents();

    // Google Calendar에만 있는 이벤트 → 앱에 추가
    // + 제목에 시간이 포함되어 있으면 cleanTitle로 GCal 제목도 업데이트
    const { parseTimeFromTitle } = await import('./gcal-sync.js');
    for (const ge of gcalEvents) {
      const existing = appEvents.find(ae => ae.gcalId === ge.gcalId || ae.id === ge.id);
      if (!existing) {
        await saveEvent(ge);
        // 제목에서 시간 파싱됐거나 시간 오버라이드 → GCal 제목+시간 정리
        if (ge.gcalId && (ge._timeOverride || ge.startTime)) {
          await syncUpdateToGCal(ge);
        }
      } else {
        const changed = existing.title !== ge.title || existing.start !== ge.start || existing.end !== ge.end || existing.startTime !== ge.startTime;
        if (changed) {
          const updated = { ...existing, title: ge.title, start: ge.start, end: ge.end, color: ge.color, gcalId: ge.gcalId, startTime: ge.startTime || existing.startTime };
          await saveEvent(updated);
          if (ge.gcalId && (ge._timeOverride || ge.startTime)) {
            await syncUpdateToGCal(updated);
          }
        }
      }
    }

    // 앱에만 있고 gcalId 없는 이벤트 → Google Calendar에 push
    for (const ae of appEvents) {
      if (!ae.gcalId) {
        const gcalId = await syncCreateToGCal(ae);
        if (gcalId) { ae.gcalId = gcalId; await saveEvent(ae); }
      }
    }

    renderMonthlyCalendar();
    renderCalendar();
    console.log('[GCal] 동기화 완료');
  } catch (e) {
    console.error('[GCal] 동기화 오류:', e);
  } finally {
    if (syncBtn) { syncBtn.textContent = '지금 동기화'; syncBtn.disabled = false; }
  }
}

// ── 다이어트 플랜 모달 ────────────────────────────────────────────
async function openDietPlanModal() {
  if (!document.getElementById('dp-height')) {
    const { loadAndInjectModals } = await import('./modal-manager.js');
    await loadAndInjectModals();
  }
  if (!document.getElementById('dp-height')) { console.error('[diet] modal not found'); return; }
  const plan = getDietPlan();
  // 사용자가 직접 설정하지 않았으면 신체정보 비우기
  const hasData = plan._userSet;
  document.getElementById('dp-height').value       = hasData ? (plan.height || '') : '';
  document.getElementById('dp-age').value          = hasData ? (plan.age || '') : '';
  document.getElementById('dp-weight').value       = hasData ? (plan.weight || '') : '';
  document.getElementById('dp-bodyfat').value      = hasData ? (plan.bodyFatPct || '') : '';
  document.getElementById('dp-target-weight').value= hasData ? (plan.targetWeight || '') : '';
  document.getElementById('dp-target-bf').value    = hasData ? (plan.targetBodyFatPct || '') : '';
  document.getElementById('dp-start-date').value   = hasData ? (plan.startDate || '') : '';

  // 리피드 요일 버튼 초기화
  const refeedDays = plan.refeedDays || [0, 6];
  document.querySelectorAll('.refeed-day-btn').forEach(btn => {
    btn.classList.toggle('active', refeedDays.includes(parseInt(btn.dataset.dow)));
    btn.onclick = () => {
      btn.classList.toggle('active');
      _updateDietCalcPreview();
    };
  });

  // ── 고급 모드 초기화 ──
  const advSwitch = document.getElementById('dp-advanced-switch');
  const advBody   = document.getElementById('dp-advanced-body');
  const isAdv     = !!plan.advancedMode;
  advSwitch.classList.toggle('on', isAdv);
  advBody.style.display = isAdv ? '' : 'none';

  // 고급 모드 토글 클릭
  const toggleArea = document.getElementById('dp-advanced-toggle');
  toggleArea.onclick = () => {
    const on = advSwitch.classList.toggle('on');
    advBody.style.display = on ? '' : 'none';
  };

  // 감량 속도, 활동 계수, 리피드 (고급 모드로 이동)
  const dpLossRate = document.getElementById('dp-loss-rate');
  if (dpLossRate) dpLossRate.value = plan.lossRatePerWeek || 0.009;
  const actAdv = document.getElementById('dp-activity-adv');
  if (actAdv) actAdv.value = plan.activityFactor || 1.3;
  const dpRefeedKcal = document.getElementById('dp-refeed-kcal');
  if (dpRefeedKcal) dpRefeedKcal.value = plan.refeedKcal || 5000;

  // 매크로 비율 (데피싯)
  const dpDefP = document.getElementById('dp-def-protein');
  const dpDefC = document.getElementById('dp-def-carb');
  const dpDefF = document.getElementById('dp-def-fat');
  if (dpDefP) dpDefP.value = plan.deficitProteinPct ?? 41;
  if (dpDefC) dpDefC.value = plan.deficitCarbPct ?? 50;
  if (dpDefF) dpDefF.value = plan.deficitFatPct ?? 9;

  // 매크로 비율 (리피드)
  const dpRefP = document.getElementById('dp-ref-protein');
  const dpRefC = document.getElementById('dp-ref-carb');
  const dpRefF = document.getElementById('dp-ref-fat');
  if (dpRefP) dpRefP.value = plan.refeedProteinPct ?? 29;
  if (dpRefC) dpRefC.value = plan.refeedCarbPct ?? 60;
  if (dpRefF) dpRefF.value = plan.refeedFatPct ?? 11;

  // 허용 오차
  const dpTol = document.getElementById('dp-tolerance');
  if (dpTol) dpTol.value = plan.dietTolerance ?? 50;

  // 운동 칼로리 크레딧
  const exSwitch = document.getElementById('dp-exercise-credit-switch');
  const exBody   = document.getElementById('dp-exercise-credit-body');
  const isExOn   = !!plan.exerciseCalorieCredit;
  exSwitch.classList.toggle('on', isExOn);
  exBody.style.display = isExOn ? '' : 'none';
  exSwitch.onclick = (ev) => {
    ev.stopPropagation();
    const on = exSwitch.classList.toggle('on');
    exBody.style.display = on ? '' : 'none';
  };

  const dpExGym  = document.getElementById('dp-ex-gym');
  const dpExCF   = document.getElementById('dp-ex-cf');
  const dpExSwim = document.getElementById('dp-ex-swim');
  const dpExRun  = document.getElementById('dp-ex-run');
  if (dpExGym)  dpExGym.value  = plan.exerciseKcalGym ?? 250;
  if (dpExCF)   dpExCF.value   = plan.exerciseKcalCF ?? 300;
  if (dpExSwim) dpExSwim.value = plan.exerciseKcalSwimming ?? 200;
  if (dpExRun)  dpExRun.value  = plan.exerciseKcalRunning ?? 250;

  // 매크로 합계 검증 UI
  _updateMacroSum('dp-def-protein', 'dp-def-carb', 'dp-def-fat', 'dp-def-macro-sum');
  _updateMacroSum('dp-ref-protein', 'dp-ref-carb', 'dp-ref-fat', 'dp-ref-macro-sum');

  _updateDietCalcPreview();

  // 입력 변경 시 미리보기 자동 갱신
  ['dp-height','dp-age','dp-weight','dp-bodyfat','dp-target-weight','dp-target-bf',
   'dp-loss-rate','dp-refeed-kcal','dp-activity-adv',
   'dp-def-protein','dp-def-carb','dp-def-fat',
   'dp-ref-protein','dp-ref-carb','dp-ref-fat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = () => {
      _updateDietCalcPreview();
      _updateMacroSum('dp-def-protein', 'dp-def-carb', 'dp-def-fat', 'dp-def-macro-sum');
      _updateMacroSum('dp-ref-protein', 'dp-ref-carb', 'dp-ref-fat', 'dp-ref-macro-sum');
    };
  });

  document.getElementById('diet-plan-modal').classList.add('open');
}

function _updateMacroSum(pId, cId, fId, sumId) {
  const p = parseFloat(document.getElementById(pId)?.value) || 0;
  const c = parseFloat(document.getElementById(cId)?.value) || 0;
  const f = parseFloat(document.getElementById(fId)?.value) || 0;
  const sum = p + c + f;
  const el = document.getElementById(sumId);
  if (!el) return;
  el.textContent = `합계: ${sum}%`;
  el.className = 'dp-adv-macro-sum ' + (sum === 100 ? 'ok' : 'bad');
}

function _updateDietCalcPreview() {
  const preview = document.getElementById('dp-calc-preview');
  if (!preview) return;
  const isAdvanced = document.getElementById('dp-advanced-switch')?.classList.contains('on');
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value)       || 0,
    age:              parseFloat(document.getElementById('dp-age').value)          || 0,
    weight:           parseFloat(document.getElementById('dp-weight').value)       || 0,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value)      || 0,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value)|| 0,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value)    || 0,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value)    || 0.009,
    activityFactor:   isAdvanced ? (parseFloat(document.getElementById('dp-activity-adv')?.value) || 1.3) : 1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value)  || 5000,
    deficitProteinPct: isAdvanced ? (parseFloat(document.getElementById('dp-def-protein')?.value) || 41) : 41,
    deficitCarbPct:    isAdvanced ? (parseFloat(document.getElementById('dp-def-carb')?.value) || 50) : 50,
    deficitFatPct:     isAdvanced ? (parseFloat(document.getElementById('dp-def-fat')?.value) || 9) : 9,
    refeedProteinPct:  isAdvanced ? (parseFloat(document.getElementById('dp-ref-protein')?.value) || 29) : 29,
    refeedCarbPct:     isAdvanced ? (parseFloat(document.getElementById('dp-ref-carb')?.value) || 60) : 60,
    refeedFatPct:      isAdvanced ? (parseFloat(document.getElementById('dp-ref-fat')?.value) || 11) : 11,
  };
  if (!plan.weight || !plan.height || !plan.age) { preview.innerHTML = ''; return; }
  try {
    const m = calcDietMetrics(plan);
    preview.innerHTML = `
      <div class="diet-calc-row"><span>기초대사량(BMR)</span><strong>${m.bmr.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>유지대사량(TDEE)</span><strong>${m.tdee.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>제지방량(LBM)</span><strong>${m.lbm.toFixed(1)} kg</strong></div>
      <div class="diet-calc-row"><span>데피싯 데이 목표</span><strong>${m.deficit.kcal.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>리피드 데이 목표</span><strong>${m.refeed.kcal.toLocaleString()} kcal</strong></div>
      <div class="diet-calc-row"><span>주당 예상 감량</span><strong>${m.weeklyLossG}g</strong></div>
      <div class="diet-calc-row"><span>예상 기간</span><strong>약 ${Math.ceil(m.weeksNeeded)}주</strong></div>
    `;
  } catch(e) { preview.innerHTML = ''; }
}

function closeDietPlanModal(e) { _closeModal('diet-plan-modal', e); }

async function saveDietPlanFromModal() {
  const refeedDays = [...document.querySelectorAll('.refeed-day-btn.active')]
    .map(b => parseInt(b.dataset.dow));
  const isAdvanced = document.getElementById('dp-advanced-switch')?.classList.contains('on');
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value)       || null,
    age:              parseFloat(document.getElementById('dp-age').value)          || null,
    weight:           parseFloat(document.getElementById('dp-weight').value)       || null,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value)      || null,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value)|| null,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value)    || null,
    startDate:        document.getElementById('dp-start-date').value               || null,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value)    || 0.009,
    activityFactor:   isAdvanced ? (parseFloat(document.getElementById('dp-activity-adv')?.value) || 1.3) : 1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value)  || 5000,
    refeedDays,
    // 고급 모드 필드
    advancedMode:       isAdvanced,
    deficitProteinPct:  isAdvanced ? (parseFloat(document.getElementById('dp-def-protein')?.value) || 41) : 41,
    deficitCarbPct:     isAdvanced ? (parseFloat(document.getElementById('dp-def-carb')?.value) || 50) : 50,
    deficitFatPct:      isAdvanced ? (parseFloat(document.getElementById('dp-def-fat')?.value) || 9) : 9,
    refeedProteinPct:   isAdvanced ? (parseFloat(document.getElementById('dp-ref-protein')?.value) || 29) : 29,
    refeedCarbPct:      isAdvanced ? (parseFloat(document.getElementById('dp-ref-carb')?.value) || 60) : 60,
    refeedFatPct:       isAdvanced ? (parseFloat(document.getElementById('dp-ref-fat')?.value) || 11) : 11,
    dietTolerance:      isAdvanced ? (parseFloat(document.getElementById('dp-tolerance')?.value) ?? 50) : 50,
    exerciseCalorieCredit: isAdvanced && document.getElementById('dp-exercise-credit-switch')?.classList.contains('on'),
    exerciseKcalGym:    parseFloat(document.getElementById('dp-ex-gym')?.value) || 250,
    exerciseKcalCF:     parseFloat(document.getElementById('dp-ex-cf')?.value) || 300,
    exerciseKcalSwimming: parseFloat(document.getElementById('dp-ex-swim')?.value) || 200,
    exerciseKcalRunning: parseFloat(document.getElementById('dp-ex-run')?.value) || 250,
  };
  if (!plan.weight || !plan.height) { alert('키와 체중을 입력해주세요.'); return; }
  // 매크로 합계 검증
  if (isAdvanced) {
    const defSum = plan.deficitProteinPct + plan.deficitCarbPct + plan.deficitFatPct;
    const refSum = plan.refeedProteinPct + plan.refeedCarbPct + plan.refeedFatPct;
    if (defSum !== 100 || refSum !== 100) {
      alert(`매크로 비율 합계가 100%가 아닙니다.\n데피싯: ${defSum}% / 리피드: ${refSum}%`);
      return;
    }
  }
  await saveDietPlan(plan);
  document.getElementById('diet-plan-modal').classList.remove('open');
  showToast('플랜이 저장되었습니다');
  renderAll();
}

// ── 체크인 모달 ───────────────────────────────────────────────────
let _checkinId = null;

function openCheckinModal(id) {
  _checkinId = id || null;
  if (id) {
    const rec = getBodyCheckins().find(c => c.id === id);
    if (rec) {
      document.getElementById('ci-date').value   = rec.date || '';
      document.getElementById('ci-weight').value = rec.weight || '';
      document.getElementById('ci-bodyfat').value= rec.bodyFatPct || '';
      document.getElementById('ci-note').value   = rec.note || '';
    }
    document.getElementById('ci-delete-btn').style.display = 'inline-block';
  } else {
    const t = TODAY;
    document.getElementById('ci-date').value   = dateKey(t.getFullYear(), t.getMonth(), t.getDate());
    document.getElementById('ci-weight').value = '';
    document.getElementById('ci-bodyfat').value= '';
    document.getElementById('ci-note').value   = '';
    document.getElementById('ci-delete-btn').style.display = 'none';
  }
  document.getElementById('checkin-modal').classList.add('open');
}

function closeCheckinModal(e) { _closeModal('checkin-modal', e); }

async function saveCheckinFromModal() {
  const date   = document.getElementById('ci-date').value;
  const weight = parseFloat(document.getElementById('ci-weight').value);
  const bf     = parseFloat(document.getElementById('ci-bodyfat').value);
  const note   = document.getElementById('ci-note').value.trim();
  if (!date || !weight) { alert('날짜와 체중을 입력해주세요.'); return; }
  const rec = {
    id:         _checkinId || `ci_${Date.now()}`,
    date,
    weight,
    bodyFatPct: bf || null,
    note:       note || null,
  };
  await saveBodyCheckin(rec);

  // 식단 플랜의 현재 체중도 동기화
  const plan = getDietPlan();
  if (plan._userSet && plan.weight) {
    await saveDietPlan({ weight });
  }

  document.getElementById('checkin-modal').classList.remove('open');
  renderAll();
}

async function deleteCheckinFromModal() {
  if (!_checkinId) return;
  if (!confirm('체크인 기록을 삭제할까요?')) return;
  await deleteBodyCheckin(_checkinId);
  document.getElementById('checkin-modal').classList.remove('open');
  renderAll();
}

// ── 영양 DB 검색 팝업 ─────────────────────────────────────────────
let _nutritionSearchMeal = null;
let _nutritionSearchCache = { db: [], csv: [], recent: [] }; // 검색 결과 캐시

async function openNutritionSearch(mealId) {
  _nutritionSearchMeal = mealId;
  window._nutritionSearchMeal = mealId;  // window에도 저장 (디버깅용)
  document.getElementById('nutrition-search-input').value = '';

  // CSV 데이터는 이미 백그라운드에서 로드됨 (injectModals에서)
  // 만약 로드되지 않았다면 여기서 로드
  if (!window._nutritionCSVLoaded) {
    try {
      const csvPath2 = window.location.pathname.replace(/\/[^/]*$/, '') + '/public/data/foods.csv';
      await loadCSVDatabase(csvPath2);
      window._nutritionCSVLoaded = true;
      console.log('[영양검색] CSV 로드됨:', csvPath2);
    } catch (e) {
      console.warn('[영양검색] CSV 로드 실패:', e);
    }
  }

  // 공공 식품DB + 농식품DB 백그라운드 로드
  Promise.all([_loadPublicFoodDB(), _loadAgriFoodDB()]).then(() => {
    const q = document.getElementById('nutrition-search-input')?.value?.trim();
    if (q) renderNutritionSearchResults();
  });

  // 초��: 최근 항목만 표시
  renderNutritionSearchInitial();
  document.getElementById('nutrition-search-modal').classList.add('open');
  setTimeout(() => document.getElementById('nutrition-search-input').focus(), 100);
}

function closeNutritionSearch(e) { _closeModal('nutrition-search-modal', e); }

// ── 공공데이터 식품영양성분 API ──────────────────────────────────────────
const _PUBLIC_FOOD_API = 'https://api.data.go.kr/openapi/tn_pubr_public_nutri_food_info_api';
const _PUBLIC_FOOD_KEY = 'e54c5a3ae4ee20df7abd68a1b14528ad309c2fbe25a9ab1128bf7e410414d59b';
let _publicFoodCache = null; // 전체 데이터 캐시
let _publicFoodLoading = false;

async function _loadPublicFoodDB() {
  if (_publicFoodCache) return _publicFoodCache;
  if (_publicFoodLoading) return [];

  // IndexedDB 캐시 확인
  try {
    const cached = localStorage.getItem('publicFoodDB');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < 7 * 86400000) { // 7일 캐시
        _publicFoodCache = parsed.data;
        console.log(`[식품DB] 캐시 로드: ${_publicFoodCache.length}건`);
        return _publicFoodCache;
      }
    }
  } catch {}

  _publicFoodLoading = true;
  console.log('[식품DB] API에서 전체 데이터 로딩 중...');

  try {
    const allItems = [];
    const pageSize = 1000;
    // 첫 페이지로 totalCount 확인
    const firstRes = await fetch(`${_PUBLIC_FOOD_API}?serviceKey=${_PUBLIC_FOOD_KEY}&pageNo=1&numOfRows=${pageSize}&type=json`);
    const firstData = await firstRes.json();
    const total = parseInt(firstData.response?.body?.totalCount || 0);
    const firstItems = firstData.response?.body?.items || [];
    firstItems.forEach(it => allItems.push(_parsePublicFoodItem(it)));

    const totalPages = Math.ceil(total / pageSize);
    console.log(`[식품DB] 총 ${total}건, ${totalPages}페이지`);

    // 나머지 페이지 병렬 로드 (5개씩)
    for (let batch = 2; batch <= totalPages; batch += 5) {
      const promises = [];
      for (let p = batch; p < batch + 5 && p <= totalPages; p++) {
        promises.push(
          fetch(`${_PUBLIC_FOOD_API}?serviceKey=${_PUBLIC_FOOD_KEY}&pageNo=${p}&numOfRows=${pageSize}&type=json`)
            .then(r => r.json())
            .then(d => (d.response?.body?.items || []).forEach(it => allItems.push(_parsePublicFoodItem(it))))
            .catch(() => {})
        );
      }
      await Promise.all(promises);
    }

    _publicFoodCache = allItems;
    console.log(`[식품DB] 로드 완료: ${allItems.length}건`);

    // localStorage 캐시 저장
    try {
      localStorage.setItem('publicFoodDB', JSON.stringify({ ts: Date.now(), data: allItems }));
    } catch { /* storage full */ }
  } catch (e) {
    console.error('[식품DB] 로드 실패:', e);
    _publicFoodCache = [];
  } finally {
    _publicFoodLoading = false;
  }
  return _publicFoodCache;
}

function _parsePublicFoodItem(raw) {
  const baseUnit = raw.nutConSrtrQua || '100g'; // 영양정보 기준 (100g or 100ml)
  const baseGrams = parseFloat(baseUnit) || 100;
  const foodSize = parseFloat(raw.foodSize) || 0; // 실제 1인분 총중량(g)
  const defaultWeight = foodSize > 0 && foodSize !== baseGrams ? foodSize : baseGrams;

  return {
    id: 'pub_' + (raw.foodCd || Math.random().toString(36).slice(2)),
    name: raw.foodNm || '',
    unit: baseUnit,
    defaultWeight,  // 1인분 기본 중량 (weight 모달 디폴트값)
    kcal: parseFloat(raw.enerc) || 0,
    protein: parseFloat(raw.prot) || 0,
    fat: parseFloat(raw.fatce) || 0,
    carbs: parseFloat(raw.chocdf) || 0,
    sugar: parseFloat(raw.sugar) || 0,
    sodium: parseFloat(raw.nat) || 0,
    fiber: parseFloat(raw.fibtg) || 0,
    _source: 'public_api',
  };
}

function searchPublicFoodDB(query) {
  if (!_publicFoodCache || !query) return [];
  const q = query.toLowerCase();
  return _publicFoodCache
    .filter(it => it.name && it.name.toLowerCase().includes(q))
    .slice(0, 20);
}

// ── 농촌진흥청 메뉴젠 식품영양성분 API ──────────────────────────────
const _AGRI_FOOD_API = 'https://apis.data.go.kr/1390803/AgriFood/MzenFoodNutri/getKoreanFoodIdntList';
const _AGRI_FOOD_KEY = 'e54c5a3ae4ee20df7abd68a1b14528ad309c2fbe25a9ab1128bf7e410414d59b';
let _agriFoodCache = null;
let _agriFoodLoading = false;

async function _loadAgriFoodDB() {
  if (_agriFoodCache) return _agriFoodCache;
  if (_agriFoodLoading) return [];

  // localStorage 캐시 확인
  try {
    const cached = localStorage.getItem('agriFoodDB');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.ts && Date.now() - parsed.ts < 7 * 86400000) {
        _agriFoodCache = parsed.data;
        console.log(`[농식품DB] 캐시 로드: ${_agriFoodCache.length}건`);
        return _agriFoodCache;
      }
    }
  } catch {}

  _agriFoodLoading = true;
  console.log('[농식품DB] API 로딩 중...');

  try {
    const allItems = [];
    // XML API → json 파라미터 시도, 안되면 XML 파싱
    const res = await fetch(`${_AGRI_FOOD_API}?serviceKey=${_AGRI_FOOD_KEY}&pageNo=1&numOfRows=1000&type=json`);
    if (!res.ok) {
      console.warn('[농식품DB] API 응답 에러:', res.status);
      _agriFoodCache = [];
      return [];
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // XML 응답인 경우 파싱
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      const items = xml.querySelectorAll('item');
      items.forEach(item => {
        const get = (tag) => item.querySelector(tag)?.textContent || '';
        allItems.push({
          id: 'agri_' + get('foodCd'),
          name: get('foodNm'),
          unit: '1인분',
          defaultWeight: parseFloat(get('servSize')) || parseFloat(get('foodSize')) || 100,
          kcal: parseFloat(get('enerc')) || 0,
          protein: parseFloat(get('prot')) || 0,
          fat: parseFloat(get('fatce')) || 0,
          carbs: parseFloat(get('chocdf')) || 0,
          _source: 'agri_api',
        });
      });
      _agriFoodCache = allItems;
      console.log(`[농식품DB] XML 파싱 완료: ${allItems.length}건`);
      try { localStorage.setItem('agriFoodDB', JSON.stringify({ ts: Date.now(), data: allItems })); } catch {}
      return allItems;
    }

    // JSON 응답 처리
    const body = data?.response?.body;
    const total = parseInt(body?.totalCount || 0);
    const items = body?.items || [];
    items.forEach(it => allItems.push(_parseAgriFoodItem(it)));

    // 나머지 페이지 로드
    const pageSize = 1000;
    const totalPages = Math.ceil(total / pageSize);
    for (let p = 2; p <= totalPages; p++) {
      try {
        const r = await fetch(`${_AGRI_FOOD_API}?serviceKey=${_AGRI_FOOD_KEY}&pageNo=${p}&numOfRows=${pageSize}&type=json`);
        const d = await r.json();
        (d?.response?.body?.items || []).forEach(it => allItems.push(_parseAgriFoodItem(it)));
      } catch {}
    }

    _agriFoodCache = allItems;
    console.log(`[농식품DB] 로드 완료: ${allItems.length}건`);
    try { localStorage.setItem('agriFoodDB', JSON.stringify({ ts: Date.now(), data: allItems })); } catch {}
  } catch (e) {
    console.warn('[농식품DB] 로드 실패:', e.message);
    _agriFoodCache = [];
  } finally {
    _agriFoodLoading = false;
  }
  return _agriFoodCache;
}

function _parseAgriFoodItem(raw) {
  return {
    id: 'agri_' + (raw.foodCd || raw.FOOD_CD || Math.random().toString(36).slice(2)),
    name: raw.foodNm || raw.FOOD_NM_KR || '',
    unit: '1인분',
    defaultWeight: parseFloat(raw.servSize || raw.SERVING_SIZE || raw.foodSize) || 100,
    kcal: parseFloat(raw.enerc || raw.AMT_NUM1) || 0,
    protein: parseFloat(raw.prot || raw.AMT_NUM3) || 0,
    fat: parseFloat(raw.fatce || raw.AMT_NUM4) || 0,
    carbs: parseFloat(raw.chocdf || raw.AMT_NUM7) || 0,
    _source: 'agri_api',
  };
}

function searchAgriFoodDB(query) {
  if (!_agriFoodCache || !query) return [];
  const q = query.toLowerCase();
  return _agriFoodCache
    .filter(it => it.name && it.name.toLowerCase().includes(q))
    .slice(0, 20);
}

// ── 검색 입력 디바운싱 (실시간 추천 유지 + 렌더링 최적화) ────────────────────
let _nutritionSearchTimer = null;
let _lastSearchQuery = null;

function debouncedNutritionSearch() {
  const q = (document.getElementById('nutrition-search-input').value || '').trim();

  // 검색어가 변경되지 않으면 무시
  if (q === _lastSearchQuery) return;
  _lastSearchQuery = q;

  // 검색어 있으면 즉시 결과 표시, 없으면 최근 항목만 표시
  clearTimeout(_nutritionSearchTimer);
  _nutritionSearchTimer = setTimeout(() => {
    if (q) {
      renderNutritionSearchResults();
    } else {
      renderNutritionSearchInitial();
    }
  }, 300);
}

// ── 영양 항목 렌더링 헬퍼 ────────────────────────────────────────────
function _renderNutritionRow(item, { icon = '🏠', removable = false, isCSV = false } = {}) {
  const itemDataKey = `_nutritionItem_${item.id}`;
  window[itemDataKey] = item;
  const kcal = isCSV ? (item.energy || 0) : (item.nutrition?.kcal || item.kcal || 0);
  const carbs = isCSV ? item.carbs : (item.nutrition?.carbs ?? item.carbs);
  const protein = isCSV ? item.protein : (item.nutrition?.protein ?? item.protein);
  const fat = isCSV ? item.fat : (item.nutrition?.fat ?? item.fat);
  const removeBtn = removable
    ? `<button onclick="event.stopPropagation(); removeFromFavorites('${item.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px;flex-shrink:0" title="즐겨찾기에서 제거">✕</button>`
    : '';
  return `
    <div class="nutrition-result-row"${removable ? ' style="display:flex;justify-content:space-between;align-items:center"' : ''}>
      <div onclick="selectNutritionItemFromCache('${itemDataKey}')" style="cursor:pointer;flex:1">
        <div class="nutrition-result-name">${icon} ${item.name}</div>
        <div class="nutrition-result-meta">
          ${item.defaultWeight && item.defaultWeight !== 100 ? `<span style="color:var(--primary);font-weight:600">1인분 ${item.defaultWeight}g · ${Math.round(kcal * item.defaultWeight / 100)}kcal</span>` : `<span>${(!isCSV && item.unit) ? item.unit : '100g'}</span><span>${kcal}kcal</span>`}
          ${carbs != null ? `<span>탄${carbs}g</span>` : ''}
          ${protein != null ? `<span>단${protein}g</span>` : ''}
          ${fat != null ? `<span>지${fat}g</span>` : ''}
        </div>
      </div>
      ${removeBtn}
    </div>`;
}

function _renderNutritionSection(title, items, options = {}) {
  if (!items.length) return '';
  return `<div style="font-size:12px;font-weight:600;color:${options.color || 'var(--text)'};padding:12px 8px;border-bottom:1px solid var(--border)${options.marginTop ? ';margin-top:8px' : ''}">${title}</div>`
    + items.map(item => _renderNutritionRow(item, options)).join('');
}

// ── 초기 검색 결과 (최근 항목만 표시) ────────────────────────────────────
function renderNutritionSearchInitial() {
  const container = document.getElementById('nutrition-search-results');
  const recentItems = getRecentNutritionItems(10);

  let html = _renderNutritionSection('⭐ 최근 항목', recentItems, { removable: true });
  html += _buildRecipeResultsHtml('');

  if (!recentItems.length && !getCookingRecords().some(r => r.ingredients?.length)) {
    html = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">검색어를 입력해주세요</div>`;
  }

  container.innerHTML = html;
}

async function renderNutritionSearchResults() {
  const q = (document.getElementById('nutrition-search-input').value || '').trim();
  const container = document.getElementById('nutrition-search-results');

  let html = '';
  let allNames = new Set();

  if (!q) {
    const recentItems = getRecentNutritionItems(10);
    const csvResults = searchCSVFood('');
    _nutritionSearchCache = { db: [], csv: csvResults, recent: recentItems };

    html += _renderNutritionSection(`⭐ 즐겨찾기 (최근 ${recentItems.length}개)`, recentItems, { removable: true });
    html += _renderNutritionSection('📊 CSV 데이터', csvResults.slice(0, 20), { icon: '📊', isCSV: true, marginTop: true });

    if (!recentItems.length && !csvResults.length) {
      html = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">DB가 비어 있어요. 아래에서 음식을 추가해보세요</div>`;
    }
  } else {
    const recentFiltered = getRecentNutritionItems(10).filter(n => n.name?.toLowerCase().includes(q.toLowerCase()));
    const dbResults = searchNutritionDB(q);
    const csvResults = searchCSVFood(q);
    _nutritionSearchCache = { db: dbResults, csv: csvResults, recent: recentFiltered };

    html += _renderNutritionSection('⭐ 즐겨찾기', recentFiltered, { removable: true, color: 'var(--accent)' });
    html += _renderNutritionSection('🏠 DB 검색 결과', dbResults.slice(0, 15), { marginTop: true });

    const dbNames = new Set([...dbResults, ...recentFiltered].map(r => r.name?.toLowerCase()));
    const dedupedCsv = csvResults.filter(c => !dbNames.has(c.name?.toLowerCase()));
    html += _renderNutritionSection('📊 CSV 검색 결과', dedupedCsv.slice(0, 15), { icon: '📊', isCSV: true, marginTop: true });

    // 먼저 CSV + DB 결과 표시 (즉시)
    allNames = new Set([...dbNames, ...dedupedCsv.map(c => c.name?.toLowerCase())]);

    // 공공API 로딩 표시 placeholder
    html += `<div id="gov-api-results-placeholder" style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px">🏛️ 공공 식품DB 검색 중...</div>`;

    html += _buildRecipeResultsHtml(q);

    if (!recentFiltered.length && !dbResults.length && !dedupedCsv.length && !html.includes('🍳 내 요리')) {
      // CSV/DB 결과 없으면 공공API 결과를 기다림 (아래에서 채워짐)
    }
  }

  // 맨 아래에 "직접 추가" 항목
  html += `<div style="padding:14px;text-align:center;border-top:1px solid var(--border);margin-top:8px">
    <button onclick="openNutritionDirectAdd()" style="background:none;border:1px dashed var(--accent);border-radius:8px;color:var(--accent);font-size:12px;font-weight:600;padding:10px 20px;cursor:pointer;width:100%">
      ➕ 직접 추가 (사진/텍스트 파싱)
    </button>
  </div>`;

  container.innerHTML = html;

  // 공공API 비동기 검색 (CSV/DB 결과 표시 후 추가)
  if (q) {
    try {
      const govResults = await searchGovFoodAPI(q);
      const placeholder = document.getElementById('gov-api-results-placeholder');
      if (placeholder && govResults && govResults.length > 0) {
        const dedupedGov = govResults.filter(g => !allNames?.has(g.name?.toLowerCase()));
        if (dedupedGov.length > 0) {
          // 공공API 결과를 nutrition-row 형태로 변환
          const govItems = dedupedGov.map(g => ({
            id: g.id,
            name: g.name,
            defaultWeight: g.defaultWeight || 100,
            unit: '100g',
            kcal: g.energy,
            protein: g.protein,
            fat: g.fat,
            carbs: g.carbs,
            _source: g.source || '공공DB',
          }));
          let govHtml = _renderNutritionSection(
            '🏛️ 공공 식품DB (자연식품 포함)',
            govItems.slice(0, 15),
            { icon: '🏛️', marginTop: false }
          );
          placeholder.outerHTML = govHtml;
        } else {
          placeholder.remove();
        }
      } else if (placeholder) {
        placeholder.remove();
      }
    } catch (e) {
      console.warn('[공공API] 검색 실패:', e);
      document.getElementById('gov-api-results-placeholder')?.remove();
    }
  }
}

// ── 식단 검색에서 직접 추가 → 저장 후 자동 weight 모달 ─────────────
function openNutritionDirectAdd() {
  window._onNutritionItemSaved = (savedItem) => {
    window._onNutritionItemSaved = null;
    if (!savedItem) return;
    // 저장된 항목을 바로 weight 모달로 열기
    const item = {
      id: savedItem.id,
      name: savedItem.name,
      servingSize: savedItem.servingSize || parseFloat(savedItem.unit?.match(/[\d.]+/)?.[0] || 100),
      unit: savedItem.unit || '100g',
      nutrition: savedItem.nutrition || { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    };
    if (window.openNutritionWeightModal) {
      window.openNutritionWeightModal(item);
    }
  };
  openNutritionItemEditor(null);
}

// 즐겨찾기에서만 제거 (DB는 건드리지 않음)
async function removeFromFavorites(itemId) {
  try {
    await deleteNutritionItem(itemId);
    renderNutritionSearchResults();
    console.log('[영양검색] 즐겨찾기에서 제거:', itemId);
  } catch (e) {
    console.error('[영양검색] 삭제 실패:', e);
  }
}

// ── 내 요리 → 식단에 추가 ──────────────────────────────────────────
function selectCookingRecipeForDiet(recipeId) {
  const recipe = getCookingRecords().find(r => r.id === recipeId);
  if (!recipe || !_nutritionSearchMeal) return;
  const ps = calcPerServing(recipe);
  if (!ps) return;

  const foodItem = {
    id: recipe.id,
    name: recipe.name,
    grams: ps.grams,
    kcal: ps.kcal,
    protein: ps.protein,
    carbs: ps.carbs,
    fat: ps.fat,
    recipeId: recipe.id,
  };

  wtAddFoodItem(_nutritionSearchMeal, foodItem);
  document.getElementById('nutrition-search-modal')?.classList.remove('open');
}

function _buildRecipeResultsHtml(q) {
  const recipes = getCookingRecords()
    .filter(r => r.ingredients?.length > 0)
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  if (!recipes.length) return '';

  let html = `<div style="font-size:12px;font-weight:600;color:var(--text);padding:12px 8px;border-bottom:1px solid var(--border);margin-top:8px">🍳 내 요리</div>`;
  html += recipes.slice(0, 10).map(r => {
    const ps = calcPerServing(r);
    if (!ps) return '';
    return `
      <div class="nutrition-result-row" onclick="selectCookingRecipeForDiet('${r.id}')" style="cursor:pointer">
        <div class="nutrition-result-name">🍳 ${r.name} <span style="color:var(--muted);font-size:10px">${r.servings||1}인분</span></div>
        <div class="nutrition-result-meta">
          <span>${ps.kcal}kcal</span>
          <span>탄${ps.carbs}g</span>
          <span>단${ps.protein}g</span>
          <span>지${ps.fat}g</span>
        </div>
      </div>`;
  }).join('');
  return html;
}

function selectNutritionItem(itemId) {
  // 캐시된 검색 결과에서 찾기
  let item = null;

  // 최근 항목에서 찾기
  if (_nutritionSearchCache.recent && _nutritionSearchCache.recent.length > 0) {
    item = _nutritionSearchCache.recent.find(n => n.id === itemId);
  }

  // DB 검색 결과에서 찾기
  if (!item && _nutritionSearchCache.db && _nutritionSearchCache.db.length > 0) {
    item = _nutritionSearchCache.db.find(n => n.id === itemId);
  }

  // CSV 검색 결과에서 찾기
  if (!item && _nutritionSearchCache.csv && _nutritionSearchCache.csv.length > 0) {
    item = _nutritionSearchCache.csv.find(c => c.id === itemId);
  }

  // 캐시가 없으면 DB 전체에서 찾기
  if (!item) {
    item = getNutritionDB().find(n => n.id === itemId);
  }

  console.log('[selectNutritionItem] 찾은 항목:', { itemId, item, cacheSize: { recent: _nutritionSearchCache.recent?.length, db: _nutritionSearchCache.db?.length, csv: _nutritionSearchCache.csv?.length } });

  if (!item || !_nutritionSearchMeal) {
    console.error('[selectNutritionItem] 항목을 찾을 수 없거나 meal이 없습니다:', { itemId, hasItem: !!item, hasMeal: !!_nutritionSearchMeal });
    return;
  }

  // 중량 설정 모달 열기
  openNutritionWeightModal(item);
}

// CSV/DB 항목을 전역 변수에서 직접 가져와서 열기
// (캐시 덮어쓰기 문제를 피하기 위해 항목 자체를 저장함)
function selectNutritionItemFromCache(itemDataKey) {
  const item = window[itemDataKey];

  if (!item) {
    console.error('[selectNutritionItemFromCache] 항목을 찾을 수 없습니다:', itemDataKey);
    return;
  }

  if (!_nutritionSearchMeal) {
    console.error('[selectNutritionItemFromCache] 선택된 meal이 없습니다');
    return;
  }

  console.log('[selectNutritionItemFromCache] 항목 열기:', { itemDataKey, item });
  openNutritionWeightModal(item);
}

// ── 영양 DB 항목 편집 모달 ────────────────────────────────────────
let _nutritionItemId = null;

// nutrition-item-modal.js에서 import한 함수들을 사용
// (app.js의 openNutritionItemEditor, saveNutritionItemFromModal, deleteNutritionItemFromModal 제거됨)

// ── 식품영양성분 DB 검색 (식품의약품안전처 / data.go.kr) ───────────
let _fsMeal = 'breakfast';
let _fsSelectedFood = null;   // { id, name, per100g: { kcal, protein, carbs, fat } }

function openFatSecretSearch(meal) {
  _fsMeal = meal;
  _fsSelectedFood = null;

  const modal         = document.getElementById('fatsecret-modal');
  const input         = document.getElementById('fs-search-input');
  const results       = document.getElementById('fs-results');
  const weightSection = document.getElementById('fs-weight-section');
  const noProxy       = document.getElementById('fatsecret-no-proxy');
  const body          = document.getElementById('fatsecret-search-body');

  if (input)         input.value = '';
  if (results)       results.innerHTML = '';
  if (weightSection) weightSection.style.display = 'none';

  const mealLabel = meal === 'breakfast' ? '아침' : meal === 'lunch' ? '점심' : meal === 'dinner' ? '저녁' : '간식';
  const titleEl   = modal.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = `🍖 음식 검색 — ${mealLabel}`;

  if (noProxy) noProxy.style.display = 'none';
  if (body)    body.style.display    = 'block';

  modal.classList.add('open');
  setTimeout(() => input?.focus(), 100);
}

function closeFatSecretSearch(e) { _closeModal('fatsecret-modal', e); }

function _renderFoodResults(foods) {
  return foods.map((food, idx) => {
    const isGov = (food.id || '').startsWith('gov_');
    const sourceTag = food.source || (isGov ? '공공DB' : 'CSV');
    const tagColor = sourceTag.includes('자연') ? '#10b981' : isGov ? '#06b6d4' : '#6b7280';
    return `
      <div class="fs-result-row" onclick="fatsecretSelectFoodById('${idx}')" style="cursor:pointer;padding:8px;border-bottom:1px solid var(--border);transition:background 0.2s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='transparent'">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="fs-result-name" style="font-weight:500">${food.name}</div>
          <div style="font-size:9px;padding:1px 6px;border-radius:8px;background:${tagColor};color:#fff">${sourceTag}</div>
        </div>
        <div style="font-size:10px;color:var(--muted)">${food.manufacturer || ''}</div>
        <div style="font-size:10px;color:var(--muted2)">에너지 ${food.energy}kcal | 단 ${food.protein}g | 지 ${food.fat}g | 탄 ${food.carbs}g</div>
      </div>`;
  }).join('');
}

async function fatsecretSearch() {
  const q = document.getElementById('fs-search-input').value.trim();
  if (!q) return;
  const results = document.getElementById('fs-results');
  results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">검색 중...</div>';

  try {
    // 1️⃣ 한국어 입력 → CSV 검색 시도
    if (/[\uAC00-\uD7AF]/.test(q)) {
      console.log('[검색] 한국어 감지:', q);

      // CSV 데이터 로드 (첫 검색 시에만)
      if (!window._csvLoaded) {
        try {
          await loadCSVDatabase(window.location.pathname.replace(/\/[^/]*$/, '') + '/public/data/foods.csv');
          window._csvLoaded = true;
          console.log('[CSV] 로드 완료');
        } catch (csvErr) {
          console.warn('[CSV] 로드 실패:', csvErr);
          window._csvDatabase = [];
        }
      }

      // CSV + 공공API 동시 검색 (자연식품도 함께 표시)
      const csvFoods = searchCSVFood(q);
      console.log('[CSV 검색 결과]', csvFoods.length, '개');

      // CSV 결과를 먼저 표시 (즉시)
      if (csvFoods && csvFoods.length > 0) {
        results.innerHTML = _renderFoodResults(csvFoods);
        window._fsSearchItems = csvFoods;
      }

      // 공공API도 병렬로 검색 (자연식품 커버)
      const govFoods = await searchGovFoodAPI(q);
      if (govFoods && govFoods.length > 0) {
        // 이름 중복 제거 후 합산 (공공API 자연식품 → 상단)
        const csvNames = new Set((csvFoods || []).map(f => f.name));
        const newGovFoods = govFoods.filter(f => !csvNames.has(f.name));
        const combined = [...newGovFoods, ...(csvFoods || [])].slice(0, 15);
        results.innerHTML = _renderFoodResults(combined);
        window._fsSearchItems = combined;
      } else if (!csvFoods || csvFoods.length === 0) {
        results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">검색 결과 없음</div>';
      }
      return;
    }

    // 2️⃣ 영문 등 비한국어 → CSV 검색 + 공공API fallback
    const csvFoods2 = searchCSVFood(q);
    if (csvFoods2 && csvFoods2.length > 0) {
      results.innerHTML = _renderFoodResults(csvFoods2);
      window._fsSearchItems = csvFoods2;
      return;
    }

    results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">공공DB 검색 중...</div>';
    const govFoods2 = await searchGovFoodAPI(q);
    if (!govFoods2 || govFoods2.length === 0) {
      results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">검색 결과 없음</div>';
      return;
    }
    results.innerHTML = _renderFoodResults(govFoods2);
    window._fsSearchItems = govFoods2;
  } catch(e) {
    console.error('[검색 오류]', e);
    results.innerHTML = `<div style="padding:12px;color:var(--diet-bad);font-size:12px">❌ 오류: ${e.message}</div>`;
  }
}

async function fatsecretSelectFoodById(idx) {
  const food = (window._fsSearchItems || [])[parseInt(idx)];
  if (!food) return;

  const analysisSection = document.getElementById('fs-analysis-section');
  if (analysisSection) {
    analysisSection.style.display = 'block';
  }

  // 선택된 식품 정보 표시
  const selectedName = document.getElementById('fs-selected-name');
  if (selectedName) selectedName.textContent = `🍽️ ${food.name}`;

  // 💡 CSV / 공공API 데이터 모두 지원
  const isGov = (food.id || '').startsWith('gov_');
  console.log(`[${isGov ? '공공API' : 'CSV'} 선택]`, food.name);
  const nutrition = {
    kcal: food.energy,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
  };

  // 영양정보 표시 (100g 기준)
  const sourceLabel = isGov ? (food.source || '공공DB') : 'CSV 데이터';
  const nutritionPreview = document.getElementById('fs-nutrition-preview');
  if (nutritionPreview) {
    nutritionPreview.innerHTML = `
      <strong>${sourceLabel}</strong><br>
      100g 기준: <strong>${nutrition.kcal}kcal</strong> |
      단백질 ${nutrition.protein}g | 지방 ${nutrition.fat}g | 탄수화물 ${nutrition.carbs}g
      ${food.manufacturer ? `<br><strong>${isGov ? '출처' : '제조사'}:</strong> ${food.manufacturer}` : ''}
    `;
  }

  // 선택된 식품 저장
  _fsSelectedFood = {
    id: food.id,
    name: food.name,
    per100g: nutrition,
    rawData: food,
  };

  // 중량 입력 초기값
  const gramsInput = document.getElementById('fs-grams-input');
  if (gramsInput) {
    gramsInput.value = '100';
    gramsInput.addEventListener('input', _updateFsCalcPreview);
  }

  _updateFsCalcPreview();
}

function _updateFsCalcPreview() {
  if (!_fsSelectedFood?.per100g) return;
  const grams = parseFloat(document.getElementById('fs-grams-input').value) || 0;
  const p     = _fsSelectedFood.per100g;
  const ratio = grams / 100;
  const el    = document.getElementById('fs-calc-preview');
  if (el) el.textContent = grams > 0
    ? `${Math.round(p.kcal*ratio)}kcal / 단${Math.round(p.protein*ratio*10)/10}g / 탄${Math.round(p.carbs*ratio*10)/10}g / 지${Math.round(p.fat*ratio*10)/10}g`
    : '';
}

function fatsecretAddFood() {
  if (!_fsSelectedFood) return;
  const grams = parseFloat(document.getElementById('fs-grams-input').value);
  if (!grams || grams <= 0) { alert('중량을 입력해주세요.'); return; }

  const p     = _fsSelectedFood.per100g;
  const ratio = grams / 100;
  wtAddFoodItem(_fsMeal, {
    id:      _fsSelectedFood.id,
    name:    _fsSelectedFood.name,
    grams,
    kcal:    Math.round(p.kcal    * ratio),
    protein: Math.round(p.protein * ratio * 10) / 10,
    carbs:   Math.round(p.carbs   * ratio * 10) / 10,
    fat:     Math.round(p.fat     * ratio * 10) / 10,
  });
  document.getElementById('fatsecret-modal').classList.remove('open');
}

function fatsecretBackToSearch() {
  document.getElementById('fs-analysis-section').style.display = 'none';
  document.getElementById('fs-search-input').focus();
  _fsSelectedFood = null;
}

// ── 초기화 ───────────────────────────────────────────────────────
async function init() {
  try {
    // 로그인 안 되어있으면 모달만 로드하고 대기
    const { getCurrentUser, loadSavedUser } = await import('./data.js');
    const user = loadSavedUser() || getCurrentUser();
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
    _applyTabOrder(getTabOrder());

    // 하단 탭 가시성 적용
    // 김태우(Guest)는 게스트 디폴트 강제 적용 (admin 설정 공유 무시)
    let visTabs;
    if (isAdminGuest()) {
      visTabs = DEFAULT_VIS_TABS;
    } else if (isAdmin()) {
      visTabs = getRawVisibleTabs() || ['home','diet','workout','calendar','finance','stats'];
    } else {
      visTabs = getRawVisibleTabs() || DEFAULT_VIS_TABS;
    }
    // diet 탭이 기존 설정에 없으면 추가 + 순서 강제 (홈→식단→운동→나머지)
    if (!visTabs.includes('diet')) {
      visTabs.push('diet');
    }
    // 순서 강제: 원하는 순서대로 정렬
    const TAB_ORDER = ['home','diet','workout','calendar','finance','stats'];
    visTabs.sort((a, b) => {
      const ai = TAB_ORDER.indexOf(a), bi = TAB_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    _applyVisibleTabs(visTabs);

    _initTabDrag();
    _initSwipeNavigation();

    // 어드민 전용 메뉴 표시
    if (isAdmin()) {
      const adminMenu = document.getElementById('admin-menu-items');
      if (adminMenu) adminMenu.style.display = '';
    }
    // 편지 버튼 표시 (모든 사용자)
    const letterBtn = document.getElementById('letter-btn');
    if (letterBtn) letterBtn.style.display = '';

    renderHome();

    // 첫 이용자 튜토리얼
    _showTutorialIfNeeded();

    // 홈 렌더링 후 즉시 로딩 화면 숨기기 (나머지는 백그라운드)
    const loadEl2 = document.getElementById('loading');
    if (loadEl2) { loadEl2.style.display = 'none'; loadEl2.classList.add('hidden'); }

    // 나머지 초기화는 비동기로 (체감 속도 개선)
    const bellBtn = document.getElementById('notif-bell');
    if (bellBtn) bellBtn.style.display = '';
    requestAnimationFrame(() => {
      refreshNotifCenter();
      renderCalendar();
      loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
      loadStocks();
    });

    // FCM 푸시 알림 초기화 (백그라운드)
    _initFCM();
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
    _showPWAInstallBanner();
    _updateInstallBtn();
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

// ── 첫 이용자 튜토리얼 (코치마크 스타일) ───────────────────────
function _showTutorialIfNeeded() {
  if (localStorage.getItem('tutorial_completed')) return;
  if (isAdmin()) { localStorage.setItem('tutorial_completed', '1'); return; }

  const steps = [
    {
      icon: '🍅',
      title: '내 토마토',
      desc: '4일간 식단 목표를 달성하면 토마토를 하나 수확해요. 매일 꾸준히 기록해보세요!',
      tab: 'home',
      target: '#hero-content',
      tabLabel: '홈',
      position: 'below',
    },
    {
      icon: '👋',
      title: '이웃과 함께해요',
      desc: '이웃을 맺으면 친구가 뭘 먹었는지, 무슨 운동을 했는지 볼 수 있어요. 좋아요와 응원 메시지도 남길 수 있답니다!',
      tab: 'home',
      target: '#card-friends',
      tabLabel: '홈',
      position: 'below',
    },
    {
      icon: '🍽️',
      title: '오늘의 칼로리',
      desc: '식단 탭에서 신체정보를 입력하면 하루 목표 칼로리가 자동 계산돼요. 아침·점심·저녁·간식을 기록하세요.',
      tab: 'diet',
      target: '#wt-diet-setup, .diet-grid',
      tabLabel: '식단',
      position: 'below',
    },
    {
      icon: '🔍',
      title: '가공식품도 검색 가능',
      desc: '라라스윗, 다논, 프로틴바 등 가공식품까지 모두 검색돼요. 영양 정보가 자동으로 입력됩니다.',
      tab: 'diet',
      target: '.diet-grid',
      tabLabel: '식단',
      position: 'above',
    },
    {
      icon: '💪',
      title: '운동 기록',
      desc: '헬스, 크로스핏, 수영, 런닝 등 다양한 운동을 기록할 수 있어요. 세트·횟수까지 상세하게!',
      tab: 'workout',
      target: '#wt-flow',
      tabLabel: '운동',
      position: 'below',
    },
  ];

  let currentStep = 0;

  function getOverlay() {
    let el = document.getElementById('tutorial-overlay');
    if (!el) { el = document.createElement('div'); el.id = 'tutorial-overlay'; document.body.appendChild(el); }
    return el;
  }

  function renderStep() {
    const s = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    // 기존 오버레이 즉시 제거 (깜빡임 방지)
    const prevOverlay = document.getElementById('tutorial-overlay');
    if (prevOverlay) prevOverlay.innerHTML = '';

    // 해당 탭으로 이동
    switchTab(s.tab);

    // 1단계: 탭 전환 후 타겟 요소를 뷰포트로 스크롤
    setTimeout(() => {
      const targetEl = s.target.split(',').map(sel => document.querySelector(sel.trim())).find(el => el && el.offsetHeight > 0);

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'instant', block: 'center' });
      }

      // 2단계: 스크롤 완료 후 좌표 계산 & 렌더
      requestAnimationFrame(() => { requestAnimationFrame(() => {
        _renderCoachOverlay(targetEl, s, isLast);
      }); });
    }, 400);
  }

  function _renderCoachOverlay(targetEl, s, isLast) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 타겟 뷰포트 좌표
    const rect = targetEl
      ? targetEl.getBoundingClientRect()
      : null;

    // 하이라이트: 타겟 상단 일부만 보여주되, 뷰포트 안에 맞춤
    // 타겟이 뷰포트보다 크면 상단 120px만 하이라이트
    const pad = 10;
    let hlTop, hlLeft, hlW, hlH;
    if (rect) {
      const maxHlH = Math.min(rect.height, 150); // 하이라이트 최대 높이 제한
      hlLeft = Math.max(rect.left - pad, 0);
      hlW = Math.min(rect.width + pad * 2, vw - hlLeft);
      // 하이라이트를 뷰포트 상단 30% ~ 50% 영역에 위치시키기
      hlTop = Math.max(rect.top - pad, 0);
      hlH = Math.min(maxHlH + pad * 2, vh * 0.4);
      // 뷰포트 밖으로 넘어가면 클램프
      if (hlTop + hlH > vh * 0.55) {
        hlH = Math.max(vh * 0.55 - hlTop, 60);
      }
    } else {
      hlTop = vh * 0.15; hlLeft = 16; hlW = vw - 32; hlH = 100;
    }
    const hlBottom = hlTop + hlH;

    // 툴팁: 항상 뷰포트 안에 위치 (하이라이트 아래, 공간 없으면 위)
    const gap = 14;
    const tooltipMinH = 220;
    const maxW = 400;
    const tooltipW = Math.min(maxW, vw - 32);

    // X 위치: 하이라이트 중심 정렬
    const hlCenterX = hlLeft + hlW / 2;
    let tooltipLeft = Math.round(hlCenterX - tooltipW / 2);
    tooltipLeft = Math.max(16, Math.min(tooltipLeft, vw - tooltipW - 16));

    // Y 위치: 아래 우선, 안 되면 위
    let tooltipTopVal;
    let arrowDir;
    const belowY = hlBottom + gap;
    const aboveBottomY = hlTop - gap;

    if (vh - belowY >= tooltipMinH) {
      // 아래에 충분한 공간
      tooltipTopVal = belowY;
      arrowDir = 'up';
    } else if (aboveBottomY >= tooltipMinH) {
      // 위에 충분한 공간 → bottom 기준
      tooltipTopVal = Math.max(aboveBottomY - tooltipMinH, 8);
      arrowDir = 'down';
    } else {
      // 둘 다 부족 → 뷰포트 하단에 고정, 하이라이트는 상단에 축소
      tooltipTopVal = vh - tooltipMinH - 16;
      arrowDir = 'up';
      // 하이라이트가 툴팁과 겹치지 않도록 축소
      if (hlBottom > tooltipTopVal - gap) {
        hlH = Math.max(tooltipTopVal - gap - hlTop, 40);
      }
    }

    // 툴팁이 뷰포트 밖으로 나가지 않도록 최종 클램프
    tooltipTopVal = Math.max(8, Math.min(tooltipTopVal, vh - tooltipMinH - 8));

    // 화살표 X 위치
    const arrowX = Math.max(20, Math.min(Math.round(hlCenterX - tooltipLeft), tooltipW - 20));

    const hlBottomFinal = hlTop + hlH;

    const overlay = getOverlay();
    overlay.innerHTML = `
      <div class="coach-backdrop" id="coach-backdrop">
        <svg class="coach-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="coach-mask">
              <rect width="100%" height="100%" fill="white"/>
              <rect x="${hlLeft}" y="${hlTop}" width="${hlW}" height="${hlH}" rx="16" fill="black"/>
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#coach-mask)"/>
        </svg>
        <div class="coach-highlight" style="top:${hlTop}px;left:${hlLeft}px;width:${hlW}px;height:${hlH}px;"></div>
        <div class="coach-tooltip coach-arrow-${arrowDir}" style="top:${tooltipTopVal}px;left:${tooltipLeft}px;width:${tooltipW}px;">
          <div class="coach-tooltip-head">
            <div class="coach-step-badge">${currentStep + 1} / ${steps.length}</div>
            <div class="coach-tab-badge">${s.tabLabel} 탭</div>
          </div>
          <div class="coach-tooltip-icon">${s.icon}</div>
          <div class="coach-tooltip-title">${s.title}</div>
          <div class="coach-tooltip-desc">${s.desc}</div>
          <div class="coach-tooltip-actions">
            ${currentStep > 0 ? '<button class="coach-btn coach-btn-ghost" id="tut-prev">이전</button>' : ''}
            <button class="coach-btn coach-btn-primary" id="tut-next">${isLast ? '시작하기!' : '다음'}</button>
          </div>
          <button class="coach-dismiss" id="tut-dismiss">건너뛰고 다시는 안보기</button>
        </div>
      </div>
    `;

    // 화살표 위치 동적 설정
    const tooltip = overlay.querySelector('.coach-tooltip');
    if (tooltip) tooltip.style.setProperty('--arrow-x', arrowX + 'px');

    // 이벤트 바인딩
    document.getElementById('tut-next')?.addEventListener('click', () => {
      if (isLast) { closeTutorial(); } else { currentStep++; renderStep(); }
    });
    document.getElementById('tut-prev')?.addEventListener('click', () => {
      if (currentStep > 0) { currentStep--; renderStep(); }
    });
    document.getElementById('tut-dismiss')?.addEventListener('click', closeTutorial);
    document.getElementById('coach-backdrop')?.addEventListener('click', (e) => {
      if (e.target.closest('.coach-tooltip')) return;
      if (isLast) { closeTutorial(); } else { currentStep++; renderStep(); }
    });

    // 리사이즈 시 위치 재계산
    window.addEventListener('resize', () => {
      const el = s.target.split(',').map(sel => document.querySelector(sel.trim())).find(el => el && el.offsetHeight > 0);
      if (el && document.getElementById('coach-backdrop')) {
        _renderCoachOverlay(el, s, isLast);
      }
    }, { once: true });
  }

  function closeTutorial() {
    localStorage.setItem('tutorial_completed', '1');
    import('./data.js').then(m => m.recordTutorialDone());
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
      overlay.classList.add('coach-fade-out');
      setTimeout(() => overlay.remove(), 250);
    }
    // 홈탭으로 복귀
    switchTab('home');
  }

  // 패치노트가 떠 있으면 패치노트 완료 후 시작, 아니면 바로 시작
  function startWhenReady() {
    const patchOverlay = document.getElementById('patchnote-overlay');
    if (patchOverlay) {
      // 패치노트가 떠 있음 → 닫힌 후 시작
      window.addEventListener('patchnote-done', () => {
        setTimeout(renderStep, 800);
      }, { once: true });
    } else {
      setTimeout(renderStep, 600);
    }
  }
  startWhenReady();
}

init();
_initDietInputButtons();

// ── window 등록 ──────────────────────────────────────────────────
window.renderAll                = renderAll;
window.renderHome               = renderHome;
window.switchTab                = switchTab;
window.changeYear               = changeYear;
window.toggleEventViewMode      = toggleEventViewMode;
window.setEventViewFromModal    = setEventViewFromModal;
window.changeMonthlyMonth       = changeMonthlyMonth;
window.setPeriod                = setPeriod;
window.getDietRec               = getDietRec;
window.getWorkoutRec            = getWorkoutRec;
// 운동·식단 탭
window.openWorkoutTab           = openWorkoutTab;
window.openSheet                = openWorkoutTab; // 레거시 호환 (render-calendar.js)
window.changeWorkoutDate        = changeWorkoutDate;
window.goToTodayWorkout         = goToTodayWorkout;
window.saveWorkoutDay           = saveWorkoutDay;
window._wtExports = { loadWorkoutDate };
window.wtSetGymStatus           = wtSetGymStatus;
window.wtSetCFStatus            = wtSetCFStatus;
window.wtToggleStretching       = wtToggleStretching;
window.wtToggleSwimming         = wtToggleSwimming;
window.wtToggleRunning          = wtToggleRunning;

// ── 운동 탭 새 UX: 상태 먼저 선택 (CSS 전환) ────────────────────
let _wtSelectedTypes = new Set();

window.wtSelectStatus = function(status) {
  const flow = document.getElementById('wt-flow');
  const badge = document.getElementById('wt-badge-text');

  flow.classList.add('wt-chosen');

  if (status === 'skip') {
    wtSetGymStatus('skip'); wtSetCFStatus('skip');
    badge.className = 'wt-status-badge wt-skip';
    badge.textContent = '오늘은 쉬었어요';
    flow.classList.remove('wt-show-type');
    document.getElementById('wt-memo-section').classList.add('wt-open');
    document.getElementById('wt-save-section').classList.add('wt-open');
    return;
  }
  if (status === 'health') {
    wtSetGymStatus('health'); wtSetCFStatus('health');
    badge.className = 'wt-status-badge wt-health';
    badge.textContent = '건강 이슈가 있어요';
    flow.classList.remove('wt-show-type');
    document.getElementById('wt-memo-section').classList.add('wt-open');
    document.getElementById('wt-save-section').classList.add('wt-open');
    return;
  }
  // 운동했어요
  badge.className = 'wt-status-badge wt-active';
  badge.textContent = '운동했어요 💪';
  flow.classList.add('wt-show-type');
  document.getElementById('wt-memo-section').classList.add('wt-open');
  document.getElementById('wt-save-section').classList.add('wt-open');
  _wtSelectedTypes.clear();
};

window.wtToggleType = function(type) {
  const chip = document.getElementById('wt-chip-' + type);
  if (_wtSelectedTypes.has(type)) {
    _wtSelectedTypes.delete(type);
    if (chip) chip.classList.remove('active');
  } else {
    _wtSelectedTypes.add(type);
    if (chip) chip.classList.add('active');
  }
  // 헬스 종목 영역
  const gym = document.getElementById('wt-gym-section');
  if (_wtSelectedTypes.has('gym')) gym.classList.add('wt-open');
  else gym.classList.remove('wt-open');
  // 상태 반영
  wtSetGymStatus(_wtSelectedTypes.has('gym') ? 'done' : 'none');
  wtSetCFStatus(_wtSelectedTypes.has('cf') ? 'done' : 'none');
  if (type === 'stretch') wtToggleStretching();
  if (type === 'swimming') wtToggleSwimming();
  if (type === 'running') wtToggleRunning();
};

window.wtResetStatus = function() {
  _wtSelectedTypes.clear();
  const flow = document.getElementById('wt-flow');
  flow.classList.remove('wt-chosen', 'wt-show-type');
  ['wt-gym-section','wt-memo-section','wt-save-section'].forEach(id =>
    document.getElementById(id)?.classList.remove('wt-open'));
  ['wt-chip-gym','wt-chip-cf','wt-chip-stretch','wt-chip-swimming','wt-chip-running'].forEach(id =>
    document.getElementById(id)?.classList.remove('active'));
  wtSetGymStatus('none'); wtSetCFStatus('none');
};
window.wtToggleWineFree         = wtToggleWineFree;

// 식단/운동 사진 업로드
window._mealPhotos = {}; // { breakfast: base64, lunch: base64, ... workout: base64 }
window.uploadMealPhoto = async function(meal, input) {
  const file = input.files?.[0];
  if (!file) return;
  const { imageToBase64 } = await import('./data.js');
  try {
    const b64 = await imageToBase64(file);
    window._mealPhotos[meal] = 'data:image/jpeg;base64,' + b64;
    const wrap = document.getElementById('wt-photo-' + meal);
    if (wrap) {
      const src = window._mealPhotos[meal];
      wrap.innerHTML = `<div class="meal-photo-frame" onclick="openMealPhotoLightbox(this.querySelector('img').src)">
        <img src="${src}">
        <button class="meal-photo-delete" onclick="event.stopPropagation();removeMealPhoto('${meal}')">✕</button>
      </div>`;
    }
  } catch(e) { console.error('Photo upload error:', e); }
  input.value = '';
};
window.removeMealPhoto = function(meal) {
  delete window._mealPhotos[meal];
  const wrap = document.getElementById('wt-photo-' + meal);
  if (wrap) wrap.innerHTML = '';
};
window.openMealPhotoLightbox = function(src) {
  const lb = document.createElement('div');
  lb.className = 'meal-photo-lightbox';
  lb.innerHTML = `<img src="${src}">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
};
window.wtToggleMealSkipped      = wtToggleMealSkipped;
// "안 먹었어요" — 토글 + 기존 음식 삭제
window.wtSkipMeal = function(meal) {
  const btn = document.getElementById(`wt-${meal}-skipped`);
  const wasActive = btn?.classList.contains('active');
  wtToggleMealSkipped(meal);
  // wtToggleMealSkipped 내부의 _renderMealSkippedToggles가 active를 설정
  // 하지만 혹시 안 되면 직접 토글
  if (btn) btn.classList.toggle('active', !wasActive);
  // 스킵 활성화 시 음식 삭제
  if (!wasActive) {
    const foodList = document.getElementById(`wt-foods-${meal}`);
    if (foodList) foodList.innerHTML = '';
    const mealInput = document.getElementById(`wt-meal-${meal}`);
    if (mealInput) mealInput.value = '';
  }
};
window.wtOpenExercisePicker     = wtOpenExercisePicker;
window.wtCloseExercisePicker    = wtCloseExercisePicker;
window.wtOpenExerciseEditor     = wtOpenExerciseEditor;
window.wtCloseExerciseEditor    = wtCloseExerciseEditor;
window.wtSaveExerciseFromEditor = wtSaveExerciseFromEditor;
window.wtDeleteExerciseFromEditor = wtDeleteExerciseFromEditor;
// 영화 탭
window.renderMovie              = renderMovie;
window.changeMovieMonth         = changeMovieMonth;
window.startMovieCrawl          = startMovieCrawl;
window.toggleMovieTagFilter     = toggleMovieTagFilter;
// 요리 탭
window.openCookingModal         = openCookingModal;
window.closeCookingModal        = closeCookingModal;
window.saveCookingFromModal     = saveCookingFromModal;
window.deleteCookingFromModal   = deleteCookingFromModal;
window.onCookingPhotoInput      = onCookingPhotoInput;
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
// 구역 제목
window.editSectionTitle         = editSectionTitle;
window.closeSectionTitleModal   = closeSectionTitleModal;
window.saveSectionTitleFromModal= saveSectionTitleFromModal;
// 미니 메모 (체크리스트)
window.addMiniMemoItem          = addMiniMemoItem;
window.toggleMiniMemoItem       = toggleMiniMemoItem;
window.deleteMiniMemoItem       = deleteMiniMemoItem;
// 주가 매입
window.openStockPurchaseModal   = openStockPurchaseModal;
window.closeStockPurchaseModal  = closeStockPurchaseModal;
window.saveStockPurchaseFromModal = saveStockPurchaseFromModal;
window.deleteStockPurchaseFromModal = deleteStockPurchaseFromModal;
// 캘린더 이벤트
window.openCalEventModal        = openCalEventModal;
window.closeCalEventModal       = closeCalEventModal;
window.selectEventColor         = selectEventColor;
window.saveCalEventFromModal    = saveCalEventFromModal;
window.deleteCalEventFromModal  = deleteCalEventFromModal;
window.openMonthlyCalendarModal = openMonthlyCalendarModal;
window.closeMonthlyCalendarModal = closeMonthlyCalendarModal;
// CSV
window.openExportModal          = openExportModal;
window.closeExportModal         = closeExportModal;
window.runExportCSV             = runExportCSV;
// 개발
window.renderDev           = renderDev;
window.submitDevTask       = submitDevTask;
// 와인
window.openWineModal            = openWineModal;
window.closeWineModal           = closeWineModal;
window.saveWineFromModal        = saveWineFromModal;
window.deleteWineFromModal      = deleteWineFromModal;
window.searchVivinoRating       = searchVivinoRating;
window.searchWineImage          = searchWineImage;
window.searchCriticRatings      = searchCriticRatings;
window.analyzeWinePreference    = analyzeWinePreference;
window.bulkSearchVivino         = bulkSearchVivino;
// 재무
window.renderFinance                = renderFinance;
window.refreshFinMarketData         = refreshFinMarketData;
window.runFinAIAnalysis             = runFinAIAnalysis;
window.openFinBenchmarkModal        = openFinBenchmarkModal;
window.closeFinBenchmarkModal       = closeFinBenchmarkModal;
window.saveFinBenchmarkFromModal    = saveFinBenchmarkFromModal;
window.deleteFinBenchmarkFromModal  = deleteFinBenchmarkFromModal;
window.deleteFinBenchmarkDirect     = deleteFinBenchmarkDirect;
window.openFinActualModal           = openFinActualModal;
window.closeFinActualModal          = closeFinActualModal;
window.saveFinActualFromModal       = saveFinActualFromModal;
window.deleteFinActualFromModal     = deleteFinActualFromModal;
window.openFinLoanModal             = openFinLoanModal;
window.closeFinLoanModal            = closeFinLoanModal;
window.saveFinLoanFromModal         = saveFinLoanFromModal;
window.deleteFinLoanFromModal       = deleteFinLoanFromModal;
window.openFinPositionModal         = openFinPositionModal;
window.closeFinPositionModal        = closeFinPositionModal;
window.saveFinPositionFromModal     = saveFinPositionFromModal;
window.deleteFinPositionFromModal   = deleteFinPositionFromModal;
window.toggleFlowChart              = toggleFlowChart;
window.openFinPlanModal             = openFinPlanModal;
window.closeFinPlanModal            = closeFinPlanModal;
window.saveFinPlanFromModal         = saveFinPlanFromModal;
window.deleteFinPlanFromModal       = deleteFinPlanFromModal;
window.deleteFinPlanDirect          = deleteFinPlanDirect;
window.addFinPlanEntry              = addFinPlanEntry;
window.onBudgetYearChange           = onBudgetYearChange;
window.onBudgetQChange              = onBudgetQChange;
window.openBudgetGroupModal         = openBudgetGroupModal;
window.deleteBudgetGroup            = deleteBudgetGroup;
window.openBudgetItemModal          = openBudgetItemModal;
window.closeBudgetItemModal         = closeBudgetItemModal;
window.saveBudgetItemFromModal      = saveBudgetItemFromModal;
window.deleteBudgetItemFromModal    = deleteBudgetItemFromModal;
window.deleteBudgetItem             = deleteBudgetItem;
window.editBudgetMonth              = editBudgetMonth;
window.editBudgetQGoal              = editBudgetQGoal;
window.openStockDetail              = openStockDetail;
window.closeStockDetailModal        = closeStockDetailModal;
window.switchStockDetailTab         = switchStockDetailTab;
window.changeStockChartRange        = changeStockChartRange;
window.toggleLiveAutoRefresh        = toggleLiveAutoRefresh;
window.changeLiveRange              = changeLiveRange;
window.openSwingBuy                 = openSwingBuy;
window.editSwingPosition            = editSwingPosition;
window.closeSwingPosition           = closeSwingPosition;
window.openPbBuy                    = openPbBuy;
window.editPbPosition               = editPbPosition;
window.closePbPosition              = closePbPosition;
// 설정
window.openSettingsModal        = openSettingsModal;
window.closeSettingsModal       = closeSettingsModal;
window.saveSettings             = saveSettings;
window.installPWA               = installPWA;
window.connectGCal              = connectGCal;
window.disconnectGCal           = disconnectGCal;
window.syncGCalNow              = syncGCalNow;
// 다이어트 플랜
window.openDietPlanModal        = openDietPlanModal;
window.closeDietPlanModal       = closeDietPlanModal;
window.saveDietPlanFromModal    = saveDietPlanFromModal;
// 체크인
window.openCheckinModal         = openCheckinModal;
window.closeCheckinModal        = closeCheckinModal;
window.saveCheckinFromModal     = saveCheckinFromModal;
window.deleteCheckinFromModal   = deleteCheckinFromModal;
// 영양 DB 검색
window.openNutritionSearch      = openNutritionSearch;
window.openNutritionDirectAdd   = openNutritionDirectAdd;
window.closeNutritionSearch     = closeNutritionSearch;
window.debouncedNutritionSearch = debouncedNutritionSearch;
window.renderNutritionSearchResults = renderNutritionSearchResults;
window.selectNutritionItem   = selectNutritionItem;
window.selectNutritionItemFromCache = selectNutritionItemFromCache;
window.removeFromFavorites   = removeFromFavorites;
window.selectCookingRecipeForDiet = selectCookingRecipeForDiet;
// 영양 DB 편집 (nutrition-item-modal.js에서 window에 이미 등록됨)
// 추가로 필요한 식단 탭 함수
window.openNutritionPhotoUpload = openNutritionPhotoUpload;
// FatSecret 음식 검색
window.openFatSecretSearch      = openFatSecretSearch;
window.closeFatSecretSearch     = closeFatSecretSearch;
window.fatsecretSearch           = fatsecretSearch;
window.fatsecretSelectFoodById   = fatsecretSelectFoodById;
window.fatsecretAddFood          = fatsecretAddFood;
window.fatsecretBackToSearch     = fatsecretBackToSearch;
window.wtAddFoodItem            = wtAddFoodItem;
window.wtRemoveFoodItem         = wtRemoveFoodItem;

// ── PWA 설치 (앱 다운로드) ────────────────────────────────────
// ── FCM 푸시 알림 초기화 ────────────────────────────────────────
async function _initFCM() {
  try {
    // Capacitor 네이티브 환경 확인
    if (window.Capacitor?.getPlatform?.() === 'android') {
      await _initFCMCapacitor();
      return;
    }

    // 이미 권한이 있으면 바로 토큰 등록
    if (Notification.permission === 'granted') {
      await _registerFCMToken();
      return;
    }

    // 이미 거부한 경우 재요청 불가
    if (Notification.permission === 'denied') return;

    // 이전에 "다음에" 눌렀으면 이번 세션에서는 안 물어봄
    if (sessionStorage.getItem('fcm_ask_later')) return;

    // 커스텀 안내 모달 표시 (soft ask)
    setTimeout(() => _showPushPermissionModal(), 2000);
  } catch(e) {
    console.warn('[FCM] 초기화 실패:', e);
  }
}

function _showPushPermissionModal() {
  const existing = document.getElementById('push-permission-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'push-permission-modal';
  modal.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center;animation:tds-fade-in 0.2s ease;">
    <div style="background:var(--surface);border-radius:20px 20px 0 0;width:100%;max-width:400px;padding:28px 24px 24px;animation:tds-slide-up 0.3s ease;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:48px;margin-bottom:14px;">🍅</div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:10px;line-height:1.4;">친구들이 보내는 응원 메시지,<br>바로 받아보시겠어요?</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:6px;">
          이웃이 남긴 댓글, 리액션, 방명록을<br>놓치지 않고 확인할 수 있어요.
        </div>
        <div style="display:inline-block;margin-top:8px;padding:6px 14px;border-radius:8px;background:var(--surface2);font-size:11px;color:var(--text-tertiary);line-height:1.5;">
          친구들끼리만 쓰는 앱이라 광고나 스팸은 없어요
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="push-perm-allow" style="width:100%;padding:14px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-size:15px;font-weight:700;cursor:pointer;">응원 알림 받기</button>
        <button id="push-perm-later" style="width:100%;padding:12px;border:none;border-radius:12px;background:none;color:var(--text-tertiary);font-size:13px;font-weight:500;cursor:pointer;">나중에</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);

  document.getElementById('push-perm-allow').onclick = async () => {
    modal.remove();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await _registerFCMToken();
    }
  };

  document.getElementById('push-perm-later').onclick = () => {
    modal.remove();
    sessionStorage.setItem('fcm_ask_later', '1');
  };
}

async function _registerFCMToken() {
  try {
    const { getMessaging, getToken, onMessage } = await import(
      "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js"
    );
    const { saveFcmToken } = await import('./data.js');
    const { initializeApp, getApps } = await import(
      "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js"
    );
    const apps = getApps();
    const app = apps.length ? apps[0] : initializeApp(CONFIG.FIREBASE);
    const messaging = getMessaging(app);

    const VAPID_KEY = 'BJDhMdCeKUGoXlAle3kS1BNQzdK-os-COSLftTtlWa-qilyv8C8Fc-TFQQNwXcIySZmIupicFsuH9cmjLY9gBZc';
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await saveFcmToken(token);
      console.log('[FCM] 토큰 등록 완료');
    }

    // 포그라운드 메시지 핸들러 (앱이 열려있을 때)
    onMessage(messaging, (payload) => {
      const body = payload.notification?.body || '새 알림이 도착했어요';
      const toastEl = document.createElement('div');
      toastEl.className = 'tds-toast show';
      toastEl.textContent = body;
      document.body.appendChild(toastEl);
      setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.remove(), 300); }, 3000);
      if (typeof refreshNotifCenter === 'function') refreshNotifCenter();
    });
  } catch(e) {
    console.warn('[FCM] 토큰 등록 실패:', e);
  }
}

async function _initFCMCapacitor() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { saveFcmToken } = await import('./data.js');

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('[FCM-Cap] 알림 권한 거부됨');
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      await saveFcmToken(token.value);
      console.log('[FCM-Cap] 토큰 등록 완료');
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[FCM-Cap] 등록 실패:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      // 앱 포그라운드에서 수신 시 토스트 표시
      const body = notification.body || '새 알림이 도착했어요';
      const toastEl = document.createElement('div');
      toastEl.className = 'tds-toast show';
      toastEl.textContent = body;
      document.body.appendChild(toastEl);
      setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.remove(), 300); }, 3000);
      if (typeof refreshNotifCenter === 'function') refreshNotifCenter();
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // 알림 클릭 시 앱으로 포커스 (Capacitor가 자동 처리)
      if (typeof refreshNotifCenter === 'function') refreshNotifCenter();
    });
  } catch(e) {
    console.warn('[FCM-Cap] 초기화 실패:', e);
  }
}

let _deferredInstallPrompt = null;

function _showPWAInstallBanner() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) return; // 이미 앱으로 실행 중
  if (sessionStorage.getItem('pwa_banner_dismissed')) return; // 이번 세션에서 이미 닫음

  setTimeout(() => {
    const existing = document.getElementById('pwa-install-banner');
    if (existing) return;

    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:var(--surface,#fff);border-top:1px solid var(--border,#e5e7eb);padding:16px 20px;box-shadow:0 -4px 20px rgba(0,0,0,0.1);animation:slideUp 0.3s ease;';
    banner.innerHTML = `
      <style>@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
      <div style="display:flex;align-items:center;gap:14px;max-width:480px;margin:0 auto;">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--primary,#22c55e);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🍅</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:var(--text,#111);">토마토 키우기 앱 설치</div>
          <div style="font-size:12px;color:var(--text-tertiary,#888);margin-top:2px;">${isIOS
            ? '홈 화면에 추가하면 앱처럼 사용할 수 있어요'
            : '설치하면 더 빠르고 편하게 사용할 수 있어요'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          ${isIOS
            ? `<button onclick="_showIOSInstallGuide()" style="padding:8px 16px;border:none;border-radius:999px;background:var(--primary,#22c55e);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">방법 보기</button>`
            : `<button onclick="installPWA();document.getElementById('pwa-install-banner')?.remove()" style="padding:8px 16px;border:none;border-radius:999px;background:var(--primary,#22c55e);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">설치</button>`
          }
          <button onclick="sessionStorage.setItem('pwa_banner_dismissed','1');document.getElementById('pwa-install-banner')?.remove()" style="padding:8px 10px;border:none;background:none;color:var(--text-tertiary,#888);font-size:16px;cursor:pointer;">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
  }, 1500);
}

window._showIOSInstallGuide = function() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
  sessionStorage.setItem('pwa_banner_dismissed', '1');

  const modal = document.createElement('div');
  modal.id = 'ios-install-guide';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center;" onclick="event.stopPropagation()">
      <div style="font-size:40px;margin-bottom:12px;">🍅</div>
      <div style="font-size:16px;font-weight:700;color:var(--text,#111);margin-bottom:16px;">홈 화면에 추가하기</div>
      <div style="text-align:left;font-size:13px;color:var(--text-secondary,#555);line-height:1.8;">
        <div style="padding:8px 0;border-bottom:1px solid var(--border,#e5e7eb);"><b>1.</b> 하단 Safari 메뉴에서 <span style="font-size:16px;vertical-align:middle;">⎋</span> <b>공유</b> 버튼 탭</div>
        <div style="padding:8px 0;border-bottom:1px solid var(--border,#e5e7eb);"><b>2.</b> <b>"홈 화면에 추가"</b> 선택</div>
        <div style="padding:8px 0;"><b>3.</b> 오른쪽 상단 <b>"추가"</b> 탭</div>
      </div>
      <button onclick="document.getElementById('ios-install-guide')?.remove()" style="margin-top:16px;width:100%;padding:12px;border:none;border-radius:999px;background:var(--primary,#22c55e);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">확인</button>
    </div>
  `;
  document.body.appendChild(modal);
};

function _updateInstallBtn() {
  const btn = document.getElementById('pwa-install-btn');
  if (!btn) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  btn.style.display = isStandalone ? 'none' : '';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // 설정 모달이 열려있으면 설치 버튼 표시
  const section = document.getElementById('pwa-install-section');
  if (section) section.style.display = 'block';
  _updateInstallBtn();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const section = document.getElementById('pwa-install-section');
  if (section) section.style.display = 'none';
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
});

function installPWA() {
  if (_deferredInstallPrompt) {
    _deferredInstallPrompt.prompt();
    _deferredInstallPrompt.userChoice.then((result) => {
      if (result.outcome === 'accepted') {
        const section = document.getElementById('pwa-install-section');
        if (section) section.style.display = 'none';
      }
      _deferredInstallPrompt = null;
    });
  } else {
    alert('이미 설치되었거나, 브라우저가 설치를 지원하지 않습니다.\n\n수동 설치: 브라우저 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"를 선택하세요.');
  }
}

// openSettingsModal에서 설치 버튼 표시 업데이트
const _origOpenSettings = openSettingsModal;
window.openSettingsModal = function() {
  try { _origOpenSettings(); } catch(e) { console.error(e); document.getElementById('settings-modal')?.classList.add('open'); }
  try {
    const section = document.getElementById('pwa-install-section');
    if (section) {
      const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      section.style.display = _deferredInstallPrompt ? 'block' : (!isInstalled ? 'block' : 'none');
    }
  } catch(e) { console.error(e); }
};

// ── 앱 초기화 ────────────────────────────────────────────────
window.addEventListener('load', initializeApp);

// 앱이 다시 포커스되면 홈탭 갱신 (이웃 데이터 최신화)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && _currentTab === 'home') {
    renderHome();
  }
});
