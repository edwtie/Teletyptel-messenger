const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const native = path.join(root, "scripts/ios-testflight");
const plugin = fs.readFileSync(path.join(native, "VoipCallPlugin.swift"), "utf8");

test("Native source wiring: TC requires an explicit profile and all negotiated channels", () => {
  assert.match(plugin, /mediaProfile\?\.hasVideo == hasVideo/);
  assert.match(plugin, /"mediaProfile": call.mediaProfile.rawValue/);
  assert.match(plugin, /"requiredContents": call.mediaProfile.contents.sorted\(\)/);
  const connected = plugin.slice(plugin.indexOf("func mediaConnected(id:"), plugin.indexOf("func end(id:"));
  assert.match(connected, /call.sid == sid/);
  assert.ok(connected.indexOf("call.mediaProfile.accepts") < connected.indexOf("answer.fulfill()"));
  assert.match(plugin, /call.getString\("negotiatedProfile"\)/);
  assert.match(plugin, /call.getArray\("readyContents", String.self\)/);
  const prepare = fs.readFileSync(path.join(native, "prepare.js"), "utf8");
  assert.ok(prepare.indexOf('"CallMediaProfile.swift"') < prepare.indexOf('"VoipCallPlugin.swift"'));
});

test("Swift runtime: no silent TC downgrade or audio-only completion", { skip: process.platform !== "darwin" && "Requires macOS Swift compiler" }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-native-media-"));
  try {
    const executable = path.join(directory, "media-tests");
    execFileSync("xcrun", ["swiftc", path.join(native, "CallMediaProfile.swift"),
      path.join(native, "tests/CallMediaProfileTests.swift"), "-o", executable], { timeout: 120000 });
    assert.match(execFileSync(executable, { timeout: 10000, encoding: "utf8" }), /Native media contract checks passed/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
