const fs = require("node:fs");
const path = require("node:path");

function catalog(root) {
  const parse = file => Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
    .filter(line => line && !line.startsWith("#") && line.includes("="))
    .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  const dutch = parse(path.join(root, "php/public/lang/ned.lng"));
  const english = parse(path.join(root, "php/public/lang/eng.lng"));
  const entries = Object.fromEntries(Object.entries(dutch).filter(([key]) => english[key]).map(([key, value]) => [value, english[key]]));
  Object.assign(entries, JSON.parse(fs.readFileSync(path.join(root, "mobile/ios-native/Localization/en.json"), "utf8")));
  const keys = new Set(Object.keys(entries));
  const missing = new Set();
  const directory = path.join(root, "mobile/ios-native/App");
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith(".swift"))) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");
    for (const match of source.matchAll(/(?:Text|Button|Label|Section|Toggle|Picker|TextField|SecureField|ProgressView|navigationTitle|accessibilityLabel|accessibilityHint|alert|confirmationDialog|menuTile|callButton)\("((?:[^"\\]|\\.)*)"/g)) {
      if (match[1].includes("\\(")) continue;
      const key = JSON.parse('"' + match[1] + '"');
      keys.add(key);
      if (!Object.hasOwn(entries, key)) missing.add(key);
    }
  }
  if (missing.size) throw new Error("Missing native English UI translations: " + [...missing].join(" | "));
  const quoted = value => JSON.stringify(value).replaceAll("\u2028", "\\U2028").replaceAll("\u2029", "\\U2029");
  return Object.fromEntries(["nl", "en"].map(language => [language, [...keys].sort()
    .map(key => `${quoted(key)} = ${quoted(language === "nl" ? key : entries[key])};`).join("\n") + "\n"]));
}

function permissions(root) {
  const source = fs.readFileSync(path.join(root, "mobile/ios-native/App/Info.plist"), "utf8");
  const english = {
    NSLocalNetworkUsageDescription: "Only at your request does TeleTypTel check whether your specified local chat server is reachable.",
    NSMicrophoneUsageDescription: "Only at your request does TeleTypTel use the microphone for a call or voice/video recording. Recordings are uploaded only after your confirmation.",
    NSCameraUsageDescription: "Only at your request does TeleTypTel use the camera for a call, photo or video recording. Recordings are uploaded only after your confirmation.",
    NSLocationWhenInUseUsageDescription: "Only at your request does TeleTypTel fetch a one-time location. You review it before adding it to a message. There is no background tracking.",
    NSFaceIDUsageDescription: "Only with your consent does Face ID unlock your saved sign-in on this device. TeleTypTel receives no facial data."
  };
  const dutch = Object.fromEntries([...source.matchAll(/<key>(NS\w+UsageDescription)<\/key><string>([^<]+)<\/string>/g)].map(match => [match[1], match[2]]));
  for (const key of Object.keys(dutch)) if (!english[key]) throw new Error("Missing English permission: " + key);
  return Object.fromEntries([["nl", dutch], ["en", english]].map(([language, entries]) => [language,
    Object.entries(entries).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)};`).join("\n") + "\n"]));
}

module.exports = { catalog, permissions };
