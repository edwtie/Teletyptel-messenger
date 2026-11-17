"use strict";
const path = require("node:path");
const simulator = require("./native-simulator-session");

function check({ directory, reports, family, logged, collect }) {
  if (!["iPhone", "iPad"].includes(family)) throw new Error("Select one native release simulator family");
  const inventory = JSON.parse(logged("release-simulator-inventory", "xcrun", ["simctl", "list", "devices", "available", "--json"]));
  const bundle = path.join(directory, "release-startup.xcresult");
  try {
    const device = simulator.prepare({ inventory, family, reports, prefix: "release-startup", logged });
    const common = ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"), "-scheme", "TeleTypTelNative",
      "-derivedDataPath", path.join(directory, "DerivedData"), "-configuration", "Release", "CODE_SIGNING_ALLOWED=NO",
      "-destination", "platform=iOS Simulator,id=" + device.udid, "ONLY_ACTIVE_ARCH=YES", "-parallel-testing-enabled", "NO"];
    console.log("Building Release startup test for " + family + ".");
    logged("release-startup-build", "xcodebuild", [...common, "build-for-testing"]);
    console.log("Running Release startup UI assertion for " + family + ".");
    logged("release-startup-test", "xcodebuild", [...common,
      "-only-testing:NativeStartupUITests/NativeStartupUITests/testStartupDoesNotOpenKeyboardOrShowAuthenticatedState",
      "-resultBundlePath", bundle, "test-without-building"]);
    return { family, configuration: "Release", freshSimulator: device.fresh, startupUIVisible: true, physicalDeviceTested: false };
  } finally { collect(bundle, { reports, family }); }
}

module.exports = { check };
