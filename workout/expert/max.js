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
  getGyms, saveGym,
} from '../../data.js';
import { S } from '../state.js';
import {
  createDefaultMaxCycle,
  renderMaxCycleDashboard,
  buildRenderedMaxCycleSnapshot,
  renderMaxCycleBoard,
  renderMaxPlanEditor,
  normalizeMaxCycleTracks,
} from './max-cycle.js';

function _esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _toast(msg, type='info') {
  if (typeof window.showToast === 'function') window.showToast(msg, 2200, type);
}

function _getMaxCycleSafe() {
  const cycle = getExpertPreset()?.maxCycle || null;
  return normalizeMaxCycleTracks(cycle);
}

async function _saveMaxCycleSafe(cycle) {
  let savedToSettings = false;
  try {
    const data = await import('../../data.js');
    if (typeof data.saveMaxCycle === 'function') {
      await data.saveMaxCycle(cycle);
      savedToSettings = true;
    }
  } catch (err) {
    console.warn('[saveMaxCycle.dynamic]:', err);
  }
  await saveExpertPreset({ maxCycle: cycle });
  return savedToSettings;
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

const MAX_FRAMEWORKS = {
  dual_track_progression_v2: {
    label: '6주 듀얼 트랙',
    short: '6주',
    copy: '부위별 벤치마크를 볼륨/강도 트랙으로 나눠 6주 뒤 목표 중량까지 선형 진행합니다.',
  },
  adaptive_volume: {
    label: 'Adaptive Volume',
    short: 'Adaptive',
    copy: '최근 기록과 이번 주 세트 간극으로 오늘 처방을 조정합니다.',
  },
  rp_lite: {
    label: 'RP Lite',
    short: 'RP',
    copy: '부위별 세트 목표를 MEV에서 MAV 쪽으로 천천히 올립니다.',
  },
  wendler531: {
    label: '5/3/1',
    short: '5/3/1',
    copy: '메인 리프트는 Training Max 기준 주차별 강도로 진행합니다.',
  },
  hybrid: {
    label: 'Hybrid',
    short: 'Hybrid',
    copy: '메인 리프트는 5/3/1, 보조 종목은 볼륨 간극으로 추천합니다.',
  },
};

const MAX_MAIN_LIFTS = {
  barbell_bench: 'bench',
  back_squat: 'squat',
  deadlift: 'deadlift',
  ohp: 'ohp',
};

const MAX_DEFAULT_TARGET_SETS = {
  chest: 12,
  back: 14,
  lower: 12,
  shoulder: 10,
  glute: 8,
  bicep: 8,
  tricep: 8,
  abs: 8,
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
      rejectedRecommendations: [],
      weakBlock: { durationSec: 0, activeStartedAt: null },
      weakSummary: { sets: 0, volume: 0, byPart: {} },
    };
  }
  if (!Array.isArray(S.workout.maxMeta.selectedMajors)) S.workout.maxMeta.selectedMajors = [];
  if (!Array.isArray(S.workout.maxMeta.selectedWeakParts)) S.workout.maxMeta.selectedWeakParts = [];
  if (!Array.isArray(S.workout.maxMeta.rejectedRecommendations)) S.workout.maxMeta.rejectedRecommendations = [];
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

function _splitWeakPartsByMajors(parts = [], majors = []) {
  const unique = [...new Set((parts || []).filter(Boolean))];
  const majorSet = new Set((majors || []).map(_normalizeMaxMajor).filter(Boolean));
  if (!majorSet.size) return { inScope: unique, outOfScope: [] };
  const inScope = [];
  const outOfScope = [];
  for (const part of unique) {
    const major = _normalizeMaxMajor(part);
    if (major && majorSet.has(major)) inScope.push(part);
    else outOfScope.push(part);
  }
  return { inScope, outOfScope };
}

function _maxRecommendationLabel(kind) {
  return ({
    main_progression: '주력 진행',
    volume_gap: '볼륨 채우기',
    balance_gap: '균형 보강',
    habit_keep: '루틴 유지',
    starter: '시작 추천',
    weak_focus: '약점 전담',
  })[kind] || '추천';
}

function _movementMajor(movement) {
  if (!movement) return null;
  return _normalizeMaxMajor(movement.primary || movement.subPattern);
}

function _movementSubPattern(movement) {
  return movement?.subPattern || movement?.primary || null;
}

function _buildRecommendationId(kind, movementId, subPattern = '') {
  return ['max', kind, movementId || 'unknown', subPattern || ''].filter(Boolean).join(':');
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

function _todayDateInputValue() {
  return _todayKey();
}

function _defaultMaxPlan(todayKey = _todayKey()) {
  return {
    version: 1,
    framework: 'dual_track_progression_v2',
    startDate: _weekStartKey(todayKey),
    weeks: 6,
    sessionsPerWeek: 5,
    deloadWeek: 6,
    targetSetsByMajor: { ...MAX_DEFAULT_TARGET_SETS },
    lifts: {
      bench: { tm: 0 },
      squat: { tm: 0 },
      deadlift: { tm: 0 },
      ohp: { tm: 0 },
    },
    updatedAt: Date.now(),
  };
}

function _getMaxPlan(todayKey = _todayKey()) {
  const raw = getExpertPreset()?.maxPlan;
  const base = _defaultMaxPlan(todayKey);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    targetSetsByMajor: { ...base.targetSetsByMajor, ...(raw.targetSetsByMajor || {}) },
    lifts: { ...base.lifts, ...(raw.lifts || {}) },
  };
}

function _frameworkMeta(framework) {
  return MAX_FRAMEWORKS[framework] || MAX_FRAMEWORKS.adaptive_volume;
}

function _renderMaxSetup() {
  const meta = _ensureMaxMeta();
  const selectedMajors = new Set(meta.selectedMajors);
  const selected = new Set(meta.selectedWeakParts);
  const isActive = !!meta.weakBlock.activeStartedAt;
  const sessionType = meta.sessionType === 'heavy_volume' ? 'heavy_volume' : 'high_volume';
  const weakOptions = _filterWeakPartsByMajors(WEAK_PARTS.map(p => p.id), [...selectedMajors]);
  const weakOptionSet = new Set(weakOptions);
  const selectedOutOfScope = _splitWeakPartsByMajors(meta.selectedWeakParts, [...selectedMajors]).outOfScope;
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
        ${selectedOutOfScope.length ? `
          <div class="wt-max-outscope-note">
            선택 밖 약점 ${selectedOutOfScope.map(p => _esc(WEAK_LABEL[p] || p)).join(', ')}은 오늘 큰 부위 추천 아래 보조 섹션으로 분리돼요.
          </div>
        ` : ''}
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
    transparency: prescription.transparency || null,
    evidence: prescription.evidence || [],
    lastDateKey: prescription.lastDateKey,
    lastSet: prescription.lastSet,
    weakTarget: prescription.weakTarget,
  };
}

