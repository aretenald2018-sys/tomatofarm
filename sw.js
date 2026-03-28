// ================================================================
// Service Worker - PWA 오프라인 지원 및 캐싱
// ================================================================

const CACHE_VERSION = 'life-streak-v1';
const CACHE_URLS = [
  '/',
  '/dashboard3/',
  '/dashboard3/index.html',
  '/dashboard3/app.js',
  '/dashboard3/data.js',
  '/dashboard3/config.js',
  '/dashboard3/style.css',
  '/dashboard3/render-calendar.js',
  '/dashboard3/render-workout.js',
  '/dashboard3/render-home.js',
  '/dashboard3/render-stats.js',
  '/dashboard3/render-cooking.js',
  '/dashboard3/render-loa.js',
  '/dashboard3/render-monthly-calendar.js',
  '/dashboard3/render-wine.js',
  '/dashboard3/render-stats.js',
  '/dashboard3/ai.js',
  '/dashboard3/sheet.js',
  '/dashboard3/fatsecret-api.js',
  '/dashboard3/wine-data.js',
  '/dashboard3/stocks.js',
  '/dashboard3/manifest.json'
];

// 설치 이벤트 - 캐시 생성
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Caching app shell');
      // 각 파일을 개별적으로 캐시 - 일부 실패해도 진행
      return Promise.allSettled(
        CACHE_URLS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Failed to cache:', url, err);
        }))
      ).then(() => {
        console.log('[SW] Cache initialization complete');
      });
    })
  );
  self.skipWaiting();
});

// 활성화 이벤트 - 이전 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_VERSION)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch 이벤트 - 캐시 우선 전략
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Firebase 요청은 항상 네트워크에서 가져오기
  if (url.hostname.includes('firebase') || url.hostname.includes('firebaseio')) {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(() => {
          console.log('[SW] Firebase offline');
          // Firebase 요청이 실패하면 캐시된 페이지 반환
          return caches.match('/dashboard3/index.html');
        })
    );
    return;
  }

  // CSV 등 외부 리소스는 네트워크 우선
  if (request.url.includes('.csv') || request.url.includes('gstatic')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 성공한 요청은 캐시에 저장
          if (response && response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // 네트워크 실패 시 캐시에서 가져오기
          return caches.match(request).catch(() => {
            // 캐시도 없으면 오프라인 페이지 반환
            return caches.match('/dashboard3/index.html');
          });
        })
    );
    return;
  }

  // 일반적인 요청 - 캐시 우선
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        console.log('[SW] Serving from cache:', request.url);
        return response;
      }

      return fetch(request)
        .then((response) => {
          // 성공한 응답만 캐시에 저장
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          const clonedResponse = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, clonedResponse);
          });

          return response;
        })
        .catch((error) => {
          console.log('[SW] Fetch failed:', request.url, error);

          // 특정 파일 타입별 폴백
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#ccc"/></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          }

          // 기타 요청은 캐시된 인덱스 반환
          return caches.match('/dashboard3/index.html');
        });
    })
  );
});

// 백그라운드 동기화 (선택)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[SW] Syncing data...');
  // Firebase와 동기화 로직 추가 가능
}

// 푸시 알림 (선택)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || '새로운 알림이 있습니다',
    icon: '/dashboard3/manifest.json',
    badge: '/dashboard3/manifest.json',
    tag: 'life-streak-notification'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Life Streak', options)
  );
});
