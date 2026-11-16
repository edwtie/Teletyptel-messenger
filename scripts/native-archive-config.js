"use strict";

function validate(config, pushTest) {
  if (config === null || config === undefined) return null;
  if (!pushTest || typeof config !== "object" || Array.isArray(config)
      || Object.keys(config).sort().join(",") !== "buildNumber,version"
      || typeof config.version !== "string" || !/^[1-9][0-9]{0,3}(?:\.[0-9]{1,2}){1,2}$/.test(config.version)
      || typeof config.buildNumber !== "string" || !/^[1-9][0-9]{0,3}(?:\.[0-9]{1,2}){0,2}$/.test(config.buildNumber)) {
    throw new Error("Use explicit production-APNs staging and bounded app version/build metadata");
  }
  return config;
}

function plist(source, config) {
  if (!config) return source;
  for (const [key, value] of [["CFBundleDisplayName", "TeleTypTel"], ["CFBundleShortVersionString", config.version], ["CFBundleVersion", config.buildNumber]]) {
    const pattern = new RegExp("(<key>" + key + "</key>\\s*<string>)[^<]*(</string>)", "g");
    if ([...source.matchAll(pattern)].length !== 1) throw new Error("Review changed native archive metadata");
    source = source.replace(pattern, (_, prefix, suffix) => prefix + value + suffix);
  }
  return source;
}

function inspect({ app, archive, expected }) {
  if (app.CFBundleIdentifier !== "com.tiedragon.teletyptel" || app.CFBundlePackageType !== "APPL"
      || app.CFBundleShortVersionString !== expected.version || app.CFBundleVersion !== expected.buildNumber
      || (app.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName ?? app.CFBundleIconName) !== "AppIcon"
      || app.CFBundleSupportedPlatforms?.join(",") !== "iPhoneOS"
      || app.UIDeviceFamily?.join(",") !== "1,2"
      || app.TeleTypTelNativeCallPushEnabled !== true || app.TeleTypTelNativeCallRecoveryLabEnabled !== true
      || app.TeleTypTelNativePushTestOnly !== true || !app.UIBackgroundModes?.includes("voip")
      || !app.UIBackgroundModes?.includes("audio")
      || archive.ApplicationProperties?.ApplicationPath !== "Applications/TeleTypTelNative.app"
      || archive.ApplicationProperties?.CFBundleIdentifier !== app.CFBundleIdentifier) {
    throw new Error("Archived native app does not match the requested internal push-test target");
  }
  return { unsigned: true, uploaded: false, archiveValidated: true, releaseReady: false,
    version: expected.version, buildNumber: expected.buildNumber, bundleId: app.CFBundleIdentifier,
    remaining: ["review app and SDK privacy manifests", "review encryption export declaration",
      "validate production provisioning and signing", "configure production social-login clients",
      "deploy background-call server chain", "physical-device PushKit/CallKit/media acceptance"] };
}

function readProperties(file, execute) {
  const script = ["import sys,plistlib,json", "with open(sys.argv[1], 'rb') as stream:",
    "    properties = plistlib.load(stream).get('ApplicationProperties')",
    "if not isinstance(properties, dict): raise ValueError('Missing application properties')",
    "values = {key:properties.get(key) for key in ['ApplicationPath','CFBundleIdentifier']}",
    "if not all(isinstance(value, str) for value in values.values()): raise ValueError('Invalid application properties')",
    "print(json.dumps(values))"].join("\n");
  return JSON.parse(execute("python3", ["-c", script, file]));
}

module.exports = { validate, plist, inspect, readProperties };
