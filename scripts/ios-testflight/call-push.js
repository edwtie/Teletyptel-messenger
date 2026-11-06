const fs = require("node:fs");
const path = require("node:path");

function previewEnabled(value) {
  if (value === undefined || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw new Error("IOS_CALL_PUSH_PREVIEW must be 0 or 1");
}

function configureDelegate(delegate) {
  const marker = "// Override point for customization after application launch.";
  if (delegate.split(marker).length !== 2) throw new Error("Review changed native launch hook");
  return delegate.replace(marker, "MessengerVoipCalls.shared.start()");
}

function plistEntries(enabled) {
  return "<key>TeleTypTelCallPushEnabled</key>" + (enabled ? "<true/>" : "<false/>") + "\n"
    + (enabled ? "<key>UIBackgroundModes</key><array><string>voip</string><string>audio</string></array>\n" : "");
}

function configureProject(project, enabled) {
  if (!enabled) return;
  const file = path.join(project, "ios/App/App.xcodeproj/project.pbxproj");
  let source = fs.readFileSync(file, "utf8");
  const marker = "INFOPLIST_FILE = App/Info.plist;";
  if (source.includes("CODE_SIGN_ENTITLEMENTS") || !source.includes(marker)) {
    throw new Error("Review existing app entitlements before enabling call push");
  }
  source = source.replaceAll(marker, marker + "\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/CallPush.entitlements;");
  fs.writeFileSync(file, source);
  fs.writeFileSync(path.join(project, "ios/App/App/CallPush.entitlements"),
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + '<plist version="1.0"><dict><key>aps-environment</key><string>production</string></dict></plist>\n');
}

function validateProfile(profile, enabled) {
  if (enabled && profile?.Entitlements?.["aps-environment"] !== "production") {
    throw new Error("Call push requires a regenerated production APNs provisioning profile");
  }
}

function validateRelease(plist, upload) {
  if (upload && plist.TeleTypTelCallPushEnabled === true) {
    throw new Error("VoIP preview is not releasable: authenticated wakeup, session recovery and native media acceptance are not yet validated");
  }
}

module.exports = { previewEnabled, configureDelegate, plistEntries, configureProject, validateProfile, validateRelease };
