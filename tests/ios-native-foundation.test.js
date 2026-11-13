const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { prepare, projectText } = require("../scripts/prepare-ios-native");
const { executeLogged, collectTestResults } = require("../scripts/check-ios-native");
const { checkMedia } = require("../scripts/check-ios-native-media");

const root = path.resolve(__dirname, "..");
const native = path.join(root, "mobile/ios-native");
const read = file => fs.readFileSync(path.join(native, file), "utf8");

function diagnosticDirectory() {
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  return fs.mkdtempSync(path.join(artifacts, "ios-native-diagnostics-test-"));
}

test("Native media runner requires runtime results for every profile and keeps failed evidence", () => {
  const directory = diagnosticDirectory();
  const reports = path.join(directory, "reports");
  fs.mkdirSync(reports);
  fs.mkdirSync(path.join(directory, "DerivedData/SourcePackages/artifacts/sdk/WebRTC.xcframework/macos-x86_64_arm64/WebRTC.framework"), { recursive: true });
  const complete = ["audio", "video", "audio-rtt", "total"].map(profile => "Native media profile passed: " + profile + "\n").join("") +
    "Native incoming peer provider passed\nNative audio/video/RTT negotiation loopback passed\n";
  const result = checkMedia({ root, directory, reports, logged: name => name === "media-runtime" ? complete : "compiled" });
  assert.equal(result.passed, true);
  assert.equal(result.profiles.length, 4);
  assert.throws(() => checkMedia({ root, directory, reports, logged: () => "compiled" }), /Missing native media result/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(reports, "native-media-result.json"))).passed, false);
  assert.throws(() => checkMedia({ root, directory, reports, logged: () => { throw new Error("compile failed"); } }), /compile failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(reports, "native-media-result.json"))).passed, false);
});

test("Native runner retains successful command output", () => {
  const reports = diagnosticDirectory();
  assert.equal(executeLogged("fixture", [], { root, reports, name: "unit", execute: () => "passed\n" }), "passed\n");
  assert.equal(fs.readFileSync(path.join(reports, "unit.txt"), "utf8"), "passed\n");
});

test("Native runner retains assertion output and propagates the original failure", () => {
  const reports = diagnosticDirectory();
  const failure = Object.assign(new Error("xcodebuild failed"), {
    stdout: "XCTAssert failed at fixture.swift:10", stderr: "TEST FAILED", status: 65, signal: null
  });
  assert.throws(() => executeLogged("xcodebuild", [], {
    root, reports, name: "iPhone-tests", execute: () => { throw failure; }
  }), error => error === failure);
  assert.equal(fs.readFileSync(path.join(reports, "iPhone-tests.txt"), "utf8"), failure.stdout);
  assert.equal(fs.readFileSync(path.join(reports, "iPhone-tests-stderr.txt"), "utf8"), failure.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(reports, "iPhone-tests-failure.json"))).status, 65);
});

test("Native runner preserves timeout cause even if stderr contains only a warning", () => {
  const reports = diagnosticDirectory();
  const failure = Object.assign(new Error("spawnSync xcodebuild ETIMEDOUT"), {
    stdout: "Testing started", stderr: "destination warning", code: "ETIMEDOUT", signal: "SIGTERM"
  });
  assert.throws(() => executeLogged("xcodebuild", [], {
    root, reports, name: "iPhone-tests", execute: () => { throw failure; }
  }), error => error === failure);
  const report = JSON.parse(fs.readFileSync(path.join(reports, "iPhone-tests-failure.json")));
  assert.equal(report.code, "ETIMEDOUT");
  assert.equal(report.signal, "SIGTERM");
});

test("Native runner exports structured result evidence without hiding export failures", () => {
  const reports = diagnosticDirectory();
  const bundle = path.join(reports, "iPhone.xcresult");
  fs.mkdirSync(bundle);
  collectTestResults(bundle, { root, reports, family: "iPhone", execute: (command, args) => {
    assert.equal(command, "xcrun");
    assert.deepEqual(args.slice(0, 3), ["xcresulttool", "get", "test-results"]);
    if (args[3] === "summary") return JSON.stringify({ failedTests: 1 });
    throw new Error("Incomplete result bundle");
  } });
  assert.equal(JSON.parse(fs.readFileSync(path.join(reports, "iPhone-summary.json"))).failedTests, 1);
  assert.match(fs.readFileSync(path.join(reports, "iPhone-tests-export-error.txt"), "utf8"), /Incomplete result bundle/);
  collectTestResults(path.join(reports, "missing.xcresult"), {
    root, reports, family: "iPad", execute: () => assert.fail("Missing bundle must not be read")
  });
});

