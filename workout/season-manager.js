import { escapeHtml as _esc } from '../utils/escape-html.js';
import {
  createWorkoutSeason,
  getCache,
  getExList,
  getSeasonRunningPlan,
  getSeasonRegistry,
  getSeasonTestBoardV2,
  getSeasonWorkoutPlan,
  getTestBoardV2,
  updateWorkoutSeason,
} from '../data.js';
import {
  addSeasonDays,
  findSeasonForDate,
  validateSeasonRegistry,
} from '../data/season-model.js';
import {
  activeBenchmarks,
  roundToPlate,
} from './test-v2/board-core.js';
import {
  buildSeasonExerciseSetup,
  buildSeasonExerciseHistory,
  calculateSeasonWendlerFromTenRm,
  SEASON_NORMAL_INCREMENTS_KG,
  SEASON_NORMAL_PROGRESSION_WEEKS,
  seasonResetPreview,
} from './season-reset.js';
import { inferW863Profile, W863_ORIGINAL_PROFILES } from './w863-original.js';
import { showToast } from '../ui/toast.js';
import { confirmAction } from '../utils/confirm-modal.js';

const STEP_LABELS = ['기간', '종목·목표', '선택 확인', '러닝', '최종 확인'];
const WENDLER_PLATE_STEP_KG = 1.25;
const WENDLER_THREE_WEEK_BLOCKS_PER_CYCLE = 2;
const GROUP_LABELS = Object.freeze({
  chest: '가슴', back: '등', shoulder: '어깨', lower: '하체', arm: '팔', abs: '복부', other: '기타',
});
const GROUP_ORDER = Object.freeze(['chest', 'back', 'shoulder', 'lower', 'arm', 'abs', 'other']);
const RUNNING_GOALS = Object.freeze({
  base: { label: '기초 거리', distanceKm: null, weeklyDistanceKm: 15, weeklySessions: 3, longestRunKm: 7 },
  '5k': { label: '5K 대회', distanceKm: 5, weeklyDistanceKm: 18, weeklySessions: 3, longestRunKm: 7 },
  '10k': { label: '10K 대회', distanceKm: 10, weeklyDistanceKm: 24, weeklySessions: 4, longestRunKm: 12 },
  half: { label: '하프 대회', distanceKm: 21.0975, weeklyDistanceKm: 32, weeklySessions: 4, longestRunKm: 18 },
  marathon: { label: '풀 대회', distanceKm: 42.195, weeklyDistanceKm: 42, weeklySessions: 5, longestRunKm: 28 },
});
let _state = null;

function _todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function _seasonName(startDate) {
  const month = Number(String(startDate).slice(5, 7));
  const year = String(startDate).slice(0, 4);
  const label = month >= 3 && month <= 5 ? '봄' : month <= 8 ? '여름' : month <= 11 ? '가을' : '겨울';
  return `${year} ${label} 시즌`;
}

function _requestId() {
  return globalThis.crypto?.randomUUID?.() || `season-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function _inclusiveSeasonDays(season = {}) {
  const start = new Date(`${season.startDate}T00:00:00Z`);
  const end = new Date(`${season.endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / 86400000) + 1);
}

function _seasonWeeks(season = {}) {
  const days = _inclusiveSeasonDays(season);
  return days ? Math.round((days / 7) * 10) / 10 : 0;
}

function _goalPaceText(plan = {}) {
  const fixedPace = Number(plan.targetPaceSecPerKm);
  if (plan.paceGoalMode === 'adaptive') {
    const rate = Number(plan.adaptiveRatePct);
    return rate > 0 ? `직전 주 대비 ${rate}% 개선` : '개선률을 입력해 주세요';
  }
  if (fixedPace > 0) return `${Math.floor(fixedPace / 60)}′${String(fixedPace % 60).padStart(2, '0')}″/km`;
  const minutes = Number(plan.targetTimeMin);
  const distance = Number(plan.raceDistanceKm);
  if (!(minutes > 0) || !(distance > 0)) return '완주 목표 — 기록 목표를 선택하면 자동 계산';
  const paceSeconds = Math.round((minutes * 60) / distance);
  return `${Math.floor(paceSeconds / 60)}′${String(paceSeconds % 60).padStart(2, '0')}″/km`;
}

function _overridesFromBoard(board = {}) {
  return Object.fromEntries(activeBenchmarks(board).map(benchmark => {
    const exerciseId = String(benchmark.exerciseId || benchmark.id);
    if (benchmark.program === 'wendler') {
      return [exerciseId, {
        program: 'wendler',
        benchmarkId: benchmark.id,
        wendler: { ...(benchmark.wendler || {}) },
      }];
    }
    return [exerciseId, {
      program: 'stair',
      benchmarkId: benchmark.id,
      progressionWeeks: Number(benchmark.progressionWeeks) || SEASON_NORMAL_PROGRESSION_WEEKS,
      tracks: Object.fromEntries((benchmark.tracks || ['volume']).map(track => [track, {
        kg: Number(benchmark.seed?.[track]?.kg) || '',
        sets: Number(benchmark.setsByTrack?.[track]) || Number(benchmark.setsDefault) || '',
        incrementKg: Number(benchmark.incrementKgByTrack?.[track]) || Number(benchmark.incrementKg) || '',
      }])),
    }];
  }));
}

function _configurationFor(exerciseId) {
  return _state?.exerciseSetup?.configurations?.find(configuration => configuration.exerciseId === exerciseId) || null;
}

function _emptyTrackDraft(previous = {}) {
  return {
    kg: previous.kg ?? '',
    sets: previous.sets ?? '',
    incrementKg: previous.incrementKg ?? '',
  };
}

function _normalTrackReady(track = {}) {
  return Number(track.kg) > 0
    && Number(track.sets) > 0
    && SEASON_NORMAL_INCREMENTS_KG.includes(Number(track.incrementKg));
}

function _goalTrackIds(override = {}) {
  if (override.program === 'wendler') return Number(override.wendler?.oneRmKg) > 0 ? ['volume'] : [];
  if (override.program !== 'stair') return [];
  return ['volume', 'intensity'].filter(track => _normalTrackReady(override.tracks?.[track]));
}

// ── 종목별 기간 ─────────────────────────────────────────────────
// 비워두면 그 종목은 시즌 전체 기간을 쓴다. 저장 시 시즌 범위로 잘린다.
function _exerciseWindowValue(exerciseId, field) {
  const window = _state?.exerciseWindows?.[exerciseId];
  if (window?.[field]) return window[field];
  return field === 'startDate' ? _state?.season?.startDate || '' : _state?.season?.endDate || '';
}

function _exerciseWindowHint(exerciseId) {
  const window = _state?.exerciseWindows?.[exerciseId];
  if (!window?.startDate && !window?.endDate) return '시즌 전체 기간을 사용합니다';
  const start = _exerciseWindowValue(exerciseId, 'startDate');
  const end = _exerciseWindowValue(exerciseId, 'endDate');
  if (start > end) return '시작일이 종료일보다 늦습니다';
  return `${start.replace(/-/g, '.')} ~ ${end.replace(/-/g, '.')}`;
}

function _setExerciseWindow(exerciseId, field, rawValue) {
  if (!_state) return;
  if (!_state.exerciseWindows) _state.exerciseWindows = {};
  const seasonStart = _state.season.startDate;
  const seasonEnd = _state.season.endDate;
  const current = { ..._state.exerciseWindows[exerciseId] };
  const value = String(rawValue || '').trim();
  if (!value) delete current[field];
  else current[field] = value < seasonStart ? seasonStart : value > seasonEnd ? seasonEnd : value;
  const startDate = current.startDate || seasonStart;
  const endDate = current.endDate || seasonEnd;
  // 시즌 기간과 같아지면 종목별 기간을 둘 이유가 없다.
  if (startDate === seasonStart && endDate === seasonEnd) delete _state.exerciseWindows[exerciseId];
  else _state.exerciseWindows[exerciseId] = { startDate, endDate };
}

// 저장 직전에 시즌 담당 종목만 남긴다.
function _collectExerciseWindows() {
  const windows = {};
  for (const exerciseId of _state.selectedExerciseIds) {
    const window = _state.exerciseWindows?.[exerciseId];
    if (window?.startDate && window?.endDate) windows[exerciseId] = { ...window };
  }
  return windows;
}

