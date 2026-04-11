// ================================================================
// workout/timers.js — 운동 타이머 + 세트 간 휴식 타이머
// ================================================================

import { S }                from './state.js';
import { saveWorkoutDay }   from './save.js';
import { showToast }        from '../home/utils.js';

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
  showToast(`운동 완료! ${_fmtDuration(S.workoutDuration)}`, 3000, 'success');
  saveWorkoutDay().catch(e => console.error('Save error:', e));
}

// ── 세트 간 휴식 타이머 ─────────────────────────────────────────
function _restTimerEl()  { return document.getElementById('wt-rest-section'); }
function _restTimeEl()   { return document.getElementById('wt-rest-time'); }
function _restFillEl()   { return document.getElementById('wt-rest-fill'); }

function _formatTime(sec) {
  const m = Math.floor(Math.abs(sec) / 60);
  const s = Math.abs(sec) % 60;
  const sign = sec < 0 ? '+' : '';
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

export function wtRestTimerStart(seconds, context) {
  const bar = _restTimerEl();
  if (!bar) return;
  if (seconds) S.restTimer.total = seconds;
  const ctxEl = document.getElementById('wt-rest-context');
  if (ctxEl) ctxEl.textContent = context || '';
  S.restTimer.remaining = S.restTimer.total;
  S.restTimer.running = true;

  bar.style.display = '';
  bar.classList.remove('expired', 'done', 'wt-idle');
  _restTimeEl().textContent = _formatTime(S.restTimer.remaining);
  _restFillEl().style.width = '100%';
  _updatePresetActive();

  if (S.restTimer.interval) clearInterval(S.restTimer.interval);

  S.restTimer.interval = setInterval(() => {
    S.restTimer.remaining--;
    _restTimeEl().textContent = _formatTime(S.restTimer.remaining);

    if (S.restTimer.remaining > 0) {
      _restFillEl().style.width = `${(S.restTimer.remaining / S.restTimer.total) * 100}%`;
    } else if (S.restTimer.remaining === 0) {
      _restFillEl().style.width = '0%';
      bar.classList.add('expired');
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } else {
      if (S.restTimer.remaining < -600) wtRestTimerSkip();
    }
  }, 1000);
}

export function wtRestTimerShowIdle() {
  const bar = _restTimerEl();
  if (!bar || S.restTimer.running) return;
  bar.style.display = '';
  bar.classList.remove('expired', 'done');
  bar.classList.add('wt-idle');
  _restTimeEl().textContent = _formatTime(S.restTimer.total);
  _restFillEl().style.width = '100%';
  _updatePresetActive();
}

export function wtRestTimerHideIdle() {
  const bar = _restTimerEl();
  if (!bar || S.restTimer.running) return;
  bar.style.display = 'none';
  bar.classList.remove('wt-idle');
}

export function wtRestTimerSkip() {
  const bar = _restTimerEl();
  if (!bar) return;
  if (S.restTimer.interval) clearInterval(S.restTimer.interval);
  S.restTimer.interval = null;
  S.restTimer.running = false;
  bar.style.display = 'none';
  bar.classList.remove('expired', 'done', 'wt-idle');
}

export function wtRestTimerAdjust(delta) {
  if (!S.restTimer.running) return;
  S.restTimer.remaining = Math.max(0, S.restTimer.remaining + delta);
  S.restTimer.total = Math.max(S.restTimer.total, S.restTimer.remaining);
  _restTimeEl().textContent = _formatTime(S.restTimer.remaining);
  _restFillEl().style.width = `${(S.restTimer.remaining / S.restTimer.total) * 100}%`;
  _restTimerEl()?.classList.remove('expired');
}

function _updatePresetActive() {
  document.querySelectorAll('.rest-preset-btn').forEach(btn => {
    btn.classList.toggle('active', +btn.dataset.sec === S.restTimer.total);
  });
}

export function _initRestTimerPresets() {
  document.querySelectorAll('.rest-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const seconds = +btn.dataset.sec;
      if (S.restTimer.running) {
        wtRestTimerStart(seconds);
        return;
      }
      S.restTimer.total = seconds;
      wtRestTimerShowIdle();
    });
  });
}
