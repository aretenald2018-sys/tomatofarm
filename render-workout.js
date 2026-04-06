// ================================================================
// render-workout.js — 운동·식단 탭 (B안: 전용 탭)
// ================================================================

import { MUSCLES, DAYS }                       from './config.js';
import { saveDay, saveExercise, deleteExercise,
         getDay, getExList, dateKey,
         getLastSession, isFuture, TODAY,
         getDietPlan, calcDietMetrics,
         getVolumeHistory, calcVolume,
         isDietDaySuccess, getDayTargetKcal,
         calcExerciseCalorieCredit,
         getBodyCheckins }                     from './data.js';


let _date       = null;   // { y, m, d }
let _exercises  = [];
let _hiddenExercises = []; // 모달에서 임시로 숨길 운동 ID 목록
let _gymStatus  = 'none'; // 'done'|'skip'|'health'|'none'
let _cfStatus   = 'none';
let _stretching = false;
let _swimming   = false;
let _running    = false;
let _wineFree   = false;
let _breakfastSkipped = false;
let _lunchSkipped = false;
let _dinnerSkipped = false;
let _diet       = _emptyDiet();

function _emptyDiet() {
  return {
    breakfast:'', lunch:'', dinner:'', snack:'',
    bOk:null, lOk:null, dOk:null, sOk:null,
    bKcal:0,  lKcal:0,  dKcal:0,  sKcal:0,
    bReason:'', lReason:'', dReason:'', sReason:'',
    bProtein:0, bCarbs:0, bFat:0,
    lProtein:0, lCarbs:0, lFat:0,
    dProtein:0, dCarbs:0, dFat:0,
    sProtein:0, sCarbs:0, sFat:0,
    bFoods:[], lFoods:[], dFoods:[], sFoods:[], // structured food items from FatSecret
  };
}

// ── 날짜 로드 ─────────────────────────────────────────────────────
export function loadWorkoutDate(y, m, d) {
  _date      = { y, m, d };
  const day  = getDay(y, m, d);
  _exercises = JSON.parse(JSON.stringify(day.exercises || []));

  if (day.gym_health)                      _gymStatus = 'health';
  else if (day.gym_skip)                   _gymStatus = 'skip';
  else if ((day.exercises||[]).length > 0) _gymStatus = 'done';
  else                                     _gymStatus = 'none';

  if (day.cf_health)    _cfStatus = 'health';
  else if (day.cf_skip) _cfStatus = 'skip';
  else if (day.cf)      _cfStatus = 'done';
  else                  _cfStatus = 'none';

  _stretching = !!day.stretching;
  _swimming   = !!day.swimming;
  _running    = !!day.running;
  _wineFree   = !!day.wine_free;
  _breakfastSkipped = !!day.breakfast_skipped;
  _lunchSkipped = !!day.lunch_skipped;
  _dinnerSkipped = !!day.dinner_skipped;
  _diet = {
    breakfast: day.breakfast||'', lunch: day.lunch||'', dinner: day.dinner||'', snack: day.snack||'',
    bOk:    day.bOk    ?? null, lOk:    day.lOk    ?? null, dOk:    day.dOk    ?? null, sOk: day.sOk ?? null,
    bKcal:  day.bKcal  || 0,   lKcal:  day.lKcal  || 0,   dKcal:  day.dKcal  || 0,   sKcal: day.sKcal || 0,
    bReason:day.bReason|| '',  lReason:day.lReason|| '',  dReason:day.dReason|| '',  sReason: day.sReason || '',
    bProtein:day.bProtein||0, bCarbs:day.bCarbs||0, bFat:day.bFat||0,
    lProtein:day.lProtein||0, lCarbs:day.lCarbs||0, lFat:day.lFat||0,
    dProtein:day.dProtein||0, dCarbs:day.dCarbs||0, dFat:day.dFat||0,
    sProtein:day.sProtein||0, sCarbs:day.sCarbs||0, sFat:day.sFat||0,
    bFoods:day.bFoods||[], lFoods:day.lFoods||[], dFoods:day.dFoods||[], sFoods:day.sFoods||[],
  };

  // 저장된 사진 복원
  window._mealPhotos = {};
  if (day.bPhoto) window._mealPhotos.breakfast = day.bPhoto;
  if (day.lPhoto) window._mealPhotos.lunch = day.lPhoto;
  if (day.dPhoto) window._mealPhotos.dinner = day.dPhoto;
  if (day.sPhoto) window._mealPhotos.snack = day.sPhoto;
  if (day.workoutPhoto) window._mealPhotos.workout = day.workoutPhoto;

  _renderDateLabel();
  _renderGymStatusBtns();
  _renderCFStatusBtns();
  _renderStretchingToggle();
  // 수영/런닝 칩 상태 복원
  document.getElementById('wt-chip-swimming')?.classList.toggle('active', _swimming);
  document.getElementById('wt-chip-running')?.classList.toggle('active', _running);
  _renderWineFreeToggle();
  _renderMealSkippedToggles();
  _initButtonEventListeners();
  _renderExerciseList();
  _renderMealFoodItems('breakfast');
  _renderMealFoodItems('lunch');
  _renderMealFoodItems('dinner');
  _renderMealFoodItems('snack');
  _renderDietResults();
  _renderMealPhotos();

  const memoEl = document.getElementById('wt-workout-memo');
  if (memoEl) memoEl.value = day.memo || '';
  const bEl = document.getElementById('wt-meal-breakfast');
  const lEl = document.getElementById('wt-meal-lunch');
  const dEl = document.getElementById('wt-meal-dinner');
  const sEl = document.getElementById('wt-meal-snack');
  if (bEl) bEl.value = _diet.breakfast;
  if (lEl) lEl.value = _diet.lunch;
  if (dEl) dEl.value = _diet.dinner;
  if (sEl) sEl.value = _diet.snack;

  // 미래 날짜면 입력 비활성화
  const isFutureDay = isFuture(y, m, d);
  _setInputsDisabled(isFutureDay);
}

