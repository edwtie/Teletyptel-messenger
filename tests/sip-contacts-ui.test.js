const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const publicRoot = path.resolve(__dirname, "../php/public");
const origin = "https://sip-directory.teletyptel.test";
const html = fs.readFileSync(path.join(publicRoot, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

test("web switches XMPP and SIP below the scrollable list, saves both kinds, and clears account data on sign-out", { timeout: 30000 }, async () => {
  const browser = await chromium.launch({ timeout: 10000 });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(7000);
    const failures = [];
    page.on("pageerror", error => failures.push(error.message));
    await page.route("**/*", async request => {
      const url = new URL(request.request().url());
      if (url.origin !== origin || url.pathname.startsWith("/api/")) {
        failures.push("Unexpected network request");
        return request.abort();
      }
      if (url.pathname === "/chat.html") return request.fulfill({ contentType: "text/html", body: html });
      const file = path.resolve(publicRoot, "." + url.pathname);
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file)) return request.abort();
      await request.fulfill({ path: file });
    });
    await page.goto(origin + "/chat.html");
    await page.addScriptTag({ url: origin + "/chat-sip-contacts.js" });
    await page.addScriptTag({ url: origin + "/chat-dialer.js" });
    await page.evaluate(() => {
      document.body.classList.remove("account-booting", "account-gate");
      const list = document.getElementById("conversationItems");
      for (let index = 0; index < 40; index++) {
        const row = document.createElement("button");
        row.className = "conversation-item";
        row.textContent = "XMPP fixture " + index;
        list.append(row);
      }
      window.directoryFixture = window.TeleTypTelSipContacts.mount(document, (key, fallback) => fallback);
    });
    const xmpp = page.locator("#selectXmppDirectory");
    const sip = page.locator("#selectSipDirectory");
    const panel = page.locator("#sipDirectory");
    assert.ok(await sip.isDisabled());
    await page.evaluate(() => window.directoryFixture.setAccount("fixture-account"));
    for (const [width, height] of [[390, 844], [844, 390], [1400, 900]]) {
      await page.setViewportSize({ width, height });
      const list = await page.locator("#conversationItems").boundingBox();
      const xmppTab = await xmpp.boundingBox();
      const sipTab = await sip.boundingBox();
      assert.ok(list && xmppTab && sipTab && xmppTab.y >= list.y + list.height - 1);
      assert.ok(Math.abs(sipTab.y - xmppTab.y) <= 1 && sipTab.y + sipTab.height <= height);
    }
    await sip.press("Enter");
    assert.equal(await sip.getAttribute("aria-pressed"), "true");
    assert.ok(await page.locator("#conversationItems").isHidden());
    for (const [name, value, expected] of [["Lokale test", "+31 (70) 123-4567", "+31701234567"], ["Gebarentolk", "Tolk@Provider.test", "Tolk@provider.test"]]) {
      await panel.getByRole("button", { name: "Add SIP contact" }).click();
      await panel.getByLabel("Name", { exact: true }).fill(name);
      await panel.getByLabel("Phone number or SIP address").fill(value);
      await panel.getByRole("button", { name: "Save" }).click();
      await panel.getByText(expected, { exact: true }).waitFor();
    }
    await panel.getByRole("button", { name: "Edit: Gebarentolk" }).click();
    await panel.getByLabel("Name", { exact: true }).fill("Tolk");
    await panel.getByRole("button", { name: "Save" }).click();
    await panel.getByRole("button", { name: "Remove: Tolk" }).click();
    assert.ok(await panel.getByText("Tolk@provider.test", { exact: true }).isHidden());
    await panel.getByRole("button", { name: "Open keypad" }).click();
    await page.locator("#phoneDialerDialog").waitFor({ state: "visible" });
    await page.locator("#phoneDialerClose").click();
    await xmpp.click();
    assert.equal(await xmpp.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#conversationItems .conversation-item").count(), 40);
    await page.evaluate(() => window.directoryFixture.setAccount("another-account"));
    await sip.click();
    assert.equal(await panel.locator("li").count(), 0);
    await page.evaluate(() => window.directoryFixture.setAccount(""));
    assert.ok(await sip.isDisabled());
    assert.ok(await panel.isHidden());
    await page.evaluate(() => window.directoryFixture.setAccount("fixture-account"));
    await sip.click();
    assert.equal(await panel.getByText("+31701234567", { exact: true }).count(), 1);
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
  }
});
