// ================================================================
// navigation.js — 탭 드래그, 스와이프, 탭 가시성/순서
// ================================================================

import { saveTabOrder, getVisibleTabs, saveVisibleTabs } from './data.js';
import { closeModal, openModal } from './app/overlay-stack.js';
import { showToast } from './ui/toast.js';

let _getCurrentTab = () => 'home';
let _switchTab = () => undefined;

export function configureNavigation({ getCurrentTab, switchTab } = {}) {
  if (typeof getCurrentTab === 'function') _getCurrentTab = getCurrentTab;
  if (typeof switchTab === 'function') _switchTab = switchTab;
}

// ── 탭 드래그 순서 변경 ──────────────────────────────────────────
export function initTabDrag() {
  const nav = document.getElementById('tab-nav');
  if (!nav) return;
  let _dragSrc = null;

  nav.addEventListener('dragstart', e => {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (!btn) return;
    _dragSrc = btn;
    btn.classList.add('tab-dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  nav.addEventListener('dragover', e => {
    e.preventDefault();
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (!btn || btn === _dragSrc) return;
    nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-drag-over'));
    btn.classList.add('tab-drag-over');
  });

  nav.addEventListener('dragleave', e => {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (btn) btn.classList.remove('tab-drag-over');
  });

  nav.addEventListener('drop', e => {
    e.preventDefault();
    const btn = e.target.closest('.tab-btn[data-tab]');
    nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-drag-over'));
    if (!btn || !_dragSrc || btn === _dragSrc) return;

    const btns    = [...nav.querySelectorAll('.tab-btn[data-tab]')];
    const srcIdx  = btns.indexOf(_dragSrc);
    const tgtIdx  = btns.indexOf(btn);
    if (srcIdx < tgtIdx) nav.insertBefore(_dragSrc, btn.nextSibling);
    else                 nav.insertBefore(_dragSrc, btn);

    const newOrder = [...nav.querySelectorAll('.tab-btn[data-tab]')].map(b => b.dataset.tab);
    saveTabOrder(newOrder);
  });

  nav.addEventListener('dragend', e => {
    nav.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('tab-dragging', 'tab-drag-over');
    });
    _dragSrc = null;
  });
}

