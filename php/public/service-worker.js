const CACHE_NAME = "teletyptel-webclient-v437";
const BUILD_VERSION = "20261030-ios-google-bridge";
const ASSETS = [
  "chat.html",
  "chat-dialer.css?v=20261027-number-dialer",
  "chat-dialer.js?v=20261027-number-dialer",
  "dev.html",
  "chat-client.css?v=20261030-mobile-signin",
  "chat-xmpp-translation.js?v=20261027-inline-interpreter",
  "chat-translation.js?v=20261027-inline-interpreter",
  "mobile-navigation.js?v=20260929-rtt-first",
  "chat-interpreter.js?v=20261027-inline-interpreter",
  `chat-client.js?v=${BUILD_VERSION}`,
  "native-google.js?v=20261030-ios-google-bridge",
  `vendor/qrcode.js?v=${BUILD_VERSION}`,
  "favicon.ico",
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
  "config/providers/google.json",
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
  if (isPrivateRoute(request)) return fetch(request);
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok && shouldCache(request) && !/no-store|private/i.test(response.headers.get("Cache-Control") || "")) {
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
  if (isPrivateRoute(request)) return false;
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

function isPrivateRoute(request) {
  const pathname = new URL(request.url).pathname;
  return /\/(?:aanmelden|admin|tolk)(?:\/|\.php|$)/i.test(pathname) || /\/api\//i.test(pathname);
}
