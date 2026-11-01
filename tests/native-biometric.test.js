const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "php/public/native-biometric.js"), "utf8");
const account = { accountId: "fixture", jid: "fixture@localhost", savedInDatabase: true };

function fixture({ enabled = false, asked = false, available = true, platform = "ios", unlock, enroll, verifySession } = {}) {
  const calls = [], events = {}, buttonEvents = {};
  let signedIn = true;
  const button = { hidden: true, dataset: {}, addEventListener: (name, handler) => { buttonEvents[name] = handler; } };
  const plugin = {
    async status() { calls.push("status"); return { enabled, asked, available }; },
    async unlock() { calls.push("unlock"); return unlock ? unlock() : { profile: { ...account, password: "must-not-copy", loginToken: "must-not-copy" } }; },
    async enroll(input) { calls.push(["enroll", input]); return enroll ? enroll() : { enabled: true }; },
    async disable(input) { calls.push(["disable", input]); enabled = false; asked = true; }
  };
  const context = { Capacitor: { getPlatform: () => platform, Plugins: { TeleTypTelBiometrics: plugin } },
    addEventListener: (name, handler) => { events[name] = handler; } };
  context.window = context;
  vm.runInNewContext(source, context);
  const controller = context.TeleTypTelBiometric.create({
    translate: (_, fallback) => fallback, settingsButton: button,
    signedIn: () => signedIn, signedOut: async () => { calls.push("logout"); },
    clearSaved: () => calls.push("clear"), restoreProfile: profile => calls.push(["restore", profile]),
    notify: message => calls.push(["notice", message]), verifySession
  });
  return { controller, calls, events, button, buttonEvents, signOut: () => { signedIn = false; } };
}

test("No native Face ID calls or settings on website/Android", async () => {
  for (const platform of ["web", "android"]) {
    const app = fixture({ platform });
    await app.controller.prepare();
    await app.controller.ready(account);
    assert.deepEqual(app.calls, []);
    assert.equal(app.button.hidden, true);
  }
});

test("First startup never asks for biometric authentication before consent", async () => {
  const app = fixture();
  await app.controller.prepare();
  assert.deepEqual(app.calls, ["status"]);
  await app.controller.ready({ ...account, savedInDatabase: false });
  assert.equal(app.calls.some(value => Array.isArray(value) && value[0] === "enroll"), false);
  await app.controller.ready(account);
  assert.equal(app.calls.filter(value => Array.isArray(value) && value[0] === "enroll").length, 1);
  await app.controller.ready(account);
  assert.equal(app.calls.filter(value => Array.isArray(value) && value[0] === "enroll").length, 1);
});

test("Not now and unavailable Face ID never trigger repeated consent or evaluation", async () => {
  for (const options of [{ asked: true }, { available: false }]) {
    const app = fixture(options);
    await app.controller.prepare();
    await app.controller.ready(account);
    assert.equal(app.calls.includes("unlock"), false);
    assert.equal(app.calls.some(value => Array.isArray(value) && value[0] === "enroll"), false);
  }
});

test("Consented startup unlocks once and copies identifiers only, never credentials", async () => {
  const app = fixture({ enabled: true });
  await Promise.all([app.controller.prepare(), app.controller.prepare()]);
  assert.equal(app.calls.filter(value => value === "unlock").length, 1);
  const restored = app.calls.find(value => Array.isArray(value) && value[0] === "restore")[1];
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), { accountId: "fixture", jid: "fixture@localhost" });
  assert.equal(await app.controller.validate(account, true), true);
  assert.equal(app.calls.some(value => Array.isArray(value) && value[0] === "disable"), false);
});

test("Cancelled or failed Face ID clears saved identity and disables automatic sign-in", async () => {
  const app = fixture({ enabled: true, unlock: async () => { throw new Error("cancelled"); } });
  await app.controller.prepare();
  assert.ok(app.calls.includes("clear"));
  assert.equal(app.calls.find(value => Array.isArray(value) && value[0] === "disable")[1].keepSession, false);
  assert.equal(app.calls.some(value => Array.isArray(value) && value[0] === "restore"), false);
});

