import { escapeHtml as _esc } from '../../utils/escape-html.js';
import { showToast } from '../../ui/toast.js';
import { confirmAction } from '../../utils/confirm-modal.js';
// ================================================================
// workout/test-v2/onboarding.js — 성장 보드 첫 설정 (계약 11)
// ----------------------------------------------------------------
//  1. 운동 메뉴 만들기 — 기존 테스트모드(v1) 벤치마크/라이브러리에서
//     디폴트 종목 자동 구성 (읽기 전용). "그날 골라 쓰는 메뉴".
//  2. 시작 무게 — 기록 있으면 이어받고, 없으면 직접 입력.
//     6주 증량 기본값: 상체 +2.5kg / 하체 +10kg (종목 설정에서 변경).
//  3. 기준일 — 최근 기록이 있으면 해당 주, 없으면 오늘이 속한 주로 자동 계산.
// 빈 보드로 시작시키지 않는다.
// ================================================================

import { getMaxCycle, getExList, getSeasonDecisionCache as getCache, getMuscleParts, saveExercise, deleteExercise } from '../../data.js';
import { MOVEMENTS } from '../../config.js';
import { S as WS } from '../state.js';
import {
  TM2_GROUPS, TM2_TRACK_LABELS, TM2_DEFAULTS,
  buildOnboardingCandidates, buildBoardFromOnboarding, buildRecentMap,
  mergeSessionExercises, sessionRecentMap,
  groupIdForPart, visibleGroupIdsForSelectedParts, mondayOf, shortDate, toKey,
} from './board-core.js';
import {
  WENDLER_SCHEMES, WENDLER_WARMUP_DEFAULT,
  normalizeWendlerConfig, suggestWendlerTm, wendlerWeekPrescription,
} from './wendler.js';

// 후보 키 — 실제 등록 종목은 exerciseId, 폴백 라이브러리는 movementId
const candKey = (c) => c.exerciseId || c.movementId || '';

const OB = {
  candidates: [],
  enabled: new Set(),      // candKey
  weights: {},             // `${candKey}:${track}` → { kg, reps }
  programs: {},            // candKey → 'stair' | 'wendler'
  wendler: {},             // candKey → { tmKg, cycleNo, startWeek, ... }
  tab: 'chest',
  onComplete: null,
  sourceBoard: null,
  bound: false,
  creating: false,
  lastCreatePointerAt: 0,
  editor: null,          // { id, mode }
  todayKeys: new Set(),
  scopedGroupId: null,
};

const _toast = (msg, type = 'info') => { if (typeof showToast === 'function') showToast(msg, 2200, type); };
const _todayKey = () => toKey(new Date());
const _wndKey = (c) => candKey(c);
const _canWendler = (c) => c.groupId === 'lower' || !!c.wendler;
const _isWendlerRecommended = (c) => {
  if (!_canWendler(c)) return false;
  const hay = `${c.movementId || ''} ${c.label || ''}`.toLowerCase();
  return /squat|dead|sumo|스쿼트|데드|와이드|스모/.test(hay);
};
const _numLike = (v, fallback = '') => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function _defaultWendler(c) {
  const vol = c.tracks?.volume || {};
  const existing = c.wendler || {};
  const tm = _numLike(existing.tmKg, '') || suggestWendlerTm({
    trackSpec: { startKg: vol.kg, startReps: vol.reps || 12 },
    roundKg: existing.roundKg || 2.5,
  }) || '';
  const cfg = normalizeWendlerConfig({
    ...existing,
    scheme: 'w863',
    weekMap: null,
    cycleNo: existing.cycleNo || 1,
    startWeek: existing.startWeek || 1,
    tmKg: tm || undefined,
    roundKg: existing.roundKg || 2.5,
    incrementKg: existing.incrementKg || 10,
    warmup: WENDLER_WARMUP_DEFAULT,
    supplemental: { kind: 'bbb', pct: 50, sets: 5, reps: 10 },
    supplemental: { kind: 'bbb', pct: 50, sets: 5, reps: 10, ...(existing.supplemental || {}) },
    warmup: { ...WENDLER_WARMUP_DEFAULT, ...(existing.warmup || {}) },
  }, { primaryMajor: 'lower', trackSpec: { startKg: vol.kg, startReps: vol.reps || 12 } });
  return {
    scheme: cfg.scheme === 'custom' ? 'w863' : cfg.scheme,
    cycleNo: cfg.cycleNo || 1,
    startWeek: cfg.startWeek || 1,
    tmKg: cfg.tmKg || '',
    roundKg: cfg.roundKg || 2.5,
    incrementKg: cfg.incrementKg || 10,
    warmup: cfg.warmup || WENDLER_WARMUP_DEFAULT,
    supplemental: {
      kind: 'bbb',
      pct: cfg.supplemental?.pct ?? 50,
      sets: cfg.supplemental?.sets ?? 5,
      reps: cfg.supplemental?.reps ?? 10,
    },
  };
}
const _programOf = (c) => (_canWendler(c) ? (OB.programs[candKey(c)] || (c.wendler ? 'wendler' : 'stair')) : 'stair');
const _isWendler = (c) => _programOf(c) === 'wendler';
const _wendlerOf = (c) => OB.wendler[candKey(c)] || (OB.wendler[candKey(c)] = _defaultWendler(c));
const _selectedCount = () => _visibleCandidates().filter(c => OB.enabled.has(candKey(c))).length;
const _missingWeights = () => {
  const missing = [];
  for (const c of _visibleCandidates()) {
    if (!OB.enabled.has(candKey(c))) continue;
    if (_isWendler(c)) {
      const tm = Number(_wendlerOf(c).tmKg);
      if (!Number.isFinite(tm) || tm <= 0) missing.push({ key: _wndKey(c), field: 'tmKg', label: `${c.label}(TM)` });
      continue;
    }
    const k = candKey(c);
    for (const t of ['volume', 'intensity']) {
      if (!c.tracks[t]) continue;
      const key = `${k}:${t}`;
      const kg = Number(OB.weights[key]?.kg);
      if (!Number.isFinite(kg) || kg <= 0) missing.push({ key, field: 'kg', label: `${c.label}(${TM2_TRACK_LABELS[t]})` });
    }
  }
  return missing;
};
const _createActionState = () => {
  const selected = _selectedCount();
  const missing = _missingWeights();
  if (OB.creating) return { selected, missing, ready: false, label: '보드 만드는 중...', hint: '잠시만 기다려 주세요' };
  if (!selected) return { selected, missing, ready: false, label: '운동을 먼저 선택하세요', hint: '1단계에서 오늘 보드에 넣을 운동을 켜 주세요' };
  if (missing.length) return { selected, missing, ready: false, label: `시작 무게 ${missing.length}개 입력 필요`, hint: `선택 ${selected}개 · kg 입력 후 생성` };
  return { selected, missing, ready: true, label: '6주 칸 채우기 →', hint: `선택 ${selected}개 · 바로 생성 가능` };
};

