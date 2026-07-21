const openModalStack = [];
const modalFocusOrigins = new Map();
let initialized = false;

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function getFocusableElements(root) {
  return Array.from(root?.querySelectorAll?.(FOCUSABLE_SELECTOR) || [])
    .filter(element => !element.hidden && element.getAttribute?.('aria-hidden') !== 'true');
}

export function prepareModalAccessibility(element) {
  if (!element) return null;
  element.setAttribute('aria-hidden', 'false');
  const panel = element.matches?.('[role="dialog"]')
    ? element
    : element.querySelector?.('[role="dialog"], .modal-sheet, .tds-modal-sheet, .tds-sheet');
  if (!panel) return element;
  if (!panel.getAttribute?.('role')) panel.setAttribute?.('role', 'dialog');
  panel.setAttribute?.('aria-modal', 'true');
  if (!panel.getAttribute?.('tabindex')) panel.setAttribute?.('tabindex', '-1');
  return panel;
}

function syncBodyScroll() {
  if (typeof document === 'undefined') return;
  document.body.style.overflow = openModalStack.length ? 'hidden' : '';
}

export function openModal(id) {
  const element = document.getElementById(id);
  if (!element) return false;
  const origin = document.activeElement;
  if (origin?.focus && !element.contains?.(origin)) modalFocusOrigins.set(id, origin);
  element.classList.add('open');
  const panel = prepareModalAccessibility(element);
  const previousIndex = openModalStack.indexOf(id);
  if (previousIndex >= 0) openModalStack.splice(previousIndex, 1);
  openModalStack.push(id);
  syncBodyScroll();
  const initialFocus = element.querySelector?.('[autofocus]') || getFocusableElements(panel)[0] || panel;
  initialFocus?.focus?.({ preventScroll: true });
  return true;
}

// 배경 클릭은 닫고 시트 내부 클릭은 유지하되, 시트 안의 명시적 닫기 컨트롤은
// 닫아야 한다. action-router가 가장 가까운 [data-action]을 컨트롤로 넘기므로
// 내부 여백 클릭은 backdrop 자신으로 해석되고, 닫기 버튼은 버튼으로 해석된다.
export function isModalCloseGesture(element, event) {
  const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
  if (!target) return true;
  if (target === element) return true;
  const control = target.closest?.('[data-action], [data-app-action]');
  return !!control && control !== element;
}

export function closeModal(id, event) {
  const element = document.getElementById(id);
  if (!element) return false;
  if (event && !isModalCloseGesture(element, event)) return false;
  element.classList.remove('open');
  element.setAttribute('aria-hidden', 'true');
  const index = openModalStack.lastIndexOf(id);
  if (index >= 0) openModalStack.splice(index, 1);
  syncBodyScroll();
  const origin = modalFocusOrigins.get(id);
  modalFocusOrigins.delete(id);
  if (origin?.focus && origin.isConnected !== false) origin.focus({ preventScroll: true });
  return true;
}

export function closeTopModal() {
  const id = openModalStack.at(-1);
  return id ? closeModal(id) : false;
}

export function getOpenModalStack() {
  return [...openModalStack];
}

export function initOverlayStack() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTopModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const id = openModalStack.at(-1);
    const modal = id ? document.getElementById(id) : null;
    const focusable = getFocusableElements(modal);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
