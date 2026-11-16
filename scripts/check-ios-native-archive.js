"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { prepare } = require("./prepare-ios-native");
const { executeLogged } = require("./check-ios-native");
const archiveConfig = require("./native-archive-config");

function run() {
  if (process.platform !== "darwin") throw new Error("Unsigned native archiving requires macOS/Xcode");
  if (!require("./native-call-push-config").enabled(process.env.TELETYPTEL_NATIVE_PUSH_TEST)) throw new Error("Explicit native push-test staging is required");
  const root = path.resolve(__dirname, "..");
  const expected = { version: "1.0", buildNumber: "17.0" };
  const directory = prepare("ios-native-archive-" + Date.now(), {
    pushTest: { bundleId: "com.tiedragon.teletyptel", environment: "production", testOnly: true }, archive: expected
  });
  const reports = path.join(directory, "reports"); fs.mkdirSync(reports);
  const logged = (name, command, args) => executeLogged(command, args, { root, reports, name, timeout: 1200000 });
  const readPlist = (name, file) => JSON.parse(logged(name, "plutil", ["-convert", "json", "-o", "-", file]));
  const archive = path.join(directory, "TeleTypTelNative.xcarchive");
  let result = { unsigned: true, uploaded: false, archiveValidated: false, releaseReady: false };
  try {
    const icon = path.join(directory, "Assets.xcassets/AppIcon.appiconset/icon.png");
    logged("opaque-icon", "swift", [path.join(root, "scripts/ios-testflight/opaque-icon.swift"), icon]);
    if (!/hasAlpha: no/.test(logged("icon-properties", "sips", ["-g", "hasAlpha", icon]))) throw new Error("App icon must be opaque");
    logged("native-archive", "xcodebuild", ["-project", path.join(directory, "TeleTypTelNative.xcodeproj"),
      "-scheme", "TeleTypTelNative", "-configuration", "Release", "-destination", "generic/platform=iOS",
      "-derivedDataPath", path.join(directory, "DerivedData"), "-archivePath", archive, "CODE_SIGNING_ALLOWED=NO", "archive"]);
    const appPath = path.join(archive, "Products/Applications/TeleTypTelNative.app");
    if (!fs.statSync(path.join(appPath, "TeleTypTelNative")).isFile() || !fs.statSync(path.join(appPath, "Assets.car")).isFile()) throw new Error("Missing archived executable or assets");
    result = archiveConfig.inspect({ expected, app: readPlist("app-metadata", path.join(appPath, "Info.plist")),
      archive: readPlist("archive-metadata", path.join(archive, "Info.plist")) });
    console.log("Unsigned native archive verified; no TestFlight upload or live push.");
  } finally { fs.writeFileSync(path.join(reports, "result.json"), JSON.stringify(result, null, 2)); }
}

if (require.main === module) run();
module.exports = { run };
