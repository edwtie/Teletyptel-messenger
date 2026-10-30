const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { settings } = require("./settings");
const { project, webAssets } = require("./prepare");
const { assetFiles } = require("./bundle-frontend");
const { validateProfile } = require("./build");
const google = require("./google-signin");

test("Only an unexpired distribution profile for this app is accepted", () => {
  const config = settings("https://example.test/chat.html");
  const profile = {
    TeamIdentifier: [config.teamId],
    UUID: "00000000-0000-0000-0000-000000000001",
    ExpirationDate: new Date(Date.now() + 86400000).toISOString(),
    DeveloperCertificates: ["fixture"],
    Entitlements: {
      "application-identifier": config.teamId + "." + config.bundleId,
      "com.apple.developer.team-identifier": config.teamId,
      "get-task-allow": false
    }
  };
  assert.doesNotThrow(() => validateProfile(profile, config));
  for (const override of [{ TeamIdentifier: ["OTHER"] }, { ExpirationDate: "2000-01-01" },
    { ExpirationDate: "invalid" }, { DeveloperCertificates: [] }, { UUID: "../../escape" },
    { ProvisionedDevices: ["device"] }, { ProvisionsAllDevices: true },
    { Entitlements: { ...profile.Entitlements, "get-task-allow": true } },
    { Entitlements: { ...profile.Entitlements, "application-identifier": "other.app" } }]) {
    assert.throws(() => validateProfile({ ...profile, ...override }, config));
  }
});

test("Server URL and build number reject unsafe values", () => {
  for (const url of ["http://192.168.0.1/chat.html", "https://localhost/chat.html", "https://user:secret@example.test/chat.html", "https://example.test/chat.html?key=secret", "https://example.test/admin/"]) {
    assert.throws(() => settings(url));
  }
  assert.throws(() => settings("https://example.test/chat.html", "1; echo unsafe"));
  const config = settings("https://example.test/chat.html", "2.1");
  assert.equal(config.capacitor.server.cleartext, false);
  assert.equal(config.capacitor.plugins.CapacitorHttp.enabled, false);
  assert.equal(config.capacitor.ios.webContentsDebuggingEnabled, false);
});

test("Only allowlisted Messenger assets and the native adapter are packaged", () => {
  const walk = (directory, prefix = "") => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name), prefix + entry.name + "/") : [prefix + entry.name]);
  const files = walk(path.join(project, "www"));
  assert.deepEqual(files.sort(), [...new Set([...webAssets, ...assetFiles(), "connection.js", "native-server.js", "native-startup.css"])].sort());
  assert.ok(files.every(file => !/postnl|demo|config\/|\.php|uploads\/|admin\//i.test(file)));
  const config = JSON.parse(fs.readFileSync(path.join(project, "capacitor.config.json"), "utf8"));
  assert.equal(config.webDir, "www");
  assert.equal(config.appId, "com.tiedragon.teletyptel");
  assert.equal(config.server.url, undefined);
  assert.equal(config.server.appStartPath, "/chat.html");
  assert.equal(config.server.allowNavigation, undefined);
});

test("Native TLS uses system validation only for the configured host", () => {
  const native = fs.readFileSync(path.join(project, "ios/App/App/AppDelegate.swift"), "utf8");
  assert.match(native, /challenge\.protectionSpace\.host == host/);
  assert.match(native, /completionHandler\(\.performDefaultHandling, nil\)/);
  assert.doesNotMatch(native, /useCredential|SecTrustSetAnchor|URLCredential\(trust|iosSmoke|example\.test/);
  const plist = fs.readFileSync(path.join(project, "ios/App/App/Info.plist"), "utf8");
  assert.match(plist, /NSLocalNetworkUsageDescription/);
  assert.doesNotMatch(plist, /NSAllowsArbitraryLoads|NSExceptionAllowsInsecureHTTPLoads/);
});

test("The bundled startup file contains the real Messenger, not a server redirect", () => {
  const config = JSON.parse(fs.readFileSync(path.join(project, "capacitor.config.json"), "utf8"));
  const startFile = path.join(project, "www", config.server.appStartPath.replace(/^\/+/, ""));
  assert.ok(fs.existsSync(startFile), "Missing bundled startup file: Capacitor exits before loading the remote URL");
  const html = fs.readFileSync(startFile, "utf8");
  assert.match(html, /id="messageInput"/);
  assert.match(html, /src="native-server.js"/);
  assert.match(html, /id="accountDialogTitle" tabindex="-1"/);
  assert.ok(html.indexOf('src="native-server.js"') < html.indexOf('src="chat-client.js'));
});

test("Google native sign-in uses the supplied iOS client and a separate server client", () => {
  const plist = fs.readFileSync(path.join(project, "ios/App/App/Info.plist"), "utf8");
  assert.ok(plist.includes(google.clientId));
  assert.ok(plist.includes(google.serverClientId));
  assert.ok(plist.includes(google.urlScheme));
  assert.notEqual(google.clientId, google.serverClientId);
  assert.equal(google.urlScheme, "com.googleusercontent.apps.1072417513685-ntq135e2sdh73aufi552h0ml5l95s8no");
  assert.equal((plist.match(/<key>CFBundleURLTypes<\/key>/g) || []).length, 1);
  const native = fs.readFileSync(path.join(project, "ios/App/App/AppDelegate.swift"), "utf8");
  assert.match(native, /GIDSignIn.sharedInstance.handle\(url\)/);
  assert.match(native, /registerPluginInstance\(TeleTypTelGooglePlugin\(\)\)/);
  assert.match(native, /serverAuthCode/);
  assert.match(native, /isBundledMessenger\(bridge\?\.webView\?\.url\)/);
  assert.match(native, /url.scheme == "capacitor" && url.host == "localhost"/);
  assert.match(native, /call.getString\("serverClientId"\) == serverClientID/);
  assert.match(native, /error as\? GIDSignInError/);
  assert.doesNotMatch(native, /GIDSignInErrorCode/);
  assert.doesNotMatch(native, /client_secret|clientSecret|accessToken|idToken/);
});

test("Google package is pinned and added after Capacitor sync without duplicating dependencies", () => {
  const manifest = fs.readFileSync(path.join(project, "ios/App/CapApp-SPM/Package.swift"), "utf8");
  const updated = google.addGooglePackage(manifest);
  assert.match(updated, /GoogleSignIn-iOS.git", exact: "9.0.0"/);
  assert.match(updated, /product\(name: "GoogleSignIn", package: "GoogleSignIn-iOS"\)/);
  assert.throws(() => google.addGooglePackage(updated));
  assert.throws(() => google.addGooglePackage("unrecognized manifest"));
});
