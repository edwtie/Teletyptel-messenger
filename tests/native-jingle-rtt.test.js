const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const native = path.join(__dirname, "../scripts/ios-testflight");
const source = fs.readFileSync(path.join(native, "NativeJingleRtt.swift"), "utf8");

test("Native Jingle codec is bounded, namespace-aware and cannot resolve external entities", () => {
  for (const text of ["xml.utf8.count <= 65536", "count <= 80", "stack.count < 6", "candidates.count <= 64",
    "parser.shouldProcessNamespaces = true", "parser.shouldResolveExternalEntities = false",
    'root.attributes["sid"] == sid', 'root.attributes["action"] == action', "expectedMid == mid",
    'root.children.count == 1', 'binding.attributes == ["id": "0"', 'sync.attributes == ["role": "conversation"']) assert.ok(source.includes(text), text);
  assert.doesNotMatch(source, /URLSession|UserDefaults|Keychain|print\(|NSLog|setRemoteDescription/);
});

test("Native Jingle conversion is used in the real peer test and only staged for preview", () => {
  const prepare = fs.readFileSync(path.join(native, "prepare.js"), "utf8");
  assert.match(prepare, /config.callPushPreview \? fs.readFileSync\(path.join\(__dirname, "NativeJingleRtt.swift"\)/);
  const runtime = fs.readFileSync(path.join(native, "tests/NativeWebRTCTests.swift"), "utf8");
  assert.match(runtime, /MessengerJingleRtt.fromSdp/);
  assert.match(runtime, /MessengerJingleRtt.toSdp/);
  assert.match(runtime, /jingleDescription\(first.localDescription!/);
  assert.match(runtime, /jingleDescription\(second.localDescription!/);
});

test("Swift runtime: native Jingle RTT round-trip and malformed/foreign content rejection", { skip: process.platform !== "darwin" && "Requires macOS Swift compiler" }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-jingle-test-"));
  try {
    const executable = path.join(directory, "jingle-tests");
    execFileSync("xcrun", ["swiftc", path.join(native, "NativeJingleRtt.swift"),
      path.join(native, "tests/NativeJingleRttTests.swift"), "-o", executable], { timeout: 120000 });
    assert.match(execFileSync(executable, [path.join(__dirname, "fixtures/native-jingle-rtt.json")], { timeout: 30000, encoding: "utf8" }), /Native Jingle RTT codec checks passed/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