function _candidateRecordDate(c) {
  const dates = ['volume', 'intensity']
    .map(t => c?.tracks?.[t]?.dateKey)
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || null;
}

function _referenceInfo() {
  const visible = _visibleCandidates();
  const selected = visible.filter(c => OB.enabled.has(candKey(c)));
  const pool = selected.length ? selected : visible;
  const latestRecord = pool.map(_candidateRecordDate).filter(Boolean).sort().pop() || null;
  const basisDate = latestRecord || _todayKey();
  return {
    basisDate,
    weekStart: mondayOf(basisDate),
    hasRecord: !!latestRecord,
    selectedScoped: selected.length > 0,
  };
}

function _visibleExerciseList() {
  let exList = [];
  try { exList = getExList() || []; } catch { exList = []; }
  const hidden = new Set(Array.isArray(WS.workout?.hiddenExercises) ? WS.workout.hiddenExercises : []);
  return exList.filter(ex => ex?.id && !hidden.has(ex.id));
}

function _currentSessionEntries() {
  return (Array.isArray(WS.workout?.exercises) ? WS.workout.exercises : [])
    .filter(entry => entry && (entry.exerciseId || entry.id || entry.name));
}

function _candidateMatchesSession(c, entries) {
  const label = String(c?.label || '').trim();
  return (Array.isArray(entries) ? entries : []).some((entry) => {
    const entryId = entry?.exerciseId || entry?.id || '';
    const entryName = String(entry?.name || '').trim();
    return (entryId && c.exerciseId === entryId)
      || (entry?.movementId && c.movementId === entry.movementId)
      || (entryName && label === entryName);
  });
}

function _normalizeGroupId(id) {
  const raw = String(id || '').trim();
  if (!raw) return null;
  return groupIdForPart(raw);
}

function _selectedMajorGroupIds() {
  const ids = new Set();
  for (const id of (Array.isArray(WS.workout?.maxMeta?.selectedMajors) ? WS.workout.maxMeta.selectedMajors : [])) {
    const gid = _normalizeGroupId(id);
    if (gid) ids.add(gid);
  }
  return ids;
}

function _selectedVisibleGroupIds() {
  const parts = Array.isArray(WS.workout?.maxMeta?.selectedMajors)
    ? WS.workout.maxMeta.selectedMajors
    : [];
  const selected = visibleGroupIdsForSelectedParts(parts);
  if (selected.size) return selected;
  const todayGroups = OB.candidates
    .filter(c => OB.todayKeys.has(candKey(c)) && c.groupId)
    .map(c => c.groupId);
  const today = visibleGroupIdsForSelectedParts(todayGroups);
  if (today.size) return today;
  return OB.scopedGroupId ? visibleGroupIdsForSelectedParts([OB.scopedGroupId]) : new Set();
}

function _visibleGroups() {
  const visibleIds = _selectedVisibleGroupIds();
  return visibleIds.size ? TM2_GROUPS.filter(g => visibleIds.has(g.id)) : TM2_GROUPS;
}

