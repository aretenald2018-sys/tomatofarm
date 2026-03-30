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
         getDietPlan, saveDietPlan, calcDietMetrics,
         saveBodyCheckin, deleteBodyCheckin, getBodyCheckins,
         saveNutritionItem, deleteNutritionItem, getNutritionDB, searchNutritionDB, getRecentNutritionItems,
         imageToBase64, getMovieData, saveMovieData, getAllMovieMonths,
         getCookingRecords } from './data.js';
import { loadCSVDatabase, searchCSVFood } from './fatsecret-api.js';
import { loadStocks }                             from './stocks.js';
import { getDietRec, getWorkoutRec,
         analyzeGoalFeasibility }                 from './ai.js';
import { renderCalendar, changeYear }             from './render-calendar.js';
import { renderStats, setPeriod, exportCSV }      from './render-stats.js';
import { renderHome }                             from './render-home.js';
import { renderMonthlyCalendar, renderMonthlyCalendarInModal,
         changeMonthlyMonth }                     from './render-monthly-calendar.js';
import { renderMovie, changeMovieMonth, startMovieCrawl, toggleMovieTagFilter }  from './render-movie.js';
import { renderLoa, toggleLoaCheck, toggleLoaWeekly,
         setLoaActiveChar, deleteLoaChar,
         openLoaAddModal, closeLoaAddModal,
         searchLoaSiblings, selectLoaChar }        from './render-loa.js';
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
  wtRunAnalyzeDiet,
  wtAddSet, wtRemoveSet, wtUpdateSet, wtToggleSetDone, wtUpdateSetType, wtRemoveExerciseEntry,
  wtAddFoodItem, wtRemoveFoodItem,
  openNutritionPhotoUpload,
} from './render-workout.js';
import {
  renderCooking, openCookingModal, closeCookingModal,
  saveCookingFromModal, deleteCookingFromModal, onCookingPhotoInput,
  calcPerServing,
} from './render-cooking.js';
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
  if (tab === 'calendar') renderCalendar();
  if (tab === 'wine')     renderWine();
  if (tab === 'loa')      renderLoa();
  if (tab === 'cooking')  renderCooking();
  if (tab === 'movie')    renderMovie();
  if (tab === 'workout')  loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
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

function _applyTabOrder(order) {
  const nav = document.getElementById('tab-nav');
  if (!nav || !order?.length) return;
  const settingsBtn = nav.querySelector('.tab-btn-settings');
  order.forEach(tabId => {
    const btn = nav.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) nav.insertBefore(btn, settingsBtn);
  });
}

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

