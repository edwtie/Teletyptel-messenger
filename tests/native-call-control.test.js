const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const native = read("scripts/ios-testflight/NativeCallControl.swift");
const plugin = read("scripts/ios-testflight/VoipCallPlugin.swift");

test("Native source wiring: call control uses its own non-migrating keychain item, not chat authentication", () => {
  assert.match(native, /com\.tiedragon\.teletyptel\.call-control\.v1/);
  assert.match(native, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(native, /kSecAttrSynchronizable as String: false/);
  assert.match(native, /stored.account == account, stored.device == device/);
  assert.doesNotMatch(native, /MessengerBiometricSession|UserDefaults|print\(|NSLog|HTTPCookieStorage\.shared/);
  const snapshot = plugin.slice(plugin.indexOf("func snapshot()"), plugin.indexOf("func configureControl(account:"));
  assert.doesNotMatch(snapshot, /control[!.?]*\.token|credential/);
  const configure = plugin.slice(plugin.indexOf("@objc func configureControl("), plugin.indexOf("@objc func state("));
  assert.match(configure, /perform\(call\)/);
  assert.match(plugin, /isBundledMessenger\(bridge\?\.webView\?\.url\) && MessengerBiometricSession.shared.permitsRequests/);
});

test("Native source wiring: fixed TLS route, no cookies, no redirects, bounded work and response", () => {
  assert.match(native, /origin.scheme == "https"/);
  assert.match(native, /"\/api\/call-control\.php"/);
  assert.match(native, /config.httpCookieStorage = nil/);
  assert.match(native, /config.urlCredentialStorage = nil/);
  assert.match(native, /completionHandler\(nil\)/);
  assert.match(native, /config.timeoutIntervalForResource = 10/);
  assert.match(native, /data.count \+ chunk.count <= 16384/);
  assert.match(native, /results.count == expected.count/);
  assert.match(native, /seen.insert\(id\).inserted/);
  assert.doesNotMatch(native, /serverTrust|useCredential|evaluateJavaScript/);
  assert.match(plugin, /beginBackgroundTask/);
  assert.match(plugin, /endBackgroundTask\(backgroundTask\)/);
  assert.match(plugin, /self.controlRevision == revision/);
  assert.match(plugin, /credential.expiresAt > Date/);
});

test("Native source wiring: persistent decline queue and no claim that server acceptance connects audio", () => {
  assert.match(plugin, /ended = stored.ended/);
  const finish = plugin.slice(plugin.indexOf("private func finish("), plugin.indexOf("@objc(TeleTypTelVoipCallPlugin)"));
  assert.match(finish, /persistControl\(\)/);
  assert.match(finish, /scheduleControl\(\)/);
  const reconcile = plugin.slice(plugin.indexOf("private func reconcileNative()"), plugin.indexOf("func pushRegistry("));
  assert.doesNotMatch(reconcile, /fulfill\(|mediaConnected\(|setActive\(|requestRecordPermission/);
  assert.match(reconcile, /call.phase == "ringing" \|\| call.phase == "answerRequested"/);
  assert.match(reconcile, /acknowledged.contains/);
  assert.match(reconcile, /else if self.ended.contains[\s\S]*?!events.contains[\s\S]*?self.scheduleControl\(\)/);
  assert.match(reconcile, /userAuthenticationRequired/);
  assert.match(plugin, /MessengerCallControlVault.clear\(\)/);
  assert.match(read("scripts/ios-testflight/prepare.js"), /NativeCallControl.swift/);
});

test("Native endpoint source guards: explicit opt-in, bearer-only, no invitation or media access", () => {
  const endpoint = read("php/public/api/call-control.php");
  assert.match(endpoint, /TELETYPTEL_CALL_PUSH_NATIVE_CONTROL/);
  assert.match(endpoint, /HTTP_AUTHORIZATION/);
  assert.match(endpoint, /CallPushPolicy::load/);
  assert.match(endpoint, /reconcileControl/);
  assert.doesNotMatch(endpoint, /session_start|\$_COOKIE|\$_GET|inviteVerified|acceptVerified|ensureSchema|dispatchOne/);
});
