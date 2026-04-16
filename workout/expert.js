// ================================================================
// workout/expert.js — 전문가 모드 orchestration
// ----------------------------------------------------------------
// - Scene 01 배너 표시/숨김 판정
// - Scene 02~08 5단계 wizard state machine + 렌더
// - Scene 06~07 gym-equipment 3-tab 등록 + 파싱 리뷰 (AI 호출)
// - _settings.expert_preset 저장, Gym/Exercise 일괄 저장
// ================================================================

import {
  getExpertPreset, saveExpertPreset, isExpertModeEnabled,
  saveGym, getGyms, saveExercise, deleteExercise, getExList, getGymExList, getCache,
  getRecentRoutineTemplate, getRoutineTemplates,
  detectPRs as _detectPRsFromData,
  getVolumeHistory as _getVolumeHistory,
  dateKey, TODAY,
} from '../data.js';
import { MUSCLES, MOVEMENTS, MOVEMENT_PATTERNS } from '../config.js';
import { parseEquipmentFromText, parseEquipmentFromImage } from '../ai.js';
import { S } from './state.js';

// ── Onboarding 내부 state ────────────────────────────────────────
// phase: 'wizard' (step 1~5) | 'review' (파싱 리뷰) | 'done' (완료)
// review/done은 가짜 step이 아니라 별도 phase로 관리해서 back/next onclick이 꼬이지 않게 함.
// draftGymId: 드래프트 DB 저장 시 발급받은 gymId — 리뷰 편집이 이 gym에 반영됨.
//             완료 시 preset.draftGymId=null로 정리, 중단 시 다음 진입 때 복원.
const _obState = {
  phase: 'wizard',
  step: 1,
  startStep: 1,              // Back 버튼이 close로 동작할 하한선 (기구-only 진입 시 5)
  goal: null,
  daysPerWeek: 4,
  sessionMinutes: 60,
  preferMuscles: new Set(),
  avoidMuscles: new Set(),
  forbiddenMovements: [],
  preferredRpe: '7-8',
  gymName: '',
  equipmentRaw: '',
  parsed: [],                // [{name, brand?, machineType?, maxKg?, incKg?, weightUnit, movementId, confidence, dbId?}]
  editing: new Set(),        // 리뷰 화면에서 select로 전환된 기구 인덱스
  activeEntryTab: 'text',    // 'text'|'photo'|'manual'
  pendingImageBase64: null,
  draftGymId: null,          // 드래프트 저장 gym id
};

// 메인 stepper Step 2(_suggestState)가 preset 값으로 최초 초기화됐는지 플래그.
// false면 renderExpertTopArea 첫 호출에서 preset.preferMuscles / sessionMinutes / preferredRpe를 주입.
let _stepperSeeded = false;

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

// ── Scene 09 · 운동탭 상단 전문가 카드 (Mockup A — One Card Stepper) ──
// 구조: 모드 배지(전문가/일반 전환) → 카드(헤더 + 세그먼트 + 3-스텝)
// 상태 'done' → 3-스텝 표시 / 'skip'·'health' → 안내 메시지
export function renderExpertTopArea() {
  const host = document.getElementById('expert-top-area');
  if (!host) return;

  // preset 비활성 → 최상단 배너 제거, 헬스 종목 헤더 옆 작은 pill만 노출
  if (!isExpertModeEnabled()) {
    host.innerHTML = '';
    _syncExpertFlowClass(false);
    _syncStep3ReadyClass(false);
    _renderInlineExpertPill();
    return;
  }
  // 활성 상태 — 최상단 카드 표시, inline pill 숨김
  _renderInlineExpertPill();
  _syncExpertFlowClass(true);

  // 프로 모드에는 상태 선택 UI가 없으므로 skip/health 외 값('none'/'done'/undefined)은
  // 모두 'done'으로 정규화. fresh day(load.js가 'none' 로드)에도 step3가 열리도록.
  const rawStatus = S.gymStatus;
  const status = (rawStatus === 'skip' || rawStatus === 'health') ? rawStatus : 'done';
  const currentGymId = _resolveCurrentGymId();
  const currentGym = getGyms().find(g => g.id === currentGymId) || null;
  const gymCount = getGyms().length;
  const exCount = currentGymId ? getGymExList(currentGymId).length : 0;
  const insight = _summarizeExpertInsight();
  const recent = _safeGetRecentRoutine();
  const hasRoutine = _hasSelectedRoutine();
  const step1Done = !!currentGym && exCount > 0;
  const stepNum = !step1Done ? 1 : (!hasRoutine ? 2 : 3);

  // 모든 스텝 완료 + 운동 상태 → 아래 헬스 종목 섹션 표시 허용
  _syncStep3ReadyClass(status === 'done' && step1Done && hasRoutine);

  // P2-9: 상태별 타이틀/메타도 함께 바뀌어야 의미 일치 — STEP 표시는 운동일 때만
  const headTitle = (status === 'skip') ? '😴 오늘은 쉬었어요'
                  : (status === 'health') ? '🩹 건강이슈로 쉼'
                  : '🏋️ 오늘의 운동';
  const headMetaHtml = (status === 'done')
    ? `<div class="wt-exc-meta">STEP ${stepNum} / 3</div>` : '';

  const bodyHtml =
    (status === 'skip')
      ? `<div class="wt-st-info"><b>쉬었어요</b>로 저장됩니다. 기록이 남지 않고 토마토도 적립되지 않아요.</div>`
    : (status === 'health')
      ? `<div class="wt-st-info"><b>건강이슈</b>로 저장됩니다. 기록은 남지 않지만 토마토는 계속 적립돼요.</div>`
    : _renderExpertStepperBody({ currentGym, gymCount, exCount, insight, step1Done, hasRoutine, recent });

  // 통합 TDS SegmentedControl — [프로 모드 | 일반 모드]로 토글 명확화.
  // 프로 모드에서는 기본적으로 '운동'을 하는 사용자이므로 쉬었어요/건강이슈/운동 세그먼트 제거.
  host.innerHTML = `
    <div class="wt-mode-seg" role="tablist" aria-label="운동 모드">
      <button type="button" class="wt-mode-seg-btn is-on" role="tab" aria-selected="true">프로 모드</button>
      <button type="button" class="wt-mode-seg-btn" role="tab" aria-selected="false" onclick="wtExcLeaveExpertMode()">일반 모드</button>
    </div>
    <div class="wt-exc" id="wt-expert-card">
      <div class="wt-exc-head">
        <div class="wt-exc-title">${headTitle}</div>
        ${headMetaHtml}
      </div>
      ${bodyHtml}
    </div>
  `;

  // 카루셀 스크롤/스냅 동작 초기화 — double-RAF로 레이아웃 완료 후 측정
  requestAnimationFrame(() => requestAnimationFrame(_setupGymCarousel));

  // Step 2 chip/segmented 클릭 — host에 한 번만 등록 (innerHTML 재렌더 후에도 유지)
  if (!host.dataset.stepperBound) {
    host.dataset.stepperBound = '1';
    host.addEventListener('click', (e) => {
      const muscleBtn = e.target.closest('[data-muscle]');
      if (muscleBtn) {
        const id = muscleBtn.getAttribute('data-muscle');
        if (_suggestState.targets.has(id)) _suggestState.targets.delete(id);
        else _suggestState.targets.add(id);
        renderExpertTopArea();
        return;
      }
      const minsBtn = e.target.closest('[data-mins]');
      if (minsBtn) {
        _suggestState.sessionMinutes = +minsBtn.getAttribute('data-mins') || 60;
        renderExpertTopArea();
        return;
      }
      const rpeBtn = e.target.closest('[data-rpe]');
      if (rpeBtn) {
        _suggestState.preferredRpe = rpeBtn.getAttribute('data-rpe');
        renderExpertTopArea();
      }
    });
  }
}

// ── 헬스장 캐러셀 — 좌우 양쪽 fade 프리뷰 + 중앙 자동 선택 ───────────
// 스와이프(scroll-snap) + 탭(scrollIntoView)으로 선택 가능.
// 중앙 슬라이드 감지 후 220ms 디바운스로 _switchToGym() 호출.
function _setupGymCarousel() {
  const scroll = document.getElementById('wt-gym-scroll');
  if (!scroll || scroll.dataset.carouselInit === '1') return;
  scroll.dataset.carouselInit = '1';

  const slides = Array.from(scroll.querySelectorAll('.wt-gym-slide'));
  if (slides.length === 0) return;

  // 초기 스크롤을 현재 활성(is-active) 슬라이드 중앙으로 이동
  const initial = scroll.querySelector('.wt-gym-slide.is-active')
    || scroll.querySelector('.wt-gym-slide:not(.wt-gym-slide--add)')
    || slides[0];
  if (initial && scroll.clientWidth > 0) {
    const target = initial.offsetLeft - (scroll.clientWidth - initial.offsetWidth) / 2;
    scroll.scrollLeft = Math.max(0, target);
  }

  let settleTimer = null;
  let switching = false;
  let lastCenterId = scroll.querySelector('.wt-gym-slide.is-active')?.dataset?.gymId || null;

  const updateActive = () => {
    const center = scroll.scrollLeft + scroll.clientWidth / 2;
    let closest = null, closestDist = Infinity;
    slides.forEach(s => {
      const cx = s.offsetLeft + s.offsetWidth / 2;
      const dist = Math.abs(cx - center);
      if (dist < closestDist) { closestDist = dist; closest = s; }
    });
    slides.forEach(s => s.classList.toggle('is-active', s === closest));

    clearTimeout(settleTimer);
    settleTimer = setTimeout(async () => {
      if (switching) return;
      if (!closest || closest.classList.contains('wt-gym-slide--add')) return;
      const gymId = closest.dataset.gymId;
      if (!gymId || gymId === lastCenterId) return;
      lastCenterId = gymId;
      switching = true;
      try { await _switchToGym(gymId); }
      catch (e) { console.warn('[gymCarouselSwitch]:', e); }
      finally { switching = false; }
    }, 220);
  };

  scroll.addEventListener('scroll', updateActive, { passive: true });

  // 탭하여 중앙으로 — 드래그가 어려운 환경(좁은 트랙패드, 짧은 스와이프) 보완.
  // +추가 슬라이드는 onclick이 이미 wtExcAddNewGym/expertOnbOpen을 호출하므로 제외.
  slides.forEach(slide => {
    if (slide.classList.contains('wt-gym-slide--add')) return;
    slide.addEventListener('click', (e) => {
      // 편집 아이콘 클릭이면 관리 시트 오픈 (우선순위 — 중앙 스크롤 skip)
      const editTarget = e.target.closest('[data-gym-edit]');
      if (editTarget) {
        e.preventDefault();
        e.stopPropagation();
        const gid = editTarget.getAttribute('data-gym-edit');
        if (gid && typeof window.expertGymManageOpen === 'function') window.expertGymManageOpen(gid);
        return;
      }
      // 일반 탭 → 중앙 스크롤 (scroll 이벤트 → updateActive → _switchToGym 체인)
      e.preventDefault();
      try {
        slide.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } catch {
        const target = slide.offsetLeft - (scroll.clientWidth - slide.offsetWidth) / 2;
        scroll.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      }
    });
    // 더블클릭 — 비활성 슬라이드에서도 바로 관리 시트 진입 가능 (보조 경로)
    slide.addEventListener('dblclick', (e) => {
      const gid = slide.dataset.gymId;
      if (!gid) return;
      e.preventDefault();
      if (typeof window.expertGymManageOpen === 'function') window.expertGymManageOpen(gid);
    });
  });
}

