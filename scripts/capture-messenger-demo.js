const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit, devices } = require("playwright");

const publicRoot = path.resolve(__dirname, "../php/public");
const output = path.join(publicRoot, "assets/demo");
const origin = "https://demo.teletyptel.test";
const account = {
  accountId: "demo-sam", jid: "sam@example.test", displayName: "Sam (demo)",
  providerId: "example-provider", preferredLanguage: "ned", peer: "noor@example.test",
  password: "", rememberPassword: false, liveRttEnabled: true, showSmileys: true,
  xmppWebSocket: "wss://demo.teletyptel.test/websocket", xmppDomain: "example.test"
};
const conversation = [
  ["peer", "Hoi Sam! Zullen we morgen samen koffie drinken?"],
  ["self", "Ja, gezellig. Om 11 uur?"],
  ["peer", "Helemaal goed. Fijn dat we zo kunnen afspreken."],
  ["self", "Tot morgen! Dit is een voorbeeldgesprek voor de demo."]
].map(([direction, text], index) => ({
  conversationPeer: "noor@example.test", conversationName: "Noor (demo)", conversationKind: "contact",
  messageId: "demo-" + index, direction, text, status: "history",
  from: direction === "peer" ? "noor@example.test" : "sam@example.test",
  timestamp: "2026-09-29T09:" + (20 + index) + ":00Z"
}));

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const iphoneBrowser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", locale: "nl-NL", colorScheme: "light" });
    const iphoneContext = await iphoneBrowser.newContext({ ...devices["iPhone 13"], locale: "nl-NL", colorScheme: "light", serviceWorkers: "block" });
    const androidContext = await browser.newContext({ ...devices["Pixel 7"], locale: "nl-NL", colorScheme: "light", serviceWorkers: "block" });
    const errors = [];
    for (const targetContext of [context, iphoneContext, androidContext]) {
    await targetContext.routeWebSocket("**/*", (socket) => socket.close());
    await targetContext.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (route.request().method() !== "GET") return route.fulfill({ status: 403, json: { ok: false, error: "read_only_demo" } });
      if (url.pathname === "/config/account-profile.json") return route.fulfill({ json: account });
      if (url.pathname === "/config/google-maps.json") return route.fulfill({ json: {} });
      if (url.pathname === "/api/account.php") return route.fulfill({ json: { ok: true, account: null } });
      if (url.pathname === "/api/translation.php") return route.fulfill({ json: { ok: true, accountId: account.accountId,
        available: false, provider: "Google Cloud Translation", csrfToken: "fixture", languages: { nl: "Nederlands", en: "English", de: "Deutsch" },
        preferences: { targetLanguage: "nl", mode: "manual", automaticConsent: false } } });
      if (url.pathname === "/api/history.php") return route.fulfill({ json: { ok: true, messages: conversation, calls: [] } });
      if (url.pathname === "/api/group-metadata.php") return route.fulfill({ json: { ok: true, groups: [] } });
      if (url.pathname === "/api/rtc-config.php") return route.fulfill({ json: { iceServers: [] } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 403, json: { ok: false } });
      const file = path.resolve(publicRoot, "." + decodeURIComponent(url.pathname));
      const extension = path.extname(file);
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || ![".html", ".js", ".css", ".json", ".lng", ".png", ".gif", ".svg", ".ico", ".webmanifest"].includes(extension)) {
        return route.fulfill({ status: 404, body: "Not found" });
      }
      const contentType = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
        ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".ico": "image/x-icon" }[extension] || "text/plain";
      return route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    await targetContext.addInitScript((profile) => {
      localStorage.setItem("teletyptel.theme", "light");
      sessionStorage.setItem("teletyptel.serverAccountSession", JSON.stringify(profile));
    }, account);
    }
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(origin + "/chat.html");
    await page.waitForFunction(() => !document.body.classList.contains("account-booting"));
    assert.equal(await page.locator("#newsButton").getAttribute("aria-label"), "Nieuws");
    assert.equal(await page.locator("#newsButton .material-icon svg").count(), 1);
    assert.ok(await page.locator("#newsButton").evaluate((element) => element.classList.contains("top-icon-button")));
    await page.locator(".conversation-item").filter({ hasText: "Noor (demo)" }).click();
    await page.getByText(conversation[3].text, { exact: true }).waitFor();
    assert.equal(await page.locator("#accountDialog").isVisible(), false);
    await page.screenshot({ path: path.join(output, "messenger-desktop.png") });
    const iphone = await iphoneContext.newPage();
    iphone.on("pageerror", (error) => errors.push(error.message));
    await iphone.goto(origin + "/chat.html");
    await iphone.waitForFunction(() => !document.body.classList.contains("account-booting"));
    await iphone.locator(".conversation-item").filter({ hasText: "Noor (demo)" }).tap();
    await iphone.getByText(conversation[3].text, { exact: true }).waitFor();
    assert.equal(await iphone.evaluate(() => document.body.dataset.platform), "ios");
    for (const width of [390, 375, 320]) {
      await iphone.setViewportSize({ width, height: 664 });
      assert.equal(await iphone.locator("#mobileActionsPanel").isVisible(), false);
      const header = await iphone.locator(".topbar").boundingBox();
      assert.ok(header.height <= 70, "iPhone header remains one compact row");
      const chatHeader = await iphone.locator(".chat-header").boundingBox();
      assert.ok(chatHeader.height <= 65, "Conversation heading stays one row at " + width);
      assert.equal(await iphone.locator("#startAudioCallOption").isVisible(), false);
      assert.equal(await iphone.locator("#startVideoCallOption").isVisible(), false);
      assert.equal(await iphone.locator("#startTotalCallOption .rtt-primary-label").count(), 0);
      assert.equal(await iphone.locator("#startTotalCallOption .material-icon svg").isVisible(), true);
      assert.match(await iphone.locator("#startTotalCallOption").getAttribute("aria-label"), /RTT/);
      assert.equal(await iphone.locator("#startTotalCallOption").evaluate((element) => getComputedStyle(element).color === getComputedStyle(element.querySelector("svg")).color), true, "RTT symbol matches its label contrast");
      const callButtons = await iphone.locator("#startTotalCallOption, #chatMoreToggle").evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { center: box.y + box.height / 2, left: box.left, right: box.right, width: box.width, height: box.height };
        }));
      assert.ok(callButtons.every((box) => Math.abs(box.center - callButtons[0].center) < 1 && box.left >= 0 && box.right <= width && box.width >= 44 && box.height >= 44), "Single-row touch targets at " + width + ": " + JSON.stringify(callButtons));
      await iphone.locator("#chatMoreToggle").tap();
      assert.equal(await iphone.locator("#chatMoreToggle").getAttribute("aria-expanded"), "true");
      assert.equal(await iphone.locator("#chatMorePanel #startAudioCallOption").isVisible(), true);
      assert.equal(await iphone.locator("#chatMorePanel #startVideoCallOption").isVisible(), true);
      assert.equal(await iphone.locator(".call-mode-buttons #startTotalCallOption").isVisible(), true);
      assert.equal(await iphone.locator("#chatMorePanel #resetRttButton").isVisible(), true);
      assert.equal(await iphone.locator("#chatMorePanel #enableRttButton").isVisible(), false);
      const moreBox = await iphone.locator("#chatMorePanel").boundingBox();
      assert.ok(moreBox.x >= 0 && moreBox.x + moreBox.width <= width + 1);
      await iphone.keyboard.press("Escape");
      assert.equal(await iphone.locator("#chatMorePanel").isVisible(), false);
      assert.equal(await iphone.evaluate(() => document.activeElement.id), "chatMoreToggle");
      await iphone.locator("#mobileActionsToggle").tap();
      assert.equal(await iphone.locator("#mobileActionsToggle").getAttribute("aria-expanded"), "true");
      const clipped = await iphone.locator(".top-actions > button:visible, .top-actions > details > summary:visible, .message-reaction-button:visible, #messageInput").evaluateAll((elements) =>
        elements.filter((element) => {
          const box = element.getBoundingClientRect();
          return box.left < 0 || box.right > innerWidth + 1;
        }).map((element) => element.id || element.tagName));
      assert.deepEqual(clipped, [], "iPhone controls fit at " + width);
      assert.equal(await iphone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const composer = await iphone.locator("#composerForm").boundingBox();
      assert.ok(composer.y >= 0 && composer.y + composer.height <= 665, "Composer fits in iPhone viewport");
      await iphone.keyboard.press("Escape");
      assert.equal(await iphone.locator("#mobileActionsPanel").isVisible(), false);
      assert.equal(await iphone.evaluate(() => document.activeElement.id), "mobileActionsToggle");
    }
    await iphone.setViewportSize({ width: 390, height: 664 });
    await iphone.locator("#messageTimeline").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await iphone.screenshot({ path: path.join(output, "messenger-mobile.png") });
    await iphone.locator("#chatMoreToggle").tap();
    await iphone.screenshot({ path: path.join(output, "messenger-iphone-chat-menu.png") });
    await iphone.locator("#messageInput").tap();
    assert.equal(await iphone.locator("#chatMorePanel").isVisible(), false);
    await iphone.setViewportSize({ width: 900, height: 664 });
    await iphone.waitForFunction(() => !document.body.classList.contains("compact-chat-header"));
    assert.equal(await iphone.locator(".call-mode-buttons #startTotalCallOption").count(), 1);
    assert.equal(await iphone.locator(".call-mode-buttons #startAudioCallOption").count(), 1);
    assert.equal(await iphone.locator(".call-mode-buttons #startVideoCallOption").count(), 1);
    assert.equal(await iphone.locator(".call-controls #resetRttButton").count(), 1);
    assert.equal(await iphone.locator("#chatMoreToggle").isVisible(), false);
    await iphone.setViewportSize({ width: 390, height: 664 });
    await iphone.waitForFunction(() => document.body.classList.contains("compact-chat-header"));
    await iphone.evaluate(() => document.body.classList.add("call-active"));
    await iphone.waitForFunction(() => !document.body.classList.contains("compact-chat-header"));
    assert.equal(await iphone.locator(".call-mode-buttons #startTotalCallOption").count(), 1);
    assert.equal(await iphone.locator(".call-mode-buttons #startAudioCallOption").count(), 1);
    assert.equal(await iphone.locator(".call-mode-buttons #startVideoCallOption").count(), 1);
    assert.equal(await iphone.locator(".call-controls #resetRttButton").count(), 1);
    await iphone.evaluate(() => document.body.classList.remove("call-active"));
    await iphone.waitForFunction(() => document.body.classList.contains("compact-chat-header"));
    assert.equal(await iphone.locator("#chatMorePanel #resetRttButton").count(), 1);
    assert.equal(await iphone.locator("#resetRttButton").count(), 1);
    for (const controlId of ["answerCallButton", "hangupCallButton"]) {
      await iphone.locator("#" + controlId).evaluate((element) => { element.hidden = false; });
      await iphone.waitForFunction(() => !document.body.classList.contains("compact-chat-header"));
      assert.equal(await iphone.locator(".call-controls #resetRttButton").count(), 1);
      assert.equal(await iphone.locator("#callStatus").evaluate((element) => getComputedStyle(element).position), "static");
      await iphone.locator("#" + controlId).evaluate((element) => { element.hidden = true; });
      await iphone.waitForFunction(() => document.body.classList.contains("compact-chat-header"));
    }
    await iphone.locator("#backToContactsButton").tap();
    await iphone.locator(".conversation-list").waitFor();
    await iphone.screenshot({ path: path.join(output, "messenger-iphone-contacts.png") });
    await iphone.locator(".conversation-item").filter({ hasText: "Noor (demo)" }).tap();
    await iphone.locator("#mobileActionsToggle").tap();
    await iphone.locator("#viewMenu summary").tap();
    const menuBox = await iphone.locator(".top-menu-panel").boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= 391, "iPhone display menu fits");
    await iphone.locator("#viewMenu summary").tap();
    await iphone.screenshot({ path: path.join(output, "messenger-iphone-menu.png") });
    await iphone.locator("#messageInput").tap();
    assert.equal(await iphone.locator("#mobileActionsPanel").isVisible(), false);
    await iphone.setViewportSize({ width: 390, height: 440 });
    const reducedComposer = await iphone.locator("#composerForm").boundingBox();
    assert.ok(reducedComposer.y + reducedComposer.height <= 441, "Composer fits a reduced viewport");
    await iphone.setViewportSize({ width: 390, height: 664 });
    await iphone.locator("#mobileActionsToggle").tap();
    await iphone.locator("#newsButton").tap();
    assert.equal(await iphone.locator("#mobileActionsPanel").isVisible(), false);
    assert.ok(await iphone.locator("#newsButton").evaluate((element) => element.classList.contains("selected")));
    const android = await androidContext.newPage();
    android.on("pageerror", (error) => errors.push(error.message));
    await android.goto(origin + "/chat.html");
    await android.waitForFunction(() => !document.body.classList.contains("account-booting"));
    await android.locator(".conversation-item").filter({ hasText: "Noor (demo)" }).tap();
    await android.getByText(conversation[3].text, { exact: true }).waitFor();
    assert.equal(await android.evaluate(() => document.body.dataset.platform), "android");
    for (const width of [412, 393, 360, 320]) {
      await android.setViewportSize({ width, height: 720 });
      await android.waitForFunction(() => document.body.classList.contains("compact-chat-header"));
      assert.ok((await android.locator(".chat-header").boundingBox()).height <= 65, "Android conversation heading stays one row");
      assert.equal(await android.locator("#startTotalCallOption .rtt-primary-label").count(), 0);
      assert.equal(await android.locator("#startTotalCallOption .material-icon svg").isVisible(), true);
      assert.match(await android.locator("#startTotalCallOption").getAttribute("aria-label"), /RTT/);
      assert.equal(await android.locator("#startAudioCallOption").isVisible(), false);
      assert.equal(await android.locator("#startVideoCallOption").isVisible(), false);
      const targets = await android.locator("#startTotalCallOption, #chatMoreToggle").evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { center: box.y + box.height / 2, left: box.left, right: box.right, width: box.width, height: box.height };
      }));
      assert.ok(targets.every((box) => Math.abs(box.center - targets[0].center) < 1 && box.left >= 0 && box.right <= width && box.width >= 44 && box.height >= 44), "Android touch targets fit at " + width);
      await android.locator("#chatMoreToggle").tap();
      assert.equal(await android.locator("#chatMorePanel #startAudioCallOption").isVisible(), true);
      assert.equal(await android.locator("#chatMorePanel #startVideoCallOption").isVisible(), true);
      const menu = await android.locator("#chatMorePanel").boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1);
      await android.locator("#messageInput").tap();
      assert.equal(await android.locator("#chatMorePanel").isVisible(), false);
      const composer = await android.locator("#composerForm").boundingBox();
      assert.ok(composer.y >= 0 && composer.y + composer.height <= 721);
      assert.equal(await android.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await android.locator("#mobileActionsToggle").tap();
      assert.equal(await android.locator("#newsButton").isVisible(), true);
      await android.keyboard.press("Escape");
      assert.equal(await android.locator("#mobileActionsPanel").isVisible(), false);
    }
    await android.setViewportSize({ width: 412, height: 720 });
    await android.locator("#messageInput").evaluate((element) => element.blur());
    await android.locator("#messageTimeline").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await android.screenshot({ path: path.join(output, "messenger-android.png") });
    await android.locator("#chatMoreToggle").tap();
    await android.screenshot({ path: path.join(output, "messenger-android-chat-menu.png") });
    await android.keyboard.press("Escape");
    await android.locator("#backToContactsButton").tap();
    await android.locator(".conversation-list").waitFor();
    await android.locator(".conversation-item").filter({ hasText: "Noor (demo)" }).tap();
    await android.setViewportSize({ width: 412, height: 440 });
    await android.waitForFunction(() => {
      const composer = document.getElementById("composerForm").getBoundingClientRect();
      return composer.y >= 0 && composer.bottom <= innerHeight + 1;
    });
    const androidComposer = await android.locator("#composerForm").boundingBox();
    assert.ok(androidComposer.y + androidComposer.height <= 441, "Android composer fits reduced viewport");
    await page.locator("#accountButton").click();
    await page.locator('[data-account-panel="accessibility"]').click();
    await page.locator("#dialogAccessibilityPanel").waitFor();
    await page.screenshot({ path: path.join(output, "messenger-accessibility.png") });
    await page.locator('[data-account-panel="preferences"]').click();
    await page.locator('[data-settings-panel="preferences"]').waitFor();
    assert.equal(await page.locator("#translationTarget").isDisabled(), false);
    assert.equal(await page.locator("#translationMode").inputValue(), "manual");
    assert.match(await page.locator("#translationSettingsStatus").innerText(), /nog geen vertaaldienst/);
    await page.screenshot({ path: path.join(output, "messenger-preferences.png") });
    assert.deepEqual(errors, []);
    console.log("Captured the unmodified Messenger UI with isolated fixture data. No live accounts, messages, calls or medical data accessed. Output: " + output);
  } finally {
    await browser.close();
    await iphoneBrowser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
