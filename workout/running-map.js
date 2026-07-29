import { toFiniteNumber } from '../utils/number.js';
const _num = (value, fallback = NaN) => toFiniteNumber(value, fallback);
// ================================================================
// workout/running-map.js — real map provider renderer for running
// ================================================================

import { CONFIG } from '../config.js';
import { splitExplicitRunningRouteSegments } from './running-route-policy.js';

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const GOOGLE_CALLBACK = '__tomatoRunningGoogleMapsReady';
const TILE_SIZE = 256;
const VWORLD_MIN_ZOOM = 10;
const VWORLD_MAX_ZOOM = 18;
const VWORLD_TILE_BASE = 'https://api.vworld.kr/req/wmts/1.0.0';
const VWORLD_LAYER_SPECS = {
  base: { layer: 'Base', ext: 'png' },
  satellite: { layer: 'Satellite', ext: 'jpeg' },
  hybrid: { layer: 'Hybrid', ext: 'png' },
};

let _googleLoader = null;
let _tmapLoader = null;
const _instances = new WeakMap();
const _renderEpochs = new WeakMap();

function _nextRenderEpoch(shell) {
  const epoch = (_renderEpochs.get(shell) || 0) + 1;
  _renderEpochs.set(shell, epoch);
  return epoch;
}

function _destroyMapInstance(instance) {
  if (!instance) return;
  try {
    for (const marker of instance.markers || []) marker?.setMap?.(null);
    for (const line of instance.lines || []) line?.setMap?.(null);
    instance.map?.destroy?.();
  } catch {}
}

function _finitePointNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return _num(value);
}

