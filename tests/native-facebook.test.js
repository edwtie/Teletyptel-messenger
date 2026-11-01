const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../php/public/native-facebook.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const endpoint = "/api/auth/facebook/native.php";
const nonce = "a".repeat(64);

function fixture({ available = true, signIn, response, bundled = false } = {}) {
  const requests = [], calls = [];
  const context = {
    URL, location: new URL(bundled ? "capacitor://localhost/chat.html" : "https://server.test/chat.html"),
    TeleTypTelApp: bundled,
    Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => available,
      Plugins: { TeleTypTelFacebook: { signIn: async options => {
        calls.push(options);
        return signIn ? signIn() : { token: "fictitious-oidc-token" };
      } } } },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      const payload = JSON.parse(options.body).action === "begin"
        ? { ok: true, challenge: nonce, appId: "123456789" }
        : { ok: true, accountId: "fixture-account" };
      return response ? response(requests.length, payload) : { ok: true, json: async () => payload };
    }
  };
  vm.runInNewContext(source, context);
  return { api: context.TeleTypTelNativeFacebook, requests, calls, context };
}

test("Facebook sends one-time nonce to SDK and returns JWT only by secure POST", async () => {
  for (const bundled of [false, true]) {
    const { api, requests, calls } = fixture({ bundled });
    assert.equal((await api.signIn(endpoint)).accountId, "fixture-account");
    assert.equal(calls[0].nonce, nonce);
    assert.equal(calls[0].appId, "123456789");
    assert.equal(requests[1].body.challenge, nonce);
    assert.equal(requests[1].body.token, "fictitious-oidc-token");
    for (const { options, url } of requests) {
      assert.equal(new URL(url).pathname, endpoint);
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers["X-TeleTypTel-Native"], "facebook");
    }
  }
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});

test("Facebook rejects unsafe endpoint, old build and unsupported platform before request", async () => {
  for (const bundled of [true, false]) {
    for (const target of ["http://server.test" + endpoint, "https://evil.test" + endpoint,
      "capacitor://evil" + endpoint, "capacitor://user@localhost" + endpoint,
      "capacitor://localhost:123" + endpoint, endpoint + "?token=x", endpoint + "#fragment", "/api/account.php"]) {
      const current = fixture({ bundled });
      await assert.rejects(current.api.signIn(target), /same-origin/);
      assert.equal(current.requests.length, 0);
    }
  }
  const old = fixture({ available: false });
  await assert.rejects(old.api.signIn(endpoint), error => error.code === "UPDATE_REQUIRED");
  assert.equal(old.requests.length, 0);
  const android = fixture();
  android.context.Capacitor.getPlatform = () => "android";
  await assert.rejects(android.api.signIn(endpoint), error => error.code === "UPDATE_REQUIRED");
  assert.equal(android.requests.length, 0);
});

