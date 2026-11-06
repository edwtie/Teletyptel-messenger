const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "php/public/chat-client.js"), "utf8");
const helpers = client.slice(client.indexOf("  function stopIncomingCallHaptics()"),
  client.indexOf("  function showIncomingCallBrowserNotification(call)"));
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };

function fixture() {
  let clock = 1000;
  let nextTimer = 0;
  let blocked = false;
  const muted = new Set();
  const timers = new Map();
  const pulses = [];
  const call = { sid: "fixture-call", peer: "caller@example.test", incomingOffer: "fixture-sdp" };
  const state = { call, incomingCallHapticTimer: null, incomingCallHapticCall: null };
  const plugin = { pulse: async value => { pulses.push(value.sid); return { requested: true }; } };
  const context = vm.createContext({
    state, Promise, Date: { now: () => clock },
    document: { visibilityState: "visible" },
    window: {
      location: { protocol: "capacitor:", hostname: "localhost", pathname: "/chat.html" },
      Capacitor: { Plugins: { TeleTypTelIncomingCall: plugin } },
      setInterval: (callback, delay) => {
        assert.equal(delay, 3000);
        const timer = ++nextTimer;
        timers.set(timer, callback);
        return timer;
      },
      clearInterval: timer => timers.delete(timer)
    },
    isBlockedPeer: () => blocked,
    isNotificationMutedPeer: peer => muted.has(peer)
  });
  vm.runInContext(helpers, context);
  return { context, state, call, plugin, pulses, timers, muted,
    block: () => { blocked = true; },
    update: () => context.updateIncomingCallHaptics(),
    tick: async (advance = 3000) => {
      clock += advance;
      for (const callback of [...timers.values()]) callback();
      await settle();
    }
  };
}

test("Incoming call pulses immediately and every three seconds without duplicate render timers", async () => {
  const setup = fixture();
  setup.update();
  await settle();
  setup.update();
  setup.update();
  assert.equal(setup.pulses.length, 1);
  assert.equal(setup.timers.size, 1);
  await setup.tick();
  assert.equal(setup.pulses.length, 2);
});

test("Outgoing, answered, cleaning, muted, blocked, hidden and logged-out states do not vibrate", () => {
  const suppressors = [
    setup => { setup.call.incomingOffer = null; },
    setup => { setup.call.answerInProgress = true; },
    setup => { setup.call.cleaningUp = true; },
    setup => { setup.state.doNotDisturb = true; },
    setup => { setup.state.logoutInProgress = true; },
    setup => setup.block(),
    setup => setup.muted.add(setup.call.peer),
    setup => { setup.call.roomJid = "group@example.test"; setup.muted.add(setup.call.roomJid); },
    setup => { setup.context.document.visibilityState = "hidden"; },
    setup => { setup.state.call = null; }
  ];
  for (const suppress of suppressors) {
    const setup = fixture();
    suppress(setup);
    setup.update();
    assert.equal(setup.pulses.length, 0);
    assert.equal(setup.timers.size, 0);
  }
});

test("Browser, foreign origin, other app pages and older builds are no-ops", () => {
  for (const change of [
    setup => { setup.context.window.location.protocol = "https:"; },
    setup => { setup.context.window.location.hostname = "foreign.test"; },
    setup => { setup.context.window.location.pathname = "/index.html"; },
    setup => { delete setup.context.window.Capacitor; }
  ]) {
    const setup = fixture();
    change(setup);
    setup.update();
    assert.equal(setup.pulses.length, 0);
    assert.equal(setup.timers.size, 0);
  }
});

test("Answer, decline/cleanup, DND and peer mute stop subsequent pulses", async () => {
  for (const stop of [
    setup => { setup.call.answerInProgress = true; },
    setup => { setup.state.call = null; },
    setup => { setup.call.cleaningUp = true; },
    setup => { setup.state.doNotDisturb = true; },
    setup => setup.muted.add(setup.call.peer)
  ]) {
    const setup = fixture();
    setup.update();
    await settle();
    stop(setup);
    await setup.tick();
    assert.equal(setup.pulses.length, 1);
    assert.equal(setup.timers.size, 0);
  }
});

