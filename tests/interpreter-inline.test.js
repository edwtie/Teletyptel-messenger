const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-interpreter-inline-"));
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const server = spawn(process.env.PHP_TEST_BINARY || "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe", ["-S", "127.0.0.1:" + port, "php/tests/interpreter-http-fixture.php"], {
    cwd: path.resolve(__dirname, ".."), windowsHide: true, env: { ...process.env, TELETYPTEL_INTERPRETER_TEST_DB: path.join(temporary, "fixture.sqlite") }, stdio: "ignore"
  });
  let browser;
  try {
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"], headless: true });
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(origin + "/missing"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    const pages = {}, failures = [];
    for (const account of ["alice", "bob", "tolk", "admin"]) {
      const context = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
      const page = await context.newPage();
      page.on("pageerror", (error) => failures.push(error.message));
      await page.goto(origin + "/fixture/login?account=" + account);
      pages[account] = page;
    }
    await pages.tolk.goto(origin + "/tolk/");
    await pages.tolk.locator("summary").click();
    await pages.tolk.locator("#register").click();
    await pages.tolk.locator("#profileStatus").filter({ hasText: "wacht op goedkeuring" }).waitFor();
    await pages.admin.goto(origin + "/admin/interpreters.php");
    pages.admin.once("dialog", (dialog) => dialog.accept());
    await pages.admin.getByRole("button", { name: "Goedkeuren / deblokkeren" }).click();
    await pages.tolk.locator("#availabilityLabel").waitFor();
    for (const [account, other] of [["alice", "bob"], ["bob", "alice"]]) {
      const page = pages[account];
      await page.goto(origin + "/chat.html");
      await page.evaluate(async ({ account, other }) => {
        const button = document.getElementById("interpreterButton");
        const banner = document.getElementById("interpreterBanner");
        const panel = document.getElementById("callPanel");
        const input = document.getElementById("messageInput");
        const form = document.createElement("form");
        form.append(input);
        document.body.replaceChildren(button, banner, panel, form);
        document.body.className = "call-active";
        document.body.style.cssText = "display:block;padding:12px;height:100vh";
        panel.hidden = false;
        panel.style.height = "50vh";
        window.nativeMessages = [];
        window.addedTracks = [];
        window.startRequests = 0;
        const addTrack = RTCPeerConnection.prototype.addTrack;
        RTCPeerConnection.prototype.addTrack = function (track, ...streams) {
          window.addedTracks.push({ pc: this, track });
          return addTrack.call(this, track, ...streams);
        };
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        const connection = new RTCPeerConnection({ iceServers: [] });
        stream.getTracks().forEach((track) => connection.addTrack(track, stream));
        const remote = new MediaStream();
        document.getElementById("localVideo").srcObject = stream;
        document.getElementById("localVideo").muted = true;
        document.getElementById("remoteVideo").srcObject = remote;
        connection.ontrack = (event) => remote.addTrack(event.track);
        const bind = (channel) => { window.nativeChannel = channel; channel.onmessage = (event) => window.nativeMessages.push(event.data); };
        connection.ondatachannel = (event) => bind(event.channel);
        if (account === "alice") bind(connection.createDataChannel("original"));
        window.nativeCall = { sid: "native-fixture", peer: other + "@example.test", localStream: stream, pc: connection };
        window.originalCall = window.nativeCall;
        window.nativeJid = account + "@example.test";
        window.currentPeer = other + "@example.test";
        window.waitIce = () => connection.iceGatheringState === "complete" ? Promise.resolve() : new Promise((resolve) => connection.addEventListener("icegatheringstatechange", () => { if (connection.iceGatheringState === "complete") resolve(); }));
        form.addEventListener("submit", (event) => { event.preventDefault(); window.nativeChannel.send(input.value); window.inlineInterpreter.final(input.value); input.value = ""; });
      }, { account, other });
      await page.addScriptTag({ url: origin + "/chat-interpreter.js" });
      await page.evaluate(() => {
        window.inlineInterpreter = window.TeleTypTelInterpreter.create({
          selectedPeer: () => window.currentPeer, getCall: () => window.nativeCall,
          startCall: async () => { window.startRequests++; window.nativeCall = window.originalCall; },
          selfJid: () => window.nativeJid, conversationPeer: () => window.currentPeer,
          mediaChanged: () => {}, translate: (key, fallback) => fallback
        });
      });
    }
    const offer = await pages.alice.evaluate(async () => { const connection = window.nativeCall.pc; await connection.setLocalDescription(await connection.createOffer()); await window.waitIce(); return connection.localDescription.toJSON(); });
    const answer = await pages.bob.evaluate(async (offer) => { const connection = window.nativeCall.pc; await connection.setRemoteDescription(offer); await connection.setLocalDescription(await connection.createAnswer()); await window.waitIce(); return connection.localDescription.toJSON(); }, offer);
    await pages.alice.evaluate((answer) => window.nativeCall.pc.setRemoteDescription(answer), answer);
    for (const page of [pages.alice, pages.bob]) await page.waitForFunction(() => window.nativeCall.pc.connectionState === "connected" && window.nativeChannel.readyState === "open");
    const originalIntact = async () => {
      for (const page of [pages.alice, pages.bob]) assert.equal(await page.evaluate(() => window.nativeCall === window.originalCall && window.nativeCall.pc.connectionState === "connected" && window.nativeCall.localStream.getTracks().every((track) => track.readyState === "live")), true, "Original call and source tracks stay intact");
    };
    await pages.alice.locator("#interpreterButton").click();
    await pages.alice.locator("#interpreterStatus").filter({ hasText: "Tolk zoeken" }).waitFor();
    assert.equal(pages.alice.url(), origin + "/chat.html", "No separate workspace or form for requester");
    assert.equal(pages.alice.context().pages().length, 1);
    await pages.bob.locator("#interpreterAllow").waitFor();
    await pages.alice.locator("#interpreterCancel").click();
    await originalIntact();
    await pages.bob.locator("#interpreterStatus").filter({ hasText: "verlopen" }).waitFor();
    await pages.tolk.locator("#available").check();
    await pages.alice.locator("#interpreterButton").click();
    await pages.tolk.getByRole("button", { name: "Accepteren", exact: true }).click();
    await pages.tolk.waitForURL(/room=/);
    await pages.tolk.locator("#rttPanel").waitFor();
    assert.equal(await pages.tolk.locator(".video-tile").count(), 1, "Interpreter starts their own preview but no media is sent before both participants consent");
    const beforeConsent = await (await pages.bob.request.get(origin + "/api/interpreter.php")).json();
    const roomId = beforeConsent.rooms[0].room_id;
    const room = await (await pages.bob.request.get(origin + "/api/interpreter.php?room=" + roomId)).json();
    assert.equal(room.signals.length, 0, "No signaling or media sharing before recipient consent");
    assert.equal(await pages.bob.locator("#interpreterTile").isVisible(), false);
    await originalIntact();
    await pages.bob.locator("#interpreterAllow").click();
    for (const page of [pages.alice, pages.bob]) {
      await page.locator("#interpreterTile").waitFor();
      await page.waitForFunction(() => {
        const video = document.getElementById("interpreterVideo");
        return video.readyState >= 2 && video.srcObject.getAudioTracks().length === 1 && video.srcObject.getVideoTracks().length === 1;
      });
      assert.equal(await page.evaluate(() => window.addedTracks.filter((entry) => entry.pc !== window.originalCall.pc).every((entry) => window.originalCall.localStream.getTracks().includes(entry.track))), true, "New interpreter leg reuses original tracks, including mute settings");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => {
        const tile = document.getElementById("interpreterTile").getBoundingClientRect();
        const controls = document.querySelector(".call-media-controls").getBoundingClientRect();
        const original = document.getElementById("remoteVideo").getBoundingClientRect();
        const local = document.getElementById("localVideo").getBoundingClientRect();
        return tile.right < original.left && tile.right < local.left && tile.bottom <= controls.top && getComputedStyle(document.getElementById("interpreterVideo")).objectFit === "contain";
      }), true, "Interpreter video is not cropped or covered by original video tiles");
    }
    await pages.tolk.waitForFunction(() => [...document.querySelectorAll(".video-tile p")].filter((label) => label.textContent.includes("Verbonden")).length === 2);
    await originalIntact();
    await pages.alice.locator("#messageInput").fill("Ik gebaar en typ 👋");
    await pages.tolk.locator("#drafts").filter({ hasText: "Ik gebaar en typ 👋" }).waitFor();
    await pages.bob.locator("#messageInput").fill("Ik hoor de tolk");
    await pages.tolk.locator("#drafts").filter({ hasText: "Ik hoor de tolk" }).waitFor();
    await pages.tolk.locator("#text").fill("Ik vertaal voor jullie");
    for (const page of [pages.alice, pages.bob]) await page.locator("#interpreterText").filter({ hasText: "Ik vertaal voor jullie" }).waitFor();
    await pages.tolk.getByRole("button", { name: "Tekst afronden" }).click();
    await pages.alice.locator("#interpreterPreviousText").filter({ hasText: "Ik vertaal voor jullie" }).waitFor();
    await pages.alice.evaluate(() => { window.currentPeer = "stranger@example.test"; });
    await pages.alice.locator("#messageInput").fill("Other private conversation");
    await pages.alice.waitForTimeout(350);
    assert.ok(!(await pages.tolk.locator("#drafts").innerText()).includes("Other private conversation"), "Unrelated chat text is not shared");
    await pages.alice.evaluate(() => { window.currentPeer = "bob@example.test"; });
    await pages.alice.screenshot({ path: path.join(os.tmpdir(), "teletyptel-inline-interpreter.png") });
    await pages.alice.locator("#interpreterRemove").click();
    await pages.bob.locator("#interpreterTile").waitFor({ state: "hidden" });
    await pages.tolk.locator("#sessionState").filter({ hasText: "beëindigd" }).waitFor();
    await originalIntact();
    await pages.alice.evaluate(() => window.nativeChannel.send("Original call still alive"));
    await pages.bob.waitForFunction(() => window.nativeMessages.includes("Original call still alive"));
    await pages.alice.evaluate(() => { window.nativeCall = null; });
    await pages.alice.locator("#interpreterButton").click();
    await pages.alice.waitForFunction(() => window.startRequests === 1);
    await pages.alice.locator("#interpreterStatus").filter({ hasText: "Tolk zoeken" }).waitFor();
    await pages.bob.locator("#interpreterAllow").waitFor();
    await pages.alice.evaluate(() => window.inlineInterpreter.endCall("native-fixture"));
    await pages.bob.locator("#interpreterStatus").filter({ hasText: "verlopen" }).waitFor();
    await originalIntact();
    assert.deepEqual(failures, []);
    console.log("Inline interpreter passed: real original WebRTC call preserved, one-click request/start adapter, cancel, consent gate, automatic interpreter join, two extra media legs, live RTT, no unrelated text sharing, removal without dropping original call.");
  } finally {
    await browser?.close(); server.kill();
    await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
    const target = path.resolve(temporary);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("teletyptel-interpreter-inline-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