function _visibleCandidates() {
  const visibleIds = _selectedVisibleGroupIds();
  return visibleIds.size ? OB.candidates.filter(c => visibleIds.has(c.groupId)) : OB.candidates;
}

function _pruneEnabledToVisibleGroups() {
  const visibleIds = _selectedVisibleGroupIds();
  if (!visibleIds.size) return;
  const visibleKeys = new Set(_visibleCandidates().map(candKey).filter(Boolean));
  OB.enabled = new Set([...OB.enabled].filter(k => visibleKeys.has(k)));
}

function _ensureVisibleTab() {
  const groups = _visibleGroups();
  if (!groups.some(g => g.id === OB.tab)) OB.tab = groups[0]?.id || 'chest';
}

function _initialTab() {
  const selectedGroups = _selectedMajorGroupIds();
  const selected = TM2_GROUPS.find(g => selectedGroups.has(g.id));
  if (selected) return selected.id;
  const today = _visibleCandidates().find(c => OB.todayKeys.has(candKey(c)));
  if (today?.groupId) return today.groupId;
  return _visibleGroups()[0]?.id || TM2_GROUPS[0].id;
}

function _initCandidateState(c) {
  const k = candKey(c);
  if (!k) return;
  if (!OB.programs[k]) OB.programs[k] = c.wendler ? 'wendler' : 'stair';
  if (_canWendler(c) && !OB.wendler[k]) OB.wendler[k] = _defaultWendler(c);
  for (const t of ['volume', 'intensity']) {
    const spec = c.tracks[t];
    const key = `${k}:${t}`;
    if (!spec || OB.weights[key]) continue;
    if (!spec.manual) OB.weights[key] = { kg: spec.kg, reps: spec.reps };
    else OB.weights[key] = { kg: '', reps: spec.reps || (t === 'intensity' ? 8 : 12) };
  }
}

function _reloadCandidates({ resetState = false } = {}) {
  let recentMap = {}, exList = [];
  try { recentMap = buildRecentMap(getCache() || {}); } catch { recentMap = {}; }
  const sessionEntries = _currentSessionEntries();
  const sessionMap = sessionRecentMap(sessionEntries);
  recentMap = { ...recentMap, ...sessionMap };
  exList = mergeSessionExercises(_visibleExerciseList(), sessionEntries);
  OB.candidates = buildOnboardingCandidates({ exList, v1Cycle: getMaxCycle(), v2Board: OB.sourceBoard, movements: MOVEMENTS, recentMap });
  OB.todayKeys = new Set(
    OB.candidates
      .filter(c => _candidateMatchesSession(c, sessionEntries))
      .map(candKey)
      .filter(Boolean)
  );
  if (resetState) {
    OB.enabled = new Set();
    OB.weights = {};
    OB.programs = {};
    OB.wendler = {};
  } else {
    const live = new Set(OB.candidates.map(candKey).filter(Boolean));
    OB.enabled = new Set([...OB.enabled].filter(k => live.has(k)));
  }
  for (const c of OB.candidates) _initCandidateState(c);
  if (!resetState) _pruneEnabledToVisibleGroups();
}

export function openOnboarding({ onComplete, board = null } = {}) {
  OB.onComplete = onComplete;
  OB.sourceBoard = board || null;
  _reloadCandidates({ resetState: true });
  OB.enabled = new Set(OB.todayKeys);
  _pruneEnabledToVisibleGroups();
  OB.tab = _initialTab();
  OB.scopedGroupId = _selectedVisibleGroupIds().size ? OB.tab : null;
  OB.editor = null;

  const layer = document.getElementById('tm2-sheets');
  if (!layer) return;
  if (!OB.bound) {
    layer.addEventListener('click', _onObAction);
    layer.addEventListener('pointerup', _onObPointerUp);
    layer.addEventListener('input', _onObInput);
    OB.bound = true;
  }
  _render();
}

function _syncInputs() {
  document.querySelectorAll('#tm2-sheets [data-ob-key]').forEach(inp => {
    const key = inp.dataset.obKey;
    const field = inp.dataset.obField;
    if (!OB.weights[key]) OB.weights[key] = { kg: '', reps: 12 };
    OB.weights[key][field] = inp.value;
  });
  document.querySelectorAll('#tm2-sheets [data-ob-w-key]').forEach(inp => {
    const key = inp.dataset.obWKey;
    const field = inp.dataset.obWField;
    if (!OB.wendler[key]) OB.wendler[key] = {};
    if (field.startsWith('supplemental.')) {
      const sub = field.split('.')[1];
      OB.wendler[key].supplemental = OB.wendler[key].supplemental || { kind: 'bbb' };
      OB.wendler[key].supplemental[sub] = inp.value;
    } else {
      OB.wendler[key][field] = inp.value;
    }
  });
}

