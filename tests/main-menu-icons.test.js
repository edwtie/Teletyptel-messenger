const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const icons = client.slice(client.indexOf("  const materialIcons ="), client.indexOf("  const sessionProfile ="));
const iconFunctions = client.slice(client.indexOf("  function createMaterialIcon("), client.indexOf("  function createScreenReaderText("));

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: main menu uses accessible symbols in both orientations`, { timeout: 60000 }, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ hasTouch: true, viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => route.abort());
      await page.setContent(markup);
      for (const file of ["chat-client.css", "chat-tablet.css", "call-controls-menu.css"]) {
        await page.addStyleTag({ path: path.join(root, file) });
      }
      await page.evaluate(source => new Function(source + "; renderMaterialIcons();")(), icons + iconFunctions);
      await page.evaluate(() => {
        document.body.className = "device-ios device-phone viewport-phone";
        document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
        for (const identifier of ["newsButton", "supportButton"]) document.getElementById(identifier).hidden = false;
        window.historyClicks = 0;
        document.getElementById("historyButton").addEventListener("click", () => { window.historyClicks += 1; });
      });
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      for (const [device, width, height] of [
        ["phone", 320, 568], ["phone", 390, 844], ["phone", 844, 390],
        ["tablet", 834, 1194], ["tablet", 1194, 834]
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(({ device }) => {
          document.body.classList.remove("device-phone", "viewport-phone", "device-tablet", "viewport-tablet");
          document.body.classList.add(`device-${device}`, `viewport-${device}`);
          document.body.dataset.deviceClass = device;
        }, { device });
        await page.waitForTimeout(50);
        const toggle = page.locator("#mobileActionsToggle");
        await toggle.click();
        assert.equal(await toggle.getAttribute("aria-expanded"), "true");
        const buttons = await page.locator("#mobileActionsPanel .top-icon-button").evaluateAll(elements => elements
          .filter(element => element.getClientRects().length)
          .map(element => {
            const bounds = element.getBoundingClientRect();
            const label = element.querySelector(".sr-only");
            return {
              name: element.getAttribute("aria-label"), title: element.title,
              width: bounds.width, height: bounds.height,
              symbol: !!element.querySelector("svg, .contrast-symbol"),
              clipped: !label || (getComputedStyle(label).position === "absolute" && label.getBoundingClientRect().width <= 1)
            };
          }));
        assert.equal(buttons.length, 10);
        for (const button of buttons) {
          assert.ok(button.name && button.title && button.symbol && button.clipped, JSON.stringify(button));
          assert.ok(button.width >= 44 && button.height === 48, JSON.stringify(button));
        }
        const panel = await page.locator("#mobileActionsPanel").boundingBox();
        assert.ok(panel.x >= 0 && panel.x + panel.width <= width && panel.y + panel.height <= height);
        await page.locator("#viewMenu summary").click();
        assert.equal(await page.locator("#chatBackgroundInput").isVisible(), true);
        await page.keyboard.press("Escape");
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
        await toggle.click();
        await page.locator("#historyButton").click();
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      }
      assert.equal(await page.evaluate(() => window.historyClicks), 5);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
