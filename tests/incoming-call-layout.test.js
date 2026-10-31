const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const section = (start, end) => client.slice(client.indexOf(`  function ${start}`), client.indexOf(`  function ${end}`));
const source = section("updateCallUi()", "savedCallVideoHeight()")
  + section("setCallModeButtonsHidden(", "updateMicrophoneMuteUi()")
  + section("updateTotalConversationTextPanel(", "lastLocalConversationText(");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "");

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: incoming calls show one dialog without squeezing the background`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await page.route("**/*", route => route.abort());
      await page.setContent(markup);
      await page.addStyleTag({ content: fs.readFileSync(path.join(root, "chat-client.css"), "utf8") });
      await page.evaluate(source => {
        document.body.className = "viewport-phone mobile-navigation-ready conversation-open";
        document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
        window.callFixture = new Function(source + `
          const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
          const state = { call: null, totalConversationTextVisible: true };
          const activeConversation = () => ({ peer: 'caller@example.test', messages: [] });
          const incomingCallTitle = () => 'Inkomende totale conversatie';
          const incomingCallText = () => 'Inkomend gesprek van Edward';
          const showIncomingCallBrowserNotification = () => {}, closeIncomingCallBrowserNotification = () => {};
          const setCallButtonsDisabled = () => {};
          const hasVideoTrack = stream => Boolean(stream);
          const addressMatches = (left, right) => left === right;
          const interpreter = { hasMedia: () => false };
          const applyCallVideoHeight = () => {}, updateCameraToggleUi = () => {}, updateMicrophoneMuteUi = () => {};
          const updateTotalConversationTextToggleUi = () => {}, applyRemoteVolume = () => {}, refreshLiveTranslation = () => {};
          const shouldUseFullTotalConversationText = () => false, updatePhoneLandscapeCallMode = () => {};
          const displayNameForJid = () => 'Edward', lastPeerConversationText = () => '', lastLocalConversationText = () => '';
          return { state, update: updateCallUi };
        `)();
        callFixture.update();
      }, source);
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      for (const theme of ["light", "dark"]) {
        for (const [width, height] of [[390, 844], [844, 390], [320, 568], [1280, 800]]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(theme => {
            document.body.dataset.theme = theme;
            callFixture.state.call = null;
            callFixture.update();
          }, theme);
          const baseline = await page.locator(".chat-panel").boundingBox();
          await page.evaluate(() => {
            callFixture.state.call = { incomingOffer: "fixture-sdp", rttEnabled: true, peer: "caller@example.test", localStream: {}, remoteStream: {} };
            callFixture.update();
          });
          for (const selector of ["#incomingCallBanner", "#answerCallButton", "#rejectCallButton", "#callPanel", "#totalConversationTextPanel"]) {
            assert.equal(await page.locator(selector).isVisible(), false, selector);
          }
          assert.deepEqual(await page.locator(".chat-panel").boundingBox(), baseline);
          const layout = await page.evaluate(() => {
            const dialog = document.getElementById("incomingCallDialog");
            const bounds = dialog.getBoundingClientRect();
            const card = dialog.firstElementChild.getBoundingClientRect();
            const label = document.querySelector("#dialogAnswerButton [data-i18n]");
            return {
              bounds: [bounds.left, bounds.top, bounds.width, bounds.height],
              viewport: [0, 0, innerWidth, innerHeight],
              fits: card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight,
              coversHeader: document.elementFromPoint(innerWidth / 2, 10) === dialog,
              labelColor: getComputedStyle(label).color,
              buttonHeight: label.parentElement.getBoundingClientRect().height,
              overflow: document.documentElement.scrollWidth - innerWidth
            };
          });
          assert.deepEqual(layout.bounds, layout.viewport);
          if (width <= 520) assert.deepEqual(layout.bounds, [0, 0, width, height]);
          assert.equal(layout.fits, true);
          assert.equal(layout.coversHeader, true);
          assert.equal(layout.labelColor, "rgb(255, 255, 255)");
          assert.ok(layout.buttonHeight >= 44);
          assert.ok(layout.overflow <= 1);
          assert.equal(await page.evaluate(() => document.activeElement.id), "dialogAnswerButton");
          await page.locator("#dialogRejectButton").focus();
          await page.evaluate(() => callFixture.update());
          assert.equal(await page.evaluate(() => document.activeElement.id), "dialogRejectButton");
          if (theme === "light" && width === 390) {
            const directory = path.resolve(__dirname, "../artifacts/mobile-chat");
            fs.mkdirSync(directory, { recursive: true });
            await page.screenshot({ path: path.join(directory, `${name}-incoming-call.png`) });
          }
          await page.evaluate(() => { callFixture.state.call.incomingOffer = null; callFixture.update(); });
          assert.equal(await page.locator("#incomingCallDialog").isVisible(), false);
          assert.equal(await page.locator("#callPanel").isVisible(), true);
          await page.evaluate(() => { callFixture.state.call = null; callFixture.update(); });
          assert.equal(await page.locator("#callPanel").isVisible(), false);
          assert.equal(await page.locator("#incomingCallDialog").isVisible(), false);
        }
      }
    } finally { await browser.close(); }
  });
}
