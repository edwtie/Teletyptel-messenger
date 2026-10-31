const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: contact list scrolls while the plus and its actions stay reachable`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [1280, 800]]) {
        const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 1000, hasTouch: true });
        await page.route("**/*", route => route.abort());
        await page.setContent(markup);
        await page.addStyleTag({ content: fs.readFileSync(path.join(root, "chat-client.css"), "utf8")
          .replace(/env\(safe-area-inset-bottom(?:,\s*0px)?\)/g, "34px") });
        await page.evaluate(() => {
          document.body.className = "viewport-phone";
          document.body.dataset.theme = "light";
          document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
          window.actionClicks = { contact: 0, group: 0 };
          document.getElementById("addConversationButton").addEventListener("click", () => actionClicks.contact++);
          document.getElementById("addGroupButton").addEventListener("click", () => actionClicks.group++);
          for (let index = 0; index < 60; index++) {
            const button = document.createElement("button");
            button.className = "conversation-item";
            button.textContent = "Contact " + (index + 1);
            document.getElementById("conversationItems").appendChild(button);
          }
        });
        await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
        const toggle = page.locator("#conversationActionsToggle");
        const panel = page.locator("#conversationActionsPanel");
        assert.equal(await panel.isVisible(), false);
        const before = await toggle.boundingBox();
        assert.ok(before.y + before.height <= height - 34, JSON.stringify(before));
        assert.ok(before.width >= 44 && before.height >= 44);
        const scrolled = await page.evaluate(() => {
          const list = document.getElementById("conversationItems");
          list.scrollTop = list.scrollHeight;
          return list.scrollTop > 0 && list.scrollHeight > list.clientHeight;
        });
        assert.equal(scrolled, true);
        assert.deepEqual(await toggle.boundingBox(), before);
        await toggle.tap();
        assert.equal(await toggle.getAttribute("aria-expanded"), "true");
        const menu = await panel.boundingBox();
        assert.ok(menu.y >= 0 && menu.y + menu.height <= before.y);
        if (width === 390) {
          const directory = path.resolve(__dirname, "../artifacts/mobile-chat");
          fs.mkdirSync(directory, { recursive: true });
          await page.screenshot({ path: path.join(directory, `${name}-contact-actions.png`) });
        }
        await page.locator("#addConversationButton").tap();
        assert.equal(await panel.isVisible(), false);
        assert.equal(await page.evaluate(() => actionClicks.contact), 1);
        await toggle.tap();
        await page.locator("#addGroupButton").tap();
        assert.equal(await panel.isVisible(), false);
        assert.equal(await page.evaluate(() => actionClicks.group), 1);
        await toggle.tap();
        await page.keyboard.press("Escape");
        assert.equal(await panel.isVisible(), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), "conversationActionsToggle");
        await toggle.tap();
        await page.locator("#conversationSearchInput").focus();
        assert.equal(await panel.isVisible(), false);
        await toggle.tap();
        await page.evaluate(() => document.body.classList.add("conversation-open"));
        assert.equal(await panel.isVisible(), false);
        await page.evaluate(() => document.body.classList.remove("conversation-open"));
        await page.evaluate(() => { document.getElementById("conversationItems").replaceChildren(); });
        assert.deepEqual(await toggle.boundingBox(), before, "Empty lists keep the plus at the same bottom position");
        await page.close();
      }
    } finally { await browser.close(); }
  });
}