function _point(point) {
  const lat = _finitePointNumber(point?.lat ?? point?.latitude);
  const lng = _finitePointNumber(point?.lng ?? point?.lon ?? point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const normalized = { lat, lng };
  const ts = _finitePointNumber(point?.ts ?? point?.timestamp ?? point?.time);
  if (Number.isFinite(ts)) normalized.ts = ts;
  const accuracy = _finitePointNumber(point?.accuracy);
  if (Number.isFinite(accuracy)) normalized.accuracy = accuracy;
  const altitude = _finitePointNumber(point?.altitude);
  if (Number.isFinite(altitude)) normalized.altitude = altitude;
  const speed = _finitePointNumber(point?.speed);
  if (Number.isFinite(speed)) normalized.speed = speed;
  const segmentId = Number(point?.segmentId);
  if (Number.isFinite(segmentId) && segmentId >= 0) normalized.segmentId = Math.floor(segmentId);
  if (point?.gapBefore === true) normalized.gapBefore = true;
  const gapReason = String(point?.gapReason || '').trim();
  if (gapReason) normalized.gapReason = gapReason.slice(0, 48);
  return normalized;
}

function _providerRoutePoints(route) {
  return route.map(({ lat, lng, segmentId, gapBefore, gapReason }) => {
    const point = { lat, lng };
    if (Number.isFinite(Number(segmentId))) point.segmentId = Number(segmentId);
    if (gapBefore === true) point.gapBefore = true;
    if (gapReason) point.gapReason = gapReason;
    return point;
  });
}

function _clearNode(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function _setState(shell, state, text = '') {
  if (!shell) return;
  shell.dataset.mapState = state;
  const status = shell.querySelector('[data-running-map-status]');
  if (status) {
    status.textContent = text;
    status.hidden = state === 'ready';
  }
}

function _providerLabel(provider) {
  if (provider === 'vworld') return 'VWorld';
  if (provider === 'google') return 'Google Maps';
  if (provider === 'tmap') return 'TMAP';
  return '실제 지도';
}

function _removeInstance(shell) {
  const instance = _instances.get(shell);
  if (!instance) return;
  _destroyMapInstance(instance);
  _instances.delete(shell);
}

export function normalizeRunningMapPoints(points = []) {
  return (Array.isArray(points) ? points : []).map(_point).filter(Boolean);
}

export function splitRunningMapSegments(points = []) {
  const route = normalizeRunningMapPoints(points);
  return splitExplicitRunningRouteSegments(route);
}

export function buildRunningMapRenderModel(points = []) {
  const route = normalizeRunningMapPoints(points);
  const segments = splitExplicitRunningRouteSegments(route);
  return {
    route,
    segments,
    diagnostics: Object.freeze({
      sourcePointCount: Array.isArray(points) ? points.length : 0,
      renderPointCount: route.length,
      droppedInvalidPointCount: (Array.isArray(points) ? points.length : 0) - route.length,
      segmentCount: segments.length,
    }),
  };
}

function _routeForBounds(route) {
  return normalizeRunningMapPoints(route);
}

export function runningMapCenter(points = []) {
  const route = _routeForBounds(points);
  if (!route.length) return { ...DEFAULT_CENTER };
  const sum = route.reduce((acc, p) => {
    acc.lat += p.lat;
    acc.lng += p.lng;
    return acc;
  }, { lat: 0, lng: 0 });
  return {
    lat: sum.lat / route.length,
    lng: sum.lng / route.length,
  };
}

function _normalizeVworldLayer(layer) {
  const normalized = String(layer || '').trim().toLowerCase();
  return normalized === 'satellite' || normalized === 'hybrid' ? normalized : 'base';
}

export function resolveRunningMapConfig(raw = {}) {
  const vworldApiKey = String(raw.vworldApiKey || '').trim();
  const vworldLayer = _normalizeVworldLayer(raw.vworldLayer);
  const googleMapsKey = String(raw.googleMapsKey || '').trim();
  const tmapAppKey = String(raw.tmapAppKey || '').trim();
  let provider = String(raw.provider || 'auto').trim().toLowerCase();
  if (!provider || provider === 'default') provider = 'auto';
  if (provider === 'auto' || provider === 'none') provider = vworldApiKey ? 'vworld' : tmapAppKey ? 'tmap' : googleMapsKey ? 'google' : 'none';
  if (provider === 'google' && !googleMapsKey && vworldApiKey) provider = 'vworld';
  if (provider === 'tmap' && !tmapAppKey && vworldApiKey) provider = 'vworld';

  if (provider === 'vworld') {
    return {
      provider,
      label: _providerLabel(provider),
      key: vworldApiKey,
      layer: vworldLayer,
      configured: !!vworldApiKey,
      reason: vworldApiKey ? '' : 'missing-key',
    };
  }
  if (provider === 'google') {
    return {
      provider,
      label: _providerLabel(provider),
      key: googleMapsKey,
      configured: !!googleMapsKey,
      reason: googleMapsKey ? '' : 'missing-key',
    };
  }
  if (provider === 'tmap') {
    return {
      provider,
      label: _providerLabel(provider),
      key: tmapAppKey,
      configured: !!tmapAppKey,
      reason: tmapAppKey ? '' : 'missing-key',
    };
  }
  return {
    provider: 'none',
    label: _providerLabel('none'),
    key: '',
    configured: false,
    reason: 'missing-key',
  };
}

export function readRunningMapConfig() {
  const mapConfig = CONFIG.MAPS || {};
  return resolveRunningMapConfig({
    provider: mapConfig.RUNNING_PROVIDER,
    vworldApiKey: mapConfig.VWORLD_API_KEY,
    vworldLayer: mapConfig.VWORLD_MAP_LAYER,
    googleMapsKey: mapConfig.GOOGLE_MAPS_KEY,
    tmapAppKey: mapConfig.TMAP_APP_KEY,
  });
}

export function buildGoogleMapsScriptUrl(key, callbackName = GOOGLE_CALLBACK) {
  const params = new URLSearchParams({
    key: String(key || '').trim(),
    callback: callbackName,
    loading: 'async',
    language: 'ko',
    region: 'KR',
    v: 'weekly',
  });
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

export function buildTmapScriptUrl(key) {
  const params = new URLSearchParams({
    version: '1',
    appKey: String(key || '').trim(),
  });
  return `https://apis.openapi.sk.com/tmap/jsv2?${params.toString()}`;
}

export function buildVworldTileUrl(key, z, x, y, layer = 'base') {
  const spec = VWORLD_LAYER_SPECS[_normalizeVworldLayer(layer)];
  const apiKey = encodeURIComponent(String(key || '').trim());
  return `${VWORLD_TILE_BASE}/${apiKey}/${spec.layer}/${z}/${y}/${x}.${spec.ext}`;
}

async function _loadGoogleMaps(key) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('browser required');
  }
  if (window.google?.maps?.Map) return window.google.maps;
  if (_googleLoader) return _googleLoader;

  _googleLoader = new Promise((resolve, reject) => {
    window[GOOGLE_CALLBACK] = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = buildGoogleMapsScriptUrl(key);
    script.async = true;
    script.defer = true;
    script.dataset.runningMapScript = 'google';
    script.onerror = () => reject(new Error('Google Maps load failed'));
    document.head.appendChild(script);
  }).catch(error => {
    _googleLoader = null;
    throw error;
  });
  return _googleLoader;
}

async function _loadTmap(key) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('browser required');
  }
  if (window.Tmapv2?.Map) return window.Tmapv2;
  if (_tmapLoader) return _tmapLoader;

  _tmapLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = buildTmapScriptUrl(key);
    script.async = true;
    script.defer = true;
    script.dataset.runningMapScript = 'tmap';
    script.onload = () => window.Tmapv2?.Map ? resolve(window.Tmapv2) : reject(new Error('TMAP SDK unavailable'));
    script.onerror = () => reject(new Error('TMAP load failed'));
    document.head.appendChild(script);
  }).catch(error => {
    _tmapLoader = null;
    throw error;
  });
  return _tmapLoader;
}

