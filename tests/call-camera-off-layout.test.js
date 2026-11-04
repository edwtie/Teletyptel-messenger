const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: camera-off RTT fills the phone without duplicate draft panels`, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://camera-off.test") return route.abort();
        if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|svg|png|ico)$/.test(file) || !fs.existsSync(file)) {
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({ path: file });
      });
      await page.goto("https://camera-off.test/chat.html");
      for (const [width, height, keyboard] of [[390, 844, false], [844, 390, false], [390, 350, true], [844, 240, true]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(({ width, height, keyboard }) => {
          document.body.className = "device-ios device-phone viewport-phone conversation-open call-active tc-call-active tc-text-visible-active tc-text-full-active"
            + (width > height ? " viewport-landscape tc-phone-landscape-active" : " viewport-portrait")
            + (keyboard ? " tc-phone-keyboard-active" : "");
          document.body.dataset.deviceClass = "phone";
          document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
          document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
          const panel = document.getElementById("callPanel");
          panel.hidden = false;
          panel.className = "call-panel tc-text-full local-video-main has-local-video no-remote-video";
          document.getElementById("localVideo").hidden = false;
          document.getElementById("remoteVideo").hidden = true;
          document.getElementById("totalConversationTextPanel").hidden = false;
          document.getElementById("totalConversationRemoteText").textContent = "Live tekst zonder camera. ".repeat(50);
          document.getElementById("totalConversationLocalText").value = "Mijn antwoord";
          document.getElementById("totalConversationLocalText").disabled = false;
          document.getElementById("totalConversationLocalPreviousText").hidden = true;
          document.getElementById("totalConversationRemotePreviousText").hidden = true;
          document.getElementById("hangupCallPanelButton").hidden = false;
          document.querySelector(".call-mode-buttons").hidden = true;
        }, { width, height, keyboard });
        assert.equal(await page.locator("#localVideo").isVisible(), false, "Camera-off must not leave a black video surface");
        const panel = await page.locator("#callPanel").boundingBox();
        const text = await page.locator("#totalConversationTextPanel").boundingBox();
        const controls = await page.locator(".call-media-controls").boundingBox();
        assert.ok(text.height >= panel.height - controls.height - 4, JSON.stringify({ panel, text, controls }));
        assert.ok(text.y + text.height <= controls.y + 2, "Text cannot cover call controls");
        const line = await page.locator(".tc-text-line").first().boundingBox();
        assert.ok(line.height >= text.height / 2 - 16, "RTT must expand rather than stay capped at 120px");
        assert.equal(await page.locator("#composerForm").isVisible(), false, "Ordinary chat is hidden during TC");
        assert.ok(controls.y + controls.height <= height + 2, "Call controls remain on screen");
        for (const selector of [".tc-text-local", ".tc-text-remote"]) {
          assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).borderTopColor),
            "rgb(36, 82, 138)", "Dark-blue frames separate the two TC speakers");
        }
        for (const selector of ["#totalConversationLocalText", ".call-media-controls"]) {
          assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).borderTopColor),
            "rgba(0, 0, 0, 0)", "No light-blue TC frames");
        }
        await page.locator("#totalConversationLocalText").focus();
        assert.deepEqual(await page.locator("#totalConversationLocalText").evaluate(element => ({
          outline: getComputedStyle(element).outlineStyle,
          shadow: getComputedStyle(element).boxShadow
        })), { outline: "none", shadow: "none" }, "Typing adds no separate focus frame");
        if (!keyboard && width === 390) {
          await page.locator("#totalConversationLocalText").fill("Live RTT\nMijn antwoord 👋");
          assert.equal(await page.locator("#totalConversationLocalText").inputValue(), "Live RTT\nMijn antwoord 👋");
          assert.equal(await page.locator("#messageInput").inputValue(), "");
          const output = path.resolve(__dirname, "../artifacts/mobile-chat");
          fs.mkdirSync(output, { recursive: true });
          await page.screenshot({ path: path.join(output, `${engine.name()}-camera-off-rtt.png`) });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => {
        document.body.className = "device-ios device-phone viewport-phone viewport-portrait conversation-open";
        document.documentElement.style.setProperty("--visual-viewport-height", "844px");
        document.getElementById("callPanel").hidden = true;
        document.getElementById("remoteDraft").hidden = false;
        document.getElementById("remoteDraftText").textContent = "Ja";
        document.getElementById("messageTimeline").innerHTML = '<div data-remote-draft="true">Ja</div>';
      });
      assert.equal(await page.locator("#remoteDraft").isVisible(), false, "The existing RTT bubble must not be duplicated above the composer");
      assert.equal(await page.locator('[data-remote-draft="true"]').isVisible(), true);
      assert.equal(await page.locator("#composerForm").isVisible(), true, "Normal chat returns after TC");
    } finally {
      await browser.close();
    }
  });
}
