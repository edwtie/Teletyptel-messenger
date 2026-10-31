const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const script = fs.readFileSync(path.join(__dirname, "../scripts/ios-testflight/www/native-keyboard.js"), "utf8");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");

function fixture(native = true) {
  const window = new EventTarget();
  const orientation = Object.assign(new EventTarget(), { type: "portrait-primary" });
  Object.assign(window, { innerWidth: 390, innerHeight: 844,
    screen: { width: 390, height: 844, orientation },
    visualViewport: { width: 390, height: 844, offsetTop: 0, scale: 1 },
    Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => native } });
  const classes = new Set();
  const document = { activeElement: { matches: () => true }, documentElement: {},
    body: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } } };
  const context = vm.createContext({ window, document, Event,
    location: { protocol: native ? "capacitor:" : "https:", hostname: "localhost" },
    state: { call: {}, totalConversationTextVisible: true }, isPhoneViewport: () => true });
  vm.runInContext(script, context);
  vm.runInContext(client.slice(client.indexOf("  function currentViewportMetrics()"), client.indexOf("  function detectClientDevice()"))
    + client.slice(client.indexOf("  function updatePhoneLandscapeCallMode("), client.indexOf("  function applyDeviceDetection()")), context);
  const send = (name, height) => {
    window.dispatchEvent(Object.assign(new Event(name), { keyboardHeight: height }));
    vm.runInContext("updatePhoneLandscapeCallMode()", context);
  };
  return { window, context, classes, send, metrics: () => vm.runInContext("currentViewportMetrics()", context) };
}

test("Native resized view is not shortened or panned again by visualViewport", () => {
  const setup = fixture();
  setup.window.innerHeight = 350;
  Object.assign(setup.window.visualViewport, { height: 120, offsetTop: 230 });
  setup.send("keyboardWillShow", 494);
  assert.equal(setup.metrics().height, 350);
  assert.equal(setup.metrics().offsetTop, 0);
  assert.equal(setup.metrics().landscape, false);
  assert.equal(setup.classes.has("tc-phone-keyboard-active"), true);
  assert.equal(setup.classes.has("tc-phone-landscape-active"), false);
});

test("Native keyboard state survives rotation and clears on hide or hardware keyboard", () => {
  const setup = fixture();
  setup.window.innerHeight = 350;
  setup.send("keyboardDidShow", 494);
  setup.window.screen.orientation.type = "landscape-primary";
  Object.assign(setup.window, { innerWidth: 844, innerHeight: 180 });
  Object.assign(setup.window.visualViewport, { width: 844, height: 180 });
  setup.window.screen.orientation.dispatchEvent(new Event("change"));
  setup.send("keyboardDidShow", 210);
  assert.equal(setup.metrics().height, 180);
  assert.equal(setup.metrics().landscape, true);
  assert.equal(setup.classes.has("tc-phone-keyboard-active"), true);
  setup.send("keyboardDidHide");
  assert.equal(setup.classes.has("tc-phone-keyboard-active"), false);
  setup.send("keyboardDidShow", 0);
  assert.equal(setup.window.TeleTypTelKeyboard.active, false);
});

test("Browser-only viewport behavior is unchanged", () => {
  const setup = fixture(false);
  Object.assign(setup.window.visualViewport, { height: 350, offsetTop: 100 });
  assert.equal(setup.window.TeleTypTelKeyboard, undefined);
  assert.equal(setup.metrics().height, 350);
  assert.equal(setup.metrics().offsetTop, 100);
});
