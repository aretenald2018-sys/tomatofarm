// ================================================================
// utils/action-router.js — 전역 data-action 이벤트 위임 라우터
// ================================================================
// HTML과 동적 마크업의 data-action 계약을 단일 이벤트 위임으로 연결한다.
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

// 식단 패널이 자기 버튼의 click 을 직접 처리했음을 표시하는 이벤트 플래그.
// workout/render.js 의 bindDietFoodActions 가 같은 키를 세운다.
export const DIET_FOOD_HANDLED_FLAG = '__tomatoDietFoodHandled';

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

function _dispatch(e, attribute) {
  // 일부 Android WebView 클릭은 button 내부 Text 노드를 target으로 넘긴다.
  // Text에는 closest()가 없으므로 부모 요소로 정규화해야 식단 추가처럼
  // data-action만 사용하는 버튼이 조용히 무시되지 않는다.
  const target = e.target?.nodeType === 1 ? e.target : e.target?.parentElement;
  const el = target?.closest?.(`[${attribute}]`);
  if (!el) return;
  const action = el.getAttribute(attribute);
  if (!action) return;
  // 식단 추가 버튼은 패널이 직접 소유한다. 다만 그 바인딩이 아직 안 붙은
  // 시점(첫 날짜 하이드레이션 전)에도 버튼이 죽어 있으면 안 되므로, 위임을
  // 무조건 포기하지 않고 패널 핸들러가 이미 처리한 이벤트만 건너뛴다.
  if ((action === 'diet:add-food' || action === 'diet:add-frequent-food') && e[DIET_FOOD_HANDLED_FLAG]) return;
  // prefix 없는 액션은 라우터 통과 — 로컬 핸들러(querySelector 등) 영역 보장.
  if (!_isNamespaced(action)) return;
  const handler = _handlers.get(action);
  if (!handler) return; // 등록 안 된 namespaced 액션도 통과 (기존 onclick 과 공존)
  const arg = el.dataset.actionArg;
  try {
    const result = handler(el, e, arg);
    if (result && typeof result.catch === 'function') {
      result.catch((err) => console.error(`[action-router] ${action} handler error:`, err));
    }
  } catch (err) {
    console.error(`[action-router] ${action} handler error:`, err);
  }
}

function _onClick(e) { _dispatch(e, 'data-action'); }
function _onChange(e) { _dispatch(e, 'data-change-action'); }
function _onInput(e) { _dispatch(e, 'data-input-action'); }
function _onKeydown(e) { _dispatch(e, 'data-keydown-action'); }
function _onDoubleClick(e) { _dispatch(e, 'data-dblclick-action'); }
function _onFocusIn(e) { _dispatch(e, 'data-focus-action'); }
function _onFocusOut(e) { _dispatch(e, 'data-blur-action'); }

export function initActionRouter() {
  if (_initialized) return;
  _initialized = true;
  document.addEventListener('click', _onClick);
  document.addEventListener('change', _onChange);
  document.addEventListener('input', _onInput);
  document.addEventListener('keydown', _onKeydown);
  document.addEventListener('dblclick', _onDoubleClick);
  document.addEventListener('focusin', _onFocusIn);
  document.addEventListener('focusout', _onFocusOut);
}
