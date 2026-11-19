const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient, safeState, install, secureID } = require("../mobile/ios-hybrid/Web/native-session");

const state = (sequence = 1, phase = "idle", errorCode) => ({ version: 1, sequence, phase, errorCode,
  chatAvailable: false, callsAvailable: false, socialLoginAvailable: false });
const reply = (body, snapshot = state()) => ({ version: 1, id: JSON.parse(body).id.toLowerCase(), snapshot });
const client = postMessage => createClient({ postMessage, makeID: crypto.randomUUID });

test("custom-scheme documents can generate secure UUIDs without randomUUID", () => {
  const values = new Set();
  for (let index = 0; index < 50; index += 1) {
    const value = secureID({ getRandomValues: bytes => crypto.getRandomValues(bytes) });
    assert.match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    values.add(value);
  }
  assert.equal(values.size, 50);
  assert.throws(() => secureID({}), /nativeUnavailable/);
});

test("hybrid login sends only the versioned command and consumes safe state", async () => {
  const commands = [];
  const session = client(body => { commands.push(JSON.parse(body)); return reply(body, state(1, "checking")); });
  assert.equal((await session.login("fixture@localhost", "fixture-private-password")).phase, "checking");
  assert.deepEqual(commands[0].arguments, { jid: "fixture@localhost", password: "fixture-private-password" });
  assert.equal(commands[0].command, "session.login");
  assert.deepEqual(Object.keys(commands[0]).sort(), ["arguments", "command", "id", "version"]);
  const received = [];
  session.subscribe(value => received.push(value));
  session.receive(state(3, "connected"));
  session.receive(state(2, "authenticating"));
  session.receive(state(3, "checking"));
  assert.deepEqual(received.map(value => value.phase), ["checking", "connected"]);
  assert.ok(Object.isFrozen(received[1]));
  assert.equal(JSON.stringify(received).includes("fixture-private-password"), false);
  session.dispose();
});

test("invalid inputs never cross the native boundary", async () => {
  let calls = 0;
  const session = client(body => { calls += 1; return reply(body); });
  for (const [jid, password] of [["", "secret"], ["fixture@localhost", ""], ["fixture@localhost", "x".repeat(1025)], ["fixture\n@localhost", "secret"], ["fixture@localhost", "\0"], [null, "secret"]]) {
    await assert.rejects(session.login(jid, password), /invalidRequest/);
  }
  for (const code of [123456, "12345", "１２３４５６", "1234567"]) await assert.rejects(session.verifySecondFactor(code), /invalidRequest/);
  assert.equal(calls, 0);
  session.dispose();
});

test("unexpected replies and leaked credentials are rejected", async () => {
  for (const mutate of [
    value => ({ ...value, id: crypto.randomUUID() }),
    value => ({ ...value, extra: "unexpected" }),
    value => ({ ...value, snapshot: { ...value.snapshot, token: "secret" } }),
    value => ({ ...value, snapshot: { ...value.snapshot, callsAvailable: true } }),
    value => ({ ...value, snapshot: { ...value.snapshot, phase: "failed" } }),
    value => ({ ...value, snapshot: { ...value.snapshot, sequence: -1 } })
  ]) {
    const session = client(body => mutate(reply(body)));
    await assert.rejects(session.snapshot(), /invalidNativeReply/);
    session.dispose();
  }
  assert.throws(() => safeState({ ...state(), errorCode: "password=secret" }), /invalidNativeReply/);
});

test("native failures are redacted and there is no browser fallback", async () => {
  for (const [failure, expected] of [[new Error("sessionBusy"), "sessionBusy"], ["untrustedDocument", "untrustedDocument"], [new Error("cookie=private server details"), "nativeUnavailable"]]) {
    const session = client(() => Promise.reject(failure));
    await assert.rejects(session.snapshot(), error => error.message === expected);
    session.dispose();
  }
});

