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
  let callStates = [];
  let devices = [{ device_id: deviceId }];
  let controlToken;
  const timers = new Set();
  const button = { hidden: true, dataset: {}, setAttribute() {}, addEventListener(name, listener) { this[name] = listener; } };
  const output = { hidden: true, textContent: "" };
  const plugin = {
    state: async () => ({ ...native }),
    end: async ({ callId, sid }) => {
      operations.push("end:" + callId);
      const call = native.calls?.find(call => call.callId === callId && call.sid === sid);
      assert.ok(call);
      native.calls = native.calls.filter(item => item !== call);
      native.ended = [...(native.ended || []), { callId, sid, eventId: "event-" + callId }];
      changed?.();
    },
    acknowledge: async ({ eventId }) => {
      operations.push("acknowledge:" + eventId);
      native.ended = (native.ended || []).filter(event => event.eventId !== eventId);
      changed?.();
    },
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
    setTimeout: (callback, delay) => { const timer = setTimeout(callback, delay); timer.unref(); timer.testDelay = delay; timers.add(timer); return timer; },
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
      if (body?.action === "register" && status === 200) devices = [{ device_id: deviceId }];
      return {
        ok: status === 200, status,
        json: async () => ({ ok: true, accountId: serverAccount, csrfToken: "a".repeat(64),
          deviceId, expiresAt: Math.floor(now / 1000) + 86400, revoked: true, calls: callStates, devices, controlToken })
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
    callStates: value => { callStates = value; },
    devices: value => { devices = value; },
    nativeControl: (value, configure) => { controlToken = value; plugin.configureControl = configure; },
    timerDelays: () => [...timers].map(timer => timer.testDelay),
    get confirms() { return confirms; },
    ready: () => client.ready({ accountId: "alice" }),
    posts: () => requests.filter(request => request.method === "POST"),
    close: () => { for (const timer of timers) clearTimeout(timer); }
  };
}

test("Native call capability is handed only to the opted-in account's native secure store", async () => {
  const setup = fixture();
  const credential = "ab".repeat(100) + "." + "c".repeat(64);
  const configured = [];
  setup.nativeControl(credential, async options => configured.push(options));
  try {
    await setup.ready();
    assert.equal(configured.length, 0);
    await setup.client.enable();
    await settle();
    assert.equal(configured.length, 1);
    assert.equal(configured[0].accountId, "alice");
    assert.equal(configured[0].deviceId, deviceId);
    assert.equal(configured[0].token, credential);
    assert.ok(!setup.output.textContent.includes(credential));
  } finally { setup.close(); }
});

test("Missing call-control capability cannot be reported as native registration success", async () => {
  const setup = fixture();
  let configured = false;
  setup.nativeControl(undefined, async () => { configured = true; });
  try {
    await setup.ready();
    await assert.rejects(setup.client.enable(), /NATIVE_CONTROL_UNAVAILABLE/);
    assert.equal(configured, false);
    assert.ok(!setup.output.textContent.includes("Device registered for testing"));
  } finally { setup.close(); }
});

test("Logout while installing a native capability disables it and revokes the device", async () => {
  const setup = fixture();
  let release;
  let started;
  const configured = new Promise(resolve => { started = resolve; });
  setup.nativeControl("ab".repeat(100) + "." + "c".repeat(64), () => new Promise(resolve => { release = resolve; started(); }));
  try {
    await setup.ready();
    const enabling = setup.client.enable();
    await configured;
    const logout = setup.client.logout();
    release();
    await enabling;
    await logout;
    assert.equal(setup.native.consented, false);
    assert.ok(setup.posts().some(request => request.body.action === "revoke-device"));
  } finally { setup.close(); }
});

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

const invitation = {
  callId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", sid: "verified-sid", phase: "ringing"
};

test("Canceled, expired and other-device calls close only the matching native invitation", async () => {
  for (const state of ["ended", "expired", "unavailable", "answered-elsewhere"]) {
    const setup = fixture();
    try {
      await setup.ready();
      await setup.client.enable();
      await settle();
      setup.native.calls = [{ ...invitation }];
      setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state }]);
      await setup.client.refresh();
      await settle();
      assert.ok(setup.operations.includes("end:" + invitation.callId));
      assert.ok(setup.operations.includes("acknowledge:event-" + invitation.callId));
      assert.equal(setup.native.calls.length, 0);
      assert.equal(setup.native.ended.length, 0);
      assert.equal(setup.posts().filter(item => item.body.action === "register").length, 1);
    } finally { setup.close(); }
  }
});

test("Live invitations neither auto-answer nor rotate their device registration", async () => {
  for (const state of ["ringing", "accepted"]) {
    const setup = fixture();
    try {
      await setup.ready();
      await setup.client.enable();
      await settle();
      setup.advance(13 * 3600000);
      setup.native.calls = [{ ...invitation, phase: "answerRequested" }];
      setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state }]);
      await setup.client.refresh();
      await settle();
      assert.equal(setup.native.calls.length, 1);
      assert.equal(setup.operations.some(operation => operation.startsWith("end:")), false);
      assert.equal(setup.posts().filter(item => item.body.action === "register").length, 1);
      assert.doesNotMatch(source, /bridge\.(mediaConnected|answer)\(/);
    } finally { setup.close(); }
  }
});

