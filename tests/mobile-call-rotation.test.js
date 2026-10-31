const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium, webkit } = require("playwright");

const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const section = (start, end) => client.slice(client.indexOf(`  function ${start}`), client.indexOf(`  function ${end}`));

test("Call rotation coalesces events without refreshing media or a replacement call", () => {
  const pending = new Map();
  const state = { call: {} };
  let nextTimer = 0;
  let layouts = 0;
  let mediaUpdates = 0;
  const context = vm.createContext({ state, el: {},
    window: { setTimeout(callback) { pending.set(++nextTimer, callback); return nextTimer; }, clearTimeout(timer) { pending.delete(timer); } },
    markMediaCaptureTransition() {}, updatePhoneLandscapeCallMode() {}, applyViewportDetection() {},
    applyCallVideoHeight() { layouts++; }, updateCallUi() { mediaUpdates++; }, startVideoPlayback() { mediaUpdates++; }
  });
  vm.runInContext("let callViewportTimer = null;" + section("handleCallViewportChange(reason)", "handleViewportChange(reason)"), context);
  const flush = () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); };
  for (let index = 0; index < 25; index++) vm.runInContext('handleCallViewportChange("resize")', context);
  assert.equal(pending.size, 1, "Only one settled-layout callback per rotation burst");
  flush();
  assert.equal(layouts, 1);
  assert.equal(mediaUpdates, 0, "Rotation must not refresh the whole call UI or restart playback");
  vm.runInContext('handleCallViewportChange("orientationchange")', context);
  state.call = {};
  flush();
  assert.equal(layouts, 1, "Old rotation callback cannot touch a replacement call");
  vm.runInContext('handleCallViewportChange("resize")', context);
  state.call = null;
  flush();
  assert.equal(layouts, 1, "Ended calls cannot be refreshed by a late callback");
});

