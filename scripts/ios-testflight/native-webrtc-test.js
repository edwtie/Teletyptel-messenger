const fs = require("node:fs");
const path = require("node:path");
const sdk = require("./native-webrtc");

function findFramework(directory) {
  const matches = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const child = path.join(current, entry.name);
      if (entry.name === "WebRTC.xcframework") {
        const mac = path.join(child, "macos-x86_64_arm64", "WebRTC.framework");
        if (fs.existsSync(mac)) matches.push(path.dirname(mac));
      } else visit(child);
    }
  }
  visit(directory);
  if (matches.length !== 1) throw new Error("Expected one pinned macOS WebRTC framework for native RTT test");
  return matches[0];
}

function runLoopback({ output, reports, run, logged }) {
  if (process.platform !== "darwin") throw new Error("Native WebRTC runtime test requires macOS");
  const framework = findFramework(path.join(output, "DerivedData/SourcePackages/artifacts"));
  const executable = path.join(output, "native-webrtc-loopback");
  const result = { passed: false, version: sdk.version, revision: sdk.revision,
    scope: "two native same-machine peers, T.140 only; no STUN/TURN, accounts, APNs, audio or video" };
  try {
    logged("xcrun", ["swiftc", "-swift-version", "5", "-F", framework, "-framework", "WebRTC",
      "-Xlinker", "-rpath", "-Xlinker", framework,
      path.join(__dirname, "NativeT140Session.swift"), path.join(__dirname, "NativeWebRTCChannel.swift"),
      path.join(__dirname, "tests/NativeWebRTCTests.swift"), "-o", executable], "native-webrtc-compile.log");
    const runtimeLog = "native-webrtc-runtime.log";
    try {
      logged(executable, [], runtimeLog, { timeout: 60000 });
    } catch (error) {
      const detail = fs.readFileSync(path.join(output, runtimeLog), "utf8").split(/\r?\n/)
        .filter(line => /Precondition failed|Fatal error|dyld\[|Library not loaded|Reason:/.test(line)).slice(-8).join("\n");
      console.error(detail.slice(-2000));
      throw error;
    }
    const outputText = fs.readFileSync(path.join(output, runtimeLog), "utf8");
    if (!outputText.includes("Native WebRTC RTT loopback passed")) throw new Error("Native WebRTC RTT test did not finish");
    result.passed = true;
  } finally {
    fs.writeFileSync(path.join(reports, "native-webrtc-smoke.json"), JSON.stringify(result, null, 2));
  }
}

module.exports = { findFramework, runLoopback };
