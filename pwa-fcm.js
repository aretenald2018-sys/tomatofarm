// ================================================================
// pwa-fcm.js — FCM 푸시 알림 + PWA 설치 배너
// ================================================================

import { CONFIG } from './config.js';
import { refreshNotifCenter } from './render-home.js';

// ── 상태 ──────────────────────────────────────────────────────────
let _deferredInstallPrompt = null;

// ── FCM 초기화 ────────────────────────────────────────────────────
export async function initFCM() {
  try {
    const isNative = window.Capacitor?.getPlatform?.() === 'android' ||
        window.Capacitor?.getPlatform?.() === 'ios';

    if (localStorage.getItem('fcm_permission_granted') === '1') {
      if (isNative) {
        try {
          const { PushNotifications } = await import("@capacitor/push-notifications");
          const check = await PushNotifications.checkPermissions();
          if (check.receive === 'granted') {
            await PushNotifications.register();
          } else {
            localStorage.removeItem('fcm_permission_granted');
          }
        } catch(e) { console.warn('[FCM] re-register failed:', e); }
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        await _registerFCMToken();
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        localStorage.removeItem('fcm_permission_granted');
      }
      return;
    }

    if (isNative) { await _initFCMCapacitor(); return; }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      localStorage.setItem('fcm_permission_granted', '1');
      await _registerFCMToken();
    }
  } catch(e) {
    console.warn('[FCM] 초기화 실패:', e);
  }
}

async function _registerFCMToken() {
  try {
    const { getMessaging, getToken, onMessage } = await import(
      "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js"
    );
    const { saveFcmToken } = await import('./data.js');
    const { initializeApp, getApps } = await import(
      "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js"
    );
    const apps = getApps();
    const app = apps.length ? apps[0] : initializeApp(CONFIG.FIREBASE);
    const messaging = getMessaging(app);

    const VAPID_KEY = 'BJDhMdCeKUGoXlAle3kS1BNQzdK-os-COSLftTtlWa-qilyv8C8Fc-TFQQNwXcIySZmIupicFsuH9cmjLY9gBZc';
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await saveFcmToken(token);
      console.log('[FCM] 토큰 등록 완료');
    }

    onMessage(messaging, (payload) => {
      const body = payload.notification?.body || '새 알림이 도착했어요';
      const toastEl = document.createElement('div');
      toastEl.className = 'tds-toast show';
      toastEl.textContent = body;
      document.body.appendChild(toastEl);
      setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.remove(), 300); }, 3000);
      if (typeof refreshNotifCenter === 'function') refreshNotifCenter();
      // 포그라운드 "수신"은 "사용자가 읽었다"와 다르다. admin 지표 왜곡 방지를 위해 자동 마킹하지 않음.
    });
  } catch(e) {
    console.warn('[FCM] 토큰 등록 실패:', e);
  }
}

async function _initFCMCapacitor() {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { saveFcmToken } = await import('./data.js');

    if (window.Capacitor?.getPlatform?.() === 'android') {
      await PushNotifications.createChannel({
        id: 'tomatofarm_default',
        name: '토마토팜 알림',
        description: '토마토팜 앱 알림',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
      });
    }

    const checkResult = await PushNotifications.checkPermissions();

    if (checkResult.receive !== 'granted') {
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        console.log('[FCM-Cap] 알림 권한 거부됨');
        console.log('[FCM-Cap] 알림 권한 거부 — 팝업 없이 종료');
        return;
      }
    }

    localStorage.setItem('fcm_permission_granted', '1');
    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      await saveFcmToken(token.value);
      console.log('[FCM-Cap] 토큰 등록 완료');
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[FCM-Cap] 등록 실패:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const body = notification.body || '새 알림이 도착했어요';
      const toastEl = document.createElement('div');
      toastEl.className = 'tds-toast show';
      toastEl.textContent = body;
      document.body.appendChild(toastEl);
      setTimeout(() => { toastEl.classList.remove('show'); setTimeout(() => toastEl.remove(), 300); }, 3000);
      if (typeof refreshNotifCenter === 'function') refreshNotifCenter();
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      if (typeof refreshNotifCenter === 'function') refreshNotifCenter();
    });
  } catch(e) {
    console.warn('[FCM-Cap] 초기화 실패:', e);
  }
}

