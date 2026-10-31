const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const source = client.slice(client.indexOf("  function activeCallDtmf("), client.indexOf("  function supportsWebRtc()"));

function fixture() {
  const tones = [];
  const sender = { canInsertDTMF: true, toneBuffer: "", insertDTMF(value) { tones.push(value); this.toneBuffer = value; } };
  const audio = { track: { kind: "audio", readyState: "live" }, dtmf: sender };
  const call = { rttEnabled: true, incomingOffer: null, pc: { connectionState: "connected", getSenders: () => [audio] } };
  const state = { call, callKeypadSession: null, totalConversationTextVisible: false };
  const buttons = Array.from({ length: 12 }, () => ({ disabled: false }));
  const el = { callKeypadButton: {}, callKeyboardButton: {}, callKeypadStatus: {},
    callKeypadKeys: { querySelectorAll: () => buttons },
    callKeypadDialog: { open: false, showModal() { this.open = true; }, close() { this.open = false; } },
    messageInput: { value: "Original RTT text", disabled: false, focused: false,
      focus() { this.focused = true; }, blur() { this.focused = false; } } };
  const context = vm.createContext({ state, el, byId: () => ({}), t: (key, fallback) => fallback, updateCallUi() {} });
  vm.runInContext(source, context);
  return { state, el, tones, sender, audio, buttons, run: code => vm.runInContext(code, context) };
}

test("Call keypad appends only DTMF digits without changing RTT or sending chat messages", () => {
  const app = fixture();
  app.run('openCallKeypad(); sendCallDigit("1"); sendCallDigit("*"); sendCallDigit("#");');
  assert.deepEqual(app.tones, ["1", "1*", "1*#"]);
  for (const value of ["A", "12", "", ",", "text", "+"]) app.run(`sendCallDigit(${JSON.stringify(value)})`);
  assert.equal(app.tones.length, 3);
  assert.equal(app.el.messageInput.value, "Original RTT text");
  app.sender.toneBuffer = "1".repeat(32);
  app.run('sendCallDigit("9")');
  assert.equal(app.tones.length, 3);
  assert.match(app.el.callKeypadStatus.textContent, /wait/i);
});

test("DTMF is blocked for unsupported, disconnected, ended or incoming calls", () => {
  for (const disable of [app => { app.sender.canInsertDTMF = false; },
    app => { app.state.call.pc.connectionState = "disconnected"; },
    app => { app.audio.track.readyState = "ended"; },
    app => { app.state.call.incomingOffer = "offer"; },
    app => { app.audio.dtmf = null; }]) {
    const app = fixture();
    disable(app);
    app.run('openCallKeypad(); sendCallDigit("1")');
    assert.equal(app.tones.length, 0);
    if (app.el.callKeypadDialog.open) assert.ok(app.buttons.every(button => button.disabled));
  }
});

test("Ending or replacing a call closes its keypad and cannot send to another call", () => {
  for (const replace of [null, { rttEnabled: true }]) {
    const app = fixture();
    app.run("openCallKeypad()");
    app.state.call = replace;
    app.run('sendCallDigit("1"); updateCallInputUi();');
    assert.equal(app.tones.length, 0);
    assert.equal(app.el.callKeypadDialog.open, false);
    assert.equal(app.state.callKeypadSession, null);
  }
});

test("Keyboard button opens RTT from a user action and preserves the typed draft", () => {
  const app = fixture();
  app.run("updateCallInputUi()");
  assert.equal(app.el.messageInput.focused, false);
  app.run("openCallKeypad(); focusCallTextKeyboard();");
  assert.equal(app.el.callKeypadDialog.open, false);
  assert.equal(app.state.totalConversationTextVisible, true);
  assert.equal(app.el.messageInput.focused, true);
  assert.equal(app.el.messageInput.value, "Original RTT text");
  app.state.call = null;
  app.el.messageInput.focused = false;
  app.run("focusCallTextKeyboard()");
  assert.equal(app.el.messageInput.focused, false);
});

test("Rejected tone insertion reports failure instead of claiming delivery", () => {
  const app = fixture();
  app.sender.insertDTMF = () => { throw new Error("InvalidStateError"); };
  app.run('openCallKeypad(); sendCallDigit("1");');
  assert.match(app.el.callKeypadStatus.textContent, /could not be sent/);
  assert.equal(app.tones.length, 0);
});
