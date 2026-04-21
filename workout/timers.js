// ================================================================
// workout/timers.js — 운동 타이머 + 세트 간 휴식 타이머
// ================================================================

import { S }                from './state.js';
import { saveWorkoutDay }   from './save.js';
import { showToast, showCenterToast } from '../home/utils.js';
import { confirmAction }    from '../utils/confirm-modal.js';
import { getActiveTimer, saveActiveTimer, clearActiveTimer, getCurrentUser } from '../data.js';

// running 타이머가 "이 정도 이상 방치되면 freak-out" 가드 (24h). active_timer 의
// startedAt 이 너무 오래되었다면 OS kill/탭 종료로 정산 못한 유령 세션으로 간주, 복원하지 않음.
const _MAX_LIVE_TIMER_MS = 24 * 60 * 60 * 1000;

// localStorage 백업(동기/로컬) — Firestore write 가 네트워크 실패했을 때의 안전망.
//   CLAUDE.md: localStorage 는 기기 단위이므로 유저별 키를 써서 다른 계정으로 로그인 시
//   유령 타이머가 살아나지 않게 한다.
const _LS_TIMER_KEY_PREFIX = 'tomatofarm_active_timer_';
function _lsKey() {
  try {
    const u = getCurrentUser();
    const uid = (u && (u.uid || u.id || u.username)) || '_anon';
    return _LS_TIMER_KEY_PREFIX + uid;
  } catch { return _LS_TIMER_KEY_PREFIX + '_anon'; }
}
function _lsWriteTimer(state) {
  try { localStorage.setItem(_lsKey(), JSON.stringify(state)); } catch {}
}
function _lsReadTimer() {
  try {
    const raw = localStorage.getItem(_lsKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function _lsClearTimer() {
  try { localStorage.removeItem(_lsKey()); } catch {}
}
function _isValidActiveTimer(t) {
  return !!t && typeof t.startedAt === 'number' && t.startedAt > 0 &&
         (Date.now() - t.startedAt) < _MAX_LIVE_TIMER_MS &&
         t.date && typeof t.date.y === 'number' &&
         typeof t.date.m === 'number' && typeof t.date.d === 'number';
}

// ── 운동 시간 측정 ───────────────────────────────────────────────
// 타이머는 시작 시점의 날짜(workoutTimerDate)에 귀속됨.
// 사용자가 다른 날짜를 보는 중에도 타이머는 계속 흐르지만, 표시/저장 경로는
// "현재 보고 있는 날짜 === 타이머의 날짜"일 때만 live elapsed를 합산함.
export function _isViewingTimerDate() {
  const td = S.workout.workoutTimerDate, cd = S.shared.date;
  if (!td || !cd) return false;
  return td.y === cd.y && td.m === cd.m && td.d === cd.d;
}

export function wtStartWorkoutTimer() {
  if (S.workout.workoutStartTime) return;
  S.workout.workoutStartTime = Date.now();
  // 타이머가 속한 날짜 고정 (현재 보고 있는 날짜가 기준).
  S.workout.workoutTimerDate = S.shared.date ? { ...S.shared.date } : null;
  S.workout.workoutTimerInterval = setInterval(_renderWorkoutTimer, 1000);
  _renderWorkoutTimer();
  _renderTimerControls();
  // 2-layer persistence:
  //   (1) localStorage (동기, 네트워크 무관) — saveActiveTimer 가 네트워크 실패하더라도
  //       즉시 리로드 시 여기서 복원 가능. 유저 범주 키로 타 유저 계정 간 유령 방지.
  //   (2) _settings/active_timer (Firestore) — cross-device, cross-day SoT.
  //       saveWorkoutDay 를 건들지 않으므로 sheet:saved / 저장 완료 토스트 미발생.
  const activeState = {
    startedAt: S.workout.workoutStartTime,
    date:      S.workout.workoutTimerDate,
  };
  _lsWriteTimer(activeState);
  saveActiveTimer(activeState).catch(e => console.error('[timer start] saveActiveTimer error:', e));
}

export function wtPauseWorkoutTimer() {
  if (!S.workout.workoutStartTime) return;
  // 일시정지는 타이머의 날짜에만 누적해야 함. 다른 날짜를 보고 있으면
  // S.workout.workoutDuration은 그 날짜의 값이므로 건드리면 안 됨.
  if (_isViewingTimerDate()) {
    S.workout.workoutDuration += Math.floor((Date.now() - S.workout.workoutStartTime) / 1000);
  }
  S.workout.workoutStartTime = null;
  // workoutTimerDate는 유지 (재개 시 같은 날짜 타이머로 이어지도록)
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  _renderTimerControls();
  // 순서: saveWorkoutDay (누적 duration 영속화) → clearActiveTimer (포인터 해제).
  //   역순이면 save 실패 시 포인터만 사라져 누적 시간 유실. 이 순서면 save 실패 시
  //   active_timer 가 살아있어 다음 recovery 가 타이머를 이어감 → 유저가 재시도 가능.
  //   LS 는 FS 실패에 대한 백업이므로 FS 경로가 완료된 뒤에 정리.
  saveWorkoutDay()
    .then(() => {
      _lsClearTimer();
      return clearActiveTimer();
    })
    .catch(e => console.error('[timer pause] persist chain error:', e));
}

export async function wtResetWorkoutTimer() {
  // 운동 시간 초기화는 파괴적 액션. 실수 방지 위해 confirm 필수.
  const hasTime = S.workout.workoutDuration > 0 || !!S.workout.workoutStartTime;
  if (hasTime) {
    const ok = await confirmAction({
      title: '운동 시간을 초기화할까요?',
      message: '지금까지 측정된 운동 시간이 0으로 돌아가요.',
      confirmLabel: '초기화',
      cancelLabel: '취소',
      destructive: true,
    });
    if (!ok) return;
  }
  S.workout.workoutDuration = 0;
  S.workout.workoutStartTime = null;
  S.workout.workoutTimerDate = null;
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
  _renderWorkoutTimer();
  _renderTimerControls();
  // 순서: saveWorkoutDay → clearActiveTimer (pause 와 동일 이유).
  saveWorkoutDay()
    .then(() => {
      _lsClearTimer();
      return clearActiveTimer();
    })
    .catch(e => console.error('[timer reset] persist chain error:', e));
}

export function _renderWorkoutTimer() {
  const el = document.getElementById('wt-workout-timer');
  if (!el) return;
  // 현재 보고 있는 날짜가 타이머의 날짜일 때만 live elapsed를 합산.
  // 다른 날짜를 보고 있으면 그 날짜의 저장된 workoutDuration만 표시.
  const onTimerDate = _isViewingTimerDate();
  const elapsed = (S.workout.workoutStartTime && onTimerDate)
    ? Math.floor((Date.now() - S.workout.workoutStartTime) / 1000) + S.workout.workoutDuration
    : S.workout.workoutDuration;
  el.textContent = _fmtTimerCompact(elapsed);
  el.style.display = '';
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.toggle('wt-running', !!S.workout.workoutStartTime && onTimerDate);
}

// 2026-04-20: "타이머는 항상 떠있어야 함" (유저 요구).
//   세트 기록 1개 이상이거나 오늘 운동 탭을 보고 있으면, 아래 규칙으로 컨트롤 상시 노출:
//     - play : 타이머 멈춰 있을 때. 시작 버튼 겸 재개 버튼.
//     - pause: 타이머 돌고 있을 때.
//     - reset: hasTime 일 때만 (0초인데 리셋 UI 는 의미 없음).
//     - finish(끝내기): 기록이 하나라도 있거나 duration 누적됐으면 노출.
//   다른 날짜(타이머 날짜 ≠ 보는 날짜)에서는 기존처럼 컨트롤 숨김 — 타이머 날짜로 돌아가야
//   멈추거나 리셋 가능하도록 명확하게 유지.
function _hasWorkoutRecord() {
  const list = Array.isArray(S.workout.exercises) ? S.workout.exercises : [];
  for (const entry of list) {
    for (const s of (entry?.sets || [])) {
      if (s?.setType === 'warmup') continue;
      if (s?.done === true) return true;
      if (s?.done === false) continue;
      if ((s?.kg || 0) > 0 && (s?.reps || 0) > 0) return true;
    }
  }
  return false;
}

export function _renderTimerControls() {
  const onTimerDate = _isViewingTimerDate();
  const timerActiveElsewhere = !!S.workout.workoutStartTime && !onTimerDate;
  const isRunning = !!S.workout.workoutStartTime && onTimerDate;
  const hasTime   = isRunning || (!timerActiveElsewhere && S.workout.workoutDuration > 0);
  const hasRecord = _hasWorkoutRecord();
  const pauseBtn  = document.getElementById('wt-timer-pause-btn');
  const playBtn   = document.getElementById('wt-timer-play-btn');
  const resetBtn  = document.getElementById('wt-timer-reset-btn');
  const finBtn    = document.getElementById('wt-finish-workout-btn');
  const resultEl  = document.getElementById('wt-workout-duration-result');

  // 다른 날짜에서 타이머가 돌고 있으면 여기선 조작 불가 → 전부 숨김(_restoreFlowState가 이 경로 차단).
  if (timerActiveElsewhere) {
    [pauseBtn, playBtn, resetBtn, finBtn].forEach(b => { if (b) b.style.display = 'none'; });
    if (resultEl) resultEl.style.display = 'none';
    return;
  }

  // play/pause 는 기록 또는 누적시간 유무와 무관하게 상시 노출(유저 요구: "타이머 항상 떠있음").
  if (pauseBtn) pauseBtn.style.display = isRunning  ? '' : 'none';
  if (playBtn)  playBtn.style.display  = !isRunning ? '' : 'none';
  // reset 은 실제 측정된 시간이 있을 때만(의미 있는 액션 아니면 숨김).
  if (resetBtn) resetBtn.style.display = hasTime ? '' : 'none';
  // 끝내기: 기록이 하나라도 있거나 duration 누적 → 노출. 타이머 안 돌렸어도 세트 있으면 뜸.
  if (finBtn)   finBtn.style.display   = (hasTime || hasRecord) ? '' : 'none';
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
  if (S.workout.workoutStartTime) {
    wtPauseWorkoutTimer();
  } else {
    wtStartWorkoutTimer();
  }
}

// 2026-04-19: 반환값이 saveWorkoutDay의 Promise.
// 호출자(wtEndAndShowInsights 등)가 저장 완료를 명시적으로 await 해야 할 때 사용.
// 기존 fire-and-forget 호출부는 `.catch(...)` 만 붙이면 동일하게 동작한다.
// 배경: "끝내기 직후 인사이트 모달이 당일 기록을 아직 반영 못 하는" 회귀를 방지하려면,
//      insightsOpen이 cache 읽기 전에 setDoc/_cache 업데이트가 마무리돼야 한다.
//      _cache[key]=data는 동기 경로에서 이미 갱신되지만, Firebase round-trip까지
//      기다려야 다른 레이어(getCache 소비자, analytics 등)와의 순서가 명확해진다.
export function wtFinishWorkout() {
  if (S.workout.workoutStartTime) {
    // 타이머 날짜와 현재 보고 있는 날짜가 다를 수 있음.
    // 누적은 타이머의 날짜 document에만 반영되어야 함 — 아래 saveWorkoutDay가
    // 타이머 날짜 기준으로 저장할 수 있도록 여기서는 workoutDuration만 합산.
    // (_isViewingTimerDate 시점에서만 S.workout.workoutDuration이 타이머 날짜의 값임)
    if (_isViewingTimerDate()) {
      S.workout.workoutDuration += Math.floor((Date.now() - S.workout.workoutStartTime) / 1000);
    }
    S.workout.workoutStartTime = null;
  }
  S.workout.workoutTimerDate = null;
  if (S.workout.workoutTimerInterval) { clearInterval(S.workout.workoutTimerInterval); S.workout.workoutTimerInterval = null; }
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
    resultEl.textContent = `총 ${_fmtDuration(S.workout.workoutDuration)}`;
    resultEl.style.display = '';
  }
  const bar = document.getElementById('wt-workout-timer-bar');
  if (bar) bar.classList.remove('wt-running');
  showCenterToast(`운동 완료! ${_fmtDuration(S.workout.workoutDuration)}`, 2200);
  // 순서: saveWorkoutDay (총 duration 영속화) → clearActiveTimer (포인터 해제).
  //   save 가 throw 하면 반환 Promise 도 reject → wtEndAndShowInsights 가 인사이트 모달 차단.
  //   active_timer 는 save 성공 뒤에만 정리 — save 실패 시 포인터가 살아있어야 recovery
  //   경로가 이어받아 유저가 재시도 가능 (2026-04-21 Codex 지적 #2).
  return saveWorkoutDay().then(() => {
    _lsClearTimer();
    clearActiveTimer().catch(e => console.error('[timer finish] clearActiveTimer error:', e));
  });
}

export function wtRecoverTimers() {
  // 2026-04-21 cross-day 복원: 페이지 리로드/앱 재시작 직후 메모리는 초기 상태(null)이다.
  //   우선 순위: (1) Firestore _settings/active_timer → cross-device 포인터.
  //             (2) localStorage 백업 → Firestore write 가 네트워크 실패했던 경우 구조.
  //   둘 다 24h 이내 + date 객체 유효 검증. 하나라도 성공하면 메모리 복원 + 반대편도 동기화.
  if (!S.workout.workoutStartTime) {
    const fromFs = getActiveTimer();
    const fromLs = _lsReadTimer();
    let restored = null;
    if (_isValidActiveTimer(fromFs)) restored = fromFs;
    else if (_isValidActiveTimer(fromLs)) restored = fromLs;

    if (restored) {
      S.workout.workoutStartTime = restored.startedAt;
      S.workout.workoutTimerDate = { y: restored.date.y, m: restored.date.m, d: restored.date.d };
      // Firestore 가 비어있고 localStorage 로 복원한 경우 → Firestore 에 재기록.
      if (!fromFs && fromLs) {
        saveActiveTimer(restored).catch(e => console.error('[timer recover→fs] error:', e));
      }
      // localStorage 가 비어있고 Firestore 로 복원한 경우 → localStorage 에 재기록.
      if (fromFs && !fromLs) _lsWriteTimer(restored);
    } else {
      // 유령 세션(24h 초과 등) 또는 불완전 포인터 → 양쪽 청소.
      if (fromLs) _lsClearTimer();
      if (fromFs) clearActiveTimer().catch(() => {});
    }
  }

  if (S.workout.workoutStartTime && !S.workout.workoutTimerInterval) {
    S.workout.workoutTimerInterval = setInterval(_renderWorkoutTimer, 1000);
  }
  _renderWorkoutTimer();
  _renderTimerControls();

  if (S.workout.restTimer.running) {
    if (!S.workout.restTimer.startedAt) {
      const elapsed = Math.max(0, (S.workout.restTimer.total || 0) - (S.workout.restTimer.remaining || 0));
      S.workout.restTimer.startedAt = Date.now() - elapsed * 1000;
    }
    if (!S.workout.restTimer.interval) {
      S.workout.restTimer.interval = setInterval(_syncRestTimerFromNow, 1000);
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
  if (seconds) S.workout.restTimer.total = seconds;
  const ctxEl = document.getElementById('wt-rest-context');
  if (ctxEl) ctxEl.textContent = context || '';
  S.workout.restTimer.remaining = S.workout.restTimer.total;
  S.workout.restTimer.running = true;
  S.workout.restTimer.startedAt = Date.now();

  seg.style.display = '';
  const prog = _restProgEl();
  if (prog) prog.style.display = '';
  bar.classList.add('has-rest');
  bar.classList.remove('rest-expired');
  _showRestControls();

  const t = _restTimeEl(); if (t) t.textContent = _formatTime(S.workout.restTimer.remaining);
  const f = _restFillEl(); if (f) f.style.width = '100%';

  if (S.workout.restTimer.interval) clearInterval(S.workout.restTimer.interval);
  S.workout.restTimer.interval = setInterval(_syncRestTimerFromNow, 1000);
}

// idle 상태는 새 통합 바에서 사용하지 않음 (세트 체크 시점에만 쉬는시간 등장)
export function wtRestTimerShowIdle() { /* no-op (통합 바에서 idle UX 제거) */ }
export function wtRestTimerHideIdle() { /* no-op */ }

export function wtRestTimerSkip() {
  const seg = _restSegEl();
  const bar = _restBarEl();
  if (!seg || !bar) return;
  if (S.workout.restTimer.interval) clearInterval(S.workout.restTimer.interval);
  S.workout.restTimer.interval = null;
  S.workout.restTimer.running = false;
  S.workout.restTimer.startedAt = null;

  seg.style.display = 'none';
  const prog = _restProgEl();
  if (prog) prog.style.display = 'none';
  bar.classList.remove('has-rest', 'rest-expired');
  _hideRestControls();
}

export function wtRestTimerAdjust(delta) {
  if (!S.workout.restTimer.running) return;
  const elapsed = Math.floor((Date.now() - (S.workout.restTimer.startedAt || Date.now())) / 1000);
  const currentRemaining = (S.workout.restTimer.total || 0) - elapsed;
  S.workout.restTimer.remaining = Math.max(0, currentRemaining + delta);
  S.workout.restTimer.total = Math.max(S.workout.restTimer.total, S.workout.restTimer.remaining);
  S.workout.restTimer.startedAt = Date.now() - Math.max(0, S.workout.restTimer.total - S.workout.restTimer.remaining) * 1000;
  const t = _restTimeEl(); if (t) t.textContent = _formatTime(S.workout.restTimer.remaining);
  const f = _restFillEl(); if (f) f.style.width = `${(S.workout.restTimer.remaining / S.workout.restTimer.total) * 100}%`;
  _restBarEl()?.classList.remove('rest-expired');
}

function _syncRestTimerFromNow() {
  const bar = _restBarEl();
  if (!bar || !S.workout.restTimer.running) return;
  const startedAt = S.workout.restTimer.startedAt || Date.now();
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  S.workout.restTimer.remaining = (S.workout.restTimer.total || 0) - elapsed;

  const t = _restTimeEl(); if (t) t.textContent = _formatTime(S.workout.restTimer.remaining);
  if (S.workout.restTimer.remaining > 0) {
    const f = _restFillEl(); if (f) f.style.width = `${(S.workout.restTimer.remaining / S.workout.restTimer.total) * 100}%`;
    bar.classList.remove('rest-expired');
    return;
  }
  if (S.workout.restTimer.remaining === 0) {
    const f = _restFillEl(); if (f) f.style.width = '100%';
    bar.classList.add('rest-expired');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    return;
  }
  // 2026-04-20: 이전에는 -600초(10분 초과) 시 자동 wtRestTimerSkip() 호출.
  //   유저 요구 "운동을 쉬든 시간을 오버하든 항상 떠있어야 함" 에 따라 자동 skip 제거.
  //   rest-expired 클래스만 유지해 오버 상태를 시각적으로 표시하고, 건너뛰기는 유저가 명시적으로.
  if (S.workout.restTimer.remaining < 0) {
    const f = _restFillEl(); if (f) f.style.width = '100%';
    bar.classList.add('rest-expired');
  }
}

export function _initRestTimerPresets() { /* no-op — Preset은 Bottom Sheet로 이동 */ }

// ── Rest Preset Bottom Sheet ──────────────────────────────────────
export function wtOpenRestPresetSheet() {
  document.querySelectorAll('.wt-rest-sheet-back').forEach(el => el.remove());

  const currentTotal = S.workout.restTimer.total || 90;
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
      if (S.workout.restTimer.running) {
        wtRestTimerStart(sec);
      } else {
        S.workout.restTimer.total = sec;
        const t = _restTimeEl(); if (t) t.textContent = _formatTime(sec);
      }
      close();
    });
  });

  requestAnimationFrame(() => back.classList.add('show'));
}
