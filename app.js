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
import { loadCSVDatabase, searchCSVFood } from './fatsecret-api.js';
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected,
         tryAutoConnect, syncCreateToGCal, syncUpdateToGCal, syncDeleteToGCal,
         fetchGCalEvents } from './gcal-sync.js';
import { loadStocks }                             from './stocks.js?v=20260401';
import { getDietRec, getWorkoutRec,
         analyzeGoalFeasibility }                 from './ai.js';
import { renderCalendar, changeYear }             from './render-calendar.js';
import { renderStats, setPeriod, exportCSV }      from './render-stats.js';
import { renderHome, refreshNotifCenter }          from './render-home.js';
import { renderMonthlyCalendar, renderMonthlyCalendarInModal,
         changeMonthlyMonth }                     from './render-monthly-calendar.js';
import { renderMovie, changeMovieMonth, startMovieCrawl, toggleMovieTagFilter }  from './render-movie.js';
import { renderDev, submitDevTask }                from './render-dev.js';
import { renderWine, openWineModal, closeWineModal,
         saveWineFromModal, deleteWineFromModal,
         searchVivinoRating, searchWineImage,
         analyzeWinePreference, bulkSearchVivino,
         searchCriticRatings }                    from './render-wine.js';
import {
  loadWorkoutDate, changeWorkoutDate, goToTodayWorkout, saveWorkoutDay,
  wtSetGymStatus, wtSetCFStatus, wtToggleStretching, wtToggleWineFree, wtToggleMealSkipped,
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
  const isGithubPages = window.location.pathname.includes('/dashboard3/');
  const csvPath = isGithubPages
    ? '/dashboard3/public/data/foods.csv'
    : '/public/data/foods.csv';
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
  document.getElementById('dp-loss-rate').value    = plan.lossRatePerWeek || 0.009;
  document.getElementById('dp-activity').value     = plan.activityFactor  || 1.3;
  document.getElementById('dp-refeed-kcal').value  = plan.refeedKcal  || 5000;

  // 리피드 요일 버튼 초기화
  const refeedDays = plan.refeedDays || [0, 6];
  document.querySelectorAll('.refeed-day-btn').forEach(btn => {
    btn.classList.toggle('active', refeedDays.includes(parseInt(btn.dataset.dow)));
    btn.onclick = () => {
      btn.classList.toggle('active');
      _updateDietCalcPreview();
    };
  });

  _updateDietCalcPreview();

  // 입력 변경 시 미리보기 자동 갱신
  ['dp-height','dp-age','dp-weight','dp-bodyfat','dp-target-weight','dp-target-bf',
   'dp-loss-rate','dp-refeed-kcal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = _updateDietCalcPreview;
  });

  document.getElementById('diet-plan-modal').classList.add('open');
}

function _updateDietCalcPreview() {
  const preview = document.getElementById('dp-calc-preview');
  if (!preview) return;
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value)       || 0,
    age:              parseFloat(document.getElementById('dp-age').value)          || 0,
    weight:           parseFloat(document.getElementById('dp-weight').value)       || 0,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value)      || 0,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value)|| 0,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value)    || 0,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value)    || 0.009,
    activityFactor:   1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value)  || 5000,
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
  const plan = {
    height:           parseFloat(document.getElementById('dp-height').value)       || null,
    age:              parseFloat(document.getElementById('dp-age').value)          || null,
    weight:           parseFloat(document.getElementById('dp-weight').value)       || null,
    bodyFatPct:       parseFloat(document.getElementById('dp-bodyfat').value)      || null,
    targetWeight:     parseFloat(document.getElementById('dp-target-weight').value)|| null,
    targetBodyFatPct: parseFloat(document.getElementById('dp-target-bf').value)    || null,
    startDate:        document.getElementById('dp-start-date').value               || null,
    lossRatePerWeek:  parseFloat(document.getElementById('dp-loss-rate').value)    || 0.009,
    activityFactor:   1.3,
    refeedKcal:       parseFloat(document.getElementById('dp-refeed-kcal').value)  || 5000,
    refeedDays,
  };
  if (!plan.weight || !plan.height) { alert('키와 체중을 입력해주세요.'); return; }
  await saveDietPlan(plan);
  document.getElementById('diet-plan-modal').classList.remove('open');
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
      const isGithubPages = window.location.pathname.includes('/dashboard3/');
      const csvPath = isGithubPages
        ? '/dashboard3/public/data/foods.csv'
        : '/public/data/foods.csv';
      await loadCSVDatabase(csvPath);
      window._nutritionCSVLoaded = true;
      console.log('[영양검색] CSV 로드됨:', csvPath);
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

