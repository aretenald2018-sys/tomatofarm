import { escapeHtml as _esc } from '../../utils/escape-html.js';
import { showToast } from '../../ui/toast.js';
import { confirmAction } from '../../utils/confirm-modal.js';
// ================================================================
// workout/test-v2/board-render.js — 성장 보드 UI (보드 + 시트들)
// ----------------------------------------------------------------
// 계획: docs/ai/features/2026-06-12-test-mode-v2-board.md
//  - 메인 화면은 보드(표) 그 자체 (계약 1)
//  - 현재 주차 칸을 탭하면 기존 테스트모드 운동 카드로 바로 기록
//  - 색칠은 유저의 명시적 탭 (계약 4)
//  - 모든 버튼은 data-action + 루트 위임 (인라인 onclick 금지)
//  - 저장은 data.js saveTestBoardV2 단일 경로 (_settings.test_board_v2)
// 용어는 용어 사전 준수: 볼륨/강도 · 여유 횟수 · 자세 메모 · 1주차 · 칸.
// ================================================================

import { getTestBoardV2, saveTestBoardV2, getMaxCycle, getExList, getSeasonDecisionCache as getCache, ensureWorkoutDayCached } from '../../data.js';
import { MOVEMENTS } from '../../config.js';
import { S as WS } from '../state.js';
import { saveWorkoutDay } from '../save.js';
import { loadWorkoutDate } from '../load.js';
import { renderEmbeddedMaxExerciseCard } from '../exercises.js';
import { wtStartGrowthBoardAutoTimer, wtMarkGrowthBoardExerciseAdded } from '../timers.js';
import {
  TM2_GROUPS, TM2_TRACK_LABELS,
  mondayOf, addWeeks, weeksBetween, weekIndexOf, isCycleFinished, shortDate, toKey,
  activeBenchmarks, activeCycleOf, settledCyclesOf, benchmarkById, currentKgOf,
  groupIdForPart, visibleGroupIdsForSelectedParts,
  trackSetsOf,
  expandColumnCells, projectFutureCells, paintWeek, recordMiss, previewAdjust, resolveTopSetHit,
  isSettleDue, buildSettleRows, applySettle,
  archiveBenchmark, addBenchmark, buildOnboardingCandidates, buildRecentMap,
  mergeSessionExercises, sessionRecentMap, resolveSessionEntryGroupId,
  sortCandidatesByRecent, workoutRecordsForBenchmarkWeek,
  buildMinimapData, defaultIncrementForGroup, getLineup, orderWendlerPrescriptionSets, toggleLineup,
} from './board-core.js';
import {
  WENDLER_SCHEMES, WENDLER_SCHEME_IDS, normalizeWendlerConfig,
  wendlerWeekPrescription, wendlerCycleOverview, isWendlerAllowedMajor,
} from './wendler.js';
import { W863_ORIGINAL_PROFILES, W863_ORIGINAL_VERSION, inferW863Profile } from '../w863-original.js';

function _currentSessionEntries() {
  return (Array.isArray(WS.workout?.exercises) ? WS.workout.exercises : [])
    .filter(entry => entry && (entry.exerciseId || entry.id || entry.name));
}

function _registryExercises() {
  try { return getExList() || []; } catch { return []; }
}

// 온보딩/종목관리 후보 — 실제 등록 종목 + 오늘 세션 기반 (운동할 때와 동일 출처)
function _candidates(groupId = null) {
  let recentMap = {};
  try { recentMap = buildRecentMap(getCache() || {}); } catch { recentMap = {}; }
  const sessionEntries = _currentSessionEntries();
  recentMap = { ...recentMap, ...sessionRecentMap(sessionEntries, _todayKey()) };
  const exList = mergeSessionExercises(_registryExercises(), sessionEntries);
  const all = buildOnboardingCandidates({ exList, v1Cycle: getMaxCycle(), v2Board: S.board, movements: MOVEMENTS, recentMap });
  const scoped = groupId ? all.filter(c => c.groupId === groupId) : all;
  return sortCandidatesByRecent(scoped);
}

const S = {
  board: null,
  groupId: 'chest',
  view: 'board',        // 'board' | 'minimap'
  sheet: null,          // { kind, ctx }
  card: null,           // 운동 카드 { bmId, track, weekStart, plan, sets }
  missChoice: 'extend',
  settleDecisions: {},
  settingsOnly: false,
  cardCommitting: false,
};

// 세트 입력에서 마지막으로 블러가 일어난 시각. 백드롭 탭이 "키보드 닫기"인지
// "시트 닫기"인지 구분하는 데 쓴다 (_ensureRoots의 클릭 핸들러 참조).
let _sheetSetInputBlurAt = 0;

const _todayKey = () => toKey(new Date());
const _toast = (msg, type = 'info') => { if (typeof showToast === 'function') showToast(msg, 2200, type); };
const _num = (id, fallback = 0) => {
  const el = document.getElementById(id);
  const v = Number(el?.value);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const _txt = (id) => (document.getElementById(id)?.value || '').trim();

function _isTodayKey(dateKey) {
  return dateKey === _todayKey();
}

function _startGrowthBoardTimerForDate(dateKey) {
  if (_isTodayKey(dateKey)) wtStartGrowthBoardAutoTimer();
}

function _markGrowthBoardExerciseAddedForDate(dateKey) {
  if (_isTodayKey(dateKey)) wtMarkGrowthBoardExerciseAdded();
}

function _normalizeGroupId(id) {
  const raw = String(id || '').trim();
  if (!raw) return null;
  const directGroup = groupIdForPart(raw);
  if (directGroup) return directGroup;
  const mv = MOVEMENTS.find(m => m.id === raw);
  if (mv) return _normalizeGroupId(mv.primary || mv.subPattern);
  const subMap = {
    quad: 'lower', hamstring: 'lower', calf: 'lower',
    chest_upper: 'chest', chest_mid: 'chest', chest_lower: 'chest',
    back_width: 'back', back_thickness: 'back', posterior: 'back',
    shoulder_front: 'shoulder', shoulder_side: 'shoulder', rear_delt: 'shoulder', traps: 'shoulder',
  };
  return subMap[raw] || null;
}

function _entryGroupId(entry = {}) {
  return resolveSessionEntryGroupId(entry, { exList: _registryExercises(), movements: MOVEMENTS });
}

function _readSelectedMajorGroupIds() {
  const parts = Array.isArray(WS.workout?.maxMeta?.selectedMajors)
    ? WS.workout.maxMeta.selectedMajors
    : [];
  return visibleGroupIdsForSelectedParts(parts);
}

function _readSessionGroupIds() {
  const ids = new Set();
  for (const entry of _currentSessionEntries()) {
    const gid = _entryGroupId(entry);
    if (gid) ids.add(gid);
  }
  if (ids.size) return visibleGroupIdsForSelectedParts([...ids]);

  document.querySelectorAll('[data-muscle].prefer, [data-muscle].active, [data-muscle].selected').forEach(el => {
    const gid = _normalizeGroupId(el.getAttribute('data-muscle'));
    if (gid) ids.add(gid);
  });
  return ids.size ? visibleGroupIdsForSelectedParts([...ids]) : ids;
}

function _activeBoardGroupIds(board = S.board) {
  return new Set((board?.benchmarks || [])
    .filter(bm => bm?.status === 'active' && bm.groupId)
    .map(bm => bm.groupId));
}

function _boardGroups() {
  const byId = new Map(TM2_GROUPS.map(g => [g.id, { ...g }]));
  for (const g of (S.board?.groups || [])) {
    if (g?.id) byId.set(g.id, { ...(byId.get(g.id) || {}), ...g });
  }
  return [...byId.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

function _ensureBoardGroups() {
  if (!S.board) return false;
  const before = (S.board.groups || []).map(g => g.id).join('|');
  const groups = _boardGroups().map(g => ({
    id: g.id,
    label: g.label,
    bodyRegion: g.bodyRegion,
    order: g.order,
  }));
  const after = groups.map(g => g.id).join('|');
  S.board.groups = groups;
  return before !== after;
}

function _visibleGroups() {
  const groups = _boardGroups();
  const activeIds = _activeBoardGroupIds();
  const selectedGroupIds = _readSelectedMajorGroupIds();
  const selected = groups.filter(g => selectedGroupIds.has(g.id));
  const activeGroups = groups.filter(g => activeIds.has(g.id));

  if (selected.length) return selected;

  const currentScope = S.groupId ? visibleGroupIdsForSelectedParts([S.groupId]) : new Set();
  const scoped = groups.filter(g => currentScope.has(g.id));
  if (scoped.length) return scoped;

  const wanted = _readSessionGroupIds();
  if (wanted.size) {
    const filtered = groups.filter(g => wanted.has(g.id));
    if (filtered.length) return filtered;
  }

  const filtered = groups.filter(g => activeIds.has(g.id));
  return filtered.length ? filtered : (activeGroups.length ? activeGroups : groups);
}

function _syncActiveGroup() {
  const groups = _visibleGroups();
  if (!groups.some(g => g.id === S.groupId)) {
    const withBm = groups.find(g => activeBenchmarks(S.board, g.id).length);
    S.groupId = (withBm || groups[0] || { id: 'chest' }).id;
  }
}

function _firstActiveGroupId(board = S.board, preferredGroupId = null) {
  const activeIds = _activeBoardGroupIds(board);
  const preferred = _normalizeGroupId(preferredGroupId);
  if (preferred && activeIds.has(preferred)) return preferred;
  return _boardGroups().find(g => activeIds.has(g.id))?.id || null;
}

function _firstSelectedMajorGroupId() {
  return _boardGroups().find(g => _readSelectedMajorGroupIds().has(g.id))?.id || null;
}

async function _persist() {
  try {
    const savedBoard = await saveTestBoardV2(S.board);
    if (savedBoard) S.board = savedBoard;
    return true;
  } catch (e) {
    console.error('[tm2] save failed', e);
    _toast('저장에 실패했어요 — 네트워크를 확인해 주세요', 'error');
    return false;
  }
}

async function _persistRequired(message = '저장 실패 — 네트워크를 확인해 주세요') {
  try {
    const savedBoard = await saveTestBoardV2(S.board);
    if (savedBoard) S.board = savedBoard;
    return true;
  } catch (e) {
    console.error('[tm2] required save failed', e);
    _toast(message, 'error');
    return false;
  }
}

// ----------------------------------------------------------------
// 루트 DOM
// ----------------------------------------------------------------

function _ensureRoots() {
  if (!document.getElementById('tm2-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'tm2-overlay';
    ov.className = 'tm2-root tm2-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', _onAction);
  }
  if (!document.getElementById('tm2-sheets')) {
    const sh = document.createElement('div');
    sh.id = 'tm2-sheets';
    sh.className = 'tm2-root tm2-sheet-layer';
    document.body.appendChild(sh);
    sh.addEventListener('click', (e) => {
      if (e.target === sh) {
        // 입력 키보드를 닫으려는 백드롭 탭(방금 세트 입력에서 블러됨)은
        // 시트까지 닫지 않는다. 한 번 더 탭하면 그때 닫힌다.
        if (Date.now() - _sheetSetInputBlurAt < 400) return;
        closeSheet();
        return;
      }
      if (e.target.closest('.tm2-sheet')) return;
      _onAction(e);
    });
    sh.addEventListener('change', _onSheetChange);
    sh.addEventListener('input', _onSheetInput);
    sh.addEventListener('focusout', (e) => {
      if (e.target?.closest?.('[data-tm2-wset-field]')) _sheetSetInputBlurAt = Date.now();
    });
  }
}

export function closeSheet() {
  S.sheet = null;
  const sh = document.getElementById('tm2-sheets');
  if (sh) { sh.classList.remove('tm2-open'); sh.innerHTML = ''; }
}

function _openSheet(html) {
  const sh = document.getElementById('tm2-sheets');
  if (!sh) return;
  sh.innerHTML = `<div class="tm2-sheet">${html}</div>`;
  sh.querySelector('.tm2-sheet')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-tm2-col-cycle]')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    _onAction(event);
    event.stopPropagation();
  });
  sh.classList.add('tm2-open');
}

// ----------------------------------------------------------------
// 진입
// ----------------------------------------------------------------

export async function tm2OpenBoard() {
  _ensureRoots();
  S.settingsOnly = false;
  await _ensureTodayLoaded();
  const board = getTestBoardV2();
  if (!board || !Array.isArray(board.benchmarks) || !board.benchmarks.length) {
    const mod = await import('./onboarding.js');
    mod.openOnboarding({
      onComplete: async (newBoard, meta = {}) => {
        S.board = newBoard;
        S.groupId = _firstActiveGroupId(newBoard, meta.preferredGroupId) || S.groupId;
        await _persist();
        _toast('6주 칸을 채웠어요 — 성장 보드 시작!', 'success');
        _afterBoardReady();
      },
    });
    return;
  }
  S.board = board;
  S.groupId = _firstActiveGroupId(board, _firstSelectedMajorGroupId()) || S.groupId;
  _afterBoardReady();
}

export async function tm2OpenBenchmarkSettings(benchmarkId) {
  _ensureRoots();
  await _ensureTodayLoaded();
  const board = getTestBoardV2();
  const bmId = String(benchmarkId || '').trim();
  const bm = board && bmId ? benchmarkById(board, bmId) : null;
  if (!board || !bm) {
    _toast('목표 종목을 찾지 못했어요', 'warning');
    return false;
  }
  S.board = board;
  const groupsChanged = _ensureBoardGroups();
  if (groupsChanged) _persist();
  S.groupId = bm.groupId || S.groupId;
  S.view = 'board';
  S.settingsOnly = true;
  const overlay = document.getElementById('tm2-overlay');
  if (overlay) {
    overlay.classList.remove('tm2-open');
    overlay.innerHTML = '';
  }
  openColumnSheet(bmId);
  return true;
}

function _afterBoardReady() {
  S.settingsOnly = false;
  const groupsChanged = _ensureBoardGroups();
  if (groupsChanged) _persist();
  _syncActiveGroup();
  S.view = 'board';
  document.getElementById('tm2-overlay').classList.add('tm2-open');
  renderBoard();
  setTimeout(_scrollToToday, 50);
}

export function tm2CloseBoard() {
  S.settingsOnly = false;
  closeSheet();
  const ov = document.getElementById('tm2-overlay');
  if (ov) { ov.classList.remove('tm2-open'); ov.innerHTML = ''; }
}

async function _backToOnboarding() {
  tm2CloseBoard();
  _ensureRoots();
  const mod = await import('./onboarding.js');
  mod.openOnboarding({
    board: S.board,
    onComplete: async (newBoard, meta = {}) => {
      S.board = newBoard;
      S.groupId = _firstActiveGroupId(newBoard, meta.preferredGroupId) || S.groupId;
      await _persist();
      _toast('6주 칸을 다시 채웠어요 — 성장 보드로 돌아갈게요', 'success');
      _afterBoardReady();
    },
  });
}

// ----------------------------------------------------------------
// 보드 렌더
// ----------------------------------------------------------------

function _columnsOf(groupId) {
  return activeBenchmarks(S.board, groupId).map(bm => ({
    bm,
    tracks: bm.program === 'wendler' ? ['volume'] : (bm.tracks?.length ? bm.tracks : ['volume']),
    wendler: bm.program === 'wendler',
  }));
}

const TM2_ROW_H = 46;
const _weekRange = (start, n) => Array.from({ length: n }, (_, i) => addWeeks(start, i));

