// ================================================================
// workout/expert/onboarding.js
// ----------------------------------------------------------------
// 전문가 모드 8-scene wizard + 리뷰 + 완료 화면.
// R3b 리팩토링으로 workout/expert.js 에서 분리 (lines 623-1982).
//
// 외부 의존:
//   - data.js : getExpertPreset/saveExpertPreset, gym CRUD, exercise CRUD,
//               getMuscleParts, dateKey, TODAY
//   - config.js : MOVEMENTS
//   - ai.js : parseEquipmentFromText/Image (Scene 07 파싱)
//   - state.js : S (workout 상태 — currentGymId 동기화)
//
// 내부 상태는 _obState 로 모듈 scope 에 보관. expertOnbOpen 호출 시 reset.
// Shared helpers(_openModal/_closeModal/_esc/_toast/_subPatternLabel) 은
// expert.js 와 중복 정의 — 크기 작고 양쪽 독립이라 ES 순환 import 회피 목적.
// ================================================================

import {
  getExpertPreset, saveExpertPreset,
  saveGym, getGyms, saveExercise, deleteExercise, getGymExList,
  getMuscleParts,
  dateKey, TODAY,
} from '../../data.js';
import { MOVEMENTS } from '../../config.js';
import { parseEquipmentFromText, parseEquipmentFromImage } from '../../ai.js';
import { S } from '../state.js';

// ── Onboarding 내부 state ────────────────────────────────────────
// phase: 'wizard' (step 1~5) | 'review' (파싱 리뷰) | 'done' (완료)
// draftGymId: 드래프트 DB 저장 시 발급받은 gymId.
const _obState = {
  phase: 'wizard',
  step: 1,
  startStep: 1,
  goal: null,
  daysPerWeek: 4,
  sessionMinutes: 60,
  preferMuscles: new Set(),
  avoidMuscles: new Set(),
  forbiddenMovements: [],
  preferredRpe: '7-8',
  gymName: '',
  equipmentRaw: '',
  parsed: [],
  editing: new Set(),
  activeEntryTab: 'text',
  pendingImageBase64: null,
  draftGymId: null,
};

function _resetOnboardingState() {
  _obState.phase = 'wizard';
  _obState.step = 1;
  _obState.startStep = 1;
  _obState.goal = null;
  _obState.daysPerWeek = 4;
  _obState.sessionMinutes = 60;
  _obState.preferMuscles = new Set();
  _obState.avoidMuscles = new Set();
  _obState.forbiddenMovements = [];
  _obState.preferredRpe = '7-8';
  _obState.gymName = '';
  _obState.equipmentRaw = '';
  _obState.parsed = [];
  _obState.editing = new Set();
  _obState.activeEntryTab = 'text';
  _obState.pendingImageBase64 = null;
  _obState.draftGymId = null;
}

// ── Modal 컨트롤 (expert.js 중복) ─────────────────────────────────
function _openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
}
function _closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active');
}

// ── 공용 소규모 헬퍼 (expert.js 중복) ───────────────────────────────
function _esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function _toast(msg, type='info') {
  if (typeof window.showToast === 'function') window.showToast(msg, 2200, type);
}

// subPattern(세부 부위) → 한글 라벨. expert.js 의 _subPatternLabel 과 동일.
function _subPatternLabel(sp) {
  return ({
    back_width:'등 넓이', back_thickness:'등 두께', posterior:'후면사슬',
    chest_upper:'가슴 상부', chest_mid:'가슴 중부', chest_lower:'가슴 하부',
    shoulder_front:'어깨 전면', shoulder_side:'어깨 측면', rear_delt:'어깨 후면',
    traps:'승모', quad:'대퇴사두', hamstring:'햄스트링', glute:'둔근', calf:'종아리',
    bicep:'이두', tricep:'삼두', core:'코어',
  }[sp] || sp);
}

// 헬스장 전환 후 S.workout.currentGymId 동기화 (expert.js 에서도 사용).
// resolveCurrentGymId 자체도 export 됨 — expert.js 상단 `import { resolveCurrentGymId }`
// 로 받아 기존 `_resolveCurrentGymId` alias 와 동일 역할.
export function resolveCurrentGymId() {
  const preset = getExpertPreset();
  const gyms = getGyms();
  let resolvedId = null;
  if (preset.currentGymId) {
    if (gyms.some(g => g.id === preset.currentGymId)) {
      resolvedId = preset.currentGymId;
    } else {
      resolvedId = gyms.length > 0 ? gyms[0].id : null;
      saveExpertPreset({ currentGymId: resolvedId }).catch(() => {});
      if (resolvedId) _toast('이전 헬스장을 찾을 수 없어 자동 전환했어요.', 'warning');
    }
  } else {
    resolvedId = gyms.length > 0 ? gyms[0].id : null;
  }
  if (S.workout.currentGymId !== resolvedId) S.workout.currentGymId = resolvedId;
  return resolvedId;
}

// renderExpertTopArea 는 expert.js 가 window.renderExpertTopArea 로 등록 — 호출은 window 경유.
// 이렇게 하면 onboarding.js ↔ expert.js 순환 import 없이 전 파일 간 래퍼-호출 가능.

export async function expertOnbOpen() {
  _resetOnboardingState();
  _obState.step = 1;

  // Phase 2: 드래프트 감지 + 복원
  // preset.draftGymId가 있고 그 gym이 존재하면 → _obState를 복원 후 Review로 직행
  const preset = getExpertPreset();
  if (preset.draftGymId) {
    const gym = getGyms().find(g => g.id === preset.draftGymId);
    if (gym) {
      // wizard preset값 복원
      _obState.goal = preset.goal;
      _obState.daysPerWeek = preset.daysPerWeek || 4;
      _obState.sessionMinutes = preset.sessionMinutes || 60;
      _obState.preferMuscles = new Set(preset.preferMuscles || []);
      _obState.avoidMuscles = new Set(preset.avoidMuscles || []);
      _obState.forbiddenMovements = preset.forbiddenMovements || [];
      _obState.preferredRpe = preset.preferredRpe || '7-8';
      _obState.gymName = gym.name;
      _obState.draftGymId = gym.id;
      // 저장된 기구 로드 → _obState.parsed로 복원 (dbId 유지)
      // 2026-04-19: muscleIds 배열도 반드시 이월. 리뷰 화면 backfill 로직이 빈 배열을
      // movementId.subPattern 하나로 채워버리면 "사용자가 고른 2차 부위/우선순위"가
      // 모두 증발함. 저장된 muscleIds가 있으면 그대로 보존.
      const exList = getGymExList(gym.id);
      _obState.parsed = exList.map(ex => ({
        name: ex.name,
        brand: ex.brand || '',
        machineType: ex.machineType || '',
        maxKg: ex.maxWeightKg || null,
        incKg: ex.incrementKg || 2.5,
        weightUnit: ex.weightUnit || 'kg',
        movementId: ex.movementId,
        muscleIds: Array.isArray(ex.muscleIds) ? [...ex.muscleIds] : [],
        confidence: 1,
        mappingState: 'mapped',
        dbId: ex.id,
      }));
      _openModal('expert-onboarding-modal');
      // wizard 중간 렌더 건너뛰고 리뷰 화면 직행
      _openReviewScreen();
      if (typeof window.showToast === 'function') {
        window.showToast('진행 중인 설정을 불러왔어요', 2200, 'info');
      }
      return;
    }
    // gym이 없다면 stale draftGymId — 조용히 정리
    saveExpertPreset({ draftGymId: null }).catch(() => {});
  }

  _openModal('expert-onboarding-modal');
  _renderOnboardingStep();
}

export function expertOnbClose() { _closeModal('expert-onboarding-modal'); }

export async function expertOnbSkip() {
  // 7일 스누즈
  const d = new Date(TODAY);
  d.setDate(d.getDate() + 7);
  const snoozeKey = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
  await saveExpertPreset({ snoozedUntil: snoozeKey });
  expertOnbClose();
  if (typeof window.renderAll === 'function') window.renderAll();
}

export function expertOnbBack() {
  // phase 별 back 동작을 한 곳에서만 관리 (onclick 누수 방지)
  if (_obState.phase === 'review') {
    // 리뷰에서 뒤로 → 기구 입력 단계(step 5)로 복귀
    _obState.phase = 'wizard';
    _obState.step = 5;
    _renderOnboardingStep();
    return;
  }
  if (_obState.phase === 'done') {
    // 완료 화면에서는 뒤로 없음 → 모달 닫기
    expertOnbClose();
    return;
  }
  // wizard phase — startStep 이하로 내려가면 close (기구 전용 진입 시 5에서 close)
  if (_obState.step <= (_obState.startStep || 1)) { expertOnbClose(); return; }
  _obState.step--;
  _renderOnboardingStep();
}