function _refreshSelectedExerciseIds() {
  if (!_state) return;
  _state.selectedExerciseIds = new Set(_state.exerciseSetup.configurations
    .filter(configuration => _goalTrackIds(_state.overrides[configuration.exerciseId]).length)
    .map(configuration => configuration.exerciseId));
}

function _recentSetSummary(history) {
  if (!history?.sets?.length) return '아직 수행 기록이 없습니다.';
  const groups = [];
  for (const set of history.sets) {
    const key = `${set.kg}|${set.reps}`;
    const existing = groups.find(group => group.key === key);
    if (existing) existing.count += 1;
    else groups.push({ key, kg: set.kg, reps: set.reps, count: 1 });
  }
  return groups.map(group => `${group.kg}kg×${group.reps}회 ${group.count}세트`).join(' · ');
}

function _wendlerDraft(configuration) {
  const id = configuration.exerciseId;
  const override = _state.overrides[id] || {};
  const benchmark = configuration.benchmark;
  const profileId = override.wendler?.profileId || inferW863Profile({
    ...benchmark,
    exerciseId: id,
    movementId: configuration.movementId,
    label: configuration.label,
    primaryMajor: configuration.groupId,
  });
  const profile = W863_ORIGINAL_PROFILES[profileId] || Object.values(W863_ORIGINAL_PROFILES)[0];
  const sourceWendler = { ...(benchmark?.wendler || {}), ...(override.wendler || {}) };
  const roundKg = WENDLER_PLATE_STEP_KG;
  const oneRmKg = Number(override.wendler?.oneRmKg)
    || Number(benchmark?.wendler?.oneRmKg)
    || Number(benchmark?.wendler?.tmKg) / 0.9
    || profile.reference1RmKg;
  return {
    profileId,
    tenRmKg: Number(override.wendler?.tenRmKg) || 0,
    oneRmKg: Math.round(oneRmKg * 10) / 10,
    tmKg: roundToPlate(oneRmKg * 0.9, roundKg),
    threeWeekIncrementKg: _wendlerThreeWeekIncrement(sourceWendler, profile),
    roundKg,
  };
}

function _syncExerciseSetup(state) {
  const setup = buildSeasonExerciseSetup({
    registeredExercises: state.exercises,
    previousBoard: state.board,
    benchmarkMappings: state.benchmarkMappings,
  });
  const overrides = { ...(state.overrides || {}) };
  for (const configuration of setup.configurations) {
    const id = configuration.exerciseId;
    const previous = overrides[id] || {};
    const program = ['wendler', 'stair', 'none'].includes(previous.program)
      ? previous.program
      : 'none';
    if (program === 'wendler') {
      const benchmark = configuration.benchmark;
      const profileId = previous.wendler?.profileId || inferW863Profile({
        ...benchmark,
        exerciseId: id,
        movementId: configuration.movementId,
        label: configuration.label,
      });
      const profile = W863_ORIGINAL_PROFILES[profileId] || Object.values(W863_ORIGINAL_PROFILES)[0];
      overrides[id] = {
        ...previous,
        program: 'wendler',
        benchmarkId: benchmark?.id || configuration.benchmarkId,
        wendler: {
          profileId,
          oneRmKg: Number(previous.wendler?.oneRmKg)
            || Number(benchmark?.wendler?.oneRmKg)
            || Number(benchmark?.wendler?.tmKg) / 0.9
            || profile.reference1RmKg,
          incrementKg: Number(previous.wendler?.incrementKg)
            || Number(benchmark?.wendler?.incrementKg)
            || profile.defaultIncrementKg,
          roundKg: Number(previous.wendler?.roundKg) || Number(benchmark?.wendler?.roundKg) || 2.5,
          ...(Number(previous.wendler?.tenRmKg) > 0 ? { tenRmKg: Number(previous.wendler.tenRmKg) } : {}),
        },
      };
    } else {
      overrides[id] = {
        ...previous,
        program,
        benchmarkId: configuration.benchmarkId,
        tracks: {
          volume: _emptyTrackDraft(previous.tracks?.volume),
          intensity: _emptyTrackDraft(previous.tracks?.intensity),
        },
        progressionWeeks: SEASON_NORMAL_PROGRESSION_WEEKS,
      };
    }
  }
  state.exerciseSetup = setup;
  state.overrides = overrides;
  state.selectedExerciseIds = new Set(setup.configurations
    .filter(configuration => _goalTrackIds(overrides[configuration.exerciseId]).length)
    .map(configuration => configuration.exerciseId));
}

function _initialState(editingSeasonId = null) {
  const registry = getSeasonRegistry();
  const editingSeason = editingSeasonId
    ? registry.seasons.find(season => season.id === editingSeasonId) || null
    : null;
  const board = editingSeason ? (getSeasonTestBoardV2(editingSeason.id) || getTestBoardV2()) : getTestBoardV2();
  const exercises = getExList().filter(exercise => exercise?.id);
  const latest = registry.seasons.at(-1) || null;
  const today = _todayKey();
  const startDate = latest && latest.endDate >= today ? addSeasonDays(latest.endDate, 1) : today;
  const existingWorkoutPlan = editingSeason ? getSeasonWorkoutPlan(editingSeason.id) : null;
  const existingRunningPlan = editingSeason ? getSeasonRunningPlan(editingSeason.id) : null;
  const benchmarks = activeBenchmarks(board || {});
  const state = {
    step: 0,
    registry,
    board,
    exercises,
    exerciseHistory: buildSeasonExerciseHistory(getCache() || {}, exercises),
    benchmarks,
    selectedExerciseIds: new Set(),
    season: editingSeason
      ? { ...editingSeason }
      : { name: _seasonName(startDate), startDate, endDate: addSeasonDays(startDate, 41) },
    benchmarkMappings: {},
    mode: 'wizard',
    manageOpenExerciseId: null,
    // 종목별 기간. 편집 시 기존 값을 이어받고, 없으면 시즌 전체 기간을 쓴다.
    exerciseWindows: editingSeason?.exerciseWindows
      ? Object.fromEntries(Object.entries(editingSeason.exerciseWindows).map(([id, window]) => [id, { ...window }]))
      : {},
    exerciseSetup: null,
    overrides: editingSeason ? _overridesFromBoard(board || {}) : {},
    weeklySessionTarget: Number(existingWorkoutPlan?.weeklySessionTarget) || 3,
    runningPlan: {
      goalType: 'base',
      completionGoal: 'finish',
      eventName: '',
      targetDate: editingSeason?.endDate || addSeasonDays(startDate, 41),
      raceDistanceKm: null,
      targetTimeMin: null,
      paceGoalMode: 'fixed',
      targetPaceSecPerKm: null,
      adaptiveRatePct: 2,
      baselineWeeklyDistanceKm: 10,
      weeklyDistanceKm: 15,
      weeklySessions: 3,
      longestRunKm: 7,
      speedSessionsPerWeek: 1,
      optionalDurationMin: 120,
      ...(existingRunningPlan || {}),
    },
    activeGroupId: null,
    wendlerEditor: null,
    clientRequestId: _requestId(),
    editingSeasonId: editingSeason?.id || null,
    originalStartDate: editingSeason?.startDate || null,
    saving: false,
  };
  _syncExerciseSetup(state);
  state.activeGroupId = GROUP_ORDER.find(groupId => (
    state.exerciseSetup.configurations.some(configuration => configuration.groupId === groupId)
  )) || 'other';
  return state;
}

function _modal() {
  let modal = document.getElementById('workout-season-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'workout-season-modal';
  modal.className = 'modal-backdrop workout-season-modal';
  modal.hidden = true;
  modal.innerHTML = '<div class="modal-sheet workout-season-sheet" role="dialog" aria-modal="true" aria-labelledby="workout-season-title"></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', event => {
    if (event.target === modal && !_state?.saving) closeWorkoutSeasonWizard();
  });
  const sheet = modal.querySelector('.workout-season-sheet');
  sheet.addEventListener('click', _handleClick);
  sheet.addEventListener('input', _handleInput);
  sheet.addEventListener('change', _handleInput);
  return modal;
}

function _stepper() {
  return `<div class="season-stepper" aria-label="시즌 설정 단계">${STEP_LABELS.map((label, index) => (
    `<span class="${index === _state.step ? 'is-current' : index < _state.step ? 'is-done' : ''}"><b>${index + 1}</b>${_esc(label)}</span>`
  )).join('')}</div>`;
}