function _wendlerConfigForCreate(c) {
  const raw = _wendlerOf(c);
  return normalizeWendlerConfig({
    ...raw,
    scheme: 'w863',
    weekMap: null,
    tmKg: Number(raw.tmKg) || undefined,
    cycleNo: Number(raw.cycleNo) || 1,
    startWeek: Number(raw.startWeek) || 1,
    roundKg: Number(raw.roundKg) || 2.5,
    incrementKg: Number(raw.incrementKg) || 10,
    warmup: WENDLER_WARMUP_DEFAULT,
    supplemental: {
      kind: 'bbb',
      pct: Number(raw.supplemental?.pct) || 50,
      sets: Number(raw.supplemental?.sets) || 5,
      reps: Number(raw.supplemental?.reps) || 10,
    },
  }, { primaryMajor: 'lower', trackSpec: c.tracks?.volume ? { startKg: c.tracks.volume.kg, startReps: c.tracks.volume.reps } : null });
}

function _wendlerPreviewHtml(c) {
  const cfg = _wendlerConfigForCreate(c);
  const rx = wendlerWeekPrescription(cfg, 1);
  const top = rx.topSet;
  const supp = rx.supplemental;
  const warm = (rx.warmup?.sets || []).map(s => `${s.kg}×${s.reps}`).join(' · ');
  return `
    <span>준비 ${_esc(warm || '40/50/60%')}</span>
    <b>메인 ${top?.kg || '—'}kg × ${top?.reps || ''}${top?.amrap ? '+' : ''}</b>
    <span>BBB ${supp?.kg || '—'}kg · ${supp?.sets || 5}×${supp?.reps || 10}</span>`;
}

function _refreshWendlerPreview(key) {
  const c = OB.candidates.find(x => candKey(x) === key);
  if (!c) return;
  const card = Array.from(document.querySelectorAll('#tm2-sheets [data-ob-w-card]'))
    .find(el => el.dataset.obWCard === key);
  const preview = card?.querySelector('.tm2-ob-wpreview');
  if (preview) preview.innerHTML = _wendlerPreviewHtml(c);
}

function _renderWendlerWeightRow(c) {
  const k = candKey(c);
  const raw = _wendlerOf(c);
  const startWeekBtns = Array.from({ length: 6 }, (_, i) => {
    const week = i + 1;
    return `<button type="button" class="${Number(raw.startWeek || 1) === week ? 'tm2-on' : ''}" data-action="tm2ob:wstart" data-cand="${_esc(k)}" data-week="${week}">${week}주</button>`;
  }).join('');
  return `
    <div class="tm2-ob-wendler" data-ob-w-card="${_esc(k)}">
      <div class="tm2-ob-whead">
        <b>${_esc(c.label)}</b>
        <span class="tm2-tk tm2-tk-w">${_esc(WENDLER_SCHEMES.w863.label)} + BBB</span>
      </div>
      <div class="tm2-ob-wgrid">
        <label><span>TM</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="tmKg" inputmode="decimal" value="${_esc(raw.tmKg ?? '')}" placeholder="kg"></label>
        <label><span>사이클</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="cycleNo" inputmode="numeric" value="${_esc(raw.cycleNo ?? 1)}"></label>
        <label><span>라운딩</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="roundKg" inputmode="decimal" value="${_esc(raw.roundKg ?? 2.5)}"></label>
        <label><span>6주 후 TM</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="incrementKg" inputmode="decimal" value="${_esc(raw.incrementKg ?? 10)}"></label>
      </div>
      <div class="tm2-ob-wstart">
        <span>시작 주차</span>
        <span class="tm2-seg2">${startWeekBtns}</span>
      </div>
      <div class="tm2-ob-wgrid tm2-ob-bbb">
        <label><span>BBB %TM</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="supplemental.pct" inputmode="decimal" value="${_esc(raw.supplemental?.pct ?? 50)}"></label>
        <label><span>BBB 세트</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="supplemental.sets" inputmode="numeric" value="${_esc(raw.supplemental?.sets ?? 5)}"></label>
        <label><span>BBB 횟수</span><input data-ob-w-key="${_esc(k)}" data-ob-w-field="supplemental.reps" inputmode="numeric" value="${_esc(raw.supplemental?.reps ?? 10)}"></label>
      </div>
      <div class="tm2-ob-wpreview">
        ${_wendlerPreviewHtml(c)}
      </div>
    </div>`;
}

function _defaultMuscleForTab(groupId = OB.tab) {
  const parts = getMuscleParts?.() || [];
  const ids = new Set(parts.map(m => m.id));
  if (ids.has(groupId)) return groupId;
  const fallback = { arm: 'bicep', abs: 'core', lower: 'lower' }[groupId];
  if (fallback && ids.has(fallback)) return fallback;
  return parts[0]?.id || groupId || 'chest';
}

function _groupForExercise(ex = {}) {
  return OB.candidates.find(c => c.exerciseId === ex.id)?.groupId || OB.tab;
}

