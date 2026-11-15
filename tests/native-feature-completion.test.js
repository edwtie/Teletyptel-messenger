const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { catalog } = require("../scripts/ios-testflight/native-localization");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

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
