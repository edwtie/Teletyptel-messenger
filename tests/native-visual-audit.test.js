"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { comparePixels, cropPixels, orientPixels, pairIssues, completeness, renderReport } = require("../scripts/native-visual-audit/compare");
const { screens, variants, caseID } = require("../scripts/native-visual-audit/catalogue");
const { scenarioForName, pngSize } = require("../scripts/native-visual-audit/import-native");
const root = path.resolve(__dirname, "..");

test("Visual inventory includes all declared screens and every device/orientation/theme; missing cases cannot pass", () => {
  assert.equal(screens.length, 44);
  assert.equal(new Set(screens.map(screen => screen.id)).size, screens.length);
  for (const screen of screens) assert.ok(fs.existsSync(path.join(root, "mobile/ios-native/App", screen.source)), screen.source);
  assert.equal(variants.length, 8);
  assert.equal(completeness([]).total, 352);
  assert.equal(completeness([]).complete, false);
  const single = { id: caseID("chat", variants[0]), screen: "chat", ...variants[0], status: "pixels-identical", identical: true, acceptanceEligible: true };
  assert.equal(completeness([single]).proven, 1);
  assert.equal(completeness([single]).complete, false);
  assert.equal(completeness([{ ...single, acceptanceEligible: false }]).proven, 0);
  assert.throws(() => completeness([single, single]), /Duplicate/);
  assert.throws(() => completeness([{ ...single, id: "unexpected" }]), /Unexpected/);
});

test("Pixel equality is exact RGBA, not a tolerant similarity score or ignored antialiasing", () => {
  const image = { width: 2, height: 1, data: Buffer.from([1, 2, 3, 255, 10, 11, 12, 255]) };
  assert.equal(comparePixels(image, image).identical, true);
  const actual = { ...image, data: Buffer.from(image.data) };
  actual.data[2] += 1;
  let result = comparePixels(image, actual);
  assert.equal(result.identical, false);
  assert.equal(result.differentPixels, 1);
  assert.equal(result.differentFraction, 0.5);
  assert.equal(result.maxChannelError, 1);
  assert.deepEqual([...result.delta], [255, 0, 0, 255, 255, 255, 255, 255]);
  actual.data[2] -= 1; actual.data[7] -= 1;
  assert.equal(comparePixels(image, actual).identical, false);
  assert.equal(comparePixels(image, { width: 1, height: 2, data: image.data }).status, "different-dimensions");
  assert.throws(() => comparePixels(image, { width: 2, height: 1, data: Buffer.alloc(7) }), /Invalid/);
});

test("Only explicit integer viewport crops are supported; no resize, padding or image alignment can hide UI differences", () => {
  const image = { width: 2, height: 2, data: Buffer.from([...Array(16).keys()]) };
  assert.deepEqual([...cropPixels(image, { x: 1, y: 1, width: 1, height: 1 }).data], [12, 13, 14, 15]);
  for (const invalid of [null, { x: -1, y: 0, width: 1, height: 1 }, { x: 0.5, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 2, height: 1 }]) assert.throws(() => cropPixels(image, invalid), /explicit/);
});

test("XCTest landscape PNG orientation is read from EXIF and rotated losslessly, not guessed from the requested layout", () => {
  const image = { width: 2, height: 3, data: Buffer.from([0, 1, 2, 3, 4, 5].flatMap(value => [value, value, value, 255])) };
  const left = orientPixels(image, 8);
  assert.equal(left.width, 3); assert.equal(left.height, 2);
  assert.deepEqual([...left.data].filter((_, index) => index % 4 === 0), [1, 3, 5, 0, 2, 4]);
  assert.deepEqual([...orientPixels(image, 6).data].filter((_, index) => index % 4 === 0), [4, 2, 0, 5, 3, 1]);
  assert.deepEqual([...orientPixels(image, 3).data].filter((_, index) => index % 4 === 0), [5, 4, 3, 2, 1, 0]);
  assert.throws(() => orientPixels(image, 2), /Unsupported/);
  const header = Buffer.alloc(8 + 25 + 12 + 26);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
  header.writeUInt32BE(13, 8); header.write("IHDR", 12);
  header.writeUInt32BE(2, 16); header.writeUInt32BE(3, 20);
  header.writeUInt32BE(26, 33); header.write("eXIf", 37);
  const tiff = Buffer.from("4d4d002a00000008000101120003000000010008000000000000", "hex");
  tiff.copy(header, 41);
  assert.deepEqual(pngSize(header), { width: 3, height: 2, storedWidth: 2, storedHeight: 3, orientation: 8 });
});

