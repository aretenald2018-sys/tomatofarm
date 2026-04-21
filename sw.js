// Service Worker for Dashboard3 (Life Streak)
// 오프라인 캐싱 및 PWA 기능 제공

// 캐시 버전: 타임스탬프 기반 자동 생성 — 파일 수정 시 SW 자동 업데이트
// (SW 파일 내용이 1바이트라도 바뀌면 브라우저가 새 SW로 인식)
const CACHE_VERSION = 'tomatofarm-v20260421z27-hero-character-mood-r3';
const RUNTIME_CACHE = 'dashboard3-runtime';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './styles/tokens.css',
  './styles/components.css',
  './firebase-messaging-sw.js',
  // 코어 모듈
  './app.js',
  './data.js',
  './calc.js',
  './config.js',
  './ai.js',
  './ai/llm-core.js',
  './ai/muscles.js',
  './ai/diet-rec.js',
  './ai/nutrition.js',
  './ai/equipment.js',
  './ai/routine.js',
  './ai/meal-estimate.js',
  './modal-manager.js',
  // 렌더 모듈
  './render-home.js',
  './home/index.js',
  './home/utils.js',
  './home/hero.js',
  './home/guild-card.js',
  './home/welcome-back.js',
  './home/today-summary.js',
  './home/weekly-streak.js',
  './home/goals-quests.js',
  './home/unit-goal.js',
  './home/tomato.js',
  './home/character.js',
  './home/farm.js',
  './home/notifications.js',
  './home/friend-feed.js',
  './home/friend-profile.js',
  './home/cheer-card.js',
  './home/cheers-card.js',
  './render-workout.js',
  './workout/index.js',
  './workout/state.js',
  './workout/save.js',
  './workout/save-schema.js',
  './workout/cross-domain.js',
  './workout/render.js',
  './workout/load.js',
  './workout/status.js',
  './workout/exercises.js',
  './workout/timers.js',
  './workout/activity-forms.js',
  './workout/expert/onboarding.js',
  './render-cooking.js',
  './render-stats.js',
  './render-admin.js',
  './admin/admin-hig.css',
  './admin/admin-segmentation.js',
  './admin/admin-outreach.js',
  // 분리 모듈
  './feature-nutrition.js',
  './feature-tutorial.js',
  './feature-diet-plan.js',
  './feature-fatsecret.js',
  './feature-checkin.js',
  './feature-misc.js',
  './workout-ui.js',
  './navigation.js',
  './pwa-fcm.js',
  // 모달 핸들러
  './app-modal-goals.js',
  './app-modal-quests.js',
  // 유틸리티
  './fatsecret-api.js',
  './sheet.js',
  './feature-login.js',
  './pwa-register.js',
  './utils/ux-polish.js',
  './utils/confirm-modal.js',
  './utils/form-guard.js',
  './utils/format.js',
  './utils/haptics.js',
  './utils/action-router.js',
  './home/personalize.js',
  './home/streak-warning.js',
  './home/admin-onboarding.js',
  // data 리팩토링 모듈
  './data/data-core.js',
  './data/data-load.js',
  './data/data-save.js',
  './data/data-pure.js',
  './data/data-auth.js',
  './data/data-account.js',
  './data/data-date.js',
  './data/data-image.js',
  './data/data-external.js',
  './data/data-helpers.js',
  './data/data-social.js',
  './data/data-social-friends.js',
  './data/data-social-guild.js',
  './data/data-social-interact.js',
  './data/data-social-log.js',
  './data/data-analytics.js',
  './data/raw-ingredients.js',
  // 어드민 모듈
  './admin/admin-overview.js',
  './admin/admin-users.js',
  './admin/admin-social.js',
  './admin/admin-charts.js',
  './admin/admin-utils.js',
  './admin/admin-cache.js',
  './admin/admin-actions.js',
  './admin/admin-export.js',
  './admin/admin-engagement.js',
  './admin/admin-cheers.js',
  './modals/weight-result-modal.js',
  './modals/guild-info-modal.js',
  './modals/self-cheer-modal.js',
  './modals/patchnote-modal.js',
  // 전문가 모드 (Scene 02~13)
  './expert-mode.css',
  './workout/expert.js',
  './data/data-workout-equipment.js',
  './modals/expert-onboarding-modal.js',
  './modals/gym-equipment-modal.js',
  './modals/routine-suggest-modal.js',
  './modals/routine-candidates-modal.js',
  './modals/insights-modal.js',
  // AI 음식 사진 추정 (2026-04-17 신규)
  './data/korean-food-normalize.js',
  './workout/ai-estimate.js',
  './modals/ai-estimate-banner.js',
  // AI 개인화 프로파일 (P1)
  './data/ai-food-profile.js',
  // 영양정보 리팩토링 (2026-04-18 신규)
  './data/nutrition-normalize.js',
  // 캘린더 탭 (2026-04-17 신규)
  './render-calendar.js',
  './modals/calendar-day-modal.js',
  './modals/custom-muscles-modal.js',
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install event fired');
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      console.log('[SW] Caching static assets');
      // 개별 add + allSettled로 실패 파일명을 반드시 로깅한다.
      // (기존 addAll은 하나라도 실패하면 전체 롤백 + err.message에 파일명이 안 찍혀서 배포 디버깅 불가)
      const results = await Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url))
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
