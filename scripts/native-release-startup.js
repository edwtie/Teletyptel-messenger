"use strict";
const path = require("node:path");

function check({ directory, reports, family, logged, collect }) {
  if (!["iPhone", "iPad"].includes(family)) throw new Error("Select one native release simulator family");
  const inventory = JSON.parse(logged("release-simulator-inventory", "xcrun", ["simctl", "list", "devices", "available", "--json"]));
  const devices = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes("iOS"))
    .flatMap(([, values]) => values).filter(device => device.isAvailable && device.name.startsWith(family));
  const device = devices[0];
  if (!device || !/^[a-f0-9-]{36}$/i.test(device.udid)) throw new Error("Missing release startup simulator");
  const common = ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative",
    "-derivedDataPath", path.join(directory, "DerivedData"), "-configuration", "Release", "CODE_SIGNING_ALLOWED=NO",
    "-destination", "platform=iOS Simulator,id=" + device.udid, "ONLY_ACTIVE_ARCH=YES", "-parallel-testing-enabled", "NO"];
  const bundle = path.join(directory, "release-startup.xcresult");
  try {
    logged("release-startup-build", "xcodebuild", [...common, "build-for-testing"]);
    logged("release-startup-boot", "xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
    logged("release-startup-test", "xcodebuild", [...common,
      "-only-testing:NativeStartupUITests/NativeStartupUITests/testStartupDoesNotOpenKeyboardOrShowAuthenticatedState",
      "-resultBundlePath", bundle, "test-without-building"]);
    return { family, configuration: "Release", startupUIVisible: true, physicalDeviceTested: false };
  } finally { collect(bundle, { reports, family }); }
}

module.exports = { check };
