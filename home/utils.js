// ================================================================
// home/utils.js — 홈 탭 공통 헬퍼
// ================================================================

import { dateKey } from '../data.js';
import { getAdminId, getAdminGuestId } from '../data.js';

// ── 날짜 유틸 ────────────────────────────────────────────────────
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function quarterStart(date) {
  const q = Math.floor(date.getMonth() / 3);
  return dateKey(date.getFullYear(), q * 3, 1);
}

export function quarterEnd(date) {
  const q = Math.floor(date.getMonth() / 3);
  const endMonth = q * 3 + 2;
  const endDay   = new Date(date.getFullYear(), endMonth + 1, 0).getDate();
  return dateKey(date.getFullYear(), endMonth, endDay);
}

// ── 시간 포맷 ────────────────────────────────────────────────────
export function formatTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  const d = Math.floor(h / 24);
  if (d < 30) return d + '일 전';
  return Math.floor(d / 30) + '달 전';
}

// ── 이웃 별명 해석 ───────────────────────────────────────────────
export function resolveNickname(a, accounts) {
  let _raw = a.nickname || '';
  if (a.id === getAdminId()) {
    const _gst = accounts.find(x => x.id === getAdminGuestId());
    const baseFull = a.lastName + a.firstName;
    const _isReal = (n) => !n || n === baseFull || n === baseFull + '(Admin)' || n === baseFull + '(Guest)';
    if (_isReal(_raw) && _gst && !_isReal(_gst.nickname)) _raw = _gst.nickname;
  }
  const baseName = a.lastName + a.firstName.replace(/\(.*\)/, '');
  return (_raw && _raw !== baseName) ? _raw : baseName;
}

// ── TDS 토스트 알림 ──────────────────────────────────────────────
export function showToast(message, duration = 2500, type = 'default') {
  const existing = document.getElementById('tds-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'tds-toast';
  toast.className = 'tds-toast';
  toast.dataset.type = type;
  const icons = { success: '✓ ', error: '✕ ', warning: '⚠ ', info: 'ℹ ', default: '' };
  toast.textContent = (icons[type] || '') + message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── 화면 중앙 큰 토스트 (식단 저장 등) ──────────────────────────
export function showCenterToast(message, duration = 1800) {
  const existing = document.getElementById('tds-center-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'tds-center-toast';
  toast.className = 'tds-center-toast';
  toast.innerHTML = `<span class="tds-center-toast-icon">✓</span><span>${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Confetti 축하 애니메이션 ─────────────────────────────────────
export function showConfetti(duration = 3000) {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  const colors = ['#fa342c','#fc6a66','#fe928d','#fed4d2','#ca1d13','#fdf0f0'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = (Math.random() * 0.6) + 's';
    p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    p.style.width = (6 + Math.random() * 6) + 'px';
    p.style.height = (6 + Math.random() * 6) + 'px';
    if (Math.random() > 0.5) p.style.borderRadius = '50%';
    container.appendChild(p);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), duration);
}
window._showConfetti = showConfetti;

// ── 햅틱 피드백 ─────────────────────────────────────────────────
export function haptic(pattern = 'light') {
  if (!navigator.vibrate) return;
  const patterns = {
    light: [10],
    medium: [30],
    success: [10, 50, 20],
    celebration: [50, 30, 50, 30, 100],
  };
  navigator.vibrate(patterns[pattern] || patterns.light);
}

// ── DOM 유틸 ─────────────────────────────────────────────────────
export function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
