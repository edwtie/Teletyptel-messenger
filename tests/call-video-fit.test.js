const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const section = (start, end) => client.slice(client.indexOf(`  function ${start}`), client.indexOf(`  function ${end}`));

test("Camera orientation follows subsequent frame resizes without duplicate listeners", () => {
  const classes = new Set();
  const video = new EventTarget();
  Object.assign(video, {
    readyState: 2, videoWidth: 640, videoHeight: 480,
    classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } }
  });
  let updates = 0;
  const context = vm.createContext({ video, appendDebug() { updates++; } });
  vm.runInContext(section("updateVideoOrientationClass(video)", "startVideoPlayback(video)"), context);
  vm.runInContext("updateVideoOrientationClass(video)", context);
  assert.ok(classes.has("landscape-video"));
  for (let attempt = 0; attempt < 3; attempt++) vm.runInContext("updateVideoOrientationClass(video)", context);
  const before = updates;
  Object.assign(video, { videoWidth: 480, videoHeight: 640 });
  video.dispatchEvent(new Event("resize"));
  assert.ok(classes.has("portrait-video"));
  assert.equal(classes.has("landscape-video"), false);
  assert.equal(updates, before + 1, "Only one resize handler per video element");
  Object.assign(video, { videoWidth: 1280, videoHeight: 720 });
  video.dispatchEvent(new Event("loadedmetadata"));
  assert.ok(classes.has("landscape-video"));
  assert.equal(classes.has("portrait-video"), false);
});

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: entire TC camera frames fit phone, tablet and desktop`, async () => {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://video-fit.test") return route.abort();
        if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|svg|png|ico)$/.test(file) || !fs.existsSync(file)) {
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({ path: file });
      });
      await page.goto("https://video-fit.test/chat.html");
      for (const [device, width, height] of [
        ["phone", 390, 844], ["phone", 844, 390],
        ["tablet", 834, 1194], ["tablet", 1194, 834], ["desktop", 1440, 900]
      ]) {
        await page.setViewportSize({ width, height });
        for (const localMain of [false, true]) {
          for (const portrait of [false, true]) {
            await page.evaluate(({ device, width, height, localMain, portrait }) => {
              document.body.className = `device-${device} viewport-${device} conversation-open call-active tc-call-active tc-text-visible-active`
                + (device !== "desktop" ? " device-ios" : "")
                + (width > height ? " viewport-landscape" : " viewport-portrait")
                + (device === "phone" && width > height ? " tc-phone-landscape-active" : "");
              document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
              document.querySelectorAll(".modal-shell").forEach(element => { element.hidden = true; });
              const panel = document.getElementById("callPanel");
              panel.hidden = false;
              panel.className = "call-panel has-local-video " + (localMain ? "local-video-main no-remote-video" : "remote-video-main");
              document.getElementById("totalConversationTextPanel").hidden = false;
              const sourceWidth = portrait ? 480 : 640;
              const sourceHeight = portrait ? 640 : 480;
              for (const identifier of ["remoteVideo", "localVideo"]) {
                const video = document.getElementById(identifier);
                video.hidden = identifier === "remoteVideo" && localMain;
                video.className = portrait ? "portrait-video" : "landscape-video";
                video.poster = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}"><rect width="100%" height="100%" fill="#45798e"/><rect x="4" y="4" width="${sourceWidth - 8}" height="${sourceHeight - 8}" fill="none" stroke="white" stroke-width="8"/></svg>`);
              }
            }, { device, width, height, localMain, portrait });
            for (const selector of localMain ? ["#localVideo"] : ["#remoteVideo", "#localVideo"]) {
              const layout = await page.locator(selector).evaluate(video => {
                const bounds = video.getBoundingClientRect();
                return { fit: getComputedStyle(video).objectFit, width: bounds.width, height: bounds.height };
              });
              assert.equal(layout.fit, "contain", `${device} ${width}x${height} ${selector}: never crop the speaker's face or hands`);
              assert.ok(layout.width > 0 && layout.height > 0, JSON.stringify(layout));
            }
          }
        }
      }
      await page.evaluate(source => {
        document.body.className = "device-ios device-tablet conversation-open call-active tc-call-active tc-text-visible-active";
        document.body.dataset.deviceClass = "tablet";
        document.getElementById("callPanel").className = "call-panel has-local-video remote-video-main";
        document.getElementById("remoteVideo").hidden = false;
        document.querySelector(".call-mode-buttons").hidden = true;
        document.getElementById("hangupCallButton").hidden = false;
        document.getElementById("hangupCallPanelButton").hidden = false;
        document.getElementById("totalConversationLocalText").value = "Dit concept blijft staan bij draaien";
        window.originalLocalVideo = document.getElementById("localVideo");
        window.originalRemoteVideo = document.getElementById("remoteVideo");
        window.originalRtt = document.getElementById("totalConversationLocalText");
        window.rotateTablet = new Function(source + `
          let callViewportTimer = null;
          const state = { call: {}, totalConversationTextVisible: true };
          const el = { messageTimeline: document.getElementById('messageTimeline') };
          const messageTimelineFollower = null;
          const markMediaCaptureTransition = () => {};
          const applyCallVideoHeight = () => {};
          const isPhoneViewport = () => false;
          return () => handleViewportChange('orientationchange');
        `)();
        window.addEventListener("resize", window.rotateTablet);
        window.addEventListener("orientationchange", window.rotateTablet);
        window.visualViewport.addEventListener("resize", window.rotateTablet);
        window.rotateTablet();
      }, section("handleCallViewportChange(reason)", "applyDeviceDetection()")
        + section("applyViewportDetection()", "detectClientDevice()"));
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      const settledLayouts = new Map();
      for (const [width, height] of [[834, 1194], [1194, 834], [834, 1194], [1194, 834]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
        await page.waitForFunction(({ width, height }) =>
          document.documentElement.style.getPropertyValue("--visual-viewport-height") === `${height}px`
          && document.body.dataset.viewportOrientation === (width > height ? "landscape" : "portrait")
          && document.body.classList.contains("tablet-call-drawer"), { width, height });
        await page.waitForTimeout(400);
        const layout = await page.evaluate(() => {
          const bounds = selector => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right };
          };
          return {
            header: bounds(".chat-header"), panel: bounds("#callPanel"), video: bounds("#remoteVideo"),
            preview: bounds("#localVideo"), rtt: bounds("#totalConversationTextPanel"),
            controls: bounds(".call-media-controls"), hangup: bounds("#hangupCallPanelButton"),
            fit: getComputedStyle(originalRemoteVideo).objectFit,
            sameElements: originalLocalVideo === document.getElementById("localVideo")
              && originalRemoteVideo === document.getElementById("remoteVideo")
              && originalRtt === document.getElementById("totalConversationLocalText"),
            draft: originalRtt.value
          };
        });
        for (const name of ["header", "panel", "video", "preview", "rtt", "controls", "hangup"]) {
          const rect = layout[name];
          assert.ok(rect.width > 0 && rect.height > 0 && rect.x >= -1 && rect.y >= -1
            && rect.right <= width + 1 && rect.bottom <= height + 1,
          JSON.stringify({ width, height, name, rect }));
        }
        assert.ok(layout.video.bottom <= layout.rtt.y + 1, "Video never covers the RTT text");
        assert.ok(layout.rtt.bottom <= layout.controls.y + 1, "RTT never covers the controls");
        assert.ok(layout.preview.bottom <= layout.video.bottom + 1, "Self-view remains inside the video area");
        assert.equal(layout.fit, "contain");
        assert.equal(layout.sameElements, true, "Rotation preserves video elements and RTT input");
        assert.equal(layout.draft, "Dit concept blijft staan bij draaien");
        if (settledLayouts.has(width)) assert.deepEqual(layout, settledLayouts.get(width), "Returning to an orientation preserves the settled layout");
        settledLayouts.set(width, layout);
        const output = path.resolve(__dirname, "../artifacts/video-fit");
        fs.mkdirSync(output, { recursive: true });
        await page.screenshot({ path: path.join(output, `${engine.name()}-ipad-${width}-${height}.png`) });
      }
    } finally {
      await browser.close();
    }
  });
}
