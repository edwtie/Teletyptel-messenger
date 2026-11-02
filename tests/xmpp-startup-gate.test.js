const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const startup = source.slice(source.indexOf("  async function loadPlatformConfig()"), source.indexOf("  async function loadGoogleMapsConfig()"));

function fixture({ reachable = true, configFailure = false, errorCode } = {}) {
  const calls = [], gates = [];
  const saved = { accountId: "fixture", jid: "fixture@localhost", password: "fixture-only", preferredLanguage: "eng" };
  const context = { state: {}, window: {}, oauthAccountId: "", oauthLoginToken: "",
    el: { providerSummary: {}, dialogAccountStatus: {} },
    loadSavedAccountProfile: () => saved,
    fetchJson: async () => { if (configFailure) throw Object.assign(new Error("Offline"), { code: errorCode }); return {}; },
    applySessionAccountDefaults: () => saved, mergeAccountProfiles: () => saved,
    applyAccountProfile: () => {}, loadLanguage: async () => {},
    checkXmppServerAvailable: async retry => { gates.push(retry); return reachable; },
    loadDatabaseAccount: async () => { calls.push("database"); return true; },
    accountLoginToken: () => "", storeServerAccountBrowserSession: () => {},
    loadMessageHistory: async () => {}, loadConversationHistory: async () => {}, loadGroupMetadata: async () => {},
    loadRtcConfig: async () => {}, loadGoogleMapsConfig: async () => {}, renderProvider() {}, renderTabs() {},
    setAccountBooting: value => calls.push(["booting", value]),
    showAccountStartIfRequired: value => calls.push(["login", value]),
    setAccountReady: value => calls.push(["accountReady", value]),
    autoConnectIfReady: () => calls.push("connect"), openPasswordResetDialogIfRequested() {},
    appendDebug() {}, t: (key, fallback) => fallback,
    showXmppServerUnavailable: reason => calls.push(reason || "offline")
  };
  vm.runInNewContext(startup, context);
  return { context, calls, gates, saved };
}

test("Unreachable ejabberd stops startup before account loading and keeps the stored profile", async () => {
  const app = fixture({ reachable: false });
  await app.context.loadPlatformConfig();
  assert.equal(app.calls.includes("database"), false);
  assert.equal(app.calls.includes("connect"), false);
  assert.deepEqual(app.calls, [["booting", false]]);
  assert.equal(app.context.state.account, app.saved);
  assert.equal(app.saved.password, "fixture-only");
  assert.equal(typeof app.gates[0], "function");
});

test("A responding XMPP server allows account startup and the authenticated connection", async () => {
  const app = fixture();
  await app.context.loadPlatformConfig();
  assert.equal(app.gates.length, 1);
  assert.equal(app.calls[0], "database");
  assert.equal(app.calls.at(-1), "connect");
  assert.ok(app.calls.some(value => Array.isArray(value) && value[0] === "accountReady" && value[1]));
});

test("Unavailable web configuration cannot fall through to a stale authenticated UI", async () => {
  const app = fixture({ configFailure: true });
  await app.context.loadPlatformConfig();
  assert.deepEqual(app.calls, [["booting", false], "offline"]);
  assert.equal(app.calls.includes("connect"), false);
  assert.equal(app.saved.accountId, "fixture");
});

test("A native certificate failure is distinct from offline and preserves the saved account", async () => {
  const app = fixture({ configFailure: true, errorCode: "SERVER_CERTIFICATE_ERROR" });
  app.context.window.TeleTypTelApp = {};
  await app.context.loadPlatformConfig();
  assert.deepEqual(app.calls, [["booting", false], "certificate"]);
  assert.equal(app.saved.accountId, "fixture");
  assert.equal(app.gates.length, 0);
  assert.equal(app.calls.includes("connect"), false);
});

test("Generic native network errors are not falsely labelled certificate failures", async () => {
  const app = fixture({ configFailure: true, errorCode: "SERVER_UNAVAILABLE" });
  app.context.window.TeleTypTelApp = {};
  await app.context.loadPlatformConfig();
  assert.deepEqual(app.calls, [["booting", false], "offline"]);
});

test("Face ID must complete before any server/account startup", async () => {
  const app = fixture();
  let unlock;
  app.context.window.TeleTypTelFaceID = {
    prepare: () => new Promise(resolve => { unlock = resolve; }),
    validate: async () => true
  };
  const pending = app.context.loadPlatformConfig();
  assert.deepEqual(app.calls, []);
  assert.equal(app.gates.length, 0);
  unlock();
  await pending;
  assert.ok(app.calls.includes("connect"));
});

test("A failed biometric server validation cannot reuse saved account credentials", async () => {
  const app = fixture();
  app.context.window.TeleTypTelFaceID = { prepare: async () => {}, validate: async () => false };
  app.context.requestLoginRequired = () => app.calls.push("reauthenticate");
  await app.context.loadPlatformConfig();
  assert.equal(app.calls.includes("connect"), false);
  assert.ok(app.calls.includes("reauthenticate"));
  assert.equal(app.context.state.account.password, "");
  assert.ok(app.calls.some(value => Array.isArray(value) && value[0] === "accountReady" && value[1] === false));
});
