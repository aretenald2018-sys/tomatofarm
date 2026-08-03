import {
  TODAY,
  dateKey,
  getAccountList,
  getCurrentUser,
  getDay,
  getFriendWorkout,
  getMyFriends,
  getLikes,
  toggleLike,
  isSameInstance
} from '../data.js';
import { CONFIG } from '../config.js';
import { escapeHtml, resolveNickname, showToast } from './utils.js';
import { getRunningLiveState } from '../workout/running-live-state.js';
import {
  buildVworldTileUrl,
  normalizeRunningMapPoints,
  readRunningMapConfig,
  resolveRunningMapConfig
} from '../workout/running-map.js';
import {
  LIFE_ZONE_ACTORS,
  assignLifeZoneSlots,
  getLifeZoneAccountDisplayName,
  getLifeZoneActorReadCandidates,
  resolveLifeZoneConsultingVisitor,
  resolveLifeZoneActivity,
  resolveLifeZoneActors,
  resolveLifeZoneRoster
} from './life-zone-state.js';

const LIFE_ZONE_ASSET_ROOT = './assets/home/life-zone';
const LIFE_ZONE_SPRITE_ROOT = `${LIFE_ZONE_ASSET_ROOT}/sprites`;
const LIFE_ZONE_UI_ROOT = `${LIFE_ZONE_ASSET_ROOT}/ui`;
const LIFE_ZONE_WORLD_SIZE = 1672;
const LIFE_ZONE_MARQUEE_FRAME_SRC = `${LIFE_ZONE_UI_ROOT}/streak-marquee-frame-v3.png`;
const LIFE_ZONE_MARQUEE_FRAME_X = -196;
const LIFE_ZONE_MARQUEE_FRAME_Y = -324;
const LIFE_ZONE_MARQUEE_FRAME_SCALE = 0.8;
// Frame v3의 실제 LED 내부 사각형을 1672 월드로 변환한 안전 영역이다.
// 우측 상단은 장면 밖으로 기울어져 있으므로, 이 하단 중앙 평면만 정보 표시에 사용한다.
const MARQUEE_LED_PANEL = Object.freeze({
  x: 140,
  y: 188,
  width: 360,
  height: 168,
  rise: -168
});
const LIFE_ZONE_NPC_NAME = '트레이너';
const LIFE_ZONE_MIRANDA_NAME = '미란다';
const LIFE_ZONE_CONSULTING_CHIEF_NAME = '상담실장';
const LIFE_ZONE_CACHE_MS = 60_000;
const LIFE_ZONE_PHOTO_LIKE_REACTION = '\u2764';
const LIFE_ZONE_PHOTO_DOUBLE_TAP_MS = 320;
const RUNNING_MAP_WIDTH = 300;
const RUNNING_MAP_HEIGHT = 210;
const RUNNING_MAP_TILE_SIZE = 256;
const RUNNING_MAP_MIN_ZOOM = 10;
const RUNNING_MAP_MAX_ZOOM = 18;
const RUNNING_MAP_HOME_MAX_ZOOM = 14;
const RUNNING_MAP_SINGLE_POINT_ZOOM = 14;

let _actorStateCache = null;
let _lifeZoneVisitContext = null;
let _runningRecordEscHandler = null;
let _photoPreviewEscHandler = null;
let _marqueeFramePromise = null;

const STATE_LABELS = {
  running: '러닝',
  workout: '운동',
  diet: '식사',
  office: '업무'
};

function _fmtKcal(value) {
  return Number(value || 0).toLocaleString();
}

function _safeResolveNickname(account, accounts = []) {
  try {
    return resolveNickname(account, accounts);
  } catch {
    return account?.nickname || account?.id || '';
  }
}

function _enrichAccounts(accounts = []) {
  return accounts.map((account) => ({
    ...account,
    resolvedNickname: _safeResolveNickname(account, accounts)
  }));
}

function _mergeCurrentUser(accounts = [], currentUser = null) {
  if (!currentUser?.id || accounts.some((account) => account.id === currentUser.id)) return accounts;
  return [...accounts, { ...currentUser, resolvedNickname: _safeResolveNickname(currentUser, accounts) }];
}

function _isCurrentLifeZoneRosterActor(currentUser = null) {
  if (!currentUser?.id) return false;
  const accounts = _enrichAccounts([currentUser]);
  return resolveLifeZoneRoster({ accounts, currentUser }).some((actor) => actor.source === 'self');
}

export function setLifeZoneVisitContext(context = null) {
  _lifeZoneVisitContext = context && typeof context === 'object' ? { ...context } : null;
}

function _resolveConsultingVisitor() {
  const currentUser = getCurrentUser();
  if (_lifeZoneVisitContext?.userId && currentUser?.id && _lifeZoneVisitContext.userId !== currentUser.id) {
    return null;
  }
  const isRosterActor = _isCurrentLifeZoneRosterActor(currentUser);
  return resolveLifeZoneConsultingVisitor({
    currentUser,
    previousLastLoginAt: _lifeZoneVisitContext?.previousLastLoginAt || 0,
    createdAt: _lifeZoneVisitContext?.createdAt ?? currentUser?.createdAt,
    showCurrentUser: !isRosterActor
  });
}

function _renderConsultingVisitor(card, actors = LIFE_ZONE_ACTORS) {
  const visitorEl = card?.querySelector('[data-lz-consulting-visitor]');
  if (!visitorEl) return;
  const visitor = _resolveConsultingVisitor();
  if (!visitor) {
    visitorEl.hidden = true;
    delete visitorEl.dataset.lzVisitorState;
    visitorEl.removeAttribute('title');
    return;
  }
  const nameEl = visitorEl.querySelector('[data-lz-consulting-visitor-name]');
  if (nameEl) nameEl.textContent = visitor.displayName || getLifeZoneAccountDisplayName(getCurrentUser());
  visitorEl.hidden = false;
  visitorEl.dataset.lzVisitorState = visitor.state;
  visitorEl.title = visitor.state === 'returning'
    ? '10일 이상 미접속 복귀 상담'
    : visitor.state === 'current'
      ? '현재 계정 상담'
      : '신규 유저 상담';
}

function _readRunningLiveState() {
  const live = getRunningLiveState();
  return live?.active ? live : null;
}

function _withRunningLiveDay(dayData = {}, live = null) {
  if (!live?.active) return dayData || {};
  const route = Array.isArray(live.route) ? live.route : [];
  return {
    ...(dayData || {}),
    running: true,
    runLiveActive: true,
    lifeZoneRunningLive: true,
    lifeZoneRunningRoute: route,
    lifeZoneRunningRouteSummary: live.routeSummary || null,
    lifeZoneRunningPlaceSummary: live.placeSummary || dayData?.runPlaceSummary || dayData?.runData?.placeSummary || null,
    lifeZoneRunningPreviewPoint: live.previewPoint || null,
    lifeZoneRunningUpdatedAt: live.updatedAt || Date.now(),
    runRoute: route.length ? route : (dayData?.runRoute || []),
    runRouteSummary: live.routeSummary || dayData?.runRouteSummary || null,
    runPlaceSummary: live.placeSummary || dayData?.runPlaceSummary || null,
    runStartedAt: live.startedAt || dayData?.runStartedAt || Date.now()
  };
}

