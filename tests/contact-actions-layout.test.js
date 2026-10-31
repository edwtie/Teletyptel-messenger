const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: compact conversation buttons have separate touch targets in one row`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.route("**/*", route => route.abort());
      await page.setContent(markup);
      await page.addStyleTag({ content: fs.readFileSync(path.join(root, "chat-client.css"), "utf8") });
      const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
      const iconStart = client.indexOf("  const materialIcons = {");
      const icons = client.slice(iconStart, client.indexOf("\n  };", iconStart) + 5);
      const renderer = client.slice(client.indexOf("  function createMaterialIcon("), client.indexOf("  function createScreenReaderText("));
      await page.addScriptTag({ content: icons + renderer + "renderMaterialIcons();" });
      await page.evaluate(() => {
        document.body.className = "viewport-phone conversation-open";
        document.body.dataset.theme = "light";
        document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
        document.getElementById("activeConversationName").textContent = "Contact met een heel lange naam";
        document.getElementById("hangupCallButton").hidden = true;
        window.headerTaps = [];
        for (const id of ["startTotalCallOption", "interpreterButton"]) {
          const button = document.getElementById(id);
          button.disabled = false;
          button.addEventListener("click", () => window.headerTaps.push(id));
        }
      });
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      for (const width of [320, 375, 390, 430, 520]) {
        await page.setViewportSize({ width, height: 844 });
        const buttons = ["startTotalCallOption", "interpreterButton", "chatMoreToggle"].map(id => page.locator("#" + id));
        const boxes = await Promise.all(buttons.map(button => button.boundingBox()));
        for (const [index, box] of boxes.entries()) {
          assert.ok(box && box.width >= 44 && box.height >= 44, JSON.stringify({ width, index, box }));
          assert.ok(box.x >= 0 && box.x + box.width <= width);
          assert.ok(Math.abs(box.y - boxes[0].y) < 1, "Controls stay in one row");
          if (index) assert.ok(box.x - (boxes[index - 1].x + boxes[index - 1].width) >= 7.9, "At least 8px between touch targets");
        }
        const title = await page.locator(".chat-title").boundingBox();
        assert.ok(title.x + title.width <= boxes[0].x, "Long names cannot overlap the TC button");
        await buttons[0].tap();
        await buttons[1].tap();
        assert.deepEqual(await page.evaluate(() => window.headerTaps.splice(0)), ["startTotalCallOption", "interpreterButton"]);
        await buttons[2].tap();
        assert.equal(await page.locator("#chatMorePanel").isVisible(), true);
        await page.keyboard.press("Escape");
        if (width === 390) {
          const directory = path.resolve(__dirname, "../artifacts/mobile-chat");
          fs.mkdirSync(directory, { recursive: true });
          await page.screenshot({ path: path.join(directory, `${name}-chat-button-spacing.png`) });
        }
      }
    } finally { await browser.close(); }
  });

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
