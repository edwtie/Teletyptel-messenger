const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const detection = client.slice(client.indexOf("  function detectClientDevice()"), client.indexOf("  function isPhoneDevice()"));

test("iPad Mobile Safari and desktop-mode iPad are tablets, never phones", () => {
  for (const [userAgent, platform, touch, expected] of [
    ["Mozilla iPad OS 18_0 Mobile/15E148 Safari", "iPad", 5, "tablet"],
    ["Mozilla Macintosh Mobile/15E148 Safari", "MacIntel", 5, "tablet"],
    ["Mozilla iPhone Mobile Safari", "iPhone", 5, "phone"],
    ["Mozilla Macintosh Safari", "MacIntel", 0, "desktop"]
  ]) {
    assert.equal(vm.runInNewContext(detection + "detectClientDevice().deviceClass", {
      navigator: { userAgent, platform, maxTouchPoints: touch }
    }), expected);
  }
});

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: tablet chat, rotation, small windows and keyboard-sized TC view`, async () => {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ hasTouch: true, viewport: { width: 1194, height: 834 }, colorScheme: "light" });
      const page = await context.newPage();
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://tablet.test") return route.abort();
        if (url.pathname === "/chat.html") {
          const html = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
          return route.fulfill({ contentType: "text/html", body: html });
        }
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|png|svg|ico)$/.test(file) || !fs.existsSync(file)) {
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({ path: file });
      });
      await page.goto("https://tablet.test/chat.html");
      await page.evaluate(() => {
        document.body.className = "device-tablet device-ios viewport-tablet conversation-open";
        document.body.dataset.theme = "light";
        document.body.dataset.platform = "ios";
        document.querySelector(".chat-title h2").textContent = "Voorbeeldcontact";
        document.getElementById("activeConversationMeta").textContent = "Online";
        for (const id of ["answerCallButton", "hangupCallButton"]) document.getElementById(id).hidden = true;
        document.getElementById("conversationItems").innerHTML = Array.from({ length: 30 }, (_, index) =>
          `<button class="conversation-item"><span class="avatar">${index + 1}</span><span class="conversation-text"><strong>Contact ${index + 1}</strong><span>Een voorbeeldbericht</span></span><span class="conversation-row-meta"><span class="conversation-time">12:30</span><span class="presence-dot presence-online"></span></span></button>`).join("");
        document.getElementById("messageTimeline").innerHTML = Array.from({ length: 20 }, (_, index) =>
          `<div class="message ${index % 2 ? "self" : ""}"><div class="message-body">Een duidelijk leesbaar bericht op de iPad.</div></div>`).join("");
        document.getElementById("messageInput").value = "Mijn concept blijft behouden";
      });
      const iconsStart = client.indexOf("  const materialIcons = {");
      await page.addScriptTag({ content: client.slice(iconsStart, client.indexOf("\n  };", iconsStart) + 5)
        + client.slice(client.indexOf("  function createMaterialIcon("), client.indexOf("  function createScreenReaderText("))
        + "renderMaterialIcons();" });
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, "mobile-navigation.js"), "utf8") });
      const output = path.resolve(__dirname, "../artifacts/tablet-layout");
      fs.mkdirSync(output, { recursive: true });
      await page.evaluate(() => document.body.classList.remove("conversation-open"));
      assert.equal(await page.locator(".tablet-chat-placeholder").isVisible(), true);
      await page.evaluate(() => document.body.classList.add("conversation-open"));
      assert.equal(await page.locator(".tablet-chat-placeholder").isVisible(), false);
      for (const viewport of [{ width: 1194, height: 834 }, { width: 834, height: 1194 },
        { width: 834, height: 500 }, { width: 744, height: 900 }, { width: 600, height: 900 }, { width: 390, height: 600 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(({ width, height }) => {
          document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
          document.body.classList.toggle("viewport-phone", width <= 640);
          document.body.classList.toggle("viewport-tablet", width > 640);
        }, viewport);
        await page.screenshot({ path: path.join(output, `${engine.name()}-${viewport.width}-${viewport.height}.png`) });
        const bounds = await page.locator("#composerForm").boundingBox();
        assert.ok(bounds && bounds.y + bounds.height <= viewport.height + 1, `composer outside ${JSON.stringify({ viewport, bounds })}`);
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
        if (viewport.width >= 800) {
          const list = await page.locator(".conversation-list").boundingBox();
          const chat = await page.locator(".chat-panel").boundingBox();
          assert.ok(list && chat && list.x + list.width <= chat.x + 1);
          assert.ok(list.width >= 280 && list.width <= 340);
          assert.equal(await page.locator(".back-to-contacts").isVisible(), false);
        } else {
          assert.equal(await page.locator(".conversation-list").isVisible(), false);
          assert.equal(await page.locator(".back-to-contacts").isVisible(), true);
        }
        assert.equal(await page.locator("#messageInput").inputValue(), "Mijn concept blijft behouden");
      }
      await page.setViewportSize({ width: 834, height: 550 });
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--visual-viewport-height", "550px");
        document.body.classList.remove("viewport-phone");
        document.body.classList.add("viewport-tablet", "call-active", "tc-text-visible-active");
        document.getElementById("callPanel").hidden = false;
        document.getElementById("hangupCallButton").hidden = false;
        document.getElementById("totalConversationTextPanel").hidden = false;
        document.getElementById("totalConversationRemoteText").textContent = "Ik kan je tekst goed lezen.";
        document.getElementById("totalConversationLocalText").textContent = "Video, geluid en realtime tekst.";
      });
      await page.screenshot({ path: path.join(output, `${engine.name()}-tc-keyboard.png`) });
      for (const selector of ["#composerForm", ".call-media-controls", "#totalConversationTextPanel"]) {
        const bounds = await page.locator(selector).boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 551, `${selector} outside viewport: ${JSON.stringify(bounds)}`);
      }
    } finally { await browser.close(); }
  });
}
