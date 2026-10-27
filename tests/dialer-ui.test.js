const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium, webkit, devices } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const origin = "https://dialer.teletyptel.test";
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

async function check(engine, device, name) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...device, serviceWorkers: "block" });
    const failures = [];
    const requests = [];
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.protocol === "blob:") return route.continue();
      requests.push(url.pathname);
      if (url.origin !== origin || request.method() !== "GET" || url.pathname.startsWith("/api/")) {
        failures.push("Unexpected request: " + url.pathname);
        return route.abort();
      }
      if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: html });
      const file = path.resolve(root, "." + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
        failures.push("Missing asset: " + url.pathname);
        return route.fulfill({ status: 404, body: "Not found" });
      }
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(origin + "/chat.html");
    await page.evaluate(() => {
      document.body.classList.remove("account-booting");
      document.body.dataset.theme = "light";
      document.getElementById("messageInput").value = "Unsent Messenger draft";
      window.mediaRequests = 0;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => { window.mediaRequests++; throw new Error("Unexpected media request"); };
      }
    });
    await page.addScriptTag({ url: origin + "/chat-dialer.js" });
    await page.addScriptTag({ url: origin + "/mobile-navigation.js" });
    const dialog = page.locator("#phoneDialerDialog");
    const input = page.locator("#phoneDialerNumber");
    const mobile = device.viewport.width <= 520;
    const open = async () => {
      if (mobile) await page.locator("#mobileActionsToggle").click();
      await page.locator("#phoneDialerButton").click();
      assert.equal(await dialog.evaluate((element) => element.open), true);
      assert.equal(await input.evaluate((element) => element === document.activeElement), true);
    };
    for (const language of ["eng", "ned"]) {
      const labels = Object.fromEntries(fs.readFileSync(path.join(root, "lang/" + language + ".lng"), "utf8")
        .split(/\r?\n/).filter((line) => line.includes("=")).map((line) => {
          const split = line.indexOf("=");
          return [line.slice(0, split), line.slice(split + 1)];
        }));
      await page.evaluate((labels) => {
        for (const element of document.querySelectorAll("[data-i18n]")) {
          if (labels[element.dataset.i18n]) element.textContent = labels[element.dataset.i18n];
        }
        for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
          if (labels[element.dataset.i18nAriaLabel]) element.setAttribute("aria-label", labels[element.dataset.i18nAriaLabel]);
        }
      }, labels);
      await open();
      assert.equal(await page.locator("#phoneDialerTitle").textContent(), labels["dialer.title"]);
      assert.equal(await page.locator("#phoneDialerCall").isDisabled(), true);
      await input.fill("+31 (20) 123-4567");
      assert.equal(await input.getAttribute("aria-invalid"), "false");
      for (const invalid of ["112", "0201234567", "sip:test@example.test", "+012345", "+1234567890123456", "+31<script>", "+31\t1234567"]) {
        await input.fill(invalid);
        assert.equal(await input.getAttribute("aria-invalid"), "true", invalid);
        assert.equal(await page.locator("#phoneDialerInvalid").isVisible(), true);
      }
      await input.fill("");
      for (const digit of ["+", "3", "1", "2", "0"]) await page.locator('[data-digit="' + digit + '"]').click();
      assert.equal(await input.inputValue(), "+3120");
      await input.evaluate((element) => element.setSelectionRange(3, 5));
      await page.locator('[data-digit="6"]').click();
      assert.equal(await input.inputValue(), "+316");
      await page.locator("#phoneDialerBackspace").click();
      assert.equal(await input.inputValue(), "+31");
      await input.fill("+31201234567");
      const requestCount = requests.length;
      await page.locator("#phoneDialerForm").evaluate((element) => element.requestSubmit());
      assert.equal(await dialog.evaluate((element) => element.open), true);
      assert.equal(requests.length, requestCount);
      assert.equal(await page.evaluate(() => window.mediaRequests), 0);
      assert.equal(await page.locator("#messageInput").inputValue(), "Unsent Messenger draft");
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= device.viewport.width);
      assert.equal(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
      await page.locator("#phoneDialerClose").focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
      if (language === "ned") await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-number-dialer-" + name + ".png") });
      await page.keyboard.press("Escape");
      assert.equal(await dialog.evaluate((element) => element.open), false);
      await page.waitForFunction(() => document.getElementById("phoneDialerNumber").value === "");
      const focusId = mobile ? "mobileActionsToggle" : "phoneDialerButton";
      await page.waitForFunction((id) => document.activeElement.id === id, focusId);
      await open();
      assert.equal(await input.inputValue(), "");
      await input.fill("+31201234567");
      await page.locator("#phoneDialerClose").click();
      await page.waitForFunction(() => document.getElementById("phoneDialerNumber").value === "");
    }
    await open();
    await input.fill("+31201234567");
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    assert.equal(await input.inputValue(), "");
    assert.equal(await dialog.evaluate((element) => element.open), false);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(failures, []);
    console.log("Number dialer passed: " + name + ", languages, editing, validation, focus, mobile layout, draft isolation and no calls/storage/media.");
  } finally {
    await browser.close();
  }
}

(async () => {
  await check(chromium, { viewport: { width: 1280, height: 900 } }, "desktop");
  await check(chromium, devices["Pixel 7"], "android");
  await check(webkit, devices["iPhone 13"], "iphone");
  await check(chromium, { viewport: { width: 320, height: 568 } }, "small");
})().catch((error) => { console.error(error); process.exitCode = 1; });