function openCalEventModal(startDate, endDate, eventId) {
  _calEventId    = eventId || null;
  _calEventColor = '#f59e0b';

  if (eventId) {
    const ev = getEvents().find(e => e.id === eventId);
    if (ev) {
      _calEventColor = ev.color || '#f59e0b';
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

  const ev = {
    id:    _calEventId || `ev_${Date.now()}`,
    title, start, end, color: _calEventColor,
  };
  await saveEvent(ev);
  document.getElementById('cal-event-modal').classList.remove('open');
  renderMonthlyCalendar();
  renderCalendar();
}

async function deleteCalEventFromModal() {
  if (!_calEventId) return;
  if (!confirm('이 일정을 삭제할까요?')) return;
  const result = await deleteEvent(_calEventId);
  if (result.success) {
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
  document.getElementById('cfg-anthropic').value    = localStorage.getItem('cfg_anthropic')    || '';
  document.getElementById('cfg-alphavantage').value = localStorage.getItem('cfg_alphavantage') || '';
  document.getElementById('cfg-fatsecret-key').value    = localStorage.getItem('fs_consumer_key')    || '';
  document.getElementById('cfg-fatsecret-secret').value = localStorage.getItem('fs_consumer_secret') || '';
  _renderNutritionDBList();
  document.getElementById('settings-modal').classList.add('open');
}

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
  const anthropic    = document.getElementById('cfg-anthropic').value.trim();
  const alphavantage = document.getElementById('cfg-alphavantage').value.trim();
  const fsKey        = document.getElementById('cfg-fatsecret-key').value.trim();
  const fsSecret     = document.getElementById('cfg-fatsecret-secret').value.trim();

  if (anthropic)    localStorage.setItem('cfg_anthropic',    anthropic);
  if (alphavantage) localStorage.setItem('cfg_alphavantage', alphavantage);
  if (fsKey)        localStorage.setItem('fs_consumer_key',    fsKey);
  if (fsSecret)     localStorage.setItem('fs_consumer_secret', fsSecret);

  document.getElementById('settings-modal').classList.remove('open');
  if (alphavantage) loadStocks();
}

// ── 다이어트 플랜 모달 ────────────────────────────────────────────
function openDietPlanModal() {
  const plan = getDietPlan();
  document.getElementById('dp-height').value       = plan.height      || '';
  document.getElementById('dp-age').value          = plan.age         || '';
  document.getElementById('dp-weight').value       = plan.weight      || '';
  document.getElementById('dp-bodyfat').value      = plan.bodyFatPct  || '';
  document.getElementById('dp-target-weight').value= plan.targetWeight    || '';
  document.getElementById('dp-target-bf').value    = plan.targetBodyFatPct|| '';
  document.getElementById('dp-start-date').value   = plan.startDate   || '';
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

  // 초기: 최근 항목만 표시 (검색어 입력 시 전체 결과 표시)
  renderNutritionSearchInitial();
  document.getElementById('nutrition-search-modal').classList.add('open');
  setTimeout(() => document.getElementById('nutrition-search-input').focus(), 100);
}

function closeNutritionSearch(e) { _closeModal('nutrition-search-modal', e); }

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
          ${(!isCSV && item.unit) ? `<span>${item.unit}</span>` : ''}
          <span>${kcal}kcal</span>
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

    html += _buildRecipeResultsHtml(q);

    if (!recentFiltered.length && !dbResults.length && !dedupedCsv.length && !html.includes('🍳 내 요리')) {
      html = `<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">검색 결과 없음</div>`;
    }
  }

  container.innerHTML = html;
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
    await loadAll();
    _applyTabOrder(getTabOrder());
    _initTabDrag();
    renderHome();
    renderCalendar();
    loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    loadStocks();
  } catch (err) {
    console.error('[init] 초기화 오류:', err);
    // 오류가 발생해도 로딩 화면 숨기고 기본 렌더링
    renderHome();
  } finally {
    document.getElementById('loading').classList.add('hidden');
    setTimeout(() => {
      document.querySelectorAll('.today-cell')[0]
        ?.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 400);
  }
}

// ── 식단 입력 버튼 이벤트 위임 (모바일 터치 호환) ────────────────────
function _initDietInputButtons() {
  const buttonContainer = document.getElementById('diet-input-buttons');
  if (!buttonContainer) return;

  buttonContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;
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
window.wtToggleWineFree         = wtToggleWineFree;
window.wtToggleMealSkipped      = wtToggleMealSkipped;
window.wtOpenExercisePicker     = wtOpenExercisePicker;
window.wtCloseExercisePicker    = wtCloseExercisePicker;
window.wtOpenExerciseEditor     = wtOpenExerciseEditor;
window.wtCloseExerciseEditor    = wtCloseExerciseEditor;
window.wtSaveExerciseFromEditor = wtSaveExerciseFromEditor;
window.wtDeleteExerciseFromEditor = wtDeleteExerciseFromEditor;
window.wtRunAnalyzeDiet         = wtRunAnalyzeDiet;
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
// 로아
window.renderLoa           = renderLoa;
window.toggleLoaCheck      = toggleLoaCheck;
window.toggleLoaWeekly     = toggleLoaWeekly;
window.setLoaActiveChar    = setLoaActiveChar;
window.deleteLoaChar       = deleteLoaChar;
window.openLoaAddModal     = openLoaAddModal;
window.closeLoaAddModal    = closeLoaAddModal;
window.searchLoaSiblings   = searchLoaSiblings;
window.selectLoaChar       = selectLoaChar;
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
// 설정
window.openSettingsModal        = openSettingsModal;
window.closeSettingsModal       = closeSettingsModal;
window.saveSettings             = saveSettings;
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

// ── 앱 초기화 ────────────────────────────────────────────────
window.addEventListener('load', initializeApp);
