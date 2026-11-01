const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const facebook = require("./facebook-signin");
const google = require("./google-signin");

const fixture = { appId: "123456789", clientToken: "0".repeat(32) };
const env = { IOS_FACEBOOK_APP_ID: fixture.appId, IOS_FACEBOOK_CLIENT_TOKEN: fixture.clientToken };
const read = file => fs.readFileSync(path.join(__dirname, file), "utf8");

function temporaryConfig(context, content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "facebook-config-test-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "facebook.local.json");
  if (content !== undefined) fs.writeFileSync(file, content);
  return file;
}

function staged(config = fixture) {
  const plist = {
    TeleTypTelFacebookEnabled: Boolean(config),
    FacebookAutoInitEnabled: false,
    FacebookAutoLogAppEventsEnabled: false,
    FacebookAdvertiserIDCollectionEnabled: false,
    FacebookSKAdNetworkReportEnabled: false,
    FacebookLoggingBehavior: [],
    CFBundleURLTypes: [{ CFBundleURLSchemes: [google.urlScheme] }]
  };
  if (config) {
    plist.FacebookAppID = config.appId;
    plist.FacebookClientToken = config.clientToken;
    plist.CFBundleURLTypes.push({ CFBundleURLSchemes: ["fb" + config.appId] });
  }
  return plist;
}

test("Facebook config prefers a complete environment pair without opening local credentials", context => {
  const file = temporaryConfig(context, "not JSON");
  assert.deepEqual(facebook.loadConfig({ env, file }), fixture);
  assert.throws(() => facebook.loadConfig({ env: { IOS_FACEBOOK_APP_ID: fixture.appId }, file }), /requires both/);
  assert.throws(() => facebook.loadConfig({ env: { IOS_FACEBOOK_CLIENT_TOKEN: fixture.clientToken }, file }), /requires both/);
});

test("Facebook local JSON works without environment input and never leaks parsing errors", context => {
  const file = temporaryConfig(context, JSON.stringify(fixture));
  assert.deepEqual(facebook.loadConfig({ env: {}, file }), fixture);
  fs.writeFileSync(file, '{"clientToken":"private-fixture-value",');
  assert.throws(() => facebook.loadConfig({ env: {}, file }), error => {
    assert.equal(error.message, "Cannot read Facebook local configuration as JSON");
    assert.doesNotMatch(error.stack, /private-fixture-value/);
    return true;
  });
});

test("Missing config fails by default; only explicitly disabled fixtures allow both absent", context => {
  const file = temporaryConfig(context);
  assert.throws(() => facebook.loadConfig({ env: {}, file }), /requires both/);
  assert.equal(facebook.loadConfig({ env: {}, file, required: false }), null);
  for (const input of [{ appId: fixture.appId }, { clientToken: fixture.clientToken },
    { appId: "", clientToken: "" }, { appId: 123456789, clientToken: fixture.clientToken },
    { ...fixture, appId: "123</string>" }, { ...fixture, clientToken: "private-fixture-value\n" },
    { ...fixture, clientToken: "private-fixture-value\u0000" }, null, []]) {
    fs.writeFileSync(file, JSON.stringify(input));
    assert.throws(() => facebook.loadConfig({ env: {}, file, required: false }), error => {
      assert.doesNotMatch(error.stack, /private-fixture-value/);
      return true;
    });
  }
  assert.throws(() => facebook.loadConfig({ env: { IOS_FACEBOOK_APP_ID: "", IOS_FACEBOOK_CLIENT_TOKEN: "" }, file, required: false }));
});

