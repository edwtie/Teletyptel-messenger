"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const core = name => read("mobile/ios-native/Sources/TeleTypTelCore/" + name + ".swift");
const app = name => read("mobile/ios-native/App/" + name + ".swift");

test("Call intent signaling is installed before actual media capture, with codec choices preserved", () => {
  const controller = app("NativeCallController");
  assert.match(controller, /callIntentLease\(for: contact.jid\)/);
  assert.match(controller, /usingIntent: true/);
  assert.match(controller, /await intent.prepareSignaling/);
  assert.match(controller, /permitsCallIntent\(lease, peer: target\)/);
  assert.match(controller, /intentPeerAccepted\(id: handle.id\)/);
  assert.match(controller, /await provider.receive\(request\)[\s\S]*self.activePeer === provider/);
  assert.match(controller, /pendingPush\?\.sid == intent.sid \|\| pushRegistration.consented/);
  const provider = app("NativeIntentPeerNegotiator");
  assert.match(provider, /await caller.prepare[\s\S]*await NativeOutgoingPeerNegotiator/);
  assert.match(provider, /await recipient.prepare[\s\S]*await NativeIncomingPeerNegotiator/);
  assert.match(provider, /videoCodec: videoCodec, audioCodec: audioCodec/);
  assert.doesNotMatch(provider, /requestAccess|startCapture|setMicrophoneEnabled|password|Keychain/);
  const { projectText } = require("../scripts/prepare-ios-native");
  for (const name of ["Core/NativeCallPolicy.swift", "Core/NativeCallIntentSession.swift", "App/NativeIntentPeerNegotiator.swift"]) {
    assert.ok(projectText().project.includes(name), name);
  }
});

test("Policy is acknowledged separately from roster changes and cannot silently downgrade", () => {
  assert.match(core("NativeCallPolicy"), /peers.count <= 256/);
  assert.match(core("NativeCallPolicy"), /!self.recognized && error as\? NativeCallPolicyFailure == .unsupported/);
  assert.match(core("NativeCallPolicy"), /desired == applied, task == nil/);
  assert.match(core("NativeLoginModel"), /guard permitsExplicitGatewayCall\(to: peer\)/);
  assert.match(core("NativeLoginModel"), /callPolicyState == .unsupported \|\| callPolicy.usable/);
  assert.match(core("NativeLoginModel"), /now - entry.received <= 5/);
  const connection = core("NativeXMPPConnection");
  assert.match(connection, /exchangeCallControl\(NativeCallIntent.preferences/);
  assert.match(connection, /callControls.count < 2/);
  assert.match(connection, /NativeCallControlReply.decode/);
  assert.doesNotMatch(connection, /editContact\(NativeCallIntent/);
});

test("The explicit local SIP lab route is not accidentally changed into a bare-JID proposal", () => {
  const controller = app("NativeCallController");
  assert.match(app("NativeDialerView"), /calls.startLabCall\(route\)/);
  assert.match(controller, /NativeSIPLabRoute\(configuration: configuration, gateway: route.gateway, number: route.extensionNumber\)/);
  assert.match(controller, /confirmed == route, login\?\.permitsExplicitGatewayCall/);
  assert.match(controller, /startDirectCall\(route.contact, profile: .total, videoCodec: "VP8"\)/);
  assert.match(core("NativeDialing"), /NativeDialing.normalized\(number\) == "600"/);
});

test("No ordinary login secrets, live push capability, or production activation is added", () => {
  assert.doesNotMatch(core("NativeCallPolicy") + core("NativeCallIntentSession"), /password|PHPSESSID|SecItemAdd|UserDefaults/);
  assert.doesNotMatch(read("mobile/ios-native/App/Info.plist"), /aps-environment/);
  assert.doesNotMatch(read("php/public/api/call-push.php"), /'callResourceRecovery'\s*=>\s*true/);
});
