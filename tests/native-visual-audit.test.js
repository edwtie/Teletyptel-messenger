"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { comparePixels, cropPixels, orientPixels, pairIssues, compareLayout, completeness, renderReport } = require("../scripts/native-visual-audit/compare");
const { screens, variants, caseID } = require("../scripts/native-visual-audit/catalogue");
const { scenarioForName, pngSize, measuredVariant } = require("../scripts/native-visual-audit/import-native");
const { trackedReader, profileForVariant } = require("../scripts/native-visual-audit/capture-web");
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
  const reference = { screen: "chat", family: "iPhone", orientation: "portrait", theme: "light", width: 402, height: 778, scale: 3, locale: "nl-NL", timezone: "Europe/Amsterdam", epoch: "2026-11-17T11:00:00.000Z", fixtureHash: "a".repeat(64), stateVerified: true, inputVerified: true, deviceVerified: true };
  const actual = { ...reference, viewport: { source: "measured-safe-area", x: 0, y: 186, width: 1206, height: 2334 } };
  assert.deepEqual(pairIssues(reference, actual), []);
  for (const key of Object.keys(reference).filter(key => !["stateVerified", "inputVerified", "deviceVerified"].includes(key))) assert.ok(pairIssues(reference, { ...actual, [key]: undefined }).some(issue => issue.includes(key)));
  assert.ok(pairIssues({ ...reference, stateVerified: false }, actual).some(issue => issue.includes("web screen state")));
  assert.ok(pairIssues({ ...reference, inputVerified: false }, actual).some(issue => issue.includes("touch input mode")));
  assert.ok(pairIssues({ ...reference, deviceVerified: false }, actual).some(issue => issue.includes("phone/tablet classification")));
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

test("Layout diagnostics use measured safe-area coordinates without rescaling screenshots or asserting pixel equality", () => {
  const reference = { geometry: { "#mobileActionsPanel": [{ x: 70, y: 64, width: 320, height: 240 }] } };
  const actual = { scale: 3, viewport: { source: "measured-safe-area", x: 0, y: 186 }, geometry: { units: "points", elements: [{ id: "main-menu-grid", x: 100, y: 126, width: 252, height: 240 }] } };
  const [layout] = compareLayout(reference, actual);
  assert.deepEqual(layout.native, { x: 100, y: 64, width: 252, height: 240 });
  assert.deepEqual(layout.delta, { x: 30, y: 0, width: -68, height: 0 });
  assert.deepEqual(compareLayout(reference, { ...actual, viewport: undefined }), []);
  assert.deepEqual(compareLayout({ geometry: {} }, actual), []);
  assert.equal(Object.hasOwn(layout, "identical"), false);
});

test("Actual measured app sizes drive a fresh web render, including status-bar changes; screenshots are never stretched", () => {
  const variant = variants.find(entry => entry.family === "iPad" && entry.orientation === "portrait");
  const viewport = { source: "measured-safe-area", x: 0, y: 48, width: 1668, height: 2322, scale: 2 };
  const image = { width: 1668, height: 2420 };
  assert.equal(measuredVariant(variant, viewport, image).height, 1161);
  assert.equal(variant.height, 1166);
  assert.deepEqual(measuredVariant(variant), variant);
  assert.throws(() => measuredVariant(variant, { ...viewport, scale: 3 }, image), /Invalid measured/);
  assert.throws(() => measuredVariant(variant, { ...viewport, height: 2323 }, image), /exact supported CSS size/);
  assert.throws(() => measuredVariant(variant, { ...viewport, height: 5000 }, image), /Invalid measured/);
  const landscape = variants.find(entry => entry.family === "iPad" && entry.orientation === "landscape");
  assert.equal(measuredVariant(landscape, { ...viewport, y: 0, width: 2420, height: 1618 }, { width: 2420, height: 1668 }).height, 809);
});

