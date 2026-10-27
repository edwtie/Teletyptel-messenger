const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium, webkit, devices } = require("playwright");

async function check(engine, device, label) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-support-"));
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const server = spawn(process.env.PHP_TEST_BINARY || "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe", ["-S", "127.0.0.1:" + port, "php/tests/support-chat-http-fixture.php"], {
    cwd: path.resolve(__dirname, ".."), windowsHide: true, env: { ...process.env, TELETYPTEL_SUPPORT_TEST_DB: path.join(temporary, "fixture.sqlite") }, stdio: "ignore"
  });
  let browser;
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(origin + "/missing"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    browser = await engine.launch({ headless: true });
    const visitor = await browser.newContext({ ...devices[device], locale: "nl-NL", serviceWorkers: "block" });
    const staff = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const stranger = await browser.newContext({ serviceWorkers: "block" });
    const page = await visitor.newPage(), desk = await staff.newPage(), other = await stranger.newPage();
    const failures = [];
    for (const current of [page, desk, other]) current.on("pageerror", (error) => failures.push(error.message));
    await page.goto(origin + "/");
    await page.locator("#supportLauncher").waitFor();
    const launcher = page.getByRole("button", { name: "Klantenservice", exact: true });
    assert.equal(await launcher.innerText(), "", "Launcher shows only the chat icon");
    assert.equal(await launcher.getAttribute("title"), "Klantenservice");
    const launcherBounds = await launcher.boundingBox();
    assert.equal(launcherBounds.width, 52, "Launcher remains compact");
    assert.equal(launcherBounds.height, 52, "Launcher keeps a touch-friendly target");
    assert.ok(!(await visitor.cookies()).some((cookie) => cookie.name === "teletyptel_support"), "No chat cookie before opening popup");
    assert.equal((await stranger.request.get(origin + "/admin/support-chat-api.php")).status(), 401, "Visitor cannot access staff API");
    await page.locator("#supportLauncher").click();
    await page.locator("#supportStatus").filter({ hasText: "geen medewerker" }).waitFor();
    assert.equal(await page.locator("#supportHeaderTools .support-call-actions").isVisible(), false, "Call controls stay hidden before starting chat");
    const cookie = (await visitor.cookies()).find((item) => item.name === "teletyptel_support");
    assert.ok(cookie?.httpOnly, "Visitor authentication cookie is HttpOnly");
    assert.equal(cookie.expires, -1, "Chat uses a session cookie, not a persistent tracking cookie");
    assert.equal((await visitor.request.post(origin + "/api/support-chat.php", { data: { action: "start", name: "Forged", acknowledged: true } })).status(), 403, "CSRF required");
    assert.equal((await visitor.request.get(origin + "/api/support-chat.php", { headers: { "Sec-Fetch-Site": "cross-site" } })).status(), 403, "Cross-site request rejected");
    await page.locator("#supportName").fill("Sam <img src=x onerror=alert(1)>");
    await page.locator('#supportStart button[type="submit"]').click();
    assert.equal(await page.locator("#supportStart").isVisible(), true, "Required acknowledgement cannot be skipped");
    await page.locator("#supportAcknowledged").check();
    await page.locator('#supportStart button[type="submit"]').click();
    await page.locator("#supportSend").waitFor();
    assert.equal(await page.locator("#supportMessageSend").isVisible(), false, "Empty composer shows microphone instead of send");
    assert.equal(await page.locator("#supportVideo").isDisabled(), true, "No video before staff joins");
    await page.locator("#supportText").fill("Hallo ");
    await page.locator("#supportEmoji").click();
    await page.locator("#supportEmojiPanel").getByRole("button", { name: "👋", exact: true }).click();
    assert.equal(await page.locator("#supportText").inputValue(), "Hallo 👋", "Emoji inserts into the draft");
    assert.equal(await page.locator("#supportEmojiPanel").isVisible(), false);
    assert.equal(await page.locator("#supportMicrophone").isVisible(), false, "Typing swaps microphone for send");
    await page.locator("#supportText").fill("Hoi, ik heb een vraag 👋 <script>window.injection=true</script>");
    await page.locator("#supportLive .support-call-draft.own > span").getByText("Hoi, ik heb een vraag 👋 <script>window.injection=true</script>", { exact: true }).waitFor();
    assert.equal(await page.locator("#supportLive script").count(), 0, "Live draft is plain text, including before staff joins");
    await page.locator('#supportSend button[type="submit"]').click();
    await page.locator("#supportMessages").getByText("Hoi, ik heb een vraag 👋 <script>window.injection=true</script>", { exact: true }).waitFor();
    assert.equal(await page.locator("#supportLive .support-call-draft.own").isVisible(), false, "Sent text no longer appears in a draft balloon");
    const own = await (await visitor.request.get(origin + "/api/support-chat.php")).json();
    const threadId = own.thread.id;
    assert.equal((await stranger.request.get(origin + "/api/support-chat.php?thread=" + threadId)).status(), 404, "Another visitor cannot read the chat");
    assert.equal(await page.evaluate(() => window.injection), undefined, "Visitor text cannot execute HTML");
    await desk.goto(origin + "/admin/support-chat.php");
    await desk.locator("#supportStaffLogin").waitFor();
    await desk.locator("#supportStaffEmail").fill("staff1@example.test");
    await desk.locator("#supportStaffPassword").fill("fixture-password-only");
    await desk.locator('#supportStaffLogin button[type="submit"]').click();
    await desk.locator("#supportStaffWorkspace").waitFor();
    await desk.getByRole("button", { name: "Oppakken", exact: true }).waitFor();
    assert.equal((await staff.request.get(origin + "/admin/support-chat-api.php?thread=" + threadId)).status(), 403, "Staff must claim before reading");
    await desk.locator("#supportStaffAvailable").check();
    await page.locator("#supportStatus").filter({ hasText: "Een medewerker moet je gesprek" }).waitFor();
    await desk.getByRole("button", { name: "Oppakken", exact: true }).click();
    await desk.locator("#supportStaffReply").waitFor();
    if (!(await page.evaluate(() => typeof RTCPeerConnection === "function"))) {
      await page.locator("#supportCall .support-call-error").filter({ hasText: "browser ondersteunt" }).waitFor();
      assert.equal(await page.locator("#supportSend").isVisible(), true, "Text chat remains usable without WebRTC");
    }
    await desk.locator("#supportStaffMessages").getByText("Hoi, ik heb een vraag 👋 <script>window.injection=true</script>", { exact: true }).waitFor();
    assert.equal(await desk.locator("#supportThreadTitle img").count(), 0, "Visitor name is rendered as text");
    assert.equal(await desk.evaluate(() => window.injection), undefined, "Message is rendered as text in staff inbox");
    await desk.locator("#supportStaffText").fill("Hallo Sam, waarmee kan ik je helpen?");
    await desk.locator('#supportStaffReply button[type="submit"]').click();
    await page.locator("#supportMessages").getByText("Hallo Sam, waarmee kan ik je helpen?", { exact: true }).waitFor();
    await page.locator("#supportStatus").filter({ hasText: "Staff1 (test) helpt je" }).waitFor();
    assert.equal(await desk.locator("#supportAdminLink").isVisible(), false, "Staff receives no admin navigation");
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
    await page.locator("#supportText").fill("Dit concept blijft staan");
    await page.locator('#supportAttachments input[type="file"]').setInputFiles({ name: "rapport.pdf", mimeType: "application/pdf", buffer: pdf });
    await page.locator('#supportFileExtras [data-file="send"]').click();
    await page.locator("#supportMessages .support-file").filter({ hasText: "rapport.pdf" }).waitFor();
    assert.equal(await page.locator("#supportText").inputValue(), "Dit concept blijft staan", "File upload preserves the text draft");
    await page.locator("#supportText").fill("");
    await desk.locator("#supportStaffMessages .support-file").filter({ hasText: "rapport.pdf" }).waitFor();
    const fileUrl = await page.locator("#supportMessages .support-file").filter({ hasText: "rapport.pdf" }).getAttribute("href");
    const download = await visitor.request.get(fileUrl);
    assert.equal(download.status(), 200); assert.deepEqual(await download.body(), pdf);
    assert.ok(download.headers()["content-disposition"].startsWith("attachment;"), "PDF downloads rather than executing in the website");
    assert.equal(download.headers()["x-content-type-options"], "nosniff");
    assert.equal((await stranger.request.get(fileUrl)).status(), 404, "Other visitor cannot download attachment");
    const staffFileUrl = fileUrl.replace("/api/support-chat.php", "/admin/support-chat-api.php");
    assert.equal((await staff.request.get(staffFileUrl)).status(), 200, "Assigned staff download uses staff authentication");
    const currentSession = await (await visitor.request.get(origin + "/api/support-chat.php")).json();
    const forgedUpload = { file: { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") }, threadId, clientId: "forged-file" };
    assert.equal((await visitor.request.post(origin + "/api/support-chat.php", { multipart: forgedUpload })).status(), 403, "Multipart uploads require CSRF");
    assert.equal((await visitor.request.post(origin + "/api/support-chat.php", { headers: { "X-CSRF-Token": currentSession.csrfToken }, multipart: forgedUpload })).status(), 400, "File contents, not just browser MIME, are checked");
    const photo = await page.screenshot({ clip: { x: 0, y: 0, width: 20, height: 20 } });
    await desk.locator('#supportStaffAttachments input[type="file"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: photo });
    await desk.locator('#supportStaffAttachments [data-file="send"]').click();
    await page.locator('#supportMessages .support-file img[alt="foto.png"]').waitFor();
    await page.waitForFunction(() => document.querySelector('#supportMessages .support-file img[alt="foto.png"]')?.naturalWidth > 0);
    assert.equal(await page.locator("#supportText").inputValue(), "", "File upload does not insert filenames in RTT text");
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-popup-" + label + ".png") });
    await desk.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-inbox-" + label + ".png") });
    let dropped = false;
    await page.route("**/api/support-chat.php", async (route) => {
      if (!dropped && route.request().method() === "POST" && route.request().postDataJSON()?.action === "send") {
        dropped = true; await route.fetch(); await route.abort(); return;
      }
      await route.continue();
    });
    await page.locator("#supportText").fill("Antwoord na verbindingsfout");
    await page.locator('#supportSend button[type="submit"]').click();
    await page.locator("#supportError").waitFor();
    assert.equal(await page.locator("#supportText").inputValue(), "Antwoord na verbindingsfout", "Unconfirmed text remains available for retry");
    await page.unroute("**/api/support-chat.php");
    await page.locator('#supportSend button[type="submit"]').click();
    await page.waitForFunction(() => document.getElementById("supportText").value === "");
    const retried = await (await visitor.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(retried.messages.filter((message) => message.text === "Antwoord na verbindingsfout").length, 1, "Lost response retry does not duplicate message");
    await page.locator("#supportLauncher").click();
    assert.equal(await page.locator("#supportDialog").isVisible(), false);
    await page.goto(origin + "/demo.html");
    await page.locator("#supportLauncher").click();
    await page.locator("#supportMessages").getByText("Hallo Sam, waarmee kan ik je helpen?", { exact: true }).waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 740 });
      const composer = await page.locator("#supportSend").boundingBox();
      const input = await page.locator("#supportText").boundingBox();
      const composerIcons = page.locator('#supportSend [data-file="choose"], #supportEmoji, #supportVideo, #supportMicrophone');
      for (const control of await composerIcons.all()) {
        const icon = await control.boundingBox();
        assert.ok(icon.x >= composer.x && icon.x + icon.width <= composer.x + composer.width && Math.abs(icon.y + icon.height - input.y - input.height) <= 2, "Composer icons stay on one row on narrow phones");
      }
      assert.ok(input.width >= 40, "Text field retains usable width");
      await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-composer-" + label + "-" + width + ".png") });
      const bounds = await page.locator("#supportDialog").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= 740, "Popup fits narrow mobile viewport");
      const header = page.locator(".support-heading");
      const controls = header.locator("#supportTranslation summary, [data-action='interpreter'], .support-call-help summary, #supportMinimize");
      assert.equal(await controls.count(), 4, "Language, interpreter, help and close share the header");
      const closeBounds = await page.locator("#supportMinimize").boundingBox();
      const headerBounds = await header.boundingBox();
      for (const control of await controls.all()) {
        const iconBounds = await control.boundingBox();
        assert.ok(Math.abs(iconBounds.y - closeBounds.y) <= 1, "All four icons sit on one row beside close");
        assert.ok(iconBounds.width >= 44 && iconBounds.height >= 44, "Icons keep accessible touch targets");
        assert.ok(iconBounds.x >= headerBounds.x && iconBounds.x + iconBounds.width <= headerBounds.x + headerBounds.width, "Header icons never overflow");
        assert.ok(await control.getAttribute("aria-label"), "Icon has an accessible name");
      }
      await header.locator(".support-call-help summary").focus();
      await page.keyboard.press("Enter");
      await header.locator(".support-call-notice").waitFor();
      await page.locator("#supportTranslation summary").click();
      await header.locator(".support-call-notice").waitFor({ state: "hidden" });
      const panel = page.locator("#supportTranslation .support-translation-body");
      await panel.waitFor();
      const panelBounds = await panel.boundingBox();
      assert.ok(panelBounds.width > 200 && panelBounds.x >= bounds.x && panelBounds.x + panelBounds.width <= bounds.x + bounds.width, "Settings use the popup width, not the narrow icon width");
      assert.equal(await panel.locator('button[type="submit"]').evaluate((button) => getComputedStyle(button).color !== getComputedStyle(button).backgroundColor), true, "Save stays readable on the white settings panel");
      const saveButton = panel.locator('button[type="submit"]');
      await saveButton.scrollIntoViewIfNeeded();
      assert.equal(await saveButton.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      }), true, "Settings save is reachable inside the popup, including on small screens");
      await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-header-settings-" + label + "-" + width + ".png") });
      await page.locator("#supportTranslation summary").click();
      assert.equal(await page.locator("#supportCall .support-call-actions").count(), 0, "No duplicate toolbar below the header");
      await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-header-" + label + "-" + width + ".png") });
    }
    await desk.setViewportSize({ width: 390, height: 844 });
    assert.equal(await desk.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Staff inbox fits mobile");
    await other.goto(origin + "/admin/support-chat.php");
    await other.locator("#supportStaffEmail").fill("staff2@example.test");
    await other.locator("#supportStaffPassword").fill("fixture-password-only");
    await other.locator('#supportStaffLogin button[type="submit"]').click();
    await other.locator("#supportStaffWorkspace").waitFor();
    assert.equal((await stranger.request.get(origin + "/admin/support-chat-api.php?thread=" + threadId)).status(), 403, "Another staff member cannot read assigned transcript");
    assert.equal((await stranger.request.get(staffFileUrl)).status(), 403, "Another staff member cannot download attachments");
    await staff.request.get(origin + "/fixture/block");
    await desk.locator("#supportStaffLogin").waitFor();
    assert.equal((await staff.request.get(staffFileUrl)).status(), 401, "Blocked staff loses attachment access");
    assert.equal(await desk.locator("#supportStaffMessages").innerText(), "", "Blocking staff clears visible transcript");
    await other.getByRole("button", { name: "Oppakken", exact: true }).click();
    await other.locator("#supportStaffReply").waitFor();
    assert.equal(await page.locator("#supportEnd").count(), 0, "No second end-chat button below the composer");
    await page.locator("#supportText").fill("Niet verstuurd concept");
    await page.locator("#supportMinimize").click();
    await page.locator("#supportEndConfirm").waitFor();
    assert.equal(await page.locator("#supportMinimize").getAttribute("aria-label"), "Alles afsluiten");
    await page.screenshot({ path: path.join(os.tmpdir(), "teletyptel-close-all-" + label + ".png") });
    assert.equal((await (await visitor.request.get(origin + "/api/support-chat.php")).json()).thread.status, "active", "X first asks for confirmation");
    await page.locator("#supportEndNo").click();
    assert.equal(await page.locator("#supportText").inputValue(), "Niet verstuurd concept", "Cancel keeps the draft and conversation");
    await page.locator("#supportMinimize").click();
    await page.route("**/api/support-chat.php", async (route) => {
      if (route.request().method() === "POST" && route.request().postDataJSON()?.action === "close") await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) });
      else await route.continue();
    });
    await page.locator("#supportEndYes").click();
    await page.locator("#supportError").waitFor();
    assert.equal(await page.locator("#supportDialog").isVisible(), true, "Failed close is not presented as success");
    assert.equal(await page.locator("#supportText").inputValue(), "Niet verstuurd concept", "Failed close preserves unsent text");
    await page.unroute("**/api/support-chat.php");
    await page.locator("#supportEndYes").click();
    await page.locator("#supportDialog").waitFor({ state: "hidden" });
    await other.locator("#supportThreadStatus").filter({ hasText: "Afgesloten" }).waitFor();
    assert.equal(await other.locator("#supportStaffReply").isVisible(), false);
    assert.equal((await (await visitor.request.get(origin + "/api/support-chat.php")).json()).thread.status, "closed", "X closes the conversation on the server");
    await page.locator("#supportLauncher").click();
    assert.equal(await page.locator("#supportName").inputValue(), "", "New chat does not prefill prior visitor name");
    await page.keyboard.press("Escape");
    await page.locator("#supportDialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.activeElement.id), "supportLauncher", "Close restores keyboard focus");
    await page.reload(); await page.locator("#supportLauncher").click(); await page.locator("#supportStart").waitFor();
    await page.locator("#supportStatus").filter({ hasText: /beschikbaar/ }).waitFor();
    assert.equal(await page.locator("#supportConversation").isVisible(), false, "A reload does not reopen the closed conversation");
    assert.deepEqual(failures, []);
    console.log("Support chat passed: " + label + ", real PHP/SQLite visitor/staff exchange, cookie/CSRF isolation, claim permissions, safe text, retry deduplication, revocation, mobile layout and close/resume.");
  } finally {
    await browser?.close(); server.kill();
    await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
    const target = path.resolve(temporary);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("teletyptel-support-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

(async () => { await check(chromium, "Pixel 7", "android"); await check(webkit, "iPhone 13", "iphone"); })().catch((error) => { console.error(error); process.exitCode = 1; });
