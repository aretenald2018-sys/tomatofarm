// ================================================================
// workout/expert/max.js — 맥스 모드 보강 추천 카드 + 미니 위자드
// ----------------------------------------------------------------
// 맥스(Max) 모드:
//   - 체육관·장비 등록 없이 동작 (프로 모드와 차별점)
//   - 직전·직직전 같은 부위 세션의 약점 subPattern을 자동 감지
//   - 바벨/덤벨 위주 보강 종목을 칩으로 제안 (강제 X — 클릭 시 추가)
//
// 외부 의존:
//   - calc.js : buildMuscleComparison, suggestMaxBoosts
//   - config.js : MOVEMENTS, MAX_PREFERRED_CATEGORIES
//   - data.js : getCache, getExList, getExpertPreset, saveExpertPreset, saveExercise,
//               getMuscleParts, dateKey, TODAY
//   - state.js : S (현재 운동 상태)
// ================================================================

import {
  buildMuscleComparison,
  suggestMaxBoosts,
  SUBPATTERN_TO_MAJOR,
} from '../../calc.js';
import { MOVEMENTS, MAX_PREFERRED_CATEGORIES } from '../../config.js';
import {
  getCache, getExList, getExpertPreset, saveExpertPreset, saveExercise,
  getMuscleParts, dateKey, TODAY,
} from '../../data.js';
import { S } from '../state.js';

function _esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _toast(msg, type='info') {
  if (typeof window.showToast === 'function') window.showToast(msg, 2200, type);
}

// 카테고리 라벨 (칩에 짧게 표시)
const CAT_LABEL = {
  barbell:'바벨', dumbbell:'덤벨', smith:'스미스',
  machine:'머신', cable:'케이블', bodyweight:'맨몸',
};

const MAX_DEFAULTS = {
  goal: 'hypertrophy',
  daysPerWeek: 6,
  sessionMinutes: 90,
  preferredRpe: '8-9',
};

const WEAK_PARTS = [
  { id:'chest_upper', label:'가슴 상부', coach:'상부 볼륨' },
  { id:'chest_lower', label:'가슴 하부', coach:'하부 라인' },
  { id:'back_width', label:'등 넓이', coach:'광배/풀다운' },
  { id:'back_thickness', label:'등 두께', coach:'로우/수축' },
  { id:'shoulder_side', label:'어깨 측면', coach:'측면 볼륨' },
  { id:'rear_delt', label:'어깨 후면', coach:'후면 안정' },
  { id:'bicep', label:'이두', coach:'컬 볼륨' },
  { id:'tricep', label:'삼두', coach:'프레스 보조' },
  { id:'core', label:'복근/코어', coach:'중량 코어' },
  { id:'hamstring', label:'햄스트링', coach:'힌지 보강' },
  { id:'glute', label:'둔근', coach:'힙 파워' },
  { id:'calf', label:'종아리', coach:'하퇴 볼륨' },
];

const WEAK_LABEL = Object.fromEntries(WEAK_PARTS.map(p => [p.id, p.label]));
const MAJOR_PARTS = [
  { id:'chest', label:'가슴', coach:'프레스/플라이' },
  { id:'back', label:'등', coach:'넓이/두께' },
  { id:'lower', label:'하체', coach:'스쿼트/프레스' },
  { id:'shoulder', label:'어깨', coach:'프레스/측면' },
  { id:'glute', label:'둔부', coach:'힙힌지/킥백' },
  { id:'bicep', label:'이두', coach:'컬 볼륨' },
  { id:'tricep', label:'삼두', coach:'푸쉬다운/프레스' },
  { id:'abs', label:'복근', coach:'중량 코어' },
];
const MAJOR_LABEL = Object.fromEntries(MAJOR_PARTS.map(p => [p.id, p.label]));
let _weakTimerInterval = null;

function _ensureMaxMeta() {
  if (!S.workout.maxMeta || typeof S.workout.maxMeta !== 'object') {
    S.workout.maxMeta = {
      mode: 'max',
      sessionType: 'high_volume',
      selectedMajors: [],
      selectedWeakParts: [],
      weakBlock: { durationSec: 0, activeStartedAt: null },
      weakSummary: { sets: 0, volume: 0, byPart: {} },
    };
  }
  if (!Array.isArray(S.workout.maxMeta.selectedMajors)) S.workout.maxMeta.selectedMajors = [];
  if (!Array.isArray(S.workout.maxMeta.selectedWeakParts)) S.workout.maxMeta.selectedWeakParts = [];
  if (!S.workout.maxMeta.weakBlock) S.workout.maxMeta.weakBlock = { durationSec: 0, activeStartedAt: null };
  if (!S.workout.maxMeta.sessionType) S.workout.maxMeta.sessionType = 'high_volume';
  return S.workout.maxMeta;
}

function _normalizeMaxMajor(id) {
  if (!id) return null;
  return SUBPATTERN_TO_MAJOR[id] || (id === 'core' ? 'abs' : id);
}

function _filterWeakPartsByMajors(parts = [], majors = []) {
  const majorSet = new Set((majors || []).map(_normalizeMaxMajor).filter(Boolean));
  if (!majorSet.size) return (parts || []).filter(Boolean);
  return (parts || []).filter(part => {
    const major = _normalizeMaxMajor(part);
    return major && majorSet.has(major);
  });
}

function _weakElapsed(meta = _ensureMaxMeta()) {
  const base = Math.max(0, Number(meta.weakBlock?.durationSec) || 0);
  const started = Number(meta.weakBlock?.activeStartedAt) || 0;
  return started ? base + Math.max(0, Math.floor((Date.now() - started) / 1000)) : base;
}

