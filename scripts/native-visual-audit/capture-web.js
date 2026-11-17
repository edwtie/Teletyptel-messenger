"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { screens, variants, caseID } = require("./catalogue");

const root = path.resolve(__dirname, "../..");
const origin = "https://teletyptel-visual.example.invalid";
const epoch = "2026-11-17T11:00:00.000Z";
const scenarios = {
  login: async page => page.evaluate(() => nativeVisualFixture.login()),
  "login-settings": async page => { await page.evaluate(() => nativeVisualFixture.login()); await page.locator("#dialogServerSettingsButton").click(); },
  contacts: async page => page.evaluate(() => nativeVisualFixture.contacts()),
  "main-menu": async page => {
    if (await page.locator("#mobileActionsToggle").isVisible()) { await page.locator("#mobileActionsToggle").click(); return "popover"; }
    return "persistent-web-toolbar";
  },
  chat: async () => {},
  "conversation-menu": async page => {
    if (await page.locator("#chatMoreToggle").isVisible()) { await page.locator("#chatMoreToggle").click(); return "popover"; }
    return "persistent-web-actions";
  },
  "message-menu": async page => page.evaluate(() => nativeVisualFixture.messageMenu()),
  smileys: async page => page.locator("#emojiButton").click(),
  attachments: async page => page.locator("#attachmentMenuButton").click(),
  account: async page => page.evaluate(() => nativeVisualFixture.settings()),
  appearance: async page => page.evaluate(() => nativeVisualFixture.settingsPanel("preferences")),
  translation: async page => page.evaluate(() => nativeVisualFixture.settingsPanel("privacy")),
  "account-security": async page => page.evaluate(() => nativeVisualFixture.settingsPanel("security")),
  "profile-edit": async page => page.evaluate(() => nativeVisualFixture.profile()),
  "contact-profile": async page => page.evaluate(() => nativeVisualFixture.contactProfile()),
  "group-chat": async page => page.evaluate(() => nativeVisualFixture.group()),
  "group-management": async page => { await page.evaluate(() => nativeVisualFixture.group()); await page.evaluate(() => nativeVisualFixture.groupManagement()); },
  dialer: async page => { await page.locator("#phoneDialerButton").evaluate(element => element.click()); },
  "dialer-contacts": async page => { await page.locator("#phoneDialerButton").evaluate(element => element.click()); await page.locator("#phoneDialerContactsView").click(); },
  history: async page => page.locator("#historyButton").evaluate(element => element.click()),
  archive: async page => page.locator("#archiveButton").evaluate(element => element.click()),
  audio: async page => page.evaluate(() => nativeVisualFixture.call("audio")),
  video: async page => page.evaluate(() => nativeVisualFixture.call("video")),
  tc: async page => page.evaluate(() => nativeVisualFixture.call("total")),
  "call-controls": async page => { await page.evaluate(() => nativeVisualFixture.call("total")); await page.locator("#callControlsToggle").click(); },
  "call-keypad": async page => { await page.evaluate(() => nativeVisualFixture.call("total")); await page.locator("#callKeypadButton").evaluate(element => element.click()); },
  "incoming-call": async page => page.evaluate(() => nativeVisualFixture.call("total", true))
};

function trackedReader(revision) {
  const files = new Map();
  const known = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", revision, "php/public"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/));
  return {
    read(file) {
      if (!known.has(file)) return null;
      if (!files.has(file)) files.set(file, execFileSync("git", ["show", revision + ":" + file], { cwd: root, maxBuffer: 24 * 1024 * 1024 }));
      return files.get(file);
    },
    manifest() { return [...files].map(([file, bytes]) => ({ file, sha256: crypto.createHash("sha256").update(bytes).digest("hex") })); }
  };
}

function mime(file) {
  return ({ ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".json": "application/json", ".lng": "text/plain" })[path.extname(file)] || "application/octet-stream";
}