test("Plist values are XML escaped and privacy flags are disabled, including SDK-free fixtures", () => {
  const entries = facebook.plistEntries({ ...fixture, clientToken: "fixture&<>\"'" });
  assert.ok(entries.includes("<string>fixture&amp;&lt;&gt;&quot;&apos;</string>"));
  for (const config of [fixture, null]) {
    const plist = facebook.plistEntries(config);
    for (const key of ["FacebookAutoInitEnabled", "FacebookAutoLogAppEventsEnabled", "FacebookAdvertiserIDCollectionEnabled", "FacebookSKAdNetworkReportEnabled"]) {
      assert.ok(plist.includes(`<key>${key}</key><false/>`));
    }
    assert.ok(plist.includes("<key>FacebookLoggingBehavior</key><array/>"));
    assert.doesNotMatch(plist, /NSUserTrackingUsageDescription/);
  }
  assert.doesNotMatch(facebook.plistEntries(null), /FacebookAppID|FacebookClientToken/);
  assert.equal(facebook.urlType(null), "");
  assert.ok(facebook.urlType(fixture).includes("<string>fb123456789</string>"));
});

test("Release staging requires matching credentials, callback scheme and privacy settings", () => {
  assert.deepEqual(facebook.validateStagedConfig(staged(), { required: true, expected: fixture }), fixture);
  assert.equal(facebook.validateStagedConfig(staged(null)), null);
  assert.throws(() => facebook.validateStagedConfig(staged(null), { required: true }));
  assert.throws(() => facebook.validateStagedConfig(staged(null), { expected: fixture }));
  for (const override of [{ TeleTypTelFacebookEnabled: false }, { FacebookAppID: "987654321" },
    { FacebookClientToken: "different-private-fixture" }, { CFBundleURLTypes: [] },
    { FacebookAutoLogAppEventsEnabled: true }, { FacebookAdvertiserIDCollectionEnabled: true },
    { FacebookSKAdNetworkReportEnabled: true }, { FacebookAutoInitEnabled: true },
    { FacebookLoggingBehavior: ["debug"] }, { NSUserTrackingUsageDescription: "Track" }]) {
    assert.throws(() => facebook.validateStagedConfig({ ...staged(), ...override }, { required: true, expected: fixture }), error => {
      assert.doesNotMatch(error.stack, /different-private-fixture/);
      return true;
    });
  }
});