function _cellAtWeek(cells, weekStart) {
  return (cells || []).find(cell => {
    const diff = weeksBetween(cell.weekStart, weekStart);
    return diff >= 0 && diff < (cell.span || 1);
  }) || null;
}

function _cellStateAtWeek(cell, weekStart) {
  if (!cell) return 'rest';
  if (cell.projected || cell.state === 'future') return 'future';
  if (cell.weekStates?.length) {
    const idx = weeksBetween(cell.weekStart, weekStart);
    return cell.weekStates[idx] || cell.state || 'plan';
  }
  return cell.state || 'plan';
}

function _trackLaneLabel(col, track) {
  if (col.wendler) return 'W';
  return track === 'intensity' ? '강' : '볼';
}

function _trackLaneHtml(cell, col, track, weekStart, todayKey) {
  if (!cell || cell.kind === 'rest') {
    return `<div class="tm2-lane tm2-rest"><em>${_trackLaneLabel(col, track)}</em><i>쉼</i></div>`;
  }
  const state = _cellStateAtWeek(cell, weekStart);
  const current = weekStart === mondayOf(todayKey);
  const args = `data-action="tm2:cell" data-bm="${col.bm.id}" data-track="${track}" data-week="${weekStart}" data-state="${state}" data-current="${current ? 1 : 0}"`;
  const trackCls = col.wendler ? 'tm2-lane-wendler' : (track === 'intensity' ? 'tm2-lane-intensity' : 'tm2-lane-volume');
  const kgLabel = cell.kg > 0 ? cell.kg : '—';
  if (cell.kind === 'wendler') {
    return `<button class="tm2-lane tm2-${state} ${trackCls}" ${args}>
      <em>${_trackLaneLabel(col, track)}</em><b>${kgLabel}</b><i>${_esc(cell.repsLabel)}</i>
    </button>`;
  }
  return `<button class="tm2-lane tm2-${state} ${trackCls}" ${args}>
    <em>${_trackLaneLabel(col, track)}</em><b>${kgLabel}</b><i>${cell.reps || ''}</i>
  </button>`;
}

function _lineupDateForWeek(weekStart, todayKey = _todayKey()) {
  return mondayOf(weekStart) === mondayOf(todayKey) ? todayKey : weekStart;
}

function _lineupForGroup(dateKey, groupId = S.groupId) {
  return getLineup(S.board, dateKey).filter(item => {
    const bm = benchmarkById(S.board, item.benchmarkId);
    return bm?.groupId === groupId;
  });
}

function _lineupHas(dateKey, bmId, track = 'volume') {
  return getLineup(S.board, dateKey).some(item => item.benchmarkId === bmId && item.track === track);
}

function _lineupAddColumnHtml(model, todayKey) {
  const todayMon = mondayOf(todayKey);
  const cells = model.weeksList.map(wk => {
    const dateKey = _lineupDateForWeek(wk, todayKey);
    const count = _lineupForGroup(dateKey).length;
    const current = wk === todayMon;
    const label = count ? `<b>${count}</b><i>담김</i>` : '<b>＋</b><i>추가</i>';
    return `<button class="tm2-add-cell${count ? ' tm2-has' : ''}${current ? ' tm2-today' : ''}" data-action="tm2:lineup" data-week="${wk}" data-date="${dateKey}" aria-label="${shortDate(dateKey)} 운동 추가">${label}</button>`;
  }).join('');
  return `<div class="tm2-bcol tm2-addcol">${cells}</div>`;
}

// 보드 모델 — 과거 1사이클 + 활성 + 미래 투영(최소 18주). 행=주, 셀 정렬은 행 인덱스 기준.
function _boardModel(todayKey) {
  const settled = settledCyclesOf(S.board, S.groupId);
  const active = activeCycleOf(S.board, S.groupId);
  const settledShown = settled.length ? [settled[settled.length - 1]] : [];
  const bands = [];
  settledShown.forEach((cy, i) => bands.push({ cycle: cy, start: cy.startDate, weeks: cy.weeks, label: `C${settled.length}`, projected: false }));
  if (active) bands.push({ cycle: active, start: active.startDate, weeks: active.weeks, label: `C${settled.length + 1}`, projected: false });
  if (active) {
    const nProj = Math.max(2, Math.ceil(12 / active.weeks)); // 활성 6주 + ≥12주 투영 = ≥18주
    for (let o = 1; o <= nProj; o++) {
      bands.push({ cycle: null, start: addWeeks(active.startDate, active.weeks * o), weeks: active.weeks, label: `C${settled.length + 1 + o} 예정`, projected: true, offset: o });
    }
  }
  const weeksList = [];
  const bandStartAt = {};
  for (const band of bands) {
    const ws = _weekRange(band.start, band.weeks);
    bandStartAt[ws[0]] = { label: band.label, projected: band.projected };
    weeksList.push(...ws);
  }
  return { bands, weeksList, bandStartAt, active, settledCount: settled.length };
}

// 한 열의 전체 셀(과거+활성+투영) — 행 인덱스로 weeksList와 정렬됨
function _trackCellsByTrack(col, model, todayKey) {
  const byTrack = {};
  for (const track of col.tracks) {
    const cells = [];
    for (const band of model.bands) {
      if (band.cycle) cells.push(...expandColumnCells(S.board, col.bm.id, track, band.cycle.id, todayKey));
    }
    cells.push(...projectFutureCells(S.board, col.bm.id, track, 12));
    byTrack[track] = cells;
  }
  return byTrack;
}

function _weekCellHtml(col, byTrack, weekStart, todayKey) {
  const lanes = col.tracks.map(track => _trackLaneHtml(_cellAtWeek(byTrack[track], weekStart), col, track, weekStart, todayKey)).join('');
  return `<div class="tm2-week-cell tm2-lanes-${col.tracks.length}">${lanes}</div>`;
}

function _colHeadHtml(cols) {
  const groupNames = cols.map(col => {
    const bm = col.bm;
    const wndEm = bm.program === 'wendler' ? `<em>웬들러 · 기준 ${bm.wendler.tmKg}</em>` : '';
    return `<button class="tm2-ch-grp" data-action="tm2:column" data-bm="${bm.id}"><span class="tm2-ch-name">${_esc(bm.short || bm.label)}</span>${wndEm}</button>`;
  }).join('');
  const trackChips = cols.map(col => {
    if (col.wendler) return `<div class="tm2-ch-trk tm2-wnd">${_esc(WENDLER_SCHEMES[col.bm.wendler.scheme]?.label || '커스텀')}</div>`;
    return `<div class="tm2-ch-trk">${col.tracks.map(t => TM2_TRACK_LABELS[t]).join(' · ')}</div>`;
  }).join('');
  return `
    <div class="tm2-colhead" style="--tm2-n:${cols.length}">
      <div class="tm2-ch-rail">주</div>
      ${groupNames}
      <button class="tm2-ch-grp tm2-ch-add" data-action="tm2:manage" title="종목 관리" aria-label="종목 관리">＋</button>
      <div></div>
      ${trackChips}
      <div class="tm2-ch-trk tm2-ch-add-trk">그날</div>
    </div>`;
}

// 연속 그리드 + 붉은 "오늘" 타임라인 (계약: 18주 가시화 + 현재 위치)
function _renderBoardView(cols, todayKey) {
  const model = _boardModel(todayKey);
  const todayMon = mondayOf(todayKey);
  const railHtml = model.weeksList.map(wk => {
    const band = model.bandStartAt[wk];
    const tag = band ? `<em class="tm2-cyc-tag${band.projected ? ' tm2-proj' : ''}">${_esc(band.label)}</em>` : '';
    return `<span class="${wk === todayMon ? 'tm2-today' : ''}${band ? ' tm2-band-start' : ''}">${tag}${shortDate(wk)}</span>`;
  }).join('');
  const colsHtml = cols.map(col => {
    const byTrack = _trackCellsByTrack(col, model, todayKey);
    return `<div class="tm2-bcol">${model.weeksList.map(wk => _weekCellHtml(col, byTrack, wk, todayKey)).join('')}</div>`;
  }).join('');
  const addColHtml = _lineupAddColumnHtml(model, todayKey);
  const todayIdx = model.weeksList.indexOf(todayMon);
  const nowLine = todayIdx >= 0 ? `<div class="tm2-now-line" style="top:${todayIdx * TM2_ROW_H}px"><span>오늘</span></div>` : '';
  const settleCta = model.active && isSettleDue(S.board, S.groupId, todayKey)
    ? `<button class="tm2-settle-cta" data-action="tm2:settle">${model.active.weeks}주 정산하기 — 성장/유지 결정</button>` : '';
  return `
    ${_colHeadHtml(cols)}
    <div class="tm2-bgrid tm2-grid" style="--tm2-n:${cols.length}">
      <div class="tm2-rail">${railHtml}</div>
      ${colsHtml}
      ${addColHtml}
      ${nowLine}
    </div>
    ${settleCta}`;
}

export function renderBoard() {
  const ov = document.getElementById('tm2-overlay');
  if (!ov || !S.board) return;
  const todayKey = _todayKey();

  if (S.view === 'minimap') { _renderMinimap(ov, todayKey); return; }

  _syncActiveGroup();
  const groups = _visibleGroups();
  const chips = groups.map(g =>
    `<button class="${g.id === S.groupId ? 'tm2-on' : ''}" data-action="tm2:group" data-group="${g.id}">${_esc(g.label)}</button>`
  ).join('') + '<button class="tm2-add" data-action="tm2:manage" title="종목 추가">✚</button>';

  const cols = _columnsOf(S.groupId);
  const cycle = activeCycleOf(S.board, S.groupId);

  const bodyHtml = !cols.length
    ? `<div class="tm2-empty-note">이 부위에는 아직 종목이 없어요.<br>✚ 버튼으로 운동 메뉴에 종목을 추가해 주세요.</div>`
    : _renderBoardView(cols, todayKey);

  const groupLabel = groups.find(g => g.id === S.groupId)?.label || '';
  const cyHead = cycle ? `${weekIndexOf(cycle, todayKey) <= cycle.weeks ? `${weekIndexOf(cycle, todayKey)}주차` : '정산 대기'}` : '';
  ov.innerHTML = `
    <div class="tm2-topbar">
      <div class="tm2-topbar-row">
        <button class="tm2-back-btn" data-action="tm2:choose-majors" title="성장 보드 설정으로 돌아가기" aria-label="성장 보드 설정으로 돌아가기"><span>‹</span><em>설정</em></button>
        <b>성장 보드</b>
        <span class="tm2-sub">${_esc(groupLabel)} · ${cyHead}</span>
        <button class="tm2-icon-btn" data-action="tm2:minimap" title="6개월 조망">⤢</button>
      </div>
      <div class="tm2-grp-chips">${chips}</div>
    </div>
    <div class="tm2-body" id="tm2-body">${bodyHtml}</div>
    <button class="tm2-fab" data-action="tm2:today">오늘로</button>`;
}

