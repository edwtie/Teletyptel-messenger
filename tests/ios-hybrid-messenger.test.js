const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { createClient, safeState, safeCall, safeConversation } = require("../mobile/ios-hybrid/Web/native-session");
const { projectText } = require("../scripts/prepare-ios-native");

const epoch = crypto.randomUUID();
const peer = "peer@localhost";
const roster = { status: "ready", contacts: [{ jid: peer, name: "Fixture", presence: "online", canCall: true }] };
const conversation = () => ({ peer, draft: "", messages: [], history: "ready", canSend: true, canChange: true });
const connected = () => ({ version: 1, sequence: 1, epoch, phase: "connected", chatAvailable: true, callsAvailable: true,
  socialLoginAvailable: false, roster, conversation: conversation(), call: { phase: "idle" } });
const message = () => ({ id: crypto.randomUUID(), body: "<script>not executable</script>", outgoing: false, timestamp: 1780000000,
  state: "incoming", delivery: "unconfirmed", edited: false, retracted: false, reactions: [] });
const call = () => ({ phase: "active", id: crypto.randomUUID(), peer, mode: "total", muted: false, cameraEnabled: true, remoteCamera: "on",
  rttReady: true, canSwitchCamera: true, canSendDtmf: true, ownText: "", remoteText: "", videoFit: "contain" });

test("conversation and call projections expose immutable UI data, not native signaling details", () => {
  const value = safeState({ ...connected(), conversation: { ...conversation(), messages: [message()] } });
  assert.ok(Object.isFrozen(value.conversation.messages[0]));
  assert.equal(value.conversation.messages[0].body, "<script>not executable</script>");
  assert.equal(safeCall(call()).mode, "total");
  for (const extra of ["password", "sdp", "ice", "deviceToken", "callEndpoint"]) {
    assert.throws(() => safeCall({ ...call(), [extra]: "private" }), /invalidNativeReply/);
  }
  assert.throws(() => safeConversation({ ...conversation(), messages: [{ ...message(), stanzaID: "private" }] }, roster), /invalidNativeReply/);
});

test("malformed message receipts, duplicated IDs and invalid call phases fail closed", () => {
  const first = message();
  for (const messages of [[first, first], [{ ...first, delivery: "online" }], [{ ...first, outgoing: true }], [{ ...first, body: "\u0000" }]]) {
    assert.throws(() => safeConversation({ ...conversation(), messages }, roster), /invalidNativeReply/);
  }
  for (const value of [{ ...call(), peer: peer + "/private-resource" }, { ...call(), id: "bad" }, { ...call(), mode: "sip-password" }, { phase: "idle", ownText: "previous call" }]) {
    assert.throws(() => safeCall(value), /invalidNativeReply/);
  }
  assert.throws(() => safeState({ ...connected(), phase: "signedOut" }), /invalidNativeReply/);
});

test("chat, RTT and DTMF use separate scoped native commands without a browser transport", async () => {
  const commands = [];
  let sequence = 1;
  const client = createClient({ makeID: crypto.randomUUID, postMessage: body => {
    const command = JSON.parse(body); commands.push(command);
    return { version: 1, id: command.id, snapshot: { ...connected(), sequence: ++sequence } };
  } });
  client.receive(connected());
  await client.setDraft(peer, "Concept");
  await client.sendMessage(peer, "Bericht");
  const identifier = crypto.randomUUID();
  await client.startCall(peer, "total");
  await client.controlCall(identifier, "rtt", "Live tekst");
  await client.controlCall(identifier, "dtmf", "#");
  assert.deepEqual(commands.map(value => value.command), ["chat.draft", "chat.send", "calls.start", "calls.control", "calls.control"]);
  assert.ok(commands.every(value => value.epoch === epoch));
  assert.equal(commands[3].arguments.value, "Live tekst");
  client.dispose();
});

test("queued old-account work and oversized drafts never cross the bridge", async () => {
  let calls = 0;
  const client = createClient({ makeID: crypto.randomUUID, postMessage() { calls += 1; throw new Error("unexpected"); } });
  client.receive(connected());
  client.receive({ ...connected(), sequence: 2, epoch: crypto.randomUUID() });
  await assert.rejects(client.setDraft(peer, "Previous account", epoch), /invalidState/);
  await assert.rejects(client.startCall(peer, "total", epoch), /invalidState/);
  await assert.rejects(client.sendMessage(peer, "a".repeat(8193)), /invalidRequest/);
  await assert.rejects(client.setDraft(peer, "\u0000"), /invalidRequest/);
  assert.equal(calls, 0);
  client.dispose();
});

test("the app generator adds the bridge to one target without changing the default target", () => {
  const normal = projectText().project;
  assert.doesNotMatch(normal, /TELETYPTEL_HYBRID_EMBEDDED|hybrid-content\.json/);
  const hybrid = projectText({ hybrid: true, extraSources: ["Hybrid/HybridSession.swift"], extraResources: ["Hybrid/hybrid-content.json"] }).project;
  assert.match(hybrid, /TELETYPTEL_HYBRID_EMBEDDED/);
  assert.match(hybrid, /Hybrid\/HybridSession.swift/);
  assert.match(hybrid, /Hybrid\/hybrid-content.json/);
  assert.throws(() => projectText({ extraSources: ["../secret.swift"] }), /Invalid/);
  assert.throws(() => projectText({ extraResources: ["Hybrid/private.p8"] }), /Invalid/);
});

test("hybrid assembly reuses the existing CallKit provider and never starts a second engine", () => {
  const app = fs.readFileSync("mobile/ios-hybrid/App/TeleTypTelHybridApp.swift", "utf8");
  const adapter = fs.readFileSync("mobile/ios-hybrid/App/NativeHybridCallAdapter.swift", "utf8");
  assert.match(app, /NativeCallController\.shared/);
  assert.match(app, /calls\.attach\(login\)/);
  assert.match(adapter, /controller\.answerFromHybrid\(\)/);
  assert.match(adapter, /RTCMTLVideoView/);
  assert.doesNotMatch(app + adapter, /CXProvider\(|RTCPeerConnectionFactory\(|URLSessionWebSocketTask/);
  assert.throws(() => require("../scripts/ios-hybrid/prepare-app").prepare(), /disposable CI runner/);
});
