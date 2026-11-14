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
  assert.match(configuration, /mod_roster: \{\}/);
  assert.match(configuration, /mod_admin_extra: \{\}/);
  assert.match(configuration, /mod_mam:\s+db_type: mnesia\s+default: always/);
  assert.match(configuration, /mod_muc:\s+host: conference.localhost\s+access_create: none/);
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

test("Jingle harness exercises real resource-bound IQ exchange without media or push activation", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "mobile/ios-native/Tests/NativeXMPPIntegrationTests/NativeJingleIntegrationTests.swift"), "utf8");
  assert.equal((source.match(/func test/g) || []).length, 1);
  for (const required of ["XCTSkip", "TELETYPTEL_EJABBERD_FIXTURE", '"github-hosted"',
    "https://localhost:", "NativeXMPPConnection().run", "exchangeJingle", "replyJingle", "unbindCall",
    "CancellationError", ".timedOut", ".staleBinding", ".disconnected"])
    assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /URLCredential|SecTrust|URLProtocol|PKPushRegistry|RTCPeerConnection/);
  const harness = fs.readFileSync(path.join(root, "scripts/check-ios-native-ejabberd.js"), "utf8");
  assert.match(harness, /runSwift\("NativeJingleIntegrationTests", "native-jingle-tests.txt"\)/);
  assert.match(harness, /nativeJingleTransportTested = true/);
  assert.match(harness, /attempt < 10/);
  assert.match(harness, /save\("remaining-sessions.txt", remaining\)/);
  assert.match(harness, /if \(remaining\) \{[\s\S]*throw new Error\("A native XMPP session remained after cancellation"\)/);
});

test("MAM test restores isolated direct history with real two-account transports", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "mobile/ios-native/Tests/NativeXMPPIntegrationTests/NativeArchiveIntegrationTests.swift"), "utf8");
  assert.equal((source.match(/func test/g) || []).length, 2);
  for (const required of ["XCTSkip", "TELETYPTEL_EJABBERD_FIXTURE", '"github-hosted"',
    "NativeXMPPConnection().run", "fetchArchive", "before: archived.messages[1].archiveID", "restoredConnection",
    "mergeArchive", ".submitted", ".disconnected", "testRealServerRoutesAndArchivesAuthorScopedCorrectionAndRetraction",
    "changeMessage", "live.messages.first?.retracted", "restoredMessage?.retracted"])
    assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /URLCredential|SecTrust|URLProtocol|PKPushRegistry|RTCPeerConnection/);
  const harness = fs.readFileSync(path.join(root, "scripts/check-ios-native-ejabberd.js"), "utf8");
  assert.match(harness, /runSwift\("NativeArchiveIntegrationTests", "native-archive-tests.txt"\)/);
  assert.match(harness, /nativeArchiveTransportTested = true/);
});

test("MUC test verifies private membership and post-leave refusal on an isolated server", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "mobile/ios-native/Tests/NativeXMPPIntegrationTests/NativeGroupIntegrationTests.swift"), "utf8");
  for (const required of ["XCTSkip", '"github-hosted"', "NativeXMPPConnection().run", "joinGroup", "sendGroup",
    "leaveGroup", "outsiderCount, 0", "directCount, 0", "missing@conference.localhost", ".disconnected"])
    assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /URLCredential|SecTrust|URLProtocol/);
  const harness = fs.readFileSync(path.join(root, "scripts/check-ios-native-ejabberd.js"), "utf8");
  assert.match(harness, /runSwift\("NativeGroupIntegrationTests", "native-group-tests.txt"\)/);
  assert.match(harness, /members_only: true/);
});

test("Invitation fixture checks real room mediation, decline and explicit acceptance", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "mobile/ios-native/Tests/NativeXMPPIntegrationTests/NativeInvitationIntegrationTests.swift"), "utf8");
  for (const required of ['XCTSkip', '"github-hosted"', 'observeGroupInvitations', 'inviteToGroup',
    'declineGroupInvitation', 'Must not autojoin', 'joinGroup', 'acceptedCount, 1', 'declinedCount, 0', 'directCount, 0'])
    assert.ok(source.includes(required), required);
  assert.doesNotMatch(source, /URLCredential|SecTrust|URLProtocol/);
  const harness = fs.readFileSync(path.join(root, "scripts/check-ios-native-ejabberd.js"), "utf8");
  assert.match(harness, /runSwift\("NativeInvitationIntegrationTests", "native-invitation-tests.txt"\)/);
  assert.match(harness, /control\("set_room_affiliation", invitationRoom, "conference.localhost", username, "localhost", "owner"\)/);
  for (const required of ['manageGroup(.configure', 'Non-owner configured', '"visitor"', '"outcast"', 'createGroup', 'createdConfiguration.membersOnly'])
    assert.ok(source.includes(required), required);
  assert.throws(() => serverConfiguration(path.resolve("artifacts/fake-only"), 15280, 15281, "ordinary-user"));
  const allowed = serverConfiguration(path.resolve("artifacts/fake-only"), 15280, 15281, "native-test-0123456789abcdef");
  assert.match(allowed, /allow: native_creator\s+deny: all/);
  assert.match(allowed, /access_create: native_create/);
});