function _periodStep() {
  const otherSeasons = _state.registry.seasons.filter(season => season.id !== _state.editingSeasonId);
  const existing = otherSeasons.length
    ? `<div class="season-existing-list">${otherSeasons.map(season => `<span>${_esc(season.name)} · ${season.startDate}–${season.endDate}</span>`).join('')}</div>`
    : `<p class="season-empty-copy">${_state.editingSeasonId ? '현재 시즌의 기간과 목표를 안전하게 수정할 수 있어요.' : '등록된 시즌이 없습니다. 첫 시즌을 오늘부터 시작할 수 있어요.'}</p>`;
  const weeks = _seasonWeeks(_state.season);
  return `
    <div class="season-step-copy"><strong>${_state.editingSeasonId ? '시즌 기간 수정' : '새 시즌 기간'}</strong><p>헬스 성장판에 맞춰 6주 또는 7주를 권장합니다. 같은 기간에도 다른 운동 종목을 선택하면 시즌을 병행할 수 있어요.</p></div>
    ${existing}
    <label class="season-field"><span>시즌 이름</span><input data-season-field="name" value="${_esc(_state.season.name)}" maxlength="40"></label>
    <div class="season-length-presets" aria-label="시즌 기간 빠른 선택">
      ${[6, 7].map(value => `<button type="button" class="${weeks === value ? 'is-active' : ''}" data-season-action="season-length" data-season-weeks="${value}"><b>${value}주</b><small>${value === 6 ? '기본 성장판' : '8/6/3 포함'}</small></button>`).join('')}
      <span>현재 ${weeks || '-'}주</span>
    </div>
    <div class="season-field-row">
      <label class="season-field"><span>시작일</span><input type="date" data-season-field="startDate" value="${_esc(_state.season.startDate)}" ${_state.editingSeasonId ? 'disabled' : ''}></label>
      <label class="season-field"><span>종료일</span><input type="date" data-season-field="endDate" value="${_esc(_state.season.endDate)}"></label>
    </div>`;
}

function _wendlerThreeWeekIncrement(wendler = {}, profile = {}) {
  const saved = Number(wendler.threeWeekIncrementKg);
  if (SEASON_NORMAL_INCREMENTS_KG.includes(saved)) return saved;
  const converted = Number(wendler.incrementKg) / WENDLER_THREE_WEEK_BLOCKS_PER_CYCLE;
  if (SEASON_NORMAL_INCREMENTS_KG.includes(converted)) return converted;
  const profileConverted = Number(profile.defaultIncrementKg) / WENDLER_THREE_WEEK_BLOCKS_PER_CYCLE;
  if (SEASON_NORMAL_INCREMENTS_KG.includes(profileConverted)) return profileConverted;
  return SEASON_NORMAL_INCREMENTS_KG[0];
}

function _exerciseStep() {
  const configurations = [..._state.exerciseSetup.configurations].sort((left, right) => {
    const leftDate = _state.exerciseHistory[left.exerciseId]?.dateKey || '';
    const rightDate = _state.exerciseHistory[right.exerciseId]?.dateKey || '';
    return rightDate.localeCompare(leftDate) || left.order - right.order;
  });
  const grouped = GROUP_ORDER.map(groupId => ({
    groupId,
    items: configurations.filter(configuration => configuration.groupId === groupId),
  })).filter(group => group.items.length);
  if (!grouped.some(group => group.groupId === _state.activeGroupId)) {
    _state.activeGroupId = grouped[0]?.groupId || 'other';
  }
  const activeGroup = grouped.find(group => group.groupId === _state.activeGroupId) || grouped[0] || { groupId: 'other', items: [] };
  const tabs = grouped.map(({ groupId, items }) => {
    const selectedCount = items.filter(item => _state.selectedExerciseIds.has(item.exerciseId)).length;
    return `<button type="button" class="${groupId === activeGroup.groupId ? 'is-active' : ''}" data-season-action="select-group" data-season-group="${_esc(groupId)}" aria-pressed="${groupId === activeGroup.groupId}"><span>${_esc(GROUP_LABELS[groupId] || groupId)}</span><small>${selectedCount}/${items.length}</small></button>`;
  }).join('');
  return `
    <div class="season-step-copy"><strong>부위별 종목 · 새 시즌 목표</strong><p>최근 수행한 종목부터 표시합니다. 입력을 완료한 트랙만 목표가 되고, 비워 둔 종목은 나중에 설정할 수 있어요.</p></div>
    <nav class="season-exercise-tabs" aria-label="운동 부위">${tabs}</nav>
    <section class="season-exercise-group">
      <header><strong>${GROUP_LABELS[activeGroup.groupId] || activeGroup.groupId}</strong><span>${activeGroup.items.length}종목</span></header>
      <div class="season-exercise-list">${activeGroup.items.map((configuration) => {
        const id = configuration.exerciseId;
        const config = _state.overrides[id];
        const isWendler = config.program === 'wendler';
        const isStair = config.program === 'stair';
        const goalTracks = _goalTrackIds(config);
        const selected = goalTracks.length > 0;
        const hasPartialGoal = isStair && ['volume', 'intensity'].some(track => {
          const draft = config.tracks?.[track] || {};
          return draft.kg !== '' || draft.sets !== '' || draft.incrementKg !== '';
        });
        const history = _state.exerciseHistory[id];
        const wendler = config.wendler || _wendlerDraft(configuration);
        const tmKg = roundToPlate(Number(wendler.oneRmKg) * 0.9, WENDLER_PLATE_STEP_KG);
        const badge = isWendler && selected ? 'W1 시작' : selected ? `${goalTracks.length}트랙 목표` : hasPartialGoal ? '입력 중' : '미설정';
        return `<section class="season-exercise-card${selected ? ' has-goal' : ''}" data-season-exercise-card="${_esc(id)}">
          <header>
            <div class="season-exercise-identity"><b>${_esc(configuration.label)}</b><small>${_esc(GROUP_LABELS[configuration.groupId] || configuration.groupId)} · ID ${_esc(id)}</small></div>
            <em class="${isWendler && selected ? 'is-wendler' : selected ? 'is-goal' : ''}">${badge}</em>
          </header>
          <div class="season-recent-reference${history ? '' : ' is-empty'}"><span>최근 수행${history ? ` · ${_esc(history.dateKey.slice(5).replace('-', '.'))}` : ''}</span><strong>${_esc(_recentSetSummary(history))}</strong></div>
          <div class="season-card-settings">
            ${selected ? `<div class="season-exercise-window">
              <span class="season-window-title">종목 기간</span>
              <label class="season-compact-field"><span>시작</span><input type="date" data-season-exercise-window="start" min="${_esc(_state.season.startDate)}" max="${_esc(_state.season.endDate)}" value="${_esc(_exerciseWindowValue(id, 'startDate'))}"></label>
              <label class="season-compact-field"><span>종료</span><input type="date" data-season-exercise-window="end" min="${_esc(_state.season.startDate)}" max="${_esc(_state.season.endDate)}" value="${_esc(_exerciseWindowValue(id, 'endDate'))}"></label>
              <small class="season-window-hint">${_esc(_exerciseWindowHint(id))}</small>
            </div>` : ''}
            <label class="season-compact-field season-program-field"><span>목표 방식</span><select data-season-program="program"><option value="none" ${config.program === 'none' ? 'selected' : ''}>목표 없음</option><option value="stair" ${isStair ? 'selected' : ''}>일반 · 3주 증량</option><option value="wendler" ${isWendler ? 'selected' : ''}>8/6/3</option></select></label>
            ${isWendler ? `<div class="season-wendler-goal"><div class="season-wendler-summary"><span>1RM <b>${_esc(wendler.oneRmKg)}kg</b></span><span>TM <b>${_esc(tmKg)}kg</b></span></div><button type="button" class="season-wendler-open" data-season-action="open-wendler" data-exercise-id="${_esc(id)}">목표 설정</button></div>` : ''}
            ${isStair ? `<div class="season-track-grid">${[['volume', '볼륨 트랙'], ['intensity', '강도 트랙']].map(([track, label]) => {
              const draft = config.tracks?.[track] || _emptyTrackDraft();
              return `<section class="season-track-row${_normalTrackReady(draft) ? ' is-ready' : ''}"><strong>${label}</strong><label><span>기준중량</span><span class="season-input-unit"><input type="number" inputmode="decimal" min="0" step="0.25" data-season-normal-track="${track}" data-season-normal-field="kg" value="${_esc(draft.kg)}" placeholder="미설정"><b>kg</b></span></label><label><span>기준세트</span><span class="season-input-unit"><input type="number" inputmode="numeric" min="1" max="20" step="1" data-season-normal-track="${track}" data-season-normal-field="sets" value="${_esc(draft.sets)}" placeholder="미설정"><b>세트</b></span></label><label><span>3주 증량</span><select data-season-normal-track="${track}" data-season-normal-field="incrementKg"><option value="">미설정</option>${SEASON_NORMAL_INCREMENTS_KG.map(increment => `<option value="${increment}" ${Number(draft.incrementKg) === increment ? 'selected' : ''}>+${increment}kg</option>`).join('')}</select></label></section>`;
            }).join('')}</div>` : ''}
          </div>
        </section>`;
      }).join('')}</div>
    </section>`;
}