function _syncExpertFlowClass(on) {
  const flow = document.getElementById('wt-flow');
  if (flow) flow.classList.toggle('wt-expert-on', !!on);
  // 뱃지 숨김도 직접 클래스 토글 (구형 WebView에 :has() 미지원 대비)
  const badge = document.getElementById('wt-selected-badge');
  if (badge) badge.classList.toggle('is-expert', !!on);
}

function _syncStep3ReadyClass(on) {
  const flow = document.getElementById('wt-flow');
  if (flow) flow.classList.toggle('wt-step3-ready', !!on);
}

function _safeGetRecentRoutine() {
  try {
    const r = getRecentRoutineTemplate();
    if (!r) return null;
    const gymId = _resolveCurrentGymId();
    if (gymId && r.gymId && r.gymId !== gymId) return null;
    return r;
  } catch { return null; }
}

function _hasSelectedRoutine() {
  // routineMeta가 있어야 "루틴 선택됨" — 단순 exercises.length로 판정하면
  // 이전 헬스장에서 들고 있던 운동 배열이 남아있을 때 false-positive.
  try {
    if (!S.routineMeta) return false;
    return Array.isArray(S.exercises) && S.exercises.length > 0;
  } catch { return false; }
}

function _renderExpertStepperBody({ currentGym, gymCount, exCount, insight, step1Done, hasRoutine, recent }) {
  // Step 1 — 헬스장 선택 캐러셀 (좌우 스와이프 + 중앙 자동선택 + 양끝 추가 버튼)
  const s1Class = step1Done ? 'is-done' : 'is-active';
  const s1Dot = step1Done ? '✓' : '1';
  const gyms = getGyms();
  const currentId = _resolveCurrentGymId();

  // 헬스장이 없으면 "등록" 슬라이드 하나만. 있으면 양쪽에 + 추가 슬라이드 붙여
  // "스와이프하면 더 있다"는 시각적 힌트 제공 (1개일 때도 양쪽 추가 가능).
  let slidesHtml;
  if (gyms.length === 0) {
    // preset은 이미 Step 1-4에서 저장됨. 여기서는 Step 5(헬스장+기구) 모달만 바로 열기.
    slidesHtml = `
      <button type="button" class="wt-gym-slide wt-gym-slide--add wt-gym-slide--empty is-active" onclick="expertOnbOpenForNewGym()">
        <span class="wt-gym-slide-icon">＋</span>
        <div class="wt-gym-slide-name">헬스장 등록</div>
        <div class="wt-gym-slide-sub">탭하여 시작</div>
      </button>
    `;
  } else {
    const gymSlides = gyms.map(g => {
      const isActive = g.id === currentId;
      const n = getGymExList(g.id).length;
      const subText = n === 0 ? '⚠ 기구 등록 필요' : `기구 ${n}개`;
      // 활성 슬라이드에만 편집 아이콘 (기구 CRUD 진입점). 더블클릭도 동일 핸들러.
      const editIcon = isActive
        ? `<span class="wt-gym-slide-edit" data-gym-edit="${_esc(g.id)}" role="button" aria-label="기구 관리" title="기구 관리">✏️</span>`
        : '';
      return `
        <button type="button" class="wt-gym-slide${isActive ? ' is-active' : ''}" data-gym-id="${_esc(g.id)}">
          <span class="wt-gym-slide-icon">🏋️</span>
          <div class="wt-gym-slide-name">${_esc(g.name)}</div>
          <div class="wt-gym-slide-sub">${_esc(subText)}</div>
          ${editIcon}
        </button>
      `;
    }).join('');
    slidesHtml = `
      <button type="button" class="wt-gym-slide wt-gym-slide--add" data-gym-add="1" onclick="wtExcAddNewGym()">
        <span class="wt-gym-slide-icon">＋</span>
        <div class="wt-gym-slide-name">추가</div>
      </button>
      ${gymSlides}
      <button type="button" class="wt-gym-slide wt-gym-slide--add" data-gym-add="1" onclick="wtExcAddNewGym()">
        <span class="wt-gym-slide-icon">＋</span>
        <div class="wt-gym-slide-name">추가</div>
      </button>
    `;
  }
  const placeHtml = `
    <div class="wt-gym-carousel" id="wt-gym-carousel">
      <div class="wt-gym-scroll" id="wt-gym-scroll">${slidesHtml}</div>
    </div>
  `;

  // Step 2 — 운동 부위 + 시간/RPE 선택 (AI 생성 입력)
  // preset → _suggestState 최초 seed (사용자가 선택 변경하면 그 이후 자신의 선택 유지)
  if (!_stepperSeeded) {
    _stepperSeeded = true;
    const p = getExpertPreset();
    if (Array.isArray(p.preferMuscles) && p.preferMuscles.length) {
      _suggestState.targets = new Set(p.preferMuscles);
    }
    _suggestState.sessionMinutes = p.sessionMinutes || 60;
    _suggestState.preferredRpe = p.preferredRpe || '7-8';
  }
  const hasTargets = _suggestState.targets.size > 0;
  const s2Class = hasTargets ? 'is-done' : (step1Done ? 'is-active' : '');
  const s2Dot = hasTargets ? '✓' : '2';
  const muscleIds = ['back','bicep','shoulder','chest','tricep','abs','lower'];
  const musclesById = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));
  const minsOpts = [45, 60, 90];
  const rpeOpts = [['6-7','낮음 6-7'], ['7-8','보통 7-8'], ['8-9','높음 8-9']];
  const step2Body = `
    <div class="wt-picker-block">
      <div class="wt-picker-label">부위 <span class="wt-picker-hint">복수선택</span></div>
      <div class="chips">
        ${muscleIds.map(id => {
          const sel = _suggestState.targets.has(id);
          return `<button type="button" class="chip${sel ? ' prefer' : ''}" data-muscle="${id}">${sel ? '<span class="mark">✓</span>' : ''}${_esc(musclesById[id] || id)}</button>`;
        }).join('')}
      </div>
    </div>
    <div class="wt-picker-block">
      <div class="wt-picker-label">세션 시간</div>
      <div class="segmented">
        ${minsOpts.map(m => `<button type="button" class="seg-item${_suggestState.sessionMinutes===m?' active':''}" data-mins="${m}">${m}분</button>`).join('')}
      </div>
    </div>
    <div class="wt-picker-block">
      <div class="wt-picker-label">강도 (선호 RPE)</div>
      <div class="segmented">
        ${rpeOpts.map(([v,label]) => `<button type="button" class="seg-item${_suggestState.preferredRpe===v?' active':''}" data-rpe="${v}">${label}</button>`).join('')}
      </div>
    </div>
  `;

  // Step 3 — AI 루틴 생성하기 (Step 1+2 완료 시 활성)
  const canGenerate = step1Done && hasTargets;
  const s3Class = hasRoutine ? 'is-done' : (canGenerate ? 'is-active' : '');
  const s3Dot = hasRoutine ? '✓' : '3';
  const step3Body = `
    <button class="wt-ai-cta" type="button" onclick="openRoutineCandidatesDirect()"${!canGenerate ? ' disabled' : ''}>
      AI 루틴 생성하기
    </button>
    <button class="wt-manual-nudge" type="button" onclick="wtOpenExercisePicker()"${!step1Done ? ' disabled' : ''}>직접 선택할 수도 있어요.</button>
  `;

  return `
    <div class="wt-step ${s1Class}">
      <div class="wt-step-rail">
        <div class="wt-step-dot">${s1Dot}</div>
        <div class="wt-step-line"></div>
      </div>
      <div class="wt-step-body">
        <div class="wt-step-label">헬스장 선택</div>
        ${placeHtml}
      </div>
    </div>
    <div class="wt-step ${s2Class}">
      <div class="wt-step-rail">
        <div class="wt-step-dot">${s2Dot}</div>
        <div class="wt-step-line"></div>
      </div>
      <div class="wt-step-body">
        <div class="wt-step-label">운동 부위·시간</div>
        ${step2Body}
      </div>
    </div>
    <div class="wt-step ${s3Class}">
      <div class="wt-step-rail">
        <div class="wt-step-dot">${s3Dot}</div>
      </div>
      <div class="wt-step-body">
        <div class="wt-step-label">AI 루틴 생성${!step1Done ? ' <span class="wt-step-label-dim">· 헬스장 등록 필요</span>' : (!hasTargets ? ' <span class="wt-step-label-dim">· 부위 선택 필요</span>' : '')}</div>
        ${step3Body}
      </div>
    </div>
  `;
}

function _summarizeExpertInsight() {
  try {
    const gymId = _resolveCurrentGymId();
    const exList = gymId ? getGymExList(gymId) : getExList();
    const prLines = [];
    let totalProgress = 0, progressCount = 0;
    for (const ex of exList.slice(0, 30)) {  // 상위 30개만 스캔
      const pr = _cachedDetectPRs(ex.id);
      if (pr.progressKg > 0 && pr.lastKg > 0 && progressCount < 2) {
        const prev = pr.lastKg - pr.progressKg;
        prLines.push(`${ex.name} <b>${prev} → ${pr.lastKg}kg</b>`);
        totalProgress += pr.progressKg;
        progressCount++;
      }
    }
    // Issue 2: 실제 progress 데이터가 없으면 hasData=false로 반환 → dim 스타일 사용.
    // 기존 로직은 exList만 있으면 hasData=true로 반환해 primary 스타일 적용 → 폰트 어색함.
    if (progressCount === 0) {
      return { hasData: false, title: '', body: '기록이 쌓이면 무게 변화를 여기서 보여드릴게요' };
    }
    return {
      hasData: true,
      title: '이번 주 운동 흐름이 좋아요',
      body: `${prLines.join(', ')}<br/>점진 과부하 진행 중 · 자세히 보기 →`,
    };
  } catch { return { hasData: false, title: '', body: '' }; }
}