function renderNutritionSearchResults() {
  const q = (document.getElementById('nutrition-search-input').value || '').trim();
  const container = document.getElementById('nutrition-search-results');

  let html = '';

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

    // 공공데이터 API 검색 결과
    const pubResults = searchPublicFoodDB(q);
    const allNames = new Set([...dbNames, ...dedupedCsv.map(c => c.name?.toLowerCase())]);
    const dedupedPub = pubResults.filter(p => !allNames.has(p.name?.toLowerCase()));
    if (dedupedPub.length) {
      html += _renderNutritionSection('🏛️ 공공 식품DB', dedupedPub.slice(0, 15), { icon: '🏛️', marginTop: true });
    } else if (_publicFoodLoading) {
      html += `<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:12px">🏛️ 공공 식품DB 로딩 중...</div>`;
    }

    // 농촌진흥청 메뉴젠 검색 결과
    const agriResults = searchAgriFoodDB(q);
    const allNames2 = new Set([...allNames, ...dedupedPub.map(p => p.name?.toLowerCase())]);
    const dedupedAgri = agriResults.filter(a => !allNames2.has(a.name?.toLowerCase()));
    if (dedupedAgri.length) {
      html += _renderNutritionSection('🌾 농식품 영양DB', dedupedAgri.slice(0, 10), { icon: '🌾', marginTop: true });
    }

    html += _buildRecipeResultsHtml(q);

    if (!recentFiltered.length && !dbResults.length && !dedupedCsv.length && !dedupedPub.length && !dedupedAgri.length && !html.includes('🍳 내 요리')) {
      html = `<div style="font-size:12px;color:var(--text-tertiary);text-align:center;padding:16px">검색 결과 없음</div>`;
    }
  }

  // 맨 아래에 "직접 추가" 항목
  html += `<div style="padding:14px;text-align:center;border-top:1px solid var(--border);margin-top:8px">
    <button onclick="openNutritionDirectAdd()" style="background:none;border:1px dashed var(--accent);border-radius:8px;color:var(--accent);font-size:12px;font-weight:600;padding:10px 20px;cursor:pointer;width:100%">
      ➕ 직접 추가 (사진/텍스트 파싱)
    </button>
  </div>`;

  container.innerHTML = html;
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
          await loadCSVDatabase('/public/data/foods.csv');
          window._csvLoaded = true;
          console.log('[CSV] 로드 완료');
        } catch (csvErr) {
          console.warn('[CSV] 로드 실패:', csvErr);
          window._csvDatabase = [];
        }
      }

      // CSV에서 검색
      const csvFoods = searchCSVFood(q);
      console.log('[CSV 검색 결과]', csvFoods.length, '개');

      if (csvFoods && csvFoods.length > 0) {
        // CSV 결과 표시
        results.innerHTML = csvFoods.map((food, idx) => {
          const accuracy = Math.round(food.score);
          const accuracyBar = '█'.repeat(Math.ceil(accuracy / 10)) + '░'.repeat(10 - Math.ceil(accuracy / 10));
          return `
            <div class="fs-result-row" onclick="fatsecretSelectFoodById('${idx}')" style="cursor:pointer;padding:8px;border-bottom:1px solid var(--border);transition:background 0.2s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='transparent'">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div class="fs-result-name" style="font-weight:500">${food.name}</div>
                <div style="font-size:9px;color:var(--muted2)">CSV ${accuracy}%</div>
              </div>
              <div style="font-size:9px;color:var(--muted2);margin-bottom:4px">${accuracyBar}</div>
              <div style="font-size:10px;color:var(--muted);margin-bottom:3px">제조사: ${food.manufacturer || '정보없음'}</div>
              <div style="font-size:10px;color:var(--muted2)">에너지 ${food.energy} kcal | 단백질 ${food.protein}g</div>
            </div>`;
        }).join('');
        window._fsSearchItems = csvFoods;
        return;
      }
      // CSV에 없으면 계속 진행해서 FatSecret 시도
    }

    // 2️⃣ CSV 재검색 시도
    console.log('[CSV] 재검색 시도:', q);
    const csvFoods2 = await searchCSVFood(q);

    if (!csvFoods2 || csvFoods2.length === 0) {
      results.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">❌ 검색 결과 없음</div>';
      return;
    }

    // CSV 결과 표시
    results.innerHTML = csvFoods2.map((food, idx) => {
      return `
        <div class="fs-result-row" onclick="fatsecretSelectFoodById('${idx}')" style="cursor:pointer;padding:8px;border-bottom:1px solid var(--border);transition:background 0.2s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='transparent'">
          <div class="fs-result-name" style="font-weight:500">${food.name}</div>
          <div style="font-size:10px;color:var(--muted2)">🇰🇷 CSV 데이터 | ${food.manufacturer || '기타'}</div>
        </div>`;
    }).join('');

    window._fsSearchItems = csvFoods2;
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

  // 💡 CSV 또는 FatSecret 데이터 구분
  // ✅ CSV 데이터만 지원
  console.log('[CSV 선택]', food.name);
  const nutrition = {
    kcal: food.energy,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
  };

  // 영양정보 표시 (100g 기준)
  const nutritionPreview = document.getElementById('fs-nutrition-preview');
  if (nutritionPreview) {
    nutritionPreview.innerHTML = `
      <strong>🇰🇷 CSV 데이터</strong><br>
      100g 기준: <strong>${nutrition.kcal}kcal</strong> |
      단백질 ${nutrition.protein}g | 지방 ${nutrition.fat}g | 탄수화물 ${nutrition.carbs}g
      ${food.manufacturer ? `<br><strong>제조사:</strong> ${food.manufacturer}` : ''}
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
    // 모달은 항상 로드 (로그인 전에도 필요할 수 있음)
    await loadAndInjectModals();

    // 로그인 안 되어있으면 대기 (login-screen에서 처리)
    const { getCurrentUser, loadSavedUser } = await import('./data.js');
    const user = loadSavedUser() || getCurrentUser();
    if (!user) {
      document.getElementById('loading').style.display = 'none';
      return; // 로그인 화면이 표시됨
    }

    await loadAll();
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
    renderHome();
    // 알림 벨 표시 및 배지 초기화
    const bellBtn = document.getElementById('notif-bell');
    if (bellBtn) bellBtn.style.display = '';
    refreshNotifCenter();
    renderCalendar();
    loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    loadStocks();
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
window.wtSetGymStatus           = wtSetGymStatus;
window.wtSetCFStatus            = wtSetCFStatus;
window.wtToggleStretching       = wtToggleStretching;

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
};

window.wtResetStatus = function() {
  _wtSelectedTypes.clear();
  const flow = document.getElementById('wt-flow');
  flow.classList.remove('wt-chosen', 'wt-show-type');
  ['wt-gym-section','wt-memo-section','wt-save-section'].forEach(id =>
    document.getElementById(id)?.classList.remove('wt-open'));
  ['wt-chip-gym','wt-chip-cf','wt-chip-stretch'].forEach(id =>
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
      wrap.innerHTML = `<div style="position:relative;display:inline-block;margin-top:6px;">
        <img src="${window._mealPhotos[meal]}" style="max-width:100%;max-height:160px;border-radius:12px;object-fit:cover;display:block;">
        <button onclick="removeMealPhoto('${meal}')" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
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
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // 설정 모달이 열려있으면 설치 버튼 표시
  const section = document.getElementById('pwa-install-section');
  if (section) section.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const section = document.getElementById('pwa-install-section');
  if (section) section.style.display = 'none';
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