// ── 모바일 스와이프 탭 전환 (슬라이드 애니메이션) ─────────────────
export function initSwipeNavigation() {
  let startX = 0, startY = 0, startTime = 0;
  let tracking = false, swiping = false;
  let curPanel = null, nextPanel = null, swipeDir = 0;
  const W = () => window.innerWidth;

  function getSwipeableTabs() {
    // 어드민 탭에서는 스와이프 비활성화
    if (_getCurrentTab() === 'admin') return [];
    return [...document.querySelectorAll('#tab-nav .tab-btn[data-tab]')]
      .filter(b => b.style.display !== 'none' && !b.closest('.more-menu-dynamic-tabs'))
      .map(b => b.dataset.tab)
      .filter(t => document.getElementById('tab-' + t));
  }

  function getNextTab(dir) {
    const tabs = getSwipeableTabs();
    const idx = tabs.indexOf(_getCurrentTab());
    if (idx === -1) return null;
    const ni = idx + dir;
    return (ni >= 0 && ni < tabs.length) ? tabs[ni] : null;
  }

  function isModalInteraction(target = null) {
    return !!document.querySelector('.modal.open, .modal-backdrop.open, .modal-overlay.open, .sheet-overlay.open')
      || !!target?.closest?.('.modal, .modal-backdrop, .modal-overlay, .sheet-overlay');
  }

  function isSwipeNavigationLocked(target = null) {
    return !!target?.closest?.('[data-swipe-nav-lock], .diet-frequent-food-carousel, .diet-frequent-food-options');
  }

  document.body.addEventListener('touchstart', e => {
    if (isModalInteraction(e.target)) return;
    const t = e.target;
    if (isSwipeNavigationLocked(t) ||
        t.closest('.tab-nav') || t.closest('input[type="range"]') ||
        t.closest('canvas') || t.closest('textarea') ||
        t.closest('.grid-wrap') ||
        t.closest('#neighbor-section') || t.closest('.friend-paging-controls') ||
        t.closest('#friend-feed')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    tracking = true;
    swiping = false;
    curPanel = null;
    nextPanel = null;
    swipeDir = 0;
  }, { passive: true });

  document.body.addEventListener('touchmove', e => {
    if (!tracking) return;
    if (isModalInteraction(e.target)) { tracking = false; _cleanupSwipe(); return; }
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const dx = cx - startX;
    const dy = cy - startY;

    if (!swiping) {
      if (Math.abs(dy) > Math.abs(dx) * 0.8 && Math.abs(dy) > 15) {
        tracking = false; return;
      }
      if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiping = true;
        swipeDir = dx < 0 ? 1 : -1;
        const nextTab = getNextTab(swipeDir);
        if (!nextTab) { tracking = false; return; }

        curPanel = document.getElementById('tab-' + _getCurrentTab());
        nextPanel = document.getElementById('tab-' + nextTab);

        nextPanel.style.transition = 'none';
        nextPanel.style.transform = `translateX(${swipeDir * 100}%)`;
        nextPanel.style.display = 'block';
        nextPanel.style.position = 'absolute';
        nextPanel.style.top = curPanel.offsetTop + 'px';
        nextPanel.style.left = '0';
        nextPanel.style.right = '0';
        curPanel.style.transition = 'none';
      }
      return;
    }

    if (!curPanel || !nextPanel) return;

    const pct = (dx / W()) * 100;
    curPanel.style.transform = `translateX(${pct}%)`;
    nextPanel.style.transform = `translateX(${swipeDir * 100 + pct}%)`;
  }, { passive: true });

  document.body.addEventListener('touchend', e => {
    if (!tracking) return;
    if (isModalInteraction(e.target)) { tracking = false; _cleanupSwipe(); return; }
    tracking = false;
    if (!swiping || !curPanel || !nextPanel) {
      _cleanupSwipe();
      return;
    }

    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX;
    const elapsed = Math.max(Date.now() - startTime, 1);
    const velocity = Math.abs(dx) / elapsed;
    const ratio = Math.abs(dx) / W();

    const doSwitch = (ratio > 0.3 || (velocity > 0.4 && Math.abs(dx) > 40))
                     && (dx < 0 ? swipeDir === 1 : swipeDir === -1);

    const duration = Math.max(120, Math.min(300, (1 - ratio) * 300));

    if (doSwitch) {
      curPanel.style.transition = `transform ${duration}ms ease-out`;
      nextPanel.style.transition = `transform ${duration}ms ease-out`;
      curPanel.style.transform = `translateX(${-swipeDir * 100}%)`;
      nextPanel.style.transform = 'translateX(0)';

      setTimeout(() => {
        const nextTab = getNextTab(swipeDir);
        curPanel.style.cssText = '';
        nextPanel.style.cssText = '';
        if (nextTab) _switchTab(nextTab);
      }, duration + 10);
    } else {
      curPanel.style.transition = `transform ${duration}ms ease-out`;
      nextPanel.style.transition = `transform ${duration}ms ease-out`;
      curPanel.style.transform = 'translateX(0)';
      nextPanel.style.transform = `translateX(${swipeDir * 100}%)`;

      setTimeout(() => _cleanupSwipe(), duration + 10);
    }
  }, { passive: true });

  document.body.addEventListener('touchcancel', () => {
    tracking = false;
    _cleanupSwipe();
  }, { passive: true });

  function _cleanupSwipe() {
    if (curPanel) curPanel.style.cssText = '';
    if (nextPanel) { nextPanel.style.cssText = ''; nextPanel.classList.remove('active'); }
    curPanel = null;
    nextPanel = null;
    swiping = false;
  }
}