function _cachedDetectPRs(exId) {
  try { return _detectPRsFromData(exId); }
  catch { return { progressKg: 0, lastKg: 0 }; }
}

function _buildRecentHistory(gymExercises) {
  const cache = getCache();
  const today = new Date(TODAY);
  const history = [];
  const exIds = new Set(gymExercises.map(e => e.id));
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    const day = cache[key];
    if (!day?.exercises) continue;
    for (const entry of day.exercises) {
      if (!exIds.has(entry.exerciseId)) continue;
      const workSets = (entry.sets || []).filter(s => s.setType !== 'warmup' && s.done !== false && (s.kg || 0) > 0);
      if (!workSets.length) continue;
      const topSet = workSets.reduce((a, b) => ((a.kg || 0) >= (b.kg || 0) ? a : b), workSets[0]);
      history.push({
        exerciseId: entry.exerciseId,
        date: key,
        topKg: topSet.kg || 0,
        topReps: topSet.reps || 0,
      });
    }
  }
  return history;
}

export function shouldShowExpertBanner() {
  const p = getExpertPreset();
  if (p.enabled) return false;
  if (p.snoozedUntil) {
    const today = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    if (today < p.snoozedUntil) return false;
  }
  return true;
}

export function renderExpertBanner() {
  // 레거시 호환 유지 — 현재는 _renderInlineExpertPill이 배너 역할을 대신함.
  // 최상단 배너는 Issue 4로 제거됨. 필요 시 이 함수로 긴 배너 복원 가능.
  if (!shouldShowExpertBanner()) return '';
  return `
    <div class="expert-banner" onclick="expertOnbOpen()">
      <div class="expert-banner-icon">🧪</div>
      <div>
        <div class="expert-banner-title">AI가 내 헬스장 루틴 짜드려요</div>
        <div class="expert-banner-sub">2분이면 시작 · 기구는 나중에 추가할 수 있어요</div>
      </div>
      <div class="expert-banner-arrow">›</div>
    </div>
  `;
}

// Issue 4: 헬스 종목 헤더 옆 인라인 pill — expert 모드 OFF일 때만 노출.
// 최초 사용자 vs 복귀 사용자 카피를 분기 (Issue 3 재활성화 경로).
function _renderInlineExpertPill() {
  const host = document.getElementById('expert-inline-pill');
  if (!host) return;
  if (isExpertModeEnabled()) { host.innerHTML = ''; return; }
  // 스누즈 중이면 숨김 (사용자가 '나중에'를 눌러 스누즈한 경우 존중)
  if (!shouldShowExpertBanner()) { host.innerHTML = ''; return; }
  const preset = getExpertPreset();
  // 복귀 사용자 판별: 이전에 완료한 기록이 있으면 (currentGymId 또는 저장된 gym)
  const isReturning = !!preset.currentGymId || getGyms().length > 0;
  if (isReturning) {
    host.innerHTML = `
      <button type="button" class="expert-pill expert-pill--returning" onclick="wtExcReEnableExpertMode()">
        <span class="expert-pill-ico">⚡</span>
        <span class="expert-pill-label">프로 모드 켜기</span>
      </button>
    `;
  } else {
    host.innerHTML = `
      <button type="button" class="expert-pill" onclick="expertOnbOpen()">
        <span class="expert-pill-ico">✨</span>
        <span class="expert-pill-label">프로 모드 켜기</span>
      </button>
    `;
  }
}