function _fmtWeakTime(sec) {
  const m = Math.floor((Number(sec) || 0) / 60);
  const s = Math.floor((Number(sec) || 0) % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function _syncWeakTimerText() {
  const el = document.getElementById('wt-max-weak-time');
  if (el) el.textContent = _fmtWeakTime(_weakElapsed());
}

function _ensureWeakTimerTick() {
  if (_weakTimerInterval) clearInterval(_weakTimerInterval);
  const meta = _ensureMaxMeta();
  if (meta.weakBlock.activeStartedAt) {
    _weakTimerInterval = setInterval(_syncWeakTimerText, 1000);
  } else {
    _weakTimerInterval = null;
  }
  _syncWeakTimerText();
}

// 오늘 세션의 dateKey (S.shared.date 기준 — 과거 날짜 편집도 지원)
function _todayKey() {
  const d = S?.shared?.date;
  if (d && typeof d.y === 'number') return dateKey(d.y, d.m, d.d);
  return TODAY;
}

function _renderMaxSetup() {
  const meta = _ensureMaxMeta();
  const selectedMajors = new Set(meta.selectedMajors);
  const selected = new Set(meta.selectedWeakParts);
  const isActive = !!meta.weakBlock.activeStartedAt;
  const sessionType = meta.sessionType === 'heavy_volume' ? 'heavy_volume' : 'high_volume';
  const weakOptions = _filterWeakPartsByMajors(
    WEAK_PARTS.map(p => p.id),
    [...selectedMajors],
  );
  const weakOptionSet = new Set(weakOptions);
  const majorChips = MAJOR_PARTS.map(p => `
    <button type="button" class="wt-max-major-chip${selectedMajors.has(p.id) ? ' is-on' : ''}"
            data-action="set-major-part" data-major-part="${_esc(p.id)}">
      <span>${_esc(p.label)}</span><small>${_esc(p.coach)}</small>
    </button>
  `).join('');
  const weakChips = WEAK_PARTS.filter(p => weakOptionSet.has(p.id)).map(p => `
    <button type="button" class="wt-max-weak-chip${selected.has(p.id) ? ' is-on' : ''}"
            data-action="toggle-weak-part" data-weak-part="${_esc(p.id)}">
      <span>${_esc(p.label)}</span><small>${_esc(p.coach)}</small>
    </button>
  `).join('');
  return `
    <div class="wt-exc wt-max-card wt-max-control-card">
      <div class="wt-exc-head">
        <div class="wt-exc-title">⚡ 맥스 세션 컨트롤</div>
        <div class="wt-exc-meta">주 5-6회 · 90분 기준</div>
      </div>
      <div class="wt-max-body">
        <div class="wt-max-major-head">
          <div class="wt-max-major-title">오늘 큰 부위</div>
          <div class="wt-max-major-sub">테스트 모드는 목표/빈도 대신 오늘 훈련할 큰 부위를 먼저 고릅니다. 등+이두, 가슴+삼두, 하체+둔부처럼 여러 부위를 함께 선택할 수 있습니다.</div>
        </div>
        <div class="wt-max-major-grid">${majorChips}</div>
        <div class="wt-max-session-type" role="group" aria-label="오늘 세션 타입">
          <button type="button" class="wt-max-type-btn${sessionType === 'high_volume' ? ' is-on' : ''}" data-action="set-session-type" data-session-type="high_volume">
            고볼륨 Day <small>중량 낮아도 세트/반복 확보</small>
          </button>
          <button type="button" class="wt-max-type-btn${sessionType === 'heavy_volume' ? ' is-on' : ''}" data-action="set-session-type" data-session-type="heavy_volume">
            중상볼륨 Day <small>중량 유지 + 품질 세트</small>
          </button>
        </div>
        <div class="wt-max-weak-head">
          <div>
            <div class="wt-max-weak-title">약점 부위 전담 코치</div>
            <div class="wt-max-weak-sub">오늘 균형 추천과 별도로 끝까지 챙길 세부 부위를 고르세요.</div>
          </div>
          <button type="button" class="wt-max-timer-btn${isActive ? ' is-running' : ''}" data-action="toggle-weak-timer">
            ${isActive ? '약점 블록 종료' : '약점 블록 시작'} · <span id="wt-max-weak-time">${_fmtWeakTime(_weakElapsed(meta))}</span>
          </button>
        </div>
        <div class="wt-max-weak-grid">${weakChips}</div>
      </div>
    </div>
  `;
}

function _suggestWeakTargetBoosts(selectedParts, takenExerciseIds = []) {
  const selected = Array.isArray(selectedParts) ? selectedParts.filter(Boolean) : [];
  if (!selected.length) return [];
  const takenSet = new Set(takenExerciseIds || []);
  const exList = getExList();
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  return selected.map(sp => {
    const exercises = MOVEMENTS
      .filter(m => m.subPattern === sp)
      .map(m => {
        const isPreferred = MAX_PREFERRED_CATEGORIES.includes(m.equipment_category);
        let score = 0;
        if (isPreferred) score += 5;
        if (m.sizeClass === 'large') score += 2;
        if (movToExId.has(m.id)) score += 2;
        if (takenSet.has(movToExId.get(m.id))) score -= 100;
        if (sp === 'core' && ['cable_crunch', 'ab_wheel', 'hanging_leg_raise'].includes(m.id)) score += 4;
        return {
          movementId: m.id,
          nameKo: m.nameKo,
          equipment_category: m.equipment_category,
          sizeClass: m.sizeClass,
          isPreferred,
          score,
        };
      })
      .filter(x => x.score > -50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return { subPattern: sp, subPatternLabel: WEAK_LABEL[sp] || sp, exercises };
  }).filter(g => g.exercises.length);
}

function _suggestMajorStarters(selectedMajors, takenExerciseIds = []) {
  const majors = Array.isArray(selectedMajors) ? selectedMajors.filter(Boolean) : [];
  if (!majors.length) return [];
  const takenSet = new Set(takenExerciseIds || []);
  const exList = getExList();
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  const takenMovIds = new Set(exList.filter(e => takenSet.has(e.id) && e.movementId).map(e => e.movementId));
  return majors.map(major => {
    const exercises = MOVEMENTS
      .filter(m => m.primary === major)
      .map(m => {
        const isPreferred = MAX_PREFERRED_CATEGORIES.includes(m.equipment_category);
        let score = 0;
        if (m.sizeClass === 'large') score += 5;
        if (isPreferred) score += 4;
        if (movToExId.has(m.id)) score += 3;
        if (takenMovIds.has(m.id)) score -= 100;
        if (major === 'abs' && ['cable_crunch', 'hanging_leg_raise', 'ab_wheel'].includes(m.id)) score += 5;
        return {
          movementId: m.id,
          nameKo: m.nameKo,
          equipment_category: m.equipment_category,
          sizeClass: m.sizeClass,
          isPreferred,
          score,
        };
      })
      .filter(x => x.score > -50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { subPattern: major, subPatternLabel: MAJOR_LABEL[major] || major, exercises };
  }).filter(g => g.exercises.length);
}

function _renderGroups(groups, { titlePrefix = '⚠', weakTarget = false } = {}) {
  return groups.map(g => {
    const chipsHtml = g.exercises.map(ex => {
      const star = ex.isPreferred ? '<span class="wt-max-chip-star">★</span>' : '';
      const catLabel = CAT_LABEL[ex.equipment_category] || ex.equipment_category;
      return `
        <button type="button" class="wt-max-chip${ex.isPreferred ? ' is-preferred' : ''}"
                data-action="apply-max"
                data-movement-id="${_esc(ex.movementId)}"
                ${weakTarget ? `data-weak-part="${_esc(g.subPattern)}"` : ''}
                aria-label="${_esc(ex.nameKo)} 추가">
          ${star}
          <span class="wt-max-chip-name">${_esc(ex.nameKo)}</span>
          <span class="wt-max-chip-cat">${_esc(catLabel)}</span>
        </button>
      `;
    }).join('');
    return `
      <div class="wt-max-group${weakTarget ? ' wt-max-group--coach' : ''}">
        <div class="wt-max-weak-label">${titlePrefix} ${_esc(g.subPatternLabel)}${weakTarget ? ' 전담' : ' 비중 낮음'}</div>
        <div class="wt-max-chips">${chipsHtml}</div>
      </div>
    `;
  }).join('');
}

// 부위 감지 looser — getSessionMajorMuscles는 work set(done=true 또는 kg+reps>0)
// 1개 이상 요구하지만, Max 카드는 사용자가 종목을 추가하기만 해도 약점 분석을
// 시작해야 자연스럽다. 빈 세트/미완료 세트도 majors 후보로 인정.
//   우선순위: ex.muscleIds[0] 의 sub→major → ex.movementId 의 primary → ex.muscleId
function _prescriptionSummary(prescription) {
  if (!prescription) return '';
  const kg = Number(prescription.startKg) > 0 ? ` · 시작 ${prescription.startKg}kg` : '';
  return `${prescription.label}${kg} · ${prescription.actionLabel || '진행'}`;
}

function _storedPrescription(prescription) {
  if (!prescription) return null;
  return {
    label: prescription.label,
    targetSets: prescription.targetSets,
    repsLow: prescription.repsLow,
    repsHigh: prescription.repsHigh,
    targetRpe: prescription.targetRpe,
    startKg: prescription.startKg,
    action: prescription.action,
    actionLabel: prescription.actionLabel,
    deltaKg: prescription.deltaKg,
    reason: prescription.reason,
    lastDateKey: prescription.lastDateKey,
    lastSet: prescription.lastSet,
    weakTarget: prescription.weakTarget,
  };
}

function _workSetsOnly(sets = []) {
  return (sets || []).filter(s => {
    if (!s || s.setType === 'warmup') return false;
    if (s.done === true) return true;
    if (s.done === false) return false;
    return (s.kg || 0) > 0 && (s.reps || 0) > 0;
  });
}

function _roundToStep(kg, step) {
  const s = Number(step) > 0 ? Number(step) : 2.5;
  const k = Number(kg) || 0;
  return Math.round(k / s) * s;
}

function _epley(kg, reps) {
  const k = Number(kg) || 0;
  const r = Number(reps) || 0;
  return k > 0 && r > 0 ? k * (1 + r / 30) : 0;
}

function buildMaxPrescription({
  cache = {},
  exList = [],
  movement = null,
  exerciseId = null,
  todayKey = null,
  sessionType = 'high_volume',
  weakTarget = false,
} = {}) {
  if (!movement?.id) return null;
  const isHeavy = sessionType === 'heavy_volume';
  const isCore = movement.subPattern === 'core' || movement.primary === 'abs';
  const isLarge = movement.sizeClass === 'large';
  const targetSets = weakTarget ? 5 : 4;
  const repsLow = isCore ? 10 : (isHeavy ? (isLarge ? 6 : 8) : (isLarge ? 8 : 12));
  const repsHigh = isCore ? 15 : (isHeavy ? (isLarge ? 10 : 12) : (isLarge ? 12 : 18));
  const targetRpe = isHeavy ? 9 : 8;
  const step = Number(movement.stepKg) > 0 ? Number(movement.stepKg) : 2.5;
  const ids = new Set(exerciseId ? [exerciseId] : (exList || []).filter(e => e?.movementId === movement.id).map(e => e.id));
  const sessions = Object.entries(cache || {})
    .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && (!todayKey || key !== todayKey))
    .sort(([a], [b]) => b.localeCompare(a));
  let bestSet = null;
  let lastDateKey = null;
  for (const [key, day] of sessions) {
    for (const entry of day?.exercises || []) {
      if (!ids.has(entry.exerciseId)) continue;
      const candidate = _workSetsOnly(entry.sets)
        .map(s => ({ ...s, e1rm: _epley(s.kg, s.reps) }))
        .sort((a, b) => b.e1rm - a.e1rm)[0];
      if (candidate) {
        bestSet = candidate;
        lastDateKey = key;
        break;
      }
    }
    if (bestSet) break;
  }
  const targetReps = isHeavy ? repsLow : repsHigh;
  const pct = Math.max(0.55, Math.min(0.86, 1 - targetReps * 0.025 - (targetRpe >= 9 ? 0 : 0.03)));
  let startKg = bestSet ? _roundToStep(_epley(bestSet.kg, bestSet.reps) * pct, step) : 0;
  let action = isHeavy ? 'load' : (weakTarget || !isLarge ? 'volume' : 'hold');
  let deltaKg = 0;
  let reason = '과거 기록이 부족해 기본 처방으로 시작합니다.';
  if (bestSet) {
    if ((Number(bestSet.reps) || 0) >= repsHigh + 3) {
      action = 'load';
      deltaKg = step;
      startKg = startKg > 0 ? _roundToStep(startKg + step, step) : startKg;
      reason = `상한보다 ${(Number(bestSet.reps) || 0) - repsHigh}회 더 가능해 증량 후보입니다.`;
    } else if (isHeavy && (Number(bestSet.reps) || 0) >= repsHigh) {
      action = 'load';
      reason = '중상볼륨 Day에서 목표 상한을 채워 소폭 증량이 적절합니다.';
    } else if (!isHeavy && (Number(bestSet.reps) || 0) >= repsHigh) {
      action = 'volume';
      reason = '고볼륨 Day에서는 같은 무게로 유효 세트 누적을 우선합니다.';
    } else {
      reason = '목표 반복 범위 안이므로 오늘 처방을 그대로 진행합니다.';
    }
  }
  const actionLabel = action === 'load' ? '증량' : (action === 'volume' ? '볼륨' : '유지');
  return {
    label: `${targetSets}세트 x ${repsLow}-${repsHigh}회 · RPE ${targetRpe}`,
    targetSets, repsLow, repsHigh, targetRpe,
    startKg, action, actionLabel, deltaKg, reason, lastDateKey,
    lastSet: bestSet ? { kg: Number(bestSet.kg) || 0, reps: Number(bestSet.reps) || 0, rpe: Number(bestSet.rpe) || null } : null,
    weakTarget: !!weakTarget,
    sets: Array.from({ length: targetSets }, () => ({ kg: startKg || 0, reps: targetReps, setType: 'main', done: false, rpe: null })),
  };
}

function detectMaxFixedMovements({
  cache = {},
  exList = [],
  movements = [],
  todayKey = null,
  majors = [],
  lookbackSessions = 4,
  minHits = 2,
} = {}) {
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (!majorSet.size) return [];
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const keys = Object.entries(cache || {})
    .filter(([key, day]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && (!todayKey || key < todayKey) && (day?.exercises || []).some(entry => {
      const ex = exById.get(entry.exerciseId);
      const mov = movById.get(entry.movementId || ex?.movementId);
      return mov && majorSet.has(mov.primary) && _workSetsOnly(entry.sets).length > 0;
    }))
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, lookbackSessions)
    .map(([key]) => key);
  const counts = new Map();
  for (const key of keys) {
    const seen = new Set();
    for (const entry of cache?.[key]?.exercises || []) {
      const ex = exById.get(entry.exerciseId);
      const mov = movById.get(entry.movementId || ex?.movementId);
      if (mov && majorSet.has(mov.primary) && _workSetsOnly(entry.sets).length > 0) seen.add(mov.id);
    }
    for (const movId of seen) counts.set(movId, (counts.get(movId) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minHits)
    .map(([movementId, count]) => ({ ...movById.get(movementId), movementId, count, lookback: keys.length }))
    .filter(x => x.id)
    .sort((a, b) => b.count - a.count || (a.nameKo || '').localeCompare(b.nameKo || ''));
}

function _renderFixedMovements(fixedMovements, takenIds, meta) {
  if (!Array.isArray(fixedMovements) || fixedMovements.length === 0) return '';
  const exList = getExList();
  const takenSet = new Set(takenIds || []);
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  const cards = fixedMovements.slice(0, 4).map(mov => {
    const exId = movToExId.get(mov.id) || null;
    const alreadyTaken = exId && takenSet.has(exId);
    const prescription = buildMaxPrescription({
      cache: getCache(),
      exList,
      movement: mov,
      exerciseId: exId,
      todayKey: _todayKey(),
      sessionType: meta.sessionType,
      weakTarget: false,
    });
    const catLabel = CAT_LABEL[mov.equipment_category] || mov.equipment_category || '종목';
    return `
      <div class="wt-max-fixed-card">
        <div>
          <div class="wt-max-fixed-name">${_esc(mov.nameKo || mov.id)}</div>
          <div class="wt-max-fixed-meta">최근 ${mov.lookback || 0}회 중 ${mov.count}회 수행 · ${_esc(catLabel)}</div>
          <div class="wt-max-fixed-prescription">${_esc(_prescriptionSummary(prescription))}</div>
        </div>
        ${alreadyTaken ? `
          <span class="wt-max-fixed-done">오늘 포함됨</span>
        ` : `
          <button type="button" class="wt-max-fixed-add" data-action="apply-max" data-movement-id="${_esc(mov.id)}">처방 추가</button>
        `}
      </div>
    `;
  }).join('');
  return `
    <div class="wt-max-section-label">고정 종목 진행전략</div>
    <div class="wt-max-fixed-list">${cards}</div>
  `;
}

function _renderMaxExerciseChips(exercises = [], { weakPart = null } = {}) {
  return (exercises || []).map(ex => {
    const star = ex.isPreferred ? '<span class="wt-max-chip-star">★</span>' : '';
    const catLabel = CAT_LABEL[ex.equipment_category] || ex.equipment_category || '종목';
    return `
      <button type="button" class="wt-max-chip${ex.isPreferred ? ' is-preferred' : ''}"
              data-action="apply-max"
              data-movement-id="${_esc(ex.movementId)}"
              ${weakPart ? `data-weak-part="${_esc(weakPart)}"` : ''}
              aria-label="${_esc(ex.nameKo)} 추가">
        ${star}
        <span class="wt-max-chip-name">${_esc(ex.nameKo)}</span>
        <span class="wt-max-chip-cat">${_esc(catLabel)}</span>
      </button>
    `;
  }).join('');
}

function _renderFixedCardsForMajor(fixedMovements, takenIds, meta) {
  if (!Array.isArray(fixedMovements) || fixedMovements.length === 0) return '';
  const exList = getExList();
  const takenSet = new Set(takenIds || []);
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  return fixedMovements.map(mov => {
    const exId = movToExId.get(mov.id) || null;
    const alreadyTaken = exId && takenSet.has(exId);
    const prescription = buildMaxPrescription({
      cache: getCache(),
      exList,
      movement: mov,
      exerciseId: exId,
      todayKey: _todayKey(),
      sessionType: meta.sessionType,
      weakTarget: false,
    });
    const catLabel = CAT_LABEL[mov.equipment_category] || mov.equipment_category || '종목';
    return `
      <div class="wt-max-fixed-card">
        <div>
          <div class="wt-max-fixed-name">${_esc(mov.nameKo || mov.id)}</div>
          <div class="wt-max-fixed-meta">최근 ${mov.lookback || 0}회 중 ${mov.count}회 수행 · ${_esc(catLabel)}</div>
          <div class="wt-max-fixed-prescription">${_esc(_prescriptionSummary(prescription))}</div>
        </div>
        ${alreadyTaken ? `
          <span class="wt-max-fixed-done">오늘 포함됨</span>
        ` : `
          <button type="button" class="wt-max-fixed-add" data-action="apply-max" data-movement-id="${_esc(mov.id)}">처방 추가</button>
        `}
      </div>
    `;
  }).join('');
}

function _addMajorBucket(buckets, major, item) {
  if (!major) return;
  if (!buckets.has(major)) buckets.set(major, []);
  buckets.get(major).push(item);
}

function _renderMajorRecommendationBoard({
  majors = [],
  starterGroups = [],
  fixedMovements = [],
  weakCoachGroups = [],
  balanceGroups = [],
  takenIds = [],
  meta = _ensureMaxMeta(),
} = {}) {
  const buckets = new Map();
  const majorOrder = [...new Set([...(majors || []), ...(meta.selectedMajors || [])])].filter(Boolean);

  const fixedByMajor = new Map();
  for (const mov of fixedMovements || []) {
    const major = mov.primary;
    if (!major) continue;
    if (!fixedByMajor.has(major)) fixedByMajor.set(major, []);
    fixedByMajor.get(major).push(mov);
  }
  for (const [major, fixed] of fixedByMajor.entries()) {
    _addMajorBucket(buckets, major, { type: 'fixed', title: '고정종목 전략', fixed });
  }
  for (const g of starterGroups || []) {
    const major = SUBPATTERN_TO_MAJOR[g.subPattern] || g.subPattern;
    _addMajorBucket(buckets, major, { type: 'starter', title: '오늘 스타터', group: g });
  }
  for (const g of weakCoachGroups || []) {
    const major = SUBPATTERN_TO_MAJOR[g.subPattern] || g.subPattern;
    _addMajorBucket(buckets, major, { type: 'weak', title: `약점 전담 · ${g.subPatternLabel}`, group: g });
  }
  for (const g of balanceGroups || []) {
    const major = SUBPATTERN_TO_MAJOR[g.subPattern] || g.subPattern;
    _addMajorBucket(buckets, major, { type: 'balance', title: `균형보강 · ${g.subPatternLabel}`, group: g });
  }

  const orderedMajors = [...new Set([...majorOrder, ...buckets.keys()])].filter(m => buckets.has(m));
  if (!orderedMajors.length) return '';

  return `
    <div class="wt-max-by-major">
      ${orderedMajors.map(major => `
        <section class="wt-max-major-section">
          <div class="wt-max-major-section-head">
            <span>${_esc(MAJOR_LABEL[major] || major)}</span>
            <small>${buckets.get(major).length}개 전략</small>
          </div>
          <div class="wt-max-source-list">
            ${buckets.get(major).map(item => `
              <div class="wt-max-source-card wt-max-source-card--${_esc(item.type)}">
                <div class="wt-max-source-title">${_esc(item.title)}</div>
                ${item.type === 'fixed'
                  ? `<div class="wt-max-fixed-list">${_renderFixedCardsForMajor(item.fixed, takenIds, meta)}</div>`
                  : `<div class="wt-max-chips">${_renderMaxExerciseChips(item.group.exercises, { weakPart: item.type === 'weak' ? item.group.subPattern : null })}</div>`}
              </div>
            `).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;
}

function _detectMajorsLoose(day, exList, movements) {
  const out = new Set();
  const exById  = new Map((exList || []).map(e => [e.id, e]));
  const movById = new Map((movements || []).map(m => [m.id, m]));
  const entries = (day?.exercises) || (S?.workout?.exercises) || [];
  for (const entry of entries) {
    const ex = exById.get(entry.exerciseId);
    let major = null;
    const muscleIds = (ex && Array.isArray(ex.muscleIds) && ex.muscleIds.length)
      ? ex.muscleIds
      : (Array.isArray(entry?.muscleIds) ? entry.muscleIds : []);
    if (muscleIds.length > 0) {
      const sp = muscleIds[0];
      major = SUBPATTERN_TO_MAJOR[sp] || sp;
    }
    if (!major) {
      const movId = ex?.movementId || entry?.movementId || null;
      if (movId) {
        const mov = movById.get(movId);
        if (mov?.primary) major = mov.primary;
        else if (mov?.subPattern) major = SUBPATTERN_TO_MAJOR[mov.subPattern] || null;
      }
    }
    if (!major) {
      const leg = ex?.muscleId || entry?.muscleId;
      if (leg) major = SUBPATTERN_TO_MAJOR[leg] || leg;
    }
    if (major) out.add(major);
  }
  return out;
}

// ── 메인: 맥스 모드 카드 렌더 ─────────────────────────────────────
// renderExpertTopArea 에서 mode==='max' && _expertViewShown 분기 시 호출.
// host element를 받아 innerHTML 을 구성. 세그먼트 + 카드를 한 번에 채움.
export function renderMaxCard(host) {
  if (!host) return;

  const segHtml = `
    <div class="wt-mode-seg" role="tablist" aria-label="운동 모드">
      <button type="button" class="wt-mode-seg-btn" role="tab" aria-selected="false" onclick="wtExcSwitchToNormalView()">일반 모드</button>
      <button type="button" class="wt-mode-seg-btn" role="tab" aria-selected="false" onclick="wtExcShowProView()">프로 모드</button>
      <button type="button" class="wt-mode-seg-btn is-on" role="tab" aria-selected="true">테스트 모드</button>
    </div>
  `;
  const setupHtml = _renderMaxSetup();

  // 1) 오늘 세션의 majors 자동 감지 — Max는 looser 감지(빈 세트도 인정)
  const todayKey = _todayKey();
  const cache = getCache();
  const exList = getExList();
  const meta = _ensureMaxMeta();
  const selectedMajors = Array.isArray(meta.selectedMajors)
    ? meta.selectedMajors.map(_normalizeMaxMajor).filter(Boolean)
    : [];
  const day = cache[todayKey] || { exercises: S?.workout?.exercises || [] };
  const detectedMajors = _detectMajorsLoose(day, exList, MOVEMENTS);
  const majors = selectedMajors.length ? new Set(selectedMajors) : detectedMajors;
  const weakPartsForToday = _filterWeakPartsByMajors(meta.selectedWeakParts, [...majors]);
  const comparisonCache = cache[todayKey] ? cache : { ...cache, [todayKey]: day };

  // empty: 종목 자체가 없음 (looser도 비어있음)
  if (majors.size === 0) {
    host.innerHTML = `
      ${segHtml}
      ${setupHtml}
      <div class="wt-exc wt-max-card" id="wt-max-card">
        <div class="wt-exc-head">
          <div class="wt-exc-title">🎯 오늘의 보강 추천</div>
          <div class="wt-exc-meta">테스트 모드</div>
        </div>
        <div class="wt-max-body wt-max-empty">
          <div class="wt-max-empty-icon">🏋️</div>
          <div class="wt-max-empty-title">오늘 부위를 먼저 골라주세요</div>
          <div class="wt-max-empty-sub">아래에서 헬스 종목을 추가하면 같은 부위 직전 기록을 분석해 보강 종목을 제안해요.</div>
        </div>
      </div>
    `;
    _bindMaxHost(host);
    _ensureWeakTimerTick();
    return;
  }

  // 2) 비교 빌드
  const comparison = buildMuscleComparison(comparisonCache, exList, MOVEMENTS, todayKey, majors, 2);

  // empty: 같은 부위 이력 없음
  if (!comparison.previous?.length) {
    const takenIds = (S?.workout?.exercises || []).map(e => e.exerciseId).filter(Boolean);
    const starterGroups = _suggestMajorStarters([...majors], takenIds);
    const starterHtml = _renderMajorRecommendationBoard({
      majors: [...majors],
      starterGroups,
      takenIds,
      meta,
    });
    host.innerHTML = `
      ${segHtml}
      ${setupHtml}
      <div class="wt-exc wt-max-card" id="wt-max-card">
        <div class="wt-exc-head">
          <div class="wt-exc-title">🎯 오늘의 보강 추천</div>
          <div class="wt-exc-meta">테스트 모드</div>
        </div>
        <div class="wt-max-body ${starterHtml ? '' : 'wt-max-empty'}">
          ${starterHtml || `
            <div class="wt-max-empty-icon">📭</div>
            <div class="wt-max-empty-title">최근 같은 부위 운동 기록이 없어요</div>
            <div class="wt-max-empty-sub">오늘 큰 부위를 고르면 바로 시작할 메인 종목 후보를 띄워줄게요.</div>
          `}
        </div>
      </div>
    `;
    _bindMaxHost(host);
    _ensureWeakTimerTick();
    return;
  }

  // empty: 균형 잡혀있음
  if (!comparison.imbalance) {
    const takenIds = (S?.workout?.exercises || []).map(e => e.exerciseId).filter(Boolean);
    const weakCoachGroups = _suggestWeakTargetBoosts(weakPartsForToday, takenIds);
    const starterGroups = _suggestMajorStarters([...majors], takenIds);
    const fixedMovements = detectMaxFixedMovements({
      cache: comparisonCache,
      exList,
      movements: MOVEMENTS,
      todayKey,
      majors,
      lookbackSessions: 4,
      minHits: 2,
    });
    const majorBoardHtml = _renderMajorRecommendationBoard({
      majors: [...majors],
      starterGroups,
      fixedMovements,
      weakCoachGroups,
      takenIds,
      meta,
    });
    host.innerHTML = `
      ${segHtml}
      ${setupHtml}
      <div class="wt-exc wt-max-card" id="wt-max-card">
        <div class="wt-exc-head">
          <div class="wt-exc-title">🎯 오늘의 보강 추천</div>
          <div class="wt-exc-meta">테스트 모드</div>
        </div>
        <div class="wt-max-body ${majorBoardHtml ? '' : 'wt-max-empty'}">
          ${majorBoardHtml || `
            <div class="wt-max-empty-icon">✨</div>
            <div class="wt-max-empty-title">최근 같은 부위 균형이 잘 잡혀있어요</div>
            <div class="wt-max-empty-sub">평소대로 진행하세요. 약점 부위가 생기면 자동으로 추천이 떠요.</div>
          `}
        </div>
      </div>
    `;
    _bindMaxHost(host);
    _ensureWeakTimerTick();
    return;
  }

  // 3) 정상 경로: suggestMaxBoosts 호출
  const takenIds = (S?.workout?.exercises || []).map(e => e.exerciseId).filter(Boolean);
  const weakCoachGroups = _suggestWeakTargetBoosts(weakPartsForToday, takenIds);
  const groups = suggestMaxBoosts({
    comparison,
    exList,
    movements: MOVEMENTS,
    preferredCategories: MAX_PREFERRED_CATEGORIES,
    takenExerciseIds: takenIds,
    limit: 4,
  });
  const fixedMovements = detectMaxFixedMovements({
    cache: comparisonCache,
    exList,
    movements: MOVEMENTS,
    todayKey,
    majors,
    lookbackSessions: 4,
    minHits: 2,
  });
  const majorBoardHtml = _renderMajorRecommendationBoard({
    majors: [...majors],
    fixedMovements,
    weakCoachGroups,
    balanceGroups: groups,
    takenIds,
    meta,
  });

  // suggestMaxBoosts가 빈 결과면 (이론상 imbalance 있을 때 거의 없지만 방어) — 균형 메시지로 fallback
  if (groups.length === 0) {
    host.innerHTML = `
      ${segHtml}
      ${setupHtml}
      <div class="wt-exc wt-max-card" id="wt-max-card">
        <div class="wt-exc-head">
          <div class="wt-exc-title">🎯 오늘의 보강 추천</div>
          <div class="wt-exc-meta">테스트 모드</div>
        </div>
        <div class="wt-max-body ${majorBoardHtml ? '' : 'wt-max-empty'}">
          ${majorBoardHtml || `
            <div class="wt-max-empty-icon">✨</div>
            <div class="wt-max-empty-title">현재 보강할 부위가 없어요</div>
            <div class="wt-max-empty-sub">약점 부위를 선택하면 전담 코치 추천이 별도로 떠요.</div>
          `}
        </div>
      </div>
    `;
    _bindMaxHost(host);
    _ensureWeakTimerTick();
    return;
  }

  // 4) 부위 컨텍스트 라인
  const muscleNameMap = Object.fromEntries(getMuscleParts().map(m => [m.id, m.name]));
  const majorLabel = comparison.majors.map(m => muscleNameMap[m] || m).join(', ');
  const prevDates = comparison.previous.map(p => _formatShortDate(p.dateKey)).join(' · ');

  host.innerHTML = `
    ${segHtml}
    ${setupHtml}
    <div class="wt-exc wt-max-card" id="wt-max-card">
      <div class="wt-exc-head">
        <div class="wt-exc-title">🎯 오늘의 보강 추천</div>
        <div class="wt-exc-meta">테스트 모드</div>
      </div>
      <div class="wt-max-body">
        <div class="wt-max-context">
          <span class="wt-max-context-major">${_esc(majorLabel)}</span>
          <span class="wt-max-context-sep">·</span>
          <span class="wt-max-context-prev">최근 ${_esc(prevDates)}</span>
        </div>
        ${majorBoardHtml}
        <div class="wt-max-foot">★ 바벨/덤벨 우선 — 강제는 아니에요. 1세트라도 보강해보세요.</div>
      </div>
    </div>
  `;

  _bindMaxHost(host);
  _ensureWeakTimerTick();
}

function _bindMaxHost(host) {
  if (!host) return;
  // 칩 onclick 이벤트 위임 (innerHTML 갱신 후에도 살아있도록 host 단위로 1회만 바인딩)
  if (!host.dataset.maxBound) {
    host.dataset.maxBound = '1';
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="apply-max"]');
      if (btn) {
        const movId = btn.getAttribute('data-movement-id');
        const weakPart = btn.getAttribute('data-weak-part') || null;
        if (movId) applyMaxSuggestion(movId, weakPart).catch(err => console.warn('[applyMaxSuggestion]:', err));
        return;
      }
      const weakBtn = e.target.closest('[data-action="toggle-weak-part"]');
      if (weakBtn) {
        toggleMaxWeakPart(weakBtn.getAttribute('data-weak-part'));
        return;
      }
      const typeBtn = e.target.closest('[data-action="set-session-type"]');
      if (typeBtn) {
        setMaxSessionType(typeBtn.getAttribute('data-session-type'));
        return;
      }
      const majorBtn = e.target.closest('[data-action="set-major-part"]');
      if (majorBtn) {
        setMaxMajorPart(majorBtn.getAttribute('data-major-part'));
        return;
      }
      if (e.target.closest('[data-action="toggle-weak-timer"]')) {
        toggleMaxWeakBlockTimer();
      }
    });
  }
}

function _formatShortDate(key) {
  // YYYY-MM-DD → M/D
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${parseInt(m[1],10)}/${parseInt(m[2],10)}`;
}

// ── 추천 칩 클릭 → 오늘 세션에 종목 추가 ────────────────────────
export async function applyMaxSuggestion(movementId, weakPart = null) {
  const mov = MOVEMENTS.find(m => m.id === movementId);
  if (!mov) {
    console.warn('[applyMaxSuggestion] unknown movementId:', movementId);
    _toast('동작을 찾을 수 없어요', 'error');
    return;
  }

  // 이미 오늘 세션에 같은 movementId가 있으면 토스트만 띄우고 종료
  const existing = (S?.workout?.exercises || []).find(e => {
    const ex = getExList().find(x => x.id === e.exerciseId);
    return ex?.movementId === movementId;
  });
  if (existing) {
    _toast('이미 오늘 세션에 있는 종목이에요', 'info');
    return;
  }

  // exList에 매칭되는 ex 있으면 재사용, 없으면 새로 등록 (gymId=null — 맥스는 체육관 비의존)
  let exId = null;
  const matched = getExList().find(e => e.movementId === movementId);
  if (matched) {
    exId = matched.id;
  } else {
    try {
      const { _generateId } = await import('../../data/data-core.js');
      exId = _generateId();
      await saveExercise({
        id: exId,
        muscleId: mov.primary,
        name: mov.nameKo,
        movementId: mov.id,
        brand: '', machineType: '',
        maxWeightKg: null,
        incrementKg: mov.stepKg || 2.5,
        weightUnit: 'kg',
        gymId: null,           // 맥스 — 체육관 비의존
        notes: '',
      });
    } catch (e) {
      console.warn('[applyMaxSuggestion.saveExercise]:', e);
      _toast('종목 등록 실패', 'error');
      return;
    }
  }

  // S.workout.exercises 에 추가
  if (!S.workout) S.workout = { exercises: [] };
  if (!Array.isArray(S.workout.exercises)) S.workout.exercises = [];
  const meta = _ensureMaxMeta();
  const prescription = buildMaxPrescription({
    cache: getCache(),
    exList: getExList(),
    movement: mov,
    exerciseId: exId,
    todayKey: _todayKey(),
    sessionType: meta.sessionType,
    weakTarget: !!weakPart,
  });
  S.workout.exercises.push({
    exerciseId: exId,
    muscleId: mov.primary,
    name: mov.nameKo,
    movementId: mov.id,
    maxWeakPart: weakPart || null,
    maxPrescription: _storedPrescription(prescription),
    sets: prescription?.sets || [],
  });

  // 저장 + 헬스 종목 리스트 갱신 + 카드 재렌더
  // 실패 시 rollback — in-memory와 Firestore 불일치 방지 (data-guardian 권장).
  try {
    const { saveWorkoutDay } = await import('../save.js');
    await saveWorkoutDay();
  } catch (e) {
    console.warn('[applyMaxSuggestion.save]:', e);
    // push한 항목 제거 (마지막 요소가 우리가 추가한 것이라고 가정)
    const last = S.workout.exercises[S.workout.exercises.length - 1];
    if (last && last.exerciseId === exId && last.movementId === mov.id) {
      S.workout.exercises.pop();
    }
    _toast('저장 실패 — 다시 시도해주세요', 'error');
    return;
  }
  try {
    const { _renderExerciseList } = await import('../exercises.js');
    _renderExerciseList();
  } catch (e) { console.warn('[applyMaxSuggestion.renderList]:', e); }

  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
  _toast(`${mov.nameKo} 추가 — ${weakPart ? '약점 블록' : '보강'} 시작!`, 'success');
}

export function toggleMaxWeakPart(partId) {
  if (!partId) return;
  const meta = _ensureMaxMeta();
  const set = new Set(meta.selectedWeakParts);
  if (set.has(partId)) set.delete(partId);
  else set.add(partId);
  meta.selectedWeakParts = [...set];
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export function setMaxSessionType(type) {
  const meta = _ensureMaxMeta();
  meta.sessionType = type === 'heavy_volume' ? 'heavy_volume' : 'high_volume';
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export function setMaxMajorPart(partId) {
  if (!partId || !MAJOR_LABEL[partId]) return;
  const meta = _ensureMaxMeta();
  const set = new Set(Array.isArray(meta.selectedMajors) ? meta.selectedMajors : []);
  if (set.has(partId)) set.delete(partId);
  else set.add(partId);
  meta.selectedMajors = [...set];
  if (meta.selectedMajors.length) {
    meta.selectedWeakParts = _filterWeakPartsByMajors(meta.selectedWeakParts, meta.selectedMajors);
  }
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export function toggleMaxWeakBlockTimer() {
  const meta = _ensureMaxMeta();
  if (meta.weakBlock.activeStartedAt) {
    const add = Math.max(0, Math.floor((Date.now() - meta.weakBlock.activeStartedAt) / 1000));
    meta.weakBlock.durationSec = Math.max(0, Math.floor(Number(meta.weakBlock.durationSec) || 0)) + add;
    meta.weakBlock.activeStartedAt = null;
    _toast(`약점 블록 ${_fmtWeakTime(meta.weakBlock.durationSec)} 기록`, 'success');
  } else {
    if (!meta.selectedWeakParts.length) {
      _toast('약점 부위를 먼저 선택하세요', 'warning');
      return;
    }
    meta.weakBlock.activeStartedAt = Date.now();
    _toast('약점 블록 타이머 시작', 'success');
  }
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

function _saveMaxMetaSoon() {
  import('../save.js')
    .then(m => m.saveWorkoutDay?.())
    .catch(e => console.warn('[maxMeta.save]:', e));
}

// ── 미니 위자드 (3-scene) ───────────────────────────────────────
// 모달 컨테이너: #max-onboarding-modal
// 내부 state: _maxObState
const _maxObState = {
  step: 1,
};

function _resetMaxOb() {
  _maxObState.step = 1;
}

export async function openMaxMiniOnboarding() {
  _resetMaxOb();
  let el = document.getElementById('max-onboarding-modal');
  // modal-manager가 늦게 로드되거나 새 모달 항목이 캐시 미스인 경우 — 직접 lazy 로드 시도
  if (!el) {
    try {
      const m = await import('../../modals/max-onboarding-modal.js');
      const container = document.getElementById('modals-container');
      if (container && m.MODAL_HTML) {
        const tmp = document.createElement('div');
        tmp.innerHTML = m.MODAL_HTML;
        while (tmp.firstElementChild) container.appendChild(tmp.firstElementChild);
        el = document.getElementById('max-onboarding-modal');
      }
    } catch (err) {
      console.warn('[openMaxMiniOnboarding] lazy load fail:', err);
    }
  }
  // 모달이 (정상 경로 modal-manager 주입이든, lazy fallback 주입이든) DOM에 있다면
  // 매번 _initMaxOnboardingEvents 를 호출 — dataset.bound 가드로 멱등하므로 중복 안전.
  // 핵심: expert.js 모듈 초기 setTimeout 시점엔 modal DOM 이 없어서 바인딩이 누락됨.
  //   → 모달 표시 직전에 바인딩하면 이벤트 핸들러가 항상 살아있음.
  if (el) _initMaxOnboardingEvents();
  if (!el) {
    console.warn('[max-onboarding] modal element 없음 → 디폴트값으로 즉시 활성화 fallback');
    // 모달 없으면 디폴트값으로 즉시 활성화 fallback (목표는 'hypertrophy'로 default)
    try {
      await saveExpertPreset({
        mode: 'max', enabled: true,
        ...MAX_DEFAULTS,
        currentGymId: null,
      });
      // 카드 노출 토글
      try {
        const { setExpertViewShown } = await import('../expert.js');
        setExpertViewShown(true);
      } catch {}
      if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
      _toast('테스트 모드 켜짐', 'success');
    } catch (err) {
      console.warn('[max-onboarding fallback save]:', err);
      _toast('테스트 모드 켜기 실패', 'error');
    }
    return;
  }
  // .modal-overlay 는 .open 으로 display:flex 노출 (style.css:399). .active 가 아님!
  el.classList.add('open');
  _renderMaxOb();
}

export function closeMaxMiniOnboarding() {
  const el = document.getElementById('max-onboarding-modal');
  if (el) el.classList.remove('open');
}

function _renderMaxOb() {
  const body = document.getElementById('max-ob-body');
  if (!body) return;
  body.innerHTML = _renderMaxObStep1();
}

function _renderMaxObStep1() {
  return `
    <div class="wt-max-ob-step">
      <div class="wt-max-ob-title">테스트 모드 기준으로 시작합니다</div>
      <div class="wt-max-ob-sub">주 5-6회 · 한 세션 90분 · RPE 8-9 · 근비대/수행능력 전제입니다.</div>
      <div class="wt-max-ob-opts">
        <div class="wt-max-ob-opt is-on">
          <div class="wt-max-ob-opt-label">목표와 빈도는 묻지 않음</div>
          <div class="wt-max-ob-opt-sub">대신 오늘 세션 타입과 약점 부위를 운동 화면에서 매일 조정합니다.</div>
        </div>
        <div class="wt-max-ob-opt is-on">
          <div class="wt-max-ob-opt-label">약점 블록 타이머 사용</div>
          <div class="wt-max-ob-opt-sub">선택한 세부 약점 부위의 시간/세트/볼륨을 캘린더에 별도 집계합니다.</div>
        </div>
      </div>
      <div class="wt-max-ob-foot">
        <button type="button" class="wt-max-ob-skip" onclick="closeMaxMiniOnboarding()">닫기</button>
        <button type="button" class="wt-max-ob-next" data-finish>테스트 모드 켜기 ✓</button>
      </div>
    </div>
  `;
}

// 모달 이벤트 위임 — modal-manager가 DOM 주입 후 한 번만 바인딩
export function _initMaxOnboardingEvents() {
  const root = document.getElementById('max-onboarding-modal');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  root.addEventListener('click', async (e) => {
    const target = e.target;

    // 닫기 (배경/X)
    if (target.matches('.wt-max-ob-back-overlay') || target.matches('[data-close-max-ob]')) {
      closeMaxMiniOnboarding();
      return;
    }

    if (target.closest('[data-finish]')) {
      try {
        await saveExpertPreset({
          mode: 'max',
          enabled: true,
          ...MAX_DEFAULTS,
          currentGymId: null,           // 맥스 — gym 비의존
          snoozedUntil: null,
        });
        closeMaxMiniOnboarding();
        // 카드 노출 토글 — 위자드 직후 곧바로 추천 카드가 보이도록
        try {
          const { setExpertViewShown } = await import('../expert.js');
          setExpertViewShown(true);
        } catch {}
        if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
        if (typeof window.renderAll === 'function') window.renderAll();
        _toast('테스트 모드 켜짐 — 직전 같은 부위 운동 분석 시작!', 'success');
      } catch (err) {
        console.warn('[max-ob.finish]:', err);
        _toast('저장 실패', 'error');
      }
    }
  });
}
