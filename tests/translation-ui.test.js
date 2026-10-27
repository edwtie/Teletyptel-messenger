const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit, devices } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const origin = "https://translation.teletyptel.test";
const html = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const language = Object.fromEntries(fs.readFileSync(path.join(root, "lang/ned.lng"), "utf8").split(/\r?\n/).filter((line) => line.includes("=")).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));

async function checkBrowser(engine, device) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...device, serviceWorkers: "block" });
    let preferences = { targetLanguage: "nl", mode: "manual", automaticConsent: false };
    let accountId = "alice";
    let available = true;
    let failure = "";
    let getError = "";
    let delayNext;
    const requests = [];
    const failures = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { failures.push(url.origin); return route.abort(); }
      if (url.pathname === "/api/translation.php") {
        if (route.request().method() === "GET" && getError) return route.fulfill({ status: 401, json: { ok: false, error: getError } });
        if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, accountId, available, csrfToken: "fixture", languages: { nl: "Nederlands", en: "English", de: "Deutsch" }, preferences } });
        assert.equal(route.request().headers()["x-csrf-token"], "fixture");
        const input = route.request().postDataJSON();
        requests.push(input);
        if (input.action === "preferences") {
          preferences = { targetLanguage: input.targetLanguage, mode: input.mode, automaticConsent: input.mode === "automatic" && input.automaticConsent,
            liveRttConsent: input.mode !== "off" && input.liveRttConsent === true,
            ownLiveRttConsent: input.mode !== "off" && input.ownLiveRttConsent === true };
          return route.fulfill({ json: { ok: true, preferences } });
        }
        const expectedKeys = ["action", "automatic", "consent", "targetLanguage", "text"];
        if (input.liveRtt) expectedKeys.push("liveRtt");
        if (input.liveDirection === "self") expectedKeys.push("liveDirection");
        assert.deepEqual(Object.keys(input).sort(), expectedKeys.sort());
        assert.equal(input.consent, true);
        if (delayNext) { const wait = delayNext; delayNext = null; await wait; }
        if (failure) return route.fulfill({ status: 429, json: { ok: false, error: failure } });
        return route.fulfill({ json: { ok: true, translation: { text: input.liveRtt ? "Live: " + input.text : "Vertaling <img src=x onerror=alert(1)>", targetLanguage: input.targetLanguage } } });
      }
      if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: html });
      const file = path.join(root, url.pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
      return route.fulfill({ status: 404, body: "Not found" });
    });
    const page = await context.newPage();
    page.on("dialog", async (dialog) => {
      failures.push("Unexpected confirmation popup");
      await dialog.dismiss();
    });
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(origin + "/fixture");
    await page.evaluate(() => {
      let prototype = document;
      while (prototype && !Object.getOwnPropertyDescriptor(prototype, "cookie")) prototype = Object.getPrototypeOf(prototype);
      const cookieAccess = Object.getOwnPropertyDescriptor(prototype, "cookie");
      window.cookieWrites = [];
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () => cookieAccess.get.call(document),
        set: (value) => { window.cookieWrites.push(value); cookieAccess.set.call(document, value); }
      });
      const settings = document.querySelector(".translation-settings");
      const saveSettings = document.getElementById("dialogSaveAccountButton");
      const timeline = document.createElement("div");
      timeline.id = "fixtureMessages";
      const live = document.createElement("section");
      live.id = "fixtureLive";
      const ownLive = document.createElement("section");
      ownLive.id = "fixtureOwnLive";
      document.body.replaceChildren(settings, saveSettings, timeline, live, ownLive);
      document.body.style.cssText = "display:block;height:auto;overflow:auto;padding:12px";
    });
    await page.addScriptTag({ url: origin + "/chat-translation.js" });
    await page.evaluate((labels) => {
      window.messages = [{ direction: "peer", text: "Hello", status: "history" }];
      window.refresh = () => {
        const timeline = document.getElementById("fixtureMessages");
        timeline.replaceChildren();
        window.messages.forEach((message) => {
          const article = document.createElement("article");
          const original = document.createElement("p");
          original.className = "original";
          original.textContent = message.text;
          article.append(original);
          window.translator.render(message, article);
          const action = window.translator.menuAction(message);
          if (action.visible) {
            const button = document.createElement("button");
            button.className = "fixture-translation-menu-action";
            button.textContent = action.label;
            button.disabled = action.disabled;
            button.addEventListener("click", () => { void window.translator.activate(message); });
            article.append(button);
          }
          timeline.append(article);
        });
      };
      window.refreshLive = () => {
        const live = document.getElementById("fixtureLive");
        live.replaceChildren();
        window.translator.renderLive(live);
        const ownLive = document.getElementById("fixtureOwnLive");
        ownLive.replaceChildren();
        window.translator.renderLive(ownLive, "self");
      };
      window.translator = window.TeleTypTelTranslation.create({ translate: (key, fallback) => labels[key] || fallback,
        refreshMessage: window.refresh, refreshLive: window.refreshLive, openSettings: (reason) => { window.settingsReason = reason; } });
      document.getElementById("dialogSaveAccountButton").addEventListener("click", async () => {
        try { await window.translator.savePreferences(); } catch (error) { window.saveError = error.message; }
      });
      return window.translator.setAccount("alice");
    }, language);
    assert.equal(await page.locator("#translationMode").inputValue(), "manual");
    assert.equal(requests.length, 0, "Loading history does not translate");
    assert.equal(await page.locator(".message-translate-button, .message-translation").count(), 0, "No translation icon or empty divider on untranslated messages");
    assert.equal(await page.locator(".fixture-translation-menu-action").innerText(), "Vertalen");
    assert.deepEqual(await page.evaluate(() => [{ draft: true }, { attachment: {} }, { location: {} }, { retracted: true }, { jingleHistory: {} }, { status: "call ended" }, { text: "" }]
      .map((extra) => window.translator.menuAction({ direction: "peer", text: "Excluded", ...extra }).visible)), Array(7).fill(false));
    await page.locator(".fixture-translation-menu-action").click();
    assert.equal(requests.length, 0, "Missing privacy consent never sends text");
    assert.equal(await page.evaluate(() => window.settingsReason), "manual_consent_required");
    assert.equal(await page.locator("#translationManualConsent").isChecked(), false);
    assert.equal((await context.cookies()).filter((cookie) => cookie.name.startsWith("teletyptel_translation_")).length, 0);
    await page.locator("#translationManualConsent").check();
    assert.equal((await context.cookies()).length, 0, "Checking alone does not persist consent");
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    const consentCookie = (await context.cookies()).find((cookie) => cookie.name === "teletyptel_translation_google_v1_alice");
    assert.equal(consentCookie.value, "allowed");
    assert.ok((await page.evaluate(() => window.cookieWrites)).some((value) => value.includes("=allowed; Path=/; SameSite=Strict; Max-Age=15552000; Secure")));
    if (engine === chromium) assert.equal(consentCookie.sameSite, "Strict");
    assert.equal(consentCookie.secure, true);
    assert.equal(consentCookie.path, "/");
    assert.ok(Math.abs(consentCookie.expires - Date.now() / 1000 - 15552000) < 60);
    requests.length = 0;
    await page.locator(".fixture-translation-menu-action").click();
    await page.getByText("Vertaling <img src=x onerror=alert(1)>", { exact: true }).waitFor();
    assert.equal(await page.locator(".original").innerText(), "Hello");
    assert.equal(await page.locator(".message-translation-result img").count(), 0, "Translation is text, not executable markup");
    assert.equal(await page.locator(".translation-info summary").innerText(), "Vertaling");
    assert.equal(await page.locator(".translation-info small").isVisible(), false, "Warning is collapsed by default");
    const beforeInfo = requests.length;
    await page.locator(".translation-info summary").click();
    assert.ok((await page.locator(".translation-info small").innerText()).includes("Kan fouten bevatten."));
    assert.equal(requests.length, beforeInfo, "Opening explanation never sends text to the provider");
    await page.locator(".translation-info summary").press("Enter");
    assert.equal(await page.locator(".translation-info small").isVisible(), false, "Explanation closes with keyboard");
    await page.locator(".fixture-translation-menu-action").click();
    assert.equal(await page.locator(".message-translation-result").count(), 0);
    await page.locator(".fixture-translation-menu-action").click();
    assert.equal(requests.length, 1, "Showing translation again does not resend text");
    await page.locator("#translationTarget").selectOption("en");
    await page.locator("#translationMode").selectOption("automatic");
    await page.locator("#dialogSaveAccountButton").click();
    assert.equal(requests.length, 1, "Auto mode requires explicit consent");
    await page.locator("#translationConsent").check();
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    assert.equal(requests.filter((request) => request.action === "translate").length, 1, "Saving auto mode does not translate history");
    await page.evaluate(() => {
      const message = { direction: "peer", text: "New message" };
      window.messages.push(message);
      window.translator.incoming(message);
      window.refresh();
    });
    await page.locator(".message-translation-result").filter({ hasText: "Vertaling" }).waitFor();
    assert.equal(requests.at(-1).automatic, true);
    assert.equal(requests.at(-1).targetLanguage, "en");
    const count = requests.length;
    await page.evaluate(() => {
      for (const extra of [{ draft: true }, { attachment: {} }, { location: {} }, { retracted: true }, { jingleHistory: {} }, { direction: "self" }]) {
        window.translator.incoming({ direction: "peer", text: "Excluded", ...extra });
      }
    });
    assert.equal(requests.length, count, "No live RTT, files, location, deleted messages or outgoing auto translations");
    await page.locator("#translationMode").selectOption("manual");
    await page.evaluate(() => window.translator.incoming({ direction: "peer", text: "After consent changed" }));
    assert.equal(requests.length, count, "Changing consent/mode stops auto immediately");
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    failure = "limit_reached";
    await page.locator(".fixture-translation-menu-action").first().click();
    await page.getByText(language["translation.limit_reached"], { exact: true }).waitFor();
    failure = "";
    let release;
    delayNext = new Promise((resolve) => { release = resolve; });
    await page.locator(".fixture-translation-menu-action").first().click();
    await page.locator(".message-translation-result").getByText(language["translation.translating"], { exact: true }).waitFor();
    assert.equal(await page.locator(".fixture-translation-menu-action").first().isDisabled(), true);
    const beforeDuplicate = requests.length;
    await page.evaluate(() => window.translator.activate(window.messages[0]));
    assert.equal(requests.length, beforeDuplicate, "Pending action cannot start a duplicate request");
    await page.evaluate(() => { window.messages[0].text = "Edited original"; });
    release();
    await page.waitForFunction(() => !document.querySelector(".fixture-translation-menu-action")?.disabled);
    assert.equal(await page.locator(".message-translation-result").count(), 0, "Late translation cannot replace edited message");
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const liveRequests = () => requests.filter((input) => input.liveRtt);
    const tick = async (milliseconds) => { await page.clock.runFor(milliseconds); await page.waitForTimeout(50); };
    const draft = (text, conversation = "noor", sender = "noor@example.test") => page.evaluate(({ text, conversation, sender }) => {
      window.translator.setLiveDraft(conversation, text, sender);
    }, { text, conversation, sender });
    await draft("No permission yet");
    await tick(5000);
    assert.equal(liveRequests().length, 0, "Automatic completed messages never imply consent for drafts");
    await page.locator("#translationLiveConsent").check();
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    await draft("Hide before sending");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const beforeHidden = liveRequests().length;
    await tick(5000);
    assert.equal(liveRequests().length, beforeHidden, "Background tab stops queued live translation");
    assert.equal(await page.locator(".live-rtt-translation").count(), 0);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await tick(5000);
    assert.equal(liveRequests().length, beforeHidden, "Returning to tab does not translate stale drafts");
    await draft("H");
    await tick(400);
    await draft("Hello");
    await tick(799);
    assert.equal(liveRequests().length, 0, "Coalesce keystrokes rather than sending each letter");
    await tick(1);
    await page.getByText("Live: Hello", { exact: true }).waitFor();
    assert.equal(liveRequests().length, 1);
    assert.equal(liveRequests()[0].automatic, false, "Separate consent permits live RTT in manual mode");
    await draft("Hello");
    await tick(3000);
    assert.equal(liveRequests().length, 1, "Duplicate RTT updates do not resend");
    await draft("Hello corrected");
    assert.equal(await page.getByText("Live: Hello", { exact: true }).count(), 1, "Appending text preserves the last readable translation");
    await page.getByText(language["translation.live_updating"], { exact: true }).waitFor();
    await tick(800);
    await page.getByText("Live: Hello corrected", { exact: true }).waitFor();
    await draft("Hi corrected");
    assert.equal(await page.getByText("Live: Hello corrected", { exact: true }).count(), 0, "Editing translated text hides the outdated result immediately");
    await tick(3000);
    await page.getByText("Live: Hi corrected", { exact: true }).waitFor();
    await draft("");
    assert.equal(await page.locator(".live-rtt-translation").count(), 0, "Reset/final clears provisional translation");
    await tick(3000);
    let releaseLive;
    delayNext = new Promise((resolve) => { releaseLive = resolve; });
    await draft("Old draft");
    await tick(800);
    const inFlightCount = liveRequests().length;
    await draft("Edited while waiting");
    await tick(5000);
    assert.equal(liveRequests().length, inFlightCount, "Only one live provider request at a time");
    releaseLive();
    await page.waitForTimeout(100);
    assert.equal(await page.getByText("Live: Old draft", { exact: true }).count(), 0, "Late result never overwrites a revised draft");
    await tick(1000);
    await page.getByText("Live: Edited while waiting", { exact: true }).waitFor();
    await draft("");
    await tick(3000);
    let releasePrefix;
    delayNext = new Promise((resolve) => { releasePrefix = resolve; });
    await draft("Still typing");
    await tick(800);
    await draft("Still typing more words");
    releasePrefix();
    await page.getByText("Live: Still typing", { exact: true }).waitFor();
    await page.getByText(language["translation.live_updating"], { exact: true }).waitFor();
    assert.equal(await page.locator(".live-rtt-translation-text").evaluate((element) => getComputedStyle(element).fontSize), "16px");
    assert.equal(await page.locator("#fixtureLive .translation-info summary").innerText(), "Vertaling");
    await page.locator("#fixtureLive .translation-info summary").click();
    await tick(1);
    assert.equal(await page.locator("#fixtureLive .translation-info small").isVisible(), true);
    await tick(3000);
    await page.getByText("Live: Still typing more words", { exact: true }).waitFor();
    assert.equal(await page.locator("#fixtureLive .translation-info small").isVisible(), true, "Live updates retain the open explanation");
    await draft("Still typing more");
    assert.equal(await page.getByText("Live: Still typing more words", { exact: true }).count(), 0, "Deleting translated words removes them immediately");
    await draft("");
    await tick(3000);
    const beforeTyping = liveRequests().length;
    for (let index = 0; index < 9; index++) {
      await draft("Continuous typing " + "word ".repeat(index + 1));
      await tick(500);
    }
    assert.ok(liveRequests().length > beforeTyping, "Continuous typing still produces provisional translation within max-wait");
    assert.ok(liveRequests().length <= beforeTyping + 1, "Throttle repeated draft snapshots");
    assert.ok((await page.locator(".live-rtt-translation-text").textContent()).startsWith("Live: Continuous typing"), "Translation stays readable while typing continues");
    await draft("<img src=x onerror=alert(1)>");
    await tick(4000);
    await page.getByText("Live: <img src=x onerror=alert(1)>", { exact: true }).waitFor();
    assert.equal(await page.locator(".live-rtt-translation img").count(), 0, "Live translation uses textContent");
    const beforeCancel = liveRequests().length;
    await draft("Will be cancelled");
    await draft("", "other");
    await tick(5000);
    assert.equal(liveRequests().length, beforeCancel, "Changing conversation cancels scheduled work");
    await draft("a".repeat(5001));
    await tick(5000);
    assert.equal(liveRequests().length, beforeCancel, "Oversized drafts stay local");
    let releaseCancelled;
    delayNext = new Promise((resolve) => { releaseCancelled = resolve; });
    await draft("Same text", "first", "first@example.test");
    await tick(800);
    const beforeSwitch = liveRequests().length;
    await draft("Same text", "second", "second@example.test");
    releaseCancelled();
    await page.waitForTimeout(80);
    assert.equal(await page.getByText("Live: Same text", { exact: true }).count(), 0, "Late result from another conversation is discarded even when text matches");
    await page.locator("#translationLiveConsent").uncheck();
    await draft("Consent withdrawn before saving");
    await tick(5000);
    assert.equal(liveRequests().length, beforeSwitch, "Unchecking live consent stops immediately");
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    await page.locator("#translationLiveConsent").check();
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    failure = "limit_reached";
    await draft("Over quota");
    await tick(800);
    await page.locator(".live-rtt-translation").getByText(language["translation.limit_reached"], { exact: true }).waitFor();
    const afterFailure = liveRequests().length;
    await draft("Do not retry every letter");
    await tick(10000);
    assert.equal(liveRequests().length, afterFailure, "Provider errors stop live requests until preferences reload");
    failure = "";
    await page.locator("#translationReload").click();
    await page.getByText(language["translation.ready"], { exact: true }).waitFor();
    const ownDraft = (text) => page.evaluate((text) => window.translator.setLiveDraft("noor", text, "me@example.test", "self"), text);
    await ownDraft("No permission for own drafts");
    await tick(5000);
    assert.equal(liveRequests().length, afterFailure, "Incoming RTT consent does not authorize unsent own text");
    await page.locator("#translationOwnLiveConsent").check();
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved"], { exact: true }).waitFor();
    await draft("Peer text");
    await ownDraft("My text");
    await tick(800);
    await tick(3000);
    await page.locator("#fixtureLive").getByText("Live: Peer text", { exact: true }).waitFor();
    await page.locator("#fixtureOwnLive").getByText("Live: My text", { exact: true }).waitFor();
    assert.equal(liveRequests().length, afterFailure + 2, "Both directions share one throttled queue without overwriting each other");
    assert.equal(liveRequests().at(-1).liveDirection, "self");
    await ownDraft("My text continues");
    await page.locator("#fixtureOwnLive").getByText("Live: My text", { exact: true }).waitFor();
    await ownDraft("");
    assert.equal(await page.locator("#fixtureOwnLive .live-rtt-translation").count(), 0, "Clearing own draft removes its preview");
    await page.locator("#fixtureLive").getByText("Live: Peer text", { exact: true }).waitFor();
    const afterOwn = liveRequests().length;
    await ownDraft("Logout also cancels own text");
    await draft("Logout cancels this");
    await page.evaluate(() => window.translator.setAccount(""));
    await tick(5000);
    assert.equal(liveRequests().length, afterOwn, "Logout cancels both draft directions");
    assert.equal(await page.locator(".live-rtt-translation").count(), 0);
    assert.equal(await page.locator("#translationTarget").isDisabled(), true);
    available = false;
    accountId = "bob";
    preferences = { targetLanguage: "nl", mode: "manual", automaticConsent: false };
    await page.evaluate(() => window.translator.setAccount("bob"));
    assert.equal(await page.locator("#translationTarget").inputValue(), "nl");
    assert.equal(await page.locator(".fixture-translation-menu-action").count(), 0);
    await page.getByText(language["translation.unavailable"], { exact: true }).waitFor();
    await page.locator("#translationTarget").selectOption("de");
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.saved_unavailable"], { exact: true }).waitFor();
    assert.equal(preferences.targetLanguage, "de", "Preferences can be saved while the provider is disabled");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 720 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Settings fit narrow phones");
    }
    getError = "sign_in";
    const beforeLoginFailure = requests.length;
    await page.evaluate(async () => {
      await window.translator.setAccount("bob", true);
      window.messages.push({ direction: "self", draft: true, text: "v" });
      window.refresh();
    });
    await page.locator(".translation-notice button").filter({ hasText: language["translation.sign_in_action"] }).waitFor();
    assert.equal(await page.locator(".translation-notice [role=status]").textContent(), language["translation.sign_in"]);
    assert.equal(requests.length, beforeLoginFailure, "Missing PHP session is explained without sending any message text");
    await page.evaluate(() => window.translator.savePreferences());
    assert.equal(requests.length, beforeLoginFailure, "Unloaded preferences never overwrite saved settings with defaults");
    await page.clock.resume();
    getError = "";
    available = true;
    await page.evaluate(() => window.translator.setAccount("bob", true));
    const translateManual = (text) => page.evaluate(async (text) => {
      const message = { direction: "self", text };
      window.messages = [message];
      await window.translator.activate(message);
    }, text);
    const grantManual = async () => {
      await page.locator("#translationManualConsent").check();
      await page.evaluate(() => window.translator.savePreferences());
    };
    let beforeManual = requests.length;
    await translateManual("First Bob message");
    assert.equal(requests.length, beforeManual, "Another account has no inherited permission");
    await grantManual();
    beforeManual = requests.length;
    await translateManual("Bob after permission");
    await page.evaluate(() => window.translator.setAccount("bob", true));
    assert.equal(await page.locator("#translationManualConsent").isChecked(), true);
    await translateManual("Bob after preferences reload");
    assert.equal(requests.length, beforeManual + 2, "Cookie survives reinitialization without a popup");
    assert.equal(preferences.automaticConsent, false);
    assert.equal(preferences.liveRttConsent, false);
    assert.equal(preferences.ownLiveRttConsent, false);
    await page.locator("#translationManualConsent").uncheck();
    assert.equal((await context.cookies()).some((cookie) => cookie.name === "teletyptel_translation_google_v1_bob"), false, "Revocation immediately deletes the cookie");
    await page.evaluate(() => window.translator.savePreferences());
    beforeManual = requests.length;
    await translateManual("Bob after revoking");
    assert.equal(requests.length, beforeManual, "Revoked permission blocks manual translation");
    await grantManual();
    await page.locator("#translationMode").selectOption("off");
    await page.evaluate(() => window.translator.savePreferences());
    assert.equal((await context.cookies()).some((cookie) => cookie.name === "teletyptel_translation_google_v1_bob"), false);
    await page.locator("#translationMode").selectOption("manual");
    await page.evaluate(() => window.translator.savePreferences());
    beforeManual = requests.length;
    await translateManual("Bob after disabling and enabling");
    assert.equal(requests.length, beforeManual, "Re-enabling does not restore consent");
    await grantManual();
    await context.clearCookies();
    await page.waitForFunction(() => !document.cookie.includes("teletyptel_translation_google_v1_bob=allowed"));
    beforeManual = requests.length;
    await translateManual("Bob after cookie removed in another tab");
    assert.equal(requests.length, beforeManual, "Cookie is checked again before each manual request");
    accountId = "charlie";
    await page.evaluate(() => {
      localStorage.setItem("teletyptel.translation.manualConsent.google.v1.charlie", "1");
      return window.translator.setAccount("charlie");
    });
    assert.equal(await page.locator("#translationManualConsent").isChecked(), false, "Legacy popup consent is not silently converted to cookie consent");
    assert.equal(await page.evaluate(() => localStorage.getItem("teletyptel.translation.manualConsent.google.v1.charlie")), null);
    await page.evaluate(() => {
      Object.defineProperty(document, "cookie", { configurable: true, get: () => "", set: () => {} });
    });
    await page.locator("#translationManualConsent").check();
    await page.locator("#dialogSaveAccountButton").click();
    await page.getByText(language["translation.cookie_blocked"], { exact: true }).waitFor();
    assert.equal(await page.locator("#translationManualConsent").isChecked(), true, "Failed save retains the user's input");
    beforeManual = requests.length;
    await translateManual("Charlie with blocked cookies");
    assert.equal(requests.length, beforeManual, "Blocked cookie saving does not enable translation");
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
  }
}

(async () => {
  await checkBrowser(chromium, devices["Pixel 7"]);
  await checkBrowser(webkit, devices["iPhone 13"]);
  console.log("Translation UI passed on Android and iPhone emulation: manual/auto and live RTT consent, coalescing, throttle, revisions, reset, limits, XSS and account isolation. No live API calls.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