test("second-factor retry state is compact and does not expose raw native errors", () => {
  assert.equal(safeState(state(2, "awaitingSecondFactor", "invalidSecondFactor")).errorCode, "invalidSecondFactor");
  assert.throws(() => safeState(state(2, "connected", "invalidSecondFactor")), /invalidNativeReply/);
  assert.throws(() => safeState(state(2, "failed", "invalidSecondFactor")), /invalidNativeReply/);
  assert.throws(() => safeState(state(2, "awaitingSecondFactor", "invalidCredentials")), /invalidNativeReply/);
});

test("timeouts disposal and pending limits ignore late native replies", async () => {
  let expire;
  let resolveNative;
  const session = createClient({ postMessage: () => new Promise(resolve => { resolveNative = resolve; }),
    makeID: crypto.randomUUID, setTimer: callback => { expire = callback; return 1; }, clearTimer: () => {} });
  const pending = session.snapshot();
  await Promise.resolve();
  expire();
  await assert.rejects(pending, /bridgeTimeout/);
  resolveNative({ version: 1, id: crypto.randomUUID(), snapshot: state(10, "connected") });
  session.dispose();
  await assert.rejects(session.snapshot(), /bridgeClosed/);
  const busy = client(() => new Promise(() => {}));
  const requests = Array.from({ length: 8 }, () => assert.rejects(busy.snapshot(), /bridgeClosed/));
  await assert.rejects(busy.snapshot(), /bridgeBusy/);
  busy.dispose();
  await Promise.all(requests);
});

function fakeWindow(href = "capacitor://localhost/chat.html") {
  const listeners = new Map();
  const fetched = [];
  const windowValue = { location: { href }, navigator: { mediaDevices: { getUserMedia() {}, getDisplayMedia() {} } },
    crypto, fetch: async address => { fetched.push(address); return "static-asset"; },
    webkit: { messageHandlers: { teletyptelNative: { postMessage: body => Promise.resolve(reply(body)) } } },
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name) };
  windowValue.top = windowValue;
  return { windowValue, listeners, fetched };
}

test("normal browsers remote documents and subframes are left untouched", () => {
  for (const href of ["https://localhost/chat.html", "https://dev.teletyptel.nl/chat.html", "capacitor://localhost/chat.html?x=1", "capacitor://localhost/admin.html"]) {
    const { windowValue } = fakeWindow(href);
    assert.throws(() => install(windowValue), /untrustedDocument/);
    assert.equal(Object.hasOwn(windowValue, "WebSocket"), false);
  }
  const { windowValue } = fakeWindow();
  windowValue.top = {};
  assert.throws(() => install(windowValue), /untrustedDocument/);
});

test("hybrid documents cannot start browser signaling media or auth", async () => {
  const { windowValue, fetched, listeners } = fakeWindow();
  const session = install(windowValue);
  for (const name of ["WebSocket", "RTCPeerConnection", "webkitRTCPeerConnection", "XMLHttpRequest", "EventSource"]) {
    assert.throws(() => new windowValue[name](), /nativeEngineRequired/);
    assert.equal(Object.getOwnPropertyDescriptor(windowValue, name).writable, false);
  }
  assert.throws(() => windowValue.navigator.mediaDevices.getUserMedia(), /nativeEngineRequired/);
  assert.throws(() => windowValue.navigator.sendBeacon(), /nativeEngineRequired/);
  for (const address of ["https://dev.teletyptel.nl/api/auth/login", "/api/auth/login", "/assets/../api/auth/login", "/lang/ned.lng?redirect=remote"]) {
    await assert.rejects(windowValue.fetch(address), /nativeEngineRequired/);
  }
  await assert.rejects(windowValue.fetch("/lang/ned.lng", { method: "POST" }), /nativeEngineRequired/);
  assert.equal(await windowValue.fetch("/lang/ned.lng"), "static-asset");
  assert.deepEqual(fetched, ["/lang/ned.lng"]);
  assert.equal((await session.snapshot()).phase, "idle");
  assert.throws(() => install(windowValue), /bridgeAlreadyInstalled/);
  listeners.get("pagehide")();
  assert.equal(listeners.has("teletyptel:native-state"), false);
  await assert.rejects(session.snapshot(), /bridgeClosed/);
});
