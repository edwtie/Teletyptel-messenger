const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { prepare, projectText } = require("../scripts/prepare-ios-native");
const { executeLogged, collectTestResults } = require("../scripts/check-ios-native");
const { checkMedia } = require("../scripts/check-ios-native-media");
const { providerPlist } = require("../scripts/native-provider-config");

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
  const result = checkMedia({ root, directory, reports, logged: (name, command, args) => {
    if (name === "media-compile") {
      for (const required of ["NativeChat.swift", "NativeArchive.swift", "XMPPProbeStream.swift"]) {
        assert.ok(args.some(argument => argument === path.join(native, "Sources/TeleTypTelCore", required)), required);
      }
    }
    return name === "media-runtime" ? complete : "compiled";
  } });
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

test("Native runner exports screenshots and selects one host-compatible simulator architecture", () => {
  const reports = diagnosticDirectory();
  const bundle = path.join(reports, "iPad.xcresult");
  fs.mkdirSync(bundle);
  const calls = [];
  collectTestResults(bundle, { root, reports, family: "iPad", execute: (command, args) => {
    calls.push([command, ...args]);
    return JSON.stringify({ passedTests: 6 });
  } });
  assert.ok(calls.some(args => args[2] === "export" && args[3] === "attachments" &&
    args.includes(path.join(reports, "iPad-screenshots"))));
  assert.equal(fs.existsSync(path.join(reports, "iPad-screenshots-export-error.txt")), false);
  const runner = fs.readFileSync(path.join(root, "scripts/check-ios-native.js"), "utf8");
  assert.match(runner, /process\.arch === "arm64" \? "arm64" : "x86_64"/);
  assert.match(runner, /ONLY_ACTIVE_ARCH=YES/);
  assert.doesNotMatch(runner, /EXCLUDED_ARCHS/);
});

