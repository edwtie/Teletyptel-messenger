const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const vm = require("node:vm");
const { spawn } = require("node:child_process");
const { chromium, webkit, devices } = require("playwright");

const scope = { window: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../php/public/support-language.js"), "utf8"), scope);
const catalog = scope.window.TeleTypTelSupportLanguage;
for (const [phrase, values] of Object.entries(catalog.messages)) {
  assert.equal(values.length, 3, phrase);
  for (const value of values) assert.ok(typeof value === "string" && value.trim(), phrase);
}
for (const file of ["support-chat.js", "support-call.js", "support-translation.js", "support-language.js", "support-attachments.js"]) {
  const source = fs.readFileSync(path.resolve(__dirname, "../php/public", file), "utf8");
  for (const match of source.matchAll(/\b(?:wording|label|text|control|word)\(\s*((?:(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,?\s*)+)\)/g)) {
    const argumentsList = [...match[1].matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g)];
    const phrase = JSON.parse(argumentsList.at(-1)[0]);
    assert.ok(catalog.messages[phrase], "Complete catalog for " + phrase);
  }
  const callStates = /const englishText = (\{[\s\S]+?\n    \});/.exec(source);
  if (callStates) for (const phrase of Object.values(JSON.parse(callStates[1]))) assert.ok(catalog.messages[phrase], "Complete call state: " + phrase);
}
assert.equal(catalog.create("de-AT").language, "de");
assert.equal(catalog.create("xx").language, "en");
const titles = { nl: "Klantenservice", en: "Customer service", de: "Kundenservice", fr: "Service client", es: "Atención al cliente" };
const startNames = { nl: "Start chat", en: "Start chat", de: "Chat starten", fr: "Démarrer le chat", es: "Iniciar chat" };

async function check(engine, device, name) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-language-"));
  const listener = net.createServer(); await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + listener.address().port; await new Promise((resolve) => listener.close(resolve));
  const server = spawn("C:\\wamp64\\bin\\php\\php8.4.15\\php.exe", ["-S", origin.replace("http://", ""), "php/tests/support-chat-http-fixture.php"], {
    cwd: path.resolve(__dirname, ".."), windowsHide: true, env: { ...process.env, TELETYPTEL_SUPPORT_TEST_DB: path.join(temporary, "fixture.sqlite") }, stdio: "ignore"
  });
  let browser;
  try {
    for (let attempt = 0; attempt < 40; attempt++) { try { await fetch(origin + "/missing"); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); } }
    browser = await engine.launch({ headless: true });
    const visitorContext = await browser.newContext({ ...devices[device], locale: "nl-NL", serviceWorkers: "block" });
    await visitorContext.addInitScript(() => {
      window.languageTestPeers = [];
      if (typeof RTCPeerConnection === "function") {
        const Peer = RTCPeerConnection;
        window.RTCPeerConnection = class extends Peer { constructor(config) { super(config); window.languageTestPeers.push(this); } };
      }
    });
    const visitor = await visitorContext.newPage(), errors = [], writes = [];
    visitor.on("pageerror", (error) => errors.push(error.message));
    visitor.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/api/support-chat.php")) writes.push(request.postDataJSON()); });
    await visitor.goto(origin); await visitor.getByRole("button", { name: "Klantenservice", exact: true }).click();
    await visitor.locator("#supportStatus").filter({ hasText: "geen medewerker" }).waitFor();
    await visitor.locator("#supportName").fill("Sam original name"); await visitor.locator("#supportAcknowledged").check();
    assert.equal(await visitor.locator("#supportLanguage option").count(), 5);
    for (const language of Object.keys(titles)) {
      await visitor.locator("#supportLanguage").selectOption(language);
      assert.equal(await visitor.locator("#supportTitle").textContent(), titles[language]);
      assert.equal(await visitor.locator(".support-widget").getAttribute("lang"), language);
      assert.equal(await visitor.locator("#supportName").inputValue(), "Sam original name", "Language switching preserves name");
      assert.equal(await visitor.locator("#supportAcknowledged").isChecked(), true, "No implicit consent change");
      assert.equal(await visitor.getByRole("button", { name: startNames[language], exact: true }).count(), 1);
    }
    assert.equal(writes.length, 0, "Choosing UI language does not submit text or call Google");
    await visitor.locator("#supportLanguage").selectOption("de");
    await visitor.screenshot({ path: path.join(os.tmpdir(), "teletyptel-name-language-" + name + ".png") });
    await visitor.getByRole("button", { name: "Chat starten", exact: true }).click();
    await visitor.locator("#supportTranslation").waitFor();
    await visitor.locator("#supportStatus").filter({ hasText: "Noch niemand verfügbar" }).waitFor();
    assert.equal(await visitor.locator('#supportTranslation [name="language"]').inputValue(), "de", "Chosen language is suggested for message translation");
    assert.equal(await visitor.locator('#supportHeaderTools [data-action="interpreter"]').getAttribute("aria-label"), "Gebärdensprachdolmetscher anrufen");
    await visitor.locator("#supportText").fill("Do not translate or erase this draft");
    await visitor.locator("#supportTranslation > details > summary").click();
    assert.equal(await visitor.locator('#supportTranslation [name="mode"]').count(), 0, "No manual translation mode");
    await visitor.locator('#supportTranslation [name="language"]').selectOption("pl");
    await visitor.locator('#supportTranslation [name="interfaceLanguage"]').selectOption("fr");
    assert.equal(await visitor.locator("#supportTitle").textContent(), titles.fr);
    assert.equal(await visitor.locator('#supportTranslation [name="language"]').inputValue(), "pl", "Manual message language choice is preserved");
    assert.equal(await visitor.locator('#supportTranslation [name="consent"]').isChecked(), true);
    assert.equal(await visitor.locator('#supportTranslation button[type="submit"]').getAttribute("aria-label"), "Enregistrer");
    assert.equal(await visitor.locator('#supportHeaderTools [data-action="interpreter"]').getAttribute("aria-label"), "Appeler un interprète en langue des signes");
    assert.equal(await visitor.locator("#supportText").inputValue(), "Do not translate or erase this draft");
    assert.deepEqual(writes.map((write) => write.action), ["start"], "UI switch does not save or grant translation consent");
    const history = await (await visitorContext.request.get(origin + "/api/support-chat.php")).json();
    assert.equal(history.translationSettings.preferences.mode, "automatic");
    assert.equal(history.translationSettings.preferences.liveConsent, true, "Start terms include live Google translation");
    assert.equal(history.translationSettings.preferences.targetLanguage, "de", "Start language is stored as translation target");
    await visitor.locator("#supportTranslation > details > summary").click();
    await visitor.locator('#supportSend button[type="submit"]').click();
    await visitor.locator("#supportMessages p").getByText("Do not translate or erase this draft", { exact: true }).waitFor();
    if (name === "android") {
      const staffContext = await browser.newContext({ serviceWorkers: "block" }); const staff = await staffContext.newPage();
      await staff.goto(origin + "/admin/support-chat.php"); await staff.locator("#supportStaffEmail").fill("staff1@example.test"); await staff.locator("#supportStaffPassword").fill("fixture-password-only");
      await staff.locator('#supportStaffLogin button[type="submit"]').click(); await staff.getByRole("button", { name: "Oppakken", exact: true }).click();
      await visitor.waitForFunction(() => document.getElementById("supportCall").dataset.rtt === "connected");
      const peers = await visitor.evaluate(() => window.languageTestPeers.length);
      await visitor.locator("#supportText").fill("RTT original 👋");
      await staff.locator("#supportStaffLive .support-call-drafts span").filter({ hasText: "RTT original 👋" }).waitFor();
      await visitor.locator("#supportTranslation > details > summary").click();
      await visitor.locator('#supportTranslation [name="interfaceLanguage"]').selectOption("es");
      await visitor.locator("#supportTranslation > details > summary").click();
      assert.equal(await visitor.evaluate(() => window.languageTestPeers.length), peers, "Language switch never restarts RTT");
      assert.equal(await visitor.locator("#supportText").inputValue(), "RTT original 👋");
      assert.ok((await visitor.locator("#supportHeaderTools .support-call-state").textContent()).includes("RTT conectado"));
      assert.equal(await staff.locator("#supportThreadTitle").textContent(), "Sam original name");
      assert.equal(await staff.locator("#supportStaffTranslation").getAttribute("lang"), "nl", "Visitor language does not change staff interface");
    } else {
      await visitor.locator("#supportTranslation > details > summary").click(); await visitor.locator('#supportTranslation [name="interfaceLanguage"]').selectOption("es"); await visitor.locator("#supportTranslation > details > summary").click();
    }
    assert.equal(await visitor.locator("#supportMessages p").getByText("Do not translate or erase this draft", { exact: true }).count(), 1, "Original transcript is untouched");
    await visitor.reload(); await visitor.getByRole("button", { name: titles.es, exact: true }).click();
    await visitor.locator("#supportMessages p").getByText("Do not translate or erase this draft", { exact: true }).waitFor();
    assert.equal(await visitor.locator("#supportTitle").textContent(), titles.es, "Chosen language survives reload in this tab");
    for (const width of [390, 320]) { await visitor.setViewportSize({ width, height: 740 }); assert.equal(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    assert.ok(!writes.some((write) => ["translate", "translation_settings"].includes(write.action)), "UI localization never sends data to translation service");
    assert.deepEqual(errors, []);
    console.log("Support language passed: " + name + ", five local UI languages, name/draft/consent preservation, saved session choice, isolated staff language and no provider calls.");
  } finally {
    await browser?.close(); server.kill();
    await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else { server.once("exit", resolve); setTimeout(resolve, 3000).unref(); } });
    const target = path.resolve(temporary); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(target).startsWith("teletyptel-language-"));
    fs.rmSync(target, { recursive: true, force: true });
  }
}
(async () => { await check(chromium, "Pixel 7", "android"); await check(webkit, "iPhone 13", "iphone"); })().catch((error) => { console.error(error); process.exitCode = 1; });
