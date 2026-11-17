const fs = require("node:fs");
const path = require("node:path");
const { prepare } = require("./prepare-ios-native");
const { executeLogged, collectTestResults, runSimulatorChecks, simulatorFamilies } = require("./check-ios-native");
const simulator = require("./native-simulator-session");

const selectedTests = Object.freeze([
  "testStartupDoesNotOpenKeyboardOrShowAuthenticatedState",
  "testStartupProgressStopsOnCancelAndCertificateFailure",
  "testLoginSettingsAreSeparateAndPreserveDraftsOnCancel",
  "testLoginSettingsSaveAndRotateWithoutOpeningKeyboard",
  "testRotationPreservesConfigurationAndInvalidAddressShowsInlineError",
  "testChatHeaderAndMessageMenuDoNotOverlapAcrossRotation",
  "testMainMenuRemainsSeparateFromConversationMenu",
  "testMessageMenuEditForwardAndBothDeletionOptions",
  "testAttachmentUploadOnlyStagesLinkUntilExplicitSend",
  "testConnectionLossRecoversWithoutAnotherPasswordPrompt",
  "testGroupDiscoveryManagementAndSessionSearch",
  "testExistingGroupJoinSendRotationAndLeave",
  "testEnglishStartupDoesNotTranslateUserDataOrRequestPermissions",
  "testAccountSettingsSaveWithoutChangingIdentity",
  "testNativeLoginAndDisconnectPreserveStateAcrossRotation"
]);

function testsForScope(scope = "regression") {
  if (scope === "regression") return selectedTests;
  if (scope === "startup") return ["testStartupDoesNotOpenKeyboardOrShowAuthenticatedState",
    "testStartupProgressStopsOnCancelAndCertificateFailure", "testEnglishStartupDoesNotTranslateUserDataOrRequestPermissions"];
  if (scope === "menus") return ["testChatHeaderAndMessageMenuDoNotOverlapAcrossRotation", "testMainMenuRemainsSeparateFromConversationMenu"];
  if (scope === "groups") return selectedTests.filter(name => name.includes("Group"));
  if (scope === "tc") return ["testWebStyleCallControlsAndRttPanesRemainReachableAcrossRotation", "testPeerCameraOnOrUnknownDoesNotEnterTextOnlyLayout"];
  throw new Error("Unsupported native UI scope");
}

function run() {
  if (process.platform !== "darwin") throw new Error("Native UI checks require macOS/Xcode");
  const scope = process.env.TELETYPTEL_NATIVE_UI_SCOPE || "regression";
  const tests = testsForScope(scope);
  const families = simulatorFamilies(process.env.TELETYPTEL_NATIVE_TEST_FAMILY);
  const root = path.resolve(__dirname, "..");
  const directory = prepare("ios-native-check-" + Date.now());
  const reports = path.join(directory, "reports");
  fs.mkdirSync(reports);
  const result = { unsigned: true, uploaded: false, physicalDeviceTested: false,
    scope: "focused simulator UI regression; not a full unit, media or device SDK run",
    uiScope: scope, selectedTests: tests, uiTests: [] };
  const logged = (name, command, args, timeout) => executeLogged(command, args, {
    root, reports, name, timeout: timeout ?? (["menus", "startup"].includes(scope) && name.endsWith("-build") ? 1200000 : undefined)
  });
  try {
    const inventory = JSON.parse(logged("simulator-inventory", "xcrun", ["simctl", "list", "devices", "available", "--json"]));
    const common = ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative",
      "-derivedDataPath", path.join(directory, "DerivedData"), "CODE_SIGNING_ALLOWED=NO"];
    const failures = [];
    for (const family of families) {
      const resultBundle = path.join(reports, family + ".xcresult");
      let passed = false;
      let device;
      try {
        device = simulator.prepare({ inventory, family, reports, prefix: family + "-simulator", logged });
        runSimulatorChecks({ common, family, deviceID: device.udid, resultBundle, tests, logged,
          destination: "platform=iOS Simulator,arch=" + (process.arch === "arm64" ? "arm64" : "x86_64") + ",id=" + device.udid });
        passed = true;
      } catch (error) { failures.push(family + ": " + error.message); }
      finally { collectTestResults(resultBundle, { root, reports, family }); }
      result.uiTests.push({ family, name: device?.name ?? family, freshSimulator: device?.fresh === true, passed });
    }
    if (failures.length) throw new Error(failures.join("\n"));
  } catch (error) {
    fs.writeFileSync(path.join(reports, "failure.txt"), String(error.message));
    throw error;
  } finally {
    fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(result, null, 2));
    console.log("Focused native UI report: " + reports);
  }
}

if (require.main === module) run();
module.exports = { run, selectedTests, testsForScope };