// ── 탭 순서 적용 ────────────────────────────────────────────────
export function applyTabOrder(order) {
  const nav = document.getElementById('tab-nav');
  if (!nav || !order?.length) return;
  // 호출자가 넘긴 배열을 splice로 직접 고치면, 저장된 탭 순서를 그대로 넘긴
  // 경우 그 배열까지 함께 바뀐다. 사본에만 diet를 끼워 넣는다.
  const normalizedOrder = [...order];
  if (!normalizedOrder.includes('diet')) {
    const wIdx = normalizedOrder.indexOf('workout');
    normalizedOrder.splice(wIdx >= 0 ? wIdx : 1, 0, 'diet');
  }
  const settingsBtn = nav.querySelector('.tab-btn-settings');
  normalizedOrder.forEach(tabId => {
    const btn = nav.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) nav.insertBefore(btn, settingsBtn);
  });
}

// ── 하단 탭 가시성 ──────────────────────────────────────────────
const ALL_CONFIGURABLE_TABS = [
  { id: 'home',     icon: 'home', label: '홈',      fixed: true },
  { id: 'diet',     icon: 'diet', label: '식단' },
  { id: 'workout',  icon: 'workout', label: '운동' },
  { id: 'stats',    icon: 'stats', label: '통계' },
];

function createTabIcon(icon) {
  const span = document.createElement('span');
  span.className = `tab-icon nav-icon nav-icon-${icon}`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function tabIconHtml(icon) {
  return `<span class="tab-icon nav-icon nav-icon-${icon}" aria-hidden="true"></span>`;
}

export function applyVisibleTabs(visibleTabs) {
  const nav = document.getElementById('tab-nav');
  if (!nav) return;
  const dynamicContainer = document.getElementById('more-menu-dynamic-tabs');
  if (dynamicContainer) dynamicContainer.innerHTML = '';

  ALL_CONFIGURABLE_TABS.forEach(t => {
    if (t.fixed) return;
    const btn = nav.querySelector(`.tab-btn[data-tab="${t.id}"]`);
    if (!btn) return;
    const isVisible = visibleTabs.includes(t.id);
    btn.style.display = isVisible ? '' : 'none';

    if (!isVisible && dynamicContainer) {
      const item = document.createElement('button');
      item.className = 'more-menu-item tab-btn';
      item.type = 'button';
      item.dataset.tab = t.id;
      item.dataset.appAction = 'switch-tab-close-more';
      const label = document.createElement('span');
      label.textContent = t.label;
      item.append(createTabIcon(t.icon), label);
      dynamicContainer.appendChild(item);
    }
  });
}

// ── 탭 설정 모달 ────────────────────────────────────────────────
export function openTabSettingsModal() {
  const list = document.getElementById('tab-settings-list');
  if (!list) return;
  const current = getVisibleTabs();
  list.innerHTML = ALL_CONFIGURABLE_TABS.filter(t => !t.fixed).map(t => {
    const checked = current.includes(t.id) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius-md);background:var(--surface2);cursor:pointer;">
      <input type="checkbox" data-tab-id="${t.id}" ${checked} style="width:18px;height:18px;accent-color:var(--primary);">
      ${tabIconHtml(t.icon)}
      <span style="font-size:14px;font-weight:500;color:var(--text);">${t.label}</span>
    </label>`;
  }).join('');
  openModal('tab-settings-modal');
}

export function closeTabSettingsModal(e) {
  closeModal('tab-settings-modal', e);
}

export async function saveTabSettingsFromModal() {
  const checks = document.querySelectorAll('#tab-settings-list input[data-tab-id]');
  const selected = ['home'];
  checks.forEach(c => { if (c.checked) selected.push(c.dataset.tabId); });
  await saveVisibleTabs(selected);
  applyVisibleTabs(selected);
  closeModal('tab-settings-modal');
  showToast('탭 설정이 저장되었습니다');
}