function _googleIcon(maps, color, scale = 8) {
  return {
    path: maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 3,
    scale,
  };
}

function _fitGoogle(maps, map, route) {
  if (route.length < 2) return;
  const bounds = new maps.LatLngBounds();
  route.forEach(p => bounds.extend(p));
  map.fitBounds(bounds, 42);
}

function _renderGoogleMap(canvas, maps, route) {
  const center = runningMapCenter(route);
  const map = new maps.Map(canvas, {
    center,
    zoom: route.length > 1 ? 15 : 17,
    disableDefaultUI: true,
    clickableIcons: false,
    gestureHandling: 'greedy',
    keyboardShortcuts: false,
  });
  const markers = [];
  const lines = [];

  function updateRoute(nextRoute) {
    markers.splice(0).forEach(marker => marker?.setMap?.(null));
    lines.splice(0).forEach(line => line?.setMap?.(null));
    const segments = splitRunningMapSegments(nextRoute);
    for (const segment of segments) {
      if (segment.length < 2) continue;
      lines.push(new maps.Polyline({
        path: segment,
        geodesic: true,
        strokeColor: '#d7ff3f',
        strokeOpacity: 0.92,
        strokeWeight: 7,
        map,
      }));
    }
    if (nextRoute.length > 1) {
      markers.push(new maps.Marker({ position: nextRoute[0], map, icon: _googleIcon(maps, '#20b84d') }));
    }
    if (nextRoute.length) {
      markers.push(new maps.Marker({ position: nextRoute[nextRoute.length - 1], map, icon: _googleIcon(maps, '#f40000', 9) }));
    }
    _fitGoogle(maps, map, _routeForBounds(nextRoute));
  }

  updateRoute(route);
  return { map, markers, lines, updateRoute };
}

function _tmapPoint(Tmapv2, point) {
  return new Tmapv2.LatLng(point.lat, point.lng);
}

function _tmapMarkerHtml(color) {
  return `<span style="display:block;width:18px;height:18px;border-radius:50%;background:${color};border:4px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.22)"></span>`;
}

function _fitTmap(Tmapv2, map, latLngs) {
  try {
    if (latLngs.length < 2 || !Tmapv2.LatLngBounds) return;
    const bounds = new Tmapv2.LatLngBounds();
    latLngs.forEach(p => bounds.extend(p));
    map.fitBounds(bounds);
  } catch {}
}

