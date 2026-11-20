const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { prepare } = require("./prepare-ios-native");
const { checkMedia } = require("./check-ios-native-media");

function executeLogged(command, args, { root, reports, name, timeout = 600000, execute = execFileSync }) {
  console.log(`Starting ${name} (limit: ${timeout / 60000} minutes)`);
  try {
    const output = execute(command, args, {
      cwd: root, timeout, maxBuffer: 40 * 1024 * 1024, encoding: "utf8", stdio: "pipe"
    });
    fs.writeFileSync(path.join(reports, name + ".txt"), output);
    return output;
  } catch (error) {
    for (const line of String(error.stdout || "").split(/\r?\n/).filter(line => /: error: .* : |^Test Case .* failed/.test(line)).slice(-8)) {
      console.error(line.slice(0, 600));
    }
    fs.writeFileSync(path.join(reports, name + ".txt"), String(error.stdout || ""));
    fs.writeFileSync(path.join(reports, name + "-stderr.txt"), String(error.stderr || ""));
    fs.writeFileSync(path.join(reports, name + "-failure.json"), JSON.stringify({
      command, code: error.code ?? null, status: error.status ?? null,
      signal: error.signal ?? null, message: error.message
    }, null, 2));
    throw error;
  }
}

function collectTestResults(bundle, { root, reports, family, execute = execFileSync }) {
  if (!fs.existsSync(bundle)) return;
  for (const section of ["summary", "tests"]) {
    try {
      const output = execute("xcrun", ["xcresulttool", "get", "test-results", section, "--path", bundle], {
        cwd: root, timeout: 60000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8", stdio: "pipe"
      });
      fs.writeFileSync(path.join(reports, family + "-" + section + ".json"), JSON.stringify(JSON.parse(output), null, 2));
    } catch (error) {
      fs.writeFileSync(path.join(reports, family + "-" + section + "-export-error.txt"),
        String(error.message) + "\n" + String(error.stderr || ""));
    }
  }
  try {
    execute("xcrun", ["xcresulttool", "export", "attachments", "--path", bundle,
      "--output-path", path.join(reports, family + "-screenshots")], {
      cwd: root, timeout: 60000, maxBuffer: 8 * 1024 * 1024, encoding: "utf8", stdio: "pipe"
    });
  } catch (error) {
    fs.writeFileSync(path.join(reports, family + "-screenshots-export-error.txt"), String(error.message));
  }
}

function simulatorFamilies(family) {
  const supported = ["iPhone", "iPad"];
  if (family === undefined) return supported;
  if (!supported.includes(family)) throw new Error("Unsupported native simulator family");
  return [family];
}

function runSimulatorChecks({ common, family, destination, deviceID, resultBundle, smokeResultBundle, tests, logged }) {
  if (tests !== undefined && (!Array.isArray(tests) || tests.length === 0 ||
      tests.some(name => typeof name !== "string" || !/^test[A-Za-z0-9]+$/.test(name)))) {
    throw new Error("Explicit native UI selection must contain test method names");
  }
  const simulatorArguments = [...common, "-destination", destination,
    "-configuration", "Debug", "ONLY_ACTIVE_ARCH=YES", "-parallel-testing-enabled", "NO"];
  const buildOutput = logged(family + "-build", "xcodebuild", [...simulatorArguments, "build-for-testing"]);
  require("./native-web-palette").assertCompiledPalette(buildOutput);
  logged(family + "-boot", "xcrun", ["simctl", "bootstatus", deviceID, "-b"]);
  if (smokeResultBundle) {
    logged(family + "-cloud-history-tests", "xcodebuild", [...simulatorArguments,
      "-only-testing:NativeStartupUITests/NativeStartupUITests/testCloudHistoryCatalogAndOlderPagesDoNotAuthorizeAnUnknownContact",
      "-resultBundlePath", smokeResultBundle, "test-without-building"], 600000);
  }
  logged(family + "-tests", "xcodebuild", [...simulatorArguments,
    ...(tests || []).map(name => "-only-testing:NativeStartupUITests/NativeStartupUITests/" + name),
    "-resultBundlePath", resultBundle, "test-without-building"], tests ? 1200000 : 2700000);
}

