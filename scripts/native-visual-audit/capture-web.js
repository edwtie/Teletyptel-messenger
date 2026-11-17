"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { screens, variants, caseID } = require("./catalogue");

const root = path.resolve(__dirname, "../..");
const origin = "https://teletyptel-visual.example.invalid";
const epoch = "2026-11-17T11:00:00.000Z";

async function bounded(promise, milliseconds, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
const scenarios = {
  login: async page => page.evaluate(() => nativeVisualFixture.login()),
  "login-settings": async page => { await page.evaluate(() => nativeVisualFixture.login()); await page.locator("#dialogServerSettingsButton").tap(); },
  contacts: async page => page.evaluate(() => nativeVisualFixture.contacts()),
  "main-menu": async page => {
    if (await page.locator("#mobileActionsToggle").isVisible()) { await page.locator("#mobileActionsToggle").tap(); return "popover"; }
    return "persistent-web-toolbar";
  },
  chat: async () => {},
  "conversation-menu": async page => {
    if (await page.locator("#chatMoreToggle").isVisible()) { await page.locator("#chatMoreToggle").tap(); return "popover"; }
    return "persistent-web-actions";
  },
  "message-menu": async page => page.evaluate(() => nativeVisualFixture.messageMenu()),
  smileys: async page => page.locator("#emojiButton").tap(),
  attachments: async page => page.locator("#attachmentMenuButton").tap(),
  account: async page => page.evaluate(() => nativeVisualFixture.settings()),
  appearance: async page => page.evaluate(() => nativeVisualFixture.settingsPanel("preferences")),
  translation: async page => page.evaluate(() => nativeVisualFixture.settingsPanel("privacy")),
  "account-security": async page => page.evaluate(() => nativeVisualFixture.settingsPanel("security")),
  "profile-edit": async page => page.evaluate(() => nativeVisualFixture.profile()),
  "contact-profile": async page => page.evaluate(() => nativeVisualFixture.contactProfile()),
  "group-chat": async page => page.evaluate(() => nativeVisualFixture.group()),
  "group-management": async page => { await page.evaluate(() => nativeVisualFixture.group()); await page.evaluate(() => nativeVisualFixture.groupManagement()); },
  dialer: async page => { await page.locator("#phoneDialerButton").evaluate(element => element.click()); },
  "dialer-contacts": async page => { await page.locator("#phoneDialerButton").evaluate(element => element.click()); await page.locator("#phoneDialerContactsView").tap(); },
  history: async page => page.locator("#historyButton").evaluate(element => element.click()),
  archive: async page => page.locator("#archiveButton").evaluate(element => element.click()),
  audio: async page => page.evaluate(() => nativeVisualFixture.call("audio")),
  video: async page => page.evaluate(() => nativeVisualFixture.call("video")),
  tc: async page => page.evaluate(() => nativeVisualFixture.call("total")),
  "call-controls": async page => {
    await page.evaluate(() => nativeVisualFixture.call("total"));
    if (await page.locator("#callControlsToggle").isVisible()) { await page.locator("#callControlsToggle").tap(); return "popover"; }
    return "persistent-web-call-controls";
  },
  "call-keypad": async page => { await page.evaluate(() => nativeVisualFixture.call("total")); await page.locator("#callKeypadButton").evaluate(element => element.click()); },
  "incoming-call": async page => page.evaluate(() => nativeVisualFixture.call("total", true))
};

const visibleState = {
  login: "#accountDialog:not([hidden])", "login-settings": '[data-settings-panel="server"]:not([hidden])',
  contacts: "#conversationSidebar", chat: "#messageTimeline .message-body", "contact-profile": "#contactProfileDialog:not([hidden])",
  "message-menu": "#messageContextMenu:not([hidden])", smileys: "#smileyPickerPanel:not([hidden])", attachments: "#attachmentMenuPanel:not([hidden])",
  account: "#accountDialog:not([hidden])", appearance: '[data-settings-panel="preferences"]:not([hidden])',
  translation: '[data-settings-panel="privacy"]:not([hidden])', "account-security": '[data-settings-panel="security"]:not([hidden])',
  "profile-edit": '[data-settings-panel="profile"]:not([hidden])', "group-management": "#groupManagementDialog:not([hidden])",
  dialer: "#phoneDialerDialog[open]", "dialer-contacts": "#phoneDialerContactsPanel:not([hidden])",
  history: "#historyPage:not([hidden])", archive: "#tabPanel:not([hidden])", audio: "#callPanel:not([hidden])",
  video: "#callPanel:not([hidden])", tc: "#totalConversationTextPanel:not([hidden])", "call-controls": "#callPanel:not([hidden])",
  "call-keypad": "#callKeypadDialog[open]", "incoming-call": "#incomingCallDialog:not([hidden])"
};

function trackedReader(revision, sourceMode = "committed") {
  if (!["committed", "working-tree"].includes(sourceMode)) throw new Error("Choose an explicit committed or working-tree web source");
  const files = new Map();
  const known = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", revision, "php/public"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/));
  if (sourceMode === "working-tree") for (const file of ["php/public/private-label.css", "php/public/private-label.js"]) known.add(file);
  return {
    read(file) {
      if (!known.has(file)) return null;
      if (!files.has(file)) {
        if (sourceMode === "working-tree") {
          if (!fs.existsSync(path.join(root, file))) return null;
          files.set(file, fs.readFileSync(path.join(root, file)));
        } else files.set(file, execFileSync("git", ["show", revision + ":" + file], { cwd: root, maxBuffer: 24 * 1024 * 1024 }));
      }
      return files.get(file);
    },
    manifest() { return [...files].map(([file, bytes]) => ({ file, sha256: crypto.createHash("sha256").update(bytes).digest("hex") })); }
  };
}

function mime(file) {
  return ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".json": "application/json", ".lng": "text/plain" })[path.extname(file)] || "application/octet-stream";
}

