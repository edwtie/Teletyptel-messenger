"use strict";

function enabled(value) {
  if (value === undefined || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw new Error("TELETYPTEL_NATIVE_PUSH_TEST must be 0 or 1");
}

function validate(config) {
  if (config === null || config === undefined) return null;
  if (typeof config !== "object" || Array.isArray(config)
      || Object.keys(config).sort().join(",") !== "bundleId,environment,testOnly"
      || config.bundleId !== "com.tiedragon.teletyptel" || config.environment !== "production" || config.testOnly !== true) {
    throw new Error("Only an explicitly opted-in internal production-APNs test build is supported");
  }
  return config;
}

function plist(source, config) {
  if (!validate(config)) return source;
  const modes = "<key>UIBackgroundModes</key><array><string>audio</string></array>";
  if (source.split(modes).length !== 2 || source.includes("TeleTypTelNativeCallPushEnabled")
      || source.includes("TeleTypTelNativeCallRecoveryLabEnabled") || source.includes("aps-environment")) {
    throw new Error("Review changed native push configuration");
  }
  return source.replace(modes, "<key>UIBackgroundModes</key><array><string>audio</string><string>voip</string></array>\n"
    + "<key>TeleTypTelNativeCallPushEnabled</key><true/>\n"
    + "<key>TeleTypTelNativeCallRecoveryLabEnabled</key><true/>\n"
    + "<key>TeleTypTelNativePushTestOnly</key><true/>");
}

function entitlements(config) {
  validate(config);
  if (!config) throw new Error("Native push is not enabled");
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><dict><key>aps-environment</key><string>production</string></dict></plist>\n';
}

function validateProfile(profile, now = Date.now()) {
  if (profile?.Entitlements?.["aps-environment"] !== "production"
      || profile.Entitlements["application-identifier"] !== "H29RTRBD9D.com.tiedragon.teletyptel"
      || profile.Entitlements["com.apple.developer.team-identifier"] !== "H29RTRBD9D"
      || profile.Entitlements["get-task-allow"] !== false || profile.ProvisionedDevices || profile.ProvisionsAllDevices
      || !profile.TeamIdentifier?.includes("H29RTRBD9D") || !profile.DeveloperCertificates?.length
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(profile.UUID ?? "")
      || !Number.isFinite(Date.parse(profile.ExpirationDate)) || Date.parse(profile.ExpirationDate) <= now) {
    throw new Error("A current production-APNs App Store provisioning profile for TeleTypTel is required");
  }
}

module.exports = { enabled, validate, plist, entitlements, validateProfile };