test("Phone rotation and keyboard detection use the layout viewport, not landscape height alone", () => {
  const classes = new Set();
  const activeElement = { matches: () => false };
  const body = { dataset: { deviceClass: "phone" }, classList: {
    [Symbol.iterator]: () => classes.values(),
    add: (...names) => names.forEach(name => classes.add(name)), remove: name => classes.delete(name),
    toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }
  } };
  const window = { innerWidth: 390, innerHeight: 844, visualViewport: { width: 390, height: 844, scale: 1 } };
  const context = vm.createContext({ window, document: { body, activeElement, documentElement: { style: { setProperty() {} } } },
    state: { call: {}, totalConversationTextVisible: true }, isPhoneViewport: () => true });
  vm.runInContext(section("applyViewportDetection()", "detectClientDevice()") + section("updatePhoneLandscapeCallMode(", "applyDeviceDetection()"), context);
  for (const [width, height] of [[390, 844], [844, 390], [390, 844], [844, 390]]) {
    Object.assign(window, { innerWidth: width, innerHeight: height });
    Object.assign(window.visualViewport, { width, height });
    vm.runInContext("applyViewportDetection(); updatePhoneLandscapeCallMode();", context);
    assert.equal(body.dataset.viewportClass, "phone", "Rotated iPhone must not switch to tablet layout");
    assert.equal(classes.has("tc-phone-keyboard-active"), false, "Landscape alone is not a keyboard");
    assert.equal(classes.has("tc-phone-landscape-active"), width > height);
  }
  activeElement.matches = () => true;
  window.visualViewport.height = 180;
  vm.runInContext("updatePhoneLandscapeCallMode();", context);
  assert.equal(classes.has("tc-phone-keyboard-active"), true);
  Object.assign(window, { innerWidth: 390, innerHeight: 844 });
  Object.assign(window.visualViewport, { width: 390, height: 350 });
  vm.runInContext("updatePhoneLandscapeCallMode();", context);
  assert.equal(classes.has("tc-phone-keyboard-active"), true, "Typing during a portrait call also needs the keyboard layout");
  Object.assign(window, { innerWidth: 844, innerHeight: 390 });
  window.visualViewport.width = 390;
  vm.runInContext("updatePhoneLandscapeCallMode();", context);
  assert.equal(classes.has("tc-phone-keyboard-active"), false, "Mixed old/new viewport dimensions during rotation are not a keyboard");
  Object.assign(window.visualViewport, { width: 422, height: 195, scale: 2 });
  vm.runInContext("updatePhoneLandscapeCallMode();", context);
  assert.equal(classes.has("tc-phone-keyboard-active"), false, "Pinch zoom is not a keyboard");
  body.dataset.deviceClass = "tablet";
  vm.runInContext("applyViewportDetection();", context);
  assert.equal(body.dataset.viewportClass, "tablet", "Real tablets keep their layout");
  Object.assign(window.visualViewport, { width: 844, height: 390, offsetTop: 59, scale: 1 });
  assert.equal(vm.runInContext("currentViewportMetrics().offsetTop", context), 0, "A stale keyboard offset must not add space when the full viewport returns");
});

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: call layout remains stable through portrait/landscape round trips`, { timeout: 60000 }, async () => {
    const root = path.resolve(__dirname, "../php/public");
    const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://rotation.test") return route.abort();
        if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|js|png|svg|ico)$/.test(file) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
        return route.fulfill({ path: file });
      });
      await page.goto("https://rotation.test/chat.html");
      await page.evaluate(source => {
        document.body.className = "device-ios device-phone conversation-open call-active tc-call-active tc-text-visible-active";
        document.body.dataset.deviceClass = "phone";
        document.getElementById("callPanel").hidden = false;
        document.getElementById("callPanel").className = "call-panel has-local-video local-video-main no-remote-video";
        document.getElementById("localVideo").hidden = false;
        document.getElementById("remoteVideo").hidden = true;
        document.getElementById("totalConversationTextPanel").hidden = false;
        document.querySelector(".call-mode-buttons").hidden = true;
        document.getElementById("hangupCallButton").disabled = false;
        document.getElementById("localVideo").style.background = "#49697f";
        window.rotation = new Function(source + `
          let callViewportTimer = null;
          const state = { call: {}, totalConversationTextVisible: true };
          const el = { messageTimeline: document.getElementById("messageTimeline") };
          const messageTimelineFollower = null;
          const markMediaCaptureTransition = () => {};
          const applyCallVideoHeight = () => {};
          const isPhoneViewport = () => true;
          const updateCallUi = () => { throw new Error("Unexpected full call refresh"); };
          const startVideoPlayback = () => { throw new Error("Unexpected playback restart"); };
          return () => handleViewportChange("rotation-test");
        `)();
        window.addEventListener("resize", window.rotation);
        window.visualViewport.addEventListener("resize", window.rotation);
        window.rotation();
      }, section("handleCallViewportChange(reason)", "applyDeviceDetection()") + section("applyViewportDetection()", "detectClientDevice()"));
      await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
      const layouts = new Map();
      for (const [width, height] of [[390, 844], [844, 390], [390, 844], [844, 390]]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => { for (let index = 0; index < 20; index++) window.rotation(); });
        await page.waitForTimeout(500);
        const layout = await page.evaluate(() => {
          const video = document.getElementById("localVideo").getBoundingClientRect();
          const text = document.getElementById("totalConversationTextPanel").getBoundingClientRect();
          return { viewport: document.body.dataset.viewportClass, keyboard: document.body.classList.contains("tc-phone-keyboard-active"),
            shellPosition: getComputedStyle(document.querySelector(".app-shell")).position,
            composerBottom: document.getElementById("composerForm").getBoundingClientRect().bottom,
            video: { width: video.width, height: video.height, left: video.left, top: video.top },
            textTop: text.top, videoBottom: video.bottom,
            overflow: document.documentElement.scrollWidth - innerWidth,
            sidebar: document.querySelector(".conversation-list").getBoundingClientRect().width };
        });
        assert.equal(layout.viewport, "phone");
        assert.equal(layout.keyboard, false);
        assert.equal(layout.shellPosition, "fixed", "Call layout must remain anchored when the keyboard closes");
        assert.ok(layout.composerBottom <= height + 1, "The composer fits without scrolling the call header under the status bar");
        assert.ok(layout.video.width > 200 && layout.video.height > 100, JSON.stringify(layout));
        assert.ok(layout.overflow <= 1, "Rotation must not reveal a desktop-width layout");
        assert.equal(layout.sidebar, 0);
        assert.ok(layout.textTop >= layout.videoBottom - 1, "RTT must follow the video, not overlap it");
        assert.ok(layout.textTop < height, "The video must not push the RTT panel offscreen");
        if (layouts.has(width)) assert.deepEqual(layout, layouts.get(width), "Returning to an orientation must produce the same settled layout");
        layouts.set(width, layout);
        if (width > height) {
          const preview = await page.evaluate(() => {
            const panel = document.getElementById("callPanel");
            panel.className = "call-panel has-local-video remote-video-main";
            document.getElementById("remoteVideo").hidden = false;
            const local = document.getElementById("localVideo").getBoundingClientRect();
            const remote = document.getElementById("remoteVideo").getBoundingClientRect();
            panel.className = "call-panel has-local-video local-video-main no-remote-video";
            document.getElementById("remoteVideo").hidden = true;
            return { localWidth: local.width, remoteWidth: remote.width };
          });
          assert.ok(preview.localWidth < preview.remoteWidth / 2, "Local preview must not cover the remote participant after rotation");
        }
      }
      const output = path.resolve(__dirname, "../artifacts/mobile-chat");
      fs.mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, `${name}-call-landscape.png`) });
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => {
          const viewport = new EventTarget();
          Object.assign(viewport, { width: innerWidth, height: 844, offsetTop: 0, scale: 1 });
          Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
          document.getElementById("hangupCallPanelButton").hidden = false;
          document.getElementById("hangupCallPanelButton").disabled = false;
          document.getElementById("messageInput").focus();
        });
        for (const [height, offsetTop] of [[350, 0], [350, 180], [300, 220]]) {
          const keyboard = await page.evaluate(({ height, offsetTop }) => {
            Object.assign(window.visualViewport, { height, offsetTop });
            window.rotation();
            const bounds = selector => {
              const rect = document.querySelector(selector).getBoundingClientRect();
              return { top: rect.top, bottom: rect.bottom, height: rect.height };
            };
            return { active: document.body.classList.contains("tc-phone-keyboard-active"),
              shell: bounds(".app-shell"), video: bounds("#localVideo"), text: bounds("#totalConversationTextPanel"),
              controls: bounds(".call-media-controls"), composer: bounds("#composerForm"), hangup: bounds("#hangupCallPanelButton") };
          }, { height, offsetTop });
          assert.equal(keyboard.active, true);
          assert.ok(Math.abs(keyboard.shell.top - offsetTop) <= 1, JSON.stringify(keyboard));
          assert.ok(Math.abs(keyboard.shell.height - height) <= 1, JSON.stringify(keyboard));
          assert.ok(keyboard.video.height >= 80 && keyboard.video.top >= offsetTop - 1, "Video stays visible above the keyboard");
          assert.ok(keyboard.video.bottom <= keyboard.text.top + 1, "Video and RTT do not overlap");
          assert.ok(keyboard.text.bottom <= keyboard.controls.top + 1, "RTT and controls do not overlap");
          assert.ok(keyboard.controls.bottom <= keyboard.composer.top + 1, "Controls do not overlap the composer");
          assert.ok(keyboard.hangup.height >= 30, "Hangup remains available while typing");
          assert.ok(keyboard.composer.bottom <= offsetTop + height + 1, "Composer remains above keyboard after iOS viewport panning");
        }
        await page.screenshot({ path: path.join(output, `${name}-call-keyboard-${width}.png`), clip: { x: 0, y: 220, width, height: 300 } });
        const restored = await page.evaluate(() => {
          Object.assign(window.visualViewport, { height: 844, offsetTop: 0 });
          document.getElementById("messageInput").blur();
          window.rotation();
          return document.body.classList.contains("tc-phone-keyboard-active");
        });
        assert.equal(restored, false, "Closing the keyboard restores the normal call layout");
      }
      await page.setViewportSize({ width: 844, height: 390 });
      const landscapeKeyboard = await page.evaluate(() => {
        document.getElementById("messageInput").focus();
        Object.assign(window.visualViewport, { width: 844, height: 180, offsetTop: 40 });
        window.rotation();
        const video = document.getElementById("localVideo").getBoundingClientRect();
        const text = document.getElementById("totalConversationTextPanel").getBoundingClientRect();
        const composer = document.getElementById("composerForm").getBoundingClientRect();
        return { video: { height: video.height, right: video.right, top: video.top }, textLeft: text.left, composerBottom: composer.bottom };
      });
      assert.ok(landscapeKeyboard.video.height >= 80, "Landscape typing keeps video beside RTT instead of collapsing it");
      assert.ok(landscapeKeyboard.video.right <= landscapeKeyboard.textLeft + 1);
      assert.ok(landscapeKeyboard.video.top >= 39);
      assert.ok(landscapeKeyboard.composerBottom <= 221);
      await page.screenshot({ path: path.join(output, `${name}-call-keyboard-landscape.png`), clip: { x: 0, y: 40, width: 844, height: 180 } });
      for (const [width, height, top, side, bottom] of [[390, 844, 59, 0, 34], [844, 390, 0, 59, 21], [390, 844, 59, 0, 34]]) {
        await page.setViewportSize({ width, height });
        const safeArea = await page.evaluate(({ width, height, top, side, bottom }) => {
          document.getElementById("messageInput").blur();
          Object.assign(window.visualViewport, { width, height, offsetTop: 0 });
          for (const [edge, value] of Object.entries({ top, left: side, right: side, bottom })) {
            document.documentElement.style.setProperty(`--call-safe-area-${edge}`, `${value}px`);
          }
          window.scrollTo(0, 0);
          window.rotation();
          const header = document.querySelector(".chat-header").getBoundingClientRect();
          const avatar = document.getElementById("activeConversationAvatar").getBoundingClientRect();
          const controls = [...document.querySelectorAll(".chat-header button")].map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
          return { headerTop: header.top, avatarTop: avatar.top, controls: controls.map(rect => ({ top: rect.top, left: rect.left, right: rect.right })),
            overflow: document.documentElement.scrollWidth - innerWidth };
        }, { width, height, top, side, bottom });
        assert.ok(safeArea.headerTop >= top, "Call header must start below the iPhone status bar and Dynamic Island");
        assert.ok(safeArea.avatarTop >= top, "Contact avatar must not occupy the camera/status area");
        assert.ok(safeArea.controls.length > 0);
        for (const control of safeArea.controls) {
          assert.ok(control.top >= top && control.left >= side && control.right <= width - side + 1, JSON.stringify(safeArea));
        }
        assert.ok(safeArea.overflow <= 1, "Landscape safe-area padding must not create horizontal overflow");
      }
      await page.screenshot({ path: path.join(output, `${name}-call-safe-area.png`) });
      const safeKeyboard = await page.evaluate(() => {
        document.getElementById("messageInput").focus();
        Object.assign(window.visualViewport, { height: 350, offsetTop: 100 });
        window.rotation();
        const video = document.getElementById("localVideo").getBoundingClientRect();
        const composer = document.getElementById("composerForm").getBoundingClientRect();
        return { videoTop: video.top, videoHeight: video.height, composerBottom: composer.bottom,
          bottomPadding: parseFloat(getComputedStyle(document.querySelector(".app-shell")).paddingBottom) };
      });
      assert.ok(safeKeyboard.videoTop >= 159, "Keyboard panning must retain the top safe area");
      assert.ok(safeKeyboard.videoHeight >= 80);
      assert.ok(safeKeyboard.composerBottom <= 451);
      assert.equal(safeKeyboard.bottomPadding, 0, "The keyboard replaces the home-indicator inset, not an extra gap");
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        for (const name of ["ed", "Een contact met een bijzonder lange naam"]) {
          const row = await page.evaluate(({ width, name }) => {
            document.getElementById("messageInput").blur();
            Object.assign(window.visualViewport, { width, height: 844, offsetTop: 0 });
            document.getElementById("activeConversationName").textContent = name;
            window.rotation();
            const header = document.querySelector(".chat-header").getBoundingClientRect();
            const title = document.getElementById("activeConversationName").getBoundingClientRect();
            const buttons = [...document.querySelectorAll(".chat-header button")].map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
            return { headerHeight: header.height, titleWidth: title.width, titleRight: title.right, titleCenter: title.top + title.height / 2,
              buttons: buttons.map(rect => ({ center: rect.top + rect.height / 2, left: rect.left, right: rect.right })) };
          }, { width, name });
          assert.ok(row.titleWidth > 0, "The contact name remains visible during a mobile call");
          assert.ok(row.headerHeight <= 60, "Contact and call controls occupy one row, not an L shape");
          assert.ok(row.buttons.length >= 3);
          for (const button of row.buttons) {
            assert.ok(Math.abs(button.center - row.titleCenter) <= 2, JSON.stringify(row));
            assert.ok(button.left >= row.titleRight && button.right <= width, "Long names cannot push icons outside the screen");
          }
        }
      }
      await page.screenshot({ path: path.join(output, `${name}-call-header-row.png`) });
      const anchored = await page.evaluate(() => {
        const header = document.querySelector(".chat-header");
        const before = header.getBoundingClientRect().top;
        Object.assign(window.visualViewport, { height: 844, offsetTop: 59 });
        window.rotation();
        const line = document.querySelector(".tc-text-line");
        line.querySelector("p").textContent = "Lang RTT-bericht om terug te lezen. ".repeat(100);
        window.scrollTo(0, 500);
        document.querySelector(".chat-panel").scrollTop = 500;
        line.scrollTop = line.scrollHeight;
        return { before, after: header.getBoundingClientRect().top, rttScroll: line.scrollTop,
          composerBottom: document.getElementById("composerForm").getBoundingClientRect().bottom,
          offset: document.documentElement.style.getPropertyValue("--visual-viewport-top") };
      });
      assert.equal(anchored.offset, "0px", "Closing keyboard ignores the stale iOS pan offset");
      assert.equal(anchored.after, anchored.before, "Scrolling RTT or the page cannot move the header into the Dynamic Island");
      assert.ok(anchored.rttScroll > 0, "Long RTT remains independently scrollable");
      assert.ok(anchored.composerBottom <= 844, "Long RTT cannot push the composer outside the pinned call");
      for (const [width, height, landscape] of [[390, 350, false], [844, 180, true], [390, 350, false]]) {
        await page.setViewportSize({ width, height });
        const native = await page.evaluate(({ width, height, landscape }) => {
          window.TeleTypTelKeyboard = { nativeResize: true, active: true, landscape };
          Object.assign(window.visualViewport, { width, height: Math.max(80, height - 200), offsetTop: 200, scale: 1 });
          document.documentElement.style.setProperty("--call-safe-area-top", landscape ? "0px" : "59px");
          document.getElementById("messageInput").focus();
          window.rotation();
          const shell = document.querySelector(".app-shell").getBoundingClientRect();
          const video = document.getElementById("localVideo").getBoundingClientRect();
          return { top: shell.top, height: shell.height, videoHeight: video.height,
            composerBottom: document.getElementById("composerForm").getBoundingClientRect().bottom,
            keyboard: document.body.classList.contains("tc-phone-keyboard-active"),
            landscape: document.body.classList.contains("tc-phone-landscape-active") };
        }, { width, height, landscape });
        assert.equal(native.top, 0);
        assert.equal(native.height, height);
        assert.equal(native.keyboard, true);
        assert.equal(native.landscape, landscape);
        assert.ok(native.videoHeight >= 80, "Native keyboard leaves useful video space");
        assert.ok(Math.abs(native.composerBottom - height) <= 1, "Call composer touches the native keyboard boundary without a blank gap");
      }
      await page.screenshot({ path: path.join(output, `${name}-native-call-keyboard.png`) });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
