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

// 알림 클릭 시 앱 열기
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // 이미 열려있는 창이 있으면 포커스
      for (const client of windowClients) {
        if (client.url.includes("/tomatofarm/") && "focus" in client) {
          return client.focus();
        }
      }
      // 없으면 새 창 열기
      if (clients.openWindow) {
        return clients.openWindow("/tomatofarm/");
      }
    })
  );
});
