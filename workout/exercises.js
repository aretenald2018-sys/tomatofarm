// ================================================================
// workout/exercises.js — 세트 CRUD + 운동 picker/editor + 운동 목록 렌더
// ================================================================

import { S }                           from './state.js';
import { saveWorkoutDay }              from './save.js';
import { _buildSparkline }            from './render.js';
import { wtStartWorkoutTimer,
         wtRestTimerStart,
         wtRestTimerSkip }             from './timers.js';
import { showToast }                   from '../home/utils.js';
import { getExList, getGymExList, getLastSession, detectPRs,
         dateKey, saveExercise,
         deleteExercise, getAllMuscles,
         saveCustomMuscle,
         isExpertModeEnabled }          from '../data.js';
import { estimate1RM, rpeRepsToPct, targetWeightKg, weightRange } from '../calc.js';
import { MOVEMENTS }                   from '../config.js';
// resolveCurrentGymId는 expert.js의 단일 진실원 (preset + S.currentGymId 동기화).
// expert.js는 exercises.js를 static import 하지 않으므로 순환 참조 없음.
import { resolveCurrentGymId }           from './expert.js';

const NEW_MUSCLE_OPTION = '__new_custom_muscle__';

function _syncExpertTopArea() {
  if (typeof window.renderExpertTopArea === 'function') {
    window.renderExpertTopArea();
  }
}

function _ensureExpertManualSession() {
  if (!isExpertModeEnabled()) return;
  S.currentGymId = resolveCurrentGymId();
  if (!S.routineMeta) {
    S.routineMeta = {
      source: 'manual',
      candidateKey: null,
      rationale: '',
    };
  }
}

function _normalizeExpertSessionAfterExerciseChange() {
  if (!isExpertModeEnabled()) return;
  if (S.exercises.length === 0) {
    S.routineMeta = null;
    return;
  }
  if (!S.routineMeta) {
    _ensureExpertManualSession();
  }
}

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
  _normalizeExpertSessionAfterExerciseChange();
  _renderExerciseList();
  _syncExpertTopArea();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

// ── Scene 12 UI 헬퍼 (프로 모드 전용) ─────────────────────────
// po-pill, 🏆 PR 도전, RPE 세그먼트, 보수/추천/공격 3칩, ws-foot 설명
//
// 모든 추천 계산은 _computeExpertRec()를 단일 진실원으로 사용.
// last는 호출부에서 today를 제외하고 넘겨줘야 함 (자기참조 방지 — Finding 2).
// e1RM은 RTS 룩업의 역산을 우선 사용(prevRpe 반영 — Finding 3),
// rpe 미상이면 Epley로 폴백.

function _todayDateKey() {
  return (S.date) ? dateKey(S.date.y, S.date.m, S.date.d) : null;
}

