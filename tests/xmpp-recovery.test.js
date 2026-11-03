const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(`  function ${start}(`), source.indexOf(`  function ${end}(`));

function fixture() {
  let sequence = 0;
  const timers = new Map();
  const sockets = [];
  const sent = [];
  const statuses = [];
  const availability = [];
  let jingleResets = 0;
  class Socket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor() { this.readyState = 0; this.listeners = {}; sockets.push(this); }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name, value = {}) { this.listeners[name]?.(value); }
    close() { this.readyState = 3; }
    send(value) { sent.push(value); }
  }
  const state = {
    mode: "xmpp", accountReady: true, accountGateRequired: false, intentionalDisconnect: false,
    xmppSocket: null, xmppSession: null, conversations: [], call: null,
    clientLifecycle: { transientReconnectTimer: null, current: "active" },
    xmppRecovery: { attempts: 0, connectionTimer: null, pingTimer: null, ping: null },
    websocketHeartbeat: { xmppTimer: null }, xmppPresenceSubscriptionRequests: new Set()
  };
  const elements = { xmppUrlInput: { value: "wss://example.test/xmpp" }, messageInput: { value: "Unsent draft" } };
  const context = vm.createContext({
    state, WebSocket: Socket, navigator: { onLine: true }, document: { visibilityState: "visible" },
    window: {
      setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
      clearTimeout(id) { timers.delete(id); },
      setInterval(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
      clearInterval(id) { timers.delete(id); }
    },
    el: new Proxy(elements, { get(target, key) { return target[key] ??= {}; } }),
    websocketHeartbeatMs: 25000,
    t: (key, fallback) => fallback,
    xmppAvailability: {
      connecting: () => availability.push("checking"), ready: () => availability.push("ready"), hide: () => availability.push("hidden"),
      unavailable: retry => { availability.push("offline"); context.retryAvailability = retry; }
    },
    appendDebug() {}, setConnectionStatus: text => statuses.push(text),
    setMode: mode => { state.mode = mode; },
    normalizeLocalXmppWebSocketUrlForCurrentHost: value => value,
    normalizeXmppWebSocketUrl: value => value,
    createXmppSession: () => ({ domain: "example.test", phase: "opening", streamManagement: {} }),
    createMessageId: () => "ping-" + (++sequence),
    bareJid: value => value.split("/")[0],
    escapeXml: value => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"),
    sendXmppStanza: value => { sent.push(value); return true; },
    sendXmppRaw: value => { sent.push(value); return true; },
    xmppTranslation: { disconnect() {} }, messageTranslation: { clearLive() {} },
    jingleSessions: { reset() { jingleResets++; } },
    WeakMap,
    returnToLoginScreenAfterDisconnect() { state.intentionalDisconnect = true; state.accountReady = false; },
    setAllContactPresence() {}, updateComposerAvailability() {}, updateConnectButtonAvailability() {},
    setDefaultComposerState() {}, sendXmppOpenFrame() {}, flushClientLifecycleState() {},
    handleXmppIncomingFrame() {}, sendPresence() {}, requestXmppRoster() {},
    syncXmppContactPresenceSubscriptions() {}, joinActiveXmppGroupConversation() {}, syncXmppMamArchive() {}
  });
  vm.runInContext("let xmppRttStates;" + source.slice(source.indexOf("  function showXmppServerUnavailable("), source.indexOf("  async function loadPlatformConfig()"))
    + section("canRecoverXmppConnection", "connectRelay")
    + section("connectXmppWebSocket", "normalizeXmppWebSocketUrl")
    + section("finishXmppReady", "syncXmppContactPresenceSubscriptions")
    + section("closeXmppWebSocket", "handleXmppIncomingFrame"), context);
  const run = expression => vm.runInContext(expression, context);
  const fire = id => { const timer = timers.get(id); assert.ok(timer, `Missing timer ${id}`); timers.delete(id); timer.callback(); };
  const ready = () => {
    run("connectXmppWebSocket()");
    const socket = state.xmppSocket;
    socket.readyState = Socket.OPEN;
    state.xmppSession.phase = "binding";
    state.xmppSession.authenticated = true;
    run("finishXmppReady()");
    return socket;
  };
  return { state, context, timers, sockets, sent, statuses, availability, elements, run, fire, ready,
    jingleResets: () => jingleResets };
}

