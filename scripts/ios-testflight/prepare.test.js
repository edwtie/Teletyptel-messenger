const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { settings } = require("./settings");
const { project, webAssets } = require("./prepare");
const { validateProfile } = require("./build");

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

test("Only minimal offline assets are packaged", () => {
  assert.deepEqual(fs.readdirSync(path.join(project, "www")).sort(), [...webAssets, "chat.html", "connection.js"].sort());
  const config = JSON.parse(fs.readFileSync(path.join(project, "capacitor.config.json"), "utf8"));
  assert.equal(config.webDir, "www");
  assert.equal(config.appId, "com.tiedragon.teletyptel");
  assert.equal(new URL(config.server.url).protocol, "https:");
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

test("Capacitor's local startup file exists even when using a remote server", () => {
  const config = JSON.parse(fs.readFileSync(path.join(project, "capacitor.config.json"), "utf8"));
  const startFile = path.join(project, "www", config.server.appStartPath.replace(/^\/+/, ""));
  assert.ok(fs.existsSync(startFile), "Missing bundled startup file: Capacitor exits before loading the remote URL");
  assert.equal(fs.readFileSync(startFile, "utf8"), fs.readFileSync(path.join(project, "www/index.html"), "utf8"));
});
