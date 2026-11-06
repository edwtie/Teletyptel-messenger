const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const native = path.join(root, "scripts/ios-testflight");
const fixture = path.join(__dirname, "fixtures/native-t140-vectors.json");
const vectors = JSON.parse(fs.readFileSync(fixture, "utf8"));
const sandbox = { TextEncoder, TextDecoder, ArrayBuffer };
vm.runInNewContext(fs.readFileSync(path.join(root, "php/public/jingle-t140.js"), "utf8"), sandbox);

test("Shared native/browser T.140 receive vectors match the existing browser codec", () => {
  for (const vector of vectors.receive) {
    let value = { text: "", carriageReturn: false };
    for (const block of vector.blocks) value = sandbox.TeleTypTelT140.apply(value, block);
    assert.equal(value.text, vector.text, vector.name);
  }
});

test("Shared native/browser T.140 edit vectors produce identical expected UTF-8 blocks", () => {
  const channel = new EventTarget();
  Object.assign(channel, { label: "rtt", protocol: "t140", ordered: true, negotiated: true, id: 0,
    maxRetransmits: null, maxPacketLifeTime: null, readyState: "open", bufferedAmount: 0, packets: [],
    send(data) { this.packets.push(new TextDecoder("utf-8", { fatal: true }).decode(data)); }, close() {} });
  const sender = sandbox.TeleTypTelT140.create(channel);
  let received = { text: "", carriageReturn: false };
  for (const edit of vectors.edits) {
    const offset = channel.packets.length;
    assert.equal(sender.setText(edit.input), true);
    const encoded = channel.packets.slice(offset).join("");
    assert.equal(encoded, edit.bytes);
    received = sandbox.TeleTypTelT140.apply(received, encoded);
    assert.equal(received.text, edit.text);
  }
  sender.close();
});

test("Native source wiring: RTT belongs to one call and is cleared on every terminal path", () => {
  const plugin = fs.readFileSync(path.join(native, "VoipCallPlugin.swift"), "utf8");
  const source = fs.readFileSync(path.join(native, "NativeT140Session.swift"), "utf8");
  const prepare = fs.readFileSync(path.join(native, "prepare.js"), "utf8");
  assert.match(plugin, /mediaProfile.contents.contains\("rtt"\) \? MessengerNativeRttSession\(callId: id, sid: sid\)/);
  assert.match(source, /self.callId == callId && self.sid == sid && channel === candidate/);
  assert.match(source, /precondition\(Thread.isMainThread\)/);
  assert.match(source, /candidate.descriptor == \.conversation/);
  assert.match(source, /String\(data: data, encoding: \.utf8\)/);
  assert.match(source, /maxBlockBytes = 4096/);
  assert.match(source, /maxTextPoints = 32768/);
  assert.match(source, /maxBufferedBytes: UInt64 = 65536/);
  assert.doesNotMatch(source, /UserDefaults|Keychain|URLSession|JSONSerialization|print\(|NSLog/);
  const finish = plugin.slice(plugin.indexOf("private func finish("), plugin.indexOf("@objc(TeleTypTelVoipCallPlugin)"));
  assert.match(finish, /call.rtt\?\.close\(\)/);
  const close = source.slice(source.indexOf("private func close(status:"));
  for (const clear of ["channel = nil", "pending = nil", "sent = MessengerT140Text()", "received = MessengerT140Text()"]) assert.ok(close.includes(clear));
  assert.ok(close.indexOf("closed = true") < close.indexOf("previous?.close()"));
  const connected = plugin.slice(plugin.indexOf("func mediaConnected(id:"), plugin.indexOf("func attachRtt("));
  assert.match(connected, /call.rtt\?\.isReady == true/);
  assert.ok(prepare.indexOf('"NativeT140Session.swift"') < prepare.indexOf('"VoipCallPlugin.swift"'));
});

test("Native source wiring: text stays out of push snapshots and requires unlocked bundled UI", () => {
  const plugin = fs.readFileSync(path.join(native, "VoipCallPlugin.swift"), "utf8");
  const snapshot = plugin.slice(plugin.indexOf("func snapshot()"), plugin.indexOf("func configureControl("));
  assert.doesNotMatch(snapshot, /ownText|remoteText/);
  assert.match(snapshot, /"rttStatus"/);
  for (const method of ["rttState", "setRttText"]) {
    const body = plugin.slice(plugin.indexOf("@objc func " + method + "("));
    assert.match(body, new RegExp("@objc func " + method + "[\\s\\S]*?perform\\(call\\)"));
  }
  assert.match(plugin, /isBundledMessenger\(bridge\?\.webView\?\.url\) && MessengerBiometricSession.shared.permitsRequests/);
  assert.doesNotMatch(plugin, /@objc func (attachRtt|receiveRtt|rttTransportChanged)/);
  const events = plugin.slice(plugin.indexOf("ended.append("), plugin.indexOf("if ended.count > 32"));
  assert.doesNotMatch(events, /[Tt]ext|rtt/);
});

test("Swift runtime: T.140 interoperability, Unicode, backpressure and call isolation", { skip: process.platform !== "darwin" && "Requires macOS Swift compiler" }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-t140-test-"));
  try {
    const executable = path.join(directory, "t140-tests");
    execFileSync("xcrun", ["swiftc", path.join(native, "NativeT140Session.swift"),
      path.join(native, "tests/NativeT140Tests.swift"), "-o", executable], { timeout: 120000 });
    assert.match(execFileSync(executable, [fixture], { timeout: 30000, encoding: "utf8" }), /Native T140 checks passed/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