test("Chat stays gated until actual XMPP readiness and returns to offline screen on transport loss", () => {
  const app = fixture();
  app.run("connectXmppWebSocket()");
  const socket = app.state.xmppSocket;
  assert.deepEqual(app.availability, ["checking"]);
  socket.readyState = 1;
  socket.emit("open");
  assert.deepEqual(app.availability, ["checking"]);
  app.state.xmppSession.authenticated = true;
  app.run("finishXmppReady()");
  assert.equal(app.availability.at(-1), "ready");
  socket.emit("close", { code: 1006 });
  assert.equal(app.jingleResets(), 1);
  assert.equal(app.availability.at(-1), "offline");
  assert.match(app.statuses.at(-1), /offline or unreachable/);
  assert.equal(app.elements.messageInput.value, "Unsent draft");
  app.context.retryAvailability();
  assert.equal(app.timers.get(app.state.clientLifecycle.transientReconnectTimer).delay, 0);
});

test("A running call keeps its controls accessible when signalling is temporarily offline", () => {
  const app = fixture();
  const socket = app.ready();
  app.state.call = { id: "ongoing-call" };
  socket.emit("close", { code: 1006 });
  assert.notEqual(app.availability.at(-1), "offline");
  assert.match(app.statuses.at(-1), /offline or unreachable/);
});

function iq(type, id, from = "example.test", ping = false) {
  return { getAttribute: key => ({ type, id, from })[key] ?? null,
    children: ping ? [{ localName: "ping", namespaceURI: "urn:xmpp:ping" }] : [] };
}

test("Ordinary chat reconnects without logging out or erasing its draft, with bounded backoff", () => {
  const app = fixture();
  const socket = app.ready();
  socket.emit("close", { code: 1006 });
  assert.equal(app.state.accountReady, true);
  assert.equal(app.elements.messageInput.value, "Unsent draft");
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    const timer = app.state.clientLifecycle.transientReconnectTimer;
    assert.equal(app.timers.get(timer).delay, delay);
    app.fire(timer);
    app.state.xmppSocket.emit("close", { code: 1006 });
  }
  app.fire(app.state.clientLifecycle.transientReconnectTimer);
  app.state.xmppSocket.readyState = 1;
  app.state.xmppSession.phase = "binding";
  app.run("finishXmppReady()");
  assert.equal(app.state.xmppRecovery.attempts, 0);
  assert.equal(app.statuses.at(-1), "XMPP connected");
});

test("Offline or suspended apps wait and reconnect once on return", () => {
  for (const background of [false, true]) {
    const app = fixture();
    const socket = app.ready();
    if (background) app.context.document.visibilityState = "hidden";
    else app.context.navigator.onLine = false;
    socket.emit("close", { code: 1006 });
    assert.equal(app.state.clientLifecycle.transientReconnectTimer, null);
    app.context.document.visibilityState = "visible";
    app.context.navigator.onLine = true;
    app.run('recoverXmppConnection("return")');
    app.fire(app.state.clientLifecycle.transientReconnectTimer);
    app.run('recoverXmppConnection("second-return"); connectXmppWebSocket()');
    assert.equal(app.sockets.length, 2);
    assert.equal(app.state.accountReady, true);
  }
});

test("Old socket events cannot disconnect or corrupt its replacement", () => {
  const app = fixture();
  const old = app.ready();
  old.emit("error");
  app.fire(app.state.clientLifecycle.transientReconnectTimer);
  const replacement = app.state.xmppSocket;
  old.emit("close", { code: 1008 });
  old.emit("error");
  old.emit("message", { data: "<failure/>" });
  assert.equal(app.state.xmppSocket, replacement);
  assert.equal(app.state.accountReady, true);
  assert.equal(app.state.clientLifecycle.transientReconnectTimer, null);
});