function _selectionReviewStep() {
  const selected = _state.exerciseSetup.configurations
    .filter(configuration => _state.selectedExerciseIds.has(configuration.exerciseId));
  const grouped = GROUP_ORDER.map(groupId => ({
    groupId,
    items: selected.filter(configuration => configuration.groupId === groupId),
  })).filter(group => group.items.length);
  const wendlerCount = selected.filter(configuration => _state.overrides[configuration.exerciseId]?.program === 'wendler').length;
  const trackCount = selected.reduce((sum, configuration) => (
    sum + _goalTrackIds(_state.overrides[configuration.exerciseId]).length
  ), 0);
  return `
    <div class="season-step-copy season-review-heading"><strong>선택한 운동과 목표를 확인해 주세요</strong><p>결제 전 주문서를 확인하듯, 빠진 종목이나 잘못 입력한 목표가 없는지 마지막으로 점검합니다.</p></div>
    <div class="season-review-summary">
      <span><small>선택 종목</small><b>${selected.length}개</b></span>
      <span><small>목표 트랙</small><b>${trackCount}개</b></span>
      <span><small>8/6/3</small><b>${wendlerCount}개</b></span>
      <button type="button" data-season-action="go-to-step" data-season-step="1">수정</button>
    </div>
    ${selected.length ? `<div class="season-review-groups">${grouped.map(group => `
      <section>
        <header><strong>${_esc(GROUP_LABELS[group.groupId] || group.groupId)}</strong><span>${group.items.length}종목</span></header>
        ${group.items.map(configuration => {
          const config = _state.overrides[configuration.exerciseId];
          const tracks = _goalTrackIds(config);
          const detail = config.program === 'wendler'
            ? `8/6/3 · 1RM ${_esc(config.wendler?.oneRmKg || 0)}kg · 3주 +${_esc(config.wendler?.threeWeekIncrementKg || _wendlerThreeWeekIncrement(config.wendler))}kg`
            : tracks.map(track => {
              const goal = config.tracks[track];
              return `${track === 'volume' ? '볼륨' : '강도'} ${goal.kg}kg · ${goal.sets}세트 · +${goal.incrementKg}kg`;
            }).join(' / ');
          const id = configuration.exerciseId;
          return `<div class="season-review-item" data-season-exercise-card="${_esc(id)}">
            <span><b>${_esc(configuration.label)}</b><small>${_esc(detail)}</small></span>
            <i>확인</i>
            <div class="season-review-window">
              <span class="season-review-window-label">종목 기간</span>
              <label><input type="date" data-season-exercise-window="start" min="${_esc(_state.season.startDate)}" max="${_esc(_state.season.endDate)}" value="${_esc(_exerciseWindowValue(id, 'startDate'))}"></label>
              <label><input type="date" data-season-exercise-window="end" min="${_esc(_state.season.startDate)}" max="${_esc(_state.season.endDate)}" value="${_esc(_exerciseWindowValue(id, 'endDate'))}"></label>
              <small class="season-window-hint">${_esc(_exerciseWindowHint(id))}</small>
            </div>
          </div>`;
        }).join('')}
      </section>`).join('')}</div>` : '<div class="season-review-empty">설정된 운동 목표가 없습니다. 이전 단계에서 한 종목 이상 목표를 설정해 주세요.</div>'}`;
}

function _wendlerEditorHtml() {
  const editor = _state.wendlerEditor;
  if (!editor) return '';
  const configuration = _configurationFor(editor.exerciseId);
  if (!configuration) return '';
  const draft = editor.draft;
  return `<div class="season-wendler-editor-backdrop">
    <section class="season-wendler-editor" role="dialog" aria-modal="true" aria-labelledby="season-wendler-title">
      <header><div><span>8/6/3 ORIGINAL</span><h3 id="season-wendler-title">웬들러 목표 설정</h3></div><button type="button" data-season-action="wendler-cancel" aria-label="닫기">×</button></header>
      <div class="season-wendler-editor-body">
        <div class="season-wendler-exercise"><span>기록 종목</span><strong>${_esc(configuration.label)}</strong><small>ID · ${_esc(configuration.exerciseId)}</small></div>
        <label class="season-field"><span>리프트 프로필</span><select data-season-wendler-draft="profileId">${Object.values(W863_ORIGINAL_PROFILES).map(profile => `<option value="${profile.id}" ${profile.id === draft.profileId ? 'selected' : ''}>${_esc(profile.label)}</option>`).join('')}</select></label>
        <section class="season-ten-rm-box"><div><strong>10RM 자동 환산</strong><small>10회 수행 가능한 중량을 입력하면 Epley 공식으로 1RM과 TM(90%)을 계산합니다.</small></div><label><span>10RM</span><span class="season-input-unit"><input type="number" inputmode="decimal" min="0" step="0.5" data-season-wendler-draft="tenRmKg" value="${draft.tenRmKg || ''}" placeholder="예: 50"><b>kg</b></span></label></section>
        <div class="season-wendler-calc" aria-live="polite"><span>추정 1RM<strong data-season-wendler-calc-one-rm>${_esc(draft.oneRmKg)}kg</strong></span><i>→</i><span>시작 TM<strong data-season-wendler-calc-tm>${_esc(draft.tmKg)}kg</strong></span></div>
        <div class="season-wendler-editor-grid">
          <label class="season-field"><span>1RM 직접 조정</span><input type="number" inputmode="decimal" min="1" step="0.1" data-season-wendler-draft="oneRmKg" value="${draft.oneRmKg}"></label>
          <label class="season-field"><span>3주 증량</span><select data-season-wendler-draft="threeWeekIncrementKg">${SEASON_NORMAL_INCREMENTS_KG.map(increment => `<option value="${increment}" ${Number(draft.threeWeekIncrementKg) === increment ? 'selected' : ''}>+${increment}kg</option>`).join('')}</select></label>
        </div>
        <p class="season-wendler-note">1.25kg 원판 단위로 처방하며, 선택한 3주 증량을 두 번 적용한 값이 7주 사이클 정산 증량으로 환산됩니다.</p>
      </div>
      <footer><button type="button" class="season-secondary" data-season-action="wendler-cancel">취소</button><button type="button" class="season-primary" data-season-action="wendler-apply">이 목표 적용</button></footer>
    </section>
  </div>`;
}

