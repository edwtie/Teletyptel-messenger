const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = file => read("mobile/ios-native/App/" + file);

test("Native G722 is an explicit extra audio preference carried to outgoing WebRTC, not a default replacement", () => {
  const core = read("mobile/ios-native/Sources/TeleTypTelCore/NativeJingleMedia.swift");
  assert.match(core, /case pcmu = "PCMU", g722 = "G722"/);
  assert.match(core, /self == \.g722 \? "9" : "0"/);
  assert.match(app("NativeAccountSettingsView.swift"), /@AppStorage\(NativeAudioCodec.preferenceKey\).*NativeAudioCodec.pcmu.rawValue/);
  assert.match(app("NativeAccountSettingsView.swift"), /accessibilityIdentifier\("call-audio-codec"\)/);
  assert.match(app("NativeCallController.swift"), /audioCodec: audioCodec.rawValue/);
  assert.match(app("NativeOutgoingPeerNegotiator.swift"), /audioCodec: audioCodec, changed:/);
  assert.match(app("NativeMediaPeer.swift"), /Self.add\(microphone, kind: "audio", codec: audioCodec/);
  assert.match(app("NativeMediaPeer.swift"), /kind != "audio" \|\| \$0.clockRate\?\.intValue == 8000/);
});

test("Native incoming G722 follows the validated offer rather than an unrelated outgoing preference", () => {
  const source = app("NativeIncomingPeerNegotiator.swift");
  assert.match(source, /self.audioCodec = offered.audioCodec/);
  assert.match(source, /audioCodec: audioCodec, changed:/);
  assert.doesNotMatch(source, /UserDefaults|AppStorage|\/16000/);
  const tests = read("mobile/ios-native/Tests/TeleTypTelCoreTests/NativeJingleMediaTests.swift");
  for (const name of ["testG722RoundTripsAcrossEveryCallProfile", "testG722CannotDowngrade", "testG722RejectsWrongClock", "testAudioPreferenceOnlyExposes"]) assert.ok(tests.includes(name), name);
});

test("Native G722 evidence requires all runtime profiles and incoming selection without claiming audible/device testing", () => {
  const source = read("scripts/check-ios-native-media.js");
  assert.match(source, /Missing native G722 media result/);
  assert.match(source, /Native G722 incoming codec selection passed/);
  assert.match(source, /no APNs, real camera, audible audio or public network/);
  const loopback = read("mobile/ios-native/MediaTests/NativeMediaLoopback.swift");
  assert.match(loopback, /for mode in NativeCallMedia.allCases.*audioCodec: \.g722/);
  assert.match(loopback, /remoteHangup: true, audioCodec: "G722"/);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /options: \[full, focused-update, focused-media\]/);
  assert.match(workflow, /node scripts\/check-ios-native-codecs.js/);
  assert.doesNotMatch(read("scripts/check-ios-native-codecs.js"), /upload|signing|APNs/);
});
