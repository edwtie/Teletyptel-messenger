"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { scenarioForName } = require("../scripts/native-visual-audit/import-native");
const { compareLayout } = require("../scripts/native-visual-audit/compare");
const { testsForScope } = require("../scripts/check-ios-native-ui");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Navigation dimensions follow actual web rules and real window geometry, not a fixed tablet column or narrow menu", () => {
  const css = read("php/public/chat-client.css");
  const tablet = read("php/public/chat-tablet.css");
  assert.match(css, /width: min\(320px, calc\(100vw - 24px\)\)/);
  assert.match(css, /max-height: calc\(100dvh - 85px\)/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);\s+gap: 8px;\s+padding: 12px;\s+border: 1px solid var\(--line\)/);
  assert.match(tablet, /--conversation-list-width: clamp\(280px, 28vw, 340px\) !important/);
  const core = read("mobile/ios-native/Sources/TeleTypTelCore/NativePresentationPreferences.swift");
  assert.match(core, /max\(0, min\(320, viewportWidth - 24\)\)/);
  assert.match(core, /max\(0, min\(242, viewportHeight - 85\)\)/);
  assert.match(core, /min\(340, max\(280, viewportWidth \* 0.28\)\)/);
  const view = read("mobile/ios-native/App/NativeTranslationView.swift");
  assert.match(view, /navigationSplitViewColumnWidth\(min: contactColumnWidth, ideal: contactColumnWidth, max: contactColumnWidth\)/);
  assert.match(view, /frame\(width: horizontalSizeClass == \.regular \? contactColumnWidth : nil\)/);
  assert.match(view, /NativeWebNavigationLayout.mainMenuWidth\(viewportWidth: viewportWidth\)/);
  assert.match(view, /NativeWebNavigationLayout.mainMenuHeight\(viewportHeight: Double\(viewportFrame.height\)\)/);
  assert.match(view, /padding\(12\).padding\(1\)/);
  assert.doesNotMatch(view, /frame\(width: 252|ideal: 300|UIScreen.main/);
});

