/* Our Journey — 輕量 Service Worker
   目標：讓網站可以「加到主畫面」安裝成 App，同時盡量拿最新資料。
   策略：網路優先(network-first)，網路失敗才用快取的殼；
   完全不快取 Firebase / Google Maps 的請求，避免看到舊資料。 */
const CACHE = "our-journey-v1";
const SHELL = ["./index.html", "./manifest.webmanifest", "./icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  // 這些一律走網路，不進快取
  if (
    e.request.method !== "GET" ||
    url.includes("firebase") ||
    url.includes("firestore") ||
    url.includes("googleapis") ||
    url.includes("gstatic") ||
    url.includes("maps.googleapis")
  ) {
    return; // 交給瀏覽器預設處理
  }
  // 其餘：網路優先，失敗回退快取
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
