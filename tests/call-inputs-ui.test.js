const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const functions = client.slice(client.indexOf("  function activeCallDtmf("), client.indexOf("  function supportsWebRtc()"));
const bindings = client.slice(client.indexOf('    el.callKeypadButton.addEventListener'), client.indexOf('    el.callResizeHandle.addEventListener'));
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: separate call keypad and RTT keyboard controls`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await page.route("**/*", route => route.abort());
      await page.setContent(markup);
      await page.addStyleTag({ content: fs.readFileSync(path.join(root, "chat-client.css"), "utf8") });
      await page.evaluate(({ functions, bindings }) => {
        document.body.className = "device-ios viewport-phone conversation-open call-active tc-call-active tc-text-visible-active";
        document.body.dataset.theme = "light";
        document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
        document.getElementById("callPanel").hidden = false;
        document.getElementById("callPanel").className = "call-panel has-local-video local-video-main no-remote-video";
        document.getElementById("remoteVideo").hidden = true;
        document.getElementById("totalConversationTextPanel").hidden = false;
        window.callInputFixture = new Function(functions + `
          const byId = id => document.getElementById(id);
          const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
          const t = (key, fallback) => fallback;
          const tones = [];
          const dtmf = { canInsertDTMF: true, toneBuffer: '', insertDTMF(value) { tones.push(value); this.toneBuffer = value; } };
          const state = { call: { rttEnabled: true, pc: { connectionState: 'connected', getSenders: () => [{ track: { kind: 'audio', readyState: 'live' }, dtmf }] } } };
          const updateCallUi = () => {};
          el.messageInput.disabled = false;
          ${bindings}
          updateCallInputUi();
          return { tones, dtmf, state, update: updateCallInputUi };
        `)();
      }, { functions, bindings });
      for (const [width, height] of [[390, 844], [844, 390], [320, 568]]) {
        await page.setViewportSize({ width, height });
        await page.locator("#callKeypadButton").click();
        assert.equal(await page.locator("#callKeypadDialog").evaluate(element => element.open), true);
        assert.equal(await page.locator("#callKeypadKeys button").count(), 12);
        const bounds = await page.locator("#callKeypadDialog").boundingBox();
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
        if (width === 390) {
          const directory = path.resolve(__dirname, "../artifacts/mobile-chat");
          fs.mkdirSync(directory, { recursive: true });
          await page.screenshot({ path: path.join(directory, `${name}-call-keypad.png`) });
        }
        await page.locator('[data-call-digit="2"]').click();
        await page.locator("#callKeypadTextButton").click();
        assert.equal(await page.evaluate(() => document.activeElement.id), "messageInput");
        assert.equal(await page.locator("#callKeypadDialog").evaluate(element => element.open), false);
      }
      assert.deepEqual(await page.evaluate(() => callInputFixture.tones), ["2", "22", "222"]);
      await page.evaluate(() => { callInputFixture.dtmf.canInsertDTMF = false; });
      await page.locator("#callKeypadButton").click();
      assert.equal(await page.locator("#callKeypadKeys button:disabled").count(), 12);
      await page.keyboard.press("3");
      assert.equal(await page.evaluate(() => callInputFixture.tones.length), 3);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#callKeypadDialog").evaluate(element => element.open), false);
    } finally { await browser.close(); }
  });
}