// 새 헬스장 추가 OR 기존 헬스장에 기구 추가 — Step 5부터 시작.
// existingGymId 주면 그 헬스장에 연결 (이름 + 등록 기구 복원), null이면 신규 헬스장.
export function expertOnbOpenForNewGym(existingGymId = null) {
  const p = getExpertPreset();
  _resetOnboardingState();
  _obState.phase = 'wizard';
  _obState.step = 5;
  _obState.startStep = 5;
  _obState.goal = p.goal || null;
  _obState.daysPerWeek = p.daysPerWeek || 4;
  _obState.sessionMinutes = p.sessionMinutes || 60;
  _obState.preferMuscles = new Set(p.preferMuscles || []);
  _obState.avoidMuscles = new Set(p.avoidMuscles || []);
  _obState.forbiddenMovements = p.forbiddenMovements || [];
  _obState.preferredRpe = p.preferredRpe || '7-8';
  // 기존 헬스장 연결 모드 — 이름 pre-fill, 기존 기구를 parsed에 복원(dbId 유지로 중복 저장 차단)
  if (existingGymId) {
    const gym = getGyms().find(g => g.id === existingGymId);
    if (gym) {
      _obState.draftGymId = existingGymId;
      _obState.gymName = gym.name;
      // 2026-04-19: 저장된 muscleIds를 복원해야 리뷰 화면이 사용자가 편집해둔
      // 부위 칩(예: 가슴 상부 + 가슴 중부 + 어깨 전면)을 그대로 보여줌. 누락 시
      // backfill이 movementId.subPattern 하나로 덮어써서 편집값이 사라짐.
      const exList = getGymExList(existingGymId);
      _obState.parsed = exList.map(ex => ({
        name: ex.name,
        brand: ex.brand || '',
        machineType: ex.machineType || '',
        maxKg: ex.maxWeightKg || null,
        incKg: ex.incrementKg || 2.5,
        weightUnit: ex.weightUnit || 'kg',
        movementId: ex.movementId,
        muscleIds: Array.isArray(ex.muscleIds) ? [...ex.muscleIds] : [],
        confidence: 1,
        mappingState: 'mapped',
        dbId: ex.id,
      }));
    }
  }
  _openModal('expert-onboarding-modal');
  _renderOnboardingStep();
}

export async function expertOnbNext() {
  const btn = document.getElementById('expert-onb-next');
  // 버튼이 stale-disabled 상태로 남아있으면(이전 AI 호출 중단/에러로 disabled 유지) 강제 복구.
  // 이전엔 silent return이라 사용자는 "버튼이 안 눌린다"고 체감.
  if (btn?.disabled) {
    console.warn('[expertOnbNext] stale disabled detected — forcing reset');
    btn.disabled = false;
    btn.style.display = '';
  }
  // phase가 review/done이면 이 함수로 들어오면 안 됨 (각 화면이 onclick을 전용 핸들러로 바꿈).
  // 방어: phase != 'wizard'이면 재렌더로 복구 시도.
  if (_obState.phase !== 'wizard') {
    console.warn('[expertOnbNext] phase mismatch:', _obState.phase, '— forcing wizard render');
    _obState.phase = 'wizard';
    _renderOnboardingStep();
    return;
  }

  // Step 1-3 → 다음 단계
  if (_obState.step < 4) {
    if (!_validateStep(_obState.step)) return;
    _obState.step++;
    _renderOnboardingStep();
    return;
  }

  // Step 4(초기 진입 경로) → preset만 저장하고 프로 모드 활성. 헬스장/기구는 carousel에서 추가.
  if (_obState.step === 4 && _obState.startStep < 5) {
    if (!_validateStep(4)) return;
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      await _commitInitialPreset();
    } catch (e) {
      console.warn('[expert-onb] initial commit failed:', e);
      if (btn) { btn.disabled = false; btn.textContent = '완료'; }
      _toast('저장 실패 — 다시 시도해주세요', 'error');
    }
    return;
  }

  // Step 5 (expertOnbOpenForNewGym 경로 전용)
  if (!_validateStep(5)) return;
  const willParseAI = (_obState.activeEntryTab === 'text' && (_obState.equipmentRaw || '').trim())
                   || (_obState.activeEntryTab === 'photo' && _obState.pendingImageBase64);
  if (btn) { btn.disabled = true; btn.textContent = willParseAI ? '정리하는 중...' : '저장 중...'; }
  // Progress 게이지는 AI 호출할 때만 표시 (manual 탭은 로컬 merge만 하므로 즉시 리뷰로)
  let parseProgress = { complete: () => {}, cancel: () => {} };
  if (willParseAI) {
    _renderEquipmentParseProgress();
    parseProgress = _startEquipmentParseAnimation();
  }
  try {
    await _commitOnboardingStart();
    parseProgress.complete();
  } catch (e) {
    parseProgress.cancel();
    console.warn('[expert-onb] commit failed:', e);
    if (btn) { btn.disabled = false; btn.textContent = willParseAI ? 'AI로 정리하기' : '리뷰로 이동'; }
    _renderOnboardingStep();  // progress UI 제거하고 step 5 입력 화면 복원
    // 원인별 메시지
    const code = e?.code || e?.name || '';
    const msg = (code === 'PARSE_EMPTY')    ? '기구를 1개도 인식하지 못했어요. 형식을 바꿔 다시 시도해주세요.'
              : (code === 'PARSE_JSON')     ? 'AI 응답을 해석하지 못했어요. 다시 시도해주세요.'
              : (code === 'PARSE_API')      ? 'AI 서버 호출 실패. 잠시 후 다시 시도해주세요.'
              : (code === 'DRAFT_SAVE_FAIL') ? '드래프트 저장 실패. 네트워크 확인 후 다시 시도해주세요.'
              :                                '기구 정리 실패. 다시 시도해주세요.';
    if (typeof window.showToast === 'function') window.showToast(msg, 3200, 'error');
  }
}

// ── Step 렌더 ────────────────────────────────────────────────────

function _renderOnboardingStep() {
  const content = document.getElementById('expert-onb-content');
  const title = document.getElementById('expert-onb-title');
  const stepper = document.getElementById('expert-onb-stepper');
  const nextBtn = document.getElementById('expert-onb-next');
  const backBtn = document.getElementById('expert-onb-back');
  const skipBtn = document.getElementById('expert-onb-skip');
  const ghost = document.getElementById('expert-onb-ghost');
  if (!content) return;

  // wizard 진입 시 항상 phase를 wizard로 고정 (review/done에서 back으로 복귀하는 경로에서도 안전)
  _obState.phase = 'wizard';

  // 초기 진입(startStep===1 기본)은 4-step. expertOnbOpenForNewGym(startStep===5)은 헬스장 추가 단독.
  const isInitialPath = (_obState.startStep || 1) < 5;
  const totalSteps = isInitialPath ? 4 : 5;

  if (title) title.textContent = isInitialPath ? '프로 모드' : '헬스장 추가';
  if (skipBtn) skipBtn.style.display = _obState.step === 1 ? 'none' : 'block';
  if (skipBtn) skipBtn.textContent = _obState.step === 1 ? '' : `${_obState.step} / ${totalSteps}`;
  if (backBtn) {
    backBtn.style.display = '';
    backBtn.disabled = false;
    backBtn.textContent = _obState.step === (_obState.startStep || 1) ? '×' : '‹';
    backBtn.onclick = expertOnbBack; // review에서 덮어쓴 onclick 원복
  }
  if (ghost) { ghost.style.display = 'none'; ghost.onclick = null; }

  // stepper dots — 초기 진입만 1~4 점 표시, Step 5 단독 진입에선 점 숨김
  if (stepper) {
    stepper.innerHTML = '';
    const dotCount = isInitialPath ? 4 : 0;
    for (let i = 1; i <= dotCount; i++) {
      const d = document.createElement('div');
      d.className = 'stepper-dot' + (i < _obState.step ? ' done' : (i === _obState.step ? ' active' : ''));
      stepper.appendChild(d);
    }
    stepper.style.display = (dotCount === 0 || _obState.step === 1) ? 'none' : 'flex';
  }

  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.style.display = '';  // progress로 숨김 처리된 경우 복원
    // Step 5: 탭별 CTA 분기 — manual은 AI 호출 없으므로 '리뷰로 이동'
    let step5Label = 'AI로 정리하기';
    if (_obState.step === 5 && _obState.activeEntryTab === 'manual') {
      step5Label = _obState.parsed.length > 0 ? '리뷰로 이동' : '기구 추가 먼저';
    }
    nextBtn.textContent =
      (_obState.step === 5) ? step5Label :
      (_obState.step === 4 && isInitialPath) ? '완료' :
      '다음';
    nextBtn.onclick = expertOnbNext; // review/done 화면에서 덮어쓴 onclick 원복
  }

  const renderers = {
    1: _renderStep1Intro,
    2: _renderStep2Goal,
    3: _renderStep3FreqTime,
    4: _renderStep4Preference,
    5: _renderStep5Gym,
  };
  content.innerHTML = renderers[_obState.step]?.() || '';
  _bindStepInteractions(_obState.step);
}

