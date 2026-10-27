const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { chromium, webkit, devices } = require("playwright");

async function check(engine, name, media) {
  const root = path.resolve(__dirname, "..");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-interpreter-test-"));
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = "http://127.0.0.1:" + port;
  const server = spawn(process.env.PHP_TEST_BINARY || "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe", ["-S", "127.0.0.1:" + port, "php/tests/interpreter-http-fixture.php"], {
    cwd: root, windowsHide: true, env: { ...process.env, TELETYPTEL_INTERPRETER_TEST_DB: path.join(temporary, "fixture.sqlite") }, stdio: "ignore"
  });
  const browser = await engine.launch({ headless: true, args: engine === chromium ? ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] : [] });
  const failures = [];
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { await fetch(origin + "/missing"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    const pages = {};
    for (const account of ["alice", "bob", "tolk", "stranger", "admin", "staff"]) {
      const context = await browser.newContext({ ...(name === "iphone" ? devices["iPhone 13"] : devices["Pixel 7"]), serviceWorkers: "block" });
      const page = await context.newPage();
      page.on("pageerror", (error) => failures.push(error.message));
      await page.goto(origin + "/fixture/login?account=" + account);
      pages[account] = page;
    }
    assert.equal((await pages.stranger.request.post(origin + "/api/interpreter.php", { data: { action: "register" } })).status(), 403, "Mutations require CSRF");
    assert.equal((await pages.staff.request.get(origin + "/admin/interpreters-api.php")).status(), 403, "Staff cannot manage interpreter privileges");
    await pages.tolk.goto(origin + "/tolk/");
    await pages.tolk.locator("details summary").click();
    await pages.tolk.locator("#register").click();
    await pages.tolk.locator("#profileStatus").filter({ hasText: "wacht op goedkeuring" }).waitFor();
    assert.equal(await pages.tolk.locator("#availabilityLabel").isVisible(), false);
    await pages.admin.goto(origin + "/admin/interpreters.php");
    pages.admin.once("dialog", (dialog) => dialog.accept());
    await pages.admin.getByRole("button", { name: "Goedkeuren / deblokkeren" }).click();
    await pages.tolk.locator("#availabilityLabel").waitFor();
    await pages.tolk.locator("#available").check();
    await pages.alice.goto(origin + "/tolk/?peer=bob%40example.test");
    await pages.bob.goto(origin + "/tolk/");
    assert.equal(await pages.alice.getByRole("button", { name: "Tolkcontact — nog niet gekoppeld" }).isDisabled(), true);
    await pages.alice.getByRole("button", { name: "Eigen tolk aanvragen" }).click();
    await pages.alice.locator("#rooms").filter({ hasText: "Tolk zoeken" }).waitFor();
    await pages.tolk.getByRole("button", { name: "Accepteren", exact: true }).click();
    const link = pages.alice.getByRole("link", { name: "Open besloten tolksessie" });
    await link.waitFor();
    const roomUrl = new URL(await link.getAttribute("href"), origin + "/tolk/");
    const roomId = roomUrl.searchParams.get("room");
    assert.equal((await pages.stranger.request.get(origin + "/api/interpreter.php?room=" + roomId)).status(), 403, "Knowing a room URL does not grant access");
    const supportsRtc = await pages.alice.evaluate(() => typeof RTCPeerConnection === "function");
    for (const account of ["alice", "bob", "tolk"]) {
      const page = pages[account];
      await page.goto(roomUrl.href);
      await page.locator("#joinPanel").waitFor();
      await page.locator(media ? "#join" : "#joinText").click();
      await page.locator("#status").filter({ hasText: "Vink eerst" }).waitFor();
      assert.equal(await page.locator("video").count(), 0, "No media before explicit consent");
      await page.locator("#joinConsent").check();
      await page.locator(media ? "#join" : "#joinText").click();
      if (!supportsRtc) {
        await page.locator("#status").filter({ hasText: "browser met WebRTC" }).waitFor();
        assert.equal(await page.locator("video").count(), 0);
        continue;
      }
      try { await page.locator("#rttPanel").waitFor({ timeout: 15000 }); }
      catch (error) { throw new Error(account + ": " + await page.locator("#status").innerText(), { cause: error }); }
    }
    if (supportsRtc) {
      for (const account of ["alice", "bob", "tolk"]) {
        const page = pages[account];
        await page.waitForFunction(() => [...document.querySelectorAll(".video-tile p")].filter((label) => label.textContent.includes("Verbonden")).length === 2, null, { timeout: 25000 });
        assert.equal(await page.locator(".video-tile").count(), 3);
        assert.equal(await page.locator(".video-tile.interpreter").count(), 1, "Interpreter is visually pinned");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Fits mobile width");
        if (media) await page.waitForFunction(() => [...document.querySelectorAll("video")].every((video) => video.srcObject.getVideoTracks().length === 1 && video.readyState >= 2));
        await page.evaluate(() => { window.fixtureLocalTracks = [...document.querySelectorAll("video")].find((video) => video.muted).srcObject.getTracks(); });
      }
      const continuousTyping = pages.alice.locator("#text").pressSequentially("Dit wordt tijdens typen gedeeld", { delay: 65 });
      await pages.bob.locator("#drafts").filter({ hasText: "Dit wordt" }).waitFor();
      assert.ok(!(await pages.bob.locator("#drafts").innerText()).includes("Dit wordt tijdens typen gedeeld"), "Continuous typing is transmitted before the typing pause");
      await continuousTyping;
      await pages.alice.locator("#text").fill("Hallo 👋 <veilig>");
      await pages.bob.locator("#drafts").filter({ hasText: "Hallo 👋 <veilig>" }).waitFor();
      await pages.tolk.locator("#drafts").filter({ hasText: "Hallo 👋 <veilig>" }).waitFor();
      await pages.bob.locator("#text").fill("Ik lees mee");
      await pages.tolk.locator("#text").fill("Ik ben de tolk");
      await pages.alice.locator("#drafts").filter({ hasText: "Ik lees mee" }).waitFor();
      await pages.alice.locator("#drafts").filter({ hasText: "Ik ben de tolk" }).waitFor();
      await pages.alice.getByRole("button", { name: "Tekst afronden" }).click();
      await pages.bob.locator("#messages").filter({ hasText: "Hallo 👋 <veilig>" }).waitFor();
      assert.equal(await pages.bob.locator("#drafts").innerText(), "Tolk (test): Ik ben de tolk\n\n".trimEnd(), "Final text clears only its own draft");
      const state = await (await pages.alice.request.get(origin + "/api/interpreter.php?room=" + roomId)).json();
      assert.ok(!JSON.stringify(state).includes("Hallo"), "RTT content never reaches signaling storage");
    }
    await pages.alice.screenshot({ path: path.join(os.tmpdir(), "teletyptel-interpreter-" + name + ".png") });
    await pages.admin.getByRole("button", { name: "Verversen" }).click();
    pages.admin.once("dialog", (dialog) => dialog.accept());
    await pages.admin.getByRole("button", { name: "Blokkeren", exact: true }).click();
    for (const account of ["alice", "bob", "tolk"]) {
      await pages[account].locator("#sessionState").filter({ hasText: "beëindigd" }).waitFor();
      assert.equal(await pages[account].locator("video").count(), 0, "Blocking interpreter closes media on all clients");
      assert.equal(await pages[account].locator("#messages").innerText(), "");
      if (supportsRtc) assert.equal(await pages[account].evaluate(() => window.fixtureLocalTracks.every((track) => track.readyState === "ended")), true, "Local camera and microphone actually stop");
    }
    assert.deepEqual(failures, []);
    console.log("Interpreter integration passed: " + name + (supportsRtc ? ", three real WebRTC peers, audio/video + RTT" : ", UI and unsupported-WebRTC guard only (Windows WebKit lacks WebRTC)") + ", isolated PHP/SQLite, admin approval/blocking, private membership.");
  } finally {
    await browser.close();
    server.kill();
    await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
    const target = path.resolve(temporary);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("teletyptel-interpreter-test-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
}

(async () => {
  if (!process.argv.includes("--iphone-only")) await check(chromium, "android", true);
  await check(webkit, "iphone", false);
})().catch((error) => { console.error(error); process.exitCode = 1; });
