const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-support-call-"));
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
    browser = await chromium.launch({ headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
    const pages = {}, failures = [];
    for (const role of ["visitor", "staff", "interpreter"]) {
      const context = await browser.newContext({ ...(role === "visitor" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 900 } }), locale: "nl-NL", serviceWorkers: "block" });
      await context.addInitScript(() => {
        window.fixtureConnections = []; window.fixtureStreams = []; window.fixtureMediaRequests = 0;
        const original = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends original { constructor(config) { super(config); window.fixtureConnections.push(this); } };
        const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (options) => {
          window.fixtureMediaRequests++;
          if (window.fixtureDelayMedia) { window.fixtureDelayMedia = false; await new Promise((resolve) => { window.fixtureResumeMedia = resolve; }); }
          const stream = await getMedia(options); window.fixtureStreams.push(stream); return stream;
        };
        window.fixtureCaptureMedia = navigator.mediaDevices.getUserMedia;
      });
      pages[role] = await context.newPage(); pages[role].on("pageerror", (error) => failures.push(error.message));
    }
    const visitor = pages.visitor, staff = pages.staff, interpreter = pages.interpreter;
    const visitorCall = visitor.locator("#supportDialog"), staffCall = staff.locator('section[aria-labelledby="supportThreadTitle"]');
    const choose = (area, action) => area.locator('[data-action="' + action + '"]');
    const connected = async (page, count) => page.waitForFunction((expected) => window.fixtureConnections.filter((connection) => connection.connectionState === "connected").length === expected, count);
    await visitor.goto(origin + "/"); await visitor.locator("#supportLauncher").click();
    await visitor.locator("#supportStatus").filter({ hasText: "geen medewerker" }).waitFor();
    await visitor.locator("#supportName").fill("Sam (test)"); await visitor.locator("#supportAcknowledged").check(); await visitor.locator('#supportStart button[type="submit"]').click();
    await visitor.locator("#supportSend").waitFor();
    assert.equal(await choose(visitorCall, "rtt").count(), 0, "RTT has no manual start button");
    assert.equal(await choose(visitorCall, "tc").count(), 0, "No separate TC button");
    assert.equal(await choose(visitorCall, "interpreter").isDisabled(), true, "Wait for assigned staff before interpreter call");
    assert.equal(await choose(visitorCall, "interpreter").innerText(), "", "Interpreter control is icon only");
    assert.equal(await choose(visitorCall, "interpreter").getAttribute("aria-label"), "Gebarentolk oproepen");
    assert.equal(await visitorCall.locator(".support-call-notice").isVisible(), false, "Instructions collapsed under help");
    await visitorCall.locator(".support-call-help summary").click();
    assert.equal(await visitorCall.locator(".support-call-notice").isVisible(), true);
    await visitorCall.locator(".support-call-help summary").click();
    for (const page of [visitor, staff]) assert.equal(await page.evaluate(() => window.fixtureConnections.length), 0, "No RTT before assigned staff opens chat");
    await staff.goto(origin + "/admin/support-chat.php");
    await staff.locator("#supportStaffEmail").fill("staff1@example.test"); await staff.locator("#supportStaffPassword").fill("fixture-password-only");
    await staff.locator('#supportStaffLogin button[type="submit"]').click(); await staff.getByRole("button", { name: "Oppakken", exact: true }).click();
    await staff.locator("#supportStaffReply").waitFor();
    await connected(visitor, 1); await connected(staff, 1);
    for (const area of [visitorCall, staffCall]) assert.equal(await choose(area, "join").isVisible(), false, "RTT joins automatically without an extra click");
    for (const page of [visitor, staff]) assert.equal(await page.evaluate(() => window.fixtureMediaRequests), 0, "RTT never asks for camera or microphone");
    await visitor.locator("#supportText").fill("Live tekst 👋"); await staffCall.locator(".support-call-drafts span").filter({ hasText: "Live tekst 👋" }).waitFor();
    await visitor.locator("#supportLive .support-call-draft.own > span").getByText("Live tekst 👋", { exact: true }).waitFor();
    assert.equal(await visitor.evaluate(() => {
      const live = document.getElementById("supportLive"), messages = document.getElementById("supportMessages"), send = document.getElementById("supportSend");
      return Boolean(messages.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(live.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true, "Live balloons sit after history and before the composer");
    await visitor.locator("#supportText").fill("Live 👋");
    await staff.waitForFunction(() => document.querySelector("#supportStaffLive .support-call-draft.visitor > span")?.textContent === "Live 👋");
    await visitor.locator("#supportLive .support-call-draft.own > span").getByText("Live 👋", { exact: true }).waitFor();
    let history = await (await visitor.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(history.messages.length, 0, "Unsent RTT is not in stored chat history");
    await visitor.locator('#supportSend button[type="submit"]').click(); await staff.locator("#supportStaffMessages").getByText("Live 👋", { exact: true }).waitFor();
    await staff.waitForFunction(() => document.querySelector("#supportStaffLive .support-call-draft.visitor > span")?.textContent === "");
    assert.equal(await visitor.locator("#supportLive .support-call-draft.own").isVisible(), false, "Sending replaces the live balloon with the saved message");
    assert.equal(await visitor.locator("#supportMicrophone").isDisabled(), true, "Composer microphone cannot capture audio outside video calls");
    await visitor.locator("#supportVideo").click(); await staffCall.locator(".support-call-incoming p").filter({ hasText: "camera en microfoon" }).waitFor();
    assert.equal(await staff.evaluate(() => window.fixtureMediaRequests), 0, "Recipient camera does not start from invitation alone");
    await choose(staffCall, "join").click(); await connected(visitor, 1); await connected(staff, 1);
    for (const [page, selector] of [[visitor, "#supportCall"], [staff, "#supportStaffCall"]]) {
      await page.waitForFunction((root) => [...document.querySelectorAll(root + " .support-call-tile:not(.self) video")].some((video) => video.readyState >= 2 && video.srcObject?.getAudioTracks().length === 1 && video.srcObject?.getVideoTracks().length === 1), selector);
      await page.evaluate(() => { window.fixtureOriginalTc = window.fixtureConnections.find((connection) => connection.connectionState === "connected"); window.fixtureOriginalStream = window.fixtureStreams.at(-1); });
    }
    await visitor.locator("#supportMicrophone").click();
    assert.equal(await visitor.evaluate(() => window.fixtureOriginalStream.getAudioTracks()[0].enabled), false, "Mute applies to captured microphone");
    await visitor.locator("#supportMicrophone").click();
    await visitor.locator("#supportVideo").click();
    assert.equal(await visitor.evaluate(() => window.fixtureOriginalStream.getVideoTracks()[0].enabled), false, "Composer camera can turn video off");
    await visitor.locator("#supportVideo").click();
    await choose(visitorCall, "interpreter").click();
    await interpreter.goto(origin + "/fixture/interpreter"); await interpreter.goto(origin + "/tolk/"); await interpreter.locator("summary").click();
    await interpreter.locator("#supportInterpreterQueue").waitFor();
    await choose(staffCall, "allow").waitFor();
    let queue = await (await interpreter.request.get(origin + "/api/support-call-interpreter.php")).json();
    assert.equal(queue.queue.length, 0, "No queue entry before the other participant permits interpreter");
    await choose(staffCall, "allow").click();
    await interpreter.getByRole("button", { name: "Klantenservice-oproep accepteren", exact: true }).click();
    await interpreter.waitForURL(/support\.php\?call=/);
    for (const page of [visitor, staff, interpreter]) await connected(page, 2);
    for (const page of [visitor, staff]) {
      assert.equal(await page.evaluate(() => window.fixtureOriginalTc.connectionState), "connected", "Original TC connection survives interpreter joining");
      assert.equal(await page.evaluate(() => window.fixtureOriginalStream.getTracks().every((track) => track.readyState === "live")), true);
      assert.equal(await page.evaluate(() => window.fixtureConnections.filter((connection) => connection.connectionState === "connected").every((connection) => connection.getSenders().filter((sender) => sender.track).every((sender) => window.fixtureOriginalStream.getTracks().includes(sender.track)))), true, "Interpreter legs reuse original tracks and mute state");
    }
    assert.ok(!(await interpreter.locator("#supportInterpreterCall").innerText()).includes("Live 👋"), "Interpreter does not receive earlier history");
    await visitor.locator("#supportText").fill("Ik gebaar en typ"); await interpreter.locator(".support-call-drafts span").filter({ hasText: "Ik gebaar en typ" }).waitFor();
    await staff.locator("#supportStaffText").fill("Ik luister naar de tolk"); await interpreter.locator(".support-call-drafts span").filter({ hasText: "Ik luister naar de tolk" }).waitFor();
    await interpreter.locator("#supportInterpreterText").fill("Ik vertaal voor jullie");
    for (const area of [visitorCall, staffCall]) await area.locator(".support-call-drafts span").filter({ hasText: "Ik vertaal voor jullie" }).waitFor();
    await interpreter.locator('#supportInterpreterTextForm button[type="submit"]').click();
    history = await (await visitor.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(history.messages.length, 1, "Live three-way text is not stored as a support message");
    assert.equal(await visitor.evaluate(() => {
      const video = document.querySelector("#supportCall .support-call-tile.interpreter video").getBoundingClientRect();
      const input = document.getElementById("supportText").getBoundingClientRect();
      return video.top >= 0 && video.bottom <= innerHeight && input.top >= 0 && input.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
    }), true, "Interpreter video and composer both remain visible on the phone viewport");
    await visitor.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-tc-visitor.png") });
    await staff.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-tc-staff.png") });
    await interpreter.screenshot({ path: path.join(os.tmpdir(), "teletyptel-support-tc-interpreter.png") });
    await choose(visitorCall, "cancel-interpreter").click();
    await connected(visitor, 1); await connected(staff, 1);
    await interpreter.waitForFunction(() => window.fixtureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
    for (const page of [visitor, staff]) assert.equal(await page.evaluate(() => window.fixtureOriginalTc.connectionState), "connected", "Removing interpreter does not drop original TC");
    await visitor.locator("#supportText").fill("Samen verder zonder tolk"); await staffCall.locator(".support-call-drafts span").filter({ hasText: "Samen verder zonder tolk" }).waitFor();
    await choose(visitorCall, "end").click();
    for (const page of [visitor, staff]) await page.waitForFunction(() => window.fixtureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
    await connected(visitor, 1); await connected(staff, 1);
    await visitor.locator("#supportText").fill("Automatisch terug naar RTT");
    await staffCall.locator(".support-call-drafts span").filter({ hasText: "Automatisch terug naar RTT" }).waitFor();
    await visitor.locator("#supportMinimize").click();
    for (const page of [visitor, staff]) await page.waitForFunction(() => window.fixtureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
    assert.equal((await (await visitor.request.get(origin + "/api/support-chat.php")).json()).thread.status, "active", "Closing popup ends media, not text chat");
    await visitor.locator("#supportLauncher").click();
    await connected(visitor, 1); await connected(staff, 1);
    await visitor.evaluate(() => { window.fixtureDelayMedia = true; });
    await choose(visitorCall, "interpreter").click(); await visitor.waitForFunction(() => typeof window.fixtureResumeMedia === "function");
    await visitor.locator("#supportMinimize").click(); await visitor.evaluate(() => window.fixtureResumeMedia());
    await visitor.waitForFunction(() => window.fixtureStreams.length >= 2 && window.fixtureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
    await visitor.locator("#supportLauncher").click();
    await connected(visitor, 1); await connected(staff, 1);
    await visitor.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); }; });
    await choose(visitorCall, "interpreter").click();
    await visitorCall.locator(".support-call-error").filter({ hasText: "niet toegestaan" }).waitFor();
    assert.equal(await visitor.locator("#supportSend").isVisible(), true, "Declining camera permission preserves text chat");
    await connected(visitor, 1); await connected(staff, 1);
    await visitor.locator("#supportText").fill("RTT blijft werken zonder camera");
    await staffCall.locator(".support-call-drafts span").filter({ hasText: "RTT blijft werken zonder camera" }).waitFor();
    await visitor.locator("#supportClose").click(); await visitor.locator("#supportEndYes").click();
    await visitor.locator("#supportDialog").waitFor({ state: "hidden" });
    assert.equal((await (await visitor.request.get(origin + "/api/support-chat.php")).json()).thread.status, "closed", "X closes the RTT conversation");
    await visitor.locator("#supportLauncher").click();
    await visitor.locator("#supportName").fill("Nieuw videogesprek (test)"); await visitor.locator("#supportAcknowledged").check();
    await visitor.locator('#supportStart button[type="submit"]').click();
    await staff.getByRole("button", { name: "Oppakken", exact: true }).click();
    await connected(visitor, 1); await connected(staff, 1);
    await visitor.evaluate(() => { navigator.mediaDevices.getUserMedia = window.fixtureCaptureMedia; });
    await visitor.locator("#supportVideo").click();
    await choose(staffCall, "join").waitFor().catch(async (failure) => {
      await visitor.screenshot({ path: path.join(os.tmpdir(), "teletyptel-close-video-failure.png") });
      console.error(await visitor.locator("#supportCall").innerText());
      throw failure;
    });
    await choose(staffCall, "join").click();
    await connected(visitor, 1); await connected(staff, 1);
    await visitor.locator("#supportClose").click();
    await visitor.locator("#supportEndNo").click();
    await connected(visitor, 1);
    assert.equal(await visitor.evaluate(() => window.fixtureStreams.at(-1).getTracks().every((track) => track.readyState === "live")), true, "Cancel does not stop the video call");
    await visitor.locator("#supportClose").click();
    await visitor.locator("#supportEndYes").click();
    await visitor.locator("#supportDialog").waitFor({ state: "hidden" });
    await visitor.waitForFunction(() => window.fixtureConnections.every((connection) => connection.connectionState === "closed"));
    for (const page of [visitor, staff]) await page.waitForFunction(() => window.fixtureStreams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")));
    assert.equal((await (await visitor.request.get(origin + "/api/support-chat.php")).json()).thread.status, "closed", "X closes RTT and the support conversation");
    assert.deepEqual(failures, []);
    console.log("Support media passed: real WebRTC RTT without capture, explicit TC consent, three-party interpreter audio/video + live text, original call preservation, no transcript replay, and capture cancellation cleanup.");
  } finally {
    await browser?.close(); server.kill();
    await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
    const target = path.resolve(temporary);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("teletyptel-support-call-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
