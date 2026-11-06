const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "php/public/native-call-push.js"), "utf8");
const deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "ab".repeat(32);
const settle = async () => { for (let turn = 0; turn < 12; turn++) await new Promise(resolve => setImmediate(resolve)); };

function fixture({ platform = "ios", enabled = true } = {}) {
  const events = {};
  const native = { enabled, consented: false, accountId: "", pendingAccountId: "", deviceId };
  const requests = [];
  const operations = [];
  let changed;
  let loggedIn = true;
  let serverAccount = "alice";
  let status = 200;
  let confirmed = true;
  let confirms = 0;
  let nextRequest;
  let now = Date.now();
  const timers = new Set();
  const button = { hidden: true, dataset: {}, setAttribute() {}, addEventListener(name, listener) { this[name] = listener; } };
  const output = { hidden: true, textContent: "" };
  const plugin = {
    state: async () => ({ ...native }),
    addListener: async (name, listener) => { changed = listener; return { remove() {} }; },
    register: async ({ accountId }) => {
      operations.push("register");
      if (native.pendingAccountId || (native.accountId && native.accountId !== accountId)) throw new Error("ACCOUNT_MISMATCH");
      Object.assign(native, { accountId, consented: true, token });
      changed?.();
      return { ...native };
    },
    disable: async () => {
      operations.push("disable");
      if (native.accountId) native.pendingAccountId = native.accountId;
      Object.assign(native, { accountId: "", consented: false, token: undefined });
      changed?.();
    },
    revocationConfirmed: async ({ accountId }) => {
      operations.push("revocationConfirmed");
      assert.equal(accountId, native.pendingAccountId);
      native.pendingAccountId = "";
      changed?.();
    }
  };
  const window = {
    Capacitor: { getPlatform: () => platform, Plugins: { TeleTypTelVoipCalls: plugin } },
    document: { hidden: false, addEventListener: (name, callback) => { events[name] = callback; } },
    addEventListener: (name, callback) => { events[name] = callback; },
    confirm: () => { confirms++; return confirmed; },
    setTimeout: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); timers.add(timer); return timer; },
    clearTimeout: timer => { clearTimeout(timer); timers.delete(timer); },
    fetch: async (url, options) => {
      assert.equal(url, "api/call-push.php");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ method: options.method, body });
      if (body) assert.equal(options.headers["X-CSRF-Token"], "a".repeat(64));
      if (nextRequest) { const handler = nextRequest; nextRequest = null; await handler(body); }
      return {
        ok: status === 200, status,
        json: async () => ({ ok: true, accountId: serverAccount, csrfToken: "a".repeat(64),
          deviceId, expiresAt: Math.floor(now / 1000) + 86400, revoked: true })
      };
    }
  };
  vm.runInNewContext(source, { window, AbortController, Date: { now: () => now } });
  const client = window.TeleTypTelCallPush.create({ signedIn: () => loggedIn, settingsButton: button, statusElement: output });
  return {
    client, native, requests, operations, button, output, window,
    change: () => changed?.(),
    server: value => { serverAccount = value; },
    status: value => { status = value; },
    consent: value => { confirmed = value; },
    loggedIn: value => { loggedIn = value; },
    defer: handler => { nextRequest = handler; },
    advance: milliseconds => { now += milliseconds; },
    get confirms() { return confirms; },
    ready: () => client.ready({ accountId: "alice" }),
    posts: () => requests.filter(request => request.method === "POST"),
    close: () => { for (const timer of timers) clearTimeout(timer); }
  };
}

test("Browser and default non-preview builds do not register or ask permission", async () => {
  for (const options of [{ platform: "web" }, { enabled: false }]) {
    const setup = fixture(options);
    try {
      await setup.ready();
      await setup.client.logout();
      assert.equal(setup.requests.length, 0);
      assert.equal(setup.confirms, 0);
      assert.equal(setup.button.hidden, true);
      assert.equal(setup.output.hidden, true);
    } finally { setup.close(); }
  }
});

test("Preview offers explicit consent only from settings, never on login", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    assert.equal(setup.button.hidden, false);
    assert.equal(setup.requests.length, 0);
    assert.equal(setup.confirms, 0);
    setup.consent(false);
    await setup.client.enable();
    assert.equal(setup.confirms, 1);
    assert.equal(setup.posts().length, 0);
    assert.equal(setup.native.consented, false);
  } finally { setup.close(); }
});

test("Disabled server or wrong authenticated account cannot request native registration", async () => {
  for (const fault of ["disabled", "account"]) {
    const setup = fixture();
    try {
      await setup.ready();
      if (fault === "disabled") setup.status(404); else setup.server("bob");
      await assert.rejects(setup.client.enable());
      assert.equal(setup.confirms, 0);
      assert.equal(setup.operations.includes("register"), false);
    } finally { setup.close(); }
  }
});

test("Consent registers current account/token, repeated events do not rotate generations", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    assert.deepEqual(setup.posts().map(request => request.body), [{ action: "register", consent: true, deviceId, token }]);
    assert.equal(setup.native.accountId, "alice");
    for (let count = 0; count < 10; count++) setup.change();
    await settle();
    await setup.ready();
    assert.equal(setup.posts().length, 1);
    assert.match(setup.output.textContent, /end-to-end test/);
  } finally { setup.close(); }
});

