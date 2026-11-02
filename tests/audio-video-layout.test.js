const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const update = client.slice(client.indexOf("  function updateCallUi()"), client.indexOf("  function savedCallVideoHeight()"));

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: audio and audio/video fit phone and tablet without TC`, { timeout: 90000 }, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ hasTouch: true, viewport: { width: 390, height: 844 } });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://calls.test") return route.abort();
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(html|css|png|svg|ico)$/.test(file) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        if (file.endsWith("chat.html")) return route.fulfill({ contentType: "text/html", body: fs.readFileSync(file, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "") });
        if (file.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: fs.readFileSync(file, "utf8")
          .replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g, (_, side) => ({ top: "24px", bottom: "20px", left: "0px", right: "0px" })[side]) });
        return route.fulfill({ path: file });
      });
      await page.goto("https://calls.test/chat.html");
      await page.evaluate(source => {
        window.callFixture = new Function(source + `
          const el = Object.fromEntries([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
          const state = { call: null, totalConversationTextVisible: false };
          const activeConversation = () => ({ peer: 'fixture@example.test' });
          const hasVideoTrack = stream => Boolean(stream?.video);
          const addressMatches = (left, right) => left === right;
          const interpreter = { hasMedia: () => false };
          const incomingCallTitle = () => 'Incoming call', incomingCallText = () => 'Fixture';
          const showIncomingCallBrowserNotification = () => {}, closeIncomingCallBrowserNotification = () => {};
          const setCallButtonsDisabled = () => {};
          const setCallModeButtonsHidden = value => { document.querySelector('.call-mode-buttons').hidden = value; };
          const applyCallVideoHeight = () => {}, updateCameraToggleUi = () => {}, updateMicrophoneMuteUi = () => {};
          const updateTotalConversationTextToggleUi = () => {}, applyRemoteVolume = () => {}, updateTotalConversationTextPanel = () => {};
          return { state, update: updateCallUi };
        `)();
        document.body.dataset.theme = "light";
        document.body.dataset.platform = "ios";
        document.querySelector(".chat-title h2").textContent = "Voorbeeldcontact met een lange naam";
        document.getElementById("messageInput").value = "Bewaar mijn concept";
        window.originalComposer = document.getElementById("messageInput");
        window.originalVideo = document.getElementById("remoteVideo");
        const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#42677d"/><circle cx="320" cy="240" r="90" fill="#a3c8da"/></svg>');
        document.getElementById("remoteVideo").poster = poster;
        document.getElementById("localVideo").poster = poster;
      }, update);
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      for (const device of ["phone", "tablet"]) {
        const sizes = device === "phone" ? [[390, 844], [844, 390], [320, 568], [390, 400], [844, 260], [390, 844]]
          : [[834, 1194], [1194, 834], [834, 550], [1194, 430], [834, 1194]];
        for (const [width, height] of sizes) {
          await page.setViewportSize({ width, height });
          for (const mode of ["audio", "video", "local-video"]) {
            await page.evaluate(({ device, width, height, mode }) => {
              document.body.classList.remove("account-booting", "device-phone", "device-tablet", "viewport-phone", "viewport-tablet", "viewport-portrait", "viewport-landscape");
              document.body.classList.add("device-ios", `device-${device}`, `viewport-${device}`, `viewport-${width > height ? "landscape" : "portrait"}`, "conversation-open");
              document.documentElement.style.setProperty("--visual-viewport-height", height + "px");
              callFixture.state.call = { peer: "fixture@example.test", rttEnabled: false,
                localStream: { video: mode !== "audio" }, remoteStream: { video: mode === "video" } };
              document.getElementById("totalConversationTextPanel").hidden = true;
              callFixture.update();
            }, { device, width, height, mode });
            await page.waitForFunction(device => device !== "tablet" || document.body.classList.contains("tablet-call-drawer"), device);
            assert.equal(await page.locator("#callPanel").isVisible(), true);
            assert.equal(await page.locator(".call-audio-placeholder").isVisible(), mode === "audio");
            assert.equal(await page.locator("#totalConversationTextPanel").isVisible(), false);
            assert.equal(await page.locator(".conversation-list").isVisible(), false);
            const canvas = await page.locator(".chat-panel").boundingBox();
            assert.ok(Math.abs(canvas.width - width) <= 1, "Calls fill the screen width in both orientations");
            const boxes = {};
            for (const selector of [".chat-header", "#callPanel", ".call-media-controls", "#composerForm", "#muteMicrophoneButton", "#hangupCallPanelButton"]) {
              const bounds = await page.locator(selector).boundingBox();
              boxes[selector] = bounds;
              assert.ok(bounds && bounds.width > 0 && bounds.height > 0 && bounds.x >= -1 && bounds.y >= -1
                && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1,
              JSON.stringify({ device, mode, width, height, selector, bounds }));
            }
            assert.ok(boxes["#composerForm"].y >= boxes[".call-media-controls"].y + boxes[".call-media-controls"].height - 1, JSON.stringify({ device, mode, width, height, boxes }));
            assert.ok(boxes["#muteMicrophoneButton"].width >= 44 && boxes["#muteMicrophoneButton"].height >= 44);
            if (mode !== "audio") {
              const video = page.locator(mode === "video" ? "#remoteVideo" : "#localVideo");
              const bounds = await video.boundingBox();
              assert.ok(bounds.height > 0 && bounds.y + bounds.height <= boxes[".call-media-controls"].y + 1, JSON.stringify({ boxes, bounds }));
              assert.equal(await video.evaluate(element => getComputedStyle(element).objectFit), "cover");
            }
            if (device === "tablet") {
              await page.locator("#callContactsToggle").click();
              assert.equal(await page.locator(".conversation-list").isVisible(), true);
              await page.locator("#callContactsClose").click();
            }
            assert.equal(await page.evaluate(() => originalComposer === document.getElementById("messageInput")
              && originalVideo === document.getElementById("remoteVideo") && originalComposer.value === "Bewaar mijn concept"), true);
            const output = path.resolve(__dirname, "../artifacts/audio-video-layout");
            fs.mkdirSync(output, { recursive: true });
            await page.screenshot({ path: path.join(output, `${engine.name()}-${device}-${mode}-${width}-${height}.png`) });
          }
        }
      }
      await page.evaluate(() => { callFixture.state.call = null; callFixture.update(); });
      assert.equal(await page.locator("#callPanel").isVisible(), false);
      await page.waitForFunction(() => !document.body.classList.contains("tablet-call-drawer"));
    } finally { await browser.close(); }
  });
}
