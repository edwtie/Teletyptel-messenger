const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const section = (start, end) => client.slice(client.indexOf(`  ${start}`), client.indexOf(`  ${end}`));
const namespace = "urn:xmpp:jingle:apps:rtt-sync:0";
const protocol = "teletyptel-rtt-json-v1";

function fixture() {
  const sent = [], finals = [], fallback = [];
  const conversation = { id: "fixture", peer: "peer@example.test", remoteText: "" };
  const call = { sid: "fixture-call", peer: conversation.peer, rttEnabled: true, rttNeedsReset: false,
    tcRemoteText: "", tcLocalText: "", tcSentText: "", rttSync: { sequence: 0 }, rttChannel: { readyState: "open", send: text => sent.push(text) } };
  const state = { call, previousText: "", mode: "relay" };
  const el = { totalConversationLocalText: { value: "", tcCall: call }, messageInput: { value: "" }, rttToggle: { checked: true } };
  const context = vm.createContext({ state, el, ArrayBuffer, TextDecoder, Blob,
    t140Backspace: "\b", t140Delete: "\u007f", jingleRttSyncNamespace: namespace,
    teletyptelRttDataChannelProtocol: protocol, jingleRttSyncDataChannelLabel: "rtt",
    isActiveConversationBlocked: () => false, activeConversation: () => conversation,
    addressMatches: (left, right) => left === right,
    normalizeJingleRttSyncDescriptor: value => value, currentFromJid: () => "self@example.test",
    setCallStatus() {}, jingleRttSyncStatusText: () => "status", updateCallUi() {},
    flushTotalConversationInput() {}, callModeName: () => "total", dataChannelDebugSummary: () => "fixture",
    appendDebug() {}, escapeXml: value => value, recordTotalConversationText() {},
    createJingleRttPacketDebugXml: () => "", ensureConversationForPeer: () => conversation,
    displayNameForJid: value => value, setPeerPresence() {}, updateRemoteDraftMessage() {}, updateTotalConversationTextPanel() {},
    applyJingleRttSyncDraft: (call, packet) => { call.tcRemoteText = packet.text; },
    applyJingleRttSyncFinal: (call, packet) => { finals.push(packet.text); call.tcRemoteText = ""; },
    hasActiveConversation: () => true, isXmppRttConnected: () => false, createDeltaActions: () => "fixture-delta",
    sendXmppRttPacket: () => false, sendRttPacket: (event, text) => fallback.push({ event, text })
  });
  vm.runInContext(section("function configureJingleRttSyncChannel(", "function applyXmppRttElement(")
    + section("function isIgnoredT140Control(", "function applyJingleRttSyncDraft(")
    + section("function sendRttEdit()", "function isXmppRttConnected()")
    + section("function handleTotalConversationInput()", "function updateTotalConversationTextPanel("), context);
  return { call, state, el, sent, finals, fallback, conversation,
    receive: (text, channel) => context.handleJingleRttSyncPacket(call, text, channel),
    configure: channel => context.configureJingleRttSyncChannel(call, channel),
    send: (event, text, options) => context.sendJingleRttSyncPacket(event, text, options),
    edit: () => context.handleTotalConversationInput(), chatEdit: () => context.sendRttEdit() };
}

test("Raw RTT preserves digits, JSON-looking text, whitespace, emoji and erasure", async () => {
  const app = fixture();
  for (const text of ["0", "123", "true", "false", "null", '"Hallo"', "{}", "[]", '{"value":42}', " 123 ", "Hoi 👋", " "]) {
    app.call.tcRemoteText = "";
    await app.receive(text);
    assert.equal(app.call.tcRemoteText, text);
  }
  await app.receive("👋\b!");
  assert.equal(app.call.tcRemoteText, " !");
});

