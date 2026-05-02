// ================================================================
// sheet.js
// ================================================================

import { DAYS }                                from './config.js';
import { saveDay, saveExercise, deleteExercise,
         getDay, getExList, dateKey,
         getLastSession, calcVolume, getAllMuscles } from './data.js';


let _date        = null;
let _exercises   = [];
let _gymStatus   = 'none';   // 'done' | 'skip' | 'health' | 'none'
let _cfStatus    = 'none';   // 'done' | 'skip' | 'health' | 'none'
let _stretching  = false;
let _wineFree    = false;
let _diet        = _emptyDiet();

function _emptyDiet() {
  return {
    breakfast:'', lunch:'', dinner:'',
    bOk:null, lOk:null, dOk:null,
    bKcal:0, lKcal:0, dKcal:0,
    bReason:'', lReason:'', dReason:'',
  };
}

// ── 공개 API ─────────────────────────────────────────────────────

export function openSheet(y, m, d) {
  _date      = { y, m, d };
  const day  = getDay(y, m, d);
  _exercises = JSON.parse(JSON.stringify(day.exercises || []));

  // 헬스/클핏 상태 복원
  if (day.gym_health)                      _gymStatus = 'health';
  else if (day.gym_skip)                   _gymStatus = 'skip';
  else if ((day.exercises||[]).length > 0) _gymStatus = 'done';
  else                                     _gymStatus = 'none';

  if (day.cf_health)  _cfStatus = 'health';
  else if (day.cf_skip) _cfStatus = 'skip';
  else if (day.cf)    _cfStatus = 'done';
  else                _cfStatus = 'none';

  _stretching = !!day.stretching;
  _wineFree   = !!day.wine_free;

  _diet = {
    breakfast: day.breakfast||'', lunch: day.lunch||'', dinner: day.dinner||'',
    bOk:    day.bOk    ?? null,   lOk:    day.lOk    ?? null,   dOk:    day.dOk    ?? null,
    bKcal:  day.bKcal  || 0,      lKcal:  day.lKcal  || 0,      dKcal:  day.dKcal  || 0,
    bReason:day.bReason|| '',     lReason:day.lReason|| '',     dReason:day.dReason|| '',
  };

  const dow = new Date(y,m,d).getDay();
  document.getElementById('sheet-title').textContent =
    `${y}년 ${m+1}월 ${d}일 (${DAYS[dow]})`;

  document.getElementById('workout-memo').value   = day.memo || '';
  document.getElementById('meal-breakfast').value = _diet.breakfast;
  document.getElementById('meal-lunch').value     = _diet.lunch;
  document.getElementById('meal-dinner').value    = _diet.dinner;

  const analyzeBtn = document.getElementById('analyze-btn');
  const hasResult  = _diet.bOk !== null || _diet.lOk !== null || _diet.dOk !== null;
  analyzeBtn.textContent = hasResult ? '🔄 재분석하기' : '🔍 Claude로 식단 분석하기 (선택)';

  _renderGymStatusBtns();
  _renderCFStatusBtns();
  _renderStretchingToggle();
  _renderWineFreeToggle();
  _renderExerciseList();
  _renderDietResults();
  document.getElementById('sheet').classList.add('open');
}

export function closeSheet(e) {
  if (e && e.target !== document.getElementById('sheet')) return;
  document.getElementById('sheet').classList.remove('open');
}

// 헬스 상태 설정
export function setGymStatus(status) {
  _gymStatus = status;
  _renderGymStatusBtns();
  // 완료로 설정 시 exercise list 활성화, 아니면 비활성화 시각화
  document.getElementById('exercise-list').style.opacity =
    (status === 'done' || status === 'none') ? '1' : '0.4';
}

// 클핏 상태 설정
export function setCFStatus(status) {
  _cfStatus = status;
  _renderCFStatusBtns();
}

export function toggleCF() {
  // 레거시 호환 - 클핏 done/none 토글
  _cfStatus = _cfStatus === 'done' ? 'none' : 'done';
  _renderCFStatusBtns();
}

export function toggleStretching() {
  _stretching = !_stretching;
  _renderStretchingToggle();
}

export function toggleWineFree() {
  _wineFree = !_wineFree;
  _renderWineFreeToggle();
}

function _renderGymStatusBtns() {
  ['done','skip','health'].forEach(s => {
    const btn = document.getElementById(`gym-btn-${s}`);
    if (btn) btn.classList.toggle('active', _gymStatus === s);
  });
}

