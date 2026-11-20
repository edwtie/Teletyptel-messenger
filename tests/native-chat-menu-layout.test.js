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
    'startCall(.total)', 'profile: .audio, display: "Audio")', 'profile: .video, display: "Audio + video")', 'profile: .audioRtt, display: "Audio + RTT")',
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

test("16.9 references use a symbol-only three-column main grid and a distinct conversation popover", () => {
  const main = read(app + "NativeTranslationView.swift");
  assert.match(main, /popover\(isPresented: \$mainMenuOpen, arrowEdge: \.top\)/);
  assert.match(main, /LazyVGrid\(columns: Array\(repeating: GridItem\(\.flexible\(\), spacing: 8\), count: 3\)/);
  const grid = main.split("private var mainMenuGrid")[1].split("private func afterMenu")[0];
  const identifiers = [...grid.matchAll(/identifier: "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(identifiers, ["open-number-dialer", "menu-news", "menu-support", "open-history", "open-archive", "open-appearance",
    "open-profile", "open-account-settings", "menu-do-not-disturb", "menu-logout", "open-groups", "open-translation"]);
  assert.match(grid, /Button\(action: action\) \{ Image\(systemName: symbol\) \}/);
  assert.match(grid, /accessibilityLabel\(LocalizedStringKey\(title\)\)\.help\(LocalizedStringKey\(title\)\)/);
  assert.match(grid, /Nieuws · nog niet beschikbaar in deze app[^\n]+disabled\(true\)/);
  assert.match(grid, /Klantenservice · nog niet beschikbaar in deze app[^\n]+disabled\(true\)/);
  assert.match(main, /allowReadMarkers: !mainMenuOpen && !showProfile/);
  assert.match(main, /searchFocused = false; mainMenuOpen.toggle\(\)/);
  const header = main.split("private var brandHeader")[1].split("private var mainMenuGrid")[0];
  assert.doesNotMatch(header, /toolbar-number-dialer|toolbar-account-settings|disconnect-session/);
  assert.match(header, /accessibilityIdentifier\("messenger-main-menu"\)/);
  const chat = read(app + "NativeChatView.swift");
  assert.match(chat, /popover\(isPresented: \$conversationMenuOpen, arrowEdge: \.top\)/);
  assert.match(chat, /NativeWebCompactPopover\(\)/);
  assert.match(chat, /buttonStyle\(NativeTotalConversationButtonStyle\(\)\)/);
  assert.ok(chat.indexOf('accessibilityIdentifier("chat-start-total")') < chat.indexOf('accessibilityIdentifier("chat-interpreter")'));
  assert.ok(chat.indexOf('accessibilityIdentifier("chat-interpreter")') < chat.indexOf('accessibilityIdentifier("chat-menu")'));
  assert.match(chat, /!conversationMenuOpen && activeMessageMenu == nil && !showInterpreterHelp/);
  assert.match(chat, /draftFocused = false; conversationMenuOpen.toggle\(\)/);
  assert.match(chat, /onChange\(of: allowReadMarkers\) \{ allowed in if !allowed \{ draftFocused = false \} \}/);
  assert.match(chat, /onChange\(of: contact.jid\) \{ _ in\s+menuPresentation\?\.cancel\(\)/);
  assert.match(chat, /Tolkcontact is nog niet aangesloten/);
  assert.doesNotMatch(chat, /calls\.prepareInterpreter\(|interpreter\.request\(|Tolkwerkplek|RTT herstellen/);
  const style = read(app + "NativeWebStyle.swift").split("struct NativeWebMenuTileStyle")[1].split("struct NativeCachedAvatar")[0];
  assert.match(style, /minHeight: 48/);
  assert.match(style, /minHeight: 44/);
  assert.match(style, /destructive \? NativeWebStyle.logoutText/);
  assert.match(style, /RoundedRectangle\(cornerRadius: 14\)/);
});

test("Message menus sit beside compact web-style bubbles without covering text or delivery metadata", () => {
  const chat = read(app + "NativeChatView.swift").split("private func bubble(")[1].split("private func messageActions")[0];
  const group = read(app + "NativeGroupsView.swift").split("private var fillColor")[1].split("private var actions: some View")[0];
  for (const source of [chat, group]) {
    assert.match(source, /HStack\(alignment: \.top, spacing: 8\)/);
    assert.match(source, /NativeInlineMessage/);
    assert.match(source, /NativeMessageMenu\(identifier:/);
    assert.doesNotMatch(source, /overlay\(alignment: \.topTrailing\)|padding\(\.trailing, 44\)/);
    assert.match(source, /message-metadata-/);
  }
  const menu = read(app + "NativeMessageMenu.swift");
  assert.match(menu, /Button \{ presentation.toggle\(\) \} label:/);
  assert.match(menu, /Image\(systemName: "ellipsis"\)\.frame\(width: 44, height: 44\)/);
  assert.match(menu, /frame\(width: 44, height: 44\)\.contentShape\(Rectangle\(\)\)/);
  assert.match(menu, /popover\(isPresented: \$presentation.isPresented/);
  assert.doesNotMatch(menu, /accessibilityActivationPoint|coordinate\(|UITapGestureRecognizer/);
  const line = read(app + "NativeWebStyle.swift").split("struct NativeInlineMessage")[1].split("enum NativeWebStyle")[0];
  assert.match(line, /ViewThatFits\(in: \.horizontal\)/);
  assert.match(line, /HStack\(alignment: \.lastTextBaseline, spacing: 8\)/);
  assert.match(line, /VStack\(alignment: \.trailing, spacing: 4\)/);
});

test("Message popovers choose the roomier side of measured app geometry and never force every anchor below", () => {
  const menu = read(app + "NativeMessageMenu.swift");
  assert.match(menu, /NativeMessageMenuPlacement.prefersAbove/);
  assert.match(menu, /viewportMinimumY: Double\(viewportFrame.minY\), viewportMaximumY: Double\(viewportFrame.maxY\)/);
  assert.match(menu, /\.bottom : \.top/);
  assert.match(menu, /value: geometry.frame\(in: \.global\)/);
  assert.match(menu, /popover\(isPresented: \$presentation.isPresented, arrowEdge: arrowEdge\)/);
  assert.doesNotMatch(menu, /UIScreen.main|userInterfaceIdiom|accessibilityActivationPoint/);
  const appearance = read(app + "NativeAppearanceView.swift");
  assert.match(appearance, /environment\(\\.nativeConversationViewportFrame, geometry.frame\(in: \.global\)\)/);
  const core = read("mobile/ios-native/Sources/TeleTypTelCore/NativePresentationPreferences.swift");
  assert.match(core, /let above = max\(0, anchorMinimumY - viewportMinimumY\)/);
  assert.match(core, /let below = max\(0, viewportMaximumY - anchorMaximumY\)/);
  assert.match(core, /return above >= below/);
  const tests = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  assert.match(tests, /XCTAssertTrue\(application.frame.contains\(messagePanel.frame\)\)/);
  assert.match(tests, /XCTAssertTrue\(closeMessageMenu.isHittable\)/);
});

test("Message popovers dismiss before an action, cancel stale work, and keep original permissions and read-marker gates", () => {
  const menu = read(app + "NativeMessageMenu.swift");
  const perform = menu.split("func perform(")[1].split("func cancel()")[0];
  assert.ok(perform.indexOf("isPresented = false") < perform.indexOf("Task.sleep"));
  assert.ok(perform.indexOf("Task.sleep") < perform.indexOf("action()"));
  assert.match(perform, /pendingAction\?\.cancel\(\)/);
  assert.match(perform, /guard !Task.isCancelled else \{ return \}/);
  assert.match(menu, /onDisappear \{ presentation.cancel\(\); onPresentationChange\(false\) \}/);
  assert.match(menu, /onChange\(of: scenePhase\) \{ if \$0 != \.active \{ presentation.cancel\(\) \} \}/);
  assert.match(menu, /NativeWebMenuRowStyle\(destructive: role == \.destructive\)/);
  assert.match(menu, /Button\(role: role\)/);
  assert.match(menu, /accessibilityIdentifier\(identifier \+ "-close"\)/);
  assert.match(read("scripts/prepare-ios-native.js"), /App\/NativeMessageMenu.swift/);
  const direct = read(app + "NativeChatView.swift");
  const group = read(app + "NativeGroupsView.swift");
  for (const view of [direct, group]) {
    assert.match(view, /activeMessageMenu == nil/);
    assert.match(view, /draftFocused = false; activeMessageMenu = message.id/);
    assert.match(view, /contextMenu/);
    assert.match(view, /NativeMessageActionButton\(role: \.destructive/);
  }
  assert.match(direct, /model.canChangeMessages, model.chat.canCorrect\(message.id\)/);
  assert.match(direct, /disabled\(!translation.ready \|\| !translation.available \|\| !translation.sharingConsent\)/);
  assert.match(group, /disabled\(!canForward\)/);
  assert.match(group, /disabled\(!canReply\)/);
  assert.match(group, /disabled\(message.state == \.sending \|\| message.actionPending\)/);
  assert.match(read(app + "NativeWebStyle.swift"), /destructive \? NativeWebStyle.logoutText : NativeWebStyle.buttonText/);
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  assert.deepEqual(testsForScope("message-actions"), ["testChatHeaderAndMessageMenuDoNotOverlapAcrossRotation",
    "testMessageMenuEditForwardAndBothDeletionOptions", "testMessageReactionTogglesAcrossRotation", "testExistingGroupJoinSendRotationAndLeave"]);
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  for (const method of testsForScope("message-actions")) assert.ok(methods.includes("func " + method + "()"), method);
  assert.match(methods, /messageMenu.tap\(\)[\s\S]+messagePanel.waitForExistence\(timeout: 5\)[\s\S]+copy.isHittable/);
  assert.match(methods, /\("landscape-light", \.landscapeLeft\)/);
  assert.match(methods, /\("portrait-light-return", \.portrait\)/);
  assert.match(methods, /snapshot\("visual-message-menu-" \+ pose.name\)/);
});

test("Focused message checks can isolate iPad without weakening default device coverage or retraction assertions", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  assert.deepEqual(testsForScope("message-editing"), ["testMessageMenuEditForwardAndBothDeletionOptions"]);
  assert.deepEqual(testsForScope("message-reactions"), ["testMessageReactionTogglesAcrossRotation"]);
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const editing = methods.split("func testMessageMenuEditForwardAndBothDeletionOptions()")[1].split("func testMessageReactionTogglesAcrossRotation()")[0];
  assert.match(editing, /matching\(identifier: "chat-message-" \+ messageID\).firstMatch/);
  assert.match(editing, /updated.exists && updated.label.contains\("Bericht ingetrokken"\)/);
  assert.match(editing, /expectation\(for: tombstone, evaluatedWith: nil\); waitForExpectations\(timeout: 10\)/);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /ui_family:[\s\S]*?options: \[both, iPhone, iPad\][\s\S]*?default: both/);
  assert.ok(workflow.includes("inputs.validation_mode == 'focused-ui' && inputs.ui_family == 'iPad' && fromJSON('[\"iPad\"]')"));
  assert.ok(workflow.includes("|| fromJSON('[\"iPhone\",\"iPad\"]')"));
  assert.ok(workflow.includes("(github.event_name != 'workflow_dispatch' || inputs.validation_mode == 'full') && 75 || 45"));
});

test("Rotation waits for actual native scene geometry before reading compositor pixels and still tests message-menu activation", () => {
  const style = read(app + "NativeWebStyle.swift");
  assert.match(style, /"windowWidth": window.bounds.width, "windowHeight": window.bounds.height/);
  assert.match(style, /window.windowScene\?\.interfaceOrientation.rawValue/);
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const rotate = methods.split("private func rotate(")[1].split("private func signInFixture")[0];
  assert.match(rotate, /guard application.state != \.notRunning else \{ return \}/);
  assert.ok(rotate.indexOf("XCUIDevice.shared.orientation = orientation") < rotate.indexOf("guard application.state"));
  assert.ok(rotate.indexOf("guard application.state") < rotate.indexOf('"visual-native-viewport"'));
  assert.match(rotate, /expectation\(for: windowSettled, evaluatedWith: probe\)[\s\S]+expectation\(for: screenSettled, evaluatedWith: application\)/);
  assert.match(rotate, /interfaceOrientation.isLandscape == landscape && \(width > height\) == landscape/);
  assert.match(rotate, /XCTAssertEqual\(frame.width > frame.height, landscape\)/);
  assert.match(methods, /outgoingMenu.tap\(\)[\s\S]+copy.waitForExistence\(timeout: 5\)[\s\S]+copy.tap\(\)/);
  assert.ok(methods.includes("outgoingMenu.isHittable"));
});

test("Menu simulator scope measures hit targets and overlap for both orientations, not just screenshots", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const selected = testsForScope("menus");
  assert.equal(selected.length, 2);
  for (const name of selected) assert.ok(methods.includes("func " + name + "()"), name);
  for (const value of ["assertConversationHeader", "buttonFrame.intersects(identityFrame)",
    "buttonFrames[first].intersects(buttonFrames[second])", "menuFrame.intersects(metadata.frame)", "outgoing.frame.height, 64", "outgoingMenu.isHittable",
    'snapshot("main-menu-symbols")', '"chat-menu-landscape" : "chat-menu-portrait"',
    'TELETYPTEL_NATIVE_LONG_CONTACT_NAME', '.portrait, .landscapeLeft, .portrait']) assert.ok(methods.includes(value), value);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /inputs.validation_mode == 'focused-ui' && \(inputs.ui_scope == 'menus' \|\| inputs.ui_scope == 'startup' \|\| inputs.ui_scope == 'appearance' \|\| inputs.ui_scope == 'smileys' \|\| inputs.ui_scope == 'visual' \|\| inputs.ui_scope == 'visual-metrics' \|\| inputs.ui_scope == 'visual-repair' \|\| inputs.ui_scope == 'visual-startup' \|\| inputs.ui_scope == 'message-actions' \|\| inputs.ui_scope == 'message-editing' \|\| inputs.ui_scope == 'message-reactions' \|\| inputs.ui_scope == 'visual-navigation'\)/);
  assert.match(workflow, /tests\/native-chat-menu-layout.test.js/);
  assert.match(read("scripts/check-ios-native-ui.js"), /timeout: timeout \?\? \(\["menus", "startup", "appearance", "smileys", "visual", "visual-metrics", "visual-repair", "visual-startup", "message-actions", "message-editing", "message-reactions", "visual-navigation"\].includes\(scope\) && name.endsWith\("-build"\) \? 1200000 : undefined\)/);
});

test("Login actions take layout space instead of covering the password while the keyboard is open", () => {
  const startup = read(app + "TeleTypTelNativeApp.swift");
  const content = startup.split("private var startupContent: some View")[1].split("private var hasServerConfiguration")[0];
  assert.match(content, /scrollDismissesKeyboard\(\.interactively\)\s+if !showsServerStatusScreen \{ loginActions \}/);
  assert.doesNotMatch(content, /safeAreaInset/);
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  assert.match(methods, /XCTAssertLessThanOrEqual\(password.frame.maxY, actions.frame.minY\)/);
  assert.match(methods, /matching\(identifier: "chat-message-" \+ forwardID\)\.firstMatch.exists/);
  const status = methods.split("private func waitForStatus")[1];
  assert.match(status, /let status = self.application.staticTexts\["startup-status"\]/);
  assert.match(status, /status.exists && status.label.contains\(text\)/);
  assert.match(status, /waitForExpectations\(timeout: 30\)/);
});