function _runningStep() {
  const plan = _state.runningPlan;
  const activeGoal = RUNNING_GOALS[plan.goalType] || RUNNING_GOALS.base;
  const raceGoal = plan.goalType !== 'base';
  return `
    <div class="season-step-copy"><strong>6–7주 러닝 목표 블록</strong><p>러닝의 중심 목표를 km당 페이스로 설정합니다. 직접 목표 페이스를 정하거나, 직전 주보다 안전한 범위에서 점진적으로 개선하는 프로그램을 선택할 수 있어요.</p></div>
    <div class="season-running-presets" aria-label="러닝 목표 유형">
      ${Object.entries(RUNNING_GOALS).map(([id, goal]) => `<button type="button" class="${id === plan.goalType ? 'is-active' : ''}" data-season-action="running-preset" data-running-goal="${id}"><b>${goal.label}</b><small>${id === 'base' ? '거리 기반' : `${goal.distanceKm}km`}</small></button>`).join('')}
    </div>
    ${raceGoal ? `<section class="season-race-goal">
      <div class="season-race-head"><span>RACE GOAL</span><strong>${_esc(activeGoal.label)}</strong><small>${_state.season.endDate}까지 준비하는 시즌 블록</small></div>
      <div class="season-field-row">
        <label class="season-field"><span>대회명 · 선택</span><input data-season-running="eventName" value="${_esc(plan.eventName || '')}" placeholder="예: 서울 10K"></label>
        <label class="season-field"><span>대회일</span><input type="date" data-season-running="targetDate" value="${_esc(plan.targetDate || _state.season.endDate)}"></label>
      </div>
      <div class="season-goal-toggle" role="group" aria-label="완주 또는 기록 목표">
        <button type="button" class="${plan.completionGoal !== 'time' ? 'is-active' : ''}" data-season-action="running-completion" data-running-completion="finish">완주 목표</button>
        <button type="button" class="${plan.completionGoal === 'time' ? 'is-active' : ''}" data-season-action="running-completion" data-running-completion="time">기록 목표</button>
      </div>
      ${plan.completionGoal === 'time' ? `<div class="season-race-time-row"><div class="season-duration-block"><span>목표 기록</span><div class="season-duration-inputs"><label><input type="number" inputmode="numeric" min="0" max="23" data-season-running-duration-field="hours" value="${Number(plan.targetTimeMin) > 0 ? Math.floor(Number(plan.targetTimeMin) / 60) : ''}" placeholder="0"><b>시간</b></label><label><input type="number" inputmode="numeric" min="0" max="59" data-season-running-duration-field="minutes" value="${Number(plan.targetTimeMin) > 0 ? Math.round(Number(plan.targetTimeMin) % 60) : ''}" placeholder="00"><b>분</b></label></div></div><div class="season-pace-output"><span>목표 페이스</span><strong data-season-running-pace>${_esc(_goalPaceText(plan))}</strong></div></div>` : `<div class="season-race-finish-note">기록 압박 없이 ${_esc(activeGoal.label)} 완주를 시즌 목표로 설정합니다.</div>`}
    </section>` : '<div class="season-running-base-note"><b>기초 거리 만들기</b><span>대회일 없이 주간 거리·롱런·빈도를 6–7주 동안 안정적으로 쌓습니다.</span></div>'}
    <section class="season-pace-goal">
      <header><strong>1km당 목표 페이스</strong><span>이번 시즌의 러닝 기준</span></header>
      <div class="season-goal-toggle" role="group" aria-label="러닝 페이스 목표 방식">
        <button type="button" class="${plan.paceGoalMode !== 'adaptive' ? 'is-active' : ''}" data-season-action="running-pace-mode" data-running-pace-mode="fixed">목표 페이스 직접 설정</button>
        <button type="button" class="${plan.paceGoalMode === 'adaptive' ? 'is-active' : ''}" data-season-action="running-pace-mode" data-running-pace-mode="adaptive">점진적 개선 프로그램</button>
      </div>
      ${plan.paceGoalMode === 'adaptive'
        ? `<div class="season-adaptive-pace"><label class="season-field"><span>직전 주 대비 개선률</span><span class="season-input-unit"><input type="number" min="0.5" max="10" step="0.5" data-season-running="adaptiveRatePct" value="${Number(plan.adaptiveRatePct) || 2}"><b>%/주</b></span></label><p>주간 훈련량은 급격히 늘리지 않고, 최근 기록을 기준으로 목표 페이스를 최대 10% 이내에서 서서히 낮춥니다.</p></div>`
        : `<div class="season-pace-input-row"><label class="season-field"><span>목표 분/km</span><span class="season-input-unit"><input type="number" min="3" max="20" data-season-running-pace-field="minutes" value="${Number(plan.targetPaceSecPerKm) > 0 ? Math.floor(Number(plan.targetPaceSecPerKm) / 60) : ''}" placeholder="예: 6"><b>분</b></span></label><label class="season-field"><span>초</span><span class="season-input-unit"><input type="number" min="0" max="59" data-season-running-pace-field="seconds" value="${Number(plan.targetPaceSecPerKm) > 0 ? Number(plan.targetPaceSecPerKm) % 60 : ''}" placeholder="예: 30"><b>초/km</b></span></label></div>`}
      <p class="season-pace-preview">현재 설정: <strong data-season-running-pace>${_esc(_goalPaceText(plan))}</strong></p>
    </section>
    <section class="season-running-metrics">
      <header><strong>훈련 메트릭</strong><span>현재 → 시즌 목표</span></header>
      <div class="season-field-row season-field-row-4">
        <label class="season-field"><span>현재 km/주</span><input type="number" min="0" step="0.5" data-season-running="baselineWeeklyDistanceKm" value="${plan.baselineWeeklyDistanceKm ?? ''}"></label>
        <label class="season-field"><span>목표 km/주</span><input type="number" min="1" step="0.5" data-season-running="weeklyDistanceKm" value="${plan.weeklyDistanceKm}"></label>
        <label class="season-field"><span>러닝 횟수/주</span><input type="number" min="1" max="7" data-season-running="weeklySessions" value="${plan.weeklySessions}"></label>
        <label class="season-field"><span>최장 거리</span><input type="number" min="1" step="0.5" data-season-running="longestRunKm" value="${plan.longestRunKm || ''}"></label>
        <label class="season-field"><span>스피드런/주</span><input type="number" min="0" max="3" data-season-running="speedSessionsPerWeek" value="${plan.speedSessionsPerWeek ?? 1}"></label>
        <label class="season-field"><span>러닝 시간/주</span><input type="number" min="0" step="5" data-season-running="optionalDurationMin" value="${plan.optionalDurationMin || ''}"></label>
        <label class="season-field"><span>헬스 횟수/주</span><input type="number" min="1" max="14" data-season-plan="weeklySessionTarget" value="${_state.weeklySessionTarget}"></label>
      </div>
      <p>롱런 1회와 스피드런 ${Number(plan.speedSessionsPerWeek) || 0}회를 기준으로, 나머지는 회복·이지런으로 구성하세요.</p>
    </section>`;
}

function _previewStep() {
  const selected = [..._state.selectedExerciseIds];
  const preview = seasonResetPreview(_state.board, selected, {
    registeredExercises: _state.exercises,
    benchmarkMappings: _state.benchmarkMappings,
    overrides: _state.overrides,
  });
  const current = findSeasonForDate(_state.registry, addSeasonDays(_state.season.startDate, -1));
  return `
    <div class="season-step-copy"><strong>${_state.editingSeasonId ? '수정 내용 최종 확인' : '시즌 시작 최종 확인'}</strong><p>저장 후 원본 운동 기록과 사진·러닝 경로는 바뀌지 않습니다.</p></div>
    <div class="season-impact-grid">
      <section><span>목표</span><strong>${selected.length}개 종목</strong><small>입력하지 않은 종목은 목표 없이 등록 목록에 유지</small></section>
      <section><span>재시작</span><strong>W1 ${preview.wendlerCount}개</strong><small>8/6/3 원본 · 과거 웬들러 로그 제외</small></section>
      <section><span>새 목표</span><strong>트랙 ${preview.trackCount}개</strong><small>헬스 ${_state.weeklySessionTarget}회 · 러닝 ${_state.runningPlan.weeklyDistanceKm}km</small></section>
      <section><span>러닝</span><strong>${_esc(RUNNING_GOALS[_state.runningPlan.goalType]?.label || '기초 거리')}</strong><small>${_state.runningPlan.completionGoal === 'time' ? _esc(_goalPaceText(_state.runningPlan)) : `롱런 ${_state.runningPlan.longestRunKm || '-'}km · 주 ${_state.runningPlan.weeklySessions}회`}</small></section>
      <section><span>시즌</span><strong>${_esc(_state.season.name)}</strong><small>${_state.season.startDate}–${_state.season.endDate}${current ? ` · ${_esc(current.name)} 다음` : ''}</small></section>
    </div>
    <div class="season-final-note">시즌 시작 후 달력·통계·APK 위젯은 이 시즌 범위만 기본값으로 사용합니다.</div>`;
}

function _stepBody() {
  return [_periodStep, _exerciseStep, _selectionReviewStep, _runningStep, _previewStep][_state.step]();
}

// ── 시즌 관리(이미 만들어진 시즌) ────────────────────────────────
// 진입하자마자 구성이 다 보이고, 고치고 싶은 줄만 펼쳐서 그 자리에서 바꾼다.
function _manageGoalSummary(exerciseId) {
  const config = _state.overrides[exerciseId] || {};
  if (config.program === 'wendler') {
    return `8/6/3 · 1RM ${config.wendler?.oneRmKg || 0}kg`;
  }
  const tracks = _goalTrackIds(config);
  if (!tracks.length) return '목표 없음';
  return tracks.map(track => {
    const goal = config.tracks[track];
    return `${track === 'volume' ? '볼륨' : '강도'} ${goal.kg}kg·${goal.sets}세트`;
  }).join(' / ');
}