test("The tablet welcome logo stays directly on the wallpaper without an extra native white card", () => {
  const view = read("mobile/ios-native/App/NativeTranslationView.swift");
  const start = view.indexOf("GeometryReader { geometry in");
  const end = view.indexOf("private var brandHeader:");
  assert.ok(start >= 0 && end > start);
  const placeholder = view.slice(start, end);
  assert.match(placeholder, /NativeConversationBackground\(\)/);
  assert.match(placeholder, /Image\("TeleTypTelLogo"\)/);
  assert.match(placeholder, /Text\("Kies een gesprek"\)/);
  assert.match(placeholder, /Kies links een contact om te chatten/);
  assert.match(placeholder, /accessibilityIdentifier\("messenger-choose-conversation"\)/);
  assert.doesNotMatch(placeholder, /\.background\(|RoundedRectangle|\.shadow\(/);
  const tablet = read("php/public/chat-tablet.css");
  const webPlaceholder = tablet.split(".tablet-chat-placeholder {")[2].split("}")[0];
  assert.match(webPlaceholder, /place-content: center/);
  assert.doesNotMatch(webPlaceholder, /background\s*:/);
});

test("Navigation visual scope measures all eight variants and preserves keyboard, bounds, target-size and sidebar separation checks", () => {
  assert.deepEqual(testsForScope("visual-navigation"), ["testWebNavigationLayoutInBothThemesAndOrientations"]);
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const selected = methods.split("func testWebNavigationLayoutInBothThemesAndOrientations()")[1].split("func testVisualInventoryCapturesEveryMainMenuSheetInBothOrientations()")[0];
  for (const token of ['for theme in ["light", "dark"]', 'for orientation: UIDeviceOrientation in [.portrait, .landscapeLeft]',
    '"visual-navigation-contacts-"', '"visual-navigation-main-menu-"', '"visual-navigation-chat-"',
    'XCTAssertTrue(application.frame.contains(grid.frame))', 'XCTAssertFalse(application.keyboards.firstMatch.exists)',
    'XCTAssertEqual(grid.frame.width, expectedMenuWidth, accuracy: 1)', '(expectedMenuWidth - 42) / 3',
    'XCTAssertGreaterThanOrEqual(tile.frame.height, 48)', 'XCTAssertTrue(application.buttons["open-translation"].isHittable)',
    'min(340, max(280, width * 0.28))', 'try measuredElementBounds("messenger-contact-sidebar-view-bounds")',
    'XCTAssertGreaterThanOrEqual(bounds.minX, application.frame.minX)',
    'XCTAssertLessThanOrEqual(bounds.maxX, draft.frame.minX)']) assert.ok(selected.includes(token), token);
  const runner = read("scripts/check-ios-native-ui.js");
  assert.match(runner, /scope === "visual-navigation"[\s\S]*?logged\("navigation-unit-tests", "swift"/);
  assert.match(runner, /result.navigationUnitTests = true/);
  const workflow = read(".github/workflows/ios-native-preview.yml");
  assert.match(workflow, /tests\/native-web-navigation.test.js/);
});

test("Named navigation captures retain explicit state, orientation and theme and sidebar deltas remain diagnostic", () => {
  for (const screen of ["contacts", "main-menu", "chat"]) for (const orientation of ["portrait", "landscape"]) for (const theme of ["light", "dark"]) {
    assert.deepEqual(scenarioForName(`visual-navigation-${screen}-${orientation}-${theme}_0_A.png`), { screen, orientation, theme, priority: 3 });
  }
  assert.equal(scenarioForName("visual-navigation-chat-portrait-system_0_A.png"), null);
  assert.equal(scenarioForName("visual-navigation-chat-return-portrait-light_0_A.png"), null);
  const layout = compareLayout({ geometry: { ".conversation-list": [{ x: 0, y: 60, width: 280, height: 1106 }] } },
    { viewport: { source: "measured-safe-area", x: 0, y: 48 }, scale: 2,
      geometry: { units: "points", elements: [{ id: "messenger-contact-sidebar-view-bounds", source: "measured-view-bounds", x: 0, y: 84, width: 300, height: 1106 }] } });
  assert.equal(layout.length, 1);
  assert.equal(layout[0].delta.width, 20);
  assert.equal(layout[0].delta.y, 0);
  assert.equal(Object.hasOwn(layout[0], "acceptanceEligible"), false);
});

test("Sidebar evidence uses direct DEBUG view bounds and never substitutes the overflowing accessibility-container union", () => {
  const style = read("mobile/ios-native/App/NativeWebStyle.swift");
  const measurement = style.split("private final class NativeVisualElementValue")[1].split("#endif")[0];
  assert.match(measurement, /let area = convert\(bounds, to: window\)/);
  assert.match(measurement, /"source": "measured-view-bounds", "units": "points"/);
  assert.doesNotMatch(measurement, /min\(|max\(|intersection|inset|280|340/);
  const capture = style.split("struct NativeVisualElementCapture")[1].split("struct NativeStartupProgress")[0];
  assert.match(capture, /#if DEBUG/);
  assert.match(capture, /TELETYPTEL_NATIVE_VISUAL_METRICS/);
  assert.match(capture, /allowsHitTesting\(false\)/);
  assert.match(capture, /#else\s+content\s+#endif/);
  const reference = { geometry: { ".conversation-list": [{ x: 0, y: 0, width: 280, height: 1106 }] } };
  const actual = { scale: 2, viewport: { source: "measured-safe-area", x: 0, y: 48 },
    geometry: { units: "points", elements: [{ id: "messenger-contact-sidebar", x: -100, y: 24, width: 380, height: 1106 }] } };
  assert.deepEqual(compareLayout(reference, actual), []);
  actual.geometry.elements[0].id = "messenger-contact-sidebar-view-bounds";
  assert.deepEqual(compareLayout(reference, actual), []);
  actual.geometry.elements[0].source = "measured-view-bounds";
  assert.equal(compareLayout(reference, actual)[0].delta.width, 100);
});

test("Rotation checks the actual PNG orientation without scaling images or extending the original wait", () => {
  const ui = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const rotation = ui.split("private func rotate(_ orientation: UIDeviceOrientation)")[1].split("private func signInFixture")[0];
  assert.match(rotation, /screenshot.pngRepresentation as CFData/);
  assert.match(rotation, /kCGImagePropertyOrientation/);
  assert.match(rotation, /\[1, 3, 6, 8\].contains\(orientation\)/);
  assert.match(rotation, /let swapsAxes = orientation == 6 \|\| orientation == 8/);
  assert.match(rotation, /return \(width > height\) == landscape/);
  assert.match(rotation, /XCTAssertEqual\(frame.width > frame.height, landscape\)/);
  assert.equal((rotation.match(/waitForExpectations\(timeout: 10\)/g) || []).length, 2);
  assert.doesNotMatch(rotation, /screenshot\(\).image.size|resize|UIGraphics|draw\(in:/);
});
