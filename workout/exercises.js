// ================================================================
// workout/exercises.js — 세트 CRUD + 운동 picker/editor + 운동 목록 렌더
// ================================================================

import { S }                           from './state.js';
import { saveWorkoutDay }              from './save.js';
import { _buildSparkline }            from './render.js';
import { wtStartWorkoutTimer,
         wtRestTimerStart }            from './timers.js';
import { showToast }                   from '../home/utils.js';
import { getExList, getGymExList, getLastSession, detectPRs, getCache,
         dateKey, saveExercise,
         deleteExercise, getMuscleParts,
         saveCustomMuscle,
         isExpertModeEnabled,
         getExpertPreset }              from '../data.js';
import { estimate1RM, rpeRepsToPct, targetWeightKg, weightRange } from '../calc.js';
import { MOVEMENTS, EQUIPMENT_CATEGORIES } from '../config.js';
// resolveCurrentGymId는 expert.js의 단일 진실원 (preset + S.workout.currentGymId 동기화).
// isExpertViewShown은 세션 뷰 상태 (일반 모드 뷰 ↔ 프로 모드 뷰) 조회용.
// expert.js는 exercises.js를 static import 하지 않으므로 순환 참조 없음.
import { resolveCurrentGymId, isExpertViewShown } from './expert.js';

// preset.enabled=true + 프로 모드 뷰 둘 다일 때만 'expert 세션'으로 간주.
// '일반 모드 뷰' 중에는 picker가 전체 기구 풀을 쓰도록 분기 (현재 헬스장에 기구 0개여도
// 디폴트 종목이 보이게 함).
function _isExpertSessionActive() {
  try { return !!isExpertModeEnabled() && !!isExpertViewShown(); }
  catch { return false; }
}

const NEW_MUSCLE_OPTION = '__new_custom_muscle__';

function _syncExpertTopArea() {
  if (typeof window.renderExpertTopArea === 'function') {
    window.renderExpertTopArea();
  }
}

// _isExpertUiEnabled — RPE 등 프로모드 전용 UI 표시 여부 판정.
// 이전에는 preset.enabled만 봐서, 일반모드 뷰에서도 RPE select이 세트 행에 삽입되어
// flex 레이아웃이 깨지는 이슈가 있었음 (유저: '운동체크 시 RPE 버튼이 생기면서 디자인 망가짐').
// 이제는 '프로모드 preset 활성 && 프로모드 뷰 표시' 동시 조건만 true.
function _isExpertUiEnabled() {
  try {
    return !!isExpertModeEnabled() && !!isExpertViewShown();
  } catch {
    return false;
  }
}

function _ensureExpertManualSession() {
  if (!isExpertModeEnabled()) return;
  S.workout.currentGymId = resolveCurrentGymId();
  if (!S.workout.routineMeta) {
    S.workout.routineMeta = {
      source: 'manual',
      candidateKey: null,
      rationale: '',
    };
  }
}

function _normalizeExpertSessionAfterExerciseChange() {
  if (!isExpertModeEnabled()) return;
  if (S.workout.exercises.length === 0) {
    S.workout.routineMeta = null;
    return;
  }
  if (!S.workout.routineMeta) {
    _ensureExpertManualSession();
  }
}

