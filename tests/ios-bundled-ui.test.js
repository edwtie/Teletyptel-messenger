const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, chromium } = require("playwright");
const { bundleFrontend } = require("../scripts/ios-testflight/bundle-frontend");

test("Startup logo stays consistent during server checking on phone and tablet", { timeout: 45000 }, async () => {
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
    const startup = files.get("www/chat.html").toString().match(/<dialog class="native-startup[\s\S]*?<\/dialog>/)[0];
    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
      { width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
      await page.setViewportSize(viewport);
      await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><base href="https://startup.test/"><link rel="stylesheet" href="chat-client.css"><link rel="stylesheet" href="native-startup.css"><link rel="stylesheet" href="xmpp-availability.css"><body class="account-booting">' + startup + '</body>');
      await page.locator(".native-startup img").evaluate(image => image.decode());
      const logo = await page.locator(".native-startup img").boundingBox();
      assert.ok(logo.width > 200 && logo.width <= 280);
      assert.ok(logo.x >= 24 && logo.x + logo.width <= viewport.width - 24);
      assert.ok(logo.y >= 0 && logo.y + logo.height < viewport.height);
      assert.ok(Math.abs(logo.width / logo.height - 599 / 128) < 0.01);
      assert.ok(Math.abs(logo.y + logo.height / 2 - viewport.height / 2) < 2,
        "Web startup must match the native launch screen's centered logo");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (viewport.width === 390) {
        const screenshot = path.resolve(__dirname, "../artifacts/mobile-chat/ios-startup-logo.png");
        fs.mkdirSync(path.dirname(screenshot), { recursive: true });
        await page.screenshot({ path: screenshot });
      }
      await page.addScriptTag({ content: files.get("www/xmpp-availability.js").toString() });
      await page.evaluate(() => {
        window.initialStartup = document.querySelector(".native-startup");
        window.initialStatus = window.initialStartup.querySelector('[role="status"]');
        window.initialLogo = window.initialStartup.querySelector("img");
        window.Capacitor = { getPlatform: () => "ios" };
        window.brandingGate = TeleTypTelXmppAvailability.create();
        window.brandingGate.connecting();
      });
      const gateLogo = page.locator(".xmpp-availability__brand");
      await gateLogo.evaluate(image => image.decode());
      assert.equal(await gateLogo.getAttribute("src"), await page.locator(".native-startup img").getAttribute("src"));
      assert.equal(await gateLogo.getAttribute("alt"), "TeleTypTel");
      const gateBounds = await gateLogo.boundingBox();
      for (const key of ["x", "y", "width", "height"]) {
        assert.ok(Math.abs(gateBounds[key] - logo[key]) < 2, `Logo ${key} must not jump during server checking`);
      }
      for (const colorScheme of ["light", "dark"]) {
        await page.emulateMedia({ colorScheme });
        assert.equal(await page.locator(".xmpp-availability").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
      }
      if (viewport.width === 390 || viewport.width === 834) {
        await page.screenshot({ path: path.resolve(__dirname, `../artifacts/mobile-chat/ios-checking-logo-${viewport.width}.png`) });
      }
      for (const reason of ["offline", "certificate"]) {
        await page.evaluate(reason => {
          window.brandingGate.unavailable(() => window.brandingGate.connecting(), reason);
          document.body.classList.remove("account-booting");
        }, reason);
        assert.equal(await page.locator(".xmpp-availability").count(), 1);
        assert.equal(await page.locator(".native-startup").isVisible(), true);
        assert.equal(await page.evaluate(() => document.querySelector(".xmpp-availability") === window.initialStartup
          && document.querySelector('.xmpp-availability [role="status"]') === window.initialStatus
          && document.querySelector(".xmpp-availability img") === window.initialLogo), true,
        "checking, offline and certificate failures reuse the original screen, logo and status");
        assert.equal(await page.locator(".xmpp-availability").evaluate(element => element.matches(":modal")), true);
        const errorLogo = await gateLogo.boundingBox();
        assert.ok(Math.abs(errorLogo.y - logo.y) < 2, "Status and error text must not move the startup logo");
        assert.match(await page.locator('.xmpp-availability [role="status"]').textContent(),
          reason === "certificate" ? /Certificaatfout/ : /niet online/);
        if (viewport.width === 390 || viewport.width === 834) {
          await page.screenshot({ path: path.resolve(__dirname, `../artifacts/mobile-chat/ios-startup-${reason}-${viewport.width}.png`) });
        }
        await page.locator(".xmpp-availability button").click();
        assert.equal(await page.locator(".xmpp-availability").getAttribute("data-phase"), "connecting");
        assert.equal(await page.locator(".xmpp-availability button").isVisible(), false);
        assert.equal(await page.locator(".xmpp-availability").count(), 1);
      }
      await page.evaluate(() => window.brandingGate.hide());
      await page.evaluate(() => document.body.classList.remove("account-booting"));
      assert.equal(await page.locator(".native-startup").isVisible(), false);
    }
  } finally { await browser.close(); }
});

for (const scenario of [
  { name: "iphone", engine: webkit, viewport: { width: 390, height: 844 }, touch: true },
  { name: "ipad", engine: webkit, viewport: { width: 834, height: 1194 }, touch: true },
  { name: "desktop", engine: chromium, viewport: { width: 1100, height: 760 }, touch: false }
]) {
test(`Bundled Messenger retries into sign-in and stays stable after login (${scenario.name})`, { timeout: 45000 }, async () => {
  const files = new Map();
  bundleFrontend((name, data) => files.set("/" + name.replace(/^www\//, ""), Buffer.from(data)), "https://server.test/chat.html");
  const browser = await scenario.engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: scenario.viewport, isMobile: scenario.touch, hasTouch: scenario.touch });
    const errors = [], missing = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixtureNativeRequests = [];
      window.fixtureNativeCalls = [];
      window.fixtureFrames = [];
      window.fixtureNativeOffline = true;
      class FixtureSocket extends EventTarget {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        constructor() {
          super();
          this.protocol = "xmpp";
          this.readyState = 0;
          setTimeout(() => {
            this.readyState = 1;
            this.dispatchEvent(new Event("open"));
          }, 10);
        }
        send(data) {
          window.fixtureFrames.push(data);
          const reply = data => setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data })), 10);
          if (data.includes('<query xmlns="jabber:iq:roster"')) {
            const stanza = new DOMParser().parseFromString(data, "application/xml").documentElement;
            window.releaseFixtureRoster = () => reply(`<iq xmlns="jabber:client" type="result" id="${stanza.getAttribute("id")}"><query xmlns="jabber:iq:roster"><item jid="peer@localhost" name="Fixture peer" subscription="both"/></query></iq>`);
            return;
          }
          if (data.startsWith("<auth")) {
            this.authenticated = true;
            reply('<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>');
            return;
          }
          if (data.includes('<bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"')) {
            const stanza = new DOMParser().parseFromString(data, "application/xml").documentElement;
            reply(`<iq xmlns="jabber:client" type="result" id="${stanza.getAttribute("id")}"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>fixture@localhost/test</jid></bind></iq>`);
            return;
          }
          if (!data.startsWith("<open")) return;
          if (this.authenticated) {
            reply('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing"/><stream:features xmlns:stream="http://etherx.jabber.org/streams"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/></stream:features>');
            return;
          }
          setTimeout(() => this.dispatchEvent(new MessageEvent("message", {
            data: '<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="localhost" version="1.0"/>'
              + '<stream:features xmlns:stream="http://etherx.jabber.org/streams">'
              + '<mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms>'
              + '</stream:features>'
          })), 10);
        }
        close() { this.readyState = 3; }
      }
      window.WebSocket = FixtureSocket;
      window.Capacitor = { getPlatform: () => "ios", isPluginAvailable: () => true, Plugins: {
        TeleTypTelGoogle: { signIn: async () => ({ serverAuthCode: "unused-fixture" }) },
        TeleTypTelServer: { request: async options => {
          window.fixtureNativeRequests.push(options.path);
          window.fixtureNativeCalls.push(options);
          if (window.fixtureNativeOffline) throw Object.assign(new Error("Offline fixture"), { code: "SERVER_UNAVAILABLE" });
          let status = 200;
          let payload = { ok: true, messages: [], conversations: [], groups: [] };
          if (options.path === "/config/account-profile.json") payload = {
            accountId: "fixture-guest", jid: "fixture@localhost", displayName: "Fixture",
            preferredLanguage: "eng", providerId: "fixture", password: "",
            xmppDomain: "localhost", xmppWebSocket: "wss://server.test/xmpp"
          };
          if (options.path === "/config/providers/fixture.json") payload = {
            providerId: "fixture", name: "Fixture", version: "1", capabilities: [], tabs: []
          };
          if (options.path.startsWith("/api/account.php") && options.method !== "POST") { status = 404; payload = { ok: false }; }
          if (options.path === "/api/account.php" && options.method === "POST") {
            const input = JSON.parse(atob(options.body));
            if (input.action === "login") {
              window.fixtureLoginStarted = true;
              await new Promise(resolve => { window.finishFixtureLogin = resolve; });
              payload = { ok: true, account: { ...input, accountId: "fixture-account", savedInDatabase: true } };
            }
          }
          return { status, headers: { "content-type": "application/json" }, body: btoa(JSON.stringify(payload)) };
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
    const gate = page.locator('.native-startup[data-state="offline"]');
    await gate.waitFor();
    assert.equal(await page.locator(".xmpp-availability").count(), 1);
    assert.match(await gate.innerText(), /server.*offline|server.*bereikbaar/i);
    assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), true);
    const requests = await page.evaluate(() => fixtureNativeRequests);
    assert.ok(requests.includes("/config/account-profile.json"));
    assert.ok(!requests.includes("/api/rtc-config.php"), "offline startup must not wait for another server timeout");
    await gate.getByRole("button").click();
    await page.waitForFunction(() => fixtureNativeRequests.filter(path => path === "/config/account-profile.json").length >= 2);
    await gate.getByRole("button").waitFor();
    assert.equal(await page.locator(".xmpp-availability").count(), 1);
    const screenshot = path.resolve(__dirname, "../artifacts/mobile-chat/ios-bundled-offline.png");
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
    await page.evaluate(() => { window.fixtureNativeOffline = false; });
    await gate.getByRole("button").click();
    await page.locator("#accountDialogTitle").waitFor({ state: "visible" });
    assert.equal(await page.locator(".native-startup").isVisible(), false);
    assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), true, "Sign-in still protects its background");
    assert.equal(await page.locator("#accountDialog").evaluate(element => element.inert), false, "Startup releases the sign-in dialog");
    assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isVisible(), true);
    assert.equal(await page.locator("#dialogJidInput").isVisible(), true);
    if (scenario.touch) assert.equal(await page.evaluate(() => document.activeElement.matches("input,textarea")), false);
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
    await page.screenshot({ path: path.resolve(__dirname, "../artifacts/mobile-chat/ios-bundled-recovered.png") });
    await page.evaluate(() => {
      window.loginPhases = [];
      window.postLoginFrames = [];
      const sample = () => {
        const gate = document.querySelector(".xmpp-availability");
        if (!document.body.classList.contains("account-gate") && !gate.open) {
          const bounds = selector => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value));
          };
          window.postLoginFrames.push({ shell: bounds(".app-shell"), header: bounds(".topbar"),
            logo: bounds(".brand-logo"), scroll: [scrollX, scrollY],
            editableFocus: document.activeElement.matches('input, textarea, [contenteditable="true"]') });
        }
        window.postLoginAnimation = requestAnimationFrame(sample);
      };
      window.postLoginAnimation = requestAnimationFrame(sample);
      new MutationObserver(() => {
        const gate = document.querySelector(".xmpp-availability");
        if (gate.open) window.loginPhases.push(gate.dataset.phase);
      }).observe(document.querySelector(".xmpp-availability"), { attributes: true });
    });
    await page.locator("#dialogJidInput").fill("fixture@localhost");
    await page.locator("#dialogPasswordInput").fill("Fixture-only-password1!");
    await page.locator("#dialogConnectButton").click();
    await page.waitForFunction(() => window.fixtureLoginStarted);
    assert.equal(await page.locator(".native-startup").isVisible(), false, "No startup flash while submitting credentials");
    assert.equal(await page.locator("#accountDialog").isVisible(), true);
    await page.evaluate(() => window.finishFixtureLogin());
    await page.waitForFunction(() => /XMPP connected/.test(document.getElementById("connectionSummary").textContent), null, { timeout: 5000 })
      .catch(async error => { throw new Error(error.message + JSON.stringify(await page.evaluate(() => ({
        status: document.getElementById("connectionSummary").textContent,
        dialog: document.getElementById("dialogAccountStatus").textContent, frames: window.fixtureFrames
      })))); });
    assert.equal(await page.locator("#accountDialog").isVisible(), false);
    assert.equal(await page.locator(".native-startup").isVisible(), false);
    assert.equal(await page.evaluate(() => window.loginPhases.includes("checking")), false, "No checking/login/checking flicker");
    assert.ok(await page.evaluate(() => window.loginPhases.includes("connecting")), "Authenticated connection retains its progress screen");
    await page.waitForFunction(() => typeof window.releaseFixtureRoster === "function" && window.postLoginFrames.length >= 3);
    const phaseCount = await page.evaluate(() => window.loginPhases.length);
    await page.evaluate(() => window.releaseFixtureRoster());
    await page.getByRole("button", { name: /Fixture peer/ }).waitFor();
    await page.waitForFunction(() => window.postLoginFrames.length >= 30);
    const frames = await page.evaluate(() => {
      cancelAnimationFrame(window.postLoginAnimation);
      return window.postLoginFrames;
    });
    assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), false, "Contacts are interactive after login");
    assert.equal(await page.evaluate(() => window.loginPhases.length), phaseCount, "Startup must not reopen after login");
    assert.equal(frames[0].editableFocus, false, "No automatic keyboard after login");
    assert.deepEqual(frames[0].scroll, [0, 0]);
    for (const frame of frames) assert.deepEqual(frame, frames[0], "Header and shell stay fixed while contacts load");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.resolve(__dirname, `../artifacts/mobile-chat/${scenario.name}-signed-in-stable.png`) });
  } finally { await browser.close(); }
});
}
