const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const origin = "https://chat-layout.test";
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const viewportFunctions = client.slice(client.indexOf("  function applyViewportDetection()"), client.indexOf("  function detectClientDevice()"));
const resizeFunction = client.slice(client.indexOf("  function handleViewportChange(reason)"), client.indexOf("  function updatePhoneLandscapeCallMode("));
const followerFunction = client.slice(client.indexOf("  function createMessageTimelineFollower("), client.indexOf("  function scrollMessageTimelineToLatest()"));
const scrollFunction = client.slice(client.indexOf("  function scrollMessageTimelineToLatest()"), client.indexOf("  function addConversation()"));

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: mobile chat remains readable with keyboard, offset and zoom`, { timeout: 60000 }, async () => {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [320, 390, 430]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
        try {
          const page = await context.newPage();
          await page.route("**/*", route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) return route.abort();
            if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
            const file = path.resolve(root, "." + url.pathname);
            if (!file.startsWith(root + path.sep) || !/\.(css|js|png|svg|ico)$/.test(file) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
            return route.fulfill({ path: file });
          });
          await page.goto(origin + "/chat.html");
          await page.evaluate(({ source, resize, follower, scroll }) => {
            document.body.className = "device-ios device-phone conversation-open";
            document.body.dataset.deviceClass = "phone";
            document.body.dataset.theme = "light";
            document.getElementById("hangupCallButton").hidden = true;
            const viewport = new EventTarget();
            Object.assign(viewport, { width: innerWidth, height: 844, offsetTop: 0, scale: 1 });
            Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
            window.updateChatViewport = new Function("el", "state", "updatePhoneLandscapeCallMode", "handleCallViewportChange",
              source + resize + follower + scroll + `
                const scheduleVisibleMessageAcknowledgements = () => {};
                const updateScrollToLatestButton = () => {
                  document.getElementById("scrollToLatestButton").hidden = el.messageTimeline.scrollHeight - el.messageTimeline.clientHeight - el.messageTimeline.scrollTop <= 120;
                };
                const messageTimelineFollower = createMessageTimelineFollower(el.messageTimeline, updateScrollToLatestButton);
                window.followLatestMessage = scrollMessageTimelineToLatest;
                document.getElementById("messageInput").addEventListener("focus", window.followLatestMessage);
                return handleViewportChange;
              `)({ messageTimeline: document.getElementById("messageTimeline") }, { call: null }, () => {}, () => {});
            window.updateChatViewport();
            const timeline = document.getElementById("messageTimeline");
            for (const direction of ["peer", "self"]) {
              for (const text of ["Hallo test", "Dit is een gewoon bericht met meerdere woorden.", "https://example.test/" + "lang".repeat(30)]) {
                const message = document.createElement("div");
                message.className = "message with-avatar has-inline-meta has-bubble-tail " + direction;
                message.innerHTML = '<div class="avatar message-avatar">ET</div><div class="message-content"><div class="message-body-wrap"><div class="message-body"><span class="message-text-content"></span> <span class="message-inline-meta">12:34 <span class="message-receipt message-receipt-delivered">✓✓</span></span></div><button class="message-reaction-button" type="button" aria-label="Reageren">☺</button></div></div>';
                message.querySelector(".message-text-content").textContent = text;
                timeline.append(message);
              }
            }
          }, { source: viewportFunctions, resize: resizeFunction, follower: followerFunction, scroll: scrollFunction });
          await page.addScriptTag({ path: path.join(root, "mobile-navigation.js") });
          const initial = await page.evaluate(() => {
            const input = document.getElementById("messageInput");
            const range = document.createRange();
            const lines = [...document.querySelectorAll(".message-text-content")].filter(element => element.textContent === "Hallo test").map(element => {
              range.selectNodeContents(element);
              return range.getClientRects().length;
            });
            return { lines, inputFont: parseFloat(getComputedStyle(input).fontSize),
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
          });
          assert.deepEqual(initial.lines, [1, 1], `${width}: own and received short messages should not be squeezed into a column`);
          assert.ok(initial.inputFont >= 16, "Composer must not trigger iOS focus zoom");
          assert.ok(initial.overflow <= 1, "No horizontal page overflow");
          await page.locator("#messageInput").focus();
          await page.evaluate(() => {
            const timeline = document.getElementById("messageTimeline");
            for (let index = 0; index < 8; index++) timeline.append(timeline.firstElementChild.cloneNode(true));
            window.followLatestMessage();
          });
          const resizedBeforeEvent = await page.evaluate(() => {
            const timeline = document.getElementById("messageTimeline");
            window.visualViewport.height = 350;
            document.documentElement.style.setProperty("--visual-viewport-height", "350px");
            void timeline.clientHeight;
            window.updateChatViewport();
            return timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop;
          });
          assert.ok(resizedBeforeEvent <= 1, "Keep the latest message when iOS resizes before dispatching the viewport event");
          for (const [height, offsetTop, scale] of [[350, 300, 1], [300, 0, 1], [844, 0, 1]]) {
            const metrics = await page.evaluate(({ height, offsetTop, scale }) => {
              Object.assign(window.visualViewport, { height, offsetTop, scale });
              window.updateChatViewport();
              const shell = document.querySelector(".app-shell").getBoundingClientRect();
              const timeline = document.getElementById("messageTimeline").getBoundingClientRect();
              const composer = document.getElementById("composerForm").getBoundingClientRect();
              return { top: shell.top, height: shell.height, timeline: timeline.height, composerBottom: composer.bottom,
                bottomGap: document.getElementById("messageTimeline").scrollHeight - document.getElementById("messageTimeline").clientHeight - document.getElementById("messageTimeline").scrollTop,
                rows: [...document.querySelector(".chat-panel").children].filter(element => element.getBoundingClientRect().height > 0).map(element => [element.id || element.className, element.getBoundingClientRect().height]),
                orientation: document.body.dataset.viewportOrientation, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
            }, { height, offsetTop, scale });
            assert.ok(Math.abs(metrics.top - offsetTop) <= 1, `${width}: shell follows visual viewport offset (${JSON.stringify(metrics)})`);
            assert.ok(Math.abs(metrics.height - height) <= 1, "Use keyboard-reduced viewport height exactly once");
            assert.ok(metrics.timeline >= 80, `Conversation remains visible above keyboard: ${JSON.stringify(metrics)}`);
            assert.ok(metrics.composerBottom <= offsetTop + height + 1, "Composer stays above keyboard");
            assert.equal(metrics.orientation, "portrait", "Keyboard is not a device rotation");
            assert.ok(metrics.bottomGap <= 1, "Latest message stays visible when keyboard opens or closes");
            assert.ok(metrics.overflow <= 1);
          }
          const typing = await page.evaluate(async () => {
            const timeline = document.getElementById("messageTimeline");
            const draft = timeline.lastElementChild.querySelector(".message-text-content");
            let maxGap = 0;
            for (let index = 0; index < 20; index++) {
              draft.textContent += " live RTT tekst";
              window.followLatestMessage();
              maxGap = Math.max(maxGap, timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop);
            }
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { maxGap, arrowHidden: document.getElementById("scrollToLatestButton").hidden,
              lastBottom: timeline.lastElementChild.getBoundingClientRect().bottom, viewportBottom: timeline.getBoundingClientRect().bottom };
          });
          assert.ok(typing.maxGap <= 1, "Rapid RTT edits follow immediately without repeatedly restarting smooth scrolling");
          assert.equal(typing.arrowHidden, true);
          assert.ok(typing.lastBottom <= typing.viewportBottom + 1, "Last message really is inside the timeline");
          await page.evaluate(() => { document.getElementById("composerForm").style.paddingBottom = "60px"; });
          await page.waitForFunction(() => {
            const timeline = document.getElementById("messageTimeline");
            return timeline.scrollHeight - timeline.clientHeight - timeline.scrollTop <= 1;
          });
          await page.evaluate(() => { document.getElementById("composerForm").style.paddingBottom = ""; });
          if (width === 390) {
            await page.evaluate(() => { Object.assign(window.visualViewport, { height: 350, offsetTop: 0 }); window.updateChatViewport(); });
            const output = path.resolve(__dirname, "../artifacts/mobile-chat");
            fs.mkdirSync(output, { recursive: true });
            await page.screenshot({ path: path.join(output, `${name}-keyboard-layout.png`), clip: { x: 0, y: 0, width, height: 350 } });
          }
          const reading = await page.evaluate(() => {
            const timeline = document.getElementById("messageTimeline");
            Object.assign(window.visualViewport, { height: 350, offsetTop: 0 });
            window.updateChatViewport();
            timeline.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
            timeline.scrollTop = 0;
            window.visualViewport.height = 300;
            window.updateChatViewport();
            return timeline.scrollTop;
          });
          assert.equal(reading, 0, "Reading older messages is not interrupted by a viewport resize");
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.equal(await page.locator("#messageTimeline").evaluate(element => element.scrollTop), 0, "A queued follow-up frame does not cancel intentional backscroll");
          const zoom = await page.evaluate(() => {
            Object.assign(window.visualViewport, { width: innerWidth / 2, height: 422, scale: 2 });
            window.updateChatViewport();
            return { height: document.querySelector(".app-shell").getBoundingClientRect().height,
              viewport: document.querySelector('meta[name="viewport"]').content };
          });
          assert.equal(zoom.height, 844, "Pinch zoom must not shrink the app layout again");
          assert.doesNotMatch(zoom.viewport, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
          await page.setViewportSize({ width, height: 350 });
          const native = await page.evaluate(() => {
            window.TeleTypTelKeyboard = { nativeResize: true, active: true, landscape: false };
            Object.assign(window.visualViewport, { width: innerWidth, height: 120, offsetTop: 230, scale: 1 });
            window.updateChatViewport();
            window.followLatestMessage();
            const shell = document.querySelector(".app-shell").getBoundingClientRect();
            const composer = document.getElementById("composerForm").getBoundingClientRect();
            return { top: shell.top, height: shell.height, composerBottom: composer.bottom,
              landscape: document.body.dataset.viewportOrientation };
          });
          assert.equal(native.top, 0, "Native WebView must not be panned twice");
          assert.equal(native.height, 350, "Native keyboard resize already reserves keyboard space");
          assert.ok(Math.abs(native.composerBottom - 350) <= 1, "No blank gap between composer and native keyboard");
          assert.equal(native.landscape, "portrait", "Keyboard-reduced native height does not imply rotation");
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  });
}