function _openEditor(exerciseId = null) {
  _syncInputs();
  const ex = exerciseId ? _visibleExerciseList().find(item => item.id === exerciseId) : null;
  OB.editor = {
    id: ex?.id || '',
    mode: ex ? 'edit' : 'add',
    name: ex?.name || '',
    muscleId: ex?.muscleId || _defaultMuscleForTab(),
  };
  _render();
  setTimeout(() => document.querySelector('#tm2-sheets [data-ob-edit-field="name"]')?.focus(), 50);
}

function _renderEditor() {
  if (!OB.editor) return '';
  const parts = getMuscleParts?.() || [];
  const title = OB.editor.mode === 'edit' ? '종목 수정' : '종목 추가';
  const opts = parts.map(m => `<option value="${_esc(m.id)}" ${m.id === OB.editor.muscleId ? 'selected' : ''}>${_esc(m.name || m.id)}</option>`).join('');
  return `
    <div class="tm2-ob-editor" data-ob-editor>
      <div class="tm2-ob-editor-head">
        <b>${title}</b>
        <span>저장하면 종목 선택 목록에도 바로 반영돼요.</span>
      </div>
      <label><span>종목 이름</span><input data-ob-edit-field="name" value="${_esc(OB.editor.name)}" placeholder="예: 스모데드"></label>
      <label><span>부위</span><select data-ob-edit-field="muscleId">${opts}</select></label>
      <div class="tm2-ob-editor-actions">
        <button type="button" class="tm2-ob-editor-save" data-action="tm2ob:editor-save">저장</button>
        <button type="button" class="tm2-ob-editor-cancel" data-action="tm2ob:editor-cancel">취소</button>
      </div>
    </div>`;
}

async function _saveEditor() {
  const editor = document.querySelector('#tm2-sheets [data-ob-editor]');
  const name = editor?.querySelector('[data-ob-edit-field="name"]')?.value?.trim() || '';
  const muscleId = editor?.querySelector('[data-ob-edit-field="muscleId"]')?.value || _defaultMuscleForTab();
  if (!name) { _toast('종목 이름을 입력해 주세요', 'warning'); return; }
  const editingId = OB.editor?.id || '';
  const existing = editingId ? (getExList() || []).find(ex => ex.id === editingId) : null;
  const record = {
    ...(existing || {}),
    id: editingId || `custom_${Date.now()}`,
    muscleId,
    name,
    order: existing?.order ?? 50,
    gymId: existing?.gymId ?? null,
    primaryGymId: existing?.primaryGymId ?? null,
    gymTags: existing?.gymTags || ['*'],
  };
  try {
    await saveExercise(record);
    OB.editor = null;
    _reloadCandidates();
    const saved = (getExList() || []).find(ex => ex.id === record.id) || record;
    const targetGroup = _groupForExercise(saved);
    if (targetGroup) OB.tab = targetGroup;
    if (!editingId) OB.enabled.add(record.id);
    _initCandidateState(OB.candidates.find(c => candKey(c) === record.id) || {});
    _render();
    _toast('종목 저장 완료', 'success');
  } catch (err) {
    console.warn('[tm2 onboarding saveExercise]', err);
    _toast('종목 저장 실패 — 다시 시도해 주세요', 'error');
  }
}

async function _deleteCandidate(key) {
  _syncInputs();
  const cand = OB.candidates.find(c => candKey(c) === key);
  if (!cand?.exerciseId) { _toast('삭제할 종목을 찾지 못했어요', 'error'); return; }
  const ok = await (confirmAction({
    title: '종목을 삭제할까요?',
    message: `"${cand.label}" 종목을 선택 후보에서 삭제합니다.\n과거 운동 기록은 유지됩니다.`,
    confirmLabel: '삭제',
    cancelLabel: '취소',
    destructive: true,
    longPress: 1200,
  }) || Promise.resolve(window.confirm?.(`"${cand.label}" 종목을 삭제할까요?`) ?? false));
  if (!ok) return;
  try {
    await deleteExercise(cand.exerciseId);
    OB.enabled.delete(key);
    delete OB.programs[key];
    delete OB.wendler[key];
    Object.keys(OB.weights).filter(k => k.startsWith(`${key}:`)).forEach(k => delete OB.weights[k]);
    _reloadCandidates();
    _render();
    _toast('종목이 삭제됐어요', 'info');
  } catch (err) {
    console.warn('[tm2 onboarding deleteExercise]', err);
    _toast('종목 삭제 실패 — 다시 시도해 주세요', 'error');
  }
}