// ── 세트 조작 ────────────────────────────────────────────────────
export function wtAddSet(entryIdx) {
  const prev = S.workout.exercises[entryIdx].sets.slice(-1)[0];
  S.workout.exercises[entryIdx].sets.push({ kg: prev?.kg||0, reps: prev?.reps||0, setType:'main', done:false });
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtRemoveSet(entryIdx, si) {
  // Undo Toast 3초: 세트 객체와 원래 위치를 기억해두고 복원 지원
  const removed = S.workout.exercises[entryIdx].sets.splice(si, 1)[0];
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
  if (!removed) return;
  window.showToast?.('세트 삭제됨', 3000, 'info', {
    action: '실행 취소',
    onAction: () => {
      if (!S.workout.exercises[entryIdx]) return;
      S.workout.exercises[entryIdx].sets.splice(si, 0, removed);
      _renderSets(entryIdx);
      saveWorkoutDay().catch(e => console.error('Restore error:', e));
    },
  });
}

// 2026-04-20: 세트 기록(kg/reps 입력, ✓ 체크)이 생기면 운동 타이머 자동 시작.
//   타이머가 아직 시작 안 됐고 누적 duration 도 없으면만 자동시작. 유저가 명시적으로 reset 해
//   둔 세션(duration>0 에서 reset 후 다시 기록)은 수동 play 로 이어가도록 건드리지 않는다.
function _ensureWorkoutTimerStarted() {
  if (!S.workout.workoutStartTime && (S.workout.workoutDuration || 0) === 0) {
    try { wtStartWorkoutTimer(); } catch (e) { console.warn('[autoStartTimer] fail:', e?.message || e); }
  }
}

function _exerciseSubPattern(entry, ex) {
  if (entry?.maxWeakPart) return entry.maxWeakPart;
  const muscleIds = Array.isArray(entry?.muscleIds) && entry.muscleIds.length
    ? entry.muscleIds
    : (Array.isArray(ex?.muscleIds) ? ex.muscleIds : []);
  if (muscleIds[0]) return muscleIds[0];
  const movId = entry?.movementId || ex?.movementId || null;
  return MOVEMENTS.find(m => m.id === movId)?.subPattern || null;
}

function _maybeShowMaxSetCoach(entryIdx, si) {
  let preset;
  try { preset = getExpertPreset(); } catch { return; }
  if (preset?.mode !== 'max') return;
  const entry = S.workout.exercises[entryIdx];
  const set = entry?.sets?.[si];
  if (!entry || !set || set.setType === 'warmup') return;
  const kg = Number(set.kg) || 0;
  const reps = Number(set.reps) || 0;
  if (kg <= 0 || reps <= 0) return;
  const meta = S.workout.maxMeta || {};
  const sessionType = meta.sessionType === 'heavy_volume' ? 'heavy_volume' : 'high_volume';
  const ex = getExList().find(e => e.id === entry.exerciseId);
  const prescription = _resolveMaxPrescription(entry, ex);
  const sp = _exerciseSubPattern(entry, ex);
  const isWeak = Array.isArray(meta.selectedWeakParts) && sp && meta.selectedWeakParts.includes(sp);
  const key = `${dateKey(S.shared.date.y, S.shared.date.m, S.shared.date.d)}:${entry.exerciseId}:${si}:${kg}:${reps}`;
  window.__maxCoachShown = window.__maxCoachShown || new Set();
  if (window.__maxCoachShown.has(key)) return;
  window.__maxCoachShown.add(key);
  const repsHigh = Number(prescription?.repsHigh) || (sessionType === 'heavy_volume' ? 10 : 18);
  const repsLow = Number(prescription?.repsLow) || (sessionType === 'heavy_volume' ? 6 : 12);
  if (reps >= repsHigh + 3) {
    showToast(`맥스 코치: ${reps}회 가능하면 다음 세트 +${_stepForExercise(ex)}kg 검토`, 3200, 'info');
  } else if (sessionType === 'high_volume' && reps >= repsHigh) {
    showToast('맥스 코치: 고볼륨 Day 적합. 같은 중량으로 1-2세트 더 쌓아도 좋아요.', 3200, 'info');
  } else if (reps < Math.max(1, repsLow - 2)) {
    showToast('맥스 코치: 목표 반복 하한보다 낮습니다. 오늘은 무게를 유지하고 반복 품질을 맞추세요.', 3200, 'info');
  } else if (isWeak && reps >= 10) {
    showToast('약점 코치: 선택한 약점 부위 유효 세트로 집계됩니다.', 2400, 'success');
  }
}

function _stepForExercise(ex) {
  const mov = MOVEMENTS.find(m => m.id === ex?.movementId);
  return mov?.stepKg || ex?.incrementKg || 2.5;
}

function _roundToStep(kg, step) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  const k = Number(kg) || 0;
  return Math.round(k / s) * s;
}

function _localMaxPrescription({ movement, exerciseId, sessionType, weakTarget } = {}) {
  if (!movement?.id) return null;
  const isHeavy = sessionType === 'heavy_volume';
  const isCore = movement.subPattern === 'core' || movement.primary === 'abs';
  const isLarge = movement.sizeClass === 'large';
  const targetSets = weakTarget ? 5 : 4;
  const repsLow = isCore ? 10 : (isHeavy ? (isLarge ? 6 : 8) : (isLarge ? 8 : 12));
  const repsHigh = isCore ? 15 : (isHeavy ? (isLarge ? 10 : 12) : (isLarge ? 12 : 18));
  const targetRpe = isHeavy ? 9 : 8;
  const targetReps = isHeavy ? repsLow : repsHigh;
  const step = Number(movement.stepKg) > 0 ? Number(movement.stepKg) : 2.5;
  const todayKey = dateKey(S.shared.date.y, S.shared.date.m, S.shared.date.d);
  const last = exerciseId ? getLastSession(exerciseId, todayKey) : null;
  const bestSet = (last?.sets || [])
    .filter(s => s && s.setType !== 'warmup' && (s.done === true || ((s.kg || 0) > 0 && (s.reps || 0) > 0)))
    .map(s => ({ ...s, e1rm: estimate1RM(s.kg, s.reps) }))
    .sort((a, b) => b.e1rm - a.e1rm)[0] || null;
  const pct = Math.max(0.55, Math.min(0.86, 1 - targetReps * 0.025 - (targetRpe >= 9 ? 0 : 0.03)));
  let startKg = bestSet ? _roundToStep(estimate1RM(bestSet.kg, bestSet.reps) * pct, step) : 0;
  let action = isHeavy ? 'load' : (weakTarget || !isLarge ? 'volume' : 'hold');
  let reason = '과거 기록 기반으로 오늘 목표 세트와 반복을 제안합니다.';
  if (bestSet && (Number(bestSet.reps) || 0) >= repsHigh + 3) {
    action = 'load';
    startKg = startKg > 0 ? _roundToStep(startKg + step, step) : startKg;
    reason = `상한보다 ${(Number(bestSet.reps) || 0) - repsHigh}회 더 가능해 증량 후보입니다.`;
  } else if (bestSet && !isHeavy && (Number(bestSet.reps) || 0) >= repsHigh) {
    action = 'volume';
    reason = '고볼륨 Day에서는 같은 무게로 유효 세트 누적을 우선합니다.';
  }
  const actionLabel = action === 'load' ? '증량' : (action === 'volume' ? '볼륨' : '유지');
  return {
    label: `${targetSets}세트 x ${repsLow}-${repsHigh}회 · RPE ${targetRpe}`,
    targetSets, repsLow, repsHigh, targetRpe, startKg, action, actionLabel, reason,
  };
}

