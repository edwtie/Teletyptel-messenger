"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const core = name => read("mobile/ios-native/Sources/TeleTypTelCore/" + name + ".swift");
const app = name => read("mobile/ios-native/App/" + name + ".swift");

test("The actual cookie-free broker checks registration, proof, reservation, generation and end", () => {
  const php = process.env.TELETYPTEL_PHP || (process.platform === "win32" ? "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe" : "php");
  for (const name of ["call-recovery-test", "call-recovery-endpoint-test"]) {
    const result = spawnSync(php, ["php/tests/" + name + ".php"], { cwd: root, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /checks passed/);
  }
});

test("App delegate and SwiftUI share a single CallKit owner before receiving a push", () => {
  assert.match(app("NativeCallController"), /static let shared = NativeCallController\(\)/);
  assert.match(app("NativeProviderSDK"), /didFinishLaunchingWithOptions[\s\S]*NativeCallController.shared.restoreBackgroundCalls\(\)/);
  assert.match(app("TeleTypTelNativeApp"), /@StateObject private var calls = NativeCallController.shared/);
  assert.match(app("TeleTypTelNativeApp"), /guard scenePhase == .active, !calls.hasLiveCall else \{ return \}/);
  assert.match(app("NativeCallController"), /TeleTypTelNativeCallRecoveryLabEnabled/);
  assert.match(app("NativeCallController"), /recovery.prepare\(bootstrap: grant/);
  assert.match(app("NativeCallController"), /NativeIncomingPeerNegotiator\(request: offer.request/);
  assert.match(app("NativeCallController"), /recovery.activateRouting\(\)/);
  assert.match(app("NativeCallController"), /login\?\.activeWebSession\?\.configuration.origin.absoluteString == context.scope.origin/);
  assert.match(app("NativeCallController"), /client.end\(invitation: invitation, registration: context.registration\)/);
  assert.match(app("NativeCallMedia"), /created.microphone.isEnabled = audioActive && !muted && !held/);
  assert.match(app("NativeCallPlatform"), /coordinator.audioActivated\(true\)/);
});

test("Cold authentication never opens a normal account or bypasses scoped expiry and consent", () => {
  assert.match(core("NativeXMPPConnection"), /SessionOperation\(bootstrap: bootstrap/);
  assert.match(core("NativeXMPPConnection"), /xmpp-call-websocket/);
  assert.match(core("NativeXMPPConnection"), /scopeDeadline\?\.cancel\(\)/);
  assert.match(core("NativeXMPPConnection"), /remaining > 0, remaining <= 20/);
  assert.match(core("NativeWarmCallSession"), /bootstrap.callID == invitation.id/);
  assert.match(core("NativeWarmCallSession"), /self.authorizedResource == jid/);
  assert.match(core("NativePushRegistrationModel"), /value.recovery = nil/);
  const client = core("NativeCallRecoveryClient");
  assert.match(client, /settings.httpCookieStorage = nil/);
  assert.match(client, /data.count < 4096/);
  assert.match(client, /completionHandler\(nil\)/);
  assert.doesNotMatch(client, /serverTrust|SecTrust|PHPSESSID|password|NativeAuthenticatedAccount\(/);
  assert.doesNotMatch(read("mobile/ios-native/App/Info.plist"), /TeleTypTelNativeCallRecoveryLabEnabled|aps-environment/);
});

test("Only server-verified TLS can attest the special WebSocket listener", () => {
  const handler = read("services/call-push/ejabberd/teletyptel_call_ws.erl");
  assert.match(handler, /sockmod = fast_tls, tp = https/);
  assert.match(handler, /x-teletyptel-tls-attestation/);
  assert.doesNotMatch(handler, /X-Forwarded-Proto|Forwarded/);
  const backend = read("services/call-push/ejabberd/ejabberd_auth_teletyptel_calls.erl");
  assert.match(backend, /crypto:hash_equals\(websocket_mac\(Host, IP, Stamp, Nonce\), Signature\)/);
  assert.match(backend, /Id = \{Host, \{wss, Nonce\}\}/);
  assert.match(backend, /stream_encrypted, State, false\) orelse maps:get\(teletyptel_wss_verified/);
  const endpoint = read("php/public/api/call-recovery.php");
  assert.match(endpoint, /TELETYPTEL_CALL_RECOVERY_LAB/);
  assert.doesNotMatch(endpoint, /session_start|ensureSchema|controlCredential/);
  assert.match(read("php/lib/CallPushRecovery.php"), /openssl_decrypt/);
});
