// Service Worker for Dashboard3 (Life Streak)
// 오프라인 캐싱 및 PWA 기능 제공

// 캐시 버전: 타임스탬프 기반 자동 생성 — 파일 수정 시 SW 자동 업데이트
// (SW 파일 내용이 1바이트라도 바뀌면 브라우저가 새 SW로 인식)
const CACHE_VERSION = 'tomatofarm-v20260719z3-owner-day-journal-workout-inline-field-commit';
const RUNTIME_CACHE = 'dashboard3-runtime';
importScripts('./runtime-assets.js');
const STATIC_ASSETS = self.TOMATO_STATIC_ASSETS;

self.addEventListener('install', (event) => {
  console.log('[SW] Install event fired');
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      console.log('[SW] Caching static assets');
      // 개별 add + allSettled로 실패 파일명을 반드시 로깅한다.
      // (기존 addAll은 하나라도 실패하면 전체 롤백 + err.message에 파일명이 안 찍혀서 배포 디버깅 불가)
      const results = await Promise.allSettled(
        // A cache-version change must not repopulate the new SW cache from the
        // browser HTTP cache. Otherwise a fresh app shell can be paired with
        // stale modules/CSS that happen to have the same URL.
        STATIC_ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })))
      );
      const failures = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          failures.push({
            url: STATIC_ASSETS[i],
            error: (r.reason && r.reason.message) ? r.reason.message : String(r.reason)
          });
        }
      });
      if (failures.length) {
        console.error(`[SW] Precache failed for ${failures.length}/${STATIC_ASSETS.length} files:`);
        failures.forEach(f => console.error(`  - ${f.url}: ${f.error}`));
        throw new Error(`Precache failed for ${failures.length}/${STATIC_ASSETS.length} files`);
      } else {
        console.log(`[SW] Precached ${STATIC_ASSETS.length} assets successfully`);
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event fired');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type !== 'SKIP_WAITING') return;
  // Keep the message event alive until activation is requested. Without
  // waitUntil(), a backgrounded mobile client can reload while this update is
  // still waiting, leaving the old worker in control.
  const activation = self.skipWaiting();
  if (typeof event.waitUntil === 'function') event.waitUntil(activation);
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // HTML, CSS, JS (네트워크 우선)
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname === '/' || url.pathname === '/tomatofarm/') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (!response || response.status !== 200) return response;
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (request.destination === 'document') {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  // 이미지, 폰트 (캐시 우선)
  if (url.pathname.includes('fonts.googleapis') || url.pathname.match(/\.(woff2|woff|png|jpg|jpeg|svg|gif|ico)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        }).catch(() => caches.match(request));
      })
    );
    return;
  }

  // 기타 (네트워크 우선)
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request);
    })
  );
});

console.log('[SW] Service Worker loaded');