async function _readLifeZoneActorDay(actor, todayKey) {
  const candidates = getLifeZoneActorReadCandidates(actor);
  let emptyMatch = null;
  for (const ownerId of [...new Set(candidates)]) {
    const dayData = await getFriendWorkout(ownerId, todayKey);
    if (!dayData) continue;
    if (Object.keys(dayData).length > 0) return dayData;
    emptyMatch = dayData;
  }
  return emptyMatch || {};
}

function _defaultActorStates() {
  const currentUser = getCurrentUser();
  const accounts = currentUser ? _enrichAccounts([currentUser]) : [];
  const actors = resolveLifeZoneActors({ accounts, currentUser, dayByAccountId: {} });
  return actors.map((actor) => ({
    ...actor,
    source: actor.source || 'pending',
    canRead: actor.canRead || false
  }));
}

function _applyActorSlotPosition(element, slot) {
  element.style.setProperty('--lz-x', slot.x);
  element.style.setProperty('--lz-y', slot.y);
  element.style.setProperty('--lz-w', slot.width);
  element.style.setProperty('--lz-z', slot.z);
  if (slot.runDelay) element.style.setProperty('--lz-run-delay', slot.runDelay);
  if (slot.runDuration) element.style.setProperty('--lz-run-duration', slot.runDuration);
}

function _applyActorNameplatePosition(element, slot) {
  const gap = Number(slot.nameGap);
  element.style.setProperty('--lz-name-gap', `${Number.isFinite(gap) ? gap : 2}px`);
}

function _mapNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function _mapPoint(point = null) {
  const lat = _mapNumber(point?.lat ?? point?.latitude);
  const lng = _mapNumber(point?.lng ?? point?.lon ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat: Math.max(-85.0511, Math.min(85.0511, lat)),
    lng: ((lng + 540) % 360) - 180
  };
}

function _routeBoundsCenter(route = []) {
  if (!route.length) return null;
  let minLat = route[0].lat;
  let maxLat = route[0].lat;
  let minLng = route[0].lng;
  let maxLng = route[0].lng;
  route.forEach((point) => {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  });
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

function _clampRunningMapDot(point) {
  if (!point) return null;
  return {
    x: Math.max(6, Math.min(RUNNING_MAP_WIDTH - 6, point.x)),
    y: Math.max(6, Math.min(RUNNING_MAP_HEIGHT - 6, point.y))
  };
}

function _zoomForRunningMap(route = [], width = RUNNING_MAP_WIDTH, height = RUNNING_MAP_HEIGHT) {
  if (route.length < 2) return RUNNING_MAP_SINGLE_POINT_ZOOM;
  const padX = Math.min(58, Math.max(34, width * 0.18));
  const padY = Math.min(50, Math.max(30, height * 0.18));
  const maxSpanX = Math.max(96, width - padX * 2);
  const maxSpanY = Math.max(84, height - padY * 2);

  for (let zoom = RUNNING_MAP_HOME_MAX_ZOOM; zoom >= RUNNING_MAP_MIN_ZOOM; zoom -= 1) {
    const projected = route.map(point => _projectRunningMapPoint(point, zoom));
    const xs = projected.map(point => point.x);
    const ys = projected.map(point => point.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= maxSpanX && spanY <= maxSpanY) return zoom;
  }

  return RUNNING_MAP_MIN_ZOOM;
}

function _projectRunningMapPoint(point, zoom) {
  const p = _mapPoint(point);
  const sin = Math.sin(p.lat * Math.PI / 180);
  const world = RUNNING_MAP_TILE_SIZE * (2 ** zoom);
  return {
    x: (p.lng + 180) / 360 * world,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world
  };
}

function _tileModulo(value, max) {
  return ((value % max) + max) % max;
}

function _screenPoint(point, zoom, topLeft) {
  const projected = _projectRunningMapPoint(point, zoom);
  return {
    x: projected.x - topLeft.x,
    y: projected.y - topLeft.y
  };
}

function _readLifeZoneVworldMapConfig() {
  const config = readRunningMapConfig();
  if (config.provider === 'vworld' && config.configured) return config;
  const fallback = resolveRunningMapConfig({
    provider: 'vworld',
    vworldApiKey: CONFIG.MAPS?.VWORLD_API_KEY,
    vworldLayer: CONFIG.MAPS?.VWORLD_MAP_LAYER
  });
  return fallback.configured ? fallback : config;
}

function _withRunningMapMeta(payload, config = null) {
  const tiles = Array.isArray(payload?.tiles) ? payload.tiles : [];
  const route = Array.isArray(payload?.route) ? payload.route : [];
  return {
    ...payload,
    provider: config?.provider || 'none',
    configured: !!config?.configured,
    reason: config?.reason || '',
    tileCount: tiles.length,
    pointCount: route.length,
    hasPath: !!payload?.path
  };
}

function _buildRunningMapBubbleData(mapData = null) {
  const route = normalizeRunningMapPoints(mapData?.route || []);
  const mapImageDataUrl = String(mapData?.mapImageDataUrl || mapData?.routeSummary?.mapImageDataUrl || '');
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(mapImageDataUrl)) {
    return _withRunningMapMeta({
      state: 'image',
      route,
      tiles: [],
      path: '',
      dot: null,
      imageDataUrl: mapImageDataUrl,
    });
  }
  const previewPoint = _mapPoint(mapData?.previewPoint);
  const summaryCenter = _mapPoint(mapData?.routeSummary?.centroid);
  const center = _routeBoundsCenter(route) || previewPoint || summaryCenter;
  if (!center) {
    return _withRunningMapMeta({ state: 'waiting', route, tiles: [], path: '', dot: null });
  }

  const config = _readLifeZoneVworldMapConfig();
  if (!config.configured || config.provider !== 'vworld') {
    const dot = { x: RUNNING_MAP_WIDTH / 2, y: RUNNING_MAP_HEIGHT / 2 };
    return _withRunningMapMeta({ state: 'missing-map', route, tiles: [], path: '', dot }, config);
  }

  const zoom = Math.max(
    RUNNING_MAP_MIN_ZOOM,
    Math.min(RUNNING_MAP_HOME_MAX_ZOOM, RUNNING_MAP_MAX_ZOOM, _zoomForRunningMap(route, RUNNING_MAP_WIDTH, RUNNING_MAP_HEIGHT))
  );
  const centerPx = _projectRunningMapPoint(center, zoom);
  const topLeft = {
    x: centerPx.x - RUNNING_MAP_WIDTH / 2,
    y: centerPx.y - RUNNING_MAP_HEIGHT / 2
  };
  const maxTile = 2 ** zoom;
  const minTileX = Math.floor(topLeft.x / RUNNING_MAP_TILE_SIZE);
  const maxTileX = Math.floor((topLeft.x + RUNNING_MAP_WIDTH) / RUNNING_MAP_TILE_SIZE);
  const minTileY = Math.floor(topLeft.y / RUNNING_MAP_TILE_SIZE);
  const maxTileY = Math.floor((topLeft.y + RUNNING_MAP_HEIGHT) / RUNNING_MAP_TILE_SIZE);
  const tiles = [];

  for (let y = minTileY; y <= maxTileY; y += 1) {
    if (y < 0 || y >= maxTile) continue;
    for (let x = minTileX; x <= maxTileX; x += 1) {
      const wrappedX = _tileModulo(x, maxTile);
      tiles.push({
        src: buildVworldTileUrl(config.key, zoom, wrappedX, y, config.layer),
        left: x * RUNNING_MAP_TILE_SIZE - topLeft.x,
        top: y * RUNNING_MAP_TILE_SIZE - topLeft.y
      });
    }
  }

  const projectedRoute = route.map(point => _screenPoint(point, zoom, topLeft));
  const path = projectedRoute.length > 1
    ? projectedRoute.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
    : '';
  const rawDot = _screenPoint(route[route.length - 1] || previewPoint || summaryCenter || center, zoom, topLeft);
  const dot = _clampRunningMapDot(rawDot);
  const start = path ? _clampRunningMapDot(projectedRoute[0]) : null;

  return _withRunningMapMeta({ state: 'ready', route, tiles, path, dot, start, zoom }, config);
}