async function capture({ output, revision = "HEAD", browserName = "webkit", selectedScreens = Object.keys(scenarios), selectedVariants = variants } = {}) {
  if (!output || fs.existsSync(output)) throw new Error("Choose a new output directory; existing evidence is never overwritten");
  if (!selectedScreens.length || selectedScreens.some(screen => !Object.hasOwn(scenarios, screen)) || new Set(selectedScreens).size !== selectedScreens.length || !selectedVariants.length) throw new Error("Select explicit known visual scenarios and viewports");
  const playwright = require("playwright");
  if (!["webkit", "chromium"].includes(browserName)) throw new Error("Unsupported renderer");
  const source = trackedReader(revision);
  const sha = execFileSync("git", ["rev-parse", revision], { cwd: root, encoding: "utf8" }).trim();
  const bootstrap = fs.readFileSync(path.join(root, "scripts/ios-simulator/fixture-bootstrap.js"), "utf8");
  const hook = fs.readFileSync(path.join(__dirname, "web-hook.js"), "utf8");
  fs.mkdirSync(output, { recursive: true });
  const hash = content => crypto.createHash("sha256").update(content).digest("hex");
  const result = { revision: sha, source: "committed actual chat.html/CSS/JS, API and XMPP mocked; no replacement UI", renderer: browserName, epoch, locale: "nl-NL", timezone: "Europe/Amsterdam", fixtureSources: { hook: hash(hook), bootstrap: hash(bootstrap) }, captures: [], blocked: [], caveat: "Desktop WebKit/Chromium at CSS viewport size, not physical iOS Safari. This alone is not a native pixel-equality result." };
  const browser = await playwright[browserName].launch({ headless: true });
  console.log("Visual renderer ready: " + browserName);
  try {
    for (const variant of selectedVariants) {
      for (const screen of screens.filter(entry => selectedScreens.includes(entry.id))) {
        const identifier = caseID(screen.id, variant);
        console.log("Opening " + identifier);
        const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, deviceScaleFactor: variant.scale, locale: "nl-NL", timezoneId: "Europe/Amsterdam", colorScheme: variant.theme, reducedMotion: "reduce", serviceWorkers: "block" });
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
          await page.evaluate(theme => nativeVisualFixture.setup(theme), variant.theme);
          console.log("Fixture ready " + identifier);
          const presentation = await scenarios[screen.id](page);
          await page.waitForTimeout(80);
          await page.evaluate(() => { document.activeElement?.blur(); });
          await page.waitForTimeout(180);
          await page.evaluate(async () => { await document.fonts.ready; await Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 1000))]); });
          if (errors.length) throw new Error(errors.join("; "));
          if (screen.id !== "login" && await page.locator("dialog.xmpp-availability[open]").count()) throw new Error("Startup overlay still covers the requested screen");
          const geometry = await page.evaluate(() => nativeVisualFixture.captureGeometry());
          const file = identifier + ".png";
          await page.screenshot({ path: path.join(output, file), animations: "disabled", caret: "hide" });
          const visibleImages = await page.evaluate(() => [...document.images].filter(image => image.getClientRects().length && image.getAttribute("src")).map(image => ({ source: image.getAttribute("src"), complete: image.complete && image.naturalWidth > 0 })));
          if (visibleImages.some(image => !image.complete)) throw new Error("Visible image did not decode");
          result.captures.push({ id: identifier, screen: screen.id, ...variant, file, geometry, visibleImages, presentation: presentation || "default", errors, status: "web-captured-only" });
          console.log("Captured " + identifier);
        } catch (error) {
          await page.screenshot({ path: path.join(output, identifier + "-failed.png"), animations: "disabled" }).catch(() => {});
          result.captures.push({ id: identifier, screen: screen.id, ...variant, status: "capture-failed", error: error.message, errors });
        } finally { await context.close(); }
      }
    }
  } finally {
    await browser.close();
    result.blocked = [...new Set(result.blocked)];
    result.files = source.manifest();
    fs.writeFileSync(path.join(output, "web-manifest.json"), JSON.stringify(result, null, 2));
  }
  return result;
}

if (require.main === module) {
  const output = path.resolve(process.argv[2] || path.join(root, "artifacts/native-visual-web-" + Date.now()));
  const selectedScreens = process.env.VISUAL_SCREENS?.split(",");
  const selectedVariants = process.env.VISUAL_FIRST_VARIANT === "1" ? variants.slice(0, 1) : undefined;
  capture({ output, selectedScreens, selectedVariants, browserName: process.env.VISUAL_BROWSER || "webkit" }).then(result => {
    console.log(JSON.stringify({ output, captured: result.captures.filter(entry => entry.file).length, failed: result.captures.filter(entry => !entry.file).map(entry => ({ id: entry.id, error: entry.error })) }));
    if (result.captures.some(entry => !entry.file)) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { capture, trackedReader, scenarios };
