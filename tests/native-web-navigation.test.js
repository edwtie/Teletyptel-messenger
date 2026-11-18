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
  assert.match(view, /NativeWebNavigationLayout.mainMenuWidth\(viewportWidth: viewportWidth\)/);
  assert.match(view, /NativeWebNavigationLayout.mainMenuHeight\(viewportHeight: Double\(viewportFrame.height\)\)/);
  assert.match(view, /padding\(12\).padding\(1\)/);
  assert.doesNotMatch(view, /frame\(width: 252|ideal: 300|UIScreen.main/);
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
    'min(340, max(280, width * 0.28))', 'XCTAssertLessThanOrEqual(sidebar.frame.maxX, draft.frame.minX)']) assert.ok(selected.includes(token), token);
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
      geometry: { units: "points", elements: [{ id: "messenger-contact-sidebar", x: 0, y: 84, width: 300, height: 1106 }] } });
  assert.equal(layout.length, 1);
  assert.equal(layout[0].delta.width, 20);
  assert.equal(layout[0].delta.y, 0);
  assert.equal(Object.hasOwn(layout[0], "acceptanceEligible"), false);
});