test("Unmatched fixture, language, theme, time, scale and viewport are blocked rather than misrepresented as comparisons", () => {
  const reference = { screen: "chat", family: "iPhone", orientation: "portrait", theme: "light", width: 402, height: 778, scale: 3, locale: "nl-NL", timezone: "Europe/Amsterdam", epoch: "2026-11-17T11:00:00.000Z", fixtureHash: "a".repeat(64) };
  const actual = { ...reference, viewport: { source: "measured-safe-area", x: 0, y: 186, width: 1206, height: 2334 } };
  assert.deepEqual(pairIssues(reference, actual), []);
  for (const key of Object.keys(reference)) assert.ok(pairIssues(reference, { ...actual, [key]: undefined }).some(issue => issue.includes(key)));
  assert.ok(pairIssues(reference, { ...actual, viewport: undefined }).some(issue => issue.includes("viewport")));
  assert.ok(pairIssues(reference, { ...actual, viewport: { ...actual.viewport, width: 100 } }).some(issue => issue.includes("entire declared app area")));
  assert.ok(pairIssues(reference, { ...actual, errors: ["broken image"] }).some(issue => issue.includes("runtime")));
});

test("Native import matches known real screenshot cases and never relabels a failure or another state as accepted", () => {
  assert.deepEqual(scenarioForName("web-palette-chat-landscape-dark_0_A.png"), { screen: "chat", orientation: "landscape", theme: "dark", priority: 1 });
  assert.deepEqual(scenarioForName("visual-account-portrait-light_0_A.png"), { screen: "account", orientation: "portrait", theme: "light", priority: 2 });
  assert.equal(scenarioForName("failure-state_0.png"), null);
  assert.equal(scenarioForName("web-smileys-inline_0.png"), null);
  assert.throws(() => pngSize(Buffer.from("not an image")), /not a PNG/);
});

test("Report states full-catalogue failure explicitly, escapes evidence and distinguishes review screenshots from proof", () => {
  const coverage = completeness([]);
  const html = renderReport({ coverage, webRevision: "<script>evil()</script>" }, root);
  assert.match(html, /0 van 352/);
  assert.match(html, /pixelgelijkheid NIET bewezen/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /geen bewijs/);
});

test("Web fixture renders frozen real web source, never mockup HTML, with external connections disabled", () => {
  const runner = fs.readFileSync(path.join(root, "scripts/native-visual-audit/capture-web.js"), "utf8");
  assert.match(runner, /\["show", revision \+ ":" \+ file\]/);
  assert.match(runner, /context\.route\("\*\*\/\*"/);
  assert.match(runner, /serviceWorkers: "block"/);
  assert.match(runner, /route\.fulfill/);
  assert.doesNotMatch(runner, /route\.continue|setContent\(|\.fill\(.*password|facebook\.local|\.p8/);
  const hook = fs.readFileSync(path.join(root, "scripts/native-visual-audit/web-hook.js"), "utf8");
  assert.doesNotMatch(hook, /innerHTML|outerHTML|\.style\./);
  assert.match(hook, /renderActiveConversation\(\)/);
  assert.match(hook, /xmppAvailability\?\.ready\(\)/);
});

test("Visual simulator scope captures actual forms in both orientations and retains strict no-overlap and compactness checks", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  const methods = fs.readFileSync(path.join(root, "mobile/ios-native/UITests/NativeStartupUITests.swift"), "utf8");
  for (const selected of testsForScope("visual")) assert.ok(methods.includes("func " + selected + "()"), selected);
  assert.ok(testsForScope("visual").includes("testVisualInventoryCapturesEveryMainMenuSheetInBothOrientations"));
  for (const source of ['"visual-" + screen + "-portrait-" + theme', '"visual-" + screen + "-landscape-" + theme', 'XCTAssertFalse(menuFrame.intersects(metadata.frame))', 'XCTAssertLessThanOrEqual(outgoing.frame.height, 64)', 'name + "-geometry"']) assert.ok(methods.includes(source), source);
});

test("Viewport instrumentation is transparent and DEBUG/environment gated, while diagnostic diffs cannot become acceptance", () => {
  const style = fs.readFileSync(path.join(root, "mobile/ios-native/App/NativeWebStyle.swift"), "utf8");
  const probe = style.split("#if DEBUG")[1].split("extension NativeWebStyle")[0];
  assert.match(probe, /window\.safeAreaInsets/);
  assert.match(probe, /window\.bounds\.inset\(by: insets\)/);
  assert.match(probe, /view\.backgroundColor = \.clear/);
  assert.match(probe, /view\.isUserInteractionEnabled = false/);
  const capture = style.split("struct NativeVisualViewportCapture")[1].split("struct NativeStartupProgress")[0];
  assert.match(capture, /#if DEBUG/);
  assert.match(capture, /TELETYPTEL_NATIVE_VISUAL_METRICS/);
  assert.match(capture, /#else\s+content\s+#endif/);
  const comparison = fs.readFileSync(path.join(root, "scripts/native-visual-audit/compare.js"), "utf8");
  assert.match(comparison, /else \{ entry\.reviewMetrics = metrics; entry\.status = "diagnostic-only"; \}/);
  const coverage = completeness([{ id: caseID("chat", variants[0]), screen: "chat", ...variants[0], status: "diagnostic-only", identical: true, acceptanceEligible: false }]);
  assert.equal(coverage.proven, 0);
});
