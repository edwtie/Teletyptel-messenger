const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "scripts/ios-testflight/www/native-server.js"), "utf8");
const client = fs.readFileSync(path.join(root, "php/public/chat-client.js"), "utf8");
const reply = (value = { ok: true }, status = 200) => ({ status, headers: { "content-type": "application/json" },
  body: Buffer.from(JSON.stringify(value)).toString("base64") });

function fixture(handler = async () => reply()) {
  const nativeCalls = [], browserCalls = [], cancellations = [], shares = [];
  const context = { URL, Request, Response, Headers, DOMException, Uint8Array, btoa, atob, crypto: webcrypto,
    location: new URL("capacitor://localhost/chat.html"), teletyptelServer: "https://server.test:8443/chat.html",
    fetch: async (...args) => { browserCalls.push(args); return new Response("local fixture"); },
    Capacitor: { Plugins: { TeleTypTelServer: {
      request: options => { nativeCalls.push(options); return handler(options); },
      cancel: async options => { cancellations.push(options); },
      shareFile: async options => { shares.push(options); return { shared: true }; }
    } } }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, nativeCalls, browserCalls, cancellations, shares };
}

test("Bundled assets stay local; only configured server API/config requests use the native session", async () => {
  const { context, nativeCalls, browserCalls } = fixture();
  await context.fetch("lang/ned.lng");
  await context.fetch("assets/brand/teletyptel-icon-192.png");
  assert.equal(browserCalls.length, 2);
  const response = await context.fetch("api/account.php?action=session");
  assert.equal(response.url, "https://server.test:8443/api/account.php?action=session");
  assert.equal((await response.json()).ok, true);
  await context.fetch("config/providers/default.json");
  assert.equal(nativeCalls.length, 2);
  assert.equal(nativeCalls[0].path, "/api/account.php?action=session");
  assert.equal(nativeCalls[0].omitCookies, false);
  for (const url of ["https://other.test/api/account.php", "http://server.test:8443/api/account.php",
    "https://user:secret@server.test:8443/api/account.php", "capacitor://other/api/account.php",
    "api/../admin/", "config/secret.json", "https://server.test:8443/admin/"]) await context.fetch(url);
  assert.equal(nativeCalls.length, 2, "foreign hosts, credentials and unlisted paths never enter the native bridge");
});

test("JSON, Request objects, multipart binary uploads and HTTP errors retain fetch semantics", async () => {
  const { context, nativeCalls } = fixture(async () => reply({ ok: false }, 403));
  const request = new Request("https://server.test:8443/api/account.php", {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": "fixture" },
    body: JSON.stringify({ name: "Test ë 👋" }), credentials: "omit"
  });
  const response = await context.fetch(request);
  assert.equal(response.ok, false);
  assert.equal(response.status, 403);
  assert.equal(nativeCalls[0].omitCookies, true);
  assert.equal(nativeCalls[0].headers["x-csrf-token"], "fixture");
  assert.equal(JSON.parse(Buffer.from(nativeCalls[0].body, "base64")).name, "Test ë 👋");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([0, 1, 128, 255])], { type: "application/pdf" }), "fixture.pdf");
  form.append("chunkIndex", "0");
  await context.fetch("api/upload.php", { method: "POST", body: form });
  const upload = nativeCalls[1];
  assert.match(upload.headers["content-type"], /^multipart\/form-data; boundary=/);
  const parsed = await new Response(Buffer.from(upload.body, "base64"), { headers: upload.headers }).formData();
  assert.equal(parsed.get("chunkIndex"), "0");
  assert.deepEqual(new Uint8Array(await parsed.get("file").arrayBuffer()), new Uint8Array([0, 1, 128, 255]));
});

test("Aborting live translation cancels the native request and ignores a late result", async () => {
  let complete;
  const { context, nativeCalls, cancellations } = fixture(() => new Promise(resolve => { complete = resolve; }));
  const controller = new AbortController();
  const pending = context.fetch("api/translation.php", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === "AbortError");
  assert.equal(cancellations[0].id, nativeCalls[0].id);
  complete(reply());
  await assert.rejects(context.fetch("api/translation.php", { signal: controller.signal }), error => error.name === "AbortError");
  assert.equal(nativeCalls.length, 1);
});