function _todayOverrideKg(cycle, benchmark, track, todayKey) {
  const override = cycle?.todayOverrides?.[todayKey]?.[`${benchmark?.id}:${track}`]
    || cycle?.todayOverrides?.[todayKey]?.[benchmark?.id];
  const kg = Number(override?.kg);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

function _benchmarkPrescription(prescription, movement, { weakTarget = false } = {}) {
  const cycle = _getMaxCycleSafe();
  if (!cycle?.benchmarks?.length || !movement?.id) return null;
  const todayKey = _todayKey();
  const snapshot = buildRenderedMaxCycleSnapshot({
    cycle,
    cache: getCache(),
    exList: getExList(),
    todayKey,
  });
  const benchmark = snapshot?.benchmarks?.find(b => b.movementId === movement.id);
  if (!benchmark) return null;
  const track = snapshot.track === 'H' ? 'H' : 'M';
  const planned = benchmark.plannedByTrack?.[track] || benchmark.planned;
  const trackSpec = benchmark.tracks?.[track] || {};
  const kg = _todayOverrideKg(cycle, benchmark, track, todayKey) || Number(planned?.plannedKg) || Number(prescription?.startKg) || 0;
  const repsA = Number(trackSpec.startReps) || Number(planned?.startReps) || (track === 'H' ? 8 : 12);
  const repsB = Number(trackSpec.targetReps) || Number(planned?.targetReps) || (track === 'H' ? 6 : 12);
  const repsLow = Math.min(repsA, repsB);
  const repsHigh = Math.max(repsA, repsB);
  const targetReps = Number(trackSpec.targetReps) || repsB || repsHigh;
  const targetSets = Number(prescription?.targetSets) || (weakTarget ? 5 : 4);
  const trackLabel = track === 'H' ? '강도' : '볼륨';
  const latest = benchmark.latest ? `${benchmark.latest.kg}kg x ${benchmark.latest.reps}회` : '실측 없음';
  return {
    ...prescription,
    label: `W${snapshot.weekIndex} ${trackLabel} · ${targetSets}세트 x ${repsLow}-${repsHigh}회`,
    targetSets,
    repsLow,
    repsHigh,
    targetRpe: track === 'H' ? 9 : 8,
    startKg: kg,
    action: track === 'H' ? 'load' : 'volume',
    actionLabel: trackLabel,
    deltaKg: benchmark.delta,
    reason: `6주 성장판의 ${benchmark.label} ${trackLabel} 트랙 계획값을 우선 적용했습니다.`,
    transparency: {
      type: 'benchmark_cycle',
      label: '벤치마크 기준',
      detail: `오늘 계획 ${kg}kg · 목표 ${planned?.targetKg || benchmark.targetKg}kg · 현재 ${latest}`,
    },
    evidence: [
      ...(prescription?.evidence || []),
      { label: '성장판', value: `W${snapshot.weekIndex}/${snapshot.weeks} · ${trackLabel} 트랙` },
      { label: '계획 중량', value: `${kg}kg` },
      { label: '최근 실측', value: latest },
    ],
    benchmarkId: benchmark.id,
    benchmarkTrack: track,
    sets: Array.from({ length: targetSets }, () => ({ kg: kg || 0, reps: targetReps, setType: 'main', done: false, rpe: track === 'H' ? 9 : 8 })),
  };
}

function _applyPrescriptionOverride(prescription, override = null) {
  if (!prescription || !override) return prescription;
  const targetSets = Math.max(1, Math.min(10, Number(override.targetSets) || Number(prescription.targetSets) || 4));
  const kg = Math.max(0, Number(override.startKg) || 0);
  const reps = Math.max(1, Math.min(50, Number(override.reps) || Number(prescription.repsHigh) || 10));
  const rpe = override.targetRpe === '' || override.targetRpe == null ? null : Math.max(1, Math.min(10, Number(override.targetRpe) || Number(prescription.targetRpe) || 8));
  return {
    ...prescription,
    label: `조정 · ${targetSets}세트 x ${reps}회${rpe ? ` · RPE ${rpe}` : ''}`,
    targetSets,
    repsLow: reps,
    repsHigh: reps,
    targetRpe: rpe,
    startKg: kg,
    action: 'custom',
    actionLabel: '조정',
    reason: '추천 처방을 사용자가 직접 조정해 추가했습니다.',
    transparency: {
      type: 'user_adjusted',
      label: '사용자 조정',
      detail: `추가 전 ${kg}kg x ${reps}회 x ${targetSets}세트로 수정했습니다.`,
    },
    evidence: [
      ...(prescription.evidence || []),
      { label: '조정값', value: `${kg}kg x ${reps}회 x ${targetSets}세트${rpe ? ` · RPE ${rpe}` : ''}` },
    ],
    sets: Array.from({ length: targetSets }, () => ({ kg, reps, setType: 'main', done: false, rpe })),
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
  let transparency = null;
  const evidence = [];
  if (bestSet) {
    const bestE1rm = _epley(bestSet.kg, bestSet.reps);
    evidence.push({ label: '최근 기준 세트', value: `${lastDateKey?.slice(5).replace('-', '/') || '최근'} · ${Number(bestSet.kg) || 0}kg x ${Number(bestSet.reps) || 0}회` });
    evidence.push({ label: 'e1RM 환산', value: `${Math.round(bestE1rm * 10) / 10}kg x ${Math.round(pct * 100)}%` });
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
    if (startKg > 0 && (Number(bestSet.kg) || 0) > 0 && startKg < Number(bestSet.kg)) {
      transparency = {
        type: 'rep_rpe_conversion',
        label: `지난 ${Number(bestSet.kg)}kg보다 낮아 보이는 이유`,
        detail: `${targetReps}회·RPE ${targetRpe} 목표로 e1RM을 환산해 시작 무게를 낮췄어요.`,
      };
    } else if (deltaKg > 0) {
      transparency = {
        type: 'session_jump_limit',
        label: `오늘 증량폭 +${deltaKg}kg`,
        detail: '한 세션에서 무게를 크게 뛰우지 않고 반복 품질을 우선합니다.',
      };
    }
  } else {
    evidence.push({ label: '기록 상태', value: '최근 수행 기록 부족' });
  }
  const actionLabel = action === 'load' ? '증량' : (action === 'volume' ? '볼륨' : '유지');
  return {
    label: `${targetSets}세트 x ${repsLow}-${repsHigh}회 · RPE ${targetRpe}`,
    targetSets, repsLow, repsHigh, targetRpe,
    startKg, action, actionLabel, deltaKg, reason, transparency, evidence, lastDateKey,
    lastSet: bestSet ? { kg: Number(bestSet.kg) || 0, reps: Number(bestSet.reps) || 0, rpe: Number(bestSet.rpe) || null } : null,
    weakTarget: !!weakTarget,
    sets: Array.from({ length: targetSets }, () => ({ kg: startKg || 0, reps: targetReps, setType: 'main', done: false, rpe: targetRpe })),
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

function _recommendationReason({ kind, movement, prescription, group, fixedCount = 0, fixedLookback = 0 } = {}) {
  const major = MAJOR_LABEL[_movementMajor(movement)] || _movementMajor(movement) || '선택 부위';
  const plan = _getMaxPlan();
  const framework = _frameworkMeta(plan.framework);
  if (kind === 'habit_keep') {
    return {
      headline: `최근 ${fixedLookback || 0}회 중 ${fixedCount || 0}회 수행한 ${major} 루틴`,
      rule: `${framework.label}: 자주 수행한 종목은 점진 과부하 기준으로 유지합니다.`,
    };
  }
  if (kind === 'weak_focus') {
    return {
      headline: `${group?.subPatternLabel || '선택 약점'}을 오늘 끝까지 챙기는 전담 추천`,
      rule: `${framework.label}: 사용자가 직접 고른 약점은 자동 균형 추천과 분리해 표시합니다.`,
    };
  }
  if (kind === 'balance_gap') {
    return {
      headline: `${group?.subPatternLabel || '세부 부위'} 비중이 최근 같은 부위보다 낮아요`,
      rule: `${framework.label}: 최근 같은 큰 부위 세션과 비교해 덜 채운 세부 패턴을 보완합니다.`,
    };
  }
  return {
    headline: `${major} 선택에 맞춘 시작 종목`,
    rule: `${framework.label}: 오늘 큰 부위 선택을 최상위 기준으로 후보를 제한했습니다.`,
  };
}

function _renderRecommendationCard({
  kind = 'starter',
  movement = null,
  group = null,
  prescription = null,
  alreadyTaken = false,
  weakPart = null,
  fixedCount = 0,
  fixedLookback = 0,
  outOfScope = false,
} = {}) {
  if (!movement?.id) return '';
  const catLabel = CAT_LABEL[movement.equipment_category] || movement.equipment_category || '종목';
  const label = _maxRecommendationLabel(kind);
  const reason = _recommendationReason({ kind, movement, prescription, group, fixedCount, fixedLookback });
  const summary = _prescriptionSummary(prescription) || '처방은 추가 시 최근 기록 기준으로 계산돼요.';
  const primaryMajor = _movementMajor(movement);
  const subPattern = weakPart || _movementSubPattern(movement);
  const evidence = [
    ...(prescription?.evidence || []),
    { label: '적용 규칙', value: reason.rule },
  ];
  const transparency = prescription?.transparency;
  const detailHtml = [...evidence, transparency ? { label: transparency.label, value: transparency.detail } : null]
    .filter(Boolean)
    .map(item => `<li><b>${_esc(item.label)}</b><span>${_esc(item.value)}</span></li>`)
    .join('');
  return `
    <article class="wt-max-rec-card wt-max-rec-card--${_esc(kind)}${outOfScope ? ' is-outscope' : ''}"
             data-rec-id="${_esc(_buildRecommendationId(kind, movement.id, subPattern))}"
             data-primary-major="${_esc(primaryMajor || '')}">
      <div class="wt-max-rec-main">
        <div class="wt-max-rec-top">
          <span class="wt-max-rec-kind">${_esc(label)}</span>
          <span class="wt-max-rec-cat">${_esc(catLabel)}</span>
        </div>
        <div class="wt-max-rec-name">${_esc(movement.nameKo || movement.id)}</div>
        <div class="wt-max-rec-prescription">${_esc(summary)}</div>
        <div class="wt-max-rec-reason">${_esc(reason.headline)}</div>
      </div>
      <details class="wt-max-rec-why">
        <summary>근거</summary>
        <ul>${detailHtml}</ul>
      </details>
      <div class="wt-max-rec-actions">
        ${alreadyTaken ? `
          <span class="wt-max-rec-done">오늘 포함됨</span>
        ` : `
          <button type="button" class="wt-max-rec-accept"
                  data-action="apply-max"
                  data-movement-id="${_esc(movement.id)}"
                  data-rec-kind="${_esc(kind)}"
                  data-rec-reason="${_esc(reason.headline)}"
                  ${weakPart ? `data-weak-part="${_esc(weakPart)}"` : ''}>추가</button>
          <button type="button" class="wt-max-rec-secondary"
                  data-action="adjust-max"
                  data-movement-id="${_esc(movement.id)}"
                  data-rec-kind="${_esc(kind)}"
                  data-rec-reason="${_esc(reason.headline)}"
                  ${weakPart ? `data-weak-part="${_esc(weakPart)}"` : ''}>조정</button>
          <button type="button" class="wt-max-rec-secondary"
                  data-action="reject-max"
                  data-movement-id="${_esc(movement.id)}"
                  data-rec-id="${_esc(_buildRecommendationId(kind, movement.id, subPattern))}">숨김</button>
        `}
      </div>
    </article>
  `;
}

let _maxAdjustDraft = null;

function _buildPrescriptionForMovement(movement, weakPart = null) {
  const exList = getExList();
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  const meta = _ensureMaxMeta();
  const exId = movToExId.get(movement.id) || null;
  return _applyFrameworkPrescription(buildMaxPrescription({
    cache: getCache(),
    exList,
    movement,
    exerciseId: exId,
    todayKey: _todayKey(),
    sessionType: meta.sessionType,
    weakTarget: !!weakPart,
  }), movement, { weakTarget: !!weakPart });
}

function _ensureMaxAdjustModal() {
  let el = document.getElementById('max-rec-adjust-modal');
  if (el) return el;
  const container = document.getElementById('modals-container') || document.body;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-overlay" id="max-rec-adjust-modal" onclick="closeMaxRecAdjustModal(event)">
      <div class="wt-max-adjust-sheet" onclick="event.stopPropagation()">
        <div class="wt-max-adjust-head">
          <div>
            <div class="wt-max-adjust-title">추천 조정</div>
            <div class="wt-max-adjust-sub" id="max-rec-adjust-sub"></div>
          </div>
          <button type="button" class="wt-max-adjust-close" onclick="closeMaxRecAdjustModal()">×</button>
        </div>
        <div class="wt-max-adjust-grid">
          <label><span>무게</span><input id="max-rec-adjust-kg" type="number" min="0" max="500" step="0.5"></label>
          <label><span>횟수</span><input id="max-rec-adjust-reps" type="number" min="1" max="50" step="1"></label>
          <label><span>세트</span><input id="max-rec-adjust-sets" type="number" min="1" max="10" step="1"></label>
          <label><span>RPE</span><input id="max-rec-adjust-rpe" type="number" min="1" max="10" step="0.5"></label>
        </div>
        <div class="wt-max-adjust-note" id="max-rec-adjust-note"></div>
        <div class="wt-max-adjust-actions">
          <button type="button" class="wt-max-rec-secondary" onclick="closeMaxRecAdjustModal()">취소</button>
          <button type="button" class="wt-max-rec-accept" onclick="applyMaxAdjustedRecommendation()">조정해서 추가</button>
        </div>
      </div>
    </div>
  `;
  container.appendChild(wrapper.firstElementChild);
  return document.getElementById('max-rec-adjust-modal');
}

export function openMaxRecAdjustModal(movementId, weakPart = null, recMeta = {}) {
  const movement = MOVEMENTS.find(m => m.id === movementId);
  if (!movement) return;
  const prescription = _buildPrescriptionForMovement(movement, weakPart);
  _maxAdjustDraft = { movementId, weakPart, recMeta: { ...recMeta, modified: true }, prescription };
  const el = _ensureMaxAdjustModal();
  document.getElementById('max-rec-adjust-sub').textContent = `${movement.nameKo || movement.id} · ${prescription?.reason || '추천값을 조정해 추가합니다.'}`;
  document.getElementById('max-rec-adjust-kg').value = Number(prescription?.startKg) || 0;
  document.getElementById('max-rec-adjust-reps').value = Number(prescription?.repsHigh) || 10;
  document.getElementById('max-rec-adjust-sets').value = Number(prescription?.targetSets) || 4;
  document.getElementById('max-rec-adjust-rpe').value = prescription?.targetRpe ?? '';
  document.getElementById('max-rec-adjust-note').textContent = prescription?.transparency?.detail || '추가 버튼은 추천값 그대로, 조정은 이 값으로 세션에 넣습니다.';
  el.classList.add('open');
}

export function closeMaxRecAdjustModal(event) {
  if (event && event.target?.id !== 'max-rec-adjust-modal') return;
  document.getElementById('max-rec-adjust-modal')?.classList.remove('open');
}

export async function applyMaxAdjustedRecommendation() {
  if (!_maxAdjustDraft?.movementId) return;
  const override = {
    startKg: Number(document.getElementById('max-rec-adjust-kg')?.value) || 0,
    reps: Number(document.getElementById('max-rec-adjust-reps')?.value) || 10,
    targetSets: Number(document.getElementById('max-rec-adjust-sets')?.value) || 4,
    targetRpe: document.getElementById('max-rec-adjust-rpe')?.value || null,
  };
  closeMaxRecAdjustModal();
  await applyMaxSuggestion(_maxAdjustDraft.movementId, _maxAdjustDraft.weakPart, {
    ..._maxAdjustDraft.recMeta,
    override,
  });
}

function _wendlerWeekSets(tm, weekIndex) {
  const week = ((Number(weekIndex) || 1) - 1) % 4 + 1;
  const pct = {
    1: [0.65, 0.75, 0.85],
    2: [0.70, 0.80, 0.90],
    3: [0.75, 0.85, 0.95],
    4: [0.40, 0.50, 0.60],
  }[week];
  const reps = week === 1 ? [5, 5, 5] : (week === 2 ? [3, 3, 3] : (week === 3 ? [5, 3, 1] : [5, 5, 5]));
  return pct.map((p, i) => ({
    kg: _roundToStep(tm * p, 2.5),
    reps: reps[i],
    setType: 'main',
    done: false,
    rpe: 8,
  }));
}

function _applyFrameworkPrescription(prescription, movement, { weakTarget = false } = {}) {
  const plan = _getMaxPlan();
  const framework = plan.framework || 'adaptive_volume';
  const cyclePrescription = _benchmarkPrescription(prescription, movement, { weakTarget });
  if (cyclePrescription && framework === 'dual_track_progression_v2') return cyclePrescription;
  const liftKey = MAX_MAIN_LIFTS[movement?.id];
  if ((framework === 'wendler531' || framework === 'hybrid') && liftKey && Number(plan.lifts?.[liftKey]?.tm) > 0) {
    const sets = _wendlerWeekSets(Number(plan.lifts[liftKey].tm), _buildMaxPlanSnapshot({ majors: new Set([movement.primary]) }).weekIndex);
    const top = sets[sets.length - 1];
    return {
      ...prescription,
      label: `5/3/1 · ${sets.map(s => `${s.kg}kg x ${s.reps}${s === top && plan.deloadWeek !== 4 ? '+' : ''}`).join(' / ')}`,
      targetSets: sets.length,
      repsLow: Math.min(...sets.map(s => s.reps)),
      repsHigh: Math.max(...sets.map(s => s.reps)),
      targetRpe: 8,
      startKg: sets[0]?.kg || 0,
      action: 'load',
      actionLabel: '강도',
      reason: `Training Max ${plan.lifts[liftKey].tm}kg 기준 ${_frameworkMeta(framework).label} 주차 처방입니다.`,
      transparency: {
        type: 'framework',
        label: '프레임워크 처방',
        detail: '5/3/1은 실제 1RM이 아니라 Training Max를 기준으로 보수적으로 계산합니다.',
      },
      evidence: [
        ...(prescription?.evidence || []),
        { label: 'Training Max', value: `${plan.lifts[liftKey].tm}kg` },
        { label: '프레임워크', value: _frameworkMeta(framework).copy },
      ],
      sets,
    };
  }
  if (framework === 'rp_lite' && prescription) {
    return {
      ...prescription,
      action: weakTarget ? 'volume' : prescription.action,
      actionLabel: weakTarget ? '볼륨' : prescription.actionLabel,
      reason: weakTarget
        ? 'RP Lite 기준으로 오늘 선택한 약점 세부 부위의 유효 세트를 우선 누적합니다.'
        : `${prescription.reason} RP Lite 기준으로 주간 목표 세트와 함께 조정합니다.`,
      evidence: [
        ...(prescription.evidence || []),
        { label: '프레임워크', value: _frameworkMeta(framework).copy },
      ],
    };
  }
  if (framework === 'hybrid' && prescription) {
    return {
      ...prescription,
      evidence: [
        ...(prescription.evidence || []),
        { label: '프레임워크', value: _frameworkMeta(framework).copy },
      ],
    };
  }
  return prescription;
}

function _renderMaxExerciseChips(exercises = [], { weakPart = null, kind = 'starter', group = null, meta = _ensureMaxMeta() } = {}) {
  const exList = getExList();
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  const takenSet = new Set((S?.workout?.exercises || []).map(e => e.exerciseId).filter(Boolean));
  return (exercises || []).map(ex => {
    const movement = MOVEMENTS.find(m => m.id === ex.movementId) || ex;
    const recId = _buildRecommendationId(kind, movement.id, weakPart || movement.subPattern);
    if (Array.isArray(meta.rejectedRecommendations) && meta.rejectedRecommendations.includes(recId)) return '';
    const exId = movToExId.get(movement.id) || null;
    const prescription = _applyFrameworkPrescription(buildMaxPrescription({
      cache: getCache(),
      exList,
      movement,
      exerciseId: exId,
      todayKey: _todayKey(),
      sessionType: meta.sessionType,
      weakTarget: !!weakPart,
    }), movement, { weakTarget: !!weakPart });
    return _renderRecommendationCard({
      kind,
      movement,
      group,
      prescription,
      weakPart,
      alreadyTaken: !!(exId && takenSet.has(exId)),
    });
  }).join('');
}

function _renderFixedCardsForMajor(fixedMovements, takenIds, meta) {
  if (!Array.isArray(fixedMovements) || fixedMovements.length === 0) return '';
  const exList = getExList();
  const takenSet = new Set(takenIds || []);
  const movToExId = new Map(exList.filter(e => e?.movementId).map(e => [e.movementId, e.id]));
  return fixedMovements.map(mov => {
    const recId = _buildRecommendationId('habit_keep', mov.id, mov.subPattern);
    if (Array.isArray(meta.rejectedRecommendations) && meta.rejectedRecommendations.includes(recId)) return '';
    const exId = movToExId.get(mov.id) || null;
    const alreadyTaken = exId && takenSet.has(exId);
    const prescription = _applyFrameworkPrescription(buildMaxPrescription({
      cache: getCache(),
      exList,
      movement: mov,
      exerciseId: exId,
      todayKey: _todayKey(),
      sessionType: meta.sessionType,
      weakTarget: false,
    }), mov, { weakTarget: false });
    return _renderRecommendationCard({
      kind: 'habit_keep',
      movement: mov,
      prescription,
      alreadyTaken,
      fixedCount: mov.count,
      fixedLookback: mov.lookback,
    });
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
  outOfScopeWeakGroups = [],
  takenIds = [],
  meta = _ensureMaxMeta(),
} = {}) {
  const buckets = new Map();
  const majorOrder = [...new Set([...(majors || []), ...(meta.selectedMajors || [])])].filter(Boolean);
  const selectedMajorSet = new Set(majorOrder.map(_normalizeMaxMajor).filter(Boolean));

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
    if (selectedMajorSet.size && !selectedMajorSet.has(_normalizeMaxMajor(major))) continue;
    _addMajorBucket(buckets, major, { type: 'starter', title: '오늘 스타터', group: g });
  }
  for (const g of weakCoachGroups || []) {
    const major = SUBPATTERN_TO_MAJOR[g.subPattern] || g.subPattern;
    if (selectedMajorSet.size && !selectedMajorSet.has(_normalizeMaxMajor(major))) continue;
    _addMajorBucket(buckets, major, { type: 'weak', title: `약점 전담 · ${g.subPatternLabel}`, group: g });
  }
  for (const g of balanceGroups || []) {
    const major = SUBPATTERN_TO_MAJOR[g.subPattern] || g.subPattern;
    if (selectedMajorSet.size && !selectedMajorSet.has(_normalizeMaxMajor(major))) continue;
    _addMajorBucket(buckets, major, { type: 'balance', title: `균형보강 · ${g.subPatternLabel}`, group: g });
  }

  const orderedMajors = [...new Set([...majorOrder, ...buckets.keys()])].filter(m => buckets.has(m));
  const outOfScopeHtml = (outOfScopeWeakGroups || []).length ? `
    <details class="wt-max-outscope">
      <summary>선택 밖 약점 추천 ${outOfScopeWeakGroups.length}개</summary>
      <div class="wt-max-rec-grid">
        ${outOfScopeWeakGroups.map(g => _renderMaxExerciseChips(g.exercises, {
          weakPart: g.subPattern,
          kind: 'weak_focus',
          group: g,
          meta,
        })).join('')}
      </div>
    </details>
  ` : '';
  if (!orderedMajors.length) return outOfScopeHtml;

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
                  : `<div class="wt-max-rec-grid">${_renderMaxExerciseChips(item.group.exercises, {
                    weakPart: item.type === 'weak' ? item.group.subPattern : null,
                    kind: item.type === 'weak' ? 'weak_focus' : (item.type === 'balance' ? 'balance_gap' : 'starter'),
                    group: item.group,
                    meta,
                  })}</div>`}
              </div>
            `).join('')}
          </div>
        </section>
      `).join('')}
      ${outOfScopeHtml}
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

function _renderMaxTodayMajorGate({ selectedMajors = [] } = {}) {
  const selectedSet = new Set((selectedMajors || []).map(_normalizeMaxMajor).filter(Boolean));
  return `
    <section class="wt-v4-board wt-v4-major-gate" id="wt-max-cycle-card">
      <div class="wt-v4-head">
        <button type="button" class="wt-v4-icon" onclick="wtExcSwitchToNormalView()" aria-label="일반 모드로">‹</button>
        <button type="button" class="wt-v4-head-center" data-action="open-max-plan-editor">
          <strong>오늘 부위 선택</strong>
          <span>테스트 모드</span>
        </button>
        <button type="button" class="wt-v4-icon" data-action="open-max-plan-editor" aria-label="계획 조정">⋯</button>
      </div>
      <div class="wt-v4-major-copy">
        <b>오늘 헬스장에서 할 큰 부위를 먼저 고르세요.</b>
        <span>선택한 부위 기준으로만 벤치마크와 6주 성장판을 보여줍니다.</span>
      </div>
      <div class="wt-v4-major-grid">
        ${MAJOR_PARTS.map(part => `
          <button type="button"
                  class="${selectedSet.has(part.id) ? 'on' : ''}"
                  data-action="toggle-major-part"
                  data-major-part="${_esc(part.id)}">
            <strong>${_esc(part.label)}</strong>
            <small>${_esc(part.coach)}</small>
          </button>
        `).join('')}
      </div>
      <div class="wt-v4-last-ten">
        <div class="wt-v4-last-dot"></div>
        <div>
          <b>벤치마크는 선택한 부위만 표시</b>
          <span>선택 전에는 기본 가슴/등/하체 목록을 임의로 보여주지 않습니다.</span>
        </div>
      </div>
      <div class="wt-v4-cta">
        <button type="button" class="wt-v4-ghost" data-action="open-max-plan-editor">계획 조정</button>
        <button type="button" class="wt-v4-primary" data-action="confirm-max-majors" ${selectedSet.size ? '' : 'disabled'}>
          ${selectedSet.size ? `${selectedSet.size}개 부위 벤치마크 보기` : '부위를 선택하세요'}
        </button>
      </div>
    </section>
  `;
}

function _cycleForTodayMajors(cycle, majors, todayKey) {
  const majorSet = new Set([...(majors || [])].map(_normalizeMaxMajor).filter(Boolean));
  if (!majorSet.size) return null;
  const filtered = (cycle?.benchmarks || []).filter(b => majorSet.has(_normalizeMaxMajor(b.primaryMajor)));
  if (filtered.length) return { ...cycle, benchmarks: filtered };
  return createDefaultMaxCycle({
    todayKey,
    majors: [...majorSet],
    movements: MOVEMENTS,
    currentGymId: S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null,
    allowFallback: false,
  });
}

function _renderMaxCycleRecommendationPanel({
  comparisonCache = {},
  exList = [],
  todayKey = _todayKey(),
  majors = new Set(),
  weakPartsForToday = [],
  weakPartsOutOfScope = [],
  meta = _ensureMaxMeta(),
} = {}) {
  const majorSet = majors instanceof Set ? majors : new Set(majors || []);
  if (!majorSet.size) return '';
  const takenIds = (S?.workout?.exercises || []).map(e => e.exerciseId).filter(Boolean);
  const comparison = buildMuscleComparison(comparisonCache, exList, MOVEMENTS, todayKey, majorSet, 2);
  const weakCoachGroups = _suggestWeakTargetBoosts(weakPartsForToday, takenIds);
  const outOfScopeWeakGroups = _suggestWeakTargetBoosts(weakPartsOutOfScope, takenIds);
  const fixedMovements = detectMaxFixedMovements({
    cache: comparisonCache,
    exList,
    movements: MOVEMENTS,
    todayKey,
    majors: majorSet,
    lookbackSessions: 4,
    minHits: 2,
  });
  let boardHtml = '';
  let context = '오늘 선택한 부위와 최근 기록을 기준으로 추천합니다.';

  if (!comparison.previous?.length) {
    boardHtml = _renderMajorRecommendationBoard({
      majors: [...majorSet],
      starterGroups: _suggestMajorStarters([...majorSet], takenIds),
      outOfScopeWeakGroups,
      takenIds,
      meta,
    });
    context = '직전/직직전 같은 부위 기록이 부족해서, 오늘 시작하기 좋은 후보를 먼저 보여줍니다.';
  } else if (!comparison.imbalance) {
    boardHtml = _renderMajorRecommendationBoard({
      majors: [...majorSet],
      starterGroups: _suggestMajorStarters([...majorSet], takenIds),
      fixedMovements,
      weakCoachGroups,
      outOfScopeWeakGroups,
      takenIds,
      meta,
    });
    const prevDates = comparison.previous.map(p => _formatShortDate(p.dateKey)).join(' · ');
    context = `최근 ${prevDates} 기준 큰 불균형은 없어서, 자주 하던 종목과 선택 약점을 우선합니다.`;
  } else {
    const groups = suggestMaxBoosts({
      comparison,
      exList,
      movements: MOVEMENTS,
      preferredCategories: MAX_PREFERRED_CATEGORIES,
      takenExerciseIds: takenIds,
      limit: Math.max(4, majorSet.size * 4),
    });
    boardHtml = _renderMajorRecommendationBoard({
      majors: [...majorSet],
      fixedMovements,
      weakCoachGroups,
      outOfScopeWeakGroups,
      balanceGroups: groups,
      takenIds,
      meta,
    });
    const prevDates = comparison.previous.map(p => _formatShortDate(p.dateKey)).join(' · ');
    context = `최근 ${prevDates} 수행과 오늘 선택한 운동을 비교해 부족한 세부 부위를 보강합니다.`;
  }

  if (!boardHtml) return '';
  return `
    <section class="wt-v4-rec-panel">
      <div class="wt-v4-rec-head">
        <div>
          <b>오늘 추가하면 좋은 종목</b>
          <span>${_esc(context)}</span>
        </div>
      </div>
      ${boardHtml}
    </section>
  `;
}

// ── 메인: 맥스 모드 카드 렌더 ─────────────────────────────────────
// renderExpertTopArea 에서 mode==='max' && _expertViewShown 분기 시 호출.
// host element를 받아 innerHTML 을 구성. 세그먼트 + 카드를 한 번에 채움.
export function renderMaxCard(host) {
  if (!host) return;

  const segHtml = `
    <section class="wt-mode-entry wt-mode-entry--compact" aria-label="운동 모드 선택">
      <div class="wt-mode-entry-head">
        <div><span>운동 방식</span><b>6주 성장판으로 진행 중</b></div>
      </div>
      <div class="wt-mode-entry-stack">
        <article class="wt-mode-entry-card">
          <button type="button" class="wt-mode-entry-main" onclick="wtExcSwitchToNormalView()">
            <span class="wt-mode-entry-icon">+</span>
            <span class="wt-mode-entry-copy"><strong>일반모드</strong><small>바로 기록</small></span>
            <span class="wt-mode-entry-cta">기록</span>
          </button>
        </article>
        <article class="wt-mode-entry-card">
          <button type="button" class="wt-mode-entry-main" onclick="wtExcShowProView()">
            <span class="wt-mode-entry-icon">⌂</span>
            <span class="wt-mode-entry-copy"><strong>프로모드</strong><small>기구/루틴</small></span>
            <span class="wt-mode-entry-cta">관리</span>
          </button>
        </article>
        <article class="wt-mode-entry-card is-active">
          <button type="button" class="wt-mode-entry-main">
            <span class="wt-mode-entry-icon">▦</span>
            <span class="wt-mode-entry-copy"><strong>테스트모드</strong><small>계획값 자동 입력</small></span>
            <span class="wt-mode-entry-cta">진행</span>
          </button>
        </article>
      </div>
    </section>
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
  const majors = new Set(selectedMajors);
  if (meta.majorGateOpen || majors.size === 0) {
    host.innerHTML = _renderMaxTodayMajorGate({ selectedMajors });
    _bindMaxHost(host);
    _ensureWeakTimerTick();
    return;
  }
  const weakScope = _splitWeakPartsByMajors(meta.selectedWeakParts, [...majors]);
  const weakPartsForToday = weakScope.inScope;
  const weakPartsOutOfScope = weakScope.outOfScope;
  const comparisonCache = cache[todayKey] ? cache : { ...cache, [todayKey]: day };
  const savedCycle = _getMaxCycleSafe();
  const cycleDraft = savedCycle || createDefaultMaxCycle({
    todayKey,
    majors: [...majors],
    movements: MOVEMENTS,
    currentGymId: S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null,
    allowFallback: false,
  });
  const todayCycle = _cycleForTodayMajors(cycleDraft, majors, todayKey);
  const recommendationHtml = _renderMaxCycleRecommendationPanel({
    comparisonCache,
    exList,
    todayKey,
    majors,
    weakPartsForToday,
    weakPartsOutOfScope,
    meta,
  });
  const cycleHtml = renderMaxCycleDashboard({
    cycle: todayCycle,
    cache: comparisonCache,
    exList,
    todayKey,
    isDraft: !savedCycle,
    recommendationHtml,
  });
  host.innerHTML = cycleHtml;
  _bindMaxHost(host);
  _ensureWeakTimerTick();
  return;
  const planHtml = _renderMaxPlanCard(_buildMaxPlanSnapshot({ cache: comparisonCache, todayKey, majors, exList }));

  // empty: 종목 자체가 없음 (looser도 비어있음)
  if (majors.size === 0) {
    host.innerHTML = `
      ${segHtml}
      ${cycleHtml}
      ${planHtml}
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
    const outOfScopeWeakGroups = _suggestWeakTargetBoosts(weakPartsOutOfScope, takenIds);
    const starterHtml = _renderMajorRecommendationBoard({
      majors: [...majors],
      starterGroups,
      outOfScopeWeakGroups,
      takenIds,
      meta,
    });
    host.innerHTML = `
      ${segHtml}
      ${cycleHtml}
      ${planHtml}
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
    const outOfScopeWeakGroups = _suggestWeakTargetBoosts(weakPartsOutOfScope, takenIds);
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
      outOfScopeWeakGroups,
      takenIds,
      meta,
    });
    host.innerHTML = `
      ${segHtml}
      ${cycleHtml}
      ${planHtml}
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
  const outOfScopeWeakGroups = _suggestWeakTargetBoosts(weakPartsOutOfScope, takenIds);
  const boostLimit = Math.max(4, majors.size * 4);
  const groups = suggestMaxBoosts({
    comparison,
    exList,
    movements: MOVEMENTS,
    preferredCategories: MAX_PREFERRED_CATEGORIES,
    takenExerciseIds: takenIds,
    limit: boostLimit,
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
    outOfScopeWeakGroups,
    balanceGroups: groups,
    takenIds,
    meta,
  });

  // suggestMaxBoosts가 빈 결과면 (이론상 imbalance 있을 때 거의 없지만 방어) — 균형 메시지로 fallback
  if (groups.length === 0) {
    host.innerHTML = `
      ${segHtml}
      ${cycleHtml}
      ${planHtml}
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
    ${cycleHtml}
    ${planHtml}
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
        const recMeta = {
          kind: btn.getAttribute('data-rec-kind') || 'starter',
          reason: btn.getAttribute('data-rec-reason') || '',
        };
        if (movId) applyMaxSuggestion(movId, weakPart, recMeta).catch(err => console.warn('[applyMaxSuggestion]:', err));
        return;
      }
      const adjustBtn = e.target.closest('[data-action="adjust-max"]');
      if (adjustBtn) {
        const movId = adjustBtn.getAttribute('data-movement-id');
        const weakPart = adjustBtn.getAttribute('data-weak-part') || null;
        const recMeta = {
          kind: adjustBtn.getAttribute('data-rec-kind') || 'starter',
          reason: adjustBtn.getAttribute('data-rec-reason') || '',
        };
        if (movId) openMaxRecAdjustModal(movId, weakPart, recMeta);
        return;
      }
      const rejectBtn = e.target.closest('[data-action="reject-max"]');
      if (rejectBtn) {
        rejectMaxSuggestion(rejectBtn.getAttribute('data-rec-id'), rejectBtn.getAttribute('data-movement-id'));
        return;
      }
      if (e.target.closest('[data-action="open-blueprint"]')) {
        openMaxBlueprintModal();
        return;
      }
      if (e.target.closest('[data-action="start-max-cycle"]')) {
        startMaxCycle().catch(err => console.warn('[startMaxCycle]:', err));
        return;
      }
      if (e.target.closest('[data-action="clear-max-major"]')) {
        clearMaxMajorPart();
        return;
      }
      if (e.target.closest('[data-action="confirm-max-majors"]')) {
        confirmMaxMajorParts();
        return;
      }
      if (e.target.closest('[data-action="start-max-session"]')) {
        const openPicker = window.wtOpenExercisePicker;
        if (typeof openPicker === 'function') {
          Promise.resolve(openPicker()).catch(err => console.warn('[startMaxSession.openPicker]:', err));
        } else {
          _toast('종목 추가 버튼을 눌러 오늘 운동을 선택하세요.', 'info');
        }
        return;
      }
      const liftToggle = e.target.closest('[data-action="toggle-max-lift"]');
      if (liftToggle) {
        liftToggle.closest('.wt-v4-lift')?.classList.toggle('is-expanded');
        liftToggle.textContent = liftToggle.closest('.wt-v4-lift')?.classList.contains('is-expanded') ? '접기' : '상세';
        return;
      }
      const trackBtn = e.target.closest('[data-action="set-max-track"]');
      if (trackBtn) {
        setMaxCycleTrack(trackBtn.getAttribute('data-track')).catch(err => console.warn('[setMaxCycleTrack]:', err));
        return;
      }
      const weightAdjustBtn = e.target.closest('[data-action="adjust-max-weight"]');
      if (weightAdjustBtn) {
        adjustMaxBenchmarkWeight(
          weightAdjustBtn.getAttribute('data-benchmark-id'),
          Number(weightAdjustBtn.getAttribute('data-delta')) || 0,
        ).catch(err => console.warn('[adjustMaxBenchmarkWeight]:', err));
        return;
      }
      const adjustOpen = e.target.closest('[data-action="open-max-adjust"]');
      if (adjustOpen) {
        openMaxAdjustSheet(adjustOpen.getAttribute('data-benchmark-id'));
        return;
      }
      if (e.target.closest('[data-action="open-max-cycle-board"]')) {
        openMaxCycleBoardSheet();
        return;
      }
      if (e.target.closest('[data-action="open-max-plan-editor"]')) {
        openMaxPlanEditorSheet();
        return;
      }
      if (e.target.closest('[data-action="close-max-sheet"]')) {
        closeMaxV4Sheet();
        return;
      }
      if (e.target.closest('[data-action="settle-max-cycle"]')) {
        settleMaxCycle().catch(err => console.warn('[settleMaxCycle]:', err));
        return;
      }
      if (e.target.closest('[data-action="open-equipment-pool"]')) {
        openMaxEquipmentPoolModal().catch(err => console.warn('[openMaxEquipmentPoolModal]:', err));
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
      const toggleMajorBtn = e.target.closest('[data-action="toggle-major-part"]');
      if (toggleMajorBtn) {
        toggleMaxMajorPart(toggleMajorBtn.getAttribute('data-major-part'));
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

function _dateFromKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function _keyFromDate(d) {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function _weekStartKey(key) {
  const d = _dateFromKey(key);
  if (!d) return key;
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return _keyFromDate(d);
}

function _countMajorWorkSets(day, major, exList = getExList()) {
  const exById = new Map((exList || []).map(e => [e.id, e]));
  let count = 0;
  for (const entry of day?.exercises || []) {
    const ex = exById.get(entry.exerciseId);
    const mov = MOVEMENTS.find(m => m.id === (entry.movementId || ex?.movementId));
    const entryMajor = _normalizeMaxMajor(mov?.primary || entry.muscleId || ex?.muscleId);
    if (entryMajor !== major) continue;
    count += _workSetsOnly(entry.sets || []).length;
  }
  return count;
}

function _buildMainLiftProgress(cache = getCache(), exList = getExList()) {
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const liftMovements = {
    bench: 'barbell_bench',
    squat: 'back_squat',
    deadlift: 'deadlift',
    ohp: 'ohp',
  };
  return Object.entries(liftMovements).map(([lift, movementId]) => {
    const points = [];
    for (const [key, day] of Object.entries(cache || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      let best = 0;
      for (const entry of day?.exercises || []) {
        const ex = exById.get(entry.exerciseId);
        const entryMovementId = entry.movementId || ex?.movementId;
        if (entryMovementId !== movementId) continue;
        for (const set of _workSetsOnly(entry.sets || [])) {
          best = Math.max(best, _epley(set.kg, set.reps));
        }
      }
      if (best > 0) points.push({ dateKey: key, e1rm: Math.round(best * 10) / 10 });
    }
    points.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    const recent = points.slice(-6);
    const first = recent[0]?.e1rm || 0;
    const last = recent[recent.length - 1]?.e1rm || 0;
    return { lift, movementId, points: recent, delta: Math.round((last - first) * 10) / 10 };
  }).filter(row => row.points.length >= 2);
}

function _buildMaxPlanSnapshot({ cache = getCache(), todayKey = _todayKey(), majors = new Set(), exList = getExList() } = {}) {
  const activeMajors = [...majors].map(_normalizeMaxMajor).filter(Boolean);
  const plan = _getMaxPlan(todayKey);
  const weekStart = _weekStartKey(todayKey);
  const datedKeys = Object.keys(cache || {}).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  const firstKey = datedKeys.find(key => (cache[key]?.exercises || []).length) || weekStart;
  const cycleStart = plan.startDate || _weekStartKey(firstKey);
  const weeks = Math.max(4, Math.min(12, Number(plan.weeks) || 8));
  const weekIndex = Math.max(1, Math.min(weeks, Math.floor(((_dateFromKey(todayKey)?.getTime() || 0) - (_dateFromKey(cycleStart)?.getTime() || 0)) / 604800000) + 1));
  const rows = activeMajors.map(major => {
    const recentKeys = Object.keys(cache || {})
      .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < todayKey)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 28);
    const recentSets = recentKeys.reduce((sum, key) => sum + _countMajorWorkSets(cache[key], major, exList), 0);
    const recentWeeklyAvg = Math.round((recentSets / 4) * 10) / 10;
    const savedTarget = Number(plan.targetSetsByMajor?.[major]) || 0;
    const target = savedTarget || Math.max(6, Math.min(18, Math.round((recentWeeklyAvg || 8) + 2)));
    const actual = Object.entries(cache || {})
      .filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= weekStart && key <= todayKey)
      .reduce((sum, [, day]) => sum + _countMajorWorkSets(day, major, exList), 0);
    const pct = target > 0 ? Math.min(160, Math.round((actual / target) * 100)) : 0;
    return { major, label: MAJOR_LABEL[major] || major, target, actual, pct };
  });
  return {
    framework: plan.framework || 'adaptive_volume',
    label: _frameworkMeta(plan.framework).label,
    weekIndex,
    weeks,
    sessionsPerWeek: Number(plan.sessionsPerWeek) || 5,
    deloadWeek: Number(plan.deloadWeek) || weeks,
    lifts: plan.lifts || {},
    liftProgress: _buildMainLiftProgress(cache, exList),
    rows,
  };
}

function _renderMaxPlanCard(snapshot) {
  if (!snapshot?.rows?.length) return '';
  const totalTarget = snapshot.rows.reduce((sum, r) => sum + r.target, 0);
  const totalActual = snapshot.rows.reduce((sum, r) => sum + r.actual, 0);
  const headline = `Week ${snapshot.weekIndex}/${snapshot.weeks} · 계획 ${totalTarget}세트 중 ${totalActual}세트 완료`;
  return `
    <div class="wt-exc wt-max-card wt-max-plan-card">
      <div class="wt-exc-head">
        <div class="wt-exc-title">8주 청사진</div>
        <button type="button" class="wt-max-plan-edit" data-action="open-blueprint">설정</button>
      </div>
      <div class="wt-max-plan-body">
        <div class="wt-max-plan-headline">${_esc(headline)}</div>
        <div class="wt-max-plan-bars">
          ${snapshot.rows.map(row => `
            <div class="wt-max-plan-row">
              <div class="wt-max-plan-row-top">
                <span>${_esc(row.label)}</span>
                <small>${row.actual}/${row.target}세트</small>
              </div>
              <div class="wt-max-plan-track" aria-label="${_esc(row.label)} 계획 대비 ${row.pct}%">
                <span style="width:${Math.min(100, row.pct)}%"></span>
              </div>
            </div>
          `).join('')}
        </div>
        ${_renderMaxLiftPlan(snapshot)}
        ${_renderMaxLiftProgress(snapshot)}
        <div class="wt-max-plan-note">${_esc(_frameworkMeta(snapshot.framework).copy)} · 다음 디로드 ${snapshot.deloadWeek}주차</div>
      </div>
    </div>
  `;
}

function _renderMaxLiftPlan(snapshot) {
  if (!['wendler531', 'hybrid'].includes(snapshot.framework)) return '';
  const liftRows = [
    ['bench', '벤치'],
    ['squat', '스쿼트'],
    ['deadlift', '데드'],
    ['ohp', 'OHP'],
  ].filter(([key]) => Number(snapshot.lifts?.[key]?.tm) > 0);
  if (!liftRows.length) return `
    <div class="wt-max-lift-empty">5/3/1 처방을 쓰려면 청사진 설정에서 Training Max를 입력하세요.</div>
  `;
  return `
    <div class="wt-max-lift-plan">
      ${liftRows.map(([key, label]) => {
        const tm = Number(snapshot.lifts[key].tm) || 0;
        const sets = _wendlerWeekSets(tm, snapshot.weekIndex);
        return `
          <div class="wt-max-lift-row">
            <span>${_esc(label)}</span>
            <small>TM ${tm}kg · ${sets.map(s => `${s.kg}x${s.reps}`).join(' / ')}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function _renderMaxLiftProgress(snapshot) {
  const labels = { bench: '벤치', squat: '스쿼트', deadlift: '데드', ohp: 'OHP' };
  if (!snapshot?.liftProgress?.length) return '';
  return `
    <div class="wt-max-progress-panel">
      <div class="wt-max-progress-title">수행능력 추이</div>
      ${snapshot.liftProgress.map(row => {
        const max = Math.max(...row.points.map(p => p.e1rm));
        const min = Math.min(...row.points.map(p => p.e1rm));
        const span = Math.max(1, max - min);
        return `
          <div class="wt-max-progress-row">
            <div class="wt-max-progress-row-top">
              <span>${_esc(labels[row.lift] || row.lift)}</span>
              <small>${row.delta >= 0 ? '+' : ''}${row.delta}kg</small>
            </div>
            <div class="wt-max-progress-dots">
              ${row.points.map(p => `<i style="height:${Math.max(10, Math.round(((p.e1rm - min) / span) * 28) + 8)}px" title="${_esc(p.dateKey)} ${p.e1rm}kg"></i>`).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export async function startMaxCycle() {
  const todayKey = _todayKey();
  const meta = _ensureMaxMeta();
  const selectedMajors = Array.isArray(meta.selectedMajors)
    ? meta.selectedMajors.map(_normalizeMaxMajor).filter(Boolean)
    : [];
  const day = getCache()[todayKey] || { exercises: S?.workout?.exercises || [] };
  const detectedMajors = _detectMajorsLoose(day, getExList(), MOVEMENTS);
  const majors = selectedMajors.length ? selectedMajors : [...detectedMajors];
  if (!majors.length) {
    _toast('오늘 할 큰 부위를 먼저 선택하세요', 'warning');
    if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
    return;
  }
  const cycle = createDefaultMaxCycle({
    todayKey,
    majors,
    movements: MOVEMENTS,
    currentGymId: S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null,
    allowFallback: false,
  });
  cycle.status = 'active';
  await _saveMaxCycleSafe(cycle);
  _toast('6주 성장판을 시작했어요', 'success');
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

function _cycleOrDraft() {
  const todayKey = _todayKey();
  const meta = _ensureMaxMeta();
  const selectedMajors = Array.isArray(meta.selectedMajors)
    ? meta.selectedMajors.map(_normalizeMaxMajor).filter(Boolean)
    : [];
  return _getMaxCycleSafe() || createDefaultMaxCycle({
    todayKey,
    majors: selectedMajors,
    movements: MOVEMENTS,
    currentGymId: S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null,
    allowFallback: false,
  });
}

function _movementSourceLabel(movement, gymId = null) {
  if (!movement) return '출처 미상';
  const category = movement.equipment_category || '';
  if (['barbell', 'dumbbell', 'bodyweight'].includes(category)) {
    return `공통 · ${CAT_LABEL[category] || category || '기본'}`;
  }
  const gym = (getGyms() || []).find(g => g.id === gymId) || null;
  const active = [];
  const match = active.find(item => Array.isArray(item.movementIds) && item.movementIds.includes(movement.id));
  if (match?.scope === 'gym') return `${gym?.name || '선택 헬스장'} 전용`;
  if (match?.scope === 'global') return `공통 · ${match.name || CAT_LABEL[category] || category}`;
  return gym ? `${gym.name} 후보 · ${CAT_LABEL[category] || category || '기구'}` : `헬스장 선택 필요 · ${CAT_LABEL[category] || category || '기구'}`;
}

function _movementsForPlanEditor() {
  const gymId = S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null;
  return MOVEMENTS.map(m => ({
    ...m,
    optionLabel: `${MAJOR_LABEL[m.primary] || m.primary || '기타'} · ${m.nameKo || m.id} · ${_movementSourceLabel(m, gymId)}`,
  }));
}

function _findCycleBenchmark(cycle, benchmarkId) {
  return (cycle?.benchmarks || []).find(b => b.id === benchmarkId) || null;
}

export async function setMaxCycleTrack(track) {
  const nextTrack = track === 'H' ? 'H' : 'M';
  const cycle = { ..._cycleOrDraft(), status: 'active', todayTrack: nextTrack };
  await _saveMaxCycleSafe(cycle);
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export async function adjustMaxBenchmarkWeight(benchmarkId, deltaKg) {
  const cycle = _cycleOrDraft();
  const todayKey = _todayKey();
  const snapshot = buildRenderedMaxCycleSnapshot({
    cycle,
    cache: getCache(),
    exList: getExList(),
    todayKey,
  });
  const row = (snapshot?.benchmarks || []).find(b => b.id === benchmarkId);
  if (!row) return;
  const key = `${benchmarkId}:${snapshot.track || 'M'}`;
  const current = Number(cycle.todayOverrides?.[todayKey]?.[key]?.kg)
    || Number(cycle.todayOverrides?.[todayKey]?.[benchmarkId]?.kg)
    || row.planned.plannedKg;
  const step = Number(row.planned?.incrementKg) > 0 ? Number(row.planned.incrementKg) : 2.5;
  const delta = Number(deltaKg) || 0;
  const nextKg = Math.max(0, Math.round((current + delta) / step) * step);
  const next = {
    ...cycle,
    status: 'active',
    todayOverrides: {
      ...(cycle.todayOverrides || {}),
      [todayKey]: {
        ...(cycle.todayOverrides?.[todayKey] || {}),
        [key]: {
          kg: Math.round(nextKg * 10) / 10,
          track: snapshot.track || 'M',
          scope: cycle.todayOverrides?.[todayKey]?.[key]?.scope || 'today',
          updatedAt: Date.now(),
        },
      },
    },
  };
  await _saveMaxCycleSafe(next);
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export async function setMaxBenchmarkWeight(benchmarkId, kg) {
  const cycle = _cycleOrDraft();
  const todayKey = _todayKey();
  const snapshot = buildRenderedMaxCycleSnapshot({
    cycle,
    cache: getCache(),
    exList: getExList(),
    todayKey,
  });
  const row = (snapshot?.benchmarks || []).find(b => b.id === benchmarkId);
  if (!row) return;
  const raw = Number(kg);
  if (!Number.isFinite(raw) || raw <= 0) {
    _toast('무게를 숫자로 입력하세요', 'warning');
    return;
  }
  const step = Number(row.planned?.incrementKg) > 0 ? Number(row.planned.incrementKg) : 2.5;
  const nextKg = Math.max(0, Math.round(raw / step) * step);
  const key = `${benchmarkId}:${snapshot.track || 'M'}`;
  const next = {
    ...cycle,
    status: 'active',
    todayOverrides: {
      ...(cycle.todayOverrides || {}),
      [todayKey]: {
        ...(cycle.todayOverrides?.[todayKey] || {}),
        [key]: {
          kg: Math.round(nextKg * 10) / 10,
          track: snapshot.track || 'M',
          scope: cycle.todayOverrides?.[todayKey]?.[key]?.scope || 'today',
          updatedAt: Date.now(),
        },
      },
    },
  };
  await _saveMaxCycleSafe(next);
  _toast(`${Math.round(nextKg * 10) / 10}kg으로 조정했어요`, 'success');
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

function _ensureMaxV4Sheet() {
  let el = document.getElementById('max-v4-sheet');
  if (el) {
    _ensureMaxPlanSaveBinding(el);
    return el;
  }
  const container = document.getElementById('modals-container') || document.body;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-overlay wt-v4-modal" id="max-v4-sheet" onclick="if(event.target===this) closeMaxV4Sheet()">
      <div class="wt-v4-sheet" onclick="event.stopPropagation()">
        <div class="wt-v4-handle"></div>
        <div id="max-v4-sheet-body"></div>
      </div>
    </div>
  `;
  container.appendChild(wrapper.firstElementChild);
  const sheet = document.getElementById('max-v4-sheet');
  _ensureMaxPlanSaveBinding(sheet);
  sheet.addEventListener('click', (e) => {
    const close = e.target.closest('[data-action="close-max-sheet"]');
    if (close) {
      closeMaxV4Sheet();
      return;
    }
    const savePlan = e.target.closest('[data-action="save-max-plan-editor"]');
    if (savePlan) {
      saveMaxPlanEditorSheet().catch(err => console.warn('[saveMaxPlanEditorSheet]:', err));
      return;
    }
    const weekBtn = e.target.closest('[data-plan-weeks]');
    if (weekBtn) {
      const value = Number(weekBtn.getAttribute('data-plan-weeks')) || 6;
      const hidden = document.getElementById('max-plan-weeks-value');
      if (hidden) hidden.value = String(value);
      sheet.querySelectorAll('[data-plan-weeks]').forEach(btn => btn.classList.toggle('on', btn === weekBtn));
      return;
    }
    const createGym = e.target.closest('[data-action="create-max-gym"]');
    if (createGym) {
      createMaxGymFromPlanSheet().catch(err => console.warn('[createMaxGymFromPlanSheet]:', err));
      return;
    }
    const addBenchmark = e.target.closest('[data-action="add-max-benchmark"]');
    if (addBenchmark) {
      addMaxBenchmarkEditorRow();
      return;
    }
    const deleteBenchmark = e.target.closest('[data-action="delete-max-benchmark"]');
    if (deleteBenchmark) {
      deleteBenchmark.closest('.wt-v4-bench-edit')?.remove();
      return;
    }
    const pool = e.target.closest('[data-action="open-equipment-pool"]');
    if (pool) {
      openMaxEquipmentPoolModal().catch(err => console.warn('[openMaxEquipmentPoolModal]:', err));
      return;
    }
    const adj = e.target.closest('[data-adjust-sheet]');
    if (adj) {
      adjustMaxBenchmarkWeight(adj.getAttribute('data-benchmark-id'), Number(adj.getAttribute('data-delta')) || 0)
        .then(() => openMaxAdjustSheet(adj.getAttribute('data-benchmark-id')))
        .catch(err => console.warn('[sheet.adjust]:', err));
      return;
    }
    const saveAdjust = e.target.closest('[data-action="save-max-adjust-kg"]');
    if (saveAdjust) {
      const benchmarkId = saveAdjust.getAttribute('data-benchmark-id');
      const input = document.getElementById('max-adjust-kg-input');
      setMaxBenchmarkWeight(benchmarkId, input?.value)
        .then(() => closeMaxV4Sheet())
        .catch(err => console.warn('[saveMaxAdjustKg]:', err));
      return;
    }
    const addEquipment = e.target.closest('[data-action="add-max-equipment"]');
    if (addEquipment) {
      addMaxEquipmentFromPoolModal().catch(err => console.warn('[addMaxEquipmentFromPoolModal]:', err));
      return;
    }
    const togglePool = e.target.closest('[data-action="toggle-max-pool"]');
    if (togglePool) {
      toggleMaxPoolItem(togglePool.getAttribute('data-pool-id'), togglePool.checked)
        .catch(err => console.warn('[toggleMaxPoolItem]:', err));
      return;
    }
    const deleteEquipment = e.target.closest('[data-action="delete-max-equipment"]');
    if (deleteEquipment) {
      deleteMaxEquipmentFromPool(deleteEquipment.getAttribute('data-pool-id'))
        .catch(err => console.warn('[deleteMaxEquipmentFromPool]:', err));
    }
  });
  sheet.addEventListener('change', (e) => {
    const gymSelect = e.target.closest('#max-plan-gym-id');
    if (gymSelect) {
      const gymId = gymSelect.value || null;
      if (S?.workout) S.workout.currentGymId = gymId;
      saveExpertPreset({ currentGymId: gymId, mode: 'max', enabled: true })
        .catch(err => console.warn('[maxPlan.gym.change]:', err));
    }
  });
  return sheet;
}

function _ensureMaxPlanSaveBinding(sheet) {
  if (!sheet || sheet.dataset.maxPlanSaveBound === '1') return;
  sheet.dataset.maxPlanSaveBound = '1';
  sheet.addEventListener('click', (e) => {
    const savePlan = e.target.closest('[data-action="save-max-plan-editor"]');
    if (!savePlan) return;
    e.preventDefault();
    e.stopPropagation();
    saveMaxPlanEditorSheet().catch(err => console.warn('[saveMaxPlanEditorSheet.bound]:', err));
  }, true);
}

export function closeMaxV4Sheet() {
  document.getElementById('max-v4-sheet')?.classList.remove('open');
}

export function openMaxCycleBoardSheet() {
  const cycle = _cycleOrDraft();
  const el = _ensureMaxV4Sheet();
  const body = document.getElementById('max-v4-sheet-body');
  if (body) body.innerHTML = renderMaxCycleBoard({
    cycle,
    cache: getCache(),
    exList: getExList(),
    todayKey: _todayKey(),
  });
  el.classList.add('open');
}

export function openMaxPlanEditorSheet() {
  const cycle = _cycleOrDraft();
  const el = _ensureMaxV4Sheet();
  const body = document.getElementById('max-v4-sheet-body');
  if (body) body.innerHTML = renderMaxPlanEditor({
    cycle,
    gyms: getGyms(),
    currentGymId: S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null,
    movements: _movementsForPlanEditor(),
  });
  el.classList.add('open');
}

function _selectedMovement(movementId) {
  return MOVEMENTS.find(m => m.id === movementId) || null;
}

function _benchmarkFromMovement(movementId) {
  const mov = _selectedMovement(movementId) || MOVEMENTS[0] || null;
  const major = _normalizeMaxMajor(mov?.primary) || 'chest';
  const step = Number(mov?.stepKg) > 0 ? Number(mov.stepKg) : 2.5;
  const startKg = major === 'lower' ? 100 : (major === 'back' ? 60 : (major === 'shoulder' ? 25 : 40));
  return {
    id: `bm_${major}_${movementId || Date.now()}_${Date.now()}`,
    movementId: mov?.id || null,
    label: mov?.nameKo || mov?.id || '벤치마크',
    primaryMajor: major,
    startKg,
    targetKg: startKg + (major === 'lower' || major === 'glute' ? 5 : 2.5),
    incrementKg: step,
    tracks: {
      M: { startKg, targetKg: startKg + (major === 'lower' || major === 'glute' ? 5 : 2.5), incrementKg: step, startReps: 12, targetReps: 12, enabled: true },
      H: { startKg: startKg + step * 2, targetKg: startKg + step * 2 + (major === 'lower' || major === 'glute' ? 5 : 2.5), incrementKg: step, startReps: 8, targetReps: 6, enabled: true },
    },
  };
}

function addMaxBenchmarkEditorRow() {
  const current = normalizeMaxCycleTracks(_cycleOrDraft()) || {};
  const used = new Set(Array.from(document.querySelectorAll('#max-v4-sheet .wt-v4-bench-edit select[data-bench-field="movementId"]')).map(el => el.value));
  const mov = MOVEMENTS.find(m => !used.has(m.id)) || MOVEMENTS[0];
  if (!mov) {
    _toast('추가할 종목 후보가 없어요', 'warning');
    return;
  }
  const next = { ...current, benchmarks: [...(current.benchmarks || []), _benchmarkFromMovement(mov.id)] };
  const body = document.getElementById('max-v4-sheet-body');
  if (body) body.innerHTML = renderMaxPlanEditor({
    cycle: next,
    gyms: getGyms(),
    currentGymId: S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null,
    movements: _movementsForPlanEditor(),
  });
}

export async function saveMaxPlanEditorSheet() {
  const current = normalizeMaxCycleTracks(_cycleOrDraft());
  const nextBenchmarks = Array.from(document.querySelectorAll('#max-v4-sheet .wt-v4-bench-edit')).map(row => {
    const id = row.getAttribute('data-benchmark-id');
    const original = (current.benchmarks || []).find(b => b.id === id) || {};
    const movementId = row.querySelector('[data-bench-field="movementId"]')?.value || original.movementId || null;
    const mov = _selectedMovement(movementId);
    const originalM = original.tracks?.M || {};
    const tracks = {};
    for (const track of ['M', 'H']) {
      const base = original.tracks?.[track] || originalM;
      const q = `[data-bench-track="${track}"]`;
      const startKg = Math.max(0, Number(row.querySelector(`${q}[data-bench-field="startKg"]`)?.value) || Number(base.startKg) || 0);
      const targetKg = Math.max(0, Number(row.querySelector(`${q}[data-bench-field="targetKg"]`)?.value) || Number(base.targetKg) || startKg);
      const targetReps = Math.max(1, Number(row.querySelector(`${q}[data-bench-field="targetReps"]`)?.value) || Number(base.targetReps) || (track === 'H' ? 6 : 12));
      const enabled = row.querySelector(`${q}[data-bench-field="enabled"]`)?.checked !== false;
      const incrementKg = Math.max(0.5, Number(base.incrementKg) || Number(original.incrementKg) || 2.5);
      tracks[track] = { ...base, startKg: Math.round(startKg * 10) / 10, targetKg: Math.round(targetKg * 10) / 10, targetReps, incrementKg, enabled };
    }
    return {
      ...original,
      id: original.id || `bm_${mov?.primary || 'custom'}_${movementId || Date.now()}`,
      movementId,
      label: mov?.nameKo || original.label || movementId || '벤치마크',
      primaryMajor: mov?.primary || original.primaryMajor || 'chest',
      startKg: tracks.M.startKg,
      targetKg: tracks.M.targetKg,
      incrementKg: tracks.M.incrementKg,
      tracks,
    };
  });
  const gymId = document.getElementById('max-plan-gym-id')?.value || null;
  const weeks = Math.max(4, Math.min(12, Number(document.getElementById('max-plan-weeks-value')?.value) || Number(current.weeks) || 6));
  const next = {
    ...current,
    status: current.status === 'draft' ? 'active' : current.status,
    weeks,
    primaryGymId: gymId,
    benchmarks: nextBenchmarks,
    updatedAt: Date.now(),
  };
  if (S?.workout) S.workout.currentGymId = gymId;
  await saveExpertPreset({ currentGymId: gymId, maxCycle: next, mode: 'max', enabled: true });
  await _saveMaxCycleSafe(next);
  closeMaxV4Sheet();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
  _toast('계획 조정이 저장됐어요', 'success');
}

export async function createMaxGymFromPlanSheet() {
  const input = document.getElementById('max-plan-new-gym-name');
  const name = String(input?.value || '').trim();
  if (!name) {
    _toast('헬스장 이름을 입력하세요', 'warning');
    return;
  }
  const gym = await saveGym({ name });
  if (S?.workout) S.workout.currentGymId = gym.id;
  await saveExpertPreset({ currentGymId: gym.id, mode: 'max', enabled: true });
  _toast(`${gym.name} 추가 완료`, 'success');
  openMaxPlanEditorSheet();
}

export function openMaxAdjustSheet(benchmarkId) {
  const cycle = _cycleOrDraft();
  const todayKey = _todayKey();
  const snapshot = buildRenderedMaxCycleSnapshot({ cycle, cache: getCache(), exList: getExList(), todayKey });
  const row = (snapshot?.benchmarks || []).find(b => b.id === benchmarkId);
  const base = _findCycleBenchmark(cycle, benchmarkId);
  if (!row || !base) return;
  const override = cycle.todayOverrides?.[todayKey]?.[benchmarkId];
  const trackKey = `${benchmarkId}:${snapshot.track || 'M'}`;
  const trackOverride = cycle.todayOverrides?.[todayKey]?.[trackKey] || override;
  const kg = Number(trackOverride?.kg) || row.planned.plannedKg;
  const step = Number(row.planned?.incrementKg) || Number(row.incrementKg) || 2.5;
  const el = _ensureMaxV4Sheet();
  const body = document.getElementById('max-v4-sheet-body');
  if (body) body.innerHTML = `
    <div class="wt-v4-adjust">
      <div class="wt-v4-modal-head">
        <div>
          <strong>${_esc(row.label)}</strong>
        <span>${_esc(MAJOR_LABEL[row.primaryMajor] || row.primaryMajor)} · ${snapshot.track === 'H' ? '강도' : '볼륨'} 계획 ${row.planned.plannedKg}kg</span>
        </div>
        <button type="button" class="wt-v4-icon" data-action="close-max-sheet">×</button>
      </div>
      <div class="wt-v4-adjust-num">${_esc(kg)}<small>kg</small></div>
      <label class="wt-v4-adjust-input">
        <span>직접 입력</span>
        <input id="max-adjust-kg-input"
               type="number"
               min="0"
               max="500"
               step="${_esc(step)}"
               value="${_esc(kg)}"
               inputmode="decimal"
               aria-label="오늘 벤치마크 중량">
        <small>kg</small>
      </label>
      <div class="wt-v4-adjust-steps">
        <button type="button" data-adjust-sheet data-benchmark-id="${_esc(benchmarkId)}" data-delta="-${step * 2}">-${step * 2}<small>kg</small></button>
        <button type="button" data-adjust-sheet data-benchmark-id="${_esc(benchmarkId)}" data-delta="-${step}">-${step}<small>kg</small></button>
        <button type="button" data-adjust-sheet data-benchmark-id="${_esc(benchmarkId)}" data-delta="${step}">+${step}<small>kg</small></button>
        <button type="button" data-adjust-sheet data-benchmark-id="${_esc(benchmarkId)}" data-delta="${step * 2}">+${step * 2}<small>kg</small></button>
      </div>
      <div class="wt-v4-anchor">
        <span>지난 성공 ${row.latest?.kg || base.startKg}kg</span>
        <b>오늘 ${_esc(kg)}kg</b>
        <span>6주 목표 ${base.targetKg}kg</span>
      </div>
      <div class="wt-v4-scope">
        <button type="button" class="on">이번만</button>
        <button type="button">다음 주부터 반영</button>
      </div>
      <p class="wt-v4-adjust-impact">${_esc(kg > row.planned.plannedKg ? `계획보다 +${Math.round((kg - row.planned.plannedKg) * 10) / 10}kg. 성공하면 다음 주 목표를 앞당깁니다.` : (kg < row.planned.plannedKg ? `계획보다 ${Math.round((kg - row.planned.plannedKg) * 10) / 10}kg. 오늘만 낮추고 다음 주는 원래 계획을 유지합니다.` : '계획값입니다. 오늘 성공하면 다음 주도 예정대로 진행합니다.'))}</p>
      <div class="wt-v4-sheet-actions">
        <button type="button" data-action="close-max-sheet">원래대로</button>
        <button type="button" class="primary" data-action="save-max-adjust-kg" data-benchmark-id="${_esc(benchmarkId)}">확정</button>
      </div>
    </div>
  `;
  el.classList.add('open');
}

export async function settleMaxCycle() {
  const cycle = _getMaxCycleSafe();
  if (!cycle) {
    _toast('먼저 6주 성장판을 시작하세요', 'warning');
    return;
  }
  const snapshot = buildRenderedMaxCycleSnapshot({
    cycle,
    cache: getCache(),
    exList: getExList(),
    todayKey: _todayKey(),
  });
  const nextBenchmarks = (snapshot?.benchmarks || []).map(b => ({
    id: b.id,
    movementId: b.movementId,
    label: b.label,
    primaryMajor: b.primaryMajor,
    tracks: b.tracks || ['M', 'H'],
    startKg: b.latest?.kg || b.planned?.plannedKg || b.startKg,
    startReps: b.latest?.reps || b.startReps || 12,
    targetKg: (b.latest?.kg || b.planned?.plannedKg || b.startKg || 0) + (b.primaryMajor === 'lower' || b.primaryMajor === 'glute' ? 5 : 2.5),
    targetReps: b.targetReps || 12,
    incrementKg: b.incrementKg || 2.5,
  }));
  const completed = { ...cycle, status: 'completed', completedAt: Date.now() };
  await _saveMaxCycleSafe({
    ...completed,
    nextSeed: {
      framework: 'dual_track_progression_v2',
      weeks: 6,
      benchmarks: nextBenchmarks,
      seededAt: Date.now(),
    },
  });
  _toast('사이클을 정산했어요. 다음 사이클 시드가 준비됐습니다.', 'success');
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

function _ensureMaxEquipmentPoolModal() {
  let el = document.getElementById('max-equipment-pool-modal');
  if (el) return el;
  const container = document.getElementById('modals-container') || document.body;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-overlay wt-max-equipment-modal" id="max-equipment-pool-modal" onclick="closeMaxEquipmentPoolModal(event)">
      <div class="wt-max-blueprint-sheet" onclick="event.stopPropagation()">
        <div class="wt-max-blueprint-head">
          <div>
            <div class="wt-max-blueprint-title">공통/헬스장별 기구</div>
            <div class="wt-max-blueprint-sub">테스트모드는 선택 헬스장의 활성 기구와 공통 모듈만 추천 후보로 씁니다.</div>
          </div>
          <button type="button" class="wt-max-blueprint-close" onclick="closeMaxEquipmentPoolModal()">×</button>
        </div>
        <div id="max-equipment-pool-body"></div>
      </div>
    </div>
  `;
  container.appendChild(wrapper.firstElementChild);
  el = document.getElementById('max-equipment-pool-modal');
  el.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-action="toggle-max-pool"]');
    if (toggle) {
      toggleMaxPoolItem(toggle.getAttribute('data-pool-id'), toggle.checked)
        .catch(err => console.warn('[toggleMaxPoolItem]:', err));
    }
  });
  el.addEventListener('click', (e) => {
    const add = e.target.closest('[data-action="add-max-equipment"]');
    if (add) {
      addMaxEquipmentFromPoolModal().catch(err => console.warn('[addMaxEquipmentFromPoolModal]:', err));
      return;
    }
    const del = e.target.closest('[data-action="delete-max-equipment"]');
    if (del) {
      deleteMaxEquipmentFromPool(del.getAttribute('data-pool-id'))
        .catch(err => console.warn('[deleteMaxEquipmentFromPool]:', err));
    }
  });
  return el;
}

export async function openMaxEquipmentPoolModal() {
  const el = _ensureMaxEquipmentPoolModal();
  const body = document.getElementById('max-equipment-pool-body');
  const selectedGymId = document.getElementById('max-plan-gym-id')?.value || null;
  const gymId = selectedGymId || S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null;
  if (selectedGymId && S?.workout) S.workout.currentGymId = selectedGymId;
  if (selectedGymId) await saveExpertPreset({ currentGymId: selectedGymId, mode: 'max', enabled: true });
  const gym = (getGyms() || []).find(g => g.id === gymId) || null;
  let active = [];
  let globalPool = [];
  let gymItems = [];
  try {
    const pool = await import('../../data/data-equipment-pool.js');
    active = typeof pool.getActiveEquipmentForGym === 'function' ? pool.getActiveEquipmentForGym(gymId) : [];
    globalPool = typeof pool.getGlobalEquipmentPool === 'function' ? pool.getGlobalEquipmentPool() : [];
    gymItems = typeof pool.getGymExclusiveEquipment === 'function' ? pool.getGymExclusiveEquipment(gymId) : [];
  } catch (err) {
    console.warn('[openMaxEquipmentPoolModal.pool]:', err);
  }
  const activeIds = new Set(active.map(item => item.id));
  body.innerHTML = `
    <div class="wt-max-equipment-summary">
      <b>${_esc(gym?.name || '헬스장 미선택')}</b>
      <span>활성 ${active.length}개 · 전용 ${gymItems.length}개</span>
    </div>
    <div class="wt-max-equipment-group">
      <div class="wt-max-equipment-title">공통 모듈</div>
      ${(globalPool.length ? globalPool : []).map(item => `
        <label class="wt-max-equipment-row wt-max-equipment-toggle">
          <span>${_esc(item.name)}</span>
          <small>${_esc(item.category)}</small>
          <input type="checkbox" data-action="toggle-max-pool" data-pool-id="${_esc(item.id)}" ${activeIds.has(item.id) ? 'checked' : ''} ${gym ? '' : 'disabled'}>
        </label>
      `).join('') || '<div class="wt-max-equipment-empty">공통 모듈이 없어요.</div>'}
    </div>
    <div class="wt-max-equipment-group">
      <div class="wt-max-equipment-title">헬스장 전용</div>
      <div class="wt-max-equipment-create">
        <input id="max-equipment-name" type="text" placeholder="기구 이름">
        <select id="max-equipment-category">
          <option value="machine">머신</option>
          <option value="cable">케이블</option>
          <option value="smith">스미스</option>
          <option value="barbell">바벨</option>
          <option value="dumbbell">덤벨</option>
          <option value="bodyweight">맨몸</option>
        </select>
        <button type="button" data-action="add-max-equipment" ${gym ? '' : 'disabled'}>추가</button>
      </div>
      ${(gymItems.length ? gymItems : []).map(item => `
        <div class="wt-max-equipment-row">
          <span>${_esc(item.name)}</span>
          <small>${_esc(item.category)}</small>
          <button type="button" data-action="delete-max-equipment" data-pool-id="${_esc(item.id)}">삭제</button>
        </div>
      `).join('') || '<div class="wt-max-equipment-empty">이 헬스장 전용 기구가 아직 없어요.</div>'}
    </div>
    <div class="wt-max-plan-note">${gym ? '공통 모듈은 이 헬스장에서 쓸 것만 켜고, 전용 기구는 아래에서 추가하세요.' : '먼저 계획 조정에서 헬스장을 선택하거나 새로 추가하세요.'}</div>
  `;
  el.classList.add('open');
}

export async function toggleMaxPoolItem(poolId, enabled) {
  const gymId = S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null;
  if (!gymId || !poolId) {
    _toast('헬스장을 먼저 선택하세요', 'warning');
    return;
  }
  const pool = await import('../../data/data-equipment-pool.js');
  await pool.toggleGymPool(gymId, poolId, !!enabled);
  _toast(enabled ? '공통 기구를 켰어요' : '공통 기구를 껐어요', 'success');
  openMaxEquipmentPoolModal();
}

export async function addMaxEquipmentFromPoolModal() {
  const gymId = S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null;
  if (!gymId) {
    _toast('헬스장을 먼저 선택하세요', 'warning');
    return;
  }
  const name = String(document.getElementById('max-equipment-name')?.value || '').trim();
  const category = document.getElementById('max-equipment-category')?.value || 'machine';
  if (!name) {
    _toast('기구 이름을 입력하세요', 'warning');
    return;
  }
  const pool = await import('../../data/data-equipment-pool.js');
  await pool.createGymExclusive(gymId, { name, category, movementIds: [] });
  _toast(`${name} 추가 완료`, 'success');
  openMaxEquipmentPoolModal();
}

export async function deleteMaxEquipmentFromPool(poolId) {
  if (!poolId) return;
  if (!window.confirm('이 헬스장 전용 기구를 삭제할까요? 삭제하면 이 기구는 추천 후보에서 빠집니다.')) return;
  const pool = await import('../../data/data-equipment-pool.js');
  await pool.deleteEquipment(poolId);
  _toast('기구를 삭제했어요', 'success');
  openMaxEquipmentPoolModal();
}

export function closeMaxEquipmentPoolModal(event) {
  if (event && event.target?.id !== 'max-equipment-pool-modal') return;
  const el = document.getElementById('max-equipment-pool-modal');
  if (el) el.classList.remove('open');
}

// ── 추천 칩 클릭 → 오늘 세션에 종목 추가 ────────────────────────
export async function applyMaxSuggestion(movementId, weakPart = null, recMeta = {}) {
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
      const sharedGym = ['barbell', 'dumbbell', 'bodyweight'].includes(mov.equipment_category);
      const currentGymId = S?.workout?.currentGymId || getExpertPreset()?.currentGymId || null;
      await saveExercise({
        id: exId,
        muscleId: mov.primary,
        name: mov.nameKo,
        movementId: mov.id,
        brand: '', machineType: '',
        maxWeightKg: null,
        incrementKg: mov.stepKg || 2.5,
        weightUnit: 'kg',
        gymId: sharedGym ? null : currentGymId,
        gymTags: sharedGym ? ['*'] : (currentGymId ? [currentGymId] : ['*']),
        primaryGymId: sharedGym ? null : currentGymId,
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
  const recommendationId = _buildRecommendationId(recMeta.kind || (weakPart ? 'weak_focus' : 'starter'), mov.id, weakPart || mov.subPattern);
  const activeCycle = _getMaxCycleSafe();
  const cycleSnapshot = activeCycle ? buildRenderedMaxCycleSnapshot({
    cycle: activeCycle,
    cache: getCache(),
    exList: getExList(),
    todayKey: _todayKey(),
  }) : null;
  let prescription = _applyFrameworkPrescription(buildMaxPrescription({
    cache: getCache(),
    exList: getExList(),
    movement: mov,
    exerciseId: exId,
    todayKey: _todayKey(),
    sessionType: meta.sessionType,
    weakTarget: !!weakPart,
  }), mov, { weakTarget: !!weakPart });
  prescription = _applyPrescriptionOverride(prescription, recMeta.override);
  S.workout.exercises.push({
    exerciseId: exId,
    muscleId: mov.primary,
    name: mov.nameKo,
    movementId: mov.id,
    recommendationMeta: {
      mode: 'max',
      id: recommendationId,
      kind: recMeta.kind || (weakPart ? 'weak_focus' : 'starter'),
      reason: recMeta.reason || '',
      userAction: recMeta.modified ? 'modified' : 'accepted',
      acceptedAt: Date.now(),
      primaryMajor: _movementMajor(mov),
      subPattern: weakPart || mov.subPattern || null,
      cycleId: activeCycle?.id || null,
      cycleWeek: cycleSnapshot?.weekIndex || null,
      track: cycleSnapshot?.track || (meta.sessionType === 'heavy_volume' ? 'H' : 'M'),
      gymScope: { sessionGymId: S.workout.currentGymId || null, tag: ['barbell', 'dumbbell', 'bodyweight'].includes(mov.equipment_category) ? '*' : (S.workout.currentGymId || '*') },
    },
    gymTagAtTime: ['barbell', 'dumbbell', 'bodyweight'].includes(mov.equipment_category) ? '*' : (S.workout.currentGymId || '*'),
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

export function rejectMaxSuggestion(recId, movementId = '') {
  const meta = _ensureMaxMeta();
  if (!Array.isArray(meta.rejectedRecommendations)) meta.rejectedRecommendations = [];
  const id = recId || _buildRecommendationId('unknown', movementId || 'unknown');
  if (!meta.rejectedRecommendations.includes(id)) meta.rejectedRecommendations.push(id);
  meta.rejectedRecommendations = meta.rejectedRecommendations.slice(-30);
  _saveMaxMetaSoon();
  _toast('이번 세션 추천에서 제외했어요', 'info');
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

function _ensureMaxBlueprintModal() {
  let el = document.getElementById('max-blueprint-modal');
  if (el) return el;
  const container = document.getElementById('modals-container') || document.body;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="modal-overlay" id="max-blueprint-modal" onclick="closeMaxBlueprintModal(event)">
      <div class="wt-max-blueprint-sheet" onclick="event.stopPropagation()">
        <div class="wt-max-blueprint-head">
          <div>
            <div class="wt-max-blueprint-title">테스트모드 청사진</div>
            <div class="wt-max-blueprint-sub">6주 성장판, 프레임워크, 부위별 주간 세트 목표를 저장합니다.</div>
          </div>
          <button type="button" class="wt-max-blueprint-close" onclick="closeMaxBlueprintModal()">×</button>
        </div>
        <div id="max-blueprint-body"></div>
      </div>
    </div>
  `;
  container.appendChild(wrapper.firstElementChild);
  return document.getElementById('max-blueprint-modal');
}

export function openMaxBlueprintModal() {
  const el = _ensureMaxBlueprintModal();
  const body = document.getElementById('max-blueprint-body');
  const plan = _getMaxPlan();
  const frameworkOptions = Object.entries(MAX_FRAMEWORKS).map(([value, meta]) =>
    `<option value="${_esc(value)}" ${plan.framework === value ? 'selected' : ''}>${_esc(meta.label)}</option>`
  ).join('');
  const targetRows = MAJOR_PARTS.map(part => `
    <label class="wt-max-blueprint-target">
      <span>${_esc(part.label)}</span>
      <input id="max-plan-target-${_esc(part.id)}" type="number" min="0" max="30" step="1" value="${Number(plan.targetSetsByMajor?.[part.id]) || MAX_DEFAULT_TARGET_SETS[part.id] || 8}">
    </label>
  `).join('');
  body.innerHTML = `
    <div class="wt-max-blueprint-grid">
      <label class="wt-max-blueprint-field">
        <span>프레임워크</span>
        <select id="max-plan-framework">${frameworkOptions}</select>
      </label>
      <label class="wt-max-blueprint-field">
        <span>시작일</span>
        <input id="max-plan-start" type="date" value="${_esc(plan.startDate || _todayDateInputValue())}">
      </label>
      <label class="wt-max-blueprint-field">
        <span>기간(주)</span>
        <input id="max-plan-weeks" type="number" min="4" max="12" step="1" value="${Number(plan.weeks) || 8}">
      </label>
      <label class="wt-max-blueprint-field">
        <span>주당 세션</span>
        <input id="max-plan-sessions" type="number" min="2" max="7" step="1" value="${Number(plan.sessionsPerWeek) || 5}">
      </label>
      <label class="wt-max-blueprint-field">
        <span>디로드 주차</span>
        <input id="max-plan-deload" type="number" min="4" max="12" step="1" value="${Number(plan.deloadWeek) || 8}">
      </label>
    </div>
    <div class="wt-max-blueprint-section">
      <div class="wt-max-blueprint-section-title">부위별 주간 목표 세트</div>
      <div class="wt-max-blueprint-targets">${targetRows}</div>
    </div>
    <div class="wt-max-blueprint-section">
      <div class="wt-max-blueprint-section-title">5/3/1 Training Max</div>
      <div class="wt-max-blueprint-grid">
        ${[
          ['bench', '벤치'],
          ['squat', '스쿼트'],
          ['deadlift', '데드'],
          ['ohp', 'OHP'],
        ].map(([key, label]) => `
          <label class="wt-max-blueprint-field">
            <span>${label}</span>
            <input id="max-plan-lift-${key}" type="number" min="0" max="400" step="2.5" value="${Number(plan.lifts?.[key]?.tm) || ''}" placeholder="kg">
          </label>
        `).join('')}
      </div>
    </div>
    <div class="wt-max-blueprint-actions">
      <button type="button" class="wt-max-rec-secondary" onclick="closeMaxBlueprintModal()">취소</button>
      <button type="button" class="wt-max-rec-accept" onclick="saveMaxBlueprintModal()">저장</button>
    </div>
  `;
  el.classList.add('open');
}

export function closeMaxBlueprintModal(e) {
  if (e && e.target !== document.getElementById('max-blueprint-modal')) return;
  document.getElementById('max-blueprint-modal')?.classList.remove('open');
}

export async function saveMaxBlueprintModal() {
  const current = _getMaxPlan();
  const targetSetsByMajor = {};
  for (const part of MAJOR_PARTS) {
    const v = Number(document.getElementById(`max-plan-target-${part.id}`)?.value) || 0;
    targetSetsByMajor[part.id] = Math.max(0, Math.min(30, Math.round(v)));
  }
  const lifts = {};
  for (const key of ['bench', 'squat', 'deadlift', 'ohp']) {
    lifts[key] = { tm: Math.max(0, Number(document.getElementById(`max-plan-lift-${key}`)?.value) || 0) };
  }
  const weeks = Math.max(4, Math.min(12, Number(document.getElementById('max-plan-weeks')?.value) || 6));
  const plan = {
    ...current,
    framework: document.getElementById('max-plan-framework')?.value || 'dual_track_progression_v2',
    startDate: document.getElementById('max-plan-start')?.value || _weekStartKey(_todayKey()),
    weeks,
    sessionsPerWeek: Math.max(2, Math.min(7, Number(document.getElementById('max-plan-sessions')?.value) || 5)),
    deloadWeek: Math.max(4, Math.min(weeks, Number(document.getElementById('max-plan-deload')?.value) || weeks)),
    targetSetsByMajor,
    lifts,
    updatedAt: Date.now(),
  };
  try {
    await saveExpertPreset({ maxPlan: plan, mode: 'max', enabled: true });
    closeMaxBlueprintModal();
    if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
    _toast('테스트모드 청사진 저장 완료', 'success');
  } catch (err) {
    console.warn('[saveMaxBlueprintModal]:', err);
    _toast('청사진 저장 실패', 'error');
  }
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
  meta.selectedMajors = [partId];
  meta.majorGateOpen = false;
  meta.selectedWeakParts = _filterWeakPartsByMajors(meta.selectedWeakParts, meta.selectedMajors);
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export function toggleMaxMajorPart(partId) {
  if (!partId || !MAJOR_LABEL[partId]) return;
  const meta = _ensureMaxMeta();
  const set = new Set(Array.isArray(meta.selectedMajors)
    ? meta.selectedMajors.map(_normalizeMaxMajor).filter(Boolean)
    : []);
  if (set.has(partId)) set.delete(partId);
  else set.add(partId);
  meta.selectedMajors = [...set];
  meta.majorGateOpen = true;
  meta.selectedWeakParts = _filterWeakPartsByMajors(meta.selectedWeakParts, meta.selectedMajors);
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export function confirmMaxMajorParts() {
  const meta = _ensureMaxMeta();
  if (!Array.isArray(meta.selectedMajors) || !meta.selectedMajors.length) {
    _toast('오늘 할 부위를 하나 이상 선택하세요', 'warning');
    return;
  }
  meta.majorGateOpen = false;
  _saveMaxMetaSoon();
  if (typeof window.renderExpertTopArea === 'function') window.renderExpertTopArea();
}

export function clearMaxMajorPart() {
  const meta = _ensureMaxMeta();
  meta.selectedMajors = [];
  meta.majorGateOpen = true;
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
          maxPlan: _defaultMaxPlan(_todayKey()),
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
          maxPlan: _defaultMaxPlan(_todayKey()),
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
