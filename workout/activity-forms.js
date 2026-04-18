// ================================================================
// workout/activity-forms.js — 런닝/CF/스트레칭/수영 폼
// ================================================================

import { S }              from './state.js';
import { saveWorkoutDay } from './save.js';
import { dateKey, getLastActivitySession } from '../data.js';
import { showToast }      from '../home/utils.js';

// 복사 후 저장 + Undo 토스트 공통 처리 (C-1 — 헬스 종목 세트 복사와 일관성 확보).
// stateKey: 'runData'|'cfData'|'stretchData'|'swimData'
// prev: 복사 직전 상태 스냅샷(깊은 복사본)
// rerender: 해당 폼의 _renderXxxForm 함수
function _afterActivityCopy(stateKey, prev, rerender) {
  saveWorkoutDay().catch(e => console.error('Activity copy save error:', e));
  showToast('직전 기록을 불러왔어요', 3000, 'success', {
    action: '실행 취소',
    onAction: () => {
      S[stateKey] = prev;
      try { rerender(); } catch (e) { console.error('Undo rerender:', e); }
      saveWorkoutDay().catch(e => console.error('Undo save error:', e));
    },
  });
}

function _currentDateKey() {
  if (!S.date) return null;
  return dateKey(S.date.y, S.date.m, S.date.d);
}

function _fmtShortDate(dk) {
  if (!dk) return '';
  const [, mm, dd] = dk.split('-');
  return `${Number(mm)}/${Number(dd)}`;
}

function _renderActivityCopyHint(type, applyCopy) {
  const el = document.getElementById(`wt-${type}-last-copy`);
  if (!el) return;

  const last = getLastActivitySession(type, _currentDateKey());
  if (!last) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = '';
  el.innerHTML = `
    <span class="wt-activity-copy-text">직전(${_fmtShortDate(last.date)}) 기록 불러오기</span>
    <button type="button" class="wt-activity-copy-btn">복사</button>
  `;
  el.querySelector('.wt-activity-copy-btn')?.addEventListener('click', () => applyCopy(last));
}

// ── 런닝 폼 ─────────────────────────────────────────────────────
export function _renderRunningForm() {
  const dist = document.getElementById('wt-run-distance');
  const durM = document.getElementById('wt-run-duration-min');
  const durS = document.getElementById('wt-run-duration-sec');
  const memo = document.getElementById('wt-run-memo');
  if (dist) dist.value = S.runData.distance || '';
  if (durM) durM.value = S.runData.durationMin || '';
  if (durS) durS.value = S.runData.durationSec || '';
  if (memo) memo.value = S.runData.memo || '';
  _calcRunPace();
  _renderActivityCopyHint('running', (last) => {
    const prev = JSON.parse(JSON.stringify(S.runData || {}));
    S.runData = {
      distance: last.distance || 0,
      durationMin: last.durationMin || 0,
      durationSec: last.durationSec || 0,
      memo: last.memo || '',
    };
    _renderRunningForm();
    _afterActivityCopy('runData', prev, _renderRunningForm);
  });
}

function _calcRunPace() {
  const el = document.getElementById('wt-run-pace');
  if (!el) return;
  const totalSec = (S.runData.durationMin || 0) * 60 + (S.runData.durationSec || 0);
  const dist = S.runData.distance || 0;
  if (dist > 0 && totalSec > 0) {
    const paceTotal = totalSec / dist;
    const paceMin = Math.floor(paceTotal / 60);
    const paceSec = Math.round(paceTotal % 60);
    el.textContent = `${paceMin}'${String(paceSec).padStart(2,'0')}" /km`;
  } else {
    el.textContent = "--'--\"";
  }
}

let _runEventsBound = false;
export function _initRunningEvents() {
  if (_runEventsBound) return;
  _runEventsBound = true;
  const dist = document.getElementById('wt-run-distance');
  const durM = document.getElementById('wt-run-duration-min');
  const durS = document.getElementById('wt-run-duration-sec');
  const memo = document.getElementById('wt-run-memo');

  function onRunChange() {
    S.runData.distance    = parseFloat(dist?.value) || 0;
    S.runData.durationMin = parseInt(durM?.value) || 0;
    S.runData.durationSec = parseInt(durS?.value) || 0;
    S.runData.memo        = memo?.value.trim() || '';
    _calcRunPace();
    saveWorkoutDay().catch(e => console.error('Save error:', e));
  }
  dist?.addEventListener('change', onRunChange);
  durM?.addEventListener('change', onRunChange);
  durS?.addEventListener('change', onRunChange);
  memo?.addEventListener('change', onRunChange);
}

// ── 크로스핏 폼 ─────────────────────────────────────────────────
export function _renderCfForm() {
  const wod  = document.getElementById('wt-cf-wod');
  const durM = document.getElementById('wt-cf-duration-min');
  const durS = document.getElementById('wt-cf-duration-sec');
  const memo = document.getElementById('wt-cf-memo');
  if (wod)  wod.value  = S.cfData.wod || '';
  if (durM) durM.value = S.cfData.durationMin || '';
  if (durS) durS.value = S.cfData.durationSec || '';
  if (memo) memo.value = S.cfData.memo || '';
  _renderActivityCopyHint('cf', (last) => {
    const prev = JSON.parse(JSON.stringify(S.cfData || {}));
    S.cfData = {
      wod: last.wod || '',
      durationMin: last.durationMin || 0,
      durationSec: last.durationSec || 0,
      memo: last.memo || '',
    };
    _renderCfForm();
    _afterActivityCopy('cfData', prev, _renderCfForm);
  });
}

