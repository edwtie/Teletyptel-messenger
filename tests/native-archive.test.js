"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { prepare, projectText } = require("../scripts/prepare-ios-native");
const metadata = require("../scripts/native-archive-config");
const root = path.resolve(__dirname, "..");
const pushTest = { bundleId: "com.tiedragon.teletyptel", environment: "production", testOnly: true };
const archive = { version: "1.0", buildNumber: "17.0" };

test("Native archive staging is explicit and cannot mutate the ordinary preview or source metadata", () => {
  const original = fs.readFileSync(path.join(root, "mobile/ios-native/App/Info.plist"), "utf8");
  assert.throws(() => projectText({ archive }));
  assert.match(projectText().scheme, /buildForArchiving="NO"/);
  const project = projectText({ archive, pushTest });
  assert.match(project.scheme, /buildForArchiving="YES"/);
  assert.match(project.scheme, /ArchiveAction buildConfiguration="Release"/);
  assert.match(project.project, /SKIP_INSTALL = NO;/);
  assert.match(project.project, /ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/);
  assert.match(project.project, /CODE_SIGNING_ALLOWED = NO;/);
  const directory = prepare("ios-native-archive-contract-" + randomBytes(6).toString("hex"), { archive, pushTest });
  const staged = fs.readFileSync(path.join(directory, "App/Info.plist"), "utf8");
  assert.match(staged, /CFBundleDisplayName<\/key>\s*<string>TeleTypTel<\/string>/);
  assert.match(staged, /CFBundleVersion<\/key>\s*<string>17.0<\/string>/);
  assert.match(staged, /TeleTypTelNativeCallPushEnabled<\/key><true\/>/);
  assert.doesNotMatch(staged, /ITSAppUsesNonExemptEncryption|FacebookClientToken|GIDClientID/);
  const icon = fs.readFileSync(path.join(directory, "Assets.xcassets/AppIcon.appiconset/icon.png"));
  assert.equal(icon.readUInt32BE(16), 1024); assert.equal(icon.readUInt32BE(20), 1024);
  assert.equal(fs.readFileSync(path.join(root, "mobile/ios-native/App/Info.plist"), "utf8"), original);
});

test("Native archive metadata rejects invalid versions, extra options and missing source entries", () => {
  for (const changes of [{ version: "0.1" }, { version: "1\"/>" }, { buildNumber: "0" }, { buildNumber: "1.2.3.4" },
    { buildNumber: 17 }, { upload: true }, { version: undefined }]) {
    assert.throws(() => metadata.validate({ ...archive, ...changes }, pushTest));
  }
  assert.throws(() => metadata.plist("<plist><dict/></plist>", archive));
});

test("Archive evidence checks the actual app product without treating it as a signed release", () => {
  const app = { CFBundleIdentifier: pushTest.bundleId, CFBundlePackageType: "APPL", CFBundleShortVersionString: "1.0",
    CFBundleVersion: "17.0", CFBundleIcons: { CFBundlePrimaryIcon: { CFBundleIconName: "AppIcon" } }, CFBundleSupportedPlatforms: ["iPhoneOS"], UIDeviceFamily: [1, 2],
    TeleTypTelNativeCallPushEnabled: true, TeleTypTelNativeCallRecoveryLabEnabled: true, TeleTypTelNativePushTestOnly: true,
    UIBackgroundModes: ["audio", "voip"] };
  const product = { ApplicationProperties: { ApplicationPath: "Applications/TeleTypTelNative.app", CFBundleIdentifier: pushTest.bundleId } };
  const result = metadata.inspect({ app, archive: product, expected: archive });
  assert.equal(result.archiveValidated, true); assert.equal(result.releaseReady, false);
  assert.equal(result.uploaded, false); assert.equal(result.unsigned, true);
  assert.ok(result.remaining.includes("physical-device PushKit/CallKit/media acceptance"));
  for (const changes of [{ CFBundleIdentifier: "com.other.app" }, { CFBundleVersion: "16.9" }, { UIDeviceFamily: [1] },
    { CFBundleSupportedPlatforms: ["iPhoneSimulator"] }, { CFBundleIcons: undefined }, { TeleTypTelNativeCallPushEnabled: false }]) {
    assert.throws(() => metadata.inspect({ app: { ...app, ...changes }, archive: product, expected: archive }));
  }
  assert.throws(() => metadata.inspect({ app, archive: {}, expected: archive }));
});

test("Archive workflow never receives signing secrets, exports an IPA or sends Apple pushes", () => {
  const checker = fs.readFileSync(path.join(root, "scripts/check-ios-native-archive.js"), "utf8");
  assert.match(checker, /"CODE_SIGNING_ALLOWED=NO", "archive"/);
  assert.match(checker, /Products\/Applications\/TeleTypTelNative.app/);
  assert.match(checker, /hasAlpha: no/);
  assert.match(checker, /"-extract", "ApplicationProperties", "json"/);
  assert.doesNotMatch(checker, /readPlist\("archive-metadata"/);
  assert.doesNotMatch(checker, /altool|exportArchive|process\.env\.IOS_|sendIncoming|rejectUnauthorized/);
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ios-native-preview.yml"), "utf8");
  assert.match(workflow, /focused-archive/);
  assert.doesNotMatch(workflow.split("  internal-native-upload:")[0], /secrets\.|environment: ios-testflight/);
});
