// ================================================================
// utils/ux-polish.js — Phase D/E UX 폴리시 유틸
//   - 오프라인 배너 (navigator.online 감시)
//   - 모달 포커스 트랩 (열린 모달에서 Tab 순회 가둠)
//   - aria-label 자동 주입 헬퍼
// ================================================================

// ── 오프라인 배너 ───────────────────────────────────────────────
// CSS: style.css 의 #tds-offline-banner.visible
let _offlineBanner = null;
function _ensureOfflineBanner() {
  if (_offlineBanner) return _offlineBanner;
  const el = document.createElement('div');
  el.id = 'tds-offline-banner';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = '오프라인 상태 — 변경사항은 복구 시 동기화됩니다';
  document.body.appendChild(el);
  _offlineBanner = el;
  return el;
}

// navigator.onLine 은 힌트일 뿐이다. Android WebView 와 일부 데스크톱 네트워크
// 스택은 연결이 정상인데도 false 를 보고한다. 마지막 서버 왕복이 성공했다면
// 배너를 띄우지 않고, 실제로 실패했다면 onLine 이 true 여도 띄운다.
//
// 'pending' 은 서버 ack 를 못 받은 저장이다. 성공이 아니므로 이전 'ok' 증거를
// 무효화한다. 이렇게 해야 부팅 때 한 번 성공한 세션이 그 뒤 실제로 오프라인이
// 되어 기록이 기기에만 쌓이는 동안에도 사용자가 그 사실을 알 수 있다.
const _SYNC_STATES = new Set(['ok', 'err', 'pending']);
let _lastSyncState = null;

function _updateOnlineStatus() {
  const el = _ensureOfflineBanner();
  const offline = _lastSyncState === 'err' || (!navigator.onLine && _lastSyncState !== 'ok');
  el.classList.toggle('visible', offline);
}

export function initOfflineBanner() {
  _ensureOfflineBanner();
  window.addEventListener('online', _updateOnlineStatus);
  window.addEventListener('offline', _updateOnlineStatus);
  document.addEventListener('data:sync-status', (event) => {
    const state = event?.detail?.state;
    if (!_SYNC_STATES.has(state)) return;
    _lastSyncState = state;
    _updateOnlineStatus();
  });
  _updateOnlineStatus(); // 초기 상태
}

// ── 모달 포커스 트랩 ────────────────────────────────────────────
// CLAUDE.md 규칙: 단일 버튼에 이벤트 위임 or onclick 하나만 — 여기는
// 글로벌 keydown 위임이라 충돌 없음. (모달 onclick close 는 backdrop 용)
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function _getTopOpenModal() {
  // 열린 모달 중 z-index 가장 높은 것 — 스택 구조가 없다면 마지막 open 을 선택
  const opened = document.querySelectorAll('.modal-backdrop.open, .modal.open, [class*="modal"].open');
  if (!opened.length) return null;
  return opened[opened.length - 1];
}

export function initModalFocusTrap() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const modal = _getTopOpenModal();
    if (!modal) return;

    const focusables = Array.from(modal.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null); // 숨겨진 요소 제외
    if (!focusables.length) return;

    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !modal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !modal.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

// ── aria-label 자동 주입 ────────────────────────────────────────
// 아이콘-only 버튼에 label 없으면 textContent 기반으로 자동 주입 (일반적이진 않지만
// 이모지 only 버튼이 많은 이 앱에 한정)
export function autoFillAriaLabels(root = document) {
  root.querySelectorAll('button, [role="button"]').forEach(btn => {
    if (btn.hasAttribute('aria-label')) return;
    const txt = (btn.textContent || '').trim();
    // 이모지/기호만 있는 짧은 텍스트 or 빈 텍스트 — title 이나 data-tip 으로 fallback
    if (!txt || txt.length <= 2) {
      const label = btn.getAttribute('title') || btn.dataset.tip || btn.dataset.label;
      if (label) btn.setAttribute('aria-label', label);
    }
  });
}

// ── 공통 초기화 ────────────────────────────────────────────────
export function initUxPolish() {
  try { initOfflineBanner(); } catch(e) { console.warn('[ux-polish] offline banner init 실패:', e); }
  try { initModalFocusTrap(); } catch(e) { console.warn('[ux-polish] focus trap init 실패:', e); }
  try { autoFillAriaLabels(); } catch(e) { console.warn('[ux-polish] aria-label init 실패:', e); }
}
