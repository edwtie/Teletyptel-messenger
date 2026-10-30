const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { project, output } = require("./prepare");

const resultsDirectory = path.join(output, "results");
const bundleId = "com.tiedragon.teletyptel.simulator";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: project, encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 600000, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " " + args.join(" ") + " failed:\n" + result.stdout + result.stderr);
  return result.stdout || "";
}

async function simulate() {
  if (process.platform !== "darwin") throw new Error("Actual iOS Simulator execution requires the macOS workflow. Use preview.js only for the browser preflight.");
  fs.mkdirSync(resultsDirectory, { recursive: true });
  fs.copyFileSync(path.join(output, "source-manifest.json"), path.join(resultsDirectory, "source-manifest.json"));
  fs.writeFileSync(path.join(resultsDirectory, "xcode-version.txt"), run("xcodebuild", ["-version"]));
  run(process.execPath, [path.join(__dirname, "node_modules/@capacitor/cli/bin/capacitor"), "sync", "ios"], { stdio: "inherit" });
  const derived = path.join(output, "DerivedData");
  const buildArgs = ["-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Debug", "-sdk", "iphonesimulator",
    "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", derived, "CODE_SIGNING_ALLOWED=NO", "PRODUCT_BUNDLE_IDENTIFIER=" + bundleId, "build"];
  const log = fs.openSync(path.join(resultsDirectory, "xcode-build.log"), "w");
  try { run("xcodebuild", buildArgs, { stdio: ["ignore", log, log], timeout: 900000 }); }
  finally { fs.closeSync(log); }
  const app = path.join(derived, "Build/Products/Debug-iphonesimulator/App.app");
  if (!fs.existsSync(app)) throw new Error("Simulator .app was not produced");
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, path.join(resultsDirectory, "TeleTypTel-iOS-simulator.zip")]);
  const runtimes = JSON.parse(run("xcrun", ["simctl", "list", "runtimes", "--json"])).runtimes
    .filter((runtime) => runtime.isAvailable && runtime.identifier.includes(".iOS-"))
    .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }));
  const inventory = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "--json"])).devices;
  const runtime = runtimes.find((entry) => inventory[entry.identifier]?.filter((device) => device.name.startsWith("iPhone")).length >= 2);
  if (!runtime) throw new Error("No installed iOS runtime with two iPhone simulators");
  const phones = inventory[runtime.identifier].filter((device) => device.name.startsWith("iPhone") && device.isAvailable);
  const small = phones.find((device) => device.name.includes("SE")) || phones.find((device) => /^iPhone \d+e?$/.test(device.name)) || phones[0];
  const large = phones.find((device) => device.name.includes("Pro Max")) || phones.find((device) => device.udid !== small.udid);
  const summary = [];
  for (const [label, device] of [["small", small], ["large", large]]) {
    console.log("Testing " + device.name + " on " + runtime.name);
    try {
      if (device.state !== "Booted") run("xcrun", ["simctl", "boot", device.udid]);
      run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { timeout: 240000 });
      run("xcrun", ["simctl", "status_bar", device.udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100"]);
      run("xcrun", ["simctl", "install", device.udid, app]);
      const container = run("xcrun", ["simctl", "get_app_container", device.udid, bundleId, "data"]).trim();
      const resultFile = path.join(container, "Documents/ios-smoke-result.json");
      if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
      run("xcrun", ["simctl", "launch", "--terminate-running-process", device.udid, bundleId]);
      const deadline = Date.now() + 90000;
      while (!fs.existsSync(resultFile) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 1000));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run("xcrun", ["simctl", "io", device.udid, "screenshot", path.join(resultsDirectory, "iphone-" + label + ".png")]);
      if (!fs.existsSync(resultFile)) throw new Error("Native test result not received before timeout");
      const report = JSON.parse(fs.readFileSync(resultFile, "utf8"));
      report.device = device.name;
      report.runtime = runtime.name;
      fs.writeFileSync(path.join(resultsDirectory, "iphone-" + label + ".json"), JSON.stringify(report, null, 2));
      summary.push({ device: device.name, runtime: runtime.name, passed: report.passed === true && report.nativeSimulator === true && report.platform === "ios", results: report.results });
    } catch (error) {
      summary.push({ device: device.name, runtime: runtime.name, passed: false, error: error.message });
      try { run("xcrun", ["simctl", "io", device.udid, "screenshot", path.join(resultsDirectory, "iphone-" + label + "-failure.png")]); } catch {}
    } finally {
      try { run("xcrun", ["simctl", "shutdown", device.udid]); } catch {}
    }
  }
  fs.writeFileSync(path.join(resultsDirectory, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.length !== 2 || summary.some((result) => !result.passed)) throw new Error("One or more native simulator checks failed");
}

simulate().catch((error) => { console.error(error); process.exitCode = 1; });