test("Versioned private channels send JSON snapshots for all edits, not mislabeled T.140", async () => {
  const app = fixture();
  app.call.rttChannel.protocol = protocol;
  for (const event of ["reset", "edit", "message"]) {
    for (const text of ["Hallo 👋", "123", '{"type":"jingle-rtt-sync"}', "correctie middenin"]) {
      app.sent.length = 0;
      assert.equal(app.send(event, text, { previousText: "Hallo" }), true);
      const packet = JSON.parse(app.sent[0]);
      assert.equal(packet.text, text);
      assert.equal(packet.event, event);
      await app.receive(app.sent[0]);
      assert.equal(event === "message" ? app.finals.at(-1) : app.call.tcRemoteText, text);
    }
  }
});

test("Split CR/LF stays one newline and the T.140 BOM is not displayed", async () => {
  const app = fixture();
  await app.receive("\ufeffHallo\r");
  await app.receive("\n👋");
  assert.equal(app.call.tcRemoteText, "Hallo\n👋");
  await app.receive("\b!");
  assert.equal(app.call.tcRemoteText, "Hallo\n!");
  await app.receive("\r");
  await app.receive(JSON.stringify({ type: "jingle-rtt-sync", namespace,
    sid: app.call.sid, event: "reset", text: "nieuw" }));
  await app.receive("\n");
  assert.equal(app.call.tcRemoteText, "nieuw\n", "A snapshot resets the raw-stream decoder");
});

function channel(overrides = {}) {
  const listeners = new Map();
  return { label: "rtt", protocol, readyState: "open", ordered: true,
    maxRetransmits: null, maxPacketLifeTime: null,
    send() {}, close() { this.readyState = "closed"; this.emit("close"); },
    addEventListener: (event, handler) => listeners.set(event, handler),
    emit: (event, data = {}) => listeners.get(event)?.(data), ...overrides };
}

test("Only known reliable ordered RTT channels are configured", () => {
  for (const settings of [{ protocol: "unknown" }, { ordered: false }, { maxRetransmits: 0 },
    { maxPacketLifeTime: 500 }, { label: "other" }]) {
    const app = fixture();
    const original = app.call.rttChannel;
    const rejected = channel(settings);
    app.configure(rejected);
    assert.equal(rejected.readyState, "closed");
    assert.equal(app.call.rttChannel, original);
  }
  for (const negotiatedProtocol of [protocol, "t140", ""]) {
    const app = fixture();
    app.call.rttChannel = null;
    const accepted = channel({ protocol: negotiatedProtocol });
    app.configure(accepted);
    assert.equal(app.call.rttChannel, accepted);
    assert.equal(app.call.rttNeedsReset, true);
  }
  for (const profile of ["dc-t140", "rtp-t140"]) {
    const app = fixture();
    app.call.rttSync.profile = profile;
    const standardChannel = channel({ protocol: "t140" });
    app.configure(standardChannel);
    assert.equal(standardChannel.readyState, "closed", "Never mistake a standard gateway for the legacy mixed format");
  }
});

test("Closed/replaced channels cannot change current call state or deliver late text", async () => {
  const app = fixture();
  app.call.rttChannel = null;
  const previous = channel();
  app.configure(previous);
  let finish;
  const blob = new Blob(["old"]);
  blob.text = () => new Promise(resolve => { finish = resolve; });
  const pending = app.receive(blob, previous);
  const current = channel();
  app.configure(current);
  finish("old");
  await pending;
  previous.emit("error");
  previous.emit("open");
  assert.equal(app.call.rttSync.state, "connected");
  assert.equal(app.call.tcRemoteText, "");
  app.state.call = { sid: app.call.sid };
  current.emit("close");
  assert.equal(app.call.rttSync.state, "connected", "Even a reused SID cannot revive an ended call");
});

test("Asynchronous RTT decoding retains transport order", async () => {
  const app = fixture();
  app.call.rttChannel = null;
  const incoming = channel({ protocol: "t140" });
  app.configure(incoming);
  let finish;
  const blob = new Blob(["first"]);
  blob.text = () => new Promise(resolve => { finish = resolve; });
  incoming.emit("message", { data: blob });
  incoming.emit("message", { data: " second" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.call.tcRemoteText, "");
  finish("first");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.call.tcRemoteText, "first second");
});