function _manageBody() {
  const selected = _state.exerciseSetup.configurations
    .filter(configuration => _state.selectedExerciseIds.has(configuration.exerciseId));
  const seasonDays = _inclusiveSeasonDays(_state.season);
  const rows = selected.map((configuration) => {
    const id = configuration.exerciseId;
    const open = _state.manageOpenExerciseId === id;
    const hasWindow = !!_state.exerciseWindows?.[id];
    return `<div class="season-manage-row${open ? ' is-open' : ''}" data-season-exercise-card="${_esc(id)}">
      <button type="button" class="season-manage-row-head" data-season-action="toggle-manage-row" data-exercise-id="${_esc(id)}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="season-manage-row-copy">
          <b>${_esc(configuration.label)}</b>
          <small>${_esc(_manageGoalSummary(id))}</small>
        </span>
        <span class="season-manage-row-period${hasWindow ? ' is-custom' : ''}">${_esc(hasWindow ? _exerciseWindowHint(id) : '시즌 전체')}</span>
      </button>
      ${open ? `<div class="season-manage-row-body">
        <div class="season-manage-window">
          <span class="season-window-title">종목 기간</span>
          <label class="season-compact-field"><span>시작</span><input type="date" data-season-exercise-window="start" min="${_esc(_state.season.startDate)}" max="${_esc(_state.season.endDate)}" value="${_esc(_exerciseWindowValue(id, 'startDate'))}"></label>
          <label class="season-compact-field"><span>종료</span><input type="date" data-season-exercise-window="end" min="${_esc(_state.season.startDate)}" max="${_esc(_state.season.endDate)}" value="${_esc(_exerciseWindowValue(id, 'endDate'))}"></label>
          <small class="season-window-hint">${_esc(_exerciseWindowHint(id))}</small>
        </div>
        <div class="season-manage-row-actions">
          ${hasWindow ? `<button type="button" data-season-action="clear-exercise-window" data-exercise-id="${_esc(id)}">시즌 전체로</button>` : ''}
          <button type="button" data-season-action="edit-exercise-goal" data-exercise-id="${_esc(id)}">목표 수정</button>
          <button type="button" class="is-danger" data-season-action="remove-exercise" data-exercise-id="${_esc(id)}">시즌에서 빼기</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="season-manage">
      <section class="season-manage-block">
        <header><strong>시즌 기간</strong><button type="button" data-season-action="go-to-wizard" data-season-step="0">수정</button></header>
        <div class="season-manage-period">
          <b>${_esc(_state.season.name || '이름 없는 시즌')}</b>
          <small>${_esc(_state.season.startDate)} ~ ${_esc(_state.season.endDate)} · ${seasonDays}일</small>
        </div>
      </section>

      <section class="season-manage-block">
        <header><strong>운동 종목 ${selected.length}개</strong><button type="button" data-season-action="go-to-wizard" data-season-step="1">종목 추가</button></header>
        ${selected.length ? `<div class="season-manage-rows">${rows}</div>` : '<div class="season-review-empty">이 시즌에 설정된 종목이 없습니다. “종목 추가”로 시작해 주세요.</div>'}
      </section>

      <section class="season-manage-block">
        <header><strong>러닝 목표</strong><button type="button" data-season-action="go-to-wizard" data-season-step="3">수정</button></header>
        <div class="season-manage-period">
          <small>주 ${_esc(_state.runningPlan?.weeklyDistanceKm || 0)}km · ${_esc(_state.runningPlan?.weeklySessions || 0)}회 · 헬스 주 ${_esc(_state.weeklySessionTarget || 0)}회</small>
        </div>
      </section>

      <button type="button" class="season-manage-full" data-season-action="go-to-wizard" data-season-step="0">전체 설정 다시 보기</button>
    </div>`;
}

function _render() {
  _refreshSelectedExerciseIds();
  const modal = _modal();
  const sheet = modal.querySelector('.workout-season-sheet');
  const isManage = _state.mode === 'manage';
  const isFinal = _state.step === STEP_LABELS.length - 1;
  const title = isManage ? '시즌 관리' : _state.editingSeasonId ? '시즌 설정 수정' : '새 시즌 시작';
  sheet.innerHTML = `
    <header class="season-sheet-head"><div><span>WORKOUT SEASON</span><h2 id="workout-season-title">${title}</h2></div><button type="button" data-season-action="close" aria-label="닫기">×</button></header>
    ${isManage ? '' : _stepper()}
    <div class="season-sheet-body">${isManage ? _manageBody() : _stepBody()}</div>
    <footer class="season-sheet-actions">
      ${isManage
        ? `<button type="button" class="season-secondary" data-season-action="close">닫기</button>
           <button type="button" class="season-primary" data-season-action="save" ${_state.saving ? 'disabled' : ''}>${_state.saving ? '저장 중…' : '변경 사항 저장'}</button>`
        : `<button type="button" class="season-secondary" data-season-action="${_state.step ? 'back' : (_state.editingSeasonId ? 'back-to-manage' : 'close')}">${_state.step ? '이전' : (_state.editingSeasonId ? '관리로' : '취소')}</button>
           <button type="button" class="season-primary" data-season-action="${isFinal ? 'save' : 'next'}" ${_state.saving ? 'disabled' : ''}>${_state.saving ? '저장 중…' : isFinal ? (_state.editingSeasonId ? '수정 내용 저장' : '이 설정으로 시즌 시작') : '다음'}</button>`}
    </footer>
    ${_wendlerEditorHtml()}`;
}

function _openWendlerEditor(exerciseId, previousProgram = null) {
  const configuration = _configurationFor(exerciseId);
  if (!configuration) return false;
  const override = _state.overrides[exerciseId] || {};
  const fromProgram = previousProgram || override.program || configuration.program || 'stair';
  override.program = 'wendler';
  _state.overrides[exerciseId] = override;
  _state.wendlerEditor = {
    exerciseId,
    previousProgram: fromProgram,
    draft: _wendlerDraft(configuration),
  };
  return true;
}

function _cancelWendlerEditor() {
  const editor = _state?.wendlerEditor;
  if (!editor) return;
  if (editor.previousProgram !== 'wendler') {
    _state.overrides[editor.exerciseId].program = editor.previousProgram || 'none';
  }
  _state.wendlerEditor = null;
}

function _applyWendlerEditor() {
  const editor = _state?.wendlerEditor;
  if (!editor) return false;
  const draft = editor.draft;
  if (!(Number(draft.oneRmKg) > 0)) {
    showToast('1RM 또는 10RM 중량을 입력해 주세요.', 2200, 'error');
    return false;
  }
  const wendler = {
    ..._state.overrides[editor.exerciseId].wendler,
    profileId: draft.profileId,
    oneRmKg: Math.round(Number(draft.oneRmKg) * 10) / 10,
    tmKg: Number(draft.tmKg),
    threeWeekIncrementKg: Number(draft.threeWeekIncrementKg),
    incrementKg: Number(draft.threeWeekIncrementKg) * WENDLER_THREE_WEEK_BLOCKS_PER_CYCLE,
    roundKg: WENDLER_PLATE_STEP_KG,
  };
  if (Number(draft.tenRmKg) > 0) wendler.tenRmKg = Number(draft.tenRmKg);
  else delete wendler.tenRmKg;
  _state.overrides[editor.exerciseId] = {
    ..._state.overrides[editor.exerciseId],
    program: 'wendler',
    wendler,
  };
  _refreshSelectedExerciseIds();
  _state.wendlerEditor = null;
  return true;
}

function _syncNormalTrackCardState(exerciseId, track, card) {
  const config = _state?.overrides?.[exerciseId];
  if (!config || !card) return;
  const goalTracks = _goalTrackIds(config);
  const selected = goalTracks.length > 0;
  const hasPartialGoal = ['volume', 'intensity'].some(trackId => {
    const draft = config.tracks?.[trackId] || {};
    return draft.kg !== '' || draft.sets !== '' || draft.incrementKg !== '';
  });
  card.classList.toggle('has-goal', selected);
  const trackRow = [...card.querySelectorAll('.season-track-row')].find(row => (
    row.querySelector('[data-season-normal-track]')?.getAttribute('data-season-normal-track') === track
  ));
  trackRow?.classList.toggle('is-ready', _normalTrackReady(config.tracks?.[track]));
  const badge = card.querySelector(':scope > header em');
  if (badge) {
    badge.classList.remove('is-wendler', 'is-goal');
    if (selected) badge.classList.add('is-goal');
    badge.textContent = selected ? `${goalTracks.length}트랙 목표` : hasPartialGoal ? '입력 중' : '미설정';
  }
  const configuration = _configurationFor(exerciseId);
  const groupId = configuration?.groupId;
  const groupItems = _state.exerciseSetup?.configurations?.filter(item => item.groupId === groupId) || [];
  const groupSelectedCount = groupItems.filter(item => _state.selectedExerciseIds.has(item.exerciseId)).length;
  const groupTab = [...card.closest('.season-sheet-body')?.querySelectorAll('[data-season-group]') || []]
    .find(tab => tab.getAttribute('data-season-group') === groupId);
  const groupCount = groupTab?.querySelector('small');
  if (groupCount) groupCount.textContent = `${groupSelectedCount}/${groupItems.length}`;
}

function _handleInput(event) {
  if (!_state) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const seasonField = target.getAttribute('data-season-field');
  if (seasonField) {
    _state.season[seasonField] = target.value;
    if (seasonField === 'startDate' && !_state.season.name.trim()) _state.season.name = _seasonName(target.value);
    return;
  }
  const mapBenchmarkId = target.getAttribute('data-season-wendler-map');
  if (mapBenchmarkId) {
    if (target.value) _state.benchmarkMappings[mapBenchmarkId] = target.value;
    else delete _state.benchmarkMappings[mapBenchmarkId];
    _syncExerciseSetup(_state);
    _render();
    return;
  }
  const exerciseRoot = target.closest('[data-season-exercise-card]');
  const configuredExerciseId = exerciseRoot?.getAttribute('data-season-exercise-card');
  const programField = target.getAttribute('data-season-program');
  if (configuredExerciseId && programField) {
    if (event.type !== 'change') return;
    const previousProgram = _state.overrides[configuredExerciseId].program || 'stair';
    if (target.value === 'wendler') {
      _openWendlerEditor(configuredExerciseId, previousProgram);
    } else if (target.value === 'none') {
      _state.overrides[configuredExerciseId].program = 'none';
      _state.wendlerEditor = null;
    } else {
      const override = _state.overrides[configuredExerciseId];
      override.program = 'stair';
      override.progressionWeeks = SEASON_NORMAL_PROGRESSION_WEEKS;
      _state.wendlerEditor = null;
    }
    _render();
    return;
  }
  const wendlerDraftField = target.getAttribute('data-season-wendler-draft');
  if (wendlerDraftField && _state.wendlerEditor) {
    const draft = _state.wendlerEditor.draft;
    draft[wendlerDraftField] = wendlerDraftField === 'profileId' ? target.value : Number(target.value);
    if (wendlerDraftField === 'tenRmKg' && Number(target.value) > 0) {
      const calculated = calculateSeasonWendlerFromTenRm(target.value, draft.roundKg);
      draft.oneRmKg = calculated.estimatedOneRmKg;
      draft.tmKg = calculated.tmKg;
      const oneRmInput = target.closest('.season-wendler-editor')?.querySelector('[data-season-wendler-draft="oneRmKg"]');
      if (oneRmInput) oneRmInput.value = String(draft.oneRmKg);
    } else if (wendlerDraftField === 'oneRmKg' || wendlerDraftField === 'roundKg') {
      draft.tmKg = roundToPlate(Number(draft.oneRmKg) * 0.9, Number(draft.roundKg) || 2.5);
    }
    const editorRoot = target.closest('.season-wendler-editor');
    const oneRmOutput = editorRoot?.querySelector('[data-season-wendler-calc-one-rm]');
    const tmOutput = editorRoot?.querySelector('[data-season-wendler-calc-tm]');
    if (oneRmOutput) oneRmOutput.textContent = `${Number(draft.oneRmKg) || 0}kg`;
    if (tmOutput) tmOutput.textContent = `${Number(draft.tmKg) || 0}kg`;
    return;
  }
  const windowEdge = target.getAttribute('data-season-exercise-window');
  if (configuredExerciseId && windowEdge) {
    _setExerciseWindow(configuredExerciseId, windowEdge === 'start' ? 'startDate' : 'endDate', target.value);
    const hint = exerciseRoot?.querySelector('.season-window-hint');
    if (hint) hint.textContent = _exerciseWindowHint(configuredExerciseId);
    return;
  }
  const normalTrack = target.getAttribute('data-season-normal-track');
  const normalField = target.getAttribute('data-season-normal-field');
  if (configuredExerciseId && normalTrack && normalField) {
    _state.overrides[configuredExerciseId].tracks[normalTrack][normalField] = target.value;
    _refreshSelectedExerciseIds();
    _syncNormalTrackCardState(configuredExerciseId, normalTrack, exerciseRoot);
    return;
  }
  const planField = target.getAttribute('data-season-plan');
  if (planField) _state[planField] = Number(target.value);
  const runningField = target.getAttribute('data-season-running');
  if (runningField) {
    const stringFields = new Set(['eventName', 'targetDate']);
    _state.runningPlan[runningField] = stringFields.has(runningField)
      ? target.value
      : (target.value === '' ? null : Number(target.value));
    if (runningField === 'adaptiveRatePct') {
      const preview = target.closest('.season-pace-goal')?.querySelector('[data-season-running-pace]');
      if (preview) preview.textContent = _goalPaceText(_state.runningPlan);
    }
  }
  if (target.hasAttribute('data-season-running-duration-field')) {
    const durationRoot = target.closest('.season-duration-inputs');
    const hours = Number(durationRoot?.querySelector('[data-season-running-duration-field="hours"]')?.value) || 0;
    const minutes = Number(durationRoot?.querySelector('[data-season-running-duration-field="minutes"]')?.value) || 0;
    const duration = (Math.max(0, Math.min(23, hours)) * 60) + Math.max(0, Math.min(59, minutes));
    _state.runningPlan.targetTimeMin = duration > 0 ? duration : null;
    const pace = target.closest('.season-race-time-row')?.querySelector('[data-season-running-pace]');
    if (pace) pace.textContent = _goalPaceText(_state.runningPlan);
  }
  if (target.hasAttribute('data-season-running-pace-field')) {
    const paceRoot = target.closest('.season-pace-input-row');
    const minutes = Number(paceRoot?.querySelector('[data-season-running-pace-field="minutes"]')?.value) || 0;
    const seconds = Number(paceRoot?.querySelector('[data-season-running-pace-field="seconds"]')?.value) || 0;
    const paceSeconds = (Math.max(0, Math.min(20, minutes)) * 60) + Math.max(0, Math.min(59, seconds));
    _state.runningPlan.targetPaceSecPerKm = paceSeconds > 0 ? paceSeconds : null;
    const preview = target.closest('.season-pace-goal')?.querySelector('[data-season-running-pace]');
    if (preview) preview.textContent = _goalPaceText(_state.runningPlan);
  }
}

function _validateStep(step) {
  if (step === 0) {
    if (!_state.season.name.trim()) return '시즌 이름을 입력해 주세요.';
    if (_inclusiveSeasonDays(_state.season) < 7) return '시즌 기간은 최소 1주 이상이어야 합니다.';
    if (_state.editingSeasonId && _state.season.endDate < _todayKey()) return '현재 시즌 종료일은 오늘 이전으로 바꿀 수 없습니다.';
  }
  if (step === 2) {
    if (!_state.selectedExerciseIds.size) return '목표를 설정한 운동을 한 종목 이상 선택해 주세요.';
    const previewSeason = {
      ..._state.season,
      id: _state.editingSeasonId || 'preview-season',
      exerciseIds: [..._state.selectedExerciseIds],
    };
    const result = validateSeasonRegistry({
      ..._state.registry,
      seasons: _state.editingSeasonId
        ? _state.registry.seasons.map(season => season.id === _state.editingSeasonId ? previewSeason : season)
        : [..._state.registry.seasons, previewSeason],
    });
    if (!result.valid) return result.errors.some(error => error.includes('overlap'))
      ? '선택한 종목이 기존 시즌과 겹칩니다. 다른 종목을 선택하면 같은 기간에도 시즌을 병행할 수 있어요.'
      : '시즌 기간과 종목을 확인해 주세요.';
  }
  if (step === 3) {
    const plan = _state.runningPlan;
    if (!(Number(plan.weeklyDistanceKm) > 0) || !(Number(plan.weeklySessions) > 0)) return '러닝 거리와 횟수 목표를 확인해 주세요.';
    if (plan.completionGoal === 'time' && !(Number(plan.targetTimeMin) > 0)) return '목표 기록을 입력해 주세요.';
    if (plan.paceGoalMode === 'adaptive' && (!(Number(plan.adaptiveRatePct) >= 0.5) || Number(plan.adaptiveRatePct) > 10)) return '점진적 개선률은 0.5–10% 범위로 입력해 주세요.';
    if (plan.paceGoalMode !== 'adaptive' && (!(Number(plan.targetPaceSecPerKm) >= 180) || Number(plan.targetPaceSecPerKm) > 1200)) return 'km당 목표 페이스를 분·초로 입력해 주세요.';
  }
  return null;
}

function _validateCurrentStep() {
  return _validateStep(_state.step);
}

// 관리 시트는 단계를 걷지 않으므로 저장 시 모든 관문을 한 번에 확인한다.
function _validateAllSteps() {
  for (const step of [0, 2, 3]) {
    const error = _validateStep(step);
    if (error) return error;
  }
  return null;
}

async function _save() {
  if (_state.saving) return;
  const error = _state.mode === 'manage' ? _validateAllSteps() : _validateCurrentStep();
  if (error) return showToast(error, 2400, 'error');
  _state.saving = true;
  _render();
  try {
    const input = {
      season: _state.editingSeasonId
        ? { ..._state.season, id: _state.editingSeasonId, exerciseIds: [..._state.selectedExerciseIds], exerciseWindows: _collectExerciseWindows() }
        : { ..._state.season, exerciseIds: [..._state.selectedExerciseIds], exerciseWindows: _collectExerciseWindows() },
      clientRequestId: _state.clientRequestId,
      selectedExerciseIds: [..._state.selectedExerciseIds],
      registeredExerciseIds: _state.exercises.map(exercise => String(exercise.id)),
      registeredExercises: _state.exercises,
      benchmarkMappings: _state.benchmarkMappings,
      overrides: _state.overrides,
      weeklySessionTarget: _state.weeklySessionTarget,
      runningPlan: _state.runningPlan,
      todayKey: _todayKey(),
    };
    const wasEditing = !!_state.editingSeasonId;
    const result = wasEditing
      ? await updateWorkoutSeason(input)
      : await createWorkoutSeason(input);
    closeWorkoutSeasonWizard();
    showToast(wasEditing
      ? `${result.season.name} 설정을 수정했어요.`
      : (result.duplicate ? '이미 생성된 시즌을 불러왔어요.' : `${result.season.name}을 시작했어요.`), 2600, 'success');
    document.dispatchEvent(new CustomEvent('season:changed', { detail: { seasonId: result.season.id } }));
  } catch (error) {
    console.warn('[season] save failed:', error);
    _state.saving = false;
    _render();
    showToast(error?.message?.includes('overlap') ? '같은 운동 종목의 시즌 기간이 겹칩니다. 다른 종목은 같은 기간에 병행할 수 있어요.' : '시즌 저장에 실패했어요.', 3200, 'error');
  }
}

async function _handleClick(event) {
  event.stopPropagation();
  const button = event.target.closest?.('[data-season-action]');
  if (!button || !_state) return;
  const action = button.getAttribute('data-season-action');
  if (action === 'season-length') {
    const weeks = Number(button.getAttribute('data-season-weeks'));
    if ([6, 7].includes(weeks)) {
      const previousEndDate = _state.season.endDate;
      _state.season.endDate = addSeasonDays(_state.season.startDate, (weeks * 7) - 1);
      if (!_state.runningPlan.targetDate || _state.runningPlan.targetDate === previousEndDate) {
        _state.runningPlan.targetDate = _state.season.endDate;
      }
      return _render();
    }
  }
  if (action === 'go-to-step') {
    _state.step = Math.max(0, Math.min(STEP_LABELS.length - 1, Number(button.getAttribute('data-season-step')) || 0));
    return _render();
  }
  // ── 시즌 관리 시트 ──────────────────────────────────────────────
  if (action === 'toggle-manage-row') {
    const exerciseId = button.getAttribute('data-exercise-id');
    _state.manageOpenExerciseId = _state.manageOpenExerciseId === exerciseId ? null : exerciseId;
    return _render();
  }
  if (action === 'clear-exercise-window') {
    const exerciseId = button.getAttribute('data-exercise-id');
    if (_state.exerciseWindows) delete _state.exerciseWindows[exerciseId];
    return _render();
  }
  if (action === 'edit-exercise-goal') {
    // 같은 _state를 그대로 들고 위저드 종목 단계로 넘어간다. 입력한 값이 유지된다.
    const exerciseId = button.getAttribute('data-exercise-id');
    const configuration = _configurationFor(exerciseId);
    if (configuration) _state.activeGroupId = configuration.groupId;
    _state.mode = 'wizard';
    _state.step = 1;
    return _render();
  }
  if (action === 'remove-exercise') {
    const exerciseId = button.getAttribute('data-exercise-id');
    const configuration = _configurationFor(exerciseId);
    const confirmed = await confirmAction({
      title: '시즌에서 빼기',
      message: `${configuration?.label || '이 종목'}의 시즌 목표를 지웁니다. 운동 기록은 지워지지 않습니다.`,
      confirmLabel: '빼기',
      destructive: true,
    });
    if (!confirmed) return;
    _state.overrides[exerciseId] = { program: 'none' };
    if (_state.exerciseWindows) delete _state.exerciseWindows[exerciseId];
    if (_state.manageOpenExerciseId === exerciseId) _state.manageOpenExerciseId = null;
    return _render();
  }
  if (action === 'go-to-wizard') {
    _state.mode = 'wizard';
    _state.step = Math.max(0, Math.min(STEP_LABELS.length - 1, Number(button.getAttribute('data-season-step')) || 0));
    return _render();
  }
  if (action === 'back-to-manage') {
    _state.mode = 'manage';
    return _render();
  }
  if (action === 'running-preset') {
    const goalType = button.getAttribute('data-running-goal');
    const preset = RUNNING_GOALS[goalType];
    if (preset) {
      _state.runningPlan = {
        ..._state.runningPlan,
        goalType,
        raceDistanceKm: preset.distanceKm,
        weeklyDistanceKm: preset.weeklyDistanceKm,
        weeklySessions: preset.weeklySessions,
        longestRunKm: preset.longestRunKm,
        targetDate: _state.runningPlan.targetDate || _state.season.endDate,
        targetTimeMin: null,
        completionGoal: 'finish',
      };
      return _render();
    }
  }
  if (action === 'running-completion') {
    _state.runningPlan.completionGoal = button.getAttribute('data-running-completion') === 'time' ? 'time' : 'finish';
    return _render();
  }
  if (action === 'running-pace-mode') {
    _state.runningPlan.paceGoalMode = button.getAttribute('data-running-pace-mode') === 'adaptive' ? 'adaptive' : 'fixed';
    return _render();
  }
  if (action === 'select-group') {
    _state.activeGroupId = button.getAttribute('data-season-group') || _state.activeGroupId;
    return _render();
  }
  if (action === 'open-wendler') {
    const exerciseId = button.getAttribute('data-exercise-id');
    if (exerciseId && _openWendlerEditor(exerciseId, 'wendler')) return _render();
    return;
  }
  if (action === 'wendler-cancel') {
    _cancelWendlerEditor();
    return _render();
  }
  if (action === 'wendler-apply') {
    if (_applyWendlerEditor()) _render();
    return;
  }
  if (action === 'close') return closeWorkoutSeasonWizard();
  if (action === 'back') {
    _state.step = Math.max(0, _state.step - 1);
    return _render();
  }
  if (action === 'next') {
    const error = _validateCurrentStep();
    if (error) return showToast(error, 2400, 'error');
    _state.step = Math.min(STEP_LABELS.length - 1, _state.step + 1);
    return _render();
  }
  if (action === 'save') void _save();
}

export function openWorkoutSeasonWizard(options = {}) {
  _state = _initialState(options.editingSeasonId || null);
  // 이미 만들어진 시즌은 5단계를 다시 걷게 하지 않는다. 한 화면에서 바로 고친다.
  _state.mode = options.mode || (_state.editingSeasonId ? 'manage' : 'wizard');
  const modal = _modal();
  modal.hidden = false;
  modal.classList.add('open');
  document.body.classList.add('wt-modal-scroll-lock');
  _render();
}

export function closeWorkoutSeasonWizard() {
  const modal = document.getElementById('workout-season-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.hidden = true;
  }
  document.body.classList.remove('wt-modal-scroll-lock');
  _state = null;
}
