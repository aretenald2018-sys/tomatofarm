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
  getMuscleParts, getCustomMuscles, saveCustomMuscle, deleteCustomMuscle,
  dateKey, TODAY,
} from '../data.js';
import { MOVEMENTS, MOVEMENT_PATTERNS } from '../config.js';
import { parseEquipmentFromText, parseEquipmentFromImage } from '../ai.js';
import { S } from './state.js';
import { confirmAction } from '../utils/confirm-modal.js';

// ── R3b 분할: 온보딩 8-scene wizard 는 ./expert/onboarding.js 로 이동 ──
// resolveCurrentGymId 는 거기에 이동됐지만 workout/exercises.js 가 이 파일에서
// import 하므로 re-export. 내부 호출부는 `_resolveCurrentGymId` 별칭으로 유지해
// 기존 라인들을 수정하지 않는다.
import {
  expertOnbOpen, expertOnbClose, expertOnbBack, expertOnbNext, expertOnbSkip,
  expertOnbOpenForNewGym, expertOnbAddManual, expertOnbPickPhoto,
  expertOnbAssignMovement, expertOnbEditMovement, expertOnbRemoveItem,
  expertOnbAddAnotherGym,
  expertOnbMuscleSetPrimary, expertOnbMuscleToggle, expertOnbMusclePickerToggle,
  resolveCurrentGymId as _resolveCurrentGymId,
} from './expert/onboarding.js';
export { resolveCurrentGymId } from './expert/onboarding.js';

