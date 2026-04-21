// ================================================================
// utils/action-router.js — 전역 data-action 이벤트 위임 라우터
// ================================================================
// 목적: HTML `onclick="foo()"` + `window.foo = foo` 패턴을 점진적으로
//       `<button data-action="ns:foo">` + registerAction('ns:foo', fn) 으로 치환.
//
// 사용법:
//   import { registerAction } from './utils/action-router.js';
//   registerAction('app:toggleMoreMenu', () => { ... });
//   // HTML: <button data-action="app:toggleMoreMenu">더보기</button>
//
// ⚠️ 네임스페이스 prefix 강제 (Codex 리뷰 #1 대응):
//   - 액션 이름은 반드시 `<namespace>:<name>` 형태 (예: 'app:save', 'home:openCard').
//   - 콜론 없는 평범한 이름('save', 'cancel', 'close', 'add' 등)은 라우터가 무시한다.
//   - 이미 expert.js / 다른 모듈이 `data-action="save|cancel|close|add"` 같은 일반
//     값을 로컬 `el.querySelector('[data-action="..."]')` 패턴으로 쓰고 있어,
//     prefix 없는 이름을 라우터가 잡으면 미래에 충돌. 구조적으로 차단.
//
// 보조 data-속성:
//   - data-action-arg="..."  → handler(el, e, arg) 3번째 인자로 전달
//   - data-* 전체는 el.dataset 로 직접 접근 가능
//
// 기존 onclick 과 공존. 이벤트 위임은 document 레벨 1회 등록이라
// 개별 요소 재바인딩 불필요. SPA 내부 DOM 재렌더에도 자동 대응.

const _handlers = new Map();
let _initialized = false;

// 네임스페이스 prefix 검증 — `<word>:<word>` 형태만 허용.
function _isNamespaced(name) {
  return typeof name === 'string' && /^[a-zA-Z][\w-]*:[\w-]+$/.test(name);
}

export function registerAction(name, handler) {
  if (typeof handler !== 'function') {
    console.warn(`[action-router] ${name}: handler is not a function`);
    return;
  }
  if (!_isNamespaced(name)) {
    console.warn(`[action-router] '${name}' rejected — must be 'namespace:action' (e.g. 'app:save').`);
    return;
  }
  if (_handlers.has(name)) {
    console.warn(`[action-router] overriding existing action: ${name}`);
  }
  _handlers.set(name, handler);
}

export function registerActions(map) {
  if (!map || typeof map !== 'object') return;
  for (const [name, fn] of Object.entries(map)) registerAction(name, fn);
}

export function hasAction(name) {
  return _handlers.has(name);
}

function _onClick(e) {
  const el = e.target?.closest?.('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (!action) return;
  // prefix 없는 액션은 라우터 통과 — 로컬 핸들러(querySelector 등) 영역 보장.
  if (!_isNamespaced(action)) return;
  const handler = _handlers.get(action);
  if (!handler) return; // 등록 안 된 namespaced 액션도 통과 (기존 onclick 과 공존)
  const arg = el.dataset.actionArg;
  try {
    handler(el, e, arg);
  } catch (err) {
    console.error(`[action-router] ${action} handler error:`, err);
  }
}

export function initActionRouter() {
  if (_initialized) return;
  _initialized = true;
  document.addEventListener('click', _onClick);
}

// 비-모듈 호출부 호환
window.registerAction = registerAction;
window.registerActions = registerActions;
