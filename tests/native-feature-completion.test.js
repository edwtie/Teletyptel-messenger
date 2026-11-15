const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { catalog, permissions } = require("../scripts/ios-testflight/native-localization");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Focused simulator regression selects real assertions without pretending to be a full acceptance run", () => {
  const { selectedTests, run } = require("../scripts/check-ios-native-ui");
  const { runSimulatorChecks } = require("../scripts/check-ios-native");
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  assert.equal(selectedTests.length, 7);
  for (const name of selectedTests) assert.ok(methods.includes("func " + name + "()"), name);
  const calls = [];
  runSimulatorChecks({ common: ["CODE_SIGNING_ALLOWED=NO"], family: "iPad", destination: "fixture", deviceID: "fixture",
    resultBundle: "fixture.xcresult", tests: selectedTests, logged: (...args) => calls.push(args) });
  assert.equal(calls.length, 3);
  const argumentsForTests = calls[2][2];
  assert.equal(argumentsForTests.filter(value => value.startsWith("-only-testing:")).length, selectedTests.length);
  assert.ok(argumentsForTests.includes("test-without-building"));
  assert.throws(() => runSimulatorChecks({ tests: ["../unsafe"], logged() { assert.fail("Must reject before running"); } }));
  const source = read("scripts/check-ios-native-ui.js");
  assert.match(source, /physicalDeviceTested: false/);
  assert.match(source, /uploaded: false/);
  assert.doesNotMatch(source, /altool|registerForRemoteNotifications|signingPackage|checkMedia\(/);
  if (process.platform !== "darwin") assert.throws(run, /require macOS/);
});

test("Attachment review precedes optional capture rows and main-menu sheets wait for menu dismissal", () => {
  const attachment = read("mobile/ios-native/App/NativeAttachmentsView.swift");
  assert.ok(attachment.indexOf('accessibilityIdentifier("attachment-stage")') < attachment.indexOf('Section("Opnamen")'));
  const menu = read("mobile/ios-native/App/NativeTranslationView.swift");
  assert.match(menu, /afterMenu \{ showGroups = true \}/);
  assert.match(menu, /menuPresentation\?\.cancel\(\)/);
  assert.match(menu, /if model\.isReconnecting \{ return "Verbinding herstellen…" \}/);
});

test("Native static UI has complete Dutch/English resource coverage and an independent language preference", () => {
  const translations = catalog(root);
  for (const language of ["nl", "en"]) assert.ok(translations[language].split("\n").length > 300);
  assert.ok(translations.en.includes('"Naam" = "Name";'));
  assert.ok(translations.en.includes('"Accountbeveiliging" = "Account security";'));
  assert.ok(translations.en.includes('"Locatie" = "Location";'));
  assert.ok(translations.nl.includes('"Naam" = "Naam";'));
  const generator = read("scripts/prepare-ios-native.js");
  assert.match(generator, /PBXVariantGroup/);
  assert.match(generator, /translationBuild/);
  assert.match(generator, /native-localization/);
  assert.match(read("mobile/ios-native/App/NativeAppearanceView.swift"), /interface-language/);
  assert.match(read("mobile/ios-native/App/TeleTypTelNativeApp.swift"), /environment\(\\\.locale/);
  assert.match(permissions(root).en, /NSLocationWhenInUseUsageDescription/);
  assert.match(permissions(root).en, /no background tracking/);
  assert.match(permissions(root).nl, /geen achtergrondtracking/);
});

test("Message notifications request consent, redact content and never masquerade as APNs", () => {
  const source = read("mobile/ios-native/App/NativeMessageNotifications.swift");
  assert.match(source, /requestAuthorization\(options: \[\.alert, \.badge\]\)/);
  assert.match(source, /!login\.chat\.preferences\.doNotDisturb/);
  assert.match(source, /!login\.chat\.preferences\.mutedPeers\.contains/);
  assert.match(source, /visibleConversation == message\.peer/);
  assert.doesNotMatch(source, /message\.body|message\.peer\s*\]|registerForRemoteNotifications|PKPushRegistry|\.sound/);
  assert.match(source, /setBadgeCount/);
  assert.match(read("mobile/ios-native/App/NativeAccountSettingsView.swift"), /nog geen APNs-bezorging/);
  assert.doesNotMatch(read("mobile/ios-native/App/Info.plist"), /TeleTypTelNativeCallPushEnabled|aps-environment/);
});

