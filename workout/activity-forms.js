// ================================================================
// workout/activity-forms.js — 런닝/CF/스트레칭/수영 폼
// ================================================================

import { S }              from './state.js';
import { saveWorkoutDay } from './save.js';

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
}

// ── 스트레칭 폼 ─────────────────────────────────────────────────
export function _renderStretchForm() {
  const dur  = document.getElementById('wt-stretch-duration');
  const memo = document.getElementById('wt-stretch-memo');
  if (dur)  dur.value  = S.stretchData.duration || '';
  if (memo) memo.value = S.stretchData.memo || '';
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