test("Cancelled and failed Facebook sign-in never completes a login; retry remains possible", async () => {
  const cancelled = fixture({ signIn: () => { throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" }); } });
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(cancelled.api.signIn(endpoint), error => error.code === "CANCELLED");
  }
  assert.equal(cancelled.requests.length, 2);
  for (const token of [undefined, "", "x".repeat(16385)]) {
    const missing = fixture({ signIn: () => ({ token }) });
    await assert.rejects(missing.api.signIn(endpoint), /authentication token/);
    assert.equal(missing.requests.length, 1);
  }
  const denied = fixture({ response: async (count, payload) => ({ ok: count === 1,
    json: async () => count === 1 ? payload : { ok: false, error: "account_access_denied" } }) });
  await assert.rejects(denied.api.signIn(endpoint), error => error.code === "account_access_denied");
  const offline = fixture({ response: () => { throw new Error("Offline"); } });
  await assert.rejects(offline.api.signIn(endpoint), /Offline/);
});

test("Invalid configuration never opens the SDK", async () => {
  for (const override of [{ challenge: "short" }, { appId: "" }, { appId: 123 }]) {
    const current = fixture({ response: async (count, payload) => ({ ok: true, json: async () => ({ ...payload, ...override }) }) });
    await assert.rejects(current.api.signIn(endpoint), error => error.code === "CONFIGURATION");
    assert.equal(current.calls.length, 0);
  }
});

test("Facebook preserves 2FA and prevents concurrent sign-in", async () => {
  const current = fixture({ response: async (count, payload) => ({ ok: true,
    json: async () => ({ ...payload, twoFactorRequired: count > 1 }) }) });
  const pending = current.api.signIn(endpoint);
  await assert.rejects(current.api.signIn(endpoint), error => error.code === "BUSY");
  assert.equal((await pending).twoFactorRequired, true);
  assert.equal(current.calls.length, 1);
});

function dialogFixture(provider, result, error) {
  const calls = [], locations = [], challenges = [], busy = [];
  const context = { URL, state: {}, el: { dialogAccountStatus: {} },
    location: { href: "capacitor://localhost/chat.html?old=value#old", assign: value => locations.push(value) },
    providerDisplayName: name => name === "facebook" ? "Facebook" : "Google", t: (key, fallback) => fallback,
    setAccountDialogBusy: value => busy.push(value), authApiUrl: value => "/api/auth/" + value,
    accountApiErrorText: () => "Account blocked", showLoginTwoFactorChallenge: value => challenges.push(value),
    updateAccountStatus: () => {}, Capacitor: { getPlatform: () => "ios" }, checkXmppServerAvailable: async () => true
  };
  context.window = context;
  const adapter = { signIn: async value => { calls.push(value); if (error) throw error; return result; } };
  context[provider === "facebook" ? "TeleTypTelNativeFacebook" : "TeleTypTelNativeGoogle"] = adapter;
  vm.runInNewContext(client.slice(client.indexOf("  function startGoogleLoginFromDialog()"),
    client.indexOf("  function startGoogleLinkFromDialog()")), context);
  return { context, calls, locations, challenges, busy };
}

test("Both native providers retain login/2FA handling and never navigate to web OAuth", async () => {
  for (const provider of ["google", "facebook"]) {
    const current = dialogFixture(provider, { accountId: "fixture-account" });
    await current.context.startNativeProviderLoginFromDialog(provider);
    assert.deepEqual(current.calls, ["/api/auth/" + provider + "/native.php"]);
    const target = new URL(current.locations[0]);
    assert.equal(target.protocol, "capacitor:");
    assert.equal(target.search, "?oauth=1&accountId=fixture-account");
    assert.deepEqual(current.busy, [true, false]);
    const twoFactor = dialogFixture(provider, { accountId: "fixture-account", twoFactorRequired: true });
    await twoFactor.context.startNativeProviderLoginFromDialog(provider);
    assert.equal(twoFactor.challenges.length, 1);
    assert.equal(twoFactor.locations.length, 0);
    const cancelled = dialogFixture(provider, null, { code: "CANCELLED" });
    await cancelled.context.startNativeProviderLoginFromDialog(provider);
    assert.match(cancelled.context.el.dialogAccountStatus.textContent, /cancelled/);
    assert.equal(cancelled.locations.length, 0);
  }
});

test("Facebook button routes to native provider; website still uses the web flow", async () => {
  const native = dialogFixture("facebook", {});
  const providers = [];
  native.context.startNativeProviderLoginFromDialog = provider => providers.push(provider);
  await native.context.startFacebookLoginFromDialog();
  assert.deepEqual(providers, ["facebook"]);
  assert.equal(native.locations.length, 0);
  native.context.Capacitor.getPlatform = () => "web";
  native.context.location.href = "https://server.test/chat.html";
  await native.context.startFacebookLoginFromDialog();
  assert.equal(native.locations[0], "https://server.test/api/auth/facebook/start");
});

test("Unavailable XMPP blocks both native and website provider login without losing account state", async () => {
  for (const provider of ["google", "facebook"]) {
    const app = dialogFixture(provider, {});
    app.context.checkXmppServerAvailable = async () => false;
    app.context.state.account = { accountId: "retained-account" };
    await app.context.startProviderLoginFromDialog(provider);
    app.context.Capacitor.getPlatform = () => "web";
    await app.context.startProviderLoginFromDialog(provider);
    assert.equal(app.calls.length, 0);
    assert.equal(app.locations.length, 0);
    assert.equal(app.context.state.account.accountId, "retained-account");
  }
});
