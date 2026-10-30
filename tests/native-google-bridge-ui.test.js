const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

test("Google login traverses Capacitor's actual injected iOS JavaScript bridge", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const bridge = fs.readFileSync(path.join(__dirname, "../scripts/ios-testflight/node_modules/@capacitor/ios/Capacitor/Capacitor/assets/native-bridge.js"), "utf8");
    const client = fs.readFileSync(path.join(__dirname, "../php/public/native-google.js"), "utf8");
    await context.addInitScript({ content: `
      window.Capacitor = { DEBUG: false, isLoggingEnabled: false, Plugins: {} };
      window.nativeCalls = [];
      window.webkit = { messageHandlers: { bridge: { postMessage(call) {
        if (call.pluginId !== "TeleTypTelGoogle") return;
        window.nativeCalls.push(call);
        queueMicrotask(() => window.Capacitor.fromNative({
          callbackId: call.callbackId, pluginId: call.pluginId, success: true,
          data: { serverAuthCode: "fixture-code" }
        }));
      } } } };
      ${bridge}
      window.Capacitor.Plugins.TeleTypTelGoogle = { signIn(options) {
        return window.Capacitor.nativePromise("TeleTypTelGoogle", "signIn", options);
      } };
    ` });
    const requests = [];
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      assert.equal(url.hostname, "bridge.test");
      if (url.pathname === "/native-google.js") return route.fulfill({ contentType: "text/javascript", body: client });
      if (url.pathname === "/native") {
        const input = request.postDataJSON();
        requests.push(input);
        return route.fulfill({ json: input.action === "begin"
          ? { ok: true, challenge: "fixture-challenge", serverClientId: "fixture-server-client" }
          : { ok: true, accountId: "fixture-account" } });
      }
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><title>Native bridge fixture</title><script src="/native-google.js"></script>' });
    });
    const page = await context.newPage();
    await page.goto("https://bridge.test/");
    const result = await page.evaluate(async () => ({
      platform: window.Capacitor.getPlatform(),
      registerPlugin: typeof window.Capacitor.registerPlugin,
      available: window.Capacitor.isPluginAvailable("TeleTypTelGoogle"),
      account: await window.TeleTypTelNativeGoogle.signIn("/native"),
      calls: window.nativeCalls
    }));
    assert.equal(result.platform, "ios");
    assert.equal(result.registerPlugin, "undefined");
    assert.equal(result.available, true);
    assert.equal(result.account.accountId, "fixture-account");
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].methodName, "signIn");
    assert.equal(result.calls[0].options.serverClientId, "fixture-server-client");
    assert.equal(requests[1].code, "fixture-code");
    assert.equal(requests[1].challenge, "fixture-challenge");
    await context.close();
  } finally {
    await browser.close();
  }
});