test("Native preview has separate identity, no web runtime, upload or signing configuration", () => {
  const { project, scheme } = projectText();
  assert.match(project, /com\.tiedragon\.teletyptel\.nativepreview;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = "1,2"/);
  assert.match(project, /CODE_SIGNING_ALLOWED = NO/);
  assert.match(scheme, /NativeStartupUITests/);
  assert.match(scheme, /buildForArchiving="NO"/);
  assert.doesNotMatch(project, /Capacitor|WebKit|facebook|p8|DEVELOPMENT_TEAM|PROVISIONING_PROFILE/);
  assert.doesNotMatch(read("App/TeleTypTelNativeApp.swift"), /WKWebView|CAPBridge|\.focused\(|becomeFirstResponder/);
  const plist = read("App/Info.plist");
  assert.doesNotMatch(plist, /NSAllowsArbitraryLoads|UIBackgroundModes/);
  assert.match(plist, /NSCameraUsageDescription/);
  assert.match(plist, /NSMicrophoneUsageDescription/);
});

test("Project generation is isolated, repeatable and refuses overwriting an existing build", () => {
  for (const name of ["", "../ios", "ios-testflight", "ios-native-../../escape"]) assert.throws(() => prepare(name));
  const name = "ios-native-test-" + process.pid + "-" + Date.now();
  const directory = prepare(name);
  assert.equal(path.dirname(directory), path.join(root, "artifacts"));
  assert.equal(fs.readFileSync(path.join(directory, "TeleTypTelNative.xcodeproj/project.pbxproj"), "utf8"), projectText().project);
  assert.ok(fs.existsSync(path.join(directory, "Assets.xcassets/TeleTypTelLogo.imageset/logo.png")));
  assert.equal(fs.readFileSync(path.join(directory, "Core/NativeRoster.swift"), "utf8"),
    read("Sources/TeleTypTelCore/NativeRoster.swift"));
  for (const [target, source] of [
    ["Core/NativeChat.swift", "Sources/TeleTypTelCore/NativeChat.swift"],
    ["Core/NativeIncomingCall.swift", "Sources/TeleTypTelCore/NativeIncomingCall.swift"],
    ["Core/NativeCallCoordinator.swift", "Sources/TeleTypTelCore/NativeCallCoordinator.swift"],
    ["Core/NativeJingleTransport.swift", "Sources/TeleTypTelCore/NativeJingleTransport.swift"],
    ["Core/NativeJingleMedia.swift", "Sources/TeleTypTelCore/NativeJingleMedia.swift"],
    ["Core/NativeLocalMediaSDP.swift", "Sources/TeleTypTelCore/NativeLocalMediaSDP.swift"],
    ["Core/NativeJingleSession.swift", "Sources/TeleTypTelCore/NativeJingleSession.swift"],
    ["App/NativeMediaPeer.swift", "App/NativeMediaPeer.swift"],
    ["App/NativeMediaCapture.swift", "App/NativeMediaCapture.swift"],
    ["App/NativeOutgoingPeerNegotiator.swift", "App/NativeOutgoingPeerNegotiator.swift"],
    ["App/NativeIncomingPeerNegotiator.swift", "App/NativeIncomingPeerNegotiator.swift"],
    ["App/NativeCallPlatform.swift", "App/NativeCallPlatform.swift"],
    ["App/NativeCallMedia.swift", "App/NativeCallMedia.swift"],
    ["App/NativeChatView.swift", "App/NativeChatView.swift"],
    ["App/NativeBackgroundController.swift", "App/NativeBackgroundController.swift"]
  ]) {
    assert.equal(fs.readFileSync(path.join(directory, target), "utf8"), read(source));
    assert.ok(projectText().project.includes(target), target);
  }
  assert.throws(() => prepare(name), /already exists/);
  for (const file of ["NativeT140Session.swift", "NativeWebRTCChannel.swift"]) {
    assert.equal(fs.readFileSync(path.join(directory, "Media", file), "utf8"),
      fs.readFileSync(path.join(root, "scripts/ios-testflight", file), "utf8"));
  }
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
  const scratch = path.join(root, "artifacts", "ios-native-check-unit-" + Date.now());
  const reports = path.join(scratch, "reports");
  fs.mkdirSync(reports, { recursive: true });
  try {
    executeLogged("swift", ["test", "--package-path", native, "--scratch-path", path.join(scratch, "build")],
      { root, reports, name: "swift-tests", timeout: 180000 });
  } catch (error) {
    process.stderr.write(String(error.stdout || ""));
    throw error;
  }
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

test("Native login session exposes bounded Jingle delivery only while connected", () => {
  const connection = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  const transport = read("Sources/TeleTypTelCore/NativeJingleTransport.swift");
  const login = read("Sources/TeleTypTelCore/NativeLoginModel.swift");
  assert.match(connection, /protocol NativeJingleXMPPConnecting/);
  assert.match(connection, /acceptIncomingInitiates: self\.onJingle != nil/);
  assert.match(transport, /acceptIncomingInitiates, action == "session-initiate"/);
  assert.match(login, /earlyJingle\.count < 8/);
  assert.match(login, /generation == attempt/);
  assert.match(login, /earlyJingle\.removeAll\(\)/);
  assert.match(login, /jingleSender = nil/);
});

test("Native login UI has cancellation, private input and Debug-only offline fixtures", () => {
  const app = read("App/TeleTypTelNativeApp.swift");
  const model = read("Sources/TeleTypTelCore/NativeLoginModel.swift");
  for (const required of ['SecureField("Wachtwoord"', 'loginModel.login(', 'password = ""',
    'loginModel.disconnect()', 'loginModel.suspend()', 'fixture-banner', 'geen echte serververbinding'])
    assert.ok(app.includes(required), required);
  assert.match(app, /#if DEBUG\s+if let scenario = ProcessInfo/);
  assert.match(app, /#if DEBUG\s+private struct NativeLoginUIFixture/);
  for (const required of ['self.generation == attempt', 'self.phase == .connecting', 'task?.cancel()',
    'account.jid == jid', 'account.configuration == configuration', 'parts[0] == jid', 'Task.isCancelled'])
    assert.ok(model.includes(required), required);
  assert.doesNotMatch(model, /UserDefaults|print\(|NSLog|SecTrust/);
  assert.ok(projectText().project.includes('Core/NativeLoginModel.swift'));
  assert.match(projectText().project, /name = Debug; buildSettings = \{[^}]*SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG"/);
  assert.match(projectText().project, /name = Release; buildSettings = \{[^}]*SWIFT_ACTIVE_COMPILATION_CONDITIONS = ""/);
  const check = fs.readFileSync(path.join(root, 'scripts/check-ios-native.js'), 'utf8');
  assert.match(check, /releaseFixtureExcluded = true/);
  assert.match(check, /executable\.includes\(Buffer\.from\(marker\)\)/);
});

test("Native chat and background source guards retain bounded data and honest send states", () => {
  const chat = read("Sources/TeleTypTelCore/NativeChat.swift");
  const model = read("Sources/TeleTypTelCore/NativeLoginModel.swift");
  const session = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  const background = read("App/NativeBackgroundController.swift");
  for (const required of ["body.utf8.count <= 8192", "messages.count >= 200", "pendingCount < 8",
    "drafts.count < 100", "ontvangst niet bevestigd", "niet automatisch opnieuw verzonden", "UUID(uuidString: identifier)"])
    assert.ok(chat.includes(required), required);
  for (const required of ["earlyMessages.count < 32", "contacts.contains(where:", "chat.interrupt()",
    "self.generation == attempt", "resumableAccount = nil", "phase == .suspended", "!isBackground"])
    assert.ok(model.includes(required), required);
  for (const required of ["self.pendingMessages.count < 8", ".now() + 8", "Array(pendingMessages.keys)", "continuation.resume()"])
    assert.ok(session.includes(required), required);
  for (const required of ["beginBackgroundTask", "endBackgroundTask", "0..<50", "100_000_000",
    "model.chat.pendingCount > 0", "self.generation == attempt", "model.resume()"])
    assert.ok(background.includes(required), required);
  assert.doesNotMatch(chat + model + background, /UserDefaults|NSLog|print\(|AVAudioSession|setCategory\(/);
  assert.doesNotMatch(read("App/Info.plist"), /UIBackgroundModes/);
  assert.ok(fs.existsSync(path.join(native, "Tests/TeleTypTelCoreTests/NativeChatTests.swift")));
});

test("Native rotation tests check visible geometry before requesting a tap point", () => {
  const ui = read("UITests/NativeStartupUITests.swift");
  const helper = ui.slice(ui.indexOf("private func isUsable("), ui.indexOf("private func waitForStatus("));
  for (const required of ["navigation.frame.maxY", "keyboard.frame.minY", "viewport.contains(element.frame)",
    "element.elementType == .staticText || element.isHittable"])
    assert.ok(helper.includes(required), required);
  assert.ok(helper.indexOf("viewport.contains(element.frame)") < helper.indexOf("element.isHittable"));
  assert.match(ui, /XCTAssertTrue\(isUsable\(element\)/);
  assert.match(ui, /start\.press\(forDuration: 0\.05, thenDragTo: end\)/);
  assert.doesNotMatch(ui, /application\.swipe(?:Up|Down)\(\)/);
  const fixture = ui.slice(ui.indexOf("private func signInFixture("), ui.indexOf("private func reveal("));
  assert.doesNotMatch(fixture, /application\.terminate\(\)/);
});

test("Incoming-call foundation stays bounded and does not enable push or silently downgrade TC", () => {
  const calls = read("Sources/TeleTypTelCore/NativeIncomingCall.swift");
  for (const required of ["data.count <= 4096", "registration == generation", "retired.count < 32",
    "expiresAt <= now + 60", "payload.hasVideo == payload.mediaProfile.hasVideo",
    "requested == negotiated", "Set(readyContents).count == readyContents.count",
    "Set(readyContents) == requested.contents", '!requested.contents.contains("rtt") || rttReady',
    "now + 15", "current?.deadline = nil"])
    assert.ok(calls.includes(required), required);
  assert.doesNotMatch(calls, /URLSession|UserDefaults|Keychain|PKPushRegistry|print\(|NSLog/);
  assert.doesNotMatch(read("App/Info.plist"), /UIBackgroundModes|aps-environment/);
  assert.ok(fs.existsSync(path.join(native, "Tests/TeleTypTelCoreTests/NativeIncomingCallTests.swift")));
  const previous = fs.readFileSync(path.join(root, "scripts/ios-testflight/CallMediaProfile.swift"), "utf8");
  const mediaCases = source => [...source.matchAll(/case \.(audio|video|audioRtt|total): return \[([^\]]+)\]/g)]
    .map(match => [match[1], match[2]]);
  assert.equal(mediaCases(calls).length, 4);
  assert.deepEqual(mediaCases(calls), mediaCases(previous));
});

test("CallKit/PushKit sources are included in preview but live registration stays disabled", () => {
  const platform = read("App/NativeCallPlatform.swift");
  const media = read("App/NativeCallMedia.swift");
  const controller = read("App/NativeCallController.swift");
  const coordinator = read("Sources/TeleTypTelCore/NativeCallCoordinator.swift");
  assert.match(platform, /reportNewIncomingCall/);
  assert.match(platform, /MainActor\.assumeIsolated/);
  assert.match(platform, /consented, registry == nil/);
  assert.match(platform, /guard !revocationRequired, registry == nil/);
  assert.match(platform, /registry === self\.registry/);
  assert.match(platform, /TeleTypTelNativeCallPushEnabled/);
  assert.match(platform, /func connectForeground\(account: String\) -> UUID\?/);
  assert.match(platform, /func receive\(_ invitation: NativeCallInvitation/);
  assert.match(platform, /let hadPushRegistration = registry != nil/);
  assert.doesNotMatch(read("App/Info.plist"), /TeleTypTelNativeCallPushEnabled|UIBackgroundModes|aps-environment/);
  assert.match(coordinator, /let rejected = UUID\(\)/);
  assert.match(coordinator, /let callback = self\.answerCompletion\s+self\.answerCompletion = nil\s+callback\?\(true\)/);
  assert.match(media, /audio\.useManualAudio = true/);
  assert.match(media, /audioSessionDidActivate/);
  assert.match(media, /MessengerWebRTCChannel\.attach/);
  assert.match(media, /prepared\.peer\.connectionState == \.connected/);
  assert.match(media, /Set\(contents\) == profile\.contents/);
  assert.match(media, /self\.handle == handle/);
  assert.match(media, /try await self\.capture\.prepare\(media\)/);
  assert.match(controller, /login\.onJingle =/);
  assert.match(controller, /NativeIncomingPeerNegotiator/);
  assert.match(controller, /runtime\.platform\.receive\(invitation/);
  assert.match(controller, /matches\.count == 1/);
  assert.doesNotMatch(platform + media, /print\(|NSLog|UserDefaults|setActive\(true/);
  const { revision } = require("../scripts/ios-testflight/native-webrtc");
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.ok(projectText().project.includes(revision));
  assert.match(projectText().project, /XCSwiftPackageProductDependency/);
});