test("Native request IDs also work in WebViews without crypto.randomUUID", async () => {
  const { context, nativeCalls } = fixture();
  context.crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  await context.fetch("api/account.php");
  assert.match(nativeCalls[0].id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

test("Media uses the scoped native session; shared links and XMPP never contain capacitor URLs", async () => {
  const { context, shares } = fixture();
  const app = context.TeleTypTelApp;
  assert.equal(app.publicUrl("api/file.php?id=fixture"), "https://server.test:8443/api/file.php?id=fixture");
  assert.equal(app.mediaUrl("api/file.php?id=fixture"), "teletyptel-media://localhost/api/file.php?id=fixture");
  assert.equal(app.mediaUrl("https://other.test/photo.png"), "https://other.test/photo.png");
  assert.equal(app.mediaUrl("blob:fixture"), "blob:fixture");
  assert.equal(app.download("https://other.test/api/file.php?id=fixture"), null);
  await app.download("api/file.php?id=fixture&download=1", "fixture.pdf");
  assert.equal(shares[0].path, "/api/file.php?id=fixture&download=1");
  vm.runInNewContext(client.slice(client.indexOf("  function networkPageUrl()"), client.indexOf("  function normalizeXmppPort(")), context);
  assert.equal(context.defaultXmppWebSocketUrlForCurrentHost(), "wss://server.test:8443/xmpp-websocket");
  assert.equal(context.normalizeLocalXmppWebSocketUrlForCurrentHost("wss://localhost:5443/websocket/"), "wss://server.test:8443/xmpp-websocket");
  assert.equal(context.normalizeLocalXmppWebSocketUrlForCurrentHost("ws://other.test/"), "wss://server.test:8443/xmpp-websocket");
  assert.equal(context.normalizeLocalXmppWebSocketUrlForCurrentHost("wss://other.test/websocket"), "wss://other.test/websocket");
  assert.equal(context.normalizeLocalWebSocketUrlForCurrentHost("ws://localhost:8787"), "wss://server.test:8443/rtt-relay");
});

test("Bundled Google exchange keeps the challenge and code on the native server transport", async () => {
  let count = 0;
  const { context, nativeCalls } = fixture(async () => reply(++count === 1
    ? { ok: true, challenge: "challenge", serverClientId: "public-client" }
    : { ok: true, accountId: "fixture", twoFactorRequired: true }));
  context.Capacitor.getPlatform = () => "ios";
  context.Capacitor.isPluginAvailable = () => true;
  context.Capacitor.Plugins.TeleTypTelGoogle = { signIn: async () => ({ serverAuthCode: "fixture-code" }) };
  vm.runInNewContext(fs.readFileSync(path.join(root, "php/public/native-google.js"), "utf8"), context);
  const result = await context.TeleTypTelNativeGoogle.signIn("/api/auth/google/native.php");
  assert.equal(result.twoFactorRequired, true);
  assert.equal(nativeCalls[1].headers["x-teletyptel-native"], "google");
  assert.equal(JSON.parse(Buffer.from(nativeCalls[1].body, "base64")).code, "fixture-code");
  for (const endpoint of ["capacitor://other/api/auth/google/native.php", "/api/account.php",
    "https://other.test/api/auth/google/native.php", "capacitor://user@localhost/api/auth/google/native.php"]) {
    await assert.rejects(context.TeleTypTelNativeGoogle.signIn(endpoint), /same-origin/);
  }
  assert.equal(nativeCalls.length, 2);
});

test("Logout reaches the native authenticated transport instead of a WebView beacon", async () => {
  const { context, nativeCalls, browserCalls } = fixture();
  context.accountApiPath = "api/account.php";
  context.navigator = { sendBeacon() { throw new Error("Wrong session transport"); } };
  vm.runInNewContext(client.slice(client.indexOf("  async function sendLogoutAccountSession()"),
    client.indexOf("  function handleAccountIdentityChanged()")), context);
  await context.sendLogoutAccountSession();
  assert.equal(nativeCalls.length, 1);
  assert.equal(browserCalls.length, 0);
  assert.equal(nativeCalls[0].path, "/api/account.php");
  assert.equal(JSON.parse(Buffer.from(nativeCalls[0].body, "base64")).action, "logout");
  assert.equal(nativeCalls[0].omitCookies, false);
});

test("Native bridge constrains trust, credentials, redirects, cancellation and temporary shares", () => {
  const native = fs.readFileSync(path.join(root, "scripts/ios-testflight/ServerBridge.swift"), "utf8");
  assert.match(native, /url\.scheme == origin\.scheme, url\.host == origin\.host, url\.port == origin\.port/);
  assert.match(native, /url\.path == "\/chat.html"/);
  assert.match(native, /completionHandler\(nil\)/);
  assert.match(native, /request\.setValue\(address, forHTTPHeaderField: "Origin"\)/);
  assert.match(native, /httpCookieStorage = HTTPCookieStorage.shared/);
  assert.match(native, /removeValue\(forKey: identifier\)\?\.cancel\(\)/);
  assert.match(native, /completeFileProtection/);
  assert.match(native, /message.frameInfo.isMainFrame, isBundledMessenger\(message.frameInfo.request.url\)/);
  assert.doesNotMatch(native, /useCredential|URLCredential\(trust|SecTrustSetAnchor|"set-cookie"|"authorization"|"cookie"/i);
});