function _scrollToToday() {
  const el = document.querySelector('#tm2-body .tm2-rail .tm2-today');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ----------------------------------------------------------------
// 줌아웃 미니맵 (계약 10)
// ----------------------------------------------------------------

function _renderMinimap(ov, todayKey) {
  const mm = buildMinimapData(S.board, todayKey);
  const visibleIds = new Set(_visibleGroups().map(g => g.id));
  mm.groups = (mm.groups || []).filter(g => visibleIds.has(g.groupId || g.id));
  const PX = 5, GAP = 1;
  const colHtml = (col) => {
    let html = '';
    for (const seg of col.segs) {
      const color = seg.state === 'done' ? 'var(--tm2-done)'
        : seg.state === 'now' ? 'var(--tm2-now)'
        : seg.state === 'miss' ? '#f0d9a8'
        : seg.state === 'rest' ? '#f0f1f3'
        : '#cfe9db';
      html += `<i style="height:${seg.span * PX - GAP}px;background:${color}"></i>`;
    }
    return `<div class="tm2-mm-col">${html}</div>`;
  };
  const groupsHtml = mm.groups.map(g => `
    <div class="tm2-mm-grp">
      <div class="tm2-mm-label">${_esc(g.label)}</div>
      <div class="tm2-mm-cols">${g.cols.map(colHtml).join('')}</div>
    </div>`).join('');
  // 월 라벨
  let months = '';
  let lastMonth = null;
  for (let w = 0; w <= mm.totalWeeks; w++) {
    const key = addWeeks(mm.fromKey, w);
    const m = key.slice(5, 7);
    if (m !== lastMonth) {
      months += `<span style="top:${w * PX}px">${parseInt(m, 10)}월</span>`;
      lastMonth = m;
    }
  }
  const todayTop = 18 + Math.max(0, mm.todayOffset) * PX;
  ov.innerHTML = `
    <div class="tm2-topbar">
      <div class="tm2-topbar-row">
        <button class="tm2-back-btn" data-action="tm2:back" title="보드로 돌아가기" aria-label="보드로 돌아가기"><span>‹</span><em>보드</em></button>
        <b>성장 보드</b>
        <span class="tm2-sub">전체 조망</span>
      </div>
    </div>
    <div class="tm2-body">
      <div class="tm2-mini-wrap">
        <div class="tm2-mini-head">모든 부위 × 전체 기간 — <b>어디까지 칠해왔고 어디로 가는지</b> 한 화면.</div>
        <div class="tm2-minimap">
          <div class="tm2-mm-months">${months}</div>
          ${groupsHtml}
          <div class="tm2-mm-today" style="top:${todayTop}px"></div>
        </div>
        <div class="tm2-mini-legend">
          <span><i style="background:var(--tm2-done)"></i>달성</span>
          <span><i style="background:var(--tm2-now)"></i>이번 주</span>
          <span><i style="background:#cfe9db"></i>계획</span>
          <span><i style="background:#f0d9a8"></i>못 채움·조정</span>
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------
// 셀 시트 (계약 4·8·9)
// ----------------------------------------------------------------

function _metaRowsHtml(bm) {
  const rows = [];
  const rir = bm.meta?.rirTarget;
  if (rir != null && rir !== '') {
    rows.push(`<div class="tm2-std-row"><span class="tm2-ic">💪</span><div><b>세트 끝에 ${rir}회 남기기</b><small>여유 횟수(RIR) ${rir} — 한계까지 가지 않아요</small></div></div>`);
  }
  if (bm.meta?.formNote) {
    rows.push(`<div class="tm2-std-row"><span class="tm2-ic">📐</span><div><b>${_esc(bm.meta.formNote)}</b><small>자세 메모</small></div></div>`);
  }
  if (bm.meta?.gymNote) {
    rows.push(`<div class="tm2-std-row"><span class="tm2-ic">🏋️</span><div><b>${_esc(bm.meta.gymNote)}</b><small>헬스장별 기구</small></div></div>`);
  }
  return rows.length ? `<div class="tm2-sec-label">오늘의 기준</div><div class="tm2-std">${rows.join('')}</div>` : '';
}

function _kickerOf(bm, weekStart) {
  const cycle = activeCycleOf(S.board, bm.groupId);
  const group = _boardGroups().find(g => g.id === bm.groupId);
  const wk = cycle ? Math.max(1, Math.min(cycle.weeks, weekIndexOf(cycle, weekStart))) : 1;
  const isThisWeek = mondayOf(weekStart) === mondayOf(_todayKey());
  return `${group?.label || ''} · ${wk}주차 — ${shortDate(weekStart)} 주${isThisWeek ? ' (이번 주)' : ''}`;
}

// 셀 탭 → 미래는 계획 미리보기, 과거는 기록 요약, 이번 주는 실제 운동카드(통합).
async function openCellSheet(bmId, track, weekStart) {
  const bm = benchmarkById(S.board, bmId);
  if (!bm) return;
  const wkMon = mondayOf(weekStart);
  const thisMon = mondayOf(_todayKey());
  const rel = weeksBetween(thisMon, wkMon);
  if (rel > 0) { _openPlanPreview(bm, track, wkMon); return; }      // 미래
  if (rel < 0) { await _openPastSummary(bm, track, wkMon); return; } // 과거
  await _openWorkoutCard(bm, track, wkMon);                         // 이번 주
}

// 이번 주 칸의 계획 처방
function _cellPlan(bm, track, wkMon) {
  const cycle = activeCycleOf(S.board, bm.groupId);
  if (bm.program === 'wendler') {
    const wk = cycle ? Math.max(1, Math.min(cycle.weeks, weekIndexOf(cycle, wkMon))) : 1;
    const rx = wendlerWeekPrescription(bm.wendler, wk);
    return { kind: 'wendler', kg: rx.topSet?.kg || 0, reps: rx.topSet?.reps || 0, amrap: !!rx.topSet?.amrap, rx };
  }
  const cells = cycle ? expandColumnCells(S.board, bm.id, track, cycle.id, _todayKey()) : [];
  const cell = cells.find(c => c.kind === 'stair' && weeksBetween(c.weekStart, wkMon) >= 0 && weeksBetween(c.weekStart, wkMon) < c.span);
  return { kind: 'stair', kg: cell?.kg || 0, reps: cell?.reps || 0, sets: cell?.sets || trackSetsOf(bm, track) };
}

const _trackToCode = (track) => track === 'intensity' ? 'H' : 'M';
const _codeToTrack = (code) => code === 'H' ? 'intensity' : 'volume';
const _targetRpeOf = (bm) => Math.max(1, Math.min(10, 10 - Number(bm.meta?.rirTarget == null ? 2 : bm.meta.rirTarget)));

function _wendlerPlanSignature(plan) {
  if (plan?.kind !== 'wendler') return '';
  const rx = plan.rx || {};
  const setSig = (sets = []) => sets.map(s => [
    s.pct ?? '',
    s.kg ?? '',
    s.reps ?? '',
    s.amrap ? 'amrap' : '',
  ].join(':')).join(',');
  const supp = rx.supplemental
    ? [rx.supplemental.kind, rx.supplemental.pct, rx.supplemental.kg, rx.supplemental.sets, rx.supplemental.reps].join(':')
    : 'none';
  return [
    `tm:${rx.tmKg ?? ''}`,
    `oneRm:${rx.oneRmKg ?? ''}`,
    `template:${rx.templateVersion ?? ''}`,
    `profile:${rx.profileId ?? ''}`,
    `week:${rx.week ?? ''}`,
    `board:${rx.boardWeek ?? ''}`,
    `round:${rx.roundKg ?? ''}`,
    `warm:${setSig(rx.warmup?.sets || [])}`,
    `main:${setSig(rx.sets || [])}`,
    `singles:${setSig(rx.heavySingles || [])}`,
    `optional:${setSig(rx.optionalSets || [])}`,
    `backoff:${setSig(rx.backoff || [])}`,
    `deload:${setSig(rx.deload || [])}`,
    `supp:${supp}`,
  ].join('|');
}

function _expectedWendlerCounts(plan) {
  if (plan.rx?.templateVersion === W863_ORIGINAL_VERSION) {
    return (plan.rx.requiredSets || []).reduce((counts, set) => {
      counts[set.role] = (counts[set.role] || 0) + 1;
      return counts;
    }, {});
  }
  const supp = plan.rx?.supplemental;
  return {
    warmup: plan.rx?.warmup?.sets?.length || 0,
    main: plan.rx?.sets?.length || 0,
    supplemental: supp ? Math.max(0, Number(supp.sets) || 0) : 0,
  };
}

function _hasWendlerPlanShape(sets, plan) {
  if (!Array.isArray(sets) || !sets.some(s => s?.wendlerRole)) return false;
  const need = _expectedWendlerCounts(plan);
  const got = {};
  for (const s of sets) {
    const role = s?.wendlerRole;
    if (role) got[role] = (got[role] || 0) + 1;
  }
  return Object.entries(need).every(([role, count]) => (got[role] || 0) >= count);
}

function _setsForWorkoutCard(bm, plan) {
  const rpe = _targetRpeOf(bm);
  if (plan.kind === 'wendler') {
    const signature = _wendlerPlanSignature(plan);
    if (plan.rx?.templateVersion === W863_ORIGINAL_VERSION) {
      return (plan.rx.requiredSets || []).map((s, idx) => ({
        kg: s.kg, reps: s.reps,
        rpe: s.role === 'warmup' || s.role === 'deload' ? Math.max(1, rpe - 2) : rpe,
        romPct: 100,
        setType: s.role === 'warmup' ? 'warmup' : 'main',
        wendlerRole: s.role,
        wendlerPct: s.pct ?? null,
        wendlerOrder: idx,
        wendlerSignature: signature,
        amrap: !!s.amrap,
        done: false,
      }));
    }
    const sets = [];
    for (const [idx, s] of (plan.rx.warmup?.sets || []).entries()) {
      sets.push({
        kg: s.kg, reps: s.reps, rpe: Math.max(1, rpe - 2), romPct: 100,
        setType: 'warmup', wendlerRole: 'warmup', wendlerPct: s.pct ?? null,
        wendlerOrder: idx, wendlerSignature: signature, done: false,
      });
    }
    sets.push(...(plan.rx.sets || []).map((s, idx) => ({
      kg: s.kg, reps: s.reps, rpe, romPct: 100,
      setType: 'main', wendlerRole: 'main', wendlerPct: s.pct ?? null,
      wendlerOrder: idx, wendlerSignature: signature, amrap: !!s.amrap, done: false,
    })));
    const supp = plan.rx.supplemental;
    if (supp) {
      for (let i = 0; i < supp.sets; i++) {
        sets.push({
          kg: supp.kg, reps: supp.reps, rpe, romPct: 100,
          setType: 'main', wendlerRole: 'supplemental', supplementalKind: supp.kind,
          wendlerPct: supp.pct ?? null, wendlerOrder: i, wendlerSignature: signature, done: false,
        });
      }
    }
    return sets;
  }
  return Array.from({ length: plan.sets || 4 }, () => ({ kg: plan.kg, reps: plan.reps, rpe, romPct: 100, setType: 'main', done: false }));
}

function _wendlerRoleByIndex(idx, plan) {
  if (plan.rx?.templateVersion === W863_ORIGINAL_VERSION) {
    return plan.rx.requiredSets?.[idx]?.role || 'main';
  }
  const warmCount = plan.rx?.warmup?.sets?.length || 0;
  const mainCount = plan.rx?.sets?.length || 0;
  if (idx < warmCount) return 'warmup';
  if (idx < warmCount + mainCount) return 'main';
  return 'supplemental';
}

function _ensureWendlerSetRoles(sets, plan, bm = null, signature = _wendlerPlanSignature(plan)) {
  const rpe = bm ? _targetRpeOf(bm) : 8;
  return orderWendlerPrescriptionSets((Array.isArray(sets) ? sets : []).map((set, idx) => {
    const role = set.wendlerRole || (set.setType === 'warmup' ? 'warmup' : _wendlerRoleByIndex(idx, plan));
    return {
      ...set,
      setType: role === 'warmup' ? 'warmup' : (set.setType || 'main'),
      wendlerRole: role,
      wendlerOrder: set.wendlerOrder ?? idx,
      wendlerSignature: signature,
      rpe: set.rpe == null ? (role === 'warmup' ? Math.max(1, rpe - 2) : rpe) : set.rpe,
      romPct: set.romPct == null ? 100 : set.romPct,
      done: !!set.done,
    };
  }));
}

function _shouldKeepWendlerSets(cur, keepSets, plan, signature) {
  if (!keepSets) return false;
  if (cur?.recommendationMeta?.wendlerSignature !== signature) return false;
  if (cur?.recommendationMeta?.wendlerManualOverride) return true;
  return _hasWendlerPlanShape(cur?.sets, plan);
}

function _isEmptyDraftSet(set = {}) {
  return !Number(set?.kg)
    && !Number(set?.reps)
    && set?.done === false
    && (set?.setType == null || set.setType === 'main')
    && (set?.rpe == null || set.rpe === '')
    && (set?.romPct == null || Number(set.romPct) === 100);
}

function _shouldKeepWorkoutCardSets(cur, code, wkMon, prescription) {
  const sameCard = cur?.recommendationMeta?.track === code
    && cur?.recommendationMeta?.boardV2WeekStart === wkMon;
  if (!sameCard) return false;
  const sets = Array.isArray(cur?.sets) ? cur.sets.filter(Boolean) : [];
  if (!sets.length) return false;
  const expectedCount = Math.max(1, Number(prescription?.targetSets) || (prescription?.sets || []).length || 4);
  if (expectedCount > 1 && sets.length === 1 && _isEmptyDraftSet(sets[0])) return false;
  return true;
}

function _wendlerRxLabel(plan) {
  if (plan?.kind !== 'wendler') return '';
  const supp = plan.rx?.supplemental;
  const top = plan.rx?.topSet;
  const main = `메인 ${plan.rx?.sets?.length || 0}세트 · 톱 ${top?.kg || '—'}kg × ${top?.reps || ''}${top?.amrap ? '+' : ''}`;
  const supplemental = supp ? `${supp.label} ${supp.kg}kg ${supp.sets}x${supp.reps}` : '보조 없음';
  return `${main} → ${supplemental}`;
}

function _basePrescriptionForTrack(bm, track, wkMon) {
  const plan = _cellPlan(bm, track, wkMon);
  const cycle = activeCycleOf(S.board, bm.groupId);
  const code = _trackToCode(track);
  const week = cycle ? Math.max(1, Math.min(cycle.weeks, weekIndexOf(cycle, wkMon))) : 1;
  const trackLabel = plan.kind === 'wendler' ? `웬들러 · ${WENDLER_SCHEMES[bm.wendler?.scheme]?.label || '커스텀'}` : TM2_TRACK_LABELS[track];
  const sets = _setsForWorkoutCard(bm, plan);
  const wendlerLabel = _wendlerRxLabel(plan);
  const detail = plan.kind === 'wendler'
    ? `${week}주차 · ${wendlerLabel}`
    : `${week}주차 · 성공 기준 ${plan.kg || '—'}kg × ${plan.reps || ''}${plan.amrap ? '+' : ''}회`;
  return {
    plan,
    prescription: {
      benchmarkId: bm.id,
      cycleId: cycle?.id || null,
      benchmarkTrack: code,
      track: code,
      startKg: plan.kg || 0,
      repsLow: plan.reps || 0,
      repsHigh: plan.reps || 0,
      targetSets: sets.length,
      targetRpe: _targetRpeOf(bm),
      action: plan.kind === 'wendler' ? 'wendler' : 'plan',
      actionLabel: trackLabel,
      label: plan.kind === 'wendler'
        ? `${trackLabel} · ${wendlerLabel}`
        : `${trackLabel} · ${sets.length}세트 x ${plan.reps || ''}${plan.amrap ? '+' : ''}회`,
      reason: plan.kind === 'wendler' ? '성장 보드의 웬들러 처방을 오늘 운동 카드로 불러왔어요.' : '성장 보드의 이번 주 칸을 오늘 운동 카드로 불러왔어요.',
      transparency: { detail },
      sets,
    },
  };
}

function _prescriptionForTrack(bm, track, wkMon) {
  const base = _basePrescriptionForTrack(bm, track, wkMon);
  if (bm.program !== 'wendler') {
    base.prescription.trackAlternatives = {};
    for (const t of (bm.tracks || [])) {
      const alt = _basePrescriptionForTrack(bm, t, wkMon).prescription;
      base.prescription.trackAlternatives[_trackToCode(t)] = alt;
    }
  }
  return base;
}

function _entryBoardTrack(entry) {
  return _codeToTrack(entry?.recommendationMeta?.track || entry?.maxPrescription?.benchmarkTrack || entry?.maxPrescription?.track);
}

function _workoutEntryIndexForBenchmark(list, bm) {
  return list.findIndex(x =>
    (bm.exerciseId && x.exerciseId === bm.exerciseId)
    || x.recommendationMeta?.boardV2BenchmarkId === bm.id
    || x.name === bm.label
  );
}

function _manualLineupPrescription(bm, track, kg, reps) {
  const code = _trackToCode(track);
  const sets = Array.from({ length: trackSetsOf(bm, track) }, () => ({
    kg, reps, rpe: _targetRpeOf(bm), romPct: 100, setType: 'main', done: false,
  }));
  return {
    plan: { kind: 'stair', kg, reps, sets: sets.length },
    prescription: {
      benchmarkId: bm.id,
      cycleId: activeCycleOf(S.board, bm.groupId)?.id || null,
      benchmarkTrack: code,
      track: code,
      startKg: kg,
      repsLow: reps,
      repsHigh: reps,
      targetSets: sets.length,
      targetRpe: _targetRpeOf(bm),
      action: 'lineup',
      actionLabel: '오늘 추가',
      label: `오늘 추가 · ${sets.length}세트 x ${reps}회`,
      reason: '성장 보드에서 오늘 할 운동으로 직접 추가했어요.',
      transparency: { detail: `오늘 추가 · ${kg || '—'}kg × ${reps}회` },
      sets,
    },
  };
}

function _upsertWorkoutEntryForBenchmark(bm, track, wkMon, override = null) {
  const { plan, prescription } = override || _prescriptionForTrack(bm, track, wkMon);
  const code = _trackToCode(track);
  const wendlerSignature = plan.kind === 'wendler' ? _wendlerPlanSignature(plan) : '';
  const list = WS.workout.exercises || (WS.workout.exercises = []);
  const idx = _workoutEntryIndexForBenchmark(list, bm);
  const created = idx < 0;
  const cycle = activeCycleOf(S.board, bm.groupId);
  const baseEntry = {
    muscleId: bm.muscleId || bm.groupId || 'chest',
    exerciseId: bm.exerciseId || null,
    name: bm.label,
    movementId: bm.movementId || null,
    gymTagAtTime: '*',
    recommendationMeta: {
      ...(idx >= 0 ? list[idx].recommendationMeta || {} : {}),
      track: code,
      cycleWeek: cycle ? weekIndexOf(cycle, wkMon) : 1,
      cycleId: cycle?.id || null,
      boardV2BenchmarkId: bm.id,
      boardV2WeekStart: wkMon,
      ...(plan.kind === 'wendler' ? { wendlerSignature } : {}),
    },
    maxPrescription: prescription,
    uiCollapsed: false,
  };
  let entryIdx = idx;
  if (entryIdx >= 0) {
    const cur = list[entryIdx];
    const keepSets = _shouldKeepWorkoutCardSets(cur, code, wkMon, prescription);
    const keepWendlerSets = plan.kind === 'wendler' && _shouldKeepWendlerSets(cur, keepSets, plan, wendlerSignature);
    const sets = plan.kind === 'wendler'
      ? (keepWendlerSets ? cur.sets : prescription.sets)
      : (keepSets ? cur.sets : prescription.sets);
    list[entryIdx] = {
      ...cur,
      ...baseEntry,
      recommendationMeta: {
        ...(cur.recommendationMeta || {}),
        ...baseEntry.recommendationMeta,
        ...(plan.kind === 'wendler'
          ? { wendlerManualOverride: keepWendlerSets ? !!cur.recommendationMeta?.wendlerManualOverride : false }
          : {}),
      },
      sets: plan.kind === 'wendler' ? _ensureWendlerSetRoles(sets, plan, bm, wendlerSignature) : sets,
    };
  } else {
    entryIdx = list.length;
    list.push({
      ...baseEntry,
      recommendationMeta: {
        ...baseEntry.recommendationMeta,
        ...(plan.kind === 'wendler' ? { wendlerManualOverride: false } : {}),
      },
      sets: plan.kind === 'wendler' ? _ensureWendlerSetRoles(prescription.sets, plan, bm, wendlerSignature) : prescription.sets,
    });
  }
  return { entryIdx, plan, prescription, created };
}

async function _openWorkoutCard(bm, track, wkMon) {
  await _ensureTodayLoaded();
  const { entryIdx, plan, created } = _upsertWorkoutEntryForBenchmark(bm, track, wkMon);
  if (created && wkMon === mondayOf(_todayKey())) _markGrowthBoardExerciseAddedForDate(_todayKey());
  S.card = { bmId: bm.id, track, weekStart: wkMon, plan, entryIdx };
  S.sheet = { kind: 'card', ctx: { bmId: bm.id, track, weekStart: wkMon } };
  _renderWorkoutCard();
}

const _fmtKg = (kg) => {
  const n = Number(kg);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
};

function _wendlerSectionMeta(role, plan) {
  if (role === 'warmup') return { title: '준비 운동', sub: plan.rx?.templateVersion === W863_ORIGINAL_VERSION ? '원본 기준표 비례 워밍업' : 'TM 기준 워밍업' };
  if (role === 'main') {
    const top = plan.rx?.topSet;
    return { title: '메인', sub: top?.amrap ? '마지막 세트: AMRAP' : '메인 처방 세트' };
  }
  if (role === 'heavy_single') return { title: '고중량 싱글', sub: '기본 포함 · 1회씩 수행' };
  if (role === 'pr_attempt') return { title: 'PR 도전', sub: '당일 확인한 기준 1RM 초과 선택 세트' };
  if (role === 'backoff') return { title: '백오프', sub: '원본 표의 마무리 볼륨 5세트' };
  if (role === 'deload') return { title: '회복', sub: 'W7 회복 세트 · 성장 지표에서 제외' };
  const supp = plan.rx?.supplemental;
  return {
    title: supp?.label || '보조',
    sub: supp ? `${supp.sets}세트 × ${supp.reps}회 · ${supp.pct || ''}% TM` : '보조 없음',
  };
}

function _wendlerSectionHtml(role, sets, plan, bm) {
  const meta = _wendlerSectionMeta(role, plan);
  const title = `${bm.label} - ${meta.title}`;
  const rows = sets.map(({ set, idx }, rowIdx) => {
    const pct = set.wendlerPct ? `<small>${_esc(set.wendlerPct)}%</small>` : '';
    const plus = set.amrap ? '<em>+</em>' : '';
    const romPct = Number(set.romPct);
    const romValue = Number.isFinite(romPct) ? Math.max(0, Math.min(100, Math.round(romPct))) : 100;
    return `
      <div class="tm2-wset-row ${set.done ? 'tm2-done' : ''}">
        <button type="button" class="tm2-wset-check ${set.done ? 'tm2-on' : ''}" data-action="tm2:wset-done" data-si="${idx}" aria-label="세트 완료"></button>
        <div class="tm2-wset-no"><b>${rowIdx + 1}</b>${pct}</div>
        <label><span>반복 횟수</span><input data-tm2-wset-field="reps" data-si="${idx}" inputmode="numeric" value="${_esc(set.reps ?? '')}">${plus}</label>
        <label><span>kg</span><input data-tm2-wset-field="kg" data-si="${idx}" inputmode="decimal" value="${_esc(_fmtKg(set.kg))}"></label>
        <label class="tm2-wset-rom"><span>ROM</span><input data-tm2-wset-field="romPct" data-si="${idx}" inputmode="numeric" min="0" max="100" value="${_esc(romValue)}" aria-label="가동범위 퍼센트"><em>%</em></label>
        <button type="button" class="tm2-wset-remove" data-action="tm2:wset-remove" data-si="${idx}" aria-label="세트 삭제">×</button>
      </div>`;
  }).join('');
  return `
    <section class="tm2-wsec" data-role="${role}">
      <div class="tm2-wsec-head">
        <div><b>${_esc(title)}</b><span>${_esc(meta.sub)}</span></div>
        <button type="button" data-action="tm2:wset-add" data-role="${role}">+ 세트 추가</button>
      </div>
      <div class="tm2-wset-head"><span></span><span>세트#</span><span>반복 횟수</span><span>kg</span><span>ROM</span><span></span></div>
      <div class="tm2-wset-list">${rows}</div>
    </section>`;
}

function _renderWendlerWorkoutCard(host, bm, entryIdx, plan) {
  const entry = WS.workout.exercises?.[entryIdx];
  if (!entry) return;
  const signature = _wendlerPlanSignature(plan);
  const sameSignature = entry.recommendationMeta?.wendlerSignature === signature;
  const canKeep = sameSignature && (entry.recommendationMeta?.wendlerManualOverride || _hasWendlerPlanShape(entry.sets, plan));
  const sets = _ensureWendlerSetRoles(canKeep ? entry.sets : _setsForWorkoutCard(bm, plan), plan, bm, signature);
  entry.sets = sets;
  entry.recommendationMeta = {
    ...(entry.recommendationMeta || {}),
    wendlerSignature: signature,
    wendlerManualOverride: canKeep ? !!entry.recommendationMeta?.wendlerManualOverride : false,
  };
  const byRole = (role) => sets
    .map((set, idx) => ({ set, idx }))
    .filter(x => x.set.wendlerRole === role);
  const scheme = WENDLER_SCHEMES[bm.wendler?.scheme]?.label || '커스텀';
  const supp = plan.rx?.supplemental;
  const top = plan.rx?.topSet;
  const isOriginal = plan.rx?.templateVersion === W863_ORIGINAL_VERSION;
  const optional = plan.rx?.optionalSets || [];
  const prAdded = sets.some(set => set.wendlerRole === 'pr_attempt');
  host.innerHTML = `
    <div class="tm2-wcard">
      <div class="tm2-wcard-meta">
        <div><b>${_esc(bm.label)} — 웬들러 ${_esc(scheme)}</b><span>사이클 ${_esc(bm.wendler?.cycleNo || 1)} · ${isOriginal ? '1RM' : 'TM'} ${_esc(_fmtKg(isOriginal ? plan.rx?.oneRmKg : (plan.rx?.tmKg || bm.wendler?.tmKg)))}kg</span></div>
        <strong>${_esc(_fmtKg(top?.kg))}kg × ${_esc(top?.reps || '')}${top?.amrap ? '+' : ''}</strong>
      </div>
      ${byRole('warmup').length ? _wendlerSectionHtml('warmup', byRole('warmup'), plan, bm) : ''}
      ${byRole('main').length ? _wendlerSectionHtml('main', byRole('main'), plan, bm) : ''}
      ${isOriginal && byRole('heavy_single').length ? _wendlerSectionHtml('heavy_single', byRole('heavy_single'), plan, bm) : ''}
      ${isOriginal && optional.length ? `<div class="tm2-wpr-row"><span>기준 1RM 초과 싱글</span><button type="button" data-action="tm2:w863-pr-add" ${prAdded ? 'disabled' : ''}>${prAdded ? 'PR 세트 포함됨' : `PR ${optional.map(set => `${_fmtKg(set.kg)}kg`).join(' · ')} 추가`}</button></div>` : ''}
      ${isOriginal && prAdded ? _wendlerSectionHtml('pr_attempt', byRole('pr_attempt'), plan, bm) : ''}
      ${isOriginal && byRole('backoff').length ? _wendlerSectionHtml('backoff', byRole('backoff'), plan, bm) : ''}
      ${isOriginal && byRole('deload').length ? _wendlerSectionHtml('deload', byRole('deload'), plan, bm) : ''}
      ${supp ? _wendlerSectionHtml('supplemental', byRole('supplemental'), plan, bm) : ''}
    </div>`;
}

async function _confirmBoardW863Pr() {
  const entry = WS.workout.exercises?.[S.card?.entryIdx];
  const optional = S.card?.plan?.rx?.optionalSets || [];
  if (!entry || !optional.length || (entry.sets || []).some(set => set.wendlerRole === 'pr_attempt')) return;
  const ok = await confirmAction({
    title: '오늘 PR 싱글을 추가할까요?',
    message: `${optional.map(set => `${_fmtKg(set.kg)}kg × ${set.reps}회`).join(', ')}\n현재 기준 1RM을 넘는 선택 세트입니다. 컨디션과 안전 장비를 확인하세요.`,
    confirmLabel: 'PR 세트 추가',
    cancelLabel: '오늘은 제외',
  });
  if (!ok) return;
  const signature = _wendlerPlanSignature(S.card.plan);
  const next = optional.map((set, idx) => ({
    kg: set.kg, reps: set.reps, rpe: _targetRpeOf(benchmarkById(S.board, S.card.bmId)), romPct: 100,
    setType: 'main', wendlerRole: 'pr_attempt', wendlerPct: set.pct ?? null,
    wendlerOrder: idx, wendlerSignature: signature, optionalConfirmed: true, confirmedAt: Date.now(), done: false,
  }));
  const backoffIdx = (entry.sets || []).findIndex(set => set.wendlerRole === 'backoff');
  entry.sets.splice(backoffIdx >= 0 ? backoffIdx : entry.sets.length, 0, ...next);
  _stampCurrentWendlerMeta();
  _saveWorkoutDraft();
  _rerenderWendlerCardHost();
  _toast('PR 도전 싱글을 오늘 세트에 추가했어요', 'success');
}

function _renderWorkoutCard() {
  const { bmId, track, weekStart, plan, entryIdx } = S.card;
  const bm = benchmarkById(S.board, bmId);
  const isWnd = plan.kind === 'wendler';
  const trackLabel = isWnd ? `웬들러 · ${_esc(WENDLER_SCHEMES[bm.wendler?.scheme]?.label || '커스텀')}` : TM2_TRACK_LABELS[track];
  const suppLabel = plan.rx?.supplemental?.label || '보조 없음';
  const wendlerNote = isWnd ? `<div class="tm2-wendler-card-note"><b>${trackLabel} 메인 + ${_esc(suppLabel)}</b><span>${_esc(_wendlerRxLabel(plan))}</span></div>` : '';
  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(_kickerOf(bm, weekStart))} · 운동 카드</div>
    <div class="tm2-sh-title">${_esc(bm.label)} <small>${trackLabel}</small></div>
    ${_metaRowsHtml(bm)}
    ${wendlerNote}
    <div id="tm2-card-host" class="tm2-card-host"></div>
    <button class="tm2-btn-paint" data-action="tm2:card-commit">운동 완료</button>
    <button class="tm2-btn-ghost" data-action="tm2:sheet-close">닫기 (나중에)</button>
  `);
  const host = document.getElementById('tm2-card-host');
  if (!host) return;
  if (isWnd) {
    _renderWendlerWorkoutCard(host, bm, entryIdx, plan);
    return;
  }
  renderEmbeddedMaxExerciseCard(host, entryIdx, {
    hideRemove: true,
    allowTrackToggle: bm.program !== 'wendler' && (bm.tracks || []).length > 1,
    className: 'tm2-embedded-card',
    onTrackChange(entry) {
      const nextTrack = _entryBoardTrack(entry);
      S.card.track = nextTrack;
      S.card.plan = _cellPlan(bm, nextTrack, weekStart);
      S.sheet.ctx.track = nextTrack;
    },
  });
}