test("RTT status distinguishes co-session text and unavailable text without claiming chat fallback", () => {
  let available = true;
  const context = vm.createContext({ state: {}, t: (key, fallback) => fallback,
    isXmppRttConnected: () => available, isRelayConnected: () => false });
  vm.runInContext(section("function jingleRttSyncStatusText(", "function redactJingleForLog("), context);
  const call = { rttEnabled: true, rttChannel: { readyState: "open" }, rttSync: { state: "connected" } };
  assert.match(context.jingleRttSyncStatusText(call), /live text in this call/);
  call.rttSync.state = "fallback";
  assert.match(context.jingleRttSyncStatusText(call), /unavailable/);
  available = false;
  assert.match(context.jingleRttSyncStatusText(call), /unavailable/);
  call.rttSync.state = "negotiating";
  call.rttChannel.readyState = "connecting";
  assert.match(context.jingleRttSyncStatusText(call), /connecting live text/);
});

test("UTF-8 buffers and blobs take the same non-lossy receiving path", async () => {
  for (const data of [new TextEncoder().encode("123"), new TextEncoder().encode("123").buffer, new Blob(["123"])]) {
    const app = fixture();
    await app.receive(data);
    assert.equal(app.call.tcRemoteText, "123");
  }
});

test("Legacy reset and final envelopes still work; wrong sessions and ended calls do not change text", async () => {
  const app = fixture();
  const packet = { type: "jingle-rtt-sync", namespace, sid: app.call.sid, event: "reset", text: "123" };
  await app.receive(JSON.stringify(packet));
  assert.equal(app.call.tcRemoteText, "123");
  await app.receive(JSON.stringify({ ...packet, sid: "other", text: "wrong" }));
  assert.equal(app.call.tcRemoteText, "123");
  await app.receive(JSON.stringify({ ...packet, event: "message" }));
  assert.deepEqual(app.finals, ["123"]);
  app.state.call = null;
  await app.receive("late text");
  assert.equal(app.call.tcRemoteText, "");
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
  assert.equal(app.call.tcRemoteText, "");
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
    assert.equal(app.call.tcRemoteText, text);
    assert.equal(app.finals.length, 0);
  }
});

test("Failed TC sends preserve the separate draft and recover without sending a chat message", async () => {
  const app = fixture();
  app.call.tcSentText = "Hello";
  app.el.totalConversationLocalText.value = "Hello world";
  app.call.rttChannel.send = () => { throw new Error("Channel closed"); };
  assert.doesNotThrow(() => app.edit());
  assert.deepEqual(app.fallback, []);
  assert.equal(app.call.tcLocalText, "Hello world");
  assert.equal(app.call.rttNeedsReset, true);
  app.call.rttChannel.send = text => app.sent.push(text);
  app.el.totalConversationLocalText.value = "Hello world!";
  app.edit();
  const packet = JSON.parse(app.sent[0]);
  assert.equal(packet.event, "reset");
  assert.equal(packet.text, "Hello world!");
  app.call.tcRemoteText = "stale";
  await app.receive(app.sent[0]);
  assert.equal(app.call.tcRemoteText, "Hello world!");
  assert.equal(app.call.rttNeedsReset, false);
});

test("Closed channels and failed JSON sends also preserve a reset baseline", () => {
  for (const text of ["Plain text", "123"]) {
    const app = fixture();
    app.el.totalConversationLocalText.value = text;
    app.call.rttChannel.readyState = "closed";
    app.edit();
    assert.deepEqual(app.fallback, []);
    assert.equal(app.call.tcLocalText, text);
    assert.equal(app.call.rttNeedsReset, true);
  }
  const app = fixture();
  app.call.rttChannel.send = () => { throw new Error("Channel closed"); };
  assert.equal(app.send("reset", "123"), false);
  assert.equal(app.call.rttNeedsReset, true);
});