function _setRunningMapBubbleDiagnostics(bubble, map) {
  bubble.dataset.lzRunningMapBubble = '1';
  bubble.dataset.lzRunningMapState = map.state;
  bubble.dataset.lzRunningMapProvider = map.provider || 'none';
  bubble.dataset.lzRunningMapConfigured = map.configured ? 'true' : 'false';
  bubble.dataset.lzRunningMapReason = map.reason || '';
  bubble.dataset.lzRunningMapTileCount = String(map.tileCount || 0);
  bubble.dataset.lzRunningMapPointCount = String(map.pointCount || 0);
  bubble.dataset.lzRunningMapHasPath = map.hasPath ? 'true' : 'false';
  bubble.dataset.lzRunningMapTileState = map.state === 'ready' ? 'pending' : map.state;
}

function _bindRunningMapTileDiagnostics(bubble, map) {
  if (!bubble || map.state !== 'ready') return;
  const tiles = Array.from(bubble.querySelectorAll('.lz-running-map-tile'));
  if (!tiles.length) {
    bubble.classList.add('is-tile-failed');
    bubble.dataset.lzRunningMapTileState = 'empty';
    return;
  }

  let loaded = 0;
  let failed = 0;
  const counted = new WeakSet();
  const update = () => {
    bubble.dataset.lzRunningMapTilesLoaded = String(loaded);
    bubble.dataset.lzRunningMapTilesFailed = String(failed);
    if (loaded > 0 && failed > 0) {
      bubble.dataset.lzRunningMapTileState = 'partial';
      return;
    }
    if (loaded > 0) {
      bubble.dataset.lzRunningMapTileState = 'loaded';
      return;
    }
    if (failed >= tiles.length) {
      bubble.classList.add('is-tile-failed');
      bubble.dataset.lzRunningMapTileState = 'failed';
    }
  };
  const mark = (tile, ok) => {
    if (counted.has(tile)) return;
    counted.add(tile);
    if (ok) loaded += 1;
    else failed += 1;
    update();
  };

  tiles.forEach((tile) => {
    if (tile.complete) {
      mark(tile, tile.naturalWidth > 0);
      return;
    }
    tile.addEventListener('load', () => mark(tile, true), { once: true });
    tile.addEventListener('error', () => mark(tile, false), { once: true });
  });
  update();
}

function _renderRunningMapSvg(map, className = 'lz-running-map-overlay') {
  if (map.imageDataUrl) {
    return `<img class="${escapeHtml(className)} lz-running-map-image" src="${escapeHtml(map.imageDataUrl)}" alt="업로드한 러닝 경로 지도">`;
  }
  const tileHtml = map.tiles.map((tile) => `
    <image
      class="lz-running-map-tile"
      href="${escapeHtml(tile.src)}"
      x="${tile.left.toFixed(1)}"
      y="${tile.top.toFixed(1)}"
      width="${RUNNING_MAP_TILE_SIZE}"
      height="${RUNNING_MAP_TILE_SIZE}"
      preserveAspectRatio="none"
    ></image>
  `).join('');
  const pathHtml = map.path
    ? `<polyline class="lz-running-map-path lz-running-map-path--casing" points="${escapeHtml(map.path)}"></polyline>
        <polyline class="lz-running-map-path lz-running-map-path--main" points="${escapeHtml(map.path)}"></polyline>`
    : '';
  const startHtml = map.start
    ? `<circle class="lz-running-map-start" cx="${map.start.x.toFixed(1)}" cy="${map.start.y.toFixed(1)}" r="6.2"></circle>`
    : '';
  const dotHtml = map.dot
    ? `<circle class="lz-running-map-current" cx="${map.dot.x.toFixed(1)}" cy="${map.dot.y.toFixed(1)}" r="7.2"></circle>`
    : '';

  return `
    <svg class="${escapeHtml(className)}" viewBox="0 0 ${RUNNING_MAP_WIDTH} ${RUNNING_MAP_HEIGHT}" aria-hidden="true">
      ${tileHtml}
      ${pathHtml}
      ${startHtml}
      ${dotHtml}
    </svg>
  `;
}

function _runningMapFallbackHtml(map) {
  if (map.state === 'image') return '';
  const emptyText = map.state === 'ready' ? '' : (map.state === 'waiting' ? 'GPS' : 'MAP');
  if (map.state === 'ready') return '<span class="lz-running-map-empty lz-running-map-empty--tile-failed">MAP</span>';
  return emptyText ? `<span class="lz-running-map-empty">${emptyText}</span>` : '';
}

