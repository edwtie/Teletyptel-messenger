const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit } = require("playwright");
const { bundleFrontend } = require("../scripts/ios-testflight/bundle-frontend");

test("Startup logo fits small, portrait and landscape screens and hides after boot", { timeout: 45000 }, async () => {
  const files = new Map();
  bundleFrontend((name, data) => files.set(name, Buffer.from(data)), "https://server.test/chat.html");
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ isMobile: true, hasTouch: true });
    await page.route("https://startup.test/**", route => {
      const name = "www" + new URL(route.request().url()).pathname;
      if (!files.has(name)) return route.abort();
      const contentType = name.endsWith(".css") ? "text/css" : "image/png";
      return route.fulfill({ contentType, body: files.get(name) });
    });
    const startup = files.get("www/chat.html").toString().match(/<section class="native-startup"[\s\S]*?<\/section>/)[0];
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><base href="https://startup.test/"><link rel="stylesheet" href="chat-client.css"><link rel="stylesheet" href="native-startup.css"><body class="account-booting">' + startup + '</body>');
      await page.locator(".native-startup img").evaluate(image => image.decode());
      const logo = await page.locator(".native-startup img").boundingBox();
      assert.ok(logo.width > 200 && logo.width <= 280);
      assert.ok(logo.x >= 24 && logo.x + logo.width <= viewport.width - 24);
      assert.ok(logo.y >= 0 && logo.y + logo.height < viewport.height);
      assert.ok(Math.abs(logo.width / logo.height - 599 / 128) < 0.01);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (viewport.width === 390) {
        const screenshot = path.resolve(__dirname, "../artifacts/mobile-chat/ios-startup-logo.png");
        fs.mkdirSync(path.dirname(screenshot), { recursive: true });
        await page.screenshot({ path: screenshot });
      }
      await page.evaluate(() => document.body.classList.remove("account-booting"));
      assert.equal(await page.locator(".native-startup").isVisible(), false);
    }
  } finally { await browser.close(); }
});

test("Bundled Messenger opens its real mobile sign-in UI without a reachable server", { timeout: 45000 }, async () => {
  const files = new Map();
  bundleFrontend((name, data) => files.set("/" + name.replace(/^www\//, ""), Buffer.from(data)), "https://server.test/chat.html");
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [], missing = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixtureNativeRequests = [];
      window.fixtureNativeCalls = [];
      window.fixtureNativeOffline = true;
      window.Capacitor = { getPlatform: () => "ios", isPluginAvailable: () => true, Plugins: {
        TeleTypTelGoogle: { signIn: async () => ({ serverAuthCode: "unused-fixture" }) },
        TeleTypTelServer: { request: async options => {
          window.fixtureNativeRequests.push(options.path);
          window.fixtureNativeCalls.push(options);
          if (window.fixtureNativeOffline) throw Object.assign(new Error("Offline fixture"), { code: "SERVER_UNAVAILABLE" });
          return { status: 200, headers: { "content-type": "application/json" }, body: btoa('{"ok":true}') };
        }, cancel: async () => {} }
      } };
      window.nativeFixtureRoot = { location: new URL("capacitor://localhost/chat.html"),
        teletyptelServer: "https://server.test/chat.html", Capacitor: window.Capacitor, crypto: window.crypto,
        fetch: window.fetch.bind(window), btoa: window.btoa.bind(window), atob: window.atob.bind(window) };
    });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (["blob:", "data:"].includes(url.protocol)) return route.continue();
      if (url.origin === "https://bundled.teletyptel.test" && url.pathname.startsWith("/smileys/")
          && url.pathname.endsWith(".gif") && !files.has(url.pathname) && files.has(url.pathname.replace(/\.gif$/, ".svg"))) {
        return route.fulfill({ status: 404, body: "Use the bundled SVG fallback" });
      }
      if (url.origin !== "https://bundled.teletyptel.test" || !files.has(url.pathname)) {
        missing.push(url.href);
        return route.abort();
      }
      let content = files.get(url.pathname);
      if (url.pathname === "/native-server.js") {
        content = Buffer.from(content.toString().replace("})(window);", "})(window.nativeFixtureRoot);")
          + "\nwindow.fetch = window.nativeFixtureRoot.fetch; window.TeleTypTelApp = window.nativeFixtureRoot.TeleTypTelApp;");
      }
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
        ".png": "image/png", ".gif": "image/gif", ".ico": "image/x-icon", ".lng": "text/plain" };
      return route.fulfill({ contentType: types[path.extname(url.pathname)] || "application/octet-stream", body: content });
    });
    await page.goto("https://bundled.teletyptel.test/chat.html");
    await page.waitForFunction(() => !document.body.classList.contains("account-booting"));
    await page.locator("#accountDialogTitle").waitFor({ state: "visible" });
    assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isVisible(), true);
    assert.equal(await page.locator("#dialogJidInput").isVisible(), true);
    assert.match(await page.locator("#dialogAccountStatus").innerText(), /server.*unavailable|server.*bereikbaar/i);
    assert.equal(await page.evaluate(() => document.activeElement.matches("input,textarea")), false);
    await page.locator("#accountDialogTitle").focus();
    assert.deepEqual(await page.locator("#accountDialogTitle").evaluate(element => ({
      focused: document.activeElement === element,
      outline: getComputedStyle(element).outlineStyle,
      shadow: getComputedStyle(element).boxShadow
    })), { focused: true, outline: "none", shadow: "none" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator("#dialogJidInput").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "dialogJidInput");
    assert.equal(await page.locator("#dialogJidInput").evaluate(element => getComputedStyle(element).outlineStyle), "solid");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "solid");
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    const requests = await page.evaluate(() => fixtureNativeRequests);
    assert.ok(requests.includes("/config/account-profile.json"));
    assert.ok(!requests.includes("/api/rtc-config.php"), "offline startup must not wait for another server timeout");
    const upload = await page.evaluate(async () => {
      window.fixtureNativeOffline = false;
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array([0, 1, 128, 255])]), "fixture.bin");
      const response = await fetch("api/upload.php", { method: "POST", body: form });
      const call = window.fixtureNativeCalls.at(-1);
      const binary = Uint8Array.from(atob(call.body), character => character.charCodeAt(0));
      const decoded = await new Response(binary, { headers: call.headers }).formData();
      return { ok: (await response.json()).ok, bytes: Array.from(new Uint8Array(await decoded.get("file").arrayBuffer())) };
    });
    assert.equal(upload.ok, true);
    assert.deepEqual(upload.bytes, [0, 1, 128, 255]);
    const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
    const logoutSource = client.slice(client.indexOf("  async function sendLogoutAccountSession()"),
      client.indexOf("  function handleAccountIdentityChanged()"));
    const logout = await page.evaluate(async source => {
      const performLogout = new Function(source + '\nconst accountApiPath = "api/account.php"; return sendLogoutAccountSession;')();
      navigator.sendBeacon = () => { throw new Error("WebView logout beacon must not be used"); };
      await performLogout();
      const call = window.fixtureNativeCalls.at(-1);
      return { path: call.path, body: JSON.parse(atob(call.body)), omitCookies: call.omitCookies };
    }, logoutSource);
    assert.equal(logout.path, "/api/account.php");
    assert.equal(logout.body.action, "logout");
    assert.equal(logout.omitCookies, false);
    const screenshot = path.resolve(__dirname, "../artifacts/mobile-chat/ios-bundled-offline.png");
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
  } finally { await browser.close(); }
});
