const CACHE_NAME = "tiedragon-xmpp-webclient-v2";
const ASSETS = [
  "chat.html",
  "chat-client.css",
  "chat-client.js",
  "manifest.webmanifest",
  "config/account-profile.json",
  "config/providers/example-provider.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