async function capture({ output, revision = "HEAD", sourceMode = "committed", browserName = "webkit", selectedScreens = Object.keys(scenarios), selectedVariants = variants } = {}) {
  if (!output || fs.existsSync(output)) throw new Error("Choose a new output directory; existing evidence is never overwritten");
  if (!selectedScreens.length || selectedScreens.some(screen => !Object.hasOwn(scenarios, screen)) || new Set(selectedScreens).size !== selectedScreens.length || !selectedVariants.length) throw new Error("Select explicit known visual scenarios and viewports");
  const playwright = require("playwright");
  if (!["webkit", "chromium"].includes(browserName)) throw new Error("Unsupported renderer");
  const source = trackedReader(revision, sourceMode);
  const sha = execFileSync("git", ["rev-parse", revision], { cwd: root, encoding: "utf8" }).trim();
  const bootstrap = fs.readFileSync(path.join(root, "scripts/ios-simulator/fixture-bootstrap.js"), "utf8");
  const hook = fs.readFileSync(path.join(__dirname, "web-hook.js"), "utf8");
  fs.mkdirSync(output, { recursive: true });
  const hash = content => crypto.createHash("sha256").update(content).digest("hex");
  const result = { captureSchema: 2, revision: sha, sourceMode, source: sourceMode + " actual chat.html/CSS/JS, API and XMPP mocked; no replacement UI", renderer: browserName, epoch, locale: "nl-NL", timezone: "Europe/Amsterdam", fixtureSources: { hook: hash(hook), bootstrap: hash(bootstrap) }, captures: [], blocked: [], caveat: "Desktop WebKit/Chromium at CSS viewport size, not physical iOS Safari. This alone is not a native pixel-equality result." };
  const browser = await playwright[browserName].launch({ headless: true });
  console.log("Visual renderer ready: " + browserName);
  try {
    for (const variant of selectedVariants) {
      for (const screen of screens.filter(entry => selectedScreens.includes(entry.id))) {
        const identifier = caseID(screen.id, variant);
        console.log("Opening " + identifier);
        const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, deviceScaleFactor: variant.scale, isMobile: true, hasTouch: true, locale: "nl-NL", timezoneId: "Europe/Amsterdam", colorScheme: variant.theme, reducedMotion: "reduce", serviceWorkers: "block" });
        const errors = [];
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.setDefaultNavigationTimeout(20000);
        page.on("pageerror", error => errors.push(error.message));
        const languages = Object.fromEntries(["ned", "eng"].map(language => ["/lang/" + language + ".lng", source.read("php/public/lang/" + language + ".lng").toString("utf8")]));
        await context.route("**/*", async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin || /(?:^|\/)config\/|(?:^|\/)api\//.test(url.pathname)) {
            result.blocked.push(url.origin + url.pathname);
            return route.fulfill({ status: 403, contentType: "application/json", body: '{"ok":false,"error":"visual_fixture_network_disabled"}' });
          }
          let file;
          try { file = "php/public/" + decodeURIComponent(url.pathname).replace(/^\/+/, ""); } catch { return route.abort(); }
          if (file.includes("..") || /[\x00-\x1f\\]/.test(file)) return route.abort();
          const content = source.read(file);
          if (!content) return route.fulfill({ status: 404, body: "Not in the frozen reference revision" });
          let body = content;
          if (file === "php/public/chat-client.js") {
            const script = content.toString("utf8");
            if (!script.trimEnd().endsWith("})();")) throw new Error("Review changed web fixture instrumentation boundary");
            body = Buffer.from(script.replace(/\}\)\(\);\s*$/, hook + "\n})();\n"));
          }
          return route.fulfill({ status: 200, contentType: mime(file), body });
        });
        await page.addInitScript({ content: "window.iosFixtureLanguages=" + JSON.stringify(languages) + ";\n" + bootstrap });
        await page.clock.setFixedTime(new Date(epoch));
        try {
          await page.goto(origin + "/chat.html", { waitUntil: "load" });
          console.log("Loaded " + identifier);
          await page.waitForFunction(() => Boolean(window.nativeVisualFixture), null, { timeout: 5000 });
          console.log("Hook ready " + identifier);
          const input = await page.evaluate(() => ({ touchPoints: navigator.maxTouchPoints, touchEvents: "ontouchstart" in window && typeof TouchEvent !== "undefined", coarse: matchMedia("(pointer: coarse)").matches, hover: matchMedia("(hover: hover)").matches }));
          if (!input.touchEvents || !input.coarse || input.hover) throw new Error("Mobile touch media do not match the native comparison target: " + JSON.stringify(input));
          await page.evaluate(theme => nativeVisualFixture.setup(theme), variant.theme);
          console.log("Fixture ready " + identifier);
          await page.waitForTimeout(100);
          await page.evaluate(() => { document.activeElement?.blur(); });
          const presentation = await scenarios[screen.id](page);
          await page.waitForTimeout(80);
          if (["login", "login-settings", "account", "profile-edit", "appearance", "translation", "account-security"].includes(screen.id)) await page.evaluate(() => { document.activeElement?.blur(); });
          await page.waitForTimeout(180);
          await page.evaluate(async () => { await document.fonts.ready; await Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 1000))]); });
          if (errors.length) throw new Error(errors.join("; "));
          if (screen.id !== "login" && await page.locator("dialog.xmpp-availability[open]").count()) throw new Error("Startup overlay still covers the requested screen");
          if (visibleState[screen.id] && !await page.locator(visibleState[screen.id]).first().isVisible()) throw new Error("The requested real screen did not become visible: " + screen.id);
          if (presentation === "popover") {
            const panel = ({ "main-menu": "#mobileActionsPanel", "conversation-menu": "#chatMorePanel", "call-controls": "#callControlsMenu" })[screen.id];
            if (!panel || !await page.locator(panel).isVisible()) throw new Error("Requested popover closed before capture: " + screen.id);
            if (!await page.locator(panel + " button:visible").count()) throw new Error("Requested popover contains no visible controls: " + screen.id);
          }
          const geometry = await page.evaluate(() => nativeVisualFixture.captureGeometry());
          const file = identifier + ".png";
          await page.screenshot({ path: path.join(output, file), animations: "disabled", caret: "hide" });
          const visibleImages = await page.evaluate(() => [...document.images].filter(image => image.getClientRects().length && image.getAttribute("src")).map(image => ({ source: image.getAttribute("src"), complete: image.complete && image.naturalWidth > 0 })));
          if (visibleImages.some(image => !image.complete)) throw new Error("Visible image did not decode");
          result.captures.push({ id: identifier, screen: screen.id, ...variant, file, geometry, visibleImages, stateVerified: true, inputVerified: true, input, presentation: presentation || "default", errors, status: "web-captured-only" });
          console.log("Captured " + identifier);
        } catch (error) {
          await page.screenshot({ path: path.join(output, identifier + "-failed.png"), animations: "disabled" }).catch(() => {});
          result.captures.push({ id: identifier, screen: screen.id, ...variant, status: "capture-failed", error: error.message, errors });
        } finally {
          try {
            await bounded(page.evaluate(() => window.nativeVisualFixture?.cleanup()), 5000, "Fixture teardown did not settle");
            await bounded(context.close(), 10000, "WebKit context did not close");
          } catch (error) {
            const entry = result.captures.at(-1);
            if (entry?.id === identifier) { entry.status = "capture-failed"; entry.error = error.message; }
            throw error;
          } finally {
            result.files = source.manifest();
            fs.writeFileSync(path.join(output, "web-manifest.json"), JSON.stringify(result, null, 2));
          }
        }
      }
    }
  } finally {
    try { await bounded(browser.close(), 10000, "WebKit did not close"); }
    catch (error) { result.teardownFailure = error.message; throw error; }
    finally {
      result.blocked = [...new Set(result.blocked)];
      result.files = source.manifest();
      fs.writeFileSync(path.join(output, "web-manifest.json"), JSON.stringify(result, null, 2));
    }
  }
  return result;
}

if (require.main === module) {
  const output = path.resolve(process.argv[2] || path.join(root, "artifacts/native-visual-web-" + Date.now()));
  const selectedScreens = process.env.VISUAL_SCREENS?.split(",");
  const selectedVariants = process.env.VISUAL_FIRST_VARIANT === "1" ? variants.slice(0, 1) : undefined;
  capture({ output, selectedScreens, selectedVariants, sourceMode: process.env.VISUAL_SOURCE || "committed", browserName: process.env.VISUAL_BROWSER || "webkit" }).then(result => {
    console.log(JSON.stringify({ output, captured: result.captures.filter(entry => entry.file).length, failed: result.captures.filter(entry => !entry.file).map(entry => ({ id: entry.id, error: entry.error })) }));
    process.exit(result.captures.some(entry => entry.status === "capture-failed") ? 1 : 0);
  }).catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { capture, trackedReader, scenarios };