function _renderStep1Intro() {
  return `
    <div style="font-size:52px; text-align:center; margin:20px 0 12px;">🧪</div>
    <div class="hero-title-in" style="text-align:center;">AI가 <span class="accent">내 헬스장</span>에<br/>딱 맞는 루틴을 짜줘요</div>
    <div class="hero-sub-in" style="text-align:center;">몇 가지만 알려주시면<br/>매일 부위·시간만 고르면 끝이에요.</div>
    <div class="summary-box" style="margin-top:28px;">
      <div class="summary-row"><span class="summary-key">1. 운동 목표</span><span class="summary-val">30초</span></div>
      <div class="summary-row"><span class="summary-key">2. 빈도와 시간</span><span class="summary-val">30초</span></div>
      <div class="summary-row"><span class="summary-key">3. 선호·기피 부위</span><span class="summary-val">1분</span></div>
    </div>
    <div class="hero-sub-in" style="text-align:center; margin-top:24px; font-size:12px;">
      기본 설정 후 다음 화면에서<br/>헬스장·기구를 추가하면 바로 시작돼요.
    </div>
  `;
}

function _renderStep2Goal() {
  const goals = [
    { id:'hypertrophy', label:'근비대',       icon:'💪', desc:'볼륨 중심 · 중강도 반복 · 타겟 부위 고르게' },
    { id:'cut',         label:'감량',         icon:'🔥', desc:'복합 다관절 + 밀도 · 짧은 인터벌' },
    { id:'power',       label:'파워 향상',    icon:'⚡', desc:'고중량 저반복 · 충분한 휴식 · RPE 8↑' },
    { id:'beginner',    label:'초보 적응',    icon:'🌱', desc:'폼 중심 머신 · 관절 가동 · RPE 6-7' },
    { id:'rehab',       label:'재활',         icon:'🩹', desc:'등척·등장성 우선 · 금지 동작 반영' },
  ];
  return `
    <div class="hero-title-in">이번 시즌<br/>운동 목표는?</div>
    <div class="hero-sub-in">하나만 골라주세요. AI가 이 방향으로 루틴을 설계해요.</div>
    <div style="margin-top:20px;">
      ${goals.map(g => `
        <div class="opt-card${_obState.goal===g.id?' selected':''}" data-goal="${g.id}">
          <div class="opt-icon">${g.icon}</div>
          <div class="opt-body">
            <div class="opt-label">${g.label}</div>
            <div class="opt-desc">${g.desc}</div>
          </div>
          <div class="opt-check">${_obState.goal===g.id?'✓':''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function _renderStep3FreqTime() {
  const days = [2,3,4,5,6];
  const mins = [45,60,90];
  return `
    <div class="hero-title-in">얼마나 자주,<br/>한 번에 얼마나?</div>
    <div class="hero-sub-in">AI가 분할 방식(2분할/3분할 등)을 자동으로 결정해요.</div>
    <div class="section-label">주 운동 빈도</div>
    <div class="segmented" data-segment="days">
      ${days.map(d => `<div class="seg-item${_obState.daysPerWeek===d?' active':''}" data-value="${d}">${d}회</div>`).join('')}
    </div>
    <div class="hero-sub-in" style="font-size:12px; margin-top:4px;">${_daysPerWeekHint(_obState.daysPerWeek)}</div>
    <div class="section-label">한 세션 평균 시간</div>
    <div class="segmented" data-segment="minutes">
      ${mins.map(m => `<div class="seg-item${_obState.sessionMinutes===m?' active':''}" data-value="${m}">${m}분</div>`).join('')}
    </div>
    <div class="hero-sub-in" style="font-size:12px; margin-top:4px;">휴식 포함. 매일 루틴 생성 시 이 값이 기본값으로 들어가요.</div>
    <div class="summary-box" style="margin-top:24px; background:var(--primary-bg); border-color:var(--primary-light);">
      <div style="font-size:12px; color:var(--primary-dark); font-weight:700; margin-bottom:8px;">📐 AI 추정</div>
      <div style="font-size:13px; line-height:19px; color:var(--text-normal);">
        ${_volumeEstimate(_obState.daysPerWeek, _obState.sessionMinutes)}
      </div>
    </div>
  `;
}

function _daysPerWeekHint(d) {
  if (d === 2) return '주 2회 → <b style="color:var(--primary);">전신 분할</b>';
  if (d === 3) return '주 3회 → <b style="color:var(--primary);">PPL(푸시·풀·레그)</b>';
  if (d === 4) return '주 4회 → <b style="color:var(--primary);">2분할 상/하</b> 또는 <b style="color:var(--primary);">PPL×2</b>';
  if (d === 5) return '주 5회 → <b style="color:var(--primary);">3분할 + 약점 보강</b>';
  return '주 6회 → <b style="color:var(--primary);">PPL×2</b> (고급)';
}

function _volumeEstimate(d, m) {
  const exPerSession = m === 45 ? '4~5종목' : m === 60 ? '5~7종목' : '7~9종목';
  const setsPerSession = m === 45 ? '10~14 작업세트' : m === 60 ? '15~20 작업세트' : '20~26 작업세트';
  const weeklyPerMuscle = Math.max(10, Math.min(22, Math.round(d * 3.5)));
  return `세션당 <b>${exPerSession}</b>, <b>${setsPerSession}</b> 수준에서<br/>한 부위를 주 <b>${weeklyPerMuscle-2}~${weeklyPerMuscle+2}세트</b>로 자극할 수 있어요.`;
}

function _renderStep4Preference() {
  const parts = getMuscleParts();
  return `
    <div class="hero-title-in">더 키우고 싶은,<br/>피하고 싶은 부위가 있나요?</div>
    <div class="hero-sub-in">탭할수록 <b style="color:var(--primary);">선호 ♥</b> → 중립 → <s>기피</s> 순으로 바뀝니다.</div>
    <div class="section-label">부위</div>
    <div class="chips" id="expert-prefer-chips">
      ${parts.map(m => {
        const prefer = _obState.preferMuscles.has(m.id);
        const avoid  = _obState.avoidMuscles.has(m.id);
        const cls = prefer ? 'chip prefer' : (avoid ? 'chip avoid' : 'chip');
        const mark = prefer ? '<span class="mark">♥</span>' : '';
        return `<div class="${cls}" data-muscle="${m.id}">${mark}${m.name}</div>`;
      }).join('')}
      <button type="button" class="chip chip-add" onclick="openCustomMusclesModal()" style="border-style:dashed;">+ 새 부위</button>
    </div>
    ${_mismatchWarning() ? `<div class="hero-sub-in" style="font-size:11px; margin-top:6px;">${_mismatchWarning()}</div>` : ''}
    <div class="section-label" style="margin-top:22px;">금지 동작 <span style="font-weight:500; text-transform:none; color:var(--text-disabled);">(선택)</span></div>
    <div class="tf">
      <input class="tf-input" id="expert-forbid-input" placeholder="예: 백스쿼트, 오버헤드프레스" value="${(_obState.forbiddenMovements.map(_moveLabel).join(', ')||'').replace(/"/g,'&quot;')}" />
      <div class="tf-hint">이 동작은 AI 추천에서 자동 제외돼요.</div>
    </div>
    <div class="chips" id="expert-forbid-chips">
      ${_obState.forbiddenMovements.map(id => `<div class="chip prefer" data-forbid="${id}"><span class="mark">🚫</span>${_moveLabel(id)}</div>`).join('')}
    </div>
  `;
}

function _mismatchWarning() {
  const avoidLower = _obState.avoidMuscles.has('lower');
  if (avoidLower && _obState.goal === 'cut') return '💡 하체 기피 → 감량 목표랑 상충할 수 있어요. 그래도 진행할까요?';
  if (avoidLower && _obState.goal === 'power') return '💡 하체 기피 → 파워 목표에 제약이 생겨요.';
  return '';
}

function _moveLabel(id) {
  const m = MOVEMENTS.find(x => x.id === id);
  return m ? m.nameKo : id;
}

function _renderStep5Gym() {
  return `
    <div class="hero-title-in">다니는 헬스장을<br/>등록해주세요</div>
    <div class="hero-sub-in">각 헬스장의 기구 목록을 알려주시면 AI가 그 기구만 써서 루틴을 짜요.</div>
    <div class="gym-switcher" style="border:1px solid var(--primary); background:var(--primary-bg); margin-top:16px;">
      <div class="gym-icon" style="background:var(--primary); color:#fff;">🏋️</div>
      <div style="flex:1;">
        <input class="gym-name-input" id="expert-gym-name" placeholder="예: 애니타임 강남점" value="${(_obState.gymName||'').replace(/"/g,'&quot;')}" />
        <div class="gym-meta">현재 설정 중 · 기구 ${_obState.parsed.length}개</div>
      </div>
    </div>
    <div class="section-label">기구 등록 방법</div>
    <div class="entry-tabs" id="expert-entry-tabs">
      <div class="et-tab${_obState.activeEntryTab==='text'?' active':''}" data-entry="text"><div class="et-tab-icon">📝</div>텍스트로</div>
      <div class="et-tab${_obState.activeEntryTab==='photo'?' active':''}" data-entry="photo"><div class="et-tab-icon">📷</div>사진으로</div>
      <div class="et-tab${_obState.activeEntryTab==='manual'?' active':''}" data-entry="manual"><div class="et-tab-icon">➕</div>하나씩</div>
    </div>
    <div id="expert-entry-body">${_renderEntryBody()}</div>
  `;
}

function _renderEntryBody() {
  if (_obState.activeEntryTab === 'text') {
    return `
      <div class="hero-sub-in" style="font-size:12px;">헬스장 안내표/내가 쓰는 기구를 한 번에 붙여넣으세요. AI가 파싱해요.</div>
      <textarea class="ta-input" id="expert-equip-text" style="margin-top:10px;" placeholder="파나타 랫풀다운 최대 100kg, 2.5kg씩\n라이프피트니스 체스트프레스 - 120kg\n드랙스 레그프레스 300kg\n덤벨 2~40kg (2.5kg 증량)\n바벨 + 5·10·15·20kg 원판">${(_obState.equipmentRaw||'').replace(/</g,'&lt;')}</textarea>
    `;
  }
  if (_obState.activeEntryTab === 'photo') {
    return `
      <div class="hero-sub-in" style="font-size:12px;">헬스장 기구 라벨/안내판 사진을 올려주세요.</div>
      <label class="btn btn-tonal" style="margin-top:10px; display:block; text-align:center; cursor:pointer;">
        <input type="file" accept="image/*" style="display:none" onchange="expertOnbPickPhoto(event)" />
        사진 선택
      </label>
      <div id="expert-photo-preview" style="margin-top:10px;">
        ${_obState.pendingImageBase64 ? `<img src="data:image/jpeg;base64,${_obState.pendingImageBase64}" style="max-width:100%; border-radius:12px;" />` : ''}
      </div>
    `;
  }
  // manual
  return `
    <div class="hero-sub-in" style="font-size:12px;">기구를 하나씩 입력하세요.</div>
    <div class="tf"><label class="tf-label">이름</label><input class="tf-input" id="manual-name" placeholder="파나타 랫풀다운" /></div>
    <div class="tf"><label class="tf-label">브랜드</label><input class="tf-input" id="manual-brand" placeholder="Panatta" /></div>
    <div class="tf"><label class="tf-label">머신 타입</label><input class="tf-input" id="manual-type" placeholder="케이블 / 핀머신 / 플레이트" /></div>
    <div style="display:flex; gap:8px;">
      <div class="tf" style="flex:1;"><label class="tf-label">최대 무게(kg)</label><input class="tf-input" id="manual-max" type="number" placeholder="100" /></div>
      <div class="tf" style="flex:1;"><label class="tf-label">증량(kg)</label><input class="tf-input" id="manual-inc" type="number" step="0.5" placeholder="2.5" /></div>
    </div>
    <div class="tf">
      <label class="tf-label">동작</label>
      <select class="tf-input" id="manual-movement">
        <option value="unknown">— 동작 선택 —</option>
        ${MOVEMENTS.map(m => `<option value="${m.id}">${m.nameKo} (${m.primary})</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-tonal" onclick="expertOnbAddManual()">+ 기구 추가</button>
    <div class="hero-sub-in" style="font-size:11px; margin-top:10px;">추가 후 "AI로 정리하기"를 누르면 저장됩니다.</div>
    <div id="manual-list" style="margin-top:10px;">
      ${_obState.parsed.map((p, i) => `
        <div class="eq-row">
          <div class="eq-check">✓</div>
          <div class="eq-body">
            <div class="eq-name">${_esc(p.name)}</div>
            <div class="eq-meta">${_esc([p.brand, p.machineType, p.maxKg?`최대 ${p.maxKg}kg`:'', p.incKg?`${p.incKg}kg 증량`:''].filter(Boolean).join(' · '))}</div>
          </div>
          <div class="eq-movement">${_moveLabel(p.movementId||'unknown')}</div>
        </div>
      `).join('')}
    </div>
  `;
}


// ── Step 인터랙션 바인딩 ───────────────────────────────────────

function _bindStepInteractions(step) {
  const content = document.getElementById('expert-onb-content');
  if (!content) return;
  if (step === 2) {
    content.querySelectorAll('[data-goal]').forEach(el => {
      el.onclick = () => { _obState.goal = el.getAttribute('data-goal'); _renderOnboardingStep(); };
    });
  }
  if (step === 3) {
    content.querySelectorAll('[data-segment="days"] [data-value]').forEach(el => {
      el.onclick = () => { _obState.daysPerWeek = +el.getAttribute('data-value'); _renderOnboardingStep(); };
    });
    content.querySelectorAll('[data-segment="minutes"] [data-value]').forEach(el => {
      el.onclick = () => { _obState.sessionMinutes = +el.getAttribute('data-value'); _renderOnboardingStep(); };
    });
  }
  if (step === 4) {
    content.querySelectorAll('[data-muscle]').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-muscle');
        // prefer → avoid → neutral 3상태 토글
        if (_obState.preferMuscles.has(id)) {
          _obState.preferMuscles.delete(id);
          _obState.avoidMuscles.add(id);
        } else if (_obState.avoidMuscles.has(id)) {
          _obState.avoidMuscles.delete(id);
        } else {
          _obState.preferMuscles.add(id);
        }
        _renderOnboardingStep();
      };
    });
    const input = content.querySelector('#expert-forbid-input');
    if (input) {
      input.onchange = () => {
        const raw = input.value || '';
        const names = raw.split(/[,、]/).map(s => s.trim()).filter(Boolean);
        const ids = names.map(n => {
          const m = MOVEMENTS.find(x => x.nameKo === n || x.id === n);
          return m ? m.id : null;
        }).filter(Boolean);
        _obState.forbiddenMovements = ids;
        _renderOnboardingStep();
      };
    }
  }
  if (step === 5) {
    const nameEl = content.querySelector('#expert-gym-name');
    if (nameEl) nameEl.oninput = () => { _obState.gymName = nameEl.value; };
    content.querySelectorAll('[data-entry]').forEach(el => {
      el.onclick = () => {
        _obState.activeEntryTab = el.getAttribute('data-entry');
        _renderOnboardingStep();
      };
    });
    const ta = content.querySelector('#expert-equip-text');
    if (ta) ta.oninput = () => { _obState.equipmentRaw = ta.value; };
  }
}

function _validateStep(step) {
  if (step === 2 && !_obState.goal) { _toast('목표를 골라주세요'); return false; }
  // P0-3: Step 5 — 헬스장 이름 + 입력 소스(텍스트/사진/수동) 최소 1개 필수
  if (step === 5) {
    const name = (_obState.gymName || '').trim();
    if (!name) { _toast('헬스장 이름을 입력해주세요', 'warning'); return false; }
    const hasText   = !!(_obState.equipmentRaw || '').trim();
    const hasPhoto  = !!_obState.pendingImageBase64;
    const hasManual = Array.isArray(_obState.parsed) && _obState.parsed.length > 0;
    if (!hasText && !hasPhoto && !hasManual) {
      _toast('기구를 1개 이상 입력해주세요 (텍스트·사진·수동 중 하나)', 'warning');
      return false;
    }
  }
  return true;
}


// ── Manual 탭 수동 추가 ────────────────────────────────────────

export function expertOnbAddManual() {
  const $ = id => document.getElementById(id)?.value?.trim();
  const name = $('manual-name');
  if (!name) return _toast('기구 이름을 입력해주세요', 'warning');
  _obState.parsed.push({
    name,
    brand: $('manual-brand') || '',
    machineType: $('manual-type') || '',
    maxKg: parseFloat($('manual-max')) || null,
    incKg: parseFloat($('manual-inc')) || 2.5,
    weightUnit: 'kg',
    movementId: document.getElementById('manual-movement')?.value || 'unknown',
    confidence: 1,
  });
  ['manual-name','manual-brand','manual-type','manual-max','manual-inc'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  _renderOnboardingStep();
}

export function expertOnbPickPhoto(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    const base64 = dataUrl.split(',')[1] || '';
    _obState.pendingImageBase64 = base64;
    _renderOnboardingStep();
  };
  reader.readAsDataURL(file);
}

// ── 초기 진입 경로(Step 4 완료) — 헬스장 없이 preset만 저장 + 프로 모드 ON ───
// Step 5(기구 등록)는 carousel의 "+ 추가"에서 expertOnbOpenForNewGym()로 진입.
async function _commitInitialPreset() {
  await saveExpertPreset({
    enabled: true,
    snoozedUntil: null,
    goal: _obState.goal,
    daysPerWeek: _obState.daysPerWeek,
    sessionMinutes: _obState.sessionMinutes,
    preferMuscles: [..._obState.preferMuscles],
    avoidMuscles:  [..._obState.avoidMuscles],
    forbiddenMovements: _obState.forbiddenMovements,
    preferredRpe: _obState.preferredRpe,
    currentGymId: null,
    draftGymId: null,
  });
  _closeModal('expert-onboarding-modal');
  _toast('프로 모드 설정 완료! 헬스장을 추가해볼까요?', 'success');
  // 프로 모드 진입 시 status='done' 강제 (상태 선택 UI가 없는 환경)
  if (typeof window.wtExcSelectStatus === 'function') window.wtExcSelectStatus('done');
  if (typeof window.renderAll === 'function') window.renderAll();
}

// ── Step 5 "AI로 정리하기" 진행 게이지 (기존 ai-gen-progress 스타일 재사용) ───
function _renderEquipmentParseProgress() {
  const content = document.getElementById('expert-onb-content');
  if (!content) return;
  content.innerHTML = `
    <div class="ai-gen-progress">
      <div class="ai-gen-progress-icon">🤖</div>
      <div class="ai-gen-progress-title">AI가 기구를 정리하고 있어요</div>
      <div class="ai-gen-progress-sub">입력 내용에서 운동 동작과 무게 범위를 추출해요</div>
      <div class="ai-gen-progress-track">
        <div class="ai-gen-progress-fill" id="equip-parse-fill" style="width:0%;"></div>
      </div>
      <div class="ai-gen-progress-meta">
        <span id="equip-parse-pct">0%</span>
        <span id="equip-parse-hint">텍스트 분석 중...</span>
      </div>
    </div>
  `;
  const nextBtn = document.getElementById('expert-onb-next');
  if (nextBtn) nextBtn.style.display = 'none';
  const backBtn = document.getElementById('expert-onb-back');
  if (backBtn) backBtn.disabled = true;
}

let _equipParseToken = 0;
function _startEquipmentParseAnimation() {
  const myToken = ++_equipParseToken;
  const fillEl = document.getElementById('equip-parse-fill');
  const pctEl  = document.getElementById('equip-parse-pct');
  const hintEl = document.getElementById('equip-parse-hint');
  if (!fillEl) return { complete: () => {}, cancel: () => {} };
  const startTs = performance.now();
  const durationMs = 6000;
  const maxPct = 85;
  const hints = [
    { from: 0,  text: '텍스트 분석 중...' },
    { from: 30, text: '동작 매칭 중...' },
    { from: 60, text: '중복 제거 중...' },
    { from: 82, text: '마무리 정리 중...' },
  ];
  let rafId = null;
  const tick = (now) => {
    if (_equipParseToken !== myToken) return;
    const t = Math.min((now - startTs) / durationMs, 1);
    const eased = 1 - Math.pow(1 - t, 2.2);
    const pct = Math.min(maxPct, eased * maxPct);
    fillEl.style.width = pct.toFixed(1) + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (hintEl) {
      const h = [...hints].reverse().find(h => pct >= h.from);
      if (h) hintEl.textContent = h.text;
    }
    if (t < 1) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return {
    complete: () => {
      _equipParseToken++;
      if (rafId) cancelAnimationFrame(rafId);
      if (fillEl) fillEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      if (hintEl) hintEl.textContent = '완료!';
    },
    cancel: () => {
      _equipParseToken++;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

// ── 단계 5 완료 → AI 파싱 + Step 6(리뷰) 전환 ──────────────────

async function _commitOnboardingStart() {
  // P0-3: gym name은 필수 — _validateStep(5)가 이미 차단하지만 2차 방어
  const gymName = (_obState.gymName || '').trim();
  if (!gymName) {
    _toast('헬스장 이름을 입력해주세요', 'warning');
    throw Object.assign(new Error('gym name required'), { code: 'GYM_NAME_REQUIRED' });
  }
  _obState.gymName = gymName;

  // 파싱: active tab에 따라 텍스트/사진 AI 호출
  let newItems = [];
  if (_obState.activeEntryTab === 'text' && (_obState.equipmentRaw || '').trim()) {
    newItems = await parseEquipmentFromText(_obState.equipmentRaw, MOVEMENTS);
  } else if (_obState.activeEntryTab === 'photo' && _obState.pendingImageBase64) {
    newItems = await parseEquipmentFromImage(_obState.pendingImageBase64, MOVEMENTS);
  }
  // 전체 unknown → AI 매핑 전부 실패로 간주 (App Check 미등록/네트워크 장애 등)
  if (newItems.length > 0 && newItems.every(i => !i.movementId || i.movementId === 'unknown')) {
    _toast('AI 동작 매핑이 실패했어요. 아래에서 수동으로 지정해주세요.', 'warning');
  }
  // 중복 제거: name(정규화) + movementId 기준 merge
  const existing = new Set(_obState.parsed.map(p => `${(p.name||'').trim().toLowerCase()}|${p.movementId||''}`));
  for (const item of newItems) {
    const key = `${(item.name||'').trim().toLowerCase()}|${item.movementId||''}`;
    if (!existing.has(key)) {
      _obState.parsed.push(item);
      existing.add(key);
    }
  }

  // 드래프트 저장: AI 파싱 성공한 순간 DB에 즉시 반영 (뒤로가기/닫기 해도 유실 없음)
  // - gym 레코드 생성/갱신 (이름 변경 반영)
  // - 각 parsed 아이템 중 유효 movementId 가진 것 저장, dbId 추적
  // - preset.draftGymId 마킹 → 다음 modal open 시 복원
  // 실패 시 리뷰로 넘어가지 않음 — 복원 경로가 draftGymId로만 회수되므로, 저장 실패를
  // 묵살하면 "다시 열었는데 아까 AI 정리한 게 사라졌다" 이슈가 발생. 에러로 전파해 재시도.
  try {
    await _persistOnboardingDraft();
  } catch (e) {
    console.warn('[draft-save] 실패 — 리뷰 진입 차단:', e?.message || e);
    throw Object.assign(new Error('draft save failed'), { code: 'DRAFT_SAVE_FAIL', cause: e });
  }

  _openReviewScreen();
}

// Phase 2 (드래프트 저장) 핵심 헬퍼 ─────────────────────────────
// _commitOnboardingStart/Finish 양쪽에서 호출. gym + exercises를 DB에 밀어넣고
// dbId를 _obState.parsed[i].dbId에 역참조로 기록. 재파싱 시 중복 저장 방지.
async function _persistOnboardingDraft() {
  const { _generateId } = await import('../../data/data-core.js');
  let gymId = _obState.draftGymId || getExpertPreset().draftGymId || null;
  if (!gymId) gymId = _generateId();
  // gym 저장 (setDoc 덮어쓰기 — 같은 id면 이름만 업데이트)
  await saveGym({ id: gymId, name: _obState.gymName, createdAt: Date.now() });
  if (_obState.draftGymId !== gymId) {
    _obState.draftGymId = gymId;
    await saveExpertPreset({ draftGymId: gymId });
  }
  // 각 parsed 중 dbId 없고 (movementId 유효 OR muscleIds 존재)인 것만 신규 저장
  // 2026-04-19: muscleIds 배열을 레코드에 함께 저장 — 자극 균형/루틴 필터의 새 기준.
  for (const p of _obState.parsed) {
    if (p.dbId) continue;
    const hasMovement = p.movementId && p.movementId !== 'unknown';
    const hasMuscles = Array.isArray(p.muscleIds) && p.muscleIds.length > 0;
    if (!hasMovement && !hasMuscles) continue;
    const mov = hasMovement ? MOVEMENTS.find(m => m.id === p.movementId) : null;
    const exId = _generateId();
    await saveExercise({
      id: exId,
      muscleId: mov?.primary || (hasMuscles ? p.muscleIds[0] : null),
      muscleIds: hasMuscles ? [...p.muscleIds] : undefined, // undefined → data.js가 legacy 파생
      name: p.name,
      movementId: p.movementId || 'unknown',
      brand: p.brand || '',
      machineType: p.machineType || '',
      maxWeightKg: p.maxKg || null,
      incrementKg: p.incKg || mov?.stepKg || 2.5,
      weightUnit: p.weightUnit || 'kg',
      gymId,
      notes: '',
    });
    p.dbId = exId;
  }
}

// 리뷰 화면은 같은 content 영역에 덮어쓴다 (Scene 07)
// phase='review'로 마킹하여 expertOnbBack()이 자동으로 step 5 복귀를 처리하게 함.
function _openReviewScreen() {
  _obState.phase = 'review';
  const content = document.getElementById('expert-onb-content');
  const title = document.getElementById('expert-onb-title');
  const nextBtn = document.getElementById('expert-onb-next');
  const backBtn = document.getElementById('expert-onb-back');
  const ghost = document.getElementById('expert-onb-ghost');
  const stepper = document.getElementById('expert-onb-stepper');
  if (title) title.textContent = '기구 확인';
  if (stepper) stepper.style.display = 'none';
  // progress 게이지에서 숨긴 nextBtn/disabled 상태를 여기서 확실히 복원
  if (nextBtn) { nextBtn.style.display = ''; nextBtn.disabled = false; }
  if (backBtn) {
    backBtn.style.display = '';
    backBtn.disabled = false;
    backBtn.textContent = '‹';
    backBtn.onclick = expertOnbBack;
  }

  const coverage = _calcCoverage(_obState.parsed);
  if (!_obState.editing) _obState.editing = new Set();

  // 2026-04-19 리팩토링: 기구 → muscleIds(세부 부위) 배열 매핑.
  // legacy 데이터(parsed 객체가 muscleIds 없는 경우) → movementId 기반으로 즉시 복원.
  // 이렇게 하면 UI 렌더 시점에 칩 목록이 비어 보이지 않음.
  for (const p of _obState.parsed) {
    if (!Array.isArray(p.muscleIds)) p.muscleIds = [];
    if (p.muscleIds.length === 0 && p.movementId && p.movementId !== 'unknown') {
      const mv = MOVEMENTS.find(m => m.id === p.movementId);
      if (mv?.subPattern) p.muscleIds = [mv.subPattern];
    }
  }

  // 후방 호환: 옛 mappingState 없는 데이터(수동 추가 등) → muscleIds로 상태 추론
  const stateOf = (p) => {
    if (Array.isArray(p.muscleIds) && p.muscleIds.length > 0) return 'mapped';
    if (p.mappingState === 'unsupported') return 'unsupported';
    return 'ambiguous';
  };

  const rows = _obState.parsed.map((p, i) => {
    const state = stateOf(p);
    const pickerOpen = _obState.editing.has(i);

    let icon, iconClass, rowClass;
    if (state === 'unsupported') {
      icon = '⊘'; iconClass = 'eq-skip'; rowClass = 'unsupported';
    } else if (state === 'ambiguous') {
      icon = '?'; iconClass = 'eq-warn'; rowClass = 'warn';
    } else {
      icon = '✓'; iconClass = 'eq-check'; rowClass = '';
    }

    // muscleIds 칩 목록 (primary = [0], 나머지 일반 칩)
    const muscleIds = Array.isArray(p.muscleIds) ? p.muscleIds : [];
    const chipsHtml = muscleIds.map((sp, idx) => {
      const cls = idx === 0 ? 'eq-muscle-chip primary' : 'eq-muscle-chip';
      const title = idx === 0 ? '주동근 (자극 균형 차트 카운트 기준)' : '탭하면 주동근으로 변경 · × 로 제거';
      return `<button type="button" class="${cls}" title="${title}" onclick="expertOnbMuscleSetPrimary(${i}, '${sp}')">
        ${_esc(_subPatternLabel(sp))}
        <span class="chip-x" onclick="event.stopPropagation(); expertOnbMuscleToggle(${i}, '${sp}')" title="제거">×</span>
      </button>`;
    }).join('');
    // "+ 부위" 추가 토글 칩 (picker 열기/닫기)
    const addChipLabel = pickerOpen ? '닫기' : '+ 부위';
    const addChip = `<button type="button" class="eq-muscle-chip add" onclick="expertOnbMusclePickerToggle(${i})">${addChipLabel}</button>`;

    // 17개 subPattern 풀 — picker 펼침 시 노출
    const ALL_SUB_PATTERNS = [
      'chest_upper','chest_mid','chest_lower',
      'back_width','back_thickness','posterior',
      'shoulder_front','shoulder_side','rear_delt','traps',
      'quad','hamstring','glute','calf',
      'bicep','tricep','core',
    ];
    const pickerHtml = pickerOpen ? `
      <div class="eq-muscle-picker">
        ${ALL_SUB_PATTERNS.map(sp => {
          const on = muscleIds.includes(sp);
          return `<button type="button" class="eq-muscle-picker-chip${on ? ' on' : ''}"
            onclick="expertOnbMuscleToggle(${i}, '${sp}')">${_esc(_subPatternLabel(sp))}</button>`;
        }).join('')}
        <div class="eq-muscle-picker-hint">첫 번째 부위가 <b style="color:#fa342c;">주동근</b>이에요. 칩을 탭해서 주동근 변경.</div>
      </div>
    ` : '';

    // Hybrid C: 멀티퍼포스 기구에서 확장된 row는 "출처: 파워랙" 메타 표기.
    const metaParts = [];
    if (p.sourceEquipment) metaParts.push(`출처: ${p.sourceEquipment}`);
    if (p.brand) metaParts.push(p.brand);
    if (p.machineType) metaParts.push(p.machineType);
    if (p.maxKg) metaParts.push(`최대 ${p.maxKg}kg`);
    if (p.incKg) metaParts.push(`${p.incKg}kg 증량`);

    return `
      <div class="eq-row has-chips ${rowClass}">
        <div class="eq-chip-head">
          <div class="${iconClass}">${icon}</div>
          <div class="eq-body">
            <div class="eq-name">${_esc(p.name)}</div>
            <div class="eq-meta">${_esc(metaParts.join(' · '))}</div>
          </div>
          <button type="button" class="eq-remove" onclick="expertOnbRemoveItem(${i})" aria-label="이 기구 삭제" title="이 기구 삭제">✕</button>
        </div>
        <div class="eq-muscle-chips">
          ${chipsHtml || '<span class="eq-meta" style="font-size:11px;">부위 미지정 — 아래 "+ 부위"로 추가</span>'}
          ${addChip}
        </div>
        ${pickerHtml}
      </div>
    `;
  }).join('');

  // 상태별 카운트 (헤더 메시지 용)
  const counts = { mapped: 0, ambiguous: 0, unsupported: 0 };
  _obState.parsed.forEach(p => { counts[stateOf(p)] = (counts[stateOf(p)] || 0) + 1; });

  let subMsg;
  if (counts.ambiguous === 0 && counts.unsupported === 0) {
    subMsg = `전부 자동 매핑됐어요. 부위를 조정하려면 칩을 탭하세요.`;
  } else {
    const parts = [`자동 매핑 ${counts.mapped}개`];
    if (counts.ambiguous > 0) parts.push(`부위 미지정 ${counts.ambiguous}개`);
    if (counts.unsupported > 0) parts.push(`보조장비 ${counts.unsupported}개`);
    subMsg = parts.join(' · ') + ' — ⚠️ 미지정 항목만 "+ 부위"로 추가해주세요.';
  }

  // P3-12: 커버리지 수치 대신 "가능한 루틴 유형" 제시
  const capability = _classifyGymCapability(coverage);
  content.innerHTML = `
    <div class="hero-title-in" style="font-size:20px; line-height:28px;">${_obState.parsed.length}개 기구를 찾았어요</div>
    <div class="hero-sub-in" style="font-size:13px;">${subMsg}</div>
    <div class="gym-capability gym-capability--${capability.tone}" style="margin-top:16px;">
      <div class="gym-capability-label">${capability.label}</div>
      <div class="gym-capability-detail">${capability.detail}</div>
    </div>
    <div style="margin-top:4px;">${rows || '<div class="hero-sub-in">추가된 기구가 없어요.</div>'}</div>
  `;

  // 2026-04-19: 저장 기준을 muscleIds 유무로 변경 — 부위 하나라도 있으면 저장.
  const validCount = _obState.parsed.filter(p =>
    (Array.isArray(p.muscleIds) && p.muscleIds.length > 0) ||
    (p.movementId && p.movementId !== 'unknown')
  ).length;
  const excluded = _obState.parsed.length - validCount;
  if (nextBtn) {
    nextBtn.textContent = excluded > 0
      ? `${validCount}개 저장 (${excluded}개 제외)`
      : `${validCount}개 저장하고 완료`;
    nextBtn.disabled = validCount === 0;
    nextBtn.onclick = _commitOnboardingFinish;
  }
  if (ghost) { ghost.style.display = 'block'; ghost.textContent = '← 기구 더 추가'; ghost.onclick = expertOnbBack; }
}

// ─ 2026-04-19 리팩토링: 기구 리뷰 · muscleIds 칩 에디터 핸들러 ─────
// 칩을 탭 → 해당 subPattern을 주동근(배열 [0])으로 이동.
// 동일 subPattern을 이미 주동근이면 토글 OFF (전체 제거).
export function expertOnbMuscleSetPrimary(idx, subPattern) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= _obState.parsed.length) return;
  const p = _obState.parsed[i];
  if (!Array.isArray(p.muscleIds)) p.muscleIds = [];
  const curIdx = p.muscleIds.indexOf(subPattern);
  if (curIdx === 0) {
    // 이미 주동근이면 제거 (토글 OFF) — double-tap 패턴
    p.muscleIds.splice(0, 1);
  } else if (curIdx > 0) {
    // 이미 있지만 주동근 아닌 경우 → 배열 맨 앞으로 이동
    p.muscleIds.splice(curIdx, 1);
    p.muscleIds.unshift(subPattern);
  } else {
    // 아예 없으면 주동근으로 추가
    p.muscleIds.unshift(subPattern);
  }
  p.mappingState = p.muscleIds.length > 0 ? 'mapped' : (p.mappingState || 'ambiguous');
  _persistMuscleIdsToDb(p);
  _openReviewScreen();
}

// 칩의 × 또는 picker 그리드 칩 클릭 → subPattern 추가/제거 토글.
export function expertOnbMuscleToggle(idx, subPattern) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= _obState.parsed.length) return;
  const p = _obState.parsed[i];
  if (!Array.isArray(p.muscleIds)) p.muscleIds = [];
  const at = p.muscleIds.indexOf(subPattern);
  if (at >= 0) {
    p.muscleIds.splice(at, 1);
  } else {
    p.muscleIds.push(subPattern);
    // muscleIds[0]가 없었으면 이 항목이 주동근이 됨 (push했으니 첫 원소)
  }
  p.mappingState = p.muscleIds.length > 0 ? 'mapped' : 'ambiguous';
  _persistMuscleIdsToDb(p);
  _openReviewScreen();
}

// "+ 부위" 칩 → picker 그리드 열기/닫기
export function expertOnbMusclePickerToggle(idx) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= _obState.parsed.length) return;
  if (!_obState.editing) _obState.editing = new Set();
  if (_obState.editing.has(i)) _obState.editing.delete(i);
  else _obState.editing.add(i);
  _openReviewScreen();
}

// 드래프트 저장 상태에서 muscleIds 변경 → 기존 exercise 레코드 업데이트 (또는 신규 저장)
async function _persistMuscleIdsToDb(p) {
  try {
    const gymId = _obState.draftGymId || getExpertPreset().draftGymId;
    if (!gymId) return;
    const hasMuscles = Array.isArray(p.muscleIds) && p.muscleIds.length > 0;
    if (!hasMuscles) {
      // muscleIds 전부 제거 — DB 레코드 정리
      if (p.dbId) { await deleteExercise(p.dbId).catch(() => {}); p.dbId = null; }
      return;
    }
    const mov = p.movementId && p.movementId !== 'unknown'
      ? MOVEMENTS.find(m => m.id === p.movementId) : null;
    const { _generateId } = await import('../../data/data-core.js');
    const exId = p.dbId || _generateId();
    await saveExercise({
      id: exId,
      muscleId: mov?.primary || p.muscleIds[0],
      muscleIds: [...p.muscleIds],
      name: p.name,
      movementId: p.movementId || 'unknown',
      brand: p.brand || '',
      machineType: p.machineType || '',
      maxWeightKg: p.maxKg || null,
      incrementKg: p.incKg || mov?.stepKg || 2.5,
      weightUnit: p.weightUnit || 'kg',
      gymId,
      notes: '',
    });
    p.dbId = exId;
  } catch (e) { console.warn('[muscleIds-save] fail:', e?.message || e); }
}

// 리뷰 화면에서 특정 기구의 동작을 사용자가 수동 지정할 때 호출 (select onchange)
// 드래프트 저장 상태라면 DB에도 즉시 반영 (저장/삭제).
export async function expertOnbAssignMovement(idx, movementId) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= _obState.parsed.length) return;
  const p = _obState.parsed[i];
  p.movementId = movementId || 'unknown';
  if (movementId && movementId !== 'unknown') {
    p.mappingState = 'mapped';
    p.confidence = 1;
  } else {
    p.mappingState = 'unsupported';
    p.confidence = 0;
  }
  _obState.editing?.delete(i);

  // Phase 2: 드래프트 DB 동기화
  try {
    const gymId = _obState.draftGymId || getExpertPreset().draftGymId;
    if (gymId) {
      if (!movementId || movementId === 'unknown') {
        // unsupported로 전환 — DB에서 제거
        if (p.dbId) {
          await deleteExercise(p.dbId).catch(() => {});
          p.dbId = null;
        }
      } else {
        const mov = MOVEMENTS.find(m => m.id === movementId);
        if (mov) {
          const { _generateId } = await import('../../data/data-core.js');
          const exId = p.dbId || _generateId();
          const hasMuscles = Array.isArray(p.muscleIds) && p.muscleIds.length > 0;
          await saveExercise({
            id: exId,
            muscleId: mov.primary,
            muscleIds: hasMuscles ? [...p.muscleIds] : undefined,
            name: p.name,
            movementId,
            brand: p.brand || '',
            machineType: p.machineType || '',
            maxWeightKg: p.maxKg || null,
            incrementKg: p.incKg || mov.stepKg || 2.5,
            weightUnit: p.weightUnit || 'kg',
            gymId,
            notes: '',
          });
          p.dbId = exId;
        }
      }
    }
  } catch (e) { console.warn('[assign-save] fail:', e?.message || e); }

  _openReviewScreen();
}

// 매핑된 항목의 라벨을 탭 → select로 전환해서 재지정 가능하게
export function expertOnbEditMovement(idx) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= _obState.parsed.length) return;
  if (!_obState.editing) _obState.editing = new Set();
  _obState.editing.add(i);
  _openReviewScreen();
}

// Hybrid C: 리뷰 화면에서 X 버튼으로 row 삭제.
// 멀티퍼포스 확장으로 너무 많은 동작이 생성됐거나, 원치 않는 항목을 빼고 싶을 때 사용.
// - dbId가 있으면 DB에서 exercise 레코드도 삭제
// - Undo 토스트(3초) — 잘못 눌렀을 때 복원
export async function expertOnbRemoveItem(idx) {
  const i = Number(idx);
  if (!Number.isInteger(i) || i < 0 || i >= _obState.parsed.length) return;
  const removed = _obState.parsed[i];
  const prevDbId = removed.dbId || null;
  _obState.parsed.splice(i, 1);
  // _obState.editing Set의 인덱스 shift
  if (_obState.editing && _obState.editing.size > 0) {
    const next = new Set();
    for (const oldIdx of _obState.editing) {
      if (oldIdx === i) continue;
      next.add(oldIdx > i ? oldIdx - 1 : oldIdx);
    }
    _obState.editing = next;
  }
  // DB 정리
  if (prevDbId) { try { await deleteExercise(prevDbId); } catch (e) { console.warn('[remove-item] delete fail:', e?.message || e); } }
  _openReviewScreen();
  try {
    const { showToast } = await import('../../home/utils.js');
    showToast(`'${removed.name}' 제거됨`, 3000, 'success', {
      action: '실행 취소',
      onAction: async () => {
        // 캡처된 i는 이후 다른 삭제/추가로 stale일 수 있음 → 현재 길이로 clamp.
        const insertAt = Math.min(i, _obState.parsed.length);
        const restoreEntry = { ...removed, dbId: null };
        _obState.parsed.splice(insertAt, 0, restoreEntry);
        // editing 재시프트: 삭제 때 인덱스가 당겨졌던 것을 되돌림 (insertAt 이상은 +1)
        if (_obState.editing && _obState.editing.size > 0) {
          const shifted = new Set();
          for (const idxE of _obState.editing) {
            shifted.add(idxE >= insertAt ? idxE + 1 : idxE);
          }
          _obState.editing = shifted;
        }
        // dbId는 복원 후 다시 저장되며 새로 발급됨 — 쓸 때 insertAt(식별자)으로 써야 이후 splice에 안 밀림
        try {
          const gymId = _obState.draftGymId || getExpertPreset().draftGymId;
          if (gymId && removed.movementId && removed.movementId !== 'unknown') {
            const mov = MOVEMENTS.find(m => m.id === removed.movementId);
            if (mov) {
              const { _generateId } = await import('../../data/data-core.js');
              const exId = _generateId();
              const hasMuscles = Array.isArray(removed.muscleIds) && removed.muscleIds.length > 0;
              await saveExercise({
                id: exId,
                muscleId: mov.primary,
                muscleIds: hasMuscles ? [...removed.muscleIds] : undefined,
                name: removed.name,
                movementId: removed.movementId,
                brand: removed.brand || '',
                machineType: removed.machineType || '',
                maxWeightKg: removed.maxKg || null,
                incrementKg: removed.incKg || mov.stepKg || 2.5,
                weightUnit: removed.weightUnit || 'kg',
                gymId,
                notes: '',
              });
              // splice한 객체 레퍼런스에 직접 쓰기 (이후 추가 삭제/삽입에도 올바른 행에 붙음)
              restoreEntry.dbId = exId;
            }
          }
        } catch (e) { console.warn('[remove-item undo] save fail:', e?.message || e); }
        _openReviewScreen();
      },
    });
  } catch {}
}

function _calcCoverage(parsed) {
  const set = new Set();
  for (const p of parsed) {
    if (!p.movementId || p.movementId === 'unknown') continue;
    const mov = MOVEMENTS.find(m => m.id === p.movementId);
    if (mov?.pattern) set.add(mov.pattern);
  }
  return { set, covered: set.size };
}

function _patternLabel(p) {
  return ({
    horizontal_push: '수평 Push',
    vertical_push:   '수직 Push',
    horizontal_pull: '수평 Pull',
    vertical_pull:   '수직 Pull',
    squat:   '스쿼트',
    hinge:   '힌지',
    lunge:   '런지',
    isolation: '고립',
    core:    '코어',
  }[p] || p);
}

// P3-12: 커버리지 수치 대신 "이 헬스장에서 가능한 루틴 유형"을 제시.
// 수치 3/9는 의미 없고 죄책감만 유발 — 사용자에게 "가능한 것"을 말함.
function _classifyGymCapability(coverage) {
  const has = (p) => coverage.set.has(p);
  const upperPush = (has('horizontal_push') ? 1 : 0) + (has('vertical_push') ? 1 : 0);
  const upperPull = (has('horizontal_pull') ? 1 : 0) + (has('vertical_pull') ? 1 : 0);
  const lower = (has('squat') ? 1 : 0) + (has('hinge') ? 1 : 0) + (has('lunge') ? 1 : 0);
  const upper = upperPush + upperPull;
  const total = coverage.set.size;

  if (total === 0) {
    return { tone: 'empty', label: '기구 등록 필요',
             detail: '최소 2개 이상 등록하면 루틴 생성이 가능해요.' };
  }
  if (upper >= 3 && lower >= 2) {
    return { tone: 'full', label: '✨ 전신 분할 가능',
             detail: '상·하체 모두 커버돼요. PPL, 2분할, 5×5 등 다양한 루틴을 만들 수 있어요.' };
  }
  if (upper >= 3 && lower >= 1) {
    return { tone: 'full', label: '상체 중심 + 하체 보조',
             detail: '상체는 풍부, 하체는 제한적. 하체 기구를 추가하면 풀바디가 돼요.' };
  }
  if (upper >= 2 && lower === 0) {
    return { tone: 'upper', label: '상체 집중 루틴',
             detail: '하체 기구가 없어서 오늘은 상체에만 집중해요. (홈트 스쿼트·런지 병행 가능)' };
  }
  if (upper <= 1 && lower >= 2) {
    return { tone: 'lower', label: '하체 집중 루틴',
             detail: '하체 기구는 풍부, 상체는 제한적. 덤벨/바벨 등록 추천.' };
  }
  return { tone: 'limited', label: '기구 제한적',
           detail: `현재 ${total}개 패턴만 커버. 더 등록할수록 루틴이 다양해져요.` };
}

async function _commitOnboardingFinish() {
  const nextBtn = document.getElementById('expert-onb-next');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = '저장 중...'; }
  try {
    // "유효한" 기구 = movementId가 매핑됐거나 최소 하나의 muscleIds(세부 부위)가 지정된 것.
    // 2026-04-19: 과거엔 movementId 매핑만 유효로 간주해 "부위 칩만 선택한 커스텀 기구"를
    // 완료 시점에 전부 삭제해버렸음(드래프트 저장은 muscleIds-only도 허용). → 리뷰 화면에서
    // 공들여 칩으로 분류한 레코드가 완료 누르면 사라짐. 이제 둘 중 하나만 있어도 유효.
    const _isMapped = (p) => {
      const hasMv = p.movementId && p.movementId !== 'unknown';
      const hasMuscles = Array.isArray(p.muscleIds) && p.muscleIds.length > 0;
      return hasMv || hasMuscles;
    };
    const validParsed = _obState.parsed.filter(_isMapped);
    const skippedCount = _obState.parsed.length - validParsed.length;
    if (skippedCount > 0) {
      _toast(`동작/부위 미지정 ${skippedCount}개는 건너뛰었어요. 나중에 수동 추가하세요.`, 'warning');
    }

    // Phase 2: 드래프트가 있으면 재사용. 아직 저장 안 된 신규 항목만 추가 저장.
    // _persistOnboardingDraft가 gym 생성/갱신 + dbId 없는 items 저장까지 담당.
    await _persistOnboardingDraft();

    // 미지원(unsupported)으로 남은 dbId 있는 레코드만 DB에서 정리.
    // movementId도 없고 muscleIds도 비어 있는 "완전 미매핑" 레코드만 삭제.
    for (const p of _obState.parsed) {
      if (!p.dbId) continue;
      if (!_isMapped(p)) {
        await deleteExercise(p.dbId).catch(() => {});
        p.dbId = null;
      }
    }

    const gymId = _obState.draftGymId || getExpertPreset().draftGymId;
    const existingPreset = getExpertPreset();
    // 이미 currentGymId가 있으면 유지 (멀티짐 추가 시나리오 — 오늘 쓰는 헬스장 변경 X).
    // 최초 완료면 이번 gymId를 current로.
    const nextCurrentGymId = existingPreset.currentGymId || gymId;
    await saveExpertPreset({
      enabled: true,
      snoozedUntil: null,
      goal: _obState.goal,
      daysPerWeek: _obState.daysPerWeek,
      sessionMinutes: _obState.sessionMinutes,
      preferMuscles: [..._obState.preferMuscles],
      avoidMuscles:  [..._obState.avoidMuscles],
      forbiddenMovements: _obState.forbiddenMovements,
      preferredRpe: _obState.preferredRpe,
      currentGymId: nextCurrentGymId,
      draftGymId: null,
    });
    _renderDoneScreen();
  } catch (e) {
    console.warn('[expert-onb] finish failed:', e);
    _toast('저장 실패 — 다시 시도해주세요.', 'error');
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = '다시 저장'; nextBtn.onclick = _commitOnboardingFinish; }
  }
}

function _renderDoneScreen() {
  _obState.phase = 'done';
  const content = document.getElementById('expert-onb-content');
  const nextBtn = document.getElementById('expert-onb-next');
  const ghost   = document.getElementById('expert-onb-ghost');
  const backBtn = document.getElementById('expert-onb-back');
  const skipBtn = document.getElementById('expert-onb-skip');
  const stepper = document.getElementById('expert-onb-stepper');
  const title   = document.getElementById('expert-onb-title');
  if (title) title.textContent = '준비 완료';
  if (backBtn) backBtn.style.display = 'none';
  if (skipBtn) skipBtn.style.display = 'none';
  if (stepper) stepper.style.display = 'none';
  const nameById = Object.fromEntries(getMuscleParts().map(m => [m.id, m.name]));
  const preferNames = [..._obState.preferMuscles].map(id => nameById[id] || id).join(' · ') || '-';
  const avoidNames  = [..._obState.avoidMuscles].map(id => nameById[id] || id).join(' · ') || '-';
  const forbidNames = _obState.forbiddenMovements.map(_moveLabel).join(' · ') || '-';
  // Phase 3: 등록된 모든 헬스장 목록 (멀티짐 누적 표시)
  const allGyms = getGyms();
  const gymListHtml = allGyms.map(g => {
    const n = getGymExList(g.id).length;
    return `<div class="done-gym-row">🏋️ ${_esc(g.name)} <span class="done-gym-count">기구 ${n}개</span></div>`;
  }).join('');
  content.innerHTML = `
    <div class="success-icon">✓</div>
    <div class="success-title">준비 완료!</div>
    <div class="success-sub">바로 오늘의 루틴을 만들어볼까요?</div>
    <div class="summary-box">
      <div class="summary-row"><span class="summary-key">목표</span><span class="summary-val">${_goalLabel(_obState.goal)}</span></div>
      <div class="summary-row"><span class="summary-key">빈도 · 시간</span><span class="summary-val">주 ${_obState.daysPerWeek}회 · ${_obState.sessionMinutes}분</span></div>
      <div class="summary-row"><span class="summary-key">선호 부위</span><span class="summary-val">${preferNames}</span></div>
      <div class="summary-row"><span class="summary-key">기피 · 금지</span><span class="summary-val">${avoidNames} · ${forbidNames}</span></div>
    </div>
    <div class="section-label" style="margin-top:18px;">등록된 헬스장 <span style="color:var(--text-disabled); font-weight:500; text-transform:none;">${allGyms.length}곳</span></div>
    <div class="done-gym-list">${gymListHtml || '<div class="hero-sub-in">-</div>'}</div>
    <button type="button" class="btn btn-tonal done-add-gym-btn" onclick="expertOnbAddAnotherGym()" style="margin-top:14px; width:100%;">+ 다른 헬스장도 추가</button>
    <div class="hero-sub-in" style="font-size:12px; text-align:center; margin-top:20px;">
      설정은 언제든 운동탭 상단의 헬스장 카드에서 수정할 수 있어요.
    </div>
  `;
  // Primary는 바로 Scene 10 진입, Ghost는 "나중에"
  if (nextBtn) { nextBtn.textContent = '오늘의 루틴 만들기'; nextBtn.disabled = false; nextBtn.onclick = () => { expertOnbClose(); if (typeof window.openRoutineSuggest === 'function') window.openRoutineSuggest(); else if (typeof window.renderAll === 'function') window.renderAll(); }; }
  if (ghost)   { ghost.style.display = 'block'; ghost.textContent = '나중에'; ghost.onclick = () => { expertOnbClose(); if (typeof window.renderAll === 'function') window.renderAll(); }; }
  _toast('프로 모드 설정 완료!', 'success');
}

// Phase 3: done 화면에서 "+ 다른 헬스장 추가" — goal/freq/preference는 유지하고 Step 5만 재진입
export function expertOnbAddAnotherGym() {
  const preset = getExpertPreset();
  // wizard 값은 유지, gym/equipment/draft 초기화
  _obState.phase = 'wizard';
  _obState.step = 5;
  _obState.startStep = 5;
  _obState.gymName = '';
  _obState.equipmentRaw = '';
  _obState.parsed = [];
  _obState.editing = new Set();
  _obState.activeEntryTab = 'text';
  _obState.pendingImageBase64 = null;
  _obState.draftGymId = null;
  // preset값 보존 (사용자가 Step 2-4 다시 안 하도록)
  _obState.goal = preset.goal || _obState.goal;
  _obState.daysPerWeek = preset.daysPerWeek || _obState.daysPerWeek;
  _obState.sessionMinutes = preset.sessionMinutes || _obState.sessionMinutes;
  _obState.preferMuscles = new Set(preset.preferMuscles || [..._obState.preferMuscles]);
  _obState.avoidMuscles = new Set(preset.avoidMuscles || [..._obState.avoidMuscles]);
  _obState.forbiddenMovements = preset.forbiddenMovements || _obState.forbiddenMovements;
  _obState.preferredRpe = preset.preferredRpe || _obState.preferredRpe;
  _renderOnboardingStep();
}

function _goalLabel(id) {
  return ({hypertrophy:'근비대', cut:'감량', power:'파워 향상', beginner:'초보 적응', rehab:'재활'}[id]) || '-';
}
