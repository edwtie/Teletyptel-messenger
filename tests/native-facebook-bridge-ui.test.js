const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

test("Facebook sign-in traverses Capacitor's injected iOS bridge with a nonce", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const bridge = fs.readFileSync(path.join(__dirname, "../scripts/ios-testflight/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js"), "utf8");
    const client = fs.readFileSync(path.join(__dirname, "../php/public/native-facebook.js"), "utf8");
    await context.addInitScript({ content: `
      window.Capacitor = { DEBUG: false, isLoggingEnabled: false, Plugins: {} };
      window.nativeCalls = [];
      window.webkit = { messageHandlers: { bridge: { postMessage(call) {
        if (call.pluginId !== "TeleTypTelFacebook") return;
        window.nativeCalls.push(call);
        queueMicrotask(() => window.Capacitor.fromNative({
          callbackId: call.callbackId, pluginId: call.pluginId, success: true,
          data: { token: "fixture-jwt" }
        }));
      } } } };
      ${bridge}
      window.Capacitor.Plugins.TeleTypTelFacebook = { signIn(options) {
        return window.Capacitor.nativePromise("TeleTypTelFacebook", "signIn", options);
      } };
    ` });
    const requests = [];
    const nonce = "b".repeat(64);
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      assert.equal(url.hostname, "bridge.test");
      if (url.pathname === "/native-facebook.js") return route.fulfill({ contentType: "text/javascript", body: client });
      if (url.pathname === "/api/auth/facebook/native.php") {
        const input = request.postDataJSON();
        requests.push(input);
        return route.fulfill({ json: input.action === "begin"
          ? { ok: true, challenge: nonce, appId: "123456789" }
          : { ok: true, accountId: "fixture-account", twoFactorRequired: true } });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><title>Facebook bridge fixture</title><script src="/native-facebook.js"></script>' });
    });
    const page = await context.newPage();
    await page.goto("https://bridge.test/");
    const result = await page.evaluate(async () => ({
      platform: window.Capacitor.getPlatform(),
      available: window.Capacitor.isPluginAvailable("TeleTypTelFacebook"),
      account: await window.TeleTypTelNativeFacebook.signIn("/api/auth/facebook/native.php"),
      calls: window.nativeCalls
    }));
    assert.equal(result.platform, "ios");
    assert.equal(result.available, true);
    assert.equal(result.account.twoFactorRequired, true);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].methodName, "signIn");
    assert.equal(result.calls[0].options.appId, "123456789");
    assert.equal(result.calls[0].options.nonce, nonce);
    assert.equal(requests[1].token, "fixture-jwt");
    assert.equal(requests[1].challenge, nonce);
    await context.close();
  } finally {
    await browser.close();
  }
});
