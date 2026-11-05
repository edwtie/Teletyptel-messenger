const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: hold selects phone-number letters without sending RTT or DTMF`, { timeout: 60000 }, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => route.abort());
      await page.setContent(markup);
      for (const file of ["chat-client.css", "chat-dialer.css"]) await page.addStyleTag({ path: path.join(root, file) });
      await page.evaluate(() => {
        document.body.className = "";
        document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
        document.getElementById("messageInput").value = "Unsent chat";
        document.getElementById("totalConversationLocalText").value = "Unsent RTT";
      });
      await page.addScriptTag({ path: path.join(root, "chat-dialer.js") });
      await page.locator("#phoneDialerButton").evaluate(element => element.click());
      const input = page.locator("#phoneDialerNumber");
      const key = digit => page.locator(`[data-digit="${digit}"]`);
      const hold = async digit => {
        const bounds = await key(digit).boundingBox();
        await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await page.mouse.down();
      };
      await key("2").tap();
      assert.equal(await input.inputValue(), "2");
      await input.fill("+31");
      await hold("2");
      for (const expected of ["A", "B", "C", "2", "A"]) {
        await page.waitForFunction(expected => document.querySelector('[data-digit="2"] > span').textContent === expected, expected);
        assert.equal(await key("2").locator("span").first().textContent(), expected);
        assert.equal(await input.inputValue(), "+31");
      }
      await page.mouse.up();
      assert.equal(await input.inputValue(), "+31A");
      assert.equal(await input.getAttribute("aria-invalid"), "false");
      assert.equal(await key("2").locator("span").first().textContent(), "2");
      await key("2").tap();
      assert.equal(await input.inputValue(), "+31A2");
      await input.focus();
      await input.evaluate(element => element.setSelectionRange(3, 5));
      await hold("7");
      await page.waitForFunction(() => document.querySelector('[data-digit="7"] > span').textContent === "S");
      assert.equal(await key("7").locator("span").first().textContent(), "S");
      await page.mouse.up();
      assert.equal(await input.inputValue(), "+31S");
      await hold("3");
      await page.waitForTimeout(550);
      await page.mouse.move(0, 0);
      await page.mouse.up();
      assert.equal(await input.inputValue(), "+31S");
      await hold("4");
      await page.waitForTimeout(550);
      await key("4").dispatchEvent("pointercancel", { pointerId: 1 });
      await page.mouse.up();
      assert.equal(await input.inputValue(), "+31S");
      await hold("5");
      await page.waitForTimeout(550);
      await page.evaluate(() => window.dispatchEvent(new Event("resize")));
      await page.waitForTimeout(1200);
      await page.mouse.up();
      assert.equal(await input.inputValue(), "+31S");
      await key("2").focus();
      await page.keyboard.press("Enter");
      assert.equal(await input.inputValue(), "+31S2");
      await input.fill("+31" + "2".repeat(37));
      await hold("2");
      await page.waitForTimeout(550);
      await page.mouse.up();
      assert.equal((await input.inputValue()).length, 40);
      for (const [value, valid] of [["+1800FLOWERS", true], ["+31foo@bar", false], ["+31<script>", false]]) {
        await input.fill(value);
        assert.equal(await input.getAttribute("aria-invalid"), String(!valid));
      }
      await hold("9");
      await page.waitForTimeout(550);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await page.waitForTimeout(1000);
      assert.equal(await input.inputValue(), "");
      assert.equal(await key("9").locator("span").first().textContent(), "9");
      assert.equal(await page.locator("#messageInput").inputValue(), "Unsent chat");
      assert.equal(await page.locator("#totalConversationLocalText").inputValue(), "Unsent RTT");
      assert.equal(await page.locator("#phoneDialerCall").isDisabled(), true);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
