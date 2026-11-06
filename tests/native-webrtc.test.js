const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sdk = require("../scripts/ios-testflight/native-webrtc");
const { findFramework } = require("../scripts/ios-testflight/native-webrtc-test");
const read = file => fs.readFileSync(path.join(__dirname, "..", "scripts/ios-testflight", file), "utf8");

test("Preview WebRTC is revision-pinned and rejects unexpected or duplicate package wiring", () => {
  const source = '    dependencies: [\n],\n.product(name: "Capacitor", package: "capacitor-swift-pm")';
  const updated = sdk.addPackage(source);
  assert.match(updated, new RegExp(sdk.revision));
  assert.match(sdk.revision, /^[a-f0-9]{40}$/);
  assert.match(sdk.checksum, /^[a-f0-9]{64}$/);
  assert.match(updated, /\.product\(name: "WebRTC", package: "WebRTC"\)/);
  assert.doesNotMatch(updated, /branch:|upToNextMajor|latest/);
  assert.throws(() => sdk.addPackage(updated));
  assert.throws(() => sdk.addPackage("unknown package"));
  assert.doesNotThrow(() => sdk.configurePackage("not-a-real-directory", false));
  const nested = '    dependencies: [\n        .package(url: "https://example.test/capacitor", exact: "8.4.3")\n    ],\n    targets: [\n        .target(name: "CapApp-SPM",\n            dependencies: [\n                .product(name: "Capacitor", package: "capacitor-swift-pm")\n            ])\n    ]';
  const nestedUpdated = sdk.addPackage(nested);
  assert.equal((nestedUpdated.match(/\.package\(url: "https:\/\/github.com\/stasel\/WebRTC.git"/g) || []).length, 1);
  assert.ok(nestedUpdated.includes('            dependencies: [\n                .product(name: "WebRTC"'));
  assert.throws(() => sdk.addPackage(source + '\n    dependencies: ['));
});

test("Native WebRTC source is preview-only; upload remains blocked", () => {
  assert.match(read("prepare.js"), /config.callPushPreview \? fs.readFileSync\(path.join\(__dirname, "NativeWebRTCChannel.swift"\)/);
  assert.match(read("build.js"), /configurePackage\(project, config.callPushPreview === true\)/);
  assert.match(read("build.js"), /if \(!upload\)[\s\S]*if \(config.callPushPreview\) require\("\.\/native-webrtc-test"\)/);
  assert.match(read("call-push.js"), /upload && plist.TeleTypTelCallPushEnabled === true/);
});

test("Native adapter source guards: reliable ordered binding, bounded queues and teardown", () => {
  const source = read("NativeWebRTCChannel.swift");
  for (const setting of ["isOrdered = true", "isNegotiated = true", "channelId = 0", 'protocol = "t140"', "maxRetransmits = -1", "maxPacketLifeTime = -1"]) assert.ok(source.includes(setting));
  assert.match(source, /transport.maxRetransmits == UInt16.max \? nil/);
  assert.match(source, /transport.maxPacketLifeTime == UInt16.max \? nil/);
  assert.match(source, /session.attach\(adapter, callId: session.callId, sid: session.sid\)/);
  assert.match(source, /dataChannel === transport/);
  assert.match(source, /queuedMessages < 64, queuedBytes \+ bytes <= 262144/);
  assert.match(source, /accepting && !updateQueued/);
  assert.match(source, /DispatchQueue.main.async/);
  assert.match(source, /transport.delegate = nil/);
  assert.match(source, /session = nil/);
  assert.match(source, /changed = nil/);
  assert.doesNotMatch(source, /print\(|NSLog|URLSession|UserDefaults|Keychain|AVCapture|setActive\(/);
  const plugin = read("VoipCallPlugin.swift");
  assert.match(plugin, /func attachNativeRtt[\s\S]*call.phase == "answerRequested"[\s\S]*call.mediaProfile.rawValue == negotiatedProfile/);
  assert.doesNotMatch(plugin, /CAPPluginMethod\(name: "attachNativeRtt"|@objc func attachNativeRtt/);
});

test("Native runtime fixture uses actual peer connections with no external signaling or media capture", () => {
  const fixture = read("tests/NativeWebRTCTests.swift");
  assert.match(fixture, /RTCPeerConnectionFactory\(\)/);
  assert.match(fixture, /configuration.iceServers = \[\]/);
  assert.match(fixture, /sender.setText\(text\)/);
  assert.match(fixture, /receiver.remoteText == text/);
  assert.match(fixture, /receiver.setText\("Antwoord/);
  assert.match(fixture, /receiver.remoteText == large && !sender.hasPendingText/);
  assert.match(fixture, /receiver.ownText.isEmpty && receiver.remoteText.isEmpty/);
  assert.match(fixture, /wait\("remote channel closure callback", until: \{ receiver.status == "unavailable" \}\)/);
  assert.doesNotMatch(fixture, /audioTrack\(|videoTrack\(|stun:|turn:|https:|URLSession/);
});

test("Framework discovery fails closed on missing or ambiguous native binary", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-webrtc-path-"));
  try {
    assert.throws(() => findFramework(directory));
    const framework = path.join(directory, "vendor/WebRTC.xcframework/macos-x86_64_arm64/WebRTC.framework");
    fs.mkdirSync(framework, { recursive: true });
    assert.equal(findFramework(directory), path.dirname(framework));
    fs.mkdirSync(path.join(directory, "duplicate/WebRTC.xcframework/macos-x86_64_arm64/WebRTC.framework"), { recursive: true });
    assert.throws(() => findFramework(directory));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