function _saveWorkoutDraft() {
  saveWorkoutDay({ silent: true }).catch(e => console.error('[tm2] saveWorkoutDay draft failed', e));
}

function _rerenderWendlerCardHost() {
  if (!S.card?.plan || S.card.plan.kind !== 'wendler') return;
  const host = document.getElementById('tm2-card-host');
  const bm = benchmarkById(S.board, S.card.bmId);
  if (host && bm) _renderWendlerWorkoutCard(host, bm, S.card.entryIdx, S.card.plan);
}

function _stampCurrentWendlerMeta({ manualOverride = null } = {}) {
  if (!S.card?.plan || S.card.plan.kind !== 'wendler') return;
  const entry = WS.workout.exercises?.[S.card.entryIdx];
  if (!entry) return;
  entry.recommendationMeta = {
    ...(entry.recommendationMeta || {}),
    wendlerSignature: _wendlerPlanSignature(S.card.plan),
    ...(manualOverride == null ? {} : { wendlerManualOverride: !!manualOverride }),
  };
}

// 세트 입력값을 상태에 반영한다. normalizeInput은 change(커밋) 시에만 켠다 —
// 타이핑 중에 input.value를 다시 쓰면 커서가 튀고 입력이 끊긴다.
function _applySheetSetField(inp, { normalizeInput = false } = {}) {
  if (!inp || !S.card?.entryIdx && S.card?.entryIdx !== 0) return false;
  const entry = WS.workout.exercises?.[S.card.entryIdx];
  const idx = Number(inp.dataset.si);
  const field = inp.dataset.tm2WsetField;
  if (!entry || !Array.isArray(entry.sets) || !entry.sets[idx]) return false;
  const n = Number(inp.value);
  const next = (() => {
    if (field === 'romPct') {
      const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 100;
      if (normalizeInput) inp.value = String(pct);
      return pct;
    }
    if (!Number.isFinite(n) || n < 0) return '';
    return field === 'reps' ? Math.round(n) : Math.round(n * 10) / 10;
  })();
  entry.sets[idx] = {
    ...entry.sets[idx],
    [field]: next,
  };
  return true;
}

function _onSheetChange(e) {
  const inp = e.target.closest('[data-tm2-wset-field]');
  if (!_applySheetSetField(inp, { normalizeInput: true })) return;
  _stampCurrentWendlerMeta();
  _saveWorkoutDraft();
}

// 타이핑 즉시 드래프트를 상태에 반영한다. change(블러) 전에 세트 완료 토글·세트
// 추가 등으로 카드가 리렌더되거나 시트가 닫혀도 입력해 둔 값이 사라지지 않는다.
// 네트워크 저장은 키 입력마다 하지 않고 기존 change 커밋에 맡긴다.
function _onSheetInput(e) {
  const inp = e.target?.closest?.('[data-tm2-wset-field]');
  if (!inp) return;
  _applySheetSetField(inp);
}

function _cloneWendlerSetForRole(role) {
  const bm = benchmarkById(S.board, S.card?.bmId);
  const plan = S.card?.plan;
  const rpe = bm ? _targetRpeOf(bm) : 8;
  const rx = plan?.rx || {};
  const signature = _wendlerPlanSignature(plan);
  if (role === 'warmup') {
    const src = rx.warmup?.sets?.[0] || {};
    return { kg: src.kg || 0, reps: src.reps || 5, rpe: Math.max(1, rpe - 2), romPct: 100, setType: 'warmup', wendlerRole: 'warmup', wendlerPct: src.pct ?? null, wendlerSignature: signature, done: false };
  }
  if (role === 'supplemental') {
    const supp = rx.supplemental || {};
    return { kg: supp.kg || 0, reps: supp.reps || 10, rpe, romPct: 100, setType: 'main', wendlerRole: 'supplemental', supplementalKind: supp.kind, wendlerPct: supp.pct ?? null, wendlerSignature: signature, done: false };
  }
  const top = rx.topSet || rx.sets?.[rx.sets.length - 1] || {};
  return { kg: top.kg || 0, reps: top.reps || 5, rpe, romPct: 100, setType: 'main', wendlerRole: 'main', wendlerPct: top.pct ?? null, wendlerSignature: signature, amrap: !!top.amrap, done: false };
}