function _setInputsDisabled(disabled) {
  const panel = document.getElementById('tab-workout');
  if (!panel) return;
  panel.querySelectorAll('input, textarea, select, button.act-btn, button.ex-add-btn, button.ex-add-set-btn, button.wt-save-btn').forEach(el => {
    if (el.classList.contains('wt-date-nav-btn')) return; // 날짜 탐색 버튼 제외
    el.disabled = disabled;
  });
  const notice = document.getElementById('wt-future-notice');
  if (notice) notice.style.display = disabled ? 'block' : 'none';
}

export function changeWorkoutDate(delta) {
  if (!_date) return;
  const d = new Date(_date.y, _date.m, _date.d + delta);
  loadWorkoutDate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function goToTodayWorkout() {
  loadWorkoutDate(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

// ── 상태 조작 ─────────────────────────────────────────────────────
export function wtSetGymStatus(status) {
  _gymStatus = status;
  _renderGymStatusBtns();
  const list = document.getElementById('wt-exercise-list');
  if (list) list.style.opacity = (status === 'done' || status === 'none') ? '1' : '0.4';
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtSetCFStatus(status) {
  _cfStatus = status;
  _renderCFStatusBtns();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleStretching() {
  _stretching = !_stretching;
  _renderStretchingToggle();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleSwimming() {
  _swimming = !_swimming;
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleRunning() {
  _running = !_running;
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleWineFree() {
  _wineFree = !_wineFree;
  _renderWineFreeToggle();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleMealSkipped(meal) {
  if (meal === 'breakfast') {
    _breakfastSkipped = !_breakfastSkipped;
    if (_breakfastSkipped) { _diet.bKcal = 0; _diet.bOk = null; }
  } else if (meal === 'lunch') {
    _lunchSkipped = !_lunchSkipped;
    if (_lunchSkipped) { _diet.lKcal = 0; _diet.lOk = null; }
  } else if (meal === 'dinner') {
    _dinnerSkipped = !_dinnerSkipped;
    if (_dinnerSkipped) { _diet.dKcal = 0; _diet.dOk = null; }
  }
  _renderMealSkippedToggles();
  _renderDietResults();
  _renderCalorieTracker();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

// ── 세트 조작 ─────────────────────────────────────────────────────
export function wtAddSet(entryIdx) {
  const prev = _exercises[entryIdx].sets.slice(-1)[0];
  _exercises[entryIdx].sets.push({ kg: prev?.kg||0, reps: prev?.reps||0, setType:'main', done:false });
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtRemoveSet(entryIdx, si) {
  _exercises[entryIdx].sets.splice(si, 1);
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtUpdateSet(entryIdx, si, field, val) {
  _exercises[entryIdx].sets[si][field] = field === 'setType' ? val : (parseFloat(val) || 0);
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleSetDone(entryIdx, si) {
  const wasDone = _exercises[entryIdx].sets[si].done;
  _exercises[entryIdx].sets[si].done = !wasDone;
  _renderSets(entryIdx);
  // 저장 후 스파크라인 갱신을 위해 전체 운동 목록 재렌더
  saveWorkoutDay().then(() => _renderExerciseList()).catch(e => console.error('Save error:', e));
  // 세트 완료 시 휴식 타이머 자동 시작
  if (!wasDone) wtRestTimerStart();
}

export function wtUpdateSetType(entryIdx, si, val) {
  _exercises[entryIdx].sets[si].setType = val;
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtRemoveExerciseEntry(entryIdx) {
  _exercises.splice(entryIdx, 1);
  _renderExerciseList();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

// ── 종목 선택/에디터 ──────────────────────────────────────────────
export async function wtOpenExercisePicker() {
  let modal = document.getElementById('ex-picker-modal');
  if (!modal) {
    // 모달이 아직 로드되지 않았으면 재시도
    const { loadAndInjectModals } = await import('./modal-manager.js');
    await loadAndInjectModals();
    modal = document.getElementById('ex-picker-modal');
  }
  if (!modal) { console.error('[workout] ex-picker-modal not found'); return; }
  _renderPickerList();
  modal.classList.add('open');
}

export function wtOpenExerciseEditor(exId, defaultMuscleId) {
  const editor       = document.getElementById('ex-editor-modal');
  const nameInput    = document.getElementById('ex-editor-name');
  const muscleSelect = document.getElementById('ex-editor-muscle');
  const deleteBtn    = document.getElementById('tds-btn danger sm');
  const titleEl      = document.getElementById('ex-editor-title');

  muscleSelect.innerHTML = MUSCLES.map(m =>
    `<option value="${m.id}">${m.name}</option>`).join('');

  if (exId) {
    const ex = getExList().find(e => e.id === exId);
    titleEl.textContent      = '종목 수정';
    nameInput.value          = ex?.name || '';
    muscleSelect.value       = ex?.muscleId || '';
    deleteBtn.style.display  = 'block';
    editor.dataset.editingId = exId;
  } else {
    titleEl.textContent      = '종목 추가';
    nameInput.value          = '';
    muscleSelect.value       = defaultMuscleId || MUSCLES[0].id;
    deleteBtn.style.display  = 'none';
    editor.dataset.editingId = '';
  }

  document.getElementById('ex-picker-modal').classList.remove('open');
  editor.classList.add('open');
}

export function wtCloseExercisePicker(e) {
  if (e && e.target !== document.getElementById('ex-picker-modal')) return;
  document.getElementById('ex-picker-modal').classList.remove('open');
}

export function wtCloseExerciseEditor(e) {
  if (e && e.target !== document.getElementById('ex-editor-modal')) return;
  document.getElementById('ex-editor-modal').classList.remove('open');
  wtOpenExercisePicker();
}

export async function wtSaveExerciseFromEditor() {
  const editor   = document.getElementById('ex-editor-modal');
  const name     = document.getElementById('ex-editor-name').value.trim();
  const muscleId = document.getElementById('ex-editor-muscle').value;
  if (!name) { alert('종목 이름을 입력해주세요.'); return; }
  const editingId = editor.dataset.editingId;
  await saveExercise({ id: editingId || `custom_${Date.now()}`, muscleId, name, order:50 });
  editor.classList.remove('open');
  wtOpenExercisePicker();
}

export async function wtDeleteExerciseFromEditor() {
  const editor = document.getElementById('ex-editor-modal');
  if (!confirm('종목을 삭제하시겠어요?')) return;
  await deleteExercise(editor.dataset.editingId);
  editor.classList.remove('open');
  wtOpenExercisePicker();
}

// ── 저장 ──────────────────────────────────────────────────────────
export async function saveWorkoutDay() {
  if (!_date) return;
  const { y, m, d } = _date;

  _diet.breakfast = document.getElementById('wt-meal-breakfast')?.value.trim() || '';
  _diet.lunch     = document.getElementById('wt-meal-lunch')?.value.trim() || '';
  _diet.dinner    = document.getElementById('wt-meal-dinner')?.value.trim() || '';
  _diet.snack     = document.getElementById('wt-meal-snack')?.value.trim() || '';

  const cleanEx = _exercises
    .map(e => ({ ...e, sets: e.sets.filter(s => s.kg > 0 || s.reps > 0) }))
    .filter(e => e.sets.length > 0);

  const btn = document.getElementById('wt-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  // 🎯 목표 칼로리 vs 실제 섭취 칼로리 비교 (calc.js 단일 소스)
  const plan = getDietPlan();
  const _dayDataForSave = {
    exercises: cleanEx,
    cf: _cfStatus === 'done',
    swimming: _swimming,
    running: _running,
    gym_skip: _gymStatus === 'skip',
  };
  const dayTarget = getDayTargetKcal(plan, y, m, d, _dayDataForSave);
  const totalKcal = (_diet.bKcal||0) + (_diet.lKcal||0) + (_diet.dKcal||0) + (_diet.sKcal||0);
  const _tol = plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;
  const isDietSuccess = isDietDaySuccess(totalKcal, dayTarget, _tol);

  await saveDay(dateKey(y, m, d), {
    exercises:  cleanEx,
    cf:         _cfStatus === 'done',
    cf_skip:    _cfStatus === 'skip',
    cf_health:  _cfStatus === 'health',
    gym_skip:   _gymStatus === 'skip',
    gym_health: _gymStatus === 'health',
    stretching: _stretching,
    swimming:   _swimming,
    running:    _running,
    wine_free:  _wineFree,
    breakfast_skipped: _breakfastSkipped,
    lunch_skipped: _lunchSkipped,
    dinner_skipped: _dinnerSkipped,
    memo:       document.getElementById('wt-workout-memo')?.value.trim() || '',
    breakfast:  _diet.breakfast,
    lunch:      _diet.lunch,
    dinner:     _diet.dinner,
    snack:      _diet.snack,
    bOk:isDietSuccess,   lOk:isDietSuccess,   dOk:isDietSuccess,   sOk:isDietSuccess,
    bKcal:_diet.bKcal, lKcal:_diet.lKcal, dKcal:_diet.dKcal, sKcal:_diet.sKcal,
    bReason:_diet.bReason, lReason:_diet.lReason, dReason:_diet.dReason, sReason:_diet.sReason,
    bProtein:_diet.bProtein, bCarbs:_diet.bCarbs, bFat:_diet.bFat,
    lProtein:_diet.lProtein, lCarbs:_diet.lCarbs, lFat:_diet.lFat,
    dProtein:_diet.dProtein, dCarbs:_diet.dCarbs, dFat:_diet.dFat,
    sProtein:_diet.sProtein, sCarbs:_diet.sCarbs, sFat:_diet.sFat,
    bFoods:_diet.bFoods||[], lFoods:_diet.lFoods||[], dFoods:_diet.dFoods||[], sFoods:_diet.sFoods||[],
    // 사진
    bPhoto: window._mealPhotos?.breakfast || null,
    lPhoto: window._mealPhotos?.lunch || null,
    dPhoto: window._mealPhotos?.dinner || null,
    sPhoto: window._mealPhotos?.snack || null,
    workoutPhoto: window._mealPhotos?.workout || null,
  });

  if (btn) { btn.disabled = false; btn.textContent = '✓ 저장됨'; setTimeout(() => { btn.textContent = '저장'; }, 1500); }
  document.dispatchEvent(new CustomEvent('sheet:saved'));
}

// ── 내부 렌더 ─────────────────────────────────────────────────────
function _renderDateLabel() {
  if (!_date) return;
  const { y, m, d } = _date;
  const dow = new Date(y, m, d).getDay();
  const dateText = `${y}년 ${m+1}월 ${d}일 (${DAYS[dow]})`;
  const isFutureDay = isFuture(y, m, d);
  const isToday  = y === TODAY.getFullYear() && m === TODAY.getMonth() && d === TODAY.getDate();

  // 운동탭 + 식단탭 양쪽 라벨 업데이트
  ['wt-date-label', 'wt-date-label-diet'].forEach(id => {
    const label = document.getElementById(id);
    if (label) { label.textContent = dateText; label.style.color = isFutureDay ? 'var(--muted)' : 'var(--text)'; }
  });
  ['wt-today-btn', 'wt-today-btn-diet'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = isToday ? 'none' : 'inline-block';
  });
}

function _renderGymStatusBtns() {
  ['done','skip','health'].forEach(s => {
    const btn = document.getElementById(`wt-gym-btn-${s}`);
    if (btn) btn.classList.toggle('active', _gymStatus === s);
  });
}

function _renderCFStatusBtns() {
  ['done','skip','health'].forEach(s => {
    const btn = document.getElementById(`wt-cf-btn-${s}`);
    if (btn) btn.classList.toggle('active', _cfStatus === s);
  });
}

function _renderStretchingToggle() {
  document.getElementById('wt-stretching-toggle')?.classList.toggle('on', _stretching);
}

function _renderWineFreeToggle() {
  document.getElementById('wt-wine-free-toggle')?.classList.toggle('on', _wineFree);
}

function _renderMealSkippedToggles() {
  document.getElementById('wt-breakfast-skipped')?.classList.toggle('active', _breakfastSkipped);
  document.getElementById('wt-lunch-skipped')?.classList.toggle('active', _lunchSkipped);
  document.getElementById('wt-dinner-skipped')?.classList.toggle('active', _dinnerSkipped);
}

let _eventsBound = false;
function _initButtonEventListeners() {
  if (_eventsBound) return; // 중복 바인딩 방지
  _eventsBound = true;

  // 이벤트 위임: 문서 전체에서 클릭을 감지하여 타겟을 찾아 실행
  document.addEventListener('click', (e) => {
    const target = e.target;

    // 🏋️ 헬스장 상태 버튼
    if (target.closest('#wt-gym-btn-done')) { e.stopPropagation(); wtSetGymStatus('done'); }
    else if (target.closest('#wt-gym-btn-skip')) { e.stopPropagation(); wtSetGymStatus('skip'); }
    else if (target.closest('#wt-gym-btn-health')) { e.stopPropagation(); wtSetGymStatus('health'); }

    // 🔥 크로스핏 상태 버튼
    else if (target.closest('#wt-cf-btn-done')) { e.stopPropagation(); wtSetCFStatus('done'); }
    else if (target.closest('#wt-cf-btn-skip')) { e.stopPropagation(); wtSetCFStatus('skip'); }
    else if (target.closest('#wt-cf-btn-health')) { e.stopPropagation(); wtSetCFStatus('health'); }

    // 🚫 굶었음 상태 토글 버튼
    else if (target.closest('#wt-breakfast-skipped')) { e.stopPropagation(); wtToggleMealSkipped('breakfast'); }
    else if (target.closest('#wt-lunch-skipped')) { e.stopPropagation(); wtToggleMealSkipped('lunch'); }
    else if (target.closest('#wt-dinner-skipped')) { e.stopPropagation(); wtToggleMealSkipped('dinner'); }
  });
}

function _buildSparkline(exerciseId, color) {
  const history = getVolumeHistory(exerciseId);
  if (history.length < 2) return '';
  // 전체 히스토리 사용 (주식 흐름 스타일)
  const vals = history.map(h => h.volume);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const W = 120, H = 28, pad = 2;
  const coords = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (W - pad * 2),
    y: pad + (1 - (v - min) / range) * (H - pad * 2),
  }));
  const points = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const lastPt = coords[coords.length - 1];
  const firstPt = coords[0];
  const lastVal = vals[vals.length - 1], firstVal = vals[0];
  const totalDiff = lastVal - firstVal;
  const isUp = totalDiff >= 0;
  const lineColor = color || 'var(--accent)';
  // 그라디언트 fill (주식 차트 스타일)
  const fillId = `spark-fill-${exerciseId.replace(/[^a-z0-9]/gi,'')}`;
  const fillPoints = `${firstPt.x.toFixed(1)},${H} ${points} ${lastPt.x.toFixed(1)},${H}`;
  const arrow = totalDiff > 0 ? '↑' : totalDiff < 0 ? '↓' : '→';
  const arrowColor = totalDiff > 0 ? 'var(--diet-ok)' : totalDiff < 0 ? 'var(--diet-bad)' : 'var(--muted)';
  const pct = firstVal > 0 ? Math.abs(totalDiff / firstVal * 100).toFixed(0) : 0;
  return `<div class="ex-sparkline-wrap">
    <svg width="${W}" height="${H}" class="ex-sparkline">
      <defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
      </linearGradient></defs>
      <polygon points="${fillPoints}" fill="url(#${fillId})"/>
      <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="2.5" fill="${lineColor}"/>
    </svg>
    <span class="ex-sparkline-diff" style="color:${arrowColor}">${arrow}${pct}%</span>
  </div>`;
}

function _renderExerciseList() {
  const container = document.getElementById('wt-exercise-list');
  if (!container) return;
  container.innerHTML = '';

  _exercises.forEach((entry, idx) => {
    const ex   = getExList().find(e => e.id === entry.exerciseId);
    const mc   = MUSCLES.find(m => m.id === entry.muscleId);
    const last = getLastSession(entry.exerciseId);
    const isToday = _date && last?.date === dateKey(_date.y, _date.m, _date.d);
    const lastHint = (last && !isToday)
      ? `<div class="ex-last-hint">
           📌 직전(${last.date.slice(5).replace('-','/')})
           ${last.sets.map(s=>`${s.kg}×${s.reps}`).join(' / ')}
           <button class="ex-copy-btn" data-idx="${idx}">복사</button>
         </div>`
      : '';
    const sparkline = _buildSparkline(entry.exerciseId, mc?.color);

    const block = document.createElement('div');
    block.className = 'ex-block';
    block.innerHTML = `
      <div class="ex-block-header">
        <span class="ex-block-muscle" style="color:${mc?.color||'#888'}">${mc?.name||''}</span>
        <span class="ex-block-name">${ex?.name||entry.exerciseId}</span>
        ${sparkline}
        <button class="ex-remove-btn" data-idx="${idx}">✕</button>
      </div>
      ${lastHint}
      <div class="ex-sets" id="wt-sets-${idx}"></div>
      <button class="ex-add-set-btn" data-idx="${idx}">+ 세트 추가</button>`;

    block.querySelector('.ex-remove-btn').addEventListener('click', () => wtRemoveExerciseEntry(idx));
    block.querySelector('.ex-add-set-btn').addEventListener('click', () => wtAddSet(idx));
    const copyBtn = block.querySelector('.ex-copy-btn');
    if (copyBtn && last) {
      copyBtn.addEventListener('click', () => {
        _exercises[idx].sets = JSON.parse(JSON.stringify(last.sets));
        // 저장 후 전체 리스트 재렌더 (스파크라인 갱신 포함)
        saveWorkoutDay().then(() => _renderExerciseList()).catch(e => console.error('Save error:', e));
      });
    }
    container.appendChild(block);
    _renderSets(idx);
  });
}

function _renderSets(entryIdx) {
  const el = document.getElementById(`wt-sets-${entryIdx}`);
  if (!el) return;
  const sets = _exercises[entryIdx].sets;
  el.innerHTML = '';

  sets.forEach((set, si) => {
    const isWarmup = set.setType === 'warmup';
    const isDone   = set.done !== false;
    const vol = (set.kg && set.reps && !isWarmup && isDone)
      ? `<span style="color:var(--accent)">${(set.kg*set.reps).toLocaleString()}vol</span>`
      : (isWarmup ? '<span style="color:var(--muted);font-size:9px">웜업</span>' : '');

    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <span class="set-num">${si+1}</span>
      <select class="set-type-select ${isWarmup?'warmup':'main'}" data-idx="${si}">
        <option value="main"   ${!isWarmup?'selected':''}>본</option>
        <option value="warmup" ${isWarmup ?'selected':''}>웜업</option>
      </select>
      <input class="set-input" type="number" placeholder="kg"  min="0" step="0.5" value="${set.kg||''}">
      <span class="set-sep">kg</span>
      <input class="set-input" type="number" placeholder="회"  min="1" step="1"   value="${set.reps||''}">
      <span class="set-sep">회</span>
      <span class="set-vol">${vol}</span>
      <button class="set-done-btn ${isDone?'done':''}" title="완료 체크">✓</button>
      <button class="set-remove-btn">✕</button>`;

    row.querySelector('.set-type-select').addEventListener('change', e => wtUpdateSetType(entryIdx, si, e.target.value));
    row.querySelectorAll('.set-input')[0].addEventListener('change', e => wtUpdateSet(entryIdx, si, 'kg',   e.target.value));
    row.querySelectorAll('.set-input')[1].addEventListener('change', e => wtUpdateSet(entryIdx, si, 'reps', e.target.value));
    row.querySelector('.set-done-btn').addEventListener('click', () => wtToggleSetDone(entryIdx, si));
    row.querySelector('.set-remove-btn').addEventListener('click', () => wtRemoveSet(entryIdx, si));
    el.appendChild(row);
  });
}

function _renderPickerList() {
  const container = document.getElementById('ex-picker-list');
  if (!container) return;
  container.innerHTML = '';
  MUSCLES.forEach(muscle => {
    const list = getExList()
      .filter(e => e.muscleId === muscle.id)
      .filter(e => !_hiddenExercises.includes(e.id)); // 숨길 운동 제외

    if (list.length === 0) return; // 운동이 없으면 섹션 건너뛰기

    const group = document.createElement('div');
    group.className = 'ex-picker-group';
    group.innerHTML = `<div class="ex-picker-group-label" style="color:${muscle.color}">${muscle.name}</div>`;
    list.forEach(ex => {
      const alreadyAdded = _exercises.some(e => e.exerciseId === ex.id);
      const btn = document.createElement('button');
      btn.className = 'ex-picker-item' + (alreadyAdded ? ' already' : '');
      btn.innerHTML = `<span>${ex.name}${alreadyAdded?' ✓':''}</span>
        <div class="ex-picker-actions">
          <span class="ex-picker-edit" data-exid="${ex.id}">✏️</span>
          <span class="ex-picker-delete" data-exid="${ex.id}">✕</span>
        </div>`;

      // 편집 버튼
      btn.querySelector('.ex-picker-edit').addEventListener('click', e => {
        e.stopPropagation();
        wtOpenExerciseEditor(ex.id, null);
      });

      // 삭제 버튼 (모달에서만 임시로 숨기기)
      btn.querySelector('.ex-picker-delete').addEventListener('click', e => {
        e.stopPropagation();
        _hiddenExercises.push(ex.id);
        _renderPickerList();
      });

      if (!alreadyAdded) {
        btn.addEventListener('click', () => {
          _exercises.push({ muscleId:ex.muscleId, exerciseId:ex.id, sets:[{kg:0,reps:0,setType:'main',done:false}] });
          _renderExerciseList();
          wtCloseExercisePicker();
          saveWorkoutDay().catch(e => console.error('Save error:', e));
        });
      }
      group.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'ex-picker-add';
    addBtn.textContent = `+ ${muscle.name} 종목 추가(선택)`;
    addBtn.addEventListener('click', () => wtOpenExerciseEditor(null, muscle.id));
    group.appendChild(addBtn);
    container.appendChild(group);
  });
}

function _renderDietResults() {
  const cfg = [
    { meal:'breakfast', okKey:'bOk', kcalKey:'bKcal', reasonKey:'bReason' },
    { meal:'lunch',     okKey:'lOk', kcalKey:'lKcal', reasonKey:'lReason' },
    { meal:'dinner',    okKey:'dOk', kcalKey:'dKcal', reasonKey:'dReason' },
    { meal:'snack',     okKey:'sOk', kcalKey:'sKcal', reasonKey:'sReason' },
  ];
  cfg.forEach(({ meal, okKey, kcalKey, reasonKey }) => {
    const el     = document.getElementById('wt-result-' + meal);
    if (!el) return;
    const ok     = _diet[okKey];
    const kcal   = _diet[kcalKey];
    const reason = _diet[reasonKey] || '';
    if (ok === null) {
      el.innerHTML = '<span style="font-size:11px;color:var(--text-tertiary);">음식을 추가해주세요</span>';
    } else if (ok) {
      el.innerHTML = `<span class="diet-badge ok">달성</span><span class="diet-kcal">${kcal}kcal</span>${reason?`<span class="diet-reason">${reason}</span>`:''}`;
    } else {
      el.innerHTML = `<span class="diet-badge bad">초과</span><span class="diet-kcal">${kcal}kcal</span>${reason?`<span class="diet-reason bad">${reason}</span>`:''}`;
    }
  });
  _renderCalorieTracker();
}

export function renderCalorieTracker() { _renderCalorieTracker(); }

function _renderCalorieTracker() {
  const tracker = document.getElementById('wt-calorie-tracker');
  if (!tracker) return;

  const plan    = getDietPlan();
  const metrics = calcDietMetrics(plan);
  if (!plan._userSet || !plan.weight) {
    tracker.style.display = 'none';
    // 인라인 설정 폼 표시
    const setup = document.getElementById('wt-diet-setup');
    if (setup) { setup.style.display = ''; setup.style.opacity = '1'; setup.style.transform = 'scale(1)'; }
    return;
  }
  // 플랜이 있으면 설정 폼 숨기기
  const setupEl = document.getElementById('wt-diet-setup');
  if (setupEl) setupEl.style.display = 'none';

  // 오늘이 리피드 데이인지 판단
  const dow = _date ? new Date(_date.y, _date.m, _date.d).getDay() : new Date().getDay();
  const isRefeed    = (plan.refeedDays || []).includes(dow);
  const dayTarget   = isRefeed ? metrics.refeed : metrics.deficit;
  const macroTarget = dayTarget;

  // 운동 칼로리 크레딧 계산
  const dayData = {
    exercises: _exercises,
    cf: _cfStatus === 'done',
    swimming: _swimming,
    running: _running,
    gym_skip: _gymStatus === 'skip',
  };
  const exerciseCredit = calcExerciseCalorieCredit(plan, dayData);
  const adjustedGoalKcal = dayTarget.kcal + exerciseCredit;

  // 현재 섭취 kcal (분석된 식사 합산)
  const currentKcal = (_diet.bKcal || 0) + (_diet.lKcal || 0) + (_diet.dKcal || 0) + (_diet.sKcal || 0);
  const hasAnalysis = currentKcal > 0;

  tracker.style.display = 'block';

  // 배지 & 목표
  const badge = document.getElementById('wt-day-type-badge');
  if (badge) {
    badge.textContent  = isRefeed ? '🔄 리피드 데이' : '🔥 데피싯 데이';
    badge.className    = 'cal-day-type ' + (isRefeed ? 'refeed' : 'deficit');
  }

  const goalEl   = document.getElementById('wt-cal-goal');
  const curEl    = document.getElementById('wt-cal-current');
  const remainEl = document.getElementById('wt-cal-remain');
  const barEl    = document.getElementById('wt-cal-bar');

  if (goalEl)   goalEl.textContent   = adjustedGoalKcal.toLocaleString();
  if (curEl)    curEl.textContent    = currentKcal.toLocaleString();

  // 운동 칼로리 크레딧 배지 표시
  const creditEl = document.getElementById('wt-exercise-credit-badge');
  if (creditEl) {
    if (exerciseCredit > 0) {
      creditEl.innerHTML = `<span class="cal-exercise-credit">+${exerciseCredit} kcal 운동</span>`;
      creditEl.style.display = '';
    } else {
      creditEl.style.display = 'none';
    }
  }

  const pct     = Math.min(currentKcal / adjustedGoalKcal * 100, 100);
  const over    = currentKcal > adjustedGoalKcal;
  const remain  = adjustedGoalKcal - currentKcal;

  if (remainEl) {
    remainEl.textContent  = over
      ? `${Math.abs(remain).toLocaleString()} kcal 초과`
      : `${remain.toLocaleString()} kcal 남음`;
    remainEl.style.color  = over ? 'var(--diet-bad)' : 'var(--muted)';
  }
  if (barEl) {
    barEl.style.width     = pct + '%';
    barEl.style.background = over ? 'var(--diet-bad)' : (isRefeed ? 'var(--cf)' : 'var(--diet-ok)');
  }

  // 탄단지 바 (분석 데이터 있으면 현재값 / 목표값 표시)
  const macroEl = document.getElementById('wt-macro-bars');
  if (!macroEl) return;
  const curProtein = (_diet.bProtein||0) + (_diet.lProtein||0) + (_diet.dProtein||0) + (_diet.sProtein||0);
  const curCarbs   = (_diet.bCarbs  ||0) + (_diet.lCarbs  ||0) + (_diet.dCarbs  ||0) + (_diet.sCarbs||0);
  const curFat     = (_diet.bFat    ||0) + (_diet.lFat    ||0) + (_diet.dFat    ||0) + (_diet.sFat||0);
  // 운동 칼로리 크레딧이 있으면 매크로 목표도 비례 증가
  const macroScale = exerciseCredit > 0 && dayTarget.kcal > 0 ? adjustedGoalKcal / dayTarget.kcal : 1;
  const macros = [
    { label:'단', cur: curProtein, goal: Math.round(macroTarget.proteinG * macroScale), color:'var(--gym)' },
    { label:'탄', cur: curCarbs,   goal: Math.round(macroTarget.carbG * macroScale),    color:'var(--cf)' },
    { label:'지', cur: curFat,     goal: Math.round(macroTarget.fatG * macroScale),     color:'var(--accent)' },
  ];
  macroEl.innerHTML = macros.map(({ label, cur, goal, color }) => {
    const pct  = goal > 0 ? Math.min(cur / goal * 100, 100) : 0;
    const over = cur > goal && goal > 0;
    const info = hasAnalysis ? `${cur}/${goal}g` : `목표 ${goal}g`;
    return `
    <div class="macro-bar-row">
      <span class="macro-bar-label">${label}</span>
      <div class="macro-bar-track">
        <div class="macro-bar-fill" style="background:${over?'var(--diet-bad)':color};width:${pct}%"></div>
      </div>
      <span class="macro-bar-info" style="color:${over?'var(--diet-bad)':color}">${info}</span>
    </div>`;
  }).join('');

}

// ── 식사별 음식 아이템 렌더 ──────────────────────────────────────
function _mealKey(meal) {
  return meal === 'breakfast' ? 'bFoods' : meal === 'lunch' ? 'lFoods' : meal === 'dinner' ? 'dFoods' : 'sFoods';
}

function _renderMealFoodItems(meal) {
  const container = document.getElementById(`wt-foods-${meal}`);
  if (!container) return;
  const foods = _diet[_mealKey(meal)] || [];
  if (!foods.length) { container.innerHTML = ''; return; }

  container.innerHTML = foods.map((f, idx) => `
    <div class="meal-food-chip">
      <span class="meal-food-chip-name">${f.recipeId ? '🍳 ' : ''}${f.name} <span style="color:var(--muted);font-size:10px">${f.grams}g</span></span>
      <span class="meal-food-chip-kcal">${Math.round(f.kcal)}kcal</span>
      <button class="meal-food-chip-del" onclick="wtRemoveFoodItem('${meal}',${idx})">✕</button>
    </div>`).join('');
}

function _recalcMealMacros(meal) {
  const key    = _mealKey(meal);
  const prefix = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
  const foods  = _diet[key] || [];
  if (!foods.length) return;

  _diet[`${prefix}Kcal`]    = Math.round(foods.reduce((s, f) => s + f.kcal,    0));
  _diet[`${prefix}Protein`] = Math.round(foods.reduce((s, f) => s + f.protein, 0) * 10) / 10;
  _diet[`${prefix}Carbs`]   = Math.round(foods.reduce((s, f) => s + f.carbs,   0) * 10) / 10;
  _diet[`${prefix}Fat`]     = Math.round(foods.reduce((s, f) => s + f.fat,     0) * 10) / 10;
  _diet[`${prefix}Ok`]      = true; // DB-backed meals are always considered OK
  _diet[`${prefix}Reason`]  = `DB: ${_diet[`${prefix}Kcal`]}kcal (단${_diet[`${prefix}Protein`]}g 탄${_diet[`${prefix}Carbs`]}g 지${_diet[`${prefix}Fat`]}g)`;
}

export function wtAddFoodItem(meal, item) {
  const key = _mealKey(meal);
  _diet[key] = [...(_diet[key] || []), item];
  _recalcMealMacros(meal);
  _renderMealFoodItems(meal);
  _renderDietResults();
  _autoSaveDiet();
}

export function wtRemoveFoodItem(meal, idx) {
  const key = _mealKey(meal);
  _diet[key] = (_diet[key] || []).filter((_, i) => i !== idx);
  if ((_diet[key] || []).length > 0) {
    _recalcMealMacros(meal);
  } else {
    // reset to unanalyzed state if no items remain
    const prefix = meal === 'breakfast' ? 'b' : meal === 'lunch' ? 'l' : meal === 'dinner' ? 'd' : 's';
    _diet[`${prefix}Kcal`]    = 0;
    _diet[`${prefix}Protein`] = 0;
    _diet[`${prefix}Carbs`]   = 0;
    _diet[`${prefix}Fat`]     = 0;
    _diet[`${prefix}Ok`]      = null;
    _diet[`${prefix}Reason`]  = '';
  }
  _renderMealFoodItems(meal);
  _renderDietResults();
  _autoSaveDiet();
}

// ── 저장된 사진 표시 ────────────────────────────────────────────────
function _renderMealPhotos() {
  const meals = ['breakfast', 'lunch', 'dinner', 'snack', 'workout'];
  for (const meal of meals) {
    const wrap = document.getElementById('wt-photo-' + meal);
    if (!wrap) continue;
    const photo = window._mealPhotos?.[meal];
    if (photo) {
      wrap.innerHTML = `<div class="meal-photo-frame" onclick="openMealPhotoLightbox('${photo.replace(/'/g,"\\'")}')">
        <img src="${photo}">
        <button class="meal-photo-delete" onclick="event.stopPropagation();removeMealPhoto('${meal}')">✕</button>
      </div>`;
    } else {
      wrap.innerHTML = '';
    }
  }
}

// ── 식단 자동 저장 헬퍼 ────────────────────────────────────────────
async function _autoSaveDiet() {
  if (!_date) {
    console.warn('[render-workout] 날짜 정보가 없어 저장할 수 없습니다');
    return;
  }
  const { y, m, d } = _date;

  // 현재 입력값 반영
  _diet.breakfast = document.getElementById('wt-meal-breakfast')?.value.trim() || _diet.breakfast;
  _diet.lunch     = document.getElementById('wt-meal-lunch')?.value.trim() || _diet.lunch;
  _diet.dinner    = document.getElementById('wt-meal-dinner')?.value.trim() || _diet.dinner;
  _diet.snack     = document.getElementById('wt-meal-snack')?.value.trim() || _diet.snack;

  const cleanEx = _exercises
    .map(e => ({ ...e, sets: e.sets.filter(s => s.kg > 0 || s.reps > 0) }))
    .filter(e => e.sets.length > 0 || e.note);

  console.log('[render-workout] 식단 자동 저장 시작:', { dateKey: dateKey(y, m, d), foods: { b: _diet.bFoods?.length || 0, l: _diet.lFoods?.length || 0, d: _diet.dFoods?.length || 0 } });

  // 🎯 목표 칼로리 vs 실제 섭취 칼로리 비교 (calc.js 단일 소스)
  const plan = getDietPlan();
  const _autoSaveDayData = {
    exercises: cleanEx,
    cf: _cfStatus === 'done',
    swimming: _swimming,
    running: _running,
    gym_skip: _gymStatus === 'skip',
  };
  const dayTarget = getDayTargetKcal(plan, y, m, d, _autoSaveDayData);
  const totalKcal = (_diet.bKcal||0) + (_diet.lKcal||0) + (_diet.dKcal||0) + (_diet.sKcal||0);
  const _autoTol = plan.advancedMode ? (plan.dietTolerance ?? 50) : 50;
  const isDietSuccess = isDietDaySuccess(totalKcal, dayTarget, _autoTol);

  try {
    await saveDay(dateKey(y, m, d), {
      exercises:  cleanEx,
      cf:         _cfStatus === 'done',
      cf_skip:    _cfStatus === 'skip',
      cf_health:  _cfStatus === 'health',
      gym_skip:   _gymStatus === 'skip',
      gym_health: _gymStatus === 'health',
      stretching: _stretching,
      swimming:   _swimming,
      running:    _running,
      wine_free:  _wineFree,
      breakfast_skipped: _breakfastSkipped,
      lunch_skipped: _lunchSkipped,
      dinner_skipped: _dinnerSkipped,
      memo:       document.getElementById('wt-workout-memo')?.value.trim() || '',
      breakfast:  _diet.breakfast,
      lunch:      _diet.lunch,
      dinner:     _diet.dinner,
      snack:      _diet.snack,
      // 🎯 [핵심] 클로드 결과를 칼로리 성공 여부(isDietSuccess)로 강제 덮어쓰기
      bOk:isDietSuccess,   lOk:isDietSuccess,   dOk:isDietSuccess,   sOk:isDietSuccess,
      bKcal:_diet.bKcal, lKcal:_diet.lKcal, dKcal:_diet.dKcal, sKcal:_diet.sKcal,
      bReason:_diet.bReason, lReason:_diet.lReason, dReason:_diet.dReason, sReason:_diet.sReason,
      bProtein:_diet.bProtein, bCarbs:_diet.bCarbs, bFat:_diet.bFat,
      lProtein:_diet.lProtein, lCarbs:_diet.lCarbs, lFat:_diet.lFat,
      dProtein:_diet.dProtein, dCarbs:_diet.dCarbs, dFat:_diet.dFat,
      sProtein:_diet.sProtein, sCarbs:_diet.sCarbs, sFat:_diet.sFat,
      bFoods:_diet.bFoods||[], lFoods:_diet.lFoods||[], dFoods:_diet.dFoods||[], sFoods:_diet.sFoods||[],
    });
    console.log('[render-workout] 식단 자동 저장 완료');
  } catch(e) {
    console.error('[render-workout] 자동 저장 실패:', e);
  }
}

// ── 사진/텍스트 기반 영양정보 추가 ────────────────────────────────
export function openNutritionPhotoUpload() {
  // 영양정보 입력 모달을 사진 인식 탭으로 열기
  // window 객체에 등록된 함수 사용
  if (window.openNutritionItemEditor) {
    window.openNutritionItemEditor(null);
    // JS에서 직접 탭 전환
    setTimeout(() => {
      if (window.switchNutritionTab) {
        window.switchNutritionTab('photo');
      }
    }, 100);
  }
}

// ── 세트 간 휴식 타이머 ───────────────────────────────────────────
let _restTimer = { interval: null, remaining: 0, total: 90, running: false };

function _restTimerEl()  { return document.getElementById('rest-timer-bar'); }
function _restTimeEl()   { return document.getElementById('rest-timer-time'); }
function _restFillEl()   { return document.getElementById('rest-timer-fill'); }

function _formatTime(sec) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  const sign = sec < 0 ? '+' : '';
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

export function wtRestTimerStart(seconds) {
  const bar = _restTimerEl();
  if (!bar) return;
  if (seconds) _restTimer.total = seconds;
  _restTimer.remaining = _restTimer.total;
  _restTimer.running = true;

  // UI 표시
  bar.style.display = '';
  bar.classList.remove('expired', 'done');
  _restTimeEl().textContent = _formatTime(_restTimer.remaining);
  _restFillEl().style.width = '100%';
  _updatePresetActive();

  // 기존 인터벌 정리
  if (_restTimer.interval) clearInterval(_restTimer.interval);

  _restTimer.interval = setInterval(() => {
    _restTimer.remaining--;
    _restTimeEl().textContent = _formatTime(_restTimer.remaining);

    if (_restTimer.remaining > 0) {
      _restFillEl().style.width = `${(_restTimer.remaining / _restTimer.total) * 100}%`;
    } else if (_restTimer.remaining === 0) {
      // 타이머 만료
      _restFillEl().style.width = '0%';
      bar.classList.add('expired');
      // 진동 알림 (지원 시)
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } else {
      // 초과 시간 (카운트업) — 10분 지나면 자동 닫기
      if (_restTimer.remaining < -600) wtRestTimerSkip();
    }
  }, 1000);
}

export function wtRestTimerSkip() {
  const bar = _restTimerEl();
  if (!bar) return;
  if (_restTimer.interval) clearInterval(_restTimer.interval);
  _restTimer.running = false;
  bar.style.display = 'none';
  bar.classList.remove('expired', 'done');
}

export function wtRestTimerAdjust(delta) {
  if (!_restTimer.running) return;
  _restTimer.remaining = Math.max(0, _restTimer.remaining + delta);
  _restTimer.total = Math.max(_restTimer.total, _restTimer.remaining);
  _restTimeEl().textContent = _formatTime(_restTimer.remaining);
  _restFillEl().style.width = `${(_restTimer.remaining / _restTimer.total) * 100}%`;
  _restTimerEl()?.classList.remove('expired');
}

function _updatePresetActive() {
  document.querySelectorAll('.rest-preset-btn').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.sec === _restTimer.total);
  });
}

function _initRestTimerPresets() {
  document.querySelectorAll('.rest-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wtRestTimerStart(+btn.dataset.sec);
    });
  });
}

// 운동 탭 초기화 시 프리셋 바인딩
setTimeout(_initRestTimerPresets, 0);

// 전역(window) 객체에 함수 노출시켜 연결고리 복구
window.wtSetGymStatus = wtSetGymStatus;
window.wtSetCFStatus = wtSetCFStatus;
window.wtToggleMealSkipped = wtToggleMealSkipped;
window.saveWorkoutDay = saveWorkoutDay;
window.wtOpenExercisePicker = wtOpenExercisePicker;
window.wtCloseExercisePicker = wtCloseExercisePicker;
window.wtOpenExerciseEditor = wtOpenExerciseEditor;
window.wtCloseExerciseEditor = wtCloseExerciseEditor;
window.wtSaveExerciseFromEditor = wtSaveExerciseFromEditor;
window.wtDeleteExerciseFromEditor = wtDeleteExerciseFromEditor;
window.wtRestTimerStart = wtRestTimerStart;
window.wtRestTimerSkip = wtRestTimerSkip;
window.wtRestTimerAdjust = wtRestTimerAdjust;