// ── Modal 컨트롤 ─────────────────────────────────────────────────

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
      const exList = getGymExList(gym.id);
      _obState.parsed = exList.map(ex => ({
        name: ex.name,
        brand: ex.brand || '',
        machineType: ex.machineType || '',
        maxKg: ex.maxWeightKg || null,
        incKg: ex.incrementKg || 2.5,
        weightUnit: ex.weightUnit || 'kg',
        movementId: ex.movementId,
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
      const exList = getGymExList(existingGymId);
      _obState.parsed = exList.map(ex => ({
        name: ex.name,
        brand: ex.brand || '',
        machineType: ex.machineType || '',
        maxKg: ex.maxWeightKg || null,
        incKg: ex.incrementKg || 2.5,
        weightUnit: ex.weightUnit || 'kg',
        movementId: ex.movementId,
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
  const muscles = ['back','shoulder','chest','bicep','tricep','abs','lower'];
  const nameById = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));
  return `
    <div class="hero-title-in">더 키우고 싶은,<br/>피하고 싶은 부위가 있나요?</div>
    <div class="hero-sub-in">탭할수록 <b style="color:var(--primary);">선호 ♥</b> → 중립 → <s>기피</s> 순으로 바뀝니다.</div>
    <div class="section-label">부위</div>
    <div class="chips" id="expert-prefer-chips">
      ${muscles.map(id => {
        const prefer = _obState.preferMuscles.has(id);
        const avoid  = _obState.avoidMuscles.has(id);
        const cls = prefer ? 'chip prefer' : (avoid ? 'chip avoid' : 'chip');
        const mark = prefer ? '<span class="mark">♥</span>' : '';
        return `<div class="${cls}" data-muscle="${id}">${mark}${nameById[id] || id}</div>`;
      }).join('')}
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

function _esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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

function _toast(msg, type='info') {
  if (typeof window.showToast === 'function') window.showToast(msg, 2200, type);
}

// 단일 진실원 — preset과 S.currentGymId를 항상 같이 동기화한다.
// stale/deleted gym이면 자동 복구(첫 번째 gym으로 fallback)도 여기서 처리.
// exercises.js picker 등 외부 모듈도 이 함수만 사용해야 한다.
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
  // S.currentGymId 동기화 — picker/저장 경로가 같은 값을 보게 함
  if (S.currentGymId !== resolvedId) S.currentGymId = resolvedId;
  return resolvedId;
}
// 기존 내부 호출 호환 — 같은 함수
const _resolveCurrentGymId = resolveCurrentGymId;

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
  const { _generateId } = await import('../data/data-core.js');
  let gymId = _obState.draftGymId || getExpertPreset().draftGymId || null;
  if (!gymId) gymId = _generateId();
  // gym 저장 (setDoc 덮어쓰기 — 같은 id면 이름만 업데이트)
  await saveGym({ id: gymId, name: _obState.gymName, createdAt: Date.now() });
  if (_obState.draftGymId !== gymId) {
    _obState.draftGymId = gymId;
    await saveExpertPreset({ draftGymId: gymId });
  }
  // 각 parsed 중 dbId 없고 movementId 유효한 것만 신규 저장
  for (const p of _obState.parsed) {
    if (p.dbId) continue;
    if (!p.movementId || p.movementId === 'unknown') continue;
    const mov = MOVEMENTS.find(m => m.id === p.movementId);
    if (!mov) continue;
    const exId = _generateId();
    await saveExercise({
      id: exId,
      muscleId: mov.primary,
      name: p.name,
      movementId: p.movementId,
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

  // 후방 호환: 옛 mappingState 없는 데이터(수동 추가 등) → movementId로 추론
  const stateOf = (p) => {
    if (p.mappingState) return p.mappingState;
    if (!p.movementId || p.movementId === 'unknown') return 'ambiguous';
    return 'mapped';
  };

  const rows = _obState.parsed.map((p, i) => {
    const state = stateOf(p);
    const editing = _obState.editing.has(i);

    let icon, iconClass, rowClass, movementCell;
    if (state === 'unsupported' && !editing) {
      icon = '⊘'; iconClass = 'eq-skip'; rowClass = 'unsupported';
      movementCell = `
        <div class="eq-movement-skip" onclick="expertOnbEditMovement(${i})" style="cursor:pointer;" title="동작을 직접 지정">미지원</div>
      `;
    } else if (state === 'ambiguous' || editing) {
      icon = '?'; iconClass = 'eq-warn'; rowClass = 'warn';
      // subPattern으로 그룹핑된 드롭다운 (사용자 추적 관점 — 머신명보다 자극 부위 우선)
      const cands = (p.candidates || []).filter(c => c?.id);
      const candIds = new Set(cands.map(c => c.id));
      const candOpts = cands.map(c => {
        const m = MOVEMENTS.find(x => x.id === c.id);
        if (!m) return '';
        const sel = p.movementId === m.id ? ' selected' : '';
        return `<option value="${m.id}"${sel}>${_esc(m.nameKo)}</option>`;
      }).join('');
      // subPattern으로 나머지 MOVEMENTS 그룹화 (추천 후보는 상단에 별도)
      const grouped = {};
      for (const m of MOVEMENTS) {
        if (candIds.has(m.id)) continue;
        const sp = m.subPattern || 'other';
        (grouped[sp] = grouped[sp] || []).push(m);
      }
      const groupedOpts = Object.entries(grouped).map(([sp, moves]) => {
        const spLabel = _subPatternLabel(sp);
        return `<optgroup label="${_esc(spLabel)}">${moves.map(m =>
          `<option value="${m.id}"${p.movementId === m.id ? ' selected' : ''}>${_esc(m.nameKo)}</option>`
        ).join('')}</optgroup>`;
      }).join('');
      const placeholder = `<option value="unknown"${(!p.movementId || p.movementId === 'unknown') ? ' selected' : ''}>— 자극 부위 선택 —</option>`;
      const optionsHtml = candOpts
        ? `${placeholder}<optgroup label="🎯 추천 후보">${candOpts}</optgroup>${groupedOpts}`
        : `${placeholder}${groupedOpts}`;
      movementCell = `<select class="eq-movement-select warn" onchange="expertOnbAssignMovement(${i}, this.value)" autofocus>${optionsHtml}</select>`;
    } else { // mapped
      icon = '✓'; iconClass = 'eq-check'; rowClass = '';
      // subPattern을 primary 라벨로, 머신명은 sub로 — 추적/집계 친화
      const mov = MOVEMENTS.find(m => m.id === p.movementId);
      const spLabel = mov ? _subPatternLabel(mov.subPattern) : '';
      const machineLabel = mov ? mov.nameKo : _moveLabel(p.movementId);
      movementCell = `
        <div class="eq-movement eq-movement--stacked" onclick="expertOnbEditMovement(${i})" style="cursor:pointer;" title="클릭해서 변경">
          <div class="eq-movement-main">${_esc(spLabel)}</div>
          <div class="eq-movement-sub">${_esc(machineLabel)}</div>
        </div>
      `;
    }

    return `
      <div class="eq-row ${rowClass}">
        <div class="${iconClass}">${icon}</div>
        <div class="eq-body">
          <div class="eq-name">${_esc(p.name)}</div>
          <div class="eq-meta">${_esc([p.brand, p.machineType, p.maxKg?`최대 ${p.maxKg}kg`:'', p.incKg?`${p.incKg}kg 증량`:''].filter(Boolean).join(' · '))}</div>
        </div>
        ${movementCell}
      </div>
    `;
  }).join('');

  // 상태별 카운트 (헤더 메시지 용)
  const counts = { mapped: 0, ambiguous: 0, unsupported: 0 };
  _obState.parsed.forEach(p => { counts[stateOf(p)] = (counts[stateOf(p)] || 0) + 1; });

  let subMsg;
  if (counts.ambiguous === 0 && counts.unsupported === 0) {
    subMsg = `전부 자동 매핑됐어요. 변경하려면 태그를 탭하세요.`;
  } else {
    const parts = [`자동 매핑 ${counts.mapped}개`];
    if (counts.ambiguous > 0) parts.push(`확인 필요 ${counts.ambiguous}개`);
    if (counts.unsupported > 0) parts.push(`보조장비 ${counts.unsupported}개`);
    subMsg = parts.join(' · ') + ' — ⚠️ 항목만 동작을 선택해주세요.';
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

  const validCount = _obState.parsed.filter(p => p.movementId && p.movementId !== 'unknown').length;
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
          const { _generateId } = await import('../data/data-core.js');
          const exId = p.dbId || _generateId();
          await saveExercise({
            id: exId,
            muscleId: mov.primary,
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
    const validParsed = _obState.parsed.filter(p => p.movementId && p.movementId !== 'unknown');
    const skippedCount = _obState.parsed.length - validParsed.length;
    if (skippedCount > 0) {
      _toast(`동작 미매핑 ${skippedCount}개는 건너뛰었어요. 나중에 수동 추가하세요.`, 'warning');
    }

    // Phase 2: 드래프트가 있으면 재사용. 아직 저장 안 된 신규 항목만 추가 저장.
    // _persistOnboardingDraft가 gym 생성/갱신 + dbId 없는 items 저장까지 담당.
    await _persistOnboardingDraft();

    // 미지원(unsupported)으로 남은 dbId 있는 레코드는 DB에서 정리
    for (const p of _obState.parsed) {
      if (!p.dbId) continue;
      if (!p.movementId || p.movementId === 'unknown') {
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
  const nameById = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));
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

// ════════════════════════════════════════════════════════════════
// Scene 10 · 루틴 생성 모달 (부위·시간·RPE + AI 균형 nudge)
// ════════════════════════════════════════════════════════════════

const _suggestState = {
  targets: new Set(),
  sessionMinutes: 60,
  preferredRpe: '7-8',
  suggestMuscles: [],
  nudge: null,
  candidates: [],
  selectedKey: null,
};
let _nudgeRequestId = 0;

function _resetSuggestState() {
  _suggestState.targets = new Set();
  _suggestState.sessionMinutes = 60;
  _suggestState.preferredRpe = '7-8';
  _suggestState.suggestMuscles = [];
  _suggestState.nudge = null;
  _suggestState.candidates = [];
  _suggestState.selectedKey = null;
}

export async function openRoutineSuggest() {
  _resetSuggestState();
  const preset = getExpertPreset();
  _suggestState.targets = new Set(preset.preferMuscles || []);
  _suggestState.sessionMinutes = preset.sessionMinutes || 60;
  _suggestState.preferredRpe = preset.preferredRpe || '7-8';
  _openModal('routine-suggest-modal');
  _renderSuggestContent();
  // AI 균형 nudge 비동기 호출 (레이스 방지: request id)
  const myReqId = ++_nudgeRequestId;
  try {
    const { generateBalanceNudge } = await import('../ai.js');
    const { calcBalanceByPattern: _rawCalcBal } = await import('../calc.js');
    const cache = getCache();
    const gymId = _resolveCurrentGymId();
    const exList = gymId ? getGymExList(gymId) : getExList();
    const bal = _rawCalcBal(cache, exList, MOVEMENTS);
    const nudge = await generateBalanceNudge({ balanceByPattern: bal, targetMuscles: [..._suggestState.targets], preset });
    if (myReqId !== _nudgeRequestId) return;
    _suggestState.nudge = nudge;
    _suggestState.suggestMuscles = nudge.suggest || [];
    _renderSuggestContent();
  } catch (e) {
    console.warn('[balance-nudge] fail:', e?.message || e);
  }
}

export function routineSuggestClose() { _closeModal('routine-suggest-modal'); }

// Step 3의 'AI 루틴 생성하기' — stepper Step 2에서 유저가 이미 부위/시간/RPE를 설정했으므로
// 그 state를 그대로 사용하여 Scene 10 UI를 건너뛰고 progress → Scene 11 직행.
// Scene 11의 '🔄 다시 생성' 버튼으로 Scene 10 복귀하여 조정 가능.
export async function openRoutineCandidatesDirect() {
  if (_suggestState.targets.size === 0) {
    _toast('부위를 1개 이상 골라주세요', 'warning');
    return;
  }
  // 이전 결과 초기화 (targets/mins/rpe는 유지)
  _suggestState.nudge = null;
  _suggestState.candidates = [];
  _suggestState.selectedKey = null;
  _openModal('routine-suggest-modal');
  _renderGenerateProgress();
  await routineSuggestGenerate();
}

function _renderSuggestContent() {
  const content = document.getElementById('routine-suggest-content');
  if (!content) return;
  const muscles = ['back','bicep','shoulder','chest','tricep','abs','lower'];
  const nameById = Object.fromEntries(MUSCLES.map(m => [m.id, m.name]));
  const mins = [45,60,90];
  const rpeOpts = ['6-7','7-8','8-9'];
  content.innerHTML = `
    <div class="hero-sub-in" style="margin-top:6px; margin-bottom:14px;">부위와 시간만 고르면 AI가 2개 후보를 제안해요.</div>
    ${_suggestState.nudge ? `
      <div class="ai-nudge">
        <div class="ai-nudge-icon">🎯</div>
        <div>
          <div class="ai-nudge-title">${_esc(_suggestState.nudge.title || '')}</div>
          <div class="ai-nudge-body">${_suggestState.nudge.body || ''}</div>
        </div>
      </div>
    ` : ''}
    <div class="section-label" style="margin-top:6px;">오늘 부위 <span style="color:#b8b8be; font-weight:500; text-transform:none;">복수선택</span></div>
    <div class="chips" id="suggest-muscle-chips">
      ${muscles.map(id => {
        const selected = _suggestState.targets.has(id);
        const suggest = (_suggestState.suggestMuscles || []).includes(id);
        const avoid = (getExpertPreset().avoidMuscles || []).includes(id);
        const cls = selected ? 'chip prefer' : (suggest ? 'chip suggest' : (avoid ? 'chip avoid' : 'chip'));
        const mark = selected ? '<span class="mark">✓</span>' : (suggest ? '<span class="mark">💡</span>' : '');
        return `<div class="${cls}" data-muscle="${id}">${mark}${nameById[id] || id}</div>`;
      }).join('')}
    </div>
    <div class="section-label">세션 시간</div>
    <div class="segmented" data-segment="mins">
      ${mins.map(m => `<div class="seg-item${_suggestState.sessionMinutes===m?' active':''}" data-value="${m}">${m}분</div>`).join('')}
    </div>
    <div class="section-label">강도 (선호 RPE)</div>
    <div class="segmented" data-segment="rpe">
      ${rpeOpts.map(r => `<div class="seg-item${_suggestState.preferredRpe===r?' active':''}" data-value="${r}">${r==='6-7'?'낮음 6-7':r==='7-8'?'보통 7-8':'높음 8-9'}</div>`).join('')}
    </div>
    <div class="hero-sub-in" style="font-size:11px; text-align:center; margin-top:8px;">최근 14일 기록 + 헬스장 기구 + 부위 균형 반영</div>
  `;
  content.querySelectorAll('[data-muscle]').forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute('data-muscle');
      if (_suggestState.targets.has(id)) _suggestState.targets.delete(id);
      else _suggestState.targets.add(id);
      _renderSuggestContent();
    };
  });
  content.querySelectorAll('[data-segment="mins"] [data-value]').forEach(el => {
    el.onclick = () => { _suggestState.sessionMinutes = +el.getAttribute('data-value'); _renderSuggestContent(); };
  });
  content.querySelectorAll('[data-segment="rpe"] [data-value]').forEach(el => {
    el.onclick = () => { _suggestState.preferredRpe = el.getAttribute('data-value'); _renderSuggestContent(); };
  });
}

// P3-13: AI 생성 실패/기구 0개 때 액션 버튼이 있는 인라인 에러 UI 표시.
// 이전에는 토스트만 띄우고 끝이라 사용자가 다음 행동을 찾기 어려웠음.
function _showRoutineSuggestError({ title, detail, actions }) {
  const content = document.getElementById('routine-suggest-content');
  if (!content) return;
  const actionsHtml = (actions || []).map((a, i) => {
    const primary = i === 0 ? ' btn-primary' : ' btn-tonal';
    return `<button type="button" class="btn${primary}" data-err-action="${a.id}">${_esc(a.label)}</button>`;
  }).join('');
  content.innerHTML = `
    <div class="routine-err">
      <div class="routine-err-icon">⚠️</div>
      <div class="routine-err-title">${_esc(title)}</div>
      <div class="routine-err-detail">${_esc(detail || '')}</div>
      <div class="routine-err-actions">${actionsHtml}</div>
    </div>
  `;
  content.querySelectorAll('[data-err-action]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.errAction;
      const a = (actions || []).find(x => x.id === id);
      if (a?.handler) a.handler();
    };
  });
  // go 버튼 숨김 (에러 복구 액션이 대체)
  const goBtn = document.getElementById('routine-suggest-go');
  if (goBtn) { goBtn.style.display = 'none'; }
}

// Issue 1: AI 생성 중 진행 게이지 — 사용자 체감 대기시간 완화.
// AI API 응답시간은 변동이 크므로 (보통 3~10초) "예상 지속시간" 기반 가짜 진행
// → 응답 도착 시 100%로 점프. Claude Haiku 평균 체감에 맞춰 ~7초.
let _genProgressToken = 0;
function _renderGenerateProgress() {
  const content = document.getElementById('routine-suggest-content');
  if (!content) return;
  content.innerHTML = `
    <div class="ai-gen-progress">
      <div class="ai-gen-progress-icon">🤖</div>
      <div class="ai-gen-progress-title">AI가 루틴을 짜고 있어요</div>
      <div class="ai-gen-progress-sub" id="ai-gen-progress-sub">최근 기록 · 기구 · 부위 균형을 반영해요</div>
      <div class="ai-gen-progress-track">
        <div class="ai-gen-progress-fill" id="ai-gen-progress-fill" style="width:0%;"></div>
      </div>
      <div class="ai-gen-progress-meta">
        <span id="ai-gen-progress-pct">0%</span>
        <span id="ai-gen-progress-hint">부위 분석 중...</span>
      </div>
    </div>
  `;
  // go 버튼 숨김
  const goBtn = document.getElementById('routine-suggest-go');
  if (goBtn) goBtn.style.display = 'none';
}

function _startGenerateProgressAnimation() {
  const myToken = ++_genProgressToken;
  const fillEl = document.getElementById('ai-gen-progress-fill');
  const pctEl = document.getElementById('ai-gen-progress-pct');
  const hintEl = document.getElementById('ai-gen-progress-hint');
  if (!fillEl) return { complete: () => {}, cancel: () => {} };
  const startTs = performance.now();
  const durationMs = 7000;      // 체감 기준
  const maxPct = 85;            // 응답 오기 전까진 85%에서 멈춤
  const hints = [
    { from: 0,  text: '부위 분석 중...' },
    { from: 25, text: '기구 매칭 중...' },
    { from: 55, text: '세트 구성 중...' },
    { from: 78, text: '마무리 정리 중...' },
  ];

  let rafId = null;
  const tick = (now) => {
    if (_genProgressToken !== myToken) return; // 다른 호출로 취소됨
    const elapsed = now - startTs;
    const t = Math.min(elapsed / durationMs, 1);
    // ease-out quad — 초반 빠르고 후반 느려짐 (실제 API도 네트워크 후 대기가 길음)
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
      _genProgressToken++; // invalidates animation loop
      if (rafId) cancelAnimationFrame(rafId);
      // 100%로 빠르게 채우기
      if (fillEl) fillEl.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      if (hintEl) hintEl.textContent = '완료!';
    },
    cancel: () => {
      _genProgressToken++;
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

export async function routineSuggestGenerate() {
  if (_suggestState.targets.size === 0) {
    _toast('부위를 1개 이상 골라주세요', 'warning'); return;
  }
  const btn = document.getElementById('routine-suggest-go');
  if (btn) { btn.disabled = true; btn.textContent = '🤖 생성 중...'; }
  // 진행 게이지 UI + 애니메이션 시작
  _renderGenerateProgress();
  const progress = _startGenerateProgressAnimation();
  try {
    const { generateRoutineCandidates } = await import('../ai.js');
    const preset = getExpertPreset();
    const currentGymId = _resolveCurrentGymId();
    const gymExercises = currentGymId ? getGymExList(currentGymId) : getExList();
    console.log('[routine-suggest] gymId:', currentGymId, 'exercises:', gymExercises.length, gymExercises.map(e => `${e.id}:${e.name}`));
    if (gymExercises.length === 0) {
      progress.cancel();
      // P3-13: 기구 0개 — 복구 액션 제공
      _showRoutineSuggestError({
        title: '등록된 기구가 없어요',
        detail: '현재 헬스장에 기구를 추가하면 AI가 그에 맞춰 루틴을 짜드려요.',
        actions: [
          { id: 'add-equipment', label: '기구 추가하기', handler: () => {
            routineSuggestClose();
            if (typeof expertOnbOpenForNewGym === 'function') expertOnbOpenForNewGym();
            else if (typeof expertOnbOpen === 'function') expertOnbOpen();
          } },
          { id: 'close', label: '닫기', handler: () => { routineSuggestClose(); } },
        ],
      });
      return;
    }
    const recentHistory = _buildRecentHistory(gymExercises);
    const cands = await generateRoutineCandidates({
      preset,
      targetMuscles: [..._suggestState.targets],
      sessionMinutes: _suggestState.sessionMinutes,
      preferredRpe: _suggestState.preferredRpe,
      gymExercises,
      recentHistory,
      movements: MOVEMENTS,
      // Gemini quota 초과 → Groq로 전환될 때 progress 게이지 subtitle 업데이트
      onProviderSwitch: ({ provider, reason }) => {
        const subEl = document.getElementById('ai-gen-progress-sub');
        const hintEl = document.getElementById('ai-gen-progress-hint');
        if (subEl && provider === 'groq') {
          subEl.innerHTML = '⚡ Gemini 혼잡 — <b>대체 AI(Groq)</b>로 재시도 중';
        }
        if (hintEl && provider === 'groq') hintEl.textContent = '대체 AI 응답 대기 중...';
        console.log('[routine-suggest] provider switched to', provider, 'reason=', reason);
      },
    });
    console.log('[routine-suggest] AI returned', cands.length, 'candidates:', cands);
    // AI 응답 검증: 존재하지 않는 exerciseId 제거, 빈 후보 제거, 1세트 → 3세트 확장
    const validExIds = new Set(gymExercises.map(e => e.id));
    for (const c of cands) {
      const before = (c.items || []).length;
      const invalid = (c.items || []).filter(it => !validExIds.has(it.exerciseId)).map(it => it.exerciseId);
      c.items = (c.items || []).filter(it => validExIds.has(it.exerciseId));
      if (invalid.length) console.warn('[routine-suggest] dropped invalid exerciseIds:', invalid, '(valid:', [...validExIds], ')');
      for (const it of c.items) {
        if (!it.sets || it.sets.length === 0) it.sets = [{ reps: 10, rpeTarget: 8 }];
        if (it.sets.length === 1) {
          const base = it.sets[0];
          it.sets = Array.from({ length: 3 }, () => ({ ...base }));
        }
      }
    }
    _suggestState.candidates = cands.filter(c => c.items && c.items.length > 0);
    console.log('[routine-suggest] final candidates:', _suggestState.candidates.length);
    // 진행 게이지를 100%로 마무리 후 자연스럽게 전환
    progress.complete();
    await new Promise(r => setTimeout(r, 320));
    _closeModal('routine-suggest-modal');
    _openModal('routine-candidates-modal');
    _renderCandidatesContent();
  } catch (e) {
    console.warn('[generate candidates] fail:', e?.code, e?.message || e);
    progress.cancel();
    // 정규화된 에러 코드로 맞춤 UI 분기. 서버 fallback은 투명하게 처리되므로
    // 'resource-exhausted'로 오는 경우는 Gemini+Groq 모두 실패한 상황.
    const code = e?.code || '';
    const msg = (e?.message || '').toLowerCase();
    const isQuotaAllFail =
      code === 'PROVIDER_ALL_FAIL' ||
      code === 'QUOTA_EXCEEDED' ||
      code === 'resource-exhausted' ||
      code === 'functions/resource-exhausted' ||
      /모두 실패|quota|rate.?limit|exceeded/.test(msg);

    let title, detail;
    if (isQuotaAllFail) {
      title = 'AI 사용량 한도 초과';
      detail = '잠시 AI 제공자들이 모두 혼잡해요. 30초~1분 후 자동 복구되니 다시 시도하거나, 지금은 직접 선택으로 진행할 수 있어요.';
    } else if (code === 'NO_CANDIDATES') {
      title = 'AI가 후보를 만들지 못했어요';
      detail = '등록된 기구 정보가 부족할 수 있어요. 기구를 추가하거나 부위를 다시 선택해주세요.';
    } else {
      title = 'AI 생성에 실패했어요';
      detail = '네트워크가 불안정하거나 잠시 서버 문제일 수 있어요. 다시 시도하거나 직접 선택할 수 있어요.';
    }

    _showRoutineSuggestError({
      title,
      detail,
      actions: [
        { id: 'retry', label: '다시 시도', handler: () => {
          _renderSuggestContent();  // 원래 입력 화면 복원
          const goBtn = document.getElementById('routine-suggest-go');
          if (goBtn) goBtn.style.display = '';
          setTimeout(() => routineSuggestGenerate(), 50);
        } },
        { id: 'manual', label: '직접 선택', handler: () => {
          routineSuggestClose();
          if (typeof window.wtOpenExercisePicker === 'function') window.wtOpenExercisePicker();
        } },
      ],
    });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AI로 2개 후보 생성'; }
  }
}

export function routineCandidatesClose() { _closeModal('routine-candidates-modal'); }

export async function routineCandidatesRegen() {
  _closeModal('routine-candidates-modal');
  await new Promise(r => setTimeout(r, 200));
  _openModal('routine-suggest-modal');
  await routineSuggestGenerate();
}

function _renderCandidatesContent() {
  const content = document.getElementById('routine-cand-content');
  const selectBtn = document.getElementById('routine-cand-select');
  if (!content) return;
  const exById = Object.fromEntries(getExList().map(e => [e.id, e]));
  const targets = [..._suggestState.targets].map(id => ({back:'등',chest:'가슴',shoulder:'어깨',bicep:'이두',tricep:'삼두',abs:'복부',lower:'하체'}[id] || id)).join(' · ');
  content.innerHTML = `
    <div class="hero-sub-in" style="font-size:13px; margin-top:0;">
      <b style="color:#191920;">${_esc(targets)} · ${_suggestState.sessionMinutes}분</b> 기준으로<br/>
      오늘 루틴 후보를 짰어요. 한 개 골라주세요.
    </div>
    ${_suggestState.candidates.map(c => {
      const isSel = _suggestState.selectedKey === c.candidateKey;
      const altClass = c.candidateKey === 'B' ? ' alt' : '';
      const items = (c.items || []).map(it => {
        const ex = exById[it.exerciseId];
        const firstSet = it.sets?.[0] || {};
        const setCount = it.sets?.length || 0;
        const reps = firstSet.reps || '?';
        const spec = `${setCount} × ${reps} @ RPE ${firstSet.rpeTarget || '-'}`;
        return `<div class="cand-row"><span class="cand-name">${_esc(ex?.name || it.exerciseId)}</span><span class="cand-spec">${spec}</span></div>`;
      }).join('');
      return `
        <div class="candidate${isSel?' selected':''}" data-cand="${c.candidateKey}">
          <div class="candidate-head">
            <div class="candidate-tag${altClass}">${_esc(c.candidateTag || c.candidateKey)}</div>
            <div class="candidate-title">${_esc(c.title || '루틴')}</div>
            <div class="candidate-time">${c.sessionMinutes || _suggestState.sessionMinutes}분</div>
          </div>
          <div class="candidate-items">${items}</div>
          ${c.rationale ? `<div class="candidate-rationale">💡 ${c.rationale}</div>` : ''}
        </div>
      `;
    }).join('')}
    ${_suggestState.candidates.length === 0 ? '<div class="hero-sub-in">후보를 만들지 못했어요. 기구를 더 등록하거나 다시 시도해주세요.</div>' : ''}
  `;
  content.querySelectorAll('[data-cand]').forEach(el => {
    el.onclick = () => {
      _suggestState.selectedKey = el.getAttribute('data-cand');
      _renderCandidatesContent();
    };
  });
  if (selectBtn) {
    selectBtn.disabled = !_suggestState.selectedKey;
    selectBtn.textContent = _suggestState.selectedKey ? `${_suggestState.selectedKey} 선택하고 시작` : '후보 선택';
  }
}

export async function routineCandidatesSelect() {
  if (!_suggestState.selectedKey) return;
  const cand = _suggestState.candidates.find(c => c.candidateKey === _suggestState.selectedKey);
  if (!cand) return;
  // routine_template 저장
  try {
    const { saveRoutineTemplate } = await import('../data.js');
    await saveRoutineTemplate({
      title: cand.title,
      source: 'ai',
      candidateKey: cand.candidateKey,
      rationale: cand.rationale || '',
      targetMuscles: [..._suggestState.targets],
      sessionMinutes: cand.sessionMinutes || _suggestState.sessionMinutes,
      items: cand.items || [],
      gymId: getExpertPreset().currentGymId || null,
    });
  } catch (e) { console.warn('[save routine_template] fail:', e?.message || e); }

  // S.exercises에 루틴 items 로드 + 즉시 저장 (P0-1b)
  // done:false 세트는 isExerciseDaySuccess(P0-1a)에서 스트릭 미집계 보장.
  // 저장 후 새로고침/이탈해도 루틴 유지됨.
  try {
    const { S } = await import('./state.js');
    const exById = Object.fromEntries(getExList().map(e => [e.id, e]));
    const preset = getExpertPreset();
    S.currentGymId = preset.currentGymId || null;
    S.routineMeta = {
      source: 'ai',
      candidateKey: cand.candidateKey,
      rationale: cand.rationale || '',
    };
    S.exercises = (cand.items || []).map(it => {
      const ex = exById[it.exerciseId];
      return {
        exerciseId: it.exerciseId,
        muscleId: ex?.muscleId || 'chest',
        name: ex?.name || it.exerciseId,
        sets: (it.sets || []).map(s => ({
          kg: 0, reps: s.reps || 10,
          rpeTarget: s.rpeTarget || null,
          setType: null, done: false,
        })),
      };
    });
    const { _renderExerciseList } = await import('./exercises.js');
    _renderExerciseList();
    // 즉시 persist — 새로고침/이탈해도 루틴 유지
    try {
      const { saveWorkoutDay } = await import('./save.js');
      saveWorkoutDay().catch(e => console.warn('[routine save] fail:', e));
    } catch (e) { console.warn('[routine save import] fail:', e); }
  } catch (e) { console.warn('[routine->S.exercises] fail:', e?.message || e); }

  _closeModal('routine-candidates-modal');
  _toast('루틴을 불러왔어요 — 첫 세트 무게를 입력하세요', 'success');
  if (typeof window.renderAll === 'function') window.renderAll();

  // P2-8: 강한 전환 피드백 — 헬스 종목 섹션으로 스크롤 + 첫 kg 입력 포커스
  _scrollToFirstExerciseSet();
}

// P2-8 helper: 루틴 로드 후 사용자 시선/포커스를 세트 입력 지점으로 이동
function _scrollToFirstExerciseSet() {
  // renderAll 이후 DOM 업데이트를 기다림
  requestAnimationFrame(() => {
    setTimeout(() => {
      const list = document.getElementById('wt-exercise-list');
      if (!list) return;
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // 첫 종목의 첫 kg input에 포커스 (있을 때만)
      const firstKg = list.querySelector('input[data-field="kg"]');
      if (firstKg && typeof firstKg.focus === 'function') {
        setTimeout(() => {
          try { firstKg.focus({ preventScroll: true }); } catch { firstKg.focus(); }
        }, 360);
      }
    }, 120);
  });
}

// ════════════════════════════════════════════════════════════════
// Scene 13 · 주간 인사이트 모달
// ════════════════════════════════════════════════════════════════

export async function insightsOpen() {
  _openModal('insights-modal');
  const range = _weekRange();
  const rangeEl = document.getElementById('insights-range');
  if (rangeEl) rangeEl.textContent = `${_prettyDate(range.fromKey)} - ${_prettyDate(range.toKey)}`;
  const content = document.getElementById('insights-content');
  if (!content) return;

  const { calcBalanceByPattern: _rawCalcBal } = await import('../calc.js');
  const cache = getCache();
  // 일반 모드 사용자도 expert preset의 gym 필터 때문에 통계가 왜곡되지 않도록
  // 프로 모드일 때만 gymId로 필터, 아니면 전체 exList.
  const gymId = isExpertModeEnabled() ? _resolveCurrentGymId() : null;
  const exList = gymId ? getGymExList(gymId) : getExList();
  const bal = _rawCalcBal(cache, exList, MOVEMENTS, range);

  // 부위별 자극 균형 (상위 8개 subPattern)
  const entries = Object.entries(bal).sort((a,b) => b[1]-a[1]);
  const maxSets = Math.max(1, ...entries.map(([,v]) => v));
  const prs = _collectThisWeekPRs(exList, range);
  const progressPct = _calcProgressPct(exList);

  content.innerHTML = `
    <div class="ai-insight">
      <div class="ai-insight-icon">🔥</div>
      <div>
        <div class="ai-insight-title">최근 세션 대비 ${progressPct>=0?'+':''}${progressPct}% 변화</div>
        <div class="ai-insight-body">
          주요 종목의 직전 세션 대비 무게 변화 평균이에요.<br/>
          자세히 보려면 탭하세요.
        </div>
      </div>
    </div>
    <div class="section-label">부위별 자극 균형</div>
    <div class="balance-block">
      ${entries.length ? entries.slice(0, 8).map(([sp, v]) => {
        const pct = Math.round(v / maxSets * 100);
        const weakCls = v < maxSets * 0.35 ? ' weak' : '';
        return `
          <div class="balance-row">
            <div class="balance-name">${_subPatternLabel(sp)}</div>
            <div class="balance-bar"><div class="balance-fill${weakCls}" style="width:${pct}%;"></div></div>
            <div class="balance-val">${v}세트</div>
          </div>
        `;
      }).join('') : '<div class="hero-sub-in">이번 주 운동 기록이 없어요.</div>'}
      ${entries.length ? `<div style="font-size:11px; color:#87878e; margin-top:8px; line-height:16px;">💡 <b style="color:#fa342c;">${_weakestLabel(entries)}</b>이(가) 부족해요. 다음 세션 추천에 자동 반영합니다.</div>` : ''}
    </div>
    <div class="section-label">주요 종목 추세</div>
    ${_renderTrendCards(exList)}
    ${prs.length ? `<div class="section-label">이번 주 PR</div>${prs.map(p => `
      <div class="pr-row">
        <div class="pr-icon">🏆</div>
        <div style="flex:1;">
          <div class="pr-name">${_esc(p.name)}</div>
          <div class="pr-meta">${p.prKg}kg × ${p.prReps}회 · 이전 ${p.prev}kg → +${p.diff}kg</div>
        </div>
        <span style="font-size:11px; color:#87878e;">${_prettyDate(p.date)}</span>
      </div>
    `).join('')}` : ''}
  `;
}
export function insightsClose() { _closeModal('insights-modal'); }

function gymEqClose() {
  _closeModal('gym-equipment-modal');
}

function _weekRange() {
  const today = new Date(TODAY);
  const dow = today.getDay() || 7;
  const from = new Date(today); from.setDate(today.getDate() - dow + 1);
  const to = today;
  const toKey = dateKey(to.getFullYear(), to.getMonth(), to.getDate());
  const fromKey = dateKey(from.getFullYear(), from.getMonth(), from.getDate());
  return { fromKey, toKey };
}
function _prettyDate(k) { if (!k) return ''; const [,m,d] = k.split('-'); return `${+m}/${+d}`; }

function _subPatternLabel(sp) {
  return ({
    back_width:'등 넓이', back_thickness:'등 두께', posterior:'후면사슬',
    chest_upper:'가슴 상부', chest_mid:'가슴 중부', chest_lower:'가슴 하부',
    shoulder_front:'어깨 전면', shoulder_side:'어깨 측면', rear_delt:'어깨 후면',
    traps:'승모', quad:'대퇴사두', hamstring:'햄스트링', glute:'둔근', calf:'종아리',
    bicep:'이두', tricep:'삼두', core:'코어',
  }[sp] || sp);
}

function _weakestLabel(entries) {
  if (!entries.length) return '';
  const max = entries[0][1];
  const weak = entries.filter(([,v]) => v < max * 0.4).map(([k]) => _subPatternLabel(k));
  return weak.join(' · ') || _subPatternLabel(entries[entries.length-1][0]);
}

function _collectThisWeekPRs(exList, range) {
  const out = [];
  for (const ex of exList) {
    const pr = _cachedDetectPRs(ex.id);
    if (pr.prDate && pr.prDate >= range.fromKey && pr.prDate <= range.toKey && pr.progressKg > 0) {
      const prev = (pr.lastKg - pr.progressKg).toFixed(1);
      out.push({ name: ex.name, prKg: pr.lastKg, prReps: pr.prReps, prev, diff: pr.progressKg, date: pr.lastDate });
    }
  }
  return out.slice(0, 5);
}

function _calcProgressPct(exList) {
  let prog = 0, count = 0;
  for (const ex of exList) {
    const pr = _cachedDetectPRs(ex.id);
    if (pr.lastKg > 0 && pr.progressKg !== 0) {
      prog += pr.progressKg / pr.lastKg * 100;
      count++;
    }
  }
  return count > 0 ? Math.round(prog / count) : 0;
}

function _renderTrendCards(exList) {
  const cache = getCache();
  const cards = [];
  for (const ex of exList.slice(0, 15)) {
    if (cards.length >= 2) break;
    const pr = _cachedDetectPRs(ex.id);
    if (!pr.lastKg || pr.lastKg <= 0) continue;
    // 실제 볼륨 히스토리로 SVG polyline 생성
    const hist = _getVolumeHistory(ex.id);
    const recent = hist.slice(-6);
    if (recent.length < 2) {
      // 세션 1개만 있으면 추세 미표시 (아직 비교 불가)
      cards.push(`
        <div class="trend-card">
          <div class="trend-head">
            <div>
              <div class="trend-name">${_esc(ex.name)}</div>
              <div class="trend-meta">세션 ${hist.length}회 · ${pr.prKg}kg PR</div>
            </div>
          </div>
          <div class="hero-sub-in" style="font-size:11px; margin:0;">추세를 그리려면 2세션 이상 필요해요.</div>
        </div>
      `);
      continue;
    }
    const maxVol = Math.max(...recent.map(h => h.volume), 1);
    const firstVol = recent[0].volume || 1;
    const lastVol = recent[recent.length - 1].volume || 1;
    const changePct = Math.round((lastVol - firstVol) / firstVol * 1000) / 10;
    const pctStr = changePct > 0 ? `+${changePct}%` : `${changePct}%`;
    const pctColor = changePct >= 0 ? '#1b854a' : '#87878e';
    const w = 320, h = 60, pad = 4;
    const points = recent.map((r, i) => {
      const x = Math.round(i / (recent.length - 1) * (w - pad * 2)) + pad;
      const y = Math.round((1 - r.volume / maxVol) * (h - pad * 2)) + pad;
      return `${x},${y}`;
    }).join(' ');
    const lastPt = points.split(' ').pop();
    cards.push(`
      <div class="trend-card">
        <div class="trend-head">
          <div>
            <div class="trend-name">${_esc(ex.name)}</div>
            <div class="trend-meta">볼륨 추세 · 최근 ${recent.length}세션</div>
          </div>
          <div style="font-size:13px; font-weight:800; color:${pctColor};">${pctStr}</div>
        </div>
        <svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
          <polyline points="${points}" fill="none" stroke="#fa342c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${lastPt.split(',')[0]}" cy="${lastPt.split(',')[1]}" r="4" fill="#fa342c"/>
        </svg>
      </div>
    `);
  }
  return cards.join('') || '<div class="hero-sub-in">아직 추세를 그릴 만큼 기록이 없어요.</div>';
}

// ── window 노출 ──────────────────────────────────────────────────

window.expertOnbOpen = expertOnbOpen;
window.expertOnbOpenForNewGym = expertOnbOpenForNewGym;
window.expertOnbClose = expertOnbClose;
window.expertOnbBack = expertOnbBack;
window.expertOnbNext = expertOnbNext;
window.expertOnbSkip = expertOnbSkip;
window.expertOnbAddManual = expertOnbAddManual;
window.expertOnbPickPhoto = expertOnbPickPhoto;
window.expertOnbAssignMovement = expertOnbAssignMovement;
window.expertOnbEditMovement = expertOnbEditMovement;
window.expertOnbAddAnotherGym = expertOnbAddAnotherGym;
window.openRoutineSuggest = openRoutineSuggest;
window.openRoutineCandidatesDirect = openRoutineCandidatesDirect;
window.routineSuggestClose = routineSuggestClose;
window.routineSuggestGenerate = routineSuggestGenerate;
window.routineCandidatesClose = routineCandidatesClose;
window.routineCandidatesRegen = routineCandidatesRegen;
window.routineCandidatesSelect = routineCandidatesSelect;
window.insightsOpen = insightsOpen;
window.insightsClose = insightsClose;
window.gymEqClose = gymEqClose;
window.renderExpertTopArea = renderExpertTopArea;
// 개발자 디버그: 콘솔에서 __expertDebug() 호출
window.__expertDebug = () => {
  const preset = getExpertPreset();
  const gyms = getGyms();
  const exAll = getExList();
  const exCurrentGym = preset.currentGymId ? getGymExList(preset.currentGymId) : [];
  const exByGym = {};
  for (const ex of exAll) {
    const k = ex.gymId || '(global)';
    exByGym[k] = exByGym[k] || [];
    exByGym[k].push({ id: ex.id, name: ex.name, movementId: ex.movementId });
  }
  console.group('[expert-debug]');
  console.log('preset:', preset);
  console.log('gyms:', gyms);
  console.log('exercises total:', exAll.length, 'in current gym:', exCurrentGym.length);
  console.log('exercises by gymId:', exByGym);
  console.log('recent routine templates:', getRoutineTemplates ? getRoutineTemplates() : '(not loaded)');
  console.groupEnd();
  return { preset, gyms, exCurrentGym, exByGym };
};
// 개발자 수동 기구 추가: __expertAddEquipment('랫풀다운','lat_pulldown',100,2.5)
window.__expertAddEquipment = async (name, movementId, maxKg, incKg) => {
  const gymId = _resolveCurrentGymId();
  if (!gymId) return console.error('[expert] current gym 없음. 온보딩 먼저 하세요.');
  const mov = MOVEMENTS.find(m => m.id === movementId);
  if (!mov) return console.error('[expert] 잘못된 movementId. 사용 가능:', MOVEMENTS.map(m => m.id));
  const { _generateId } = await import('../data/data-core.js');
  const exId = _generateId();
  await saveExercise({
    id: exId, muscleId: mov.primary, name, movementId,
    brand: '', machineType: '',
    maxWeightKg: maxKg || null,
    incrementKg: incKg || mov.stepKg || 2.5,
    weightUnit: 'kg', gymId, notes: '',
  });
  console.log('[expert] 저장 완료:', { id: exId, name, movementId, gymId });
  renderExpertTopArea();
  return exId;
};
window.expertOpenGymSwitcher = async () => {
  const gyms = getGyms();
  if (gyms.length <= 1) { _toast('헬스장이 1곳이에요. 설정에서 추가할 수 있어요.', 'info'); return; }
  const currentId = _resolveCurrentGymId();
  const idx = gyms.findIndex(g => g.id === currentId);
  const next = gyms[(idx + 1) % gyms.length];
  await saveExpertPreset({ currentGymId: next.id });
  // 현재 세션 state에도 즉시 반영 (저장 시 gymId 불일치 방지)
  try { const { S } = await import('./state.js'); S.currentGymId = next.id; } catch {}
  _toast(`${next.name}으로 전환했어요`, 'success');
  renderExpertTopArea();
};
window.openRoutineSuggestWithRecent = async () => {
  const recent = getRecentRoutineTemplate();
  if (!recent?.items?.length) { openRoutineSuggest(); return; }
  // 최근 template의 exercises를 직접 S에 로드 (AI 재호출 없이 즉시 재사용) + 즉시 저장 (P0-1b)
  try {
    const { S } = await import('./state.js');
    const exById = Object.fromEntries(getExList().map(e => [e.id, e]));
    S.currentGymId = _resolveCurrentGymId();
    S.routineMeta = { source: 'template', candidateKey: recent.candidateKey || null, rationale: recent.rationale || '' };
    S.exercises = recent.items.map(it => {
      const ex = exById[it.exerciseId];
      return {
        exerciseId: it.exerciseId,
        muscleId: ex?.muscleId || 'chest',
        name: ex?.name || it.exerciseId,
        sets: (it.sets || [{ reps: 10, rpeTarget: 8 }]).map(s => ({
          kg: 0, reps: s.reps || 10, rpeTarget: s.rpeTarget || null, setType: null, done: false,
        })),
      };
    }).filter(e => exById[e.exerciseId]);
    const { _renderExerciseList } = await import('./exercises.js');
    _renderExerciseList();
    renderExpertTopArea();
    // 즉시 persist (P0-1b) — 새로고침해도 루틴 유지
    try {
      const { saveWorkoutDay } = await import('./save.js');
      saveWorkoutDay().catch(e => console.warn('[reuse save] fail:', e));
    } catch (e) { console.warn('[reuse save import] fail:', e); }
    _toast('이전 루틴을 불러왔어요 — 첫 세트 무게를 입력하세요', 'success');
    _scrollToFirstExerciseSet();
  } catch (e) { console.warn('[reuse-template] fail:', e); openRoutineSuggest(); }
};

// ── 전문가 카드 세그먼트 상태 전환 ───────────────────────────────
// 'done' (운동) → 기존 wtSelectStatus('workout') + 헬스 섹션 자동 활성
// 'skip'/'health' → 기존 wtSelectStatus(status)
window.wtExcSelectStatus = (status) => {
  try {
    if (status === 'done') {
      if (typeof window.wtSelectStatus === 'function') window.wtSelectStatus('workout');
      const gymAlreadyOn = document.getElementById('wt-chip-gym')?.classList.contains('active');
      if (!gymAlreadyOn && typeof window.wtToggleType === 'function') {
        window.wtToggleType('gym');
      }
    } else {
      if (typeof window.wtSelectStatus === 'function') window.wtSelectStatus(status);
    }
  } catch (e) { console.warn('[wtExcSelectStatus]:', e); }
  renderExpertTopArea();
};

// ── 일반 모드로 전환 ─────────────────────────────────────────────
window.wtExcLeaveExpertMode = async () => {
  const ok = window.confirm('일반 모드로 전환하시겠어요?\n\n프로 모드 설정(헬스장·기구·루틴)은 유지되고, 헬스 종목 옆의 ⚡ 버튼으로 언제든 다시 켤 수 있어요.');
  if (!ok) return;
  try {
    await saveExpertPreset({ enabled: false });
    _toast('일반 모드로 전환했어요', 'success');
    renderExpertTopArea();
    if (typeof window.renderAll === 'function') window.renderAll();
  } catch (e) {
    console.warn('[wtExcLeaveExpertMode]:', e);
    _toast('전환에 실패했어요', 'error');
  }
};

// ── 재활성화 — 이전 설정(gym/기구/preset)을 그대로 살려 즉시 enabled=true ─
// 프로 모드는 '기본적으로 운동하는 사용자'를 가정 → 진입과 동시에 status='done' 강제.
window.wtExcReEnableExpertMode = async () => {
  try {
    await saveExpertPreset({ enabled: true, snoozedUntil: null });
    // 프로 모드는 쉬었어요/건강이슈 UI가 없으므로 자동으로 운동 상태로 세팅
    if (typeof window.wtExcSelectStatus === 'function') {
      window.wtExcSelectStatus('done');
    }
    _toast('프로 모드를 켰어요', 'success');
    if (typeof window.renderAll === 'function') window.renderAll();
  } catch (e) {
    console.warn('[wtExcReEnableExpertMode]:', e);
    _toast('다시 켜기에 실패했어요', 'error');
  }
};

// ── 헬스장 선택/추가 Bottom Sheet ────────────────────────────────
window.wtOpenGymListSheet = () => {
  document.querySelectorAll('.wt-gym-sheet-back').forEach(el => el.remove());
  const gyms = getGyms();
  const currentId = _resolveCurrentGymId();

  const rowsHtml = gyms.map(g => {
    const exN = getGymExList(g.id).length;
    const on = g.id === currentId;
    return `
      <button type="button" class="wt-gym-row${on ? ' is-on' : ''}" data-gym-id="${_esc(g.id)}">
        <span class="wt-gym-row-icon">🏋️</span>
        <div class="wt-gym-row-main">
          <div class="wt-gym-row-name">${_esc(g.name)}</div>
          <div class="wt-gym-row-meta">기구 ${exN}개${exN === 0 ? ' · 등록 필요' : ''}</div>
        </div>
        <span class="wt-gym-row-check">${on ? '✓' : ''}</span>
      </button>
    `;
  }).join('');

  const back = document.createElement('div');
  back.className = 'wt-gym-sheet-back';
  back.innerHTML = `
    <div class="wt-gym-sheet">
      <div class="wt-gym-sheet-title">헬스장 선택</div>
      <div class="wt-gym-sheet-sub">${gyms.length ? `등록된 헬스장 ${gyms.length}곳 · 탭하여 전환` : '아직 등록된 헬스장이 없어요'}</div>
      ${gyms.length ? `<div class="wt-gym-sheet-list">${rowsHtml}</div>` : ''}
      <button type="button" class="wt-gym-sheet-add" data-action="add">+ 새 헬스장 추가</button>
      <button type="button" class="wt-gym-sheet-close">닫기</button>
    </div>
  `;
  document.body.appendChild(back);

  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); };

  back.addEventListener('click', async (e) => {
    if (e.target === back) { close(); return; }
    const gymRow = e.target.closest('.wt-gym-row');
    if (gymRow) {
      const gymId = gymRow.dataset.gymId;
      close();
      await _switchToGym(gymId);
      return;
    }
    if (e.target.closest('.wt-gym-sheet-add')) {
      close();
      setTimeout(() => window.wtExcAddNewGym(), 220);
      return;
    }
    if (e.target.closest('.wt-gym-sheet-close')) close();
  });

  requestAnimationFrame(() => back.classList.add('show'));
};

async function _switchToGym(gymId) {
  if (!gymId || gymId === S.currentGymId) return;
  const gym = getGyms().find(g => g.id === gymId);
  if (!gym) return;

  // 진행 중 세션 오염 방지 — 현재 루틴/세트가 있으면 confirm + 초기화
  const hasActiveSession = !!S.routineMeta
    || (Array.isArray(S.exercises) && S.exercises.length > 0);
  if (hasActiveSession) {
    const ok = window.confirm(
      `${gym.name}으로 전환하면 지금 선택한 루틴과 세트 기록이 초기화돼요.\n\n계속하시겠어요?`
    );
    if (!ok) return;
  }

  try {
    if (hasActiveSession) {
      S.exercises = [];
      S.routineMeta = null;
    }
    await saveExpertPreset({ currentGymId: gymId });
    S.currentGymId = gymId;
    // 비워진 세션 + 새 gymId로 자동 저장 (save.js _buildSavePayload가 새 gymId로 기록)
    const { saveWorkoutDay } = await import('./save.js');
    saveWorkoutDay().catch(e => console.warn('[switch-save]:', e));
    _toast(`${gym.name}으로 전환했어요`, 'success');
    renderExpertTopArea();
    if (hasActiveSession) {
      try {
        const { _renderExerciseList } = await import('./exercises.js');
        _renderExerciseList();
      } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn('[switchToGym]:', e);
    _toast('전환에 실패했어요', 'error');
  }
}

// ── 새 헬스장 추가 — 바텀시트 폼 (P1-6: window.prompt 교체) ─────────
// 네이티브 prompt는 2026년 프로덕트 앱에서 신뢰 손상. 인라인 폼으로 대체.
window.wtExcAddNewGym = () => {
  document.querySelectorAll('.wt-gym-sheet-back').forEach(el => el.remove());
  const back = document.createElement('div');
  back.className = 'wt-gym-sheet-back';
  back.innerHTML = `
    <div class="wt-gym-sheet wt-gym-addform">
      <div class="wt-gym-sheet-title">새 헬스장 추가</div>
      <div class="wt-gym-sheet-sub">이름을 입력하면 다음 단계에서 기구를 등록할 수 있어요.</div>
      <div class="tf" style="margin-top:12px;">
        <input class="tf-input" id="wt-gym-addform-name" type="text" maxlength="40"
               placeholder="예: 애니타임 강남점" autocomplete="off" />
        <div class="tf-hint" id="wt-gym-addform-hint">최대 40자</div>
      </div>
      <button type="button" class="wt-gym-sheet-add" data-action="save">저장하고 기구 등록하기</button>
      <button type="button" class="wt-gym-sheet-close" data-action="cancel">취소</button>
    </div>
  `;
  document.body.appendChild(back);

  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); };
  const input = back.querySelector('#wt-gym-addform-name');
  const hint = back.querySelector('#wt-gym-addform-hint');
  const saveBtn = back.querySelector('[data-action="save"]');

  const updateHint = () => {
    const v = (input?.value || '').trim();
    if (!v) { hint.textContent = '최대 40자'; hint.style.color = ''; saveBtn.disabled = false; return; }
    if (v.length > 40) { hint.textContent = '40자를 초과했어요'; hint.style.color = 'var(--primary)'; saveBtn.disabled = true; return; }
    hint.textContent = `${v.length}/40자`; hint.style.color = ''; saveBtn.disabled = false;
  };
  input?.addEventListener('input', updateHint);

  const doSave = async () => {
    const name = (input?.value || '').trim();
    if (!name) { _toast('이름을 입력해주세요', 'warning'); input?.focus(); return; }
    if (name.length > 40) { _toast('이름은 40자 이내로 입력해주세요', 'warning'); return; }
    saveBtn.disabled = true; saveBtn.textContent = '저장 중...';
    try {
      const { _generateId } = await import('../data/data-core.js');
      const id = _generateId();
      await saveGym({ id, name, createdAt: Date.now() });
      await saveExpertPreset({ currentGymId: id });
      S.currentGymId = id;
      _toast(`${name} 추가 완료! 기구 등록을 시작할게요`, 'success');
      close();
      renderExpertTopArea();
      setTimeout(() => {
        if (typeof expertOnbOpenForNewGym === 'function') expertOnbOpenForNewGym();
        else if (typeof expertOnbOpen === 'function') expertOnbOpen();
      }, 450);
    } catch (e) {
      console.warn('[wtExcAddNewGym]:', e);
      _toast('헬스장 추가에 실패했어요', 'error');
      saveBtn.disabled = false; saveBtn.textContent = '저장하고 기구 등록하기';
    }
  };

  back.addEventListener('click', (e) => {
    if (e.target === back) { close(); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'save') { doSave(); return; }
    if (action === 'cancel') { close(); return; }
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSave(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  requestAnimationFrame(() => {
    back.classList.add('show');
    setTimeout(() => input?.focus(), 240);
  });
};

// 기존 expertOpenGymSwitcher는 이제 Sheet 열기로 위임
window.expertOpenGymSwitcher = () => window.wtOpenGymListSheet();

// ── 헬스장 관리 시트 — 기구 CRUD 진입점 ──────────────────────────────
// 캐러셀 활성 슬라이드의 ✏️ 아이콘 또는 더블클릭으로 호출됨.
// 할 수 있는 작업: 이름 변경, 기구 삭제, 기구 추가(기존 gymId로 wizard step5 재진입).
window.expertGymManageOpen = (gymId) => {
  document.querySelectorAll('.wt-gym-manage-back').forEach(el => el.remove());
  const gym = getGyms().find(g => g.id === gymId);
  if (!gym) { _toast('헬스장을 찾을 수 없어요', 'error'); return; }
  const exList = getGymExList(gymId);

  const rowsHtml = exList.length
    ? exList.map(ex => {
        const mov = MOVEMENTS.find(m => m.id === ex.movementId);
        const spLabel = mov ? _subPatternLabel(mov.subPattern) : '미지정';
        const meta = [spLabel, ex.maxWeightKg ? `최대 ${ex.maxWeightKg}kg` : '', ex.incrementKg ? `${ex.incrementKg}kg 증량` : '']
          .filter(Boolean).join(' · ');
        return `
          <div class="wt-gym-manage-row" data-ex-row="${_esc(ex.id)}">
            <div class="wt-gym-manage-row-main">
              <div class="wt-gym-manage-row-name">${_esc(ex.name)}</div>
              <div class="wt-gym-manage-row-meta">${_esc(meta)}</div>
            </div>
            <button type="button" class="wt-gym-manage-del" data-ex-del="${_esc(ex.id)}" aria-label="삭제">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        `;
      }).join('')
    : '<div class="wt-gym-manage-empty">등록된 기구가 없어요</div>';

  const back = document.createElement('div');
  back.className = 'wt-gym-manage-back';
  back.innerHTML = `
    <div class="wt-gym-manage-sheet" role="dialog" aria-label="헬스장 관리">
      <div class="wt-gym-manage-head">
        <div class="wt-gym-manage-title">헬스장 관리</div>
        <button type="button" class="wt-gym-manage-close" data-action="close" aria-label="닫기">✕</button>
      </div>
      <label class="wt-gym-manage-label" for="wt-gym-manage-name">헬스장 이름</label>
      <input type="text" class="wt-gym-manage-input" id="wt-gym-manage-name" value="${_esc(gym.name)}" maxlength="40" autocomplete="off" />
      <div class="wt-gym-manage-label" style="margin-top:14px;">등록 기구 <span style="color:var(--primary);">${exList.length}개</span></div>
      <div class="wt-gym-manage-list">${rowsHtml}</div>
      <button type="button" class="wt-gym-manage-add" data-action="add">＋ 기구 추가</button>
      <button type="button" class="wt-gym-manage-save" data-action="save">저장</button>
    </div>
  `;
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('show'));

  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); };

  back.addEventListener('click', async (e) => {
    if (e.target === back) { close(); return; }
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (action === 'close') { close(); return; }
    if (action === 'save') {
      const nameEl = document.getElementById('wt-gym-manage-name');
      const newName = (nameEl?.value || '').trim();
      if (!newName) { _toast('이름을 입력해주세요', 'warning'); nameEl?.focus(); return; }
      try {
        await saveGym({ ...gym, name: newName });
        _toast('저장했어요', 'success');
        close();
        renderExpertTopArea();
      } catch (err) {
        console.warn('[gym-manage.save]:', err);
        _toast('저장 실패', 'error');
      }
      return;
    }
    if (action === 'add') {
      close();
      setTimeout(() => {
        if (typeof window.expertOnbOpenForNewGym === 'function') window.expertOnbOpenForNewGym(gymId);
      }, 220);
      return;
    }
    const delBtn = e.target.closest('[data-ex-del]');
    if (delBtn) {
      const exId = delBtn.getAttribute('data-ex-del');
      if (!window.confirm('이 기구를 삭제할까요?')) return;
      try {
        await deleteExercise(exId);
        const row = delBtn.closest('.wt-gym-manage-row');
        if (row) row.remove();
        // 카운트 업데이트는 시트 닫을 때 renderExpertTopArea가 처리
        _toast('삭제했어요', 'success');
      } catch (err) {
        console.warn('[gym-manage.delete]:', err);
        _toast('삭제 실패', 'error');
      }
    }
  });
};
