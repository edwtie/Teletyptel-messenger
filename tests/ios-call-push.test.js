const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const push = require("../scripts/ios-testflight/call-push");

const root = path.resolve(__dirname, "..");
const swift = fs.readFileSync(path.join(root, "scripts/ios-testflight/VoipCallPlugin.swift"), "utf8");

test("Call push remains off by default and unfinished previews cannot be uploaded", () => {
  for (const value of [undefined, "", "0"]) assert.equal(push.previewEnabled(value), false);
  assert.equal(push.previewEnabled("1"), true);
  for (const value of ["yes", "true", "1;anything"]) assert.throws(() => push.previewEnabled(value));
  assert.match(push.plistEntries(false), /TeleTypTelCallPushEnabled<\/key><false\/>/);
  assert.doesNotMatch(push.plistEntries(false), /UIBackgroundModes/);
  assert.match(push.plistEntries(true), /<string>voip<\/string>/);
  assert.match(push.plistEntries(true), /<string>audio<\/string>/);
  assert.throws(() => push.validateRelease({ TeleTypTelCallPushEnabled: true }, true), /not releasable/);
  assert.doesNotThrow(() => push.validateRelease({ TeleTypTelCallPushEnabled: true }, false));
  assert.doesNotThrow(() => push.validateRelease({ TeleTypTelCallPushEnabled: false }, true));
});

test("Only production-entitled profiles can sign a push preview", () => {
  for (const profile of [{}, { Entitlements: { "aps-environment": "development" } }]) {
    assert.throws(() => push.validateProfile(profile, true));
    assert.doesNotThrow(() => push.validateProfile(profile, false));
  }
  assert.doesNotThrow(() => push.validateProfile({ Entitlements: { "aps-environment": "production" } }, true));
});

test("Native launch hook is deterministic and guards against upstream template changes", () => {
  const delegate = fs.readFileSync(path.join(root, "ios/App/App/AppDelegate.swift"), "utf8");
  const configured = push.configureDelegate(delegate);
  assert.match(configured, /MessengerVoipCalls.shared.start\(\)/);
  assert.throws(() => push.configureDelegate(configured));
  assert.throws(() => push.configureDelegate(delegate + delegate));
});

test("Entitlements are generated only inside an explicitly opted-in staging project", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-push-test-"));
  try {
    const projectDirectory = path.join(directory, "ios/App/App.xcodeproj");
    const appDirectory = path.join(directory, "ios/App/App");
    fs.mkdirSync(projectDirectory, { recursive: true });
    fs.mkdirSync(appDirectory, { recursive: true });
    const file = path.join(projectDirectory, "project.pbxproj");
    const source = "INFOPLIST_FILE = App/Info.plist;\nINFOPLIST_FILE = App/Info.plist;";
    fs.writeFileSync(file, source);
    push.configureProject(directory, false);
    assert.equal(fs.readFileSync(file, "utf8"), source);
    push.configureProject(directory, true);
    assert.equal((fs.readFileSync(file, "utf8").match(/CODE_SIGN_ENTITLEMENTS/g) || []).length, 2);
    assert.match(fs.readFileSync(path.join(appDirectory, "CallPush.entitlements"), "utf8"), /<string>production<\/string>/);
    assert.throws(() => push.configureProject(directory, true), /Review existing/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Native source guards: report CallKit before completing push, never fetch first", () => {
  const callback = swift.slice(swift.indexOf("private func report("), swift.indexOf("private func scheduleTimeout("));
  assert.ok(callback.indexOf("provider.reportNewIncomingCall") < callback.indexOf("defer { completion() }"));
  assert.doesNotMatch(callback, /URLSession|fetch|evaluateJavaScript|AudioServicesPlaySystemSound/);
  assert.match(callback, /expiresAt > now && expiresAt <= now \+ 60/);
  assert.match(callback, /existing == nil && calls.isEmpty/);
  assert.match(callback, /localizedCallerName = "TeleTypTel"/);
  assert.match(callback, /reason: \.unanswered/);
});

test("Native source guards: no fake successful answer and no biometric bypass", () => {
  const answerHandler = swift.slice(swift.indexOf("perform action: CXAnswerCallAction"),
    swift.indexOf("perform action: CXEndCallAction"));
  assert.doesNotMatch(answerHandler, /fulfill\(/);
  assert.match(answerHandler, /call.phase = "answerRequested"/);
  assert.match(answerHandler, /min\(15,/);
  const connected = swift.slice(swift.indexOf("func mediaConnected(id:"), swift.indexOf("func end(id:"));
  assert.match(connected, /call.sid == sid/);
  assert.match(connected, /answer.fulfill\(\)/);
  assert.match(swift, /isBundledMessenger\(bridge\?\.webView\?\.url\) && MessengerBiometricSession.shared.permitsRequests/);
  assert.doesNotMatch(swift, /setActive\(true|unlock\(|AVCaptureSession|requestRecordPermission/);
  assert.match(swift, /ended.count > 32/);
  assert.match(swift, /registry\?\.desiredPushTypes = \[\]/);
});

test("Preparation and upload use guards and private signing material is ignored", () => {
  const prepare = fs.readFileSync(path.join(root, "scripts/ios-testflight/prepare.js"), "utf8");
  const build = fs.readFileSync(path.join(root, "scripts/ios-testflight/build.js"), "utf8");
  assert.match(prepare, /callPush.configureDelegate/);
  assert.match(prepare, /VoipCallPlugin.swift/);
  assert.match(build, /callPush.validateRelease\(stagedPlist, upload\)/);
  assert.match(build, /callPush.validateProfile\(profile, config.callPushPreview === true\)/);
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.ok(ignore.split(/\r?\n/).includes("*.p8"));
  assert.ok(ignore.split(/\r?\n/).includes("*.mobileprovision"));
});

test("Native consent is account-bound; offline revocation survives restarts", () => {
  assert.match(swift, /func register\(account: String\) -> Bool/);
  assert.match(swift, /accountId.isEmpty \|\| accountId == account/);
  assert.match(swift, /!accountId.isEmpty && pendingAccountId.isEmpty/);
  assert.match(swift, /"deviceId": deviceId/);
  const disable = swift.slice(swift.indexOf("func disable()"), swift.indexOf("func snapshot()"));
  assert.ok(disable.indexOf("set(accountId, forKey: pendingKey)") < disable.indexOf("removeObject(forKey: accountKey)"));
  assert.match(disable, /pendingAccountId == account, !account.isEmpty/);
  assert.match(swift, /CAPPluginMethod\(name: "revocationConfirmed"/);
  assert.match(swift, /@objc func revocationConfirmed[\s\S]*?perform\(call\)/);
});

test("Compile-only commits exercise the preview but cannot enter the signed upload job", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ios-testflight.yml"), "utf8");
  const preflight = workflow.slice(workflow.indexOf("  preflight:"), workflow.indexOf("  internal-upload:"));
  const upload = workflow.slice(workflow.indexOf("  internal-upload:"));
  assert.match(preflight, /IOS_CALL_PUSH_PREVIEW:.*contains\(github.event.head_commit.message, '\[ios-compile-only\]'\)/);
  assert.match(preflight, /npm run build:check/);
  assert.doesNotMatch(preflight, /secrets\./);
  assert.match(upload, /if:.*!contains\(github.event.head_commit.message, '\[ios-compile-only\]'\)/);
});