function _resolveMaxPrescription(entry, ex) {
  if (entry?.maxPrescription) return entry.maxPrescription;
  let preset;
  try { preset = getExpertPreset(); } catch { return null; }
  if (preset?.mode !== 'max') return null;
  const movement = MOVEMENTS.find(m => m.id === (entry?.movementId || ex?.movementId));
  if (!movement) return null;
  const meta = S.workout.maxMeta || {};
  return _localMaxPrescription({
    movement,
    exerciseId: entry?.exerciseId || ex?.id || null,
    sessionType: meta.sessionType === 'heavy_volume' ? 'heavy_volume' : 'high_volume',
    weakTarget: !!entry?.maxWeakPart,
  });
}

function _buildMaxPrescriptionBlock(entry, ex) {
  const prescription = _resolveMaxPrescription(entry, ex);
  if (!prescription) return '';
  const kg = Number(prescription.startKg) > 0 ? ` · 시작 ${prescription.startKg}kg` : '';
  const action = prescription.actionLabel || (prescription.action === 'load' ? '증량' : prescription.action === 'volume' ? '볼륨' : '유지');
  const reason = prescription.reason || '과거 기록 기반으로 오늘 목표 세트와 반복을 제안합니다.';
  return `
    <div class="ex-max-prescription">
      <div class="ex-max-prescription-main">맥스 처방 · ${prescription.label}${kg}</div>
      <div class="ex-max-prescription-sub"><span>${action}</span>${reason}</div>
    </div>
  `;
}

