const fs = require("node:fs");
const path = require("node:path");
const { findFramework } = require("./ios-testflight/native-webrtc-test");
const sdk = require("./ios-testflight/native-webrtc");

function checkMedia({ root, directory, reports, logged }) {
  const framework = findFramework(path.join(directory, "DerivedData/SourcePackages/artifacts"));
  const executable = path.join(directory, "native-media-loopback");
  const native = path.join(root, "mobile/ios-native");
  const core = ["Startup.swift", "XMPPProbeStream.swift", "NativeIncomingCall.swift", "NativeCallCoordinator.swift", "NativeJingleMedia.swift", "NativeLocalMediaSDP.swift", "NativeChat.swift", "NativeArchive.swift", "NativeJingleTransport.swift", "NativeJingleSession.swift"];
  const sources = [...core.map(file => path.join(native, "Sources/TeleTypTelCore", file)),
    path.join(native, "App/NativeMediaPeer.swift"), path.join(native, "App/NativeActivePeerNegotiating.swift"),
    path.join(native, "App/NativeIncomingPeerNegotiator.swift"),
    path.join(native, "App/NativeOutgoingPeerNegotiator.swift"),
    path.join(native, "MediaTests/NativeMediaLoopback.swift"),
    ...["NativeT140Session.swift", "NativeWebRTCChannel.swift"].map(file => path.join(root, "scripts/ios-testflight", file))];
  const result = { passed: false, revision: sdk.revision, profiles: [],
    scope: "same-host native peers; DTLS/ICE, audio negotiation (microphone disabled), synthetic VP8 decoding, bidirectional T140; no APNs, real camera, audible audio or public network" };
  try {
    logged("media-compile", "xcrun", ["swiftc", "-swift-version", "5", "-F", framework, "-framework", "WebRTC",
      "-Xlinker", "-rpath", "-Xlinker", framework, ...sources, "-o", executable]);
    const output = logged("media-runtime", executable, [], 120000);
    for (const profile of ["audio", "video", "audio-rtt", "total"]) {
      if (!output.includes("Native media profile passed: " + profile + "\n")) throw new Error("Missing native media result: " + profile);
      result.profiles.push(profile);
    }
    if (!output.includes("Native audio/video/RTT negotiation loopback passed")) throw new Error("Native media test incomplete");
    if (!output.includes("Native incoming peer provider passed")) throw new Error("Native incoming provider test incomplete");
    result.passed = true;
  } finally {
    fs.writeFileSync(path.join(reports, "native-media-result.json"), JSON.stringify(result, null, 2));
  }
  return result;
}

module.exports = { checkMedia };