test("Expired or mismatched server accounts cannot enter Messenger with Face ID", async () => {
  for (const [profile, authenticated] of [[account, false], [{ ...account, accountId: "other" }, true]]) {
    const app = fixture({ enabled: true });
    await app.controller.prepare();
    assert.equal(await app.controller.validate(profile, authenticated), false);
    assert.ok(app.calls.some(value => Array.isArray(value) && value[0] === "disable"));
  }
});

test("Temporary server failure retains the biometric credential for a later retry", async () => {
  const app = fixture({ enabled: true });
  await app.controller.prepare();
  assert.equal(await app.controller.validate(account, false, true), null);
  assert.equal(app.calls.some(value => Array.isArray(value) && value[0] === "disable"), false);
  assert.equal(await app.controller.validate(account, true), true);
});

test("Logout invalidates a pending unlock so late Face ID cannot restore the account", async () => {
  let resolve;
  const app = fixture({ enabled: true, unlock: () => new Promise(done => { resolve = done; }) });
  const pending = app.controller.prepare();
  await new Promise(setImmediate);
  await app.controller.revoke();
  resolve({ profile: account });
  await pending;
  await app.controller.logout();
  assert.equal(app.calls.some(value => Array.isArray(value) && value[0] === "restore"), false);
  assert.deepEqual(app.calls.filter(value => Array.isArray(value) && value[0] === "disable").map(value => value[1].keepSession), [true, false]);
});

test("Settings can enable after Not now, or disable without signing out the current session", async () => {
  const app = fixture({ asked: true });
  await app.controller.prepare();
  await app.controller.ready(account);
  await app.buttonEvents.click();
  assert.ok(app.calls.some(value => Array.isArray(value) && value[0] === "enroll"));
  app.button.dataset.enabled = "true";
  await app.buttonEvents.click();
  assert.equal(app.calls.find(value => Array.isArray(value) && value[0] === "disable")[1].keepSession, true);
});

test("Foreground unlock revalidates the server; a rejected session signs out", async () => {
  const app = fixture({ enabled: true, verifySession: async () => false });
  await app.events["teletyptel-faceid-resume"]();
  assert.ok(app.calls.includes("unlock"));
  assert.ok(app.calls.includes("logout"));
});

test("Concurrent foreground events cannot open multiple biometric requests", async () => {
  let resolve;
  const app = fixture({ enabled: true, unlock: () => new Promise(done => { resolve = done; }) });
  const first = app.events["teletyptel-faceid-resume"]();
  await app.events["teletyptel-faceid-resume"]();
  resolve({ profile: account });
  await first;
  assert.equal(app.calls.filter(value => value === "unlock").length, 1);
});

test("Native session uses biometric-only, device-bound Keychain storage and a native consent prompt", () => {
  const native = fs.readFileSync(path.join(root, "scripts/ios-testflight/BiometricSession.swift"), "utf8");
  assert.match(native, /kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly/);
  assert.match(native, /\.biometryCurrentSet/);
  assert.match(native, /kSecUseAuthenticationContext/);
  assert.match(native, /SecItemCopyMatching/);
  assert.match(native, /context\.biometryType == \.faceID/);
  assert.match(native, /UIAlertAction\(title: "Niet nu"/);
  assert.match(native, /UIAlertAction\(title: "Face ID inschakelen"/);
  assert.match(native, /revision == self.revision/);
  assert.match(native, /isBundledMessenger/);
  assert.match(native, /UIApplication.didEnterBackgroundNotification/);
  assert.match(native, /clearCookies\(HTTPCookieStorage.shared\)/);
  assert.doesNotMatch(native, /defaults\.set\((data|payload|entries|sessionCookies)|kSecAttrSynchronizable|\.devicePasscode/);
  const bridge = fs.readFileSync(path.join(root, "scripts/ios-testflight/ServerBridge.swift"), "utf8");
  assert.match(bridge, /guard MessengerBiometricSession.shared.permitsRequests/);
  assert.match(bridge, /biometrics.protectedStorage \? URLSessionConfiguration.ephemeral/);
  const prepare = fs.readFileSync(path.join(root, "scripts/ios-testflight/prepare.js"), "utf8");
  assert.match(prepare, /NSFaceIDUsageDescription/);
  assert.match(prepare, /BiometricSession.swift/);
});