function _addWendlerSet(role) {
  const entry = WS.workout.exercises?.[S.card?.entryIdx];
  if (!entry) return;
  const sets = Array.isArray(entry.sets) ? entry.sets : (entry.sets = []);
  const insertAfter = Math.max(-1, ...sets.map((s, i) => s.wendlerRole === role ? i : -1));
  const next = _cloneWendlerSetForRole(role);
  sets.splice(insertAfter + 1, 0, next);
  _stampCurrentWendlerMeta({ manualOverride: true });
  _rerenderWendlerCardHost();
  _saveWorkoutDraft();
}

// 완료 토글은 구조가 변하지 않으므로 행 클래스만 제자리에서 바꾼다.
// 카드 전체 innerHTML 리빌드는 화면 깜빡임 + 입력 중 포커스/키보드 소실을 만든다.
function _patchWendlerSetRowDone(idx, done) {
  const host = document.getElementById('tm2-card-host');
  const check = host?.querySelector?.(`[data-action="tm2:wset-done"][data-si="${idx}"]`);
  const row = check?.closest?.('.tm2-wset-row');
  if (!row) return false;
  check.classList.toggle('tm2-on', done);
  row.classList.toggle('tm2-done', done);
  return true;
}

function _toggleWendlerSet(idx) {
  const entry = WS.workout.exercises?.[S.card?.entryIdx];
  if (!entry?.sets?.[idx]) return;
  const done = !entry.sets[idx].done;
  entry.sets[idx].done = done;
  if (!_patchWendlerSetRowDone(idx, done)) _rerenderWendlerCardHost();
  _saveWorkoutDraft();
}

function _removeWendlerSet(idx) {
  const entry = WS.workout.exercises?.[S.card?.entryIdx];
  if (!entry?.sets?.[idx]) return;
  entry.sets.splice(idx, 1);
  _stampCurrentWendlerMeta({ manualOverride: true });
  _rerenderWendlerCardHost();
  _saveWorkoutDraft();
}

async function _ensureTodayLoaded() {
  const now = new Date();
  const d = WS?.shared?.date;
  if (d && d.y === now.getFullYear() && d.m === now.getMonth() && d.d === now.getDate()) return;
  try { await loadWorkoutDate(now.getFullYear(), now.getMonth(), now.getDate()); }
  catch (e) { console.error('[tm2] loadWorkoutDate failed', e); }
}

function _isCompletionStamped(bm, track, weekStart) {
  const wk = mondayOf(weekStart);
  if (bm?.program === 'wendler') return !!bm.wendlerLog?.[wk]?.paintedAt;
  return (S.board?.steps || []).some(step =>
    step.benchmarkId === bm?.id &&
    step.track === track &&
    weeksBetween(step.weekStart, wk) >= 0 &&
    weeksBetween(step.weekStart, wk) < step.span &&
    !!step.weekLog?.[wk]?.paintedAt
  );
}

function _setCardCommitBusy(busy) {
  S.cardCommitting = !!busy;
  const btn = document.querySelector('[data-action="tm2:card-commit"]');
  if (!btn) return;
  btn.disabled = !!busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
}

// 운동 완료 — 실제 workouts에 저장 + 목표 달성 시 칸 색칠 (계약: 실제 운동기록 통합)
async function _commitWorkoutCard() {
  if (S.cardCommitting) return;
  const { bmId, weekStart, entryIdx } = S.card;
  const bm = benchmarkById(S.board, bmId);
  if (!bm) return;
  const entry = WS.workout.exercises?.[entryIdx];
  if (!entry) { _toast('운동 카드를 찾지 못했어요', 'error'); return; }
  _setCardCommitBusy(true);
  const track = bm.program === 'wendler' ? 'volume' : _entryBoardTrack(entry);
  const plan = _cellPlan(bm, track, weekStart);
  const sets = Array.isArray(entry.sets) ? entry.sets : [];

  try {
    // 1) 실제 운동기록(workouts)에 반영
    await _ensureTodayLoaded();
    // 채워진 세트(kg·reps>0)는 수행한 것으로 간주 — ✓ 체크를 강제하지 않음
    const filled = (s) => Number(s.kg) > 0 && Number(s.reps) > 0;
    const doneSets = sets.filter(filled).map(s => ({
      ...s,
      kg: Number(s.kg) || 0,
      reps: Math.round(Number(s.reps) || 0),
      rpe: s.rpe == null ? null : Math.max(1, Math.min(10, Number(s.rpe))),
      romPct: s.romPct == null ? 100 : Math.max(0, Math.min(100, Math.round(Number(s.romPct)))),
      setType: s.setType || 'main',
      done: true,
    }));
    if (!doneSets.length) { _toast('세트의 무게·횟수를 입력해 주세요', 'warning'); return; }
    WS.workout.exercises[entryIdx] = {
      ...entry,
      recommendationMeta: { ...(entry.recommendationMeta || {}), track: _trackToCode(track) },
      sets: doneSets,
    };
    try { await saveWorkoutDay({ silent: true }); }
    catch (e) {
      console.error('[tm2] saveWorkoutDay failed', e);
      _toast('운동기록 저장 실패 — 네트워크를 확인해 주세요', 'error');
      return;
    }

    // 2) 목표 달성 판정 → 색칠 or 조정 (채워진 본세트 기준)
    const working = doneSets.filter(s => s.setType !== 'warmup' && filled(s));
    const best = working.reduce((m, s) => (!m || Number(s.kg) > Number(m.kg) || (Number(s.kg) === Number(m.kg) && Number(s.reps) > Number(m.reps))) ? s : m, null);
    // 달성 판정은 '가장 무거운 세트' 하나가 아니라, 톱세트 목표(무게·횟수)를 함께 충족한
    // 본세트가 있는지로 본다. 원본 8/6/3 웬들러의 헤비싱글(톱세트보다 무겁고 1회)이
    // best가 되면 1회 < 목표횟수라 톱세트를 실제로 친 주도 미달로 처리되던 버그를 막는다.
    const hitSet = resolveTopSetHit(working, plan);
    const hit = !!hitSet;

    if (hit) {
      if (!_isCompletionStamped(bm, track, weekStart)) {
        const beforeBoard = JSON.parse(JSON.stringify(S.board));
        const ok = paintWeek(S.board, {
          benchmarkId: bmId, track, weekStart,
          log: { at: Date.now(), actualReps: working.map(s => s.reps).join(' · '), rir: hitSet.rir === '' ? null : hitSet.rir, amrapReps: hitSet.reps, note: '' },
        });
        if (!ok) { _toast('색칠할 칸을 찾지 못했어요', 'error'); return; }
        const saved = await _persistRequired('완료 도장 저장 실패 — 네트워크를 확인해 주세요');
        if (!saved) {
          S.board = beforeBoard;
          return;
        }
        // 저장된 보드 기준으로 홈스크린 시즌 위젯 스냅샷을 즉시 재동기화
        document.dispatchEvent(new CustomEvent('sheet:saved'));
      }
      closeSheet();
      renderBoard();
      _toast('성공! 칸을 색칠했어요 🟩 · 운동기록에 저장됨', 'success');
      return;
    }
    // 미달 — 운동기록은 저장됨. 웬들러는 기록만, stair는 조정 시트.
    if (bm.program === 'wendler') {
      const beforeBoard = JSON.parse(JSON.stringify(S.board));
      recordMiss(S.board, {
        benchmarkId: bmId,
        track,
        weekStart,
        choice: 'none',
        log: {
          at: Date.now(),
          attempted: working.length > 0,
          actualKg: best?.kg ?? null,
          actualReps: best ? String(best.reps) : '',
          amrapReps: best?.reps ?? null,
        },
      });
      const saved = await _persistRequired('웬들러 기록 저장 실패 — 네트워크를 확인해 주세요');
      if (!saved) {
        S.board = beforeBoard;
        return;
      }
      closeSheet(); renderBoard();
      _toast('운동기록 저장됨 — 목표 미달, 테두리로 표시돼요', 'info');
      return;
    }
    _toast('운동기록 저장됨 — 목표 미달, 계획을 조정할 수 있어요', 'info');
    S.sheet = {
      kind: 'cell',
      ctx: {
        bmId,
        track,
        weekStart,
        attempted: working.length > 0,
        actualKg: best?.kg ?? null,
        actualReps: best ? String(best.reps) : '',
        rir: best?.rir === '' ? '' : best?.rir ?? '',
        note: '',
      },
    };
    openMissSheet();
  } finally {
    _setCardCommitBusy(false);
  }
}

// 미래 칸 — 계획 미리보기 (탭 불가 처방만)
function _openPlanPreview(bm, track, wkMon) {
  const plan = _cellPlan(bm, track, wkMon);
  S.sheet = { kind: 'preview', ctx: {} };
  const seq = plan.kind === 'wendler'
    ? plan.rx.sets.map(s => `${s.kg}×${s.reps}${s.amrap ? '+' : ''}`).join(' → ')
    : `${plan.sets || trackSetsOf(bm, track)}세트 × ${plan.kg}kg × ${plan.reps}회`;
  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(_kickerOf(bm, wkMon))} · 예정</div>
    <div class="tm2-sh-title">${_esc(bm.label)} <small>${plan.kind === 'wendler' ? '웬들러' : TM2_TRACK_LABELS[track]}</small></div>
    <div class="tm2-rx"><span>계획</span><b>${plan.kg || '—'}</b><span>kg ×</span><b style="font-size:24px">${plan.reps || ''}</b><span>회${plan.amrap ? '+' : ''}</span></div>
    <div class="tm2-note">${_esc(seq)}</div>
    <div class="tm2-note">아직 미래 칸이에요 — 이번 주 칸부터 운동 카드로 기록해요.</div>
    <button class="tm2-btn-ghost" data-action="tm2:sheet-close">닫기</button>
  `);
}

function _actualWorkoutSummaryHtml(bm, wkMon) {
  let records = [];
  try { records = workoutRecordsForBenchmarkWeek(getCache() || {}, bm, wkMon); }
  catch { records = []; }
  if (!records.length) return '';
  const rows = records.map((record) => {
    const setLabel = record.sets
      .map(s => `${_fmtKg(s.kg)}kg×${s.reps}${s.romPct != null && s.romPct < 100 ? ` · ROM ${s.romPct}%` : ''}`)
      .join(' / ');
    return `<div class="tm2-std-row"><span class="tm2-ic">✓</span><div><b>${shortDate(record.dateKey)} ${_fmtKg(record.best?.kg)}kg × ${record.best?.reps || ''}</b><small>${_esc(setLabel)}</small></div></div>`;
  }).join('');
  return `<div class="tm2-note"><b>운동기록 있음</b> — 보드 색칠은 아직 안 된 주예요.</div><div class="tm2-std">${rows}</div>`;
}

function _addDaysKey(key, days) {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toKey(d);
}

async function _ensureWeekWorkoutCache(wkMon) {
  const keys = Array.from({ length: 7 }, (_, i) => _addDaysKey(wkMon, i));
  await Promise.all(keys.map(key => ensureWorkoutDayCached(key).catch(() => null)));
}

// 과거 칸 — 기록 요약 (읽기 전용)
async function _openPastSummary(bm, track, wkMon) {
  await _ensureWeekWorkoutCache(wkMon);
  S.sheet = { kind: 'past', ctx: {} };
  let painted = false, detail = '';
  if (bm.program === 'wendler') {
    const log = bm.wendlerLog?.[wkMon];
    painted = !!log?.paintedAt;
    detail = log?.amrapReps != null ? `한계 세트 ${log.amrapReps}회` : (log?.missed ? '목표 미달로 기록됨' : '');
  } else {
    const step = (S.board.steps || []).find(s => s.benchmarkId === bm.id && s.track === track && s.weekLog?.[wkMon]);
    const log = step?.weekLog?.[wkMon];
    painted = !!log?.paintedAt;
    detail = log?.actualReps ? `횟수 ${log.actualReps}` : (log?.missed ? '목표 미달로 조정됨' : '');
  }
  const actualHtml = !painted ? _actualWorkoutSummaryHtml(bm, wkMon) : '';
  const noteHtml = painted
    ? `<div class="tm2-note"><b>✓ 색칠 완료</b>${detail ? ` — ${_esc(detail)}` : ''}</div>`
    : (actualHtml || `<div class="tm2-note">${detail ? _esc(detail) : '이 주는 기록이 없어요.'}</div>`);
  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(_kickerOf(bm, wkMon))} · 지난 주</div>
    <div class="tm2-sh-title">${_esc(bm.label)} <small>${bm.program === 'wendler' ? '웬들러' : TM2_TRACK_LABELS[track]}</small></div>
    ${noteHtml}
    <button class="tm2-btn-ghost" data-action="tm2:sheet-close">닫기</button>
  `);
}

// ----------------------------------------------------------------
// 못 채운 날 — 계획 조정 (계약 5)
// ----------------------------------------------------------------

function openMissSheet() {
  const prev = S.sheet?.ctx || {};
  const { bmId, track, weekStart } = prev;
  const bm = benchmarkById(S.board, bmId);
  if (!bm) return;
  const domReps = _txt('tm2-in-reps');
  const domRir = _txt('tm2-in-rir');
  const domNote = _txt('tm2-in-note');
  S.sheet = {
    kind: 'miss',
    ctx: {
      bmId,
      track,
      weekStart,
      attempted: prev.attempted === true || domReps !== '',
      actualKg: prev.actualKg ?? null,
      actualReps: domReps !== '' ? domReps : (prev.actualReps ?? ''),
      rir: domRir !== '' ? domRir : (prev.rir ?? ''),
      note: domNote !== '' ? domNote : (prev.note ?? ''),
    },
  };
  S.missChoice = 'extend';
  _renderMissSheet();
}