test("A stale ring stops after sixty seconds and rerenders do not restart it", async () => {
  const setup = fixture();
  setup.update();
  await settle();
  await setup.tick(60000);
  setup.update();
  assert.equal(setup.pulses.length, 1);
  assert.equal(setup.timers.size, 0);
});

test("Hiding stops pulses; return resumes only an unexpired incoming call", async () => {
  const setup = fixture();
  setup.update();
  await settle();
  setup.context.document.visibilityState = "hidden";
  setup.update();
  assert.equal(setup.timers.size, 0);
  await setup.tick();
  setup.context.document.visibilityState = "visible";
  setup.update();
  await settle();
  assert.equal(setup.pulses.length, 2);
  setup.context.stopIncomingCallHaptics();
  await setup.tick();
  assert.equal(setup.pulses.length, 2);
});

test("A second call replaces the first; stale timers cannot ring or stop the second", async () => {
  const setup = fixture();
  setup.update();
  await settle();
  const stale = [...setup.timers.values()][0];
  setup.state.call = { ...setup.call, sid: "second-call", hapticStartedAt: undefined };
  setup.update();
  await settle();
  stale();
  assert.deepEqual(setup.pulses, ["fixture-call", "second-call"]);
  assert.equal(setup.timers.size, 1);
});

test("Unsupported hardware or bridge failures stop safely without retry storms", async () => {
  for (const pulse of [
    async () => ({ requested: false, reason: "UNSUPPORTED_DEVICE" }),
    async () => { throw new Error("fixture rejection"); },
    () => { throw new Error("fixture synchronous rejection"); }
  ]) {
    const setup = fixture();
    setup.plugin.pulse = pulse;
    setup.update();
    await settle();
    setup.update();
    assert.equal(setup.call.hapticsUnavailable, true);
    assert.equal(setup.timers.size, 0);
  }
});

test("A pending native response cannot queue pulses or stop a later call on rejection", async () => {
  const setup = fixture();
  let rejectFirst;
  setup.plugin.pulse = () => new Promise((resolve, reject) => { rejectFirst = reject; });
  setup.update();
  const originalReject = rejectFirst;
  await setup.tick();
  assert.equal(rejectFirst, originalReject);
  setup.state.call = { sid: "second", peer: setup.call.peer, incomingOffer: "fixture" };
  setup.plugin.pulse = async () => ({ requested: true });
  setup.update();
  originalReject(new Error("old request"));
  await settle();
  assert.equal(setup.state.incomingCallHapticCall.sid, "second");
  assert.equal(setup.timers.size, 1);
});

test("Native plugin and build wiring enforce foreground, origin, hardware and rate guards", () => {
  const native = fs.readFileSync(path.join(root, "scripts/ios-testflight/IncomingCallPlugin.swift"), "utf8");
  const controller = fs.readFileSync(path.join(root, "scripts/ios-testflight/LanViewController.swift"), "utf8");
  const prepare = fs.readFileSync(path.join(root, "scripts/ios-testflight/prepare.js"), "utf8");
  assert.match(native, /isBundledMessenger\(self.bridge\?\.webView\?\.url\)/);
  assert.match(native, /UIApplication.shared.applicationState == \.active/);
  assert.match(native, /UIDevice.current.userInterfaceIdiom == \.phone/);
  assert.match(native, /!biometrics.enabled \|\| biometrics.unlocked/);
  assert.match(native, /now - self.lastPulseAt >= 2.5/);
  assert.match(native, /AudioServicesPlaySystemSound\(kSystemSoundID_Vibrate\)/);
  assert.match(controller, /registerPluginInstance\(TeleTypTelIncomingCallPlugin\(\)\)/);
  assert.match(prepare, /fs.readFileSync\(path.join\(__dirname, "IncomingCallPlugin.swift"\)/);
  assert.match(client, /call.answerInProgress = true;\s*stopIncomingCallHaptics\(\);/);
  assert.match(client, /function closeIncomingCallBrowserNotification\(\) \{\s*stopIncomingCallHaptics\(\);/);
  assert.match(client, /window.addEventListener\("pagehide", stopIncomingCallHaptics\)/);
  assert.match(client, /updateIncomingCallHaptics\(\);\s*el.answerCallButton.hidden/);
});