function _runningRecordNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function _formatRunningRecordDuration(sec) {
  const total = Math.max(0, Math.floor(_runningRecordNumber(sec, 0)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function _formatRunningRecordPace(secPerKm) {
  const sec = Math.round(_runningRecordNumber(secPerKm, 0));
  if (sec <= 0) return "--'--''";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}'${String(s).padStart(2, '0')}''`;
}

function _formatRunningRecordPlace(mapData = null) {
  const place = mapData?.placeSummary || {};
  const area = place.adminArea || {};
  const dong = String(area.dong || area.adminDong || area.legalDong || '').trim();
  const district = String(area.district || '').trim();
  const label = String(mapData?.placeLabel || place.label || '').trim();
  if (dong && district) return `${dong} · ${district}`;
  if (dong) return dong;
  return label || '위치 확인 중';
}

function _todayRunningRecordLabel() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

function _runningRecordSummary(mapData = null, map = null) {
  const routeSummary = mapData?.routeSummary || {};
  const distanceKm = Math.max(0, _runningRecordNumber(routeSummary.distanceKm, 0));
  const durationSec = Math.max(0, _runningRecordNumber(routeSummary.durationSec, 0));
  const paceSec = Math.max(
    0,
    _runningRecordNumber(routeSummary.avgPaceSecPerKm, 0) || (distanceKm > 0 && durationSec > 0 ? durationSec / distanceKm : 0)
  );
  const pointCount = Math.max(
    0,
    Math.floor(_runningRecordNumber(mapData?.pointCount, 0)),
    Math.floor(_runningRecordNumber(routeSummary.pointCount, 0)),
    Math.floor(_runningRecordNumber(map?.pointCount, 0))
  );

  return {
    distanceKm,
    durationSec,
    paceSec,
    calories: Math.max(0, Math.round(_runningRecordNumber(routeSummary.calories, 0))),
    pointCount,
    elevationGainM: Math.max(0, Math.round(_runningRecordNumber(routeSummary.elevationGainM, 0))),
    avgHeartRateBpm: Math.max(0, Math.round(_runningRecordNumber(routeSummary.avgHeartRateBpm, 0))),
    cadenceSpm: Math.max(0, Math.round(_runningRecordNumber(routeSummary.cadenceSpm, 0)))
  };
}

function _renderRunningRecordStats(summary) {
  const stats = [
    { label: '페이스', value: `${_formatRunningRecordPace(summary.paceSec)}/km` },
    { label: '시간', value: summary.durationSec > 0 ? _formatRunningRecordDuration(summary.durationSec) : '--:--' },
    { label: '칼로리', value: summary.calories > 0 ? `${summary.calories}kcal` : '--' },
    { label: 'GPS', value: summary.pointCount > 0 ? `${summary.pointCount}점` : '--' },
    { label: '고도', value: summary.elevationGainM > 0 ? `${summary.elevationGainM}m` : '--' },
    { label: '케이던스', value: summary.cadenceSpm > 0 ? `${summary.cadenceSpm}` : '--' }
  ];

  return stats.map((item) => `
    <div class="lz-running-record-stat">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');
}

function _ensureRunningRecordModal() {
  let modal = document.getElementById('life-zone-running-record-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'life-zone-running-record-modal';
  modal.className = 'lz-running-record-backdrop';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.dataset.lzRunningRecordModal = '1';
  modal.addEventListener('click', (event) => {
    const target = event.target;
    if (target === modal || target?.closest?.('[data-lz-running-record-close]')) {
      _closeRunningRecordModal();
    }
  });
  document.body.append(modal);
  return modal;
}

function _closeRunningRecordModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('life-zone-running-record-modal');
  if (!modal) return;
  modal.hidden = true;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body?.classList?.remove('lz-running-record-modal-open');
  if (_runningRecordEscHandler) {
    document.removeEventListener('keydown', _runningRecordEscHandler);
    _runningRecordEscHandler = null;
  }
}

function _todayLifeZoneKey() {
  return dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
}

function _lifeZoneHeartIconSvg(extraClass = '') {
  const cls = extraClass ? ` class="${extraClass}"` : '';
  return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.9-4.42-9.42-8.16C.38 9.58 1.33 5.6 4.7 4.36 7 3.51 9.32 4.38 10.7 6.18L12 7.88l1.3-1.7c1.38-1.8 3.7-2.67 6-1.82 3.37 1.24 4.32 5.22 2.12 8.48C18.9 16.58 12 21 12 21z"/></svg>`;
}

function _lifeZoneCloseIconSvg() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.4 5.2 5.2 6.4 10.8 12l-5.6 5.6 1.2 1.2 5.6-5.6 5.6 5.6 1.2-1.2-5.6-5.6 5.6-5.6-1.2-1.2-5.6 5.6-5.6-5.6z"/></svg>';
}

function _lifeZonePhotoAlt(actor = {}) {
  return actor.speech || '식사 사진';
}

function _lifeZonePhotoLikeKey(actor = {}) {
  return `${actor.accountId || actor.id || actor.displayName || 'actor'}:${actor.speechLikeField || 'meal'}`;
}

function _syncLifeZonePhotoLikeButtons(actor = {}, liked = false) {
  const key = _lifeZonePhotoLikeKey(actor);
  document.querySelectorAll('[data-lz-photo-like-key]').forEach((button) => {
    if (button.dataset.lzPhotoLikeKey !== key) return;
    button.classList.toggle('is-liked', !!liked);
    button.dataset.lzPhotoLiked = liked ? '1' : '0';
    button.setAttribute('aria-pressed', liked ? 'true' : 'false');
    button.title = liked ? '좋아요 취소' : '좋아요';
  });
}

function _emitLifeZoneHeartStream(anchor) {
  if (!anchor) return;
  const stream = document.createElement('span');
  stream.className = 'lz-heart-stream';
  stream.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 6; i += 1) {
    const particle = document.createElement('span');
    particle.className = `lz-heart-particle lz-heart-particle--${i}`;
    particle.innerHTML = _lifeZoneHeartIconSvg('lz-heart-particle-icon');
    stream.append(particle);
  }
  anchor.append(stream);
  window.setTimeout(() => stream.remove(), 920);
}

async function _handleLifeZonePhotoLike(actor, anchor, { forceLiked = false } = {}) {
  if (!actor?.speechPhoto) return false;
  _emitLifeZoneHeartStream(anchor);
  if (!actor.accountId || !actor.speechLikeField) return false;

  const wasLiked = !!actor.speechPhotoLiked;
  if (forceLiked && wasLiked) {
    _syncLifeZonePhotoLikeButtons(actor, true);
    return true;
  }

  try {
    let liked = await toggleLike(actor.accountId, _todayLifeZoneKey(), actor.speechLikeField, LIFE_ZONE_PHOTO_LIKE_REACTION);
    if (forceLiked && liked === false) {
      liked = await toggleLike(actor.accountId, _todayLifeZoneKey(), actor.speechLikeField, LIFE_ZONE_PHOTO_LIKE_REACTION);
    }
    if (typeof liked !== 'boolean') return wasLiked;
    actor.speechPhotoLiked = liked;
    const count = Number(actor.speechPhotoLikeCount) || 0;
    if (liked !== wasLiked) {
      actor.speechPhotoLikeCount = Math.max(0, count + (liked ? 1 : -1));
    }
    _syncLifeZonePhotoLikeButtons(actor, liked);
    return liked;
  } catch (error) {
    console.warn('[life-zone] photo like failed:', error);
    showToast('좋아요 저장 실패', 1800, 'error');
    _syncLifeZonePhotoLikeButtons(actor, wasLiked);
    return wasLiked;
  }
}

function _bindLifeZonePhotoDoubleLike(target, actor, anchor) {
  let lastTapAt = 0;
  const like = (event) => {
    event.preventDefault();
    event.stopPropagation();
    _handleLifeZonePhotoLike(actor, anchor, { forceLiked: true });
  };
  target.addEventListener('dblclick', (event) => {
    if (event.type === 'dblclick') like(event);
  });
  target.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') return;
    const now = Date.now();
    if (now - lastTapAt <= LIFE_ZONE_PHOTO_DOUBLE_TAP_MS) {
      lastTapAt = 0;
      like(event);
      return;
    }
    lastTapAt = now;
  });
}

function _closeLifeZonePhotoPreview() {
  const modal = document.getElementById('life-zone-photo-preview-modal');
  if (modal) modal.remove();
  if (_photoPreviewEscHandler) {
    document.removeEventListener('keydown', _photoPreviewEscHandler);
    _photoPreviewEscHandler = null;
  }
}