function _renderMissSheet() {
  const { bmId, track, weekStart } = S.sheet.ctx;
  const bm = benchmarkById(S.board, bmId);
  const wkMon = mondayOf(weekStart);
  const cur = currentKgOf(S.board, bm, track);
  const delta = Math.min(2.5, bm.incrementKg) || 2.5;
  const choice = S.missChoice;
  const pv = previewAdjust(S.board, {
    benchmarkId: bmId, track, weekStart: wkMon, choice,
    params: { deltaKg: delta, reps: Math.max(1, cur.reps - 2) },
  }, _todayKey());
  const rowHtml = (r, missWeek) => {
    const range = r.span > 1 ? `${shortDate(r.weekStart)}~${shortDate(addWeeks(r.weekStart, r.span - 1))}` : shortDate(r.weekStart);
    const isMiss = weeksBetween(r.weekStart, missWeek) >= 0 && weeksBetween(r.weekStart, missWeek) < r.span && r.state === 'miss';
    return `<div class="tm2-pv-row ${isMiss ? 'tm2-pv-m' : 'tm2-pv-k'}">${r.kg}×${r.reps} — ${range}</div>`;
  };
  const opt = (key, title, desc, rec = false) => `
    <button class="tm2-opt ${choice === key ? 'tm2-on' : ''}" data-action="tm2:miss-choice" data-choice="${key}">
      <span class="tm2-radio"></span>
      <div><b>${title}${rec ? '<span class="tm2-rec">추천</span>' : ''}</b>${desc}</div>
    </button>`;
  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(_kickerOf(bm, wkMon))}</div>
    <div class="tm2-sh-title">오늘은 못 채웠어요 <small>${_esc(bm.label)} · ${TM2_TRACK_LABELS[track]}</small></div>
    ${opt('extend', '한 주 더 도전', `이 칸을 다음 주까지 이어가요. 뒤의 칸이 있으면 한 주씩 밀려요.`, true)}
    ${opt('lowerKg', `무게 한 칸 내리기 −${delta}kg`, `${Math.max(0, cur.kg - delta)}kg×${cur.reps}로 내려가서 다시 쌓아요.`)}
    ${opt('lowerReps', `목표 횟수 낮추기 ${cur.reps} → ${Math.max(1, cur.reps - 2)}`, `무게는 그대로, 이번 칸의 기준만 낮춰요.`)}
    <div class="tm2-preview">
      <div class="tm2-pv"><h5>지금 계획</h5>${pv.before.map(r => rowHtml(r, wkMon)).join('') || '<div class="tm2-pv-row tm2-pv-k">—</div>'}</div>
      <div class="tm2-pv-arrow">→</div>
      <div class="tm2-pv"><h5>조정 후</h5>${pv.after.map(r => rowHtml(r, '0000-00-00')).join('') || '<div class="tm2-pv-row tm2-pv-k">—</div>'}</div>
    </div>
    <button class="tm2-btn-primary" data-action="tm2:miss-apply">이렇게 바꿀게요</button>
    <button class="tm2-btn-ghost" data-action="tm2:sheet-close">취소</button>
  `);
}

async function _applyMiss() {
  const { bmId, track, weekStart, actualKg, actualReps, rir, note, attempted } = S.sheet.ctx;
  const bm = benchmarkById(S.board, bmId);
  const cur = currentKgOf(S.board, bm, track);
  const delta = Math.min(2.5, bm.incrementKg) || 2.5;
  recordMiss(S.board, {
    benchmarkId: bmId, track, weekStart: mondayOf(weekStart),
    choice: S.missChoice,
    params: { deltaKg: delta, reps: Math.max(1, cur.reps - 2) },
    log: { at: Date.now(), attempted: attempted === true, actualKg, actualReps, rir: rir === '' ? null : Number(rir), note },
  });
  await _persist();
  closeSheet();
  renderBoard();
  _toast('계획을 조정했어요 — 수행 칸은 테두리로 표시돼요', 'success');
}

// ----------------------------------------------------------------
// 정산 시트 (계약 6·7)
// ----------------------------------------------------------------

function openSettleSheet() {
  const rows = buildSettleRows(S.board, S.groupId);
  if (!rows.length) { _toast('정산할 종목이 없어요', 'info'); return; }
  S.settleDecisions = {};
  for (const r of rows) S.settleDecisions[r.key] = r.defaultDecision;
  S.sheet = { kind: 'settle', ctx: {} };
  _renderSettleSheet();
}

function _renderSettleSheet() {
  const cycle = activeCycleOf(S.board, S.groupId);
  const rows = buildSettleRows(S.board, S.groupId);
  const group = _boardGroups().find(g => g.id === S.groupId);
  const settledCnt = settledCyclesOf(S.board, S.groupId).length;
  const rowsHtml = rows.map(r => {
    const d = S.settleDecisions[r.key];
    const sub = r.missedCount > 0
      ? `<small class="tm2-warn">못 채운 주 ${r.missedCount}회 — 유지 권장</small>`
      : `<small>${cycle?.weeks || 6}주 진행 완료 ✓</small>`;
    const kg = d === 'grow'
      ? `${r.currentKg} → ${r.nextKg}<em>+${r.incrementKg}</em>`
      : `${r.currentKg} 유지`;
    return `
    <div class="tm2-settle-row">
      <div class="tm2-nm"><b>${_esc(r.label)} — ${r.trackLabel}${r.isTm ? ' (기준 무게)' : ''}</b>${sub}</div>
      <div class="tm2-kg">${kg}</div>
      <div class="tm2-seg2">
        <button class="${d === 'grow' ? 'tm2-on' : ''}" data-action="tm2:settle-decide" data-key="${_esc(r.key)}" data-decision="grow">성장</button>
        <button class="${d === 'hold' ? 'tm2-on tm2-hold' : ''}" data-action="tm2:settle-decide" data-key="${_esc(r.key)}" data-decision="hold">유지</button>
      </div>
    </div>`;
  }).join('');
  const nextStart = cycle ? addWeeks(cycle.startDate, cycle.weeks) : null;
  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(group?.label || '')} · ${cycle ? `${shortDate(cycle.startDate)} – ${shortDate(addWeeks(cycle.startDate, cycle.weeks - 1))}` : ''} 완료</div>
    <div class="tm2-sh-title">사이클 ${settledCnt + 1} 정산 — 다음 ${cycle?.weeks || 6}주를 결정</div>
    ${rowsHtml}
    <div class="tm2-note">올라가는 폭은 종목마다 정한 값 그대로예요. 못 채운 주가 있던 종목은 <b>유지가 기본</b> — 무리한 증량으로 실패를 쌓지 않아요.</div>
    <button class="tm2-btn-primary" data-action="tm2:settle-confirm">확정 — 다음 ${cycle?.weeks || 6}주${nextStart ? `(${shortDate(nextStart)}~)` : ''} 칸 채우기</button>
    <button class="tm2-btn-ghost" data-action="tm2:sheet-close">나중에 정산</button>
  `);
}

async function _confirmSettle() {
  const res = applySettle(S.board, S.groupId, S.settleDecisions, _todayKey(), Date.now());
  if (!res) { _toast('정산할 사이클이 없어요', 'error'); return; }
  await _persist();
  closeSheet();
  renderBoard();
  const grown = res.entry.results.filter(r => r.decision === 'grow').length;
  _toast(`정산 완료 — ${grown}개 종목 성장, 다음 ${res.nextCycle?.weeks || 6}주 칸을 채웠어요`, 'success');
}

// ----------------------------------------------------------------
// 종목 설정 시트 (계약 3·7·8·9)
// ----------------------------------------------------------------

function _formatCycleKg(kg) {
  const n = Number(kg);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, '')}kg`;
}

function _cycleWeekStateFromDate(weekStart, todayKey = _todayKey()) {
  const todayMon = mondayOf(todayKey);
  if (weekStart === todayMon) return 'now';
  return weeksBetween(weekStart, todayMon) > 0 ? 'past' : 'plan';
}

function _stairCycleItems(bm, track, cycle, todayKey) {
  const cells = bm.program === 'wendler' ? [] : expandColumnCells(S.board, bm.id, track, cycle.id, todayKey);
  const fallback = currentKgOf(S.board, bm, track);
  return _weekRange(cycle.startDate, cycle.weeks).map((weekStart, idx) => {
    const cell = _cellAtWeek(cells, weekStart);
    const hasPlan = cell && cell.kind !== 'rest';
    const state = hasPlan ? _cellStateAtWeek(cell, weekStart) : _cycleWeekStateFromDate(weekStart, todayKey);
    const kg = hasPlan && Number(cell.kg) > 0 ? cell.kg : fallback.kg;
    const reps = hasPlan ? cell.reps : fallback.reps;
    return {
      week: idx + 1,
      weekStart,
      state,
      kgLabel: _formatCycleKg(kg),
      repsLabel: reps ? `x${reps}` : '',
    };
  });
}

function _wendlerCycleItems(bm, cycle, config, todayKey) {
  const actualCells = bm.program === 'wendler' ? expandColumnCells(S.board, bm.id, 'volume', cycle.id, todayKey) : [];
  return _weekRange(cycle.startDate, cycle.weeks).map((weekStart, idx) => {
    const week = idx + 1;
    const rx = wendlerWeekPrescription(config, week);
    const top = rx.topSet || {};
    const actual = _cellAtWeek(actualCells, weekStart);
    return {
      week,
      weekStart,
      state: actual ? _cellStateAtWeek(actual, weekStart) : _cycleWeekStateFromDate(weekStart, todayKey),
      kgLabel: _formatCycleKg(top.kg),
      repsLabel: top.reps ? `x${top.reps}${top.amrap ? '+' : ''}` : '',
    };
  });
}

function _renderCycleTrack(row) {
  const items = row.items || [];
  const body = items.map((item, idx) => {
    const connector = idx < items.length - 1
      ? `<span class="tm2-col-cycle-line"><b>${_esc(item.kgLabel)}</b></span>`
      : '';
    return `
      <span class="tm2-col-cycle-point is-${_esc(item.state)}">
        <b>${item.week}주</b>
        <small>${_esc(item.repsLabel || item.kgLabel)}</small>
      </span>
      ${connector}`;
  }).join('');
  return `
    <div class="tm2-col-cycle-row is-${_esc(row.kind)}">
      <div class="tm2-col-cycle-row-head">
        <b>${_esc(row.label)}</b>
        <span>${_esc(row.detail)}</span>
      </div>
      <div class="tm2-col-cycle-track" aria-label="${_esc(`${row.label} 6주 사이클`)}">${body}</div>
    </div>`;
}

function _cycleRailTracksForBenchmark(bm, ctx) {
  const tracks = new Set([
    ...(Array.isArray(bm.tracks) ? bm.tracks : []),
    ...(Array.isArray(ctx.tracks) ? ctx.tracks : []),
  ]);
  return ['volume', 'intensity'].filter(track => tracks.has(track) || bm.seed?.[track]);
}

function _renderColumnCycleRail(bm, ctx, wendlerConfig) {
  const cycle = activeCycleOf(S.board, bm.groupId);
  if (!cycle) return '';
  const todayKey = _todayKey();
  const rows = [];
  if (wendlerConfig) {
    rows.push({
      kind: 'wendler',
      label: '웬들러',
      detail: `${WENDLER_SCHEMES[ctx.scheme]?.label || '커스텀'} · ${wendlerConfig?.templateVersion === W863_ORIGINAL_VERSION ? '1RM' : 'TM'} ${_formatCycleKg(wendlerConfig?.templateVersion === W863_ORIGINAL_VERSION ? wendlerConfig?.oneRmKg : wendlerConfig?.tmKg)}`,
      items: _wendlerCycleItems(bm, cycle, wendlerConfig, todayKey),
    });
  }
  for (const track of _cycleRailTracksForBenchmark(bm, ctx)) {
    rows.push({
      kind: track === 'intensity' ? 'intensity' : 'volume',
      label: TM2_TRACK_LABELS[track] || '볼륨',
      detail: '기본 계단',
      items: _stairCycleItems(bm, track, cycle, todayKey),
    });
  }
  if (!rows.length) return '';
  const range = `${shortDate(cycle.startDate)} - ${shortDate(addWeeks(cycle.startDate, cycle.weeks - 1))}`;
  return `
    <div class="tm2-col-cycle" data-tm2-col-cycle>
      <div class="tm2-col-cycle-head">
        <b>현재 사이클</b>
        <small>${_esc(range)}</small>
      </div>
      ${rows.map(_renderCycleTrack).join('')}
    </div>`;
}

function openColumnSheet(bmId) {
  const bm = benchmarkById(S.board, bmId);
  if (!bm) return;
  S.sheet = {
    kind: 'column',
    ctx: {
      bmId,
      tracks: [...bm.tracks],
      program: bm.program,
      scheme: bm.wendler?.scheme || 'w863',
      suppKind: bm.wendler?.supplemental?.kind || 'bbb',
    },
  };
  _renderColumnSheet();
}

function _renderColumnSheet() {
  const ctx = S.sheet.ctx;
  const bm = benchmarkById(S.board, ctx.bmId);
  const group = _boardGroups().find(g => g.id === bm.groupId);
  const wendlerMajor = bm.groupId === 'lower' ? 'lower' : (bm.groupId === 'glute' ? 'glute' : bm.groupId);
  const wendlerAllowed = isWendlerAllowedMajor(wendlerMajor);
  const isWnd = ctx.program === 'wendler';
  const isOriginal = isWnd && ctx.scheme === 'w863';
  const trackBtn = (t) => `<button class="${!isWnd && ctx.tracks.includes(t) ? 'tm2-on' : ''}" data-action="tm2:col-track" data-track="${t}">${TM2_TRACK_LABELS[t]}</button>`;
  const programBtn = wendlerAllowed
    ? `<button class="${isWnd ? 'tm2-on ' : ''}tm2-program-wendler" data-action="tm2:col-program" data-program="wendler">웬들러</button>`
    : '';
  const w = wendlerAllowed ? normalizeWendlerConfig({ ...(bm.wendler || {}), scheme: ctx.scheme, supplemental: { ...(bm.wendler?.supplemental || {}), kind: ctx.suppKind } }, {
    primaryMajor: wendlerMajor,
    movementId: bm.movementId,
    exerciseId: bm.exerciseId,
    label: bm.label,
  }) : null;
  const wendlerSchemeLabel = WENDLER_SCHEMES[ctx.scheme]?.label || '커스텀';
  const wendlerSuppLabel = ctx.suppKind === 'bbb' ? 'BBB' : ctx.suppKind === 'fsl' ? 'FSL' : '보조 없음';
  const overview = isWnd ? wendlerCycleOverview(w) : [];
  const wkRows = isWnd ? `
    <div class="tm2-wmap">
      ${isOriginal
        ? overview.map(o => `<b>${o.week}주차</b> <em>${o.deload ? '회복' : `${o.pctLabel}%`}</em> × ${o.repsLabel}`).join('<br>')
        : overview.slice(0, 3).map(o => `<b>${o.week}·${o.week + 3}주차</b> <em>${o.pctLabel}%</em> × ${o.repsLabel}`).join('<br>')}
    </div>` : '';
  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(group?.label || '')} · 종목 설정</div>
    <div class="tm2-sh-title">${_esc(bm.label)}</div>
    <div class="tm2-fld tm2-track-program-row"><span class="tm2-lb">트랙 구성<small>볼륨/강도는 기본 계단</small></span><span class="tm2-track-toggle">${trackBtn('volume')}${trackBtn('intensity')}${programBtn}</span></div>
    ${!isWnd ? `
    <div class="tm2-fld"><span class="tm2-lb">세트 수<small>셀에는 무게×횟수만 보여요</small></span><input type="number" id="tm2-col-sets" value="${bm.setsDefault || 4}" min="1" max="10"></div>
    <div class="tm2-fld"><span class="tm2-lb">6주 성공 시 증량<small>정산 때 "성장"이면 이만큼 (${group?.bodyRegion === 'lower' ? '하체' : '상체'} 기본 +${defaultIncrementForGroup(bm.groupId)}kg)</small></span><input type="number" id="tm2-col-inc" value="${bm.incrementKg}" step="0.5" min="0.5"></div>` : ''}
    ${isWnd ? `
    <div class="tm2-wbox">
      ${isOriginal ? `<div class="tm2-fld" style="border:0;padding:2px 0"><span class="tm2-lb">원본 프로필<small>표의 기준 1RM</small></span><select id="tm2-col-profile">${Object.values(W863_ORIGINAL_PROFILES).map(profile => `<option value="${profile.id}" ${profile.id === w.profileId ? 'selected' : ''}>${_esc(profile.label)} · ${profile.reference1RmKg}kg</option>`).join('')}</select></div>
      <div class="tm2-fld" style="border:0;padding:2px 0"><span class="tm2-lb">현재 1RM<small>원본 표 비례 기준</small></span><input type="number" id="tm2-col-one-rm" value="${w.oneRmKg || ''}" step="0.5" min="0" placeholder="kg"></div>` : `<div class="tm2-fld" style="border:0;padding:2px 0"><span class="tm2-lb">기준 무게 (TM)</span><input type="number" id="tm2-col-tm" value="${bm.wendler?.tmKg || ''}" step="2.5" min="0" placeholder="kg"></div>`}
      <div class="tm2-fld" style="border:0;padding:2px 0"><span class="tm2-lb">사이클 증량<small>${isOriginal ? 'W7 완료 뒤 1RM' : '정산 뒤 TM'} 증가</small></span><input type="number" id="tm2-col-inc" value="${w.incrementKg}" step="0.5" min="0.5"></div>
      <div class="tm2-fld" style="border:0;padding:2px 0"><span class="tm2-lb">라운딩<small>%환산 후 반올림 단위</small></span><input type="number" id="tm2-col-round" value="${bm.wendler?.roundKg ?? 2.5}" step="0.5" min="0.5"></div>
      <div class="tm2-wk-tabs">
        ${['w531', 'w863'].map(s => `<button class="${ctx.scheme === s ? 'tm2-on' : ''}" data-action="tm2:col-scheme" data-scheme="${s}">${WENDLER_SCHEMES[s].label}</button>`).join('')}
        <button class="${ctx.scheme === 'custom' ? 'tm2-on' : ''}" data-action="tm2:col-scheme" data-scheme="custom">커스텀</button>
      </div>
      ${ctx.scheme === 'custom'
        ? `<div class="tm2-wmap">커스텀: 주차표 % 직접 입력 (콤마 구분)</div>
           ${[0, 1, 2].map(i => `<div class="tm2-fld" style="border:0;padding:3px 0"><span class="tm2-lb">${i + 1}·${i + 4}주차 %</span><input type="text" id="tm2-col-wk${i}" value="${(bm.wendler?.weekMap?.[i]?.sets || []).map(s => s.pct).join(',') || ''}" placeholder="60,65,70"></div>
           <div class="tm2-fld" style="border:0;padding:3px 0"><span class="tm2-lb">${i + 1}·${i + 4}주차 횟수</span><input type="text" id="tm2-col-wr${i}" value="${(bm.wendler?.weekMap?.[i]?.sets || []).map(s => s.reps).join(',') || ''}" placeholder="8,8,8"></div>`).join('')}`
        : wkRows}
      ${isOriginal ? `<div class="tm2-note">W1–6: 워밍업 · 메인 AMRAP · 싱글 · 백오프 / W7: 회복. 기준 1RM 초과 싱글은 당일 확인 후 추가됩니다.</div>` : `<div class="tm2-fld" style="border:0;padding:6px 0 0"><span class="tm2-lb">보조<small>메인 직후 같은 세션에서</small></span>
        <span class="tm2-seg2">
          ${['bbb', 'fsl', 'none'].map(k => `<button class="${ctx.suppKind === k ? 'tm2-on' : ''}" data-action="tm2:col-supp" data-supp="${k}">${k === 'bbb' ? 'BBB' : k === 'fsl' ? 'FSL' : '없음'}</button>`).join('')}
        </span>
      </div>
      ${ctx.suppKind !== 'none' ? `
      <div class="tm2-fld" style="border:0;padding:3px 0"><span class="tm2-lb">보조 %TM · 세트 · 횟수</span>
        <span style="display:flex;gap:5px">
          <input type="number" id="tm2-col-supp-pct" value="${bm.wendler?.supplemental?.pct ?? 50}" style="max-width:58px" min="10">
          <input type="number" id="tm2-col-supp-sets" value="${bm.wendler?.supplemental?.sets ?? 5}" style="max-width:48px" min="1">
          <input type="number" id="tm2-col-supp-reps" value="${bm.wendler?.supplemental?.reps ?? 10}" style="max-width:48px" min="1">
        </span>
      </div>` : ''}`}
    </div>` : ''}
    <div class="tm2-fld"><span class="tm2-lb">여유 횟수 (RIR)<small>세트 끝에 남길 횟수</small></span><input type="number" id="tm2-col-rir" value="${bm.meta?.rirTarget ?? 2}" min="0" max="5"></div>
    ${_renderColumnCycleRail(bm, ctx, w)}
    <button class="tm2-btn-primary" data-action="tm2:col-save">저장</button>
    <button class="tm2-btn-ghost" data-action="tm2:sheet-close">취소</button>
  `);
}

