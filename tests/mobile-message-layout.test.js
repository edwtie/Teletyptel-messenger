const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: mobile bubbles align with avatars, translations and receipts`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://messages.test") return route.abort();
        if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|png|svg|ico)$/.test(file) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ path: file });
      });
      await page.goto("https://messages.test/chat.html");
      await page.evaluate(() => {
        document.body.className = "device-ios device-phone viewport-phone conversation-open";
        document.body.dataset.deviceClass = "phone";
        document.body.dataset.theme = "light";
        document.body.dataset.chatBackground = "none";
        const timeline = document.getElementById("messageTimeline");
        timeline.replaceChildren();
        for (const direction of ["peer", "self"]) {
          for (const [kind, text] of [["short", "Hallo!"], ["long", "Dit is een langer bericht.\nDe volgende regel blijft goed leesbaar."],
            ["url", "https://example.test/" + "pakket".repeat(30)], ["translation", "Kun je mij helpen?"],
            ["group", "Een bericht in de groep 👋"], ["draft", "Ik ben aan het typen…"]]) {
            const message = document.createElement("div");
            message.className = `message with-avatar ${direction} ${kind === "draft" ? "draft" : "has-inline-meta has-bubble-tail"}`;
            message.dataset.fixture = kind;
            message.innerHTML = '<div class="avatar message-avatar">ET</div><div class="message-content"><div class="message-body-wrap"><div class="message-body"><span class="message-text-content"></span></div><button class="message-reaction-button" aria-label="Reageren">☺</button></div></div>';
            message.querySelector(".message-text-content").textContent = text;
            const body = message.querySelector(".message-body");
            if (kind === "group") {
              const sender = document.createElement("span");
              sender.className = "message-group-sender-label";
              sender.textContent = "Een deelnemer met een heel lange weergavenaam";
              body.prepend(sender);
            }
            if (kind === "translation") {
              const translation = document.createElement("div");
              translation.className = "message-translation";
              translation.innerHTML = '<div class="message-translation-result"><details class="translation-info"><summary>Vertaling</summary>Kan fouten bevatten.</details>Can you help me?</div>';
              body.append(translation);
            }
            if (kind !== "draft") {
              const meta = document.createElement("span");
              meta.className = "message-inline-meta";
              meta.innerHTML = '12:34 <span class="message-receipt message-receipt-delivered">✓✓</span>';
              body.append(" ", meta);
            }
            timeline.append(message);
          }
        }
      });
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      for (const width of [320, 390, 430, 844]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
        const metrics = await page.evaluate(() => {
          const timeline = document.getElementById("messageTimeline");
          const timelineRect = timeline.getBoundingClientRect();
          const bounds = element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          };
          return { overflow: timeline.scrollWidth - timeline.clientWidth,
            left: timelineRect.left + parseFloat(getComputedStyle(timeline).paddingLeft) + 6,
            right: timelineRect.right - parseFloat(getComputedStyle(timeline).paddingRight) - 6,
            rows: [...timeline.querySelectorAll(".message")].map(row => ({
              self: row.classList.contains("self"), draft: row.classList.contains("draft"),
              body: bounds(row.querySelector(".message-body")), avatar: bounds(row.querySelector(".message-avatar")),
              meta: row.querySelector(".message-inline-meta") ? bounds(row.querySelector(".message-inline-meta")) : null,
              reaction: bounds(row.querySelector(".message-reaction-button")),
              translation: row.querySelector(".message-translation") ? bounds(row.querySelector(".message-translation")) : null
            })) };
        });
        assert.ok(metrics.overflow <= 1, `${width}: timeline must not scroll horizontally`);
        for (const row of metrics.rows) {
          if (row.self) assert.ok(Math.abs(row.avatar.right - metrics.right) <= 3, `${width}: own avatar must align at the right edge: ${JSON.stringify(row)}`);
          else assert.ok(Math.abs(row.avatar.left - metrics.left) <= 1, `${width}: peer avatar must align at the left edge`);
          if (!row.draft) assert.ok(Math.abs(row.avatar.top - row.body.top - 4) <= 1, "Avatar aligns with bubble, not a hidden sender row");
          assert.ok(row.reaction.left >= 0 && row.reaction.right <= width, "Reaction control fits on screen");
          if (row.meta) {
            assert.ok(row.meta.left >= row.body.left && row.meta.right <= row.body.right, "Time and ticks stay in bubble");
            assert.ok(row.meta.bottom <= row.body.bottom, "Time stays within bubble height");
            if (row.translation) assert.ok(row.meta.top >= row.translation.bottom - 1, "Time does not overlap translation");
          }
        }
        const shortLines = await page.locator('[data-fixture="short"] .message-text-content').evaluateAll(elements => elements.map(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getClientRects().length;
        }));
        assert.deepEqual(shortLines, [1, 1], "Short messages must not be squeezed by time and receipts");
        const senderLabels = await page.locator(".message-group-sender-label").evaluateAll(elements => elements.map(element => ({
          truncated: element.scrollWidth > element.clientWidth,
          ellipsis: getComputedStyle(element).textOverflow
        })));
        if (width <= 430) assert.ok(senderLabels.every(label => label.truncated && label.ellipsis === "ellipsis"));
        if (width === 390) {
          const output = path.resolve(__dirname, "../artifacts/mobile-chat");
          fs.mkdirSync(output, { recursive: true });
          await page.screenshot({ path: path.join(output, `${name}-message-layout.png`) });
          await page.locator("#messageTimeline").evaluate(element => { element.scrollTop = element.scrollHeight; });
          await page.screenshot({ path: path.join(output, `${name}-own-message-layout.png`) });
        }
      }
    } finally { await browser.close(); }
  });
}
