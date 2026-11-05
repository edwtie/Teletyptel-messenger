const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: off hides all translation UI and rejects late results`, async () => {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      let preferences = { mode: "off", targetLanguage: "en", automaticConsent: true,
        liveRttConsent: true, ownLiveRttConsent: true };
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        assert.equal(url.origin, "https://off.test");
        if (url.pathname === "/api/translation.php") {
          if (route.request().method() === "POST") {
            const input = route.request().postDataJSON();
            assert.equal(input.action, "preferences", "No message text may use the HTTP fallback");
            preferences = input;
          }
          return route.fulfill({ json: { ok: true, accountId: "viewer", csrfToken: "fixture", available: true,
            languages: { nl: "Nederlands", en: "English" }, preferences } });
        }
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
        const file = path.join(root, url.pathname);
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("https://off.test/");
      await page.addScriptTag({ path: path.join(root, "chat-translation.js") });
      await page.clock.install();
      await page.evaluate(() => {
        document.body.replaceChildren(document.querySelector(".translation-settings"));
        window.messages = [
          { direction: "peer", text: "Bonjour" },
          { direction: "self", text: "Hallo" },
          { direction: "peer", draft: true, text: "Peer draft", from: "peer@test" },
          { direction: "self", draft: true, text: "Own draft", from: "me@test" }
        ];
        for (const id of ["history", "tc-peer", "tc-self", "own-status"]) {
          const section = document.createElement("section");
          section.id = id;
          document.body.append(section);
        }
        window.requests = [];
        window.pending = [];
        window.hold = false;
        window.refresh = () => {
          const history = document.getElementById("history");
          history.replaceChildren();
          for (const message of window.messages) window.app.render(message, history);
        };
        window.refreshLive = () => {
          for (const side of ["tc-peer", "tc-self"]) {
            const container = document.getElementById(side);
            container.replaceChildren();
            window.app.renderLive(container, side);
            window.app.renderLiveStatus(container, side);
          }
          const own = document.getElementById("own-status");
          own.replaceChildren();
          window.app.renderOwnStatus(own);
        };
        window.app = window.TeleTypTelTranslation.create({
          translate: key => key, refreshMessage: window.refresh, refreshLive: window.refreshLive,
          xmpp: { configure() {}, configured: () => true, translate: (body, signal) => {
            window.requests.push({ body, signal });
            if (window.hold) return new Promise((resolve, reject) => window.pending.push({ body, resolve, reject }));
            return Promise.resolve({ translation: { text: "English: " + body.text } });
          } }
        });
        window.drafts = () => {
          window.app.setPeerDrafts("room", [{ sender: "peer@test", text: "Peer draft" }]);
          window.app.setLiveDraft("room", "Own draft", "me@test", "self");
          window.app.setLiveDraft("call", "TC peer draft", "peer@test", "peer", "tc-peer");
          window.app.setLiveDraft("call", "TC own draft", "me@test", "self", "tc-self");
          window.refresh();
          window.refreshLive();
        };
        window.chooseMode = mode => {
          const select = document.getElementById("translationMode");
          select.value = mode;
          select.dispatchEvent(new Event("change"));
        };
        window.refresh();
        window.refreshLive();
      });
      const assertSilent = async () => {
        assert.equal(await page.locator("#history, #tc-peer, #tc-self, #own-status").evaluateAll(
          containers => containers.every(container => !container.hasChildNodes())), true);
        assert.equal(await page.evaluate(() => window.messages.every(message => !window.app.menuAction(message).visible)), true);
      };
      await assertSilent();
      await page.evaluate(async () => {
        await window.app.setAccount("viewer");
        window.drafts();
        for (const message of window.messages) {
          window.app.incoming(message);
          await window.app.activate(message);
        }
      });
      await page.clock.runFor(15000);
      await assertSilent();
      assert.equal(await page.evaluate(() => window.requests.length), 0);

      await page.evaluate(async () => {
        window.chooseMode("automatic");
        for (const id of ["translationConsent", "translationManualConsent", "translationLiveConsent", "translationOwnLiveConsent"])
          document.getElementById(id).checked = true;
        await window.app.savePreferences();
        await window.app.activate(window.messages[1]);
        window.drafts();
      });
      await page.clock.runFor(15000);
      await page.waitForFunction(() => document.getElementById("tc-self").textContent.includes("English: TC own draft"));
      assert.equal(await page.locator("#history .message-translation").count(), 2);
      assert.equal(await page.locator("#history .live-rtt-translation").count(), 2);
      assert.equal(await page.locator("#tc-peer .live-rtt-translation").count(), 1);

      await page.evaluate(() => {
        window.hold = true;
        window.messages.push({ direction: "peer", text: "Late message" }, { direction: "peer", text: "Queued message" });
        window.refresh();
        window.app.setLiveDraft("call", "Late RTT draft", "peer@test", "peer", "tc-peer");
      });
      await page.clock.runFor(4000);
      await page.waitForFunction(() => window.pending.length === 2);
      const requestCount = await page.evaluate(() => window.requests.length);
      await page.evaluate(() => window.chooseMode("off"));
      await assertSilent();
      assert.equal(await page.evaluate(() => window.requests.slice(-2).every(request => request.signal.aborted)), true);
      await page.evaluate(async () => {
        await window.app.savePreferences();
        for (const pending of window.pending.splice(0)) {
          if (pending.body.liveRtt) pending.reject(new Error("service_unreachable"));
          else pending.resolve({ translation: { text: "Late translated message" } });
        }
        window.drafts();
      });
      await page.clock.runFor(25000);
      await assertSilent();
      assert.equal(await page.evaluate(() => window.requests.length), requestCount, "Off cancels queued work and new drafts");
      await page.evaluate(async () => {
        await window.app.setAccount("viewer", true);
        window.drafts();
      });
      await page.clock.runFor(5000);
      await assertSilent();
      assert.equal(await page.evaluate(() => window.requests.length), requestCount, "Saved off preference survives reload");
      assert.deepEqual(await page.evaluate(() => window.messages.slice(0, 2).map(message => message.text)), ["Bonjour", "Hallo"]);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
