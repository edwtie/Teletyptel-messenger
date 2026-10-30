const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webkit, devices } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const origin = "https://signin.teletyptel.test";
const markup = fs.readFileSync(path.join(root, "chat.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const client = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
const googleStart = client.indexOf("  async function renderGoogleSdkLoginButton()");
const googleEnd = client.indexOf("  function loadExternalScript(", googleStart);
assert.ok(googleStart >= 0 && googleEnd > googleStart);
const googleFunctions = client.slice(googleStart, googleEnd);

async function check(browser, width, height, theme) {
  const mobile = width <= 720;
  const context = await browser.newContext({ ...(mobile ? devices["iPhone 13"] : {}), viewport: { width, height },
    locale: "nl-NL", colorScheme: theme, serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/chat.html") return route.fulfill({ contentType: "text/html", body: markup });
      if (url.pathname.startsWith("/config/")) return route.fulfill({ contentType: "application/json", body: "{}" });
      if (url.pathname.startsWith("/api/") || url.pathname.endsWith(".php")) return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Test fixture: not signed in"}' });
      const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !/\.(html|css|js|lng|png|ico|svg|webmanifest)$/.test(file) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ path: file });
    });
    await page.goto(origin + "/chat.html");
    await page.evaluate(({ height, theme }) => {
      document.body.className = "account-gate modal-open device-ios";
      document.body.dataset.theme = theme;
      document.documentElement.style.setProperty("--visual-viewport-height", height + "px");
      const dialog = document.getElementById("accountDialog");
      dialog.className = "modal-shell account-start-dialog";
      dialog.hidden = false;
      for (const id of ["dialogSaveAccountButton", "dialogResetPasswordButton", "closeAccountDialogButton", "cancelAccountDialogButton", "accountSecuritySection"]) document.getElementById(id).hidden = true;
    }, { height, theme });
    await page.waitForSelector("body.account-gate #accountDialog.account-start-dialog:not([hidden])");
    await page.locator("#dialogPasswordInput").focus();
    await page.evaluate(async () => {
      const holder = document.getElementById("dialogGoogleLoginButton");
      const frame = document.createElement("iframe");
      frame.style.cssText = "width:44px;height:44px;border:0";
      frame.srcdoc = "<!doctype html><html><body></body></html>";
      const loaded = new Promise(resolve => { frame.onload = resolve; });
      holder.append(frame);
      await loaded;
      holder.closest(".google-sdk-login-wrap").classList.add("sdk-ready");
    });
    assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isVisible(), false, "Reproduce blank SDK replacing the local button");
    for (const platform of ["ios", "android"]) {
      await page.evaluate(async ({ source, platform }) => {
        window.Capacitor = { getPlatform: () => platform };
        const elements = Object.fromEntries(["dialogGoogleLoginButton", "dialogGoogleLoginFallbackButton", "dialogGoogleLoginOverlayButton"].map(id => [id, document.getElementById(id)]));
        const functions = new Function("el", "appendDebug", source + "; return { renderGoogleSdkLoginButton, activateGoogleSdkLoginButton };")(elements, () => {});
        await functions.renderGoogleSdkLoginButton();
        functions.activateGoogleSdkLoginButton();
      }, { source: googleFunctions, platform });
      assert.equal(await page.locator("#dialogGoogleLoginFallbackButton").isVisible(), true, platform + " keeps the Google button visible");
      assert.equal(await page.locator("#dialogGoogleLoginFallbackButton svg").isVisible(), true, "Google logo visible");
      assert.equal(await page.locator("#dialogGoogleLoginButton iframe").count(), 0, "No blank external frame in native app");
      assert.equal(await page.locator("#dialogGoogleLoginOverlayButton").isVisible(), false, "No invisible overlay intercepts the button");
    }
    const result = await page.evaluate(() => {
      const bounds = selector => {
        const rectangle = document.querySelector(selector).getBoundingClientRect();
        return { left: rectangle.left, right: rectangle.right, top: rectangle.top, bottom: rectangle.bottom, width: rectangle.width, height: rectangle.height };
      };
      return {
        width: innerWidth, overflow: document.documentElement.scrollWidth,
        card: bounds("#accountDialog .account-dialog-card"),
        input: bounds("#dialogPasswordInput"), inputFont: parseFloat(getComputedStyle(document.getElementById("dialogPasswordInput")).fontSize),
        connect: bounds("#dialogConnectButton"), create: bounds("#dialogCreateAccountButton"), server: bounds("#dialogServerSettingsButton"),
        bodyOverflow: getComputedStyle(document.querySelector("#accountDialog .modal-body")).overflowY,
        viewport: document.querySelector('meta[name="viewport"]').content
      };
    });
    assert.ok(result.overflow <= width + 1, "No horizontal page overflow");
    assert.ok(result.card.left >= -1 && result.card.right <= width + 1, "Dialog fits screen");
    assert.ok(result.input.left >= 0 && result.input.right <= width + 1, "Input fits screen");
    assert.doesNotMatch(result.viewport, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/, "Accessibility zoom remains available");
    if (mobile) {
      assert.ok(result.inputFont >= 16, "Input text must not trigger iPhone focus zoom");
      assert.ok(result.input.height >= 48 && result.connect.height >= 48, "Touch target sizes");
      assert.ok(Math.abs(result.card.width - width) <= 1, "Full-width mobile login");
      assert.ok(result.connect.bottom <= result.create.top + 1, "Sign in is the primary first action");
      assert.ok(Math.abs(result.create.top - result.server.top) <= 1, "Secondary actions share one row");
      assert.ok(result.server.width <= 49, "Settings is a compact icon button");
      assert.ok(result.server.bottom <= height + 1, "Actions stay within short viewports");
      assert.equal(result.bodyOverflow, "auto", "Form remains scrollable with keyboard");
    } else {
      assert.ok(result.card.width <= 441 && result.card.left > 0, "Desktop keeps its centered dialog");
    }
    const output = path.resolve(__dirname, "../artifacts/ios-layout");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `signin-${width}x${height}-${theme}.png`) });
    console.log(`PASS ${width}x${height} ${theme}`);
  } finally { await context.close(); }
}

(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    for (const [width, height] of [[320, 568], [390, 844], [430, 932], [390, 440], [667, 375], [1280, 800]]) {
      for (const theme of ["light", "dark"]) await check(browser, width, height, theme);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
