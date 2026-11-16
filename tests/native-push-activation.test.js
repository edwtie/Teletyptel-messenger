"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes, generateKeyPairSync } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const push = require("../scripts/native-call-push-config");
const { prepare, projectText } = require("../scripts/prepare-ios-native");
const root = path.resolve(__dirname, "..");
const config = { bundleId: "com.tiedragon.teletyptel", environment: "production", testOnly: true };

test("Native push remains off by default and can be staged explicitly without modifying the source plist", () => {
  const source = fs.readFileSync(path.join(root, "mobile/ios-native/App/Info.plist"), "utf8");
  assert.equal(push.enabled(undefined), false); assert.equal(push.enabled("0"), false); assert.equal(push.enabled("1"), true);
  assert.throws(() => push.enabled("yes"));
  assert.equal(push.plist(source, null), source);
  const name = "ios-native-push-contract-" + randomBytes(8).toString("hex");
  const staged = prepare(name, { pushTest: config });
  const plist = fs.readFileSync(path.join(staged, "App/Info.plist"), "utf8");
  assert.match(plist, /TeleTypTelNativeCallPushEnabled<\/key><true\/>/);
  assert.match(plist, /TeleTypTelNativeCallRecoveryLabEnabled<\/key><true\/>/);
  assert.match(plist, /<string>voip<\/string>/);
  assert.match(fs.readFileSync(path.join(staged, "App/NativeCallPush.entitlements"), "utf8"), /aps-environment<\/key><string>production/);
  assert.match(projectText({ pushTest: config }).project, /PRODUCT_BUNDLE_IDENTIFIER = com.tiedragon.teletyptel;/);
  assert.match(projectText().project, /PRODUCT_BUNDLE_IDENTIFIER = com.tiedragon.teletyptel.nativepreview;/);
  assert.equal(fs.readFileSync(path.join(root, "mobile/ios-native/App/Info.plist"), "utf8"), source);
  assert.throws(() => prepare(name, { pushTest: config }));
});

test("Production APNs staging refuses unrelated bundle, environment, providers or ambiguous configuration", () => {
  for (const changes of [{ bundleId: "com.other.app" }, { environment: "sandbox" }, { testOnly: false }, { extra: true }]) {
    assert.throws(() => projectText({ pushTest: { ...config, ...changes } }));
  }
  assert.throws(() => prepare("ios-native-forbidden-push", { pushTest: config, providers: {} }));
  const profile = { TeamIdentifier: ["H29RTRBD9D"], DeveloperCertificates: ["fixture"], ExpirationDate: "2030-01-01T00:00:00Z",
    Entitlements: { "aps-environment": "production", "application-identifier": "H29RTRBD9D.com.tiedragon.teletyptel",
      "com.apple.developer.team-identifier": "H29RTRBD9D", "get-task-allow": false } };
  assert.doesNotThrow(() => push.validateProfile(profile, 1800000000000));
  for (const changes of [{ "aps-environment": "development" }, { "application-identifier": "H29RTRBD9D.com.other" }, { "get-task-allow": true }]) {
    assert.throws(() => push.validateProfile({ ...profile, Entitlements: { ...profile.Entitlements, ...changes } }, 1800000000000));
  }
  assert.throws(() => push.validateProfile(profile, 2000000000000));
});

test("Logout and rotation use a durable generation-specific revocation outbox without network inside transactions", () => {
  const php = process.env.TELETYPTEL_PHP || (process.platform === "win32" ? "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe" : "php");
  const reply = spawnSync(php, ["php/tests/call-scope-revocation-test.php"], { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.equal(reply.status, 0, reply.stderr + reply.stdout);
  assert.match(reply.stdout, /checks passed/);
});

test("APNs production credentials load only from bounded protected external configuration", () => {
  const { configuration } = require("../services/call-push/send");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tc-apns-config-"));
  const keyFile = path.join(temporary, "fixture.p8"), configFile = path.join(temporary, "fixture.json");
  try {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    const value = { version: 1, environment: "production", keyId: "P23DMHKUQW", teamId: "H29RTRBD9D", keyFile };
    fs.writeFileSync(configFile, JSON.stringify(value), { mode: 0o600 });
    const result = configuration({ TELETYPTEL_CALL_PUSH_APNS_CONFIG_FILE: configFile });
    assert.equal(result.environment, "production"); assert.equal(result.bundleId, "com.tiedragon.teletyptel");
    assert.equal(result.keyId, value.keyId);
    for (const changes of [{ environment: "sandbox" }, { extra: true }, { keyFile: path.join(root, "README.md") }]) {
      fs.writeFileSync(configFile, JSON.stringify({ ...value, ...changes }));
      assert.throws(() => configuration({ TELETYPTEL_CALL_PUSH_APNS_CONFIG_FILE: configFile }));
    }
    fs.writeFileSync(configFile, "x".repeat(4097));
    assert.throws(() => configuration({ TELETYPTEL_CALL_PUSH_APNS_CONFIG_FILE: configFile }));
    const probe = fs.readFileSync(path.join(root, "services/call-push/check-apns.js"), "utf8");
    assert.match(probe, /appleProviderAuthenticated: false, deviceTestRequired: true, pushSent: false/);
    assert.doesNotMatch(probe, /sendIncoming|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/);
  } finally { fs.unlinkSync(configFile); fs.unlinkSync(keyFile); fs.rmdirSync(temporary); }
});
