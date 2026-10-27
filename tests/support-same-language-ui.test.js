const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

async function check(engine) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="settings"></div><article id="message"><p>Hallo</p></article><div id="live">Hallo</div>');
    for (const file of ["support-language.js", "support-call.js", "support-translation.js"]) await page.addScriptTag({ path: path.resolve(__dirname, "../php/public", file) });
    await page.addStyleTag({ path: path.resolve(__dirname, "../php/public/support-translation.css") });
    await page.evaluate(() => {
      window.calls = 0;
      window.source = "NL";
      window.language = window.TeleTypTelSupportLanguage.create("nl");
      window.widget = window.TeleTypTelSupportTranslation.mount({ container: document.getElementById("settings"), language: window.language,
        request: async () => { window.calls++; return { translation: { text: "Hallo vertaald", sourceLanguage: window.source, targetLanguage: "nl", translationNeeded: window.translationNeeded } }; } });
      window.widget.sync("test-thread", { available: true, canTranslate: true, canTranslateLive: true, languages: { nl: "Nederlands" }, preferences: { mode: "automatic", targetLanguage: "nl", consent: true, liveConsent: true } });
      window.widget.attach(document.getElementById("message"), { sequence: 1, text: "Hallo" });
    });
    await page.waitForFunction(() => window.calls === 1);
    assert.equal(await page.locator("#message .support-translation-result").isVisible(), false, "Dutch to Dutch has no duplicate text or label");
    assert.equal(await page.locator("#message p").textContent(), "Hallo");
    await page.evaluate(() => window.language.set("en"));
    assert.equal(await page.locator("#message .support-translation-result").isVisible(), false, "Interface language change does not restore hidden translation");
    await page.evaluate(() => window.widget.live({ sourceRole: "visitor", text: "Hallo", own: true, target: document.getElementById("live") }));
    await page.waitForFunction(() => window.calls === 2);
    assert.equal(await page.locator("#live .support-translation-result").isVisible(), false, "Same-language live RTT has no duplicate");
    await page.evaluate(() => { window.source = "en"; window.widget.live({ sourceRole: "visitor", text: "Hello", own: true, target: document.getElementById("live") }); });
    await page.locator("#live .support-translation-result > div").waitFor();
    assert.ok((await page.locator("#live .support-translation-result").textContent()).includes("Hallo vertaald"), "Changed draft in another language still translates");
    await page.evaluate(() => { window.source = ""; window.widget.detach(1); window.widget.attach(document.getElementById("message"), { sequence: 1, text: "Unknown language" }); });
    await page.locator("#message .support-translation-result > div").waitFor();
    assert.ok((await page.locator("#message .support-translation-result").textContent()).includes("Hallo vertaald"), "Unknown detection must not suppress translations");
    assert.equal(await page.evaluate(() => window.calls), 4, "Same-language result does not retry automatically");
    await page.evaluate(() => { window.translationNeeded = false; window.widget.detach(1); document.querySelector("#message p").textContent = "Ja"; window.widget.attach(document.getElementById("message"), { sequence: 1, text: "Ja" }); });
    await page.waitForFunction(() => window.calls === 5);
    assert.equal(await page.locator("#message .support-translation-result").isVisible(), false, "Recognized Dutch Ja skips provider auto-detection and hides the result");
    assert.equal(await page.locator("#message p").textContent(), "Ja");
    await page.evaluate(() => window.widget.live({ sourceRole: "visitor", text: "Nee", own: true, target: document.getElementById("live") }));
    await page.waitForFunction(() => window.calls === 6);
    assert.equal(await page.locator("#live .support-translation-result").isVisible(), false, "Short Dutch RTT hides the result too");
    console.log("Support same-language checks passed: " + engine.name());
  } finally { await browser.close(); }
}
(async () => { await check(chromium); await check(webkit); })().catch((error) => { console.error(error); process.exitCode = 1; });
