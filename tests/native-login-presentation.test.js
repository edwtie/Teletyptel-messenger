"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loginAssets } = require("../scripts/native-login-assets");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const source = read("mobile/ios-native/App/TeleTypTelNativeApp.swift");

test("Native login keeps account fields and 16.9-style bottom actions visible without exposing server/language controls", () => {
  const content = source.split("private var startupContent: some View")[1].split("private var hasServerConfiguration")[0];
  assert.match(content, /accessibilityIdentifier\("login-jid"\)/);
  assert.match(content, /accessibilityIdentifier\("login-password"\)/);
  assert.match(content, /scrollDismissesKeyboard\(\.interactively\)\s+loginActions/);
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
  assert.match(settings, /Button\("Annuleren"\) \{ model\.cancel\(\); showLoginSettings = false \}/);
  assert.match(settings, /Button\("Bewaren"\) \{ saveLoginSettings\(dismiss: true\) \}/);
  assert.match(settings, /model\.check\(address: settingsAddress, domain: settingsDomain\)/);
  assert.match(settings, /fixtureName == nil/);
  assert.match(settings, /UserDefaults\.standard\.set\(address, forKey: "teletyptel\.native\.serverAddress"\)/);
  assert.match(settings, /UserDefaults\.standard\.set\(domain, forKey: "teletyptel\.native\.xmppDomain"\)/);
  assert.equal((source.match(/UserDefaults\.standard\.set\(/g) ?? []).length, 2);
  assert.doesNotMatch(settings, /UserDefaults[^\n]*(?:password|submittedPassword|verificationCode|jid)/);
  assert.match(source, /onDismiss: \{ model\.reset\(\) \}/);
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