function _renderTmap(canvas, Tmapv2, route) {
  const center = runningMapCenter(route);
  const map = new Tmapv2.Map(canvas, {
    center: _tmapPoint(Tmapv2, center),
    width: '100%',
    height: '100%',
    zoom: route.length > 1 ? 15 : 17,
    zoomControl: false,
    scrollwheel: true,
  });
  const markers = [];
  const lines = [];

  function updateRoute(nextRoute) {
    markers.splice(0).forEach(marker => marker?.setMap?.(null));
    lines.splice(0).forEach(line => line?.setMap?.(null));
    const latLngs = nextRoute.map(point => _tmapPoint(Tmapv2, point));
    for (const segment of splitRunningMapSegments(nextRoute)) {
      if (segment.length < 2) continue;
      lines.push(new Tmapv2.Polyline({
        path: segment.map(point => _tmapPoint(Tmapv2, point)),
        strokeColor: '#d7ff3f',
        strokeWeight: 7,
        map,
      }));
    }
    if (latLngs.length > 1) {
      markers.push(new Tmapv2.Marker({ position: latLngs[0], iconHTML: _tmapMarkerHtml('#20b84d'), map }));
    }
    if (latLngs.length) {
      markers.push(new Tmapv2.Marker({ position: latLngs[latLngs.length - 1], iconHTML: _tmapMarkerHtml('#f40000'), map }));
    }
    _fitTmap(Tmapv2, map, latLngs);
  }

  updateRoute(route);
  return { map, markers, lines, updateRoute };
}

function _projectMercator(point, zoom) {
  const sin = Math.sin(_num(point.lat) * Math.PI / 180);
  const world = TILE_SIZE * (2 ** zoom);
  return {
    x: (_num(point.lng) + 180) / 360 * world,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
  };
}

function _unprojectMercator(pixel, zoom) {
  const world = TILE_SIZE * (2 ** zoom);
  const lng = pixel.x / world * 360 - 180;
  const n = Math.PI - 2 * Math.PI * pixel.y / world;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Math.max(-85.0511, Math.min(85.0511, lat)),
    lng: ((lng + 540) % 360) - 180,
  };
}

function _clampVworldZoom(zoom) {
  return Math.max(VWORLD_MIN_ZOOM, Math.min(VWORLD_MAX_ZOOM, Math.round(_num(zoom, 16))));
}