function _fmtNum(v) {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// 추천 계산 단일 진실원. last는 today 제외된 이전 세션이어야 함.
function _computeExpertRec({ exerciseId, last, targetRpe = 8 }) {
  if (!last?.sets?.length) return null;
  const mainSets = last.sets.filter(s => s.setType !== 'warmup');
  const refSet   = mainSets.length ? mainSets[mainSets.length - 1] : last.sets[last.sets.length - 1];
  const prevKg     = refSet.kg   || 0;
  const prevReps   = refSet.reps || 0;
  const prevRpeRaw = refSet.rpe;
  if (prevKg <= 0) return null;

  const exEntry  = getExList().find(e => e.id === exerciseId);
  const mov      = exEntry?.movementId ? MOVEMENTS.find(m => m.id === exEntry.movementId) : null;
  const sizeClass = mov?.sizeClass || 'small';
  const stepKg    = (mov?.stepKg > 0) ? mov.stepKg : 2.5;

  const todayReps = prevReps || 10;
  // Finding 3: prevRpe 알려져 있으면 RTS 룩업 역산으로 e1RM 추정,
  //            모르면 Epley 폴백 (RPE10 가정).
  const e1rm = (prevRpeRaw && prevReps > 0)
    ? prevKg / rpeRepsToPct(prevRpeRaw, prevReps)
    : estimate1RM(prevKg, todayReps);
  const target = targetWeightKg(e1rm, targetRpe, todayReps);
  const range  = weightRange(target, sizeClass, stepKg);
  const prInfo = detectPRs(exerciseId);
  const isPRChallenge = prInfo.prKg > 0 && range.recommended > prInfo.prKg;

  return {
    prevKg, prevReps, prevRpe: prevRpeRaw || 8, prevRpeKnown: !!prevRpeRaw,
    sizeClass, stepKg, todayReps,
    e1rm, target,
    conservative: range.conservative,
    recommended:  range.recommended,
    aggressive:   range.aggressive,
    prInfo, isPRChallenge,
  };
}

// po-pill HTML — _computeExpertRec 결과 기반. 비어있으면 ''.
function _buildPoPillHtml({ exerciseId, last, targetRpe = 8 }) {
  const r = _computeExpertRec({ exerciseId, last, targetRpe });
  if (!r) return '';
  if (r.isPRChallenge) return '<span class="po-pill pr">🏆 PR 도전</span>';
  const diff = +(r.recommended - r.prevKg).toFixed(2);
  if (diff > 0) return `<span class="po-pill">+${_fmtNum(diff)}kg ↑</span>`;
  return '';
}

function _buildExpertSceneBlock({ entryIdx, exerciseId, last, targetRpe = 8 }) {
  const fmt = _fmtNum;

  // ── RPE 세그 HTML (active는 targetRpe 기준) ──
  const rpeSegs = [6, 7, 8, 9, 10].map(r =>
    `<div class="rpe-seg${r === targetRpe ? ' active' : ''}">${r}</div>`
  ).join('');
  const rpeRow = `
    <div class="rpe-row">
      <span class="rpe-label">목표 RPE</span>
      <div class="rpe-segmented">${rpeSegs}</div>
    </div>`;

  const rec = _computeExpertRec({ exerciseId, last, targetRpe });
  // 지난 기록 없음 → RPE 세그만 노출
  if (!rec) {
    return `<div class="ex-expert-section" data-entry-idx="${entryIdx}" data-target-rpe="${targetRpe}">${rpeRow}</div>`;
  }

  // ── ws-chip HTML ──
  const chipsHtml = `
    <div class="weight-suggest">
      <div class="ws-chip">
        <div class="ws-chip-kind">보수</div>
        <div class="ws-chip-value">${fmt(rec.conservative)}</div>
      </div>
      <div class="ws-chip recommend">
        <div class="ws-chip-kind">추천</div>
        <div class="ws-chip-value">${fmt(rec.recommended)}</div>
      </div>
      <div class="ws-chip">
        <div class="ws-chip-kind">공격</div>
        <div class="ws-chip-value">${fmt(rec.aggressive)}</div>
      </div>
    </div>`;

  // ── ws-foot 문구 ──
  const diff = +(rec.recommended - rec.prevKg).toFixed(2);
  const sizeLabel = rec.sizeClass === 'small' ? '소근육' : '대근육';
  const foot2 = `e1RM ${rec.e1rm.toFixed(1)} · ${rec.todayReps}×RPE${targetRpe} 환산 · ±${fmt(rec.stepKg)}kg (${sizeLabel} 스텝)`;
  let foot1;
  if (rec.isPRChallenge) {
    foot1 = `지금까지 최고 ${fmt(rec.prInfo.prKg)}kg · 오늘 추천 ${fmt(rec.recommended)}kg을 채우면 <b style="color:var(--primary, #fa342c);">개인 신기록</b>!`;
  } else if (diff > 0) {
    foot1 = `지난 기록 ${fmt(rec.prevKg)}kg×${rec.prevReps}@RPE${rec.prevRpe} → 오늘 <b style="color:var(--success, #1b854a);">+${fmt(diff)}kg 점진 과부하</b>`;
  } else {
    foot1 = `지난 기록 ${fmt(rec.prevKg)}kg×${rec.prevReps}@RPE${rec.prevRpe} → 오늘 동일 무게 유지`;
  }
  const prBanner = rec.isPRChallenge
    ? `<div class="ws-foot" style="margin-bottom:6px;">${foot1}</div>`
    : '';
  const footFinal = rec.isPRChallenge
    ? `<div class="ws-foot">${foot2}</div>`
    : `<div class="ws-foot">${foot1}<br/>${foot2}</div>`;

  return `
    <div class="ex-expert-section" data-entry-idx="${entryIdx}" data-target-rpe="${targetRpe}">
      ${rpeRow}
      ${prBanner}
      ${chipsHtml}
      ${footFinal}
    </div>`;
}

// RPE 세그 클릭 시 expert section + po-pill 동시 재렌더 (Findings 2, 4)
function _rerenderExpertSection(exBlock, entryIdx, exerciseId, newRpe) {
  // Finding 2: 오늘 세션 제외 → 자기참조 방지
  const last = getLastSession(exerciseId, _todayDateKey());

  // expert section 교체
  const newSectionHtml = _buildExpertSceneBlock({ entryIdx, exerciseId, last, targetRpe: newRpe });
  const section = exBlock.querySelector('.ex-expert-section');
  if (section) section.outerHTML = newSectionHtml;

  // Finding 4: po-pill도 새 RPE 기준으로 갱신
  const newPillHtml = _buildPoPillHtml({ exerciseId, last, targetRpe: newRpe });
  const oldPill = exBlock.querySelector('.po-pill');
  if (oldPill) {
    if (newPillHtml) {
      oldPill.outerHTML = newPillHtml;
    } else {
      oldPill.remove();
    }
  } else if (newPillHtml) {
    const nameSpan = exBlock.querySelector('.ex-block-name');
    if (nameSpan) nameSpan.insertAdjacentHTML('afterend', newPillHtml);
  }
}

// ── 운동 목록 렌더 ──────────────────────────────────────────────
export function _renderExerciseList() {
  const container = document.getElementById('wt-exercise-list');
  if (!container) return;
  // Scene 12 chips/RPE 인터랙션 — 한 번만 등록 (재렌더 시 listeners 재생성 방지).
  // 저장 로직 없음(범위 A): RPE 클릭 시 expert section 재렌더, ws-chip 클릭 시 recommend 클래스 이동만.
  if (!container.dataset.sceneInteractive) {
    container.dataset.sceneInteractive = '1';
    container.addEventListener('click', (e) => {
      // RPE 세그 클릭 → expert section 재렌더 (추천 무게 재계산)
      const rpe = e.target.closest('.rpe-seg');
      if (rpe) {
        const newRpe = parseInt(rpe.textContent, 10);
        if (!newRpe) return;
        const exBlock = rpe.closest('.ex-block');
        const section = rpe.closest('.ex-expert-section');
        if (!exBlock || !section) return;
        const entryIdx = parseInt(section.dataset.entryIdx, 10);
        const entry    = S.exercises[entryIdx];
        if (!entry) return;
        _rerenderExpertSection(exBlock, entryIdx, entry.exerciseId, newRpe);
        return;
      }
      // ws-chip 클릭 → recommend 클래스 시각 토글만 (저장 없음)
      const ws = e.target.closest('.ws-chip');
      if (ws) {
        const grp = ws.closest('.weight-suggest');
        grp?.querySelectorAll('.ws-chip').forEach(el => el.classList.toggle('recommend', el === ws));
      }
    });
  }
  container.innerHTML = '';
  const allMuscles = getAllMuscles();
  const isExpert = (() => { try { return isExpertModeEnabled(); } catch { return false; } })();

  // Finding 2: 오늘 세션 제외 → 자기참조 방지. 최근 기록(today 제외).
  const todayKey = _todayDateKey();

  S.exercises.forEach((entry, idx) => {
    const ex   = getExList().find(e => e.id === entry.exerciseId);
    const mc   = allMuscles.find(m => m.id === entry.muscleId);
    const last = getLastSession(entry.exerciseId, todayKey);
    const lastHint = last
      ? `<div class="ex-last-hint">
           📌 직전(${last.date.slice(5).replace('-','/')})
           ${last.sets.map(s=>`${s.kg}×${s.reps}`).join(' / ')}
           <button class="ex-copy-btn" data-idx="${idx}">복사</button>
         </div>`
      : '';
    const sparkline = _buildSparkline(entry.exerciseId, mc?.color);

    // Scene 12 — 프로 모드 전용 UI (e1RM 기반 실제 추천 무게 로직)
    let expertHtml = '';
    let poPillHtml = '';
    if (isExpert) {
      expertHtml = _buildExpertSceneBlock({ entryIdx: idx, exerciseId: entry.exerciseId, last, targetRpe: 8 });
      poPillHtml = _buildPoPillHtml({ exerciseId: entry.exerciseId, last, targetRpe: 8 });
    }

    const block = document.createElement('div');
    block.className = 'ex-block' + (isExpert ? ' ex-block--expert' : '');
    block.innerHTML = `
      <div class="ex-block-header">
        <span class="ex-block-muscle" style="color:${mc?.color||'#888'}">${mc?.name||''}</span>
        <span class="ex-block-name">${ex?.name||entry.exerciseId}</span>
        ${poPillHtml}
        ${sparkline}
        <button class="ex-remove-btn" data-idx="${idx}">✕</button>
      </div>
      ${lastHint}
      <div class="ex-sets" id="wt-sets-${idx}"></div>
      <button class="ex-add-set-btn" data-idx="${idx}">+ 세트 추가</button>
      ${expertHtml}`;

    block.querySelector('.ex-remove-btn').addEventListener('click', () => wtRemoveExerciseEntry(idx));
    block.querySelector('.ex-add-set-btn').addEventListener('click', () => wtAddSet(idx));
    const copyBtn = block.querySelector('.ex-copy-btn');
    if (copyBtn && last) {
      copyBtn.addEventListener('click', () => {
        S.exercises[idx].sets = JSON.parse(JSON.stringify(last.sets)).map(s => ({ ...s, done: false }));
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
// 전문가 모드에서는 resolveCurrentGymId()로 단일 진실원 조회 후 해당 헬스장 기구만.
// S.currentGymId가 stale이어도 resolveCurrentGymId가 자동 복구 + 동기화.
// 일반 모드는 전체 기구 풀 사용.
function _getPickerExercisePool() {
  try {
    if (!isExpertModeEnabled()) return getExList();
    const gymId = resolveCurrentGymId();
    return gymId ? getGymExList(gymId) : getExList();
  } catch { return getExList(); }
}

export function _renderPickerList() {
  const container = document.getElementById('ex-picker-list');
  if (!container) return;
  container.innerHTML = '';
  const allMuscles = getAllMuscles();
  const pool = _getPickerExercisePool();
  // P1-5: 맞춤 루틴 모드에서는 선택 전용 — 편집/삭제/신규 종목 추가는 숨김.
  // 오늘 할 운동을 고르는 순간에 카탈로그 편집 UI가 섞이면 멘탈모델이 깨짐.
  const isExpert = (() => { try { return isExpertModeEnabled(); } catch { return false; } })();
  allMuscles.forEach(muscle => {
    const list = pool
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
      if (isExpert) {
        btn.innerHTML = `<span>${ex.name}${alreadyAdded?' ✓':''}</span>`;
      } else {
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
      }

      if (!alreadyAdded) {
        btn.addEventListener('click', () => {
          _ensureExpertManualSession();
          S.exercises.push({ muscleId:ex.muscleId, exerciseId:ex.id, sets:[{kg:0,reps:0,setType:'main',done:false}] });
          _renderExerciseList();
          _syncExpertTopArea();
          wtCloseExercisePicker();
          const timerBar = document.getElementById('wt-workout-timer-bar');
          if (timerBar && !timerBar.classList.contains('wt-open')) timerBar.classList.add('wt-open');
          if (!S.workoutStartTime && S.workoutDuration === 0) wtStartWorkoutTimer();
          saveWorkoutDay().catch(e => console.error('Save error:', e));
        });
      }
      group.appendChild(btn);
    });
    // P1-5: 맞춤 루틴 모드에서는 "신규 종목 추가" 버튼 숨김 (카탈로그 편집 분리)
    if (!isExpert) {
      const addBtn = document.createElement('button');
      addBtn.className = 'ex-picker-add';
      addBtn.textContent = `+ ${muscle.name} 종목 추가(선택)`;
      addBtn.addEventListener('click', () => wtOpenExerciseEditor(null, muscle.id));
      group.appendChild(addBtn);
    }
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
  const allMuscles = getAllMuscles();
  let addMuscleWrap = document.getElementById('ex-editor-new-muscle-wrap');
  if (!addMuscleWrap) {
    addMuscleWrap = document.createElement('div');
    addMuscleWrap.id = 'ex-editor-new-muscle-wrap';
    addMuscleWrap.style.display = 'none';
    addMuscleWrap.style.marginTop = '8px';
    addMuscleWrap.innerHTML = '<input class="ex-editor-input" id="ex-editor-new-muscle-name" placeholder="새 부위 이름 입력">';
    muscleSelect.parentElement.appendChild(addMuscleWrap);
  }

  muscleSelect.innerHTML = allMuscles.map(m =>
    `<option value="${m.id}">${m.name}</option>`).join('') +
    `<option value="${NEW_MUSCLE_OPTION}">＋ 새 부위 추가</option>`;
  muscleSelect.onchange = () => {
    addMuscleWrap.style.display = muscleSelect.value === NEW_MUSCLE_OPTION ? '' : 'none';
  };

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
  const customNameInput = document.getElementById('ex-editor-new-muscle-name');
  if (customNameInput) customNameInput.value = '';
  addMuscleWrap.style.display = muscleSelect.value === NEW_MUSCLE_OPTION ? '' : 'none';

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
  const muscleSelect = document.getElementById('ex-editor-muscle');
  let muscleId = muscleSelect.value;
  if (!name) { alert('종목 이름을 입력해주세요.'); return; }
  if (muscleId === NEW_MUSCLE_OPTION) {
    const newMuscleName = document.getElementById('ex-editor-new-muscle-name')?.value?.trim() || '';
    if (!newMuscleName) { alert('새 부위 이름을 입력해주세요.'); return; }
    muscleId = `muscle_${Date.now()}`;
    await saveCustomMuscle({ id: muscleId, name: newMuscleName, color: '#8b5cf6' });
  }
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
