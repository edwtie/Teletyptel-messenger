"use strict";
window.iosSmokeErrors = [];
window.addEventListener("error", (event) => { if (event.message) window.iosSmokeErrors.push(event.message); });
window.addEventListener("unhandledrejection", (event) => window.iosSmokeErrors.push(String(event.reason)));
const simulatorProfile = { accountId: "ios-simulator-fixture", jid: "sam@example.test", displayName: "Sam (simulatortest)",
  providerId: "fixture", preferredLanguage: "ned", peer: "noor@example.test", liveRttEnabled: true,
  xmppWebSocket: "wss://xmpp.example.test/websocket", xmppDomain: "example.test" };
localStorage.clear();
sessionStorage.clear();
localStorage.setItem("teletyptel.theme", "light");
sessionStorage.setItem("teletyptel.serverAccountSession", JSON.stringify(simulatorProfile));
window.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  let body = {}, status = 200;
  if (Object.hasOwn(window.iosFixtureLanguages, url.pathname)) return new Response(window.iosFixtureLanguages[url.pathname]);
  if (url.pathname === "/config/account-profile.json") body = simulatorProfile;
  else if (url.pathname === "/config/google-maps.json") body = {};
  else if (url.pathname === "/api/account.php") body = { ok: true, account: null };
  else if (url.pathname === "/api/history.php") body = { ok: true, messages: [], calls: [] };
  else if (url.pathname === "/api/group-metadata.php") body = { ok: true, groups: [] };
  else if (url.pathname === "/api/rtc-config.php") body = { iceServers: [] };
  else { status = 403; body = { ok: false, error: "simulator_network_disabled" }; }
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
};
window.WebSocket = class extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 3;
  constructor() { super(); }
  send() { throw new Error("Simulator has no external WebSocket connection"); }
  close() {}
};
window.XMLHttpRequest = class { open() { throw new Error("Simulator XHR disabled"); } };
try { Object.defineProperty(navigator, "sendBeacon", { value: () => false }); } catch {}
try {
  Object.defineProperty(navigator, "serviceWorker", { value: Object.assign(new EventTarget(), {
    controller: null,
    getRegistrations: async () => [],
    register: async () => ({ waiting: null, active: null, addEventListener() {}, update: async () => {} })
  }) });
} catch {}
document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href]");
  if (link && !link.getAttribute("href").startsWith("#")) event.preventDefault();
}, true);