test("Web fixture renders frozen real web source, never mockup HTML, with external connections disabled", () => {
  const runner = fs.readFileSync(path.join(root, "scripts/native-visual-audit/capture-web.js"), "utf8");
  assert.match(runner, /\["show", revision \+ ":" \+ file\]/);
  assert.match(runner, /context\.route\("\*\*\/\*"/);
  assert.match(runner, /serviceWorkers: "block"/);
  assert.match(runner, /isMobile: true, hasTouch: true/);
  assert.match(runner, /inputVerified: true/);
  assert.match(runner, /route\.fulfill/);
  assert.doesNotMatch(runner, /route\.continue|setContent\(|\.fill\(.*password|facebook\.local|\.p8/);
  const hook = fs.readFileSync(path.join(root, "scripts/native-visual-audit/web-hook.js"), "utf8");
  assert.doesNotMatch(hook, /innerHTML|outerHTML|\.style\./);
  assert.match(hook, /renderActiveConversation\(\)/);
  assert.match(hook, /xmppAvailability\?\.ready\(\)/);
  assert.match(hook, /updateCallUi\(\)/);
  assert.ok(hook.includes('".chat-header"'));
  assert.match(runner, /Requested popover contains no visible controls/);
  assert.match(runner, /stateVerified: true/);
});

test("Unpublished web files require an explicit local source mode and cannot silently replace the committed reference", () => {
  const committed = trackedReader("HEAD");
  assert.equal(committed.read("php/config.php"), null);
  assert.equal(committed.read("scripts/ios-testflight/facebook.local.json"), null);
  assert.throws(() => trackedReader("HEAD", "automatic"), /explicit/);
  const working = trackedReader("HEAD", "working-tree");
  assert.deepEqual(working.read("php/public/chat.html"), fs.readFileSync(path.join(root, "php/public/chat.html")));
  assert.equal(working.read("php/config.php"), null);
  assert.equal(working.read("php/public/postnl-demo.js"), null);
  assert.ok(working.manifest().every(entry => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test("Safari device classification does not replace measured geometry and cannot silently use a desktop profile", () => {
  const devices = { "iPad Pro 11": { userAgent: "fixture-ipad-agent" }, "iPhone 15 Pro": { userAgent: "fixture-iphone-agent" } };
  const tablet = profileForVariant(variants.find(variant => variant.family === "iPad"), devices);
  assert.equal(tablet.expectedDeviceClass, "tablet");
  assert.equal(tablet.userAgent, "fixture-ipad-agent");
  assert.equal(Object.hasOwn(tablet, "viewport"), false);
  assert.equal(profileForVariant(variants[0], devices).expectedDeviceClass, "phone");
  assert.throws(() => profileForVariant({ family: "desktop" }, devices), /explicit Safari/);
  assert.throws(() => profileForVariant(variants[0], {}), /explicit Safari/);
  const runner = fs.readFileSync(path.join(root, "scripts/native-visual-audit/capture-web.js"), "utf8");
  assert.match(runner, /userAgent: profile.userAgent/);
  assert.match(runner, /device.platform !== "ios" \|\| device.deviceClass !== profile.expectedDeviceClass/);
});

test("Visual simulator scope captures actual forms in both orientations and retains strict no-overlap and compactness checks", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  const methods = fs.readFileSync(path.join(root, "mobile/ios-native/UITests/NativeStartupUITests.swift"), "utf8");
  for (const selected of testsForScope("visual")) assert.ok(methods.includes("func " + selected + "()"), selected);
  assert.ok(testsForScope("visual").includes("testVisualInventoryCapturesEveryMainMenuSheetInBothOrientations"));
  for (const source of ['"visual-" + screen + "-portrait-" + theme', '"visual-" + screen + "-landscape-" + theme', 'XCTAssertFalse(menuFrame.intersects(metadata.frame))', 'XCTAssertLessThanOrEqual(outgoing.frame.height, 64)', 'name + "-geometry"']) assert.ok(methods.includes(source), source);
  assert.match(methods, /name\.hasPrefix\("web-palette-conversation-menu-"\)[\s\S]+identifiers = \["chat-header", "conversation-menu-panel"\]/);
  assert.match(methods, /identifiers = \[\][\s\S]+geometry\["viewport"\] = viewport/);
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

test("Visual repair checks preserve the clipped progress accessibility frame and complete message hit rectangles", () => {
  const style = fs.readFileSync(path.join(root, "mobile/ios-native/App/NativeWebStyle.swift"), "utf8");
  const progress = style.split("struct NativeStartupProgress")[1].split("struct NativeConversationHeader")[0];
  assert.match(progress, /Rectangle\(\)\.fill\(NativeWebStyle.button\)\s+\.frame\(width: geometry.size.width, height: 4\)\s+\.accessibilityElement\(children: \.ignore\)/);
  assert.match(progress, /TimelineView[\s\S]+\.accessibilityHidden\(true\)/);
  assert.doesNotMatch(progress, /\.accessibilityFrame\(/);
  assert.match(progress, /frame\(height: 4\)\.clipped\(\)\.allowsHitTesting\(false\)/);
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  assert.ok(testsForScope("visual-repair").includes("testStartupProgressStopsOnCancelAndCertificateFailure"));
  assert.ok(testsForScope("visual-repair").includes("testExistingGroupJoinSendRotationAndLeave"));
});
