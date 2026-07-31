/* Our Journey Service Worker
 * 適用於 GitHub Pages 子目錄、PWA 離線快取與系統通知。
 */

"use strict";

const VERSION = "journey-sw-v2-20260731";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SCOPE_URL = new URL("./", self.location.href);
const APP_ROOT = SCOPE_URL.pathname;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon-32.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

async function precacheAssets() {
  const cache = await caches.open(STATIC_CACHE);

  await Promise.all(
    PRECACHE_URLS.map(async (relativeUrl) => {
      try {
        const absoluteUrl = new URL(relativeUrl, SCOPE_URL).href;
        const response = await fetch(absoluteUrl, { cache: "reload" });

        if (response.ok) {
          await cache.put(absoluteUrl, response);
        }
      } catch (error) {
        console.warn("[SW] 預快取失敗：", relativeUrl, error);
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheAssets();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("journey-sw-") &&
              name !== STATIC_CACHE &&
              name !== RUNTIME_CACHE
          )
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached =
      (await cache.match(request)) ||
      (await caches.match(new URL("./index.html", SCOPE_URL).href)) ||
      (await caches.match(new URL("./", SCOPE_URL).href));

    if (cached) {
      return cached;
    }

    return new Response(
      `<!doctype html>
      <html lang="zh-Hant">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>目前無法連線</title>
        <body style="font-family:system-ui;padding:32px;line-height:1.7">
          <h1>目前無法連線</h1>
          <p>請確認網路後重新整理頁面。</p>
        </body>
      </html>`,
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  const isStaticAsset =
    ["style", "script", "image", "font", "manifest"].includes(
      request.destination
    ) ||
    /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest)$/i.test(
      url.pathname
    );

  if (isStaticAsset) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name))))
    );
    return;
  }

  if (data.type === "SHOW_NOTIFICATION") {
    const payload = data.payload || {};
    const title =
      typeof payload.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : "Our Journey";

    const targetUrl = new URL(payload.url || "./", SCOPE_URL).href;

    event.waitUntil(
      self.registration.showNotification(title, {
        body:
          typeof payload.body === "string"
            ? payload.body
            : "你有一個行程提醒",
        icon: new URL("./icon-192.png", SCOPE_URL).href,
        badge: new URL("./favicon-32.png", SCOPE_URL).href,
        tag:
          typeof payload.tag === "string"
            ? payload.tag
            : `journey-${Date.now()}`,
        renotify: Boolean(payload.renotify),
        requireInteraction: Boolean(payload.requireInteraction),
        timestamp:
          Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
        data: {
          url: targetUrl,
          reminderId: payload.reminderId || null
        }
      })
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      body: event.data ? event.data.text() : "你有一個新的行程提醒"
    };
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Our Journey";

  const targetUrl = new URL(
    payload.url || payload.data?.url || "./",
    SCOPE_URL
  ).href;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || payload.notification?.body || "你有一個新的行程提醒",
      icon: new URL(
        payload.icon || payload.notification?.icon || "./icon-192.png",
        SCOPE_URL
      ).href,
      badge: new URL("./favicon-32.png", SCOPE_URL).href,
      tag: payload.tag || `journey-push-${Date.now()}`,
      data: {
        url: targetUrl,
        reminderId: payload.reminderId || payload.data?.reminderId || null
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    SCOPE_URL
  ).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of clientList) {
        const clientUrl = new URL(client.url);

        if (
          clientUrl.origin === self.location.origin &&
          clientUrl.pathname.startsWith(APP_ROOT)
        ) {
          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener("notificationclose", () => {});
