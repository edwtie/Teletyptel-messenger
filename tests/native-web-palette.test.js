"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { rules, rgba, palette, assets, assertCompiledPalette } = require("../scripts/native-web-palette");
const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "php/public/chat-client.css"), "utf8");
const controls = fs.readFileSync(path.join(root, "php/public/call-controls-menu.css"), "utf8");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Native colour assets derive both appearances from the rendered web roles, not independent Swift hex values", () => {
  const values = palette(client, controls);
  const expected = {
    panel: ["#ffffff", "#151f2d"], background: ["#eef2f7", "#0f1724"], panelStrong: ["#edf3fb", "#1f2937"],
    button: ["#edf4ff", "#16243a"], buttonText: ["#0f172a", "#f9fafb"],
    selection: ["#2563eb", "#2563eb"], selectionText: ["#ffffff", "#ffffff"],
    composer: ["#ffffff", "#0f1724"], composerButton: ["#eef2f7", "#1f2d43"],
    composerSend: ["#2563eb", "#1f2d43"], callBackground: ["#07111f", "#07111f"],
    callLine: ["#24528a", "#24528a"], totalConversation: ["#1559c4", "#1559c4"],
    enabled: ["#16a34a", "#16a34a"], disabled: ["#dc2626", "#dc2626"], receiptRead: ["#0ea5e9", "#0ea5e9"]
  };
  for (const [role, colours] of Object.entries(expected)) {
    assert.deepEqual(values[role].light, rgba(colours[0]), role + " light");
    assert.deepEqual(values[role].dark, rgba(colours[1]), role + " dark");
  }
  assert.equal(values.header.light[3], 0.68);
  assert.equal(values.header.dark[3], 0.72);
  assert.equal(values.rttBackground.light[3], 0.82);
  assert.equal(values.backgroundOverlay.light[3], 0.34);
  assert.equal(values.backgroundOverlay.dark[3], 0.66);
  const generated = assets(root);
  const style = read("mobile/ios-native/App/NativeWebStyle.swift");
  const references = [...style.matchAll(/Color\("(Web\w+)"\)/g)].map(match => match[1]);
  assert.ok(references.length >= 50);
  assert.equal(new Set(references).size, references.length);
  for (const name of references) {
    const asset = JSON.parse(generated[`Assets.xcassets/${name}.colorset/Contents.json`]);
    assert.equal(asset.colors.length, 2);
    assert.deepEqual(asset.colors[1].appearances, [{ appearance: "luminosity", value: "dark" }]);
    for (const entry of asset.colors) {
      assert.equal(entry.idiom, "universal");
      assert.equal(entry.color["color-space"], "srgb");
      assert.ok(Object.values(entry.color.components).every(value => /^\d\.\d{6}$/.test(value)));
      assert.ok(Object.values(entry.color.components).every(value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1));
    }
  }
  assert.equal(JSON.parse(generated["Assets.xcassets/WebPanel.colorset/Contents.json"]).colors[0].color.components.alpha, "1.000000");
  assert.equal(JSON.parse(generated["Assets.xcassets/WebPanel.colorset/Contents.json"]).colors[0].color.components.red, "1.000000");
  assert.deepEqual(JSON.parse(generated["Assets.xcassets/WebPaletteReference.dataset/reference.json"]), values);
  assert.match(read("scripts/prepare-ios-native.js"), /require\("\.\/native-web-palette"\)\.assets\(root\)/);
});

test("Native simulator acceptance rejects colour variants discarded by the asset compiler", () => {
  assert.doesNotThrow(() => assertCompiledPalette("CompileAssetCatalogVariant\nBUILD SUCCEEDED"));
  assert.throws(() => assertCompiledPalette('Assets.xcassets:./WebText.colorset: warning: The color set "WebText" has 2 unassigned children.'), /Xcode discarded web colour variants/);
  assert.match(read("scripts/check-ios-native.js"), /assertCompiledPalette\(buildOutput\)/);
});

test("Web colour changes propagate to native output and missing, cyclic or unsupported CSS fails explicitly", () => {
  const changed = client.replace("background: #1f2d43;", "background: #123456;");
  assert.deepEqual(palette(changed, controls).composerButton.dark, rgba("#123456"));
  assert.deepEqual(palette(changed, controls).composerSend.dark, rgba("#123456"));
  const selected = 'body[data-theme="light"] button.selected:not(.social-login-button):not(.google-sdk-login-overlay)';
  assert.deepEqual(palette(client + selected + " { background: #123456; color: #abcdef; }", controls).selection.light, rgba("#123456"));
  assert.deepEqual(palette(client + selected + " { background: #123456; color: #abcdef; }", controls).selectionText.light, rgba("#abcdef"));
  assert.deepEqual(palette(client.replaceAll("--selection-bg: #dbeafe;", "--selection-bg: #ff0000;"), controls).selection.light, rgba("#2563eb"));
  assert.throws(() => palette(client.replaceAll(selected, "body .removed-selected-rule"), controls), /Missing web palette property/);
  assert.throws(() => palette(client.replaceAll("--bubble-self: #ddf8ea;", "--bubble-self: not-a-colour;"), controls));
  assert.throws(() => palette(client, ""), /Missing web call-control/);
  assert.deepEqual(rgba("#abcd"), rgba("#aabbccdd"));
  assert.deepEqual(rgba("rgba(255, 0, 0, .5)"), [1, 0, 0, 0.5]);
  assert.deepEqual(rgba("var(--first)", { "--first": "var(--second)", "--second": "#123456" }), rgba("#123456"));
  assert.throws(() => rgba("var(--first)", { "--first": "var(--first)" }), /cyclic/);
  for (const invalid of ["rgba(256, 0, 0, 1)", "rgba(0,0,0,2)", "rgba(..,0,0,1)", "url(https://example.invalid)", "#zzzzzz", undefined]) assert.throws(() => rgba(invalid));
  const parsed = rules(":is(.one, .two) { color: #fff; } .two, .three { color: #000 !important; } .three { background: #fff; }");
  assert.equal(parsed.has(".one"), false);
  assert.equal(parsed.get(".two").color, "#000");
  assert.deepEqual(parsed.get(".three"), { color: "#000", background: "#fff" });
});