function _openLifeZonePhotoPreview(actor = {}) {
  if (!actor.speechPhoto) return;
  _closeLifeZonePhotoPreview();

  const modal = document.createElement('div');
  const sheet = document.createElement('section');
  const header = document.createElement('div');
  const title = document.createElement('h3');
  const meta = document.createElement('div');
  const closeButton = document.createElement('button');
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  const likeButton = document.createElement('button');
  const titleId = 'life-zone-photo-preview-title';
  const likeKey = _lifeZonePhotoLikeKey(actor);

  modal.id = 'life-zone-photo-preview-modal';
  modal.className = 'lz-photo-preview-backdrop open';
  modal.addEventListener('click', (event) => {
    if (event.target === modal) _closeLifeZonePhotoPreview();
  });

  sheet.className = 'lz-photo-preview-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', titleId);
  sheet.tabIndex = -1;

  header.className = 'lz-photo-preview-header';
  title.id = titleId;
  title.className = 'lz-photo-preview-title';
  title.textContent = `${actor.displayName || '이웃'} 식사 사진`;
  meta.className = 'lz-photo-preview-meta';
  meta.textContent = actor.speech || '식사 기록';

  closeButton.type = 'button';
  closeButton.className = 'lz-photo-preview-close';
  closeButton.setAttribute('aria-label', '사진 닫기');
  closeButton.dataset.lzPhotoAction = 'close';
  closeButton.innerHTML = _lifeZoneCloseIconSvg();
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    _closeLifeZonePhotoPreview();
  });

  figure.className = 'lz-photo-preview-figure';
  image.className = 'lz-photo-preview-image';
  image.src = actor.speechPhoto;
  image.alt = _lifeZonePhotoAlt(actor);
  image.decoding = 'async';
  image.draggable = false;

  likeButton.type = 'button';
  likeButton.className = `lz-photo-preview-like-btn lz-photo-like-btn${actor.speechPhotoLiked ? ' is-liked' : ''}`;
  likeButton.dataset.lzPhotoAction = 'like';
  likeButton.dataset.lzPhotoLikeKey = likeKey;
  likeButton.dataset.lzPhotoLiked = actor.speechPhotoLiked ? '1' : '0';
  likeButton.setAttribute('aria-label', `${actor.displayName || '이웃'} 식사 사진 좋아요`);
  likeButton.setAttribute('aria-pressed', actor.speechPhotoLiked ? 'true' : 'false');
  likeButton.title = actor.speechPhotoLiked ? '좋아요 취소' : '좋아요';
  likeButton.innerHTML = _lifeZoneHeartIconSvg();
  likeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    _handleLifeZonePhotoLike(actor, figure, { forceLiked: false });
  });

  _bindLifeZonePhotoDoubleLike(image, actor, figure);

  header.append(title, meta);
  figure.append(image, likeButton);
  sheet.append(closeButton, header, figure);
  modal.append(sheet);
  document.body.append(modal);

  if (_photoPreviewEscHandler) document.removeEventListener('keydown', _photoPreviewEscHandler);
  _photoPreviewEscHandler = (event) => {
    if (event.key === 'Escape') _closeLifeZonePhotoPreview();
  };
  document.addEventListener('keydown', _photoPreviewEscHandler);
  requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
}

async function _withLifeZonePhotoLikeStates(actors = [], todayKey, currentUser = null) {
  const targets = [...new Set(
    actors
      .filter((actor) => actor.speechPhoto && actor.accountId && actor.speechLikeField)
      .map((actor) => actor.accountId)
  )];
  if (!targets.length) return actors;

  const results = await Promise.allSettled(targets.map(async (targetId) => [targetId, await getLikes(targetId, todayKey)]));
  const likesByTarget = new Map();
  results.forEach((result) => {
    if (result.status === 'fulfilled') likesByTarget.set(result.value[0], result.value[1] || []);
  });

  return actors.map((actor) => {
    if (!actor.speechPhoto || !actor.accountId || !actor.speechLikeField) return actor;
    const fieldLikes = (likesByTarget.get(actor.accountId) || [])
      .filter((like) => like.field === actor.speechLikeField);
    return {
      ...actor,
      speechPhotoLiked: fieldLikes.some((like) => like.from === currentUser?.id || isSameInstance(like.from, currentUser?.id)),
      speechPhotoLikeCount: fieldLikes.length
    };
  });
}

function _openRunningRecordModal(actor = {}, preparedMap = null) {
  if (typeof document === 'undefined') return;
  const runningMap = actor.runningMap || {};
  const map = preparedMap || _buildRunningMapBubbleData(runningMap);
  const summary = _runningRecordSummary(runningMap, map);
  const modal = _ensureRunningRecordModal();
  const actorName = actor.displayName || '러너';
  const location = _formatRunningRecordPlace(runningMap);
  const status = runningMap.live ? '라이브 GPS 기록' : '오늘 러닝 기록';
  const distanceText = summary.distanceKm > 0 ? `${summary.distanceKm.toFixed(2)}km` : '--';
  const titleId = 'life-zone-running-record-title';
  const mapClass = `lz-running-record-map lz-running-map-bubble--${map.state}`;

  modal.innerHTML = `
    <section class="lz-running-record-sheet" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <button class="lz-running-record-close" type="button" data-lz-running-record-close aria-label="닫기">×</button>
      <div class="lz-running-record-head">
        <span class="lz-running-record-eyebrow">${escapeHtml(status)}</span>
        <h2 id="${titleId}">${escapeHtml(actorName)} 러닝</h2>
        <p>${escapeHtml(_todayRunningRecordLabel())} · ${escapeHtml(location)}</p>
      </div>
      <div class="lz-running-record-main">
        <strong>${escapeHtml(distanceText)}</strong>
        <span>${escapeHtml(_formatRunningRecordPace(summary.paceSec))}/km · ${summary.durationSec > 0 ? escapeHtml(_formatRunningRecordDuration(summary.durationSec)) : '--:--'}</span>
      </div>
      <div class="${escapeHtml(mapClass)}" data-lz-running-record-map>
        <span class="lz-running-map-surface">
          ${_renderRunningMapSvg(map, 'lz-running-map-overlay lz-running-record-map-overlay')}
          ${_runningMapFallbackHtml(map)}
          <span class="lz-running-map-place">${escapeHtml(location)}</span>
          ${map.state === 'ready' ? '<span class="lz-running-map-attribution">VWorld</span>' : ''}
        </span>
      </div>
      <div class="lz-running-record-stats">
        ${_renderRunningRecordStats(summary)}
      </div>
    </section>
  `;
  modal.hidden = false;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body?.classList?.add('lz-running-record-modal-open');
  const mapElement = modal.querySelector('[data-lz-running-record-map]');
  if (mapElement) {
    _setRunningMapBubbleDiagnostics(mapElement, map);
    _bindRunningMapTileDiagnostics(mapElement, map);
  }
  if (_runningRecordEscHandler) document.removeEventListener('keydown', _runningRecordEscHandler);
  _runningRecordEscHandler = (event) => {
    if (event.key === 'Escape') _closeRunningRecordModal();
  };
  document.addEventListener('keydown', _runningRecordEscHandler);
  modal.querySelector('[data-lz-running-record-close]')?.focus({ preventScroll: true });
}

