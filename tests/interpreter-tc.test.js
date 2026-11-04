const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../php/public/chat-interpreter.js"), "utf8");
const anchor = "    return {\n      hasMedia:";
const normalized = source.replace(/\r\n/g, "\n");
assert.ok(normalized.includes(anchor));

function fixture() {
  const nodes = new Map();
  const call = { sid: "first", peer: "peer@test", rttEnabled: true, tcLocalText: "", tcComposing: false };
  const state = { call };
  const context = {
    TextEncoder, setTimeout, clearTimeout, setInterval() {},
    document: { getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, Object.assign(new EventTarget(), {
        classList: { add() {}, remove() {} }, getTracks: () => [], setAttribute() {}, hidden: true
      }));
      return nodes.get(id);
    } },
    addEventListener() {}
  };
  context.window = context;
  vm.runInNewContext(normalized.replace(anchor, `
    window.fixtureControl = {
      configure(connection, consent = true) {
        accountId = "self";
        room = { room_id: "room", call_id: "first", requester: "self", peer_jid: "peer@test", status: "active" };
        joined = consent; agreed = consent ? "room" : ""; attachChannel(connection);
      },
      revoke() { joined = false; agreed = ""; },
      dispose
    };
${anchor}`), context);
  const interpreter = context.TeleTypTelInterpreter.create({
    selectedPeer: () => state.call?.peer, getCall: () => state.call, startCall() {},
    selfJid: () => "self@test", conversationPeer: () => state.call?.peer,
    mediaChanged() {}, translate: (key, fallback) => fallback
  });
  const packets = [];
  const channel = { label: "teletyptel-rtt", readyState: "open", bufferedAmount: 0,
    send: text => packets.push(JSON.parse(text)), close() { this.readyState = "closed"; } };
  context.fixtureControl.configure(channel);
  return { state, call, interpreter, channel, packets, nodes, control: context.fixtureControl };
}

test("TC interpreter text requires current call, joined consent and completed composition", () => {
  const app = fixture();
  app.control.configure(app.channel, false);
  app.interpreter.liveText("first", "Not consented");
  assert.equal(app.packets.length, 0);
  app.control.configure(app.channel);
  app.interpreter.liveText("old-call", "Wrong call");
  app.call.tcComposing = true;
  app.interpreter.liveText("first", "に");
  assert.equal(app.packets.length, 0);
  app.call.tcComposing = false;
  app.interpreter.liveText("first", "日本語 👋");
  assert.deepEqual(app.packets, [{ type: "rtt", text: "日本語 👋" }]);
  app.interpreter.final("Private chat");
  assert.equal(app.packets.length, 1);
});

test("Interpreter buffer recovery forwards only the newest complete 20,000-character snapshot", () => {
  const app = fixture();
  app.channel.bufferedAmount = 262144;
  app.interpreter.liveText("first", "Old pending");
  const text = "漢".repeat(20000);
  app.interpreter.liveText("first", text);
  assert.equal(app.packets.length, 0);
  app.channel.bufferedAmount = 0;
  app.channel.onbufferedamountlow();
  assert.deepEqual(app.packets, [{ type: "rtt", text }]);
  app.interpreter.liveText("first", "x".repeat(20001));
  assert.equal(app.packets.length, 1);
  app.interpreter.liveText("first", "");
  assert.equal(app.packets.at(-1).text, "");
});

test("Revoked, ended and replaced interpreter sessions never replay pending or late text", () => {
  for (const action of [app => app.control.revoke(), app => app.control.dispose(),
    app => { app.state.call = { ...app.call, sid: "second" }; }]) {
    const app = fixture();
    app.channel.bufferedAmount = 262144;
    app.interpreter.liveText("first", "Sensitive pending text");
    action(app);
    app.channel.bufferedAmount = 0;
    app.channel.onbufferedamountlow();
    app.channel.onmessage({ data: JSON.stringify({ type: "rtt", text: "Late text" }) });
    assert.equal(app.packets.length, 0);
    assert.notEqual(app.nodes.get("interpreterText").textContent, "Late text");
  }
});

test("An interpreter joining an active TC call receives its committed text on channel open", () => {
  const app = fixture();
  app.call.tcLocalText = "Already typing";
  app.channel.onopen();
  assert.equal(app.packets.at(-1).text, "Already typing");
  app.call.tcComposing = true;
  app.call.tcLocalText = "Uncommitted";
  app.channel.onopen();
  assert.equal(app.packets.length, 1);
});
