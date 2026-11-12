// FilRadio service worker: makes the app installable and loads the shell offline.
// Audio streams, map tiles and the station API are never cached here.
const VERSION = "filradio-v30";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=30",
  "./js/app.js?v=30",
  "./js/places.js?v=30",
  "./js/install-guide.js?v=30",
  "./js/traffic.js?v=30",
  "./js/gtm.js?v=30",
  "./data/stations.json",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/radio-128.webp",
  "./icons/radio-512.webp",
];
// Third-party libraries/fonts that are safe to cache (versioned URLs).
const CDN = /^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App shell: network first so updates show up, cache as offline fallback.
  if (url.origin === self.location.origin) {
    if (req.headers.get("range")) return;
    e.respondWith(
      // no-cache: always revalidate with the server so FTP uploads show up immediately.
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Versioned CDN assets: cache first.
  if (CDN.test(req.url)) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") caches.open(VERSION).then((c) => c.put(req, res.clone()));
          return res;
        })
      )
    );
  }
  // Everything else (streams, tiles, API) goes straight to the network.
});
