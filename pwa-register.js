// ================================================================
// pwa-register.js — Service Worker + FCM + PWA 설치 프롬프트 등록
// ================================================================
// R1 리팩토링: index.html 인라인 스크립트(~70줄) 외부 모듈 이관.
// 로컬 개발(localhost/127.0.0.1/file://) 은 SW 등록 스킵 + 기존 SW 해제.
// ================================================================
// 로컬 개발 환경 감지: localhost / 127.0.0.1 / file:// 에서는 SW 건너뛰기
// 이유: 배포 경로가 저장소별로 달라질 수 있음 → 현재 경로 기준 scope 사용
const _isLocalDev = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const APP_SW_SCOPE = new URL('./', location.href).pathname;
const FCM_SW_SCOPE = new URL('firebase-cloud-messaging-push/', new URL('./', location.href)).pathname;
const _pendingAppSWUpdates = new Map();
const APP_SW_AUTO_RELOAD_TIMEOUT_MS = 1500;
const _appSWWorkerIds = new WeakMap();
const _handledAppSWWorkers = new WeakSet();
const _attemptedAppSWAutoReloadWorkers = new WeakSet();
const _handledAppSWFallbackKeys = new Set();
const _attemptedAppSWAutoReloadFallbackKeys = new Set();
let _appSWUpdateSeq = 0;
let _latestAppSWUpdateSeq = 0;
let _appSWAutoReloading = false;
let _appSWWorkerIdSeq = 0;

async function _refreshAppSWRegistration(registration = null) {
  if (!('serviceWorker' in navigator)) return registration;
  const current = registration || window.__tomatoAppSWRegistration || await navigator.serviceWorker.getRegistration(APP_SW_SCOPE);
  if (!current || typeof current.update !== 'function') return current || null;
  try {
    const updated = await current.update();
    window.__tomatoAppSWRegistration = updated || current;
    return window.__tomatoAppSWRegistration;
  } catch (error) {
    console.warn('[PWA] 최신 Service Worker 확인 실패:', error?.message || error);
    window.__tomatoAppSWRegistration = current;
    return current;
  }
}

function _appSWTargetWorker(registration, worker = null) {
  return worker || registration?.waiting || registration?.installing || null;
}

function _appSWWorkerId(worker) {
  if (!worker || (typeof worker !== 'object' && typeof worker !== 'function')) return 'none';
  if (!_appSWWorkerIds.has(worker)) _appSWWorkerIds.set(worker, ++_appSWWorkerIdSeq);
  return _appSWWorkerIds.get(worker);
}

function _appSWUpdateKey(registration, worker = null) {
  const targetWorker = _appSWTargetWorker(registration, worker);
  const scriptURL = targetWorker?.scriptURL || 'sw.js';
  return `${registration?.scope || APP_SW_SCOPE}|${scriptURL}|worker:${_appSWWorkerId(targetWorker)}`;
}

function _hasActiveWorkoutDraftForAppSWUpdate() {
  try {
    return typeof window.__wtHasActiveDraft === 'function' && window.__wtHasActiveDraft();
  } catch {
    return false;
  }
}

function _hasAttemptedAppSWAutoReload(key, worker = null) {
  return worker
    ? _attemptedAppSWAutoReloadWorkers.has(worker)
    : _attemptedAppSWAutoReloadFallbackKeys.has(key);
}

function _markAppSWAutoReloadAttempted(key, worker = null) {
  if (worker) _attemptedAppSWAutoReloadWorkers.add(worker);
  else _attemptedAppSWAutoReloadFallbackKeys.add(key);
}

function _hasHandledAppSWUpdate(key, worker = null) {
  return worker
    ? _handledAppSWWorkers.has(worker)
    : _handledAppSWFallbackKeys.has(key);
}

function _markAppSWUpdateHandled(key, worker = null) {
  if (worker) _handledAppSWWorkers.add(worker);
  else _handledAppSWFallbackKeys.add(key);
}

function _showPendingAppSWUpdateBanner(registration, worker = null, key = null) {
  const updateKey = key || _appSWUpdateKey(registration, worker);
  if (typeof window.__showAppUpdateBanner !== 'function') {
    _pendingAppSWUpdates.set(updateKey, { registration, worker, seq: _latestAppSWUpdateSeq });
    return false;
  }
  window.__showAppUpdateBanner(registration, { key: updateKey });
  return true;
}

function _autoApplyAppSWUpdate(registration, worker = null) {
  if (_appSWAutoReloading || !registration || !navigator.serviceWorker.controller) return false;
  if (_hasActiveWorkoutDraftForAppSWUpdate()) return false;
  const targetWorker = worker || registration.waiting;
  if (!targetWorker || typeof targetWorker.postMessage !== 'function') return false;
  const key = _appSWUpdateKey(registration, targetWorker);
  if (_hasAttemptedAppSWAutoReload(key, targetWorker)) return false;
  _markAppSWAutoReloadAttempted(key, targetWorker);
  _appSWAutoReloading = true;
  let settled = false;
  const settle = () => {
    if (settled) return false;
    settled = true;
    _appSWAutoReloading = false;
    return true;
  };
  const reloadOnce = () => {
    if (!settle()) return;
    window.location.reload();
  };
  const fallbackToBanner = () => {
    if (!settle()) return;
    _showPendingAppSWUpdateBanner(registration, targetWorker, key);
  };
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true });
  try {
    targetWorker.postMessage({ type: 'SKIP_WAITING' });
  } catch (error) {
    console.warn('[PWA] Service Worker 업데이트 적용 요청 실패:', error?.message || error);
    fallbackToBanner();
    return true;
  }
  setTimeout(fallbackToBanner, APP_SW_AUTO_RELOAD_TIMEOUT_MS);
  return true;
}