function _renderRunningMapBubble(layer, actor, slot) {
  const bubble = document.createElement('button');
  const x = Number(slot.bubbleX) || Number(slot.x) + Number(slot.width) * 0.5;
  const y = Number(slot.bubbleY) || Math.max(36, Number(slot.y) - 88);
  const tipX = Number(slot.mapTipX) || 50;
  const map = _buildRunningMapBubbleData(actor.runningMap);
  const place = String(actor.runningMap?.placeLabel || '').trim();
  const fallbackHtml = _runningMapFallbackHtml(map);
  bubble.type = 'button';
  bubble.className = `lz-running-map-bubble lz-running-map-bubble--${map.state}`;
  bubble.dataset.lzRunningRecordAction = 'open';
  bubble.setAttribute('aria-label', `${actor.displayName} 오늘 러닝 기록 보기`);
  bubble.title = `${actor.displayName} 오늘 러닝 기록`;
  _setRunningMapBubbleDiagnostics(bubble, map);
  bubble.style.setProperty('--lz-map-x', x);
  bubble.style.setProperty('--lz-map-y', y);
  bubble.style.setProperty('--lz-map-tip-x', `${tipX}%`);
  bubble.style.setProperty('--lz-actor-color', actor.color || '#94a3b8');
  bubble.style.zIndex = String((Number(slot.z) || 1) + 30);
  bubble.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    _openRunningRecordModal(actor, map);
  });
  bubble.innerHTML = `
    <span class="lz-running-map-surface">
      ${_renderRunningMapSvg(map)}
      ${fallbackHtml}
      ${place ? `<span class="lz-running-map-place">${escapeHtml(place)}</span>` : ''}
      ${map.state === 'ready' ? '<span class="lz-running-map-attribution">VWorld</span>' : ''}
    </span>
  `;
  _bindRunningMapTileDiagnostics(bubble, map);
  layer.append(bubble);
}

function _renderActors(card, actors) {
  const layer = card.querySelector('[data-lz-actors]');
  if (!layer) return;
  layer.textContent = '';
  const selfRunning = actors.some((actor) => actor.state === 'running' && actor.source === 'self');
  let runningBubbleRendered = false;

  actors.forEach((actor) => {
    const slot = actor.slot;
    if (!slot) return;
    const actorElement = document.createElement('span');
    const image = document.createElement('img');
    const poseClass = slot.pose ? ` lz-actor--pose-${slot.pose}` : '';
    const spriteSrc = `${LIFE_ZONE_SPRITE_ROOT}/${actor.sprite}`;
    actorElement.className = `lz-actor lz-actor--${actor.state}${poseClass}`;
    actorElement.style.setProperty('--lz-sprite-url', `url("${spriteSrc}")`);
    _applyActorSlotPosition(actorElement, slot);
    actorElement.title = `${actor.displayName} · ${actor.speech || STATE_LABELS[actor.state] || '업무'}`;
    image.className = 'lz-actor-img';
    image.src = spriteSrc;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    const nameplate = document.createElement('span');
    nameplate.className = `lz-nameplate lz-nameplate--actor lz-nameplate--${actor.state}`;
    nameplate.textContent = actor.displayName;
    _applyActorNameplatePosition(nameplate, slot);
    actorElement.append(image, nameplate);
    layer.append(actorElement);

    if (actor.state === 'running') {
      const shouldShowMap = selfRunning ? actor.source === 'self' : !runningBubbleRendered;
      if (shouldShowMap) {
        _renderRunningMapBubble(layer, actor, slot);
        runningBubbleRendered = true;
      }
      return;
    }

    if (actor.speech) {
      const bubble = document.createElement(actor.speechPhoto ? 'span' : 'div');
      bubble.className = `lz-speech lz-speech--${actor.state}${actor.speechPhoto ? ' lz-speech--photo' : ''}`;
      if (actor.speechPhoto) {
        const previewButton = document.createElement('button');
        const photo = document.createElement('img');
        const likeButton = document.createElement('button');
        const likeKey = _lifeZonePhotoLikeKey(actor);
        previewButton.type = 'button';
        previewButton.className = 'lz-speech-photo-btn';
        previewButton.dataset.lzPhotoAction = 'preview';
        previewButton.setAttribute('aria-label', `${actor.displayName} ${actor.speech || '식사'} 사진 크게 보기`);
        previewButton.title = `${actor.displayName} ${actor.speech || '식사 사진'}`;
        photo.className = 'lz-speech-photo';
        photo.src = actor.speechPhoto;
        photo.alt = actor.speech || '식사 사진';
        photo.loading = 'lazy';
        photo.decoding = 'async';
        previewButton.append(photo);
        previewButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          _openLifeZonePhotoPreview(actor);
        });
        likeButton.type = 'button';
        likeButton.className = 'lz-photo-like-btn';
        likeButton.classList.toggle('is-liked', !!actor.speechPhotoLiked);
        likeButton.dataset.lzPhotoAction = 'like';
        likeButton.dataset.lzPhotoLikeKey = likeKey;
        likeButton.dataset.lzPhotoLiked = actor.speechPhotoLiked ? '1' : '0';
        likeButton.setAttribute('aria-label', `${actor.displayName} ${actor.speech || '식사'} 좋아요`);
        likeButton.setAttribute('aria-pressed', actor.speechPhotoLiked ? 'true' : 'false');
        likeButton.title = actor.speechPhotoLiked ? '좋아요 취소' : '좋아요';
        likeButton.innerHTML = _lifeZoneHeartIconSvg();
        likeButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          _handleLifeZonePhotoLike(actor, bubble, { forceLiked: false });
        });
        bubble.append(previewButton, likeButton);
      } else {
        bubble.textContent = actor.speech;
      }
      if (Number(slot.x) + Number(slot.width) >= 1450) {
        bubble.classList.add('lz-speech--right-edge');
      }
      bubble.style.setProperty('--lz-bx', slot.x + slot.width * 0.54);
      bubble.style.setProperty('--lz-by', Math.max(28, slot.y - 12));
      bubble.style.setProperty('--lz-actor-color', actor.color || '#94a3b8');
      bubble.style.zIndex = String((Number(slot.z) || 1) + 20);
      layer.append(bubble);
    }
  });
}