function _render() {
  const layer = document.getElementById('tm2-sheets');
  if (!layer) return;

  _pruneEnabledToVisibleGroups();
  _ensureVisibleTab();
  const groups = _visibleGroups();
  const candidates = _visibleCandidates();

  const tabBtns = groups.map(g => {
    const total = OB.candidates.filter(c => c.groupId === g.id).length;
    const n = OB.candidates.filter(c => c.groupId === g.id && OB.enabled.has(candKey(c))).length;
    return `<button type="button" class="${OB.tab === g.id ? 'tm2-on' : ''}" data-action="tm2ob:tab" data-group="${g.id}">${g.label} ${n}/${total}</button>`;
  }).join('');

  const editorHtml = _renderEditor();
  const listRows = candidates.filter(c => c.groupId === OB.tab).map(c => {
    const k = candKey(c);
    const on = OB.enabled.has(k);
    const canWnd = _canWendler(c);
    const program = _programOf(c);
    const recommended = _isWendlerRecommended(c);
    const tks = ['volume', 'intensity'].filter(t => c.tracks[t])
      .map(t => `<span class="tm2-tk ${t === 'intensity' ? 'tm2-tk-h' : ''}">${TM2_TRACK_LABELS[t]}</span>`).join('');
    const programChip = on && program === 'wendler' ? '<span class="tm2-tk tm2-tk-w">웬들러</span>' : '';
    const recommendChip = recommended && program !== 'wendler' ? '<span class="tm2-tk tm2-tk-w tm2-tk-soft">추천</span>' : '';
    const recent = c.tracks.volume && !c.tracks.volume.manual ? `${c.tracks.volume.kg}kg×${c.tracks.volume.reps}` : '';
    const note = recent ? `최근 ${recent}` : (on ? '직접 입력' : '');
    return `
    <div class="tm2-ob-pick ${on ? '' : 'tm2-dim'}">
      <div class="tm2-ob-row tm2-ob-lib-row">
        <button type="button" class="tm2-ob-lib-toggle" data-action="tm2ob:toggle" data-cand="${_esc(k)}" aria-pressed="${on ? 'true' : 'false'}">
          <span class="tm2-ck ${on ? '' : 'tm2-off'}">${on ? '✓' : ''}</span>
          <b>${_esc(c.label)}</b>${on ? tks : ''}${programChip}${recommendChip}
          <small>${note}</small>
        </button>
        <span class="tm2-ob-lib-actions">
          <button type="button" data-action="tm2ob:editor-open" data-cand="${_esc(k)}">수정</button>
          <button type="button" class="tm2-danger" data-action="tm2ob:delete" data-cand="${_esc(k)}">삭제</button>
        </span>
      </div>
      ${on && canWnd ? `
        <div class="tm2-ob-program">
          <span>${recommended ? '웬들러 추천 종목' : '하체 프로그램'}</span>
          <span class="tm2-seg2 tm2-ob-seg">
            <button type="button" class="${program === 'stair' ? 'tm2-on' : ''}" data-action="tm2ob:program" data-cand="${_esc(k)}" data-program="stair">기본 6주</button>
            <button type="button" class="${program === 'wendler' ? 'tm2-on tm2-ob-wnd-on' : ''}" data-action="tm2ob:program" data-cand="${_esc(k)}" data-program="wendler">웬들러</button>
          </span>
        </div>` : ''}
    </div>`;
  }).join('');

  // 시작 무게 — "그 날 하겠다고 체크한 종목만" (계약: 켜진 종목만 노출)
  const weightRows = candidates.filter(c => OB.enabled.has(candKey(c))).map(c => {
    if (_isWendler(c)) return _renderWendlerWeightRow(c);
    return ['volume', 'intensity'].filter(t => c.tracks[t]).map(t => {
      const key = `${candKey(c)}:${t}`;
      const w = OB.weights[key] || { kg: '', reps: 12 };
      const inherited = c.tracks[t] && !c.tracks[t].manual;
      return `
      <div class="tm2-ob-row">
        <b>${_esc(c.label)}</b>
        <span class="tm2-tk ${t === 'intensity' ? 'tm2-tk-h' : ''}">${TM2_TRACK_LABELS[t]}</span>
        <span class="tm2-ob-weight">
          <input data-ob-key="${_esc(key)}" data-ob-field="kg" inputmode="decimal" value="${w.kg}" placeholder="kg"><i>kg ×</i>
          <input data-ob-key="${_esc(key)}" data-ob-field="reps" inputmode="numeric" value="${w.reps}" style="width:44px"><i>회</i>
          ${inherited ? `<span class="tm2-ob-from">${c.tracks[t].from || '기록'} 이어받음</span>` : '<span class="tm2-ob-from" style="color:#b7791f">직접 입력</span>'}
        </span>
      </div>`;
    }).join('');
  }).join('') || '<div class="tm2-ob-row"><small>1단계에서 종목을 켜 주세요</small></div>';

  const ref = _referenceInfo();
  const refSub = ref.hasRecord
    ? `${shortDate(ref.basisDate)} 최근 기록이 속한 주로 자동 계산`
    : '기록이 없어서 오늘이 속한 주로 자동 계산';
  const actionState = _createActionState();

  layer.innerHTML = `
    <div class="tm2-sheet">
      <div class="tm2-grab"></div>
      <div class="tm2-sh-title">성장 보드 시작하기</div>
      <p class="tm2-ob-lead">6주 단위로 무게를 쌓는 계획표이자, 매일의 운동 배열판을 만들어요.</p>

      <div class="tm2-ob-step"><b>1</b>운동 메뉴 만들기 <span>그 부위 날, 여기서 골라 쓰는 후보예요</span></div>
      <div class="tm2-ob-card">
        <div class="tm2-ob-tabs">${tabBtns}</div>
        <div class="tm2-ob-toolbar">
          <button type="button" data-action="tm2ob:editor-open">+ 종목 추가(선택)</button>
          <span>종목 선택과 같은 운동 리스트예요.</span>
        </div>
        ${editorHtml}
        ${listRows || '<div class="tm2-ob-row"><small>이 부위 후보가 없어요</small></div>'}
      </div>
      <div class="tm2-note">매번 전부 하는 게 아니에요 — <b>운동하는 날 보드에서 골라 담는 메뉴</b>예요.</div>

      <div class="tm2-ob-step"><b>2</b>시작 무게 확인 <span>기록이 있으면 이어받고, 없으면 직접 적어요</span></div>
      <div class="tm2-ob-card">${weightRows}</div>
      <div class="tm2-note">6주마다 오를 기본값 — <b>상체 +${TM2_DEFAULTS.incrementUpperKg}kg · 하체 +${TM2_DEFAULTS.incrementLowerKg}kg</b>. 종목 설정에서 언제든 바꿔요.</div>

      <div class="tm2-ob-step"><b>3</b>현재 기준일</div>
      <div class="tm2-ob-card">
        <div class="tm2-ob-row tm2-ob-ref">
          <span class="tm2-ck">✓</span>
          <b>현재 기준일은 ${shortDate(ref.weekStart)} 주입니다.</b>
          <small>${_esc(refSub)}</small>
        </div>
      </div>

      <div class="tm2-ob-actions">
        <small>${_esc(actionState.hint)}</small>
        <button type="button" class="tm2-btn-primary ${actionState.ready ? '' : 'tm2-btn-muted'}" data-action="tm2ob:create" data-ready="${actionState.ready ? '1' : '0'}">${_esc(actionState.label)}</button>
        <button type="button" class="tm2-btn-ghost" data-action="tm2ob:cancel">나중에</button>
      </div>
    </div>`;
  layer.classList.add('tm2-open');
}

