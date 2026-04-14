// Firebase Cloud Messaging 백그라운드 메시지 핸들러
// 앱이 포그라운드가 아닐 때 푸시 알림을 표시

importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
  authDomain: "exercise-management.firebaseapp.com",
  projectId: "exercise-management",
  storageBucket: "exercise-management.firebasestorage.app",
  messagingSenderId: "867781711662",
  appId: "1:867781711662:web:8fe1e9904c94d021f2ccbf",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const notifData = payload.data || {};

  self.registration.showNotification(title || "🍅 토마토팜 알림", {
    body: body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: notifData,
    tag: notifData.notifId || "tomatofarm-notif",
  });
});

// 알림 클릭 시 앱 열기 + 클라이언트에 읽음 처리 요청 전달
// 주의: event.notification.tag는 기본값("tomatofarm-notif")일 수 있으므로
// 읽음 id로 사용하지 않는다. 오직 data.notifId만 신뢰한다.
self.addEventListener("notificationclick", (event) => {
  const rawNotifId = event.notification?.data?.notifId;
  const notifId = (typeof rawNotifId === 'string' && rawNotifId && rawNotifId !== 'tomatofarm-notif')
    ? rawNotifId : null;
  event.notification.close();
  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    let focused = null;
    for (const client of windowClients) {
      if (client.url.includes("/tomatofarm/") && "focus" in client) {
        focused = await client.focus();
        break;
      }
    }
    if (!focused && clients.openWindow) {
      focused = await clients.openWindow("/tomatofarm/");
    }
    if (focused && notifId) {
      try {
        focused.postMessage({ type: "notif_clicked", notifId });
      } catch (_) { /* ignore */ }
    }
  })());
});
