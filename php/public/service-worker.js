const CACHE_NAME = "teletyptel-webclient-v118";
const BUILD_VERSION = "20260608-tc-text-without-video";
const ASSETS = [
  "chat.html",
  "dev.html",
  `chat-client.css?v=${BUILD_VERSION}`,
  `chat-client.js?v=${BUILD_VERSION}`,
  `vendor/qrcode.js?v=${BUILD_VERSION}`,
  "manifest.webmanifest",
  "assets/brand/teletyptel-logo-header.png",
  "assets/brand/teletyptel-logo-header@2x.png",
  "assets/brand/teletyptel-logo-clean.png",
  "assets/brand/teletyptel-icon-192.png",
  "assets/brand/teletyptel-icon-512.png",
  "assets/backgrounds/teletyptel-bg-mobile.png",
  "assets/backgrounds/teletyptel-bg-wide-1.png",
  "assets/backgrounds/teletyptel-bg-wide-2.png",
  "assets/backgrounds/teletyptel-bg-wide-3.png",
  "config/account-profile.json",
  "config/providers/example-provider.json",
  "lang/eng.lng",
  "lang/ned.lng"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && shouldCache(request)) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) {
      return cached;
    }

    if (request.mode === "navigate") {
      const shell = await cache.match("chat.html");
      if (shell) {
        return shell;
      }
    }

    throw new Error("Offline and no cached response available.");
  }
}

function shouldCache(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return false;
  }

  return request.mode === "navigate"
    || ["style", "script", "manifest"].includes(request.destination)
    || (request.destination === "image" && (url.pathname.includes("/smileys/") || url.pathname.includes("/assets/")))
    || url.pathname.includes("/lang/")
    || url.pathname.includes("/config/");
}