function _routeBoundsCenter(route) {
  if (route.length < 2) return runningMapCenter(route);
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  route.forEach(point => {
    minLat = Math.min(minLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLat = Math.max(maxLat, point.lat);
    maxLng = Math.max(maxLng, point.lng);
  });
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

function _vworldZoomForRoute(route, width, height) {
  if (route.length < 2) return 17;
  const pad = 72;
  for (let zoom = VWORLD_MAX_ZOOM; zoom >= VWORLD_MIN_ZOOM; zoom--) {
    const projected = route.map(point => _projectMercator(point, zoom));
    const xs = projected.map(point => point.x);
    const ys = projected.map(point => point.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (spanX <= Math.max(120, width - pad) && spanY <= Math.max(120, height - pad)) return zoom;
  }
  return VWORLD_MIN_ZOOM;
}

function _vworldRenderLayers(layer) {
  return layer === 'hybrid' ? ['satellite', 'hybrid'] : [layer];
}

function _tileModulo(value, max) {
  return ((value % max) + max) % max;
}

function _vworldTileRenderSpec(zoom) {
  const dpr = typeof window !== 'undefined' ? Number(window.devicePixelRatio || 1) : 1;
  const ratio = dpr >= 1.5 && zoom < 18 ? 2 : 1;
  return {
    tileZoom: zoom + (ratio === 2 ? 1 : 0),
    scale: 1 / ratio,
    tileCssSize: TILE_SIZE / ratio,
  };
}

function _screenPointScaled(point, zoom, scale, topLeft) {
  const px = _projectMercator(point, zoom);
  return { x: px.x * scale - topLeft.x, y: px.y * scale - topLeft.y };
}

function _vworldRouteSvg(route, zoom, scale, topLeft, width, height) {
  const points = _routeForBounds(route).map(point => _screenPointScaled(point, zoom, scale, topLeft));
  const lines = splitRunningMapSegments(route).map((segment, index) => {
    if (segment.length > 1) {
      const line = segment
        .map(point => _screenPointScaled(point, zoom, scale, topLeft))
        .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
        .join(' ');
      return `<polyline class="wt-vworld-route-line" data-route-segment="${index}" points="${line}"></polyline>`;
    }
    return '';
  }).filter(Boolean).join('');
  const start = points[0];
  const end = points[points.length - 1];
  const markers = points.length > 1
    ? `<circle class="wt-vworld-route-start" cx="${start.x.toFixed(1)}" cy="${start.y.toFixed(1)}" r="8"></circle>
       <circle class="wt-vworld-route-end" cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="9"></circle>`
    : `<circle class="wt-vworld-route-end" cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="9"></circle>`;
  return `
    <svg class="wt-vworld-route-layer" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${lines}
      ${markers}
    </svg>`;
}

function _renderVworldMap(canvas, initialRoute, config) {
  const layer = _normalizeVworldLayer(config.layer);
  let route = _routeForBounds(initialRoute);
  const boundsRoute = route;
  const root = document.createElement('div');
  root.className = `wt-vworld-map wt-vworld-map--${layer}`;
  root.dataset.interactiveMap = 'vworld';
  root.tabIndex = 0;
  canvas.appendChild(root);

  const state = {
    center: _routeBoundsCenter(boundsRoute.length ? boundsRoute : [DEFAULT_CENTER]),
    zoom: 17,
    width: 360,
    height: 320,
  };
  const cleanup = [];
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let raf = 0;
  let resizeObserver = null;

  function measure() {
    const rect = canvas.getBoundingClientRect?.() || {};
    state.width = Math.max(280, Math.round(rect.width || canvas.clientWidth || 360));
    state.height = Math.max(220, Math.round(rect.height || canvas.clientHeight || 320));
    root.style.width = `${state.width}px`;
    root.style.height = `${state.height}px`;
  }

  measure();
  state.zoom = _vworldZoomForRoute(boundsRoute, state.width, state.height);

  function topLeftForCurrentView() {
    const centerPx = _projectMercator(state.center, state.zoom);
    return {
      x: centerPx.x - state.width / 2,
      y: centerPx.y - state.height / 2,
    };
  }

  function renderNow() {
    raf = 0;
    measure();
    _clearNode(root);
    const renderSpec = _vworldTileRenderSpec(state.zoom);
    const topLeft = topLeftForCurrentView();
    const topLeftRaw = { x: topLeft.x / renderSpec.scale, y: topLeft.y / renderSpec.scale };
    const maxTile = 2 ** renderSpec.tileZoom;
    const minTileX = Math.floor(topLeftRaw.x / TILE_SIZE);
    const maxTileX = Math.floor((topLeftRaw.x + state.width / renderSpec.scale) / TILE_SIZE);
    const minTileY = Math.floor(topLeftRaw.y / TILE_SIZE);
    const maxTileY = Math.floor((topLeftRaw.y + state.height / renderSpec.scale) / TILE_SIZE);

    for (const renderLayer of _vworldRenderLayers(layer)) {
      const layerEl = document.createElement('div');
      layerEl.className = `wt-vworld-tile-layer wt-vworld-tile-layer--${renderLayer}`;
      for (let y = minTileY; y <= maxTileY; y++) {
        if (y < 0 || y >= maxTile) continue;
        for (let x = minTileX; x <= maxTileX; x++) {
          const tile = document.createElement('img');
          const wrappedX = _tileModulo(x, maxTile);
          tile.className = 'wt-vworld-tile';
          tile.alt = '';
          tile.decoding = 'async';
          tile.loading = 'eager';
          tile.draggable = false;
          tile.src = buildVworldTileUrl(config.key, renderSpec.tileZoom, wrappedX, y, renderLayer);
          tile.style.left = `${Math.round(x * TILE_SIZE * renderSpec.scale - topLeft.x)}px`;
          tile.style.top = `${Math.round(y * TILE_SIZE * renderSpec.scale - topLeft.y)}px`;
          tile.style.width = `${renderSpec.tileCssSize}px`;
          tile.style.height = `${renderSpec.tileCssSize}px`;
          layerEl.appendChild(tile);
        }
      }
      root.appendChild(layerEl);
    }

    if (route.length) {
      root.insertAdjacentHTML('beforeend', _vworldRouteSvg(route, renderSpec.tileZoom, renderSpec.scale, topLeft, state.width, state.height));
    }
    root.insertAdjacentHTML('beforeend', '<div class="wt-vworld-attribution">VWorld</div>');
  }

  function scheduleRender() {
    if (raf) return;
    raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(renderNow)
      : setTimeout(renderNow, 16);
  }

  function pointInRoot(event) {
    const rect = root.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function zoomAt(clientX, clientY, nextZoom) {
    const zoom = _clampVworldZoom(nextZoom);
    if (zoom === state.zoom) return;
    const point = pointInRoot({ clientX, clientY });
    const oldTopLeft = topLeftForCurrentView();
    const anchor = _unprojectMercator({
      x: oldTopLeft.x + point.x,
      y: oldTopLeft.y + point.y,
    }, state.zoom);
    const anchorPx = _projectMercator(anchor, zoom);
    const nextCenterPx = {
      x: anchorPx.x - point.x + state.width / 2,
      y: anchorPx.y - point.y + state.height / 2,
    };
    state.zoom = zoom;
    state.center = _unprojectMercator(nextCenterPx, zoom);
    scheduleRender();
  }

  function pointerDistance(points) {
    const [a, b] = points;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerMidpoint(points) {
    const [a, b] = points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function resetDragFromRemainingPointer() {
    const remaining = Array.from(pointers.values())[0];
    if (!remaining) {
      drag = null;
      return;
    }
    drag = {
      pointerId: remaining.pointerId,
      startX: remaining.x,
      startY: remaining.y,
      startCenterPx: _projectMercator(state.center, state.zoom),
    };
  }

  function handlePointerDown(event) {
    pointers.set(event.pointerId, { pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    try { root.setPointerCapture?.(event.pointerId); } catch {}
    root.classList.add('wt-vworld-map--dragging');
    if (pointers.size === 1) {
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCenterPx: _projectMercator(state.center, state.zoom),
      };
    } else if (pointers.size === 2) {
      const points = Array.from(pointers.values());
      pinch = { distance: pointerDistance(points) };
      drag = null;
    }
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const points = Array.from(pointers.values()).slice(0, 2);
      const distance = pointerDistance(points);
      if (pinch?.distance) {
        const ratio = distance / pinch.distance;
        if (ratio > 1.18 || ratio < 0.85) {
          const midpoint = pointerMidpoint(points);
          const rect = root.getBoundingClientRect();
          zoomAt(rect.left + midpoint.x, rect.top + midpoint.y, state.zoom + (ratio > 1 ? 1 : -1));
          pinch = { distance };
        }
      } else {
        pinch = { distance };
      }
      event.preventDefault();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    state.center = _unprojectMercator({
      x: drag.startCenterPx.x - dx,
      y: drag.startCenterPx.y - dy,
    }, state.zoom);
    scheduleRender();
    event.preventDefault();
  }

  function handlePointerEnd(event) {
    pointers.delete(event.pointerId);
    try { root.releasePointerCapture?.(event.pointerId); } catch {}
    pinch = null;
    if (pointers.size) resetDragFromRemainingPointer();
    else {
      drag = null;
      root.classList.remove('wt-vworld-map--dragging');
    }
  }

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  const activeOptions = { passive: false };
  on(root, 'pointerdown', handlePointerDown, activeOptions);
  on(root, 'pointermove', handlePointerMove, activeOptions);
  on(root, 'pointerup', handlePointerEnd, activeOptions);
  on(root, 'pointercancel', handlePointerEnd, activeOptions);
  on(root, 'wheel', event => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, state.zoom + (event.deltaY < 0 ? 1 : -1));
  }, activeOptions);
  on(root, 'dblclick', event => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, state.zoom + 1);
  }, activeOptions);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleRender);
    resizeObserver.observe(canvas);
  }

  renderNow();
  return {
    map: {
      destroy: () => {
        if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
        else if (raf) clearTimeout(raf);
        cleanup.forEach(fn => fn());
        resizeObserver?.disconnect?.();
        _clearNode(canvas);
      },
    },
    markers: [],
    lines: [],
    updateRoute: nextRoute => {
      route = _routeForBounds(nextRoute);
      if (route.length) {
        state.center = _routeBoundsCenter(route);
        state.zoom = _vworldZoomForRoute(route, state.width, state.height);
      }
      scheduleRender();
    },
  };
}

export async function renderRunningMap(shell, options = {}) {
  if (!shell) return null;
  const canvas = shell.querySelector('[data-running-map-canvas]');
  if (!canvas) return null;

  _removeInstance(shell);
  _clearNode(canvas);
  const renderEpoch = _nextRenderEpoch(shell);

  const config = options.config || readRunningMapConfig();
  const model = buildRunningMapRenderModel(options.points || []);
  const route = model.route;
  const providerRoute = _providerRoutePoints(route);
  shell.dataset.mapProvider = config.provider;
  shell.dataset.mapPointCount = String(route.length);
  shell.dataset.mapSourcePointCount = String(model.diagnostics.sourcePointCount);
  shell.dataset.mapDroppedPointCount = String(model.diagnostics.droppedInvalidPointCount);
  shell.dataset.mapSegmentCount = String(model.diagnostics.segmentCount);

  if (!route.length) {
    const waiting = options.phase === 'start' || options.phase === 'active';
    _setState(
      shell,
      'no-location',
      waiting ? '현재 GPS 위치를 확인하는 중이에요' : '저장된 GPS 경로가 없어요',
    );
    return null;
  }

  if (!config.configured) {
    _setState(shell, 'missing-key', '지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    return null;
  }

  _setState(shell, 'loading', `${config.label} 불러오는 중`);
  try {
    const instance = config.provider === 'vworld'
      ? _renderVworldMap(canvas, providerRoute, config)
      : config.provider === 'tmap'
        ? _renderTmap(canvas, await _loadTmap(config.key), providerRoute)
        : _renderGoogleMap(canvas, await _loadGoogleMaps(config.key), providerRoute);
    if (_renderEpochs.get(shell) !== renderEpoch) {
      _destroyMapInstance(instance);
      return _instances.get(shell) || null;
    }
    _instances.set(shell, instance);
    _setState(shell, 'ready');
    return instance;
  } catch (error) {
    if (_renderEpochs.get(shell) !== renderEpoch) return _instances.get(shell) || null;
    console.warn('[running-map] provider render failed:', error);
    _setState(shell, 'error', `${config.label} 로드 실패`);
    return null;
  }
}

export async function updateRunningMap(shell, options = {}) {
  if (!shell) return null;
  const instance = _instances.get(shell);
  if (!instance?.updateRoute) return renderRunningMap(shell, options);
  const model = buildRunningMapRenderModel(options.points || []);
  shell.dataset.mapPointCount = String(model.diagnostics.renderPointCount);
  shell.dataset.mapSourcePointCount = String(model.diagnostics.sourcePointCount);
  shell.dataset.mapDroppedPointCount = String(model.diagnostics.droppedInvalidPointCount);
  shell.dataset.mapSegmentCount = String(model.diagnostics.segmentCount);
  instance.updateRoute(_providerRoutePoints(model.route));
  _setState(shell, model.route.length ? 'ready' : 'no-location', model.route.length ? '' : 'GPS 위치를 기다리는 중');
  return instance;
}

export function destroyRunningMaps(scope) {
  if (!scope) return;
  const shells = [];
  if (scope.matches?.('[data-running-real-map]')) shells.push(scope);
  scope.querySelectorAll?.('[data-running-real-map]').forEach(el => shells.push(el));
  shells.forEach(shell => {
    _nextRenderEpoch(shell);
    _removeInstance(shell);
  });
}
