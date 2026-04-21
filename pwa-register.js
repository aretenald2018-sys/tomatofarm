// ================================================================
// pwa-register.js — Service Worker + FCM + PWA 설치 프롬프트 등록
// ================================================================
// R1 리팩토링: index.html 인라인 스크립트(~70줄) 외부 모듈 이관.
// 로컬 개발(localhost/127.0.0.1/file://) 은 SW 등록 스킵 + 기존 SW 해제.
// ================================================================
// 로컬 개발 환경 감지: localhost / 127.0.0.1 / file:// 에서는 SW 건너뛰기
// 이유: 배포용 scope '/tomatofarm/' 가 로컬 루트와 불일치 → 등록 실패 + 스테일 캐시가 ERR_EMPTY_RESPONSE 유발
const _isLocalDev = ['localhost', '127.0.0.1', ''].includes(location.hostname);

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
    navigator.serviceWorker.register('sw.js', { scope: '/tomatofarm/' })
      .then(registration => {
        console.log('[PWA] Service Worker 등록 성공:', registration);
        console.log('[PWA] Service Worker 상태 - Active:', !!registration.active, 'Installing:', !!registration.installing, 'Waiting:', !!registration.waiting);

        // 업데이트 확인
        registration.addEventListener('updatefound', () => {
          console.log('[PWA] updatefound 이벤트 감지');
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            console.log('[PWA] Service Worker 상태 변경:', newWorker.state);
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] 새로운 버전이 준비되었습니다. 페이지를 새로고침하세요.');
            }
          });
        });

        // 현재 활성 Service Worker 확인
        navigator.serviceWorker.ready.then(registration => {
          console.log('[PWA] Service Worker 준비 완료:', registration);
        });
      })
      .catch(error => {
        console.error('[PWA] Service Worker 등록 실패:', error);
        console.error('[PWA] 에러 상세:', error.message);
      });
  });
} else {
  console.warn('[PWA] Service Worker를 지원하지 않는 브라우저');
}

// Firebase Messaging 서비스워커 등록 (FCM 웹 푸시용)
if (!_isLocalDev && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('firebase-messaging-sw.js', { scope: '/tomatofarm/' })
    .then(() => console.log('[FCM] Messaging SW 등록 성공'))
    .catch(e => console.warn('[FCM] Messaging SW 등록 실패:', e.message));
}

// 설치 프롬프트 처리 (PWA 설치 버튼)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  deferredPrompt = e;
  console.log('[PWA] 설치 준비 완료');
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] 앱이 설치되었습니다');
  deferredPrompt = null;
});
