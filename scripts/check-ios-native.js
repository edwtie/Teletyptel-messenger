const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { prepare } = require("./prepare-ios-native");

function run() {
  if (process.platform !== "darwin") throw new Error("Native iOS compilation and UI tests require macOS/Xcode");
  const root = path.resolve(__dirname, "..");
  const directory = prepare("ios-native-check-" + Date.now());
  const reports = path.join(directory, "reports");
  fs.mkdirSync(reports);
  const report = { unsigned: true, uploaded: false, swiftUnitTests: false, deviceCompiled: false, uiTests: [] };
  const execute = (command, args, timeout = 600000) => execFileSync(command, args, {
    cwd: root, timeout, maxBuffer: 40 * 1024 * 1024, encoding: "utf8", stdio: "pipe"
  });
  try {
    fs.writeFileSync(path.join(reports, "swift-tests.txt"), execute("swift", ["test", "--package-path",
      path.join(root, "mobile/ios-native"), "--scratch-path", path.join(directory, "SwiftBuild")]));
    report.swiftUnitTests = true;
    const common = ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative",
      "-derivedDataPath", path.join(directory, "DerivedData"), "CODE_SIGNING_ALLOWED=NO"];
    fs.writeFileSync(path.join(reports, "device-build.txt"), execute("xcodebuild", [...common,
      "-destination", "generic/platform=iOS", "-configuration", "Release", "build"]));
    report.deviceCompiled = true;
    const inventory = JSON.parse(execute("xcrun", ["simctl", "list", "devices", "available", "--json"]));
    const devices = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([, values]) => values).filter(device => device.isAvailable);
    for (const family of ["iPhone", "iPad"]) {
      const device = devices.find(device => device.name.startsWith(family));
      if (!device) throw new Error("Missing " + family + " simulator; do not silently skip device coverage");
      const resultBundle = path.join(reports, family + ".xcresult");
      fs.writeFileSync(path.join(reports, family + "-tests.txt"), execute("xcodebuild", [...common,
        "-destination", "platform=iOS Simulator,id=" + device.udid, "-configuration", "Debug",
        "-parallel-testing-enabled", "NO", "-resultBundlePath", resultBundle, "test"], 900000));
      report.uiTests.push({ family, name: device.name, passed: true, orientations: ["portrait", "landscapeLeft"] });
    }
  } catch (error) {
    fs.writeFileSync(path.join(reports, "failure.txt"), String(error.stderr || error.message).slice(-32000));
    throw error;
  } finally {
    fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(report, null, 2));
    console.log("Native preview report: " + reports);
  }
}

if (require.main === module) run();
module.exports = { run };
