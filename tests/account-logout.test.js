const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const source = client.slice(client.indexOf("  async function logoutAccount("), client.indexOf("  function handleAccountIdentityChanged("));

function fixture(fetch) {
  const calls = [], busy = [], disconnects = [];
  const status = { textContent: "", appendChild(button) { this.retry = button; } };
  const context = {
    state: { sessionIdleTimerId: null, account: { password: "fixture", loginToken: "fixture", rememberPassword: true, savedInSession: true } },
    el: { passwordInput: { value: "fixture" }, dialogPasswordInput: { value: "fixture" },
      rememberPasswordToggle: { checked: true }, dialogRememberPasswordToggle: { checked: true }, dialogAccountStatus: status },
    clearTimeout, accountApiPath: "api/account.php", navigator: { sendBeacon() { throw new Error("Beacon must not be used for logout"); } },
    document: { createElement: () => ({ addEventListener(name, callback) { this[name] = callback; } }) },
    clearAccountSessionForCurrentProfile() { calls.push("clear-local"); },
    setAccountReady(value) { calls.push(["ready", value]); }, appendDebug() {},
    disconnectAll(message, options) { disconnects.push({ message, options }); },
    setAccountDialogBusy(value, text) { busy.push(value); if (text) status.textContent = text; },
    t: (key, fallback) => fallback,
    fetch: (...args) => { calls.push(args); return fetch(...args); }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, calls, busy, disconnects, status };
}

test("Logout closes the UI immediately but waits for the actual server response", async () => {
  let complete;
  const { context, calls, busy, disconnects, status } = fixture(() => new Promise(resolve => { complete = resolve; }));
  const pending = context.logoutAccount();
  assert.equal(context.state.logoutInProgress, true);
  assert.equal(context.state.account.password, "");
  assert.equal(context.state.account.loginToken, "");
  assert.equal(disconnects[0].options.forceLogin, true);
  assert.deepEqual(busy, [true]);
  await context.logoutAccount();
  const requests = calls.filter(call => Array.isArray(call) && call[0] === "api/account.php");
  assert.equal(requests.length, 1);
  assert.equal(JSON.parse(requests[0][1].body).action, "logout");
  assert.equal(requests[0][1].credentials, "same-origin");
  assert.equal(requests[0][1].redirect, "error");
  complete({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await pending;
  assert.equal(context.state.logoutInProgress, false);
  assert.deepEqual(busy, [true, false]);
  assert.match(status.textContent, /^Signed out/);
});

test("Failed or rejected logout is not reported as successful and offers an actionable retry", async () => {
  for (const response of [new Error("Offline"), { ok: false, status: 403, json: async () => ({ ok: false }) },
    { ok: true, status: 200, json: async () => ({ ok: false }) }]) {
    let attempts = 0;
    const { context, status, busy } = fixture(async () => {
      if (++attempts > 1) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      if (response instanceof Error) throw response;
      return response;
    });
    await context.logoutAccount();
    assert.match(status.textContent, /could not be confirmed/);
    assert.equal(status.retry.type, "button");
    assert.equal(context.state.logoutInProgress, false);
    await status.retry.click();
    assert.equal(attempts, 2);
    assert.match(status.textContent, /^Signed out/);
    assert.deepEqual(busy, [true, false, true, false]);
  }
});
