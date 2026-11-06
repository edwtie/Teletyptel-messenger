const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { prepare, projectText } = require("../scripts/prepare-ios-native");

const root = path.resolve(__dirname, "..");
const native = path.join(root, "mobile/ios-native");
const read = file => fs.readFileSync(path.join(native, file), "utf8");

test("Native preview has separate identity, no web runtime, upload or signing configuration", () => {
  const { project, scheme } = projectText();
  assert.match(project, /com\.tiedragon\.teletyptel\.nativepreview;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = "1,2"/);
  assert.match(project, /CODE_SIGNING_ALLOWED = NO/);
  assert.match(scheme, /NativeStartupUITests/);
  assert.match(scheme, /buildForArchiving="NO"/);
  assert.doesNotMatch(project, /Capacitor|WebKit|facebook|p8|DEVELOPMENT_TEAM|PROVISIONING_PROFILE/);
  assert.doesNotMatch(read("App/TeleTypTelNativeApp.swift"), /WKWebView|CAPBridge|\.focused\(|becomeFirstResponder/);
  assert.doesNotMatch(read("App/Info.plist"), /NSAllowsArbitraryLoads|UIBackgroundModes|NSCameraUsageDescription/);
});

test("Project generation is isolated, repeatable and refuses overwriting an existing build", () => {
  for (const name of ["", "../ios", "ios-testflight", "ios-native-../../escape"]) assert.throws(() => prepare(name));
  const name = "ios-native-test-" + process.pid + "-" + Date.now();
  const directory = prepare(name);
  assert.equal(path.dirname(directory), path.join(root, "artifacts"));
  assert.equal(fs.readFileSync(path.join(directory, "TeleTypTelNative.xcodeproj/project.pbxproj"), "utf8"), projectText().project);
  assert.ok(fs.existsSync(path.join(directory, "Assets.xcassets/TeleTypTelLogo.imageset/logo.png")));
  assert.throws(() => prepare(name), /already exists/);
});

test("Native probe has transport, privacy and response limits", () => {
  const client = read("Sources/TeleTypTelCore/XMPPAvailabilityClient.swift");
  for (const required of ['protocols: ["xmpp"]', 'protocol` == "xmpp"', "socket.maximumMessageSize = 65536",
    "URLSessionConfiguration.ephemeral", "settings.httpCookieStorage = nil", "settings.urlCredentialStorage = nil",
    "completionHandler(nil)", "withTaskCancellationHandler", ".now() + 8", "session?.invalidateAndCancel()"])
    assert.ok(client.includes(required), required);
  assert.doesNotMatch(client, /URLCredential\(|SecTrust|UserDefaults|print\(|NSLog|Authorization/);
  const parser = read("Sources/TeleTypTelCore/XMPPProbeStream.swift");
  for (const required of ["bytes <= 65536", "stack.count < 8", "count <= 128", "shouldResolveExternalEntities = false",
    "root.namespace == Self.framing", "root.namespace == Self.streams", "mechanism.namespace == Self.sasl"])
    assert.ok(parser.includes(required), required);
});

test("Swift unit suite for native configuration, lifecycle, parser and cancellation", {
  skip: process.platform !== "darwin" && "Requires macOS Swift; source checks are not runtime proof"
}, () => {
  execFileSync("swift", ["test", "--package-path", native, "--scratch-path",
    path.join(root, "artifacts", "ios-native-swift-tests-" + Date.now())], { timeout: 180000, stdio: "pipe" });
});

test("Native authenticated connection is isolated, gated and does not persist credentials", () => {
  const account = read("Sources/TeleTypTelCore/NativeAccountClient.swift");
  const session = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  const stream = read("Sources/TeleTypTelCore/XMPPSessionStream.swift");
  for (const required of ['"api/account.php"', '"action": "login"', '"rememberPassword": false',
    'reply.twoFactorRequired != true', 'NativeAccountFailure.twoFactorRequired', 'data.count < 1048576',
    'URLSessionConfiguration.ephemeral', 'settings.httpCookieStorage = nil', 'completionHandler(nil)', 'Task.checkCancellation()'])
    assert.ok(account.includes(required), required);
  for (const required of ['protocols: ["xmpp"]', 'protocol` == "xmpp"', 'socket.maximumMessageSize = 65536',
    'withTaskCancellationHandler', 'stream.close()', 'session?.invalidateAndCancel()', '.now() + 10', '.now() + 25'])
    assert.ok(session.includes(required), required);
  for (const required of ['root.attributes["id"] == bindID', 'parts[0] == expectedJID', 'phase = .reopening',
    'handshakeBytes <= 65536', 'self.account = nil', 'trustedSender', 'ProbeXML.parse(message)'])
    assert.ok(stream.includes(required), required);
  assert.doesNotMatch(account + session + stream, /UserDefaults|print\(|NSLog|SecTrust|URLCredential\(/);
  const { project } = projectText();
  for (const file of ['NativeAccountClient.swift', 'XMPPSessionStream.swift', 'NativeXMPPConnection.swift'])
    assert.ok(project.includes('Core/' + file), file);
  assert.ok(fs.existsSync(path.join(native, 'Tests/TeleTypTelCoreTests/XMPPSessionTests.swift')));
});
