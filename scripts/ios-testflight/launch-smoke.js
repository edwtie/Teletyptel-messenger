const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { output } = require("./prepare");

async function launchSmoke({ run, logged, config, reports }) {
  const derived = path.join(output, "SimulatorDerivedData");
  logged("xcodebuild", ["-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Release",
    "-sdk", "iphonesimulator", "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", derived,
    "CODE_SIGNING_ALLOWED=NO", "build"], "simulator-build.log");
  const app = path.join(derived, "Build/Products/Release-iphonesimulator/App.app");
  const configurationFile = path.join(app, "capacitor.config.json");
  const configuration = JSON.parse(fs.readFileSync(configurationFile, "utf8"));
  if (configuration.server.url) throw new Error("Simulator must launch the bundled interface, not a remote page");
  run("/usr/libexec/PlistBuddy", ["-c", "Set :TeleTypTelServerOrigin https://127.0.0.1:1", path.join(app, "Info.plist")]);
  run("/usr/libexec/PlistBuddy", ["-c", "Set :TeleTypTelServerHost 127.0.0.1", path.join(app, "Info.plist")]);
  fs.writeFileSync(path.join(app, "public/connection.js"), 'window.teletyptelServer = "https://127.0.0.1:1/chat.html";\n');
  const startupFile = path.join(app, "public", configuration.server.appStartPath.replace(/^\/+/, ""));
  const startupContent = fs.readFileSync(startupFile);
  const runtimes = JSON.parse(run("xcrun", ["simctl", "list", "runtimes", "--json"])).runtimes
    .filter(runtime => runtime.isAvailable && runtime.identifier.includes(".iOS-"))
    .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }));
  const inventory = JSON.parse(run("xcrun", ["simctl", "list", "devices", "available", "--json"])).devices;
  const runtime = runtimes.find(entry => inventory[entry.identifier]?.some(device => device.name.startsWith("iPhone") && device.isAvailable));
  if (!runtime) throw new Error("No available iPhone Simulator for startup regression");
  const device = inventory[runtime.identifier].find(entry => entry.name.startsWith("iPhone") && entry.isAvailable);
  const summary = { device: device.name, runtime: runtime.name, configuration: "Release", network: "unreachable loopback only", missingFileExitReproduced: false, successfulLaunches: 0, passed: false };
  const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  function launch() {
    const response = run("xcrun", ["simctl", "launch", "--terminate-running-process", device.udid, config.bundleId]);
    const match = response.match(/:\s*(\d+)\s*$/m);
    if (!match) throw new Error("Simulator did not return an app process ID");
    return match[1];
  }
  function isRunning(processId) {
    const status = spawnSync("/bin/ps", ["-p", processId, "-o", "comm="], { encoding: "utf8", timeout: 10000 });
    return status.status === 0 && /App\.app\/App/.test(status.stdout);
  }
  try {
    if (device.state !== "Booted") run("xcrun", ["simctl", "boot", device.udid]);
    run("xcrun", ["simctl", "bootstatus", device.udid, "-b"], { timeout: 240000 });
    fs.unlinkSync(startupFile);
    run("xcrun", ["simctl", "install", device.udid, app]);
    const brokenProcess = launch();
    await wait(12000);
    if (isRunning(brokenProcess)) throw new Error("Missing-file regression did not reproduce; investigate before upload");
    summary.missingFileExitReproduced = true;
    fs.writeFileSync(startupFile, startupContent);
    run("xcrun", ["simctl", "install", device.udid, app]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const fixedProcess = launch();
      for (let check = 0; check < 6; check++) {
        await wait(5000);
        if (!isRunning(fixedProcess)) throw new Error("Fixed Release app exited during startup regression");
      }
      summary.successfulLaunches++;
    }
    run("xcrun", ["simctl", "io", device.udid, "screenshot", path.join(reports, "startup-offline.png")]);
    summary.passed = true;
  } finally {
    fs.writeFileSync(startupFile, startupContent);
    fs.writeFileSync(path.join(reports, "startup-smoke.json"), JSON.stringify(summary, null, 2));
    try { run("xcrun", ["simctl", "shutdown", device.udid]); } catch {}
  }
}

module.exports = { launchSmoke };