async function _loadLifeZoneActorStates() {
  const todayKey = dateKey(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  const currentUser = getCurrentUser();
  const liveRunning = _readRunningLiveState();
  const liveKey = liveRunning ? `running:${liveRunning.startedAt || 'active'}` : 'idle';
  const cacheKey = `${todayKey}:${currentUser?.id || 'none'}:${liveKey}`;

  if (LIFE_ZONE_CACHE_MS > 0 && _actorStateCache && _actorStateCache.key === cacheKey && Date.now() - _actorStateCache.at < LIFE_ZONE_CACHE_MS) {
    return _actorStateCache.actors;
  }

  const [accountsResult, friendsResult] = await Promise.allSettled([
    getAccountList(),
    getMyFriends()
  ]);
  const rawAccounts = accountsResult.status === 'fulfilled' ? accountsResult.value : [];
  const friends = friendsResult.status === 'fulfilled' ? friendsResult.value : [];
  const accounts = _mergeCurrentUser(_enrichAccounts(rawAccounts), currentUser);
  const roster = resolveLifeZoneRoster({ accounts, friends, currentUser });

  const dayByAccountId = {};
  const selfActorIds = new Set(roster.filter((actor) => actor.source === 'self' && actor.accountId).map((actor) => actor.accountId));
  selfActorIds.forEach((accountId) => {
    dayByAccountId[accountId] = _withRunningLiveDay(getDay(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()) || {}, liveRunning);
  });

  const remoteActors = roster.filter((actor) => actor.source !== 'self' && actor.canRead && actor.accountId);
  const remoteResults = await Promise.allSettled(remoteActors.map((actor) => _readLifeZoneActorDay(actor, todayKey)));
  remoteActors.forEach((actor, index) => {
    dayByAccountId[actor.accountId] = remoteResults[index].status === 'fulfilled'
      ? (remoteResults[index].value || {})
      : {};
  });

  const actors = await _withLifeZonePhotoLikeStates(
    resolveLifeZoneActors({ accounts, friends, currentUser, dayByAccountId }),
    todayKey,
    currentUser
  );
  _actorStateCache = { key: cacheKey, at: Date.now(), actors };
  return actors;
}

export async function hydrateLifeZoneCard(card) {
  if (!card) return;
  try {
    const actors = await _loadLifeZoneActorStates();
    _renderActors(card, actors);
    _renderConsultingVisitor(card, actors);
  } catch (error) {
    console.warn('[life-zone] hydrate failed:', error);
    const fallback = _defaultActorStates();
    _renderActors(card, fallback);
    _renderConsultingVisitor(card, fallback);
  }
}

const MARQUEE_PIXEL_GLYPHS = Object.freeze({
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100']
});

const MARQUEE_DIGIT_SEGMENTS = Object.freeze({
  0: ['a', 'b', 'c', 'd', 'e', 'f'],
  1: ['b', 'c'],
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
  4: ['f', 'g', 'b', 'c'],
  5: ['a', 'f', 'g', 'c', 'd'],
  6: ['a', 'f', 'g', 'e', 'c', 'd'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g']
});

function _loadMarqueeFrame() {
  if (_marqueeFramePromise) return _marqueeFramePromise;

  _marqueeFramePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('life-zone marquee frame failed to load')), { once: true });
    image.src = LIFE_ZONE_MARQUEE_FRAME_SRC;
  });
  return _marqueeFramePromise;
}

function _resolveHeroStreak(hero) {
  const direct = Number(hero?.streak);
  if (Number.isFinite(direct)) return Math.max(0, Math.floor(direct));

  const match = String(hero?.countHtml || '').match(/\d+/);
  return Math.max(0, Number(match?.[0] || 0));
}

function _drawMarqueeWord(context, word, x, y, pixelSize, color) {
  let cursor = x;
  context.fillStyle = color;

  for (const character of word) {
    const glyph = MARQUEE_PIXEL_GLYPHS[character];
    if (!glyph) {
      cursor += pixelSize * 4;
      continue;
    }
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel === '1') {
          context.fillRect(cursor + columnIndex * pixelSize, y + rowIndex * pixelSize, pixelSize, pixelSize);
        }
      });
    });
    cursor += pixelSize * 6;
  }
}

function _drawMarqueeDigit(context, digit, x, y, unit) {
  const active = new Set(MARQUEE_DIGIT_SEGMENTS[digit] || []);
  const segments = {
    a: [unit, 0, unit * 3, unit],
    b: [unit * 4, unit, unit, unit * 4],
    c: [unit * 4, unit * 6, unit, unit * 4],
    d: [unit, unit * 10, unit * 3, unit],
    e: [0, unit * 6, unit, unit * 4],
    f: [0, unit, unit, unit * 4],
    g: [unit, unit * 5, unit * 3, unit]
  };

  for (const [name, rect] of Object.entries(segments)) {
    context.fillStyle = active.has(name) ? '#fff4cf' : '#5d120d';
    context.fillRect(x + rect[0], y + rect[1], rect[2], rect[3]);
    if (active.has(name)) {
      context.fillStyle = '#ffb278';
      context.fillRect(
        x + rect[0] + unit,
        y + rect[1],
        Math.max(unit, rect[2] - unit * 2),
        Math.max(1, unit / 2)
      );
    }
  }
}

function _drawMarqueeDisplayContent(context, streak) {
  const panel = MARQUEE_LED_PANEL;
  context.save();
  context.beginPath();
  context.moveTo(panel.x, panel.y);
  context.lineTo(panel.x + panel.width, panel.y + panel.rise);
  context.lineTo(panel.x + panel.width, panel.y + panel.rise + panel.height);
  context.lineTo(panel.x, panel.y + panel.height);
  context.closePath();
  context.clip();

  // 로컬 LED 사각형을 실제 아이소메트릭 LED 면으로 한 번만 투영한다.
  context.transform(1, panel.rise / panel.width, 0, 1, panel.x, panel.y);
  _drawMarqueeWord(context, 'STREAK', 18, 60, 6, '#ffd6b2');
  const digits = String(Math.min(999, streak)).padStart(3, '0');
  [...digits].forEach((digit, index) => _drawMarqueeDigit(context, digit, 242 + index * 40, 42, 7));
  context.restore();
}

function _paintLifeZoneMarquee(canvas, hero) {
  if (!canvas) return;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return;

  const streak = _resolveHeroStreak(hero);
  _loadMarqueeFrame().then((frame) => {
    if (!canvas.isConnected) return;

    canvas.width = LIFE_ZONE_WORLD_SIZE;
    canvas.height = LIFE_ZONE_WORLD_SIZE;
    context.clearRect(0, 0, LIFE_ZONE_WORLD_SIZE, LIFE_ZONE_WORLD_SIZE);
    context.imageSmoothingEnabled = false;
    context.save();
    context.translate(LIFE_ZONE_MARQUEE_FRAME_X, LIFE_ZONE_MARQUEE_FRAME_Y);
    context.scale(LIFE_ZONE_MARQUEE_FRAME_SCALE, LIFE_ZONE_MARQUEE_FRAME_SCALE);
    context.drawImage(frame, 0, 0);
    context.restore();

    _drawMarqueeDisplayContent(context, streak);
    canvas.dataset.lzMarqueeReady = 'true';
  }).catch((error) => {
    console.warn('[life-zone] marquee frame failed:', error);
  });
}