function _refreshCreateAction() {
  const actionState = _createActionState();
  const wrap = document.querySelector('#tm2-sheets .tm2-ob-actions');
  const hint = wrap?.querySelector('small');
  const btn = wrap?.querySelector('[data-action="tm2ob:create"]');
  if (hint) hint.textContent = actionState.hint;
  if (btn) {
    btn.textContent = actionState.label;
    btn.classList.toggle('tm2-btn-muted', !actionState.ready);
    btn.dataset.ready = actionState.ready ? '1' : '0';
  }
}

function _clearInputProblems() {
  document.querySelectorAll('#tm2-sheets .tm2-ob-missing').forEach(el => {
    el.classList.remove('tm2-ob-missing');
    el.removeAttribute('aria-invalid');
  });
}

function _focusProblemInput(missing) {
  const keys = new Set(missing.map(m => m.key));
  const fields = new Set(missing.map(m => m.field || 'kg'));
  let first = null;
  document.querySelectorAll('#tm2-sheets [data-ob-key]').forEach(inp => {
    if (!fields.has(inp.dataset.obField) || !keys.has(inp.dataset.obKey)) return;
    inp.classList.add('tm2-ob-missing');
    inp.setAttribute('aria-invalid', 'true');
    if (!first) first = inp;
  });
  document.querySelectorAll('#tm2-sheets [data-ob-w-key]').forEach(inp => {
    if (!fields.has(inp.dataset.obWField) || !keys.has(inp.dataset.obWKey)) return;
    inp.classList.add('tm2-ob-missing');
    inp.setAttribute('aria-invalid', 'true');
    if (!first) first = inp;
  });
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => first.focus(), 120);
  }
}