async function _saveColumnSheet() {
  const ctx = S.sheet.ctx;
  const bm = benchmarkById(S.board, ctx.bmId);
  if (!bm) return;
  if (ctx.program !== 'wendler' && !ctx.tracks.length) { _toast('트랙은 최소 1개 필요해요 (볼륨 또는 강도)', 'warning'); return; }

  const prevTracks = [...bm.tracks];
  bm.tracks = ctx.program === 'wendler'
    ? (ctx.tracks.length ? ['volume', 'intensity'].filter(t => ctx.tracks.includes(t)) : ['volume'])
    : ['volume', 'intensity'].filter(t => ctx.tracks.includes(t));
  const setsEl = document.getElementById('tm2-col-sets');
  if (setsEl) bm.setsDefault = Math.max(1, Math.round(_num('tm2-col-sets', bm.setsDefault || 4)));
  const incFallback = ctx.program === 'wendler'
    ? (bm.wendler?.incrementKg ?? defaultIncrementForGroup(bm.groupId))
    : bm.incrementKg;
  const inc = _num('tm2-col-inc', incFallback);
  bm.incrementKg = inc;
  bm.meta = bm.meta || {};
  const rirEl = document.getElementById('tm2-col-rir');
  bm.meta.rirTarget = rirEl && rirEl.value !== '' ? Math.max(0, Math.round(Number(rirEl.value))) : null;
  const formEl = document.getElementById('tm2-col-form');
  const gymEl = document.getElementById('tm2-col-gym');
  if (formEl) bm.meta.formNote = _txt('tm2-col-form');
  if (gymEl) bm.meta.gymNote = _txt('tm2-col-gym');

  const wasWendler = bm.program === 'wendler';
  bm.program = ctx.program;
  if (bm.program === 'wendler') {
    const major = bm.groupId === 'lower' ? 'lower' : (bm.groupId === 'glute' ? 'glute' : bm.groupId);
    let weekMap = bm.wendler?.weekMap || null;
    let scheme = ctx.scheme;
    if (ctx.scheme === 'custom') {
      const parsed = [];
      for (let i = 0; i < 3; i++) {
        const pcts = _txt(`tm2-col-wk${i}`).split(',').map(Number).filter(n => n > 0);
        const reps = _txt(`tm2-col-wr${i}`).split(',').map(Number).filter(n => n > 0);
        if (pcts.length) {
          parsed.push({ sets: pcts.map((p, j) => ({ pct: p, reps: reps[j] || reps[reps.length - 1] || 5, ...(j === pcts.length - 1 ? { amrap: true } : {}) })) });
        }
      }
      if (parsed.length === 3) weekMap = [...parsed, ...parsed.map(w => ({ sets: w.sets.map(s => ({ ...s })) }))];
    } else {
      weekMap = null; // 프리셋으로 리셋
    }
    bm.wendler = normalizeWendlerConfig({
      ...(bm.wendler || {}),
      scheme,
      weekMap,
      tmKg: _num('tm2-col-tm', bm.wendler?.tmKg || 0) || undefined,
      oneRmKg: _num('tm2-col-one-rm', bm.wendler?.oneRmKg || 0) || undefined,
      profileId: document.getElementById('tm2-col-profile')?.value || bm.wendler?.profileId || inferW863Profile(bm),
      roundKg: _num('tm2-col-round', bm.wendler?.roundKg || 2.5),
      incrementKg: inc,
      supplemental: {
        kind: ctx.suppKind,
        pct: _num('tm2-col-supp-pct', bm.wendler?.supplemental?.pct ?? 50),
        sets: _num('tm2-col-supp-sets', bm.wendler?.supplemental?.sets ?? 5),
        reps: _num('tm2-col-supp-reps', bm.wendler?.supplemental?.reps ?? 10),
      },
    }, {
      primaryMajor: major,
      trackSpec: bm.seed?.volume ? { startKg: bm.seed.volume.kg, startReps: bm.seed.volume.reps } : null,
      movementId: bm.movementId,
      exerciseId: bm.exerciseId,
      label: bm.label,
    });
    bm.wendlerLog = bm.wendlerLog || {};
    // 웬들러 전환 시 이 사이클의 stair 스텝 제거 (파생 처방으로 대체)
    const cycle = activeCycleOf(S.board, bm.groupId);
    if (cycle) {
      if (bm.wendler.templateVersion === W863_ORIGINAL_VERSION) cycle.weeks = Math.max(7, cycle.weeks || 0);
      S.board.steps = S.board.steps.filter(s => !(s.benchmarkId === bm.id && s.cycleId === cycle.id));
    }
  } else if (wasWendler) {
    // 기본 계단으로 복귀 — 활성 사이클에 스텝 재생성
    const cycle = activeCycleOf(S.board, bm.groupId);
    if (cycle) {
      for (const t of bm.tracks) {
        const exists = S.board.steps.some(s => s.benchmarkId === bm.id && s.track === t && s.cycleId === cycle.id);
        if (!exists) {
          const seed = currentKgOf(S.board, bm, t);
          S.board.steps.push({
            id: `st_${Date.now().toString(36)}_${t}`, benchmarkId: bm.id, track: t, cycleId: cycle.id,
            weekStart: cycle.startDate, span: cycle.weeks, kg: seed.kg, reps: seed.reps, state: 'planned', weekLog: {},
          });
        }
      }
    }
  }
  // 트랙 추가 시 활성 사이클에 스텝 생성
  if (bm.program !== 'wendler') {
    const cycle = activeCycleOf(S.board, bm.groupId);
    if (cycle) {
      for (const t of bm.tracks) {
        if (prevTracks.includes(t)) continue;
        bm.seed[t] = bm.seed[t] || { kg: 0, reps: t === 'intensity' ? 8 : 12 };
        const exists = S.board.steps.some(s => s.benchmarkId === bm.id && s.track === t && s.cycleId === cycle.id);
        if (!exists) {
          S.board.steps.push({
            id: `st_${Date.now().toString(36)}_${t}2`, benchmarkId: bm.id, track: t, cycleId: cycle.id,
            weekStart: mondayOf(_todayKey()), span: Math.max(1, cycle.weeks - weeksBetween(cycle.startDate, mondayOf(_todayKey()))),
            kg: bm.seed[t].kg, reps: bm.seed[t].reps, state: 'planned', weekLog: {},
          });
        }
      }
    }
  }

  await _persist();
  closeSheet();
  if (S.settingsOnly) {
    S.settingsOnly = false;
    document.dispatchEvent(new CustomEvent('sheet:saved'));
    _toast('종목 설정을 저장했어요', 'success');
    return;
  }
  renderBoard();
  _toast('종목 설정을 저장했어요', 'success');
}

// ----------------------------------------------------------------
// 날짜별 운동 추가 시트 (계약 13)
// ----------------------------------------------------------------

const _candidateKey = (x) => x.exerciseId || x.movementId || '';

function _lineupTracksOf(bm) {
  return bm.program === 'wendler' ? ['volume'] : (bm.tracks?.length ? bm.tracks : ['volume']);
}

function _lineupTrackLabel(bm, track) {
  if (bm.program === 'wendler') return `웬들러 · ${WENDLER_SCHEMES[bm.wendler?.scheme]?.label || '커스텀'}`;
  return TM2_TRACK_LABELS[track] || '볼륨';
}

function _isCurrentLineupCtx(ctx = S.sheet?.ctx) {
  return !!ctx && ctx.weekStart === mondayOf(_todayKey()) && ctx.dateKey === _todayKey();
}

function openLineupSheet(weekStart, dateKey) {
  S.sheet = { kind: 'lineup', ctx: { weekStart: mondayOf(weekStart), dateKey, adding: null } };
  _startGrowthBoardTimerForDate(dateKey);
  _renderLineupSheet();
}