export function wtUpdateSet(entryIdx, si, field, val) {
  // RPE 빈 값은 null로 저장 — 0과 구분해 _computeExpertRec의 prevRpeKnown 판정을 명확히.
  let parsed;
  if (field === 'setType') parsed = val;
  else if (field === 'rpe') parsed = (val === '' || val == null) ? null : (parseFloat(val) || null);
  else parsed = (parseFloat(val) || 0);
  S.workout.exercises[entryIdx].sets[si][field] = parsed;
  if (field === 'kg' || field === 'reps') {
    S.workout.exercises[entryIdx].sets[si].done = false;
    // 의미 있는 수치(>0)가 들어왔을 때만 타이머 자동시작. 실수로 0 치고 나가는 건 무시.
    if ((parsed || 0) > 0) _ensureWorkoutTimerStarted();
  }
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtToggleSetDone(entryIdx, si) {
  const wasDone = S.workout.exercises[entryIdx].sets[si].done;
  S.workout.exercises[entryIdx].sets[si].done = !wasDone;
  _renderSets(entryIdx);
  saveWorkoutDay().then(() => {
    _renderExerciseList();
    if (!wasDone) showToast('저장되었습니다', 1500, 'success');
  }).catch(e => console.error('Save error:', e));
  if (!wasDone) {
    // 완료 체크 = 실제 운동 진행 중. 타이머 자동시작.
    _ensureWorkoutTimerStarted();
    _maybeShowMaxSetCoach(entryIdx, si);
    const ex = getExList().find(e => e.id === S.workout.exercises[entryIdx].exerciseId);
    const exName = ex?.name || S.workout.exercises[entryIdx].exerciseId;
    const setNum = si + 1;
    wtRestTimerStart(null, `${exName} ${setNum}세트 후 휴식`);
  }
}

export function wtUpdateSetType(entryIdx, si, val) {
  S.workout.exercises[entryIdx].sets[si].setType = val;
  _renderSets(entryIdx);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtMoveSet(entryIdx, si, direction) {
  const sets = S.workout.exercises[entryIdx].sets;
  const targetIdx = si + direction;
  if (targetIdx < 0 || targetIdx >= sets.length) return;
  [sets[si], sets[targetIdx]] = [sets[targetIdx], sets[si]];
  _renderSets(entryIdx);
  saveWorkoutDay().then(() => showToast('순서가 변경되었습니다', 1500, 'success')).catch(e => console.error('Save error:', e));
}

export function wtRemoveExerciseEntry(entryIdx) {
  S.workout.exercises.splice(entryIdx, 1);
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
  return (S.shared.date) ? dateKey(S.shared.date.y, S.shared.date.m, S.shared.date.d) : null;
}

function _fmtNum(v) {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// 유저 preferredRpe('6-7'|'7-8'|'8-9') → targetRpe 정수.
// 범위 상한을 사용 — "오늘 마지막 세트에서 도달할 RPE" 의미이므로 상한이 적절.
// 기본값 8(중강도)은 점진적 과부하 표준 타깃.
function _presetTargetRpe() {
  try {
    const p = getExpertPreset();
    const str = String(p?.preferredRpe || '7-8');
    const high = parseInt(str.split('-').pop(), 10);
    return [6,7,8,9,10].includes(high) ? high : 8;
  } catch { return 8; }
}

// 추천 산출용 reference 세션 결정.
//   1순위: 이전 세션(today 제외) — 자기참조 방지(Finding 2)
//   2순위: 오늘 현재 entry의 완료 본세트 — prior 없을 때 fallback
//          (chips가 안 떠서 답답한 UX 방지)
//   둘 다 없으면 null → RPE 세그만 노출.
function _resolveLastForRec(entryIdx, exerciseId) {
  const todayKey = _todayDateKey();
  const prior = getLastSession(exerciseId, todayKey);
  if (prior?.sets?.length) return prior;
  const entry = S.workout.exercises[entryIdx];
  if (!entry) return null;
  const todayMain = (entry.sets || []).filter(s =>
    s && s.setType !== 'warmup' &&
    (s.done === true || ((s.kg || 0) > 0 && (s.reps || 0) > 0))
  );
  if (!todayMain.length) return null;
  return { date: todayKey, sets: todayMain, _fromCurrentEntry: true };
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
    fromCurrentEntry: !!last._fromCurrentEntry,
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
  // 지난 기록/오늘 완료 세트 모두 없음 → 안내용 placeholder + 설명 노출
  if (!rec) {
    const emptyChipsHtml = `
      <div class="weight-suggest">
        <div class="ws-chip">
          <div class="ws-chip-kind">보수</div>
          <div class="ws-chip-value">-</div>
        </div>
        <div class="ws-chip recommend">
          <div class="ws-chip-kind">추천</div>
          <div class="ws-chip-value">-</div>
        </div>
        <div class="ws-chip">
          <div class="ws-chip-kind">공격</div>
          <div class="ws-chip-value">-</div>
        </div>
      </div>`;
    const emptyFoot = `
      <div class="ws-foot">
        아직 기준 기록이 없어 추천 무게를 계산할 수 없어요.<br/>
        kg·횟수·RPE 기록이 쌓이면 선택한 RPE ${targetRpe} 기준으로 보수/추천/공격 무게를 자동 제안해드릴게요.
      </div>`;
    return `
      <div class="ex-expert-section" data-entry-idx="${entryIdx}" data-target-rpe="${targetRpe}">
        ${rpeRow}
        ${emptyChipsHtml}
        ${emptyFoot}
      </div>`;
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
  const refLabel  = rec.fromCurrentEntry ? '방금' : '지난 기록';
  const nextLabel = rec.fromCurrentEntry ? '다음 세트' : '오늘';
  const foot2 = `e1RM ${rec.e1rm.toFixed(1)} · ${rec.todayReps}×RPE${targetRpe} 환산 · ±${fmt(rec.stepKg)}kg (${sizeLabel} 스텝)`;
  // RTS 기반 RPE 갭 해설: 실제 수행 RPE가 목표 RPE보다 낮으면(여유) → 무게 증가 신호,
  // 높으면(버거움) → 무게 유지/감량 신호. e1RM 역산이 이 원리를 이미 반영하지만,
  // 사용자에게 "왜 이 무게인지"를 과학적으로 설명하기 위해 갭을 명시.
  const rpeGap = rec.prevRpeKnown ? +(targetRpe - rec.prevRpe).toFixed(1) : null;
  let rpeHint = '';
  if (rec.prevRpeKnown && rpeGap !== null) {
    if (rpeGap >= 1.5) rpeHint = ` · 지난 세트 여유(RPE${rec.prevRpe}) → 오늘 ${nextLabel} 강도 상향`;
    else if (rpeGap <= -0.5) rpeHint = ` · 지난 세트 과부하(RPE${rec.prevRpe}) → 유지/조금 낮춤`;
    else rpeHint = ` · 목표 RPE 근접 → 점진 증량 유지`;
  }
  let foot1;
  if (rec.isPRChallenge) {
    foot1 = `지금까지 최고 ${fmt(rec.prInfo.prKg)}kg · 오늘 추천 ${fmt(rec.recommended)}kg을 채우면 <b style="color:var(--primary, #fa342c);">개인 신기록</b>!`;
  } else if (diff > 0) {
    foot1 = `${refLabel} ${fmt(rec.prevKg)}kg×${rec.prevReps}@RPE${rec.prevRpe}${rec.prevRpeKnown ? '' : '(추정)'} → ${nextLabel} <b style="color:var(--success, #1b854a);">+${fmt(diff)}kg 점진 과부하</b>${rpeHint}`;
  } else {
    foot1 = `${refLabel} ${fmt(rec.prevKg)}kg×${rec.prevReps}@RPE${rec.prevRpe}${rec.prevRpeKnown ? '' : '(추정)'} → ${nextLabel} 동일 무게 유지${rpeHint}`;
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
  // Finding 2 + 폴백: 이전 세션 또는 오늘 entry의 완료 본세트 사용.
  const last = _resolveLastForRec(entryIdx, exerciseId);

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
      if (!_isExpertUiEnabled()) return;
      // RPE 세그 클릭 → expert section 재렌더 (추천 무게 재계산)
      const rpe = e.target.closest('.rpe-seg');
      if (rpe) {
        const newRpe = parseInt(rpe.textContent, 10);
        if (!newRpe) return;
        const exBlock = rpe.closest('.ex-block');
        const section = rpe.closest('.ex-expert-section');
        if (!exBlock || !section) return;
        const entryIdx = parseInt(section.dataset.entryIdx, 10);
        const entry    = S.workout.exercises[entryIdx];
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
  const allMuscles = getMuscleParts();
  const isExpert = _isExpertUiEnabled();

  // Finding 2: 오늘 세션 제외 → 자기참조 방지. 최근 기록(today 제외).
  const todayKey = _todayDateKey();

  S.workout.exercises.forEach((entry, idx) => {
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
    const maxPrescriptionHtml = _buildMaxPrescriptionBlock(entry, ex);

    // Scene 12 — 프로 모드 전용 UI (e1RM 기반 실제 추천 무게 로직)
    // chips/footer는 prior 우선, 없으면 오늘 entry의 완료 본세트로 폴백.
    let expertHtml = '';
    let poPillHtml = '';
    if (isExpert) {
      const lastForRec = _resolveLastForRec(idx, entry.exerciseId);
      const presetRpe = _presetTargetRpe();
      expertHtml = _buildExpertSceneBlock({ entryIdx: idx, exerciseId: entry.exerciseId, last: lastForRec, targetRpe: presetRpe });
      poPillHtml = _buildPoPillHtml({ exerciseId: entry.exerciseId, last: lastForRec, targetRpe: presetRpe });
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
      ${maxPrescriptionHtml}
      <div class="ex-sets" id="wt-sets-${idx}"></div>
      <button class="ex-add-set-btn" data-idx="${idx}">+ 세트 추가</button>
      ${expertHtml}`;

    block.querySelector('.ex-remove-btn').addEventListener('click', () => wtRemoveExerciseEntry(idx));
    block.querySelector('.ex-add-set-btn').addEventListener('click', () => wtAddSet(idx));
    const copyBtn = block.querySelector('.ex-copy-btn');
    if (copyBtn && last) {
      copyBtn.addEventListener('click', () => {
        // C-1: 종목 세트 복사도 활동 복사와 동일하게 Undo 토스트 제공.
        const prevSets = JSON.parse(JSON.stringify(S.workout.exercises[idx].sets || []));
        S.workout.exercises[idx].sets = JSON.parse(JSON.stringify(last.sets)).map(s => ({ ...s, done: false }));
        saveWorkoutDay().then(() => _renderExerciseList()).catch(e => console.error('Save error:', e));
        showToast('직전 세트를 불러왔어요', 3000, 'success', {
          action: '실행 취소',
          onAction: () => {
            if (!S.workout.exercises[idx]) return;
            S.workout.exercises[idx].sets = prevSets;
            saveWorkoutDay().then(() => _renderExerciseList()).catch(e => console.error('Undo save:', e));
          },
        });
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
  const sets = S.workout.exercises[entryIdx].sets;
  el.innerHTML = '';

  const isExpert = _isExpertUiEnabled();
  sets.forEach((set, si) => {
    const isWarmup = set.setType === 'warmup';
    const isDone   = set.done !== false;
    const vol = (set.kg && set.reps && !isWarmup && isDone)
      ? `<span style="color:var(--accent)">${(set.kg*set.reps).toLocaleString()}vol</span>`
      : (isWarmup ? '<span style="color:var(--muted);font-size:9px">웜업</span>' : '');

    // 실제 수행 RPE 선택 UI — Expert + 본세트 + 완료 상태에서만 노출.
    // 저장된 RPE는 다음 세션 _computeExpertRec에서 e1RM 역산에 사용되어
    // preferredRpe ↔ 실수행 RPE 갭 기반 점진적 과부하 루프를 구성.
    const rpeSelHtml = (isExpert && !isWarmup && isDone) ? `
      <select class="set-rpe-select" data-idx="${si}" title="실제 수행 RPE">
        <option value="" ${!set.rpe?'selected':''}>RPE</option>
        ${[6,7,8,9,10].map(r => `<option value="${r}" ${Number(set.rpe)===r?'selected':''}>RPE ${r}</option>`).join('')}
      </select>` : '';

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
      ${rpeSelHtml}
      <span class="set-vol">${vol}</span>
      <button class="set-done-btn ${isDone?'done':''}" title="완료 체크">✓</button>
      <button class="set-remove-btn">✕</button>
      <span class="set-drag-handle" title="드래그하여 순서 변경"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>`;

    row.querySelector('.set-type-select').addEventListener('change', e => wtUpdateSetType(entryIdx, si, e.target.value));
    row.querySelectorAll('.set-input')[0].addEventListener('change', e => wtUpdateSet(entryIdx, si, 'kg',   e.target.value));
    // 2026-04-20: kg/reps 입력 focus 시 rest 타이머 skip 호출 제거.
    //   기존: 입력칸 탭 = 휴식 증발 → 숫자 수정하려고 포커스만 줘도 꺼짐.
    //   유저 요구 "타이머는 항상 떠있어야 함" 에 따라 휴식 자동 종료 트리거 제거.
    row.querySelectorAll('.set-input')[1].addEventListener('change', e => wtUpdateSet(entryIdx, si, 'reps', e.target.value));
    row.querySelector('.set-done-btn').addEventListener('click', () => wtToggleSetDone(entryIdx, si));
    row.querySelector('.set-remove-btn').addEventListener('click', () => wtRemoveSet(entryIdx, si));
    const rpeSel = row.querySelector('.set-rpe-select');
    if (rpeSel) rpeSel.addEventListener('change', e => wtUpdateSet(entryIdx, si, 'rpe', e.target.value));
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
        const [moved] = S.workout.exercises[entryIdx].sets.splice(oldIndex, 1);
        S.workout.exercises[entryIdx].sets.splice(newIndex, 0, moved);
        _renderSets(entryIdx);
        saveWorkoutDay().then(() => showToast('순서가 변경되었습니다', 1500, 'success')).catch(e => console.error('Save error:', e));
      }
    });
  }
}

// ── 종목 선택/에디터 모달 ───────────────────────────────────────
// 전문가 세션(preset.enabled + 프로 모드 뷰)에서만 해당 헬스장 기구만.
// S.workout.currentGymId가 stale이어도 resolveCurrentGymId가 자동 복구 + 동기화.
// 일반 모드 뷰(세션 토글) 중이면 preset.enabled=true여도 전체 풀을 써서
// 현재 헬스장이 비어있어도 디폴트 종목이 보이게 함.
function _getPickerExercisePool() {
  try {
    if (!_isExpertSessionActive()) return getExList();
    const gymId = resolveCurrentGymId();
    return gymId ? getGymExList(gymId) : getExList();
  } catch { return getExList(); }
}

// 장비 카테고리 필터 상태 (null = 전체)
let _pickerCategoryFilter = null;
window._wtSetPickerCategoryFilter = (cat) => {
  _pickerCategoryFilter = (_pickerCategoryFilter === cat) ? null : cat;
  _renderPickerList();
};

// C-2: 종목명 검색 상태 (trim + lowercase)
let _pickerSearchQuery = '';
window._wtOnPickerSearch = (q) => {
  _pickerSearchQuery = String(q || '').trim().toLowerCase();
  const clearBtn = document.getElementById('ex-picker-search-clear');
  if (clearBtn) clearBtn.style.display = _pickerSearchQuery ? '' : 'none';
  _renderPickerList();
};
window._wtClearPickerSearch = () => {
  _pickerSearchQuery = '';
  const input = document.getElementById('ex-picker-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('ex-picker-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  _renderPickerList();
};
// C-4: 모든 필터 일괄 해제 ("필터 초기화" 버튼용)
window._wtResetAllPickerFilters = () => {
  _pickerCategoryFilter = null;
  window._wtClearPickerSearch();
};

// Exercise → equipment_category 역조회 (movementId 기반)
function _exerciseCategory(ex) {
  if (ex?.category) return ex.category;
  const mv = MOVEMENTS.find(m => m.id === ex?.movementId);
  return mv?.equipment_category || null;
}

export function _renderPickerList() {
  const container = document.getElementById('ex-picker-list');
  if (!container) return;
  container.innerHTML = '';
  const allMuscles = getMuscleParts();
  const rawPool = _getPickerExercisePool();
  const availableCats = new Set(rawPool.map(_exerciseCategory).filter(Boolean));

  // 필터 유효성 체크: 현재 풀에 해당 카테고리 없으면 자동 해제
  if (_pickerCategoryFilter && !availableCats.has(_pickerCategoryFilter)) {
    _pickerCategoryFilter = null;
  }
  const catFiltered = _pickerCategoryFilter
    ? rawPool.filter(e => _exerciseCategory(e) === _pickerCategoryFilter)
    : rawPool;
  // C-2: 검색어 적용 (종목명 부분 일치, 대소문자 무시)
  const pool = _pickerSearchQuery
    ? catFiltered.filter(e => String(e.name || '').toLowerCase().includes(_pickerSearchQuery))
    : catFiltered;

  // C-4: 현재 활성 필터 배너 — 무엇이 걸려있는지 명시적으로 보여주고 한 번에 해제.
  const filterBadges = [];
  if (_pickerCategoryFilter) {
    const cat = EQUIPMENT_CATEGORIES.find(c => c.id === _pickerCategoryFilter);
    if (cat) filterBadges.push({ type: 'cat', label: `장비: ${cat.label}` });
  }
  if (_pickerSearchQuery) filterBadges.push({ type: 'search', label: `검색: "${_pickerSearchQuery}"` });
  if (filterBadges.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'ex-picker-filter-active-bar';
    banner.innerHTML =
      `<span class="ex-picker-filter-active-text">필터 적용: ${filterBadges.map(b => `<b>${b.label}</b>`).join(' · ')}</span>` +
      `<button type="button" class="tds-btn tonal sm ex-picker-filter-reset" onclick="window._wtResetAllPickerFilters()">필터 해제</button>`;
    container.appendChild(banner);
  }

  // 필터 칩 UI — 카테고리 있는 Exercise가 하나라도 있으면 "전체"+해당 카테고리들 표시.
  // 상단 운동유형 탭(.wt-type-tab)과 클래스 분리 — 같은 DOM에 공존해도 스키마 간섭 없음.
  if (availableCats.size >= 1) {
    const chipBar = document.createElement('div');
    chipBar.className = 'ex-picker-filter-bar';
    const allActive = _pickerCategoryFilter === null;
    chipBar.innerHTML = `<button type="button" class="ex-picker-filter-chip${allActive?' active':''}" onclick="window._wtSetPickerCategoryFilter(null)">전체</button>` +
      EQUIPMENT_CATEGORIES
        .filter(c => availableCats.has(c.id))
        .map(c => `<button type="button" class="ex-picker-filter-chip${_pickerCategoryFilter===c.id?' active':''}" onclick="window._wtSetPickerCategoryFilter('${c.id}')">${c.label}</button>`)
        .join('');
    container.appendChild(chipBar);
  }

  // P1-5: 맞춤 루틴 모드에서는 선택 전용 — 편집/삭제/신규 종목 추가는 숨김.
  // 오늘 할 운동을 고르는 순간에 카탈로그 편집 UI가 섞이면 멘탈모델이 깨짐.
  // '일반 모드 뷰'에서는 preset.enabled=true여도 일반 모드처럼 편집 UI 노출.
  const isExpert = _isExpertSessionActive();
  let renderedGroupCount = 0;
  allMuscles.forEach(muscle => {
    const list = pool
      .filter(e => e.muscleId === muscle.id)
      .filter(e => !S.workout.hiddenExercises.includes(e.id));

    if (list.length === 0) return;
    renderedGroupCount++;

    const group = document.createElement('div');
    group.className = 'ex-picker-group';
    group.innerHTML = `<div class="ex-picker-group-label" style="color:${muscle.color}">${muscle.name}</div>`;
    list.forEach(ex => {
      const alreadyAdded = S.workout.exercises.some(e => e.exerciseId === ex.id);
      const btn = document.createElement('button');
      btn.className = 'ex-picker-item' + (alreadyAdded ? ' already' : '');
      if (isExpert) {
        btn.innerHTML = `<span>${ex.name}${alreadyAdded?' ✓':''}</span>`;
      } else {
        // C-3: ✕(삭제 연상) → 눈감김 아이콘 + "이 목록에서 숨기기" tooltip.
        //     실제로는 "이 헬스장에선 안 써요" 의미라 파괴적 삭제가 아님.
        btn.innerHTML = `<span>${ex.name}${alreadyAdded?' ✓':''}</span>
          <div class="ex-picker-actions">
            <span class="ex-picker-edit" data-exid="${ex.id}" title="종목 수정">✏️</span>
            <span class="ex-picker-hide" data-exid="${ex.id}" title="이 헬스장 목록에서 숨기기" aria-label="이 헬스장 목록에서 숨기기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </span>
          </div>`;

        btn.querySelector('.ex-picker-edit').addEventListener('click', e => {
          e.stopPropagation();
          wtOpenExerciseEditor(ex.id, null);
        });

        btn.querySelector('.ex-picker-hide').addEventListener('click', e => {
          e.stopPropagation();
          S.workout.hiddenExercises.push(ex.id);
          _renderPickerList();
          // Undo 토스트 — 오조작 되돌릴 수 있게 (C-3)
          showToast(`'${ex.name}'을(를) 목록에서 숨겼어요`, 3000, 'success', {
            action: '실행 취소',
            onAction: () => {
              const i = S.workout.hiddenExercises.indexOf(ex.id);
              if (i >= 0) S.workout.hiddenExercises.splice(i, 1);
              _renderPickerList();
            },
          });
        });
      }

      if (!alreadyAdded) {
        btn.addEventListener('click', () => {
          _ensureExpertManualSession();
          S.workout.exercises.push({ muscleId:ex.muscleId, exerciseId:ex.id, sets:[{kg:0,reps:0,setType:'main',done:false}] });
          _renderExerciseList();
          _syncExpertTopArea();
          wtCloseExercisePicker();
          const timerBar = document.getElementById('wt-workout-timer-bar');
          if (timerBar && !timerBar.classList.contains('wt-open')) timerBar.classList.add('wt-open');
          if (!S.workout.workoutStartTime && S.workout.workoutDuration === 0) wtStartWorkoutTimer();
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

  // C-4: 필터/검색 결과가 0건이면 명시적 empty-state (버튼 한 번에 초기화)
  if (renderedGroupCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'ex-picker-empty';
    empty.style.cssText = 'padding:32px 16px; text-align:center; color:var(--text-secondary); font-size:14px; line-height:1.5;';
    const hasFilter = filterBadges.length > 0;
    const emptyMsg = isExpert ? '이 헬스장에 등록된 종목이 없어요' : '등록된 종목이 없어요';
    empty.innerHTML = hasFilter
      ? `<div style="margin-bottom:12px;">조건에 맞는 종목이 없어요</div>
         <button type="button" class="tds-btn tonal sm" onclick="window._wtResetAllPickerFilters()">필터 초기화</button>`
      : `<div>${emptyMsg}</div>`;
    container.appendChild(empty);
  }
}

export async function wtOpenExercisePicker() {
  let modal = document.getElementById('ex-picker-modal');
  if (!modal) {
    const { loadAndInjectModals } = await import('../modal-manager.js');
    await loadAndInjectModals();
    modal = document.getElementById('ex-picker-modal');
  }
  if (!modal) { console.error('[workout] ex-picker-modal not found'); return; }
  // 피커 열 때마다 카테고리/검색 필터 초기화 — 다른 gym/풀 전환 후 빈 화면 lock 방지
  _pickerCategoryFilter = null;
  _pickerSearchQuery = '';
  const searchInput = document.getElementById('ex-picker-search');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('ex-picker-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  _renderPickerList();
  modal.classList.add('open');
}

export function wtOpenExerciseEditor(exId, defaultMuscleId) {
  const editor       = document.getElementById('ex-editor-modal');
  const nameInput    = document.getElementById('ex-editor-name');
  const muscleSelect = document.getElementById('ex-editor-muscle');
  const deleteBtn    = document.getElementById('tds-btn danger sm');
  const titleEl      = document.getElementById('ex-editor-title');
  const allMuscles = getMuscleParts();
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
  if (!name) { window.showToast?.('종목 이름을 입력해주세요', 2500, 'warning'); return; }
  if (muscleId === NEW_MUSCLE_OPTION) {
    const newMuscleName = document.getElementById('ex-editor-new-muscle-name')?.value?.trim() || '';
    if (!newMuscleName) { window.showToast?.('새 부위 이름을 입력해주세요', 2500, 'warning'); return; }
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
  const ok = await (window.confirmAction?.({
    title: '종목을 삭제할까요?',
    message: '이 종목으로 기록된 과거 세트 데이터는 유지되지만,\n앞으로는 선택할 수 없어요.',
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
    longPress: 2000,
  }) || Promise.resolve(false));
  if (!ok) return;
  await deleteExercise(editor.dataset.editingId);
  editor.classList.remove('open');
  wtOpenExercisePicker();
  window.showToast?.('종목이 삭제됐어요', 2000, 'info');
}
