const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../php/public/native-google.js"), "utf8");

function fixture({ available = true, signIn, response } = {}) {
  const requests = [];
  const calls = [];
  const context = { URL, location: new URL("https://server.test/chat.html"),
    Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => available,
      Plugins: { TeleTypTelGoogle: { signIn: async config => {
        calls.push(config);
        return signIn ? signIn() : { serverAuthCode: "fictitious-single-use-code" };
      } } } },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      const payload = requests.length === 1
        ? { ok: true, challenge: "session-challenge", serverClientId: "public-server-id" }
        : { ok: true, accountId: "fixture-account" };
      return response ? response(requests.length, payload) : { ok: true, json: async () => payload };
    }
  };
  vm.runInNewContext(source, context);
  return { api: context.TeleTypTelNativeGoogle, requests, calls, context };
}

test("Injected iOS plugin works without the bundled registerPlugin API and uses HTTPS POST", async () => {
  const { api, requests, calls, context } = fixture();
  assert.equal(context.Capacitor.registerPlugin, undefined);
  assert.equal((await api.signIn("/api/auth/google/native.php")).accountId, "fixture-account");
  assert.equal(calls[0].serverClientId, "public-server-id");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.challenge, "session-challenge");
  assert.equal(requests[1].body.code, "fictitious-single-use-code");
  for (const { url, options } of requests) {
    assert.equal(url, "https://server.test/api/auth/google/native.php");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["X-TeleTypTel-Native"], "google");
  }
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});

test("Missing injected signIn method fails clearly before sending any request", async () => {
  const { api, context, requests } = fixture();
  delete context.Capacitor.Plugins.TeleTypTelGoogle.signIn;
  await assert.rejects(api.signIn("/native"), error => error.code === "UPDATE_REQUIRED");
  assert.equal(requests.length, 0);
});

test("Old app builds fail clearly instead of navigating to the invalid LAN OAuth redirect", async () => {
  const { api, requests } = fixture({ available: false });
  await assert.rejects(api.signIn("/api/auth/google/native.php"), error => error.code === "UPDATE_REQUIRED");
  assert.equal(requests.length, 0);
});

test("Cross-origin and plaintext endpoints are rejected before opening Google", async () => {
  for (const endpoint of ["https://attacker.test/", "http://server.test/"]) {
    const { api, requests, calls } = fixture();
    await assert.rejects(api.signIn(endpoint), /same-origin/);
    assert.equal(requests.length, 0);
    assert.equal(calls.length, 0);
  }
});

test("Cancel, missing code, server rejection and network failure never produce a login", async () => {
  const cancelled = fixture({ signIn: () => { throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" }); } });
  await assert.rejects(cancelled.api.signIn("/native"), error => error.code === "CANCELLED");
  assert.equal(cancelled.requests.length, 1);
  const missing = fixture({ signIn: () => ({}) });
  await assert.rejects(missing.api.signIn("/native"), /sign-in code/);
  assert.equal(missing.requests.length, 1);
  const denied = fixture({ response: async (count, payload) => ({ ok: count === 1,
    json: async () => count === 1 ? payload : { ok: false, error: "account_access_denied" } }) });
  await assert.rejects(denied.api.signIn("/native"), error => error.code === "account_access_denied");
  const offline = fixture({ response: () => { throw new Error("Offline"); } });
  await assert.rejects(offline.api.signIn("/native"), /Offline/);
});

test("2FA is preserved and concurrent taps do not open a second sign-in", async () => {
  const twoFactor = fixture({ response: async (count, payload) => ({ ok: true,
    json: async () => count === 1 ? payload : { ok: true, accountId: "fixture", twoFactorRequired: true } }) });
  assert.equal((await twoFactor.api.signIn("/native")).twoFactorRequired, true);
  const current = fixture();
  const pending = current.api.signIn("/native");
  await assert.rejects(current.api.signIn("/native"), error => error.code === "BUSY");
  await pending;
  assert.equal(current.calls.length, 1);
});