test("Official Facebook Core and Login products are exactly pinned alongside Google and Capacitor", () => {
  const original = read("../../ios/App/CapApp-SPM/Package.swift");
  const updated = facebook.addFacebookPackage(google.addGooglePackage(original));
  assert.equal(facebook.sdkVersion, "18.1.1");
  assert.ok(updated.includes('https://github.com/meta/facebook-ios-sdk.git", exact: "18.1.1"'));
  for (const name of ["FacebookCore", "FacebookLogin"]) {
    assert.ok(updated.includes(`.product(name: "${name}", package: "facebook-ios-sdk")`));
  }
  assert.match(updated, /GoogleSignIn-iOS.git", exact: "9.0.0"/);
  assert.match(updated, /product\(name: "Capacitor"/);
  assert.doesNotMatch(updated, /FacebookShare|FacebookGaming/);
  assert.throws(() => facebook.addFacebookPackage(updated));
  assert.throws(() => facebook.addFacebookPackage("unknown package structure"));
});

test("Delegate initialization and callback handling preserve Google, Capacitor and disabled builds", () => {
  const handler = "return ApplicationDelegateProxy.shared.application(app, open: url, options: options)";
  const original = read("../../ios/App/App/AppDelegate.swift").replace(handler,
    "if GIDSignIn.sharedInstance.handle(url) { return true }\n        " + handler);
  const updated = facebook.configureDelegate(original);
  assert.match(updated, /canImport\(FacebookCore\) && canImport\(FacebookLogin\)/);
  assert.match(updated, /ApplicationDelegate.shared.application\(application, didFinishLaunchingWithOptions: launchOptions\)/);
  assert.match(updated, /AppEvents.shared.flushBehavior = .explicitOnly/);
  assert.match(updated, /Settings.shared.isAutoLogAppEventsEnabled = false/);
  assert.match(updated, /Settings.shared.isAdvertiserIDCollectionEnabled = false/);
  assert.match(updated, /url.scheme == "fb" \+ appID/);
  assert.ok(updated.indexOf("GIDSignIn.sharedInstance.handle(url)") < updated.indexOf("ApplicationDelegate.shared.application(app, open: url"));
  assert.ok(updated.includes(handler));
  assert.match(updated, /ApplicationDelegateProxy.shared.application\(application, continue: userActivity/);
  assert.throws(() => facebook.configureDelegate(updated));
  assert.throws(() => facebook.configureDelegate("unknown delegate"));
});

test("Native Facebook uses the unmodified server nonce and AuthenticationToken, with main-queue deferred logout", () => {
  const source = read("FacebookSignInPlugin.swift");
  assert.match(source, /jsName = "TeleTypTelFacebook"/);
  assert.match(source, /call.getString\("appId"\) == appID/);
  assert.match(source, /let nonce = call.getString\("nonce"\)/);
  assert.match(source, /nonce.utf8.count == 64/);
  assert.match(source, /nonce.rangeOfCharacter\(from: CharacterSet\(charactersIn: "0123456789abcdefABCDEF"\).inverted\) == nil/);
  assert.match(source, /tracking: \.limited, nonce: nonce/);
  assert.match(source, /logIn\(viewController: presenter, configuration: configuration\) \{ result in\s+DispatchQueue.main.async \{\s+defer \{\s+self.loginManager.logOut\(\)\s+self.signingIn = false/);
  assert.match(source, /AuthenticationToken.current, token.nonce == nonce/);
  assert.match(source, /call.resolve\(\["token": token.tokenString\]\)/);
  for (const code of ["BUSY", "CANCELLED", "UNTRUSTED_ORIGIN", "CONFIGURATION", "INVALID_NONCE", "MISSING_TOKEN"]) assert.ok(source.includes(`"${code}"`));
  assert.equal((source.match(/guard self.trustedPage/g) || []).length, 2);
  assert.doesNotMatch(source, /accessToken|idToken|SHA256|CryptoKit|hash|ATTrackingManager|requestTrackingAuthorization|print\(/);
  assert.match(read("LanViewController.swift"), /registerPluginInstance\(TeleTypTelFacebookPlugin\(\)\)/);
});

test("Native bridge accepts only the exact Facebook native route and gates main-frame messages", () => {
  const source = read("ServerBridge.swift");
  const expression = source.match(/let allowed = #"([^\r\n]+)"#/)[1];
  const allowed = new RegExp(expression);
  assert.ok(allowed.test("/api/auth/facebook/native.php"));
  assert.ok(allowed.test("/api/auth/google/native.php"));
  for (const route of ["/api/auth/facebook/other.php", "/api/auth/facebook/native.php/extra", "/api/auth/facebook/nativeXphp",
    "/api/auth/facebook/%6eative.php", "/api/auth/facebook/../native.php", "/api/auth/facebook/native.php%00"]) {
    assert.equal(allowed.test(route), false);
  }
  assert.match(source, /guard message.frameInfo.isMainFrame, isBundledMessenger\(message.frameInfo.request.url\)/);
});

test("Prepare requires config by default and build verifies upload staging and archive", () => {
  const prepare = read("prepare.js");
  const build = read("build.js");
  assert.match(prepare, /facebook.loadConfig\(\{ required: !process.argv.includes\("--allow-unconfigured-facebook"\)/);
  assert.match(build, /expectedFacebook = upload \? facebook.loadConfig\(\) : undefined/);
  assert.match(build, /validateStagedConfig\(stagedPlist, \{ required: upload, expected: expectedFacebook \}\)/);
  assert.match(build, /if \(facebookConfig\) facebook.configureFacebookPackage\(project\)/);
  assert.match(build, /path.join\(app, "Info.plist"\).*required: true, expected: expectedFacebook/);
  for (const line of prepare.split(/\r?\n/).filter(line => /settings\.json|source\.json/.test(line))) {
    assert.doesNotMatch(line, /facebookConfig|clientToken/);
  }
  assert.doesNotMatch(build.match(/const result = .*;/)[0], /facebook|clientToken/i);
});
