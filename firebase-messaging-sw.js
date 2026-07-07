/* FCM 背景收訊用的 Service Worker（跟 sw.js 並存，各司其職） */
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBmXtR9yJVrCT2eMZGh7Rv7OwO4R0V5lDk",
  authDomain: "familie-reise.firebaseapp.com",
  projectId: "familie-reise",
  storageBucket: "familie-reise.firebasestorage.app",
  messagingSenderId: "375890500526",
  appId: "1:375890500526:web:2a96f5e85cb813021c063f"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload){
  const n = payload.notification || {};
  self.registration.showNotification(n.title || '提醒', {
    body: n.body || '',
    icon: 'icon-192.png',
    badge: 'favicon-32.png'
  });
});