test("Recording and one-time location have bounded capture, explicit review and cancellation", () => {
  const source = read("mobile/ios-native/App/NativeCaptureAttachments.swift");
  for (const required of ["record(forDuration: 60)", "requestRecordPermission", "setActive(false", "FileProtectionType.complete",
    "NativeCaptureExclusion.shared.callActive", "exporter.metadata = []", "fileLengthLimit", "videoMaximumDuration = 60", "phase == .background"]) assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /sendMessage\(|URLSession|\.upload\(/);
  const location = read("mobile/ios-native/App/NativeLocationOptions.swift");
  assert.match(location, /requestWhenInUseAuthorization/);
  assert.match(location, /requestLocation\(\)/);
  assert.match(location, /location\.message/);
  assert.match(location, /60/);
  assert.doesNotMatch(location, /requestAlwaysAuthorization|startUpdatingLocation|allowsBackgroundLocationUpdates/);
  assert.match(read("mobile/ios-native/App/Info.plist"), /NSLocationWhenInUseUsageDescription/);
  const attachment = read("mobile/ios-native/App/NativeAttachmentsView.swift");
  assert.match(attachment, /QLPreviewController/);
  assert.match(attachment, /session\.downloadFile\(reference\)/);
  assert.match(attachment, /FileProtectionType.complete/);
  assert.match(attachment, /clearPreview/);
  assert.match(attachment, /!exclusion.callActive/);
  assert.doesNotMatch(attachment, /WKWebView|URLSession\.shared/);
});

test("Reconnect is bounded, cancellable and cannot bypass certificate or authentication errors", () => {
  const source = read("mobile/ios-native/Sources/TeleTypTelCore/NativeLoginModel.swift");
  assert.match(source, /reconnectAttempt < 5/);
  assert.match(source, /failure == \.offline \|\| failure == \.timeout/);
  assert.match(source, /generation == retry/);
  assert.match(source, /keepAccount: true, keepReconnect: true/);
  assert.match(source, /let keepAccount = isConnected \|\| isReconnecting/);
  assert.doesNotMatch(source, /transient = .*certificate/);
  assert.match(source, /chat\.markRead\(identifiers\)\s+guard canSend, chat\.preferences\.sendDisplayed/);
});

test("Password changes use an authenticated preserving server action instead of generic profile save", context => {
  const route = read("php/public/api/account.php");
  const action = route.slice(route.indexOf("function changeAccountPassword"), route.indexOf("function createAccount"));
  assert.match(action, /AccountAccess::guardSession/);
  assert.match(action, /isCurrentServerSession/);
  assert.match(action, /verifyAccountPassword/);
  assert.match(action, /NativeAccountPasswordChange::input\(rowToAccount\(\$existing\), \$input\)/);
  assert.match(read("mobile/ios-native/Sources/TeleTypTelCore/NativeAccountLifecycle.swift"), /"action": "change_password"/);
  assert.match(read("mobile/ios-native/Sources/TeleTypTelCore/NativeAccountLifecycle.swift"), /scope\.session === session/);
  assert.match(route, /'capabilities' => \['nativePasswordChange' => true\]/);
  let php;
  for (const candidate of [process.env.PHP_BINARY, "C:/wamp64/bin/php/php8.4.15/php.exe", "php"].filter(Boolean)) {
    try { execFileSync(candidate, ["--version"], { timeout: 10000, stdio: "pipe" }); php = candidate; break; } catch {}
  }
  if (!php) { context.skip("PHP runtime unavailable; source guards still ran"); return; }
  const output = execFileSync(php, [path.join(root, "php/tests/native-password-change-test.php")], { timeout: 10000, encoding: "utf8" });
  assert.match(output, /preserves profile, avatar, provider, XMPP and storage settings/);
});