function run() {
  if (process.platform !== "darwin") throw new Error("Native iOS compilation and UI tests require macOS/Xcode");
  const families = simulatorFamilies(process.env.TELETYPTEL_NATIVE_TEST_FAMILY);
  const root = path.resolve(__dirname, "..");
  const directory = prepare("ios-native-check-" + Date.now());
  const reports = path.join(directory, "reports");
  fs.mkdirSync(reports);
  const report = { unsigned: true, uploaded: false, swiftUnitTests: false, deviceCompiled: false, releaseFixtureExcluded: false, uiTests: [] };
  const execute = (command, args, timeout = 600000) => execFileSync(command, args, {
    cwd: root, timeout, maxBuffer: 40 * 1024 * 1024, encoding: "utf8", stdio: "pipe"
  });
  const logged = (name, command, args, timeout) => executeLogged(command, args, { root, reports, name, timeout });
  try {
    logged("swift-tests", "swift", ["test", "--package-path",
      path.join(root, "mobile/ios-native"), "--scratch-path", path.join(directory, "SwiftBuild")]);
    report.swiftUnitTests = true;
    const common = ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative",
      "-derivedDataPath", path.join(directory, "DerivedData"), "CODE_SIGNING_ALLOWED=NO"];
    logged("device-build", "xcodebuild", [...common,
      "-destination", "generic/platform=iOS", "-configuration", "Release", "build"]);
    report.deviceCompiled = true;
    const executable = fs.readFileSync(path.join(directory, "DerivedData/Build/Products/Release-iphoneos/TeleTypTelNative.app/TeleTypTelNative"));
    for (const marker of ["TELETYPTEL_NATIVE_UI_FIXTURE", "TELETYPTEL_NATIVE_CLOUD_UI_FIXTURE", "TELETYPTEL_NATIVE_CALL_KEYPAD_FIXTURE", "fixture-password"]) {
      if (executable.includes(Buffer.from(marker))) throw new Error("Test-only login fixture found in Release executable");
    }
    report.releaseFixtureExcluded = true;
    report.media = checkMedia({ root, directory, reports, logged });
    const inventory = JSON.parse(execute("xcrun", ["simctl", "list", "devices", "available", "--json"]));
    const devices = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes("iOS"))
      .flatMap(([, values]) => values).filter(device => device.isAvailable);
    const uiFailures = [];
    for (const family of families) {
      const device = devices.find(device => device.name.startsWith(family));
      if (!device) throw new Error("Missing " + family + " simulator; do not silently skip device coverage");
      const resultBundle = path.join(reports, family + ".xcresult");
      const smokeResultBundle = path.join(reports, family + "-cloud-history.xcresult");
      let passed = false;
      try {
        runSimulatorChecks({ common, family, deviceID: device.udid, resultBundle, smokeResultBundle, logged,
          destination: "platform=iOS Simulator,arch=" + (process.arch === "arm64" ? "arm64" : "x86_64") + ",id=" + device.udid });
        passed = true;
      } catch (error) {
        uiFailures.push(family + ": " + error.message);
      } finally {
        collectTestResults(smokeResultBundle, { root, reports, family: family + "-cloud-history" });
        collectTestResults(resultBundle, { root, reports, family });
      }
      report.uiTests.push({ family, name: device.name, passed, orientations: ["portrait", "landscapeLeft"] });
    }
    if (uiFailures.length) throw new Error(uiFailures.join("\n"));
  } catch (error) {
    fs.writeFileSync(path.join(reports, "failure.txt"), String(error.message) + "\n" + String(error.stderr || "").slice(-32000));
    throw error;
  } finally {
    fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(report, null, 2));
    console.log("Native preview report: " + reports);
  }
}

if (require.main === module) run();
module.exports = { run, executeLogged, collectTestResults, runSimulatorChecks, simulatorFamilies };