function _renderCFStatusBtns() {
  ['done','skip','health'].forEach(s => {
    const btn = document.getElementById(`cf-btn-${s}`);
    if (btn) btn.classList.toggle('active', _cfStatus === s);
  });
}

function _renderStretchingToggle() {
  document.getElementById('stretching-toggle')?.classList.toggle('on', _stretching);
}
function _renderWineFreeToggle() {
  document.getElementById('wine-free-toggle')?.classList.toggle('on', _wineFree);
}

export async function confirmSheet() {
  document.getElementById('sheet').classList.remove('open');
  const { y, m, d } = _date;

  // 식단 입력값 반영
  _diet.breakfast = document.getElementById('meal-breakfast').value.trim();
  _diet.lunch     = document.getElementById('meal-lunch').value.trim();
  _diet.dinner    = document.getElementById('meal-dinner').value.trim();

  const cleanEx = _exercises
    .map(e => ({ ...e, sets: e.sets.filter(s => s.kg > 0 || s.reps > 0) }))
    .filter(e => e.sets.length > 0);

  await saveDay(dateKey(y,m,d), {
    exercises:  cleanEx,
    cf:         _cfStatus === 'done',
    cf_skip:    _cfStatus === 'skip',
    cf_health:  _cfStatus === 'health',
    gym_skip:   _gymStatus === 'skip',
    gym_health: _gymStatus === 'health',
    stretching: _stretching,
    wine_free:  _wineFree,
    memo:       document.getElementById('workout-memo').value.trim(),
    breakfast:  _diet.breakfast,
    lunch:      _diet.lunch,
    dinner:     _diet.dinner,
    bOk:_diet.bOk, lOk:_diet.lOk, dOk:_diet.dOk,
    bKcal:_diet.bKcal, lKcal:_diet.lKcal, dKcal:_diet.dKcal,
    bReason:_diet.bReason, lReason:_diet.lReason, dReason:_diet.dReason,
  });

  document.dispatchEvent(new CustomEvent('sheet:saved'));
}

// ── 세트 조작 ─────────────────────────────────────────────────────
export function addSet(entryIdx) {
  const prev = _exercises[entryIdx].sets.slice(-1)[0];
  _exercises[entryIdx].sets.push({
    kg:      prev?.kg   || 0,
    reps:    prev?.reps || 0,
    setType: 'main',
    done:    false,
  });
  _renderSets(entryIdx);
}

export function removeSet(entryIdx, si) {
  _exercises[entryIdx].sets.splice(si, 1);
  _renderSets(entryIdx);
}

export function updateSet(entryIdx, si, field, val) {
  _exercises[entryIdx].sets[si][field] = field === 'setType' ? val : (parseFloat(val) || 0);
  _renderSets(entryIdx);
}

export function toggleSetDone(entryIdx, si) {
  _exercises[entryIdx].sets[si].done = !_exercises[entryIdx].sets[si].done;
  _renderSets(entryIdx);
}

export function updateSetType(entryIdx, si, val) {
  _exercises[entryIdx].sets[si].setType = val;
  _renderSets(entryIdx);
}

export function removeExerciseEntry(entryIdx) {
  _exercises.splice(entryIdx, 1);
  _renderExerciseList();
}

// ── 종목 선택/에디터 모달 ─────────────────────────────────────────
export function openExercisePicker() {
  _renderPickerList();
  document.getElementById('ex-picker-modal').classList.add('open');
}

export function closeExercisePicker(e) {
  if (e && e.target !== document.getElementById('ex-picker-modal')) return;
  document.getElementById('ex-picker-modal').classList.remove('open');
}

export function openExerciseEditor(exId, defaultMuscleId) {
  const editor       = document.getElementById('ex-editor-modal');
  const nameInput    = document.getElementById('ex-editor-name');
  const muscleSelect = document.getElementById('ex-editor-muscle');
  const deleteBtn    = document.getElementById('ex-editor-delete');
  const titleEl      = document.getElementById('ex-editor-title');
  const allMuscles = getAllMuscles();

  muscleSelect.innerHTML = allMuscles.map(m =>
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
    muscleSelect.value       = defaultMuscleId || allMuscles[0]?.id || '';
    deleteBtn.style.display  = 'none';
    editor.dataset.editingId = '';
  }

  document.getElementById('ex-picker-modal').classList.remove('open');
  editor.classList.add('open');
}

