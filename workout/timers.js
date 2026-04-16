// ================================================================
// workout/timers.js — 운동 타이머 + 세트 간 휴식 타이머
// ================================================================

import { S }                from './state.js';
import { saveWorkoutDay }   from './save.js';
import { showToast, showCenterToast } from '../home/utils.js';

// ── 운동 시간 측정 ───────────────────────────────────────────────
export function wtStartWorkoutTimer() {
  if (S.workoutStartTime) return;
  S.workoutStartTime = Date.now();
  S.workoutTimerInterval = setInterval(_renderWorkoutTimer, 1000);
  _renderWorkoutTimer();
  _renderTimerControls();
}

export function wtPauseWorkoutTimer() {
  if (!S.workoutStartTime) return;
  S.workoutDuration += Math.floor((Date.now() - S.workoutStartTime) / 1000);
  S.workoutStartTime = null;
  if (S.workoutTimerInterval) { clearInterval(S.workoutTimerInterval); S.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  _renderTimerControls();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtResetWorkoutTimer() {
  S.workoutDuration = 0;
  S.workoutStartTime = null;
  if (S.workoutTimerInterval) { clearInterval(S.workoutTimerInterval); S.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  _renderTimerControls();
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function _renderWorkoutTimer() {
  const el = document.getElementById('wt-workout-timer');
  if (!el) return;
  const elapsed = S.workoutStartTime
    ? Math.floor((Date.now() - S.workoutStartTime) / 1000) + S.workoutDuration
    : S.workoutDuration;
  el.textContent = _fmtTimerCompact(elapsed);
  el.style.display = '';
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.toggle('wt-running', !!S.workoutStartTime);
}

export function _renderTimerControls() {
  const isRunning = !!S.workoutStartTime;
  const hasTime   = S.workoutDuration > 0 || isRunning;
  const pauseBtn  = document.getElementById('wt-timer-pause-btn');
  const playBtn   = document.getElementById('wt-timer-play-btn');
  const resetBtn  = document.getElementById('wt-timer-reset-btn');
  const finBtn    = document.getElementById('wt-finish-workout-btn');
  const resultEl  = document.getElementById('wt-workout-duration-result');

  if (pauseBtn) pauseBtn.style.display = (hasTime && isRunning) ? '' : 'none';
  if (playBtn)  playBtn.style.display  = (hasTime && !isRunning) ? '' : 'none';
  if (resetBtn) resetBtn.style.display = hasTime ? '' : 'none';
  if (finBtn)   finBtn.style.display   = isRunning ? '' : 'none';
  if (resultEl) resultEl.style.display = 'none';
}

export function _fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function _fmtTimerCompact(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

export function wtTogglePauseWorkoutTimer() {
  if (S.workoutStartTime) {
    wtPauseWorkoutTimer();
  } else {
    wtStartWorkoutTimer();
  }
}

export function wtFinishWorkout() {
  if (S.workoutStartTime) {
    S.workoutDuration += Math.floor((Date.now() - S.workoutStartTime) / 1000);
    S.workoutStartTime = null;
  }
  if (S.workoutTimerInterval) { clearInterval(S.workoutTimerInterval); S.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  const pauseBtn = document.getElementById('wt-timer-pause-btn');
  const resetBtn = document.getElementById('wt-timer-reset-btn');
  const finBtn   = document.getElementById('wt-finish-workout-btn');
  const resultEl = document.getElementById('wt-workout-duration-result');
  if (pauseBtn) pauseBtn.style.display = 'none';
  const playBtn = document.getElementById('wt-timer-play-btn');
  if (playBtn) playBtn.style.display = 'none';
  if (resetBtn) resetBtn.style.display = 'none';
  if (finBtn)   finBtn.style.display = 'none';
  if (resultEl) {
    resultEl.textContent = `총 ${_fmtDuration(S.workoutDuration)}`;
    resultEl.style.display = '';
  }
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.remove('wt-running');
  showCenterToast(`운동 완료! ${_fmtDuration(S.workoutDuration)}`, 2200);
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

export function wtRecoverTimers() {
  if (S.workoutStartTime && !S.workoutTimerInterval) {
    S.workoutTimerInterval = setInterval(_renderWorkoutTimer, 1000);
  }
  _renderWorkoutTimer();
  _renderTimerControls();

  if (S.restTimer.running) {
    if (!S.restTimer.startedAt) {
      const elapsed = Math.max(0, (S.restTimer.total || 0) - (S.restTimer.remaining || 0));
      S.restTimer.startedAt = Date.now() - elapsed * 1000;
    }
    if (!S.restTimer.interval) {
      S.restTimer.interval = setInterval(_syncRestTimerFromNow, 1000);
    }
    _syncRestTimerFromNow();
  }
}

// ── 세트 간 휴식 타이머 (통합 바 버전) ─────────────────────────
// DOM 구조: wt-workout-timer-bar (부모, has-rest / rest-expired 클래스)
//   └ wt-rest-section (세그먼트, display toggle)
//   └ wt-tbar-progress (진행바 컨테이너, display toggle)
//   └ wt-rest-minus-btn / wt-rest-plus-btn / wt-rest-skip-btn (컨트롤 버튼)
function _restSegEl()     { return document.getElementById('wt-rest-section'); }
function _restBarEl()     { return document.getElementById('wt-workout-timer-bar'); }
function _restProgEl()    { return document.getElementById('wt-tbar-progress'); }
function _restTimeEl()    { return document.getElementById('wt-rest-time'); }
function _restFillEl()    { return document.getElementById('wt-rest-fill'); }

const _REST_CTRL_IDS   = ['wt-rest-minus-btn', 'wt-rest-plus-btn', 'wt-rest-skip-btn'];
const _WORK_CTRL_IDS   = ['wt-timer-pause-btn', 'wt-timer-play-btn', 'wt-timer-reset-btn', 'wt-finish-workout-btn'];

function _setDisplay(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? '' : 'none';
}
function _showRestControls() {
  _REST_CTRL_IDS.forEach(id => _setDisplay(id, true));
  _WORK_CTRL_IDS.forEach(id => _setDisplay(id, false));
}
function _hideRestControls() {
  _REST_CTRL_IDS.forEach(id => _setDisplay(id, false));
  _renderTimerControls();
}

function _formatTime(sec) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  const sign = sec < 0 ? '+' : '';
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

export function wtRestTimerStart(seconds, context) {
  const seg = _restSegEl();
  const bar = _restBarEl();
  if (!seg || !bar) return;
  if (seconds) S.restTimer.total = seconds;
  const ctxEl = document.getElementById('wt-rest-context');
  if (ctxEl) ctxEl.textContent = context || '';
  S.restTimer.remaining = S.restTimer.total;
  S.restTimer.running = true;
  S.restTimer.startedAt = Date.now();

  seg.style.display = '';
  const prog = _restProgEl();
  if (prog) prog.style.display = '';
  bar.classList.add('has-rest');
  bar.classList.remove('rest-expired');
  _showRestControls();

  const t = _restTimeEl(); if (t) t.textContent = _formatTime(S.restTimer.remaining);
  const f = _restFillEl(); if (f) f.style.width = '100%';

  if (S.restTimer.interval) clearInterval(S.restTimer.interval);
  S.restTimer.interval = setInterval(_syncRestTimerFromNow, 1000);
}

// idle 상태는 새 통합 바에서 사용하지 않음 (세트 체크 시점에만 쉬는시간 등장)
export function wtRestTimerShowIdle() { /* no-op (통합 바에서 idle UX 제거) */ }
export function wtRestTimerHideIdle() { /* no-op */ }

export function wtRestTimerSkip() {
  const seg = _restSegEl();
  const bar = _restBarEl();
  if (!seg || !bar) return;
  if (S.restTimer.interval) clearInterval(S.restTimer.interval);
  S.restTimer.interval = null;
  S.restTimer.running = false;
  S.restTimer.startedAt = null;

  seg.style.display = 'none';
  const prog = _restProgEl();
  if (prog) prog.style.display = 'none';
  bar.classList.remove('has-rest', 'rest-expired');
  _hideRestControls();
}

export function wtRestTimerAdjust(delta) {
  if (!S.restTimer.running) return;
  const elapsed = Math.floor((Date.now() - (S.restTimer.startedAt || Date.now())) / 1000);
  const currentRemaining = (S.restTimer.total || 0) - elapsed;
  S.restTimer.remaining = Math.max(0, currentRemaining + delta);
  S.restTimer.total = Math.max(S.restTimer.total, S.restTimer.remaining);
  S.restTimer.startedAt = Date.now() - Math.max(0, S.restTimer.total - S.restTimer.remaining) * 1000;
  const t = _restTimeEl(); if (t) t.textContent = _formatTime(S.restTimer.remaining);
  const f = _restFillEl(); if (f) f.style.width = `${(S.restTimer.remaining / S.restTimer.total) * 100}%`;
  _restBarEl()?.classList.remove('rest-expired');
}

function _syncRestTimerFromNow() {
  const bar = _restBarEl();
  if (!bar || !S.restTimer.running) return;
  const startedAt = S.restTimer.startedAt || Date.now();
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  S.restTimer.remaining = (S.restTimer.total || 0) - elapsed;

  const t = _restTimeEl(); if (t) t.textContent = _formatTime(S.restTimer.remaining);
  if (S.restTimer.remaining > 0) {
    const f = _restFillEl(); if (f) f.style.width = `${(S.restTimer.remaining / S.restTimer.total) * 100}%`;
    bar.classList.remove('rest-expired');
    return;
  }
  if (S.restTimer.remaining === 0) {
    const f = _restFillEl(); if (f) f.style.width = '100%';
    bar.classList.add('rest-expired');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }
  if (S.restTimer.remaining < -600) wtRestTimerSkip();
}

export function _initRestTimerPresets() { /* no-op — Preset은 Bottom Sheet로 이동 */ }

// ── Rest Preset Bottom Sheet ──────────────────────────────────────
export function wtOpenRestPresetSheet() {
  document.querySelectorAll('.wt-rest-sheet-back').forEach(el => el.remove());

  const currentTotal = S.restTimer.total || 90;
  const options = [
    { sec: 30,  label: '0:30' },
    { sec: 60,  label: '1:00' },
    { sec: 90,  label: '1:30' },
    { sec: 120, label: '2:00' },
    { sec: 180, label: '3:00' },
    { sec: 300, label: '5:00' },
  ];

  const back = document.createElement('div');
  back.className = 'wt-rest-sheet-back';
  back.innerHTML = `
    <div class="wt-rest-sheet">
      <div class="wt-rest-sheet-title">휴식시간 설정</div>
      <div class="wt-rest-sheet-grid">
        ${options.map(o =>
          `<button type="button" class="wt-rest-sheet-opt${o.sec === currentTotal ? ' is-on' : ''}" data-sec="${o.sec}">${o.label}</button>`
        ).join('')}
      </div>
      <button type="button" class="wt-rest-sheet-close">취소</button>
    </div>
  `;
  document.body.appendChild(back);

  const close = () => { back.classList.remove('show'); setTimeout(() => back.remove(), 200); };

  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  back.querySelector('.wt-rest-sheet-close')?.addEventListener('click', close);
  back.querySelectorAll('.wt-rest-sheet-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = +btn.dataset.sec;
      if (S.restTimer.running) {
        wtRestTimerStart(sec);
      } else {
        S.restTimer.total = sec;
        const t = _restTimeEl(); if (t) t.textContent = _formatTime(sec);
      }
      close();
    });
  });

  requestAnimationFrame(() => back.classList.add('show'));
}
