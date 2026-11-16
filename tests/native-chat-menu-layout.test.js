"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const app = "mobile/ios-native/App/";

test("Chat and group headers allocate identity and controls in one bounded row, not competing navigation items", () => {
  const style = read(app + "NativeWebStyle.swift");
  const header = style.split("struct NativeConversationHeader")[1].split("struct NativeWebIconStyle")[0];
  assert.match(header, /frame\(minWidth: 0, maxWidth: \.infinity, alignment: \.leading\)\.clipped\(\)/);
  assert.match(header, /HStack\(spacing: 8, content: actions\)\.fixedSize\(horizontal: true, vertical: false\)/);
  assert.match(header, /lineLimit\(1\)\.truncationMode\(\.tail\)/);
  assert.match(header, /accessibilityLabel\(identityLabel \?\? title/);
  assert.match(header, /allowsHitTesting\(false\)/);
  for (const file of ["NativeChatView.swift", "NativeGroupsView.swift"]) {
    const source = read(app + file).split("private var historyHeader")[0];
    assert.match(source, /NativeConversationHeader\(/);
    assert.match(source, /toolbar\(\.hidden, for: \.navigationBar\)/);
    assert.doesNotMatch(source, /ToolbarItem\(placement: \.(principal|primaryAction)\)/);
  }
});

test("Conversation menu keeps all existing call and contact capabilities behind symbol actions", () => {
  const chat = read(app + "NativeChatView.swift");
  for (const value of ['accessibilityIdentifier("chat-menu")', 'accessibilityIdentifier("chat-start-total")',
    'startCall(.total)', 'profile: .audio)', 'profile: .video)', 'profile: .audioRtt)',
    'showTranslation = true', 'model.setMuted(', 'model.setBlocked(', 'removeContact = true', 'renameContact = true',
    'model.loadHistory(for: contact.jid, refresh: true)']) assert.ok(chat.includes(value), value);
  assert.match(chat, /disabled\(!calls.canCall\(contact\)\)/);
  const group = read(app + "NativeGroupsView.swift");
  const actions = group.split("private var groupActions: some View")[1].split("private func status")[0];
  assert.match(actions, /Label\("Groep verlaten", systemImage:/);
  assert.match(actions, /Button\(role: \.destructive\) \{ model.leave\(room: room\) \}/);
  assert.doesNotMatch(actions, /NativeWebIconStyle\(destructive: true\)/);
  assert.match(actions, /accessibilityIdentifier\("group-menu"\)/);
  assert.match(read(app + "NativeTranslationView.swift"), /accessibilityIdentifier\("messenger-main-menu"\)/);
});

test("Message menus take layout space rather than overlaying message text and delivery metadata", () => {
  const chat = read(app + "NativeChatView.swift").split("private func bubbleContent")[1].split("private func messageActions")[0];
  const group = read(app + "NativeGroupsView.swift").split("private var content: some View")[1].split("private var actions: some View")[0];
  for (const source of [chat, group]) {
    assert.match(source, /HStack\(alignment: \.top, spacing: 6\)/);
    assert.match(source, /Image\(systemName: "ellipsis"\)\.frame\(width: 44, height: 44\)/);
    assert.doesNotMatch(source, /overlay\(alignment: \.topTrailing\)|padding\(\.trailing, 44\)/);
    assert.match(source, /message-metadata-/);
  }
});

test("Menu simulator scope measures hit targets and overlap for both orientations, not just screenshots", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const selected = testsForScope("menus");
  assert.equal(selected.length, 4);
  for (const name of selected) assert.ok(methods.includes("func " + name + "()"), name);
  for (const value of ["assertConversationHeader", "buttonFrame.intersects(identityFrame)",
    "buttonFrames[first].intersects(buttonFrames[second])", "menuFrame.maxY, metadata.frame.minY", "outgoingMenu.isHittable",
    'snapshot("main-menu-symbols")', '"chat-menu-landscape" : "chat-menu-portrait"',
    'TELETYPTEL_NATIVE_LONG_CONTACT_NAME', '.portrait, .landscapeLeft, .portrait']) assert.ok(methods.includes(value), value);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /inputs.validation_mode == 'focused-ui' && inputs.ui_scope == 'menus'/);
  assert.match(workflow, /tests\/native-chat-menu-layout.test.js/);
  assert.match(read("scripts/check-ios-native-ui.js"), /timeout: timeout \?\? \(scope === "menus" && name.endsWith\("-build"\) \? 1200000 : undefined\)/);
});

test("Login actions take layout space instead of covering the password while the keyboard is open", () => {
  const startup = read(app + "TeleTypTelNativeApp.swift");
  const content = startup.split("private var startupContent: some View")[1].split("private var hasServerConfiguration")[0];
  assert.match(content, /scrollDismissesKeyboard\(\.interactively\)\s+loginActions/);
  assert.doesNotMatch(content, /safeAreaInset/);
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  assert.match(methods, /XCTAssertLessThanOrEqual\(password.frame.maxY, actions.frame.minY\)/);
  assert.match(methods, /matching\(identifier: "chat-message-" \+ forwardID\)\.firstMatch.exists/);
});
