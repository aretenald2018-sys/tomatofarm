// ================================================================
// utils/form-guard.js — 모달 폼 미저장 이탈 감지
//   - createFormGuard(modalEl) → { isDirty(), confirmDiscard(), commit(), destroy() }
//   - snapshot: 모달 내부 input/textarea/select 의 value/checked 를 직렬화
//   - commit(): 저장 후 호출하여 "dirty" 상태를 초기화
//   - confirmDiscard(): dirty일 때 confirm-modal 띄워 Promise<boolean> 반환
//     true = 변경 버리고 닫기 OK / false = 계속 편집
//
// 사용 예:
//   const guard = createFormGuard(document.getElementById('my-modal'));
//   async function handleClose() {
//     if (guard.isDirty() && !(await guard.confirmDiscard())) return;
//     closeModal('my-modal');
//     guard.destroy();
//   }
// ================================================================

import { confirmAction } from './confirm-modal.js';

/**
 * @param {HTMLElement} modalEl
 * @param {object} [opts]
 * @param {string} [opts.discardMessage] - 확인 모달 메시지 커스텀
 * @returns {{ isDirty: () => boolean, confirmDiscard: () => Promise<boolean>, commit: () => void, destroy: () => void, snapshot: () => object }}
 */
export function createFormGuard(modalEl, opts = {}) {
  if (!modalEl) {
    return {
      isDirty: () => false,
      confirmDiscard: async () => true,
      commit: () => {},
      destroy: () => {},
      snapshot: () => ({}),
    };
  }

  const {
    discardMessage = '저장하지 않은 변경이 있어요.\n계속 닫으면 입력한 내용이 사라져요.',
  } = opts;

  let baseline = _snapshot(modalEl);
  let destroyed = false;

  const guard = {
    isDirty() {
      if (destroyed) return false;
      const now = _snapshot(modalEl);
      return _diff(baseline, now);
    },
    async confirmDiscard() {
      if (!guard.isDirty()) return true;
      return confirmAction({
        title: '변경사항을 버릴까요?',
        message: discardMessage,
        confirmLabel: '버리기',
        cancelLabel: '계속 편집',
        destructive: true,
      });
    },
    commit() {
      if (destroyed) return;
      baseline = _snapshot(modalEl);
    },
    destroy() {
      destroyed = true;
      baseline = null;
    },
    snapshot: () => _snapshot(modalEl),
  };

  return guard;
}

/**
 * 지정 selector 요소에 click 리스너를 달아 "dirty 체크 후 닫기" 로직을 자동 적용.
 *
 * @param {HTMLElement} modalEl
 * @param {string|HTMLElement[]} triggers - selector 또는 요소 배열
 * @param {() => void} doClose - 실제 닫기 동작
 * @param {object} [opts] - createFormGuard opts
 * @returns {{ guard: object, unbind: () => void }}
 */
export function registerFormGuard(modalEl, triggers, doClose, opts = {}) {
  const guard = createFormGuard(modalEl, opts);
  const els = typeof triggers === 'string'
    ? Array.from(modalEl.querySelectorAll(triggers))
    : (triggers || []);

  const handler = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (guard.isDirty() && !(await guard.confirmDiscard())) return;
    doClose();
    guard.destroy();
  };

  els.forEach(el => el.addEventListener('click', handler));

  return {
    guard,
    unbind: () => els.forEach(el => el.removeEventListener('click', handler)),
  };
}

// ── 내부: 스냅샷 / 비교 ────────────────────────────────────────
function _snapshot(root) {
  const result = {};
  const inputs = root.querySelectorAll('input, textarea, select');
  inputs.forEach((el, idx) => {
    const key = el.id || el.name || `__idx_${idx}`;
    if (el.type === 'checkbox' || el.type === 'radio') {
      result[key] = { v: !!el.checked };
    } else if (el.tagName === 'SELECT' && el.multiple) {
      result[key] = { v: Array.from(el.selectedOptions).map(o => o.value).join(',') };
    } else {
      result[key] = { v: el.value ?? '' };
    }
  });
  return result;
}

function _diff(a, b) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k]?.v ?? '';
    const bv = b[k]?.v ?? '';
    if (av !== bv) return true;
  }
  return false;
}

// ── 전역 노출 ──────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.createFormGuard = createFormGuard;
  window.registerFormGuard = registerFormGuard;
}
