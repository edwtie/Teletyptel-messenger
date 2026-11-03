const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium, webkit } = require("playwright");
const root = path.resolve(__dirname, "../php/public");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const detection = client.slice(client.indexOf("  function detectClientDevice()"), client.indexOf("  function isPhoneDevice()"));

test("iPad Mobile Safari and desktop-mode iPad are tablets, never phones", () => {
  for (const [userAgent, platform, touch, expected] of [
    ["Mozilla iPad OS 18_0 Mobile/15E148 Safari", "iPad", 5, "tablet"],
    ["Mozilla Macintosh Mobile/15E148 Safari", "MacIntel", 5, "tablet"],
    ["Mozilla iPhone Mobile Safari", "iPhone", 5, "phone"],
    ["Mozilla Macintosh Safari", "MacIntel", 0, "desktop"]
  ]) {
    assert.equal(vm.runInNewContext(detection + "detectClientDevice().deviceClass", {
      navigator: { userAgent, platform, maxTouchPoints: touch }
    }), expected);
  }
});

for (const engine of [chromium, webkit]) {
  test(`${engine.name()}: tablet chat, rotation, small windows and keyboard-sized TC view`, async () => {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ hasTouch: true, viewport: { width: 1194, height: 834 }, colorScheme: "light" });
      const page = await context.newPage();
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin !== "https://tablet.test") return route.abort();
        if (url.pathname === "/chat.html") {
          const html = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
          return route.fulfill({ contentType: "text/html", body: html });
        }
        const file = path.resolve(root, "." + url.pathname);
        if (!file.startsWith(root + path.sep) || !/\.(css|png|svg|ico)$/.test(file) || !fs.existsSync(file)) {
          return route.fulfill({ status: 404, body: "" });
        }
        if (file.endsWith(".css")) {
          const css = fs.readFileSync(file, "utf8").replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,\s*0px)?\)/g,
            (_, side) => ({ top: "24px", bottom: "20px", left: "0px", right: "0px" })[side]);
          return route.fulfill({ contentType: "text/css", body: css });
        }
        return route.fulfill({ path: file });
      });
      await page.goto("https://tablet.test/chat.html");
      await page.evaluate(() => {
        document.body.className = "device-tablet device-ios viewport-tablet conversation-open";
        document.body.dataset.theme = "light";
        document.body.dataset.platform = "ios";
        document.querySelector(".chat-title h2").textContent = "Voorbeeldcontact";
        document.getElementById("activeConversationMeta").textContent = "Online";
        for (const id of ["answerCallButton", "hangupCallButton"]) document.getElementById(id).hidden = true;
        document.getElementById("conversationItems").innerHTML = Array.from({ length: 30 }, (_, index) =>
          `<button class="conversation-item"><span class="avatar">${index + 1}</span><span class="conversation-text"><strong>Contact ${index + 1}</strong><span>Een voorbeeldbericht</span></span><span class="conversation-row-meta"><span class="conversation-time">12:30</span><span class="presence-dot presence-online"></span></span></button>`).join("");
        document.getElementById("messageTimeline").innerHTML = Array.from({ length: 20 }, (_, index) =>
          `<div class="message ${index % 2 ? "self" : ""}"><div class="message-body">Een duidelijk leesbaar bericht op de iPad.</div></div>`).join("");
        document.getElementById("messageInput").value = "Mijn concept blijft behouden";
      });
      const iconsStart = client.indexOf("  const materialIcons = {");
      await page.addScriptTag({ content: client.slice(iconsStart, client.indexOf("\n  };", iconsStart) + 5)
        + client.slice(client.indexOf("  function createMaterialIcon("), client.indexOf("  function createScreenReaderText("))
        + "renderMaterialIcons();" });
      await page.addScriptTag({ content: fs.readFileSync(path.join(root, "mobile-navigation.js"), "utf8") });
      const output = path.resolve(__dirname, "../artifacts/tablet-layout");
      fs.mkdirSync(output, { recursive: true });
      await page.evaluate(() => document.body.classList.remove("conversation-open"));
      assert.equal(await page.locator(".tablet-chat-placeholder").isVisible(), true);
      await page.evaluate(() => document.body.classList.add("conversation-open"));
      assert.equal(await page.locator(".tablet-chat-placeholder").isVisible(), false);
      for (const viewport of [{ width: 1194, height: 834 }, { width: 834, height: 1194 },
        { width: 834, height: 500 }, { width: 744, height: 900 }, { width: 600, height: 900 }, { width: 390, height: 600 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(({ width, height }) => {
          document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
          document.body.classList.toggle("viewport-phone", width <= 640);
          document.body.classList.toggle("viewport-tablet", width > 640);
        }, viewport);
        await page.screenshot({ path: path.join(output, `${engine.name()}-${viewport.width}-${viewport.height}.png`) });
        const bounds = await page.locator("#composerForm").boundingBox();
        const shell = await page.locator(".app-shell").boundingBox();
        assert.ok(shell && Math.abs(shell.x) <= 1 && Math.abs(shell.y) <= 1
          && Math.abs(shell.width - viewport.width) <= 1 && Math.abs(shell.height - viewport.height) <= 1,
        `tablet must fill its available viewport: ${JSON.stringify({ viewport, shell })}`);
        assert.ok(bounds && bounds.y + bounds.height <= viewport.height + 1, `composer outside ${JSON.stringify({ viewport, bounds })}`);
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1);
        if (viewport.width >= 800) {
          const list = await page.locator(".conversation-list").boundingBox();
          const chat = await page.locator(".chat-panel").boundingBox();
          assert.ok(list && chat && list.x + list.width <= chat.x + 1);
          assert.ok(list.width >= 280 && list.width <= 340);
          assert.equal(await page.locator(".back-to-contacts").isVisible(), false);
        } else {
          assert.equal(await page.locator(".conversation-list").isVisible(), false);
          assert.equal(await page.locator(".back-to-contacts").isVisible(), true);
        }
        assert.equal(await page.locator("#messageInput").inputValue(), "Mijn concept blijft behouden");
      }
      await page.setViewportSize({ width: 834, height: 550 });
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--visual-viewport-height", "550px");
        document.body.classList.remove("viewport-phone");
        document.body.classList.add("viewport-tablet", "call-active", "tc-text-visible-active");
        document.getElementById("callPanel").hidden = false;
        document.getElementById("hangupCallButton").hidden = false;
        document.getElementById("totalConversationTextPanel").hidden = false;
        document.getElementById("totalConversationRemoteText").textContent = "Ik kan je tekst goed lezen.";
        document.getElementById("totalConversationLocalText").value = "Video, geluid en realtime tekst.";
        document.getElementById("totalConversationLocalText").disabled = false;
        document.getElementById("totalConversationLocalPreviousText").hidden = true;
        document.getElementById("totalConversationRemotePreviousText").hidden = true;
      });
      await page.screenshot({ path: path.join(output, `${engine.name()}-tc-keyboard.png`) });
      for (const selector of ["#composerForm", ".call-media-controls", "#totalConversationTextPanel"]) {
        const bounds = await page.locator(selector).boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 551, `${selector} outside viewport: ${JSON.stringify(bounds)}`);
      }
      await page.evaluate(() => {
        document.querySelector(".call-mode-buttons").hidden = true;
        document.getElementById("hangupCallPanelButton").hidden = false;
        for (const button of document.querySelectorAll(".call-media-controls button")) button.disabled = false;
      });
      for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 },
        { width: 834, height: 550 }, { width: 1194, height: 430 },
        { width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(height => document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`), viewport.height);
        await page.screenshot({ path: path.join(output, `${engine.name()}-tc-${viewport.width}-${viewport.height}.png`) });
        assert.equal(await page.locator(".conversation-list").isVisible(), false, "TC hides contacts by default");
        const fullChat = await page.locator(".chat-panel").boundingBox();
        assert.ok(fullChat.x <= 1 && Math.abs(fullChat.width - viewport.width) <= 1, "TC fills the available width");
        assert.equal(await page.locator(".call-mode-buttons").isVisible(), false, "hidden call actions must stay hidden");
        const toolbar = await page.locator(".call-media-controls").boundingBox();
        for (const button of await page.locator(".call-media-controls button:visible").all()) {
          const bounds = await button.boundingBox();
          const icon = await button.locator("svg").boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44, `touch target too small: ${await button.getAttribute("id")}`);
          assert.ok(bounds.x >= toolbar.x && bounds.x + bounds.width <= toolbar.x + toolbar.width + 1,
            "call button must not require horizontal scrolling");
          assert.ok(icon && icon.width >= 20 && icon.height >= 20 && icon.x >= bounds.x
            && icon.y >= bounds.y && icon.x + icon.width <= bounds.x + bounds.width + 1
            && icon.y + icon.height <= bounds.y + bounds.height + 1, "icon fits inside button");
        }
        const volume = await page.locator(".volume-control").boundingBox();
        assert.ok(volume.x >= toolbar.x && volume.x + volume.width <= toolbar.x + toolbar.width + 1);
        assert.ok(toolbar.y + toolbar.height <= viewport.height, JSON.stringify({ viewport, toolbar,
          layout: await page.evaluate(() => [".app-shell", ".client-grid", ".chat-panel", "#callPanel"].map(selector => {
            const element = document.querySelector(selector);
            const style = getComputedStyle(element);
            return { selector, height: element.getBoundingClientRect().height, rows: style.gridTemplateRows, row: style.gridRow };
          })) }));
        const composer = await page.locator("#composerForm").boundingBox();
        assert.ok(composer.y >= toolbar.y + toolbar.height - 1 && composer.y + composer.height <= viewport.height + 1);
        for (const camera of ["has-local-video remote-video-main", "has-local-video local-video-main no-remote-video"]) {
          await page.evaluate(camera => {
            document.body.classList.add("tc-call-active");
            document.body.classList.remove("tc-text-visible-active");
            document.getElementById("totalConversationTextPanel").hidden = true;
            document.getElementById("callPanel").className = "call-panel " + camera;
            document.getElementById("remoteVideo").hidden = camera.includes("no-remote-video");
            document.getElementById("localVideo").hidden = false;
            for (const [id, color, label] of [["remoteVideo", "#274b68", "Remote video fixture"], ["localVideo", "#316d69", "Local video fixture"]]) {
              document.getElementById(id).poster = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="${color}"/><circle cx="800" cy="450" r="220" fill="none" stroke="white" stroke-width="4"/><text x="800" y="460" text-anchor="middle" fill="white" font-size="34">${label}</text></svg>`);
            }
          }, camera);
          assert.equal(await page.locator("#totalConversationTextPanel").isVisible(), false);
          const controls = await page.locator(".call-media-controls").boundingBox();
          const input = await page.locator("#composerForm").boundingBox();
          assert.ok(controls.y >= 0 && controls.y + controls.height <= input.y + 1
            && input.y + input.height <= viewport.height + 1, "TC without RTT still fits the screen");
          const main = await page.locator(camera.includes("no-remote-video") ? "#localVideo" : "#remoteVideo").boundingBox();
          const canvas = await page.locator("#callPanel").boundingBox();
          assert.ok(Math.abs(main.x - canvas.x) <= 1 && Math.abs(main.width - canvas.width) <= 1
            && main.y >= canvas.y && main.y + main.height <= controls.y + 1,
          `video fills the canvas without covering controls: ${JSON.stringify({ viewport, main, canvas, controls })}`);
          await page.screenshot({ path: path.join(output, `${engine.name()}-video-${camera.includes("no-remote-video") ? "local" : "remote"}-${viewport.width}-${viewport.height}.png`) });
        }
        await page.evaluate(() => {
          document.body.classList.add("tc-text-visible-active");
          document.getElementById("totalConversationTextPanel").hidden = false;
          document.getElementById("callPanel").classList.add("tc-text-full");
        });
        const textBounds = await page.locator("#totalConversationTextPanel").boundingBox();
        const panelBounds = await page.locator("#callPanel").boundingBox();
        const mediaBounds = await page.locator(".call-media-controls").boundingBox();
        assert.ok(textBounds.y <= panelBounds.y + 1 && textBounds.height >= panelBounds.height - mediaBounds.height - 2,
          "text-only TC uses the whole canvas above the controls");
        assert.equal(await page.locator("#localVideo").isVisible(), false);
        const remoteText = await page.locator(".tc-text-remote").boundingBox();
        const localText = await page.locator(".tc-text-local").boundingBox();
        assert.ok(viewport.width > viewport.height
          ? remoteText.x + remoteText.width <= localText.x + 1
          : remoteText.y + remoteText.height <= localText.y + 1, "RTT panels adapt to available orientation");
        await page.screenshot({ path: path.join(output, `${engine.name()}-rtt-full-${viewport.width}-${viewport.height}.png`) });
        await page.evaluate(() => document.getElementById("callPanel").classList.remove("tc-text-full"));
        assert.equal(await page.locator("#localVideo").evaluate(element => getComputedStyle(element).objectFit), "cover");
      }
      await page.setViewportSize({ width: 834, height: 1194 });
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--visual-viewport-height", "1194px");
        window.originalVideo = document.getElementById("localVideo");
        window.originalComposer = document.getElementById("messageInput");
      });
      const assertDrawer = async open => {
        assert.equal(await page.locator("#callContactsToggle").getAttribute("aria-expanded"), String(open));
        assert.equal(await page.locator("#conversationSidebar").evaluate(element => element.inert), !open);
        assert.equal(await page.locator("#conversationSidebar").isVisible(), open);
        assert.equal(await page.locator("#messageInput").inputValue(), "Mijn concept blijft behouden");
        assert.equal(await page.evaluate(() => window.originalVideo === document.getElementById("localVideo")
          && window.originalComposer === document.getElementById("messageInput")), true);
      };
      await page.locator("#callContactsToggle").click();
      await assertDrawer(true);
      assert.equal(await page.locator("#callContactsClose").evaluate(element => element === document.activeElement), true);
      assert.equal(await page.locator("#callContactsBackdrop").evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0.35)");
      await page.screenshot({ path: path.join(output, `${engine.name()}-tc-contacts-open.png`), animations: "disabled" });
      for (const viewport of [{ width: 1194, height: 834 }, { width: 834, height: 1194 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(height => document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`), viewport.height);
        await assertDrawer(true);
        const drawer = await page.locator("#conversationSidebar").boundingBox();
        assert.ok(Math.abs(drawer.x) <= 1 && drawer.width <= 340 && drawer.y >= 0
          && drawer.y + drawer.height <= viewport.height + 1, "open drawer stays on screen through rotation");
        await page.screenshot({ path: path.join(output, `${engine.name()}-drawer-${viewport.width}-${viewport.height}.png`), animations: "disabled" });
      }
      await page.keyboard.press("Escape");
      await assertDrawer(false);
      await page.locator("#callContactsToggle").click();
      await page.locator("#callContactsBackdrop").click({ position: { x: 700, y: 100 } });
      await assertDrawer(false);
      const swipe = async (selector, from, to) => page.locator(selector).evaluate((element, { from, to }) => {
        const dispatch = (type, point, ended) => {
          const touch = { identifier: 1, clientX: point[0], clientY: point[1] };
          const event = new Event(type, { bubbles: true });
          Object.defineProperties(event, { touches: { value: ended ? [] : [touch] }, changedTouches: { value: [touch] } });
          element.dispatchEvent(event);
        };
        dispatch("touchstart", from, false);
        dispatch("touchend", to, true);
      }, { from, to });
      await swipe("#callContactsEdge", [5, 300], [100, 305]);
      await assertDrawer(true);
      await swipe("#conversationSidebar", [200, 300], [202, 450]);
      await assertDrawer(true);
      await swipe("#conversationSearchInput", [250, 150], [100, 150]);
      await assertDrawer(true);
      await swipe("#conversationSidebar", [250, 300], [100, 305]);
      await assertDrawer(false);
      await page.locator("#callContactsToggle").click();
      await page.locator(".conversation-item").first().click();
      await assertDrawer(false);
      await page.locator("#callContactsToggle").click();
      await page.setViewportSize({ width: 600, height: 900 });
      await page.waitForFunction(() => !document.body.classList.contains("tablet-call-drawer"));
      assert.equal(await page.locator("#callContactsToggle").isVisible(), false);
      assert.equal(await page.locator("#conversationSidebar").evaluate(element => element.inert), false);
      await page.setViewportSize({ width: 834, height: 1194 });
      await page.waitForFunction(() => document.body.classList.contains("tablet-call-drawer"));
      await assertDrawer(false);
      await page.evaluate(() => document.body.classList.remove("call-active", "tc-call-active", "tc-text-visible-active"));
      assert.equal(await page.locator("#conversationSidebar").isVisible(), true, "ending the call restores contacts");
      assert.equal(await page.locator("#conversationSidebar").evaluate(element => element.inert), false);
      assert.equal(await page.locator("#callContactsToggle").isVisible(), false);
    } finally { await browser.close(); }
  });
}
