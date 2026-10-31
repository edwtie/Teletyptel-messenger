const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const section = (start, end) => client.slice(client.indexOf(`  ${start}`), client.indexOf(`  ${end}`));
const namespace = "urn:xmpp:jingle:apps:rtt-sync:0";

function fixture() {
  const sent = [], finals = [], fallback = [];
  const conversation = { id: "fixture", peer: "peer@example.test", remoteText: "" };
  const call = { sid: "fixture-call", peer: conversation.peer, rttEnabled: true, rttNeedsReset: false,
    rttSync: { sequence: 0 }, rttChannel: { readyState: "open", send: text => sent.push(text) } };
  const state = { call, previousText: "", mode: "relay" };
  const el = { messageInput: { value: "" }, rttToggle: { checked: true } };
  const context = vm.createContext({ state, el, ArrayBuffer, TextDecoder, Blob,
    t140Backspace: "\b", t140Delete: "\u007f", jingleRttSyncNamespace: namespace,
    isActiveConversationBlocked: () => false, activeConversation: () => conversation,
    addressMatches: (left, right) => left === right,
    normalizeJingleRttSyncDescriptor: value => value, currentFromJid: () => "self@example.test",
    appendDebug() {}, escapeXml: value => value, recordTotalConversationText() {},
    createJingleRttPacketDebugXml: () => "", ensureConversationForPeer: () => conversation,
    displayNameForJid: value => value, setPeerPresence() {}, updateRemoteDraftMessage() {}, updateTotalConversationTextPanel() {},
    applyJingleRttSyncDraft: (call, packet) => { conversation.remoteText = packet.text; },
    applyJingleRttSyncFinal: (call, packet) => { finals.push(packet.text); conversation.remoteText = ""; },
    hasActiveConversation: () => true, isXmppRttConnected: () => false, createDeltaActions: () => "fixture-delta",
    sendXmppRttPacket: () => false, sendRttPacket: (event, text) => fallback.push({ event, text })
  });
  vm.runInContext(section("function activeJingleRttSyncCall()", "function applyXmppRttElement(")
    + section("function isIgnoredT140Control(", "function applyJingleRttSyncDraft(")
    + section("function sendRttEdit()", "function isXmppRttConnected()"), context);
  return { call, state, el, sent, finals, fallback, conversation,
    receive: text => context.handleJingleRttSyncPacket(call, text),
    send: (event, text, options) => context.sendJingleRttSyncPacket(event, text, options),
    edit: () => context.sendRttEdit() };
}

test("Raw RTT preserves digits, JSON-looking text, whitespace, emoji and erasure", async () => {
  const app = fixture();
  for (const text of ["0", "123", "true", "false", "null", '"Hallo"', "{}", "[]", '{"value":42}', " 123 ", "Hoi 👋", " "]) {
    app.conversation.remoteText = "";
    await app.receive(text);
    assert.equal(app.conversation.remoteText, text);
  }
  await app.receive("👋\b!");
  assert.equal(app.conversation.remoteText, " !");
});

test("UTF-8 buffers and blobs take the same non-lossy receiving path", async () => {
  for (const data of [new TextEncoder().encode("123"), new TextEncoder().encode("123").buffer, new Blob(["123"])]) {
    const app = fixture();
    await app.receive(data);
    assert.equal(app.conversation.remoteText, "123");
  }
});

test("Legacy reset and final envelopes still work; wrong sessions and ended calls do not change text", async () => {
  const app = fixture();
  const packet = { type: "jingle-rtt-sync", namespace, sid: app.call.sid, event: "reset", text: "123" };
  await app.receive(JSON.stringify(packet));
  assert.equal(app.conversation.remoteText, "123");
  await app.receive(JSON.stringify({ ...packet, sid: "other", text: "wrong" }));
  assert.equal(app.conversation.remoteText, "123");
  await app.receive(JSON.stringify({ ...packet, event: "message" }));
  assert.deepEqual(app.finals, ["123"]);
  app.state.call = null;
  await app.receive("late text");
  assert.equal(app.conversation.remoteText, "");
});

test("Late asynchronous decoding cannot update a replacement call", async () => {
  const app = fixture();
  let finish;
  const blob = new Blob(["late"]);
  blob.text = () => new Promise(resolve => { finish = resolve; });
  const pending = app.receive(blob);
  app.state.call = { sid: "replacement" };
  finish("late");
  await pending;
  assert.equal(app.conversation.remoteText, "");
});

test("JSON-looking outgoing deltas use legacy snapshots so installed clients do not drop them", async () => {
  const app = fixture();
  for (const text of ["123", "true", "{}", JSON.stringify({ type: "jingle-rtt-sync", namespace, event: "message", text: "literal text" })]) {
    app.sent.length = 0;
    assert.equal(app.send("edit", text, { previousText: "" }), true);
    const packet = JSON.parse(app.sent[0]);
    assert.equal(packet.type, "jingle-rtt-sync");
    assert.equal(packet.text, text);
    await app.receive(app.sent[0]);
    assert.equal(app.conversation.remoteText, text);
    assert.equal(app.finals.length, 0);
  }
});

test("Failed raw send falls back to a complete snapshot and recovery resets the remote baseline", async () => {
  const app = fixture();
  app.state.previousText = "Hello";
  app.el.messageInput.value = "Hello world";
  app.call.rttChannel.send = () => { throw new Error("Channel closed"); };
  assert.doesNotThrow(() => app.edit());
  assert.deepEqual(app.fallback, [{ event: "reset", text: "Hello world" }]);
  assert.equal(app.call.rttNeedsReset, true);
  app.call.rttChannel.send = text => app.sent.push(text);
  app.el.messageInput.value = "Hello world!";
  app.edit();
  const packet = JSON.parse(app.sent[0]);
  assert.equal(packet.event, "reset");
  assert.equal(packet.text, "Hello world!");
  app.conversation.remoteText = "stale";
  await app.receive(app.sent[0]);
  assert.equal(app.conversation.remoteText, "Hello world!");
  assert.equal(app.call.rttNeedsReset, false);
});

test("Closed channels and failed JSON sends also preserve a reset baseline", () => {
  for (const text of ["Plain text", "123"]) {
    const app = fixture();
    app.el.messageInput.value = text;
    app.call.rttChannel.readyState = "closed";
    app.edit();
    assert.deepEqual(app.fallback, [{ event: "reset", text }]);
    assert.equal(app.call.rttNeedsReset, true);
  }
  const app = fixture();
  app.call.rttChannel.send = () => { throw new Error("Channel closed"); };
  assert.equal(app.send("reset", "123"), false);
  assert.equal(app.call.rttNeedsReset, true);
});
