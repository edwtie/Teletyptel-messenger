const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { TextEncoder, TextDecoder, ArrayBuffer };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../php/public/jingle-t140.js"), "utf8"), sandbox);
const api = sandbox.TeleTypTelT140;

class Channel extends EventTarget {
  constructor(properties = {}) {
    super();
    Object.assign(this, { label: "rtt", protocol: "t140", negotiated: true, id: 0,
      ordered: true, maxRetransmits: null, maxPacketLifeTime: null,
      readyState: "open", bufferedAmount: 0, sent: [], closed: false }, properties);
  }
  send(bytes) {
    if (this.fail) throw new Error("Fixture send failed");
    this.sent.push(new Uint8Array(bytes));
  }
  close() { this.closed = true; this.readyState = "closed"; }
  receive(data) {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: data });
    this.dispatchEvent(event);
  }
}

test("Only the explicitly negotiated, reliable and ordered T.140 channel is allowed", () => {
  for (const changed of [{ protocol: "teletyptel-rtt-json-v1" }, { ordered: false }, { negotiated: false },
    { label: "other" }, { id: 1 }, { maxRetransmits: 0 }, { maxPacketLifeTime: 100 }]) {
    const channel = new Channel(changed);
    assert.throws(() => api.create(channel), /negotiated reliable/);
    assert.equal(channel.closed, true);
  }
});

test("UTF-8 blocks preserve literal JSON, Unicode, backspace and split CR/LF without envelopes", () => {
  const channel = new Channel(), texts = [];
  api.create(channel, { onText: event => texts.push(event.text) });
  channel.receive(new TextEncoder().encode('{"event":"reset"} 👋').buffer);
  channel.receive("\b🌍\r");
  channel.receive("\ufeff\nمرحبا\u2028Café");
  assert.equal(texts.at(-1), '{"event":"reset"} 🌍\nمرحبا\nCafé');
});

test("Snapshot edits produce plain T.140 bytes and keep sender/receiver text consistent", () => {
  const left = new Channel(), right = new Channel(), texts = [];
  const sender = api.create(left);
  api.create(right, { onText: event => texts.push(event.text) });
  for (const text of ["abc 👋", "ab🌍", "abc\r\nvolgende", "", '{"text":"geen reset"}']) {
    assert.equal(sender.setText(text), true);
    right.receive(left.sent.at(-1).buffer);
    assert.equal(texts.at(-1), text.replace(/\r\n/g, "\n"));
  }
  assert.equal(new TextDecoder().decode(left.sent[1]), "\b\b\b🌍");
});

test("Backpressure and send errors cannot advance the outgoing edit baseline", () => {
  const channel = new Channel(), sender = api.create(channel);
  assert.equal(sender.setText("oud"), true);
  channel.bufferedAmount = 65536;
  assert.equal(sender.setText("nieuw"), false);
  channel.bufferedAmount = 0;
  channel.fail = true;
  assert.equal(sender.setText("nieuw"), false);
  channel.fail = false;
  assert.equal(sender.setText("nu"), true);
  assert.equal(new TextDecoder().decode(channel.sent.at(-1)), "\b\b\bnu");
  assert.equal(sender.setText("x".repeat(5000)), false);
  assert.equal(sender.setText("\ud800"), false);
  assert.equal(sender.sendBlock("\udc00"), false);
});

test("Malformed UTF-8, oversized blocks and binary type mismatches close only RTT", () => {
  for (const data of [new Uint8Array([0xc3]).buffer, "x".repeat(4097), "\ud800", { text: "bad" }]) {
    const channel = new Channel(), states = [], texts = [];
    api.create(channel, { onStatus: state => states.push(state), onText: value => texts.push(value) });
    channel.receive(data);
    assert.equal(channel.closed, true);
    assert.deepEqual(states, ["invalid-text"]);
    assert.equal(texts.length, 0);
  }
});

test("Receiver memory is bounded and loss is reported rather than silently truncating", () => {
  const channel = new Channel(), states = [];
  let latest = "";
  api.create(channel, { onStatus: state => states.push(state), onText: event => { latest = event.text; } });
  for (let index = 0; index < 8; index += 1) channel.receive("x".repeat(4096));
  assert.equal(latest.length, 32768);
  channel.receive("x");
  assert.equal(latest.length, 32768);
  assert.equal(channel.closed, true);
  assert.deepEqual(states, ["invalid-text"]);
});

test("Closed or replaced sessions cannot deliver late RTT or replay buffered edits", () => {
  const channel = new Channel(), events = [];
  let current = true;
  const stream = api.create(channel, { isCurrent: () => current, onText: event => events.push(event) });
  current = false;
  channel.receive("late");
  assert.equal(stream.setText("late"), false);
  current = true;
  stream.close();
  channel.receive("later");
  assert.equal(stream.sendBlock("later"), false);
  assert.equal(events.length, 0);
});

test("Channel closure reports text unavailable without claiming delivery or reconnecting", () => {
  const channel = new Channel(), states = [];
  const stream = api.create(channel, { onStatus: state => states.push(state) });
  channel.dispatchEvent(new Event("open"));
  channel.dispatchEvent(new Event("close"));
  assert.deepEqual(states, ["open", "unavailable"]);
  assert.equal(stream.setText("retry"), false);
  assert.equal(channel.sent.length, 0);
});