test("Token rotation and lease renewal submit new registration without new consent", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.native.token = "cd".repeat(32);
    setup.change();
    await settle();
    assert.equal(setup.posts().length, 2);
    assert.equal(setup.posts()[1].body.token, setup.native.token);
    setup.advance(13 * 3600000);
    await setup.client.refresh();
    assert.equal(setup.posts().length, 3);
    assert.equal(setup.confirms, 1);
  } finally { setup.close(); }
});

test("Token invalidation removes this installation from the server", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    delete setup.native.token;
    setup.change();
    await settle();
    assert.equal(setup.posts().at(-1).body.action, "revoke-device");
    assert.equal(setup.native.consented, true);
    assert.match(setup.output.textContent, /Waiting/);
  } finally { setup.close(); }
});

test("Token arrival during a pending refresh is not lost", async () => {
  const setup = fixture();
  try {
    Object.assign(setup.native, { consented: true, accountId: "alice" });
    setup.defer(async () => { setup.native.token = token; setup.change(); });
    await setup.ready();
    await settle();
    assert.deepEqual(setup.posts().map(request => request.body.action), ["revoke-device", "register"]);
  } finally { setup.close(); }
});

test("Logout disables native reception and revokes server registration before returning", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.loggedIn(false);
    await setup.client.logout();
    await settle();
    assert.equal(setup.native.consented, false);
    assert.equal(setup.native.pendingAccountId, "");
    assert.equal(setup.posts().at(-1).body.action, "revoke-device");
    setup.change();
    await settle();
    assert.equal(setup.posts().filter(request => request.body.action === "register").length, 1);
  } finally { setup.close(); }
});

test("Logout before XMPP login still clears a persisted native registration", async () => {
  const setup = fixture();
  try {
    Object.assign(setup.native, { consented: true, accountId: "alice", token });
    await setup.client.logout();
    assert.equal(setup.native.pendingAccountId, "");
    assert.equal(setup.posts().at(-1).body.action, "revoke-device");
  } finally { setup.close(); }
});

test("Offline revocation remains pending; next same-account login retries without re-enabling", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.status(503);
    await assert.rejects(setup.client.logout());
    assert.equal(setup.native.consented, false);
    assert.equal(setup.native.pendingAccountId, "alice");
    setup.status(200);
    await setup.ready();
    await settle();
    assert.equal(setup.native.pendingAccountId, "");
    assert.equal(setup.native.consented, false);
    assert.equal(setup.confirms, 1);
  } finally { setup.close(); }
});

test("Different account cannot inherit consent or acknowledge another account's revocation", async () => {
  const setup = fixture();
  try {
    Object.assign(setup.native, { consented: true, accountId: "bob", token });
    await setup.ready();
    await settle();
    assert.equal(setup.native.consented, false);
    assert.equal(setup.native.pendingAccountId, "bob");
    assert.match(setup.output.textContent, /previous account/);
    assert.equal(setup.requests.length, 0);
    await assert.rejects(setup.client.enable(), /PREVIOUS_ACCOUNT/);
    assert.equal(setup.operations.includes("revocationConfirmed"), false);
  } finally { setup.close(); }
});

test("Registration completing after logout is revoked, never retained", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    let finish;
    let started;
    const pending = new Promise(resolve => { started = resolve; });
    const fetch = setup.window.fetch;
    setup.window.fetch = async (url, options) => {
      if (options.body && JSON.parse(options.body).action === "register") {
        started();
        await new Promise(resolve => { finish = resolve; });
      }
      return fetch(url, options);
    };
    setup.native.token = "ef".repeat(32);
    const refresh = setup.client.refresh();
    await pending;
    const logout = setup.client.logout();
    finish();
    await Promise.all([refresh, logout]);
    await settle();
    assert.equal(setup.posts().at(-1).body.action, "revoke-device");
    assert.equal(setup.native.pendingAccountId, "");
    assert.equal(setup.native.consented, false);
  } finally { setup.close(); }
});

test("Client is bundled, cached and wired to XMPP login, biometric recovery and logout", () => {
  for (const file of ["php/public/chat.html", "php/public/service-worker.js", "scripts/ios-testflight/bundle-frontend.js"]) {
    assert.ok(fs.readFileSync(path.join(root, file), "utf8").includes("native-call-push.js"), file);
  }
  const chat = fs.readFileSync(path.join(root, "php/public/chat-client.js"), "utf8");
  assert.match(chat, /if \(valid === true\) void callPush\?\.ready\(state.account\)/);
  assert.match(chat, /TeleTypTelFaceID\?\.ready\(state.account\)[\s\S]{0,100}callPush\?\.ready\(state.account\)/);
  const logout = chat.slice(chat.indexOf("async function logoutAccount("), chat.indexOf("async function sendLogoutAccountSession("));
  assert.ok(logout.indexOf("callPush?.logout()") < logout.indexOf("TeleTypTelFaceID.revoke()"));
  assert.ok(logout.indexOf("callPush?.logout()") < logout.indexOf("sendLogoutAccountSession()"));
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|appendDebug/);
});
