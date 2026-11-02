const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const publicRoot = path.resolve(__dirname, "../php/public");
const profile = {
  accountId: "fixture-guest", jid: "fixture@localhost", displayName: "Fixture",
  preferredLanguage: "ned", providerId: "fixture", password: "",
  xmppDomain: "localhost", xmppWebSocket: "wss://messenger.test/xmpp"
};

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: real Messenger page blocks offline startup and retries into sign-in`, async () => {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const page = await context.newPage();
      const errors = [];
      const accountRequests = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://messenger.test") return route.abort();
        if (url.pathname === "/config/account-profile.json") return route.fulfill({ json: profile });
        if (url.pathname === "/config/providers/fixture.json") {
          return route.fulfill({ json: { providerId: "fixture", name: "Fixture", version: "1", capabilities: [], tabs: [] } });
        }
        if (url.pathname === "/api/account.php") {
          accountRequests.push(url.pathname + url.search);
          return route.fulfill({ status: 404, json: { ok: false } });
        }
        if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/config/")) {
          return route.fulfill({ json: { ok: true, messages: [], conversations: [], groups: [] } });
        }
        const file = path.resolve(publicRoot, "." + url.pathname);
        if (!file.startsWith(publicRoot + path.sep)
            || !/\.(?:html|js|css|lng|svg|png|ico|woff2)$/.test(file)
            || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        const contentType = file.endsWith(".lng") ? "text/plain; charset=utf-8" : undefined;
        return route.fulfill({ path: file, ...(contentType ? { contentType } : {}) });
      });
      await page.addInitScript(() => {
        window.fixtureOnline = false;
        class FixtureSocket extends EventTarget {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor() {
            super();
            this.readyState = 0;
            this.protocol = "xmpp";
            setTimeout(() => {
              if (!window.fixtureOnline) {
                this.dispatchEvent(new Event("error"));
                return;
              }
              this.readyState = 1;
              this.dispatchEvent(new Event("open"));
            }, 10);
          }
          send(data) {
            if (!data.startsWith("<open")) return;
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
      });
      await page.goto("https://messenger.test/chat.html");
      const gate = page.locator('.xmpp-availability[open][data-state="offline"]');
      await gate.waitFor();
      const logo = gate.getByRole("img", { name: "TeleTypTel" });
      await logo.evaluate(image => image.decode());
      assert.equal(await logo.getAttribute("src"), "assets/brand/teletyptel-logo-header@2x.png");
      const logoBounds = await logo.boundingBox();
      assert.equal(logoBounds.width, 280);
      assert.ok(Math.abs(logoBounds.width / logoBounds.height - 599 / 128) < 0.01);
      assert.match(await gate.innerText(), /De chatserver is niet online of niet bereikbaar/);
      assert.deepEqual(accountRequests.filter(url => !url.includes("lookupJid=")), []);
      assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), true);
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        const bounds = await gate.boundingBox();
        for (const [key, expected] of Object.entries({ x: 0, y: 0, ...viewport })) {
          assert.ok(Math.abs(bounds[key] - expected) < 1, `${key}: ${bounds[key]} instead of ${expected}`);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const screenshots = path.resolve(__dirname, "../artifacts/xmpp-availability");
      fs.mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: path.join(screenshots, `${engine.name()}-offline.png`) });
      await page.evaluate(() => { window.fixtureOnline = true; });
      await gate.getByRole("button", { name: "Opnieuw proberen" }).click();
      await page.locator("#accountDialog:not([hidden])").waitFor();
      assert.equal(await page.locator(".xmpp-availability").evaluate(element => element.open), false);
      assert.equal(await page.locator(".app-shell").evaluate(element => element.inert), false);
      assert.ok(accountRequests.some(url => !url.includes("lookupJid=")));
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