test("Stalled handshakes and unanswered pings recover; matching results or errors keep the socket", () => {
  const app = fixture();
  app.run("connectXmppWebSocket()");
  app.fire(app.state.xmppRecovery.connectionTimer);
  assert.ok(app.state.clientLifecycle.transientReconnectTimer);
  app.fire(app.state.clientLifecycle.transientReconnectTimer);
  app.state.xmppSocket.readyState = 1;
  app.state.xmppSession.phase = "binding";
  app.run("finishXmppReady()");
  for (const type of ["result", "error"]) {
    app.run("sendXmppHeartbeat()");
    const pending = app.state.xmppRecovery.ping;
    app.context.reply = iq(type, pending.id, "other@example.test");
    assert.equal(app.run("handleXmppPing(reply)"), false);
    app.context.reply = iq(type, pending.id);
    assert.equal(app.run("handleXmppPing(reply)"), true);
    assert.equal(app.state.xmppRecovery.ping, null);
  }
  app.run("sendXmppHeartbeat()");
  app.fire(app.state.xmppRecovery.pingTimer);
  assert.equal(app.state.xmppSocket, null);
  assert.ok(app.state.clientLifecycle.transientReconnectTimer);
});

test("Server pings receive an addressed IQ result, never a chat message", () => {
  const app = fixture();
  app.ready();
  app.context.request = iq("get", 'server-"1', "example.test", true);
  assert.equal(app.run("handleXmppPing(request)"), true);
  assert.equal(app.sent.at(-1), '<iq xmlns="jabber:client" type="result" id="server-&quot;1" to="example.test"/>');
});

test("Foreground entry starts a fresh ping, and background timeout does not force logout", () => {
  const app = fixture();
  app.ready();
  app.run("sendXmppHeartbeat()");
  app.context.document.visibilityState = "hidden";
  app.fire(app.state.xmppRecovery.pingTimer);
  assert.ok(app.state.xmppSocket);
  app.context.document.visibilityState = "visible";
  app.run('recoverXmppConnection("foreground")');
  assert.ok(app.state.xmppRecovery.ping);
});

test("Explicit disconnect, rejected sessions and account gates never auto-reconnect", () => {
  const app = fixture();
  const socket = app.ready();
  app.run("closeXmppWebSocket()");
  socket.emit("close", { code: 1000 });
  app.run('recoverXmppConnection("foreground")');
  assert.equal(app.state.clientLifecycle.transientReconnectTimer, null);
  assert.equal(app.state.xmppRecovery.connectionTimer, null);
  assert.equal(app.state.xmppRecovery.pingTimer, null);
  const denied = fixture();
  denied.ready().emit("close", { code: 1008 });
  assert.equal(denied.state.accountReady, false);
  assert.equal(denied.state.clientLifecycle.transientReconnectTimer, null);
  const gated = fixture();
  gated.state.accountGateRequired = true;
  assert.equal(gated.run('scheduleXmppReconnect("network")'), false);
});

test("Authentication and terminal stream failures still require sign-in", () => {
  for (const condition of ["sasl", "conflict", "not-authorized", "policy-violation"]) {
    const app = fixture();
    app.ready();
    const streamError = { getElementsByTagNameNS: (namespace, name) => name === condition ? [{}] : [] };
    const doc = {
      querySelector: () => null,
      getElementsByTagNameNS(namespace, name) {
        if (name === "failure" && condition === "sasl") return [{ textContent: "not-authorized" }];
        if (name === "error" && condition !== "sasl") return [streamError];
        return [];
      }
    };
    Object.assign(app.context, {
      DOMParser: class { parseFromString() { return doc; } },
      trackIncomingXmppStanzas() {}, handleXmppStreamManagement() {}, handleXmppMamFin() {},
      refreshDatabaseAccountAfterXmppAuthFailure: () => false
    });
    vm.runInContext(section("handleXmppSessionFrame", "handleXmppMamFin"), app.context);
    app.run('handleXmppSessionFrame("failure-fixture")');
    assert.equal(app.state.accountReady, false, condition);
    assert.equal(app.state.clientLifecycle.transientReconnectTimer, null, condition);
  }
});

test("A queued reconnect cannot undo logout or a newly required account gate", () => {
  for (const gate of [false, true]) {
    const app = fixture();
    app.ready().emit("close", { code: 1006 });
    if (gate) app.state.accountGateRequired = true;
    else app.state.intentionalDisconnect = true;
    app.fire(app.state.clientLifecycle.transientReconnectTimer);
    assert.equal(app.sockets.length, 1);
  }
});
