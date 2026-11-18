"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const release = require("../scripts/native-internal-release");
const { prepare, projectText } = require("../scripts/prepare-ios-native");
const push = require("../scripts/native-call-push-config");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const environment = { IOS_FACEBOOK_APP_ID: "926375633763307", IOS_FACEBOOK_CLIENT_TOKEN: "fictional-client-token" };
const configured = release.providers(environment);
const pushTest = { bundleId: "com.tiedragon.teletyptel", environment: "production", testOnly: true };

test("Production providers are enabled only for an explicit real-bundle archive with the matching registrations", () => {
  assert.throws(() => release.providers({}));
  assert.throws(() => release.providers({ ...environment, IOS_FACEBOOK_APP_ID: "12345" }));
  assert.throws(() => prepare("ios-native-invalid-production", { providers: configured }));
  assert.throws(() => prepare("ios-native-invalid-push", { providers: configured, pushTest }));
  const staged = prepare("ios-native-release-contract-" + randomBytes(6).toString("hex"), {
    providers: configured, pushTest, archive: { version: "1.0", buildNumber: "17.1" }
  });
  const source = fs.readFileSync(path.join(staged, "App/Info.plist"), "utf8");
  for (const value of [configured.google.clientId, configured.google.serverClientId, configured.facebook.appId]) assert.ok(source.includes(value));
  assert.match(source, /TeleTypTelProviderBundleID<\/key><string>com.tiedragon.teletyptel<\/string>/);
  assert.match(source, /TeleTypTelFacebookEnabled<\/key><true\/>/);
  assert.match(source, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/);
  assert.equal(fs.readFileSync(path.join(staged, "App/PrivacyInfo.xcprivacy"), "utf8"), read("mobile/ios-native/App/PrivacyInfo.xcprivacy"));
  assert.match(projectText().project, /App\/PrivacyInfo.xcprivacy/);
});

test("Native provisioning and signed entitlements reject development, other app identities and extra capabilities", () => {
  const entitlements = { "application-identifier": "H29RTRBD9D.com.tiedragon.teletyptel", "com.apple.developer.team-identifier": "H29RTRBD9D",
    "aps-environment": "production", "get-task-allow": false };
  release.validateEntitlements(entitlements);
  for (const change of [{ "aps-environment": "development" }, { "get-task-allow": true }, { "application-identifier": "other" },
    { "keychain-access-groups": ["H29RTRBD9D.*"] }, { "com.apple.developer.associated-domains": ["*"] }]) {
    assert.throws(() => release.validateEntitlements({ ...entitlements, ...change }));
  }
  assert.throws(() => push.validateProfile({}));
  const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", fingerprint = "A".repeat(40);
  const source = projectText({ pushTest, archive: { version: "1.0", buildNumber: "17.1" } }).project;
  const signed = release.signingProject(source, uuid, fingerprint);
  assert.equal(signed.split("PROVISIONING_PROFILE_SPECIFIER").length, 3);
  assert.equal(signed.split("CODE_SIGNING_ALLOWED = YES;").length, 3);
  assert.ok(signed.includes("CODE_SIGNING_ALLOWED = NO;"));
  assert.throws(() => release.signingProject(source, "../escape", fingerprint));
  assert.throws(() => release.signingProject("", uuid, fingerprint));
});

test("Signed provider metadata and app-level reason manifest remain checked without claiming no data collection", () => {
  const app = { TeleTypTelProviderBundleID: configured.bundleId, GIDClientID: configured.google.clientId,
    GIDServerClientID: configured.google.serverClientId, FacebookAppID: configured.facebook.appId,
    FacebookClientToken: configured.facebook.clientToken, TeleTypTelFacebookEnabled: true,
    FacebookAutoInitEnabled: false, FacebookAutoLogAppEventsEnabled: false, FacebookAdvertiserIDCollectionEnabled: false, FacebookSKAdNetworkReportEnabled: false };
  release.validateApp(app, configured);
  assert.throws(() => release.validateApp({ ...app, FacebookAutoLogAppEventsEnabled: true }, configured));
  assert.throws(() => release.validateApp({ ...app, GIDClientID: "other" }, configured));
  const manifest = { NSPrivacyAccessedAPITypes: [["UserDefaults", "CA92.1"], ["SystemBootTime", "35F9.1"]].map(([category, reason]) => ({
    NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategory" + category, NSPrivacyAccessedAPITypeReasons: [reason] })) };
  release.validatePrivacy(manifest);
  assert.throws(() => release.validatePrivacy({}));
  assert.throws(() => release.validatePrivacy({ NSPrivacyAccessedAPITypes: [] }));
  assert.doesNotMatch(read("mobile/ios-native/App/PrivacyInfo.xcprivacy"), /NSPrivacyCollectedDataTypes/);
});

test("Internal upload requires successful archive checks, the protected branch environment and an explicit dispatch", () => {
  const workflow = read(".github/workflows/ios-native-preview.yml");
  const job = workflow.split("  internal-native-upload:")[1];
  assert.match(job, /needs: native-preview/);
  assert.match(job, /environment: ios-testflight/);
  assert.match(job, /runs-on: macos-15-intel/);
  assert.match(workflow, /runs-on: \$\{\{ \(inputs.validation_mode == 'focused-archive' \|\| \(inputs.validation_mode == 'focused-ui' && \(inputs.ui_scope == 'menus' \|\| inputs.ui_scope == 'startup' \|\| inputs.ui_scope == 'appearance' \|\| inputs.ui_scope == 'smileys' \|\| inputs.ui_scope == 'visual' \|\| inputs.ui_scope == 'visual-metrics' \|\| inputs.ui_scope == 'visual-repair' \|\| inputs.ui_scope == 'visual-startup' \|\| inputs.ui_scope == 'message-actions'\)\)\) && 'macos-15-intel' \|\| 'macos-15' \}\}/);
  assert.match(job, /inputs.native_push_test == true && inputs.validation_mode == 'focused-archive'/);
  assert.match(job, /github.event_name == 'workflow_dispatch'/);
  assert.match(job, /inputs.internal_upload == true/);
  assert.match(job, /refs\/heads\/codex\/teletyptel-beta-polish/);
  assert.match(job, /path: artifacts\/ios-native-internal-\*\/reports\/result.json/);
  assert.doesNotMatch(job, /TELETYPTEL_APNS_KEY|private-logs|\.ipa|\.p12|AuthKey/);
  const source = read("scripts/native-internal-release.js");
  assert.match(source, /testFlightInternalTestingOnly: true/);
  assert.match(source, /processingAndCompliancePending = true/);
  assert.match(source, /apnsActivated: false, physicalDeviceTested: false/);
  assert.match(source, /codesign", \["--verify", "--deep", "--strict"/);
  assert.match(source, /validateEntitlements\(JSON.parse/);
  assert.match(source, /COPYFILE_EXCL/);
  assert.match(source, /result.failedStage = stage/);
  assert.doesNotMatch(source, /ITSAppUsesNonExemptEncryption|rejectUnauthorized|TELETYPTEL_APNS_KEY_FILE|IOS_PROVISION_PROFILE_BASE64/);
});
