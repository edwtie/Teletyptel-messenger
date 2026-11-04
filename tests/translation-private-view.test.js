const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: incoming and own translations stay private and compact`, async () => {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const requests = [];
      let incomingConsent = true;
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://private.test") throw new Error("Unexpected external request");
        if (url.pathname === "/api/translation.php") return route.fulfill({ json: {
          ok: true, accountId: "viewer", csrfToken: "fixture", available: true,
          languages: { nl: "Nederlands", en: "English" }, preferences: {
            targetLanguage: "en", mode: "automatic", automaticConsent: true,
            liveRttConsent: incomingConsent, ownLiveRttConsent: true
          }
        } });
        if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
        const file = path.join(root, url.pathname);
        return fs.existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
      });
      const page = await context.newPage();
      await page.goto("https://private.test/");
      await page.addScriptTag({ path: path.join(root, "chat-translation.js") });
      await page.exposeFunction("recordTranslation", input => requests.push(input));
      await page.clock.install();
      await page.evaluate(async () => {
        const settings = document.querySelector(".translation-settings");
        document.body.replaceChildren(settings);
        document.body.style.cssText = "display:block;height:auto;padding:12px";
        for (const id of ["history", "tc-peer", "tc-self", "disabled-peer"]) {
          const section = document.createElement("section");
          section.id = id;
          document.body.append(section);
        }
        window.original = { direction: "peer", text: "Bonjour", status: "history" };
        window.app = window.TeleTypTelTranslation.create({
          translate: key => key === "translation.heading" ? "Vertaling" : key,
          refreshMessage: () => {
            const container = document.getElementById("history");
            container.replaceChildren();
            window.app.render(window.original, container);
          },
          refreshLive: () => {
            for (const side of ["tc-peer", "tc-self"]) {
              const container = document.getElementById(side);
              container.replaceChildren();
              window.app.renderLive(container, side);
            }
          },
          xmpp: { configure() {}, configured: () => true, translate: async body => {
            await window.recordTranslation(body);
            return { translation: { text: "English: " + body.text } };
          } }
        });
        await window.app.setAccount("viewer");
        window.app.setLiveDraft("call-1", "Hallo van de ander", "peer@test", "peer", "tc-peer");
        window.app.setLiveDraft("call-1", "Mijn antwoord", "me@test", "self", "tc-self");
      });
      await page.clock.runFor(5000);
      await page.locator("#tc-peer .live-rtt-translation-text").filter({ hasText: "English: Hallo van de ander" }).waitFor();
      await page.locator("#tc-self .live-rtt-translation-text").filter({ hasText: "English: Mijn antwoord" }).waitFor();
      await page.locator("#history").filter({ hasText: "English: Bonjour" }).waitFor();
      assert.equal(requests.length, 3);
      assert.equal(requests.find(item => item.text === "Mijn antwoord").liveDirection, "self");
      assert.equal(requests.find(item => item.text === "Hallo van de ander").liveDirection, undefined);
      assert.deepEqual(await page.evaluate(() => window.original), { direction: "peer", text: "Bonjour", status: "history" });
      assert.ok(requests.every(item => !Object.hasOwn(item, "to") && !item.text.startsWith("English:")), "Provider receives originals only, never a recipient or a translated reply");
      for (const width of [390, 320, 834, 1194]) {
        await page.setViewportSize({ width, height: width > 834 ? 834 : 844 });
        const metrics = await page.locator("#tc-peer .live-rtt-translation").evaluate(element => ({
          height: element.getBoundingClientRect().height,
          padding: getComputedStyle(element).paddingLeft,
          fontSize: getComputedStyle(element.querySelector(".live-rtt-translation-text")).fontSize,
          overflow: document.documentElement.scrollWidth > innerWidth
        }));
        assert.ok(metrics.height < 65, "Short translation does not need a large card");
        assert.equal(metrics.padding, "0px");
        assert.equal(metrics.fontSize, "16px");
        assert.equal(metrics.overflow, false);
      }
      await page.evaluate(() => {
        document.getElementById("translationLiveConsent").checked = false;
        document.getElementById("translationLiveConsent").dispatchEvent(new Event("change"));
        window.app.renderLiveStatus(document.getElementById("disabled-peer"), "tc-peer");
        window.app.setLiveDraft("call-1", "Private unsent text", "peer@test", "peer", "tc-peer");
      });
      await page.clock.runFor(5000);
      assert.equal(requests.length, 3, "Changed consent immediately stops transmission");
      assert.equal(await page.locator("#disabled-peer details").getAttribute("open"), null);
      assert.equal(await page.locator("#disabled-peer summary").isVisible(), true);
      incomingConsent = false;
      await page.evaluate(async () => {
        await window.app.setAccount("viewer", true);
        const container = document.getElementById("disabled-peer");
        container.replaceChildren();
        window.app.renderLiveStatus(container, "tc-peer");
        window.app.setLiveDraft("call-2", "Do not share this draft", "peer@test", "peer", "tc-peer");
        window.app.setLiveDraft("call-2", "Allowed own draft", "me@test", "self", "tc-self");
      });
      await page.clock.runFor(5000);
      await page.locator("#tc-self").filter({ hasText: "English: Allowed own draft" }).waitFor();
      assert.equal(await page.locator("#tc-peer").textContent(), "");
      await page.locator("#disabled-peer summary").click();
      assert.equal(await page.locator("#disabled-peer [role=status]").textContent(), "translation.peer_live_disabled");
      assert.ok(!requests.some(item => item.text === "Do not share this draft"), "Own preview consent never authorizes the peer's unsent text");
    } finally {
      await browser.close();
    }
  });
}
