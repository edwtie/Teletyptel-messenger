const fs = require("node:fs");
const path = require("node:path");
const { prepare } = require("./prepare-ios-native");
const { executeLogged } = require("./check-ios-native");

function run() {
  if (process.platform !== "darwin") throw new Error("This unsigned SDK check requires macOS/Xcode");
  const root = path.resolve(__dirname, "..");
  const directory = prepare("ios-native-update-" + Date.now());
  const reports = path.join(directory, "reports");
  fs.mkdirSync(reports);
  const result = { unsigned: true, uploaded: false, scope: "focused contacts, login recovery, privacy, account lifecycle, unread state, presentation, avatar, Jingle codec and native hold logic; no simulator/UI/camera/audio tests",
    swiftTestFilter: "NativeContactTests|NativePresentationTests|NativeServicesTests.testNativeAvatar|NativeJingleMediaTests|NativeJingleSessionTests|NativeCallCoordinatorTests|NativeJingleTransportTests|NativeLoginModelTests|NativeChatInteractionsTests|NativeFeatureCompletionTests|NativeMUCTests|NativeGroupManagementTests|NativeCallIntentTests|NativeCallAnswerRecoveryTests|NativePushRegistryTests|NativeWarmCallTests|NativeCallMediaGateTests|NativePushRegistrationModelTests|XMPPSessionTests", swiftUnitTests: false, nativeRttTests: false, deviceCompiled: false, uiTests: [] };
  const logged = (name, command, args) => executeLogged(command, args, { root, reports, name });
  try {
    logged("swift-tests", "swift", ["test", "--package-path", path.join(root, "mobile/ios-native"),
      "--scratch-path", path.join(directory, "SwiftBuild"), "--filter", result.swiftTestFilter]);
    result.swiftUnitTests = true;
    logged("native-rtt-tests", "node", ["--test", "tests/native-t140.test.js"]);
    result.nativeRttTests = true;
    logged("device-build", "xcodebuild", ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"),
      "-scheme", "TeleTypTelNative", "-derivedDataPath", path.join(directory, "DerivedData"),
      "CODE_SIGNING_ALLOWED=NO", "-destination", "generic/platform=iOS", "-configuration", "Release", "build"]);
    result.deviceCompiled = true;
  } finally { fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(result, null, 2)); }
  return { root, directory, reports, logged };
}

if (require.main === module) run();
module.exports = { run };