// ── PWA 설치 배너 ────────────────────────────────────────────────
export function showPWAInstallBanner() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) return;
  if (sessionStorage.getItem('pwa_banner_dismissed')) return;

  setTimeout(() => {
    const existing = document.getElementById('pwa-install-banner');
    if (existing) return;

    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:var(--surface,#fff);border-top:1px solid var(--border,#e5e7eb);padding:16px 20px;box-shadow:0 -4px 20px rgba(0,0,0,0.1);animation:slideUp 0.3s ease;';
    banner.innerHTML = `
      <style>@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
      <div style="display:flex;align-items:center;gap:14px;max-width:480px;margin:0 auto;">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--primary,#22c55e);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">🍅</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:700;color:var(--text,#111);">토마토 키우기 앱 설치</div>
          <div style="font-size:12px;color:var(--text-tertiary,#888);margin-top:2px;">${isIOS
            ? '홈 화면에 추가하면 앱처럼 사용할 수 있어요'
            : '설치하면 더 빠르고 편하게 사용할 수 있어요'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          ${isIOS
            ? `<button onclick="_showIOSInstallGuide()" style="padding:8px 16px;border:none;border-radius:999px;background:var(--primary,#22c55e);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">방법 보기</button>`
            : `<button onclick="installPWA();document.getElementById('pwa-install-banner')?.remove()" style="padding:8px 16px;border:none;border-radius:999px;background:var(--primary,#22c55e);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">설치</button>`
          }
          <button onclick="sessionStorage.setItem('pwa_banner_dismissed','1');document.getElementById('pwa-install-banner')?.remove()" style="padding:8px 10px;border:none;background:none;color:var(--text-tertiary,#888);font-size:16px;cursor:pointer;">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
  }, 1500);
}

export function updateInstallBtn() {
  const btn = document.getElementById('pwa-install-btn');
  if (!btn) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  btn.style.display = isStandalone ? 'none' : '';
}

export function installPWA() {
  if (_deferredInstallPrompt) {
    _deferredInstallPrompt.prompt();
    _deferredInstallPrompt.userChoice.then((result) => {
      if (result.outcome === 'accepted') {
        const section = document.getElementById('pwa-install-section');
        if (section) section.style.display = 'none';
      }
      _deferredInstallPrompt = null;
    });
  } else {
    alert('이미 설치되었거나, 브라우저가 설치를 지원하지 않습니다.\n\n수동 설치: 브라우저 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"를 선택하세요.');
  }
}

export function getDeferredInstallPrompt() {
  return _deferredInstallPrompt;
}

// ── 이벤트 리스너 + window 등록 ──────────────────────────────────
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  const section = document.getElementById('pwa-install-section');
  if (section) section.style.display = 'block';
  updateInstallBtn();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  const section = document.getElementById('pwa-install-section');
  if (section) section.style.display = 'none';
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'none';
});

window._showIOSInstallGuide = function() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.remove();
  sessionStorage.setItem('pwa_banner_dismissed', '1');

  const modal = document.createElement('div');
  modal.id = 'ios-install-guide';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  modal.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center;" onclick="event.stopPropagation()">
      <div style="font-size:40px;margin-bottom:12px;">🍅</div>
      <div style="font-size:16px;font-weight:700;color:var(--text,#111);margin-bottom:16px;">홈 화면에 추가하기</div>
      <div style="text-align:left;font-size:13px;color:var(--text-secondary,#555);line-height:1.8;">
        <div style="padding:8px 0;border-bottom:1px solid var(--border,#e5e7eb);"><b>1.</b> 하단 Safari 메뉴에서 <span style="font-size:16px;vertical-align:middle;">⎋</span> <b>공유</b> 버튼 탭</div>
        <div style="padding:8px 0;border-bottom:1px solid var(--border,#e5e7eb);"><b>2.</b> <b>"홈 화면에 추가"</b> 선택</div>
        <div style="padding:8px 0;"><b>3.</b> 오른쪽 상단 <b>"추가"</b> 탭</div>
      </div>
      <button onclick="document.getElementById('ios-install-guide')?.remove()" style="margin-top:16px;width:100%;padding:12px;border:none;border-radius:999px;background:var(--primary,#22c55e);color:#fff;font-size:14px;font-weight:600;cursor:pointer;">확인</button>
    </div>
  `;
  document.body.appendChild(modal);
};

Object.assign(window, {
  installPWA,
});

// Service Worker → 클라이언트 메시지 수신
// firebase-messaging-sw.js의 notificationclick 핸들러에서 postMessage({ type:'notif_clicked', notifId })
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event?.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type !== 'notif_clicked') return;
    const id = msg.notifId;
    // 실제 notification id만 허용. fallback tag 등은 차단.
    if (typeof id !== 'string' || !id || id === 'tomatofarm-notif') return;
    // 형식 검증: sendNotification은 `${toUserId}_${Date.now()}` 형태로 id를 만든다
    if (!/^[^\s]+_\d{10,}$/.test(id)) return;
    import('./data.js').then(({ markNotificationRead }) => {
      try { markNotificationRead(id); } catch (_) { /* ignore */ }
    }).catch(() => {});
    if (typeof refreshNotifCenter === 'function') {
      try { refreshNotifCenter(); } catch (_) { /* ignore */ }
    }
  });
}