function _requestAppUpdateBanner(registration, worker = null) {
  if (!registration || !navigator.serviceWorker.controller) return;
  const targetWorker = _appSWTargetWorker(registration, worker);
  const key = _appSWUpdateKey(registration, targetWorker);
  if (_hasHandledAppSWUpdate(key, targetWorker)) return;
  _markAppSWUpdateHandled(key, targetWorker);
  const seq = ++_appSWUpdateSeq;
  _latestAppSWUpdateSeq = seq;
  const wasPending = _pendingAppSWUpdates.has(key);
  _pendingAppSWUpdates.set(key, { registration, worker: targetWorker, seq });

  const show = ({ allowAutoReload = true } = {}) => {
    const pending = _pendingAppSWUpdates.get(key);
    if (!pending) return false;
    _pendingAppSWUpdates.delete(key);
    if (pending.seq < _latestAppSWUpdateSeq) return true;
    if (allowAutoReload && _autoApplyAppSWUpdate(pending.registration, pending.worker)) return true;
    return _showPendingAppSWUpdateBanner(pending.registration, pending.worker, key);
  };

  if (window.__tomatoAppReady && show()) return;
  if (!wasPending) {
    window.addEventListener('tomato-app-ready', show, { once: true });
    setTimeout(show, 2000);
  }
}

function _requestLatestAppUpdateBanner(registration, worker = null) {
  if (!registration || !navigator.serviceWorker.controller) return;
  _refreshAppSWRegistration(registration).then((latestRegistration) => {
    const latestWorker = latestRegistration?.waiting || latestRegistration?.installing || worker;
    _requestAppUpdateBanner(latestRegistration || registration, latestWorker);
  });
}

function registerFirebaseMessagingWorker() {
  if (_isLocalDev || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (window.__tomatoFcmSWRegistrationPromise) return window.__tomatoFcmSWRegistrationPromise;

  window.__tomatoFcmSWRegistrationPromise = navigator.serviceWorker
    .register('firebase-messaging-sw.js', { scope: FCM_SW_SCOPE })
    .then((registration) => {
      console.log('[FCM] Messaging SW 등록 성공:', registration.scope);
      return registration;
    })
    .catch((e) => {
      window.__tomatoFcmSWRegistrationPromise = null;
      console.warn('[FCM] Messaging SW 등록 실패:', e.message);
      return null;
    });

  return window.__tomatoFcmSWRegistrationPromise;
}

window.__getTomatoFcmSWRegistration = registerFirebaseMessagingWorker;
window.__refreshTomatoAppSWRegistration = _refreshAppSWRegistration;

if (_isLocalDev) {
  // 로컬 환경: 기존 SW 전부 해제하여 깨끗한 fetch 보장
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (regs.length) {
        console.log('[DEV] 로컬 환경 — 기존 SW', regs.length, '개 해제');
        regs.forEach((r) => r.unregister());
      }
    }).catch(() => {});
  }
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    console.log('[PWA] Service Worker 등록 시도 중...');
    window.__tomatoAppSWRegistrationPromise = navigator.serviceWorker.register('sw.js', { scope: APP_SW_SCOPE })
      .then(registration => {
        window.__tomatoAppSWRegistration = registration;
        console.log('[PWA] Service Worker 등록 성공:', registration);
        console.log('[PWA] Service Worker 상태 - Active:', !!registration.active, 'Installing:', !!registration.installing, 'Waiting:', !!registration.waiting);
        if (registration.waiting && navigator.serviceWorker.controller) {
          _requestLatestAppUpdateBanner(registration, registration.waiting);
        }

        // 업데이트 확인
        registration.addEventListener('updatefound', () => {
          console.log('[PWA] updatefound 이벤트 감지');
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            console.log('[PWA] Service Worker 상태 변경:', newWorker.state);
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] 새로운 버전이 준비되었습니다. 업데이트 아이콘을 표시합니다.');
              _requestAppUpdateBanner(registration, newWorker);
            }
          });
        });

        // 현재 활성 Service Worker 확인
        navigator.serviceWorker.ready.then(registration => {
          console.log('[PWA] Service Worker 준비 완료:', registration);
        });
        return registration;
      })
      .catch(error => {
        window.__tomatoAppSWRegistrationPromise = null;
        console.error('[PWA] Service Worker 등록 실패:', error);
        console.error('[PWA] 에러 상세:', error.message);
      });
  });
} else {
  console.warn('[PWA] Service Worker를 지원하지 않는 브라우저');
}

// Firebase Messaging 서비스워커 등록 (FCM 웹 푸시용)
// 앱 SW와 같은 scope를 쓰면 두 SW가 매 로드마다 서로를 업데이트로 밀어내므로 FCM 전용 하위 scope를 사용한다.
if (!_isLocalDev && 'serviceWorker' in navigator) {
  registerFirebaseMessagingWorker();
}

// 설치 프롬프트(beforeinstallprompt/appinstalled)는 pwa-fcm.js가 단독으로 처리한다.
// 여기에 있던 중복 리스너는 값을 어디에도 쓰지 않는 죽은 코드였다.
