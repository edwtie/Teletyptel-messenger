const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const icons = client.slice(client.indexOf("  const materialIcons ="), client.indexOf("  const sessionProfile ="));
const iconFunctions = client.slice(client.indexOf("  function createMaterialIcon("), client.indexOf("  function createScreenReaderText("));

test("Native bundle includes the compact menu assets referenced by chat", () => {
  const { assetFiles } = require("../scripts/ios-testflight/bundle-frontend");
  for (const file of ["call-controls-menu.js", "call-controls-menu.css"]) {
    assert.ok(assetFiles().includes(file));
    assert.ok(markup.includes(file) || fs.readFileSync(path.join(root, "chat.html"), "utf8").includes(file));
    assert.ok(fs.readFileSync(path.join(root, "service-worker.js"), "utf8").includes(file));
  }
});

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: compact call controls preserve actions and fit both orientations`, { timeout: 60000 }, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ hasTouch: true, viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://call-menu.test") return route.abort();
        if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|png|svg|ico)$/.test(file) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        if (file.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: fs.readFileSync(file, "utf8")
          .replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g, (_, side) => ({ top: "24px", bottom: "20px", left: "0px", right: "0px" })[side]) });
        return route.fulfill({ path: file });
      });
      await page.goto("https://call-menu.test/chat.html");
      await page.evaluate(source => new Function(source + "; renderMaterialIcons();")(), icons + iconFunctions);
      await page.evaluate(() => {
        document.body.className = "device-ios device-phone viewport-phone conversation-open";
        document.body.dataset.theme = "light";
        document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
        document.getElementById("activeConversationName").textContent = "Een contact met een lange naam";
        window.originalControls = document.querySelector(".call-media-controls");
        window.originalFacing = document.getElementById("callVideoFacingToggle");
        window.originalVideo = document.getElementById("remoteVideo");
        window.actions = [];
        for (const identifier of ["toggleCameraButton", "muteMicrophoneButton", "hangupCallButton", "callVideoFacingToggle", "interpreterButton", "resetRttButton"]) {
          document.getElementById(identifier).addEventListener("click", () => {
            actions.push(identifier);
            if (["toggleCameraButton", "muteMicrophoneButton"].includes(identifier)) document.getElementById(identifier).classList.toggle("selected");
          });
        }
        document.getElementById("callKeyboardButton").addEventListener("click", () => document.getElementById("totalConversationLocalText").focus());
        document.getElementById("callKeypadButton").addEventListener("click", () => document.getElementById("callKeypadDialog").showModal());
        document.getElementById("callKeypadClose").addEventListener("click", () => {
          document.getElementById("callKeypadDialog").close();
        });
      });
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      await page.addScriptTag({ path: path.join(root, "call-controls-menu.js") });
      assert.equal(await page.locator("#callCompactToolbar").isVisible(), false);
      for (const [device, width, height] of [
        ["phone", 390, 844], ["phone", 844, 390], ["phone", 320, 568],
        ["phone", 844, 260],
        ["tablet", 834, 1194], ["tablet", 1194, 834], ["tablet", 834, 1194]
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(({ device, width, height }) => {
          document.body.classList.remove("device-phone", "device-tablet", "viewport-phone", "viewport-tablet", "viewport-landscape", "viewport-portrait", "tc-phone-landscape-active");
          document.body.classList.add(`device-${device}`, `viewport-${device}`, width > height ? "viewport-landscape" : "viewport-portrait", "call-active", "tc-call-active", "tc-text-visible-active");
          if (device === "phone" && width > height) document.body.classList.add("tc-phone-landscape-active");
          document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
          document.body.dataset.deviceClass = device;
          document.getElementById("callPanel").hidden = false;
          document.getElementById("callPanel").className = "call-panel has-local-video remote-video-main";
          document.querySelector(".call-mode-buttons").hidden = true;
          document.getElementById("totalConversationTextPanel").hidden = false;
          document.getElementById("totalConversationLocalText").disabled = false;
          document.getElementById("totalConversationLocalText").value = "Mijn RTT blijft staan";
          for (const identifier of ["hangupCallButton", "hangupCallPanelButton", "toggleCameraButton", "muteMicrophoneButton", "callKeypadButton", "callKeyboardButton", "toggleTotalConversationTextButton"]) {
            const element = document.getElementById(identifier);
            element.hidden = false;
            element.disabled = false;
          }
        }, { device, width, height });
        await page.waitForFunction(() => document.body.classList.contains("call-menu-active"));
        for (const selector of ["#callControlsToggle", "#callVideoFacingToggle", "#hangupCallButton"]) {
          const rect = await page.locator(selector).boundingBox();
          assert.ok(rect && rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.y >= 0
            && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, JSON.stringify({ selector, device, width, height, rect }));
        }
        assert.equal(await page.locator("#toggleCameraButton").isVisible(), false);
        assert.equal(await page.locator("#hangupCallPanelButton").isVisible(), false);
        const before = await page.locator("#remoteVideo").boundingBox();
        await page.locator("#callControlsToggle").click();
        assert.equal(await page.locator("#callControlsToggle").getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator(".call-control-caption").count(), 0, "Call buttons have symbols without visible captions");
        for (const button of await page.locator("#callControlsMenu .call-media-controls > button").all()) {
          if (!await button.isVisible()) continue;
          assert.ok((await button.getAttribute("aria-label"))?.trim(), "Symbol buttons retain their screen reader names");
          assert.ok((await button.getAttribute("title"))?.trim(), "Symbol buttons retain their tooltips");
          const bounds = await button.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44, "Symbol controls remain touch-friendly");
        }
        assert.equal(await page.locator("#enableRttButton").isVisible(), false);
        assert.equal(await page.locator("#hangupCallPanelButton").isVisible(), false);
        assert.equal(await page.locator("#toggleCameraButton .material-icon").evaluate(element => getComputedStyle(element).color), "rgb(255, 255, 255)");
        assert.equal(await page.evaluate(() => document.activeElement.id), "toggleCameraButton");
        const menu = await page.locator("#callControlsMenu").boundingBox();
        assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= width + 1 && menu.y + menu.height <= height + 1, JSON.stringify({ width, height, menu }));
        assert.deepEqual(await page.locator("#remoteVideo").boundingBox(), before, "Opening controls never resizes the video");
        await page.locator("#toggleCameraButton").click();
        await page.locator("#muteMicrophoneButton").click();
        for (const selector of ["#toggleCameraButton", "#muteMicrophoneButton"]) {
          assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor), "rgb(220, 38, 38)", "Camera/microphone off is red");
        }
        await page.keyboard.press("Escape");
        assert.equal(await page.evaluate(() => document.activeElement.id), "callControlsToggle");
        assert.equal(await page.locator("#callControlsMenu").isVisible(), false);
        assert.equal(await page.locator("#callCameraOffIndicator").isVisible(), true);
        assert.equal(await page.locator("#callMicrophoneOffIndicator").isVisible(), true);
        await page.locator("#callVideoFacingToggle").click();
        await page.locator("#callControlsToggle").click();
        await page.locator("#toggleCameraButton").click();
        await page.locator("#muteMicrophoneButton").click();
        for (const selector of ["#toggleCameraButton", "#muteMicrophoneButton"]) {
          assert.equal(await page.locator(selector).evaluate(element => getComputedStyle(element).backgroundColor), "rgb(22, 163, 74)", "Camera/microphone on is green");
        }
        await page.locator("#callKeypadButton").click();
        assert.equal(await page.locator("#callKeypadDialog").evaluate(element => element.open), true);
        assert.equal(await page.locator("#callControlsMenu").isVisible(), false);
        await page.locator("#callKeypadClose").click();
        await page.waitForFunction(() => document.activeElement.id === "callControlsToggle");
        await page.locator("#callControlsToggle").click();
        await page.locator("#callKeyboardButton").click();
        assert.equal(await page.evaluate(() => document.activeElement.id), "totalConversationLocalText");
        assert.equal(await page.locator("#totalConversationLocalText").inputValue(), "Mijn RTT blijft staan");
        assert.equal(await page.evaluate(() => originalControls === document.querySelector(".call-media-controls") && originalFacing === document.getElementById("callVideoFacingToggle") && originalVideo === document.getElementById("remoteVideo")), true);
        const output = path.resolve(__dirname, "../artifacts/call-menu");
        fs.mkdirSync(output, { recursive: true });
        await page.screenshot({ path: path.join(output, `${engine.name()}-${device}-${width}-closed.png`) });
        await page.locator("#callControlsToggle").click();
        await page.screenshot({ path: path.join(output, `${engine.name()}-${device}-${width}-open.png`) });
        await page.keyboard.press("Escape");
      }
      for (const mode of ["audio", "video", "tc-no-video"]) {
        await page.evaluate(mode => {
          document.body.classList.toggle("tc-call-active", mode === "tc-no-video");
          document.body.classList.toggle("tc-text-visible-active", mode === "tc-no-video");
          const panel = document.getElementById("callPanel");
          panel.className = "call-panel " + (mode === "video" ? "has-local-video remote-video-main" : "no-call-video no-remote-video");
          if (mode === "tc-no-video") panel.classList.add("tc-text-full");
          document.getElementById("totalConversationTextPanel").hidden = mode !== "tc-no-video";
          document.getElementById("toggleCameraButton").disabled = mode !== "video";
          document.getElementById("remoteVideo").hidden = mode !== "video";
          document.getElementById("localVideo").hidden = mode !== "video";
        }, mode);
        await page.waitForFunction(mode => document.getElementById("callVideoFacingToggle").disabled === (mode !== "video"), mode);
        assert.equal(await page.locator("#callCameraOffIndicator").isVisible(), mode !== "video");
        assert.equal(await page.locator("#hangupCallButton").isVisible(), true);
        await page.locator("#callControlsToggle").focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("#callControlsMenu").isVisible(), true);
        await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.getElementById("callControlsMenu").contains(document.activeElement)), true);
        await page.locator("#activeConversationName").click();
        assert.equal(await page.locator("#callControlsMenu").isVisible(), false);
        assert.equal(await page.evaluate(() => document.getElementById("callControlsMenu").contains(document.activeElement)), false);
      }
      await page.locator("#hangupCallButton").click();
      assert.ok((await page.evaluate(() => actions)).includes("hangupCallButton"));
      await page.evaluate(() => {
        document.body.classList.remove("call-active", "tc-call-active", "tc-text-visible-active");
        document.getElementById("callPanel").hidden = true;
        document.querySelector(".call-mode-buttons").hidden = false;
      });
      await page.waitForFunction(() => !document.body.classList.contains("call-menu-active"));
      assert.equal(await page.locator("#callCompactToolbar").isVisible(), false);
      assert.equal(await page.locator("#callPanel > .call-media-controls").count(), 1);
      assert.equal(await page.locator(".call-device-controls #callVideoFacingToggle").count(), 1);
      assert.equal(await page.locator(".chat-header-actions #interpreterButton").count(), 1);
      assert.equal(await page.locator(".chat-header-actions #resetRttButton").count(), 1);
      await page.evaluate(() => {
        document.body.classList.remove("device-tablet", "viewport-tablet");
        document.body.classList.add("device-phone", "viewport-phone");
        document.getElementById("hangupCallButton").hidden = true;
        document.getElementById("answerCallButton").hidden = true;
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.body.classList.contains("compact-chat-header"));
      assert.equal(await page.locator("#chatMorePanel #resetRttButton").count(), 1);
      await page.evaluate(() => {
        document.body.classList.add("call-active");
        document.getElementById("callPanel").hidden = false;
        document.getElementById("hangupCallButton").hidden = false;
      });
      await page.waitForFunction(() => document.body.classList.contains("call-menu-active"));
      assert.equal(await page.locator("#callControlsMenu #resetRttButton").count(), 1, "Next call keeps controls in the correct menu");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