export function closeExerciseEditor(e) {
  if (e && e.target !== document.getElementById('ex-editor-modal')) return;
  document.getElementById('ex-editor-modal').classList.remove('open');
  openExercisePicker();
}

export async function saveExerciseFromEditor() {
  const editor   = document.getElementById('ex-editor-modal');
  const name     = document.getElementById('ex-editor-name').value.trim();
  const muscleId = document.getElementById('ex-editor-muscle').value;
  if (!name) { window.showToast?.('종목 이름을 입력해주세요', 2500, 'warning'); return; }

  const editingId = editor.dataset.editingId;
  await saveExercise({ id: editingId || `custom_${Date.now()}`, muscleId, name, order:50 });
  editor.classList.remove('open');
  openExercisePicker();
}

export async function deleteExerciseFromEditor() {
  const editor = document.getElementById('ex-editor-modal');
  const ok = await (window.confirmAction?.({
    title: '종목을 삭제할까요?',
    message: '과거 세트 기록은 보존되지만,\n앞으로 이 종목을 선택할 수 없어요.',
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
    longPress: 2000,
  }) || Promise.resolve(false));
  if (!ok) return;
  await deleteExercise(editor.dataset.editingId);
  editor.classList.remove('open');
  openExercisePicker();
  window.showToast?.('종목이 삭제됐어요', 2000, 'info');
}

// ── 내부 렌더 ─────────────────────────────────────────────────────
function _renderExerciseList() {
  const container = document.getElementById('exercise-list');
  container.innerHTML = '';
  const allMuscles = getAllMuscles();

  _exercises.forEach((entry, idx) => {
    const ex  = getExList().find(e => e.id === entry.exerciseId);
    const mc  = allMuscles.find(m => m.id === entry.muscleId);

    const last    = getLastSession(entry.exerciseId);
    const isToday = _date && last?.date === dateKey(_date.y, _date.m, _date.d);
    const lastHint = (last && !isToday)
      ? `<div class="ex-last-hint">
           📌 직전(${last.date.slice(5)})
           ${last.sets.map(s=>`${s.kg}×${s.reps}`).join(' / ')}
           <button class="ex-copy-btn" data-idx="${idx}">복사</button>
         </div>`
      : '';

    const block = document.createElement('div');
    block.className = 'ex-block';
    block.innerHTML = `
      <div class="ex-block-header">
        <span class="ex-block-muscle" style="color:${mc?.color||'#888'}">${mc?.name||''}</span>
        <span class="ex-block-name">${ex?.name||entry.exerciseId}</span>
        <button class="ex-remove-btn" data-idx="${idx}">✕</button>
      </div>
      ${lastHint}
      <div class="ex-sets" id="sets-${idx}"></div>
      <button class="ex-add-set-btn" data-idx="${idx}">+ 세트 추가</button>`;

    block.querySelector('.ex-remove-btn')
      .addEventListener('click', () => removeExerciseEntry(idx));
    block.querySelector('.ex-add-set-btn')
      .addEventListener('click', () => addSet(idx));

    const copyBtn = block.querySelector('.ex-copy-btn');
    if (copyBtn && last) {
      copyBtn.addEventListener('click', () => {
        _exercises[idx].sets = JSON.parse(JSON.stringify(last.sets));
        _renderSets(idx);
      });
    }

    container.appendChild(block);
    _renderSets(idx);
  });
}

