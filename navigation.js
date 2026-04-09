// ================================================================
// navigation.js — 탭 드래그, 스와이프, 탭 가시성/순서
// ================================================================

import { saveTabOrder, getVisibleTabs, saveVisibleTabs } from './data.js';
import { showToast } from './render-home.js';

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
    return [...document.querySelectorAll('#tab-nav .tab-btn[data-tab]')]
      .filter(b => b.style.display !== 'none' && !b.closest('.more-menu-dynamic-tabs'))
      .map(b => b.dataset.tab)
      .filter(t => document.getElementById('tab-' + t));
  }

  function getNextTab(dir) {
    const tabs = getSwipeableTabs();
    const idx = tabs.indexOf(window._getCurrentTab());
    if (idx === -1) return null;
    const ni = idx + dir;
    return (ni >= 0 && ni < tabs.length) ? tabs[ni] : null;
  }

  document.body.addEventListener('touchstart', e => {
    if (document.querySelector('.modal.open')) return;
    const t = e.target;
    if (t.closest('.tab-nav') || t.closest('input[type="range"]') ||
        t.closest('canvas') || t.closest('textarea') ||
        t.closest('.dash-board') || t.closest('.stock-panel') ||
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

        curPanel = document.getElementById('tab-' + window._getCurrentTab());
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
        if (nextTab) window.switchTab(nextTab);
      }, duration + 10);
    } else {
      curPanel.style.transition = `transform ${duration}ms ease-out`;
      nextPanel.style.transition = `transform ${duration}ms ease-out`;
      curPanel.style.transform = 'translateX(0)';
      nextPanel.style.transform = `translateX(${swipeDir * 100}%)`;

      setTimeout(() => _cleanupSwipe(), duration + 10);
    }
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
  if (!order.includes('diet')) {
    const wIdx = order.indexOf('workout');
    order.splice(wIdx >= 0 ? wIdx : 1, 0, 'diet');
  }
  const settingsBtn = nav.querySelector('.tab-btn-settings');
  order.forEach(tabId => {
    const btn = nav.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) nav.insertBefore(btn, settingsBtn);
  });
}

// ── 하단 탭 가시성 ──────────────────────────────────────────────
const ALL_CONFIGURABLE_TABS = [
  { id: 'home',     icon: '🏠', label: '홈',      fixed: true },
  { id: 'diet',     icon: '🥗', label: '식단' },
  { id: 'workout',  icon: '💪', label: '운동' },
  { id: 'stats',    icon: '📊', label: '통계' },
];

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
      item.dataset.tab = t.id;
      item.textContent = `${t.icon} ${t.label}`;
      item.onclick = () => { window.switchTab(t.id); toggleMoreMenu(); };
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
      <span style="font-size:18px;">${t.icon}</span>
      <span style="font-size:14px;font-weight:500;color:var(--text);">${t.label}</span>
    </label>`;
  }).join('');
  document.getElementById('tab-settings-modal').classList.add('open');
}

export function closeTabSettingsModal(e) {
  if (e && e.target !== document.getElementById('tab-settings-modal')) return;
  document.getElementById('tab-settings-modal').classList.remove('open');
}

export async function saveTabSettingsFromModal() {
  const checks = document.querySelectorAll('#tab-settings-list input[data-tab-id]');
  const selected = ['home'];
  checks.forEach(c => { if (c.checked) selected.push(c.dataset.tabId); });
  await saveVisibleTabs(selected);
  applyVisibleTabs(selected);
  document.getElementById('tab-settings-modal').classList.remove('open');
  showToast('탭 설정이 저장되었습니다');
}

// ── window 등록 ─────────────────────────────────────────────────
Object.assign(window, {
  openTabSettingsModal,
  closeTabSettingsModal,
  saveTabSettingsFromModal,
});
