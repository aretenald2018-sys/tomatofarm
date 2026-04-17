// ================================================================
// utils/confirm-modal.js — 파괴적 액션 공통 확인 모달
//   - Promise<boolean> 반환 (확인: true, 취소/ESC/백드롭: false)
//   - TDS Mobile 규격: title t4(20/29/700), content padding 32/20/20/20
//   - destructive 옵션: 확인 버튼 빨간색(diet-bad)
//   - longPress 옵션(ms): 2초 press-hold 필요 — 실수 방지용
//   - 포커스 관리: 열 때 취소 버튼 포커스(파괴적일수록 보수적), 닫을 때 트리거 복귀
// ================================================================

let _openCount = 0; // 중첩 대비

/**
 * 확인 모달을 띄우고 사용자 선택을 Promise로 반환.
 *
 * @param {object} opts
 * @param {string} opts.title - 모달 제목 (t4)
 * @param {string} [opts.message] - 본문 메시지 (여러 줄 \n 허용)
 * @param {string} [opts.confirmLabel='확인'] - 확인 버튼 텍스트
 * @param {string} [opts.cancelLabel='취소'] - 취소 버튼 텍스트
 * @param {boolean} [opts.destructive=false] - 확인 버튼을 destructive 스타일로
 * @param {number} [opts.longPress=0] - long-press 홀드 필요 ms (0이면 일반 클릭)
 * @returns {Promise<boolean>}
 */
export function confirmAction(opts = {}) {
  const {
    title = '확인',
    message = '',
    confirmLabel = '확인',
    cancelLabel = '취소',
    destructive = false,
    longPress = 0,
  } = opts;

  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'tds-modal-overlay confirm-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="tds-modal-sheet" role="document">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content">
          <h2 class="tds-modal-title">${_escape(title)}</h2>
          ${message ? `<p class="confirm-modal-message">${_escape(message).replace(/\n/g, '<br/>')}</p>` : ''}
          <div class="confirm-modal-actions">
            <button type="button" class="tds-btn secondary confirm-modal-cancel" data-confirm-role="cancel">${_escape(cancelLabel)}</button>
            <button type="button" class="tds-btn ${destructive ? 'destructive' : ''} confirm-modal-confirm${longPress > 0 ? ' long-press' : ''}" data-confirm-role="confirm"${longPress > 0 ? ` data-long-press="${longPress}"` : ''}>
              ${longPress > 0 ? `<span class="long-press-fill"></span><span class="long-press-label">${_escape(confirmLabel)}<small class="long-press-hint">길게 눌러 확인 (${Math.round(longPress / 1000)}초)</small></span>` : _escape(confirmLabel)}
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    _openCount++;
    document.body.style.overflow = 'hidden';

    // 다음 프레임에 open 클래스 → 애니메이션
    requestAnimationFrame(() => overlay.classList.add('open'));

    let settled = false;
    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      overlay.classList.remove('open');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => {
        overlay.remove();
        _openCount = Math.max(0, _openCount - 1);
        if (_openCount === 0) document.body.style.overflow = '';
        try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch {}
      }, 150);
      resolve(result);
    };

    // 백드롭 클릭 = 취소
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    // 버튼 핸들러
    const cancelBtn = overlay.querySelector('[data-confirm-role="cancel"]');
    const confirmBtn = overlay.querySelector('[data-confirm-role="confirm"]');
    cancelBtn.addEventListener('click', () => cleanup(false));

    if (longPress > 0) {
      _bindLongPress(confirmBtn, longPress, () => cleanup(true));
    } else {
      confirmBtn.addEventListener('click', () => cleanup(true));
    }

    // ESC 키 = 취소
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cleanup(false);
      }
    };
    document.addEventListener('keydown', onKey, true);

    // 초기 포커스 — 파괴적 액션은 cancel 에 포커스(실수 방지)
    setTimeout(() => {
      try {
        (destructive ? cancelBtn : confirmBtn).focus();
      } catch {}
    }, 50);
  });
}

/**
 * 일반 confirm() 대체. 간단한 message 하나만 받고 Promise<boolean> 반환.
 */
export function confirmSimple(message, { destructive = false } = {}) {
  return confirmAction({
    title: destructive ? '정말 삭제할까요?' : '확인',
    message,
    destructive,
    confirmLabel: destructive ? '삭제' : '확인',
    cancelLabel: '취소',
  });
}

// ── long-press 2초 홀드 ────────────────────────────────────────
function _bindLongPress(btn, durationMs, onComplete) {
  let timer = null;
  let startAt = 0;
  let rafId = null;
  const fill = btn.querySelector('.long-press-fill');

  const start = (e) => {
    e.preventDefault();
    if (timer) return;
    startAt = Date.now();
    btn.classList.add('pressing');
    timer = setTimeout(() => {
      btn.classList.remove('pressing');
      onComplete();
    }, durationMs);
    const tick = () => {
      const elapsed = Date.now() - startAt;
      const ratio = Math.min(1, elapsed / durationMs);
      if (fill) fill.style.width = (ratio * 100) + '%';
      if (ratio < 1 && timer) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  };
  const end = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    btn.classList.remove('pressing');
    if (fill) fill.style.width = '0%';
  };

  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel', 'blur'].forEach(evt =>
    btn.addEventListener(evt, end)
  );
}

// ── XSS 방지용 간단 escape ─────────────────────────────────────
function _escape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 전역 노출 (HTML onclick 에서 쓰기 위함) ────────────────────
if (typeof window !== 'undefined') {
  window.confirmAction = confirmAction;
  window.confirmSimple = confirmSimple;
}
