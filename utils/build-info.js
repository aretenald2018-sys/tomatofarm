// ================================================================
// utils/build-info.js — 배포 버전 확인 + 서비스워커 업데이트 배너
// ================================================================

let _buildInfoCache = null;
let _updateBannerShown = false;

function _buildInfoUrl({ bust = true } = {}) {
  const url = new URL('../build-info.json', import.meta.url);
  if (bust) url.searchParams.set('t', Date.now().toString());
  return url;
}

function _fallbackBuildInfo(error = null) {
  return {
    app: 'tomatofarm',
    commit: 'unknown',
    shortCommit: 'unknown',
    branch: 'unknown',
    deployedAt: 'unknown',
    cacheVersion: 'unknown',
    error: error ? String(error?.message || error) : null,
  };
}

function _shortCommit(info) {
  const raw = String(info?.shortCommit || info?.commit || '').trim();
  if (!raw) return 'unknown';
  return raw.length > 12 ? raw.slice(0, 12) : raw;
}

function _formatDateTime(value) {
  if (!value || value === 'local' || value === 'unknown') return value || 'unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function _esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export async function loadBuildInfo({ force = false } = {}) {
  if (_buildInfoCache && !force) return _buildInfoCache;
  try {
    const res = await fetch(_buildInfoUrl({ bust: force }), { cache: 'no-store' });
    if (!res.ok) throw new Error(`build-info HTTP ${res.status}`);
    const info = await res.json();
    _buildInfoCache = {
      ...info,
      shortCommit: info.shortCommit || String(info.commit || '').slice(0, 12),
      loadedAt: new Date().toISOString(),
    };
  } catch (error) {
    _buildInfoCache = _fallbackBuildInfo(error);
  }
  window.__BUILD_INFO = _buildInfoCache;
  return _buildInfoCache;
}

export async function renderBuildInfo({ targetId = 'settings-build-info', force = true } = {}) {
  const target = document.getElementById(targetId);
  if (!target) return null;
  target.innerHTML = '<div class="settings-build-info-loading">버전 확인 중...</div>';
  const info = await loadBuildInfo({ force });
  const commit = _shortCommit(info);
  const cacheVersion = info?.cacheVersion || 'unknown';
  const branch = info?.branch || 'unknown';
  const deployedAt = _formatDateTime(info?.deployedAt);
  const errorLine = info?.error
    ? `<div class="settings-build-info-error">build-info 확인 실패: ${_esc(info.error)}</div>`
    : '';
  target.innerHTML = `
    <div class="settings-build-info-head">
      <span>현재 앱 버전</span>
      <strong>${_esc(commit)}</strong>
    </div>
    <div class="settings-build-info-grid">
      <span>브랜치</span><b>${_esc(branch)}</b>
      <span>캐시</span><b>${_esc(cacheVersion)}</b>
      <span>배포</span><b>${_esc(deployedAt)}</b>
    </div>
    ${errorLine}
    <button type="button" class="settings-build-info-refresh" id="settings-build-info-refresh">다시 확인</button>
  `;
  document.getElementById('settings-build-info-refresh')?.addEventListener('click', () => {
    renderBuildInfo({ targetId, force: true });
  });
  return info;
}

export function showAppUpdateBanner(registration = null) {
  if (_updateBannerShown) return;
  _updateBannerShown = true;
  const existing = document.getElementById('app-update-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'app-update-banner';
  banner.className = 'app-update-banner';
  banner.innerHTML = `
    <span>새 버전이 준비됐어요</span>
    <button type="button" id="app-update-reload">새로고침</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('app-update-reload')?.addEventListener('click', () => {
    const waiting = registration?.waiting;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  });
}

export function initBuildInfoSurface() {
  window.__showAppUpdateBanner = showAppUpdateBanner;
  loadBuildInfo({ force: false }).catch(() => {});
}