async function _create() {
  _syncInputs();
  _clearInputProblems();
  if (OB.creating) return;
  const selections = [];
  const missing = _missingWeights();
  const candidates = _visibleCandidates();
  if (!_selectedCount()) { _refreshCreateAction(); _toast('종목을 1개 이상 켜 주세요', 'warning'); return; }
  if (missing.length) {
    _refreshCreateAction();
    _focusProblemInput(missing);
    _toast(`시작 무게를 입력해 주세요 — ${missing.slice(0, 2).map(m => m.label).join(', ')}${missing.length > 2 ? ` 외 ${missing.length - 2}개` : ''}`, 'warning');
    return;
  }
  for (const c of candidates) {
    if (!OB.enabled.has(candKey(c))) continue;
    if (_isWendler(c)) {
      const cfg = _wendlerConfigForCreate(c);
      const rx = wendlerWeekPrescription(cfg, 1);
      selections.push({
        ...c,
        tracks: {
          volume: { kg: cfg.tmKg, reps: rx.topSet?.reps || 1 },
          intensity: null,
        },
        wendler: cfg,
        incrementKg: cfg.incrementKg,
      });
      continue;
    }
    const k = candKey(c);
    const tracks = {};
    for (const t of ['volume', 'intensity']) {
      if (!c.tracks[t]) { tracks[t] = null; continue; }
      const key = `${k}:${t}`;
      const w = OB.weights[key] || {};
      const kg = Number(w.kg);
      const reps = Math.max(1, Math.round(Number(w.reps) || (t === 'intensity' ? 8 : 12)));
      tracks[t] = { kg, reps };
    }
    selections.push({ ...c, tracks, wendler: null });
  }

  const startDate = _referenceInfo().weekStart;
  const preferredGroupId = selections.some(c => c.groupId === OB.tab)
    ? OB.tab
    : (selections.find(c => c.groupId)?.groupId || null);
  const board = buildBoardFromOnboarding({
    selections,
    startDate,
    source: getMaxCycle() ? 'max_cycle_v1' : 'manual',
  });
  board.createdAt = Date.now();

  OB.creating = true;
  _refreshCreateAction();
  try {
    if (typeof OB.onComplete === 'function') await OB.onComplete(board, { preferredGroupId });
    const layer = document.getElementById('tm2-sheets');
    if (layer) { layer.classList.remove('tm2-open'); layer.innerHTML = ''; }
  } catch (e) {
    console.error('[tm2] onboarding create failed', e);
    _toast('성장 보드를 만들지 못했어요 — 다시 눌러 주세요', 'error');
  } finally {
    OB.creating = false;
    _refreshCreateAction();
  }
}

function _onObAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (!action.startsWith('tm2ob:')) return;
  e.preventDefault();
  switch (action) {
    case 'tm2ob:tab':
      _syncInputs();
      OB.tab = btn.dataset.group;
      OB.scopedGroupId = OB.tab;
      _render();
      break;
    case 'tm2ob:toggle': {
      _syncInputs();
      const id = btn.dataset.cand;
      if (OB.enabled.has(id)) OB.enabled.delete(id);
      else OB.enabled.add(id);
      _render();
      break;
    }
    case 'tm2ob:program': {
      _syncInputs();
      const id = btn.dataset.cand;
      OB.programs[id] = btn.dataset.program === 'wendler' ? 'wendler' : 'stair';
      const cand = OB.candidates.find(c => candKey(c) === id);
      if (cand && OB.programs[id] === 'wendler') OB.wendler[id] = OB.wendler[id] || _defaultWendler(cand);
      _render();
      break;
    }
    case 'tm2ob:wstart': {
      _syncInputs();
      const id = btn.dataset.cand;
      OB.wendler[id] = OB.wendler[id] || {};
      OB.wendler[id].startWeek = Math.max(1, Math.min(6, Math.round(Number(btn.dataset.week) || 1)));
      _render();
      break;
    }
    case 'tm2ob:editor-open': {
      const cand = OB.candidates.find(c => candKey(c) === btn.dataset.cand);
      _openEditor(cand?.exerciseId || null);
      break;
    }
    case 'tm2ob:editor-save':
      _saveEditor();
      break;
    case 'tm2ob:editor-cancel':
      _syncInputs();
      OB.editor = null;
      _render();
      break;
    case 'tm2ob:delete':
      _deleteCandidate(btn.dataset.cand);
      break;
    case 'tm2ob:create':
      if (Date.now() - OB.lastCreatePointerAt < 500) return;
      _create();
      break;
    case 'tm2ob:cancel': {
      const layer = document.getElementById('tm2-sheets');
      if (layer) { layer.classList.remove('tm2-open'); layer.innerHTML = ''; }
      break;
    }
    default: break;
  }
}

function _onObPointerUp(e) {
  const btn = e.target.closest('[data-action="tm2ob:create"]');
  if (!btn) return;
  e.preventDefault();
  OB.lastCreatePointerAt = Date.now();
  _create();
}

function _onObInput(e) {
  const inp = e.target.closest('[data-ob-key], [data-ob-w-key]');
  if (!inp) return;
  if (inp.dataset.obWKey) {
    const key = inp.dataset.obWKey;
    const field = inp.dataset.obWField;
    if (!OB.wendler[key]) OB.wendler[key] = {};
    if (field.startsWith('supplemental.')) {
      const sub = field.split('.')[1];
      OB.wendler[key].supplemental = OB.wendler[key].supplemental || { kind: 'bbb' };
      OB.wendler[key].supplemental[sub] = inp.value;
    } else {
      OB.wendler[key][field] = inp.value;
    }
    _refreshWendlerPreview(key);
  } else {
    const key = inp.dataset.obKey;
    const field = inp.dataset.obField;
    if (!OB.weights[key]) OB.weights[key] = { kg: '', reps: 12 };
    OB.weights[key][field] = inp.value;
  }
  inp.classList.remove('tm2-ob-missing');
  inp.removeAttribute('aria-invalid');
  _refreshCreateAction();
}