function _renderLineupSheet() {
  const ctx = S.sheet?.ctx || {};
  const group = _boardGroups().find(g => g.id === S.groupId);
  const dateKey = ctx.dateKey || _todayKey();
  const weekStart = ctx.weekStart || mondayOf(dateKey);
  const lineup = _lineupForGroup(dateKey);
  const isCurrent = _isCurrentLineupCtx(ctx);
  const selectedRows = lineup.map((item, idx) => {
    const bm = benchmarkById(S.board, item.benchmarkId);
    if (!bm) return '';
    return `
      <div class="tm2-mg-row tm2-lineup-selected-row">
        <span class="tm2-lineup-order">${idx + 1}</span>
        <b>${_esc(bm.label)}</b>
        <small>${_esc(_lineupTrackLabel(bm, item.track || 'volume'))}</small>
      </div>`;
  }).join('') || '<div class="tm2-mg-row"><small>아직 담은 운동이 없어요</small></div>';

  const activeRows = activeBenchmarks(S.board, S.groupId).flatMap(bm =>
    _lineupTracksOf(bm).map(track => {
      const picked = _lineupHas(dateKey, bm.id, track);
      const order = getLineup(S.board, dateKey).find(x => x.benchmarkId === bm.id && x.track === track)?.order;
      return `
        <div class="tm2-mg-row tm2-lineup-row${picked ? ' is-selected' : ''}">
          <span class="tm2-lineup-order">${picked ? (Number(order) + 1) : ''}</span>
          <b>${_esc(bm.label)}</b>
          <span class="tm2-tk ${track === 'intensity' ? 'tm2-tk-h' : bm.program === 'wendler' ? 'tm2-tk-w' : ''}">${_esc(_lineupTrackLabel(bm, track))}</span>
          <button class="${picked ? 'tm2-mg-out' : 'tm2-mg-in'}" data-action="tm2:lineup-toggle" data-bm="${bm.id}" data-track="${track}">${picked ? '빼기' : '담기'}</button>
        </div>`;
    })
  ).join('') || '<div class="tm2-mg-row"><small>이 그룹에 담을 종목이 없어요</small></div>';

  const actives = activeBenchmarks(S.board, S.groupId);
  const activeKeys = new Set(actives.map(_candidateKey));
  const archivedKeys = new Set((S.board.benchmarks || []).filter(b => b.status === 'archived').map(_candidateKey));
  const adding = ctx.adding;
  const libRows = _candidates(S.groupId).filter(c => !activeKeys.has(_candidateKey(c))).slice(0, 16).map(c => {
    const key = _candidateKey(c);
    const knownKg = Number(c.tracks?.volume?.kg) || 0;
    const knownReps = Number(c.tracks?.volume?.reps) || 12;
    const known = knownKg > 0 && !c.tracks?.volume?.manual ? `${knownKg}kg×${knownReps}` : null;
    const wasHere = archivedKeys.has(key);
    const gym = c.gymNote ? ` · ${_esc(c.gymNote)}` : '';
    if (adding === key) {
      return `
        <div class="tm2-mg-row tm2-lineup-row is-editing">
          <span class="tm2-lineup-order"></span>
          <b>${_esc(c.label)}</b>
          <span class="tm2-ob-weight"><input id="tm2-lineup-add-kg" inputmode="decimal" value="${knownKg || ''}" placeholder="kg"><i>kg ×</i><input id="tm2-lineup-add-reps" inputmode="numeric" value="${knownReps}" style="width:44px"><i>회</i></span>
          <button class="tm2-mg-in" data-action="tm2:lineup-add-confirm" data-cand="${_esc(key)}">담기</button>
        </div>`;
    }
    return `
      <div class="tm2-mg-row tm2-lineup-row">
        <span class="tm2-lineup-order"></span>
        <b>${_esc(c.label)}</b>
        <small>${wasHere ? '기록 있음 — 이어서 시작' : known ? `최근 ${known}${gym}` : `시작 무게 필요${gym}`}</small>
        <button class="tm2-mg-in" data-action="tm2:lineup-add" data-cand="${_esc(key)}">＋ 담기</button>
      </div>`;
  }).join('') || '<div class="tm2-mg-row"><small>추가할 수 있는 라이브러리 종목이 없어요</small></div>';

  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(group?.label || '')} · ${_esc(shortDate(dateKey))}${isCurrent ? ' · 오늘' : ''}</div>
    <div class="tm2-sh-title">그 날 할 운동 추가</div>
    <div class="tm2-sec-label">담긴 운동</div>
    <div class="tm2-std tm2-lineup-std">${selectedRows}</div>
    <div class="tm2-note">${isCurrent ? '담으면 오늘 운동 탭에도 같은 운동 카드가 추가돼요.' : `${shortDate(weekStart)} 주차의 배열로 저장돼요.`}</div>
    <div class="tm2-sec-label">보드 종목에서 담기</div>
    <div class="tm2-std tm2-lineup-std">${activeRows}</div>
    <div class="tm2-sec-label">운동 라이브러리에서 새 종목</div>
    <div class="tm2-std tm2-lineup-std">${libRows}</div>
    <button class="tm2-btn-primary" data-action="tm2:sheet-close">완료</button>
  `);
}

async function _saveCurrentWorkoutFromLineup(bm, track, override = null) {
  await _ensureTodayLoaded();
  _upsertWorkoutEntryForBenchmark(bm, track, mondayOf(_todayKey()), override);
  await saveWorkoutDay({ silent: true });
}

async function _toggleLineupSelection(bmId, track) {
  const ctx = S.sheet?.ctx;
  const bm = benchmarkById(S.board, bmId);
  if (!ctx || !bm) return;
  const wasPicked = _lineupHas(ctx.dateKey, bm.id, track);
  toggleLineup(S.board, ctx.dateKey, bm.id, track);
  if (!wasPicked) _markGrowthBoardExerciseAddedForDate(ctx.dateKey);
  let workoutSaved = false;
  let workoutFailed = false;
  if (!wasPicked && _isCurrentLineupCtx(ctx)) {
    try {
      await _saveCurrentWorkoutFromLineup(bm, track);
      workoutSaved = true;
    } catch (e) {
      workoutFailed = true;
      console.error('[tm2] lineup workout save failed', e);
    }
  }
  await _persist();
  _renderLineupSheet();
  renderBoard();
  if (workoutFailed) {
    _toast('라인업은 저장됐지만 운동기록 저장에 실패했어요', 'error');
  } else if (wasPicked) {
    _toast('그 날 배열에서 뺐어요 — 기존 운동기록은 보존돼요', 'info');
  } else {
    _toast(workoutSaved ? '그 날 배열과 오늘 운동에 담았어요' : '그 날 배열에 담았어요', 'success');
  }
}

async function _confirmLineupAddCandidate(candKeyVal) {
  const ctx = S.sheet?.ctx;
  if (!ctx) return;
  const c = _candidates(S.groupId).find(x => _candidateKey(x) === candKeyVal);
  if (!c) return;
  const kg = _num('tm2-lineup-add-kg', 0);
  const reps = Math.max(1, Math.round(_num('tm2-lineup-add-reps', 12)));
  const archived = (S.board.benchmarks || []).find(b => b.status === 'archived' && _candidateKey(b) === candKeyVal && b.groupId === S.groupId);
  if (!archived && kg <= 0) { _toast('시작 무게를 입력해 주세요', 'warning'); return; }
  const bm = addBenchmark(S.board, {
    ...c,
    tracks: { volume: { kg, reps }, intensity: null },
  }, _todayKey());
  if (!_lineupHas(ctx.dateKey, bm.id, 'volume')) toggleLineup(S.board, ctx.dateKey, bm.id, 'volume');
  _markGrowthBoardExerciseAddedForDate(ctx.dateKey);

  let workoutSaved = false;
  let workoutFailed = false;
  if (_isCurrentLineupCtx(ctx)) {
    const cur = currentKgOf(S.board, bm, 'volume');
    const override = _manualLineupPrescription(bm, 'volume', kg > 0 ? kg : cur.kg, reps || cur.reps || 12);
    try {
      await _saveCurrentWorkoutFromLineup(bm, 'volume', override);
      workoutSaved = true;
    } catch (e) {
      workoutFailed = true;
      console.error('[tm2] lineup new workout save failed', e);
    }
  }

  await _persist();
  S.sheet.ctx.adding = null;
  _renderLineupSheet();
  renderBoard();
  if (workoutFailed) _toast(`${c.label} 라인업 저장됨 — 운동기록 저장 실패`, 'error');
  else _toast(workoutSaved ? `${c.label} 담김 — 오늘 운동에도 추가됨` : `${c.label} 담김`, 'success');
}

// ----------------------------------------------------------------
// 종목 관리 시트 (계약 12)
// ----------------------------------------------------------------

function openManageSheet() {
  S.sheet = { kind: 'manage', ctx: { adding: null } };
  _renderManageSheet();
}

function _renderManageSheet() {
  const group = _boardGroups().find(g => g.id === S.groupId);
  const actives = activeBenchmarks(S.board, S.groupId);
  const activeRows = actives.map(bm => `
    <div class="tm2-mg-row">
      <b>${_esc(bm.label)}</b>
      ${bm.program === 'wendler'
        ? `<span class="tm2-tk tm2-tk-w">웬들러</span>`
        : bm.tracks.map(t => `<span class="tm2-tk ${t === 'intensity' ? 'tm2-tk-h' : ''}">${TM2_TRACK_LABELS[t]}</span>`).join('')}
      <button class="tm2-mg-out" data-action="tm2:manage-archive" data-bm="${bm.id}">메뉴에서 빼기</button>
    </div>`).join('') || '<div class="tm2-mg-row"><small>아직 종목이 없어요</small></div>';

  const candKey = (x) => x.exerciseId || x.movementId || '';
  const activeKeys = new Set(actives.map(candKey));
  const candidates = _candidates(S.groupId).filter(c => !activeKeys.has(candKey(c)));
  const archivedKeys = new Set((S.board.benchmarks || []).filter(b => b.status === 'archived').map(candKey));
  const adding = S.sheet.ctx.adding;
  const libRows = candidates.slice(0, 16).map(c => {
    const key = candKey(c);
    const wasHere = archivedKeys.has(key);
    const known = c.tracks.volume && !c.tracks.volume.manual ? `${c.tracks.volume.kg}kg×${c.tracks.volume.reps}` : null;
    const gym = c.gymNote ? ` · ${_esc(c.gymNote)}` : '';
    if (adding === key) {
      return `
      <div class="tm2-mg-row">
        <b>${_esc(c.label)}</b>
        <span class="tm2-ob-weight"><input id="tm2-add-kg" inputmode="decimal" value="${known ? c.tracks.volume.kg : ''}" placeholder="kg"><i>kg ×</i><input id="tm2-add-reps" inputmode="numeric" value="${c.tracks.volume?.reps || 12}" style="width:44px"><i>회</i></span>
        <button class="tm2-mg-in" data-action="tm2:manage-add-confirm" data-cand="${_esc(key)}">확인</button>
      </div>`;
    }
    return `
    <div class="tm2-mg-row">
      <b>${_esc(c.label)}</b>
      <small>${wasHere ? '기록 있음 — 이어서 시작' : known ? `최근 ${known}${gym}` : `기록 없음${gym}`}</small>
      <button class="tm2-mg-in" data-action="tm2:manage-add" data-cand="${_esc(key)}">＋ 추가</button>
    </div>`;
  }).join('') || '<div class="tm2-mg-row"><small>추가할 수 있는 종목이 없어요</small></div>';

  _openSheet(`
    <div class="tm2-grab"></div>
    <div class="tm2-sh-kicker">${_esc(group?.label || '')} 그룹</div>
    <div class="tm2-sh-title">종목 관리</div>
    <div class="tm2-sec-label">지금 메뉴에 있는 종목</div>
    <div class="tm2-std" style="padding:2px 13px">${activeRows}</div>
    <div class="tm2-note">메뉴에서 빼도 <b>색칠 기록은 그대로 남아요.</b> 다시 추가하면 마지막 무게에서 이어서 시작해요.</div>
    <div class="tm2-sec-label">종목 추가 — 운동 라이브러리</div>
    <div class="tm2-std" style="padding:2px 13px">${libRows}</div>
    <button class="tm2-btn-primary" data-action="tm2:sheet-close">완료</button>
  `);
}

async function _confirmAdd(candKeyVal) {
  const c = _candidates(S.groupId).find(x => (x.exerciseId || x.movementId) === candKeyVal);
  if (!c) return;
  const kg = _num('tm2-add-kg', 0);
  const reps = Math.max(1, Math.round(_num('tm2-add-reps', 12)));
  const archived = (S.board.benchmarks || []).find(b => b.status === 'archived' && (b.exerciseId || b.movementId) === candKeyVal && b.groupId === S.groupId);
  if (!archived && kg <= 0) { _toast('시작 무게를 입력해 주세요', 'warning'); return; }
  addBenchmark(S.board, {
    ...c,
    tracks: { volume: { kg, reps }, intensity: null },
  }, _todayKey());
  await _persist();
  S.sheet.ctx.adding = null;
  _renderManageSheet();
  renderBoard();
  _toast(`${c.label} 추가 — 다음 주부터 칸이 계획돼요`, 'success');
}

// ----------------------------------------------------------------
// 셀 탭 — 현재 주차는 운동 카드, 과거/미래는 요약/미리보기
// ----------------------------------------------------------------

async function _onCellTap(d) {
  const { bm: bmId, track, week, current } = d;
  const bm = benchmarkById(S.board, bmId);
  if (!bm) return;
  const todayKey = _todayKey();
  const wkMon = mondayOf(week);
  const isFutureWeek = weeksBetween(mondayOf(todayKey), wkMon) > 0;

  if (current === '1') {
    _startGrowthBoardTimerForDate(todayKey);
    await openCellSheet(bmId, track, wkMon);
    return;
  }
  if (isFutureWeek) {
    _openPlanPreview(bm, track, wkMon);
    return;
  }
  await openCellSheet(bmId, track, wkMon);
}

async function _paintCurrent() {
  const { bmId, track, weekStart } = S.sheet.ctx;
  const bm = benchmarkById(S.board, bmId);
  if (!bm) return;
  const log = {
    at: Date.now(),
    actualReps: _txt('tm2-in-reps') || null,
    rir: _txt('tm2-in-rir') === '' ? null : Number(_txt('tm2-in-rir')),
    note: _txt('tm2-in-note'),
    amrapReps: _txt('tm2-in-amrap') === '' ? null : Number(_txt('tm2-in-amrap')),
  };
  const beforeBoard = JSON.parse(JSON.stringify(S.board));
  const ok = paintWeek(S.board, { benchmarkId: bmId, track, weekStart, log });
  if (!ok) { _toast('색칠할 칸을 찾지 못했어요', 'error'); return; }
  const saved = await _persistRequired('완료 도장 저장 실패 — 네트워크를 확인해 주세요');
  if (!saved) {
    S.board = beforeBoard;
    return;
  }
  // 수동 '완료 도장'도 홈스크린 시즌 위젯 스냅샷을 즉시 재동기화 (운동기록 저장 경로가 아니라 누락됐던 지점)
  document.dispatchEvent(new CustomEvent('sheet:saved'));
  closeSheet();
  renderBoard();
  _toast('성공! 칸을 색칠했어요 🟩', 'success');
}

// ----------------------------------------------------------------
// 액션 라우팅 (data-action 위임 — 인라인 onclick 금지)
// ----------------------------------------------------------------

async function _onAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (!action.startsWith('tm2:')) return;
  e.preventDefault();
  const d = btn.dataset;
  switch (action) {
    case 'tm2:close': tm2CloseBoard(); break;
    case 'tm2:choose-majors': await _backToOnboarding(); break;
    case 'tm2:group': S.groupId = d.group; renderBoard(); break;
    case 'tm2:minimap': S.view = 'minimap'; renderBoard(); break;
    case 'tm2:back': S.view = 'board'; renderBoard(); break;
    case 'tm2:today': _scrollToToday(); break;
    case 'tm2:cell': await _onCellTap(d); break;
    case 'tm2:lineup': openLineupSheet(d.week, d.date); break;
    case 'tm2:lineup-toggle': await _toggleLineupSelection(d.bm, d.track || 'volume'); break;
    case 'tm2:lineup-add': S.sheet.ctx.adding = d.cand; _renderLineupSheet(); break;
    case 'tm2:lineup-add-confirm': await _confirmLineupAddCandidate(d.cand); break;
    case 'tm2:column': openColumnSheet(d.bm); break;
    case 'tm2:manage': openManageSheet(); break;
    case 'tm2:settle': openSettleSheet(); break;
    case 'tm2:sheet-close': closeSheet(); break;
    case 'tm2:card-commit': await _commitWorkoutCard(); break;
    case 'tm2:wset-done': _toggleWendlerSet(Number(d.si)); break;
    case 'tm2:wset-add': _addWendlerSet(d.role); break;
    case 'tm2:wset-remove': _removeWendlerSet(Number(d.si)); break;
    case 'tm2:w863-pr-add': _confirmBoardW863Pr().catch(err => console.error('[tm2] confirm w863 PR failed', err)); break;
    case 'tm2:paint': await _paintCurrent(); break;
    case 'tm2:miss-open': openMissSheet(); break;
    case 'tm2:miss-choice': S.missChoice = d.choice; _renderMissSheet(); break;
    case 'tm2:miss-apply': await _applyMiss(); break;
    case 'tm2:miss-record': {
      const { bmId, track, weekStart } = S.sheet.ctx;
      recordMiss(S.board, { benchmarkId: bmId, track, weekStart, choice: 'none', log: { at: Date.now(), actualReps: _txt('tm2-in-amrap'), note: _txt('tm2-in-note') } });
      await _persist(); closeSheet(); renderBoard();
      _toast('기록했어요 — 정산 때 참고돼요', 'info');
      break;
    }
    case 'tm2:settle-decide': S.settleDecisions[d.key] = d.decision; _renderSettleSheet(); break;
    case 'tm2:settle-confirm': await _confirmSettle(); break;
    case 'tm2:col-track': {
      const t = d.track;
      const arr = S.sheet.ctx.tracks;
      S.sheet.ctx.program = 'stair';
      if (arr.includes(t)) S.sheet.ctx.tracks = arr.filter(x => x !== t);
      else arr.push(t);
      _renderColumnSheet();
      break;
    }
    case 'tm2:col-program': S.sheet.ctx.program = d.program; _renderColumnSheet(); break;
    case 'tm2:col-scheme': S.sheet.ctx.scheme = d.scheme; _renderColumnSheet(); break;
    case 'tm2:col-supp': S.sheet.ctx.suppKind = d.supp; _renderColumnSheet(); break;
    case 'tm2:col-save': await _saveColumnSheet(); break;
    case 'tm2:manage-archive': {
      archiveBenchmark(S.board, d.bm);
      await _persist(); _renderManageSheet(); renderBoard();
      _toast('메뉴에서 뺐어요 — 기록은 보존돼요', 'info');
      break;
    }
    case 'tm2:manage-add': S.sheet.ctx.adding = d.cand; _renderManageSheet(); break;
    case 'tm2:manage-add-confirm': await _confirmAdd(d.cand); break;
    default: break;
  }
}
