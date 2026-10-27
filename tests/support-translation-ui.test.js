const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-support-translation-"));
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const server = spawn("C:\\wamp64\\bin\\php\\php8.4.15\\php.exe", ["-S", origin.replace("http://", ""), "php/tests/support-chat-http-fixture.php"], {
    cwd: path.resolve(__dirname, ".."), windowsHide: true, env: { ...process.env, TELETYPTEL_SUPPORT_TEST_DB: path.join(temporary, "fixture.sqlite") }, stdio: "ignore"
  });
  let browser;
  try {
    for (let attempt = 0; attempt < 40; attempt++) { try { await fetch(origin + "/missing"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    browser = await chromium.launch({ headless: true });
    const guestContext = await browser.newContext({ ...devices["Pixel 7"], locale: "en-GB", serviceWorkers: "block" });
    const staffContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "nl-NL", serviceWorkers: "block" });
    const visitor = await guestContext.newPage(), staff = await staffContext.newPage();
    const legacyContext = await browser.newContext();
    const legacySession = await (await legacyContext.request.get(origin + "/api/support-chat.php")).json();
    const legacyHeaders = { "X-CSRF-Token": legacySession.csrfToken };
    assert.equal((await legacyContext.request.post(origin + "/api/support-chat.php", { headers: legacyHeaders, data: { action: "start", name: "Legacy test", acknowledged: true, translationConsent: true, targetLanguage: "invalid" } })).status(), 400, "Invalid start language is rejected before creating a chat");
    await legacyContext.request.post(origin + "/api/support-chat.php", { headers: legacyHeaders, data: { action: "start", name: "Legacy test", acknowledged: true } });
    const legacyChat = await (await legacyContext.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(legacyChat.translationSettings.preferences.mode, "off", "Old RTT-only acknowledgement never grants Google consent");
    assert.equal(legacyChat.translationSettings.preferences.liveConsent, false);
    await legacyContext.request.post(origin + "/api/support-chat.php", { headers: legacyHeaders, data: { action: "close", threadId: legacyChat.thread.id } });
    await legacyContext.close();
    const failures = [], translated = [];
    for (const page of [visitor, staff]) {
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("request", (request) => { if (request.method() === "POST" && /support-chat.*\.php/.test(request.url())) { const body = request.postDataJSON(); if (body?.action === "translate") translated.push(body); } });
    }
    const save = async (page, selector, language, mode) => {
      const panel = page.locator(selector);
      await panel.locator("summary").click();
      await panel.locator('[name="language"]').selectOption(language);
      assert.equal(await panel.locator('[name="mode"], [name="live"]').count(), 0, "Only combined automatic translation consent, no manual mode");
      await panel.locator('[name="consent"], [name="enabled"]').setChecked(mode !== "off");
      const [response] = await Promise.all([
        page.waitForResponse((reply) => reply.request().method() === "POST" && reply.request().postDataJSON()?.action === "translation_settings"),
        panel.locator('button[type="submit"]').click({ timeout: 15000 })
      ]).catch(async (failure) => {
        await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-settings-failure.png") });
        throw failure;
      });
      assert.equal(response.status(), 200);
      await page.waitForFunction((query) => !document.querySelector(query + " > details").open, selector);
    };
    await visitor.goto(origin); await visitor.getByRole("button", { name: "Customer service", exact: true }).click();
    await visitor.locator("#supportName").fill("Foreign visitor (test)"); await visitor.locator("#supportAcknowledged").check();
    await visitor.getByRole("button", { name: "Start chat", exact: true }).click();
    await visitor.locator("#supportTranslation").waitFor();
    assert.equal(await visitor.locator('#supportTranslation [name="language"]').inputValue(), "en", "Chosen start language is translation target");
    const started = await (await guestContext.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(started.translationSettings.preferences.mode, "automatic");
    assert.equal(started.translationSettings.preferences.consent, true);
    assert.equal(started.translationSettings.preferences.liveConsent, true);
    assert.equal(translated.length, 0, "No text sent to the provider before any conversation text exists");
    await staff.goto(origin + "/admin/support-chat.php"); await staff.locator("#supportStaffEmail").fill("staff1@example.test"); await staff.locator("#supportStaffPassword").fill("fixture-password-only");
    await staff.locator('#supportStaffLogin button[type="submit"]').click(); await staff.getByRole("button", { name: "Oppakken", exact: true }).click();
    await visitor.locator("#supportText").fill("Hello from abroad <img src=x>"); await visitor.locator('#supportSend button[type="submit"]').click();
    await staff.locator("#supportStaffMessages p").getByText("Hello from abroad <img src=x>", { exact: true }).waitFor();
    assert.equal(await staff.locator('#supportStaffTranslation [name="consent"]').count(), 0, "No extra staff consent checkbox");
    assert.equal(await staff.locator('#supportStaffTranslation [name="enabled"]').isChecked(), true, "Staff display starts automatically");
    assert.ok((await staff.locator(".support-staff-note").allTextContents()).join(" ").includes("Google Cloud Translation"), "Staff sees provider and draft-processing notice before taking chats");
    await staff.locator(".support-translation-result > div").getByText("[nl] Hello from abroad <img src=x>", { exact: true }).waitFor();
    assert.equal(await staff.locator("#supportStaffMessages img").count(), 0, "Provider output stays plain text");
    await staff.locator("#supportStaffText").fill("Hallo, waarmee kan ik helpen?"); await staff.locator('#supportStaffReply button[type="submit"]').click();
    await visitor.locator(".support-translation-result > div").getByText("[en] Hallo, waarmee kan ik helpen?", { exact: true }).waitFor();
    assert.equal(await visitor.locator("#supportMessages p").getByText("Hallo, waarmee kan ik helpen?", { exact: true }).count(), 1, "Original preserved");
    await save(visitor, "#supportTranslation", "fr", "automatic");
    const received = visitor.locator("#supportMessages article.staff");
    await received.locator(".support-translation-result > div").getByText("[fr] Hallo, waarmee kan ik helpen?", { exact: true }).waitFor();
    assert.equal(await received.getByRole("button", { name: "Translate", exact: true }).count(), 0, "No per-message manual translation button");
    let releaseResponse, markReady;
    const held = new Promise((resolve) => { releaseResponse = resolve; });
    const ready = new Promise((resolve) => { markReady = resolve; });
    await visitor.route("**/api/support-chat.php", async (route) => {
      const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
      if (body?.action === "translate" && body.targetLanguage === "de") {
        const response = await route.fetch(); markReady(); await held; await route.fulfill({ response });
      } else await route.continue();
    });
    await save(visitor, "#supportTranslation", "de", "automatic"); await ready;
    await save(visitor, "#supportTranslation", "fr", "automatic");
    const lateResponse = visitor.waitForResponse((response) => response.request().method() === "POST" && response.request().postDataJSON()?.action === "translate" && response.request().postDataJSON()?.targetLanguage === "de");
    releaseResponse(); await (await lateResponse).finished();
    await visitor.waitForTimeout(100);
    assert.ok(!(await received.textContent()).includes("[de]"), "Late result for old language is discarded");
    await received.locator(".support-translation-result > div").getByText("[fr] Hallo, waarmee kan ik helpen?", { exact: true }).waitFor();
    await visitor.unroute("**/api/support-chat.php");
    await save(visitor, "#supportTranslation", "en", "automatic", true);
    const visitorCall = visitor.locator("#supportLive"), staffCall = staff.locator("#supportStaffLive");
    await visitor.waitForFunction(() => document.getElementById("supportCall").dataset.rtt === "connected");
    await visitor.locator("#supportText").fill("Live foreign text");
    await visitorCall.locator(".support-call-draft.own > span").getByText("Live foreign text", { exact: true }).waitFor();
    await staffCall.locator(".support-call-drafts span").getByText("Live foreign text", { exact: true }).waitFor();
    await staffCall.locator(".support-translation-result > div").getByText("[nl] Live foreign text", { exact: true }).waitFor();
    await visitorCall.locator(".support-translation-result > div").getByText("You: [en] Live foreign text", { exact: true }).waitFor();
    assert.equal(await visitorCall.locator(".support-call-draft.own .support-translation-result").count(), 1, "Own translation is inside the live balloon");
    assert.equal(await staffCall.locator(".support-call-draft.visitor .support-translation-result").count(), 1, "Received translation is inside its original balloon");
    await visitor.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-live-balloon.png") });
    await visitor.locator("#supportText").fill("");
    await visitor.waitForFunction(() => !document.querySelector("#supportLive .support-translation-result"));
    await staff.waitForFunction(() => !document.querySelector("#supportStaffLive .support-translation-result"));
    assert.equal(await visitorCall.locator(".support-call-draft.own").isVisible(), false, "Erasing the draft hides its balloon");
    await visitor.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-translation.png") });
    await save(staff, "#supportStaffTranslation", "nl", "off");
    await visitor.locator("#supportText").fill("Visitor translation stays on");
    await visitorCall.locator(".support-translation-result > div").getByText("You: [en] Visitor translation stays on", { exact: true }).waitFor();
    assert.equal(await staffCall.locator(".support-translation-result").count(), 0, "Staff display off does not disable visitor translation");
    await visitor.locator("#supportText").fill("");
    await save(staff, "#supportStaffTranslation", "nl", "automatic");
    await save(visitor, "#supportTranslation", "en", "off");
    await staff.locator("#supportStaffTranslation .support-translation-status").filter({ hasText: "Vertaling staat uit voor dit gesprek" }).waitFor({ state: "attached" });
    const count = translated.length;
    await visitor.locator("#supportText").fill("Not shared with Google");
    await new Promise((resolve) => setTimeout(resolve, 3200));
    assert.equal(translated.length, count, "Revocation stops automatic and live translation");
    const history = await (await guestContext.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(history.messages.length, 2, "No drafts or translations stored in transcript");
    assert.equal(history.translationSettings.preferences.targetLanguage, "en");
    assert.equal((await guestContext.request.post(origin + "/api/support-chat.php", { data: { action: "translation_settings", threadId: history.thread.id } })).status(), 403, "CSRF protects consent");
    const stranger = await browser.newContext(); const strangerSession = await (await stranger.request.get(origin + "/api/support-chat.php")).json();
    assert.equal((await stranger.request.post(origin + "/api/support-chat.php", { headers: { "X-CSRF-Token": strangerSession.csrfToken }, data: { action: "translate", threadId: history.thread.id, sequence: 1, targetLanguage: "en" } })).status(), 404, "Another visitor cannot translate private messages");
    assert.deepEqual(failures, []);
    console.log("Support translation UI passed: visitor start terms, no staff confirmation, automatic messages/live RTT, independent staff display, visitor revocation, target changes, safe rendering and transcript isolation. Fixture provider only.");
  } finally {
    await browser?.close(); server.kill();
    await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
    const target = path.resolve(temporary); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("teletyptel-support-translation-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
