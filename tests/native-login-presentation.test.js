"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loginAssets } = require("../scripts/native-login-assets");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const source = read("mobile/ios-native/App/TeleTypTelNativeApp.swift");

test("Confirmed server defaults apply only when both saved values are absent, without rewriting preferences or contacting the server", () => {
  const defaults = read("mobile/ios-native/Sources/TeleTypTelCore/Startup.swift").split("public enum NativeServerDefaults")[1].split("public enum ConnectionFailure")[0];
  assert.match(defaults, /static let address = "https:\/\/dev\.teletyptel\.nl"/);
  assert.match(defaults, /static let domain = "localhost"/);
  assert.match(defaults, /savedAddress == nil && savedDomain == nil/);
  assert.match(defaults, /return \(savedAddress \?\? "", savedDomain \?\? ""\)/);
  assert.doesNotMatch(defaults, /UserDefaults|URLSession|\.check\(|\.login\(/);
  const initialization = source.split("    init() {")[1].split("private var startupContent")[0];
  assert.match(initialization, /NativeServerDefaults\.resolve\(/);
  assert.match(initialization, /_address = State\(initialValue: server.address\)/);
  assert.match(initialization, /_domain = State\(initialValue: server.domain\)/);
  assert.ok(initialization.indexOf('"https://example.invalid"') < initialization.indexOf("NativeServerDefaults.resolve("));
  const swiftTests = read("mobile/ios-native/Tests/TeleTypTelCoreTests/StartupTests.swift");
  for (const method of ["testFreshInstallUsesConfirmedSecureServerDefaults", "testSavedServerSettingsAreNotReplacedByDefaults", "testPartialSavedSettingsDoNotCombineWithAnotherServer"]) {
    assert.ok(swiftTests.includes("func " + method + "()"));
  }
  assert.match(read("scripts/check-ios-native-update.js"), /swiftTestFilter: "StartupTests\|/);
});

test("Native login keeps account fields and 16.9-style bottom actions visible without exposing server/language controls", () => {
  const content = source.split("private var startupContent: some View")[1].split("private var hasServerConfiguration")[0];
  assert.match(content, /accessibilityIdentifier\("login-jid"\)/);
  assert.match(content, /accessibilityIdentifier\("login-password"\)/);
  assert.match(content, /scrollDismissesKeyboard\(\.interactively\)\s+if !showsServerStatusScreen \{ loginActions \}/);
  assert.doesNotMatch(content, /safeAreaInset/);
  assert.doesNotMatch(content, /model\.state\.phase == \.available/);
  assert.doesNotMatch(content, /accessibilityIdentifier\("(?:server-address|xmpp-domain|login-interface-language)"\)|Picker\("App-taal"/);
  const actions = source.split("private var loginActions: some View")[1].split("private var loginSettings")[0];
  for (const value of ['Text("Aanmelden")', 'Text("Nieuwe gebruiker")', 'Image(systemName: "gearshape")', 'accessibilityIdentifier("login-settings")']) assert.ok(actions.includes(value));
  assert.match(actions, /disabled\(!hasServerConfiguration/);
  assert.match(source, /@FocusState private var loginFocus: LoginFocus\?/);
  assert.doesNotMatch(source, /loginFocus\s*=\s*\.(?:account|password|code)|becomeFirstResponder/);
});

test("Server settings use discardable drafts and persist only explicit non-secret configuration", () => {
  const settings = source.split("private var loginSettings: some View")[1].split("private func submitLogin")[0];
  assert.match(settings, /TextField\("Serveradres \(HTTPS\)", text: \$settingsAddress\)/);
  assert.match(settings, /TextField\("XMPP-domein", text: \$settingsDomain\)/);
  assert.match(settings, /Button\(LocalizedStringKey\(advancedServerSettings \? "Annuleren" : "Sluiten"\)\) \{ settingsModel\.cancel\(\); showLoginSettings = false \}/);
  assert.match(settings, /Button\("Bewaren"\) \{ saveLoginSettings\(dismiss: true\) \}/);
  assert.match(settings, /settingsModel\.check\(address: settingsAddress, domain: settingsDomain\)/);
  assert.match(settings, /fixtureName == nil/);
  assert.match(settings, /Button \{ advancedServerSettings.toggle\(\) \} label:/);
  assert.match(settings, /if advancedServerSettings \{/);
  assert.match(settings, /guard advancedServerSettings, !loginModel.isWorking/);
  assert.match(settings, /UserDefaults\.standard\.set\(address, forKey: "teletyptel\.native\.serverAddress"\)/);
  assert.match(settings, /UserDefaults\.standard\.set\(domain, forKey: "teletyptel\.native\.xmppDomain"\)/);
  assert.equal((source.match(/UserDefaults\.standard\.set\(/g) ?? []).length, 2);
  assert.doesNotMatch(settings, /UserDefaults[^\n]*(?:password|submittedPassword|verificationCode|jid)/);
  assert.match(source, /onDismiss: \{ settingsModel\.reset\(\) \}/);
  assert.doesNotMatch(settings, /(?<![A-Za-z])model\.(check|cancel|reset)\(/);
});

test("Presentation changes retain per-login server checks, credential privacy and biometric opt-in", () => {
  const model = read("mobile/ios-native/Sources/TeleTypTelCore/NativeLoginModel.swift");
  const login = model.split("public func login(address:")[1].split("func loginSocial")[0];
  assert.ok(login.indexOf("checker.check(configuration)") < login.indexOf("challenging.begin(configuration:"));
  assert.match(source, /password: submittedPassword, consented: rememberLogin && fixtureName == nil/);
  assert.match(source, /Toggle\("Account bewaren", isOn: \$rememberLogin\)/);
  assert.match(source, /accessibilityHint\("Bewaar je aanmelding alleen op dit apparaat, beschermd met Face ID of Touch ID\."\)/);
  assert.match(source, /!hasServerConfiguration \|\| !providerSDK\.configured\(provider\)/);
  assert.doesNotMatch(source, /NSAllowsArbitraryLoads|rejectUnauthorized: false/);
});

test("Native social buttons reuse the existing web brand vectors without external downloads or generic user icons", () => {
  const marks = loginAssets(read("php/public/chat.html"));
  assert.deepEqual(Object.keys(marks), ["NativeGoogleSignIn", "NativeFacebookSignIn"]);
  for (const colour of ["#4285f4", "#34a853", "#fbbc05", "#ea4335"]) assert.ok(marks.NativeGoogleSignIn.includes(colour));
  assert.match(marks.NativeFacebookSignIn, /fill="#1877f2"/);
  assert.match(marks.NativeGoogleSignIn, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  const provider = source.split("private func providerButton(")[1].split("private func resetConfiguration")[0];
  assert.match(provider, /"NativeGoogleSignIn" : "NativeFacebookSignIn"/);
  assert.doesNotMatch(provider, /person\.crop\.circle/);
  assert.throws(() => loginAssets("<button></button>"));
  const html = read("php/public/chat.html");
  assert.throws(() => loginAssets(html.replace('<svg viewBox="0 0 18 18"', '<svg onload="unsafe()" viewBox="0 0 18 18"')));
});

test("Focused simulator coverage includes login, gear settings, cancellation and both orientations", () => {
  const { selectedTests } = require("../scripts/check-ios-native-ui");
  const tests = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  for (const name of ["testStartupDoesNotOpenKeyboardOrShowAuthenticatedState", "testLoginSettingsAreSeparateAndPreserveDraftsOnCancel",
    "testLoginSettingsSaveAndRotateWithoutOpeningKeyboard", "testRotationPreservesConfigurationAndInvalidAddressShowsInlineError"]) {
    assert.ok(selectedTests.includes(name));
    assert.ok(tests.includes("func " + name + "()"));
  }
  assert.match(tests, /snapshot\("login-landscape"\)/);
  assert.match(tests, /snapshot\("login-settings-separate"\)/);
  assert.match(read(".github/workflows/ios-native-preview.yml"), /tests\/native-login-presentation\.test\.js/);
});

test("Startup activity follows real preparation, server, authentication and biometric work without fake percentages", () => {
  const busy = source.split("private var startupIsBusy: Bool")[1].split("private var hasServerConfiguration")[0];
  assert.match(busy, /preparingStartup \|\| model.state.phase == \.checking \|\| loginModel.isWorking \|\| savedLogin.isWorking/);
  assert.match(source, /NativeStartupProgress\(isActive: startupIsBusy\)/);
  assert.match(source, /NativeStartupProgress\(isActive: settingsModel.state.phase == \.checking, identifier: "settings-startup-progress"\)/);
  assert.match(source, /restoreSavedLoginIfForeground\(\)\s+preparingStartup = false/);
  const indicator = read("mobile/ios-native/App/NativeWebStyle.swift").split("struct NativeStartupProgress")[1].split("struct NativeConversationHeader")[0];
  assert.match(indicator, /accessibilityReduceMotion/);
  assert.match(indicator, /paused: reduceMotion/);
  assert.match(indicator, /Capsule\(\).fill\(NativeWebStyle.accent\)/);
  assert.match(indicator, /frame\(height: 4\).clipped\(\).allowsHitTesting\(false\)/);
  assert.match(indicator, /if isActive \{/);
  assert.match(indicator, /else \{\s+NativeWebStyle.line.frame\(height: 1\).frame\(height: 4\)\s+\.allowsHitTesting\(false\).accessibilityHidden\(true\)/);
  assert.doesNotMatch(indicator, /ProgressView\(value:|Timer|Task.sleep|100%|URLSession/);
});

test("Startup simulator scope checks activity, cancel, certificate failure and no keyboard without real services", () => {
  const { testsForScope } = require("../scripts/check-ios-native-ui");
  const methods = read("mobile/ios-native/UITests/NativeStartupUITests.swift");
  const selected = testsForScope("startup");
  assert.equal(selected.length, 7);
  for (const name of selected) assert.ok(methods.includes("func " + name + "()"), name);
  for (const value of ['"startup-cancel-check"', '"startup-progress-portrait"', '"startup-progress-landscape"',
    '"startup-progress-certificate-stopped"', '"TELETYPTEL_NATIVE_STARTUP_PROGRESS_FIXTURE"']) assert.ok(methods.includes(value));
  const fixture = source.split("private struct NativeLoginUIFixture:")[1];
  assert.match(fixture, /configuration.origin.host == "example.invalid", configuration.domain == "localhost"/);
  assert.match(fixture, /throw ConnectionFailure.certificate/);
  assert.match(source, /#if DEBUG\s+private actor NativeLoginUIConnectionCount/);
});

test("Unavailable servers show a simple inline retry screen, while server fields and technical details require explicit advanced disclosure", () => {
  assert.match(source, /@State private var advancedServerSettings = false/);
  assert.match(source, /@State private var advancedFailureDetails = false/);
  assert.match(source, /if showsServerStatusScreen \{\s+serverStatusPanel\s+\} else \{/);
  assert.match(source, /if !showsServerStatusScreen \{ loginActions \}/);
  const panel = source.split("private var serverStatusPanel: some View")[1].split("private var serverStatusTitle")[0];
  assert.match(panel, /Button\(action: retryServerAvailability\) \{\s+Text\("Opnieuw proberen"\).frame\(maxWidth: \.infinity, minHeight: 44\)/);
  assert.match(panel, /Button \{ advancedFailureDetails.toggle\(\) \} label:/);
  assert.match(panel, /if advancedFailureDetails \{/);
  assert.doesNotMatch(panel, /DisclosureGroup/);
  assert.match(panel, /openLoginSettings\(advanced: true\)/);
  assert.doesNotMatch(panel, /sheet\(|fullScreenCover\(|TextField\(/);
  const retry = source.split("private func retryServerAvailability() {")[1].split("private func openLoginSettings")[0];
  assert.match(retry, /loginModel.reset\(\)\s+model.check\(address: address, domain: domain\)/);
  assert.match(retry, /password = ""/);
  assert.doesNotMatch(retry, /submitLogin|unlockSavedLogin|loginSocial|authenticate|\.login\(/);
  const failures = source.split("private var serverFailure:")[1].split("private var serverStatusPanel")[0];
  assert.match(failures, /failed\(\.connection\(let failure\)\)/);
  assert.doesNotMatch(failures, /invalidCredentials|authenticationRejected|twoFactorRequired/);
  assert.match(source, /Vertrouw geen onbekend certificaat/);
});