// ── 스트레칭 폼 ─────────────────────────────────────────────────
export function _renderStretchForm() {
  const dur  = document.getElementById('wt-stretch-duration');
  const memo = document.getElementById('wt-stretch-memo');
  if (dur)  dur.value  = S.stretchData.duration || '';
  if (memo) memo.value = S.stretchData.memo || '';
  _renderActivityCopyHint('stretching', (last) => {
    const prev = JSON.parse(JSON.stringify(S.stretchData || {}));
    S.stretchData = {
      duration: last.duration || 0,
      memo: last.memo || '',
    };
    _renderStretchForm();
    _afterActivityCopy('stretchData', prev, _renderStretchForm);
  });
}

// ── 수영 폼 ─────────────────────────────────────────────────────
export function _renderSwimForm() {
  const dist   = document.getElementById('wt-swim-distance');
  const durM   = document.getElementById('wt-swim-duration-min');
  const durS   = document.getElementById('wt-swim-duration-sec');
  const stroke = document.getElementById('wt-swim-stroke');
  const memo   = document.getElementById('wt-swim-memo');
  if (dist)   dist.value   = S.swimData.distance || '';
  if (durM)   durM.value   = S.swimData.durationMin || '';
  if (durS)   durS.value   = S.swimData.durationSec || '';
  if (stroke) stroke.value = S.swimData.stroke || '';
  if (memo)   memo.value   = S.swimData.memo || '';
  _renderActivityCopyHint('swimming', (last) => {
    const prev = JSON.parse(JSON.stringify(S.swimData || {}));
    S.swimData = {
      distance: last.distance || 0,
      durationMin: last.durationMin || 0,
      durationSec: last.durationSec || 0,
      stroke: last.stroke || '',
      memo: last.memo || '',
    };
    _renderSwimForm();
    _afterActivityCopy('swimData', prev, _renderSwimForm);
  });
}

// ── CF/스트레칭/수영 공통 이벤트 바인딩 ──────────────────────────
let _typeEventsBound = false;
export function _initTypeFormEvents() {
  if (_typeEventsBound) return;
  _typeEventsBound = true;

  // 크로스핏
  const cfWod  = document.getElementById('wt-cf-wod');
  const cfDurM = document.getElementById('wt-cf-duration-min');
  const cfDurS = document.getElementById('wt-cf-duration-sec');
  const cfMemo = document.getElementById('wt-cf-memo');
  function onCfChange() {
    S.cfData.wod         = cfWod?.value.trim() || '';
    S.cfData.durationMin = parseInt(cfDurM?.value) || 0;
    S.cfData.durationSec = parseInt(cfDurS?.value) || 0;
    S.cfData.memo        = cfMemo?.value.trim() || '';
    saveWorkoutDay().catch(e => console.error('Save error:', e));
  }
  cfWod?.addEventListener('change', onCfChange);
  cfDurM?.addEventListener('change', onCfChange);
  cfDurS?.addEventListener('change', onCfChange);
  cfMemo?.addEventListener('change', onCfChange);

  // 스트레칭
  const strDur  = document.getElementById('wt-stretch-duration');
  const strMemo = document.getElementById('wt-stretch-memo');
  function onStretchChange() {
    S.stretchData.duration = parseInt(strDur?.value) || 0;
    S.stretchData.memo     = strMemo?.value.trim() || '';
    saveWorkoutDay().catch(e => console.error('Save error:', e));
  }
  strDur?.addEventListener('change', onStretchChange);
  strMemo?.addEventListener('change', onStretchChange);

  // 수영
  const swimDist   = document.getElementById('wt-swim-distance');
  const swimDurM   = document.getElementById('wt-swim-duration-min');
  const swimDurS   = document.getElementById('wt-swim-duration-sec');
  const swimStroke = document.getElementById('wt-swim-stroke');
  const swimMemo   = document.getElementById('wt-swim-memo');
  function onSwimChange() {
    S.swimData.distance    = parseFloat(swimDist?.value) || 0;
    S.swimData.durationMin = parseInt(swimDurM?.value) || 0;
    S.swimData.durationSec = parseInt(swimDurS?.value) || 0;
    S.swimData.stroke      = swimStroke?.value || '';
    S.swimData.memo        = swimMemo?.value.trim() || '';
    saveWorkoutDay().catch(e => console.error('Save error:', e));
  }
  swimDist?.addEventListener('change', onSwimChange);
  swimDurM?.addEventListener('change', onSwimChange);
  swimDurS?.addEventListener('change', onSwimChange);
  swimStroke?.addEventListener('change', onSwimChange);
  swimMemo?.addEventListener('change', onSwimChange);
}