test("Shared native components use web colour roles for selection, composer, receipts, backgrounds, fields and TC", () => {
  const style = read("mobile/ios-native/App/NativeWebStyle.swift");
  const messenger = read("mobile/ios-native/App/NativeTranslationView.swift");
  assert.match(messenger, /selected == contact.jid \? NativeWebStyle.selection : NativeWebStyle.button/);
  assert.match(messenger, /selected == group.room \? NativeWebStyle.selectionText : NativeWebStyle.muted/);
  assert.match(messenger, /NativeWebStyle.groupPresence/);
  assert.doesNotMatch(messenger, /Circle\(\).fill\(Color.blue\)/);
  assert.match(style, /toolbarBackground\(NativeWebStyle.panelStrong/);
  assert.match(style, /background\(NativeWebStyle.composer, in:/);
  assert.match(style, /NativeWebStyle.composerSendText/);
  assert.match(style, /NativeWebStyle.totalDisabledText/);
  assert.match(read("mobile/ios-native/App/NativeChatView.swift"), /NativeTotalConversationSymbol\(\).fill\(.foreground\)/);
  assert.match(style, /background\(NativeWebStyle.input, in:/);
  assert.match(style, /struct NativeWebTextButtonStyle: ButtonStyle/);
  assert.match(read("mobile/ios-native/App/NativeAppearanceView.swift"), /overlay\(NativeWebStyle.backgroundOverlay\)/);
  assert.match(read("mobile/ios-native/App/NativeChatEnhancements.swift"), /NativeWebStyle.receiptRead : NativeWebStyle.receipt/);
  for (const file of ["NativeChatView.swift", "NativeGroupsView.swift", "NativeAttachmentsView.swift"]) assert.match(read("mobile/ios-native/App/" + file), /composer: true/);
  const call = read("mobile/ios-native/App/NativeTotalConversationView.swift");
  assert.match(call, /NativeWebStyle.rttLabel/);
  assert.match(call, /NativeWebStyle.rttPlaceholder/);
  assert.match(call, /background\(NativeWebStyle.rttBackground/);
  assert.match(call, /NativeWebCallSymbolStyle\(color: color\)/);
  assert.doesNotMatch(call, /0\.55, green: 0\.75|0\.12, green: 0\.32|0\.02, green: 0\.06/);
  for (const file of ["NativeChatView.swift", "NativeGroupsView.swift"]) assert.match(read("mobile/ios-native/App/" + file), /NativeWebDateSeparator\(date: message.date\)/);
  assert.match(style, /Calendar.current.isDateInToday\(date\)/);
  assert.match(style, /calendar.isDate\(\$0, inSameDayAs: date\)/);
  assert.match(style, /NativeWebStyle.dateBackground/);
});

test("Appearance comparison explicitly captures light/dark login, contacts, menus, forms, chat and TC in both orientations", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const selected = testsForScope("appearance");
  assert.equal(selected.length, 2);
  for (const method of selected) assert.ok(methods.includes("func " + method + "()"));
  const scenarios = methods.split("func testWebPaletteLoginChatAndMenusInBothThemes()")[1].split("func testMainMenuRemainsSeparateFromConversationMenu()")[0];
  assert.match(scenarios, /for theme in \["light", "dark"\]/);
  for (const screen of ["login", "contacts", "main-menu", "settings", "conversation-menu", "chat-portrait", "chat-landscape", "tc-portrait", "tc-landscape", "tc-controls"]) {
    assert.ok(scenarios.includes('snapshot("web-palette-' + screen + '-" + theme)'), screen);
  }
  assert.match(scenarios, /TELETYPTEL_NATIVE_UI_FIXTURE/);
  assert.match(scenarios, /-teletyptel.native.theme/);
  assert.match(scenarios, /XCTAssertEqual\(palette.value as\? String, "Web palette verified"\)/);
  const style = read("mobile/ios-native/App/NativeWebStyle.swift");
  assert.match(style, /#if DEBUG\s+extension NativeWebStyle/);
  assert.match(style, /UIColor\(named: name, in: .main, compatibleWith: traits\)/);
  assert.match(style, /color.getRed\(&red, green: &green, blue: &blue, alpha: &alpha\)/);
  assert.match(read(".github/workflows/ios-native-preview.yml"), /tests\/native-web-palette.test.js/);
});
