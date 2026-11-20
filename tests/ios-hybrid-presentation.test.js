const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { chromium, webkit } = require("playwright");
const { createContent, element } = require("../scripts/ios-hybrid/build-content");
const { baseline, readReference } = require("../scripts/ios-hybrid/check-baseline");
const content = createContent();
const html = Buffer.from(content.files["chat.html"].base64, "base64").toString("utf8");

test("hybrid login reuses pinned markup styling and symbols without shipping web engines", () => {
  assert.equal(content.revision, baseline.revision);
  for (const name of ["chat-client.css", "xmpp-availability.css"]) {
    assert.equal(crypto.createHash("sha256").update(Buffer.from(content.files[name].base64, "base64")).digest("hex"),
      crypto.createHash("sha256").update(readReference(name)).digest("hex"));
  }
  const original = readReference("chat.html").toString("utf8");
  assert.ok(html.includes(element(original, /<section\b[^>]*\bclass="modal-section account-auth-section"[^>]*>/)));
  assert.match(html, /id="dialogServerSettingsButton"[\s\S]*?<svg viewBox="0 -960 960 960"/);
  assert.match(html, /connect-src 'none'/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), ["ui-language.js", "native-session.js", "login-presentation.js", "contacts-presentation.js"]);
  assert.match(html, /id="conversationSidebar"/);
  assert.match(html, /id="conversationSearchInput"/);
  for (const name of Object.keys(content.files)) assert.doesNotMatch(name, /chat-client\.js|jingle|native-server|config|php|demo/i);
  assert.throws(() => element("<div id=missing>", /<section>/), /Missing/);
});

async function setup(engine, viewport = { width: 390, height: 844 }) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      let sequence = 0;
      window.nativeCommands = [];
      window.nativeSettingsCount = 0;
      const state = phase => ({ version: 1, sequence: ++sequence, phase, errorCode: null,
        chatAvailable: false, callsAvailable: false, socialLoginAvailable: false, settingsAvailable: true,
        roster: { status: phase === "connected" ? "loading" : "hidden", contacts: [] } });
      window.nativeState = state("idle");
      window.emitNative = (phase, errorCode = null) => {
        window.nativeState = { ...state(phase), errorCode };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.emitRoster = (contacts, status = "ready") => {
        window.nativeState = { ...state("connected"), roster: { status, contacts } };
        window.nativeFixtureClient.receive(window.nativeState);
      };
      window.module = {};
      Object.defineProperty(window.module, "exports", { get: () => ({}), set(factory) {
        const client = factory.createClient({ makeID: () => crypto.randomUUID(), postMessage: body => {
          const command = JSON.parse(body);
          window.nativeCommands.push(command);
          if (command.command === "session.login") window.nativeState = state("checking");
          if (command.command === "session.verifySecondFactor") window.nativeState = state("authenticating");
          if (command.command === "session.cancel") window.nativeState = state("idle");
          if (command.command === "session.logout") window.nativeState = state("signedOut");
          if (command.command === "app.openSettings") window.nativeSettingsCount += 1;
          return Promise.resolve({ version: 1, id: command.id, snapshot: window.nativeState });
        } });
        window.nativeFixtureClient = client;
        window.TeleTypTelNativeSession = client;
        delete window.module;
      } });
    });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      requests.push(url.href);
      const file = content.files[url.pathname === "/" ? "chat.html" : url.pathname.slice(1)];
      if (url.origin !== "https://hybrid.fixture.test" || !file) return route.abort();
      return route.fulfill({ contentType: file.mime + (file.mime.startsWith("text/") ? "; charset=utf-8" : ""),
        body: Buffer.from(file.base64, "base64") });
    });
    await page.goto("https://hybrid.fixture.test/chat.html");
    await page.locator("#accountDialog").waitFor({ state: "visible", timeout: 5000 });
    return { browser, page, errors, requests };
  } catch (error) { await browser.close(); throw error; }
}

