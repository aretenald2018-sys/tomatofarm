// ================================================================
// workout/exercises.js — 세트 CRUD + 운동 picker/editor + 운동 목록 렌더
// ================================================================

import { S }                           from './state.js';
import { saveWorkoutDay }              from './save.js';
import { _buildSparkline }            from './render.js';
import { wtStartWorkoutTimer,
         wtRestTimerStart,
         wtRestTimerSkip }             from './timers.js';
import { MUSCLES }                     from '../config.js';
import { showToast }                   from '../home/utils.js';
import { getExList, getLastSession,
         dateKey, saveExercise,
         deleteExercise }              from '../data.js';

// ── 세트 조작 ────────────────────────────────────────────────────
export function wtAddSet(entryIdx) {
  const prev = S.exercises[entryIdx].sets.slice(-1)[0];
  S.exercises[entryIdx].sets.push({ kg: prev?.kg||0, reps: prev?.reps||0, setType:'main', done:false });
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtRemoveSet(entryIdx, si) {
  S.exercises[entryIdx].sets.splice(si, 1);
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtUpdateSet(entryIdx, si, field, val) {
  S.exercises[entryIdx].sets[si][field] = field === 'setType' ? val : (parseFloat(val) || 0);
  if (field === 'kg' || field === 'reps') {
    S.exercises[entryIdx].sets[si].done = false;
  }
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleSetDone(entryIdx, si) {
  const wasDone = S.exercises[entryIdx].sets[si].done;
  S.exercises[entryIdx].sets[si].done = !wasDone;
  _renderSets(entryIdx);
  saveWorkoutDay().then(() => {
    _renderExerciseList();
    if (!wasDone) showToast('저장되었습니다', 1500, 'success');
  }).catch(e => console.error('Save error:', e));
  if (!wasDone) {
    const ex = getExList().find(e => e.id === S.exercises[entryIdx].exerciseId);
    const exName = ex?.name || S.exercises[entryIdx].exerciseId;
    const setNum = si + 1;
    wtRestTimerStart(null, `${exName} ${setNum}세트 후 휴식`);
  }
}

export function wtUpdateSetType(entryIdx, si, val) {
  S.exercises[entryIdx].sets[si].setType = val;
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtMoveSet(entryIdx, si, direction) {
  const sets = S.exercises[entryIdx].sets;
  const targetIdx = si + direction;
  if (targetIdx < 0 || targetIdx >= sets.length) return;
  [sets[si], sets[targetIdx]] = [sets[targetIdx], sets[si]];
  _renderSets(entryIdx);
  saveWorkoutDay().then(() => showToast('순서가 변경되었습니다', 1500, 'success')).catch(e => console.error('Save error:', e));
}

export function wtRemoveExerciseEntry(entryIdx) {
  S.exercises.splice(entryIdx, 1);
  _renderExerciseList();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

// ── 운동 목록 렌더 ──────────────────────────────────────────────
export function _renderExerciseList() {
  const container = document.getElementById('wt-exercise-list');
  if (!container) return;
  container.innerHTML = '';

  S.exercises.forEach((entry, idx) => {
    const ex   = getExList().find(e => e.id === entry.exerciseId);
    const mc   = MUSCLES.find(m => m.id === entry.muscleId);
    const last = getLastSession(entry.exerciseId);
    const isToday = S.date && last?.date === dateKey(S.date.y, S.date.m, S.date.d);
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
        S.exercises[idx].sets = JSON.parse(JSON.stringify(last.sets));
        saveWorkoutDay().then(() => _renderExerciseList()).catch(e => console.error('Save error:', e));
      });
    }
    container.appendChild(block);
    _renderSets(idx);
  });
}

// ── 세트 행 렌더 ────────────────────────────────────────────────
function _renderSets(entryIdx) {
  const el = document.getElementById(`wt-sets-${entryIdx}`);
  if (!el) return;
  const sets = S.exercises[entryIdx].sets;
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
      <button class="set-remove-btn">✕</button>
      <span class="set-drag-handle" title="드래그하여 순서 변경"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>`;

    row.querySelector('.set-type-select').addEventListener('change', e => wtUpdateSetType(entryIdx, si, e.target.value));
    row.querySelectorAll('.set-input')[0].addEventListener('change', e => wtUpdateSet(entryIdx, si, 'kg',   e.target.value));
    row.querySelectorAll('.set-input')[0].addEventListener('focus', () => { if (S.restTimer.running) wtRestTimerSkip(); });
    row.querySelectorAll('.set-input')[1].addEventListener('change', e => wtUpdateSet(entryIdx, si, 'reps', e.target.value));
    row.querySelectorAll('.set-input')[1].addEventListener('focus', () => { if (S.restTimer.running) wtRestTimerSkip(); });
    row.querySelector('.set-done-btn').addEventListener('click', () => wtToggleSetDone(entryIdx, si));
    row.querySelector('.set-remove-btn').addEventListener('click', () => wtRemoveSet(entryIdx, si));
    el.appendChild(row);
  });

  if (typeof Sortable !== 'undefined' && sets.length > 1) {
    new Sortable(el, {
      handle: '.set-drag-handle',
      animation: 150,
      ghostClass: 'set-row-ghost',
      chosenClass: 'set-row-chosen',
      onEnd(evt) {
        const { oldIndex, newIndex } = evt;
        if (oldIndex === newIndex) return;
        const [moved] = S.exercises[entryIdx].sets.splice(oldIndex, 1);
        S.exercises[entryIdx].sets.splice(newIndex, 0, moved);
        _renderSets(entryIdx);
        saveWorkoutDay().then(() => showToast('순서가 변경되었습니다', 1500, 'success')).catch(e => console.error('Save error:', e));
      }
    });
  }
}

// ── 종목 선택/에디터 모달 ───────────────────────────────────────
export function _renderPickerList() {
  const container = document.getElementById('ex-picker-list');
  if (!container) return;
  container.innerHTML = '';
  MUSCLES.forEach(muscle => {
    const list = getExList()
      .filter(e => e.muscleId === muscle.id)
      .filter(e => !S.hiddenExercises.includes(e.id));

    if (list.length === 0) return;

    const group = document.createElement('div');
    group.className = 'ex-picker-group';
    group.innerHTML = `<div class="ex-picker-group-label" style="color:${muscle.color}">${muscle.name}</div>`;
    list.forEach(ex => {
      const alreadyAdded = S.exercises.some(e => e.exerciseId === ex.id);
      const btn = document.createElement('button');
      btn.className = 'ex-picker-item' + (alreadyAdded ? ' already' : '');
      btn.innerHTML = `<span>${ex.name}${alreadyAdded?' ✓':''}</span>
        <div class="ex-picker-actions">
          <span class="ex-picker-edit" data-exid="${ex.id}">✏️</span>
          <span class="ex-picker-delete" data-exid="${ex.id}">✕</span>
        </div>`;

      btn.querySelector('.ex-picker-edit').addEventListener('click', e => {
        e.stopPropagation();
        wtOpenExerciseEditor(ex.id, null);
      });

      btn.querySelector('.ex-picker-delete').addEventListener('click', e => {
        e.stopPropagation();
        S.hiddenExercises.push(ex.id);
        _renderPickerList();
      });

      if (!alreadyAdded) {
        btn.addEventListener('click', () => {
          S.exercises.push({ muscleId:ex.muscleId, exerciseId:ex.id, sets:[{kg:0,reps:0,setType:'main',done:false}] });
          _renderExerciseList();
          wtCloseExercisePicker();
          const timerBar = document.getElementById('wt-workout-timer-bar');
          if (timerBar && !timerBar.classList.contains('wt-open')) timerBar.classList.add('wt-open');
          if (!S.workoutStartTime && S.workoutDuration === 0) wtStartWorkoutTimer();
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

export async function wtOpenExercisePicker() {
  let modal = document.getElementById('ex-picker-modal');
  if (!modal) {
    const { loadAndInjectModals } = await import('../modal-manager.js');
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