function _renderSets(entryIdx) {
  const el = document.getElementById(`sets-${entryIdx}`);
  if (!el) return;
  const sets = _exercises[entryIdx].sets;
  el.innerHTML = '';

  sets.forEach((set, si) => {
    const isWarmup = set.setType === 'warmup';
    const isDrop = set.setType === 'drop';
    const isDone   = set.done !== false; // undefined도 완료로 처리
    const vol = (set.kg && set.reps && !isWarmup && isDone)
      ? `<span style="color:var(--accent)">${(set.kg*set.reps).toLocaleString()}vol</span>`
      : (isWarmup ? '<span style="color:var(--muted);font-size:9px">웜업</span>' : '');

    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <span class="set-num">${si+1}</span>
      <select class="set-type-select ${isWarmup ? 'warmup' : (isDrop ? 'drop' : 'main')}" data-idx="${si}">
        <option value="main"   ${!isWarmup && !isDrop ? 'selected' : ''}>본</option>
        <option value="warmup" ${isWarmup  ? 'selected' : ''}>웜업</option>
        <option value="drop"   ${isDrop ? 'selected' : ''}>드랍</option>
      </select>
      <input class="set-input" type="number" placeholder="kg"  min="0" step="0.5" value="${set.kg||''}">
      <span class="set-sep">kg</span>
      <input class="set-input" type="number" placeholder="회"  min="1" step="1"   value="${set.reps||''}">
      <span class="set-sep">회</span>
      <span class="set-vol">${vol}</span>
      <button class="set-done-btn ${isDone ? 'done' : ''}" title="완료 체크">✓</button>
      <button class="set-remove-btn">✕</button>`;

    row.querySelector('.set-type-select')
      .addEventListener('change', e => updateSetType(entryIdx, si, e.target.value));
    row.querySelectorAll('.set-input')[0]
      .addEventListener('change', e => updateSet(entryIdx, si, 'kg',   e.target.value));
    row.querySelectorAll('.set-input')[1]
      .addEventListener('change', e => updateSet(entryIdx, si, 'reps', e.target.value));
    row.querySelector('.set-done-btn')
      .addEventListener('click', () => toggleSetDone(entryIdx, si));
    row.querySelector('.set-remove-btn')
      .addEventListener('click', () => removeSet(entryIdx, si));
    el.appendChild(row);
  });
}

function _renderPickerList() {
  const container = document.getElementById('ex-picker-list');
  container.innerHTML = '';
  const allMuscles = getAllMuscles();

  allMuscles.forEach(muscle => {
    const list = getExList().filter(e => e.muscleId === muscle.id);
    const group = document.createElement('div');
    group.className = 'ex-picker-group';
    group.innerHTML = `<div class="ex-picker-group-label" style="color:${muscle.color}">${muscle.name}</div>`;

    list.forEach(ex => {
      const alreadyAdded = _exercises.some(e => e.exerciseId === ex.id);
      const btn = document.createElement('button');
      btn.className = 'ex-picker-item' + (alreadyAdded ? ' already' : '');
      btn.innerHTML = `<span>${ex.name}${alreadyAdded?' ✓':''}</span>
        <span class="ex-picker-edit" data-exid="${ex.id}">✏️</span>`;
      btn.querySelector('.ex-picker-edit')
        .addEventListener('click', e => { e.stopPropagation(); openExerciseEditor(ex.id, null); });
      if (!alreadyAdded) {
        btn.addEventListener('click', () => {
          _exercises.push({ muscleId:ex.muscleId, exerciseId:ex.id, sets:[{kg:0,reps:0,setType:'main',done:false}] });
          _renderExerciseList();
          closeExercisePicker();
        });
      }
      group.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'ex-picker-add';
    addBtn.textContent = `+ ${muscle.name} 종목 추가`;
    addBtn.addEventListener('click', () => openExerciseEditor(null, muscle.id));
    group.appendChild(addBtn);
    container.appendChild(group);
  });
}

function _renderDietResults() {
  const cfg = [
    { meal:'breakfast', okKey:'bOk', kcalKey:'bKcal', reasonKey:'bReason' },
    { meal:'lunch',     okKey:'lOk', kcalKey:'lKcal', reasonKey:'lReason' },
    { meal:'dinner',    okKey:'dOk', kcalKey:'dKcal', reasonKey:'dReason' },
  ];
  cfg.forEach(({ meal, okKey, kcalKey, reasonKey }) => {
    const el     = document.getElementById('result-' + meal);
    const ok     = _diet[okKey];
    const kcal   = _diet[kcalKey];
    const reason = _diet[reasonKey] || '';

    if (ok === null) {
      el.innerHTML = '<span class="diet-badge pending">미분석</span>';
    } else if (ok) {
      el.innerHTML = `
        <span class="diet-badge ok">✓ OK</span>
        <span class="diet-kcal">${kcal}kcal</span>
        ${reason ? `<span class="diet-reason">${reason}</span>` : ''}`;
    } else {
      el.innerHTML = `
        <span class="diet-badge bad">✗ NG</span>
        <span class="diet-kcal">${kcal}kcal</span>
        ${reason ? `<span class="diet-reason bad">${reason}</span>` : ''}`;
    }
  });
}
