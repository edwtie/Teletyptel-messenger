const fs = require("node:fs");
const path = require("node:path");
const { prepare } = require("./prepare-ios-native");
const { executeLogged, collectTestResults, runSimulatorChecks, simulatorFamilies } = require("./check-ios-native");

const selectedTests = Object.freeze([
  "testAttachmentUploadOnlyStagesLinkUntilExplicitSend",
  "testConnectionLossRecoversWithoutAnotherPasswordPrompt",
  "testGroupDiscoveryManagementAndSessionSearch",
  "testExistingGroupJoinSendRotationAndLeave",
  "testEnglishStartupDoesNotTranslateUserDataOrRequestPermissions",
  "testAccountSettingsSaveWithoutChangingIdentity",
  "testNativeLoginAndDisconnectPreserveStateAcrossRotation"
]);

function run() {
  if (process.platform !== "darwin") throw new Error("Native UI checks require macOS/Xcode");
  const families = simulatorFamilies(process.env.TELETYPTEL_NATIVE_TEST_FAMILY);
  const root = path.resolve(__dirname, "..");
  const directory = prepare("ios-native-check-" + Date.now());
  const reports = path.join(directory, "reports");
  fs.mkdirSync(reports);
  const result = { unsigned: true, uploaded: false, physicalDeviceTested: false,
    scope: "focused simulator UI regression; not a full unit, media or device SDK run",
    selectedTests, uiTests: [] };
  const logged = (name, command, args, timeout) => executeLogged(command, args, { root, reports, name, timeout });
  try {
    const inventory = JSON.parse(logged("simulator-inventory", "xcrun", ["simctl", "list", "devices", "available", "--json"]));
    const devices = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([, values]) => values).filter(device => device.isAvailable);
    const common = ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative",
      "-derivedDataPath", path.join(directory, "DerivedData"), "CODE_SIGNING_ALLOWED=NO"];
    const failures = [];
    for (const family of families) {
      const device = devices.find(device => device.name.startsWith(family));
      if (!device) throw new Error("Missing " + family + " simulator; no silent coverage skip");
      const resultBundle = path.join(reports, family + ".xcresult");
      let passed = false;
      try {
        runSimulatorChecks({ common, family, deviceID: device.udid, resultBundle, tests: selectedTests, logged,
          destination: "platform=iOS Simulator,arch=" + (process.arch === "arm64" ? "arm64" : "x86_64") + ",id=" + device.udid });
        passed = true;
      } catch (error) { failures.push(family + ": " + error.message); }
      finally { collectTestResults(resultBundle, { root, reports, family }); }
      result.uiTests.push({ family, name: device.name, passed });
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
module.exports = { run, selectedTests };