export function renderLifeZoneCard({
  hero = null
} = {}) {
  const card = document.createElement('section');
  card.id = 'tf-life-zone-card';
  card.className = 'home-card lz-card';
  card.setAttribute('aria-label', '오늘의 라이프존');

  const fallbackActors = _defaultActorStates();
  const heroStreak = _resolveHeroStreak(hero);
  const marqueeLabel = hero?.label || '오늘의 연속 기록';
  const marqueeAccessibleLabel = `${marqueeLabel}. 현재 ${heroStreak}일 연속 기록. 토마토 획득 규칙 보기`;

  card.innerHTML = `
    <div class="lz-scene">
      <div class="lz-world">
        <img
          class="lz-base"
          src="${LIFE_ZONE_ASSET_ROOT}/base-room-expanded-alpha.png"
          width="1672"
          height="1672"
          alt=""
          loading="lazy"
          decoding="async"
        >
        <canvas
          class="lz-marquee-canvas"
          data-lz-marquee-canvas
          width="1672"
          height="1672"
          aria-hidden="true"
        ></canvas>
        <button
          type="button"
          class="lz-marquee-hotspot"
          id="tomato-rule-info-card"
          aria-label="${escapeHtml(marqueeAccessibleLabel)}"
          title="${escapeHtml(`${heroStreak}일 연속 기록 · 상세 보기`)}"
        ></button>
        <span class="lz-miranda-corner" aria-hidden="true">
          <img
            src="${LIFE_ZONE_UI_ROOT}/miranda-fashion-corner.png"
            width="430"
            height="250"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </span>
        <span class="lz-consulting-room-sofas" aria-hidden="true">
          <img
            src="${LIFE_ZONE_UI_ROOT}/consulting-room-sofas.png"
            width="430"
            height="309"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </span>
        <div class="lz-actor-layer" data-lz-actors aria-hidden="true"></div>
        <button
          type="button"
          class="lz-npc-quest lz-npc-quest--trainer"
          data-lz-action="npc-quest"
          aria-label="트레이너 퀘스트 보기"
          title="트레이너 퀘스트"
        >
          <span class="lz-npc-bulb" aria-hidden="true">
            <img
              src="${LIFE_ZONE_UI_ROOT}/npc-quest-bubble.png"
              width="192"
              height="258"
              alt=""
              loading="lazy"
              decoding="async"
            >
          </span>
          <span class="lz-nameplate lz-nameplate--npc" aria-hidden="true">${escapeHtml(LIFE_ZONE_NPC_NAME)}</span>
        </button>
        <button
          type="button"
          class="lz-miranda-npc"
          data-lz-action="miranda-quest"
          aria-label="미란다 대화 보기"
          title="미란다"
        >
          <img
            class="lz-miranda-npc-img"
            src="${LIFE_ZONE_UI_ROOT}/miranda-npc-home.png"
            width="142"
            height="256"
            alt=""
            loading="lazy"
            decoding="async"
          >
          <span class="lz-npc-bulb lz-npc-bulb--miranda" aria-hidden="true">
            <img
              src="${LIFE_ZONE_UI_ROOT}/npc-quest-bubble.png"
              width="192"
              height="258"
              alt=""
              loading="lazy"
              decoding="async"
            >
          </span>
          <span class="lz-nameplate lz-nameplate--npc" aria-hidden="true">${escapeHtml(LIFE_ZONE_MIRANDA_NAME)}</span>
        </button>
        <button
          type="button"
          class="lz-consulting-chief-npc"
          data-lz-action="consulting-chief-quest"
          aria-label="상담실장 대화 보기"
          title="상담실장"
        >
          <img
            class="lz-consulting-chief-npc-img"
            src="${LIFE_ZONE_UI_ROOT}/consulting-chief-npc-seated-home.png"
            width="200"
            height="286"
            alt=""
            loading="lazy"
            decoding="async"
          >
          <span class="lz-npc-bulb lz-npc-bulb--consulting-chief" aria-hidden="true">
            <img
              src="${LIFE_ZONE_UI_ROOT}/npc-quest-bubble.png"
              width="192"
              height="258"
              alt=""
              loading="lazy"
              decoding="async"
            >
          </span>
          <span class="lz-nameplate lz-nameplate--npc" aria-hidden="true">${escapeHtml(LIFE_ZONE_CONSULTING_CHIEF_NAME)}</span>
        </button>
        <span class="lz-consulting-visitor" data-lz-consulting-visitor hidden aria-hidden="true">
          <img
            class="lz-consulting-visitor-img"
            src="${LIFE_ZONE_UI_ROOT}/consulting-visitor-gray-shirt-home.png"
            width="230"
            height="298"
            alt=""
            loading="lazy"
            decoding="async"
          >
          <span class="lz-nameplate lz-nameplate--visitor" data-lz-consulting-visitor-name></span>
        </span>
      </div>
    </div>
  `;

  _paintLifeZoneMarquee(card.querySelector('[data-lz-marquee-canvas]'), hero);
  _renderActors(card, fallbackActors);
  _renderConsultingVisitor(card, fallbackActors);
  card.querySelector('[data-lz-action="npc-quest"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.currentTarget.dispatchEvent(new CustomEvent('life-zone:npc-quest', {
      bubbles: true,
      detail: { npc: 'trainer' }
    }));
  });
  card.querySelector('[data-lz-action="miranda-quest"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.currentTarget.dispatchEvent(new CustomEvent('life-zone:npc-quest', {
      bubbles: true,
      detail: { npc: 'miranda' }
    }));
  });
  card.querySelector('[data-lz-action="consulting-chief-quest"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.currentTarget.dispatchEvent(new CustomEvent('life-zone:npc-quest', {
      bubbles: true,
      detail: { npc: 'consultingChief' }
    }));
  });

  return card;
}

export function renderLifeZoneSummary({
  totalIntake = 0,
  todayTarget = 0,
  kcalState = '',
  remaining = 0,
  weightSummary = null,
  onDietClick = null,
  onWeightClick = null
} = {}) {
  const summary = document.createElement('section');
  summary.id = 'tf-life-zone-summary';
  summary.className = 'home-card lz-summary-card';
  summary.setAttribute('aria-label', '오늘의 칼로리와 체중 요약');

  const overAmount = Math.max(totalIntake - todayTarget, 0);
  const kcalHint = totalIntake > 0 && todayTarget > 0
    ? kcalState === 'over'
      ? `${_fmtKcal(overAmount)}kcal 초과`
      : `${_fmtKcal(remaining)}kcal 남음`
    : '아직 기록이 없어요';
  const weightHtml = weightSummary
    ? `
      <button type="button" class="lz-summary-btn lz-summary-btn--weight${weightSummary.isStale ? ' is-stale' : ''}" data-lz-action="weight">
        <span class="lz-summary-label">체중</span>
        <span class="lz-summary-main">${weightSummary.current.toFixed(1)}<small>kg</small>${weightSummary.lost > 0 ? `<em>-${weightSummary.lost.toFixed(1)}</em>` : ''}</span>
        <span class="lz-summary-sub">${escapeHtml(weightSummary.hint)}</span>
      </button>
    `
    : `
      <button type="button" class="lz-summary-btn lz-summary-btn--weight" data-lz-action="weight">
        <span class="lz-summary-label">체중</span>
        <span class="lz-summary-main">입력</span>
        <span class="lz-summary-sub">몸무게 입력</span>
      </button>
    `;

  summary.innerHTML = `
    <div class="lz-summary-strip">
      <button type="button" class="lz-summary-btn lz-summary-btn--diet" data-lz-action="diet">
        <span class="lz-summary-label">오늘 칼로리</span>
        <span class="lz-summary-main ${kcalState === 'over' ? 'is-over' : ''}">
          ${totalIntake > 0 ? _fmtKcal(totalIntake) : '-'}<small>/${_fmtKcal(todayTarget)}kcal</small>
        </span>
        <span class="lz-summary-sub ${kcalState}">${escapeHtml(kcalHint)}</span>
      </button>
      ${weightHtml}
    </div>
  `;

  summary.querySelector('[data-lz-action="diet"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    onDietClick?.();
  });
  summary.querySelector('[data-lz-action="weight"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    onWeightClick?.();
  });

  return summary;
}

export function getLocalLifeZonePreviewState(dayData = null) {
  return resolveLifeZoneActivity(dayData);
}