test("Offline native declines stay pending until authenticated confirmation", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.native.ended = [{ ...invitation, eventId: "decline-one" }];
    setup.status(503);
    await setup.client.refresh();
    assert.equal(setup.native.ended.length, 1);
    assert.equal(setup.operations.includes("acknowledge:decline-one"), false);
    setup.status(200);
    setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state: "ended" }]);
    await setup.client.refresh();
    await settle();
    assert.ok(setup.operations.includes("acknowledge:decline-one"));
    assert.equal(setup.native.ended.length, 0);
    const sent = setup.posts().find(item => item.body.action === "reconcile");
    assert.deepEqual(sent.body.calls, [{ callId: invitation.callId, sid: invitation.sid, end: true }]);
  } finally { setup.close(); }
});

test("Malformed, wrong-SID and wrong-account replies never mutate native calls", async () => {
  for (const fault of ["sid", "duplicate", "missing", "account"]) {
    const setup = fixture();
    try {
      await setup.ready();
      await setup.client.enable();
      await settle();
      setup.native.calls = [{ ...invitation }];
      const reply = { callId: invitation.callId, sid: invitation.sid, state: "ended" };
      if (fault === "sid") reply.sid = "another-call";
      setup.callStates(fault === "missing" ? [] : fault === "duplicate" ? [reply, reply] : [reply]);
      if (fault === "account") setup.server("bob");
      await setup.client.refresh();
      assert.equal(setup.native.calls.length, 1);
      assert.equal(setup.operations.some(operation => operation.startsWith("end:")), false);
    } finally { setup.close(); }
  }
});

test("A completed media connection is not expired by the invitation deadline", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.native.calls = [{ ...invitation, phase: "connected" }];
    setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state: "expired" }]);
    await setup.client.refresh();
    assert.equal(setup.posts().filter(item => item.body.action === "reconcile").length, 0);
    assert.equal(setup.native.calls.length, 1);
  } finally { setup.close(); }
});

test("An incoming call during renewal preflight postpones generation rotation", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.advance(13 * 3600000);
    setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state: "ringing" }]);
    setup.defer(async () => { setup.native.calls = [{ ...invitation }]; });
    await setup.client.refresh();
    await settle();
    assert.equal(setup.posts().filter(item => item.body.action === "register").length, 1);
    assert.equal(setup.native.calls.length, 1);
    assert.ok(setup.posts().some(item => item.body.action === "reconcile"));
  } finally { setup.close(); }
});

test("A nonterminal response cannot acknowledge a native decline", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.native.ended = [{ ...invitation, eventId: "pending-decline" }];
    setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state: "ringing" }]);
    await setup.client.refresh();
    assert.equal(setup.native.ended.length, 1);
    assert.equal(setup.operations.includes("acknowledge:pending-decline"), false);
  } finally { setup.close(); }
});

test("Recovery restores a missing current-session registration instead of retrying 403 forever", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.devices([]);
    setup.native.calls = [{ ...invitation }];
    setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state: "ringing" }]);
    await setup.client.refresh();
    await settle();
    assert.deepEqual(setup.posts().map(item => item.body.action), ["register", "register", "reconcile"]);
    assert.equal(setup.native.calls.length, 1);
    assert.equal(setup.confirms, 1);
  } finally { setup.close(); }
});

test("Reconciliation backs off on failure and never schedules a hidden-page keepalive", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.native.ended = [{ ...invitation, eventId: "pending-offline" }];
    setup.status(503);
    for (const delay of [4000, 8000, 16000, 30000, 30000]) {
      await setup.client.refresh();
      assert.ok(setup.timerDelays().includes(delay));
    }
    setup.window.document.hidden = true;
    await setup.client.refresh();
    assert.equal(setup.timerDelays().some(delay => delay <= 30000), false);
    setup.window.document.hidden = false;
    setup.window.navigator = { onLine: false };
    await setup.client.refresh();
    assert.equal(setup.timerDelays().some(delay => delay <= 30000), false);
  } finally { setup.close(); }
});

test("Logout invalidates an in-flight recovery response before native mutation", async () => {
  const setup = fixture();
  try {
    await setup.ready();
    await setup.client.enable();
    await settle();
    setup.native.calls = [{ ...invitation }];
    setup.callStates([{ callId: invitation.callId, sid: invitation.sid, state: "ended" }]);
    let release;
    let started;
    const pending = new Promise(resolve => { started = resolve; });
    const fetch = setup.window.fetch;
    setup.window.fetch = async (url, options) => {
      if (options.body && JSON.parse(options.body).action === "reconcile") {
        started();
        await new Promise(resolve => { release = resolve; });
      }
      return fetch(url, options);
    };
    const refreshing = setup.client.refresh();
    await pending;
    const logout = setup.client.logout();
    release();
    await Promise.all([refreshing, logout]);
    await settle();
    assert.equal(setup.operations.some(operation => operation.startsWith("end:")), false);
  } finally { setup.close(); }
});