// ── 공용 소규모 헬퍼 (onboarding.js 에도 동일 정의 — 순환 import 회피) ─
function _esc(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function _toast(msg, type='info') {
  if (typeof window.showToast === 'function') window.showToast(msg, 2200, type);
}

// ── 세션 단위 뷰 상태 — 프로 모드 preset(enabled)은 유지하되,
// 운동탭 진입 시 '일반 모드 뷰'가 디폴트로 보이도록 함.
// true 일 때만 상단 프로 카드(스테퍼) 렌더. 탭 재진입 시 resetExpertView() 로 false 복귀.
let _expertViewShown = false;
export function resetExpertView() { _expertViewShown = false; }
// 외부 모듈(exercises.js picker 등)이 현재 세션 뷰를 확인할 때 사용.
export function isExpertViewShown() { return _expertViewShown; }

// 메인 stepper Step 2(_suggestState) 가 preset 값으로 최초 초기화됐는지 플래그.
let _stepperSeeded = false;


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
  _renderInlineExpertPill();

  // 일반 모드 뷰 (디폴트) — 프로 모드 preset은 유지하되 화면은 일반 헬스 흐름.
  // 상단 세그먼트로 프로 모드 뷰 전환 가능. preset 자체는 건드리지 않음.
  if (!_expertViewShown) {
    _syncExpertFlowClass(false);
    _syncStep3ReadyClass(false);
    host.innerHTML = `
      <div class="wt-mode-seg" role="tablist" aria-label="운동 모드">
        <button type="button" class="wt-mode-seg-btn is-on" role="tab" aria-selected="true">일반 모드</button>
        <button type="button" class="wt-mode-seg-btn" role="tab" aria-selected="false" onclick="wtExcShowExpertView()">프로 모드</button>
      </div>
    `;
    return;
  }

  // 프로 모드 뷰 — 스테퍼 카드 노출
  _syncExpertFlowClass(true);

  // 랜딩 '쉬었어요/건강이슈' 제거 후 — 상태는 항상 'done'으로 간주.
  const status = 'done';
  const currentGymId = _resolveCurrentGymId();
  const currentGym = getGyms().find(g => g.id === currentGymId) || null;
  const gymCount = getGyms().length;
  const exCount = currentGymId ? getGymExList(currentGymId).length : 0;
  const insight = _summarizeExpertInsight();
  const recent = _safeGetRecentRoutine();
  const hasRoutine = _hasSelectedRoutine();
  const step1Done = !!currentGym && exCount > 0;
  const stepNum = !step1Done ? 1 : (!hasRoutine ? 2 : 3);

  // 모든 스텝 완료 → 아래 헬스 종목 섹션 표시 허용
  _syncStep3ReadyClass(step1Done && hasRoutine);

  const headTitle = '🏋️ 오늘의 운동';
  const headMetaHtml = `<div class="wt-exc-meta">STEP ${stepNum} / 3</div>`;

  const bodyHtml = _renderExpertStepperBody({ currentGym, gymCount, exCount, insight, step1Done, hasRoutine, recent });

  // 통합 TDS SegmentedControl — [일반 모드 | 프로 모드]. 디폴트가 일반 모드라 좌측 배치.
  // 프로 모드에서는 기본적으로 '운동'을 하는 사용자이므로 쉬었어요/건강이슈/운동 세그먼트 제거.
  host.innerHTML = `
    <div class="wt-mode-seg" role="tablist" aria-label="운동 모드">
      <button type="button" class="wt-mode-seg-btn" role="tab" aria-selected="false" onclick="wtExcSwitchToNormalView()">일반 모드</button>
      <button type="button" class="wt-mode-seg-btn is-on" role="tab" aria-selected="true">프로 모드</button>
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
    if (!S.workout.routineMeta) return false;
    return Array.isArray(S.workout.exercises) && S.workout.exercises.length > 0;
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
      // D-2: 편집 아이콘을 모든 슬라이드에 노출 — 비활성 헬스장도 기구 관리 가능.
      //       (과거: 활성 슬라이드에만 있었음 → 비활성 gym을 고치려면 선택 전환 필수,
      //        전환 시 진행 중 루틴 초기화 모달이 뜨는 부수효과가 있어 UX가 막혔음)
      const editIcon = `<span class="wt-gym-slide-edit" data-gym-edit="${_esc(g.id)}" role="button" aria-label="기구 관리" title="기구 관리">✏️</span>`;
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
  const parts = getMuscleParts();
  const muscleIds = parts.map(m => m.id);
  const musclesById = Object.fromEntries(parts.map(m => [m.id, m.name]));
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

  // Step 3 — AI 루틴 생성 vs 직접 선택 (Step 1+2 완료 시 활성)
  // D-3: 두 경로를 동등한 시각 비중으로 배치 — AI만 primary CTA였던 구조를
  //      "AI 추천"과 "직접 선택" 두 카드가 나란히 존재하는 형태로 변경.
  //      (AI 의존도가 강했던 onboarding에서 수동 사용자가 배제되던 문제 해결)
  const canGenerate = step1Done && hasTargets;
  const s3Class = hasRoutine ? 'is-done' : (canGenerate ? 'is-active' : '');
  const s3Dot = hasRoutine ? '✓' : '3';
  const step3Body = `
    <div class="wt-routine-choice">
      <button class="wt-routine-card" type="button" onclick="openRoutineCandidatesDirect()"${!canGenerate ? ' disabled' : ''}>
        <div class="wt-routine-card-icon">🤖</div>
        <div class="wt-routine-card-title">AI 추천</div>
        <div class="wt-routine-card-sub">부위·시간 기반</div>
      </button>
      <button class="wt-routine-card" type="button" onclick="wtOpenExercisePicker()"${!step1Done ? ' disabled' : ''}>
        <div class="wt-routine-card-icon">✍️</div>
        <div class="wt-routine-card-title">직접 선택</div>
        <div class="wt-routine-card-sub">내가 고를래요</div>
      </button>
    </div>
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

// 2026-04-20: 선택 부위별 **독립** 직전/직직전 세션 요약을 AI에 넘기기 위한 빌더.
//   이전 구현은 targetMuscles 전체를 buildMuscleComparison 에 한 번에 넘겨서, 가슴+이두
//   같은 복수 부위 날엔 이두-only 세션이 가슴 비교에 섞이는 혼합 버그가 있었다 (리뷰 #1).
//   이제 각 major 마다 buildMuscleComparison 을 호출해 배열로 반환. AI 프롬프트도 per-major
//   섹션 으로 포맷해 부위별 비교가 뒤엉키지 않는다.
//
// 반환 형식:
//   [{ major: 'chest', today, previous, imbalance }, { major: 'bicep', ... }]
//   - 각 major 에 대해 today/previous 데이터가 하나도 없으면 해당 항목 생략.
//   - 전부 비어있으면 null.
async function _buildSameMuscleContext(targetMuscles) {
  if (!Array.isArray(targetMuscles) || targetMuscles.length === 0) return null;
  try {
    const { buildMuscleComparison } = await import('../calc.js');
    const cache = getCache();
    const exList = getExList();
    const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
    const perMajor = [];
    for (const major of targetMuscles) {
      const cmp = buildMuscleComparison(cache, exList, MOVEMENTS, todayKey, [major], 2);
      if (!cmp.majors?.length || (!cmp.today && cmp.previous.length === 0)) continue;
      perMajor.push({
        major,
        today: cmp.today ? {
          dateKey: cmp.today.dateKey,
          workSets: cmp.today.workSets,
          totalVolume: cmp.today.totalVolume,
          topKg: cmp.today.topKg,
          subBalance: cmp.today.subBalance,
        } : null,
        previous: cmp.previous.map(p => ({
          dateKey: p.dateKey,
          workSets: p.workSets,
          totalVolume: p.totalVolume,
          topKg: p.topKg,
          subBalance: p.subBalance,
        })),
        imbalance: cmp.imbalance,
      });
    }
    return perMajor.length > 0 ? perMajor : null;
  } catch (e) {
    console.warn('[_buildSameMuscleContext] fail:', e?.message || e);
    return null;
  }
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
  const parts = getMuscleParts();
  const muscles = parts.map(m => m.id);
  const nameById = Object.fromEntries(parts.map(m => [m.id, m.name]));
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
    // 2026-04-20: 선택 부위 직전/직직전 세션 요약 — 추천 AI가 부족한 세부 부위를 보완하도록.
    const sameMuscleContext = await _buildSameMuscleContext([..._suggestState.targets]);
    const cands = await generateRoutineCandidates({
      preset,
      targetMuscles: [..._suggestState.targets],
      sessionMinutes: _suggestState.sessionMinutes,
      preferredRpe: _suggestState.preferredRpe,
      gymExercises,
      recentHistory,
      sameMuscleContext,
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
    // AI 응답 검증 (3중 방어의 마지막 층):
    //   1) exerciseId가 현재 헬스장에 존재하는가 (기존)
    //   2) muscleId가 오늘 선택 부위에 포함되는가 (신규) — ai.js가 이미 프롬프트에서 타겟 외
    //      기구를 숨기지만, AI가 환각으로 엉뚱한 id를 만들어내는 경우 최종 거름망.
    //   3) 빈 items 후보 제거
    const validExIds = new Set(gymExercises.map(e => e.id));
    const exById = new Map(gymExercises.map(e => [e.id, e]));
    const allowedMuscles = new Set(_suggestState.targets); // 오늘 유저가 고른 부위(대분류)
    const muscleCheckEnabled = allowedMuscles.size > 0;
    // 2026-04-19: muscleIds(세부 부위) → 대분류 역매핑으로 교집합 체크.
    // 기구가 muscleIds[] 중 하나라도 유저 선택 대분류에 속하면 통과.
    for (const c of cands) {
      const invalidIds = [];
      const offMuscles = [];
      c.items = (c.items || []).filter(it => {
        if (!validExIds.has(it.exerciseId)) { invalidIds.push(it.exerciseId); return false; }
        if (muscleCheckEnabled) {
          const ex = exById.get(it.exerciseId);
          const tags = _exerciseMajorMuscles(ex);
          if (tags.size === 0) return true; // 태그 없는 커스텀은 통과 (기존 관용적 동작)
          const hit = [...tags].some(m => allowedMuscles.has(m));
          if (!hit) { offMuscles.push(`${it.exerciseId}(${[...tags].join('/')})`); return false; }
        }
        return true;
      });
      if (invalidIds.length) console.warn('[routine-suggest] dropped invalid exerciseIds:', invalidIds);
      if (offMuscles.length) console.warn('[routine-suggest] dropped off-target muscle items:', offMuscles, '(allowed:', [...allowedMuscles], ')');
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
    } else if (code === 'NO_GYM_FOR_TARGETS') {
      title = '선택한 부위의 기구가 없어요';
      detail = '오늘 선택한 부위에 등록된 기구가 현재 헬스장에 없어요. 다른 부위를 고르거나, 기구를 추가한 뒤 다시 시도해주세요.';
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

  // S.workout.exercises에 루틴 items 로드 + 즉시 저장 (P0-1b)
  // done:false 세트는 isExerciseDaySuccess(P0-1a)에서 스트릭 미집계 보장.
  // 저장 후 새로고침/이탈해도 루틴 유지됨.
  try {
    const { S } = await import('./state.js');
    const exById = Object.fromEntries(getExList().map(e => [e.id, e]));
    const preset = getExpertPreset();
    S.workout.currentGymId = preset.currentGymId || null;
    S.workout.routineMeta = {
      source: 'ai',
      candidateKey: cand.candidateKey,
      rationale: cand.rationale || '',
    };
    // template 재사용 경로와 동일하게 orphan(exerciseId가 DB에 없는 항목) 필터링 —
    // stale candidate가 chest-기본 orphan row를 만들던 회귀 방지.
    S.workout.exercises = (cand.items || [])
      .filter(it => exById[it.exerciseId])
      .map(it => {
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
  } catch (e) { console.warn('[routine->S.workout.exercises] fail:', e?.message || e); }

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
// Scene 13 · 인사이트 모달 (이번주 + 오늘 + AI 공유)
// 2026-04-19: 기존 '이번 주' 단일 뷰를 '이번주 + 오늘' 통합으로 확장.
// _lastInsightSnapshot에 렌더된 요약 텍스트를 캐시 → AI 공유 버튼에서 재사용.
// ════════════════════════════════════════════════════════════════

let _lastInsightSnapshot = null;

// 2026-04-20: 주어진 dateKey 기준 "이번 주" 범위(월~해당일).
// 과거 날짜나 자정 넘긴 세션에서도 정확한 범위를 계산하려면 sessionKey를 입력받아야 함.
function _weekRangeForKey(baseKey) {
  if (!baseKey || !/^\d{4}-\d{2}-\d{2}$/.test(baseKey)) return _weekRange();
  const [y, m, d] = baseKey.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  const dow = today.getDay() || 7;
  const from = new Date(today); from.setDate(today.getDate() - dow + 1);
  const toKey = baseKey;
  const fromKey = dateKey(from.getFullYear(), from.getMonth(), from.getDate());
  return { fromKey, toKey };
}

// 2026-04-20: 추세/PR 카드의 "관련성" 정렬 (Codex 지적 #4).
//   우선순위: (a) 오늘 세션에 등장한 종목 → (b) 이번 주 세션에 등장한 종목 → (c) 기타 exList.
//   하체 세션 직후에도 상체 종목이 먼저 뜨던 회귀 방지.
function _rankExListByRelevance(exList, cache, sessionKey, range) {
  const day = sessionKey ? cache?.[sessionKey] : null;
  const todaysIds = new Set();
  if (day?.exercises) {
    for (const entry of day.exercises) {
      if (entry?.exerciseId) todaysIds.add(entry.exerciseId);
    }
  }
  const weekIds = new Set();
  if (range?.fromKey && range?.toKey && cache) {
    for (const [key, d] of Object.entries(cache)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (key < range.fromKey || key > range.toKey) continue;
      for (const entry of (d?.exercises || [])) {
        if (entry?.exerciseId) weekIds.add(entry.exerciseId);
      }
    }
  }
  const score = (ex) => {
    if (!ex?.id) return 9;
    if (todaysIds.has(ex.id)) return 0;
    if (weekIds.has(ex.id))  return 1;
    return 2;
  };
  // 원래 순서를 보존하는 안정 정렬
  return [...exList].map((ex, i) => ({ ex, i })).sort((a, b) => {
    const s = score(a.ex) - score(b.ex);
    return s !== 0 ? s : a.i - b.i;
  }).map(x => x.ex);
}

// 오늘 세션 날짜(sessionKey)를 인자로 받아 과거 날짜/자정 경계에서도 정확히 반영.
// 기본값은 TODAY → 기존 메뉴 오픈 경로 호환.
export async function insightsOpen(sessionKey) {
  _openModal('insights-modal');
  // 2026-04-20: TODAY 고정값 대신 호출자가 넘긴 sessionKey를 우선 사용 (Codex 지적 #2).
  const today = (sessionKey && /^\d{4}-\d{2}-\d{2}$/.test(sessionKey))
    ? sessionKey
    : dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const range = _weekRangeForKey(today);
  const rangeEl = document.getElementById('insights-range');
  if (rangeEl) rangeEl.textContent = `${_prettyDate(range.fromKey)} - ${_prettyDate(range.toKey)}`;
  const content = document.getElementById('insights-content');
  if (!content) return;

  const { calcBalanceByPattern: _rawCalcBal, buildMuscleComparison, getSessionMajorMuscles } = await import('../calc.js');
  const cache = getCache();
  // 2026-04-19: 인사이트는 항상 전체 exList 기준으로 계산.
  // 배경: 과거엔 expert mode일 때 _resolveCurrentGymId()로 `getGymExList(gymId)` 만
  // 사용해 "현재 헬스장" 범위로 좁혔는데, 사용자가 일반 모드 뷰로 잠깐 토글해 다른
  // gymId(또는 gymId 없음) 종목을 추가한 경우 그 종목의 오늘 세트가 balance-block/
  // trend-cards 에서 통째로 사라지는 회귀가 확인됨 (사용자 리포트 2026-04-19 "당일
  // 운동한 부분이 여전히 반영되지 않는다"). 인사이트는 주간 종합 피드백이 목적이므로
  // gym을 떠나서 전체 종목 라이브러리를 참조해 오늘의 세트를 반드시 포함시킨다.
  // 참고: picker/루틴 생성은 여전히 _resolveCurrentGymId()로 헬스장 범위를 존중.
  const exList = getExList();
  // 2026-04-20: relevance-sorted 리스트 — 오늘 운동한 종목 우선 (Codex 지적 #4).
  const rankedExList = _rankExListByRelevance(exList, cache, today, range);
  const bal = _rawCalcBal(cache, exList, MOVEMENTS, range);

  // 이번 주 ─────────────────────────────────────────────────────
  const entries = Object.entries(bal).sort((a,b) => b[1]-a[1]);
  const maxSets = Math.max(1, ...entries.map(([,v]) => v));
  const prs = _collectThisWeekPRs(rankedExList, range);
  const progressPct = _calcProgressPct(exList);

  // 오늘 ───────────────────────────────────────────────────────
  // 오늘 운동: 부위별 세트 수, 총 볼륨(kg×reps), 총 운동시간, PR 여부
  // 오늘 자극 균형: 오늘만의 subPattern 카운트 (calcBalanceByPattern 날짜 1일)
  const todayRange = { fromKey: today, toKey: today };
  const todayBal = _rawCalcBal(cache, exList, MOVEMENTS, todayRange);
  const todayBalEntries = Object.entries(todayBal).sort((a,b) => b[1]-a[1]);
  const todayMaxSets = Math.max(1, ...todayBalEntries.map(([,v]) => v));
  const todayStats = _calcTodayStats(cache, exList, today);
  // PR/trend는 relevance-sorted 리스트 기반 (Codex 지적 #4).
  const todayPRs = _collectTodayPRs(rankedExList, today);

  // 2026-04-20: 오늘 부위별 직전/직직전 비교 — 대분류별로 **독립 블록** 생성.
  //   이전 구현(majors=null) 은 오늘 한 전체 대분류를 합집합으로 비교해서, 오늘 가슴+이두면
  //   직전 이두-only 세션이 "같은 부위" 로 매칭돼 topKg 델타가 섞였다(80kg vs 18kg → +62kg).
  //   각 major 마다 buildMuscleComparison 을 별도 호출하면 이 혼합이 사라진다.
  const todayDay = cache?.[today];
  const todayMajors = todayDay ? [...getSessionMajorMuscles(todayDay, exList, MOVEMENTS)] : [];
  const muscleCmps = todayMajors
    .map(m => buildMuscleComparison(cache, exList, MOVEMENTS, today, [m], 2))
    .filter(cmp => cmp.majors?.length && cmp.today);

  // 최근 3일 식단 ─────────────────────────────────────────────
  const recentDiet = _collect3DayDietSummary(cache, today);

  content.innerHTML = `
    <div class="ai-insight">
      <div class="ai-insight-icon">🔥</div>
      <div>
        <div class="ai-insight-title">직전 세션 대비 최고중량 ${progressPct>=0?'+':''}${progressPct}%</div>
        <div class="ai-insight-body">
          각 종목 "마지막 세션 최고중량 − 그 이전 세션 최고중량" 평균이에요.<br/>
          반복수·RPE·볼륨 변화는 포함되지 않아요.
        </div>
      </div>
    </div>
    <div class="section-label">이번 주 · 부위별 자극 균형</div>
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
    <div class="section-label">이번 주 · 주요 종목 추세</div>
    ${_renderTrendCards(rankedExList)}
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

    <!-- 오늘 섹션 ─────────────────────────────────────────── -->
    <div class="insights-today-block">
      <div class="section-label">오늘의 인사이트 · ${_prettyDate(today)}</div>
      ${todayStats.totalSets > 0 ? `
        <div class="insights-today-summary">
          <div class="insights-today-stat">
            <div class="insights-today-stat-value">${todayStats.totalSets}</div>
            <div class="insights-today-stat-label">세트</div>
          </div>
          <div class="insights-today-stat">
            <div class="insights-today-stat-value">${todayStats.totalVolume.toLocaleString()}</div>
            <div class="insights-today-stat-label">볼륨 (kg·회)</div>
          </div>
          <div class="insights-today-stat">
            <div class="insights-today-stat-value">${_fmtDuration(todayStats.duration)}</div>
            <div class="insights-today-stat-label">운동시간</div>
          </div>
        </div>
      ` : '<div class="insights-today-empty">오늘은 아직 운동 기록이 없어요.</div>'}

      ${todayBalEntries.length ? `
        <div class="section-label" style="margin-top:14px;">오늘 자극 균형</div>
        <div class="balance-block">
          ${todayBalEntries.map(([sp, v]) => {
            const pct = Math.round(v / todayMaxSets * 100);
            return `
              <div class="balance-row">
                <div class="balance-name">${_subPatternLabel(sp)}</div>
                <div class="balance-bar"><div class="balance-fill" style="width:${pct}%;"></div></div>
                <div class="balance-val">${v}세트</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${todayPRs.length ? `
        <div class="section-label" style="margin-top:14px;">오늘 PR</div>
        ${todayPRs.map(p => `
          <div class="pr-row">
            <div class="pr-icon">🏆</div>
            <div style="flex:1;">
              <div class="pr-name">${_esc(p.name)}</div>
              <div class="pr-meta">${p.prKg}kg × ${p.prReps}회 · +${p.diff}kg</div>
            </div>
          </div>
        `).join('')}
      ` : ''}

      ${muscleCmps.map(_renderMuscleComparisonBlock).join('')}

      <div class="section-label" style="margin-top:14px;">최근 3일 식단 요약</div>
      ${recentDiet.length ? `
        <div class="insights-recent-diet">
          ${recentDiet.map(d => `
            <div class="insights-recent-diet-row">
              <div><span class="insights-recent-diet-date">${_prettyDate(d.dateKey)}</span>
                ${d.kcal > 0 ? `<span class="insights-recent-diet-kcal">${d.kcal}kcal</span>` : '<span style="color:#87878e;">기록 없음</span>'}
              </div>
              ${d.kcal > 0 ? `<span class="insights-recent-diet-macro">P${Math.round(d.protein)}·C${Math.round(d.carbs)}·F${Math.round(d.fat)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<div class="insights-today-empty">최근 식단 기록이 없어요.</div>'}
    </div>
  `;

  // 공유 모드 세그먼트를 현재 전역 상태로 동기화 (모달 재오픈 시 UI 반영)
  insightsSetShareMode(window.insightsShareMode || 'summary');

  // AI 공유 버튼을 위한 스냅샷 저장 (요약 + 상세 2가지 모드)
  // 상세(detail) 모드는 세션 raw 세트 로그를 포함해 AI가 실제 훈련량에 근거한
  // 피드백을 줄 수 있게 함 (Codex 지적 #5 — 요약/상세 분리, raw 세트 로그 포함).
  // 2026-04-20: muscleCmp(오늘 부위 직전/직직전 비교) 를 두 스냅샷 모두에 포함 →
  //   외부 AI가 "오늘 부위 이력" 을 근거로 피드백/추천하도록 유도.
  _lastInsightSnapshot = {
    summary: _buildInsightTextSnapshot({
      range, weekBalance: entries, weekPRs: prs, progressPct,
      today, todayStats, todayBalance: todayBalEntries, todayPRs, recentDiet,
      muscleCmps,
    }),
    detail: _buildInsightDetailSnapshot({
      range, weekBalance: entries, weekPRs: prs, progressPct,
      today, todayStats, todayBalance: todayBalEntries, todayPRs, recentDiet,
      cache, exList, muscleCmps,
    }),
  };
}

// 2026-04-20: 오늘 부위(예: 가슴) 직전/직직전 비교 블록.
//   muscleCmp 는 calc.buildMuscleComparison() 반환 객체.
//   빈 majors / previous=[] / today=null 인 경우 "데이터 부족" 힌트만.
function _renderMuscleComparisonBlock(cmp) {
  if (!cmp || !cmp.majors || cmp.majors.length === 0) return '';
  const majorLabel = cmp.majors.map(_majorLabel).join(' · ');
  // 양쪽 모두 데이터 없는 케이스
  if (!cmp.today) return '';

  // subPattern 막대 비교 행 — 오늘/직전/직직전을 나란히 표시.
  // 모든 비교 대상 subPattern 합집합으로 고정 순서.
  const allSubs = new Set();
  for (const sp of Object.keys(cmp.today.subBalance || {})) allSubs.add(sp);
  for (const p of cmp.previous) for (const sp of Object.keys(p.subBalance || {})) allSubs.add(sp);
  const subOrder = [..._preferredSubOrder(cmp.majors)].filter(sp => allSubs.has(sp));
  // preferred 외에 실제 존재하는 기타 subPattern 보조 추가
  for (const sp of allSubs) if (!subOrder.includes(sp)) subOrder.push(sp);
  const maxSets = Math.max(
    1,
    ...subOrder.map(sp => cmp.today.subBalance?.[sp] || 0),
    ...cmp.previous.flatMap(p => subOrder.map(sp => p.subBalance?.[sp] || 0)),
  );

  const sessionsForRow = [
    { label: `오늘 ${_prettyDate(cmp.today.dateKey)}`, sum: cmp.today, hi: true },
    ...cmp.previous.map((p, i) => ({
      label: `${i === 0 ? '직전' : '직직전'} ${_prettyDate(p.dateKey)}`,
      sum: p, hi: false,
    })),
  ];

  // 요약 카드 (세트/볼륨/topKg + 델타)
  const metricsHtml = sessionsForRow.map((r, idx) => {
    const d = cmp.deltas[idx - 1]; // 오늘 행은 delta 없음
    const deltaLine = (idx === 0 || !d) ? '' : `
      <div class="muscle-cmp-delta">
        <span class="${d.workSetsDelta >= 0 ? 'up' : 'down'}">세트 ${d.workSetsDelta >= 0 ? '+' : ''}${d.workSetsDelta}</span>
        <span class="${d.volumeDelta   >= 0 ? 'up' : 'down'}">볼륨 ${d.volumeDelta   >= 0 ? '+' : ''}${d.volumeDelta.toLocaleString()}</span>
        <span class="${d.topKgDelta    >= 0 ? 'up' : 'down'}">Top ${d.topKgDelta    >= 0 ? '+' : ''}${d.topKgDelta}kg</span>
      </div>`;
    return `
      <div class="muscle-cmp-col${r.hi ? ' hi' : ''}">
        <div class="muscle-cmp-col-head">${_esc(r.label)}</div>
        <div class="muscle-cmp-col-body">
          <div class="muscle-cmp-metric"><b>${r.sum.workSets}</b>세트</div>
          <div class="muscle-cmp-metric"><b>${r.sum.totalVolume.toLocaleString()}</b> 볼륨</div>
          <div class="muscle-cmp-metric">Top <b>${r.sum.topKg}</b>kg</div>
        </div>
        ${deltaLine}
      </div>
    `;
  }).join('');

  // subPattern 비교 — 각 subPattern 한 행, 오늘/직전/직직전 세로 미니 바.
  const subRowsHtml = subOrder.map(sp => {
    const cells = sessionsForRow.map(r => {
      const v = r.sum.subBalance?.[sp] || 0;
      const pct = Math.round(v / maxSets * 100);
      return `
        <div class="muscle-cmp-sub-cell${r.hi ? ' hi' : ''}">
          <div class="muscle-cmp-sub-bar"><div class="muscle-cmp-sub-fill" style="width:${pct}%;"></div></div>
          <div class="muscle-cmp-sub-val">${v}</div>
        </div>
      `;
    }).join('');
    return `
      <div class="muscle-cmp-sub-row">
        <div class="muscle-cmp-sub-name">${_subPatternLabel(sp)}</div>
        ${cells}
      </div>
    `;
  }).join('');

  const imbalanceHtml = cmp.imbalance && cmp.imbalance.note
    ? `<div class="muscle-cmp-note">💡 <b style="color:#fa342c;">${
        (cmp.imbalance.weakSubPatterns || []).map(_subPatternLabel).join(' · ') || ''
      }</b> 비중이 최근 3세션 합산 15% 미만이에요. 다음 세션 추천에 자동 반영됩니다.</div>`
    : '';

  return `
    <div class="section-label" style="margin-top:14px;">오늘 부위(${_esc(majorLabel)}) · 직전/직직전 비교</div>
    <div class="muscle-cmp-block">
      <div class="muscle-cmp-cols">${metricsHtml}</div>
      ${subOrder.length > 0 ? `
        <div class="muscle-cmp-sub-wrap">
          <div class="muscle-cmp-sub-row muscle-cmp-sub-head">
            <div class="muscle-cmp-sub-name">세부 부위</div>
            ${sessionsForRow.map(r => `<div class="muscle-cmp-sub-cell head${r.hi ? ' hi' : ''}">${_esc(r.label.split(' ')[0])}</div>`).join('')}
          </div>
          ${subRowsHtml}
        </div>
      ` : ''}
      ${imbalanceHtml}
      ${cmp.previous.length === 0 ? `<div class="muscle-cmp-note" style="color:#87878e;">직전 ${_esc(majorLabel)} 세션 기록이 없어요 — 다음 ${_esc(majorLabel)} 때 비교가 활성화됩니다.</div>` : ''}
    </div>
  `;
}

// 대분류 id → 한국어 라벨. config.MUSCLES 와 일관.
function _majorLabel(id) {
  return ({
    chest:'가슴', back:'등', shoulder:'어깨', lower:'하체', glute:'둔부',
    bicep:'이두', tricep:'삼두', abs:'복부',
  }[id] || id);
}

// subPattern UI 정렬 순서(상→중→하, 넓이→두께 등). 트레이너 관점 레이아웃.
function _preferredSubOrder(majors) {
  const out = [];
  const m = new Set(majors);
  if (m.has('chest'))    out.push('chest_upper','chest_mid','chest_lower');
  if (m.has('back'))     out.push('back_width','back_thickness','posterior','rear_delt');
  if (m.has('shoulder')) out.push('shoulder_front','shoulder_side','rear_delt','traps');
  if (m.has('lower'))    out.push('quad','hamstring','calf');
  if (m.has('glute'))    out.push('glute');
  if (m.has('bicep'))    out.push('bicep');
  if (m.has('tricep'))   out.push('tricep');
  if (m.has('abs'))      out.push('core');
  return out;
}
export function insightsClose() { _closeModal('insights-modal'); }

// 2026-04-20: AI 공유 모드 세그먼트 토글 (요약/상세). window.insightsShareMode 전역에 저장.
//   onclick 핸들러가 현재 모드를 읽어 provider 버튼을 누를 때 대응되는 본문을 복사.
export function insightsSetShareMode(mode) {
  const next = mode === 'detail' ? 'detail' : 'summary';
  window.insightsShareMode = next;
  const seg = document.getElementById('ai-share-mode-seg');
  if (seg) {
    seg.querySelectorAll('.ai-share-mode-btn').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.mode === next);
    });
  }
  const hint = document.getElementById('ai-share-mode-hint');
  if (hint) {
    hint.textContent = next === 'detail'
      ? '오늘 세션 세트 로그 + JSON 포함 — AI가 숫자 기준으로 피드백합니다.'
      : '주간 상위 부위 · PR · 최근 식단을 짧게 요약합니다.';
  }
}

// ── AI 공유 (클립보드 복사 + 앱/웹 열기) ──
// 버튼 클릭 시 최근 스냅샷을 클립보드에 복사하고 설치된 AI 앱(또는 웹)으로 이동.
// 2026-04-20: mode 파라미터 추가 ('summary' | 'detail') — Codex 지적 #5.
//   summary: 기존 요약 — 주간 상위 부위/PR, 오늘 총계, 최근 3일 식단.
//   detail : 주간은 요약, 오늘 세션은 raw (종목별 세트 로그 + JSON 블록).
//            AI 프롬프트 끝에 "로그를 그대로 근거로 피드백" 고정 지시 포함.
// 2026-04-20 (2): 플랫폼별 딥링크 분기 — 유저 지적("새 웹이 뜨고 앱으로 안 감") 반영.
//   Android: intent:// URI 로 명시적 package 지정 + S.browser_fallback_url → 미설치 시 웹 폴백.
//   iOS: 커스텀 스킴 시도 후 800ms 타임아웃으로 Universal Link 폴백 (앱 열리면 탭 백그라운드).
//   Desktop: 기존처럼 window.open 으로 새 탭.
//
// 패키지/스킴은 각 앱의 공식 스토어 기준:
//   ChatGPT  Android `com.openai.chatgpt` · iOS `chatgpt://` · Universal https://chatgpt.com/
//   Claude   Android `com.anthropic.claude` · iOS `claude://` · Universal https://claude.ai/new
//   Gemini   Android `com.google.android.apps.bard` · iOS `googlegemini://` · Universal https://gemini.google.com/app
const _AI_APP_LINKS = {
  chatgpt: {
    androidPackage: 'com.openai.chatgpt',
    androidHost: 'chatgpt.com', androidPath: '/',
    iosScheme: 'chatgpt://',
    web: 'https://chatgpt.com/',
  },
  claude: {
    androidPackage: 'com.anthropic.claude',
    androidHost: 'claude.ai', androidPath: '/new',
    iosScheme: 'claude://',
    web: 'https://claude.ai/new',
  },
  gemini: {
    androidPackage: 'com.google.android.apps.bard',
    androidHost: 'gemini.google.com', androidPath: '/app',
    iosScheme: 'googlegemini://',
    web: 'https://gemini.google.com/app',
  },
};

function _detectPlatform() {
  const ua = (navigator.userAgent || '').toLowerCase();
  // iPadOS 13+ 는 데스크톱 UA를 쓸 수 있으므로 touch 판정 병행.
  if (/iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

function _isStandalonePwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

// 2026-04-20 (v3): PWA scope(/tomatofarm/) 밖으로 이동할 때 target=_self 를 쓰면
//   Chrome PWA가 scope 내로 도로 가둬서 "앱으로 돌아옴" 현상이 발생. 반드시 _blank
//   로 외부 브라우저/앱 라우팅을 강제해야 한다.
function _navigateExternal(url) {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch { return false; }
}

function _openAiLink(provider) {
  const info = _AI_APP_LINKS[provider];
  if (!info) return;
  const platform = _detectPlatform();

  if (platform === 'android') {
    // 2026-04-20 (v3): scope 밖 이동은 target=_blank 로 강제 (Custom Tab/외부 브라우저).
    //   - ChatGPT/Claude: web URL 을 _blank 로 열면 Android App Link 가 설치된 앱으로 라우팅.
    //     (앱 설정 "지원되는 링크 열기 = 이 앱에서" 필요)
    //   - Gemini: web URL 이 App Link 매칭이 약해 앱 호출이 안 되므로, intent 에
    //     action=MAIN + category=LAUNCHER + package 만 명시해서 앱 자체를 런처로 오픈.
    //     설치돼 있으면 앱 열림, 미설치 시 fallback URL(웹) 로 이동.
    if (provider === 'gemini') {
      const fallback = encodeURIComponent(info.web);
      const launcherIntent = `intent:#Intent;`
        + `action=android.intent.action.MAIN;`
        + `category=android.intent.category.LAUNCHER;`
        + `package=${info.androidPackage};`
        + `S.browser_fallback_url=${fallback};end`;
      if (_navigateExternal(launcherIntent)) return;
      try { window.open(info.web, '_blank'); } catch {}
      return;
    }
    // ChatGPT / Claude — Universal Link(web URL) 을 외부로 내보내면 App Link 자동 라우팅.
    // intent 버전도 시도 가능하지만 PWA standalone 에서 불안정하여 web URL 우선.
    if (_navigateExternal(info.web)) return;
    try { window.open(info.web, '_blank'); } catch {}
    return;
  }

  if (platform === 'ios') {
    // iOS 는 Universal Link 을 _blank 로 띄우면 Safari(또는 설치된 앱) 가 열림.
    // Gemini 는 iOS Universal Link 등록이 약해 Safari 로 이동 — 사용자가 앱 있으면 자동 전환.
    if (_navigateExternal(info.web)) return;
    try { window.open(info.web, '_blank'); } catch {}
    return;
  }

  // Desktop — 기존 동작 유지 (새 탭).
  try { window.open(info.web, '_blank'); } catch {}
}

// 2026-04-21: 클립보드 복사 로직 공통 추출.
//   기존엔 insightsShareToAI 안에 섞여 있어 "앱 안 열고 복사만" 경로가 불가했음.
//   이제 insightsCopyToClipboard 버튼이 이 헬퍼만 호출하고 _openAiLink 는 건너뜀.
async function _copyInsightSnapshotToClipboard(mode, labelPrefix) {
  const snapshot = _lastInsightSnapshot;
  let text;
  if (snapshot && typeof snapshot === 'object' && 'summary' in snapshot) {
    text = (mode === 'detail' ? snapshot.detail : snapshot.summary)
      || snapshot.summary
      || '인사이트 데이터 없음';
  } else {
    text = (typeof snapshot === 'string' && snapshot) || '인사이트 데이터 없음';
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const modeLabel = mode === 'detail' ? '상세 로그' : '요약';
    _toast(`${modeLabel} ${labelPrefix}`, 'success');
    return true;
  } catch (e) {
    console.warn('[insights-copy] clipboard fail:', e?.message || e);
    _toast('복사 실패 — 브라우저 권한을 확인해주세요', 'error');
    return false;
  }
}

export async function insightsShareToAI(provider, mode = 'summary') {
  const ok = await _copyInsightSnapshotToClipboard(mode, '복사 완료 — AI 앱에 붙여넣으세요');
  if (ok) _openAiLink(provider);
}

// 2026-04-21: 클립보드 복사 전용 버튼 — AI 앱 열지 않음. 유저가 원하는 곳에 직접 붙여넣기용.
export async function insightsCopyToClipboard(mode = 'summary') {
  await _copyInsightSnapshotToClipboard(mode, '복사 완료');
}

function _fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return '—';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  if (m >= 60) return `${Math.floor(m/60)}h ${m%60}m`;
  return r > 0 ? `${m}m ${r}s` : `${m}분`;
}

function _calcTodayStats(cache, exList, todayKey) {
  // todayKey는 YYYY-MM-DD 문자열(dateKey 결과). cache는 같은 문자열을 키로 사용.
  // 과거엔 TODAY(Date)를 직접 키로 썼는데, JS가 toString()으로 변환하면
  // "Sun Apr 19 2026..."가 되어 cache에 영원히 맞지 않음. → 반드시 dateKey 문자열.
  const key = todayKey || dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const day = cache?.[key];
  const out = { totalSets: 0, totalVolume: 0, duration: 0 };
  if (!day) return out;
  out.duration = Number(day.workoutDuration) || 0;
  for (const entry of (day.exercises || [])) {
    for (const s of (entry.sets || [])) {
      if (s.setType === 'warmup') continue;
      const isWork = (s.done === true) || (s.done !== false && (s.kg || 0) > 0 && (s.reps || 0) > 0);
      if (!isWork) continue;
      out.totalSets++;
      out.totalVolume += (Number(s.kg) || 0) * (Number(s.reps) || 0);
    }
  }
  out.totalVolume = Math.round(out.totalVolume);
  return out;
}

function _collectTodayPRs(exList, today) {
  const out = [];
  for (const ex of exList) {
    const pr = _cachedDetectPRs(ex.id);
    if (pr.prDate === today && pr.progressKg > 0) {
      out.push({ name: ex.name, prKg: pr.lastKg, prReps: pr.prReps, diff: pr.progressKg });
    }
  }
  return out.slice(0, 5);
}

function _collect3DayDietSummary(cache, today) {
  const out = [];
  // today, today-1, today-2 순서
  const [y, m, d] = today.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  for (let i = 0; i < 3; i++) {
    const dt = new Date(base); dt.setDate(base.getDate() - i);
    const key = dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const day = cache?.[key];
    const kcal = (day?.bKcal || 0) + (day?.lKcal || 0) + (day?.dKcal || 0) + (day?.sKcal || 0);
    const protein = Math.round((day?.bProtein || 0) + (day?.lProtein || 0) + (day?.dProtein || 0) + (day?.sProtein || 0));
    const carbs = Math.round((day?.bCarbs || 0) + (day?.lCarbs || 0) + (day?.dCarbs || 0) + (day?.sCarbs || 0));
    const fat = Math.round((day?.bFat || 0) + (day?.lFat || 0) + (day?.dFat || 0) + (day?.sFat || 0));
    out.push({ dateKey: key, kcal: Math.round(kcal), protein, carbs, fat });
  }
  return out;
}

function _buildInsightTextSnapshot(ctx) {
  if (!ctx) return '인사이트 데이터 없음';
  const lines = [];
  lines.push(`# 🍅 토마토팜 인사이트`);
  lines.push(`범위: ${_prettyDate(ctx.range.fromKey)} ~ ${_prettyDate(ctx.range.toKey)}`);
  lines.push('');
  // 이번주
  lines.push(`## 이번 주`);
  lines.push(`- 종목 무게 변화: ${ctx.progressPct >= 0 ? '+' : ''}${ctx.progressPct}%`);
  if (ctx.weekBalance.length > 0) {
    lines.push(`- 부위별 세트 (상위 6):`);
    for (const [sp, v] of ctx.weekBalance.slice(0, 6)) {
      lines.push(`  · ${_subPatternLabel(sp)} ${v}세트`);
    }
  } else {
    lines.push(`- 운동 기록 없음`);
  }
  if (ctx.weekPRs.length > 0) {
    lines.push(`- 이번 주 PR: ${ctx.weekPRs.map(p => `${p.name} ${p.prKg}kg×${p.prReps}회 (+${p.diff}kg)`).join(', ')}`);
  }
  lines.push('');
  // 오늘
  lines.push(`## 오늘 (${_prettyDate(ctx.today)})`);
  if (ctx.todayStats.totalSets > 0) {
    lines.push(`- 세트 ${ctx.todayStats.totalSets} · 볼륨 ${ctx.todayStats.totalVolume.toLocaleString()}kg·회 · 시간 ${_fmtDuration(ctx.todayStats.duration)}`);
    if (ctx.todayBalance.length > 0) {
      lines.push(`- 오늘 자극 부위: ${ctx.todayBalance.map(([sp, v]) => `${_subPatternLabel(sp)} ${v}`).join(', ')}`);
    }
    if (ctx.todayPRs.length > 0) {
      lines.push(`- 오늘 PR: ${ctx.todayPRs.map(p => `${p.name} ${p.prKg}kg×${p.prReps}회 (+${p.diff}kg)`).join(', ')}`);
    }
  } else {
    lines.push(`- 오늘 운동 기록 없음`);
  }
  // 오늘 부위별 직전/직직전 비교 — 2026-04-20.
  //   각 대분류(가슴/등/이두 등)를 독립 블록으로 나열. 과거엔 합집합이라 다른 부위가 섞였음.
  const cmps = Array.isArray(ctx.muscleCmps) ? ctx.muscleCmps : [];
  for (const cmp of cmps) {
    if (!cmp || !cmp.majors?.length || !cmp.today) continue;
    const label = cmp.majors.map(_majorLabel).join(' · ');
    lines.push('');
    lines.push(`## 오늘 부위(${label}) · 직전/직직전 비교`);
    const subs = Object.entries(cmp.today.subBalance || {}).sort((a,b)=>b[1]-a[1]);
    if (subs.length > 0) {
      lines.push(`- 오늘 세부: ${subs.map(([sp,v]) => `${_subPatternLabel(sp)} ${v}`).join(' / ')}`);
    }
    for (let i = 0; i < cmp.previous.length; i++) {
      const p = cmp.previous[i];
      const psubs = Object.entries(p.subBalance || {}).sort((a,b)=>b[1]-a[1]);
      const head = i === 0 ? '직전' : '직직전';
      lines.push(`- ${head} (${_prettyDate(p.dateKey)}): ${p.workSets}세트 · 볼륨 ${p.totalVolume.toLocaleString()} · Top ${p.topKg}kg` +
        (psubs.length ? ` — ${psubs.map(([sp,v]) => `${_subPatternLabel(sp)} ${v}`).join('/')}` : ''));
    }
    if (cmp.deltas.length > 0) {
      const d = cmp.deltas[0];
      lines.push(`- 직전 대비 세트 ${d.workSetsDelta>=0?'+':''}${d.workSetsDelta}, 볼륨 ${d.volumeDelta>=0?'+':''}${d.volumeDelta.toLocaleString()}, Top ${d.topKgDelta>=0?'+':''}${d.topKgDelta}kg`);
    }
    if (cmp.imbalance?.weakSubPatterns?.length) {
      lines.push(`- ⚠ 약한 세부: ${cmp.imbalance.weakSubPatterns.map(_subPatternLabel).join(' · ')} — 다음 세션에서 보완 추천`);
    }
  }
  lines.push('');
  // 최근 3일 식단
  lines.push(`## 최근 3일 식단`);
  for (const d of ctx.recentDiet) {
    if (d.kcal > 0) {
      lines.push(`- ${_prettyDate(d.dateKey)}: ${d.kcal}kcal · P${d.protein} C${d.carbs} F${d.fat}`);
    } else {
      lines.push(`- ${_prettyDate(d.dateKey)}: 기록 없음`);
    }
  }
  lines.push('');
  lines.push(`---`);
  lines.push(`이 데이터를 기반으로 오늘/이번 주 운동·식단에 대한 피드백과 내일 개선안을 알려줘.`);
  return lines.join('\n');
}

// 2026-04-20: AI "상세 복사" — Codex 지적 #5.
//   주간은 요약, 오늘 세션은 raw 로그(세트 단위). 마크다운 + JSON 혼합 포맷.
//   AI가 총계만 보고 재추상화하는 것을 막기 위해 프롬프트 말미에 고정 지시를 덧붙임.
function _buildInsightDetailSnapshot(ctx) {
  if (!ctx) return '인사이트 데이터 없음';
  const { today, cache, exList } = ctx;
  const day = cache?.[today];
  const exById = new Map((exList || []).map(e => [e.id, e]));
  const lines = [];

  // ── 헤더 ────────────────────────────────────────────
  lines.push(`# 🍅 토마토팜 인사이트 (상세)`);
  lines.push(`범위: ${_prettyDate(ctx.range.fromKey)} ~ ${_prettyDate(ctx.range.toKey)}`);
  lines.push('');

  // ── 주간 요약 ────────────────────────────────────────
  lines.push(`## 이번 주 요약`);
  lines.push(`- 무게 변화 평균: ${ctx.progressPct >= 0 ? '+' : ''}${ctx.progressPct}%`);
  if (ctx.weekBalance.length > 0) {
    lines.push(`- 부위별 세트 (상위 6):`);
    for (const [sp, v] of ctx.weekBalance.slice(0, 6)) {
      lines.push(`  · ${_subPatternLabel(sp)} ${v}세트`);
    }
  } else {
    lines.push(`- 주간 운동 기록 없음`);
  }
  if (ctx.weekPRs.length > 0) {
    lines.push(`- 주간 PR: ${ctx.weekPRs.map(p => `${p.name} ${p.prKg}kg×${p.prReps}회 (+${p.diff}kg)`).join(', ')}`);
  }
  lines.push('');

  // ── 오늘 세션 raw ───────────────────────────────────
  lines.push(`## 오늘 세션 (${_prettyDate(today)})`);
  lines.push(`운동 시간: ${_fmtDuration(ctx.todayStats.duration)}`);
  lines.push(`총 세트: ${ctx.todayStats.totalSets}  ·  총 볼륨: ${ctx.todayStats.totalVolume.toLocaleString()} kg·회`);
  if (ctx.todayBalance.length > 0) {
    lines.push(`오늘 자극 부위: ${ctx.todayBalance.map(([sp, v]) => `${_subPatternLabel(sp)} ${v}`).join(' / ')}`);
  }
  lines.push('');

  const entries = day?.exercises || [];
  if (entries.length === 0) {
    lines.push(`_오늘 종목 기록 없음_`);
  } else {
    lines.push(`### 종목별 로그`);
    const structuredEntries = [];
    entries.forEach((entry, idx) => {
      const lib = exById.get(entry.exerciseId);
      const name = lib?.name || entry.name || entry.exerciseId;
      const muscleIds = (Array.isArray(entry.muscleIds) && entry.muscleIds.length)
        ? entry.muscleIds
        : (Array.isArray(lib?.muscleIds) ? lib.muscleIds : []);
      const movementId = entry.movementId || lib?.movementId || null;
      const sets = (entry.sets || []).map((s, i) => ({
        setNo: i + 1,
        setType: s.setType || 'main',
        done: s.done === true,
        kg: Number(s.kg) || 0,
        reps: Number(s.reps) || 0,
        volume: (Number(s.kg) || 0) * (Number(s.reps) || 0),
        rpe: s.rpe ?? null,
      }));
      const metaBits = [`exerciseId: ${entry.exerciseId}`];
      if (movementId) metaBits.push(`movementId: ${movementId}`);
      if (muscleIds.length > 0) metaBits.push(`muscles: ${muscleIds.join(',')}`);
      lines.push(`${idx + 1}. ${name} (${metaBits.join(' · ')})`);
      sets.forEach(s => {
        const typeLabel = s.setType !== 'main' ? ` [${s.setType}]` : '';
        const check = s.done ? '✓' : '·';
        const rpe = s.rpe != null ? ` RPE ${s.rpe}` : '';
        lines.push(`   ${check} Set ${s.setNo}${typeLabel} ${s.kg}kg × ${s.reps}회${rpe}`);
      });
      const workSets = sets.filter(s => s.setType !== 'warmup' && (s.done || (s.kg > 0 && s.reps > 0)));
      if (workSets.length > 0) {
        const top = workSets.reduce((a, b) => (a.kg >= b.kg ? a : b));
        const vol = workSets.reduce((acc, s) => acc + s.volume, 0);
        lines.push(`   _요약: workSets ${workSets.length} · topSet ${top.kg}kg×${top.reps} · volume ${Math.round(vol).toLocaleString()}_`);
      }
      structuredEntries.push({
        order: idx + 1,
        exerciseId: entry.exerciseId,
        name,
        movementId,
        muscleIds,
        note: entry.note || null,
        sets,
      });
    });

    // JSON 블록 — AI가 정확한 숫자로 읽을 수 있도록.
    // 2026-04-20: sameMuscleHistory — 오늘 부위 직전/직직전 raw 세션(세트 로그 포함).
    //   AI 가 부위 단위로 훈련 변화를 스스로 읽어내도록 원천 데이터 그대로 임베드.
    lines.push('');
    lines.push(`### 세션 JSON`);
    lines.push('```json');
    lines.push(JSON.stringify({
      sessionDate: today,
      weekRange: ctx.range,
      gymId: day?.gymId || null,
      durationSec: ctx.todayStats.duration,
      totalSets: ctx.todayStats.totalSets,
      totalVolume: ctx.todayStats.totalVolume,
      routineMeta: day?.routineMeta || null,
      exercises: structuredEntries,
      // 부위별 직전/직직전 이력 — 대분류마다 독립된 객체(섞이지 않도록).
      sameMuscleHistory: (Array.isArray(ctx.muscleCmps) ? ctx.muscleCmps : [])
        .map(_buildSameMuscleHistoryJson)
        .filter(Boolean),
    }, null, 2));
    lines.push('```');
  }

  if (ctx.todayPRs.length > 0) {
    lines.push('');
    lines.push(`### 오늘 PR`);
    for (const p of ctx.todayPRs) {
      lines.push(`- ${p.name} ${p.prKg}kg × ${p.prReps}회 (+${p.diff}kg)`);
    }
  }

  // ── 같은 부위 직전/직직전 raw 로그 (2026-04-20) ────────
  //   detail 모드 전용. 부위별로 독립 블록을 나열해 AI 가 한 부위에 해당하는 세션만 비교하도록.
  const cmpsArr = Array.isArray(ctx.muscleCmps) ? ctx.muscleCmps : [];
  for (const cmp of cmpsArr) {
    if (!cmp || !cmp.majors?.length || !cmp.previous?.length) continue;
    const label = cmp.majors.map(_majorLabel).join(' · ');
    lines.push('');
    lines.push(`### 같은 부위(${label}) 직전/직직전 세션`);
    cmp.previous.forEach((p, i) => {
      const head = i === 0 ? '직전' : '직직전';
      lines.push(`${head} (${_prettyDate(p.dateKey)}): ${p.workSets}세트 · 볼륨 ${p.totalVolume.toLocaleString()} · Top ${p.topKg}kg`);
      for (const ex of (p.exercises || [])) {
        lines.push(`  - ${ex.name} [${ex.subPattern || '-'}]`);
        for (const s of (ex.sets || [])) {
          const rpe = s.rpe != null ? ` RPE ${s.rpe}` : '';
          lines.push(`     · Set ${s.setNo}: ${s.kg}kg × ${s.reps}회${rpe}`);
        }
      }
    });
    if (cmp.imbalance?.weakSubPatterns?.length) {
      lines.push(`⚠ ${label} 최근 3세션 합산 기준 약한 세부: ${cmp.imbalance.weakSubPatterns.map(_subPatternLabel).join(' · ')}`);
    }
  }

  // ── 최근 3일 식단 ───────────────────────────────────
  lines.push('');
  lines.push(`## 최근 3일 식단`);
  for (const d of ctx.recentDiet) {
    if (d.kcal > 0) {
      lines.push(`- ${_prettyDate(d.dateKey)}: ${d.kcal}kcal · P${d.protein} C${d.carbs} F${d.fat}`);
    } else {
      lines.push(`- ${_prettyDate(d.dateKey)}: 기록 없음`);
    }
  }

  // ── 고정 프롬프트 ───────────────────────────────────
  lines.push('');
  lines.push(`---`);
  lines.push(`위 종목명/세트 로그를 다시 추상화하지 말고, 적힌 숫자를 근거로`);
  lines.push(`(1) 오늘 세션에 대한 피드백, (2) 이번 주 자극 균형 관점의 보완점,`);
  lines.push(`(3) 오늘 부위의 "직전/직직전 세션" 대비 변화(세트/볼륨/Top kg, subPattern 분포)를 비교하고,`);
  lines.push(`(4) 트레이너 관점에서 상부/중부/하부 등 세부 부위 균형이 어떤지 평가해서,`);
  lines.push(`(5) 다음 같은 부위 세션에 대한 증량/세트/세부 부위 보완 추천을 종목 단위로 구체적으로 제안해줘.`);
  return lines.join('\n');
}

// 2026-04-20: 외부 AI 연동용 같은부위 이력 JSON (직전/직직전).
//   buildMuscleComparison 반환 객체에서 JSON 직렬화에 필요한 필드만 선별.
function _buildSameMuscleHistoryJson(muscleCmp) {
  if (!muscleCmp || !muscleCmp.majors?.length || !muscleCmp.previous?.length) return null;
  return {
    majors: muscleCmp.majors,
    today: muscleCmp.today ? {
      dateKey: muscleCmp.today.dateKey,
      workSets: muscleCmp.today.workSets,
      totalVolume: muscleCmp.today.totalVolume,
      topKg: muscleCmp.today.topKg,
      subBalance: muscleCmp.today.subBalance,
    } : null,
    previous: muscleCmp.previous.map(p => ({
      dateKey: p.dateKey,
      workSets: p.workSets,
      totalVolume: p.totalVolume,
      topKg: p.topKg,
      subBalance: p.subBalance,
      exercises: (p.exercises || []).map(e => ({
        exerciseId: e.exerciseId,
        name: e.name,
        subPattern: e.subPattern,
        workSets: e.workSets,
        topKg: e.topKg,
        volume: e.volume,
        sets: e.sets,
      })),
    })),
    deltas: muscleCmp.deltas,
    imbalance: muscleCmp.imbalance,
  };
}

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

// 2026-04-19: subPattern(세부 부위) → major muscle part (대분류) 역매핑.
// 루틴 생성 후 필터링에서 "오늘 선택 부위(대분류)"와 교집합 체크할 때 사용.
// config.js MUSCLES 대분류와 1:1 정렬되어야 함: chest/back/shoulder/lower/glute/bicep/tricep/abs.
// 주의: glute는 MUSCLES에서 lower와 분리된 독립 타겟('둔부' 칩). 과거에 lower로 collapse
// 하면 유저가 '둔부'만 선택했을 때 글루트 기구가 전부 off-target으로 걸러짐. MOVEMENTS.primary
// 쪽은 이미 'glute'를 독립 값으로 쓰고 있었기 때문에 두 경로가 어긋나 있었음 (2026-04-19 CODEX 지적).
const _SUBPATTERN_TO_MAJOR = {
  chest_upper:'chest', chest_mid:'chest', chest_lower:'chest',
  back_width:'back', back_thickness:'back',
  posterior:'back',    // 후면사슬(데드리프트/RDL)은 등 두께 + 햄/둔근 혼합 — 등 분류
  shoulder_front:'shoulder', shoulder_side:'shoulder', rear_delt:'shoulder', traps:'shoulder',
  quad:'lower', hamstring:'lower', calf:'lower',
  glute:'glute',       // 독립 타겟 — lower로 collapse 금지
  bicep:'bicep',
  tricep:'tricep',
  core:'abs',
};

function _exerciseMajorMuscles(ex) {
  const out = new Set();
  if (!ex) return out;
  // 우선순위 1: 레코드의 muscleIds (subPattern 배열) — 리팩토링 후 표준 경로
  const muscleIds = Array.isArray(ex.muscleIds) ? ex.muscleIds : [];
  for (const sp of muscleIds) {
    const major = _SUBPATTERN_TO_MAJOR[sp];
    if (major) out.add(major);
  }
  // 우선순위 2: muscleIds 비어있으면 movementId → MOVEMENTS.primary (대분류)로 폴백
  if (out.size === 0 && ex.movementId) {
    const mv = MOVEMENTS.find(m => m.id === ex.movementId);
    if (mv?.primary) out.add(mv.primary);
  }
  // 우선순위 3: 최후 — 레코드의 muscleId(대분류) 그대로 사용
  if (out.size === 0 && ex.muscleId) out.add(ex.muscleId);
  return out;
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

// 2026-04-20: 정직한 스펙 — 성장 KPI 아님.
//   "각 종목의 마지막 세션 최고중량 − 그 이전 세션 최고중량" / lastKg 의 단순 평균.
//   한계:
//     - 기간 제한 없음 (몇 달 전 세션도 비교 대상이 될 수 있음).
//     - 반복수/RPE/볼륨/가동범위 미반영 — 같은 무게로 reps 가 늘어도 잡히지 않음.
//     - 주간 중간에 PR 을 찍고 가볍게 친 세션이 "직전" 이면 음수로 보일 수 있음.
//   UI 문구는 "직전 세션 대비 최고중량 변화 평균" 으로 정직화. 진짜 성장 KPI (e1RM,
//   rep-match PR, volume) 는 별도 이슈로 추가 예정.
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
window.expertOnbRemoveItem = expertOnbRemoveItem;
window.expertOnbAddAnotherGym = expertOnbAddAnotherGym;
// 2026-04-19: muscleIds 칩 에디터 onclick 대응
window.expertOnbMuscleSetPrimary = expertOnbMuscleSetPrimary;
window.expertOnbMuscleToggle = expertOnbMuscleToggle;
window.expertOnbMusclePickerToggle = expertOnbMusclePickerToggle;
window.openRoutineSuggest = openRoutineSuggest;
window.openRoutineCandidatesDirect = openRoutineCandidatesDirect;
window.routineSuggestClose = routineSuggestClose;
window.routineSuggestGenerate = routineSuggestGenerate;
window.routineCandidatesClose = routineCandidatesClose;
window.routineCandidatesRegen = routineCandidatesRegen;
window.routineCandidatesSelect = routineCandidatesSelect;
window.insightsOpen = insightsOpen;
window.insightsClose = insightsClose;
window.insightsShareToAI = insightsShareToAI;
window.insightsCopyToClipboard = insightsCopyToClipboard;
window.insightsSetShareMode = insightsSetShareMode;
// 기본 모드: summary. insightsOpen 호출 시 DOM 세그먼트와 동기화.
if (typeof window.insightsShareMode !== 'string') window.insightsShareMode = 'summary';
window.gymEqClose = gymEqClose;
window.renderExpertTopArea = renderExpertTopArea;
window.resetExpertView = resetExpertView;
// 일반 모드 뷰 ↔ 프로 모드 뷰 — preset.enabled 건드리지 않고 세션 상태만 토글.
window.wtExcShowExpertView = () => {
  _expertViewShown = true;
  renderExpertTopArea();
};
window.wtExcSwitchToNormalView = () => {
  _expertViewShown = false;
  renderExpertTopArea();
};
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
  try { const { S } = await import('./state.js'); S.workout.currentGymId = next.id; } catch {}
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
    S.workout.currentGymId = _resolveCurrentGymId();
    S.workout.routineMeta = { source: 'template', candidateKey: recent.candidateKey || null, rationale: recent.rationale || '' };
    S.workout.exercises = recent.items.map(it => {
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

// ── 전문가 카드 세그먼트 상태 전환 (레거시 호환용) ────────────────
// 랜딩 '쉬었어요/건강이슈' 제거 후 — 항상 헬스 탭 활성화만 수행.
window.wtExcSelectStatus = () => {
  try {
    if (typeof window.wtSwitchType === 'function') window.wtSwitchType('gym');
  } catch (e) { console.warn('[wtExcSelectStatus]:', e); }
  renderExpertTopArea();
};

// ── 일반 모드로 전환 ─────────────────────────────────────────────
window.wtExcLeaveExpertMode = async () => {
  const ok = await confirmAction({
    title: '일반 모드로 전환할까요?',
    message: '프로 모드 설정(헬스장·기구·루틴)은 유지돼요.\n헬스 종목 옆 ⚡ 버튼으로 언제든 다시 켤 수 있어요.',
    confirmLabel: '일반 모드로',
    cancelLabel: '취소',
  });
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
  if (!gymId || gymId === S.workout.currentGymId) return;
  const gym = getGyms().find(g => g.id === gymId);
  if (!gym) return;

  // 진행 중 세션 오염 방지 — 현재 루틴/세트가 있으면 confirm + 초기화
  const hasActiveSession = !!S.workout.routineMeta
    || (Array.isArray(S.workout.exercises) && S.workout.exercises.length > 0);
  if (hasActiveSession) {
    const ok = await confirmAction({
      title: `${gym.name}으로 전환할까요?`,
      message: '지금 선택한 루틴과 세트 기록이 초기화돼요.',
      confirmLabel: '전환',
      cancelLabel: '취소',
      destructive: true,
    });
    if (!ok) return;
  }

  try {
    if (hasActiveSession) {
      S.workout.exercises = [];
      S.workout.routineMeta = null;
    }
    await saveExpertPreset({ currentGymId: gymId });
    S.workout.currentGymId = gymId;
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
      S.workout.currentGymId = id;
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
      const ex = getExList().find(x => x.id === exId);
      const ok = await confirmAction({
        title: '이 기구를 삭제할까요?',
        message: ex ? `"${ex.name}"을(를) 목록에서 제거해요.` : '',
        confirmLabel: '삭제',
        cancelLabel: '취소',
        destructive: true,
      });
      if (!ok) return;
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

// ── 커스텀 자극부위 CRUD 모달 ─────────────────────────────────────
// 전역 — 프로모드/일반모드 구분 없이 자극부위 자율 추가/삭제 가능.
async function _ensureCustomMusclesModal() {
  let modal = document.getElementById('custom-muscles-modal');
  if (!modal) {
    const { loadAndInjectModals } = await import('../modal-manager.js');
    await loadAndInjectModals();
    modal = document.getElementById('custom-muscles-modal');
  }
  return modal;
}

function _renderCmmList() {
  const host = document.getElementById('cmm-list');
  if (!host) return;
  const all = getMuscleParts();
  const customIds = new Set(getCustomMuscles().map(m => m.id));
  host.innerHTML = all.map(m => {
    const isCustom = customIds.has(m.id);
    const delBtn = isCustom
      ? `<button class="tds-btn tonal sm" onclick="deleteCustomMuscleUi('${m.id.replace(/'/g, "\\'")}')">삭제</button>`
      : `<span style="color:var(--text-tertiary); font-size:12px;">기본</span>`;
    return `<div class="wt-list-row" style="display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--border);">
      <span style="width:14px; height:14px; border-radius:50%; background:${m.color || '#8b5cf6'}; flex-shrink:0;"></span>
      <span style="flex:1; font-weight:500;">${m.name}</span>
      ${delBtn}
    </div>`;
  }).join('');
}

window.openCustomMusclesModal = async () => {
  const modal = await _ensureCustomMusclesModal();
  if (!modal) return;
  _renderCmmList();
  modal.classList.add('open');
};

window.closeCustomMusclesModal = () => {
  document.getElementById('custom-muscles-modal')?.classList.remove('open');
};

window.addCustomMuscle = async () => {
  const nameEl  = document.getElementById('cmm-new-name');
  const colorEl = document.getElementById('cmm-new-color');
  const name = (nameEl?.value || '').trim();
  if (!name) { _toast('이름을 입력하세요', 'error'); return; }
  if (name.length > 12) { _toast('이름은 12자 이내', 'error'); return; }
  const color = colorEl?.value || '#8b5cf6';
  const id = 'custom_' + Date.now();
  try {
    await saveCustomMuscle({ id, name, color, kind: 'part' });
    if (nameEl) nameEl.value = '';
    _renderCmmList();
    _toast('추가했어요', 'success');
    // 프로모드 Step 4가 열려 있으면 즉시 재렌더
    if (typeof renderExpertTopArea === 'function') renderExpertTopArea();
  } catch (e) {
    console.warn('[addCustomMuscle]:', e);
    _toast('추가 실패', 'error');
  }
};

window.deleteCustomMuscleUi = async (id) => {
  const m = getCustomMuscles().find(x => x.id === id);
  if (!m) return;
  // D-4: orphan 방지 — 참조 중인 Exercise가 있으면 삭제 차단 + 영향 종목명을 나열.
  //      (과거엔 개수만 노출해서 "뭐가 걸렸는지" 확인하러 피커를 뒤져야 했음)
  const refs = getExList().filter(e => e.muscleId === id);
  if (refs.length > 0) {
    const MAX_LIST = 8;
    const sample = refs.slice(0, MAX_LIST).map(e => `• ${e.name}`).join('\n');
    const more = refs.length > MAX_LIST ? `\n… 외 ${refs.length - MAX_LIST}개` : '';
    await confirmAction({
      title: `"${m.name}" 부위를 먼저 비워주세요`,
      message: `이 부위로 등록된 운동 ${refs.length}건:\n${sample}${more}\n\n해당 운동의 부위를 바꾸거나 삭제한 뒤 이 부위를 지울 수 있어요.`,
      confirmLabel: '확인',
      cancelLabel: '',
    });
    return;
  }
  const ok = await confirmAction({
    title: `"${m.name}" 부위를 삭제할까요?`,
    message: '이 부위는 등록된 운동이 없어 안전하게 제거돼요.',
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
  });
  if (!ok) return;
  try {
    await deleteCustomMuscle(id);
    _toast('부위 삭제 완료', 'success');
    renderExpertTopArea();
  } catch (e) {
    console.warn('[deleteCustomMuscle]:', e);
    _toast('삭제 실패', 'error');
  }
};
