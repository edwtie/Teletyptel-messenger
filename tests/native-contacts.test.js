const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../php/public/chat-dialer.js"), "utf8");

function fixture({ native = true, pick } = {}) {
  const elements = new Map();
  const calls = [];
  const document = { documentElement: { lang: "nl" }, activeElement: null,
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        id, value: "", hidden: false, disabled: false, open: false, maxLength: 40,
        selectionStart: 0, selectionEnd: 0, handlers: {}, attributes: {}, dataset: {},
        addEventListener(name, handler) { this.handlers[name] = handler; },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        replaceChildren() {},
        focus() { document.activeElement = this; },
        blur() { document.activeElement = null; },
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
        showModal() { this.open = true; },
        close() { this.open = false; this.handlers.close?.(); },
        reset() { document.getElementById("phoneDialerNumber").value = ""; }
      });
      return elements.get(id);
    }
  };
  const window = { location: new URL(native ? "capacitor://localhost/chat.html" : "https://localhost/chat.html"),
    matchMedia: () => ({ matches: false }), addEventListener() {}, dispatchEvent() {},
    Capacitor: { getPlatform: () => "ios", isPluginAvailable: () => true,
      Plugins: { TeleTypTelContacts: { pickPhoneNumber: async options => {
        calls.push(options);
        return pick ? pick() : { phoneNumber: "+31201234567" };
      } } } }
  };
  vm.runInNewContext(source, { window, document, queueMicrotask, CustomEvent: class {} });
  const element = id => document.getElementById(id);
  const click = id => element(id).handlers.click();
  async function open() {
    click("phoneDialerButton");
    await Promise.resolve();
    click("phoneDialerContactsView");
  }
  return { open, click, element, calls, document, window };
}

test("Device picker is opt-in, native-only and returns only the selected number to the dialer", async () => {
  const app = fixture();
  await app.open();
  assert.equal(app.calls.length, 0);
  assert.equal(app.element("phoneDialerDeviceContact").hidden, false);
  await app.click("phoneDialerDeviceContact");
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].language, "nl");
  assert.equal(app.element("phoneDialerNumber").value, "+31201234567");
  assert.equal(app.element("phoneDialerContactsPanel").hidden, true);
  assert.equal(app.document.activeElement.id, "phoneDialerKeypadView");
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|console\./);
});

test("Website and old native builds do not offer device contact access", async () => {
  for (const native of [false, true]) {
    const app = fixture({ native });
    if (native) delete app.window.Capacitor.Plugins.TeleTypTelContacts;
    await app.open();
    assert.equal(app.element("phoneDialerDeviceContact").hidden, true);
    await app.click("phoneDialerDeviceContact");
    assert.equal(app.calls.length, 0);
  }
});

test("Cancel or native failure preserves an existing number and permits retry", async () => {
  for (const code of ["CANCELLED", "BUSY", "UNTRUSTED_ORIGIN"]) {
    let fail = true;
    const app = fixture({ pick: () => {
      if (fail) throw Object.assign(new Error("Fixture"), { code });
      return { phoneNumber: "0201234567" };
    } });
    await app.open();
    app.element("phoneDialerNumber").value = "+441234567890";
    await app.click("phoneDialerDeviceContact");
    assert.equal(app.element("phoneDialerNumber").value, "+441234567890");
    assert.equal(app.element("phoneDialerDeviceError").hidden, code === "CANCELLED");
    assert.equal(app.element("phoneDialerDeviceContact").disabled, false);
    fail = false;
    await app.click("phoneDialerDeviceContact");
    assert.equal(app.element("phoneDialerNumber").value, "0201234567");
    assert.equal(app.element("phoneDialerNumber").attributes["aria-invalid"], "true");
  }
});

test("Duplicate taps and a late result after closing/reopening cannot import a contact", async () => {
  let finish;
  const app = fixture({ pick: () => new Promise(resolve => { finish = resolve; }) });
  await app.open();
  const pending = app.click("phoneDialerDeviceContact");
  await app.click("phoneDialerDeviceContact");
  assert.equal(app.calls.length, 1);
  app.click("phoneDialerClose");
  await app.open();
  app.element("phoneDialerNumber").value = "+442012345678";
  finish({ phoneNumber: "+31201234567" });
  await pending;
  assert.equal(app.element("phoneDialerNumber").value, "+442012345678");
});

test("Empty or malformed selections do not erase a draft number", async () => {
  for (const result of [null, {}, { phoneNumber: " " }, { phoneNumber: "1".repeat(41) }]) {
    const app = fixture({ pick: () => result });
    await app.open();
    app.document.documentElement.lang = "en";
    app.element("phoneDialerNumber").value = "+442012345678";
    await app.click("phoneDialerDeviceContact");
    assert.equal(app.calls[0].language, "en");
    assert.equal(app.element("phoneDialerNumber").value, "+442012345678");
    assert.equal(app.element("phoneDialerDeviceError").hidden, false);
  }
});

test("Native implementation asks consent before presenting a property-only picker", () => {
  const native = fs.readFileSync(path.join(__dirname, "../scripts/ios-testflight/ContactsPlugin.swift"), "utf8");
  assert.match(native, /isBundledMessenger/);
  assert.match(native, /pendingCall == nil/);
  assert.match(native, /Kiezen toestaan[\s\S]*CNContactPickerViewController\(\)/);
  assert.match(native, /predicateForSelectionOfContact = NSPredicate\(value: false\)/);
  assert.match(native, /contactProperty.key == CNContactPhoneNumbersKey/);
  assert.match(native, /call.resolve\(\["phoneNumber": number\]\)/);
  assert.doesNotMatch(native, /CNContactStore|requestAccess|enumerateContacts|URLSession|UserDefaults|print\(/);
  const prepare = fs.readFileSync(path.join(__dirname, "../scripts/ios-testflight/prepare.js"), "utf8");
  assert.match(prepare, /ContactsPlugin.swift/);
  const controller = fs.readFileSync(path.join(__dirname, "../scripts/ios-testflight/LanViewController.swift"), "utf8");
  assert.match(controller, /registerPluginInstance\(TeleTypTelContactsPlugin\(\)\)/);
});
