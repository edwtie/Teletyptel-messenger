const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { requireHostedMac, serverConfiguration, redact } = require("../scripts/check-ios-native-ejabberd");

test("Real-server harness refuses local machines and self-hosted runners", () => {
  for (const [platform, environment] of [["win32", {}], ["darwin", {}], ["darwin", {
    GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted"
  }], ["linux", { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted" }]]) {
    assert.throws(() => requireHostedMac(platform, environment), /ephemeral/);
  }
  assert.doesNotThrow(() => requireHostedMac("darwin", { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted" }));
});

test("Isolated ejabberd exposes only loopback WSS and no federation or public registration", () => {
  const directory = path.resolve("artifacts", "fake-only");
  const configuration = serverConfiguration(directory, 15280, 15281);
  assert.equal(configuration.match(/ip: "127.0.0.1"/g).length, 1);
  assert.equal(configuration.match(/tls: true/g).length, 1);
  assert.equal(configuration.match(/\/xmpp-websocket: ejabberd_http_ws/g).length, 1);
  assert.doesNotMatch(configuration, /untrusted\.pem|certfile:/);
  assert.match(configuration, /s2s_access: none/);
  assert.match(configuration, /auth_password_format: scram/);
  assert.doesNotMatch(configuration, /mod_register|mod_http_api|ejabberd_c2s|0\.0\.0\.0|5269/);
  for (const ports of [[80, 15281], [15280, 15280], [15280, 65536], [15280, "15281"]]) {
    assert.throws(() => serverConfiguration(directory, ...ports));
  }
  assert.throws(() => serverConfiguration("relative", 15280, 15281));
});

test("Evidence redacts random test credentials and authentication payloads", () => {
  const password = "fictional-secret";
  const encoded = Buffer.from("\0native-test-example\0" + password).toString("base64");
  assert.equal(redact(`${password} ${encoded} ${password}`, [password, encoded]), "[redacted] [redacted] [redacted]");
});

test("Network tests are opt-in, use actual transports and leave application trust untouched", () => {
  const root = path.resolve(__dirname, "..");
  const swift = fs.readFileSync(path.join(root, "mobile/ios-native/Tests/NativeXMPPIntegrationTests/EjabberdIntegrationTests.swift"), "utf8");
  assert.equal((swift.match(/func test/g) || []).length, 7);
  for (const text of ["XCTSkip", "TELETYPTEL_EJABBERD_FIXTURE", "XMPPAvailabilityClient().check",
    "NativeXMPPConnection().run", "40_000_000_000", "authenticationRejected", 'host: "127.0.0.1"']) assert.ok(swift.includes(text), text);
  assert.doesNotMatch(swift, /URLCredential|SecTrust|URLProtocol|NativeLoginUIFixture/);
  const harness = fs.readFileSync(path.join(root, "scripts/check-ios-native-ejabberd.js"), "utf8");
  assert.match(harness, /"add-trusted-cert", "-d", "-r", "deny"/);
  assert.match(harness, /"delete-certificate", "-Z", certificateFingerprint/);
  assert.doesNotMatch(harness, /authorizationdb|remove-trusted-cert|trust-settings-import/);
  assert.match(harness, /TELETYPTEL_EJABBERD_TRUST_PHASE: "revoked"/);
  assert.match(harness, /caTrustRevocationVerified = true/);
  assert.match(harness, /residualDenyRecord/);
  assert.match(swift, /TELETYPTEL_EJABBERD_TRUST_PHASE/);
  assert.match(swift, /previously trusted fixture must fail after CA revocation/);
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/ios-native-ejabberd.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches: \[codex\/teletyptel-beta-polish\]/);
  assert.match(workflow, /paths:[\s\S]*scripts\/check-ios-native-ejabberd\.js/);
  assert.doesNotMatch(workflow, /pull_request|secrets\.|testflight|app-store-connect/i);
  assert.match(workflow, /path: artifacts\/ios-native-ejabberd-\*\/reports\//);
});