for (const engine of [chromium, webkit]) {
  test(engine.name() + ": login native states two-factor errors settings and logout", { timeout: 45000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      assert.equal(await page.locator("#accountDialogTitle").textContent(), "Aanmelden");
      assert.equal(await page.evaluate(() => document.activeElement.tagName), "BODY");
      assert.equal(await page.locator("#dialogConnectButton").isDisabled(), true);
      assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isVisible(), true);
      assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isDisabled(), true);
      assert.equal(await page.locator("#dialogFacebookLoginButton").isDisabled(), true);
      assert.equal(await page.locator("#dialogRememberPasswordToggle").isChecked(), false);
      await page.locator("#dialogServerSettingsButton").click();
      assert.equal(await page.evaluate(() => window.nativeSettingsCount), 1);
      assert.equal(await page.locator("input[type=url], input[name=server], #dialogXmppDomainInput").count(), 0);
      await page.locator("#dialogJidInput").fill("fixture@localhost");
      await page.locator("#dialogPasswordInput").fill("fixture-password");
      await page.locator("#dialogConnectButton").click();
      await page.locator("#hybridStartup[open]").waitFor({ state: "visible" });
      assert.match(await page.locator("#hybridStartupStatus").textContent(), /Chatserver controleren/);
      assert.equal(await page.locator("#dialogPasswordInput").inputValue(), "");
      assert.equal(await page.evaluate(() => window.nativeCommands.filter(value => value.command === "session.login").length), 1);
      await page.evaluate(() => window.emitNative("failed", "certificate"));
      assert.match(await page.locator("#hybridStartupStatus").textContent(), /certificaat/);
      assert.equal(await page.locator("#hybridProgress").isVisible(), false);
      await page.locator("#hybridBack").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#dialogJidInput").inputValue(), "fixture@localhost");
      await page.locator("#dialogPasswordInput").fill("fixture-password");
      await page.locator("#dialogPasswordInput").press("Enter");
      await page.evaluate(() => window.emitNative("awaitingSecondFactor"));
      await page.locator("#loginTwoFactorSection").waitFor({ state: "visible" });
      assert.notEqual(await page.evaluate(() => document.activeElement.id), "loginTwoFactorCodeInput");
      await page.locator("#loginTwoFactorCodeInput").fill("000000");
      await page.locator("#verifyLoginTwoFactorButton").click();
      await page.evaluate(() => window.emitNative("awaitingSecondFactor", "invalidSecondFactor"));
      assert.match(await page.locator("#dialogAccountStatus").textContent(), /code is niet juist/);
      await page.locator("#loginTwoFactorCodeInput").fill("123456");
      await page.locator("#verifyLoginTwoFactorButton").click();
      await page.evaluate(() => window.emitNative("connected"));
      await page.locator("#hybridConnected").waitFor({ state: "visible" });
      assert.equal(await page.locator("#hybridStartup[open]").count(), 0);
      await page.locator("#hybridLogout").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#loginTwoFactorCodeInput").inputValue(), "");
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
      assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
      assert.equal(requests.some(url => /\/api\/|facebook\.com|google\.com|chat-client\.js|jingle/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": iPhone and iPad rotation preserve form and keyboard focus is not forced", { timeout: 45000 }, async () => {
    const { browser, page, errors } = await setup(engine);
    try {
      await page.locator("#dialogJidInput").fill("fixture@localhost");
      await page.locator("#dialogPasswordInput").fill("rotation-fixture");
      await page.locator("#dialogPasswordInput").blur();
      for (const [width, height] of [[390, 844], [844, 390], [834, 1194], [1194, 834], [390, 410]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator("#dialogPasswordInput").inputValue(), "rotation-fixture");
        assert.equal(await page.locator("#dialogJidInput").inputValue(), "fixture@localhost");
        assert.equal(await page.evaluate(() => document.activeElement.tagName), "BODY");
        const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
        assert.ok(size.width <= size.viewport + 1, "no horizontal document overflow");
        for (const name of ["dialogConnectButton", "dialogServerSettingsButton"]) {
          await page.locator("#" + name).scrollIntoViewIfNeeded();
          const box = await page.locator("#" + name).boundingBox();
          assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1,
            name + " stays reachable at " + width + "x" + height);
        }
      }
      const colors = await page.locator("#dialogConnectButton").evaluate(button => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }));
      assert.deepEqual(colors, { background: "rgb(37, 99, 235)", color: "rgb(255, 255, 255)" });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(engine.name() + ": native contacts search presence selection privacy and rotation", { timeout: 45000 }, async () => {
    const { browser, page, errors, requests } = await setup(engine);
    try {
      await page.evaluate(() => window.emitNative("connected"));
      await page.locator("#hybridConnected").waitFor({ state: "visible" });
      await page.evaluate(() => window.emitRoster([
        { jid: "peer@localhost", name: "Édward Fixture", presence: "online" },
        { jid: "other@localhost", name: "<img src=x onerror=alert(1)>", presence: "unknown" }
      ]));
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 2);
      assert.equal(await page.locator("#conversationItems img, #conversationItems script").count(), 0);
      assert.match(await page.locator("#conversationItems").textContent(), /<img src=x onerror=alert\(1\)>/);
      await page.locator("#conversationSearchInput").fill("edward");
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 1);
      await page.locator("#conversationItems .conversation-item").focus();
      await page.evaluate(() => window.emitRoster([
        { jid: "peer@localhost", name: "Édward Fixture", presence: "away" },
        { jid: "other@localhost", name: "<img src=x onerror=alert(1)>", presence: "offline" }
      ]));
      assert.equal(await page.evaluate(() => document.activeElement.dataset.contactJid), "peer@localhost");
      assert.match(await page.locator("#conversationItems .conversation-item").getAttribute("aria-label"), /Afwezig/);
      await page.locator("#conversationItems .conversation-item").press("Enter");
      assert.equal(await page.locator("#hybridContactTitle").textContent(), "Édward Fixture");
      assert.match(await page.locator("#hybridContactHint").textContent(), /worden nog aangesloten/);
      assert.equal(await page.locator("textarea, #messageInput").count(), 0);
      for (const [width, height] of [[390, 844], [844, 390], [834, 1194], [1194, 834]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.locator("#hybridContactTitle").textContent(), "Édward Fixture");
        assert.equal(await page.locator("#conversationSearchInput").inputValue(), "edward");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const box = await page.locator("#hybridLogout").boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator("#hybridContactsBack").click();
      await page.locator("#conversationSearchInput").fill("");
      await page.locator("#conversationActionsToggle").click();
      assert.equal(await page.locator("#addConversationButton").isDisabled(), true);
      assert.equal(await page.locator("#addGroupButton").isDisabled(), true);
      await page.evaluate(() => window.emitRoster([], "unavailable"));
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 0);
      assert.match(await page.locator("#hybridRosterStatus").textContent(), /niet beschikbaar/);
      await page.locator("#hybridLogout").click();
      await page.locator("#accountDialog").waitFor({ state: "visible" });
      assert.equal(await page.locator("#conversationItems .conversation-item").count(), 0);
      assert.equal(await page.locator("#conversationSearchInput").inputValue(), "");
      assert.equal(await page.locator("#hybridContactJid").textContent(), "");
      assert.equal(requests.some(url => /\/api\/|chat-client\.js|jingle/.test(url)), false);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