test("Native preview has separate identity, no web runtime, upload or signing configuration", () => {
  const { project, scheme } = projectText();
  assert.match(project, /com\.tiedragon\.teletyptel\.nativepreview;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = "1,2"/);
  assert.match(project, /CODE_SIGNING_ALLOWED = NO/);
  assert.match(scheme, /NativeStartupUITests/);
  assert.match(scheme, /buildForArchiving="NO"/);
  assert.doesNotMatch(project, /Capacitor|WebKit|p8|DEVELOPMENT_TEAM|PROVISIONING_PROFILE/);
  assert.match(project, /GoogleSignIn-iOS.git/);
  assert.match(project, /facebook-ios-sdk.git/);
  assert.match(project, /kind = exactVersion; version = "9.0.0"/);
  assert.match(project, /kind = exactVersion; version = "18.1.1"/);
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
    ["App/NativeTotalConversationView.swift", "App/NativeTotalConversationView.swift"],
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
  const roster = read("Sources/TeleTypTelCore/NativeRoster.swift");
  assert.match(connection, /protocol NativeJingleXMPPConnecting/);
  assert.match(connection, /acceptIncomingInitiates: self\.onJingle != nil/);
  assert.match(transport, /acceptIncomingInitiates, action == "session-initiate"/);
  assert.match(login, /earlyJingle\.count < 8/);
  assert.match(login, /generation == attempt/);
  assert.match(login, /earlyJingle\.removeAll\(\)/);
  assert.match(login, /jingleSender = nil/);
  assert.match(roster, /public var callEndpoint: String\? = nil/);
  assert.match(roster, /return resource\.map \{ jid \+ "\/" \+ \$0 \}/);
  assert.match(roster, /contact\.callEndpoint = nil/);
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

test("Native MAM history is bounded, correlated and account-bound without local persistence", () => {
  const archive = read("Sources/TeleTypTelCore/NativeArchive.swift");
  const chat = read("Sources/TeleTypTelCore/NativeChat.swift");
  const model = read("Sources/TeleTypTelCore/NativeLoginModel.swift");
  const transport = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  for (const required of ['urn:xmpp:mam:2', 'static let maximum = 50', 'queryID', 'boundJID',
    'bytes <= 524288', 'archiveIDs.contains', 'first == archiveIDs.first', 'last == archiveIDs.last',
    'from == owner && to == peer', 'from == peer && to == owner', 'NativeArchiveFailure.unstable'])
    assert.ok(archive.includes(required), required);
  for (const required of ['page.owner == owner', 'page.peer == peer', 'self.historyRequest == request',
    'historyTask?.cancel()', 'historyStates.removeAll()', 'cancelHistory()'])
    assert.ok(model.includes(required), required);
  for (const required of ['self.archive == nil', '.now() + 15', 'cancellation.isCancelled',
    'completeArchive(token', 'pending.continuation.resume(with: result)'])
    assert.ok(transport.includes(required), required);
  assert.match(chat, /state: archived.outgoing \? \.submitted : \.incoming/);
  assert.match(chat, /merged\.count > 200/);
  assert.doesNotMatch(archive + chat + model, /UserDefaults|FileManager|JSONEncoder|NSLog|print\(/);
  assert.ok(projectText().project.includes('Core/NativeArchive.swift'));
  assert.ok(read("Tests/TeleTypTelCoreTests/NativeArchiveTests.swift").includes('testTotalByteBudget'));
});

test("Native MUC uses existing rooms, membership acknowledgement and isolated group state", () => {
  const stream = read("Sources/TeleTypTelCore/NativeMUC.swift");
  const model = read("Sources/TeleTypTelCore/NativeGroupModel.swift");
  const transport = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  for (const required of ['disco#info', 'maxstanzas=\'0\'', 'codes.contains("110")', 'codes.contains("201")',
    'participants.count < 128', 'participants[nick] != nil', 'type=\'groupchat\'', 'phase == .joined'])
    assert.ok(stream.includes(required), required);
  for (const required of ['rooms.count < 8', 'messages.count >= 200', 'self.generation == attempt', 'self.tokens[room] == token',
    'rooms[index].draft', 'sender.sendGroup(', 'case .rejected', 'rooms.removeAll()'])
    assert.ok(model.includes(required), required);
  assert.ok(transport.includes('self.groups.count < 8'));
  assert.ok(transport.includes('.now() + 15'));
  assert.ok(transport.includes('NativeGroupFailure.disconnected'));
  assert.doesNotMatch(stream + model, /UserDefaults|FileManager|JSONEncoder|NSLog|print\(/);
  assert.ok(projectText().project.includes('App/NativeGroupsView.swift'));
  assert.ok(projectText().project.includes('Core/NativeMUC.swift'));
  assert.ok(projectText().project.includes('Core/NativeGroupModel.swift'));
});

test("Native mediated invitations remain explicit, contact-bound and session-private", () => {
  const source = read("Sources/TeleTypTelCore/NativeGroupInvitations.swift");
  const groups = read("Sources/TeleTypTelCore/NativeGroupModel.swift");
  const transport = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  for (const required of ['actions.count == 1', 'invitations.count < 16', 'early.count < 16',
    'tasks.count < 8', 'requiresPassword', 'invitation.current', 'allowed(invitation.inviter)',
    'self.generation == attempt', 'contacts.removeAll()', 'ontvangst en toegang niet bevestigd']) {
    assert.ok(source.includes(required), required);
  }
  assert.doesNotMatch(source, /UserDefaults|FileManager|JSONEncoder|NSLog|print\(/);
  assert.ok(source.includes('matches.count == 1'));
  assert.ok(groups.includes('invitationModel.candidate('));
  assert.ok(groups.includes('invitationModel.accepted(room: room)'));
  assert.ok(transport.includes('earlyInvitations.count < 16'));
  assert.ok(transport.includes('invitationObserver = nil'));
  assert.ok(read("Sources/TeleTypTelCore/NativeChat.swift").includes('["invite", "decline"]'));
  assert.ok(projectText().project.includes('Core/NativeGroupInvitations.swift'));
  assert.ok(projectText().project.includes('App/NativeInvitationViews.swift'));
});

test("Native rotation tests check visible geometry before requesting a tap point", () => {
  const ui = read("UITests/NativeStartupUITests.swift");
  const helper = ui.slice(ui.indexOf("private func isUsable("), ui.indexOf("private func waitForStatus("));
  for (const required of ["navigationBars.allElementsBoundByIndex.last { $0.isHittable }", "$0.frame.maxY", "keyboard.frame.minY", "viewport.contains(element.frame)",
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

test("Native saved login is opt-in, biometric-bound, revocable and isolated from fixtures", () => {
  const vault = read("App/NativeBiometricLoginVault.swift");
  const model = read("Sources/TeleTypTelCore/NativeSavedLogin.swift");
  const app = read("App/TeleTypTelNativeApp.swift");
  for (const token of ["kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly", ".biometryCurrentSet",
    "kSecAttrSynchronizable as String: false", "deviceOwnerAuthenticationWithBiometrics", "context?.invalidate()"])
    assert.ok(vault.includes(token), token);
  for (const token of ["if consented", "value.jid == jid", "self.generation == attempt", "candidate = nil", "vault.remove()"])
    assert.ok(model.includes(token), token);
  assert.doesNotMatch(model, /UserDefaults|print\(|NSLog|URLSession/);
  assert.doesNotMatch(vault, /print\(|NSLog|URLSession/);
  assert.deepEqual([...vault.matchAll(/UserDefaults\.standard\.set\(([^,]+),/g)].map(match => match[1]),
    ["false", "true", "false"]);
  assert.match(app, /savedLogin.canRestoreAutomatically/);
  assert.match(app, /consented: rememberLogin && fixtureName == nil/);
  assert.match(app, /NativeBiometricLoginVault\(enabled: false\)/);
  assert.match(read("App/Info.plist"), /NSFaceIDUsageDescription/);
  assert.ok(projectText().project.includes("Core/NativeSavedLogin.swift"));
  assert.ok(projectText().project.includes("App/NativeBiometricLoginVault.swift"));
});

test("Native provider configuration is explicit, isolated and keeps tracking disabled", () => {
  const plist = read("App/Info.plist");
  assert.equal(providerPlist(plist, null), plist);
  assert.throws(() => providerPlist(plist, { bundleId: "com.tiedragon.teletyptel", google: {} }));
  const configured = providerPlist(plist, { bundleId: "com.tiedragon.teletyptel.nativepreview",
    google: { clientId: "123-fiction.apps.googleusercontent.com", serverClientId: "123-server.apps.googleusercontent.com" },
    facebook: { appId: "12345", clientToken: "fictional-client-token" } });
  assert.match(configured, /com.googleusercontent.apps.123-fiction/);
  assert.match(configured, /<string>fb12345<\/string>/);
  for (const flag of ["FacebookAutoInitEnabled", "FacebookAutoLogAppEventsEnabled", "FacebookAdvertiserIDCollectionEnabled", "FacebookSKAdNetworkReportEnabled"])
    assert.ok(configured.includes(`<key>${flag}</key><false/>`));
  const sdk = read("App/NativeProviderSDK.swift");
  assert.match(sdk, /tracking: \.limited, nonce: nonce/);
  assert.match(sdk, /token.nonce == nonce/);
  assert.match(sdk, /serverAuthCode/);
  assert.doesNotMatch(sdk, /CAPPlugin|WKWebView|print\(|NSLog/);
});

test("Native web-style chat keeps translations private, off-gated and call-bound", () => {
  const model = read("Sources/TeleTypTelCore/NativeTranslation.swift");
  const chat = read("App/NativeChatView.swift");
  const tc = read("App/NativeTotalConversationView.swift");
  const web = read("Sources/TeleTypTelCore/NativeAccountWebSession.swift");
  for (const token of ['preferences.mode != "off"', 'sharingConsent', 'generation == attempt',
    'sameLanguage(reply.translation.sourceLanguage, target)', 'liveRttConsent', 'ownLiveRttConsent', 'tasks.count < 4'])
    assert.ok(model.includes(token), token);
  assert.doesNotMatch(model, /sendMessage|UserDefaults|print\(|NSLog|apiKey/);
  assert.match(chat, /ChatBackground/);
  assert.match(chat, /contextMenu/);
  assert.match(chat, /NativeTranslationCaption/);
  assert.match(tc, /presentation\?\.callID.uuidString/);
  for (const value of ["translation.ready", "translation.preferences", "translation.sharingConsent"])
    assert.ok(tc.includes(".onChange(of: " + value + ") { _ in translateCurrentText() }"), value);
  assert.match(web, /settings.httpCookieStorage = nil/);
  assert.match(web, /generation == attempt/);
  assert.match(web, /completionHandler\(nil\)/);
  assert.match(web, /X-CSRF-Token/);
});

test("Native session cancellation closes the XMPP stream with bounded exactly-once teardown", () => {
  const source = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  assert.match(source, /let graceful = cancelled && stream.phase == \.online/);
  assert.match(source, /socket\.send\(\.string\("<close xmlns='urn:ietf:params:xml:ns:xmpp-framing'\/>"\)\)/);
  assert.match(source, /queue\.asyncAfter\(deadline: \.now\(\) \+ 2\) \{ self\.completeClosure\(\) \}/);
  assert.match(source, /private func completeClosure\(\) \{\s+let operation = closing\s+closing = nil\s+operation\?\.complete\(\)/);
  assert.match(source, /guard let continuation = continuation else \{ return \}\s+self\.continuation = nil\s+socket\.cancel/);
  assert.match(source, /root\.name == "close", root\.namespace == "urn:ietf:params:xml:ns:xmpp-framing"/);
});

test("Native feature expansion uses scoped server mutations and explicit attachment staging", () => {
  const features = read("Sources/TeleTypTelCore/NativeAccountFeatures.swift");
  const web = read("Sources/TeleTypTelCore/NativeAccountWebSession.swift");
  const attachment = read("App/NativeAttachmentsView.swift");
  for (const text of ["20 * 1024 * 1024", "accountId == accountID", "generation == attempt", "reference.identifier == file.id", "items.count == 1"])
    assert.ok(features.includes(text), text);
  assert.match(web, /httpShouldHandleCookies = false/);
  assert.match(web, /body.count <= 280000/);
  assert.match(attachment, /PhotosPicker/);
  assert.match(attachment, /startAccessingSecurityScopedResource/);
  assert.match(attachment, /kCGImageSourceThumbnailMaxPixelSize: 2048/);
  assert.match(attachment, /stage\(link\); dismiss\(\)/);
  assert.doesNotMatch(features + attachment, /UserDefaults|NSLog|print\(|SecTrust/);
  for (const name of ["NativeGroupManagement.swift", "NativeAccountFeatures.swift", "NativeAttachmentsView.swift", "NativeAccountSettingsView.swift"])
    assert.ok(projectText().project.includes(name), name);
});

test("Native PHP transport integration refuses local or non-disposable databases", () => {
  const { requireHostedLinux } = require("../scripts/check-native-feature-http");
  const environment = { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", TELETYPTEL_DB_HOST: "127.0.0.1", TELETYPTEL_DB_NAME: "native_feature_test" };
  assert.doesNotThrow(() => requireHostedLinux("linux", environment));
  for (const [platform, input] of [["win32", environment], ["linux", {}], ["linux", { ...environment, RUNNER_ENVIRONMENT: "self-hosted" }], ["linux", { ...environment, TELETYPTEL_DB_NAME: "teletyptel" }]])
    assert.throws(() => requireHostedLinux(platform, input), /ephemeral/);
});

test("Native MUC management uses bounded correlated IQs and server-only authority", () => {
  const connection = read("Sources/TeleTypTelCore/NativeXMPPConnection.swift");
  const management = read("Sources/TeleTypTelCore/NativeGroupManagement.swift");
  assert.match(connection, /self.management.count < 4/);
  assert.match(connection, /root.attributes\["from"\] == pending.target/);
  assert.match(connection, /for identifier in Array\(management.keys\)/);
  assert.match(management, /fields\["FORM_TYPE"\] ==/);
  assert.match(management, /field.attributes\["type"\] == "fixed"/);
  assert.match(management, /text-private/);
  assert.doesNotMatch(management, /<destroy|affiliation='owner'/);
  assert.match(read("Sources/TeleTypTelCore/NativeMUC.swift"), /!creating \|\| creationConfigured/);
});

test("Native navigation source keeps sidebar visibility explicit and avoids duplicate back bars", () => {
  const messenger = read("App/NativeTranslationView.swift");
  const chat = read("App/NativeChatView.swift");
  assert.match(messenger, /columnVisibility: NavigationSplitViewVisibility = \.all/);
  assert.match(messenger, /NavigationSplitView\(columnVisibility: \$columnVisibility\)/);
  assert.match(messenger, /navigationSplitViewStyle\(\.balanced\)/);
  assert.match(chat, /navigationBarBackButtonHidden\(true\)/);
  assert.doesNotMatch(chat, /NavigationStack\s*\{/);
  assert.match(chat, /task\(id: geometry.size\)/);
  assert.match(chat, /defaultScrollAnchor\(\.bottom\)/);
  assert.match(chat, /id\("chat-bottom"\)/);
  assert.match(chat, /NativeTotalConversationSymbol\(\)/);
  assert.ok(chat.indexOf('accessibilityIdentifier("chat-error")') < chat.indexOf("LazyVStack"));
});

test("Native web visual contract shares palette, shell, bubbles and reachable symbol controls", () => {
  const theme = read("App/NativeWebStyle.swift");
  const css = fs.readFileSync(path.join(root, "php/public/chat-client.css"), "utf8");
  for (const value of ["ffffff", "111827", "53657c", "2563eb", "ddf8ea", "f5f7fb", "1d8d68", "3f536d", "edf4ff", "6aa2ff"]) {
    assert.ok(theme.includes("0x" + value), value);
    assert.ok(css.toLowerCase().includes("#" + value), value);
  }
  assert.match(theme, /minWidth: 44, minHeight: 44/);
  assert.match(theme, /relativeTo: \.body/);
  assert.match(theme, /userInterfaceStyle == \.dark/);
  assert.ok(projectText().project.includes("NativeWebStyle.swift"));
  const messenger = read("App/NativeTranslationView.swift");
  assert.match(messenger, /brandHeader \}\s+conversationLayout/);
  assert.match(messenger, /accessibilityElement\(children: \.contain\)\s+\.accessibilityIdentifier\("messenger-brand-header"\)/);
  assert.match(messenger, /messenger-brand-header/);
  assert.match(messenger, /Contacten en groepen toevoegen/);
  assert.match(messenger, /model.groups.rooms/);
  assert.doesNotMatch(messenger, /\.searchable\(/);
  for (const file of ["App/NativeChatView.swift", "App/NativeGroupsView.swift"]) {
    const source = read(file);
    assert.match(source, /NativeWebBubble/);
    assert.match(source, /nativeWebComposer\(\)/);
    assert.match(source, /NativeWebAvatar/);
  }
  const tc = read("App/NativeTotalConversationView.swift");
  assert.match(tc, /popover\(isPresented: \$controlsOpen/);
  assert.match(tc, /NativeWebStyle.enabled/);
  assert.match(tc, /NativeWebStyle.disabled/);
  assert.match(tc, /Button\(action: controller.endCall\)/);
});

test("Native web message palette keeps body and metadata contrast in light and dark", () => {
  const luminance = hex => {
    const channels = [16, 8, 0].map(shift => ((hex >> shift) & 255) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, backgrounds] of [[0x111827, [0xddf8ea, 0xf5f7fb]], [0xf9fafb, [0x144f3a, 0x273242]],
    [0x53657c, [0xddf8ea, 0xf5f7fb]], [0xb6c2d1, [0x144f3a, 0x273242]]]) {
    for (const background of backgrounds) {
      const values = [luminance(foreground), luminance(background)].sort((first, second) => second - first);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5);
    }
  }
  for (const file of ["App/NativeChatView.swift", "App/NativeGroupsView.swift"])
    assert.match(read(file), /foregroundStyle\(NativeWebStyle.muted\)/);
});

test("Native second factor is a bounded challenge before XMPP, not an authenticated state", () => {
  const client = read("Sources/TeleTypTelCore/NativeTwoFactorAccountClient.swift");
  const model = read("Sources/TeleTypTelCore/NativeLoginModel.swift");
  const app = read("App/TeleTypTelNativeApp.swift");
  for (const token of ['settings = { .ephemeral }', 'reply.method == "authenticator"',
    '"verify_login_two_factor"', 'attempts < 5', 'ContinuousClock.now', 'data.count < 1048576',
    'account.jid == jid', 'completionHandler(nil)', 'session.invalidateAndCancel()'])
    assert.ok(client.includes(token), token);
  for (const token of ['case awaitingSecondFactor', 'secondFactor = (challenge, configuration, jid)',
    '300_000_000_000', 'secondFactor?.session.cancel()', 'self.generation == attempt'])
    assert.ok(model.includes(token), token);
  assert.doesNotMatch(client, /UserDefaults|HTTPCookieStorage.shared|NSLog|print\(|SecTrust/);
  assert.match(app, /SecureField\("Verificatiecode"/);
  assert.match(app, /textContentType\(\.oneTimeCode\)/);
  assert.ok(projectText().project.includes('Core/NativeTwoFactorAccountClient.swift'));
});

test("Native total conversation keeps explicit camera controls", () => {
  const capture = read("App/NativeMediaCapture.swift");
  const media = read("App/NativeCallMedia.swift");
  const view = read("App/NativeTotalConversationView.swift");
  assert.match(capture, /func setCameraEnabled\(_ enabled: Bool\)/);
  assert.match(capture, /func switchCamera\(\) async -> Bool/);
  assert.match(media, /let cameraEnabled: Bool/);
  assert.match(media, /let canSwitchCamera: Bool/);
  assert.match(view, /Camera uitschakelen/);
  assert.match(view, /Camera wisselen/);
});

test("CallKit/PushKit sources are included in preview but live registration stays disabled", () => {
  const platform = read("App/NativeCallPlatform.swift");
  const media = read("App/NativeCallMedia.swift");
  const controller = read("App/NativeCallController.swift");
  const conversation = read("App/NativeTotalConversationView.swift");
  const coordinator = read("Sources/TeleTypTelCore/NativeCallCoordinator.swift");
  assert.match(platform, /reportNewIncomingCall/);
  assert.match(platform, /MainActor\.assumeIsolated/);
  assert.match(platform, /consented, registry == nil/);
  assert.match(platform, /guard !revocationRequired, registry == nil/);
  assert.match(platform, /registry === self\.registry/);
  assert.match(platform, /TeleTypTelNativeCallPushEnabled/);
  assert.match(platform, /func connectForeground\(account: String\) -> UUID\?/);
  assert.match(platform, /func receive\(_ invitation: NativeCallInvitation/);
  assert.match(platform, /CXStartCallAction/);
  assert.match(platform, /reportOutgoingCall/);
  assert.match(platform, /func startOutgoing\(peer: String, sid: String, media: NativeCallMedia/);
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
  assert.match(controller, /NativeOutgoingPeerNegotiator/);
  assert.match(controller, /login\?\.activeJingleSender/);
  assert.match(controller, /func startCall\(_ contact: NativeContact, profile: NativeCallMedia\)/);
  assert.match(read("App/NativeChatView.swift"), /startCall\(\.total\)/);
  assert.match(read("App/NativeChatView.swift"), /calls\.startCall\(contact, profile: profile\)/);
  assert.match(controller, /runtime\.platform\.receive\(invitation/);
  assert.match(controller, /matches\.count == 1/);
  assert.match(controller, /@Published private\(set\) var presentation: NativeCallPresentation\?/);
  assert.match(media, /presentationChanged: \(\(NativeCallPresentation\?\) -> Void\)\?/);
  assert.match(media, /prepared\.peer\.receivers\.compactMap \{ \$0\.track as\? RTCVideoTrack \}/);
  assert.match(conversation, /RTCMTLVideoView/);
  assert.match(conversation, /videoContentMode = \.scaleAspectFill/);
  assert.match(conversation, /TextField\("Typ realtime tekst"/);
  assert.match(conversation, /\.accessibilityLabel\("Gesprek beëindigen"\)|label: "Gesprek beëindigen"/);
  assert.match(conversation, /foregroundStyle\(\.white\)/);
  assert.match(read("App/TeleTypTelNativeApp.swift"), /contact\.callEndpoint == nil/);
  assert.match(read("Sources/TeleTypTelCore/NativeLoginModel.swift"), /var activeJingleSender:/);
  assert.doesNotMatch(conversation, /\.textFieldStyle\(\.roundedBorder\)/);
  assert.doesNotMatch(platform + media, /print\(|NSLog|UserDefaults|setActive\(true/);
  const { revision } = require("../scripts/ios-testflight/native-webrtc");
  assert.match(revision, /^[a-f0-9]{40}$/);
  assert.ok(projectText().project.includes(revision));
  assert.match(projectText().project, /XCSwiftPackageProductDependency/);
});
